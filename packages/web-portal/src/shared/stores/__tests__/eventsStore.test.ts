/**
 * Events Store Tests
 * Coverage: event management, filtering, pagination, buffering, auto-pruning
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEventsStore, eventsSelectors, Event, EventType, EventSeverity } from '../eventsStore';

describe('EventsStore', () => {
  beforeEach(() => {
    useEventsStore.getState().reset();
  });

  describe('Event Management', () => {
    it('should add event', () => {
      useEventsStore.getState().addEvent({
        type: 'agent.spawned',
        severity: 'info',
        message: 'Agent spawned',
        agentId: 'agent-1'
      });

      const state = useEventsStore.getState();
      expect(state.events).toHaveLength(1);
      expect(state.events[0].type).toBe('agent.spawned');
    });

    it('should add multiple events', () => {
      const events = [
        { type: 'agent.spawned' as EventType, severity: 'info' as EventSeverity, message: 'Agent 1' },
        { type: 'agent.completed' as EventType, severity: 'info' as EventSeverity, message: 'Agent 2' }
      ];

      useEventsStore.getState().addEvents(events);

      const state = useEventsStore.getState();
      expect(state.events).toHaveLength(2);
    });

    it('should auto-generate event ID', () => {
      useEventsStore.getState().addEvent({
        type: 'system.info',
        severity: 'info',
        message: 'Test'
      });

      const state = useEventsStore.getState();
      expect(state.events[0].id).toMatch(/^evt_/);
    });

    it('should auto-generate timestamp', () => {
      const before = Date.now();
      useEventsStore.getState().addEvent({
        type: 'system.info',
        severity: 'info',
        message: 'Test'
      });
      const after = Date.now();

      const state = useEventsStore.getState();
      expect(state.events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(state.events[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should mark event as read', () => {
      useEventsStore.getState().addEvent({
        type: 'system.info',
        severity: 'info',
        message: 'Test'
      });

      const eventId = useEventsStore.getState().events[0].id;
      useEventsStore.getState().markEventAsRead(eventId);

      const state = useEventsStore.getState();
      expect(state.events[0].read).toBe(true);
    });

    it('should mark all events as read', () => {
      useEventsStore.getState().addEvents([
        { type: 'system.info' as EventType, severity: 'info' as EventSeverity, message: 'Test 1' },
        { type: 'system.info' as EventType, severity: 'info' as EventSeverity, message: 'Test 2' }
      ]);

      useEventsStore.getState().markAllAsRead();

      const state = useEventsStore.getState();
      expect(state.events.every(e => e.read === true)).toBe(true);
    });

    it('should clear all events', () => {
      useEventsStore.getState().addEvents([
        { type: 'system.info' as EventType, severity: 'info' as EventSeverity, message: 'Test 1' },
        { type: 'system.info' as EventType, severity: 'info' as EventSeverity, message: 'Test 2' }
      ]);

      useEventsStore.getState().clearEvents();

      const state = useEventsStore.getState();
      expect(state.events).toHaveLength(0);
    });
  });

  describe('Auto-Pruning', () => {
    it('should auto-prune when exceeding max events', () => {
      // Add 1100 events (max is 1000)
      for (let i = 0; i < 1100; i++) {
        useEventsStore.getState().addEvent({
          type: 'system.info',
          severity: 'info',
          message: `Event ${i}`
        });
      }

      const state = useEventsStore.getState();
      expect(state.events.length).toBeLessThanOrEqual(1000);
    });

    it('should prune oldest events first', () => {
      // Add 1100 events
      for (let i = 0; i < 1100; i++) {
        useEventsStore.getState().addEvent({
          type: 'system.info',
          severity: 'info',
          message: `Event ${i}`,
          metadata: { index: i }
        });
      }

      const state = useEventsStore.getState();
      // Should have removed first 100 events
      expect(state.events[0].metadata?.index).toBeGreaterThanOrEqual(100);
    });

    it('should prune by age', () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;

      // Manually add events with different timestamps
      useEventsStore.setState({
        events: [
          {
            id: 'evt-1',
            type: 'system.info',
            severity: 'info',
            message: 'Old event',
            timestamp: twoHoursAgo
          },
          {
            id: 'evt-2',
            type: 'system.info',
            severity: 'info',
            message: 'Recent event',
            timestamp: oneHourAgo
          }
        ]
      });

      // Prune events older than 90 minutes
      useEventsStore.getState().pruneByAge(90 * 60 * 1000);

      const state = useEventsStore.getState();
      expect(state.events).toHaveLength(1);
      expect(state.events[0].message).toBe('Recent event');
    });

    it('should manually prune events', () => {
      // Add events beyond max
      for (let i = 0; i < 1100; i++) {
        useEventsStore.setState((state) => ({
          events: [
            ...state.events,
            {
              id: `evt-${i}`,
              type: 'system.info' as EventType,
              severity: 'info' as EventSeverity,
              message: `Event ${i}`,
              timestamp: Date.now()
            }
          ]
        }));
      }

      useEventsStore.getState().pruneEvents();

      const state = useEventsStore.getState();
      expect(state.events.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      const events = [
        { type: 'agent.spawned' as EventType, severity: 'info' as EventSeverity, message: 'Agent 1', agentId: 'agent-1' },
        { type: 'agent.completed' as EventType, severity: 'info' as EventSeverity, message: 'Agent 2', agentId: 'agent-2' },
        { type: 'system.error' as EventType, severity: 'error' as EventSeverity, message: 'Error 1' },
        { type: 'system.warning' as EventType, severity: 'warning' as EventSeverity, message: 'Warning 1' }
      ];

      useEventsStore.getState().addEvents(events);
    });

    it('should filter by type', () => {
      useEventsStore.getState().setFilters({ types: ['agent.spawned'] });

      const state = useEventsStore.getState();
      const filtered = eventsSelectors.getFilteredEvents(state);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe('agent.spawned');
    });

    it('should filter by severity', () => {
      useEventsStore.getState().setFilters({ severities: ['error'] });

      const state = useEventsStore.getState();
      const filtered = eventsSelectors.getFilteredEvents(state);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].severity).toBe('error');
    });

    it('should filter by agent ID', () => {
      useEventsStore.getState().setFilters({ agentIds: ['agent-1'] });

      const state = useEventsStore.getState();
      const filtered = eventsSelectors.getFilteredEvents(state);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].agentId).toBe('agent-1');
    });

    it('should filter by time range', () => {
      const now = Date.now();
      useEventsStore.getState().setFilters({
        startTime: now - 1000,
        endTime: now + 1000
      });

      const state = useEventsStore.getState();
      const filtered = eventsSelectors.getFilteredEvents(state);

      expect(filtered.length).toBeGreaterThan(0);
    });

    it('should filter by read status', () => {
      const eventId = useEventsStore.getState().events[0].id;
      useEventsStore.getState().markEventAsRead(eventId);
      useEventsStore.getState().setFilters({ read: false });

      const state = useEventsStore.getState();
      const filtered = eventsSelectors.getFilteredEvents(state);

      expect(filtered.every(e => e.read === false)).toBe(true);
    });

    it('should clear filters', () => {
      useEventsStore.getState().setFilters({ types: ['agent.spawned'] });
      useEventsStore.getState().clearFilters();

      const state = useEventsStore.getState();
      expect(state.filters).toEqual({});
    });
  });

  describe('Pagination', () => {
    beforeEach(() => {
      // Add 150 events
      const events = Array.from({ length: 150 }, (_, i) => ({
        type: 'system.info' as EventType,
        severity: 'info' as EventSeverity,
        message: `Event ${i}`
      }));

      useEventsStore.getState().addEvents(events);
    });

    it('should paginate events', () => {
      const state = useEventsStore.getState();
      const paginated = eventsSelectors.getPaginatedEvents(state);

      expect(paginated).toHaveLength(50); // Default page size
    });

    it('should navigate to next page', () => {
      useEventsStore.getState().nextPage();

      const state = useEventsStore.getState();
      expect(state.pagination.page).toBe(2);
    });

    it('should navigate to previous page', () => {
      useEventsStore.getState().nextPage();
      useEventsStore.getState().prevPage();

      const state = useEventsStore.getState();
      expect(state.pagination.page).toBe(1);
    });

    it('should not go below page 1', () => {
      useEventsStore.getState().prevPage();

      const state = useEventsStore.getState();
      expect(state.pagination.page).toBe(1);
    });

    it('should not exceed max pages', () => {
      useEventsStore.getState().nextPage();
      useEventsStore.getState().nextPage();
      useEventsStore.getState().nextPage();
      useEventsStore.getState().nextPage(); // Try to go beyond max

      const state = useEventsStore.getState();
      const maxPage = Math.ceil(state.pagination.total / state.pagination.pageSize);
      expect(state.pagination.page).toBeLessThanOrEqual(maxPage);
    });

    it('should update page size', () => {
      useEventsStore.getState().setPagination({ pageSize: 25 });

      const state = useEventsStore.getState();
      expect(state.pagination.pageSize).toBe(25);

      const paginated = eventsSelectors.getPaginatedEvents(state);
      expect(paginated).toHaveLength(25);
    });
  });

  describe('Computed Selectors', () => {
    beforeEach(() => {
      const events = [
        { type: 'agent.spawned' as EventType, severity: 'info' as EventSeverity, message: 'Agent 1', agentId: 'agent-1' },
        { type: 'system.error' as EventType, severity: 'error' as EventSeverity, message: 'Error 1' },
        { type: 'system.warning' as EventType, severity: 'warning' as EventSeverity, message: 'Warning 1' }
      ];

      useEventsStore.getState().addEvents(events);
      useEventsStore.getState().markEventAsRead(useEventsStore.getState().events[0].id);
    });

    it('should get unread count', () => {
      const state = useEventsStore.getState();
      const unreadCount = eventsSelectors.getUnreadCount(state);

      expect(unreadCount).toBe(2);
    });

    it('should get events by severity', () => {
      const state = useEventsStore.getState();
      const errors = eventsSelectors.getEventsBySeverity(state, 'error');

      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe('error');
    });

    it('should get events by type', () => {
      const state = useEventsStore.getState();
      const agentEvents = eventsSelectors.getEventsByType(state, 'agent.spawned');

      expect(agentEvents).toHaveLength(1);
      expect(agentEvents[0].type).toBe('agent.spawned');
    });

    it('should get recent events', () => {
      const state = useEventsStore.getState();
      const recent = eventsSelectors.getRecentEvents(state, 2);

      expect(recent).toHaveLength(2);
      // Should be in reverse chronological order
      expect(recent[0].timestamp).toBeGreaterThanOrEqual(recent[1].timestamp);
    });

    it('should get events for agent', () => {
      const state = useEventsStore.getState();
      const agentEvents = eventsSelectors.getEventsForAgent(state, 'agent-1');

      expect(agentEvents).toHaveLength(1);
      expect(agentEvents[0].agentId).toBe('agent-1');
    });

    it('should detect active filters', () => {
      let state = useEventsStore.getState();
      expect(eventsSelectors.hasActiveFilters(state)).toBe(false);

      useEventsStore.getState().setFilters({ types: ['agent.spawned'] });
      state = useEventsStore.getState();
      expect(eventsSelectors.hasActiveFilters(state)).toBe(true);
    });
  });

  describe('State Management', () => {
    it('should set loading state', () => {
      useEventsStore.getState().setLoading(true);
      expect(useEventsStore.getState().loading).toBe(true);
    });

    it('should set error state', () => {
      useEventsStore.getState().setError('Test error');
      expect(useEventsStore.getState().error).toBe('Test error');
    });

    it('should reset to initial state', () => {
      useEventsStore.getState().addEvent({
        type: 'system.info',
        severity: 'info',
        message: 'Test'
      });
      useEventsStore.getState().reset();

      const state = useEventsStore.getState();
      expect(state.events).toHaveLength(0);
      expect(state.filters).toEqual({});
      expect(state.pagination.page).toBe(1);
    });
  });
});
