/**
 * V1 Transparency System Integration Tests
 *
 * Comprehensive tests for V1 coordination system transparency features.
 * Validates integration with QueenAgent and MeshCoordinator systems.
 *
 * @module tests/integration/v1-transparency-system.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { V1TransparencySystem } from '../../src/coordination/v1-transparency/v1-transparency-adapter.js';
import { Logger } from '../../src/core/logger.js';

// Mock implementations for testing
import type { QueenAgent } from '../../src/coordination/queen-agent.js';
import type { MeshCoordinator } from '../../src/agents/mesh-coordinator.js';
import type { CoordinationMetricsCollector } from '../../src/coordination/metrics.js';
import type {
  V1AgentInfo,
  V1TransparencyEvent,
  V1TransparencyMetrics,
  IV1TransparencySystem
} from '../../src/coordination/v1-transparency/interfaces/v1-transparency-system.js';
import { V1ToV2Bridge, V1ToV2BridgeFactory } from '../../src/coordination/v1-transparency/v1-to-v2-bridge.js';

// Mock V1 coordinators
class MockQueenAgent extends EventEmitter {
  public readonly id: string;
  public readonly type = 'queen-agent';

  constructor() {
    super();
    this.id = 'mock-queen-' + Math.random().toString(36).substr(2, 9);
  }

  async initialize(): Promise<void> {
    // Mock initialization
    setTimeout(() => {
      this.emit('initialized', { coordinatorId: this.id });
    }, 100);
  }

  spawnWorker(workerId: string, workerType: string, capabilities: any): void {
    this.emit('workerSpawned', {
      workerId,
      workerType,
      capabilities,
      timestamp: new Date(),
    });
  }

  updateWorkerStatus(workerId: string, newStatus: string, reason?: string): void {
    this.emit('workerStatusChanged', {
      workerId,
      newStatus,
      reason,
      timestamp: new Date(),
    });
  }

  delegateTask(taskId: string, workerId: string, taskType: string, description: string): void {
    this.emit('taskDelegated', {
      taskId,
      workerId,
      taskType,
      description,
      timestamp: new Date(),
    });
  }

  completeTask(taskId: string, workerId: string, result: any, confidence?: number): void {
    this.emit('taskCompleted', {
      taskId,
      workerId,
      result,
      confidence: confidence || 0.8,
      timestamp: new Date(),
    });
  }

  failTask(taskId: string, workerId: string, error: Error): void {
    this.emit('taskFailed', {
      taskId,
      workerId,
      error: error.message,
      timestamp: new Date(),
    });
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown', { coordinatorId: this.id });
  }
}

class MockMeshCoordinator extends EventEmitter {
  public readonly id: string;
  public readonly type = 'mesh-coordinator';

  constructor() {
    super();
    this.id = 'mock-mesh-' + Math.random().toString(36).substr(2, 9);
  }

  async initialize(): Promise<void> {
    setTimeout(() => {
      this.emit('initialized', { coordinatorId: this.id });
    }, 100);
  }

  addAgent(agentId: string, agentInfo: any): void {
    this.emit('agentAdded', {
      agentId,
      agentInfo,
      timestamp: new Date(),
    });
  }

  updateAgentStatus(agentId: string, newStatus: string): void {
    this.emit('agentStatusChanged', {
      agentId,
      newStatus,
      timestamp: new Date(),
    });
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown', { coordinatorId: this.id });
  }
}

class MockMetricsCollector {
  private metrics: any = {
    taskMetrics: {
      totalTasks: 0,
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    },
    agentMetrics: {
      totalAgents: 0,
      activeAgents: 0,
    },
    performanceMetrics: {
      averageResponseTime: 150,
      memoryUsage: 128,
      cpuUsage: 45,
    },
  };

  getMetrics(): any {
    return this.metrics;
  }

  recordTaskCompleted(): void {
    this.metrics.taskMetrics.completedTasks++;
  }

  recordTaskFailed(): void {
    this.metrics.taskMetrics.failedTasks++;
  }

  incrementActiveTasks(): void {
    this.metrics.taskMetrics.activeTasks++;
  }

  decrementActiveTasks(): void {
    this.metrics.taskMetrics.activeTasks--;
  }

  // Additional CoordinationMetricsCollector interface methods
  recordAgentSpawned(agentId: string, agentType: string): void {
    this.metrics.agentMetrics.totalAgents++;
    this.metrics.agentMetrics.activeAgents++;
  }

  recordAgentRemoved(agentId: string): void {
    this.metrics.agentMetrics.activeAgents--;
  }

  recordTaskStarted(taskId: string): void {
    this.metrics.taskMetrics.activeTasks++;
  }

  updatePerformanceMetrics(responseTime: number, memoryUsage: number, cpuUsage: number): void {
    this.metrics.performanceMetrics.averageResponseTime = responseTime;
    this.metrics.performanceMetrics.memoryUsage = memoryUsage;
    this.metrics.performanceMetrics.cpuUsage = cpuUsage;
  }

  reset(): void {
    this.metrics = {
      taskMetrics: {
        totalTasks: 0,
        activeTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
      },
      agentMetrics: {
        totalAgents: 0,
        activeAgents: 0,
      },
      performanceMetrics: {
        averageResponseTime: 150,
        memoryUsage: 128,
        cpuUsage: 45,
      },
    };
  }
}

describe('V1 Transparency System Integration', () => {
  let transparencySystem: any;
  let mockQueenAgent: MockQueenAgent;
  let mockMeshCoordinator: MockMeshCoordinator;
  let mockMetricsCollector: MockMetricsCollector;
  let logger: Logger;

  beforeAll(async () => {
    logger = new Logger({
      level: 'error', // Reduce log noise during tests
      format: 'text',
      destination: 'console',
    });

    transparencySystem = new V1TransparencySystem(logger);
    await transparencySystem.initialize({
      enableRealTimeMonitoring: true,
      enableEventStreaming: true,
      enablePerformanceMonitoring: true,
      enableHealthMonitoring: true,
      enableTaskTracking: true,
      eventRetentionHours: 24,
      metricsCollectionIntervalMs: 5000,
      enableDependencyTracking: true,
      enableCoordinatorMonitoring: true,
      maxEventsInMemory: 1000,
    });
  });

  afterAll(async () => {
    await transparencySystem.cleanup();
  });

  beforeEach(() => {
    mockQueenAgent = new MockQueenAgent();
    mockMeshCoordinator = new MockMeshCoordinator();
    mockMetricsCollector = new MockMetricsCollector();
  });

  describe('V1 Coordinator Registration', () => {
    it('should register QueenAgent successfully', async () => {
      const coordinatorId = 'test-queen-agent';

      transparencySystem.registerQueenAgent(coordinatorId, mockQueenAgent);
      transparencySystem.registerMetricsCollector(coordinatorId, mockMetricsCollector);

      const coordinators = await transparencySystem.getAllCoordinators();
      const coordinator = coordinators.find(c => c.coordinatorId === coordinatorId);

      expect(coordinator).toBeDefined();
      expect(coordinator?.coordinatorId).toBe(coordinatorId);
      expect(coordinator?.coordinatorType).toBe('queen-agent');
      expect(coordinator?.topology).toBe('hierarchical');
    });

    it('should register MeshCoordinator successfully', async () => {
      const coordinatorId = 'test-mesh-coordinator';

      transparencySystem.registerMeshCoordinator(coordinatorId, mockMeshCoordinator);

      const coordinators = await transparencySystem.getAllCoordinators();
      const coordinator = coordinators.find(c => c.coordinatorId === coordinatorId);

      expect(coordinator).toBeDefined();
      expect(coordinator?.coordinatorId).toBe(coordinatorId);
      expect(coordinator?.coordinatorType).toBe('mesh-coordinator');
      expect(coordinator?.topology).toBe('mesh');
    });

    it('should handle multiple coordinators', async () => {
      transparencySystem.registerQueenAgent('queen-1', mockQueenAgent);
      transparencySystem.registerMeshCoordinator('mesh-1', mockMeshCoordinator);

      const coordinators = await transparencySystem.getAllCoordinators();
      expect(coordinators).toHaveLength(2);

      const queenCount = coordinators.filter(c => c.coordinatorType === 'queen-agent').length;
      const meshCount = coordinators.filter(c => c.coordinatorType === 'mesh-coordinator').length;
      expect(queenCount).toBe(1);
      expect(meshCount).toBe(1);
    });
  });

  describe('Agent Lifecycle Monitoring', () => {
    beforeEach(() => {
      transparencySystem.registerQueenAgent('test-coordinator', mockQueenAgent);
      transparencySystem.registerMetricsCollector('test-coordinator', mockMetricsCollector);
    });

    it('should track agent spawning', async () => {
      mockQueenAgent.spawnWorker('worker-1', 'coder', {
        type: 'coder',
        skills: ['typescript', 'react'],
        maxConcurrentTasks: 3,
        priority: 8,
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const agents = await transparencySystem.getAllAgents();
      const worker = agents.find(a => a.agentId === 'worker-1');

      expect(worker).toBeDefined();
      expect(worker?.agentId).toBe('worker-1');
      expect(worker?.agentType).toBe('coder');
      expect(worker?.status).toBe('idle');
      expect(worker?.coordinatorId).toBe('test-coordinator');
    });

    it('should track agent status changes', async () => {
      mockQueenAgent.spawnWorker('worker-2', 'tester', {
        type: 'tester',
        skills: ['jest', 'testing'],
        maxConcurrentTasks: 2,
        priority: 7,
      });

      // Wait for spawning
      await new Promise(resolve => setTimeout(resolve, 100));

      mockQueenAgent.updateWorkerStatus('worker-2', 'busy', 'Working on test');

      // Wait for status update
      await new Promise(resolve => setTimeout(resolve, 100));

      const agents = await transparencySystem.getAllAgents();
      const worker = agents.find(a => a.agentId === 'worker-2');

      expect(worker).toBeDefined();
      expect(worker?.status).toBe('busy');
    });

    it('should track task delegation', async () => {
      mockQueenAgent.spawnWorker('worker-3', 'reviewer', {
        type: 'reviewer',
        skills: ['code-review'],
        maxConcurrentTasks: 1,
        priority: 6,
      });

      // Wait for spawning
      await new Promise(resolve => setTimeout(resolve, 100));

      mockQueenAgent.delegateTask('task-1', 'worker-3', 'review', 'Review component');

      // Wait for task delegation
      await new Promise(resolve => setTimeout(resolve, 100));

      const tasks = await transparencySystem.getAllTasks();
      const task = tasks.find(t => t.taskId === 'task-1');

      expect(task).toBeDefined();
      expect(task?.taskId).toBe('task-1');
      expect(task?.taskType).toBe('review');
      expect(task?.status).toBe('active');
      expect(task?.assignedAgents).toContain('worker-3');
    });

    it('should track task completion', async () => {
      mockQueenAgent.spawnWorker('worker-4', 'writer', {
        type: 'writer',
        skills: ['documentation'],
        maxConcurrentTasks: 2,
        priority: 5,
      });

      mockQueenAgent.delegateTask('task-2', 'worker-4', 'write', 'Write documentation');

      // Wait for delegation
      await new Promise(resolve => setTimeout(resolve, 100));

      mockQueenAgent.completeTask('task-2', 'worker-4', {
        output: 'Documentation written',
        quality: 0.9,
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      const tasks = await transparencySystem.getAllTasks();
      const task = tasks.find(t => t.taskId === 'task-2');

      expect(task).toBeDefined();
      expect(task?.status).toBe('completed');
      expect(task?.result).toBeDefined();
      expect(task?.quality.confidence).toBe(0.9);
    });

    it('should track task failures', async () => {
      mockQueenAgent.spawnWorker('worker-5', 'analyzer', {
        type: 'analyzer',
        skills: ['analysis'],
        maxConcurrentTasks: 1,
        priority: 4,
      });

      mockQueenAgent.delegateTask('task-3', 'worker-5', 'analyze', 'Analyze code');

      // Wait for delegation
      await new Promise(resolve => setTimeout(resolve, 100));

      mockQueenAgent.failTask('task-3', 'worker-5', new Error('Analysis failed'));

      // Wait for failure
      await new Promise(resolve => setTimeout(resolve, 100));

      const tasks = await transparencySystem.getAllTasks();
      const task = tasks.find(t => t.taskId === 'task-3');

      expect(task).toBeDefined();
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('Analysis failed');
    });
  });

  describe('Event Streaming', () => {
    beforeEach(() => {
      transparencySystem.registerQueenAgent('test-coordinator', mockQueenAgent);
      transparencySystem.registerMetricsCollector('test-coordinator', mockMetricsCollector);
    });

    it('should collect transparency events', async () => {
      mockQueenAgent.spawnWorker('worker-1', 'coder', {
        type: 'coder',
        skills: ['javascript'],
        maxConcurrentTasks: 3,
        priority: 8,
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const events = await transparencySystem.getRecentEvents(10);
      expect(events.length).toBeGreaterThan(0);

      const spawnEvent = events.find(e => e.eventType === 'agent_spawned');
      expect(spawnEvent).toBeDefined();
      expect(spawnEvent?.eventData.agentId).toBe('worker-1');
    });

    it('should filter events by type', async () => {
      mockQueenAgent.spawnWorker('worker-1', 'coder', {
        type: 'coder',
        skills: ['javascript'],
        maxConcurrentTasks: 3,
        priority: 8,
      });

      mockQueenAgent.updateWorkerStatus('worker-1', 'busy');

      await new Promise(resolve => setTimeout(resolve, 200));

      const spawnEvents = await transparencySystem.getRecentEvents(10, 'agent_spawned');
      const statusEvents = await transparencySystem.getRecentEvents(10, 'agent_status_changed');

      expect(spawnEvents.length).toBeGreaterThan(0);
      expect(statusEvents.length).toBeGreaterThan(0);

      expect(spawnEvents.every(e => e.eventType === 'agent_spawned')).toBe(true);
      expect(statusEvents.every(e => e.eventType === 'agent_status_changed')).toBe(true);
    });

    it('should get events for specific agent', async () => {
      mockQueenAgent.spawnWorker('worker-1', 'coder', {
        type: 'coder',
        skills: ['javascript'],
        maxConcurrentTasks: 3,
        priority: 8,
      });

      mockQueenAgent.updateWorkerStatus('worker-1', 'busy');
      mockQueenAgent.updateWorkerStatus('worker-1', 'idle');

      await new Promise(resolve => setTimeout(resolve, 300));

      const agentEvents = await transparencySystem.getAgentEvents('worker-1');
      expect(agentEvents.length).toBe(3);

      const eventTypes = agentEvents.map(e => e.eventType);
      expect(eventTypes).toContain('agent_spawned');
      expect(eventTypes).toContain('agent_status_changed');
    });

    it('should limit event retention', async () => {
      // Create more events than the retention limit
      for (let i = 0; i < 150; i++) {
        mockQueenAgent.spawnWorker(`worker-${i}`, 'worker', {
          type: 'worker',
          skills: [],
          maxConcurrentTasks: 1,
          priority: 5,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const events = await transparencySystem.getRecentEvents(200);
      expect(events.length).toBeLessThanOrEqual(100); // Default maxEventsInMemory
    });
  });

  describe('Metrics Collection', () => {
    beforeEach(() => {
      transparencySystem.registerQueenAgent('test-coordinator', mockQueenAgent);
      transparencySystem.registerMeshCoordinator('test-mesh', mockMeshCoordinator);
      transparencySystem.registerMetricsCollector('test-coordinator', mockMetricsCollector);
    });

    it('should collect transparency metrics', async () => {
      const metrics = await transparencySystem.getTransparencyMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.coordinators.total).toBe(2);
      expect(metrics.agents.total).toBe(0); // No agents spawned yet
      expect(metrics.tasks.total).toBe(0); // No tasks created yet
    });

    it('should track coordinator metrics', async () => {
      const metrics = await transparencySystem.getTransparencyMetrics();

      expect(metrics.coordinators.byType['queen-agent']).toBe(1);
      expect(metrics.coordinators.byType['mesh-coordinator']).toBe(1);
      expect(metrics.coordinators.byTopology['hierarchical']).toBe(1);
      expect(metrics.coordinators.byTopology['mesh']).toBe(1);
    });

    it('should update metrics when agents are added', async () => {
      mockQueenAgent.spawnWorker('worker-1', 'coder', {
        type: 'coder',
        skills: ['javascript'],
        maxConcurrentTasks: 3,
        priority: 8,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = await transparencySystem.getTransparencyMetrics();
      expect(metrics.agents.total).toBe(1);
      expect(metrics.agents.byType['coder']).toBe(1);
    });

    it('should track task metrics', async () => {
      mockQueenAgent.spawnWorker('worker-1', 'coder', {
        type: 'coder',
        skills: ['javascript'],
        maxConcurrentTasks: 3,
        priority: 8,
      });

      mockQueenAgent.delegateTask('task-1', 'worker-1', 'code', 'Write function');

      mockQueenAgent.completeTask('task-1', 'worker-1', { output: 'function code' });

      await new Promise(resolve => setTimeout(resolve, 200));

      const metrics = await transparencySystem.getTransparencyMetrics();
      expect(metrics.tasks.total).toBe(1);
      expect(metrics.tasks.completed).toBe(1);
      expect(metrics.tasks.successRate).toBe(100);
    });
  });

  describe('V1-to-V2 Bridge', () => {
    let mockV1System: any;

    beforeEach(() => {
      mockV1System = new V1TransparencySystem(logger);
      mockV1System.initialize({
        enableRealTimeMonitoring: true,
        enableEventStreaming: true,
        eventRetentionHours: 24,
        metricsCollectionIntervalMs: 5000,
        enableDependencyTracking: false,
        enableCoordinatorMonitoring: false,
        enablePerformanceMonitoring: false,
        enableHealthMonitoring: false,
        enableTaskTracking: false,
        maxEventsInMemory: 1000,
      });
    });

    afterEach(async () => {
      await mockV1System.cleanup();
    });

    it('should convert V1 agents to V2 hierarchy nodes', () => {
      const v1Agents: V1AgentInfo[] = [
        {
          agentId: 'agent-1',
          agentType: 'coder',
          level: 2,
          coordinatorId: 'coordinator-1',
          peerAgentIds: [],
          childAgentIds: [],
          status: 'idle',
          taskStats: { completed: 5, failed: 1, total: 6, successRate: 83.3 },
          health: { successRate: 90, averageResponseTime: 150, errorCount: 1, consecutiveFailures: 0, lastHealthCheck: new Date() },
          resources: { memoryUsage: 128, cpuUsage: 45, networkIO: 1024 },
          timestamps: { spawnedAt: new Date(), lastActivity: new Date(), lastStateChange: new Date() },
          topology: { connections: 2, maxConnections: 5, workload: 0.6 },
          capabilities: { type: 'coder', skills: ['javascript'], maxConcurrentTasks: 3, priority: 8 },
          dependencies: { dependsOn: [], blocksCompletion: [], waitingFor: [] },
          currentTasks: [],
        },
      ];

      const hierarchyNodes = V1ToV2Bridge.convertV1AgentsToHierarchy(v1Agents);

      expect(hierarchyNodes).toHaveLength(1);
      expect(hierarchyNodes[0].agentId).toBe('agent-1');
      expect(hierarchyNodes[0].type).toBe('coder');
      expect(hierarchyNodes[0].level).toBe(2);
      expect(hierarchyNodes[0].parentAgentId).toBe('coordinator-1');
      expect(hierarchyNodes[0].state).toBe('idle');
    });

    it('should convert V1 events to V2 lifecycle events', () => {
      const v1Events: V1TransparencyEvent[] = [
        {
          eventId: 'event-1',
          timestamp: new Date(),
          eventType: 'agent_spawned',
          eventData: { agentId: 'agent-1', coordinatorId: 'coordinator-1' },
          source: { component: 'V1System', instance: 'test' },
          severity: 'info',
          category: 'lifecycle',
        },
        {
          eventId: 'event-2',
          timestamp: new Date(),
          eventType: 'task_completed',
          eventData: { taskId: 'task-1', agentId: 'agent-1' },
          source: { component: 'V1System', instance: 'test' },
          severity: 'info',
          category: 'coordination',
        },
      ];

      const lifecycleEvents = V1ToV2Bridge.convertV1EventsToLifecycle(v1Events);

      expect(lifecycleEvents).toHaveLength(2);
      expect(lifecycleEvents[0].eventType).toBe('spawned');
      expect(lifecycleEvents[1].eventType).toBe('task_completed');
    });

    it('should convert V1 metrics to V2 metrics', () => {
      const v1Metrics: V1TransparencyMetrics = {
        timestamp: new Date(),
        coordinators: { total: 1, active: 1, byType: { 'queen-agent': 1 }, byTopology: { hierarchical: 1 } },
        agents: { total: 5, active: 3, idle: 2, busy: 0, degraded: 0, offline: 0, byType: { 'coder': 3, 'tester': 2 }, byCoordinator: { 'coordinator-1': 5 }, averageHealth: 90, utilizationRate: 60 },
        tasks: { total: 10, active: 4, completed: 6, failed: 0, cancelled: 0, byType: { 'task-1': 10 }, byPriority: { 'high': 2, 'medium': 8 }, averageDuration: 150, successRate: 100 },
        performance: { taskThroughput: 15, averageResponseTime: 150, memoryUsage: 256, cpuUsage: 45, networkIO: 1024, errorRate: 0 },
        resources: { totalResources: 1000, allocatedResources: 256, freeResources: 744, resourceUtilization: 25.6, lockContention: 0 },
        events: { totalEvents: 100, eventsByType: { 'agent_spawned': 10 }, eventsBySeverity: { 'info': 90, 'warning': 10 }, eventsByCategory: { 'lifecycle': 50, 'coordination': 50 }, eventsPerSecond: 2.5 },
      };

      const v2Metrics = V1ToV2Bridge.convertV1MetricsToV2(v1Metrics);

      expect(v2Metrics.totalAgents).toBe(5);
      expect(v2Metrics.agentsByLevel[2]).toBe(5);
      expect(v2Metrics.totalTokensConsumed).toBeGreaterThan(0);
      expect(v2Metrics.hierarchyDepth).toBe(2);
    });

    it('should create bridge interface', async () => {
      const bridge = V1ToV2BridgeFactory.createBridge(mockV1System);

      expect(bridge).toBeDefined();
      expect(typeof bridge.getHierarchyNodes).toBe('function');
      expect(typeof bridge.getAgentStatuses).toBe('function');
      expect(typeof bridge.getLifecycleEvents).toBe('function');
      expect(typeof bridge.getMetrics).toBe('function');

      // Test the bridge interface
      const hierarchyNodes = await bridge.getHierarchyNodes();
      expect(Array.isArray(hierarchyNodes)).toBe(true);

      const agentStatuses = await bridge.getAgentStatuses();
      expect(Array.isArray(agentStatuses)).toBe(true);

      const lifecycleEvents = await bridge.getLifecycleEvents();
      expect(Array.isArray(lifecycleEvents)).toBe(true);

      const metrics = await bridge.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.totalAgents).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Real-time Monitoring', () => {
    beforeEach(() => {
      transparencySystem.registerQueenAgent('test-coordinator', mockQueenAgent);
      transparencySystem.startMonitoring();
    });

    afterEach(async () => {
      await transparencySystem.stopMonitoring();
    });

    it('should start and stop monitoring', async () => {
      // Monitoring should be active after startMonitoring()
      expect(transparencySystem['isMonitoring']).toBe(true);

      await transparencySystem.stopMonitoring();
      expect(transparencySystem['isMonitoring']).toBe(false);
    });

    it('should perform periodic metrics collection', async () => {
      const collectMetricsSpy = jest.spyOn(transparencySystem as any, 'collectMetrics');

      // Wait for at least one metrics collection cycle
      await new Promise(resolve => setTimeout(resolve, 6000));

      expect(collectMetricsSpy).toHaveBeenCalled();
    });

    it('should notify event listeners in real-time', async () => {
      const listener = {
        onTransparencyEvent: jest.fn(),
      };

      await transparencySystem.registerEventListener(listener);

      mockQueenAgent.spawnWorker('realtime-agent', 'coder', {
        type: 'coder',
        skills: ['javascript'],
        maxConcurrentTasks: 3,
        priority: 8,
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener.onTransparencyEvent).toHaveBeenCalled();
      const eventCall = listener.onTransparencyEvent.mock.calls[0][0];
      expect(eventCall.eventType).toBe('agent_spawned');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid agent IDs gracefully', async () => {
      await expect(
        transparencySystem.getAgentInfo('non-existent-agent')
      ).rejects.toThrow('Agent non-existent-agent not found');
    });

    it('should handle invalid task IDs gracefully', async () => {
      await expect(
        transparencySystem.getTaskInfo('non-existent-task')
      ).rejects.toThrow('Task non-existent-task not found');
    });

    it('should handle invalid coordinator IDs gracefully', async () => {
      await expect(
        transparencySystem.getCoordinatorInfo('non-existent-coordinator')
      ).rejects.toThrow('Coordinator non-existent-coordinator not found');
    });

    it('should handle coordinator errors', async () => {
      const errorListener = jest.fn();
      await transparencySystem.registerEventListener({ onTransparencyEvent: errorListener });

      mockQueenAgent.emit('error', new Error('Coordinator error'));

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorListener).toHaveBeenCalled();
      const errorCall = errorListener.mock.calls[0][0];
      expect(errorCall.eventType).toBe('error_occurred');
      expect(errorCall.eventData.error).toBe('Coordinator error');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of agents efficiently', async () => {
      const startTime = Date.now();

      // Register a coordinator
      transparencySystem.registerQueenAgent('scale-test-coordinator', mockQueenAgent);

      // Spawn many agents
      for (let i = 0; i < 100; i++) {
        mockQueenAgent.spawnWorker(`worker-${i}`, 'worker', {
          type: 'worker',
          skills: ['work'],
          maxConcurrentTasks: 1,
          priority: 5,
        });
      }

      const spawnTime = Date.now() - startTime;
      expect(spawnTime).toBeLessThan(1000); // Should be fast

      // Check that agents are tracked
      const agents = await transparencySystem.getAllAgents();
      expect(agents.length).toBe(100);
    });

    it('should handle high-frequency events efficiently', async () => {
      const eventListener = jest.fn();
      await transparencySystem.registerEventListener({ onTransparencyEvent: eventListener });

      const startTime = Date.now();

      // Generate many events rapidly
      for (let i = 0; i < 1000; i++) {
        mockQueenAgent.updateWorkerStatus(`worker-${i % 10}`, 'busy', `Processing ${i}`);
      }

      const eventTime = Date.now() - startTime;
      expect(eventTime).toBeLessThan(2000); // Should handle high frequency

      // Should not lose events (within reasonable limits)
      const events = await transparencySystem.getRecentEvents(50);
      expect(events.length).toBe(50); // Should maintain event retention
    });

    it('should maintain reasonable memory usage', async () => {
      const initialEvents = await transparencySystem.getRecentEvents(1000);
      expect(initialEvents.length).toBeLessThanOrEqual(1000);

      // Generate events beyond retention limit
      for (let i = 0; i < 1500; i++) {
        mockQueenAgent.spawnWorker(`memory-test-${i}`, 'worker', {
          type: 'worker',
          skills: [],
          maxConcurrentTasks: 1,
          priority: 5,
        });
      }

      const finalEvents = await transparencySystem.getRecentEvents(1000);
      expect(finalEvents.length).toBeLessThanOrEqual(1000); // Should respect retention limit
    });
  });
});