# State Machines

Entity lifecycle documentation for stateful CFN systems.

---

## CFN Loop Task: Phase 5 Exit Gate (cfn-loop-task 3.2.0, W1/W4/W5)

**States:** `entering | mutation_probe | verify_run | resolving | all_green_gate | build_smoke | done | iterating | stopped`

Mechanical done-verdict gate. Replaces the pre-3.2.0 honor-system single-pass rule. The gate MAY iterate back to Phase 2, bounded by MAX_ITERATIONS.

| From | To | Trigger |
|------|----|---------|
| entering | mutation_probe | 5E.0: per core FR, one semantic mutation injected, expect red |
| mutation_probe | verify_run | mutation caught (verify-run red as expected), file restored + sha256 matches BEFORE |
| mutation_probe | iterating | 5E.0: mutation survived (verify-run green) once → strengthen AC tests for FR-x |
| mutation_probe | stopped | mutation survived twice, OR restore sha256 mismatch (corrupted state) |
| verify_run | resolving | 5E.1-5E.2: needs_agent / predicate_unverified rows present |
| verify_run | all_green_gate | 5E.3: verify-run summary exit 0, nothing unresolved |
| verify_run | stopped | 5E.3: verify-run exit 4 (manifest hash mismatch) |
| resolving | all_green_gate | agent evidence stamped via verify-run resolve, all rows green |
| resolving | iterating | 5E.3: red ACs remain → back to Phase 2 (counts against MAX_ITERATIONS) |
| all_green_gate | build_smoke | 5E.4: gate-check --threshold 1.0 passes AND SPEC frontend=yes with build script |
| all_green_gate | done | 5E.4 passes AND no build smoke applicable |
| all_green_gate | iterating | persistent reds after flaky re-run + ≤2 quick fixes; user chose Keep iterating |
| all_green_gate | done | user-approved Quarantine (test.skip + cfn-allow-skip + backlog) |
| all_green_gate | stopped | user chose Abort |
| build_smoke | done | 5E.5: npm run build exit 0 |
| build_smoke | stopped | build fails after ≤2 fix attempts |
| iterating | entering | Phase 2 re-run completes, re-enters Phase 5 (MAX_ITERATIONS not exhausted) |
| iterating | stopped | MAX_ITERATIONS exhausted |

Done requires: all ACs mechanically green, manifest unedited since Bar A, no gamed tests, core FRs surviving the mutation probe, all applicable Phase 4 gate skills run, and (frontend) a passing prod build. 0.95 is never a done state; only all-green or an explicit user-approved quarantine.

---

## GOAP Planner

**States:** `planning | plan_found | unreachable`

| From | To | Trigger |
|------|----|---------|
| planning | plan_found | A* finds path to goal |
| planning | unreachable | max_iterations exhausted or no applicable actions |
| plan_found | planning | replanning requested (excluded actions changed) |

---

## Agent Selection (GOAP substitution)

**States:** `selecting | substitute_found | no_substitute`

| From | To | Trigger |
|------|----|---------|
| selecting | substitute_found | planner finds agent with unmet exclusions |
| selecting | no_substitute | all pool agents excluded |
| substitute_found | selecting | substitute also fails to spawn (retry with expanded exclusions) |

---

## Error Recovery (GOAP)

**States:** `error_detected | recovering | resolved | escalated`

| From | To | Trigger |
|------|----|---------|
| error_detected | recovering | planner selects retry_with_backoff, repair_docker_env, or allocate_resources |
| error_detected | escalated | budget exhausted or circuit open |
| recovering | resolved | recovery action succeeds |
| recovering | error_detected | recovery action fails (attempt_count incremented, replanned) |
| recovering | escalated | attempt_count >= max_attempts |

---

## Orchestrator Loop (GOAP-advised)

**States:** `loop3 | gate_check | loop2 | po_decision | complete | aborted`

| From | To | Trigger |
|------|----|---------|
| loop3 | gate_check | all loop3 agents complete |
| gate_check | loop2 | gate passed |
| gate_check | loop3 | gate failed, GOAP says iterate, budget OK |
| gate_check | aborted | gate failed, GOAP says abort (budget exhausted or max iterations) |
| loop2 | po_decision | consensus passed |
| loop2 | loop3 | consensus failed, GOAP says iterate |
| loop2 | aborted | consensus failed, GOAP says abort |
| po_decision | complete | PO returns PROCEED |
| po_decision | loop3 | PO returns ITERATE |
| po_decision | aborted | PO returns ABORT |

