# Database Integration Example

Complete working example demonstrating standardized database integration patterns.

## Overview

This example shows how to:
- Use DatabaseService for all database operations
- Implement cross-database transactions
- Handle errors with StandardError
- Write integration tests
- Implement connection pooling

## Files

- `database-service.ts` - Standardized database service implementation
- `user-repository.ts` - Example repository using DatabaseService
- `example.ts` - Usage examples
- `database-service.test.ts` - Integration tests

## Setup

```bash
# Install dependencies
npm install

# Start test databases
docker-compose up -d postgres sqlite

# Run migrations
npm run db:migrate

# Run example
npm run example

# Run tests
npm test
```

## Key Patterns

### 1. Basic Query

```typescript
import { DatabaseService } from './database-service';

const db = new DatabaseService({
  sqlite: { path: './data/app.db' },
  postgres: { host: 'localhost', database: 'cfn' }
});

// Simple query
const users = await db.query('postgres',
  'SELECT * FROM users WHERE active = $1',
  [true]
);
```

### 2. Transaction

```typescript
// Atomic multi-step operation
await db.transaction('postgres', async (pgDb) => {
  await pgDb.query(
    'INSERT INTO users (name, email) VALUES ($1, $2)',
    ['Alice', 'alice@example.com']
  );

  await pgDb.query(
    'INSERT INTO audit_log (action, details) VALUES ($1, $2)',
    ['user_created', JSON.stringify({ name: 'Alice' })]
  );

  // Both succeed or both roll back
});
```

### 3. Error Handling

```typescript
import { StandardError, ErrorCode } from './lib/errors';

try {
  await db.query('postgres', 'SELECT * FROM users WHERE id = $1', [userId]);
} catch (error) {
  if (error instanceof StandardError) {
    console.error('Database error:', {
      code: error.code,
      message: error.message,
      context: error.context
    });
  }
  throw error;
}
```

### 4. Cross-Database Operations

```typescript
// Query multiple databases
const [pgUsers, sqliteStats] = await Promise.all([
  db.query('postgres', 'SELECT * FROM users'),
  db.query('sqlite', 'SELECT COUNT(*) as count FROM audit_log')
]);

console.log(`Users: ${pgUsers.length}, Audit entries: ${sqliteStats[0].count}`);
```

## Running the Example

```bash
# Run the complete example
npm run example

# Expected output:
# ✓ Created user: Alice
# ✓ Found 1 users
# ✓ Transaction completed
# ✓ Audit log entry created
# ✓ User updated
# ✓ All tests passed
```

## Integration Testing

```bash
# Run integration tests
npm test

# Tests cover:
# - Basic CRUD operations
# - Transaction rollback
# - Error handling
# - Connection pooling
# - Performance benchmarks
```

## Common Patterns

### Repository Pattern

```typescript
export class UserRepository {
  constructor(private db: DatabaseService) {}

  async findById(id: number): Promise<User | null> {
    const users = await this.db.query<User>('postgres',
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return users[0] || null;
  }

  async create(user: Omit<User, 'id'>): Promise<User> {
    const result = await this.db.query<User>('postgres',
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [user.name, user.email]
    );
    return result[0];
  }

  async update(id: number, updates: Partial<User>): Promise<User> {
    await this.db.transaction('postgres', async (db) => {
      await db.query(
        'UPDATE users SET name = $1, email = $2 WHERE id = $3',
        [updates.name, updates.email, id]
      );

      await db.query(
        'INSERT INTO audit_log (action, user_id) VALUES ($1, $2)',
        ['user_updated', id]
      );
    });

    return await this.findById(id);
  }
}
```

## Best Practices Demonstrated

1. **Always use parameterized queries** - Prevents SQL injection
2. **Transactions for multi-step operations** - Ensures atomicity
3. **Proper error handling** - Wrap errors in StandardError
4. **Connection cleanup** - Always close connections in finally blocks
5. **Health checks** - Implement and monitor database health
6. **Connection pooling** - Configure appropriate pool sizes
7. **Testing** - Write integration tests for all database operations

## Performance Considerations

```typescript
// Configure connection pooling
const db = new DatabaseService({
  postgres: {
    host: 'localhost',
    database: 'cfn',
    poolSize: 20,          // Adjust based on load
    idleTimeout: 30000,    // 30s
    connectionTimeout: 5000 // 5s
  }
});

// Monitor query performance
const start = Date.now();
await db.query('postgres', 'SELECT * FROM users');
const duration = Date.now() - start;

if (duration > 100) {
  logger.warn('Slow query detected', { duration });
}
```

## Migration From Legacy Code

### Before (Legacy):
```typescript
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('app.db');
db.run('INSERT INTO users (name) VALUES (?)', ['Alice'], (err) => {
  if (err) console.error(err);
});
```

### After (Standardized):
```typescript
import { DatabaseService } from './services/database-service';

const db = new DatabaseService({
  sqlite: { path: './app.db' }
});

try {
  await db.query('sqlite', 'INSERT INTO users (name) VALUES (?)', ['Alice']);
} catch (error) {
  logger.error('Insert failed', { error });
  throw error;
}
```

## Troubleshooting

### Connection Failures

```typescript
// Implement retry logic
import { retry } from './lib/retry';

const users = await retry(
  () => db.query('postgres', 'SELECT * FROM users'),
  {
    maxAttempts: 3,
    backoff: 'exponential'
  }
);
```

### Transaction Deadlocks

```typescript
try {
  await db.transaction('postgres', async (db) => {
    // Keep transactions short
    // Acquire locks in consistent order
    // Set appropriate timeout
  });
} catch (error) {
  if (error.code === 'DB_DEADLOCK') {
    // Retry transaction
    await retry(() => performTransaction());
  }
}
```

## Next Steps

1. Review the implementation in `database-service.ts`
2. Study the tests in `database-service.test.ts`
3. Run the example and observe the output
4. Try modifying the example to add new operations
5. Implement similar patterns in your own code

## Resources

- Database Service API: `/docs/DATABASE_SERVICE_API.md`
- Error Handling Guide: `/docs/ERROR_HANDLING.md`
- Integration Testing: `/docs/INTEGRATION_TESTING.md`
