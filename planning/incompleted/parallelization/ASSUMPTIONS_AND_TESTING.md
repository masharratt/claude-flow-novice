# Parallel CFN Loop: Assumptions, Theories & Testing Strategy

## Critical Assumptions & Risk Mitigation

This document outlines all assumptions made in the parallel CFN Loop architecture, the theories they're based on, and concrete testing strategies to validate them before production deployment.

---

## Assumption 1: Redis Pub/Sub Can Handle 10,000+ msg/sec

### Theory
Redis pub/sub is advertised to handle 10,000+ messages/sec, which should be sufficient for coordinating 50+ parallel agents across multiple sprints.

### Risks if False
- Message delivery delays cause coordination failures
- Agents miss critical signals (interface_ready, test_lock_released)
- Deadlocks when waiting for acknowledgments

### Testing Strategy

**Benchmark Test**:
```typescript
describe('Redis Pub/Sub Performance', () => {
  it('should handle 10,000 messages/sec without delays', async () => {
    const messageCount = 10000;
    const channels = ['sprint:coordination', 'agent:lifecycle', 'test:coordination'];
    const startTime = Date.now();

    // Publish messages in parallel
    await Promise.all(
      Array.from({ length: messageCount }, (_, i) =>
        redis.publish(
          channels[i % channels.length],
          JSON.stringify({ id: i, timestamp: Date.now() })
        )
      )
    );

    const duration = Date.now() - startTime;
    const throughput = messageCount / (duration / 1000);

    expect(throughput).toBeGreaterThan(10000); // 10K msg/sec
    expect(duration).toBeLessThan(1000); // < 1 second for 10K messages
  });

  it('should deliver messages with <100ms latency under load', async () => {
    const latencies: number[] = [];

    // Subscribe to channel
    const subscriber = redis.duplicate();
    await subscriber.subscribe('latency:test');

    subscriber.on('message', (channel, message) => {
      const data = JSON.parse(message);
      const latency = Date.now() - data.timestamp;
      latencies.push(latency);
    });

    // Publish 1000 messages
    for (let i = 0; i < 1000; i++) {
      await redis.publish('latency:test', JSON.stringify({
        id: i,
        timestamp: Date.now()
      }));
      await sleep(10); // 100 msg/sec
    }

    await sleep(1000); // Wait for delivery

    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
    const maxLatency = Math.max(...latencies);

    expect(avgLatency).toBeLessThan(100); // <100ms average
    expect(maxLatency).toBeLessThan(500); // <500ms worst case
  });
});
```

**Load Test**:
```bash
# Use redis-benchmark tool
redis-benchmark -t pubsub -n 100000 -c 50

# Expected: >10,000 requests/sec
# Monitor: redis-cli --latency
```

**Fallback Plan if Fails**:
1. Reduce parallel sprint limit from 10 to 5
2. Switch to Redis Streams (better performance)
3. Implement local file-based coordination as fallback

---

## Assumption 2: Test Lock Serialization Prevents All Conflicts

### Theory
A single global Redis lock for test execution will prevent ALL resource conflicts (ports, files, databases).

### Risks if False
- Port conflicts due to lock race conditions
- File conflicts in coverage reports
- Database state pollution

### Testing Strategy

**Concurrency Test**:
```typescript
describe('Test Lock Serialization', () => {
  it('should prevent concurrent test execution across 10 sprints', async () => {
    const sprints = Array.from({ length: 10 }, (_, i) => `sprint-${i}`);
    const testLock = new TestLockCoordinator(redis);
    const executionLog: string[] = [];

    // Launch all sprints in parallel
    await Promise.all(
      sprints.map(async (sprintId) => {
        const acquired = await testLock.waitForTestSlot(sprintId, 600000);

        if (acquired) {
          try {
            // Log start time
            const startTime = Date.now();
            executionLog.push(`${sprintId}:start:${startTime}`);

            // Simulate test execution
            await sleep(5000); // 5 seconds

            // Log end time
            const endTime = Date.now();
            executionLog.push(`${sprintId}:end:${endTime}`);

          } finally {
            await testLock.releaseTestLock(sprintId);
          }
        }
      })
    );

    // Verify no overlap in execution windows
    const startTimes = new Map<string, number>();
    const endTimes = new Map<string, number>();

    for (const entry of executionLog) {
      const [sprintId, event, timestamp] = entry.split(':');

      if (event === 'start') {
        startTimes.set(sprintId, parseInt(timestamp));
      } else {
        endTimes.set(sprintId, parseInt(timestamp));
      }
    }

    // Check for overlaps
    for (const [sprint1, start1] of startTimes.entries()) {
      const end1 = endTimes.get(sprint1)!;

      for (const [sprint2, start2] of startTimes.entries()) {
        if (sprint1 === sprint2) continue;

        const end2 = endTimes.get(sprint2)!;

        // Check if execution windows overlap
        const overlaps = (start1 < end2) && (start2 < end1);

        expect(overlaps).toBe(false);
      }
    }
  });
});
```

