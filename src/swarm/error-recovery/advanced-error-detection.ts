/**
 * Advanced Error Detection System
 * Provides predictive error detection, real-time monitoring, and early warning capabilities
 */

import { EventEmitter } from 'node:events';
import { createClient, RedisClientType } from 'redis';
import type { ILogger } from '../../core/logger.js';

export interface ErrorPattern {
  id: string;
  name: string;
  description: string;
  pattern: RegExp | string | Function;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'network' | 'memory' | 'performance' | 'agent' | 'task' | 'system';
  predictive: boolean;
  threshold?: number;
  windowMs?: number;
  action?: string;
}

export interface AnomalyDetectionConfig {
  enabled: boolean;
  algorithms: ('statistical' | 'ml-based' | 'threshold' | 'trend')[];
  sensitivity: number; // 0.0 - 1.0
  windowSize: number; // samples
  alertThreshold: number; // standard deviations
}

export interface HealthMetrics {
  timestamp: Date;
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  agentHealth: number;
  taskSuccessRate: number;
  responseTime: number;
  errorRate: number;
  activeConnections: number;
  queueSize: number;
}

export interface ErrorDetectionConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    database?: number;
  };
  monitoring: {
    intervalMs: number;
    retentionMs: number;
    batchSize: number;
  };
  anomaly: AnomalyDetectionConfig;
  patterns: ErrorPattern[];
  thresholds: {
    errorRate: number;
    responseTime: number;
    memoryUsage: number;
    cpuUsage: number;
    agentFailureRate: number;
  };
  earlyWarning: {
    enabled: boolean;
    leadTimeMs: number;
    confidence: number;
  };
}

export interface DetectedError {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  message: string;
  timestamp: Date;
  source: string;
  context: Record<string, any>;
  predictive: boolean;
  confidence: number;
  metrics: HealthMetrics;
  pattern?: ErrorPattern;
  recommendedAction?: string;
}

export interface EarlyWarning {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  predictedTime: Date;
  confidence: number;
  metrics: HealthMetrics;
  recommendedActions: string[];
  affectedComponents: string[];
}

export class AdvancedErrorDetection extends EventEmitter {
  private redis: RedisClientType;
  private logger: ILogger;
  private config: ErrorDetectionConfig;
  private isRunning = false;
  private monitoringTimer?: NodeJS.Timeout;
  private metrics: HealthMetrics[] = [];
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  private anomalyDetector: AnomalyDetector;
  private predictiveEngine: PredictiveErrorEngine;

  constructor(logger: ILogger, config: ErrorDetectionConfig) {
    super();
    this.logger = logger;
    this.config = config;
    this.redis = createClient(config.redis);
    this.anomalyDetector = new AnomalyDetector(config.anomaly);
    this.predictiveEngine = new PredictiveErrorEngine(logger, config);

    this.initializeErrorPatterns();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      await this.redis.connect();
      this.logger.info('Advanced error detection started', {
        redis: `${this.config.redis.host}:${this.config.redis.port}`,
        monitoring: `${this.config.monitoring.intervalMs}ms`
      });

      this.isRunning = true;
      this.startMonitoring();
      this.startAnomalyDetection();

      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start advanced error detection', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    await this.redis.disconnect();
    this.emit('stopped');

    this.logger.info('Advanced error detection stopped');
  }

  private initializeErrorPatterns(): void {
    this.config.patterns.forEach(pattern => {
      this.errorPatterns.set(pattern.id, pattern);
    });

    // Add default patterns if not provided
    if (this.config.patterns.length === 0) {
      this.addDefaultErrorPatterns();
    }
  }

