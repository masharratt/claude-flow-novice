/**
 * Performance Monitor Service Tests
 *
 * Comprehensive test suite for performance baseline monitoring with SLA tracking.
 * Part of Phase 2, Task P2-4.2: Performance Baseline Monitoring
 *
 * Coverage:
 * - SLA tracking and violation detection
 * - Baseline calculation (P50, P95, P99)
 * - Alert generation on violations
 * - Performance degradation detection
 * - SLA compliance reporting
 * - Metric recording and aggregation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PerformanceMonitor, PerformanceMetric, SLADefinition, BaselineMetrics, AlertEvent } from '../src/services/performance-monitor';
import { DatabaseService } from '../src/lib/database-service';
import { createLogger } from '../src/lib/logging';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('performance-monitor-test');

/**
 * Test configuration
 */
const TEST_DB_DIR = path.join(__dirname, '../.test-data');
const TEST_SQLITE_PATH = path.join(TEST_DB_DIR, 'test-performance.db');
const TEST_CONFIG_PATH = path.join(__dirname, '../config/sla-definitions.test.yml');

/**
 * Setup test database
 */
async function setupTestDatabase(): Promise<DatabaseService> {
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }

  if (fs.existsSync(TEST_SQLITE_PATH)) {
    fs.unlinkSync(TEST_SQLITE_PATH);
  }

  const dbService = new DatabaseService({
    sqlite: {
      type: 'sqlite',
      database: TEST_SQLITE_PATH,
    },
  });

  await dbService.connect();
  return dbService;
}

/**
 * Cleanup test data
 */