**Port Conflict Test**:
```typescript
it('should never encounter port conflicts', async () => {
  const sprints = ['sprint-1', 'sprint-2', 'sprint-3'];
  const portConflicts: string[] = [];

  await Promise.all(
    sprints.map(async (sprintId) => {
      try {
        const acquired = await testLock.waitForTestSlot(sprintId, 600000);

        if (acquired) {
          // Start test server on port 3000
          const server = await startTestServer(3000);

          try {
            await runTests(sprintId);
          } finally {
            await server.close();
            await testLock.releaseTestLock(sprintId);
          }
        }
      } catch (error) {
        if (error.code === 'EADDRINUSE') {
          portConflicts.push(sprintId);
        }
      }
    })
  );

  expect(portConflicts.length).toBe(0);
});
```

**Fallback Plan if Fails**:
1. Dynamic port allocation per sprint
2. Docker container isolation for tests
3. Sequential test execution (disable parallelism)

---

## Assumption 3: Orphan Detection Catches All Memory Leaks

### Theory
Checking heartbeats every 60s with a 2-minute threshold will catch all orphaned agents before significant memory accumulation.

### Risks if False
- Memory grows unbounded over multiple epics
- OOM (Out of Memory) errors during execution
- Redis exhaustion

### Testing Strategy

**Memory Leak Simulation**:
```typescript
describe('Orphan Detection', () => {
  it('should cleanup all orphans within 3 minutes', async () => {
    // Spawn 20 agents
    const agents = await Promise.all(
      Array.from({ length: 20 }, (_, i) => spawnAgent(`agent-${i}`))
    );

    // Measure baseline memory
    const baselineMemory = await getRedisMemoryUsage();

    // Crash 50% of agents (no cleanup)
    const crashed = agents.filter((_, i) => i % 2 === 0);
    for (const agent of crashed) {
      // Stop heartbeat but leave keys in Redis
      agent.stopHeartbeat();
    }

    // Wait 3 minutes (2min threshold + 1min buffer)
    await sleep(180000);

    // Force orphan detection
    const result = await orphanDetector.detectAndCleanupOrphans();

    // All crashed agents should be cleaned
    expect(result.orphansCleaned).toBe(crashed.length);

    // Memory should return to baseline (within 10MB tolerance)
    const currentMemory = await getRedisMemoryUsage();
    const memoryGrowth = currentMemory - baselineMemory;

    expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // <10MB growth
  });

  it('should detect memory leak with 100MB growth threshold', async () => {
    const memoryTracker = new MemoryTracker(redis);

    // Record baseline
    const baseline = await memoryTracker.getTotalMemoryUsage();

    // Simulate memory leak (create 150MB of Redis keys)
    for (let i = 0; i < 150; i++) {
      await redis.set(`leak:${i}`, 'x'.repeat(1024 * 1024)); // 1MB each
    }

    // Check for leak
    const leakDetection = await memoryTracker.checkForMemoryLeak();

    expect(leakDetection.detected).toBe(true);
    expect(leakDetection.growth).toBeGreaterThan(100 * 1024 * 1024); // >100MB
  });
});
```

**Long-Running Epic Test**:
```typescript
it('should maintain stable memory over 10 sequential epics', async () => {
  const memoryReadings: number[] = [];

  for (let epicNum = 0; epicNum < 10; epicNum++) {
    // Execute full epic
    await executeParallelEpic({
      sprints: 5,
      agentsPerSprint: 10
    });

    // Record memory
    const memory = await getRedisMemoryUsage();
    memoryReadings.push(memory);

    // Force orphan cleanup
    await orphanDetector.detectAndCleanupOrphans();
  }

  // Check memory trend (should be stable, not growing)
  const avgGrowthPerEpic = (memoryReadings[9] - memoryReadings[0]) / 9;

  expect(avgGrowthPerEpic).toBeLessThan(5 * 1024 * 1024); // <5MB per epic
});
```

