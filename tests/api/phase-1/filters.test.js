const request = require('supertest');
const app = require('../../../scripts/simple-portal-server.cjs');

describe('Filters API', () => {
  describe('POST /api/filters', () => {
    it('should create a new filter', async () => {
      const filterInput = {
        type: 'agent-status',
        criteria: {
          status: 'active'
        }
      };

      const res = await request(app)
        .post('/api/filters')
        .send(filterInput);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('type', filterInput.type);
      expect(res.body).toHaveProperty('criteria', filterInput.criteria);
    });

    it('should return 400 for invalid filter configuration', async () => {
      const invalidFilterInput = {
        type: 'invalid-type'
        // Missing required criteria
      };

      const res = await request(app)
        .post('/api/filters')
        .send(invalidFilterInput);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/filters/:id', () => {
    let createdFilterId;

    beforeAll(async () => {
      const filterInput = {
        type: 'agent-status',
        criteria: {
          status: 'active'
        }
      };

      const createRes = await request(app)
        .post('/api/filters')
        .send(filterInput);

      createdFilterId = createRes.body.id;
    });

    it('should return specific filter details', async () => {
      const res = await request(app).get(`/api/filters/${createdFilterId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', createdFilterId);
    });

    it('should return 404 for non-existent filter', async () => {
      const res = await request(app).get('/api/filters/non-existent-id');

      expect(res.status).toBe(404);
    });
  });
});