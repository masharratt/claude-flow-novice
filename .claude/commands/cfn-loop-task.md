---
description: "Execute CFN Loop in Task Mode with direct agent spawning (visible in main chat)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--max-iterations=n]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "Grep", "Glob"]
---

# CFN Loop Task Mode

**You are the coordinator. You MUST execute this loop until PROCEED or max iterations.**

---

## STEP 0: VERIFY MANIFEST (run before anything else)

Step 0: If `planning/VERIFY_<slug>.md` exists for this task, parse its JSON manifest (the LAST fenced ```json block in the file). The loop's final completion decision is the Phase 5 Exit gate (5E.0-5E.5): it is driven mechanically by `verify-run.sh` against this manifest, never by prose. Refuse to report done unless that gate reports all-green (or an explicit user-approved quarantine). If the file does not exist, proceed without it (task was not megaplanned).

### Step 0a: Manifest integrity (W2, run when VERIFY exists)

The VERIFY manifest is the done authority, so confirm it is byte-identical to the Bar A-blessed version before running any check against it.

```bash
# Recompute the hash of the VERIFY file and compare to the sidecar megaplan wrote.
VERIFY_FILE="planning/VERIFY_${SLUG}.md"
SIDECAR="planning/.VERIFY_${SLUG}.sha256"
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
- **Mismatch:** REFUSE to run. The VERIFY manifest was edited since Bar A blessed it, which can silently move the goalposts. Surface via `AskUserQuestion` (one decision):
  - **Re-run Bar A**: re-validate the manifest through `check-verifiable-static.sh` + the verifiable-done gate, which re-blesses a fresh hash.
  - **Approve the edit and re-bless the hash**: accept the current VERIFY file as intentional and overwrite the sidecar with the recomputed hash.
  This is the `VERIFY manifest hash mismatch` row in the Stop For table.
- **Missing sidecar:** WARN only and continue (the manifest predates the hash era). Do not block.

Note: `verify-run.sh` (Phase 5) enforces the same hash independently and exits 4 on mismatch, so a manifest edited between Step 0 and Phase 5 is still caught.

### Step 0b: Parse SPEC build flags (W6)

If `planning/SPEC_${SLUG}.md` exists, parse its `## 8. Build Flags` section into coordinator variables (`db`, `frontend`, etc.). If the section is absent (or the SPEC file is missing), treat EVERY flag as `no`. These flags drive the Phase 4 gate-wiring matrix (Step 4.0).

---

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
5. [pending] EXIT GATE: 1/3 batched prompts + 5E.0-5E.5 mechanical VERIFY gate
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
│    └── 5E.5 prod-build smoke (frontend + build script)      │
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

**Open the workbench dashboard (loop start).** Render once and open it in the browser. `--live 10` makes the open tab re-read the file every 10s, so the re-renders at end of Phase 2 / Phase 3 / Phase 5 update the same tab in place. `--open` is marker-tracked (idempotent): only this first call launches a browser. The workbench is a reporting artifact, so a render failure is non-blocking.

```bash
./.claude/skills/cfn-workbench/render.sh --slug "$RUN_ID" --open --live 10 \
  || echo "WARN: workbench render/open skipped (non-blocking)" >&2
```

**Mark todo #1 as completed. Proceed to Phase 2.**

---

## PHASE 2: LOOP 3 - Full Epic Implementation

**Mark todo #2 as in_progress.**

**Scope:** Spawn agents to implement the **entire epic** (all phases of the plan) in one pass, not a single sprint slice. TDD throughout.

### LANE DERIVATION (mechanical, do this before spawning)

1. **Locate the plan.** Find the newest `planning/PLAN_*.md` whose name matches the task slug. If no `PLAN_` file exists, STOP and run `/write-plan` first. Never improvise lanes without a plan. **Note:** a `planning/MEGAPLAN_<slug>.md` is an index/summary, NOT a lane source — if only `MEGAPLAN_` (and/or `VERIFY_`) exists but no `PLAN_<slug>.md`, the megaplan run failed to persist its plan; run `/write-plan "<task>" --mode=<mode>` to regenerate `PLAN_<slug>.md` from the existing `planning/` artifacts, then continue. Do NOT derive lanes from `MEGAPLAN_` or `VERIFY_`.
2. **One lane per phase.** Each top-level phase/workstream in the plan becomes one lane. **LANE_CAP = 8** (one constant, used here AND in wave scheduling step 6). If the plan has more phases than LANE_CAP, merge the smallest phases into neighboring lanes until at most LANE_CAP remain. (Lanes = phases, so most plans never reach the cap; it is a ceiling, not a target.)
3. **Exclusive file ownership.** Each lane gets an exclusive file list derived from the plan. No file may appear in two lanes. If two phases touch the same file, put both phases in the SAME lane and run them sequentially inside it.
4. **Ownership clause in every spawn prompt.** Each spawn prompt includes: "FILES YOU OWN: <list>. Do not create or edit any file outside this list. Files outside your lane needing changes go in out_of_scope_needs (array of \"path: why\"); blocked_on is only for a blocker that stops YOUR lane (scalar, one sentence, else null)."
5. **Compute lane-dependency edges (from Produces/Consumes).** First run the static sanity gate: `.claude/skills/cfn-megaplan/bars/check-produce-consume.sh planning/PLAN_<slug>.md` — exit 1 (duplicate producer / weasel / empty / malformed cell) BLOCKS; resolve before deriving lanes (a duplicate-producer finding is the AskUserQuestion below). Warnings (dangling consume) are advisory. If the plan has no such columns the checker exits 0 and you skip to a single wave. Then collect every step's identifiers per lane. Draw a directed edge **A → E** whenever any step in lane E has a `Consumes` string-equal (exact, trimmed) to a `Produces` of any step in lane A, with A ≠ E. A Consumes matching no lane's Produces is a pre-existing symbol → no edge (log a one-line `warn: dangling consume <id>` so a typo is visible). **Duplicate producer** (the same identifier Produced by steps in two DIFFERENT lanes) is ambiguous ownership → STOP and surface one `AskUserQuestion` (which lane owns it); do not guess. If the columns are absent or every cell is `-`, the edge set is empty. **Cycle** (A → E and E → A): merge the cycle's lanes into one lane run sequentially — same resolution as the same-file rule in step 3 — and log `cycle-merge: <lanes>`.
6. **Order lanes into waves (topological).** WAVE_1 = every lane with no inbound edge. Each next wave = lanes whose inbound edges all originate in already-completed waves. Within a wave, run at most LANE_CAP lanes concurrently; ready-but-capped lanes defer to the next slot (never merge them just to fit the cap). Empty edge set ⇒ exactly one wave with all lanes ⇒ identical to the pre-feature single-wave behavior. Log `wave N: lanes [...]` per wave before spawning it.

### Spawn implementer agents in waves using Task tool (one per lane)

Iterate the waves from step 6 in order. For each wave: spawn its lanes in parallel (single message, one Task per lane, up to LANE_CAP), using the prompt below. A single-wave plan (empty edge set) is the common case and spawns exactly once — identical to prior behavior.

```
TASK: Full epic implementation, iteration ${ITERATION}: ${TASK_DESCRIPTION}

SCOPE: Complete every phase of the linked plan (planning/PLAN_${SLUG}.md)
       assigned to your lane. Do NOT stop after a single sprint.

FILES YOU OWN: ${LANE_FILE_LIST}. Do not create or edit any file outside
this list. Out-of-lane file needs go in out_of_scope_needs ("path: why");
blocked_on only for a blocker stopping YOUR lane (one sentence, else null).

Read ONLY: the plan file, your owned files, and test output excerpts given
to you. Do NOT read other lanes' files, prior iteration transcripts, or any
SKILL.md.

REQUIREMENTS:
1. Write failing tests FIRST (TDD red phase) for every acceptance criterion
2. Implement to satisfy tests (green phase)
3. Refactor for DRY / quality (refactor phase)
4. Run ONLY your own test files: npx vitest run <your-test-files> --reporter=verbose
   Never run `npm test` or any repo-wide test command.
5. Report exactly this JSON as the last block of your output:
   {"lane": "<lane>", "tests_written": N, "scoped_tests_passed": N, "scoped_tests_total": M, "files_modified": [], "phases_complete": [], "out_of_scope_needs": [], "blocked_on": null | "<one sentence>", "tests_removed_reason": null | "<why you intentionally removed or renamed tests>", "confidence": 0.0}
   Set `tests_removed_reason` to a non-null string ONLY when you deliberately deleted or renamed existing tests (e.g. consolidated a duplicated suite); leave it null otherwise. The coordinator uses it to distinguish an intentional suite shrink from an accidental one (Phase 3, W3 baseline check).

AGENT_ID: loop3-impl-${TASK_ID}-iter${ITERATION}-<lane>
```

**WAIT for the wave's agents to complete and aggregate results.**

**Inter-wave producer guard (only when a NEXT wave exists).** Before spawning the next wave, cheaply confirm the just-completed wave actually created what downstream lanes consume: for each `Produces` identifier a later wave `Consumes`, assert it now resolves — `npm run typecheck` scoped to those files, or `grep -RnF "<symbol>"` on the produced path. This is NOT the full Phase-3 gate (no test suite, no gate-check.sh); it is a symbol-existence check so a consumer wave never builds on an absent export. If a claimed symbol is missing, respawn ONLY the producing lane with that as the finding, re-run the guard, then proceed. When no further wave exists, skip the guard — the full Phase-3 gate below covers it.

**After the final wave completes, aggregate all waves' results.**

**Re-render the workbench dashboard** with this iteration's implementation progress (lane reports now on disk). Same tab refreshes via the `--live` meta from Phase 1; `--open` no-ops (marker already set).

```bash
./.claude/skills/cfn-workbench/render.sh --slug "$RUN_ID" --open --live 10 \
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
for LANE_ID in ${LANE_IDS}; do
  ./.claude/skills/cfn-loop-orchestration-v2/cli/deferrals.sh record \
    --slug "${SLUG:-$TASK_ID}" --lane "${LANE_ID}" \
    --json "/tmp/lane-report-${RUN_ID}-${LANE_ID}.json"
done
```

Run this every iteration, even when a lane's `out_of_scope_needs` is empty:
`record` REPLACES that lane's prior entries rather than accumulating them, so
a lane that resolved its own deferral and now reports `[]` clears its block
instead of leaving a stale blocker. This step has no pass/fail branch of its
own; the gate lives at Phase 5 (5E.4a).

### Step 3.05: Test-hygiene scan (W3, run BEFORE gate-check)

Before computing any pass rate, confirm no test was silently disabled to game the gate. A skipped/focused test can turn a red suite artificially green.

```bash
# No args = changed test files via git diff. Exit 0 clean / 1 findings / 2 usage.
./.claude/skills/cfn-loop-orchestration-v2/cli/check-test-hygiene.sh \
  2>&1 | tee /tmp/hygiene-${TASK_ID}.txt
HYGIENE_EXIT=$?
```

- **Exit 1 (findings):** gate FAILS. Any `.only(` / `.skip(` / `.todo(` / `fit(` / `xit(` / `xdescribe(` / `xtest(` / `@pytest.mark.skip` / `pytest.skip(` without a same-line `// cfn-allow-skip: <reason>` (or `# cfn-allow-skip:`) suppression marker is iteration fuel. Feed the findings JSON into the retry context and go back to Phase 2. Do NOT compute a pass rate on a hygiene failure.
- **Exit 0 (clean):** proceed to Step 3.1.
- A `cfn-allow-skip` marker is the W4 quarantine representation: a test the user explicitly approved skipping in a prior Phase 5 Exit. Those do not fail the scan.

### Step 3.1: Run tests and check the gate mechanically

```bash
# Run the full suite (coordinator only; agents never do this)
npm test 2>&1 | tee /tmp/test-output-${RUN_ID}.txt

# Baseline (W3): the coordinator carries PREV_TOTAL across iterations. From
# iteration 2 onward, pass --baseline so a shrinking suite is caught.
BASELINE_ARG=""
if [ "${ITERATION}" -ge 2 ] && [ -n "${PREV_TOTAL:-}" ]; then
  BASELINE_ARG="--baseline ${PREV_TOTAL}"
fi

# Mechanical gate check (THRESHOLD from THRESHOLDS.md, e.g. 0.95 for standard)
./.claude/skills/cfn-loop-orchestration-v2/cli/gate-check.sh \
  --out /tmp/test-output-${RUN_ID}.txt \
  --threshold ${THRESHOLD} \
  ${BASELINE_ARG}
GATE_EXIT=$?
```

**Re-render the workbench dashboard (iteration boundary).** The test output and gate verdict for the iteration just completed are now on disk, so this render reflects the current pass rate and gate result. Fires every iteration, pass or fail.

```bash
./.claude/skills/cfn-workbench/render.sh --slug "$RUN_ID" --open --live 10 \
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

### Step 3.2: Flaky re-run protocol (W8)

On gate-check exit 1 (rate below threshold), a failure may be flaky rather than real. Before treating reds as iteration fuel:

1. Dedupe the failing test FILES from `/tmp/test-output-${RUN_ID}.txt` (unique file paths, not individual test cases).
2. Re-run ONLY those files once.
3. **Green on rerun** = flaky-flagged. Record the file in the report's `Flaky:` line (see Phase 5 Exit 5E.4). It is NOT iteration fuel. Recompute the effective pass rate inline by moving those tests from failing to passing, and re-evaluate the gate against that effective rate.
4. **Still red on rerun** = a real failure. It stays iteration fuel; proceed with the exit-1 ITERATE action.
5. **Cap:** a test flaky-flagged in ≥2 separate iterations counts as a REAL failure from then on (persistent flakiness is a defect). Track flaky flags per test across iterations.

### Step 3.5: Harvest Tech-Debt Ledger (Product Owner input)

After the gate passes, inventory the deliberate shortcuts implementers took so the Product Owner decides with debt visible, not hidden:

```bash
./.claude/skills/cfn-tech-debt/harvest.sh 2>&1 | tee /tmp/cfn-debt-${TASK_ID}.txt
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
| `frontend=yes` | `cfn-a11y-gate` | manifest | URLs from `CFN_A11Y_URLS`, fallback the `A11y-URLs:` line in `planning/OPS_${SLUG}.md`; unreachable (2s curl probe) -> WARN-skip naming the exact env line. Never auto-start servers |
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
MANIFEST="$(awk '/^```json/{inblock=1;buf="";next} inblock&&/^```/{inblock=0;last=buf;next} inblock{buf=buf$0"\n"} END{printf "%s",last}' "planning/VERIFY_${SLUG}.md")"
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

**FR-7 SITE 1 (Phase 4.2 product-owner 2/3) decisions-ledger capture.** Each 2/3 product-owner verdict is final BEFORE this hook fires. Per resolved 2/3 item, set the per-item variables (`DEC_ID`, `DEC_TITLE`, `DEC_CHOSEN`, `DEC_RATIONALE`, `DEC_ALTS`, `DEC_STATUS`, `DEC_BLOCKING`) and invoke the writer once. Status mapping: `IMPLEMENT -> accepted`, `DEFER -> proposed`, `REJECT -> superseded`. Blocking mapping: `true` if the vote was block-severity, else `false`. `actor=ai` (the product-owner agent resolves 2/3 items). D-8 isolation: the writer's non-zero exit is logged and the loop continues (the decision was made by the product-owner agent; a missing ledger row is a coverage gap, not a wrong decision).

```bash
# FR-7 SITE 1: record the resolved 2/3 product-owner decision (actor=ai, D-8 isolated).
# hook.sh owns the D-8 isolation envelope + per-site marker (DRY across sites 1/2/3).
export RUN_LOG="${RUN_LOG:-/tmp/decisions-ledger-${TASK_ID:-unknown}.log}"
bash .claude/skills/cfn-decisions/hook.sh \
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
bash .claude/skills/cfn-decisions/hook.sh \
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

The done verdict is mechanical, not honor-system. `verify-run.sh` reads the results file it writes; prose never counts. Steps 5E.0-5E.3 run only when a VERIFY manifest exists (Step 0); a non-megaplanned task skips them and starts at 5E.4. 5E.4a (deferrals gate, S006) always runs, VERIFY manifest or not. This gate MAY iterate back to Phase 2 (bounded by MAX_ITERATIONS): a red AC, a surviving mutation, or an open blocking deferral is iteration fuel.

#### 5E.0 Mutation spot-check (W5, runs FIRST)

Runs first so any residue a mutation leaves behind is caught by the later all-green gate (5E.4). Per `[core]` FR in the manifest, capped at 3:

1. Pick the primary impl file for that FR from the PLAN lane mapping. Write a one-line justification of the choice into the report.
2. Back it up and record the hash BEFORE mutating (no git stash: that would sweep uncommitted loop work):
   ```bash
   mkdir -p /tmp/cfn-mutation-${TASK_ID}
   cp "${IMPL_FILE}" "/tmp/cfn-mutation-${TASK_ID}/$(basename "${IMPL_FILE}")"
   BEFORE_SHA=$(sha256sum "${IMPL_FILE}" | cut -d' ' -f1)
   ```
   Install a restore-on-exit trap so a crash between mutate and restore cannot leave the file mutated:
   ```bash
   trap 'cp "/tmp/cfn-mutation-${TASK_ID}/$(basename "${IMPL_FILE}")" "${IMPL_FILE}" 2>/dev/null' EXIT
   ```
3. Spawn a mutation agent that makes exactly ONE semantic mutation (invert a key conditional OR replace a body with a constant), emits a unified diff, and touches nothing else.
4. Run `verify-run.sh run --verify planning/VERIFY_${SLUG}.md --only <that FR's AC ids>` and EXPECT red. A red result means the AC tests actually exercise the mutated logic.
5. Restore the backup and assert the restored file's hash equals `BEFORE_SHA`:
   ```bash
   cp "/tmp/cfn-mutation-${TASK_ID}/$(basename "${IMPL_FILE}")" "${IMPL_FILE}"
   [ "$(sha256sum "${IMPL_FILE}" | cut -d' ' -f1)" = "${BEFORE_SHA}" ] || echo "STOP FOR: corrupted state"
   ```
   Hash mismatch after restore = Stop For (corrupted state, manual recovery).
6. **GREEN after mutation = the mutation survived** (the AC tests did not catch it). Record it and iterate once with "strengthen AC tests for FR-x" (back to Phase 2, counts against MAX_ITERATIONS). If it survives AGAIN on the next pass -> Stop For.

`cfn: single-mutation probe, upgrade to a real mutation framework if survival rate matters` (deliberate shortcut: one mutation per FR, not exhaustive operators).

#### 5E.1 Run the VERIFY manifest mechanically

```bash
./.claude/skills/cfn-loop-orchestration-v2/cli/verify-run.sh run \
  --verify planning/VERIFY_${SLUG}.md \
  --out planning/VERIFY_RESULTS_${RUN_ID}.json
```

This executes every executable/db-query AC and writes the results file (the single done authority).

#### 5E.2 Resolve needs_agent / predicate_unverified rows

For each results row with `mode: needs_agent` or `predicate_unverified: true` (`pass: null`, UNRESOLVED), spawn a verification agent. The spawn prompt MUST pin that AC's `check`, `pass`, trigger, seeds, and signal, and MUST require a verbatim evidence excerpt (the agent captures real output, it does not assert). Then stamp the evidence:

```bash
./.claude/skills/cfn-loop-orchestration-v2/cli/verify-run.sh resolve \
  --results planning/VERIFY_RESULTS_${RUN_ID}.json \
  --ac <AC-id> --pass true|false --evidence-file <captured-evidence-file>
```

`resolve` refuses evidence under 3 non-empty lines. An unresolved row can never count as done.

#### 5E.3 Summary = the done verdict

```bash
./.claude/skills/cfn-loop-orchestration-v2/cli/verify-run.sh summary \
  --results planning/VERIFY_RESULTS_${RUN_ID}.json
SUMMARY_EXIT=$?
```

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | all green AND nothing unresolved | This is the done verdict source. Proceed to 5E.4 |
| 1 | red or unresolved AC(s) | The red ACs are iteration fuel: go back to Phase 2 (counts against MAX_ITERATIONS). If ITERATION > MAX_ITERATIONS, report failure and EXIT |
| 4 | VERIFY sha256 mismatch | Stop For (the manifest was edited since Bar A; same as Step 0a) |

#### 5E.3a Backfill evidence and re-bless at the exit stage (S007)

Runs only when 5E.3 exited 0. The manifest was blessed at plan stage with `evidence: "PENDING: <reason>"` on rows whose code did not exist yet; the run above executed every check, so its recorded output is the real evidence.

```bash
./.claude/skills/cfn-loop-orchestration-v2/cli/verify-run.sh backfill-evidence \
  --results planning/VERIFY_RESULTS_${RUN_ID}.json \
  --verify  planning/VERIFY_${SLUG}.md

.claude/skills/cfn-megaplan/bars/bless-verify.sh "planning/VERIFY_${SLUG}.md" \
  --stage exit --note "exit gate: evidence backfilled from VERIFY_RESULTS"
```

Only green rows are backfilled. `bless-verify.sh --stage exit` refuses (exit 1) on any surviving `PENDING`, which means an AC reported green without producing output — treat that as a red row, not a formality, and iterate. The re-bless re-pins the sidecar over the rewritten file; skipping it leaves the sidecar stale and the next `verify-run.sh` exits 4.

#### 5E.4 All-green final gate (W4)

Code changed since Phase 3 (vote-applied 3/3, 2/3, 1/3 items), so a mandatory final FULL-suite re-run is required. This gate is `--threshold 1.0`, not the mode rate gate.

```bash
npm test 2>&1 | tee /tmp/test-final-${TASK_ID}.txt
./.claude/skills/cfn-loop-orchestration-v2/cli/gate-check.sh \
  --out /tmp/test-final-${TASK_ID}.txt --threshold 1.0
```

- Red -> run the Step 3.2 W8 flaky re-run FIRST (a green-on-rerun red is flaky-flagged, not real).
- Persistent reds -> at most 2 quick-fix attempts.
- Still red after 2 attempts -> `AskUserQuestion` (one decision): **Quarantine** / **Keep iterating** / **Abort**.

  **FR-7 SITE 3 (Phase 5E.4 quarantine) decisions-ledger capture.** Record the user's quarantine choice AFTER the `AskUserQuestion` returns AND BEFORE the dispatch below. One writer invocation total (one decision by design). Status mapping: `Quarantine -> accepted`, `Keep iterating -> proposed`, `Abort -> superseded`. `actor=human`. `blocking=true` (quarantine is load-bearing for Step 3.05 hygiene). D-8 isolation: the audit row is an audit side-effect, not a gate on the quarantine itself; `test.skip` still happens, backlog entry still lands, the loop continues regardless of writer RC.

  ```bash
  # FR-7 SITE 3: record the quarantine/iterate/abort decision (actor=human, D-8 isolated).
  # Set DEC_ID, DEC_TITLE, DEC_CHOSEN, DEC_RATIONALE, DEC_ALTS, DEC_STATUS per the user's choice.
  # hook.sh owns the D-8 isolation envelope + per-site marker (DRY across sites 1/2/3).
  export RUN_LOG="${RUN_LOG:-/tmp/decisions-ledger-${TASK_ID:-unknown}.log}"
  bash .claude/skills/cfn-decisions/hook.sh \
      --site phase-5E.4-quarantine \
      --slug "${SLUG:-$TASK_ID}" \
      --id "$DEC_ID" \
      --title "$DEC_TITLE" \
      --chosen "$DEC_CHOSEN" \
      --actor human \
      --rationale "${DEC_RATIONALE:-}" \
      --alternatives "${DEC_ALTS:-}" \
      --status "${DEC_STATUS:-accepted}" \
      --blocking true
  # Quarantine / Phase 2 return / report+exit proceed regardless of writer RC (hook.sh always exits 0; D-8).
  ```

  - **Quarantine**: recorded in the report + wrap the test in `test.skip` carrying `// cfn-allow-skip: quarantined <date> <reason>` (this is what makes Step 3.05 hygiene accept it) + a backlog entry.
  - **Keep iterating**: back to Phase 2 (counts against MAX_ITERATIONS).
  - **Abort**: stop and report.

**Final done is all-green OR an explicit user-approved quarantine. 0.95 is never a done state.** The mode rate gate (Phase 3) is iteration fuel only; this final gate is the completion bar.

#### 5E.4a Deferral gate (S006, always runs, origin: ROOTCAUSE_mpa_thread_wiring_gap.md)

Runs regardless of whether a VERIFY manifest exists (unlike 5E.0-5E.3, which
are megaplan-only) because `out_of_scope_needs` can be reported by any lane in
any task-mode run. This is the mechanical fix for the exact gap that let MP-A
ship: an implementer correctly flagged an unfinished cross-lane wiring step in
`out_of_scope_needs` (Step 3.01 persisted it), and nothing downstream ever
consumed it — the loop declared 81/81 all-green over a feature unreachable
from `src/index.ts`.

```bash
./.claude/skills/cfn-loop-orchestration-v2/cli/deferrals.sh gate --slug "${SLUG:-$TASK_ID}"
DEFERRALS_GATE_EXIT=$?
```

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | no open blocking deferrals (or none were ever recorded) | ANDs into the done verdict; proceed to 5E.5 |
| 1 | one or more open blocking deferrals | NOT DONE. The printed offenders (lane + text, stderr) name the file/step still owed: go back to Phase 2 and route that file to the lane that owns it. Counts against MAX_ITERATIONS. If ITERATION > MAX_ITERATIONS, escalate (Stop For) instead of silently declaring done |

A deferral only clears via an explicit `deferrals.sh resolve --slug ${SLUG:-$TASK_ID} --id <n> --reason <text>` once the deferred work actually lands — never by re-running the gate itself. **Done requires 5E.4 (all-green) AND 5E.4a (no open blocking deferrals).**

#### 5E.5 Prod-build smoke (W8a, runs LAST)

If SPEC `frontend: yes` AND `package.json` has a `build` script:

```bash
npm run build 2>&1 | tee /tmp/build-smoke-${TASK_ID}.txt
```

- Non-zero exit = red. At most 2 fix attempts (back to Phase 2 with the build output as context), then Stop For.
- Runs last so the built artifact reflects all vote-applied and quarantine changes.

### Exit report

**Final workbench render.** VERIFY_RESULTS is now on disk, so this render shows the populated AC/verify table and final verdict. One last refresh of the open tab.

```bash
./.claude/skills/cfn-workbench/render.sh --slug "$RUN_ID" --open --live 10 \
  || echo "WARN: workbench render skipped (non-blocking)" >&2
```

After 5E.5 (or 5E.4 for non-frontend tasks) reports done, mark todo #5 completed, report summary, EXIT.

```
Summary report:
  Implementation iterations: ${ITERATION}
  Vote suggestions reviewed: ${TOTAL_SUGGESTIONS}
  Auto-implemented (3/3):    ${COUNT_3_OF_3}
  Product Owner decided (2/3): ${COUNT_2_OF_3}
  User decided (1/3):        ${COUNT_1_OF_3}
  Skipped (0/3):             ${COUNT_0_OF_3}
  Quarantined:               ${QUARANTINED_TESTS}
  Flaky:                     ${FLAKY_TESTS}
```

**No vote iteration after Phase 5; the Phase 5 Exit gate (5E.0-5E.5) MAY iterate back to Phase 2, bounded by MAX_ITERATIONS.** If the user wants another round beyond MAX_ITERATIONS, they re-run `/cfn-loop-task`.

---

## Iteration Context Injection

**When iterating, build the retry context mechanically from the gate artifacts:**

```bash
# Verbatim failing-test excerpts
FAILING_EXCERPTS=$(grep -A5 "FAIL\|✗\|✕" /tmp/test-output-${RUN_ID}.txt | head -80)
# Typecheck errors, if any
TSC_HEAD=$(head -40 /tmp/tsc-${TASK_ID}.txt)
```

Include this block in each retry spawn prompt:

```
PREVIOUS ITERATION FAILED THE GATE:
- Gate: ${PASS_COUNT}/${TOTAL_COUNT} passing (threshold ${THRESHOLD})
- Failing test excerpts (verbatim):
${FAILING_EXCERPTS}
- Typecheck errors (if any, first 40 lines):
${TSC_HEAD}

FIX ONLY THESE FAILURES. Do not refactor passing code.
```

**Downstream-dependent respawn (when lanes have produce/consume edges).** When you respawn only the lane(s) that failed the gate, ALSO respawn every lane transitively downstream of a failing lane in the step-6 edge graph — a downstream lane may have built on the failing lane's absent or wrong export. Compute the downstream set from the current edges (recomputed each iteration), respawn failing-lane ∪ downstream in the correct wave order, and leave lanes with no path from any failing lane untouched. Empty edge set ⇒ no downstream ⇒ "respawn failing lane only" exactly as before.

**After 3 failed iterations, spawn root-cause-analyst before next Loop 3:**
```
Task(subagent_type="root-cause-analyst", prompt="Analyze repeated failures...")
```

---

## Worked Example (abbreviated transcript)

```
[Iter 1] Lane derivation: lanes api, ui; edges: api Consumes src/types.ts:Claims
         Produced by a shared 'types' step folded into api -> edge types->ui.
         Waves: wave1=[api], wave2=[ui] (empty-edge plans would be one wave).
[Iter 1] Wave1 spawn lane=api. Barrier. Producer guard: grep Claims in
         src/types.ts -> resolves. Wave2 spawn lane=ui.
[Iter 1] Agents return JSON: api 12/12 scoped, ui 8/9 scoped
[Iter 1] Step 3.0: tsc -> 0 errors. Step 3.1: npm test -> tee output
[Iter 1] gate-check.sh --out ... --threshold 0.95
         -> {"pass":18,"total":21,"rate":0.8571,"passed":false} exit 1
[Iter 1] Gate FAILED. Build retry context: 18/21, threshold 0.95,
         grep -A5 "FAIL" excerpts (3 failing tests in ui lane)
[Iter 2] Respawn ui lane only with retry context:
         "FIX ONLY THESE FAILURES. Do not refactor passing code."
[Iter 2] tsc -> 0 errors. gate-check.sh
         -> {"pass":21,"total":21,"rate":1.0000,"passed":true} exit 0
[Phase 4] Step 4.0 gate set: always dry-review; frontend=no, db=no -> no
          security/migration/a11y; no dep/perf triggers. Only dry-review.
[Phase 4] /cfn-dry-review -> manifest with 3 suggestions
[Phase 4] /cfn-vote-implement <explicit-path>: item A 3/3 -> auto-implemented
          with TDD; item B 2/3 -> product-owner says DEFER (backlogged);
          item C 1/3 -> queued
[Phase 5] AskUserQuestion batch (1 question): user picks Skip.
[Phase 5] 5E.0 mutation probe on core FR-1 impl: invert conditional ->
          verify-run.sh --only AC-1,AC-2 -> red (caught). Restore, hash OK.
[Phase 5] 5E.1 verify-run.sh run -> VERIFY_RESULTS_auth.json
[Phase 5] 5E.2 1 needs_agent row (playwright login) -> agent captures excerpt
          -> verify-run.sh resolve --pass true
[Phase 5] 5E.3 verify-run.sh summary -> exit 0 (all green)
[Phase 5] 5E.3a backfill-evidence -> 22 rows PENDING -> real output;
          bless-verify.sh --stage exit -> blessed #2 (predicate_changed false)
[Phase 5] 5E.4 gate-check.sh --threshold 1.0 -> 22/22 all green
[Phase 5] 5E.4a deferrals.sh gate --slug auth -> exit 0 (no open blocking needs)
[Phase 5] 5E.5 frontend=no -> skip build smoke. EXIT (done).
```

---

## Quick Reference

| Phase | What Happens | Next If Success | Next If Fail |
|-------|--------------|-----------------|--------------|
| 1. Parse | Initialize vars | → Phase 2 | N/A |
| 2. Loop 3 | Full epic implementation | → Phase 3 | Retry |
| 3. Gate | typecheck + deferral capture (3.01) + hygiene + gate-check.sh (+baseline, +flaky re-run) | → Phase 4 | → Phase 2 (iterate) |
| 4. Gate wiring + Vote | resolve gate set, hard gates first, cfn-vote-implement per manifest | → Phase 5 | → Phase 2 (migration-rehearsal fail) / Re-vote |
| 5. Exit gate | 5E.0 mutation → 5E.1-5E.3 verify-run.sh → 5E.3a evidence backfill + exit bless → 5E.4 all-green → 5E.4a deferrals gate → 5E.5 build smoke; 1/3 batched prompts resolved first | EXIT (all-green or quarantine) | → Phase 2 (red AC / surviving mutation / open blocking deferral, bounded by MAX_ITERATIONS) |

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

**Version:** 3.3.0 | **Date:** 2026-07-11 | Standard CFN Loop. Full-epic Phase 2; mechanical gate via cli/gate-check.sh; thresholds pinned in THRESHOLDS.md; Phase 3 now captures lane `out_of_scope_needs` into a side-manifest (Step 3.01, cli/deferrals.sh record); Phase 4 is the gate-wiring matrix (dry-review + conditional security/migration/a11y/dep-audit/perf gates) routed through cfn-vote-implement (3/3 auto, 2/3 product-owner, 1/3 batched user prompts); Phase 5 Exit is a mechanical VERIFY gate (5E.0 mutation probe, 5E.1-5E.3 verify-run.sh, 5E.4 all-green, 5E.4a deferrals gate — cli/deferrals.sh gate, S006 — 5E.5 prod-build smoke) that MAY iterate back to Phase 2 bounded by MAX_ITERATIONS.
