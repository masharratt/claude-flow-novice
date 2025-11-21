/**
 * Workflow Codification Performance Test Suite
 * Performance testing and benchmarking for workflow codification
 *
 * Migration from: docker/tests/test-workflow-codification-performance.sh
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

interface PerformanceMetric {
  name: string;
  duration: number;
  threshold: number;
  passed: boolean;
}

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
}

class WorkflowPerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private benchmarks: Map<string, BenchmarkResult> = new Map();

  /**
   * Measure operation duration
   */
  async measureDuration(
    name: string,
    operation: () => Promise<void>,
    threshold: number = 1000
  ): Promise<PerformanceMetric> {
    const start = performance.now();
    await operation();
    const duration = performance.now() - start;

    const metric: PerformanceMetric = {
      name,
      duration,
      threshold,
      passed: duration <= threshold
    };

    this.metrics.push(metric);
    return metric;
  }

  /**
   * Benchmark an operation
   */
  async benchmark(
    name: string,
    operation: () => Promise<void>,
    iterations: number = 10
  ): Promise<BenchmarkResult> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const duration = performance.now() - start;
      times.push(duration);
    }

    const totalTime = times.reduce((sum, t) => sum + t, 0);
    const avgTime = totalTime / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    const result: BenchmarkResult = {
      operation: name,
      iterations,
      totalTime,
      avgTime,
      minTime,
      maxTime
    };

    this.benchmarks.set(name, result);
    return result;
  }

  /**
   * Get metrics
   */
  getMetrics(): PerformanceMetric[] {
    return this.metrics;
  }

  /**
   * Get benchmark result
   */
  getBenchmark(name: string): BenchmarkResult | undefined {
    return this.benchmarks.get(name);
  }

  /**
   * Get all benchmarks
   */
  getAllBenchmarks(): Map<string, BenchmarkResult> {
    return new Map(this.benchmarks);
  }

  /**
   * Check if all metrics passed threshold
   */
  allMetricsPassed(): boolean {
    return this.metrics.every(m => m.passed);
  }

  /**
   * Calculate performance summary
   */
  getSummary(): {
    totalMetrics: number;
    passedMetrics: number;
    failedMetrics: number;
    passRate: number;
    averageOverhead: number;
  } {
    const total = this.metrics.length;
    const passed = this.metrics.filter(m => m.passed).length;
    const failed = total - passed;

    let totalDuration = 0;
    let totalThreshold = 0;
    this.metrics.forEach(m => {
      totalDuration += m.duration;
      totalThreshold += m.threshold;
    });

    const overhead = totalThreshold > 0
      ? (totalDuration / totalThreshold) * 100
      : 0;

    return {
      totalMetrics: total,
      passedMetrics: passed,
      failedMetrics: failed,
      passRate: total > 0 ? (passed / total) * 100 : 0,
      averageOverhead: overhead
    };
  }

  /**
   * Simulate slow operation
   */
  async slowOperation(duration: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  /**
   * Simulate fast operation
   */
  async fastOperation(): Promise<void> {
    const array: number[] = [];
    for (let i = 0; i < 1000; i++) {
      array.push(i);
    }
  }

  /**
   * Clear metrics and benchmarks
   */
  clear(): void {
    this.metrics = [];
    this.benchmarks.clear();
  }
}

