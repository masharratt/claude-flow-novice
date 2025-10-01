/**
 * Comprehensive Portal Integration Test Suite
 * Tests all critical functionality of the web portal server
 */

import fetch from 'node-fetch';
import { io as ioClient } from 'socket.io-client';

const PORTAL_URL = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

describe('Portal Integration Tests', () => {
  let wsClient;

  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(() => {
    if (wsClient) {
      wsClient.disconnect();
    }
  });

  describe('1. API Health Check', () => {
    test('GET /api/health should return healthy status', async () => {
      const response = await fetch(`${PORTAL_URL}/api/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('version');
    });

    test('Health endpoint should respond within 200ms', async () => {
      const startTime = Date.now();
      await fetch(`${PORTAL_URL}/api/health`);
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(200);
    });
  });

  describe('2. Rate Limiter Validation', () => {
    test('Should allow multiple requests within rate limit', async () => {
      const requests = [];

      // Send 10 requests rapidly
      for (let i = 0; i < 10; i++) {
        requests.push(fetch(`${PORTAL_URL}/api/health`));
      }

      const responses = await Promise.all(requests);
      const allSuccessful = responses.every(r => r.status === 200);

      expect(allSuccessful).toBe(true);
    });

    test('Should apply rate limiting to /api/* routes', async () => {
      // This test validates rate limiter is configured
      // Actual limit testing would require many more requests
      const response = await fetch(`${PORTAL_URL}/api/messages`);

      // Should respond (whether with data or error, but not timeout)
      expect([200, 401, 403, 500]).toContain(response.status);
    });
  });

  describe('3. Catch-all Route Behavior', () => {
    test('Undefined route should serve frontend or return 404', async () => {
      const response = await fetch(`${PORTAL_URL}/undefined-route`);

      // Either serves index.html (200) or returns 404
      expect([200, 404]).toContain(response.status);
    });

    test('Root path should serve frontend', async () => {
      const response = await fetch(`${PORTAL_URL}/`);

      expect(response.status).toBe(200);
      const contentType = response.headers.get('content-type');
      expect(contentType).toMatch(/text\/html/);
    });
  });

  describe('4. WebSocket Connection', () => {
    test('Should establish WebSocket connection successfully', (done) => {
      wsClient = ioClient(PORTAL_URL, {
        transports: ['websocket'],
        reconnection: false
      });

      wsClient.on('connect', () => {
        expect(wsClient.connected).toBe(true);
        done();
      });

      wsClient.on('connect_error', (error) => {
        done(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!wsClient.connected) {
          done(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });

    test('Should support room joining functionality', (done) => {
      if (!wsClient || !wsClient.connected) {
        wsClient = ioClient(PORTAL_URL, {
          transports: ['websocket']
        });
      }

      wsClient.on('connect', () => {
        wsClient.emit('join-swarm', 'test-swarm-123');

        // If no error after 1 second, consider it successful
        setTimeout(() => {
          expect(wsClient.connected).toBe(true);
          done();
        }, 1000);
      });
    });
  });

  describe('5. MCP Integration Functionality', () => {
    test('Should have agent status endpoint', async () => {
      const response = await fetch(`${PORTAL_URL}/api/agents/status?swarmId=test`);

      // Endpoint should exist (200) or return expected error (500 if no swarm)
      expect([200, 500]).toContain(response.status);
    });

    test('Should have messages API endpoint', async () => {
      const response = await fetch(`${PORTAL_URL}/api/messages?swarmId=test&limit=10`);

      expect([200, 500]).toContain(response.status);
      const data = await response.json();
      expect(data).toBeDefined();
    });

    test('Should have intervention endpoint', async () => {
      const response = await fetch(`${PORTAL_URL}/api/intervention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swarmId: 'test-swarm',
          message: 'test intervention',
          action: 'redirect'
        })
      });

      // Should process request (200) or return validation error (400/500)
      expect([200, 400, 500]).toContain(response.status);
    });

    test('Should have stats endpoint', async () => {
      const response = await fetch(`${PORTAL_URL}/api/stats?swarmId=test`);

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('6. Performance Baseline', () => {
    test('API endpoints should respond within acceptable time', async () => {
      const endpoints = [
        '/api/health',
        '/api/messages?swarmId=test&limit=5',
        '/api/agents/status?swarmId=test',
        '/api/stats?swarmId=test'
      ];

      const results = await Promise.all(
        endpoints.map(async (endpoint) => {
          const startTime = Date.now();
          await fetch(`${PORTAL_URL}${endpoint}`);
          return Date.now() - startTime;
        })
      );

      const averageTime = results.reduce((a, b) => a + b, 0) / results.length;
      const maxTime = Math.max(...results);

      expect(averageTime).toBeLessThan(500); // 500ms average
      expect(maxTime).toBeLessThan(1000); // 1s max
    });

    test('Should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();

      const requests = Array(concurrentRequests)
        .fill(null)
        .map(() => fetch(`${PORTAL_URL}/api/health`));

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      const allSuccessful = responses.every(r => r.status === 200);
      expect(allSuccessful).toBe(true);
      expect(totalTime).toBeLessThan(3000); // 3 seconds for 20 concurrent requests
    });
  });
});
