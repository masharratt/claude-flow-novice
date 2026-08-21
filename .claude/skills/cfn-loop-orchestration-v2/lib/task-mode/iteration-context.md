<!-- Extracted from .claude/commands/cfn-loop-task.md so the command body stays
     small. Read on demand from the phase that needs it. -->
# Iteration context injection (iteration 2+)

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
