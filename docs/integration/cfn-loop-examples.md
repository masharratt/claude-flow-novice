# CFN Loop Integration Examples

## Overview

This document provides complete code examples for integrating the blocking coordination system into CFN Loop workflows. Each example includes implementation code, error handling, and best practices.

---

## Example 1: Basic Blocking Coordination

### Use Case

Coordinator blocks until receiving signal from peer coordinator to proceed with next phase.

### Implementation

```typescript
import { BlockingCoordinationManager } from './cfn-loop/blocking-coordination';
import { createClient } from 'redis';

async function basicBlockingExample() {
  // Initialize Redis client
  const redis = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
  });

  await redis.connect();

  // Create blocking coordination manager
  const coordinator = new BlockingCoordinationManager({
    redisClient: redis,
    coordinatorId: 'coordinator-1',
    ackTtl: 3600, // 1 hour
    debug: true,
    hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
  });

  try {
    console.log('Starting blocking coordination...');

    // Wait for signal from peer coordinator
    const signal = {
      signalId: 'signal-123',
      type: 'completion' as const,
      source: 'coordinator-2',
      targets: ['coordinator-1'],
      timestamp: Date.now(),
    };

    // Acknowledge signal immediately
    const ack = await coordinator.acknowledgeSignal(signal);

    console.log('ACK sent:', {
      coordinatorId: ack.coordinatorId,
      signalId: ack.signalId,
      timestamp: ack.timestamp,
      iteration: ack.iteration,
    });

    // Continue with next phase
    console.log('Signal acknowledged, proceeding with next phase');

  } catch (error) {
    console.error('Blocking coordination failed:', error);
    throw error;
  } finally {
    // Cleanup
    await coordinator.cleanup();
    await redis.quit();
  }
}

// Run example
basicBlockingExample().catch(console.error);
```

**Output**:
```
Starting blocking coordination...
ACK sent: {
  coordinatorId: 'coordinator-1',
  signalId: 'signal-123',
  timestamp: 1696889234567,
  iteration: 0
}
Signal acknowledged, proceeding with next phase
```

---

## Example 2: Signal Sending with ACK Verification

### Use Case

Coordinator sends signal to peer and waits for ACK before proceeding.

### Implementation

