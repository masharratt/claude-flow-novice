# Resilience Guide - CFN Loop Enterprise

## Overview

This guide documents the resilience patterns implemented for CFN Loop enterprise orchestration, including retry logic, circuit breakers, timeouts, and dead letter queues.

## Architecture

### Resilience Layers

```
┌─────────────────────────────────────────┐
│   Application Layer                     │
│   (Agent Spawning, Job Execution)       │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│   Resilience Layer                      │
│   - Retry with Exponential Backoff      │
│   - Circuit Breakers                    │
│   - Timeout Enforcement                 │
│   - Dead Letter Queue                   │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│   External Dependencies                 │
│   - Redis                               │
│   - PostgreSQL                          │
│   - AI Provider APIs                    │
│   - Docker Daemon                       │
└─────────────────────────────────────────┘
```

## Retry Logic with Exponential Backoff

### Configuration

```typescript
import { withRetry, RetryConfig } from '../utils/resilience';

const config: RetryConfig = {
  maxAttempts: 5,           // Maximum retry attempts
  baseDelayMs: 1000,        // Initial delay (1 second)
  maxDelayMs: 16000,        // Maximum delay (16 seconds)
  backoffMultiplier: 2,     // Exponential multiplier
  retryableErrors: [        // Only retry these error types
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND'
  ]
};
```

### Usage

```typescript
// Wrap any async operation
const result = await withRetry(
  async () => {
    return await spawnAgent(agentType, context);
  },
  config
);
```

### Backoff Schedule

| Attempt | Delay     | Total Elapsed |
|---------|-----------|---------------|
| 1       | 0ms       | 0s            |
| 2       | 1000ms    | 1s            |
| 3       | 2000ms    | 3s            |
| 4       | 4000ms    | 7s            |
| 5       | 8000ms    | 15s           |
| 6       | 16000ms   | 31s           |

### Metrics Tracking

Retries are automatically tracked in the metrics system:

```typescript
{
  metric: 'retry_attempt',
  operation: 'agent_spawn',
  attempt: 3,
  totalAttempts: 5,
  delay: 4000
}
```

## Circuit Breaker Pattern

### Configuration

```typescript
import { CircuitBreaker, CircuitBreakerConfig } from '../utils/resilience';

const config: CircuitBreakerConfig = {
  name: 'redis-connection',
  failureThreshold: 0.5,      // 50% failure rate opens circuit
  minimumRequests: 10,         // Minimum requests before evaluation
  recoveryTimeoutMs: 60000     // 60 seconds before retry
};

const breaker = new CircuitBreaker(config);
```

### States

**CLOSED** (Normal Operation)
- All requests pass through
- Failures are tracked
- Opens when threshold exceeded

**OPEN** (Failing Fast)
- All requests fail immediately
- No operations attempted
- Transitions to HALF_OPEN after timeout

**HALF_OPEN** (Testing Recovery)
- Limited requests allowed
- Success closes circuit
- Failure reopens circuit

### Usage

```typescript
// Wrap operations that may fail
const result = await breaker.execute(async () => {
  return await redis.get(key);
});

// Check circuit state
if (breaker.getState() === CircuitState.OPEN) {
  // Use fallback mechanism
  return getFallbackData();
}
```

### State Transitions

```
CLOSED ──[failures > threshold]──> OPEN
  ▲                                  │
  │                                  │
  │                        [timeout expires]
  │                                  │
  │                                  ▼
  └─────[success]──────── HALF_OPEN
           │
           │
     [failure]
           │
           ▼
         OPEN
```

## Timeout Enforcement

### Configuration

```typescript
import { withTimeout } from '../utils/resilience';

// Agent execution timeout (10 minutes)
const agentResult = await withTimeout(
  async () => spawnAgent(type, context),
  10 * 60 * 1000,
  new Error('Agent execution timeout')
);

// Database query timeout (30 seconds)
const dbResult = await withTimeout(
  async () => db.query(sql),
  30 * 1000,
  new Error('Database query timeout')
);
```

### Standard Timeouts

