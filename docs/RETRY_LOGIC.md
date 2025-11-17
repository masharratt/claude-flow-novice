# Retry Logic with Exponential Backoff

## Overview

This document describes the comprehensive retry logic implementation with exponential backoff for handling transient failures across database operations, Redis queues, file system operations, and HTTP API calls.

## Architecture

### Components

1. **StandardError** (`src/lib/errors.ts`)
   - Enhanced with `isRetryable` flag for automatic retry classification
   - Auto-detects retryable status from error codes
   - Supports explicit retryable flag override

2. **Retry Utilities** (`src/lib/retry.ts`)
   - Core retry logic with exponential backoff
   - Jitter support to prevent thundering herd
   - Customizable retry conditions
   - Statistics collection

3. **Retry Manager** (`src/lib/retry-manager.ts`)
   - Enhanced retry orchestration with circuit breaker
   - Correlation ID tracking for distributed tracing
   - Predefined retry policies
   - Comprehensive logging and monitoring

## Features

### Exponential Backoff

Delays increase exponentially with each retry attempt:

```
delay = baseDelay * (2 ^ attempt)
```

With jitter (±10% variation) to prevent synchronized retries:

```
jitter = delay * 0.1 * (random(-1, 1))
finalDelay = delay + jitter
```

**Example delays (baseDelay = 1000ms):**
- Attempt 1: ~1000ms (900-1100ms with jitter)
- Attempt 2: ~2000ms (1800-2200ms with jitter)
- Attempt 3: ~4000ms (3600-4400ms with jitter)
- Attempt 4: ~8000ms (7200-8800ms with jitter)

Delays are capped at `maxDelayMs` (default: 30000ms).

### Retryable Error Classification

**Automatically Retryable:**
- `DB_TIMEOUT` - Database query timeout
- `DB_CONNECTION_FAILED` - Database connection failure
- `OPERATION_TIMEOUT` - Generic operation timeout
- `NETWORK_ERROR` - Network communication failure
- `LOCK_TIMEOUT` - Lock acquisition timeout

**Non-Retryable:**
- `VALIDATION_FAILED` - Input validation error
- `INVALID_INPUT` - Invalid request parameters
- `FILE_NOT_FOUND` - File does not exist
- `PARSE_ERROR` - Data parsing error
- `CONFIGURATION_ERROR` - Configuration issue
- `DB_DUPLICATE_KEY` - Unique constraint violation
- `DB_CONSTRAINT_VIOLATION` - Foreign key violation

### Circuit Breaker

Prevents cascading failures by stopping retries when a service is consistently failing.

**States:**
- **CLOSED**: Normal operation, requests allowed
- **OPEN**: Service failing, requests rejected immediately
- **HALF_OPEN**: Testing recovery, limited requests allowed

**Configuration:**
```typescript
{
  failureThreshold: 5,      // Open circuit after 5 consecutive failures
  successThreshold: 2,      // Close circuit after 2 consecutive successes
  openTimeoutMs: 60000,     // Wait 60s before attempting recovery
}
```

**State Transitions:**
```
CLOSED --[failures >= threshold]--> OPEN
OPEN --[timeout elapsed]--> HALF_OPEN
HALF_OPEN --[success >= threshold]--> CLOSED
HALF_OPEN --[any failure]--> OPEN
```

## Retry Policies

### Predefined Policies

#### QUICK
Fast retries for low-latency operations.
```typescript
{
  name: 'QUICK',
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  exponential: true,
  jitter: true
}
```

#### STANDARD (Default)
Balanced retry strategy for typical operations.
```typescript
{
  name: 'STANDARD',
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponential: true,
  jitter: true
}
```

#### AGGRESSIVE
Persistent retries for critical operations.
```typescript
{
  name: 'AGGRESSIVE',
  maxAttempts: 5,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  exponential: true,
  jitter: true
}
```

#### DATABASE
Database-specific retry with only retryable errors.
```typescript
{
  name: 'DATABASE',
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponential: true,
  jitter: true,
  shouldRetry: (error) => error.isRetryable
}
```