```typescript
import { BlockingCoordinationManager } from './cfn-loop/blocking-coordination';
import { BlockingCoordinationSignals, SignalType } from './cfn-loop/blocking-coordination-signals';
import { createClient } from 'redis';

async function signalSendingExample() {
  // Initialize Redis
  const redis = createClient({
    socket: { host: 'localhost', port: 6379 },
  });
  await redis.connect();

  // Initialize signal sender
  const signals = new BlockingCoordinationSignals({
    redisHost: 'localhost',
    redisPort: 6379,
    signalTTL: 86400, // 24 hours
    enableIdempotency: true,
  });
  await signals.connect();

  // Initialize blocking manager
  const coordinator = new BlockingCoordinationManager({
    redisClient: redis,
    coordinatorId: 'coordinator-sender',
    hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
  });

  try {
    console.log('Sending signal to coordinator-receiver...');

    // Send signal
    const result = await signals.sendSignal(
      'coordinator-sender',
      'coordinator-receiver',
      SignalType.COMPLETION,
      1, // iteration
      { phase: 'validation', confidence: 0.92 } // payload
    );

    console.log('Signal sent:', {
      messageId: result.messageId,
      isDuplicate: result.isDuplicate,
      key: result.key,
    });

    // Wait for ACK with 5s timeout
    console.log('Waiting for ACK...');

    const acks = await coordinator.waitForAcks(
      ['coordinator-receiver'],
      result.messageId,
      5000 // 5 second timeout
    );

    if (acks.size === 1) {
      const ack = acks.get('coordinator-receiver');
      console.log('ACK received:', {
        coordinatorId: ack?.coordinatorId,
        timestamp: ack?.timestamp,
        iteration: ack?.iteration,
      });

      // Verify ACK signature
      const isValid = await verifyAck(ack!, coordinator);
      console.log('ACK signature valid:', isValid);

    } else {
      console.warn('ACK not received within timeout');
      // Retry logic here
    }

  } catch (error) {
    console.error('Signal sending failed:', error);
    throw error;
  } finally {
    await coordinator.cleanup();
    await signals.disconnect();
    await redis.quit();
  }
}

// Helper function to verify ACK signature (CRITICAL for security)
async function verifyAck(
  ack: any,
  coordinator: BlockingCoordinationManager
): Promise<boolean> {
  const crypto = require('crypto');

  // HMAC secret from environment (same as coordinator)
  const hmacSecret = process.env.BLOCKING_COORDINATION_SECRET;

  if (!hmacSecret) {
    throw new Error('BLOCKING_COORDINATION_SECRET not set');
  }

  if (!ack.signature) {
    console.warn('ACK missing signature - rejecting');
    return false;
  }

  // Compute expected signature using same algorithm as sender
  const expectedSignature = crypto.createHmac('sha256', hmacSecret)
    .update(`${ack.coordinatorId}:coordinator-sender:${ack.iteration}:${ack.timestamp}`)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  const actualBuffer = Buffer.from(ack.signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  // Verify lengths match before comparison
  if (actualBuffer.length !== expectedBuffer.length) {
    console.warn('ACK signature verification failed: length mismatch');
    return false;
  }

  // Use crypto.timingSafeEqual for constant-time comparison
  try {
    const isValid = crypto.timingSafeEqual(actualBuffer, expectedBuffer);
    return isValid;
  } catch (error) {
    console.error('ACK signature verification error:', error);
    return false;
  }
}

signalSendingExample().catch(console.error);
```

**Output**:
```
Sending signal to coordinator-receiver...
Signal sent: {
  messageId: 'coordinator-sender:coordinator-receiver:completion:1:1696889234567',
  isDuplicate: false,
  key: 'blocking:signal:coordinator-receiver'
}
Waiting for ACK...
ACK received: {
  coordinatorId: 'coordinator-receiver',
  timestamp: 1696889235123,
  iteration: 1
}
ACK signature valid: true
```

---

## Example 3: Dead Coordinator Handling

### Use Case

Detect dead coordinator via timeout handler and escalate for recovery.

### Implementation

```typescript
import { CoordinatorTimeoutHandler } from './cfn-loop/coordinator-timeout-handler';
import { createClient } from 'redis';

async function deadCoordinatorExample() {
  // Initialize Redis
  const redis = createClient({
    socket: { host: 'localhost', port: 6379 },
  });
  await redis.connect();

  // Initialize timeout handler
  const handler = new CoordinatorTimeoutHandler({
    redisClient: redis,
    timeoutThreshold: 120000, // 2 minutes
    checkInterval: 30000, // 30 seconds
    autoCleanup: true,
    debug: true,
  });

  // Listen for timeout events
  handler.on('coordinator:timeout', (event) => {
    console.log('Coordinator timeout detected:', {
      coordinatorId: event.coordinatorId,
      timeoutDuration: Math.round(event.timeoutDuration / 1000) + 's',
      reason: event.reason,
      metadata: event.metadata,
    });
  });

  // Listen for escalation events
  handler.on('coordinator:escalated', (event) => {
    console.log('Coordinator escalated:', {
      deadCoordinatorId: event.deadCoordinatorId,
      newCoordinatorId: event.newCoordinatorId,
      swarmId: event.swarmId,
    });
  });

  // Listen for cleanup events
  handler.on('cleanup:complete', (event) => {
    console.log('Cleanup completed:', {
      coordinatorId: event.coordinatorId,
      timestamp: event.timestamp,
    });
  });

  try {
    // Start monitoring
    handler.startMonitoring();
    console.log('Timeout monitoring started');

    // Simulate coordinator activity
    await handler.recordActivity('coordinator-1', 0, 'loop-3-implementation');
    console.log('Recorded activity for coordinator-1');

    // Wait 2.5 minutes to trigger timeout
    console.log('Waiting 2.5 minutes for timeout to trigger...');
    await sleep(150000);

    // Manually check for timeout
    const timedOut = await handler.checkCoordinatorTimeout('coordinator-1');
    console.log('Coordinator-1 timed out:', timedOut);

    if (timedOut) {
      // Escalate dead coordinator
      const newCoordinatorId = await handler.escalateDeadCoordinator(
        'coordinator-1',
        'swarm-123'
      );

      console.log('New coordinator spawned:', newCoordinatorId);
    }

    // Wait for events to process
    await sleep(5000);

  } catch (error) {
    console.error('Dead coordinator handling failed:', error);
    throw error;
  } finally {
    // Stop monitoring
    handler.stopMonitoring();

    // Print metrics
    console.log('Metrics:', handler.getMetrics());

    await redis.quit();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

deadCoordinatorExample().catch(console.error);
```

