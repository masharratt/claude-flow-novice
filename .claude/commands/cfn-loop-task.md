---
description: "Execute CFN Loop in Task Mode with direct agent spawning (visible in main chat)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--max-iterations=n]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "Grep", "Glob"]
---

# CFN Loop Task Mode

**You are the coordinator. You MUST execute this loop until PROCEED or max iterations.**

---

## ⚡ AUTONOMOUS PROGRESSION (CRITICAL)

**DO NOT stop to ask questions. Keep progressing by launching agents for next steps.**

| Stop For | Keep Going For |
|----------|----------------|
| Major regression (tests went from passing to failing) | Minor test failures (iterate to fix) |
| Structural mismatch (wrong architecture/framework) | Missing files (create them) |
| Security vulnerability found | Code style issues |
| Corrupted state requiring manual recovery | Ambiguous implementation details |
| Unclear requirements (feedback for epic improvement) | |

**Rules:**
- If uncertain about approach, pick the simpler option and iterate
- Spawn agents to investigate unknowns instead of asking user
- Only escalate to user for irreversible decisions or access issues
- Test failures are expected - that's why we iterate

---

## 🎯 0/0 POLICY (EXIT CRITERIA)

**Before PROCEED decision, verify:**

| Metric | Requirement |
|--------|-------------|
| Compilation errors (scoped work) | **0** |
| Compilation errors (scoped tests) | **0** |
| Todos remaining (scoped work) | **0** |

```bash
# Verify 0/0 before PROCEED
npm run typecheck 2>&1 | grep -c "error" || echo "0"  # Must be 0
npm run build 2>&1 | grep -c "error" || echo "0"      # Must be 0
# Review TodoWrite - all scoped items must be completed
```

**If not 0/0:** ITERATE, do not PROCEED. Fix errors before next gate check.

---

## MANDATORY: Initialize State Tracking

**IMMEDIATELY create this todo list using TodoWrite:**

```
1. [pending] Parse arguments and initialize task
2. [pending] LOOP 3: Spawn implementation agents
3. [pending] GATE CHECK: Run tests and validate pass rate
4. [pending] LOOP 2: Spawn validator agents (ONLY if gate passed)
5. [pending] PRODUCT OWNER: Review validator feedback, filter out-of-scope, decide
```

**You MUST update todo status as you complete each phase. Do NOT skip phases.**

---

## THE LOOP (Execute Until Done)

```
┌─────────────────────────────────────────────────────────────┐
│  ITERATION = 1                                              │
│                                                             │
│  WHILE iteration <= MAX_ITERATIONS:                         │
│    ├── LOOP 3: Spawn implementation agents                  │
│    ├── GATE CHECK: Run npm test, calculate pass rate        │
│    │     ├── IF pass_rate < threshold: iteration++, CONTINUE│
│    │     └── IF pass_rate >= threshold: PROCEED to Loop 2   │
│    ├── LOOP 2: Spawn validator agents                       │
│    ├── PRODUCT OWNER: Review validator feedback             │
│    │     ├── Filter out-of-scope validator requirements     │
│    │     ├── PROCEED: In-scope work complete, EXIT          │
│    │     ├── ITERATE: In-scope issues remain, CONTINUE      │
│    │     └── ABORT: Corruption/security only, EXIT          │
│    └── END WHILE                                            │
│                                                             │
│  MAX_ITERATIONS reached: Report and EXIT                    │
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

| Mode | Gate Threshold | Consensus Threshold |
|------|----------------|---------------------|
| mvp | 70% | 80% |
| standard | 95% | 90% |
| enterprise | 98% | 95% |

**Mark todo #1 as completed. Proceed to Phase 2.**

---

## PHASE 2: LOOP 3 - Implementation Agents

**Mark todo #2 as in_progress.**

**Spawn using Task tool with subagent_type="backend-developer":**

```
TASK: Implement for iteration ${ITERATION}: ${TASK_DESCRIPTION}

REQUIREMENTS:
1. Write tests FIRST (TDD)
2. Implement to make tests pass
3. Run: npm test
4. Report: { "tests_passed": N, "tests_total": M, "files_modified": [...] }

