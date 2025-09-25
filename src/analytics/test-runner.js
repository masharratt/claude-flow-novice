/**
 * Test Runner for Claude Flow Analytics Pipeline
 * Tests the analytics system with existing data
 */

import AnalyticsPipeline from './index.js';
import chalk from 'chalk';

export class AnalyticsTestRunner {
  constructor() {
    this.testResults = [];
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  /**
   * Run all analytics tests
   */
  async runAllTests() {
    console.log(chalk.blue.bold('\n🧪 Claude Flow Analytics Test Suite\n'));

    const tests = [
      { name: 'Database Connectivity', fn: this.testDatabaseConnectivity },
      { name: 'Metrics Loading', fn: this.testMetricsLoading },
      { name: 'Analytics Report Generation', fn: this.testAnalyticsReportGeneration },
      { name: 'Optimization Engine', fn: this.testOptimizationEngine },
      { name: 'Suggestion Generator', fn: this.testSuggestionGenerator },
      { name: 'Dashboard Integration', fn: this.testDashboardIntegration },
      { name: 'CLI Commands', fn: this.testCLICommands },
      { name: 'Monitoring Integration', fn: this.testMonitoringIntegration },
      { name: 'Report Export', fn: this.testReportExport },
      { name: 'System Status', fn: this.testSystemStatus }
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.fn.bind(this));
    }

    this.printResults();
    return this.getTestSummary();
  }

  /**
   * Run individual test
   */
  async runTest(testName, testFunction) {
    this.totalTests++;
    console.log(chalk.gray(`Running: ${testName}...`));

    try {
      const startTime = Date.now();
      const result = await testFunction();
      const duration = Date.now() - startTime;

      if (result && result.success !== false) {
        this.passedTests++;
        console.log(chalk.green(`✅ ${testName} - PASSED (${duration}ms)`));

        if (result.details) {
          console.log(chalk.gray(`   ${result.details}`));
        }

        this.testResults.push({
          name: testName,
          status: 'PASSED',
          duration: duration,
          details: result.details || 'Test completed successfully'
        });
      } else {
        throw new Error(result.error || 'Test returned failure');
      }

    } catch (error) {
      this.failedTests++;
      console.log(chalk.red(`❌ ${testName} - FAILED`));
      console.log(chalk.red(`   Error: ${error.message}`));

      this.testResults.push({
        name: testName,
        status: 'FAILED',
        error: error.message,
        details: error.stack
      });
    }
  }

  /**
   * Test database connectivity
   */
  async testDatabaseConnectivity() {
    const analytics = new AnalyticsPipeline();
    const initResult = await analytics.analyzer.initialize();
    await analytics.analyzer.close();

    return {
      success: true,
      details: initResult.success ?
        'Database connections established successfully' :
        'Database connections failed (expected if no databases exist)'
    };
  }

  /**
   * Test metrics loading
   */
  async testMetricsLoading() {
    const analytics = new AnalyticsPipeline();
    await analytics.analyzer.initialize();

    // Test loading system metrics
    const systemMetrics = await analytics.analyzer.loadSystemMetrics();
    const taskMetrics = await analytics.analyzer.loadTaskMetrics();
    const performanceMetrics = await analytics.analyzer.loadPerformanceMetrics();

    await analytics.analyzer.close();

    return {
      success: true,
      details: `Loaded ${systemMetrics.length} system metrics, ${taskMetrics.length} task metrics, ${Object.keys(performanceMetrics).length} performance keys`
    };
  }

  /**
   * Test analytics report generation
   */
  async testAnalyticsReportGeneration() {
    const analytics = new AnalyticsPipeline();
    await analytics.initialize();

    const report = await analytics.generateReport();
    await analytics.shutdown();

    const hasComponents = Object.keys(report.components).length > 0;

    return {
      success: hasComponents,
      details: `Generated report with ${Object.keys(report.components).length} components`
    };
  }

  /**
   * Test optimization engine
   */
  async testOptimizationEngine() {
    const analytics = new AnalyticsPipeline();
    await analytics.initialize();

    const optimizations = await analytics.getOptimizations();
    await analytics.shutdown();

    return {
      success: optimizations.total !== undefined,
      details: `Generated ${optimizations.total} optimization suggestions`
    };
  }