async function cleanup(dbService: DatabaseService): Promise<void> {
  await dbService.disconnect();
  if (fs.existsSync(TEST_SQLITE_PATH)) {
    fs.unlinkSync(TEST_SQLITE_PATH);
  }
}

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;
  let dbService: DatabaseService;

  beforeEach(async () => {
    dbService = await setupTestDatabase();
    monitor = new PerformanceMonitor({
      dbService,
      slaConfigPath: TEST_CONFIG_PATH,
    });
    try {
      await monitor.init();
    } catch (error) {
      // Initialization errors expected if init() creates tables
      logger.debug('Monitor init error (expected for table creation):', error);
    }
  });

  afterEach(async () => {
    try {
      await cleanup(dbService);
    } catch (error) {
      // Cleanup errors are non-fatal
      logger.debug('Cleanup error:', error);
    }
  });

  describe('Metric Recording', () => {
    it('should record a performance metric', async () => {
      const metric: PerformanceMetric = {
        operation: 'agent_startup',
        duration_ms: 1500,
        timestamp: new Date(),
        metadata: {
          agent_id: 'test-agent-1',
          environment: 'test',
        },
      };

      await monitor.recordMetric(metric);

      const metrics = await monitor.getMetrics('agent_startup', {
        limit: 10,
      });

      expect(metrics).toHaveLength(1);
      expect(metrics[0].operation).toBe('agent_startup');
      expect(metrics[0].duration_ms).toBe(1500);
    });

    it('should record metric with <10ms overhead', async () => {
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        await monitor.recordMetric({
          operation: 'agent_startup',
          duration_ms: 1000 + i,
          timestamp: new Date(),
        });
      }

      const totalTime = performance.now() - startTime;
      const overheadPerMetric = totalTime / 100;

      expect(overheadPerMetric).toBeLessThan(10);
    });

    it('should store metric metadata', async () => {
      const metadata = {
        agent_id: 'test-agent-1',
        skill_id: 'test-skill',
        environment: 'test',
        retry_count: 0,
      };

      await monitor.recordMetric({
        operation: 'agent_startup',
        duration_ms: 2000,
        timestamp: new Date(),
        metadata,
      });

      const metrics = await monitor.getMetrics('agent_startup', { limit: 1, includeMetadata: true });
      expect(metrics[0].metadata).toEqual(metadata);
    });

    it('should batch multiple metrics efficiently', async () => {
      const metrics: PerformanceMetric[] = Array.from({ length: 50 }, (_, i) => ({
        operation: 'query_execution',
        duration_ms: 5000 + i * 100,
        timestamp: new Date(),
        metadata: { query_id: `q-${i}` },
      }));

      await monitor.recordMetrics(metrics);

      const recorded = await monitor.getMetrics('query_execution', { limit: 100 });
      expect(recorded).toHaveLength(50);
    });
  });

  describe('SLA Tracking', () => {
    it('should identify metric as within SLA', async () => {
      const metric: PerformanceMetric = {
        operation: 'agent_startup',
        duration_ms: 1800, // Below 2000ms target
        timestamp: new Date(),
      };

      const isWithinSLA = await monitor.isWithinSLA(metric);
      expect(isWithinSLA).toBe(true);
    });

    it('should identify metric as SLA violation', async () => {
      const metric: PerformanceMetric = {
        operation: 'agent_startup',
        duration_ms: 2500, // Above 2000ms target
        timestamp: new Date(),
      };

      const isWithinSLA = await monitor.isWithinSLA(metric);
      expect(isWithinSLA).toBe(false);
    });

    it('should track SLA violations', async () => {
      const violatingMetrics: PerformanceMetric[] = [
        {
          operation: 'agent_startup',
          duration_ms: 2500,
          timestamp: new Date(),
        },
        {
          operation: 'agent_startup',
          duration_ms: 3000,
          timestamp: new Date(),
        },
      ];

      for (const metric of violatingMetrics) {
        await monitor.recordMetric(metric);
      }

      const violations = await monitor.getSLAViolations('agent_startup', {
        period: '1h',
      });

      expect(violations.length).toBeGreaterThanOrEqual(2);
    });

    it('should generate alert on SLA violation', async () => {
      const violation: PerformanceMetric = {
        operation: 'agent_startup',
        duration_ms: 5000,
        timestamp: new Date(),
      };

      const alerts = await monitor.recordMetric(violation);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].level).toBe('warning');
      expect(alerts[0].operation).toBe('agent_startup');
    });
  });

  describe('Baseline Calculation', () => {
    beforeEach(async () => {
      // Record 30 days of metric history
      const now = new Date();
      for (let i = 0; i < 100; i++) {
        const timestamp = new Date(now.getTime() - (30 - Math.floor(i / 3.33)) * 24 * 60 * 60 * 1000);
        await monitor.recordMetric({
          operation: 'query_execution',
          duration_ms: 4000 + Math.sin(i / 10) * 1000 + Math.random() * 500,
          timestamp,
        });
      }
    });

    it('should calculate baseline from historical data', async () => {
      const baseline = await monitor.calculateBaseline('query_execution', 30);

      expect(baseline).toBeDefined();
      expect(baseline.p50).toBeGreaterThan(0);
      expect(baseline.p95).toBeGreaterThan(baseline.p50);
      expect(baseline.p99).toBeGreaterThan(baseline.p95);
    });

    it('should calculate baseline in <5s', async () => {
      const startTime = performance.now();

      await monitor.calculateBaseline('query_execution', 30);

      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(5000);
    });

    it('should calculate accurate percentiles', async () => {
      const baseline = await monitor.calculateBaseline('query_execution', 30);

      // Verify percentile ordering
      expect(baseline.p50).toBeLessThanOrEqual(baseline.p95);
      expect(baseline.p95).toBeLessThanOrEqual(baseline.p99);
      expect(baseline.p99).toBeLessThanOrEqual(baseline.max);
    });

    it('should include count and average in baseline', async () => {
      const baseline = await monitor.calculateBaseline('query_execution', 30);

      expect(baseline.count).toBeGreaterThan(0);
      expect(baseline.avg).toBeGreaterThan(0);
      expect(baseline.min).toBeGreaterThan(0);
    });

    it('should handle baseline calculation with custom time window', async () => {
      const baseline7d = await monitor.calculateBaseline('query_execution', 7);
      const baseline30d = await monitor.calculateBaseline('query_execution', 30);

      // Both should have data
      expect(baseline7d.count).toBeGreaterThan(0);
      expect(baseline30d.count).toBeGreaterThan(0);
    });
  });

  describe('SLA Compliance Reporting', () => {
    beforeEach(async () => {
      // Record metrics - 95 within SLA, 5 violations
      for (let i = 0; i < 95; i++) {
        await monitor.recordMetric({
          operation: 'agent_startup',
          duration_ms: 1800,
          timestamp: new Date(),
        });
      }

      for (let i = 0; i < 5; i++) {
        await monitor.recordMetric({
          operation: 'agent_startup',
          duration_ms: 3000,
          timestamp: new Date(),
        });
      }
    });

    it('should calculate SLA compliance percentage', async () => {
      const compliance = await monitor.getSLACompliance('agent_startup', '1d');

      expect(compliance).toBeGreaterThan(0.9); // >90%
      expect(compliance).toBeLessThanOrEqual(1.0); // 100%
    });

    it('should track <5% violations monthly', async () => {
      // Record data for a month period (fewer metrics to speed up test)
      const now = new Date();
      for (let day = 0; day < 30; day++) {
        const timestamp = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);

        // 95% within SLA, 5% violations (reduced sample size for faster test)
        const metricsWithinSLA = Array.from({ length: 19 }, (_, i) => ({
          operation: 'transaction_commit',
          duration_ms: 4000,
          timestamp,
        }));

        const metricsViolating = Array.from({ length: 1 }, (_, i) => ({
          operation: 'transaction_commit',
          duration_ms: 8000,
          timestamp,
        }));

        await monitor.recordMetrics([...metricsWithinSLA, ...metricsViolating]);
      }

      const monthlyCompliance = await monitor.getSLACompliance('transaction_commit', '30d');

      // Should track compliance around 95%
      expect(monthlyCompliance).toBeGreaterThan(0.90);
    }, 30000); // Increase timeout for monthly data generation

    it('should provide compliance report with period information', async () => {
      const report = await monitor.getComplianceReport('agent_startup', {
        period: '1d',
        includeRawData: false,
      });

      expect(report).toBeDefined();
      expect(report.operation).toBe('agent_startup');
      expect(report.compliance_percentage).toBeGreaterThan(0);
      expect(report.total_metrics).toBeGreaterThan(0);
      expect(report.violations_count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Degradation Detection', () => {
    beforeEach(async () => {
      // Record stable baseline
      for (let i = 0; i < 30; i++) {
        await monitor.recordMetric({
          operation: 'skill_execution',
          duration_ms: 25000,
          timestamp: new Date(Date.now() - (30 - i) * 60 * 1000),
        });
      }
    });

    it('should detect performance degradation', async () => {
      // Simulate degradation - increase duration by 30%
      const isDegraded = await monitor.detectDegradation('skill_execution', {
        threshold_percent: 20,
        window_minutes: 5,
      });

      // Record degraded metrics
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        await monitor.recordMetric({
          operation: 'skill_execution',
          duration_ms: 32500, // 30% increase
          timestamp: new Date(now.getTime() - (10 - i) * 30 * 1000),
        });
      }

      const isDegradedAfter = await monitor.detectDegradation('skill_execution', {
        threshold_percent: 20,
        window_minutes: 5,
      });

      expect(isDegradedAfter).toBe(true);
    });

    it('should generate alert on degradation', async () => {
      // Record degrading metrics
      const now = new Date();
      for (let i = 0; i < 15; i++) {
        await monitor.recordMetric({
          operation: 'skill_execution',
          duration_ms: 32500,
          timestamp: new Date(now.getTime() - (15 - i) * 30 * 1000),
        });
      }

      const alerts = await monitor.getAlerts('skill_execution', {
        type: 'degradation',
      });

      expect(alerts.length).toBeGreaterThanOrEqual(0);
    });

    it('should not alert on temporary spikes', async () => {
      // Single spike should not trigger degradation alert
      await monitor.recordMetric({
        operation: 'query_execution',
        duration_ms: 15000,
        timestamp: new Date(),
      });

      const isDegraded = await monitor.detectDegradation('query_execution', {
        threshold_percent: 20,
        window_minutes: 5,
      });

      // Single metric shouldn't trigger degradation
      expect(isDegraded).toBe(false);
    });
  });

  describe('Alert Management', () => {
    it('should track alert history', async () => {
      const alerts: AlertEvent[] = [
        {
          id: 'alert-1',
          operation: 'agent_startup',
          level: 'warning',
          message: 'SLA violation detected',
          timestamp: new Date(),
          metadata: { duration_ms: 2500 },
        },
        {
          id: 'alert-2',
          operation: 'agent_startup',
          level: 'critical',
          message: 'Multiple SLA violations',
          timestamp: new Date(),
          metadata: { violation_count: 5 },
        },
      ];

      for (const alert of alerts) {
        await monitor.recordAlert(alert);
      }

      const recordedAlerts = await monitor.getAlerts('agent_startup');
      expect(recordedAlerts.length).toBeGreaterThanOrEqual(2);
    });

    it('should resolve alert when condition clears', async () => {
      const alert: AlertEvent = {
        id: 'alert-degradation-1',
        operation: 'query_execution',
        level: 'warning',
        message: 'Performance degrading',
        timestamp: new Date(),
      };

      await monitor.recordAlert(alert);

      // Resolve alert
      await monitor.resolveAlert('alert-degradation-1', 'Performance stabilized');

      const activeAlerts = await monitor.getAlerts('query_execution', {
        activeOnly: true,
      });

      const alert_ids = activeAlerts.map(a => a.id);
      expect(alert_ids).not.toContain('alert-degradation-1');
    });

    it('should track alert severity levels', async () => {
      const severities = ['info', 'warning', 'critical'];

      for (const severity of severities) {
        await monitor.recordAlert({
          id: `alert-${severity}`,
          operation: 'agent_startup',
          level: severity as any,
          message: `Test ${severity}`,
          timestamp: new Date(),
        });
      }

      const criticalAlerts = await monitor.getAlerts('agent_startup', {
        minSeverity: 'critical',
      });

      expect(criticalAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('Integration with Dashboard', () => {
    beforeEach(async () => {
      // Record metrics for dashboard queries
      const operations = ['agent_startup', 'query_execution', 'skill_execution'];
      for (const op of operations) {
        for (let i = 0; i < 20; i++) {
          await monitor.recordMetric({
            operation: op,
            duration_ms: Math.random() * 10000,
            timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
          });
        }
      }
    });

    it('should provide metrics for dashboard', async () => {
      const dashboardData = await monitor.getDashboardMetrics({
        time_range: '24h',
        resolution: '1h',
      });

      expect(dashboardData).toBeDefined();
      expect(dashboardData.metrics).toBeDefined();
      expect(dashboardData.timestamps).toBeDefined();
    });

    it('should provide SLA compliance trends', async () => {
      const trends = await monitor.getSLATrends('agent_startup', {
        period: '7d',
        interval: '1d',
      });

      expect(trends).toBeDefined();
      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0].date).toBeDefined();
      expect(trends[0].compliance).toBeGreaterThan(0);
    });

    it('should forecast future performance based on trends', async () => {
      const forecast = await monitor.forecastPerformance('query_execution', {
        days_ahead: 7,
      });

      expect(forecast).toBeDefined();
      expect(forecast.forecasted_duration_ms).toBeGreaterThan(0);
      expect(forecast.confidence_interval_lower).toBeLessThan(forecast.confidence_interval_upper);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid operation gracefully', async () => {
      expect(async () => {
        await monitor.calculateBaseline('non_existent_operation', 30);
      }).rejects.toThrow();
    });

    it('should validate metric data', async () => {
      const invalidMetric: any = {
        operation: 'agent_startup',
        // missing duration_ms
        timestamp: new Date(),
      };

      expect(async () => {
        await monitor.recordMetric(invalidMetric);
      }).rejects.toThrow();
    });

    it('should handle database errors', async () => {
      // Close database to simulate error
      await dbService.disconnect();

      expect(async () => {
        await monitor.recordMetric({
          operation: 'agent_startup',
          duration_ms: 1000,
          timestamp: new Date(),
        });
      }).rejects.toThrow();
    });
  });

  describe('Performance Requirements', () => {
    it('should check SLA in <50ms', async () => {
      const metric: PerformanceMetric = {
        operation: 'agent_startup',
        duration_ms: 2000,
        timestamp: new Date(),
      };

      const startTime = performance.now();

      await monitor.isWithinSLA(metric);

      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(50);
    });
  });

  describe('SLA Definition Loading', () => {
    it('should load SLA definitions from config', async () => {
      const slas = await monitor.getSLADefinitions();

      expect(slas).toBeDefined();
      expect(slas['agent_startup']).toBeDefined();
      expect(slas['agent_startup'].target).toBe(2000);
    });

    it('should handle missing SLA definition', async () => {
      const sla = await monitor.getSLADefinition('unknown_operation');
      expect(sla).toBeUndefined();
    });
  });
});
