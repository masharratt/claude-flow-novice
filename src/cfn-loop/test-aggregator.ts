/**
 * Test Result Aggregator
 *
 * Sprint 2.2: Collect and aggregate test results from parallel sprints
 *
 * Features:
 * - Collect test results from parallel sprints via Redis
 * - Merge coverage reports across sprints
 * - Detect test conflicts (same test modified by multiple sprints)
 * - Generate unified test report with per-sprint breakdown
 * - Real-time aggregation as results arrive
 */

import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';

/**
 * Test result from a single test
 */
export interface TestResult {
  testId: string;
  testName: string;
  testFile: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  error?: string;
  sprintId: string;
  phaseId: string;
  timestamp: number;
}

/**
 * Coverage data for a file
 */
export interface FileCoverage {
  file: string;
  lines: {
    total: number;
    covered: number;
    percentage: number;
  };
  functions: {
    total: number;
    covered: number;
    percentage: number;
  };
  branches: {
    total: number;
    covered: number;
    percentage: number;
  };
  statements: {
    total: number;
    covered: number;
    percentage: number;
  };
  sprintId: string;
}

/**
 * Sprint test report
 */
export interface SprintTestReport {
  sprintId: string;
  phaseId: string;
  testResults: TestResult[];
  coverage: FileCoverage[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    timestamp: number;
  };
  conflicts: TestConflict[];
}

/**
 * Test conflict when multiple sprints modify same test
 */
export interface TestConflict {
  testId: string;
  testName: string;
  testFile: string;
  conflictingSprints: string[];
  conflictType: 'modified' | 'deleted' | 'renamed';
  description: string;
}

/**
 * Unified test report aggregating all sprints
 */
export interface UnifiedTestReport {
  totalSprints: number;
  sprintReports: Map<string, SprintTestReport>;
  aggregatedCoverage: {
    overall: {
      lines: number;
      functions: number;
      branches: number;
      statements: number;
    };
    byFile: Map<string, FileCoverage>;
  };
  allConflicts: TestConflict[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    totalDuration: number;
    averageCoverageLines: number;
    timestamp: number;
  };
}

/**
 * Test Aggregator Configuration
 */
export interface TestAggregatorConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    database?: number;
  };
  aggregation: {
    enabled: boolean;
    realtimeMode: boolean;      // Aggregate as results arrive
    conflictDetection: boolean;  // Detect test conflicts
    coverageMergeStrategy: 'union' | 'intersection' | 'max';
  };
  storage: {
    resultsTTL: number;         // Results TTL in Redis (default: 86400000 = 24h)
    reportChannel: string;      // Pub/sub channel for reports
  };
}

/**
 * Test Result Aggregator
 *
 * Aggregates test results and coverage from parallel sprints
 */
export class TestResultAggregator extends EventEmitter {
  private config: TestAggregatorConfig;
  private client: RedisClientType | null = null;
  private isConnected = false;
  private sprintReports: Map<string, SprintTestReport> = new Map();
  private subscriptionClient: RedisClientType | null = null;

  // Redis keys
  private readonly RESULTS_KEY_PREFIX = 'cfn:test:results';
  private readonly COVERAGE_KEY_PREFIX = 'cfn:test:coverage';
  private readonly UNIFIED_REPORT_KEY = 'cfn:test:unified-report';
  private readonly REPORT_CHANNEL = 'cfn:test:report-updates';

  // Default configuration
  private static readonly DEFAULT_CONFIG: Partial<TestAggregatorConfig> = {
    aggregation: {
      enabled: true,
      realtimeMode: true,
      conflictDetection: true,
      coverageMergeStrategy: 'union'
    },
    storage: {
      resultsTTL: 86400000,     // 24 hours
      reportChannel: 'cfn:test:report-updates'
    }
  };