#### NETWORK
Network operation retry with longer timeouts.
```typescript
{
  name: 'NETWORK',
  maxAttempts: 4,
  baseDelayMs: 2000,
  maxDelayMs: 45000,
  exponential: true,
  jitter: true
}
```

#### FILE_SYSTEM
File operation retry with linear backoff.
```typescript
{
  name: 'FILE_SYSTEM',
  maxAttempts: 2,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  exponential: false,
  jitter: false
}
```

## Usage Examples

### Basic Retry

```typescript
import { withRetry } from './lib/retry';

const result = await withRetry(
  async () => await fetchData(),
  {
    maxAttempts: 3,
    baseDelayMs: 1000,
    exponential: true
  }
);
```

### Database Operations

```typescript
import { withDatabaseRetry } from './lib/retry-manager';

const user = await withDatabaseRetry(
  async () => await db.get('users:123'),
  'correlation-id-456'
);
```

### Retry Manager with Circuit Breaker

```typescript
import { RetryManager, RetryPolicies } from './lib/retry-manager';

const manager = new RetryManager({
  correlationId: 'req-789',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    successThreshold: 2,
    openTimeoutMs: 60000
  }
});

const data = await manager.executeWithRetry(
  async () => await apiCall(),
  RetryPolicies.NETWORK
);
```

### Retry with Statistics

```typescript
import { RetryManager } from './lib/retry-manager';

const manager = new RetryManager();

const { result, stats, attempts } = await manager.executeWithRetryStats(
  async () => await complexOperation(),
  RetryPolicies.STANDARD
);

console.log(`Succeeded after ${stats.totalAttempts} attempts in ${stats.totalTimeMs}ms`);
console.log(`Retry attempts: ${attempts.length}`);
```

### Custom Retry Logic

```typescript
import { withRetry } from './lib/retry';

const result = await withRetry(
  async () => await operation(),
  {
    maxAttempts: 5,
    baseDelayMs: 2000,
    shouldRetry: (error) => {
      // Custom retry condition
      return error.message.includes('temporary');
    },
    onRetry: (attempt, error, delayMs) => {
      console.log(`Retry attempt ${attempt}, waiting ${delayMs}ms`);
    }
  }
);
```

### Convenience Functions

```typescript
import {
  withStandardRetry,
  withDatabaseRetry,
  withNetworkRetry,
  withFileSystemRetry
} from './lib/retry-manager';

// Standard retry
await withStandardRetry(async () => operation());

// Database retry
await withDatabaseRetry(async () => db.query());

// Network retry
await withNetworkRetry(async () => httpRequest());

// File system retry
await withFileSystemRetry(async () => fs.writeFile());
```

## Integration Points

### Database Services

All database adapters (SQLite, PostgreSQL, Redis) integrate retry logic:

```typescript
// src/lib/database-service/sqlite-adapter.ts
import { withDatabaseRetry } from '../retry-manager';

async connect(): Promise<void> {
  await withDatabaseRetry(async () => {
    // Connection logic with automatic retry
  });
}

async get<T>(key: string): Promise<T | null> {
  return withDatabaseRetry(async () => {
    // Query logic with automatic retry
  });
}
```

### Backup Manager

File operations in backup manager use retry logic:

```typescript
// src/lib/backup-manager.ts
import { withFileSystemRetry } from './retry-manager';

async createBackup(filePath: string): Promise<Backup> {
  await withFileSystemRetry(async () => {
    await fsCopyFile(source, destination);
  });
}

async restore(backupId: string): Promise<void> {
  await withFileSystemRetry(async () => {
    await fsCopyFile(backup, original);
  });
}
```

### Redis Queue Manager

Redis operations already use retry logic:

```typescript
// src/lib/redis-queue-manager.ts
import { withRetry } from './retry';

await withRetry(
  async () => await redis.lpush(queue, message),
  { maxAttempts: 3, baseDelayMs: 1000 }
);
```

## Correlation ID Tracking

Correlation IDs enable distributed tracing across retry attempts:

```typescript
const manager = createRetryManager('correlation-id-123');

await manager.executeWithRetry(async () => {
  // All retry attempts logged with correlation ID
  // Enables tracing across services and operations
});
```