PO decision enum is closed: `PROCEED | ITERATE | ABORT` only (type guard `lib/orchestrator/src/types.ts:170`). `DEFER_AND_PROCEED` removed 2026-07-03; deferral = PROCEED + backlog items in `scope_changes`. Task Mode adds two pre-loop3 guards: Step 0 (parse `planning/VERIFY_<slug>.md` manifest if present; completion requires every `acs[].check` pass) and Step 3.0 (typecheck; any compile error fails the gate regardless of pass rate; 0/0 tests never passes via `gate-check.sh` exit 2).

---

## Spec Artifact Status (cfn-spec / cfn-megaplan)

**Entity:** `planning/SPEC_<slug>.md` `Status:` field.

**States:** `draft | locked`

| From | To | Trigger |
|------|----|---------|
| (none) | draft | cfn-spec writes artifact |
| draft | locked | megaplan orchestrator: Bar A (verifiable-done) passes |

Downstream phases may consume `draft`; `locked` means acceptance criteria are frozen and carry executable checks. Open questions accepted as deferred are rewritten `[OPEN]` to `[PARKED: <default>]` while still `draft`; cfn-pseudo refuses on `[OPEN]` only.

---

## Megaplan Bar B Result (Multi-Plan Program)

**Entity:** Bar B verdict for plans in a multi-plan program (sibling interdependent megaplans MP1…MPn). Standalone megaplans only use `PASS` (no CONDITIONAL state for single plans).

**States:** `PASS | CONDITIONAL-PASS`

| From | To | Trigger |
|------|----|---------|
| (none) | PASS | plan is haiku-executable, no sibling-plan dependencies, or all blocking seams are already `applied` |
| (none) | CONDITIONAL-PASS | plan is haiku-executable AND is blocked solely on named, tracked sibling seam items (all marked `dependency-critical: true` and `status: PENDING`) |
| CONDITIONAL-PASS | PASS | all blocking sibling seams flip to `applied` (tracked in program index doc `planning/MEGAPLAN_program_<slug>.md` cross-plan seam ledger) |

A CONDITIONAL-PASS plan is held at cfn-loop-task until its blocking seams are `applied` per program build order. Bar B failure (haiku-executable check itself fails) loops the owning phase, not a state transition — it is not CONDITIONAL-PASS.

---

## Dependency Scheduling

**States:** `pending | schedulable | in_flight | complete | blocked`

| From | To | Trigger |
|------|----|---------|
| pending | schedulable | all upstream deps reach `complete` |
| schedulable | in_flight | executor picks up task |
| in_flight | complete | task execution succeeds |
| in_flight | blocked | upstream task moves to failed |
| pending | blocked | upstream task moves to failed (transitively) |

Task does not have a `failed` state in the scheduler. Failure is recorded externally; scheduler marks all transitive dependents `blocked` and replans the remaining schedulable set.

---

## Video Ingest Run (glm-video-ingest)

**States:** `resolve | download | analyze | render | done | failed`

| From | To | Trigger |
|------|----|---------|
| resolve | download | Loom mp4 URL + transcript resolved (loom type); or input is direct url/file |
| resolve | failed | no Loom video URL (private/unresolvable) |
| download | analyze | bytes fetched for file-needing provider (kimi/gemini); zai skips, sends URL |
| analyze | render | provider returns 200 with non-empty content |
| analyze | analyze | HTTP 429, retry with backoff (kimi/zai, up to 4 attempts) |
| analyze | failed | non-200 after retries, empty content, or expired/invalid key |
| render | done | model output parses as valid JSON; JSON + MD written, usage/cost logged |
| render | failed | model output not valid JSON (raw saved, MD render aborted) |

### Gemini Files API upload (sub-state of `analyze`, gemini provider only)

**States:** `PROCESSING | ACTIVE | FAILED`

| From | To | Trigger |
|------|----|---------|
| PROCESSING | ACTIVE | file processed; generateContent proceeds |
| PROCESSING | FAILED | Gemini rejects/fails processing → run `failed` |

---

## Decision Record (decision-log structured store)

**Entity:** a resolved planning fork, written by `cfn-decide` via `record.sh`, keyed `(project, slug, decision_id)`.

