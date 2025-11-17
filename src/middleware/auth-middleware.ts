/**
 * Authentication and Role-Based Access Control (RBAC) Middleware
 *
 * Implements JWT-based authentication and role-based access control for
 * sensitive operations like skill promotion, approval, and deployment.
 *
 * Features:
 * - JWT token validation and expiration checks
 * - Role-based access control with granular permissions
 * - Session-based authentication fallback
 * - Audit logging for authorization failures
 * - Per-operation permission validation
 *
 * Roles:
 * - admin: Full access to all promotion operations
 * - developer: Can initiate promotions, but not approve/deploy
 * - readonly: Can view audit trails, but no promotion access
 */

import { StandardError, ErrorCode } from '../lib/errors';
import { createLogger } from '../lib/logging';
import * as jwt from 'jsonwebtoken';

const logger = createLogger('auth-middleware');

/**
 * User role enum
 */
export enum UserRole {
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  READONLY = 'readonly',
}

/**
 * Promotion operation enum
 */
export enum PromotionOperation {
  INITIATE = 'initiate-promotion',
  VALIDATE = 'validate-skill',
  TEST = 'test-skill',
  APPROVE = 'approve-promotion',
  DEPLOY = 'deploy-to-production',
  ROLLBACK = 'rollback-deployment',
}

/**
 * User context from authentication
 */
export interface UserContext {
  userId: string;
  username: string;
  role: UserRole;
  email?: string;
  issuedAt: number;
  expiresAt: number;
  sessionId?: string;
}

/**
 * Permission mapping: role -> allowed operations
 */
const ROLE_PERMISSIONS: Record<UserRole, PromotionOperation[]> = {
  [UserRole.ADMIN]: [
    PromotionOperation.INITIATE,
    PromotionOperation.VALIDATE,
    PromotionOperation.TEST,
    PromotionOperation.APPROVE,
    PromotionOperation.DEPLOY,
    PromotionOperation.ROLLBACK,
  ],
  [UserRole.DEVELOPER]: [
    PromotionOperation.INITIATE,
    PromotionOperation.VALIDATE,
    PromotionOperation.TEST,
  ],
  [UserRole.READONLY]: [],
};

/**
 * Authentication middleware for validating user identity
 */
export class AuthMiddleware {
  private jwtSecret: string;
  private tokenExpirationSeconds: number;
  private sessions: Map<string, UserContext>;

  constructor(jwtSecret: string = process.env.JWT_SECRET || 'dev-secret-key', tokenExpirationSeconds: number = 3600) {
    this.jwtSecret = jwtSecret;
    this.tokenExpirationSeconds = tokenExpirationSeconds;
    this.sessions = new Map();
  }