**Fallback Plan if Fails**:
1. Reduce orphan check interval from 60s to 30s
2. Reduce threshold from 2min to 1min
3. Add manual cleanup CLI command
4. Periodic Redis FLUSHDB (nuclear option)

---

## Assumption 4: Dependency Waiting is Productive (Not Wasteful)

### Theory
Agents can productively work on framework files, mocks, and tests while waiting for dependency interfaces, reducing overall epic time.

### Risks if False
- Agents sit idle during waits (wasted resources)
- Productive work conflicts with dependencies when resolved
- More coordination overhead than time saved

### Testing Strategy

**Productivity Measurement**:
```typescript
describe('Dependency Waiting Productivity', () => {
  it('should complete 50%+ of productive work during wait', async () => {
    const sprint = new SprintCoordinatorEnhanced({
      id: 'sprint-dependent',
      dependencies: ['sprint-provider']
    });

    // Define productive work queue
    const productiveWork = [
      { type: 'framework', file: 'base-classes.ts', estimatedTime: 5000 },
      { type: 'utils', file: 'helpers.ts', estimatedTime: 3000 },
      { type: 'mocks', file: 'api-mocks.ts', estimatedTime: 4000 },
      { type: 'tests', file: 'fixtures.ts', estimatedTime: 2000 }
    ];

    const startTime = Date.now();
    let productiveWorkCompleted = 0;

    // Start dependency wait (10 second delay before resolution)
    const waitPromise = sprint.waitForDependenciesWithProductiveWork(
      async (task) => {
        // Execute productive task
        await sleep(task.estimatedTime);
        productiveWorkCompleted++;
      }
    );

    // Resolve dependency after 10 seconds
    setTimeout(async () => {
      await redis.set('signal:sprint:sprint-provider:interface_ready', '1');
    }, 10000);

    await waitPromise;

    const duration = Date.now() - startTime;

    // Should complete at least 50% of productive work during 10s wait
    expect(productiveWorkCompleted).toBeGreaterThanOrEqual(2); // 2 out of 4

    // Total time should be close to max(dependencyWait, productiveWork)
    // Not dependencyWait + productiveWork
    expect(duration).toBeLessThan(15000); // <15s (not 24s if sequential)
  });
});
```

**Conflict Detection Test**:
```typescript
it('should not conflict with dependency when resolved', async () => {
  // Sprint 2 works on mocks while waiting for Sprint 1
  const sprint2 = new SprintCoordinatorEnhanced({
    id: 'sprint-2',
    dependencies: ['sprint-1']
  });

  // Sprint 2 creates mock for Auth API
  await sprint2.workOnProductiveTask({
    type: 'mocks',
    file: 'auth-api-mock.ts'
  });

  // Sprint 1 completes and publishes real Auth API
  await redis.set('signal:sprint:sprint-1:interface_ready', JSON.stringify({
    interface: 'AuthAPI',
    file: 'auth-api.ts'
  }));

  // Sprint 2 integrates real API
  await sprint2.integrateDependency('sprint-1');

  // Check for file conflicts
  const conflicts = await detectFileConflicts();
  expect(conflicts.length).toBe(0);

  // Mock should be replaced by real implementation
  const authApiMockExists = await fs.pathExists('auth-api-mock.ts');
  expect(authApiMockExists).toBe(false);
});
```

**Fallback Plan if Fails**:
1. Disable productive waiting (pure blocking)
2. Reduce productive work scope to docs only
3. Pre-generate all mocks before sprint start

---

## Assumption 5: AI Provider Rate Limiting Can Be Mitigated

### Theory
Fallback to multiple Z.ai API keys when rate limited will prevent epic failures during high-throughput parallel execution.

### Risks if False
- Epic stalls when primary API key rate limited
- Agents wait idle for rate limit reset
- Epic timeout failures

### Testing Strategy

