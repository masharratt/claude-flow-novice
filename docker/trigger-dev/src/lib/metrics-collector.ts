/**
 * Metrics Collector for Prometheus
 *
 * Collects system and application metrics for monitoring.
 * Exports metrics in Prometheus-compatible format.
 *
 * Tracked Metrics:
 * - Task completion rates
 * - Tier escalation counts
 * - RuVector query latencies
 * - Gate check pass/fail rates
 * - SLA breach counts
 * - Error rates
 */

import { getLogger } from './structured-logger.js';

const logger = getLogger('metrics-collector');

export interface MetricValue {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  value: number | number[];
  labels?: Record<string, string>;
  buckets?: number[];
}

export interface PrometheusMetrics {
  [key: string]: MetricValue;
}

/**
 * Task completion metric
 */
export interface TaskMetric {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  completedAt?: Date;
  durationMs?: number;
  tier?: number;
}

/**
 * RuVector query metric
 */
export interface RuVectorQueryMetric {
  queryId: string;
  latencyMs: number;
  tokensUsed: number;
  cacheHit: boolean;
  completedAt: Date;
}

/**
 * Gate check metric
 */
export interface GateCheckMetric {
  checkId: string;
  passed: boolean;
  passRate: number;
  testsRun: number;
  testsPassed: number;
  durationMs: number;
  completedAt: Date;
}

/**
 * SLA breach metric
 */
export interface SLABreachMetric {
  slaId: string;
  slaName: string;
  breachedAt: Date;
  actualMs: number;
  targetMs: number;
  phase: string;
}

/**
 * Central metrics collector
 */
export class MetricsCollector {
  private taskMetrics: Map<string, TaskMetric> = new Map();
  private ruvectorMetrics: RuVectorQueryMetric[] = [];
  private gateCheckMetrics: GateCheckMetric[] = [];
  private slaBreachMetrics: SLABreachMetric[] = [];
  private errorCounts: Map<string, number> = new Map();
  private escalationCounts: Map<number, number> = new Map();

  /**
   * Record task completion
   */
  recordTaskCompletion(metric: TaskMetric): void {
    this.taskMetrics.set(metric.taskId, metric);
    logger.info('Task recorded', {
      taskId: metric.taskId,
      status: metric.status,
      durationMs: metric.durationMs,
      tier: metric.tier,
    });
  }

  /**
   * Record RuVector query latency
   */
  recordRuVectorQuery(metric: RuVectorQueryMetric): void {
    this.ruvectorMetrics.push(metric);
    logger.info('RuVector query recorded', {
      latencyMs: metric.latencyMs,
      tokensUsed: metric.tokensUsed,
      cacheHit: metric.cacheHit,
    });
  }

  /**
   * Record gate check result
   */
  recordGateCheck(metric: GateCheckMetric): void {
    this.gateCheckMetrics.push(metric);
    logger.info('Gate check recorded', {
      checkId: metric.checkId,
      passed: metric.passed,
      passRate: `${(metric.passRate * 100).toFixed(1)}%`,
      durationMs: metric.durationMs,
    });
  }

  /**
   * Record SLA breach
   */
  recordSLABreach(metric: SLABreachMetric): void {
    this.slaBreachMetrics.push(metric);
    logger.warn('SLA breach recorded', {
      slaName: metric.slaName,
      actualMs: metric.actualMs,
      targetMs: metric.targetMs,
      phase: metric.phase,
    });
  }

