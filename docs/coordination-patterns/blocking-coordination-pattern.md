# Blocking Coordination Pattern for Agent Dependencies

**Problem:** In Layer 3 testing, Coordinators A and B completed in ~6 minutes while Coordinator-C (reviewer) completed in 8 minutes. The implementation coordinators exited before receiving confirmation that all retries were complete, creating a race condition where the retry loop couldn't execute.

**Root Cause:** Agents don't wait for downstream dependencies. Once an agent completes its immediate task, it exits, even if dependent agents need to communicate back with retry requests.

---

## Solution: Agent State Management with Blocking Coordination

### 1. Agent Lifecycle States

Define explicit states for agents with dependencies:

```javascript
const AgentState = {
  INITIALIZING: 'initializing',    // Agent spawning
  ACTIVE: 'active',                 // Executing primary work
  WAITING: 'waiting',               // Blocked on dependency
  COMPLETING: 'completing',         // Finalizing
  COMPLETE: 'complete',             // Fully done
  FAILED: 'failed'                  // Error state
};
```

### 2. Redis State Tracking Pattern

**Store agent state with dependencies:**
```bash
# When coordinator spawns
redis-cli setex "agent:coordinator-a:state" 3600 '{
  "state": "active",
  "phase": "implementation",
  "dependencies": ["coordinator-c"],
  "waitingFor": [],
  "startTime": 1760122000000,
  "heartbeat": 1760122300000
}'

# When coordinator A finishes spawning sub-agents
redis-cli setex "agent:coordinator-a:state" 3600 '{
  "state": "waiting",
  "phase": "implementation-complete",
  "dependencies": ["coordinator-c"],
  "waitingFor": ["all-reviews-complete"],
  "completionTime": 1760122360000,
  "heartbeat": 1760122360000
}'

# When coordinator C confirms all done
redis-cli setex "agent:coordinator-a:state" 3600 '{
  "state": "complete",
  "phase": "fully-validated",
  "dependencies": [],
  "waitingFor": [],
  "completionTime": 1760122480000
}'
```

### 3. Blocking Coordination Protocol

#### Phase 1: Implementation Coordinator Enters Waiting State

**Coordinator-A/B Completion Logic:**
```javascript
async function completeImplementationPhase(coordinatorId) {
  // 1. Finish spawning all sub-agents
  await spawnAllCoders();

  // 2. Transition to WAITING state
  await redis.setex(`agent:${coordinatorId}:state`, 3600, JSON.stringify({
    state: 'waiting',
    phase: 'awaiting-validation',
    dependencies: ['coordinator-c'],
    waitingFor: ['all-reviews-complete', 'no-retries-needed'],
    completionTime: Date.now()
  }));

  // 3. Subscribe to completion events
  await redis.subscribe(`coordination:completion:${coordinatorId}`);

  // 4. Enter blocking loop (with timeout)
  const timeout = 30 * 60 * 1000; // 30 minutes
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Check for completion signal
    const signal = await redis.get(`coordination:signal:${coordinatorId}:complete`);

    if (signal === 'true') {
      // Confirmed complete
      await transitionToComplete(coordinatorId);
      return;
    }

    // Check for retry request
    const retryQueue = await redis.lrange(`coordination:retry:${coordinatorId}`, 0, -1);

    if (retryQueue.length > 0) {
      // Process retries
      await processRetryRequests(coordinatorId, retryQueue);
      // Stay in WAITING state for next round
    }

    // Heartbeat
    await redis.setex(`agent:${coordinatorId}:heartbeat`, 60, Date.now());

    // Poll interval
    await sleep(5000); // 5 seconds
  }

  // Timeout - escalate
  throw new Error(`Coordinator ${coordinatorId} timed out waiting for validation completion`);
}
```

#### Phase 2: Review Coordinator Manages State

**Coordinator-C Review Loop:**
```javascript
async function executeReviewCoordination() {
  // 1. Check implementation coordinators are in WAITING state
  const coordAState = await getAgentState('coordinator-a');
  const coordBState = await getAgentState('coordinator-b');

  if (coordAState.state !== 'waiting' || coordBState.state !== 'waiting') {
    throw new Error('Implementation coordinators not ready');
  }

  // 2. Process all reviews
  const failures = await reviewAllImplementations();

  // 3. If failures, send retry requests and wait
  if (failures.length > 0) {
    await sendRetryRequests(failures);

    // Wait for retries to complete
    await waitForRetries(failures);

    // Re-review
    const secondRoundFailures = await reviewRetries(failures);

    if (secondRoundFailures.length > 0) {
      // More retries needed...
      // Loop continues
    }
  }

  // 4. All reviews passed - signal completion
  await signalCompletion(['coordinator-a', 'coordinator-b']);
}

async function signalCompletion(coordinatorIds) {
  for (const coordId of coordinatorIds) {
    // Set completion signal
    await redis.setex(`coordination:signal:${coordId}:complete`, 3600, 'true');

    // Publish to subscription channel
    await redis.publish(`coordination:completion:${coordId}`, JSON.stringify({
      action: 'complete',
      coordinator: 'coordinator-c',
      allReviewsPassed: true,
      timestamp: Date.now()
    }));
  }
}
```