**States:** `proposed | accepted | superseded`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | proposed | record.sh with `--status proposed` | fork surfaced, user not yet answered |
| (none) | accepted | record.sh (default status) | fork resolved (user-answered or self-resolved) |
| proposed | accepted | record.sh upsert, same key, status accepted | answer returned |
| accepted | accepted | record.sh upsert, same key | re-run; in-place update, no duplicate |
| accepted | superseded | newer record.sh with `--supersede <this-id>` | a later plan reverses the decision |
| proposed | superseded | newer record.sh `--supersede <this-id>` | reversed before acceptance |

**Illegal:** `superseded → accepted` (reversal of a reversal must be a NEW decision_id with its own `--supersede`, not a status flip, preserves audit trail). Delete is never used for reversal.

```
proposed ──answer──> accepted ──(--supersede by Dn)──> superseded
   │                                                       ▲
   └──────────────(--supersede by Dn)─────────────────────┘
```

---

## Manifest Suggestion (cfn-vote-implement processing)

**Entity:** a single code-review suggestion inside a `.cfn-cache/manifests/` manifest. Producers: cfn-dry-review, cfn-security-review, cfn-dep-audit, cfn-perf-gate, cfn-a11y-gate, cfn-alpha-launch. Status field tracks resumable processing.

**States:** `pending | implemented | skipped | failed | deferred | rejected`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | pending | manifest emitted by producer skill | not yet voted |
| pending | implemented | 3/3 vote, or product-owner IMPLEMENT, or user Apply; TDD passes | test suite green |
| pending | failed | implementation attempted, test suite breaks | change reverted |
| pending | skipped | 0/3 vote, or user Skip | n/a |
| pending | deferred | product-owner DEFER, or user Defer to backlog | appended to docs/BACKLOG.md |
| pending | rejected | product-owner REJECT (2/3 path) | PO reasoning recorded |

**Routing by tally:** 3/3 → auto-implement (TDD), 2/3 → product-owner agent (IMPLEMENT/DEFER/REJECT), 1/3 → batched user prompt (4 per AskUserQuestion call). 2/3 items never reach the user.

**Illegal:** any transition out of a terminal state (implemented/skipped/failed/deferred/rejected). Re-running the manifest only processes `pending` items; resumability depends on terminal states being final.

```
pending ──3/3 / PO IMPLEMENT / user Apply──> implemented
   ├──── test breaks ────────────────────────> failed
   ├──── 0/3 / user Skip ────────────────────> skipped
   ├──── PO DEFER / user Defer ──────────────> deferred
   └──── PO REJECT ──────────────────────────> rejected
```

---

## Intent Item (cfn-spec §1b Interaction Intent Walk)

**Entity:** one richness dimension (Richness ceiling, Value-type inheritance, Composition depth, State/lifecycle, Referential integrity, Scale/volume, Role/context variance) for one interactive feature (form, builder, wizard, table, editor, dashboard).

**States:** `[OPEN] | resolved | [PARKED: <default>]`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | [OPEN] | cfn-spec §1b emit dimension row, user not yet answered | dimension unresolved before L4 cfn-data |
| [OPEN] | resolved | user answers archetype-bundle question or residual question | answer rewritten back into step 1b table + FR list; dimension feeds control derivation in cfn-ux |
| [OPEN] | [PARKED: <default>] | cfn-spec defers dimension (e.g. question budget exceeded), explicit user acceptance | assumption recorded; not a spec rejection; dimension travels as assumption in plan artifacts |
| resolved | resolved | cfn-spec re-run (user changes answer) | in-place table update, FRs updated |
| [PARKED: <default>] | resolved | backlog item later elevated to priority | assumption flipped to decision during implementation or next planning cycle |

**Pipeline gate:** cfn-megaplan §1b presence gate (deterministic, same class as Build Flags check): if `frontend: yes`, spec MUST contain `## 1b. Interaction Intent` section with at least one row per interactive feature and every dimension either resolved, [OPEN], or `N/A: <reason>`. Frontend spec with no §1b section or incomplete dimension coverage is rejected; cfn-spec must be re-run with Interaction Intent Walk directive.

**[OPEN] blocking:** All [OPEN] items surface via `AskUserQuestion` and MUST be resolved before L4 cfn-data runs; a richness decision taken after schema locks is a migration, not an edit. Same 3-round bound as other spec open questions.

---

## Monitor Probe (cfn-monitor health gate)

**Entity:** one target endpoint probed by cfn-monitor. Stateless single-shot per run; no persistence between runs.

