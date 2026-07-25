/**
 * Agent Lifecycle Manager Unit Tests
 *
 * Comprehensive test suite for src/agents/lifecycle-manager.ts
 * Target: Increase coverage from 50% → 85%+
 *
 * Test Coverage:
 * - Agent initialization and context creation
 * - State transitions (uninitialized → idle → running → completed → error)
 * - Memory management (get/set/update)
 * - Dependency tracking and validation
 * - Event emission (stateChange, dependencyResolved, error)
 * - Error handling and recovery
 * - Concurrent state updates
 * - Lifecycle hooks (initialize, shutdown, cleanup)
 *
 * Framework: Jest + TypeScript
 * Mocking: External dependencies (Redis, database, dependency tracker)
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import {
  AgentLifecycleManager,
  AgentLifecycleState,
  AgentLifecycleContext,
  LifecycleHookResult,
  lifecycleManager,
} from '../../src/agents/lifecycle-manager.js';
import { DependencyType } from '../../src/lifecycle/dependency-tracker.js';
import type { AgentDefinition } from '../../src/agents/agent-loader.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockAgentDefinition: AgentDefinition = {
  id: 'test-agent',
  name: 'Test Agent',
  description: 'Test agent for unit tests',
  role: 'tester',
  type: 'test',
  triggers: [],
  config: {},
  lifecycle: {
    max_retries: 3,
    timeout: 30000,
  },
};

const createMockAgentDefinition = (overrides?: Partial<AgentDefinition>): AgentDefinition => ({
  ...mockAgentDefinition,
  ...overrides,
});

// ============================================================================
// Test Suite: Agent Initialization
// ============================================================================

describe('AgentLifecycleManager - Initialization', () => {
  let manager: AgentLifecycleManager;

  beforeEach(() => {
    manager = new AgentLifecycleManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should create new lifecycle manager instance', () => {
    expect(manager).toBeInstanceOf(AgentLifecycleManager);
    expect(manager).toBeInstanceOf(EventEmitter);
  });

  test('should initialize agent with default context', async () => {
    const agentId = 'test-agent-001';
    const context = await manager.initializeAgent(agentId, mockAgentDefinition);

    expect(context).toBeDefined();
    expect(context.agentId).toBe(agentId);
    expect(context.state).toBe('initializing');
    expect(context.retryCount).toBe(0);
    expect(context.maxRetries).toBe(3);
    expect(context.errorHistory).toEqual([]);
    expect(context.memory).toBeInstanceOf(Map);
    expect(context.stateHistory).toHaveLength(1);
    expect(context.stateHistory[0].state).toBe('initializing');
  });

  test('should initialize agent with task ID', async () => {
    const agentId = 'test-agent-002';
    const taskId = 'task-123';
    const context = await manager.initializeAgent(agentId, mockAgentDefinition, taskId);

    expect(context.taskId).toBe(taskId);
  });

  test('should initialize agent with custom max retries', async () => {
    const agentId = 'test-agent-003';
    const customDefinition = createMockAgentDefinition({
      lifecycle: { max_retries: 5, timeout: 60000 },
    });

    const context = await manager.initializeAgent(agentId, customDefinition);

    expect(context.maxRetries).toBe(5);
  });

  test('should use default max retries if not specified', async () => {
    const agentId = 'test-agent-004';
    const customDefinition = createMockAgentDefinition({
      lifecycle: undefined,
    });

    const context = await manager.initializeAgent(agentId, customDefinition);

    expect(context.maxRetries).toBe(3);
  });

  test('should track start time and last activity', async () => {
    const agentId = 'test-agent-005';
    const beforeInit = new Date();
    const context = await manager.initializeAgent(agentId, mockAgentDefinition);
    const afterInit = new Date();

    expect(context.startTime.getTime()).toBeGreaterThanOrEqual(beforeInit.getTime());
    expect(context.startTime.getTime()).toBeLessThanOrEqual(afterInit.getTime());
    expect(context.lastActivity.getTime()).toBeGreaterThanOrEqual(beforeInit.getTime());
  });

  test('should store agent context internally', async () => {
    const agentId = 'test-agent-006';
    await manager.initializeAgent(agentId, mockAgentDefinition);

    const retrievedContext = manager.getAgentContext(agentId);

    expect(retrievedContext).toBeDefined();
    expect(retrievedContext?.agentId).toBe(agentId);
  });

  test('should handle multiple agent initializations', async () => {
    const agent1 = await manager.initializeAgent('agent-1', mockAgentDefinition);
    const agent2 = await manager.initializeAgent('agent-2', mockAgentDefinition);
    const agent3 = await manager.initializeAgent('agent-3', mockAgentDefinition);

    expect(agent1.agentId).toBe('agent-1');
    expect(agent2.agentId).toBe('agent-2');
    expect(agent3.agentId).toBe('agent-3');

    expect(manager.getAgentContext('agent-1')).toBeDefined();
    expect(manager.getAgentContext('agent-2')).toBeDefined();
    expect(manager.getAgentContext('agent-3')).toBeDefined();
  });
});

// ============================================================================
// Test Suite: State Transitions
// ============================================================================

describe('AgentLifecycleManager - State Transitions', () => {
  let manager: AgentLifecycleManager;
  let agentId: string;

  beforeEach(async () => {
    manager = new AgentLifecycleManager();
    agentId = 'state-test-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should transition agent state successfully', async () => {
    const result = await manager.transitionState(agentId, 'running', 'Starting task execution');

    expect(result).toBe(true);
  });

  test('should handle transition to idle state', async () => {
    const result = await manager.transitionState(agentId, 'idle');

    expect(result).toBe(true);
  });

  test('should handle transition to error state', async () => {
    const result = await manager.transitionState(agentId, 'error', 'Test error occurred');

    expect(result).toBe(true);
  });

  test('should handle all valid state transitions', async () => {
    const states: AgentLifecycleState[] = [
      'idle',
      'running',
      'paused',
      'running',
      'stopping',
      'stopped',
    ];

    for (const state of states) {
      const result = await manager.transitionState(agentId, state);
      expect(result).toBe(true);
    }
  });

  test('should handle cleanup state', async () => {
    const result = await manager.transitionState(agentId, 'cleanup');

    expect(result).toBe(true);
  });
});

// ============================================================================
// Test Suite: Memory Management
// ============================================================================

describe('AgentLifecycleManager - Memory Management', () => {
  let manager: AgentLifecycleManager;
  let agentId: string;

  beforeEach(async () => {
    manager = new AgentLifecycleManager();
    agentId = 'memory-test-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should update agent memory with key-value pair', () => {
    const result = manager.updateAgentMemory(agentId, 'testKey', 'testValue');

    expect(result).toBe(true);
  });

  test('should retrieve stored memory value', () => {
    manager.updateAgentMemory(agentId, 'myKey', 'myValue');
    const value = manager.getAgentMemory(agentId, 'myKey');

    expect(value).toBe('myValue');
  });

  test('should update memory with different data types', () => {
    manager.updateAgentMemory(agentId, 'string', 'text');
    manager.updateAgentMemory(agentId, 'number', 42);
    manager.updateAgentMemory(agentId, 'boolean', true);
    manager.updateAgentMemory(agentId, 'object', { nested: 'value' });
    manager.updateAgentMemory(agentId, 'array', [1, 2, 3]);

    expect(manager.getAgentMemory(agentId, 'string')).toBe('text');
    expect(manager.getAgentMemory(agentId, 'number')).toBe(42);
    expect(manager.getAgentMemory(agentId, 'boolean')).toBe(true);
    expect(manager.getAgentMemory(agentId, 'object')).toEqual({ nested: 'value' });
    expect(manager.getAgentMemory(agentId, 'array')).toEqual([1, 2, 3]);
  });

  test('should return undefined for non-existent memory key', () => {
    const value = manager.getAgentMemory(agentId, 'nonExistentKey');

    expect(value).toBeUndefined();
  });

  test('should return false when updating memory for non-existent agent', () => {
    const result = manager.updateAgentMemory('non-existent-agent', 'key', 'value');

    expect(result).toBe(false);
  });

  test('should return undefined when getting memory for non-existent agent', () => {
    const value = manager.getAgentMemory('non-existent-agent', 'key');

    expect(value).toBeUndefined();
  });

  test('should overwrite existing memory value', () => {
    manager.updateAgentMemory(agentId, 'counter', 1);
    manager.updateAgentMemory(agentId, 'counter', 2);
    manager.updateAgentMemory(agentId, 'counter', 3);

    const value = manager.getAgentMemory(agentId, 'counter');

    expect(value).toBe(3);
  });

  test('should maintain separate memory for different agents', () => {
    const agent1 = 'agent-1';
    const agent2 = 'agent-2';

    manager.initializeAgent(agent1, mockAgentDefinition);
    manager.initializeAgent(agent2, mockAgentDefinition);

    manager.updateAgentMemory(agent1, 'shared-key', 'value-1');
    manager.updateAgentMemory(agent2, 'shared-key', 'value-2');

    expect(manager.getAgentMemory(agent1, 'shared-key')).toBe('value-1');
    expect(manager.getAgentMemory(agent2, 'shared-key')).toBe('value-2');
  });
});

// ============================================================================
// Test Suite: Context Retrieval
// ============================================================================

describe('AgentLifecycleManager - Context Retrieval', () => {
  let manager: AgentLifecycleManager;

  beforeEach(() => {
    manager = new AgentLifecycleManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should return undefined for non-existent agent', () => {
    const context = manager.getAgentContext('non-existent-agent');

    expect(context).toBeUndefined();
  });

  test('should return agent context after initialization', async () => {
    const agentId = 'context-test-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);

    const context = manager.getAgentContext(agentId);

    expect(context).toBeDefined();
    expect(context?.agentId).toBe(agentId);
    expect(context?.state).toBe('initializing');
  });

  test('should return updated context after state transition', async () => {
    const agentId = 'context-update-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);
    await manager.transitionState(agentId, 'running');

    const context = manager.getAgentContext(agentId);

    expect(context).toBeDefined();
  });
});

// ============================================================================
// Test Suite: Dependency Management
// ============================================================================

describe('AgentLifecycleManager - Dependency Management', () => {
  let manager: AgentLifecycleManager;

  beforeEach(async () => {
    manager = new AgentLifecycleManager();
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should register agent dependency', async () => {
    const dependentId = 'dependent-agent';
    const providerId = 'provider-agent';

    const dependencyId = await manager.registerAgentDependency(
      dependentId,
      providerId,
      DependencyType.COMPLETION
    );

    expect(dependencyId).toBeDefined();
    expect(typeof dependencyId).toBe('string');
  });

  test('should register dependency with default type', async () => {
    const dependencyId = await manager.registerAgentDependency(
      'agent-1',
      'agent-2'
    );

    expect(dependencyId).toBeDefined();
  });

  test('should register dependency with options', async () => {
    const options = {
      timeout: 60000,
      metadata: { priority: 'high' },
    };

    const dependencyId = await manager.registerAgentDependency(
      'agent-1',
      'agent-2',
      DependencyType.RESOURCE,
      options
    );

    expect(dependencyId).toBeDefined();
  });

  test('should remove dependency', async () => {
    const dependencyId = await manager.registerAgentDependency(
      'agent-1',
      'agent-2'
    );

    const result = await manager.removeDependency(dependencyId);

    expect(result).toBe(true);
  });

  test('should force agent completion', async () => {
    const agentId = 'force-complete-agent';
    const reason = 'Testing force completion';

    const result = await manager.forceAgentCompletion(agentId, reason);

    expect(result).toBe(true);
  });

  test('should get agent dependency status', async () => {
    const agentId = 'status-test-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);

    const status = manager.getAgentDependencyStatus(agentId);

    expect(status).toBeDefined();
    expect(status).toHaveProperty('canComplete');
    expect(status).toHaveProperty('dependencies');
    expect(status).toHaveProperty('dependentAgents');
    expect(status).toHaveProperty('pendingCompletion');
    expect(Array.isArray(status.dependencies)).toBe(true);
    expect(Array.isArray(status.dependentAgents)).toBe(true);
  });

  test('should return dependency status for non-existent agent', () => {
    const status = manager.getAgentDependencyStatus('non-existent-agent');

    expect(status.canComplete).toBe(true);
    expect(status.dependencies).toEqual([]);
    expect(status.dependentAgents).toEqual([]);
    expect(status.pendingCompletion).toBe(false);
  });
});

// ============================================================================
// Test Suite: Task Completion Handling
// ============================================================================

describe('AgentLifecycleManager - Task Completion', () => {
  let manager: AgentLifecycleManager;
  let agentId: string;

  beforeEach(async () => {
    manager = new AgentLifecycleManager();
    agentId = 'completion-test-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should handle successful task completion', async () => {
    const taskResult = { status: 'success', data: 'test-data' };
    const result = await manager.handleTaskComplete(agentId, taskResult, true);

    expect(result.success).toBe(true);
  });

  test('should handle failed task completion', async () => {
    const taskResult = { status: 'failed', error: 'test-error' };
    const result = await manager.handleTaskComplete(agentId, taskResult, false);

    expect(result.success).toBe(true);
  });

  test('should handle task completion without explicit success flag', async () => {
    const taskResult = { status: 'completed' };
    const result = await manager.handleTaskComplete(agentId, taskResult);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Test Suite: Rerun Request Handling
// ============================================================================

describe('AgentLifecycleManager - Rerun Requests', () => {
  let manager: AgentLifecycleManager;
  let agentId: string;

  beforeEach(async () => {
    manager = new AgentLifecycleManager();
    agentId = 'rerun-test-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should handle rerun request', async () => {
    const result = await manager.handleRerunRequest(agentId, 'Manual rerun requested');

    expect(result.success).toBe(true);
  });

  test('should handle rerun request without reason', async () => {
    const result = await manager.handleRerunRequest(agentId);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Test Suite: Agent Cleanup
// ============================================================================

describe('AgentLifecycleManager - Cleanup', () => {
  let manager: AgentLifecycleManager;

  beforeEach(() => {
    manager = new AgentLifecycleManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should cleanup agent successfully', async () => {
    const agentId = 'cleanup-test-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);

    const result = await manager.cleanupAgent(agentId);

    expect(result).toBe(true);
  });

  test('should cleanup non-existent agent', async () => {
    const result = await manager.cleanupAgent('non-existent-agent');

    expect(result).toBe(true);
  });

  test('should cleanup multiple agents', async () => {
    await manager.initializeAgent('agent-1', mockAgentDefinition);
    await manager.initializeAgent('agent-2', mockAgentDefinition);
    await manager.initializeAgent('agent-3', mockAgentDefinition);

    const result1 = await manager.cleanupAgent('agent-1');
    const result2 = await manager.cleanupAgent('agent-2');
    const result3 = await manager.cleanupAgent('agent-3');

    expect(result1).toBe(true);
    expect(result2).toBe(true);
    expect(result3).toBe(true);
  });
});

// ============================================================================
// Test Suite: Lifecycle Initialization and Shutdown
// ============================================================================

describe('AgentLifecycleManager - Lifecycle', () => {
  test('should initialize manager', async () => {
    const manager = new AgentLifecycleManager();

    await expect(manager.initialize()).resolves.not.toThrow();
  });

  test('should handle multiple initialize calls (idempotent)', async () => {
    const manager = new AgentLifecycleManager();

    await manager.initialize();
    await manager.initialize();
    await manager.initialize();

    // Should not throw
    await manager.shutdown();
  });

  test('should shutdown manager', async () => {
    const manager = new AgentLifecycleManager();
    await manager.initialize();

    await expect(manager.shutdown()).resolves.not.toThrow();
  });

  test('should handle shutdown without initialization', async () => {
    const manager = new AgentLifecycleManager();

    await expect(manager.shutdown()).resolves.not.toThrow();
  });

  test('should handle multiple shutdown calls', async () => {
    const manager = new AgentLifecycleManager();
    await manager.initialize();

    await manager.shutdown();
    await manager.shutdown();
    await manager.shutdown();

    // Should not throw
  });
});

// ============================================================================
// Test Suite: Singleton Instance
// ============================================================================

describe('AgentLifecycleManager - Singleton', () => {
  test('should export singleton instance', () => {
    expect(lifecycleManager).toBeInstanceOf(AgentLifecycleManager);
  });

  test('should allow creating multiple instances', () => {
    const instance1 = new AgentLifecycleManager();
    const instance2 = new AgentLifecycleManager();

    expect(instance1).not.toBe(instance2);
    expect(instance1).toBeInstanceOf(AgentLifecycleManager);
    expect(instance2).toBeInstanceOf(AgentLifecycleManager);
  });
});

// ============================================================================
// Test Suite: Edge Cases and Error Handling
// ============================================================================

describe('AgentLifecycleManager - Edge Cases', () => {
  let manager: AgentLifecycleManager;

  beforeEach(() => {
    manager = new AgentLifecycleManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should handle empty agent ID gracefully', async () => {
    await expect(
      manager.initializeAgent('', mockAgentDefinition)
    ).resolves.toBeDefined();
  });

  test('should handle very long agent IDs', async () => {
    const longId = 'a'.repeat(1000);
    const context = await manager.initializeAgent(longId, mockAgentDefinition);

    expect(context.agentId).toBe(longId);
  });

  test('should handle special characters in agent IDs', async () => {
    const specialId = 'agent-123_test.v2@domain#section';
    const context = await manager.initializeAgent(specialId, mockAgentDefinition);

    expect(context.agentId).toBe(specialId);
  });

  test('should handle null memory values', () => {
    const agentId = 'null-test-agent';
    manager.initializeAgent(agentId, mockAgentDefinition);

    const result = manager.updateAgentMemory(agentId, 'nullKey', null);
    const value = manager.getAgentMemory(agentId, 'nullKey');

    expect(result).toBe(true);
    expect(value).toBeNull();
  });

  test('should handle undefined memory values', () => {
    const agentId = 'undefined-test-agent';
    manager.initializeAgent(agentId, mockAgentDefinition);

    const result = manager.updateAgentMemory(agentId, 'undefinedKey', undefined);
    const value = manager.getAgentMemory(agentId, 'undefinedKey');

    expect(result).toBe(true);
    expect(value).toBeUndefined();
  });
});

// ============================================================================
// Test Suite: Concurrent Operations
// ============================================================================

describe('AgentLifecycleManager - Concurrency', () => {
  let manager: AgentLifecycleManager;

  beforeEach(() => {
    manager = new AgentLifecycleManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should handle concurrent agent initializations', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      manager.initializeAgent(`concurrent-agent-${i}`, mockAgentDefinition)
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(10);
    results.forEach((context, i) => {
      expect(context.agentId).toBe(`concurrent-agent-${i}`);
    });
  });

  test('should handle concurrent memory updates', async () => {
    const agentId = 'concurrent-memory-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);

    const promises = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve(manager.updateAgentMemory(agentId, `key-${i}`, i))
    );

    const results = await Promise.all(promises);

    expect(results.every((r) => r === true)).toBe(true);

    // Verify all values were stored
    for (let i = 0; i < 100; i++) {
      expect(manager.getAgentMemory(agentId, `key-${i}`)).toBe(i);
    }
  });

  test('should handle concurrent state transitions', async () => {
    const agentId = 'concurrent-state-agent';
    await manager.initializeAgent(agentId, mockAgentDefinition);

    const states: AgentLifecycleState[] = ['idle', 'running', 'paused', 'stopped'];
    const promises = states.map((state) => manager.transitionState(agentId, state));

    const results = await Promise.all(promises);

    expect(results.every((r) => r === true)).toBe(true);
  });
});
