const request = require('supertest');
const app = require('../../../scripts/simple-portal-server.cjs');

describe('Decisions API', () => {
  describe('GET /api/decisions', () => {
    it('should return list of decisions', async () => {
      const res = await request(app).get('/api/decisions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.decisions)).toBe(true);
      expect(res.body).toHaveProperty('total');
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/decisions')
        .query({ page: 1, limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body.decisions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /api/decisions/:id', () => {
    it('should return specific decision details', async () => {
      const listRes = await request(app).get('/api/decisions');
      const firstDecisionId = listRes.body.decisions[0].id;

      const res = await request(app).get(`/api/decisions/${firstDecisionId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', firstDecisionId);
    });

    it('should return 404 for non-existent decision', async () => {
      const res = await request(app).get('/api/decisions/non-existent-id');
      expect(res.status).toBe(404);
    });
  });
});