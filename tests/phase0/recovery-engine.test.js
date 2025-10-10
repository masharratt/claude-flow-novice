/**
 * Comprehensive test suite for Recovery Engine
 * Tests multiple failure modes and enhanced recovery scenarios
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock dependencies
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  sMembers: jest.fn(),
  sAdd: jest.fn(),
  sRem: jest.fn(),
  ping: jest.fn(),
  quit: jest.fn()
};

jest.mock('../../src/cli/utils/redis-client.js', () => ({
  connectRedis: jest.fn().mockResolvedValue(mockRedisClient),
  loadSwarmState: jest.fn(),
  saveSwarmState: jest.fn(),
  updateSwarmStatus: jest.fn(),
  listActiveSwarms: jest.fn(),
  deleteSwarmState: jest.fn()
}));

// Mock file system operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    unlink: jest.fn()
  },
  existsSync: jest.fn(),
  mkdirSync: jest.fn()
}));

// Import the class under test
import RecoveryEngine from '../../src/cli/recovery/engine.js';

describe('RecoveryEngine', () => {
  let recoveryEngine;
  let mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      healthCheckInterval: 5000,
      backupLocation: './test-backups',
      enableDetailedLogging: true,
      stressTestEnabled: false
    };

    recoveryEngine = new RecoveryEngine(mockConfig);
  });

  afterEach(async () => {
    if (recoveryEngine) {
      await recoveryEngine.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const engine = new RecoveryEngine();

      expect(engine.config.maxRetries).toBe(3);
      expect(engine.config.retryDelay).toBe(1000);
      expect(engine.config.healthCheckInterval).toBe(5000);
    });

    test('should initialize with custom configuration', () => {
      const customConfig = {
        maxRetries: 5,
        retryDelay: 2000,
        healthCheckInterval: 10000,
        backupLocation: '/custom/backups'
      };

      const engine = new RecoveryEngine(customConfig);

      expect(engine.config.maxRetries).toBe(5);
      expect(engine.config.retryDelay).toBe(2000);
      expect(engine.config.healthCheckInterval).toBe(10000);
      expect(engine.config.backupLocation).toBe('/custom/backups');
    });

    test('should set up event handlers', () => {
      const engine = new RecoveryEngine();

      expect(engine.listenerCount('recovery-started')).toBe(0);
      expect(engine.listenerCount('recovery-completed')).toBe(0);
      expect(engine.listenerCount('recovery-failed')).toBe(0);
      expect(engine.listenerCount('health-check')).toBe(0);
    });
  });

  describe('Basic Recovery Operations', () => {
    beforeEach(async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        id: 'test-swarm-123',
        status: 'running',
        objective: 'Test objective',
        agents: ['agent1', 'agent2'],
        tasks: ['task1', 'task2'],
        lastUpdated: Date.now()
      }));
    });

    test('should detect interrupted swarms', async () => {
      mockRedisClient.sMembers.mockResolvedValue(['swarm:test-swarm-123', 'swarm:test-swarm-456']);

      const interruptedSwarms = await recoveryEngine.detectInterruptedSwarms();

      expect(interruptedSwarms).toHaveLength(2);
      expect(mockRedisClient.sMembers).toHaveBeenCalledWith('swarms:active');
    });

    test('should recover a single swarm', async () => {
      const swarmId = 'test-swarm-123';
      const mockSwarmState = {
        id: swarmId,
        status: 'running',
        objective: 'Test objective',
        agents: ['agent1', 'agent2'],
        tasks: ['task1', 'task2'],
        lastUpdated: Date.now()
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockSwarmState));

      const result = await recoveryEngine.recoverSwarm(swarmId);

      expect(result.success).toBe(true);
      expect(result.swarmId).toBe(swarmId);
      expect(result.recoveredState).toEqual(mockSwarmState);
    });

    test('should handle non-existent swarm recovery', async () => {
      const swarmId = 'non-existent-swarm';
      mockRedisClient.get.mockResolvedValue(null);

      const result = await recoveryEngine.recoverSwarm(swarmId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should handle corrupted swarm state', async () => {
      const swarmId = 'corrupted-swarm';
      mockRedisClient.get.mockResolvedValue('invalid json data');

      const result = await recoveryEngine.recoverSwarm(swarmId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('corrupted');
    });
  });

  describe('Enhanced Failure Mode Testing', () => {
    describe('Connection Failure Scenarios', () => {
      test('should handle Redis connection timeouts', async () => {
        const swarmId = 'timeout-swarm';

        // Simulate connection timeout
        mockRedisClient.get.mockImplementation(() =>
          new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('Connection timeout')), 100);
          })
        );

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('timeout');
        expect(result.retryCount).toBeGreaterThan(0);
      });

      test('should handle Redis connection refused', async () => {
        const swarmId = 'refused-swarm';

        mockRedisClient.get.mockRejectedValue(new Error('Connection refused'));

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Connection refused');
      });

      test('should handle Redis authentication failures', async () => {
        const swarmId = 'auth-failed-swarm';

        mockRedisClient.get.mockRejectedValue(new Error('Authentication failed'));

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Authentication failed');
      });

      test('should handle Redis memory overload', async () => {
        const swarmId = 'memory-overload-swarm';

        mockRedisClient.get.mockRejectedValue(new Error('Memory overflow'));

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Memory overflow');
      });
    });

    describe('Data Corruption Scenarios', () => {
      test('should handle partially corrupted swarm data', async () => {
        const swarmId = 'partial-corrupt-swarm';

        // Partially corrupted JSON
        mockRedisClient.get.mockResolvedValue('{"id":"test","status":}incomplete');

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('corrupted');
      });

      test('should handle swarm data with missing required fields', async () => {
        const swarmId = 'missing-fields-swarm';

        // Missing required fields
        const incompleteState = {
          id: swarmId,
          status: 'running'
          // Missing objective, agents, tasks, etc.
        };

        mockRedisClient.get.mockResolvedValue(JSON.stringify(incompleteState));

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(true);
        expect(result.warnings).toContain('Missing required fields');
      });

      test('should handle swarm data with invalid agent states', async () => {
        const swarmId = 'invalid-agents-swarm';

        const invalidState = {
          id: swarmId,
          status: 'running',
          objective: 'Test objective',
          agents: [
            { id: 'agent1', status: 'invalid_status' },
            { id: 'agent2', status: 'completed' }
          ],
          tasks: ['task1'],
          lastUpdated: Date.now()
        };

        mockRedisClient.get.mockResolvedValue(JSON.stringify(invalidState));

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(true);
        expect(result.warnings).toContain('Invalid agent states detected');
      });

      test('should handle swarm data with circular references', async () => {
        const swarmId = 'circular-ref-swarm';

        // Create object with circular reference
        const circularState = { id: swarmId };
        circularState.self = circularState;

        // JSON.stringify would normally fail on circular references
        // Mock this scenario
        mockRedisClient.get.mockRejectedValue(new Error('Converting circular structure to JSON'));

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('circular');
      });
    });

    describe('Concurrent Failure Scenarios', () => {
      test('should handle multiple concurrent swarm recoveries', async () => {
        const swarmIds = ['concurrent-1', 'concurrent-2', 'concurrent-3'];

        // Mock successful recovery for some, failure for others
        mockRedisClient.get.mockImplementation((key) => {
          const swarmId = key.replace('swarm:', '');
          if (swarmId === 'concurrent-2') {
            return Promise.resolve(null); // Not found
          }
          return Promise.resolve(JSON.stringify({
            id: swarmId,
            status: 'running',
            objective: `Objective for ${swarmId}`,
            agents: ['agent1'],
            tasks: ['task1'],
            lastUpdated: Date.now()
          }));
        });

        const results = await Promise.all(
          swarmIds.map(id => recoveryEngine.recoverSwarm(id))
        );

        expect(results).toHaveLength(3);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(false);
        expect(results[2].success).toBe(true);
      });

      test('should handle race conditions during recovery', async () => {
        const swarmId = 'race-condition-swarm';
        let callCount = 0;

        mockRedisClient.get.mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First call - simulate concurrent modification
            throw new Error('Concurrent modification detected');
          }
          return Promise.resolve(JSON.stringify({
            id: swarmId,
            status: 'running',
            objective: 'Race condition test',
            agents: ['agent1'],
            tasks: ['task1'],
            lastUpdated: Date.now()
          }));
        });

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(true);
        expect(result.retryCount).toBeGreaterThan(0);
      });

      test('should handle resource exhaustion during recovery', async () => {
        const swarmId = 'resource-exhausted-swarm';

        mockRedisClient.get.mockRejectedValue(new Error('Resource temporarily unavailable'));

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Resource temporarily unavailable');
      });
    });

    describe('Network Partition Scenarios', () => {
      test('should handle network partition during recovery', async () => {
        const swarmId = 'partitioned-swarm';

        // Simulate network partition
        mockRedisClient.get.mockRejectedValue(new Error('Network partition detected'));

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Network partition');
        expect(result.canRetry).toBe(true);
      });

      test('should handle partial network recovery', async () => {
        const swarmId = 'partial-network-swarm';
        let attempt = 0;

        mockRedisClient.get.mockImplementation(() => {
          attempt++;
          if (attempt < 3) {
            throw new Error('Network unstable');
          }
          return Promise.resolve(JSON.stringify({
            id: swarmId,
            status: 'running',
            objective: 'Partial network recovery test',
            agents: ['agent1'],
            tasks: ['task1'],
            lastUpdated: Date.now()
          }));
        });

        const result = await recoveryEngine.recoverSwarm(swarmId);

        expect(result.success).toBe(true);
        expect(result.retryCount).toBe(2);
      });
    });
  });

  describe('Recovery Stress Testing', () => {
    beforeEach(() => {
      recoveryEngine.config.stressTestEnabled = true;
    });

    test('should handle high-volume concurrent recoveries', async () => {
      const swarmCount = 100;
      const swarmIds = Array.from({ length: swarmCount }, (_, i) => `stress-swarm-${i}`);

      mockRedisClient.get.mockImplementation((key) => {
        const swarmId = key.replace('swarm:', '');
        return Promise.resolve(JSON.stringify({
          id: swarmId,
          status: 'running',
          objective: `Stress test for ${swarmId}`,
          agents: ['agent1', 'agent2'],
          tasks: ['task1', 'task2', 'task3'],
          lastUpdated: Date.now()
        }));
      });

      const startTime = Date.now();

      const results = await Promise.all(
        swarmIds.map(id => recoveryEngine.recoverSwarm(id))
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(swarmCount);
      expect(results.every(r => r.success)).toBe(true);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    });

    test('should maintain performance under memory pressure', async () => {
      const swarmId = 'memory-pressure-swarm';

      // Create a large swarm state
      const largeState = {
        id: swarmId,
        status: 'running',
        objective: 'Memory pressure test',
        agents: Array(1000).fill(null).map((_, i) => ({
          id: `agent-${i}`,
          status: 'running',
          data: 'x'.repeat(1000) // Large data per agent
        })),
        tasks: Array(100).fill(null).map((_, i) => `task-${i}`),
        lastUpdated: Date.now()
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(largeState));

      const startTime = Date.now();
      const result = await recoveryEngine.recoverSwarm(swarmId);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    test('should handle timeout during stress testing', async () => {
      const swarmId = 'timeout-stress-swarm';

      // Simulate slow response
      mockRedisClient.get.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => resolve(JSON.stringify({
            id: swarmId,
            status: 'running',
            objective: 'Timeout stress test',
            agents: ['agent1'],
            tasks: ['task1'],
            lastUpdated: Date.now()
          })), 20000); // 20 second delay
        })
      );

      const result = await recoveryEngine.recoverSwarm(swarmId, { timeout: 5000 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('should validate recovery confidence under stress', async () => {
      const testCases = [
        { id: 'high-confidence', shouldSucceed: true, confidence: 0.95 },
        { id: 'medium-confidence', shouldSucceed: true, confidence: 0.75 },
        { id: 'low-confidence', shouldSucceed: false, confidence: 0.45 }
      ];

      mockRedisClient.get.mockImplementation((key) => {
        const testCase = testCases.find(tc => key.includes(tc.id));
        if (!testCase) return Promise.resolve(null);

        return Promise.resolve(JSON.stringify({
          id: testCase.id,
          status: testCase.shouldSucceed ? 'running' : 'failed',
          objective: `Confidence test for ${testCase.id}`,
          agents: ['agent1'],
          tasks: ['task1'],
          lastUpdated: Date.now()
        }));
      });

      const results = await Promise.all(
        testCases.map(tc => recoveryEngine.recoverSwarmWithConfidence(tc.id))
      );

      testCases.forEach((testCase, index) => {
        expect(results[index].success).toBe(testCase.shouldSucceed);
        expect(results[index].confidence).toBeGreaterThanOrEqual(testCase.confidence - 0.1);
      });
    });
  });

  describe('Recovery Workflow Automation', () => {
    test('should execute complete recovery workflow', async () => {
      const workflow = {
        name: 'complete-recovery',
        steps: [
          'detect-interrupted',
          'validate-states',
          'recover-swarms',
          'verify-recovery',
          'cleanup-resources'
        ]
      };

      mockRedisClient.sMembers.mockResolvedValue(['swarm:workflow-test-1', 'swarm:workflow-test-2']);
      mockRedisClient.get.mockImplementation((key) => {
        const swarmId = key.replace('swarm:', '');
        return Promise.resolve(JSON.stringify({
          id: swarmId,
          status: 'running',
          objective: `Workflow test for ${swarmId}`,
          agents: ['agent1'],
          tasks: ['task1'],
          lastUpdated: Date.now()
        }));
      });

      const result = await recoveryEngine.executeRecoveryWorkflow(workflow);

      expect(result.success).toBe(true);
      expect(result.completedSteps).toEqual(workflow.steps);
      expect(result.recoveredSwarms).toHaveLength(2);
    });

    test('should handle workflow step failures', async () => {
      const workflow = {
        name: 'failure-workflow',
        steps: [
          'detect-interrupted',
          'validate-states',
          'recover-swarms',
          'verify-recovery'
        ]
      };

      mockRedisClient.sMembers.mockRejectedValue(new Error('Detection failed'));

      const result = await recoveryEngine.executeRecoveryWorkflow(workflow);

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('detect-interrupted');
      expect(result.error).toContain('Detection failed');
    });

    test('should support custom recovery workflows', async () => {
      const customWorkflow = {
        name: 'custom-recovery',
        steps: [
          'backup-current-state',
          'cleanup-corrupted-data',
          'restore-from-backup',
          'validate-integrity'
        ],
        customHandlers: {
          'backup-current-state': async () => ({ success: true, backupPath: '/tmp/backup' }),
          'cleanup-corrupted-data': async () => ({ success: true, cleanedItems: 5 }),
          'restore-from-backup': async () => ({ success: true, restoredItems: 3 }),
          'validate-integrity': async () => ({ success: true, integrityScore: 1.0 })
        }
      };

      const result = await recoveryEngine.executeRecoveryWorkflow(customWorkflow);

      expect(result.success).toBe(true);
      expect(result.completedSteps).toEqual(customWorkflow.steps);
    });
  });

  describe('Health Monitoring and Diagnostics', () => {
    test('should perform comprehensive health checks', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      const healthStatus = await recoveryEngine.performHealthCheck();

      expect(healthStatus.redisConnected).toBe(true);
      expect(healthStatus.responseTime).toBeGreaterThan(0);
      expect(healthStatus.timestamp).toBeGreaterThan(0);
    });

    test('should detect system health degradation', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Redis not responding'));

      const healthStatus = await recoveryEngine.performHealthCheck();

      expect(healthStatus.redisConnected).toBe(false);
      expect(healthStatus.errors).toContain('Redis not responding');
    });

    test('should generate recovery diagnostics report', async () => {
      const diagnostics = await recoveryEngine.generateDiagnosticsReport();

      expect(diagnostics).toHaveProperty('systemInfo');
      expect(diagnostics).toHaveProperty('redisStatus');
      expect(diagnostics).toHaveProperty('recoveryHistory');
      expect(diagnostics).toHaveProperty('performanceMetrics');
      expect(diagnostics).toHaveProperty('recommendations');
    });

    test('should track recovery success rates', async () => {
      // Simulate multiple recovery attempts
      const attempts = [
        { success: true, duration: 1000 },
        { success: false, duration: 2000, error: 'Connection failed' },
        { success: true, duration: 1500 },
        { success: true, duration: 800 },
        { success: false, duration: 3000, error: 'Timeout' }
      ];

      attempts.forEach(attempt => {
        recoveryEngine.recordRecoveryAttempt(attempt);
      });

      const metrics = recoveryEngine.getRecoveryMetrics();

      expect(metrics.totalAttempts).toBe(5);
      expect(metrics.successfulRecoveries).toBe(3);
      expect(metrics.failedRecoveries).toBe(2);
      expect(metrics.successRate).toBe(0.6);
      expect(metrics.averageDuration).toBe(1660);
    });
  });

  describe('Backup and Restore Operations', () => {
    test('should create swarm state backups', async () => {
      const swarmId = 'backup-test-swarm';
      const swarmState = {
        id: swarmId,
        status: 'running',
        objective: 'Backup test',
        agents: ['agent1', 'agent2'],
        tasks: ['task1', 'task2'],
        lastUpdated: Date.now()
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(swarmState));

      const backupResult = await recoveryEngine.createBackup(swarmId);

      expect(backupResult.success).toBe(true);
      expect(backupResult.backupPath).toContain(swarmId);
      expect(backupResult.timestamp).toBeGreaterThan(0);
    });

    test('should restore from backup', async () => {
      const swarmId = 'restore-test-swarm';
      const backupPath = `${recoveryEngine.config.backupLocation}/${swarmId}.backup`;

      // Mock backup file reading
      const { promises: fsPromises } = require('fs');
      fsPromises.readFile.mockResolvedValue(JSON.stringify({
        id: swarmId,
        status: 'running',
        objective: 'Restore test',
        agents: ['agent1'],
        tasks: ['task1'],
        lastUpdated: Date.now()
      }));

      const restoreResult = await recoveryEngine.restoreFromBackup(swarmId, backupPath);

      expect(restoreResult.success).toBe(true);
      expect(fsPromises.readFile).toHaveBeenCalledWith(backupPath, 'utf8');
    });

    test('should handle corrupted backup files', async () => {
      const swarmId = 'corrupted-backup-swarm';
      const backupPath = `${recoveryEngine.config.backupLocation}/${swarmId}.backup`;

      const { promises: fsPromises } = require('fs');
      fsPromises.readFile.mockResolvedValue('corrupted backup data');

      const restoreResult = await recoveryEngine.restoreFromBackup(swarmId, backupPath);

      expect(restoreResult.success).toBe(false);
      expect(restoreResult.error).toContain('corrupted backup');
    });
  });

  describe('Event Handling and Notifications', () => {
    test('should emit recovery events', async () => {
      const swarmId = 'event-test-swarm';
      const events = [];

      recoveryEngine.on('recovery-started', (data) => events.push({ type: 'started', data }));
      recoveryEngine.on('recovery-completed', (data) => events.push({ type: 'completed', data }));
      recoveryEngine.on('recovery-failed', (data) => events.push({ type: 'failed', data }));

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        id: swarmId,
        status: 'running',
        objective: 'Event test',
        agents: ['agent1'],
        tasks: ['task1'],
        lastUpdated: Date.now()
      }));

      await recoveryEngine.recoverSwarm(swarmId);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('started');
      expect(events[1].type).toBe('completed');
      expect(events[1].data.swarmId).toBe(swarmId);
    });

    test('should handle event listener errors', async () => {
      const swarmId = 'event-error-swarm';

      recoveryEngine.on('recovery-completed', () => {
        throw new Error('Event listener error');
      });

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        id: swarmId,
        status: 'running',
        objective: 'Event error test',
        agents: ['agent1'],
        tasks: ['task1'],
        lastUpdated: Date.now()
      }));

      // Should not throw despite event listener error
      const result = await recoveryEngine.recoverSwarm(swarmId);

      expect(result.success).toBe(true);
    });
  });

  describe('Configuration and Customization', () => {
    test('should allow runtime configuration updates', () => {
      const newConfig = {
        maxRetries: 10,
        retryDelay: 5000,
        healthCheckInterval: 15000
      };

      recoveryEngine.updateConfiguration(newConfig);

      expect(recoveryEngine.config.maxRetries).toBe(10);
      expect(recoveryEngine.config.retryDelay).toBe(5000);
      expect(recoveryEngine.config.healthCheckInterval).toBe(15000);
    });

    test('should validate configuration changes', () => {
      const invalidConfig = {
        maxRetries: -1, // Invalid
        retryDelay: 'invalid' // Invalid type
      };

      expect(() => {
        recoveryEngine.updateConfiguration(invalidConfig);
      }).toThrow('Invalid configuration');
    });

    test('should support custom recovery strategies', async () => {
      const customStrategy = {
        name: 'custom-strategy',
        recover: async (swarmId, state) => {
          // Custom recovery logic
          return {
            success: true,
            recoveredState: { ...state, customRecovered: true },
            metadata: { strategy: 'custom' }
          };
        }
      };

      recoveryEngine.registerRecoveryStrategy(customStrategy);

      const swarmId = 'custom-strategy-swarm';
      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        id: swarmId,
        status: 'running',
        objective: 'Custom strategy test',
        agents: ['agent1'],
        tasks: ['task1'],
        lastUpdated: Date.now()
      }));

      const result = await recoveryEngine.recoverSwarmWithStrategy(swarmId, 'custom-strategy');

      expect(result.success).toBe(true);
      expect(result.metadata.strategy).toBe('custom');
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should cleanup expired recovery data', async () => {
      const expiredData = [
        { swarmId: 'expired-1', timestamp: Date.now() - 25 * 60 * 60 * 1000 }, // 25 hours ago
        { swarmId: 'expired-2', timestamp: Date.now() - 30 * 60 * 60 * 1000 }, // 30 hours ago
        { swarmId: 'recent-1', timestamp: Date.now() - 2 * 60 * 60 * 1000 }   // 2 hours ago
      ];

      // Simulate expired recovery data
      expiredData.forEach(data => {
        recoveryEngine.recordRecoveryAttempt({ ...data, success: true });
      });

      const cleanedCount = await recoveryEngine.cleanupExpiredData(24 * 60 * 60 * 1000); // 24 hours

      expect(cleanedCount).toBe(2); // Should clean up 2 expired entries
    });

    test('should handle graceful shutdown', async () => {
      const shutdownSpy = jest.fn();
      recoveryEngine.on('shutdown', shutdownSpy);

      await recoveryEngine.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
      expect(recoveryEngine.isShutdown).toBe(true);
    });

    test('should prevent operations after shutdown', async () => {
      await recoveryEngine.shutdown();

      await expect(recoveryEngine.recoverSwarm('test-swarm'))
        .rejects.toThrow('Recovery engine is shutdown');
    });
  });

  describe('Integration with Other Components', () => {
    test('should integrate with swarm coordination', async () => {
      const swarmCoordinator = {
        resumeSwarm: jest.fn(),
        validateSwarmState: jest.fn()
      };

      recoveryEngine.setSwarmCoordinator(swarmCoordinator);

      const swarmId = 'integration-test-swarm';
      const swarmState = {
        id: swarmId,
        status: 'running',
        objective: 'Integration test',
        agents: ['agent1', 'agent2'],
        tasks: ['task1', 'task2'],
        lastUpdated: Date.now()
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(swarmState));
      swarmCoordinator.validateSwarmState.mockResolvedValue({ valid: true });
      swarmCoordinator.resumeSwarm.mockResolvedValue({ success: true });

      const result = await recoveryEngine.recoverAndResumeSwarm(swarmId);

      expect(result.success).toBe(true);
      expect(swarmCoordinator.validateSwarmState).toHaveBeenCalledWith(swarmState);
      expect(swarmCoordinator.resumeSwarm).toHaveBeenCalledWith(swarmState);
    });

    test('should handle monitoring system integration', async () => {
      const monitoringSystem = {
        reportMetric: jest.fn(),
        sendAlert: jest.fn()
      };

      recoveryEngine.setMonitoringSystem(monitoringSystem);

      const swarmId = 'monitoring-integration-swarm';
      mockRedisClient.get.mockRejectedValue(new Error('Recovery failed'));

      await recoveryEngine.recoverSwarm(swarmId);

      expect(monitoringSystem.reportMetric).toHaveBeenCalledWith(
        'recovery.attempt',
        expect.any(Object)
      );
      expect(monitoringSystem.sendAlert).toHaveBeenCalledWith(
        'recovery.failure',
        expect.any(Object)
      );
    });
  });
});