**States:** `unprobed | healthy | status_mismatch | latency_breach | unreachable`

| From | To | Trigger |
|------|----|---------|
| unprobed | healthy | HTTP response status == expected AND latency within budget |
| unprobed | status_mismatch | response status != expected |
| unprobed | latency_breach | status OK but latency > budget_ms |
| unprobed | unreachable | curl fails (timeout CFN_MONITOR_TIMEOUT_S, DNS, connection refused) |

Run exit code: 0 if every target `healthy`, 1 if any target in a failure state, 2 if no targets configured, 3 on CFN_MONITOR_TARGETS JSON parse error. Consecutive-failure tracking is a `cfn:` upgrade path (needs scheduled polling, not single-shot).

---

## Lane Deferrals (cfn-loop-orchestration-v2/cli/deferrals.sh, S006)

**Entity:** a blocking item deferred from Loop 3 Phase 2/3 (execution) to backlog for later completion.

**States:** `pending | resolved | backlog`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | pending | deferrals.sh record: blocking task identified during Phase 2-3, recorded as open | Lane cannot proceed until resolved or explicitly deferred |
| pending | resolved | deferrals.sh resolve: blocking item completed, evidence + sha256 verified | cfn-loop-task Phase 5 (5E.4a) gate fails if any pending deferrals remain |
| pending | backlog | deferrals.sh resolve with `--defer-to-backlog`: moved to docs/BACKLOG.md, tracked in `.deferrals_<slug>.json` status field | Allows Phase 5 to proceed; item scheduled for future work |

**Enforcement:** cfn-loop-task Phase 5 exit gate (5E.4a) requires `no open blocking deferrals` before entering 5E.4 all-green verdict. Deferrals persist to `planning/.DEFERRALS_<slug>.json`; file MUST be present before 5E gate runs, or gate fails (fail-closed default). Zero deferrals = absence of `.DEFERRALS_<slug>.json` or file with `[]` array.

---

## AC Verdict Lifecycle (verify-run.sh, S003, 2026-07-11)

**Entity:** verdict assigned to each Acceptance Criterion during VERIFY manifest execution.

**States:** `green | red | unresolved | blocked` (S007 added `blocked`)

**Verdict rules (overrides old honor system):**

| Condition | Verdict | Trigger |
|-----------|---------|---------|
| executable AC runs, exit 0 | green | All assertions passed, output valid |
| executable AC runs, exit 1-127 | red | Assertions failed or timeout |
| AC marked `.skip(` or `.skipIf(` | red | (S001, S003) Skipped tests now count as red (prevent green-by-skip). Old behavior: skip counted as pass. cfn-allow-skip quarantine marker + docs/BACKLOG.md entry required. |
| test-suite reports 0 collected | red, `reason=zero_tests_ran` | (S003/S005) Empty test files, all tests skipped, or a selector/flag that matched no test force red. Old behavior: 0/0 counted as pass. S005 adds the reason string + `filtered_out` count + a stderr line, so the author sees "the check matched no test" instead of the runner's tail. |
| cargo reports `N ignored` > 0 | red, `reason=skipped_present` | (S005) cargo says `ignored` where pytest says `skipped`. Before the cargo branch existed, Rust output was parsed as pytest, `PTS_SKIP` was always 0, and this rule never fired on any Rust project. |
| runner summary shape unrecognized | verdict = exit code, `reason=exit_code_only` | Fallback for runners the parser does not cover (mocha/ava/custom). Recorded explicitly so "trusted the exit code, no proof any test ran" is visible rather than implied. |
| AC marked `@pytest.mark.skipif` | red | Conditional skip marked red; requires cfn-allow-skip quarantine. |
| AC type `db-query`: query runs, returns rows | green | Query executed; shape validation deferred to predicate check |
| AC type `needs_agent`: evidence <3 lines | unresolved | Agent evidence too brief; verify-run resolve gate refuses it |
| AC type `needs_agent`: evidence ≥3 lines | green (stamped) | Agent signature + summary captured; resolve gate marks AC green |
| any AC unresolved after resolve phase | red | Predicate or agent evidence missing; cfn-loop-task may iterate to Phase 2 |
| AC `requires` unmet (env unset, db URL absent, http URL unreachable) | blocked, `reason=precondition_unmet` | (S007) Infra absent is not feature failure. Counted in `summary.blocked`, resolvable with captured evidence like `needs_agent` once a human brings the infra up. One field loop hand-verified 27 rows to separate these two. |
| AC `cwd` does not exist | blocked, `reason=precondition_unmet` | (S007) A monorepo subdir named in the manifest but absent on disk is a manifest defect, not a red check. |

