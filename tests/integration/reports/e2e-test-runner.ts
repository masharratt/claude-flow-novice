/**
 * E2E Test Runner and Report Generator
 * Orchestrates all integration tests and generates comprehensive reports
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  errors: string[];
  coverage?: number;
}

interface SystemMetrics {
  timestamp: string;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
}

class E2ETestRunner {
  private testSuites: string[] = [
    'cli-workflow-integration',
    'swarm-coordination-integration',
    'real-world-scenarios',
    'performance-benchmarks'
  ];

  private results: TestResult[] = [];
  private metrics: SystemMetrics[] = [];
  private reportDir: string;

  constructor() {
    this.reportDir = path.join(process.cwd(), 'tests', 'integration', 'reports');
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting E2E Integration Test Suite...');

    await this.initializeReports();

    for (const suite of this.testSuites) {
      await this.runTestSuite(suite);
    }

    await this.generateComprehensiveReport();
  }

  private async initializeReports(): Promise<void> {
    await fs.mkdir(this.reportDir, { recursive: true });

    // Initialize metrics collection
    this.collectSystemMetrics();
    const metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000);

    // Cleanup interval after tests
    setTimeout(() => clearInterval(metricsInterval), 300000); // 5 minutes max
  }

  private collectSystemMetrics(): void {
    this.metrics.push({
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime()
    });
  }

  private async runTestSuite(suiteName: string): Promise<void> {
    console.log(`📋 Running ${suiteName} tests...`);

    const startTime = Date.now();
    const testFile = path.join(process.cwd(), 'tests', 'integration', 'e2e', `${suiteName}.test.ts`);

    try {
      const { stdout, stderr } = await execAsync(`npm test -- ${testFile}`, {
        timeout: 180000, // 3 minutes per suite
        env: { ...process.env, NODE_ENV: 'test' }
      });

      const duration = Date.now() - startTime;
      const result = this.parseTestOutput(suiteName, stdout, stderr, duration);
      this.results.push(result);

      console.log(`✅ ${suiteName}: ${result.passed} passed, ${result.failed} failed (${duration}ms)`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const result: TestResult = {
        suite: suiteName,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration,
        errors: [error.message || 'Unknown error']
      };

      this.results.push(result);
      console.log(`❌ ${suiteName}: Failed to run (${duration}ms)`);
    }
  }

  private parseTestOutput(suiteName: string, stdout: string, stderr: string, duration: number): TestResult {
    // Parse Jest output for test results
    const passedMatch = stdout.match(/(\d+) passing/);
    const failedMatch = stdout.match(/(\d+) failing/);
    const skippedMatch = stdout.match(/(\d+) pending/);
    const coverageMatch = stdout.match(/All files\s+\|\s+([\d.]+)/);

    return {
      suite: suiteName,
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      failed: failedMatch ? parseInt(failedMatch[1]) : 0,
      skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
      duration,
      errors: stderr ? [stderr] : [],
      coverage: coverageMatch ? parseFloat(coverageMatch[1]) : undefined
    };
  }

  private async generateComprehensiveReport(): Promise<void> {
    console.log('📊 Generating comprehensive test report...');

    const totalTests = this.results.reduce((sum, r) => sum + r.passed + r.failed + r.skipped, 0);
    const totalPassed = this.results.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = this.results.reduce((sum, r) => sum + r.failed, 0);
    const totalSkipped = this.results.reduce((sum, r) => sum + r.skipped, 0);
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const successRate = totalTests > 0 ? (totalPassed / totalTests * 100) : 0;

    const report = {
      summary: {
        timestamp: new Date().toISOString(),
        totalTests,
        totalPassed,
        totalFailed,
        totalSkipped,
        successRate: parseFloat(successRate.toFixed(2)),
        totalDuration,
        averageDuration: Math.round(totalDuration / this.results.length)
      },
      testSuites: this.results,
      systemMetrics: {
        peakMemoryUsage: Math.max(...this.metrics.map(m => m.memoryUsage.heapUsed)),
        averageMemoryUsage: Math.round(
          this.metrics.reduce((sum, m) => sum + m.memoryUsage.heapUsed, 0) / this.metrics.length
        ),
        testDuration: totalDuration,
        metricsCount: this.metrics.length
      },
      recommendations: this.generateRecommendations()
    };

    // Save JSON report
    const jsonReport = path.join(this.reportDir, 'e2e-test-results.json');
    await fs.writeFile(jsonReport, JSON.stringify(report, null, 2));

    // Save metrics data
    const metricsFile = path.join(this.reportDir, 'system-metrics.json');
    await fs.writeFile(metricsFile, JSON.stringify(this.metrics, null, 2));

    // Generate markdown report
    await this.generateMarkdownReport(report);

    console.log(`📈 Reports saved to ${this.reportDir}`);
    this.logSummary(report);
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    const failedTests = this.results.reduce((sum, r) => sum + r.failed, 0);
    const slowTests = this.results.filter(r => r.duration > 60000);

    if (failedTests > 0) {
      recommendations.push(`🔧 Fix ${failedTests} failing test${failedTests !== 1 ? 's' : ''} before deployment`);
    }

    if (slowTests.length > 0) {
      recommendations.push(`⚡ Optimize ${slowTests.length} slow test suite${slowTests.length !== 1 ? 's' : ''} (>60s)`);
    }

    const totalSuccessRate = this.results.reduce((sum, r) => sum + r.passed, 0) /
                            this.results.reduce((sum, r) => sum + r.passed + r.failed, 0) * 100;

    if (totalSuccessRate < 80) {
      recommendations.push(`📊 Improve overall test success rate (currently ${totalSuccessRate.toFixed(1)}%)`);
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ All tests passing - system ready for deployment!');
    }

    return recommendations;
  }

  private async generateMarkdownReport(report: any): Promise<void> {
    const markdown = `# E2E Integration Test Report

## Summary
- **Timestamp**: ${report.summary.timestamp}
- **Total Tests**: ${report.summary.totalTests}
- **Success Rate**: ${report.summary.successRate}%
- **Total Duration**: ${Math.round(report.summary.totalDuration / 1000)}s
- **Status**: ${report.summary.totalFailed === 0 ? '✅ PASSING' : '❌ FAILING'}

## Test Suites

${report.testSuites.map((suite: TestResult) => `
### ${suite.suite}
- **Passed**: ${suite.passed}
- **Failed**: ${suite.failed}
- **Skipped**: ${suite.skipped}
- **Duration**: ${Math.round(suite.duration / 1000)}s
- **Status**: ${suite.failed === 0 ? '✅' : '❌'}
${suite.coverage ? `- **Coverage**: ${suite.coverage}%` : ''}
${suite.errors.length > 0 ? `\n**Errors**:\n${suite.errors.map(e => `- ${e}`).join('\n')}` : ''}
`).join('')}

## System Performance

- **Peak Memory Usage**: ${Math.round(report.systemMetrics.peakMemoryUsage / 1024 / 1024)}MB
- **Average Memory Usage**: ${Math.round(report.systemMetrics.averageMemoryUsage / 1024 / 1024)}MB
- **Test Duration**: ${Math.round(report.systemMetrics.testDuration / 1000)}s
- **Metrics Collected**: ${report.systemMetrics.metricsCount}

## Recommendations

${report.recommendations.map((rec: string) => `- ${rec}`).join('\n')}

## Deployment Status

${report.summary.totalFailed === 0 && report.summary.successRate >= 90
  ? '🚀 **READY FOR DEPLOYMENT** - All tests passing with excellent success rate'
  : '🚧 **NOT READY** - Address failing tests and performance issues before deployment'
}

---
*Report generated on ${new Date().toISOString()}*
`;

    const markdownReport = path.join(this.reportDir, 'e2e-test-report.md');
    await fs.writeFile(markdownReport, markdown);
  }

  private logSummary(report: any): void {
    console.log('\n📊 E2E Integration Test Summary:');
    console.log(`   Total Tests: ${report.summary.totalTests}`);
    console.log(`   Passed: ${report.summary.totalPassed} ✅`);
    console.log(`   Failed: ${report.summary.totalFailed} ${report.summary.totalFailed > 0 ? '❌' : '✅'}`);
    console.log(`   Success Rate: ${report.summary.successRate}%`);
    console.log(`   Duration: ${Math.round(report.summary.totalDuration / 1000)}s`);

    if (report.summary.totalFailed === 0 && report.summary.successRate >= 90) {
      console.log('\n🚀 SYSTEM READY FOR DEPLOYMENT!');
    } else {
      console.log('\n🚧 System needs attention before deployment');
    }

    console.log(`\n📈 Full report: ${path.join(this.reportDir, 'e2e-test-report.md')}`);
  }
}

// Export for use in other modules
export { E2ETestRunner };

// Run if called directly
if (require.main === module) {
  const runner = new E2ETestRunner();
  runner.runAllTests().catch(console.error);
}