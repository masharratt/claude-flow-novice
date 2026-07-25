/**
 * RBAC Middleware Tests
 *
 * Tests for rbac.ts middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  requireRole,
  requireAnyRole,
  requirePermission,
  requireAnyPermission,
  requireAdmin,
} from '../../middleware/rbac.js';
import { JWTUser } from '../../middleware/authentication.js';

// Mock request helper
const createMockRequest = (user?: JWTUser): Partial<Request> => ({
  user,
  ip: '127.0.0.1',
  path: '/api/test',
  method: 'POST',
});

// Mock response helper
const createMockResponse = (): Partial<Response> => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

// Mock next helper
const createMockNext = (): NextFunction => vi.fn();

describe('RBAC Middleware', () => {
  describe('requireRole', () => {
    it('should allow admin role', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'admin',
        permissions: [],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requireRole('admin');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should allow higher role (admin accessing user endpoint)', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'admin',
        permissions: [],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requireRole('user');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject lower role (user accessing admin endpoint)', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'user',
        permissions: [],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requireRole('admin');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
        })
      );
    });

    it('should reject unauthenticated user', () => {
      const req = createMockRequest() as Request; // No user
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requireRole('user');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        })
      );
    });
  });

  describe('requireAnyRole', () => {
    it('should allow if user has one of required roles', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'admin',
        permissions: [],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requireAnyRole(['admin', 'service']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject if user has none of required roles', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'guest',
        permissions: [],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requireAnyRole(['admin', 'service']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
        })
      );
    });
  });

  describe('requirePermission', () => {
    it('should allow if user has exact permission', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'user',
        permissions: ['agents:read', 'agents:write'],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requirePermission('agents:read');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should allow if user has wildcard permission', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'user',
        permissions: ['agents:*'],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requirePermission('agents:delete');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should allow if user has admin wildcard permission', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'admin',
        permissions: ['*'],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requirePermission('anything:goes');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject if user lacks permission', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'user',
        permissions: ['agents:read'],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requirePermission('agents:delete');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
        })
      );
    });

    it('should reject unauthenticated user', () => {
      const req = createMockRequest() as Request; // No user
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requirePermission('agents:read');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        })
      );
    });
  });

  describe('requireAnyPermission', () => {
    it('should allow if user has one of required permissions', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'user',
        permissions: ['agents:read'],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requireAnyPermission(['agents:read', 'agents:admin']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject if user has none of required permissions', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'user',
        permissions: ['agents:read'],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      const middleware = requireAnyPermission(['agents:delete', 'agents:admin']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
        })
      );
    });
  });

  describe('requireAdmin', () => {
    it('should allow admin users', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'admin',
        permissions: [],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should reject non-admin users', () => {
      const user: JWTUser = {
        userId: 'user-123',
        role: 'user',
        permissions: [],
      };

      const req = createMockRequest(user) as Request;
      const res = createMockResponse() as Response;
      const next = createMockNext();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
        })
      );
    });
  });

  describe('Role Hierarchy', () => {
    it('should respect role hierarchy (admin > service > user > guest)', () => {
      const roles = ['admin', 'service', 'user', 'guest'] as const;

      for (let i = 0; i < roles.length; i++) {
        for (let j = 0; j < roles.length; j++) {
          const user: JWTUser = {
            userId: 'user-123',
            role: roles[i],
            permissions: [],
          };

          const req = createMockRequest(user) as Request;
          const res = createMockResponse() as Response;
          const next = createMockNext();

          const middleware = requireRole(roles[j]);
          middleware(req, res, next);

          if (i >= j) {
            // Higher or equal role should pass
            expect(next).toHaveBeenCalledWith();
          } else {
            // Lower role should fail
            expect(next).toHaveBeenCalledWith(
              expect.objectContaining({
                statusCode: 403,
              })
            );
          }
        }
      }
    });
  });
});
