import { promises as fs } from 'fs';
import * as path from 'path';

interface PerformanceDataPoint {
  timestamp: number;
  commit: string;
  branch: string;
  version?: string;
  metrics: {
    throughput: number;
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
    successRate: number;
    memoryUsage: number;
    cpuUsage: number;
    errorRate: number;
  };
  environment: {
    os: string;
    nodeVersion: string;
    cpuCores: number;
    memory: number;
  };
}

interface RegressionAlert {
  type: 'REGRESSION' | 'IMPROVEMENT' | 'ANOMALY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metric: string;
  currentValue: number;
  expectedValue: number;
  deviation: number;
  deviationPercent: number;
  confidence: number;
  description: string;
  recommendation: string;
  timestamp: number;
  commit: string;
  branch: string;
}

interface TrendAnalysis {
  metric: string;
  trend: 'IMPROVING' | 'DEGRADING' | 'STABLE' | 'VOLATILE';
  slope: number;
  r2: number; // Correlation coefficient
  predictions: {
    nextWeek: number;
    nextMonth: number;
    confidence: number;
  };
  changePoints: Array<{
    timestamp: number;
    commit: string;
    changeMagnitude: number;
    description: string;
  }>;
}

export class RegressionDetector {
  private dataPoints: PerformanceDataPoint[] = [];
  private alertHistory: RegressionAlert[] = [];
  private trendModels: Map<string, any> = new Map();
  private config: RegressionConfig;

  constructor(config: RegressionConfig) {
    this.config = config;
    this.loadHistoricalData();
  }

  // Load historical performance data
  private async loadHistoricalData(): Promise<void> {
    try {
      const dataPath = path.resolve(this.config.dataPath);
      const data = await fs.readFile(dataPath, 'utf-8');
      this.dataPoints = JSON.parse(data).dataPoints || [];
      console.log(`Loaded ${this.dataPoints.length} historical data points`);
    } catch (error) {
      console.warn(`Could not load historical data: ${error.message}`);
      this.dataPoints = [];
    }
  }

  // Add new performance data point
  async addDataPoint(dataPoint: PerformanceDataPoint): Promise<void> {
    this.dataPoints.push(dataPoint);

    // Keep only recent data points (configurable retention period)
    const retentionTime = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;
    this.dataPoints = this.dataPoints.filter((dp) => dp.timestamp > retentionTime);

    // Save updated data
    await this.saveDataPoints();

    // Update trend models
    this.updateTrendModels();
  }

  // Detect regressions in new data point
  async detectRegressions(newDataPoint: PerformanceDataPoint): Promise<RegressionAlert[]> {
    const alerts: RegressionAlert[] = [];

    // Add the new data point
    await this.addDataPoint(newDataPoint);

    // Statistical regression detection
    const statisticalAlerts = this.detectStatisticalRegressions(newDataPoint);
    alerts.push(...statisticalAlerts);

    // Trend-based regression detection
    const trendAlerts = this.detectTrendRegressions(newDataPoint);
    alerts.push(...trendAlerts);

    // Anomaly detection
    const anomalyAlerts = this.detectAnomalies(newDataPoint);
    alerts.push(...anomalyAlerts);

    // Store alerts
    this.alertHistory.push(...alerts);

    // Cleanup old alerts
    this.cleanupOldAlerts();

    return alerts;
  }

  // Statistical regression detection using moving averages and standard deviation
  private detectStatisticalRegressions(newDataPoint: PerformanceDataPoint): RegressionAlert[] {
    const alerts: RegressionAlert[] = [];

    if (this.dataPoints.length < this.config.minDataPoints) {
      return alerts; // Need more data points for statistical analysis
    }

    const recentPoints = this.dataPoints.slice(-this.config.windowSize);
    const historicalPoints = this.dataPoints.slice(0, -this.config.windowSize);

    if (historicalPoints.length === 0) {
      return alerts;
    }

    // Analyze each metric
    const metrics = [
      'throughput',
      'avgLatency',
      'p95Latency',
      'p99Latency',
      'successRate',
      'memoryUsage',
      'cpuUsage',
      'errorRate',
    ];

    for (const metric of metrics) {
      const alert = this.analyzeMetricRegression(
        metric,
        newDataPoint,
        recentPoints,
        historicalPoints,
      );

      if (alert) {
        alerts.push(alert);
      }
    }

    return alerts;
  }

