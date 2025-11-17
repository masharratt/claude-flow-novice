# Circuit Breaker Pattern - System-Wide Resilience

## Overview

The Circuit Breaker pattern prevents cascading failures by failing fast when a service is detected as unhealthy. This implementation provides a robust, standalone circuit breaker utility with comprehensive monitoring and graceful degradation capabilities.

## Architecture

### Three-State Machine

```
CLOSED (Normal) ──[failures ≥ threshold]──> OPEN (Failing)
                                              │
                                   [timeout expires]
                                              │
                                              ↓
                                          HALF_OPEN (Testing)
                                              │
                              [success ≥ threshold] │ [any failure]
                                      ↓              ↓
                                   CLOSED          OPEN
```

### State Descriptions

- **CLOSED**: Normal operation, requests flow through. Tracks consecutive failures.
- **OPEN**: Service is failing, requests are rejected immediately. Prevents cascading failures.
- **HALF_OPEN**: Testing recovery, allows limited requests to check if service has recovered.

## Core Components

### 1. CircuitBreaker Class

Location: `src/lib/circuit-breaker.ts`

```typescript
import { CircuitBreaker } from './lib/circuit-breaker';

const breaker = new CircuitBreaker('external-api', {
  failureThreshold: 5,    // Open after 5 consecutive failures
  successThreshold: 2,    // Close after 2 consecutive successes (in HALF_OPEN)
  timeout: 30000          // Wait 30s before attempting HALF_OPEN
});
```

### 2. CircuitBreakerRegistry

Centralized management of all circuit breakers in the system.

```typescript
import { CircuitBreakerRegistry } from './lib/circuit-breaker';

// Get or create circuit breaker
const breaker = CircuitBreakerRegistry.getOrCreate('service-name');

// Check system health
const healthStatus = CircuitBreakerRegistry.getHealthStatus();
// => { 'service-1': true, 'service-2': false }

// Get all metrics
const allMetrics = CircuitBreakerRegistry.getAllMetrics();
```

### 3. CircuitOpenError

Custom error thrown when circuit is OPEN and no fallback is provided.

```typescript
import { CircuitOpenError } from './lib/circuit-breaker';

try {
  await breaker.execute(() => externalApiCall());
} catch (error) {
  if (error instanceof CircuitOpenError) {
    console.log(`Service ${error.serviceName} is unavailable`);
    console.log(`Status: ${error.statusCode}`); // 503
  }
}
```

## Usage Patterns

### Basic Usage

```typescript
import { createCircuitBreaker } from './lib/circuit-breaker';

const breaker = createCircuitBreaker('payment-service');

// Execute with circuit breaker protection
const result = await breaker.execute(async () => {
  return await paymentService.processPayment(order);
});
```

### With Fallback

```typescript
const result = await breaker.execute(
  async () => await externalApi.getData(),
  async () => await cache.getCachedData() // Fallback
);
```

### Helper Function

```typescript
import { executeWithCircuitBreaker } from './lib/circuit-breaker';

const data = await executeWithCircuitBreaker(
  'user-service',
  async () => await userService.getUser(id),
  async () => ({ id, name: 'Guest' }), // Fallback
  { failureThreshold: 3, timeout: 20000 }
);
```

### Database Adapter Integration

```typescript
import { CircuitBreakerRegistry } from './lib/circuit-breaker';

class PostgresAdapter {
  private breaker = CircuitBreakerRegistry.getOrCreate('postgres', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000
  });

  async query(sql: string, params: any[]): Promise<any> {
    return this.breaker.execute(
      async () => {
        const client = await this.pool.connect();
        try {
          return await client.query(sql, params);
        } finally {
          client.release();
        }
      },
      async () => {
        // Fallback: return cached data or throw specific error
        throw new Error('Database unavailable, please try again later');
      }
    );
  }
}
```

## Configuration

### Default Configuration

