/**
 * Recovery Monitoring and Reporting System
 * Comprehensive tracking, analysis, and reporting of recovery operations
 */

import { EventEmitter } from 'node:events';
import { createClient, RedisClientType } from 'redis';
import type { ILogger } from '../../core/logger.js';
import type { DetectedError, EarlyWarning } from './advanced-error-detection.js';
import type { RecoveryWorkflow } from './automated-recovery-workflows.js';
import type { CircuitBreakerMetrics } from './resilience-architecture.js';

export interface RecoveryMetrics {
  timestamp: Date;
  errorDetection: {
    totalErrors: number;
    errorsBySeverity: Record<string, number>;
    errorsByCategory: Record<string, number>;
    predictiveAccuracy: number;
    detectionLatency: number;
  };
  recoveryWorkflows: {
    totalWorkflows: number;
    successRate: number;
    averageRecoveryTime: number;
    workflowsByStrategy: Record<string, number>;
    averageConfidence: number;
  };
  systemHealth: {
    availability: number;
    uptime: number;
    performanceScore: number;
    resilienceScore: number;
  };
  circuitBreakers: {
    totalBreakers: number;
    openBreakers: number;
    averageFailureRate: number;
    averageResponseTime: number;
  };
  failover: {
    failoverCount: number;
    failbackCount: number;
    averageFailoverTime: number;
    failoverSuccessRate: number;
  };
}

export interface RecoveryReport {
  id: string;
  type: 'daily' | 'weekly' | 'monthly' | 'incident' | 'custom';
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalErrors: number;
    criticalIncidents: number;
    recoverySuccessRate: number;
    systemAvailability: number;
    mttr: number; // Mean Time To Recovery
    mtbf: number; // Mean Time Between Failures
  };
  trends: {
    errorTrend: 'improving' | 'stable' | 'degrading';
    performanceTrend: 'improving' | 'stable' | 'degrading';
    resilienceTrend: 'improving' | 'stable' | 'degrading';
  };
  recommendations: Recommendation[];
  detailedMetrics: RecoveryMetrics;
  incidents: Incident[];
}

export interface Recommendation {
  id: string;
  type: 'preventive' | 'corrective' | 'optimization';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  rationale: string;
  expectedImpact: string;
  effort: 'low' | 'medium' | 'high';
  dependencies: string[];
}

export interface Incident {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  description: string;
  detection: {
    method: string;
    latency: number;
    confidence: number;
  };
  recovery: {
    workflowId?: string;
    strategy?: string;
    duration: number;
    success: boolean;
    attempts: number;
  };
  impact: {
    affectedComponents: string[];
    downtime: number;
    userImpact: string;
    businessImpact: string;
  };
  rootCause?: string;
  lessons: string[];
  prevention: string[];
}

export interface Alert {
  id: string;
  type: 'threshold' | 'anomaly' | 'trend' | 'pattern' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  source: string;
  metrics: Record<string, number>;
  thresholds?: Record<string, number>;
  acknowledged: boolean;
  resolved: boolean;
  resolvedAt?: Date;
  actions: AlertAction[];
}

export interface AlertAction {
  type: 'notify' | 'escalate' | 'automated_recovery' | 'manual_intervention';
  description: string;
  executed: boolean;
  executedAt?: Date;
  result?: string;
}

export interface MonitoringConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    database?: number;
  };
  metrics: {
    collectionInterval: number;
    retentionDays: number;
    aggregationInterval: number;
    batchSize: number;
  };
  reporting: {
    enabled: boolean;
    schedules: ReportSchedule[];
    formats: ('json' | 'html' | 'pdf' | 'csv')[];
    recipients: string[];
    storage: {
      type: 'file' | 's3' | 'database';
      location: string;
      retention: number;
    };
  };
  alerts: {
    enabled: boolean;
    rules: AlertRule[];
    channels: AlertChannel[];
    escalation: EscalationPolicy;
  };
  dashboard: {
    enabled: boolean;
    refreshInterval: number;
    dataRetention: number;
  };
}