  constructor(config: Partial<TestAggregatorConfig>) {
    super();

    this.config = {
      redis: config.redis!,
      aggregation: { ...TestResultAggregator.DEFAULT_CONFIG.aggregation!, ...config.aggregation },
      storage: { ...TestResultAggregator.DEFAULT_CONFIG.storage!, ...config.storage }
    };
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      // Main client for read/write
      this.client = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          connectTimeout: 10000
        },
        password: this.config.redis.password,
        database: this.config.redis.database || 0
      });

      await this.client.connect();

      // Subscription client for pub/sub
      if (this.config.aggregation.realtimeMode) {
        this.subscriptionClient = createClient({
          socket: {
            host: this.config.redis.host,
            port: this.config.redis.port
          },
          password: this.config.redis.password,
          database: this.config.redis.database || 0
        });

        await this.subscriptionClient.connect();
        await this.setupSubscriptions();
      }

      this.isConnected = true;

      this.emit('connected', { timestamp: Date.now() });
      console.log('✅ Test Result Aggregator: Connected to Redis');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Redis connection failed: ${errorMessage}`);
    }
  }

  /**
   * Setup pub/sub subscriptions for real-time aggregation
   */
  private async setupSubscriptions(): Promise<void> {
    if (!this.subscriptionClient) return;

    await this.subscriptionClient.subscribe(
      this.config.storage.reportChannel,
      async (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'sprint-results') {
            await this.processSprintResults(data.sprintId);
          }
        } catch (error) {
          console.error('Error processing subscription message:', error);
        }
      }
    );

    console.log(`📡 Subscribed to ${this.config.storage.reportChannel} for real-time updates`);
  }

  /**
   * Store sprint test results in Redis
   */
  async storeSprintResults(
    sprintId: string,
    phaseId: string,
    testResults: TestResult[],
    coverage: FileCoverage[]
  ): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('Not connected to Redis');
    }

    const summary = this.calculateSummary(testResults);

    const report: SprintTestReport = {
      sprintId,
      phaseId,
      testResults,
      coverage,
      summary,
      conflicts: []
    };

    // Store results
    const resultsKey = `${this.RESULTS_KEY_PREFIX}:${sprintId}`;
    await this.client.set(
      resultsKey,
      JSON.stringify(report),
      { PX: this.config.storage.resultsTTL }
    );

    // Store coverage separately for easier merging
    const coverageKey = `${this.COVERAGE_KEY_PREFIX}:${sprintId}`;
    await this.client.set(
      coverageKey,
      JSON.stringify(coverage),
      { PX: this.config.storage.resultsTTL }
    );

    // Notify subscribers
    if (this.config.aggregation.realtimeMode) {
      await this.client.publish(
        this.config.storage.reportChannel,
        JSON.stringify({
          type: 'sprint-results',
          sprintId,
          phaseId,
          timestamp: Date.now()
        })
      );
    }

    this.emit('results:stored', {
      sprintId,
      phaseId,
      testCount: testResults.length,
      timestamp: Date.now()
    });

    console.log(`💾 Stored test results for Sprint ${sprintId} (${testResults.length} tests)`);
  }

  /**
   * Process sprint results (called by subscription or manually)
   */
  private async processSprintResults(sprintId: string): Promise<void> {
    const resultsKey = `${this.RESULTS_KEY_PREFIX}:${sprintId}`;
    const reportData = await this.client?.get(resultsKey);

    if (reportData) {
      const report: SprintTestReport = JSON.parse(reportData);
      this.sprintReports.set(sprintId, report);

      // Detect conflicts if enabled
      if (this.config.aggregation.conflictDetection) {
        const conflicts = this.detectConflicts(report);
        report.conflicts = conflicts;
      }

      this.emit('sprint:processed', {
        sprintId: report.sprintId,
        conflicts: report.conflicts.length,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Detect test conflicts across sprints
   */
  private detectConflicts(newReport: SprintTestReport): TestConflict[] {
    const conflicts: TestConflict[] = [];

    // Check each test in new report against existing sprint reports
    for (const testResult of newReport.testResults) {
      const conflictingSprints: string[] = [];

      for (const [existingSprintId, existingReport] of this.sprintReports) {
        if (existingSprintId === newReport.sprintId) continue;

        // Check if same test exists in another sprint
        const existingTest = existingReport.testResults.find(
          t => t.testId === testResult.testId || t.testFile === testResult.testFile
        );

        if (existingTest) {
          conflictingSprints.push(existingSprintId);
        }
      }

      if (conflictingSprints.length > 0) {
        conflicts.push({
          testId: testResult.testId,
          testName: testResult.testName,
          testFile: testResult.testFile,
          conflictingSprints: [newReport.sprintId, ...conflictingSprints],
          conflictType: 'modified',
          description: `Test ${testResult.testName} modified by multiple sprints: ${conflictingSprints.join(', ')}`
        });
      }
    }

    if (conflicts.length > 0) {
      console.warn(`⚠️ Detected ${conflicts.length} test conflicts in Sprint ${newReport.sprintId}`);
    }

    return conflicts;
  }

  /**
   * Aggregate all sprint reports into unified report
   */
  async aggregateReports(): Promise<UnifiedTestReport> {
    if (!this.client || !this.isConnected) {
      throw new Error('Not connected to Redis');
    }

    // Load all sprint reports from Redis
    const keys = await this.client.keys(`${this.RESULTS_KEY_PREFIX}:*`);

    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        const report: SprintTestReport = JSON.parse(data);
        this.sprintReports.set(report.sprintId, report);

        // Detect conflicts
        if (this.config.aggregation.conflictDetection) {
          const conflicts = this.detectConflicts(report);
          report.conflicts = conflicts;
        }
      }
    }

    // Aggregate coverage
    const aggregatedCoverage = await this.aggregateCoverage();

    // Collect all conflicts
    const allConflicts: TestConflict[] = [];
    for (const report of this.sprintReports.values()) {
      allConflicts.push(...report.conflicts);
    }

    // Calculate unified summary
    const summary = this.calculateUnifiedSummary();

    const unifiedReport: UnifiedTestReport = {
      totalSprints: this.sprintReports.size,
      sprintReports: this.sprintReports,
      aggregatedCoverage,
      allConflicts,
      summary
    };

    // Store unified report
    await this.client.set(
      this.UNIFIED_REPORT_KEY,
      JSON.stringify(unifiedReport),
      { PX: this.config.storage.resultsTTL }
    );

    this.emit('report:aggregated', {
      totalSprints: unifiedReport.totalSprints,
      totalTests: summary.totalTests,
      conflicts: allConflicts.length,
      timestamp: Date.now()
    });

    console.log(`📊 Aggregated report generated: ${unifiedReport.totalSprints} sprints, ${summary.totalTests} tests`);

    return unifiedReport;
  }

  /**
   * Aggregate coverage across all sprints
   */
  private async aggregateCoverage(): Promise<UnifiedTestReport['aggregatedCoverage']> {
    const byFile = new Map<string, FileCoverage>();

    for (const report of this.sprintReports.values()) {
      for (const coverage of report.coverage) {
        const existing = byFile.get(coverage.file);

        if (!existing) {
          byFile.set(coverage.file, coverage);
        } else {
          // Merge coverage based on strategy
          const merged = this.mergeCoverage(existing, coverage);
          byFile.set(coverage.file, merged);
        }
      }
    }

    // Calculate overall coverage
    const overall = this.calculateOverallCoverage(Array.from(byFile.values()));

    return {
      overall,
      byFile
    };
  }

  /**
   * Merge coverage for same file from different sprints
   */
  private mergeCoverage(existing: FileCoverage, newCoverage: FileCoverage): FileCoverage {
    const strategy = this.config.aggregation.coverageMergeStrategy;

    switch (strategy) {
      case 'max':
        return {
          ...existing,
          lines: {
            total: Math.max(existing.lines.total, newCoverage.lines.total),
            covered: Math.max(existing.lines.covered, newCoverage.lines.covered),
            percentage: Math.max(existing.lines.percentage, newCoverage.lines.percentage)
          },
          functions: {
            total: Math.max(existing.functions.total, newCoverage.functions.total),
            covered: Math.max(existing.functions.covered, newCoverage.functions.covered),
            percentage: Math.max(existing.functions.percentage, newCoverage.functions.percentage)
          },
          branches: {
            total: Math.max(existing.branches.total, newCoverage.branches.total),
            covered: Math.max(existing.branches.covered, newCoverage.branches.covered),
            percentage: Math.max(existing.branches.percentage, newCoverage.branches.percentage)
          },
          statements: {
            total: Math.max(existing.statements.total, newCoverage.statements.total),
            covered: Math.max(existing.statements.covered, newCoverage.statements.covered),
            percentage: Math.max(existing.statements.percentage, newCoverage.statements.percentage)
          }
        };

      case 'union':
      default:
        // Sum totals, take max covered
        return {
          ...existing,
          lines: {
            total: existing.lines.total + newCoverage.lines.total,
            covered: Math.max(existing.lines.covered, newCoverage.lines.covered),
            percentage: (Math.max(existing.lines.covered, newCoverage.lines.covered) /
              (existing.lines.total + newCoverage.lines.total)) * 100
          },
          functions: {
            total: existing.functions.total + newCoverage.functions.total,
            covered: Math.max(existing.functions.covered, newCoverage.functions.covered),
            percentage: (Math.max(existing.functions.covered, newCoverage.functions.covered) /
              (existing.functions.total + newCoverage.functions.total)) * 100
          },
          branches: {
            total: existing.branches.total + newCoverage.branches.total,
            covered: Math.max(existing.branches.covered, newCoverage.branches.covered),
            percentage: (Math.max(existing.branches.covered, newCoverage.branches.covered) /
              (existing.branches.total + newCoverage.branches.total)) * 100
          },
          statements: {
            total: existing.statements.total + newCoverage.statements.total,
            covered: Math.max(existing.statements.covered, newCoverage.statements.covered),
            percentage: (Math.max(existing.statements.covered, newCoverage.statements.covered) /
              (existing.statements.total + newCoverage.statements.total)) * 100
          }
        };
    }
  }

  /**
   * Calculate overall coverage across all files
   */
  private calculateOverallCoverage(coverages: FileCoverage[]): UnifiedTestReport['aggregatedCoverage']['overall'] {
    if (coverages.length === 0) {
      return { lines: 0, functions: 0, branches: 0, statements: 0 };
    }

    const totals = coverages.reduce(
      (acc, cov) => ({
        linesTotal: acc.linesTotal + cov.lines.total,
        linesCovered: acc.linesCovered + cov.lines.covered,
        functionsTotal: acc.functionsTotal + cov.functions.total,
        functionsCovered: acc.functionsCovered + cov.functions.covered,
        branchesTotal: acc.branchesTotal + cov.branches.total,
        branchesCovered: acc.branchesCovered + cov.branches.covered,
        statementsTotal: acc.statementsTotal + cov.statements.total,
        statementsCovered: acc.statementsCovered + cov.statements.covered
      }),
      {
        linesTotal: 0, linesCovered: 0,
        functionsTotal: 0, functionsCovered: 0,
        branchesTotal: 0, branchesCovered: 0,
        statementsTotal: 0, statementsCovered: 0
      }
    );

    return {
      lines: totals.linesTotal > 0 ? (totals.linesCovered / totals.linesTotal) * 100 : 0,
      functions: totals.functionsTotal > 0 ? (totals.functionsCovered / totals.functionsTotal) * 100 : 0,
      branches: totals.branchesTotal > 0 ? (totals.branchesCovered / totals.branchesTotal) * 100 : 0,
      statements: totals.statementsTotal > 0 ? (totals.statementsCovered / totals.statementsTotal) * 100 : 0
    };
  }

  /**
   * Calculate summary for a single sprint
   */
  private calculateSummary(testResults: TestResult[]): SprintTestReport['summary'] {
    return {
      totalTests: testResults.length,
      passed: testResults.filter(t => t.status === 'passed').length,
      failed: testResults.filter(t => t.status === 'failed').length,
      skipped: testResults.filter(t => t.status === 'skipped').length,
      duration: testResults.reduce((sum, t) => sum + t.duration, 0),
      timestamp: Date.now()
    };
  }

  /**
   * Calculate unified summary across all sprints
   */
  private calculateUnifiedSummary(): UnifiedTestReport['summary'] {
    const allTests: TestResult[] = [];
    let totalDuration = 0;
    const coverages: number[] = [];

    for (const report of this.sprintReports.values()) {
      allTests.push(...report.testResults);
      totalDuration += report.summary.duration;

      // Collect coverage percentages
      for (const cov of report.coverage) {
        coverages.push(cov.lines.percentage);
      }
    }

    const averageCoverageLines = coverages.length > 0
      ? coverages.reduce((sum, c) => sum + c, 0) / coverages.length
      : 0;

    return {
      totalTests: allTests.length,
      passed: allTests.filter(t => t.status === 'passed').length,
      failed: allTests.filter(t => t.status === 'failed').length,
      skipped: allTests.filter(t => t.status === 'skipped').length,
      totalDuration,
      averageCoverageLines,
      timestamp: Date.now()
    };
  }

  /**
   * Get unified report
   */
  async getUnifiedReport(): Promise<UnifiedTestReport | null> {
    if (!this.client || !this.isConnected) {
      throw new Error('Not connected to Redis');
    }

    const data = await this.client.get(this.UNIFIED_REPORT_KEY);
    if (!data) return null;

    // Parse and reconstruct Map objects
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      sprintReports: new Map(Object.entries(parsed.sprintReports)),
      aggregatedCoverage: {
        ...parsed.aggregatedCoverage,
        byFile: new Map(Object.entries(parsed.aggregatedCoverage.byFile))
      }
    };
  }

  /**
   * Clear all test results and reports
   */
  async clearResults(): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('Not connected to Redis');
    }

    const keys = await this.client.keys(`${this.RESULTS_KEY_PREFIX}:*`);
    const coverageKeys = await this.client.keys(`${this.COVERAGE_KEY_PREFIX}:*`);

    if (keys.length > 0) {
      await this.client.del(keys);
    }

    if (coverageKeys.length > 0) {
      await this.client.del(coverageKeys);
    }

    await this.client.del(this.UNIFIED_REPORT_KEY);

    this.sprintReports.clear();

    console.log('🧹 Cleared all test results and reports');
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.subscriptionClient) {
      try {
        await this.subscriptionClient.quit();
      } catch (error) {
        console.warn('Warning during subscription client disconnect:', error);
      }
      this.subscriptionClient = null;
    }

    if (this.client) {
      try {
        await this.client.quit();
      } catch (error) {
        console.warn('Warning during client disconnect:', error);
      }
      this.client = null;
    }

    this.isConnected = false;

    this.emit('disconnected', { timestamp: Date.now() });
    console.log('✅ Test Result Aggregator: Disconnected');
  }
}

export default TestResultAggregator;