```typescript
{
  failureThreshold: 5,      // Open circuit after 5 failures
  successThreshold: 2,      // Close circuit after 2 successes
  timeout: 30000,           // Wait 30s before HALF_OPEN
  windowSize: 60000         // Time window for failure counting (60s)
}
```

### Custom Configuration

```typescript
const breaker = new CircuitBreaker('critical-service', {
  failureThreshold: 3,      // More sensitive
  successThreshold: 3,      // Require more successes to close
  timeout: 60000,           // Wait longer before retry
  windowSize: 120000        // Larger failure window
});
```

## Metrics and Monitoring

### Circuit Breaker Metrics

```typescript
const metrics = breaker.getMetrics();

console.log(metrics);
// {
//   state: 'CLOSED',
//   failures: 0,
//   successes: 0,
//   lastFailureTime: Date,
//   lastSuccessTime: Date,
//   openedAt: undefined,
//   totalCalls: 100,
//   totalSuccesses: 95,
//   totalFailures: 5,
//   totalRejected: 0
// }
```

### Health Checks

```typescript
// Single circuit breaker
if (!breaker.isHealthy()) {
  console.warn('Service is unhealthy');
}

// All circuit breakers
const healthStatus = CircuitBreakerRegistry.getHealthStatus();
Object.entries(healthStatus).forEach(([service, healthy]) => {
  if (!healthy) {
    console.warn(`${service} is unhealthy`);
  }
});
```

### Prometheus Integration (Placeholder)

```typescript
// Future implementation - metrics are logged for now
// Production systems should push to Prometheus/Grafana
const metrics = CircuitBreakerRegistry.getAllMetrics();
for (const [service, data] of Object.entries(metrics)) {
  prometheus.gauge('circuit_breaker_state', {
    service,
    state: data.state
  });
  prometheus.counter('circuit_breaker_failures', data.totalFailures || 0, {
    service
  });
}
```

## Integration Points

### 1. Database Adapters

**PostgreSQL Adapter** (`src/lib/database-service/postgres-adapter.ts`)

```typescript
import { CircuitBreakerRegistry } from '../circuit-breaker';

export class PostgresAdapter {
  private breaker = CircuitBreakerRegistry.getOrCreate('postgres-db');

  async connect(): Promise<void> {
    return this.breaker.execute(
      async () => {
        // Connection logic
      },
      async () => {
        throw new Error('PostgreSQL unavailable');
      }
    );
  }
}
```

**SQLite Adapter** (`src/lib/database-service/sqlite-adapter.ts`)

```typescript
private breaker = CircuitBreakerRegistry.getOrCreate('sqlite-db', {
  failureThreshold: 3,  // SQLite should fail fast
  timeout: 10000        // Short timeout for file-based DB
});
```

**Redis Adapter** (`src/lib/database-service/redis-adapter.ts`)

```typescript
private breaker = CircuitBreakerRegistry.getOrCreate('redis-cache', {
  failureThreshold: 5,
  timeout: 5000  // Quick recovery for cache
});
```

### 2. File System Operations

```typescript
import { createCircuitBreaker } from './lib/circuit-breaker';

const fsBreaker = createCircuitBreaker('file-system', {
  failureThreshold: 3,
  timeout: 5000
});

async function readFile(path: string): Promise<string> {
  return fsBreaker.execute(
    async () => await fs.promises.readFile(path, 'utf-8'),
    async () => '' // Empty fallback
  );
}
```

### 3. External API Calls

```typescript
const apiBreaker = createCircuitBreaker('external-api', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000
});

async function fetchData(endpoint: string): Promise<any> {
  return apiBreaker.execute(
    async () => {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    async () => {
      // Return cached data
      return cache.get(endpoint);
    }
  );
}
```

### 4. Message Queues

```typescript
const queueBreaker = createCircuitBreaker('message-queue');

async function publishMessage(message: any): Promise<void> {
  return queueBreaker.execute(
    async () => await queue.publish(message),
    async () => {
      // Fallback: store in local queue
      await localQueue.enqueue(message);
    }
  );
}
```

