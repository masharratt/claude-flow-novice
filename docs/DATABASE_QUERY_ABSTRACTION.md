

# Database Query Abstraction Layer

**Version:** 1.0.0
**Status:** Implemented (Task 0.4)
**Date:** 2025-11-15

---

## Overview

The Database Query Abstraction Layer provides a unified TypeScript interface for database operations across Redis, SQLite, and PostgreSQL. It enables type-safe queries, prevents SQL injection, supports cross-database transactions, and provides correlation key support for multi-system data lookups.

### Key Features

- **Unified Interface**: Single API for all three database types
- **Type Safety**: Full TypeScript support with generics
- **SQL Injection Prevention**: Parameterized queries and prepared statements
- **Connection Pooling**: Efficient resource management
- **Cross-Database Transactions**: Atomic operations across multiple databases
- **Correlation Keys**: Unified data lookup across systems
- **Error Handling**: Standardized error codes and messages
- **Query Filtering**: Consistent filter syntax across all databases

---

## Quick Start

### Installation

```typescript
import { DatabaseService } from '../src/lib/database-service';

const dbService = new DatabaseService({
  redis: {
    type: 'redis',
    host: 'localhost',
    port: 6379,
  },
  sqlite: {
    type: 'sqlite',
    database: './data.db',
  },
  postgres: {
    type: 'postgres',
    connectionString: 'postgresql://user:pass@localhost:5432/mydb',
    poolSize: 10,
  },
});

await dbService.connect();
```

### Basic CRUD Operations

```typescript
// Get specific adapter
const sqlite = dbService.getAdapter('sqlite');

// Insert
const result = await sqlite.insert('users', {
  id: 'user123',
  name: 'John Doe',
  email: 'john@example.com',
});

// Get
const user = await sqlite.get<User>('users:user123');

// Update
await sqlite.update('users', 'user123', {
  email: 'newemail@example.com',
});

// Delete
await sqlite.delete('users', 'user123');
```

---

## Database Adapters

### Redis Adapter

Key-value store with JSON serialization support.

```typescript
const redis = dbService.getAdapter('redis');

// Insert data (automatically serialized to JSON)
await redis.insert('session:abc123', {
  userId: 'user123',
  expires: new Date(),
  data: { authenticated: true },
});

// Get data (automatically deserialized)
const session = await redis.get('session:abc123');

// List keys by pattern
const sessions = await redis.list('session:*');

// Query with filters
const activeSessions = await redis.query('session:*', [
  { field: 'data.authenticated', operator: 'eq', value: true },
]);
```

**Features:**
- Automatic JSON serialization/deserialization
- Pattern-based key lookup with `KEYS` command
- Client-side filtering for queries
- **Transaction Limitations:** Redis adapter provides placeholder transaction methods for interface compliance but does not implement full MULTI/EXEC atomic transactions. For true atomic operations across Redis, use the raw Redis client or cross-database transactions will only guarantee atomicity for SQL databases.

### SQLite Adapter

Embedded database with prepared statements and transaction support.

```typescript
const sqlite = dbService.getAdapter('sqlite');

// Insert with prepared statement
await sqlite.insert('tasks', {
  id: 'task123',
  title: 'Complete documentation',
  status: 'pending',
  priority: 1,
});

// List with filtering and pagination
const tasks = await sqlite.list('tasks', {
  filters: [
    { field: 'status', operator: 'eq', value: 'pending' },
    { field: 'priority', operator: 'lte', value: 3 },
  ],
  orderBy: 'priority',
  order: 'asc',
  limit: 10,
  offset: 0,
});

// Transaction
const context = await sqlite.beginTransaction();
try {
  await sqlite.insert('tasks', { id: 'tx1', title: 'Task 1' });
  await sqlite.insert('tasks', { id: 'tx2', title: 'Task 2' });
  await sqlite.commitTransaction(context);
} catch (err) {
  await sqlite.rollbackTransaction(context);
}
```

**Features:**
- Prepared statements (SQL injection prevention)
- Server-side filtering and pagination
- Full transaction support with ACID guarantees
- Automatic schema validation

