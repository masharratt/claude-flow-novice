/**
 * Convergence Detector - Determines When Iteration is Complete
 *
 * Monitors test pass rates, quality metrics, and progress indicators to
 * determine when an iteration has converged and is ready to move forward.
 *
 * Key Features:
 * - Multi-dimensional convergence analysis
 * - Quality gate validation
 * - Trend analysis
 * - Early convergence detection
 * - Divergence warnings
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';
import { TestExecutionResult } from './iterative-build-test.js';

export interface ConvergenceConfig {
  threshold: number; // 0-1, percentage of passing tests
  minCoverage: number; // 0-100
  requireStability: boolean; // require multiple stable iterations
  stabilityWindow: number; // number of iterations to check
  enableTrendAnalysis: boolean;
  qualityGates: QualityGate[];
}

export interface QualityGate {
  name: string;
  metric: string;
  threshold: number;
  operator: '>' | '<' | '>=' | '<=' | '===';
  blocking: boolean;
}

export interface ConvergenceCheck {
  testResults: TestExecutionResult;
  threshold: number;
  minCoverage: number;
  iterationNumber: number;
  previousResults?: TestExecutionResult[];
}

export interface ConvergenceResult {
  converged: boolean;
  score: number; // 0-1
  confidence: number; // 0-1
  metrics: ConvergenceMetrics;
  qualityGateResults: QualityGateResult[];
  recommendations: string[];
  blockers: string[];
  trends: TrendAnalysis;
}

export interface ConvergenceMetrics {
  testPassRate: number;
  coverageScore: number;
  qualityScore: number;
  stabilityScore: number;
  velocityScore: number;
  overallScore: number;
}

export interface QualityGateResult {
  gate: QualityGate;
  passed: boolean;
  actualValue: number;
  threshold: number;
  blocking: boolean;
}

export interface TrendAnalysis {
  improving: boolean;
  velocity: number; // rate of improvement
  projection: {
    iterationsToConvergence: number;
    estimatedCompletion: string;
  };
  riskFactors: string[];
}

export class ConvergenceDetector extends EventEmitter {
  private config: ConvergenceConfig;
  private iterationHistory: TestExecutionResult[] = [];

  constructor(private logger: ILogger, config?: Partial<ConvergenceConfig>) {
    super();

    this.config = {
      threshold: 0.95,
      minCoverage: 80,
      requireStability: true,
      stabilityWindow: 2,
      enableTrendAnalysis: true,
      qualityGates: [
        {
          name: 'Test Pass Rate',
          metric: 'testPassRate',
          threshold: 95,
          operator: '>=',
          blocking: true,
        },
        {
          name: 'Code Coverage',
          metric: 'coverage.lines',
          threshold: 80,
          operator: '>=',
          blocking: true,
        },
        {
          name: 'Critical Failures',
          metric: 'criticalFailures',
          threshold: 0,
          operator: '===',
          blocking: true,
        },
      ],
      ...config,
    };
  }

  /**
   * Check if iteration has converged
   */
  async checkConvergence(check: ConvergenceCheck): Promise<ConvergenceResult> {
    this.logger.info('Checking convergence', {
      iteration: check.iterationNumber,
      passRate: check.testResults.passed / check.testResults.totalTests,
    });

    // Add to history
    this.iterationHistory.push(check.testResults);

    // Calculate individual metrics
    const metrics = this.calculateMetrics(check);

    // Evaluate quality gates
    const qualityGateResults = this.evaluateQualityGates(check.testResults, metrics);

    // Analyze trends
    const trends = this.config.enableTrendAnalysis
      ? this.analyzeTrends(check)
      : this.getDefaultTrends();

    // Determine if converged
    const converged = this.determineConvergence(metrics, qualityGateResults, trends);

    // Calculate confidence
    const confidence = this.calculateConfidence(metrics, qualityGateResults, trends);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      metrics,
      qualityGateResults,
      trends,
      converged,
    );

    // Identify blockers
    const blockers = this.identifyBlockers(qualityGateResults, metrics);

    const result: ConvergenceResult = {
      converged,
      score: metrics.overallScore,
      confidence,
      metrics,
      qualityGateResults,
      recommendations,
      blockers,
      trends,
    };

    // Emit event if converged
    if (converged) {
      this.emit('convergence:achieved', {
        iteration: check.iterationNumber,
        score: metrics.overallScore,
        confidence,
      });
    }

    // Emit warning if diverging
    if (trends.improving === false && check.iterationNumber > 2) {
      this.emit('convergence:diverging', {
        iteration: check.iterationNumber,
        riskFactors: trends.riskFactors,
      });
    }

    return result;
  }

  /**
   * Calculate convergence metrics
   */
  private calculateMetrics(check: ConvergenceCheck): ConvergenceMetrics {
    const { testResults } = check;

    // Test pass rate (0-1)
    const testPassRate =
      testResults.totalTests > 0 ? testResults.passed / testResults.totalTests : 0;

    // Coverage score (0-1)
    const coverageScore = this.calculateCoverageScore(testResults.coverage);

    // Quality score based on failures and warnings (0-1)
    const qualityScore = this.calculateQualityScore(testResults);

    // Stability score based on recent iterations (0-1)
    const stabilityScore = this.calculateStabilityScore(check);

    // Velocity score based on improvement rate (0-1)
    const velocityScore = this.calculateVelocityScore();

    // Overall score (weighted average)
    const overallScore =
      testPassRate * 0.4 +
      coverageScore * 0.25 +
      qualityScore * 0.2 +
      stabilityScore * 0.1 +
      velocityScore * 0.05;

    return {
      testPassRate,
      coverageScore,
      qualityScore,
      stabilityScore,
      velocityScore,
      overallScore,
    };
  }

  /**
   * Calculate coverage score from coverage metrics
   */
  private calculateCoverageScore(coverage: TestExecutionResult['coverage']): number {
    const { lines, functions, branches, statements } = coverage;

    // Weighted average of coverage metrics
    const score = (lines * 0.3 + functions * 0.25 + branches * 0.25 + statements * 0.2) / 100;

    return Math.min(Math.max(score, 0), 1);
  }

  /**
   * Calculate quality score based on failures and warnings
   */
  private calculateQualityScore(testResults: TestExecutionResult): number {
    let score = 1.0;

    // Penalize for failures
    const criticalFailures = testResults.failures.filter((f) => f.severity === 'critical').length;
    const highFailures = testResults.failures.filter((f) => f.severity === 'high').length;
    const mediumFailures = testResults.failures.filter((f) => f.severity === 'medium').length;

    score -= criticalFailures * 0.2;
    score -= highFailures * 0.1;
    score -= mediumFailures * 0.05;

    // Penalize for warnings
    const highWarnings = testResults.warnings.filter((w) => w.severity === 'high').length;
    const mediumWarnings = testResults.warnings.filter((w) => w.severity === 'medium').length;

    score -= highWarnings * 0.02;
    score -= mediumWarnings * 0.01;

    return Math.max(score, 0);
  }

  /**
   * Calculate stability score based on recent iterations
   */
  private calculateStabilityScore(check: ConvergenceCheck): number {
    if (this.iterationHistory.length < 2) return 0.5;

    const recent = this.iterationHistory.slice(-this.config.stabilityWindow);

    // Calculate variance in pass rate
    const passRates = recent.map((r) => r.passed / r.totalTests);
    const variance = this.calculateVariance(passRates);

    // Lower variance = higher stability
    const stabilityScore = 1 - Math.min(variance * 10, 1);

    return stabilityScore;
  }

  /**
   * Calculate velocity score (rate of improvement)
   */
  private calculateVelocityScore(): number {
    if (this.iterationHistory.length < 2) return 0.5;

    const recent = this.iterationHistory.slice(-3);
    const passRates = recent.map((r) => r.passed / r.totalTests);

    // Check if improving
    let improving = true;
    for (let i = 1; i < passRates.length; i++) {
      if (passRates[i] <= passRates[i - 1]) {
        improving = false;
        break;
      }
    }

    if (!improving) return 0.3;

    // Calculate improvement rate
    const totalImprovement = passRates[passRates.length - 1] - passRates[0];
    const velocityScore = Math.min(totalImprovement * 2, 1);

    return velocityScore;
  }

  /**
   * Evaluate quality gates
   */
  private evaluateQualityGates(
    testResults: TestExecutionResult,
    metrics: ConvergenceMetrics,
  ): QualityGateResult[] {
    return this.config.qualityGates.map((gate) => {
      const actualValue = this.getMetricValue(gate.metric, testResults, metrics);
      const passed = this.evaluateCondition(actualValue, gate.operator, gate.threshold);

      return {
        gate,
        passed,
        actualValue,
        threshold: gate.threshold,
        blocking: gate.blocking,
      };
    });
  }

  /**
   * Get metric value from test results or metrics
   */
  private getMetricValue(
    metric: string,
    testResults: TestExecutionResult,
    metrics: ConvergenceMetrics,
  ): number {
    // Handle nested properties
    if (metric.includes('.')) {
      const parts = metric.split('.');
      let value: any = testResults;

      for (const part of parts) {
        value = value[part];
        if (value === undefined) break;
      }

      return typeof value === 'number' ? value : 0;
    }

    // Handle special metrics
    if (metric === 'testPassRate') {
      return metrics.testPassRate * 100;
    }

    if (metric === 'criticalFailures') {
      return testResults.failures.filter((f) => f.severity === 'critical').length;
    }

    return 0;
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(
    actualValue: number,
    operator: QualityGate['operator'],
    threshold: number,
  ): boolean {
    switch (operator) {
      case '>':
        return actualValue > threshold;
      case '<':
        return actualValue < threshold;
      case '>=':
        return actualValue >= threshold;
      case '<=':
        return actualValue <= threshold;
      case '===':
        return actualValue === threshold;
      default:
        return false;
    }
  }

  /**
   * Analyze trends
   */
  private analyzeTrends(check: ConvergenceCheck): TrendAnalysis {
    if (this.iterationHistory.length < 2) {
      return this.getDefaultTrends();
    }

    const recent = this.iterationHistory.slice(-3);
    const passRates = recent.map((r) => r.passed / r.totalTests);

    // Check if improving
    const improving = this.isImproving(passRates);

    // Calculate velocity (rate of change)
    const velocity = this.calculateTrendVelocity(passRates);

    // Project iterations to convergence
    const iterationsToConvergence = this.projectIterationsToConvergence(
      passRates,
      velocity,
      this.config.threshold,
    );

    // Identify risk factors
    const riskFactors = this.identifyRiskFactors(passRates, velocity, check);

    return {
      improving,
      velocity,
      projection: {
        iterationsToConvergence,
        estimatedCompletion: new Date(
          Date.now() + iterationsToConvergence * 1800000,
        ).toISOString(),
      },
      riskFactors,
    };
  }

  /**
   * Determine if trend is improving
   */
  private isImproving(values: number[]): boolean {
    if (values.length < 2) return true;

    let improvementCount = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[i - 1]) improvementCount++;
    }

    return improvementCount > values.length / 2;
  }

  /**
   * Calculate trend velocity
   */
  private calculateTrendVelocity(values: number[]): number {
    if (values.length < 2) return 0;

    const changes: number[] = [];
    for (let i = 1; i < values.length; i++) {
      changes.push(values[i] - values[i - 1]);
    }

    return changes.reduce((sum, change) => sum + change, 0) / changes.length;
  }

  /**
   * Project iterations to convergence
   */
  private projectIterationsToConvergence(
    passRates: number[],
    velocity: number,
    threshold: number,
  ): number {
    if (passRates.length === 0) return 10;

    const currentRate = passRates[passRates.length - 1];
    const gap = threshold - currentRate;

    if (velocity <= 0) return 999; // Not converging
    if (gap <= 0) return 0; // Already converged

    return Math.ceil(gap / velocity);
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(
    passRates: number[],
    velocity: number,
    check: ConvergenceCheck,
  ): string[] {
    const risks: string[] = [];

    // Negative velocity
    if (velocity < 0) {
      risks.push('Test pass rate is decreasing');
    }

    // Stagnant progress
    if (Math.abs(velocity) < 0.01 && passRates[passRates.length - 1] < this.config.threshold) {
      risks.push('Progress has stagnated');
    }

    // Critical failures
    const criticalFailures = check.testResults.failures.filter(
      (f) => f.severity === 'critical',
    ).length;
    if (criticalFailures > 0) {
      risks.push(`${criticalFailures} critical test failures present`);
    }

    // Low coverage
    const avgCoverage =
      (check.testResults.coverage.lines +
        check.testResults.coverage.functions +
        check.testResults.coverage.branches) /
      3;
    if (avgCoverage < this.config.minCoverage) {
      risks.push(`Code coverage (${avgCoverage.toFixed(1)}%) below threshold`);
    }

    // High iteration count
    if (check.iterationNumber > 7) {
      risks.push('High iteration count may indicate design issues');
    }

    return risks;
  }

  /**
   * Determine convergence
   */
  private determineConvergence(
    metrics: ConvergenceMetrics,
    qualityGateResults: QualityGateResult[],
    trends: TrendAnalysis,
  ): boolean {
    // Check if all blocking quality gates pass
    const blockingGatesPassed = qualityGateResults
      .filter((r) => r.gate.blocking)
      .every((r) => r.passed);

    if (!blockingGatesPassed) return false;

    // Check overall score
    if (metrics.overallScore < this.config.threshold) return false;

    // Check stability if required
    if (this.config.requireStability && metrics.stabilityScore < 0.7) return false;

    // Check if improving
    if (this.config.enableTrendAnalysis && !trends.improving) return false;

    return true;
  }

  /**
   * Calculate confidence level
   */
  private calculateConfidence(
    metrics: ConvergenceMetrics,
    qualityGateResults: QualityGateResult[],
    trends: TrendAnalysis,
  ): number {
    let confidence = 0.5;

    // High pass rate increases confidence
    confidence += metrics.testPassRate * 0.2;

    // High coverage increases confidence
    confidence += metrics.coverageScore * 0.15;

    // High quality increases confidence
    confidence += metrics.qualityScore * 0.1;

    // Stability increases confidence
    confidence += metrics.stabilityScore * 0.1;

    // All quality gates passing increases confidence
    const allGatesPassed = qualityGateResults.every((r) => r.passed);
    if (allGatesPassed) confidence += 0.15;

    // Positive trends increase confidence
    if (trends.improving && trends.velocity > 0) confidence += 0.1;

    return Math.min(confidence, 1);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    metrics: ConvergenceMetrics,
    qualityGateResults: QualityGateResult[],
    trends: TrendAnalysis,
    converged: boolean,
  ): string[] {
    const recommendations: string[] = [];

    if (converged) {
      recommendations.push('Iteration has converged - ready to proceed');
      recommendations.push('Consider final validation before deployment');
      return recommendations;
    }

    // Test pass rate recommendations
    if (metrics.testPassRate < 0.9) {
      recommendations.push(
        `Focus on fixing remaining test failures (${((1 - metrics.testPassRate) * 100).toFixed(1)}% failing)`,
      );
    }

    // Coverage recommendations
    if (metrics.coverageScore < 0.8) {
      recommendations.push(
        `Increase test coverage (current: ${(metrics.coverageScore * 100).toFixed(1)}%)`,
      );
    }

    // Quality recommendations
    if (metrics.qualityScore < 0.8) {
      recommendations.push('Address high-severity test failures and warnings');
    }

    // Stability recommendations
    if (metrics.stabilityScore < 0.7) {
      recommendations.push('Focus on stabilizing existing fixes before adding new changes');
    }

    // Trend recommendations
    if (!trends.improving) {
      recommendations.push('Re-evaluate fix strategies - current approach may not be effective');
    }

    // Failed quality gates
    const failedGates = qualityGateResults.filter((r) => !r.passed);
    for (const result of failedGates) {
      recommendations.push(
        `Address quality gate: ${result.gate.name} (${result.actualValue} ${result.gate.operator} ${result.threshold})`,
      );
    }

    return recommendations;
  }

  /**
   * Identify blockers
   */
  private identifyBlockers(
    qualityGateResults: QualityGateResult[],
    metrics: ConvergenceMetrics,
  ): string[] {
    const blockers: string[] = [];

    // Failed blocking quality gates
    const failedBlockingGates = qualityGateResults.filter(
      (r) => r.gate.blocking && !r.passed,
    );

    for (const result of failedBlockingGates) {
      blockers.push(
        `Blocking quality gate failed: ${result.gate.name} (${result.actualValue} ${result.gate.operator} ${result.threshold})`,
      );
    }

    return blockers;
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;

    return variance;
  }

  /**
   * Get default trends
   */
  private getDefaultTrends(): TrendAnalysis {
    return {
      improving: true,
      velocity: 0,
      projection: {
        iterationsToConvergence: 5,
        estimatedCompletion: new Date(Date.now() + 5 * 1800000).toISOString(),
      },
      riskFactors: [],
    };
  }

  /**
   * Reset detector for new workflow
   */
  reset(): void {
    this.iterationHistory = [];
  }

  /**
   * Get current status
   */
  getStatus(): {
    iterations: number;
    currentPassRate: number;
    trend: string;
  } {
    const iterations = this.iterationHistory.length;

    if (iterations === 0) {
      return {
        iterations: 0,
        currentPassRate: 0,
        trend: 'unknown',
      };
    }

    const latest = this.iterationHistory[iterations - 1];
    const currentPassRate = latest.passed / latest.totalTests;

    let trend = 'stable';
    if (iterations > 1) {
      const previous = this.iterationHistory[iterations - 2];
      const previousPassRate = previous.passed / previous.totalTests;

      if (currentPassRate > previousPassRate + 0.05) trend = 'improving';
      else if (currentPassRate < previousPassRate - 0.05) trend = 'declining';
    }

    return {
      iterations,
      currentPassRate,
      trend,
    };
  }
}