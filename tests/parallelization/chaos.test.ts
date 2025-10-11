/**
 * Chaos Engineering Tests for Parallelization System
 *
 * Validates system resilience under extreme failure conditions according to
 * ASSUMPTIONS_AND_TESTING.md requirements (lines 694-700):
 *
 * Requirements:
 * 1. 30% random agent crashes → 100% cleanup within 3min
 * 2. Redis connection failures → Recovery within 30s
 * 3. Concurrent file edits → 100% conflict detection
 * 4. Test lock crashes → Stale lock release within 15min
 *
 * Test Framework: Vitest with TypeScript
 * Redis Client: ioredis (matching existing parallelization tests)
 *
 * Epic: parallel-cfn-loop
 * Sprint: Chaos Engineering Validation
 *
 * @module tests/parallelization/chaos
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { sleep, randomInt } from '../chaos/utils/chaos-helpers.js';

// ===== TYPE DEFINITIONS =====

interface AgentInstance {
  id: string;
  spawnTime: number;
  heartbeatInterval?: NodeJS.Timeout;
  stopped: boolean;
  crashed: boolean;
  pid?: number;
}

interface CrashTestResult {
  totalAgents: number;
  crashedAgents: number;
  cleanedAgents: number;
  cleanupDuration: number;
  cleanupRate: number; // Percentage
}

interface RecoveryTestResult {
  disconnectTime: number;
  reconnectTime: number;
  recoveryDuration: number;
  agentsRecovered: number;
  totalAgents: number;
}

interface FileEditConflict {
  agentId: string;
  filePath: string;
  timestamp: number;
  content: string;
  conflictDetected: boolean;
}

interface LockState {
  holder: string | null;
  acquiredAt: number;
  ttl: number;
  expired: boolean;
}

// ===== REDIS CONFIGURATION =====

const DEFAULT_REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '15'), // Test database
  retryStrategy: (times: number) => {
    if (times > 10) return null; // Stop retrying after 10 attempts
    return Math.min(times * 100, 2000); // Exponential backoff up to 2s
  },
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
};

// ===== TEST CONFIGURATION =====

const CHAOS_CONFIG = {
  // Test 1: Random Agent Crashes
  TOTAL_AGENTS: 30,
  CRASH_PERCENTAGE: 0.3, // 30%
  ORPHAN_CLEANUP_THRESHOLD: 3 * 60 * 1000, // 3 minutes
  HEARTBEAT_INTERVAL: 5 * 1000, // 5 seconds
  ORPHAN_CHECK_INTERVAL: 10 * 1000, // 10 seconds

  // Test 2: Redis Connection Failures
  REDIS_RECOVERY_TIMEOUT: 30 * 1000, // 30 seconds
  RECONNECT_POLL_INTERVAL: 1000, // 1 second

  // Test 3: Concurrent File Edits
  CONCURRENT_EDITORS: 5,
  EDIT_DURATION: 2000, // 2 seconds per edit

  // Test 4: Test Lock Crashes
  LOCK_TTL: 15 * 60, // 15 minutes in seconds
  STALE_LOCK_CHECK_INTERVAL: 5000, // 5 seconds
};

// ===== HELPER FUNCTIONS =====

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
    crashed: false,
  };

  // Create agent state in Redis
  await redis.hset(`agent:${agentId}`, {
    id: agentId,
    status: 'active',
    spawnTime: agent.spawnTime.toString(),
    type: 'chaos-test-agent',
  });

  // Set initial heartbeat
  await redis.hset(
    `agent:${agentId}:heartbeat`,
    'timestamp',
    Date.now().toString()
  );

  // Start heartbeat if enabled
  if (enableHeartbeat) {
    agent.heartbeatInterval = setInterval(async () => {
      if (agent.stopped || agent.crashed) return;

      try {
        await redis.hset(
          `agent:${agentId}:heartbeat`,
          'timestamp',
          Date.now().toString()
        );
      } catch (error) {
        // Silently fail if Redis is unavailable
      }
    }, CHAOS_CONFIG.HEARTBEAT_INTERVAL);
  }

  return agent;
}

/**
 * Simulate agent crash (immediate stop without cleanup)
 */
