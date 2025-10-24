/**
 * Unit Tests for Health API Endpoint
 *
 * Tests for GET /api/health
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import healthRouter from '../../../packages/web-portal/src/server/routes/api/health.js';
import { errorHandler } from '../../../packages/web-portal/src/server/middleware/error-handler.js';
import { transparencyService } from '../../../packages/web-portal/src/server/services/transparency-service.js';

describe('Health API Endpoint', () => {
  let app: Express;

  beforeAll(async () => { try {
    app = express();
    app.use(express.json());
    app.use('/api/health', healthRouter);
    app.use(errorHandler);

    await transparencyService.initialize();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => { try {
      const response = await request(app).get('/api/health');

      // Should be 200 (healthy/degraded) or 503 (unhealthy)
      expect([200, 503]).toContain(response.status);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('services');
    });

    it('should return valid status values', async () => { try {
      const response = await request(app).get('/api/health');

      const validStatuses = ['healthy', 'degraded', 'unhealthy'];
      expect(validStatuses).toContain(response.body.status);
    });

    it('should return uptime as number', async () => { try {
      const response = await request(app).get('/api/health');

      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return version string', async () => { try {
      const response = await request(app).get('/api/health');

      expect(typeof response.body.version).toBe('string');
      expect(response.body.version.length).toBeGreaterThan(0);
    });

    it('should return service statuses', async () => { try {
      const response = await request(app).get('/api/health');

      const { services } = response.body;
      expect(services).toHaveProperty('transparencySystem');
      expect(services).toHaveProperty('database');
      expect(services).toHaveProperty('redis');

      const validServiceStatuses = ['up', 'down'];
      expect(validServiceStatuses).toContain(services.transparencySystem);
      expect(validServiceStatuses).toContain(services.database);
      expect(validServiceStatuses).toContain(services.redis);
    });

    it('should return 200 for healthy status', async () => { try {
      const response = await request(app).get('/api/health');

      if (response.body.status === 'healthy') {
        expect(response.status).toBe(200);
      }
    });

    it('should return 503 for unhealthy status', async () => { try {
      const response = await request(app).get('/api/health');

      if (response.body.status === 'unhealthy') {
        expect(response.status).toBe(503);
      }
    });

    it('should not require authentication', async () => { try {
      // Health endpoint should work without auth headers
      const response = await request(app).get('/api/health');

      // Should not return 401 Unauthorized
      expect(response.status).not.toBe(401);
    });
  });
});
