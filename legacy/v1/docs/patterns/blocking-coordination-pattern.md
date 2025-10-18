# Blocking Coordination Pattern Guide

## Overview

The Blocking Coordination Pattern is a distributed coordination mechanism designed for CFN Loop multi-agent systems where coordinators must synchronize execution across multiple phases. This pattern enables coordinators to block execution until specific signals are received from peer coordinators, ensuring ordered execution and consensus validation.

### When to Use

Use blocking coordination when:

- **Consensus Required**: Multiple coordinators must validate results before proceeding (Loop 2 validation)
- **Phase Transitions**: Sequential execution phases where Phase N+1 depends on Phase N completion
- **Resource Synchronization**: Shared resource access requires mutual exclusion
- **Retry Coordination**: Failed operations require synchronized retry with other coordinators
- **Distributed Locking**: Coordinator must wait for distributed lock release

### When NOT to Use

Avoid blocking coordination when:

- **Independent Tasks**: Work items can execute without coordination
- **Real-Time Requirements**: Sub-second latency requirements (blocking adds 100ms+ overhead)
- **Simple Pipelines**: Linear workflows without branching or consensus
- **Stateless Operations**: No shared state or ordering requirements

## Architecture

### Signal ACK Protocol

The core of blocking coordination is a two-phase acknowledgment protocol:

1. **Signal Delivery**: Sender publishes signal via Redis SETEX with 24h TTL
2. **Immediate ACK**: Receiver sends cryptographically signed acknowledgment within 5s
3. **ACK Verification**: Sender validates HMAC-SHA256 signature to prevent spoofing
4. **Blocking Release**: Sender unblocks after receiving all required ACKs

```
┌─────────────┐                    ┌─────────────┐
│ Coordinator │                    │ Coordinator │
│      A      │                    │      B      │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  1. Send Signal (SETEX)          │
       ├─────────────────────────────────>│
       │     blocking:signal:B            │
       │     TTL: 24h                     │
       │                                  │
       │  2. Immediate ACK (signed)       │
       │<─────────────────────────────────┤
       │     blocking:ack:B:signal-123    │
       │     HMAC-SHA256 signature        │
       │                                  │
       │  3. Verify Signature             │
       ├──────────┐                       │
       │          │                       │
       │<─────────┘                       │
       │                                  │
       │  4. Unblock & Continue           │
       ├──────────┐                       │
       │          │                       │
       │<─────────┘                       │
       │                                  │
```

### Dead Coordinator Detection

Coordinators maintain heartbeats with timestamps. The timeout handler detects dead coordinators via:

1. **Heartbeat Monitoring**: Every 30s, scan `blocking:heartbeat:*` keys
2. **Timeout Detection**: Flag coordinators with last heartbeat >120s old (configurable)
3. **State Cleanup**: Remove heartbeat, ACKs, signals, idempotency records
4. **Work Transfer**: Reassign incomplete work to new coordinator

```
┌──────────────────┐
│ Timeout Handler  │
│  (Monitors)      │
└────────┬─────────┘
         │ Every 30s
         │
         │ SCAN blocking:heartbeat:*
         ├────────────────────────────┐
         │                            │
         │ Last heartbeat >120s?      │
         ├────────────┐               │
         │            │               │
         │ YES        │ NO            │
         │            │               │
         ▼            ▼               ▼
    ┌────────┐   ┌────────┐   ┌──────────┐
    │ Timeout│   │ Healthy│   │ Continue │
    │ Cleanup│   │ Active │   │ Monitoring│
    └────────┘   └────────┘   └──────────┘
         │
         │ 1. Delete heartbeat key
         │ 2. Delete ACK keys (blocking:ack:coord:*)
         │ 3. Delete signal keys
         │ 4. Delete idempotency keys
         │ 5. Spawn new coordinator
         │ 6. Transfer incomplete work
         │
         ▼
    ┌─────────────┐
    │ Emit Event: │
    │ coordinator:│
    │   timeout   │
    └─────────────┘
```

### Timeout Enforcement

Blocking operations enforce configurable timeouts (default: 30 minutes):

- **Blocking Start**: Record timestamp when entering blocking state
- **Timeout Check**: Monitor duration against threshold during ACK wait loop
- **Timeout Action**: Emit `on_blocking_timeout` hook, log event, mark as timeout
- **Prometheus Metric**: Record `blocking_duration_seconds` with `status=timeout` label

## Design Patterns

### Signal-ACK Pattern with HMAC Verification

**Problem**: Ensure signal acknowledgments are authentic and prevent spoofing attacks.

**Solution**: Cryptographically sign ACKs with HMAC-SHA256 using shared secret.

