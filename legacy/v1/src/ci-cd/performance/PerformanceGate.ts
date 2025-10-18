import { PerformanceTestRunner, TestResult } from '../testing/performance/PerformanceTestRunner';
import { promises as fs } from 'fs';
import * as path from 'path';

interface PerformanceGateConfig {
  enabled: boolean;
  thresholds: {
    throughput: {
      min: number;
      regression: number; // Percentage regression allowed
    };
    latency: {
      p95: number;
      p99: number;
      regression: number;
    };
    successRate: {
      min: number;
    };
    resources: {
      memory: number;
      cpu: number;
    };
  };
  baseline: {
    enabled: boolean;
    path: string;
    autoUpdate: boolean;
  };
  notifications: {
    slack?: {
      webhook: string;
      channel: string;
    };
    email?: {
      enabled: boolean;
      recipients: string[];
    };
  };
}

interface BaselineMetrics {
  timestamp: number;
  version: string;
  branch: string;
  commit: string;
  metrics: {
    throughput: number;
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
    successRate: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

interface GateResult {
  passed: boolean;
  violations: string[];
  regressions: string[];
  improvements: string[];
  recommendation: 'PASS' | 'FAIL' | 'WARNING';
  details: {
    currentMetrics: any;
    baselineMetrics?: any;
    thresholds: any;
  };
}

export class PerformanceGate {
  private config: PerformanceGateConfig;
  private testRunner: PerformanceTestRunner;
  private baseline: BaselineMetrics | null = null;

  constructor(config: PerformanceGateConfig) {
    this.config = config;
    this.testRunner = new PerformanceTestRunner();
    this.loadBaseline();
  }

  // Load baseline metrics from file
  private async loadBaseline(): Promise<void> {
    if (!this.config.baseline.enabled) {
      return;
    }

    try {
      const baselinePath = path.resolve(this.config.baseline.path);
      const baselineData = await fs.readFile(baselinePath, 'utf-8');
      this.baseline = JSON.parse(baselineData);
      console.log(`Loaded performance baseline from: ${baselinePath}`);
    } catch (error) {
      console.warn(`Could not load performance baseline: ${error.message}`);
    }
  }

  // Execute performance gate validation
  async validatePerformance(
    tests: Array<{ name: string; function: Function }>,
  ): Promise<GateResult> {
    console.log('🚀 Starting performance gate validation');

    if (!this.config.enabled) {
      console.log('Performance gate is disabled, skipping validation');
      return this.createPassingResult('Performance gate disabled');
    }

    try {
      // Run performance tests
      const testResults = await this.testRunner.runTestSuite(tests);

      // Aggregate test metrics
      const aggregatedMetrics = this.aggregateTestMetrics(testResults);

      // Validate against thresholds
      const gateResult = await this.validateAgainstThresholds(aggregatedMetrics, testResults);

      // Update baseline if configured and tests passed
      if (gateResult.passed && this.config.baseline.autoUpdate) {
        await this.updateBaseline(aggregatedMetrics);
      }

      // Send notifications if configured
      await this.sendNotifications(gateResult);

      return gateResult;
    } catch (error) {
      console.error('Performance gate validation failed:', error);
      return this.createFailingResult([`Validation error: ${error.message}`]);
    }
  }

  // Aggregate metrics from multiple test results
  private aggregateTestMetrics(testResults: TestResult[]): any {
    const validResults = testResults.filter((r) => r.status !== 'FAILED');

    if (validResults.length === 0) {
      throw new Error('No valid test results to aggregate');
    }

    const totalThroughput = validResults.reduce((sum, r) => sum + r.metrics.throughput, 0);
    const avgThroughput = totalThroughput / validResults.length;

    const avgLatency =
      validResults.reduce((sum, r) => sum + r.metrics.avgLatency, 0) / validResults.length;
    const avgP95Latency =
      validResults.reduce((sum, r) => sum + r.metrics.p95Latency, 0) / validResults.length;
    const avgP99Latency =
      validResults.reduce((sum, r) => sum + r.metrics.p99Latency, 0) / validResults.length;

    const avgSuccessRate =
      validResults.reduce((sum, r) => sum + r.metrics.successRate, 0) / validResults.length;
    const avgMemoryUsage =
      validResults.reduce((sum, r) => sum + r.metrics.memoryUsage, 0) / validResults.length;
    const avgCpuUsage =
      validResults.reduce((sum, r) => sum + r.metrics.cpuUsage, 0) / validResults.length;

    return {
      throughput: avgThroughput,
      avgLatency: avgLatency,
      p95Latency: avgP95Latency,
      p99Latency: avgP99Latency,
      successRate: avgSuccessRate,
      memoryUsage: avgMemoryUsage,
      cpuUsage: avgCpuUsage,
      testCount: validResults.length,
      failedTestCount: testResults.length - validResults.length,
    };
  }

  // Validate metrics against configured thresholds
  private async validateAgainstThresholds(
    metrics: any,
    testResults: TestResult[],
  ): Promise<GateResult> {
    const violations: string[] = [];
    const regressions: string[] = [];
    const improvements: string[] = [];

    // Validate absolute thresholds
    if (metrics.throughput < this.config.thresholds.throughput.min) {
      violations.push(
        `Throughput ${metrics.throughput.toFixed(2)} req/s below minimum ${this.config.thresholds.throughput.min} req/s`,
      );
    }

    if (metrics.p95Latency > this.config.thresholds.latency.p95) {
      violations.push(
        `P95 latency ${metrics.p95Latency.toFixed(2)}ms exceeds threshold ${this.config.thresholds.latency.p95}ms`,
      );
    }

    if (metrics.p99Latency > this.config.thresholds.latency.p99) {
      violations.push(
        `P99 latency ${metrics.p99Latency.toFixed(2)}ms exceeds threshold ${this.config.thresholds.latency.p99}ms`,
      );
    }

    if (metrics.successRate < this.config.thresholds.successRate.min) {
      violations.push(
        `Success rate ${(metrics.successRate * 100).toFixed(2)}% below minimum ${(this.config.thresholds.successRate.min * 100).toFixed(2)}%`,
      );
    }

    if (metrics.memoryUsage > this.config.thresholds.resources.memory) {
      violations.push(
        `Memory usage ${metrics.memoryUsage.toFixed(2)}MB exceeds threshold ${this.config.thresholds.resources.memory}MB`,
      );
    }

    if (metrics.cpuUsage > this.config.thresholds.resources.cpu) {
      violations.push(
        `CPU usage ${metrics.cpuUsage.toFixed(2)}% exceeds threshold ${this.config.thresholds.resources.cpu}%`,
      );
    }

    // Validate against baseline (regression detection)
    if (this.baseline) {
      const regressionResults = this.detectRegressions(metrics, this.baseline.metrics);
      regressions.push(...regressionResults.regressions);
      improvements.push(...regressionResults.improvements);
    }

    // Determine overall result
    const passed = violations.length === 0 && regressions.length === 0;
    const hasWarnings = regressions.length > 0 || metrics.failedTestCount > 0;

    let recommendation: 'PASS' | 'FAIL' | 'WARNING';
    if (!passed) {
      recommendation = 'FAIL';
    } else if (hasWarnings) {
      recommendation = 'WARNING';
    } else {
      recommendation = 'PASS';
    }

    return {
      passed: passed,
      violations: violations,
      regressions: regressions,
      improvements: improvements,
      recommendation: recommendation,
      details: {
        currentMetrics: metrics,
        baselineMetrics: this.baseline?.metrics,
        thresholds: this.config.thresholds,
      },
    };
  }

  // Detect performance regressions compared to baseline
  private detectRegressions(
    current: any,
    baseline: any,
  ): { regressions: string[]; improvements: string[] } {
    const regressions: string[] = [];
    const improvements: string[] = [];

    // Throughput regression
    const throughputChange =
      ((current.throughput - baseline.throughput) / baseline.throughput) * 100;
    if (throughputChange < -this.config.thresholds.throughput.regression) {
      regressions.push(
        `Throughput regression: ${Math.abs(throughputChange).toFixed(2)}% decrease (${current.throughput.toFixed(2)} vs ${baseline.throughput.toFixed(2)} req/s)`,
      );
    } else if (throughputChange > 5) {
      improvements.push(`Throughput improved by ${throughputChange.toFixed(2)}%`);
    }

    // Latency regression
    const latencyChange = ((current.p95Latency - baseline.p95Latency) / baseline.p95Latency) * 100;
    if (latencyChange > this.config.thresholds.latency.regression) {
      regressions.push(
        `P95 latency regression: ${latencyChange.toFixed(2)}% increase (${current.p95Latency.toFixed(2)} vs ${baseline.p95Latency.toFixed(2)}ms)`,
      );
    } else if (latencyChange < -5) {
      improvements.push(`P95 latency improved by ${Math.abs(latencyChange).toFixed(2)}%`);
    }

    // Success rate regression
    const successRateChange = current.successRate - baseline.successRate;
    if (successRateChange < -0.01) {
      // 1% decrease
      regressions.push(
        `Success rate regression: ${(Math.abs(successRateChange) * 100).toFixed(2)}% decrease`,
      );
    } else if (successRateChange > 0.01) {
      improvements.push(`Success rate improved by ${(successRateChange * 100).toFixed(2)}%`);
    }

    return { regressions, improvements };
  }

  // Update baseline metrics
  private async updateBaseline(metrics: any): Promise<void> {
    if (!this.config.baseline.enabled) {
      return;
    }

    const gitInfo = await this.getGitInfo();

    const newBaseline: BaselineMetrics = {
      timestamp: Date.now(),
      version: gitInfo.version || 'unknown',
      branch: gitInfo.branch || 'unknown',
      commit: gitInfo.commit || 'unknown',
      metrics: {
        throughput: metrics.throughput,
        avgLatency: metrics.avgLatency,
        p95Latency: metrics.p95Latency,
        p99Latency: metrics.p99Latency,
        successRate: metrics.successRate,
        memoryUsage: metrics.memoryUsage,
        cpuUsage: metrics.cpuUsage,
      },
    };

    try {
      const baselinePath = path.resolve(this.config.baseline.path);
      await fs.mkdir(path.dirname(baselinePath), { recursive: true });
      await fs.writeFile(baselinePath, JSON.stringify(newBaseline, null, 2));

      this.baseline = newBaseline;
      console.log(`Updated performance baseline: ${baselinePath}`);
    } catch (error) {
      console.error(`Failed to update baseline: ${error.message}`);
    }
  }

  // Get Git information for baseline tracking
  private async getGitInfo(): Promise<{ version?: string; branch?: string; commit?: string }> {
    try {
      const { execSync } = require('child_process');

      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

      // Try to get version from package.json
      let version;
      try {
        const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
        version = packageJson.version;
      } catch {
        version = 'unknown';
      }

      return { version, branch, commit };
    } catch (error) {
      console.warn(`Could not get Git info: ${error.message}`);
      return {};
    }
  }

  // Send notifications about gate results
  private async sendNotifications(result: GateResult): Promise<void> {
    if (result.recommendation === 'PASS' && result.improvements.length === 0) {
      return; // Don't notify on successful runs without improvements
    }

    try {
      // Slack notification
      if (this.config.notifications.slack) {
        await this.sendSlackNotification(result);
      }

      // Email notification
      if (this.config.notifications.email?.enabled) {
        await this.sendEmailNotification(result);
      }
    } catch (error) {
      console.error(`Failed to send notifications: ${error.message}`);
    }
  }

  // Send Slack notification
  private async sendSlackNotification(result: GateResult): Promise<void> {
    const { webhook, channel } = this.config.notifications.slack!;

    const color =
      result.recommendation === 'PASS'
        ? 'good'
        : result.recommendation === 'WARNING'
          ? 'warning'
          : 'danger';

    const message = {
      channel: channel,
      attachments: [
        {
          color: color,
          title: `Performance Gate: ${result.recommendation}`,
          fields: [
            {
              title: 'Violations',
              value: result.violations.length > 0 ? result.violations.join('\n') : 'None',
              short: false,
            },
            {
              title: 'Regressions',
              value: result.regressions.length > 0 ? result.regressions.join('\n') : 'None',
              short: false,
            },
            {
              title: 'Improvements',
              value: result.improvements.length > 0 ? result.improvements.join('\n') : 'None',
              short: false,
            },
          ],
          timestamp: Math.floor(Date.now() / 1000),
        },
      ],
    };

    // Implementation would use HTTP client to send to Slack webhook
    console.log('Would send Slack notification:', JSON.stringify(message, null, 2));
  }

  // Send email notification
  private async sendEmailNotification(result: GateResult): Promise<void> {
    const recipients = this.config.notifications.email!.recipients;

    const subject = `Performance Gate ${result.recommendation}: ${result.violations.length} violations, ${result.regressions.length} regressions`;

    const body = `
Performance Gate Results:

Status: ${result.recommendation}
Timestamp: ${new Date().toISOString()}

Violations (${result.violations.length}):
${result.violations.map((v) => `- ${v}`).join('\n')}

Regressions (${result.regressions.length}):
${result.regressions.map((r) => `- ${r}`).join('\n')}

Improvements (${result.improvements.length}):
${result.improvements.map((i) => `- ${i}`).join('\n')}

Current Metrics:
- Throughput: ${result.details.currentMetrics.throughput?.toFixed(2)} req/s
- Avg Latency: ${result.details.currentMetrics.avgLatency?.toFixed(2)}ms
- P95 Latency: ${result.details.currentMetrics.p95Latency?.toFixed(2)}ms
- Success Rate: ${(result.details.currentMetrics.successRate * 100)?.toFixed(2)}%
- Memory Usage: ${result.details.currentMetrics.memoryUsage?.toFixed(2)}MB
- CPU Usage: ${result.details.currentMetrics.cpuUsage?.toFixed(2)}%
`;

    // Implementation would use email service
    console.log(`Would send email to ${recipients.join(', ')}:`, { subject, body });
  }

  // Create passing gate result
  private createPassingResult(reason: string): GateResult {
    return {
      passed: true,
      violations: [],
      regressions: [],
      improvements: [reason],
      recommendation: 'PASS',
      details: {
        currentMetrics: {},
        thresholds: this.config.thresholds,
      },
    };
  }

  // Create failing gate result
  private createFailingResult(violations: string[]): GateResult {
    return {
      passed: false,
      violations: violations,
      regressions: [],
      improvements: [],
      recommendation: 'FAIL',
      details: {
        currentMetrics: {},
        thresholds: this.config.thresholds,
      },
    };
  }

  // Static method to create default configuration
  static createDefaultConfig(): PerformanceGateConfig {
    return {
      enabled: true,
      thresholds: {
        throughput: {
          min: 100, // req/s
          regression: 10, // 10% regression allowed
        },
        latency: {
          p95: 500, // ms
          p99: 1000, // ms
          regression: 20, // 20% regression allowed
        },
        successRate: {
          min: 0.95, // 95%
        },
        resources: {
          memory: 512, // MB
          cpu: 80, // %
        },
      },
      baseline: {
        enabled: true,
        path: './performance-baseline.json',
        autoUpdate: true,
      },
      notifications: {
        slack: {
          webhook: process.env.SLACK_WEBHOOK_URL || '',
          channel: '#performance',
        },
        email: {
          enabled: false,
          recipients: [],
        },
      },
    };
  }
}