export interface ReportSchedule {
  type: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  enabled: boolean;
  recipients: string[];
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldown: number;
  actions: string[];
}

export interface AlertChannel {
  id: string;
  type: 'email' | 'slack' | 'webhook' | 'sms' | 'pagerduty';
  name: string;
  config: Record<string, any>;
  enabled: boolean;
}

export interface EscalationPolicy {
  enabled: boolean;
  levels: EscalationLevel[];
}

export interface EscalationLevel {
  level: number;
  delay: number;
  channels: string[];
  conditions: string[];
}

export class RecoveryMonitoring extends EventEmitter {
  private redis: RedisClientType;
  private logger: ILogger;
  private config: MonitoringConfig;
  private isRunning = false;
  private metrics: RecoveryMetrics[] = [];
  private incidents: Incident[] = [];
  private alerts: Alert[] = [];
  private monitoringTimer?: NodeJS.Timeout;
  private reportingTimer?: NodeJS.Timeout;
  private alertProcessor: AlertProcessor;
  private reportGenerator: ReportGenerator;
  private trendAnalyzer: TrendAnalyzer;

  constructor(logger: ILogger, config: MonitoringConfig) {
    super();
    this.logger = logger;
    this.config = config;
    this.redis = createClient(config.redis);
    this.alertProcessor = new AlertProcessor(logger, config.alerts);
    this.reportGenerator = new ReportGenerator(logger, config.reporting);
    this.trendAnalyzer = new TrendAnalyzer();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      await this.redis.connect();
      await this.loadHistoricalData();

      this.logger.info('Recovery monitoring started', {
        collectionInterval: this.config.metrics.collectionInterval,
        reportingEnabled: this.config.reporting.enabled,
        alertsEnabled: this.config.alerts.enabled
      });

      this.isRunning = true;
      this.startMetricsCollection();
      this.startReporting();
      this.startAlertProcessing();

      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start recovery monitoring', { error });
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

    if (this.reportingTimer) {
      clearInterval(this.reportingTimer);
    }

    await this.saveHistoricalData();
    await this.redis.disconnect();

    this.emit('stopped');
    this.logger.info('Recovery monitoring stopped');
  }