  private addDefaultErrorPatterns(): void {
    const defaultPatterns: ErrorPattern[] = [
      {
        id: 'memory-leak',
        name: 'Memory Leak Detection',
        description: 'Detects gradual memory increase over time',
        pattern: 'memory_increase_trend',
        severity: 'high',
        category: 'memory',
        predictive: true,
        threshold: 0.8,
        windowMs: 300000, // 5 minutes
        action: 'restart_component'
      },
      {
        id: 'agent-timeout',
        name: 'Agent Timeout Pattern',
        description: 'Detects agents consistently timing out',
        pattern: /agent.*timeout|timeout.*agent/i,
        severity: 'medium',
        category: 'agent',
        predictive: false,
        action: 'check_agent_health'
      },
      {
        id: 'task-failure-cascade',
        name: 'Task Failure Cascade',
        description: 'Detects rapid succession of task failures',
        pattern: 'task_failure_rate',
        severity: 'critical',
        category: 'task',
        predictive: true,
        threshold: 0.5,
        windowMs: 60000, // 1 minute
        action: 'pause_task_execution'
      },
      {
        id: 'network-partition',
        name: 'Network Partition Detection',
        description: 'Detects network connectivity issues',
        pattern: 'network_connectivity_loss',
        severity: 'high',
        category: 'network',
        predictive: true,
        threshold: 0.7,
        windowMs: 30000, // 30 seconds
        action: 'enable_fallback_mode'
      },
      {
        id: 'performance-degradation',
        name: 'Performance Degradation',
        description: 'Detects declining system performance',
        pattern: 'response_time_increase',
        severity: 'medium',
        category: 'performance',
        predictive: true,
        threshold: 2.0, // 2x increase
        windowMs: 120000, // 2 minutes
        action: 'scale_resources'
      }
    ];

    defaultPatterns.forEach(pattern => {
      this.errorPatterns.set(pattern.id, pattern);
    });
  }

