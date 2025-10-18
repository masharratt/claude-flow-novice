/**
 * Transparency System Integration Tests
 *
 * Tests transparency features for V2 multi-level coordination system.
 * Demonstrates real-time monitoring, hierarchy visualization, and event streaming.
 *
 * @module tests/integration/transparency-system.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TransparencySystem } from '../../src/coordination/shared/transparency/transparency-system.js';
import type {
  AgentHierarchyNode,
  AgentStatus,
  AgentLifecycleEvent,
  TransparencyMetrics
} from '../../src/coordination/shared/transparency/interfaces/transparency-system.js';
import type { Agent, AgentState } from '../../src/coordination/v2/interfaces/ICoordinator.js';

describe('Transparency System Integration', () => {
  let transparency: TransparencySystem;
  let mockAgents: Agent[];

  beforeAll(async () => {
    // Initialize transparency system
    transparency = new TransparencySystem();
    await transparency.initialize({
      enableRealTimeMonitoring: true,
      enableEventStreaming: true,
      enablePerformanceTracking: true,
      enableDependencyTracking: true,
      metricsUpdateIntervalMs: 1000,
      heartbeatIntervalMs: 2000,
    });

    // Create mock agents for testing
    mockAgents = createMockAgents();

    // Register agents with transparency system
    registerMockAgents();
  });

  afterAll(async () => {
    await transparency.cleanup();
  });

  describe('Agent Hierarchy Tracking', () => {
    it('should track multi-level agent hierarchy', async () => {
      const hierarchy = await transparency.getAgentHierarchy();

      expect(hierarchy).toHaveLength(7); // 1 orchestrator + 3 workers + 3 helpers

      // Check level distribution
      const level1 = hierarchy.filter(agent => agent.level === 1);
      const level2 = hierarchy.filter(agent => agent.level === 2);
      const level3 = hierarchy.filter(agent => agent.level === 3);

      expect(level1).toHaveLength(1); // orchestrator
      expect(level2).toHaveLength(3); // workers
      expect(level3).toHaveLength(3); // helpers

      // Check parent-child relationships
      const orchestrator = level1[0];
      expect(orchestrator.parentAgentId).toBeUndefined();
      expect(orchestrator.childAgentIds).toHaveLength(3);

      const workers = level2;
      workers.forEach(worker => {
        expect(worker.parentAgentId).toBe(orchestrator.agentId);
        expect(worker.childAgentIds).toHaveLength(1); // Each worker has one helper
      });

      const helpers = level3;
      helpers.forEach(helper => {
        expect(helper.parentAgentId).toBeDefined();
        expect(helper.childAgentIds).toHaveLength(0);
      });
    });

    it('should get agents at specific levels', async () => {
      const level1Agents = await transparency.getAgentsAtLevel(1);
      const level2Agents = await transparency.getAgentsAtLevel(2);
      const level3Agents = await transparency.getAgentsAtLevel(3);

      expect(level1Agents).toHaveLength(1);
      expect(level2Agents).toHaveLength(3);
      expect(level3Agents).toHaveLength(3);

      expect(level1Agents[0].type).toBe('orchestrator');
      level2Agents.forEach(agent => expect(agent.type).toContain('worker'));
      level3Agents.forEach(agent => expect(agent.type).toContain('helper'));
    });

    it('should get root agents correctly', async () => {
      const rootAgents = await transparency.getRootAgents();

      expect(rootAgents).toHaveLength(1);
      expect(rootAgents[0].agentId).toBe('orchestrator-001');
      expect(rootAgents[0].level).toBe(1);
      expect(rootAgents[0].parentAgentId).toBeUndefined();
    });

    it('should get child agents correctly', async () => {
      const childAgents = await transparency.getChildAgents('orchestrator-001');

      expect(childAgents).toHaveLength(3);
      childAgents.forEach(child => {
        expect(child.parentAgentId).toBe('orchestrator-001');
        expect(child.type).toContain('worker');
      });
    });
  });

  describe('Real-time Agent Status Monitoring', () => {
    it('should track agent statuses', async () => {
      const statuses = await transparency.getAllAgentStatuses();

      expect(statuses).toHaveLength(7);

      statuses.forEach(status => {
        expect(status).toHaveProperty('agentId');
        expect(status).toHaveProperty('state');
        expect(status).toHaveProperty('isPaused');
        expect(status).toHaveProperty('activity');
        expect(status).toHaveProperty('tokensUsed');
        expect(status).toHaveProperty('memoryUsage');
        expect(status).toHaveProperty('cpuUsage');
        expect(status).toHaveProperty('lastHeartbeat');
      });
    });

    it('should update agent state changes', async () => {
      // Update state for a specific agent
      transparency.updateAgentState('worker-coder-001', 'active', 'Processing task');

      const status = await transparency.getAgentStatus('worker-coder-001');
      expect(status.state).toBe('active');
      expect(status.activity).toContain('Processing task');

      // Check lifecycle event was recorded
      const events = await transparency.getAgentEvents('worker-coder-001', 5);
      const stateChangeEvent = events.find(e => e.eventType === 'state_changed');
      expect(stateChangeEvent).toBeDefined();
      expect(stateChangeEvent!.eventData.newState).toBe('active');
      expect(stateChangeEvent!.eventData.reason).toBe('Processing task');
    });

    it('should track token usage', async () => {
      // Update token usage for an agent
      transparency.updateTokenUsage('worker-coder-001', 1500);

      const status = await transparency.getAgentStatus('worker-coder-001');
      expect(status.tokensUsed).toBe(1500);
      expect(status.tokenUsageRate).toBeGreaterThan(0);
    });

    it('should distinguish active vs paused agents', async () => {
      // Pause an agent
      transparency.updateAgentState('helper-tester-001', 'paused', 'Resource constraints');

      const activeAgents = await transparency.getActiveAgents();
      const pausedAgents = await transparency.getPausedAgents();

      expect(activeAgents.length).toBeLessThan(7); // At least one paused
      expect(pausedAgents.length).toBeGreaterThan(0);

      const pausedHelper = pausedAgents.find(a => a.agentId === 'helper-tester-001');
      expect(pausedHelper).toBeDefined();
      expect(pausedHelper!.isPaused).toBe(true);
    });
  });

  describe('Event Streaming', () => {
    it('should record agent lifecycle events', async () => {
      const events = await transparency.getRecentEvents(20);

      expect(events.length).toBeGreaterThan(0);

      // Check event structure
      events.forEach(event => {
        expect(event).toHaveProperty('eventId');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('agentId');
        expect(event).toHaveProperty('eventType');
        expect(event).toHaveProperty('eventData');
        expect(event).toHaveProperty('level');
        expect(event).toHaveProperty('sessionId');
        expect(event).toHaveProperty('tokensUsed');
        expect(event).toHaveProperty('performanceImpact');
      });

      // Should have spawn events for all agents
      const spawnEvents = events.filter(e => e.eventType === 'spawned');
      expect(spawnEvents).toHaveLength(7);
    });

    it('should filter events by type', async () => {
      const stateChangeEvents = await transparency.getRecentEvents(10, 'state_changed');
      const spawnEvents = await transparency.getRecentEvents(10, 'spawned');

      expect(stateChangeEvents.every(e => e.eventType === 'state_changed')).toBe(true);
      expect(spawnEvents.every(e => e.eventType === 'spawned')).toBe(true);
    });

    it('should get events for specific agent', async () => {
      const agentEvents = await transparency.getAgentEvents('worker-coder-001', 10);

      expect(agentEvents.every(e => e.agentId === 'worker-coder-001')).toBe(true);
      expect(agentEvents.some(e => e.eventType === 'spawned')).toBe(true);
    });

    it('should get events in time range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const events = await transparency.getEventsInTimeRange(oneHourAgo, now, 20);

      events.forEach(event => {
        expect(event.timestamp).toBeGreaterThanOrEqual(oneHourAgo);
        expect(event.timestamp).toBeLessThanOrEqual(now);
      });
    });
  });

  describe('Metrics & Analytics', () => {
    it('should calculate transparency metrics', async () => {
      const metrics = await transparency.getTransparencyMetrics();

      expect(metrics).toHaveProperty('totalAgents', 7);
      expect(metrics).toHaveProperty('agentsByLevel');
      expect(metrics).toHaveProperty('agentsByState');
      expect(metrics).toHaveProperty('agentsByType');
      expect(metrics).toHaveProperty('totalTokensConsumed');
      expect(metrics).toHaveProperty('totalTokensSaved');
      expect(metrics).toHaveProperty('averageExecutionTimeMs');
      expect(metrics).toHaveProperty('failureRate');
      expect(metrics).toHaveProperty('averagePauseResumeLatencyMs');
      expect(metrics).toHaveProperty('hierarchyDepth');
      expect(metrics).toHaveProperty('dependencyResolutionRate');
      expect(metrics).toHaveProperty('eventStreamStats');

      // Check hierarchy depth
      expect(metrics.hierarchyDepth).toBe(3);

      // Check agent distribution
      expect(metrics.agentsByLevel[1]).toBe(1);
      expect(metrics.agentsByLevel[2]).toBe(3);
      expect(metrics.agentsByLevel[3]).toBe(3);

      // Check event stream stats
      expect(metrics.eventStreamStats.totalEvents).toBeGreaterThan(0);
      expect(metrics.eventStreamStats.eventTypes).toBeDefined();
    });

    it('should calculate agent performance metrics', async () => {
      const metrics = await transparency.getAgentPerformanceMetrics('worker-coder-001');

      expect(metrics).toHaveProperty('agentId', 'worker-coder-001');
      expect(metrics).toHaveProperty('executionMetrics');
      expect(metrics).toHaveProperty('currentPerformance');
      expect(metrics).toHaveProperty('tokenMetrics');
      expect(metrics).toHaveProperty('stateMetrics');
      expect(metrics).toHaveProperty('errorMetrics');

      // Check execution metrics
      expect(metrics.executionMetrics).toHaveProperty('spawnTimeMs');
      expect(metrics.executionMetrics).toHaveProperty('totalExecutionTimeMs');
      expect(metrics.executionMetrics).toHaveProperty('pauseCount');
      expect(metrics.executionMetrics).toHaveProperty('resumeCount');
      expect(metrics.executionMetrics).toHaveProperty('checkpointCount');

      // Check token metrics
      expect(metrics.tokenMetrics).toHaveProperty('totalUsed');
      expect(metrics.tokenMetrics).toHaveProperty('budget');
      expect(metrics.tokenMetrics).toHaveProperty('utilizationRate');
    });

    it('should calculate hierarchy analytics', async () => {
      const analytics = await transparency.getHierarchyAnalytics();

      expect(analytics).toHaveProperty('depth', 3);
      expect(analytics).toHaveProperty('branchingFactor');
      expect(analytics).toHaveProperty('balance');
      expect(analytics).toHaveProperty('efficiency');

      expect(analytics.depth).toBe(3);
      expect(analytics.branchingFactor).toBeGreaterThan(0);
      expect(analytics.balance).toBeGreaterThanOrEqual(0);
      expect(analytics.balance).toBeLessThanOrEqual(100);
      expect(analytics.efficiency).toBeGreaterThanOrEqual(0);
      expect(analytics.efficiency).toBeLessThanOrEqual(100);
    });
  });

  describe('Event Listeners', () => {
    it('should notify hierarchy change listeners', async () => {
      let hierarchyChangeReceived = false;
      let changeData: any = null;

      await transparency.registerEventListener({
        onHierarchyChange: (change) => {
          hierarchyChangeReceived = true;
          changeData = change;
        },
      });

      // Register a new agent (should trigger hierarchy change)
      const newAgent: Agent = {
        agentId: 'new-agent-001',
        sessionId: 'session-test',
        type: 'tester',
        state: 'idle',
        isPaused: false,
        priority: 5,
        session: {} as any,
        metadata: {},
      };

      transparency.registerAgent(newAgent, 'orchestrator-001');

      expect(hierarchyChangeReceived).toBe(true);
      expect(changeData).toBeDefined();
      expect(changeData.type).toBe('agent_added');
      expect(changeData.agentId).toBe('new-agent-001');
    });

    it('should notify state change listeners', async () => {
      let stateChangeReceived = false;
      let stateChangeData: any = null;

      await transparency.registerEventListener({
        onAgentStateChange: (change) => {
          stateChangeReceived = true;
          stateChangeData = change;
        },
      });

      // Update agent state
      transparency.updateAgentState('worker-coder-001', 'active', 'Test reason');

      expect(stateChangeReceived).toBe(true);
      expect(stateChangeData).toBeDefined();
      expect(stateChangeData.agentId).toBe('worker-coder-001');
      expect(stateChangeData.newState).toBe('active');
      expect(stateChangeData.reason).toBe('Test reason');
    });

    it('should notify lifecycle event listeners', async () => {
      let lifecycleEventReceived = false;
      let eventData: any = null;

      await transparency.registerEventListener({
        onLifecycleEvent: (event) => {
          lifecycleEventReceived = true;
          eventData = event;
        },
      });

      // Update agent state (should generate lifecycle event)
      transparency.updateAgentState('worker-coder-001', 'paused', 'Lifecycle test');

      expect(lifecycleEventReceived).toBe(true);
      expect(eventData).toBeDefined();
      expect(eventData.agentId).toBe('worker-coder-001');
      expect(eventData.eventType).toBe('state_changed');
    });
  });

  describe('Performance Monitoring', () => {
    it('should track resource usage over time', async () => {
      const agentId = 'worker-coder-001';

      // Simulate resource usage changes
      transparency.updateTokenUsage(agentId, 1000);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay

      const status1 = await transparency.getAgentStatus(agentId);
      expect(status1.tokensUsed).toBe(1000);

      transparency.updateTokenUsage(agentId, 1500);
      await new Promise(resolve => setTimeout(resolve, 100));

      const status2 = await transparency.getAgentStatus(agentId);
      expect(status2.tokensUsed).toBe(1500);
      expect(status2.tokenUsageRate).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      // Try to get status for non-existent agent
      await expect(transparency.getAgentStatus('non-existent-agent'))
        .rejects.toThrow('Agent non-existent-agent not found');

      // Try to get performance metrics for non-existent agent
      await expect(transparency.getAgentPerformanceMetrics('non-existent-agent'))
        .rejects.toThrow('Agent non-existent-agent not found');
    });
  });

  // Helper functions
  function createMockAgents(): Agent[] {
    return [
      {
        agentId: 'orchestrator-001',
        sessionId: 'session-orchestrator',
        type: 'orchestrator',
        state: 'active',
        isPaused: false,
        priority: 10,
        session: {} as any,
        metadata: { tokenBudget: 20000 },
      },
      {
        agentId: 'worker-coder-001',
        sessionId: 'session-worker-1',
        type: 'coder',
        state: 'active',
        isPaused: false,
        priority: 8,
        session: {} as any,
        metadata: { tokenBudget: 15000 },
      },
      {
        agentId: 'worker-tester-002',
        sessionId: 'session-worker-2',
        type: 'tester',
        state: 'active',
        isPaused: false,
        priority: 7,
        session: {} as any,
        metadata: { tokenBudget: 12000 },
      },
      {
        agentId: 'worker-reviewer-003',
        sessionId: 'session-worker-3',
        type: 'reviewer',
        state: 'active',
        isPaused: false,
        priority: 6,
        session: {} as any,
        metadata: { tokenBudget: 10000 },
      },
      {
        agentId: 'helper-coder-001',
        sessionId: 'session-helper-1',
        type: 'coder-helper',
        state: 'idle',
        isPaused: false,
        priority: 7,
        session: {} as any,
        metadata: { tokenBudget: 8000 },
      },
      {
        agentId: 'helper-tester-001',
        sessionId: 'session-helper-2',
        type: 'tester-helper',
        state: 'idle',
        isPaused: false,
        priority: 6,
        session: {} as any,
        metadata: { tokenBudget: 7000 },
      },
      {
        agentId: 'helper-reviewer-001',
        sessionId: 'session-helper-3',
        type: 'reviewer-helper',
        state: 'idle',
        isPaused: false,
        priority: 5,
        session: {} as any,
        metadata: { tokenBudget: 6000 },
      },
    ];
  }

  function registerMockAgents(): void {
    // Register orchestrator (root)
    transparency.registerAgent(mockAgents[0]);

    // Register workers (children of orchestrator)
    transparency.registerAgent(mockAgents[1], 'orchestrator-001');
    transparency.registerAgent(mockAgents[2], 'orchestrator-001');
    transparency.registerAgent(mockAgents[3], 'orchestrator-001');

    // Register helpers (children of workers)
    transparency.registerAgent(mockAgents[4], 'worker-coder-001');
    transparency.registerAgent(mockAgents[5], 'worker-tester-002');
    transparency.registerAgent(mockAgents[6], 'worker-reviewer-003');
  }
});