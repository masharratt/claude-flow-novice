# BUG #32: Orchestrator Stops After Loop 3 Completion

## Status
**ACTIVE** - Critical blocker for CFN v3 production readiness

## Severity
**P0** - Prevents end-to-end CFN Loop validation

## Description
Orchestrator successfully completes Loop 3 agent spawning and confidence collection but does not continue to gate-check, Loop 2 spawning, or Product Owner decision.

## Reproduction
```bash
TASK_ID="cfn-v3-final-1761324119"
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "interaction-tester,backend-dev,researcher" \
  --loop2-agents "reviewer,architect,interaction-tester" \
  --product-owner "product-owner" \
  --max-iterations 10
```

**Result:** Orchestrator spawns Loop 3 agents, agents complete successfully, orchestrator exits without continuing to Loop 2.

## Evidence

### Loop 3 Completion (Successful)
```json
{
  "backend-dev-1-1": {
    "confidence": 0.85,
    "iteration": 1,
    "timestamp": 1761324125
  },
  "interaction-tester-1-1": {
    "confidence": 0.85,
    "iteration": 1,
    "timestamp": 1761324144
  },
  "researcher-1-1": {
    "confidence": 0.85,
    "iteration": 1,
    "timestamp": 1761324165
  }
}
```

### Redis State After Orchestrator Exit
- **Total keys:** 10
- **Loop 3 keys:** 9 (agent results, messages, PIDs, agent_ids)
- **Loop 2 keys:** 0
- **Gate-passed signal:** Not found
- **Orchestrator status:** Not found

### Manual Gate-Check Validation
```bash
$ ./helpers/gate-check.sh \
    --task-id "cfn-v3-final-1761324119" \
    --agents "backend-dev-1-1,interaction-tester-1-1,researcher-1-1" \
    --threshold 0.75 \
    --min-quorum 0.66

✅ Gate PASSED - Loop 3 self-validation successful
Consensus: 0.85
Threshold: 0.75
```

**Manual gate-check WORKS** when run independently - orchestrator should have continued.

## Hypotheses

### H1: Bash Tool Timeout (UNLIKELY)
- Orchestrator called with 600000ms (10min) timeout
- Loop 3 agents completed in 46 seconds
- Bash tool should not have timed out

### H2: Orchestrator Silent Exit (LIKELY)
- Orchestrator completed but did not output final status
- No error message in stdout/stderr
- Suggests orchestrator may have exited normally after agent completion
- Possible missing continuation logic after agent PID waiting

### H3: Agent Error Propagation (POSSIBLE)
- Agents hit max_iterations (10) due to missing rg tool
- stderr contains multiple "[executeWithTools] Reached max iterations (10)"
- Orchestrator may interpret agent iteration limit as fatal error
- But agents completed CFN protocol successfully (confidence reported)

### H4: Missing Gate-Check Execution (MOST LIKELY)
- Gate-check script not invoked by orchestrator
- No gate-passed signal in Redis
- No Loop 2 spawning occurred
- Suggests orchestrator logic gap between agent completion and gate-check

## Investigation Steps

### 1. Add Orchestrator Logging
```bash
# In orchestrate.sh after agent completion
echo "[DEBUG] All agents completed - proceeding to gate-check"
echo "[DEBUG] Agent IDs: $LOOP3_IDS"
echo "[DEBUG] Gate threshold: $GATE"
```

### 2. Verify Wait Logic
Check if orchestrator waits for agent processes correctly:
```bash
# In helpers/agent-spawner.sh
for pid in "${AGENT_PIDS[@]}"; do
  if wait "$pid"; then
    echo "[DEBUG] Agent $pid completed successfully"
  else
    echo "[ERROR] Agent $pid failed with exit code $?"
  fi
done
```

### 3. Test Gate-Check Integration
Run orchestrator with verbose logging to trace execution path.

### 4. Validate Exit Code Handling
Check if orchestrator exits on agent error even when CFN protocol succeeds.

## Root Cause Analysis

### Primary Issue
Orchestrator appears to exit after completing agent PID wait loop without executing subsequent steps (gate-check, Loop 2 spawning, Product Owner decision).

### Evidence
1. Loop 3 agents completed successfully (0.85 confidence)
2. Agent IDs stored correctly in Redis (SMEMBERS works)
3. Manual gate-check passes (0.85 >= 0.75)
4. No Loop 2 or Product Owner keys in Redis
5. No error messages in orchestrator output

### Likely Code Path
1. ✅ Orchestrator spawns Loop 3 agents via helpers/agent-spawner.sh
2. ✅ Agents execute and report confidence to Redis
3. ✅ Agents complete CFN protocol (signal done, report confidence, exit)
4. ✅ Orchestrator collects agent PIDs and waits
5. ❌ Orchestrator exits or fails silently after wait completes
6. ❌ Gate-check never executed
7. ❌ Loop 2 never spawned

## Impact

### Validation Blocked
- Cannot validate complete CFN Loop flow
- Cannot test Loop 2 consensus validation
- Cannot test Product Owner decision logic
- Cannot achieve 0.85+ architecture confidence target

### BUG #29/#31 Status
- **BUG #31 (data format):** ✅ RESOLVED - Results stored/retrieved correctly
- **BUG #29 (agent ID storage):** ✅ RESOLVED - IDs stored in set correctly
- **BUG #32 (orchestrator incomplete):** ❌ NEW BLOCKER

## Recommended Fix

### Option 1: Add Explicit Continuation Logic (Immediate)
```bash
# In orchestrate.sh after agent completion
echo "[CHECKPOINT] Loop 3 complete - starting gate-check"

# Force gate-check execution
if ! "$HELPERS_DIR/gate-check.sh" ...; then
  echo "❌ Gate-check failed"
  exit 1
fi

echo "[CHECKPOINT] Gate-check complete - spawning Loop 2"
```

### Option 2: Investigate Wait Logic (Diagnostic)
Add comprehensive logging to identify exact exit point.

### Option 3: Background Execution with Status File (Robust)
```bash
# Run orchestrator in background with status tracking
./orchestrate.sh ... > orchestrator.log 2>&1 &
ORCH_PID=$!

# Monitor status file
while kill -0 $ORCH_PID 2>/dev/null; do
  redis-cli get "cfn_loop:orchestrator:status"
  sleep 5
done
```

## Next Steps

1. **[P0]** Add checkpoint logging to orchestrator.sh
2. **[P0]** Rerun CFN v3 validation with verbose logging
3. **[P0]** Identify exact line where orchestrator stops
4. **[P1]** Fix orchestrator continuation logic
5. **[P1]** Add orchestrator health monitoring
6. **[P2]** Add rg tool to agent environment (reduce agent iterations)

## Validation Criteria

Fix considered complete when:
- [ ] Orchestrator continues past Loop 3 completion
- [ ] Gate-check executes and produces gate-passed signal
- [ ] Loop 2 agents spawn after gate pass
- [ ] Product Owner spawns after Loop 2 consensus
- [ ] Complete end-to-end CFN Loop execution verified
- [ ] Architecture confidence >= 0.85 achieved

## Related Documentation
- `/tests/cfn-v3/results/CFN_V3_FINAL_VALIDATION_RESULT.json`
- `.claude/skills/cfn-loop-orchestration/orchestrate.sh` (line 749: gate-check)
- `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`
- `docs/BUG_29_AGENT_ID_TRACKING.md` (resolved)
- `docs/BUG_31_DATA_FORMAT_MISMATCH.md` (resolved)
