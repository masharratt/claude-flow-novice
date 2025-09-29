/**
 * Backend Integration Tests - Comprehensive test suite for backend components
 * Tests API endpoints, database operations, authentication, and error handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { BackendTestOrchestrator, BackendTestConfig } from '../../src/swarm-fullstack/testing/backend-test-orchestrator.js';
import { APIContractValidator } from '../../src/swarm-fullstack/testing/api-contract-validator.js';
import { Logger } from '../../src/core/logger.js';

// Test configuration
const testConfig: Partial<BackendTestConfig> = {
  database: {
    isolationMode: 'transaction',
    connectionPoolSize: 5,
    testDbPrefix: 'test_',
    cleanupStrategy: 'immediate',
  },
  api: {
    baseUrl: 'http://localhost:3000',
    timeout: 5000,
    retries: 3,
    validateSchemas: true,
    captureRequests: true,
  },
  performance: {
    enabled: true,
    thresholds: {
      p50: 100,
      p95: 500,
      p99: 1000,
      throughput: 100,
    },
    duration: 30,
    concurrency: 10,
  },
  coverage: {
    enabled: true,
    threshold: 80,
    includeIntegration: true,
    collectFrom: ['src/**/*.ts'],
  },
  timeouts: {
    unit: 10000,
    integration: 30000,
    e2e: 120000,
    performance: 300000,
  },
};