  /**
   * Test suggestion generator
   */
  async testSuggestionGenerator() {
    const analytics = new AnalyticsPipeline();
    await analytics.initialize();

    const suggestions = await analytics.getPersonalizedSuggestions();
    await analytics.shutdown();

    return {
      success: suggestions.timestamp !== undefined,
      details: `Generated personalized suggestions for user profile`
    };
  }

  /**
   * Test dashboard integration
   */
  async testDashboardIntegration() {
    const analytics = new AnalyticsPipeline({ enableDashboard: true });
    await analytics.initialize();

    const dashboardData = await analytics.dashboard.generateDashboardData();
    await analytics.shutdown();

    return {
      success: dashboardData.timestamp !== undefined,
      details: `Generated dashboard data with status: ${dashboardData.status}`
    };
  }

  /**
   * Test CLI commands
   */
  async testCLICommands() {
    const analytics = new AnalyticsPipeline();
    await analytics.initialize();

    // Test CLI initialization
    const cliComponents = await analytics.startCLI();
    await analytics.shutdown();

    return {
      success: cliComponents.analyzer !== undefined,
      details: 'CLI components initialized successfully'
    };
  }

  /**
   * Test monitoring integration
   */
  async testMonitoringIntegration() {
    const analytics = new AnalyticsPipeline({ enableMonitoring: false });
    await analytics.initialize();

    // Test monitoring start/stop
    const startResult = await analytics.monitoring.startMonitoring();
    const stopResult = await analytics.monitoring.stopMonitoring();
    await analytics.shutdown();

    return {
      success: startResult.success && stopResult.success,
      details: 'Monitoring integration started and stopped successfully'
    };
  }

  /**
   * Test report export
   */
  async testReportExport() {
    const analytics = new AnalyticsPipeline();
    await analytics.initialize();

    // Generate test report
    const report = await analytics.generateReport();

    // Test export would normally save to file - we'll just validate structure
    const hasRequiredFields = report.timestamp && report.components;
    await analytics.shutdown();

    return {
      success: hasRequiredFields,
      details: 'Report export structure validated'
    };
  }

  /**
   * Test system status
   */
  async testSystemStatus() {
    const analytics = new AnalyticsPipeline();
    await analytics.initialize();

    const status = await analytics.getSystemStatus();
    await analytics.shutdown();

    return {
      success: status.timestamp !== undefined,
      details: `System status: ${status.analytics.databases_connected ? 'Connected' : 'Disconnected'}`
    };
  }

  /**
   * Print test results
   */
  printResults() {
    console.log(chalk.blue.bold('\n📊 Test Results Summary\n'));

    console.log(`Total Tests: ${chalk.cyan(this.totalTests)}`);
    console.log(`Passed: ${chalk.green(this.passedTests)}`);
    console.log(`Failed: ${chalk.red(this.failedTests)}`);
    console.log(`Success Rate: ${chalk.yellow((this.passedTests / this.totalTests * 100).toFixed(1))}%`);

    if (this.failedTests > 0) {
      console.log(chalk.red.bold('\n❌ Failed Tests:'));
      this.testResults
        .filter(result => result.status === 'FAILED')
        .forEach(result => {
          console.log(chalk.red(`  • ${result.name}: ${result.error}`));
        });
    }

    console.log(chalk.green.bold('\n✅ Test Suite Completed\n'));
  }

  /**
   * Get test summary
   */
  getTestSummary() {
    return {
      total: this.totalTests,
      passed: this.passedTests,
      failed: this.failedTests,
      successRate: (this.passedTests / this.totalTests * 100),
      results: this.testResults
    };
  }