  private startMonitoring(): void {
    this.monitoringTimer = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.analyzeMetrics();
        await this.checkErrorPatterns();
        await this.predictiveAnalysis();
      } catch (error) {
        this.logger.error('Error in monitoring cycle', { error });
      }
    }, this.config.monitoring.intervalMs);
  }

  private startAnomalyDetection(): void {
    if (!this.config.anomaly.enabled) {
      return;
    }

    // Anomaly detection runs in parallel with monitoring
    setInterval(async () => {
      try {
        const anomalies = await this.anomalyDetector.detectAnomalies(this.metrics);
        for (const anomaly of anomalies) {
          await this.handleAnomaly(anomaly);
        }
      } catch (error) {
        this.logger.error('Error in anomaly detection', { error });
      }
    }, this.config.monitoring.intervalMs * 2); // Less frequent
  }

  private async collectMetrics(): Promise<void> {
    const metrics: HealthMetrics = {
      timestamp: new Date(),
      cpu: await this.getCpuUsage(),
      memory: await this.getMemoryUsage(),
      disk: await this.getDiskUsage(),
      network: await this.getNetworkLatency(),
      agentHealth: await this.getAgentHealth(),
      taskSuccessRate: await this.getTaskSuccessRate(),
      responseTime: await this.getAverageResponseTime(),
      errorRate: await this.getErrorRate(),
      activeConnections: await this.getActiveConnections(),
      queueSize: await this.getQueueSize()
    };

    this.metrics.push(metrics);

    // Keep only recent metrics
    const cutoff = Date.now() - this.config.monitoring.retentionMs;
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);

    // Store in Redis for swarm coordination
    await this.redis.setEx(
      `swarm:error-recovery-final:metrics:latest`,
      300,
      JSON.stringify(metrics)
    );

    // Store in time series for historical analysis
    await this.redis.zAdd(
      `swarm:error-recovery-final:metrics:timeseries`,
      {
        score: metrics.timestamp.getTime(),
        value: JSON.stringify(metrics)
      }
    );

    // Cleanup old time series data
    await this.redis.zRemRangeByScore(
      `swarm:error-recovery-final:metrics:timeseries`,
      0,
      cutoff
    );
  }

  private async analyzeMetrics(): Promise<void> {
    if (this.metrics.length < 10) {
      return; // Need sufficient data for analysis
    }

    const latest = this.metrics[this.metrics.length - 1];
    const detectedErrors: DetectedError[] = [];

    // Check against thresholds
    for (const [threshold, value] of Object.entries(this.config.thresholds)) {
      const metricValue = this.getMetricValue(latest, threshold);
      if (metricValue > value) {
        detectedErrors.push({
          id: `threshold-${threshold}-${Date.now()}`,
          type: 'threshold_exceeded',
          severity: this.getSeverity(threshold, metricValue, value),
          category: this.getCategory(threshold),
          message: `${threshold} threshold exceeded: ${metricValue} > ${value}`,
          timestamp: new Date(),
          source: 'advanced_error_detection',
          context: { threshold, value: metricValue, limit: value },
          predictive: false,
          confidence: 1.0,
          metrics: latest
        });
      }
    }

    // Process detected errors
    for (const error of detectedErrors) {
      await this.handleDetectedError(error);
    }
  }

  private async checkErrorPatterns(): Promise<void> {
    const recentMetrics = this.metrics.slice(-20); // Last 20 samples
    const detectedErrors: DetectedError[] = [];

    for (const [id, pattern] of this.errorPatterns) {
      const matches = await this.matchPattern(pattern, recentMetrics);
      for (const match of matches) {
        detectedErrors.push({
          id: `pattern-${id}-${Date.now()}`,
          type: pattern.name,
          severity: pattern.severity,
          category: pattern.category,
          message: `Pattern detected: ${pattern.description}`,
          timestamp: new Date(),
          source: 'pattern_matching',
          context: { patternId: id, match },
          predictive: pattern.predictive,
          confidence: match.confidence || 0.8,
          metrics: recentMetrics[recentMetrics.length - 1],
          pattern,
          recommendedAction: pattern.action
        });
      }
    }

    for (const error of detectedErrors) {
      await this.handleDetectedError(error);
    }
  }

  private async predictiveAnalysis(): Promise<void> {
    if (!this.config.earlyWarning.enabled) {
      return;
    }

    const warnings = await this.predictiveEngine.predictErrors(this.metrics);
    for (const warning of warnings) {
      await this.handleEarlyWarning(warning);
    }
  }

  private async handleDetectedError(error: DetectedError): Promise<void> {
    this.logger.warn('Error detected', {
      id: error.id,
      type: error.type,
      severity: error.severity,
      predictive: error.predictive
    });

    // Store in Redis for coordination
    await this.redis.setEx(
      `swarm:error-recovery-final:errors:${error.id}`,
      3600,
      JSON.stringify(error)
    );

    // Publish to swarm channel
    await this.redis.publish(
      'swarm:error-recovery-final',
      JSON.stringify({
        type: 'ERROR_DETECTED',
        data: error,
        timestamp: new Date().toISOString()
      })
    );

    this.emit('errorDetected', error);
  }

  private async handleEarlyWarning(warning: EarlyWarning): Promise<void> {
    this.logger.info('Early warning issued', {
      id: warning.id,
      type: warning.type,
      confidence: warning.confidence
    });

    // Store in Redis
    await this.redis.setEx(
      `swarm:error-recovery-final:warnings:${warning.id}`,
      1800,
      JSON.stringify(warning)
    );

    // Publish to swarm channel
    await this.redis.publish(
      'swarm:error-recovery-final',
      JSON.stringify({
        type: 'EARLY_WARNING',
        data: warning,
        timestamp: new Date().toISOString()
      })
    );

    this.emit('earlyWarning', warning);
  }

  private async handleAnomaly(anomaly: any): Promise<void> {
    this.logger.warn('Anomaly detected', { anomaly });

    // Convert anomaly to detected error format
    const error: DetectedError = {
      id: `anomaly-${Date.now()}`,
      type: 'anomaly',
      severity: this.anomalyDetector.getSeverity(anomaly),
      category: 'system',
      message: `Anomaly detected: ${anomaly.description}`,
      timestamp: new Date(),
      source: 'anomaly_detection',
      context: anomaly,
      predictive: true,
      confidence: anomaly.confidence,
      metrics: this.metrics[this.metrics.length - 1]
    };

    await this.handleDetectedError(error);
  }

  // Helper methods for metric collection
  private async getCpuUsage(): Promise<number> {
    // Implementation would collect actual CPU usage
    return Math.random() * 100;
  }

  private async getMemoryUsage(): Promise<number> {
    // Implementation would collect actual memory usage
    return Math.random() * 100;
  }

  private async getDiskUsage(): Promise<number> {
    // Implementation would collect actual disk usage
    return Math.random() * 100;
  }

  private async getNetworkLatency(): Promise<number> {
    // Implementation would measure network latency
    return Math.random() * 1000;
  }

  private async getAgentHealth(): Promise<number> {
    // Implementation would check agent health status
    return Math.random();
  }

  private async getTaskSuccessRate(): Promise<number> {
    // Implementation would calculate task success rate
    return Math.random();
  }

  private async getAverageResponseTime(): Promise<number> {
    // Implementation would calculate average response time
    return Math.random() * 5000;
  }

  private async getErrorRate(): Promise<number> {
    // Implementation would calculate error rate
    return Math.random() * 10;
  }

  private async getActiveConnections(): Promise<number> {
    // Implementation would count active connections
    return Math.floor(Math.random() * 100);
  }

  private async getQueueSize(): Promise<number> {
    // Implementation would get queue size
    return Math.floor(Math.random() * 1000);
  }

  // Helper methods for analysis
  private getMetricValue(metrics: HealthMetrics, threshold: string): number {
    const mapping: Record<string, keyof HealthMetrics> = {
      errorRate: 'errorRate',
      responseTime: 'responseTime',
      memoryUsage: 'memory',
      cpuUsage: 'cpu',
      agentFailureRate: 'agentHealth'
    };

    const key = mapping[threshold];
    return key ? metrics[key] as number : 0;
  }

  private getSeverity(threshold: string, value: number, limit: number): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = value / limit;
    if (ratio > 2.0) return 'critical';
    if (ratio > 1.5) return 'high';
    if (ratio > 1.2) return 'medium';
    return 'low';
  }

  private getCategory(threshold: string): string {
    if (threshold.includes('memory')) return 'memory';
    if (threshold.includes('cpu')) return 'performance';
    if (threshold.includes('agent')) return 'agent';
    if (threshold.includes('network')) return 'network';
    return 'system';
  }

  private async matchPattern(pattern: ErrorPattern, metrics: HealthMetrics[]): Promise<any[]> {
    const matches: any[] = [];

    if (typeof pattern.pattern === 'string') {
      // Built-in pattern matching
      switch (pattern.pattern) {
        case 'memory_increase_trend':
          matches.push(...this.detectMemoryIncreaseTrend(metrics, pattern));
          break;
        case 'task_failure_rate':
          matches.push(...this.detectTaskFailureRate(metrics, pattern));
          break;
        case 'network_connectivity_loss':
          matches.push(...this.detectNetworkConnectivityLoss(metrics, pattern));
          break;
        case 'response_time_increase':
          matches.push(...this.detectResponseTimeIncrease(metrics, pattern));
          break;
        default:
          // Unknown pattern
          break;
      }
    } else if (pattern.pattern instanceof Function) {
      // Custom pattern function
      const result = pattern.pattern(metrics);
      if (result) {
        matches.push(result);
      }
    }

    return matches;
  }

  private detectMemoryIncreaseTrend(metrics: HealthMetrics[], pattern: ErrorPattern): any[] {
    if (metrics.length < 10) return [];

    const recent = metrics.slice(-10);
    const memoryValues = recent.map(m => m.memory);

    // Calculate trend
    let increasing = 0;
    for (let i = 1; i < memoryValues.length; i++) {
      if (memoryValues[i] > memoryValues[i - 1]) {
        increasing++;
      }
    }

    const trendRatio = increasing / (memoryValues.length - 1);

    if (trendRatio > (pattern.threshold || 0.8)) {
      return [{
        confidence: trendRatio,
        details: { trendRatio, values: memoryValues }
      }];
    }

    return [];
  }

  private detectTaskFailureRate(metrics: HealthMetrics[], pattern: ErrorPattern): any[] {
    // Implementation would detect task failure patterns
    return [];
  }

  private detectNetworkConnectivityLoss(metrics: HealthMetrics[], pattern: ErrorPattern): any[] {
    // Implementation would detect network connectivity issues
    return [];
  }

  private detectResponseTimeIncrease(metrics: HealthMetrics[], pattern: ErrorPattern): any[] {
    if (metrics.length < 5) return [];

    const recent = metrics.slice(-5);
    const avgResponseTime = recent.reduce((sum, m) => sum + m.responseTime, 0) / recent.length;
    const baseline = metrics[0].responseTime;

    const ratio = avgResponseTime / baseline;

    if (ratio > (pattern.threshold || 2.0)) {
      return [{
        confidence: Math.min(ratio / 3.0, 1.0),
        details: { ratio, baseline, current: avgResponseTime }
      }];
    }

    return [];
  }

  // Public API methods
  async getCurrentMetrics(): Promise<HealthMetrics | null> {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  async getDetectedErrors(limit: number = 50): Promise<DetectedError[]> {
    const keys = await this.redis.keys('swarm:error-recovery-final:errors:*');
    const errors: DetectedError[] = [];

    for (const key of keys.slice(-limit)) {
      const error = await this.redis.get(key);
      if (error) {
        errors.push(JSON.parse(error));
      }
    }

    return errors.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getEarlyWarnings(limit: number = 20): Promise<EarlyWarning[]> {
    const keys = await this.redis.keys('swarm:error-recovery-final:warnings:*');
    const warnings: EarlyWarning[] = [];

    for (const key of keys.slice(-limit)) {
      const warning = await this.redis.get(key);
      if (warning) {
        warnings.push(JSON.parse(warning));
      }
    }

    return warnings.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async addErrorPattern(pattern: ErrorPattern): Promise<void> {
    this.errorPatterns.set(pattern.id, pattern);
    this.logger.info('Error pattern added', { id: pattern.id, name: pattern.name });
  }

  async removeErrorPattern(patternId: string): Promise<void> {
    this.errorPatterns.delete(patternId);
    this.logger.info('Error pattern removed', { id: patternId });
  }

  async updateThresholds(thresholds: Partial<typeof this.config.thresholds>): Promise<void> {
    this.config.thresholds = { ...this.config.thresholds, ...thresholds };
    this.logger.info('Thresholds updated', { thresholds });
  }
}

class AnomalyDetector {
  private config: AnomalyDetectionConfig;

  constructor(config: AnomalyDetectionConfig) {
    this.config = config;
  }

  async detectAnomalies(metrics: HealthMetrics[]): Promise<any[]> {
    if (!this.config.enabled || metrics.length < this.config.windowSize) {
      return [];
    }

    const anomalies: any[] = [];
    const recentMetrics = metrics.slice(-this.config.windowSize);

    for (const algorithm of this.config.algorithms) {
      switch (algorithm) {
        case 'statistical':
          anomalies.push(...this.statisticalAnomalyDetection(recentMetrics));
          break;
        case 'threshold':
          anomalies.push(...this.thresholdAnomalyDetection(recentMetrics));
          break;
        case 'trend':
          anomalies.push(...this.trendAnomalyDetection(recentMetrics));
          break;
        case 'ml-based':
          anomalies.push(...this.mlAnomalyDetection(recentMetrics));
          break;
      }
    }

    return anomalies;
  }

  private statisticalAnomalyDetection(metrics: HealthMetrics[]): any[] {
    // Implementation of statistical anomaly detection (e.g., Z-score)
    return [];
  }

  private thresholdAnomalyDetection(metrics: HealthMetrics[]): any[] {
    // Implementation of threshold-based anomaly detection
    return [];
  }

  private trendAnomalyDetection(metrics: HealthMetrics[]): any[] {
    // Implementation of trend-based anomaly detection
    return [];
  }

  private mlAnomalyDetection(metrics: HealthMetrics[]): any[] {
    // Implementation of ML-based anomaly detection
    return [];
  }

  getSeverity(anomaly: any): 'low' | 'medium' | 'high' | 'critical' {
    return anomaly.severity || 'medium';
  }
}

class PredictiveErrorEngine {
  private logger: ILogger;
  private config: ErrorDetectionConfig;

  constructor(logger: ILogger, config: ErrorDetectionConfig) {
    this.logger = logger;
    this.config = config;
  }

  async predictErrors(metrics: HealthMetrics[]): Promise<EarlyWarning[]> {
    const warnings: EarlyWarning[] = [];

    if (!this.config.earlyWarning.enabled || metrics.length < 20) {
      return warnings;
    }

    // Predict memory issues
    const memoryWarning = this.predictMemoryIssues(metrics);
    if (memoryWarning) warnings.push(memoryWarning);

    // Predict performance degradation
    const performanceWarning = this.predictPerformanceIssues(metrics);
    if (performanceWarning) warnings.push(performanceWarning);

    // Predict agent failures
    const agentWarning = this.predictAgentFailures(metrics);
    if (agentWarning) warnings.push(agentWarning);

    return warnings;
  }

  private predictMemoryIssues(metrics: HealthMetrics[]): EarlyWarning | null {
    const recent = metrics.slice(-10);
    const memoryTrend = this.calculateTrend(recent.map(m => m.memory));

    if (memoryTrend > 0.8) {
      const latest = recent[recent.length - 1];
      const timeToCritical = this.predictTimeToThreshold(latest.memory, memoryTrend, 90);

      return {
        id: `memory-prediction-${Date.now()}`,
        type: 'memory_exhaustion',
        severity: timeToCritical < 300000 ? 'critical' : 'high', // 5 minutes
        message: `Memory usage trending upward, predicted exhaustion in ${Math.round(timeToCritical / 60000)} minutes`,
        timestamp: new Date(),
        predictedTime: new Date(Date.now() + timeToCritical),
        confidence: Math.min(memoryTrend, 0.95),
        metrics: latest,
        recommendedActions: [
          'Monitor memory usage closely',
          'Consider component restart',
          'Scale up memory resources'
        ],
        affectedComponents: ['system', 'agents']
      };
    }

    return null;
  }

  private predictPerformanceIssues(metrics: HealthMetrics[]): EarlyWarning | null {
    const recent = metrics.slice(-10);
    const responseTimeTrend = this.calculateTrend(recent.map(m => m.responseTime));

    if (responseTimeTrend > 0.6) {
      const latest = recent[recent.length - 1];

      return {
        id: `performance-prediction-${Date.now()}`,
        type: 'performance_degradation',
        severity: 'medium',
        message: `Response times degrading, potential performance issues`,
        timestamp: new Date(),
        predictedTime: new Date(Date.now() + 600000), // 10 minutes
        confidence: responseTimeTrend,
        metrics: latest,
        recommendedActions: [
          'Monitor response times',
          'Check system resources',
          'Consider scaling horizontally'
        ],
        affectedComponents: ['system', 'tasks']
      };
    }

    return null;
  }

  private predictAgentFailures(metrics: HealthMetrics[]): EarlyWarning | null {
    const recent = metrics.slice(-10);
    const agentHealthTrend = this.calculateTrend(recent.map(m => m.agentHealth));

    if (agentHealthTrend < -0.5) { // Declining health
      const latest = recent[recent.length - 1];

      return {
        id: `agent-failure-prediction-${Date.now()}`,
        type: 'agent_failure',
        severity: latest.agentHealth < 0.3 ? 'high' : 'medium',
        message: `Agent health declining, potential failures imminent`,
        timestamp: new Date(),
        predictedTime: new Date(Date.now() + 300000), // 5 minutes
        confidence: Math.abs(agentHealthTrend),
        metrics: latest,
        recommendedActions: [
          'Check agent status',
          'Review agent logs',
          'Prepare agent restart procedures'
        ],
        affectedComponents: ['agents']
      };
    }

    return null;
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    // Simple linear regression to calculate trend
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;

    // Normalize slope by average value
    return avgY > 0 ? slope / avgY : 0;
  }

  private predictTimeToThreshold(currentValue: number, trend: number, threshold: number): number {
    if (trend <= 0) return Infinity;

    const distance = threshold - currentValue;
    return distance > 0 ? (distance / trend) * 1000 : 0; // Convert to milliseconds
  }
}