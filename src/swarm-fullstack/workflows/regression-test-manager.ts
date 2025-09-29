/**
 * Regression Test Manager - Incremental Testing and Regression Detection
 *
 * Manages regression testing by comparing current test results against baselines,
 * detecting regressions, and providing incremental test strategies.
 *
 * Key Features:
 * - Baseline management
 * - Regression detection
 * - Incremental test selection
 * - Impact analysis
 * - Test result comparison
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';
import { TestExecutionResult, TestFailure } from './iterative-build-test.js';

export interface RegressionTestConfig {
  enableBaselineComparison: boolean;
  enableIncrementalTesting: boolean;
  regressionThreshold: number; // percentage, e.g., 5% means 5% more failures is regression
  requireApprovalForRegression: boolean;
}

export interface RegressionTestRequest {
  featureId: string;
  baseline?: TestExecutionResult;
  current: TestExecutionResult;
  changedFiles?: string[];
}

export interface RegressionTestResult {
  regressionDetected: boolean;
  severity: 'none' | 'minor' | 'moderate' | 'severe' | 'critical';
  summary: RegressionSummary;
  regressions: Regression[];
  improvements: Improvement[];
  recommendations: string[];
  requiresAction: boolean;
}

export interface RegressionSummary {
  baselinePassed: number;
  baselineFailed: number;
  currentPassed: number;
  currentFailed: number;
  newFailures: number;
  fixedFailures: number;
  passRateChange: number; // percentage point change
}

export interface Regression {
  id: string;
  testName: string;
  type: 'new-failure' | 'worse-failure' | 'new-warning';
  previousState: string;
  currentState: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impactedComponents: string[];
  suggestedAction: string;
}

export interface Improvement {
  id: string;
  testName: string;
  type: 'fixed-failure' | 'improved-performance' | 'better-coverage';
  previousState: string;
  currentState: string;
  impact: string;
}

export interface IncrementalTestPlan {
  featureId: string;
  totalTests: number;
  selectedTests: string[];
  reason: string;
  estimatedDuration: number;
  coverage: number; // percentage of code coverage
}

export class RegressionTestManager extends EventEmitter {
  private config: RegressionTestConfig;
  private baselines = new Map<string, TestExecutionResult>();
  private regressionHistory = new Map<string, RegressionTestResult[]>();

  constructor(private logger: ILogger, config?: Partial<RegressionTestConfig>) {
    super();

    this.config = {
      enableBaselineComparison: true,
      enableIncrementalTesting: true,
      regressionThreshold: 5, // 5% threshold
      requireApprovalForRegression: true,
      ...config,
    };
  }

  /**
   * Run regression tests and detect regressions
   */
  async runRegressionTests(request: RegressionTestRequest): Promise<RegressionTestResult> {
    this.logger.info('Running regression tests', {
      featureId: request.featureId,
      hasBaseline: !!request.baseline,
    });

    try {
      // Use provided baseline or stored baseline
      const baseline = request.baseline || this.baselines.get(request.featureId);

      if (!baseline) {
        this.logger.warn('No baseline found for comparison', { featureId: request.featureId });
        return this.createNoRegressionResult(request.current);
      }

      // Generate summary
      const summary = this.generateRegressionSummary(baseline, request.current);

      // Detect regressions
      const regressions = this.detectRegressions(baseline, request.current);

      // Identify improvements
      const improvements = this.identifyImprovements(baseline, request.current);

      // Determine severity
      const severity = this.determineSeverity(summary, regressions);

      // Generate recommendations
      const recommendations = this.generateRecommendations(summary, regressions, improvements);

      // Determine if action required
      const requiresAction =
        severity === 'severe' ||
        severity === 'critical' ||
        (this.config.requireApprovalForRegression && regressions.length > 0);

      const result: RegressionTestResult = {
        regressionDetected: regressions.length > 0,
        severity,
        summary,
        regressions,
        improvements,
        recommendations,
        requiresAction,
      };

      // Store in history
      const history = this.regressionHistory.get(request.featureId) || [];
      history.push(result);
      this.regressionHistory.set(request.featureId, history);

      // Emit events
      if (result.regressionDetected) {
        this.emit('regression:detected', {
          featureId: request.featureId,
          severity: result.severity,
          regressions: result.regressions.length,
        });
      }

      if (improvements.length > 0) {
        this.emit('regression:improvements', {
          featureId: request.featureId,
          improvements: improvements.length,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to run regression tests', { error, featureId: request.featureId });
      throw error;
    }
  }

  /**
   * Create incremental test plan based on changed files
   */
  async createIncrementalTestPlan(
    featureId: string,
    changedFiles: string[],
    allTests: string[],
  ): Promise<IncrementalTestPlan> {
    if (!this.config.enableIncrementalTesting) {
      return {
        featureId,
        totalTests: allTests.length,
        selectedTests: allTests,
        reason: 'Incremental testing disabled - running all tests',
        estimatedDuration: allTests.length * 1000, // 1 second per test estimate
        coverage: 100,
      };
    }

    this.logger.info('Creating incremental test plan', {
      featureId,
      changedFiles: changedFiles.length,
      totalTests: allTests.length,
    });

    // Select tests affected by changed files
    const selectedTests = this.selectAffectedTests(changedFiles, allTests);

    // Add critical tests that should always run
    const criticalTests = this.selectCriticalTests(allTests);
    for (const test of criticalTests) {
      if (!selectedTests.includes(test)) {
        selectedTests.push(test);
      }
    }

    // Estimate coverage
    const coverage = (selectedTests.length / allTests.length) * 100;

    return {
      featureId,
      totalTests: allTests.length,
      selectedTests,
      reason: `Selected ${selectedTests.length} tests based on ${changedFiles.length} changed file(s)`,
      estimatedDuration: selectedTests.length * 1000,
      coverage,
    };
  }

  /**
   * Store baseline for future comparisons
   */
  storeBaseline(featureId: string, testResults: TestExecutionResult): void {
    this.baselines.set(featureId, testResults);
    this.logger.info('Stored regression test baseline', {
      featureId,
      tests: testResults.totalTests,
      passed: testResults.passed,
    });
  }

  /**
   * Get regression history
   */
  getRegressionHistory(featureId: string): RegressionTestResult[] {
    return this.regressionHistory.get(featureId) || [];
  }

  /**
   * Generate regression summary
   */
  private generateRegressionSummary(
    baseline: TestExecutionResult,
    current: TestExecutionResult,
  ): RegressionSummary {
    const baselinePassRate = baseline.passed / baseline.totalTests;
    const currentPassRate = current.passed / current.totalTests;
    const passRateChange = (currentPassRate - baselinePassRate) * 100;

    // Identify new and fixed failures
    const baselineFailureNames = new Set(baseline.failures.map((f) => f.testName));
    const currentFailureNames = new Set(current.failures.map((f) => f.testName));

    const newFailures = Array.from(currentFailureNames).filter(
      (name) => !baselineFailureNames.has(name),
    ).length;

    const fixedFailures = Array.from(baselineFailureNames).filter(
      (name) => !currentFailureNames.has(name),
    ).length;

    return {
      baselinePassed: baseline.passed,
      baselineFailed: baseline.failed,
      currentPassed: current.passed,
      currentFailed: current.failed,
      newFailures,
      fixedFailures,
      passRateChange,
    };
  }

  /**
   * Detect regressions by comparing baseline and current results
   */
  private detectRegressions(
    baseline: TestExecutionResult,
    current: TestExecutionResult,
  ): Regression[] {
    const regressions: Regression[] = [];

    // Create maps for easier lookup
    const baselineFailuresMap = new Map(baseline.failures.map((f) => [f.testName, f]));
    const currentFailuresMap = new Map(current.failures.map((f) => [f.testName, f]));

    // Detect new failures (tests that were passing in baseline but failing now)
    for (const [testName, currentFailure] of currentFailuresMap) {
      const baselineFailure = baselineFailuresMap.get(testName);

      if (!baselineFailure) {
        // New failure - test was passing before
        regressions.push({
          id: `regression_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          testName,
          type: 'new-failure',
          previousState: 'passing',
          currentState: `failing (${currentFailure.severity})`,
          severity: currentFailure.severity,
          impactedComponents: currentFailure.affectedComponents,
          suggestedAction: `Investigate new failure in ${currentFailure.category} test`,
        });
      } else if (
        this.getSeverityLevel(currentFailure.severity) >
        this.getSeverityLevel(baselineFailure.severity)
      ) {
        // Worse failure - severity increased
        regressions.push({
          id: `regression_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          testName,
          type: 'worse-failure',
          previousState: `failing (${baselineFailure.severity})`,
          currentState: `failing (${currentFailure.severity})`,
          severity: currentFailure.severity,
          impactedComponents: currentFailure.affectedComponents,
          suggestedAction: 'Investigate severity increase',
        });
      }
    }

    // Check for new warnings
    const baselineWarningNames = new Set(baseline.warnings.map((w) => w.location));
    const newWarnings = current.warnings.filter(
      (w) => !baselineWarningNames.has(w.location) && w.severity === 'high',
    );

    for (const warning of newWarnings) {
      regressions.push({
        id: `regression_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        testName: warning.location,
        type: 'new-warning',
        previousState: 'no warning',
        currentState: `${warning.type} warning`,
        severity: 'medium',
        impactedComponents: [warning.location],
        suggestedAction: `Address new ${warning.type} warning`,
      });
    }

    return regressions;
  }

  /**
   * Identify improvements
   */
  private identifyImprovements(
    baseline: TestExecutionResult,
    current: TestExecutionResult,
  ): Improvement[] {
    const improvements: Improvement[] = [];

    const baselineFailureNames = new Set(baseline.failures.map((f) => f.testName));
    const currentFailureNames = new Set(current.failures.map((f) => f.testName));

    // Fixed failures (tests that were failing but now passing)
    for (const baselineFailure of baseline.failures) {
      if (!currentFailureNames.has(baselineFailure.testName)) {
        improvements.push({
          id: `improvement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          testName: baselineFailure.testName,
          type: 'fixed-failure',
          previousState: `failing (${baselineFailure.severity})`,
          currentState: 'passing',
          impact: `Fixed ${baselineFailure.category} test`,
        });
      }
    }

    // Coverage improvements
    const baselineCovg = this.averageCoverage(baseline.coverage);
    const currentCovg = this.averageCoverage(current.coverage);

    if (currentCovg > baselineCovg + 5) {
      // 5% improvement threshold
      improvements.push({
        id: `improvement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        testName: 'coverage',
        type: 'better-coverage',
        previousState: `${baselineCovg.toFixed(1)}%`,
        currentState: `${currentCovg.toFixed(1)}%`,
        impact: `Improved code coverage by ${(currentCovg - baselineCovg).toFixed(1)}%`,
      });
    }

    // Performance improvements
    if (current.duration < baseline.duration * 0.9) {
      // 10% faster
      improvements.push({
        id: `improvement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        testName: 'performance',
        type: 'improved-performance',
        previousState: `${baseline.duration}ms`,
        currentState: `${current.duration}ms`,
        impact: `Tests run ${Math.round(((baseline.duration - current.duration) / baseline.duration) * 100)}% faster`,
      });
    }

    return improvements;
  }

  /**
   * Determine regression severity
   */
  private determineSeverity(
    summary: RegressionSummary,
    regressions: Regression[],
  ): RegressionTestResult['severity'] {
    // No regressions
    if (regressions.length === 0) {
      return 'none';
    }

    // Critical if any critical regressions
    if (regressions.some((r) => r.severity === 'critical')) {
      return 'critical';
    }

    // Severe if pass rate dropped significantly
    if (summary.passRateChange < -this.config.regressionThreshold * 2) {
      return 'severe';
    }

    // Severe if many high severity regressions
    const highSeverityCount = regressions.filter((r) => r.severity === 'high').length;
    if (highSeverityCount > 3) {
      return 'severe';
    }

    // Moderate if pass rate dropped moderately
    if (summary.passRateChange < -this.config.regressionThreshold) {
      return 'moderate';
    }

    // Moderate if multiple medium severity regressions
    if (regressions.filter((r) => r.severity === 'medium').length > 2) {
      return 'moderate';
    }

    return 'minor';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    summary: RegressionSummary,
    regressions: Regression[],
    improvements: Improvement[],
  ): string[] {
    const recommendations: string[] = [];

    // Regression recommendations
    if (regressions.length > 0) {
      recommendations.push(`Address ${regressions.length} regression(s) before proceeding`);

      const criticalRegressions = regressions.filter((r) => r.severity === 'critical');
      if (criticalRegressions.length > 0) {
        recommendations.push(
          `CRITICAL: Fix ${criticalRegressions.length} critical regression(s) immediately`,
        );
      }

      const newFailures = regressions.filter((r) => r.type === 'new-failure');
      if (newFailures.length > 0) {
        recommendations.push(`Investigate ${newFailures.length} new test failure(s)`);
      }
    }

    // Pass rate recommendations
    if (summary.passRateChange < 0) {
      recommendations.push(
        `Test pass rate decreased by ${Math.abs(summary.passRateChange).toFixed(1)}% - review recent changes`,
      );
    }

    // Improvement recognition
    if (improvements.length > 0) {
      recommendations.push(`Good progress: ${improvements.length} improvement(s) detected`);

      if (summary.fixedFailures > 0) {
        recommendations.push(`Successfully fixed ${summary.fixedFailures} test(s)`);
      }
    }

    // No regressions
    if (regressions.length === 0 && summary.passRateChange >= 0) {
      recommendations.push('No regressions detected - safe to proceed');
    }

    return recommendations;
  }

  /**
   * Create result when no baseline exists
   */
  private createNoRegressionResult(current: TestExecutionResult): RegressionTestResult {
    return {
      regressionDetected: false,
      severity: 'none',
      summary: {
        baselinePassed: 0,
        baselineFailed: 0,
        currentPassed: current.passed,
        currentFailed: current.failed,
        newFailures: 0,
        fixedFailures: 0,
        passRateChange: 0,
      },
      regressions: [],
      improvements: [],
      recommendations: ['No baseline available - storing current results as baseline'],
      requiresAction: false,
    };
  }

  /**
   * Select tests affected by changed files
   */
  private selectAffectedTests(changedFiles: string[], allTests: string[]): string[] {
    // Simplified selection - in production, would use dependency analysis
    const affected: string[] = [];

    for (const test of allTests) {
      for (const file of changedFiles) {
        // Simple heuristic: if test name contains file name or vice versa
        const testLower = test.toLowerCase();
        const fileLower = file.toLowerCase();

        if (testLower.includes(fileLower) || fileLower.includes(testLower)) {
          affected.push(test);
          break;
        }
      }
    }

    return affected;
  }

  /**
   * Select critical tests that should always run
   */
  private selectCriticalTests(allTests: string[]): string[] {
    // Select tests marked as critical or smoke tests
    return allTests.filter(
      (test) =>
        test.toLowerCase().includes('critical') ||
        test.toLowerCase().includes('smoke') ||
        test.toLowerCase().includes('sanity'),
    );
  }

  /**
   * Get severity level as number
   */
  private getSeverityLevel(severity: string): number {
    const levels: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    return levels[severity] || 0;
  }

  /**
   * Calculate average coverage
   */
  private averageCoverage(coverage: TestExecutionResult['coverage']): number {
    return (coverage.lines + coverage.functions + coverage.branches + coverage.statements) / 4;
  }

  /**
   * Clear baselines and history
   */
  clear(featureId?: string): void {
    if (featureId) {
      this.baselines.delete(featureId);
      this.regressionHistory.delete(featureId);
      this.logger.info('Cleared regression data', { featureId });
    } else {
      this.baselines.clear();
      this.regressionHistory.clear();
      this.logger.info('Cleared all regression data');
    }
  }
}