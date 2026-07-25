/**
 * Authentication API Routes
 *
 * Endpoints:
 * - POST /api/auth/logout - Revoke current JWT token
 * - POST /api/auth/refresh - Refresh access token and blacklist old token
 *
 * Security:
 * - JWT token blacklist integration
 * - Rate limiting (10 req/min per IP)
 * - Audit logging for all auth events
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { tokenBlacklistService } from '../../services/token-blacklist.js';
import { interventionRateLimiter } from '../../middleware/rate-limiter.js';
import { APIError } from '../../middleware/error-handler.js';

const router = Router();

/**
 * JWT payload interface
 */
interface JWTPayload {
  jti: string; // Token ID (required for blacklist)
  userId: string;
  role: string;
  exp: number;
  iat: number;
}

/**
 * Extract JWT token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Decode JWT token without verification (for logout)
 */
function decodeToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === 'string') {
      return null;
    }
    return decoded as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * POST /api/auth/logout
 *
 * Revoke current JWT token by adding to blacklist
 */
router.post('/logout', interventionRateLimiter, async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new APIError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
    }

    const payload = decodeToken(token);
    if (!payload || !payload.jti) {
      throw new APIError(400, 'INVALID_TOKEN', 'Token missing jti claim (token ID required)');
    }

    // Add token to blacklist
    const expiresAt = payload.exp * 1000; // Convert to milliseconds
    const success = await tokenBlacklistService.addToBlacklist(payload.jti, expiresAt, {
      userId: payload.userId,
      reason: 'logout',
    });

    if (!success) {
      throw new APIError(500, 'LOGOUT_FAILED', 'Failed to revoke token');
    }

    // Audit log
    console.log('[SECURITY_AUDIT] User logout:', {
      timestamp: new Date().toISOString(),
      userId: payload.userId,
      tokenId: payload.jti,
      ip: req.ip || req.socket.remoteAddress,
    });

    res.status(200).json({
      success: true,
      message: 'Successfully logged out',
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, 'LOGOUT_ERROR', 'An error occurred during logout');
  }
});

/**
 * POST /api/auth/refresh
 *
 * Refresh access token and blacklist old token
 *
 * Body: { refreshToken: string }
 * Returns: { accessToken: string, refreshToken: string }
 */
router.post('/refresh', interventionRateLimiter, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new APIError(400, 'MISSING_REFRESH_TOKEN', 'Refresh token is required');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new APIError(500, 'CONFIGURATION_ERROR', 'JWT secret not configured');
    }

    // Verify refresh token
    let payload: JWTPayload;
    try {
      payload = jwt.verify(refreshToken, jwtSecret) as JWTPayload;
    } catch (error) {
      throw new APIError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }

    // Check if refresh token is blacklisted
    const isBlacklisted = await tokenBlacklistService.isBlacklisted(payload.jti);
    if (isBlacklisted) {
      throw new APIError(401, 'TOKEN_REVOKED', 'Refresh token has been revoked');
    }

    // Blacklist old refresh token
    const expiresAt = payload.exp * 1000;
    await tokenBlacklistService.addToBlacklist(payload.jti, expiresAt, {
      userId: payload.userId,
      reason: 'refresh',
    });

    // Generate new access token with jti claim
    const newAccessTokenId = `${payload.userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newAccessToken = jwt.sign(
      {
        jti: newAccessTokenId,
        userId: payload.userId,
        role: payload.role,
      },
      jwtSecret,
      {
        expiresIn: '15m', // Access token: 15 minutes
      }
    );

    // Generate new refresh token with jti claim
    const newRefreshTokenId = `${payload.userId}-refresh-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newRefreshToken = jwt.sign(
      {
        jti: newRefreshTokenId,
        userId: payload.userId,
        role: payload.role,
      },
      jwtSecret,
      {
        expiresIn: '7d', // Refresh token: 7 days
      }
    );

    // Audit log
    console.log('[SECURITY_AUDIT] Token refresh:', {
      timestamp: new Date().toISOString(),
      userId: payload.userId,
      oldTokenId: payload.jti,
      newAccessTokenId,
      newRefreshTokenId,
      ip: req.ip || req.socket.remoteAddress,
    });

    res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, 'REFRESH_ERROR', 'An error occurred during token refresh');
  }
});

export default router;
