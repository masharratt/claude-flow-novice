# Error Analysis Flow in CFN Loop (Current vs Ideal)

## Current System (TDD v3.0)

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Loop 3 Agents (Iteration 1)                                        │
│ - Write code                                                        │
│ - Execute tests via gate-check.sh                                  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ gate-check.sh --success-criteria <JSON>                            │
│                                                                     │
│ 1. Executes test suites: npm test -- auth.test.ts                 │
│ 2. Captures raw test output (stdout/stderr)                        │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ parse-test-results.sh "jest" <test_output>                         │
│                                                                     │
│ Parses output and extracts:                                        │
│ {                                                                   │
│   "framework": "jest",                                              │
│   "total_tests": 10,                                                │
│   "passed_tests": 8,                                                │
│   "failed_tests": 2,                                                │
│   "pass_rate": 0.80,                                                │
│   "failed_test_names": [                                            │
│     "JWT authentication › should reject expired tokens",            │
│     "JWT authentication › should refresh tokens correctly"          │
│   ]                                                                 │
│ }                                                                   │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ gate-check.sh stores results                                        │
│                                                                     │
│ CLI Mode:                                                           │
│   redis-cli HSET task:$TASK_ID:gate test_results <JSON>           │
│                                                                     │
│ Task Mode:                                                          │
│   /tmp/cfn-gate-results/$TASK_ID.results.json                     │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ generate_iteration_context() (line 355-383)                        │
│                                                                     │
│ Creates: /tmp/cfn-iteration-context-$TASK_ID.json                 │
│ {                                                                   │
│   "gate_status": "failed",                                          │
│   "pass_rate": 0.80,                                                │
│   "threshold": 0.95,                                                │
│   "gap": 0.15,                                                      │
│   "failed_tests": [                                                 │
│     {                                                               │
│       "name": "JWT authentication",                                 │
│       "pass_rate": 0.80,                                            │
│       "failed_test_names": [...]                                    │
│     }                                                               │
│   ]                                                                 │
│ }                                                                   │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       │ 🚨 GAP: File created but NEVER consumed
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ orchestrate.sh spawns Loop 3 agents (Iteration 2)                  │
│                                                                     │
│ Calls: build_agent_context($task_id, $iteration=2, ...)           │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ build_agent_context() (line 375-454)                               │
│                                                                     │
│ Assembles context from:                                            │
│ ✅ Redis/SUCCESS_CRITERIA (task_desc, deliverables)               │
│ ✅ Iteration number                                                │
│ ✅ Feedback parameter (if provided)                                │
│ ✅ Epic/Phase context                                              │
│ ✅ CFN Loop context injection                                      │
│                                                                     │
│ ❌ MISSING: Test failure diagnostics from iteration N-1            │
│                                                                     │
│ Returns:                                                            │
│ "Task: Implement JWT auth | Deliverables: auth.ts |               │
│  Iteration: 2 | Feedback: <none>"                                  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Loop 3 Agents (Iteration 2)                                        │
│                                                                     │
│ ❌ No context about WHY iteration 1 failed                         │
│ ❌ No failed test names                                            │
│ ❌ Must re-discover issues blindly                                 │
│                                                                     │
│ Result: 3.2 avg iterations to pass (old TDD data)                  │
└─────────────────────────────────────────────────────────────────────┘
```

## What's Actually Happening

**Question: "Where in the loop process does the error analysis come from?"**

**Answer:**

1. **Error data IS captured** via `parse-test-results.sh` (lines 4-40):
   - Extracts `failed_test_names` from Jest/Mocha/Pytest output
   - Example: `["JWT authentication › should reject expired tokens"]`

2. **Error data IS stored** in two places:
   - Redis: `task:$TASK_ID:gate` hash with `test_results` field
   - File: `/tmp/cfn-iteration-context-$TASK_ID.json`

3. **Error data is NOT consumed** by next iteration:
   - `build_agent_context()` doesn't read iteration context file
   - Agents spawn with NO knowledge of previous failures
   - Must blindly try fixes without diagnostic guidance

## The Missing Piece

**Current `build_agent_context()` output for Iteration 2:**
```text
Task: Implement JWT authentication middleware |
Deliverables: src/middleware/auth.ts, tests/middleware/auth.test.ts |
Iteration: 2 |
Feedback: <empty>
```

**What TDD-Aware Conversation Coordinator would add:**
```text
Task: Implement JWT authentication middleware |
Deliverables: src/middleware/auth.ts, tests/middleware/auth.test.ts |
Iteration: 2 |
Previous Test Results (Iteration 1):
  ❌ Pass Rate: 80% (8/10 tests passed)
  ❌ Failed Tests:
     1. "JWT authentication › should reject expired tokens"
        → Check token expiry validation logic
     2. "JWT authentication › should refresh tokens correctly"
        → Verify refresh endpoint returns 200, not 401 |
Feedback: Focus on token expiry and refresh endpoint
```

## Why This Matters

**Without test diagnostics in iteration context:**
- Agent guesses what failed ❌
- Tries random fixes ❌
- 3.2 avg iterations (old data from TDD guide)
- Wasted compute on redundant test runs

**With test diagnostics in iteration context:**
- Agent sees exact failed test names ✅
- Targets specific issues ✅
- **Expected: 1.8 avg iterations (44% reduction from TDD guide)**
- Same number of test runs, but faster convergence

## Code References

**Where data is captured:**
- `.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh:7-40` (failed_test_names extraction)
- `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh:333-352` (store_test_results)
- `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh:355-383` (generate_iteration_context)

**Where data should be consumed (but isn't):**
- `.claude/skills/cfn-loop-orchestration/orchestrate.sh:375-454` (build_agent_context)

**Gap to fix:**
```bash
# Add to build_agent_context() around line 435:

# Inject test failure diagnostics from previous iteration
if [ "$iteration" -gt 1 ]; then
    prev_iteration=$((iteration - 1))
    iteration_context_file="/tmp/cfn-iteration-context-${task_id}.json"

    if [ -f "$iteration_context_file" ]; then
        failed_tests=$(jq -r '.failed_tests[] |
            "❌ " + .name + " (pass_rate: " + (.pass_rate | tostring) + ")"' \
            "$iteration_context_file" 2>/dev/null)

        if [ -n "$failed_tests" ]; then
            context="$context | Previous Test Failures: $failed_tests"
        fi
    fi
fi
```

## Bottom Line

**You asked: "Where does error analysis come from?"**

**Answer:** Error analysis is **captured** by `parse-test-results.sh` and **stored** by `gate-check.sh`, but **never injected** into the next iteration's agent context.

This is the exact gap that a TDD-aware conversation coordinator would fill - turning captured diagnostics into actionable iteration context.