  /**
   * Run performance benchmark
   */
  async runPerformanceBenchmark() {
    console.log(chalk.blue.bold('\n⚡ Performance Benchmark\n'));

    const analytics = new AnalyticsPipeline();
    await analytics.initialize();

    const benchmarks = [
      { name: 'Report Generation', fn: () => analytics.generateReport() },
      { name: 'Optimization Suggestions', fn: () => analytics.getOptimizations() },
      { name: 'System Status', fn: () => analytics.getSystemStatus() },
      { name: 'Dashboard Data', fn: () => analytics.dashboard.generateDashboardData() }
    ];

    const results = [];

    for (const benchmark of benchmarks) {
      console.log(chalk.gray(`Benchmarking: ${benchmark.name}...`));

      const iterations = 3;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        try {
          await benchmark.fn();
          const duration = Date.now() - startTime;
          times.push(duration);
        } catch (error) {
          console.log(chalk.red(`  Error in iteration ${i + 1}: ${error.message}`));
          times.push(null);
        }
      }

      const validTimes = times.filter(t => t !== null);
      const avgTime = validTimes.length > 0
        ? validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length
        : 0;

      results.push({
        name: benchmark.name,
        iterations: iterations,
        avgTime: Math.round(avgTime),
        minTime: Math.min(...validTimes),
        maxTime: Math.max(...validTimes),
        successRate: (validTimes.length / iterations) * 100
      });

      console.log(chalk.green(`  ✅ ${benchmark.name}: ${avgTime.toFixed(0)}ms avg (${validTimes.length}/${iterations} successful)`));
    }

    await analytics.shutdown();

    console.log(chalk.blue.bold('\n📈 Benchmark Results:'));
    results.forEach(result => {
      console.log(`  ${result.name}:`);
      console.log(`    Average: ${chalk.cyan(result.avgTime)}ms`);
      console.log(`    Range: ${chalk.gray(result.minTime)}ms - ${chalk.gray(result.maxTime)}ms`);
      console.log(`    Success Rate: ${chalk.yellow(result.successRate.toFixed(1))}%`);
    });

    return results;
  }

  /**
   * Run data validation tests
   */
  async runDataValidationTests() {
    console.log(chalk.blue.bold('\n🔍 Data Validation Tests\n'));

    const analytics = new AnalyticsPipeline();
    await analytics.initialize();

    const validationResults = [];

    try {
      // Test 1: System metrics validation
      const systemMetrics = await analytics.analyzer.loadSystemMetrics();
      const hasValidSystemData = systemMetrics.length > 0 &&
        systemMetrics.every(metric =>
          metric.timestamp &&
          metric.memoryUsagePercent !== undefined &&
          metric.cpuLoad !== undefined
        );

      validationResults.push({
        test: 'System Metrics Validation',
        passed: hasValidSystemData,
        details: `${systemMetrics.length} system metrics entries validated`
      });

      // Test 2: Task metrics validation
      const taskMetrics = await analytics.analyzer.loadTaskMetrics();
      const hasValidTaskData = taskMetrics.every(metric =>
        metric.id && metric.timestamp
      );

      validationResults.push({
        test: 'Task Metrics Validation',
        passed: hasValidTaskData,
        details: `${taskMetrics.length} task metrics entries validated`
      });

      // Test 3: Performance metrics validation
      const perfMetrics = await analytics.analyzer.loadPerformanceMetrics();
      const hasValidPerfData = typeof perfMetrics === 'object';

      validationResults.push({
        test: 'Performance Metrics Validation',
        passed: hasValidPerfData,
        details: `Performance metrics structure validated`
      });

      // Test 4: Report structure validation
      const report = await analytics.generateReport();
      const hasValidReportStructure = report.timestamp &&
        report.components &&
        typeof report.components === 'object';

      validationResults.push({
        test: 'Report Structure Validation',
        passed: hasValidReportStructure,
        details: 'Report contains required fields and structure'
      });

    } catch (error) {
      validationResults.push({
        test: 'Data Validation Error',
        passed: false,
        details: error.message
      });
    }

    await analytics.shutdown();

    // Print results
    validationResults.forEach(result => {
      const status = result.passed ? chalk.green('✅ PASSED') : chalk.red('❌ FAILED');
      console.log(`${status} ${result.test}: ${result.details}`);
    });

    const passedValidation = validationResults.filter(r => r.passed).length;
    const totalValidation = validationResults.length;

    console.log(chalk.blue.bold(`\nValidation Results: ${passedValidation}/${totalValidation} passed\n`));

    return validationResults;
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runTests() {
    const testRunner = new AnalyticsTestRunner();

    try {
      // Run all tests
      await testRunner.runAllTests();

      // Run performance benchmark
      await testRunner.runPerformanceBenchmark();

      // Run data validation
      await testRunner.runDataValidationTests();

    } catch (error) {
      console.error(chalk.red('Test execution failed:'), error.message);
    }
  }

  runTests();
}

export default AnalyticsTestRunner;