| Operation Type    | Timeout   | Rationale                      |
|-------------------|-----------|--------------------------------|
| Agent Execution   | 10 min    | Complex analysis tasks         |
| Database Query    | 30 sec    | Prevent slow query blocking    |
| HTTP Request      | 60 sec    | External API calls             |
| Docker Operations | 5 min     | Container lifecycle operations |
| Redis Operations  | 5 sec     | Fast in-memory operations      |

## Dead Letter Queue (DLQ)

### Purpose

Capture failed agent tasks for manual inspection and retry.

### Configuration

```typescript
import { DeadLetterQueue, DLQConfig } from '../utils/dead-letter-queue';

const config: DLQConfig = {
  redisKey: 'cfn:dlq:failed-tasks',
  maxRetries: 3,
  retryDelayMs: 300000,  // 5 minutes
  retentionMs: 86400000  // 24 hours
};

const dlq = new DeadLetterQueue(config);
```

### Usage

```typescript
try {
  const result = await spawnAgent(type, context);
} catch (error) {
  // Add to DLQ for later inspection
  await dlq.add({
    taskId: context.taskId,
    agentType: type,
    error: error.message,
    context: context,
    timestamp: new Date()
  });
}
```

### Inspection and Retry

```typescript
// Get all failed tasks
const failedTasks = await dlq.getAll();

// Retry specific task
const task = failedTasks[0];
await dlq.retry(task.id);

// Clear completed tasks
await dlq.cleanup();
```

### Automatic Retry

Tasks in the DLQ are automatically retried after a cooldown period:

```typescript
// Background worker processes DLQ
setInterval(async () => {
  const retryableTasks = await dlq.getRetryable();
  for (const task of retryableTasks) {
    try {
      await spawnAgent(task.agentType, task.context);
      await dlq.remove(task.id);
    } catch (error) {
      await dlq.incrementRetries(task.id);
    }
  }
}, 60000); // Check every minute
```

## Graceful Degradation

### Strategy

When external dependencies fail, the system continues operating with reduced functionality:

**Database Unavailable**
- Fallback to default quotas
- Use cached cost data
- Continue agent spawning with basic limits

**Redis Unavailable**
- Use in-memory coordination (single-instance)
- Disable distributed locking
- Local task queuing

**AI Provider Unavailable**
- Fallback to alternative provider
- Queue tasks for later execution
- Use cached responses if available

### Implementation

```typescript
import { CircuitBreaker } from '../utils/resilience';

const dbBreaker = new CircuitBreaker({ name: 'postgres' });

async function getQuota(teamId: string): Promise<Quota> {
  try {
    return await dbBreaker.execute(() => db.getQuota(teamId));
  } catch (error) {
    // Graceful degradation to default quota
    return DEFAULT_QUOTA;
  }
}
```

## Metrics and Monitoring

All resilience patterns integrate with the metrics system:

```typescript
{
  // Retry metrics
  'retry.attempts': 3,
  'retry.success': 1,
  'retry.failure': 0,

  // Circuit breaker metrics
  'circuit.state': 'CLOSED',
  'circuit.failures': 2,
  'circuit.successes': 48,
  'circuit.rejection_rate': 0.04,

  // Timeout metrics
  'timeout.triggered': 1,
  'timeout.operations': 'agent_spawn',

  // DLQ metrics
  'dlq.queue_depth': 5,
  'dlq.retry_success': 3,
  'dlq.retry_failure': 2
}
```

## Best Practices

### When to Use Retry Logic

✅ **Good Candidates:**
- Network errors (ECONNREFUSED, ETIMEDOUT)
- Transient database failures
- Rate limit errors (429)
- Service temporarily unavailable (503)

❌ **Poor Candidates:**
- Authentication errors (401, 403)
- Invalid input errors (400)
- Resource not found (404)
- Business logic errors

### When to Use Circuit Breakers

✅ **Good Candidates:**
- External API calls
- Database connections
- Redis connections
- Docker daemon operations

❌ **Poor Candidates:**
- Pure computation (no I/O)
- Local file operations
- In-memory operations

### When to Use Timeouts

✅ **Always Use For:**
- Any network operation
- Any external process spawn
- Any user-triggered operation
- Any resource-intensive computation

### When to Use DLQ

✅ **Good Candidates:**
- Agent spawning failures
- Job execution failures
- Critical operations that must complete

❌ **Poor Candidates:**
- Validation errors
- User input errors
- Non-critical operations

