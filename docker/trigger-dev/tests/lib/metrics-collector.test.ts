/**
 * Unit Tests for MetricsCollector
 *
 * Tests comprehensive metrics collection for Prometheus monitoring.
 * Covers task completion, RuVector queries, gate checks, SLA breaches,
 * errors, escalations, and export formats.
 *
 * Test Coverage:
 * - Task completion tracking (success/failure)
 * - RuVector query latency and cache hit rates
 * - Gate check pass/fail tracking
 * - SLA breach threshold monitoring
 * - Error tracking by component
 * - Tier escalation counting
 * - Prometheus format export
 * - JSON format export
 * - Summary generation
 * - Metrics reset
 *
 * @module metrics-collector.test
 */

import {
  MetricsCollector,
  initializeMetricsCollector,
  getMetricsCollector,
  TaskMetric,
  RuVectorQueryMetric,
  GateCheckMetric,
  SLABreachMetric,
} from '../../src/lib/metrics-collector.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  // =============================================
  // Task Completion Tests
  // =============================================

  describe('Task Completion Tracking', () => {
    it('should record task completion with success status', () => {
      const task: TaskMetric = {
        taskId: 'task-1',
        status: 'completed',
        completedAt: new Date(),
        durationMs: 1500,
        tier: 1,
      };

      collector.recordTaskCompletion(task);

      expect(collector.getTaskCompletionRate()).toBe(1.0);
      expect(collector.getAverageTaskDuration()).toBe(1500);
    });

    it('should record task completion with failure status', () => {
      const task: TaskMetric = {
        taskId: 'task-2',
        status: 'failed',
        completedAt: new Date(),
        durationMs: 500,
        tier: 2,
      };

      collector.recordTaskCompletion(task);

      expect(collector.getTaskCompletionRate()).toBe(0);
    });

    it('should calculate completion rate correctly for mixed tasks', () => {
      const tasks: TaskMetric[] = [
        { taskId: 'task-1', status: 'completed', durationMs: 1000 },
        { taskId: 'task-2', status: 'completed', durationMs: 2000 },
        { taskId: 'task-3', status: 'failed', durationMs: 500 },
        { taskId: 'task-4', status: 'completed', durationMs: 1500 },
      ];

      tasks.forEach((task) => collector.recordTaskCompletion(task));

      expect(collector.getTaskCompletionRate()).toBe(0.75); // 3/4 completed
      expect(collector.getAverageTaskDuration()).toBe(1250); // (1000+2000+500+1500)/4
    });

    it('should return 0 completion rate for empty metrics', () => {
      expect(collector.getTaskCompletionRate()).toBe(0);
      expect(collector.getAverageTaskDuration()).toBe(0);
    });

    it('should handle task without duration', () => {
      const task: TaskMetric = {
        taskId: 'task-no-duration',
        status: 'completed',
      };

      collector.recordTaskCompletion(task);

      expect(collector.getTaskCompletionRate()).toBe(1.0);
      expect(collector.getAverageTaskDuration()).toBe(0); // Excludes tasks without duration
    });

    it('should track pending and running tasks', () => {
      const tasks: TaskMetric[] = [
        { taskId: 'task-1', status: 'pending' },
        { taskId: 'task-2', status: 'running' },
        { taskId: 'task-3', status: 'completed', durationMs: 1000 },
      ];

      tasks.forEach((task) => collector.recordTaskCompletion(task));

      expect(collector.getTaskCompletionRate()).toBeCloseTo(0.33, 1); // 1/3 completed
    });
  });

  // =============================================
  // RuVector Query Tests
  // =============================================

  describe('RuVector Query Tracking', () => {
    it('should record RuVector query with cache hit', () => {
      const query: RuVectorQueryMetric = {
        queryId: 'query-1',
        latencyMs: 50,
        tokensUsed: 100,
        cacheHit: true,
        completedAt: new Date(),
      };

      collector.recordRuVectorQuery(query);

      expect(collector.getRuVectorAverageLatency()).toBe(50);
      expect(collector.getRuVectorCacheHitRate()).toBe(1.0);
    });

    it('should record RuVector query with cache miss', () => {
      const query: RuVectorQueryMetric = {
        queryId: 'query-2',
        latencyMs: 200,
        tokensUsed: 500,
        cacheHit: false,
        completedAt: new Date(),
      };

      collector.recordRuVectorQuery(query);

      expect(collector.getRuVectorAverageLatency()).toBe(200);
      expect(collector.getRuVectorCacheHitRate()).toBe(0);
    });

    it('should calculate average latency for multiple queries', () => {
      const queries: RuVectorQueryMetric[] = [
        { queryId: 'q1', latencyMs: 100, tokensUsed: 50, cacheHit: true, completedAt: new Date() },
        { queryId: 'q2', latencyMs: 200, tokensUsed: 100, cacheHit: false, completedAt: new Date() },
        { queryId: 'q3', latencyMs: 150, tokensUsed: 75, cacheHit: true, completedAt: new Date() },
      ];

      queries.forEach((q) => collector.recordRuVectorQuery(q));

      expect(collector.getRuVectorAverageLatency()).toBe(150); // (100+200+150)/3
      expect(collector.getRuVectorCacheHitRate()).toBeCloseTo(0.667, 2); // 2/3
    });

    it('should identify high-latency queries (>2000ms)', () => {
      const queries: RuVectorQueryMetric[] = [
        { queryId: 'q1', latencyMs: 1000, tokensUsed: 50, cacheHit: true, completedAt: new Date() },
        { queryId: 'q2', latencyMs: 2500, tokensUsed: 100, cacheHit: false, completedAt: new Date() },
        { queryId: 'q3', latencyMs: 3000, tokensUsed: 200, cacheHit: false, completedAt: new Date() },
        { queryId: 'q4', latencyMs: 500, tokensUsed: 25, cacheHit: true, completedAt: new Date() },
      ];

      queries.forEach((q) => collector.recordRuVectorQuery(q));

      const highLatency = collector.getHighLatencyQueries();
      expect(highLatency).toHaveLength(2);
      expect(highLatency[0].latencyMs).toBeGreaterThan(2000);
      expect(highLatency[1].latencyMs).toBeGreaterThan(2000);
    });

    it('should return 0 for empty RuVector metrics', () => {
      expect(collector.getRuVectorAverageLatency()).toBe(0);
      expect(collector.getRuVectorCacheHitRate()).toBe(0);
      expect(collector.getHighLatencyQueries()).toEqual([]);
    });
  });

  // =============================================
  // Gate Check Tests
  // =============================================

  describe('Gate Check Tracking', () => {
    it('should record passing gate check', () => {
      const check: GateCheckMetric = {
        checkId: 'check-1',
        passed: true,
        passRate: 0.95,
        testsRun: 100,
        testsPassed: 95,
        durationMs: 5000,
        completedAt: new Date(),
      };

      collector.recordGateCheck(check);

      expect(collector.getGateCheckPassRate()).toBe(1.0);
    });

    it('should record failing gate check', () => {
      const check: GateCheckMetric = {
        checkId: 'check-2',
        passed: false,
        passRate: 0.60,
        testsRun: 100,
        testsPassed: 60,
        durationMs: 3000,
        completedAt: new Date(),
      };

      collector.recordGateCheck(check);

      expect(collector.getGateCheckPassRate()).toBe(0);
    });

    it('should calculate pass rate for multiple checks', () => {
      const checks: GateCheckMetric[] = [
        {
          checkId: 'c1',
          passed: true,
          passRate: 0.95,
          testsRun: 100,
          testsPassed: 95,
          durationMs: 5000,
          completedAt: new Date(),
        },
        {
          checkId: 'c2',
          passed: true,
          passRate: 0.98,
          testsRun: 100,
          testsPassed: 98,
          durationMs: 4500,
          completedAt: new Date(),
        },
        {
          checkId: 'c3',
          passed: false,
          passRate: 0.70,
          testsRun: 100,
          testsPassed: 70,
          durationMs: 3000,
          completedAt: new Date(),
        },
      ];

      checks.forEach((c) => collector.recordGateCheck(c));

      expect(collector.getGateCheckPassRate()).toBeCloseTo(0.667, 2); // 2/3 passed
    });

    it('should identify failed gate checks', () => {
      const checks: GateCheckMetric[] = [
        {
          checkId: 'c1',
          passed: true,
          passRate: 0.95,
          testsRun: 100,
          testsPassed: 95,
          durationMs: 5000,
          completedAt: new Date(),
        },
        {
          checkId: 'c2',
          passed: false,
          passRate: 0.60,
          testsRun: 100,
          testsPassed: 60,
          durationMs: 3000,
          completedAt: new Date(),
        },
      ];

      checks.forEach((c) => collector.recordGateCheck(c));

      const failedChecks = collector.getFailedGateChecks();
      expect(failedChecks).toHaveLength(1);
      expect(failedChecks[0].passed).toBe(false);
    });

    it('should return 0 for empty gate check metrics', () => {
      expect(collector.getGateCheckPassRate()).toBe(0);
      expect(collector.getFailedGateChecks()).toEqual([]);
    });
  });

  // =============================================
  // SLA Breach Tests
  // =============================================

  describe('SLA Breach Tracking', () => {
    it('should record SLA breach', () => {
      const breach: SLABreachMetric = {
        slaId: 'sla-1',
        slaName: 'Response Time',
        breachedAt: new Date(),
        actualMs: 5000,
        targetMs: 3000,
        phase: 'implementation',
      };

      collector.recordSLABreach(breach);

      expect(collector.getSLABreachCount()).toBe(1);
    });

    it('should track multiple SLA breaches', () => {
      const breaches: SLABreachMetric[] = [
        {
          slaId: 'sla-1',
          slaName: 'Response Time',
          breachedAt: new Date(),
          actualMs: 5000,
          targetMs: 3000,
          phase: 'implementation',
        },
        {
          slaId: 'sla-2',
          slaName: 'Test Coverage',
          breachedAt: new Date(),
          actualMs: 7000,
          targetMs: 5000,
          phase: 'validation',
        },
      ];

      breaches.forEach((b) => collector.recordSLABreach(b));

      expect(collector.getSLABreachCount()).toBe(2);
    });

    it('should calculate SLA breach rate per 1000 tasks', () => {
      // Record 10 tasks
      for (let i = 0; i < 10; i++) {
        collector.recordTaskCompletion({
          taskId: `task-${i}`,
          status: 'completed',
          durationMs: 1000,
        });
      }

      // Record 3 SLA breaches
      for (let i = 0; i < 3; i++) {
        collector.recordSLABreach({
          slaId: `sla-${i}`,
          slaName: 'Test Breach',
          breachedAt: new Date(),
          actualMs: 5000,
          targetMs: 3000,
          phase: 'test',
        });
      }

      // (3 breaches / 10 tasks) * 1000 = 300
      expect(collector.getSLABreachRate()).toBe(300);
    });

    it('should return 0 breach rate with no tasks', () => {
      collector.recordSLABreach({
        slaId: 'sla-1',
        slaName: 'Test',
        breachedAt: new Date(),
        actualMs: 5000,
        targetMs: 3000,
        phase: 'test',
      });

      expect(collector.getSLABreachRate()).toBe(0);
    });
  });

  // =============================================
  // Error Tracking Tests
  // =============================================

  describe('Error Tracking', () => {
    it('should record error by component', () => {
      collector.recordError('coordinator', 'timeout');

      expect(collector.getErrorRate()).toBe(0); // No tasks yet
    });

    it('should count multiple errors for same component', () => {
      collector.recordError('agent', 'network-failure');
      collector.recordError('agent', 'network-failure');
      collector.recordError('agent', 'network-failure');

      // Add tasks for rate calculation
      collector.recordTaskCompletion({ taskId: 'task-1', status: 'completed' });

      expect(collector.getErrorRate()).toBe(300); // (3 errors / 1 task) * 100
    });

    it('should track errors across different components', () => {
      collector.recordError('coordinator', 'timeout');
      collector.recordError('agent', 'network-failure');
      collector.recordError('validator', 'validation-error');

      collector.recordTaskCompletion({ taskId: 'task-1', status: 'completed' });

      expect(collector.getErrorRate()).toBe(300); // (3 errors / 1 task) * 100
    });

    it('should return 0 error rate with no tasks', () => {
      collector.recordError('coordinator', 'timeout');

      expect(collector.getErrorRate()).toBe(0);
    });
  });

  // =============================================
  // Escalation Tracking Tests
  // =============================================

  describe('Tier Escalation Tracking', () => {
    it('should record single tier escalation', () => {
      collector.recordEscalation(2);

      const summary = collector.getEscalationSummary();
      expect(summary[2]).toBe(1);
    });

    it('should count multiple escalations to same tier', () => {
      collector.recordEscalation(3);
      collector.recordEscalation(3);
      collector.recordEscalation(3);

      const summary = collector.getEscalationSummary();
      expect(summary[3]).toBe(3);
    });

    it('should track escalations across multiple tiers', () => {
      collector.recordEscalation(1);
      collector.recordEscalation(2);
      collector.recordEscalation(2);
      collector.recordEscalation(3);

      const summary = collector.getEscalationSummary();
      expect(summary[1]).toBe(1);
      expect(summary[2]).toBe(2);
      expect(summary[3]).toBe(1);
    });

    it('should return empty summary for no escalations', () => {
      const summary = collector.getEscalationSummary();
      expect(summary).toEqual({});
    });
  });

  // =============================================
  // Prometheus Export Tests
  // =============================================

  describe('Prometheus Format Export', () => {
    it('should export valid Prometheus format', () => {
      // Add sample data
      collector.recordTaskCompletion({
        taskId: 'task-1',
        status: 'completed',
        durationMs: 1000,
      });
      collector.recordRuVectorQuery({
        queryId: 'q1',
        latencyMs: 100,
        tokensUsed: 50,
        cacheHit: true,
        completedAt: new Date(),
      });

      const prometheus = collector.exportPrometheus();

      expect(prometheus).toContain('# HELP cfn_task_completion_rate');
      expect(prometheus).toContain('# TYPE cfn_task_completion_rate gauge');
      expect(prometheus).toContain('cfn_task_completion_rate 1');
      expect(prometheus).toContain('cfn_task_count 1');
      expect(prometheus).toContain('cfn_ruvector_queries_total 1');
    });

    it('should format floating point values correctly', () => {
      collector.recordTaskCompletion({ taskId: 'task-1', status: 'completed', durationMs: 1234 });
      collector.recordTaskCompletion({ taskId: 'task-2', status: 'completed', durationMs: 5678 });

      const prometheus = collector.exportPrometheus();

      expect(prometheus).toContain('cfn_task_duration_avg_ms 3456.00');
    });

    it('should include tier labels for escalations', () => {
      collector.recordEscalation(1);
      collector.recordEscalation(2);

      const prometheus = collector.exportPrometheus();

      expect(prometheus).toContain('cfn_tier_escalations_total{tier="1"} 1');
      expect(prometheus).toContain('cfn_tier_escalations_total{tier="2"} 1');
    });
  });

  // =============================================
  // JSON Export Tests
  // =============================================

  describe('JSON Format Export', () => {
    it('should export valid JSON structure', () => {
      collector.recordTaskCompletion({
        taskId: 'task-1',
        status: 'completed',
        durationMs: 1000,
      });

      const json = collector.exportJSON();

      expect(json.taskCompletionRate).toBeDefined();
      expect(json.taskCompletionRate.name).toBe('cfn_task_completion_rate');
      expect(json.taskCompletionRate.type).toBe('gauge');
      expect(json.taskCompletionRate.value).toBe(1);
    });

    it('should include all metric categories', () => {
      const json = collector.exportJSON();

      expect(json.taskCompletionRate).toBeDefined();
      expect(json.taskCount).toBeDefined();
      expect(json.taskDurationAvg).toBeDefined();
      expect(json.ruvectorQueries).toBeDefined();
      expect(json.ruvectorLatencyAvg).toBeDefined();
      expect(json.ruvectorCacheHitRate).toBeDefined();
      expect(json.gateCheckPassRate).toBeDefined();
      expect(json.slaBreaches).toBeDefined();
      expect(json.slaBreachRate).toBeDefined();
      expect(json.errorRate).toBeDefined();
    });
  });

  // =============================================
  // Summary Generation Tests
  // =============================================

  describe('Summary Generation', () => {
    it('should generate comprehensive summary', () => {
      collector.recordTaskCompletion({
        taskId: 'task-1',
        status: 'completed',
        durationMs: 1000,
      });
      collector.recordRuVectorQuery({
        queryId: 'q1',
        latencyMs: 100,
        tokensUsed: 50,
        cacheHit: true,
        completedAt: new Date(),
      });
      collector.recordGateCheck({
        checkId: 'check-1',
        passed: true,
        passRate: 0.95,
        testsRun: 100,
        testsPassed: 95,
        durationMs: 5000,
        completedAt: new Date(),
      });

      const summary = collector.getSummary();

      expect(summary.timestamp).toBeDefined();
      expect(summary.tasks).toBeDefined();
      expect((summary.tasks as any).total).toBe(1);
      expect(summary.ruvector).toBeDefined();
      expect((summary.ruvector as any).queriesTotal).toBe(1);
      expect(summary.gateChecks).toBeDefined();
      expect((summary.gateChecks as any).total).toBe(1);
      expect(summary.sla).toBeDefined();
      expect(summary.errors).toBeDefined();
      expect(summary.escalations).toBeDefined();
    });

    it('should include high-latency query count in summary', () => {
      collector.recordRuVectorQuery({
        queryId: 'q1',
        latencyMs: 2500,
        tokensUsed: 100,
        cacheHit: false,
        completedAt: new Date(),
      });

      const summary = collector.getSummary();

      expect((summary.ruvector as any).highLatencyQueries).toBe(1);
    });

    it('should include failed gate check count in summary', () => {
      collector.recordGateCheck({
        checkId: 'check-1',
        passed: false,
        passRate: 0.60,
        testsRun: 100,
        testsPassed: 60,
        durationMs: 3000,
        completedAt: new Date(),
      });

      const summary = collector.getSummary();

      expect((summary.gateChecks as any).failedChecks).toBe(1);
    });
  });

  // =============================================
  // Reset Functionality Tests
  // =============================================

  describe('Metrics Reset', () => {
    it('should clear all metrics on reset', () => {
      collector.recordTaskCompletion({ taskId: 'task-1', status: 'completed', durationMs: 1000 });
      collector.recordRuVectorQuery({
        queryId: 'q1',
        latencyMs: 100,
        tokensUsed: 50,
        cacheHit: true,
        completedAt: new Date(),
      });
      collector.recordGateCheck({
        checkId: 'check-1',
        passed: true,
        passRate: 0.95,
        testsRun: 100,
        testsPassed: 95,
        durationMs: 5000,
        completedAt: new Date(),
      });
      collector.recordError('test', 'error');
      collector.recordEscalation(1);

      collector.reset();

      expect(collector.getTaskCompletionRate()).toBe(0);
      expect(collector.getRuVectorAverageLatency()).toBe(0);
      expect(collector.getGateCheckPassRate()).toBe(0);
      expect(collector.getSLABreachCount()).toBe(0);
      expect(collector.getErrorRate()).toBe(0);
      expect(collector.getEscalationSummary()).toEqual({});
    });
  });

  // =============================================
  // Singleton Pattern Tests
  // =============================================

  describe('Singleton Pattern', () => {
    it('should initialize global collector', () => {
      const instance1 = initializeMetricsCollector();
      const instance2 = getMetricsCollector();

      expect(instance1).toBe(instance2);
    });

    it('should return same instance on multiple getMetricsCollector calls', () => {
      const instance1 = getMetricsCollector();
      const instance2 = getMetricsCollector();

      expect(instance1).toBe(instance2);
    });
  });
});