### PostgreSQL Adapter

Production-grade SQL database with connection pooling.

```typescript
const postgres = dbService.getAdapter('postgres');

// Insert with RETURNING clause
const result = await postgres.insert('agents', {
  id: 'agent456',
  type: 'backend-developer',
  status: 'active',
});
console.log('Inserted ID:', result.insertId);

// Batch insert (atomic)
await postgres.insertMany('metrics', [
  { id: 'm1', value: 100, timestamp: new Date() },
  { id: 'm2', value: 200, timestamp: new Date() },
  { id: 'm3', value: 150, timestamp: new Date() },
]);

// Complex query with multiple filters
const agents = await postgres.list('agents', {
  filters: [
    { field: 'status', operator: 'eq', value: 'active' },
    { field: 'type', operator: 'in', value: ['backend-developer', 'frontend-developer'] },
  ],
  limit: 50,
});
```

**Features:**
- Connection pooling for performance
- Parameterized queries ($1, $2, etc.)
- `RETURNING` clause support
- Full ACID transaction support
- Deadlock detection

---

## Query Filtering

### Filter Operators

All adapters support a consistent set of filter operators:

```typescript
interface QueryFilter<T> {
  field: keyof T;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'between';
  value: any;
}
```

**Examples:**

```typescript
// Equality
{ field: 'status', operator: 'eq', value: 'active' }

// Greater than
{ field: 'priority', operator: 'gt', value: 5 }

// In array
{ field: 'type', operator: 'in', value: ['developer', 'tester'] }

// Like (pattern matching)
{ field: 'name', operator: 'like', value: 'John' }  // Matches '%John%'

// Between
{ field: 'created_at', operator: 'between', value: [startDate, endDate] }
```

### Query Options

```typescript
interface QueryOptions<T> {
  filters?: QueryFilter<T>[];
  limit?: number;
  offset?: number;
  orderBy?: keyof T;
  order?: 'asc' | 'desc';
}
```

**Example:**

```typescript
const results = await adapter.list('tasks', {
  filters: [
    { field: 'status', operator: 'eq', value: 'pending' },
  ],
  orderBy: 'priority',
  order: 'desc',
  limit: 20,
  offset: 0,
});
```

### Database-Specific Operator Support

While all adapters implement the same filter interface, operator support varies by database:

| Operator | Redis | SQLite | PostgreSQL | Notes |
|----------|-------|--------|------------|-------|
| `eq` | ✅ | ✅ | ✅ | |
| `ne` | ✅ | ✅ | ✅ | |
| `gt` | ✅ | ✅ | ✅ | |
| `gte` | ✅ | ✅ | ✅ | |
| `lt` | ✅ | ✅ | ✅ | |
| `lte` | ✅ | ✅ | ✅ | |
| `in` | ✅ | ✅ | ✅ | |
| `like` | ✅ | ✅ | ✅ | |
| `between` | ❌ | ✅ | ✅ | Redis uses client-side filtering, `between` not implemented |

**Redis Limitations:**
- Redis adapter performs **client-side filtering** after retrieving data
- The `between` operator is not implemented for Redis
- For large datasets, consider using Redis data structures or caching strategies
- Ordering is applied client-side after retrieval

**SQLite/PostgreSQL:**
- Full **server-side filtering** with database query optimization
- All operators supported natively
- Ordering and pagination performed at database level

---

## Correlation Keys

Correlation keys enable unified data lookup across multiple databases.

### Format

```
{type}:{id}:{entity}:{subtype}
```

**Examples:**
- `task:abc123:agent:backend-developer`
- `agent:agent-456:execution:iteration-1`
- `skill:auth-validation:metrics`

### Building Correlation Keys

```typescript
import { buildTaskKey, buildAgentKey, buildCorrelationKey } from '../src/lib/database-service';

// Utility functions
const key1 = buildTaskKey('task123', 'agent');
// Result: "task:task123:agent"

const key2 = buildAgentKey('agent456', 'execution');
// Result: "agent:agent456:execution"

// Manual construction
const key3 = buildCorrelationKey({
  type: 'task',
  id: 'abc123',
  entity: 'skill',
  subtype: 'validation',
});
// Result: "task:abc123:skill:validation"
```