  // Analyze regression for a specific metric
  private analyzeMetricRegression(
    metric: string,
    newDataPoint: PerformanceDataPoint,
    recentPoints: PerformanceDataPoint[],
    historicalPoints: PerformanceDataPoint[],
  ): RegressionAlert | null {
    const currentValue = this.getMetricValue(newDataPoint, metric);
    const recentAvg = this.calculateAverage(recentPoints, metric);
    const historicalAvg = this.calculateAverage(historicalPoints, metric);
    const historicalStd = this.calculateStandardDeviation(historicalPoints, metric);

    // Z-score calculation
    const zScore = Math.abs((currentValue - historicalAvg) / historicalStd);
    const deviationPercent = ((currentValue - historicalAvg) / historicalAvg) * 100;

    // Determine if this is a regression based on metric type
    const isWorseDirection = this.isWorseDirection(metric, currentValue, historicalAvg);
    const isBetterDirection = this.isBetterDirection(metric, currentValue, historicalAvg);

    // Significance thresholds
    const zScoreThreshold = this.config.thresholds.zScore;
    const percentThreshold = this.config.thresholds.percentChange;

    let alertType: 'REGRESSION' | 'IMPROVEMENT' | 'ANOMALY' | null = null;
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (zScore > zScoreThreshold && Math.abs(deviationPercent) > percentThreshold) {
      if (isWorseDirection) {
        alertType = 'REGRESSION';
        severity = this.calculateSeverity(zScore, Math.abs(deviationPercent));
      } else if (isBetterDirection && Math.abs(deviationPercent) > 10) {
        alertType = 'IMPROVEMENT';
        severity = 'LOW';
      } else {
        alertType = 'ANOMALY';
        severity = 'MEDIUM';
      }
    }

    if (!alertType) {
      return null;
    }

    return {
      type: alertType,
      severity: severity,
      metric: metric,
      currentValue: currentValue,
      expectedValue: historicalAvg,
      deviation: currentValue - historicalAvg,
      deviationPercent: deviationPercent,
      confidence: Math.min(95, 50 + zScore * 10), // Rough confidence calculation
      description: this.generateAlertDescription(
        alertType,
        metric,
        currentValue,
        historicalAvg,
        deviationPercent,
      ),
      recommendation: this.generateRecommendation(alertType, metric, deviationPercent),
      timestamp: newDataPoint.timestamp,
      commit: newDataPoint.commit,
      branch: newDataPoint.branch,
    };
  }

  // Trend-based regression detection
  private detectTrendRegressions(newDataPoint: PerformanceDataPoint): RegressionAlert[] {
    const alerts: RegressionAlert[] = [];

    if (this.dataPoints.length < this.config.trendAnalysis.minPoints) {
      return alerts;
    }

    const trendAnalyses = this.analyzeTrends();

    for (const analysis of trendAnalyses) {
      // Check if current value deviates significantly from trend prediction
      const trendModel = this.trendModels.get(analysis.metric);
      if (!trendModel) continue;

      const predictedValue = this.predictValue(trendModel, newDataPoint.timestamp);
      const currentValue = this.getMetricValue(newDataPoint, analysis.metric);
      const deviation = Math.abs(currentValue - predictedValue);
      const deviationPercent = (deviation / predictedValue) * 100;

      if (deviationPercent > this.config.trendAnalysis.deviationThreshold) {
        const isWorse = this.isWorseDirection(analysis.metric, currentValue, predictedValue);

        alerts.push({
          type: isWorse ? 'REGRESSION' : 'IMPROVEMENT',
          severity: this.calculateSeverity(0, deviationPercent),
          metric: analysis.metric,
          currentValue: currentValue,
          expectedValue: predictedValue,
          deviation: currentValue - predictedValue,
          deviationPercent: isWorse ? deviationPercent : -deviationPercent,
          confidence: analysis.predictions.confidence,
          description: `Trend-based ${isWorse ? 'regression' : 'improvement'} detected in ${analysis.metric}`,
          recommendation: this.generateTrendRecommendation(analysis.metric, analysis.trend),
          timestamp: newDataPoint.timestamp,
          commit: newDataPoint.commit,
          branch: newDataPoint.branch,
        });
      }
    }

    return alerts;
  }

