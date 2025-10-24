/**
 * SwarmAdapter Integration Tests with EventStore
 *
 * Tests the integration between SwarmAdapter and EventStore
 * Validates event persistence, querying, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmAdapter } from '../websocket/integrations/SwarmAdapter.js';
import { eventStoreService } from '../services/event-store.js';
import type { SwarmCoordinatorEvent } from '../websocket/integrations/SwarmAdapter.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('SwarmAdapter Integration with EventStore', () => {
  let adapter: SwarmAdapter;
  let mockWsServer: any;
  const testDbPath = join(process.cwd(), 'data', 'events.db');

  beforeEach(async () => { try {
    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // Mock WebSocket server
    mockWsServer = {
      emitHierarchyChange: vi.fn(),
      emitAgentUpdate: vi.fn(),
      emitError: vi.fn()
    };

    // Create adapter with event storage enabled
    adapter = new SwarmAdapter(mockWsServer, { enableEventStorage: true });

    // Initialize event store
    await eventStoreService.initialize();

    // Wait for adapter initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => { try {
    // Cleanup
    adapter.clearCache();
    await eventStoreService.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    vi.clearAllMocks();
  });

  describe('Event Persistence', () => {
    it('should persist swarm_created event to event store', async () => { try {
      const event: SwarmCoordinatorEvent = {
        type: 'swarm_created',
        swarmId: 'test-swarm-1',
        data: { objective: 'Test objective' },
        timestamp: new Date()
      };

      adapter.handleSwarmEvent(event);

      // Wait for async persistence
      await new Promise(resolve => setTimeout(resolve, 200));

      // Query event store
      const result = await eventStoreService.queryEvents({
        phaseId: 'test-swarm-1'
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe('swarm_swarm_created');
      expect(result.events[0].payload.swarmId).toBe('test-swarm-1');
    });

    it('should persist agent_spawned event to event store', async () => { try {
      const event: SwarmCoordinatorEvent = {
        type: 'agent_spawned',
        swarmId: 'test-swarm-1',
        agentId: 'agent-1',
        parentId: 'coordinator',
        data: { role: 'coder' },
        timestamp: new Date()
      };

      adapter.handleSwarmEvent(event);

      // Wait for async persistence
      await new Promise(resolve => setTimeout(resolve, 200));

      // Query event store
      const result = await eventStoreService.queryEvents({
        agentId: 'agent-1'
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe('swarm_agent_spawned');
      expect(result.events[0].payload.agentId).toBe('agent-1');
      expect(result.events[0].payload.parentId).toBe('coordinator');
    });

    it('should persist multiple events in batch', async () => { try {
      const events: SwarmCoordinatorEvent[] = [
        {
          type: 'swarm_created',
          swarmId: 'test-swarm-1',
          data: {},
          timestamp: new Date()
        },
        {
          type: 'agent_spawned',
          swarmId: 'test-swarm-1',
          agentId: 'agent-1',
          data: {},
          timestamp: new Date()
        },
        {
          type: 'agent_spawned',
          swarmId: 'test-swarm-1',
          agentId: 'agent-2',
          data: {},
          timestamp: new Date()
        }
      ];

      events.forEach(event => adapter.handleSwarmEvent(event));

      // Wait for async persistence
      await new Promise(resolve => setTimeout(resolve, 300));

      // Query event store
      const result = await eventStoreService.queryEvents({
        phaseId: 'test-swarm-1'
      });

      expect(result.events.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle persistence failure gracefully', async () => { try {
      // Close event store to simulate failure
      await eventStoreService.close();

      const event: SwarmCoordinatorEvent = {
        type: 'swarm_created',
        swarmId: 'test-swarm-1',
        data: {},
        timestamp: new Date()
      };

      // Should not throw
      expect(() => adapter.handleSwarmEvent(event)).not.toThrow();

      // WebSocket should still work
      expect(mockWsServer.emitHierarchyChange).not.toHaveBeenCalled(); // swarm_created doesn't emit hierarchy change
    });
  });

  describe('Event Querying', () => {
    beforeEach(async () => { try {
      // Seed test data
      const events: SwarmCoordinatorEvent[] = [
        {
          type: 'swarm_created',
          swarmId: 'swarm-1',
          data: { objective: 'Test 1' },
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          type: 'agent_spawned',
          swarmId: 'swarm-1',
          agentId: 'agent-1',
          data: { role: 'coder' },
          timestamp: new Date('2024-01-01T10:05:00Z')
        },
        {
          type: 'agent_spawned',
          swarmId: 'swarm-1',
          agentId: 'agent-2',
          data: { role: 'tester' },
          timestamp: new Date('2024-01-01T10:10:00Z')
        },
        {
          type: 'agent_terminated',
          swarmId: 'swarm-1',
          agentId: 'agent-1',
          data: {},
          timestamp: new Date('2024-01-01T10:15:00Z')
        }
      ];

      events.forEach(event => adapter.handleSwarmEvent(event));
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    it('should query swarm timeline', async () => { try {
      const timeline = await adapter.getSwarmTimeline('swarm-1');

      expect(timeline.length).toBeGreaterThanOrEqual(4);
      expect(timeline[0]).toHaveProperty('timestamp');
      expect(timeline[0]).toHaveProperty('type');
    });

    it('should query agent event history', async () => { try {
      const history = await adapter.getAgentEventHistory('agent-1');

      expect(history.length).toBeGreaterThanOrEqual(2); // spawned + terminated
    });

    it('should get swarm statistics', async () => { try {
      const stats = await adapter.getSwarmStatistics('swarm-1');

      expect(stats.totalEvents).toBeGreaterThanOrEqual(4);
      expect(stats.agentCount).toBeGreaterThanOrEqual(2);
      expect(stats.eventsByType).toHaveProperty('swarm_created');
      expect(stats.eventsByType).toHaveProperty('agent_spawned');
    });

    it('should filter events by date range', async () => { try {
      const result = await adapter.queryEventHistory({
        swarmId: 'swarm-1',
        startDate: new Date('2024-01-01T10:05:00Z'),
        endDate: new Date('2024-01-01T10:10:00Z')
      });

      expect(result.events.length).toBeGreaterThanOrEqual(2);
    });

    it('should paginate query results', async () => { try {
      const page1 = await adapter.queryEventHistory({
        swarmId: 'swarm-1',
        limit: 2,
        offset: 0
      });

      const page2 = await adapter.queryEventHistory({
        swarmId: 'swarm-1',
        limit: 2,
        offset: 2
      });

      expect(page1.events).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page2.events.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance', () => {
    it('should handle high-throughput event storage', async () => { try {
      const eventCount = 100;
      const events: SwarmCoordinatorEvent[] = Array.from({ length: eventCount }, (_, i) => ({
        type: 'agent_spawned',
        swarmId: 'perf-test-swarm',
        agentId: `agent-${i}`,
        data: { index: i },
        timestamp: new Date()
      }));

      const startTime = Date.now();

      events.forEach(event => adapter.handleSwarmEvent(event));

      // Wait for all events to persist
      await new Promise(resolve => setTimeout(resolve, 2000));

      const duration = Date.now() - startTime;

      // Query to verify
      const result = await eventStoreService.queryEvents({
        phaseId: 'perf-test-swarm'
      });

      expect(result.total).toBeGreaterThanOrEqual(eventCount);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should query events efficiently', async () => { try {
      // Seed 1000 events
      const events: SwarmCoordinatorEvent[] = Array.from({ length: 1000 }, (_, i) => ({
        type: 'agent_spawned',
        swarmId: 'query-perf-swarm',
        agentId: `agent-${i % 50}`,
        data: { index: i },
        timestamp: new Date(Date.now() - i * 1000)
      }));

      events.forEach(event => adapter.handleSwarmEvent(event));
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Query performance test
      const startTime = Date.now();
      const result = await adapter.queryEventHistory({
        swarmId: 'query-perf-swarm',
        limit: 100
      });
      const duration = Date.now() - startTime;

      expect(result.events).toHaveLength(100);
      expect(duration).toBeLessThan(100); // Should be under 100ms
    });
  });

  describe('Error Handling', () => {
    it('should handle disabled event storage', async () => { try {
      const disabledAdapter = new SwarmAdapter(mockWsServer, { enableEventStorage: false });

      const event: SwarmCoordinatorEvent = {
        type: 'swarm_created',
        swarmId: 'test-swarm',
        data: {},
        timestamp: new Date()
      };

      // Should not throw
      expect(() => disabledAdapter.handleSwarmEvent(event)).not.toThrow();

      // Query should return empty results
      const result = await disabledAdapter.queryEventHistory({ swarmId: 'test-swarm' });
      expect(result.events).toHaveLength(0);
    });

    it('should handle query errors gracefully', async () => { try {
      // Close event store
      await eventStoreService.close();

      // Query should not throw
      const result = await adapter.queryEventHistory({ swarmId: 'test-swarm' });
      expect(result).toEqual({ events: [], total: 0, hasMore: false });
    });
  });

  describe('WebSocket Integration', () => {
    it('should emit hierarchy change and persist event', async () => { try {
      const event: SwarmCoordinatorEvent = {
        type: 'agent_spawned',
        swarmId: 'test-swarm',
        agentId: 'agent-1',
        parentId: 'coordinator',
        data: { role: 'coder' },
        timestamp: new Date()
      };

      adapter.handleSwarmEvent(event);

      // WebSocket should emit immediately
      expect(mockWsServer.emitHierarchyChange).toHaveBeenCalledWith({
        type: 'spawn',
        agentId: 'agent-1',
        parentId: 'coordinator',
        metadata: { role: 'coder' }
      });

      // Event should persist asynchronously
      await new Promise(resolve => setTimeout(resolve, 200));

      const result = await eventStoreService.queryEvents({ agentId: 'agent-1' });
      expect(result.events).toHaveLength(1);
    });
  });
});
