/**
 * Comprehensive Unit Tests for DependencyTracker
 *
 * Tests all aspects of the dependency tracking system including:
 * - Basic dependency registration and management
 * - Cycle detection and prevention
 * - Completion blocking and resolution
 * - Memory persistence
 * - Error handling and edge cases
 * - Performance under load
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import {
  DependencyTracker,
  createDependencyTracker,
  DependencyType,
  DependencyStatus,
  type AgentDependency,
  type DependencyViolation,
  type CompletionBlockerInfo
} from '../../src/lifecycle/dependency-tracker.js';

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

describe('DependencyTracker', () => {
  let tracker: DependencyTracker;
  let mockMemoryManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    tracker = createDependencyTracker('test-namespace');
    await tracker.initialize();

    // Get reference to mocked memory manager
    const { MemoryManager } = await import('../../src/memory/manager.js');
    mockMemoryManager = new MemoryManager();
  });

  afterEach(async () => {
    if (tracker) {
      await tracker.shutdown();
    }
    vi.clearAllMocks();
  });

  // ============================================================================
  // Basic Dependency Registration Tests
  // ============================================================================

  describe('Dependency Registration', () => {
    it('should register a basic completion dependency', async () => {
      const depId = await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.COMPLETION
      );

      expect(depId).toBeDefined();
      expect(typeof depId).toBe('string');

      const dependency = tracker.getDependencyDetails(depId);
      expect(dependency).toBeDefined();
      expect(dependency?.dependentAgentId).toBe('agent-1');
      expect(dependency?.providerAgentId).toBe('agent-2');
      expect(dependency?.dependencyType).toBe(DependencyType.COMPLETION);
      expect(dependency?.status).toBe(DependencyStatus.PENDING);
    });

    it('should register different types of dependencies', async () => {
      const completionDepId = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);
      const dataDepId = await tracker.registerDependency('agent-3', 'agent-4', DependencyType.DATA_DEPENDENCY);
      const serviceDepId = await tracker.registerDependency('agent-5', 'agent-6', DependencyType.SERVICE_DEPENDENCY);

      const completionDep = tracker.getDependencyDetails(completionDepId);
      const dataDep = tracker.getDependencyDetails(dataDepId);
      const serviceDep = tracker.getDependencyDetails(serviceDepId);

      expect(completionDep?.dependencyType).toBe(DependencyType.COMPLETION);
      expect(dataDep?.dependencyType).toBe(DependencyType.DATA_DEPENDENCY);
      expect(serviceDep?.dependencyType).toBe(DependencyType.SERVICE_DEPENDENCY);
    });

    it('should register dependency with timeout and metadata', async () => {
      const metadata = { testKey: 'testValue', priority: 'high' };
      const timeout = 5000;

      const depId = await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.COMPLETION,
        { timeout, metadata }
      );

      const dependency = tracker.getDependencyDetails(depId);
      expect(dependency?.timeout).toBe(timeout);
      expect(dependency?.metadata).toEqual(metadata);
    });

    it('should prevent self-dependency registration', async () => {
      await expect(
        tracker.registerDependency('agent-1', 'agent-1', DependencyType.COMPLETION)
      ).rejects.toThrow('Agent cannot depend on itself');
    });

    it('should track bidirectional dependency mappings', async () => {
      await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      const agent1Deps = tracker.getAgentDependencies('agent-1');
      const agent2Dependents = tracker.getDependentAgents('agent-2');

      expect(agent1Deps).toHaveLength(1);
      expect(agent1Deps[0].providerAgentId).toBe('agent-2');
      expect(agent2Dependents).toContain('agent-1');
    });
  });

  // ============================================================================
  // Cycle Detection Tests
  // ============================================================================

  describe('Cycle Detection', () => {
    it('should detect and prevent simple cycles', async () => {
      // Create: A -> B -> C
      await tracker.registerDependency('agent-a', 'agent-b', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-b', 'agent-c', DependencyType.COMPLETION);

      // Attempt to create cycle: C -> A
      await expect(
        tracker.registerDependency('agent-c', 'agent-a', DependencyType.COMPLETION)
      ).rejects.toThrow('Adding dependency would create a cycle');
    });

    it('should detect complex multi-node cycles', async () => {
      // Create chain: A -> B -> C -> D -> E
      await tracker.registerDependency('agent-a', 'agent-b', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-b', 'agent-c', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-c', 'agent-d', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-d', 'agent-e', DependencyType.COMPLETION);

      // Attempt to create cycle: E -> A
      await expect(
        tracker.registerDependency('agent-e', 'agent-a', DependencyType.COMPLETION)
      ).rejects.toThrow('Adding dependency would create a cycle');
    });

    it('should detect cycles in complex graph structures', async () => {
      // Create diamond pattern: A -> B, A -> C, B -> D, C -> D
      await tracker.registerDependency('agent-a', 'agent-b', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-a', 'agent-c', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-b', 'agent-d', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-c', 'agent-d', DependencyType.COMPLETION);

      // This should be fine (no cycle)
      expect(tracker.getStatistics().cyclesDetected).toBe(0);

      // But creating D -> A would create a cycle
      await expect(
        tracker.registerDependency('agent-d', 'agent-a', DependencyType.COMPLETION)
      ).rejects.toThrow('Adding dependency would create a cycle');
    });

    it('should provide cycle detection results', async () => {
      // Create a dependency chain
      await tracker.registerDependency('agent-a', 'agent-b', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-b', 'agent-c', DependencyType.COMPLETION);

      const cycles = tracker.detectCycles();
      expect(cycles).toHaveLength(0);

      // Test that cycle detection would work if we forced a cycle
      // (This tests the detection logic without actually creating invalid state)
      const violations = tracker.checkViolations();
      expect(violations.filter(v => v.type === 'cycle')).toHaveLength(0);
    });
  });

  // ============================================================================
  // Completion Blocking Tests
  // ============================================================================

  describe('Completion Blocking', () => {
    it('should block agent completion when dependencies exist', async () => {
      await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      const blockerInfo = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo.canComplete).toBe(false);
      expect(blockerInfo.blockedBy).toContain('agent-2');
      expect(blockerInfo.reason).toContain('Blocked by 1 dependencies');
    });

    it('should allow completion when no dependencies exist', async () => {
      const blockerInfo = await tracker.canAgentComplete('agent-no-deps');
      expect(blockerInfo.canComplete).toBe(true);
      expect(blockerInfo.blockedBy).toHaveLength(0);
    });

    it('should track what agents are being blocked', async () => {
      await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-3', 'agent-2', DependencyType.COMPLETION);

      const agent2BlockerInfo = await tracker.canAgentComplete('agent-2');
      expect(agent2BlockerInfo.blocking).toContain('agent-1');
      expect(agent2BlockerInfo.blocking).toContain('agent-3');
    });

    it('should handle completion requests correctly', async () => {
      await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      // Agent 1 should be blocked
      const canComplete1 = await tracker.requestAgentCompletion('agent-1');
      expect(canComplete1).toBe(false);

      // Agent 2 should be allowed
      const canComplete2 = await tracker.requestAgentCompletion('agent-2');
      expect(canComplete2).toBe(true);
    });

    it('should emit completion events correctly', async () => {
      const mockApproved = vi.fn();
      const mockBlocked = vi.fn();

      tracker.on('agent:completion_approved', mockApproved);
      tracker.on('agent:completion_blocked', mockBlocked);

      await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      await tracker.requestAgentCompletion('agent-1');
      expect(mockBlocked).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          blockerInfo: expect.objectContaining({
            canComplete: false
          })
        })
      );

      await tracker.requestAgentCompletion('agent-2');
      expect(mockApproved).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-2' })
      );
    });
  });

  // ============================================================================
  // Dependency Resolution Tests
  // ============================================================================

  describe('Dependency Resolution', () => {
    it('should resolve dependencies and unblock agents', async () => {
      const depId = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      // Initially blocked
      let blockerInfo = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo.canComplete).toBe(false);

      // Resolve dependency
      const resolved = await tracker.resolveDependency(depId, { result: 'success' });
      expect(resolved).toBe(true);

      // Now should be unblocked
      blockerInfo = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo.canComplete).toBe(true);

      // Dependency should be marked as resolved
      const dependency = tracker.getDependencyDetails(depId);
      expect(dependency?.status).toBe(DependencyStatus.RESOLVED);
      expect(dependency?.resolvedAt).toBeDefined();
    });

    it('should validate resolution data when validator provided', async () => {
      const validator = vi.fn().mockReturnValue(true);
      const depId = await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.DATA_DEPENDENCY,
        {
          dependencyData: {
            type: 'test-data',
            validation: validator
          }
        }
      );

      const resolved = await tracker.resolveDependency(depId, { testData: 'value' });

      expect(resolved).toBe(true);
      expect(validator).toHaveBeenCalledWith({ testData: 'value' });
    });

    it('should reject resolution with invalid data', async () => {
      const validator = vi.fn().mockReturnValue(false);
      const depId = await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.DATA_DEPENDENCY,
        {
          dependencyData: {
            type: 'test-data',
            validation: validator
          }
        }
      );

      const resolved = await tracker.resolveDependency(depId, { invalidData: 'value' });

      expect(resolved).toBe(false);
      expect(validator).toHaveBeenCalledWith({ invalidData: 'value' });

      const dependency = tracker.getDependencyDetails(depId);
      expect(dependency?.status).toBe(DependencyStatus.PENDING);
    });

    it('should transform resolution data when transformer provided', async () => {
      const transformer = vi.fn().mockImplementation((data: any) => ({
        transformed: true,
        original: data
      }));

      const depId = await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.DATA_DEPENDENCY,
        {
          dependencyData: {
            type: 'test-data',
            transform: transformer
          }
        }
      );

      const resolved = await tracker.resolveDependency(depId, { rawData: 'value' });

      expect(resolved).toBe(true);
      expect(transformer).toHaveBeenCalledWith({ rawData: 'value' });

      const dependency = tracker.getDependencyDetails(depId);
      expect(dependency?.dependencyData?.content).toEqual({
        transformed: true,
        original: { rawData: 'value' }
      });
    });

    it('should emit resolution events', async () => {
      const mockResolved = vi.fn();
      tracker.on('dependency:resolved', mockResolved);

      const depId = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);
      await tracker.resolveDependency(depId, { result: 'success' });

      expect(mockResolved).toHaveBeenCalledWith(
        expect.objectContaining({
          dependency: expect.objectContaining({
            id: depId,
            status: DependencyStatus.RESOLVED
          }),
          resolutionData: { result: 'success' }
        })
      );
    });
  });

  // ============================================================================
  // Dependency Removal Tests
  // ============================================================================

  describe('Dependency Removal', () => {
    it('should remove dependencies and update mappings', async () => {
      const depId = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      // Verify dependency exists
      expect(tracker.getDependencyDetails(depId)).toBeDefined();
      expect(tracker.getAgentDependencies('agent-1')).toHaveLength(1);
      expect(tracker.getDependentAgents('agent-2')).toContain('agent-1');

      // Remove dependency
      const removed = await tracker.removeDependency(depId);
      expect(removed).toBe(true);

      // Verify removal
      expect(tracker.getDependencyDetails(depId)).toBeUndefined();
      expect(tracker.getAgentDependencies('agent-1')).toHaveLength(0);
      expect(tracker.getDependentAgents('agent-2')).not.toContain('agent-1');
    });

    it('should unblock agents when dependencies are removed', async () => {
      const depId = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      // Initially blocked
      let blockerInfo = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo.canComplete).toBe(false);

      // Remove dependency
      await tracker.removeDependency(depId);

      // Now unblocked
      blockerInfo = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo.canComplete).toBe(true);
    });

    it('should handle removal of non-existent dependencies', async () => {
      const removed = await tracker.removeDependency('non-existent-id');
      expect(removed).toBe(false);
    });

    it('should emit removal events', async () => {
      const mockRemoved = vi.fn();
      tracker.on('dependency:removed', mockRemoved);

      const depId = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);
      await tracker.removeDependency(depId);

      expect(mockRemoved).toHaveBeenCalledWith(
        expect.objectContaining({
          id: depId,
          dependentAgentId: 'agent-1',
          providerAgentId: 'agent-2'
        })
      );
    });
  });

  // ============================================================================
  // Force Completion Tests
  // ============================================================================

  describe('Force Completion', () => {
    it('should force agent completion and cancel dependencies', async () => {
      const depId = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      // Initially blocked
      let blockerInfo = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo.canComplete).toBe(false);

      // Force completion
      await tracker.forceAgentCompletion('agent-1', 'Emergency shutdown');

      // Should be unblocked now
      blockerInfo = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo.canComplete).toBe(true);

      // Dependency should be cancelled
      const dependency = tracker.getDependencyDetails(depId);
      expect(dependency?.status).toBe(DependencyStatus.CANCELLED);
    });

    it('should emit force completion events', async () => {
      const mockForced = vi.fn();
      tracker.on('agent:completion_forced', mockForced);

      await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);
      await tracker.forceAgentCompletion('agent-1', 'Test force completion');

      expect(mockForced).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          reason: 'Test force completion'
        })
      );
    });
  });

  // ============================================================================
  // Timeout Handling Tests
  // ============================================================================

  describe('Timeout Handling', () => {
    it('should handle dependency timeouts', async () => {
      vi.useFakeTimers();

      const mockTimeout = vi.fn();
      tracker.on('dependency:timeout', mockTimeout);

      const depId = await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.COMPLETION,
        { timeout: 1000 }
      );

      // Fast-forward time
      vi.advanceTimersByTime(1001);

      // Wait for timeout to be processed
      await new Promise(resolve => setTimeout(resolve, 0));

      const dependency = tracker.getDependencyDetails(depId);
      expect(dependency?.status).toBe(DependencyStatus.TIMEOUT);
      expect(mockTimeout).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should not timeout resolved dependencies', async () => {
      vi.useFakeTimers();

      const depId = await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.COMPLETION,
        { timeout: 1000 }
      );

      // Resolve before timeout
      await tracker.resolveDependency(depId, { result: 'completed' });

      // Fast-forward time
      vi.advanceTimersByTime(1001);

      const dependency = tracker.getDependencyDetails(depId);
      expect(dependency?.status).toBe(DependencyStatus.RESOLVED);

      vi.useRealTimers();
    });
  });

  // ============================================================================
  // Statistics and Query Tests
  // ============================================================================

  describe('Statistics and Queries', () => {
    it('should provide accurate statistics', async () => {
      const dep1 = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);
      const dep2 = await tracker.registerDependency('agent-3', 'agent-4', DependencyType.DATA_DEPENDENCY);
      const dep3 = await tracker.registerDependency('agent-5', 'agent-6', DependencyType.SERVICE_DEPENDENCY);

      await tracker.resolveDependency(dep1, { result: 'success' });

      const stats = tracker.getStatistics();
      expect(stats.totalDependencies).toBe(3);
      expect(stats.pendingDependencies).toBe(2);
      expect(stats.resolvedDependencies).toBe(1);
      expect(stats.failedDependencies).toBe(0);
      expect(stats.agentsWithDependencies).toBe(3);
      expect(stats.providingAgents).toBe(3);
    });

    it('should provide agent-specific dependency information', async () => {
      await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);
      await tracker.registerDependency('agent-1', 'agent-3', DependencyType.DATA_DEPENDENCY);

      const agent1Deps = tracker.getAgentDependencies('agent-1');
      expect(agent1Deps).toHaveLength(2);
      expect(agent1Deps.map(d => d.providerAgentId)).toEqual(
        expect.arrayContaining(['agent-2', 'agent-3'])
      );

      const agent2Dependents = tracker.getDependentAgents('agent-2');
      expect(agent2Dependents).toContain('agent-1');
    });

    it('should detect dependency violations', async () => {
      vi.useFakeTimers();

      // Create a dependency with short timeout
      await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.COMPLETION,
        { timeout: 1000 }
      );

      // Fast-forward to near timeout
      vi.advanceTimersByTime(950);

      const violations = tracker.checkViolations();
      const timeoutViolations = violations.filter(v => v.type === 'timeout');
      expect(timeoutViolations).toHaveLength(1);
      expect(timeoutViolations[0].severity).toBe('medium');

      vi.useRealTimers();
    });
  });

  // ============================================================================
  // Memory Persistence Tests
  // ============================================================================

  describe('Memory Persistence', () => {
    it('should persist dependencies to memory', async () => {
      const depId = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      // Verify memory manager store was called
      expect(mockMemoryManager.store).toHaveBeenCalledWith(
        expect.objectContaining({
          id: `dependency:${depId}`,
          type: 'dependency',
          namespace: 'test-namespace'
        })
      );
    });

    it('should save state snapshot on shutdown', async () => {
      await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);
      await tracker.shutdown();

      // Verify state snapshot was saved
      expect(mockMemoryManager.store).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'dependency-tracker:state',
          type: 'tracker-state',
          namespace: 'test-namespace'
        })
      );
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle operations on uninitialized tracker', async () => {
      const uninitializedTracker = createDependencyTracker('uninitialized');

      await expect(
        uninitializedTracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION)
      ).rejects.toThrow('DependencyTracker not initialized');
    });

    it('should handle resolution of non-existent dependencies', async () => {
      const resolved = await tracker.resolveDependency('non-existent-id', { data: 'test' });
      expect(resolved).toBe(false);
    });

    it('should handle validation errors gracefully', async () => {
      const failingValidator = vi.fn().mockImplementation(() => {
        throw new Error('Validation error');
      });

      const depId = await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.DATA_DEPENDENCY,
        {
          dependencyData: {
            type: 'test-data',
            validation: failingValidator
          }
        }
      );

      const resolved = await tracker.resolveDependency(depId, { data: 'test' });
      expect(resolved).toBe(false);
    });

    it('should handle transformation errors gracefully', async () => {
      const failingTransformer = vi.fn().mockImplementation(() => {
        throw new Error('Transform error');
      });

      const depId = await tracker.registerDependency(
        'agent-1',
        'agent-2',
        DependencyType.DATA_DEPENDENCY,
        {
          dependencyData: {
            type: 'test-data',
            transform: failingTransformer
          }
        }
      );

      const resolved = await tracker.resolveDependency(depId, { data: 'test' });
      expect(resolved).toBe(false);
    });
  });

  // ============================================================================
  // Edge Cases and Complex Scenarios
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty dependency queries', async () => {
      const blockerInfo = await tracker.canAgentComplete('non-existent-agent');
      expect(blockerInfo.canComplete).toBe(true);
      expect(blockerInfo.blockedBy).toHaveLength(0);

      const deps = tracker.getAgentDependencies('non-existent-agent');
      expect(deps).toHaveLength(0);

      const dependents = tracker.getDependentAgents('non-existent-agent');
      expect(dependents).toHaveLength(0);
    });

    it('should handle multiple dependencies between same agents', async () => {
      const dep1 = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);
      const dep2 = await tracker.registerDependency('agent-1', 'agent-2', DependencyType.DATA_DEPENDENCY);

      const agent1Deps = tracker.getAgentDependencies('agent-1');
      expect(agent1Deps).toHaveLength(2);

      // Both dependencies should block completion
      const blockerInfo = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo.canComplete).toBe(false);

      // Resolving one shouldn't unblock
      await tracker.resolveDependency(dep1, { result: 'success' });
      const blockerInfo2 = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo2.canComplete).toBe(false);

      // Resolving both should unblock
      await tracker.resolveDependency(dep2, { data: 'test' });
      const blockerInfo3 = await tracker.canAgentComplete('agent-1');
      expect(blockerInfo3.canComplete).toBe(true);
    });

    it('should handle rapid registration and removal', async () => {
      const promises: Promise<string>[] = [];

      // Rapidly register many dependencies
      for (let i = 0; i < 100; i++) {
        promises.push(
          tracker.registerDependency(`agent-${i}`, `provider-${i}`, DependencyType.COMPLETION)
        );
      }

      const depIds = await Promise.all(promises);
      expect(depIds).toHaveLength(100);

      // Rapidly remove them
      const removePromises = depIds.map(id => tracker.removeDependency(id));
      const removeResults = await Promise.all(removePromises);

      expect(removeResults.every(result => result === true)).toBe(true);

      const stats = tracker.getStatistics();
      expect(stats.totalDependencies).toBe(0);
    });

    it('should handle concurrent completion requests', async () => {
      await tracker.registerDependency('agent-1', 'agent-2', DependencyType.COMPLETION);

      // Multiple concurrent completion requests for same agent
      const requests = Array(10).fill(null).map(() =>
        tracker.requestAgentCompletion('agent-1')
      );

      const results = await Promise.all(requests);
      expect(results.every(result => result === false)).toBe(true);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should handle large numbers of dependencies efficiently', async () => {
      const startTime = Date.now();

      // Create a large dependency graph
      const agentCount = 1000;
      const promises: Promise<string>[] = [];

      for (let i = 0; i < agentCount - 1; i++) {
        promises.push(
          tracker.registerDependency(`agent-${i}`, `agent-${i + 1}`, DependencyType.COMPLETION)
        );
      }

      await Promise.all(promises);

      const registrationTime = Date.now() - startTime;
      expect(registrationTime).toBeLessThan(5000); // Should complete in less than 5 seconds

      // Test cycle detection performance
      const cycleStartTime = Date.now();
      try {
        await tracker.registerDependency(`agent-${agentCount - 1}`, 'agent-0', DependencyType.COMPLETION);
      } catch (error) {
        // Expected to fail due to cycle
      }
      const cycleDetectionTime = Date.now() - cycleStartTime;
      expect(cycleDetectionTime).toBeLessThan(1000); // Cycle detection should be fast

      // Test statistics calculation performance
      const statsStartTime = Date.now();
      const stats = tracker.getStatistics();
      const statsTime = Date.now() - statsStartTime;

      expect(stats.totalDependencies).toBe(agentCount - 1);
      expect(statsTime).toBeLessThan(100); // Statistics should be very fast
    }, 10000); // Increase timeout for performance test

    it('should handle frequent completion checks efficiently', async () => {
      // Create moderate dependency graph
      for (let i = 0; i < 100; i++) {
        await tracker.registerDependency(`dependent-${i}`, `provider-${i}`, DependencyType.COMPLETION);
      }

      const startTime = Date.now();

      // Perform many completion checks
      const checkPromises: Promise<CompletionBlockerInfo>[] = [];
      for (let i = 0; i < 1000; i++) {
        checkPromises.push(tracker.canAgentComplete(`dependent-${i % 100}`));
      }

      await Promise.all(checkPromises);

      const checkTime = Date.now() - startTime;
      expect(checkTime).toBeLessThan(1000); // Should complete checks quickly
    });
  });
});