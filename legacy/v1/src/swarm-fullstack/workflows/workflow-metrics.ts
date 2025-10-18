/**
 * Workflow Metrics - Track and Calculate Iteration Performance Metrics
 *
 * Provides comprehensive metrics tracking for the iterative workflow,
 * including efficiency, quality, velocity, and convergence metrics.
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';
import { FeatureIteration, IterationMetrics } from './iterative-build-test.js';

export interface MetricSnapshot {
  timestamp: string;
  featureId: string;
  iteration: number;
  metrics: IterationMetrics;
  trends: MetricTrends;
}

export interface MetricTrends {
  testPassRateTrend: number; // positive = improving
  fixSuccessRateTrend: number;
  convergenceRateTrend: number;
  efficiencyTrend: number;
  velocityChange: number; // iterations per hour
}

export interface AggregateMetrics {
  featureId: string;
  totalIterations: number;
  totalDuration: number;
  averageIterationTime: number;
  totalTests: number;
  overallPassRate: number;
  totalFixes: number;
  overallFixSuccessRate: number;
  averageConvergenceRate: number;
  averageEfficiency: number;
  overallQualityScore: number;
  timeToConvergence: number;
}

export class WorkflowMetrics extends EventEmitter {
  private snapshots = new Map<string, MetricSnapshot[]>();

  constructor(private logger: ILogger) {
    super();
  }

  /**
   * Calculate metrics for an iteration
   */
  async calculateIterationMetrics(iteration: FeatureIteration): Promise<IterationMetrics> {
    const startTime = new Date(iteration.startTime).getTime();
    const endTime = iteration.endTime ? new Date(iteration.endTime).getTime() : Date.now();
    const duration = endTime - startTime;

    // Test metrics
    const testsExecuted = iteration.testResults.totalTests;
    const testPassRate = testsExecuted > 0
      ? iteration.testResults.passed / testsExecuted
      : 0;

    // Fix metrics
    const fixesApplied = iteration.fixResults.length;
    const successfulFixes = iteration.fixResults.filter((f) => f.status === 'completed').length;
    const fixSuccessRate = fixesApplied > 0 ? successfulFixes / fixesApplied : 0;

    // Code churn (total lines changed)
    const codeChurn = iteration.fixResults.reduce(
      (sum, fix) =>
        sum + fix.changes.reduce((lineSum, change) => lineSum + change.linesChanged, 0),
      0,
    );

    // Convergence rate (how quickly approaching convergence)
    const convergenceRate = this.calculateConvergenceRate(iteration);

    // Efficiency (value delivered per time)
    const efficiency = this.calculateEfficiency(
      testPassRate,
      fixSuccessRate,
      duration,
      testsExecuted,
    );

    // Quality score
    const qualityScore = this.calculateQualityScore(iteration);

    const metrics: IterationMetrics = {
      duration,
      testsExecuted,
      testPassRate,
      fixesApplied,
      fixSuccessRate,
      codeChurn,
      convergenceRate,
      efficiency,
      qualityScore,
    };

    // Store snapshot
    await this.storeSnapshot(iteration.featureId, iteration.iterationNumber, metrics);

    // Emit metrics event
    this.emit('metrics:updated', {
      featureId: iteration.featureId,
      iteration: iteration.iterationNumber,
      metrics,
    });

    return metrics;
  }

  /**
   * Calculate convergence rate
   */
  private calculateConvergenceRate(iteration: FeatureIteration): number {
    const passRate = iteration.testResults.passed / iteration.testResults.totalTests || 0;

    // Get historical pass rates
    const history = this.snapshots.get(iteration.featureId) || [];
    if (history.length === 0) {
      return passRate; // First iteration
    }

    const previousPassRate = history[history.length - 1].metrics.testPassRate;
    const improvement = passRate - previousPassRate;

    // Convergence rate is the improvement rate
    return Math.max(improvement, 0);
  }

  /**
   * Calculate efficiency score
   */
  private calculateEfficiency(
    testPassRate: number,
    fixSuccessRate: number,
    duration: number,
    testsExecuted: number,
  ): number {
    // Efficiency = (quality * throughput) / time
    const quality = (testPassRate + fixSuccessRate) / 2;
    const throughput = testsExecuted / 100; // normalized
    const time = duration / 1800000; // normalized to 30-min units

    const efficiency = time > 0 ? (quality * throughput) / time : 0;

    return Math.min(efficiency, 1);
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(iteration: FeatureIteration): number {
    let score = 100;

    // Deduct for test failures
    const { testResults } = iteration;
    const criticalFailures = testResults.failures.filter((f) => f.severity === 'critical').length;
    const highFailures = testResults.failures.filter((f) => f.severity === 'high').length;
    const mediumFailures = testResults.failures.filter((f) => f.severity === 'medium').length;

    score -= criticalFailures * 15;
    score -= highFailures * 10;
    score -= mediumFailures * 5;

    // Deduct for warnings
    const highWarnings = testResults.warnings.filter((w) => w.severity === 'high').length;
    const mediumWarnings = testResults.warnings.filter((w) => w.severity === 'medium').length;

    score -= highWarnings * 3;
    score -= mediumWarnings * 1;

    // Deduct for failed fixes
    const failedFixes = iteration.fixResults.filter((f) => f.status === 'failed').length;
    score -= failedFixes * 5;

    // Bonus for coverage
    const avgCoverage =
      (testResults.coverage.lines +
        testResults.coverage.functions +
        testResults.coverage.branches +
        testResults.coverage.statements) /
      4;

    score += (avgCoverage - 80) * 0.2; // Bonus for coverage above 80%

    return Math.max(Math.min(score, 100), 0);
  }

  /**
   * Store metric snapshot
   */
  private async storeSnapshot(
    featureId: string,
    iteration: number,
    metrics: IterationMetrics,
  ): Promise<void> {
    if (!this.snapshots.has(featureId)) {
      this.snapshots.set(featureId, []);
    }

    const history = this.snapshots.get(featureId)!;
    const trends = this.calculateTrends(history, metrics);

    const snapshot: MetricSnapshot = {
      timestamp: new Date().toISOString(),
      featureId,
      iteration,
      metrics,
      trends,
    };

    history.push(snapshot);
  }

  /**
   * Calculate metric trends
   */
  private calculateTrends(history: MetricSnapshot[], current: IterationMetrics): MetricTrends {
    if (history.length === 0) {
      return {
        testPassRateTrend: 0,
        fixSuccessRateTrend: 0,
        convergenceRateTrend: 0,
        efficiencyTrend: 0,
        velocityChange: 0,
      };
    }

    const previous = history[history.length - 1].metrics;

    return {
      testPassRateTrend: current.testPassRate - previous.testPassRate,
      fixSuccessRateTrend: current.fixSuccessRate - previous.fixSuccessRate,
      convergenceRateTrend: current.convergenceRate - previous.convergenceRate,
      efficiencyTrend: current.efficiency - previous.efficiency,
      velocityChange: this.calculateVelocityChange(history),
    };
  }

  /**
   * Calculate velocity change (iterations per hour)
   */
  private calculateVelocityChange(history: MetricSnapshot[]): number {
    if (history.length < 2) return 0;

    const recent = history.slice(-2);
    const timeDiff =
      new Date(recent[1].timestamp).getTime() - new Date(recent[0].timestamp).getTime();
    const iterationTime = timeDiff / 3600000; // hours

    return 1 / iterationTime; // iterations per hour
  }

  /**
   * Get aggregate metrics for a feature
   */
  getAggregateMetrics(featureId: string): AggregateMetrics | null {
    const history = this.snapshots.get(featureId);
    if (!history || history.length === 0) return null;

    const totalIterations = history.length;
    const totalDuration = history.reduce((sum, s) => sum + s.metrics.duration, 0);
    const averageIterationTime = totalDuration / totalIterations;

    const totalTests = history.reduce((sum, s) => sum + s.metrics.testsExecuted, 0);
    const avgTestPassRate =
      history.reduce((sum, s) => sum + s.metrics.testPassRate, 0) / totalIterations;

    const totalFixes = history.reduce((sum, s) => sum + s.metrics.fixesApplied, 0);
    const avgFixSuccessRate =
      history.reduce((sum, s) => sum + s.metrics.fixSuccessRate, 0) / totalIterations;

    const avgConvergenceRate =
      history.reduce((sum, s) => sum + s.metrics.convergenceRate, 0) / totalIterations;

    const avgEfficiency = history.reduce((sum, s) => sum + s.metrics.efficiency, 0) / totalIterations;

    const avgQualityScore =
      history.reduce((sum, s) => sum + s.metrics.qualityScore, 0) / totalIterations;

    const timeToConvergence = totalDuration;

    return {
      featureId,
      totalIterations,
      totalDuration,
      averageIterationTime,
      totalTests,
      overallPassRate: avgTestPassRate,
      totalFixes,
      overallFixSuccessRate: avgFixSuccessRate,
      averageConvergenceRate: avgConvergenceRate,
      averageEfficiency: avgEfficiency,
      overallQualityScore: avgQualityScore,
      timeToConvergence,
    };
  }

  /**
   * Get metric snapshots for a feature
   */
  getSnapshots(featureId: string): MetricSnapshot[] {
    return this.snapshots.get(featureId) || [];
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(featureId: string): MetricSnapshot | null {
    const history = this.snapshots.get(featureId);
    if (!history || history.length === 0) return null;
    return history[history.length - 1];
  }

  /**
   * Compare metrics across features
   */
  compareFeatures(featureIds: string[]): Map<string, AggregateMetrics | null> {
    const comparison = new Map<string, AggregateMetrics | null>();

    for (const featureId of featureIds) {
      comparison.set(featureId, this.getAggregateMetrics(featureId));
    }

    return comparison;
  }

  /**
   * Export metrics for reporting
   */
  exportMetrics(featureId: string): {
    feature: string;
    snapshots: MetricSnapshot[];
    aggregate: AggregateMetrics | null;
    exportedAt: string;
  } {
    return {
      feature: featureId,
      snapshots: this.getSnapshots(featureId),
      aggregate: this.getAggregateMetrics(featureId),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Clear metrics for a feature
   */
  clearMetrics(featureId: string): void {
    this.snapshots.delete(featureId);
    this.logger.info('Cleared metrics', { featureId });
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    totalFeatures: number;
    totalIterations: number;
    averageIterationsPerFeature: number;
    averageTimeToConvergence: number;
    overallQualityScore: number;
  } {
    const allFeatures = Array.from(this.snapshots.keys());
    const totalFeatures = allFeatures.length;

    if (totalFeatures === 0) {
      return {
        totalFeatures: 0,
        totalIterations: 0,
        averageIterationsPerFeature: 0,
        averageTimeToConvergence: 0,
        overallQualityScore: 0,
      };
    }

    const aggregates = allFeatures
      .map((f) => this.getAggregateMetrics(f))
      .filter(Boolean) as AggregateMetrics[];

    const totalIterations = aggregates.reduce((sum, a) => sum + a.totalIterations, 0);
    const averageIterationsPerFeature = totalIterations / totalFeatures;
    const averageTimeToConvergence =
      aggregates.reduce((sum, a) => sum + a.timeToConvergence, 0) / totalFeatures;
    const overallQualityScore =
      aggregates.reduce((sum, a) => sum + a.overallQualityScore, 0) / totalFeatures;

    return {
      totalFeatures,
      totalIterations,
      averageIterationsPerFeature,
      averageTimeToConvergence,
      overallQualityScore,
    };
  }
}