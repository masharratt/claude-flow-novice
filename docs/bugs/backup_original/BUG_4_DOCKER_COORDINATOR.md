# Bug #4: Docker Coordinator Architectural Mismatch

**Status:** ❌ NOT FIXED (as of 2025-11-12)
**Severity:** P0 - CRITICAL BLOCKER
**Confidence:** 0.95 (root cause identified via integration testing)
**Cross-Reference:** `.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md`

---

## Executive Summary

The Docker coordinator and agent workers use incompatible task distribution patterns, causing infinite wait loops and memory leaks in production. The coordinator pushes tasks to a Redis queue AND embeds tasks in agent environments, while agents only consume from environment variables, leaving the Redis queue unconsumed forever.

**Impact:** BLOCKING ALL PRODUCTION USE of Docker coordinator

---

## The Problem

### Architectural Mismatch

**Coordinator DOES push to Redis queue** (`docker/coordinator/src/coordinator.js` lines 167-195):
```javascript
await redisClient.rPush('task:queue', taskNum.toString());
await redisClient.set('task:total', taskIds.length);
await redisClient.set('task:completed', 0);
```

**Coordinator ALSO spawns agents with embedded tasks** (lines 272, 287):
```javascript
Env: [`TASK_PROMPT=${promptText}`, ...]
Cmd: ['node', '/app/dist/cli/index.js', 'agent', 'typescript-specialist', promptText]
```

**Agents execute immediately using environment** (NO queue interaction):
- No RPOP/BLPOP calls in agent code
- Task comes from `TASK_PROMPT` environment variable
- Agent completes work and exits
- **Queue never consumed**

**Coordinator waits forever** (lines 296-350):
```javascript
// Polls Redis queue that never changes
while (true) {
  const completed = parseInt(await redisClient.get('task:completed'));
  const queueLength = await redisClient.lLen('task:queue');
  if (completed >= total) break;  // NEVER TRUE
  await sleep(5000);
}
```

---

## Evidence

### Integration Test Results
- **Test Duration:** 15+ minutes
- **Status:** "0/16 tasks, 16 queued" (no progress)
- **Agent Behavior:** Successful completion (484K tokens, 20 iterations, exit code 0)
- **Coordinator Behavior:** Polling Redis queue forever (length never changes)

### Code Analysis
- No RPOP/BLPOP in agent execution flow
- Agents read `TASK_PROMPT` environment variable directly
- Queue writes occur but are never consumed
- Container lifecycle completes but coordinator doesn't detect it

### System Impact
- **Infinite wait loop** - coordinator never exits
- **Memory leak** - containers accumulate without cleanup
- **Resource exhaustion** - stale Redis keys persist

**Detailed Findings:** `docs/DOCKER_COORDINATOR_INTEGRATION_TEST_FINDINGS.md`

---

## Required Fix (Option B - Container Status Tracking)

### Recommended Approach
Remove unused Redis queue pattern, use Docker API for completion tracking.

### Implementation Steps

#### Step 1: Remove Queue Operations
**File:** `docker/coordinator/src/coordinator.js` lines ~167-195

```javascript
// DELETE these lines:
- await redisClient.del('task:queue');
- await redisClient.rPush('task:queue', taskNum.toString());
- await redisClient.set('task:total', taskIds.length);
- await redisClient.set('task:completed', 0);
```

#### Step 2: Replace Wait Logic
**File:** `docker/coordinator/src/coordinator.js` lines ~296-350

```javascript
// REPLACE waitForCompletion() with Docker container status polling
async function waitForCompletion(waveContainerNames) {
  console.log(`\n📊 Monitoring ${waveContainerNames.length} agents...`);

  while (true) {
    const containers = await docker.listContainers({
      filters: { name: waveContainerNames },
      all: true  // Include exited containers
    });

    const running = containers.filter(c => c.State === 'running');
    const exited = containers.filter(c => c.State === 'exited');

    console.log(`Progress: ${exited.length}/${containers.length} completed, ${running.length} running`);

    if (running.length === 0) {
      // All containers exited - check for failures
      const failed = [];
      for (const container of exited) {
        const inspect = await docker.getContainer(container.Id).inspect();
        if (inspect.State.ExitCode !== 0) {
          failed.push({
            name: container.Names[0],
            exitCode: inspect.State.ExitCode
          });
        }
      }

      if (failed.length > 0) {
        console.warn(`⚠️  ${failed.length} agents failed:`);
        failed.forEach(f => console.warn(`- ${f.name} (exit code ${f.exitCode})`));
      }

      console.log(`\n✅ All ${exited.length} agents completed`);
      break;
    }

    await sleep(2000); // Poll every 2 seconds
  }
}
```

#### Step 3: Add Health Checking
**File:** `docker/coordinator/src/coordinator.js` (add to waitForCompletion)

```javascript
async function waitForCompletion(waveContainerNames) {
  const startTime = Date.now();
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > TIMEOUT_MS) {
      console.error(`❌ Timeout after ${Math.round(elapsed/1000/60)} minutes`);

      // Kill stuck containers
      for (const name of waveContainerNames) {
        try {
          const container = docker.getContainer(name);
          await container.kill();
          console.warn(`⚠️  Killed stuck container: ${name}`);
        } catch (err) {
          // Already stopped
        }
      }
      break;
    }

    // ... rest of status polling logic ...
  }
}
```

---

## Why This Works

1. **Agents spawned with task in environment** - execute immediately upon start
2. **Container exits when agent completes** - natural lifecycle (exit code 0 = success)
3. **Coordinator polls Docker API** - accurate real-time container state
4. **No Redis queue interaction** - eliminates architectural conflict
5. **Health checking** - detects and kills stuck agents (timeout)

---

## Validation Steps

### Pre-Deployment
1. Remove Redis queue operations from coordinator code
2. Implement Docker API polling in waitForCompletion()
3. Add timeout and stuck agent detection
4. Unit test container status tracking logic

### Post-Deployment
1. Run integration test: `npm run test:coordinator`
2. Verify agents complete and coordinator exits cleanly
3. Check for stuck containers: `docker ps -a | grep agent`
4. Validate memory cleanup: No stale Redis keys

### Success Criteria
- Coordinator exits after all agents complete (no infinite loop)
- Agent completion detected within 2-5 seconds
- Zero stuck containers after test completion
- No Redis memory leaks

---

## Estimated Effort

**Implementation:** 2-3 hours
- Code changes: ~1 hour
- Testing: ~1 hour
- Documentation: ~30 minutes

---

## Related Documentation

### Architecture
- **Coordinator Design:** `planning/docker/intelligent-coordinator-architecture.md`
- **Session Findings:** `planning/docker/SESSION_2025-11-12_FINDINGS.md`

### Integration Testing
- **Test Findings:** `docs/DOCKER_COORDINATOR_INTEGRATION_TEST_FINDINGS.md`
- **Test Script:** `tests/test-coordinator-wave-spawning.sh`

### Agent Files
- **Docker Specialist:** `.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md`
- **CFN v3 Coordinator:** `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`

---

## Status History

| Date | Status | Notes |
|------|--------|-------|
| 2025-11-12 | ❌ NOT FIXED | Root cause identified via integration testing |
| 2025-11-12 | 🔍 INVESTIGATING | 15+ minute integration test with no progress |
| 2025-11-11 | 🚧 SUSPECTED | Coordinator infinite wait behavior observed |

---

**Maintained By:** docker-specialist agent
**Last Updated:** 2025-11-12
**Bug Priority:** P0 - CRITICAL BLOCKER
