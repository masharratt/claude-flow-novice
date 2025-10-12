/**
 * Authentication Endpoints Tests
 *
 * MED-002: Test logout and refresh token endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import authRouter from '../../routes/api/auth.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { TokenBlacklistService } from '../../services/token-blacklist.js';

describe('Authentication Endpoints (MED-002)', () => {
  let app: Express;
  let blacklistService: TokenBlacklistService;
  let jwtSecret: string;

  beforeAll(() => {
    jwtSecret = 'test-secret-key';
    process.env.JWT_SECRET = jwtSecret;

    // Create test blacklist service
    blacklistService = new TokenBlacklistService({
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: 'test:auth:blacklist:',
      enableLogging: false,
    });

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
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

  describe('POST /api/auth/logout', () => {
    it('should successfully logout and blacklist token', async () => {
      const tokenId = 'test-token-logout-1';
      const token = jwt.sign(
        {
          jti: tokenId,
          userId: 'user-123',
          role: 'user',
          permissions: [],
        },
        jwtSecret,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('logged out');

      // Verify token is blacklisted
      const isBlacklisted = await blacklistService.isBlacklisted(tokenId);
      expect(isBlacklisted).toBe(true);
    });

    it('should fail when Authorization header is missing', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when token has no jti claim', async () => {
      const token = jwt.sign(
        {
          // Missing jti
          userId: 'user-123',
          role: 'user',
        },
        jwtSecret,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should fail when token is malformed', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should enforce rate limiting', async () => {
      const token = jwt.sign(
        {
          jti: 'rate-limit-test',
          userId: 'user-123',
          role: 'user',
        },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Intervention rate limiter: 10 requests per minute
      const requests = Array.from({ length: 11 }, () =>
        request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token}`)
      );

      const responses = await Promise.all(requests);

      // At least one should be rate limited
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    }, 10000);
  });

  describe('POST /api/auth/refresh', () => {
    it('should successfully refresh token and blacklist old token', async () => {
      const oldTokenId = 'refresh-token-old';
      const refreshToken = jwt.sign(
        {
          jti: oldTokenId,
          userId: 'user-456',
          role: 'user',
          permissions: [],
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.expiresIn).toBe(900); // 15 minutes

      // Verify old token is blacklisted
      const isBlacklisted = await blacklistService.isBlacklisted(oldTokenId);
      expect(isBlacklisted).toBe(true);

      // Verify new tokens have jti claims
      const newAccessPayload = jwt.decode(response.body.accessToken) as any;
      expect(newAccessPayload.jti).toBeDefined();

      const newRefreshPayload = jwt.decode(response.body.refreshToken) as any;
      expect(newRefreshPayload.jti).toBeDefined();
    });

    it('should fail when refreshToken is missing', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MISSING_REFRESH_TOKEN');
    });

    it('should fail when refreshToken is invalid', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should fail when refreshToken is expired', async () => {
      const expiredToken = jwt.sign(
        {
          jti: 'expired-refresh',
          userId: 'user-789',
          role: 'user',
        },
        jwtSecret,
        { expiresIn: '-1s' } // Already expired
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: expiredToken });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should fail when refreshToken is blacklisted', async () => {
      const tokenId = 'blacklisted-refresh';
      const refreshToken = jwt.sign(
        {
          jti: tokenId,
          userId: 'user-999',
          role: 'user',
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      // Blacklist the token first
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
      await blacklistService.addToBlacklist(tokenId, expiresAt);

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REVOKED');
    });

    it('should preserve user information in new tokens', async () => {
      const refreshToken = jwt.sign(
        {
          jti: 'preserve-user-info',
          userId: 'user-preserve',
          role: 'admin',
          permissions: ['read', 'write'],
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);

      const newAccessPayload = jwt.decode(response.body.accessToken) as any;
      expect(newAccessPayload.userId).toBe('user-preserve');
      expect(newAccessPayload.role).toBe('admin');

      const newRefreshPayload = jwt.decode(response.body.refreshToken) as any;
      expect(newRefreshPayload.userId).toBe('user-preserve');
      expect(newRefreshPayload.role).toBe('admin');
    });

    it('should enforce rate limiting', async () => {
      const refreshToken = jwt.sign(
        {
          jti: 'rate-limit-refresh',
          userId: 'user-rate',
          role: 'user',
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      // Intervention rate limiter: 10 requests per minute
      const requests = Array.from({ length: 11 }, () =>
        request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken })
      );

      const responses = await Promise.all(requests);

      // At least one should be rate limited
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    }, 10000);
  });

  describe('Token Lifecycle', () => {
    it('should complete full token lifecycle: login → use → refresh → logout', async () => {
      // 1. Simulate login (generate initial tokens)
      const initialAccessTokenId = 'lifecycle-access-1';
      const initialRefreshTokenId = 'lifecycle-refresh-1';

      const initialAccessToken = jwt.sign(
        { jti: initialAccessTokenId, userId: 'user-lifecycle', role: 'user' },
        jwtSecret,
        { expiresIn: '15m' }
      );

      const initialRefreshToken = jwt.sign(
        { jti: initialRefreshTokenId, userId: 'user-lifecycle', role: 'user' },
        jwtSecret,
        { expiresIn: '7d' }
      );

      // 2. Use access token (verify not blacklisted)
      let isBlacklisted = await blacklistService.isBlacklisted(initialAccessTokenId);
      expect(isBlacklisted).toBe(false);

      // 3. Refresh token (old refresh token should be blacklisted)
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(refreshResponse.status).toBe(200);

      // Old refresh token should be blacklisted
      isBlacklisted = await blacklistService.isBlacklisted(initialRefreshTokenId);
      expect(isBlacklisted).toBe(true);

      // 4. Logout with new access token (should be blacklisted)
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`);

      expect(logoutResponse.status).toBe(200);

      // New access token should be blacklisted
      const newAccessPayload = jwt.decode(refreshResponse.body.accessToken) as any;
      isBlacklisted = await blacklistService.isBlacklisted(newAccessPayload.jti);
      expect(isBlacklisted).toBe(true);
    });
  });

  describe('Security Audit Logging', () => {
    it('should log logout events for audit trail', async () => {
      const token = jwt.sign(
        {
          jti: 'audit-logout',
          userId: 'user-audit',
          role: 'user',
        },
        jwtSecret,
        { expiresIn: '1h' }
      );

      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog(...args);
      };

      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      console.log = originalLog;

      // Verify audit log was created
      const auditLog = logs.find(log => log.includes('[SECURITY_AUDIT]'));
      expect(auditLog).toBeDefined();
    });

    it('should log token refresh events for audit trail', async () => {
      const refreshToken = jwt.sign(
        {
          jti: 'audit-refresh',
          userId: 'user-audit-refresh',
          role: 'user',
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog(...args);
      };

      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      console.log = originalLog;

      // Verify audit log was created
      const auditLog = logs.find(log => log.includes('[SECURITY_AUDIT]'));
      expect(auditLog).toBeDefined();
    });
  });
});
