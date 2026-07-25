/**
 * API Key Authentication Middleware
 *
 * Verifies API keys from X-API-Key header
 * Supports service-to-service authentication with rate limiting
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { APIError } from './error-handler.js';

/**
 * API Key information
 */
export interface APIKeyInfo {
  keyId: string;
  serviceName: string;
  permissions: string[];
  rateLimit?: number; // Requests per minute (default 10x standard)
}

/**
 * In-memory API key storage (placeholder for Sprint 2.2)
 * In production, this would query database or Redis
 */
const API_KEYS = new Map<string, APIKeyInfo>();

/**
 * Rate limiting for API keys (10x standard rate)
 * Tracks request counts per API key per minute
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const DEFAULT_RATE_LIMIT = 600; // 10x standard rate (60 req/min * 10)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Clear expired rate limit entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [keyId, entry] of rateLimitMap.entries()) {
    if (entry.resetTime < now) {
      rateLimitMap.delete(keyId);
    }
  }
}, 60 * 1000); // Clean every minute

/**
 * Constant-time comparison for API keys (prevent timing attacks)
 */
const constantTimeCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Extract API key from X-API-Key header
 */
const extractAPIKey = (req: Request): string | null => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    return null;
  }
  return apiKey.trim();
};

/**
 * Validate API key format (should be 32+ character alphanumeric)
 */
const isValidAPIKeyFormat = (key: string): boolean => {
  // API key should be at least 32 characters
  if (key.length < 32) {
    return false;
  }

  // Should contain only alphanumeric characters and hyphens
  return /^[a-zA-Z0-9-]+$/.test(key);
};

/**
 * Verify API key against database/Redis
 * Placeholder implementation for Sprint 2.2
 */
const verifyAPIKey = async (apiKey: string): Promise<APIKeyInfo> => {
  // Validate format first
  if (!isValidAPIKeyFormat(apiKey)) {
    throw new APIError(401, 'INVALID_API_KEY_FORMAT', 'API key format is invalid');
  }

  // Check in-memory storage (placeholder)
  for (const [storedKey, info] of API_KEYS.entries()) {
    if (constantTimeCompare(apiKey, storedKey)) {
      return info;
    }
  }

  // In production, query database/Redis:
  // const keyInfo = await apiKeyService.verify(apiKey);
  // if (!keyInfo) throw new APIError(401, 'INVALID_API_KEY', 'API key not found');
  // return keyInfo;

  throw new APIError(401, 'INVALID_API_KEY', 'API key not found or invalid');
};

/**
 * Check rate limit for API key
 */
const checkRateLimit = (keyId: string, rateLimit: number): void => {
  const now = Date.now();
  const entry = rateLimitMap.get(keyId);

  if (!entry || entry.resetTime < now) {
    // Create new rate limit window
    rateLimitMap.set(keyId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  // Increment count
  entry.count++;

  // Check if exceeded
  if (entry.count > rateLimit) {
    const resetInSeconds = Math.ceil((entry.resetTime - now) / 1000);
    throw new APIError(
      429,
      'RATE_LIMIT_EXCEEDED',
      `API key rate limit exceeded. Resets in ${resetInSeconds} seconds`,
      { resetTime: entry.resetTime, rateLimit }
    );
  }
};

/**
 * Audit log for failed API key authentication
 */
const auditFailedAPIKeyAuth = (req: Request, reason: string): void => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ip: req.ip || req.socket.remoteAddress,
    path: req.path,
    method: req.method,
    reason,
    userAgent: req.headers['user-agent'],
  };

  console.warn('🚨 API Key authentication failed:', logEntry);

  // In production, send to audit logging service
  // auditService.log('API_KEY_AUTH_FAILURE', logEntry);
};

/**
 * API Key Authentication Middleware
 *
 * Verifies X-API-Key header and attaches service identity to req.apiKey
 * Returns 401 if API key is missing or invalid
 * Returns 429 if rate limit exceeded
 */
export const authenticateAPIKey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = extractAPIKey(req);

    if (!apiKey) {
      auditFailedAPIKeyAuth(req, 'Missing X-API-Key header');
      throw new APIError(401, 'UNAUTHORIZED', 'API key required');
    }

    const keyInfo = await verifyAPIKey(apiKey);

    // Check rate limit (10x standard rate)
    const rateLimit = keyInfo.rateLimit || DEFAULT_RATE_LIMIT;
    checkRateLimit(keyInfo.keyId, rateLimit);

    // Attach service identity to request
    req.apiKey = keyInfo;

    next();
  } catch (error) {
    if (error instanceof APIError) {
      auditFailedAPIKeyAuth(req, error.code);
    }
    next(error);
  }
};

/**
 * Combined Authentication Middleware
 *
 * Try JWT first, fallback to API key
 * Useful for endpoints that accept both authentication methods
 */
export const authenticateRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Try JWT first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Delegate to JWT middleware
      const { authenticateJWT } = await import('./authentication.js');
      return authenticateJWT(req, res, next);
    }

    // Try API key
    const apiKey = extractAPIKey(req);
    if (apiKey) {
      return authenticateAPIKey(req, res, next);
    }

    // No authentication provided
    throw new APIError(401, 'UNAUTHORIZED', 'Authentication required (JWT or API key)');
  } catch (error) {
    next(error);
  }
};

/**
 * Register API key (utility for testing and admin)
 * In production, this would be handled by a secure admin API
 */
export const registerAPIKey = (apiKey: string, info: APIKeyInfo): void => {
  API_KEYS.set(apiKey, info);
  console.log(`✅ API key registered: ${info.serviceName} (${info.keyId})`);
};

/**
 * Revoke API key (utility for testing and admin)
 */
export const revokeAPIKey = (apiKey: string): boolean => {
  const deleted = API_KEYS.delete(apiKey);
  if (deleted) {
    console.log(`🗑️  API key revoked: ${apiKey.substring(0, 8)}...`);
  }
  return deleted;
};

/**
 * Generate secure API key (utility)
 */
export const generateAPIKey = (): string => {
  // Generate 32-byte random key, encode as base64url
  const buffer = crypto.randomBytes(32);
  return buffer.toString('base64url');
};
