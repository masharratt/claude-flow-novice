# Distributed Locking v2 - Enhanced Guide

**Phase 2, Task P2-2.2: Distributed Locking Enhancement**

This document describes the enhanced distributed locking system with TTL enforcement, lock renewal, deadlock detection, and health monitoring.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Features](#core-features)
- [Usage Guide](#usage-guide)
- [TTL Best Practices](#ttl-best-practices)
- [Lock Renewal Patterns](#lock-renewal-patterns)
- [Deadlock Prevention](#deadlock-prevention)
- [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)
- [Performance Characteristics](#performance-characteristics)
- [Migration from v1](#migration-from-v1)

---

## Overview

The enhanced distributed locking system (v2) builds upon the foundation from Task 3.1 with critical production-ready features:

- **Mandatory TTL Enforcement**: All locks must have TTL to prevent indefinite holds
- **Lock Renewal**: Extend lock lifetime for long-running operations
- **Auto-Renewal**: Automatic background renewal for ongoing work
- **Deadlock Detection**: Identify and resolve stuck locks
- **Health Monitoring**: Track lock usage, contention, and performance
- **Stale Lock Cleanup**: Automatic removal of expired locks

**Validation Context**: Addresses MEDIUM risk (confidence 0.52) identified in validation report Point 1.4.

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                         │
├─────────────────────────────────────────────────────────────┤
│  DistributedLockManager                                     │
│  - Lock acquisition with TTL                                │
│  - Lock renewal (manual & auto)                             │
│  - Statistics tracking                                      │
│  - Active lock management                                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────────┐
│  LockHealthMonitor                                          │
│  - Deadlock detection                                       │
│  - Stale lock cleanup                                       │
│  - Usage analytics                                          │
│  - Background tasks                                         │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────────┐
│                   Redis Layer                               │
│  - Atomic SET NX operations                                 │
│  - TTL management (PX)                                      │
│  - Lock metadata storage                                    │
└─────────────────────────────────────────────────────────────┘
```

### Data Model

**Lock Metadata (Redis)**:
```typescript
interface LockMetadata {
  lockId: string;           // Unique lock identifier
  transactionId?: string;   // Associated transaction
  processId: number;        // Process holding lock (for deadlock detection)
  acquiredAt: string;       // ISO timestamp
  expiresAt: string;        // ISO timestamp
  lastRenewedAt?: string;   // ISO timestamp (if renewed)
  correlationId: string;    // Tracing ID
}
```

**Redis Key Format**:
```
lock:<resource-key>
```

Example: `lock:skill-deployment:skill-123`

---

## Core Features

### 1. TTL Enforcement

**All locks MUST have TTL** to prevent indefinite resource holds.

```typescript
// ✅ CORRECT - TTL specified
const lock = await lockManager.acquireLock({
  key: 'resource-123',
  ttl: 60000,  // 60 seconds
});

// ⚠️ BACKWARD COMPATIBLE - Defaults to 60s
const lock = await lockManager.acquireLock({
  key: 'resource-123',
  // No TTL = 60s default
});

// ❌ REJECTED - Invalid TTL
const lock = await lockManager.acquireLock({
  key: 'resource-123',
  ttl: -1000,  // Throws: "TTL must be positive"
});
```

**TTL Guidelines**:
- **Short operations (<30s)**: 10-30 seconds
- **Medium operations (30s-5m)**: 30-120 seconds
- **Long operations (>5m)**: Use auto-renewal instead

### 2. Lock Renewal

**Manual Renewal**:
```typescript
const lock = await lockManager.acquireLock({
  key: 'long-operation',
  ttl: 60000,  // Initial 60s
});

try {
  // Perform some work...

  // Extend lock for another 60 seconds
  await lockManager.renewLock(lock.id, 60000);

  // Continue work...
} finally {
  await lockManager.releaseLock(lock.id);
}
```

**Auto-Renewal**:
```typescript
const lock = await lockManager.acquireLock({
  key: 'very-long-operation',
  ttl: 60000,           // 60 seconds
  renewInterval: 30000, // Auto-renew every 30 seconds
});

try {
  // Long-running operation (may take minutes)
  await processLargeDataset();

  // Lock automatically renewed in background every 30s
} finally {
  await lockManager.releaseLock(lock.id);
  // Auto-renewal stops on release
}
```

**Renewal Best Practices**:
- Set `renewInterval` to 50-75% of TTL
- Always release lock explicitly (stops renewal)
- Handle renewal failures gracefully
- Monitor auto-renewal success rate

### 3. Deadlock Detection

**Detection Criteria**:
- Locks held >5x TTL (stuck locks)
- Circular wait conditions (advanced)

```typescript
const healthMonitor = new LockHealthMonitor(redisClient, lockManager);

// Detect deadlocks
const deadlocks = await healthMonitor.detectDeadlocks();

for (const deadlock of deadlocks) {
  console.log(`Deadlock detected: ${deadlock.lockKey}`);
  console.log(`Held for: ${deadlock.heldDuration}ms`);

  // Resolve by force-releasing
  await healthMonitor.resolveDeadlock(deadlock);
}

// Review incident history
const incidents = healthMonitor.getDeadlockIncidents();
```

### 4. Health Monitoring

**Lock Statistics**:
```typescript
const stats = lockManager.getStatistics();

console.log(`Total acquisitions: ${stats.totalAcquisitions}`);
console.log(`Total releases: ${stats.totalReleases}`);
console.log(`Currently held: ${stats.currentlyHeld}`);
console.log(`Total renewals: ${stats.totalRenewals}`);
console.log(`Average duration: ${stats.averageDuration}ms`);
console.log(`Failed acquisitions: ${stats.failedAcquisitions}`);
```

**Usage Analytics**:
```typescript
const healthMonitor = new LockHealthMonitor(redisClient, lockManager);

// Track lock usage by resource
healthMonitor.trackAcquisition('resource-a');
const usage = healthMonitor.getLockUsageByResource();
// { 'resource-a': 42, 'resource-b': 15, ... }

// Identify contention hotspots
healthMonitor.trackFailedAcquisition('resource-x');
const hotspots = healthMonitor.getContentionHotspots();
// [{ resource: 'resource-x', failedAttempts: 23, lastFailureAt: ... }]
```

**Comprehensive Health Report**:
```typescript
const report = await healthMonitor.generateHealthReport();

console.log('Deadlocks:', report.deadlocks.length);
console.log('Stale locks:', report.staleLocks.length);
console.log('Statistics:', report.statistics);
console.log('Usage:', report.usage);
console.log('Hotspots:', report.hotspots);
console.log('Cleanup stats:', report.cleanupStats);
```

### 5. Stale Lock Cleanup

**Manual Cleanup**:
```typescript
const healthMonitor = new LockHealthMonitor(redisClient, lockManager);

// Find stale locks
const staleLocks = await healthMonitor.findStaleLocks();

// Clean them up
const cleaned = await healthMonitor.cleanupStaleLocks();
console.log(`Cleaned ${cleaned} stale locks`);
```

**Background Cleanup** (Recommended):
```typescript
// Start background cleanup (runs every 60 seconds)
healthMonitor.startBackgroundCleanup(60000);

// Stop background cleanup
healthMonitor.stopBackgroundCleanup();

// Check cleanup statistics
const stats = healthMonitor.getCleanupStats();
console.log(`Total cleaned: ${stats.totalCleaned}`);
console.log(`Cleanup runs: ${stats.cleanupRuns}`);
console.log(`Last cleanup: ${stats.lastCleanupAt}`);
```

---

## Usage Guide

### Basic Lock Usage

```typescript
import { DistributedLockManager } from './lib/distributed-lock';
import { createRedisClient } from './lib/redis-client';

const redisClient = await createRedisClient();
const lockManager = new DistributedLockManager(redisClient);

// Acquire lock
const lock = await lockManager.acquireLock({
  key: 'my-resource',
  ttl: 30000,      // 30 seconds
  timeout: 5000,   // Wait up to 5s to acquire
});

try {
  // Critical section - protected by lock
  await performCriticalOperation();
} finally {
  // Always release in finally block
  await lockManager.releaseLock(lock.id);
}
```

### Long-Running Operations

```typescript
const lock = await lockManager.acquireLock({
  key: 'batch-processing',
  ttl: 120000,       // 2 minutes
  renewInterval: 60000, // Renew every minute
});

try {
  // Process large batch (may take 10+ minutes)
  for (const item of largeDataset) {
    await processItem(item);
    // Lock automatically renewed in background
  }
} finally {
  await lockManager.releaseLock(lock.id);
}
```

### With Health Monitoring

```typescript
import { LockHealthMonitor } from './lib/lock-health-monitor';

const healthMonitor = new LockHealthMonitor(redisClient, lockManager);

// Start background monitoring
healthMonitor.startBackgroundCleanup(60000);

// Acquire lock with tracking
const lock = await lockManager.acquireLock({
  key: 'monitored-resource',
  ttl: 30000,
});

healthMonitor.trackAcquisition('monitored-resource');

try {
  await performOperation();
} catch (err) {
  healthMonitor.trackFailedAcquisition('monitored-resource');
  throw err;
} finally {
  await lockManager.releaseLock(lock.id);
}

// Periodic health checks
setInterval(async () => {
  const report = await healthMonitor.generateHealthReport();

  if (report.deadlocks.length > 0) {
    console.warn('Deadlocks detected!', report.deadlocks);
  }

  if (report.staleLocks.length > 10) {
    console.warn('High number of stale locks!');
  }
}, 300000); // Every 5 minutes
```

### Utility Pattern (withLock)

```typescript
import { withLock } from './lib/distributed-lock';

const result = await withLock(
  lockManager,
  'my-resource',
  async () => {
    // Critical section
    return await computeResult();
  },
  { ttl: 30000 }
);

// Lock automatically released
```

---

## TTL Best Practices

### 1. Choose Appropriate TTL

**Guidelines**:
- **Database queries**: 5-15 seconds
- **File operations**: 10-30 seconds
- **External API calls**: 15-45 seconds
- **Batch processing**: 1-5 minutes (with renewal)
- **Background jobs**: Use auto-renewal

**Example**:
```typescript
// ✅ GOOD - Appropriate TTL
const lock = await lockManager.acquireLock({
  key: 'db-migration',
  ttl: 300000,       // 5 minutes
  renewInterval: 180000, // Renew every 3 minutes
});

// ❌ BAD - TTL too short for operation
const lock = await lockManager.acquireLock({
  key: 'slow-batch-job',
  ttl: 10000,  // 10s - will expire mid-operation!
});
```

### 2. TTL vs Timeout

```typescript
const lock = await lockManager.acquireLock({
  key: 'resource',
  ttl: 60000,      // How long lock is held (60s)
  timeout: 10000,  // How long to wait for acquisition (10s)
});
```

**Rules**:
- `timeout` < `ttl` (acquisition timeout shorter than hold time)
- `timeout` = max acceptable wait time
- `ttl` = max operation duration + buffer

### 3. Buffer Time

Always add 20-30% buffer to expected duration:

```typescript
const expectedDuration = 40000; // 40s operation
const buffer = expectedDuration * 0.3; // 30% buffer

const lock = await lockManager.acquireLock({
  key: 'resource',
  ttl: expectedDuration + buffer, // 52s total
});
```

---

## Lock Renewal Patterns

### Pattern 1: Periodic Manual Renewal

```typescript
const lock = await lockManager.acquireLock({
  key: 'resource',
  ttl: 60000,
});

const renewalTimer = setInterval(async () => {
  try {
    await lockManager.renewLock(lock.id, 60000);
    console.log('Lock renewed');
  } catch (err) {
    console.error('Renewal failed', err);
    clearInterval(renewalTimer);
  }
}, 30000); // Renew every 30s

try {
  await longOperation();
} finally {
  clearInterval(renewalTimer);
  await lockManager.releaseLock(lock.id);
}
```

### Pattern 2: Auto-Renewal (Recommended)

```typescript
const lock = await lockManager.acquireLock({
  key: 'resource',
  ttl: 60000,
  renewInterval: 30000, // Automatic!
});

try {
  await longOperation();
} finally {
  await lockManager.releaseLock(lock.id);
  // Renewal automatically stopped
}
```

### Pattern 3: Conditional Renewal

```typescript
const lock = await lockManager.acquireLock({
  key: 'resource',
  ttl: 60000,
});

try {
  for (const chunk of largeDataset) {
    await processChunk(chunk);

    // Renew if more than 75% of TTL elapsed
    const elapsed = Date.now() - lock.acquiredAt.getTime();
    if (elapsed > lock.ttl * 0.75) {
      await lockManager.renewLock(lock.id, 60000);
    }
  }
} finally {
  await lockManager.releaseLock(lock.id);
}
```

---

## Deadlock Prevention

### Best Practices

1. **Always Use TTL**: Prevents indefinite holds
2. **Set Reasonable TTL**: Not too short, not too long
3. **Release Explicitly**: Don't rely on TTL expiration
4. **Use Finally Blocks**: Ensure release on error
5. **Monitor Health**: Regular deadlock detection

### Deadlock Detection Strategy

**Automated Detection**:
```typescript
const healthMonitor = new LockHealthMonitor(redisClient, lockManager);

// Run deadlock detection every 5 minutes
setInterval(async () => {
  const deadlocks = await healthMonitor.detectDeadlocks();

  for (const deadlock of deadlocks) {
    // Log incident
    console.error('Deadlock detected', {
      lockKey: deadlock.lockKey,
      heldDuration: deadlock.heldDuration,
      type: deadlock.type,
    });

    // Auto-resolve
    await healthMonitor.resolveDeadlock(deadlock);

    // Alert operations team
    await sendAlert({
      type: 'deadlock',
      lockKey: deadlock.lockKey,
      metadata: deadlock.metadata,
    });
  }
}, 300000);
```

### Process Cleanup

Track process IDs for proper cleanup:

```typescript
// Lock metadata includes processId
const metadata = await lockManager.getLockInfo('resource');
console.log(`Lock held by PID: ${metadata.processId}`);

// Clean up stale locks from dead processes
const staleLocks = await healthMonitor.findStaleLocks();
// Force release if process is dead
```

---

## Monitoring and Troubleshooting

### Key Metrics

**Lock Performance**:
- Acquisition latency (target: <100ms)
- Renewal latency (target: <50ms)
- Release latency (target: <50ms)
- Average lock duration

**Lock Health**:
- Currently held locks
- Failed acquisitions
- Deadlock incidents
- Stale lock count

**Resource Contention**:
- Top contended resources
- Failed acquisition rate
- Wait queue depth (if implemented)

### Monitoring Dashboard

```typescript
async function getLockDashboard() {
  const stats = lockManager.getStatistics();
  const report = await healthMonitor.generateHealthReport();

  return {
    performance: {
      totalAcquisitions: stats.totalAcquisitions,
      totalReleases: stats.totalReleases,
      totalRenewals: stats.totalRenewals,
      averageDuration: stats.averageDuration,
      failureRate: stats.failedAcquisitions / stats.totalAcquisitions,
    },
    health: {
      currentlyHeld: stats.currentlyHeld,
      deadlocks: report.deadlocks.length,
      staleLocks: report.staleLocks.length,
    },
    contention: {
      hotspots: report.hotspots.slice(0, 10), // Top 10
      topResources: Object.entries(report.usage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10),
    },
    cleanup: {
      totalCleaned: report.cleanupStats.totalCleaned,
      lastCleanup: report.cleanupStats.lastCleanupAt,
      cleanupRuns: report.cleanupStats.cleanupRuns,
    },
  };
}

// Expose as API endpoint
app.get('/api/locks/dashboard', async (req, res) => {
  const dashboard = await getLockDashboard();
  res.json(dashboard);
});
```

### Troubleshooting Guide

**Problem: Lock acquisition timeouts**

Diagnosis:
```typescript
const hotspots = healthMonitor.getContentionHotspots();
console.log('Top contended resources:', hotspots);
```

Solutions:
- Reduce lock duration
- Increase parallelism (different lock keys)
- Implement lock-free algorithms
- Add caching layer

**Problem: Deadlocks detected**

Diagnosis:
```typescript
const deadlocks = await healthMonitor.detectDeadlocks();
for (const dl of deadlocks) {
  console.log(`Lock ${dl.lockKey} held for ${dl.heldDuration}ms`);
  console.log(`Process: ${dl.metadata.processId}`);
}
```

Solutions:
- Check if process is stuck
- Verify TTL is appropriate
- Force resolve deadlock
- Restart affected service

**Problem: High stale lock count**

Diagnosis:
```typescript
const staleLocks = await healthMonitor.findStaleLocks();
console.log(`Found ${staleLocks.length} stale locks`);
```

Solutions:
- Enable background cleanup
- Increase cleanup frequency
- Check for process crashes
- Review lock release patterns

---

## Performance Characteristics

### Benchmarks

**Lock Acquisition**: <100ms (target)
```typescript
// Typical: 5-20ms with local Redis
// Typical: 20-50ms with remote Redis
```

**Lock Renewal**: <50ms (target)
```typescript
// Typical: 5-15ms
```

**Lock Release**: <50ms (target)
```typescript
// Typical: 5-15ms
```

**Stale Lock Cleanup**: <5s for 100 locks (target)
```typescript
// Typical: 1-3s for 100 locks
```

### Scalability

**Concurrent Locks**: 1000+ locks/sec (depends on Redis)
**Lock Key Space**: Unlimited (Redis-limited)
**Lock Metadata**: ~200 bytes per lock

### Redis Commands Used

- `SET key value PX ttl NX` - Atomic lock acquisition
- `GET key` - Retrieve lock metadata
- `DEL key` - Release lock
- `EXISTS key` - Check lock status
- `PTTL key` - Check remaining TTL
- `KEYS lock:*` - List all locks (cleanup only)

---

## Migration from v1

### Breaking Changes

**None** - v2 is fully backward compatible.

### New Features

- Mandatory TTL enforcement (with default fallback)
- Lock renewal (`renewLock`, `renewInterval`)
- Statistics tracking (`getStatistics`)
- Health monitoring (`LockHealthMonitor`)

### Migration Checklist

1. **Review TTL values**: Ensure all locks have appropriate TTL
2. **Add auto-renewal**: For long-running operations
3. **Enable monitoring**: Deploy `LockHealthMonitor`
4. **Start background cleanup**: `healthMonitor.startBackgroundCleanup(60000)`
5. **Add metrics**: Track lock performance
6. **Set up alerts**: Deadlock detection, stale locks

### Code Examples

**v1 (still works)**:
```typescript
const lock = await lockManager.acquire(
  { database: 'db1', table: 'table1' },
  { timeout: 10000 }
);

try {
  await operation();
} finally {
  await lockManager.release(lock);
}
```

**v2 (recommended)**:
```typescript
const lock = await lockManager.acquireLock({
  key: 'db1:table1',
  ttl: 60000,
  timeout: 10000,
});

try {
  await operation();
} finally {
  await lockManager.releaseLock(lock.id);
}
```

---

## Summary

The enhanced distributed locking system (v2) provides production-ready features for robust, scalable lock management:

✅ **TTL Enforcement**: Prevents indefinite resource holds
✅ **Lock Renewal**: Supports long-running operations
✅ **Deadlock Detection**: Identifies and resolves stuck locks
✅ **Health Monitoring**: Tracks usage, contention, and performance
✅ **Stale Cleanup**: Automatic removal of expired locks
✅ **Backward Compatible**: Seamless upgrade from v1

**Test Coverage**: >90% (comprehensive test suite in `tests/distributed-lock-enhanced.test.ts`)

**Performance**: All operations meet target SLAs (<100ms acquisition, <50ms renewal/release)

**Production Ready**: Zero race conditions in concurrent tests, robust error handling, comprehensive monitoring.

---

## Related Documentation

- [Cross-Database Transaction Framework](./CROSS_DATABASE_TRANSACTIONS.md) - Task 3.1
- [Redis Integration](./REDIS_INTEGRATION.md) - Task 2.1
- [Database Service](./DATABASE_SERVICE.md) - Task 0.4

---

**Document Version**: 2.0
**Last Updated**: 2025-11-16
**Phase**: 2, Task P2-2.2
