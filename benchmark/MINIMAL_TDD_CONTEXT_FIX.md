# Minimal Fix: Inject Test Diagnostics into Iteration Context

## Problem
Test failure diagnostics are **captured** by `gate-check.sh` but **not consumed** by next iteration agents.

## Solution
**Piggyback on existing `build_agent_context()` function** - add 15 lines of code.

## The Change

**File:** `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
**Function:** `build_agent_context()` (line 375-454)
**Location:** After line 433 (where iteration is added)

### Current Code (lines 433-437)
```bash
context="$context | Iteration: $iteration"

if [[ -n "$feedback" ]]; then
    context="$context | Feedback: $feedback"
fi
```

### Enhanced Code (add after line 433)
```bash
context="$context | Iteration: $iteration"

# Inject test failure diagnostics from previous iteration
if [ "$iteration" -gt 1 ]; then
    local iteration_context_file="/tmp/cfn-iteration-context-${task_id}.json"

    if [ -f "$iteration_context_file" ]; then
        # Extract failed test summary
        local failed_summary=$(jq -r '
            if .failed_tests and (.failed_tests | length > 0) then
                "Previous Test Results (Iteration " + (.iteration // "N/A" | tostring) + "): " +
                "Pass Rate: " + (.pass_rate * 100 | tostring) + "% | " +
                "Failed Tests: " +
                ([.failed_tests[] | .failed_test_names[]? // empty] | join(", "))
            else
                empty
            end
        ' "$iteration_context_file" 2>/dev/null)

        if [ -n "$failed_summary" ]; then
            context="$context | $failed_summary"
        fi
    fi
fi

if [[ -n "$feedback" ]]; then
    context="$context | Feedback: $feedback"
fi
```

## What This Does

**Before (Iteration 2 context):**
```
Task: Implement JWT auth |
Deliverables: auth.ts, auth.test.ts |
Iteration: 2 |
Feedback: <empty>
```

**After (Iteration 2 context):**
```
Task: Implement JWT auth |
Deliverables: auth.ts, auth.test.ts |
Iteration: 2 |
Previous Test Results (Iteration 1): Pass Rate: 80% |
Failed Tests: JWT authentication › should reject expired tokens,
             JWT authentication › should refresh tokens correctly |
Feedback: <empty>
```

## Implementation Effort

**Complexity:** Trivial
**Lines of code:** ~15
**Files changed:** 1 (`orchestrate.sh`)
**Testing required:** Run one CFN Loop task with intentional test failures
**Risk:** Very low (only adds context, doesn't change logic)

## Expected Impact

**Current system:**
- Iteration 1: 80% pass → ITERATE (no context passed)
- Iteration 2: Agent guesses fixes → 90% pass → ITERATE
- Iteration 3: Agent guesses again → 100% pass → PROCEED
- **Total: 3 iterations**

**With this fix:**
- Iteration 1: 80% pass → ITERATE (diagnostics captured)
- Iteration 2: Agent sees exact failures → targets fixes → 100% pass → PROCEED
- **Total: 2 iterations (33% reduction)**

Based on TDD guide stats: **Expected 44% iteration reduction** (3.2 avg → 1.8 avg)

## Why This Beats Full Conversation Coordinator

**Full Conversation Coordinator:**
- Multi-turn conversation history
- Redis-backed persistence
- Pruning strategies
- Conversation memory management
- **Effort:** 3 weeks
- **Complexity:** High

**This Minimal Fix:**
- Uses existing `generate_iteration_context()` output
- Piggybacks on existing `build_agent_context()` flow
- Reads file that's already being created
- **Effort:** 1 hour
- **Complexity:** Trivial

## Trade-offs

**What you GET:**
✅ Test diagnostics in next iteration
✅ 44% iteration reduction (from TDD guide)
✅ Zero architectural changes
✅ Works with current CLI/Task mode

**What you DON'T get:**
❌ Multi-turn conversation beyond test results
❌ Manual refinement across iterations
❌ Conversation pruning strategies
❌ Long-term conversation memory

## Recommendation

**Start with this minimal fix:**
1. Implement 15-line enhancement to `build_agent_context()`
2. Run 5-10 CFN Loop tasks to measure iteration reduction
3. **IF** you need more sophisticated conversation management → build full coordinator
4. **IF** this solves 80% of the problem → stop here

**Why:** 80/20 rule - get 80% of the benefit with 5% of the effort.

## Next Step

Want me to:
1. **Implement this minimal fix** (make the code change)?
2. **Write a test case** to validate it works?
3. **Skip it** and focus on other priorities?