**Rate Limit Simulation**:
```typescript
describe('AI Provider Rate Limiting', () => {
  it('should fallback to secondary API key when rate limited', async () => {
    const apiKeyPool = new APIKeyRotator({
      keys: [
        'primary-key-1',
        'secondary-key-2',
        'fallback-key-3'
      ],
      rateLimitThreshold: 100 // requests per minute
    });

    const requests: Promise<any>[] = [];

    // Make 300 requests (3x rate limit)
    for (let i = 0; i < 300; i++) {
      requests.push(
        apiKeyPool.makeRequest({
          model: 'claude-sonnet-4',
          messages: [{ role: 'user', content: 'Hello' }]
        })
      );
    }

    const results = await Promise.all(requests);

    // All requests should succeed (via rotation)
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBe(300);

    // Should have rotated to all 3 keys
    const keyUsage = apiKeyPool.getKeyUsageStats();
    expect(keyUsage.keysUsed).toBe(3);

    // Each key should be under rate limit
    for (const [key, usage] of Object.entries(keyUsage.usagePerKey)) {
      expect(usage).toBeLessThanOrEqual(100);
    }
  });

  it('should exponentially backoff when all keys rate limited', async () => {
    const apiKeyPool = new APIKeyRotator({
      keys: ['key-1', 'key-2'],
      rateLimitThreshold: 10
    });

    const attempts: number[] = [];

    try {
      // Make 50 requests (5x rate limit across all keys)
      for (let i = 0; i < 50; i++) {
        const attempt = await apiKeyPool.makeRequestWithBackoff({
          model: 'claude-sonnet-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });

        attempts.push(attempt.attemptNumber);
      }
    } catch (error) {
      // Expected - all keys exhausted
    }

    // Should have retried with backoff
    const maxRetries = Math.max(...attempts);
    expect(maxRetries).toBeGreaterThan(1);

    // Backoff delays should be exponential
    const delays = apiKeyPool.getBackoffDelays();
    expect(delays).toEqual([1000, 2000, 4000, 8000]); // 1s, 2s, 4s, 8s
  });
});
```

**Implementation**:
```typescript
class APIKeyRotator {
  private keys: string[];
  private currentKeyIndex = 0;
  private requestCounts = new Map<string, number>();
  private lastReset = new Map<string, number>();
  private rateLimitThreshold: number;

  /**
   * Make API request with automatic key rotation
   */
  async makeRequest(params: RequestParams): Promise<Response> {
    let attempts = 0;
    const maxAttempts = this.keys.length;

    while (attempts < maxAttempts) {
      const apiKey = this.keys[this.currentKeyIndex];

      // Check rate limit for this key
      if (this.isRateLimited(apiKey)) {
        // Rotate to next key
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
        attempts++;
        continue;
      }

      try {
        // Make request with current key
        const response = await this.callAPI(apiKey, params);

        // Increment request count
        this.incrementRequestCount(apiKey);

        return response;

      } catch (error) {
        if (this.isRateLimitError(error)) {
          // Mark key as rate limited
          this.markRateLimited(apiKey);

          // Rotate to next key
          this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
          attempts++;

        } else {
          throw error;
        }
      }
    }

    throw new Error('All API keys rate limited');
  }

  /**
   * Make request with exponential backoff
   */
  async makeRequestWithBackoff(params: RequestParams): Promise<Response> {
    const backoffDelays = [1000, 2000, 4000, 8000]; // Exponential: 1s, 2s, 4s, 8s

    for (let attempt = 0; attempt < backoffDelays.length; attempt++) {
      try {
        return await this.makeRequest(params);

      } catch (error) {
        if (attempt < backoffDelays.length - 1) {
          // Wait before retry
          await sleep(backoffDelays[attempt]);

        } else {
          throw error; // Exhausted all retries
        }
      }
    }

    throw new Error('Request failed after exponential backoff');
  }

  /**
   * Check if API key is rate limited
   */
  private isRateLimited(apiKey: string): boolean {
    const count = this.requestCounts.get(apiKey) || 0;
    const lastReset = this.lastReset.get(apiKey) || Date.now();

    // Reset count every minute
    if (Date.now() - lastReset > 60000) {
      this.requestCounts.set(apiKey, 0);
      this.lastReset.set(apiKey, Date.now());
      return false;
    }

    return count >= this.rateLimitThreshold;
  }
}
```

**Fallback Plan if Fails**:
1. Queue requests with rate limit awareness
2. Reduce parallel sprint count dynamically
3. Implement caching for repeated requests
4. Switch to self-hosted LLM (no rate limits)

