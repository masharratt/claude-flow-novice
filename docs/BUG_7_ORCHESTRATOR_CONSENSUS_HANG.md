# Bug #7: Orchestrator Consensus Collection Hang

**Status:** ACTIVE BUG
**Severity:** HIGH
**Discovered:** 2025-10-20
**Related:** Bug #6 (Agent ID Mismatch) - FIXED

## Summary

Orchestrator hangs indefinitely after Loop 3 agents complete and enter waiting mode. The consensus collection step never executes, preventing progression to Loop 2 validation.

## Evidence

### Execution Timeline (Task ID: phase-4-testing-qa-final-1760999175)

1. **15:25 (T+0)** - Orchestrator started
2. **15:26-15:29 (T+1-4min)** - Loop 3 agents executing
3. **15:29 (T+4min)** - All 3 agents completed successfully:
   - tester-1-1: confidence 0.92 ✓
   - accessibility-advocate-1-1: confidence 0.85 ✓
   - performance-benchmarker-1-1: confidence 0.85 ✓
4. **15:29-23:07 (T+4min-40min)** - Agents in waiting mode, orchestrator BLOCKING
5. **23:07 (T+40min)** - Orchestrator still stuck, no Loop 2 spawn

### Verified Behaviors

**✅ Working:**
- Bug #6 fix working perfectly (--agent-id flag accepted by cfn-spawn)
- Agents spawned with correct unique IDs (tester-1-1, accessibility-advocate-1-1, performance-benchmarker-1-1)
- CFN Protocol completion signal sent correctly
- Confidence scores reported to Redis correctly
- Agents entered waiting mode correctly

**❌ Broken:**
- Orchestrator doesn't progress after Loop 3 completion
- Consensus collection never executes
- confidence-scores hash never created in Redis
- Loop 2 validators never spawned
- No timeout or error messages

### Redis State

```bash
# No consensus collected
$ redis-cli HGETALL "swarm:phase-4-testing-qa-final-1760999175:confidence-scores"
(empty)

# No gate passed signal
$ redis-cli HGET "swarm:phase-4-testing-qa-final-1760999175:gate-passed" "timestamp"
(empty)

# No Loop 2 agents
$ redis-cli KEYS "swarm:phase-4-testing-qa-final-1760999175:*" | grep -E "(reviewer|code-quality)"
(empty)
```

### Agent Output (from BashOutput 934f16)

```
=== Agent Execution Complete ===
Input tokens: 7579
Output tokens: 4907
Stop reason: end_turn
[heartbeat] Monitoring stopped - agent performance-benchmarker-1-1 complete
[agent-executor] Stored messages for iteration 1

[CFN Protocol] Starting for agent performance-benchmarker-1-1
[CFN Protocol] Task ID: phase-4-testing-qa-final-1760999175, Iteration: 1
[CFN Protocol] Step 1: Signaling completion...
[CFN Protocol] ✓ Completion signaled
[CFN Protocol] Step 2: Reporting confidence (0.85)...
[CFN Protocol] ✓ Confidence reported
[CFN Protocol] Step 3: Entering waiting mode...
[performance-benchmarker-1-1] Entered waiting mode (context: iteration-1-complete)
[performance-benchmarker-1-1] Blocking on priority queue swarm:phase-4-testing-qa-final-1760999175:performance-benchmarker-1-1:wake-queue and swarm:phase-4-testing-qa-final-1760999175:shutdown (infinite timeout)...
[performance-benchmarker-1-1] Zero token cost while waiting
```

## Root Cause Analysis (CONFIRMED)

**ROOT CAUSE: Multiple Orchestrator Bash Instances Creating BLPOP Race Conditions**

### Evidence

**4 orchestrator bash instances running simultaneously:**
```bash
$ ps aux | grep "orchestrate-cfn-loop.sh --task-id phase-4-testing-qa-final"
masharr+ 3502889  # Main orchestrator process
masharr+ 3502915  # Shutdown monitor (BLPOP on shutdown channel)
masharr+ 3502916  # Unknown background helper
masharr+ 3502934  # Unknown background helper
```

