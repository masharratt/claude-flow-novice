/**
 * Integration Tests for Lifecycle Manager and Dependency Tracker
 *
 * Tests the integration between the lifecycle management system and
 * dependency tracking to ensure proper coordination and completion blocking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  lifecycleManager,
  initializeLifecycleManager,
  shutdownLifecycleManager,
  registerAgentDependency,
  removeAgentDependency,
  getAgentDependencyStatus,
  forceAgentCompletion,
  transitionAgentState,
  handleTaskComplete,
  DependencyType,
  type AgentLifecycleContext
} from '../../src/agents/lifecycle-manager.js';
import {
  getDependencyTracker,
  DependencyStatus
} from '../../src/lifecycle/dependency-tracker.js';
import type { AgentDefinition } from '../../src/agents/agent-loader.js';

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

describe('Lifecycle Manager and Dependency Tracker Integration', () => {
  let mockAgentDefinition: AgentDefinition;

  beforeEach(async () => {
    vi.clearAllMocks();
    await initializeLifecycleManager();

    mockAgentDefinition = {
      name: 'test-agent',
      type: 'test',
      capabilities: ['testing'],
      lifecycle: {
        state_management: true,
        persistent_memory: false,
        max_retries: 3
      },
      hooks: {
        init: 'echo "Agent initialized"',
        task_complete: 'echo "Task completed"'
      }
    };
  });

  afterEach(async () => {
    await shutdownLifecycleManager();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Basic Integration Tests
  // ============================================================================

  describe('Basic Integration', () => {
    it('should initialize lifecycle manager with dependency tracking', async () => {
      // Lifecycle manager should be initialized
      expect(lifecycleManager).toBeDefined();

      // Dependency tracker should be accessible
      const depTracker = getDependencyTracker('lifecycle-manager');
      expect(depTracker).toBeDefined();
    });

    it('should register agents and track their lifecycle', async () => {
      const coordinator = await lifecycleManager.initializeAgent(
        'coordinator-1',
        { ...mockAgentDefinition, name: 'coordinator', type: 'coordinator' }
      );

      const worker = await lifecycleManager.initializeAgent(
        'worker-1',
        { ...mockAgentDefinition, name: 'worker', type: 'worker' }
      );

      expect(coordinator.agentId).toBe('coordinator-1');
      expect(worker.agentId).toBe('worker-1');
      expect(coordinator.state).toBe('uninitialized');
      expect(worker.state).toBe('uninitialized');
    });

    it('should transition agent states properly', async () => {
      await lifecycleManager.initializeAgent('agent-1', mockAgentDefinition);

      const success1 = await transitionAgentState('agent-1', 'initializing', 'Starting initialization');
      expect(success1).toBe(true);

      const success2 = await transitionAgentState('agent-1', 'idle', 'Initialization complete');
      expect(success2).toBe(true);

      const context = lifecycleManager.getAgentContext('agent-1');
      expect(context?.state).toBe('idle');
    });
  });

  // ============================================================================
  // Dependency Registration Integration
  // ============================================================================

  describe('Dependency Registration Integration', () => {
    it('should register dependencies between agents through lifecycle manager', async () => {
      // Initialize agents
      await lifecycleManager.initializeAgent('coordinator-1', {
        ...mockAgentDefinition,
        name: 'coordinator',
        type: 'coordinator'
      });

      await lifecycleManager.initializeAgent('worker-1', {
        ...mockAgentDefinition,
        name: 'worker',
        type: 'worker'
      });

      // Register dependency
      const depId = await registerAgentDependency(
        'coordinator-1',
        'worker-1',
        DependencyType.COMPLETION,
        { timeout: 30000 }
      );

      expect(depId).toBeDefined();

      // Check dependency status
      const depStatus = getAgentDependencyStatus('coordinator-1');
      expect(depStatus.dependencies).toContain(depId);
      expect(depStatus.canComplete).toBe(false);

      // Check agent contexts updated
      const coordinatorContext = lifecycleManager.getAgentContext('coordinator-1');
      const workerContext = lifecycleManager.getAgentContext('worker-1');

      expect(coordinatorContext?.dependencies).toContain(depId);
      expect(workerContext?.dependentAgents).toContain('coordinator-1');
    });

    it('should remove dependencies and update agent contexts', async () => {
      await lifecycleManager.initializeAgent('agent-1', mockAgentDefinition);
      await lifecycleManager.initializeAgent('agent-2', mockAgentDefinition);

      const depId = await registerAgentDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      // Verify dependency exists
      const depStatus1 = getAgentDependencyStatus('agent-1');
      expect(depStatus1.dependencies).toContain(depId);

      // Remove dependency
      const removed = await removeAgentDependency(depId);
      expect(removed).toBe(true);

      // Verify removal
      const depStatus2 = getAgentDependencyStatus('agent-1');
      expect(depStatus2.dependencies).not.toContain(depId);

      const context1 = lifecycleManager.getAgentContext('agent-1');
      const context2 = lifecycleManager.getAgentContext('agent-2');

      expect(context1?.dependencies).not.toContain(depId);
      expect(context2?.dependentAgents).not.toContain('agent-1');
    });
  });

  // ============================================================================
  // Completion Blocking Integration
  // ============================================================================

  describe('Completion Blocking Integration', () => {
    it('should block agent completion when dependencies exist', async () => {
      // Initialize agents
      await lifecycleManager.initializeAgent('coordinator-1', mockAgentDefinition);
      await lifecycleManager.initializeAgent('worker-1', mockAgentDefinition);

      // Transition to running state
      await transitionAgentState('coordinator-1', 'running');
      await transitionAgentState('worker-1', 'running');

      // Register dependency
      await registerAgentDependency(
        'coordinator-1',
        'worker-1',
        DependencyType.COMPLETION
      );

      // Try to transition coordinator to stopped (completion state)
      const success = await transitionAgentState('coordinator-1', 'stopped', 'Trying to complete');

      // Should be blocked
      expect(success).toBe(false);

      const context = lifecycleManager.getAgentContext('coordinator-1');
      expect(context?.pendingCompletion).toBe(true);
      expect(context?.completionBlocker).toBeDefined();
      expect(context?.state).toBe('running'); // State should not have changed
    });

    it('should allow completion after dependencies are resolved', async () => {
      // Setup agents and dependency
      await lifecycleManager.initializeAgent('coordinator-1', mockAgentDefinition);
      await lifecycleManager.initializeAgent('worker-1', mockAgentDefinition);

      await transitionAgentState('coordinator-1', 'running');
      await transitionAgentState('worker-1', 'running');

      const depId = await registerAgentDependency(
        'coordinator-1',
        'worker-1',
        DependencyType.COMPLETION
      );

      // Initially block completion
      let success = await transitionAgentState('coordinator-1', 'stopped');
      expect(success).toBe(false);

      // Resolve dependency
      const depTracker = getDependencyTracker('lifecycle-manager');
      await depTracker.resolveDependency(depId, { result: 'worker completed' });

      // Now completion should proceed automatically
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      const context = lifecycleManager.getAgentContext('coordinator-1');
      expect(context?.pendingCompletion).toBe(false);
      expect(context?.state).toBe('stopped');
    });

    it('should handle task completion with dependencies', async () => {
      // Initialize coordinator and worker
      await lifecycleManager.initializeAgent('coordinator-1', mockAgentDefinition, 'task-1');
      await lifecycleManager.initializeAgent('worker-1', mockAgentDefinition, 'task-2');

      await transitionAgentState('coordinator-1', 'running');
      await transitionAgentState('worker-1', 'running');

      // Register dependency
      await registerAgentDependency(
        'coordinator-1',
        'worker-1',
        DependencyType.COMPLETION
      );

      // Complete worker task
      const workerResult = await handleTaskComplete('worker-1', { result: 'worker task done' }, true);
      expect(workerResult.success).toBe(true);

      // Worker should transition to idle
      const workerContext = lifecycleManager.getAgentContext('worker-1');
      expect(workerContext?.state).toBe('idle');

      // Now coordinator should be able to complete
      const coordinatorSuccess = await transitionAgentState('coordinator-1', 'stopped');
      expect(coordinatorSuccess).toBe(true);
    });
  });

  // ============================================================================
  // Force Completion Integration
  // ============================================================================

  describe('Force Completion Integration', () => {
    it('should force agent completion bypassing dependencies', async () => {
      // Setup agents with dependency
      await lifecycleManager.initializeAgent('coordinator-1', mockAgentDefinition);
      await lifecycleManager.initializeAgent('worker-1', mockAgentDefinition);

      await transitionAgentState('coordinator-1', 'running');

      await registerAgentDependency(
        'coordinator-1',
        'worker-1',
        DependencyType.COMPLETION
      );

      // Verify completion is blocked
      let success = await transitionAgentState('coordinator-1', 'stopped');
      expect(success).toBe(false);

      // Force completion
      const forced = await forceAgentCompletion('coordinator-1', 'Emergency shutdown');
      expect(forced).toBe(true);

      const context = lifecycleManager.getAgentContext('coordinator-1');
      expect(context?.pendingCompletion).toBe(false);
      expect(context?.completionBlocker).toBeUndefined();

      // Now normal completion should work
      success = await transitionAgentState('coordinator-1', 'stopped');
      expect(success).toBe(true);
    });

    it('should emit appropriate events during force completion', async () => {
      const depTracker = getDependencyTracker('lifecycle-manager');
      const mockForced = vi.fn();

      depTracker.on('agent:completion_forced', mockForced);

      await lifecycleManager.initializeAgent('agent-1', mockAgentDefinition);
      await registerAgentDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      await forceAgentCompletion('agent-1', 'Test force');

      expect(mockForced).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          reason: 'Test force'
        })
      );
    });
  });

  // ============================================================================
  // Cleanup Integration
  // ============================================================================

  describe('Cleanup Integration', () => {
    it('should cleanup agent dependencies during agent cleanup', async () => {
      // Setup multiple agents with dependencies
      await lifecycleManager.initializeAgent('coordinator-1', mockAgentDefinition);
      await lifecycleManager.initializeAgent('worker-1', mockAgentDefinition);
      await lifecycleManager.initializeAgent('worker-2', mockAgentDefinition);

      const dep1 = await registerAgentDependency('coordinator-1', 'worker-1', DependencyType.COMPLETION);
      const dep2 = await registerAgentDependency('coordinator-1', 'worker-2', DependencyType.COMPLETION);

      // Verify dependencies exist
      const depStatus = getAgentDependencyStatus('coordinator-1');
      expect(depStatus.dependencies).toHaveLength(2);

      // Cleanup coordinator
      const success = await lifecycleManager.cleanupAgent('coordinator-1');
      expect(success).toBe(true);

      // Dependencies should be cleaned up
      const depTracker = getDependencyTracker('lifecycle-manager');
      expect(depTracker.getDependencyDetails(dep1)).toBeUndefined();
      expect(depTracker.getDependencyDetails(dep2)).toBeUndefined();
    });

    it('should handle cleanup when agent is providing dependencies', async () => {
      await lifecycleManager.initializeAgent('provider-1', mockAgentDefinition);
      await lifecycleManager.initializeAgent('dependent-1', mockAgentDefinition);
      await lifecycleManager.initializeAgent('dependent-2', mockAgentDefinition);

      const dep1 = await registerAgentDependency('dependent-1', 'provider-1', DependencyType.COMPLETION);
      const dep2 = await registerAgentDependency('dependent-2', 'provider-1', DependencyType.COMPLETION);

      // Cleanup provider
      const success = await lifecycleManager.cleanupAgent('provider-1');
      expect(success).toBe(true);

      // Dependencies should be cleaned up
      const depTracker = getDependencyTracker('lifecycle-manager');
      expect(depTracker.getDependencyDetails(dep1)).toBeUndefined();
      expect(depTracker.getDependencyDetails(dep2)).toBeUndefined();

      // Dependent agents should be unblocked
      const dep1Status = getAgentDependencyStatus('dependent-1');
      const dep2Status = getAgentDependencyStatus('dependent-2');

      expect(dep1Status.canComplete).toBe(true);
      expect(dep2Status.canComplete).toBe(true);
    });
  });

  // ============================================================================
  // Complex Scenario Integration Tests
  // ============================================================================

  describe('Complex Scenarios', () => {
    it('should handle coordinator-worker hierarchy with dependencies', async () => {
      // Setup hierarchy: main-coordinator -> sub-coordinator -> worker
      await lifecycleManager.initializeAgent('main-coordinator', {
        ...mockAgentDefinition,
        name: 'main-coordinator',
        type: 'coordinator'
      });

      await lifecycleManager.initializeAgent('sub-coordinator', {
        ...mockAgentDefinition,
        name: 'sub-coordinator',
        type: 'coordinator'
      });

      await lifecycleManager.initializeAgent('worker-1', {
        ...mockAgentDefinition,
        name: 'worker',
        type: 'worker'
      });

      // Transition all to running
      await transitionAgentState('main-coordinator', 'running');
      await transitionAgentState('sub-coordinator', 'running');
      await transitionAgentState('worker-1', 'running');

      // Setup dependencies
      await registerAgentDependency('main-coordinator', 'sub-coordinator', DependencyType.COMPLETION);
      await registerAgentDependency('sub-coordinator', 'worker-1', DependencyType.COMPLETION);

      // Main coordinator should be blocked
      let success = await transitionAgentState('main-coordinator', 'stopped');
      expect(success).toBe(false);

      // Sub coordinator should be blocked
      success = await transitionAgentState('sub-coordinator', 'stopped');
      expect(success).toBe(false);

      // Worker should be able to complete
      success = await transitionAgentState('worker-1', 'stopped');
      expect(success).toBe(true);

      // Wait for dependency resolution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Sub coordinator should now be able to complete
      success = await transitionAgentState('sub-coordinator', 'stopped');
      expect(success).toBe(true);

      // Wait for dependency resolution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Main coordinator should now be able to complete
      const mainContext = lifecycleManager.getAgentContext('main-coordinator');
      expect(mainContext?.pendingCompletion).toBe(false);
    });

    it('should handle multiple dependency types between agents', async () => {
      await lifecycleManager.initializeAgent('dependent', mockAgentDefinition);
      await lifecycleManager.initializeAgent('provider', mockAgentDefinition);

      await transitionAgentState('dependent', 'running');
      await transitionAgentState('provider', 'running');

      // Register multiple dependency types
      const completionDep = await registerAgentDependency(
        'dependent',
        'provider',
        DependencyType.COMPLETION
      );

      const dataDep = await registerAgentDependency(
        'dependent',
        'provider',
        DependencyType.DATA_DEPENDENCY
      );

      // Should be blocked by both dependencies
      let success = await transitionAgentState('dependent', 'stopped');
      expect(success).toBe(false);

      // Resolve completion dependency
      const depTracker = getDependencyTracker('lifecycle-manager');
      await depTracker.resolveDependency(completionDep, { result: 'completed' });

      // Still should be blocked by data dependency
      await new Promise(resolve => setTimeout(resolve, 50));
      const context1 = lifecycleManager.getAgentContext('dependent');
      expect(context1?.pendingCompletion).toBe(true);

      // Resolve data dependency
      await depTracker.resolveDependency(dataDep, { data: 'provided' });

      // Now should be unblocked
      await new Promise(resolve => setTimeout(resolve, 50));
      const context2 = lifecycleManager.getAgentContext('dependent');
      expect(context2?.pendingCompletion).toBe(false);
    });

    it('should handle agent failure and dependency cascade', async () => {
      await lifecycleManager.initializeAgent('coordinator', mockAgentDefinition);
      await lifecycleManager.initializeAgent('worker', mockAgentDefinition);

      await transitionAgentState('coordinator', 'running');
      await transitionAgentState('worker', 'running');

      await registerAgentDependency('coordinator', 'worker', DependencyType.COMPLETION);

      // Transition worker to error state
      await transitionAgentState('worker', 'error', 'Worker failed');

      // Wait for dependency system to process the failure
      await new Promise(resolve => setTimeout(resolve, 100));

      // Coordinator should now be able to complete (dependency should be failed/removed)
      const depStatus = getAgentDependencyStatus('coordinator');
      const depTracker = getDependencyTracker('lifecycle-manager');

      // Check if dependencies are marked as failed
      for (const depId of depStatus.dependencies) {
        const dep = depTracker.getDependencyDetails(depId);
        expect(dep?.status).toBe(DependencyStatus.FAILED);
      }
    });
  });

  // ============================================================================
  // Performance Integration Tests
  // ============================================================================

  describe('Performance Integration', () => {
    it('should handle many agents with dependencies efficiently', async () => {
      const agentCount = 50;
      const startTime = Date.now();

      // Create many agents
      const agentPromises: Promise<AgentLifecycleContext>[] = [];
      for (let i = 0; i < agentCount; i++) {
        agentPromises.push(
          lifecycleManager.initializeAgent(`agent-${i}`, {
            ...mockAgentDefinition,
            name: `agent-${i}`
          })
        );
      }

      await Promise.all(agentPromises);

      // Create dependency chain
      const depPromises: Promise<string>[] = [];
      for (let i = 0; i < agentCount - 1; i++) {
        depPromises.push(
          registerAgentDependency(
            `agent-${i}`,
            `agent-${i + 1}`,
            DependencyType.COMPLETION
          )
        );
      }

      await Promise.all(depPromises);

      const setupTime = Date.now() - startTime;
      expect(setupTime).toBeLessThan(5000); // Should complete in reasonable time

      // Test completion checking performance
      const checkStartTime = Date.now();
      const checkPromises = [];
      for (let i = 0; i < agentCount; i++) {
        checkPromises.push(getAgentDependencyStatus(`agent-${i}`));
      }

      await Promise.all(checkPromises);

      const checkTime = Date.now() - checkStartTime;
      expect(checkTime).toBeLessThan(1000); // Status checks should be fast
    }, 10000); // Increase timeout for performance test
  });

  // ============================================================================
  // Error Handling Integration
  // ============================================================================

  describe('Error Handling Integration', () => {
    it('should handle operations on non-existent agents gracefully', async () => {
      // Try to register dependency with non-existent agent
      await expect(
        registerAgentDependency('non-existent', 'also-non-existent', DependencyType.COMPLETION)
      ).resolves.toBeDefined(); // Should not throw, dependency tracker allows this

      // Check status of non-existent agent
      const status = getAgentDependencyStatus('non-existent');
      expect(status.canComplete).toBe(true);
      expect(status.dependencies).toHaveLength(0);
    });

    it('should handle lifecycle manager shutdown with pending dependencies', async () => {
      await lifecycleManager.initializeAgent('agent-1', mockAgentDefinition);
      await lifecycleManager.initializeAgent('agent-2', mockAgentDefinition);

      await registerAgentDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      // Shutdown should complete even with pending dependencies
      await expect(shutdownLifecycleManager()).resolves.toBeUndefined();

      // Re-initialize for cleanup
      await initializeLifecycleManager();
    });
  });
});