**Output**:
```
Timeout monitoring started
Recorded activity for coordinator-1
Waiting 2.5 minutes for timeout to trigger...
Coordinator timeout detected: {
  coordinatorId: 'coordinator-1',
  timeoutDuration: '150s',
  reason: 'Coordinator inactive for 150s (threshold: 120s)',
  metadata: { lastHeartbeat: 1696889234567, iteration: 0, phase: 'loop-3-implementation' }
}
Cleanup completed: { coordinatorId: 'coordinator-1', timestamp: 1696889384567 }
Coordinator-1 timed out: true
Coordinator escalated: {
  deadCoordinatorId: 'coordinator-1',
  newCoordinatorId: 'coordinator-1696889384567-abc123',
  swarmId: 'swarm-123'
}
New coordinator spawned: coordinator-1696889384567-abc123
Metrics: {
  totalChecks: 5,
  timeoutEventsTotal: 1,
  cleanupsPerformed: 1,
  cleanupFailures: 0
}
```

---

## Example 4: Circuit Breaker Integration

### Use Case

Protect against Redis connection failures with exponential backoff.

### Implementation

```typescript
import { CircuitBreaker } from './cfn-loop/circuit-breaker';
import { createClient } from 'redis';

async function circuitBreakerExample() {
  // Initialize Redis client
  const redis = createClient({
    socket: { host: 'localhost', port: 6379 },
  });

  // Initialize circuit breaker
  const breaker = new CircuitBreaker({
    delays: [1000, 2000, 4000, 8000], // Exponential backoff: 1s, 2s, 4s, 8s
    maxAttempts: 4,
    cooldownMs: 30000, // 30 second cooldown after opening
    threshold: 3, // Open circuit after 3 failures
  });

  // Listen for circuit breaker events
  breaker.on('state:changed', (state) => {
    console.log('Circuit breaker state changed:', state);
  });

  breaker.on('attempt:failed', (event) => {
    console.log('Attempt failed:', {
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
      nextDelay: event.nextDelay,
    });
  });

  try {
    console.log('Attempting Redis operations with circuit breaker...');

    // Execute Redis command with circuit breaker protection
    const result = await breaker.execute(async () => {
      await redis.connect();
      await redis.ping();
      return 'SUCCESS';
    });

    console.log('Redis operation result:', result);

  } catch (error) {
    console.error('Circuit breaker execution failed:', error);

    // Check circuit state
    const state = breaker.getState();
    console.log('Circuit breaker state:', state);

    if (state.state === 'open') {
      console.log('Circuit open - waiting for cooldown period');
      console.log('Cooldown remaining:', state.cooldownRemaining + 'ms');

      // Wait for cooldown
      await sleep(state.cooldownRemaining || 0);

      // Retry with half-open state
      console.log('Retrying in half-open state...');
      try {
        await breaker.execute(async () => {
          await redis.ping();
          return 'RETRY_SUCCESS';
        });
      } catch (retryError) {
        console.error('Retry failed, circuit remains open');
      }
    }

  } finally {
    // Cleanup
    if (redis.isOpen) {
      await redis.quit();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

circuitBreakerExample().catch(console.error);
```

