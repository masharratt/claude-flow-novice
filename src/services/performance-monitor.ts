/**
 * Performance Monitor Service
 *
 * Real-time performance baseline monitoring with SLA tracking and alerting.
 * Part of Phase 2, Task P2-4.2: Performance Baseline Monitoring
 *
 * Features:
 * - Record performance metrics for all critical operations
 * - Calculate performance baselines from historical data (P50, P95, P99)
 * - Track SLA compliance and violations
 * - Detect performance degradation automatically
 * - Generate alerts on violations and degradation
 * - Provide metrics for dashboards (Grafana integration)
 * - Forecast future performance trends
 *
 * Performance Targets:
 * - Metric recording: <10ms overhead
 * - Baseline calculation: <5s
 * - SLA check: <50ms
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { DatabaseService } from '../lib/database-service';
import { StandardError, ErrorCode } from '../lib/errors';
import { createLogger } from '../lib/logging';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('performance-monitor');

/**
 * Performance metric recorded for an operation
 */
export interface PerformanceMetric {
  operation: string;
  duration_ms: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * SLA definition for an operation
 */
export interface SLADefinition {
  target: number;        // Target P50 in milliseconds
  p95: number;          // 95th percentile in milliseconds
  p99: number;          // 99th percentile in milliseconds
  enabled: boolean;
  alert_threshold: number; // Multiplier for degradation alert (e.g. 1.2 = 20% degradation)
}

/**
 * Baseline metrics calculated from historical data
 */
export interface BaselineMetrics {
  operation: string;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
  count: number;
  calculated_at: Date;
  period_days: number;
}

/**
 * Alert event for SLA violations or degradation
 */
export interface AlertEvent {
  id: string;
  operation: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  resolved_at?: Date;
  resolved_reason?: string;
  metadata?: Record<string, any>;
}

/**
 * SLA compliance report
 */
export interface ComplianceReport {
  operation: string;
  period: string;
  total_metrics: number;
  violations_count: number;
  compliance_percentage: number;
  sla_target_ms: number;
  avg_duration_ms: number;
  p95_duration_ms: number;
  p99_duration_ms: number;
}

/**
 * Dashboard metrics data
 */
export interface DashboardMetrics {
  metrics: Array<{
    operation: string;
    timestamp: Date;
    duration_ms: number;
    is_violation: boolean;
  }>;
  timestamps: Date[];
  compliance_rates: Record<string, number>;
  active_alerts: AlertEvent[];
}

/**
 * SLA trend data point
 */
export interface TrendPoint {
  date: Date;
  compliance: number;
  avg_duration_ms: number;
  violations_count: number;
}

/**
 * Performance forecast
 */
export interface PerformanceForecast {
  operation: string;
  forecasted_duration_ms: number;
  confidence_interval_lower: number;
  confidence_interval_upper: number;
  trend: 'improving' | 'stable' | 'degrading';
  forecast_date: Date;
}

/**
 * Performance Monitor Configuration
 */
export interface PerformanceMonitorConfig {
  dbService: DatabaseService;
  slaConfigPath?: string;
  metricsRetentionDays?: number;
  baselineCalculationDays?: number;
}

/**
 * Performance Monitor Service
 */
export class PerformanceMonitor {
  private dbService: DatabaseService;
  private slaConfigPath: string;
  private slaDefinitions: Map<string, SLADefinition> = new Map();
  private baselineCache: Map<string, BaselineMetrics> = new Map();
  private lastBaselineTime: Map<string, number> = new Map();
  private metricsRetentionDays: number;
  private baselineCalculationDays: number;
  private degradationTracker: Map<string, number[]> = new Map();
  private initialized: boolean = false;

  constructor(config: PerformanceMonitorConfig) {
    this.dbService = config.dbService;
    this.slaConfigPath = config.slaConfigPath || path.join(process.cwd(), 'config/sla-definitions.yml');
    this.metricsRetentionDays = config.metricsRetentionDays || 90;
    this.baselineCalculationDays = config.baselineCalculationDays || 30;
  }

