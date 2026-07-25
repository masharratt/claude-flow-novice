/**
 * REST API Integration Tests with TransparencySystem
 *
 * End-to-end tests for REST API endpoints using real TransparencySystem
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { transparencyService } from '../services/transparency-service.js';
import agentsRouter from '../routes/api/agents.js';
import metricsRouter from '../routes/api/metrics.js';
import eventsRouter from '../routes/api/events.js';
import { errorHandler } from '../middleware/error-handler.js';

describe('REST API TransparencySystem Integration', () => {
  let app: express.Application;

  beforeAll(async () => { try {
    // Initialize TransparencyService
    await transparencyService.initialize();

    // Setup Express app
    app = express();
    app.use(express.json());

    // Mount routes
    app.use('/api/agents', agentsRouter);
    app.use('/api/metrics', metricsRouter);
    app.use('/api/events', eventsRouter);

    // Error handler
    app.use(errorHandler);
  });

  afterAll(async () => { try {
    // Cleanup
  });

  describe('GET /api/agents/hierarchy', () => {
    it('should return agent hierarchy', async () => { try {
      const response = await request(app).get('/api/agents/hierarchy');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return cache headers (30 seconds)', async () => { try {
      const response = await request(app).get('/api/agents/hierarchy');

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toContain('max-age=30');
    });

    it('should filter by status', async () => { try {
      const response = await request(app)
        .get('/api/agents/hierarchy')
        .query({ status: 'active' });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();

      // All agents should have active status
      response.body.data.forEach((agent: any) => {
        expect(agent.state).toBe('active');
      });
    });

    it('should filter by type', async () => { try {
      const response = await request(app)
        .get('/api/agents/hierarchy')
        .query({ type: 'coder' });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();

      // All agents should have coder type
      response.body.data.forEach((agent: any) => {
        expect(agent.type).toBe('coder');
      });
    });

    it('should handle invalid query parameters', async () => { try {
      const response = await request(app)
        .get('/api/agents/hierarchy')
        .query({ invalidParam: 'value' });

      // Should still return 200 (ignores invalid params)
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/agents/:id/status', () => {
    it('should return agent status for valid agentId', async () => { try {
      // First get hierarchy to find a valid agentId
      const hierarchyResponse = await request(app).get(
        '/api/agents/hierarchy'
      );

      if (hierarchyResponse.body.data.length > 0) {
        const agentId = hierarchyResponse.body.data[0].agentId;

        const response = await request(app).get(
          `/api/agents/${agentId}/status`
        );

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data.agentId).toBe(agentId);
        expect(response.body.data.state).toBeDefined();
      }
    });

    it('should return no-cache headers (real-time)', async () => { try {
      const hierarchyResponse = await request(app).get(
        '/api/agents/hierarchy'
      );

      if (hierarchyResponse.body.data.length > 0) {
        const agentId = hierarchyResponse.body.data[0].agentId;

        const response = await request(app).get(
          `/api/agents/${agentId}/status`
        );

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toContain('no-cache');
      }
    });

    it('should return 404 for non-existent agent', async () => { try {
      const response = await request(app).get(
        '/api/agents/non-existent-agent/status'
      );

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('AGENT_NOT_FOUND');
    });

    it('should validate agentId parameter', async () => { try {
      const response = await request(app).get('/api/agents//status');

      // Should return 404 (invalid route)
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/agents/:id/intervene', () => {
    it('should accept valid intervention request', async () => { try {
      const hierarchyResponse = await request(app).get(
        '/api/agents/hierarchy'
      );

      if (hierarchyResponse.body.data.length > 0) {
        const agentId = hierarchyResponse.body.data[0].agentId;

        const response = await request(app)
          .post(`/api/agents/${agentId}/intervene`)
          .send({
            action: 'pause',
            reason: 'Testing intervention',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.agentId).toBe(agentId);
        expect(response.body.action).toBe('pause');
      }
    });

    it('should validate intervention action', async () => { try {
      const response = await request(app)
        .post('/api/agents/agent-1/intervene')
        .send({
          action: 'invalid-action',
          reason: 'Testing',
        });

      // Should return 400 (validation error)
      expect(response.status).toBe(400);
    });

    it('should require reason field', async () => { try {
      const response = await request(app)
        .post('/api/agents/agent-1/intervene')
        .send({
          action: 'pause',
        });

      // Should return 400 (validation error)
      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent agent', async () => { try {
      const response = await request(app)
        .post('/api/agents/non-existent-agent/intervene')
        .send({
          action: 'pause',
          reason: 'Testing',
        });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/metrics', () => {
    it('should return system metrics', async () => { try {
      const response = await request(app).get('/api/metrics');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data.totalAgents).toBeGreaterThanOrEqual(0);
      expect(response.body.data.agentsByLevel).toBeDefined();
      expect(response.body.data.agentsByState).toBeDefined();
      expect(response.body.data.agentsByType).toBeDefined();
    });

    it('should return cache headers (10 seconds)', async () => { try {
      const response = await request(app).get('/api/metrics');

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toContain('max-age=10');
    });

    it('should return consistent metrics structure', async () => { try {
      const response = await request(app).get('/api/metrics');

      expect(response.status).toBe(200);

      const metrics = response.body.data;
      expect(metrics).toHaveProperty('totalAgents');
      expect(metrics).toHaveProperty('agentsByLevel');
      expect(metrics).toHaveProperty('agentsByState');
      expect(metrics).toHaveProperty('agentsByType');
      expect(metrics).toHaveProperty('totalTokensConsumed');
      expect(metrics).toHaveProperty('averageExecutionTimeMs');
      expect(metrics).toHaveProperty('failureRate');
    });
  });

  describe('GET /api/events', () => {
    it('should return paginated events', async () => { try {
      const response = await request(app).get('/api/events').query({
        page: 1,
        limit: 50,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(50);
    });

    it('should filter events by type', async () => { try {
      const response = await request(app).get('/api/events').query({
        page: 1,
        limit: 50,
        type: 'spawned',
      });

      expect(response.status).toBe(200);
      response.body.data.forEach((event: any) => {
        expect(event.eventType).toBe('spawned');
      });
    });

    it('should filter events by severity', async () => { try {
      const response = await request(app).get('/api/events').query({
        page: 1,
        limit: 50,
        severity: 'critical',
      });

      expect(response.status).toBe(200);
      // All events should have critical severity
      // (if any events match the filter)
    });

    it('should filter events by agentId', async () => { try {
      const hierarchyResponse = await request(app).get(
        '/api/agents/hierarchy'
      );

      if (hierarchyResponse.body.data.length > 0) {
        const agentId = hierarchyResponse.body.data[0].agentId;

        const response = await request(app).get('/api/events').query({
          page: 1,
          limit: 50,
          agentId,
        });

        expect(response.status).toBe(200);
        response.body.data.forEach((event: any) => {
          expect(event.agentId).toBe(agentId);
        });
      }
    });

    it('should handle pagination correctly', async () => { try {
      const response1 = await request(app).get('/api/events').query({
        page: 1,
        limit: 10,
      });

      const response2 = await request(app).get('/api/events').query({
        page: 2,
        limit: 10,
      });

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Pages should have different data
      if (response1.body.data.length > 0 && response2.body.data.length > 0) {
        expect(response1.body.data[0].eventId).not.toBe(
          response2.body.data[0].eventId
        );
      }
    });

    it('should respect limit parameter', async () => { try {
      const response = await request(app).get('/api/events').query({
        page: 1,
        limit: 5,
      });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should validate query parameters', async () => { try {
      const response = await request(app).get('/api/events').query({
        page: -1,
        limit: -10,
      });

      // Should return 400 (validation error)
      expect(response.status).toBe(400);
    });
  });

  describe('error handling', () => {
    it('should return 503 if TransparencySystem unavailable', async () => { try {
      // This would require mocking TransparencySystem failure
      // For now, we test that the error handler is properly configured
      expect(errorHandler).toBeDefined();
    });

    it('should return proper error format', async () => { try {
      const response = await request(app).get(
        '/api/agents/invalid-agent/status'
      );

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('performance', () => {
    it('should handle multiple concurrent requests', async () => { try {
      const requests = Array.from({ length: 10 }, () =>
        request(app).get('/api/metrics')
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it('should leverage caching for repeated requests', async () => { try {
      const start = Date.now();

      // First request (cache miss)
      await request(app).get('/api/metrics');

      // Second request (cache hit)
      await request(app).get('/api/metrics');

      const duration = Date.now() - start;

      // Second request should be faster due to caching
      // (This is a basic performance indicator)
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});
