---
description: "Execute CFN Loop in Task Mode with direct agent spawning (visible in main chat)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--max-iterations=n]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "Grep", "Glob"]
---

# CFN Loop Task Mode

**You are the coordinator. You MUST execute this loop until PROCEED or max iterations.**

---

## STEP 0: VERIFY MANIFEST (run before anything else)

**Where planning artifacts live.** `/cfn-megaplan` and `/cfn-megaplan-lite` write every artifact of one plan into that plan's own directory, `planning/<slug>/`. Plans written before that layout sit flat in `planning/`. Resolve every planning file through the shared resolver, which checks nested first and falls back to flat — never hand-roll the two-layout probe:

```bash
PP=$HOME/.claude/skills/cfn-megaplan/lib/plan-paths.sh
PDIR=$("$PP" dir "$SLUG")                                        # planning/<slug> — where run outputs go
VERIFY_FILE=$("$PP" resolve "$SLUG" "VERIFY_${SLUG}.md")  || VERIFY_FILE=""   # "" = not megaplanned
PLAN_FILE=$("$PP"   resolve "$SLUG" "PLAN_${SLUG}.md")    || PLAN_FILE=""
```

`$PDIR` is also where this run writes its own outputs (`VERIFY_RESULTS_<run-id>.json`, `run-plan-<run-id>.json`), so a plan's inputs and its run artifacts stay in one directory.

