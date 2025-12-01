/**
 * RuVector Security: Authentication and Authorization
 *
 * P0.3 Critical Security Fix: RBAC authentication layer
 *
 * Features:
 * - Role-Based Access Control (RBAC)
 * - API key authentication (Bearer tokens)
 * - JWT token validation
 * - Service-to-service authentication
 * - Audit logging for all access attempts
 * - Middleware for request authorization
 *
 * @module ruvector-auth
 */

import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import {
  Role,
  Operation,
  AuthMethod,
  AuthContext,
  ApiKey,
  JWTPayload,
  ROLE_PERMISSIONS,
  AuthAuditEntry,
  AuthenticationError,
  AuthorizationError,
  InvalidTokenError,
  ExpiredTokenError,
} from './auth-types.js';

/**
 * API key storage (in-memory for now, should be database-backed)
 * Map: keyHash -> ApiKey
 */
const apiKeyStore = new Map<string, ApiKey>();

/**
 * Audit log storage (in-memory for now, should be database-backed)
 */
const auditLog: AuthAuditEntry[] = [];

/**
 * Configuration
 */
interface AuthConfig {
  /** JWT secret for token validation */
  jwtSecret?: string;

  /** JWT issuer (expected) */
  jwtIssuer?: string;

  /** JWT audience (expected) */
  jwtAudience?: string;

  /** Enable audit logging */
  enableAudit: boolean;

  /** Development mode (allow NONE auth) */
  devMode: boolean;
}

let authConfig: AuthConfig = {
  jwtSecret: process.env.JWT_SECRET,
  jwtIssuer: process.env.JWT_ISSUER || 'trigger.dev',
  jwtAudience: process.env.JWT_AUDIENCE || 'ruvector',
  enableAudit: process.env.ENABLE_AUTH_AUDIT !== 'false',
  devMode: process.env.NODE_ENV !== 'production',
};

/**
 * Configure authentication settings
 *
 * @param config - Authentication configuration
 */
export function configureAuth(config: Partial<AuthConfig>): void {
  authConfig = { ...authConfig, ...config };
}

/**
 * Hash API key using SHA-256
 *
 * @param apiKey - Plaintext API key
 * @returns Hex-encoded hash
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Generate cryptographically secure API key
 *
 * @returns Base64-encoded API key (32 bytes)
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Create new API key
 *
 * @param role - Role to assign
 * @param description - Key description/purpose
 * @param createdBy - Key creator
 * @param expiresIn - Expiration time in milliseconds (optional)
 * @returns API key (plaintext) and metadata
 */
export function createApiKey(
  role: Role,
  description: string,
  createdBy: string,
  expiresIn?: number
): { key: string; metadata: ApiKey } {
  const key = generateApiKey();
  const keyHash = hashApiKey(key);

  const apiKey: ApiKey = {
    id: crypto.randomUUID(),
    keyHash,
    role,
    description,
    createdBy,
    createdAt: new Date(),
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : undefined,
    active: true,
  };

  apiKeyStore.set(keyHash, apiKey);

  return { key, metadata: apiKey };
}

/**
 * Revoke API key
 *
 * @param keyId - API key ID
 */
export function revokeApiKey(keyId: string): void {
  for (const [hash, apiKey] of apiKeyStore.entries()) {
    if (apiKey.id === keyId) {
      apiKey.active = false;
      apiKeyStore.set(hash, apiKey);
      return;
    }
  }

  throw new Error(`API key not found: ${keyId}`);
}

/**
 * Validate API key and return auth context
 *
 * @param key - Plaintext API key
 * @returns Auth context or null if invalid
 */
export function validateApiKey(key: string): AuthContext | null {
  const keyHash = hashApiKey(key);
  const apiKey = apiKeyStore.get(keyHash);

  if (!apiKey || !apiKey.active) {
    logAudit({
      event: 'api_key_validation_failed',
      success: false,
      error: 'Invalid or inactive API key',
    });
    return null;
  }

  // Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    logAudit({
      event: 'api_key_expired',
      success: false,
      error: 'API key expired',
    });
    return null;
  }

  // Update last used timestamp
  apiKey.lastUsedAt = new Date();
  apiKeyStore.set(keyHash, apiKey);

  const context: AuthContext = {
    id: apiKey.id,
    name: apiKey.description,
    role: apiKey.role,
    method: AuthMethod.API_KEY,
    authenticatedAt: new Date(),
    expiresAt: apiKey.expiresAt,
    metadata: {
      keyId: apiKey.id,
      createdBy: apiKey.createdBy,
    },
  };

  logAudit({
    event: 'api_key_validated',
    userId: context.id,
    role: context.role,
    success: true,
  });

  return context;
}

