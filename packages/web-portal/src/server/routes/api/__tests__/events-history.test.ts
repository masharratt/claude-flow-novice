/**
 * Events History API Route Tests
 *
 * Tests REST API endpoints for historical event queries
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import eventsHistoryRouter from '../events-history.js';
import { eventStoreService } from '../../../services/event-store.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Mock authentication middleware
vi.mock('../../../middleware/api-key-auth.js', () => ({
  authenticateApiKey: (req: any, res: any, next: any) => next()
}));

// Mock rate limiter
vi.mock('../../../middleware/rate-limiter.js', () => ({
  rateLimiter: () => (req: any, res: any, next: any) => next()
}));

describe('Events History API Routes', () => {
  let app: Express;
  const testDbPath = join(process.cwd(), 'data', 'events.db');

  beforeEach(async () => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // Initialize event store
    await eventStoreService.initialize();

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/events-history', eventsHistoryRouter);

    // Seed test data
    const events = [
      {
        timestamp: new Date('2024-01-01T10:00:00Z'),
        phaseId: 'swarm-1',
        agentId: 'agent-1',
        eventType: 'swarm_agent_spawned',
        payload: { role: 'coder', data: 'test1' }
      },
      {
        timestamp: new Date('2024-01-01T11:00:00Z'),
        phaseId: 'swarm-1',
        agentId: 'agent-2',
        eventType: 'swarm_agent_spawned',
        payload: { role: 'tester', data: 'test2' }
      },
      {
        timestamp: new Date('2024-01-01T12:00:00Z'),
        phaseId: 'swarm-2',
        agentId: 'agent-3',
        eventType: 'swarm_swarm_created',
        payload: { objective: 'test objective' }
      }
    ];

    await eventStoreService.storeEvents(events);
  });

  afterEach(async () => {
    await eventStoreService.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('GET /api/events-history', () => {
    it('should query all events with default pagination', async () => {
      const response = await request(app)
        .get('/api/events-history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
      expect(response.body.pagination).toMatchObject({
        total: expect.any(Number),
        limit: 100,
        offset: 0
      });
    });

    it('should filter events by swarmId', async () => {
      const response = await request(app)
        .get('/api/events-history?swarmId=swarm-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data.every((e: any) => e.phaseId === 'swarm-1')).toBe(true);
    });

    it('should filter events by agentId', async () => {
      const response = await request(app)
        .get('/api/events-history?agentId=agent-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].agentId).toBe('agent-1');
    });

    it('should filter events by eventType', async () => {
      const response = await request(app)
        .get('/api/events-history?eventType=swarm_agent_spawned')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
    });

    it('should filter events by date range', async () => {
      const response = await request(app)
        .get('/api/events-history?startTime=2024-01-01T10:30:00Z&endTime=2024-01-01T12:30:00Z')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
    });

    it('should apply custom pagination', async () => {
      const response = await request(app)
        .get('/api/events-history?limit=2&offset=1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.offset).toBe(1);
    });

    it('should enforce maximum limit of 1000', async () => {
      const response = await request(app)
        .get('/api/events-history?limit=5000')
        .expect(200);

      expect(response.body.pagination.limit).toBe(1000);
    });

    it('should return 400 for invalid date format', async () => {
      const response = await request(app)
        .get('/api/events-history?startTime=invalid-date')
        .expect(400);

      expect(response.body.error).toBe('Invalid startTime format');
    });

    it('should include performance metrics', async () => {
      const response = await request(app)
        .get('/api/events-history')
        .expect(200);

      expect(response.body.performance).toBeDefined();
      expect(response.body.performance.queryTimeMs).toBeDefined();
    });
  });

  describe('GET /api/events-history/swarm/:swarmId', () => {
    it('should get events for specific swarm', async () => {
      const response = await request(app)
        .get('/api/events-history/swarm/swarm-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.swarmId).toBe('swarm-1');
      expect(response.body.data.length).toBe(2);
      expect(response.body.count).toBe(2);
      expect(response.body.total).toBeGreaterThanOrEqual(2);
    });

    it('should apply limit parameter', async () => {
      const response = await request(app)
        .get('/api/events-history/swarm/swarm-1?limit=1')
        .expect(200);

      expect(response.body.data.length).toBe(1);
    });

    it('should return empty array for non-existent swarm', async () => {
      const response = await request(app)
        .get('/api/events-history/swarm/non-existent')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.count).toBe(0);
    });
  });

  describe('GET /api/events-history/agent/:agentId', () => {
    it('should get events for specific agent', async () => {
      const response = await request(app)
        .get('/api/events-history/agent/agent-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.agentId).toBe('agent-1');
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].agentId).toBe('agent-1');
    });

    it('should apply limit parameter', async () => {
      const response = await request(app)
        .get('/api/events-history/agent/agent-1?limit=50')
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(50);
    });
  });

  describe('GET /api/events-history/statistics/swarm/:swarmId', () => {
    it('should return statistics for swarm', async () => {
      const response = await request(app)
        .get('/api/events-history/statistics/swarm/swarm-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.swarmId).toBe('swarm-1');
      expect(response.body.statistics).toBeDefined();
      expect(response.body.statistics.totalEvents).toBeGreaterThanOrEqual(2);
      expect(response.body.statistics.eventsByType).toBeDefined();
      expect(response.body.statistics.agentCount).toBe(2);
      expect(response.body.statistics.startTime).toBeDefined();
      expect(response.body.statistics.endTime).toBeDefined();
    });

    it('should include events over time', async () => {
      const response = await request(app)
        .get('/api/events-history/statistics/swarm/swarm-1')
        .expect(200);

      expect(response.body.statistics.eventsOverTime).toBeInstanceOf(Array);
    });

    it('should return zero statistics for non-existent swarm', async () => {
      const response = await request(app)
        .get('/api/events-history/statistics/swarm/non-existent')
        .expect(200);

      expect(response.body.statistics.totalEvents).toBe(0);
      expect(response.body.statistics.agentCount).toBe(0);
    });
  });

  describe('GET /api/events-history/recent', () => {
    it('should get recent events', async () => {
      const response = await request(app)
        .get('/api/events-history/recent')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.count).toBeGreaterThanOrEqual(3);
    });

    it('should apply limit parameter', async () => {
      const response = await request(app)
        .get('/api/events-history/recent?limit=2')
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('should enforce maximum limit of 500', async () => {
      const response = await request(app)
        .get('/api/events-history/recent?limit=1000')
        .expect(200);

      // Should be capped at 500 for recent endpoint
      expect(response.body.data.length).toBeLessThanOrEqual(500);
    });
  });

  describe('DELETE /api/events-history/cleanup', () => {
    it('should trigger manual cleanup', async () => {
      const response = await request(app)
        .delete('/api/events-history/cleanup')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deletedCount).toBeDefined();
      expect(typeof response.body.deletedCount).toBe('number');
    });

    it('should return message about cleanup', async () => {
      const response = await request(app)
        .delete('/api/events-history/cleanup')
        .expect(200);

      expect(response.body.message).toContain('Cleaned up');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await eventStoreService.close();

      const response = await request(app)
        .get('/api/events-history')
        .expect(500);

      expect(response.body.error).toBe('Failed to query event history');
      expect(response.body.message).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle queries efficiently', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/api/events-history?limit=100')
        .expect(200);

      const duration = Date.now() - startTime;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(500); // Should complete in under 500ms
    });
  });
});
