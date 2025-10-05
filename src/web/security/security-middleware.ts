/**
 * Security Middleware - Comprehensive security controls for web applications
 * Provides CSRF protection, CSP headers, input validation, and secure cookie handling
 */

import { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import { ILogger } from '../core/logger.js';

export interface SecurityConfig {
  csrfEnabled: boolean;
  cspEnabled: boolean;
  rateLimitingEnabled: boolean;
  allowedOrigins: string[];
  csrfTokenExpiry: number; // in seconds
  rateLimitWindow: number; // in seconds
  rateLimitMax: number;
  secureCookies: boolean;
  sameSiteCookies: 'strict' | 'lax' | 'none';
}

export interface CSRFTokens {
  [sessionId: string]: {
    token: string;
    expires: number;
  };
}

export interface RateLimitEntry {
  count: number;
  lastReset: number;
}

export class SecurityMiddleware {
  private csrfTokens: CSRFTokens = {};
  private rateLimitMap = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private config: SecurityConfig,
    private logger: ILogger,
  ) {
    // Start cleanup interval for expired tokens and rate limits
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens();
      this.cleanupExpiredRateLimits();
    }, 60000); // Run every minute
  }

  /**
   * Generate CSRF token for session
   */
  generateCSRFToken(sessionId: string): string {
    const token = randomBytes(32).toString('hex');
    const expires = Date.now() + (this.config.csrfTokenExpiry * 1000);

    this.csrfTokens[sessionId] = { token, expires };

    this.logger.debug('CSRF token generated', { sessionId });
    return token;
  }

  /**
   * Validate CSRF token
   */
  validateCSRFToken(sessionId: string, providedToken: string): boolean {
    const storedToken = this.csrfTokens[sessionId];

    if (!storedToken) {
      this.logger.warn('No CSRF token found for session', { sessionId });
      return false;
    }

    if (Date.now() > storedToken.expires) {
      delete this.csrfTokens[sessionId];
      this.logger.warn('CSRF token expired', { sessionId });
      return false;
    }

    const isValid = storedToken.token === providedToken;
    if (!isValid) {
      this.logger.warn('Invalid CSRF token', { sessionId });
    }

    return isValid;
  }

  /**
   * Content Security Policy middleware
   */
  contentSecurityPolicy = (req: Request, res: Response, next: NextFunction): void => {
    if (!this.config.cspEnabled) {
      return next();
    }

    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' ws: wss: https:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
      "block-all-mixed-content"
    ].join('; ');

    res.setHeader('Content-Security-Policy', cspHeader);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
    );

    next();
  };

  /**
   * CSRF protection middleware
   */
  csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
    if (!this.config.csrfEnabled) {
      return next();
    }

    // Skip CSRF for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const sessionId = this.getSessionId(req);
    if (!sessionId) {
      this.logger.warn('No session ID found for CSRF validation', {
        method: req.method,
        url: req.url,
      });
      return res.status(401).json({ error: 'Session required' });
    }

    const token = req.get('X-CSRF-Token') || req.body?.csrfToken;

    if (!token) {
      this.logger.warn('No CSRF token provided', {
        sessionId,
        method: req.method,
        url: req.url,
      });
      return res.status(403).json({ error: 'CSRF token required' });
    }

    if (!this.validateCSRFToken(sessionId, token)) {
      this.logger.warn('Invalid CSRF token provided', {
        sessionId,
        method: req.method,
        url: req.url,
      });
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    // Generate new token after successful validation
    const newToken = this.generateCSRFToken(sessionId);
    res.set('X-CSRF-Token', newToken);

    next();
  };

  /**
   * Rate limiting middleware
   */
  rateLimiting = (req: Request, res: Response, next: NextFunction): void => {
    if (!this.config.rateLimitingEnabled) {
      return next();
    }

    const key = this.getRateLimitKey(req);
    const now = Date.now();
    const entry = this.rateLimitMap.get(key);

    if (!entry) {
      this.rateLimitMap.set(key, { count: 1, lastReset: now });
      return next();
    }

    // Reset counter if window has expired
    if (now - entry.lastReset > this.config.rateLimitWindow * 1000) {
      this.rateLimitMap.set(key, { count: 1, lastReset: now });
      return next();
    }

    // Check if rate limit exceeded
    if (entry.count >= this.config.rateLimitMax) {
      this.logger.warn('Rate limit exceeded', {
        key,
        count: entry.count,
        limit: this.config.rateLimitMax,
        window: this.config.rateLimitWindow,
      });

      res.set({
        'X-RateLimit-Limit': this.config.rateLimitMax.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(entry.lastReset + this.config.rateLimitWindow * 1000).toISOString(),
      });

      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: this.config.rateLimitWindow,
      });
    }

    // Increment counter
    entry.count++;

    res.set({
      'X-RateLimit-Limit': this.config.rateLimitMax.toString(),
      'X-RateLimit-Remaining': (this.config.rateLimitMax - entry.count).toString(),
      'X-RateLimit-Reset': new Date(entry.lastReset + this.config.rateLimitWindow * 1000).toISOString(),
    });

    next();
  };

  /**
   * Secure cookies middleware
   */
  secureCookies = (req: Request, res: Response, next: NextFunction): void => {
    // This should be used when setting cookies
    const originalCookie = res.cookie;

    res.cookie = (name: string, value: string, options?: any) => {
      const secureOptions = {
        httpOnly: true,
        secure: this.config.secureCookies,
        sameSite: this.config.sameSiteCookies,
        ...options,
      };

      return originalCookie.call(res, name, value, secureOptions);
    };

    next();
  };

  /**
   * Origin validation middleware
   */
  originValidation = (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get('Origin') || req.get('Referer');

    // Skip for same-origin requests
    if (!origin || this.isSameOrigin(req, origin)) {
      return next();
    }

    if (!this.config.allowedOrigins.includes(origin)) {
      this.logger.warn('Invalid origin', {
        origin,
        method: req.method,
        url: req.url,
        ip: req.ip,
      });

      return res.status(403).json({ error: 'Origin not allowed' });
    }

    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');

    next();
  };

  /**
   * Input validation middleware
   */
  inputValidation = (req: Request, res: Response, next: NextFunction): void => {
    // Validate JSON payloads
    if (req.is('json') && req.body) {
      const jsonStr = JSON.stringify(req.body);

      // Check payload size (limit to 1MB)
      if (jsonStr.length > 1024 * 1024) {
        this.logger.warn('Request payload too large', {
          size: jsonStr.length,
          limit: 1024 * 1024,
        });
        return res.status(413).json({ error: 'Request payload too large' });
      }

      // Check for potential XSS in string values
      const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
      ];

      const sanitizeValue = (value: any): any => {
        if (typeof value === 'string') {
          for (const pattern of xssPatterns) {
            if (pattern.test(value)) {
              this.logger.warn('Potential XSS detected in input', {
                value: value.substring(0, 100),
              });
              throw new Error('Invalid input detected');
            }
          }
          return value;
        } else if (Array.isArray(value)) {
          return value.map(sanitizeValue);
        } else if (typeof value === 'object' && value !== null) {
          const sanitized: any = {};
          for (const [key, val] of Object.entries(value)) {
            sanitized[key] = sanitizeValue(val);
          }
          return sanitized;
        }
        return value;
      };

      try {
        req.body = sanitizeValue(req.body);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid input detected' });
      }
    }

    next();
  };

  /**
   * Cleanup expired CSRF tokens
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, token] of Object.entries(this.csrfTokens)) {
      if (now > token.expires) {
        delete this.csrfTokens[sessionId];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cleaned up expired CSRF tokens', { count: cleaned });
    }
  }

  /**
   * Cleanup expired rate limits
   */
  private cleanupExpiredRateLimits(): void {
    const now = Date.now();
    const windowMs = this.config.rateLimitWindow * 1000;
    let cleaned = 0;

    for (const [key, entry] of this.rateLimitMap.entries()) {
      if (now - entry.lastReset > windowMs * 2) { // Clean up after 2 windows
        this.rateLimitMap.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cleaned up expired rate limits', { count: cleaned });
    }
  }

  /**
   * Get session ID from request
   */
  private getSessionId(req: Request): string | null {
    // Try to get session ID from various sources
    return req.session?.id || req.sessionID || req.get('Authorization')?.replace('Bearer ', '') || null;
  }

  /**
   * Get rate limiting key for request
   */
  private getRateLimitKey(req: Request): string {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const sessionId = this.getSessionId(req);
    return sessionId ? `session:${sessionId}` : `ip:${ip}`;
  }

  /**
   * Check if request is same-origin
   */
  private isSameOrigin(req: Request, origin: string): boolean {
    const host = req.get('Host');
    if (!host) return false;

    const protocol = req.protocol;
    const expectedOrigin = `${protocol}://${host}`;

    return origin === expectedOrigin || origin.startsWith(expectedOrigin);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.csrfTokens = {};
    this.rateLimitMap.clear();
  }

  /**
   * Get security statistics
   */
  getStats(): {
    activeCSRFtokens: number;
    activeRateLimits: number;
    config: SecurityConfig;
  } {
    return {
      activeCSRFtokens: Object.keys(this.csrfTokens).length,
      activeRateLimits: this.rateLimitMap.size,
      config: { ...this.config },
    };
  }
}

// Default security configuration
export const defaultSecurityConfig: SecurityConfig = {
  csrfEnabled: true,
  cspEnabled: true,
  rateLimitingEnabled: true,
  allowedOrigins: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://localhost:3000',
    'https://localhost:3001',
  ],
  csrfTokenExpiry: 3600, // 1 hour
  rateLimitWindow: 900, // 15 minutes
  rateLimitMax: 100, // 100 requests per window
  secureCookies: process.env.NODE_ENV === 'production',
  sameSiteCookies: 'strict',
};