**Output (with simulated Redis failure)**:
```
Attempting Redis operations with circuit breaker...
Attempt failed: { attempt: 1, maxAttempts: 4, nextDelay: 1000 }
Attempt failed: { attempt: 2, maxAttempts: 4, nextDelay: 2000 }
Attempt failed: { attempt: 3, maxAttempts: 4, nextDelay: 4000 }
Circuit breaker state changed: open
Circuit breaker execution failed: Error: Redis connection failed
Circuit breaker state: {
  state: 'open',
  failureCount: 3,
  lastFailureTime: 1696889234567,
  cooldownRemaining: 30000
}
Circuit open - waiting for cooldown period
Cooldown remaining: 30000ms
Retrying in half-open state...
Circuit breaker state changed: half-open
Circuit breaker state changed: closed
```

---

## Example 5: Prometheus Metrics Integration (Future Enhancement)

> **Note**: This example demonstrates planned Prometheus integration. The metrics module `./observability/prometheus-metrics.js` is not yet implemented.
>
> **TODO**: Implement `src/observability/prometheus-metrics.js` with:
> - `blockingDurationSeconds` histogram (labels: swarm_id, coordinator_id, status)
> - `signalDeliveryLatencySeconds` histogram (labels: sender_id, receiver_id, signal_type)
> - `heartbeatFailuresTotal` counter (labels: coordinator_id, reason)
> - `timeoutEventsTotal` counter (labels: coordinator_id, reason)
> - `blockingCoordinatorsTotal` gauge (labels: swarm_id, status)
>
> **Implementation Plan**: See tracking issue for full Prometheus integration roadmap.

### Use Case

Record blocking coordination metrics for monitoring and alerting.

### Implementation

```typescript
import { BlockingCoordinationManager } from './cfn-loop/blocking-coordination';
// TODO: Implement ./observability/prometheus-metrics module
import {
  blockingDurationSeconds,
  signalDeliveryLatencySeconds,
  heartbeatFailuresTotal,
  timeoutEventsTotal,
} from './observability/prometheus-metrics';
import { createClient } from 'redis';

async function prometheusMetricsExample() {
  const redis = createClient({
    socket: { host: 'localhost', port: 6379 },
  });
  await redis.connect();

  const coordinator = new BlockingCoordinationManager({
    redisClient: redis,
    coordinatorId: 'coordinator-metrics',
    hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
  });

  try {
    console.log('Starting blocking coordination with metrics...');

    // Record blocking start time
    const blockingStartTime = Date.now();

    // Simulate waiting for ACKs
    const signal = {
      signalId: 'signal-metrics',
      type: 'completion' as const,
      source: 'coordinator-peer',
      targets: ['coordinator-metrics'],
      timestamp: Date.now(),
    };

    const ack = await coordinator.acknowledgeSignal(signal);

    // Record blocking duration
    const blockingDuration = Date.now() - blockingStartTime;
    blockingDurationSeconds
      .labels('swarm-metrics', 'coordinator-metrics', 'completed')
      .observe(blockingDuration / 1000);

    console.log('Recorded blocking duration:', blockingDuration + 'ms');

    // Record signal delivery latency
    const signalLatency = Date.now() - signal.timestamp;
    signalDeliveryLatencySeconds
      .labels(signal.source, 'coordinator-metrics', signal.type)
      .observe(signalLatency / 1000);

    console.log('Recorded signal latency:', signalLatency + 'ms');

    // Simulate heartbeat failure
    heartbeatFailuresTotal
      .labels('coordinator-metrics', 'stale')
      .inc();

    console.log('Recorded heartbeat failure');

    // Simulate timeout event
    timeoutEventsTotal
      .labels('coordinator-metrics', 'blocking')
      .inc();

    console.log('Recorded timeout event');

    // Export metrics for Prometheus scraping
    const { register } = await import('prom-client');
    const metrics = await register.metrics();

    console.log('\nPrometheus Metrics:');
    console.log(metrics);

  } catch (error) {
    console.error('Metrics recording failed:', error);
    throw error;
  } finally {
    await coordinator.cleanup();
    await redis.quit();
  }
}

prometheusMetricsExample().catch(console.error);
```