**Verdict determinism:** AC verdict is fully determined by executable check output + parse-test-summary.sh classification (S002). Prose description never affects verdict. Results JSON from verify-run is single source of truth.

**Verdict reason (S005, 2026-07-22):** every results row carries a `reason` string naming which rule decided it — `zero_tests_ran` / `skipped_present` / `runner_failed` / `ok` / `exit_code_only` / `predicate_failed` / `predicate_unverified` / `needs_agent` / `precondition_unmet` (S007). `summary.zero_ran` counts the first case separately, because a zero-ran check is a *check* defect (wrong selector, `--ignored` vs `#[ignore]` mismatch, wrong module path with `--exact`) and never a feature failure. Sending authors to debug correct code was the dominant cost in both 2026-07-22 field handoffs.

## VERIFY Manifest Bless Lifecycle (bless-verify.sh, S007, 2026-07-22)

**Entity:** the `planning/VERIFY_<slug>.md` manifest, from authoring to the done verdict.

**States:** `draft → blessed(plan) → blessed(exit)`, with `refused` as the terminal-for-now state of a failed bless attempt.

| From | To | Trigger | Guard |
|---|---|---|---|
| draft | refused | `bless-verify.sh` run with Bar A error findings | Sidecar is NOT written; nothing is pinned |
| draft | blessed(plan) | `bless-verify.sh <file>` (default `--stage plan`) | `check-verifiable-static.sh --stage plan` clean. `evidence: "PENDING: <reason>"` allowed (warn) because the code does not exist yet |
| blessed(plan) | blessed(plan) | manifest edited, re-blessed | Ledger appends an entry naming changed ACs + fields; `structure_changed` / `predicate_changed` reported separately |
| blessed(plan) | blessed(exit) | `verify-run.sh backfill-evidence` then `bless-verify.sh --stage exit` (cfn-loop-task 5E.3a) | `--stage exit` errors on any surviving `PENDING`. Only green rows are backfilled |
| blessed(*) | draft | any edit to the file | Sidecar goes stale; `verify-run.sh` exits 4 until re-blessed |

**Why two stages:** a manifest is authored during planning, so "run the check once and paste its output" is impossible for code that does not exist. `PENDING` is the honest plan-time value, and the exit stage is where the loop collects on it. A single-stage rule would be unsatisfiable at plan time and therefore routed around.

**Ledger (`planning/.VERIFY_<slug>.bless.json`, append-only):** each entry records `timestamp`, `sha256`, `stage`, `ac_count`, `note`, `changed[]`, `added`, `removed`, `structure_changed`, `predicate_changed`. `predicate_changed: true` is the gaming vector (a `pass` loosened until the code satisfies it) and never folds into "just check text".

**Mutation-probe gate (5E.0):** Before verdict finalization, mutation probe on each core FR: inject semantic bug, expect red verdict, restore. If mutation survives (verify-run still green), AC is strengthened by cfn-loop-task Phase 2 re-run (S-series findings force loop iteration).

---

## Test Hygiene Gate (check-test-hygiene.sh, S001, 2026-07-11)

**Entity:** a test file changed in Phase 2/3 execution, scanned for gaming patterns.

**States:** `clean | quarantined | failed`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | clean | check-test-hygiene.sh scan finds no `.only`, `.skip`, `.skipIf(`, `.runIf(`, `.concurrent.skip`, `fit`, `@pytest.mark.skipif` markers | Phase 3 gate passes for this file |
| (none) | quarantined | marker found + same-line `cfn-allow-skip:` comment present | Finding recorded; backlog entry required; Phase 3 gate FAIL (user must approve backlog addition) |
| (none) | failed | marker found without quarantine comment | Finding recorded as gate-blocking; Phase 3 gate FAIL |
| quarantined | clean | cfn-allow-skip marker removed in next Phase 2 re-run | Test un-skipped, gate passes |

**Pattern detection (S001):** Old patterns `.skip\(` could never match new `.skipIf(`. Detector now uses alternation: `.only(`, `.skip(`, `.skipIf(`, `.runIf(`, `.concurrent\.skip`, `fit\(`, `@pytest\.mark\.skipif`. Catches pattern-skip-tautologies (e.g., `describe.skipIf(!FEATURE_FLAG)` where flag defaults off, self-skipping the guard).