## Integration Examples

### Agent Spawning with Full Resilience

```typescript
import { withRetry, CircuitBreaker, withTimeout, DeadLetterQueue } from '../utils/resilience';

const spawnBreaker = new CircuitBreaker({
  name: 'agent-spawning',
  failureThreshold: 0.3,
  minimumRequests: 5,
  recoveryTimeoutMs: 30000
});

const dlq = new DeadLetterQueue({
  redisKey: 'cfn:dlq:agent-spawn'
});

async function spawnAgentWithResilience(
  type: string,
  context: AgentContext
): Promise<AgentResult> {
  try {
    // Combine all resilience patterns
    return await withRetry(
      async () => {
        return await withTimeout(
          async () => {
            return await spawnBreaker.execute(
              async () => spawnAgent(type, context)
            );
          },
          10 * 60 * 1000  // 10 minute timeout
        );
      },
      {
        maxAttempts: 3,
        baseDelayMs: 2000,
        maxDelayMs: 8000,
        backoffMultiplier: 2
      }
    );
  } catch (error) {
    // Add to DLQ if all retries fail
    await dlq.add({
      taskId: context.taskId,
      agentType: type,
      error: error.message,
      context: context
    });
    throw error;
  }
}
```

### Redis Operations with Circuit Breaker

```typescript
const redisBreaker = new CircuitBreaker({
  name: 'redis',
  failureThreshold: 0.5,
  minimumRequests: 10,
  recoveryTimeoutMs: 60000
});

async function getFromRedis(key: string): Promise<string | null> {
  if (redisBreaker.getState() === CircuitState.OPEN) {
    // Fallback to in-memory cache
    return memoryCache.get(key);
  }

  try {
    return await redisBreaker.execute(() => redis.get(key));
  } catch (error) {
    // Graceful degradation
    return memoryCache.get(key);
  }
}
```

## Testing

### Retry Logic Tests

```typescript
describe('withRetry', () => {
  it('should retry with exponential backoff', async () => {
    const delays: number[] = [];
    let attempts = 0;

    await withRetry(
      async () => {
        attempts++;
        if (attempts < 4) throw new Error('Transient');
        return 'success';
      },
      { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 1600 }
    );

    expect(attempts).toBe(4);
    // Verify exponential backoff: 100ms, 200ms, 400ms
  });
});
```

### Circuit Breaker Tests

```typescript
describe('CircuitBreaker', () => {
  it('should open after threshold exceeded', async () => {
    const breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 0.5,
      minimumRequests: 10
    });

    // Generate failures
    for (let i = 0; i < 6; i++) {
      try { await breaker.execute(() => Promise.reject()); } catch {}
    }

    // Generate successes
    for (let i = 0; i < 4; i++) {
      await breaker.execute(() => Promise.resolve());
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });
});
```

## Troubleshooting

### High Retry Rates

**Symptom:** Many operations requiring 3+ retries

**Diagnosis:**
```typescript
const stats = await metrics.getRetryStats();
console.log(stats); // { avgAttempts: 3.5, maxAttempts: 5 }
```

**Solution:**
- Investigate root cause of failures
- Increase timeout values
- Check network stability
- Scale up dependent services

### Circuit Breaker Stuck Open

**Symptom:** Circuit never recovers, stays OPEN

**Diagnosis:**
```typescript
const state = breaker.getState();
const stats = breaker.getStats();
console.log({ state, stats }); // { state: 'OPEN', failures: 50, successes: 0 }
```

**Solution:**
- Check if dependent service is actually down
- Verify recovery timeout is appropriate
- Consider manual circuit reset
- Review failure threshold settings

### DLQ Growing Unbounded

**Symptom:** Dead letter queue depth increasing

**Diagnosis:**
```typescript
const depth = await dlq.getDepth();
console.log(depth); // 1000+
```

**Solution:**
- Review failed task patterns
- Fix underlying issues causing failures
- Increase retry attempts
- Implement cleanup job for old tasks

## See Also

- [Security Hardening Guide](./SECURITY_HARDENING_GUIDE.md)
- [Monitoring Guide](./MONITORING_GUIDE.md)
- [Performance Tuning Guide](./PERFORMANCE_TUNING_GUIDE.md)
