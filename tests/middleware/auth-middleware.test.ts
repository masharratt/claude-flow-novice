/**
 * Authentication Middleware Tests
 *
 * Comprehensive test suite for auth-middleware.ts with target >90% coverage.
 * Tests JWT authentication, RBAC permissions, session management, and security.
 *
 * SECURITY CRITICAL - Protects sensitive promotion operations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  AuthMiddleware,
  RBACEnforcer,
  UserRole,
  PromotionOperation,
  UserContext,
  requirePermission,
} from '../../src/middleware/auth-middleware';
import { StandardError, ErrorCode } from '../../src/lib/errors';
import * as jwt from 'jsonwebtoken';

describe('Auth Middleware', () => {
  let authMiddleware: AuthMiddleware;
  const testJwtSecret = 'test-secret-key-for-testing';

  beforeEach(() => {
    authMiddleware = new AuthMiddleware(testJwtSecret, 3600);
  });

  describe('Token Generation', () => {
    it('should generate valid JWT token for admin user', () => {
      const token = authMiddleware.generateToken('user-001', 'admin-user', UserRole.ADMIN, 'admin@example.com');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should generate valid JWT token for developer user', () => {
      const token = authMiddleware.generateToken('user-002', 'dev-user', UserRole.DEVELOPER);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should generate valid JWT token for readonly user', () => {
      const token = authMiddleware.generateToken('user-003', 'readonly-user', UserRole.READONLY);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should generate token without email', () => {
      const token = authMiddleware.generateToken('user-004', 'no-email-user', UserRole.DEVELOPER);

      expect(token).toBeDefined();

      const decoded = jwt.verify(token, testJwtSecret) as any;
      expect(decoded.email).toBeUndefined();
    });

    it('should generate different tokens for different users', () => {
      const token1 = authMiddleware.generateToken('user-001', 'user1', UserRole.ADMIN);
      const token2 = authMiddleware.generateToken('user-002', 'user2', UserRole.ADMIN);

      expect(token1).not.toBe(token2);
    });

    it('should embed user information in token', () => {
      const token = authMiddleware.generateToken('user-001', 'test-user', UserRole.ADMIN, 'test@example.com');

      const decoded = jwt.verify(token, testJwtSecret) as any;

      expect(decoded.userId).toBe('user-001');
      expect(decoded.username).toBe('test-user');
      expect(decoded.role).toBe(UserRole.ADMIN);
      expect(decoded.email).toBe('test@example.com');
    });

    it('should set expiration in token', () => {
      const token = authMiddleware.generateToken('user-001', 'test-user', UserRole.ADMIN);

      const decoded = jwt.verify(token, testJwtSecret) as any;

      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it('should use configured expiration time', () => {
      const shortExpirationAuth = new AuthMiddleware(testJwtSecret, 60); // 1 minute
      const token = shortExpirationAuth.generateToken('user-001', 'test-user', UserRole.ADMIN);

      const decoded = jwt.verify(token, testJwtSecret) as any;

      const expectedExpiration = decoded.iat + 60;
      expect(decoded.exp).toBe(expectedExpiration);
    });
  });

  describe('Token Validation', () => {
    let validToken: string;

    beforeEach(() => {
      validToken = authMiddleware.generateToken('user-001', 'test-user', UserRole.ADMIN, 'test@example.com');
    });

    it('should validate valid token', () => {
      const userContext = authMiddleware.validateToken(validToken);

      expect(userContext).toBeDefined();
      expect(userContext.userId).toBe('user-001');
      expect(userContext.username).toBe('test-user');
      expect(userContext.role).toBe(UserRole.ADMIN);
      expect(userContext.email).toBe('test@example.com');
    });

    it('should validate token with Bearer prefix', () => {
      const userContext = authMiddleware.validateToken(`Bearer ${validToken}`);

      expect(userContext).toBeDefined();
      expect(userContext.userId).toBe('user-001');
    });

    it('should include issuedAt and expiresAt in user context', () => {
      const userContext = authMiddleware.validateToken(validToken);

      expect(userContext.issuedAt).toBeDefined();
      expect(userContext.expiresAt).toBeDefined();
      expect(userContext.expiresAt).toBeGreaterThan(userContext.issuedAt);
    });

    it('should throw error for missing token', () => {
      expect(() => {
        authMiddleware.validateToken('');
      }).toThrow(StandardError);
      expect(() => {
        authMiddleware.validateToken('');
      }).toThrow('Missing or invalid authentication token');
    });

    it('should throw error for non-string token', () => {
      expect(() => {
        authMiddleware.validateToken(null as any);
      }).toThrow(StandardError);
    });

    it('should throw error for invalid token format', () => {
      expect(() => {
        authMiddleware.validateToken('invalid-token');
      }).toThrow(StandardError);
      expect(() => {
        authMiddleware.validateToken('invalid-token');
      }).toThrow('Invalid authentication token');
    });

    it('should throw error for token with wrong signature', () => {
      const wrongSecretToken = jwt.sign({ userId: 'user-001', username: 'test', role: UserRole.ADMIN }, 'wrong-secret');

      expect(() => {
        authMiddleware.validateToken(wrongSecretToken);
      }).toThrow(StandardError);
    });

    it('should throw error for expired token', () => {
      const expiredAuth = new AuthMiddleware(testJwtSecret, -1); // Already expired
      const expiredToken = expiredAuth.generateToken('user-001', 'test-user', UserRole.ADMIN);

      // Wait a moment to ensure expiration
      jest.useFakeTimers();
      jest.advanceTimersByTime(2000);

      expect(() => {
        authMiddleware.validateToken(expiredToken);
      }).toThrow(StandardError);
      expect(() => {
        authMiddleware.validateToken(expiredToken);
      }).toThrow('expired');

      jest.useRealTimers();
    });

    it('should throw error for token missing userId', () => {
      const invalidToken = jwt.sign({ username: 'test', role: UserRole.ADMIN }, testJwtSecret);

      expect(() => {
        authMiddleware.validateToken(invalidToken);
      }).toThrow('missing required fields');
    });

    it('should throw error for token missing username', () => {
      const invalidToken = jwt.sign({ userId: 'user-001', role: UserRole.ADMIN }, testJwtSecret);

      expect(() => {
        authMiddleware.validateToken(invalidToken);
      }).toThrow('missing required fields');
    });

    it('should throw error for token missing role', () => {
      const invalidToken = jwt.sign({ userId: 'user-001', username: 'test' }, testJwtSecret);

      expect(() => {
        authMiddleware.validateToken(invalidToken);
      }).toThrow('missing required fields');
    });

    it('should throw error for invalid role value', () => {
      const invalidToken = jwt.sign({ userId: 'user-001', username: 'test', role: 'invalid-role' }, testJwtSecret);

      expect(() => {
        authMiddleware.validateToken(invalidToken);
      }).toThrow('Invalid role');
    });
  });

  describe('Session Management', () => {
    let userContext: UserContext;

    beforeEach(() => {
      userContext = {
        userId: 'user-001',
        username: 'test-user',
        role: UserRole.ADMIN,
        email: 'test@example.com',
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
    });

    it('should register session', () => {
      authMiddleware.registerSession('session-001', userContext);

      const session = authMiddleware.validateSession('session-001');
      expect(session.userId).toBe('user-001');
      expect(session.sessionId).toBe('session-001');
    });

    it('should validate registered session', () => {
      authMiddleware.registerSession('session-001', userContext);

      expect(() => {
        authMiddleware.validateSession('session-001');
      }).not.toThrow();
    });

    it('should throw error for unregistered session', () => {
      expect(() => {
        authMiddleware.validateSession('invalid-session');
      }).toThrow(StandardError);
      expect(() => {
        authMiddleware.validateSession('invalid-session');
      }).toThrow('Invalid or expired session');
    });

    it('should throw error for expired session', () => {
      const expiredContext = {
        ...userContext,
        expiresAt: Math.floor(Date.now() / 1000) - 10, // Expired 10 seconds ago
      };

      authMiddleware.registerSession('session-001', expiredContext);

      expect(() => {
        authMiddleware.validateSession('session-001');
      }).toThrow('Session has expired');
    });

    it('should invalidate session', () => {
      authMiddleware.registerSession('session-001', userContext);
      authMiddleware.invalidateSession('session-001');

      expect(() => {
        authMiddleware.validateSession('session-001');
      }).toThrow('Invalid or expired session');
    });

    it('should not throw when invalidating non-existent session', () => {
      expect(() => {
        authMiddleware.invalidateSession('non-existent');
      }).not.toThrow();
    });

    it('should store multiple sessions', () => {
      authMiddleware.registerSession('session-001', userContext);
      authMiddleware.registerSession('session-002', { ...userContext, userId: 'user-002' });

      const session1 = authMiddleware.validateSession('session-001');
      const session2 = authMiddleware.validateSession('session-002');

      expect(session1.userId).toBe('user-001');
      expect(session2.userId).toBe('user-002');
    });
  });

  describe('User Context Extraction', () => {
    let validToken: string;

    beforeEach(() => {
      validToken = authMiddleware.generateToken('user-001', 'test-user', UserRole.ADMIN);
    });

    it('should extract user context from Authorization header', () => {
      const userContext = authMiddleware.extractUserContext(`Bearer ${validToken}`);

      expect(userContext.userId).toBe('user-001');
      expect(userContext.username).toBe('test-user');
    });

    it('should extract user context from session ID', () => {
      const sessionContext: UserContext = {
        userId: 'user-001',
        username: 'test-user',
        role: UserRole.ADMIN,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      authMiddleware.registerSession('session-001', sessionContext);

      const userContext = authMiddleware.extractUserContext(undefined, 'session-001');

      expect(userContext.userId).toBe('user-001');
    });

    it('should prioritize JWT token over session', () => {
      const sessionContext: UserContext = {
        userId: 'session-user',
        username: 'session-user',
        role: UserRole.ADMIN,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      authMiddleware.registerSession('session-001', sessionContext);

      const userContext = authMiddleware.extractUserContext(`Bearer ${validToken}`, 'session-001');

      expect(userContext.userId).toBe('user-001'); // From token, not session
    });

    it('should throw error when no credentials provided', () => {
      expect(() => {
        authMiddleware.extractUserContext();
      }).toThrow(StandardError);
      expect(() => {
        authMiddleware.extractUserContext();
      }).toThrow('Missing authentication credentials');
    });
  });

  describe('RBAC Enforcer', () => {
    let rbacEnforcer: RBACEnforcer;
    let adminContext: UserContext;
    let developerContext: UserContext;
    let readonlyContext: UserContext;

    beforeEach(() => {
      rbacEnforcer = new RBACEnforcer(authMiddleware);

      adminContext = {
        userId: 'admin-001',
        username: 'admin',
        role: UserRole.ADMIN,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      developerContext = {
        userId: 'dev-001',
        username: 'developer',
        role: UserRole.DEVELOPER,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      readonlyContext = {
        userId: 'readonly-001',
        username: 'readonly',
        role: UserRole.READONLY,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
    });

    describe('Admin Permissions', () => {
      it('should allow admin to initiate promotion', () => {
        expect(rbacEnforcer.hasPermission(adminContext, PromotionOperation.INITIATE)).toBe(true);
      });

      it('should allow admin to validate skill', () => {
        expect(rbacEnforcer.hasPermission(adminContext, PromotionOperation.VALIDATE)).toBe(true);
      });

      it('should allow admin to test skill', () => {
        expect(rbacEnforcer.hasPermission(adminContext, PromotionOperation.TEST)).toBe(true);
      });

      it('should allow admin to approve promotion', () => {
        expect(rbacEnforcer.hasPermission(adminContext, PromotionOperation.APPROVE)).toBe(true);
      });

      it('should allow admin to deploy to production', () => {
        expect(rbacEnforcer.hasPermission(adminContext, PromotionOperation.DEPLOY)).toBe(true);
      });

      it('should allow admin to rollback deployment', () => {
        expect(rbacEnforcer.hasPermission(adminContext, PromotionOperation.ROLLBACK)).toBe(true);
      });

      it('should enforce all admin permissions without throwing', () => {
        expect(() => {
          rbacEnforcer.enforcePermission(adminContext, PromotionOperation.INITIATE);
          rbacEnforcer.enforcePermission(adminContext, PromotionOperation.APPROVE);
          rbacEnforcer.enforcePermission(adminContext, PromotionOperation.DEPLOY);
        }).not.toThrow();
      });
    });

    describe('Developer Permissions', () => {
      it('should allow developer to initiate promotion', () => {
        expect(rbacEnforcer.hasPermission(developerContext, PromotionOperation.INITIATE)).toBe(true);
      });

      it('should allow developer to validate skill', () => {
        expect(rbacEnforcer.hasPermission(developerContext, PromotionOperation.VALIDATE)).toBe(true);
      });

      it('should allow developer to test skill', () => {
        expect(rbacEnforcer.hasPermission(developerContext, PromotionOperation.TEST)).toBe(true);
      });

      it('should deny developer to approve promotion', () => {
        expect(rbacEnforcer.hasPermission(developerContext, PromotionOperation.APPROVE)).toBe(false);
      });

      it('should deny developer to deploy to production', () => {
        expect(rbacEnforcer.hasPermission(developerContext, PromotionOperation.DEPLOY)).toBe(false);
      });

      it('should deny developer to rollback deployment', () => {
        expect(rbacEnforcer.hasPermission(developerContext, PromotionOperation.ROLLBACK)).toBe(false);
      });

      it('should throw error when developer tries to approve', () => {
        expect(() => {
          rbacEnforcer.enforcePermission(developerContext, PromotionOperation.APPROVE, 'skill-001');
        }).toThrow(StandardError);
        expect(() => {
          rbacEnforcer.enforcePermission(developerContext, PromotionOperation.APPROVE, 'skill-001');
        }).toThrow('does not have permission');
      });

      it('should throw error when developer tries to deploy', () => {
        expect(() => {
          rbacEnforcer.enforcePermission(developerContext, PromotionOperation.DEPLOY);
        }).toThrow(StandardError);
      });
    });

    describe('Readonly Permissions', () => {
      it('should deny readonly all promotion operations', () => {
        expect(rbacEnforcer.hasPermission(readonlyContext, PromotionOperation.INITIATE)).toBe(false);
        expect(rbacEnforcer.hasPermission(readonlyContext, PromotionOperation.VALIDATE)).toBe(false);
        expect(rbacEnforcer.hasPermission(readonlyContext, PromotionOperation.TEST)).toBe(false);
        expect(rbacEnforcer.hasPermission(readonlyContext, PromotionOperation.APPROVE)).toBe(false);
        expect(rbacEnforcer.hasPermission(readonlyContext, PromotionOperation.DEPLOY)).toBe(false);
        expect(rbacEnforcer.hasPermission(readonlyContext, PromotionOperation.ROLLBACK)).toBe(false);
      });

      it('should throw error when readonly tries any operation', () => {
        expect(() => {
          rbacEnforcer.enforcePermission(readonlyContext, PromotionOperation.INITIATE);
        }).toThrow(StandardError);
      });
    });

    describe('Permission Enforcement', () => {
      it('should include skill ID in error context', () => {
        try {
          rbacEnforcer.enforcePermission(developerContext, PromotionOperation.APPROVE, 'skill-123');
          throw new Error('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(StandardError);
          if (error instanceof StandardError) {
            expect(error.context?.skillId).toBe('skill-123');
          }
        }
      });

      it('should include user context in error', () => {
        try {
          rbacEnforcer.enforcePermission(developerContext, PromotionOperation.DEPLOY);
          throw new Error('Should have thrown');
        } catch (error) {
          if (error instanceof StandardError) {
            expect(error.context?.userId).toBe('dev-001');
            expect(error.context?.role).toBe(UserRole.DEVELOPER);
            expect(error.context?.operation).toBe(PromotionOperation.DEPLOY);
          }
        }
      });

      it('should include allowed operations in error', () => {
        try {
          rbacEnforcer.enforcePermission(developerContext, PromotionOperation.DEPLOY);
          throw new Error('Should have thrown');
        } catch (error) {
          if (error instanceof StandardError) {
            expect(error.context?.allowedOperations).toBeDefined();
            expect(Array.isArray(error.context?.allowedOperations)).toBe(true);
          }
        }
      });
    });

    describe('Get Allowed Operations', () => {
      it('should return all operations for admin', () => {
        const operations = rbacEnforcer.getAllowedOperations(UserRole.ADMIN);

        expect(operations).toHaveLength(6);
        expect(operations).toContain(PromotionOperation.INITIATE);
        expect(operations).toContain(PromotionOperation.DEPLOY);
        expect(operations).toContain(PromotionOperation.ROLLBACK);
      });

      it('should return limited operations for developer', () => {
        const operations = rbacEnforcer.getAllowedOperations(UserRole.DEVELOPER);

        expect(operations).toHaveLength(3);
        expect(operations).toContain(PromotionOperation.INITIATE);
        expect(operations).toContain(PromotionOperation.VALIDATE);
        expect(operations).toContain(PromotionOperation.TEST);
        expect(operations).not.toContain(PromotionOperation.APPROVE);
      });

      it('should return empty array for readonly', () => {
        const operations = rbacEnforcer.getAllowedOperations(UserRole.READONLY);

        expect(operations).toHaveLength(0);
      });
    });
  });

  describe('Constructor with Environment Variables', () => {
    const originalJwtSecret = process.env.JWT_SECRET;

    afterEach(() => {
      // Restore original JWT_SECRET after each test
      if (originalJwtSecret) {
        process.env.JWT_SECRET = originalJwtSecret;
      } else {
        delete process.env.JWT_SECRET;
      }
    });

    it('should throw error when JWT_SECRET not configured', () => {
      delete process.env.JWT_SECRET;

      expect(() => {
        new AuthMiddleware();
      }).toThrow(StandardError);

      expect(() => {
        new AuthMiddleware();
      }).toThrow('JWT_SECRET is required but not configured');
    });

    it('should throw CONFIGURATION_ERROR when JWT_SECRET missing', () => {
      delete process.env.JWT_SECRET;

      try {
        new AuthMiddleware();
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StandardError);
        if (error instanceof StandardError) {
          expect(error.code).toBe(ErrorCode.CONFIGURATION_ERROR);
          expect(error.message).toContain('JWT_SECRET');
          expect(error.context?.hint).toBeDefined();
          expect(error.context?.securityNote).toBeDefined();
        }
      }
    });

    it('should throw error for empty JWT_SECRET string', () => {
      delete process.env.JWT_SECRET;

      expect(() => {
        new AuthMiddleware('');
      }).toThrow(StandardError);

      expect(() => {
        new AuthMiddleware('   '); // Whitespace only
      }).toThrow('JWT_SECRET cannot be empty');
    });

    it('should throw error for JWT_SECRET shorter than 16 characters', () => {
      delete process.env.JWT_SECRET;

      expect(() => {
        new AuthMiddleware('short');
      }).toThrow(StandardError);

      expect(() => {
        new AuthMiddleware('short');
      }).toThrow('must be at least 16 characters');

      try {
        new AuthMiddleware('12345678901234'); // 14 chars
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StandardError);
        if (error instanceof StandardError) {
          expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
          expect(error.context?.providedLength).toBe(14);
          expect(error.context?.requiredLength).toBe(16);
        }
      }
    });

    it('should use JWT_SECRET from environment', () => {
      process.env.JWT_SECRET = 'env-secret-at-least-16-chars';
      const auth = new AuthMiddleware();

      const token = auth.generateToken('user-001', 'test', UserRole.ADMIN);

      // Verify token was signed with env secret
      expect(() => {
        jwt.verify(token, 'env-secret-at-least-16-chars');
      }).not.toThrow();
    });

    it('should use explicit jwtSecret parameter over environment', () => {
      process.env.JWT_SECRET = 'env-secret-at-least-16-chars';
      const auth = new AuthMiddleware('explicit-secret-16');

      const token = auth.generateToken('user-001', 'test', UserRole.ADMIN);

      // Verify token was signed with explicit secret, not env
      expect(() => {
        jwt.verify(token, 'explicit-secret-16');
      }).not.toThrow();

      expect(() => {
        jwt.verify(token, 'env-secret-at-least-16-chars');
      }).toThrow();
    });

    it('should use default expiration when not specified', () => {
      process.env.JWT_SECRET = 'test-secret-16-chars';
      const auth = new AuthMiddleware();
      const token = auth.generateToken('user-001', 'test', UserRole.ADMIN);

      const decoded = jwt.verify(token, 'test-secret-16-chars') as any;
      expect(decoded.exp - decoded.iat).toBe(3600); // Default 1 hour
    });

    it('should accept custom expiration time', () => {
      const auth = new AuthMiddleware('test-secret-16-chars', 7200);
      const token = auth.generateToken('user-001', 'test', UserRole.ADMIN);

      const decoded = jwt.verify(token, 'test-secret-16-chars') as any;
      expect(decoded.exp - decoded.iat).toBe(7200); // 2 hours
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle malformed JWT tokens', () => {
      const malformedTokens = [
        'not.a.jwt',
        'only-one-part',
        '',
        'a.b',
        'a.b.c.d.e',
      ];

      malformedTokens.forEach((token) => {
        expect(() => {
          authMiddleware.validateToken(token);
        }).toThrow(StandardError);
      });
    });

    it('should handle concurrent session operations', () => {
      const context: UserContext = {
        userId: 'user-001',
        username: 'test',
        role: UserRole.ADMIN,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      // Register multiple sessions concurrently
      authMiddleware.registerSession('session-001', context);
      authMiddleware.registerSession('session-002', context);
      authMiddleware.registerSession('session-003', context);

      // All should be valid
      expect(() => authMiddleware.validateSession('session-001')).not.toThrow();
      expect(() => authMiddleware.validateSession('session-002')).not.toThrow();
      expect(() => authMiddleware.validateSession('session-003')).not.toThrow();
    });

    it('should remove expired session on validation', () => {
      const expiredContext: UserContext = {
        userId: 'user-001',
        username: 'test',
        role: UserRole.ADMIN,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) - 10,
      };

      authMiddleware.registerSession('session-001', expiredContext);

      // First validation should throw and remove session
      expect(() => authMiddleware.validateSession('session-001')).toThrow();

      // Second validation should also throw (session removed)
      expect(() => authMiddleware.validateSession('session-001')).toThrow('Invalid or expired session');
    });
  });
});
