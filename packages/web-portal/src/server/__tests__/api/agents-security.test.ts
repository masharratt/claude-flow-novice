/**
 * Integration tests for agents API security fixes
 *
 * Tests:
 * 1. Rate limiting enforcement (100 req/15min)
 * 2. SQL-based filtering (no in-memory filtering)
 * 3. SQL injection prevention
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import agentsRouter from '../../api/agents.js';
import { eventStoreService } from '../../services/event-store.js';

const app = express();
app.use('/api/agents', agentsRouter);

describe('Agents API Security', () => {
  beforeAll(async () => { try {
    // Initialize event store
    await eventStoreService.initialize();

    // Seed test data
    await eventStoreService.storeEvents([
      {
        timestamp: new Date(),
        phaseId: 'phase-test',
        agentId: 'worker-1',
        eventType: 'hybrid_worker_update',
        payload: {
          agentType: 'backend-dev',
          subtask: 'Test task 1',
          provider: 'zai',
          confidence: 0.85,
          status: 'completed',
          tokens: { input: 1000, output: 500 },
          cost: 0.15,
          duration: 5000
        }
      },
      {
        timestamp: new Date(),
        phaseId: 'phase-test',
        agentId: 'worker-2',
        eventType: 'hybrid_worker_update',
        payload: {
          agentType: 'security-specialist',
          subtask: 'Test task 2',
          provider: 'anthropic',
          confidence: 0.72,
          status: 'active',
          tokens: { input: 800, output: 300 },
          cost: 0.10,
          duration: 3000
        }
      },
      {
        timestamp: new Date(),
        phaseId: 'phase-test',
        agentId: 'worker-3',
        eventType: 'hybrid_worker_update',
        payload: {
          agentType: 'perf-analyzer',
          subtask: 'Test task 3',
          provider: 'zai',
          confidence: 0.68,
          status: 'failed',
          tokens: { input: 1200, output: 400 },
          cost: 0.20,
          duration: 6000
        }
      }
    ]);
  });

  afterAll(async () => { try {
    await eventStoreService.close();
  });

  describe('Rate Limiting', () => {
    it('should allow 100 requests within 15 minutes', async () => { try {
      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        const res = await request(app).get('/api/agents/hybrid');
        expect(res.status).toBe(200);
      }
    });

    it('should block 101st request with 429 status', async () => { try {
      const res = await request(app).get('/api/agents/hybrid');
      expect(res.status).toBe(429);
      expect(res.body).toHaveProperty('message');
    });

    it('should include rate limit headers', async () => { try {
      const res = await request(app).get('/api/agents/hybrid');
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
      expect(res.headers).toHaveProperty('ratelimit-reset');
    });
  });

  describe('SQL-Based Filtering', () => {
    it('should filter by status using SQL', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('completed');
    });

    it('should filter by provider using SQL', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ provider: 'zai' });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      res.body.data.forEach((worker: any) => {
        expect(worker.provider).toBe('zai');
      });
    });

    it('should filter by confidence range using SQL', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ confidence_min: 0.75, confidence_max: 0.90 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      res.body.data.forEach((worker: any) => {
        expect(worker.confidence).toBeGreaterThanOrEqual(0.75);
        expect(worker.confidence).toBeLessThanOrEqual(0.90);
      });
    });

    it('should combine multiple filters using SQL', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({
          status: 'completed',
          provider: 'zai',
          confidence_min: 0.80
        });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      res.body.data.forEach((worker: any) => {
        expect(worker.status).toBe('completed');
        expect(worker.provider).toBe('zai');
        expect(worker.confidence).toBeGreaterThanOrEqual(0.80);
      });
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should reject SQL injection in status parameter', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ status: "completed' OR '1'='1" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject SQL injection in provider parameter', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ provider: "zai'; DROP TABLE events; --" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle malicious confidence_min values', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ confidence_min: "0.5 OR 1=1" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle malicious confidence_max values', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ confidence_max: "0.9; DELETE FROM events WHERE 1=1" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Pagination and Performance', () => {
    it('should enforce maximum limit of 100', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ limit: 1000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query parameters');
    });

    it('should support pagination with offset', async () => { try {
      const res1 = await request(app)
        .get('/api/agents/hybrid')
        .query({ limit: 1, offset: 0 });

      const res2 = await request(app)
        .get('/api/agents/hybrid')
        .query({ limit: 1, offset: 1 });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data[0]?.workerId).not.toBe(res2.body.data[0]?.workerId);
    });

    it('should include pagination metadata', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ limit: 10, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body.meta.pagination).toHaveProperty('total');
      expect(res.body.meta.pagination).toHaveProperty('limit');
      expect(res.body.meta.pagination).toHaveProperty('offset');
      expect(res.body.meta.pagination).toHaveProperty('hasMore');
    });
  });

  describe('Cache Headers', () => {
    it('should include cache control headers', async () => { try {
      const res = await request(app).get('/api/agents/hybrid');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=30');
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid confidence range', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ confidence_min: 0.9, confidence_max: 0.5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query parameters');
    });

    it('should return 400 for invalid status enum', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ status: 'invalid_status' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query parameters');
    });

    it('should return 400 for invalid provider enum', async () => { try {
      const res = await request(app)
        .get('/api/agents/hybrid')
        .query({ provider: 'openai' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query parameters');
    });
  });
});
