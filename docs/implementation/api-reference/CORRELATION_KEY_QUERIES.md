# Correlation Key Query Layer

Comprehensive guide to multi-system correlation key queries for cross-database data retrieval.

**Part of**: Task 3.3 - Query Correlation Key Layer
**Version**: 1.0.0
**Author**: Backend Development Team

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Query Patterns](#query-patterns)
- [Caching Strategy](#caching-strategy)
- [Performance Tuning](#performance-tuning)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Correlation Key Query Layer enables efficient cross-database queries using correlation keys. It provides:

- **Multi-system queries**: Query across Redis, SQLite, and PostgreSQL simultaneously
- **Priority-ordered execution**: Optimize query performance based on database speed
- **Intelligent caching**: LRU cache with TTL for frequently accessed data
- **Result merging**: Automatic deduplication and joining of multi-database results
- **Performance guarantees**: <2 second execution time for complex queries

### Key Concepts

**Correlation Key Format**: `{type}:{id}:{entity}:{subtype}`

- `type`: One of `task`, `agent`, `skill`, `execution`
- `id`: Unique identifier
- `entity`: Optional entity name (e.g., `agent`, `skill`)
- `subtype`: Optional additional context

**Examples**:
```
task:abc123:agent:backend-developer
agent:agent-456:execution:iteration-1
skill:auth-validation:invocation
```

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                  Multi-System Query                      │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Query Builder│  │ Cache Layer  │  │ Result Merger│ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                  │                  │         │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
          ▼                  ▼                  ▼
    ┌─────────────────────────────────────────────────┐
    │          Database Service (Adapters)            │
    ├────────────┬─────────────┬─────────────────────┤
    │   Redis    │   SQLite    │    PostgreSQL       │
    │ (fastest)  │  (medium)   │    (slowest)        │
    └────────────┴─────────────┴─────────────────────┘
```

### Query Execution Flow

1. **Query Construction**: Build query using fluent interface
2. **Cache Check**: Check LRU cache for existing results
3. **Priority Execution**: Execute query based on priority strategy
4. **Result Merging**: Deduplicate and merge results from multiple databases
5. **Cache Storage**: Store results in cache for future queries

### Execution Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| **Fastest** | Stop on first non-empty result | Quick lookups, read-heavy workloads |
| **Balanced** | Query all systems in parallel | Standard queries, best default |
| **Comprehensive** | Query all systems, always return all | Data validation, consistency checks |

---

## Quick Start

### Installation

```typescript
import { DatabaseService } from './lib/database-service';
import { MultiSystemQuery, createMultiSystemQuery } from './lib/multi-system-query';
import { CorrelationCache, createCorrelationCache } from './lib/correlation-cache';
```

### Basic Query

```typescript
// Initialize database service
const dbService = new DatabaseService({
  redis: { type: 'redis', host: 'localhost', port: 6379 },
  sqlite: { type: 'sqlite', database: './data.db' },
  postgres: { type: 'postgres', connectionString: 'postgresql://...' }
});

await dbService.connect();

// Create query builder
const query = createMultiSystemQuery({ dbService });

// Execute simple query
const results = await query
  .forTask('task-001')
  .execute();

console.log('Merged results:', results.merged);
console.log('Execution time:', results.executionTime, 'ms');
```

### With Caching

```typescript
// Create cache
const cache = createCorrelationCache({
  maxSize: 100,
  ttlMinutes: 5,
});

// Create query builder with cache
const query = createMultiSystemQuery({
  dbService,
  cache,
  enableCache: true,
});

// Execute query (will cache results)
const results = await query
  .forTask('task-001')
  .withCache(true)
  .execute();

console.log('Cache hit:', results.cacheHit);
```

---

## Query Patterns

### Pattern 1: Query Specific Task

Retrieve all data for a specific task:

```typescript
const results = await query
  .forTask('task-001')
  .execute();

// Access results by database
console.log('Redis data:', results.redis);
console.log('SQLite data:', results.sqlite);
console.log('Merged data:', results.merged);
```

### Pattern 2: Query Task with Specific Entities

Retrieve only specific entities for a task:

```typescript
const results = await query
  .forTask('task-001')
  .includingEntities(['agent', 'skill', 'artifact'])
  .execute();

// Results will only include agent, skill, and artifact data
```

### Pattern 3: Query from Specific Databases

Limit query to specific databases:

```typescript
const results = await query
  .forTask('task-001')
  .fromSystems(['redis', 'sqlite'])  // Exclude PostgreSQL
  .execute();
```

### Pattern 4: Wildcard Queries

Query multiple items using wildcard patterns:

```typescript
const results = await query
  .withPattern({
    type: 'task',
    id: '*',
    entity: 'agent'
  })
  .execute();

// Returns all task-agent relationships
```

### Pattern 5: Priority Optimization

Use fastest strategy for quick lookups:

```typescript
const results = await query
  .forTask('task-001')
  .withPriority('fastest')  // Stop on first result
  .execute();

// Typically returns Redis data only (fastest)
```

### Pattern 6: Data Consistency Checks

Use comprehensive strategy to ensure all databases have data:

```typescript
const results = await query
  .forTask('task-001')
  .withPriority('comprehensive')
  .execute();

// Check for inconsistencies
if (results.redis && !results.postgres) {
  console.warn('Data missing in PostgreSQL');
}
```

### Pattern 7: Custom Timeout

Set custom timeout for slow queries:

```typescript
const results = await query
  .forTask('task-001')
  .withTimeout(5000)  // 5 seconds
  .execute();
```

---

## Caching Strategy

### Cache Configuration

```typescript
const cache = createCorrelationCache({
  maxSize: 100,          // Max 100 entries
  ttlMinutes: 5,         // 5 minute TTL
  enableWarming: true,   // Enable cache warming
  warmingPatterns: [     // Patterns to pre-load
    'task:*:agent',
    'skill:*:invocation'
  ],
});
```

### Cache Operations

#### Basic Operations

```typescript
// Set value
cache.set('task:task-001', { data: 'value' });

// Get value
const value = cache.get('task:task-001');

// Check existence
if (cache.has('task:task-001')) {
  console.log('Key exists');
}

// Delete key
cache.delete('task:task-001');
```

#### Pattern Invalidation

Invalidate multiple keys by pattern:

```typescript
// Invalidate all task-001 related data
const count = cache.invalidatePattern('task:task-001:*');
console.log('Invalidated', count, 'entries');
```

#### Cache Metrics

Track cache effectiveness:

```typescript
const metrics = cache.getMetrics();

console.log('Hit ratio:', metrics.hitRatio);
console.log('Total hits:', metrics.hits);
console.log('Total misses:', metrics.misses);
console.log('Evictions:', metrics.evictions);
console.log('Cache size:', metrics.size, '/', metrics.maxSize);
```

#### Cache Warming

Pre-load frequently accessed data:

```typescript
await cache.warm(async (pattern) => {
  // Load data for pattern from database
  const data = await dbService.getByPattern(pattern);
  return new Map(data.map(item => [item.key, item.value]));
});
```

### Cache Best Practices

1. **Set appropriate TTL**: Balance freshness vs hit ratio
   - Short-lived data: 1-2 minutes
   - Medium-lived data: 5-10 minutes
   - Long-lived data: 30-60 minutes

2. **Size the cache correctly**: Monitor eviction rate
   - High evictions = increase `maxSize`
   - Low hit ratio = decrease `ttlMinutes`

3. **Invalidate on writes**: Keep cache consistent
   ```typescript
   // After writing data
   cache.invalidatePattern('task:task-001:*');
   ```

4. **Monitor metrics**: Track cache effectiveness
   ```typescript
   setInterval(() => {
     const metrics = cache.getMetrics();
     if (metrics.hitRatio < 0.7) {
       console.warn('Low cache hit ratio:', metrics.hitRatio);
     }
   }, 60000);
   ```

---

## Performance Tuning

### Performance Targets

- **Simple queries**: <100ms
- **Multi-system queries**: <500ms
- **Complex wildcard queries**: <2000ms

### Optimization Techniques

#### 1. Use Fastest Priority for Read-Heavy Workloads

```typescript
const results = await query
  .forTask('task-001')
  .withPriority('fastest')
  .execute();

// Typically 10-50ms (Redis only)
```

#### 2. Enable Caching for Frequent Queries

```typescript
const results = await query
  .forTask('task-001')
  .withCache(true)
  .execute();

// Cache hits: <10ms
```

#### 3. Limit Database Systems

```typescript
const results = await query
  .forTask('task-001')
  .fromSystems(['redis'])  // Skip slower databases
  .execute();
```

#### 4. Batch Queries

Instead of multiple single queries:

```typescript
// BAD: Multiple queries
for (const taskId of taskIds) {
  await query.forTask(taskId).execute();
}

// GOOD: Single wildcard query
const results = await query
  .withPattern({ type: 'task', id: '*' })
  .execute();
```

### Performance Monitoring

Track query performance:

```typescript
const result = await query.forTask('task-001').execute();

console.log('Execution time:', result.executionTime, 'ms');

if (result.executionTime > 2000) {
  console.warn('Query exceeded 2s threshold');

  // Log details for debugging
  console.log('Systems queried:', Object.keys(result));
  console.log('Errors:', result.errors);
}
```

### Database-Specific Optimizations

#### Redis
- Use `SCAN` instead of `KEYS` for pattern queries
- Keep key sizes small (<100 bytes)
- Use hash tags for sharding

#### SQLite
- Add indexes on correlation key columns
- Use prepared statements
- Enable WAL mode for concurrent reads

#### PostgreSQL
- Index correlation key columns
- Use connection pooling
- Analyze query plans for slow queries

---

## API Reference

### MultiSystemQuery

#### Constructor

```typescript
const query = new MultiSystemQuery({
  dbService: DatabaseService,
  cache?: CorrelationCache,
  enableCache?: boolean,
  defaultTimeout?: number,
  logger?: Logger
});
```

#### Methods

**forTask(taskId: string): this**
Query for specific task.

**forAgent(agentId: string): this**
Query for specific agent.

**forSkill(skillId: string): this**
Query for specific skill.

**forExecution(executionId: string): this**
Query for specific execution.

**withKey(key: CorrelationKey): this**
Query with custom correlation key.

**withPattern(pattern: WildcardPattern): this**
Query with wildcard pattern.

**includingEntities(entities: string[]): this**
Include specific entity types.

**fromSystems(systems: DatabaseSystem[]): this**
Query from specific database systems.

**withPriority(priority: ExecutionPriority): this**
Set execution priority: `fastest`, `balanced`, `comprehensive`.

**withCache(enabled: boolean): this**
Enable or disable caching.

**withTimeout(timeout: number): this**
Set query timeout in milliseconds.

**execute<T>(): Promise<MultiSystemResult<T>>**
Execute the query.

### CorrelationCache

#### Constructor

```typescript
const cache = new CorrelationCache({
  maxSize?: number,
  ttlMinutes?: number,
  enableWarming?: boolean,
  warmingPatterns?: string[],
  logger?: Logger
});
```

#### Methods

**get<T>(key: string): T | undefined**
Get value from cache.

**set<T>(key: string, value: T, ttlMinutes?: number): void**
Set value in cache.

**has(key: string): boolean**
Check if key exists.

**delete(key: string): boolean**
Delete key from cache.

**invalidate(key: string, trigger?: InvalidationTrigger): boolean**
Invalidate cache entry.

**invalidatePattern(pattern: string): number**
Invalidate keys matching pattern.

**clear(): void**
Clear entire cache.

**getMetrics(): CacheMetrics**
Get cache metrics.

**resetMetrics(): void**
Reset cache metrics.

**warm(dataLoader: Function): Promise<void>**
Warm cache with common patterns.

### Correlation Key Utilities

**buildCorrelationKey(key: CorrelationKey): string**
Build correlation key string.

**parseCorrelationKey(keyString: string): CorrelationKey | null**
Parse correlation key string.

**buildWildcardPattern(pattern: WildcardPattern): string**
Generate wildcard pattern string.

**validateCorrelationKey(keyString: string): ValidationError[]**
Validate correlation key with detailed errors.

**isValidCorrelationKey(keyString: string): boolean**
Check if correlation key is valid.

**getEntityTypes(type: CorrelationKeyType): string[]**
Get valid entity types for correlation key type.

**buildBatch(keys: CorrelationKey[]): string[]**
Build multiple correlation keys.

**parseBatch(keyStrings: string[]): CorrelationKey[]**
Parse multiple correlation keys.

**matchesWildcard(keyString: string, pattern: WildcardPattern): boolean**
Match correlation key against wildcard pattern.

**filterByPattern(keyStrings: string[], pattern: WildcardPattern): string[]**
Filter correlation keys by wildcard pattern.

---

## Troubleshooting

### Common Issues

#### Query Timeout

**Symptom**: Query execution time exceeds 2 seconds

**Diagnosis**:
```typescript
const result = await query.forTask('task-001').execute();
console.log('Execution time:', result.executionTime);
console.log('Errors:', result.errors);
```

**Solutions**:
1. Use faster priority: `.withPriority('fastest')`
2. Enable caching: `.withCache(true)`
3. Limit to faster databases: `.fromSystems(['redis'])`
4. Optimize database indexes
5. Increase timeout if necessary: `.withTimeout(5000)`

#### Low Cache Hit Ratio

**Symptom**: Cache hit ratio < 0.7

**Diagnosis**:
```typescript
const metrics = cache.getMetrics();
console.log('Hit ratio:', metrics.hitRatio);
console.log('Evictions:', metrics.evictions);
```

**Solutions**:
1. Increase cache size: `maxSize: 200`
2. Increase TTL: `ttlMinutes: 10`
3. Enable cache warming
4. Review query patterns (too many unique queries?)

#### High Memory Usage

**Symptom**: Cache consuming too much memory

**Solutions**:
1. Decrease cache size: `maxSize: 50`
2. Decrease TTL: `ttlMinutes: 2`
3. Monitor and clear stale entries: `cache.invalidatePattern('old:*')`

#### Data Inconsistency

**Symptom**: Different results from different databases

**Diagnosis**:
```typescript
const result = await query
  .forTask('task-001')
  .withPriority('comprehensive')
  .execute();

console.log('Redis:', result.redis);
console.log('SQLite:', result.sqlite);
console.log('Postgres:', result.postgres);
```

**Solutions**:
1. Invalidate cache: `cache.invalidate('task:task-001')`
2. Check write replication lag
3. Verify database synchronization
4. Use transactions for writes

#### Invalid Correlation Key

**Symptom**: Validation errors when building keys

**Diagnosis**:
```typescript
const errors = validateCorrelationKey('invalid:key:format');
console.log('Validation errors:', errors);
```

**Solutions**:
1. Use builder functions: `buildCorrelationKey()`
2. Check entity types: `getEntityTypes('task')`
3. Validate before use: `isValidCorrelationKey(key)`

### Performance Debugging

Enable detailed logging:

```typescript
import { createLogger } from './lib/logging';

const logger = createLogger('multi-system-query', {
  level: 'debug'
});

const query = createMultiSystemQuery({
  dbService,
  logger
});
```

Track slow queries:

```typescript
const startTime = Date.now();
const result = await query.forTask('task-001').execute();
const duration = Date.now() - startTime;

if (duration > 1000) {
  logger.warn('Slow query detected', {
    duration,
    task: 'task-001',
    systems: Object.keys(result).filter(k => k !== 'merged'),
  });
}
```

---

## Examples

### Complete Example: Task Data Retrieval

```typescript
import { DatabaseService } from './lib/database-service';
import { createMultiSystemQuery } from './lib/multi-system-query';
import { createCorrelationCache } from './lib/correlation-cache';

async function getTaskData(taskId: string) {
  // Initialize services
  const dbService = new DatabaseService({
    redis: { type: 'redis', host: 'localhost', port: 6379 },
    sqlite: { type: 'sqlite', database: './data.db' },
  });

  await dbService.connect();

  const cache = createCorrelationCache({
    maxSize: 100,
    ttlMinutes: 5,
  });

  const query = createMultiSystemQuery({
    dbService,
    cache,
    enableCache: true,
  });

  // Query task data
  const results = await query
    .forTask(taskId)
    .includingEntities(['agent', 'skill', 'artifact'])
    .withCache(true)
    .withTimeout(2000)
    .execute();

  // Log performance
  console.log(`Query completed in ${results.executionTime}ms`);
  console.log(`Cache hit: ${results.cacheHit}`);

  // Return merged results
  return results.merged;
}

// Usage
const taskData = await getTaskData('task-001');
console.log('Task data:', taskData);
```

---

## Version History

**v1.0.0** - Initial release
- Multi-system query engine
- LRU cache with TTL
- Priority-ordered execution
- <2s performance guarantee
- Comprehensive test coverage (90%+)

---

## License

MIT License - See LICENSE file for details

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review [API Reference](#api-reference)
3. See test suite for examples: `tests/multi-system-query.test.ts`
4. File bug report with reproduction steps
