const request = require('supertest');
const app = require('../../../scripts/simple-portal-server.cjs');

describe('Messages API', () => {
  describe('GET /api/messages', () => {
    it('should return list of messages', async () => { try {
      const res = await request(app).get('/api/messages');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body).toHaveProperty('total');
    });

    it('should support pagination', async () => { try {
      const res = await request(app)
        .get('/api/messages')
        .query({ page: 1, limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /api/messages/:id', () => {
    it('should return specific message details', async () => { try {
      const listRes = await request(app).get('/api/messages');
      const firstMessageId = listRes.body.messages[0].id;

      const res = await request(app).get(`/api/messages/${firstMessageId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', firstMessageId);
    });

    it('should return 404 for non-existent message', async () => { try {
      const res = await request(app).get('/api/messages/non-existent-id');
      expect(res.status).toBe(404);
    });
  });
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});