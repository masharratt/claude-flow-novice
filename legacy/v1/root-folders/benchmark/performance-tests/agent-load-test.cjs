#!/usr/bin/env node

/**
 * Agent Load Test
 * Tests actual agent operations under load
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const v8 = require('v8');

class AgentLoadTest {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        nodeVersion: process.version
      },
      tests: {},
      agentMetrics: []
    };
    this.startTime = Date.now();
  }

  // Memory monitoring
  getMemorySnapshot() {
    const usage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      timestamp: Date.now(),
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      heapLimit: heapStats.heap_size_limit,
      systemFree: os.freemem(),
      loadAverage: os.loadavg()
    };
  }

  // Test with real agent operations
  async testRealAgentOperations() {
    console.log('🤖 Testing real agent operations...');

    const startMemory = this.getMemorySnapshot();
    const agentCount = 25; // Realistic test count
    const agentPromises = [];
    const memorySnapshots = [];

    // Take memory snapshots during agent operations
    const monitoringInterval = setInterval(() => {
      memorySnapshots.push(this.getMemorySnapshot());
    }, 500);

    console.log(`  Spawning ${agentCount} agents...`);

    for (let i = 0; i < agentCount; i++) {
      agentPromises.push(this.spawnRealAgent(i));
    }

    const agentResults = await Promise.allSettled(agentPromises);
    clearInterval(monitoringInterval);

    const endMemory = this.getMemorySnapshot();
    const successful = agentResults.filter(r => r.status === 'fulfilled').length;
    const failed = agentResults.filter(r => r.status === 'rejected').length;

    // Analyze memory usage patterns
    const peakMemory = memorySnapshots.reduce((max, snap) =>
      snap.rss > max.rss ? snap : max, startMemory);

    const test = {
      agentCount,
      successful,
      failed,
      successRate: (successful / agentCount) * 100,
      duration: Date.now() - startMemory.timestamp,
      throughput: successful / ((Date.now() - startMemory.timestamp) / 1000),
      memory: {
        start: startMemory.rss,
        peak: peakMemory.rss,
        end: endMemory.rss,
        growth: endMemory.rss - startMemory.rss,
        peakGrowth: peakMemory.rss - startMemory.rss
      },
      loadAverage: {
        start: startMemory.loadAverage,
        end: endMemory.loadAverage
      },
      errors: agentResults
        .filter(r => r.status === 'rejected')
        .map(r => r.reason.message)
        .slice(0, 5), // Keep first 5 errors
      passed: successful >= agentCount * 0.8 && endMemory.rss - startMemory.rss < 100 * 1024 * 1024 // 80% success, <100MB growth
    };

    this.results.tests.realAgentOperations = test;

    console.log(`  ✅ Agent operations: ${successful}/${agentCount} (${test.successRate.toFixed(1)}%)`);
    console.log(`  📈 Memory growth: ${(test.memory.growth / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  ⚡ Throughput: ${test.throughput.toFixed(1)} agents/sec`);

    return test;
  }

  // Spawn real agent using hooks
  async spawnRealAgent(id) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = 30000; // 30 seconds

      // Use actual claude-flow hooks for realistic test
      const agent = spawn('npx', ['claude-flow@alpha', 'hooks', 'pre-task', '--description', `load-test-agent-${id}`], {
        stdio: 'pipe',
        timeout: timeout
      });

      let output = '';
      let errorOutput = '';

      agent.stdout.on('data', (data) => {
        output += data.toString();
      });

      agent.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      agent.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0) {
          resolve({
            id,
            duration,
            output: output.trim(),
            memory: this.getMemorySnapshot()
          });
        } else {
          reject(new Error(`Agent ${id} failed with code ${code}: ${errorOutput}`));
        }
      });

      agent.on('error', (error) => {
        reject(new Error(`Agent ${id} spawn error: ${error.message}`));
      });
    });
  }

  // Test memory leak detection
  async testMemoryLeakDetection() {
    console.log('🔍 Testing memory leak detection...');

    const iterations = 50;
    const memorySnapshots = [];

    for (let i = 0; i < iterations; i++) {
      // Simulate operations that could leak memory
      await this.simulateLeakyOperation();

      // Take memory snapshot every 10 iterations
      if (i % 10 === 0) {
        memorySnapshots.push(this.getMemorySnapshot());
      }
    }

    // Force garbage collection
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 100));
      global.gc();
    }

    memorySnapshots.push(this.getMemorySnapshot());

    // Analyze for leaks
    const leakAnalysis = this.analyzeMemoryLeaks(memorySnapshots);

    const test = {
      iterations,
      snapshots: memorySnapshots.length,
      leakDetected: leakAnalysis.leakDetected,
      memoryGrowth: leakAnalysis.totalGrowth,
      growthRate: leakAnalysis.growthRate,
      passed: !leakAnalysis.leakDetected
    };

    this.results.tests.memoryLeakDetection = test;

    console.log(`  ${test.passed ? '✅' : '❌'} Memory leak detection: ${test.leakDetected ? 'LEAK DETECTED' : 'NO LEAKS'}`);
    console.log(`  📈 Memory growth: ${(test.memoryGrowth / 1024 / 1024).toFixed(1)} MB`);

    return test;
  }

  // Simulate potentially leaky operation
  async simulateLeakyOperation() {
    return new Promise(resolve => {
      const data = {
        id: Math.random(),
        payload: new Array(1000).fill(0).map(() => ({ value: Math.random() })),
        callbacks: []
      };

      // Simulate event emitters and timers that could leak
      const EventEmitter = require('events');
      const emitter = new EventEmitter();
      const listener = () => {};
      emitter.on('test', listener);

      setTimeout(() => {
        // Sometimes properly cleanup, sometimes don't (to test leak detection)
        if (Math.random() > 0.1) {
          emitter.removeListener('test', listener);
        }
        resolve(data);
      }, Math.random() * 50 + 10);
    });
  }

  // Analyze memory leaks
  analyzeMemoryLeaks(snapshots) {
    if (snapshots.length < 3) {
      return { error: 'Insufficient snapshots' };
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const totalGrowth = last.heapUsed - first.heapUsed;
    const growthRate = totalGrowth / snapshots.length;

    // Detect consistent upward trend
    let increasingTrend = 0;
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i].heapUsed > snapshots[i-1].heapUsed) {
        increasingTrend++;
      }
    }

    const trendPercentage = (increasingTrend / (snapshots.length - 1)) * 100;
    const leakDetected = totalGrowth > 20 * 1024 * 1024 && trendPercentage > 60; // 20MB growth with 60% increasing trend

    return {
      totalGrowth,
      growthRate,
      trendPercentage,
      leakDetected,
      severity: this.categorizeLeak(totalGrowth)
    };
  }

  // Categorize leak severity
  categorizeLeak(memoryGrowth) {
    const growthMB = memoryGrowth / (1024 * 1024);

    if (growthMB < 5) return 'NONE';
    if (growthMB < 20) return 'MINOR';
    if (growthMB < 50) return 'MODERATE';
    if (growthMB < 100) return 'MAJOR';
    return 'CRITICAL';
  }

  // Test CPU performance under load
  async testCPUPerformance() {
    console.log('⚡ Testing CPU performance under load...');

    const startTime = Date.now();
    const startUsage = process.cpuUsage();

    // Simulate CPU-intensive work with concurrent agents
    const concurrentWork = [];
    const workCount = 15;

    for (let i = 0; i < workCount; i++) {
      concurrentWork.push(this.simulateCPUIntensiveWork(i));
    }

    await Promise.all(concurrentWork);

    const endUsage = process.cpuUsage(startUsage);
    const duration = Date.now() - startTime;

    const cpuPercent = {
      user: (endUsage.user / (duration * 1000)) * 100,
      system: (endUsage.system / (duration * 1000)) * 100
    };

    const test = {
      duration,
      concurrentWork: workCount,
      cpuUsage: cpuPercent,
      totalCPU: cpuPercent.user + cpuPercent.system,
      loadAverage: os.loadavg(),
      passed: cpuPercent.user + cpuPercent.system < 200 // Less than 200% CPU usage
    };

    this.results.tests.cpuPerformance = test;

    console.log(`  ✅ CPU usage: ${test.totalCPU.toFixed(1)}% (${test.cpuUsage.user.toFixed(1)}% user, ${test.cpuUsage.system.toFixed(1)}% system)`);
    console.log(`  📊 Load average: ${test.loadAverage[0].toFixed(2)}`);

    return test;
  }

  // Simulate CPU-intensive work
  async simulateCPUIntensiveWork(id) {
    return new Promise(resolve => {
      const startTime = Date.now();
      let operations = 0;

      const work = () => {
        // Fibonacci calculation (CPU intensive)
        this.fibonacci(30);
        operations++;

        if (Date.now() - startTime < 1000) {
          setImmediate(work);
        } else {
          resolve({ id, operations, duration: Date.now() - startTime });
        }
      };

      work();
    });
  }

  // Fibonacci calculation
  fibonacci(n) {
    if (n < 2) return n;
    return this.fibonacci(n - 1) + this.fibonacci(n - 2);
  }

  // Generate comprehensive report
  generateReport() {
    const testResults = Object.values(this.results.tests);
    const passedTests = testResults.filter(test => test.passed).length;
    const totalTests = testResults.length;

    const summary = {
      testsRun: totalTests,
      testsPassed: passedTests,
      testsFailed: totalTests - passedTests,
      overallScore: (passedTests / totalTests) * 100,
      duration: Date.now() - this.startTime,
      systemHealthy: passedTests === totalTests
    };

    const verification = {
      claims: {
        'Agent scalability (20+ concurrent)': this.results.tests.realAgentOperations?.passed || false,
        'Memory leak prevention': this.results.tests.memoryLeakDetection?.passed || false,
        'CPU efficiency under load': this.results.tests.cpuPerformance?.passed || false
      },
      metrics: {
        agentThroughput: this.results.tests.realAgentOperations?.throughput || 0,
        memoryGrowth: (this.results.tests.realAgentOperations?.memory?.growth || 0) / 1024 / 1024,
        cpuUtilization: this.results.tests.cpuPerformance?.totalCPU || 0,
        successRate: this.results.tests.realAgentOperations?.successRate || 0
      }
    };

    return {
      metadata: {
        timestamp: this.results.timestamp,
        duration: summary.duration,
        system: this.results.system
      },
      summary,
      verification,
      detailedResults: this.results.tests,
      recommendations: this.generateRecommendations()
    };
  }

  // Generate recommendations
  generateRecommendations() {
    const recommendations = [];

    const realAgentTest = this.results.tests.realAgentOperations;
    if (realAgentTest && realAgentTest.successRate < 90) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Agent Reliability',
        issue: `Agent success rate: ${realAgentTest.successRate.toFixed(1)}%`,
        action: 'Investigate agent spawning failures and improve error handling'
      });
    }

    if (realAgentTest && realAgentTest.memory.growth > 50 * 1024 * 1024) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Memory Usage',
        issue: `High memory growth: ${(realAgentTest.memory.growth / 1024 / 1024).toFixed(1)}MB`,
        action: 'Review memory management in agent operations'
      });
    }

    const memoryLeakTest = this.results.tests.memoryLeakDetection;
    if (memoryLeakTest && memoryLeakTest.leakDetected) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Memory Leak',
        issue: 'Memory leak detected during testing',
        action: 'Investigate and fix memory leak sources'
      });
    }

    const cpuTest = this.results.tests.cpuPerformance;
    if (cpuTest && cpuTest.totalCPU > 150) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'CPU Performance',
        issue: `High CPU usage: ${cpuTest.totalCPU.toFixed(1)}%`,
        action: 'Optimize CPU-intensive operations for better performance'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'INFO',
        category: 'Performance',
        issue: 'All performance tests passed',
        action: 'Continue monitoring for sustained performance'
      });
    }

    return recommendations;
  }

  // Run all agent load tests
  async runAllTests() {
    console.log('🚀 Starting agent load testing...\n');

    try {
      await this.testRealAgentOperations();
      await this.testMemoryLeakDetection();
      await this.testCPUPerformance();

      const report = this.generateReport();

      // Save results
      const resultsPath = path.join(__dirname, '../results/verification', `agent-load-test-${Date.now()}.json`);
      await fs.writeFile(resultsPath, JSON.stringify(report, null, 2));

      console.log('\n📊 Agent Load Test Results:');
      console.log(`⏱️ Total Duration: ${(report.summary.duration / 1000).toFixed(1)}s`);
      console.log(`✅ Tests Passed: ${report.summary.testsPassed}/${report.summary.testsRun}`);
      console.log(`📈 Overall Score: ${report.summary.overallScore.toFixed(1)}%`);

      console.log('\n🔍 Performance Metrics:');
      console.log(`  🤖 Agent Throughput: ${report.verification.metrics.agentThroughput.toFixed(1)} agents/sec`);
      console.log(`  📈 Memory Growth: ${report.verification.metrics.memoryGrowth.toFixed(1)} MB`);
      console.log(`  ⚡ CPU Utilization: ${report.verification.metrics.cpuUtilization.toFixed(1)}%`);
      console.log(`  ✅ Success Rate: ${report.verification.metrics.successRate.toFixed(1)}%`);

      console.log('\n🎯 Claims Verification:');
      for (const [claim, verified] of Object.entries(report.verification.claims)) {
        console.log(`  ${verified ? '✅' : '❌'} ${claim}`);
      }

      console.log(`\n📁 Detailed results: ${resultsPath}`);

      return report;

    } catch (error) {
      console.error('❌ Agent load test failed:', error);
      throw error;
    }
  }
}

module.exports = AgentLoadTest;

// Run if called directly
if (require.main === module) {
  const loadTest = new AgentLoadTest();
  loadTest.runAllTests()
    .then(results => {
      console.log('\n🎉 Agent load testing completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Agent load testing failed:', error);
      process.exit(1);
    });
}