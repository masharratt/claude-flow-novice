# Memory Leak Prevention & Agent Lifecycle Safety

## Problem Statement

When executing parallel sprints, agent lifecycle management becomes critical:

1. **Memory Leaks**: Agents persist in Redis after Sprint completion
2. **Orphaned Agents**: Crashed coordinators leave agents running
3. **Resource Exhaustion**: Uncleaned agents accumulate over multiple epics
4. **State Corruption**: Dangling references cause unpredictable behavior

**Critical**: Agent cleanup must be **coordinated across all coordinators** via Redis pub/sub.

---

## Enhanced Lifecycle Cleanup Architecture

### Component Overview

```
┌──────────────────────────────────────────────────────────┐
│          Lifecycle Cleanup Manager (Singleton)            │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Orphan     │  │  Heartbeat   │  │    Memory    │   │
│  │  Detection   │  │  Monitoring  │  │   Tracking   │   │
│  │  (Every 60s) │  │  (Every 30s) │  │  (Real-time) │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                  │                  │           │
│         └──────────────────┴──────────────────┘           │
│                            │                              │
└────────────────────────────┼──────────────────────────────┘
                             │
                             ▼
            ┌────────────────────────────────┐
            │     Redis Coordination         │
            │  - agent:active set            │
            │  - agent:heartbeat:<id>        │
            │  - agent:memory:<id>           │
            │  - cleanup:lock:<id>           │
            └────────────────────────────────┘
```

---

## Implementation

### 1. Heartbeat System

Every agent sends heartbeat every 30 seconds:

```typescript
class AgentHeartbeatManager {
  private redis: Redis;
  private agentId: string;
  private heartbeatInterval = 30000; // 30 seconds
  private heartbeatTimer: NodeJS.Timeout;

  /**
   * Start sending heartbeats
   */
  startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.heartbeatInterval);

    // Send initial heartbeat immediately
    this.sendHeartbeat();
  }

  /**
   * Send heartbeat to Redis
   */
  async sendHeartbeat(): Promise<void> {
    const heartbeatKey = `agent:heartbeat:${this.agentId}`;
    const heartbeat = {
      agentId: this.agentId,
      timestamp: Date.now(),
      pid: process.pid,
      memoryUsage: process.memoryUsage(),
      state: this.getCurrentState()
    };

    // Store with 3-minute TTL (2x heartbeat interval + safety margin)
    await this.redis.setex(
      heartbeatKey,
      180, // 3 minutes
      JSON.stringify(heartbeat)
    );

    // Add to active agents set
    await this.redis.sadd('agents:active', this.agentId);

    // Publish heartbeat event
    await this.redis.publish('agent:lifecycle', JSON.stringify({
      type: 'heartbeat_sent',
      agentId: this.agentId,
      timestamp: Date.now()
    }));
  }

  /**
   * Stop sending heartbeats (cleanup)
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }
}
```

### 2. Orphan Detection

Background process scans for agents with stale heartbeats:

```typescript
class OrphanDetector {
  private redis: Redis;
  private orphanCheckInterval = 60000; // Check every 60 seconds
  private orphanThreshold = 120000; // 2 minutes idle = orphan

  /**
   * Start orphan detection background process
   */
  startOrphanDetection(): void {
    setInterval(async () => {
      await this.detectAndCleanupOrphans();
    }, this.orphanCheckInterval);
  }

  /**
   * Detect and cleanup orphaned agents
   */
  async detectAndCleanupOrphans(): Promise<OrphanCleanupResult> {
    const activeAgents = await this.redis.smembers('agents:active');
    const orphans: OrphanedAgent[] = [];
    const healthy: string[] = [];

    for (const agentId of activeAgents) {
      const heartbeatKey = `agent:heartbeat:${agentId}`;
      const heartbeatData = await this.redis.get(heartbeatKey);

      if (!heartbeatData) {
        // No heartbeat found - orphaned
        orphans.push({
          agentId,
          reason: 'missing_heartbeat',
          lastSeen: null
        });
        continue;
      }

      const heartbeat = JSON.parse(heartbeatData);
      const idle = Date.now() - heartbeat.timestamp;

      if (idle > this.orphanThreshold) {
        // Heartbeat too old - orphaned
        orphans.push({
          agentId,
          reason: 'stale_heartbeat',
          lastSeen: heartbeat.timestamp,
          idleTime: idle
        });
      } else {
        healthy.push(agentId);
      }
    }

    // Cleanup orphaned agents
    for (const orphan of orphans) {
      await this.cleanupOrphanedAgent(orphan);
    }

    if (orphans.length > 0) {
      logger.warn(`Orphan detection: Cleaned up ${orphans.length} agents`, {
        orphans: orphans.map(o => o.agentId),
        healthy: healthy.length
      });

      // Emit Prometheus metric
      agentOrphanCleanupCount.inc(orphans.length);

      // Publish cleanup event
      await this.redis.publish('agent:lifecycle', JSON.stringify({
        type: 'orphans_detected',
        count: orphans.length,
        orphans,
        timestamp: Date.now()
      }));
    }

    return {
      orphansDetected: orphans.length,
      orphansCleaned: orphans.length,
      healthyAgents: healthy.length,
      orphans
    };
  }

  /**
   * Cleanup orphaned agent with Redis synchronization
   */
  private async cleanupOrphanedAgent(orphan: OrphanedAgent): Promise<void> {
    const lockKey = `cleanup:lock:${orphan.agentId}`;

    // Acquire cleanup lock (prevent duplicate cleanup)
    const lockAcquired = await this.redis.set(
      lockKey,
      Date.now(),
      'NX',
      'EX',
      300 // 5 minutes
    );

    if (!lockAcquired) {
      logger.debug(`Cleanup already in progress for ${orphan.agentId}`);
      return;
    }

    try {
      logger.info(`Cleaning up orphaned agent: ${orphan.agentId}`, {
        reason: orphan.reason,
        lastSeen: orphan.lastSeen,
        idleTime: orphan.idleTime
      });

      // 1. Publish cleanup intent (allow other coordinators to react)
      await this.redis.publish('agent:lifecycle', JSON.stringify({
        type: 'cleanup_started',
        agentId: orphan.agentId,
        reason: orphan.reason,
        timestamp: Date.now()
      }));

      // 2. Grace period for acknowledgments
      await sleep(100);

      // 3. Remove from active agents set
      await this.redis.srem('agents:active', orphan.agentId);

      // 4. Delete all agent-related keys
      const patterns = [
        `agent:heartbeat:${orphan.agentId}`,
        `agent:memory:${orphan.agentId}`,
        `agent:state:${orphan.agentId}`,
        `agent:task:${orphan.agentId}*`,
        `agent:deps:${orphan.agentId}*`
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        const keys = await this.scanKeys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          totalDeleted += keys.length;
        }
      }

      // 5. Update memory usage statistics
      await this.updateMemoryStats(-1, -totalDeleted);

      // 6. Publish cleanup complete
      await this.redis.publish('agent:lifecycle', JSON.stringify({
        type: 'cleanup_completed',
        agentId: orphan.agentId,
        keysDeleted: totalDeleted,
        timestamp: Date.now()
      }));

      logger.info(`Orphan cleanup complete: ${orphan.agentId}`, {
        keysDeleted: totalDeleted
      });

    } catch (error) {
      logger.error(`Orphan cleanup failed: ${orphan.agentId}`, {
        error: error instanceof Error ? error.message : String(error)
      });

      // Re-throw to trigger retry
      throw error;

    } finally {
      // Always release cleanup lock
      await this.redis.del(lockKey);
    }
  }

  /**
   * Scan Redis keys with pattern (use SCAN not KEYS)
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }
}
```

### 3. Memory Tracking

Track memory usage per agent and globally:

```typescript
class MemoryTracker {
  private redis: Redis;

  /**
   * Record agent memory usage
   */
  async recordMemoryUsage(agentId: string): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const memoryKey = `agent:memory:${agentId}`;

    await this.redis.hset(memoryKey, {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      rss: memoryUsage.rss,
      external: memoryUsage.external,
      timestamp: Date.now()
    });

    // Expire after 1 hour
    await this.redis.expire(memoryKey, 3600);
  }

  /**
   * Get total memory usage across all agents
   */
  async getTotalMemoryUsage(): Promise<MemoryStats> {
    const activeAgents = await this.redis.smembers('agents:active');
    let totalHeapUsed = 0;
    let totalRSS = 0;

    for (const agentId of activeAgents) {
      const memoryKey = `agent:memory:${agentId}`;
      const memory = await this.redis.hgetall(memoryKey);

      if (memory.heapUsed) {
        totalHeapUsed += parseInt(memory.heapUsed);
        totalRSS += parseInt(memory.rss);
      }
    }

    // Get Redis memory usage
    const redisInfo = await this.redis.info('memory');
    const redisMemory = this.parseRedisMemory(redisInfo);

    return {
      totalAgents: activeAgents.length,
      totalHeapUsed,
      totalRSS,
      redisMemory,
      timestamp: Date.now()
    };
  }

  /**
   * Check for memory leaks (growth over time)
   */
  async checkForMemoryLeak(): Promise<MemoryLeakDetection> {
    const currentStats = await this.getTotalMemoryUsage();

    // Get baseline from 5 minutes ago
    const baselineKey = 'memory:baseline';
    const baselineData = await this.redis.get(baselineKey);

    if (!baselineData) {
      // First run - set baseline
      await this.redis.setex(baselineKey, 300, JSON.stringify(currentStats));
      return { detected: false, growth: 0 };
    }

    const baseline: MemoryStats = JSON.parse(baselineData);

    // Calculate memory growth
    const growth = currentStats.totalRSS - baseline.totalRSS;
    const growthPct = (growth / baseline.totalRSS) * 100;

    // Threshold: >100MB growth in 5 minutes = potential leak
    const leakDetected = growth > 100 * 1024 * 1024; // 100MB

    if (leakDetected) {
      logger.error('Memory leak detected!', {
        baseline: baseline.totalRSS,
        current: currentStats.totalRSS,
        growth,
        growthPct
      });

      // Publish alert
      await this.redis.publish('system:alerts', JSON.stringify({
        type: 'memory_leak_detected',
        growth,
        growthPct,
        baseline,
        current: currentStats,
        timestamp: Date.now()
      }));

      // Emit Prometheus metric
      memoryLeakDetected.set(1);
    }

    // Update baseline every 5 minutes
    await this.redis.setex(baselineKey, 300, JSON.stringify(currentStats));

    return {
      detected: leakDetected,
      growth,
      growthPct,
      baseline,
      current: currentStats
    };
  }
}
```

### 4. Graceful Shutdown

Proper cleanup on agent/coordinator termination:

```typescript
class GracefulShutdownHandler {
  private redis: Redis;
  private agentId: string;
  private heartbeatManager: AgentHeartbeatManager;

  /**
   * Register shutdown handlers
   */
  registerShutdownHandlers(): void {
    // Handle SIGTERM (Docker, Kubernetes)
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, initiating graceful shutdown');
      await this.shutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, initiating graceful shutdown');
      await this.shutdown('SIGINT');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception, initiating emergency shutdown', { error });
      await this.shutdown('uncaughtException');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', async (reason) => {
      logger.error('Unhandled rejection, initiating emergency shutdown', { reason });
      await this.shutdown('unhandledRejection');
    });
  }

  /**
   * Graceful shutdown sequence
   */
  private async shutdown(reason: string): Promise<void> {
    logger.info(`Initiating graceful shutdown: ${reason}`, {
      agentId: this.agentId
    });

    try {
      // 1. Stop accepting new work
      this.stopAcceptingWork();

      // 2. Complete current tasks (with timeout)
      await this.completeCurrentTasks(30000); // 30 second timeout

      // 3. Stop heartbeat
      this.heartbeatManager.stopHeartbeat();

      // 4. Cleanup agent resources
      await this.cleanupAgentResources();

      // 5. Publish shutdown event
      await this.redis.publish('agent:lifecycle', JSON.stringify({
        type: 'agent_shutdown',
        agentId: this.agentId,
        reason,
        timestamp: Date.now()
      }));

      logger.info('Graceful shutdown complete', { agentId: this.agentId });

    } catch (error) {
      logger.error('Error during graceful shutdown', {
        agentId: this.agentId,
        error
      });

    } finally {
      // Force exit after cleanup
      process.exit(0);
    }
  }

  /**
   * Cleanup agent resources in Redis
   */
  private async cleanupAgentResources(): Promise<void> {
    // Remove from active set
    await this.redis.srem('agents:active', this.agentId);

    // Delete heartbeat
    await this.redis.del(`agent:heartbeat:${this.agentId}`);

    // Delete memory tracking
    await this.redis.del(`agent:memory:${this.agentId}`);

    // Delete state
    await this.redis.del(`agent:state:${this.agentId}`);

    logger.info('Agent resources cleaned up', { agentId: this.agentId });
  }
}
```