  private startMetricsCollection(): void {
    this.monitoringTimer = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.analyzeMetrics();
        await this.checkAlerts();
      } catch (error) {
        this.logger.error('Error in metrics collection', { error });
      }
    }, this.config.metrics.collectionInterval);
  }

  private startReporting(): void {
    if (!this.config.reporting.enabled) {
      return;
    }

    this.reportingTimer = setInterval(async () => {
      try {
        await this.generateScheduledReports();
      } catch (error) {
        this.logger.error('Error in scheduled reporting', { error });
      }
    }, 60 * 60 * 1000); // Check every hour
  }

  private startAlertProcessing(): void {
    if (!this.config.alerts.enabled) {
      return;
    }

    this.alertProcessor.on('alert', (alert) => {
      this.handleAlert(alert);
    });

    this.alertProcessor.start();
  }

  async recordErrorDetection(error: DetectedError | EarlyWarning): Promise<void> {
    const metrics: RecoveryMetrics = await this.getCurrentMetrics();

    metrics.errorDetection.totalErrors++;
    metrics.errorDetection.errorsBySeverity[error.severity] =
      (metrics.errorDetection.errorsBySeverity[error.severity] || 0) + 1;
    metrics.errorDetection.errorsByCategory[error.category] =
      (metrics.errorDetection.errorsByCategory[error.category] || 0) + 1;

    // Calculate detection latency
    const detectionLatency = Date.now() - error.timestamp.getTime();
    metrics.errorDetection.detectionLatency =
      (metrics.errorDetection.detectionLatency + detectionLatency) / 2;

    // Update predictive accuracy
    if ('predictive' in error && error.predictive) {
      metrics.errorDetection.predictiveAccuracy =
        this.calculatePredictiveAccuracy(error);
    }

    await this.saveMetrics(metrics);

    this.emit('errorDetected', { error, metrics });
  }

  async recordRecoveryWorkflow(workflow: RecoveryWorkflow): Promise<void> {
    const metrics = await this.getCurrentMetrics();

    metrics.recoveryWorkflows.totalWorkflows++;

    if (workflow.success) {
      const currentSuccessRate = metrics.recoveryWorkflows.successRate;
      metrics.recoveryWorkflows.successRate =
        ((currentSuccessRate * (metrics.recoveryWorkflows.totalWorkflows - 1)) + 1) /
        metrics.recoveryWorkflows.totalWorkflows;
    }

    // Update average recovery time
    if (workflow.actualDuration) {
      metrics.recoveryWorkflows.averageRecoveryTime =
        (metrics.recoveryWorkflows.averageRecoveryTime + workflow.actualDuration) / 2;
    }

    // Update strategy usage
    const strategyId = workflow.strategy.id;
    metrics.recoveryWorkflows.workflowsByStrategy[strategyId] =
      (metrics.recoveryWorkflows.workflowsByStrategy[strategyId] || 0) + 1;

    // Update average confidence
    const avgConfidence = workflow.attempts.reduce((sum, attempt) => sum + attempt.confidence, 0) /
                         workflow.attempts.length;
    metrics.recoveryWorkflows.averageConfidence =
      (metrics.recoveryWorkflows.averageConfidence + avgConfidence) / 2;

    await this.saveMetrics(metrics);

    // Create incident if critical
    if (workflow.context.severity === 'critical') {
      await this.createIncidentFromWorkflow(workflow);
    }

    this.emit('workflowCompleted', { workflow, metrics });
  }

  async recordCircuitBreakerMetrics(breakerName: string, metrics: CircuitBreakerMetrics): Promise<void> {
    const currentMetrics = await this.getCurrentMetrics();

    currentMetrics.circuitBreakers.totalBreakers = Math.max(
      currentMetrics.circuitBreakers.totalBreakers,
      this.circuitBreakerCount
    );

    if (metrics.state === 'open') {
      currentMetrics.circuitBreakers.openBreakers++;
    }

    currentMetrics.circuitBreakers.averageFailureRate =
      (currentMetrics.circuitBreakers.averageFailureRate + metrics.failureRate) / 2;

    currentMetrics.circuitBreakers.averageResponseTime =
      (currentMetrics.circuitBreakers.averageResponseTime + metrics.averageResponseTime) / 2;

    await this.saveMetrics(currentMetrics);

    this.emit('circuitBreakerUpdate', { breakerName, metrics });
  }

  async recordSystemHealth(health: {
    availability: number;
    uptime: number;
    performanceScore: number;
    resilienceScore: number;
  }): Promise<void> {
    const metrics = await this.getCurrentMetrics();

    metrics.systemHealth.availability = health.availability;
    metrics.systemHealth.uptime = health.uptime;
    metrics.systemHealth.performanceScore = health.performanceScore;
    metrics.systemHealth.resilienceScore = health.resilienceScore;

    await this.saveMetrics(metrics);

    this.emit('systemHealthUpdate', { health, metrics });
  }

  private async collectMetrics(): Promise<void> {
    const metrics: RecoveryMetrics = {
      timestamp: new Date(),
      errorDetection: {
        totalErrors: 0,
        errorsBySeverity: {},
        errorsByCategory: {},
        predictiveAccuracy: 0,
        detectionLatency: 0
      },
      recoveryWorkflows: {
        totalWorkflows: 0,
        successRate: 0,
        averageRecoveryTime: 0,
        workflowsByStrategy: {},
        averageConfidence: 0
      },
      systemHealth: {
        availability: 0,
        uptime: 0,
        performanceScore: 0,
        resilienceScore: 0
      },
      circuitBreakers: {
        totalBreakers: 0,
        openBreakers: 0,
        averageFailureRate: 0,
        averageResponseTime: 0
      },
      failover: {
        failoverCount: 0,
        failbackCount: 0,
        averageFailoverTime: 0,
        failoverSuccessRate: 0
      }
    };

    // Collect from Redis
    const errorMetrics = await this.redis.get('swarm:error-recovery-final:metrics:errors');
    const workflowMetrics = await this.redis.get('swarm:error-recovery-final:metrics:workflows');
    const systemMetrics = await this.redis.get('swarm:error-recovery-final:metrics:system');

    if (errorMetrics) {
      Object.assign(metrics.errorDetection, JSON.parse(errorMetrics));
    }

    if (workflowMetrics) {
      Object.assign(metrics.recoveryWorkflows, JSON.parse(workflowMetrics));
    }

    if (systemMetrics) {
      Object.assign(metrics.systemHealth, JSON.parse(systemMetrics));
    }

    this.metrics.push(metrics);

    // Keep only recent metrics
    const cutoff = Date.now() - (this.config.metrics.retentionDays * 24 * 60 * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);

    // Store in Redis
    await this.redis.setEx(
      `swarm:error-recovery-final:monitoring:metrics:${metrics.timestamp.getTime()}`,
      this.config.metrics.retentionDays * 24 * 60 * 60,
      JSON.stringify(metrics)
    );
  }

  private async analyzeMetrics(): Promise<void> {
    if (this.metrics.length < 10) {
      return; // Need sufficient data for analysis
    }

    const recentMetrics = this.metrics.slice(-24); // Last 24 data points
    const trends = this.trendAnalyzer.analyzeTrends(recentMetrics);

    // Check for significant trends that might indicate issues
    if (trends.errorTrend === 'degrading' && trends.errorRate > 0.1) {
      await this.createAlert({
        type: 'trend',
        severity: 'high',
        title: 'Error Rate Increasing',
        description: `Error rate has increased by ${trends.errorRateChange.toFixed(1)}% in the last period`,
        metrics: { errorRate: trends.errorRate, errorRateChange: trends.errorRateChange }
      });
    }

    if (trends.performanceTrend === 'degrading' && trends.performanceDegradation > 0.2) {
      await this.createAlert({
        type: 'trend',
        severity: 'medium',
        title: 'Performance Degradation',
        description: `System performance has degraded by ${(trends.performanceDegradation * 100).toFixed(1)}%`,
        metrics: { performanceScore: trends.currentPerformance, degradation: trends.performanceDegradation }
      });
    }

    if (trends.resilienceTrend === 'degrading' && trends.resilienceScore < 0.7) {
      await this.createAlert({
        type: 'trend',
        severity: 'high',
        title: 'Resilience Score Declining',
        description: `System resilience has declined to ${(trends.resilienceScore * 100).toFixed(1)}%`,
        metrics: { resilienceScore: trends.resilienceScore }
      });
    }
  }

  private async checkAlerts(): Promise<void> {
    if (!this.config.alerts.enabled) {
      return;
    }

    const metrics = await this.getCurrentMetrics();

    for (const rule of this.config.alerts.rules) {
      if (!rule.enabled) {
        continue;
      }

      try {
        const shouldAlert = await this.evaluateAlertRule(rule, metrics);
        if (shouldAlert) {
          await this.createAlert({
            type: 'threshold',
            severity: rule.severity,
            title: rule.name,
            description: rule.description,
            thresholds: { [rule.condition]: rule.threshold },
            metrics: this.extractRelevantMetrics(rule.condition, metrics)
          });
        }
      } catch (error) {
        this.logger.error('Error evaluating alert rule', { ruleId: rule.id, error });
      }
    }
  }

  private async evaluateAlertRule(rule: AlertRule, metrics: RecoveryMetrics): Promise<boolean> {
    const value = this.getMetricValue(rule.condition, metrics);
    return value > rule.threshold;
  }

  private getMetricValue(condition: string, metrics: RecoveryMetrics): number {
    const mapping: Record<string, (m: RecoveryMetrics) => number> = {
      'errorRate': (m) => m.errorDetection.totalErrors / Math.max(m.recoveryWorkflows.totalWorkflows, 1),
      'recoverySuccessRate': (m) => m.recoveryWorkflows.successRate,
      'systemAvailability': (m) => m.systemHealth.availability,
      'circuitBreakerFailureRate': (m) => m.circuitBreakers.averageFailureRate,
      'averageRecoveryTime': (m) => m.recoveryWorkflows.averageRecoveryTime
    };

    const getter = mapping[condition];
    return getter ? getter(metrics) : 0;
  }

  private extractRelevantMetrics(condition: string, metrics: RecoveryMetrics): Record<string, number> {
    const relevant: Record<string, number> = {};

    switch (condition) {
      case 'errorRate':
        relevant.errorRate = this.getMetricValue(condition, metrics);
        relevant.totalErrors = metrics.errorDetection.totalErrors;
        break;
      case 'recoverySuccessRate':
        relevant.recoverySuccessRate = metrics.recoveryWorkflows.successRate;
        relevant.totalWorkflows = metrics.recoveryWorkflows.totalWorkflows;
        break;
      case 'systemAvailability':
        relevant.systemAvailability = metrics.systemHealth.availability;
        relevant.uptime = metrics.systemHealth.uptime;
        break;
      case 'circuitBreakerFailureRate':
        relevant.circuitBreakerFailureRate = metrics.circuitBreakers.averageFailureRate;
        relevant.openBreakers = metrics.circuitBreakers.openBreakers;
        break;
      case 'averageRecoveryTime':
        relevant.averageRecoveryTime = metrics.recoveryWorkflows.averageRecoveryTime;
        break;
    }

    return relevant;
  }

  private async createAlert(alertData: Partial<Alert>): Promise<void> {
    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: alertData.type || 'system',
      severity: alertData.severity || 'medium',
      title: alertData.title || 'System Alert',
      description: alertData.description || 'System alert triggered',
      timestamp: new Date(),
      source: 'recovery-monitoring',
      metrics: alertData.metrics || {},
      thresholds: alertData.thresholds,
      acknowledged: false,
      resolved: false,
      actions: []
    };

    this.alerts.push(alert);

    // Store in Redis
    await this.redis.setEx(
      `swarm:error-recovery-final:alerts:${alert.id}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify(alert)
    );

    // Process alert through alert processor
    await this.alertProcessor.processAlert(alert);

    this.emit('alertCreated', alert);
  }

  private async handleAlert(alert: Alert): Promise<void> {
    this.logger.warn('Alert triggered', {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title
    });

    // Publish to swarm channel
    await this.redis.publish(
      'swarm:error-recovery-final',
      JSON.stringify({
        type: 'ALERT',
        data: alert,
        timestamp: new Date().toISOString()
      })
    );
  }

  private async createIncidentFromWorkflow(workflow: RecoveryWorkflow): Promise<void> {
    const incident: Incident = {
      id: `incident-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: workflow.createdAt,
      severity: workflow.context.severity,
      category: workflow.context.category,
      title: `Recovery Incident: ${workflow.strategy.name}`,
      description: `Recovery workflow executed for ${workflow.context.errorType}`,
      detection: {
        method: 'automated',
        latency: 0, // Would calculate from error detection to workflow start
        confidence: workflow.attempts[0]?.confidence || 0
      },
      recovery: {
        workflowId: workflow.id,
        strategy: workflow.strategy.id,
        duration: workflow.actualDuration || 0,
        success: workflow.success,
        attempts: workflow.attempts.length
      },
      impact: {
        affectedComponents: workflow.context.affectedComponents,
        downtime: workflow.actualDuration || 0,
        userImpact: 'Service temporarily unavailable',
        businessImpact: 'Reduced system availability'
      },
      lessons: [],
      prevention: []
    };

    this.incidents.push(incident);

    // Store in Redis
    await this.redis.setEx(
      `swarm:error-recovery-final:incidents:${incident.id}`,
      30 * 24 * 60 * 60, // 30 days
      JSON.stringify(incident)
    );

    this.emit('incidentCreated', incident);
  }

  private async generateScheduledReports(): Promise<void> {
    if (!this.config.reporting.enabled) {
      return;
    }

    for (const schedule of this.config.reporting.schedules) {
      if (!schedule.enabled) {
        continue;
      }

      if (this.shouldGenerateReport(schedule)) {
        await this.generateReport(schedule.type, schedule.recipients);
      }
    }
  }

  private shouldGenerateReport(schedule: ReportSchedule): boolean {
    const now = new Date();
    const [hours, minutes] = schedule.time.split(':').map(Number);

    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    // Check if we're within 1 minute of the scheduled time
    const diffMinutes = Math.abs(now.getTime() - scheduledTime.getTime()) / (1000 * 60);

    if (diffMinutes > 1) {
      return false;
    }

    // Check frequency based on type
    switch (schedule.type) {
      case 'daily':
        return true;
      case 'weekly':
        return now.getDay() === 1; // Monday
      case 'monthly':
        return now.getDate() === 1; // First of month
      default:
        return false;
    }
  }

  private async generateReport(type: 'daily' | 'weekly' | 'monthly', recipients: string[]): Promise<void> {
    const now = new Date();
    let start: Date;

    switch (type) {
      case 'daily':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const report = await this.reportGenerator.generateReport(type, start, now);

    // Send to recipients
    for (const recipient of recipients) {
      await this.sendReport(report, recipient);
    }

    this.emit('reportGenerated', { report, type, recipients });
  }

  private async sendReport(report: RecoveryReport, recipient: string): Promise<void> {
    // Implementation would send report via appropriate channel
    this.logger.info('Report sent', {
      reportId: report.id,
      type: report.type,
      recipient
    });
  }

  private calculatePredictiveAccuracy(error: DetectedError | EarlyWarning): number {
    // Implementation would calculate predictive accuracy
    // For now, return a placeholder
    return 0.85;
  }

  private get circuitBreakerCount(): number {
    // Implementation would get actual circuit breaker count
    return 5;
  }

  private async getCurrentMetrics(): Promise<RecoveryMetrics> {
    if (this.metrics.length > 0) {
      return { ...this.metrics[this.metrics.length - 1] };
    }

    // Return empty metrics if no data available
    return {
      timestamp: new Date(),
      errorDetection: {
        totalErrors: 0,
        errorsBySeverity: {},
        errorsByCategory: {},
        predictiveAccuracy: 0,
        detectionLatency: 0
      },
      recoveryWorkflows: {
        totalWorkflows: 0,
        successRate: 0,
        averageRecoveryTime: 0,
        workflowsByStrategy: {},
        averageConfidence: 0
      },
      systemHealth: {
        availability: 0,
        uptime: 0,
        performanceScore: 0,
        resilienceScore: 0
      },
      circuitBreakers: {
        totalBreakers: 0,
        openBreakers: 0,
        averageFailureRate: 0,
        averageResponseTime: 0
      },
      failover: {
        failoverCount: 0,
        failbackCount: 0,
        averageFailoverTime: 0,
        failoverSuccessRate: 0
      }
    };
  }

  private async saveMetrics(metrics: RecoveryMetrics): Promise<void> {
    await this.redis.setEx(
      `swarm:error-recovery-final:monitoring:current-metrics`,
      300,
      JSON.stringify(metrics)
    );
  }

  private async loadHistoricalData(): Promise<void> {
    // Implementation would load historical data from Redis
  }

  private async saveHistoricalData(): Promise<void> {
    // Implementation would save historical data to Redis
  }

  // Public API methods
  async getMetrics(limit: number = 100): Promise<RecoveryMetrics[]> {
    return this.metrics
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getIncidents(limit: number = 50): Promise<Incident[]> {
    return this.incidents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getAlerts(activeOnly: boolean = false): Promise<Alert[]> {
    let alerts = this.alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (activeOnly) {
      alerts = alerts.filter(alert => !alert.resolved);
    }

    return alerts;
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    alert.actions.push({
      type: 'notify',
      description: 'Alert acknowledged',
      executed: true,
      executedAt: new Date()
    });

    await this.redis.setEx(
      `swarm:error-recovery-final:alerts:${alertId}`,
      7 * 24 * 60 * 60,
      JSON.stringify(alert)
    );

    return true;
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();
    alert.actions.push({
      type: 'notify',
      description: 'Alert resolved',
      executed: true,
      executedAt: new Date()
    });

    await this.redis.setEx(
      `swarm:error-recovery-final:alerts:${alertId}`,
      7 * 24 * 60 * 60,
      JSON.stringify(alert)
    );

    return true;
  }

  async generateCustomReport(
    type: 'daily' | 'weekly' | 'monthly' | 'incident' | 'custom',
    start: Date,
    end: Date
  ): Promise<RecoveryReport> {
    return await this.reportGenerator.generateReport(type, start, end);
  }
}

class AlertProcessor extends EventEmitter {
  private logger: ILogger;
  private config: MonitoringConfig['alerts'];
  private isRunning = false;

  constructor(logger: ILogger, config: MonitoringConfig['alerts']) {
    super();
    this.logger = logger;
    this.config = config;
  }

  start(): void {
    this.isRunning = true;
    this.logger.info('Alert processor started');
  }

  stop(): void {
    this.isRunning = false;
    this.logger.info('Alert processor stopped');
  }

  async processAlert(alert: Alert): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Execute configured actions
      for (const actionId of this.getActionsForAlert(alert)) {
        await this.executeAlertAction(alert, actionId);
      }

      this.emit('alertProcessed', alert);
    } catch (error) {
      this.logger.error('Error processing alert', { alertId: alert.id, error });
    }
  }

  private getActionsForAlert(alert: Alert): string[] {
    // Implementation would determine appropriate actions based on alert severity and type
    const actions: string[] = [];

    if (alert.severity === 'critical') {
      actions.push('immediate_notification', 'escalation');
    } else if (alert.severity === 'high') {
      actions.push('notification', 'automated_recovery');
    } else {
      actions.push('log_only');
    }

    return actions;
  }

  private async executeAlertAction(alert: Alert, actionId: string): Promise<void> {
    // Implementation would execute the specific alert action
    this.logger.info('Executing alert action', {
      alertId: alert.id,
      actionId
    });
  }
}

