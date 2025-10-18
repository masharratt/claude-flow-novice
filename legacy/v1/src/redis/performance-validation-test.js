#!/usr/bin/env node

/**
 * Redis Performance Validation Test Suite
 *
 * Validates that Redis performance optimizations meet the target requirements:
 * - Task assignment latency <100ms
 * - Performance Validator confidence: 93%+
 * - Connection pooling efficiency
 * - Memory usage optimization
 */

import SecureRedisClient from '../cli/utils/secure-redis-client.js';
import RedisPerformanceDashboard from './performance-dashboard.js';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';

/**
 * Performance validation test configuration
 */
const TEST_CONFIG = {
  redis: {
    host: 'localhost',
    port: 6379,
    database: 0,
    pooling: true,
    enableCompression: true,
    enablePipelining: true,
    pipelineBatchSize: 50,
    minConnections: 5,
    maxConnections: 15
  },
  validation: {
    // Performance thresholds
    taskAssignmentLatency: 100, // ms
    batchOperationLatency: 200, // ms
    connectionAcquireTime: 50, // ms
    memoryCompressionRatio: 0.4, // 40% compression target
    errorRate: 2.0, // % max error rate
    throughputMin: 500, // ops/sec

    // Test parameters
    testDuration: 30000, // 30 seconds
    concurrentOperations: 20,
    batchSize: 100,
    swarmDataSize: 1000, // approximate swarm state size in objects

    // Confidence scoring
    latencyWeight: 0.35,
    reliabilityWeight: 0.25,
    throughputWeight: 0.25,
    efficiencyWeight: 0.15
  }
};

/**
 * Performance validation test suite
 */
class PerformanceValidationSuite {
  constructor() {
    this.redisClient = null;
    this.dashboard = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
    this.testData = [];
  }

  async initialize() {
    console.log('🔧 Initializing performance validation suite...');

    // Initialize Redis client with performance optimizations
    this.redisClient = new SecureRedisClient(TEST_CONFIG.redis);
    await this.redisClient.initialize();

    // Initialize performance dashboard
    this.dashboard = new RedisPerformanceDashboard({
      refreshInterval: 2000,
      latencyThreshold: TEST_CONFIG.validation.taskAssignmentLatency,
      errorRateThreshold: TEST_CONFIG.validation.errorRate
    });
    await this.dashboard.initialize(this.redisClient);
    await this.dashboard.start();

    console.log('✅ Performance validation suite initialized');
  }

  async runValidationTests() {
    console.log('\n🚀 Starting Redis Performance Validation Tests');
    console.log('=' .repeat(60));

    const tests = [
      { name: 'Task Assignment Latency', method: 'testTaskAssignmentLatency' },
      { name: 'Connection Pool Efficiency', method: 'testConnectionPoolEfficiency' },
      { name: 'Batch Operation Performance', method: 'testBatchOperationPerformance' },
      { name: 'Memory Compression Efficiency', method: 'testMemoryCompressionEfficiency' },
      { name: 'Concurrent Load Performance', method: 'testConcurrentLoadPerformance' },
      { name: 'Error Handling and Recovery', method: 'testErrorHandlingAndRecovery' },
      { name: 'Performance Under Stress', method: 'testPerformanceUnderStress' }
    ];

    for (const test of tests) {
      console.log(`\n📋 Running: ${test.name}`);
      try {
        await this[test.method]();
        this.testResults.passed++;
        console.log(`✅ ${test.name}: PASSED`);
      } catch (error) {
        this.testResults.failed++;
        console.log(`❌ ${test.name}: FAILED - ${error.message}`);
        this.testResults.details.push({
          test: test.name,
          status: 'FAILED',
          error: error.message
        });
      }
      this.testResults.total++;
    }

    await this.generateConfidenceScore();
    await this.generateValidationReport();

    return this.testResults.failed === 0;
  }