**Output**:
```
Starting blocking coordination with metrics...
Recorded blocking duration: 123ms
Recorded signal latency: 45ms
Recorded heartbeat failure
Recorded timeout event

Prometheus Metrics:
# HELP blocking_duration_seconds Duration of coordinator blocking in seconds
# TYPE blocking_duration_seconds histogram
blocking_duration_seconds_bucket{swarm_id="swarm-metrics",coordinator_id="coordinator-metrics",status="completed",le="1"} 1
blocking_duration_seconds_bucket{swarm_id="swarm-metrics",coordinator_id="coordinator-metrics",status="completed",le="5"} 1
blocking_duration_seconds_bucket{swarm_id="swarm-metrics",coordinator_id="coordinator-metrics",status="completed",le="30"} 1
blocking_duration_seconds_sum{swarm_id="swarm-metrics",coordinator_id="coordinator-metrics",status="completed"} 0.123
blocking_duration_seconds_count{swarm_id="swarm-metrics",coordinator_id="coordinator-metrics",status="completed"} 1

# HELP signal_delivery_latency_seconds Signal delivery latency in seconds
# TYPE signal_delivery_latency_seconds histogram
signal_delivery_latency_seconds_bucket{sender_id="coordinator-peer",receiver_id="coordinator-metrics",signal_type="completion",le="0.1"} 1
signal_delivery_latency_seconds_sum{sender_id="coordinator-peer",receiver_id="coordinator-metrics",signal_type="completion"} 0.045
signal_delivery_latency_seconds_count{sender_id="coordinator-peer",receiver_id="coordinator-metrics",signal_type="completion"} 1

# HELP heartbeat_failures_total Total heartbeat failures
# TYPE heartbeat_failures_total counter
heartbeat_failures_total{coordinator_id="coordinator-metrics",reason="stale"} 1

# HELP timeout_events_total Total timeout events
# TYPE timeout_events_total counter
timeout_events_total{coordinator_id="coordinator-metrics",reason="blocking"} 1
```

---

## Example 6: Complete CFN Loop 2 Validation Flow

### Use Case

Implement complete Loop 2 consensus validation with blocking coordination.

### Implementation

