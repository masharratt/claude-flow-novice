# Example Integration Test Timeout Fixes

## Before and After Examples

### Example 1: Database Handoff Test (Simple Fix)

**File**: `tests/integration/database-handoffs.test.ts`

**Before** (timing out at 30s):
```typescript
describe('Database Transaction Tests', () => {
  it('should coordinate transactions across Redis and SQLite', async () => {
    const taskId = generateTaskId();

    await dbService.transaction(async (tx) => {
      await tx.set('redis', buildTaskKey(taskId), {
        id: taskId,
        status: 'in_progress',
        timestamp: Date.now(),
      });

      await tx.set('sqlite', 'lifecycle:' + taskId, {
        phase: 'loop_3',
        started_at: new Date().toISOString(),
      });
    });

    // Verification
    const redisData = await dbService.get('redis', buildTaskKey(taskId));
    expect(redisData.status).toBe('in_progress');

    const sqliteData = await dbService.get('sqlite', 'lifecycle:' + taskId);
    expect(sqliteData.phase).toBe('loop_3');
  });
});
```

**After** (with explicit 90s timeout):
```typescript
import { TIMEOUTS, withTimeout } from './test-timeouts';

describe('Database Transaction Tests', () => {
  // Use DATABASE timeout for multi-DB operations
  withTimeout(TIMEOUTS.DATABASE)(
    'should coordinate transactions across Redis and SQLite',
    async () => {
      const taskId = generateTaskId();

      await dbService.transaction(async (tx) => {
        await tx.set('redis', buildTaskKey(taskId), {
          id: taskId,
          status: 'in_progress',
          timestamp: Date.now(),
        });

        await tx.set('sqlite', 'lifecycle:' + taskId, {
          phase: 'loop_3',
          started_at: new Date().toISOString(),
        });
      });

      // Verification
      const redisData = await dbService.get('redis', buildTaskKey(taskId));
      expect(redisData.status).toBe('in_progress');

      const sqliteData = await dbService.get('sqlite', 'lifecycle:' + taskId);
      expect(sqliteData.phase).toBe('loop_3');
    }
  );
});
```

### Example 2: End-to-End Workflow (Performance Optimization)

**File**: `tests/integration/end-to-end-workflows.test.ts`

**Before** (timing out, inefficient):
```typescript
describe('Complete CFN Loop Workflow', () => {
  it('should execute full Loop 3 → Loop 2 → Decision flow', async () => {
    // Sequential setup (slow)
    await setupRedis();           // 5s
    await setupSQLite();          // 3s
    await setupOrchestrator();    // 7s

    // Create test data
    await createAgent('agent-1'); // 2s
    await createAgent('agent-2'); // 2s
    await createAgent('agent-3'); // 2s

    // Execute workflow
    const result = await runFullWorkflow();

    expect(result.decision).toBe('PROCEED');
  });
});
```

**After** (parallelized + fixtures + extended timeout):
```typescript
import { TIMEOUTS, withTimeout, parallelWithTimeout } from './test-timeouts';

describe('Complete CFN Loop Workflow', () => {
  // Pre-create fixtures in beforeAll
  let fixtures: WorkflowFixtures;

  beforeAll(async () => {
    // Parallel setup (15s → 7s)
    await parallelWithTimeout([
      () => setupRedis(),
      () => setupSQLite(),
      () => setupOrchestrator(),
    ], 20000);

    // Create reusable fixtures
    fixtures = await createWorkflowFixtures();
  }, TIMEOUTS.E2E);

  // Extended timeout for E2E test
  withTimeout(TIMEOUTS.E2E)(
    'should execute full Loop 3 → Loop 2 → Decision flow',
    async () => {
      // Use pre-created fixtures (instant)
      const result = await runFullWorkflow(fixtures);

      expect(result.decision).toBe('PROCEED');
    }
  );
});
```

**Improvements:**
- Parallel setup: 15s → 7s
- Fixture reuse: eliminates per-test setup
- E2E timeout: 120s for safety
- Total time: ~50s → ~15s

### Example 3: Coordination Protocol Test (Conditional Waiting)

**File**: `tests/integration/coordination-protocols.test.ts`

**Before** (timing out, inefficient waiting):
```typescript
describe('Agent Heartbeat Protocol', () => {
  it('should track agent liveness with heartbeats', async () => {
    const agentId = 'agent-test-001';

    await coordinator.registerAgent(agentId);

    // Fixed wait (always 30s)
    await sleep(30000);

    const isAlive = await coordinator.isAgentAlive(agentId);
    expect(isAlive).toBe(true);
  });
});
```

