/**
 * Authentication Middleware
 *
 * JWT and API key authentication for the transparency API server
 *
 * @module web/api/middleware/auth
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { ApiConfig } from '../config/api-config.js';

/**
 * Extended Request interface with user data
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username?: string;
    role?: string;
    permissions?: string[];
  };
  apiKey?: string;
}

/**
 * JWT Authentication Middleware
 */
export function authMiddleware(config: ApiConfig) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Skip authentication for health check and API documentation
    if (req.path === '/health' || req.path === '/api') {
      return next();
    }

    // Try JWT authentication first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        req.user = {
          id: decoded.sub || decoded.id,
          username: decoded.username,
          role: decoded.role || 'user',
          permissions: decoded.permissions || []
        };
        return next();
      } catch (error) {
        // Invalid JWT, try API key authentication
      }
    }

    // Try API key authentication
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey && apiKey === config.apiKey) {
      req.apiKey = apiKey;
      return next();
    }

    // Check for basic auth (for development/testing)
    const basicAuth = req.headers.authorization;
    if (basicAuth && basicAuth.startsWith('Basic ')) {
      try {
        const credentials = Buffer.from(basicAuth.substring(6), 'base64').toString();
        const [username, password] = credentials.split(':');

        // Simple development authentication (replace with proper auth in production)
        if (config.environment === 'development' && username === 'admin' && password === 'admin') {
          req.user = {
            id: 'dev-admin',
            username: 'admin',
            role: 'admin',
            permissions: ['read', 'write', 'admin']
          };
          return next();
        }
      } catch (error) {
        // Invalid basic auth
      }
    }

    // No valid authentication found
    if (config.environment === 'development') {
      // Allow unauthenticated access in development with warning
      console.warn('Unauthenticated request in development mode:', req.method, req.path);
      req.user = {
        id: 'dev-anonymous',
        username: 'anonymous',
        role: 'user',
        permissions: ['read']
      };
      return next();
    }

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
      timestamp: new Date().toISOString()
    });
  };
}

/**
 * Role-based authorization middleware
 */
export function requireRole(requiredRole: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires ${requiredRole} role`,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    const hasPermission = req.user.permissions?.includes(permission) ||
                         req.user.role === 'admin' ||
                         req.user.permissions?.includes('*');

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires ${permission} permission`,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

/**
 * Optional authentication middleware (doesn't fail if no auth)
 */
export function optionalAuth(config: ApiConfig) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Try JWT authentication
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        req.user = {
          id: decoded.sub || decoded.id,
          username: decoded.username,
          role: decoded.role || 'user',
          permissions: decoded.permissions || []
        };
      } catch (error) {
        // Invalid JWT, ignore
      }
    }

    // Try API key authentication
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey && apiKey === config.apiKey) {
      req.apiKey = apiKey;
    }

    next();
  };
}

/**
 * WebSocket authentication helper
 */
export function authenticateWebSocket(socket: any, config: ApiConfig): boolean {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return false;
  }

  try {
    // JWT authentication
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    socket.data.user = {
      id: decoded.sub || decoded.id,
      username: decoded.username,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };
    return true;
  } catch (error) {
    // API key authentication
    if (token === config.apiKey) {
      socket.data.apiKey = token;
      socket.data.user = {
        id: 'api-key-user',
        username: 'api-key',
        role: 'service',
        permissions: ['read', 'write']
      };
      return true;
    }
  }

  return false;
}

/**
 * Generate JWT token for user
 */
export function generateToken(user: any, config: ApiConfig): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiration,
      issuer: 'transparency-api',
      audience: 'transparency-dashboard'
    }
  );
}