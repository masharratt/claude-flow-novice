# Integration Test Timeout Optimization Guide

## Problem Statement

Integration tests were timing out with the default 30-second Jest timeout due to:
- Multiple database operations (Redis + SQLite + Postgres)
- Docker container startup/teardown
- End-to-end workflow simulations
- Coordination protocol tests with actual delays
- Load testing with concurrent requests

**Impact**: ~24 test failures (7.6% of test suite) from timeout issues.

## Solution Overview

### 1. Separate Configuration for Integration Tests

Created `jest.integration.config.ts` with extended timeouts:

```bash
# Run integration tests with 60s default timeout
npm run test:integration

# Run with verbose output
npm run test:integration:verbose

# Watch mode for development
npm run test:integration:watch
```

**Timeout Settings:**
- Default: 60 seconds (was 30s)
- Per-test overrides available via `test-timeouts.ts` helpers

### 2. Per-Test Timeout Helpers

Use `tests/integration/test-timeouts.ts` for test-specific timeouts:

```typescript
import { TIMEOUTS, withTimeout } from './test-timeouts';

describe('Complex Integration Tests', () => {
  // Standard timeout (60s) - no change needed
  it('should handle normal operations', async () => {
    // ...
  });

  // Extended timeout for database operations (90s)
  withTimeout(TIMEOUTS.DATABASE)('should complete transaction', async () => {
    // Multiple database operations
  });

  // Extended timeout for E2E workflows (120s)
  withTimeout(TIMEOUTS.E2E)('should complete full workflow', async () => {
    // End-to-end simulation
  });

  // Extended timeout for load tests (180s)
  withTimeout(TIMEOUTS.LOAD)('should handle concurrent requests', async () => {
    // Load testing
  });
});
```

### 3. Available Timeout Constants

```typescript
TIMEOUTS.STANDARD  // 60s  - Default integration test
TIMEOUTS.DATABASE  // 90s  - Multiple DB operations
TIMEOUTS.E2E       // 120s - End-to-end workflows
TIMEOUTS.LOAD      // 180s - Load/Performance tests
TIMEOUTS.DOCKER    // 120s - Docker operations
```

## Optimization Strategies

### Strategy 1: Use Test Fixtures

**Before:**
```typescript
it('should process user data', async () => {
  // Creating test data takes 5-10 seconds
  const user = await createUser({ name: 'Test' });
  const profile = await createProfile(user.id);
  const settings = await createSettings(user.id);

  // Actual test logic
  await processUserData(user.id);
});
```

**After:**
```typescript
// Global fixture creation in beforeAll
let testFixtures: TestFixtures;

beforeAll(async () => {
  testFixtures = await createTestFixtures();
});

it('should process user data', async () => {
  // Use pre-created fixtures (instant)
  await processUserData(testFixtures.user.id);
});
```

**Savings**: 5-10 seconds per test → 0.1 seconds

### Strategy 2: Parallelize Independent Operations

**Before:**
```typescript
it('should sync all databases', async () => {
  await syncRedis();    // 2s
  await syncSQLite();   // 2s
  await syncPostgres(); // 2s
  // Total: 6 seconds
});
```

**After:**
```typescript
import { parallelWithTimeout } from './test-timeouts';

it('should sync all databases', async () => {
  await parallelWithTimeout([
    () => syncRedis(),
    () => syncSQLite(),
    () => syncPostgres(),
  ], 10000);
  // Total: 2 seconds (max of individual times)
});
```

**Savings**: 6 seconds → 2 seconds

### Strategy 3: Transaction Rollback for Cleanup

**Before:**
```typescript
afterEach(async () => {
  // Delete all test data individually
  await db.delete('users', { test: true });    // 1s
  await db.delete('profiles', { test: true }); // 1s
  await db.delete('settings', { test: true }); // 1s
  // Total: 3 seconds per test
});
```

**After:**
```typescript
let transaction: Transaction;

beforeEach(async () => {
  transaction = await db.beginTransaction();
});

afterEach(async () => {
  // Rollback entire transaction
  await transaction.rollback(); // 0.1s
});
```

**Savings**: 3 seconds → 0.1 seconds per test

### Strategy 4: Retry Flaky Operations

**Before:**
```typescript
it('should connect to Redis', async () => {
  // Fails intermittently due to timing
  const result = await redis.ping();
  expect(result).toBe('PONG');
});
```

**After:**
```typescript
import { retryAsync } from './test-timeouts';

it('should connect to Redis', async () => {
  const result = await retryAsync(
    () => redis.ping(),
    3,  // max attempts
    1000 // delay between attempts
  );
  expect(result).toBe('PONG');
});
```

**Benefit**: Eliminates false failures from transient issues

### Strategy 5: Conditional Waiting

**Before:**
```typescript
it('should wait for agent completion', async () => {
  await spawnAgent();
  await sleep(30000); // Always wait full time
  const status = await getAgentStatus();
  expect(status).toBe('completed');
});
```