  // Anomaly detection using isolation forest-like approach
  private detectAnomalies(newDataPoint: PerformanceDataPoint): RegressionAlert[] {
    const alerts: RegressionAlert[] = [];

    if (this.dataPoints.length < this.config.anomalyDetection.minPoints) {
      return alerts;
    }

    // Simple anomaly detection based on multivariate analysis
    const anomalyScore = this.calculateAnomalyScore(newDataPoint);

    if (anomalyScore > this.config.anomalyDetection.threshold) {
      // Identify which metrics are contributing to the anomaly
      const contributingMetrics = this.identifyAnomalousMetrics(newDataPoint);

      for (const metric of contributingMetrics) {
        alerts.push({
          type: 'ANOMALY',
          severity: 'MEDIUM',
          metric: metric,
          currentValue: this.getMetricValue(newDataPoint, metric),
          expectedValue: this.calculateHistoricalAverage(metric),
          deviation: 0,
          deviationPercent: 0,
          confidence: anomalyScore,
          description: `Anomalous behavior detected in ${metric}`,
          recommendation: `Investigate recent changes that might affect ${metric}`,
          timestamp: newDataPoint.timestamp,
          commit: newDataPoint.commit,
          branch: newDataPoint.branch,
        });
      }
    }

    return alerts;
  }

  // Analyze performance trends
  analyzeTrends(): TrendAnalysis[] {
    const analyses: TrendAnalysis[] = [];

    const metrics = [
      'throughput',
      'avgLatency',
      'p95Latency',
      'p99Latency',
      'successRate',
      'memoryUsage',
      'cpuUsage',
      'errorRate',
    ];

    for (const metric of metrics) {
      const analysis = this.analyzeTrendForMetric(metric);
      if (analysis) {
        analyses.push(analysis);
      }
    }

    return analyses;
  }

  // Analyze trend for specific metric
  private analyzeTrendForMetric(metric: string): TrendAnalysis | null {
    const values = this.dataPoints.map((dp) => this.getMetricValue(dp, metric));
    const timestamps = this.dataPoints.map((dp) => dp.timestamp);

    if (values.length < this.config.trendAnalysis.minPoints) {
      return null;
    }

    // Linear regression
    const regression = this.performLinearRegression(timestamps, values);

    // Determine trend direction
    let trend: 'IMPROVING' | 'DEGRADING' | 'STABLE' | 'VOLATILE';
    const slopeThreshold = this.config.trendAnalysis.slopeThreshold;

    if (Math.abs(regression.slope) < slopeThreshold) {
      trend = 'STABLE';
    } else if (regression.r2 < 0.5) {
      trend = 'VOLATILE';
    } else {
      const isImproving = this.isBetterDirection(metric, regression.slope > 0 ? 1 : -1, 0);
      trend = isImproving ? 'IMPROVING' : 'DEGRADING';
    }

    // Detect change points
    const changePoints = this.detectChangePoints(metric);

    // Generate predictions
    const now = Date.now();
    const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
    const nextMonth = now + 30 * 24 * 60 * 60 * 1000;

    return {
      metric: metric,
      trend: trend,
      slope: regression.slope,
      r2: regression.r2,
      predictions: {
        nextWeek: regression.slope * nextWeek + regression.intercept,
        nextMonth: regression.slope * nextMonth + regression.intercept,
        confidence: Math.max(0, Math.min(100, regression.r2 * 100)),
      },
      changePoints: changePoints,
    };
  }

  // Perform linear regression
  private performLinearRegression(
    x: number[],
    y: number[],
  ): { slope: number; intercept: number; r2: number } {
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    const sumYY = y.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R²
    const meanY = sumY / n;
    const ssTotal = y.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
    const ssResidual = y.reduce((sum, val, i) => {
      const predicted = slope * x[i] + intercept;
      return sum + Math.pow(val - predicted, 2);
    }, 0);

    const r2 = 1 - ssResidual / ssTotal;

    return { slope, intercept, r2 };
  }

  // Detect change points in performance data
  private detectChangePoints(
    metric: string,
  ): Array<{ timestamp: number; commit: string; changeMagnitude: number; description: string }> {
    const changePoints: Array<any> = [];
    const values = this.dataPoints.map((dp) => this.getMetricValue(dp, metric));

    // Simple change point detection using moving averages
    const windowSize = Math.min(10, Math.floor(values.length / 4));

    for (let i = windowSize; i < values.length - windowSize; i++) {
      const beforeWindow = values.slice(i - windowSize, i);
      const afterWindow = values.slice(i, i + windowSize);

      const beforeAvg = beforeWindow.reduce((sum, val) => sum + val, 0) / beforeWindow.length;
      const afterAvg = afterWindow.reduce((sum, val) => sum + val, 0) / afterWindow.length;

      const changeMagnitude = Math.abs((afterAvg - beforeAvg) / beforeAvg) * 100;

      if (changeMagnitude > this.config.changePointDetection.threshold) {
        const dataPoint = this.dataPoints[i];
        changePoints.push({
          timestamp: dataPoint.timestamp,
          commit: dataPoint.commit,
          changeMagnitude: changeMagnitude,
          description: `Significant change in ${metric}: ${beforeAvg.toFixed(2)} → ${afterAvg.toFixed(2)} (${changeMagnitude.toFixed(1)}% change)`,
        });
      }
    }

    return changePoints;
  }

