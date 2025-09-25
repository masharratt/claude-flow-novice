/**
 * Phase 4 Rollout Monitoring Dashboard Integration
 * Provides real-time monitoring and alerts for feature flag rollouts
 */

import { FeatureFlagManager, RolloutMetrics } from '../core/FeatureFlagManager.js';
import { TruthBasedValidator } from '../validation/TruthBasedValidator.js';
import { HookInterceptor } from '../validation/HookInterceptor.js';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

export interface DashboardData {
  flags: {
    name: string;
    enabled: boolean;
    rolloutPercentage: number;
    errorRate: number;
    successRate: number;
    userCount: number;
  }[];
  systemHealth: {
    overallStatus: 'healthy' | 'warning' | 'critical';
    totalFlags: number;
    activeRollouts: number;
    avgErrorRate: number;
    avgSuccessRate: number;
  };
  alerts: Alert[];
  performance: {
    responseTime: number;
    throughput: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface Alert {
  id: string;
  type: 'error_threshold' | 'rollback' | 'system_health' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  flagName?: string;
  resolved: boolean;
}

export class RolloutMonitor extends EventEmitter {
  private flagManager: FeatureFlagManager;
  private validator: TruthBasedValidator;
  private interceptor: HookInterceptor;
  private alerts: Map<string, Alert> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metricsHistory: Map<string, RolloutMetrics[]> = new Map();

  constructor(
    flagManager: FeatureFlagManager,
    validator: TruthBasedValidator,
    interceptor: HookInterceptor
  ) {
    super();
    this.flagManager = flagManager;
    this.validator = validator;
    this.interceptor = interceptor;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Monitor flag manager events
    this.flagManager.on('rollback_threshold_exceeded', (data) => {
      this.createAlert('error_threshold', 'critical',
        `Flag ${data.flagName} exceeded error threshold: ${data.errorRate}%`, data.flagName);
    });

    this.flagManager.on('rollback_triggered', (data) => {
      this.createAlert('rollback', 'critical',
        `Emergency rollback triggered for ${data.flagName}: ${data.reason}`, data.flagName);
    });

    // Monitor interceptor events
    this.interceptor.on('auto_relaunch_failed', (data) => {
      this.createAlert('system_health', 'high',
        `Hook auto-relaunch failed after ${data.attempts} attempts`);
    });

    // Monitor validator events
    this.validator.on('validation_error', (data) => {
      this.createAlert('system_health', 'medium',
        `Validation error for task ${data.taskId}: ${data.error}`);
    });
  }

  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.evaluateSystemHealth();
        await this.updateDashboard();
      } catch (error) {
        this.emit('monitoring_error', error);
      }
    }, intervalMs);

    this.emit('monitoring_started', { interval: intervalMs });
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.emit('monitoring_stopped');
    }
  }

  private async collectMetrics(): Promise<void> {
    const flags = this.flagManager.getAllFlags();
    const currentMetrics = this.flagManager.getMetrics();

    for (const metric of currentMetrics) {
      if (!this.metricsHistory.has(metric.flagName)) {
        this.metricsHistory.set(metric.flagName, []);
      }

      const history = this.metricsHistory.get(metric.flagName)!;
      history.push({
        ...metric,
        lastUpdated: new Date().toISOString()
      });

      // Keep only last 100 metrics to prevent memory bloat
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }
    }

    // Save metrics to file for persistence
    await this.saveMetricsToFile();
  }

  private async evaluateSystemHealth(): Promise<void> {
    const metrics = this.flagManager.getMetrics();
    const validatorMetrics = this.validator.getSystemMetrics();
    const interceptorMetrics = this.interceptor.getSystemMetrics();

    // Check error rates
    for (const metric of metrics) {
      if (metric.errorRate > 0.05) { // 5% threshold
        this.createAlert('error_threshold', 'high',
          `High error rate detected for ${metric.flagName}: ${(metric.errorRate * 100).toFixed(2)}%`,
          metric.flagName);
      }
    }

    // Check validator performance
    if (validatorMetrics.avgTruthScore < 0.7) {
      this.createAlert('system_health', 'medium',
        `Low average truth score: ${(validatorMetrics.avgTruthScore * 100).toFixed(2)}%`);
    }

    // Check interceptor performance
    if (interceptorMetrics.runningProcesses > 10) {
      this.createAlert('performance', 'medium',
        `High number of running processes: ${interceptorMetrics.runningProcesses}`);
    }

    // Auto-resolve old alerts
    this.resolveOldAlerts();
  }

  private async updateDashboard(): Promise<void> {
    const dashboardData = await this.generateDashboardData();

    // Write dashboard data to file for web interface
    const dashboardPath = path.join(process.cwd(), 'src/feature-flags/monitoring/dashboard-data.json');
    await fs.writeFile(dashboardPath, JSON.stringify(dashboardData, null, 2));

    this.emit('dashboard_updated', dashboardData);
  }

  async generateDashboardData(): Promise<DashboardData> {
    const flags = this.flagManager.getAllFlags();
    const metrics = this.flagManager.getMetrics();
    const validatorMetrics = this.validator.getSystemMetrics();
    const interceptorMetrics = this.interceptor.getSystemMetrics();

    const flagData = flags.map(flag => {
      const metric = metrics.find(m => m.flagName === flag.name);
      return {
        name: flag.name,
        enabled: flag.enabled,
        rolloutPercentage: flag.rolloutPercentage,
        errorRate: metric?.errorRate || 0,
        successRate: metric?.successRate || 0,
        userCount: metric?.userCount || 0
      };
    });

    const avgErrorRate = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length
      : 0;

    const avgSuccessRate = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.successRate, 0) / metrics.length
      : 0;

    const activeRollouts = flags.filter(f => f.enabled && f.rolloutPercentage < 100).length;

    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    const criticalAlerts = Array.from(this.alerts.values())
      .filter(a => !a.resolved && a.severity === 'critical');
    const highAlerts = Array.from(this.alerts.values())
      .filter(a => !a.resolved && a.severity === 'high');

    if (criticalAlerts.length > 0) {
      overallStatus = 'critical';
    } else if (highAlerts.length > 0 || avgErrorRate > 0.03) {
      overallStatus = 'warning';
    }

    return {
      flags: flagData,
      systemHealth: {
        overallStatus,
        totalFlags: flags.length,
        activeRollouts,
        avgErrorRate,
        avgSuccessRate
      },
      alerts: Array.from(this.alerts.values())
        .filter(a => !a.resolved)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      performance: {
        responseTime: this.calculateAverageResponseTime(),
        throughput: validatorMetrics.totalValidations,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
        cpuUsage: process.cpuUsage().user / 1000000 // Seconds
      }
    };
  }

  private createAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    message: string,
    flagName?: string
  ): void {
    const alertId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const alert: Alert = {
      id: alertId,
      type,
      severity,
      message,
      timestamp: new Date().toISOString(),
      flagName,
      resolved: false
    };

    this.alerts.set(alertId, alert);
    this.emit('alert_created', alert);

    // Auto-escalate critical alerts
    if (severity === 'critical') {
      this.emit('critical_alert', alert);
    }
  }

  private resolveOldAlerts(): void {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    for (const [alertId, alert] of this.alerts) {
      if (!alert.resolved && new Date(alert.timestamp).getTime() < oneHourAgo) {
        if (alert.severity !== 'critical') {
          alert.resolved = true;
          this.emit('alert_resolved', alert);
        }
      }
    }
  }

  private calculateAverageResponseTime(): number {
    // Simplified calculation - in real implementation, this would track actual response times
    const recentMetrics = Array.from(this.metricsHistory.values())
      .flat()
      .slice(-50); // Last 50 metrics

    if (recentMetrics.length === 0) return 0;

    // Simulate response time calculation based on success rates
    const avgSuccessRate = recentMetrics.reduce((sum, m) => sum + m.successRate, 0) / recentMetrics.length;
    return Math.max(50, 200 * (1 - avgSuccessRate)); // 50ms to 200ms range
  }

  private async saveMetricsToFile(): Promise<void> {
    const metricsData = {
      timestamp: new Date().toISOString(),
      flags: Array.from(this.metricsHistory.entries()).map(([flagName, history]) => ({
        flagName,
        history: history.slice(-10) // Keep last 10 entries per flag
      })),
      alerts: Array.from(this.alerts.values())
    };

    const metricsPath = path.join(process.cwd(), 'src/feature-flags/monitoring/metrics-history.json');
    await fs.writeFile(metricsPath, JSON.stringify(metricsData, null, 2));
  }

  /**
   * Manual alert resolution
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    this.emit('alert_resolved', alert);
    return true;
  }

  /**
   * Get alerts for specific flag
   */
  getFlagAlerts(flagName: string): Alert[] {
    return Array.from(this.alerts.values())
      .filter(alert => alert.flagName === flagName && !alert.resolved);
  }

  /**
   * Get metrics history for a flag
   */
  getMetricsHistory(flagName: string): RolloutMetrics[] {
    return this.metricsHistory.get(flagName) || [];
  }

  /**
   * Emergency shutdown of all rollouts
   */
  async emergencyShutdown(reason: string): Promise<void> {
    const flags = this.flagManager.getAllFlags();

    for (const flag of flags) {
      if (flag.enabled) {
        await this.flagManager.disableFlag(flag.name);
      }
    }

    this.createAlert('system_health', 'critical',
      `Emergency shutdown triggered: ${reason}`);

    this.emit('emergency_shutdown', { reason, flagCount: flags.length });
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): any {
    const validatorMetrics = this.validator.getSystemMetrics();
    const interceptorMetrics = this.interceptor.getSystemMetrics();
    const flagMetrics = this.flagManager.getMetrics();

    return {
      timestamp: new Date().toISOString(),
      validation: {
        totalValidations: validatorMetrics.totalValidations,
        avgTruthScore: validatorMetrics.avgTruthScore,
        successRate: validatorMetrics.successRate,
        consensusNodes: validatorMetrics.consensusNodes
      },
      interception: {
        totalExecutions: interceptorMetrics.totalExecutions,
        runningProcesses: interceptorMetrics.runningProcesses,
        hookTypeCounts: interceptorMetrics.hookTypeCounts
      },
      flags: {
        totalFlags: flagMetrics.length,
        avgErrorRate: flagMetrics.reduce((sum, m) => sum + m.errorRate, 0) / flagMetrics.length,
        avgSuccessRate: flagMetrics.reduce((sum, m) => sum + m.successRate, 0) / flagMetrics.length,
        totalUsers: flagMetrics.reduce((sum, m) => sum + m.userCount, 0)
      },
      alerts: {
        total: this.alerts.size,
        unresolved: Array.from(this.alerts.values()).filter(a => !a.resolved).length,
        critical: Array.from(this.alerts.values()).filter(a => !a.resolved && a.severity === 'critical').length
      }
    };
  }
}