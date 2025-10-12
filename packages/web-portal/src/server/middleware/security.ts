/**
 * Security Middleware - Helmet Configuration
 *
 * MED-001 Fix: Comprehensive security headers with Content Security Policy
 *
 * Security Headers Configured:
 * - CSP: Content-Security-Policy with strict directives
 * - HSTS: HTTP Strict-Transport-Security (1 year, includeSubDomains)
 * - X-Frame-Options: DENY (prevent clickjacking)
 * - X-Content-Type-Options: nosniff
 * - X-XSS-Protection: 1; mode=block
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: Restrictive feature permissions
 */

import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

/**
 * Production-ready Helmet configuration with strict CSP
 */
export const securityHeaders = helmet({
  // Content Security Policy - Strict default-src
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],

      // Script sources - unsafe-inline only for development
      scriptSrc: [
        "'self'",
        ...(process.env.NODE_ENV === 'development' ? ["'unsafe-inline'"] : []),
      ],

      // Style sources - unsafe-inline for Monaco Editor compatibility
      styleSrc: ["'self'", "'unsafe-inline'"],

      // Image sources - allow data URIs and HTTPS
      imgSrc: ["'self'", "data:", "https:"],

      // Connect sources - allow WebSocket connections
      connectSrc: [
        "'self'",
        "ws:",
        "wss:",
        ...(process.env.NODE_ENV === 'development' ? ["http://localhost:*"] : []),
      ],

      // Font sources
      fontSrc: ["'self'"],

      // Object/embed sources - blocked
      objectSrc: ["'none'"],

      // Media sources
      mediaSrc: ["'self'"],

      // Frame sources - self only (WebSocket testing iframe in dev)
      frameSrc: ["'self'"],

      // Worker sources (for Monaco Editor web workers)
      workerSrc: ["'self'", "blob:"],

      // Base URI restriction
      baseUri: ["'self'"],

      // Form action restriction
      formAction: ["'self'"],

      // Frame ancestors - deny embedding
      frameAncestors: ["'none'"],

      // Upgrade insecure requests (HTTPS-only in production)
      ...(process.env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
    },
  },

  // HTTP Strict Transport Security - 1 year
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options: DENY (prevent clickjacking)
  frameguard: {
    action: 'deny',
  },

  // X-Content-Type-Options: nosniff
  noSniff: true,

  // X-XSS-Protection: 1; mode=block (legacy browsers)
  xssFilter: true,

  // Referrer-Policy: strict-origin-when-cross-origin
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // DNS Prefetch Control - allow for performance
  dnsPrefetchControl: {
    allow: true,
  },

  // Remove X-Powered-By header (hide technology stack)
  hidePoweredBy: true,

  // IE No Open - prevent IE from executing downloads in site context
  ieNoOpen: true,
});

/**
 * Permissions-Policy header (manual configuration for Helmet 8.x)
 * Replaces deprecated Feature-Policy
 */
export const permissionsPolicyHeader = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader(
    'Permissions-Policy',
    [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
    ].join(", ")
  );
  next();
};

/**
 * Security audit logging middleware
 *
 * Logs security-relevant events for audit trail
 */
export const securityAuditLogger = (req: Request, res: Response, next: NextFunction): void => {
  const securityEvents = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/intervention',
  ];

  const isSecurityEvent = securityEvents.some(path => req.path.startsWith(path));

  if (isSecurityEvent) {
    // Log security event (in production, send to centralized logging)
    console.log('[SECURITY_AUDIT]', {
      timestamp: new Date().toISOString(),
      event: req.method,
      path: req.path,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      userId: (req as any).user?.id, // JWT user ID if authenticated
    });
  }

  next();
};

/**
 * CORS Security Configuration
 *
 * Strict CORS policy with credentials support
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }

    // Allowed origins from environment variable
    const allowedOrigins = (process.env.WEB_PORTAL_ORIGINS || 'http://localhost:3001')
      .split(',')
      .map(o => o.trim());

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('[SECURITY_AUDIT] CORS violation:', { origin, allowedOrigins });
      callback(new Error('CORS policy violation'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400, // 24 hours preflight cache
};

/**
 * Request payload size validation middleware
 *
 * Prevents oversized payloads that could cause DoS
 */
export const payloadSizeValidator = (maxSizeBytes: number = 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('content-length') || '0', 10);

    if (contentLength > maxSizeBytes) {
      console.warn('[SECURITY_AUDIT] Payload too large:', {
        contentLength,
        maxSize: maxSizeBytes,
        path: req.path,
        ip: req.ip,
      });

      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Payload size ${contentLength} exceeds maximum ${maxSizeBytes} bytes`,
        },
      });
      return;
    }

    next();
  };
};
