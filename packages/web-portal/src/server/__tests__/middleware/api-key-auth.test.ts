/**
 * API Key Authentication Middleware Tests
 *
 * Tests for api-key-auth.ts middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  authenticateAPIKey,
  registerAPIKey,
  revokeAPIKey,
  generateAPIKey,
} from '../../middleware/api-key-auth.js';

// Mock request helper
const createMockRequest = (apiKey?: string): Partial<Request> => ({
  headers: apiKey ? { 'x-api-key': apiKey } : {},
  ip: '127.0.0.1',
  path: '/api/test',
  method: 'GET',
});

// Mock response helper
const createMockResponse = (): Partial<Response> => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

// Mock next helper
const createMockNext = (): NextFunction => vi.fn();

describe('API Key Authentication Middleware', () => {
  const validAPIKey = generateAPIKey();
  const validKeyInfo = {
    keyId: 'key-123',
    serviceName: 'test-service',
    permissions: ['agents:read', 'metrics:read'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Register test API key
    registerAPIKey(validAPIKey, validKeyInfo);
  });

  describe('authenticateAPIKey', () => {
    it('should authenticate valid API key', async () => { try {
      const req = createMockRequest(validAPIKey) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateAPIKey(req, res, next);

      expect(req.apiKey).toBeDefined();
      expect(req.apiKey?.keyId).toBe('key-123');
      expect(req.apiKey?.serviceName).toBe('test-service');
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject missing X-API-Key header', async () => { try {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateAPIKey(req, res, next);

      expect(req.apiKey).toBeUndefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        })
      );
    });

    it('should reject invalid API key format', async () => { try {
      const req = createMockRequest('short-key') as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateAPIKey(req, res, next);

      expect(req.apiKey).toBeUndefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'INVALID_API_KEY_FORMAT',
        })
      );
    });

    it('should reject invalid API key (not found)', async () => { try {
      const invalidKey = generateAPIKey();
      const req = createMockRequest(invalidKey) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateAPIKey(req, res, next);

      expect(req.apiKey).toBeUndefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'INVALID_API_KEY',
        })
      );
    });

    it('should enforce rate limiting (10x standard)', async () => { try {
      const req = createMockRequest(validAPIKey) as Request;
      const res = createMockResponse() as Response;

      // Make 600 requests (default rate limit)
      for (let i = 0; i < 600; i++) {
        const next = createMockNext();
        await authenticateAPIKey(req, res, next);
        expect(next).toHaveBeenCalledWith();
      }

      // 601st request should fail
      const nextFail = createMockNext();
      await authenticateAPIKey(req, res, nextFail);

      expect(nextFail).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 429,
          code: 'RATE_LIMIT_EXCEEDED',
        })
      );
    });

    it('should reset rate limit after window expires', async () => { try {
      const keyWithLowLimit = generateAPIKey();
      registerAPIKey(keyWithLowLimit, {
        ...validKeyInfo,
        keyId: 'key-low-limit',
        rateLimit: 2,
      });

      const req = createMockRequest(keyWithLowLimit) as Request;
      const res = createMockResponse() as Response;

      // First 2 requests should succeed
      for (let i = 0; i < 2; i++) {
        const next = createMockNext();
        await authenticateAPIKey(req, res, next);
        expect(next).toHaveBeenCalledWith();
      }

      // 3rd request should fail
      const nextFail = createMockNext();
      await authenticateAPIKey(req, res, nextFail);
      expect(nextFail).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 429,
          code: 'RATE_LIMIT_EXCEEDED',
        })
      );

      // Wait for rate limit window to expire (1 minute + buffer)
      vi.useFakeTimers();
      vi.advanceTimersByTime(61 * 1000);
      vi.useRealTimers();

      // Should work again after reset
      const nextSuccess = createMockNext();
      await authenticateAPIKey(req, res, nextSuccess);
      expect(nextSuccess).toHaveBeenCalledWith();
    });
  });

  describe('API Key Management', () => {
    it('should generate valid API key', () => {
      const apiKey = generateAPIKey();

      expect(apiKey).toBeDefined();
      expect(typeof apiKey).toBe('string');
      expect(apiKey.length).toBeGreaterThanOrEqual(32);
      expect(/^[a-zA-Z0-9-_]+$/.jest.setTimeout(10000);
  test(apiKey)).toBe(true);
    });

    it('should register API key', () => {
      const newKey = generateAPIKey();
      const keyInfo = {
        keyId: 'new-key-123',
        serviceName: 'new-service',
        permissions: ['read'],
      };

      registerAPIKey(newKey, keyInfo);

      // Verify key works
      const req = createMockRequest(newKey) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      authenticateAPIKey(req, res, next);

      expect(req.apiKey?.keyId).toBe('new-key-123');
    });

    it('should revoke API key', async () => { try {
      const revokedKey = generateAPIKey();
      registerAPIKey(revokedKey, validKeyInfo);

      // Verify key works before revocation
      const req1 = createMockRequest(revokedKey) as Request;
      const res1 = createMockResponse() as Response;
      const next1 = createMockNext();

      await authenticateAPIKey(req1, res1, next1);
      expect(req1.apiKey).toBeDefined();

      // Revoke key
      const revoked = revokeAPIKey(revokedKey);
      expect(revoked).toBe(true);

      // Verify key no longer works
      const req2 = createMockRequest(revokedKey) as Request;
      const res2 = createMockResponse() as Response;
      const next2 = createMockNext();

      await authenticateAPIKey(req2, res2, next2);
      expect(req2.apiKey).toBeUndefined();
      expect(next2).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'INVALID_API_KEY',
        })
      );
    });
  });

  describe('Security', () => {
    it('should use constant-time comparison', async () => { try {
      // This test verifies timing-safe comparison is used
      // by checking that keys with same length take similar time

      const key1 = validAPIKey;
      const key2 = validAPIKey.slice(0, -1) + 'x'; // Same length, different last char

      const req1 = createMockRequest(key2) as Request;
      const res1 = createMockResponse() as Response;
      const next1 = createMockNext();

      const start = Date.now();
      await authenticateAPIKey(req1, res1, next1);
      const duration1 = Date.now() - start;

      const req2 = createMockRequest('x'.repeat(key1.length)) as Request;
      const res2 = createMockResponse() as Response;
      const next2 = createMockNext();

      const start2 = Date.now();
      await authenticateAPIKey(req2, res2, next2);
      const duration2 = Date.now() - start2;

      // Both should fail
      expect(next1).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
      expect(next2).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));

      // Timing difference should be minimal (< 10ms)
      // In production with large key stores, this would be more significant
      expect(Math.abs(duration1 - duration2)).toBeLessThan(10);
    });
  });
});