  /**
   * Initialize performance monitor
   */
  async init(): Promise<void> {
    try {
      await this.createTables();
      await this.loadSLADefinitions();
      this.initialized = true;
      logger.info('Performance monitor initialized');
    } catch (error) {
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        'Failed to initialize performance monitor',
        { cause: error }
      );
    }
  }

  /**
   * Create necessary database tables
   */
  private async createTables(): Promise<void> {
    try {
      const sqliteAdapter = this.dbService.getAdapter('sqlite');

      // Performance metrics table
      await sqliteAdapter.raw(`
        CREATE TABLE IF NOT EXISTS performance_metrics (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL,
          duration_ms REAL NOT NULL,
          timestamp DATETIME NOT NULL,
          metadata TEXT,
          is_sla_violation INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create index for query performance
      await sqliteAdapter.raw(`
        CREATE INDEX IF NOT EXISTS idx_performance_metrics_operation_timestamp
        ON performance_metrics(operation, timestamp)
      `);

      // SLA violation tracking
      await sqliteAdapter.raw(`
        CREATE TABLE IF NOT EXISTS sla_violations (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL,
          metric_id TEXT NOT NULL,
          duration_ms REAL NOT NULL,
          sla_target_ms REAL NOT NULL,
          violation_percent REAL NOT NULL,
          timestamp DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (metric_id) REFERENCES performance_metrics(id)
        )
      `);

      // Create index for violations
      await sqliteAdapter.raw(`
        CREATE INDEX IF NOT EXISTS idx_sla_violations_operation_timestamp
        ON sla_violations(operation, timestamp)
      `);

      // Alert events table
      await sqliteAdapter.raw(`
        CREATE TABLE IF NOT EXISTS performance_alerts (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp DATETIME NOT NULL,
          resolved_at DATETIME,
          resolved_reason TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create index for alerts
      await sqliteAdapter.raw(`
        CREATE INDEX IF NOT EXISTS idx_performance_alerts_operation_timestamp
        ON performance_alerts(operation, timestamp)
      `);

      // Baseline metrics cache
      await sqliteAdapter.raw(`
        CREATE TABLE IF NOT EXISTS baseline_metrics (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL UNIQUE,
          min REAL NOT NULL,
          p50 REAL NOT NULL,
          p95 REAL NOT NULL,
          p99 REAL NOT NULL,
          max REAL NOT NULL,
          avg REAL NOT NULL,
          count INTEGER NOT NULL,
          period_days INTEGER NOT NULL,
          calculated_at DATETIME NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      logger.debug('Database tables created');
    } catch (error) {
      // Table creation errors are non-fatal if tables already exist
      logger.debug('Table creation error (may already exist):', error);
    }
  }

  /**
   * Load SLA definitions from configuration file
   */
  private async loadSLADefinitions(): Promise<void> {
    try {
      if (!fs.existsSync(this.slaConfigPath)) {
        logger.warn(`SLA config not found at ${this.slaConfigPath}, using defaults`);
        this.loadDefaultSLAs();
        return;
      }

      const configContent = fs.readFileSync(this.slaConfigPath, 'utf-8');
      const config = yaml.load(configContent) as any;

      if (config.slas) {
        for (const [operation, sla] of Object.entries(config.slas)) {
          this.slaDefinitions.set(operation, sla as SLADefinition);
        }
      }

      logger.debug(`Loaded ${this.slaDefinitions.size} SLA definitions`);
    } catch (error) {
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        'Failed to load SLA definitions',
        { path: this.slaConfigPath, cause: error }
      );
    }
  }

  /**
   * Load default SLA definitions
   */
  private loadDefaultSLAs(): void {
    this.slaDefinitions.set('agent_startup', {
      target: 2000,
      p95: 2000,
      p99: 5000,
      enabled: true,
      alert_threshold: 1.2,
    });

    this.slaDefinitions.set('query_execution', {
      target: 5000,
      p95: 5000,
      p99: 10000,
      enabled: true,
      alert_threshold: 1.2,
    });

    this.slaDefinitions.set('skill_execution', {
      target: 30000,
      p95: 30000,
      p99: 60000,
      enabled: true,
      alert_threshold: 1.2,
    });

    this.slaDefinitions.set('transaction_commit', {
      target: 5000,
      p95: 5000,
      p99: 10000,
      enabled: true,
      alert_threshold: 1.2,
    });
  }

  /**
   * Record a performance metric
   */
  async recordMetric(metric: PerformanceMetric): Promise<AlertEvent[]> {
    if (!this.initialized) {
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        'Performance monitor not initialized'
      );
    }

    // Validate metric
    this.validateMetric(metric);

    const metricId = uuidv4();
    const sqliteAdapter = this.dbService.getAdapter('sqlite');
    const alerts: AlertEvent[] = [];

    try {
      // Check if metric violates SLA
      const isViolation = !await this.isWithinSLA(metric);

      // Record metric
      await sqliteAdapter.raw(
        `INSERT INTO performance_metrics (id, operation, duration_ms, timestamp, metadata, is_sla_violation)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          metricId,
          metric.operation,
          metric.duration_ms,
          metric.timestamp.toISOString(),
          JSON.stringify(metric.metadata || {}),
          isViolation ? 1 : 0,
        ]
      );

      // Record violation if applicable
      if (isViolation) {
        const sla = this.slaDefinitions.get(metric.operation);
        if (sla) {
          const violationPercent = ((metric.duration_ms - sla.target) / sla.target) * 100;
          const violationId = uuidv4();

          await sqliteAdapter.raw(
            `INSERT INTO sla_violations (id, operation, metric_id, duration_ms, sla_target_ms, violation_percent, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              violationId,
              metric.operation,
              metricId,
              metric.duration_ms,
              sla.target,
              violationPercent,
              metric.timestamp.toISOString(),
            ]
          );

          // Create alert
          const alert: AlertEvent = {
            id: `alert-${metricId}`,
            operation: metric.operation,
            level: violationPercent > 200 ? 'critical' : 'warning', // Critical if >200% over (3x the SLA)
            message: `SLA violation: ${metric.duration_ms}ms exceeds target of ${sla.target}ms`,
            timestamp: new Date(),
            metadata: {
              duration_ms: metric.duration_ms,
              sla_target_ms: sla.target,
              violation_percent: violationPercent,
            },
          };

          await this.recordAlert(alert);
          alerts.push(alert);
        }
      }

      return alerts;
    } catch (error) {
      logger.error('Error recording metric:', error);
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to record performance metric',
        { operation: metric.operation, cause: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Record multiple metrics in batch
   */
  async recordMetrics(metrics: PerformanceMetric[]): Promise<void> {
    for (const metric of metrics) {
      await this.recordMetric(metric);
    }
  }

  /**
   * Check if metric is within SLA
   */
  async isWithinSLA(metric: PerformanceMetric): Promise<boolean> {
    const sla = this.slaDefinitions.get(metric.operation);

    if (!sla || !sla.enabled) {
      return true; // No SLA defined, assume compliance
    }

    return metric.duration_ms <= sla.target;
  }

  /**
   * Get SLA violations for an operation
   */
  async getSLAViolations(
    operation: string,
    options?: { period?: string; limit?: number }
  ): Promise<PerformanceMetric[]> {
    const sqliteAdapter = this.dbService.getAdapter('sqlite');
    const periodDays = this.getPeriodDays(options?.period || '1h');
    const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const limit = options?.limit || 1000;

    try {
      const result = await sqliteAdapter.raw<any[]>(
        `SELECT pm.id, pm.operation, pm.duration_ms, pm.timestamp, pm.metadata
         FROM performance_metrics pm
         WHERE pm.operation = ? AND pm.is_sla_violation = 1 AND pm.timestamp >= ?
         ORDER BY pm.timestamp DESC
         LIMIT ?`,
        [operation, cutoffDate.toISOString(), limit]
      );

      const rows = Array.isArray(result) ? result : [];
      return rows.map((row: any) => ({
        operation: row.operation,
        duration_ms: row.duration_ms,
        timestamp: new Date(row.timestamp),
        metadata: JSON.parse(row.metadata || '{}'),
      }));
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to get SLA violations',
        { operation, cause: error }
      );
    }
  }

  /**
   * Calculate baseline metrics from historical data
   */
  async calculateBaseline(operation: string, days: number = 30): Promise<BaselineMetrics> {
    // Check cache first (5 minute TTL)
    const cached = this.baselineCache.get(operation);
    const lastTime = this.lastBaselineTime.get(operation) || 0;
    if (cached && Date.now() - lastTime < 5 * 60 * 1000) {
      return cached;
    }

    const sqliteAdapter = this.dbService.getAdapter('sqlite');
    const startTime = Date.now();

    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const result = await sqliteAdapter.raw<any[]>(
        `SELECT
          MIN(duration_ms) as min_duration,
          MAX(duration_ms) as max_duration,
          AVG(duration_ms) as avg_duration,
          COUNT(*) as count
         FROM performance_metrics
         WHERE operation = ? AND timestamp >= ?`,
        [operation, startDate.toISOString()]
      );

      const rows = Array.isArray(result) ? result : [];
      if (rows.length === 0 || rows[0].count === 0) {
        throw new StandardError(
          ErrorCode.DB_NOT_FOUND,
          `No metrics found for operation: ${operation}`,
          { days }
        );
      }

      // Get percentile values
      const percentiles = await this.calculatePercentiles(operation, startDate);

      const baseline: BaselineMetrics = {
        operation,
        min: rows[0].min_duration,
        p50: percentiles.p50,
        p95: percentiles.p95,
        p99: percentiles.p99,
        max: rows[0].max_duration,
        avg: rows[0].avg_duration,
        count: rows[0].count,
        calculated_at: new Date(),
        period_days: days,
      };

      // Cache baseline
      this.baselineCache.set(operation, baseline);
      this.lastBaselineTime.set(operation, Date.now());

      const duration = Date.now() - startTime;
      if (duration > 5000) {
        logger.warn(`Baseline calculation took ${duration}ms (target: <5s)`);
      }

      return baseline;
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to calculate baseline',
        { operation, days, cause: error }
      );
    }
  }

  /**
   * Calculate percentile values
   */
  private async calculatePercentiles(
    operation: string,
    startDate: Date
  ): Promise<{ p50: number; p95: number; p99: number }> {
    const sqliteAdapter = this.dbService.getAdapter('sqlite');

    try {
      // Get all durations and sort them in application
      const result = await sqliteAdapter.raw<any[]>(
        `SELECT duration_ms
         FROM performance_metrics
         WHERE operation = ? AND timestamp >= ?
         ORDER BY duration_ms ASC`,
        [operation, startDate.toISOString()]
      );

      const rows = Array.isArray(result) ? result : [];
      if (rows.length === 0) {
        return { p50: 0, p95: 0, p99: 0 };
      }

      const durations = rows.map((row: any) => row.duration_ms);
      durations.sort((a: number, b: number) => a - b);

      const len = durations.length;
      const p50Index = Math.floor(len * 0.50);
      const p95Index = Math.floor(len * 0.95);
      const p99Index = Math.floor(len * 0.99);

      return {
        p50: durations[p50Index] || 0,
        p95: durations[p95Index] || 0,
        p99: durations[p99Index] || 0,
      };
    } catch (error) {
      logger.error('Error calculating percentiles:', error);
      return { p50: 0, p95: 0, p99: 0 };
    }
  }

  /**
   * Get SLA compliance percentage for an operation
   */
  async getSLACompliance(operation: string, period: string): Promise<number> {
    const sqliteAdapter = this.dbService.getAdapter('sqlite');
    const periodDays = this.getPeriodDays(period);
    const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    try {
      const result = await sqliteAdapter.raw<any[]>(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN is_sla_violation = 0 THEN 1 ELSE 0 END) as compliant
         FROM performance_metrics
         WHERE operation = ? AND timestamp >= ?`,
        [operation, cutoffDate.toISOString()]
      );

      const rows = Array.isArray(result) ? result : [];
      if (rows.length === 0) {
        return 1.0; // No metrics, assume 100% compliant
      }

      const row = rows[0];
      if (row.total === 0) {
        return 1.0; // No metrics, assume 100% compliant
      }

      return row.compliant / row.total;
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to calculate SLA compliance',
        { operation, period, cause: error }
      );
    }
  }

  /**
   * Detect performance degradation
   */
  async detectDegradation(
    operation: string,
    options?: {
      threshold_percent?: number;
      window_minutes?: number;
    }
  ): Promise<boolean> {
    const threshold = options?.threshold_percent || 20;
    const windowMinutes = options?.window_minutes || 5;

    try {
      const baseline = await this.calculateBaseline(operation, 30);
      const sqliteAdapter = this.dbService.getAdapter('sqlite');

      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

      const result = await sqliteAdapter.raw<any[]>(
        `SELECT AVG(duration_ms) as avg_duration, COUNT(*) as count
         FROM performance_metrics
         WHERE operation = ? AND timestamp >= ?`,
        [operation, windowStart.toISOString()]
      );

      const rows = Array.isArray(result) ? result : [];
      if (rows.length === 0) {
        return false; // No metrics, assume no degradation
      }

      const row = rows[0];
      if (row.count < 5) {
        return false; // Need at least 5 samples
      }

      const degradationPercent = ((row.avg_duration - baseline.p50) / baseline.p50) * 100;
      return degradationPercent > threshold;
    } catch (error) {
      logger.error(`Failed to detect degradation for ${operation}:`, error);
      return false;
    }
  }

  /**
   * Get metrics with optional filtering
   */
  async getMetrics(
    operation: string,
    options?: {
      period?: string;
      limit?: number;
      offset?: number;
      includeMetadata?: boolean;
    }
  ): Promise<PerformanceMetric[]> {
    const sqliteAdapter = this.dbService.getAdapter('sqlite');
    const limit = options?.limit || 1000;
    const offset = options?.offset || 0;
    let whereClause = 'operation = ?';
    const params: any[] = [operation];

    if (options?.period) {
      const periodDays = this.getPeriodDays(options.period);
      const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
      whereClause += ' AND timestamp >= ?';
      params.push(cutoffDate.toISOString());
    }

    try {
      const result = await sqliteAdapter.raw<any[]>(
        `SELECT id, operation, duration_ms, timestamp, metadata
         FROM performance_metrics
         WHERE ${whereClause}
         ORDER BY timestamp DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const rows = Array.isArray(result) ? result : [];
      return rows.map((row: any) => ({
        operation: row.operation,
        duration_ms: row.duration_ms,
        timestamp: new Date(row.timestamp),
        metadata: options?.includeMetadata ? JSON.parse(row.metadata || '{}') : undefined,
      }));
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to get metrics',
        { operation, cause: error }
      );
    }
  }

  /**
   * Get compliance report for an operation
   */
  async getComplianceReport(
    operation: string,
    options?: {
      period?: string;
      includeRawData?: boolean;
    }
  ): Promise<ComplianceReport> {
    const period = options?.period || '1d';
    const compliance = await this.getSLACompliance(operation, period);
    const violations = await this.getSLAViolations(operation, { period });
    const metrics = await this.getMetrics(operation, { period, limit: 10000 });

    const sla = this.slaDefinitions.get(operation);
    const avgDuration = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.duration_ms, 0) / metrics.length
      : 0;

    // Calculate percentiles
    const sortedDurations = metrics.map(m => m.duration_ms).sort((a, b) => a - b);
    const p95Index = Math.floor(sortedDurations.length * 0.95);
    const p99Index = Math.floor(sortedDurations.length * 0.99);

    return {
      operation,
      period,
      total_metrics: metrics.length,
      violations_count: violations.length,
      compliance_percentage: compliance * 100,
      sla_target_ms: sla?.target || 0,
      avg_duration_ms: avgDuration,
      p95_duration_ms: sortedDurations[p95Index] || 0,
      p99_duration_ms: sortedDurations[p99Index] || 0,
    };
  }

  /**
   * Record an alert
   */
  async recordAlert(alert: AlertEvent): Promise<void> {
    const sqliteAdapter = this.dbService.getAdapter('sqlite');

    try {
      await sqliteAdapter.raw(
        `INSERT INTO performance_alerts (id, operation, level, message, timestamp, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          alert.id,
          alert.operation,
          alert.level,
          alert.message,
          alert.timestamp.toISOString(),
          JSON.stringify(alert.metadata || {}),
        ]
      );
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to record alert',
        { operation: alert.operation, cause: error }
      );
    }
  }

  /**
   * Get alerts for an operation
   */
  async getAlerts(
    operation: string,
    options?: {
      type?: string;
      activeOnly?: boolean;
      minSeverity?: string;
      limit?: number;
    }
  ): Promise<AlertEvent[]> {
    const sqliteAdapter = this.dbService.getAdapter('sqlite');
    let whereClauses = ['operation = ?'];
    const params: any[] = [operation];

    if (options?.activeOnly) {
      whereClauses.push('resolved_at IS NULL');
    }

    if (options?.minSeverity) {
      const severities = ['info', 'warning', 'critical'];
      const minIndex = severities.indexOf(options.minSeverity);
      const validSeverities = severities.slice(minIndex).map(() => '?').join(',');
      whereClauses.push(`level IN (${validSeverities})`);
      params.push(...severities.slice(minIndex));
    }

    const whereClause = whereClauses.join(' AND ');
    const limit = options?.limit || 1000;

    try {
      const result = await sqliteAdapter.raw<any[]>(
        `SELECT id, operation, level, message, timestamp, resolved_at, resolved_reason, metadata
         FROM performance_alerts
         WHERE ${whereClause}
         ORDER BY timestamp DESC
         LIMIT ?`,
        [...params, limit]
      );

      const rows = Array.isArray(result) ? result : [];
      return rows.map((row: any) => ({
        id: row.id,
        operation: row.operation,
        level: row.level,
        message: row.message,
        timestamp: new Date(row.timestamp),
        resolved_at: row.resolved_at ? new Date(row.resolved_at) : undefined,
        resolved_reason: row.resolved_reason,
        metadata: JSON.parse(row.metadata || '{}'),
      }));
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to get alerts',
        { operation, cause: error }
      );
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, reason: string): Promise<void> {
    const sqliteAdapter = this.dbService.getAdapter('sqlite');

    try {
      await sqliteAdapter.raw(
        `UPDATE performance_alerts
         SET resolved_at = ?, resolved_reason = ?
         WHERE id = ?`,
        [new Date().toISOString(), reason, alertId]
      );
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to resolve alert',
        { alertId, cause: error }
      );
    }
  }

  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(options?: {
    time_range?: string;
    resolution?: string;
  }): Promise<DashboardMetrics> {
    const period = options?.time_range || '24h';
    const periodDays = this.getPeriodDays(period);
    const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const sqliteAdapter = this.dbService.getAdapter('sqlite');

    try {
      const result = await sqliteAdapter.raw<any[]>(
        `SELECT operation, duration_ms, timestamp, is_sla_violation
         FROM performance_metrics
         WHERE timestamp >= ?
         ORDER BY timestamp`,
        [cutoffDate.toISOString()]
      );

      const rows = Array.isArray(result) ? result : [];
      const metrics = rows.map((row: any) => ({
        operation: row.operation,
        timestamp: new Date(row.timestamp),
        duration_ms: row.duration_ms,
        is_violation: row.is_sla_violation === 1,
      }));

      const timestamps = [...new Set(metrics.map(m => m.timestamp.toISOString()))].sort().map(t => new Date(t));

      // Calculate compliance rates per operation
      const complianceRates: Record<string, number> = {};
      const operations = [...new Set(metrics.map(m => m.operation))];
      for (const op of operations) {
        complianceRates[op] = await this.getSLACompliance(op, period);
      }

      // Get active alerts
      const allAlerts = await Promise.all(
        operations.map(op => this.getAlerts(op, { activeOnly: true }))
      );
      const activeAlerts = allAlerts.flat();

      return {
        metrics,
        timestamps,
        compliance_rates: complianceRates,
        active_alerts: activeAlerts,
      };
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to get dashboard metrics',
        { cause: error }
      );
    }
  }

  /**
   * Get SLA trends over time
   */
  async getSLATrends(
    operation: string,
    options?: {
      period?: string;
      interval?: string;
    }
  ): Promise<TrendPoint[]> {
    const period = options?.period || '7d';
    const periodDays = this.getPeriodDays(period);
    const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const sqliteAdapter = this.dbService.getAdapter('sqlite');

    try {
      const result = await sqliteAdapter.raw<any[]>(
        `SELECT
          DATE(timestamp) as date,
          COUNT(*) as total,
          SUM(CASE WHEN is_sla_violation = 0 THEN 1 ELSE 0 END) as compliant,
          AVG(duration_ms) as avg_duration,
          SUM(CASE WHEN is_sla_violation = 1 THEN 1 ELSE 0 END) as violations
         FROM performance_metrics
         WHERE operation = ? AND timestamp >= ?
         GROUP BY DATE(timestamp)
         ORDER BY date ASC`,
        [operation, cutoffDate.toISOString()]
      );

      const rows = Array.isArray(result) ? result : [];
      return rows.map((row: any) => ({
        date: new Date(row.date),
        compliance: row.compliant && row.total ? row.compliant / row.total : 1.0,
        avg_duration_ms: row.avg_duration || 0,
        violations_count: row.violations || 0,
      }));
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to get SLA trends',
        { operation, cause: error }
      );
    }
  }

  /**
   * Forecast future performance
   */
  async forecastPerformance(
    operation: string,
    options?: {
      days_ahead?: number;
    }
  ): Promise<PerformanceForecast> {
    const daysAhead = options?.days_ahead || 7;

    try {
      const baseline = await this.calculateBaseline(operation, 30);
      const trends = await this.getSLATrends(operation, { period: '7d', interval: '1d' });

      // Simple trend analysis
      let trend: 'improving' | 'stable' | 'degrading' = 'stable';
      if (trends.length >= 2) {
        const recentAvg = trends.slice(-3).reduce((sum, t) => sum + t.avg_duration_ms, 0) / 3;
        const olderAvg = trends.slice(0, 3).reduce((sum, t) => sum + t.avg_duration_ms, 0) / 3;

        if (recentAvg < olderAvg * 0.95) {
          trend = 'improving';
        } else if (recentAvg > olderAvg * 1.05) {
          trend = 'degrading';
        }
      }

      // Calculate confidence interval
      const stdDev = this.calculateStdDev(trends.map(t => t.avg_duration_ms));
      const margin = 1.96 * (stdDev / Math.sqrt(trends.length)); // 95% CI

      return {
        operation,
        forecasted_duration_ms: baseline.p50,
        confidence_interval_lower: Math.max(baseline.p50 - margin, 0),
        confidence_interval_upper: baseline.p50 + margin,
        trend,
        forecast_date: new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000),
      };
    } catch (error) {
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to forecast performance',
        { operation, cause: error }
      );
    }
  }

  /**
   * Get SLA definitions
   */
  async getSLADefinitions(): Promise<Record<string, SLADefinition>> {
    const result: Record<string, SLADefinition> = {};
    for (const [op, sla] of this.slaDefinitions.entries()) {
      result[op] = sla;
    }
    return result;
  }

  /**
   * Get SLA definition for an operation
   */
  async getSLADefinition(operation: string): Promise<SLADefinition | undefined> {
    return this.slaDefinitions.get(operation);
  }

  /**
   * Validate performance metric
   */
  private validateMetric(metric: PerformanceMetric): void {
    if (!metric.operation) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Metric operation is required'
      );
    }

    if (typeof metric.duration_ms !== 'number' || metric.duration_ms < 0) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Metric duration_ms must be a non-negative number'
      );
    }

    if (!metric.timestamp) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Metric timestamp is required'
      );
    }
  }

  /**
   * Get period duration in days
   */
  private getPeriodDays(period: string): number {
    const match = period.match(/^(\d+)([hmd])$/);
    if (!match) {
      return 1;
    }

    const [, value, unit] = match;
    const unitMap: Record<string, number> = {
      h: 1 / 24,
      m: 1 / (24 * 60),
      d: 1,
    };

    return parseInt(value) * unitMap[unit];
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return Math.sqrt(variance);
  }
}
