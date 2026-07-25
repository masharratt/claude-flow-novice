# Context Lookup Quick Start Guide

## Overview

The `ContextLookup` module provides type-safe context retrieval and validation for CFN Loop orchestration. It handles task context lookups, caching, and validation with comprehensive error handling.

## Installation & Setup

### Import the Module
```typescript
import { ContextLookup, createContextLookup, type LookupResult } from './src/helpers/context-lookup';
import { RedisCoordinator } from './src/redis/redis-coordinator';
import { Logger } from './src/utils/logger';
```

### Create an Instance
```typescript
// Option 1: Direct instantiation
const lookup = new ContextLookup(redis, logger, true); // true = enable caching

// Option 2: Factory function (recommended)
const lookup = createContextLookup(redis, logger, true);
```

## Common Use Cases

### 1. Retrieve Context by Task ID
```typescript
const result = await lookup.lookupContext('task-123');

if (result.found) {
  console.log('Context iteration:', result.context.iteration);
  console.log('From cache:', result.cached);
  console.log('Retrieved from:', result.source); // 'redis' | 'cache'
} else {
  console.log('Context not found');
}
```

### 2. Retrieve Iteration-Specific Context
```typescript
// Get context for iteration 2
const result = await lookup.lookupContext('task-123', 2);

if (result.found) {
  const context = result.context;
  console.log(`Iteration ${context.iteration}: ${context.phase}`);
}
```

### 3. Get Latest Context
```typescript
const context = await lookup.getLatestContext('task-123');

if (context) {
  console.log('Latest iteration:', context.iteration);
} else {
  console.log('No context found');
}
```

### 4. Get Phase-Specific Context
```typescript
const context = await lookup.getContextByPhase('task-123', 'loop3');

if (context) {
  console.log('Loop 3 phase context:', context);
}
```

### 5. Retrieve Multiple Contexts in Batch
```typescript
const taskIds = ['task-1', 'task-2', 'task-3'];
const result = await lookup.lookupMultipleContexts(taskIds);

console.log(`Found: ${result.found}/${result.total}`);
console.log('Missing:', result.missing);

// Access individual contexts
result.contexts.forEach((context, taskId) => {
  console.log(`Task ${taskId}: iteration ${context.iteration}`);
});
```

### 6. Validate Context Structure
```typescript
const isValid = lookup.validateContextStructure(someData);

if (!isValid) {
  logger.error('Context structure is invalid');
  // Reject the data
} else {
  // Safe to use context
}
```

### 7. Check Context Completeness
```typescript
const rules = {
  requiredFields: ['taskId', 'iteration', 'phase'],
  optionalFields: ['successCriteria', 'agentIds']
};

const isComplete = lookup.isContextComplete(context, rules);

if (!isComplete) {
  logger.warn('Context missing required fields');
}
```

### 8. Manage Cache
```typescript
// Get cache statistics
const stats = lookup.getCacheStats();
console.log(`Cache size: ${stats.size}/${stats.maxSize}`);
console.log(`TTL: ${stats.ttlMs}ms`);

// Clear specific cache entry
lookup.clearCache('task-123', 2); // Clear iteration 2

// Clear all cache
lookup.clearCache();
```

## Type Safety Features

### Branded TaskId Type
```typescript
import { taskId } from './src/helpers/context-lookup';

// Create properly typed task IDs
const myTaskId = taskId('task-123');
// Type: TaskId (not just string)
```

### Result Types
```typescript
// Single lookup result
interface LookupResult<T = BroadcastContext> {
  context: T;
  found: boolean;
  cached: boolean;
  retrievedAt: string;
  source: 'redis' | 'cache' | 'computed';
}

// Batch lookup result
interface BatchLookupResult {
  taskId: TaskId;
  contexts: Map<string, BroadcastContext>;
  total: number;
  found: number;
  missing: string[];
  retrievedAt: string;
}
```

## Error Handling

### Handle Redis Connection Failures
```typescript
try {
  const result = await lookup.lookupContext('task-123');
  // Use result
} catch (error) {
  if (error instanceof Error) {
    logger.error('Failed to lookup context:', error.message);
    // Fallback logic
  }
}
```

### Logging Integration
```typescript
// All operations log automatically:
// - lookup.lookupContext() → info/warn/debug logs
// - lookup.validateContextStructure() → warn logs for invalid data
// - Cache operations → debug logs for hits/misses

// Monitor logs for:
// - "cache hit" → successful cache reuse
// - "not found" → missing context in Redis
// - "Invalid context structure" → malformed data
```

## Performance Tips

### 1. Enable Caching for High-Frequency Access
```typescript
// Enable caching (default)
const lookup = createContextLookup(redis, logger, true);

// Subsequent calls to same task benefit from O(1) cache lookup
await lookup.lookupContext('task-123'); // Redis + cache store
await lookup.lookupContext('task-123'); // Cache hit (fast)
```