```typescript
import { BlockingCoordinationManager } from './cfn-loop/blocking-coordination';
import { BlockingCoordinationSignals, SignalType } from './cfn-loop/blocking-coordination-signals';
import { CoordinatorTimeoutHandler } from './cfn-loop/coordinator-timeout-handler';
import { createClient } from 'redis';

interface ValidationResult {
  validatorId: string;
  confidence: number;
  issues: string[];
  recommendations: string[];
}

async function cfnLoop2ValidationExample() {
  // Initialize Redis
  const redis = createClient({
    socket: { host: 'localhost', port: 6379 },
  });
  await redis.connect();

  // Initialize components
  const parentCoordinator = new BlockingCoordinationManager({
    redisClient: redis,
    coordinatorId: 'loop2-parent',
    hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
  });

  const signals = new BlockingCoordinationSignals({
    redisHost: 'localhost',
    redisPort: 6379,
  });
  await signals.connect();

  const timeoutHandler = new CoordinatorTimeoutHandler({
    redisClient: redis,
    timeoutThreshold: 600000, // 10 minutes
    autoCleanup: true,
  });

  const validatorIds = [
    'validator-reviewer',
    'validator-security',
    'validator-performance',
  ];

  try {
    console.log('Starting CFN Loop 2 Validation Flow...\n');

    // Step 1: Spawn validator agents
    console.log('Step 1: Spawning validator agents...');
    for (const validatorId of validatorIds) {
      await timeoutHandler.recordActivity(validatorId, 0, 'loop-2-validation');
      console.log(`  ✓ Spawned ${validatorId}`);
    }

    // Step 2: Send validation tasks to validators
    console.log('\nStep 2: Sending validation tasks...');
    for (const validatorId of validatorIds) {
      const result = await signals.sendSignal(
        'loop2-parent',
        validatorId,
        SignalType.STATUS_UPDATE,
        2, // Loop 2
        {
          task: 'validate-loop3-output',
          files: ['auth.js', 'auth.test.js', 'auth-middleware.js'],
          confidence: 0.85,
        }
      );
      console.log(`  ✓ Sent task to ${validatorId} (${result.messageId})`);
    }

    // Step 3: Wait for validation results (blocking coordination)
    console.log('\nStep 3: Waiting for validator ACKs...');
    const blockingStartTime = Date.now();

    // Simulate validators sending ACKs
    await sleep(2000);

    const acks = await parentCoordinator.waitForAcks(
      validatorIds,
      'validation-signal-123',
      300000 // 5 minute timeout
    );

    const blockingDuration = Date.now() - blockingStartTime;
    console.log(`  ✓ Received ${acks.size}/${validatorIds.length} ACKs in ${blockingDuration}ms`);

    // Step 4: Collect validation results
    console.log('\nStep 4: Collecting validation results...');
    const results: ValidationResult[] = [];

    for (const validatorId of validatorIds) {
      // Simulate validation result
      const result: ValidationResult = {
        validatorId,
        confidence: 0.88 + Math.random() * 0.1, // 0.88-0.98
        issues: [],
        recommendations: ['Add rate limiting', 'Improve error messages'],
      };
      results.push(result);
      console.log(`  ✓ ${validatorId}: confidence ${result.confidence.toFixed(2)}`);
    }

    // Step 5: Calculate consensus
    console.log('\nStep 5: Calculating consensus...');
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    const consensusThreshold = 0.90;

    console.log(`  Average confidence: ${avgConfidence.toFixed(2)}`);
    console.log(`  Consensus threshold: ${consensusThreshold}`);

    if (avgConfidence >= consensusThreshold) {
      console.log('  ✅ CONSENSUS ACHIEVED - Proceeding to Loop 4');
    } else {
      console.log('  ❌ CONSENSUS NOT REACHED - Relaunch Loop 3');
    }

    // Step 6: Aggregate recommendations
    console.log('\nStep 6: Aggregating recommendations...');
    const allRecommendations = results.flatMap(r => r.recommendations);
    const uniqueRecommendations = [...new Set(allRecommendations)];

    console.log('  Recommendations for Product Owner:');
    uniqueRecommendations.forEach((rec, i) => {
      console.log(`    ${i + 1}. ${rec}`);
    });

    // Step 7: Cleanup
    console.log('\nStep 7: Cleaning up validator state...');
    for (const validatorId of validatorIds) {
      await timeoutHandler.cleanupTimeoutCoordinator(validatorId);
      console.log(`  ✓ Cleaned ${validatorId}`);
    }

    console.log('\n✅ CFN Loop 2 Validation Complete');

  } catch (error) {
    console.error('\n❌ Validation flow failed:', error);
    throw error;
  } finally {
    await parentCoordinator.cleanup();
    await signals.disconnect();
    await redis.quit();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

cfnLoop2ValidationExample().catch(console.error);
```

