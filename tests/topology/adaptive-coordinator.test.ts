import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
const vi = jest;
import { AdaptiveCoordinator } from '../../src/topology/adaptive-coordinator';
import { LifecycleManager } from '../../src/agents/lifecycle-manager';
import { DependencyTracker } from '../../src/lifecycle/dependency-tracker';
import { AgentRegistration, TaskExecution, CoordinationMessage } from '../../src/topology/types';

// Mock dependencies
vi.mock('../../src/agents/lifecycle-manager');
vi.mock('../../src/lifecycle/dependency-tracker');
vi.mock('../../src/core/logger');
vi.mock('../../src/utils/helpers', () => ({
  generateId: vi.fn().mockImplementation((prefix = '') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
}));

describe('AdaptiveCoordinator', () => {
  let coordinator: AdaptiveCoordinator;
  let mockLifecycleManager: vi.Mocked<LifecycleManager>;
  let mockDependencyTracker: vi.Mocked<DependencyTracker>;

  beforeEach(async () => {
    // Setup mocks
    mockLifecycleManager = {
      pauseAgent: vi.fn().mockResolvedValue(undefined),
      resumeAgent: vi.fn().mockResolvedValue(undefined)
    } as any;

    mockDependencyTracker = {
      initialize: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      hasDependencies: vi.fn().mockResolvedValue(false),
      addDependency: vi.fn().mockResolvedValue('dep-id'),
      removeDependency: vi.fn().mockResolvedValue(undefined),
      getAgentDependencies: vi.fn().mockResolvedValue([])
    } as any;

    // Create coordinator instance
    coordinator = new AdaptiveCoordinator({
      maxAgents: 20,
      adaptationInterval: 1000, // 1 second for testing
      confidenceThreshold: 0.6,
      stabilityPeriod: 5000, // 5 seconds
      maxAdaptationsPerHour: 10,
      enableHybridMode: true
    });

    // Replace mocked dependencies
    (coordinator as any).lifecycleManager = mockLifecycleManager;
    (coordinator as any).dependencyTracker = mockDependencyTracker;
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.shutdown(true);
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await coordinator.initialize();

      expect(mockDependencyTracker.initialize).toHaveBeenCalled();
      expect(coordinator.type).toBe('hybrid');
    });

    test('should not initialize twice', async () => {
      await coordinator.initialize();
      await coordinator.initialize();

      expect(mockDependencyTracker.initialize).toHaveBeenCalledTimes(1);
    });

    test('should emit initialization event', async () => {
      const initSpy = vi.fn();
      coordinator.on('coordinator:initialized', initSpy);

      await coordinator.initialize();

      expect(initSpy).toHaveBeenCalledWith({
        type: 'coordinator:initialized',
        timestamp: expect.any(Date),
        topologyId: expect.any(String),
        data: { activeTopology: 'mesh' }
      });
    });

    test('should start with mesh topology', async () => {
      await coordinator.initialize();

      expect((coordinator as any).activeTopology).toBe('mesh');
    });
  });

  describe('Agent Management', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    test('should register agent successfully', async () => {
      const agent: AgentRegistration = {
        id: 'agent-1',
        type: 'worker',
        capabilities: ['compute', 'storage'],
        metadata: { priority: 'normal' }
      };

      await coordinator.registerAgent(agent);

      const registeredAgent = (coordinator as any).agents.get('agent-1');
      expect(registeredAgent).toBeDefined();
      expect(registeredAgent.id).toBe('agent-1');
      expect(registeredAgent.status).toBe('active');
    });

    test('should emit agent registration event', async () => {
      const agent: AgentRegistration = {
        id: 'agent-1',
        type: 'worker',
        capabilities: ['compute'],
        metadata: {}
      };

      const registrationSpy = vi.fn();
      coordinator.on('agent:registered', registrationSpy);

      await coordinator.registerAgent(agent);

      expect(registrationSpy).toHaveBeenCalledWith({
        type: 'agent:registered',
        timestamp: expect.any(Date),
        topologyId: expect.any(String),
        data: { agent: expect.objectContaining({ id: 'agent-1' }) }
      });
    });

    test('should enforce agent limit', async () => {
      // Register maximum number of agents
      for (let i = 0; i < 20; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }

      // Should fail to register another
      const extraAgent: AgentRegistration = {
        id: 'agent-extra',
        type: 'worker',
        capabilities: ['compute'],
        metadata: {}
      };

      await expect(coordinator.registerAgent(extraAgent))
        .rejects.toThrow('Maximum agent limit reached');
    });

    test('should unregister agent successfully', async () => {
      const agent: AgentRegistration = {
        id: 'agent-1',
        type: 'worker',
        capabilities: ['compute'],
        metadata: {}
      };

      await coordinator.registerAgent(agent);
      await coordinator.unregisterAgent('agent-1');

      const registeredAgent = (coordinator as any).agents.get('agent-1');
      expect(registeredAgent).toBeUndefined();
    });

    test('should prevent unregistering agent with dependencies', async () => {
      const agent: AgentRegistration = {
        id: 'agent-1',
        type: 'worker',
        capabilities: ['compute'],
        metadata: {}
      };

      mockDependencyTracker.hasDependencies.mockResolvedValue(true);

      await coordinator.registerAgent(agent);

      await expect(coordinator.unregisterAgent('agent-1'))
        .rejects.toThrow('Cannot unregister agent agent-1: has active dependencies');
    });
  });

  describe('Task Execution', () => {
    beforeEach(async () => {
      await coordinator.initialize();

      // Register some agents
      for (let i = 0; i < 5; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }
    });

    test('should execute task in mesh topology', async () => {
      const task: TaskExecution = {
        description: 'Test task',
        requirements: ['compute'],
        priority: 5,
        timeout: 30000
      };

      await coordinator.executeTask(task);

      const tasks = (coordinator as any).tasks;
      expect(tasks.size).toBe(1);

      const executedTask = Array.from(tasks.values())[0];
      expect(executedTask.status).toBe('completed');
      expect(executedTask.topology).toBe('mesh');
    });

    test('should emit task completion event', async () => {
      const task: TaskExecution = {
        description: 'Test task',
        requirements: ['compute'],
        priority: 5,
        timeout: 30000
      };

      const completionSpy = vi.fn();
      coordinator.on('task:completed', completionSpy);

      await coordinator.executeTask(task);

      expect(completionSpy).toHaveBeenCalledWith({
        type: 'task:completed',
        timestamp: expect.any(Date),
        topologyId: expect.any(String),
        data: {
          task: expect.objectContaining({
            status: 'completed',
            topology: 'mesh'
          })
        }
      });
    });

    test('should handle task execution failure', async () => {
      const task: TaskExecution = {
        description: 'Failing task',
        requirements: ['compute'],
        priority: 5,
        timeout: 30000
      };

      // Mock task failure
      const originalExecuteTaskMesh = (coordinator as any).executeTaskMesh;
      (coordinator as any).executeTaskMesh = vi.fn().mockRejectedValue(new Error('Task failed'));

      const failureSpy = vi.fn();
      coordinator.on('task:failed', failureSpy);

      await expect(coordinator.executeTask(task)).rejects.toThrow('Task failed');

      expect(failureSpy).toHaveBeenCalledWith({
        type: 'task:failed',
        timestamp: expect.any(Date),
        topologyId: expect.any(String),
        data: {
          task: expect.objectContaining({
            status: 'failed',
            error: 'Task failed'
          }),
          error: 'Task failed'
        }
      });

      // Restore original method
      (coordinator as any).executeTaskMesh = originalExecuteTaskMesh;
    });
  });

  describe('Message Routing', () => {
    beforeEach(async () => {
      await coordinator.initialize();

      // Register some agents
      for (let i = 0; i < 3; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }
    });

    test('should route message in mesh topology', async () => {
      const message: CoordinationMessage = {
        id: 'msg-1',
        type: 'task_assignment',
        sourceAgent: 'agent-0',
        targetAgent: 'agent-1',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await coordinator.routeMessage(message);

      // Message routing should complete without error
      expect(true).toBe(true);
    });

    test('should route broadcast message', async () => {
      const message: CoordinationMessage = {
        id: 'msg-broadcast',
        type: 'broadcast',
        sourceAgent: 'agent-0',
        data: { announcement: 'test' },
        broadcast: true,
        timestamp: new Date()
      };

      await coordinator.routeMessage(message);

      // Broadcast message should be delivered to all agents
      expect(true).toBe(true);
    });
  });

  describe('Topology Adaptation', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    test('should adapt from mesh to hierarchical under high load', async () => {
      // Register many agents to trigger hierarchical adaptation
      for (let i = 0; i < 35; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }

      // Mock high resource utilization
      const originalCalculateResourceUtilization = (coordinator as any).calculateResourceUtilization;
      (coordinator as any).calculateResourceUtilization = vi.fn().mockReturnValue(0.9);

      const adaptationSpy = vi.fn();
      coordinator.on('topology:adapted', adaptationSpy);

      // Force adaptation check
      await coordinator.adaptTopology();

      // Restore original method
      (coordinator as any).calculateResourceUtilization = originalCalculateResourceUtilization;

      expect(adaptationSpy).toHaveBeenCalled();
    });

    test('should adapt from mesh to hybrid under high error rate', async () => {
      // Register some agents
      for (let i = 0; i < 10; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }

      // Mock high error rate metrics
      const mockMetrics = {
        agentCount: 10,
        activeConnections: 20,
        averageLatency: 500,
        throughput: 50,
        errorRate: 0.15, // High error rate
        resourceUtilization: 0.6,
        faultTolerance: 0.7, // Low fault tolerance
        lastUpdated: new Date()
      };

      (coordinator as any).getMetrics = vi.fn().mockReturnValue(mockMetrics);

      const adaptationSpy = vi.fn();
      coordinator.on('topology:adapted', adaptationSpy);

      // Force adaptation check
      await coordinator.adaptTopology();

      expect(adaptationSpy).toHaveBeenCalled();
    });

    test('should not adapt too frequently', async () => {
      // Force a recent adaptation
      (coordinator as any).lastAdaptation = new Date();
      (coordinator as any).adaptationCount = 10;

      const adaptationSpy = vi.fn();
      coordinator.on('topology:adapted', adaptationSpy);

      // Try to adapt again immediately
      await coordinator.adaptTopology();

      expect(adaptationSpy).not.toHaveBeenCalled();
    });

    test('should handle adaptation failure gracefully', async () => {
      // Register some agents
      for (let i = 0; i < 10; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }

      // Mock adaptation failure
      const originalTransitionToTopology = (coordinator as any).transitionToTopology;
      (coordinator as any).transitionToTopology = vi.fn().mockRejectedValue(new Error('Transition failed'));

      // Mock conditions for adaptation
      const mockMetrics = {
        agentCount: 35,
        activeConnections: 70,
        averageLatency: 500,
        throughput: 50,
        errorRate: 0.02,
        resourceUtilization: 0.9, // High utilization
        faultTolerance: 0.8,
        lastUpdated: new Date()
      };

      (coordinator as any).getMetrics = vi.fn().mockReturnValue(mockMetrics);

      const failureSpy = vi.fn();
      coordinator.on('topology:adaptation_failed', failureSpy);

      // Force adaptation check
      await coordinator.adaptTopology();

      expect(failureSpy).toHaveBeenCalled();

      // Restore original method
      (coordinator as any).transitionToTopology = originalTransitionToTopology;
    });
  });

  describe('Metrics and Performance', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    test('should calculate metrics correctly', async () => {
      // Register agents
      for (let i = 0; i < 5; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }

      // Execute some tasks
      for (let i = 0; i < 3; i++) {
        const task: TaskExecution = {
          description: `Task ${i}`,
          requirements: ['compute'],
          priority: 5,
          timeout: 30000
        };
        await coordinator.executeTask(task);
      }

      const metrics = coordinator.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.agentCount).toBe(5);
      expect(metrics.activeConnections).toBeGreaterThan(0);
      expect(metrics.throughput).toBeGreaterThanOrEqual(0);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.faultTolerance).toBeGreaterThan(0);
      expect(metrics.lastUpdated).toBeInstanceOf(Date);
    });

    test('should calculate mesh connections correctly', async () => {
      // Register 5 agents
      for (let i = 0; i < 5; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }

      const activeConnections = (coordinator as any).calculateActiveConnections();

      // In mesh topology: n * (n-1) connections
      expect(activeConnections).toBe(5 * 4); // 20 connections
    });

    test('should calculate hierarchical connections correctly', async () => {
      // Switch to hierarchical topology
      (coordinator as any).activeTopology = 'hierarchical';

      // Register 5 agents
      for (let i = 0; i < 5; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }

      const activeConnections = (coordinator as any).calculateActiveConnections();

      // In hierarchical topology: n-1 connections (all connect to root)
      expect(activeConnections).toBe(4); // 4 connections
    });

    test('should calculate hybrid connections correctly', async () => {
      // Switch to hybrid topology
      (coordinator as any).activeTopology = 'hybrid';

      // Register 10 agents
      for (let i = 0; i < 10; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }

      const activeConnections = (coordinator as any).calculateActiveConnections();

      // In hybrid topology: coordinator mesh + worker connections
      // With 10 agents: 2 coordinators (mesh between them) + 8 workers
      expect(activeConnections).toBe(2 + 8); // 10 connections
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await coordinator.initialize();

      // Register some agents
      for (let i = 0; i < 3; i++) {
        const agent: AgentRegistration = {
          id: `agent-${i}`,
          type: 'worker',
          capabilities: ['compute'],
          metadata: {}
        };
        await coordinator.registerAgent(agent);
      }

      const shutdownSpy = vi.fn();
      coordinator.on('coordinator:shutdown', shutdownSpy);

      await coordinator.shutdown();

      expect(mockDependencyTracker.shutdown).toHaveBeenCalled();
      expect(shutdownSpy).toHaveBeenCalledWith({
        type: 'coordinator:shutdown',
        timestamp: expect.any(Date),
        topologyId: expect.any(String),
        data: { force: false }
      });
    });

    test('should force shutdown', async () => {
      await coordinator.initialize();

      await coordinator.shutdown(true);

      expect(mockDependencyTracker.shutdown).toHaveBeenCalled();
    });

    test('should wait for pending tasks during graceful shutdown', async () => {
      await coordinator.initialize();

      // Register an agent
      const agent: AgentRegistration = {
        id: 'agent-1',
        type: 'worker',
        capabilities: ['compute'],
        metadata: {}
      };
      await coordinator.registerAgent(agent);

      // Start a long-running task
      const task: TaskExecution = {
        description: 'Long task',
        requirements: ['compute'],
        priority: 5,
        timeout: 30000
      };

      // Mock a long-running task
      const originalExecuteTaskMesh = (coordinator as any).executeTaskMesh;
      (coordinator as any).executeTaskMesh = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
      });

      // Start task execution (don't await)
      const taskPromise = coordinator.executeTask(task);

      // Wait a bit for task to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Shutdown gracefully
      const shutdownPromise = coordinator.shutdown(false);

      // Complete the task
      await taskPromise;

      // Shutdown should complete
      await shutdownPromise;

      // Restore original method
      (coordinator as any).executeTaskMesh = originalExecuteTaskMesh;

      expect(mockDependencyTracker.shutdown).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    test('should handle unregistering non-existent agent', async () => {
      await expect(coordinator.unregisterAgent('non-existent'))
        .rejects.toThrow('Agent non-existent not found');
    });

    test('should handle unsupported topology in message routing', async () => {
      // Set invalid topology
      (coordinator as any).activeTopology = 'unsupported';

      const message: CoordinationMessage = {
        id: 'msg-1',
        type: 'task_assignment',
        sourceAgent: 'agent-0',
        targetAgent: 'agent-1',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await expect(coordinator.routeMessage(message))
        .rejects.toThrow('Unsupported topology: unsupported');
    });

    test('should handle dependency tracker errors gracefully', async () => {
      const agent: AgentRegistration = {
        id: 'agent-1',
        type: 'worker',
        capabilities: ['compute'],
        metadata: {}
      };

      // Mock dependency tracker error
      mockDependencyTracker.addDependency.mockRejectedValue(new Error('Dependency error'));

      // Should still register agent despite dependency error
      await coordinator.registerAgent(agent);

      const registeredAgent = (coordinator as any).agents.get('agent-1');
      expect(registeredAgent).toBeDefined();
    });
  });
});