### 2. Batch Multiple Lookups
```typescript
// More efficient than individual lookups
const result = await lookup.lookupMultipleContexts(taskIds);
// Handles partial failures gracefully
```

### 3. Clear Stale Cache
```typescript
// Clear cache before expecting fresh data
lookup.clearCache('task-123');
const result = await lookup.lookupContext('task-123'); // Fresh from Redis
```

### 4. Monitor Cache Size
```typescript
const stats = lookup.getCacheStats();
if (stats.size > stats.maxSize * 0.8) {
  logger.warn('Cache near capacity');
  lookup.clearCache(); // Evict all
}
```

## Testing

### Mock Setup for Tests
```typescript
import { ContextLookup } from './src/helpers/context-lookup';

// Mock Redis
class MockRedis {
  private store = new Map<string, string>();

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.store.set(key, value);
  }
}

// Mock Logger
class MockLogger {
  debug() {}
  info() {}
  warn() {}
  error() {}
}

// Create instance for testing
const lookup = new ContextLookup(new MockRedis() as any, new MockLogger() as any);
```

## Common Patterns

### Pattern 1: Safe Context Retrieval
```typescript
async function getSafeContext(taskId: string): Promise<BroadcastContext | null> {
  try {
    const result = await lookup.lookupContext(taskId);

    if (!result.found) {
      logger.warn(`Context not found: ${taskId}`);
      return null;
    }

    if (!lookup.validateContextStructure(result.context)) {
      logger.error(`Invalid context: ${taskId}`);
      return null;
    }

    return result.context;
  } catch (error) {
    logger.error(`Context retrieval failed: ${taskId}`, error);
    return null;
  }
}
```

### Pattern 2: Context with Iteration Management
```typescript
async function getContextForIteration(
  taskId: string,
  targetIteration: number
): Promise<BroadcastContext | null> {
  const result = await lookup.lookupContext(taskId, targetIteration);

  if (!result.found) {
    // Try latest context as fallback
    return await lookup.getLatestContext(taskId) ?? null;
  }

  return result.context;
}
```

### Pattern 3: Parallel Context Loading
```typescript
async function loadContextsInParallel(
  taskIds: string[]
): Promise<BroadcastContext[]> {
  const results = await Promise.allSettled(
    taskIds.map(id => lookup.lookupContext(id))
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value.found)
    .map(r => (r as PromiseFulfilledResult<LookupResult>).value.context);
}
```

## API Reference

### Public Methods

| Method | Return Type | Description |
|--------|-------------|-------------|
| `lookupContext(taskId, iteration?)` | `Promise<LookupResult>` | Get context by task ID and optional iteration |
| `lookupMultipleContexts(taskIds)` | `Promise<BatchLookupResult>` | Get multiple contexts in batch |
| `getLatestContext(taskId)` | `Promise<BroadcastContext\|undefined>` | Get most recent context |
| `getContextByPhase(taskId, phase)` | `Promise<BroadcastContext\|undefined>` | Get context for specific phase |
| `validateContextStructure(context)` | `boolean` | Validate context structure |
| `isContextComplete(context, rules?)` | `boolean` | Check context completeness |
| `clearCache(taskId?, iteration?)` | `void` | Clear cache entries |
| `getCacheStats()` | `{ size, maxSize, ttlMs }` | Get cache statistics |

## Troubleshooting

### Context Not Found
```typescript
const result = await lookup.lookupContext('task-123');
if (!result.found) {
  // Check if task ID is correct
  // Verify Redis has the context stored
  // Check TTL hasn't expired
}
```

### Invalid Context Structure
```typescript
if (!lookup.validateContextStructure(data)) {
  // Ensure all required fields are present
  // Check field types match BroadcastContext
  // Validate timestamp is ISO string
}
```

### Cache Not Working
```typescript
// Verify caching is enabled
const lookup = createContextLookup(redis, logger, true);

// Check cache statistics
const stats = lookup.getCacheStats();
console.log('Cache size:', stats.size);

// Monitor logs for cache hits
// "Context cache hit for task-123:iteration:1"
```

## Related Documentation

- **Context Injector:** `./context-injector.ts` - Build broadcast contexts
- **Gate Checker:** `./gate-check.ts` - Validate test pass rates
- **Orchestrator:** `./orchestrator/orchestrator.ts` - Main orchestration engine
- **Migration Guide:** `./CONTEXT_LOOKUP_MIGRATION.md` - Full implementation details

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Nov 20, 2025 | Initial TypeScript implementation |

## Support

For issues or questions:
1. Check the test suite in `tests/context-lookup.test.ts` for examples
2. Review error messages in logs (debug/info/warn/error levels)
3. Verify context structure matches `BroadcastContext` interface
4. Check Redis connectivity and data availability
