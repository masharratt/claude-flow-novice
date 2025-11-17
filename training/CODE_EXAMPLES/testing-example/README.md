# Integration Testing Example

Complete working example demonstrating integration testing patterns.

## Overview

- Write integration tests for cross-component workflows
- Use mocks effectively
- Validate performance
- Test error scenarios

## Test Structure

```
tests/
├── unit/                    # Fast, isolated tests
│   ├── services/
│   └── lib/
├── integration/             # Cross-component tests
│   ├── database-handoffs.test.ts
│   ├── coordination-protocols.test.ts
│   └── skill-lifecycle.test.ts
└── performance/             # SLA validation
    └── database-performance.test.ts
```

## Key Patterns

### 1. Integration Test Setup

```typescript
import { DatabaseService } from '../../src/services/database-service';
import { RedisCoordination } from '../../src/services/redis-coordination';

describe('Database Integration', () => {
  let dbService: DatabaseService;
  let coord: RedisCoordination;

  beforeEach(async () => {
    dbService = new DatabaseService({
      sqlite: { path: ':memory:' },
      postgres: { host: 'localhost', database: 'test_db' }
    });
    await dbService.initialize();

    coord = new RedisCoordination({ host: 'localhost', port: 6379 });
  });

  afterEach(async () => {
    await dbService.close();
    await coord.close();
  });

  test('cross-database transaction with coordination', async () => {
    // Test implementation
  });
});
```

### 2. Mock Usage

```typescript
import { MockDatabaseService } from '../mocks/database-service.mock';

describe('UserService', () => {
  test('handles database errors gracefully', async () => {
    const mockDb = new MockDatabaseService();
    mockDb.mockError('DatabaseError: Connection failed');

    const userService = new UserService(mockDb);

    await expect(userService.getUser(123)).rejects.toThrow(StandardError);
  });
});
```

### 3. Performance Testing

```typescript
import { measurePerformance } from '../utils/performance';

test('queries complete within SLA', async () => {
  const metrics = await measurePerformance(async () => {
    await dbService.query('postgres', 'SELECT * FROM users LIMIT 100');
  });

  expect(metrics.duration).toBeLessThan(100); // 100ms SLA
  expect(metrics.memory).toBeLessThan(50 * 1024 * 1024); // 50MB
});
```

### 4. Error Scenario Testing

```typescript
test('handles connection failures with retry', async () => {
  // Simulate connection failure
  await stopRedis();

  await expect(
    coord.publish('channel', { data: 'test' })
  ).rejects.toThrow(CoordinationError);

  // Restart and verify recovery
  await startRedis();
  await coord.publish('channel', { data: 'test' });
});
```

## Best Practices

1. Test happy path and error scenarios
2. Use appropriate test doubles (mocks, stubs, fakes)
3. Clean up resources in afterEach
4. Validate performance against SLAs
5. Test concurrent operations
6. Achieve 85%+ coverage

See full test implementations in files.