---

## Monitoring & Alerts

### Prometheus Metrics

```typescript
// Agent count over time
agent_count_total{state="active"}

// Orphan cleanup count
agent_orphan_cleanup_count{reason="stale_heartbeat"}

// Memory usage per agent
agent_memory_usage_bytes{agent_id="coder-1"}

// Total memory growth
memory_growth_bytes

// Memory leak detection
memory_leak_detected{threshold="100MB"}
```

### Grafana Dashboard

```yaml
panels:
  - title: "Active Agents Over Time"
    query: agent_count_total{state="active"}
    type: graph

  - title: "Orphan Cleanup Rate"
    query: rate(agent_orphan_cleanup_count[5m])
    type: graph

  - title: "Memory Growth"
    query: memory_growth_bytes
    alert: "> 100MB in 5 minutes"
    type: graph

  - title: "Memory Leak Detection"
    query: memory_leak_detected
    alert: "== 1"
    type: singlestat
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('OrphanDetector', () => {
  it('should detect agents with stale heartbeats', async () => {
    // Create agent with old heartbeat
    await redis.set('agent:heartbeat:stale-agent', JSON.stringify({
      agentId: 'stale-agent',
      timestamp: Date.now() - 180000 // 3 minutes ago
    }));
    await redis.sadd('agents:active', 'stale-agent');

    const result = await orphanDetector.detectAndCleanupOrphans();

    expect(result.orphansDetected).toBe(1);
    expect(result.orphansCleaned).toBe(1);

    // Agent should be removed from active set
    const isActive = await redis.sismember('agents:active', 'stale-agent');
    expect(isActive).toBe(0);
  });

  it('should not cleanup healthy agents', async () => {
    // Create agent with recent heartbeat
    await redis.set('agent:heartbeat:healthy-agent', JSON.stringify({
      agentId: 'healthy-agent',
      timestamp: Date.now() - 30000 // 30 seconds ago
    }));
    await redis.sadd('agents:active', 'healthy-agent');

    const result = await orphanDetector.detectAndCleanupOrphans();

    expect(result.orphansDetected).toBe(0);

    // Agent should still be active
    const isActive = await redis.sismember('agents:active', 'healthy-agent');
    expect(isActive).toBe(1);
  });
});
```

### Chaos Tests

```typescript
describe('Memory Leak Chaos', () => {
  it('should cleanup agents after random crashes', async () => {
    // Spawn 10 agents
    const agents = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        spawnAgent(`agent-${i}`)
      )
    );

    // Randomly crash 30% of agents (no cleanup)
    const crashedAgents = agents.filter(() => Math.random() < 0.3);
    for (const agent of crashedAgents) {
      // Simulate crash (stop heartbeat but leave in active set)
      agent.stopHeartbeat();
    }

    // Wait for orphan detection (2 minute threshold + 1 minute buffer)
    await sleep(180000); // 3 minutes

    // Run orphan detection
    const result = await orphanDetector.detectAndCleanupOrphans();

    // All crashed agents should be cleaned up
    expect(result.orphansCleaned).toBe(crashedAgents.length);

    // Active agent count should match healthy agents
    const activeCount = await redis.scard('agents:active');
    expect(activeCount).toBe(agents.length - crashedAgents.length);
  });
});
```

---

## Next Steps

1. Review [Test Coordination Strategy](TEST_COORDINATION.md)
2. Review [Architecture Documentation](ARCHITECTURE.md)
3. Implement orphan detection: `src/agents/orphan-detector.ts`
4. Setup Grafana dashboard: `monitor/dashboards/memory-safety.json`