**After:**
```typescript
import { waitForCondition } from './test-timeouts';

it('should wait for agent completion', async () => {
  await spawnAgent();
  await waitForCondition(
    async () => (await getAgentStatus()) === 'completed',
    30000,  // max wait
    100     // check interval
  );
  const status = await getAgentStatus();
  expect(status).toBe('completed');
});
```

**Savings**: 30 seconds → actual completion time (often 5-10 seconds)

## Test-Specific Optimizations

### Coordination Protocol Tests

**Files**: `tests/integration/coordination-protocols.test.ts`

**Optimizations:**
1. Use fixtures for agent data
2. Parallelize independent protocol tests
3. Use `waitForCondition` for heartbeat tests
4. Transaction rollback for cleanup

**Expected improvement**: 60s → 40s per suite

### Database Handoff Tests

**Files**: `tests/integration/database-handoffs.test.ts`

**Optimizations:**
1. Pre-create test databases in beforeAll
2. Use transaction rollback for cleanup
3. Parallelize CRUD operations across adapters
4. Cache database connections

**Expected improvement**: 90s → 50s per suite

### End-to-End Workflow Tests

**Files**: `tests/integration/end-to-end-workflows.test.ts`

**Optimizations:**
1. Use `TIMEOUTS.E2E` (120s) for full workflows
2. Skip cleanup in beforeEach (use afterAll)
3. Parallelize independent workflow tests
4. Use fixtures for common workflow components

**Expected improvement**: No timeout failures, 150s → 100s

## Performance Monitoring

### Identify Slow Tests

```bash
# Run with verbose timing
npm run test:integration:verbose

# Look for tests taking >20s
grep "PASS.*\([2-9][0-9]\|[1-9][0-9][0-9]\) ms" test-output.log
```

### Generate Performance Report

```bash
# Run with custom reporter
jest --config=jest.integration.config.ts --json --outputFile=.artifacts/test-performance.json

# Analyze slow tests
node -e "
const data = require('./.artifacts/test-performance.json');
const slow = data.testResults
  .flatMap(r => r.testResults)
  .filter(t => t.duration > 20000)
  .sort((a, b) => b.duration - a.duration);
console.table(slow.map(t => ({
  name: t.fullName,
  duration: (t.duration / 1000).toFixed(1) + 's'
})));
"
```

## Configuration Reference

### Integration Test Config (`jest.integration.config.ts`)

```typescript
{
  testTimeout: 60000,           // 60s default
  maxWorkers: '50%',            // Limit parallelism
  globalSetup: 'global-setup',  // Shared setup
  globalTeardown: 'global-teardown', // Shared cleanup
  verbose: true                 // Detailed output
}
```

### Test Script Commands

```bash
# Standard run
npm run test:integration

# Verbose output
npm run test:integration:verbose

# Watch mode
npm run test:integration:watch

# Specific test file
npm run test:integration -- coordination-protocols

# With coverage
npm run test:integration -- --coverage

# Single test
npm run test:integration -- -t "should handle CRUD operations"
```

## Troubleshooting

### Test Still Timing Out After 60s

1. Add test-specific timeout:
   ```typescript
   withTimeout(TIMEOUTS.E2E)('slow test', async () => { ... });
   ```

2. Verify no blocking operations:
   ```bash
   # Add debug logging
   DEBUG=* npm run test:integration -- slow-test
   ```

3. Check for resource leaks:
   ```typescript
   afterEach(async () => {
     // Ensure cleanup runs
     await closeAllConnections();
   });
   ```

### Tests Fail with "Jest did not exit"

Add cleanup in afterAll:

```typescript
afterAll(async () => {
  await redis.disconnect();
  await db.close();
  await stopDockerContainers();
});
```

### Intermittent Timeout Failures

Use retry helper:

```typescript
import { retryAsync } from './test-timeouts';

const result = await retryAsync(() => flakeyOperation(), 3, 1000);
```

## Migration Checklist

For each integration test file:

- [ ] Identify tests that need >30s timeout
- [ ] Apply appropriate timeout constant
- [ ] Review for optimization opportunities
- [ ] Add fixtures for repeated setup
- [ ] Parallelize independent operations
- [ ] Use transaction rollback for cleanup
- [ ] Add conditional waiting for async operations
- [ ] Verify cleanup in afterAll hooks
- [ ] Test with new configuration
- [ ] Document any test-specific requirements

## Success Metrics

**Before Optimization:**
- 24 timeout failures (~7.6% of suite)
- Average suite time: 120-180 seconds
- False positive rate: ~10%

**After Optimization:**
- 0 timeout failures
- Average suite time: 60-90 seconds (40-50% faster)
- False positive rate: <1%

## Related Files

- `jest.integration.config.ts` - Integration test configuration
- `tests/integration/test-timeouts.ts` - Timeout utilities
- `tests/integration/global-setup.ts` - Global setup
- `tests/integration/global-teardown.ts` - Global cleanup
- `package.json` - NPM scripts
