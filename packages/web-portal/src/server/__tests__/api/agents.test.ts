/**
 * Agents API Tests
 * 
 * Tests for the hybrid agents endpoint
 */

import request from 'supertest';
import express from 'express';
import agentsRouter from '../../api/agents.js';
import { transparencyService } from '../../services/transparency-service.js';

// Mock the transparency service
jest.mock('../../services/transparency-service.js');
const mockTransparencyService = transparencyService as jest.Mocked<typeof transparencyService>;

describe('Agents API - Hybrid Endpoint', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Initialize mock data
    mockTransparencyService.getAgentHierarchy.mockResolvedValue([
      {
        agentId: 'worker-1',
        name: 'Worker Agent 1',
        type: 'worker-dev',
        state: 'active',
        capabilities: ['backend-dev', 'api-development'],
        role: 'worker'
      },
      {
        agentId: 'worker-2', 
        name: 'Worker Agent 2',
        type: 'worker-frontend',
        state: 'idle',
        capabilities: ['frontend-dev', 'react'],
        role: 'worker'
      },
      {
        agentId: 'agent-3',
        name: 'Non-Worker Agent',
        type: 'coordinator',
        state: 'active',
        capabilities: ['coordination'],
        role: 'coordinator'
      }
    ]);

    // Create Express app
    app = express();
    app.use(express.json());
    app.use('/api/agents', agentsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/agents/hybrid', () => {
    it('should return hybrid workers with metadata', async () => {
      const response = await request(app)
        .get('/api/agents/hybrid')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Check structure of returned data
      const worker = response.body.data[0];
      expect(worker).toHaveProperty('id');
      expect(worker).toHaveProperty('name');
      expect(worker).toHaveProperty('type');
      expect(worker).toHaveProperty('state');
      expect(worker).toHaveProperty('capabilities');
      expect(worker).toHaveProperty('metadata');

      // Check metadata structure
      const metadata = worker.metadata;
      expect(metadata).toHaveProperty('subtask');
      expect(metadata).toHaveProperty('tokens');
      expect(metadata).toHaveProperty('cost');
      expect(metadata).toHaveProperty('duration');
      expect(metadata).toHaveProperty('provider');
      expect(metadata).toHaveProperty('confidence');
      expect(typeof metadata.confidence).toBe('number');
      expect(metadata.confidence).toBeGreaterThanOrEqual(0);
      expect(metadata.confidence).toBeLessThanOrEqual(1);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/agents/hybrid?status=active')
        .expect(200);

      expect(response.body.data.every((worker: any) => worker.state === 'active')).toBe(true);
      expect(response.body.meta.filters.status).toBe('active');
    });

    it('should filter by provider', async () => {
      const response = await request(app)
        .get('/api/agents/hybrid?provider=openai')
        .expect(200);

      expect(response.body.data.every((worker: any) => worker.metadata.provider === 'openai')).toBe(true);
      expect(response.body.meta.filters.provider).toBe('openai');
    });

    it('should filter by confidence range', async () => {
      const response = await request(app)
        .get('/api/agents/hybrid?confidence_min=0.8&confidence_max=0.9')
        .expect(200);

      response.body.data.forEach((worker: any) => {
        expect(worker.metadata.confidence).toBeGreaterThanOrEqual(0.8);
        expect(worker.metadata.confidence).toBeLessThanOrEqual(0.9);
      });

      expect(response.body.meta.filters.confidence_min).toBe(0.8);
      expect(response.body.meta.filters.confidence_max).toBe(0.9);
    });

    it('should reject invalid confidence range', async () => {
      const response = await request(app)
        .get('/api/agents/hybrid?confidence_min=0.9&confidence_max=0.8')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/agents/hybrid?page=1&limit=1')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.pagination.page).toBe(1);
      expect(response.body.meta.pagination.limit).toBe(1);
      expect(response.body.meta.pagination.total).toBeGreaterThan(0);
    });

    it('should limit page size to maximum', async () => {
      const response = await request(app)
        .get('/api/agents/hybrid?limit=200')
        .expect(200);

      expect(response.body.meta.pagination.limit).toBe(100); // Should be capped at 100
    });

    it('should return statistics', async () => {
      const response = await request(app)
        .get('/api/agents/hybrid')
        .expect(200);

      expect(response.body.meta.statistics).toHaveProperty('totalWorkers');
      expect(response.body.meta.statistics).toHaveProperty('activeWorkers');
      expect(response.body.meta.statistics).toHaveProperty('averageConfidence');
      expect(response.body.meta.statistics).toHaveProperty('totalTokens');
      expect(response.body.meta.statistics).toHaveProperty('totalCost');
    });

    it('should set cache headers', async () => {
      const response = await request(app)
        .get('/api/agents/hybrid')
        .expect(200);

      expect(response.headers['cache-control']).toBe('public, max-age=30');
    });

    it('should handle service errors gracefully', async () => {
      mockTransparencyService.getAgentHierarchy.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/agents/hybrid')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('HYBRID_AGENTS_ERROR');
    });
  });
});