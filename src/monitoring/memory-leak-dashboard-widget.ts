/**
 * Memory Leak Detection Dashboard Widget
 * Sprint 3.1: Memory Leak Prevention - Enhanced Lifecycle Cleanup
 *
 * Real-time dashboard widget for monitoring memory leaks and orphaned agents.
 *
 * Features:
 * - Real-time memory usage tracking
 * - Orphaned agent visualization
 * - Redis key metrics
 * - Memory growth trend analysis
 * - Auto-cleanup triggers
 * - Alert system for memory thresholds
 *
 * Epic: memory-leak-prevention
 * Sprint: 3.1 - Enhanced Lifecycle Cleanup
 *
 * @module monitoring/memory-leak-dashboard-widget
 */

import { EventEmitter } from 'events';
import type { Redis } from 'ioredis';
import { Logger } from '../core/logger.js';
import type { LoggingConfig } from '../utils/types.js';
import type {
  EnhancedLifecycleCleanupManager,
  MemoryLeakMetrics,
  OrphanAgent,
} from '../agents/lifecycle-cleanup-enhanced.js';

// ===== TYPE DEFINITIONS =====

/**
 * Memory leak alert severity levels
 */
export type MemoryLeakAlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Memory leak alert
 */
export interface MemoryLeakAlert {
  id: string;
  severity: MemoryLeakAlertSeverity;
  timestamp: Date;
  metric: string;
  value: number;
  threshold: number;
  message: string;
  recommendation: string;
}

/**
 * Memory growth trend
 */
export interface MemoryGrowthTrend {
  period: string; // '1h', '6h', '24h'
  startMemory: number;
  endMemory: number;
  growthRate: number; // bytes per hour
  growthPercentage: number;
  isAnomalous: boolean;
}

/**
 * Dashboard widget configuration
 */
export interface MemoryLeakDashboardConfig {
  /** Redis client instance */
  redisClient: Redis;
  /** Cleanup manager instance */
  cleanupManager: EnhancedLifecycleCleanupManager;
  /** Update interval in milliseconds (default: 10000 = 10 seconds) */
  updateInterval?: number;
  /** Memory growth alert threshold in MB/hour (default: 100) */
  memoryGrowthThreshold?: number;
  /** Orphan count alert threshold (default: 5) */
  orphanCountThreshold?: number;
  /** Redis keys alert threshold (default: 10000) */
  redisKeysThreshold?: number;
  /** Enable automatic cleanup on critical alerts */
  autoCleanupOnCritical?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Widget data snapshot
 */
export interface MemoryLeakWidgetData {
  timestamp: Date;
  metrics: MemoryLeakMetrics;
  trends: {
    oneHour: MemoryGrowthTrend;
    sixHours: MemoryGrowthTrend;
    twentyFourHours: MemoryGrowthTrend;
  };
  alerts: MemoryLeakAlert[];
  orphans: OrphanAgent[];
  healthStatus: 'healthy' | 'warning' | 'critical';
  recommendations: string[];
}

// ===== MEMORY LEAK DASHBOARD WIDGET =====

/**
 * Real-time memory leak detection dashboard widget
 */
export class MemoryLeakDashboardWidget extends EventEmitter {
  private redis: Redis;
  private cleanupManager: EnhancedLifecycleCleanupManager;
  private logger: Logger;

  // Configuration
  private updateInterval: number;
  private memoryGrowthThreshold: number;
  private orphanCountThreshold: number;
  private redisKeysThreshold: number;
  private autoCleanupOnCritical: boolean;
  private debug: boolean;

  // State
  private isRunning: boolean = false;
  private updateTimer?: NodeJS.Timeout;
  private currentData?: MemoryLeakWidgetData;
  private metricsHistory: MemoryLeakMetrics[] = [];
  private activeAlerts: Map<string, MemoryLeakAlert> = new Map();

  // Metrics
  private widgetMetrics = {
    updatesPerformed: 0,
    alertsTriggered: 0,
    criticalAlertsTriggered: 0,
    autoCleanupExecutions: 0,
    errors: 0,
  };

