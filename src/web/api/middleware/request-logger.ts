/**
 * Request Logger Middleware
 *
 * HTTP request logging middleware for the transparency API server
 *
 * @module web/api/middleware/request-logger
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '../../../core/logger.js';

/**
 * Extended Request interface with request metadata
 */
export interface RequestWithMetadata extends Request {
  requestId?: string;
  startTime?: number;
}

/**
 * Request Logger Middleware Factory
 */
export function requestLogger(logger: Logger) {
  return (req: RequestWithMetadata, res: Response, next: NextFunction) => {
    // Generate unique request ID
    const requestId = uuidv4().slice(0, 8);
    req.requestId = requestId;
    req.startTime = Date.now();

    // Set request ID in response headers
    res.setHeader('X-Request-ID', requestId);

    // Log request start
    const requestLog = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      contentLength: req.get('Content-Length') || 0,
      contentType: req.get('Content-Type'),
      referer: req.get('Referer'),
      user: (req as any).user?.id || 'anonymous',
      timestamp: new Date().toISOString()
    };

    logger.info('Request started', requestLog);

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(this: Response, ...args: any[]) {
      // Calculate duration
      const duration = req.startTime ? Date.now() - req.startTime : 0;

      // Log response
      const responseLog = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        contentLength: res.get('Content-Length') || 0,
        duration: `${duration}ms`,
        ip: req.ip || req.connection.remoteAddress,
        user: (req as any).user?.id || 'anonymous',
        timestamp: new Date().toISOString()
      };

      // Log based on status code
      if (res.statusCode >= 500) {
        logger.error('Request completed with server error', responseLog);
      } else if (res.statusCode >= 400) {
        logger.warn('Request completed with client error', responseLog);
      } else if (res.statusCode >= 300) {
        logger.info('Request completed with redirect', responseLog);
      } else {
        logger.info('Request completed successfully', responseLog);
      }

      // Call original end
      originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Performance Logger Middleware
 *
 * Logs slow requests and performance metrics
 */
export function performanceLogger(logger: Logger, thresholdMs: number = 1000) {
  return (req: RequestWithMetadata, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      if (duration > thresholdMs) {
        logger.warn('Slow request detected', {
          requestId: req.requestId,
          method: req.method,
          url: req.originalUrl,
          duration: `${duration}ms`,
          threshold: `${thresholdMs}ms`,
          statusCode: res.statusCode,
          user: (req as any).user?.id || 'anonymous'
        });
      }
    });

    next();
  };
}

/**
 * Security Logger Middleware
 *
 * Logs security-related events and suspicious activity
 */
export function securityLogger(logger: Logger) {
  return (req: RequestWithMetadata, res: Response, next: NextFunction) => {
    // Log suspicious user agents
    const userAgent = req.get('User-Agent') || '';
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /scanner/i,
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /curl/i,
      /wget/i
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
      logger.warn('Suspicious user agent detected', {
        requestId: req.requestId,
        userAgent,
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    }

    // Log requests to sensitive endpoints
    const sensitiveEndpoints = [
      '/api/v1/system',
      '/api/v1/admin',
      '/api/v1/users',
      '/api/v1/auth'
    ];

    if (sensitiveEndpoints.some(endpoint => req.path.startsWith(endpoint))) {
      logger.info('Access to sensitive endpoint', {
        requestId: req.requestId,
        endpoint: req.path,
        method: req.method,
        ip: req.ip,
        user: (req as any).user?.id || 'anonymous',
        timestamp: new Date().toISOString()
      });
    }

    // Log failed authentication attempts
    res.on('finish', () => {
      if (res.statusCode === 401 && req.path.includes('/auth')) {
        logger.warn('Authentication failed', {
          requestId: req.requestId,
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent,
          timestamp: new Date().toISOString()
        });
      }

      // Log authorization failures
      if (res.statusCode === 403) {
        logger.warn('Authorization failed', {
          requestId: req.requestId,
          path: req.path,
          method: req.method,
          ip: req.ip,
          user: (req as any).user?.id || 'anonymous',
          timestamp: new Date().toISOString()
        });
      }
    });

    next();
  };
}

/**
 * API Metrics Logger Middleware
 *
 * Logs API usage metrics for monitoring and analytics
 */
export function metricsLogger(logger: Logger) {
  const metrics = {
    requests: 0,
    errors: 0,
    totalDuration: 0,
    endpointCounts: new Map<string, number>(),
    methodCounts: new Map<string, number>(),
    statusCounts: new Map<number, number>()
  };

  // Log metrics every 5 minutes
  setInterval(() => {
    if (metrics.requests > 0) {
      logger.info('API metrics summary', {
        period: '5 minutes',
        totalRequests: metrics.requests,
        errorRate: `${((metrics.errors / metrics.requests) * 100).toFixed(2)}%`,
        averageDuration: `${(metrics.totalDuration / metrics.requests).toFixed(2)}ms`,
        topEndpoints: Array.from(metrics.endpointCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10),
        methodDistribution: Object.fromEntries(metrics.methodCounts),
        statusDistribution: Object.fromEntries(metrics.statusCounts)
      });

      // Reset metrics
      metrics.requests = 0;
      metrics.errors = 0;
      metrics.totalDuration = 0;
      metrics.endpointCounts.clear();
      metrics.methodCounts.clear();
      metrics.statusCounts.clear();
    }
  }, 5 * 60 * 1000);

  return (req: RequestWithMetadata, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const endpoint = `${req.method} ${req.route?.path || req.path}`;

      // Update metrics
      metrics.requests++;
      metrics.totalDuration += duration;

      if (res.statusCode >= 400) {
        metrics.errors++;
      }

      // Count endpoints
      metrics.endpointCounts.set(
        endpoint,
        (metrics.endpointCounts.get(endpoint) || 0) + 1
      );

      // Count methods
      metrics.methodCounts.set(
        req.method,
        (metrics.methodCounts.get(req.method) || 0) + 1
      );

      // Count status codes
      metrics.statusCounts.set(
        res.statusCode,
        (metrics.statusCounts.get(res.statusCode) || 0) + 1
      );
    });

    next();
  };
}