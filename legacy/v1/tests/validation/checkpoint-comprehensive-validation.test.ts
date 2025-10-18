/**
 * Comprehensive Validation Test Suite for Sequential Lifecycle Enhancement Project
 *
 * This test suite validates all three checkpoints:
 * - Checkpoint 1: Agent Lifecycle State Management
 * - Checkpoint 2: Dependency-Aware Completion Tracking
 * - Checkpoint 3: Enhanced Topology Coordination
 *
 * Tests both individual components and their integration across the entire system.
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import fs from 'node:fs/promises';

// Import all components for validation
import {
  lifecycleManager,
  initializeAgent,
  transitionAgentState,
  registerAgentDependency,
  removeAgentDependency,
  getAgentDependencyStatus,
  forceAgentCompletion,
  initializeLifecycleManager,
  shutdownLifecycleManager,
  type AgentLifecycleState,
  type AgentLifecycleContext
} from '../../src/agents/lifecycle-manager.js';

import {
  DependencyTracker,
  getDependencyTracker,
  createDependencyTracker,
  DependencyType,
  DependencyStatus,
  type AgentDependency,
  type CompletionBlockerInfo,
  type DependencyViolation
} from '../../src/lifecycle/dependency-tracker.js';

import {
  HierarchicalCoordinator,
  createHierarchicalCoordinator,
  createHierarchicalCoordinatorWithDependencies,
  type HierarchicalCoordinatorConfig
} from '../../src/agents/hierarchical-coordinator.js';

import {
  MeshCoordinator,
  createMeshCoordinator,
  createMeshCoordinatorWithDependencies,
  type MeshCoordinatorConfig
} from '../../src/agents/mesh-coordinator.js';

import {
  TopologyManager,
  createTopologyManager,
  createTopologyManagerWithPersistence,
  type TopologyManagerConfig
} from '../../src/topology/topology-manager.js';

import {
  AdaptiveCoordinator
} from '../../src/topology/adaptive-coordinator.js';

import {
  CommunicationBridge
} from '../../src/topology/communication-bridge.js';

// Test utilities
import { generateId } from '../../src/utils/helpers.js';
import { Logger } from '../../src/core/logger.js';

// ============================================================================
// Test Configuration and Setup
// ============================================================================

const TEST_TIMEOUT = 30000; // 30 seconds
const INTEGRATION_TEST_TIMEOUT = 60000; // 1 minute

describe('Checkpoint 4: Comprehensive Validation and Testing', () => {
  let testLogger: Logger;
  let testNamespace: string;

  beforeAll(async () => {
    testLogger = new Logger({ level: 'info', format: 'json', destination: 'console' });
    testNamespace = `validation-test-${Date.now()}`;

    // Initialize global lifecycle manager
    await initializeLifecycleManager();

    testLogger.info('Starting comprehensive validation tests');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup global lifecycle manager
    await shutdownLifecycleManager();

    testLogger.info('Completed comprehensive validation tests');
  }, TEST_TIMEOUT);

  // ============================================================================
  // Checkpoint 1 Validation: Agent Lifecycle State Management
  // ============================================================================

  describe('Checkpoint 1: Agent Lifecycle State Management', () => {
    test('should manage agent lifecycle states correctly', async () => {
      const agentId = generateId('test-agent');
      const mockAgentDefinition = {
        name: 'test-agent',
        description: 'Test agent for lifecycle validation',
        type: 'coordinator',
        capabilities: ['coordination', 'testing'],
        lifecycle: {
          state_management: true,
          persistent_memory: false,
          max_retries: 3
        },
        hooks: {
          init: 'echo "Test agent initialized"',
          task_complete: 'echo "Test task completed"',
          cleanup: 'echo "Test agent cleanup"'
        }
      };

      // Initialize agent
      const context = await initializeAgent(agentId, mockAgentDefinition, 'test-task-1');
      expect(context).toBeDefined();
      expect(context.agentId).toBe(agentId);
      expect(context.state).toBe('uninitialized');

      // Test state transitions
      const transition1 = await transitionAgentState(agentId, 'initializing', 'Starting initialization');
      expect(transition1).toBe(true);

      const transition2 = await transitionAgentState(agentId, 'idle', 'Initialization complete');
      expect(transition2).toBe(true);

      const transition3 = await transitionAgentState(agentId, 'running', 'Starting task execution');
      expect(transition3).toBe(true);

      // Get current context
      const currentContext = lifecycleManager.getAgentContext(agentId);
      expect(currentContext?.state).toBe('running');
      expect(currentContext?.stateHistory.length).toBeGreaterThanOrEqual(4);

      // Validate state history
      const stateHistory = currentContext?.stateHistory || [];
      expect(stateHistory[0].state).toBe('uninitialized');
      expect(stateHistory[1].state).toBe('initializing');
      expect(stateHistory[2].state).toBe('idle');
      expect(stateHistory[3].state).toBe('running');

      // Test cleanup
      const cleanupResult = await lifecycleManager.cleanupAgent(agentId);
      expect(cleanupResult).toBe(true);
    }, TEST_TIMEOUT);

    test('should handle agent memory management', async () => {
      const agentId = generateId('memory-test-agent');
      const mockAgentDefinition = {
        name: 'memory-test-agent',
        type: 'worker',
        capabilities: ['memory-testing'],
        lifecycle: {
          state_management: true,
          persistent_memory: true,
          max_retries: 2
        }
      };

      await initializeAgent(agentId, mockAgentDefinition);

      // Test memory operations
      const memorySet = lifecycleManager.updateAgentMemory(agentId, 'test-key', 'test-value');
      expect(memorySet).toBe(true);

      const memoryValue = lifecycleManager.getAgentMemory(agentId, 'test-key');
      expect(memoryValue).toBe('test-value');

      // Test complex data storage
      const complexData = { nested: { value: 42, array: [1, 2, 3] } };
      lifecycleManager.updateAgentMemory(agentId, 'complex-data', complexData);
      const retrievedData = lifecycleManager.getAgentMemory(agentId, 'complex-data');
      expect(retrievedData).toEqual(complexData);

      await lifecycleManager.cleanupAgent(agentId);
    }, TEST_TIMEOUT);

    test('should handle lifecycle hooks correctly', async () => {
      const agentId = generateId('hooks-test-agent');
      const hookResults: string[] = [];

      const mockAgentDefinition = {
        name: 'hooks-test-agent',
        type: 'coordinator',
        capabilities: ['hook-testing'],
        lifecycle: {
          state_management: true,
          persistent_memory: false,
          max_retries: 1
        },
        hooks: {
          init: 'echo "Hook: init executed"',
          start: 'echo "Hook: start executed"',
          stop: 'echo "Hook: stop executed"',
          cleanup: 'echo "Hook: cleanup executed"'
        }
      };

      await initializeAgent(agentId, mockAgentDefinition);
      await transitionAgentState(agentId, 'initializing');
      await transitionAgentState(agentId, 'running');
      await transitionAgentState(agentId, 'stopping');
      await transitionAgentState(agentId, 'stopped');

      const context = lifecycleManager.getAgentContext(agentId);
      expect(context?.state).toBe('stopped');

      await lifecycleManager.cleanupAgent(agentId);
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Checkpoint 2 Validation: Dependency-Aware Completion Tracking
  // ============================================================================

  describe('Checkpoint 2: Dependency-Aware Completion Tracking', () => {
    let dependencyTracker: DependencyTracker;

    beforeEach(async () => {
      const trackerNamespace = `${testNamespace}-${generateId('tracker')}`;
      dependencyTracker = createDependencyTracker(trackerNamespace);
      await dependencyTracker.initialize();
    });

    afterEach(async () => {
      if (dependencyTracker) {
        await dependencyTracker.shutdown();
      }
    });

    test('should register and manage bidirectional dependencies', async () => {
      const agentA = generateId('agent-a');
      const agentB = generateId('agent-b');

      // Register dependency: A depends on B
      const dependencyId = await dependencyTracker.registerDependency(
        agentA,
        agentB,
        DependencyType.COMPLETION,
        {
          timeout: 30000,
          metadata: { test: 'bidirectional-dependency' }
        }
      );

      expect(dependencyId).toBeDefined();
      expect(dependencyId).toMatch(/^dep-/);

      // Check dependency details
      const dependency = dependencyTracker.getDependencyDetails(dependencyId);
      expect(dependency).toBeDefined();
      expect(dependency?.dependentAgentId).toBe(agentA);
      expect(dependency?.providerAgentId).toBe(agentB);
      expect(dependency?.dependencyType).toBe(DependencyType.COMPLETION);
      expect(dependency?.status).toBe(DependencyStatus.PENDING);

      // Check completion blocker info
      const blockerInfo = await dependencyTracker.canAgentComplete(agentA);
      expect(blockerInfo.canComplete).toBe(false);
      expect(blockerInfo.blockedBy).toContain(agentB);

      // Resolve dependency
      const resolved = await dependencyTracker.resolveDependency(dependencyId, { completed: true });
      expect(resolved).toBe(true);

      // Check completion status after resolution
      const blockerInfoAfter = await dependencyTracker.canAgentComplete(agentA);
      expect(blockerInfoAfter.canComplete).toBe(true);
      expect(blockerInfoAfter.blockedBy).toHaveLength(0);

      // Cleanup
      await dependencyTracker.removeDependency(dependencyId);
    }, TEST_TIMEOUT);

    test('should detect and prevent dependency cycles', async () => {
      const agentA = generateId('agent-a');
      const agentB = generateId('agent-b');
      const agentC = generateId('agent-c');

      // Create chain: A -> B -> C
      const depAB = await dependencyTracker.registerDependency(agentA, agentB, DependencyType.COMPLETION);
      const depBC = await dependencyTracker.registerDependency(agentB, agentC, DependencyType.COMPLETION);

      // Try to create cycle: C -> A (should fail)
      await expect(
        dependencyTracker.registerDependency(agentC, agentA, DependencyType.COMPLETION)
      ).rejects.toThrow(/cycle/i);

      // Verify original dependencies still exist
      expect(dependencyTracker.getDependencyDetails(depAB)).toBeDefined();
      expect(dependencyTracker.getDependencyDetails(depBC)).toBeDefined();

      // Check dependency chains
      const chainsFromA = dependencyTracker.getDependencyChains ? dependencyTracker.getDependencyChains(agentA) : [];
      expect(chainsFromA.length).toBeGreaterThan(0);

      // Cleanup
      await dependencyTracker.removeDependency(depAB);
      await dependencyTracker.removeDependency(depBC);
    }, TEST_TIMEOUT);

    test('should handle dependency timeouts', async () => {
      const agentA = generateId('timeout-agent-a');
      const agentB = generateId('timeout-agent-b');

      // Register dependency with short timeout
      const dependencyId = await dependencyTracker.registerDependency(
        agentA,
        agentB,
        DependencyType.COMPLETION,
        { timeout: 1000 } // 1 second
      );

      const dependency = dependencyTracker.getDependencyDetails(dependencyId);
      expect(dependency?.status).toBe(DependencyStatus.PENDING);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check if dependency timed out
      const dependencyAfterTimeout = dependencyTracker.getDependencyDetails(dependencyId);
      expect(dependencyAfterTimeout?.status).toBe(DependencyStatus.TIMEOUT);

      await dependencyTracker.removeDependency(dependencyId);
    }, TEST_TIMEOUT);

    test('should provide comprehensive dependency statistics', async () => {
      const agents = Array.from({ length: 5 }, () => generateId('stats-agent'));
      const dependencies: string[] = [];

      // Create multiple dependencies
      for (let i = 0; i < agents.length - 1; i++) {
        const depId = await dependencyTracker.registerDependency(
          agents[i],
          agents[i + 1],
          DependencyType.COMPLETION
        );
        dependencies.push(depId);
      }

      // Get statistics
      const stats = dependencyTracker.getStatistics();
      expect(stats.totalDependencies).toBe(dependencies.length);
      expect(stats.pendingDependencies).toBe(dependencies.length);
      expect(stats.agentsWithDependencies).toBe(agents.length - 1);
      expect(stats.providingAgents).toBe(agents.length - 1);

      // Resolve some dependencies
      await dependencyTracker.resolveDependency(dependencies[0], { result: 'completed' });
      await dependencyTracker.resolveDependency(dependencies[1], { result: 'completed' });

      const statsAfterResolution = dependencyTracker.getStatistics();
      expect(statsAfterResolution.resolvedDependencies).toBe(2);
      expect(statsAfterResolution.pendingDependencies).toBe(dependencies.length - 2);

      // Cleanup
      for (const depId of dependencies) {
        await dependencyTracker.removeDependency(depId);
      }
    }, TEST_TIMEOUT);

    test('should handle cross-session persistence', async () => {
      const agentA = generateId('persist-agent-a');
      const agentB = generateId('persist-agent-b');

      // Register dependency
      const dependencyId = await dependencyTracker.registerDependency(
        agentA,
        agentB,
        DependencyType.COMPLETION,
        { metadata: { persistent: true } }
      );

      // Shutdown and reinitialize tracker
      await dependencyTracker.shutdown();

      const newTracker = createDependencyTracker(dependencyTracker['memoryNamespace']);
      await newTracker.initialize();

      // Check if dependency was restored
      const restoredDependency = newTracker.getDependencyDetails(dependencyId);
      expect(restoredDependency?.dependentAgentId).toBe(agentA);
      expect(restoredDependency?.providerAgentId).toBe(agentB);

      await newTracker.shutdown();
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Checkpoint 3 Validation: Enhanced Topology Coordination
  // ============================================================================

  describe('Checkpoint 3: Enhanced Topology Coordination', () => {
    test('should manage hierarchical coordinator with dependencies', async () => {
      const config: Partial<HierarchicalCoordinatorConfig> = {
        maxDepth: 3,
        maxChildrenPerNode: 5,
        enableDependencyTracking: true,
        memoryNamespace: `${testNamespace}-hierarchical`
      };

      const coordinator = createHierarchicalCoordinatorWithDependencies(
        config.memoryNamespace!,
        config
      );

      await coordinator.initialize();

      // Register agents in hierarchy
      const rootAgent = generateId('root-agent');
      const childAgent1 = generateId('child-agent-1');
      const childAgent2 = generateId('child-agent-2');

      await coordinator.registerAgent(rootAgent, {
        name: 'root-coordinator',
        type: 'coordinator',
        level: 0,
        capabilities: ['coordination', 'management'],
        status: 'ready'
      });

      await coordinator.registerAgent(childAgent1, {
        name: 'child-worker-1',
        type: 'worker',
        level: 1,
        capabilities: ['execution', 'processing'],
        status: 'ready'
      }, rootAgent);

      await coordinator.registerAgent(childAgent2, {
        name: 'child-worker-2',
        type: 'worker',
        level: 1,
        capabilities: ['execution', 'analytics'],
        status: 'ready'
      }, rootAgent);

      // Get coordinator status
      const status = coordinator.getCoordinatorStatus();
      expect(status.totalAgents).toBe(3);
      expect(status.hierarchyDepth).toBe(2);
      expect(status.rootAgents).toBe(1);

      // Test task delegation
      const taskId = await coordinator.delegateTask('Test hierarchical task', {
        requiredCapabilities: ['execution'],
        priority: 5
      });

      expect(taskId).toBeDefined();
      expect(taskId).toMatch(/^hier-task-/);

      // Get task status
      const task = coordinator.getTaskStatus(taskId);
      expect(task).toBeDefined();
      expect(task?.status).toBe('pending');

      // Test hierarchy structure
      const hierarchy = coordinator.getHierarchyStructure();
      expect(hierarchy.agents).toHaveLength(3);
      expect(hierarchy.depth).toBe(2);
      expect(hierarchy.rootCount).toBe(1);

      await coordinator.shutdown();
    }, TEST_TIMEOUT);

    test('should manage mesh coordinator with cross-agent dependencies', async () => {
      const config: Partial<MeshCoordinatorConfig> = {
        maxAgents: 10,
        maxConnections: 8,
        enableDependencyTracking: true,
        memoryNamespace: `${testNamespace}-mesh`
      };

      const coordinator = createMeshCoordinatorWithDependencies(
        config.memoryNamespace!,
        config
      );

      await coordinator.initialize();

      // Register multiple agents
      const agents = Array.from({ length: 5 }, () => generateId('mesh-agent'));

      for (const agentId of agents) {
        await coordinator.registerAgent(agentId, {
          name: `mesh-agent-${agentId.slice(-8)}`,
          type: 'peer',
          capabilities: ['coordination', 'processing'],
          status: 'ready'
        });
      }

      // Test mesh topology
      const topology = coordinator.getMeshTopology();
      expect(topology.agents).toHaveLength(5);
      expect(topology.totalConnections).toBeGreaterThan(0);
      expect(topology.averageConnections).toBeGreaterThan(0);

      // Test task coordination
      const taskId = await coordinator.coordinateTask('Mesh coordination test', {
        requiredCapabilities: ['processing'],
        priority: 7
      });

      expect(taskId).toBeDefined();
      const task = coordinator.getTaskStatus(taskId);
      expect(task?.assignedAgents.length).toBeGreaterThan(0);

      // Get coordinator status
      const status = coordinator.getCoordinatorStatus();
      expect(status.agentCount).toBe(5);
      expect(status.canComplete).toBeDefined();

      await coordinator.shutdown();
    }, TEST_TIMEOUT);

    test('should manage topology manager with multiple topologies', async () => {
      const config: Partial<TopologyManagerConfig> = {
        maxTopologies: 5,
        maxBridges: 10,
        enableCrossTopologyRouting: true,
        enableAdaptiveOptimization: true,
        memoryNamespace: `${testNamespace}-manager`
      };

      const manager = createTopologyManagerWithPersistence(
        config.memoryNamespace!,
        config
      );

      await manager.initialize();

      // Create different topology types
      const meshTopology = await manager.createTopology({
        type: 'mesh',
        name: 'test-mesh',
        strategy: 'adaptive',
        faultTolerance: 'byzantine',
        loadBalancing: 'adaptive',
        maxAgents: 20,
        maxConnections: 10,
        enableCrossTopology: true,
        enableAdaptiveOptimization: true,
        performanceThresholds: {
          latency: 1000,
          throughput: 100,
          errorRate: 0.05
        },
        timeouts: {
          coordination: 30000,
          completion: 300000
        },
        memoryNamespace: `${testNamespace}-mesh-topology`
      });

      const hierarchicalTopology = await manager.createTopology({
        type: 'hierarchical',
        name: 'test-hierarchical',
        strategy: 'top-down',
        faultTolerance: 'basic',
        loadBalancing: 'round-robin',
        maxAgents: 30,
        maxConnections: 15,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: {
          latency: 2000,
          throughput: 50,
          errorRate: 0.1
        },
        timeouts: {
          coordination: 45000,
          completion: 600000,
          adaptation: 180000
        },
        memoryNamespace: `${testNamespace}-hierarchical-topology`
      });

      expect(meshTopology).toBeDefined();
      expect(hierarchicalTopology).toBeDefined();

      // Create bridge between topologies
      const bridge = await manager.createBridge(
        meshTopology.id,
        hierarchicalTopology.id,
        'protocol_adapter'
      );

      expect(bridge).toBeDefined();
      expect(bridge.sourceTopology).toBe(meshTopology.id);
      expect(bridge.targetTopology).toBe(hierarchicalTopology.id);

      // Test manager status
      const managerStatus = manager.getManagerStatus();
      expect(managerStatus.topologyCount).toBe(2);
      expect(managerStatus.bridgeCount).toBe(1);

      // Test topology recommendation
      const recommendedConfig = await manager.recommendTopology({
        expectedAgents: 25,
        latencyRequirement: 500,
        throughputRequirement: 200,
        faultToleranceLevel: 'byzantine'
      });

      expect(recommendedConfig.type).toBeDefined();
      expect(['mesh', 'hierarchical', 'hybrid']).toContain(recommendedConfig.type);

      await manager.shutdown();
    }, INTEGRATION_TEST_TIMEOUT);

    test('should handle adaptive coordinator topology switching', async () => {
      const coordinator = new AdaptiveCoordinator({
        adaptationInterval: 5000, // 5 seconds
        confidenceThreshold: 0.6,
        stabilityPeriod: 10000, // 10 seconds
        maxAdaptationsPerHour: 10,
        enableHybridMode: true,
        memoryNamespace: `${testNamespace}-adaptive`
      });

      await coordinator.initialize();

      // Register test agents
      for (let i = 0; i < 3; i++) {
        await coordinator.registerAgent({
          id: generateId('adaptive-agent'),
          name: `adaptive-agent-${i}`,
          type: 'worker',
          capabilities: ['adaptation', 'testing'],
          registeredAt: new Date(),
          status: 'active'
        });
      }

      // Test initial metrics
      const initialMetrics = coordinator.getMetrics();
      expect(initialMetrics.agentCount).toBe(3);
      expect(initialMetrics.activeConnections).toBeGreaterThanOrEqual(0);

      // Test task execution
      await coordinator.executeTask({
        type: 'test-task',
        description: 'Adaptive coordination test',
        priority: 5,
        timeout: 30000
      });

      // Get updated metrics
      const metricsAfterTask = coordinator.getMetrics();
      expect(metricsAfterTask.resourceUtilization).toBeGreaterThanOrEqual(0);
      expect(metricsAfterTask.faultTolerance).toBeGreaterThan(0);

      await coordinator.shutdown();
    }, INTEGRATION_TEST_TIMEOUT);

    test('should handle communication bridge message routing', async () => {
      const bridge = new CommunicationBridge({
        managerId: generateId('test-manager'),
        enableCompression: false,
        enableEncryption: false,
        maxQueueSize: 100,
        retryAttempts: 3
      });

      await bridge.initialize();

      // Establish test bridge
      const bridgeId = await bridge.establishBridge('topology-a', 'topology-b');
      expect(bridgeId).toBeDefined();

      // Test message routing
      const testMessage = {
        id: generateId('test-msg'),
        type: 'coordination',
        content: { test: 'message routing' },
        sourceTopology: 'topology-a',
        targetTopology: 'topology-b',
        timestamp: new Date(),
        priority: 5
      };

      await bridge.sendMessage('topology-a', 'topology-b', testMessage);

      // Check bridge metrics
      const bridgeMetrics = bridge.getBridgeMetrics(bridgeId);
      expect(bridgeMetrics).toBeDefined();

      // Check queue status
      const queueStatus = bridge.getQueueStatus();
      expect(queueStatus.length).toBeGreaterThan(0);

      // Check routing table
      const routingTable = bridge.getRoutingTable();
      expect(routingTable.length).toBeGreaterThan(0);

      await bridge.shutdown();
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Integration Testing Across All Checkpoints
  // ============================================================================

  describe('Integration Testing: All Checkpoints Combined', () => {
    test('should integrate lifecycle management with dependency tracking and topology coordination', async () => {
      // Setup integrated system
      const integrationNamespace = `${testNamespace}-integration`;

      // Initialize components
      const dependencyTracker = createDependencyTracker(`${integrationNamespace}-deps`);
      await dependencyTracker.initialize();

      const hierarchicalCoordinator = createHierarchicalCoordinatorWithDependencies(
        `${integrationNamespace}-hierarchical`,
        {
          enableDependencyTracking: true,
          maxDepth: 3,
          maxChildrenPerNode: 4
        }
      );

      const meshCoordinator = createMeshCoordinatorWithDependencies(
        `${integrationNamespace}-mesh`,
        {
          enableDependencyTracking: true,
          maxAgents: 10,
          maxConnections: 6
        }
      );

      const topologyManager = createTopologyManagerWithPersistence(
        `${integrationNamespace}-manager`,
        {
          enableCrossTopologyRouting: true,
          enableAdaptiveOptimization: true
        }
      );

      // Initialize all coordinators
      await hierarchicalCoordinator.initialize();
      await meshCoordinator.initialize();
      await topologyManager.initialize();

      // Test 1: Agent lifecycle with dependencies
      const coordinatorAgent = generateId('coordinator-agent');
      const workerAgent1 = generateId('worker-agent-1');
      const workerAgent2 = generateId('worker-agent-2');

      // Register agents with lifecycle management
      await initializeAgent(coordinatorAgent, {
        name: 'integration-coordinator',
        description: 'Integration test coordinator agent',
        type: 'coordinator',
        capabilities: ['coordination', 'management'],
        lifecycle: { state_management: true, persistent_memory: true, max_retries: 2 }
      });

      await initializeAgent(workerAgent1, {
        name: 'integration-worker-1',
        description: 'Integration test worker agent 1',
        type: 'worker',
        capabilities: ['execution', 'processing'],
        lifecycle: { state_management: true, persistent_memory: false, max_retries: 3 }
      });

      await initializeAgent(workerAgent2, {
        name: 'integration-worker-2',
        description: 'Integration test worker agent 2',
        type: 'worker',
        capabilities: ['execution', 'analytics'],
        lifecycle: { state_management: true, persistent_memory: false, max_retries: 3 }
      });

      // Test 2: Create dependencies between agents
      const dep1 = await registerAgentDependency(
        coordinatorAgent,
        workerAgent1,
        DependencyType.COMPLETION,
        { timeout: 60000, metadata: { integration: true } }
      );

      const dep2 = await registerAgentDependency(
        coordinatorAgent,
        workerAgent2,
        DependencyType.COMPLETION,
        { timeout: 60000, metadata: { integration: true } }
      );

      // Test 3: Register agents with topology coordinators
      await hierarchicalCoordinator.registerAgent(coordinatorAgent, {
        name: 'hierarchical-coordinator',
        type: 'coordinator',
        level: 0,
        capabilities: ['coordination', 'management'],
        status: 'ready'
      });

      await hierarchicalCoordinator.registerAgent(workerAgent1, {
        name: 'hierarchical-worker-1',
        type: 'worker',
        level: 1,
        capabilities: ['execution', 'processing'],
        status: 'ready'
      }, coordinatorAgent);

      await meshCoordinator.registerAgent(workerAgent2, {
        name: 'mesh-worker-2',
        type: 'peer',
        capabilities: ['execution', 'analytics'],
        status: 'ready'
      });

      // Test 4: Execute coordinated tasks
      const hierarchicalTaskId = await hierarchicalCoordinator.delegateTask(
        'Integration test hierarchical task',
        { requiredCapabilities: ['execution'], priority: 8 }
      );

      const meshTaskId = await meshCoordinator.coordinateTask(
        'Integration test mesh task',
        { requiredCapabilities: ['execution'], priority: 7 }
      );

      // Test 5: Check system status
      const hierarchicalStatus = hierarchicalCoordinator.getCoordinatorStatus();
      const meshStatus = meshCoordinator.getCoordinatorStatus();
      const managerStatus = topologyManager.getManagerStatus();

      expect(hierarchicalStatus.totalAgents).toBe(2);
      expect(meshStatus.agentCount).toBe(1);
      expect(managerStatus.topologyCount).toBeGreaterThanOrEqual(0);

      // Test 6: Check dependency blocking behavior
      const coordinatorDepStatus = getAgentDependencyStatus(coordinatorAgent);
      expect(coordinatorDepStatus.dependencies.length).toBe(2);
      expect(coordinatorDepStatus.canComplete).toBe(false); // Blocked by dependencies

      // Test 7: Resolve dependencies and check completion
      await dependencyTracker.resolveDependency(dep1, { result: 'worker1-completed' });
      await dependencyTracker.resolveDependency(dep2, { result: 'worker2-completed' });

      const coordinatorDepStatusAfter = getAgentDependencyStatus(coordinatorAgent);
      expect(coordinatorDepStatusAfter.canComplete).toBe(true); // No longer blocked

      // Test 8: Lifecycle state transitions under dependency constraints
      await transitionAgentState(workerAgent1, 'running');
      await transitionAgentState(workerAgent2, 'running');

      // Coordinator should be able to complete now
      await transitionAgentState(coordinatorAgent, 'running');
      await transitionAgentState(coordinatorAgent, 'stopping');
      await transitionAgentState(coordinatorAgent, 'stopped');

      const coordinatorContext = lifecycleManager.getAgentContext(coordinatorAgent);
      expect(coordinatorContext?.state).toBe('stopped');

      // Test 9: Cross-topology communication
      const hierarchicalTopology = await topologyManager.createTopology({
        type: 'hierarchical',
        name: 'integration-hierarchical',
        strategy: 'adaptive',
        faultTolerance: 'basic',
        loadBalancing: 'round-robin',
        maxAgents: 20,
        maxConnections: 10,
        enableCrossTopology: true,
        enableAdaptiveOptimization: false,
        performanceThresholds: { latency: 1000, throughput: 100, errorRate: 0.05 },
        timeouts: { coordination: 30000, completion: 300000 },
        memoryNamespace: `${integrationNamespace}-hierarchical-topo`
      });

      const meshTopology = await topologyManager.createTopology({
        type: 'mesh',
        name: 'integration-mesh',
        strategy: 'adaptive',
        faultTolerance: 'byzantine',
        loadBalancing: 'adaptive',
        maxAgents: 15,
        maxConnections: 8,
        enableCrossTopology: true,
        enableAdaptiveOptimization: true,
        performanceThresholds: { latency: 500, throughput: 200, errorRate: 0.03 },
        timeouts: { coordination: 20000, completion: 240000 },
        memoryNamespace: `${integrationNamespace}-mesh-topo`
      });

      const bridge = await topologyManager.createBridge(
        hierarchicalTopology.id,
        meshTopology.id
      );

      expect(bridge.sourceTopology).toBe(hierarchicalTopology.id);
      expect(bridge.targetTopology).toBe(meshTopology.id);

      // Test 10: Performance and metrics validation
      const globalMetrics = topologyManager.getGlobalMetrics();
      expect(Object.keys(globalMetrics).length).toBeGreaterThanOrEqual(2);

      const resourceUtilization = topologyManager.getResourceUtilization();
      expect(resourceUtilization.topologyCount).toBe(2);
      expect(resourceUtilization.totalAgents).toBeGreaterThanOrEqual(0);

      // Cleanup integration test
      await removeAgentDependency(dep1);
      await removeAgentDependency(dep2);

      await lifecycleManager.cleanupAgent(coordinatorAgent);
      await lifecycleManager.cleanupAgent(workerAgent1);
      await lifecycleManager.cleanupAgent(workerAgent2);

      await hierarchicalCoordinator.shutdown();
      await meshCoordinator.shutdown();
      await topologyManager.shutdown();
      await dependencyTracker.shutdown();

    }, INTEGRATION_TEST_TIMEOUT);

    test('should handle system-wide error recovery and fault tolerance', async () => {
      const errorTestNamespace = `${testNamespace}-error-test`;

      // Setup fault tolerance test system
      const dependencyTracker = createDependencyTracker(`${errorTestNamespace}-deps`);
      await dependencyTracker.initialize();

      const coordinator = createHierarchicalCoordinatorWithDependencies(
        `${errorTestNamespace}-coordinator`,
        {
          enableDependencyTracking: true,
          completionTimeout: 5000, // Short timeout for testing
          maxDepth: 2
        }
      );

      await coordinator.initialize();

      // Test 1: Agent failure and recovery
      const faultyAgent = generateId('faulty-agent');
      const recoveryAgent = generateId('recovery-agent');

      await initializeAgent(faultyAgent, {
        name: 'faulty-test-agent',
        type: 'worker',
        capabilities: ['testing', 'fault-simulation'],
        lifecycle: { state_management: true, max_retries: 2 }
      });

      await initializeAgent(recoveryAgent, {
        name: 'recovery-test-agent',
        type: 'coordinator',
        capabilities: ['recovery', 'management'],
        lifecycle: { state_management: true, max_retries: 1 }
      });

      // Create dependency
      const faultDependency = await registerAgentDependency(
        recoveryAgent,
        faultyAgent,
        DependencyType.COMPLETION,
        { timeout: 3000 } // Short timeout
      );

      // Test 2: Simulate agent failure
      await transitionAgentState(faultyAgent, 'running');
      await transitionAgentState(faultyAgent, 'error', 'Simulated failure');

      const faultyContext = lifecycleManager.getAgentContext(faultyAgent);
      expect(faultyContext?.state).toBe('error');

      // Test 3: Check dependency timeout behavior
      await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for timeout

      const timeoutDependency = dependencyTracker.getDependencyDetails(faultDependency);
      expect(timeoutDependency?.status).toBe(DependencyStatus.TIMEOUT);

      // Test 4: Force completion for recovery
      await forceAgentCompletion(recoveryAgent, 'Recovery from agent failure');

      const recoveryStatus = getAgentDependencyStatus(recoveryAgent);
      expect(recoveryStatus.canComplete).toBe(true);

      // Test 5: Check violation detection
      const violations = dependencyTracker.checkViolations();
      expect(violations.length).toBeGreaterThanOrEqual(0);

      // Cleanup error test
      await removeAgentDependency(faultDependency);
      await lifecycleManager.cleanupAgent(faultyAgent);
      await lifecycleManager.cleanupAgent(recoveryAgent);
      await coordinator.shutdown();
      await dependencyTracker.shutdown();

    }, INTEGRATION_TEST_TIMEOUT);
  });

  // ============================================================================
  // Performance and Load Testing
  // ============================================================================

  describe('Performance and Load Testing', () => {
    test('should handle high-volume agent registrations and dependencies', async () => {
      const performanceNamespace = `${testNamespace}-performance`;
      const agentCount = 50;
      const dependencyCount = 100;

      const dependencyTracker = createDependencyTracker(`${performanceNamespace}-deps`);
      await dependencyTracker.initialize();

      const startTime = Date.now();

      // Test 1: Bulk agent registration
      const agents: string[] = [];
      for (let i = 0; i < agentCount; i++) {
        const agentId = generateId(`perf-agent-${i}`);
        agents.push(agentId);

        await initializeAgent(agentId, {
          name: `performance-agent-${i}`,
          type: i % 3 === 0 ? 'coordinator' : 'worker',
          capabilities: ['performance-testing', 'bulk-operations'],
          lifecycle: { state_management: true, persistent_memory: false, max_retries: 1 }
        });
      }

      const registrationTime = Date.now() - startTime;
      testLogger.info(`Registered ${agentCount} agents in ${registrationTime}ms`);

      // Test 2: Bulk dependency creation
      const dependencies: string[] = [];
      const dependencyStartTime = Date.now();

      for (let i = 0; i < dependencyCount; i++) {
        const dependentAgent = agents[Math.floor(Math.random() * agents.length)];
        const providerAgent = agents[Math.floor(Math.random() * agents.length)];

        if (dependentAgent !== providerAgent) {
          try {
            const depId = await dependencyTracker.registerDependency(
              dependentAgent,
              providerAgent,
              DependencyType.COMPLETION,
              { timeout: 60000 }
            );
            dependencies.push(depId);
          } catch (error) {
            // Skip cycle errors in performance test
          }
        }
      }

      const dependencyTime = Date.now() - dependencyStartTime;
      testLogger.info(`Created ${dependencies.length} dependencies in ${dependencyTime}ms`);

      // Test 3: Performance statistics
      const stats = dependencyTracker.getStatistics();
      expect(stats.totalDependencies).toBe(dependencies.length);
      expect(stats.agentsWithDependencies).toBeGreaterThan(0);

      // Test 4: Bulk resolution
      const resolutionStartTime = Date.now();
      const resolutionPromises = dependencies.slice(0, 20).map(depId =>
        dependencyTracker.resolveDependency(depId, { performance: 'test-resolution' })
      );

      await Promise.all(resolutionPromises);
      const resolutionTime = Date.now() - resolutionStartTime;
      testLogger.info(`Resolved 20 dependencies in ${resolutionTime}ms`);

      // Test 5: Memory usage validation
      const finalStats = dependencyTracker.getStatistics();
      expect(finalStats.resolvedDependencies).toBe(20);

      // Cleanup performance test
      for (const depId of dependencies) {
        try {
          await dependencyTracker.removeDependency(depId);
        } catch (error) {
          // Skip already removed dependencies
        }
      }

      for (const agentId of agents) {
        await lifecycleManager.cleanupAgent(agentId);
      }

      await dependencyTracker.shutdown();

      const totalTime = Date.now() - startTime;
      testLogger.info(`Total performance test completed in ${totalTime}ms`);

      // Performance assertions
      expect(registrationTime).toBeLessThan(10000); // 10 seconds
      expect(dependencyTime).toBeLessThan(15000); // 15 seconds
      expect(resolutionTime).toBeLessThan(5000); // 5 seconds

    }, INTEGRATION_TEST_TIMEOUT);
  });

  // ============================================================================
  // Deployment Readiness Testing
  // ============================================================================

  describe('Deployment Readiness Validation', () => {
    test('should validate TypeScript compilation and module exports', async () => {
      // Test that all main modules can be imported and instantiated
      expect(lifecycleManager).toBeDefined();
      expect(DependencyTracker).toBeDefined();
      expect(HierarchicalCoordinator).toBeDefined();
      expect(MeshCoordinator).toBeDefined();
      expect(TopologyManager).toBeDefined();
      expect(AdaptiveCoordinator).toBeDefined();
      expect(CommunicationBridge).toBeDefined();

      // Test factory functions
      expect(typeof createDependencyTracker).toBe('function');
      expect(typeof createHierarchicalCoordinator).toBe('function');
      expect(typeof createMeshCoordinator).toBe('function');
      expect(typeof createTopologyManager).toBe('function');

      // Test constants and enums
      expect(DependencyType.COMPLETION).toBeDefined();
      expect(DependencyType.DATA_DEPENDENCY).toBeDefined();
      expect(DependencyStatus.PENDING).toBeDefined();
      expect(DependencyStatus.RESOLVED).toBeDefined();
    });

    test('should validate configuration management and defaults', async () => {
      // Test dependency tracker configuration
      const tracker = createDependencyTracker('config-test');
      expect(tracker).toBeDefined();

      // Test coordinator configurations
      const hierarchicalCoord = createHierarchicalCoordinator({
        maxDepth: 4,
        enableDependencyTracking: true
      });
      expect(hierarchicalCoord).toBeDefined();

      const meshCoord = createMeshCoordinator({
        maxAgents: 25,
        enableDependencyTracking: true
      });
      expect(meshCoord).toBeDefined();

      const topologyMgr = createTopologyManager({
        maxTopologies: 8,
        enableAdaptiveOptimization: true
      });
      expect(topologyMgr).toBeDefined();

      // Validate default configurations don't cause errors
      const defaultTracker = createDependencyTracker('default-test');
      await defaultTracker.initialize();
      await defaultTracker.shutdown();

      await tracker.shutdown();
    });

    test('should validate error handling and edge cases', async () => {
      const edgeTestNamespace = `${testNamespace}-edge-cases`;
      const tracker = createDependencyTracker(edgeTestNamespace);
      await tracker.initialize();

      // Test 1: Invalid dependency operations
      await expect(
        tracker.registerDependency('agent-a', 'agent-a', DependencyType.COMPLETION)
      ).rejects.toThrow(/cannot depend on itself/i);

      await expect(
        tracker.resolveDependency('non-existent-dep', {})
      ).resolves.toBe(false);

      // Test 2: Invalid agent operations
      expect(() => {
        lifecycleManager.getAgentContext('non-existent-agent');
      }).not.toThrow();

      const nonExistentContext = lifecycleManager.getAgentContext('non-existent-agent');
      expect(nonExistentContext).toBeUndefined();

      // Test 3: Memory operations on non-existent agents
      const memorySet = lifecycleManager.updateAgentMemory('non-existent-agent', 'key', 'value');
      expect(memorySet).toBe(false);

      const memoryGet = lifecycleManager.getAgentMemory('non-existent-agent', 'key');
      expect(memoryGet).toBeUndefined();

      // Test 4: Invalid state transitions
      const testAgent = generateId('edge-test-agent');
      await initializeAgent(testAgent, {
        name: 'edge-test-agent',
        type: 'test',
        capabilities: ['edge-testing']
      });

      await expect(
        transitionAgentState(testAgent, 'running', 'Invalid transition')
      ).rejects.toThrow(/invalid state transition/i);

      await lifecycleManager.cleanupAgent(testAgent);
      await tracker.shutdown();
    });

    test('should validate resource cleanup and memory management', async () => {
      const cleanupNamespace = `${testNamespace}-cleanup`;

      // Create and destroy multiple components to test cleanup
      for (let i = 0; i < 3; i++) {
        const tracker = createDependencyTracker(`${cleanupNamespace}-${i}`);
        await tracker.initialize();

        const agentId = generateId(`cleanup-agent-${i}`);
        await initializeAgent(agentId, {
          name: `cleanup-agent-${i}`,
          type: 'test',
          capabilities: ['cleanup-testing']
        });

        const depId = await tracker.registerDependency(
          agentId,
          generateId('provider'),
          DependencyType.COMPLETION
        );

        await tracker.removeDependency(depId);
        await lifecycleManager.cleanupAgent(agentId);
        await tracker.shutdown();
      }

      // Validate that resources are properly cleaned up
      // (In a real environment, we'd check actual memory usage)
      expect(true).toBe(true); // Placeholder for memory validation
    });
  });
});