---

## Role Capability Outcome (cfn-persona-verify)

**Entity:** a single capability verified within a role document by cfn-persona-verify schema validator.

**States:** `pass | denied-ok | fail | blocked`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | pass | Role doc explicitly grants capability with required detail (## Allowed section) | Capability achievable by actor |
| (none) | denied-ok | Role doc explicitly denies capability with documented reason (## Denied section) | Denial is intentional, not accidental omission |
| (none) | fail | Role doc omits capability (missing from both ## Allowed and ## Denied sections) | Schema validator flags missing entry; blocks role-doc acceptance |
| (none) | blocked | A prerequisite capability failed or is denied, blocking this capability's evaluation | Transitive blocking, suggests upstream redesign |

**Note:** Observer-only validation by default. Write operations (e.g., capability approval tracking) are opt-in per capability and governed by marker invariant: a pass record may only operate on rows it created itself. This prevents observability from breaking a pre-existing row's intent during dry-run.

---

## Role Verification Finding (cfn-persona-verify schema audit)

**Entity:** one non-conformance discovered by cfn-persona-verify against the ROLE_SKILL_SCHEMA.md template.

**States:** `implementation-wrong | doc-stale | not-yet-built`

| From | To | Trigger | Guide |
|------|----|---------|-------|
| (none) | implementation-wrong | Role doc is correct; code doesn't grant stated capability | Implement missing authorization/UI control in code, then re-verify |
| (none) | doc-stale | Code is correct; role doc is outdated or incorrect | Update role doc to reflect actual capability set, then re-verify |
| (none) | not-yet-built | Both doc and code are incomplete; feature is in backlog | Defer role-doc to planning phase; add to BACKLOG.md with phased delivery date |

**Audit closure:** All findings must move to a resolved category (code updated, doc updated, or backlog-tracked) before role acceptance. Manifest output from validate-role-skills.sh lists finding classification to guide fix sequencing (implementation-wrong = fast fixes, doc-stale = docs-only, not-yet-built = scope clarification).

---

## Wireframe Gate (cfn-megaplan L5→L6 barrier)

**Entity:** the wireframe emitted by cfn-ux Phase 6, gated before design/test-plan/ops run.

**States:** `emitted | approved | revising | skipped`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | emitted | cfn-ux (L5) publishes the low-fi wireframe; `wireframe: <url\|path>` recorded in UX_<slug>.md | frontend=yes AND ≥1 renderable screen |
| (none) | skipped | cfn-ux has zero renderable screens; records `_skipped: no renderable screens_` | no L5→L6 gate fires; not a defect |
| emitted | approved | user selects Approve at the L5→L6 AskUserQuestion | L6 (design ∥ ops) spawns only after this |
| emitted | revising | user selects Revise with a note | note does NOT change an FR/AC/schema (else route to cfn-spec/cfn-data) |
| revising | emitted | cfn-ux re-spawned in patch mode re-renders; reference line replaced | bounded by the per-level 3 BLOCKING-cycle cap |
| approved | (terminal) | — | never re-gated; approval precedes Bar A/Bar B (L8/L9) so the plan is built on a signed-off structure |

## Implementation Wave (cfn-loop-task LANE DERIVATION)

**Entity:** a lane wave scheduled by produce/consume edges (LANE DERIVATION step 5/6).

**States:** `blocked | ready | running | complete`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | ready | lane has no inbound produce/consume edge (or empty edge set) | ready lanes form WAVE_1 |
| (none) | blocked | lane Consumes an identifier Produced by a lane not yet complete | edge A→E from step-5 computation |
| ready | running | wave spawned (≤ LANE_CAP=8 lanes concurrently; excess defers to next slot) | file ownership exclusive across lanes |
| running | complete | all wave agents return + barrier reached + producer-existence guard passes | claimed Produces symbols resolve (scoped typecheck/grep), else respawn producing lane |
| blocked | ready | every inbound-edge source lane reached complete | dependency satisfied |
| complete | running | gate fails and this lane is the failing lane OR transitively downstream of it | respawn set recomputed from current edges each iteration |

**Cycle note:** a produce/consume cycle (A→E and E→A) is not a state — it is collapsed at derivation time into a single lane run sequentially (same resolution as the same-file rule), so no wave ever waits on itself.