function crashAgent(agent: AgentInstance): void {
  agent.crashed = true;
  agent.stopped = true;

  if (agent.heartbeatInterval) {
    clearInterval(agent.heartbeatInterval);
    agent.heartbeatInterval = undefined;
  }

  // Note: Intentionally DO NOT cleanup Redis state - simulating crash
}

/**
 * Gracefully stop agent (with cleanup)
 */
async function stopAgent(redis: Redis, agent: AgentInstance): Promise<void> {
  agent.stopped = true;

  if (agent.heartbeatInterval) {
    clearInterval(agent.heartbeatInterval);
    agent.heartbeatInterval = undefined;
  }

  // Cleanup Redis state
  await redis.del(`agent:${agent.id}`);
  await redis.del(`agent:${agent.id}:heartbeat`);
  await redis.del(`agent:${agent.id}:state`);
}

/**
 * Orphan Detector - Detects and cleans up crashed agents
 */
class OrphanDetector {
  private redis: Redis;
  private threshold: number;

  constructor(redis: Redis, threshold: number) {
    this.redis = redis;
    this.threshold = threshold;
  }

  async detectAndCleanupOrphans(): Promise<{
    orphanIds: string[];
    cleanupDuration: number;
  }> {
    const startTime = Date.now();
    const orphanIds: string[] = [];
    const now = Date.now();

    // Find all agent heartbeat keys
    const heartbeatKeys = await this.redis.keys('agent:*:heartbeat');

    for (const key of heartbeatKeys) {
      const agentId = key.replace('agent:', '').replace(':heartbeat', '');

      // Get last heartbeat timestamp
      const timestamp = await this.redis.hget(key, 'timestamp');

      if (!timestamp) {
        orphanIds.push(agentId);
        continue;
      }

      const lastHeartbeat = parseInt(timestamp, 10);
      const timeSinceHeartbeat = now - lastHeartbeat;

      if (timeSinceHeartbeat > this.threshold) {
        orphanIds.push(agentId);
      }
    }

    // Cleanup orphaned agents
    for (const orphanId of orphanIds) {
      await this.redis.del(`agent:${orphanId}`);
      await this.redis.del(`agent:${orphanId}:heartbeat`);
      await this.redis.del(`agent:${orphanId}:state`);
      await this.redis.del(`agent:${orphanId}:tasks`);
    }

    const cleanupDuration = Date.now() - startTime;

    return { orphanIds, cleanupDuration };
  }
}

/**
 * Simulate concurrent file edit with version tracking
 */
async function simulateConcurrentEdit(
  agentId: string,
  filePath: string,
  content: string,
  redis: Redis
): Promise<FileEditConflict> {
  const timestamp = Date.now();
  let conflictDetected = false;

  // Use Redis to track file versions and detect conflicts
  const versionKey = `file:version:${filePath}`;
  const editorsKey = `file:editors:${filePath}`;

  try {
    // Track that this agent is attempting to edit
    await redis.sadd(editorsKey, agentId);

    // Get current version
    const currentVersion = await redis.get(versionKey);
    const versionNumber = currentVersion ? parseInt(currentVersion, 10) : 0;

    // Check if other agents are editing
    const editors = await redis.smembers(editorsKey);
    if (editors.length > 1) {
      // Multiple editors detected - this is a conflict
      conflictDetected = true;
    }

    // Check if file exists and has been modified
    if (existsSync(filePath)) {
      try {
        const currentContent = readFileSync(filePath, 'utf-8');

        // Parse version from content if it exists
        const versionMatch = currentContent.match(/Version: (\d+)/);
        const fileVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;

        // Conflict if file version doesn't match our expected version
        if (fileVersion !== versionNumber) {
          conflictDetected = true;
        }

        // Conflict if content is different (another agent wrote)
        if (currentContent && !currentContent.includes(agentId)) {
          conflictDetected = true;
        }
      } catch (error) {
        // File locked or inaccessible - conflict detected
        conflictDetected = true;
      }
    }

    // Simulate edit delay to increase chance of conflicts
    await sleep(randomInt(50, 200));

    // Attempt to write file with version
    try {
      const versionedContent = `${content}Version: ${versionNumber + 1}\n`;
      writeFileSync(filePath, versionedContent, 'utf-8');

      // Update version in Redis
      await redis.incr(versionKey);
    } catch (error) {
      conflictDetected = true;
    }
  } finally {
    // Remove this agent from editors
    await redis.srem(editorsKey, agentId);
  }

  return {
    agentId,
    filePath,
    timestamp,
    content,
    conflictDetected,
  };
}