class ReportGenerator {
  private logger: ILogger;
  private config: MonitoringConfig['reporting'];

  constructor(logger: ILogger, config: MonitoringConfig['reporting']) {
    this.logger = logger;
    this.config = config;
  }

  async generateReport(
    type: 'daily' | 'weekly' | 'monthly' | 'incident' | 'custom',
    start: Date,
    end: Date
  ): Promise<RecoveryReport> {
    const report: RecoveryReport = {
      id: `report-${type}-${Date.now()}`,
      type,
      period: { start, end },
      summary: {
        totalErrors: 0,
        criticalIncidents: 0,
        recoverySuccessRate: 0,
        systemAvailability: 0,
        mttr: 0,
        mtbf: 0
      },
      trends: {
        errorTrend: 'stable',
        performanceTrend: 'stable',
        resilienceTrend: 'stable'
      },
      recommendations: [],
      detailedMetrics: await this.collectMetricsForPeriod(start, end),
      incidents: []
    };

    return report;
  }

  private async collectMetricsForPeriod(start: Date, end: Date): Promise<RecoveryMetrics> {
    // Implementation would collect metrics for the specified period
    return {
      timestamp: new Date(),
      errorDetection: {
        totalErrors: 0,
        errorsBySeverity: {},
        errorsByCategory: {},
        predictiveAccuracy: 0,
        detectionLatency: 0
      },
      recoveryWorkflows: {
        totalWorkflows: 0,
        successRate: 0,
        averageRecoveryTime: 0,
        workflowsByStrategy: {},
        averageConfidence: 0
      },
      systemHealth: {
        availability: 0,
        uptime: 0,
        performanceScore: 0,
        resilienceScore: 0
      },
      circuitBreakers: {
        totalBreakers: 0,
        openBreakers: 0,
        averageFailureRate: 0,
        averageResponseTime: 0
      },
      failover: {
        failoverCount: 0,
        failbackCount: 0,
        averageFailoverTime: 0,
        failoverSuccessRate: 0
      }
    };
  }
}

