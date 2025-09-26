/**
 * Tests for Agent Lifecycle State Management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentLifecycleManager,
  lifecycleManager,
  initializeAgent,
  transitionAgentState,
  handleTaskComplete,
  handleRerunRequest,
  cleanupAgent,
  getAgentContext,
  updateAgentMemory,
  getAgentMemory,
  type AgentLifecycleState
} from '../../src/agents/lifecycle-manager.js';
import type { AgentDefinition } from '../../src/agents/agent-loader.js';

describe('AgentLifecycleManager', () => {
  let manager: AgentLifecycleManager;

  const mockAgentDefinition: AgentDefinition = {
    name: 'test-agent',
    type: 'coordinator',
    description: 'Test agent for lifecycle management',
    capabilities: ['testing', 'coordination'],
    priority: 'medium',
    hooks: {
      pre: 'echo "Pre-hook"',
      post: 'echo "Post-hook"',
      task_complete: 'echo "Task complete"',
      on_rerun_request: 'echo "Rerun requested"',
      lifecycle: {
        init: 'echo "Initializing"',
        start: 'echo "Starting"',
        pause: 'echo "Pausing"',
        resume: 'echo "Resuming"',
        stop: 'echo "Stopping"',
        cleanup: 'echo "Cleaning up"'
      }
    },
    lifecycle: {
      state_management: true,
      persistent_memory: true,
      max_retries: 3,
      timeout_ms: 30000,
      auto_cleanup: true
    }
  };

  const minimalAgentDefinition: AgentDefinition = {
    name: 'minimal-agent',
    description: 'Minimal agent without lifecycle features'
  };

  beforeEach(() => {
    manager = new AgentLifecycleManager();
    // Mock console.log to reduce test noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Agent Initialization', () => {
    it('should initialize agent with default state', async () => {
      const context = await manager.initializeAgent('test-1', mockAgentDefinition, 'task-1');

      expect(context.agentId).toBe('test-1');
      expect(context.state).toBe('uninitialized');
      expect(context.taskId).toBe('task-1');
      expect(context.retryCount).toBe(0);
      expect(context.maxRetries).toBe(3);
      expect(context.memory).toBeInstanceOf(Map);
      expect(context.stateHistory).toHaveLength(1);
      expect(context.stateHistory[0].state).toBe('uninitialized');
    });

    it('should handle agents without lifecycle configuration', async () => {
      const context = await manager.initializeAgent('minimal-1', minimalAgentDefinition);

      expect(context.agentId).toBe('minimal-1');
      expect(context.state).toBe('uninitialized');
      expect(context.maxRetries).toBe(3); // default
    });

    it('should initialize memory for persistent agents', async () => {
      const context = await manager.initializeAgent('persistent-1', mockAgentDefinition);

      expect(context.memory).toBeInstanceOf(Map);
      expect(context.agentDefinition.lifecycle?.persistent_memory).toBe(true);
    });
  });

  describe('State Transitions', () => {
    let agentId: string;

    beforeEach(async () => {
      agentId = 'state-test-1';
      await manager.initializeAgent(agentId, mockAgentDefinition);
    });

    it('should allow valid state transitions', async () => {
      // uninitialized -> initializing
      await expect(manager.transitionState(agentId, 'initializing')).resolves.toBe(true);

      // initializing -> idle
      await expect(manager.transitionState(agentId, 'idle')).resolves.toBe(true);

      // idle -> running
      await expect(manager.transitionState(agentId, 'running')).resolves.toBe(true);

      // running -> paused
      await expect(manager.transitionState(agentId, 'paused')).resolves.toBe(true);

      // paused -> running
      await expect(manager.transitionState(agentId, 'running')).resolves.toBe(true);

      // running -> stopping
      await expect(manager.transitionState(agentId, 'stopping')).resolves.toBe(true);

      // stopping -> stopped
      await expect(manager.transitionState(agentId, 'stopped')).resolves.toBe(true);
    });

    it('should reject invalid state transitions', async () => {
      // uninitialized -> running (invalid)
      await expect(manager.transitionState(agentId, 'running')).rejects.toThrow();

      // Move to idle first
      await manager.transitionState(agentId, 'initializing');
      await manager.transitionState(agentId, 'idle');

      // idle -> cleanup (invalid)
      await expect(manager.transitionState(agentId, 'cleanup')).rejects.toThrow();
    });

    it('should update state history', async () => {
      await manager.transitionState(agentId, 'initializing', 'Test transition');

      const context = manager.getAgentContext(agentId);
      expect(context?.stateHistory).toHaveLength(2);
      expect(context?.stateHistory[1].state).toBe('initializing');
      expect(context?.stateHistory[1].reason).toBe('Test transition');
    });

    it('should handle error states', async () => {
      await manager.transitionState(agentId, 'initializing');
      await manager.transitionState(agentId, 'error', 'Test error');

      const context = manager.getAgentContext(agentId);
      expect(context?.state).toBe('error');
      expect(context?.previousState).toBe('initializing');
    });
  });

  describe('Task Completion Handling', () => {
    let agentId: string;

    beforeEach(async () => {
      agentId = 'task-test-1';
      await manager.initializeAgent(agentId, mockAgentDefinition);
      await manager.transitionState(agentId, 'initializing');
      await manager.transitionState(agentId, 'idle');
      await manager.transitionState(agentId, 'running');
    });

    it('should handle successful task completion', async () => {
      const result = await manager.handleTaskComplete(agentId, { success: true }, true);

      expect(result.success).toBe(true);
      const context = manager.getAgentContext(agentId);
      expect(context?.state).toBe('idle');
    });

    it('should handle failed task completion with retries', async () => {
      const result = await manager.handleTaskComplete(agentId, { success: false }, false);

      expect(result.success).toBe(true);
      const context = manager.getAgentContext(agentId);
      expect(context?.retryCount).toBe(1);
      expect(context?.state).toBe('idle');
    });

    it('should transition to error after max retries', async () => {
      const context = manager.getAgentContext(agentId);
      if (context) {
        context.retryCount = 2; // Set to one less than max
      }

      await manager.handleTaskComplete(agentId, { success: false }, false);

      const updatedContext = manager.getAgentContext(agentId);
      expect(updatedContext?.state).toBe('error');
      expect(updatedContext?.retryCount).toBe(3);
    });
  });

  describe('Rerun Request Handling', () => {
    let agentId: string;

    beforeEach(async () => {
      agentId = 'rerun-test-1';
      await manager.initializeAgent(agentId, mockAgentDefinition);
      await manager.transitionState(agentId, 'initializing');
      await manager.transitionState(agentId, 'idle');
    });

    it('should handle rerun requests', async () => {
      const result = await manager.handleRerunRequest(agentId, 'User requested rerun');

      expect(result.success).toBe(true);
      const context = manager.getAgentContext(agentId);
      expect(context?.state).toBe('running');
      expect(context?.retryCount).toBe(0); // Reset on rerun
    });

    it('should reset retry count on rerun', async () => {
      const context = manager.getAgentContext(agentId);
      if (context) {
        context.retryCount = 2;
      }

      await manager.handleRerunRequest(agentId);

      const updatedContext = manager.getAgentContext(agentId);
      expect(updatedContext?.retryCount).toBe(0);
    });
  });

  describe('Memory Management', () => {
    let agentId: string;

    beforeEach(async () => {
      agentId = 'memory-test-1';
      await manager.initializeAgent(agentId, mockAgentDefinition);
    });

    it('should store and retrieve memory values', () => {
      const success = manager.updateAgentMemory(agentId, 'test-key', 'test-value');
      expect(success).toBe(true);

      const value = manager.getAgentMemory(agentId, 'test-key');
      expect(value).toBe('test-value');
    });

    it('should handle complex memory objects', () => {
      const complexValue = { nested: { data: [1, 2, 3] }, timestamp: new Date() };

      manager.updateAgentMemory(agentId, 'complex', complexValue);
      const retrieved = manager.getAgentMemory(agentId, 'complex');

      expect(retrieved).toEqual(complexValue);
    });

    it('should return false for non-existent agents', () => {
      const success = manager.updateAgentMemory('non-existent', 'key', 'value');
      expect(success).toBe(false);

      const value = manager.getAgentMemory('non-existent', 'key');
      expect(value).toBeUndefined();
    });
  });

  describe('Agent Cleanup', () => {
    let agentId: string;

    beforeEach(async () => {
      agentId = 'cleanup-test-1';
      await manager.initializeAgent(agentId, mockAgentDefinition);
    });

    it('should cleanup agent with persistent memory', async () => {
      const success = await manager.cleanupAgent(agentId);
      expect(success).toBe(true);

      const context = manager.getAgentContext(agentId);
      expect(context?.state).toBe('stopped'); // Should still exist for persistent agents
    });

    it('should cleanup agent without persistent memory', async () => {
      const nonPersistentAgent: AgentDefinition = {
        ...mockAgentDefinition,
        lifecycle: {
          ...mockAgentDefinition.lifecycle!,
          persistent_memory: false
        }
      };

      await manager.initializeAgent('temp-agent', nonPersistentAgent);
      const success = await manager.cleanupAgent('temp-agent');
      expect(success).toBe(true);

      const context = manager.getAgentContext('temp-agent');
      expect(context).toBeUndefined(); // Should be completely removed
    });
  });

  describe('Agent Queries', () => {
    beforeEach(async () => {
      await manager.initializeAgent('agent-1', mockAgentDefinition);
      await manager.initializeAgent('agent-2', mockAgentDefinition);
      await manager.initializeAgent('agent-3', minimalAgentDefinition);

      await manager.transitionState('agent-1', 'initializing');
      await manager.transitionState('agent-1', 'idle');
      await manager.transitionState('agent-2', 'initializing');
      await manager.transitionState('agent-2', 'idle');
      await manager.transitionState('agent-2', 'running');
    });

    it('should get all agents', () => {
      const agents = manager.getAllAgents();
      expect(agents).toHaveLength(3);
    });

    it('should filter agents by state', () => {
      const runningAgents = manager.getAgentsByState('running');
      expect(runningAgents).toHaveLength(1);
      expect(runningAgents[0].agentId).toBe('agent-2');

      const idleAgents = manager.getAgentsByState('idle');
      expect(idleAgents).toHaveLength(1);
      expect(idleAgents[0].agentId).toBe('agent-1');

      const uninitializedAgents = manager.getAgentsByState('uninitialized');
      expect(uninitializedAgents).toHaveLength(1);
      expect(uninitializedAgents[0].agentId).toBe('agent-3');
    });
  });

  describe('Lifecycle Support Detection', () => {
    it('should detect lifecycle support for agents with lifecycle config', () => {
      const supports = AgentLifecycleManager.supportsLifecycle(mockAgentDefinition);
      expect(supports).toBe(true);
    });

    it('should detect no lifecycle support for minimal agents', () => {
      const supports = AgentLifecycleManager.supportsLifecycle(minimalAgentDefinition);
      expect(supports).toBe(false);
    });

    it('should detect lifecycle support for agents with lifecycle hooks only', () => {
      const hookOnlyAgent: AgentDefinition = {
        name: 'hook-only',
        description: 'Agent with lifecycle hooks only',
        hooks: {
          lifecycle: {
            init: 'echo "Init"'
          }
        }
      };

      const supports = AgentLifecycleManager.supportsLifecycle(hookOnlyAgent);
      expect(supports).toBe(true);
    });

    it('should detect lifecycle support for agents with task completion hooks', () => {
      const taskCompletionAgent: AgentDefinition = {
        name: 'task-completion',
        description: 'Agent with task completion hooks',
        hooks: {
          task_complete: 'echo "Task complete"'
        }
      };

      const supports = AgentLifecycleManager.supportsLifecycle(taskCompletionAgent);
      expect(supports).toBe(true);
    });
  });

  describe('Convenience Functions', () => {
    it('should use singleton lifecycle manager', async () => {
      const context1 = await initializeAgent('singleton-test', mockAgentDefinition);
      const context2 = getAgentContext('singleton-test');

      expect(context1).toBe(context2);
    });

    it('should handle state transitions via convenience function', async () => {
      await initializeAgent('convenience-test', mockAgentDefinition);
      const success = await transitionAgentState('convenience-test', 'initializing');

      expect(success).toBe(true);
      const context = getAgentContext('convenience-test');
      expect(context?.state).toBe('initializing');
    });

    it('should handle task completion via convenience function', async () => {
      await initializeAgent('task-conv-test', mockAgentDefinition);
      await transitionAgentState('task-conv-test', 'initializing');
      await transitionAgentState('task-conv-test', 'idle');
      await transitionAgentState('task-conv-test', 'running');

      const result = await handleTaskComplete('task-conv-test', { data: 'test' });
      expect(result.success).toBe(true);
    });

    it('should handle memory operations via convenience functions', async () => {
      await initializeAgent('memory-conv-test', mockAgentDefinition);

      const updateSuccess = updateAgentMemory('memory-conv-test', 'conv-key', 'conv-value');
      expect(updateSuccess).toBe(true);

      const value = getAgentMemory('memory-conv-test', 'conv-key');
      expect(value).toBe('conv-value');
    });
  });
});

describe('Integration with Agent Loader', () => {
  it('should maintain backward compatibility with existing agent definitions', () => {
    // Test that agents without lifecycle configuration still work
    const legacyAgent: AgentDefinition = {
      name: 'legacy-agent',
      description: 'Legacy agent without lifecycle features',
      hooks: {
        pre: 'echo "Pre"',
        post: 'echo "Post"'
      }
    };

    // Should not throw errors
    expect(() => AgentLifecycleManager.supportsLifecycle(legacyAgent)).not.toThrow();
    expect(AgentLifecycleManager.supportsLifecycle(legacyAgent)).toBe(false);
  });

  it('should handle mixed hook configurations', () => {
    const mixedAgent: AgentDefinition = {
      name: 'mixed-agent',
      description: 'Agent with mixed hook configuration',
      hooks: {
        pre: 'echo "Pre"',
        post: 'echo "Post"',
        task_complete: 'echo "Task complete"',
        lifecycle: {
          init: 'echo "Init"',
          cleanup: 'echo "Cleanup"'
        }
      },
      lifecycle: {
        state_management: true
      }
    };

    expect(AgentLifecycleManager.supportsLifecycle(mixedAgent)).toBe(true);
  });
});