describe('Workflow Codification Performance', () => {
  let monitor: WorkflowPerformanceMonitor;

  beforeEach(() => {
    monitor = new WorkflowPerformanceMonitor();
  });

  describe('Duration Measurement', () => {
    it('should measure operation duration', async () => {
      const metric = await monitor.measureDuration(
        'test-operation',
        async () => {
          await monitor.slowOperation(100);
        },
        1000
      );

      expect(metric.name).toBe('test-operation');
      expect(metric.duration).toBeGreaterThanOrEqual(100);
      expect(metric.passed).toBe(true);
    });

    it('should fail if operation exceeds threshold', async () => {
      const metric = await monitor.measureDuration(
        'slow-operation',
        async () => {
          await monitor.slowOperation(200);
        },
        100 // Threshold below actual duration
      );

      expect(metric.passed).toBe(false);
    });

    it('should pass if operation is within threshold', async () => {
      const metric = await monitor.measureDuration(
        'fast-operation',
        async () => {
          await monitor.fastOperation();
        },
        1000
      );

      expect(metric.passed).toBe(true);
    });
  });

  describe('Benchmarking', () => {
    it('should benchmark an operation', async () => {
      const result = await monitor.benchmark(
        'test-benchmark',
        async () => {
          await monitor.fastOperation();
        },
        5
      );

      expect(result.operation).toBe('test-benchmark');
      expect(result.iterations).toBe(5);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.avgTime).toBeGreaterThan(0);
      expect(result.minTime).toBeGreaterThan(0);
      expect(result.maxTime).toBeGreaterThan(0);
    });

    it('should calculate correct statistics', async () => {
      const result = await monitor.benchmark(
        'stats-test',
        async () => {
          await monitor.slowOperation(10);
        },
        5
      );

      expect(result.avgTime).toBeLessThanOrEqual(result.maxTime);
      expect(result.avgTime).toBeGreaterThanOrEqual(result.minTime);
      expect(result.totalTime).toBeCloseTo(result.avgTime * result.iterations, 0);
    });

    it('should handle single iteration benchmark', async () => {
      const result = await monitor.benchmark(
        'single-iter',
        async () => {
          await monitor.fastOperation();
        },
        1
      );

      expect(result.iterations).toBe(1);
      expect(result.avgTime).toBe(result.totalTime);
      expect(result.minTime).toBe(result.maxTime);
    });
  });

  describe('Metrics Retrieval', () => {
    it('should get all metrics', async () => {
      await monitor.measureDuration('metric1', async () => monitor.fastOperation(), 1000);
      await monitor.measureDuration('metric2', async () => monitor.fastOperation(), 1000);

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].name).toBe('metric1');
      expect(metrics[1].name).toBe('metric2');
    });

    it('should get specific benchmark', async () => {
      await monitor.benchmark('bench1', async () => monitor.fastOperation(), 3);

      const result = monitor.getBenchmark('bench1');
      expect(result).toBeDefined();
      expect(result?.operation).toBe('bench1');
    });

    it('should return undefined for non-existent benchmark', () => {
      const result = monitor.getBenchmark('non-existent');
      expect(result).toBeUndefined();
    });

    it('should get all benchmarks', async () => {
      await monitor.benchmark('bench1', async () => monitor.fastOperation(), 3);
      await monitor.benchmark('bench2', async () => monitor.fastOperation(), 3);

      const benchmarks = monitor.getAllBenchmarks();
      expect(benchmarks.size).toBe(2);
    });
  });

  describe('Threshold Checking', () => {
    it('should check if all metrics passed', async () => {
      await monitor.measureDuration('metric1', async () => monitor.fastOperation(), 1000);
      await monitor.measureDuration('metric2', async () => monitor.fastOperation(), 1000);

      expect(monitor.allMetricsPassed()).toBe(true);
    });

    it('should detect failed metrics', async () => {
      await monitor.measureDuration('fast', async () => monitor.fastOperation(), 1000);
      await monitor.measureDuration('slow', async () => monitor.slowOperation(200), 100);

      expect(monitor.allMetricsPassed()).toBe(false);
    });
  });

  describe('Performance Summary', () => {
    it('should calculate summary statistics', async () => {
      await monitor.measureDuration('metric1', async () => monitor.fastOperation(), 1000);
      await monitor.measureDuration('metric2', async () => monitor.slowOperation(50), 1000);

      const summary = monitor.getSummary();

      expect(summary).toHaveProperty('totalMetrics');
      expect(summary).toHaveProperty('passedMetrics');
      expect(summary).toHaveProperty('failedMetrics');
      expect(summary).toHaveProperty('passRate');
      expect(summary).toHaveProperty('averageOverhead');

      expect(summary.totalMetrics).toBe(2);
      expect(summary.passedMetrics + summary.failedMetrics).toBe(summary.totalMetrics);
    });

    it('should calculate pass rate correctly', async () => {
      await monitor.measureDuration('pass1', async () => monitor.fastOperation(), 1000);
      await monitor.measureDuration('pass2', async () => monitor.fastOperation(), 1000);
      await monitor.measureDuration('fail1', async () => monitor.slowOperation(200), 100);

      const summary = monitor.getSummary();
      expect(summary.passRate).toBeCloseTo(66.67, 1);
    });

    it('should calculate average overhead', async () => {
      await monitor.measureDuration('metric', async () => monitor.slowOperation(50), 100);

      const summary = monitor.getSummary();
      expect(summary.averageOverhead).toBeGreaterThanOrEqual(0);
      expect(summary.averageOverhead).toBeLessThanOrEqual(100);
    });
  });

  describe('State Management', () => {
    it('should clear metrics and benchmarks', async () => {
      await monitor.measureDuration('metric', async () => monitor.fastOperation(), 1000);
      await monitor.benchmark('bench', async () => monitor.fastOperation(), 3);

      monitor.clear();

      expect(monitor.getMetrics()).toHaveLength(0);
      expect(monitor.getAllBenchmarks().size).toBe(0);
    });
  });

  describe('Performance Characteristics', () => {
    it('should demonstrate linear scaling', async () => {
      for (let i = 1; i <= 3; i++) {
        await monitor.benchmark(
          `scale-${i}`,
          async () => {
            await monitor.slowOperation(50 * i);
          },
          2
        );
      }

      const bench1 = monitor.getBenchmark('scale-1');
      const bench2 = monitor.getBenchmark('scale-2');
      const bench3 = monitor.getBenchmark('scale-3');

      expect(bench1).toBeDefined();
      expect(bench2).toBeDefined();
      expect(bench3).toBeDefined();

      // Verify scaling trend
      if (bench1 && bench2 && bench3) {
        expect(bench2.avgTime).toBeGreaterThan(bench1.avgTime);
        expect(bench3.avgTime).toBeGreaterThan(bench2.avgTime);
      }
    });
  });
});