class TrendAnalyzer {
  analyzeTrends(metrics: RecoveryMetrics[]): {
    errorTrend: 'improving' | 'stable' | 'degrading';
    performanceTrend: 'improving' | 'stable' | 'degrading';
    resilienceTrend: 'improving' | 'stable' | 'degrading';
    errorRate: number;
    errorRateChange: number;
    performanceDegradation: number;
    currentPerformance: number;
    resilienceScore: number;
  } {
    if (metrics.length < 2) {
      return {
        errorTrend: 'stable',
        performanceTrend: 'stable',
        resilienceTrend: 'stable',
        errorRate: 0,
        errorRateChange: 0,
        performanceDegradation: 0,
        currentPerformance: 0,
        resilienceScore: 0
      };
    }

    const recent = metrics.slice(-12); // Last 12 data points
    const older = metrics.slice(-24, -12); // Previous 12 data points

    const recentErrorRate = this.calculateAverageErrorRate(recent);
    const olderErrorRate = this.calculateAverageErrorRate(older);
    const errorRateChange = ((recentErrorRate - olderErrorRate) / olderErrorRate) * 100;

    const recentPerformance = this.calculateAveragePerformance(recent);
    const olderPerformance = this.calculateAveragePerformance(older);
    const performanceDegradation = (olderPerformance - recentPerformance) / olderPerformance;

    const recentResilience = this.calculateAverageResilience(recent);
    const olderResilience = this.calculateAverageResilience(older);
    const resilienceChange = (recentResilience - olderResilience) / olderResilience;

    return {
      errorTrend: this.determineTrend(errorRateChange),
      performanceTrend: this.determineTrend(-performanceDegradation),
      resilienceTrend: this.determineTrend(resilienceChange),
      errorRate: recentErrorRate,
      errorRateChange,
      performanceDegradation,
      currentPerformance: recentPerformance,
      resilienceScore: recentResilience
    };
  }

  private calculateAverageErrorRate(metrics: RecoveryMetrics[]): number {
    const total = metrics.reduce((sum, m) => sum + m.errorDetection.totalErrors, 0);
    const workflows = metrics.reduce((sum, m) => sum + m.recoveryWorkflows.totalWorkflows, 0);
    return workflows > 0 ? total / workflows : 0;
  }

  private calculateAveragePerformance(metrics: RecoveryMetrics[]): number {
    const total = metrics.reduce((sum, m) => sum + m.systemHealth.performanceScore, 0);
    return total / metrics.length;
  }

  private calculateAverageResilience(metrics: RecoveryMetrics[]): number {
    const total = metrics.reduce((sum, m) => sum + m.systemHealth.resilienceScore, 0);
    return total / metrics.length;
  }

  private determineTrend(change: number): 'improving' | 'stable' | 'degrading' {
    if (change > 5) return 'improving';
    if (change < -5) return 'degrading';
    return 'stable';
  }
}