  constructor(config: MemoryLeakDashboardConfig) {
    super();

    this.redis = config.redisClient;
    this.cleanupManager = config.cleanupManager;
    this.updateInterval = config.updateInterval || 10000;
    this.memoryGrowthThreshold = config.memoryGrowthThreshold || 100; // MB/hour
    this.orphanCountThreshold = config.orphanCountThreshold || 5;
    this.redisKeysThreshold = config.redisKeysThreshold || 10000;
    this.autoCleanupOnCritical = config.autoCleanupOnCritical || false;
    this.debug = config.debug || false;

    // Initialize logger
    const loggingConfig: LoggingConfig = {
      level: this.debug ? 'debug' : 'info',
      format: 'json',
      outputDir: './logs',
    };
    this.logger = new Logger('memory-leak-dashboard', loggingConfig);

    this.logger.info('Memory leak dashboard widget initialized', {
      updateInterval: this.updateInterval,
      autoCleanupOnCritical: this.autoCleanupOnCritical,
    });
  }

  /**
   * Start widget updates
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Dashboard widget already running');
      return;
    }

    this.logger.info('Starting memory leak dashboard widget');

    // Perform initial update
    this.updateWidget().catch((error) => {
      this.logger.error('Initial widget update failed', { error });
    });

    // Set up periodic updates
    this.updateTimer = setInterval(() => {
      this.updateWidget().catch((error) => {
        this.logger.error('Widget update failed', { error });
        this.widgetMetrics.errors++;
      });
    }, this.updateInterval);

    this.isRunning = true;
    this.emit('widget:started');
  }

  /**
   * Stop widget updates
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping memory leak dashboard widget');

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }

    this.isRunning = false;
    this.emit('widget:stopped');
  }

  /**
   * Update widget data
   */
  private async updateWidget(): Promise<void> {
    try {
      // Get current metrics from cleanup manager
      const metrics = await this.cleanupManager.getMemoryLeakMetrics();

      // Store in history (keep last 1440 entries = 24 hours at 1 minute intervals)
      this.metricsHistory.push(metrics);
      if (this.metricsHistory.length > 1440) {
        this.metricsHistory.shift();
      }

      // Calculate trends
      const trends = this.calculateTrends();

      // Detect and process alerts
      const alerts = this.detectAlerts(metrics, trends);

      // Determine health status
      const healthStatus = this.determineHealthStatus(alerts);

      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics, trends, alerts);

      // Get orphans from cleanup manager
      const orphans: OrphanAgent[] = [];
      // Note: In production, we would query the cleanup manager for current orphans
      // For now, use metrics data

      // Create widget data snapshot
      this.currentData = {
        timestamp: new Date(),
        metrics,
        trends,
        alerts,
        orphans,
        healthStatus,
        recommendations,
      };

      // Emit update event
      this.emit('widget:updated', this.currentData);

      // Handle critical alerts
      if (healthStatus === 'critical' && this.autoCleanupOnCritical) {
        await this.handleCriticalAlerts();
      }

      this.widgetMetrics.updatesPerformed++;

      this.logger.debug('Widget updated successfully', {
        healthStatus,
        alertCount: alerts.length,
        orphanCount: metrics.orphanedAgents,
      });
    } catch (error) {
      this.widgetMetrics.errors++;
      this.logger.error('Error updating widget', { error });
      this.emit('error', error);
    }
  }

  /**
   * Calculate memory growth trends
   */
  private calculateTrends(): {
    oneHour: MemoryGrowthTrend;
    sixHours: MemoryGrowthTrend;
    twentyFourHours: MemoryGrowthTrend;
  } {
    const oneHour = this.calculateTrendForPeriod('1h', 60);
    const sixHours = this.calculateTrendForPeriod('6h', 360);
    const twentyFourHours = this.calculateTrendForPeriod('24h', 1440);

    return { oneHour, sixHours, twentyFourHours };
  }

