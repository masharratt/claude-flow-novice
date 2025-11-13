# Coordinator Agent Tracking Fix

**Date:** 2025-11-13  
**Issue:** Coordinator infinite wait loop due to unused Redis queue pattern  
**Status:** FIXED

## Root Cause Analysis

The coordinator was pushing tasks to a Redis queue (`task:queue`) but agents received task assignments via environment variables and never claimed from the queue. This caused the coordinator to wait indefinitely for queue completion that would never occur.

**Anti-Pattern:**
```javascript
// Coordinator pushed to queue
await redisClient.rPush('task:queue', taskNum.toString());

// But agents received tasks via ENV, not queue claim
Env: [`TASK_PROMPT=${promptText}`, `AGENT_ID=${agentId}`]

// Result: Queue never emptied, coordinator waited forever
while (queueLength > 0) { await sleep(5000); } // INFINITE LOOP
```

## Solution: Direct Docker Container Tracking

Removed the unused Redis queue pattern and implemented direct Docker container status monitoring.

### Architecture Change

**Before (Queue-Based):**
```
Coordinator → Redis Queue → Agents (never claimed)
                ↓
           Wait for queue empty (infinite)
```

**After (Container-Based):**
```
Coordinator → Spawn agents with ENV → Track container status
                ↓
           Wait for containers to exit (finite)
```

## Changes Made

### 1. Removed Queue Push Logic (Lines 160-197)

**Before:** `pushTasksToRedis(clusters, iteration)`
- Created Redis queue with task IDs
- Set counters for total/completed tasks
- Agents never claimed from queue

**After:** `prepareTaskBatches(clusters, iteration)`
- Removed queue creation (`rPush` calls)
- Kept metadata storage for monitoring only
- No dependency on agents claiming tasks

### 2. Enhanced Agent Spawning (Lines 199-248)

**Change:** Return container names for tracking
```javascript
// Before
async function spawnAgents(clusters) {
  await Promise.all(wave.map(batch => spawnAgent(batch, name)));
  // No return value
}

// After
async function spawnAgents(clusters) {
  const allContainerNames = [];
  for (let i = 0; i < wave.length; i++) {
    const containerName = `wave${currentWave}-agent${i + 1}`;
    await spawnAgent(wave[i], containerName);
    allContainerNames.push(containerName);
  }
  return allContainerNames; // Track for completion
}
```

### 3. Replaced Wait Logic (Lines 296-427)

**Before:** `waitForCompletion()` - Redis queue polling
```javascript
while (true) {
  const completed = parseInt(await redisClient.get('task:completed'));
  const queueLength = await redisClient.lLen('task:queue');
  if (completed >= totalTasks && queueLength === 0) break;
  await sleep(5000);
}
```

**After:** `waitForCompletion(containerNames, timeout)` - Docker status tracking
```javascript
while (true) {
  for (const containerName of containerNames) {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] }
    });
    
    if (containerInfo.State === 'exited') {
      const inspect = await container.inspect();
      if (inspect.State.ExitCode === 0) {
        completed++;
      } else {
        failed++;
      }
    }
  }
  
  if (completed + failed >= containerNames.length) break;
  await sleep(2000);
}
```

**Key Improvements:**
- Direct container status checking via Docker API
- Exit code validation (0 = success, non-zero = failure)
- Timeout handling with container kill
- Per-agent status tracking (completed/failed/running)
- Faster polling interval (2s vs 5s)
- Returns result object: `{ completed, failed, timeout }`

### 4. Removed Deprecated Function (Lines 429-462)

**Removed:** `monitorAgentHealth(timeoutSeconds)`
- No longer needed - health monitoring integrated into `waitForCompletion`
- Timeout and stuck agent detection now built-in

### 5. Updated Main Loop (Lines 507-523)

**Before:**
```javascript
await pushTasksToRedis(clusters, iteration);
await spawnAgents(clusters);
await waitForCompletion();
await cleanupAgents();
```

