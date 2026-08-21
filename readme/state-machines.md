# State Machines

Entity lifecycle documentation for stateful CFN systems.

**Last Updated:** 2026-08-21 (terse-output mode flag lifecycle added; AC verdict gains the S008 `error`/tool_missing state; implementation wave rewritten against derive-lanes.sh; loop pre-flight readiness lifecycle added)

## Contents

- [CFN Loop Task: Phase 5 Exit Gate (cfn-loop-task 3.2.0, W1/W4/W5)](#cfn-loop-task-phase-5-exit-gate-cfn-loop-task-320-w1w4w5)
- [GOAP Planner](#goap-planner)
- [Agent Selection (GOAP substitution)](#agent-selection-goap-substitution)
- [Error Recovery (GOAP)](#error-recovery-goap)
- [Orchestrator Loop (GOAP-advised)](#orchestrator-loop-goap-advised)
- [Spec Artifact Status (cfn-spec / cfn-megaplan)](#spec-artifact-status-cfn-spec-cfn-megaplan)
- [Megaplan Bar B Result (Multi-Plan Program)](#megaplan-bar-b-result-multi-plan-program)
- [CFN MegaPlan-Lite: Planning DAG](#cfn-megaplan-lite-planning-dag)
- [Knowledge Claim (cfn-knowledge-plan Bar K)](#knowledge-claim-cfn-knowledge-plan-bar-k)
- [Shared Doc Publication (cfn-share)](#shared-doc-publication-cfn-share)
- [Dependency Scheduling](#dependency-scheduling)
- [Video Ingest Run (glm-video-ingest)](#video-ingest-run-glm-video-ingest)
- [Decision Record (decision-log structured store)](#decision-record-decision-log-structured-store)
- [Manifest Suggestion (cfn-vote-implement processing)](#manifest-suggestion-cfn-vote-implement-processing)
- [Intent Item (cfn-spec §1b Interaction Intent Walk)](#intent-item-cfn-spec-1b-interaction-intent-walk)
- [Monitor Probe (cfn-monitor health gate)](#monitor-probe-cfn-monitor-health-gate)
- [Lane Deferrals (cfn-loop-orchestration-v2/cli/deferrals.sh, S006)](#lane-deferrals-cfn-loop-orchestration-v2clideferralssh-s006)
- [AC Verdict Lifecycle (verify-run.sh, S003, 2026-07-11)](#ac-verdict-lifecycle-verify-runsh-s003-2026-07-11)
- [VERIFY Manifest Bless Lifecycle (bless-verify.sh, S007, 2026-07-22)](#verify-manifest-bless-lifecycle-bless-verifysh-s007-2026-07-22)
- [Test Hygiene Gate (check-test-hygiene.sh, S001, 2026-07-11)](#test-hygiene-gate-check-test-hygienesh-s001-2026-07-11)
- [Role Capability Outcome (cfn-persona-verify)](#role-capability-outcome-cfn-persona-verify)
- [Role Verification Finding (cfn-persona-verify schema audit)](#role-verification-finding-cfn-persona-verify-schema-audit)
- [Wireframe Gate (cfn-megaplan L5→L6 barrier)](#wireframe-gate-cfn-megaplan-l5l6-barrier)
- [Implementation Wave (cfn-loop-task LANE DERIVATION)](#implementation-wave-cfn-loop-task-lane-derivation)
- [Loop Pre-Flight Readiness (preflight.sh)](#loop-pre-flight-readiness-preflightsh)
- [Workbench Watcher (cfn-workbench watch.sh)](#workbench-watcher-cfn-workbench-watchsh)
- [Roster Lane (cfn-workbench section-roster)](#roster-lane-cfn-workbench-section-roster)
- [Runtime Link Target (link-runtime-dirs.sh)](#runtime-link-target-link-runtime-dirssh)
- [Terse-Output Mode (caveman plugin flag)](#terse-output-mode-caveman-plugin-flag)
- [Content Path Containment (security-utils.sh validate_file_path)](#content-path-containment-security-utilssh-validate_file_path)
- [Post-Edit Validation Pipeline (cfn-invoke-post-edit.sh / post-edit-pipeline.js, S016/S018/S020)](#post-edit-validation-pipeline-cfn-invoke-post-editsh-post-edit-pipelinejs-s016s018s020)
- [Subagent Lifecycle Hooks (cfn-subagent-start.sh / cfn-subagent-stop.sh, S015)](#subagent-lifecycle-hooks-cfn-subagent-startsh-cfn-subagent-stopsh-s015)
- [Pre-Edit Backup Lifecycle (cfn-invoke-pre-edit.sh / restore.sh / cleanup.sh, S014 + S017)](#pre-edit-backup-lifecycle-cfn-invoke-pre-editsh-restoresh-cleanupsh-s014-s017)
- [Hook Timeout Budget (cfn-hook-budget.sh, S017)](#hook-timeout-budget-cfn-hook-budgetsh-s017)
- [Pre-commit Credential Scan (scan_staged_file, S010-S014)](#pre-commit-credential-scan-scanstagedfile-s010-s014)
- [Pre-commit Hook Self-Test Gate (cfn-hook-selftest.sh, S019)](#pre-commit-hook-self-test-gate-cfn-hook-selftestsh-s019)
- [Prompt Optimizer Run (prompt-optimizer engine)](#prompt-optimizer-run-prompt-optimizer-engine)


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

Every terminal state (`done`, `stopped`) is followed by 5E.6 `run-ledger.sh record --outcome done|not_done|escalated`: one ledger row + FLAG lines. It observes the exit; it never changes it.

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

## CFN MegaPlan-Lite: Planning DAG

**States:** `L1 spec | L2 decide | L3 data (db=yes) | L4 arch+ux (frontend=yes) | L5 design/test_plan | L6 write_plan | L7 plan_review | Step 7 deferred-decision batch | Step 8 batched handoff`

Balanced-cut alternative to `/cfn-megaplan` for medium features (3-7 files, single shared-state surface). Both bars run 1-round; Bar B is static-only (no live haiku probe); pseudo is folded into the arch phase; non-core phases run at sonnet.

| From | To | Trigger |
|------|----|---------|
| L1 spec | L2 decide | spec barrier passes; §1a actors + §1b intent + Build Flags gates cleared |
| L2 decide | L3 data | decide resolves BLOCKING forks only |
| L3 data | L4 arch | data emits schema + field-bindings; floor RLS/auth/secrets authored |
| L4 arch | L5 design/test_plan | arch emits ARCH + PSEUDO folded; ux wireframe 1-cycle gate passed if frontend=yes |
| L5 design/test_plan | L6 write_plan | design + test_plan return |
| L6 write_plan | L7 plan_review | write_plan persists PLAN_ + Bar A static clean + bless-verify hash pinned, 1-round |
| L7 plan_review | Step 7 deferred-decision batch | plan_review + Bar B-static clean, 1-round, no probe |
| Step 7 deferred-decision batch | Step 8 batched handoff | batched [PARKED] items resolved in one AskUserQuestion; re-gate after override |
| Step 8 batched handoff | `/cfn-loop-task --mode=mvp` | MEGAPLANLITE_ synthesis written; PLAN_ + VERIFY_ on disk |

---

## Knowledge Claim (cfn-knowledge-plan Bar K)

**Source:** `.claude/skills/cfn-knowledge-plan/bars/check-grounding.sh` (rules G1-G9); ledger rows in `planning/KDOC_<slug>.md` `## Claims Ledger`.

**States:** `extracted | ledgered | cited | grounded | finding | relabelled | dropped`

A claim is the unit Bar K gates. It enters as a verbatim quote from one source, gets a `C-n` row with a Type, gets cited in the prose, and only then can be blessed. The three Types are terminal classifications, not states: EVIDENCE needs a source plus locator, INFERENCE needs upstream `C-id`s, ASSUMPTION needs neither but must be testable.

### States

| State | Meaning |
|-------|---------|
| `extracted` | verbatim quote + locator sits in `KEVIDENCE_<slug>__SRC-n.md`; no ledger row yet |
| `ledgered` | has a `C-n` row with Type, Source, Locator, Confidence |
| `cited` | prose references `[C-n]` at least once |
| `grounded` | ledgered + cited + Bar K clean; blessable |
| `finding` | Bar K raised G1-G9 against it |
| `relabelled` | retyped to ASSUMPTION after no source was found; legitimate exit |
| `dropped` | removed from ledger and prose together |

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | extracted | L4 extract node emits a quote | verbatim text + locator present; paraphrase re-runs the node at opus |
| extracted | ledgered | L5 synthesis writes the `C-n` row | Type in EVIDENCE\|INFERENCE\|ASSUMPTION (else G6); Confidence in high\|medium\|low (else G8) |
| ledgered | cited | L6 draft writes `[C-n]` in prose | row exists (else G1 against the prose) |
| cited | grounded | Bar K exit 0 | EVIDENCE has Source+Locator (else G2); SRC-n exists in KSOURCES (else G4); INFERENCE names upstream C-ids (else G9); id unique (else G5) |
| ledgered | finding | Bar K G3: row never cited in prose | draft dropped the claim, or the ledger is padded |
| cited | finding | Bar K G1: no matching row | claim asserted in prose without a trace |
| finding | grounded | owning level patches within 2 rounds | G1/G3 → draft; G2/G4/G9 → synthesis; G5/G6/G8 → the writing level |
| finding | relabelled | user accepts via AskUserQuestion after 2 rounds | Type set to ASSUMPTION and phrased as a testable statement |
| finding | dropped | user chooses to cut the claim | removed from BOTH ledger and prose, else G1 or G3 re-fires |
| relabelled | grounded | Bar K re-run exit 0 | ASSUMPTION rows need no Source or Locator |

```
extracted ──> ledgered ──> cited ──> grounded
                 │           │          ▲
                 │ G3        │ G1       │ patch (<=2 rounds)
                 └────> finding <───────┘
                          ├──> relabelled ──> grounded
                          └──> dropped
```

---

## Shared Doc Publication (cfn-share)

**Source:** `.claude/skills/cfn-share/resolve.sh` (state read), `.claude/skills/cfn-share/record-url.sh` (state write); sidecar `<dir>/.share-<basename>.url` holding `url`, `sha256`, `published`.

**States:** `unresolved | resolved | published | stale | orphaned`

State lives entirely in the sidecar. `resolve.sh` reports it as the `url` + `stale` pair; there is no in-memory session state, so a share picked up in a later session behaves identically.

### States

| State | Sidecar | Meaning |
|-------|---------|---------|
| `unresolved` | n/a | target missing, empty, or not `.md`; resolve.sh exits 1 |
| `resolved` | absent | publishable, never published |
| `published` | `sha256` matches file | live URL serves current bytes |
| `stale` | `sha256` differs | file edited since publish; the reader's link is behind |
| `orphaned` | points at a superseded artifact | a republish omitted `url:` and created a second artifact |

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| unresolved | resolved | file exists, non-empty, `.md` | no-arg form resolves newest `planning/PLAN_*.md` |
| resolved | published | Artifact publish (no `url` param) + record-url.sh | full file read before publishing; no credentials or customer data in the doc |
| published | stale | any edit to the file | detected on next resolve.sh by sha256 mismatch |
| stale | published | Artifact publish **with** `url:` + record-url.sh | same URL updated in place; sidecar sha refreshed |
| stale | orphaned | republish omits `url:` | failure mode; the reader's link keeps serving old bytes |
| published | published | republish of unchanged bytes | resolve.sh reports `stale:false`; confirm with the user first |

```
unresolved ──> resolved ──> published <──────┐
                               │             │ publish WITH url:
                               │ file edit   │
                               └──> stale ───┘
                                      │ publish WITHOUT url:
                                      └──> orphaned
```

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

**Entity:** a single code-review suggestion inside a `.cfn-cache/manifests/` manifest. Producers: cfn-dry-review, cfn-security-review, cfn-dep-audit, cfn-perf-gate, cfn-a11y-gate, cfn-alpha-launch, cfn-ab-critic. Status field tracks resumable processing.

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

**ab-critic entry point (cfn-ab-critic):** produces suggestions with `category: reference-gap` that enter this same lifecycle at `pending` and route through cfn-vote-implement identically (3/3 auto-implement, 2/3 product-owner, 1/3 user, 0/3 skip). Triggered only by an AC carrying a `reference` key. Tags: `polish` (cosmetic gap), `fix` (functional gap), `block` (winner=reference AND confidence>=0.9). A `block` tag is a merge-blocker regardless of vote tally; it bypasses the routing above and forces resolution before the manifest can close.

```
reference artifact ──┐
                     ├─ cfn-ab-critic (labels shuffled) ──> category: reference-gap
build artifact   ────┘                                            │
                                                                  ▼
              enters Manifest Suggestion lifecycle at `pending`
              (3/3 / 2/3 / 1/3 / 0/3 routing as above)
              tag=`block` ⇒ merge-blocker (bypasses tally)
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

**States:** `green | red | unresolved | blocked | error` (S007 added `blocked`; S008 added `error`)

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
| AC's tool is not on PATH | error, `pass=false`, `exit_code=127`, `reason=tool_missing` | (S008, origin MP0 deferral 102) A `bash -c` check whose binary is absent emits no stdout, so `n=$(tool ... \| wc -l); test "$n" -eq 0` read empty output as zero offenders and scored GREEN. One manifest false-passed 113 `rg` uses across 49 of its 241 checks. Deliberately NOT `blocked`: a blocked row invites a hand-resolve, and "the tool was not installed" proves nothing about the feature. Adjudicated AFTER `requires{}` (absent infra is not a broken toolchain) and BEFORE execution. |

**Verdict determinism:** AC verdict is fully determined by executable check output + parse-test-summary.sh classification (S002). Prose description never affects verdict. Results JSON from verify-run is single source of truth.

**Verdict reason (S005, 2026-07-22):** every results row carries a `reason` string naming which rule decided it — `zero_tests_ran` / `skipped_present` / `runner_failed` / `ok` / `exit_code_only` / `predicate_failed` / `predicate_unverified` / `needs_agent` / `precondition_unmet` (S007) / `tool_missing` (S008, counted separately in `summary.tool_missing`). `summary.zero_ran` counts the first case separately, because a zero-ran check is a *check* defect (wrong selector, `--ignored` vs `#[ignore]` mismatch, wrong module path with `--exact`) and never a feature failure. Sending authors to debug correct code was the dominant cost in both 2026-07-22 field handoffs.

## VERIFY Manifest Bless Lifecycle (bless-verify.sh, S007, 2026-07-22)

**Entity:** the `planning/VERIFY_<slug>.md` manifest, from authoring to the done verdict.

**States:** `draft → blessed(plan) → blessed(exit)`, with `refused` as the terminal-for-now state of a failed bless attempt.

| From | To | Trigger | Guard |
|---|---|---|---|
| draft | refused | `bless-verify.sh` run with Bar A error findings | Sidecar is NOT written; nothing is pinned |
| draft | blessed(plan) | `bless-verify.sh <file>` (default `--stage plan`) | `check-verifiable-static.sh --stage plan` clean. `evidence: "PENDING: <reason>"` allowed (warn) because the code does not exist yet |
| blessed(plan) | blessed(plan) | manifest edited, re-blessed | Ledger appends an entry naming changed ACs + fields; `structure_changed` / `predicate_changed` / `coverage_changed` reported separately; `regate` names the per-AC LLM re-gate still owed (`bar_a: none\|acs\|full`, `bar_b: none\|steps\|full`, `probe` only when an AC was added or `--force-full`). `ac_bless` map keeps untouched rows on their prior bless number |
| blessed(plan) | blessed(exit) | `verify-run.sh backfill-evidence` then `bless-verify.sh --stage exit` (cfn-loop-task 5E.3a) | `--stage exit` errors on any surviving `PENDING`. Only green rows are backfilled |
| blessed(*) | draft | any edit to the file | Sidecar goes stale; `verify-run.sh` exits 4 until re-blessed |

**Why two stages:** a manifest is authored during planning, so "run the check once and paste its output" is impossible for code that does not exist. `PENDING` is the honest plan-time value, and the exit stage is where the loop collects on it. A single-stage rule would be unsatisfiable at plan time and therefore routed around.

**Ledger (`planning/.VERIFY_<slug>.bless.json`, append-only):** each entry records `timestamp`, `sha256`, `stage`, `ac_count`, `note`, `changed[]`, `added`, `removed`, `structure_changed`, `predicate_changed`, `coverage_changed`, `regate{bar_a,bar_a_acs,bar_b,bar_b_acs,probe,reason}`; top-level `ac_bless{<id>:{bless_no,timestamp}}`. `predicate_changed: true` is the gaming vector (a `pass` loosened until the code satisfies it) and never folds into "just check text". Mechanical fields (`check evidence seeds signal trigger requires`) owe nothing beyond the static gate; any other field scopes the re-gate to that AC.

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

**Source:** `.claude/skills/cfn-megaplan/bars/derive_lanes.py` (stages 5-9: ownership, edges, SCC merge, topological waves); consumed by `.claude/commands/cfn-loop-task.md` Phase 2; verified by `.claude/skills/cfn-megaplan/bars/tests/test-derive-lanes.sh`

A lane's wave slot is computed by the script, never derived in chat. The script
emits `lanes[]`, `edges[]` and `waves[]`; the coordinator spawns one agent per
lane in wave order and holds a barrier at each wave boundary.

### States

`blocked | ready | running | complete`

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | ready | lane has no inbound produce/consume edge | ready lanes form wave 1 (`waves[0]`) |
| (none) | blocked | lane Consumes an identifier Produced by a lane not yet complete | edge recorded in `edges[]` |
| ready | running | wave slot spawned (at most `LANE_CAP=8` lanes per slot; excess deferred to the next slot) | file ownership exclusive across lanes in the slot; `shared_files[]` are read-only for that lane |
| running | complete | every wave agent returned, barrier reached, producer-existence guard passed | claimed `produces[]` symbols resolve (scoped typecheck/grep), else the producing lane respawns |
| blocked | ready | every inbound-edge source lane reached complete | dependency satisfied |
| complete | running | gate fails and this lane is the failing lane or transitively downstream of it | respawn set recomputed from `edges[]` each iteration |

```
(none) ──no inbound edge──> ready ──spawn slot──> running ──barrier+producer guard──> complete
(none) ──consumes pending──> blocked ──sources complete──> ready        complete ──gate fail──> running
```

**Cycle note:** a produce/consume cycle is not a state. Stage 8 collapses each
strongly-connected component into one lane run sequentially (same resolution as
the same-file rule), so no wave ever waits on itself. The SCC pass is iterative;
recursive Tarjan overflows on a real 109-step co-write chain.

**Not-separable exit:** when the longest lane exceeds twice `--max-steps`, the
script emits a `separability` advisory instead of pretending to parallelize. That
is a plan-quality signal (a hub file co-written by most steps), and the
documented resolution is to re-run `/write-plan` with phase-local file sets or to
accept the serial run explicitly. Exclusive ownership stays the default;
`--hub-split` and `--soft-ownership` loosen it only on request.

---

## Loop Pre-Flight Readiness (preflight.sh)

**Source:** `.claude/skills/cfn-megaplan/bars/preflight.py` (`scan_open_sections`, `find_artifacts`, `open_blocking_deferrals`); called from `.claude/commands/cfn-loop-task.md` Step 0c; verified by `.claude/skills/cfn-megaplan/bars/tests/test-preflight.sh`

**Entity:** one plan directory, evaluated for whether the loop may start. The
scan is section-aware: a heading that announces open work contributes its items,
the same heading qualified as answered/resolved/decided/retired does not.

### States

`clear | open-items | open-deferrals | missing-artifact | unresolvable`

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | unresolvable | `--plan-dir` absent or not a directory | exit 2; re-resolve through `plan-paths.sh` before retrying |
| (none) | missing-artifact | a required artifact (PLAN, VERIFY, SPEC, DECISIONS) has no `<KIND>_<slug>.md` | exit 1; reported in `missing_artifacts[]` |
| (none) | open-items | an unqualified open heading in DECISIONS/SPEC/PLAN/ARCH/OPS/DATA/UX/TEST carries at least one item | exit 1; at most 8 items listed per section, `item_count` and `truncated` stay exact |
| (none) | open-deferrals | `.DEFERRALS_<slug>.json` beside the plan dir has an entry with `status: OPEN` and `blocking: true` | exit 1; these become Phase 5 gate failures if the loop starts anyway |
| (none) | clear | no missing artifact, no open section, no open blocking deferral | exit 0; the only state Phase 1 may follow |
| open-items | clear | each item resolved or explicitly accepted, answer recorded in `DECISIONS_<slug>.md`, script re-run | one `AskUserQuestion` per item; a heading rewritten as answered/resolved drops out of the scan |
| open-deferrals | clear | resolved through `deferrals.sh`, script re-run | resolution recorded in the side manifest, not in prose |
| missing-artifact | clear | the artifact written (`/write-plan`, `/cfn-megaplan`), script re-run | resolves through `plan-paths.sh`, nested layout first |

```
unresolvable <──bad --plan-dir── (none) ──nothing open──> clear ──> Phase 1
                                   │
       ┌───────────────────────────┼───────────────────────────┐
missing-artifact            open-items                  open-deferrals
       │ write artifact            │ decide + record            │ deferrals.sh
       └───────────────────────────┴───────────────────────────┘
                              re-run ──> clear
```

`clear` is not sticky: it describes the plan dir at scan time, so the script is
re-run after every resolution rather than remembered.

---

## Post-Edit Validation Pipeline (cfn-invoke-post-edit.sh / post-edit-pipeline.js, S016/S018/S020)

**Entity:** post-edit transformations and validators chained after Claude Code applies edits.

**States:** `validating | shellcheck_probe | shellcheck_running | cargo_probe | cargo_running | dispatching | collecting | summarizing | passed | warned | blocked`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | validating | cfn-invoke-post-edit.sh invoked after edit completes | pre-flight: check all validator scripts exist before running any |
| validating | blocked | missing validator detected (existsSync fails on extension-dispatched validator) | stderr lists missing path, exit 9 (BASH_VALIDATOR_MISSING) |
| validating | shellcheck_probe | all dispatched validators resolved (empty table after 2026-07-25 cleanup) OR CFN_HOOK_VALIDATORS injected | probe for shellcheck binary availability (.sh/.bash files only) |
| shellcheck_probe | shellcheck_running | SHELLCHECK_BIN on PATH and executable | run shellcheck --format=gcc on target file |
| shellcheck_probe | dispatching | shellcheck not found | one-line stderr note: "SHELLCHECK SKIPPED", results.shellcheck.passed=null (never claimed as pass), continue to next phase |
| shellcheck_running | warned | shellcheck exit 1: findings present (SC codes) | non-blocking, findings added to recommendations, status BASH_VALIDATOR_WARNING, exit 10 |
| shellcheck_running | dispatching | shellcheck exit 0: no findings | continue to next phase |
| shellcheck_running | dispatching | shellcheck exited nonzero (parse error, crash) | log to WARN, skip results, continue (tool problem not file problem) |
| dispatching | cargo_probe | [S020] phase 2.7 reached, file extension is .rs | only .rs files enter the cargo phase; all others go straight to collecting |
| cargo_probe | cargo_running | [S020] CFN_HOOK_CARGO_BIN (default `cargo`) on PATH and nearest Cargo.toml ancestor found within 20 hops | run `cargo check --quiet --message-format=short` in crate root, cwd=crate root, 180s timeout |
| cargo_probe | collecting | [S020] cargo not on PATH OR no Cargo.toml ancestor | SKIPPED: stderr note "install rustup / cargo", results.cargoCheck.passed=null (never claimed as pass) |
| cargo_running | warned | [S020] cargo check exit nonzero: compile errors parsed from short-format output | non-blocking, errors pushed to recommendations (type:cargo-check), status CARGO_CHECK_FAIL, exit 10 |
| cargo_running | collecting | [S020] cargo check exit 0: no compile errors | status CARGO_CHECK_SUCCESS, results.cargoCheck.passed=true |
| cargo_running | collecting | [S020] cargo timeout (180s) or crash (null status) | log WARN, skip results, continue (tool problem not file problem) |
| dispatching | collecting | remaining validators invoked sequentially (usually empty after cleanup) | exit codes parsed: 0=pass, 1=warning, 2+=error |
| collecting | summarizing | all validators complete | tally passed/warned/failed counts |
| summarizing | passed | no warnings (validator exit 1) and no shellcheck findings | edit accepted, no intervention needed |
| summarizing | warned | shellcheck findings only, no blocking validators | status BASH_VALIDATOR_WARNING, exit 10 (non-blocking) |
| summarizing | blocked | `--blocking` flag set and ≥1 blocking (exit 2+) finding returned | wrapper exits 1, blocks the edit |

**Cleanup (S018, 2026-07-25):**
All 10 extension-dispatched validators (bash-pipe-safety, bash-dependency-checker, enforce-lf, python-subprocess-safety, python-async-safety, python-import-checker, js-promise-safety, rust-command-safety, rust-future-safety, rust-dependency-checker) were deleted 2025-11-05 in 304584e0b as collateral in a bulk skill cleanup; validatorsByExtension dispatch table was never updated, leaving 9 months of silent no-ops. Audit determined 8 of 10 duplicated tooling already wired in or were broken as written. bash-pipe-safety was the only one covering a real unchecked bug class (piped stderr hang under pipefail). Removed all 10 entries from validatorsByExtension; detection machinery kept and tested. shellcheck now covers shell files via new Phase 2.6 integration. Line-ending enforcement moved to git config (`.gitattributes * text=auto eol=lf`) instead of sed rewrite mid-edit.

**Bug fixes (S016/S018, 2026-07-25):**
- **Unversioned pipeline code:** post-edit-pipeline.js lived at `dist/hooks/` (gitignored, untracked, hand-maintained). Moved to `.claude/hooks/post-edit-pipeline.js`.
- **Silent validator no-op:** 10 validators under nonexistent `.claude/skills/hook-pipeline/` silently skipped. bash exits 127 (no match in pass/warn/block cases), so `SUCCESS executed:3 passed:0` logged despite missing 7 validators. Python exits 2 (matches non-blocking-warning), so 3 absent .py validators incorrectly surfaced as file warnings.
- **Missing validator detection:** now existsSync preflight; name each missing on stderr; split `executed`/`missing`/`dispatched` counts; exit 9. Wrapper still exits 0 unless `--blocking`.
- **Dead validator scripts:** cfn-post-edit-cfn-retrospective.sh (all 5 skill paths moved, every case unreachable; deleted 2026-07-25); cfn-pre-edit-security-warning.sh (not a hook by shape).

**Coverage:** 17 jest tests (7 missing-validator, 5 shellcheck integration, 5 cargo-check phase), 17 passed / 0 failed. 33 pre-existing `PostEditValidator` tests marked `describe.skip` (broken since 52e06b7f6: ESM `export` in a CommonJS Jest context, missing `.d.ts`, return-shape `{valid}` vs asserted `{passed}`). Full shell hook suite 152 passed / 0 failed.

**Known limitation (S018):** shellcheck is NOT currently installed on this machine. Phase 2.6 takes the skipped path everywhere, reporting `SHELLCHECK SKIPPED` on stderr and `passed: null` in results. Installation (`apt install shellcheck` / `brew install shellcheck`) wires it live.

**Cargo phase (S020, 2026-07-26):** unlike shellcheck, `cargo 1.94.0` IS installed on this machine, so Phase 2.7 runs live for `.rs` edits inside a crate. Compile errors ride the same non-blocking exit-10 warning bucket as shellcheck (the edit already applied; the hook can only warn). This replaces the prior placebo `.rs` handling, which emitted 3 regex quality checks (`println!`/`unwrap()`/`panic!`) plus advice text "Run cargo fmt && cargo clippy --fix" without ever invoking cargo; that regex block is retained alongside cargo check because it covers style that `cargo check` does not. The a568d6ee5 audit's claim that "cargo clippy covers it" was false: clippy was never wired. `cargo clippy` remains a future option (slower, opinionated) over `cargo check`.

---

## Subagent Lifecycle Hooks (cfn-subagent-start.sh / cfn-subagent-stop.sh, S015)

**Entity:** a subagent spawned by Claude Code (via SubagentStart/SubagentStop events).

**States:** `starting | running | stopping | stopped`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | starting | Claude Code SubagentStart event fired; cfn-subagent-start.sh invoked | agent id/type parsed from stdin JSON payload, inserted to agents table |
| starting | running | INSERT succeeds, agent row created with id/type/timestamp | run_id foreign key active, metadata field initialized |
| running | stopping | Claude Code SubagentStop event fired; cfn-subagent-stop.sh invoked | agent row located by id from stdin JSON |
| stopping | stopped | UPDATE succeeds, metadata column recorded with final state | row archived, agent lifecycle complete |

**Bug fixes (S015, 2026-07-25):**
- **NOT NULL constraint crash:** cfn-subagent-start.sh INSERT omitted two mandatory columns (`name`, `updated_at`). Canonical DDL lives in execute-lifecycle-hook.sh; extracted to schema.sql so both hooks enforce the same structure. Pre-S015, every subagent start crashed with constraint error, no audit row written.
- **Environment variable fallback broken:** both hooks read agent id/type from ENVIRONMENT VARIABLES (never set by Claude Code, only present in manual shell invocation). Claude Code always delivers a JSON payload on stdin via SubagentStart/SubagentStop. Hooks now parse JSON first, fall back to env for manual testing. Result: all audit rows before S015 have `id='unknown'`.
- **SQL injection:** agent id was interpolated raw into INSERT/UPDATE queries. Now properly escaped using SQLite quoting rules (single quotes doubled).
- **Metadata column wipe:** `json_set(NULL, ...)` returns NULL, silently erasing the metadata field on stop. Now COALESCE-guarded so existing metadata merges with new updates.
- **Hook exit code interferes with spawns:** cfn-subagent-start.sh under `set -euo pipefail` exited nonzero on any bookkeeping failure, which interfered with Claude Code's agent spawn. Relaxed to `set -uo pipefail` so database writes never block agent creation (bookkeeping is optional; spawn is critical).

**Coverage:** 21 tests, 21 passed / 0 failed. Verified against a /tmp copy of the DB; real production database untouched.

**Registration status:** these hooks are deliberately NOT registered in any settings file. Duplicate SubagentStop writer already exists (cfn-agent-lifecycle/cli/lifecycle-hook.sh complete with status 0.92), and the row owner must be decided before both can coexist.

---

## Pre-Edit Backup Lifecycle (cfn-invoke-pre-edit.sh / restore.sh / cleanup.sh, S014 + S017)

**Entity:** a file backup captured before edit-safety applies transformations.

**States:** `none | captured | restorable | restored | prunable | orphan | removed`

**Backup capture / restore (S014):**

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | captured | cfn-invoke-pre-edit.sh writes `.backups/<agent-id>/<ts>_<hash>/{original,metadata.json}` | pre-edit hook invoked by Claude Code on every edit; agent-id flows through correctly (S014 fix) |
| captured | restorable | backup exists on disk with valid path resolution | restore.sh resolves target via multi-root ancestor search (project root fixed at BACKUP time, not RESTORE time) |
| restorable | restored | `cfn-restore-from-backup.sh <file>` or `restore.sh --file <file>` | md5-vs-file_hash integrity gate passes (or `--force`); restore.sh takes a safety backup under `.backups/restore-safety/` first, so restore is itself reversible |
| (none) | restorable | legacy `${FILE}.backup-<ts>` sibling found (from deprecated cfn-pre-edit-backup.sh) | restore.sh queries both conventions, newest wins; integrity gate skipped (no hash exists for legacy) |

**Cleanup / prune (S017, new):**

| From | To | Trigger | Guard |
|------|----|---------|-------|
| captured | prunable | cleanup.sh dry-run selects backup older than `--older-than` and beyond `--keep-latest N` | defaults: older-than 7 days, keep-latest 1; dry-run reports `would_remove:` |
| prunable | removed | cleanup.sh `--apply` | flock on `<root>/cleanup.lock` acquired; foreign root refused unless `CFN_BACKUP_ALLOW_FOREIGN_ROOT=1` |
| captured | orphan | backup.sh crashed mid-write (mkdir done, metadata.json never written) | dir exists but no metadata.json |
| orphan | removed | cleanup.sh `--prune-orphans --apply` | dir age > 60s grace window (mutation-verified); protects backup.sh mkdir→cp→write-metadata atomicity |

**Bug fixes (S014, 2026-07-25):**
- **Stderr merge broke stdout capture:** pre-edit hook ran `2>&1` on the backup-creation helper, merging the helper's `✅ Backup created: /path` stderr banner into the stdout path. `BACKUP_PATH=$(...)` captured two lines and resolved to empty. CLAUDE.md §1 entry point was non-functional. Fixed by capturing stdout only; stderr suppressed for logging.
- **Agent-id attribution broken:** cfn-restore-from-backup.sh passed `--agent-id` as a bare positional arg; the helper's CLI is `--agent-id ID`, so attribution defaulted to `unknown`. All 1451 existing backups sit in `.backups/unknown/`. Fix is forward-only; history not re-attributed.
- **Restore pattern mismatch:** restore looked only for `${FILE}.backup-*`, matching the deprecated naming from cfn-pre-edit-backup.sh. The current hook writes nothing matching that pattern. Restore now understands both conventions (query both patterns, newest wins). All existing backups remain valid.
- **Pipe failure masking:** `ls -t $PATTERN | head -1` under `set -euo pipefail` died when glob matched nothing (ls exits 2, pipefail propagates). The "no backup found" branch was unreachable; missing backup exited 2 with zero output.

**Rollback-path gap closed (S017, 2026-07-25):**
- **Dead registry:** `edit-safety.sh rollback/list/cleanup` read `/tmp/edit-safety/backup-registry.json` which only `register_backup()` ever wrote, and `register_backup()` is called only from `safe_edit()` which nothing invokes. Result: rollback answered "No backup found" for all 1482 backups the live hook had ever written; cleanup reclaimed 0 bytes forever. Fix: rollback/list/cleanup now delegate to `restore.sh`/`cleanup.sh` which read the real `.backups/` tree directly. Dead registry functions deleted, not left as decoys.
- **Two divergent restore paths collapsed (DRY):** restore.sh is now the single implementation; `cfn-restore-from-backup.sh` is a thin wrapper preserving the FILE_PATH-only CLI, exact stdout/stderr strings, and Redis restore log. Two independent "which backup is newest" answers was the bug class this audit keeps finding.
- **Dry-run lied about deletions:** cleanup.sh dry-run reported `removed: N` in both modes. Fix: labels flip to `would_remove:` / `would_remove_orphans:` in dry-run; JSON keys carry `dry_run` bool and stay unchanged.
- **Stderr merge (recurring class):** wrapper's `LIST_OUT=$("$RESTORE_SH" --list ... 2>&1)` would let any stderr warning become the parsed "winning backup" line. Same bug class as S014's BACKUP_PATH capture. Fix: stderr to temp file with trap cleanup. Mutation-verified: merged streams fail 5/18, separate streams pass 18/18.
- **False deprecation headers:** cfn-invoke-pre-edit.sh and backup.sh both carried headers marking them deprecated with 2026-02-20 removal dates, pointing at `dist/cli/pre-edit-hook.js` (source deleted ec6203a3b, dist gitignored, unbuildable from fresh clone) and `src/lib/backup-manager.ts` (a stub with 4 unimplemented methods; the stub and its whole layer were deleted 2026-07-26 in 85c895a95). Both scripts are the live path. Headers corrected.

**Coverage:** 92 tests (18 roundtrip + 74 restore/cleanup), all pass. Live read-only validation: restore --list on real file returns newest backup; cleanup dry-run reports 1495 scanned / 483 prunable / 14.8MB reclaimable at 30-day/keep-2.

---

## Hook Timeout Budget (cfn-hook-budget.sh, S017)

**Entity:** a hook execution bounded by a shared timeout budget system. Applies to search hooks with per-step timing guarantees.

**States:** `pending | step_executing | step_timeout_skip | step_complete | complete | failed`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | pending | hook invoked with budget registration | budget initialized from /proc/uptime (monotonic, immune to clock jumps) |
| pending | step_executing | first step ready to execute | deadline computed from budget, timeout guard installed |
| step_executing | step_complete | step finishes before deadline | step result recorded |
| step_executing | step_timeout_skip | deadline reached, timeout fires | step skipped (not errored); budget exhaustion never blocks |
| step_complete | step_executing | next step ready | remaining budget recomputed |
| step_timeout_skip | step_executing | next step ready (budget permitting) | skipped step does not consume budget further |
| step_complete | complete | all steps finished, results collected | hook exit 0 (non-blocking) |
| step_timeout_skip | failed | all remaining steps will timeout; stop attempting | hook exit 0 (non-blocking) |

**Budget exhaustion semantics:** unlike process-level timeout (sends SIGTERM/SIGKILL), hook budget exhaustion SKIPS remaining steps and returns partial results, preserving whatever telemetry was collected. Registration `timeout: 5s` on search hooks means harness will send SIGKILL at 5s if hook has not completed; hook-level budget (3000ms / 3s) provides 2s safety margin and forces step-skip before harness deadline. Hook never blocks (exit 0) even if all steps skipped.

**Critical timing fixes (S017, 2026-07-25):**
- `timeout -k` alone does not prevent indefinite wait: process sends SIGTERM, parent waits indefinitely for exit. Measured 10002ms vs 2s limit. Requires explicit timeout-after (`-k 1`).
- Grandchild holding stdout blocks reader on EOF: even after parent timeout, `cat $PIPE | tee $FILE` in parent waits forever for grandchild to release the pipe. Root: child spawns grep that outlives timeout. Fix: capture to regular file instead of pipe.
- Deadline from `date` (CLOCK_REALTIME) jumps backward after host stall, silently EXTENDING deadlines when most needed. Observed -1533ms backward jump, 3.3s host freeze. Use `/proc/uptime` (CLOCK_MONOTONIC).
- `timeout` SIGKILLing its process group leaks `Killed` job-control chatter onto stderr, the same stream PreToolUse reads for block decisions. Suppressed via stderr redirection.

**Retry protocol:** timing test runs control and retries on detected stall (max 3 attempts). Exhausted retry budget is still a failure, not a silent pass. Mutation-verified: raising budget to 12000ms produces 4 immediate failures on healthy host.

**Coverage:** 23 tests, 23 passed / 0 failed across 10 consecutive runs, all on attempt 1.

---

## Pre-commit Credential Scan (scan_staged_file, S010-S014)

**Entity:** a staged file passed through the credential-scanning pre-commit git hook.

**States:** `scanned | blocked | allowed`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (none) | scanned | git pre-commit hook invokes `scan_staged_file` on staged file content | 40+ credential/token patterns tested (Anthropic, OpenAI, GitHub, Google, etc.) |
| scanned | allowed | zero patterns match, or all matches are whitelisted (e.g., `[REDACTED]` placeholder) | commit proceeds, exit 0 |
| scanned | blocked | ≥1 unwhitelisted pattern match, findings redacted and logged | commit rejected, exit 1; terminal output shows pattern, line number, and match count (redacted) |

**Bug fixes (2026-07-25):**
- **S010 (infinite loop):** `TEMP_RESULTS` was both written to (`>>`) and read from (`done <`) in the same loop, causing every appended line to be re-read as new input. Fixed by splitting read buffer (`TEMP_MATCHES`) from findings report (`TEMP_RESULTS`). Regression: commits with credentials hung indefinitely instead of rejecting.
- **S011 (fail-open):** `if ! scan_staged_file "$file"; then findings=$?` captured the negation's exit status (always 0), not the function's finding count. Fixed with `|| findings=$?` capture and count capping at 200 (prevents wraparound at 256). Regression: every file reported clean, including files with real credentials.
- **S012 (credential leak):** `is_whitelisted()` looped over `WHITELIST[@]` without declaring `wl_pattern` local, clobbering the caller's `$pattern` variable. Redaction sed then ran with a whitelist pattern instead of the matched credential, writing the real credential unredacted to stdout and `.artifacts/logs/git-hooks.log`. Fixed with `local wl_pattern`. Regression: credentials were logged in plain text, defeating the scanner's purpose.
- **S013 (installer ignoring hooksPath):** `install-git-hooks.sh` hardcoded `$PROJECT_ROOT/.git/hooks`, ignoring git config `core.hooksPath`. Husky repos repoint it to `.husky/`, so the hook was silently ignored everywhere. Fixed with `git config --get core.hooksPath`, handling both relative and absolute paths. Regression: coverage dropped from 41/41 to 3/41 repos.

**Coverage:** 47 tests (T1-T7: baseline, T8-T12: new regression suite). T8 validates termination via 15s timeout; T9 validates block-on-secret and whitelist behavior; T10 validates redaction (no raw leaks); T11 validates pattern completeness (OpenAI/GitHub); T12 validates installer core.hooksPath resolution. Mutation-verified: reverting S010/S011/S012 fixes reproduces 4 test failures.

---

## Pre-commit Hook Self-Test Gate (cfn-hook-selftest.sh, S019)

**Entity:** the hook-registry consistency check run by `cfn-hook-selftest.sh` when pre-commit detects a change to hook registration.

**States:** `skipped | scanned | passed | failed`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (start) | skipped | no staged path matches `^(.claude/hooks/|\.claude/settings[^/]*\.json$|settings\.json$|\.husky/)` | commit proceeds to the next pre-commit phase, selftest not run |
| (start) | scanned | at least one staged path matches the registration gate | pre-commit invokes `cfn-hook-selftest.sh --strict --quiet` |
| scanned | passed | every hook on disk is registered or marked `# cfn-selftest: not-a-hook <reason>`, and every registered hook exists and is executable | exit 0; commit proceeds |
| scanned | failed | a hook script exists on disk but is registered nowhere (orphan), or a registered hook is missing or not executable | `--strict` promotes the orphan class from WARN to FAIL; exit 1, commit rejected |

**Why the gate is path-scoped:** the selftest scans every hook under `.claude/hooks/` and every settings file across the shared-hook repos, so running it on every commit is wasteful. The path regex fires it only when a change could move the registry out of sync with disk.

**Bug context (2026-07-25, eea0436ce):** before this wiring the selftest existed but ran only when invoked by hand. Its orphan class emitted WARN and exited 0, so a dead hook (on disk, registered nowhere) could sit indefinitely without blocking anything; the placebo-test class from the audit was the motivating case. `--strict` was added in the same commit: under the lenient default the orphan class stays WARN (manual runs stay non-blocking), under `--strict` (used by pre-commit) orphans fail.

**Coverage:** the selftest is mutation-verified. Dropping a fake orphan hook (`cfn-MUTATION-FAKE-ORPHAN.sh`) into `.claude/hooks/` fails `--strict` and warns under the lenient default; removing it restores green. The pre-commit gate is meta-confirmed: committing the gate itself triggered it.

---

## Prompt Optimizer Run (prompt-optimizer engine)

**Entity:** one `execute.sh <target-id>` run of the shared engine (`engine/optimize.ts`).

**States:** `no_plugin | unknown_target | baselining | iterating | holdout_gate | holdout_skipped | accepted | refused_overfit | refused_inconclusive | aborted | reported`

| From | To | Trigger | Guard |
|------|----|---------|-------|
| (start) | no_plugin | no `<cwd>/.claude/prompt-optimizer/config.json` | terminal, exit 0 — the shared skill is inert in projects with no plugin |
| (start) | unknown_target | target id absent from config.json | terminal, exit 1 |
| (start) | baselining | plugin + target resolved | train baseline eval, then holdout baseline x `holdoutRepeatCount` |
| baselining | aborted | budget exhausted, or a baseline eval aborted (<50% fixtures ran) | tri-state no-run guard (FIX #2) |
| baselining | iterating | baselines measured | `holdoutRepeatCount` = `--holdout-repeats` when nondeterministic, else 1 |
| iterating | iterating | candidate rejected, mutate failed, or candidate eval failed | L11: a transient provider error excludes the fixture (or the iteration), never kills the run |
| iterating | iterating | candidate accepted | `isImprovement`: per-category, ran-count floor (L9), cost-Pareto tie-break |
| iterating | holdout_gate | loop ends (max-iters / patience / budget) AND final template != baseline | a candidate was accepted at some point |
| iterating | holdout_skipped | loop ends AND final template === baseline | L12: nothing to validate; baseline measurement IS the final measurement, no second paid pass |
| holdout_gate | accepted | deterministic: final total <= baseline total. Nondeterministic: final beats baseline on EVERY repeat | winning template persisted, prior template backed up first (L1) |
| holdout_gate | refused_overfit | deterministic: final total > baseline. Nondeterministic: regressed on EVERY repeat | baseline template retained; nothing persisted |
| holdout_gate | refused_inconclusive | `aborted` — a holdout pass aborted; or `mixed-repeats` — regressed on some repeats but not others | the win is inside the noise floor; baseline retained |
| holdout_skipped | reported | — | `holdoutFinalSkippedUnchanged: true`; never labeled OVERFIT or INCONCLUSIVE (nothing was proposed) |
| accepted / refused_overfit / refused_inconclusive | reported | run report written to `runs/<target-id>-<ISO>.md` | terminal |

**Refusal invariant:** `refused_overfit`, `refused_inconclusive`, and `holdout_skipped` all leave the template file byte-identical to the seed, write no backup, and skip the `--apply` source patch. Proven live for all three refusal outcomes — see `planning/RIGS_refusal_paths_live.md`.

## Workbench Watcher (cfn-workbench watch.sh)

**Source:** `.claude/skills/cfn-workbench/watch.sh` (pidfile `/tmp/cfn-workbench-watch-<slug>.pid`)

### States

`not-running | running | stale-pid`

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| not-running | running | start invocation (default mode) | pidfile written with live pid; loop daemonized (disown). Idempotent: start while running exits 0 without a second loop |
| running | running | tick every `--interval` secs | re-renders only when the source-glob fingerprint hash changed; render failure logged WARN, loop survives |
| running | not-running | `--stop` | SIGTERM, SIGKILL after ~2s if still alive; pidfile removed. `--stop` with nothing running still exits 0 |
| running | stale-pid | watcher process dies without `--stop` | pidfile remains but `kill -0` fails |
| stale-pid | running | next start invocation | stale pidfile detected and replaced with the fresh pid |

```
not-running --start--> running --tick--> running
     ^                    |  \
     |                 --stop  process death
     +---(stop)---------/       \
     ^                           v
     +----(next start)------ stale-pid
```

## Roster Lane (cfn-workbench section-roster)

**Source:** `planning/run-plan-<slug>.json` `lanes[]`, joined at render time against `/tmp/lane-report-<slug>-*-<id>.json` (and `<root>/tmp/`) plus `cfn-events-<slug>.jsonl`

### States

`pending | in-flight | landed`

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| pending | in-flight | `lane_spawned` event for the lane id | no lane-report file and no `lane_landed` event yet; Since column = event ts (HH:MM) |
| in-flight | landed | lane-report file appears OR `lane_landed` event | file glob matches lane id suffix in either tmp scan path |
| pending | landed | lane-report file appears with no spawn event | derivation is stateless per render; a lane can skip in-flight if events were never emitted |

```
pending --lane_spawned--> in-flight --report/landed event--> landed
    \_______________________report file________________________/
```

## Runtime Link Target (link-runtime-dirs.sh)

**Source:** `.claude/cfn-scripts/link-runtime-dirs.sh` (`RUNTIME_DIRS` list, one pass per entry); verified by `tests/test-link-runtime-dirs.sh`

Each of the 14 `~/.claude/<dir>` entries is classified independently on every run.
The links are load-bearing: without them every `$HOME/.claude/skills/cfn-*`
invocation fails outside this repo.

### States

`absent | linked | mislinked | occupied-file | occupied-empty-dir | occupied-populated-dir | refused`

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| absent | linked | run without `--check` | parent `~/.claude` exists or is created first |
| absent | absent | run with `--check` | check mode never writes; reports the entry as missing and exits non-zero |
| linked | linked | any run | readlink already resolves to the repo path; reported `ok`, no write |
| mislinked | linked | run without `--check` | existing symlink points elsewhere; old target recorded in the backup dir, then relinked |
| occupied-file | linked | run without `--check` | real file moved to `~/.claude-runtime-links-backup-<ts>/`, never deleted |
| occupied-empty-dir | linked | run without `--check` | `rmdir` succeeds, so nothing is discarded |
| occupied-populated-dir | refused | run without `--force` | refuses and exits non-zero rather than risk data loss; the dir is left untouched |
| occupied-populated-dir | linked | run with `--force` | whole dir moved to the timestamped backup dir first |
| refused | linked | re-run with `--force` | operator has seen the refusal and opted in |

```
absent ─────────────────────────────> linked <──── mislinked
occupied-file ──backup+replace───────>   ^
occupied-empty-dir ──rmdir───────────>   |
occupied-populated-dir ──no --force──> refused ──--force+backup──┘
```

`~/.claude/agents` is deliberately not in this set: it stays a real directory so
project-local agents survive, and only `agents/cfn-dev-team` is linked.

## Terse-Output Mode (caveman plugin flag)

**Source:** `~/.claude/.caveman-active` written by `caveman-activate.js` (SessionStart) and `caveman-mode-tracker.js` (UserPromptSubmit); rules in `.claude/global/CLAUDE.md` "Terse-Output Mode Carve-Out"; verified by `tests/test-caveman-carveout.sh`

Documented here because the lifecycle is counter-intuitive in one specific way:
turning terse mode off is not sticky. The flag is re-armed from config at the
start of every session and after every compact, so "stop caveman" buys silence
for the rest of one session and nothing more. Only the config file or the
`CAVEMAN_DEFAULT_MODE` env var survives a restart.

### States

`off | active-lite | active-full | active-ultra | independent`

`independent` covers the commit, review and compress skills, which define their
own behaviour and suppress the per-prompt reminder.

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| any | active-<level> | SessionStart, including after a compact | resolved mode is not `off`; flag written, 1,847-byte ruleset injected |
| any | off | SessionStart | resolved mode is `off` from env or config; flag unlinked, nothing injected |
| off | active-<level> | prompt matches activate/enable/turn on/start/talk like + caveman | no stop word in the same prompt |
| active-<level> | active-<other> | `/caveman lite\|full\|ultra` | argument is a valid mode |
| active-<level> | independent | `/caveman-commit`, `/caveman-review`, `/caveman-compress` | skill defines behaviour; per-prompt reminder suppressed |
| active-<level> | off | prompt matches stop/disable/deactivate/turn off + caveman, or "normal mode" | flag unlinked; takes effect from the next prompt |
| active-<level> | active-<level> | any other prompt | 121-byte reminder injected because the flag reads back as a valid mode |
| off | off | any prompt | flag absent, so `readFlag` returns null and nothing is injected |

```
                  SessionStart / compact (mode != off)
      ┌──────────────────────────────────────────────┐
      │                                              v
    off <──stop caveman / normal mode──── active-{lite,full,ultra}
      │                                     │      ^
      └──"activate caveman"─────────────────┘      │
                                                   v
                              independent {commit, review, compress}
```

Resolution order for the mode is `CAVEMAN_DEFAULT_MODE`, then
`~/.config/caveman/config.json`, then `full`. A malformed, oversized, or
symlinked flag file reads back as null and is treated as `off`, so a tampered
flag can never inject arbitrary bytes into model context.

## Content Path Containment (security-utils.sh validate_file_path)

**Source:** `.claude/skills/cfn-knowledge-base/lib/workflow/lib/security-utils.sh:183`
(`validate_file_path`); callers
`.claude/skills/cfn-knowledge-base/lib/workflow/deploy-approved-skill.sh:154` and
`.../propagate-skill-update.sh:189`.

The traversal guard in front of skill deployment. A caller-supplied content path
is resolved to absolute form and then judged against an allowed base directory.
Both the resolve step and the judgement can reject.

The base is the invoking project (`CONTENT_BASE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"`),
not a `BASH_SOURCE`-derived CFN root. The content path defaults to a cwd-relative
`./.claude/skills-database/skills.db`, so it belongs to the project that invoked
the skill; a CFN-rooted base rejected that path outright whenever the skill ran
from anywhere other than the CFN checkout.

### States

| State | Meaning |
|-------|---------|
| `submitted` | A path and a base directory have been supplied, neither resolved yet. |
| `unresolvable` | `readlink -f` failed on the path or on the base. Terminal, rejected. |
| `resolved` | Both sides are absolute and canonical, ready to compare. Symlinks are already followed, so a link is judged by its target. |
| `contained` | The resolved path equals the base or sits beneath it on a path-separator boundary. Terminal, accepted. |
| `escaped` | The resolved path lies outside the base. Terminal, rejected. |

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| `submitted` | `unresolvable` | `readlink -f "$file_path"` fails | path does not exist or cannot be canonicalised |
| `submitted` | `unresolvable` | `readlink -f "$base_dir"` fails | base does not exist |
| `submitted` | `resolved` | both `readlink -f` calls succeed | - |
| `resolved` | `contained` | boundary comparison passes | `abs_path` equals `abs_base`, or `abs_path` matches `abs_base/*` |
| `resolved` | `escaped` | boundary comparison fails | anything else, including a sibling whose name merely begins with the base |
| `contained` | - | returns 0 | caller proceeds with deployment |
| `escaped` | - | returns 1 | caller exits 1 |
| `unresolvable` | - | returns 1 | caller exits 1 |

```
submitted ──readlink fails──> unresolvable ──> reject
    |
    └──both resolve──> resolved ──on boundary──> contained ──> accept
                          |
                          └──off boundary────> escaped ────> reject
```

The boundary condition is the whole point. The check previously compared with a
bare prefix (`=~ ^"$abs_base"`), which admitted a sibling directory whose name
started with the base: base `/srv/app` accepted `/srv/app-evil/payload`. The
comparison now requires either equality or a following `/`, so `resolved` moves
to `escaped` in that case. Covered by `tests/security/test-path-containment.sh`.
