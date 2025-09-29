/**
 * Stage 3 Unified System Integration Tests
 * Tests the UltraFastAgentManager with all components integrated
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { UltraFastAgentManager } from '../../src/agents/unified-ultra-fast-agent-manager.js';
import { stage3Validator } from '../../src/agents/stage3-integration-validator.js';

describe('Stage 3 Unified System Integration', () => {
  let unifiedManager: UltraFastAgentManager;

  beforeEach(async () => {
    unifiedManager = new UltraFastAgentManager({
      performanceTargets: {
        spawnTimeP95Ms: 100,
        communicationP95Ms: 5,
        maxConcurrentAgents: 1000
      }
    });
    await unifiedManager.initialize();
  });

  afterEach(async () => {
    if (unifiedManager) {
      await unifiedManager.shutdown();
    }
  });

  describe('System Integration Tests', () => {
    it('should initialize with all components integrated', async () => {
      const systemStatus = await unifiedManager.getSystemStatus();
      
      expect(systemStatus.status).toBe('operational');
      expect(systemStatus.components.agentManager).toBe('operational');
      expect(systemStatus.components.communicationBus).toBe('operational');
      expect(systemStatus.components.executor).toBe('operational');
    });

    it('should spawn agents within performance targets', async () => {
      const agentCount = 10;
      const spawnTimes: number[] = [];
      const startTime = performance.now();

      // Spawn agents and measure time
      const spawnPromises = Array.from({ length: agentCount }, async (_, i) => {
        const agentStart = performance.now();
        await unifiedManager.spawnAgent({
          id: `test-agent-${i}`,
          type: 'coder',
          config: { test: true }
        });
        const spawnTime = performance.now() - agentStart;
        spawnTimes.push(spawnTime);
        return spawnTime;
      });

      await Promise.all(spawnPromises);
      const totalTime = performance.now() - startTime;

      // Validate performance
      const p95SpawnTime = spawnTimes.sort((a, b) => a - b)[Math.floor(spawnTimes.length * 0.95)];
      const averageSpawnTime = spawnTimes.reduce((a, b) => a + b, 0) / spawnTimes.length;

      expect(p95SpawnTime).toBeLessThan(100); // <100ms P95
      expect(averageSpawnTime).toBeLessThan(50); // <50ms average
      expect(totalTime).toBeLessThan(2000); // Complete within 2 seconds

      // Verify agents were spawned
      const metrics = unifiedManager.getSystemMetrics();
      expect(metrics.totalAgents).toBe(agentCount);
    });

    it('should handle inter-agent communication efficiently', async () => {
      // Spawn test agents
      const agentIds = ['agent-1', 'agent-2', 'agent-3'];
      await Promise.all(
        agentIds.map(id => 
          unifiedManager.spawnAgent({ id, type: 'researcher', config: {} })
        )
      );

      const messageCount = 20;
      const messageTimes: number[] = [];

      // Send messages between agents
      for (let i = 0; i < messageCount; i++) {
        const sender = agentIds[i % agentIds.length];
        const receiver = agentIds[(i + 1) % agentIds.length];
        
        const messageStart = performance.now();
        const result = await unifiedManager.sendMessage({
          from: sender,
          to: receiver,
          type: 'test-message',
          data: { messageId: i, content: `Test message ${i}` }
        });
        
        if (result.success) {
          const messageTime = performance.now() - messageStart;
          messageTimes.push(messageTime);
        }
      }

      // Validate communication performance
      const p95MessageTime = messageTimes.sort((a, b) => a - b)[Math.floor(messageTimes.length * 0.95)];
      const averageMessageTime = messageTimes.reduce((a, b) => a + b, 0) / messageTimes.length;

      expect(p95MessageTime).toBeLessThan(5); // <5ms P95
      expect(averageMessageTime).toBeLessThan(2); // <2ms average
      expect(messageTimes.length).toBe(messageCount); // All messages delivered
    });

    it('should execute tasks through integrated executor', async () => {
      // Spawn test agent
      await unifiedManager.spawnAgent({
        id: 'executor-test-agent',
        type: 'coder',
        config: { role: 'task-executor' }
      });

      const taskCount = 5;
      const taskTimes: number[] = [];

      // Execute tasks
      const taskPromises = Array.from({ length: taskCount }, async (_, i) => {
        const taskStart = performance.now();
        const result = await unifiedManager.executeTask({
          id: `test-task-${i}`,
          type: 'test-computation',
          agentId: 'executor-test-agent',
          data: { input: i * 10, operation: 'multiply' },
          timeout: 5000
        });
        
        if (result.success) {
          const taskTime = performance.now() - taskStart;
          taskTimes.push(taskTime);
        }
        
        return result;
      });

      const results = await Promise.all(taskPromises);

      // Validate task execution
      const successfulTasks = results.filter(r => r.success).length;
      const averageTaskTime = taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length;

      expect(successfulTasks).toBe(taskCount); // All tasks successful
      expect(averageTaskTime).toBeLessThan(100); // <100ms average execution
      expect(taskTimes.every(t => t < 1000)).toBe(true); // All tasks <1 second
    });

    it('should maintain system stability under concurrent operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      
      // Create mixed concurrent operations
      const operations: Promise<any>[] = [];
      
      // Agent spawning
      for (let i = 0; i < 20; i++) {
        operations.push(
          unifiedManager.spawnAgent({
            id: `concurrent-agent-${i}`,
            type: 'tester',
            config: { concurrent: true }
          })
        );
      }
      
      // Wait for agents to be available
      await Promise.all(operations);
      
      const messagingOperations: Promise<any>[] = [];
      const taskOperations: Promise<any>[] = [];
      
      // Messaging operations
      for (let i = 0; i < 50; i++) {
        messagingOperations.push(
          unifiedManager.sendMessage({
            from: `concurrent-agent-${i % 20}`,
            to: `concurrent-agent-${(i + 1) % 20}`,
            type: 'concurrent-message',
            data: { index: i }
          })
        );
      }
      
      // Task execution operations
      for (let i = 0; i < 30; i++) {
        taskOperations.push(
          unifiedManager.executeTask({
            id: `concurrent-task-${i}`,
            type: 'concurrent-computation',
            agentId: `concurrent-agent-${i % 20}`,
            data: { taskIndex: i },
            timeout: 3000
          })
        );
      }

      // Execute all concurrent operations
      const startTime = performance.now();
      const [messageResults, taskResults] = await Promise.all([
        Promise.allSettled(messagingOperations),
        Promise.allSettled(taskOperations)
      ]);
      const totalTime = performance.now() - startTime;
      
      // Analyze results
      const successfulMessages = messageResults.filter(r => 
        r.status === 'fulfilled' && (r.value as any).success
      ).length;
      const successfulTasks = taskResults.filter(r => 
        r.status === 'fulfilled' && (r.value as any).success
      ).length;
      
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;

      // Validate system stability
      expect(totalTime).toBeLessThan(15000); // Complete within 15 seconds
      expect(successfulMessages).toBeGreaterThan(40); // >80% success rate
      expect(successfulTasks).toBeGreaterThan(24); // >80% success rate
      expect(memoryIncrease).toBeLessThan(100); // <100MB memory increase
      
      // System should still be operational
      const systemStatus = await unifiedManager.getSystemStatus();
      expect(systemStatus.status).toMatch(/operational|degraded/);
    });

    it('should handle system resource cleanup properly', async () => {
      const initialMetrics = unifiedManager.getSystemMetrics();
      
      // Create and terminate agents
      const agentIds = Array.from({ length: 10 }, (_, i) => `cleanup-agent-${i}`);
      
      // Spawn agents
      await Promise.all(
        agentIds.map(id => 
          unifiedManager.spawnAgent({
            id,
            type: 'reviewer',
            config: { temporary: true }
          })
        )
      );
      
      const midTestMetrics = unifiedManager.getSystemMetrics();
      expect(midTestMetrics.totalAgents).toBe(initialMetrics.totalAgents + 10);
      
      // Terminate all agents
      const terminationResults = await Promise.all(
        agentIds.map(id => unifiedManager.terminateAgent(id))
      );
      
      // Brief pause for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const finalMetrics = unifiedManager.getSystemMetrics();
      
      // Validate cleanup
      expect(terminationResults.every(result => result)).toBe(true); // All terminations successful
      expect(finalMetrics.totalAgents).toBeLessThanOrEqual(initialMetrics.totalAgents + 2); // Allow small variance
    });
  });

  describe('Performance Validation Integration', () => {
    it('should run baseline performance validation', async () => {
      // Use the integrated performance validator
      const validator = stage3Validator;
      
      // Mock the agent manager for testing
      (validator as any).agentManager = unifiedManager;
      
      // Create a simple validation scenario
      const scenario = {
        name: 'Integration Test Baseline',
        description: 'Basic validation for integration test',
        agentCount: 5,
        messageCount: 10,
        taskCount: 5,
        targets: {
          spawnTimeP95Ms: 100,
          communicationP95Ms: 5,
          concurrentAgents: 5,
          memoryLimitMB: 100,
          successRate: 0.8
        }
      };
      
      const result = await (validator as any).executeValidationScenario(scenario);
      
      // Validate the result structure
      expect(result).toHaveProperty('scenario');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('details');
      
      expect(result.scenario).toBe(scenario.name);
      expect(typeof result.passed).toBe('boolean');
      expect(result.metrics).toHaveProperty('spawnTimeP95');
      expect(result.metrics).toHaveProperty('communicationP95');
      expect(result.metrics).toHaveProperty('concurrentAgents');
      expect(result.metrics).toHaveProperty('memoryUsage');
      expect(result.metrics).toHaveProperty('successRate');
    }, 30000); // 30 second timeout
  });

  describe('System Error Handling', () => {
    it('should handle invalid agent operations gracefully', async () => {
      // Test invalid agent spawning
      try {
        await unifiedManager.spawnAgent({
          id: '', // Invalid empty ID
          type: 'coder',
          config: {}
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
      
      // Test message to non-existent agent
      const messageResult = await unifiedManager.sendMessage({
        from: 'non-existent-sender',
        to: 'non-existent-receiver',
        type: 'test-message',
        data: { test: true }
      });
      
      expect(messageResult.success).toBe(false);
      
      // Test task execution for non-existent agent
      const taskResult = await unifiedManager.executeTask({
        id: 'test-task',
        type: 'test-task',
        agentId: 'non-existent-agent',
        data: { test: true }
      });
      
      expect(taskResult.success).toBe(false);
    });

    it('should maintain system stability during error conditions', async () => {
      // Spawn a valid agent first
      await unifiedManager.spawnAgent({
        id: 'error-test-agent',
        type: 'coder',
        config: {}
      });
      
      // Generate various error conditions
      const errorOperations = [
        // Invalid message operations
        unifiedManager.sendMessage({
          from: 'error-test-agent',
          to: '', // Invalid target
          type: 'error-test',
          data: {}
        }),
        
        // Invalid task operations
        unifiedManager.executeTask({
          id: 'error-task',
          type: 'invalid-task-type',
          agentId: 'error-test-agent',
          data: {},
          timeout: 1 // Very short timeout
        }),
        
        // Multiple operations on busy agent
        ...Array.from({ length: 5 }, (_, i) =>
          unifiedManager.executeTask({
            id: `busy-task-${i}`,
            type: 'long-running-task',
            agentId: 'error-test-agent',
            data: { index: i },
            timeout: 100
          })
        )
      ];
      
      // Execute all error operations
      const results = await Promise.allSettled(errorOperations);
      
      // System should remain operational despite errors
      const systemStatus = await unifiedManager.getSystemStatus();
      expect(systemStatus.components.agentManager).toBe('operational');
      
      // Should still be able to perform valid operations
      const validMessageResult = await unifiedManager.sendMessage({
        from: 'error-test-agent',
        to: 'error-test-agent',
        type: 'recovery-test',
        data: { recovered: true }
      });
      
      expect(validMessageResult.success).toBe(true);
    });
  });
});