**Implementation**:

```typescript
// Generate HMAC-SHA256 signature for ACK
private signAck(
  coordinatorId: string,
  signalId: string,
  timestamp: number,
  iteration: number
): string {
  const data = `${coordinatorId}:${signalId}:${timestamp}:${iteration}`;
  const hmac = createHmac('sha256', this.hmacSecret);
  hmac.update(data);
  return hmac.digest('hex');
}

// Verify ACK signature with timing-safe comparison
private verifyAckSignature(ack: SignalAck): boolean {
  const expectedSignature = this.signAck(
    ack.coordinatorId,
    ack.signalId,
    ack.timestamp,
    ack.iteration
  );

  // Timing-safe comparison prevents timing attacks
  const sigBuf = Buffer.from(ack.signature, 'hex');
  const expBuf = Buffer.from(expectedSignature, 'hex');
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
```

**Key Points**:
- Shared secret stored in `BLOCKING_COORDINATION_SECRET` environment variable
- All coordinators must use same secret for distributed verification
- Timing-safe comparison prevents side-channel attacks
- Legacy ACKs without signatures are rejected

### Circuit Breaker for Redis Failures

**Problem**: Redis connection failures cause cascading failures across coordinators.

**Solution**: Implement circuit breaker with exponential backoff reconnection.

**Implementation**:

```typescript
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount: number = 0;
  private lastFailureTime?: number;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === 'open') {
      // Check if cooldown period elapsed
      const timeSinceFailure = Date.now() - (this.lastFailureTime || 0);
      if (timeSinceFailure > this.cooldownMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker open - Redis unavailable');
      }
    }

    try {
      const result = await operation();
      // Success - reset circuit
      this.failureCount = 0;
      this.state = 'closed';
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      // Open circuit after threshold failures
      if (this.failureCount >= this.threshold) {
        this.state = 'open';
      }

      throw error;
    }
  }
}
```

**Backoff Strategy**:
- Attempt 1: 1s delay
- Attempt 2: 2s delay (exponential)
- Attempt 3: 4s delay (exponential)
- Attempt 4: 8s delay (max)
- After 4 attempts: Open circuit for 30s cooldown

### Heartbeat Monitoring with Escalation

**Problem**: Detect coordinator failures and reassign work without data loss.

**Solution**: Heartbeat monitoring with automatic escalation and work transfer.

**Implementation**:

```typescript
// Coordinator sends heartbeat every 30s
async sendHeartbeat(): Promise<void> {
  const heartbeatKey = `blocking:heartbeat:${this.coordinatorId}`;
  const heartbeat = {
    coordinatorId: this.coordinatorId,
    timestamp: Date.now(),
    iteration: this.currentIteration,
    phase: this.currentPhase,
  };
  await this.redis.setex(heartbeatKey, 180, JSON.stringify(heartbeat)); // 3min TTL
}

// Timeout handler detects stale heartbeats
async checkForTimeouts(): Promise<void> {
  const pattern = 'blocking:heartbeat:*';
  const keys = await this.scanKeys(pattern);

  for (const key of keys) {
    const heartbeatJson = await this.redis.get(key);
    const heartbeat = JSON.parse(heartbeatJson);

    const age = Date.now() - heartbeat.timestamp;
    if (age > 120000) { // 2 minutes
      // Dead coordinator detected
      await this.escalateDeadCoordinator(heartbeat.coordinatorId);
    }
  }
}
```

**Escalation Flow**:
1. Detect stale heartbeat (>120s old)
2. Create escalation record in Redis
3. Publish notification to parent coordinator
4. Spawn new coordinator to replace dead one
5. Transfer incomplete work to new coordinator
6. Emit `coordinator:escalated` event

### Work Transfer on Coordinator Death

**Problem**: Coordinator crashes with incomplete work items - prevent data loss.

**Solution**: Store work items in Redis, transfer to new coordinator on death.

**Implementation**:

```typescript
// Store work item when coordinator starts processing
async storeWorkItem(workId: string, workData: any): Promise<void> {
  const workKey = `coordinator:work:${this.swarmId}:${this.coordinatorId}:${workId}`;
  await this.redis.setex(workKey, 3600, JSON.stringify({
    workId,
    assignedTo: this.coordinatorId,
    status: 'in-progress',
    data: workData,
    startedAt: Date.now(),
  }));
}

// Transfer work when coordinator dies
async transferIncompleteWork(
  deadCoordinatorId: string,
  newCoordinatorId: string,
  swarmId: string
): Promise<void> {
  const workPattern = `coordinator:work:${swarmId}:${deadCoordinatorId}:*`;
  const workKeys = await this.scanKeys(workPattern);

  for (const workKey of workKeys) {
    const workData = JSON.parse(await this.redis.get(workKey));

    // Create new work key for replacement coordinator
    const newWorkKey = workKey.replace(deadCoordinatorId, newCoordinatorId);

    // Update work item metadata
    const updatedWork = {
      ...workData,
      transferredFrom: deadCoordinatorId,
      transferredAt: Date.now(),
      assignedTo: newCoordinatorId,
      status: 'transferred',
    };

    // Store in new location
    await this.redis.setex(newWorkKey, 3600, JSON.stringify(updatedWork));

    // Delete old work item
    await this.redis.del(workKey);
  }
}
```

## Best Practices

### Timeout Selection

Choose appropriate timeout values based on workload:

| Workload Type | Recommended Timeout | Rationale |
|---------------|---------------------|-----------|
| Quick validation (Loop 2) | 5-10 minutes | Validators run lightweight checks |
| Complex implementation (Loop 3) | 30-60 minutes | Agents write code, run tests |
| External API calls | 2-5 minutes | Network latency + processing |
| Database migrations | 15-30 minutes | Schema changes take time |
| Model inference | 10-20 minutes | LLM responses vary |

**Calculation Formula**:
```
Timeout = (Expected Duration × 1.5) + Network Buffer
Network Buffer = 30s for local, 60s for distributed
```

### Heartbeat Intervals

Balance monitoring granularity vs Redis load:

- **Production**: 30s heartbeat, 120s timeout (4× safety margin)
- **Development**: 10s heartbeat, 30s timeout (faster failure detection)
- **Testing**: 5s heartbeat, 15s timeout (rapid iteration)

**Rule of Thumb**: Timeout should be ≥ 4× heartbeat interval to avoid false positives.

### Signal Retry Strategies

Implement exponential backoff for failed signal delivery:

```typescript
async retryFailedSignal(signal: CoordinationSignal, maxRetries: number = 3): Promise<SignalAck | null> {
  const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wait before retry (exponential backoff)
      if (attempt > 1) {
        await this.sleep(retryDelays[attempt - 2]);
      }

      // Attempt signal delivery
      const ack = await this.acknowledgeSignal(signal);
      return ack;

    } catch (error) {
      if (attempt === maxRetries) {
        // Log failure for manual escalation
        await this.logFailedSignal(signal, error);
        return null;
      }
    }
  }

  return null;
}
```

**Max Retries**: 3 attempts (total delay: 7s)
**Failure Action**: Log to Redis, emit event, continue without ACK

## Anti-Patterns

### What NOT to Do

#### 1. Blocking Without Timeouts

**Bad**:
```typescript
// NEVER block indefinitely without timeout
while (!ack) {
  ack = await waitForAck(coordinatorId, signalId);
  await sleep(1000);
}
```

**Good**:
```typescript
// Always enforce timeout with graceful degradation
const ack = await waitForAcks(
  [coordinatorId],
  signalId,
  30000 // 30s timeout
);

if (!ack) {
  this.logger.warn('ACK timeout - proceeding with degraded mode');
  // Emit timeout event, record metric, continue
}
```

#### 2. Missing ACK Verification

**Bad**:
```typescript
// NEVER trust ACKs without signature verification
const ack = await this.getAck(signalId);
if (ack) {
  // Assume ACK is valid - SECURITY HOLE!
  this.unblock();
}
```

**Good**:
```typescript
// Always verify HMAC signature to prevent spoofing
const ack = await this.getAck(signalId);
if (ack) {
  const isValid = this.verifyAckSignature(ack);
  if (!isValid) {
    throw new Error('ACK signature verification failed - potential spoofing attack');
  }
  this.unblock();
}
```

#### 3. Using redis.keys() in Production

**Bad**:
```typescript
// NEVER use KEYS command in production - blocks Redis
const keys = await redis.keys('blocking:ack:*');
```

**Good**:
```typescript
// Use SCAN with cursor-based iteration
async scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';

  do {
    const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== '0');

  return keys;
}
```

#### 4. No Input Sanitization

**Bad**:
```typescript
// NEVER construct Redis keys without validation
const key = `blocking:ack:${coordinatorId}:${signalId}`;
await redis.set(key, value);
```

**Good**:
```typescript
// Always validate IDs before Redis key construction
private validateId(id: string, fieldName: string): string {
  const idPattern = /^[a-zA-Z0-9_-]+$/;
  if (!id || !idPattern.test(id)) {
    throw new Error(`Invalid ${fieldName}: must contain only alphanumeric characters, hyphens, and underscores`);
  }
  return id;
}
```