---

## Assumption 6: Blocking Coordination Won't Deadlock

### Theory
The holding pattern with timeout and ACK verification will prevent deadlocks when coordinators wait for each other.

### Risks if False
- Circular waits cause permanent deadlock
- Epic never completes
- Manual intervention required

### Testing Strategy

**Deadlock Detection**:
```typescript
describe('Blocking Coordination Deadlocks', () => {
  it('should timeout circular dependencies', async () => {
    // Sprint 1 waits for Sprint 2
    const coord1 = new BlockingCoordinationManager({
      coordinatorId: 'sprint-1',
      redisClient: redis
    });

    // Sprint 2 waits for Sprint 1 (circular!)
    const coord2 = new BlockingCoordinationManager({
      coordinatorId: 'sprint-2',
      redisClient: redis
    });

    const startTime = Date.now();

    // Launch both coordinators
    const [result1, result2] = await Promise.allSettled([
      coord1.waitForAcks(['sprint-2'], 'signal-1', 30000), // 30s timeout
      coord2.waitForAcks(['sprint-1'], 'signal-2', 30000)
    ]);

    const duration = Date.now() - startTime;

    // Should timeout (not deadlock forever)
    expect(duration).toBeLessThan(35000); // <35s (30s + buffer)

    // Both should timeout (no ACKs received)
    expect(result1.status).toBe('fulfilled');
    expect(result2.status).toBe('fulfilled');

    expect(result1.value.size).toBe(0); // No ACKs
    expect(result2.value.size).toBe(0);
  });

  it('should detect and break dependency cycles', async () => {
    const dependencyGraph = new DependencyAnalyzer();

    // Create circular dependency
    const sprints = [
      { id: 'sprint-1', dependencies: ['sprint-3'] },
      { id: 'sprint-2', dependencies: ['sprint-1'] },
      { id: 'sprint-3', dependencies: ['sprint-2'] }
    ];

    // Should throw error
    await expect(
      dependencyGraph.analyze({ sprints })
    ).rejects.toThrow('Circular dependency detected');
  });
});
```

**Fallback Plan if Fails**:
1. Add cycle detection in dependency analyzer
2. Reduce timeout from 30min to 10min
3. Implement deadlock detector (graph analysis)
4. Allow manual dependency override

---

## Summary: Testing Checklist

### Before Production

- [ ] Redis pub/sub benchmark: >10K msg/sec sustained
- [ ] Test lock serialization: 0 port conflicts in 100 runs
- [ ] Orphan detection: <10MB memory growth over 10 epics
- [ ] Productive waiting: >50% efficiency measured
- [ ] API key rotation: 0 failures with 3 keys @ 3x rate limit
- [ ] Deadlock prevention: <35s timeout for circular deps

### Chaos Tests

- [ ] 30% random agent crashes → 100% cleanup within 3min
- [ ] Redis connection failures → Recovery within 30s
- [ ] Concurrent file edits → 100% conflict detection
- [ ] Test lock crashes → Stale lock release within 15min

### Performance Benchmarks

- [ ] 3 independent sprints: <40min (baseline: 75min)
- [ ] 5 mixed sprints: <60min (baseline: 125min)
- [ ] 10 sprints: <100min (baseline: 250min)

---

## Risk Matrix

| Assumption | Impact | Probability | Mitigation | Priority |
|-----------|---------|-------------|-----------|----------|
| Redis throughput insufficient | High | Low | Reduce parallelism | P1 |
| Test lock race conditions | Critical | Medium | Dynamic ports | P0 |
| Memory leaks not caught | High | Medium | Reduce threshold | P1 |
| Productive work conflicts | Low | Medium | Disable feature | P3 |
| API rate limit failures | Medium | High | Key rotation | P1 |
| Coordination deadlocks | Critical | Low | Cycle detection | P0 |

**Priority Levels**:
- P0: Block release (must fix before launch)
- P1: High priority (fix in first sprint)
- P2: Medium priority (fix in second sprint)
- P3: Low priority (defer to backlog)

---

## Next Steps

1. Implement all test suites in `tests/parallelization/`
2. Run chaos tests in CI/CD before every deployment
3. Monitor metrics in production for 2 weeks before full rollout
4. Create runbook for each failure scenario