#### Phase 3: Retry Request Handling

**When Coordinator-C detects failure:**
```javascript
async function sendRetryRequest(coordinatorId, failureInfo) {
  // 1. Add to retry queue
  await redis.lpush(`coordination:retry:${coordinatorId}`, JSON.stringify({
    file: failureInfo.file,
    agent: failureInfo.originalAgent,
    issues: failureInfo.issues,
    retryCount: failureInfo.retryCount,
    timestamp: Date.now()
  }));

  // 2. Publish retry event
  await redis.publish(`coordination:retry:${coordinatorId}`, JSON.stringify({
    action: 'retry-needed',
    count: 1,
    timestamp: Date.now()
  }));

  // 3. Wait for fresh agent spawn + completion
  await waitForRetryCompletion(coordinatorId, failureInfo.file);
}
```

**Coordinator-A/B processes retry:**
```javascript
// In the blocking loop
async function processRetryRequests(coordinatorId, retryQueue) {
  for (const retryJson of retryQueue) {
    const retry = JSON.parse(retryJson);

    // 1. Spawn FRESH agent
    const freshAgentId = `${retry.agent}-retry-${retry.retryCount}`;
    await spawnFreshAgent(freshAgentId, retry);

    // 2. Wait for completion
    await waitForAgentCompletion(freshAgentId);

    // 3. Remove from queue
    await redis.lrem(`coordination:retry:${coordinatorId}`, 1, retryJson);

    // 4. Signal retry complete
    await redis.setex(`coordination:retry:${coordinatorId}:${retry.file}:complete`, 300, 'true');
  }
}
```

---

## 4. Complete Layer 3 Flow with Blocking

```
┌─────────────────────────────────────────────────────────────────────┐
│                       LAYER 3 WITH BLOCKING                         │
└─────────────────────────────────────────────────────────────────────┘

TIME: 0s
  Coordinator-A spawns 35 coder agents (50% with errors)
  Coordinator-B spawns 35 coder agents (50% with errors)
  State: ACTIVE

TIME: 2min
  All 70 implementations complete
  Coordinator-A state → WAITING (dependencies: [coordinator-c])
  Coordinator-B state → WAITING (dependencies: [coordinator-c])

  ┌─────────────────────────────────────────────────┐
  │ BLOCKING LOOP STARTS                            │
  │ - Subscribe to coordination:completion:*        │
  │ - Poll coordination:retry:coordinator-* queues  │
  │ - Heartbeat every 5 seconds                     │
  │ - Timeout: 30 minutes                           │
  └─────────────────────────────────────────────────┘

TIME: 2min 10s
  Coordinator-C spawns 10 reviewers
  Reviews all 70 files
  Detects 35 failures

  For each failure:
    - LPUSH coordination:retry:coordinator-a (17 items)
    - LPUSH coordination:retry:coordinator-b (18 items)
    - PUBLISH coordination:retry:coordinator-a
    - PUBLISH coordination:retry:coordinator-b

TIME: 2min 15s
  Coordinator-A (in blocking loop):
    - Detects 17 items in retry queue
    - Spawns 17 fresh agents
    - Waits for each completion
    - Removes from queue

  Coordinator-B (in blocking loop):
    - Detects 18 items in retry queue
    - Spawns 18 fresh agents
    - Waits for each completion
    - Removes from queue

TIME: 4min
  All retries complete
  Coordinator-C re-reviews all 70 files
  All pass ✅

TIME: 4min 10s
  Coordinator-C signals completion:
    - SET coordination:signal:coordinator-a:complete true
    - SET coordination:signal:coordinator-b:complete true
    - PUBLISH coordination:completion:coordinator-a
    - PUBLISH coordination:completion:coordinator-b

TIME: 4min 11s
  Coordinator-A (blocking loop detects signal):
    - Reads coordination:signal:coordinator-a:complete = true
    - Transitions state → COMPLETE
    - Exits cleanly

  Coordinator-B (blocking loop detects signal):
    - Reads coordination:signal:coordinator-b:complete = true
    - Transitions state → COMPLETE
    - Exits cleanly
```

---

## 5. Implementation Example

### Agent Prompt Template with Blocking

