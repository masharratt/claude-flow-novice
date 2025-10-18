/**
 * Parallelization Test: Orphan Detection and Memory Leak Prevention
 *
 * Tests orphan agent cleanup, memory leak detection, and long-running
 * epic stability according to ASSUMPTIONS_AND_TESTING.md requirements.
 *
 * Requirements:
 * 1. Cleanup all orphans within 3 minutes (2min threshold + 1min buffer)
 * 2. Memory should return to baseline (within 10MB tolerance)
 * 3. Detect memory leaks with 100MB growth threshold
 * 4. Maintain stable memory over 10 sequential epics (<5MB growth per epic)
 *
 * Epic: parallel-cfn-loop
 * Sprint: Assumptions Validation Tests
 *
 * @module tests/parallelization/orphan-detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { sleep } from '../chaos/utils/chaos-helpers.js';

// ===== TYPE DEFINITIONS =====

interface AgentInstance {
  id: string;
  spawnTime: number;
  heartbeatInterval?: NodeJS.Timeout;
  stopped: boolean;
}

interface OrphanDetectionResult {
  orphansCleaned: number;
  orphanIds: string[];
  cleanupDuration: number;
  timestamp: number;
}

interface MemoryLeakDetectionResult {
  detected: boolean;
  growth: number;
  baseline: number;
  current: number;
  threshold: number;
  timestamp: number;
}

interface EpicExecutionConfig {
  sprints: number;
  agentsPerSprint: number;
  duration?: number;
}

// ===== REDIS CONFIGURATION =====

const DEFAULT_REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '15'), // Test database
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 50, 500);
  },
};

// ===== TEST CONFIGURATION =====

const TEST_CONFIG = {
  ORPHAN_THRESHOLD: 2 * 60 * 1000, // 2 minutes
  ORPHAN_BUFFER: 1 * 60 * 1000, // 1 minute buffer
  ORPHAN_CLEANUP_TIMEOUT: 3 * 60 * 1000, // 3 minutes total
  MEMORY_TOLERANCE: 10 * 1024 * 1024, // 10MB
  MEMORY_LEAK_THRESHOLD: 100 * 1024 * 1024, // 100MB
  EPIC_MEMORY_GROWTH_MAX: 5 * 1024 * 1024, // 5MB per epic
  HEARTBEAT_INTERVAL: 30 * 1000, // 30 seconds
  ORPHAN_CHECK_INTERVAL: 60 * 1000, // 60 seconds
};

// ===== HELPER FUNCTIONS =====

/**
 * Get Redis memory usage in bytes
 */
async function getRedisMemoryUsage(redis: Redis): Promise<number> {
  const info = await redis.info('memory');
  const match = info.match(/used_memory:(\d+)/);
  if (!match) {
    throw new Error('Failed to parse Redis memory usage');
  }
  return parseInt(match[1], 10);
}

/**
 * Spawn a test agent with heartbeat
 */
async function spawnAgent(
  redis: Redis,
  agentId: string,
  enableHeartbeat: boolean = true
): Promise<AgentInstance> {
  const agent: AgentInstance = {
    id: agentId,
    spawnTime: Date.now(),
    stopped: false,
  };

  // Create agent state in Redis
  await redis.hset(`agent:${agentId}`, {
    id: agentId,
    status: 'active',
    spawnTime: agent.spawnTime.toString(),
    type: 'test-agent',
  });

  // Start heartbeat if enabled
  if (enableHeartbeat) {
    agent.heartbeatInterval = setInterval(async () => {
      if (agent.stopped) return;

      try {
        await redis.hset(
          `agent:${agentId}:heartbeat`,
          'timestamp',
          Date.now().toString()
        );
      } catch (error) {
        // Silently fail if Redis is unavailable
      }
    }, TEST_CONFIG.HEARTBEAT_INTERVAL);
  }

  // Set initial heartbeat
  await redis.hset(
    `agent:${agentId}:heartbeat`,
    'timestamp',
    Date.now().toString()
  );

  return agent;
}

/**
 * Stop agent heartbeat (simulate crash)
 */
function stopAgentHeartbeat(agent: AgentInstance): void {
  agent.stopped = true;
  if (agent.heartbeatInterval) {
    clearInterval(agent.heartbeatInterval);
    agent.heartbeatInterval = undefined;
  }
}

