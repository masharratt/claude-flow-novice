# Blocking Coordination API Reference

## Overview

This document provides comprehensive API reference for the blocking coordination system. All classes, methods, parameters, return types, and examples are documented here.

---

## Table of Contents

1. [BlockingCoordinationManager](#blockingcoordinationmanager)
2. [CoordinatorTimeoutHandler](#coordinatortimeouthandler)
3. [BlockingCoordinationSignals](#blockingcoordinationsignals)
4. [CFNCircuitBreaker](#cfncircuitbreaker)
5. [Prometheus Metrics](#prometheus-metrics)
6. [Type Definitions](#type-definitions)

---

## BlockingCoordinationManager

Main class for managing blocking coordination and signal acknowledgment for CFN Loop coordinators.

### Constructor

```typescript
constructor(config: BlockingCoordinationConfig)
```

**Parameters**:

```typescript
interface BlockingCoordinationConfig {
  /** Redis client instance (ioredis) */
  redisClient: Redis;

  /** Coordinator ID for this instance */
  coordinatorId: string;

  /** TTL for ACK keys in seconds (default: 3600 = 1 hour) */
  ackTtl?: number;

  /** Enable debug logging */
  debug?: boolean;

  /** HMAC secret for ACK signing (SEC-CRIT-001) - defaults to env var or random */
  hmacSecret?: string;

  /** Lifecycle manager for hook execution (optional) */
  lifecycleManager?: AgentLifecycleManager;

  /** Agent profile for hook definitions (optional) */
  agentProfile?: AgentDefinition;

  /** Agent ID for hook execution context (optional) */
  agentId?: string;

  /** Current task description for hook context (optional) */
  currentTask?: string;

  /** Swarm ID for hook context (optional) */
  swarmId?: string;

  /** Current phase for hook context (optional) */
  phase?: string;
}
```

**Throws**:
- `Error` if `BLOCKING_COORDINATION_SECRET` environment variable not set
- `Error` if `coordinatorId` contains invalid characters (non-alphanumeric, hyphens, underscores)

**Example**:

```typescript
import { BlockingCoordinationManager } from './cfn-loop/blocking-coordination';
import { createClient } from 'redis';

const redis = createClient({ socket: { host: 'localhost', port: 6379 } });
await redis.connect();

const coordinator = new BlockingCoordinationManager({
  redisClient: redis,
  coordinatorId: 'coordinator-1',
  ackTtl: 3600, // 1 hour
  debug: true,
  hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
});
```

---

### acknowledgeSignal()

Process incoming signal and send immediate ACK.

**CRITICAL**: This method MUST be called BEFORE processing the signal payload. The ACK confirms receipt, allowing the sender to proceed without waiting.

```typescript
async acknowledgeSignal(signal: CoordinationSignal): Promise<SignalAck>
```

**Parameters**:

```typescript
interface CoordinationSignal {
  /** Unique signal identifier */
  signalId: string;

  /** Signal type */
  type: 'completion' | 'retry' | 'validation' | 'error';

  /** Source coordinator that sent the signal */
  source: string;

  /** Target coordinator(s) */
  targets: string[];

  /** Signal payload */
  payload?: any;

  /** Timestamp when signal was created */
  timestamp: number;
}
```

**Returns**:

```typescript
interface SignalAck {
  /** Coordinator ID that sent the ACK */
  coordinatorId: string;

  /** Signal ID that triggered the ACK */
  signalId: string;

  /** Timestamp when ACK was sent (ms since epoch) */
  timestamp: number;

  /** Current iteration count (for retry loops) */
  iteration: number;

  /** ACK status - always "received" on initial send */
  status: 'received';

  /** HMAC-SHA256 signature for ACK verification (SEC-CRIT-001) */
  signature: string;

  /** Optional metadata for debugging */
  metadata?: {
    signalType?: string;
    phase?: string;
  };
}
```

**Side Effects**:
- Persists ACK to Redis at key `blocking:ack:{coordinatorId}:{signalId}`
- Sets TTL to `ackTtl` seconds (default: 3600)
- Marks signal as processed to prevent duplicate ACKs
- Records Prometheus metric `signal_delivery_latency_seconds`

**Example**:

```typescript
const signal = {
  signalId: 'signal-123',
  type: 'completion',
  source: 'coordinator-2',
  targets: ['coordinator-1'],
  timestamp: Date.now(),
};

const ack = await coordinator.acknowledgeSignal(signal);

console.log('ACK sent:', {
  coordinatorId: ack.coordinatorId,
  signalId: ack.signalId,
  timestamp: ack.timestamp,
  signature: ack.signature.substring(0, 16) + '...',
});
```

---

### waitForAcks()

Wait for ACKs from multiple coordinators with timeout.

```typescript
async waitForAcks(
  coordinatorIds: string[],
  signalId: string,
  timeoutMs: number = 30000
): Promise<Map<string, SignalAck>>
```

**Parameters**:
- `coordinatorIds`: List of coordinator IDs to wait for ACKs from
- `signalId`: Signal ID to check ACKs for
- `timeoutMs`: Maximum time to wait in milliseconds (default: 30000 = 30s)

**Returns**: Map of coordinator IDs to their ACKs (may be partial if timeout)

**Side Effects**:
- Executes `on_blocking_start` lifecycle hook
- Executes `on_blocking_timeout` hook if timeout occurs
- Executes `on_signal_received` hook if all ACKs received
- Records Prometheus metric `blocking_duration_seconds`

**Behavior**:
- Polls Redis every 100ms for ACKs
- Verifies HMAC signature for each ACK before accepting
- Returns immediately if all ACKs received before timeout
- Returns partial results if timeout expires

**Example**:

```typescript
const acks = await coordinator.waitForAcks(
  ['coordinator-2', 'coordinator-3'],
  'signal-123',
  30000 // 30 second timeout
);

if (acks.size === 2) {
  console.log('All ACKs received');
} else {
  console.warn(`Only ${acks.size}/2 ACKs received`);
  // Handle partial ACKs
}
```

---

### getAck()

Retrieve ACK for a specific signal.

```typescript
async getAck(signalId: string): Promise<SignalAck | null>
```

**Parameters**:
- `signalId`: Signal ID to retrieve ACK for

**Returns**: ACK object if found, null otherwise

**Side Effects**:
- Verifies HMAC signature before returning
- Throws `Error` if signature verification fails (potential spoofing attack)

**Example**:

```typescript
const ack = await coordinator.getAck('signal-123');

if (ack) {
  console.log('ACK found:', {
    coordinatorId: ack.coordinatorId,
    timestamp: ack.timestamp,
    iteration: ack.iteration,
  });
} else {
  console.log('ACK not found');
}
```

---

### isAcknowledged()

Check if a signal has been acknowledged by a specific coordinator.

```typescript
async isAcknowledged(
  coordinatorId: string,
  signalId: string
): Promise<boolean>
```

**Parameters**:
- `coordinatorId`: Coordinator to check
- `signalId`: Signal ID to check

**Returns**: True if ACK exists, false otherwise

**Example**:

```typescript
const acknowledged = await coordinator.isAcknowledged(
  'coordinator-2',
  'signal-123'
);

if (acknowledged) {
  console.log('Signal acknowledged');
} else {
  console.log('Still waiting for ACK');
}
```

---

### retryFailedSignal()

Retry failed signal with exponential backoff.

```typescript
async retryFailedSignal(
  signal: CoordinationSignal,
  maxRetries: number = 3
): Promise<SignalAck | null>
```

**Parameters**:
- `signal`: Signal that failed to be acknowledged
- `maxRetries`: Maximum number of retry attempts (default: 3)

**Returns**: SignalAck if successful, null if all retries failed

**Retry Strategy**:
- Attempt 1: Immediate (no delay)
- Attempt 2: 1s delay
- Attempt 3: 2s delay
- Attempt 4: 4s delay (if maxRetries = 4)

**Side Effects**:
- Logs retry attempts to Redis at key `blocking:retry:{signalId}:{attempt}`
- Logs failure to Redis at key `blocking:retry:failed:{signalId}` if all attempts fail

**Example**:

```typescript
const signal = {
  signalId: 'signal-retry',
  type: 'completion',
  source: 'coordinator-1',
  targets: ['coordinator-2'],
  timestamp: Date.now(),
};

const ack = await coordinator.retryFailedSignal(signal, 3);

if (ack) {
  console.log('Retry successful');
} else {
  console.error('All retries failed - escalate to manual intervention');
}
```

---

### incrementIteration()

Increment iteration counter (called when entering a new retry loop).

```typescript
incrementIteration(): number
```

**Returns**: New iteration count

**Example**:

```typescript
const iteration = coordinator.incrementIteration();
console.log('Entering iteration:', iteration);
```

---

### getCurrentIteration()

Get current iteration count.

```typescript
getCurrentIteration(): number
```

**Returns**: Current iteration number

**Example**:

```typescript
const iteration = coordinator.getCurrentIteration();
console.log('Current iteration:', iteration);
```

---

### resetIteration()

Reset iteration counter (called when starting fresh coordination).

```typescript
resetIteration(): void
```

**Example**:

```typescript
coordinator.resetIteration();
console.log('Iteration reset to 0');
```

---

### clearProcessedSignals()

Clear processed signals cache.

```typescript
clearProcessedSignals(): void
```

**Example**:

```typescript
coordinator.clearProcessedSignals();
console.log('Processed signals cache cleared');
```

---

### getHookMetrics()

Get hook execution metrics.

```typescript
getHookMetrics(): {
  hooksExecuted: number;
  hooksFailed: number;
  hookExecutionTimeMs: number;
  averageHookDuration: number;
}
```

**Returns**: Metrics object with hook execution statistics

**Example**:

```typescript
const metrics = coordinator.getHookMetrics();
console.log('Hook metrics:', {
  executed: metrics.hooksExecuted,
  failed: metrics.hooksFailed,
  avgDuration: Math.round(metrics.averageHookDuration) + 'ms',
});
```

---

### cleanup()

Cleanup all ACKs for this coordinator.

```typescript
async cleanup(): Promise<void>
```

**Side Effects**:
- Deletes all keys matching `blocking:ack:{coordinatorId}:*`
- Clears processed signals cache

**Example**:

```typescript
await coordinator.cleanup();
console.log('Coordinator state cleaned up');
```

---

## CoordinatorTimeoutHandler

Manages coordinator timeout detection and cleanup.

### Constructor

```typescript
constructor(config: CoordinatorTimeoutConfig)
```

**Parameters**:

```typescript
interface CoordinatorTimeoutConfig {
  /** Redis client instance (ioredis) */
  redisClient: Redis;

  /** Timeout threshold in milliseconds (default: 300000 = 5 minutes) */
  timeoutThreshold?: number;

  /** Check interval in milliseconds (default: 30000 = 30s) */
  checkInterval?: number;

  /** Optional HeartbeatWarningSystem for cleanup integration */
  heartbeatSystem?: HeartbeatWarningSystem;

  /** Enable automatic cleanup on timeout (default: true) */
  autoCleanup?: boolean;

  /** Enable debug logging */
  debug?: boolean;
}
```

**Example**:

```typescript
import { CoordinatorTimeoutHandler } from './cfn-loop/coordinator-timeout-handler';
import { createClient } from 'redis';

const redis = createClient({ socket: { host: 'localhost', port: 6379 } });
await redis.connect();

const handler = new CoordinatorTimeoutHandler({
  redisClient: redis,
  timeoutThreshold: 120000, // 2 minutes
  checkInterval: 30000, // 30 seconds
  autoCleanup: true,
  debug: true,
});
```

---

### startMonitoring()

Start timeout monitoring.

```typescript
startMonitoring(): void
```

**Side Effects**:
- Starts interval timer that calls `checkForTimeouts()` every `checkInterval` ms
- Emits `monitoring:started` event

**Example**:

```typescript
handler.startMonitoring();
console.log('Timeout monitoring started');
```

---

### stopMonitoring()

Stop timeout monitoring.

```typescript
stopMonitoring(): void
```

**Side Effects**:
- Stops interval timer
- Emits `monitoring:stopped` event with metrics

**Example**:

```typescript
handler.stopMonitoring();
console.log('Timeout monitoring stopped');
```

---

### checkCoordinatorTimeout()

Manually trigger timeout detection for a specific coordinator.

```typescript
async checkCoordinatorTimeout(
  coordinatorId: string,
  currentTime: number = Date.now()
): Promise<boolean>
```

**Parameters**:
- `coordinatorId`: Coordinator ID to check
- `currentTime`: Current timestamp (defaults to Date.now())

**Returns**: True if timeout detected and handled, false otherwise

**Side Effects**:
- If timeout detected:
  - Records Prometheus metric `heartbeat_failures_total`
  - Records Prometheus metric `timeout_events_total`
  - Calls `handleTimeout()` internally
  - Emits `coordinator:timeout` event

**Example**:

```typescript
const timedOut = await handler.checkCoordinatorTimeout('coordinator-1');

if (timedOut) {
  console.log('Coordinator-1 timed out - cleanup triggered');
} else {
  console.log('Coordinator-1 still healthy');
}
```

---

### cleanupTimeoutCoordinator()

Cleanup state for timed-out coordinator.

```typescript
async cleanupTimeoutCoordinator(coordinatorId: string): Promise<void>
```

**Parameters**:
- `coordinatorId`: Coordinator ID to cleanup

**Cleanup Actions**:
1. Deletes heartbeat key: `blocking:heartbeat:{coordinatorId}`
2. Deletes ACK keys: `blocking:ack:{coordinatorId}:*`
3. Deletes signal keys: `blocking:signal:{coordinatorId}`
4. Deletes idempotency keys: `blocking:idempotency:*{coordinatorId}*`
5. Deletes activity key: `coordinator:activity:{coordinatorId}`

**Side Effects**:
- Emits `cleanup:complete` event on success
- Emits `cleanup:failed` event on error

**Example**:

```typescript
await handler.cleanupTimeoutCoordinator('coordinator-1');
console.log('Cleanup completed for coordinator-1');
```

---

### recordActivity()

Record coordinator activity.

```typescript
async recordActivity(
  coordinatorId: string,
  iteration: number,
  phase?: string
): Promise<void>
```

**Parameters**:
- `coordinatorId`: Coordinator ID
- `iteration`: Current iteration count
- `phase`: Optional phase information

**Side Effects**:
- Stores activity at key `coordinator:activity:{coordinatorId}` with 10min TTL

**Example**:

```typescript
await handler.recordActivity('coordinator-1', 3, 'loop-3-implementation');
console.log('Activity recorded');
```

---

### escalateDeadCoordinator()

Escalate dead coordinator to parent or swarm manager.

```typescript
async escalateDeadCoordinator(
  coordinatorId: string,
  swarmId: string
): Promise<string | null>
```

**Parameters**:
- `coordinatorId`: Dead coordinator ID
- `swarmId`: Swarm ID that the coordinator belonged to

**Returns**: New coordinator ID if spawned, null if escalation failed

**Actions**:
1. Creates escalation record in Redis
2. Publishes notification to parent coordinator via Redis pub/sub
3. Generates new coordinator ID
4. Creates spawn request for new coordinator
5. Transfers incomplete work to new coordinator
6. Emits `coordinator:escalated` event

**Example**:

```typescript
const newCoordinatorId = await handler.escalateDeadCoordinator(
  'coordinator-dead',
  'swarm-123'
);

if (newCoordinatorId) {
  console.log('New coordinator spawned:', newCoordinatorId);
} else {
  console.error('Escalation failed');
}
```

---

### getMetrics()

Get metrics.

```typescript
getMetrics(): {
  totalChecks: number;
  timeoutEventsTotal: number;
  cleanupsPerformed: number;
  cleanupFailures: number;
}
```

**Returns**: Metrics object

**Example**:

```typescript
const metrics = handler.getMetrics();
console.log('Timeout handler metrics:', metrics);
```

---

### resetMetrics()

Reset metrics.

```typescript
resetMetrics(): void
```

**Example**:

```typescript
handler.resetMetrics();
console.log('Metrics reset');
```

---

### Events

The `CoordinatorTimeoutHandler` extends EventEmitter and emits the following events:

```typescript
// Monitoring lifecycle
handler.on('monitoring:started', (data: { checkInterval: number; timeoutThreshold: number }) => {});
handler.on('monitoring:stopped', (data: { metrics: object }) => {});

// Timeout events
handler.on('coordinator:timeout', (event: CoordinatorTimeoutEvent) => {});

// Cleanup events
handler.on('cleanup:complete', (event: { coordinatorId: string; timestamp: number }) => {});
handler.on('cleanup:failed', (event: { coordinatorId: string; error: string; timestamp: number }) => {});

// Escalation events
handler.on('coordinator:escalated', (event: {
  deadCoordinatorId: string;
  newCoordinatorId: string;
  swarmId: string;
  timestamp: number;
}) => {});

handler.on('escalation:failed', (event: {
  coordinatorId: string;
  swarmId: string;
  error: string;
  timestamp: number;
}) => {});
```

---

## BlockingCoordinationSignals

Manages signal delivery via Redis SETEX.

### Constructor

```typescript
constructor(config: BlockingCoordinationSignalsConfig)
```

**Parameters**:

```typescript
interface BlockingCoordinationSignalsConfig {
  redisHost?: string;
  redisPort?: number;
  redisPassword?: string;
  redisDatabase?: number;
  signalTTL?: number; // TTL in seconds (default: 86400 = 24h)
  enableIdempotency?: boolean; // Enable duplicate detection (default: true)
  idempotencyTTL?: number; // Idempotency record TTL in seconds (default: 86400)
}
```

**Example**:

```typescript
import { BlockingCoordinationSignals } from './cfn-loop/blocking-coordination-signals';

const signals = new BlockingCoordinationSignals({
  redisHost: 'localhost',
  redisPort: 6379,
  signalTTL: 86400, // 24 hours
  enableIdempotency: true,
});

await signals.connect();
```

---

### connect()

Connect to Redis.

```typescript
async connect(): Promise<void>
```

**Side Effects**:
- Establishes Redis connection
- Registers event handlers for Redis events

**Example**:

```typescript
await signals.connect();
console.log('Connected to Redis');
```

---

### disconnect()

Disconnect from Redis.

```typescript
async disconnect(): Promise<void>
```

**Example**:

```typescript
await signals.disconnect();
console.log('Disconnected from Redis');
```

---

### sendSignal()

Send signal via Redis SETEX.

```typescript
async sendSignal(
  senderId: string,
  receiverId: string,
  type: SignalType,
  iteration: number,
  payload?: Record<string, any>
): Promise<SignalDeliveryResult>
```

**Parameters**:
- `senderId`: ID of coordinator/agent sending signal
- `receiverId`: ID of coordinator/agent receiving signal
- `type`: Signal type (completion, retry_request, heartbeat, error, status_update)
- `iteration`: Current iteration number
- `payload`: Optional additional data

**Returns**:

```typescript
interface SignalDeliveryResult {
  success: boolean;
  messageId: string;
  isDuplicate: boolean;
  timestamp: number;
  key: string;
}
```

**Side Effects**:
- Stores signal at key `blocking:signal:{receiverId}` with TTL
- Records idempotency marker at key `blocking:idempotency:{messageId}` if enabled

**Example**:

```typescript
const result = await signals.sendSignal(
  'coordinator-1',
  'coordinator-2',
  SignalType.COMPLETION,
  1,
  { phase: 'validation', confidence: 0.92 }
);

console.log('Signal sent:', {
  messageId: result.messageId,
  isDuplicate: result.isDuplicate,
  key: result.key,
});
```

---

### receiveSignal()

Receive signal from Redis.

```typescript
async receiveSignal(coordinatorId: string): Promise<SignalReceiveResult>
```

**Parameters**:
- `coordinatorId`: ID of coordinator receiving signal

**Returns**:

```typescript
interface SignalReceiveResult {
  signal: SignalPayload | null;
  exists: boolean;
  key: string;
}

interface SignalPayload {
  timestamp: number;
  senderId: string;
  receiverId: string;
  iteration: number;
  type: SignalType;
  payload?: Record<string, any>;
  messageId: string;
}
```

**Example**:

```typescript
const result = await signals.receiveSignal('coordinator-2');

if (result.exists) {
  console.log('Signal received:', {
    senderId: result.signal?.senderId,
    type: result.signal?.type,
    iteration: result.signal?.iteration,
  });
} else {
  console.log('No signal found');
}
```

---

### deleteSignal()

Delete signal from Redis.

```typescript
async deleteSignal(coordinatorId: string): Promise<boolean>
```

**Parameters**:
- `coordinatorId`: ID of coordinator

**Returns**: True if signal was deleted, false if not found

**Example**:

```typescript
const deleted = await signals.deleteSignal('coordinator-2');
console.log('Signal deleted:', deleted);
```

---

### signalExists()

Check if signal exists.

```typescript
async signalExists(coordinatorId: string): Promise<boolean>
```

**Parameters**:
- `coordinatorId`: ID of coordinator

**Returns**: True if signal exists, false otherwise

**Example**:

```typescript
const exists = await signals.signalExists('coordinator-2');
console.log('Signal exists:', exists);
```

---

### getSignalTTL()

Get remaining TTL for signal.

```typescript
async getSignalTTL(coordinatorId: string): Promise<number>
```

**Parameters**:
- `coordinatorId`: ID of coordinator

**Returns**: Remaining TTL in seconds, -1 if no expiry, -2 if not found

**Example**:

```typescript
const ttl = await signals.getSignalTTL('coordinator-2');
console.log('Signal TTL:', ttl + 's');
```

---

### getStatistics()

Get statistics.

```typescript
getStatistics(): {
  signalsSent: number;
  signalsReceived: number;
  duplicatesDetected: number;
  errors: number;
}
```

**Returns**: Statistics object

**Example**:

```typescript
const stats = signals.getStatistics();
console.log('Signal statistics:', stats);
```

---

### resetStatistics()

Reset statistics.

```typescript
resetStatistics(): void
```

**Example**:

```typescript
signals.resetStatistics();
console.log('Statistics reset');
```

---

## CFNCircuitBreaker

Circuit breaker with exponential backoff for Redis connection failures.

### Constructor

```typescript
constructor(name: string, options?: BreakerOptions)
```

**Parameters**:

```typescript
interface BreakerOptions {
  /** Maximum execution time in milliseconds */
  timeoutMs?: number;

  /** Number of failures before opening circuit */
  failureThreshold?: number;

  /** Exponential backoff delays in milliseconds [1s, 2s, 4s, 8s] */
  delays?: number[];

  /** Maximum retry attempts (should match delays.length) */
  maxAttempts?: number;

  /** Number of successes required to close from half-open */
  successThreshold?: number;

  /** Maximum requests allowed in half-open state */
  halfOpenLimit?: number;
}
```

**Example**:

```typescript
import { CFNCircuitBreaker } from './cfn-loop/circuit-breaker';

const breaker = new CFNCircuitBreaker('redis-connection', {
  delays: [1000, 2000, 4000, 8000], // 1s, 2s, 4s, 8s
  maxAttempts: 4,
  failureThreshold: 3,
  successThreshold: 2,
});
```

---

### execute()

Execute a function with circuit breaker protection and timeout.

```typescript
async execute<T>(fn: () => Promise<T>, options?: BreakerOptions): Promise<T>
```

**Parameters**:
- `fn`: Async function to execute
- `options`: Optional override of default options

**Returns**: Result of the function

**Throws**:
- `CircuitOpenError` if circuit is open
- `TimeoutError` if operation exceeds timeout
- Original error from function if execution fails

**Example**:

```typescript
const breaker = new CFNCircuitBreaker('redis-ping');

try {
  const result = await breaker.execute(async () => {
    await redis.ping();
    return 'PONG';
  });

  console.log('Result:', result);
} catch (error) {
  if (error.name === 'CircuitOpenError') {
    console.error('Circuit is open - Redis unavailable');
  } else if (error.name === 'TimeoutError') {
    console.error('Operation timed out');
  }
}
```

---

### getState()

Get current circuit breaker state.

```typescript
getState(): BreakerState
```

**Returns**:

```typescript
interface BreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
  totalRequests: number;
  rejectedRequests: number;
  timeoutCount: number;
}
```

**Example**:

```typescript
const state = breaker.getState();
console.log('Circuit state:', {
  state: state.state,
  failures: state.failureCount,
  nextAttempt: state.nextAttemptTime,
});
```

---

### reset()

Reset circuit breaker to closed state.

```typescript
reset(): void
```

**Side Effects**:
- Sets state to CLOSED
- Resets failure/success counters
- Clears timestamps
- Emits `reset` event

**Example**:

```typescript
breaker.reset();
console.log('Circuit breaker reset');
```

---

### forceState()

Force state transition (for testing/manual intervention).

```typescript
forceState(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void
```

**Parameters**:
- `state`: Desired circuit state

**Example**:

```typescript
breaker.forceState('OPEN');
console.log('Circuit manually opened');
```

---

### Events

The `CFNCircuitBreaker` extends EventEmitter and emits the following events:

```typescript
// State transitions
breaker.on('state:transition', (data: {
  name: string;
  from: CircuitState;
  to: CircuitState;
  state: BreakerState;
}) => {});

// Execution events
breaker.on('success', (data: { name: string; state: CircuitState; successCount: number }) => {});
breaker.on('failure', (data: {
  name: string;
  state: CircuitState;
  failureCount: number;
  currentAttempt: number;
  maxAttempts: number;
}) => {});

// Request events
breaker.on('request:rejected', (data: { name: string; state: BreakerState }) => {});

// Reset events
breaker.on('reset', (data: { name: string }) => {});
```

---

## Prometheus Metrics

### blockingDurationSeconds

Histogram tracking coordinator blocking duration.

```typescript
blockingDurationSeconds
  .labels(swarmId: string, coordinatorId: string, status: 'completed' | 'timeout')
  .observe(durationSeconds: number)
```

**Labels**:
- `swarm_id`: Swarm identifier
- `coordinator_id`: Coordinator identifier
- `status`: Outcome (completed or timeout)

**Buckets**: [1, 5, 30, 60, 300, 600, 1800, 3600] (seconds)

**Example**:

```typescript
import { blockingDurationSeconds } from './observability/prometheus-metrics';

const startTime = Date.now();
await coordinator.waitForAcks(coordinatorIds, signalId, 30000);
const duration = Date.now() - startTime;

blockingDurationSeconds
  .labels('swarm-123', 'coordinator-1', 'completed')
  .observe(duration / 1000);
```

---

### signalDeliveryLatencySeconds

Histogram tracking signal delivery latency.

```typescript
signalDeliveryLatencySeconds
  .labels(senderId: string, receiverId: string, signalType: string)
  .observe(latencySeconds: number)
```

**Labels**:
- `sender_id`: Signal sender identifier
- `receiver_id`: Signal receiver identifier
- `signal_type`: Type of signal (completion, retry, validation, error)

**Buckets**: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10] (seconds)

**Example**:

```typescript
import { signalDeliveryLatencySeconds } from './observability/prometheus-metrics';

const signalTime = signal.timestamp;
const ackTime = Date.now();
const latency = ackTime - signalTime;

signalDeliveryLatencySeconds
  .labels(signal.source, 'coordinator-1', signal.type)
  .observe(latency / 1000);
```

---

### heartbeatFailuresTotal

Counter tracking heartbeat failures.

```typescript
heartbeatFailuresTotal
  .labels(coordinatorId: string, reason: 'connection' | 'timeout' | 'stale' | 'error')
  .inc(amount?: number)
```

**Labels**:
- `coordinator_id`: Coordinator identifier
- `reason`: Failure reason

**Example**:

```typescript
import { heartbeatFailuresTotal } from './observability/prometheus-metrics';

heartbeatFailuresTotal.labels('coordinator-1', 'stale').inc();
```

---

### timeoutEventsTotal

Counter tracking timeout events.

```typescript
timeoutEventsTotal
  .labels(coordinatorId: string, reason: 'heartbeat' | 'blocking' | 'external')
  .inc(amount?: number)
```

**Labels**:
- `coordinator_id`: Coordinator identifier
- `reason`: Timeout reason

**Example**:

```typescript
import { timeoutEventsTotal } from './observability/prometheus-metrics';

timeoutEventsTotal.labels('coordinator-1', 'blocking').inc();
```

---

## Type Definitions

### SignalType

```typescript
enum SignalType {
  COMPLETION = 'completion',
  RETRY_REQUEST = 'retry_request',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
  STATUS_UPDATE = 'status_update'
}
```

### CircuitState

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}
```

### CoordinatorTimeoutEvent

```typescript
interface CoordinatorTimeoutEvent {
  /** Coordinator ID that timed out */
  coordinatorId: string;

  /** Duration since last activity (ms) */
  timeoutDuration: number;

  /** Timestamp when timeout was detected */
  timestamp: number;

  /** Reason for timeout */
  reason: string;

  /** Optional metadata */
  metadata?: {
    lastHeartbeat?: number;
    iteration?: number;
    phase?: string;
  };
}
```

---

**Next Steps**:
- Review [Integration Examples](../integration/cfn-loop-examples.md) for usage examples
- See [Blocking Coordination Pattern Guide](../patterns/blocking-coordination-pattern.md) for architectural details
- Check [Failure Recovery Playbook](../operations/failure-recovery-playbook.md) for incident response
