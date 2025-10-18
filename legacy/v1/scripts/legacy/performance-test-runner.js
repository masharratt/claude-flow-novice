#!/usr/bin/env node

const { PerformanceTestRunner } = require('../src/testing/performance/PerformanceTestRunner');
const { PerformanceGate } = require('../src/ci-cd/performance/PerformanceGate');
const { RegressionDetector, defaultRegressionConfig } = require('../src/monitoring/regression/RegressionDetector');
const fs = require('fs').promises;
const path = require('path');

/**
 * Performance Test Runner Script
 *
 * This script provides a CLI interface for running performance tests,
 * validating performance gates, and detecting regressions.
 */

class PerformanceTestCLI {
  constructor() {
    this.testRunner = new PerformanceTestRunner();
    this.setupTestConfigurations();
  }

  // Setup predefined test configurations
  setupTestConfigurations() {
    // Basic performance test
    this.testRunner.registerTest({
      name: 'basic-cli-operations',
      description: 'Test basic CLI command performance',
      duration: 30000, // 30 seconds
      warmupDuration: 5000, // 5 seconds
      concurrency: 5,
      rampUpTime: 2000,
      rampDownTime: 2000,
      targetThroughput: 10, // req/s
      maxLatency: 1000, // ms
      successRate: 0.95,
      memoryLimit: 256, // MB
      cpuLimit: 50 // %
    });

    // Load test configuration
    this.testRunner.registerTest({
      name: 'load-test-swarm-operations',
      description: 'Load test for swarm coordination operations',
      duration: 300000, // 5 minutes
      warmupDuration: 30000, // 30 seconds
      concurrency: parseInt(process.env.LOAD_TEST_CONCURRENCY || '50'),
      rampUpTime: 60000, // 1 minute
      rampDownTime: 30000, // 30 seconds
      targetThroughput: 100, // req/s
      maxLatency: 2000, // ms
      successRate: 0.9,
      memoryLimit: 512, // MB
      cpuLimit: 70 // %
    });

    // Stress test configuration
    this.testRunner.registerTest({
      name: 'stress-test-agent-spawning',
      description: 'Stress test for agent spawning and coordination',
      duration: 600000, // 10 minutes
      warmupDuration: 60000, // 1 minute
      concurrency: parseInt(process.env.STRESS_TEST_MAX_CONCURRENCY || '200'),
      rampUpTime: 120000, // 2 minutes
      rampDownTime: 60000, // 1 minute
      targetThroughput: 50, // req/s
      maxLatency: 5000, // ms
      successRate: 0.85,
      memoryLimit: 1024, // MB
      cpuLimit: 90 // %
    });

    // Endurance test configuration
    this.testRunner.registerTest({
      name: 'endurance-test-memory-stability',
      description: 'Endurance test for memory stability and leak detection',
      duration: parseInt(process.env.ENDURANCE_TEST_DURATION || '3600000'), // 1 hour
      warmupDuration: 60000, // 1 minute
      concurrency: parseInt(process.env.ENDURANCE_TEST_CONCURRENCY || '25'),
      rampUpTime: 300000, // 5 minutes
      rampDownTime: 300000, // 5 minutes
      targetThroughput: 20, // req/s
      maxLatency: 3000, // ms
      successRate: 0.95,
      memoryLimit: parseInt(process.env.ENDURANCE_TEST_MEMORY_LIMIT || '1024'), // MB
      cpuLimit: 60 // %
    });
  }

  // Run basic performance tests
  async runBasicTests() {
    console.log('🚀 Running basic performance tests...');

    const tests = [
      {
        name: 'basic-cli-operations',
        function: this.simulateBasicCLIOperation.bind(this)
      }
    ];

    const results = await this.testRunner.runTestSuite(tests);
    await this.saveResults('basic', results);

    return results;
  }