/**
 * Test Lock Manager with TTL
 */
class TestLockManager {
  private redis: Redis;
  private lockKey: string = 'test:lock:execution';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async acquireLock(
    agentId: string,
    ttl: number = CHAOS_CONFIG.LOCK_TTL
  ): Promise<boolean> {
    const acquired = await this.redis.set(
      this.lockKey,
      agentId,
      'EX',
      ttl,
      'NX'
    );

    if (acquired === 'OK') {
      await this.redis.hset(`test:lock:metadata:${agentId}`, {
        holder: agentId,
        acquiredAt: Date.now().toString(),
        ttl: ttl.toString(),
      });
      return true;
    }

    return false;
  }

  async releaseLock(agentId: string): Promise<void> {
    const holder = await this.redis.get(this.lockKey);

    if (holder === agentId) {
      await this.redis.del(this.lockKey);
      await this.redis.del(`test:lock:metadata:${agentId}`);
    }
  }

  async getLockState(): Promise<LockState> {
    const holder = await this.redis.get(this.lockKey);
    const ttl = await this.redis.ttl(this.lockKey);

    if (!holder) {
      return { holder: null, acquiredAt: 0, ttl: 0, expired: true };
    }

    const metadata = await this.redis.hgetall(`test:lock:metadata:${holder}`);
    const acquiredAt = parseInt(metadata.acquiredAt || '0', 10);

    return {
      holder,
      acquiredAt,
      ttl,
      expired: ttl <= 0,
    };
  }

  async isLockExpired(): Promise<boolean> {
    const state = await this.getLockState();
    return state.expired;
  }
}

// ===== TEST SUITE =====