**Log output:**
```json
{
  "level": "debug",
  "correlationId": "correlation-id-123",
  "attempt": 1,
  "maxAttempts": 3,
  "message": "Retry attempt"
}
```

## Circuit Breaker Integration

Circuit breaker prevents wasted retry attempts when service is down:

**Without Circuit Breaker:**
```
Request 1: Retry 3 times (12s wasted)
Request 2: Retry 3 times (12s wasted)
Request 3: Retry 3 times (12s wasted)
Total: 36s wasted on failing service
```

**With Circuit Breaker:**
```
Request 1: Retry 3 times (12s)
Request 2: Retry 3 times (12s)
Request 3: Retry 3 times (12s) → Circuit OPENS
Request 4: Fail immediately (0s)
Request 5: Fail immediately (0s)
Total: 36s vs 0s for subsequent requests
```

## Error Handling Best Practices

### 1. Use Appropriate Retry Policies

```typescript
// Database queries: Use DATABASE policy
await withDatabaseRetry(async () => db.query());

// Network calls: Use NETWORK policy
await withNetworkRetry(async () => httpGet());

// File operations: Use FILE_SYSTEM policy
await withFileSystemRetry(async () => fs.writeFile());
```

### 2. Set Retryable Flags Correctly

```typescript
// Retryable: Transient network error
throw new StandardError(
  ErrorCode.NETWORK_ERROR,
  'Connection timeout',
  {},
  originalError,
  true // retryable
);

// Non-retryable: Validation error
throw new StandardError(
  ErrorCode.VALIDATION_FAILED,
  'Invalid email format',
  { field: 'email' },
  undefined,
  false // not retryable
);
```

### 3. Add Context to Errors

```typescript
throw new StandardError(
  ErrorCode.DB_TIMEOUT,
  'Database query timeout',
  {
    query: 'SELECT * FROM users',
    timeout: 5000,
    correlationId: 'req-123'
  }
);
```

### 4. Monitor Circuit Breaker State

```typescript
const manager = new RetryManager({
  circuitBreaker: { enabled: true }
});

// Check circuit state before critical operations
if (manager.getCircuitState() === CircuitState.OPEN) {
  // Circuit is open, service is down
  // Consider using fallback/cache
}

// Get statistics for monitoring
const stats = manager.getCircuitStats();
console.log(`Circuit: ${stats.state}, Failures: ${stats.failureCount}`);
```

## Testing

Comprehensive test suite with >90% coverage:

```bash
npm test tests/lib/retry-logic.test.ts
```

**Test Categories:**
- Core retry functionality (11 tests)
- Error classification (4 tests)
- RetryManager features (9 tests)
- Retry policies (6 tests)
- Convenience functions (4 tests)
- Edge cases and error handling (7 tests)

**Total: 41 test cases**

## Performance Considerations

### Retry Overhead

**Time spent in retries (exponential backoff, 3 attempts):**
- Fast path (success on attempt 1): 0ms overhead
- 1 retry (success on attempt 2): ~1000ms overhead
- 2 retries (success on attempt 3): ~3000ms overhead
- 3 retries (all fail): ~7000ms overhead

### Circuit Breaker Benefits

**Without circuit breaker:**
- 100 requests × 3 retries × 1s delay = 300s total wasted

**With circuit breaker (opens after 5 failures):**
- 5 requests × 3 retries × 1s delay = 15s wasted
- 95 requests × 0s = 0s (immediate rejection)
- **Total: 15s (95% reduction)**

### Memory Usage

**Retry Manager:**
- Correlation ID: ~50 bytes
- Retry attempt metadata: ~500 bytes per attempt
- Circuit breaker state: ~200 bytes
- **Total per manager: ~1KB**

## Configuration Reference

### RetryOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | number | 3 | Maximum retry attempts |
| `baseDelayMs` | number | 1000 | Base delay in milliseconds |
| `maxDelayMs` | number | 30000 | Maximum delay cap in milliseconds |
| `exponential` | boolean | true | Use exponential backoff |
| `jitter` | boolean | true | Add random jitter to delays |
| `shouldRetry` | function | auto | Custom retry condition function |
| `onRetry` | function | none | Callback invoked before each retry |

### CircuitBreakerConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | false | Enable circuit breaker |
| `failureThreshold` | number | 5 | Failures before opening circuit |
| `successThreshold` | number | 2 | Successes to close circuit |
| `openTimeoutMs` | number | 60000 | Time before testing recovery |

### RetryManagerConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `correlationId` | string | undefined | Correlation ID for tracing |
| `circuitBreaker` | object | disabled | Circuit breaker configuration |
| `defaultPolicy` | object | STANDARD | Default retry policy |
| `enableLogging` | boolean | true | Enable detailed logging |

## Troubleshooting

### Issue: Retries Not Working

**Check:**
1. Error is retryable: `error.isRetryable === true`
2. MaxAttempts > 1
3. Circuit breaker not open

**Debug:**
```typescript
await withRetry(fn, {
  maxAttempts: 3,
  onRetry: (attempt, error, delay) => {
    console.log(`Retry ${attempt}: ${error.message}, wait ${delay}ms`);
  }
});
```

### Issue: Too Many Retries

**Solution:** Use appropriate policy or reduce maxAttempts

```typescript
// Before: Too aggressive
await withRetry(fn, RetryPolicies.AGGRESSIVE); // 5 attempts

// After: More conservative
await withRetry(fn, RetryPolicies.STANDARD); // 3 attempts
```

### Issue: Circuit Breaker Always Open

**Check:**
1. Failure threshold too low
2. Service consistently failing
3. Need manual reset: `manager.resetCircuit()`

**Adjust:**
```typescript
new RetryManager({
  circuitBreaker: {
    enabled: true,
    failureThreshold: 10, // Increase threshold
    openTimeoutMs: 30000  // Reduce timeout
  }
});
```

## Monitoring and Observability

### Log Levels

**DEBUG:**
- Retry attempt details
- Circuit state transitions
- Delay calculations

**INFO:**
- Operation success after retries
- Circuit breaker reset

**WARN:**
- Retry attempt warnings
- Circuit reopened after failed recovery

**ERROR:**
- Operation failed after all retries
- Circuit opened due to failures

### Metrics to Track

1. **Retry Rate:** `(total_retries / total_requests) * 100`
2. **Circuit Open Rate:** `(time_circuit_open / total_time) * 100`
3. **Average Retry Attempts:** `total_retries / requests_requiring_retry`
4. **Retry Success Rate:** `(successful_retries / total_retries) * 100`

### Alerting Thresholds

- Retry rate > 20% → Investigate service health
- Circuit open > 5 minutes → Service outage
- Retry success rate < 50% → Increase max attempts or fix root cause

## Migration Guide

### From Direct Calls to Retry-Wrapped

**Before:**
```typescript
const result = await databaseQuery();
```

**After:**
```typescript
import { withDatabaseRetry } from './lib/retry-manager';

const result = await withDatabaseRetry(
  async () => await databaseQuery()
);
```

### From Custom Retry to Retry Manager

**Before:**
```typescript
let attempts = 0;
while (attempts < 3) {
  try {
    return await operation();
  } catch (error) {
    attempts++;
    if (attempts >= 3) throw error;
    await sleep(1000 * attempts);
  }
}
```

**After:**
```typescript
import { withStandardRetry } from './lib/retry-manager';

return await withStandardRetry(async () => await operation());
```

## References

- Exponential Backoff Algorithm: https://en.wikipedia.org/wiki/Exponential_backoff
- Circuit Breaker Pattern: https://martinfowler.com/bliki/CircuitBreaker.html
- Jitter in Retry Logic: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/

## Changelog

### 2025-11-17 - Initial Implementation
- Enhanced StandardError with `isRetryable` flag
- Created RetryManager with circuit breaker support
- Added predefined retry policies (QUICK, STANDARD, AGGRESSIVE, DATABASE, NETWORK, FILE_SYSTEM)
- Integrated retry logic into database adapters (SQLite, PostgreSQL, Redis)
- Integrated retry logic into backup manager file operations
- Created comprehensive test suite (41 tests, >90% coverage)
- Added correlation ID tracking for distributed tracing
- Implemented exponential backoff with jitter
- Added circuit breaker with CLOSED/OPEN/HALF_OPEN states