AGENT_ID: loop3-impl-${TASK_ID}-iter${ITERATION}
```

**WAIT for agent to complete and return results.**

**Mark todo #2 as completed. Proceed to Phase 3.**

---

## PHASE 3: GATE CHECK (Mandatory Before Loop 2)

**Mark todo #3 as in_progress.**

**YOU MUST RUN THIS - DO NOT SKIP:**

```bash
# Run tests
npm test 2>&1 | tee /tmp/test-output-${TASK_ID}.txt

# Parse results (adjust grep pattern for your test runner)
PASS_COUNT=$(grep -oP '\d+(?= pass)' /tmp/test-output-${TASK_ID}.txt | head -1 || echo 0)
TOTAL_COUNT=$(grep -oP '\d+(?= (test|spec))' /tmp/test-output-${TASK_ID}.txt | head -1 || echo 1)
PASS_RATE=$(echo "scale=2; $PASS_COUNT / $TOTAL_COUNT" | bc)

echo "Gate Check: ${PASS_COUNT}/${TOTAL_COUNT} = ${PASS_RATE}"
```

**DECISION POINT:**

```
IF pass_rate >= threshold:
    → Mark todo #3 completed
    → PROCEED to Phase 4 (Loop 2)

IF pass_rate < threshold:
    → Log: "Gate FAILED (${PASS_RATE} < ${THRESHOLD}). Iterating..."
    → ITERATION = ITERATION + 1
    → IF iteration > MAX_ITERATIONS: Report failure and EXIT
    → Reset todo #2 to pending, mark #3 as pending
    → GO BACK TO PHASE 2 (spawn Loop 3 again with failure context)
```

**DO NOT proceed to Loop 2 if gate failed. ITERATE.**

---

## PHASE 4: LOOP 2 - Validator Agents

**Mark todo #4 as in_progress.**

**ONLY execute this phase if Gate Check passed.**

**Spawn validators in parallel using Task tool:**

**Validator 1: code-reviewer**
```
TASK: Review implementation for: ${TASK_DESCRIPTION}

CHECKLIST:
- [ ] Tests exist and pass
- [ ] No hardcoded secrets
- [ ] Code follows project patterns

Return: PASS or FAIL with findings
AGENT_ID: loop2-reviewer-${TASK_ID}
```

**Validator 2: tester**
```
TASK: Validate test coverage for: ${TASK_DESCRIPTION}

Execute: npm test -- --coverage
Return: { "pass": true/false, "coverage": N%, "findings": [...] }
AGENT_ID: loop2-tester-${TASK_ID}
```

**Collect results from both validators.**

**Mark todo #4 as completed. Proceed to Phase 5.**

---

## PHASE 5: Product Owner Decision

**Mark todo #5 as in_progress.**

**Spawn Product Owner agent using Task tool with subagent_type="product-owner":**

```
TASK: Review validator feedback and make scope-aware decision

CONTEXT:
- Task: ${TASK_DESCRIPTION}
- Mode: ${MODE}
- Iteration: ${ITERATION}
- Gate pass rate: ${PASS_RATE}
- Epic file: ${EPIC_FILE_PATH} (if applicable)

VALIDATOR FEEDBACK:
${VALIDATOR_1_FEEDBACK}
${VALIDATOR_2_FEEDBACK}

YOUR RESPONSIBILITIES:
1. Review each validator finding
2. Classify each finding as IN-SCOPE or OUT-OF-SCOPE
3. OUT-OF-SCOPE items: Log for backlog, do NOT require iteration
4. IN-SCOPE items: Determine if they block PROCEED
5. **EPIC CONSISTENCY CHECK**: Identify naming/reference mismatches in epic document

EPIC CONSISTENCY CHECK:
- Compare implemented names (files, modules, functions) against epic references
- Flag mismatches (e.g., phase 1 creates "AuthService" but phase 3 references "AuthenticationService")
- If mismatches found: Update epic document to match implementation
- Document all corrections in epic_corrections field

DECISION CRITERIA:
- PROCEED: All in-scope requirements met, tests pass, no blocking issues
- ITERATE: In-scope issues remain that need fixing
- ABORT: Only for corruption, security vulnerabilities, or architectural dead-ends