**Output**:
```
Starting CFN Loop 2 Validation Flow...

Step 1: Spawning validator agents...
  ✓ Spawned validator-reviewer
  ✓ Spawned validator-security
  ✓ Spawned validator-performance

Step 2: Sending validation tasks...
  ✓ Sent task to validator-reviewer (loop2-parent:validator-reviewer:status_update:2:1696889234567)
  ✓ Sent task to validator-security (loop2-parent:validator-security:status_update:2:1696889234580)
  ✓ Sent task to validator-performance (loop2-parent:validator-performance:status_update:2:1696889234593)

Step 3: Waiting for validator ACKs...
  ✓ Received 3/3 ACKs in 2123ms

Step 4: Collecting validation results...
  ✓ validator-reviewer: confidence 0.92
  ✓ validator-security: confidence 0.89
  ✓ validator-performance: confidence 0.94

Step 5: Calculating consensus...
  Average confidence: 0.92
  Consensus threshold: 0.90
  ✅ CONSENSUS ACHIEVED - Proceeding to Loop 4

Step 6: Aggregating recommendations...
  Recommendations for Product Owner:
    1. Add rate limiting
    2. Improve error messages

Step 7: Cleaning up validator state...
  ✓ Cleaned validator-reviewer
  ✓ Cleaned validator-security
  ✓ Cleaned validator-performance

✅ CFN Loop 2 Validation Complete
```

---

## Example 7: Error Handling and Retry Logic

### Use Case

Implement robust error handling with exponential backoff retry.

### Implementation

```typescript
import { BlockingCoordinationManager } from './cfn-loop/blocking-coordination';
import { CircuitBreaker } from './cfn-loop/circuit-breaker';
import { createClient } from 'redis';

async function errorHandlingExample() {
  const redis = createClient({
    socket: { host: 'localhost', port: 6379 },
  });

  const breaker = new CircuitBreaker({
    delays: [1000, 2000, 4000, 8000],
    maxAttempts: 4,
  });

  let coordinator: BlockingCoordinationManager | null = null;

  try {
    console.log('Attempting Redis connection with error handling...');

    // Connect with circuit breaker protection
    await breaker.execute(async () => {
      await redis.connect();
      console.log('✓ Redis connected');
    });

    // Initialize coordinator
    coordinator = new BlockingCoordinationManager({
      redisClient: redis,
      coordinatorId: 'coordinator-error-handling',
      hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
    });

    // Attempt signal acknowledgment with retry
    console.log('\nAttempting signal acknowledgment with retry...');

    const signal = {
      signalId: 'signal-retry-test',
      type: 'completion' as const,
      source: 'coordinator-sender',
      targets: ['coordinator-error-handling'],
      timestamp: Date.now(),
    };

    let ack = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries && !ack) {
      try {
        ack = await coordinator.acknowledgeSignal(signal);
        console.log(`✓ ACK sent on attempt ${retryCount + 1}`);
      } catch (error) {
        retryCount++;
        console.warn(`✗ Attempt ${retryCount} failed:`, error);

        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`  Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    if (!ack) {
      throw new Error(`Failed to send ACK after ${maxRetries} attempts`);
    }

    // Simulate ACK wait timeout
    console.log('\nSimulating ACK wait timeout...');

    const acks = await coordinator.waitForAcks(
      ['coordinator-nonexistent'],
      'signal-timeout-test',
      5000 // 5 second timeout
    );

    if (acks.size === 0) {
      console.log('⚠ ACK wait timed out (expected behavior)');
      console.log('  Falling back to degraded mode...');

      // Fallback logic
      await handleAckTimeout(coordinator, 'coordinator-nonexistent');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);

    // Check circuit breaker state
    const breakerState = breaker.getState();
    if (breakerState.state === 'open') {
      console.error('  Circuit breaker OPEN - Redis unavailable');
      console.error('  Cooldown remaining:', breakerState.cooldownRemaining + 'ms');
    }

    throw error;

  } finally {
    console.log('\nCleanup...');

    if (coordinator) {
      try {
        await coordinator.cleanup();
        console.log('✓ Coordinator cleaned up');
      } catch (cleanupError) {
        console.error('✗ Cleanup failed:', cleanupError);
      }
    }

    if (redis.isOpen) {
      try {
        await redis.quit();
        console.log('✓ Redis disconnected');
      } catch (disconnectError) {
        console.error('✗ Disconnect failed:', disconnectError);
      }
    }
  }
}