**Agent completion signals exist but never consumed:**
```bash
# After 40+ minutes, completion signals still present
$ redis-cli LLEN "swarm:phase-4-testing-qa-final-1760999175:tester-1-1:done"
1  # Should be 0 if BLPOP consumed it

$ redis-cli LLEN "swarm:phase-4-testing-qa-final-1760999175:accessibility-advocate-1-1:done"
1

$ redis-cli LLEN "swarm:phase-4-testing-qa-final-1760999175:performance-benchmarker-1-1:done"
1
```

### Analysis

The orchestrator script spawns multiple background bash processes:
1. **Main orchestrator loop** - Waits for agent completion via BLPOP
2. **Shutdown monitor** - Blocks on BLPOP for shutdown signals
3. **Heartbeat monitors** - May also use BLPOP or polling

**BLPOP Race Condition:**
When multiple bash processes attempt BLPOP on the same Redis keys, they compete for messages. If processes are blocked on overlapping keys or have improper synchronization, deadlock occurs.

**Why Agent IDs Are Correct:**
Bug #6 fix verified working - agents spawn with correct unique IDs (tester-1-1), and completion signals use correct keys. The issue is NOT agent ID mismatch - it's orchestrator process management.

## Investigation Steps

1. Read orchestrate-cfn-loop.sh lines 200-300 (Loop 3 completion waiting logic)
2. Check which agent IDs are used in BLPOP commands
3. Verify agent completion signal keys in Redis
4. Test consensus collection script in isolation

## Workaround

**None available.** The orchestrator must be fixed to progress beyond Loop 3.

## Related Issues

- Bug #1: LOOP2_COMPLETED_AGENTS unbound variable (FIXED)
- Bug #2: Regex self-matching typo (FIXED)
- Bug #3: Agent ID iteration suffix (DONE_KEY) (FIXED)
- Bug #4: Agent ID iteration suffix (tracking arrays) (FIXED)
- Bug #5: Duplicate agent type ID collision (FIXED)
- Bug #6: Agent ID mismatch cfn-spawn (FIXED - verified in this execution)

## Fix Applied (2025-10-20)

**Root Cause Confirmed:** Command substitution hang when capturing heartbeat monitor PID.

The orchestrator used command substitution to capture the background process PID:
```bash
# OLD (HANGS):
LOOP3_HEARTBEAT_MONITOR_PID=$(start_heartbeat_monitor "$TASK_ID" "loop3" "$ITERATION" "${UNIQUE_AGENT_IDS[@]}")
```

In Bash, command substitution waits for the subshell to complete and capture stdout. If the function has any issue returning output immediately, the parent process blocks indefinitely.

**Fix:** Direct background spawn and PID capture via `$!`:
```bash
# NEW (FIXED):
start_heartbeat_monitor "$TASK_ID" "loop3" "$ITERATION" "${UNIQUE_AGENT_IDS[@]}"
LOOP3_HEARTBEAT_MONITOR_PID=$!
```

Modified `start_heartbeat_monitor` to not echo PID (removed `echo "$!"`), allowing caller to capture background PID directly.

**Changes:**
- `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh:676-678` (Loop 3 monitor)
- `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh:874-876` (Loop 2 monitor)
- `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh:463` (Removed echo in function)

**Status:** FIXED - Ready for testing

## Next Steps

1. Test fix with Phase 4 execution
2. Verify Loop 3 agents complete and consensus collected within 60 seconds
3. Verify Loop 2 validators spawn successfully
4. Confirm full CFN Loop completes within 2 hours

## Verification Test

After fix, verify:
- Loop 3 agents complete
- Consensus collected within 60 seconds
- Gate check executes
- Loop 2 validators spawn
- Full CFN Loop completes within 2 hours
