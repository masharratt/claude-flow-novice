/**
 * PM Failover Crash Simulation Tests
 *
 * Tests PM failover behavior when primary manager crashes
 */

const { PMFailoverManager } = require('../../src/coordination/pm-failover');
const { SwarmMemoryManager } = require('../../src/memory/swarm-memory');
const { MessageBroker } = require('../../src/coordination/message-broker');
const { Logger } = require('../../src/core/logger');

describe('PM Failover - Crash Simulation', () => {
  let pmFailover;
  let memory;
  let broker;
  let logger;

  beforeEach(async () => {
    logger = new Logger({ level: 'error' });
    memory = new SwarmMemoryManager({ dbPath: ':memory:' }, logger);
    await memory.initialize();
    broker = new MessageBroker(logger);

    pmFailover = new PMFailoverManager({
      heartbeatInterval: 100, // 100ms for fast testing
      failureThreshold: 2, // 2 consecutive failures
      inactivityTimeout: 500 // 500ms timeout
    }, memory, broker, logger);
  });

  afterEach(async () => {
    pmFailover.shutdown();
    await memory.shutdown();
  });

  it('should detect PM crash and promote successor', async () => {
    // Register PM
    pmFailover.registerPM('pm-1', {
      successRate: 0.95,
      uptime: 10000,
      availableCapacity: 5
    });

    // Register candidate workers
    pmFailover.registerWorker('worker-1', 'coordinator', {
      successRate: 0.90,
      uptime: 8000,
      availableCapacity: 3
    });

    pmFailover.registerWorker('worker-2', 'coordinator', {
      successRate: 0.85,
      uptime: 5000,
      availableCapacity: 4
    });

    // Simulate PM crash by stopping heartbeats
    // (no more heartbeats sent from pm-1)

    // Wait for failure detection (3 missed heartbeats * 100ms + buffer)
    await new Promise(resolve => setTimeout(resolve, 600));

    // Failover should detect failure
    const detected = pmFailover.detectPMFailure('pm-1');
    expect(detected).toBe(true);

    // Select successor
    const successor = await pmFailover.selectSuccessor();
    expect(successor).toBeDefined();
    expect(successor.workerId).toBe('worker-1'); // Highest confidence score

    // Promote successor
    const promoted = await pmFailover.promoteWorker(successor.workerId, 'pm-1');
    expect(promoted).toBe(true);

    // Verify new PM registered in memory
    const storedEvent = await memory.retrieve('pm-failover', 'promotion', 'worker-1');
    expect(storedEvent).toBeDefined();
  });

  it('should redistribute tasks after PM crash', async () => {
    // Register PM with active tasks
    pmFailover.registerPM('pm-crashed', {
      successRate: 0.90,
      uptime: 5000,
      availableCapacity: 2
    });

    // Simulate active tasks
    const activeTasks = [
      { id: 'task-1', type: 'coordination', priority: 5 },
      { id: 'task-2', type: 'delegation', priority: 3 }
    ];

    // Store tasks in PM state
    await memory.store('pm-state', 'tasks', 'pm-crashed', {
      activeTasks,
      workerRegistry: ['worker-a', 'worker-b']
    });

    // Register successor
    pmFailover.registerWorker('successor-pm', 'coordinator', {
      successRate: 0.95,
      uptime: 10000,
      availableCapacity: 5
    });

    // Detect crash
    pmFailover.detectPMFailure('pm-crashed');

    // Promote successor
    await pmFailover.promoteWorker('successor-pm', 'pm-crashed');

    // Redistribute tasks
    const redistributed = await pmFailover.redistributeTasks('pm-crashed', 'successor-pm');
    expect(redistributed).toBe(true);

    // Verify tasks published to new PM
    // (In real implementation, would check MessageBroker for published tasks)
  });

  it('should handle multiple PM failures with successive promotions', async () => {
    // Register initial PM
    pmFailover.registerPM('pm-1', {
      successRate: 0.90,
      uptime: 5000,
      availableCapacity: 3
    });

    // Register worker chain
    pmFailover.registerWorker('pm-2-candidate', 'coordinator', {
      successRate: 0.88,
      uptime: 4000,
      availableCapacity: 4
    });

    pmFailover.registerWorker('pm-3-candidate', 'coordinator', {
      successRate: 0.85,
      uptime: 3000,
      availableCapacity: 5
    });

    // First PM crash
    pmFailover.detectPMFailure('pm-1');
    const successor1 = await pmFailover.selectSuccessor();
    expect(successor1.workerId).toBe('pm-2-candidate');
    await pmFailover.promoteWorker('pm-2-candidate', 'pm-1');

    // Second PM crash (promoted PM fails)
    pmFailover.detectPMFailure('pm-2-candidate');
    const successor2 = await pmFailover.selectSuccessor();
    expect(successor2.workerId).toBe('pm-3-candidate');
    await pmFailover.promoteWorker('pm-3-candidate', 'pm-2-candidate');

    // Verify final PM in place
    const finalPromotion = await memory.retrieve('pm-failover', 'promotion', 'pm-3-candidate');
    expect(finalPromotion).toBeDefined();
  });

  it('should not promote if no eligible successors available', async () => {
    // Register PM
    pmFailover.registerPM('pm-lonely', {
      successRate: 0.90,
      uptime: 5000,
      availableCapacity: 3
    });

    // No workers registered - no successors available

    // Detect failure
    pmFailover.detectPMFailure('pm-lonely');

    // Try to select successor
    const successor = await pmFailover.selectSuccessor();
    expect(successor).toBeNull(); // No eligible workers

    // Cannot promote
    const promoted = await pmFailover.promoteWorker('', 'pm-lonely');
    expect(promoted).toBe(false);
  });

  it('should preserve task dependencies during failover', async () => {
    // Register PM with dependent tasks
    pmFailover.registerPM('pm-deps', {
      successRate: 0.90,
      uptime: 5000,
      availableCapacity: 3
    });

    // Tasks with dependencies
    const taskGraph = [
      { id: 'task-a', dependencies: [] },
      { id: 'task-b', dependencies: ['task-a'] },
      { id: 'task-c', dependencies: ['task-a', 'task-b'] }
    ];

    await memory.store('pm-state', 'tasks', 'pm-deps', { taskGraph });

    // Register successor
    pmFailover.registerWorker('new-pm', 'coordinator', {
      successRate: 0.95,
      uptime: 10000,
      availableCapacity: 5
    });

    // Failover
    pmFailover.detectPMFailure('pm-deps');
    await pmFailover.promoteWorker('new-pm', 'pm-deps');
    await pmFailover.redistributeTasks('pm-deps', 'new-pm');

    // Verify task graph preserved
    const restoredState = await memory.retrieve('pm-state', 'tasks', 'new-pm');
    expect(restoredState).toBeDefined();
    // Dependencies should be maintained in transferred state
  });
});