  /**
   * Generate a JWT token for a user
   *
   * @param userId - User ID
   * @param username - Username
   * @param role - User role
   * @param email - User email (optional)
   * @returns JWT token
   */
  generateToken(userId: string, username: string, role: UserRole, email?: string): string {
    const payload = {
      userId,
      username,
      role,
      email,
    };

    return jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: this.tokenExpirationSeconds,
    });
  }

  /**
   * Validate JWT token and extract user context
   *
   * @param token - JWT token
   * @returns User context if valid
   * @throws StandardError if token is invalid or expired
   */
  validateToken(token: string): UserContext {
    try {
      if (!token || typeof token !== 'string') {
        throw new StandardError(ErrorCode.VALIDATION_FAILED, 'Missing or invalid authentication token');
      }

      // Remove "Bearer " prefix if present
      const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;

      const decoded = jwt.verify(cleanToken, this.jwtSecret, {
        algorithms: ['HS256'],
      }) as any;

      // Validate required fields
      if (!decoded.userId || !decoded.username || !decoded.role) {
        throw new StandardError(ErrorCode.VALIDATION_FAILED, 'Invalid token structure: missing required fields');
      }

      // Validate role is one of the allowed roles
      if (!Object.values(UserRole).includes(decoded.role)) {
        throw new StandardError(ErrorCode.VALIDATION_FAILED, `Invalid role: ${decoded.role}`);
      }

      return {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
        email: decoded.email,
        issuedAt: decoded.iat || Math.floor(Date.now() / 1000),
        expiresAt: decoded.exp || Math.floor(Date.now() / 1000) + this.tokenExpirationSeconds,
      };
    } catch (error) {
      if (error instanceof StandardError) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Authentication token has expired',
          { expiredAt: error.expiredAt?.toISOString() },
          error
        );
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new StandardError(ErrorCode.VALIDATION_FAILED, 'Invalid authentication token', {}, error);
      }

      throw new StandardError(ErrorCode.VALIDATION_FAILED, 'Token validation failed', {}, error as Error);
    }
  }

  /**
   * Register a session (for session-based authentication fallback)
   *
   * @param sessionId - Session ID
   * @param userContext - User context
   */
  registerSession(sessionId: string, userContext: UserContext): void {
    this.sessions.set(sessionId, { ...userContext, sessionId });
    logger.debug('Session registered', { sessionId, userId: userContext.userId });
  }

  /**
   * Validate session
   *
   * @param sessionId - Session ID
   * @returns User context if valid
   * @throws StandardError if session is invalid or expired
   */
  validateSession(sessionId: string): UserContext {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new StandardError(ErrorCode.VALIDATION_FAILED, 'Invalid or expired session');
    }

    // Check if session has expired
    if (session.expiresAt < Math.floor(Date.now() / 1000)) {
      this.sessions.delete(sessionId);
      throw new StandardError(ErrorCode.VALIDATION_FAILED, 'Session has expired');
    }

    return session;
  }

  /**
   * Invalidate a session
   *
   * @param sessionId - Session ID
   */
  invalidateSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.debug('Session invalidated', { sessionId });
  }

  /**
   * Extract user context from Authorization header
   *
   * @param authHeader - Authorization header value
   * @returns User context
   * @throws StandardError if authorization header is invalid
   */
  extractUserContext(authHeader?: string, sessionId?: string): UserContext {
    // Try JWT token first
    if (authHeader) {
      return this.validateToken(authHeader);
    }

    // Fallback to session
    if (sessionId) {
      return this.validateSession(sessionId);
    }

    throw new StandardError(
      ErrorCode.VALIDATION_FAILED,
      'Missing authentication credentials (JWT token or session required)'
    );
  }
}

/**
 * Role-Based Access Control (RBAC) enforcer
 */
export class RBACEnforcer {
  private authMiddleware: AuthMiddleware;

  constructor(authMiddleware: AuthMiddleware) {
    this.authMiddleware = authMiddleware;
  }

  /**
   * Check if user has permission for an operation
   *
   * @param userContext - User context
   * @param operation - Operation to perform
   * @returns True if user has permission
   */
  hasPermission(userContext: UserContext, operation: PromotionOperation): boolean {
    const allowedOperations = ROLE_PERMISSIONS[userContext.role];
    return allowedOperations.includes(operation);
  }

  /**
   * Enforce permission check - throws if user lacks permission
   *
   * @param userContext - User context
   * @param operation - Operation to perform
   * @param skillId - Skill ID (for audit context)
   * @throws StandardError if user lacks permission
   */
  enforcePermission(userContext: UserContext, operation: PromotionOperation, skillId?: string): void {
    if (!this.hasPermission(userContext, operation)) {
      logger.warn('Authorization denied', {
        userId: userContext.userId,
        role: userContext.role,
        operation,
        skillId,
      });

      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        `User does not have permission to perform operation: ${operation}`,
        {
          userId: userContext.userId,
          role: userContext.role,
          operation,
          skillId,
          allowedOperations: ROLE_PERMISSIONS[userContext.role],
        }
      );
    }

    logger.debug('Authorization granted', {
      userId: userContext.userId,
      role: userContext.role,
      operation,
      skillId,
    });
  }

  /**
   * Get description of allowed operations for a role
   *
   * @param role - User role
   * @returns List of allowed operations
   */
  getAllowedOperations(role: UserRole): PromotionOperation[] {
    return ROLE_PERMISSIONS[role];
  }
}

/**
 * Authorization decorator factory
 * Wrap promotion operations to enforce RBAC
 */
export function requirePermission(operation: PromotionOperation) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      // Extract userContext and rbac from 'this' context
      if (!this.userContext) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'User context not available - authentication required'
        );
      }

      if (!this.rbacEnforcer) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'RBAC enforcer not configured'
        );
      }

      const skillId = args[0]?.skillId || args[1]?.skillId;
      this.rbacEnforcer.enforcePermission(this.userContext, operation, skillId);

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

export default AuthMiddleware;
