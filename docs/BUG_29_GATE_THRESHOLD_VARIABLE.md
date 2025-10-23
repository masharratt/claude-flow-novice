# BUG #29: Unbound Variable $GATE_THRESHOLD

**Status:** RESOLVED (2025-10-23)
**Discovered:** 2025-10-23 (Phase 4 execution)
**Severity:** P0 - Orchestrator crashes after gate check
**Resolution Time:** 5 minutes

## Summary

Orchestrator used undefined variable `$GATE_THRESHOLD` instead of defined variable `$GATE` in gate pass logging statement, causing bash `set -u` to trigger unbound variable error and crash the orchestrator immediately after Loop 3 completes and gate check passes.

## Root Cause

**Incorrect Variable Name:**
```bash
# Line 1230: WRONG
echo "[Loop 3] ✅ Gate PASSED (consensus: $LOOP3_CONSENSUS >= $GATE_THRESHOLD)"

# Variable definitions in orchestrator:
GATE=0.75  # Line 152 (from --mode parameter or success criteria)
# No $GATE_THRESHOLD variable exists
```

**Why This Causes Crash:**
- Orchestrator runs with `set -u` (line 2) - treat unset variables as error
- When `$GATE_THRESHOLD` is referenced but not defined → bash exits immediately
- Happens AFTER gate check passes but BEFORE Loop 2 spawn
- Result: Loop 3 completes successfully, gate passes, but Loop 2 never spawns

## Evidence

**Phase 4 Execution Log:**
```
[Loop 3] Average confidence: 10.00 (from 1/1 agents)
[Deliverable Check] ✅ Deliverables verified - proceeding to gate check

✅ Gate PASSED (10.00 >= 0.75)

./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh: line 1230: GATE_THRESHOLD: unbound variable
```

**Impact:**
- Loop 3: ✅ Complete (backend-dev confidence: 10.0, all 3 deliverables created)
- Gate Check: ✅ PASSED (10.0 >= 0.75)
- Line 1230: ❌ CRASH (unbound variable)
- Loop 2: ❌ NEVER SPAWNED
- Product Owner: ❌ NEVER CONSULTED
- Phase 4 Deliverables: ✅ CREATED (but validation incomplete)

## Fix Applied

orchestrate-cfn-loop.sh:1230

```bash
# BEFORE (line 1230):
echo "[Loop 3] ✅ Gate PASSED (consensus: $LOOP3_CONSENSUS >= $GATE_THRESHOLD)"

# AFTER (line 1230):
echo "[Loop 3] ✅ Gate PASSED (consensus: $LOOP3_CONSENSUS >= $GATE)"
```

**Validation:**
- Syntax check: PASSED (`bash -n orchestrate-cfn-loop.sh`)
- Post-edit hook: PASSED (security clean, high complexity)
- Consistent with other gate references: ✅ (line 1222, 1216 already use `$GATE`)

## Why This Wasn't Caught Earlier

1. **Gate failure path untested:** Previous phases (1-3) had high Loop 3 confidence, gate check passed, but error occurred AFTER gate check logic
2. **BUG #28 masked the issue:** Gate ACK protocol was removed in previous session; this code path (simple gate signal) was only recently restored
3. **Variable inconsistency:** Most code uses `$GATE` correctly (lines 1216, 1222), but single echo statement used wrong name

## Related Issues

- **BUG #28:** Gate ACK Protocol Blocking (removed in previous session)
- **Phase 2 Removal:** Gate ACK code cleanup restored simple gate signal path, exposing this variable name bug

## Impact Analysis

**Phases Affected:**
- Phase 4: Deliverables created but validation incomplete (Loop 2 never ran)
- All future phases: Would crash at same point

**Detection:**
- Discovered immediately during Phase 4 execution (~2 minutes after Loop 3 completion)
- Error message clear: "line 1230: GATE_THRESHOLD: unbound variable"

**Cost Impact:**
- Phase 4 backend-dev agent: ~2 minutes execution time
- No wasted validator calls (Loop 2 never spawned)
- Minimal impact: Single agent call, immediate error detection

## Prevention

**Testing Recommendation:**
Add test case for gate threshold variable consistency:

```bash
# Test: Verify all gate threshold references use $GATE
test_gate_variable_consistency() {
  local script="./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh"

  # Should find $GATE references
  grep -n '\$GATE' "$script" | grep -v GATE_PASS

  # Should NOT find $GATE_THRESHOLD references
  if grep -n '\$GATE_THRESHOLD' "$script"; then
    echo "❌ Found incorrect \$GATE_THRESHOLD usage"
    return 1
  fi

  echo "✅ Gate variable consistency check passed"
  return 0
}
```

**Code Review Checklist:**
- Verify variable names match definitions before commit
- Test both gate PASS and FAIL paths
- Run `bash -n` syntax check on all bash scripts
- Use `set -u` in all coordination scripts (already enabled, worked as designed)

---

**Created:** 2025-10-23
**Resolved:** 2025-10-23
**Priority:** P0 (blocks all CFN Loop execution)
**Resolution Time:** 5 minutes (detection + fix + validation)
