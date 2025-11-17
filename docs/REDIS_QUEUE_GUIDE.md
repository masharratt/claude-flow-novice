# Redis Queue System - Operational Guide

**Part of Task 3.4: Redis Queue Consistency & Recovery**
**Integration Standardization Plan - Sprint 3**

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration](#configuration)
4. [Queue Operations](#queue-operations)
5. [Monitoring](#monitoring)
6. [Recovery Procedures](#recovery-procedures)
7. [Performance Tuning](#performance-tuning)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

## Overview

The Redis Queue System provides reliable message queue operations with at-least-once delivery guarantees, automatic retry, and failure recovery for Docker agent ↔ Redis communication.

### Key Features

- **Idempotent enqueue**: Prevents duplicate messages using SHA256 fingerprinting
- **Acknowledgment protocol**: Ensures messages are processed exactly once
- **Visibility timeout**: Prevents duplicate processing of in-flight messages
- **Dead letter queue**: Captures failed messages for manual review
- **Automatic retry**: Exponential backoff for transient failures
- **Crash recovery**: Detects and recovers stuck messages after coordinator crashes
- **Performance**: <100ms per operation target

### Components

1. **MessageDeduplicator** (`src/lib/message-deduplicator.ts`)
   - SHA256-based message fingerprinting
   - Deduplication window (default 1 hour)
   - Automatic cleanup of expired keys

2. **RedisQueueManager** (`src/lib/redis-queue-manager.ts`)
   - Core queue operations (enqueue, dequeue, acknowledge, reject)
   - Multiple queue support
   - Queue monitoring and statistics

3. **QueueRecovery** (`src/lib/queue-recovery.ts`)
   - Dead letter queue management
   - Stuck message detection and recovery
   - Coordinator crash recovery

## Architecture

### Message Flow

```
┌─────────────┐
│  Producer   │
└─────┬───────┘
      │ enqueue()
      ▼
┌─────────────────────────────────────┐
│   Message Deduplicator              │
│   - Check for duplicates (SHA256)   │
│   - Mark as processed (TTL)         │
└─────┬───────────────────────────────┘
      │ (if unique)
      ▼
┌─────────────────────────────────────┐
│   Queue (Redis List)                │
│   - FIFO order                      │
│   - Persistent storage              │
└─────┬───────────────────────────────┘
      │ dequeue()
      ▼
┌─────────────────────────────────────┐
│   Processing Set                    │
│   - Visibility timeout              │
│   - In-flight tracking              │
└─────┬───────────────────────────────┘
      │
      ▼
┌─────────────┐
│  Consumer   │ ─────┐
└─────────────┘      │
                     │
      ┌──────────────┴──────────────┐
      │                             │
      ▼                             ▼
acknowledge()                 reject()
      │                             │
      ▼                             ▼
┌──────────┐               ┌────────────────┐
│ Complete │               │ Retry or DLQ   │
└──────────┘               └────────────────┘
```

### Redis Data Structures

#### Queue Storage
- **Key**: `queue:{queue-name}`
- **Type**: List
- **Operations**: RPUSH (enqueue), LMOVE (dequeue)

#### Processing Set
- **Key**: `queue:{queue-name}:processing`
- **Type**: List
- **Purpose**: Track messages being processed

#### In-Flight Storage
- **Key**: `inflight:{message-id}`
- **Type**: String (JSON)
- **TTL**: Visibility timeout (default 30s)

#### Deduplication Keys
- **Key**: `dedup:{sha256-hash}`
- **Type**: String (JSON)
- **TTL**: Deduplication window (default 1h)

## Configuration

### Basic Setup

```typescript
import { createClient } from 'redis';
import { RedisQueueManager, QueueRecovery } from './src/lib';

// Create Redis client
const redis = await createClient({
  url: 'redis://localhost:6379',
  socket: {
    connectTimeout: 5000,
  },
}).connect();

// Create queue manager
const queueManager = new RedisQueueManager(redis);

// Create recovery system
const recovery = new QueueRecovery(queueManager, redis, {
  maxRetries: 3,
  processingTimeoutMs: 300000, // 5 minutes
  monitoringIntervalMs: 60000, // 1 minute
  deadLetterQueue: 'dlq',
});
```

### Deduplication Options

```typescript
import { MessageDeduplicator } from './src/lib/message-deduplicator';

const deduplicator = new MessageDeduplicator(redis, {
  windowMs: 3600000, // 1 hour deduplication window
  keyPrefix: 'dedup:', // Redis key prefix
  autoCleanup: true, // Automatic cleanup of expired keys
  cleanupIntervalMs: 300000, // 5 minutes cleanup interval
  maxRetries: 3, // Redis operation retries
});
```

### Recovery Options

```typescript
const recovery = new QueueRecovery(queueManager, redis, {
  maxRetries: 3, // Maximum retry attempts
  baseRetryDelayMs: 1000, // Base retry delay (1 second)
  maxRetryDelayMs: 60000, // Maximum retry delay (60 seconds)
  processingTimeoutMs: 300000, // Message processing timeout (5 minutes)
  monitoringIntervalMs: 60000, // Monitoring interval (1 minute)
  deadLetterQueue: 'dlq', // Dead letter queue name
  autoReprocess: false, // Automatic DLQ reprocessing
});
```

## Queue Operations

### Producer Pattern

```typescript
// Enqueue message with deduplication
const messageId = await queueManager.enqueue(
  'task-queue',
  {
    taskId: 'task-001',
    agentType: 'backend-developer',
    payload: {
      action: 'implement-feature',
      details: { ... },
    },
  },
  {
    deduplicate: true, // Enable deduplication
    metadata: {
      priority: 'high',
      source: 'api',
    },
    visibilityTimeout: 30000, // 30 seconds
  }
);

console.log(`Message enqueued: ${messageId}`);
```

### Consumer Pattern

```typescript
// Dequeue and process message
while (true) {
  const message = await queueManager.dequeue(
    'task-queue',
    {
      timeout: 5000, // Block for up to 5 seconds
      visibilityTimeout: 30000, // 30 second visibility timeout
    }
  );

  if (!message) {
    continue; // No messages available
  }

  try {
    // Process message
    await processTask(message.payload);

    // Acknowledge successful processing
    await queueManager.acknowledge(message.id);

    console.log(`Message processed: ${message.id}`);
  } catch (error) {
    console.error(`Processing failed: ${error.message}`);

    // Reject with retry
    await queueManager.reject(message.id, {
      retry: true,
      error: error.message,
      metadata: {
        errorType: error.constructor.name,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
```

### Batch Operations

```typescript
// Batch enqueue
const messages = [
  { taskId: 'task-001', data: 'foo' },
  { taskId: 'task-002', data: 'bar' },
  { taskId: 'task-003', data: 'baz' },
];

for (const payload of messages) {
  await queueManager.enqueue('task-queue', payload);
}

// Batch dequeue
const dequeueCount = 10;
const dequeuedMessages = [];

for (let i = 0; i < dequeueCount; i++) {
  const message = await queueManager.dequeue('task-queue', { timeout: 0 });
  if (!message) break;
  dequeuedMessages.push(message);
}
```

## Monitoring

### Queue Statistics

```typescript
// Get queue statistics
const stats = await queueManager.getStats('task-queue');

console.log(`Queue: ${stats.queue}`);
console.log(`Depth: ${stats.depth} messages`);
console.log(`In-flight: ${stats.inFlight} messages`);
console.log(`Oldest message: ${stats.oldestMessageAge}s`);
console.log(`Total enqueued: ${stats.totalEnqueued}`);
console.log(`Total dequeued: ${stats.totalDequeued}`);
console.log(`Total acknowledged: ${stats.totalAcknowledged}`);
console.log(`Total rejected: ${stats.totalRejected}`);
console.log(`Throughput: ${stats.throughput.toFixed(2)} msg/s`);
```

### Deduplication Statistics

```typescript
// Get deduplication statistics
const dedupStats = await deduplicator.getStats();

console.log(`Total processed: ${dedupStats.totalProcessed}`);
console.log(`Duplicates detected: ${dedupStats.duplicatesDetected}`);
console.log(`Unique messages: ${dedupStats.uniqueMessages}`);
console.log(`Deduplication rate: ${(dedupStats.deduplicationRate * 100).toFixed(2)}%`);
console.log(`Active fingerprints: ${dedupStats.activeFingerprints}`);
```

### Recovery Statistics

```typescript
// Get recovery statistics
const recoveryStats = recovery.getStats();

console.log(`Total recovered: ${recoveryStats.totalRecovered}`);
console.log(`Total dead lettered: ${recoveryStats.totalDeadLettered}`);
console.log(`Total reprocessed: ${recoveryStats.totalReprocessed}`);
console.log(`Total stuck detected: ${recoveryStats.totalStuckDetected}`);
console.log(`Last recovery: ${recoveryStats.lastRecoveryAt?.toISOString()}`);
```

### Monitoring Dashboard

```typescript
// Periodic monitoring
setInterval(async () => {
  const queues = await queueManager.getQueues();

  console.log('\n=== Queue Monitoring Dashboard ===');

  for (const queue of queues) {
    const stats = await queueManager.getStats(queue);

    console.log(`\n${queue}:`);
    console.log(`  Depth: ${stats.depth}`);
    console.log(`  In-flight: ${stats.inFlight}`);
    console.log(`  Oldest: ${stats.oldestMessageAge}s`);
    console.log(`  Throughput: ${stats.throughput.toFixed(2)} msg/s`);

    // Alert on high queue depth
    if (stats.depth > 1000) {
      console.warn(`  ⚠️  HIGH QUEUE DEPTH ALERT`);
    }

    // Alert on old messages
    if (stats.oldestMessageAge > 3600) {
      console.warn(`  ⚠️  OLD MESSAGE ALERT (${stats.oldestMessageAge}s)`);
    }
  }

  const recoveryStats = recovery.getStats();
  console.log(`\nRecovery:`);
  console.log(`  Recovered: ${recoveryStats.totalRecovered}`);
  console.log(`  Dead lettered: ${recoveryStats.totalDeadLettered}`);
  console.log(`  Stuck detected: ${recoveryStats.totalStuckDetected}`);
}, 60000); // Every minute
```

## Recovery Procedures

### Automatic Recovery

```typescript
// Start automatic monitoring and recovery
recovery.startMonitoring();

// Monitoring will:
// 1. Detect stuck messages (exceeding processing timeout)
// 2. Recover stuck messages (retry or send to DLQ)
// 3. Auto-reprocess DLQ if enabled
```

### Manual Crash Recovery

```typescript
// Recover from coordinator crash
const results = await recovery.recoverFromCrash();

console.log('Crash recovery results:');
for (const [queue, recoveredCount] of Object.entries(results)) {
  console.log(`  ${queue}: ${recoveredCount} messages recovered`);
}
```

### Stuck Message Recovery

```typescript
// Recover stuck messages from specific queue
const recoveredCount = await recovery.recoverStuckMessages('task-queue');

console.log(`Recovered ${recoveredCount} stuck messages`);
```

### Dead Letter Queue Processing

```typescript
// Manual DLQ processing
const reprocessedCount = await recovery.reprocessDeadLetters(
  async (payload, metadata) => {
    console.log(`Reprocessing message from ${metadata.originalQueue}`);
    console.log(`Failure reason: ${metadata.failureReason}`);
    console.log(`Retry attempts: ${metadata.retryAttempts}`);

    // Re-enqueue to original queue
    await queueManager.enqueue(metadata.originalQueue, payload, {
      deduplicate: false,
      metadata: {
        ...metadata,
        reprocessedAt: new Date().toISOString(),
      },
    });
  },
  100 // Maximum messages to reprocess
);

console.log(`Reprocessed ${reprocessedCount} messages from DLQ`);
```

### Retry with Backoff

```typescript
// Retry message processing with exponential backoff
const message = await queueManager.dequeue('task-queue');

if (message) {
  try {
    const result = await recovery.retryWithBackoff(
      message,
      async (payload) => {
        // Process message
        return await processTask(payload);
      }
    );

    await queueManager.acknowledge(message.id);
  } catch (error) {
    // Message sent to DLQ after max retries
    console.error(`Message failed permanently: ${error.message}`);
  }
}
```

## Performance Tuning

### Target Performance

- **Enqueue**: <100ms per operation
- **Dequeue**: <100ms per operation
- **Acknowledge**: <50ms per operation
- **Deduplication**: <50ms per check

### Optimization Strategies

#### 1. Batch Operations

```typescript
// Use batch operations for bulk enqueue
const messages = generateMessages(1000);

// Instead of individual enqueues
// for (const msg of messages) {
//   await queueManager.enqueue('queue', msg);
// }

// Use batch processing
const batchSize = 100;
for (let i = 0; i < messages.length; i += batchSize) {
  const batch = messages.slice(i, i + batchSize);

  await Promise.all(
    batch.map(msg => queueManager.enqueue('queue', msg))
  );
}
```

#### 2. Disable Deduplication for High-Throughput Queues

```typescript
// For queues that don't need deduplication
await queueManager.enqueue('high-throughput-queue', payload, {
  deduplicate: false, // Skip deduplication overhead
});
```

#### 3. Adjust Visibility Timeout

```typescript
// Use shorter visibility timeout for fast-processing messages
await queueManager.dequeue('fast-queue', {
  visibilityTimeout: 5000, // 5 seconds (default: 30s)
});

// Use longer visibility timeout for slow-processing messages
await queueManager.dequeue('slow-queue', {
  visibilityTimeout: 300000, // 5 minutes
});
```

#### 4. Connection Pooling

```typescript
// Use Redis connection pooling for concurrent workers
const redisPool = await createRedisPool({
  url: 'redis://localhost:6379',
  poolSize: 10, // 10 concurrent connections
});

const queueManagers = Array.from({ length: 10 }, () =>
  new RedisQueueManager(redisPool.acquire())
);
```

#### 5. Monitoring Overhead

```typescript
// Reduce monitoring frequency for large-scale deployments
const recovery = new QueueRecovery(queueManager, redis, {
  monitoringIntervalMs: 300000, // 5 minutes instead of 1 minute
});
```

## Troubleshooting

### Issue: High Queue Depth

**Symptoms:**
- Queue depth growing continuously
- Oldest message age increasing

**Diagnosis:**
```typescript
const stats = await queueManager.getStats('problem-queue');

console.log(`Depth: ${stats.depth}`);
console.log(`Throughput: ${stats.throughput} msg/s`);
console.log(`Oldest: ${stats.oldestMessageAge}s`);
```

**Solutions:**
1. Scale consumers (add more workers)
2. Optimize message processing time
3. Use batch dequeue for efficiency
4. Check for stuck messages

### Issue: Duplicate Messages

**Symptoms:**
- Messages processed multiple times
- Deduplication not working

**Diagnosis:**
```typescript
const dedupStats = await deduplicator.getStats();

console.log(`Deduplication rate: ${dedupStats.deduplicationRate}`);
console.log(`Active fingerprints: ${dedupStats.activeFingerprints}`);
```

**Solutions:**
1. Verify deduplication is enabled:
   ```typescript
   await queueManager.enqueue('queue', payload, { deduplicate: true });
   ```
2. Check deduplication window:
   ```typescript
   const deduplicator = new MessageDeduplicator(redis, {
     windowMs: 3600000, // Increase if messages arrive slowly
   });
   ```
3. Verify Redis key expiration:
   ```typescript
   const fingerprint = await deduplicator.getFingerprint(message);
   console.log(`Expires at: ${fingerprint?.expiresAt}`);
   ```

### Issue: Messages Stuck in Processing

**Symptoms:**
- High in-flight count
- Messages not being acknowledged

**Diagnosis:**
```typescript
const stats = await queueManager.getStats('stuck-queue');

console.log(`In-flight: ${stats.inFlight}`);
console.log(`Processing timeout: ${recovery.options.processingTimeoutMs}ms`);
```

**Solutions:**
1. Manual recovery:
   ```typescript
   await recovery.recoverStuckMessages('stuck-queue');
   ```
2. Adjust processing timeout:
   ```typescript
   const recovery = new QueueRecovery(queueManager, redis, {
     processingTimeoutMs: 600000, // Increase to 10 minutes
   });
   ```
3. Enable automatic monitoring:
   ```typescript
   recovery.startMonitoring();
   ```

### Issue: Dead Letter Queue Growing

**Symptoms:**
- DLQ depth increasing
- Messages failing permanently

**Diagnosis:**
```typescript
const dlqStats = await queueManager.getStats('dlq');
const recoveryStats = recovery.getStats();

console.log(`DLQ depth: ${dlqStats.depth}`);
console.log(`Total dead lettered: ${recoveryStats.totalDeadLettered}`);

// Inspect DLQ messages
const dlqMessage = await queueManager.dequeue('dlq');
console.log(`Failure reason: ${dlqMessage?.metadata?.failureReason}`);
console.log(`Retry attempts: ${dlqMessage?.metadata?.retryAttempts}`);
```

**Solutions:**
1. Analyze failure patterns
2. Fix underlying processing issues
3. Manually reprocess DLQ:
   ```typescript
   await recovery.reprocessDeadLetters(async (payload, metadata) => {
     // Fix and reprocess
   });
   ```
4. Purge DLQ if messages are invalid:
   ```typescript
   await queueManager.purge('dlq');
   ```

### Issue: Performance Degradation

**Symptoms:**
- Operations taking >100ms
- Slow enqueue/dequeue

**Diagnosis:**
```typescript
// Measure operation time
const startTime = Date.now();
await queueManager.enqueue('queue', payload);
const duration = Date.now() - startTime;

console.log(`Enqueue duration: ${duration}ms`);
```

**Solutions:**
1. Check Redis latency:
   ```bash
   redis-cli --latency
   ```
2. Disable deduplication for high-throughput queues
3. Use batch operations
4. Optimize Redis configuration (persistence, memory)
5. Scale Redis (cluster mode)

## Best Practices

### 1. Always Use Acknowledgment Protocol

```typescript
// ✅ GOOD
const message = await queueManager.dequeue('queue');
try {
  await processMessage(message.payload);
  await queueManager.acknowledge(message.id);
} catch (error) {
  await queueManager.reject(message.id, { retry: true });
}

// ❌ BAD - No acknowledgment
const message = await queueManager.dequeue('queue');
await processMessage(message.payload);
// Message lost if process crashes!
```

### 2. Set Appropriate Visibility Timeouts

```typescript
// ✅ GOOD - Match timeout to processing time
await queueManager.dequeue('queue', {
  visibilityTimeout: 60000, // 60s for 30s avg processing time
});

// ❌ BAD - Timeout too short
await queueManager.dequeue('queue', {
  visibilityTimeout: 5000, // 5s for 30s processing = stuck messages
});
```

### 3. Enable Deduplication for Critical Queues

```typescript
// ✅ GOOD - Deduplication for financial transactions
await queueManager.enqueue('payment-queue', payment, {
  deduplicate: true,
});

// ✅ OK - Skip deduplication for logs/metrics
await queueManager.enqueue('metrics-queue', metric, {
  deduplicate: false,
});
```

### 4. Monitor Queue Health

```typescript
// ✅ GOOD - Regular monitoring
setInterval(async () => {
  const stats = await queueManager.getStats('critical-queue');

  if (stats.depth > 1000) {
    alertOps('High queue depth', stats);
  }

  if (stats.oldestMessageAge > 3600) {
    alertOps('Old messages detected', stats);
  }
}, 60000);
```

### 5. Use Recovery for Long-Running Processes

```typescript
// ✅ GOOD - Start monitoring for production
recovery.startMonitoring();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  recovery.stopMonitoring();
  queueManager.shutdown();
  await redis.quit();
});
```

### 6. Handle Errors Gracefully

```typescript
// ✅ GOOD - Distinguish retryable vs permanent errors
try {
  await processMessage(message.payload);
  await queueManager.acknowledge(message.id);
} catch (error) {
  if (isRetryableError(error)) {
    // Retry transient errors
    await queueManager.reject(message.id, { retry: true, error: error.message });
  } else {
    // Don't retry permanent errors
    await queueManager.reject(message.id, { retry: false, error: error.message });
  }
}
```

### 7. Use Dead Letter Queue for Manual Review

```typescript
// ✅ GOOD - Regularly review DLQ
setInterval(async () => {
  const dlqStats = await queueManager.getStats('dlq');

  if (dlqStats.depth > 100) {
    notifyTeam('DLQ requires attention', dlqStats);
  }
}, 3600000); // Hourly check
```

### 8. Clean Up Resources

```typescript
// ✅ GOOD - Clean shutdown
async function shutdown() {
  recovery.stopMonitoring();
  queueManager.shutdown(); // Stops deduplicator auto-cleanup
  await redis.quit();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

## Integration Examples

### Docker Agent Task Queue

```typescript
// Coordinator enqueues tasks
await queueManager.enqueue('agent-tasks', {
  taskId: 'task-001',
  agentType: 'backend-developer',
  iteration: 1,
  context: {
    requirements: '...',
    files: ['src/auth.ts'],
  },
});

// Docker agent dequeues and processes
const message = await queueManager.dequeue('agent-tasks', {
  timeout: 30000,
  visibilityTimeout: 300000, // 5 minutes for agent work
});

if (message) {
  try {
    const result = await executeAgent(message.payload);

    await queueManager.enqueue('agent-results', result);
    await queueManager.acknowledge(message.id);
  } catch (error) {
    await queueManager.reject(message.id, { retry: true });
  }
}
```

### Coordination Queue

```typescript
// Agent coordination via queue
await queueManager.enqueue('coordination-queue', {
  type: 'broadcast',
  message: 'gate-passed',
  taskId: 'task-001',
  iteration: 1,
});

// Validators wait for coordination
const coordination = await queueManager.dequeue('coordination-queue', {
  timeout: 60000, // Block for up to 1 minute
});

if (coordination?.payload.message === 'gate-passed') {
  // Start validation work
}
```

## Appendix

### Redis Key Patterns

| Pattern | Type | Purpose | TTL |
|---------|------|---------|-----|
| `queue:{name}` | List | Main queue storage | None |
| `queue:{name}:processing` | List | In-flight messages | None |
| `inflight:{msg-id}` | String | Message metadata | Visibility timeout |
| `dedup:{hash}` | String | Deduplication tracking | Deduplication window |

### Error Codes

| Code | Meaning | Retry? |
|------|---------|--------|
| `DB_DUPLICATE_KEY` | Duplicate message detected | No |
| `DB_QUERY_FAILED` | Redis operation failed | Yes |
| `DB_TIMEOUT` | Redis timeout | Yes |
| `RETRY_EXHAUSTED` | Max retries exceeded | No |
| `NETWORK_ERROR` | Network failure | Yes |

### Performance Benchmarks

| Operation | Target | Typical | Notes |
|-----------|--------|---------|-------|
| Enqueue | <100ms | 10-50ms | Without deduplication |
| Enqueue (dedup) | <100ms | 20-80ms | With deduplication |
| Dequeue | <100ms | 10-50ms | Non-blocking |
| Acknowledge | <50ms | 5-20ms | - |
| Reject | <50ms | 10-30ms | - |

---

**Last Updated:** 2025-11-16
**Version:** 1.0.0
**Maintainer:** Backend Development Team