/**
 * Validate JWT token and return auth context
 *
 * @param token - JWT token (without "Bearer " prefix)
 * @returns Auth context or null if invalid
 * @throws {InvalidTokenError} If token is malformed
 * @throws {ExpiredTokenError} If token is expired
 */
export function validateJWT(token: string): AuthContext | null {
  if (!authConfig.jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  try {
    const payload = jwt.verify(token, authConfig.jwtSecret, {
      issuer: authConfig.jwtIssuer,
      audience: authConfig.jwtAudience,
    }) as JWTPayload;

    // Extract role from custom claim
    const roleStr = payload.role as string | undefined;
    const role = roleStr && roleStr in Role ? (roleStr as Role) : Role.VIEWER;

    const context: AuthContext = {
      id: payload.sub,
      name: payload.sub, // Use subject as name (could be enhanced)
      role,
      method: AuthMethod.JWT,
      authenticatedAt: new Date(),
      expiresAt: new Date(payload.exp * 1000),
      metadata: payload,
    };

    logAudit({
      event: 'jwt_validated',
      userId: context.id,
      role: context.role,
      success: true,
    });

    return context;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logAudit({
        event: 'jwt_expired',
        success: false,
        error: 'JWT token expired',
      });
      throw new ExpiredTokenError('JWT token expired');
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logAudit({
        event: 'jwt_validation_failed',
        success: false,
        error: error.message,
      });
      throw new InvalidTokenError('Invalid JWT token', error.message);
    }

    logAudit({
      event: 'jwt_validation_error',
      success: false,
      error: String(error),
    });
    return null;
  }
}

/**
 * Service-to-service authentication (internal)
 *
 * @param serviceName - Service identifier
 * @param serviceSecret - Service secret (from environment)
 * @returns Auth context or null if invalid
 */
export function validateService(
  serviceName: string,
  serviceSecret: string
): AuthContext | null {
  const expectedSecret = process.env[`SERVICE_SECRET_${serviceName.toUpperCase()}`];

  if (!expectedSecret || serviceSecret !== expectedSecret) {
    logAudit({
      event: 'service_auth_failed',
      userId: serviceName,
      success: false,
      error: 'Invalid service secret',
    });
    return null;
  }

  const context: AuthContext = {
    id: serviceName,
    name: `Service: ${serviceName}`,
    role: Role.OPERATOR, // Services default to OPERATOR role
    method: AuthMethod.SERVICE,
    authenticatedAt: new Date(),
    metadata: {
      serviceName,
    },
  };

  logAudit({
    event: 'service_authenticated',
    userId: serviceName,
    role: context.role,
    success: true,
  });

  return context;
}

/**
 * Check if auth context has permission for operation
 *
 * @param context - Authenticated user/service context
 * @param operation - Operation to perform
 * @returns True if authorized
 */
export function checkPermission(context: AuthContext, operation: Operation): boolean {
  const permissions = ROLE_PERMISSIONS[context.role];
  return permissions.includes(operation);
}

/**
 * Require specific role (throws if not authorized)
 *
 * @param context - Authenticated user/service context
 * @param requiredRole - Minimum required role
 * @throws {AuthorizationError} If user doesn't have required role
 */
export function requireRole(context: AuthContext, requiredRole: Role): void {
  const roleHierarchy = {
    [Role.VIEWER]: 0,
    [Role.OPERATOR]: 1,
    [Role.ADMIN]: 2,
  };

  const userLevel = roleHierarchy[context.role];
  const requiredLevel = roleHierarchy[requiredRole];

  if (userLevel < requiredLevel) {
    logAudit({
      event: 'authorization_failed',
      userId: context.id,
      role: context.role,
      success: false,
      error: `Required role: ${requiredRole}, actual role: ${context.role}`,
    });

    throw new AuthorizationError(
      `Access denied - required role: ${requiredRole}`,
      context.role
    );
  }
}

