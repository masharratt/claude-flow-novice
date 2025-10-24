/**
 * Test Result Aggregator Tests
 *
 * Sprint 2.2: Comprehensive tests for test result aggregation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestResultAggregator,
  TestResult,
  FileCoverage,
  TestConflict
} from '../../src/cfn-loop/test-aggregator';

describe('TestResultAggregator', () => {
  let aggregator: TestResultAggregator;

  const redisConfig = {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    },
    aggregation: {
      enabled: true,
      realtimeMode: false, // Disable for testing
      conflictDetection: true,
      coverageMergeStrategy: 'union' as const
    },
    storage: {
      resultsTTL: 3600000, // 1 hour
      reportChannel: 'test:report-updates'
    }
  };

  beforeEach(async () => { try {
    aggregator = new TestResultAggregator(redisConfig);
    await aggregator.connect();
    await aggregator.clearResults(); // Clean state
  });

  afterEach(async () => { try {
    await aggregator.clearResults();
    await aggregator.disconnect();
  });

  describe('Connection Management', () => {
    it('should connect to Redis successfully', async () => { try {
      const newAggregator = new TestResultAggregator(redisConfig);
      await expect(newAggregator.connect()).resolves.not.toThrow();
      await newAggregator.disconnect();
    });

    it('should disconnect gracefully', async () => { try {
      await expect(aggregator.disconnect()).resolves.not.toThrow();
      await aggregator.connect(); // Reconnect for cleanup
    });
  });

  describe('Store Sprint Results', () => {
    const sampleTestResults: TestResult[] = [
      {
        testId: 'test-1',
        testName: 'should pass test 1',
        testFile: 'test/sample.test.ts',
        status: 'passed',
        duration: 100,
        sprintId: 'sprint-1',
        phaseId: 'phase-1',
        timestamp: Date.now()
      },
      {
        testId: 'test-2',
        testName: 'should pass test 2',
        testFile: 'test/sample.test.ts',
        status: 'passed',
        duration: 150,
        sprintId: 'sprint-1',
        phaseId: 'phase-1',
        timestamp: Date.now()
      }
    ];

    const sampleCoverage: FileCoverage[] = [
      {
        file: 'src/module.ts',
        lines: { total: 100, covered: 85, percentage: 85 },
        functions: { total: 20, covered: 18, percentage: 90 },
        branches: { total: 40, covered: 32, percentage: 80 },
        statements: { total: 100, covered: 85, percentage: 85 },
        sprintId: 'sprint-1'
      }
    ];

    it('should store sprint results successfully', async () => { try {
      await expect(
        aggregator.storeSprintResults(
          'sprint-1',
          'phase-1',
          sampleTestResults,
          sampleCoverage
        )
      ).resolves.not.toThrow();
    });

    it('should emit results:stored event', async () => { try {
      return new Promise<void>((resolve) => {
        aggregator.once('results:stored', (event) => {
          expect(event).toMatchObject({
            sprintId: 'sprint-1',
            phaseId: 'phase-1',
            testCount: 2,
            timestamp: expect.any(Number)
          });
          resolve();
        });

        aggregator.storeSprintResults(
          'sprint-1',
          'phase-1',
          sampleTestResults,
          sampleCoverage
        );
      });
    });

    it('should store multiple sprint results', async () => { try {
      await aggregator.storeSprintResults(
        'sprint-1',
        'phase-1',
        sampleTestResults,
        sampleCoverage
      );

      await aggregator.storeSprintResults(
        'sprint-2',
        'phase-2',
        [{ ...sampleTestResults[0], testId: 'test-3', sprintId: 'sprint-2' }],
        [{ ...sampleCoverage[0], file: 'src/module2.ts', sprintId: 'sprint-2' }]
      );

      const report = await aggregator.aggregateReports();
      expect(report.totalSprints).toBe(2);
    });
  });

  describe('Conflict Detection', () => {
    it('should detect test conflicts when same test modified by multiple sprints', async () => { try {
      const test1: TestResult = {
        testId: 'test-shared',
        testName: 'shared test',
        testFile: 'test/shared.test.ts',
        status: 'passed',
        duration: 100,
        sprintId: 'sprint-1',
        phaseId: 'phase-1',
        timestamp: Date.now()
      };

      const test2: TestResult = {
        ...test1,
        sprintId: 'sprint-2',
        phaseId: 'phase-2'
      };

      await aggregator.storeSprintResults('sprint-1', 'phase-1', [test1], []);
      await aggregator.storeSprintResults('sprint-2', 'phase-2', [test2], []);

      const report = await aggregator.aggregateReports();

      expect(report.allConflicts.length).toBeGreaterThan(0);
      expect(report.allConflicts[0]).toMatchObject({
        testId: 'test-shared',
        conflictingSprints: expect.arrayContaining(['sprint-1', 'sprint-2'])
      });
    });

    it('should not detect conflicts for different tests', async () => { try {
      const test1: TestResult = {
        testId: 'test-1',
        testName: 'test 1',
        testFile: 'test/test1.test.ts',
        status: 'passed',
        duration: 100,
        sprintId: 'sprint-1',
        phaseId: 'phase-1',
        timestamp: Date.now()
      };

      const test2: TestResult = {
        testId: 'test-2',
        testName: 'test 2',
        testFile: 'test/test2.test.ts',
        status: 'passed',
        duration: 100,
        sprintId: 'sprint-2',
        phaseId: 'phase-2',
        timestamp: Date.now()
      };

      await aggregator.storeSprintResults('sprint-1', 'phase-1', [test1], []);
      await aggregator.storeSprintResults('sprint-2', 'phase-2', [test2], []);

      const report = await aggregator.aggregateReports();

      expect(report.allConflicts).toHaveLength(0);
    });
  });

  describe('Coverage Aggregation', () => {
    it('should merge coverage for same file using union strategy', async () => { try {
      const coverage1: FileCoverage = {
        file: 'src/shared.ts',
        lines: { total: 50, covered: 40, percentage: 80 },
        functions: { total: 10, covered: 8, percentage: 80 },
        branches: { total: 20, covered: 16, percentage: 80 },
        statements: { total: 50, covered: 40, percentage: 80 },
        sprintId: 'sprint-1'
      };

      const coverage2: FileCoverage = {
        file: 'src/shared.ts',
        lines: { total: 50, covered: 45, percentage: 90 },
        functions: { total: 10, covered: 9, percentage: 90 },
        branches: { total: 20, covered: 18, percentage: 90 },
        statements: { total: 50, covered: 45, percentage: 90 },
        sprintId: 'sprint-2'
      };

      await aggregator.storeSprintResults('sprint-1', 'phase-1', [], [coverage1]);
      await aggregator.storeSprintResults('sprint-2', 'phase-2', [], [coverage2]);

      const report = await aggregator.aggregateReports();

      const mergedCoverage = report.aggregatedCoverage.byFile.get('src/shared.ts');
      expect(mergedCoverage).toBeDefined();
      expect(mergedCoverage!.lines.covered).toBe(45); // Max covered
    });

    it('should calculate overall coverage correctly', async () => { try {
      const coverage: FileCoverage[] = [
        {
          file: 'src/file1.ts',
          lines: { total: 100, covered: 80, percentage: 80 },
          functions: { total: 20, covered: 16, percentage: 80 },
          branches: { total: 40, covered: 32, percentage: 80 },
          statements: { total: 100, covered: 80, percentage: 80 },
          sprintId: 'sprint-1'
        },
        {
          file: 'src/file2.ts',
          lines: { total: 100, covered: 90, percentage: 90 },
          functions: { total: 20, covered: 18, percentage: 90 },
          branches: { total: 40, covered: 36, percentage: 90 },
          statements: { total: 100, covered: 90, percentage: 90 },
          sprintId: 'sprint-1'
        }
      ];

      await aggregator.storeSprintResults('sprint-1', 'phase-1', [], coverage);

      const report = await aggregator.aggregateReports();

      expect(report.aggregatedCoverage.overall.lines).toBeCloseTo(85, 0); // (80+90)/2 = 85
    });
  });

  describe('Unified Report Generation', () => {
    it('should generate unified report for single sprint', async () => { try {
      const testResults: TestResult[] = [
        {
          testId: 'test-1',
          testName: 'test 1',
          testFile: 'test/test.ts',
          status: 'passed',
          duration: 100,
          sprintId: 'sprint-1',
          phaseId: 'phase-1',
          timestamp: Date.now()
        }
      ];

      const coverage: FileCoverage[] = [
        {
          file: 'src/module.ts',
          lines: { total: 100, covered: 85, percentage: 85 },
          functions: { total: 20, covered: 18, percentage: 90 },
          branches: { total: 40, covered: 32, percentage: 80 },
          statements: { total: 100, covered: 85, percentage: 85 },
          sprintId: 'sprint-1'
        }
      ];

      await aggregator.storeSprintResults('sprint-1', 'phase-1', testResults, coverage);

      const report = await aggregator.aggregateReports();

      expect(report).toMatchObject({
        totalSprints: 1,
        summary: {
          totalTests: 1,
          passed: 1,
          failed: 0,
          skipped: 0
        }
      });
    });

    it('should generate unified report for multiple sprints', async () => { try {
      const test1: TestResult[] = [
        {
          testId: 'test-1',
          testName: 'test 1',
          testFile: 'test/test1.ts',
          status: 'passed',
          duration: 100,
          sprintId: 'sprint-1',
          phaseId: 'phase-1',
          timestamp: Date.now()
        }
      ];

      const test2: TestResult[] = [
        {
          testId: 'test-2',
          testName: 'test 2',
          testFile: 'test/test2.ts',
          status: 'failed',
          duration: 200,
          error: 'Test failed',
          sprintId: 'sprint-2',
          phaseId: 'phase-2',
          timestamp: Date.now()
        }
      ];

      await aggregator.storeSprintResults('sprint-1', 'phase-1', test1, []);
      await aggregator.storeSprintResults('sprint-2', 'phase-2', test2, []);

      const report = await aggregator.aggregateReports();

      expect(report.totalSprints).toBe(2);
      expect(report.summary.totalTests).toBe(2);
      expect(report.summary.passed).toBe(1);
      expect(report.summary.failed).toBe(1);
    });

    it('should calculate average coverage across sprints', async () => { try {
      const coverage1: FileCoverage[] = [
        {
          file: 'src/file1.ts',
          lines: { total: 100, covered: 80, percentage: 80 },
          functions: { total: 20, covered: 16, percentage: 80 },
          branches: { total: 40, covered: 32, percentage: 80 },
          statements: { total: 100, covered: 80, percentage: 80 },
          sprintId: 'sprint-1'
        }
      ];

      const coverage2: FileCoverage[] = [
        {
          file: 'src/file2.ts',
          lines: { total: 100, covered: 90, percentage: 90 },
          functions: { total: 20, covered: 18, percentage: 90 },
          branches: { total: 40, covered: 36, percentage: 90 },
          statements: { total: 100, covered: 90, percentage: 90 },
          sprintId: 'sprint-2'
        }
      ];

      await aggregator.storeSprintResults('sprint-1', 'phase-1', [], coverage1);
      await aggregator.storeSprintResults('sprint-2', 'phase-2', [], coverage2);

      const report = await aggregator.aggregateReports();

      expect(report.summary.averageCoverageLines).toBeCloseTo(85, 0); // (80+90)/2 = 85
    });
  });

  describe('Report Retrieval', () => {
    it('should retrieve unified report from Redis', async () => { try {
      const testResults: TestResult[] = [
        {
          testId: 'test-1',
          testName: 'test 1',
          testFile: 'test/test.ts',
          status: 'passed',
          duration: 100,
          sprintId: 'sprint-1',
          phaseId: 'phase-1',
          timestamp: Date.now()
        }
      ];

      await aggregator.storeSprintResults('sprint-1', 'phase-1', testResults, []);
      await aggregator.aggregateReports();

      const retrievedReport = await aggregator.getUnifiedReport();

      expect(retrievedReport).not.toBeNull();
      expect(retrievedReport!.totalSprints).toBe(1);
    });

    it('should return null when no report exists', async () => { try {
      const report = await aggregator.getUnifiedReport();
      expect(report).toBeNull();
    });
  });

  describe('Clear Results', () => {
    it('should clear all results and reports', async () => { try {
      const testResults: TestResult[] = [
        {
          testId: 'test-1',
          testName: 'test 1',
          testFile: 'test/test.ts',
          status: 'passed',
          duration: 100,
          sprintId: 'sprint-1',
          phaseId: 'phase-1',
          timestamp: Date.now()
        }
      ];

      await aggregator.storeSprintResults('sprint-1', 'phase-1', testResults, []);
      await aggregator.aggregateReports();

      await aggregator.clearResults();

      const report = await aggregator.getUnifiedReport();
      expect(report).toBeNull();
    });
  });

  describe('Event Emissions', () => {
    it('should emit sprint:processed event', async () => { try {
      const testResults: TestResult[] = [
        {
          testId: 'test-1',
          testName: 'test 1',
          testFile: 'test/test.ts',
          status: 'passed',
          duration: 100,
          sprintId: 'sprint-1',
          phaseId: 'phase-1',
          timestamp: Date.now()
        }
      ];

      await aggregator.storeSprintResults('sprint-1', 'phase-1', testResults, []);

      return new Promise<void>((resolve) => {
        aggregator.once('sprint:processed', (event) => {
          expect(event).toMatchObject({
            sprintId: 'sprint-1',
            conflicts: expect.any(Number),
            timestamp: expect.any(Number)
          });
          resolve();
        });

        aggregator.aggregateReports();
      });
    });

    it('should emit report:aggregated event', async () => { try {
      const testResults: TestResult[] = [
        {
          testId: 'test-1',
          testName: 'test 1',
          testFile: 'test/test.ts',
          status: 'passed',
          duration: 100,
          sprintId: 'sprint-1',
          phaseId: 'phase-1',
          timestamp: Date.now()
        }
      ];

      await aggregator.storeSprintResults('sprint-1', 'phase-1', testResults, []);

      return new Promise<void>((resolve) => {
        aggregator.once('report:aggregated', (event) => {
          expect(event).toMatchObject({
            totalSprints: 1,
            totalTests: 1,
            conflicts: 0,
            timestamp: expect.any(Number)
          });
          resolve();
        });

        aggregator.aggregateReports();
      });
    });
  });
});