## Error Handling

### Circuit Open Scenarios

```typescript
import { CircuitOpenError } from './lib/circuit-breaker';

try {
  await breaker.execute(() => externalCall());
} catch (error) {
  if (error instanceof CircuitOpenError) {
    // Circuit is OPEN - service is down
    logger.warn(`Circuit open for ${error.serviceName}`);
    return gracefulDegradation();
  }
  // Other errors
  throw error;
}
```

### Graceful Degradation

```typescript
async function getUserData(userId: string) {
  try {
    return await breaker.execute(
      () => userService.getUser(userId),
      () => cache.getUser(userId) // Fallback to cache
    );
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      // Return minimal user data
      return { id: userId, name: 'Guest', limited: true };
    }
    throw error;
  }
}
```

## Manual Control

### Manual State Transitions

```typescript
// Force circuit OPEN (for maintenance)
breaker.open();

// Force circuit CLOSED (after manual fix)
breaker.close();

// Check current state
const state = breaker.getState();
// => 'CLOSED' | 'OPEN' | 'HALF_OPEN'
```

### Use Cases for Manual Control

1. **Planned Maintenance**: Open circuit before taking service offline
2. **Emergency Recovery**: Close circuit after manual intervention
3. **Testing**: Control circuit state for integration tests

## Testing

### Test Coverage

The circuit breaker has >90% test coverage with 36 comprehensive test cases:

- State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
- Threshold management (custom failure/success thresholds)
- Timeout handling (automatic HALF_OPEN transition)
- Fallback execution
- Metrics tracking
- Manual control
- Registry management
- Error handling

### Running Tests

```bash
npm test -- tests/lib/circuit-breaker.test.ts
```

### Example Test

```typescript
it('should transition to OPEN after threshold failures', async () => {
  const breaker = new CircuitBreaker('test-service', {
    failureThreshold: 3
  });

  // Execute 3 failures
  for (let i = 0; i < 3; i++) {
    await expect(breaker.execute(() => Promise.reject())).rejects.toThrow();
  }

  expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
});
```

## Best Practices

### 1. Service-Specific Configuration

Different services have different failure characteristics:

```typescript
// Critical service - fail fast
const criticalBreaker = createCircuitBreaker('payment-api', {
  failureThreshold: 3,
  timeout: 60000
});

// Non-critical service - more tolerant
const analyticsBreaker = createCircuitBreaker('analytics-api', {
  failureThreshold: 10,
  timeout: 30000
});
```

### 2. Always Provide Fallbacks

```typescript
// ❌ Bad: No fallback
await breaker.execute(() => externalCall());

// ✅ Good: Graceful degradation
await breaker.execute(
  () => externalCall(),
  () => cachedData() // Fallback
);
```

### 3. Monitor Circuit Breaker State

```typescript
// Periodic health check
setInterval(() => {
  const health = CircuitBreakerRegistry.getHealthStatus();
  const unhealthy = Object.entries(health)
    .filter(([_, healthy]) => !healthy)
    .map(([service]) => service);

  if (unhealthy.length > 0) {
    logger.error('Unhealthy services:', unhealthy);
    alerting.send(`Services down: ${unhealthy.join(', ')}`);
  }
}, 60000); // Every minute
```

### 4. Use Registry for Global Visibility

```typescript
// Dashboard endpoint
app.get('/health/circuit-breakers', (req, res) => {
  const metrics = CircuitBreakerRegistry.getAllMetrics();
  res.json({
    timestamp: new Date(),
    circuitBreakers: metrics,
    summary: {
      total: Object.keys(metrics).length,
      healthy: Object.values(CircuitBreakerRegistry.getHealthStatus())
        .filter(h => h).length,
      unhealthy: Object.values(CircuitBreakerRegistry.getHealthStatus())
        .filter(h => !h).length
    }
  });
});
```

## Migration from Error Aggregator

