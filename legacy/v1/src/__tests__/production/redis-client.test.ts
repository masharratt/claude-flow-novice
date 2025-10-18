/**
 * Comprehensive Production-Ready Test Suite for Redis Client
 *
 * Tests connection pooling, performance, state persistence, TTL management,
 * and concurrent operations for 1000+ agents
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { createClient } from 'redis';
import {
  connectRedis,
  saveSwarmState,
  loadSwarmState,
  listActiveSwarms,
  deleteSwarmState,
  updateSwarmStatus,
  getSwarmMetrics,
  cleanupExpiredSwarms,
  backupSwarmStates,
  restoreSwarmStates,
  checkRedisHealth
} from '../../../src/cli/utils/redis-client.js';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(true),
    readFile: jest.fn().mockResolvedValue(JSON.stringify({
      timestamp: Date.now(),
      swarms: [],
      count: 0
    }))
  }
}));

describe('Redis Client Production Tests', () => {
  let redisClient;
  let testConfig;

  // Test data generators
  const generateTestSwarmState = (overrides = {}) => ({
    id: `test-swarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    objective: 'Test objective for Redis client validation',
    status: 'running',
    startTime: Date.now(),
    agents: Array.from({ length: 10 }, (_, i) => ({
      id: `agent-${i}`,
      type: ['coder', 'tester', 'reviewer', 'architect'][i % 4],
      status: 'active',
      confidence: 0.8 + Math.random() * 0.2,
      tasks: [`task-${i}-1`, `task-${i}-2`]
    })),
    tasks: Array.from({ length: 20 }, (_, i) => ({
      id: `task-${i}`,
      description: `Test task ${i}`,
      status: ['pending', 'in_progress', 'completed'][i % 3],
      assignedTo: `agent-${i % 10}`,
      priority: ['low', 'medium', 'high'][i % 3]
    })),
    metadata: {
      version: '1.0.0',
      strategy: 'development',
      mode: 'mesh',
      maxAgents: 50,
      confidence: 0.85
    },
    ...overrides
  });

  beforeAll(async () => {
    // Configure Redis connection for testing
    testConfig = {
      host: process.env.REDIS_TEST_HOST || 'localhost',
      port: parseInt(process.env.REDIS_TEST_PORT) || 6379,
      database: parseInt(process.env.REDIS_TEST_DB) || 1, // Use separate DB for tests
      connectTimeout: 5000,
      lazyConnect: true
    };

    // Connect to Redis
    redisClient = await connectRedis(testConfig);
  });

  afterAll(async () => {
    if (redisClient) {
      await redisClient.quit();
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    const testKeys = await redisClient.keys('test-swarm-*');
    if (testKeys.length > 0) {
      await redisClient.del(testKeys);
    }
  });

  afterEach(async () => {
    // Additional cleanup after each test
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should establish connection with default configuration', async () => {
      const client = await connectRedis();
      expect(client).toBeDefined();
      expect(client.isOpen).toBe(true);
      await client.quit();
    });

    it('should establish connection with custom configuration', async () => {
      const customConfig = {
        host: testConfig.host,
        port: testConfig.port,
        database: testConfig.database + 1,
        connectTimeout: 3000
      };

      const client = await connectRedis(customConfig);
      expect(client).toBeDefined();
      expect(client.isOpen).toBe(true);
      await client.quit();
    });

    it('should handle connection failures gracefully', async () => {
      const invalidConfig = {
        host: 'invalid-host-that-does-not-exist',
        port: 9999,
        connectTimeout: 1000
      };

      await expect(connectRedis(invalidConfig)).rejects.toThrow('Failed to connect to Redis');
    });

    it('should reconnect after connection loss', async () => {
      const client = await connectRedis(testConfig);

      // Simulate connection loss
      await client.disconnect();

      // Should be able to reconnect
      await client.connect();
      expect(client.isOpen).toBe(true);

      await client.quit();
    });
  });

  describe('State Persistence and Retrieval', () => {
    it('should save and retrieve swarm state with data integrity', async () => {
      const originalState = generateTestSwarmState();

      // Save state
      await saveSwarmState(redisClient, originalState.id, originalState);

      // Retrieve state
      const retrievedState = await loadSwarmState(redisClient, originalState.id);

      expect(retrievedState).not.toBeNull();
      expect(retrievedState.id).toBe(originalState.id);
      expect(retrievedState.objective).toBe(originalState.objective);
      expect(retrievedState.agents).toHaveLength(originalState.agents.length);
      expect(retrievedState.tasks).toHaveLength(originalState.tasks.length);
      expect(retrievedState.lastUpdated).toBeDefined();
      expect(retrievedState.lastUpdated).toBeGreaterThan(originalState.startTime);
    });

    it('should handle non-existent swarm state gracefully', async () => {
      const nonExistentId = 'non-existent-swarm-id';
      const result = await loadSwarmState(redisClient, nonExistentId);
      expect(result).toBeNull();
    });

    it('should save large swarm states (>1MB) efficiently', async () => {
      // Generate large swarm state
      const largeState = generateTestSwarmState({
        agents: Array.from({ length: 1000 }, (_, i) => ({
          id: `agent-${i}`,
          type: 'coder',
          status: 'active',
          confidence: 0.9,
          tasks: Array.from({ length: 10 }, (_, j) => `task-${i}-${j}`),
          metadata: {
            description: `Agent ${i} with substantial metadata payload`.repeat(100),
            history: Array.from({ length: 50 }, (_, k) => ({
              timestamp: Date.now() - k * 1000,
              action: `action-${k}`,
              details: `Detailed action information ${k}`.repeat(20)
            }))
          }
        })),
        tasks: Array.from({ length: 2000 }, (_, i) => ({
          id: `task-${i}`,
          description: `Large task description ${i}`.repeat(50),
          status: 'pending',
          artifacts: Array.from({ length: 20 }, (_, j) => ({
            type: 'file',
            name: `artifact-${i}-${j}`,
            content: 'Large artifact content '.repeat(100)
          }))
        }))
      });

      const startTime = Date.now();
      await saveSwarmState(redisClient, largeState.id, largeState);
      const saveTime = Date.now() - startTime;

      // Should save within performance threshold (<1 second for large states)
      expect(saveTime).toBeLessThan(1000);

      const retrieveStart = Date.now();
      const retrievedState = await loadSwarmState(redisClient, largeState.id);
      const retrieveTime = Date.now() - retrieveStart;

      // Should retrieve within performance threshold (<500ms for large states)
      expect(retrieveTime).toBeLessThan(500);
      expect(retrievedState.agents).toHaveLength(1000);
      expect(retrievedState.tasks).toHaveLength(2000);
    });

    it('should handle corrupted data gracefully', async () => {
      const swarmId = 'corrupted-test-swarm';

      // Save invalid JSON data directly to Redis
      await redisClient.setEx(`swarm:${swarmId}`, 3600, 'invalid-json-data');

      // Should handle parsing error gracefully
      await expect(loadSwarmState(redisClient, swarmId)).rejects.toThrow('Failed to load swarm state');
    });
  });

  describe('TTL Management and Cleanup', () => {
    it('should set appropriate TTL for swarm states', async () => {
      const testState = generateTestSwarmState();

      await saveSwarmState(redisClient, testState.id, testState);

      // Check if TTL is set (should be 24 hours = 86400 seconds)
      const ttl = await redisClient.ttl(`swarm:${testState.id}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(86400);
    });

    it('should cleanup expired swarms efficiently', async () => {
      // Create swarms with different ages
      const oldSwarm1 = generateTestSwarmState({
        id: 'old-swarm-1',
        startTime: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
      });

      const oldSwarm2 = generateTestSwarmState({
        id: 'old-swarm-2',
        startTime: Date.now() - (30 * 60 * 60 * 1000) // 30 hours ago
      });

      const recentSwarm = generateTestSwarmState({
        id: 'recent-swarm',
        startTime: Date.now() - (1 * 60 * 60 * 1000) // 1 hour ago
      });

      // Save all swarms
      await saveSwarmState(redisClient, oldSwarm1.id, oldSwarm1);
      await saveSwarmState(redisClient, oldSwarm2.id, oldSwarm2);
      await saveSwarmState(redisClient, recentSwarm.id, recentSwarm);

      // Run cleanup with 24-hour threshold
      const cleanedCount = await cleanupExpiredSwarms(redisClient, 24);

      // Should clean up old swarms but keep recent ones
      expect(cleanedCount).toBeGreaterThanOrEqual(2);

      // Verify recent swarm still exists
      const recentExists = await loadSwarmState(redisClient, recentSwarm.id);
      expect(recentExists).not.toBeNull();

      // Verify old swarms are cleaned up
      const old1Exists = await loadSwarmState(redisClient, oldSwarm1.id);
      const old2Exists = await loadSwarmState(redisClient, oldSwarm2.id);
      expect(old1Exists).toBeNull();
      expect(old2Exists).toBeNull();
    });

    it('should handle terminal status cleanup', async () => {
      const completedSwarm = generateTestSwarmState({
        id: 'completed-swarm',
        status: 'completed',
        endTime: Date.now()
      });

      const failedSwarm = generateTestSwarmState({
        id: 'failed-swarm',
        status: 'failed',
        endTime: Date.now()
      });

      await saveSwarmState(redisClient, completedSwarm.id, completedSwarm);
      await saveSwarmState(redisClient, failedSwarm.id, failedSwarm);

      // Check they are in active set initially
      let activeSwarms = await redisClient.sMembers('swarms:active');
      expect(activeSwarms).toContain(completedSwarm.id);
      expect(activeSwarms).toContain(failedSwarm.id);

      // Update status to terminal (should remove from active set)
      await updateSwarmStatus(redisClient, completedSwarm.id, 'completed');
      await updateSwarmStatus(redisClient, failedSwarm.id, 'failed');

      // Check they are removed from active set
      activeSwarms = await redisClient.sMembers('swarms:active');
      expect(activeSwarms).not.toContain(completedSwarm.id);
      expect(activeSwarms).not.toContain(failedSwarm.id);
    });
  });

  describe('Concurrent Operations (1000+ Agents)', () => {
    it('should handle concurrent state updates for 1000+ agents', async () => {
      const baseSwarmId = `concurrent-test-${Date.now()}`;
      const numAgents = 1000;
      const concurrentOperations = [];

      // Create concurrent update operations
      for (let i = 0; i < numAgents; i++) {
        const agentUpdate = {
          agentId: `agent-${i}`,
          status: ['active', 'idle', 'busy'][i % 3],
          currentTask: `task-${i}`,
          confidence: 0.7 + (Math.random() * 0.3),
          lastUpdate: Date.now()
        };

        concurrentOperations.push(
          updateSwarmStatus(redisClient, `${baseSwarmId}-${i}`, 'running', {
            agents: [agentUpdate],
            lastAgentUpdate: agentUpdate
          })
        );
      }

      // Execute all operations concurrently
      const startTime = Date.now();
      const results = await Promise.allSettled(concurrentOperations);
      const totalTime = Date.now() - startTime;

      // Verify all operations completed successfully
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful).toBeGreaterThanOrEqual(numAgents * 0.95); // 95% success rate
      expect(failed).toBeLessThan(numAgents * 0.05); // Less than 5% failure rate
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify data integrity
      const verificationCount = Math.min(10, successful); // Verify up to 10 random entries
      for (let i = 0; i < verificationCount; i++) {
        const randomIndex = Math.floor(Math.random() * numAgents);
        const swarmId = `${baseSwarmId}-${randomIndex}`;
        const state = await loadSwarmState(redisClient, swarmId);
        expect(state).not.toBeNull();
        expect(state.agents).toHaveLength(1);
        expect(state.agents[0].agentId).toBe(`agent-${randomIndex}`);
      }
    });

    it('should handle batch operations efficiently', async () => {
      const swarmId = `batch-test-${Date.now()}`;
      const batchSize = 100;
      const numBatches = 10;

      // Generate batch data
      const batchPromises = [];

      for (let batch = 0; batch < numBatches; batch++) {
        const batchOperations = [];

        for (let i = 0; i < batchSize; i++) {
          const taskUpdate = {
            taskId: `task-${batch}-${i}`,
            status: 'completed',
            result: {
              output: `Task result ${batch}-${i}`,
              confidence: 0.9,
              artifacts: [`artifact-${batch}-${i}`]
            }
          };

          batchOperations.push(
            updateSwarmStatus(redisClient, `${swarmId}-batch-${batch}-task-${i}`, 'running', taskUpdate)
          );
        }

        batchPromises.push(Promise.all(batchOperations));
      }

      // Execute batches sequentially but with internal concurrency
      const startTime = Date.now();
      const batchResults = await Promise.all(batchPromises);
      const totalTime = Date.now() - startTime;

      // Verify all batches completed
      expect(batchResults).toHaveLength(numBatches);
      batchResults.forEach((batch, batchIndex) => {
        expect(batch).toHaveLength(batchSize);
        batch.forEach((result, taskIndex) => {
          expect(result.status).toBe('running');
        });
      });

      // Performance should be reasonable (<2 seconds for 1000 operations)
      expect(totalTime).toBeLessThan(2000);

      // Calculate average time per operation
      const avgTimePerOp = totalTime / (numBatches * batchSize);
      expect(avgTimePerOp).toBeLessThan(2); // Less than 2ms per operation
    });

    it('should maintain performance under high load', async () => {
      const numOperations = 1500; // Above 1000 threshold
      const operations = [];
      const latencies = [];

      // Create mixed operations
      for (let i = 0; i < numOperations; i++) {
        const operation = async () => {
          const start = performance.now();

          if (i % 3 === 0) {
            // Save operation
            const state = generateTestSwarmState({ id: `perf-test-${i}` });
            await saveSwarmState(redisClient, state.id, state);
          } else if (i % 3 === 1) {
            // Load operation
            await loadSwarmState(redisClient, `perf-test-${i - 1}`);
          } else {
            // Update operation
            await updateSwarmStatus(redisClient, `perf-test-${i - 2}`, 'running', {
              lastUpdate: Date.now()
            });
          }

          const latency = performance.now() - start;
          latencies.push(latency);
        };

        operations.push(operation());
      }

      // Execute all operations
      await Promise.all(operations);

      // Analyze performance
      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
      const maxLatency = Math.max(...latencies);

      expect(avgLatency).toBeLessThan(50); // Average < 50ms
      expect(p95Latency).toBeLessThan(100); // P95 < 100ms
      expect(maxLatency).toBeLessThan(500); // Max < 500ms
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle Redis connection failures gracefully', async () => {
      // Create a client that will fail
      const failingClient = createClient({
        host: 'invalid-host',
        port: 9999,
        connectTimeout: 100
      });

      await expect(saveSwarmState(failingClient, 'test-id', {}))
        .rejects.toThrow();

      await expect(loadSwarmState(failingClient, 'test-id'))
        .rejects.toThrow();
    });

    it('should validate swarm state data', async () => {
      const invalidStates = [
        null,
        undefined,
        'string-instead-of-object',
        [],
        { id: 123 }, // Invalid ID type
        { id: 'valid-id-but-no-other-fields' }
      ];

      for (const invalidState of invalidStates) {
        await expect(saveSwarmState(redisClient, 'test-id', invalidState))
          .rejects.toThrow();
      }
    });

    it('should handle memory pressure scenarios', async () => {
      // Generate a very large swarm state to test memory handling
      const hugeState = generateTestSwarmState({
        agents: Array.from({ length: 5000 }, (_, i) => ({
          id: `agent-${i}`,
          type: 'coder',
          status: 'active',
          largeData: 'x'.repeat(10000) // 10KB per agent
        }))
      });

      // Should handle large states without memory issues
      await expect(saveSwarmState(redisClient, hugeState.id, hugeState))
        .resolves.toBeTruthy();

      const retrieved = await loadSwarmState(redisClient, hugeState.id);
      expect(retrieved.agents).toHaveLength(5000);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet write performance threshold (<50ms)', async () => {
      const testState = generateTestSwarmState();
      const iterations = 100;
      const latencies = [];

      for (let i = 0; i < iterations; i++) {
        const state = { ...testState, id: `perf-write-${i}` };
        const start = performance.now();
        await saveSwarmState(redisClient, state.id, state);
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      expect(avgLatency).toBeLessThan(50); // Average < 50ms
      expect(p95Latency).toBeLessThan(100); // P95 < 100ms
    });

    it('should meet read performance threshold (<25ms)', async () => {
      const testStates = Array.from({ length: 100 }, (_, i) =>
        generateTestSwarmState({ id: `perf-read-${i}` })
      );

      // Pre-save test states
      for (const state of testStates) {
        await saveSwarmState(redisClient, state.id, state);
      }

      // Measure read performance
      const latencies = [];
      for (let i = 0; i < testStates.length; i++) {
        const start = performance.now();
        await loadSwarmState(redisClient, testStates[i].id);
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      expect(avgLatency).toBeLessThan(25); // Average < 25ms
      expect(p95Latency).toBeLessThan(50); // P95 < 50ms
    });

    it('should maintain throughput (>1000 ops/sec)', async () => {
      const numOperations = 1000;
      const operations = [];

      const startTime = performance.now();

      // Create mixed operations
      for (let i = 0; i < numOperations; i++) {
        if (i % 2 === 0) {
          operations.push(saveSwarmState(redisClient, `throughput-${i}`,
            generateTestSwarmState({ id: `throughput-${i}` })));
        } else {
          operations.push(loadSwarmState(redisClient, `throughput-${i - 1}`));
        }
      }

      await Promise.all(operations);

      const totalTime = (performance.now() - startTime) / 1000; // Convert to seconds
      const throughput = numOperations / totalTime;

      expect(throughput).toBeGreaterThan(1000); // > 1000 operations per second
    });
  });

  describe('Health Monitoring and Diagnostics', () => {
    it('should provide accurate health status', async () => {
      const healthStatus = await checkRedisHealth(redisClient);

      expect(healthStatus).toHaveProperty('status', 'healthy');
      expect(healthStatus).toHaveProperty('responseTime');
      expect(healthStatus).toHaveProperty('memoryUsage');
      expect(healthStatus.responseTime).toBeLessThan(100);
    });

    it('should provide comprehensive swarm metrics', async () => {
      // Create test swarms with different statuses
      const testSwarms = [
        generateTestSwarmState({ id: 'metrics-active-1', status: 'running' }),
        generateTestSwarmState({ id: 'metrics-active-2', status: 'running' }),
        generateTestSwarmState({ id: 'metrics-completed-1', status: 'completed', endTime: Date.now() }),
        generateTestSwarmState({ id: 'metrics-failed-1', status: 'failed', endTime: Date.now() })
      ];

      // Save test swarms
      for (const swarm of testSwarms) {
        await saveSwarmState(redisClient, swarm.id, swarm);
      }

      // Get metrics
      const metrics = await getSwarmMetrics(redisClient);

      expect(metrics).toHaveProperty('total');
      expect(metrics).toHaveProperty('active');
      expect(metrics).toHaveProperty('completed');
      expect(metrics).toHaveProperty('failed');
      expect(metrics).toHaveProperty('totalAgents');
      expect(metrics).toHaveProperty('totalTasks');
      expect(metrics.total).toBeGreaterThanOrEqual(4);
      expect(metrics.active).toBeGreaterThanOrEqual(2);
    });

    it('should handle backup and restore operations', async () => {
      const testSwarms = [
        generateTestSwarmState({ id: 'backup-test-1' }),
        generateTestSwarmState({ id: 'backup-test-2' })
      ];

      // Save test swarms
      for (const swarm of testSwarms) {
        await saveSwarmState(redisClient, swarm.id, swarm);
      }

      // Create backup
      const backupPath = '/tmp/test-backup.json';
      const backup = await backupSwarmStates(redisClient, backupPath);

      expect(backup).toHaveProperty('timestamp');
      expect(backup).toHaveProperty('swarms');
      expect(backup).toHaveProperty('count');
      expect(backup.count).toBeGreaterThanOrEqual(2);

      // Clean up original swarms
      for (const swarm of testSwarms) {
        await deleteSwarmState(redisClient, swarm.id);
      }

      // Restore from backup
      const restoredCount = await restoreSwarmStates(redisClient, backupPath);
      expect(restoredCount).toBeGreaterThanOrEqual(2);

      // Verify restoration
      for (const swarm of testSwarms) {
        const restored = await loadSwarmState(redisClient, swarm.id);
        expect(restored).not.toBeNull();
        expect(restored.id).toBe(swarm.id);
      }
    });
  });

  describe('Integration with Other Components', () => {
    it('should integrate with CLI swarm operations', async () => {
      // Simulate CLI swarm state
      const cliSwarmState = generateTestSwarmState({
        id: 'cli-integration-test',
        metadata: {
          version: '1.0.0',
          strategy: 'development',
          mode: 'mesh',
          maxAgents: 5,
          confidence: 0.9,
          cliFlags: {
            strategy: 'development',
            mode: 'mesh',
            'max-agents': 5,
            executor: true
          }
        }
      });

      // Save via Redis client
      await saveSwarmState(redisClient, cliSwarmState.id, cliSwarmState);

      // Simulate CLI operations
      const updatedState = await updateSwarmStatus(redisClient, cliSwarmState.id, 'running', {
        currentPhase: 'implementation',
        progress: 0.25
      });

      expect(updatedState.status).toBe('running');
      expect(updatedState.currentPhase).toBe('implementation');
      expect(updatedState.progress).toBe(0.25);

      // List active swarms (CLI would use this)
      const activeSwarms = await listActiveSwarms(redisClient);
      expect(activeSwarms.length).toBeGreaterThan(0);

      const cliSwarm = activeSwarms.find(s => s.id === cliSwarmState.id);
      expect(cliSwarm).toBeDefined();
      expect(cliSwarm.metadata.cliFlags).toBeDefined();
    });

    it('should handle recovery scenarios', async () => {
      const recoverySwarm = generateTestSwarmState({
        id: 'recovery-test',
        status: 'interrupted',
        metadata: {
          interrupted: true,
          interruptionReason: 'Connection lost',
          lastCheckpoint: Date.now() - 60000 // 1 minute ago
        }
      });

      await saveSwarmState(redisClient, recoverySwarm.id, recoverySwarm);

      // Simulate recovery process
      const recoveredState = await updateSwarmStatus(redisClient, recoverySwarm.id, 'recovering', {
        recoveredAt: Date.now(),
        recoveryAttempt: 1
      });

      expect(recoveredState.status).toBe('recovering');
      expect(recoveredState.recoveredAt).toBeDefined();

      // Complete recovery
      const activeState = await updateSwarmStatus(redisClient, recoverySwarm.id, 'running', {
        resumedAt: Date.now(),
        previousStatus: 'recovering'
      });

      expect(activeState.status).toBe('running');
      expect(activeState.resumedAt).toBeDefined();
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty and null values gracefully', async () => {
      const edgeCaseState = generateTestSwarmState({
        agents: [],
        tasks: [],
        metadata: {
          emptyField: '',
          nullField: null,
          undefinedField: undefined
        }
      });

      await expect(saveSwarmState(redisClient, edgeCaseState.id, edgeCaseState))
        .resolves.toBeTruthy();

      const retrieved = await loadSwarmState(redisClient, edgeCaseState.id);
      expect(retrieved.agents).toEqual([]);
      expect(retrieved.tasks).toEqual([]);
      expect(retrieved.metadata.emptyField).toBe('');
      expect(retrieved.metadata.nullField).toBeNull();
    });

    it('should handle extremely long identifiers', async () => {
      const longId = 'a'.repeat(1000);
      const longState = generateTestSwarmState({
        id: longId,
        objective: 'x'.repeat(5000)
      });

      await expect(saveSwarmState(redisClient, longId, longState))
        .resolves.toBeTruthy();

      const retrieved = await loadSwarmState(redisClient, longId);
      expect(retrieved.id).toBe(longId);
      expect(retrieved.objective).toBe(longState.objective);
    });

    it('should handle special characters in data', async () => {
      const specialState = generateTestSwarmState({
        objective: 'Test with special chars: \n\t\r"\'\\{}[]()<>@#$%^&*',
        agents: [{
          id: 'special-agent',
          type: 'tester',
          status: 'active',
          specialData: 'Unicode: ñáéíóú 😀🚀 Emoji test'
        }]
      });

      await expect(saveSwarmState(redisClient, specialState.id, specialState))
        .resolves.toBeTruthy();

      const retrieved = await loadSwarmState(redisClient, specialState.id);
      expect(retrieved.objective).toBe(specialState.objective);
      expect(retrieved.agents[0].specialData).toBe(specialState.agents[0].specialData);
    });
  });
});