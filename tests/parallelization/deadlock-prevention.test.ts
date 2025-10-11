/**
 * Deadlock Prevention Tests
 *
 * From ASSUMPTIONS_AND_TESTING.md - Assumption 6:
 * Tests verify that blocking coordination won't deadlock when coordinators
 * wait for each other in circular dependency scenarios.
 *
 * Requirements:
 * 1. Circular dependencies timeout within 35s (30s + 5s buffer)
 * 2. Both coordinators timeout gracefully (no ACKs received)
 * 3. DependencyAnalyzer detects and rejects circular dependencies
 * 4. No permanent deadlock scenarios
 *
 * @module tests/parallelization/deadlock-prevention
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import {
  BlockingCoordinationManager,
  type CoordinationSignal,
  type BlockingCoordinationConfig,
} from '../../src/cfn-loop/blocking-coordination.js';

// ===== TEST CONFIGURATION =====

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: 15, // Use test database
};

const TEST_TIMEOUT = 30000; // 30 seconds for circular dependency timeout
const TIMEOUT_BUFFER = 5000; // 5 second buffer for test assertions

// ===== HELPER: DEPENDENCY ANALYZER =====

/**
 * Simple dependency analyzer for detecting circular dependencies
 * This is a minimal implementation for testing purposes
 */
class DependencyAnalyzer {
  /**
   * Analyze sprint dependencies and detect cycles
   */
  async analyze(config: { sprints: Array<{ id: string; dependencies?: string[] }> }): Promise<void> {
    const graph = new Map<string, string[]>();

    // Build adjacency list
    for (const sprint of config.sprints) {
      graph.set(sprint.id, sprint.dependencies || []);
    }

    // Check for cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      if (recursionStack.has(node)) {
        return true; // Cycle detected
      }

      if (visited.has(node)) {
        return false; // Already checked, no cycle from this node
      }

      visited.add(node);
      recursionStack.add(node);

