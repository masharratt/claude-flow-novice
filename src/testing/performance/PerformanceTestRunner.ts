import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';

interface PerformanceTestConfig {
  name: string;
  description: string;
  duration: number;
  warmupDuration: number;
  concurrency: number;
  rampUpTime: number;
  rampDownTime: number;
  targetThroughput?: number;
  maxLatency?: number;
  successRate?: number;
  memoryLimit?: number;
  cpuLimit?: number;
}

interface PerformanceMetrics {
  timestamp: number;
  duration: number;
  throughput: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  successRate: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
  networkIO: number;
  diskIO: number;
}

interface TestResult {
  testName: string;
  status: 'PASSED' | 'FAILED' | 'WARNING';
  startTime: number;
  endTime: number;
  metrics: PerformanceMetrics;
  violations: string[];
  recommendations: string[];
}

export class PerformanceTestRunner extends EventEmitter {
  private testConfigs: Map<string, PerformanceTestConfig> = new Map();
  private activeTests: Map<string, any> = new Map();
  private testResults: Map<string, TestResult> = new Map();
  private resourceMonitor: ResourceMonitor;
  private reportGenerator: PerformanceReportGenerator;

  constructor() {
    super();
    this.resourceMonitor = new ResourceMonitor();
    this.reportGenerator = new PerformanceReportGenerator();
  }

  // Register performance test configuration
  registerTest(config: PerformanceTestConfig): void {
    this.testConfigs.set(config.name, config);
    console.log(`Registered performance test: ${config.name}`);
  }

  // Execute single performance test
  async runTest(testName: string, targetFunction: Function): Promise<TestResult> {
    const config = this.testConfigs.get(testName);
    if (!config) {
      throw new Error(`Test configuration not found: ${testName}`);
    }

    console.log(`Starting performance test: ${testName}`);
    const startTime = Date.now();

    // Start resource monitoring
    await this.resourceMonitor.startMonitoring(testName);

    try {
      // Warmup phase
      await this.executeWarmup(config, targetFunction);

      // Main test execution
      const metrics = await this.executeMainTest(config, targetFunction);

      // Stop monitoring and collect final metrics
      const finalMetrics = await this.resourceMonitor.stopMonitoring();

      // Combine metrics
      const combinedMetrics = this.combineMetrics(metrics, finalMetrics);

      // Evaluate test results
      const result = this.evaluateTestResult(testName, config, combinedMetrics, startTime);

      this.testResults.set(testName, result);
      this.emit('testCompleted', result);

      return result;

    } catch (error) {
      const failedResult: TestResult = {
        testName: testName,
        status: 'FAILED',
        startTime: startTime,
        endTime: Date.now(),
        metrics: this.getEmptyMetrics(),
        violations: [`Test execution failed: ${error.message}`],
        recommendations: ['Review test configuration and target function']
      };

      this.testResults.set(testName, failedResult);
      return failedResult;
    }
  }

  // Execute warmup phase
  private async executeWarmup(config: PerformanceTestConfig, targetFunction: Function): Promise<void> {
    console.log(`Executing warmup phase for ${config.warmupDuration}ms`);

    const warmupEndTime = Date.now() + config.warmupDuration;
    const warmupConcurrency = Math.min(config.concurrency, 5); // Limited warmup concurrency

    while (Date.now() < warmupEndTime) {
      const promises: Promise<any>[] = [];

      for (let i = 0; i < warmupConcurrency; i++) {
        promises.push(this.executeTargetFunction(targetFunction));
      }

      await Promise.allSettled(promises);
      await this.sleep(100); // Short pause between warmup batches
    }
  }

  // Execute main performance test
  private async executeMainTest(config: PerformanceTestConfig, targetFunction: Function): Promise<PerformanceMetrics> {
    console.log(`Executing main test phase for ${config.duration}ms`);

    const testStartTime = Date.now();
    const testEndTime = testStartTime + config.duration;

    const metrics = {
      requests: 0,
      successes: 0,
      failures: 0,
      latencies: [] as number[],
      startTime: testStartTime
    };

    // Ramp up phase
    const rampUpEndTime = testStartTime + config.rampUpTime;
    let currentConcurrency = 1;

    while (Date.now() < testEndTime) {
      const now = Date.now();

      // Calculate current concurrency based on ramp-up
      if (now < rampUpEndTime) {
        const rampUpProgress = (now - testStartTime) / config.rampUpTime;
        currentConcurrency = Math.ceil(config.concurrency * rampUpProgress);
      } else if (now > testEndTime - config.rampDownTime) {
        const rampDownProgress = (testEndTime - now) / config.rampDownTime;
        currentConcurrency = Math.ceil(config.concurrency * rampDownProgress);
      } else {
        currentConcurrency = config.concurrency;
      }

      // Execute concurrent requests
      const promises: Promise<{ success: boolean; latency: number }>[] = [];

      for (let i = 0; i < currentConcurrency; i++) {
        promises.push(this.executeAndMeasure(targetFunction));
      }

      const results = await Promise.allSettled(promises);

      // Collect metrics
      for (const result of results) {
        metrics.requests++;

        if (result.status === 'fulfilled') {
          if (result.value.success) {
            metrics.successes++;
            metrics.latencies.push(result.value.latency);
          } else {
            metrics.failures++;
          }
        } else {
          metrics.failures++;
        }
      }

      // Adaptive delay based on target throughput
      if (config.targetThroughput) {
        const currentThroughput = metrics.requests / ((Date.now() - testStartTime) / 1000);
        if (currentThroughput > config.targetThroughput) {
          await this.sleep(50); // Throttle if exceeding target
        }
      }
    }

    return this.calculateFinalMetrics(metrics, testStartTime);
  }

