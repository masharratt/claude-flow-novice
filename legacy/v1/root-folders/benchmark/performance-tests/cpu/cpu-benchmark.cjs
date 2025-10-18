#!/usr/bin/env node

/**
 * CPU Performance Benchmark
 * Tests CPU usage under high agent load scenarios
 */

const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

class CPUBenchmark {
  constructor() {
    this.results = {
      baseline: {},
      loadTests: [],
      concurrentAgents: {},
      systemStats: {
        cpuCount: os.cpus().length,
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      },
      timestamp: new Date().toISOString()
    };
  }

  // Get detailed CPU usage
  async getCPUUsage(duration = 1000) {
    const startUsage = process.cpuUsage();
    const startTime = process.hrtime.bigint();

    await this.sleep(duration);

    const endUsage = process.cpuUsage(startUsage);
    const endTime = process.hrtime.bigint();

    const totalTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    const userPercent = (endUsage.user / totalTime) * 100;
    const systemPercent = (endUsage.system / totalTime) * 100;

    return {
      user: userPercent,
      system: systemPercent,
      total: userPercent + systemPercent,
      loadAverage: os.loadavg(),
      timestamp: Date.now()
    };
  }

  // Sleep utility
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // CPU-intensive task for testing
  async runCPUIntensiveTask(duration = 5000) {
    const startTime = Date.now();
    let operations = 0;

    while (Date.now() - startTime < duration) {
      // Fibonacci calculation (CPU intensive)
      this.fibonacci(25);
      operations++;
    }

    return {
      operations,
      duration: Date.now() - startTime,
      operationsPerSecond: operations / (duration / 1000)
    };
  }

  // Fibonacci calculation
  fibonacci(n) {
    if (n < 2) return n;
    return this.fibonacci(n - 1) + this.fibonacci(n - 2);
  }

  // Baseline CPU performance
  async benchmarkBaseline() {
    console.log('📊 Measuring baseline CPU performance...');

    const idle = await this.getCPUUsage(2000);
    const loadStart = Date.now();
    const intensiveTask = await this.runCPUIntensiveTask(5000);
    const underLoad = await this.getCPUUsage(1000);

    this.results.baseline = {
      idle: idle,
      underLoad: underLoad,
      intensiveTask: intensiveTask,
      duration: Date.now() - loadStart
    };

    console.log(`✅ Baseline complete - Idle: ${idle.total.toFixed(1)}%, Load: ${underLoad.total.toFixed(1)}%`);
    return this.results.baseline;
  }

  // Test CPU with varying agent loads
  async benchmarkAgentLoads() {
    console.log('🚀 Testing CPU performance under agent loads...');

    const loadTests = [10, 25, 50, 75, 100]; // Different agent counts

    for (const agentCount of loadTests) {
      console.log(`  Testing with ${agentCount} agents...`);

      const testStart = Date.now();
      const preTestCPU = await this.getCPUUsage(1000);

      // Spawn agents concurrently
      const agentPromises = [];
      for (let i = 0; i < agentCount; i++) {
        agentPromises.push(this.spawnTestAgent(i));
      }

      // Monitor CPU during agent operations
      const monitoringPromise = this.monitorCPUDuring(10000); // 10 seconds

      try {
        const [agentResults, cpuMonitoring] = await Promise.all([
          Promise.allSettled(agentPromises),
          monitoringPromise
        ]);

        const successful = agentResults.filter(r => r.status === 'fulfilled').length;
        const failed = agentResults.filter(r => r.status === 'rejected').length;
        const postTestCPU = await this.getCPUUsage(1000);

        const loadTest = {
          agentCount,
          successful,
          failed,
          duration: Date.now() - testStart,
          cpu: {
            pre: preTestCPU,
            post: postTestCPU,
            monitoring: cpuMonitoring
          },
          throughput: {
            agentsPerSecond: successful / ((Date.now() - testStart) / 1000),
            successRate: (successful / agentCount) * 100
          }
        };

        this.results.loadTests.push(loadTest);
        console.log(`    ✅ ${successful}/${agentCount} agents (${loadTest.throughput.successRate.toFixed(1)}% success)`);
        console.log(`    📈 Peak CPU: ${cpuMonitoring.peakCPU.total.toFixed(1)}%, Avg: ${cpuMonitoring.avgCPU.total.toFixed(1)}%`);

      } catch (error) {
        console.error(`    ❌ Failed with ${agentCount} agents:`, error.message);
        this.results.loadTests.push({
          agentCount,
          error: error.message,
          duration: Date.now() - testStart
        });
      }

      // Cool down between tests
      await this.sleep(5000);
    }

    console.log('✅ Agent load testing complete');
    return this.results.loadTests;
  }