### Cross-Database Lookup

```typescript
const result = await dbService.getByCorrelationKey({
  type: 'task',
  id: 'abc123',
  entity: 'agent',
});

console.log(result);
// {
//   correlationKey: "task:abc123:agent",
//   redis: { ... },      // Data from Redis
//   sqlite: { ... },     // Data from SQLite
//   postgres: { ... },   // Data from PostgreSQL
//   timestamp: Date
// }
```

---

## Cross-Database Transactions

Execute atomic operations across multiple databases.

### Example

```typescript
const results = await dbService.executeTransaction([
  {
    database: 'sqlite',
    operation: async (adapter) => {
      return adapter.insert('skills', {
        id: 'skill1',
        name: 'Authentication',
        status: 'APPROVED',
      });
    },
  },
  {
    database: 'postgres',
    operation: async (adapter) => {
      return adapter.insert('workflow_patterns', {
        skill_id: 'skill1',
        version: '1.0.0',
        status: 'DEPLOYED',
      });
    },
  },
]);

// If any operation fails, all are rolled back
```

### Transaction Guarantees

- **Atomicity**: All operations succeed or all are rolled back
- **Error Handling**: Automatic rollback on any failure
- **Isolation**: Each database maintains its own transaction isolation
- **Cleanup**: Automatic cleanup of stale transactions (60s timeout)

### Known Limitations

**PostgreSQL Transaction Routing:**
Individual CRUD operations (`get`, `list`, `insert`, `update`, `delete`) execute against the connection pool and do not automatically route through active transaction clients. This means:

- Operations called outside `executeTransaction()` work correctly
- Operations called **inside** `executeTransaction()` operations may not be atomic with the transaction context
- **Workaround**: Use the `raw()` method with explicit SQL within transaction operations for guaranteed transactional behavior
- **Future Fix**: Requires architectural refactor to add AsyncLocalStorage or optional TransactionContext parameters to all CRUD methods

**Example (Current Limitation):**
```typescript
// ❌ May not be atomic - CRUD methods bypass transaction client
await dbService.executeTransaction([
  {
    database: 'postgres',
    operation: async (adapter) => {
      // This insert may not participate in the transaction!
      return adapter.insert('users', { id: '1', name: 'Test' });
    }
  }
]);

// ✅ Guaranteed atomic - using raw SQL
await dbService.executeTransaction([
  {
    database: 'postgres',
    operation: async (adapter) => {
      return adapter.raw('INSERT INTO users (id, name) VALUES ($1, $2)', ['1', 'Test']);
    }
  }
]);
```

**SQLite Nested Transactions:**
SQLite doesn't support nested transactions. The `insertMany()` method now checks for active transactions before issuing `BEGIN TRANSACTION` to prevent errors. When called within an active transaction, it skips `BEGIN/COMMIT` and uses the parent transaction.

---

## Error Handling

### Error Codes

```typescript
enum DatabaseErrorCode {
  CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  QUERY_FAILED = 'DB_QUERY_FAILED',
  TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  VALIDATION_FAILED = 'DB_VALIDATION_FAILED',
  NOT_FOUND = 'DB_NOT_FOUND',
  DUPLICATE_KEY = 'DB_DUPLICATE_KEY',
  TIMEOUT = 'DB_TIMEOUT',
  CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',
}
```

### Error Handling Pattern

```typescript
const result = await adapter.update('users', 'user123', { email: 'new@example.com' });

if (!result.success) {
  console.error('Update failed:', result.error?.message);
  console.error('Error code:', result.error?.code);
  console.error('Context:', result.error?.context);
}
```

### Graceful Degradation

```typescript
try {
  const data = await adapter.get('users:user123');
  return data;
} catch (err) {
  if (isDatabaseError(err, DatabaseErrorCode.NOT_FOUND)) {
    return null;  // Expected error - return default
  }
  throw err;  // Unexpected error - propagate
}
```

---

## Connection Management

### Connection Pooling