/**
 * Require specific operation permission (throws if not authorized)
 *
 * @param context - Authenticated user/service context
 * @param operation - Operation to perform
 * @param resource - Resource being accessed (for audit)
 * @throws {AuthorizationError} If user doesn't have permission
 */
export function requirePermission(
  context: AuthContext,
  operation: Operation,
  resource?: string
): void {
  if (!checkPermission(context, operation)) {
    logAudit({
      event: 'authorization_failed',
      userId: context.id,
      role: context.role,
      operation,
      resource,
      success: false,
      error: `Permission denied for operation: ${operation}`,
    });

    throw new AuthorizationError(
      `Access denied - missing permission: ${operation}`,
      context.role,
      operation
    );
  }

  logAudit({
    event: 'authorization_granted',
    userId: context.id,
    role: context.role,
    operation,
    resource,
    success: true,
  });
}

/**
 * Parse Authorization header and authenticate
 *
 * @param authHeader - HTTP Authorization header value
 * @returns Auth context or null if authentication fails
 */
export function authenticate(authHeader: string | undefined): AuthContext | null {
  if (!authHeader) {
    // In dev mode, allow no authentication
    if (authConfig.devMode) {
      return {
        id: 'dev-user',
        name: 'Development User',
        role: Role.ADMIN,
        method: AuthMethod.NONE,
        authenticatedAt: new Date(),
      };
    }

    throw new AuthenticationError('Missing Authorization header');
  }

  const [scheme, credentials] = authHeader.split(' ');

  if (scheme === 'Bearer') {
    // Try API key first, then JWT
    const apiKeyContext = validateApiKey(credentials);
    if (apiKeyContext) {
      return apiKeyContext;
    }

    const jwtContext = validateJWT(credentials);
    if (jwtContext) {
      return jwtContext;
    }

    throw new AuthenticationError('Invalid Bearer token', AuthMethod.API_KEY);
  }

  if (scheme === 'Service') {
    const [serviceName, serviceSecret] = credentials.split(':');
    const serviceContext = validateService(serviceName, serviceSecret);

    if (serviceContext) {
      return serviceContext;
    }

    throw new AuthenticationError('Invalid service credentials', AuthMethod.SERVICE);
  }

  throw new AuthenticationError(`Unsupported authentication scheme: ${scheme}`);
}

/**
 * Log audit entry
 *
 * @param entry - Partial audit entry (id and timestamp auto-generated)
 */
function logAudit(entry: Omit<AuthAuditEntry, 'id' | 'timestamp'>): void {
  if (!authConfig.enableAudit) {
    return;
  }

  const auditEntry: AuthAuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    ...entry,
  };

  auditLog.push(auditEntry);

  // TODO: Persist to database or external audit log service
  // For now, keep last 10000 entries in memory
  if (auditLog.length > 10000) {
    auditLog.shift();
  }
}

/**
 * Get audit log entries (admin only)
 *
 * @param limit - Maximum number of entries to return
 * @param offset - Offset for pagination
 * @returns Audit log entries
 */
export function getAuditLog(limit = 100, offset = 0): AuthAuditEntry[] {
  return auditLog.slice(offset, offset + limit);
}

/**
 * Express middleware factory for authentication
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { requireAuth } from './ruvector-auth';
 *
 * const app = express();
 *
 * // Require ADMIN role
 * app.post('/collections', requireAuth(Role.ADMIN), (req, res) => {
 *   const user = req.authContext;
 *   // ...
 * });
 * ```
 */
export function requireAuth(requiredRole?: Role) {
  return (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      const context = authenticate(authHeader);

      if (!context) {
        return res.status(401).json({ error: 'Authentication failed' });
      }

      if (requiredRole) {
        requireRole(context, requiredRole);
      }

      // Attach auth context to request
      req.authContext = context;
      next();
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) {
        return res.status(401).json({ error: error.message });
      }

      if (error instanceof AuthorizationError) {
        return res.status(403).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Clear all API keys (for testing)
 */
export function clearApiKeys(): void {
  apiKeyStore.clear();
}

/**
 * Clear audit log (for testing)
 */
export function clearAuditLog(): void {
  auditLog.length = 0;
}
