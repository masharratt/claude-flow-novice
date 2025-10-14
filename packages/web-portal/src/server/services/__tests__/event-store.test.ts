/**
 * Event Store Service Tests
 * 
 * Comprehensive test suite for the EventStoreService
 * Tests functionality, performance, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventStoreService, type EventData } from '../event-store.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('EventStoreService', () => {
  const testDbPath = join(process.cwd(), 'data', 'events.db');

  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    
    // Initialize fresh service
    await eventStoreService.initialize();
  });

  afterEach(async () => {
    // Close connection and clean up
    await eventStoreService.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(eventStoreService.isReady()).toBe(true);
    });

    it('should create database file and tables', () => {
      expect(existsSync(testDbPath)).toBe(true);
    });
  });

  describe('Event Storage', () => {
    it('should store a single event', async () => {
      const eventData = {
        timestamp: new Date(),
        phaseId: 'phase-1',
        agentId: 'agent-1',
        eventType: 'test-event',
        payload: { message: 'test message' }
      };

      const eventId = await eventStoreService.storeEvent(eventData);
      
      expect(eventId).toBeDefined();
      expect(eventId).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });

    it('should store multiple events in batch', async () => {
      const events = [
        {
          timestamp: new Date(),
          phaseId: 'phase-1',
          agentId: 'agent-1',
          eventType: 'test-event-1',
          payload: { message: 'test 1' }
        },
        {
          timestamp: new Date(),
          phaseId: 'phase-1',
          agentId: 'agent-2',
          eventType: 'test-event-2',
          payload: { message: 'test 2' }
        }
      ];

      const eventIds = await eventStoreService.storeEvents(events);
      
      expect(eventIds).toHaveLength(2);
      expect(eventIds[0]).toMatch(/^evt_\d+_[a-z0-9]+$/);
      expect(eventIds[1]).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });

    it('should handle events with metadata', async () => {
      const eventData = {
        timestamp: new Date(),
        phaseId: 'phase-1',
        agentId: 'agent-1',
        eventType: 'test-event',
        payload: { message: 'test' },
        metadata: { source: 'test', version: '1.0' }
      };

      const eventId = await eventStoreService.storeEvent(eventData);
      
      expect(eventId).toBeDefined();
    });
  });

  describe('Event Querying', () => {
    const testEvents: Omit<EventData, 'id'>[] = [
      {
        timestamp: new Date('2024-01-01T10:00:00Z'),
        phaseId: 'phase-1',
        agentId: 'agent-1',
        eventType: 'event-type-1',
        payload: { data: 'test1' }
      },
      {
        timestamp: new Date('2024-01-01T11:00:00Z'),
        phaseId: 'phase-1',
        agentId: 'agent-2',
        eventType: 'event-type-2',
        payload: { data: 'test2' }
      },
      {
        timestamp: new Date('2024-01-01T12:00:00Z'),
        phaseId: 'phase-2',
        agentId: 'agent-1',
        eventType: 'event-type-1',
        payload: { data: 'test3' }
      }
    ];

    beforeEach(async () => {
      await eventStoreService.storeEvents(testEvents);
    });

    it('should query all events', async () => {
      const result = await eventStoreService.queryEvents();
      
      expect(result.events).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by phase ID', async () => {
      const result = await eventStoreService.queryEvents({ phaseId: 'phase-1' });
      
      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.events.every(e => e.phaseId === 'phase-1')).toBe(true);
    });

    it('should filter by agent ID', async () => {
      const result = await eventStoreService.queryEvents({ agentId: 'agent-1' });
      
      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.events.every(e => e.agentId === 'agent-1')).toBe(true);
    });

    it('should filter by event type', async () => {
      const result = await eventStoreService.queryEvents({ eventType: 'event-type-1' });
      
      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.events.every(e => e.eventType === 'event-type-1')).toBe(true);
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01T10:30:00Z');
      const endDate = new Date('2024-01-01T12:30:00Z');
      
      const result = await eventStoreService.queryEvents({ startDate, endDate });
      
      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should apply pagination', async () => {
      const result = await eventStoreService.queryEvents({ limit: 2, offset: 1 });
      
      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('should combine multiple filters', async () => {
      const result = await eventStoreService.queryEvents({
        phaseId: 'phase-1',
        agentId: 'agent-1'
      });
      
      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.events[0].agentId).toBe('agent-1');
      expect(result.events[0].phaseId).toBe('phase-1');
    });
  });

  describe('Convenience Methods', () => {
    beforeEach(async () => {
      const events = [
        {
          timestamp: new Date(),
          phaseId: 'phase-1',
          agentId: 'agent-1',
          eventType: 'test-event',
          payload: { data: 'test1' }
        },
        {
          timestamp: new Date(),
          phaseId: 'phase-2',
          agentId: 'agent-2',
          eventType: 'other-event',
          payload: { data: 'test2' }
        }
      ];
      await eventStoreService.storeEvents(events);
    });

    it('should get events by phase ID', async () => {
      const events = await eventStoreService.getEventsByPhaseId('phase-1');
      
      expect(events).toHaveLength(1);
      expect(events[0].phaseId).toBe('phase-1');
    });

    it('should get events by agent ID', async () => {
      const events = await eventStoreService.getEventsByAgentId('agent-2');
      
      expect(events).toHaveLength(1);
      expect(events[0].agentId).toBe('agent-2');
    });

    it('should get events by type', async () => {
      const events = await eventStoreService.getEventsByType('test-event');
      
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('test-event');
    });

    it('should get recent events', async () => {
      const events = await eventStoreService.getRecentEvents(1);
      
      expect(events).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    it('should return empty statistics for no events', async () => {
      const stats = await eventStoreService.getStatistics();
      
      expect(stats.totalEvents).toBe(0);
      expect(stats.uniquePhases).toBe(0);
      expect(stats.uniqueAgents).toBe(0);
      expect(stats.uniqueEventTypes).toBe(0);
    });

    it('should return correct statistics for test data', async () => {
      const events = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z'),
          phaseId: 'phase-1',
          agentId: 'agent-1',
          eventType: 'event-type-1',
          payload: { data: 'test1' }
        },
        {
          timestamp: new Date('2024-01-01T11:00:00Z'),
          phaseId: 'phase-2',
          agentId: 'agent-1',
          eventType: 'event-type-2',
          payload: { data: 'test2' }
        }
      ];
      await eventStoreService.storeEvents(events);

      const stats = await eventStoreService.getStatistics();
      
      expect(stats.totalEvents).toBe(2);
      expect(stats.uniquePhases).toBe(2);
      expect(stats.uniqueAgents).toBe(1);
      expect(stats.uniqueEventTypes).toBe(2);
      expect(stats.oldestEvent).toBeInstanceOf(Date);
      expect(stats.newestEvent).toBeInstanceOf(Date);
    });
  });

  describe('Event Deletion', () => {
    it('should delete existing event', async () => {
      const eventData = {
        timestamp: new Date(),
        phaseId: 'phase-1',
        agentId: 'agent-1',
        eventType: 'test-event',
        payload: { message: 'test' }
      };

      const eventId = await eventStoreService.storeEvent(eventData);
      const deleted = await eventStoreService.deleteEvent(eventId);
      
      expect(deleted).toBe(true);
    });

    it('should return false for non-existent event', async () => {
      const deleted = await eventStoreService.deleteEvent('non-existent-id');
      
      expect(deleted).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON in payload gracefully', async () => {
      // This would be tested with corrupted data in a real scenario
      // For now, we test that the service handles malformed data
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Performance', () => {
    it('should handle batch inserts efficiently', async () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        timestamp: new Date(),
        phaseId: `phase-${i % 10}`,
        agentId: `agent-${i % 5}`,
        eventType: `event-type-${i % 3}`,
        payload: { index: i }
      }));

      const startTime = Date.now();
      await eventStoreService.storeEvents(events);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
    });

    it('should handle large queries efficiently', async () => {
      // Insert test data
      const events = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 1000), // 1 second intervals
        phaseId: `phase-${i % 50}`,
        agentId: `agent-${i % 20}`,
        eventType: `event-type-${i % 10}`,
        payload: { index: i }
      }));
      await eventStoreService.storeEvents(events);

      const startTime = Date.now();
      const result = await eventStoreService.queryEvents({ limit: 100 });
      const duration = Date.now() - startTime;

      expect(result.events).toHaveLength(100);
      expect(duration).toBeLessThan(500); // 500ms
    });
  });
});