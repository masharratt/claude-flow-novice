import { describe, test, expect } from '@jest/globals';
const request = require('supertest');
const app = require('./server');

describe('REST API Tests', () => {
  jest.setTimeout(10000);
  test('GET /health should return healthy status', async () => { try {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  jest.setTimeout(10000);
  test('GET /api/v1/items should return items list', async () => { try {
    const response = await request(app).get('/api/v1/items');
    expect(response.status).toBe(200);
    expect(response.body.items).toBeDefined();
    expect(Array.isArray(response.body.items)).toBe(true);
  });

  jest.setTimeout(10000);
  test('GET /api/v1/items/:id should return specific item', async () => { try {
    const response = await request(app).get('/api/v1/items/1');
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(1);
  });

  jest.setTimeout(10000);
  test('POST /api/v1/items should create new item', async () => { try {
    const newItem = { name: 'Test Item', description: 'Test Description' };
    const response = await request(app)
      .post('/api/v1/items')
      .send(newItem);
    expect(response.status).toBe(201);
    expect(response.body.name).toBe(newItem.name);
    expect(response.body.createdAt).toBeDefined();
  });
});
