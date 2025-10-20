const request = require('supertest');
const app = require('../../../scripts/simple-portal-server.cjs');

describe('Agents API', () => {
  describe('GET /api/agents', () => {
    it('should return list of agents', async () => {
      const res = await request(app).get('/api/agents');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.agents)).toBe(true);
      expect(res.body).toHaveProperty('total');
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/agents')
        .query({ page: 1, limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body.agents.length).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /api/agents/:id', () => {
    it('should return specific agent details', async () => {
      // Assuming there's at least one agent
      const listRes = await request(app).get('/api/agents');
      const firstAgentId = listRes.body.agents[0].id;

      const res = await request(app).get(`/api/agents/${firstAgentId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', firstAgentId);
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await request(app).get('/api/agents/non-existent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/agents/:id/intervene', () => {
    it('should allow pausing an agent', async () => {
      const listRes = await request(app).get('/api/agents');
      const firstAgentId = listRes.body.agents[0].id;

      const res = await request(app)
        .post(`/api/agents/${firstAgentId}/intervene`)
        .send({ action: 'pause' });
      expect(res.status).toBe(200);
    });

    it('should return 400 for invalid intervention action', async () => {
      const listRes = await request(app).get('/api/agents');
      const firstAgentId = listRes.body.agents[0].id;

      const res = await request(app)
        .post(`/api/agents/${firstAgentId}/intervene`)
        .send({ action: 'invalid-action' });
      expect(res.status).toBe(400);
    });
  });
});