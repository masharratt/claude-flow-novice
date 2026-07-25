/**
 * TransparencyAdapter Integration Tests
 *
 * Tests event mapping and WebSocket propagation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TransparencyAdapter } from '../websocket/integrations/TransparencyAdapter.js';
import type { AgentLifecycleEvent } from '../../../../../src/coordination/shared/transparency/interfaces/transparency-system.js';

describe('TransparencyAdapter', () => {
  let adapter: TransparencyAdapter;
  let mockWsServer: any;
  let mockTransparencyService: any;
  let emittedEvents: any[] = [];

  beforeEach(() => {
    // Reset emitted events
    emittedEvents = [];

    // Mock WebSocket server
    mockWsServer = {
      emitAgentUpdate: vi.fn((agentId: string, payload: any) => {
        emittedEvents.push({ type: 'agent_update', agentId, payload });
      }),
      emitError: vi.fn((socketId: string | null, payload: any) => {
        emittedEvents.push({ type: 'error', socketId, payload });
      }),
    };

    // Mock TransparencyService
    mockTransparencyService = {
      subscribeToLifecycleEvents: vi.fn((callback: Function) => {
        // Return unsubscribe function
        return () => {};
      }),
    };

    adapter = new TransparencyAdapter(mockWsServer);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('subscribeToTransparencySystem', () => {
    it('should subscribe to TransparencyService lifecycle events', () => {
      adapter.subscribeToTransparencySystem(mockTransparencyService);

      expect(
        mockTransparencyService.subscribeToLifecycleEvents
      ).toHaveBeenCalledTimes(1);
    });

    it('should warn if TransparencyService is not available', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation();

      adapter.subscribeToTransparencySystem(null);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('TransparencyService not available')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should return unsubscribe function', () => {
      adapter.subscribeToTransparencySystem(mockTransparencyService);

      // Should not throw
      adapter.unsubscribe();
    });
  });

  describe('handleLifecycleEvent', () => {
    beforeEach(() => {
      adapter.subscribeToTransparencySystem(mockTransparencyService);
    });

    it('should handle agent spawned event', () => {
      const event: AgentLifecycleEvent = {
        eventId: 'evt-1',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'spawned',
        eventData: {},
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 0,
        performanceImpact: {},
      };

      // Get the callback function that was passed to subscribeToLifecycleEvents
      const callback =
        mockTransparencyService.subscribeToLifecycleEvents.mock.calls[0][0];
      callback(event);

      // Verify agent_update was emitted
      expect(mockWsServer.emitAgentUpdate).toHaveBeenCalledTimes(1);
      expect(mockWsServer.emitAgentUpdate).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          status: 'spawned',
          confidence: 0,
        })
      );
    });

    it('should handle agent state_changed event', () => {
      // First spawn the agent
      const spawnEvent: AgentLifecycleEvent = {
        eventId: 'evt-1',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'spawned',
        eventData: {},
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 0,
        performanceImpact: {},
      };

      const callback =
        mockTransparencyService.subscribeToLifecycleEvents.mock.calls[0][0];
      callback(spawnEvent);

      // Then change state
      const stateChangedEvent: AgentLifecycleEvent = {
        eventId: 'evt-2',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'state_changed',
        eventData: {
          previousState: 'idle',
          newState: 'active',
        },
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 100,
        performanceImpact: {},
      };

      callback(stateChangedEvent);

      // Verify agent_update was emitted with new status
      const updateCalls = mockWsServer.emitAgentUpdate.mock.calls;
      const lastCall = updateCalls[updateCalls.length - 1];

      expect(lastCall[0]).toBe('agent-1');
      expect(lastCall[1].status).toBe('running'); // 'active' maps to 'running'
    });

    it('should handle agent terminated event', () => {
      // First spawn the agent
      const spawnEvent: AgentLifecycleEvent = {
        eventId: 'evt-1',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'spawned',
        eventData: {},
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 0,
        performanceImpact: {},
      };

      const callback =
        mockTransparencyService.subscribeToLifecycleEvents.mock.calls[0][0];
      callback(spawnEvent);

      // Then terminate
      const terminatedEvent: AgentLifecycleEvent = {
        eventId: 'evt-2',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'terminated',
        eventData: {},
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 100,
        performanceImpact: {},
      };

      callback(terminatedEvent);

      // Verify agent_update was emitted with terminated status
      const updateCalls = mockWsServer.emitAgentUpdate.mock.calls;
      const lastCall = updateCalls[updateCalls.length - 1];

      expect(lastCall[0]).toBe('agent-1');
      expect(lastCall[1].status).toBe('terminated');
    });

    it('should handle task_assigned event', () => {
      // First spawn the agent
      const spawnEvent: AgentLifecycleEvent = {
        eventId: 'evt-1',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'spawned',
        eventData: {},
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 0,
        performanceImpact: {},
      };

      const callback =
        mockTransparencyService.subscribeToLifecycleEvents.mock.calls[0][0];
      callback(spawnEvent);

      // Assign task
      const taskEvent: AgentLifecycleEvent = {
        eventId: 'evt-2',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'task_assigned',
        eventData: {
          taskDescription: 'Implement authentication',
        },
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 50,
        performanceImpact: {},
      };

      callback(taskEvent);

      // Verify agent_update was emitted with task
      const updateCalls = mockWsServer.emitAgentUpdate.mock.calls;
      const lastCall = updateCalls[updateCalls.length - 1];

      expect(lastCall[0]).toBe('agent-1');
      expect(lastCall[1].tasks).toHaveLength(1);
      expect(lastCall[1].tasks[0].description).toBe('Implement authentication');
    });

    it('should handle error_occurred event', () => {
      const errorEvent: AgentLifecycleEvent = {
        eventId: 'evt-1',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'error_occurred',
        eventData: {
          errorMessage: 'Test error',
        },
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 0,
        performanceImpact: {},
      };

      const callback =
        mockTransparencyService.subscribeToLifecycleEvents.mock.calls[0][0];
      callback(errorEvent);

      // Verify error was emitted
      expect(mockWsServer.emitError).toHaveBeenCalledTimes(1);
      expect(mockWsServer.emitError).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          severity: 'high',
          message: 'Test error',
        })
      );
    });

    it('should handle paused event', () => {
      // First spawn the agent
      const spawnEvent: AgentLifecycleEvent = {
        eventId: 'evt-1',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'spawned',
        eventData: {},
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 0,
        performanceImpact: {},
      };

      const callback =
        mockTransparencyService.subscribeToLifecycleEvents.mock.calls[0][0];
      callback(spawnEvent);

      // Pause agent
      const pausedEvent: AgentLifecycleEvent = {
        eventId: 'evt-2',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'paused',
        eventData: {},
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 50,
        performanceImpact: {},
      };

      callback(pausedEvent);

      // Verify agent_update was emitted with paused status
      const updateCalls = mockWsServer.emitAgentUpdate.mock.calls;
      const lastCall = updateCalls[updateCalls.length - 1];

      expect(lastCall[0]).toBe('agent-1');
      expect(lastCall[1].status).toBe('paused');
    });
  });

  describe('mapAgentState', () => {
    it('should map agent states correctly', () => {
      adapter.subscribeToTransparencySystem(mockTransparencyService);

      const stateMap = {
        idle: 'idle',
        active: 'running',
        paused: 'paused',
        terminated: 'terminated',
        error: 'error',
        completing: 'completing',
        checkpointing: 'checkpointing',
        waiting_for_dependency: 'waiting',
      };

      const callback =
        mockTransparencyService.subscribeToLifecycleEvents.mock.calls[0][0];

      Object.entries(stateMap).forEach(([agentState, expectedStatus]) => {
        // Spawn agent first
        callback({
          eventId: 'evt-spawn',
          timestamp: new Date(),
          agentId: `agent-${agentState}`,
          eventType: 'spawned',
          eventData: {},
          level: 1,
          sessionId: 'session-1',
          tokensUsed: 0,
          performanceImpact: {},
        });

        // Change state
        callback({
          eventId: `evt-${agentState}`,
          timestamp: new Date(),
          agentId: `agent-${agentState}`,
          eventType: 'state_changed',
          eventData: {
            newState: agentState,
          },
          level: 1,
          sessionId: 'session-1',
          tokensUsed: 0,
          performanceImpact: {},
        });

        // Find the last call for this agent
        const updateCalls = mockWsServer.emitAgentUpdate.mock.calls;
        const lastCall = updateCalls[updateCalls.length - 1];

        expect(lastCall[1].status).toBe(expectedStatus);
      });
    });
  });

  describe('getAgentStatuses', () => {
    it('should return cached agent statuses', () => {
      const statuses = adapter.getAgentStatuses();
      expect(statuses).toBeInstanceOf(Map);
    });
  });

  describe('clearCache', () => {
    it('should clear cached statuses', () => {
      adapter.subscribeToTransparencySystem(mockTransparencyService);

      // Add an agent
      const callback =
        mockTransparencyService.subscribeToLifecycleEvents.mock.calls[0][0];
      callback({
        eventId: 'evt-1',
        timestamp: new Date(),
        agentId: 'agent-1',
        eventType: 'spawned',
        eventData: {},
        level: 1,
        sessionId: 'session-1',
        tokensUsed: 0,
        performanceImpact: {},
      });

      // Clear cache
      adapter.clearCache();

      // Verify cache is empty
      const statuses = adapter.getAgentStatuses();
      expect(statuses.size).toBe(0);
    });
  });
});
