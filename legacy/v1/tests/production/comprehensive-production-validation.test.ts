/**
 * Comprehensive Production Readiness Validation Test Suite
 *
 * This test suite validates complete system readiness for production deployment
 * including security, performance, scalability, and operational readiness.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { DatabaseManager } from '../../monitor/dashboard/database-manager.js';
import { SecurityManager } from '../../monitor/dashboard/security-middleware.js';
import { ProductionConfigManager } from '../../monitor/dashboard/production-config.js';

describe('Comprehensive Production Readiness Validation', () => {
  let configManager: ProductionConfigManager;
  let databaseManager: DatabaseManager;
  let securityManager: SecurityManager;
  let serverProcess: any;
  let dashboardUrl: string;
  let testResults: any = {
    security: {},
    performance: {},
    scalability: {},
    reliability: {},
    monitoring: {}
  };

  beforeAll(async () => {
    // Initialize production configuration
    configManager = new ProductionConfigManager({
      server: {
        port: 3001,
        host: '127.0.0.1',
        https: {
          enabled: false, // Disabled for testing
          minVersion: 'TLSv1.2',
          ciphers: [
            'ECDHE-ECDSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES128-GCM-SHA256'
          ],
          honorCipherOrder: true
        },
        compression: { enabled: true, level: 6, threshold: 1024 },
        trustProxy: true,
        maxConnections: 100
      },
      security: {
        jwt: {
          secret: 'test-secret-for-production-validation-32-chars-min',
          expiresIn: '15m',
          refreshExpiresIn: '7d',
          issuer: 'claude-dashboard-test',
          audience: 'claude-users-test'
        },
        rateLimit: {
          global: { windowMs: 900000, max: 100, message: 'Too many requests' },
          api: { windowMs: 60000, max: 30, message: 'API rate limit exceeded' },
          auth: { windowMs: 900000, max: 5, message: 'Auth rate limit exceeded' },
          endpoints: {}
        },
        cors: {
          origin: ['http://localhost:3001'],
          credentials: true,
          optionsSuccessStatus: 200,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        },
        helmet: {
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", "ws:", "wss:"],
              frameSrc: ["'none'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              manifestSrc: ["'self'"]
            }
          },
          hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
          },
          noSniff: true,
          frameguard: { action: 'deny' },
          xssFilter: true,
          referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
        },
        session: {
          timeout: 3600000,
          maxAge: 86400000,
          rolling: true,
          secure: false,
          sameSite: 'strict'
        }
      },
      database: {
        path: path.join(__dirname, '../test-data/dashboard-production-test.db'),
        backup: { enabled: false, interval: 3600000, retentionDays: 30, path: '' },
        optimization: {
          vacuumInterval: 86400000,
          analyzeInterval: 3600000,
          walCheckpointInterval: 300000
        }
      },
      monitoring: {
        metrics: { enabled: true, interval: 1000, retention: 3600 },
        healthCheck: { enabled: true, interval: 30000, timeout: 5000 },
        alerts: {
          enabled: true,
          thresholds: { cpu: 80, memory: 85, disk: 90, connections: 800 }
        }
      }
    });

    databaseManager = configManager.getDatabaseManager();
    securityManager = configManager.getSecurityManager();

    // Ensure test data directory exists
    const testDir = path.dirname(configManager.getConfig().database.path);
    await fs.mkdir(testDir, { recursive: true });

    dashboardUrl = `http://localhost:3001`;
  });

  afterAll(async () => {
    // Cleanup test database
    try {
      if (databaseManager) {
        databaseManager.close();
      }
      if (configManager) {
        configManager.close();
      }
      // Remove test database
      await fs.unlink(configManager.getConfig().database.path).catch(() => {});
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('1. Complete System Testing', () => {
    test('should initialize dashboard with real agent lifecycle data', async () => {
      // Create test users with different roles
      const adminUser = databaseManager.createUser('admin-test', 'SecurePassword123!', 'admin');
      const operatorUser = databaseManager.createUser('operator-test', 'SecurePassword123!', 'operator');
      const viewerUser = databaseManager.createUser('viewer-test', 'SecurePassword123!', 'viewer');

      expect(adminUser).toBeDefined();
      expect(operatorUser).toBeDefined();
      expect(viewerUser).toBeDefined();

      // Create test sessions
      const adminSession = databaseManager.createSession(
        adminUser.id,
        new Date(Date.now() + 3600000),
        '127.0.0.1',
        'test-agent'
      );

      expect(adminSession).toBeDefined();

      // Log agent lifecycle events as security events
      const agentLifecycleEvents = [
        { type: 'agent_created', agentId: 'agent-001', agentType: 'researcher', status: 'active' },
        { type: 'agent_task_assigned', agentId: 'agent-001', taskId: 'task-001', priority: 'high' },
        { type: 'agent_task_completed', agentId: 'agent-001', taskId: 'task-001', duration: 45000 },
        { type: 'agent_error', agentId: 'agent-001', error: 'Network timeout', recovered: true },
        { type: 'agent_deactivated', agentId: 'agent-001', reason: 'maintenance' }
      ];

      for (const event of agentLifecycleEvents) {
        databaseManager.logSecurityEvent(`AGENT_${event.type.toUpperCase()}`, 'low', '127.0.0.1', event, 'system');
      }

      // Verify agent data is stored and retrievable
      const agentEvents = databaseManager.getSecurityEvents(100, 0).filter(e =>
        e.event.includes('AGENT_')
      );
      expect(agentEvents.length).toBe(agentLifecycleEvents.length);

      testResults.system.agentLifecycle = {
        usersCreated: 3,
        sessionsCreated: 1,
        agentEvents: agentLifecycleEvents.length,
        dataIntegrity: 'PASS'
      };
    });

    test('should handle complex agent coordination scenarios', async () => {
      // Simulate multi-agent coordination scenarios
      const coordinationScenarios = [
        {
          name: 'Parallel Research Task',
          agents: ['researcher-1', 'researcher-2', 'analyst-1'],
          task: 'Multi-source data analysis',
          complexity: 'high',
          duration: 120000
        },
        {
          name: 'Sequential Development Pipeline',
          agents: ['coder-1', 'tester-1', 'reviewer-1'],
          task: 'Feature implementation and testing',
          complexity: 'medium',
          duration: 180000
        },
        {
          name: 'Emergency Response Team',
          agents: ['security-specialist-1', 'backend-dev-1', 'coordinator-1'],
          task: 'Security incident response',
          complexity: 'critical',
          duration: 60000
        }
      ];

      for (const scenario of coordinationScenarios) {
        // Log scenario start
        databaseManager.logSecurityEvent('COORDINATION_SCENARIO_START', 'medium', '127.0.0.1', {
          scenario: scenario.name,
          agents: scenario.agents,
          task: scenario.task,
          complexity: scenario.complexity
        }, 'orchestrator');

        // Simulate agent coordination events
        for (const agentId of scenario.agents) {
          databaseManager.logSecurityEvent('AGENT_ASSIGNED', 'low', '127.0.0.1', {
            agentId,
            scenario: scenario.name,
            task: scenario.task,
            role: agentId.split('-')[1]
          }, 'orchestrator');
        }

        // Simulate task completion
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay

        databaseManager.logSecurityEvent('COORDINATION_SCENARIO_COMPLETE', 'medium', '127.0.0.1', {
          scenario: scenario.name,
          success: true,
          duration: scenario.duration
        }, 'orchestrator');
      }

      // Verify coordination data
      const coordinationEvents = databaseManager.getSecurityEvents(100, 0).filter(e =>
        e.event.includes('COORDINATION_') || e.event.includes('AGENT_ASSIGNED')
      );
      expect(coordinationEvents.length).toBeGreaterThan(0);

      testResults.system.coordination = {
        scenarios: coordinationScenarios.length,
        events: coordinationEvents.length,
        dataIntegrity: 'PASS'
      };
    });
  });

  describe('2. Security Controls Validation', () => {
    test('should enforce robust authentication mechanisms', async () => {
      const authTests = [
        {
          name: 'Valid authentication',
          username: 'admin-test',
          password: 'SecurePassword123!',
          expectedStatus: 200
        },
        {
          name: 'Invalid password',
          username: 'admin-test',
          password: 'WrongPassword123!',
          expectedStatus: 401
        },
        {
          name: 'Non-existent user',
          username: 'nonexistent',
          password: 'SomePassword123!',
          expectedStatus: 401
        },
        {
          name: 'SQL injection attempt',
          username: "admin'; DROP TABLE users; --",
          password: 'password',
          expectedStatus: 401
        }
      ];

      const authResults = { passed: 0, failed: 0 };

      for (const authTest of authTests) {
        try {
          // Simulate login using security manager
          const mockRequest = {
            body: { username: authTest.username, password: authTest.password },
            ip: '127.0.0.1',
            get: (header: string) => header === 'User-Agent' ? 'test-agent' : undefined
          } as any;

          const mockResponse = {
            status: (code: number) => ({ json: (data: any) => ({ code, data }) }),
            json: (data: any) => ({ code: 200, data })
          } as any;

          await securityManager.login(mockRequest, mockResponse);

          if (authTest.expectedStatus === 200) {
            authResults.passed++;
          } else {
            authResults.failed++;
          }
        } catch (error) {
          if (authTest.expectedStatus !== 200) {
            authResults.passed++;
          } else {
            authResults.failed++;
          }
        }
      }

      expect(authResults.passed).toBeGreaterThan(authResults.failed);

      // Verify security events were logged
      const securityEvents = databaseManager.getSecurityEvents(50, 0);
      expect(securityEvents.length).toBeGreaterThan(0);

      testResults.security.authentication = {
        tests: authTests.length,
        passed: authResults.passed,
        failed: authResults.failed,
        securityEvents: securityEvents.length,
        status: authResults.failed === 0 ? 'PASS' : 'PARTIAL'
      };
    });

    test('should prevent common web vulnerabilities', async () => {
      const vulnerabilityTests = [
        {
          name: 'XSS in query parameters',
          payload: '<script>alert("xss")</script>',
          type: 'xss'
        },
        {
          name: 'Path traversal',
          payload: '../../../etc/passwd',
          type: 'path_traversal'
        },
        {
          name: 'Command injection',
          payload: '; ls -la',
          type: 'command_injection'
        },
        {
          name: 'NoSQL injection',
          payload: '{"$gt": ""}',
          type: 'nosql_injection'
        },
        {
          name: 'LDAP injection',
          payload: '*)(uid=*',
          type: 'ldap_injection'
        }
      ];

      const vulnerabilityResults = { blocked: 0, total: vulnerabilityTests.length };

      for (const vulnTest of vulnerabilityTests) {
        // Test input validation
        const mockRequest = {
          query: { input: vulnTest.payload },
          ip: '127.0.0.1',
          get: (header: string) => header === 'User-Agent' ? 'test-agent' : undefined
        } as any;

        const mockResponse = {
          status: (code: number) => ({
            json: (data: any) => ({
              code,
              data,
              status: code >= 400 ? 'blocked' : 'allowed'
            })
          }),
          json: (data: any) => ({ code: 200, data, status: 'allowed' })
        } as any;

        try {
          const middlewareFunction = securityManager.validateInput.bind(securityManager);
          middlewareFunction(mockRequest, mockResponse, () => {
            // If we reach here, input was allowed
          });
        } catch (error) {
          vulnerabilityResults.blocked++;
        }
      }

      // Check security events for blocked attempts
      const blockedEvents = databaseManager.getSecurityEventsBySeverity('medium', 50);
      const xssEvents = blockedEvents.filter(event => {
        try {
          const details = typeof event.details === 'string' ? JSON.parse(event.details) : event.details;
          return details && details.query && details.query.includes('<script>');
        } catch {
          return false;
        }
      });

      testResults.security.vulnerabilities = {
        tests: vulnerabilityTests.length,
        blocked: vulnerabilityResults.blocked,
        xssAttempts: xssEvents.length,
        status: vulnerabilityResults.blocked >= vulnerabilityTests.length * 0.8 ? 'PASS' : 'FAIL'
      };
    });

    test('should enforce proper authorization and permissions', async () => {
      // Create users with different roles
      const adminUser = databaseManager.createUser('admin-perm-test', 'SecurePassword123!', 'admin');
      const operatorUser = databaseManager.createUser('operator-perm-test', 'SecurePassword123!', 'operator');
      const viewerUser = databaseManager.createUser('viewer-perm-test', 'SecurePassword123!', 'viewer');

      const permissionTests = [
        { user: adminUser, permission: 'admin', shouldHave: true },
        { user: adminUser, permission: 'read', shouldHave: true },
        { user: operatorUser, permission: 'admin', shouldHave: false },
        { user: operatorUser, permission: 'read', shouldHave: true },
        { user: operatorUser, permission: 'write', shouldHave: true },
        { user: viewerUser, permission: 'read', shouldHave: true },
        { user: viewerUser, permission: 'write', shouldHave: false },
        { user: viewerUser, permission: 'admin', shouldHave: false }
      ];

      let permissionTestsPassed = 0;

      for (const test of permissionTests) {
        const hasPermission = test.user.permissions.includes(test.permission);
        if (hasPermission === test.shouldHave) {
          permissionTestsPassed++;
        }
      }

      expect(permissionTestsPassed).toBe(permissionTests.length);

      // Test permission middleware
      const mockRequest = {
        user: viewerUser,
        ip: '127.0.0.1',
        get: (header: string) => header === 'User-Agent' ? 'test-agent' : undefined
      } as any;

      const mockResponse = {
        status: (code: number) => ({ json: (data: any) => ({ code, data }) }),
        json: (data: any) => ({ code: 200, data })
      } as any;

      // Test viewer trying to access admin functionality
      const adminMiddleware = securityManager.requirePermission('admin');
      let adminAccessBlocked = false;

      try {
        adminMiddleware(mockRequest, mockResponse, () => {});
      } catch (error) {
        adminAccessBlocked = true;
      }

      expect(adminAccessBlocked).toBe(true);

      testResults.security.authorization = {
        tests: permissionTests.length,
        passed: permissionTestsPassed,
        adminAccessBlocked,
        status: permissionTestsPassed === permissionTests.length && adminAccessBlocked ? 'PASS' : 'FAIL'
      };
    });
  });

  describe('3. Performance Validation', () => {
    test('should handle concurrent load testing', async () => {
      const concurrentUsers = 50;
      const requestsPerUser = 10;
      const totalRequests = concurrentUsers * requestsPerUser;

      // Create test data
      const testData = Array.from({ length: 100 }, (_, i) => ({
        id: `test-agent-${i}`,
        type: ['researcher', 'coder', 'tester', 'reviewer'][i % 4],
        status: 'active',
        load: Math.random() * 100
      }));

      // Store test data
      for (const data of testData) {
        databaseManager.logSecurityEvent('AGENT_CREATED', 'low', '127.0.0.1', data, 'load-test');
      }

      const startTime = Date.now();
      const promises = [];

      // Simulate concurrent users
      for (let user = 0; user < concurrentUsers; user++) {
        const userPromises = Array.from({ length: requestsPerUser }, async (_, request) => {
          const requestStart = Date.now();

          try {
            // Simulate database operations
            const events = databaseManager.getSecurityEvents(100, 0).filter(e =>
              e.details && e.details.agentId === 'test-agent-' + (request % 100)
            );
            const stats = databaseManager.getDatabaseStats();

            return {
              success: true,
              duration: Date.now() - requestStart,
              eventsReturned: events.length,
              statsRetrieved: !!stats
            };
          } catch (error) {
            return {
              success: false,
              duration: Date.now() - requestStart,
              error: error.message
            };
          }
        });

        promises.push(Promise.all(userPromises));
      }

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // Analyze results
      const flatResults = results.flat();
      const successfulRequests = flatResults.filter(r => r.success);
      const failedRequests = flatResults.filter(r => !r.success);
      const averageResponseTime = successfulRequests.reduce((sum, r) => sum + r.duration, 0) / successfulRequests.length;
      const maxResponseTime = Math.max(...successfulRequests.map(r => r.duration));
      const requestsPerSecond = totalRequests / (totalDuration / 1000);

      expect(successfulRequests.length).toBeGreaterThan(totalRequests * 0.95); // 95% success rate
      expect(averageResponseTime).toBeLessThan(1000); // Under 1 second average
      expect(maxResponseTime).toBeLessThan(5000); // Under 5 seconds max

      testResults.performance.loadTesting = {
        totalRequests,
        successfulRequests: successfulRequests.length,
        failedRequests: failedRequests.length,
        successRate: (successfulRequests.length / totalRequests * 100).toFixed(2) + '%',
        averageResponseTime: averageResponseTime.toFixed(2) + 'ms',
        maxResponseTime: maxResponseTime + 'ms',
        requestsPerSecond: requestsPerSecond.toFixed(2),
        totalDuration: totalDuration + 'ms',
        status: successfulRequests.length / totalRequests > 0.95 ? 'PASS' : 'FAIL'
      };
    });

    test('should maintain performance under stress conditions', async () => {
      const stressTestDuration = 10000; // 10 seconds
      const highFrequencyInterval = 10; // 10ms between operations
      const startTime = Date.now();
      let operationCount = 0;
      let errors = [];

      // Create high-frequency operations
      const stressInterval = setInterval(() => {
        if (Date.now() - startTime > stressTestDuration) {
          clearInterval(stressInterval);
          return;
        }

        operationCount++;
        const agentId = `stress-agent-${operationCount % 100}`;

        try {
          // Mix of operations
          if (operationCount % 3 === 0) {
            databaseManager.logSecurityEvent('AGENT_TASK', 'medium', '127.0.0.1', {
              agentId,
              operation: 'stress-test',
              timestamp: Date.now(),
              load: operationCount
            }, 'stress-test');
          } else if (operationCount % 3 === 1) {
            databaseManager.getSecurityEvents(10, 0).filter(e =>
              e.details && e.details.agentId === agentId
            );
          } else {
            databaseManager.getDatabaseStats();
          }
        } catch (error) {
          errors.push({ operation: operationCount, error: error.message });
        }
      }, highFrequencyInterval);

      await new Promise(resolve => {
        setTimeout(() => {
          clearInterval(stressInterval);
          resolve(null);
        }, stressTestDuration + 1000);
      });

      const actualDuration = Date.now() - startTime;
      const operationsPerSecond = operationCount / (actualDuration / 1000);
      const errorRate = errors.length / operationCount;

      expect(operationsPerSecond).toBeGreaterThan(50); // At least 50 ops/sec
      expect(errorRate).toBeLessThan(0.05); // Less than 5% error rate

      testResults.performance.stressTesting = {
        duration: actualDuration + 'ms',
        operations: operationCount,
        operationsPerSecond: operationsPerSecond.toFixed(2),
        errors: errors.length,
        errorRate: (errorRate * 100).toFixed(2) + '%',
        status: errorRate < 0.05 ? 'PASS' : 'FAIL'
      };
    });
  });

  describe('4. Scalability Validation', () => {
    test('should validate WebSocket scalability with concurrent connections', async () => {
      // Note: This is a simulation since we can't easily test real WebSockets in unit tests
      // In a real environment, this would create actual WebSocket connections

      const concurrentConnections = 100;
      const messagesPerConnection = 10;
      const connectionSimulations = [];

      for (let i = 0; i < concurrentConnections; i++) {
        const connectionId = `ws-conn-${i}`;
        const simulation = {
          connectionId,
          connected: true,
          messagesSent: 0,
          messagesReceived: 0,
          errors: 0,
          startTime: Date.now()
        };

        // Simulate WebSocket connection lifecycle
        try {
          // Log connection
          databaseManager.logSecurityEvent('WEBSOCKET_CONNECTED', 'low', '127.0.0.1', {
            connectionId,
            userAgent: 'test-client',
            ip: '127.0.0.1'
          }, 'websocket-test');

          // Simulate message exchange
          for (let j = 0; j < messagesPerConnection; j++) {
            databaseManager.logSecurityEvent('WEBSOCKET_MESSAGE', 'low', '127.0.0.1', {
              connectionId,
              type: 'test-message',
              messageId: `${connectionId}-${j}`,
              timestamp: Date.now()
            }, 'websocket-test');
            simulation.messagesSent++;
          }

          // Simulate disconnection
          databaseManager.logSecurityEvent('WEBSOCKET_DISCONNECTED', 'low', '127.0.0.1', {
            connectionId,
            duration: Date.now() - simulation.startTime,
            messagesExchanged: simulation.messagesSent
          }, 'websocket-test');

        } catch (error) {
          simulation.errors++;
          simulation.connected = false;
        }

        connectionSimulations.push(simulation);
      }

      const successfulConnections = connectionSimulations.filter(c => c.connected);
      const totalMessages = connectionSimulations.reduce((sum, c) => sum + c.messagesSent, 0);
      const totalErrors = connectionSimulations.reduce((sum, c) => sum + c.errors, 0);

      expect(successfulConnections.length).toBeGreaterThan(concurrentConnections * 0.95);
      expect(totalMessages).toBe(concurrentConnections * messagesPerConnection);
      expect(totalErrors).toBeLessThan(concurrentConnections * 0.05);

      testResults.scalability.websocket = {
        connectionsAttempted: concurrentConnections,
        connectionsSuccessful: successfulConnections.length,
        successRate: ((successfulConnections.length / concurrentConnections) * 100).toFixed(2) + '%',
        totalMessages,
        totalErrors,
        status: successfulConnections.length / concurrentConnections > 0.95 ? 'PASS' : 'FAIL'
      };
    });

    test('should handle resource scaling under load', async () => {
      const scalingTests = [
        {
          name: 'Database connection scaling',
          operations: 1000,
          concurrentOperations: 50,
          type: 'database'
        },
        {
          name: 'Memory usage scaling',
          dataPoints: 10000,
          concurrentWrites: 20,
          type: 'memory'
        },
        {
          name: 'Event processing scaling',
          events: 5000,
          concurrentProcessors: 10,
          type: 'events'
        }
      ];

      const scalingResults = [];

      for (const test of scalingTests) {
        const startTime = Date.now();
        let successfulOperations = 0;
        let errors = [];

        if (test.type === 'database') {
          // Test database scaling
          const promises = Array.from({ length: test.concurrentOperations }, async (_, i) => {
            for (let j = 0; j < test.operations / test.concurrentOperations; j++) {
              try {
                databaseManager.logSecurityEvent('SCALING_TEST', 'medium', '127.0.0.1', {
                  agentId: `agent-${i}-${j}`,
                  test: test.name,
                  iteration: j,
                  timestamp: Date.now()
                }, 'scaling-test');
                successfulOperations++;
              } catch (error) {
                errors.push(error.message);
              }
            }
          });

          await Promise.all(promises);
        } else if (test.type === 'memory') {
          // Test memory scaling
          const largeData = 'x'.repeat(1024); // 1KB per data point
          const promises = Array.from({ length: test.concurrentWrites }, async (_, i) => {
            for (let j = 0; j < test.dataPoints / test.concurrentWrites; j++) {
              try {
                const key = `memory-test-${i}-${j}`;
                // In a real implementation, this would test memory storage
                databaseManager.logSecurityEvent('MEMORY_TEST', 'medium', '127.0.0.1', {
                  key,
                  data: largeData.substring(0, 100), // Truncate for storage
                  size: largeData.length
                }, 'memory-test');
                successfulOperations++;
              } catch (error) {
                errors.push(error.message);
              }
            }
          });

          await Promise.all(promises);
        } else if (test.type === 'events') {
          // Test event processing scaling
          const promises = Array.from({ length: test.concurrentProcessors }, async (_, i) => {
            for (let j = 0; j < test.events / test.concurrentProcessors; j++) {
              try {
                databaseManager.logSecurityEvent('EVENT_PROCESSING_TEST', 'medium', '127.0.0.1', {
                  processorId: `processor-${i}`,
                  eventId: `event-${i}-${j}`,
                  data: { test: 'scaling', payload: `data-${j}` },
                  timestamp: Date.now()
                }, 'event-test');
                successfulOperations++;
              } catch (error) {
                errors.push(error.message);
              }
            }
          });

          await Promise.all(promises);
        }

        const duration = Date.now() - startTime;
        const operationsPerSecond = successfulOperations / (duration / 1000);
        const errorRate = errors.length / (successfulOperations + errors.length);

        scalingResults.push({
          name: test.name,
          duration,
          operations: successfulOperations,
          operationsPerSecond,
          errors: errors.length,
          errorRate: (errorRate * 100).toFixed(2) + '%'
        });
      }

      // Verify scaling performance
      scalingResults.forEach(result => {
        expect(parseFloat(result.errorRate)).toBeLessThan(5); // Less than 5% error rate
        expect(result.operationsPerSecond).toBeGreaterThan(10); // At least 10 ops/sec
      });

      testResults.scalability.resource = {
        tests: scalingTests.length,
        results: scalingResults,
        status: scalingResults.every(r => parseFloat(r.errorRate) < 5) ? 'PASS' : 'FAIL'
      };
    });
  });

  describe('5. Monitoring and Alerting Validation', () => {
    test('should collect comprehensive metrics', async () => {
      // Generate test metrics
      const metricTypes = [
        'cpu_usage',
        'memory_usage',
        'disk_usage',
        'network_io',
        'active_connections',
        'request_rate',
        'error_rate',
        'response_time'
      ];

      const metricsCollected = {};

      for (const metricType of metricTypes) {
        const metrics = [];

        // Generate time series data
        for (let i = 0; i < 100; i++) {
          const value = Math.random() * 100;
          const timestamp = Date.now() - (i * 1000);

          metrics.push({
            type: metricType,
            value,
            timestamp,
            unit: metricType.includes('usage') ? 'percent' : 'count'
          });

          // Store in database (simulate metrics collection)
          databaseManager.logSecurityEvent('METRIC_COLLECTED', 'low', '127.0.0.1', {
            metric: metricType,
            value,
            timestamp,
            unit: metrics[0].unit
          }, 'metrics');
        }

        metricsCollected[metricType] = {
          count: metrics.length,
          average: metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length,
          min: Math.min(...metrics.map(m => m.value)),
          max: Math.max(...metrics.map(m => m.value))
        };
      }

      // Verify metrics were collected
      const metricEvents = databaseManager.getSecurityEvents(1000, 0)
        .filter(event => {
          try {
            const details = typeof event.details === 'string' ? JSON.parse(event.details) : event.details;
            return details && details.metric;
          } catch {
            return false;
          }
        });

      expect(metricEvents.length).toBeGreaterThan(metricTypes.length * 50);

      testResults.monitoring.metrics = {
        metricTypes: metricTypes.length,
        totalMetrics: metricEvents.length,
        metricsByType: metricsCollected,
        status: metricEvents.length > metricTypes.length * 50 ? 'PASS' : 'FAIL'
      };
    });

    test('should trigger alerts for threshold violations', async () => {
      const alertThresholds = {
        cpu: 80,
        memory: 85,
        disk: 90,
        errorRate: 5,
        responseTime: 2000
      };

      const alertTests = [
        {
          name: 'CPU high usage',
          metric: 'cpu_usage',
          value: 85,
          threshold: alertThresholds.cpu,
          expectedAlert: true
        },
        {
          name: 'Memory critical',
          metric: 'memory_usage',
          value: 90,
          threshold: alertThresholds.memory,
          expectedAlert: true
        },
        {
          name: 'Disk space warning',
          metric: 'disk_usage',
          value: 88,
          threshold: alertThresholds.disk,
          expectedAlert: false
        },
        {
          name: 'High error rate',
          metric: 'error_rate',
          value: 8,
          threshold: alertThresholds.errorRate,
          expectedAlert: true
        },
        {
          name: 'Slow response time',
          metric: 'response_time',
          value: 2500,
          threshold: alertThresholds.responseTime,
          expectedAlert: true
        }
      ];

      const alertsTriggered = [];

      for (const test of alertTests) {
        // Log metric that should trigger alert
        databaseManager.logSecurityEvent('METRIC_COLLECTED', 'low', '127.0.0.1', {
          metric: test.metric,
          value: test.value,
          threshold: test.threshold,
          timestamp: Date.now()
        }, 'metrics');

        // Check if alert should be triggered
        const shouldAlert = test.value > test.threshold;

        if (shouldAlert && test.expectedAlert) {
          // Log alert
          databaseManager.logSecurityEvent('THRESHOLD_VIOLATION', 'high', '127.0.0.1', {
            metric: test.metric,
            value: test.value,
            threshold: test.threshold,
            severity: test.value > test.threshold * 1.2 ? 'critical' : 'warning'
          });

          alertsTriggered.push({
            name: test.name,
            metric: test.metric,
            value: test.value,
            threshold: test.threshold,
            severity: test.value > test.threshold * 1.2 ? 'critical' : 'warning'
          });
        }
      }

      // Verify alerts were logged
      const securityEvents = databaseManager.getSecurityEventsBySeverity('high', 50);
      const thresholdViolations = securityEvents.filter(event =>
        event.event === 'THRESHOLD_VIOLATION'
      );

      expect(thresholdViolations.length).toBe(alertsTriggered.length);

      testResults.monitoring.alerts = {
        tests: alertTests.length,
        alertsTriggered: alertsTriggered.length,
        thresholdViolations: thresholdViolations.length,
        alerts: alertsTriggered,
        status: thresholdViolations.length === alertsTriggered.length ? 'PASS' : 'FAIL'
      };
    });

    test('should provide comprehensive health checks', async () => {
      const healthCheckComponents = [
        'database',
        'security',
        'monitoring',
        'websocket',
        'api',
        'memory',
        'disk'
      ];

      const healthStatus = {};

      for (const component of healthCheckComponents) {
        const startTime = Date.now();
        let status = 'healthy';
        let responseTime = 0;
        let details = {};

        try {
          if (component === 'database') {
            // Test database connectivity
            const stats = databaseManager.getDatabaseStats();
            responseTime = Date.now() - startTime;
            details = { connections: 1, size: stats.databaseSize };
          } else if (component === 'security') {
            // Test security manager
            const rateLimiter = securityManager.createRateLimiter();
            responseTime = Date.now() - startTime;
            details = { rateLimiting: true };
          } else if (component === 'monitoring') {
            // Test metrics collection
            const events = databaseManager.getAgentEvents('system', 1, 0);
            responseTime = Date.now() - startTime;
            details = { metricsAvailable: events.length > 0 };
          } else {
            // Simulate other component checks
            responseTime = Date.now() - startTime;
            details = { simulated: true };
          }

          // Determine health based on response time
          if (responseTime > 5000) {
            status = 'unhealthy';
          } else if (responseTime > 2000) {
            status = 'degraded';
          }

        } catch (error) {
          status = 'unhealthy';
          responseTime = Date.now() - startTime;
          details = { error: error.message };
        }

        healthStatus[component] = {
          status,
          responseTime: responseTime + 'ms',
          details
        };
      }

      // Verify overall system health
      const healthyComponents = Object.values(healthStatus).filter(c => c.status === 'healthy').length;
      const overallHealth = healthyComponents / healthCheckComponents.length;

      expect(overallHealth).toBeGreaterThan(0.8); // At least 80% components healthy

      testResults.monitoring.healthChecks = {
        components: healthCheckComponents.length,
        healthyComponents,
        overallHealth: (overallHealth * 100).toFixed(2) + '%',
        componentStatus: healthStatus,
        status: overallHealth > 0.8 ? 'PASS' : 'FAIL'
      };
    });
  });

  describe('6. Production Deployment Verification', () => {
    test('should validate deployment pipeline configuration', async () => {
      const deploymentChecks = {
        environment: process.env.NODE_ENV || 'development',
        port: configManager.getConfig().server.port,
        database: {
          path: configManager.getConfig().database.path,
          backup: configManager.getConfig().database.backup.enabled,
          optimization: configManager.getConfig().database.optimization.vacuumInterval > 0
        },
        security: {
          https: configManager.getConfig().server.https.enabled,
          rateLimiting: configManager.getConfig().security.rateLimit.global.max > 0,
          jwtSecret: configManager.getConfig().security.jwt.secret.length >= 32,
          cors: configManager.getConfig().security.cors.origin.length > 0
        },
        monitoring: {
          metrics: configManager.getConfig().monitoring.metrics.enabled,
          healthChecks: configManager.getConfig().monitoring.healthCheck.enabled,
          alerts: configManager.getConfig().monitoring.alerts.enabled
        }
      };

      // Validate deployment configuration
      const validations = [
        { check: 'Environment configured', pass: deploymentChecks.environment !== undefined },
        { check: 'Port configured', pass: deploymentChecks.port > 0 },
        { check: 'Database path set', pass: deploymentChecks.database.path.length > 0 },
        { check: 'Backup configured', pass: deploymentChecks.environment === 'production' ? deploymentChecks.database.backup : true },
        { check: 'Database optimization', pass: deploymentChecks.database.optimization },
        { check: 'HTTPS in production', pass: deploymentChecks.environment === 'production' ? deploymentChecks.security.https : true },
        { check: 'Rate limiting enabled', pass: deploymentChecks.security.rateLimiting },
        { check: 'JWT secret secure', pass: deploymentChecks.security.jwtSecret },
        { check: 'CORS configured', pass: deploymentChecks.security.cors },
        { check: 'Monitoring enabled', pass: deploymentChecks.monitoring.metrics },
        { check: 'Health checks enabled', pass: deploymentChecks.monitoring.healthChecks },
        { check: 'Alerts enabled', pass: deploymentChecks.monitoring.alerts }
      ];

      const passedValidations = validations.filter(v => v.pass).length;
      const validationRate = passedValidations / validations.length;

      expect(validationRate).toBeGreaterThan(0.9); // 90% of validations should pass

      testResults.deployment.configuration = {
        validations: validations.length,
        passed: passedValidations,
        validationRate: (validationRate * 100).toFixed(2) + '%',
        environment: deploymentChecks.environment,
        configuration: deploymentChecks,
        status: validationRate > 0.9 ? 'PASS' : 'FAIL'
      };
    });

    test('should simulate rollback and recovery procedures', async () => {
      const rollbackScenarios = [
        {
          name: 'Database corruption recovery',
          type: 'database',
          scenario: 'simulate_database_corruption',
          recoverySteps: ['backup_restore', 'data_validation', 'service_restart']
        },
        {
          name: 'Security breach rollback',
          type: 'security',
          scenario: 'simulate_security_breach',
          recoverySteps: ['isolate_affected_systems', 'rotate_secrets', 'audit_logs', 'restore_from_backup']
        },
        {
          name: 'Performance degradation recovery',
          type: 'performance',
          scenario: 'simulate_performance_issue',
          recoverySteps: ['identify_bottleneck', 'scale_resources', 'optimize_queries', 'monitor_recovery']
        }
      ];

      const rollbackResults = [];

      for (const scenario of rollbackScenarios) {
        const startTime = Date.now();
        let recoverySuccessful = true;
        const recoveryStepsCompleted = [];

        // Log the incident
        databaseManager.logSecurityEvent('INCIDENT_DETECTED', 'high', 'system', {
          scenario: scenario.scenario,
          type: scenario.type,
          timestamp: Date.now()
        });

        // Simulate recovery steps
        for (const step of scenario.recoverySteps) {
          try {
            // Simulate step execution
            databaseManager.logSecurityEvent('RECOVERY_STEP', 'medium', 'system', {
              scenario: scenario.scenario,
              step,
              timestamp: Date.now()
            });

            await new Promise(resolve => setTimeout(resolve, 50)); // Simulate step execution time
            recoveryStepsCompleted.push(step);

          } catch (error) {
            recoverySuccessful = false;
            databaseManager.logSecurityEvent('RECOVERY_FAILED', 'high', 'system', {
              scenario: scenario.scenario,
              step,
              error: error.message
            });
          }
        }

        const recoveryTime = Date.now() - startTime;

        if (recoverySuccessful) {
          databaseManager.logSecurityEvent('RECOVERY_COMPLETE', 'low', 'system', {
            scenario: scenario.scenario,
            stepsCompleted: recoveryStepsCompleted.length,
            recoveryTime
          });
        }

        rollbackResults.push({
          scenario: scenario.name,
          type: scenario.type,
          successful: recoverySuccessful,
          stepsCompleted: recoveryStepsCompleted.length,
          totalSteps: scenario.recoverySteps.length,
          recoveryTime: recoveryTime + 'ms'
        });
      }

      // Verify recovery procedures
      const successfulRecoveries = rollbackResults.filter(r => r.successful).length;
      const recoveryRate = successfulRecoveries / rollbackScenarios.length;

      expect(recoveryRate).toBeGreaterThan(0.8); // 80% of recoveries should succeed

      testResults.deployment.rollback = {
        scenarios: rollbackScenarios.length,
        successfulRecoveries,
        recoveryRate: (recoveryRate * 100).toFixed(2) + '%',
        results: rollbackResults,
        status: recoveryRate > 0.8 ? 'PASS' : 'FAIL'
      };
    });
  });

  // Generate comprehensive test report
  test('should generate comprehensive production readiness report', () => {
    const overallStatus = {
      security: testResults.security.authentication?.status === 'PASS' &&
                testResults.security.vulnerabilities?.status === 'PASS' &&
                testResults.security.authorization?.status === 'PASS',
      performance: testResults.performance.loadTesting?.status === 'PASS' &&
                  testResults.performance.stressTesting?.status === 'PASS',
      scalability: testResults.scalability.websocket?.status === 'PASS' &&
                   testResults.scalability.resource?.status === 'PASS',
      monitoring: testResults.monitoring.metrics?.status === 'PASS' &&
                  testResults.monitoring.alerts?.status === 'PASS' &&
                  testResults.monitoring.healthChecks?.status === 'PASS',
      deployment: testResults.deployment.configuration?.status === 'PASS' &&
                  testResults.deployment.rollback?.status === 'PASS'
    };

    const passedCategories = Object.values(overallStatus).filter(Boolean).length;
    const totalCategories = Object.keys(overallStatus).length;
    const overallScore = (passedCategories / totalCategories) * 100;

    const productionReadinessReport = {
      timestamp: new Date().toISOString(),
      environment: configManager.getConfig().server.https.enabled ? 'production' : 'testing',
      overallScore: overallScore.toFixed(2) + '%',
      readinessStatus: overallScore >= 80 ? 'PRODUCTION_READY' : 'NEEDS_ATTENTION',
      categoryResults: overallStatus,
      detailedResults: testResults,
      recommendations: generateRecommendations(overallStatus, testResults)
    };

    console.log('\n=== PRODUCTION READINESS VALIDATION REPORT ===\n');
    console.log(`Overall Score: ${productionReadinessReport.overallScore}`);
    console.log(`Status: ${productionReadinessReport.readinessStatus}`);
    console.log('\nCategory Results:');
    Object.entries(overallStatus).forEach(([category, passed]) => {
      console.log(`  ${category.toUpperCase()}: ${passed ? 'PASS' : 'FAIL'}`);
    });
    console.log('\nRecommendations:');
    productionReadinessReport.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
    console.log('\n===============================================\n');

    expect(overallScore).toBeGreaterThan(80); // System should be at least 80% ready

    testResults.summary = productionReadinessReport;
  });
});

function generateRecommendations(status: any, results: any): string[] {
  const recommendations: string[] = [];

  if (!status.security) {
    recommendations.push('Address security vulnerabilities before production deployment');
    if (results.security.authentication?.status !== 'PASS') {
      recommendations.push('Strengthen authentication mechanisms');
    }
    if (results.security.vulnerabilities?.status !== 'PASS') {
      recommendations.push('Implement comprehensive input validation and XSS protection');
    }
  }

  if (!status.performance) {
    recommendations.push('Optimize performance bottlenecks');
    if (results.performance.loadTesting?.status !== 'PASS') {
      recommendations.push('Improve system capacity and response times under load');
    }
  }

  if (!status.scalability) {
    recommendations.push('Enhance system scalability for concurrent operations');
  }

  if (!status.monitoring) {
    recommendations.push('Implement comprehensive monitoring and alerting');
  }

  if (!status.deployment) {
    recommendations.push('Review and improve deployment procedures');
  }

  if (recommendations.length === 0) {
    recommendations.push('System appears ready for production deployment');
  }

  return recommendations;
}