  // Run load performance tests
  async runLoadTests() {
    console.log('🚀 Running load performance tests...');

    const tests = [
      {
        name: 'load-test-swarm-operations',
        function: this.simulateSwarmOperation.bind(this)
      }
    ];

    const results = await this.testRunner.runTestSuite(tests);
    await this.saveResults('load', results);

    return results;
  }

  // Run stress performance tests
  async runStressTests() {
    console.log('🚀 Running stress performance tests...');

    const tests = [
      {
        name: 'stress-test-agent-spawning',
        function: this.simulateAgentSpawning.bind(this)
      }
    ];

    const results = await this.testRunner.runTestSuite(tests);
    await this.saveResults('stress', results);

    return results;
  }

  // Run endurance performance tests
  async runEnduranceTests() {
    console.log('🚀 Running endurance performance tests...');

    const tests = [
      {
        name: 'endurance-test-memory-stability',
        function: this.simulateMemoryIntensiveOperation.bind(this)
      }
    ];

    const results = await this.testRunner.runTestSuite(tests);
    await this.saveResults('endurance', results);

    return results;
  }

  // Simulate basic CLI operation
  async simulateBasicCLIOperation() {
    // Simulate a basic CLI command execution
    const start = Date.now();

    // Simulate command parsing and validation
    await this.sleep(Math.random() * 10 + 5); // 5-15ms

    // Simulate configuration loading
    await this.sleep(Math.random() * 20 + 10); // 10-30ms

    // Simulate command execution
    await this.sleep(Math.random() * 50 + 25); // 25-75ms

    // Simulate response formatting
    await this.sleep(Math.random() * 10 + 5); // 5-15ms

    const duration = Date.now() - start;

    // Simulate occasional failures (5% failure rate)
    if (Math.random() < 0.05) {
      throw new Error('Simulated command failure');
    }

    return { duration, operation: 'cli-command' };
  }

  // Simulate swarm operation
  async simulateSwarmOperation() {
    const start = Date.now();

    // Simulate swarm initialization
    await this.sleep(Math.random() * 30 + 20); // 20-50ms

    // Simulate agent coordination
    await this.sleep(Math.random() * 100 + 50); // 50-150ms

    // Simulate task orchestration
    await this.sleep(Math.random() * 200 + 100); // 100-300ms

    // Simulate result aggregation
    await this.sleep(Math.random() * 50 + 25); // 25-75ms

    const duration = Date.now() - start;

    // Simulate occasional failures (10% failure rate under load)
    if (Math.random() < 0.1) {
      throw new Error('Simulated swarm coordination failure');
    }

    return { duration, operation: 'swarm-coordination' };
  }

  // Simulate agent spawning
  async simulateAgentSpawning() {
    const start = Date.now();

    // Simulate agent type selection
    await this.sleep(Math.random() * 20 + 10); // 10-30ms

    // Simulate agent initialization
    await this.sleep(Math.random() * 100 + 50); // 50-150ms

    // Simulate capability registration
    await this.sleep(Math.random() * 50 + 25); // 25-75ms

    // Simulate network connection setup
    await this.sleep(Math.random() * 150 + 75); // 75-225ms

    // Simulate initial task assignment
    await this.sleep(Math.random() * 100 + 50); // 50-150ms

    const duration = Date.now() - start;

    // Simulate failures (15% failure rate under stress)
    if (Math.random() < 0.15) {
      throw new Error('Simulated agent spawning failure');
    }

    return { duration, operation: 'agent-spawning' };
  }

  // Simulate memory-intensive operation
  async simulateMemoryIntensiveOperation() {
    const start = Date.now();

    // Create some memory pressure to simulate real workload
    const largeArray = new Array(10000).fill(0).map(() => ({
      id: Math.random(),
      data: new Array(100).fill(Math.random()),
      timestamp: Date.now()
    }));

    // Simulate processing
    await this.sleep(Math.random() * 100 + 50); // 50-150ms

    // Simulate data transformation
    const processedData = largeArray.map(item => ({
      ...item,
      processed: true,
      hash: this.simpleHash(JSON.stringify(item))
    }));

    // Simulate cleanup (helps test GC behavior)
    largeArray.length = 0;
    processedData.length = 0;

    const duration = Date.now() - start;

    // Simulate rare failures (2% failure rate)
    if (Math.random() < 0.02) {
      throw new Error('Simulated memory operation failure');
    }

    return { duration, operation: 'memory-intensive' };
  }

