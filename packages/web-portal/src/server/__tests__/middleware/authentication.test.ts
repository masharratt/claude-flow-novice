/**
 * JWT Authentication Middleware Tests
 *
 * Tests for authentication.ts middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  authenticateJWT,
  optionalAuthenticateJWT,
  generateJWTToken,
  validateJWTConfig,
  JWTUser,
} from '../../middleware/authentication.js';
import { APIError } from '../../middleware/error-handler.js';
import jwt from 'jsonwebtoken';

// Mock environment
const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  // Reset environment
  process.env = { ...originalEnv, NODE_ENV: 'test', JWT_SECRET: 'test-secret-key-for-testing' };
});

// Helper to create mock request
const createMockRequest = (authHeader?: string): Partial<Request> => ({
  headers: authHeader ? { authorization: authHeader } : {},
  ip: '127.0.0.1',
  path: '/api/test',
  method: 'GET',
});

// Helper to create mock response
const createMockResponse = (): Partial<Response> => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

// Helper to create mock next
const createMockNext = (): NextFunction => vi.fn();

describe('JWT Authentication Middleware', () => {
  describe('authenticateJWT', () => {
    it('should authenticate valid JWT token', async () => { try {
      const user: Omit<JWTUser, 'iat' | 'exp'> = {
        userId: 'user-123',
        role: 'admin',
        permissions: ['*'],
      };

      const token = generateJWTToken(user);
      const req = createMockRequest(`Bearer ${token}`) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateJWT(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user?.userId).toBe('user-123');
      expect(req.user?.role).toBe('admin');
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject missing Authorization header', async () => { try {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateJWT(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        })
      );
    });

    it('should reject invalid token format', async () => { try {
      const req = createMockRequest('Bearer invalid-token') as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateJWT(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'INVALID_TOKEN',
        })
      );
    });

    it('should reject expired token', async () => { try {
      const user: Omit<JWTUser, 'iat' | 'exp'> = {
        userId: 'user-123',
        role: 'user',
        permissions: [],
      };

      // Generate token that expires immediately
      const token = generateJWTToken(user, '0s');

      // Wait 100ms to ensure expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      const req = createMockRequest(`Bearer ${token}`) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateJWT(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'TOKEN_EXPIRED',
        })
      );
    });

    it('should reject token with invalid signature', async () => { try {
      const user: Omit<JWTUser, 'iat' | 'exp'> = {
        userId: 'user-123',
        role: 'user',
        permissions: [],
      };

      // Generate token with different secret
      const token = jwt.sign(user, 'wrong-secret', { algorithm: 'HS256' });

      const req = createMockRequest(`Bearer ${token}`) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateJWT(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'INVALID_TOKEN',
        })
      );
    });

    it('should reject token with missing userId', async () => { try {
      const invalidPayload = { role: 'user', permissions: [] };
      const token = jwt.sign(invalidPayload, 'test-secret-key-for-testing', { algorithm: 'HS256' });

      const req = createMockRequest(`Bearer ${token}`) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateJWT(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'INVALID_TOKEN',
        })
      );
    });

    it('should reject token with invalid role', async () => { try {
      const invalidPayload = { userId: 'user-123', role: 'superadmin', permissions: [] };
      const token = jwt.sign(invalidPayload, 'test-secret-key-for-testing', { algorithm: 'HS256' });

      const req = createMockRequest(`Bearer ${token}`) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await authenticateJWT(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'INVALID_TOKEN',
        })
      );
    });

    it('should cache token verification results', async () => { try {
      const user: Omit<JWTUser, 'iat' | 'exp'> = {
        userId: 'user-123',
        role: 'user',
        permissions: [],
      };

      const token = generateJWTToken(user);
      const req1 = createMockRequest(`Bearer ${token}`) as Request;
      const res1 = createMockResponse() as Response;
      const next1 = createMockNext();

      // First call - should verify
      await authenticateJWT(req1, res1, next1);
      expect(req1.user?.userId).toBe('user-123');

      // Second call with same token - should use cache
      const req2 = createMockRequest(`Bearer ${token}`) as Request;
      const res2 = createMockResponse() as Response;
      const next2 = createMockNext();

      await authenticateJWT(req2, res2, next2);
      expect(req2.user?.userId).toBe('user-123');
    });
  });

  describe('optionalAuthenticateJWT', () => {
    it('should attach user if valid token present', async () => { try {
      const user: Omit<JWTUser, 'iat' | 'exp'> = {
        userId: 'user-123',
        role: 'user',
        permissions: [],
      };

      const token = generateJWTToken(user);
      const req = createMockRequest(`Bearer ${token}`) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await optionalAuthenticateJWT(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user?.userId).toBe('user-123');
      expect(next).toHaveBeenCalledWith();
    });

    it('should not fail if token missing', async () => { try {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await optionalAuthenticateJWT(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(); // Called without error
    });

    it('should not fail if token invalid', async () => { try {
      const req = createMockRequest('Bearer invalid-token') as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      await optionalAuthenticateJWT(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(); // Called without error
    });
  });

  describe('JWT Configuration Validation (MED-004)', () => {
    it('should fail in production with missing JWT_SECRET', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      expect(() => {
        validateJWTConfig();
      }).toThrow('JWT_SECRET environment variable is required in production');
    });

    it('should fail in production with development-secret', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'development-secret';

      expect(() => {
        validateJWTConfig();
      }).toThrow('Cannot use development-secret in production environment');
    });

    it('should succeed in development with missing JWT_SECRET', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.JWT_SECRET;

      expect(() => {
        validateJWTConfig();
      }).not.toThrow();
    });

    it('should succeed with valid JWT_SECRET', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'secure-production-secret-key-12345';

      expect(() => {
        validateJWTConfig();
      }).not.toThrow();
    });
  });

  describe('Token Generation', () => {
    it('should generate valid token with default expiration', () => {
      const user: Omit<JWTUser, 'iat' | 'exp'> = {
        userId: 'user-123',
        role: 'user',
        permissions: ['read'],
      };

      const token = generateJWTToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Verify token can be decoded
      const decoded = jwt.verify(token, 'test-secret-key-for-testing') as JWTUser;
      expect(decoded.userId).toBe('user-123');
      expect(decoded.role).toBe('user');
    });

    it('should generate token with custom expiration', () => {
      const user: Omit<JWTUser, 'iat' | 'exp'> = {
        userId: 'user-123',
        role: 'user',
        permissions: [],
      };

      const token = generateJWTToken(user, '1h');

      const decoded = jwt.decode(token) as JWTUser;
      expect(decoded.exp).toBeDefined();

      // Check expiration is approximately 1 hour from now
      const expiresIn = (decoded.exp! * 1000) - Date.now();
      expect(expiresIn).toBeGreaterThan(3500 * 1000); // ~58 minutes
      expect(expiresIn).toBeLessThan(3700 * 1000); // ~62 minutes
    });
  });
});