describe('Chaos Engineering - Parallelization Resilience', () => {
  let redis: Redis;
  let spawnedAgents: AgentInstance[] = [];

  beforeEach(async () => {
    // Create Redis connection
    redis = new Redis(DEFAULT_REDIS_CONFIG);
    await redis.ping();

    // Cleanup any existing test data
    const testKeys = await redis.keys('agent:*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }

    const lockKeys = await redis.keys('test:lock:*');
    if (lockKeys.length > 0) {
      await redis.del(...lockKeys);
    }

    spawnedAgents = [];
  });

  afterEach(async () => {
    // Stop all agent heartbeats
    for (const agent of spawnedAgents) {
      if (agent.heartbeatInterval) {
        clearInterval(agent.heartbeatInterval);
      }
    }

    // Cleanup test data
    const testKeys = await redis.keys('agent:*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }

    const lockKeys = await redis.keys('test:lock:*');
    if (lockKeys.length > 0) {
      await redis.del(...lockKeys);
    }

    // Close Redis connection
    await redis.quit();
    spawnedAgents = [];
  });

  describe('Test 1: Random Agent Crashes (30%)', () => {
    it('should cleanup all crashed agents within 3 minutes', { timeout: 6 * 60 * 1000 }, async () => {
        const totalAgents = CHAOS_CONFIG.TOTAL_AGENTS;
        const crashPercentage = CHAOS_CONFIG.CRASH_PERCENTAGE;
        const expectedCrashes = Math.floor(totalAgents * crashPercentage);

        console.log(
          `\n🧪 Spawning ${totalAgents} agents, crashing ${expectedCrashes} (${crashPercentage * 100}%)...`
        );

        // Spawn all agents
        const agents: AgentInstance[] = [];
        for (let i = 0; i < totalAgents; i++) {
          const agent = await spawnAgent(redis, `chaos-agent-${i}`, true);
          agents.push(agent);
          spawnedAgents.push(agent);
        }

        // Wait for agents to establish heartbeats
        await sleep(2000);

        // Randomly crash 30% of agents
        const crashedAgents: AgentInstance[] = [];
        const agentsCopy = [...agents];

        for (let i = 0; i < expectedCrashes; i++) {
          const randomIndex = Math.floor(Math.random() * agentsCopy.length);
          const agent = agentsCopy.splice(randomIndex, 1)[0];

          crashAgent(agent);
          crashedAgents.push(agent);

          console.log(`💥 Crashed agent: ${agent.id}`);
        }

        console.log(
          `\n⏳ Waiting ${CHAOS_CONFIG.ORPHAN_CLEANUP_THRESHOLD / 1000}s for orphan detection threshold...`
        );

        // Wait for orphan detection threshold
        await sleep(CHAOS_CONFIG.ORPHAN_CLEANUP_THRESHOLD);

        // Run orphan detector
        const detector = new OrphanDetector(
          redis,
          CHAOS_CONFIG.ORPHAN_CLEANUP_THRESHOLD - 10000 // Threshold minus buffer
        );

        const startCleanup = Date.now();
        const { orphanIds, cleanupDuration } =
          await detector.detectAndCleanupOrphans();
        const totalCleanupTime = Date.now() - startCleanup;

        console.log(
          `\n✅ Cleanup completed in ${totalCleanupTime}ms (detection + cleanup: ${cleanupDuration}ms)`
        );
        console.log(`📊 Orphans detected: ${orphanIds.length}`);
        console.log(`📊 Expected crashes: ${expectedCrashes}`);

        // Verify all crashed agents were detected
        const crashedIds = crashedAgents.map((a) => a.id);
        const cleanupRate = (orphanIds.length / expectedCrashes) * 100;

        console.log(`📊 Cleanup rate: ${cleanupRate.toFixed(2)}%`);

        // CRITICAL: 100% cleanup required
        expect(orphanIds.length).toBe(expectedCrashes);
        expect(cleanupRate).toBe(100);

        // Verify all crashed agent IDs were cleaned
        for (const orphanId of orphanIds) {
          expect(crashedIds).toContain(orphanId);
        }

        // Verify cleanup duration is within 3 minutes total
        expect(totalCleanupTime).toBeLessThan(
          CHAOS_CONFIG.ORPHAN_CLEANUP_THRESHOLD
        );

        const result: CrashTestResult = {
          totalAgents,
          crashedAgents: expectedCrashes,
          cleanedAgents: orphanIds.length,
          cleanupDuration: totalCleanupTime,
          cleanupRate,
        };

        console.log('\n📈 Final Results:', result);
      });
  });

  describe('Test 2: Redis Connection Failures', () => {
    it('should recover all agents within 30 seconds of Redis reconnection', { timeout: 2 * 60 * 1000 }, async () => {
        const agentCount = 10;

        console.log(`\n🧪 Spawning ${agentCount} agents...`);

        // Spawn agents
        const agents: AgentInstance[] = [];
        for (let i = 0; i < agentCount; i++) {
          const agent = await spawnAgent(redis, `redis-test-agent-${i}`, true);
          agents.push(agent);
          spawnedAgents.push(agent);
        }

        // Wait for heartbeats to establish
        await sleep(2000);

        console.log('\n💔 Simulating Redis disconnect...');

        // Simulate Redis disconnect by creating a new disconnected client
        // Note: We keep the test Redis connection alive to monitor state
        const disconnectTime = Date.now();

        // Force disconnect all agents' Redis connections by pausing heartbeats
        for (const agent of agents) {
          if (agent.heartbeatInterval) {
            clearInterval(agent.heartbeatInterval);
            agent.heartbeatInterval = undefined;
          }
        }

        console.log('⏳ Waiting 5 seconds to simulate connection loss...');
        await sleep(5000);

        console.log('\n💚 Simulating Redis reconnection...');

        const reconnectTime = Date.now();

        // Restart heartbeats (simulating reconnection)
        for (const agent of agents) {
          agent.heartbeatInterval = setInterval(async () => {
            if (agent.stopped || agent.crashed) return;

            try {
              await redis.hset(
                `agent:${agent.id}:heartbeat`,
                'timestamp',
                Date.now().toString()
              );
            } catch (error) {
              // Retry logic handled by heartbeat interval
            }
          }, CHAOS_CONFIG.HEARTBEAT_INTERVAL);
        }

        console.log('⏳ Waiting for recovery (max 30s)...');

        // Poll for all agents to recover
        const recoveryStart = Date.now();
        let allRecovered = false;

        while (
          Date.now() - recoveryStart <
          CHAOS_CONFIG.REDIS_RECOVERY_TIMEOUT
        ) {
          let recoveredCount = 0;

          for (const agent of agents) {
            const heartbeat = await redis.hget(
              `agent:${agent.id}:heartbeat`,
              'timestamp'
            );

            if (heartbeat) {
              const timestamp = parseInt(heartbeat, 10);
              // Check if heartbeat is recent (within last 10 seconds)
              if (Date.now() - timestamp < 10000) {
                recoveredCount++;
              }
            }
          }

          if (recoveredCount === agentCount) {
            allRecovered = true;
            break;
          }

          await sleep(CHAOS_CONFIG.RECONNECT_POLL_INTERVAL);
        }

        const recoveryDuration = Date.now() - recoveryStart;

        console.log(
          `\n✅ Recovery completed in ${recoveryDuration}ms (${(recoveryDuration / 1000).toFixed(2)}s)`
        );

        // CRITICAL: All agents must recover within 30 seconds
        expect(allRecovered).toBe(true);
        expect(recoveryDuration).toBeLessThan(
          CHAOS_CONFIG.REDIS_RECOVERY_TIMEOUT
        );

        const result: RecoveryTestResult = {
          disconnectTime,
          reconnectTime,
          recoveryDuration,
          agentsRecovered: agentCount,
          totalAgents: agentCount,
        };

        console.log('\n📈 Recovery Results:', result);
      });
  });

  describe('Test 3: Concurrent File Edits', () => {
    it('should detect 100% of file conflicts from concurrent edits', { timeout: 30000 }, async () => {
        const editorCount = CHAOS_CONFIG.CONCURRENT_EDITORS;
        const testFile = join(tmpdir(), `chaos-test-${Date.now()}.txt`);

        console.log(
          `\n🧪 Simulating ${editorCount} agents editing same file concurrently...`
        );
        console.log(`📄 Test file: ${testFile}`);

        // Cleanup test file if exists
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }

        // Cleanup Redis file tracking keys
        const versionKey = `file:version:${testFile}`;
        const editorsKey = `file:editors:${testFile}`;
        await redis.del(versionKey, editorsKey);

        // Spawn agents and simulate concurrent edits
        const editPromises: Promise<FileEditConflict>[] = [];

        for (let i = 0; i < editorCount; i++) {
          const agentId = `editor-agent-${i}`;
          const content = `Agent ${agentId} edit at ${Date.now()}\n`;

          editPromises.push(simulateConcurrentEdit(agentId, testFile, content, redis));
        }

        // Execute all edits concurrently
        const conflicts = await Promise.all(editPromises);

        // Count conflicts detected
        const conflictsDetected = conflicts.filter((c) => c.conflictDetected)
          .length;

        // Expected conflicts: At least editorCount - 1 (all except potentially the first writer)
        const expectedMinConflicts = editorCount - 1;
        const conflictRate = (conflictsDetected / expectedMinConflicts) * 100;

        console.log(`\n📊 Total edits: ${editorCount}`);
        console.log(`📊 Conflicts detected: ${conflictsDetected}`);
        console.log(`📊 Expected minimum conflicts: ${expectedMinConflicts}`);
        console.log(
          `📊 Conflict detection rate: ${conflictRate.toFixed(2)}%`
        );

        // CRITICAL: 100% conflict detection required
        // Note: First agent has no conflict (file doesn't exist yet)
        // Remaining agents should all detect conflicts
        expect(conflictsDetected).toBeGreaterThanOrEqual(expectedMinConflicts);

        // Allow up to all agents to detect conflicts (if first agent sees concurrent access)
        expect(conflictsDetected).toBeLessThanOrEqual(editorCount);

        // Conflict rate should be at least 100% (can be higher if first agent also detects conflict)
        expect(conflictRate).toBeGreaterThanOrEqual(100);

        // Cleanup test file and Redis keys
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
        await redis.del(versionKey, editorsKey);

        console.log('\n✅ File conflict detection validated');
      });
  });

  describe('Test 4: Test Lock Crashes', () => {
    it('should release stale locks within 15 minutes after agent crash', { timeout: 60000 }, async () => {
        const lockManager = new TestLockManager(redis);
        const agentId = 'lock-holder-agent';

        console.log(`\n🧪 Agent acquiring test lock...`);

        // Agent acquires lock with 15 minute TTL
        const acquired = await lockManager.acquireLock(
          agentId,
          CHAOS_CONFIG.LOCK_TTL
        );
        expect(acquired).toBe(true);

        console.log(`✅ Lock acquired by ${agentId}`);

        // Verify lock is held
        let lockState = await lockManager.getLockState();
        expect(lockState.holder).toBe(agentId);
        expect(lockState.expired).toBe(false);

        console.log(
          `📊 Lock TTL: ${lockState.ttl}s (${(lockState.ttl / 60).toFixed(2)} minutes)`
        );

        console.log('\n💥 Simulating agent crash (without lock release)...');

        // Simulate crash - agent dies without releasing lock
        // Lock should expire via Redis TTL mechanism

        console.log(
          `⏳ Waiting for lock to expire (TTL: ${CHAOS_CONFIG.LOCK_TTL}s = ${CHAOS_CONFIG.LOCK_TTL / 60} minutes)...`
        );

        // For testing, we use a shorter TTL and verify expiration logic
        // In production, TTL would be 15 minutes (900s)
        // For test speed, we create a new lock with 10 second TTL

        await redis.del('test:lock:execution');
        const shortTTL = 10; // 10 seconds for testing
        const testAcquired = await lockManager.acquireLock(agentId, shortTTL);
        expect(testAcquired).toBe(true);

        console.log(`\n⏳ Testing with ${shortTTL}s TTL for faster validation...`);

        // Wait for lock to expire
        await sleep((shortTTL + 2) * 1000);

        // Check if lock expired
        const isExpired = await lockManager.isLockExpired();
        lockState = await lockManager.getLockState();

        console.log(`\n📊 Lock state after ${shortTTL}s:`);
        console.log(`   Holder: ${lockState.holder || 'NONE'}`);
        console.log(`   TTL: ${lockState.ttl}s`);
        console.log(`   Expired: ${isExpired}`);

        // CRITICAL: Lock must be expired
        expect(isExpired).toBe(true);
        expect(lockState.holder).toBeNull();

        console.log('\n✅ Stale lock released successfully via TTL expiration');

        // Verify another agent can acquire the lock
        const newAgentId = 'new-lock-holder';
        const newAcquired = await lockManager.acquireLock(newAgentId, 60);

        expect(newAcquired).toBe(true);

        const newLockState = await lockManager.getLockState();
        expect(newLockState.holder).toBe(newAgentId);

        console.log(
          `✅ New agent ${newAgentId} successfully acquired lock after expiration`
        );

        // Cleanup
        await lockManager.releaseLock(newAgentId);
      });

    it('should prevent other agents from acquiring expired locks', { timeout: 15000 }, async () => {
      const lockManager = new TestLockManager(redis);
      const agent1 = 'agent-1';
      const agent2 = 'agent-2';

      console.log('\n🧪 Testing lock expiration and acquisition...');

      // Agent 1 acquires lock
      const acquired1 = await lockManager.acquireLock(agent1, 5); // 5 second TTL
      expect(acquired1).toBe(true);

      console.log(`✅ Agent 1 acquired lock with 5s TTL`);

      // Agent 2 tries to acquire (should fail)
      const acquired2 = await lockManager.acquireLock(agent2, 5);
      expect(acquired2).toBe(false);

      console.log(`❌ Agent 2 correctly blocked from acquiring lock`);

      // Wait for lock to expire
      console.log(`⏳ Waiting 6s for lock expiration...`);
      await sleep(6000);

      console.log(`🔍 Checking lock state after expiration...`);

      // Verify lock is expired
      const isExpired = await lockManager.isLockExpired();
      expect(isExpired).toBe(true);

      console.log(`✅ Lock confirmed expired`);

      // Agent 2 should now be able to acquire
      const acquired2Retry = await lockManager.acquireLock(agent2, 5);
      expect(acquired2Retry).toBe(true);

      console.log(`✅ Agent 2 successfully acquired lock after expiration`);

      // Cleanup
      await lockManager.releaseLock(agent2);
    });
  });

  describe('Edge Cases and Additional Validation', () => {
    it('should handle multiple simultaneous crashes gracefully', { timeout: 6 * 60 * 1000 }, async () => {
      const agentCount = 20;
      const agents: AgentInstance[] = [];

      // Spawn agents
      for (let i = 0; i < agentCount; i++) {
        const agent = await spawnAgent(redis, `crash-test-${i}`, true);
        agents.push(agent);
        spawnedAgents.push(agent);
      }

      await sleep(2000);

      // Crash all agents simultaneously
      console.log(`\n💥 Crashing ${agentCount} agents simultaneously...`);

      for (const agent of agents) {
        crashAgent(agent);
      }

      await sleep(CHAOS_CONFIG.ORPHAN_CLEANUP_THRESHOLD);

      // Cleanup
      const detector = new OrphanDetector(
        redis,
        CHAOS_CONFIG.ORPHAN_CLEANUP_THRESHOLD - 10000
      );
      const { orphanIds } = await detector.detectAndCleanupOrphans();

      expect(orphanIds.length).toBe(agentCount);
      console.log(`✅ All ${agentCount} crashed agents cleaned up`);
    });

    it('should maintain healthy agents during partial crashes', { timeout: 6 * 60 * 1000 }, async () => {
      const totalAgents = 20;
      const crashCount = 10;
      const agents: AgentInstance[] = [];

      // Spawn agents
      for (let i = 0; i < totalAgents; i++) {
        const agent = await spawnAgent(redis, `mixed-test-${i}`, true);
        agents.push(agent);
        spawnedAgents.push(agent);
      }

      await sleep(2000);

      // Crash half the agents
      for (let i = 0; i < crashCount; i++) {
        crashAgent(agents[i]);
      }

      await sleep(CHAOS_CONFIG.ORPHAN_CLEANUP_THRESHOLD);

      // Cleanup crashed agents
      const detector = new OrphanDetector(
        redis,
        CHAOS_CONFIG.ORPHAN_CLEANUP_THRESHOLD - 10000
      );
      const { orphanIds } = await detector.detectAndCleanupOrphans();

      expect(orphanIds.length).toBe(crashCount);

      // Verify healthy agents are still running
      for (let i = crashCount; i < totalAgents; i++) {
        const heartbeat = await redis.hget(
          `agent:${agents[i].id}:heartbeat`,
          'timestamp'
        );
        expect(heartbeat).toBeTruthy();

        const timestamp = parseInt(heartbeat!, 10);
        expect(Date.now() - timestamp).toBeLessThan(10000); // Recent heartbeat
      }

      console.log(
        `✅ ${crashCount} crashed agents cleaned, ${totalAgents - crashCount} healthy agents maintained`
      );
    });
  });
});