  // Spawn test agent
  async spawnTestAgent(id) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = 30000; // 30 seconds

      const agent = spawn('npx', ['claude-flow@alpha', 'hooks', 'pre-task', '--description', `test-agent-${id}`], {
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
            cpuUsage: process.cpuUsage()
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

  // Monitor CPU during operations
  async monitorCPUDuring(duration) {
    const samples = [];
    const startTime = Date.now();
    let peakCPU = { total: 0, user: 0, system: 0 };

    const samplingInterval = 200; // Sample every 200ms

    while (Date.now() - startTime < duration) {
      const cpu = await this.getCPUUsage(100);

      if (cpu.total > peakCPU.total) {
        peakCPU = cpu;
      }

      samples.push({
        timestamp: Date.now() - startTime,
        cpu: cpu
      });

      await this.sleep(samplingInterval);
    }

    // Calculate averages
    const avgCPU = {
      total: samples.reduce((sum, s) => sum + s.cpu.total, 0) / samples.length,
      user: samples.reduce((sum, s) => sum + s.cpu.user, 0) / samples.length,
      system: samples.reduce((sum, s) => sum + s.cpu.system, 0) / samples.length
    };

    return {
      samples,
      peakCPU,
      avgCPU,
      sampleCount: samples.length,
      duration
    };
  }

  // Test concurrent agent spawning
  async benchmarkConcurrentAgents(maxAgents = 50) {
    console.log(`⚡ Testing concurrent agent spawning (${maxAgents} agents)...`);

    const testStart = Date.now();
    const preTestCPU = await this.getCPUUsage(1000);

    // Spawn all agents at once
    const agentPromises = [];
    for (let i = 0; i < maxAgents; i++) {
      agentPromises.push(this.spawnTestAgent(i));
    }

    // Monitor CPU with high frequency during spawning
    const monitoringPromise = this.monitorCPUDuring(15000); // 15 seconds

    try {
      const [agentResults, cpuMonitoring] = await Promise.all([
        Promise.allSettled(agentPromises),
        monitoringPromise
      ]);

      const successful = agentResults.filter(r => r.status === 'fulfilled').length;
      const failed = agentResults.filter(r => r.status === 'rejected').length;
      const errors = agentResults
        .filter(r => r.status === 'rejected')
        .map(r => r.reason.message);

      const postTestCPU = await this.getCPUUsage(2000);

      this.results.concurrentAgents = {
        maxAgents,
        successful,
        failed,
        duration: Date.now() - testStart,
        cpu: {
          pre: preTestCPU,
          post: postTestCPU,
          monitoring: cpuMonitoring
        },
        performance: {
          agentsPerSecond: successful / ((Date.now() - testStart) / 1000),
          successRate: (successful / maxAgents) * 100,
          cpuEfficiency: successful / cpuMonitoring.avgCPU.total, // agents per % CPU
          peakCPUUtilization: cpuMonitoring.peakCPU.total
        },
        errors: errors.slice(0, 5) // Keep first 5 errors for analysis
      };

      console.log(`✅ Concurrent test: ${successful}/${maxAgents} (${this.results.concurrentAgents.performance.successRate.toFixed(1)}%)`);
      console.log(`📈 CPU Peak: ${cpuMonitoring.peakCPU.total.toFixed(1)}%, Avg: ${cpuMonitoring.avgCPU.total.toFixed(1)}%`);
      console.log(`⚡ Throughput: ${this.results.concurrentAgents.performance.agentsPerSecond.toFixed(1)} agents/sec`);

    } catch (error) {
      console.error('❌ Concurrent agent test failed:', error);
      this.results.concurrentAgents.error = error.message;
    }

    return this.results.concurrentAgents;
  }

  // Analyze CPU performance patterns
  analyzeCPUPerformance() {
    const analysis = {
      baseline: this.results.baseline,
      loadScaling: this.analyzeLoadScaling(),
      concurrentPerformance: this.analyzeConcurrentPerformance(),
      systemLimits: this.analyzeSystemLimits(),
      recommendations: []
    };

    // Generate recommendations
    if (analysis.concurrentPerformance.peakCPU > 90) {
      analysis.recommendations.push({
        priority: 'HIGH',
        issue: `High CPU usage detected (${analysis.concurrentPerformance.peakCPU.toFixed(1)}%)`,
        action: 'Consider reducing concurrent agent count or optimizing agent operations'
      });
    }

    if (analysis.loadScaling.degradationPoint < 50) {
      analysis.recommendations.push({
        priority: 'MEDIUM',
        issue: `Performance degradation at ${analysis.loadScaling.degradationPoint} agents`,
        action: 'Implement agent batching or queue-based processing'
      });
    }

    if (analysis.systemLimits.cpuBottleneck) {
      analysis.recommendations.push({
        priority: 'HIGH',
        issue: 'CPU appears to be the bottleneck for scaling',
        action: 'Consider horizontal scaling or CPU optimization'
      });
    }

    return analysis;
  }

  // Analyze load scaling patterns
  analyzeLoadScaling() {
    const loadTests = this.results.loadTests.filter(test => !test.error);

    if (loadTests.length < 2) {
      return { error: 'Insufficient data for scaling analysis' };
    }

    // Find performance degradation point
    let degradationPoint = null;
    let maxThroughput = 0;

    for (const test of loadTests) {
      if (test.throughput.agentsPerSecond > maxThroughput) {
        maxThroughput = test.throughput.agentsPerSecond;
      }

      // Consider degradation when throughput drops below 80% of max
      if (!degradationPoint && test.throughput.agentsPerSecond < maxThroughput * 0.8) {
        degradationPoint = test.agentCount;
      }
    }

    return {
      maxThroughput,
      degradationPoint: degradationPoint || loadTests[loadTests.length - 1].agentCount,
      scalingEfficiency: this.calculateScalingEfficiency(loadTests),
      cpuScaling: this.analyzeCPUScaling(loadTests)
    };
  }

  // Calculate scaling efficiency
  calculateScalingEfficiency(loadTests) {
    const efficiencies = [];

    for (let i = 1; i < loadTests.length; i++) {
      const current = loadTests[i];
      const previous = loadTests[i - 1];

      const loadIncrease = current.agentCount / previous.agentCount;
      const throughputIncrease = current.throughput.agentsPerSecond / previous.throughput.agentsPerSecond;

      efficiencies.push({
        agentCount: current.agentCount,
        efficiency: throughputIncrease / loadIncrease,
        cpuIncrease: current.cpu.monitoring.avgCPU.total / previous.cpu.monitoring.avgCPU.total
      });
    }

    return efficiencies;
  }

  // Analyze CPU scaling patterns
  analyzeCPUScaling(loadTests) {
    return loadTests.map(test => ({
      agentCount: test.agentCount,
      avgCPU: test.cpu.monitoring.avgCPU.total,
      peakCPU: test.cpu.monitoring.peakCPU.total,
      cpuPerAgent: test.cpu.monitoring.avgCPU.total / test.agentCount
    }));
  }

  // Analyze concurrent performance
  analyzeConcurrentPerformance() {
    const concurrent = this.results.concurrentAgents;

    if (!concurrent || concurrent.error) {
      return { error: 'No concurrent performance data available' };
    }

    return {
      peakCPU: concurrent.cpu.monitoring.peakCPU.total,
      avgCPU: concurrent.cpu.monitoring.avgCPU.total,
      cpuEfficiency: concurrent.performance.cpuEfficiency,
      throughput: concurrent.performance.agentsPerSecond,
      successRate: concurrent.performance.successRate,
      cpuStability: this.analyzeCPUStability(concurrent.cpu.monitoring.samples)
    };
  }

  // Analyze CPU stability during operations
  analyzeCPUStability(samples) {
    const cpuValues = samples.map(s => s.cpu.total);
    const mean = cpuValues.reduce((sum, val) => sum + val, 0) / cpuValues.length;

    const variance = cpuValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / cpuValues.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = (standardDeviation / mean) * 100;

    return {
      mean,
      standardDeviation,
      coefficientOfVariation,
      stability: coefficientOfVariation < 20 ? 'STABLE' : coefficientOfVariation < 40 ? 'MODERATE' : 'UNSTABLE'
    };
  }

  // Analyze system limits
  analyzeSystemLimits() {
    const cpuCount = this.results.systemStats.cpuCount;
    const maxCPU = Math.max(
      ...(this.results.loadTests || []).map(test =>
        test.cpu?.monitoring?.peakCPU?.total || 0
      ),
      this.results.concurrentAgents?.cpu?.monitoring?.peakCPU?.total || 0
    );

    return {
      cpuCount,
      maxCPUUtilization: maxCPU,
      cpuBottleneck: maxCPU > 80,
      cpuUtilizationPercent: (maxCPU / (cpuCount * 100)) * 100,
      theoreticalMax: cpuCount * 100
    };
  }

  // Generate comprehensive report
  generateReport() {
    const analysis = this.analyzeCPUPerformance();

    return {
      metadata: {
        timestamp: this.results.timestamp,
        system: this.results.systemStats,
        testDuration: Date.now() - new Date(this.results.timestamp).getTime()
      },
      results: this.results,
      analysis,
      summary: {
        baselineCPU: this.results.baseline?.idle?.total || 0,
        peakCPU: analysis.concurrentPerformance?.peakCPU || 0,
        maxThroughput: analysis.loadScaling?.maxThroughput || 0,
        degradationPoint: analysis.loadScaling?.degradationPoint || 0,
        cpuStability: analysis.concurrentPerformance?.cpuStability?.stability || 'UNKNOWN',
        systemLimited: analysis.systemLimits?.cpuBottleneck || false
      }
    };
  }

  // Run all CPU benchmarks
  async runAllBenchmarks() {
    console.log('🚀 Starting CPU performance benchmark suite...\n');

    try {
      await this.benchmarkBaseline();
      await this.benchmarkAgentLoads();
      await this.benchmarkConcurrentAgents(50);

      const report = this.generateReport();

      // Save results
      const resultsPath = path.join(__dirname, '../../results/verification', `cpu-benchmark-${Date.now()}.json`);
      await fs.writeFile(resultsPath, JSON.stringify(report, null, 2));

      console.log('\n📊 CPU Benchmark Summary:');
      console.log(`- Baseline CPU: ${report.summary.baselineCPU.toFixed(1)}%`);
      console.log(`- Peak CPU Usage: ${report.summary.peakCPU.toFixed(1)}%`);
      console.log(`- Max Throughput: ${report.summary.maxThroughput.toFixed(1)} agents/sec`);
      console.log(`- Performance Degradation: ${report.summary.degradationPoint} agents`);
      console.log(`- CPU Stability: ${report.summary.cpuStability}`);
      console.log(`- System Limited: ${report.summary.systemLimited ? '⚠️ YES' : '✅ NO'}`);
      console.log(`\n📁 Results saved to: ${resultsPath}`);

      return report;

    } catch (error) {
      console.error('❌ CPU benchmark failed:', error);
      throw error;
    }
  }
}

module.exports = CPUBenchmark;

// Run if called directly
if (require.main === module) {
  const benchmark = new CPUBenchmark();
  benchmark.runAllBenchmarks()
    .then(results => {
      console.log('\n🎉 CPU benchmark completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 CPU benchmark failed:', error);
      process.exit(1);
    });
}