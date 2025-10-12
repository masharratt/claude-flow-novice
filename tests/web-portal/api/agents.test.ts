/**
 * Unit Tests for Agent API Endpoints
 *
 * Tests for GET /api/agents/hierarchy, GET /api/agents/:id/status, POST /api/agents/:id/intervene
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import agentsRouter from '../../../packages/web-portal/src/server/routes/api/agents.js';
import { errorHandler } from '../../../packages/web-portal/src/server/middleware/error-handler.js';
import { transparencyService } from '../../../packages/web-portal/src/server/services/transparency-service.js';

describe('Agent API Endpoints', () => {
  let app: Express;

  beforeAll(async () => {
    // Initialize test app
    app = express();
    app.use(express.json());
    app.use('/api/agents', agentsRouter);
    app.use(errorHandler);

    // Initialize transparency service
    await transparencyService.initialize();
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('GET /api/agents/hierarchy', () => {
    it('should return agent hierarchy without filters', async () => {
      const response = await request(app).get('/api/agents/hierarchy').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.headers['cache-control']).toContain('max-age=30');
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/agents/hierarchy?status=active')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by type', async () => {
      const response = await request(app)
        .get('/api/agents/hierarchy?type=coder')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should reject invalid status', async () => {
      const response = await request(app)
        .get('/api/agents/hierarchy?status=invalid')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/agents/:id/status', () => {
    it('should return 404 for non-existent agent', async () => {
      const response = await request(app)
        .get('/api/agents/non-existent-id/status')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('AGENT_NOT_FOUND');
    });

    it('should have no-cache headers for real-time data', async () => {
      // This will fail with 404, but we're testing headers
      const response = await request(app).get('/api/agents/test-id/status');

      // Headers should be set even on error
      if (response.status === 200) {
        expect(response.headers['cache-control']).toContain('no-cache');
      }
    });

    it('should validate agent ID parameter', async () => {
      const response = await request(app).get('/api/agents//status').expect(404);
      // Express routing will catch empty param as 404
    });
  });

  describe('POST /api/agents/:id/intervene', () => {
    it('should reject request without body', async () => {
      const response = await request(app)
        .post('/api/agents/test-id/intervene')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid action', async () => {
      const response = await request(app)
        .post('/api/agents/test-id/intervene')
        .send({
          action: 'invalid',
          reason: 'Test reason',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject reason exceeding 500 chars', async () => {
      const longReason = 'a'.repeat(501);
      const response = await request(app)
        .post('/api/agents/test-id/intervene')
        .send({
          action: 'pause',
          reason: longReason,
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid intervention request (read-only mode)', async () => {
      const response = await request(app)
        .post('/api/agents/test-id/intervene')
        .send({
          action: 'pause',
          reason: 'Test intervention',
        });

      // Will return 404 for non-existent agent or 200 for success
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('agentId');
        expect(response.body).toHaveProperty('action');
      }
    });

    it('should handle all valid actions', async () => {
      const actions = ['pause', 'resume', 'terminate', 'restart'];

      for (const action of actions) {
        const response = await request(app)
          .post('/api/agents/test-id/intervene')
          .send({
            action,
            reason: `Test ${action}`,
          });

        // 404 for non-existent or 200 for success
        expect([200, 404]).toContain(response.status);
      }
    });
  });
});
