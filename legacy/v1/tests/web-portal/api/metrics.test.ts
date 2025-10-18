/**
 * Unit Tests for Metrics API Endpoint
 *
 * Tests for GET /api/metrics
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import metricsRouter from '../../../packages/web-portal/src/server/routes/api/metrics.js';
import { errorHandler } from '../../../packages/web-portal/src/server/middleware/error-handler.js';
import { transparencyService } from '../../../packages/web-portal/src/server/services/transparency-service.js';

describe('Metrics API Endpoint', () => {
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/metrics', metricsRouter);
    app.use(errorHandler);

    await transparencyService.initialize();
  });

  describe('GET /api/metrics', () => {
    it('should return system metrics', async () => {
      const response = await request(app).get('/api/metrics').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('totalAgents');
      expect(response.body.data).toHaveProperty('agentsByLevel');
      expect(response.body.data).toHaveProperty('agentsByState');
      expect(response.body.data).toHaveProperty('agentsByType');
      expect(response.body.data).toHaveProperty('totalTokensConsumed');
      expect(response.body.data).toHaveProperty('averageExecutionTimeMs');
      expect(response.body.data).toHaveProperty('eventStreamStats');
    });

    it('should have 10 second cache', async () => {
      const response = await request(app).get('/api/metrics').expect(200);

      expect(response.headers['cache-control']).toContain('max-age=10');
    });

    it('should return valid metric types', async () => {
      const response = await request(app).get('/api/metrics').expect(200);

      const { data } = response.body;
      expect(typeof data.totalAgents).toBe('number');
      expect(typeof data.totalTokensConsumed).toBe('number');
      expect(typeof data.averageExecutionTimeMs).toBe('number');
      expect(typeof data.failureRate).toBe('number');
      expect(typeof data.hierarchyDepth).toBe('number');
    });

    it('should return event stream statistics', async () => {
      const response = await request(app).get('/api/metrics').expect(200);

      const { eventStreamStats } = response.body.data;
      expect(eventStreamStats).toHaveProperty('totalEvents');
      expect(eventStreamStats).toHaveProperty('eventsPerSecond');
      expect(eventStreamStats).toHaveProperty('eventTypes');
      expect(typeof eventStreamStats.totalEvents).toBe('number');
      expect(typeof eventStreamStats.eventsPerSecond).toBe('number');
    });
  });
});
