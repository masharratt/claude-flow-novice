# Specification: produce/consume edges → topological wave ordering in cfn-loop-task

**Date:** 2026-07-17
**Author:** spec phase (cfn-spec)
**Status:** draft

## Context / subject

Pipeline change to CFN execution infra, not an app feature. Two files:
- `.claude/commands/write-plan.md` — add `Produces` / `Consumes` columns to the Phase 2 Implementation Steps table (`write-plan.md:243`), plus authoring rules.
- `.claude/commands/cfn-loop-task.md` — extend LANE DERIVATION (`cfn-loop-task.md:171-178`) to compute lane-dependency edges from the plan's produce/consume metadata and execute lanes in **topological waves** with a barrier between waves, instead of a single all-lanes-concurrent wave.

**Problem being fixed.** Today lanes are partitioned only by exclusive *file ownership* (`cfn-loop-task.md:175`) and all lanes spawn in one wave (`:178`). File-disjointness is not a dependency graph: if lane A *creates* new file/export `types.ts:Claims` and lane E *imports* it, the two files are disjoint, so they land in different lanes and run concurrently — E's typecheck fails because the symbol does not exist yet. The gate catches it (`:222-226` typecheck red → iterate), but at the cost of a wasted implementation wave. Cross-file produce/consume dependencies surface as gate-failures + retry instead of correct ordering.

**Design decision (why symbol-level edges rolled up to lanes, not a full task DAG).** The parallel unit is the lane, not the step (steps inside a lane already run serially, `:175`). So edges only need lane granularity. Symbols are the cheapest decidable edge key: `write-plan.md:243` already forces each step to name its exact file + typed signature, so `Produces`/`Consumes` are a re-projection of data the plan already carries — DRY, not new analysis. Edge = a step in lane E `Consumes` a string that a step in lane A `Produces`. String equality; zero judgment; grep-able.

**Backward-compatibility floor.** When the columns are absent or empty (older plans, non-megaplan plans), the executor computes zero edges → one wave → today's exact behavior. The feature is a strict improvement gated on the presence of the metadata; it can never make an existing plan slower or wrong.

## 1. Functional Requirements

FR-1 [core]: `write-plan` SHALL emit two columns in the Phase 2 Implementation Steps table — `Produces` (new files/exports this step creates that did not exist before) and `Consumes` (files/exports from OTHER steps this step needs to already exist) — each cell a comma-separated list of identifier strings in the form `<path>` or `<path>:<symbol>`, or the literal `-` when none.

FR-2 [core]: `cfn-loop-task` LANE DERIVATION SHALL compute a directed lane-dependency edge A→E WHEN any step in lane E has a `Consumes` identifier string-equal to a `Produces` identifier of any step in lane A, GIVEN A ≠ E. (runtime signal: the derived edge list logged before spawn)

FR-3 [core]: `cfn-loop-task` SHALL execute lanes in topological **waves**: wave-1 = every lane with no unsatisfied inbound edge; each subsequent wave = lanes whose inbound edges all originate in already-completed waves. It SHALL spawn all lanes of a wave in one message (parallel), barrier-wait for that wave, THEN spawn the next wave. (runtime signal: one "wave N: lanes [...]" log line per wave)

FR-4: The per-wave concurrency cap SHALL be raised from 4 to **8** (a change to `cfn-loop-task.md:174`, named once so a future bump is a single-value edit). WHEN a wave contains >8 ready lanes, the executor SHALL run at most 8 concurrently and carry the remainder into the next wave slot (ready lanes never merge to dodge the cap; they defer). Rationale: coordinator load is O(lanes) offloaded (NFR-1), so the cap's binding constraint is not attention but (a) main-chat Task-tool practical parallelism and (b) the coordinator's own serial gate work (full test suite + typecheck), which is constant regardless of lane count — both tolerate 8. Because lanes = phases, most plans never reach 8; the cap is a ceiling, not a target.

FR-4a: The lane-merge rule that enforces the cap (`cfn-loop-task.md:174`, "merge the smallest phases into neighboring lanes until at most N remain") SHALL use the same named cap value as FR-4. Raising the cap raises the merge threshold in lockstep — there is ONE cap constant, not two.

FR-5: WHEN produce/consume metadata yields a dependency CYCLE (lane A→E and E→A via mutual produce/consume), `cfn-loop-task` SHALL merge the cycle's lanes into a single lane and run them sequentially inside it — the same resolution as the existing same-file rule (`cfn-loop-task.md:175`). The merge SHALL be logged as a cycle resolution.

FR-6: WHEN both columns are absent, empty, or every cell is `-`, `cfn-loop-task` SHALL compute zero edges and produce exactly one wave containing all lanes — byte-for-byte today's behavior (`cfn-loop-task.md:178`). No plan is ever slower or reordered by the presence of an empty metadata surface.

