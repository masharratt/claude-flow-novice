---
description: "Execute CFN Loop in Task Mode with direct agent spawning (visible in main chat)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--max-iterations=n]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "Grep", "Glob"]
---

# CFN Loop Task Mode

**You are the coordinator. You MUST execute this loop until PROCEED or max iterations.**

---

## STEP 0: VERIFY MANIFEST (run before anything else)

Step 0: If `planning/VERIFY_<slug>.md` exists for this task, parse its JSON manifest (the LAST fenced ```json block in the file). The loop's final completion decision requires every `acs[].check` executed with its `pass` predicate true. Refuse to report done otherwise. If the file does not exist, proceed without it (task was not megaplanned).

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
3. [pending] GATE CHECK: Run tests and validate pass rate
4. [pending] VOTE VERIFICATION: cfn-vote-implement on review manifest
5. [pending] FINAL ROUTING: Auto-impl unanimous, PO 2/3, batched user prompts for 1/3
```

**You MUST update todo status as you complete each phase. Do NOT skip phases.**

---

## THE LOOP (Execute Until Done)

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE A - IMPLEMENTATION (iterate until gate passes):      │
│    ITERATION = 1                                            │
│    WHILE iteration <= MAX_ITERATIONS:                       │
│      ├── LOOP 3: Spawn impl agents (full epic, TDD)         │
│      ├── GATE CHECK: typecheck + gate-check.sh              │
│      │     ├── IF gate FAILS: iteration++, LOOP             │
│      │     └── IF gate PASSES: BREAK to Phase B             │
│      └── END WHILE                                          │
│                                                             │
│  PHASE B - VOTE VERIFICATION (single pass):                 │
│    ├── Generate review manifest from implementation         │
│    ├── /cfn-vote-implement on manifest                      │
│    │     ├── 3/3 votes: auto-implement immediately (TDD)    │
│    │     ├── 2/3 votes: spawn product-owner to decide       │
│    │     ├── 1/3 votes: queue for batched user prompts      │
│    │     └── 0/3 votes: skip silently                       │
│    └── After all votes processed:                           │
│          └── AskUserQuestion (4 per batch) on 1/3 queue     │
│                                                             │
│  EXIT - All vote outcomes resolved AND (if present)         │
│         every VERIFY manifest acs[].check passes            │
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
```

**Thresholds:** the single source of truth is `.claude/skills/cfn-loop-orchestration-v2/THRESHOLDS.md`. Values reproduced here for convenience; if they ever disagree, THRESHOLDS.md wins.

| Mode | test_pass_rate_gate | consensus | max_iter |
|------|---------------------|-----------|----------|
| mvp | 0.70 | 0.80 | 5 |
| standard | 0.95 | 0.90 | 10 |
| enterprise | 0.98 | 0.95 | 15 |

**Gate uses test_pass_rate_gate as a decimal (standard = 0.95). Confidence gates apply only to CLI mode; ignore them here.**

Planning tier vocabulary is mvp|beta|enterprise (cfn-megaplan); execution mode vocabulary is mvp|standard|enterprise. Tier `beta` maps to mode `standard`.

**Mark todo #1 as completed. Proceed to Phase 2.**

---

## PHASE 2: LOOP 3 - Full Epic Implementation

**Mark todo #2 as in_progress.**

**Scope:** Spawn agents to implement the **entire epic** (all phases of the plan) in one pass, not a single sprint slice. TDD throughout.

### LANE DERIVATION (mechanical, do this before spawning)

1. **Locate the plan.** Find the newest `planning/PLAN_*.md` whose name matches the task slug. If no plan file exists, STOP and run `/write-plan` first. Never improvise lanes without a plan.
2. **One lane per phase.** Each top-level phase/workstream in the plan becomes one lane. Cap at 4 lanes; if the plan has more phases, merge the smallest phases into neighboring lanes until at most 4 remain.
3. **Exclusive file ownership.** Each lane gets an exclusive file list derived from the plan. No file may appear in two lanes. If two phases touch the same file, put both phases in the SAME lane and run them sequentially inside it.
4. **Ownership clause in every spawn prompt.** Each spawn prompt includes: "FILES YOU OWN: <list>. Do not create or edit any file outside this list. Files outside your lane needing changes go in out_of_scope_needs (array of \"path: why\"); blocked_on is only for a blocker that stops YOUR lane (scalar, one sentence, else null)."

### Spawn implementer agents in parallel using Task tool (one per lane)

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
   {"lane": "<lane>", "tests_written": N, "scoped_tests_passed": N, "scoped_tests_total": M, "files_modified": [], "phases_complete": [], "out_of_scope_needs": [], "blocked_on": null | "<one sentence>", "confidence": 0.0}

AGENT_ID: loop3-impl-${TASK_ID}-iter${ITERATION}-<lane>
```

**WAIT for all agents to complete and aggregate results.**

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

### Step 3.1: Run tests and check the gate mechanically

```bash
# Run the full suite (coordinator only; agents never do this)
npm test 2>&1 | tee /tmp/test-output-${TASK_ID}.txt

# Mechanical gate check (THRESHOLD from THRESHOLDS.md, e.g. 0.95 for standard)
./.claude/skills/cfn-loop-orchestration-v2/cli/gate-check.sh \
  --out /tmp/test-output-${TASK_ID}.txt \
  --threshold ${THRESHOLD}
GATE_EXIT=$?
```

**Branch on exit code:**

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | rate >= threshold and total > 0 | Gate PASSED. Record `pass`/`total` from the JSON, mark todo #3 completed, go to Step 3.5 then Phase 4 |
| 1 | rate < threshold | Gate FAILED. ITERATION++. If ITERATION > MAX_ITERATIONS report failure and EXIT. Else reset todo #2 to pending and go back to Phase 2 with the retry context (see Iteration Context Injection) |
| 2 | no tests detected (0/0) | Gate FAILED. Treat exactly like exit 1. 0/0 never passes |

The script prints `{"pass":N,"total":M,"rate":R,"passed":true|false}`. Capture `pass` as PASS_COUNT and `total` as TOTAL_COUNT for the retry template.

**DO NOT proceed to Phase 4 if the gate failed. ITERATE.**

### Step 3.5: Harvest Tech-Debt Ledger (Product Owner input)

After the gate passes, inventory the deliberate shortcuts implementers took so the Product Owner decides with debt visible, not hidden:

```bash
./.claude/skills/cfn-tech-debt/harvest.sh 2>&1 | tee /tmp/cfn-debt-${TASK_ID}.txt
```

- Each `cfn: <ceiling>, <trigger>` marker becomes a ledger row; markers with no trigger are flagged `no-trigger` (rot risk).
- Carry the `<N> markers, <M> with no trigger` line into every `product-owner` 2/3 decision (Phase 4) and the final report (Phase 5). A high `no-trigger` count is a signal to ITERATE or to file backlog items, not silently PROCEED.

---

## PHASE 4: VOTE VERIFICATION (replaces Loop 2 validators)

**Mark todo #4 as in_progress.**

**ONLY execute if Gate Check passed AND full epic implementation complete.**

This phase replaces the old Loop 2 validator pattern. Instead of free-form validator findings, three specialized vote agents (correctness / consistency / feasibility) review the implementation and produce a structured manifest of suggestions. The manifest is then routed by vote count.

### Step 4.1: Generate Review Manifest

Spawn the DRY/code-review pass to produce a manifest of suggestions:

```bash
/cfn-dry-review
# Emits: .cfn-cache/manifests/cfn-dry-review-<timestamp>.json
```

**Manifest source rule.** Default: `/cfn-dry-review`. Use the `/cfn-alpha-launch` manifest ONLY if the task description contains "release", "launch", or "production readiness".

### Step 4.2: Run cfn-vote-implement

```bash
/cfn-vote-implement latest
```

The skill internally runs the 3 voting agents in parallel. For each suggestion in the manifest, it routes by vote count:

| Vote count | Routing |
|------------|---------|
| **3/3** | Auto-implement immediately with TDD (sequential, regression checks between items) |
| **2/3** | Spawn `product-owner` agent (GOAP) to decide IMPLEMENT / DEFER / REJECT |
| **1/3** | Queue for batched user decision at end of run |
| **0/3** | Skip silently |

3/3 items are implemented in-line during the vote pass. 2/3 items consult product-owner one at a time. 1/3 items are collected and surfaced after every other item is resolved.

**Mark todo #4 as completed. Proceed to Phase 5.**

---

## PHASE 5: BATCHED USER PROMPTS (1/3 Items)

**Mark todo #5 as in_progress.**

After cfn-vote-implement has processed all 3/3 (auto-impl) and 2/3 (product-owner) items, collect the queued 1/3 items.

### Routing

- If the 1/3 queue is empty: mark todo #5 completed, run the VERIFY manifest check (Step 0), then EXIT.
- Else: surface 1/3 items via `AskUserQuestion`, **batched 4 questions per call**, one decision per question.

### Question Format

Each 1/3 item is one AskUserQuestion entry:

- **question**: plain English description of the suggestion + the one supporting vote's reasoning + the two opposing votes' reasoning. End with "Apply this change?"
- **options**: `Apply`, `Skip`, optionally `Defer to backlog`
- **header**: short slug from suggestion ID (e.g. "Extract validator")

After each batch returns, implement the `Apply` items with TDD (sequential, same protocol as 3/3 items). Continue until queue is empty.

### Exit

- After the last batch resolved: if a VERIFY manifest exists (Step 0), execute every `acs[].check` and confirm each `pass` predicate true; refuse to report done otherwise. Then mark todo #5 completed, report summary, EXIT.

```
Summary report:
  Implementation iterations: ${ITERATION}
  Vote suggestions reviewed: ${TOTAL_SUGGESTIONS}
  Auto-implemented (3/3):    ${COUNT_3_OF_3}
  Product Owner decided (2/3): ${COUNT_2_OF_3}
  User decided (1/3):        ${COUNT_1_OF_3}
  Skipped (0/3):             ${COUNT_0_OF_3}
```

**No iteration after Phase 5.** Vote-based verification is single-pass. If the user wants another round, they re-run `/cfn-loop-task`.

---

## Iteration Context Injection

**When iterating, build the retry context mechanically from the gate artifacts:**

```bash
# Verbatim failing-test excerpts
FAILING_EXCERPTS=$(grep -A5 "FAIL\|✗\|✕" /tmp/test-output-${TASK_ID}.txt | head -80)
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

**After 3 failed iterations, spawn root-cause-analyst before next Loop 3:**
```
Task(subagent_type="root-cause-analyst", prompt="Analyze repeated failures...")
```

---

## Worked Example (abbreviated transcript)

```
[Iter 1] Spawn 2 lanes (lane=api, lane=ui) from planning/PLAN_auth.md
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
[Phase 4] /cfn-dry-review -> manifest with 3 suggestions
[Phase 4] /cfn-vote-implement: item A 3/3 -> auto-implemented with TDD;
          item B 2/3 -> product-owner says DEFER (backlogged);
          item C 1/3 -> queued
[Phase 5] AskUserQuestion batch (1 question): user picks Skip. EXIT.
```

---

## Quick Reference

| Phase | What Happens | Next If Success | Next If Fail |
|-------|--------------|-----------------|--------------|
| 1. Parse | Initialize vars | → Phase 2 | N/A |
| 2. Loop 3 | Full epic implementation | → Phase 3 | Retry |
| 3. Gate | typecheck + gate-check.sh | → Phase 4 | → Phase 2 (iterate) |
| 4. Vote | cfn-vote-implement on review manifest | → Phase 5 | Re-vote |
| 5. User batch | AskUserQuestion x4 on 1/3 items | EXIT | EXIT |

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
- **Update todos at every phase boundary** (this is the coordinator's state machine).
- **Let the product-owner agent decide 2/3 splits** (no user prompt for those).

**When to escalate to user:** ONLY the rows in the Stop For column of the AUTONOMOUS PROGRESSION table at the top of this file. That table is the single source of truth; do not maintain a second list.

---

**Version:** 3.1.0 | **Date:** 2026-07-03 | Standard CFN Loop. Full-epic Phase 2; mechanical gate via cli/gate-check.sh; thresholds pinned in THRESHOLDS.md; Phase 4 replaces Loop 2 validators with cfn-vote-implement (3/3 auto, 2/3 product-owner, 1/3 batched user prompts).