  // Update trend models for prediction
  private updateTrendModels(): void {
    const metrics = [
      'throughput',
      'avgLatency',
      'p95Latency',
      'p99Latency',
      'successRate',
      'memoryUsage',
      'cpuUsage',
      'errorRate',
    ];

    for (const metric of metrics) {
      const values = this.dataPoints.map((dp) => this.getMetricValue(dp, metric));
      const timestamps = this.dataPoints.map((dp) => dp.timestamp);

      if (values.length >= this.config.trendAnalysis.minPoints) {
        const model = this.performLinearRegression(timestamps, values);
        this.trendModels.set(metric, model);
      }
    }
  }

  // Predict value using trend model
  private predictValue(model: any, timestamp: number): number {
    return model.slope * timestamp + model.intercept;
  }

  // Calculate anomaly score for a data point
  private calculateAnomalyScore(dataPoint: PerformanceDataPoint): number {
    // Simple anomaly scoring based on standard deviations from historical mean
    const recentPoints = this.dataPoints.slice(-this.config.windowSize);
    let totalScore = 0;
    let metricCount = 0;

    const metrics = ['throughput', 'avgLatency', 'p95Latency', 'successRate', 'memoryUsage'];

    for (const metric of metrics) {
      const currentValue = this.getMetricValue(dataPoint, metric);
      const historicalMean = this.calculateAverage(recentPoints, metric);
      const historicalStd = this.calculateStandardDeviation(recentPoints, metric);

      if (historicalStd > 0) {
        const zScore = Math.abs((currentValue - historicalMean) / historicalStd);
        totalScore += zScore;
        metricCount++;
      }
    }

    return metricCount > 0 ? totalScore / metricCount : 0;
  }

  // Identify which metrics are anomalous
  private identifyAnomalousMetrics(dataPoint: PerformanceDataPoint): string[] {
    const anomalousMetrics: string[] = [];
    const recentPoints = this.dataPoints.slice(-this.config.windowSize);

    const metrics = ['throughput', 'avgLatency', 'p95Latency', 'successRate', 'memoryUsage'];

    for (const metric of metrics) {
      const currentValue = this.getMetricValue(dataPoint, metric);
      const historicalMean = this.calculateAverage(recentPoints, metric);
      const historicalStd = this.calculateStandardDeviation(recentPoints, metric);

      if (historicalStd > 0) {
        const zScore = Math.abs((currentValue - historicalMean) / historicalStd);
        if (zScore > 3) {
          // 3 standard deviations
          anomalousMetrics.push(metric);
        }
      }
    }

    return anomalousMetrics;
  }

  // Helper methods
  private getMetricValue(dataPoint: PerformanceDataPoint, metric: string): number {
    return (dataPoint.metrics as any)[metric] || 0;
  }