#### 5. Ignoring Circuit Breaker State

**Bad**:
```typescript
// NEVER ignore circuit breaker open state
try {
  await redis.get(key);
} catch (error) {
  // Retry immediately - causes cascading failures
  await redis.get(key);
}
```

**Good**:
```typescript
// Respect circuit breaker state and backoff
const breaker = new CircuitBreaker({ delays: [1000, 2000, 4000, 8000] });

try {
  await breaker.execute(async () => {
    return await redis.get(key);
  });
} catch (error) {
  if (breaker.state === 'open') {
    // Circuit open - use fallback or fail gracefully
    return this.getFallbackValue();
  }
  throw error;
}
```

## Performance Considerations

### Redis SCAN vs KEYS

Never use `redis.keys()` in production - it blocks Redis during iteration:

| Operation | KEYS | SCAN |
|-----------|------|------|
| Blocking | Yes (blocks entire Redis) | No (cursor-based) |
| Performance | O(N) where N = total keys | O(N) where N = matching keys |
| Production Safe | No | Yes |
| Memory | Loads all matches at once | Streams results |

**Impact**: With 1M keys, `redis.keys('blocking:*')` can block Redis for 100ms+, causing cascading failures.

### Connection Pooling

Reuse Redis connections across operations:

```typescript
// BAD: Create new connection per operation
async sendSignal() {
  const redis = new Redis();
  await redis.connect();
  await redis.set(key, value);
  await redis.disconnect();
}

// GOOD: Reuse connection pool
constructor(config) {
  this.redisPool = new RedisPool({ maxConnections: 10 });
}

async sendSignal() {
  await this.redisPool.execute(async (redis) => {
    await redis.set(key, value);
  });
}
```

**Benefits**: 10× latency reduction, avoid connection overhead

### TTL Management

Choose appropriate TTL values to balance memory vs availability:

| Redis Key Type | Recommended TTL | Rationale |
|----------------|-----------------|-----------|
| Signal ACKs | 1 hour (3600s) | Validation completes within hour |
| Heartbeats | 3 minutes (180s) | Stale after 2min timeout |
| Idempotency records | 24 hours (86400s) | Prevent replays for full day |
| Work items | 1 hour (3600s) | Work completes or transferred |
| Escalation records | 1 hour (3600s) | Historical audit trail |

**Memory Impact**: 10K coordinators × 100 ACKs × 1KB = 1MB Redis memory

## Security

### HMAC Secret Management

Protect shared secret used for ACK signing:

1. **Environment Variable**: Store in `BLOCKING_COORDINATION_SECRET` (never hardcode)
2. **Secret Rotation**: Rotate every 90 days via config management
3. **Secret Distribution**: Use Kubernetes Secrets or AWS Secrets Manager
4. **Secret Length**: Minimum 32 bytes (256 bits) for HMAC-SHA256
5. **Secret Generation**: Use cryptographically secure random generator

**Example Secret Generation**:
```bash
# Generate 32-byte (256-bit) secret
openssl rand -hex 32
```

### Timing-Safe Comparison

Always use `crypto.timingSafeEqual()` for signature verification:

```typescript
// BAD: String comparison leaks timing information
if (ack.signature === expectedSignature) {
  return true;
}

// GOOD: Timing-safe comparison prevents side-channel attacks
const sigBuf = Buffer.from(ack.signature, 'hex');
const expBuf = Buffer.from(expectedSignature, 'hex');
return crypto.timingSafeEqual(sigBuf, expBuf);
```

**Why**: String comparison exits early on first mismatch, leaking signature length information.

### Input Sanitization

Validate all IDs before constructing Redis keys:

```typescript
private validateId(id: string, fieldName: string): string {
  // Check for null/empty
  if (!id || typeof id !== 'string') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  // Check length (max 64 chars)
  if (id.length > 64) {
    throw new Error(`${fieldName} exceeds maximum length`);
  }

  // Allow only alphanumeric, hyphens, underscores
  const idPattern = /^[a-zA-Z0-9_-]+$/;
  if (!idPattern.test(id)) {
    throw new Error(`Invalid ${fieldName}: must contain only safe characters`);
  }

  return id;
}
```

**Prevents**: Redis key injection, command injection, path traversal

---

**Next Steps**:
- Review [Failure Recovery Playbook](../operations/failure-recovery-playbook.md) for incident response
- See [Integration Examples](../integration/cfn-loop-examples.md) for implementation code
- Check [API Reference](../api/blocking-coordination-api.md) for detailed method documentation
