# MegaPlan: decisions-ledger writer for cfn-workbench

Tier: beta   Build flags: frontend=no db=no pii=no unknowns=no   Generated: 2026-07-28

Builds a new `cfn-decisions` skill that owns the per-run JSON ledger
(`planning/.VERIFY_<slug>.decisions.json`) and delegates the SQLite sync to the
LOCKED `decision-log/record.sh` sink (composition, not duplication). Wires the
writer into 4 coordinator hook sites with D-8 failure isolation. Closes the gap
where `cfn-workbench/lib/section-decisions.sh:38-51` reads the JSON but nothing
writes it.

Mode mapping: beta tier maps to `--mode=standard` at execution (per SKILL.md
Step 7 hand-off-mode mapping).

## Artifacts (active phases only)

- `planning/SPEC_decisions_ledger.md` (10 FRs, 10 NFRs, 24 ECs, 9 SMs, 5 OBS, build flags)
- `planning/DECISIONS_decisions_ledger.md` (D-1..D-9; 4 BLOCKING: D-1, D-7, D-8, D-9)
- `planning/PSEUDO_decisions_ledger.md` (OP-W0..OP-W4 writer ops, OP-H1 hook wrapper)
- `planning/ARCH_decisions_ledger.md` (4 components: 2 NEW writer+hook, 2 LOCKED sink+renderer)
- `planning/OPS_decisions_ledger.md` (OBS-1..OBS-7 signals, 3-stage rollout, rollback rehearsal)
- `planning/TEST_decisions_ledger.md` (64 base ACs, Phase 6 TDD ordering, hostile-input EC mapping)
- `planning/PLAN_decisions_ledger.md` (lane source: 2 lanes A->B; steps A.1..A.9 + B.1..B.5; 43 TDD rows)
- `planning/VERIFY_decisions_ledger.md` (66 ACs: 64 base + AC-65/AC-66 promoted from Step 7; completion gate)
- `planning/REVIEW_decisions_ledger.md` (Bar B plan-review: 12/12 assumptions verified, 7 findings patched/resolved)
- `planning/.VERIFY_decisions_ledger.sha256` (Bar A bless hash; **bless pending re-bless after Q1/Q3 patch**)

## Gates

- Bar A verifiable-done: PASS (66 ACs, FR 10/10, EC 24/24, SM 9/9, OBS 5/5, WIRE 4/4 mapped)
  - Static check `check-verifiable-static.sh --stage plan` exit 0 (66 `evidence_pending` warnings, expected at plan stage; the exit-stage bless will reject surviving placeholders).
  - Produce-consume check `check-produce-consume.sh` exit 0 (4 dangling-consume warnings, all pre-existing LOCKED sink/renderer symbols, advisory).
  - Haiku-static check `check-haiku-static.sh` exit 0 (zero weasel findings post-patch).
  - **Bless pending re-bless after Q1/Q3 patch.** The prior Bar A bless (sha256 `607f1ae37370`) was computed at 64 ACs before the Step 7 promotions landed. The Q1 patch added AC-65/AC-66 and the Q3 patch rewrote AC-64's check+pass; both moved manifest bytes. The coordinator MUST re-run `bless-verify.sh` before `cfn-loop-task` Step 0 (the old hash will be correctly rejected as tampered).
- Bar B haiku-executable: PASS (0 blocking findings after 1 patch round)
  - Round 1 produced 2 BLOCKING + 5 advisory findings:
    - F1 BLOCKING (AC-12 grep target): the D-9 substitution AC grepped `decision-log/record.sh` but the actual replaced token at `cfn-megaplan/SKILL.md:215` is `cfn-decide`. PATCHED: AC-12 now checks `grep -c 'cfn-decide'` on line 215 drops AND `grep -c 'cfn-decisions/record.sh'` >= 1.
    - F6 BLOCKING (step 5c jq expression): the upsert jq pipeline stripped object context, making `.decisions` undefined in the conditional. PATCHED: PLAN step A.5 now uses `if (.decisions // [] | map(.id) | index($new.id)) != null then ... else ... end` (index calc moved into the condition).
    - F2 advisory (megaplan:300 routing inconsistency): documented as pre-existing, out of scope (F2 note in PLAN).
    - F3 advisory (D.1 doc scope): PATCHED to scope the D-9 substitution narrowly.
    - F4 advisory (distinct-id lost-update): accepted-as-documented (Q2 Step 7 decision; PLAN line 31 carries the limitation note).
    - F5 advisory (token-shape + weasel "etc."): "etc." on PLAN line 53 replaced with a concrete artifact list; token-shape issues are advisory (gate exit 0).
    - F7 advisory (trap timing under set -u): PATCHED: PLAN step A.5 trap now uses `[ -n "${TMP:-}" ] && rm -f "$TMP"`.
  - Post-patch: all 3 static checks exit 0. Haiku live probe (agent `a457cc3d04269f9b7`, model=haiku, ~184s wall, 30 tool uses) confirmed F6 upsert+bootstrap on representative step A.5 (could-proceed = YES after fix).
  - Assumption registry: 12/12 VERIFIED with pasted evidence (A1..A12 in REVIEW section 1). Zero UNTESTED.

## Open decisions resolved

From `planning/DECISIONS_decisions_ledger.md` (cfn-decide register); all user-approved 2026-07-28:

- **D-1 (BLOCKING):** new `cfn-decisions` skill. Writer owns per-run JSON; delegates SQLite sync to LOCKED `decision-log/record.sh` (composition, not duplication). Never opens `decisions.db` directly.
- **D-2:** per-run JSON artifact at `planning/.VERIFY_<slug>.decisions.json` (renderer contract path at `section-decisions.sh:14`).
- **D-3:** status enum `proposed|accepted|superseded` (3-state; mirrors SQLite CHECK constraint + renderer `state_label`).
- **D-4:** upsert-by-key (replace by `.id`) not append-only (decisions are evolving entities, not events; SPEC FR-2).
- **D-5:** bare `--blocking` flag form (mirrors `record.sh:30` bare-flag convention).
- **D-6:** never pass `--project` to sink (sink derives project from git toplevel basename).
- **D-7 (BLOCKING):** JSON-first / SQLite-best-effort / never roll back. Exit code 6 RESERVED (was 2a-FATAL in PSEUDO; REJECTED). Sink failure -> JSON kept, exit 8 (nonzero RC) or exit 7 (missing).
- **D-8 (BLOCKING):** isolate hook failures at ALL 4 coordinator sites. Writer nonzero -> OBS-4 stderr line -> `return 0` -> loop continues. The decision was already made by the agent/user; losing the ledger row is a coverage gap, not a wrong decision.
- **D-9 (BLOCKING):** writer replaces `cfn-decide` as canonical recorder at megaplan L3 BLOCKING `[OPEN]` site (`cfn-megaplan/SKILL.md:215`). Behavior-preserving for SQLite (writer delegates to `record.sh` per D-1); additive for JSON (new entry in `.VERIFY_<slug>.decisions.json`). Narrowly scoped: the other 5 `cfn-decide` references in the same file (lines 66, 300, 341, 372, 471) are untouched.

## Deferred decisions

Step 7 deferred-decision batch (user-approved 2026-07-28):

| phase | item | default chosen | outcome | re-gate run |
|---|---|---|---|---|
| PLAN A.6 / A.9 | Q1 hung sink (indefinite SQLite lock not covered by D-8; a hang is neither a nonzero exit nor a missing binary) | add `SINK_TIMEOUT_SECONDS=30` timeout wrapper inside the writer at the sink-call boundary (DRY: covers all 4 hook sites from one entry point) | overridden (promoted to PLAN step A.9; AC-65 static + AC-66 integration added) | static checks re-run (exit 0); full Bar A re-bless PENDING (coordinator blesses) |
| PLAN A.5 / line 31 | Q2 concurrent distinct-id lost-update (two simultaneous runs on the same slug can lose one decision via last-write-wins on the atomic `mv`) | accept single-writer assumption, document the limitation | accepted (F4 note in PLAN line 31; no locking code added) | none (documentation only) |
| PLAN A.8 / WIRE-4 | Q3 `section-decisions.sh` baseline drift detection (the git-diff fallback could not prove byte-identity without a pinned baseline hash) | pin sha256 hash `97ec8ef0f0bccebc8ff0d0024cf85a59b9cc9fe21d23a8aa8f725264417f2fb6` | overridden (promoted; AC-64 check+pass rewritten to `sha256sum ... \| grep -q '<hash>'`; PLAN WIRE-4 row + R6 updated) | static checks re-run (exit 0); full Bar A re-bless PENDING (coordinator blesses) |
| accepted-as-documented | caller-supplied em dashes (U+2014) in rationale text | trivially-accept (caller data; NFR-5 bans em dashes in writer OWN code only, not caller-supplied field values) | accepted | none |
| accepted-as-documented | SQLite FTS drift on sink insert | trivially-accept (owned by decision-log sink, not the writer; writer never opens `decisions.db`) | accepted | none |
| accepted-as-documented | `faketime` availability for EC-20 DST boundary test | trivially-accept (test documents a skip-with-reason fallback if `faketime` is absent) | accepted | none |
| accepted-as-documented | e2e real loop-task run reaching Phase 4.2 decision point | trivially-accept (owned by OPS Stage 3 rollout canary, not the plan's TDD suite) | accepted | none |

## Cross-plan seams

_none, standalone plan_

## Open tech debt in scope

_none_ (no `.cfn-cache/tech-debt-ledger.json` entries in the `cfn-decisions` skill scope; this is a NEW skill with no pre-existing `cfn:` markers. The F4 single-writer limitation is a documented park, not a tech-debt shortcut.)

## Build order

_standalone_

## Next

```
/cfn-loop-task "Build the decisions-ledger writer that closes the gap where cfn-workbench's renderer reads planning/.VERIFY_<slug>.decisions.json (section-decisions.sh:38-51) but nothing writes it" --mode=standard
```

Reads `planning/PLAN_decisions_ledger.md` for lanes (Lane A: writer skill, steps A.1..A.9; Lane B: coordinator hooks, steps B.1..B.5; strict A->B edge per OPS Stage 1 promote gate) and `planning/VERIFY_decisions_ledger.md` as the 66-AC completion gate.

Exit gate = `verify-run.sh` against the 66-row manifest (was 64 before Q1 promotion added AC-65/AC-66).

**PRE-FLIGHT (coordinator):** re-bless `planning/.VERIFY_decisions_ledger.sha256` via `bless-verify.sh` before invoking `cfn-loop-task`. The Q1/Q3 patches moved AC-64 and added AC-65/AC-66; the old bless hash (`607f1ae37370`) will be rejected by Step 0 as tampered until re-blessed. Per Step 7 re-gating table: AC rows were added/rewritten, so the coordinator runs full Bar A + full Bar B (including the live haiku probe if the step semantics shifted) before re-bless. The static checks already pass (3/3 exit 0 post-patch); the haiku probe on step A.5 already confirmed could-proceed = YES after the F6 fix.
