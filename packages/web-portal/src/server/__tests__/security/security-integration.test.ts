/**
 * Security Integration Tests
 *
 * End-to-end security scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import authRouter from '../../routes/api/auth.js';
import { authenticateJWT } from '../../middleware/authentication.js';
import { errorHandler } from '../../middleware/error-handler.js';
import {
  securityHeaders,
  permissionsPolicyHeader,
  corsOptions,
  payloadSizeValidator,
} from '../../middleware/security.js';
import cors from 'cors';
import { TokenBlacklistService } from '../../services/token-blacklist.js';

describe('Security Integration (MED-001 + MED-002)', () => {
  let app: Express;
  let blacklistService: TokenBlacklistService;
  let jwtSecret: string;

  beforeAll(() => {
    jwtSecret = 'test-integration-secret';
    process.env.JWT_SECRET = jwtSecret;

    blacklistService = new TokenBlacklistService({
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: 'test:integration:blacklist:',
      enableLogging: false,
    });

    app = express();

    // Apply all security middleware
    app.use(securityHeaders);
    app.use(permissionsPolicyHeader);
    app.use(cors(corsOptions));
    app.use(payloadSizeValidator(1024 * 1024));
    app.use(express.json());

    // Auth routes
    app.use('/api/auth', authRouter);

    // Protected route
    app.get('/api/protected', authenticateJWT, (_req, res) => {
      res.json({ message: 'Access granted' });
    });

    app.use(errorHandler);
  });

  afterAll(async () => {
    await blacklistService.clearAll();
    await blacklistService.close();
    delete process.env.JWT_SECRET;
  });

  beforeEach(async () => {
    await blacklistService.clearAll();
  });

  describe('Complete Authentication Flow', () => {
    it('should enforce security headers on all responses', async () => {
      const response = await request(app).get('/api/protected');

      // Verify all security headers present
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['permissions-policy']).toBeDefined();
    });

    it('should allow access with valid token', async () => {
      const token = jwt.sign(
        {
          jti: 'valid-token',
          userId: 'user-123',
          role: 'user',
          permissions: [],
        },
        jwtSecret,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Access granted');
    });

    it('should deny access after token is blacklisted', async () => {
      const tokenId = 'blacklist-integration';
      const token = jwt.sign(
        {
          jti: tokenId,
          userId: 'user-456',
          role: 'user',
          permissions: [],
        },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Should work initially
      let response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Logout (blacklist token)
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      // Should fail after blacklist
      response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REVOKED');
    });

    it('should allow access with refreshed token', async () => {
      const oldTokenId = 'old-refresh-token';
      const refreshToken = jwt.sign(
        {
          jti: oldTokenId,
          userId: 'user-789',
          role: 'user',
          permissions: [],
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      // Refresh token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(refreshResponse.status).toBe(200);

      // Use new access token
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Access granted');
    });
  });

  describe('CORS and Origin Validation', () => {
    it('should allow requests from configured origin', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Origin', 'http://localhost:3001');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should reject requests from unauthorized origin', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Origin', 'https://malicious.com');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Payload Size Validation', () => {
    it('should reject oversized payloads', async () => {
      const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Content-Length', String(largePayload.length))
        .send({ refreshToken: largePayload });

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Token Expiration and Renewal', () => {
    it('should deny access with expired token', async () => {
      const expiredToken = jwt.sign(
        {
          jti: 'expired-token',
          userId: 'user-expired',
          role: 'user',
        },
        jwtSecret,
        { expiresIn: '-1s' } // Already expired
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should allow renewal of near-expired token', async () => {
      const nearExpiredRefreshToken = jwt.sign(
        {
          jti: 'near-expired',
          userId: 'user-near-expired',
          role: 'user',
        },
        jwtSecret,
        { expiresIn: '5s' } // Expires in 5 seconds
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: nearExpiredRefreshToken });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
    });
  });

  describe('Multi-Device Token Management', () => {
    it('should allow multiple active tokens from different devices', async () => {
      const userId = 'multi-device-user';

      // Device 1 token
      const device1Token = jwt.sign(
        { jti: 'device-1-token', userId, role: 'user' },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Device 2 token
      const device2Token = jwt.sign(
        { jti: 'device-2-token', userId, role: 'user' },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Both should work
      const response1 = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${device1Token}`);

      const response2 = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${device2Token}`);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });

    it('should allow logging out from one device without affecting others', async () => {
      const userId = 'selective-logout-user';

      // Device 1 token
      const device1Token = jwt.sign(
        { jti: 'selective-device-1', userId, role: 'user' },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Device 2 token
      const device2Token = jwt.sign(
        { jti: 'selective-device-2', userId, role: 'user' },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Logout from device 1
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${device1Token}`);

      // Device 1 should fail
      const response1 = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${device1Token}`);

      // Device 2 should still work
      const response2 = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${device2Token}`);

      expect(response1.status).toBe(401);
      expect(response2.status).toBe(200);
    });
  });

  describe('Security Header Consistency', () => {
    it('should apply security headers to all endpoints', async () => {
      const endpoints = [
        '/api/protected',
        '/api/auth/logout',
        '/api/auth/refresh',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);

        expect(response.headers['content-security-policy']).toBeDefined();
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['permissions-policy']).toBeDefined();
      }
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should rate limit authentication endpoints', async () => {
      const token = jwt.sign(
        { jti: 'rate-limit-test', userId: 'user-rate', role: 'user' },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Intervention rate limiter: 10 requests per minute
      const requests = Array.from({ length: 15 }, () =>
        request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token}`)
      );

      const responses = await Promise.all(requests);

      // Should have at least one 429 (rate limited)
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Error Response Security', () => {
    it('should not leak sensitive information in error messages', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.error.message).not.toContain('jwt');
      expect(response.body.error.message).not.toContain('secret');
      expect(response.body.error.message).not.toContain('signature');
    });

    it('should provide generic error messages for security events', async () => {
      const response = await request(app).get('/api/protected');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Authentication required');
      expect(response.body.error.details).toBeUndefined();
    });
  });
});
