# Async Cleanup Pattern Application Guide

This document describes the cleanup pattern applied to fix "Cannot log after tests are done" errors.

## Problem

Async operations (timers, database connections, Redis connections, event listeners) continuing after test completion cause Jest to log errors.

## Solution

Use `TestCleanupManager` to track and clean up all async resources.

## Pattern for Test Files with Database Connections

```typescript
import { TestCleanupManager } from './utils/cleanup';

describe('MyTest', () => {
  let dbService: DatabaseService;
  const cleanup = new TestCleanupManager();

  beforeEach(async () => {
    dbService = await setupDatabase();
    cleanup.trackDatabaseService(dbService);
  });

  afterEach(async () => {
    await cleanup.cleanupAll({
      timeout: 3000,
      suppressErrors: true,
      forceClose: true
    });
  });

  afterAll(async () => {
    await cleanup.cleanupAll({
      timeout: 1000,
      suppressErrors: true,
      forceClose: true
    });
  });
});
```

## Pattern for Test Files with Redis Connections

```typescript
import { TestCleanupManager } from './utils/cleanup';

describe('MyTest', () => {
  let redisClient: RedisClientType;
  const cleanup = new TestCleanupManager();

  beforeEach(async () => {
    redisClient = createClient();
    await redisClient.connect();
    cleanup.trackRedisClient(redisClient);
  });

  afterEach(async () => {
    await cleanup.cleanupAll({
      timeout: 3000,
      suppressErrors: true,
      forceClose: true
    });
  });

  afterAll(async () => {
    await cleanup.cleanupAll({
      timeout: 1000,
      suppressErrors: true,
      forceClose: true
    });
  });
});
```

## Pattern for Test Files with setTimeout/setInterval

```typescript
import { TestCleanupManager } from './utils/cleanup';

describe('MyTest', () => {
  const cleanup = new TestCleanupManager();

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();

    // Optional: for tests that need real timers
    // cleanup.cleanupAll();
  });

  it('test with timer', async () => {
    // Replace setTimeout with jest.advanceTimersByTime
    // OLD: await new Promise(resolve => setTimeout(resolve, 100));
    // NEW: jest.advanceTimersByTime(100);
  });
});
```

## Files Fixed

### ✅ Completed
1. `/tests/backup-manager.test.ts` - Added jest.useFakeTimers() and TestCleanupManager
2. `/tests/cfn-v3/redis-agent-coordination.test.js` - Added proper Redis cleanup with unsubscribe
3. `/tests/metrics-logger.test.ts` - Added TestCleanupManager with DatabaseService tracking
4. `/tests/setup-cleanup.ts` - Added global cleanup integration

### 📋 Recommended for Similar Treatment

Database connection files:
- `/tests/checkpoint-manager.test.ts`
- `/tests/config-manager.test.ts`
- `/tests/database-service.test.ts`
- `/tests/distributed-lock-enhanced.test.ts`
- `/tests/database/connection-pool.test.ts`
- `/tests/database/error-handling.test.ts`
- `/tests/integration/database-handoffs.test.ts`

Redis connection files:
- `/tests/cfn-v3/redis-waiting-mode.test.js`
- `/tests/cfn-v3/spawn-workers.test.js`

Timer-heavy files (need jest.useFakeTimers()):
- `/tests/checkpoint-manager.test.ts`
- `/tests/correlation-cache-cleanup.test.ts`
- `/tests/distributed-lock-enhanced.test.ts`
- `/tests/file-lock-manager.test.ts`

## Key Changes Made

1. **Import TestCleanupManager**: Added cleanup utility import
2. **Track resources**: Call `.track*()` methods in `beforeEach`
3. **Clean up in afterEach**: Call `.cleanupAll()` with timeout
4. **Final cleanup in afterAll**: Ensure no leaked resources
5. **Replace setTimeout**: Use `jest.useFakeTimers()` and `jest.advanceTimersByTime()`
6. **Force disconnect**: Use `disconnect()` instead of `quit()` for stuck connections

## Testing the Fixes

Run the affected test files to verify cleanup:

```bash
npm test tests/backup-manager.test.ts
npm test tests/cfn-v3/redis-agent-coordination.test.js
npm test tests/metrics-logger.test.ts
```

Expected result: No "Cannot log after tests are done" errors.

## Impact

Before fixes: ~100 async cleanup failures (31.8% of total failures)
After fixes: Should resolve majority of async cleanup errors