  async testTaskAssignmentLatency() {
    console.log('   Testing task assignment operations...');

    const latencies = [];
    const operations = 100;
    const swarmState = this.generateTestSwarmState('test-swarm-latency');

    for (let i = 0; i < operations; i++) {
      const startTime = performance.now();

      // Simulate task assignment operation
      await this.redisClient.set(
        `task:assignment:${i}`,
        JSON.stringify({
          taskId: `task_${i}`,
          agentId: `agent_${i % 10}`,
          assignedAt: Date.now(),
          priority: Math.floor(Math.random() * 5) + 1
        })
      );

      const latency = performance.now() - startTime;
      latencies.push(latency);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = this.percentile(latencies, 95);
    const maxLatency = Math.max(...latencies);

    console.log(`   📊 Average latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`   📊 P95 latency: ${p95Latency.toFixed(2)}ms`);
    console.log(`   📊 Max latency: ${maxLatency.toFixed(2)}ms`);

    if (avgLatency > TEST_CONFIG.validation.taskAssignmentLatency) {
      throw new Error(`Average latency ${avgLatency.toFixed(2)}ms exceeds threshold ${TEST_CONFIG.validation.taskAssignmentLatency}ms`);
    }

    this.testData.push({
      test: 'taskAssignmentLatency',
      avgLatency,
      p95Latency,
      maxLatency,
      operations,
      threshold: TEST_CONFIG.validation.taskAssignmentLatency
    });
  }

  async testConnectionPoolEfficiency() {
    console.log('   Testing connection pool performance...');

    const acquireTimes = [];
    const operations = 50;

    for (let i = 0; i < operations; i++) {
      const startTime = performance.now();

      // Simulate multiple rapid operations to test pool efficiency
      const promises = Array(5).fill().map(() =>
        this.redisClient.ping()
      );

      await Promise.all(promises);
      const acquireTime = performance.now() - startTime;
      acquireTimes.push(acquireTime);
    }

    const avgAcquireTime = acquireTimes.reduce((a, b) => a + b, 0) / acquireTimes.length;
    const poolStatus = this.redisClient.getHealthStatus();

    console.log(`   📊 Average pool operation time: ${avgAcquireTime.toFixed(2)}ms`);
    console.log(`   📊 Pool status: ${poolStatus.poolStatus.totalConnections} connections, ${poolStatus.poolStatus.inUseConnections} in use`);

    if (avgAcquireTime > TEST_CONFIG.validation.connectionAcquireTime) {
      throw new Error(`Pool operation time ${avgAcquireTime.toFixed(2)}ms exceeds threshold ${TEST_CONFIG.validation.connectionAcquireTime}ms`);
    }

    this.testData.push({
      test: 'connectionPoolEfficiency',
      avgAcquireTime,
      poolStatus: poolStatus.poolStatus,
      threshold: TEST_CONFIG.validation.connectionAcquireTime
    });
  }

  async testBatchOperationPerformance() {
    console.log('   Testing batch operation performance...');

    // Generate test data
    const batchSize = TEST_CONFIG.validation.batchSize;
    const testData = Array(batchSize).fill().map((_, i) => [
      `batch:key:${i}`,
      JSON.stringify({
        id: i,
        data: 'x'.repeat(100), // 100 bytes per item
        timestamp: Date.now()
      })
    ]);

    // Test batch set
    const startTime = performance.now();
    await this.redisClient.batchSet(testData, 3600);
    const batchSetTime = performance.now() - startTime;

    // Test batch get
    const keys = testData.map(([key]) => key);
    const getStartTime = performance.now();
    await this.redisClient.batchGet(keys);
    const batchGetTime = performance.now() - getStartTime;

    console.log(`   📊 Batch set (${batchSize} items): ${batchSetTime.toFixed(2)}ms`);
    console.log(`   📊 Batch get (${batchSize} items): ${batchGetTime.toFixed(2)}ms`);
    console.log(`   📊 Avg per item: ${((batchSetTime + batchGetTime) / (batchSize * 2)).toFixed(2)}ms`);

    if (batchSetTime > TEST_CONFIG.validation.batchOperationLatency) {
      throw new Error(`Batch set time ${batchSetTime.toFixed(2)}ms exceeds threshold ${TEST_CONFIG.validation.batchOperationLatency}ms`);
    }

    this.testData.push({
      test: 'batchOperationPerformance',
      batchSize,
      batchSetTime,
      batchGetTime,
      threshold: TEST_CONFIG.validation.batchOperationLatency
    });
  }

  async testMemoryCompressionEfficiency() {
    console.log('   Testing memory compression efficiency...');

    // Generate large data
    const largeData = {
      swarmId: 'compression-test',
      agents: Array(50).fill().map((_, i) => ({
        id: `agent_${i}`,
        role: 'tester',
        data: 'x'.repeat(1000) // 1KB per agent
      })),
      tasks: Array(100).fill().map((_, i) => ({
        id: `task_${i}`,
        description: 'Large task description '.repeat(20),
        details: 'x'.repeat(500)
      }))
    };

    const uncompressedSize = JSON.stringify(largeData).length;

    const startTime = performance.now();
    await this.redisClient.set('compression:test', largeData);
    const writeTime = performance.now() - startTime;

    const readStartTime = performance.now();
    const retrieved = await this.redisClient.get('compression:test');
    const readTime = performance.now() - readStartTime;

    // Get performance report to check compression metrics
    const performanceReport = this.redisClient.getPerformanceReport();
    const compressionRatio = performanceReport.performance.memory.compressionRatio;

    console.log(`   📊 Uncompressed size: ${(uncompressedSize / 1024).toFixed(1)}KB`);
    console.log(`   📊 Compression ratio: ${(compressionRatio * 100).toFixed(1)}%`);
    console.log(`   📊 Write time: ${writeTime.toFixed(2)}ms`);
    console.log(`   📊 Read time: ${readTime.toFixed(2)}ms`);

    if (compressionRatio > TEST_CONFIG.validation.memoryCompressionRatio) {
      throw new Error(`Compression ratio ${(compressionRatio * 100).toFixed(1)}% exceeds threshold ${(TEST_CONFIG.validation.memoryCompressionRatio * 100).toFixed(1)}%`);
    }

    this.testData.push({
      test: 'memoryCompressionEfficiency',
      uncompressedSize,
      compressionRatio,
      writeTime,
      readTime,
      threshold: TEST_CONFIG.validation.memoryCompressionRatio
    });
  }

  async testConcurrentLoadPerformance() {
    console.log('   Testing concurrent load performance...');

    const concurrentOps = TEST_CONFIG.validation.concurrentOperations;
    const operationsPerThread = 20;
    const testDuration = TEST_CONFIG.validation.testDuration;

    const startTime = Date.now();
    let totalOperations = 0;
    let errors = 0;

    const promises = Array(concurrentOps).fill().map(async (_, threadId) => {
      const threadOps = [];

      while (Date.now() - startTime < testDuration) {
        try {
          const opStart = performance.now();
          await this.redisClient.set(
            `concurrent:${threadId}:${Date.now()}`,
            JSON.stringify({ threadId, timestamp: Date.now() })
          );
          const opTime = performance.now() - opStart;
          threadOps.push(opTime);
          totalOperations++;
        } catch (error) {
          errors++;
        }
      }

      return threadOps;
    });

    const results = await Promise.all(promises);
    const allLatencies = results.flat();
    const actualDuration = Date.now() - startTime;
    const throughput = (totalOperations / actualDuration) * 1000; // ops/sec
    const errorRate = (errors / totalOperations) * 100;

    console.log(`   📊 Total operations: ${totalOperations}`);
    console.log(`   📊 Throughput: ${throughput.toFixed(2)} ops/sec`);
    console.log(`   📊 Error rate: ${errorRate.toFixed(2)}%`);
    console.log(`   📊 Duration: ${(actualDuration / 1000).toFixed(1)}s`);

    if (throughput < TEST_CONFIG.validation.throughputMin) {
      throw new Error(`Throughput ${throughput.toFixed(2)} ops/sec below threshold ${TEST_CONFIG.validation.throughputMin} ops/sec`);
    }

    if (errorRate > TEST_CONFIG.validation.errorRate) {
      throw new Error(`Error rate ${errorRate.toFixed(2)}% exceeds threshold ${TEST_CONFIG.validation.errorRate}%`);
    }

    this.testData.push({
      test: 'concurrentLoadPerformance',
      totalOperations,
      throughput,
      errorRate,
      duration: actualDuration,
      throughputThreshold: TEST_CONFIG.validation.throughputMin,
      errorThreshold: TEST_CONFIG.validation.errorRate
    });
  }

  async testErrorHandlingAndRecovery() {
    console.log('   Testing error handling and recovery...');

    let errors = 0;
    let recoveries = 0;
    const operations = 50;

    for (let i = 0; i < operations; i++) {
      try {
        // Test with invalid operations that should be caught gracefully
        await this.redisClient.executeCommand('set', 'test:key', 'valid_value');

        // Test recovery after error
        if (i % 10 === 0) {
          try {
            // This should fail but not crash the system
            await this.redisClient.executeCommand('invalid_command');
          } catch (error) {
            errors++;
            // Immediately try a valid operation to test recovery
            await this.redisClient.set('recovery:test', 'recovered');
            recoveries++;
          }
        }
      } catch (error) {
        errors++;
      }
    }

    const errorRate = (errors / operations) * 100;
    const recoveryRate = (recoveries / Math.max(errors, 1)) * 100;

    console.log(`   📊 Error rate: ${errorRate.toFixed(2)}%`);
    console.log(`   📊 Recovery rate: ${recoveryRate.toFixed(2)}%`);

    if (errorRate > TEST_CONFIG.validation.errorRate) {
      throw new Error(`Error rate ${errorRate.toFixed(2)}% exceeds threshold ${TEST_CONFIG.validation.errorRate}%`);
    }

    this.testData.push({
      test: 'errorHandlingAndRecovery',
      errorRate,
      recoveryRate,
      errors,
      recoveries,
      operations
    });
  }

  async testPerformanceUnderStress() {
    console.log('   Testing performance under stress conditions...');

    const stressOperations = 200;
    const batchSize = 20;
    const latencies = [];

    // Create high-load batch operations
    for (let batch = 0; batch < stressOperations / batchSize; batch++) {
      const startTime = performance.now();

      const operations = Array(batchSize).fill().map((_, i) => [
        `stress:test:${batch}:${i}`,
        JSON.stringify({
          batch,
          index: i,
          data: 'stress test data '.repeat(10),
          timestamp: Date.now()
        })
      ]);

      await this.redisClient.batchSet(operations);

      const latency = performance.now() - startTime;
      latencies.push(latency);

      // Brief pause to simulate real-world usage patterns
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p99Latency = this.percentile(latencies, 99);

    // Get final performance report
    const finalReport = this.redisClient.getPerformanceReport();

    console.log(`   📊 Stress test avg latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`   📊 P99 latency: ${p99Latency.toFixed(2)}ms`);
    console.log(`   📊 Final success rate: ${finalReport.performance.summary.successRate.toFixed(2)}%`);

    if (avgLatency > TEST_CONFIG.validation.taskAssignmentLatency * 1.5) {
      throw new Error(`Stress test latency ${avgLatency.toFixed(2)}ms exceeds threshold ${(TEST_CONFIG.validation.taskAssignmentLatency * 1.5).toFixed(2)}ms`);
    }

    this.testData.push({
      test: 'performanceUnderStress',
      avgLatency,
      p99Latency,
      successRate: finalReport.performance.summary.successRate,
      stressThreshold: TEST_CONFIG.validation.taskAssignmentLatency * 1.5
    });
  }

  async generateConfidenceScore() {
    console.log('\n🎯 Calculating Performance Validator Confidence Score...');

    const weights = TEST_CONFIG.validation;
    let totalScore = 0;
    let maxScore = 0;

    // Latency score (35%)
    const latencyTests = this.testData.filter(t => t.avgLatency || t.batchSetTime);
    if (latencyTests.length > 0) {
      const avgLatencyScore = latencyTests.reduce((sum, test) => {
        const latency = test.avgLatency || test.batchSetTime;
        const threshold = test.threshold || TEST_CONFIG.validation.taskAssignmentLatency;
        const score = Math.max(0, 100 - ((latency - threshold) / threshold * 100));
        return sum + score;
      }, 0) / latencyTests.length;

      totalScore += avgLatencyScore * weights.latencyWeight;
      maxScore += 100 * weights.latencyWeight;
    }

    // Reliability score (25%)
    const reliabilityTests = this.testData.filter(t => t.errorRate !== undefined || t.successRate !== undefined);
    if (reliabilityTests.length > 0) {
      const avgReliabilityScore = reliabilityTests.reduce((sum, test) => {
        const reliability = test.successRate !== undefined ? test.successRate : (100 - test.errorRate);
        return sum + reliability;
      }, 0) / reliabilityTests.length;

      totalScore += avgReliabilityScore * weights.reliabilityWeight;
      maxScore += 100 * weights.reliabilityWeight;
    }

    // Throughput score (25%)
    const throughputTests = this.testData.filter(t => t.throughput);
    if (throughputTests.length > 0) {
      const throughputTest = throughputTests[0]; // Use the main throughput test
      const throughputScore = Math.min(100, (throughputTest.throughput / throughputTest.throughputThreshold) * 100);

      totalScore += throughputScore * weights.throughputWeight;
      maxScore += 100 * weights.throughputWeight;
    }

    // Efficiency score (15%)
    const efficiencyTests = this.testData.filter(t => t.compressionRatio || t.avgAcquireTime);
    if (efficiencyTests.length > 0) {
      const avgEfficiencyScore = efficiencyTests.reduce((sum, test) => {
        if (test.compressionRatio) {
          // Compression efficiency: lower ratio is better
          return sum + Math.max(0, 100 - (test.compressionRatio * 200)); // Scale to 0-100
        } else if (test.avgAcquireTime) {
          // Pool efficiency: lower time is better
          return sum + Math.max(0, 100 - (test.avgAcquireTime / test.threshold * 100));
        }
        return sum + 50; // Neutral score
      }, 0) / efficiencyTests.length;

      totalScore += avgEfficiencyScore * weights.efficiencyWeight;
      maxScore += 100 * weights.efficiencyWeight;
    }

    const confidenceScore = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    console.log(`📊 Performance Validator Confidence: ${confidenceScore.toFixed(1)}%`);
    console.log(`   Target: 93.0%+`);
    console.log(`   Status: ${confidenceScore >= 93.0 ? '✅ ACHIEVED' : '❌ NEEDS IMPROVEMENT'}`);

    this.testResults.confidenceScore = confidenceScore;
    this.testResults.targetScore = 93.0;

    if (confidenceScore < 93.0) {
      throw new Error(`Performance confidence score ${confidenceScore.toFixed(1)}% below target 93.0%`);
    }
  }

  async generateValidationReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 REDIS PERFORMANCE VALIDATION REPORT');
    console.log('='.repeat(60));

    console.log(`\n🎯 VALIDATION SUMMARY:`);
    console.log(`   Tests Passed: ${this.testResults.passed}/${this.testResults.total}`);
    console.log(`   Confidence Score: ${this.testResults.confidenceScore?.toFixed(1) || 'N/A'}%`);
    console.log(`   Target Score: ${this.testResults.targetScore || 93.0}%`);
    console.log(`   Status: ${this.testResults.confidenceScore >= 93.0 ? '✅ VALIDATION PASSED' : '❌ VALIDATION FAILED'}`);

    console.log(`\n📈 PERFORMANCE METRICS:`);
    this.testData.forEach(test => {
      console.log(`   ${test.test}:`);
      Object.keys(test).forEach(key => {
        if (key !== 'test' && typeof test[key] === 'number') {
          console.log(`     ${key}: ${test[key].toFixed(2)}`);
        }
      });
    });

    // Get final performance report from dashboard
    const dashboardReport = this.dashboard.generatePerformanceReport();
    console.log(`\n🔧 DASHBOARD SUMMARY:`);
    console.log(`   Uptime: ${(dashboardReport.summary.uptime / 1000).toFixed(1)}s`);
    console.log(`   Total Operations: ${dashboardReport.summary.totalOperations}`);
    console.log(`   Success Rate: ${dashboardReport.summary.successRate.toFixed(2)}%`);
    console.log(`   Average Latency: ${dashboardReport.summary.averageLatency.toFixed(2)}ms`);
    console.log(`   Throughput: ${dashboardReport.summary.throughput.toFixed(2)} ops/sec`);

    console.log('\n' + '='.repeat(60));

    // Save detailed report
    const reportData = {
      timestamp: Date.now(),
      testResults: this.testResults,
      testData: this.testData,
      dashboardReport,
      configuration: TEST_CONFIG
    };

    try {
      await fs.writeFile('./test-results/redis-performance-validation.json', JSON.stringify(reportData, null, 2));
      console.log('📝 Detailed report saved to: ./test-results/redis-performance-validation.json');
    } catch (error) {
      console.warn('⚠️ Could not save detailed report:', error.message);
    }
  }