  /**
   * Record error occurrence
   */
  recordError(component: string, error: string): void {
    const key = `${component}:${error}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
    logger.warn('Error recorded', { component, error });
  }

  /**
   * Record tier escalation
   */
  recordEscalation(tier: number): void {
    this.escalationCounts.set(tier, (this.escalationCounts.get(tier) || 0) + 1);
    logger.info('Tier escalation recorded', { tier });
  }

  /**
   * Get task completion rate
   */
  getTaskCompletionRate(): number {
    const tasks = Array.from(this.taskMetrics.values());
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.status === 'completed').length;
    return completed / tasks.length;
  }

  /**
   * Get average task duration
   */
  getAverageTaskDuration(): number {
    const tasks = Array.from(this.taskMetrics.values()).filter(t => t.durationMs !== undefined);
    if (tasks.length === 0) return 0;
    const sum = tasks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
    return sum / tasks.length;
  }

  /**
   * Get RuVector average latency
   */
  getRuVectorAverageLatency(): number {
    if (this.ruvectorMetrics.length === 0) return 0;
    const sum = this.ruvectorMetrics.reduce((acc, m) => acc + m.latencyMs, 0);
    return sum / this.ruvectorMetrics.length;
  }

  /**
   * Get RuVector cache hit rate
   */
  getRuVectorCacheHitRate(): number {
    if (this.ruvectorMetrics.length === 0) return 0;
    const hits = this.ruvectorMetrics.filter(m => m.cacheHit).length;
    return hits / this.ruvectorMetrics.length;
  }

  /**
   * Get gate check pass rate
   */
  getGateCheckPassRate(): number {
    if (this.gateCheckMetrics.length === 0) return 0;
    const passed = this.gateCheckMetrics.filter(m => m.passed).length;
    return passed / this.gateCheckMetrics.length;
  }

  /**
   * Get SLA breach count
   */
  getSLABreachCount(): number {
    return this.slaBreachMetrics.length;
  }

  /**
   * Get SLA breach rate (breaches per 1000 tasks)
   */
  getSLABreachRate(): number {
    const taskCount = this.taskMetrics.size;
    if (taskCount === 0) return 0;
    return (this.slaBreachMetrics.length / taskCount) * 1000;
  }

  /**
   * Get error rate
   */
  getErrorRate(): number {
    const taskCount = this.taskMetrics.size;
    if (taskCount === 0) return 0;
    const errorCount = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);
    return (errorCount / taskCount) * 100;
  }

  /**
   * Get escalation summary
   */
  getEscalationSummary(): Record<number, number> {
    const summary: Record<number, number> = {};
    this.escalationCounts.forEach((count, tier) => {
      summary[tier] = count;
    });
    return summary;
  }

  /**
   * Get high-latency queries (>2000ms)
   */
  getHighLatencyQueries(): RuVectorQueryMetric[] {
    return this.ruvectorMetrics.filter(m => m.latencyMs > 2000);
  }

  /**
   * Get failed gate checks
   */
  getFailedGateChecks(): GateCheckMetric[] {
    return this.gateCheckMetrics.filter(m => !m.passed);
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Task completion metrics
    lines.push('# HELP cfn_task_completion_rate Task completion rate (0-1)');
    lines.push('# TYPE cfn_task_completion_rate gauge');
    lines.push(`cfn_task_completion_rate ${this.getTaskCompletionRate()}`);

    lines.push('# HELP cfn_task_count Total tasks processed');
    lines.push('# TYPE cfn_task_count counter');
    lines.push(`cfn_task_count ${this.taskMetrics.size}`);

    lines.push('# HELP cfn_task_duration_avg_ms Average task duration in milliseconds');
    lines.push('# TYPE cfn_task_duration_avg_ms gauge');
    lines.push(`cfn_task_duration_avg_ms ${this.getAverageTaskDuration().toFixed(2)}`);

    // RuVector metrics
    lines.push('# HELP cfn_ruvector_queries_total Total RuVector queries');
    lines.push('# TYPE cfn_ruvector_queries_total counter');
    lines.push(`cfn_ruvector_queries_total ${this.ruvectorMetrics.length}`);

    lines.push('# HELP cfn_ruvector_latency_avg_ms Average RuVector query latency');
    lines.push('# TYPE cfn_ruvector_latency_avg_ms gauge');
    lines.push(`cfn_ruvector_latency_avg_ms ${this.getRuVectorAverageLatency().toFixed(2)}`);

    lines.push('# HELP cfn_ruvector_cache_hit_rate RuVector cache hit rate (0-1)');
    lines.push('# TYPE cfn_ruvector_cache_hit_rate gauge');
    lines.push(`cfn_ruvector_cache_hit_rate ${this.getRuVectorCacheHitRate().toFixed(4)}`);

    // Gate check metrics
    lines.push('# HELP cfn_gate_checks_total Total gate checks performed');
    lines.push('# TYPE cfn_gate_checks_total counter');
    lines.push(`cfn_gate_checks_total ${this.gateCheckMetrics.length}`);

    lines.push('# HELP cfn_gate_check_pass_rate Gate check pass rate (0-1)');
    lines.push('# TYPE cfn_gate_check_pass_rate gauge');
    lines.push(`cfn_gate_check_pass_rate ${this.getGateCheckPassRate().toFixed(4)}`);

    // SLA metrics
    lines.push('# HELP cfn_sla_breaches_total Total SLA breaches');
    lines.push('# TYPE cfn_sla_breaches_total counter');
    lines.push(`cfn_sla_breaches_total ${this.getSLABreachCount()}`);

    lines.push('# HELP cfn_sla_breach_rate SLA breach rate per 1000 tasks');
    lines.push('# TYPE cfn_sla_breach_rate gauge');
    lines.push(`cfn_sla_breach_rate ${this.getSLABreachRate().toFixed(2)}`);

    // Error metrics
    lines.push('# HELP cfn_error_rate Error rate percentage');
    lines.push('# TYPE cfn_error_rate gauge');
    lines.push(`cfn_error_rate ${this.getErrorRate().toFixed(2)}`);

    lines.push('# HELP cfn_errors_total Total errors recorded');
    lines.push('# TYPE cfn_errors_total counter');
    const totalErrors = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);
    lines.push(`cfn_errors_total ${totalErrors}`);

    // Escalation metrics
    const escalationSummary = this.getEscalationSummary();
    lines.push('# HELP cfn_tier_escalations_total Total tier escalations by tier');
    lines.push('# TYPE cfn_tier_escalations_total counter');
    Object.entries(escalationSummary).forEach(([tier, count]) => {
      lines.push(`cfn_tier_escalations_total{tier="${tier}"} ${count}`);
    });

    return lines.join('\n');
  }

  /**
   * Export metrics as JSON
   */
  exportJSON(): PrometheusMetrics {
    return {
      taskCompletionRate: {
        name: 'cfn_task_completion_rate',
        help: 'Task completion rate (0-1)',
        type: 'gauge',
        value: this.getTaskCompletionRate(),
      },
      taskCount: {
        name: 'cfn_task_count',
        help: 'Total tasks processed',
        type: 'counter',
        value: this.taskMetrics.size,
      },
      taskDurationAvg: {
        name: 'cfn_task_duration_avg_ms',
        help: 'Average task duration in milliseconds',
        type: 'gauge',
        value: this.getAverageTaskDuration(),
      },
      ruvectorQueries: {
        name: 'cfn_ruvector_queries_total',
        help: 'Total RuVector queries',
        type: 'counter',
        value: this.ruvectorMetrics.length,
      },
      ruvectorLatencyAvg: {
        name: 'cfn_ruvector_latency_avg_ms',
        help: 'Average RuVector query latency',
        type: 'gauge',
        value: this.getRuVectorAverageLatency(),
      },
      ruvectorCacheHitRate: {
        name: 'cfn_ruvector_cache_hit_rate',
        help: 'RuVector cache hit rate (0-1)',
        type: 'gauge',
        value: this.getRuVectorCacheHitRate(),
      },
      gateCheckPassRate: {
        name: 'cfn_gate_check_pass_rate',
        help: 'Gate check pass rate (0-1)',
        type: 'gauge',
        value: this.getGateCheckPassRate(),
      },
      slaBreaches: {
        name: 'cfn_sla_breaches_total',
        help: 'Total SLA breaches',
        type: 'counter',
        value: this.getSLABreachCount(),
      },
      slaBreachRate: {
        name: 'cfn_sla_breach_rate',
        help: 'SLA breach rate per 1000 tasks',
        type: 'gauge',
        value: this.getSLABreachRate(),
      },
      errorRate: {
        name: 'cfn_error_rate',
        help: 'Error rate percentage',
        type: 'gauge',
        value: this.getErrorRate(),
      },
    };
  }

  /**
   * Get metrics summary
   */
  getSummary(): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      tasks: {
        total: this.taskMetrics.size,
        completionRate: this.getTaskCompletionRate(),
        averageDurationMs: this.getAverageTaskDuration(),
      },
      ruvector: {
        queriesTotal: this.ruvectorMetrics.length,
        averageLatencyMs: this.getRuVectorAverageLatency(),
        cacheHitRate: this.getRuVectorCacheHitRate(),
        highLatencyQueries: this.getHighLatencyQueries().length,
      },
      gateChecks: {
        total: this.gateCheckMetrics.length,
        passRate: this.getGateCheckPassRate(),
        failedChecks: this.getFailedGateChecks().length,
      },
      sla: {
        breachesTotal: this.getSLABreachCount(),
        breachRate: this.getSLABreachRate(),
      },
      errors: {
        total: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
        rate: this.getErrorRate(),
        byComponent: Object.fromEntries(this.errorCounts),
      },
      escalations: this.getEscalationSummary(),
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.taskMetrics.clear();
    this.ruvectorMetrics = [];
    this.gateCheckMetrics = [];
    this.slaBreachMetrics = [];
    this.errorCounts.clear();
    this.escalationCounts.clear();
    logger.info('Metrics reset');
  }
}

/**
 * Global metrics collector singleton
 */
let globalCollector: MetricsCollector | undefined;

export function initializeMetricsCollector(): MetricsCollector {
  if (!globalCollector) {
    globalCollector = new MetricsCollector();
  }
  return globalCollector;
}

export function getMetricsCollector(): MetricsCollector {
  if (!globalCollector) {
    globalCollector = new MetricsCollector();
  }
  return globalCollector;
}