  private calculateAverage(points: PerformanceDataPoint[], metric: string): number {
    const values = points.map((p) => this.getMetricValue(p, metric));
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateStandardDeviation(points: PerformanceDataPoint[], metric: string): number {
    const values = points.map((p) => this.getMetricValue(p, metric));
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateHistoricalAverage(metric: string): number {
    return this.calculateAverage(this.dataPoints, metric);
  }

  private isWorseDirection(metric: string, currentValue: number, referenceValue: number): boolean {
    const worseMetrics = [
      'avgLatency',
      'p95Latency',
      'p99Latency',
      'memoryUsage',
      'cpuUsage',
      'errorRate',
    ];
    const betterMetrics = ['throughput', 'successRate'];

    if (worseMetrics.includes(metric)) {
      return currentValue > referenceValue;
    } else if (betterMetrics.includes(metric)) {
      return currentValue < referenceValue;
    }

    return false;
  }

  private isBetterDirection(metric: string, currentValue: number, referenceValue: number): boolean {
    return (
      !this.isWorseDirection(metric, currentValue, referenceValue) &&
      currentValue !== referenceValue
    );
  }

  private calculateSeverity(
    zScore: number,
    percentChange: number,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (percentChange > 50 || zScore > 5) {
      return 'CRITICAL';
    } else if (percentChange > 25 || zScore > 3) {
      return 'HIGH';
    } else if (percentChange > 10 || zScore > 2) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  private generateAlertDescription(
    type: string,
    metric: string,
    currentValue: number,
    expectedValue: number,
    deviationPercent: number,
  ): string {
    const direction = deviationPercent > 0 ? 'increased' : 'decreased';
    return `${type}: ${metric} ${direction} by ${Math.abs(deviationPercent).toFixed(1)}% (${currentValue.toFixed(2)} vs expected ${expectedValue.toFixed(2)})`;
  }

  private generateRecommendation(type: string, metric: string, deviationPercent: number): string {
    if (type === 'REGRESSION') {
      switch (metric) {
        case 'throughput':
          return 'Investigate recent code changes affecting request processing, check for resource bottlenecks';
        case 'avgLatency':
        case 'p95Latency':
        case 'p99Latency':
          return 'Profile application to identify performance bottlenecks, review database queries and external API calls';
        case 'successRate':
          return 'Check error logs for increased failure rates, review recent deployments and configuration changes';
        case 'memoryUsage':
          return 'Investigate memory leaks, review object lifecycle and garbage collection patterns';
        case 'cpuUsage':
          return 'Profile CPU-intensive operations, optimize algorithms and consider async processing';
        default:
          return 'Investigate recent changes and monitor system resources';
      }
    } else if (type === 'IMPROVEMENT') {
      return `Performance improvement detected in ${metric}. Consider documenting the changes that led to this improvement.`;
    } else {
      return `Anomalous behavior in ${metric}. Review recent changes and monitor for consistency.`;
    }
  }

  private generateTrendRecommendation(metric: string, trend: string): string {
    if (trend === 'DEGRADING') {
      return `${metric} is showing a degrading trend. Consider implementing performance optimizations before it becomes critical.`;
    } else if (trend === 'VOLATILE') {
      return `${metric} is highly volatile. Investigate sources of variability and consider stabilization measures.`;
    } else {
      return `Monitor ${metric} trend and maintain current performance levels.`;
    }
  }

  private async saveDataPoints(): Promise<void> {
    try {
      const dataPath = path.resolve(this.config.dataPath);
      await fs.mkdir(path.dirname(dataPath), { recursive: true });
      await fs.writeFile(
        dataPath,
        JSON.stringify(
          {
            dataPoints: this.dataPoints,
            lastUpdated: Date.now(),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(`Failed to save data points: ${error.message}`);
    }
  }

  private cleanupOldAlerts(): void {
    const cutoffTime = Date.now() - this.config.alertRetentionDays * 24 * 60 * 60 * 1000;
    this.alertHistory = this.alertHistory.filter((alert) => alert.timestamp > cutoffTime);
  }

  // Public API methods
  getAlertHistory(): RegressionAlert[] {
    return this.alertHistory;
  }

  getTrendAnalyses(): TrendAnalysis[] {
    return this.analyzeTrends();
  }

  getDataPoints(): PerformanceDataPoint[] {
    return this.dataPoints;
  }
}

// Configuration interface
interface RegressionConfig {
  dataPath: string;
  retentionDays: number;
  alertRetentionDays: number;
  minDataPoints: number;
  windowSize: number;
  thresholds: {
    zScore: number;
    percentChange: number;
  };
  trendAnalysis: {
    minPoints: number;
    slopeThreshold: number;
    deviationThreshold: number;
  };
  anomalyDetection: {
    minPoints: number;
    threshold: number;
  };
  changePointDetection: {
    threshold: number;
  };
}

// Default configuration
export const defaultRegressionConfig: RegressionConfig = {
  dataPath: './performance-data.json',
  retentionDays: 90,
  alertRetentionDays: 30,
  minDataPoints: 10,
  windowSize: 20,
  thresholds: {
    zScore: 2.5,
    percentChange: 5,
  },
  trendAnalysis: {
    minPoints: 15,
    slopeThreshold: 0.001,
    deviationThreshold: 15,
  },
  anomalyDetection: {
    minPoints: 20,
    threshold: 3,
  },
  changePointDetection: {
    threshold: 20,
  },
};