**After** (conditional waiting):
```typescript
import { waitForCondition, TIMEOUTS, withTimeout } from './test-timeouts';

describe('Agent Heartbeat Protocol', () => {
  withTimeout(TIMEOUTS.STANDARD)(
    'should track agent liveness with heartbeats',
    async () => {
      const agentId = 'agent-test-001';

      await coordinator.registerAgent(agentId);

      // Wait for condition (typically 2-5s instead of 30s)
      await waitForCondition(
        async () => await coordinator.isAgentAlive(agentId),
        30000,  // max wait
        100     // check every 100ms
      );

      const isAlive = await coordinator.isAgentAlive(agentId);
      expect(isAlive).toBe(true);
    }
  );
});
```

**Improvements:**
- Conditional waiting: 30s → ~3s (actual time needed)
- More resilient to timing variations
- Faster feedback on failures

### Example 4: Load Test (Explicit Timeout)

**File**: `tests/integration/load-testing.test.ts`

**Before** (definitely timing out at 30s):
```typescript
describe('Concurrent Agent Spawning', () => {
  it('should handle 100 concurrent agent spawns', async () => {
    const agents = Array.from({ length: 100 }, (_, i) => `agent-${i}`);

    const results = await Promise.all(
      agents.map(id => spawnAgent(id))
    );

    expect(results.every(r => r.status === 'spawned')).toBe(true);
  });
});
```

**After** (with LOAD timeout):
```typescript
import { TIMEOUTS, withTimeout } from './test-timeouts';

describe('Concurrent Agent Spawning', () => {
  withTimeout(TIMEOUTS.LOAD)(
    'should handle 100 concurrent agent spawns',
    async () => {
      const agents = Array.from({ length: 100 }, (_, i) => `agent-${i}`);

      const results = await Promise.all(
        agents.map(id => spawnAgent(id))
      );

      expect(results.every(r => r.status === 'spawned')).toBe(true);
    }
  );
});
```

**Improvement:**
- LOAD timeout: 180s for high-concurrency tests
- No code changes needed, just timeout adjustment

### Example 5: Retry for Flaky Operations

**File**: `tests/integration/redis-failure.test.ts`

**Before** (intermittent failures):
```typescript
describe('Redis Reconnection', () => {
  it('should reconnect after Redis restart', async () => {
    await redis.disconnect();
    await restartRedisServer();

    // Sometimes fails if Redis not fully ready
    const result = await redis.ping();
    expect(result).toBe('PONG');
  });
});
```

**After** (with retry logic):
```typescript
import { retryAsync, TIMEOUTS, withTimeout } from './test-timeouts';

describe('Redis Reconnection', () => {
  withTimeout(TIMEOUTS.DATABASE)(
    'should reconnect after Redis restart',
    async () => {
      await redis.disconnect();
      await restartRedisServer();

      // Retry with backoff (more reliable)
      const result = await retryAsync(
        () => redis.ping(),
        5,    // max attempts
        2000  // 2s between attempts
      );

      expect(result).toBe('PONG');
    }
  );
});
```

**Improvements:**
- Retry logic handles transient failures
- More realistic test (production also retries)
- Eliminates false positives

## Migration Pattern

For each test file with timeout issues:

1. **Import timeout helpers:**
   ```typescript
   import { TIMEOUTS, withTimeout } from './test-timeouts';
   ```

2. **Identify slow tests:**
   - Multi-database operations → `TIMEOUTS.DATABASE` (90s)
   - Full workflows → `TIMEOUTS.E2E` (120s)
   - Load tests → `TIMEOUTS.LOAD` (180s)
   - Docker operations → `TIMEOUTS.DOCKER` (120s)

3. **Apply timeout:**
   ```typescript
   // Before
   it('slow test', async () => { ... });

   // After
   withTimeout(TIMEOUTS.DATABASE)('slow test', async () => { ... });
   ```

4. **Optimize where possible:**
   - Use fixtures in `beforeAll`
   - Parallelize independent operations
   - Use conditional waiting
   - Add retry for flaky operations
   - Use transaction rollback for cleanup

5. **Verify:**
   ```bash
   npm run test:integration -- path/to/test.ts
   ```

## Quick Reference

```typescript
// Standard timeout (60s) - no changes needed
it('normal test', async () => { ... });

// Extended timeouts
withTimeout(TIMEOUTS.DATABASE)('db test', async () => { ... });  // 90s
withTimeout(TIMEOUTS.E2E)('e2e test', async () => { ... });      // 120s
withTimeout(TIMEOUTS.LOAD)('load test', async () => { ... });    // 180s

// Conditional waiting
await waitForCondition(() => ready, 30000, 100);

// Parallel execution
await parallelWithTimeout([task1, task2], 60000);

// Retry logic
await retryAsync(() => operation(), 3, 1000);
```

## Run Integration Tests

```bash
# All integration tests (60s default timeout)
npm run test:integration

# Specific file
npm run test:integration -- database-handoffs

# Single test
npm run test:integration -- -t "should coordinate transactions"

# With coverage
npm run test:integration -- --coverage

# Verbose output
npm run test:integration:verbose
```
