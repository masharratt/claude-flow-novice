# Test Coordination Strategy

## Problem Statement

When multiple sprint coordinators execute in parallel, they cannot run tests simultaneously due to:

1. **Port Conflicts**: Test servers bind to fixed ports (e.g., 3000, 8080)
2. **File System Conflicts**: Coverage reports, artifacts written to same paths
3. **Resource Exhaustion**: Multiple Chrome/browser instances drain CPU/memory
4. **State Pollution**: Database/cache shared across test runs

**Critical**: Only **ONE** coordinator can execute tests at any given time.

---

## Solution: Global Test Lock with Queue

### Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Sprint       │  │ Sprint       │  │ Sprint       │
│ Coordinator  │  │ Coordinator  │  │ Coordinator  │
│      1       │  │      2       │  │      3       │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                  │                  │
       │  Try Acquire     │  Try Acquire     │  Try Acquire
       ├─────────────────►│◄─────────────────┤  Test Lock
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────────────────────────────────────────┐
│         Redis Test Lock Coordinator               │
│                                                   │
│  ┌─────────────┐  ┌─────────────┐               │
│  │ Active Lock │  │ Wait Queue  │               │
│  │ (coord-2)   │  │ 1. coord-1  │               │
│  │ TTL: 15min  │  │ 2. coord-3  │               │
│  └─────────────┘  └─────────────┘               │
└──────────────────────────────────────────────────┘
       │
       │  Lock Released
       ▼
┌──────────────┐
│ Next in Queue│
│ (coord-1)    │
│ Acquires Lock│
└──────────────┘
```

---

## Implementation

### 1. Test Lock Acquisition

```typescript
// Sprint coordinator requests test slot
const testLock = new TestLockCoordinator(redis);

// Before running tests
const acquired = await testLock.waitForTestSlot(coordinatorId, 300000); // 5min timeout

if (!acquired) {
  // Test slot timeout - work on other tasks
  logger.warn('Test slot unavailable - deferring to sequential validation');
  await this.workOnNonTestTasks();
  return;
}

try {
  // Exclusive test execution
  await this.runTests();
} finally {
  // Always release lock
  await testLock.releaseTestLock(coordinatorId);
}
```

### 2. Queue Management

```typescript
class TestLockCoordinator {
  /**
   * Add coordinator to wait queue
   */
  async addToQueue(coordinatorId: string): Promise<number> {
    // Use sorted set with timestamp as score (FIFO)
    await this.redis.zadd(
      'cfn:test:queue',
      Date.now(), // score
      coordinatorId // member
    );

    // Return queue position (0-indexed)
    const position = await this.redis.zrank('cfn:test:queue', coordinatorId);
    return position;
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<QueueStatus> {
    const queue = await this.redis.zrange('cfn:test:queue', 0, -1, 'WITHSCORES');

    const waiters = [];
    for (let i = 0; i < queue.length; i += 2) {
      waiters.push({
        coordinatorId: queue[i],
        enqueuedAt: parseInt(queue[i + 1]),
        waitTime: Date.now() - parseInt(queue[i + 1])
      });
    }

    return {
      length: waiters.length,
      waiters,
      avgWaitTime: waiters.reduce((sum, w) => sum + w.waitTime, 0) / waiters.length || 0
    };
  }
}
```

### 3. Lock Expiry & Force Release

```typescript
/**
 * Background job: Force release stale locks
 */
async monitorStaleLocks(): Promise<void> {
  setInterval(async () => {
    const currentLock = await this.redis.get('cfn:test:execution:lock');

    if (!currentLock) return;

    const lock = JSON.parse(currentLock);
    const lockAge = Date.now() - lock.timestamp;

    // Force release if held >15 minutes
    if (lockAge > 900000) {
      await this.redis.del('cfn:test:execution:lock');

      logger.warn(`Force released stale test lock from ${lock.coordinatorId}`, {
        lockAge,
        coordinator: lock.coordinatorId
      });

      // Publish event
      await this.redis.publish('cfn:test:coordination', JSON.stringify({
        type: 'test_lock_force_released',
        coordinator: lock.coordinatorId,
        lockAge,
        reason: 'exceeded_max_hold_time'
      }));

      // Notify next in queue
      await this.notifyNextInQueue();
    }
  }, 60000); // Check every minute
}
```

---

## Alternative Work During Wait

When a coordinator cannot acquire the test lock, it should perform useful work:

```typescript
async workOnNonTestTasks(): Promise<void> {
  // 1. Run linting (no port conflicts)
  await this.runESLint();

  // 2. Type checking (no resource conflicts)
  await this.runTypeScript();

  // 3. Build compilation (no state pollution)
  await this.runBuild();

  // 4. Documentation generation
  await this.generateApiDocs();

  // 5. Code quality analysis
  await this.runSonarQube();
}
```

---

## Test Result Aggregation

After all sprints complete testing, results must be aggregated:

```typescript
class TestResultAggregator {
  /**
   * Merge test results from multiple sprints
   */
  async aggregateResults(sprintIds: string[]): Promise<AggregatedResults> {
    const results: SprintTestResult[] = [];

    for (const sprintId of sprintIds) {
      const result = await this.loadTestResult(sprintId);
      results.push(result);
    }

    return {
      totalTests: results.reduce((sum, r) => sum + r.totalTests, 0),
      passed: results.reduce((sum, r) => sum + r.passed, 0),
      failed: results.reduce((sum, r) => sum + r.failed, 0),
      skipped: results.reduce((sum, r) => sum + r.skipped, 0),
      coverage: this.mergeCoverage(results),
      duration: Math.max(...results.map(r => r.duration)),
      sprints: results
    };
  }