RETURN FORMAT:
{
  "decision": "PROCEED" | "ITERATE" | "ABORT",
  "in_scope_findings": [...],
  "out_of_scope_findings": [...],
  "reasoning": "...",
  "iteration_guidance": "..." (if ITERATE),
  "epic_corrections": [
    {"location": "Phase 3, step 2", "was": "XY", "now": "X", "reason": "Match phase 1 implementation"}
  ]
}

AGENT_ID: product-owner-${TASK_ID}-iter${ITERATION}
```

**If epic_corrections returned:** Update the epic file to fix inconsistencies before next iteration.

**WAIT for Product Owner agent to return decision.**

**Handle Decision:**

```
IF decision == "PROCEED":
    → Mark todo #5 completed
    → Report success: "Task complete. Out-of-scope items logged to backlog."
    → EXIT

IF decision == "ITERATE":
    → Log: "PO requested iteration. In-scope issues: ${IN_SCOPE_FINDINGS}"
    → ITERATION = ITERATION + 1
    → IF iteration > MAX_ITERATIONS: Report and EXIT
    → Reset todos #2-#5 to pending
    → Include PO's iteration_guidance in next Loop 3 context
    → GO BACK TO PHASE 2

IF decision == "ABORT":
    → Log: "PO aborted: ${REASONING}"
    → Report failure with reasoning
    → EXIT
```

**The Product Owner is the ONLY agent that can approve PROCEED or request ABORT.**

---

## Iteration Context Injection

**When iterating, include this context for Loop 3 agents:**

```
PREVIOUS ITERATION FAILED:
- Iteration: ${ITERATION - 1}
- Gate pass rate: ${PASS_RATE}
- Validator feedback: ${FEEDBACK}
- Files with issues: ${PROBLEM_FILES}

FIX THESE SPECIFIC ISSUES before re-running tests.
```

**After 3 failed iterations, spawn root-cause-analyst before next Loop 3:**
```
Task(subagent_type="root-cause-analyst", prompt="Analyze repeated failures...")
```

---

## Quick Reference

| Phase | What Happens | Next If Success | Next If Fail |
|-------|--------------|-----------------|--------------|
| 1. Parse | Initialize vars | → Phase 2 | N/A |
| 2. Loop 3 | Implementation agents | → Phase 3 | Retry |
| 3. Gate | Test pass rate check | → Phase 4 | → Phase 2 (iterate) |
| 4. Loop 2 | Validator agents | → Phase 5 | Retry |
| 5. PO | Scope filter + decision | EXIT (PROCEED) | → Phase 2 (iterate) |

**Product Owner Role:**
- Filters validator feedback into IN-SCOPE vs OUT-OF-SCOPE
- OUT-OF-SCOPE items go to backlog, don't block PROCEED
- Only IN-SCOPE issues can trigger ITERATE
- ABORT is rare (corruption, security, dead-end architecture)
- **Epic consistency**: Fixes naming mismatches between phases (e.g., "X" vs "XY")

---

## Reminders

- **DO NOT skip Gate Check** - Phase 3 is mandatory after every Loop 3
- **DO NOT spawn Loop 2 if gate failed** - Iterate Loop 3 instead
- **DO NOT skip Product Owner** - Only PO can approve PROCEED
- **DO NOT iterate on out-of-scope items** - PO filters these to backlog
- **DO NOT stop on test failures** - That's what iteration fixes
- **DO NOT ask the user questions** - Make reasonable assumptions and iterate
- **DO update todos** - This tracks your state as coordinator
- **DO pass validator feedback to PO** - PO needs full context to decide
- **DO inject PO guidance into next iteration** - Use iteration_guidance from PO
- **DO spawn agents to investigate unknowns** - Instead of asking user

**When to escalate to user (ONLY these cases):**
- Access denied / permission errors
- Irreversible destructive action needed
- Major regression detected (tests were passing, now failing)
- Structural mismatch with existing codebase
- Unclear requirements (helps improve epic creation process)

---

**Version:** 2.2.0 | **Date:** 2026-01-13 | Added 0/0 policy, epic consistency check, autonomous progression
