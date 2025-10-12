/**
 * Unit Tests for Events API Endpoint
 *
 * Tests for GET /api/events
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import eventsRouter from '../../../packages/web-portal/src/server/routes/api/events.js';
import { errorHandler } from '../../../packages/web-portal/src/server/middleware/error-handler.js';
import { transparencyService } from '../../../packages/web-portal/src/server/services/transparency-service.js';

describe('Events API Endpoint', () => {
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/events', eventsRouter);
    app.use(errorHandler);

    await transparencyService.initialize();
  });

  describe('GET /api/events', () => {
    it('should return paginated events with default params', async () => {
      const response = await request(app).get('/api/events').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);

      const { pagination } = response.body;
      expect(pagination).toHaveProperty('page');
      expect(pagination).toHaveProperty('limit');
      expect(pagination).toHaveProperty('total');
      expect(pagination).toHaveProperty('totalPages');
      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(50);
    });

    it('should handle custom page and limit', async () => {
      const response = await request(app)
        .get('/api/events?page=2&limit=25')
        .expect(200);

      const { pagination } = response.body;
      expect(pagination.page).toBe(2);
      expect(pagination.limit).toBe(25);
    });

    it('should reject invalid page number', async () => {
      const response = await request(app)
        .get('/api/events?page=0')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject limit exceeding 1000', async () => {
      const response = await request(app)
        .get('/api/events?limit=1001')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should filter by event type', async () => {
      const response = await request(app)
        .get('/api/events?type=spawned')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by severity', async () => {
      const response = await request(app)
        .get('/api/events?severity=critical')
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });

    it('should reject invalid severity', async () => {
      const response = await request(app)
        .get('/api/events?severity=invalid')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should filter by agent ID', async () => {
      const response = await request(app)
        .get('/api/events?agentId=test-agent-id')
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });

    it('should filter by time range', async () => {
      const startTime = new Date(Date.now() - 3600000).toISOString();
      const endTime = new Date().toISOString();

      const response = await request(app)
        .get(`/api/events?startTime=${startTime}&endTime=${endTime}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });

    it('should return events sorted newest first', async () => {
      const response = await request(app).get('/api/events?limit=10').expect(200);

      const { data } = response.body;
      if (data.length >= 2) {
        const firstTimestamp = new Date(data[0].timestamp).getTime();
        const secondTimestamp = new Date(data[1].timestamp).getTime();
        expect(firstTimestamp).toBeGreaterThanOrEqual(secondTimestamp);
      }
    });

    it('should calculate correct pagination metadata', async () => {
      const response = await request(app).get('/api/events?limit=10').expect(200);

      const { pagination } = response.body;
      expect(pagination.totalPages).toBe(
        Math.ceil(pagination.total / pagination.limit)
      );
    });
  });
});