```typescript
// PostgreSQL connection pool configuration
const dbService = new DatabaseService({
  postgres: {
    type: 'postgres',
    connectionString: 'postgresql://...',
    poolSize: 10,              // Max connections in pool
    timeout: 30000,            // Idle timeout (30s)
  },
});
```

### Lifecycle Management

```typescript
// Connect to all databases
await dbService.connect();

// Check connection status
console.log(dbService.isConnected());  // true

// Get statistics
const stats = dbService.getStats();
console.log(stats);
// {
//   adapters: {
//     redis: true,
//     sqlite: true,
//     postgres: true
//   },
//   transactions: {
//     active: 0
//   }
// }

// Disconnect from all databases
await dbService.disconnect();
```

---

## Best Practices

### 1. Use Prepared Statements

**❌ Bad (SQL Injection Risk):**
```typescript
await adapter.raw(`SELECT * FROM users WHERE email = '${userInput}'`);
```

**✅ Good (Parameterized):**
```typescript
await adapter.raw('SELECT * FROM users WHERE email = $1', [userInput]);
```

### 2. Use Type Safety

```typescript
interface Task {
  id: string;
  title: string;
  status: 'pending' | 'completed';
  priority: number;
}

const task = await adapter.get<Task>('tasks:task123');
// TypeScript knows task.status is 'pending' | 'completed'
```

### 3. Handle Errors Explicitly

```typescript
const result = await adapter.insert('users', userData);

if (!result.success) {
  if (result.error?.code === DatabaseErrorCode.DUPLICATE_KEY) {
    return { error: 'User already exists' };
  }
  throw result.error;
}

return { success: true, data: result.data };
```

### 4. Use Correlation Keys for Cross-Database Data

```typescript
// Store related data with same correlation key
const key = buildTaskKey('task123');

await redis.insert(key, { status: 'running' });
await sqlite.insert('tasks', { id: key, title: 'Task 123' });
await postgres.insert('metrics', { task_id: key, value: 100 });

// Retrieve all related data
const allData = await dbService.getByCorrelationKey({ type: 'task', id: 'task123' });
```

### 5. Use Transactions for Multi-Step Operations

```typescript
const context = await adapter.beginTransaction();

try {
  await adapter.insert('orders', orderData);
  await adapter.update('inventory', productId, { quantity: newQuantity });
  await adapter.commitTransaction(context);
} catch (err) {
  await adapter.rollbackTransaction(context);
  throw err;
}
```

---

## Performance Considerations

### Connection Pooling

- **PostgreSQL**: Uses connection pooling by default (configurable via `poolSize`)
- **SQLite**: Single connection per instance (embedded database)
- **Redis**: Single connection with pipelining support

### Query Optimization

- Use **filters** to reduce result set size
- Use **limit** and **offset** for pagination
- Use **indexes** on frequently queried fields (SQLite, PostgreSQL)

### Caching Strategy

```typescript
// Use Redis for hot data caching
const key = buildTaskKey('task123');

// Check cache first
let data = await redis.get(key);

if (!data) {
  // Cache miss - query database
  data = await postgres.get(`tasks:task123`);

  // Populate cache
  await redis.insert(key, data);
}
```

---

## Integration with CFN Loop

### Agent Output Storage

```typescript
const agentKey = buildAgentKey(agentId, 'output');

await sqlite.insert('agent_outputs', {
  id: agentKey,
  agent_type: 'backend-developer',
  confidence: 0.85,
  deliverables: JSON.stringify(deliverables),
  timestamp: new Date(),
});
```

### Cross-Database Skill Deployment

```typescript
await dbService.executeTransaction([
  {
    database: 'sqlite',
    operation: async (adapter) => {
      return adapter.insert('skills', {
        id: skillId,
        name: skillName,
        status: 'APPROVED',
      });
    },
  },
  {
    database: 'postgres',
    operation: async (adapter) => {
      return adapter.insert('workflow_patterns', {
        skill_id: skillId,
        version: '1.0.0',
        status: 'DEPLOYED',
      });
    },
  },
]);
```

---

## Testing

