/**
 * Hybrid Routing Handler Tests
 * Unit tests for CFN event handling and agent lifecycle management
 */

import { EventEmitter } from 'events';
import { HybridRoutingHandler } from './hybrid-routing-handler';
import type { CFNLoop3Event, CFNLoop4Decision, AgentSpawnedEvent, AgentCompletedEvent } from './hybrid-routing-handler';

// Mock WebSocketServer
class MockWebSocketServer extends EventEmitter {
  public agentUpdates: any[] = [];
  public hierarchyChanges: any[] = [];
  public metricsUpdates: any[] = [];
  public errors: any[] = [];
  public notifications: any[] = [];

  emitAgentUpdate(agentId: string, payload: any): void {
    this.agentUpdates.push({ agentId, payload });
  }

  emitHierarchyChange(payload: any): void {
    this.hierarchyChanges.push(payload);
  }

  emitMetricsUpdate(payload: any): void {
    this.metricsUpdates.push(payload);
  }

  emitError(socketId: string | null, payload: any): void {
    this.errors.push({ socketId, payload });
  }

  emitNotification(payload: any): void {
    this.notifications.push(payload);
  }
}

describe('HybridRoutingHandler', () => {
  let handler: HybridRoutingHandler;
  let mockWsServer: MockWebSocketServer;

  beforeEach(() => {
    mockWsServer = new MockWebSocketServer();
    handler = new HybridRoutingHandler(mockWsServer as any);
  });

  afterEach(() => {
    handler.clearStorage();
  });

  describe('Agent Lifecycle Events', () => {
    test('should handle agent:spawned event', () => {
      const agentData: AgentSpawnedEvent = {
        agentId: 'agent-123',
        agentType: 'backend-dev',
        parentId: 'parent-456',
        swarmId: 'swarm-789',
        task: 'Create API endpoints',
        capabilities: ['api-design', 'database', 'testing'],
        resources: {
          cpu: 2,
          memory: 4096,
          storage: 1024
        },
        timestamp: new Date()
      };

      handler.agentSpawned(agentData);

      // Verify agent is stored
      const storedAgent = handler.getAgent('agent-123');
      expect(storedAgent).toEqual(agentData);

      // Verify WebSocket broadcasts
      expect(mockWsServer.agentUpdates).toHaveLength(1);
      expect(mockWsServer.agentUpdates[0].agentId).toBe('agent-123');
      expect(mockWsServer.agentUpdates[0].payload.status).toBe('spawned');

      expect(mockWsServer.hierarchyChanges).toHaveLength(1);
      expect(mockWsServer.hierarchyChanges[0].type).toBe('spawn');
      expect(mockWsServer.hierarchyChanges[0].agentId).toBe('agent-123');

      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].title).toBe('Agent Spawned');
    });

    test('should handle agent:completed event with success', () => {
      const completedData: AgentCompletedEvent = {
        agentId: 'agent-123',
        status: 'completed',
        confidence: 0.95,
        cost: {
          compute: 0.025,
          storage: 0.001,
          network: 0.002,
          total: 0.028
        },
        duration: 15000,
        output: { endpoints: 5, tests: 25 },
        metrics: {
          tasksCompleted: 5,
          quality: 0.92,
          efficiency: 0.88
        },
        timestamp: new Date()
      };

      handler.agentCompleted(completedData);

      // Verify completion is stored
      const storedStatus = handler.getAgentStatus('agent-123');
      expect(storedStatus).toEqual(completedData);

      // Verify WebSocket broadcasts
      expect(mockWsServer.agentUpdates).toHaveLength(1);
      expect(mockWsServer.agentUpdates[0].payload.status).toBe('completed');
      expect(mockWsServer.agentUpdates[0].payload.confidence).toBe(0.95);

      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].type).toBe('success');
      expect(mockWsServer.notifications[0].title).toBe('Agent Completed');
    });

    test('should handle agent:completed event with failure', () => {
      const completedData: AgentCompletedEvent = {
        agentId: 'agent-123',
        status: 'failed',
        confidence: 0.3,
        cost: {
          compute: 0.015,
          storage: 0.001,
          network: 0.001,
          total: 0.017
        },
        duration: 8000,
        errors: ['Database connection timeout', 'Test failures'],
        timestamp: new Date()
      };

      handler.agentCompleted(completedData);

      // Verify WebSocket broadcasts
      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].type).toBe('error');
      expect(mockWsServer.notifications[0].title).toBe('Agent Failed');
    });
  });

  describe('CFN Loop 3 Events', () => {
    test('should handle CFN Loop 3 iteration events', () => {
      const loop3Data: CFNLoop3Event = {
        phaseId: 'phase-001',
        iteration: 3,
        agentId: 'agent-123',
        agentType: 'backend-dev',
        task: 'Implement authentication',
        confidence: 0.75,
        duration: 5000,
        output: { progress: 75 },
        timestamp: new Date()
      };

      handler.cfnLoop3Iteration(loop3Data);

      // Verify iteration is stored
      const history = handler.getLoop3History('phase-001');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(loop3Data);

      // Verify metrics update broadcast
      expect(mockWsServer.metricsUpdates).toHaveLength(1);
      expect(mockWsServer.metricsUpdates[0].agents.total).toBe(0); // No agents spawned yet
    });

    test('should send notification for high confidence achievement', () => {
      const loop3Data: CFNLoop3Event = {
        phaseId: 'phase-001',
        iteration: 2,
        agentId: 'agent-123',
        agentType: 'backend-dev',
        task: 'Implement authentication',
        confidence: 0.92,
        duration: 3000,
        timestamp: new Date()
      };

      handler.cfnLoop3Iteration(loop3Data);

      // Should send high confidence notification
      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].type).toBe('success');
      expect(mockWsServer.notifications[0].title).toBe('High Confidence Achieved');
    });

    test('should send warning for low confidence after many iterations', () => {
      const loop3Data: CFNLoop3Event = {
        phaseId: 'phase-001',
        iteration: 6,
        agentId: 'agent-123',
        agentType: 'backend-dev',
        task: 'Complex task',
        confidence: 0.45,
        duration: 8000,
        timestamp: new Date()
      };

      handler.cfnLoop3Iteration(loop3Data);

      // Should send low confidence warning
      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].type).toBe('warning');
      expect(mockWsServer.notifications[0].title).toBe('Low Confidence Detected');
    });

    test('should handle CFN Loop 3 phase completion', () => {
      const phaseData = {
        phaseId: 'phase-001',
        totalIterations: 5,
        finalConfidence: 0.89,
        duration: 25000
      };

      handler.cfnLoop3PhaseComplete(phaseData);

      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].type).toBe('success');
      expect(mockWsServer.notifications[0].title).toBe('Phase Completed');
    });

    test('should handle CFN Loop 3 errors', () => {
      const errorData = {
        phaseId: 'phase-001',
        agentId: 'agent-123',
        error: 'Database schema conflict',
        iteration: 3
      };

      handler.cfnLoop3Error(errorData);

      expect(mockWsServer.errors).toHaveLength(1);
      expect(mockWsServer.errors[0].payload.severity).toBe('high');
      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].type).toBe('error');
    });
  });

  describe('CFN Loop 4 Events', () => {
    test('should handle CFN Loop 4 approve decision', () => {
      const decisionData: CFNLoop4Decision = {
        phaseId: 'phase-001',
        decisionId: 'decision-123',
        agentId: 'agent-123',
        decisionType: 'approve',
        rationale: 'Implementation meets all requirements and quality standards',
        criteria: {
          quality: 0.95,
          completeness: 0.92,
          compliance: 0.98,
          performance: 0.88
        },
        timestamp: new Date()
      };

      handler.cfnLoop4Decision(decisionData);

      // Verify decision is stored
      const decisions = handler.getLoop4Decisions('phase-001');
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual(decisionData);

      // Verify notification
      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].type).toBe('success');
      expect(mockWsServer.notifications[0].title).toBe('PO Decision: APPROVE');
    });

    test('should handle CFN Loop 4 reject decision', () => {
      const decisionData: CFNLoop4Decision = {
        phaseId: 'phase-001',
        decisionId: 'decision-456',
        agentId: 'agent-123',
        decisionType: 'reject',
        rationale: 'Missing critical security validations',
        criteria: {
          quality: 0.65,
          completeness: 0.70,
          compliance: 0.45,
          performance: 0.80
        },
        timestamp: new Date()
      };

      handler.cfnLoop4Decision(decisionData);

      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].type).toBe('error');
      expect(mockWsServer.notifications[0].title).toBe('PO Decision: REJECT');
    });

    test('should handle CFN Loop 4 escalation', () => {
      const escalationData = {
        phaseId: 'phase-001',
        agentId: 'agent-123',
        reason: 'Technical disagreement on architecture approach',
        escalatedTo: 'senior-architect'
      };

      handler.cfnLoop4Escalation(escalationData);

      expect(mockWsServer.notifications).toHaveLength(1);
      expect(mockWsServer.notifications[0].type).toBe('error');
      expect(mockWsServer.notifications[0].title).toBe('CFN Loop 4 Escalation');
    });
  });

  describe('Storage and Statistics', () => {
    test('should track event statistics', () => {
      // Trigger various events
      handler.agentSpawned({
        agentId: 'agent-1',
        agentType: 'backend-dev',
        task: 'Task 1',
        capabilities: [],
        resources: { cpu: 1, memory: 1024, storage: 512 },
        timestamp: new Date()
      });

      handler.agentCompleted({
        agentId: 'agent-1',
        status: 'completed',
        confidence: 0.9,
        cost: { compute: 0.01, storage: 0.001, network: 0.001, total: 0.012 },
        duration: 5000,
        timestamp: new Date()
      });

      handler.cfnLoop3Iteration({
        phaseId: 'phase-1',
        iteration: 1,
        agentId: 'agent-1',
        agentType: 'backend-dev',
        task: 'Task 1',
        confidence: 0.8,
        duration: 3000,
        timestamp: new Date()
      });

      handler.cfnLoop4Decision({
        phaseId: 'phase-1',
        decisionId: 'decision-1',
        agentId: 'agent-1',
        decisionType: 'approve',
        rationale: 'Good work',
        criteria: { quality: 0.9, completeness: 0.9, compliance: 0.9, performance: 0.9 },
        timestamp: new Date()
      });

      const stats = handler.getEventStats();
      expect(stats['agent:spawned']).toBe(1);
      expect(stats['agent:completed']).toBe(1);
      expect(stats['cfn:loop3:iteration']).toBe(1);
      expect(stats['cfn:loop4:decision']).toBe(1);
    });

    test('should provide storage statistics', () => {
      // Add some test data
      handler.agentSpawned({
        agentId: 'agent-1',
        agentType: 'backend-dev',
        task: 'Task 1',
        capabilities: [],
        resources: { cpu: 1, memory: 1024, storage: 512 },
        timestamp: new Date()
      });

      handler.agentCompleted({
        agentId: 'agent-1',
        status: 'completed',
        confidence: 0.9,
        cost: { compute: 0.01, storage: 0.001, network: 0.001, total: 0.012 },
        duration: 5000,
        timestamp: new Date()
      });

      const storageStats = handler.getStorageStats();
      expect(storageStats.agents).toBe(1);
      expect(storageStats.agentStatus).toBe(1);
      expect(storageStats.totalEvents).toBe(2); // spawned + completed
    });

    test('should clear storage', () => {
      // Add some data
      handler.agentSpawned({
        agentId: 'agent-1',
        agentType: 'backend-dev',
        task: 'Task 1',
        capabilities: [],
        resources: { cpu: 1, memory: 1024, storage: 512 },
        timestamp: new Date()
      });

      expect(handler.getAgent('agent-1')).toBeDefined();

      // Clear storage
      handler.clearStorage();

      expect(handler.getAgent('agent-1')).toBeUndefined();
      expect(handler.getStorageStats().agents).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors gracefully', (done) => {
      // Create a handler with a mock WebSocketServer that throws errors
      const errorWsServer = {
        emitAgentUpdate: () => { throw new Error('WebSocket error'); },
        emitHierarchyChange: () => {},
        emitMetricsUpdate: () => {},
        emitError: () => {},
        emitNotification: () => {}
      };

      const errorHandler = new HybridRoutingHandler(errorWsServer as any);

      // Listen for internal error events
      errorHandler.on('error', (errorData) => {
        expect(errorData.eventType).toBe('agent:spawned');
        expect(errorData.error).toBeDefined();
        done();
      });

      // Trigger an event that will cause an error
      errorHandler.agentSpawned({
        agentId: 'agent-1',
        agentType: 'backend-dev',
        task: 'Task 1',
        capabilities: [],
        resources: { cpu: 1, memory: 1024, storage: 512 },
        timestamp: new Date()
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiple agents in the same phase', () => {
      const phaseId = 'phase-001';
      
      // Add iterations for multiple agents
      handler.cfnLoop3Iteration({
        phaseId,
        iteration: 1,
        agentId: 'agent-1',
        agentType: 'backend-dev',
        task: 'Task 1',
        confidence: 0.8,
        duration: 3000,
        timestamp: new Date()
      });

      handler.cfnLoop3Iteration({
        phaseId,
        iteration: 1,
        agentId: 'agent-2',
        agentType: 'frontend-dev',
        task: 'Task 2',
        confidence: 0.75,
        duration: 2500,
        timestamp: new Date()
      });

      const history = handler.getLoop3History(phaseId);
      expect(history).toHaveLength(2);
      expect(history[0].agentId).toBe('agent-1');
      expect(history[1].agentId).toBe('agent-2');
    });

    test('should limit history storage to prevent memory leaks', () => {
      const phaseId = 'phase-001';
      
      // Add more than 100 iterations
      for (let i = 1; i <= 105; i++) {
        handler.cfnLoop3Iteration({
          phaseId,
          iteration: i,
          agentId: 'agent-1',
          agentType: 'backend-dev',
          task: 'Task',
          confidence: 0.8,
          duration: 1000,
          timestamp: new Date()
        });
      }

      const history = handler.getLoop3History(phaseId);
      expect(history).toHaveLength(100); // Should be limited to 100
      expect(history[0].iteration).toBe(6); // First 5 should be removed
      expect(history[99].iteration).toBe(105); // Last one should be kept
    });
  });
});