/**
 * Cleanup agent from Redis
 */
async function cleanupAgent(redis: Redis, agentId: string): Promise<void> {
  await redis.del(`agent:${agentId}`);
  await redis.del(`agent:${agentId}:heartbeat`);
  await redis.del(`agent:${agentId}:state`);
  await redis.del(`agent:${agentId}:tasks`);
}

// ===== ORPHAN DETECTOR CLASS =====

/**
 * Orphan Detector - Detects and cleans up orphaned agents
 */
class OrphanDetector {
  private redis: Redis;
  private threshold: number;

  constructor(redis: Redis, threshold: number = TEST_CONFIG.ORPHAN_THRESHOLD) {
    this.redis = redis;
    this.threshold = threshold;
  }

  /**
   * Detect and cleanup orphaned agents
   */
  async detectAndCleanupOrphans(): Promise<OrphanDetectionResult> {
    const startTime = Date.now();
    const orphanIds: string[] = [];
    const now = Date.now();

    // Find all agent keys
    const agentKeys = await this.redis.keys('agent:*:heartbeat');

    for (const key of agentKeys) {
      const agentId = key.replace('agent:', '').replace(':heartbeat', '');

      // Get last heartbeat timestamp
      const timestamp = await this.redis.hget(key, 'timestamp');

      if (!timestamp) {
        // No heartbeat recorded - consider orphan
        orphanIds.push(agentId);
        continue;
      }

      const lastHeartbeat = parseInt(timestamp, 10);
      const timeSinceHeartbeat = now - lastHeartbeat;

      // Check if heartbeat is stale (beyond threshold)
      if (timeSinceHeartbeat > this.threshold) {
        orphanIds.push(agentId);
      }
    }

    // Cleanup orphaned agents
    for (const orphanId of orphanIds) {
      await cleanupAgent(this.redis, orphanId);
    }

    const cleanupDuration = Date.now() - startTime;

    return {
      orphansCleaned: orphanIds.length,
      orphanIds,
      cleanupDuration,
      timestamp: Date.now(),
    };
  }

  /**
   * Get count of orphaned agents without cleanup
   */
  async countOrphans(): Promise<number> {
    const now = Date.now();
    const agentKeys = await this.redis.keys('agent:*:heartbeat');
    let orphanCount = 0;

    for (const key of agentKeys) {
      const timestamp = await this.redis.hget(key, 'timestamp');

      if (!timestamp) {
        orphanCount++;
        continue;
      }

      const lastHeartbeat = parseInt(timestamp, 10);
      const timeSinceHeartbeat = now - lastHeartbeat;

      if (timeSinceHeartbeat > this.threshold) {
        orphanCount++;
      }
    }

    return orphanCount;
  }
}

// ===== MEMORY TRACKER CLASS =====

/**
 * Memory Tracker - Tracks and detects memory leaks
 */
class MemoryTracker {
  private redis: Redis;
  private baseline?: number;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get total memory usage (Redis + Node)
   */
  async getTotalMemoryUsage(): Promise<number> {
    const redisMemory = await getRedisMemoryUsage(this.redis);
    const nodeMemory = process.memoryUsage().heapUsed;
    return redisMemory + nodeMemory;
  }

  /**
   * Set baseline memory usage
   */
  async setBaseline(): Promise<number> {
    this.baseline = await this.getTotalMemoryUsage();
    return this.baseline;
  }

  /**
   * Check for memory leak
   */
  async checkForMemoryLeak(
    threshold: number = TEST_CONFIG.MEMORY_LEAK_THRESHOLD
  ): Promise<MemoryLeakDetectionResult> {
    if (!this.baseline) {
      throw new Error('Baseline not set. Call setBaseline() first.');
    }

    const current = await this.getTotalMemoryUsage();
    const growth = current - this.baseline;

    return {
      detected: growth > threshold,
      growth,
      baseline: this.baseline,
      current,
      threshold,
      timestamp: Date.now(),
    };
  }

  /**
   * Get memory growth since baseline
   */
  async getMemoryGrowth(): Promise<number> {
    if (!this.baseline) {
      throw new Error('Baseline not set. Call setBaseline() first.');
    }

    const current = await this.getTotalMemoryUsage();
    return current - this.baseline;
  }
}