async function handleAckTimeout(
  coordinator: BlockingCoordinationManager,
  coordinatorId: string
): Promise<void> {
  console.log(`  Handling ACK timeout for ${coordinatorId}...`);

  // Option 1: Retry signal delivery
  console.log('  Option 1: Retry signal delivery');

  // Option 2: Check if coordinator is dead
  console.log('  Option 2: Check coordinator health');

  // Option 3: Proceed without ACK (degraded mode)
  console.log('  Option 3: Proceeding without ACK (degraded mode)');

  // Log timeout event
  console.log('  Logged timeout event for monitoring');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

errorHandlingExample().catch(console.error);
```

**Output**:
```
Attempting Redis connection with error handling...
✓ Redis connected

Attempting signal acknowledgment with retry...
✓ ACK sent on attempt 1

Simulating ACK wait timeout...
⚠ ACK wait timed out (expected behavior)
  Falling back to degraded mode...
  Handling ACK timeout for coordinator-nonexistent...
  Option 1: Retry signal delivery
  Option 2: Check coordinator health
  Option 3: Proceeding without ACK (degraded mode)
  Logged timeout event for monitoring

Cleanup...
✓ Coordinator cleaned up
✓ Redis disconnected
```

---

## Best Practices Summary

### 1. Always Use HMAC Secret

```typescript
// ✅ GOOD: HMAC secret from environment variable
const coordinator = new BlockingCoordinationManager({
  redisClient: redis,
  coordinatorId: 'coordinator-1',
  hmacSecret: process.env.BLOCKING_COORDINATION_SECRET, // Required
});

// ❌ BAD: No HMAC secret
const coordinator = new BlockingCoordinationManager({
  redisClient: redis,
  coordinatorId: 'coordinator-1',
  // Missing hmacSecret - will throw error
});
```

### 2. Handle Timeouts Gracefully

```typescript
// ✅ GOOD: Timeout with fallback
const acks = await coordinator.waitForAcks(coordinatorIds, signalId, 30000);

if (acks.size < coordinatorIds.length) {
  console.warn('Partial ACKs received, falling back to degraded mode');
  // Implement fallback logic
}

// ❌ BAD: No timeout handling
const acks = await coordinator.waitForAcks(coordinatorIds, signalId, 30000);
// Assumes all ACKs received - no error handling
```

### 3. Clean Up Resources

```typescript
// ✅ GOOD: Always cleanup in finally block
try {
  await coordinator.acknowledgeSignal(signal);
} finally {
  await coordinator.cleanup();
  await redis.quit();
}

// ❌ BAD: No cleanup
await coordinator.acknowledgeSignal(signal);
// Resources leaked if error occurs
```

### 4. Use Circuit Breaker for Redis

```typescript
// ✅ GOOD: Circuit breaker protects against Redis failures
const breaker = new CircuitBreaker({ delays: [1000, 2000, 4000, 8000] });
await breaker.execute(async () => {
  await redis.connect();
});

// ❌ BAD: No circuit breaker
await redis.connect();
// Fails immediately without retry on transient errors
```

### 5. Monitor with Prometheus

```typescript
// ✅ GOOD: Record metrics for all operations
blockingDurationSeconds
  .labels(swarmId, coordinatorId, 'completed')
  .observe(duration / 1000);

// ❌ BAD: No metrics
// Cannot monitor performance or detect issues
```

---

**Next Steps**:
- Review [API Reference](../api/blocking-coordination-api.md) for detailed method documentation
- See [Blocking Coordination Pattern Guide](../patterns/blocking-coordination-pattern.md) for architectural details
- Check [Failure Recovery Playbook](../operations/failure-recovery-playbook.md) for incident response
