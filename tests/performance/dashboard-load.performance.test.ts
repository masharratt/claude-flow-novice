/**
 * Performance and Load Testing for Secured Dashboard
 *
 * These tests validate the dashboard's performance characteristics under various load conditions,
 * including concurrent users, WebSocket connections, and security control overhead.
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';

describe('Dashboard Performance and Load Testing', () => {
  let app: express.Application;
  let server: Server;
  let io: SocketIOServer;
  let originalEnv: NodeJS.ProcessEnv;
  let jwtSecret: string;

  // Mock database for performance testing
  const users = new Map();
  const sessions = new Map();
  const performanceMetrics = {
    requestCount: 0,
    responseTimeSum: 0,
    maxResponseTime: 0,
    minResponseTime: Infinity,
    errors: 0,
    rateLimitHits: 0
  };

  beforeEach(async () => {
    originalEnv = process.env;
    process.env.NODE_ENV = 'test';
    jwtSecret = 'test-jwt-secret-for-performance-testing';

    // Setup test users
    const testUsers = ['admin', 'user1', 'user2', 'user3', 'user4', 'user5'];
    testUsers.forEach((username, index) => {
      const passwordHash = bcrypt.hashSync('password123', 12);
      users.set(username, {
        id: `user-${index}`,
        username,
        passwordHash,
        role: index === 0 ? 'admin' : 'viewer',
        permissions: index === 0 ? ['read', 'write', 'admin', 'benchmark', 'system'] : ['read'],
        loginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date()
      });
    });

    // Create Express app with performance monitoring
    app = express();

    // Performance monitoring middleware
    app.use((req, res, next) => {
      const startTime = performance.now();

      res.on('finish', () => {
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        performanceMetrics.requestCount++;
        performanceMetrics.responseTimeSum += responseTime;
        performanceMetrics.maxResponseTime = Math.max(performanceMetrics.maxResponseTime, responseTime);
        performanceMetrics.minResponseTime = Math.min(performanceMetrics.minResponseTime, responseTime);

        if (res.statusCode >= 400) {
          performanceMetrics.errors++;
        }
      });

      next();
    });

    // Security middleware
    app.use(helmet());
    app.use(cors({ origin: '*' }));

    // Rate limiting with performance tracking
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
          performanceMetrics.rateLimitHits++;
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

    app.use(rateLimiter(15 * 60 * 1000, 200)); // 200 requests per 15 minutes for performance testing

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Authentication middleware
    const authenticateToken = (req, res, next) => {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Access token required' });
      }

      try {
        const decoded = jwt.verify(token, jwtSecret) as any;
        const session = sessions.get(decoded.sessionId);

        if (!session || session.expires < new Date()) {
          return res.status(401).json({ error: 'Session expired' });
        }

        const user = users.get(decoded.username);
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        next();
      } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
      }
    };

    // Health check endpoint (no auth)
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        performance: {
          requestCount: performanceMetrics.requestCount,
          averageResponseTime: performanceMetrics.requestCount > 0
            ? performanceMetrics.responseTimeSum / performanceMetrics.requestCount
            : 0,
          errorRate: performanceMetrics.requestCount > 0
            ? (performanceMetrics.errors / performanceMetrics.requestCount) * 100
            : 0,
          rateLimitHitRate: performanceMetrics.requestCount > 0
            ? (performanceMetrics.rateLimitHits / performanceMetrics.requestCount) * 100
            : 0
        }
      });
    });

    // Authentication endpoint
    app.post('/api/auth/login', rateLimiter(15 * 60 * 1000, 20), async (req, res) => {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const user = users.get(username);

      if (!user || !await bcrypt.compare(password, user.passwordHash)) {
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

      res.json({
        accessToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: user.permissions
        }
      });
    });

    // Protected API endpoints
    app.get('/api/metrics', authenticateToken, (req, res) => {
      // Simulate some processing time
      const processingTime = Math.random() * 10; // 0-10ms
      setTimeout(() => {
        res.json({
          timestamp: new Date().toISOString(),
          system: {
            cpuUsage: Math.random() * 100,
            memoryUsage: Math.random() * 100,
            diskUsage: Math.random() * 100,
            networkIO: {
              inbound: Math.random() * 10,
              outbound: Math.random() * 10
            }
          },
          application: {
            responseTime: { p95: Math.random() * 500 },
            throughput: Math.floor(Math.random() * 2000),
            errorRate: Math.random() * 0.01,
            activeConnections: Math.floor(Math.random() * 100)
          },
          database: {
            connectionPool: {
              active: Math.floor(Math.random() * 20),
              idle: Math.floor(Math.random() * 30),
              total: 50
            },
            queryTime: {
              average: Math.random() * 100,
              p95: Math.random() * 200
            }
          }
        });
      }, processingTime);
    });

    app.get('/api/metrics/history', authenticateToken, (req, res) => {
      const timeframe = req.query.timeframe || '1h';
      const dataPoints = parseInt(req.query.points as string) || 100;

      // Generate historical data
      const history = Array.from({ length: dataPoints }, (_, i) => ({
        timestamp: new Date(Date.now() - (dataPoints - i) * 60000).toISOString(),
        system: {
          cpuUsage: Math.random() * 100,
          memoryUsage: Math.random() * 100
        }
      }));

      res.json({
        timeframe,
        dataPoints: history.length,
        history
      });
    });

    app.post('/api/benchmark/:type', authenticateToken, (req, res) => {
      const { type } = req.params;
      const allowedTypes = ['cpu', 'memory', 'swarm', 'full'];

      if (!allowedTypes.includes(type)) {
        return res.status(400).json({ error: 'Invalid benchmark type' });
      }

      // Simulate benchmark execution
      const executionTime = Math.random() * 2000 + 500; // 500-2500ms

      setTimeout(() => {
        res.json({
          type,
          timestamp: new Date().toISOString(),
          executionTime,
          result: {
            score: Math.random() * 100,
            status: 'completed'
          }
        });
      }, executionTime);
    });

    // Admin endpoints
    app.get('/api/admin/users', authenticateToken, (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const userList = Array.from(users.values()).map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        lastLogin: new Date()
      }));

      res.json({ users: userList });
    });

    // Start server
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });

    // Setup Socket.IO for real-time testing
    io = new SocketIOServer(server, {
      cors: { origin: '*' },
      transports: ['websocket', 'polling']
    });

    // Socket authentication
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, jwtSecret) as any;
        const session = sessions.get(decoded.sessionId);

        if (!session || session.expires < new Date()) {
          return next(new Error('Session expired'));
        }

        const user = users.get(decoded.username);
        if (!user) {
          return next(new Error('User not found'));
        }

        socket.data.user = user;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    io.on('connection', (socket) => {
      // Send metrics periodically
      const metricsInterval = setInterval(() => {
        socket.emit('metrics', {
          timestamp: new Date().toISOString(),
          system: {
            cpuUsage: Math.random() * 100,
            memoryUsage: Math.random() * 100
          }
        });
      }, 1000);

      socket.on('disconnect', () => {
        clearInterval(metricsInterval);
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

    // Reset performance metrics
    performanceMetrics.requestCount = 0;
    performanceMetrics.responseTimeSum = 0;
    performanceMetrics.maxResponseTime = 0;
    performanceMetrics.minResponseTime = Infinity;
    performanceMetrics.errors = 0;
    performanceMetrics.rateLimitHits = 0;

    users.clear();
    sessions.clear();
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Performance Benchmarks', () => {
    test('should handle 100 concurrent requests efficiently', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Make concurrent requests
      const concurrentRequests = 100;
      const startTime = performance.now();

      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .get('/api/metrics')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / concurrentRequests;

      // Analyze results
      const successful = results.filter(r => r.status === 200);
      const failed = results.filter(r => r.status !== 200);

      expect(successful.length).toBe(concurrentRequests);
      expect(failed.length).toBe(0);
      expect(averageTime).toBeLessThan(50); // 50ms average per request
      expect(totalTime).toBeLessThan(2000); // 2 seconds total
      expect(performanceMetrics.maxResponseTime).toBeLessThan(200); // Max 200ms per request
      expect(performanceMetrics.errors).toBe(0);
    });

    test('should maintain performance under sustained load', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Sustained load test - 10 requests per second for 10 seconds
      const requestsPerSecond = 10;
      const duration = 10000; // 10 seconds
      const totalRequests = (requestsPerSecond * duration) / 1000;

      const startTime = performance.now();
      const promises = [];

      for (let i = 0; i < totalRequests; i++) {
        setTimeout(() => {
          promises.push(
            request(app)
              .get('/api/metrics')
              .set('Authorization', `Bearer ${accessToken}`)
          );
        }, (i * 1000) / requestsPerSecond);
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Analyze performance
      const successful = results.filter(r => r.status === 200);
      const averageResponseTime = performanceMetrics.responseTimeSum / performanceMetrics.requestCount;

      expect(successful.length).toBe(totalRequests);
      expect(averageResponseTime).toBeLessThan(100); // 100ms average under sustained load
      expect(performanceMetrics.errors).toBe(0);
      expect(performanceMetrics.rateLimitHits).toBe(0);
    });

    test('should handle large data requests efficiently', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Request large historical data
      const dataPoints = [100, 500, 1000];

      for (const points of dataPoints) {
        const startTime = performance.now();

        const response = await request(app)
          .get(`/api/metrics/history?points=${points}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const endTime = performance.now();
        const responseTime = endTime - startTime;

        expect(response.body).toHaveProperty('history');
        expect(response.body.history).toHaveLength(points);
        expect(responseTime).toBeLessThan(1000); // 1 second max for large data
        expect(response.headers['content-length']).toBeGreaterThan(1000); // Should be substantial
      }
    });
  });

  describe('WebSocket Performance', () => {
    test('should handle 50 concurrent WebSocket connections', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Create concurrent WebSocket connections
      const connectionCount = 50;
      const connections = [];
      const connectionTimes = [];

      for (let i = 0; i < connectionCount; i++) {
        const startTime = performance.now();

        const socketClient = require('socket.io-client')(
          `http://localhost:${server.address().port}`,
          {
            transports: ['websocket'],
            auth: { token: accessToken }
          }
        );

        await new Promise<void>((resolve) => {
          socketClient.on('connect', () => {
            const endTime = performance.now();
            connectionTimes.push(endTime - startTime);
            resolve();
          });

          socketClient.on('connect_error', () => {
            resolve(); // Continue even if some fail
          });
        });

        connections.push(socketClient);
      }

      // Analyze connection performance
      const averageConnectionTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
      const successfulConnections = connections.filter(c => c.connected).length;

      expect(successfulConnections).toBeGreaterThan(connectionCount * 0.9); // 90% success rate
      expect(averageConnectionTime).toBeLessThan(100); // 100ms average connection time

      // Test message broadcasting
      const broadcastStartTime = performance.now();

      // Send a message to all connections
      const messagePromises = connections.filter(c => c.connected).map(socket =>
        new Promise<void>((resolve) => {
          socket.once('metrics', () => resolve());
        })
      );

      // Trigger a broadcast
      io.emit('metrics', { test: 'performance', timestamp: new Date().toISOString() });

      await Promise.all(messagePromises);
      const broadcastEndTime = performance.now();
      const broadcastTime = broadcastEndTime - broadcastStartTime;

      expect(broadcastTime).toBeLessThan(100); // 100ms for broadcast to all connections

      // Cleanup
      connections.forEach(socket => socket.close());
    });

    test('should handle high-frequency real-time updates', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Create WebSocket connection
      const socketClient = require('socket.io-client')(
        `http://localhost:${server.address().port}`,
        {
          transports: ['websocket'],
          auth: { token: accessToken }
        }
      );

      await new Promise<void>((resolve) => {
        socketClient.on('connect', () => resolve());
      });

      // Test high-frequency updates
      const updateCount = 100;
      const updateInterval = 10; // 10ms between updates
      const receivedMessages = [];
      const messageTimes = [];

      socketClient.on('metrics', (data) => {
        receivedMessages.push(data);
        messageTimes.push(performance.now());
      });

      // Request updates rapidly
      for (let i = 0; i < updateCount; i++) {
        setTimeout(() => {
          socketClient.emit('refresh');
        }, i * updateInterval);
      }

      // Wait for all updates
      await new Promise(resolve => setTimeout(resolve, updateCount * updateInterval + 1000));

      // Analyze message delivery
      expect(receivedMessages.length).toBeGreaterThan(updateCount * 0.8); // 80% delivery rate

      if (messageTimes.length > 1) {
        const averageInterval = messageTimes.slice(1).reduce((acc, time, i) => {
          return acc + (time - messageTimes[i]);
        }, 0) / (messageTimes.length - 1);

        expect(averageInterval).toBeLessThan(updateInterval * 2); // Within 2x expected interval
      }

      socketClient.close();
    });
  });

  describe('Security Performance Impact', () => {
    test('should measure security middleware overhead', async () => {
      // Test without authentication
      const unauthenticatedRequests = 100;
      const unauthenticatedStart = performance.now();

      const unauthenticatedPromises = Array.from({ length: unauthenticatedRequests }, () =>
        request(app).get('/health')
      );

      await Promise.all(unauthenticatedPromises);
      const unauthenticatedEnd = performance.now();
      const unauthenticatedTime = unauthenticatedEnd - unauthenticatedStart;

      // Test with authentication
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      const authenticatedRequests = 100;
      const authenticatedStart = performance.now();

      const authenticatedPromises = Array.from({ length: authenticatedRequests }, () =>
        request(app)
          .get('/api/metrics')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      await Promise.all(authenticatedPromises);
      const authenticatedEnd = performance.now();
      const authenticatedTime = authenticatedEnd - authenticatedStart;

      // Calculate overhead
      const unauthenticatedAvg = unauthenticatedTime / unauthenticatedRequests;
      const authenticatedAvg = authenticatedTime / authenticatedRequests;
      const overhead = ((authenticatedAvg - unauthenticatedAvg) / unauthenticatedAvg) * 100;

      // Security overhead should be reasonable
      expect(overhead).toBeLessThan(50); // Less than 50% overhead
      expect(authenticatedAvg).toBeLessThan(100); // Still under 100ms per request
    });

    test('should handle rate limiting performance efficiently', async () => {
      // Test rate limiting behavior under load
      const burstRequests = 250; // Exceeds the rate limit of 200

      const startTime = performance.now();
      const promises = Array.from({ length: burstRequests }, () =>
        request(app).get('/health')
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successful = results.filter(r => r.status === 200);
      const rateLimited = results.filter(r => r.status === 429);

      expect(successful.length).toBe(200); // Should hit rate limit exactly
      expect(rateLimited.length).toBe(50); // Remaining should be rate limited
      expect(performanceMetrics.rateLimitHits).toBe(50);

      // Rate limiting should be fast
      const averageTime = (endTime - startTime) / burstRequests;
      expect(averageTime).toBeLessThan(20); // 20ms average even with rate limiting
    });

    test('should maintain performance during authentication storms', async () => {
      // Simulate many simultaneous login attempts
      const loginAttempts = 50;
      const validCredentials = { username: 'admin', password: 'password123' };
      const invalidCredentials = { username: 'admin', password: 'wrongpassword' };

      const startTime = performance.now();

      // Mix of valid and invalid login attempts
      const promises = Array.from({ length: loginAttempts }, (_, i) =>
        request(app)
          .post('/api/auth/login')
          .send(i % 2 === 0 ? validCredentials : invalidCredentials)
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successfulLogins = results.filter(r => r.status === 200);
      const failedLogins = results.filter(r => r.status === 401);

      expect(successfulLogins.length).toBe(loginAttempts / 2);
      expect(failedLogins.length).toBe(loginAttempts / 2);

      // Performance should remain reasonable even during auth storms
      const averageTime = (endTime - startTime) / loginAttempts;
      expect(averageTime).toBeLessThan(200); // 200ms average for bcrypt operations
    });
  });

  describe('Resource Usage Under Load', () => {
    test('should monitor memory usage during load testing', async () => {
      const initialMemory = process.memoryUsage();

      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Generate significant load
      const loadRequests = 1000;
      const promises = Array.from({ length: loadRequests }, () =>
        request(app)
          .get('/api/metrics')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      await Promise.all(promises);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
    });

    test('should handle concurrent user sessions efficiently', async () => {
      // Create multiple user sessions
      const userCount = 10;
      const sessions = [];

      for (let i = 1; i <= userCount; i++) {
        const username = `user${i}`;
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({ username, password: 'password123' })
          .expect(200);

        sessions.push(loginResponse.body.accessToken);
      }

      // Test concurrent requests from different users
      const requestsPerUser = 20;
      const startTime = performance.now();

      const promises = sessions.flatMap(token =>
        Array.from({ length: requestsPerUser }, () =>
          request(app)
            .get('/api/metrics')
            .set('Authorization', `Bearer ${token}`)
        )
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successful = results.filter(r => r.status === 200);
      const totalRequests = userCount * requestsPerUser;

      expect(successful.length).toBe(totalRequests);

      const averageTime = (endTime - startTime) / totalRequests;
      expect(averageTime).toBeLessThan(100); // 100ms average with multiple users
    });
  });

  describe('Performance Regression Detection', () => {
    test('should establish performance baseline', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Establish baseline metrics
      const baselineRequests = 100;
      const startTime = performance.now();

      const promises = Array.from({ length: baselineRequests }, () =>
        request(app)
          .get('/api/metrics')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      await Promise.all(promises);
      const endTime = performance.now();

      const baselineMetrics = {
        averageResponseTime: performanceMetrics.responseTimeSum / performanceMetrics.requestCount,
        maxResponseTime: performanceMetrics.maxResponseTime,
        minResponseTime: performanceMetrics.minResponseTime,
        requestsPerSecond: baselineRequests / ((endTime - startTime) / 1000),
        errorRate: (performanceMetrics.errors / performanceMetrics.requestCount) * 100
      };

      // Baseline should meet performance expectations
      expect(baselineMetrics.averageResponseTime).toBeLessThan(50);
      expect(baselineMetrics.maxResponseTime).toBeLessThan(200);
      expect(baselineMetrics.requestsPerSecond).toBeGreaterThan(10);
      expect(baselineMetrics.errorRate).toBe(0);

      console.log('Performance Baseline:', baselineMetrics);
    });

    test('should detect performance regressions', async () => {
      // This test would be used in CI to detect regressions
      // For now, we'll just establish the measurement pattern

      const thresholds = {
        maxAverageResponseTime: 100, // ms
        maxErrorRate: 1, // percent
        minRequestsPerSecond: 5 // requests/second
      };

      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // Run performance test
      const testRequests = 50;
      const startTime = performance.now();

      const promises = Array.from({ length: testRequests }, () =>
        request(app)
          .get('/api/metrics')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      await Promise.all(promises);
      const endTime = performance.now();

      const metrics = {
        averageResponseTime: performanceMetrics.responseTimeSum / performanceMetrics.requestCount,
        errorRate: (performanceMetrics.errors / performanceMetrics.requestCount) * 100,
        requestsPerSecond: testRequests / ((endTime - startTime) / 1000)
      };

      // Check against thresholds
      expect(metrics.averageResponseTime).toBeLessThan(thresholds.maxAverageResponseTime);
      expect(metrics.errorRate).toBeLessThan(thresholds.maxErrorRate);
      expect(metrics.requestsPerSecond).toBeGreaterThan(thresholds.minRequestsPerSecond);

      console.log('Performance Metrics:', metrics);
      console.log('Thresholds:', thresholds);
    });
  });
});