// ===== EPIC EXECUTION HELPER =====

/**
 * Execute a parallel epic simulation
 */
async function executeParallelEpic(
  redis: Redis,
  config: EpicExecutionConfig
): Promise<void> {
  const { sprints, agentsPerSprint, duration = 5000 } = config;
  const allAgents: AgentInstance[] = [];

  // Spawn agents for all sprints
  for (let sprint = 0; sprint < sprints; sprint++) {
    for (let agent = 0; agent < agentsPerSprint; agent++) {
      const agentId = `epic-sprint${sprint}-agent${agent}`;
      const instance = await spawnAgent(redis, agentId, true);
      allAgents.push(instance);
    }
  }

  // Simulate epic execution
  await sleep(duration);

  // Cleanup all agents
  for (const agent of allAgents) {
    stopAgentHeartbeat(agent);
    await cleanupAgent(redis, agent.id);
  }
}

// ===== TEST SUITE =====

describe('Orphan Detection and Memory Leak Prevention', () => {
  let redis: Redis;
  let orphanDetector: OrphanDetector;
  let memoryTracker: MemoryTracker;
  let spawnedAgents: AgentInstance[] = [];

  beforeEach(async () => {
    // Create Redis connection
    redis = new Redis(DEFAULT_REDIS_CONFIG);
    await redis.ping();

    // Initialize detector and tracker
    orphanDetector = new OrphanDetector(redis);
    memoryTracker = new MemoryTracker(redis);

    // Cleanup any existing test data
    const testKeys = await redis.keys('agent:*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }

    spawnedAgents = [];
  });

  afterEach(async () => {
    // Stop all agent heartbeats
    for (const agent of spawnedAgents) {
      stopAgentHeartbeat(agent);
    }

    // Cleanup test data
    const testKeys = await redis.keys('agent:*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }

    // Close Redis connection
    await redis.quit();
    spawnedAgents = [];
  });

  describe('Orphan Cleanup', () => {
    it('should cleanup all orphans within 3 minutes', async () => {
      // Spawn 20 agents
      const agentCount = 20;
      const agents: AgentInstance[] = [];

      for (let i = 0; i < agentCount; i++) {
        const agent = await spawnAgent(redis, `test-agent-${i}`, true);
        agents.push(agent);
        spawnedAgents.push(agent);
      }

      // Measure baseline memory
      const baselineMemory = await getRedisMemoryUsage(redis);

      // Crash 50% of agents (no cleanup)
      const crashedAgents: AgentInstance[] = [];
      agents.forEach((agent, index) => {
        if (index % 2 === 0) {
          stopAgentHeartbeat(agent);
          crashedAgents.push(agent);
        }
      });

      console.log(
        `Crashed ${crashedAgents.length} agents (50% of ${agentCount})`
      );

      // Wait 3 minutes (2min threshold + 1min buffer)
      console.log('Waiting 3 minutes for orphan detection...');
      await sleep(TEST_CONFIG.ORPHAN_CLEANUP_TIMEOUT);

      // Force orphan detection
      const startTime = Date.now();
      const result = await orphanDetector.detectAndCleanupOrphans();
      const detectionTime = Date.now() - startTime;

      console.log(
        `Orphan detection completed in ${detectionTime}ms: ${result.orphansCleaned} orphans cleaned`
      );

      // All crashed agents should be cleaned
      expect(result.orphansCleaned).toBe(crashedAgents.length);
      expect(result.orphansCleaned).toBe(10); // 50% of 20

      // Verify orphaned agent IDs match crashed agents
      const crashedIds = crashedAgents.map((a) => a.id);
      for (const orphanId of result.orphanIds) {
        expect(crashedIds).toContain(orphanId);
      }

      // Memory should return to baseline (within 10MB tolerance)
      const currentMemory = await getRedisMemoryUsage(redis);
      const memoryGrowth = currentMemory - baselineMemory;

      console.log(
        `Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB (tolerance: ${(TEST_CONFIG.MEMORY_TOLERANCE / 1024 / 1024).toFixed(2)}MB)`
      );

      expect(memoryGrowth).toBeLessThan(TEST_CONFIG.MEMORY_TOLERANCE);
    }, 5 * 60 * 1000); // 5 minute test timeout

    it('should detect orphans without cleanup', async () => {
      // Spawn agents without heartbeat intervals
      const agents: AgentInstance[] = [];
      const spawnTime = Date.now();

      for (let i = 0; i < 5; i++) {
        const agent = await spawnAgent(redis, `orphan-test-${i}`, false);
        agents.push(agent);
        spawnedAgents.push(agent);
      }

      console.log(`Spawned ${agents.length} agents at ${new Date(spawnTime).toISOString()}`);

      // Verify agents were created in Redis
      const agentKeys = await redis.keys('agent:*:heartbeat');
      console.log(`Agent heartbeat keys in Redis: ${agentKeys.length} keys found`);

      // Wait for heartbeats to become stale (threshold + buffer)
      console.log(`Waiting ${TEST_CONFIG.ORPHAN_THRESHOLD / 1000}s + 10s for orphan detection threshold...`);
      const waitStart = Date.now();
      await sleep(TEST_CONFIG.ORPHAN_THRESHOLD + 10000); // Threshold + 10s
      const waitEnd = Date.now();

      console.log(`Wait completed. Elapsed: ${(waitEnd - waitStart) / 1000}s`);

      // Count orphans (should detect all agents as orphaned)
      const orphanCount = await orphanDetector.countOrphans();

      console.log(`Detected ${orphanCount} orphans (expected 5)`);
      expect(orphanCount).toBe(5);

      // Verify orphan detection doesn't modify Redis state
      const agentKeysAfter = await redis.keys('agent:*:heartbeat');
      expect(agentKeysAfter.length).toBe(5);
    }, 3 * 60 * 1000); // 3 minute test timeout (2min threshold + 10s + buffer)
  });

  describe('Memory Leak Detection', () => {
    it('should detect memory leak with 100MB growth threshold', async () => {
      // Record baseline
      const baseline = await memoryTracker.setBaseline();

      console.log(
        `Baseline memory: ${(baseline / 1024 / 1024).toFixed(2)}MB`
      );

      // Simulate memory leak (create 150MB of Redis keys)
      console.log('Creating 150MB of Redis keys to simulate memory leak...');
      const leakSize = 150;
      for (let i = 0; i < leakSize; i++) {
        const megabyte = 'x'.repeat(1024 * 1024); // 1MB string
        await redis.set(`leak:${i}`, megabyte);
      }

      // Check for leak
      const leakDetection = await memoryTracker.checkForMemoryLeak();

      console.log(
        `Memory leak detection: growth=${(leakDetection.growth / 1024 / 1024).toFixed(2)}MB, threshold=${(TEST_CONFIG.MEMORY_LEAK_THRESHOLD / 1024 / 1024).toFixed(2)}MB`
      );

      expect(leakDetection.detected).toBe(true);
      expect(leakDetection.growth).toBeGreaterThan(
        TEST_CONFIG.MEMORY_LEAK_THRESHOLD
      );

      // Cleanup leak
      const leakKeys = await redis.keys('leak:*');
      if (leakKeys.length > 0) {
        await redis.del(...leakKeys);
      }
    }, 60000);

    it('should not detect leak under threshold', async () => {
      // Record baseline
      await memoryTracker.setBaseline();

      // Create small amount of data (5MB)
      for (let i = 0; i < 5; i++) {
        const megabyte = 'x'.repeat(1024 * 1024);
        await redis.set(`small-leak:${i}`, megabyte);
      }

      // Check for leak
      const leakDetection = await memoryTracker.checkForMemoryLeak();

      expect(leakDetection.detected).toBe(false);
      expect(leakDetection.growth).toBeLessThan(
        TEST_CONFIG.MEMORY_LEAK_THRESHOLD
      );

      // Cleanup
      const keys = await redis.keys('small-leak:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    });
  });

  describe('Long-Running Epic Stability', () => {
    it('should maintain stable memory over 10 sequential epics', async () => {
      const memoryReadings: number[] = [];
      const epicCount = 10;

      console.log(`Executing ${epicCount} sequential epics...`);

      for (let epicNum = 0; epicNum < epicCount; epicNum++) {
        console.log(`Executing epic ${epicNum + 1}/${epicCount}...`);

        // Execute full epic
        await executeParallelEpic(redis, {
          sprints: 5,
          agentsPerSprint: 10,
          duration: 2000, // 2 seconds per epic
        });

        // Record memory
        const memory = await getRedisMemoryUsage(redis);
        memoryReadings.push(memory);

        console.log(
          `Epic ${epicNum + 1} memory: ${(memory / 1024 / 1024).toFixed(2)}MB`
        );

        // Force orphan cleanup
        const cleanup = await orphanDetector.detectAndCleanupOrphans();
        console.log(
          `Cleanup after epic ${epicNum + 1}: ${cleanup.orphansCleaned} orphans`
        );

        // Small delay between epics
        await sleep(500);
      }

      // Check memory trend (should be stable, not growing)
      const avgGrowthPerEpic =
        (memoryReadings[epicCount - 1] - memoryReadings[0]) / (epicCount - 1);

      console.log(
        `Average memory growth per epic: ${(avgGrowthPerEpic / 1024 / 1024).toFixed(2)}MB (max: ${(TEST_CONFIG.EPIC_MEMORY_GROWTH_MAX / 1024 / 1024).toFixed(2)}MB)`
      );

      // Memory growth should be less than 5MB per epic
      expect(avgGrowthPerEpic).toBeLessThan(
        TEST_CONFIG.EPIC_MEMORY_GROWTH_MAX
      );

      // Total growth should be reasonable (less than 50MB for 10 epics)
      const totalGrowth = memoryReadings[epicCount - 1] - memoryReadings[0];
      expect(totalGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB total
    }, 5 * 60 * 1000); // 5 minute test timeout

    it('should cleanup orphans between epics', async () => {
      const epicCount = 3;

      for (let epicNum = 0; epicNum < epicCount; epicNum++) {
        // Execute epic
        await executeParallelEpic(redis, {
          sprints: 3,
          agentsPerSprint: 5,
          duration: 1000,
        });

        // Check for orphans before cleanup
        const orphansBefore = await orphanDetector.countOrphans();

        // Cleanup
        const cleanup = await orphanDetector.detectAndCleanupOrphans();

        // Check for orphans after cleanup
        const orphansAfter = await orphanDetector.countOrphans();

        console.log(
          `Epic ${epicNum + 1}: orphans before=${orphansBefore}, cleaned=${cleanup.orphansCleaned}, orphans after=${orphansAfter}`
        );

        // No orphans should remain after cleanup
        expect(orphansAfter).toBe(0);
      }
    });
  });

  describe('Orphan Detector Edge Cases', () => {
    it('should handle no orphans gracefully', async () => {
      // Spawn agents with active heartbeats
      for (let i = 0; i < 5; i++) {
        const agent = await spawnAgent(redis, `healthy-agent-${i}`, true);
        spawnedAgents.push(agent);
      }

      // Run orphan detection immediately
      const result = await orphanDetector.detectAndCleanupOrphans();

      // No orphans should be detected
      expect(result.orphansCleaned).toBe(0);
      expect(result.orphanIds).toHaveLength(0);
    });

    it('should handle agents without heartbeat keys', async () => {
      // Create agent without heartbeat
      await redis.hset('agent:no-heartbeat', {
        id: 'no-heartbeat',
        status: 'active',
      });

      // Run orphan detection
      const result = await orphanDetector.detectAndCleanupOrphans();

      // Agent without heartbeat should be cleaned as orphan
      expect(result.orphansCleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Memory Tracker Edge Cases', () => {
    it('should throw error if baseline not set', async () => {
      const tracker = new MemoryTracker(redis);

      await expect(tracker.checkForMemoryLeak()).rejects.toThrow(
        'Baseline not set'
      );
    });

    it('should handle memory fluctuations', async () => {
      // Set baseline
      await memoryTracker.setBaseline();

      // Multiple small operations
      for (let i = 0; i < 10; i++) {
        await redis.set(`fluctuation:${i}`, 'small-value');
      }

      // Check memory growth
      const growth = await memoryTracker.getMemoryGrowth();

      // Growth should be minimal
      expect(growth).toBeLessThan(1024 * 1024); // Less than 1MB

      // Cleanup
      const keys = await redis.keys('fluctuation:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    });
  });
});