```markdown
You are Coordinator-A in Layer 3 mesh coordination test.

**CRITICAL: Blocking Coordination Required**

After spawning all sub-agents, you MUST enter a blocking wait state until Coordinator-C confirms all reviews are complete and no retries are needed.

**Blocking Loop Implementation:**

1. After spawning all 35 coder agents, transition to WAITING state:
```bash
redis-cli setex "agent:coordinator-a:state" 3600 '{
  "state": "waiting",
  "dependencies": ["coordinator-c"],
  "waitingFor": ["all-reviews-complete"]
}'
```

2. Subscribe to completion signal:
```bash
redis-cli subscribe "coordination:completion:coordinator-a"
```

3. Enter blocking loop (max 30 minutes):
```bash
while true; do
  # Check completion signal
  COMPLETE=$(redis-cli get "coordination:signal:coordinator-a:complete")
  if [ "$COMPLETE" = "true" ]; then
    echo "✅ All reviews complete, exiting cleanly"
    exit 0
  fi

  # Check for retry requests
  RETRY_COUNT=$(redis-cli llen "coordination:retry:coordinator-a")
  if [ "$RETRY_COUNT" -gt 0 ]; then
    echo "🔄 Processing $RETRY_COUNT retry requests"
    # Pop retry request
    RETRY=$(redis-cli rpop "coordination:retry:coordinator-a")
    # Spawn fresh agent for retry
    # Wait for completion
    # Loop continues
  fi

  # Heartbeat
  redis-cli setex "agent:coordinator-a:heartbeat" 60 "$(date +%s)"

  # Poll interval
  sleep 5
done
```

**DO NOT exit until you receive the completion signal from Coordinator-C.**
```

---

## 6. Benefits

### ✅ Prevents Race Conditions
- Implementation coordinators don't exit prematurely
- Retry loop can execute fully
- All coordinators stay alive until true completion

### ✅ Explicit Dependencies
- Clear dependency graph via Redis state
- Each agent knows who it's waiting for
- Timeout protection prevents infinite waits

### ✅ Observable State
- Real-time monitoring via Redis keys
- Heartbeat mechanism detects dead agents
- State transitions visible in Redis

### ✅ Graceful Completion
- Explicit completion signals
- Clean exit after confirmation
- Audit trail of entire coordination flow

---

## 7. Monitoring Commands

```bash
# Check all agent states
redis-cli keys "agent:*:state" | xargs -I {} redis-cli get {}

# Monitor blocking coordinators
watch -n 1 'redis-cli get agent:coordinator-a:state | jq .'

# Check retry queues
redis-cli llen coordination:retry:coordinator-a
redis-cli llen coordination:retry:coordinator-b

# View retry items
redis-cli lrange coordination:retry:coordinator-a 0 -1

# Check completion signals
redis-cli get coordination:signal:coordinator-a:complete
redis-cli get coordination:signal:coordinator-b:complete

# Monitor heartbeats
redis-cli get agent:coordinator-a:heartbeat
redis-cli get agent:coordinator-b:heartbeat
```

---

## 8. Error Handling

### Timeout Protection
```javascript
const BLOCKING_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const startTime = Date.now();

if (Date.now() - startTime > BLOCKING_TIMEOUT) {
  await redis.setex(`agent:${coordinatorId}:state`, 3600, JSON.stringify({
    state: 'failed',
    error: 'timeout',
    message: 'Exceeded 30 minute wait for validation completion'
  }));

  throw new Error('Coordinator timed out in blocking wait');
}
```

### Dead Agent Detection
```javascript
// Check if dependent agent is still alive
const heartbeat = await redis.get('agent:coordinator-c:heartbeat');
const lastHeartbeat = parseInt(heartbeat);
const now = Date.now();

if (now - lastHeartbeat > 60000) { // 1 minute
  throw new Error('Coordinator-C appears dead (no heartbeat)');
}
```

### Cleanup on Failure
```javascript
process.on('exit', async () => {
  // Mark agent as failed if exiting unexpectedly
  const currentState = await redis.get(`agent:${coordinatorId}:state`);
  const state = JSON.parse(currentState);

  if (state.state === 'waiting' || state.state === 'active') {
    await redis.setex(`agent:${coordinatorId}:state`, 3600, JSON.stringify({
      ...state,
      state: 'failed',
      error: 'unexpected-exit'
    }));
  }
});
```

---

## 9. Next Steps

To implement this pattern for Layer 3:

1. **Update Coordinator Prompts:**
   - Add blocking loop logic to Coordinator-A/B
   - Add completion signaling to Coordinator-C
   - Define state transitions explicitly

2. **Test Blocking Behavior:**
   - Run Layer 3 with blocking enabled
   - Verify coordinators stay alive during retries
   - Confirm clean exit after completion signal

3. **Add Monitoring:**
   - Dashboard showing agent states in real-time
   - Alert on timeout or dead agents
   - Metrics on blocking duration

4. **Document Pattern:**
   - Add to agent coordination guidelines
   - Create reusable blocking coordination template
   - Update Layer 3 test requirements

---

**Status:** Ready for implementation
**Priority:** High (resolves critical race condition)
**Estimated Effort:** 2-3 hours for full implementation + testing