FR-7: Between waves, before spawning a dependent wave, `cfn-loop-task` SHALL run a **cheap producer-existence guard** — assert every `Produces` identifier claimed by the just-completed wave now resolves (scoped typecheck / grep for the symbol), NOT the full Phase-3 gate. A missing produced symbol fails the guard and iterates the producing lane before any consumer wave spawns. The full Phase-3 gate (`cfn-loop-task.md:213-302`) runs once after the final wave, unchanged.

FR-8: On gate-fail iteration, WHEN a lane is respawned (existing "respawn failing lane only", `cfn-loop-task.md:598`), `cfn-loop-task` SHALL also re-run every lane transitively downstream of it in the edge graph, because downstream lanes may have built on the failing lane's absent or wrong output. Lanes with no path from the failing lane are not respawned.

## 2. Non-Functional Requirements

NFR-1: Edge computation adds no dependency and no coordinator context bloat — it is string-set intersection over the plan's own columns, computed once at derivation time. The coordinator holds the edge list + wave assignments (a list of ≤ a handful of lane names and string edges), never any lane's working context; lane agents' read-scope is unchanged (`cfn-loop-task.md:191-193`). Main-chat load stays O(lanes), not O(agent-work).

NFR-2: The `Produces`/`Consumes` columns SHALL pass Bar B (haiku-executable) and Bar A (verifiable-done) unchanged — the columns are additive; a `-` cell is valid; no existing column's rule is relaxed. Bar B's ban-list (`write-plan.md:247`) applies to these cells too (no "as needed", "the relevant export", "TBD").

NFR-3: Wave count SHALL be ≤ lane count (a chain of N lanes yields ≤ N waves); the topological sort is over ≤ (post-cap) lanes, so it is trivially bounded and terminates. No configurable depth.

## 3. Acceptance Criteria

Scenario: producer/consumer lands in ordered waves, not one wave
  Given a plan where lane "types" has a step with Produces = `src/types.ts:Claims`
    and lane "auth" has a step with Consumes = `src/types.ts:Claims`
  When cfn-loop-task derives lanes
  Then it logs edge `types -> auth`
    And wave 1 = [types] (and any other edge-free lane)
    And wave 2 = [auth]
    And the auth lane is not spawned until the types wave barrier completes
    And the producer-existence guard confirms `src/types.ts:Claims` resolves before wave 2 spawns

Scenario: empty metadata reproduces today's single wave (backward compat)
  Given a plan whose Produces and Consumes cells are all `-` (or the columns are absent)
  When cfn-loop-task derives lanes
  Then zero edges are computed
    And exactly one wave is produced containing every lane
    And all lanes spawn in a single message (identical to current cfn-loop-task.md:178 behavior)

Scenario: 8-lane cap holds inside an over-wide wave
  Given 10 lanes that are all edge-free (all in wave 1 by dependency)
  When cfn-loop-task schedules
  Then at most 8 lanes run concurrently in the first wave slot
    And the remaining 2 defer to the next slot
    And no two of the 10 lanes are merged solely to fit the cap
    And the same cap value governs both the lane-merge threshold and the per-slot concurrency limit (one constant)

Scenario: mutual produce/consume cycle merges into one serial lane
  Given lane A Produces `x.ts:foo` and Consumes `y.ts:bar`
    and lane B Produces `y.ts:bar` and Consumes `x.ts:foo`
  When cfn-loop-task derives edges
  Then the A<->B cycle is detected
    And A and B are merged into a single lane run sequentially
    And the merge is logged as a cycle resolution (not a silent reorder)

Scenario: failing producer lane re-runs its downstream dependents
  Given edges types -> auth -> api and the gate fails because the types lane's export is wrong
  When the coordinator iterates
  Then the types lane is respawned
    And the auth and api lanes (transitively downstream) are respawned
    And any lane with no path from types is NOT respawned

## 4. Edge Cases

