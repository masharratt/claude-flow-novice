/**
 * Coordinator Dependency Scenario Tests
 *
 * Tests real-world scenarios involving mesh and hierarchical coordinators
 * with dependency tracking to ensure they don't complete prematurely.
 * Validates the race condition fix where coordinators complete before
 * dependent agents finish.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MeshCoordinator, createMeshCoordinatorWithDependencies } from '../../src/agents/mesh-coordinator.js';
import { HierarchicalCoordinator, createHierarchicalCoordinatorWithDependencies } from '../../src/agents/hierarchical-coordinator.js';
import {
  initializeLifecycleManager,
  shutdownLifecycleManager,
  lifecycleManager,
  DependencyType
} from '../../src/agents/lifecycle-manager.js';
import { getDependencyTracker } from '../../src/lifecycle/dependency-tracker.js';

// Mock external dependencies
vi.mock('../../src/core/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));

vi.mock('../../src/memory/manager.js', () => ({
  MemoryManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    store: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    shutdown: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../../src/core/event-bus.js', () => ({
  EventBus: {
    getInstance: vi.fn().mockReturnValue({})
  }
}));

vi.mock('../../src/utils/helpers.js', () => ({
  generateId: vi.fn().mockImplementation((prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
}));

describe('Coordinator Dependency Scenarios', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await initializeLifecycleManager();
  });

  afterEach(async () => {
    await shutdownLifecycleManager();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Mesh Coordinator Scenarios
  // ============================================================================

  describe('Mesh Coordinator Scenarios', () => {
    it('should prevent mesh coordinator from completing before agents finish tasks', async () => {
      const meshCoord = createMeshCoordinatorWithDependencies('mesh-test');
      await meshCoord.initialize();

      // Track completion events
      let coordinatorCompleted = false;
      let agentsCompleted = 0;

      meshCoord.on('coordinator:completed', () => {
        coordinatorCompleted = true;
      });

      meshCoord.on('task:completed', () => {
        agentsCompleted++;
      });

      // Register several agents
      await meshCoord.registerAgent('worker-1', {
        name: 'Worker 1',
        type: 'worker',
        status: 'ready',
        capabilities: ['processing', 'analysis']
      });

      await meshCoord.registerAgent('worker-2', {
        name: 'Worker 2',
        type: 'worker',
        status: 'ready',
        capabilities: ['processing', 'validation']
      });

      await meshCoord.registerAgent('worker-3', {
        name: 'Worker 3',
        type: 'worker',
        status: 'ready',
        capabilities: ['analysis', 'reporting']
      });

      // Start a coordination task
      const taskId = await meshCoord.coordinateTask(
        'Process data with validation and analysis',
        {
          requiredCapabilities: ['processing'],
          priority: 2
        }
      );

      expect(taskId).toBeDefined();

      // Try to shutdown coordinator immediately
      const shutdownPromise = meshCoord.shutdown();

      // Coordinator should not complete immediately due to active tasks
      const status = meshCoord.getCoordinatorStatus();
      expect(status.canComplete).toBe(false);
      expect(status.activeTaskCount).toBeGreaterThan(0);

      // Simulate task completion
      await meshCoord.handleTaskCompletion(taskId, 'worker-1', {
        processedData: 'result',
        validated: true
      });

      // Wait for dependency resolution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now coordinator should be able to complete
      await shutdownPromise;

      expect(coordinatorCompleted).toBe(true);
      expect(agentsCompleted).toBeGreaterThan(0);
    });

    it('should handle mesh coordinator re-run request while dependencies exist', async () => {
      const meshCoord = createMeshCoordinatorWithDependencies('mesh-rerun-test');
      await meshCoord.initialize();

      let rerunRequested = false;
      meshCoord.on('coordinator:rerun', () => {
        rerunRequested = true;
      });

      // Register agents and create tasks
      await meshCoord.registerAgent('worker-1', {
        name: 'Worker 1',
        type: 'worker',
        status: 'ready',
        capabilities: ['processing']
      });

      const taskId = await meshCoord.coordinateTask('Test task');

      // Shutdown coordinator (should be deferred)
      const shutdownPromise = meshCoord.shutdown();

      // Before dependencies resolve, request a rerun
      const depTracker = getDependencyTracker('mesh-test');
      await depTracker.initialize();

      // Simulate external rerun request
      const coordinatorStatus = meshCoord.getCoordinatorStatus();
      await lifecycleManager.handleRerunRequest(coordinatorStatus.coordinatorId);

      expect(rerunRequested).toBe(true);

      // Complete the task to allow shutdown
      await meshCoord.handleTaskCompletion(taskId, 'worker-1', { result: 'completed' });

      await shutdownPromise;
    });

    it('should handle mesh network with interconnected agent dependencies', async () => {
      const meshCoord = createMeshCoordinatorWithDependencies('mesh-network-test');
      await meshCoord.initialize();

      // Create a complex mesh network
      const agentIds = ['analyst-1', 'processor-1', 'validator-1', 'reporter-1'];

      for (const agentId of agentIds) {
        await meshCoord.registerAgent(agentId, {
          name: agentId,
          type: 'specialist',
          status: 'ready',
          capabilities: [agentId.split('-')[0]]
        });
      }

      // Create multiple interdependent tasks
      const task1 = await meshCoord.coordinateTask('Analysis task', {
        requiredCapabilities: ['analyst'],
        priority: 3
      });

      const task2 = await meshCoord.coordinateTask('Processing task', {
        requiredCapabilities: ['processor'],
        priority: 2
      });

      const task3 = await meshCoord.coordinateTask('Validation task', {
        requiredCapabilities: ['validator'],
        priority: 2
      });

      // Verify coordinator is blocked by multiple dependencies
      const status = meshCoord.getCoordinatorStatus();
      expect(status.activeTaskCount).toBe(3);
      expect(status.canComplete).toBe(false);

      // Complete tasks in sequence
      await meshCoord.handleTaskCompletion(task1, 'analyst-1', { analysis: 'complete' });

      // Coordinator should still be blocked
      const status2 = meshCoord.getCoordinatorStatus();
      expect(status2.canComplete).toBe(false);

      await meshCoord.handleTaskCompletion(task2, 'processor-1', { processed: true });
      await meshCoord.handleTaskCompletion(task3, 'validator-1', { validated: true });

      // Wait for all dependencies to resolve
      await new Promise(resolve => setTimeout(resolve, 150));

      // Now coordinator should be unblocked
      const status3 = meshCoord.getCoordinatorStatus();
      expect(status3.activeTaskCount).toBe(0);

      await meshCoord.shutdown();
    });

    it('should handle mesh coordinator task failure and dependency cleanup', async () => {
      const meshCoord = createMeshCoordinatorWithDependencies('mesh-failure-test');
      await meshCoord.initialize();

      let taskFailures = 0;
      meshCoord.on('task:failed', () => {
        taskFailures++;
      });

      await meshCoord.registerAgent('worker-1', {
        name: 'Worker 1',
        type: 'worker',
        status: 'ready',
        capabilities: ['processing']
      });

      const taskId = await meshCoord.coordinateTask('Failing task');

      // Simulate task failure
      await meshCoord.handleTaskFailure(taskId, 'worker-1', 'Processing error occurred');

      expect(taskFailures).toBe(1);

      // Coordinator should be able to complete after failure
      const status = meshCoord.getCoordinatorStatus();
      expect(status.activeTaskCount).toBe(0);

      await meshCoord.shutdown();
    });
  });

  // ============================================================================
  // Hierarchical Coordinator Scenarios
  // ============================================================================

  describe('Hierarchical Coordinator Scenarios', () => {
    it('should prevent hierarchical coordinator from completing before hierarchy finishes', async () => {
      const hierCoord = createHierarchicalCoordinatorWithDependencies('hier-test');
      await hierCoord.initialize();

      let coordinatorCompleted = false;
      hierCoord.on('coordinator:completed', () => {
        coordinatorCompleted = true;
      });

      // Build hierarchy: supervisor -> manager -> worker
      await hierCoord.registerAgent('supervisor-1', {
        name: 'Supervisor',
        type: 'supervisor',
        level: 0,
        status: 'ready',
        capabilities: ['supervision', 'coordination']
      });

      await hierCoord.registerAgent('manager-1', {
        name: 'Manager',
        type: 'manager',
        level: 1,
        status: 'ready',
        capabilities: ['management', 'coordination']
      }, 'supervisor-1');

      await hierCoord.registerAgent('worker-1', {
        name: 'Worker',
        type: 'worker',
        level: 2,
        status: 'ready',
        capabilities: ['execution']
      }, 'manager-1');

      // Delegate a task that will be subdivided through hierarchy
      const taskId = await hierCoord.delegateTask(
        'Complex multi-level task requiring coordination',
        {
          targetLevel: 0,
          priority: 3,
          requiredCapabilities: ['supervision']
        }
      );

      // Try to shutdown immediately
      const shutdownPromise = hierCoord.shutdown();

      // Coordinator should be blocked by hierarchy dependencies
      const status = hierCoord.getCoordinatorStatus();
      expect(status.canComplete).toBe(false);
      expect(status.activeTaskCount).toBeGreaterThan(0);

      // Complete tasks bottom-up through hierarchy
      const task = hierCoord.getTaskStatus(taskId);
      if (task) {
        // Simulate worker completing subtask
        if (task.subTaskIds.length > 0) {
          for (const subTaskId of task.subTaskIds) {
            await hierCoord.handleTaskCompletion(subTaskId, 'worker-1', {
              workResult: 'worker task completed'
            });
          }
        }

        // Complete the main task
        await hierCoord.handleTaskCompletion(taskId, 'supervisor-1', {
          coordinationResult: 'hierarchy task completed'
        });
      }

      // Wait for dependency resolution
      await new Promise(resolve => setTimeout(resolve, 200));

      await shutdownPromise;
      expect(coordinatorCompleted).toBe(true);
    });

    it('should handle hierarchical agent promotion with dependency updates', async () => {
      const hierCoord = createHierarchicalCoordinatorWithDependencies('hier-promotion-test');
      await hierCoord.initialize();

      let promotionEvents = 0;
      hierCoord.on('agent:promoted', () => {
        promotionEvents++;
      });

      // Create initial hierarchy
      await hierCoord.registerAgent('root-1', {
        name: 'Root Agent',
        type: 'root',
        level: 0,
        status: 'ready',
        capabilities: ['coordination']
      });

      await hierCoord.registerAgent('worker-1', {
        name: 'Capable Worker',
        type: 'worker',
        level: 1,
        status: 'ready',
        capabilities: ['coordination', 'processing']
      }, 'root-1');

      // Promote worker to root level
      await hierCoord.promoteAgent('worker-1');

      expect(promotionEvents).toBe(1);

      // Verify hierarchy structure updated
      const structure = hierCoord.getHierarchyStructure();
      const promotedAgent = structure.agents.find(a => a.id === 'worker-1');
      expect(promotedAgent?.level).toBe(0);
      expect(promotedAgent?.parentId).toBeUndefined();

      await hierCoord.shutdown();
    });

    it('should handle complex hierarchical delegation with subtask dependencies', async () => {
      const hierCoord = createHierarchicalCoordinatorWithDependencies('hier-complex-test');
      await hierCoord.initialize();

      // Build deep hierarchy
      const levels = [
        { id: 'director-1', name: 'Director', level: 0, capabilities: ['direction', 'coordination'] },
        { id: 'manager-1', name: 'Manager', level: 1, capabilities: ['management', 'coordination'] },
        { id: 'lead-1', name: 'Team Lead', level: 2, capabilities: ['leadership', 'coordination'] },
        { id: 'worker-1', name: 'Worker', level: 3, capabilities: ['execution'] }
      ];

      for (let i = 0; i < levels.length; i++) {
        const agent = levels[i];
        const parentId = i > 0 ? levels[i - 1].id : undefined;

        await hierCoord.registerAgent(agent.id, {
          name: agent.name,
          type: agent.id.split('-')[0],
          level: agent.level,
          status: 'ready',
          capabilities: agent.capabilities
        }, parentId);
      }

      // Delegate complex task from top
      const mainTaskId = await hierCoord.delegateTask(
        'Enterprise-wide coordination task',
        {
          targetLevel: 0,
          priority: 3,
          requiredCapabilities: ['direction']
        }
      );

      // Verify task delegation created subtasks
      const mainTask = hierCoord.getTaskStatus(mainTaskId);
      expect(mainTask?.subTaskIds.length).toBeGreaterThan(0);

      // Complete all tasks from bottom up
      const allTasks = hierCoord.getAllTasks();
      const leafTasks = allTasks.filter(t => t.subTaskIds.length === 0);

      for (const leafTask of leafTasks) {
        await hierCoord.handleTaskCompletion(
          leafTask.id,
          leafTask.assignedAgentId,
          { result: `Completed by ${leafTask.assignedAgentId}` }
        );
      }

      // Wait for all dependency resolution
      await new Promise(resolve => setTimeout(resolve, 300));

      // Coordinator should now be able to complete
      const status = hierCoord.getCoordinatorStatus();
      expect(status.activeTaskCount).toBe(0);

      await hierCoord.shutdown();
    });

    it('should handle hierarchical coordinator with agent failures and recovery', async () => {
      const hierCoord = createHierarchicalCoordinatorWithDependencies('hier-failure-test');
      await hierCoord.initialize();

      let taskFailures = 0;
      hierCoord.on('task:failed', () => {
        taskFailures++;
      });

      // Create hierarchy with redundancy
      await hierCoord.registerAgent('supervisor-1', {
        name: 'Supervisor',
        type: 'supervisor',
        level: 0,
        status: 'ready',
        capabilities: ['supervision']
      });

      await hierCoord.registerAgent('worker-1', {
        name: 'Worker 1',
        type: 'worker',
        level: 1,
        status: 'ready',
        capabilities: ['execution']
      }, 'supervisor-1');

      await hierCoord.registerAgent('worker-2', {
        name: 'Worker 2',
        type: 'worker',
        level: 1,
        status: 'ready',
        capabilities: ['execution']
      }, 'supervisor-1');

      const taskId = await hierCoord.delegateTask('Task with potential failure', {
        targetLevel: 0,
        priority: 2
      });

      // Simulate failure of one task/agent
      const task = hierCoord.getTaskStatus(taskId);
      if (task && task.subTaskIds.length > 0) {
        await hierCoord.handleTaskFailure(
          task.subTaskIds[0],
          'worker-1',
          'Worker 1 encountered an error'
        );
      }

      expect(taskFailures).toBeGreaterThan(0);

      // Task should fail and coordinator should be able to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = hierCoord.getCoordinatorStatus();
      expect(status.activeTaskCount).toBe(0);

      await hierCoord.shutdown();
    });
  });

  // ============================================================================
  // Mixed Coordinator Scenarios
  // ============================================================================

  describe('Mixed Coordinator Scenarios', () => {
    it('should handle mesh and hierarchical coordinators working together', async () => {
      const meshCoord = createMeshCoordinatorWithDependencies('mixed-mesh');
      const hierCoord = createHierarchicalCoordinatorWithDependencies('mixed-hier');

      await meshCoord.initialize();
      await hierCoord.initialize();

      // Mesh coordinator manages processing agents
      await meshCoord.registerAgent('processor-1', {
        name: 'Processor 1',
        type: 'processor',
        status: 'ready',
        capabilities: ['data-processing']
      });

      await meshCoord.registerAgent('processor-2', {
        name: 'Processor 2',
        type: 'processor',
        status: 'ready',
        capabilities: ['data-processing']
      });

      // Hierarchical coordinator manages coordination agents
      await hierCoord.registerAgent('coordinator-1', {
        name: 'Coordinator 1',
        type: 'coordinator',
        level: 0,
        status: 'ready',
        capabilities: ['coordination']
      });

      await hierCoord.registerAgent('sub-coord-1', {
        name: 'Sub Coordinator',
        type: 'coordinator',
        level: 1,
        status: 'ready',
        capabilities: ['sub-coordination']
      }, 'coordinator-1');

      // Both start tasks
      const meshTaskId = await meshCoord.coordinateTask('Data processing task');
      const hierTaskId = await hierCoord.delegateTask('Coordination oversight task');

      // Both should be blocked initially
      const meshStatus = meshCoord.getCoordinatorStatus();
      const hierStatus = hierCoord.getCoordinatorStatus();

      expect(meshStatus.canComplete).toBe(false);
      expect(hierStatus.canComplete).toBe(false);

      // Complete mesh task
      await meshCoord.handleTaskCompletion(meshTaskId, 'processor-1', {
        processedData: 'mesh result'
      });

      // Complete hierarchical task
      await hierCoord.handleTaskCompletion(hierTaskId, 'coordinator-1', {
        coordinationResult: 'hier result'
      });

      // Both should now be able to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      await meshCoord.shutdown();
      await hierCoord.shutdown();
    });

    it('should handle coordinator dependencies across different topologies', async () => {
      const meshCoord = createMeshCoordinatorWithDependencies('cross-mesh');
      const hierCoord = createHierarchicalCoordinatorWithDependencies('cross-hier');

      await meshCoord.initialize();
      await hierCoord.initialize();

      // Get coordinator IDs
      const meshStatus = meshCoord.getCoordinatorStatus();
      const hierStatus = hierCoord.getCoordinatorStatus();

      // Create cross-coordinator dependency
      const depTracker = getDependencyTracker('cross-mesh');
      await depTracker.initialize();

      const crossDepId = await depTracker.registerDependency(
        meshStatus.coordinatorId,
        hierStatus.coordinatorId,
        DependencyType.COORDINATION,
        {
          timeout: 30000,
          metadata: {
            relationship: 'cross-coordinator',
            meshDependsOnHier: true
          }
        }
      );

      expect(crossDepId).toBeDefined();

      // Mesh coordinator should be blocked by hierarchical coordinator
      const meshBlockerInfo = await depTracker.canAgentComplete(meshStatus.coordinatorId);
      expect(meshBlockerInfo.canComplete).toBe(false);
      expect(meshBlockerInfo.blockedBy).toContain(hierStatus.coordinatorId);

      // Complete dependency by shutting down hierarchical coordinator
      await hierCoord.shutdown();

      // Resolve the cross-coordinator dependency
      await depTracker.resolveDependency(crossDepId, { hierarchicalCompleted: true });

      // Wait for dependency resolution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now mesh coordinator should be able to complete
      const meshBlockerInfo2 = await depTracker.canAgentComplete(meshStatus.coordinatorId);
      expect(meshBlockerInfo2.canComplete).toBe(true);

      await meshCoord.shutdown();
    });
  });

  // ============================================================================
  // Edge Case Scenarios
  // ============================================================================

  describe('Edge Case Scenarios', () => {
    it('should handle coordinator shutdown during dependency resolution', async () => {
      const meshCoord = createMeshCoordinatorWithDependencies('edge-shutdown-test');
      await meshCoord.initialize();

      await meshCoord.registerAgent('worker-1', {
        name: 'Worker 1',
        type: 'worker',
        status: 'ready',
        capabilities: ['processing']
      });

      const taskId = await meshCoord.coordinateTask('Task with timing edge case');

      // Start shutdown process
      const shutdownPromise = meshCoord.shutdown();

      // Immediately complete task (creating a race condition)
      await meshCoord.handleTaskCompletion(taskId, 'worker-1', { result: 'quick completion' });

      // Shutdown should handle this gracefully
      await shutdownPromise;

      const status = meshCoord.getCoordinatorStatus();
      expect(status.status).toBe('stopped');
    });

    it('should handle multiple force completions in rapid succession', async () => {
      const meshCoord = createMeshCoordinatorWithDependencies('edge-force-test');
      await meshCoord.initialize();

      await meshCoord.registerAgent('worker-1', {
        name: 'Worker 1',
        type: 'worker',
        status: 'ready',
        capabilities: ['processing']
      });

      const taskId = await meshCoord.coordinateTask('Task for force completion test');

      // Create multiple rapid force completion requests
      const forcePromises = Array(5).fill(null).map((_, i) =>
        meshCoord.shutdown(true) // Force shutdown
      );

      await Promise.all(forcePromises);

      const status = meshCoord.getCoordinatorStatus();
      expect(status.status).toBe('stopped');
    });

    it('should handle coordinator rerun with partially completed dependencies', async () => {
      const hierCoord = createHierarchicalCoordinatorWithDependencies('edge-rerun-test');
      await hierCoord.initialize();

      await hierCoord.registerAgent('manager-1', {
        name: 'Manager',
        type: 'manager',
        level: 0,
        status: 'ready',
        capabilities: ['management']
      });

      await hierCoord.registerAgent('worker-1', {
        name: 'Worker 1',
        type: 'worker',
        level: 1,
        status: 'ready',
        capabilities: ['execution']
      }, 'manager-1');

      const taskId = await hierCoord.delegateTask('Task for rerun test');

      // Partially complete the task (subtasks only)
      const task = hierCoord.getTaskStatus(taskId);
      if (task && task.subTaskIds.length > 0) {
        // Complete first subtask only
        await hierCoord.handleTaskCompletion(
          task.subTaskIds[0],
          'worker-1',
          { partial: 'result' }
        );
      }

      // Request rerun with partial completion
      let rerunCount = 0;
      hierCoord.on('coordinator:rerun', () => {
        rerunCount++;
      });

      const coordinatorStatus = hierCoord.getCoordinatorStatus();
      await lifecycleManager.handleRerunRequest(coordinatorStatus.coordinatorId);

      expect(rerunCount).toBe(1);

      // Should still be able to complete remaining tasks
      if (task) {
        await hierCoord.handleTaskCompletion(taskId, 'manager-1', {
          finalResult: 'completed after rerun'
        });
      }

      await hierCoord.shutdown();
    });
  });
});