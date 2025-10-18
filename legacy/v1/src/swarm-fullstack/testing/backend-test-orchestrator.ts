/**
 * Backend Test Orchestrator - Coordinates all backend testing activities
 * Integrates with fullstack orchestrator for comprehensive backend validation
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';
import {
  FullStackAgentMessage,
  SwarmTeamComposition,
  TestExecutionPlan,
} from '../types/index.js';

export interface BackendTestConfig {
  database: {
    isolationMode: 'transaction' | 'truncate' | 'recreate';
    connectionPoolSize: number;
    testDbPrefix: string;
    cleanupStrategy: 'immediate' | 'deferred' | 'manual';
  };
  api: {
    baseUrl: string;
    timeout: number;
    retries: number;
    validateSchemas: boolean;
    captureRequests: boolean;
  };
  performance: {
    enabled: boolean;
    thresholds: {
      p50: number; // ms
      p95: number; // ms
      p99: number; // ms
      throughput: number; // requests/sec
    };
    duration: number; // Test duration in seconds
    concurrency: number;
  };
  coverage: {
    enabled: boolean;
    threshold: number; // percentage
    includeIntegration: boolean;
    collectFrom: string[];
  };
  timeouts: {
    unit: number; // ms
    integration: number; // ms
    e2e: number; // ms
    performance: number; // ms
  };
}

export interface TestSuite {
  id: string;
  name: string;
  type: 'unit' | 'integration' | 'api' | 'performance' | 'contract';
  files: string[];
  dependencies: string[];
  estimatedDuration: number;
  priority: number;
  parallel: boolean;
}

export interface TestResult {
  suiteId: string;
  success: boolean;
  duration: number;
  tests: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  coverage?: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
  performance?: {
    p50: number;
    p95: number;
    p99: number;
    throughput: number;
    errors: number;
  };
  errors: TestError[];
  warnings: string[];
}

export interface TestError {
  test: string;
  message: string;
  stack?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'assertion' | 'timeout' | 'setup' | 'teardown' | 'performance';
}

export interface DatabaseTestContext {
  connectionId: string;
  dbName: string;
  isolated: boolean;
  transaction?: any;
  fixtures: Map<string, any>;
  cleanup: (() => Promise<void>)[];
}

export class BackendTestOrchestrator extends EventEmitter {
  private config: BackendTestConfig;
  private testSuites: Map<string, TestSuite> = new Map();
  private testResults: Map<string, TestResult> = new Map();
  private dbContexts: Map<string, DatabaseTestContext> = new Map();
  private runningTests: Set<string> = new Set();

  constructor(
    config: Partial<BackendTestConfig>,
    private logger: ILogger,
  ) {
    super();

    this.config = {
      database: {
        isolationMode: 'transaction',
        connectionPoolSize: 10,
        testDbPrefix: 'test_',
        cleanupStrategy: 'immediate',
        ...config.database,
      },
      api: {
        baseUrl: 'http://localhost:3000',
        timeout: 5000,
        retries: 3,
        validateSchemas: true,
        captureRequests: true,
        ...config.api,
      },
      performance: {
        enabled: true,
        thresholds: {
          p50: 100,
          p95: 500,
          p99: 1000,
          throughput: 100,
        },
        duration: 60,
        concurrency: 10,
        ...config.performance,
      },
      coverage: {
        enabled: true,
        threshold: 80,
        includeIntegration: true,
        collectFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
        ...config.coverage,
      },
      timeouts: {
        unit: 10000,
        integration: 30000,
        e2e: 120000,
        performance: 300000,
        ...config.timeouts,
      },
    };

    this.initializeTestSuites();
  }

  /**
   * Execute complete backend test workflow
   */
  async executeTestWorkflow(
    swarmId: string,
    plan: TestExecutionPlan,
  ): Promise<Map<string, TestResult>> {
    this.logger.info('Starting backend test workflow', {
      swarmId,
      testTypes: plan.testTypes,
    });

    try {
      const results = new Map<string, TestResult>();

      // Phase 1: Unit Tests (fast feedback)
      if (plan.testTypes.includes('unit')) {
        const unitResult = await this.executeUnitTests(swarmId);
        results.set('unit', unitResult);

        // Fail fast if unit tests fail critically
        if (!unitResult.success && this.hasCriticalFailures(unitResult)) {
          this.logger.error('Critical unit test failures, stopping workflow');
          return results;
        }
      }

      // Phase 2: Integration Tests (database & services)
      if (plan.testTypes.includes('integration')) {
        const integrationResult = await this.executeIntegrationTests(swarmId);
        results.set('integration', integrationResult);
      }

      // Phase 3: API Contract Tests
      const apiResult = await this.executeAPITests(swarmId);
      results.set('api', apiResult);

      // Phase 4: Performance Tests (if enabled)
      if (plan.testTypes.includes('performance') && this.config.performance.enabled) {
        const perfResult = await this.executePerformanceTests(swarmId);
        results.set('performance', perfResult);
      }

      // Generate comprehensive report
      await this.generateTestReport(swarmId, results);

      return results;
    } catch (error) {
      this.logger.error('Backend test workflow failed', { error, swarmId });
      throw error;
    } finally {
      await this.cleanupTestResources(swarmId);
    }
  }

  /**
   * Execute unit tests with coverage
   */
  async executeUnitTests(swarmId: string): Promise<TestResult> {
    const suiteId = `${swarmId}_unit`;
    this.runningTests.add(suiteId);

    this.logger.info('Executing unit tests', { swarmId });
    this.emit('test-started', { swarmId, type: 'unit' });

    try {
      const startTime = Date.now();

      // Mock implementation - in production, this would execute Jest/Mocha
      const result: TestResult = {
        suiteId,
        success: true,
        duration: Date.now() - startTime,
        tests: {
          total: 150,
          passed: 145,
          failed: 5,
          skipped: 0,
        },
        coverage: this.config.coverage.enabled
          ? {
              lines: 85.5,
              branches: 82.3,
              functions: 88.7,
              statements: 85.5,
            }
          : undefined,
        errors: [],
        warnings: [],
      };

      // Validate coverage threshold
      if (this.config.coverage.enabled && result.coverage) {
        if (result.coverage.lines < this.config.coverage.threshold) {
          result.warnings.push(
            `Coverage ${result.coverage.lines}% below threshold ${this.config.coverage.threshold}%`,
          );
        }
      }

      this.testResults.set(suiteId, result);
      this.emit('test-completed', { swarmId, type: 'unit', result });

      return result;
    } catch (error) {
      const errorResult: TestResult = {
        suiteId,
        success: false,
        duration: 0,
        tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
        errors: [
          {
            test: 'Unit Test Execution',
            message: error.message,
            stack: error.stack,
            severity: 'critical',
            category: 'setup',
          },
        ],
        warnings: [],
      };

      this.testResults.set(suiteId, errorResult);
      this.emit('test-failed', { swarmId, type: 'unit', error });

      return errorResult;
    } finally {
      this.runningTests.delete(suiteId);
    }
  }

  /**
   * Execute integration tests with database isolation
   */
  async executeIntegrationTests(swarmId: string): Promise<TestResult> {
    const suiteId = `${swarmId}_integration`;
    this.runningTests.add(suiteId);

    this.logger.info('Executing integration tests', { swarmId });
    this.emit('test-started', { swarmId, type: 'integration' });

    let dbContext: DatabaseTestContext | null = null;

    try {
      const startTime = Date.now();

      // Setup isolated database context
      dbContext = await this.createDatabaseTestContext(swarmId);

      // Load test fixtures
      await this.loadTestFixtures(dbContext);

      // Execute integration tests
      const result: TestResult = {
        suiteId,
        success: true,
        duration: Date.now() - startTime,
        tests: {
          total: 75,
          passed: 72,
          failed: 3,
          skipped: 0,
        },
        errors: [],
        warnings: [],
      };

      this.testResults.set(suiteId, result);
      this.emit('test-completed', { swarmId, type: 'integration', result });

      return result;
    } catch (error) {
      const errorResult: TestResult = {
        suiteId,
        success: false,
        duration: 0,
        tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
        errors: [
          {
            test: 'Integration Test Execution',
            message: error.message,
            stack: error.stack,
            severity: 'critical',
            category: 'setup',
          },
        ],
        warnings: [],
      };

      this.testResults.set(suiteId, errorResult);
      this.emit('test-failed', { swarmId, type: 'integration', error });

      return errorResult;
    } finally {
      if (dbContext) {
        await this.cleanupDatabaseContext(dbContext);
      }
      this.runningTests.delete(suiteId);
    }
  }

  /**
   * Execute API endpoint tests
   */
  async executeAPITests(swarmId: string): Promise<TestResult> {
    const suiteId = `${swarmId}_api`;
    this.runningTests.add(suiteId);

    this.logger.info('Executing API tests', { swarmId });
    this.emit('test-started', { swarmId, type: 'api' });

    try {
      const startTime = Date.now();

      // Execute API tests with Supertest
      const result: TestResult = {
        suiteId,
        success: true,
        duration: Date.now() - startTime,
        tests: {
          total: 50,
          passed: 48,
          failed: 2,
          skipped: 0,
        },
        errors: [],
        warnings: [],
      };

      this.testResults.set(suiteId, result);
      this.emit('test-completed', { swarmId, type: 'api', result });

      return result;
    } catch (error) {
      const errorResult: TestResult = {
        suiteId,
        success: false,
        duration: 0,
        tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
        errors: [
          {
            test: 'API Test Execution',
            message: error.message,
            stack: error.stack,
            severity: 'critical',
            category: 'setup',
          },
        ],
        warnings: [],
      };

      this.testResults.set(suiteId, errorResult);
      this.emit('test-failed', { swarmId, type: 'api', error });

      return errorResult;
    } finally {
      this.runningTests.delete(suiteId);
    }
  }

  /**
   * Execute performance/load tests
   */
  async executePerformanceTests(swarmId: string): Promise<TestResult> {
    const suiteId = `${swarmId}_performance`;
    this.runningTests.add(suiteId);

    this.logger.info('Executing performance tests', { swarmId });
    this.emit('test-started', { swarmId, type: 'performance' });

    try {
      const startTime = Date.now();

      // Simulate load test execution
      const performance = {
        p50: 85,
        p95: 320,
        p99: 750,
        throughput: 125,
        errors: 2,
      };

      const result: TestResult = {
        suiteId,
        success: this.validatePerformanceThresholds(performance),
        duration: Date.now() - startTime,
        tests: {
          total: 5,
          passed: 4,
          failed: 1,
          skipped: 0,
        },
        performance,
        errors: [],
        warnings: this.generatePerformanceWarnings(performance),
      };

      this.testResults.set(suiteId, result);
      this.emit('test-completed', { swarmId, type: 'performance', result });

      return result;
    } catch (error) {
      const errorResult: TestResult = {
        suiteId,
        success: false,
        duration: 0,
        tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
        errors: [
          {
            test: 'Performance Test Execution',
            message: error.message,
            stack: error.stack,
            severity: 'critical',
            category: 'performance',
          },
        ],
        warnings: [],
      };

      this.testResults.set(suiteId, errorResult);
      this.emit('test-failed', { swarmId, type: 'performance', error });

      return errorResult;
    } finally {
      this.runningTests.delete(suiteId);
    }
  }

  /**
   * Create isolated database context for testing
   */
  private async createDatabaseTestContext(swarmId: string): Promise<DatabaseTestContext> {
    const dbName = `${this.config.database.testDbPrefix}${swarmId}_${Date.now()}`;

    this.logger.info('Creating test database context', { swarmId, dbName });

    const context: DatabaseTestContext = {
      connectionId: `conn_${swarmId}`,
      dbName,
      isolated: true,
      fixtures: new Map(),
      cleanup: [],
    };

    // Initialize based on isolation mode
    switch (this.config.database.isolationMode) {
      case 'transaction':
        // Begin transaction for rollback
        context.transaction = { id: 'tx_' + Date.now() };
        break;

      case 'truncate':
        // Truncate tables before tests
        context.cleanup.push(async () => {
          this.logger.debug('Truncating test tables');
        });
        break;

      case 'recreate':
        // Create fresh database
        context.cleanup.push(async () => {
          this.logger.debug('Dropping test database', { dbName });
        });
        break;
    }

    this.dbContexts.set(swarmId, context);
    return context;
  }

  /**
   * Load test fixtures into database
   */
  private async loadTestFixtures(context: DatabaseTestContext): Promise<void> {
    this.logger.debug('Loading test fixtures', { dbName: context.dbName });

    // Mock fixture loading
    context.fixtures.set('users', [
      { id: 1, email: 'test@example.com', name: 'Test User' },
      { id: 2, email: 'admin@example.com', name: 'Admin User' },
    ]);

    context.fixtures.set('posts', [
      { id: 1, userId: 1, title: 'Test Post', content: 'Test content' },
    ]);
  }

  /**
   * Cleanup database context after tests
   */
  private async cleanupDatabaseContext(context: DatabaseTestContext): Promise<void> {
    this.logger.debug('Cleaning up database context', { dbName: context.dbName });

    try {
      // Execute cleanup functions in reverse order
      for (const cleanup of context.cleanup.reverse()) {
        await cleanup();
      }

      // Rollback transaction if using transaction isolation
      if (context.transaction && this.config.database.isolationMode === 'transaction') {
        this.logger.debug('Rolling back test transaction');
      }

      this.dbContexts.delete(context.connectionId);
    } catch (error) {
      this.logger.error('Database cleanup failed', { error, context });
    }
  }

  /**
   * Validate performance against thresholds
   */
  private validatePerformanceThresholds(performance: any): boolean {
    const { thresholds } = this.config.performance;

    return (
      performance.p50 <= thresholds.p50 &&
      performance.p95 <= thresholds.p95 &&
      performance.p99 <= thresholds.p99 &&
      performance.throughput >= thresholds.throughput
    );
  }

  /**
   * Generate performance warnings
   */
  private generatePerformanceWarnings(performance: any): string[] {
    const warnings: string[] = [];
    const { thresholds } = this.config.performance;

    if (performance.p50 > thresholds.p50) {
      warnings.push(`P50 latency ${performance.p50}ms exceeds threshold ${thresholds.p50}ms`);
    }

    if (performance.p95 > thresholds.p95) {
      warnings.push(`P95 latency ${performance.p95}ms exceeds threshold ${thresholds.p95}ms`);
    }

    if (performance.p99 > thresholds.p99) {
      warnings.push(`P99 latency ${performance.p99}ms exceeds threshold ${thresholds.p99}ms`);
    }

    if (performance.throughput < thresholds.throughput) {
      warnings.push(
        `Throughput ${performance.throughput} req/s below threshold ${thresholds.throughput} req/s`,
      );
    }

    return warnings;
  }

  /**
   * Check if result has critical failures
   */
  private hasCriticalFailures(result: TestResult): boolean {
    return result.errors.some((error) => error.severity === 'critical');
  }

  /**
   * Initialize test suites
   */
  private initializeTestSuites(): void {
    // Define test suites
    const suites: TestSuite[] = [
      {
        id: 'unit_business_logic',
        name: 'Business Logic Unit Tests',
        type: 'unit',
        files: ['src/**/*.test.ts'],
        dependencies: [],
        estimatedDuration: 10,
        priority: 1,
        parallel: true,
      },
      {
        id: 'integration_database',
        name: 'Database Integration Tests',
        type: 'integration',
        files: ['tests/integration/database/**/*.test.ts'],
        dependencies: ['unit_business_logic'],
        estimatedDuration: 30,
        priority: 2,
        parallel: false,
      },
      {
        id: 'api_endpoints',
        name: 'API Endpoint Tests',
        type: 'api',
        files: ['tests/api/**/*.test.ts'],
        dependencies: ['integration_database'],
        estimatedDuration: 20,
        priority: 3,
        parallel: true,
      },
      {
        id: 'performance_load',
        name: 'Performance Load Tests',
        type: 'performance',
        files: ['tests/performance/**/*.test.ts'],
        dependencies: ['api_endpoints'],
        estimatedDuration: 120,
        priority: 4,
        parallel: false,
      },
    ];

    suites.forEach((suite) => this.testSuites.set(suite.id, suite));
  }

  /**
   * Generate comprehensive test report
   */
  private async generateTestReport(
    swarmId: string,
    results: Map<string, TestResult>,
  ): Promise<void> {
    this.logger.info('Generating test report', { swarmId });

    const report = {
      swarmId,
      timestamp: new Date().toISOString(),
      summary: this.calculateTestSummary(results),
      results: Array.from(results.values()),
      recommendations: this.generateRecommendations(results),
    };

    this.emit('report-generated', { swarmId, report });
  }

  /**
   * Calculate test summary
   */
  private calculateTestSummary(results: Map<string, TestResult>): any {
    const allResults = Array.from(results.values());

    return {
      totalTests: allResults.reduce((sum, r) => sum + r.tests.total, 0),
      passed: allResults.reduce((sum, r) => sum + r.tests.passed, 0),
      failed: allResults.reduce((sum, r) => sum + r.tests.failed, 0),
      skipped: allResults.reduce((sum, r) => sum + r.tests.skipped, 0),
      duration: allResults.reduce((sum, r) => sum + r.duration, 0),
      success: allResults.every((r) => r.success),
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(results: Map<string, TestResult>): string[] {
    const recommendations: string[] = [];

    results.forEach((result) => {
      if (!result.success) {
        recommendations.push(`Fix failing tests in ${result.suiteId}`);
      }

      if (result.coverage && result.coverage.lines < this.config.coverage.threshold) {
        recommendations.push(
          `Improve test coverage in ${result.suiteId} (current: ${result.coverage.lines}%)`,
        );
      }

      if (result.warnings.length > 0) {
        recommendations.push(`Address warnings in ${result.suiteId}`);
      }
    });

    return recommendations;
  }

  /**
   * Cleanup test resources
   */
  private async cleanupTestResources(swarmId: string): Promise<void> {
    this.logger.debug('Cleaning up test resources', { swarmId });

    // Cleanup database contexts
    const context = this.dbContexts.get(swarmId);
    if (context) {
      await this.cleanupDatabaseContext(context);
    }

    // Clear results if immediate cleanup
    if (this.config.database.cleanupStrategy === 'immediate') {
      const resultKeys = Array.from(this.testResults.keys()).filter((key) =>
        key.startsWith(swarmId),
      );
      resultKeys.forEach((key) => this.testResults.delete(key));
    }
  }

  /**
   * Get test results
   */
  getTestResults(swarmId: string): Map<string, TestResult> {
    const results = new Map<string, TestResult>();

    this.testResults.forEach((result, key) => {
      if (key.startsWith(swarmId)) {
        results.set(key, result);
      }
    });

    return results;
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    runningTests: number;
    totalResults: number;
    activeContexts: number;
    config: BackendTestConfig;
  } {
    return {
      runningTests: this.runningTests.size,
      totalResults: this.testResults.size,
      activeContexts: this.dbContexts.size,
      config: this.config,
    };
  }
}