The circuit breaker has been extracted from `error-aggregator.ts` into a standalone utility. The error aggregator now uses `CircuitBreakerRegistry` internally.

### Before

```typescript
const aggregator = new ErrorAggregator(correlationId, {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000
});

aggregator.addError(error, 'postgres', ErrorSeverity.ERROR);
const isOpen = aggregator.isCircuitOpen('postgres');
```

### After

```typescript
// Error aggregator still works the same
const aggregator = new ErrorAggregator(correlationId, {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000
});

aggregator.addError(error, 'postgres', ErrorSeverity.ERROR);
const isOpen = aggregator.isCircuitOpen('postgres');

// But you can also use circuit breaker directly
const breaker = CircuitBreakerRegistry.get('postgres');
if (breaker) {
  console.log(breaker.getMetrics());
}
```

## Future Enhancements

### 1. Prometheus Metrics

```typescript
// Planned: Push metrics to Prometheus
prometheus.gauge('circuit_breaker_state', stateValue, { service });
prometheus.counter('circuit_breaker_failures_total', failures, { service });
prometheus.histogram('circuit_breaker_latency', latency, { service });
```

### 2. Dynamic Thresholds

```typescript
// Planned: Adaptive thresholds based on traffic patterns
const breaker = new CircuitBreaker('service', {
  adaptiveThresholds: true,
  baselineWindow: 300000 // 5 minutes
});
```

### 3. Circuit Breaker Events

```typescript
// Planned: Event emitter for state changes
breaker.on('open', (metrics) => {
  alerting.send(`Circuit opened for ${breaker.getServiceName()}`);
});

breaker.on('halfOpen', (metrics) => {
  logger.info(`Testing recovery for ${breaker.getServiceName()}`);
});

breaker.on('closed', (metrics) => {
  logger.info(`Circuit recovered for ${breaker.getServiceName()}`);
});
```

## Troubleshooting

### Circuit Stuck in OPEN State

**Symptom**: Circuit breaker stays OPEN even though service has recovered.

**Solution**:
```typescript
// Check if timeout is too long
const metrics = breaker.getMetrics();
console.log('Opened at:', metrics.openedAt);
console.log('Time elapsed:', Date.now() - metrics.openedAt.getTime());

// Manual intervention
breaker.close(); // Force close if service is confirmed healthy
```

### Too Many False Positives

**Symptom**: Circuit opens too frequently for transient errors.

**Solution**:
```typescript
// Increase failure threshold
const breaker = new CircuitBreaker('service', {
  failureThreshold: 10, // More tolerant
  windowSize: 120000    // Larger window
});
```

### Circuit Never Opens

**Symptom**: Service is failing but circuit stays CLOSED.

**Solution**:
```typescript
// Check if errors are being caught
try {
  await breaker.execute(() => failingOperation());
} catch (error) {
  // Errors must be thrown for circuit to track failures
  console.error('Operation failed:', error);
  throw error; // Re-throw to trigger circuit breaker
}
```

## References

- **Martin Fowler's Circuit Breaker**: https://martinfowler.com/bliki/CircuitBreaker.html
- **Implementation**: `src/lib/circuit-breaker.ts`
- **Tests**: `tests/lib/circuit-breaker.test.ts`
- **Integration**: All database adapters in `src/lib/database-service/`

## Summary

The Circuit Breaker pattern provides:

- ✅ **Fail-fast behavior** - Prevents cascading failures
- ✅ **Automatic recovery** - Tests service health automatically
- ✅ **Graceful degradation** - Fallback support for resilience
- ✅ **System-wide visibility** - Centralized registry and health checks
- ✅ **Comprehensive metrics** - Track failures, successes, state transitions
- ✅ **High test coverage** - 36 tests, >90% coverage
- ✅ **Easy integration** - Simple API for all external dependencies

Use circuit breakers for all external dependencies: databases, APIs, file systems, message queues, and any other failure-prone operations.
