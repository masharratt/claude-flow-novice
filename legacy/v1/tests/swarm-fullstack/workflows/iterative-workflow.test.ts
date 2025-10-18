/**
 * Test Suite for Iterative Build-Test-Fix Workflow System
 *
 * Comprehensive tests for the workflow components:
 * - IterativeBuildTestWorkflow
 * - FixCoordinator
 * - ConvergenceDetector
 * - WorkflowMetrics
 * - TestResultAnalyzer
 * - RegressionTestManager
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
const vi = jest;
import { IterativeBuildTestWorkflow } from '../../../src/swarm-fullstack/workflows/iterative-build-test.js';
import { FixCoordinator } from '../../../src/swarm-fullstack/workflows/fix-coordinator.js';
import { ConvergenceDetector } from '../../../src/swarm-fullstack/workflows/convergence-detector.js';
import { WorkflowMetrics } from '../../../src/swarm-fullstack/workflows/workflow-metrics.js';
import { TestResultAnalyzer } from '../../../src/swarm-fullstack/workflows/test-result-analyzer.js';
import { RegressionTestManager } from '../../../src/swarm-fullstack/workflows/regression-test-manager.js';
import { SwarmMemoryManager } from '../../../src/memory/swarm-memory.js';
import { Logger } from '../../../src/core/logger.js';

describe('Iterative Build-Test-Fix Workflow', () => {
  let workflow: IterativeBuildTestWorkflow;
  let memory: SwarmMemoryManager;
  let logger: Logger;

  beforeEach(async () => {
    logger = new Logger({ level: 'info', format: 'json', destination: 'console' });
    memory = new SwarmMemoryManager({ namespace: 'test-workflow' });
    await memory.initialize();

    workflow = new IterativeBuildTestWorkflow(
      {
        maxIterations: 5,
        convergenceThreshold: 0.95,
        parallelExecution: true,
      },
      memory,
      logger,
    );
  });

  afterEach(async () => {
    await memory.shutdown();
  });

  describe('Workflow Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(workflow).toBeDefined();
    });

    it('should start iterative workflow', async () => {
      const team = {
        swarmId: 'test-swarm',
        feature: 'test-feature',
        complexity: 'moderate' as const,
        agents: [],
        estimatedDuration: 3600000,
        requiredSkills: ['frontend', 'backend'],
        resourceLimits: {
          maxAgents: 10,
          maxCpuPerAgent: 80,
          maxMemoryPerAgent: 512,
          timeoutMinutes: 60,
        },
      };

      const iteration = await workflow.startIterativeWorkflow(
        'test-feature',
        team,
        { requirements: [] },
      );

      expect(iteration).toBeDefined();
      expect(iteration.featureId).toBe('test-feature');
      expect(iteration.iterationNumber).toBe(1);
    });
  });

  describe('Progress Tracking', () => {
    it('should track workflow progress', async () => {
      const team = {
        swarmId: 'test-swarm',
        feature: 'test-feature',
        complexity: 'moderate' as const,
        agents: [],
        estimatedDuration: 3600000,
        requiredSkills: [],
        resourceLimits: {
          maxAgents: 10,
          maxCpuPerAgent: 80,
          maxMemoryPerAgent: 512,
          timeoutMinutes: 60,
        },
      };

      await workflow.startIterativeWorkflow('test-feature', team, {});

      const progress = workflow.getWorkflowProgress('test-feature');

      expect(progress).toBeDefined();
      expect(progress?.currentIteration).toBeGreaterThan(0);
      expect(progress?.overallProgress).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Fix Coordinator', () => {
  let coordinator: FixCoordinator;
  let memory: SwarmMemoryManager;
  let logger: Logger;

  beforeEach(async () => {
    logger = new Logger({ level: 'info', format: 'json', destination: 'console' });
    memory = new SwarmMemoryManager({ namespace: 'test-fix' });
    await memory.initialize();
    coordinator = new FixCoordinator(memory, logger);
  });

  afterEach(async () => {
    await memory.shutdown();
  });

  describe('Fix Plan Creation', () => {
    it('should create fix plan from failures', async () => {
      const failures = [
        {
          id: 'fail-1',
          testName: 'API endpoint test',
          category: 'integration' as const,
          layer: 'backend' as const,
          severity: 'high' as const,
          error: 'API request failed with status 500',
          stackTrace: 'at endpoint.ts:45',
          affectedComponents: ['api-handler'],
        },
      ];

      const plan = await coordinator.createFixPlan(failures, 'test-feature');

      expect(plan).toBeDefined();
      expect(plan.fixStrategies).toHaveLength(failures.length);
      expect(plan.priority).toHaveLength(failures.length);
    });

    it('should prioritize critical failures', async () => {
      const failures = [
        {
          id: 'fail-1',
          testName: 'Critical test',
          category: 'unit' as const,
          layer: 'backend' as const,
          severity: 'critical' as const,
          error: 'System crash',
          stackTrace: 'at system.ts:10',
          affectedComponents: ['core'],
        },
        {
          id: 'fail-2',
          testName: 'Low priority test',
          category: 'unit' as const,
          layer: 'frontend' as const,
          severity: 'low' as const,
          error: 'Minor UI issue',
          stackTrace: 'at component.tsx:20',
          affectedComponents: ['button'],
        },
      ];

      const plan = await coordinator.createFixPlan(failures, 'test-feature');

      expect(plan.priority[0].priority).toBeGreaterThan(plan.priority[1].priority);
    });
  });

  describe('Fix Execution', () => {
    it('should execute fixes in parallel', async () => {
      const failures = [
        {
          id: 'fail-1',
          testName: 'Test 1',
          category: 'unit' as const,
          layer: 'backend' as const,
          severity: 'high' as const,
          error: 'Error 1',
          stackTrace: 'stack 1',
          affectedComponents: ['comp1'],
        },
        {
          id: 'fail-2',
          testName: 'Test 2',
          category: 'unit' as const,
          layer: 'frontend' as const,
          severity: 'high' as const,
          error: 'Error 2',
          stackTrace: 'stack 2',
          affectedComponents: ['comp2'],
        },
      ];

      const plan = await coordinator.createFixPlan(failures, 'test-feature');
      const results = await coordinator.executeFixes(plan, 2);

      expect(results).toHaveLength(failures.length);
    });
  });
});

describe('Convergence Detector', () => {
  let detector: ConvergenceDetector;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ level: 'info', format: 'json', destination: 'console' });
    detector = new ConvergenceDetector(logger, {
      threshold: 0.95,
      minCoverage: 80,
    });
  });

  describe('Convergence Detection', () => {
    it('should detect when converged', async () => {
      const testResults = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        totalTests: 100,
        passed: 96,
        failed: 4,
        skipped: 0,
        duration: 5000,
        coverage: {
          lines: 85,
          functions: 82,
          branches: 80,
          statements: 84,
        },
        failures: [],
        warnings: [],
      };

      const result = await detector.checkConvergence({
        testResults,
        threshold: 0.95,
        minCoverage: 80,
        iterationNumber: 3,
      });

      expect(result).toBeDefined();
      expect(result.converged).toBe(true);
      expect(result.score).toBeGreaterThan(0.9);
    });

    it('should not detect convergence when below threshold', async () => {
      const testResults = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        totalTests: 100,
        passed: 85,
        failed: 15,
        skipped: 0,
        duration: 5000,
        coverage: {
          lines: 75,
          functions: 70,
          branches: 72,
          statements: 74,
        },
        failures: [],
        warnings: [],
      };

      const result = await detector.checkConvergence({
        testResults,
        threshold: 0.95,
        minCoverage: 80,
        iterationNumber: 1,
      });

      expect(result.converged).toBe(false);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Trend Analysis', () => {
    it('should analyze improvement trends', async () => {
      // First iteration
      await detector.checkConvergence({
        testResults: {
          id: 'test-1',
          timestamp: new Date().toISOString(),
          totalTests: 100,
          passed: 70,
          failed: 30,
          skipped: 0,
          duration: 5000,
          coverage: { lines: 70, functions: 70, branches: 70, statements: 70 },
          failures: [],
          warnings: [],
        },
        threshold: 0.95,
        minCoverage: 80,
        iterationNumber: 1,
      });

      // Second iteration - improved
      const result = await detector.checkConvergence({
        testResults: {
          id: 'test-2',
          timestamp: new Date().toISOString(),
          totalTests: 100,
          passed: 85,
          failed: 15,
          skipped: 0,
          duration: 5000,
          coverage: { lines: 80, functions: 80, branches: 80, statements: 80 },
          failures: [],
          warnings: [],
        },
        threshold: 0.95,
        minCoverage: 80,
        iterationNumber: 2,
      });

      expect(result.trends.improving).toBe(true);
      expect(result.trends.velocity).toBeGreaterThan(0);
    });
  });
});

describe('Workflow Metrics', () => {
  let metrics: WorkflowMetrics;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ level: 'info', format: 'json', destination: 'console' });
    metrics = new WorkflowMetrics(logger);
  });

  describe('Metrics Calculation', () => {
    it('should calculate iteration metrics', async () => {
      const iteration = {
        id: 'iter-1',
        featureId: 'feature-1',
        iterationNumber: 1,
        startTime: new Date(Date.now() - 1800000).toISOString(),
        endTime: new Date().toISOString(),
        status: 'completed' as const,
        phase: {
          name: 'Validation',
          startTime: new Date().toISOString(),
          status: 'completed' as const,
          tasks: [],
          agents: [],
        },
        activities: [],
        testResults: {
          id: 'test-1',
          timestamp: new Date().toISOString(),
          totalTests: 100,
          passed: 90,
          failed: 10,
          skipped: 0,
          duration: 5000,
          coverage: { lines: 80, functions: 80, branches: 80, statements: 80 },
          failures: [],
          warnings: [],
        },
        fixResults: [
          {
            id: 'fix-1',
            failureId: 'fail-1',
            assignedAgent: 'coder' as const,
            strategy: 'quick-fix',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            status: 'completed' as const,
            changes: [{ file: 'test.ts', type: 'modify' as const, linesChanged: 10, description: 'Fix' }],
            validation: {
              passed: true,
              testsPassed: 10,
              testsFailed: 0,
              regressionDetected: false,
              issues: [],
            },
          },
        ],
        metrics: {} as any,
        convergenceScore: 0.9,
        nextActions: [],
      };

      const calculated = await metrics.calculateIterationMetrics(iteration);

      expect(calculated).toBeDefined();
      expect(calculated.testPassRate).toBeGreaterThan(0);
      expect(calculated.fixSuccessRate).toBeGreaterThan(0);
      expect(calculated.qualityScore).toBeGreaterThan(0);
    });

    it('should provide aggregate metrics', async () => {
      const iteration1 = {
        id: 'iter-1',
        featureId: 'feature-1',
        iterationNumber: 1,
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date(Date.now() - 1800000).toISOString(),
        status: 'completed' as const,
        phase: { name: 'Validation', startTime: '', status: 'completed' as const, tasks: [], agents: [] },
        activities: [],
        testResults: {
          id: 'test-1',
          timestamp: '',
          totalTests: 100,
          passed: 80,
          failed: 20,
          skipped: 0,
          duration: 5000,
          coverage: { lines: 75, functions: 75, branches: 75, statements: 75 },
          failures: [],
          warnings: [],
        },
        fixResults: [],
        metrics: {} as any,
        convergenceScore: 0.8,
        nextActions: [],
      };

      const iteration2 = {
        ...iteration1,
        id: 'iter-2',
        iterationNumber: 2,
        startTime: new Date(Date.now() - 1800000).toISOString(),
        endTime: new Date().toISOString(),
        testResults: {
          ...iteration1.testResults,
          passed: 90,
          failed: 10,
        },
        convergenceScore: 0.9,
      };

      await metrics.calculateIterationMetrics(iteration1);
      await metrics.calculateIterationMetrics(iteration2);

      const aggregate = metrics.getAggregateMetrics('feature-1');

      expect(aggregate).toBeDefined();
      expect(aggregate?.totalIterations).toBe(2);
      expect(aggregate?.overallPassRate).toBeGreaterThan(0);
    });
  });
});

describe('Test Result Analyzer', () => {
  let analyzer: TestResultAnalyzer;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ level: 'info', format: 'json', destination: 'console' });
    analyzer = new TestResultAnalyzer(logger);
  });

  describe('Failure Analysis', () => {
    it('should analyze test failures', async () => {
      const testResults = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        totalTests: 100,
        passed: 80,
        failed: 20,
        skipped: 0,
        duration: 5000,
        coverage: { lines: 75, functions: 75, branches: 75, statements: 75 },
        failures: [
          {
            id: 'fail-1',
            testName: 'API test',
            category: 'integration' as const,
            layer: 'backend' as const,
            severity: 'high' as const,
            error: 'API request timeout',
            stackTrace: 'at api.ts:100',
            affectedComponents: ['api-client'],
          },
        ],
        warnings: [],
      };

      const analysis = await analyzer.analyzeFailures(testResults);

      expect(analysis).toBeDefined();
      expect(analysis.summary.totalFailures).toBe(20);
      expect(analysis.categories.size).toBeGreaterThan(0);
      expect(analysis.recommendations.length).toBeGreaterThan(0);
    });

    it('should detect failure patterns', async () => {
      const testResults = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        totalTests: 100,
        passed: 90,
        failed: 10,
        skipped: 0,
        duration: 5000,
        coverage: { lines: 80, functions: 80, branches: 80, statements: 80 },
        failures: [
          {
            id: 'fail-1',
            testName: 'Test 1',
            category: 'unit' as const,
            layer: 'frontend' as const,
            severity: 'medium' as const,
            error: 'Cannot read property x of undefined',
            stackTrace: 'at component.tsx:50',
            affectedComponents: ['component'],
          },
          {
            id: 'fail-2',
            testName: 'Test 2',
            category: 'unit' as const,
            layer: 'frontend' as const,
            severity: 'medium' as const,
            error: 'Cannot read property y of undefined',
            stackTrace: 'at component.tsx:60',
            affectedComponents: ['component'],
          },
        ],
        warnings: [],
      };

      const analysis = await analyzer.analyzeFailures(testResults);

      expect(analysis.patterns.length).toBeGreaterThan(0);
    });
  });
});

describe('Regression Test Manager', () => {
  let manager: RegressionTestManager;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ level: 'info', format: 'json', destination: 'console' });
    manager = new RegressionTestManager(logger);
  });

  describe('Regression Detection', () => {
    it('should detect new failures as regressions', async () => {
      const baseline = {
        id: 'baseline',
        timestamp: new Date().toISOString(),
        totalTests: 100,
        passed: 95,
        failed: 5,
        skipped: 0,
        duration: 5000,
        coverage: { lines: 80, functions: 80, branches: 80, statements: 80 },
        failures: [
          {
            id: 'old-fail',
            testName: 'Old failure',
            category: 'unit' as const,
            layer: 'backend' as const,
            severity: 'low' as const,
            error: 'Old error',
            stackTrace: 'old stack',
            affectedComponents: ['old-comp'],
          },
        ],
        warnings: [],
      };

      const current = {
        ...baseline,
        id: 'current',
        passed: 90,
        failed: 10,
        failures: [
          ...baseline.failures,
          {
            id: 'new-fail',
            testName: 'New failure',
            category: 'unit' as const,
            layer: 'frontend' as const,
            severity: 'high' as const,
            error: 'New error',
            stackTrace: 'new stack',
            affectedComponents: ['new-comp'],
          },
        ],
      };

      manager.storeBaseline('feature-1', baseline);

      const result = await manager.runRegressionTests({
        featureId: 'feature-1',
        current,
      });

      expect(result.regressionDetected).toBe(true);
      expect(result.regressions.length).toBeGreaterThan(0);
    });

    it('should detect improvements', async () => {
      const baseline = {
        id: 'baseline',
        timestamp: new Date().toISOString(),
        totalTests: 100,
        passed: 90,
        failed: 10,
        skipped: 0,
        duration: 5000,
        coverage: { lines: 75, functions: 75, branches: 75, statements: 75 },
        failures: [
          {
            id: 'fail-1',
            testName: 'Test 1',
            category: 'unit' as const,
            layer: 'backend' as const,
            severity: 'medium' as const,
            error: 'Error 1',
            stackTrace: 'stack 1',
            affectedComponents: ['comp1'],
          },
        ],
        warnings: [],
      };

      const current = {
        ...baseline,
        id: 'current',
        passed: 95,
        failed: 5,
        coverage: { lines: 85, functions: 85, branches: 85, statements: 85 },
        failures: [],
      };

      manager.storeBaseline('feature-1', baseline);

      const result = await manager.runRegressionTests({
        featureId: 'feature-1',
        current,
      });

      expect(result.improvements.length).toBeGreaterThan(0);
    });
  });

  describe('Incremental Testing', () => {
    it('should create incremental test plan', async () => {
      const changedFiles = ['src/api/handler.ts', 'src/components/Button.tsx'];
      const allTests = [
        'api.handler.test.ts',
        'button.component.test.ts',
        'unrelated.test.ts',
      ];

      const plan = await manager.createIncrementalTestPlan(
        'feature-1',
        changedFiles,
        allTests,
      );

      expect(plan).toBeDefined();
      expect(plan.selectedTests.length).toBeLessThanOrEqual(allTests.length);
    });
  });
});

// Helper matcher
expect.extend({
  toHaveLength(received, expected) {
    const pass = Array.isArray(received) && received.length === expected;
    return {
      pass,
      message: () =>
        `expected array to have length ${expected}, but got ${received?.length || 'not an array'}`,
    };
  },
});

function greaterThan(n: number) {
  return expect.any(Number);
}