  // Execute target function and measure performance
  private async executeAndMeasure(targetFunction: Function): Promise<{ success: boolean; latency: number }> {
    const startTime = performance.now();

    try {
      await this.executeTargetFunction(targetFunction);
      const latency = performance.now() - startTime;
      return { success: true, latency };
    } catch (error) {
      const latency = performance.now() - startTime;
      return { success: false, latency };
    }
  }

  // Execute target function with error handling
  private async executeTargetFunction(targetFunction: Function): Promise<any> {
    try {
      const result = targetFunction();

      // Handle both sync and async functions
      if (result && typeof result.then === 'function') {
        return await result;
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  // Calculate final performance metrics
  private calculateFinalMetrics(metrics: any, startTime: number): PerformanceMetrics {
    const duration = Date.now() - startTime;
    const throughput = metrics.requests / (duration / 1000);
    const successRate = metrics.successes / metrics.requests;
    const errorRate = metrics.failures / metrics.requests;

    // Calculate latency percentiles
    const sortedLatencies = metrics.latencies.sort((a, b) => a - b);
    const avgLatency = sortedLatencies.reduce((sum, lat) => sum + lat, 0) / sortedLatencies.length || 0;
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);
    const p95Latency = sortedLatencies[p95Index] || 0;
    const p99Latency = sortedLatencies[p99Index] || 0;

    return {
      timestamp: startTime,
      duration: duration,
      throughput: throughput,
      avgLatency: avgLatency,
      p95Latency: p95Latency,
      p99Latency: p99Latency,
      successRate: successRate,
      errorRate: errorRate,
      memoryUsage: 0, // Will be filled by resource monitor
      cpuUsage: 0,    // Will be filled by resource monitor
      networkIO: 0,   // Will be filled by resource monitor
      diskIO: 0       // Will be filled by resource monitor
    };
  }

  // Combine performance and resource metrics
  private combineMetrics(perfMetrics: PerformanceMetrics, resourceMetrics: any): PerformanceMetrics {
    return {
      ...perfMetrics,
      memoryUsage: resourceMetrics.avgMemoryUsage || 0,
      cpuUsage: resourceMetrics.avgCpuUsage || 0,
      networkIO: resourceMetrics.totalNetworkIO || 0,
      diskIO: resourceMetrics.totalDiskIO || 0
    };
  }

  // Evaluate test results against thresholds
  private evaluateTestResult(testName: string, config: PerformanceTestConfig, metrics: PerformanceMetrics, startTime: number): TestResult {
    const violations: string[] = [];
    const recommendations: string[] = [];
    let status: 'PASSED' | 'FAILED' | 'WARNING' = 'PASSED';

    // Check throughput
    if (config.targetThroughput && metrics.throughput < config.targetThroughput * 0.9) {
      violations.push(`Throughput ${metrics.throughput.toFixed(2)} req/s below target ${config.targetThroughput} req/s`);
      recommendations.push('Consider optimizing critical path or increasing concurrency');
      status = 'FAILED';
    }

    // Check latency
    if (config.maxLatency && metrics.p95Latency > config.maxLatency) {
      violations.push(`P95 latency ${metrics.p95Latency.toFixed(2)}ms exceeds limit ${config.maxLatency}ms`);
      recommendations.push('Investigate latency bottlenecks and optimize slow operations');
      status = status === 'PASSED' ? 'WARNING' : status;
    }

    // Check success rate
    const minSuccessRate = config.successRate || 0.95;
    if (metrics.successRate < minSuccessRate) {
      violations.push(`Success rate ${(metrics.successRate * 100).toFixed(2)}% below threshold ${(minSuccessRate * 100).toFixed(2)}%`);
      recommendations.push('Review error handling and system stability');
      status = 'FAILED';
    }

    // Check memory usage
    if (config.memoryLimit && metrics.memoryUsage > config.memoryLimit) {
      violations.push(`Memory usage ${metrics.memoryUsage}MB exceeds limit ${config.memoryLimit}MB`);
      recommendations.push('Optimize memory allocation and implement garbage collection tuning');
      status = status === 'PASSED' ? 'WARNING' : status;
    }

    // Check CPU usage
    if (config.cpuLimit && metrics.cpuUsage > config.cpuLimit) {
      violations.push(`CPU usage ${metrics.cpuUsage.toFixed(2)}% exceeds limit ${config.cpuLimit}%`);
      recommendations.push('Optimize CPU-intensive operations and consider async processing');
      status = status === 'PASSED' ? 'WARNING' : status;
    }

    return {
      testName: testName,
      status: status,
      startTime: startTime,
      endTime: Date.now(),
      metrics: metrics,
      violations: violations,
      recommendations: recommendations
    };
  }

  // Run multiple tests in sequence
  async runTestSuite(tests: Array<{ name: string; function: Function }>): Promise<TestResult[]> {
    const results: TestResult[] = [];

    console.log(`Running performance test suite with ${tests.length} tests`);

    for (const test of tests) {
      try {
        const result = await this.runTest(test.name, test.function);
        results.push(result);

        // Brief pause between tests
        await this.sleep(2000);
      } catch (error) {
        console.error(`Failed to run test ${test.name}:`, error);
      }
    }

    // Generate comprehensive report
    await this.generateSuiteReport(results);

    return results;
  }

  // Generate comprehensive test suite report
  private async generateSuiteReport(results: TestResult[]): Promise<void> {
    const report = await this.reportGenerator.generateSuiteReport(results);

    // Save report to file
    const reportPath = path.join(process.cwd(), 'performance-reports', `suite-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`Performance test suite report saved to: ${reportPath}`);
  }

  // Get empty metrics for failed tests
  private getEmptyMetrics(): PerformanceMetrics {
    return {
      timestamp: Date.now(),
      duration: 0,
      throughput: 0,
      avgLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      successRate: 0,
      errorRate: 1,
      memoryUsage: 0,
      cpuUsage: 0,
      networkIO: 0,
      diskIO: 0
    };
  }

  // Utility sleep function
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get test results
  getTestResults(): Map<string, TestResult> {
    return this.testResults;
  }

  // Clear test results
  clearResults(): void {
    this.testResults.clear();
  }
}

// Resource monitoring class
class ResourceMonitor {
  private monitoring: boolean = false;
  private interval: NodeJS.Timeout | null = null;
  private metrics: any[] = [];

  async startMonitoring(testName: string): Promise<void> {
    this.monitoring = true;
    this.metrics = [];

    this.interval = setInterval(async () => {
      if (!this.monitoring) return;

      const metric = await this.collectResourceMetrics();
      this.metrics.push({
        timestamp: Date.now(),
        testName: testName,
        ...metric
      });
    }, 1000); // Collect every second
  }

  async stopMonitoring(): Promise<any> {
    this.monitoring = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    return this.aggregateMetrics();
  }

  private async collectResourceMetrics(): Promise<any> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memoryRSS: memoryUsage.rss / 1024 / 1024, // MB
      memoryHeap: memoryUsage.heapUsed / 1024 / 1024, // MB
      cpuUser: cpuUsage.user,
      cpuSystem: cpuUsage.system
    };
  }

  private aggregateMetrics(): any {
    if (this.metrics.length === 0) {
      return {
        avgMemoryUsage: 0,
        maxMemoryUsage: 0,
        avgCpuUsage: 0,
        maxCpuUsage: 0,
        totalNetworkIO: 0,
        totalDiskIO: 0
      };
    }

    const memoryValues = this.metrics.map(m => m.memoryRSS);
    const cpuValues = this.metrics.map(m => (m.cpuUser + m.cpuSystem) / 1000000); // Convert to ms

    return {
      avgMemoryUsage: memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length,
      maxMemoryUsage: Math.max(...memoryValues),
      avgCpuUsage: cpuValues.reduce((sum, val) => sum + val, 0) / cpuValues.length,
      maxCpuUsage: Math.max(...cpuValues),
      totalNetworkIO: 0, // Would need OS-specific implementation
      totalDiskIO: 0     // Would need OS-specific implementation
    };
  }
}

// Report generation class
class PerformanceReportGenerator {
  async generateSuiteReport(results: TestResult[]): Promise<any> {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.status === 'PASSED').length;
    const failedTests = results.filter(r => r.status === 'FAILED').length;
    const warningTests = results.filter(r => r.status === 'WARNING').length;

    const avgThroughput = results.reduce((sum, r) => sum + r.metrics.throughput, 0) / totalTests;
    const avgLatency = results.reduce((sum, r) => sum + r.metrics.avgLatency, 0) / totalTests;
    const avgSuccessRate = results.reduce((sum, r) => sum + r.metrics.successRate, 0) / totalTests;

    return {
      summary: {
        totalTests: totalTests,
        passedTests: passedTests,
        failedTests: failedTests,
        warningTests: warningTests,
        successRate: passedTests / totalTests,
        avgThroughput: avgThroughput,
        avgLatency: avgLatency,
        avgSuccessRate: avgSuccessRate
      },
      results: results,
      timestamp: Date.now(),
      recommendations: this.generateRecommendations(results)
    };
  }

  private generateRecommendations(results: TestResult[]): string[] {
    const recommendations = new Set<string>();

    results.forEach(result => {
      result.recommendations.forEach(rec => recommendations.add(rec));
    });

    return Array.from(recommendations);
  }
}