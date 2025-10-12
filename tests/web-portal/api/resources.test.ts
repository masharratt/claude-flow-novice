/**
 * Unit Tests for Resources API Endpoint
 *
 * Tests for GET /api/resources
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import resourcesRouter from '../../../packages/web-portal/src/server/routes/api/resources.js';
import { errorHandler } from '../../../packages/web-portal/src/server/middleware/error-handler.js';
import { transparencyService } from '../../../packages/web-portal/src/server/services/transparency-service.js';

describe('Resources API Endpoint', () => {
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/resources', resourcesRouter);
    app.use(errorHandler);

    await transparencyService.initialize();
  });

  describe('GET /api/resources', () => {
    it('should return resource utilization for all agents', async () => {
      const response = await request(app).get('/api/resources').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return correct resource structure', async () => {
      const response = await request(app).get('/api/resources').expect(200);

      const { data } = response.body;
      if (data.length > 0) {
        const resource = data[0];
        expect(resource).toHaveProperty('agentId');
        expect(resource).toHaveProperty('cpu');
        expect(resource).toHaveProperty('memory');
        expect(resource).toHaveProperty('disk');
        expect(resource).toHaveProperty('tokensUsed');

        expect(typeof resource.cpu).toBe('number');
        expect(typeof resource.memory).toBe('number');
        expect(typeof resource.disk).toBe('number');
        expect(typeof resource.tokensUsed).toBe('number');
      }
    });

    it('should filter by threshold', async () => {
      const threshold = 80;
      const response = await request(app)
        .get(`/api/resources?threshold=${threshold}`)
        .expect(200);

      const { data } = response.body;
      expect(Array.isArray(data)).toBe(true);

      // Verify all returned agents meet threshold
      data.forEach((resource: any) => {
        const meetsThreshold =
          resource.cpu >= threshold || resource.memory >= threshold;
        expect(meetsThreshold).toBe(true);
      });
    });

    it('should reject invalid threshold', async () => {
      const response = await request(app)
        .get('/api/resources?threshold=101')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject negative threshold', async () => {
      const response = await request(app)
        .get('/api/resources?threshold=-1')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept threshold of 0', async () => {
      const response = await request(app)
        .get('/api/resources?threshold=0')
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });

    it('should accept threshold of 100', async () => {
      const response = await request(app)
        .get('/api/resources?threshold=100')
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });
  });
});
