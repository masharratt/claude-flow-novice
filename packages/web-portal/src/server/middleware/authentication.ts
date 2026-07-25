/**
 * JWT Authentication Middleware
 *
 * Verifies JWT tokens and attaches user to request
 * Supports Bearer token authentication
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { APIError } from './error-handler.js';
import { tokenBlacklistService } from '../services/token-blacklist.js';
import crypto from 'crypto';

/**
 * User payload extracted from JWT
 */
export interface JWTUser {
  jti?: string; // Token ID (required for blacklist)
  userId: string;
  role: 'admin' | 'user' | 'service' | 'guest';
  permissions: string[];
  iat?: number;
  exp?: number;
}

/**
 * Extended Request with user information
 */
declare global {
  namespace Express {
    interface Request {
      user?: JWTUser;
      apiKey?: {
        keyId: string;
        serviceName: string;
        permissions: string[];
      };
    }
  }
}

/**
 * JWT secret configuration
 */
const getJWTSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  const nodeEnv = process.env.NODE_ENV || 'development';

  // MED-004 Fix: Validate JWT secret in production
  if (nodeEnv === 'production') {
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    if (secret === 'development-secret') {
      throw new Error('Cannot use development-secret in production environment');
    }
  }

  // Development fallback with warning
  if (!secret && nodeEnv === 'development') {
    console.warn('⚠️  WARNING: Using default JWT_SECRET in development. Set JWT_SECRET env variable.');
    return 'development-secret';
  }

  return secret || 'development-secret';
};

/**
 * Token verification cache (5 minute TTL)
 * Prevents redundant JWT verification for same token
 */
interface CacheEntry {
  user: JWTUser;
  expiry: number;
}

const tokenCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clear expired cache entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tokenCache.entries()) {
    if (entry.expiry < now) {
      tokenCache.delete(token);
    }
  }
}, 60 * 1000); // Clean every minute

/**
 * Constant-time string comparison to prevent timing attacks
 */
const constantTimeCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Extract JWT token from Authorization header
 */
const extractBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Verify JWT token and extract user
 */
const verifyJWTToken = async (token: string): Promise<JWTUser> => {
  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.expiry > Date.now()) {
    return cached.user;
  }

  try {
    const secret = getJWTSecret();
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'], // Only allow HS256
    }) as JWTUser;

    // Validate required fields
    if (!decoded.userId || !decoded.role) {
      throw new Error('Invalid token payload: missing userId or role');
    }

    // Validate role
    const validRoles = ['admin', 'user', 'service', 'guest'];
    if (!validRoles.includes(decoded.role)) {
      throw new Error('Invalid token payload: invalid role');
    }

    // MED-002 Fix: Check if token is blacklisted (revoked)
    if (decoded.jti) {
      const isBlacklisted = await tokenBlacklistService.isBlacklisted(decoded.jti);
      if (isBlacklisted) {
        throw new APIError(401, 'TOKEN_REVOKED', 'Token has been revoked');
      }
    }

    // Cache the result
    tokenCache.set(token, {
      user: decoded,
      expiry: Date.now() + CACHE_TTL_MS,
    });

    return decoded;
  } catch (error) {
    // Clear from cache if present
    tokenCache.delete(token);

    if (error instanceof jwt.TokenExpiredError) {
      throw new APIError(401, 'TOKEN_EXPIRED', 'JWT token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new APIError(401, 'INVALID_TOKEN', 'Invalid JWT token');
    }
    throw error;
  }
};

/**
 * Audit log for failed authentication attempts
 */
const auditFailedAuth = (req: Request, reason: string): void => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ip: req.ip || req.socket.remoteAddress,
    path: req.path,
    method: req.method,
    reason,
    userAgent: req.headers['user-agent'],
  };

  console.warn('🚨 Authentication failed:', logEntry);

  // In production, send to audit logging service
  // auditService.log('AUTH_FAILURE', logEntry);
};

/**
 * JWT Authentication Middleware
 *
 * Verifies Bearer token and attaches user to req.user
 * Returns 401 if token is missing or invalid
 */
export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      auditFailedAuth(req, 'Missing Authorization header');
      throw new APIError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const user = await verifyJWTToken(token);
    req.user = user;

    next();
  } catch (error) {
    if (error instanceof APIError) {
      auditFailedAuth(req, error.code);
    }
    next(error);
  }
};

/**
 * Optional JWT Authentication
 *
 * Attaches user if valid token present, but doesn't fail if missing
 * Useful for endpoints that have different behavior for authenticated users
 */
export const optionalAuthenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractBearerToken(req);

    if (token) {
      try {
        const user = await verifyJWTToken(token);
        req.user = user;
      } catch (error) {
        // Ignore verification errors for optional auth
        // Invalid tokens are treated as unauthenticated
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Generate JWT token (utility for testing and auth service)
 */
export const generateJWTToken = (
  user: Omit<JWTUser, 'iat' | 'exp'>,
  expiresIn: string = '24h'
): string => {
  const secret = getJWTSecret();
  return jwt.sign(user, secret, {
    algorithm: 'HS256',
    expiresIn,
  });
};

/**
 * Validate JWT secret at server startup
 */
export const validateJWTConfig = (): void => {
  try {
    getJWTSecret();
    console.log('✅ JWT configuration validated');
  } catch (error) {
    console.error('❌ JWT configuration error:', error);
    throw error;
  }
};
