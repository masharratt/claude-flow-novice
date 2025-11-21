/**
 * Authentication Middleware
 * 
 * Comprehensive authentication and authorization middleware for Express.js
 * with JWT token validation, role-based access control, and security features.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger.js';
import { StandardError, ErrorCode } from '../../lib/errors.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
        iat?: number;
        exp?: number;
      };
    }
  }
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiration: string;
  bcryptRounds: number;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Authentication middleware that validates JWT tokens
 * 
 * @param config Authentication configuration
 * @returns Express middleware function
 */
export function authenticationMiddleware(config: AuthConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check for authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'No authorization header provided',
          errorCode: 'AUTH_001',
        });
        return;
      }

      // Validate authorization header format
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid authorization header format',
          errorCode: 'AUTH_003',
        });
        return;
      }

      // Extract and sanitize token
      const token = authHeader.slice(7).trim();
      if (!token) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'No token provided',
          errorCode: 'AUTH_005',
        });
        return;
      }

      // Verify JWT token
      let decoded: JWTPayload;
      try {
        decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
      } catch (error) {
        // Handle specific JWT errors
        if (error instanceof jwt.TokenExpiredError) {
          res.status(401).json({
            error: 'Unauthorized',
            message: 'Token has expired',
            errorCode: 'AUTH_004',
          });
          return;
        } else if (error instanceof jwt.JsonWebTokenError) {
          res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token',
            errorCode: 'AUTH_002',
          });
          return;
        } else {
          logger.error('Unexpected JWT verification error:', error);
          res.status(401).json({
            error: 'Unauthorized',
            message: 'Token verification failed',
            errorCode: 'AUTH_006',
          });
          return;
        }
      }

      // Attach user information to request
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        iat: decoded.iat,
        exp: decoded.exp,
      };

      // Log successful authentication
      logger.info(`User authenticated: ${decoded.userId} (${decoded.email})`, {
        userId: decoded.userId,
        role: decoded.role,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      next();
    } catch (error) {
      logger.error('Authentication middleware error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication service unavailable',
        errorCode: 'AUTH_500',
      });
    }
  };
}

/**
 * Authorization middleware for role-based access control
 * 
 * @param requiredRoles Array of roles that are allowed to access the resource
 * @returns Express middleware function
 */
export function authorizationMiddleware(requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      // Check if user has required role
      if (!requiredRoles.includes(req.user.role)) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions',
          requiredRoles,
          userRole: req.user.role,
        });
        return;
      }

      // Log successful authorization
      logger.info(`User authorized: ${req.user.userId} (${req.user.role})`, {
        userId: req.user.userId,
        role: req.user.role,
        requiredRoles,
      });

      next();
    } catch (error) {
      logger.error('Authorization middleware error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authorization service unavailable',
      });
    }
  };
}

/**
 * Password utilities for secure password handling
 */
export class PasswordUtils {
  /**
   * Hash a password using bcrypt
   * 
   * @param password Plain text password
   * @param rounds Number of bcrypt rounds (default 12)
   * @returns Hashed password
   */
  static async hashPassword(password: string, rounds: number = 12): Promise<string> {
    try {
      return await bcrypt.hash(password, rounds);
    } catch (error) {
      logger.error('Password hashing error:', error);
      throw new StandardError('Failed to hash password', ErrorCode.INTERNAL_ERROR);
    }
  }

  /**
   * Generate salt for password hashing
   * 
   * @param rounds Number of bcrypt rounds (default 12)
   * @returns Salt string
   */
  static async generateSalt(rounds: number = 12): Promise<string> {
    try {
      return await bcrypt.genSalt(rounds);
    } catch (error) {
      logger.error('Salt generation error:', error);
      throw new StandardError('Failed to generate salt', ErrorCode.INTERNAL_ERROR);
    }
  }

  /**
   * Compare a plain text password with a hash
   * 
   * @param password Plain text password
   * @param hash Hashed password
   * @returns True if passwords match
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password comparison error:', error);
      throw new StandardError('Failed to compare passwords', ErrorCode.INTERNAL_ERROR);
    }
  }

  /**
   * Validate password strength
   * 
   * @param password Password to validate
   * @returns True if password meets strength requirements
   */
  static validatePasswordStrength(password: string): boolean {
    // Minimum 8 characters, at least one uppercase, one lowercase, one number, and one special character
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return (
      password.length >= minLength &&
      hasUpperCase &&
      hasLowerCase &&
      hasNumbers &&
      hasSpecialChar
    );
  }
}

/**
 * JWT utilities for token management
 */
export class JWTUtils {
  /**
   * Generate a JWT token
   * 
   * @param payload Token payload
   * @param secret JWT secret
   * @param expiresIn Token expiration time
   * @returns JWT token
   */
  static generateToken(
    payload: Omit<JWTPayload, 'iat' | 'exp'>,
    secret: string,
    expiresIn: string = '24h'
  ): string {
    try {
      return jwt.sign(payload, secret, { expiresIn });
    } catch (error) {
      logger.error('Token generation error:', error);
      throw new StandardError('Failed to generate token', ErrorCode.INTERNAL_ERROR);
    }
  }

  /**
   * Verify a JWT token
   * 
   * @param token JWT token
   * @param secret JWT secret
   * @returns Decoded payload
   */
  static verifyToken(token: string, secret: string): JWTPayload {
    try {
      return jwt.verify(token, secret) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new StandardError('Token has expired', ErrorCode.TOKEN_EXPIRED);
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new StandardError('Invalid token', ErrorCode.INVALID_TOKEN);
      } else {
        throw new StandardError('Token verification failed', ErrorCode.INTERNAL_ERROR);
      }
    }
  }

  /**
   * Decode a JWT token without verification (for debugging)
   * 
   * @param token JWT token
   * @returns Decoded payload
   */
  static decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      logger.error('Token decoding error:', error);
      return null;
    }
  }
}

/**
 * Rate limiting utilities for authentication endpoints
 */
export class AuthRateLimit {
  private static attempts = new Map<string, { count: number; lastAttempt: number }>();

  /**
   * Check if user has exceeded login attempts
   * 
   * @param identifier User identifier (email, IP, etc.)
   * @param maxAttempts Maximum allowed attempts
   * @param windowMs Time window in milliseconds
   * @returns True if attempts exceeded
   */
  static hasExceededAttempts(
    identifier: string,
    maxAttempts: number = 5,
    windowMs: number = 15 * 60 * 1000 // 15 minutes
  ): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(identifier);

    if (!attempts) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
      return false;
    }

    // Reset if window has expired
    if (now - attempts.lastAttempt > windowMs) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
      return false;
    }

    // Increment attempts
    attempts.count++;
    attempts.lastAttempt = now;

    // Check if exceeded
    if (attempts.count > maxAttempts) {
      logger.warn(`Login attempts exceeded for ${identifier}`, {
        identifier,
        attempts: attempts.count,
        windowMs,
      });
      return true;
    }

    return false;
  }

  /**
   * Clear failed attempts for a user
   * 
   * @param identifier User identifier
   */
  static clearAttempts(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

export default {
  authenticationMiddleware,
  authorizationMiddleware,
  PasswordUtils,
  JWTUtils,
  AuthRateLimit,
};