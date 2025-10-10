/**
 * Integration tests for SwarmCoordinator
 *
 * Tests the complete fleet orchestration system with Redis coordination
 */

import { describe, it, beforeEach, afterEach, beforeAll, afterAll } from 'node:test';
import assert from 'node:assert';
import { SwarmCoordinator } from '../SwarmCoordinator.js';
import { createClient } from 'redis';
import { promisify } from 'util';

// Test configuration
const TEST_CONFIG = {
  swarmId: 'test-swarmcoordinator-integration',
  maxAgents: 50,
  redis: {
    host: 'localhost',
    port: 6379,
    db: 1 // Use test database
  }
};

// Helper to setup test Redis
async function setupTestRedis() {
  const redis = createClient(TEST_CONFIG.redis);
  await redis.connect();

  // Clear test data
  await redis.flushDb();

  return redis;
}

// Helper to cleanup test Redis
async function cleanupTestRedis(redis) {
  await redis.flushDb();
  await redis.quit();
}

describe('SwarmCoordinator Integration Tests', () => {
  let coordinator;
  let testRedis;

  beforeAll(async () => {
    // Setup test Redis
    testRedis = await setupTestRedis();
  });

  afterAll(async () => {
    // Cleanup test Redis
    await cleanupTestRedis(testRedis);
  });

  beforeEach(async () => {
    // Create new coordinator for each test
    coordinator = new SwarmCoordinator(TEST_CONFIG);
  });

  afterEach(async () => {
    // Cleanup coordinator after each test
    if (coordinator && coordinator.isRunning) {
      await coordinator.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize SwarmCoordinator successfully', async () => {
      await coordinator.initialize();

      assert.strictEqual(coordinator.isRunning, true);
      assert.strictEqual(coordinator.swarmId, TEST_CONFIG.swarmId);
      assert.ok(coordinator.coordinatorId);
      assert.ok(coordinator.fleetCommander);
      assert.ok(coordinator.redisCoordinator);
      assert.ok(coordinator.agentRegistry);
      assert.ok(coordinator.resourceAllocator);
      assert.ok(coordinator.healthMonitor);
    });

    it('should initialize fleet components correctly', async () => {
      await coordinator.initialize();

      // Check fleet commander is initialized
      assert.ok(coordinator.fleetCommander.isRunning);

      // Check Redis coordinator is initialized
      assert.ok(coordinator.redisCoordinator.isInitialized);

      // Check initial fleet status
      const fleetStatus = await coordinator.fleetCommander.getFleetStatus();
      assert.ok(fleetStatus);
      assert.ok(fleetStatus.agents);
      assert.ok(fleetStatus.pools);
    });
  });

  describe('Agent Lifecycle Orchestration', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should spawn a new agent successfully', async () => {
      const agentConfig = {
        type: 'coder',
        capabilities: ['javascript', 'typescript'],
        priority: 8
      };

      const agentId = await coordinator.spawnAgent(agentConfig);

      assert.ok(agentId);
      assert.ok(agentId.startsWith('agent-'));

      // Check agent is registered
      const agent = await coordinator.agentRegistry.get(agentId);
      assert.ok(agent);
      assert.strictEqual(agent.type, 'coder');
      assert.strictEqual(agent.status, 'idle');

      // Check workload tracking
      const workload = coordinator.agentWorkloads.get(agentId);
      assert.ok(workload);
      assert.strictEqual(workload.currentTasks, 0);
      assert.strictEqual(workload.totalTasks, 0);
    });

    it('should monitor agent status', async () => {
      // Spawn an agent
      const agentId = await coordinator.spawnAgent({
        type: 'tester',
        capabilities: ['unit-testing']
      });

      // Monitor agent
      const status = await coordinator.monitorAgent(agentId);

      assert.ok(status);
      assert.ok(status.agent);
      assert.strictEqual(status.agent.id, agentId);
      assert.ok(status.workload);
      assert.ok(status.healthStatus);
    });

    it('should terminate agent successfully', async () => {
      // Spawn an agent
      const agentId = await coordinator.spawnAgent({
        type: 'reviewer',
        capabilities: ['code-review']
      });

      // Verify agent exists
      let agent = await coordinator.agentRegistry.get(agentId);
      assert.ok(agent);

      // Terminate agent
      await coordinator.terminateAgent(agentId, 'test_termination');

      // Verify agent is removed
      agent = await coordinator.agentRegistry.get(agentId);
      assert.strictEqual(agent, null);

      // Verify workload tracking is cleaned up
      const workload = coordinator.agentWorkloads.get(agentId);
      assert.strictEqual(workload, undefined);
    });

    it('should handle agent termination with active tasks', async () => {
      // Spawn an agent
      const agentId = await coordinator.spawnAgent({
        type: 'coder',
        capabilities: ['javascript']
      });

      // Submit a task that would be assigned to this agent
      const taskId = await coordinator.submitTask({
        title: 'Test task',
        poolType: 'coder',
        capabilities: ['javascript'],
        priority: 7
      });

      // Wait a bit for task allocation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Terminate agent
      await coordinator.terminateAgent(agentId, 'test_termination');

      // Task should be marked as failed
      assert.ok(!coordinator.activeTasks.has(taskId));
    });
  });

  describe('Task Distribution and Load Balancing', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should submit task to queue successfully', async () => {
      const task = {
        title: 'Write JavaScript function',
        poolType: 'coder',
        capabilities: ['javascript'],
        priority: 7,
        estimatedDuration: 5000
      };

      const taskId = await coordinator.submitTask(task);

      assert.ok(taskId);
      assert.ok(taskId.startsWith('task-'));

      // Check task is in queue
      const queuedTask = coordinator.taskQueue.find(t => t.id === taskId);
      assert.ok(queuedTask);
      assert.strictEqual(queuedTask.title, task.title);
      assert.strictEqual(queuedTask.status, 'queued');
    });

    it('should allocate task to suitable agent', async () => {
      // Spawn a suitable agent
      const agentId = await coordinator.spawnAgent({
        type: 'coder',
        capabilities: ['javascript', 'typescript']
      });

      // Submit task
      const taskId = await coordinator.submitTask({
        title: 'Write JavaScript code',
        poolType: 'coder',
        capabilities: ['javascript'],
        priority: 8
      });

      // Wait for task processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check task is allocated to agent
      const taskExecution = coordinator.activeTasks.get(taskId);
      assert.ok(taskExecution);
      assert.strictEqual(taskExecution.agentId, agentId);
      assert.strictEqual(taskExecution.status, 'executing');
    });

    it('should handle task completion', async () => {
      // Spawn agent
      const agentId = await coordinator.spawnAgent({
        type: 'coder',
        capabilities: ['python']
      });

      // Submit and allocate task
      const taskId = await coordinator.submitTask({
        title: 'Write Python function',
        poolType: 'coder',
        capabilities: ['python']
      });

      // Wait for allocation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate task completion
      const result = {
        success: true,
        data: { code: 'def hello(): pass' },
        duration: 2000
      };

      await coordinator.handleTaskCompletion(taskId, result);

      // Check task is removed from active tasks
      assert.ok(!coordinator.activeTasks.has(taskId));

      // Check metrics updated
      assert.strictEqual(coordinator.metrics.completedTasks, 1);
      assert.ok(coordinator.metrics.averageTaskDuration > 0);

      // Check agent workload updated
      const workload = coordinator.agentWorkloads.get(agentId);
      assert.strictEqual(workload.currentTasks, 0);
      assert.strictEqual(workload.totalTasks, 1);
    });

    it('should handle task failure', async () => {
      // Spawn agent
      const agentId = await coordinator.spawnAgent({
        type: 'tester',
        capabilities: ['testing']
      });

      // Submit task
      const taskId = await coordinator.submitTask({
        title: 'Run tests',
        poolType: 'tester',
        capabilities: ['testing']
      });

      // Wait for allocation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate task failure
      const error = 'Test execution failed';
      await coordinator.handleTaskFailure(taskId, error);

      // Check task is removed from active tasks
      assert.ok(!coordinator.activeTasks.has(taskId));

      // Check metrics updated
      assert.strictEqual(coordinator.metrics.failedTasks, 1);

      // Check agent performance score decreased
      const workload = coordinator.agentWorkloads.get(agentId);
      assert.ok(workload.performanceScore < 1.0);
    });

    it('should prioritize tasks correctly', async () => {
      // Submit tasks with different priorities
      const lowPriorityTask = await coordinator.submitTask({
        title: 'Low priority task',
        priority: 3,
        poolType: 'coder'
      });

      const highPriorityTask = await coordinator.submitTask({
        title: 'High priority task',
        priority: 9,
        poolType: 'coder'
      });

      // Check queue ordering (high priority first)
      const firstTask = coordinator.taskQueue[0];
      assert.strictEqual(firstTask.id, highPriorityTask);
      assert.strictEqual(firstTask.priority, 9);

      const secondTask = coordinator.taskQueue[1];
      assert.strictEqual(secondTask.id, lowPriorityTask);
      assert.strictEqual(secondTask.priority, 3);
    });
  });

  describe('Dynamic Agent Scaling', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should scale pool up when needed', async () => {
      const initialStatus = await coordinator.fleetCommander.getFleetStatus();
      const initialCoderCount = initialStatus.pools.coder?.currentAgents || 0;

      // Scale up coder pool
      const targetSize = Math.max(initialCoderCount + 2, 5);
      await coordinator.scalePool('coder', targetSize);

      // Check scaling event recorded
      const scalingEvent = coordinator.scalingHistory.find(event =>
        event.poolType === 'coder' && event.newSize === targetSize
      );
      assert.ok(scalingEvent);
      assert.strictEqual(scalingEvent.reason, 'auto_scaling');

      // Check metrics updated
      assert.strictEqual(coordinator.metrics.scalingEvents, 1);
    });

    it('should scale pool down when underutilized', async () => {
      // First scale up
      await coordinator.scalePool('coder', 8);

      const status = await coordinator.fleetCommander.getFleetStatus();
      const currentCount = status.pools.coder?.currentAgents || 0;

      // Scale down
      if (currentCount > 3) {
        const targetSize = currentCount - 1;
        await coordinator.scalePool('coder', targetSize);

        const finalStatus = await coordinator.fleetCommander.getFleetStatus();
        assert.strictEqual(finalStatus.pools.coder?.currentAgents, targetSize);
      }
    });

    it('should calculate optimal agent count based on workload', async () => {
      const poolType = 'coder';

      // Submit many tasks to create workload pressure
      for (let i = 0; i < 10; i++) {
        await coordinator.submitTask({
          title: `Task ${i}`,
          poolType,
          priority: 7
        });
      }

      const optimalSize = await coordinator.calculateOptimalAgentCount(poolType);

      assert.ok(optimalSize >= 0);
      assert.ok(typeof optimalSize === 'number');
    });
  });

  describe('Fleet Monitoring and Metrics', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should collect comprehensive fleet metrics', async () => {
      const metrics = await coordinator.getFleetMetrics();

      assert.ok(metrics);
      assert.ok(metrics.coordinator);
      assert.ok(metrics.fleet);
      assert.ok(metrics.coordination);
      assert.ok(metrics.performance);

      // Check coordinator metrics
      assert.strictEqual(metrics.coordinator.id, coordinator.coordinatorId);
      assert.ok(metrics.coordinator.uptime >= 0);

      // Check fleet metrics
      assert.ok(metrics.fleet.agents);
      assert.ok(metrics.fleet.pools);

      // Check coordination metrics
      assert.ok(metrics.coordination.taskQueue);
      assert.ok(metrics.coordination.scaling);

      // Check performance metrics
      assert.ok(metrics.performance.agentUtilization >= 0);
      assert.ok(metrics.performance.averagePerformance >= 0);
    });

    it('should create metrics dashboard', async () => {
      const dashboard = await coordinator.createMetricsDashboard();

      assert.ok(dashboard);
      assert.ok(dashboard.overview);
      assert.ok(dashboard.performance);
      assert.ok(dashboard.scaling);
      assert.ok(dashboard.health);
      assert.ok(dashboard.pools);

      // Check overview metrics
      assert.ok(typeof dashboard.overview.totalAgents === 'number');
      assert.ok(typeof dashboard.overview.utilizationRate === 'number');
      assert.ok(typeof dashboard.overview.taskQueueSize === 'number');

      // Check performance metrics
      assert.ok(typeof dashboard.performance.tasksCompleted === 'number');
      assert.ok(typeof dashboard.performance.tasksFailed === 'number');
      assert.ok(typeof dashboard.performance.successRate === 'number');
    });

    it('should track agent workload correctly', async () => {
      // Spawn agent
      const agentId = await coordinator.spawnAgent({
        type: 'coder',
        capabilities: ['javascript']
      });

      // Submit task
      await coordinator.submitTask({
        title: 'Test task',
        poolType: 'coder',
        capabilities: ['javascript']
      });

      // Wait for allocation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check workload tracking
      const workload = coordinator.agentWorkloads.get(agentId);
      assert.ok(workload);
      assert.strictEqual(workload.currentTasks, 1);
      assert.strictEqual(workload.totalTasks, 1);
      assert.ok(workload.lastTaskTime > 0);
    });
  });

  describe('Redis Coordination', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should publish coordination events', async () => {
      // Subscribe to coordination channel
      let eventReceived = false;
      let eventData = null;

      await coordinator.redisCoordinator.subscribe(
        coordinator.config.channels.coordination,
        (message) => {
          if (message.type === 'test_event') {
            eventReceived = true;
            eventData = message;
          }
        }
      );

      // Publish test event
      await coordinator.publishCoordinationEvent({
        type: 'test_event',
        data: 'test_payload',
        timestamp: Date.now()
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.ok(eventReceived);
      assert.ok(eventData);
      assert.strictEqual(eventData.type, 'test_event');
      assert.strictEqual(eventData.data, 'test_payload');
    });

    it('should handle orchestration commands', async () => {
      let agentSpawned = false;

      // Listen for agent spawned event
      await coordinator.redisCoordinator.subscribe(
        coordinator.config.channels.coordination,
        (message) => {
          if (message.type === 'agent_spawned') {
            agentSpawned = true;
          }
        }
      );

      // Send orchestration command
      await coordinator.redisCoordinator.publish(
        coordinator.config.channels.orchestration,
        {
          type: 'spawn_agent',
          config: {
            type: 'tester',
            capabilities: ['unit-testing']
          }
        }
      );

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      assert.ok(agentSpawned);
    });

    it('should coordinate with multiple instances', async () => {
      // Create second coordinator
      const coordinator2 = new SwarmCoordinator({
        ...TEST_CONFIG,
        swarmId: TEST_CONFIG.swarmId + '-2'
      });
      await coordinator2.initialize();

      let coordinationReceived = false;

      // Setup coordination between instances
      await coordinator2.redisCoordinator.subscribe(
        coordinator.config.channels.coordination,
        (message) => {
          if (message.senderId !== coordinator2.coordinatorId) {
            coordinationReceived = true;
          }
        }
      );

      // Publish event from first coordinator
      await coordinator.publishCoordinationEvent({
        type: 'cross_coordination_test',
        timestamp: Date.now()
      });

      // Wait for coordination
      await new Promise(resolve => setTimeout(resolve, 200));

      assert.ok(coordinationReceived);

      // Cleanup
      await coordinator2.shutdown();
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should handle agent health issues', async () => {
      // Spawn agent
      const agentId = await coordinator.spawnAgent({
        type: 'coder',
        capabilities: ['javascript']
      });

      // Submit task
      const taskId = await coordinator.submitTask({
        title: 'Test task',
        poolType: 'coder',
        capabilities: ['javascript']
      });

      // Wait for allocation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate unhealthy agent
      await coordinator.handleUnhealthyAgent(agentId, 'simulated_failure');

      // Check agent is terminated
      const agent = await coordinator.agentRegistry.get(agentId);
      assert.strictEqual(agent, null);

      // Check task is failed
      assert.ok(!coordinator.activeTasks.has(taskId));

      // Check recovery metrics
      assert.strictEqual(coordinator.metrics.recoveryEvents, 1);
    });

    it('should handle task timeouts', async () => {
      // Spawn agent
      await coordinator.spawnAgent({
        type: 'reviewer',
        capabilities: ['code-review']
      });

      // Submit task with short timeout
      const taskId = await coordinator.submitTask({
        title: 'Long running task',
        poolType: 'reviewer',
        timeout: 100 // 100ms timeout
      });

      // Wait for allocation and timeout
      await new Promise(resolve => setTimeout(resolve, 200));

      // Task should be failed due to timeout
      assert.ok(!coordinator.activeTasks.has(taskId));
      assert.ok(coordinator.metrics.failedTasks > 0);
    });

    it('should maintain stability during high load', async () => {
      // Spawn multiple agents
      const agentIds = [];
      for (let i = 0; i < 5; i++) {
        agentIds.push(await coordinator.spawnAgent({
          type: 'coder',
          capabilities: ['javascript']
        }));
      }

      // Submit many tasks
      const taskIds = [];
      for (let i = 0; i < 20; i++) {
        taskIds.push(await coordinator.submitTask({
          title: `Load test task ${i}`,
          poolType: 'coder',
          priority: Math.floor(Math.random() * 10) + 1
        }));
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check coordinator is still running
      assert.strictEqual(coordinator.isRunning, true);

      // Check queue is being processed
      const queueSize = coordinator.taskQueue.length;
      assert.ok(queueSize < 20); // Some tasks should be processed

      // Check metrics are consistent
      assert.ok(coordinator.metrics.totalTasks >= 20);
      assert.ok(coordinator.metrics.completedTasks + coordinator.metrics.failedTasks > 0);
    });
  });

  describe('Performance and Scalability', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should handle concurrent task submission', async () => {
      const taskPromises = [];

      // Submit 50 tasks concurrently
      for (let i = 0; i < 50; i++) {
        taskPromises.push(coordinator.submitTask({
          title: `Concurrent task ${i}`,
          poolType: 'coder',
          priority: Math.floor(Math.random() * 10) + 1
        }));
      }

      const taskIds = await Promise.all(taskPromises);

      // Check all tasks were queued
      assert.strictEqual(taskIds.length, 50);
      assert.strictEqual(coordinator.taskQueue.length, 50);

      // Check all task IDs are unique
      const uniqueIds = new Set(taskIds);
      assert.strictEqual(uniqueIds.size, 50);
    });

    it('should maintain performance under load', async () => {
      const startTime = Date.now();

      // Spawn agents
      for (let i = 0; i < 10; i++) {
        await coordinator.spawnAgent({
          type: 'coder',
          capabilities: ['javascript']
        });
      }

      // Submit and process tasks
      const taskIds = [];
      for (let i = 0; i < 30; i++) {
        taskIds.push(await coordinator.submitTask({
          title: `Performance task ${i}`,
          poolType: 'coder'
        }));
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Check performance is reasonable
      assert.ok(duration < 5000); // Should complete within 5 seconds

      // Check metrics
      const metrics = await coordinator.getFleetMetrics();
      assert.ok(metrics.performance.agentUtilization >= 0);
    });

    it('should handle large number of agents', async () => {
      const agentIds = [];

      // Spawn many agents
      for (let i = 0; i < 20; i++) {
        agentIds.push(await coordinator.spawnAgent({
          type: 'coder',
          capabilities: ['javascript', 'typescript']
        }));
      }

      // Check all agents are registered
      const allAgents = await coordinator.agentRegistry.listAll();
      assert.ok(allAgents.length >= 20);

      // Check workload tracking for all agents
      for (const agentId of agentIds) {
        const workload = coordinator.agentWorkloads.get(agentId);
        assert.ok(workload);
      }

      // Get fleet metrics
      const metrics = await coordinator.getFleetMetrics();
      assert.ok(metrics.fleet.agents.total >= 20);
    });
  });

  describe('Cleanup and Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await coordinator.initialize();

      // Spawn agents and submit tasks
      await coordinator.spawnAgent({
        type: 'coder',
        capabilities: ['javascript']
      });

      await coordinator.submitTask({
        title: 'Test task',
        poolType: 'coder'
      });

      // Wait for setup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Shutdown
      await coordinator.shutdown();

      // Check shutdown state
      assert.strictEqual(coordinator.isRunning, false);
      assert.ok(!coordinator.taskProcessingInterval);
      assert.ok(!coordinator.scalingInterval);
      assert.ok(!coordinator.metricsInterval);

      // Check tasks are cleaned up
      assert.strictEqual(coordinator.activeTasks.size, 0);
    });

    it('should cleanup resources properly', async () => {
      await coordinator.initialize();

      const redisCoordinator = coordinator.redisCoordinator;
      const fleetCommander = coordinator.fleetCommander;

      // Shutdown
      await coordinator.shutdown();

      // Check Redis coordinator is shutdown
      assert.ok(!redisCoordinator.isInitialized);

      // Check fleet commander is shutdown
      assert.ok(!fleetCommander.isRunning);
    });
  });
});