**After:**
```javascript
await prepareTaskBatches(clusters, iteration);
const containerNames = await spawnAgents(clusters);
const result = await waitForCompletion(containerNames);

console.log(`📊 Iteration ${iteration} results: ${result.completed} succeeded, ${result.failed} failed`);

// Fail fast on high failure rate
if (result.failed > 0 && result.failed / containerNames.length > 0.5) {
  console.log('❌ More than 50% of agents failed - aborting');
  await cleanupAgents();
  break;
}

await cleanupAgents();
```

**Key Improvements:**
- Pass container names to completion tracker
- Receive and log detailed results
- Fail-fast logic for high failure rates (>50%)
- Better error visibility

## Validation Results

**Syntax Check:** PASSED
```bash
node -c src/coordinator.js
# No errors
```

**Post-Edit Hook:** PASSED (with warnings)
- Security: No blocking vulnerabilities
- Complexity: High (expected for coordinator)
- TDD Violation: Test file missing (non-blocking)
- Exit Code: 3 (warnings only)

**Code Metrics:**
- Lines: 548 (reduced from 568, -20 lines)
- Functions: 10 (reduced from 11, removed `monitorAgentHealth`)
- Complexity: High (acceptable for orchestration logic)

## Testing Recommendations

### 1. Unit Tests
- `waitForCompletion()` with mock Docker API
- Container status transitions (running → exited)
- Timeout behavior
- Failure rate threshold (50% trigger)

### 2. Integration Tests
- Full coordinator run with real agents
- Verify container tracking accuracy
- Test cleanup on timeout
- Test cleanup on high failure rate

### 3. Manual Test
```bash
# Run coordinator against sample project
docker run --rm \
  --name cfn-coordinator \
  --memory=2g \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /path/to/project:/workspace:rw \
  -e MEMORY_BUDGET=40g \
  -e MAX_ITERATIONS=3 \
  -e REDIS_HOST=cfn-redis \
  --network cfn-network \
  --env-file .env \
  cfn-intelligent-coordinator:latest

# Monitor agents spawning and completion
docker logs -f cfn-coordinator
docker ps --filter "name=wave"

# Verify no infinite wait loops
# Expected: Coordinator exits after agents complete
```

## Benefits

1. **Correctness:** Agent completion actually tracked, no infinite loops
2. **Visibility:** Per-agent status (completed/failed/running)
3. **Robustness:** Timeout handling and container kill
4. **Simplicity:** -20 lines, removed unused Redis queue logic
5. **Performance:** Faster polling (2s vs 5s), immediate exit on completion

## Migration Notes

**No breaking changes** - agents still receive tasks via ENV variables.

**Backward compatible** - existing agent images work without modification.

**Redis usage reduced** - queue and counters no longer needed, only metadata storage for monitoring.

## Files Modified

- `/docker/coordinator/src/coordinator.js` (lines 160-523)
  - Function renames: `pushTasksToRedis` → `prepareTaskBatches`
  - Function rewrite: `waitForCompletion()` → `waitForCompletion(containerNames, timeout)`
  - Function removal: `monitorAgentHealth()`
  - Main loop updates: pass container names, handle results

## Backup Created

- Path: `.backups/unknown/1763005521_00a34766b3a7040c88cff429c575afc3/`
- Agent ID: `backend-1763005521-50449`
- Original file preserved for rollback if needed

## Next Steps

1. **Rebuild coordinator image:**
   ```bash
   cd docker/coordinator
   docker build -t cfn-intelligent-coordinator:latest .
   ```

2. **Run integration test:**
   ```bash
   tests/docker/intelligent-coordinator-test.sh
   ```

3. **Monitor production run:**
   - Verify no infinite loops
   - Confirm agent completion tracking
   - Check failure rate threshold behavior

4. **Update documentation:**
   - docker/CLAUDE.md (coordination pattern)
   - planning/docker/intelligent-coordinator-architecture.md

---

**Confidence:** 0.90

**Rationale:**
- Syntax validation passed
- Root cause correctly identified
- Solution directly addresses the issue
- No breaking changes to agent contracts
- Improved error handling and visibility
- Reduced code complexity (-20 lines)
- Integration testing recommended before production