  /**
   * Merge coverage reports from multiple sprints
   */
  private mergeCoverage(results: SprintTestResult[]): Coverage {
    const merged: Coverage = {
      lines: { total: 0, covered: 0, pct: 0 },
      statements: { total: 0, covered: 0, pct: 0 },
      functions: { total: 0, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 0 }
    };

    for (const result of results) {
      merged.lines.total += result.coverage.lines.total;
      merged.lines.covered += result.coverage.lines.covered;
      // ... merge other metrics
    }

    merged.lines.pct = (merged.lines.covered / merged.lines.total) * 100;
    // ... calculate other percentages

    return merged;
  }

  /**
   * Detect test conflicts (same test modified by multiple sprints)
   */
  async detectTestConflicts(sprintIds: string[]): Promise<TestConflict[]> {
    const conflicts: TestConflict[] = [];
    const testFiles = new Map<string, string[]>(); // file -> sprintIds

    for (const sprintId of sprintIds) {
      const result = await this.loadTestResult(sprintId);

      for (const file of result.testFiles) {
        if (!testFiles.has(file)) {
          testFiles.set(file, []);
        }
        testFiles.get(file).push(sprintId);
      }
    }

    // Find files modified by multiple sprints
    for (const [file, sprints] of testFiles.entries()) {
      if (sprints.length > 1) {
        conflicts.push({
          file,
          sprints,
          resolution: 'manual_review_required'
        });
      }
    }

    return conflicts;
  }
}
```

---

## Monitoring & Metrics

### Prometheus Metrics

```typescript
// Test slot wait time (high value = contention)
test_slot_wait_time_seconds{coordinator_id="sprint-2"}

// Test queue depth
test_queue_depth_total

// Test execution duration
test_execution_duration_seconds{sprint_id="auth"}

// Test lock force releases (should be rare)
test_lock_force_release_count
```

### Alerts

```yaml
# Alert if test queue depth > 3 (too much contention)
- alert: HighTestQueueContention
  expr: test_queue_depth_total > 3
  for: 5m
  annotations:
    summary: "Test queue depth {{ $value }} exceeds threshold"
    description: "Consider sequential test execution or increase test slot timeout"

# Alert if average wait time > 5 minutes
- alert: LongTestSlotWaitTime
  expr: avg(test_slot_wait_time_seconds) > 300
  for: 5m
  annotations:
    summary: "Average test wait time {{ $value }}s too high"
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('TestLockCoordinator', () => {
  it('should allow only one coordinator to acquire lock', async () => {
    const coord1 = 'sprint-1';
    const coord2 = 'sprint-2';

    const acquired1 = await testLock.acquireTestLock(coord1);
    const acquired2 = await testLock.acquireTestLock(coord2);

    expect(acquired1).toBe(true);
    expect(acquired2).toBe(false);
  });

  it('should process queue in FIFO order', async () => {
    // Add 3 coordinators to queue
    await testLock.addToQueue('sprint-1');
    await testLock.addToQueue('sprint-2');
    await testLock.addToQueue('sprint-3');

    const queue = await testLock.getQueueStatus();
    expect(queue.waiters[0].coordinatorId).toBe('sprint-1');
    expect(queue.waiters[1].coordinatorId).toBe('sprint-2');
    expect(queue.waiters[2].coordinatorId).toBe('sprint-3');
  });

  it('should force release stale locks after 15 minutes', async () => {
    // Mock lock held for 16 minutes
    await redis.set('cfn:test:execution:lock', JSON.stringify({
      coordinatorId: 'sprint-stale',
      timestamp: Date.now() - (16 * 60 * 1000)
    }));

    const released = await testLock.forceReleaseStaleTestLock();
    expect(released).toBe(true);

    const lockExists = await redis.exists('cfn:test:execution:lock');
    expect(lockExists).toBe(0);
  });
});
```

### Integration Tests

```typescript
describe('Parallel Test Execution', () => {
  it('should serialize test execution across 3 parallel sprints', async () => {
    const sprints = ['sprint-1', 'sprint-2', 'sprint-3'];
    const testLock = new TestLockCoordinator(redis);

    // Launch 3 sprints in parallel
    const results = await Promise.all(
      sprints.map(async (sprintId) => {
        // Wait for test slot
        const acquired = await testLock.waitForTestSlot(sprintId, 600000);
        expect(acquired).toBe(true);

        try {
          // Run tests
          const result = await runTests(sprintId);
          return result;
        } finally {
          await testLock.releaseTestLock(sprintId);
        }
      })
    );

    // All sprints should complete successfully
    expect(results.every(r => r.success)).toBe(true);

    // No port conflicts should occur
    const conflicts = await checkPortConflicts();
    expect(conflicts.length).toBe(0);
  });
});
```

### Chaos Tests

```typescript
describe('Test Lock Chaos', () => {
  it('should handle random coordinator crashes during test execution', async () => {
    const sprints = Array.from({ length: 5 }, (_, i) => `sprint-${i}`);

    // Launch sprints with 20% crash rate
    const results = await Promise.all(
      sprints.map(async (sprintId) => {
        try {
          const acquired = await testLock.waitForTestSlot(sprintId, 600000);

          if (acquired) {
            // 20% chance of crash during test execution
            if (Math.random() < 0.2) {
              throw new Error('Simulated coordinator crash');
            }

            await runTests(sprintId);
            await testLock.releaseTestLock(sprintId);
            return { success: true, sprintId };
          }
        } catch (error) {
          // Crash - lock should auto-release via TTL
          return { success: false, sprintId, error };
        }
      })
    );

    // At least 60% should succeed (with 20% crash rate)
    const successRate = results.filter(r => r.success).length / results.length;
    expect(successRate).toBeGreaterThan(0.6);

    // No locks should be left dangling
    await sleep(1000); // Wait for TTL expiry
    const lockExists = await redis.exists('cfn:test:execution:lock');
    expect(lockExists).toBe(0);
  });
});
```

---

## Best Practices

### 1. Always Use try/finally for Lock Release

```typescript
// ✅ GOOD: Lock always released
try {
  await runTests();
} finally {
  await testLock.releaseTestLock(coordinatorId);
}

// ❌ BAD: Lock may not release on error
await runTests();
await testLock.releaseTestLock(coordinatorId);
```

### 2. Set Reasonable Timeouts

```typescript
// ✅ GOOD: 5-minute timeout prevents infinite wait
const acquired = await testLock.waitForTestSlot(coordinatorId, 300000);

// ❌ BAD: Infinite wait can deadlock
const acquired = await testLock.waitForTestSlot(coordinatorId, Infinity);
```

### 3. Monitor Queue Depth

```typescript
// Check queue depth before adding
const queueStatus = await testLock.getQueueStatus();

if (queueStatus.length > 5) {
  logger.warn('Test queue depth high - consider sequential execution');

  // Fallback: run non-test tasks instead
  await this.workOnNonTestTasks();
}
```

### 4. Aggregate Results Carefully

```typescript
// Check for test conflicts before merging
const conflicts = await testAggregator.detectTestConflicts(sprintIds);

if (conflicts.length > 0) {
  logger.error(`Test conflicts detected: ${conflicts.length}`);

  for (const conflict of conflicts) {
    logger.error(`File ${conflict.file} modified by: ${conflict.sprints.join(', ')}`);
  }

  throw new Error('Test conflicts require manual resolution');
}
```

---

## Troubleshooting

### Issue: Test Slot Timeout

**Symptoms**: Sprint waits 5 minutes but never acquires lock

**Causes**:
1. Coordinator crashed while holding lock
2. Tests running longer than 15 minutes
3. Lock not released properly

**Resolution**:
```bash
# Check current lock holder
redis-cli get cfn:test:execution:lock

# Force release if needed
redis-cli del cfn:test:execution:lock

# Check queue
redis-cli zrange cfn:test:queue 0 -1 WITHSCORES
```

### Issue: Port Conflicts Despite Lock

**Symptoms**: `EADDRINUSE` errors during test execution

**Causes**:
1. Previous test server not cleaned up
2. Lock acquired but server already running

**Resolution**:
```bash
# Kill all node processes (nuclear option)
pkill -f "node"

# Find process on port 3000
lsof -i :3000

# Kill specific process
kill -9 <PID>
```

### Issue: Coverage Merge Errors

**Symptoms**: Merged coverage percentages incorrect

**Causes**:
1. Coverage reports use different formats
2. File paths not normalized
3. Duplicate coverage entries

**Resolution**:
```typescript
// Normalize file paths before merge
const normalizedCoverage = this.normalizeCoveragePaths(coverage);

// Deduplicate coverage entries
const deduped = this.deduplicateCoverage(normalizedCoverage);
```

---

## Next Steps

1. Review [Memory Safety Guide](MEMORY_SAFETY.md)
2. Review [Architecture Documentation](ARCHITECTURE.md)
3. Implement test lock coordinator: `src/cfn-loop/test-lock-coordinator.ts`
4. Run chaos tests: `npm run test:chaos:test-lock`