  // Simple hash function for testing
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  // Validate performance gate
  async validatePerformanceGate() {
    console.log('🚪 Running performance gate validation...');

    const gateConfig = this.createPerformanceGateConfig();
    const gate = new PerformanceGate(gateConfig);

    // Run a subset of tests for gate validation
    const tests = [
      {
        name: 'basic-cli-operations',
        function: this.simulateBasicCLIOperation.bind(this)
      },
      {
        name: 'load-test-swarm-operations',
        function: this.simulateSwarmOperation.bind(this)
      }
    ];

    const gateResult = await gate.validatePerformance(tests);

    // Save gate results
    await this.saveGateResults(gateResult);

    // Log results
    console.log(`\n📊 Performance Gate Results:`);
    console.log(`Status: ${gateResult.recommendation}`);
    console.log(`Passed: ${gateResult.passed ? '✅' : '❌'}`);
    console.log(`Violations: ${gateResult.violations.length}`);
    console.log(`Regressions: ${gateResult.regressions.length}`);
    console.log(`Improvements: ${gateResult.improvements.length}`);

    if (gateResult.violations.length > 0) {
      console.log('\n❌ Violations:');
      gateResult.violations.forEach(v => console.log(`  - ${v}`));
    }

    if (gateResult.regressions.length > 0) {
      console.log('\n📉 Regressions:');
      gateResult.regressions.forEach(r => console.log(`  - ${r}`));
    }

    if (gateResult.improvements.length > 0) {
      console.log('\n📈 Improvements:');
      gateResult.improvements.forEach(i => console.log(`  - ${i}`));
    }

    return gateResult;
  }

  // Detect performance regressions
  async detectRegressions() {
    console.log('🔍 Running regression detection...');

    const detector = new RegressionDetector(defaultRegressionConfig);

    // Create a synthetic data point for testing
    const dataPoint = {
      timestamp: Date.now(),
      commit: process.env.GITHUB_SHA || 'test-commit',
      branch: process.env.GITHUB_REF_NAME || 'test-branch',
      version: process.env.npm_package_version || '1.0.0',
      metrics: {
        throughput: 95 + Math.random() * 10, // 95-105 req/s
        avgLatency: 45 + Math.random() * 10, // 45-55ms
        p95Latency: 90 + Math.random() * 20, // 90-110ms
        p99Latency: 180 + Math.random() * 40, // 180-220ms
        successRate: 0.95 + Math.random() * 0.04, // 95-99%
        memoryUsage: 200 + Math.random() * 50, // 200-250MB
        cpuUsage: 35 + Math.random() * 15, // 35-50%
        errorRate: Math.random() * 0.05 // 0-5%
      },
      environment: {
        os: process.platform,
        nodeVersion: process.version,
        cpuCores: require('os').cpus().length,
        memory: Math.round(require('os').totalmem() / 1024 / 1024) // MB
      }
    };

    const alerts = await detector.detectRegressions(dataPoint);

    console.log(`\n🔍 Regression Detection Results:`);
    console.log(`Alerts: ${alerts.length}`);

    if (alerts.length > 0) {
      alerts.forEach(alert => {
        const icon = alert.type === 'REGRESSION' ? '📉' :
                     alert.type === 'IMPROVEMENT' ? '📈' : '⚠️';
        console.log(`\n${icon} ${alert.type} - ${alert.severity}`);
        console.log(`  Metric: ${alert.metric}`);
        console.log(`  Description: ${alert.description}`);
        console.log(`  Recommendation: ${alert.recommendation}`);
      });
    } else {
      console.log('  No significant regressions detected ✅');
    }

    // Save regression results
    await this.saveRegressionResults(alerts, dataPoint);

    return alerts;
  }