Step 0: If `$VERIFY_FILE` is non-empty (a `VERIFY_<slug>.md` resolved for this task), parse its JSON manifest (the LAST fenced ```json block in the file). The loop's final completion decision is the Phase 5 Exit gate (5E.0-5E.5): it is driven mechanically by `verify-run.sh` against this manifest, never by prose. Refuse to report done unless that gate reports all-green (or an explicit user-approved quarantine). If the file does not exist, proceed without it (task was not megaplanned).

### Step 0a: Manifest integrity (W2, run when VERIFY exists)

The VERIFY manifest is the done authority, so confirm it is byte-identical to the Bar A-blessed version before running any check against it.

```bash
# Recompute the hash of the VERIFY file and compare to the sidecar megaplan wrote.
# The sidecar always sits beside its manifest (bless-verify derives it from the file's own
# directory), so derive it from $VERIFY_FILE rather than resolving it separately.
SIDECAR="$(dirname "$VERIFY_FILE")/.$(basename "$VERIFY_FILE" .md).sha256"
if [ -f "$SIDECAR" ]; then
  ACTUAL=$(sha256sum "$VERIFY_FILE" | cut -d' ' -f1)
  EXPECTED=$(cut -d' ' -f1 < "$SIDECAR")
  # If ACTUAL != EXPECTED -> REFUSE. See below.
else
  # Missing sidecar = pre-hash-era manifest. WARN only, continue.
  echo "WARN: no ${SIDECAR}; VERIFY predates the integrity hash. Proceeding without integrity check."
fi
```

- **Match:** proceed normally.
- **Mismatch:** REFUSE to run. The VERIFY manifest was edited since Bar A blessed it, which can silently move the goalposts. Run `$HOME/.claude/skills/cfn-megaplan/bars/bless-verify.sh "$VERIFY_FILE" --note "<why>"` (the only bless path; it refuses on any static finding) and read the ledger entry it appends: `changed[]`, `predicate_changed`, and the `regate` scope. Then surface via `AskUserQuestion` (one decision):
  - **Do the scoped re-gate the ledger owes**: exactly what `regate` says: LLM Bar A on the `bar_a_acs` rows + coverage block, Bar B static+structural on the PLAN steps bound to `bar_b_acs`, live probe only if `probe:true`. Default for a one-or-few-row edit. Then continue.
  - **Accept as-is, no re-gate**: legitimate only when `regate.bar_a` is `none` (mechanical fields only). A `predicate_changed: true` accepted with no re-gate is a fabricated green.
  This is the `VERIFY manifest hash mismatch` row in the Stop For table.
- **Missing sidecar:** WARN only and continue (the manifest predates the hash era). Do not block.

Note: `verify-run.sh` (Phase 5) enforces the same hash independently and exits 4 on mismatch, so a manifest edited between Step 0 and Phase 5 is still caught.

### Step 0b: Parse SPEC build flags (W6)

If `$("$PP" resolve "$SLUG" "SPEC_${SLUG}.md")` resolves, parse its `## 8. Build Flags` section into coordinator variables (`db`, `frontend`, etc.). If the section is absent (or the SPEC file is missing), treat EVERY flag as `no`. These flags drive the Phase 4 gate-wiring matrix (Step 4.0).

### Step 0c: Pre-flight readiness (one script, never grep the plan by hand)

Answers "what in this plan still needs a human before the loop starts": open escalations, unresolved forks, parked items, defects reported-not-patched, open blocking deferrals, missing required artifacts. It is a section scan, not a keyword grep — a heading qualified as answered/resolved/decided is excluded, so `grep -i open` cannot substitute for it.

```bash
BARS=$HOME/.claude/skills/cfn-megaplan/bars
"$BARS/preflight.sh" --plan-dir "$PDIR" --slug "$SLUG"; PF_RC=$?
```

- **Exit 0** — clear. Proceed to Phase 1.
- **Exit 1** — the report lists every open item, capped at 8 per section with the true count. Resolve or explicitly accept each one via `AskUserQuestion` (one decision per item), record the answers in `DECISIONS_<slug>.md`, then re-run the script. Do NOT start Phase 2 with open blocking deferrals: they become gate failures at Phase 5.
- **Exit 2** — bad `--plan-dir`. Re-resolve with `plan-paths.sh` before retrying.

Do not answer this question by reading SPEC/DECISIONS/PLAN yourself. Measured 2026-08-20: a coordinator spent ~41k context tokens and 26 bash calls doing exactly that, one grep alone returning 7.1k tokens. The script's report is under 3KB. Add `--json` when you need the fields (`open_sections[]`, `open_blocking_deferrals`, `missing_artifacts[]`) instead of the human report.

---

## TOOL INITIATION FAILURE CAPTURE (global log)

Only when a CFN tool fails to even START (bash 126/127, an agent `Task` that
returns no JSON block, a hook that never runs): read
`$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/tool-failure-capture.md` and log the failure as it specifies,
then continue the loop. A tool that ran and returned a failure is not this.
## ⚡ AUTONOMOUS PROGRESSION (CRITICAL)

**DO NOT stop to ask questions. Keep progressing by launching agents for next steps.**

This table is the SINGLE SOURCE OF TRUTH for escalation. No other escalation list exists in this file.

| Stop For (escalate to user) | Keep Going For |
|----------|----------------|
| Major regression (tests went from passing to failing) | Minor test failures (iterate to fix) |
| Structural mismatch (wrong architecture/framework) | Missing files (create them) |
| Security vulnerability found | Code style issues |
| Corrupted state requiring manual recovery | Ambiguous implementation details |
| Unclear requirements (feedback for epic improvement) | |
| Access denied / permission errors | |
| Irreversible destructive action needed | |
| VERIFY manifest hash mismatch (Step 0a / verify-run.sh exit 4) | |

**Rules:**
- If uncertain about approach, pick the simpler option and iterate
- Spawn agents to investigate unknowns instead of asking user
- Only escalate to user for the rows in the Stop For column above
- Test failures are expected - that's why we iterate

---

## 🎯 0/0 POLICY (POINTER)

The 0/0 policy (zero compile errors in scoped work and scoped tests, zero remaining scoped todos) is enforced mechanically in **Phase 3, Step 3.0** below. Do not run a separate check here; Phase 3 is the enforcement point.

---

## MANDATORY: Initialize State Tracking

**IMMEDIATELY create this todo list using TodoWrite:**

```
1. [pending] Parse arguments and initialize task
2. [pending] LOOP 3: Full epic implementation (all phases, TDD)
3. [pending] GATE CHECK: hygiene scan + tests + gate-check.sh (baseline/flaky)
4. [pending] GATE WIRING + VOTE: resolve gate set, hard gates, cfn-vote-implement per manifest
5. [pending] EXIT GATE: 1/3 batched prompts + 5E.0-5E.5 mechanical VERIFY gate + 5E.6 run ledger
```

**You MUST update todo status as you complete each phase. Do NOT skip phases.**

---

## THE LOOP (Execute Until Done)

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE A - IMPLEMENTATION (iterate until gate passes):      │
│    ITERATION = 1                                            │
│    WHILE iteration <= MAX_ITERATIONS:                       │
│      ├── LOOP 3: Spawn impl agents in dependency waves      │
│      │     (produce/consume edges; ≤LANE_CAP=8 per slot;    │
│      │      cheap producer guard between waves; full epic)   │
│      ├── GATE CHECK: typecheck + hygiene + gate-check.sh    │
│      │     (baseline from iter 2; flaky re-run on red)      │
│      │     ├── IF gate FAILS: iteration++, LOOP             │
│      │     └── IF gate PASSES: BREAK to Phase B             │
│      └── END WHILE                                          │
│                                                             │
│  PHASE B - GATE WIRING + VOTE VERIFICATION:                 │
│    ├── 4.0 resolve gate set from SPEC build flags + diff    │
│    ├── 4.1 hard gates first (migration-rehearsal)           │
│    ├── 4.2 /cfn-vote-implement per manifest (explicit path) │
│    │     ├── 3/3 votes: auto-implement immediately (TDD)    │
│    │     ├── 2/3 votes: spawn product-owner to decide       │
│    │     ├── 1/3 votes: queue for batched user prompts      │
│    │     └── 0/3 votes: skip silently                       │
│    └── AskUserQuestion (4 per batch) on 1/3 queue           │
│                                                             │
│  PHASE 5 EXIT GATE (mechanical; MAY iterate to Phase 2):    │
│    ├── 5E.0 mutation spot-check (per core FR, cap 3)        │
│    ├── 5E.1 verify-run.sh run                               │
│    ├── 5E.2 resolve needs_agent / predicate_unverified rows │
│    ├── 5E.3 verify-run.sh summary (exit 0 done / 1 iterate  │
│    │        back to Phase 2 / 4 Stop For)                   │
│    ├── 5E.3a backfill evidence + bless --stage exit         │
│    ├── 5E.4 all-green final gate (--threshold 1.0)          │
│    ├── 5E.4a deferrals.sh gate (no open blocking needs)     │
│    ├── 5E.5 prod-build smoke (frontend + build script)      │
│    └── 5E.6 run ledger row + FLAG lines (never gates)       │
│                                                             │
│  EXIT - Phase 5 gate all-green (or user-approved quarantine)│
└─────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: Parse Arguments

**Mark todo #1 as in_progress, then execute:**

```bash
# Parse from $ARGUMENTS
MODE="standard"  # or mvp, enterprise
MAX_ITERATIONS=10
TASK_ID="cfn-task-$(date +%s)-${RANDOM}"
ITERATION=1
# Single stable key for every loop-written output this run (test outputs, lane
# reports, VERIFY_RESULTS) so cfn-workbench --slug finds them all. SLUG is set
# by megaplan context; unset in task mode -> RUN_ID == TASK_ID.
RUN_ID="${SLUG:-$TASK_ID}"
```

**Thresholds:** the single source of truth is `.claude/skills/cfn-loop-orchestration-v2/THRESHOLDS.md`. Values reproduced here for convenience; if they ever disagree, THRESHOLDS.md wins.

| Mode | test_pass_rate_gate | consensus | max_iter |
|------|---------------------|-----------|----------|
| mvp | 0.70 | 0.80 | 5 |
| standard | 0.95 | 0.90 | 10 |
| enterprise | 0.98 | 0.95 | 15 |

**Gate uses test_pass_rate_gate as a decimal (standard = 0.95). Confidence gates apply only to CLI mode; ignore them here.**

Planning tier vocabulary is mvp|beta|enterprise (cfn-megaplan); execution mode vocabulary is mvp|standard|enterprise. Tier `beta` maps to mode `standard`.

**Open the workbench dashboard (loop start).** Render once and open it in the browser. `--live 10` makes the open tab re-read the file every 10s. Then start the watcher: it re-renders on data change so the open tab (meta-refresh) stays live between phase boundaries; the phase-boundary re-renders at end of Phase 2 / Phase 3 / Phase 5 remain as belt-and-suspenders. `--open` is marker-tracked (idempotent): only this first call launches a browser. The workbench is a reporting artifact, so a render/watcher failure is non-blocking. Finally emit the `loop_started` event for the workbench events feed.

```bash
$HOME/.claude/skills/cfn-workbench/render.sh --slug "$RUN_ID" --open --live 10 \
  || echo "WARN: workbench render/open skipped (non-blocking)" >&2
$HOME/.claude/skills/cfn-workbench/watch.sh --slug "$RUN_ID" --interval 10 \
  || echo "WARN: workbench watcher not started (non-blocking)" >&2
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event loop_started || true
```

**Mark todo #1 as completed. Proceed to Phase 2.**

---

## PHASE 2: LOOP 3 - Full Epic Implementation

**Mark todo #2 as in_progress.**

**Scope:** Spawn agents to implement the **entire epic** (all phases of the plan) in one pass, not a single sprint slice. TDD throughout.

### LANE DERIVATION (one script, never derive by hand)

1. **Locate the plan.** Use `$PLAN_FILE` from Step 0 (`plan-paths.sh resolve "$SLUG" "PLAN_${SLUG}.md"` — the plan dir `planning/<slug>/` first, legacy flat `planning/` second). If the slug is not known exactly, `$HOME/.claude/skills/cfn-megaplan/lib/plan-paths.sh newest 'PLAN_*.md'` returns the newest `PLAN_` across both layouts; confirm its name matches the task slug. If no `PLAN_` file resolves, STOP and run `/write-plan` first. Never improvise lanes without a plan. **Note:** a `MEGAPLAN_<slug>.md` is an index/summary, NOT a lane source — if only `MEGAPLAN_` (and/or `VERIFY_`) exists but no `PLAN_<slug>.md`, the megaplan run failed to persist its plan; run `/write-plan "<task>" --mode=<mode>` to regenerate `PLAN_<slug>.md` from the other artifacts in that plan dir, then continue. Do NOT derive lanes from `MEGAPLAN_` or `VERIFY_`.
2. **Derive lanes and waves mechanically.** One call, ~40ms. Steps 2-6 of the old hand-derivation (one lane per phase, LANE_CAP merge, wide-phase file-cluster split, exclusive file ownership, produce/consume edges, cycle merge, topological waves) live in `derive-lanes.sh`. Measured 2026-08-20: deriving this in chat for a 165-step plan cost ~53k context tokens across 14 ad-hoc python heredocs and produced a lane set whose co-writers would have raced on one file. Do NOT re-derive, re-cluster, or "fold" lanes in the conversation. If the output looks wrong, the plan is wrong.

```bash
LANES_JSON="${PDIR}/lanes-${RUN_ID}.json"
BARS=$HOME/.claude/skills/cfn-megaplan/bars
# Static gate first: bad Produces/Consumes metadata would mislead wave ordering.
"$BARS/check-produce-consume.sh" "$PLAN_FILE" >/dev/null || {
  echo "BLOCKED: fix the produce/consume findings before deriving lanes" >&2; }
"$BARS/derive-lanes.sh" "$PLAN_FILE" > "$LANES_JSON"; DERIVE_RC=$?
echo "derive rc=$DERIVE_RC"
jq -r '.separability | "critical path \(.critical_path_steps)/\(.total_steps) steps (\(.parallel_speedup)x), longest lane \(.longest_lane_steps), lanes \(.lanes), waves \(.waves)"' "$LANES_JSON"
jq -r '.waves | to_entries[] | "wave \(.key+1): \(.value|join(", "))"' "$LANES_JSON"
```

3. **Act on the exit code.** `0` = lanes ready, spawn `.waves` in order (each wave slot is already capped at LANE_CAP, spawn a slot only after the previous one reports). `1` = `.blockers[]` holds duplicate-producer findings (the same identifier Produced in two lanes): surface ONE `AskUserQuestion` for ownership, patch the plan, re-run the script. Never guess ownership. `2` = usage / unparseable plan: fix the path or the step tables; hand-derivation is not the fallback.
4. **Honour the separability advisory.** If `.separability.advisory` is non-null the plan is not lane-separable: too many steps write the same files, so the longest lane is more than twice the step cap. Surface one `AskUserQuestion` (re-run `/write-plan` with phase-local file sets, or accept the serial run) before spawning. Do NOT invent extra lanes to make it look parallel: two lanes that write one file inside one wave slot race and lose writes. `.hubs[]` names the files responsible.
5. **Ownership clause in every spawn prompt.** Each spawn prompt includes: "FILES YOU OWN: <lane .files>. FILES YOU MAY READ BUT NOT OWN: <lane .shared_files>. Do not create or edit any file outside this list. Files outside your lane needing changes go in out_of_scope_needs (array of \"path: why\"); blocked_on is only for a blocker that stops YOUR lane (scalar, one sentence, else null). You may amend HOW a step is built (same files, same AC, same done predicate) and record it in step_amendments; you may not amend WHAT."
6. **Looser ownership modes (opt-in only).** `--hub-split` gives one hub file a single owner lane; `--soft-ownership` does that for every co-written file and chains the co-writers so they never share a wave slot. Both loosen the exclusive-ownership invariant, which means two agents edit one file in different waves. Measured on the same 165-step plan: strict 1.0x, `--hub-split` 1.0x, `--soft-ownership` 1.14x. Not worth it by default. Use only after the advisory fires and the user opts in.

### Bounded step amendment (sanctioned adaptation, no re-gate)

A lane MAY change HOW a step is built without stopping when all three hold:
same files (inside its owned list), same AC binding, same Done predicate and
Verify command. It records each one in `step_amendments`. Anything outside that
box is not an amendment: another file goes in `out_of_scope_needs`, a different
AC or predicate goes in `blocked_on: "plan drift: <one sentence>"`. A lane never
edits `PLAN_` or `VERIFY_` itself.

Full contract and rationale: `$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/step-amendment.md`.
### Write the run plan (workbench roster input)

With lanes and waves derived (step 6), persist the lane roster so the workbench roster section can track lane status, then emit `phase_started`. Lane id = the lane name from the plan. Non-blocking.

```bash
mkdir -p "$PDIR"
jq -n --arg slug "$RUN_ID" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson lanes "$(printf '%s\n' ${LANE_IDS} | jq -R . | jq -s 'map({id: ., name: ., phase: "Phase 2"})')" \
  '{slug: $slug, generated_at: $ts, phases: ["Phase 2"], lanes: $lanes}' \
  > "${PDIR}/run-plan-${RUN_ID}.json" \
  || echo "WARN: run-plan write skipped (non-blocking)" >&2
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event phase_started --phase 2 || true
```

### Spawn implementer agents in waves using Task tool (one per lane)

Iterate the waves from step 6 in order. For each wave: spawn its lanes in parallel (single message, one Task per lane, up to LANE_CAP), using the prompt below. A single-wave plan (empty edge set) is the common case and spawns exactly once — identical to prior behavior.

**`${PRIOR_LEARNINGS_BLOCK}` (cross-wave learning channel).** Wave 1 and single-wave plans: empty string (omit the block entirely). Later waves and repair respawns: collect every completed lane report's `learnings` arrays, dedup (exact string match), keep the 10 most recent, and render:
```
LEARNINGS FROM PRIOR WAVES (hints from other lanes — verify before relying,
they are observations, not plan amendments):
- <learning 1>
- ...
```
Rationale (measured 2026-08-19): one lane debugged an auth.users FK once and reused the insight two steps later; split into 4 lanes, each would have re-debugged it. This channel is the split rule's counterweight. Wave boundaries only — no mid-wave passing; the coordination overhead is not worth it.

Immediately before each lane's Task spawn, emit its spawn event:

```bash
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event lane_spawned --lane "<lane>" || true
```

```
TASK: Full epic implementation, iteration ${ITERATION}: ${TASK_DESCRIPTION}

SCOPE: Complete every phase of the linked plan (${PLAN_FILE})
       assigned to your lane. Do NOT stop after a single sprint.

FILES YOU OWN: ${LANE_FILE_LIST}. Do not create or edit any file outside
this list. Out-of-lane file needs go in out_of_scope_needs ("path: why");
blocked_on only for a blocker stopping YOUR lane (one sentence, else null).

Read ONLY: the plan file, your owned files, and test output excerpts given
to you. Do NOT read other lanes' files, prior iteration transcripts, or any
SKILL.md.

${PRIOR_LEARNINGS_BLOCK}

ADAPTATION: The plan pins WHAT (files, AC binding, done predicate), not HOW.
If a better implementation approach than the step's Change cell keeps the
same files, the same failing test / AC id, and the same done predicate,
take it and record it in step_amendments ({"step","kind":"how","what","why"}).
Do not stop, do not put it in out_of_scope_needs. Anything that needs another
file, a different AC, or a different done predicate is NOT an amendment:
other file -> out_of_scope_needs; different AC/predicate -> blocked_on
"plan drift: <one sentence>". Never edit PLAN_ or VERIFY_ files.

REQUIREMENTS:
1. Write failing tests FIRST (TDD red phase) for every acceptance criterion
2. Implement to satisfy tests (green phase)
3. Refactor for DRY / quality (refactor phase)
4. Run ONLY your own test files: npx vitest run <your-test-files> --reporter=verbose
   Never run `npm test` or any repo-wide test command.
5. Report exactly this JSON as the last block of your output:
   {"lane": "<lane>", "tests_written": N, "scoped_tests_passed": N, "scoped_tests_total": M, "files_modified": [], "phases_complete": [], "out_of_scope_needs": [], "step_amendments": [], "learnings": [], "blocked_on": null | "<one sentence>", "tests_removed_reason": null | "<why you intentionally removed or renamed tests>", "confidence": 0.0}
   `step_amendments` items: {"step": "<plan step #>", "kind": "how", "what": "<one sentence: what differs from the Change cell>", "why": "<one sentence>"}; empty array when none.
   `learnings`: max 5 one-line strings, ONLY cross-cutting facts another lane
   would otherwise re-discover the hard way: schema/environment/tooling gotchas
   ("auth.users FK needs ON DELETE CASCADE via public.profiles", "vitest needs
   --pool=forks under WSL2"). NOT code style, NOT progress notes, NOT anything
   the plan already states. Empty array when none — most lanes have none.
   Set `tests_removed_reason` to a non-null string ONLY when you deliberately deleted or renamed existing tests (e.g. consolidated a duplicated suite); leave it null otherwise. The coordinator uses it to distinguish an intentional suite shrink from an accidental one (Phase 3, W3 baseline check).

AGENT_ID: loop3-impl-${TASK_ID}-iter${ITERATION}-<lane>
```

**WAIT for the wave's agents to complete and aggregate results.** As each lane's trailing JSON block is saved to `/tmp/lane-report-${RUN_ID}-<lane>.json` (the file Step 3.01 reads), emit its landing:

```bash
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event lane_landed --lane "<lane>" || true
```

**Inter-wave producer guard (only when a NEXT wave exists).** Before spawning the next wave, cheaply confirm the just-completed wave actually created what downstream lanes consume: for each `Produces` identifier a later wave `Consumes`, assert it now resolves — `npm run typecheck` scoped to those files, or `grep -RnF "<symbol>"` on the produced path. This is NOT the full Phase-3 gate (no test suite, no gate-check.sh); it is a symbol-existence check so a consumer wave never builds on an absent export. If a claimed symbol is missing, respawn ONLY the producing lane with that as the finding, re-run the guard, then proceed. When no further wave exists, skip the guard — the full Phase-3 gate below covers it.

**After the final wave completes, aggregate all waves' results.**

**Re-render the workbench dashboard** with this iteration's implementation progress (lane reports now on disk). Same tab refreshes via the `--live` meta from Phase 1; `--open` no-ops (marker already set).

```bash
$HOME/.claude/skills/cfn-workbench/render.sh --slug "$RUN_ID" --open --live 10 \
  || echo "WARN: workbench render skipped (non-blocking)" >&2
```

**Mark todo #2 as completed. Proceed to Phase 3.**

---

## PHASE 3: GATE CHECK (Mandatory Before Loop 2)

**Mark todo #3 as in_progress.**

**The coordinator's test run is the ONLY authoritative pass rate; ignore agent-reported numbers for the gate.** Agent JSON (`scoped_tests_passed`) is progress telemetry only.

### Step 3.0: Typecheck gate (0/0 policy enforcement)

```bash
npm run typecheck 2>&1 | tee /tmp/tsc-${TASK_ID}.txt
TSC_ERRORS=$(grep -c "error TS" /tmp/tsc-${TASK_ID}.txt || true)
```

- If `TSC_ERRORS` > 0: the gate FAILS regardless of test pass rate. Compile errors mean zero tests actually ran. Do not compute a pass rate. Iterate (go back to Phase 2) with the tsc output as feedback.
- Also confirm all scoped TodoWrite items are completed before PROCEED; unfinished scoped todos mean ITERATE.

### Step 3.01: Deferral capture (S006, origin: ROOTCAUSE_mpa_thread_wiring_gap.md)

Persist every lane's `out_of_scope_needs` from Phase 2 before any gate computes
a verdict. This is the fix for the exact gap that shipped MP-A's thread feature
81/81 green while unreachable from `src/index.ts`: the implementer correctly
flagged the unfinished cross-lane wiring step in `out_of_scope_needs`, and
nothing downstream ever read it. `out_of_scope_needs` is now a BLOCKING gate
(see agent-prelude.md §5), not prose — this step gives it a persistence
surface; the Phase 5 gate (5E.4a) is what enforces it.

```bash
# One call per lane. Save each lane's trailing JSON block from its Phase 2
# output to a file first, e.g. /tmp/lane-report-${RUN_ID}-<lane>.json.
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
for LANE_ID in ${LANE_IDS}; do
  bash "$CFN_FAILLOG" wrap --tool deferrals.sh -- \
    $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/deferrals.sh record \
    --slug "${SLUG:-$TASK_ID}" --lane "${LANE_ID}" \
    --json "/tmp/lane-report-${RUN_ID}-${LANE_ID}.json"
done
```

Run this every iteration, even when a lane's `out_of_scope_needs` is empty:
`record` REPLACES that lane's prior entries rather than accumulating them, so
a lane that resolved its own deferral and now reports `[]` clears its block
instead of leaving a stale blocker. This step has no pass/fail branch of its
own; the gate lives at Phase 5 (5E.4a).

### Step 3.01a: Amendment + learnings capture (audit only, non-blocking)

Persist every lane's `step_amendments` into this run's plan file so a reviewer can see where the build diverged in HOW from the plan's Change cells. Nothing gates on this: an amendment inside the bounded box (same files, AC, done predicate) is sanctioned. Same pass persists `learnings` (the cross-wave hint channel) so later waves, repair respawns, and the NEXT iteration's wave 1 can inject them. A lane report missing either key counts as empty.

```bash
RUNPLAN="${PDIR}/run-plan-${RUN_ID}.json"
for LANE_ID in ${LANE_IDS}; do
  R="/tmp/lane-report-${RUN_ID}-${LANE_ID}.json"; [ -f "$R" ] || continue
  A="$(jq -c --arg lane "$LANE_ID" --argjson it "${ITERATION}" \
        '[(.step_amendments // [])[] | . + {lane:$lane, iteration:$it}]' "$R" 2>/dev/null || echo '[]')"
  [ "$A" != "[]" ] && [ -f "$RUNPLAN" ] && {
    TMP="$(mktemp)"; jq --argjson a "$A" '.amendments = ((.amendments // []) + $a)' "$RUNPLAN" > "$TMP" && mv "$TMP" "$RUNPLAN"; } \
    || true
  L="$(jq -c --arg lane "$LANE_ID" --argjson it "${ITERATION}" \
        '[(.learnings // [])[] | {lane:$lane, iteration:$it, text:.}]' "$R" 2>/dev/null || echo '[]')"
  [ "$L" != "[]" ] && [ -f "$RUNPLAN" ] && {
    TMP="$(mktemp)"; jq --argjson l "$L" '.learnings = ((.learnings // []) + $l | unique_by(.text))' "$RUNPLAN" > "$TMP" && mv "$TMP" "$RUNPLAN"; } \
    || true
done
```

Review rule for the coordinator (one glance, not a gate): an amendment whose `what` names a different file, AC id, or done predicate was mis-filed and is really `out_of_scope_needs` or `blocked_on: "plan drift"`; treat it as such and re-route. Otherwise proceed.

### Step 3.05: Test-hygiene scan (W3, run BEFORE gate-check)

Before computing any pass rate, confirm no test was silently disabled to game the gate. A skipped/focused test can turn a red suite artificially green.

```bash
# No args = changed test files via git diff. Exit 0 clean / 1 findings / 2 usage.
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
bash "$CFN_FAILLOG" wrap --tool check-test-hygiene.sh -- \
  $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/check-test-hygiene.sh \
  2>&1 | tee /tmp/hygiene-${TASK_ID}.txt
HYGIENE_EXIT=${PIPESTATUS[0]}
```

- **Exit 1 (findings):** gate FAILS. Any `.only(` / `.skip(` / `.todo(` / `fit(` / `xit(` / `xdescribe(` / `xtest(` / `@pytest.mark.skip` / `pytest.skip(` without a same-line `// cfn-allow-skip: <reason>` (or `# cfn-allow-skip:`) suppression marker is iteration fuel. Feed the findings JSON into the retry context and go back to Phase 2. Do NOT compute a pass rate on a hygiene failure.
- **Exit 0 (clean):** proceed to Step 3.1.
- A `cfn-allow-skip` marker is the W4 quarantine representation: a test the user explicitly approved skipping in a prior Phase 5 Exit. Those do not fail the scan.

### Step 3.1: Run tests and check the gate mechanically

```bash
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event gate_started || true

# Run the full suite (coordinator only; agents never do this)
npm test 2>&1 | tee /tmp/test-output-${RUN_ID}.txt

# Baseline (W3): the coordinator carries PREV_TOTAL across iterations. From
# iteration 2 onward, pass --baseline so a shrinking suite is caught.
BASELINE_ARG=""
if [ "${ITERATION}" -ge 2 ] && [ -n "${PREV_TOTAL:-}" ]; then
  BASELINE_ARG="--baseline ${PREV_TOTAL}"
fi

# Mechanical gate check (THRESHOLD from THRESHOLDS.md, e.g. 0.95 for standard)
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
bash "$CFN_FAILLOG" wrap --tool gate-check.sh -- \
  $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/gate-check.sh \
  --out /tmp/test-output-${RUN_ID}.txt \
  --threshold ${THRESHOLD} \
  ${BASELINE_ARG}
GATE_EXIT=$?
```

**Re-render the workbench dashboard (iteration boundary).** The test output and gate verdict for the iteration just completed are now on disk, so this render reflects the current pass rate and gate result. Fires every iteration, pass or fail. Emit the `gate_verdict` event first (pass/total from the gate-check JSON) so this render includes it.

```bash
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event gate_verdict \
  --detail "${PASS_COUNT}/${TOTAL_COUNT} exit ${GATE_EXIT}" || true
$HOME/.claude/skills/cfn-workbench/render.sh --slug "$RUN_ID" --open --live 10 \
  || echo "WARN: workbench render skipped (non-blocking)" >&2
```

**Branch on exit code:**

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | rate >= threshold and total > 0 | Gate PASSED. Record `pass`/`total` from the JSON. Set `PREV_TOTAL=<total>` for the next iteration's baseline. Mark todo #3 completed, go to Step 3.5 then Phase 4 |
| 1 | rate < threshold | Gate FAILED. Run the Step 3.2 flaky re-run FIRST (a green-on-rerun failure is not real). If reds persist: ITERATION++. If ITERATION > MAX_ITERATIONS report failure and EXIT. Else reset todo #2 to pending and go back to Phase 2 with the retry context (see Iteration Context Injection) |
| 2 | no tests detected (0/0) | Gate FAILED. Treat exactly like exit 1. 0/0 never passes |
| 3 | suite shrank (`total < baseline`) | The test suite has fewer tests than the prior iteration. ESCALATE to the user (Stop For) UNLESS a Phase-2 implementer JSON declared a non-null `tests_removed_reason`, in which case accept the shrink, update `PREV_TOTAL`, record the reason in the report, and treat the run per its rate (exit-0/1 logic above) |

The script prints `{"pass":N,"total":M,"rate":R,"passed":true|false}` (plus `baseline` and `shrunk` when `--baseline` is passed). Capture `pass` as PASS_COUNT and `total` as TOTAL_COUNT for the retry template, and carry TOTAL_COUNT forward as `PREV_TOTAL`.

**DO NOT proceed to Phase 4 if the gate failed. ITERATE.**

### Step 3.2: Flaky re-run protocol (W8, only when a test flakes)

Skip unless a failing test passed on a prior iteration with no relevant code change.
In that case read `$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/flaky-rerun.md` and follow it.
### Step 3.5: Harvest Tech-Debt Ledger (Product Owner input)

After the gate passes, inventory the deliberate shortcuts implementers took so the Product Owner decides with debt visible, not hidden:

```bash
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
bash "$CFN_FAILLOG" wrap --tool harvest.sh -- \
  $HOME/.claude/skills/cfn-tech-debt/harvest.sh \
  2>&1 | tee /tmp/cfn-debt-${TASK_ID}.txt
```

- Each `cfn: <ceiling>, <trigger>` marker becomes a ledger row; markers with no trigger are flagged `no-trigger` (rot risk).
- Carry the `<N> markers, <M> with no trigger` line into every `product-owner` 2/3 decision (Phase 4) and the final report (Phase 5). A high `no-trigger` count is a signal to ITERATE or to file backlog items, not silently PROCEED.

---

## PHASE 4: GATE WIRING + VOTE VERIFICATION (replaces Loop 2 validators)

**Mark todo #4 as in_progress.**

**ONLY execute if Gate Check passed AND full epic implementation complete.**

This phase replaces the old Loop 2 validator pattern. Instead of a single free-form review, the coordinator resolves an applicable SET of gates from the build flags and diff, runs any hard exit-code gates first, then routes every gate's suggestion manifest through cfn-vote-implement. Vote agents (correctness / consistency / feasibility) still do the voting; the change is that more than one manifest can feed them.

### Step 4.0: Resolve the gate set

From the SPEC build flags parsed in Step 0b and the working diff, resolve which gates apply:

| Trigger | Gate | Type | Skip behavior |
|---------|------|------|---------------|
| always | `/cfn-dry-review` | manifest | never |
| `db=yes` OR diff touches migrations/auth/HTTP | `cfn-security-review --diff` + spawn a `security-specialist` to populate the skeleton | manifest | never (floor) |
| `db=yes` AND migration files in diff | `cfn-migration-rehearsal --up/--down` | HARD exit-code gate | `CFN_SCRATCH_DATABASE_URL` unset -> WARN-skip in report |
| `frontend=yes` | `cfn-a11y-gate` | manifest | URLs from `CFN_A11Y_URLS`, fallback the `A11y-URLs:` line in `$("$PP" resolve "$SLUG" "OPS_${SLUG}.md")`; unreachable (2s curl probe) -> WARN-skip naming the exact env line. Never auto-start servers |
| `frontend=yes` AND `.claude/skills/role-*/SKILL.md` exists | `cfn-persona-verify` | manifest | no role docs -> silent skip (project never opted in). Validator exit 3 -> WARN-skip naming the failing doc; never verify against a doc that failed its schema. Login creds or `$*_BASE_URL` unset, or target unreachable (2s curl probe) -> WARN-skip naming the exact env var. Never auto-start servers |
| diff touches `package.json`/lockfile/`Cargo.toml`/`requirements*` | `cfn-dep-audit` | manifest | self-contained |
| `CFN_PERF_BENCH_CMD` set | `cfn-perf-gate` | manifest | unset -> silent skip |
| ANY AC in the VERIFY manifest carries a `reference` key | `/cfn-ab-critic --ac <ids>` | manifest | no AC carries `reference` -> silent skip (AC never opted in); reference path/URL missing or unreadable (2s curl probe) -> WARN-skip naming AC+path; unsupported artifact type -> WARN-skip naming type. The executable `check` still owns pass/fail; this is an overlay |

The security-review row is a floor: it runs whenever the trigger fires regardless of mode. The alpha-launch manifest is NOT a separate row: fold it into the always `/cfn-dry-review` row only when the task description contains "release", "launch", or "production readiness". The tech-debt line harvested in Step 3.5 carries through into every product-owner 2/3 decision and the final report.

### Step 4.1: Run hard exit-code gates first

Run the HARD gates (migration-rehearsal) before any manifest gate.

- **migration-rehearsal failure:** treat as a Phase-3-style ITERATE. Feed the rehearsal output as retry context and go back to Phase 2 (counts against MAX_ITERATIONS). Do NOT proceed to the manifest gates on a failed rehearsal.
- `CFN_SCRATCH_DATABASE_URL` unset: WARN-skip in the report (do not fail; the skill refuses to run without an explicit scratch DB and never touches `DATABASE_URL`).

### Step 4.2: Run cfn-vote-implement per manifest (sequential)

Run each manifest gate, then vote on each produced manifest by EXPLICIT path, in this order: security-review -> dep-audit -> dry-review -> perf-gate -> a11y-gate -> persona-verify -> ab-critic (skip any gate not in the resolved set).

**Scoping the persona gate:** run it last, because it drives the live app and is the slowest gate in the set. It must be scoped to this change, never run against every role every time:

- **SPEC present:** pass the FR ids this task implements (`/cfn-persona-verify --fr FR-12,FR-13`). The skill intersects them against each actor's `Touches (FR ids)` in SPEC 1a.
- **No SPEC:** pass the refs in play (`/cfn-persona-verify --ref PR4,C8`).

An unscoped run reports every not-yet-built capability across every role and buries the real findings. A skipped role is named in the report with its reason: a silently skipped role reads as a passing role.

**Blocked is not passed.** The skill reports `blocked` when a check could not run (no seed data, login failed, entry point 404s for an unrelated reason). Carry every `blocked` into the report as-is. A capability that had nothing to click has not been verified, and recording it as a pass is how the gate starts lying.

Only `implementation-wrong` findings enter the manifest and reach the vote. `doc-stale` findings surface as role-doc update proposals for the user to accept or reject, and `not-yet-built` is report-only. Never let this gate write to a role doc: those docs are the ground truth it is checking against, and auto-writing observed behavior into them turns a live bug into "working as designed" permanently.

**Scoping the ab-critic gate:** it runs last because a vision/text compare is the slowest gate and it is scoped to opted-in ACs only. Resolve the AC ids from the VERIFY manifest, not from the whole plan:

```bash
# Extract the LAST fenced json block (same awk as verify-run.sh / bless-verify.sh).
MANIFEST="$(awk '/^```json/{inblock=1;buf="";next} inblock&&/^```/{inblock=0;last=buf;next} inblock{buf=buf$0"\n"} END{printf "%s",last}' "$VERIFY_FILE")"
REF_IDS=$(printf '%s' "$MANIFEST" | jq -r '.acs[] | select(has("reference")) | .id' | paste -sd, -)
[ -n "$REF_IDS" ] && /cfn-ab-critic --ac "$REF_IDS"
```

A manifest with zero `reference` keys resolves ab-critic OUT of the gate set entirely (silent skip, no manifest, no vote call) — the feature is opt-in per AC. This gate is a quality overlay: a blocked, missing, or losing reference never flips the AC's executable `check` to fail. A `block` tag (reference wins at confidence >= 0.9) is a merge-blocker regardless of the vote tally, mirroring persona-verify's block rule.

```bash
# One call per manifest, explicit path. NEVER `latest` when >1 manifest exists.
/cfn-vote-implement <explicit-manifest-path>
```

**NEVER pass `latest` when more than one manifest exists.** `latest` resolves via an mtime glob that silently drops every manifest but the newest, so the other gates' suggestions vanish. Always pass the explicit path per manifest.

**Invalid-pass rule:** a security-review manifest with 0 suggestions AND no `security-specialist` transcript does NOT count as a pass (an empty manifest with no evidence of work is indistinguishable from a gate that never ran). Re-run the security gate with the specialist before accepting.

Each cfn-vote-implement call runs the 3 voting agents in parallel and routes each suggestion by vote count:

| Vote count | Routing |
|------------|---------|
| **3/3** | Auto-implement immediately with TDD (sequential, regression checks between items) |
| **2/3** | Spawn `product-owner` agent (GOAP) to decide IMPLEMENT / DEFER / REJECT |
| **1/3** | Queue for batched user decision at end of run |
| **0/3** | Skip silently |

3/3 items are implemented in-line during the vote pass. 2/3 items consult product-owner one at a time. 1/3 items are collected and surfaced after every other item is resolved.

After each suggestion's patch lands (a 3/3 auto-implement or a 2/3 IMPLEMENT verdict), emit it:

```bash
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event patch_applied --detail "<suggestion id>" || true
```

**FR-7 SITE 1 (Phase 4.2 product-owner 2/3) decisions-ledger capture.** Each 2/3 product-owner verdict is final BEFORE this hook fires. Per resolved 2/3 item, set the per-item variables (`DEC_ID`, `DEC_TITLE`, `DEC_CHOSEN`, `DEC_RATIONALE`, `DEC_ALTS`, `DEC_STATUS`, `DEC_BLOCKING`) and invoke the writer once. Status mapping: `IMPLEMENT -> accepted`, `DEFER -> proposed`, `REJECT -> superseded`. Blocking mapping: `true` if the vote was block-severity, else `false`. `actor=ai` (the product-owner agent resolves 2/3 items). D-8 isolation: the writer's non-zero exit is logged and the loop continues (the decision was made by the product-owner agent; a missing ledger row is a coverage gap, not a wrong decision).

```bash
# FR-7 SITE 1: record the resolved 2/3 product-owner decision (actor=ai, D-8 isolated).
# hook.sh owns the D-8 isolation envelope + per-site marker (DRY across sites 1/2/3).
export RUN_LOG="${RUN_LOG:-/tmp/decisions-ledger-${TASK_ID:-unknown}.log}"
bash $HOME/.claude/skills/cfn-decisions/hook.sh \
    --site phase-4.2-po \
    --slug "${SLUG:-$TASK_ID}" \
    --id "$DEC_ID" \
    --title "$DEC_TITLE" \
    --chosen "$DEC_CHOSEN" \
    --actor ai \
    --rationale "${DEC_RATIONALE:-}" \
    --alternatives "${DEC_ALTS:-}" \
    --status "${DEC_STATUS:-accepted}" \
    --blocking "${DEC_BLOCKING:-false}"
# Loop continues regardless of writer RC (hook.sh always exits 0; D-8 isolation).
```

**Mark todo #4 as completed. Proceed to Phase 5.**

---

## PHASE 5: BATCHED USER PROMPTS + EXIT GATE

**Mark todo #5 as in_progress.**

After cfn-vote-implement has processed all 3/3 (auto-impl) and 2/3 (product-owner) items, collect the queued 1/3 items, resolve them, then run the mechanical Exit gate (5E.0-5E.5).

### Routing

- If the 1/3 queue is empty: proceed straight to the Exit gate (5E.0 onward).
- Else: surface 1/3 items via `AskUserQuestion`, **batched 4 questions per call**, one decision per question, then proceed to the Exit gate.

### Question Format

Each 1/3 item is one AskUserQuestion entry:

- **question**: plain English description of the suggestion + the one supporting vote's reasoning + the two opposing votes' reasoning. End with "Apply this change?"
- **options**: `Apply`, `Skip`, optionally `Defer to backlog`
- **header**: short slug from suggestion ID (e.g. "Extract validator")

**FR-7 SITE 2 (Phase 5 user-batch) decisions-ledger capture.** After each `AskUserQuestion` batch returns AND BEFORE the Apply items are implemented, record every resolved 1/3 item. One writer invocation per item (4 items max per batch per the batched-4 rule). Status mapping: `Apply -> accepted`, `Skip -> superseded`, `Defer -> proposed`. `actor=human` (the user resolves 1/3 items via AskUserQuestion). `blocking=false` (1/3 items are by definition non-blocking per the routing table above). D-8 isolation: the user's choice is honored regardless of ledger state.

```bash
# FR-7 SITE 2: record each resolved 1/3 user-batch decision (actor=human, D-8 isolated).
# Per resolved 1/3 item, set: DEC_ID, DEC_TITLE, DEC_CHOSEN, DEC_RATIONALE, DEC_ALTS, DEC_STATUS
# hook.sh owns the D-8 isolation envelope + per-site marker (DRY across sites 1/2/3).
export RUN_LOG="${RUN_LOG:-/tmp/decisions-ledger-${TASK_ID:-unknown}.log}"
bash $HOME/.claude/skills/cfn-decisions/hook.sh \
    --site phase-5-batch \
    --slug "${SLUG:-$TASK_ID}" \
    --id "$DEC_ID" \
    --title "$DEC_TITLE" \
    --chosen "$DEC_CHOSEN" \
    --actor human \
    --rationale "${DEC_RATIONALE:-}" \
    --alternatives "${DEC_ALTS:-}" \
    --status "${DEC_STATUS:-accepted}" \
    --blocking false
# Repeat per resolved item in the batch; loop continues regardless of writer RC (hook.sh always exits 0; D-8).
```

After each batch returns, implement the `Apply` items with TDD (sequential, same protocol as 3/3 items). Continue until queue is empty.

### Exit gate (mechanical VERIFY gate, ordered 5E.0 -> 5E.5)

**Read `$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/exit-gate.md` now, then execute it in order.**
It holds the full ordered gate: 5E.0 mutation spot-check, 5E.1 mechanical VERIFY
run, 5E.2 needs_agent / predicate_unverified resolution, 5E.3 done verdict,
5E.3a exit-stage evidence backfill and re-bless, 5E.4 all-green final gate,
5E.4a deferral gate, 5E.5 prod-build smoke, the exit report, and 5E.6 run ledger.

The verdict is mechanical: `verify-run.sh` reads the results file it writes, and
prose never substitutes for an exit code. Do not improvise any part of this gate.
## Iteration Context Injection (iteration 2 and later only)

Iteration 1 needs nothing here. Before respawning for iteration N>1, read
`$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/iteration-context.md` and build the injection block it specifies
(verbatim failing-test excerpts, typecheck errors, prior learnings, and the
downstream-dependent respawn rule for lanes with produce/consume edges).
## Worked Example

Abbreviated end-to-end transcript: `$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/worked-example.md`.
Read it only if the phase order below is unclear. A normal run never needs it.
## Quick Reference

| Phase | What Happens | Next If Success | Next If Fail |
|-------|--------------|-----------------|--------------|
| 1. Parse | Initialize vars | → Phase 2 | N/A |
| 2. Loop 3 | Full epic implementation | → Phase 3 | Retry |
| 3. Gate | typecheck + deferral capture (3.01) + hygiene + gate-check.sh (+baseline, +flaky re-run) | → Phase 4 | → Phase 2 (iterate) |
| 4. Gate wiring + Vote | resolve gate set, hard gates first, cfn-vote-implement per manifest | → Phase 5 | → Phase 2 (migration-rehearsal fail) / Re-vote |
| 5. Exit gate | 5E.0 mutation → 5E.1-5E.3 verify-run.sh → 5E.3a evidence backfill + exit bless → 5E.4 all-green → 5E.4a deferrals gate → 5E.5 build smoke → 5E.6 run ledger; 1/3 batched prompts resolved first | EXIT (all-green or quarantine) | → Phase 2 (red AC / surviving mutation / open blocking deferral, bounded by MAX_ITERATIONS) |

**Routing matrix:**

| Vote count | Decision maker | Timing |
|------------|----------------|--------|
| 3/3 | None (auto) | Inline during Phase 4 |
| 2/3 | `product-owner` agent | Inline during Phase 4 |
| 1/3 | User via AskUserQuestion | Phase 5, batched 4 per call |
| 0/3 | None (skip) | n/a |

---

## Reminders (do this / instead of that)

- **After every Loop 3 completion, immediately run Step 3.0 + gate-check.sh before any other action** (never skip the Gate Check).
- **When the gate fails, go straight back to Phase 2 with the retry context** (never start the vote phase on a failed gate).
- **Implement every phase of the plan in Phase 2** (never stop after one sprint).
- **Wrap every CFN CLI tool through `log-tool-init-failure.sh wrap` and `record` any agent/skill/MAX_ITERATIONS that fails to start** (see Tool Initiation Failure Capture). A tool that fails to initiate otherwise vanishes with the summary report; the global log is the only durable trace.
- **Route every review suggestion through cfn-vote-implement** (never manually decide on suggestions).
- **Queue 1/3 items and surface them only after all 3/3 and 2/3 items are resolved** (never prompt the user mid-vote).
- **Ask at most 4 questions per AskUserQuestion call** (tool limit and cognitive load).
- **Treat test failures as iteration fuel: capture excerpts and respawn** (never stop the loop on a test failure).
- **Run the test-hygiene scan before gate-check every iteration** (a `.skip`/`.only` without `// cfn-allow-skip:` is a gate FAIL, not a pass).
- **Pass `--baseline PREV_TOTAL` from iteration 2 onward** (a shrinking suite is exit 3: escalate unless an implementer JSON declared `tests_removed_reason`).
- **In Phase 4, call `/cfn-vote-implement` with an EXPLICIT manifest path per manifest; NEVER `latest` when more than one manifest exists** (the mtime glob silently drops every manifest but the newest).
- **Final done is all-green (`--threshold 1.0`) OR an explicit user-approved quarantine; 0.95 is never a done state** (the mode rate gate is Phase-3 iteration fuel only).
- **Update todos at every phase boundary** (this is the coordinator's state machine).
- **Let the product-owner agent decide 2/3 splits** (no user prompt for those).
- **Record every lane's `out_of_scope_needs` in Step 3.01, every iteration, even when empty** (`deferrals.sh record` replaces, not accumulates — a lane that clears its own deferral must not stay blocked by a stale entry).
- **Run `deferrals.sh gate` at 5E.4a every Phase 5 pass, VERIFY manifest or not** (an open blocking deferral is NOT DONE — this is the S006 fix: a lane correctly flagging a deferred wiring step in `out_of_scope_needs` must block the loop, not just sit in a report nobody reads).

**When to escalate to user:** ONLY the rows in the Stop For column of the AUTONOMOUS PROGRESSION table at the top of this file. That table is the single source of truth; do not maintain a second list.

---

**Version history:** `$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/changelog.md` (read only when editing this skill).