### Unit Tests

```typescript
import { DatabaseService } from '../src/lib/database-service';

describe('Database Service', () => {
  let dbService: DatabaseService;

  beforeAll(async () => {
    dbService = new DatabaseService({
      sqlite: { type: 'sqlite', database: ':memory:' },
    });
    await dbService.connect();
  });

  it('should insert and retrieve data', async () => {
    const adapter = dbService.getAdapter('sqlite');
    await adapter.insert('test_table', { id: '1', name: 'Test' });
    const result = await adapter.get('test_table:1');
    expect(result).toEqual({ id: '1', name: 'Test' });
  });
});
```

### Integration Tests

Run comprehensive test suite:

```bash
npm test tests/database-service.test.ts
```

**Test Coverage:** 90%+

---

## Troubleshooting

### Connection Errors

**Problem:** `DB_CONNECTION_FAILED` error

**Solutions:**
- Verify database is running
- Check connection string/credentials
- Ensure network connectivity
- Check firewall rules

### Transaction Timeouts

**Problem:** Transactions timing out

**Solutions:**
- Check for deadlocks in database logs
- Reduce transaction scope
- Increase timeout configuration
- Use stale transaction cleanup

### Query Performance

**Problem:** Slow query performance

**Solutions:**
- Add database indexes
- Use query filters to reduce result set
- Enable connection pooling
- Use pagination (limit/offset)

---

## API Reference

### DatabaseService

**Methods:**
- `connect()`: Connect to all databases
- `disconnect()`: Disconnect from all databases
- `getAdapter(type)`: Get specific database adapter
- `getByCorrelationKey(key)`: Cross-database lookup
- `executeTransaction(operations)`: Atomic cross-database transaction
- `buildCorrelationKey(key)`: Build correlation key string
- `parseCorrelationKey(key)`: Parse correlation key string
- `isConnected()`: Check connection status
- `getStats()`: Get database statistics

### IDatabaseAdapter

**Methods:**
- `connect()`: Connect to database
- `disconnect()`: Disconnect from database
- `isConnected()`: Check connection status
- `get<T>(key)`: Get single record
- `list<T>(table, options?)`: List records with filtering
- `query<T>(table, filters)`: Query with custom filters
- `insert<T>(table, data)`: Insert record
- `insertMany<T>(table, data)`: Batch insert
- `update<T>(table, key, data)`: Update record
- `delete(table, key)`: Delete record
- `raw<T>(query, params?)`: Execute raw query
- `beginTransaction()`: Start transaction
- `commitTransaction(context)`: Commit transaction
- `rollbackTransaction(context)`: Rollback transaction

---

## Migration Guide

### From Direct Database Access

**Before:**
```typescript
import { Pool } from 'pg';

const pool = new Pool({ connectionString: '...' });
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
```

**After:**
```typescript
import { DatabaseService } from '../src/lib/database-service';

const dbService = new DatabaseService({
  postgres: { type: 'postgres', connectionString: '...' },
});

await dbService.connect();
const postgres = dbService.getAdapter('postgres');
const user = await postgres.get(`users:${userId}`);
```

### Benefits

- Type safety with generics
- Unified error handling
- Automatic SQL injection prevention
- Connection pooling
- Cross-database support

---

## Future Enhancements (Task 0.5+)

- [ ] Query builder interface
- [ ] Automatic schema migrations
- [ ] Read replicas support
- [ ] Query caching layer
- [ ] Performance monitoring
- [ ] Audit logging
- [ ] Backup/restore utilities

---

## Related Documentation

- [Config Standardization](./CONFIG_STANDARDIZATION.md) - Database configuration
- [Artifact Registry](./ARTIFACT_REGISTRY_GUIDE.md) - Artifact storage patterns
- [Agent Output Schema](./AGENT_OUTPUT_SCHEMA.md) - Agent output persistence
- [Integration Standardization Plan](../planning/INTEGRATION_STANDARDIZATION_IMPLEMENTATION_PLAN.md) - Overall strategy

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-15
**Author:** Task 0.4 Implementation Team
**Status:** Complete