  /**
   * Calculate trend for specific time period
   */
  private calculateTrendForPeriod(period: string, dataPoints: number): MemoryGrowthTrend {
    if (this.metricsHistory.length < 2) {
      return {
        period,
        startMemory: 0,
        endMemory: 0,
        growthRate: 0,
        growthPercentage: 0,
        isAnomalous: false,
      };
    }

    const relevantData =
      this.metricsHistory.length > dataPoints
        ? this.metricsHistory.slice(-dataPoints)
        : this.metricsHistory;

    const startMetric = relevantData[0];
    const endMetric = relevantData[relevantData.length - 1];

    const startMemory = startMetric.memoryUsage.heapUsed;
    const endMemory = endMetric.memoryUsage.heapUsed;
    const timeDiffHours = dataPoints / 60; // Convert minutes to hours

    const growthRate = (endMemory - startMemory) / timeDiffHours;
    const growthPercentage = ((endMemory - startMemory) / startMemory) * 100;

    // Detect anomalous growth (>threshold)
    const growthRateMB = growthRate / (1024 * 1024);
    const isAnomalous = growthRateMB > this.memoryGrowthThreshold;

    return {
      period,
      startMemory,
      endMemory,
      growthRate,
      growthPercentage,
      isAnomalous,
    };
  }

  /**
   * Detect alerts based on metrics and trends
   */
  private detectAlerts(
    metrics: MemoryLeakMetrics,
    trends: {
      oneHour: MemoryGrowthTrend;
      sixHours: MemoryGrowthTrend;
      twentyFourHours: MemoryGrowthTrend;
    }
  ): MemoryLeakAlert[] {
    const alerts: MemoryLeakAlert[] = [];

    // Alert: Excessive orphaned agents
    if (metrics.orphanedAgents > this.orphanCountThreshold) {
      const alert: MemoryLeakAlert = {
        id: `orphan-${Date.now()}`,
        severity: metrics.orphanedAgents > this.orphanCountThreshold * 2 ? 'critical' : 'warning',
        timestamp: new Date(),
        metric: 'orphaned_agents',
        value: metrics.orphanedAgents,
        threshold: this.orphanCountThreshold,
        message: `${metrics.orphanedAgents} orphaned agents detected (threshold: ${this.orphanCountThreshold})`,
        recommendation: 'Run cleanup-orphans CLI command or enable auto-cleanup',
      };
      alerts.push(alert);
      this.trackAlert(alert);
    }

    // Alert: Memory growth rate
    if (trends.oneHour.isAnomalous) {
      const growthRateMB = trends.oneHour.growthRate / (1024 * 1024);
      const alert: MemoryLeakAlert = {
        id: `memory-growth-${Date.now()}`,
        severity: growthRateMB > this.memoryGrowthThreshold * 2 ? 'critical' : 'warning',
        timestamp: new Date(),
        metric: 'memory_growth_rate',
        value: growthRateMB,
        threshold: this.memoryGrowthThreshold,
        message: `Anomalous memory growth detected: ${growthRateMB.toFixed(2)} MB/hour`,
        recommendation: 'Investigate memory leaks, check orphaned agents, review long-running processes',
      };
      alerts.push(alert);
      this.trackAlert(alert);
    }

    // Alert: Excessive Redis keys
    if (metrics.redisKeys.total > this.redisKeysThreshold) {
      const alert: MemoryLeakAlert = {
        id: `redis-keys-${Date.now()}`,
        severity:
          metrics.redisKeys.total > this.redisKeysThreshold * 2 ? 'critical' : 'warning',
        timestamp: new Date(),
        metric: 'redis_keys_count',
        value: metrics.redisKeys.total,
        threshold: this.redisKeysThreshold,
        message: `Excessive Redis keys: ${metrics.redisKeys.total} (threshold: ${this.redisKeysThreshold})`,
        recommendation: `Run cleanup for stale keys. Found ${metrics.redisKeys.stale} stale keys`,
      };
      alerts.push(alert);
      this.trackAlert(alert);
    }

    // Alert: Zombie agents (stuck in terminal states)
    if (metrics.zombieAgents > 0) {
      const alert: MemoryLeakAlert = {
        id: `zombie-agents-${Date.now()}`,
        severity: metrics.zombieAgents > 10 ? 'critical' : 'warning',
        timestamp: new Date(),
        metric: 'zombie_agents',
        value: metrics.zombieAgents,
        threshold: 0,
        message: `${metrics.zombieAgents} zombie agents detected (stuck in error/stopped state)`,
        recommendation: 'Force cleanup zombie agents to free resources',
      };
      alerts.push(alert);
      this.trackAlert(alert);
    }

    return alerts;
  }

