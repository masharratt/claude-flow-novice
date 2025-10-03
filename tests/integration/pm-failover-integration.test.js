/**
 * PM Failover System - Integration Tests
 *
 * Validates PM failure detection, worker promotion, and state transfer
 * in a realistic multi-agent coordination scenario.
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { PMFailoverManager } = require('../../src/coordination/pm-failover');
const { Logger } = require('../../src/core/logger');
const { SwarmMemoryManager } = require('../../src/memory/swarm-memory');
const { MessageBroker } = require('../../src/coordination/v2/core/message-broker');
const path = require('path');
const fs = require('fs');

describe('PM Failover Integration Tests', () => {
  let failoverManager;
  let memory;
  let broker;
  let logger;
  let testDbPath;

  beforeEach(async () => {
    // Setup test database
    testDbPath = path.join(__dirname, '../../test-pm-failover.db');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize real components
    logger = new Logger(
      { level: 'info', format: 'json', destination: 'console' },
      { component: 'PMFailoverIntegrationTest' }
    );

    memory = new SwarmMemoryManager(
      { dbPath: testDbPath, pruneAge: 3600000, pruneInterval: 60000 },
      logger
    );
    await memory.initialize();

    broker = new MessageBroker(
      { maxQueueSize: 100, enablePersistence: false, persistencePath: '' },
      logger
    );

    failoverManager = new PMFailoverManager(
      {
        healthCheckInterval: 500,
        failureThreshold: 2,
        inactivityTimeout: 5000,
        heartbeatTimeout: 1000,
        confidenceWeight: 0.5,
        uptimeWeight: 0.3,
        capacityWeight: 0.2,
      },
      memory,
      broker,
      logger
    );
  });

  afterEach(async () => {
    if (failoverManager) {
      await failoverManager.shutdown();
    }
    if (memory) {
      await memory.shutdown();
    }

    // Cleanup test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should detect PM failure and promote worker', async () => {
    await failoverManager.initialize();

    // Create mock PM and workers
    const mockPM = createMockAgent('pm-1', 'coordinator', 0);
    const mockWorkers = new Map([
      ['worker-1', createMockAgent('worker-1', 'worker', 1, 'pm-1', { completedTasks: 95, failedTasks: 5 })],
      ['worker-2', createMockAgent('worker-2', 'worker', 1, 'pm-1', { completedTasks: 85, failedTasks: 15 })],
      ['worker-3', createMockAgent('worker-3', 'worker', 1, 'pm-1', { completedTasks: 75, failedTasks: 25 })],
    ]);

    // Register PM
    await failoverManager.registerPM(mockPM, mockWorkers);

    // Wait a bit to ensure initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify PM is registered
    const failureDetected = await failoverManager.detectPMFailure('pm-1');
    expect(failureDetected).toBe(true);

    // Select successor
    const successor = await failoverManager.selectSuccessor('pm-1');
    expect(successor).not.toBeNull();
    expect(successor.workerId).toBe('worker-1'); // Highest success rate

    // Promote worker to PM
    await failoverManager.promoteWorker(successor.workerId, 'pm-1');

    // Verify promotion
    const promotedWorker = mockWorkers.get('worker-1');
    expect(promotedWorker.type).toBe('coordinator');
    expect(promotedWorker.capabilities.has('coordination')).toBe(true);
  }, 10000);

  it('should handle PM failover with task redistribution', async () => {
    await failoverManager.initialize();

    const mockPM = createMockAgent('pm-1', 'coordinator', 0);
    const mockWorkers = new Map([
      ['worker-1', createMockAgent('worker-1', 'worker', 1, 'pm-1')],
    ]);

    await failoverManager.registerPM(mockPM, mockWorkers);

    // Add active tasks to PM state
    const pmState = failoverManager['pmStates'].get('pm-1');
    pmState.activeTasks.set('task-1', { id: 'task-1', priority: 5 });
    pmState.activeTasks.set('task-2', { id: 'task-2', priority: 3 });

    // Detect failure and select successor
    await failoverManager.detectPMFailure('pm-1');
    const successor = await failoverManager.selectSuccessor('pm-1');

    // Setup broker spy
    let redistributedTasks = 0;
    broker.on('message:published', () => {
      redistributedTasks++;
    });

    // Promote worker (should redistribute tasks)
    await failoverManager.promoteWorker(successor.workerId, 'pm-1');

    // Verify task redistribution
    expect(redistributedTasks).toBeGreaterThan(0);
  }, 10000);

  it('should update worker parent references after promotion', async () => {
    await failoverManager.initialize();

    const mockPM = createMockAgent('pm-1', 'coordinator', 0);
    const mockWorkers = new Map([
      ['worker-1', createMockAgent('worker-1', 'worker', 1, 'pm-1')],
      ['worker-2', createMockAgent('worker-2', 'worker', 1, 'pm-1')],
      ['worker-3', createMockAgent('worker-3', 'worker', 1, 'pm-1')],
    ]);

    await failoverManager.registerPM(mockPM, mockWorkers);
    await failoverManager.detectPMFailure('pm-1');
    const successor = await failoverManager.selectSuccessor('pm-1');

    await failoverManager.promoteWorker(successor.workerId, 'pm-1');

    // Verify all workers now report to new PM (except the promoted one)
    for (const [workerId, worker] of mockWorkers.entries()) {
      if (workerId !== successor.workerId) {
        expect(worker.parentId).toBe(successor.workerId);
      }
    }
  }, 10000);

  it('should store failover events in memory', async () => {
    await failoverManager.initialize();

    const mockPM = createMockAgent('pm-1', 'coordinator', 0);
    const mockWorkers = new Map([
      ['worker-1', createMockAgent('worker-1', 'worker', 1, 'pm-1')],
    ]);

    await failoverManager.registerPM(mockPM, mockWorkers);
    await failoverManager.detectPMFailure('pm-1');

    // Query memory for failure event
    const failureEvents = await memory.recall('pm-failover', 'failure');
    expect(failureEvents.length).toBeGreaterThan(0);
    expect(failureEvents[0].data.pmId).toBe('pm-1');
  }, 10000);
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockAgent(id, type, level, parentId = null, overrides = {}) {
  const completedTasks = overrides.completedTasks ?? 50;
  const failedTasks = overrides.failedTasks ?? 10;
  const totalTasks = completedTasks + failedTasks;
  const successRate = totalTasks > 0 ? completedTasks / totalTasks : 0.5;

  return {
    id,
    sessionId: `session-${id}`,
    name: type === 'coordinator' ? `PM ${id}` : `Worker ${id}`,
    type,
    level,
    parentId,
    children: new Set(),
    status: 'idle',
    capabilities: new Set(type === 'coordinator' ? ['coordination', 'planning'] : ['task-execution']),
    metrics: {
      tasksCompleted: completedTasks,
      tasksFailed: failedTasks,
      averageTaskDuration: type === 'coordinator' ? 5000 : 3000,
      lastActivityTime: new Date(),
      confidenceScore: successRate,
    },
    spawnedAt: new Date(Date.now() - (type === 'coordinator' ? 86400000 : 3600000)),
    lastActivity: new Date(),
    completedTasks,
    failedTasks,
    currentTasks: [],
    health: {
      successRate,
      averageResponseTime: type === 'coordinator' ? 500 : 300,
      errorCount: failedTasks,
      consecutiveFailures: 0,
      lastHealthCheck: new Date(),
    },
  };
}