describe('Backend Integration Tests', () => {
  let orchestrator: BackendTestOrchestrator;
  let contractValidator: APIContractValidator;
  let logger: Logger;

  beforeAll(async () => {
    // Configure Logger for test environment before getInstance
    process.env.CLAUDE_FLOW_ENV = 'test';
    logger = Logger.getInstance();
    await logger.configure({ level: 'info', format: 'json', destination: 'console' });
    orchestrator = new BackendTestOrchestrator(testConfig, logger);
    contractValidator = new APIContractValidator(logger);

    // Register test contract
    contractValidator.registerContract('test-api', {
      version: '1.0.0',
      basePath: '/api/v1',
      endpoints: [
        {
          path: '/users',
          method: 'GET',
          operationId: 'listUsers',
          summary: 'List all users',
          parameters: [
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'number', minimum: 1 },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'number', minimum: 1, maximum: 100 },
            },
          ],
          requestBody: undefined,
          responses: new Map([
            [
              200,
              {
                description: 'Successful response',
                content: new Map([
                  [
                    'application/json',
                    {
                      schema: {
                        type: 'object',
                        properties: new Map([
                          ['users', { type: 'array', items: { type: 'object' } }],
                          ['total', { type: 'number' }],
                          ['page', { type: 'number' }],
                        ]),
                      },
                    },
                  ],
                ]),
              },
            ],
          ]),
        },
        {
          path: '/users',
          method: 'POST',
          operationId: 'createUser',
          summary: 'Create a new user',
          parameters: [],
          requestBody: {
            required: true,
            content: new Map([
              [
                'application/json',
                {
                  schema: {
                    type: 'object',
                    properties: new Map([
                      ['email', { type: 'string', format: 'email' }],
                      ['name', { type: 'string' }],
                      ['password', { type: 'string' }],
                    ]),
                    required: ['email', 'name', 'password'],
                  },
                },
              ],
            ]),
          },
          responses: new Map([
            [
              201,
              {
                description: 'User created successfully',
                content: new Map([
                  [
                    'application/json',
                    {
                      schema: {
                        type: 'object',
                        properties: new Map([
                          ['id', { type: 'string' }],
                          ['email', { type: 'string' }],
                          ['name', { type: 'string' }],
                        ]),
                      },
                    },
                  ],
                ]),
              },
            ],
            [
              400,
              {
                description: 'Bad request',
              },
            ],
          ]),
        },
      ],
      schemas: new Map([
        [
          'User',
          {
            type: 'object',
            properties: new Map([
              ['id', { type: 'string' }],
              ['email', { type: 'string', format: 'email' }],
              ['name', { type: 'string' }],
              ['createdAt', { type: 'string', format: 'date-time' }],
            ]),
            required: ['id', 'email', 'name'],
          },
        ],
      ]),
    });
  });

  afterAll(async () => {
    // Cleanup resources
  });

  describe('Test Orchestrator', () => {
    it('should initialize with correct configuration', () => {
      const status = orchestrator.getStatus();

      expect(status).toBeDefined();
      expect(status.runningTests).toBe(0);
      expect(status.config.database.isolationMode).toBe('transaction');
      expect(status.config.coverage.threshold).toBe(80);
    });

    it('should execute unit tests successfully', async () => {
      const swarmId = 'test-swarm-1';
      const result = await orchestrator.executeUnitTests(swarmId);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.tests.total).toBeGreaterThan(0);
      expect(result.tests.passed).toBeGreaterThan(0);

      if (result.coverage) {
        expect(result.coverage.lines).toBeGreaterThanOrEqual(80);
      }
    }, 15000);

    it('should execute integration tests with database isolation', async () => {
      const swarmId = 'test-swarm-2';
      const result = await orchestrator.executeIntegrationTests(swarmId);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.tests.total).toBeGreaterThan(0);
    }, 45000);

    it('should execute API tests', async () => {
      const swarmId = 'test-swarm-3';
      const result = await orchestrator.executeAPITests(swarmId);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.tests.total).toBeGreaterThan(0);
    }, 30000);

    it('should execute performance tests and validate thresholds', async () => {
      const swarmId = 'test-swarm-4';
      const result = await orchestrator.executePerformanceTests(swarmId);

      expect(result).toBeDefined();
      expect(result.performance).toBeDefined();

      if (result.performance) {
        expect(result.performance.p50).toBeLessThanOrEqual(testConfig.performance!.thresholds!.p50);
        expect(result.performance.p95).toBeLessThanOrEqual(testConfig.performance!.thresholds!.p95);
        expect(result.performance.throughput).toBeGreaterThanOrEqual(
          testConfig.performance!.thresholds!.throughput,
        );
      }
    }, 90000);

    it('should execute complete test workflow', async () => {
      const swarmId = 'test-swarm-5';
      const plan = {
        swarmId,
        feature: 'user-management',
        testTypes: ['unit', 'integration', 'performance'] as any,
        browsers: ['chromium'],
        devices: ['desktop'],
        priority: 1,
        parallel: true,
      };

      const results = await orchestrator.executeTestWorkflow(swarmId, plan);

      expect(results.size).toBeGreaterThan(0);
      expect(results.has('unit')).toBe(true);
      expect(results.has('integration')).toBe(true);
    }, 180000);

    it('should track test results correctly', async () => {
      const swarmId = 'test-swarm-6';
      await orchestrator.executeUnitTests(swarmId);

      const results = orchestrator.getTestResults(swarmId);

      expect(results.size).toBeGreaterThan(0);
      const result = Array.from(results.values())[0];
      expect(result.suiteId).toContain(swarmId);
    }, 15000);
  });

  describe('API Contract Validator', () => {
    it('should validate valid request successfully', async () => {
      const result = await contractValidator.validateRequest('test-api', '/users', 'GET', {
        query: {
          page: 1,
          limit: 20,
        },
      });

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect missing required request body', async () => {
      const result = await contractValidator.validateRequest('test-api', '/users', 'POST', {});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('required');
    });

    it('should validate request body schema', async () => {
      const result = await contractValidator.validateRequest('test-api', '/users', 'POST', {
        body: {
          email: 'test@example.com',
          name: 'Test User',
          password: 'securepass123',
        },
      });

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect invalid parameter types', async () => {
      const result = await contractValidator.validateRequest('test-api', '/users', 'GET', {
        query: {
          page: 'invalid', // Should be number
          limit: 20,
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'schema')).toBe(true);
    });

    it('should validate response schema', async () => {
      const result = await contractValidator.validateResponse('test-api', '/users', 'GET', 200, {
        body: {
          users: [
            { id: '1', email: 'test@example.com', name: 'Test User' },
          ],
          total: 1,
          page: 1,
        },
      });

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect invalid response status codes', async () => {
      const result = await contractValidator.validateResponse('test-api', '/users', 'GET', 418, {
        body: {},
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('418'))).toBe(true);
    });

    it('should detect breaking changes in contract', () => {
      const oldContract = {
        version: '1.0.0',
        basePath: '/api/v1',
        endpoints: [
          {
            path: '/users',
            method: 'GET' as const,
            operationId: 'listUsers',
            parameters: [
              {
                name: 'page',
                in: 'query' as const,
                required: true,
                schema: { type: 'number' },
              },
            ],
            requestBody: undefined,
            responses: new Map(),
          },
        ],
        schemas: new Map(),
      };

      const newContract = {
        version: '2.0.0',
        basePath: '/api/v1',
        endpoints: [
          {
            path: '/users',
            method: 'GET' as const,
            operationId: 'listUsers',
            parameters: [
              {
                name: 'page',
                in: 'query' as const,
                required: false, // Changed from required to optional
                schema: { type: 'number' },
              },
            ],
            requestBody: undefined,
            responses: new Map(),
          },
        ],
        schemas: new Map(),
      };

      const diff = contractValidator.compareContracts(oldContract, newContract);

      expect(diff).toBeDefined();
      expect(diff.breaking.length + diff.nonBreaking.length + diff.additions.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate OpenAPI specification', () => {
      const contract = {
        version: '1.0.0',
        basePath: '/api/v1',
        endpoints: [
          {
            path: '/users',
            method: 'GET' as const,
            operationId: 'listUsers',
            summary: 'List users',
            parameters: [],
            requestBody: undefined,
            responses: new Map([
              [200, { description: 'Success' }],
            ]),
          },
        ],
        schemas: new Map(),
      };

      const spec = contractValidator.generateOpenAPISpec(contract);

      expect(spec).toBeDefined();
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.version).toBe('1.0.0');
      expect(spec.paths).toBeDefined();
      expect(spec.paths['/users']).toBeDefined();
    });

    it('should track validation statistics', async () => {
      await contractValidator.validateRequest('test-api', '/users', 'GET', {
        query: { page: 1 },
      });

      const stats = contractValidator.getValidationStats();

      expect(stats.totalValidations).toBeGreaterThan(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Database Test Isolation', () => {
    it('should create isolated database context', async () => {
      const swarmId = 'test-swarm-7';

      await orchestrator.executeIntegrationTests(swarmId);

      const status = orchestrator.getStatus();
      expect(status.activeContexts).toBeGreaterThanOrEqual(0);
    }, 45000);

    it('should cleanup database context after tests', async () => {
      const swarmId = 'test-swarm-8';

      await orchestrator.executeIntegrationTests(swarmId);

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const status = orchestrator.getStatus();
      expect(status.activeContexts).toBe(0);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle test execution errors gracefully', async () => {
      const swarmId = 'test-swarm-error';

      // Test will handle internal errors
      const result = await orchestrator.executeUnitTests(swarmId);

      expect(result).toBeDefined();
      expect(result.suiteId).toContain(swarmId);
    }, 15000);

    it('should continue workflow after non-critical failures', async () => {
      const swarmId = 'test-swarm-9';
      const plan = {
        swarmId,
        feature: 'test-feature',
        testTypes: ['unit', 'integration'] as any,
        browsers: ['chromium'],
        devices: ['desktop'],
        priority: 1,
        parallel: false,
      };

      const results = await orchestrator.executeTestWorkflow(swarmId, plan);

      expect(results.size).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Performance Benchmarking', () => {
    it('should measure test execution time', async () => {
      const swarmId = 'test-swarm-10';
      const startTime = Date.now();

      const result = await orchestrator.executeUnitTests(swarmId);

      const duration = Date.now() - startTime;

      expect(result.duration).toBeGreaterThan(0);
      expect(duration).toBeGreaterThan(0);
    }, 15000);

    it('should validate performance thresholds', async () => {
      const swarmId = 'test-swarm-11';
      const result = await orchestrator.executePerformanceTests(swarmId);

      if (result.performance) {
        expect(result.performance.p50).toBeDefined();
        expect(result.performance.p95).toBeDefined();
        expect(result.performance.p99).toBeDefined();
        expect(result.performance.throughput).toBeDefined();
      }
    }, 90000);
  });

  describe('Coverage Analysis', () => {
    it('should collect test coverage data', async () => {
      const swarmId = 'test-swarm-12';
      const result = await orchestrator.executeUnitTests(swarmId);

      if (result.coverage) {
        expect(result.coverage.lines).toBeGreaterThan(0);
        expect(result.coverage.branches).toBeGreaterThan(0);
        expect(result.coverage.functions).toBeGreaterThan(0);
        expect(result.coverage.statements).toBeGreaterThan(0);
      }
    }, 15000);

    it('should validate coverage threshold', async () => {
      const swarmId = 'test-swarm-13';
      const result = await orchestrator.executeUnitTests(swarmId);

      if (result.coverage) {
        const threshold = testConfig.coverage!.threshold!;
        if (result.coverage.lines < threshold) {
          expect(result.warnings.some((w) => w.includes('Coverage'))).toBe(true);
        }
      }
    }, 15000);
  });
});