  /**
   * Track alert (avoid duplicates)
   */
  private trackAlert(alert: MemoryLeakAlert): void {
    const existingAlert = this.activeAlerts.get(alert.metric);

    // Only emit if new alert or severity increased
    if (
      !existingAlert ||
      this.getSeverityLevel(alert.severity) > this.getSeverityLevel(existingAlert.severity)
    ) {
      this.activeAlerts.set(alert.metric, alert);
      this.emit('alert:triggered', alert);

      this.widgetMetrics.alertsTriggered++;
      if (alert.severity === 'critical') {
        this.widgetMetrics.criticalAlertsTriggered++;
      }

      this.logger.warn('Memory leak alert triggered', {
        severity: alert.severity,
        metric: alert.metric,
        value: alert.value,
        message: alert.message,
      });
    }
  }

  /**
   * Get numeric severity level
   */
  private getSeverityLevel(severity: MemoryLeakAlertSeverity): number {
    const levels = { info: 1, warning: 2, critical: 3 };
    return levels[severity];
  }

  /**
   * Determine overall health status
   */
  private determineHealthStatus(
    alerts: MemoryLeakAlert[]
  ): 'healthy' | 'warning' | 'critical' {
    if (alerts.some((a) => a.severity === 'critical')) {
      return 'critical';
    } else if (alerts.some((a) => a.severity === 'warning')) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    metrics: MemoryLeakMetrics,
    trends: any,
    alerts: MemoryLeakAlert[]
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.orphanedAgents > 0) {
      recommendations.push(
        `Cleanup ${metrics.orphanedAgents} orphaned agents using: node src/cli/cleanup-orphans.js --force`
      );
    }

    if (trends.oneHour.isAnomalous) {
      recommendations.push(
        'Memory growth detected - enable auto-cleanup or increase cleanup frequency'
      );
    }

    if (metrics.redisKeys.stale > 0) {
      recommendations.push(`Cleanup ${metrics.redisKeys.stale} stale Redis keys`);
    }

    if (metrics.zombieAgents > 0) {
      recommendations.push(`Force cleanup ${metrics.zombieAgents} zombie agents`);
    }

    if (alerts.length === 0) {
      recommendations.push('System healthy - continue monitoring');
    }

    return recommendations;
  }

  /**
   * Handle critical alerts
   */
  private async handleCriticalAlerts(): Promise<void> {
    this.logger.warn('Handling critical alerts with auto-cleanup');

    try {
      // Execute orphan cleanup
      await this.cleanupManager.cleanupStaleRedisKeys();

      this.widgetMetrics.autoCleanupExecutions++;
      this.emit('auto-cleanup:executed', { timestamp: new Date() });

      this.logger.info('Auto-cleanup executed successfully');
    } catch (error) {
      this.logger.error('Auto-cleanup failed', { error });
      this.emit('auto-cleanup:failed', { error });
    }
  }

  /**
   * Get current widget data
   */
  getCurrentData(): MemoryLeakWidgetData | undefined {
    return this.currentData;
  }

  /**
   * Get widget metrics
   */
  getMetrics() {
    return {
      ...this.widgetMetrics,
      isRunning: this.isRunning,
      metricsHistorySize: this.metricsHistory.length,
      activeAlertsCount: this.activeAlerts.size,
    };
  }

  /**
   * Clear alert
   */
  clearAlert(metric: string): void {
    this.activeAlerts.delete(metric);
    this.emit('alert:cleared', { metric, timestamp: new Date() });
  }

  /**
   * Clear all alerts
   */
  clearAllAlerts(): void {
    this.activeAlerts.clear();
    this.emit('alerts:cleared', { timestamp: new Date() });
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): MemoryLeakMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Export widget data as JSON
   */
  exportData(): string {
    return JSON.stringify(
      {
        currentData: this.currentData,
        metricsHistory: this.metricsHistory,
        activeAlerts: Array.from(this.activeAlerts.values()),
        widgetMetrics: this.widgetMetrics,
      },
      null,
      2
    );
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down memory leak dashboard widget');
    this.stop();
    this.emit('shutdown');
  }
}

/**
 * Create memory leak dashboard widget
 */
export function createMemoryLeakDashboardWidget(
  config: MemoryLeakDashboardConfig
): MemoryLeakDashboardWidget {
  return new MemoryLeakDashboardWidget(config);
}

export default MemoryLeakDashboardWidget;
