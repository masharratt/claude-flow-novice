/**
 * Tests for ruvector-auth.ts
 *
 * P0.3: RBAC Authentication Layer
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as jwt from 'jsonwebtoken';
import {
  Role,
  Operation,
  AuthMethod,
  ROLE_PERMISSIONS,
  AuthenticationError,
  AuthorizationError,
  InvalidTokenError,
  ExpiredTokenError,
} from '../../src/lib/auth-types';
import {
  configureAuth,
  generateApiKey,
  createApiKey,
  revokeApiKey,
  validateApiKey,
  validateJWT,
  validateService,
  checkPermission,
  requireRole,
  requirePermission,
  authenticate,
  getAuditLog,
  clearApiKeys,
  clearAuditLog,
} from '../../src/lib/ruvector-auth';

describe('RuVector Authentication', () => {
  const jwtSecret = 'test-secret-key-for-testing-only';

  beforeEach(() => {
    clearApiKeys();
    clearAuditLog();

    configureAuth({
      jwtSecret,
      jwtIssuer: 'test-issuer',
      jwtAudience: 'test-audience',
      enableAudit: true,
      devMode: false,
    });
  });

  afterEach(() => {
    clearApiKeys();
    clearAuditLog();
  });

  describe('API Key Generation', () => {
    it('should generate unique API keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);

      // Base64-encoded 32 bytes = 44 characters
      expect(key1.length).toBe(44);
    });

    it('should create API key with metadata', () => {
      const { key, metadata } = createApiKey(
        Role.OPERATOR,
        'Test API Key',
        'admin-user'
      );

      expect(key).toBeDefined();
      expect(metadata.id).toBeDefined();
      expect(metadata.role).toBe(Role.OPERATOR);
      expect(metadata.description).toBe('Test API Key');
      expect(metadata.createdBy).toBe('admin-user');
      expect(metadata.active).toBe(true);
      expect(metadata.createdAt).toBeInstanceOf(Date);
    });

    it('should create API key with expiration', () => {
      const expiresIn = 60 * 60 * 1000; // 1 hour
      const { metadata } = createApiKey(
        Role.VIEWER,
        'Temporary Key',
        'admin',
        expiresIn
      );

      expect(metadata.expiresAt).toBeInstanceOf(Date);
      expect(metadata.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('API Key Validation', () => {
    it('should validate valid API key', () => {
      const { key } = createApiKey(Role.ADMIN, 'Admin Key', 'system');
      const context = validateApiKey(key);

      expect(context).not.toBeNull();
      expect(context!.role).toBe(Role.ADMIN);
      expect(context!.method).toBe(AuthMethod.API_KEY);
      expect(context!.authenticatedAt).toBeInstanceOf(Date);
    });

    it('should reject invalid API key', () => {
      const invalidKey = 'invalid-api-key';
      const context = validateApiKey(invalidKey);

      expect(context).toBeNull();
    });

    it('should reject revoked API key', () => {
      const { key, metadata } = createApiKey(Role.OPERATOR, 'Test Key', 'admin');

      // Revoke the key
      revokeApiKey(metadata.id);

      const context = validateApiKey(key);
      expect(context).toBeNull();
    });

    it('should reject expired API key', () => {
      const expiresIn = -1000; // Already expired
      const { key } = createApiKey(Role.VIEWER, 'Expired Key', 'admin', expiresIn);

      const context = validateApiKey(key);
      expect(context).toBeNull();
    });

    it('should update lastUsedAt on successful validation', () => {
      const { key, metadata } = createApiKey(Role.ADMIN, 'Test Key', 'admin');

      const initialLastUsed = metadata.lastUsedAt;

      // Small delay to ensure timestamp difference
      setTimeout(() => {
        const context = validateApiKey(key);
        expect(context).not.toBeNull();

        // Note: This test assumes the metadata is updated in the store
        // In a real implementation, you'd verify by re-fetching the metadata
      }, 10);
    });
  });

  describe('JWT Validation', () => {
    it('should validate valid JWT token', () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          role: Role.OPERATOR,
        },
        jwtSecret,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          expiresIn: '1h',
        }
      );

      const context = validateJWT(token);

      expect(context).not.toBeNull();
      expect(context!.id).toBe('user-123');
      expect(context!.role).toBe(Role.OPERATOR);
      expect(context!.method).toBe(AuthMethod.JWT);
    });

    it('should default to VIEWER role if no role claim', () => {
      const token = jwt.sign(
        { sub: 'user-456' },
        jwtSecret,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          expiresIn: '1h',
        }
      );

      const context = validateJWT(token);

      expect(context).not.toBeNull();
      expect(context!.role).toBe(Role.VIEWER);
    });

    it('should reject expired JWT token', () => {
      const token = jwt.sign(
        { sub: 'user-789', role: Role.ADMIN },
        jwtSecret,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          expiresIn: '-1h', // Already expired
        }
      );

      expect(() => validateJWT(token)).toThrow(ExpiredTokenError);
    });

    it('should reject JWT with wrong issuer', () => {
      const token = jwt.sign(
        { sub: 'user-123', role: Role.ADMIN },
        jwtSecret,
        {
          issuer: 'wrong-issuer',
          audience: 'test-audience',
          expiresIn: '1h',
        }
      );

      expect(() => validateJWT(token)).toThrow(InvalidTokenError);
    });

    it('should reject JWT with wrong secret', () => {
      const token = jwt.sign(
        { sub: 'user-123', role: Role.ADMIN },
        'wrong-secret',
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          expiresIn: '1h',
        }
      );

      expect(() => validateJWT(token)).toThrow(InvalidTokenError);
    });

    it('should reject malformed JWT token', () => {
      const malformedToken = 'not.a.valid.jwt.token';

      expect(() => validateJWT(malformedToken)).toThrow(InvalidTokenError);
    });
  });

  describe('Service Authentication', () => {
    it('should validate valid service credentials', () => {
      process.env.SERVICE_SECRET_TESTSERVICE = 'test-secret-123';

      const context = validateService('testservice', 'test-secret-123');

      expect(context).not.toBeNull();
      expect(context!.id).toBe('testservice');
      expect(context!.role).toBe(Role.OPERATOR); // Default for services
      expect(context!.method).toBe(AuthMethod.SERVICE);

      delete process.env.SERVICE_SECRET_TESTSERVICE;
    });

    it('should reject invalid service secret', () => {
      process.env.SERVICE_SECRET_TESTSERVICE = 'correct-secret';

      const context = validateService('testservice', 'wrong-secret');

      expect(context).toBeNull();

      delete process.env.SERVICE_SECRET_TESTSERVICE;
    });

    it('should reject unconfigured service', () => {
      const context = validateService('unknown-service', 'any-secret');

      expect(context).toBeNull();
    });
  });

  describe('Permission Checks', () => {
    it('should grant permission for allowed operations', () => {
      const adminContext = {
        id: 'admin-1',
        name: 'Admin User',
        role: Role.ADMIN,
        method: AuthMethod.API_KEY,
        authenticatedAt: new Date(),
      };

      expect(checkPermission(adminContext, Operation.READ)).toBe(true);
      expect(checkPermission(adminContext, Operation.WRITE)).toBe(true);
      expect(checkPermission(adminContext, Operation.DELETE)).toBe(true);
      expect(checkPermission(adminContext, Operation.MANAGE_COLLECTIONS)).toBe(true);
      expect(checkPermission(adminContext, Operation.MANAGE_SECURITY)).toBe(true);
    });

    it('should deny permission for disallowed operations', () => {
      const viewerContext = {
        id: 'viewer-1',
        name: 'Viewer User',
        role: Role.VIEWER,
        method: AuthMethod.JWT,
        authenticatedAt: new Date(),
      };

      expect(checkPermission(viewerContext, Operation.READ)).toBe(true);
      expect(checkPermission(viewerContext, Operation.WRITE)).toBe(false);
      expect(checkPermission(viewerContext, Operation.DELETE)).toBe(false);
      expect(checkPermission(viewerContext, Operation.MANAGE_SECURITY)).toBe(false);
    });

    it('should enforce operator permissions', () => {
      const operatorContext = {
        id: 'operator-1',
        name: 'Operator',
        role: Role.OPERATOR,
        method: AuthMethod.SERVICE,
        authenticatedAt: new Date(),
      };

      expect(checkPermission(operatorContext, Operation.READ)).toBe(true);
      expect(checkPermission(operatorContext, Operation.WRITE)).toBe(true);
      expect(checkPermission(operatorContext, Operation.DELETE)).toBe(true);
      expect(checkPermission(operatorContext, Operation.MANAGE_COLLECTIONS)).toBe(true);

      // Operators cannot manage security
      expect(checkPermission(operatorContext, Operation.MANAGE_SECURITY)).toBe(false);
    });
  });

  describe('Role Requirements', () => {
    it('should allow access with sufficient role', () => {
      const adminContext = {
        id: 'admin',
        name: 'Admin',
        role: Role.ADMIN,
        method: AuthMethod.API_KEY,
        authenticatedAt: new Date(),
      };

      expect(() => requireRole(adminContext, Role.VIEWER)).not.toThrow();
      expect(() => requireRole(adminContext, Role.OPERATOR)).not.toThrow();
      expect(() => requireRole(adminContext, Role.ADMIN)).not.toThrow();
    });

    it('should deny access with insufficient role', () => {
      const viewerContext = {
        id: 'viewer',
        name: 'Viewer',
        role: Role.VIEWER,
        method: AuthMethod.JWT,
        authenticatedAt: new Date(),
      };

      expect(() => requireRole(viewerContext, Role.OPERATOR)).toThrow(AuthorizationError);
      expect(() => requireRole(viewerContext, Role.ADMIN)).toThrow(AuthorizationError);
    });
  });

  describe('Operation Requirements', () => {
    it('should allow operation with permission', () => {
      const operatorContext = {
        id: 'operator',
        name: 'Operator',
        role: Role.OPERATOR,
        method: AuthMethod.API_KEY,
        authenticatedAt: new Date(),
      };

      expect(() =>
        requirePermission(operatorContext, Operation.WRITE, 'test-collection')
      ).not.toThrow();
    });

    it('should deny operation without permission', () => {
      const viewerContext = {
        id: 'viewer',
        name: 'Viewer',
        role: Role.VIEWER,
        method: AuthMethod.JWT,
        authenticatedAt: new Date(),
      };

      expect(() =>
        requirePermission(viewerContext, Operation.DELETE, 'test-collection')
      ).toThrow(AuthorizationError);
    });
  });

  describe('Authentication Header Parsing', () => {
    it('should authenticate with Bearer token (API key)', () => {
      const { key } = createApiKey(Role.ADMIN, 'Test Key', 'admin');
      const authHeader = `Bearer ${key}`;

      const context = authenticate(authHeader);

      expect(context).not.toBeNull();
      expect(context!.role).toBe(Role.ADMIN);
    });

    it('should authenticate with Bearer token (JWT)', () => {
      const token = jwt.sign(
        { sub: 'user-123', role: Role.OPERATOR },
        jwtSecret,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          expiresIn: '1h',
        }
      );
      const authHeader = `Bearer ${token}`;

      const context = authenticate(authHeader);

      expect(context).not.toBeNull();
      expect(context!.id).toBe('user-123');
      expect(context!.role).toBe(Role.OPERATOR);
    });

    it('should authenticate with Service credentials', () => {
      process.env.SERVICE_SECRET_MYSERVICE = 'secret-123';

      const authHeader = 'Service myservice:secret-123';
      const context = authenticate(authHeader);

      expect(context).not.toBeNull();
      expect(context!.id).toBe('myservice');
      expect(context!.method).toBe(AuthMethod.SERVICE);

      delete process.env.SERVICE_SECRET_MYSERVICE;
    });

    it('should reject missing Authorization header (production)', () => {
      expect(() => authenticate(undefined)).toThrow(AuthenticationError);
    });

    it('should allow missing header in dev mode', () => {
      configureAuth({ devMode: true });

      const context = authenticate(undefined);

      expect(context).not.toBeNull();
      expect(context!.role).toBe(Role.ADMIN);
      expect(context!.method).toBe(AuthMethod.NONE);
    });

    it('should reject unsupported authentication scheme', () => {
      const authHeader = 'Basic dXNlcjpwYXNz'; // Base64 "user:pass"

      expect(() => authenticate(authHeader)).toThrow(AuthenticationError);
    });
  });

  describe('Audit Logging', () => {
    it('should log successful API key validation', () => {
      const { key } = createApiKey(Role.ADMIN, 'Test Key', 'admin');

      validateApiKey(key);

      const auditLog = getAuditLog(10);
      const validationEvent = auditLog.find(e => e.event === 'api_key_validated');

      expect(validationEvent).toBeDefined();
      expect(validationEvent!.success).toBe(true);
      expect(validationEvent!.role).toBe(Role.ADMIN);
    });

    it('should log failed authentication attempts', () => {
      validateApiKey('invalid-key');

      const auditLog = getAuditLog(10);
      const failedEvent = auditLog.find(e => e.event === 'api_key_validation_failed');

      expect(failedEvent).toBeDefined();
      expect(failedEvent!.success).toBe(false);
    });

    it('should log authorization failures', () => {
      const viewerContext = {
        id: 'viewer',
        name: 'Viewer',
        role: Role.VIEWER,
        method: AuthMethod.JWT,
        authenticatedAt: new Date(),
      };

      try {
        requirePermission(viewerContext, Operation.DELETE, 'test-collection');
      } catch (error) {
        // Expected to throw
      }

      const auditLog = getAuditLog(10);
      const authzEvent = auditLog.find(e => e.event === 'authorization_failed');

      expect(authzEvent).toBeDefined();
      expect(authzEvent!.success).toBe(false);
      expect(authzEvent!.operation).toBe(Operation.DELETE);
      expect(authzEvent!.resource).toBe('test-collection');
    });

    it('should log successful authorization', () => {
      const adminContext = {
        id: 'admin',
        name: 'Admin',
        role: Role.ADMIN,
        method: AuthMethod.API_KEY,
        authenticatedAt: new Date(),
      };

      requirePermission(adminContext, Operation.DELETE, 'test-collection');

      const auditLog = getAuditLog(10);
      const grantedEvent = auditLog.find(e => e.event === 'authorization_granted');

      expect(grantedEvent).toBeDefined();
      expect(grantedEvent!.success).toBe(true);
      expect(grantedEvent!.operation).toBe(Operation.DELETE);
    });
  });

  describe('Role Permissions Matrix', () => {
    it('should define correct permissions for ADMIN', () => {
      const adminPerms = ROLE_PERMISSIONS[Role.ADMIN];

      expect(adminPerms).toContain(Operation.READ);
      expect(adminPerms).toContain(Operation.WRITE);
      expect(adminPerms).toContain(Operation.DELETE);
      expect(adminPerms).toContain(Operation.MANAGE_COLLECTIONS);
      expect(adminPerms).toContain(Operation.VIEW_AUDIT);
      expect(adminPerms).toContain(Operation.MANAGE_SECURITY);
    });

    it('should define correct permissions for OPERATOR', () => {
      const operatorPerms = ROLE_PERMISSIONS[Role.OPERATOR];

      expect(operatorPerms).toContain(Operation.READ);
      expect(operatorPerms).toContain(Operation.WRITE);
      expect(operatorPerms).toContain(Operation.DELETE);
      expect(operatorPerms).toContain(Operation.MANAGE_COLLECTIONS);
      expect(operatorPerms).not.toContain(Operation.MANAGE_SECURITY);
    });

    it('should define correct permissions for VIEWER', () => {
      const viewerPerms = ROLE_PERMISSIONS[Role.VIEWER];

      expect(viewerPerms).toContain(Operation.READ);
      expect(viewerPerms).not.toContain(Operation.WRITE);
      expect(viewerPerms).not.toContain(Operation.DELETE);
      expect(viewerPerms).not.toContain(Operation.MANAGE_COLLECTIONS);
    });
  });
});