  generateTestSwarmState(swarmId) {
    return {
      swarmId,
      objective: 'Performance validation test',
      agents: Array(10).fill().map((_, i) => ({
        id: `agent_${i}`,
        role: ['coder', 'tester', 'reviewer'][i % 3],
        status: 'active',
        confidence: 0.9
      })),
      tasks: Array(20).fill().map((_, i) => ({
        id: `task_${i}`,
        status: 'pending',
        priority: Math.floor(Math.random() * 3) + 1
      })),
      timestamp: Date.now()
    };
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test environment...');

    try {
      if (this.dashboard) {
        await this.dashboard.stop();
      }

      if (this.redisClient) {
        await this.redisClient.shutdown();
      }

      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const testSuite = new PerformanceValidationSuite();

  try {
    await testSuite.initialize();
    const success = await testSuite.runValidationTests();

    if (success) {
      console.log('\n🎉 ALL VALIDATION TESTS PASSED!');
      console.log('Redis performance optimizations meet all target requirements.');
      process.exit(0);
    } else {
      console.log('\n❌ SOME VALIDATION TESTS FAILED!');
      console.log('Review the report above for performance improvement opportunities.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Validation test execution failed:', error);
    process.exit(1);
  } finally {
    await testSuite.cleanup();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { PerformanceValidationSuite };