| Category | EC | Stresses | Expected behavior |
| Empty inputs | EC-1: both columns entirely `-` | FR-6 | zero edges, one wave, today's behavior; not a defect |
| Empty inputs | EC-2: a Consumes identifier matches NO Produces in any lane (dangling consume) | FR-2 | no edge created (nothing produces it); treated as a pre-existing symbol already in the tree — if it is in fact missing, the ordinary typecheck gate catches it, same as today. Log a warning line so a typo is visible |
| Boundary values | EC-3: single lane / single step plan | FR-3 | one wave, one lane; topological sort is a no-op |
| Boundary values | EC-4: strict chain of N lanes each consuming the prior | FR-3, NFR-3 | N sequential waves, one lane each; degenerates to fully serial — correct, and still cheaper than N gate-retries |
| Concurrency | EC-5: two lanes both Produce the same identifier | FR-2, FR-5 | ambiguous producer = plan defect; surface via AskUserQuestion (which lane owns it) — do not silently pick one; an unresolved duplicate producer blocks derivation |
| Failure modes | EC-6: producer lane completes but its claimed Produces symbol does not resolve | FR-7 | producer-existence guard fails; iterate the producing lane BEFORE the consumer wave spawns; consumer wave never runs on an absent symbol |
| Auth/permission | N/A: execution-infra derivation, no auth surface | - | - |
| Data quality | EC-7: a Produces/Consumes cell contains a banned vague token ("the relevant export", "as needed") | NFR-2 | Bar B rejects the plan; cell must name a concrete `<path>` or `<path>:<symbol>` |
| Data quality | EC-8: identifier string mismatch by whitespace/casing (`Claims` vs `claims`, trailing space) | FR-2 | match is exact string equality after trim; a case/space mismatch produces NO edge — same dangling-consume warning as EC-2 surfaces the typo |
| State transitions | EC-9: user keeps iterating; a downstream re-run set grows each round | FR-8 | bounded by the existing per-iteration cap (3 BLOCKING cycles); downstream re-run set is recomputed each iteration from current edges, never unbounded |
| Time | N/A: ordering is structural, no time dependence | - | - |
| Locale/i18n | N/A: identifiers are code symbols/paths, ASCII | - | - |
| Resource limits | EC-10: many lanes but 8-cap forces multi-slot waves | FR-4 | ready-but-capped lanes defer to the next slot; cap is a concurrency limit, not a merge trigger; log the deferral so coverage is visible |
| Resource limits | EC-11: plan has fewer phases than the cap (e.g. 3 phases, cap 8) | FR-4 | cap never binds; lanes = phases = 3; no synthetic lanes invented to fill the cap |

## 5. Pre/Post Conditions

Operation: derive-waves (cfn-loop-task LANE DERIVATION, extended)
  Preconditions: a `planning/PLAN_<slug>.md` exists with the step table; lanes formed by existing rules (1-lane-per-phase, 4-cap, exclusive file ownership) FIRST
  Postconditions (success): a lane-edge list + an ordered wave list; every lane in exactly one wave; no lane precedes a lane it consumes from; cycles merged and logged; cap respected per slot
  Postconditions (failure): duplicate-producer (EC-5) blocks with an AskUserQuestion; nothing spawns until resolved
  Invariants: file-ownership exclusivity is never violated by wave ordering; empty metadata ⇒ exactly the pre-feature single wave

Operation: execute-wave (per wave)
  Preconditions: all inbound-edge source lanes are in completed waves; producer-existence guard for prior wave passed
  Postconditions (success): wave's lanes complete + aggregated; producer-existence guard for THIS wave passes; next wave eligible
  Postconditions (failure): a failed producer guard iterates the producing lane before the dependent wave; full Phase-3 gate still runs once after the final wave
  Invariants: coordinator holds only edge list + wave map + aggregated JSON, never lane working context (NFR-1)

## 6. Out of Scope

- A full per-STEP task DAG. Edges are rolled up to LANE granularity; intra-lane steps stay serial as today.
- Automatic symbol/import extraction from source. Produce/consume is authored in the plan by `write-plan` from data it already has; the executor does not parse code to infer edges.
- Running the heavy Phase-3 gate between every wave. Only the cheap producer-existence guard runs inter-wave; the full gate runs once at the end (unchanged).
- Raising the 4-lane concurrency cap. Waves reorder within the cap; they do not increase it.
- Cross-PLAN / cross-epic dependencies. Edges are within one `PLAN_<slug>.md`.
- Megaplan changes. Megaplan assembles the plan via `/write-plan`; emitting the columns in write-plan means megaplan inherits them with no megaplan edit.

## 7. Open Questions

- Q-1: [PARKED: cheap producer-existence guard between waves, full gate once at end] inter-wave verification depth. Recommended default (FR-7): a scoped typecheck/grep that the just-produced symbols resolve, NOT the full test+typecheck gate — keeps coordinator load flat and still blocks a consumer wave from building on an absent symbol. Alternative (full gate per wave) rejected: multiplies the heaviest coordinator cost by wave count.
- Q-2: [PARKED: roll edges up to lane granularity] step-level vs lane-level edges. Recommended lane-level: the lane is the parallel unit, intra-lane steps are already serial, so step-level edges add resolution the scheduler cannot use. Revisit only if lanes are ever split below phase granularity.
- Q-3: [RESOLVED: hard-block via AskUserQuestion] duplicate-producer (EC-5) blocks derivation and surfaces a which-lane-owns-it question rather than auto-assigning. An ambiguous owner is usually a real plan bug; blocking surfaces it, auto-assign would hide it. Implemented in `cfn-loop-task.md` LANE DERIVATION step 5.

## 8. Build Flags
- frontend: no
- db: no
- pii: no
- unknowns: no (Q-3 resolved)
- tier-hint: beta