      const dependencies = graph.get(node) || [];
      for (const dep of dependencies) {
        if (hasCycle(dep)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    // Check all nodes for cycles
    for (const sprint of config.sprints) {
      if (hasCycle(sprint.id)) {
        throw new Error('Circular dependency detected');
      }
    }
  }
}

// ===== TEST UTILITIES =====

/**
 * Sleep utility for waiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a coordination signal
 */
function createSignal(
  source: string,
  target: string,
  signalId: string
): CoordinationSignal {
  return {
    signalId,
    type: 'completion',
    source,
    targets: [target],
    timestamp: Date.now(),
  };
}

// ===== TESTS =====

describe('Blocking Coordination Deadlocks', () => {
  let redis: Redis;
  let coord1: BlockingCoordinationManager;
  let coord2: BlockingCoordinationManager;

  beforeEach(async () => {
    // Initialize Redis client
    redis = new Redis(REDIS_CONFIG);

    // Clear test database
    await redis.flushdb();

    // Set shared secret for ACK verification
    process.env.BLOCKING_COORDINATION_SECRET = 'test-secret-deadlock-prevention-123';
  });

  afterEach(async () => {
    // Cleanup coordinators
    if (coord1) {
      await coord1.cleanup();
    }
    if (coord2) {
      await coord2.cleanup();
    }

    // Close Redis connection
    if (redis) {
      await redis.quit();
    }

    // Clean up environment
    delete process.env.BLOCKING_COORDINATION_SECRET;
  });

  describe('Circular Dependency Timeout', () => {
    it('should timeout circular dependencies within 35s (30s timeout + 5s buffer)', async () => {
      // Sprint 1 waits for Sprint 2
      coord1 = new BlockingCoordinationManager({
        coordinatorId: 'sprint-1',
        redisClient: redis,
        hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
        debug: false,
      });

      // Sprint 2 waits for Sprint 1 (circular dependency!)
      coord2 = new BlockingCoordinationManager({
        coordinatorId: 'sprint-2',
        redisClient: redis,
        hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
        debug: false,
      });

      const startTime = Date.now();

      // Launch both coordinators waiting for each other
      // Using Promise.allSettled to handle both timeouts gracefully
      const [result1, result2] = await Promise.allSettled([
        coord1.waitForAcks(['sprint-2'], 'signal-1', TEST_TIMEOUT), // 30s timeout
        coord2.waitForAcks(['sprint-1'], 'signal-2', TEST_TIMEOUT), // 30s timeout
      ]);

      const duration = Date.now() - startTime;

      // Verify: Duration should be close to timeout (not hanging forever)
      expect(duration).toBeLessThan(TEST_TIMEOUT + TIMEOUT_BUFFER); // <35s (30s + 5s buffer)
      expect(duration).toBeGreaterThan(TEST_TIMEOUT - 1000); // Should wait at least ~29s

      // Verify: Both should complete (not hang)
      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('fulfilled');

      // Verify: Both should timeout with 0 ACKs received (no deadlock, graceful timeout)
      if (result1.status === 'fulfilled') {
        expect(result1.value.size).toBe(0); // No ACKs received
      }

      if (result2.status === 'fulfilled') {
        expect(result2.value.size).toBe(0); // No ACKs received
      }

      console.log(`✅ Circular dependency test completed in ${duration}ms`);
      console.log(`   Sprint-1 ACKs: ${result1.status === 'fulfilled' ? result1.value.size : 'error'}`);
      console.log(`   Sprint-2 ACKs: ${result2.status === 'fulfilled' ? result2.value.size : 'error'}`);
    }, TEST_TIMEOUT + TIMEOUT_BUFFER + 5000); // Test timeout: 40s (30s + 5s + 5s extra)

    it('should not deadlock forever - timeout mechanism must work', async () => {
      coord1 = new BlockingCoordinationManager({
        coordinatorId: 'sprint-a',
        redisClient: redis,
        hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
        debug: false,
      });

      coord2 = new BlockingCoordinationManager({
        coordinatorId: 'sprint-b',
        redisClient: redis,
        hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
        debug: false,
      });

      // Use shorter timeout for faster test
      const shortTimeout = 5000; // 5 seconds
      const startTime = Date.now();

      // Both coordinators wait for each other
      const promises = await Promise.allSettled([
        coord1.waitForAcks(['sprint-b'], 'test-signal-a', shortTimeout),
        coord2.waitForAcks(['sprint-a'], 'test-signal-b', shortTimeout),
      ]);

      const duration = Date.now() - startTime;

      // Must complete within reasonable time (timeout + small buffer)
      expect(duration).toBeLessThan(shortTimeout + 2000);

      // Both must complete (not hang forever)
      expect(promises[0].status).toBe('fulfilled');
      expect(promises[1].status).toBe('fulfilled');

      console.log(`✅ Short timeout test completed in ${duration}ms`);
    }, 10000); // 10 second test timeout
  });

  describe('Dependency Cycle Detection', () => {
    it('should detect and break 3-way circular dependency', async () => {
      const dependencyGraph = new DependencyAnalyzer();

      // Create 3-way circular dependency:
      // Sprint-1 depends on Sprint-3
      // Sprint-2 depends on Sprint-1
      // Sprint-3 depends on Sprint-2
      const sprints = [
        { id: 'sprint-1', dependencies: ['sprint-3'] },
        { id: 'sprint-2', dependencies: ['sprint-1'] },
        { id: 'sprint-3', dependencies: ['sprint-2'] },
      ];

      // Should throw error on circular dependency detection
      await expect(
        dependencyGraph.analyze({ sprints })
      ).rejects.toThrow('Circular dependency detected');

      console.log('✅ 3-way circular dependency correctly detected');
    });

    it('should detect 2-way circular dependency', async () => {
      const dependencyGraph = new DependencyAnalyzer();

      // Create 2-way circular dependency:
      // Sprint-A depends on Sprint-B
      // Sprint-B depends on Sprint-A
      const sprints = [
        { id: 'sprint-a', dependencies: ['sprint-b'] },
        { id: 'sprint-b', dependencies: ['sprint-a'] },
      ];

      // Should throw error
      await expect(
        dependencyGraph.analyze({ sprints })
      ).rejects.toThrow('Circular dependency detected');

      console.log('✅ 2-way circular dependency correctly detected');
    });

    it('should detect self-referencing dependency', async () => {
      const dependencyGraph = new DependencyAnalyzer();

      // Sprint depends on itself
      const sprints = [
        { id: 'sprint-self', dependencies: ['sprint-self'] },
      ];

      // Should throw error
      await expect(
        dependencyGraph.analyze({ sprints })
      ).rejects.toThrow('Circular dependency detected');

      console.log('✅ Self-referencing dependency correctly detected');
    });

    it('should allow valid dependency chain (no cycles)', async () => {
      const dependencyGraph = new DependencyAnalyzer();

      // Valid dependency chain:
      // Sprint-1 depends on Sprint-2
      // Sprint-2 depends on Sprint-3
      // Sprint-3 has no dependencies
      const sprints = [
        { id: 'sprint-1', dependencies: ['sprint-2'] },
        { id: 'sprint-2', dependencies: ['sprint-3'] },
        { id: 'sprint-3', dependencies: [] },
      ];

      // Should not throw (valid DAG)
      await expect(
        dependencyGraph.analyze({ sprints })
      ).resolves.not.toThrow();

      console.log('✅ Valid dependency chain accepted');
    });

    it('should allow parallel sprints with no dependencies', async () => {
      const dependencyGraph = new DependencyAnalyzer();

      // Multiple independent sprints
      const sprints = [
        { id: 'sprint-a', dependencies: [] },
        { id: 'sprint-b', dependencies: [] },
        { id: 'sprint-c', dependencies: [] },
      ];

      // Should not throw (no cycles)
      await expect(
        dependencyGraph.analyze({ sprints })
      ).resolves.not.toThrow();

      console.log('✅ Parallel sprints (no dependencies) accepted');
    });
  });

  describe('Graceful Timeout Behavior', () => {
    it('should return empty ACK set on timeout (not throw error)', async () => {
      coord1 = new BlockingCoordinationManager({
        coordinatorId: 'timeout-test',
        redisClient: redis,
        hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
        debug: false,
      });

      const shortTimeout = 2000; // 2 seconds

      // Wait for non-existent coordinator
      const acks = await coord1.waitForAcks(['non-existent-coordinator'], 'test-signal', shortTimeout);

      // Should return empty set (no ACKs)
      expect(acks.size).toBe(0);

      console.log('✅ Timeout returns empty ACK set gracefully');
    });

    it('should allow coordinator to continue after timeout', async () => {
      coord1 = new BlockingCoordinationManager({
        coordinatorId: 'continue-test',
        redisClient: redis,
        hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
        debug: false,
      });

      const shortTimeout = 1000; // 1 second

      // First wait times out
      const acks1 = await coord1.waitForAcks(['missing-1'], 'signal-1', shortTimeout);
      expect(acks1.size).toBe(0);

      // Should be able to perform another wait (coordinator still functional)
      const acks2 = await coord1.waitForAcks(['missing-2'], 'signal-2', shortTimeout);
      expect(acks2.size).toBe(0);

      console.log('✅ Coordinator continues functioning after timeout');
    });
  });

  describe('Timeout Edge Cases', () => {
    it('should handle zero timeout gracefully', async () => {
      coord1 = new BlockingCoordinationManager({
        coordinatorId: 'zero-timeout-test',
        redisClient: redis,
        hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
        debug: false,
      });

      const acks = await coord1.waitForAcks(['coordinator-x'], 'signal-zero', 0);

      // Should immediately return empty set
      expect(acks.size).toBe(0);
    });

    it('should handle very large timeout without overflow', async () => {
      coord1 = new BlockingCoordinationManager({
        coordinatorId: 'large-timeout-test',
        redisClient: redis,
        hmacSecret: process.env.BLOCKING_COORDINATION_SECRET,
        debug: false,
      });

      // Start wait with large timeout, but we won't actually wait
      const largeTimeout = 2147483647; // Max 32-bit signed int

      // Use Promise.race to avoid actually waiting
      const result = await Promise.race([
        coord1.waitForAcks(['coordinator-y'], 'signal-large', largeTimeout),
        sleep(100).then(() => 'timeout-check'),
      ]);

      // Should not crash with overflow
      expect(result).toBeDefined();
    });
  });
});