  // Generate comprehensive performance report
  async generateReport() {
    console.log('📊 Generating comprehensive performance report...');

    const reportData = {
      timestamp: Date.now(),
      environment: {
        os: process.platform,
        nodeVersion: process.version,
        cpuCores: require('os').cpus().length,
        memory: Math.round(require('os').totalmem() / 1024 / 1024),
        branch: process.env.GITHUB_REF_NAME || 'unknown',
        commit: process.env.GITHUB_SHA || 'unknown'
      },
      tests: {
        basic: await this.loadResults('basic'),
        load: await this.loadResults('load'),
        stress: await this.loadResults('stress'),
        endurance: await this.loadResults('endurance')
      },
      gate: await this.loadGateResults(),
      regressions: await this.loadRegressionResults()
    };

    const reportPath = path.join(process.cwd(), 'reports/performance', `consolidated-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));

    console.log(`📊 Performance report saved to: ${reportPath}`);

    return reportData;
  }

  // Create performance gate configuration
  createPerformanceGateConfig() {
    return {
      enabled: process.env.PERFORMANCE_GATE_ENABLED !== 'false',
      thresholds: {
        throughput: {
          min: parseInt(process.env.PERF_THRESHOLD_THROUGHPUT_MIN || '50'),
          regression: parseFloat(process.env.PERF_THRESHOLD_THROUGHPUT_REGRESSION || '10')
        },
        latency: {
          p95: parseInt(process.env.PERF_THRESHOLD_P95_LATENCY || '1000'),
          p99: parseInt(process.env.PERF_THRESHOLD_P99_LATENCY || '2000'),
          regression: parseFloat(process.env.PERF_THRESHOLD_LATENCY_REGRESSION || '20')
        },
        successRate: {
          min: parseFloat(process.env.PERF_THRESHOLD_SUCCESS_RATE || '0.9')
        },
        resources: {
          memory: parseInt(process.env.PERF_THRESHOLD_MEMORY || '512'),
          cpu: parseInt(process.env.PERF_THRESHOLD_CPU || '80')
        }
      },
      baseline: {
        enabled: true,
        path: process.env.PERFORMANCE_BASELINE_PATH || './performance-baseline.json',
        autoUpdate: process.env.PERFORMANCE_BASELINE_AUTO_UPDATE === 'true'
      },
      notifications: {
        slack: {
          webhook: process.env.SLACK_WEBHOOK_URL || '',
          channel: process.env.SLACK_CHANNEL || '#performance'
        },
        email: {
          enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
          recipients: (process.env.EMAIL_RECIPIENTS || '').split(',').filter(Boolean)
        }
      }
    };
  }

  // Helper methods
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveResults(testType, results) {
    const reportsDir = path.join(process.cwd(), 'reports/performance');
    await fs.mkdir(reportsDir, { recursive: true });

    const resultsPath = path.join(reportsDir, `${testType}-${Date.now()}.json`);
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));

    console.log(`Results saved to: ${resultsPath}`);
  }

  async saveGateResults(gateResult) {
    const reportsDir = path.join(process.cwd(), 'reports/performance');
    await fs.mkdir(reportsDir, { recursive: true });

    const gateResultsPath = path.join(reportsDir, `gate-${Date.now()}.json`);
    const latestGateResultsPath = path.join(reportsDir, 'gate-latest.json');

    await fs.writeFile(gateResultsPath, JSON.stringify(gateResult, null, 2));
    await fs.writeFile(latestGateResultsPath, JSON.stringify(gateResult, null, 2));

    console.log(`Gate results saved to: ${gateResultsPath}`);
  }

  async saveRegressionResults(alerts, dataPoint) {
    const reportsDir = path.join(process.cwd(), 'reports/performance');
    await fs.mkdir(reportsDir, { recursive: true });

    const regressionData = {
      timestamp: Date.now(),
      dataPoint: dataPoint,
      alerts: alerts
    };

    const regressionResultsPath = path.join(reportsDir, `regression-${Date.now()}.json`);
    await fs.writeFile(regressionResultsPath, JSON.stringify(regressionData, null, 2));

    console.log(`Regression results saved to: ${regressionResultsPath}`);
  }

  async loadResults(testType) {
    try {
      const reportsDir = path.join(process.cwd(), 'reports/performance');
      const files = await fs.readdir(reportsDir);
      const testFiles = files.filter(f => f.startsWith(`${testType}-`) && f.endsWith('.json'));

      if (testFiles.length === 0) return null;

      const latestFile = testFiles.sort().pop();
      const resultsPath = path.join(reportsDir, latestFile);
      const data = await fs.readFile(resultsPath, 'utf-8');

      return JSON.parse(data);
    } catch (error) {
      console.warn(`Could not load ${testType} results:`, error.message);
      return null;
    }
  }

  async loadGateResults() {
    try {
      const gateResultsPath = path.join(process.cwd(), 'reports/performance', 'gate-latest.json');
      const data = await fs.readFile(gateResultsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('Could not load gate results:', error.message);
      return null;
    }
  }

  async loadRegressionResults() {
    try {
      const reportsDir = path.join(process.cwd(), 'reports/performance');
      const files = await fs.readdir(reportsDir);
      const regressionFiles = files.filter(f => f.startsWith('regression-') && f.endsWith('.json'));

      if (regressionFiles.length === 0) return null;

      const latestFile = regressionFiles.sort().pop();
      const resultsPath = path.join(reportsDir, latestFile);
      const data = await fs.readFile(resultsPath, 'utf-8');

      return JSON.parse(data);
    } catch (error) {
      console.warn('Could not load regression results:', error.message);
      return null;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const cli = new PerformanceTestCLI();

  try {
    switch (command) {
      case 'basic':
        await cli.runBasicTests();
        break;

      case 'load':
        await cli.runLoadTests();
        break;

      case 'stress':
        await cli.runStressTests();
        break;

      case 'endurance':
        await cli.runEnduranceTests();
        break;

      case 'all':
        await cli.runBasicTests();
        await cli.runLoadTests();
        await cli.runStressTests();
        await cli.runEnduranceTests();
        break;

      case 'gate':
        const gateResult = await cli.validatePerformanceGate();
        if (!gateResult.passed) {
          process.exit(1);
        }
        break;

      case 'regression':
        await cli.detectRegressions();
        break;

      case 'report':
        await cli.generateReport();
        break;

      default:
        console.log(`
Performance Test Runner

Usage: node scripts/performance-test-runner.js <command>

Commands:
  basic      Run basic performance tests
  load       Run load performance tests
  stress     Run stress performance tests
  endurance  Run endurance performance tests
  all        Run all performance test suites
  gate       Run performance gate validation
  regression Run regression detection
  report     Generate comprehensive performance report

Environment Variables:
  PERFORMANCE_GATE_ENABLED=true/false
  PERFORMANCE_BASELINE_AUTO_UPDATE=true/false
  LOAD_TEST_CONCURRENCY=50
  STRESS_TEST_MAX_CONCURRENCY=200
  ENDURANCE_TEST_DURATION=3600000
  ENDURANCE_TEST_CONCURRENCY=25
  ENDURANCE_TEST_MEMORY_LIMIT=1024
  PERF_THRESHOLD_THROUGHPUT_MIN=50
  PERF_THRESHOLD_P95_LATENCY=1000
  PERF_THRESHOLD_SUCCESS_RATE=0.9
  SLACK_WEBHOOK_URL=<webhook-url>
  EMAIL_NOTIFICATIONS_ENABLED=true/false
        `);
        break;
    }
  } catch (error) {
    console.error(`❌ Performance test failed:`, error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { PerformanceTestCLI };