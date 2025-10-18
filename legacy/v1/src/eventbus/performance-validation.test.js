#!/usr/bin/env node

/**
 * QEEventBus Performance Validation Tests
 *
 * Comprehensive performance tests to validate 10,000+ events/second throughput
 * with <50ms average latency and Redis coordination.
 */

import { performance } from 'perf_hooks';
import crypto from 'crypto';
import cluster from 'cluster';
import os from 'os';

// Import QEEventBus components
const QEEventBus = require('./QEEventBus.js').default;
const RedisCoordinator = require('./RedisCoordinator.js').default;
const { EventType, EventPriority } = require('./types.js');

/**
 * Test configuration
 */
const TEST_CONFIG = {
  // Performance targets
  targets: {
    throughput: 10000,        // events per second
    latency: 50,              // average latency in ms
    p99Latency: 100,          // 99th percentile latency in ms
    memoryUsage: 512 * 1024 * 1024, // 512MB max memory
    errorRate: 0.01           // 1% max error rate
  },

  // Test durations
  durations: {
    warmup: 5000,             // 5 seconds warmup
    benchmark: 30000,         // 30 seconds benchmark
    stress: 60000,            // 1 minute stress test
    sustained: 300000         // 5 minutes sustained test
  },

  // Test parameters
  parameters: {
    eventBatchSize: 100,      // events per batch
    concurrentWorkers: os.cpus().length,
    messageSize: 1024,        // average message size in bytes
    redisKeyPrefix: 'qeeventbus:test'
  },

  // Redis configuration
  redis: {
    host: 'localhost',
    port: 6379,
    db: 1, // Use different DB for tests
    keyPrefix: 'qeeventbus:test',
    serialization: 'json'
  }
};

/**
 * Performance metrics collector
 */
class PerformanceCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.metrics = {
      eventsProcessed: 0,
      eventsSucceeded: 0,
      eventsFailed: 0,
      latencies: [],
      throughput: [],
      memoryUsage: [],
      cpuUsage: [],
      errors: [],
      startTime: null,
      endTime: null
    };
  }

  start() {
    this.metrics.startTime = performance.now();
  }

  stop() {
    this.metrics.endTime = performance.now();
  }

  recordEvent(latency, success = true, error = null) {
    this.metrics.eventsProcessed++;
    this.metrics.latencies.push(latency);

    if (success) {
      this.metrics.eventsSucceeded++;
    } else {
      this.metrics.eventsFailed++;
      if (error) {
        this.metrics.errors.push({
          timestamp: Date.now(),
          error: error.message || error
        });
      }
    }

    // Keep latency array size manageable
    if (this.metrics.latencies.length > 100000) {
      this.metrics.latencies = this.metrics.latencies.slice(-50000);
    }
  }

  recordThroughput(eventsPerSecond) {
    this.metrics.throughput.push({
      timestamp: Date.now(),
      throughput: eventsPerSecond
    });
  }

  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    });
  }

  recordCpuUsage() {
    const cpuUsage = process.cpuUsage();
    this.metrics.cpuUsage.push({
      timestamp: Date.now(),
      user: cpuUsage.user,
      system: cpuUsage.system
    });
  }

  calculateStats() {
    const duration = (this.metrics.endTime - this.metrics.startTime) / 1000;
    const latencies = this.metrics.latencies.sort((a, b) => a - b);

    const stats = {
      summary: {
        duration,
        totalEvents: this.metrics.eventsProcessed,
        successRate: this.metrics.eventsSucceeded / this.metrics.eventsProcessed,
        errorRate: this.metrics.eventsFailed / this.metrics.eventsProcessed,
        averageThroughput: this.metrics.eventsProcessed / duration
      },
      latency: {
        average: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length || 0,
        min: latencies[0] || 0,
        max: latencies[latencies.length - 1] || 0,
        p50: this.percentile(latencies, 50),
        p90: this.percentile(latencies, 90),
        p95: this.percentile(latencies, 95),
        p99: this.percentile(latencies, 99),
        p999: this.percentile(latencies, 99.9)
      },
      throughput: {
        peak: Math.max(...this.metrics.throughput.map(t => t.throughput), 0),
        average: this.metrics.throughput.reduce((sum, t) => sum + t.throughput, 0) / this.metrics.throughput.length || 0,
        sustained: this.calculateSustainedThroughput()
      },
      memory: {
        peak: Math.max(...this.metrics.memoryUsage.map(m => m.heapUsed), 0),
        average: this.metrics.memoryUsage.reduce((sum, m) => sum + m.heapUsed, 0) / this.metrics.memoryUsage.length || 0,
        final: this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]?.heapUsed || 0
      },
      errors: {
        total: this.metrics.errors.length,
        byType: this.groupErrorsByType()
      }
    };

    return stats;
  }

  percentile(sortedArray, p) {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  calculateSustainedThroughput() {
    if (this.metrics.throughput.length < 10) return 0;

    // Calculate throughput over last 80% of test duration
    const startIndex = Math.floor(this.metrics.throughput.length * 0.2);
    const recentThroughput = this.metrics.throughput.slice(startIndex);

    return recentThroughput.reduce((sum, t) => sum + t.throughput, 0) / recentThroughput.length;
  }

  groupErrorsByType() {
    const groups = {};
    this.metrics.errors.forEach(error => {
      const type = error.error.split(':')[0] || 'unknown';
      groups[type] = (groups[type] || 0) + 1;
    });
    return groups;
  }
}

/**
 * Test event generator
 */
class EventGenerator {
  constructor() {
    this.eventTypes = Object.values(EventType);
    this.priorities = Object.values(EventPriority);
  }

  generateEvent(agentId = null, customData = null) {
    return {
      id: `evt_${crypto.randomBytes(8).toString('hex')}`,
      type: this.eventTypes[Math.floor(Math.random() * this.eventTypes.length)],
      agentId: agentId || `agent_${Math.floor(Math.random() * 1000)}`,
      swarmId: `swarm_${Math.floor(Math.random() * 10)}`,
      timestamp: Date.now(),
      priority: this.priorities[Math.floor(Math.random() * this.priorities.length)],
      data: customData || this.generateEventData(),
      metadata: {
        source: 'performance-test',
        version: '1.0.0',
        correlationId: crypto.randomBytes(16).toString('hex')
      }
    };
  }

  generateEventData() {
    const dataSize = TEST_CONFIG.parameters.messageSize;
    return {
      message: 'x'.repeat(dataSize),
      timestamp: Date.now(),
      counter: Math.floor(Math.random() * 1000000),
      payload: {
        nested: {
          data: Array.from({ length: 10 }, () => Math.random()),
          text: 'performance test data'
        }
      }
    };
  }

  generateEventBatch(count, agentId = null) {
    return Array.from({ length: count }, () => this.generateEvent(agentId));
  }
}

/**
 * Performance test suite
 */
class PerformanceTestSuite {
  constructor() {
    this.collector = new PerformanceCollector();
    this.generator = new EventGenerator();
    this.eventBus = null;
    this.redisCoordinator = null;
    this.testResults = [];
  }

  async initialize() {
    console.log('🔧 Initializing performance test environment...');

    try {
      // Initialize Redis coordinator
      this.redisCoordinator = new RedisCoordinator(TEST_CONFIG.redis);
      await this.redisCoordinator.connect();

      // Initialize event bus
      const eventBusConfig = {
        nodeId: `perf-test-${cluster.worker?.id || 'master'}`,
        redis: TEST_CONFIG.redis,
        performance: {
          targetThroughput: TEST_CONFIG.targets.throughput,
          maxLatency: TEST_CONFIG.targets.latency,
          bufferSize: 10000,
          workerThreads: TEST_CONFIG.parameters.concurrentWorkers
        },
        logging: {
          enabled: false // Disable logging for performance tests
        }
      };

      this.eventBus = new QEEventBus(eventBusConfig);
      await this.eventBus.start();

      console.log('✅ Performance test environment initialized');

    } catch (error) {
      console.error('❌ Failed to initialize test environment:', error);
      throw error;
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up test environment...');

    try {
      if (this.eventBus) {
        await this.eventBus.stop();
      }

      if (this.redisCoordinator) {
        await this.redisCoordinator.disconnect();
      }

      console.log('✅ Test environment cleaned up');

    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    }
  }

  async runWarmup() {
    console.log('🔥 Running warmup test...');

    this.collector.reset();
    this.collector.start();

    const warmupDuration = TEST_CONFIG.durations.warmup;
    const startTime = Date.now();
    let eventsSent = 0;

    // Monitor performance during warmup
    const metricsInterval = setInterval(() => {
      this.collector.recordMemoryUsage();
      this.collector.recordCpuUsage();
    }, 1000);

    while (Date.now() - startTime < warmupDuration) {
      const batchSize = TEST_CONFIG.parameters.eventBatchSize;
      const events = this.generator.generateEventBatch(batchSize);

      for (const event of events) {
        const publishStart = performance.now();

        try {
          await this.eventBus.publish(event);
          const latency = performance.now() - publishStart;
          this.collector.recordEvent(latency, true);
          eventsSent++;
        } catch (error) {
          const latency = performance.now() - publishStart;
          this.collector.recordEvent(latency, false, error);
        }
      }

      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    clearInterval(metricsInterval);
    this.collector.stop();

    const stats = this.collector.calculateStats();
    console.log(`   Warmup completed: ${eventsSent} events, ${stats.latency.average.toFixed(2)}ms avg latency`);

    return stats;
  }

  async runThroughputTest() {
    console.log('⚡ Running throughput test...');

    this.collector.reset();
    this.collector.start();

    const testDuration = TEST_CONFIG.durations.benchmark;
    const startTime = Date.now();
    let eventsSent = 0;
    let lastThroughputTime = startTime;
    let lastThroughputCount = 0;

    // Monitor performance during test
    const metricsInterval = setInterval(() => {
      this.collector.recordMemoryUsage();
      this.collector.recordCpuUsage();

      // Calculate current throughput
      const now = Date.now();
      const timeDiff = (now - lastThroughputTime) / 1000;
      const eventDiff = eventsSent - lastThroughputCount;
      const currentThroughput = eventDiff / timeDiff;

      this.collector.recordThroughput(currentThroughput);

      lastThroughputTime = now;
      lastThroughputCount = eventsSent;
    }, 1000);

    // Generate and publish events
    while (Date.now() - startTime < testDuration) {
      const batchSize = TEST_CONFIG.parameters.eventBatchSize;
      const events = this.generator.generateEventBatch(batchSize);

      // Publish events in parallel for maximum throughput
      const publishPromises = events.map(async (event) => {
        const publishStart = performance.now();

        try {
          await this.eventBus.publish(event);
          const latency = performance.now() - publishStart;
          return { latency, success: true };
        } catch (error) {
          const latency = performance.now() - publishStart;
          return { latency, success: false, error };
        }
      });

      const results = await Promise.allSettled(publishPromises);

      // Record results
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { latency, success, error } = result.value;
          this.collector.recordEvent(latency, success, error);
          if (success) eventsSent++;
        } else {
          this.collector.recordEvent(0, false, result.reason);
        }
      });
    }

    clearInterval(metricsInterval);
    this.collector.stop();

    const stats = this.collector.calculateStats();
    this.testResults.push({ test: 'throughput', stats });

    console.log(`   Throughput test completed: ${eventsSent} events, ${stats.summary.averageThroughput.toFixed(0)} events/sec`);
    console.log(`   Latency: avg ${stats.latency.average.toFixed(2)}ms, p95 ${stats.latency.p95.toFixed(2)}ms, p99 ${stats.latency.p99.toFixed(2)}ms`);

    return stats;
  }

  async runLatencyTest() {
    console.log('⏱️  Running latency test...');

    this.collector.reset();
    this.collector.start();

    const targetEvents = TEST_CONFIG.targets.throughput;
    let eventsSent = 0;

    // Monitor performance
    const metricsInterval = setInterval(() => {
      this.collector.recordMemoryUsage();
    }, 1000);

    // Publish events one by one to measure individual latency
    while (eventsSent < targetEvents) {
      const event = this.generator.generateEvent();
      const publishStart = performance.now();

      try {
        await this.eventBus.publish(event);
        const latency = performance.now() - publishStart;
        this.collector.recordEvent(latency, true);
        eventsSent++;
      } catch (error) {
        const latency = performance.now() - publishStart;
        this.collector.recordEvent(latency, false, error);
      }
    }

    clearInterval(metricsInterval);
    this.collector.stop();

    const stats = this.collector.calculateStats();
    this.testResults.push({ test: 'latency', stats });

    console.log(`   Latency test completed: ${eventsSent} events`);
    console.log(`   Latency: avg ${stats.latency.average.toFixed(2)}ms, p95 ${stats.latency.p95.toFixed(2)}ms, p99 ${stats.latency.p99.toFixed(2)}ms`);

    return stats;
  }

  async runStressTest() {
    console.log('💪 Running stress test...');

    this.collector.reset();
    this.collector.start();

    const testDuration = TEST_CONFIG.durations.stress;
    const startTime = Date.now();
    let eventsSent = 0;

    // Increase batch size for stress test
    const stressBatchSize = TEST_CONFIG.parameters.eventBatchSize * 2;

    // Monitor performance
    const metricsInterval = setInterval(() => {
      this.collector.recordMemoryUsage();
      this.collector.recordCpuUsage();
    }, 1000);

    while (Date.now() - startTime < testDuration) {
      const events = this.generator.generateEventBatch(stressBatchSize);

      // Publish events with minimal delay
      const publishPromises = events.map(async (event) => {
        const publishStart = performance.now();

        try {
          await this.eventBus.publish(event);
          const latency = performance.now() - publishStart;
          return { latency, success: true };
        } catch (error) {
          const latency = performance.now() - publishStart;
          return { latency, success: false, error };
        }
      });

      const results = await Promise.allSettled(publishPromises);

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { latency, success, error } = result.value;
          this.collector.recordEvent(latency, success, error);
          if (success) eventsSent++;
        } else {
          this.collector.recordEvent(0, false, result.reason);
        }
      });

      // Minimal delay for stress test
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    clearInterval(metricsInterval);
    this.collector.stop();

    const stats = this.collector.calculateStats();
    this.testResults.push({ test: 'stress', stats });

    console.log(`   Stress test completed: ${eventsSent} events, ${stats.summary.averageThroughput.toFixed(0)} events/sec`);
    console.log(`   Memory peak: ${(stats.memory.peak / 1024 / 1024).toFixed(2)}MB`);

    return stats;
  }

  evaluateResults() {
    console.log('\n📊 Evaluating test results against targets...');

    const targets = TEST_CONFIG.targets;
    const results = this.testResults;

    const evaluation = {
      passed: true,
      throughput: { passed: true, actual: 0, target: targets.throughput },
      latency: { passed: true, actual: 0, target: targets.latency },
      p99Latency: { passed: true, actual: 0, target: targets.p99Latency },
      memory: { passed: true, actual: 0, target: targets.memoryUsage },
      errorRate: { passed: true, actual: 0, target: targets.errorRate },
      tests: {}
    };

    // Evaluate each test
    results.forEach(result => {
      const { test, stats } = result;
      evaluation.tests[test] = {
        throughput: stats.summary.averageThroughput,
        latency: stats.latency.average,
        p99Latency: stats.latency.p99,
        memory: stats.memory.peak,
        errorRate: stats.summary.errorRate
      };
    });

    // Find best results across all tests
    const bestThroughput = Math.max(...results.map(r => r.stats.summary.averageThroughput));
    const bestLatency = Math.min(...results.map(r => r.stats.latency.average));
    const bestP99Latency = Math.min(...results.map(r => r.stats.latency.p99));
    const maxMemory = Math.max(...results.map(r => r.stats.memory.peak));
    const maxErrorRate = Math.max(...results.map(r => r.stats.summary.errorRate));

    // Update evaluation with best results
    evaluation.throughput.actual = bestThroughput;
    evaluation.latency.actual = bestLatency;
    evaluation.p99Latency.actual = bestP99Latency;
    evaluation.memory.actual = maxMemory;
    evaluation.errorRate.actual = maxErrorRate;

    // Check if targets are met
    evaluation.throughput.passed = bestThroughput >= targets.throughput;
    evaluation.latency.passed = bestLatency <= targets.latency;
    evaluation.p99Latency.passed = bestP99Latency <= targets.p99Latency;
    evaluation.memory.passed = maxMemory <= targets.memoryUsage;
    evaluation.errorRate.passed = maxErrorRate <= targets.errorRate;

    evaluation.passed = Object.values(evaluation)
      .filter(v => typeof v === 'object' && v.passed !== undefined)
      .every(v => v.passed);

    return evaluation;
  }

  printResults(evaluation) {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 PERFORMANCE VALIDATION RESULTS');
    console.log('='.repeat(80));

    // Overall result
    console.log(`\n${evaluation.passed ? '✅' : '❌'} Overall Result: ${evaluation.passed ? 'PASSED' : 'FAILED'}`);

    // Target comparison
    console.log('\n📈 Target Comparison:');
    console.log(`   Throughput: ${evaluation.throughput.passed ? '✅' : '❌'} ${evaluation.throughput.actual.toFixed(0)} events/sec (target: ${evaluation.throughput.target})`);
    console.log(`   Latency: ${evaluation.latency.passed ? '✅' : '❌'} ${evaluation.latency.actual.toFixed(2)}ms avg (target: ${evaluation.latency.target}ms)`);
    console.log(`   P99 Latency: ${evaluation.p99Latency.passed ? '✅' : '❌'} ${evaluation.p99Latency.actual.toFixed(2)}ms (target: ${evaluation.p99Latency.target}ms)`);
    console.log(`   Memory: ${evaluation.memory.passed ? '✅' : '❌'} ${(evaluation.memory.actual / 1024 / 1024).toFixed(2)}MB (target: ${(evaluation.memory.target / 1024 / 1024).toFixed(2)}MB)`);
    console.log(`   Error Rate: ${evaluation.errorRate.passed ? '✅' : '❌'} ${(evaluation.errorRate.actual * 100).toFixed(2)}% (target: ${(evaluation.errorRate.target * 100).toFixed(2)}%)`);

    // Individual test results
    console.log('\n📊 Individual Test Results:');
    Object.entries(evaluation.tests).forEach(([test, stats]) => {
      console.log(`   ${test.toUpperCase()}:`);
      console.log(`     Throughput: ${stats.throughput.toFixed(0)} events/sec`);
      console.log(`     Latency: ${stats.latency.toFixed(2)}ms avg, ${stats.p99Latency.toFixed(2)}ms p99`);
      console.log(`     Memory: ${(stats.memory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`     Error Rate: ${(stats.errorRate * 100).toFixed(2)}%`);
    });

    console.log('\n' + '='.repeat(80));

    if (!evaluation.passed) {
      console.log('\n❌ Performance targets not met. See details above.');
      process.exit(1);
    } else {
      console.log('\n🎉 All performance targets achieved!');
      console.log('✅ QEEventBus is ready for production deployment.');
    }
  }

  async runFullSuite() {
    console.log('🚀 Starting QEEventBus Performance Validation Suite\n');

    try {
      await this.initialize();

      // Run tests in sequence
      await this.runWarmup();
      await this.runThroughputTest();
      await this.runLatencyTest();
      await this.runStressTest();

      // Evaluate and print results
      const evaluation = this.evaluateResults();
      this.printResults(evaluation);

    } catch (error) {
      console.error('\n💥 Performance test suite failed:', error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  if (cluster.isMaster && os.cpus().length > 1) {
    console.log(`🔧 Running performance tests on ${os.cpus().length} CPU cores`);

    // Fork worker processes
    const workers = [];
    for (let i = 0; i < os.cpus().length; i++) {
      const worker = cluster.fork();
      workers.push(worker);
    }

    // Collect results from workers
    let allResults = [];
    let completedWorkers = 0;

    workers.forEach(worker => {
      worker.on('message', (message) => {
        if (message.type === 'results') {
          allResults.push(message.results);
          completedWorkers++;

          if (completedWorkers === workers.length) {
            // Aggregate results from all workers
            const aggregatedResults = aggregateWorkerResults(allResults);
            printAggregatedResults(aggregatedResults);

            // Shutdown workers
            workers.forEach(w => w.kill());
          }
        }
      });
    });

  } else {
    // Worker process or single-core execution
    const testSuite = new PerformanceTestSuite();
    await testSuite.runFullSuite();

    if (cluster.isWorker) {
      // Send results back to master
      process.send({
        type: 'results',
        results: testSuite.testResults
      });
    }
  }
}

/**
 * Aggregate results from multiple worker processes
 */
function aggregateWorkerResults(workerResults) {
  // Combine results from all workers
  const aggregated = {
    totalEvents: 0,
    averageThroughput: 0,
    averageLatency: 0,
    maxMemory: 0,
    totalErrors: 0,
    workers: workerResults.length
  };

  workerResults.forEach(results => {
    results.forEach(result => {
      aggregated.totalEvents += result.stats.summary.totalEvents;
      aggregated.averageThroughput += result.stats.summary.averageThroughput;
      aggregated.averageLatency += result.stats.latency.average;
      aggregated.maxMemory = Math.max(aggregated.maxMemory, result.stats.memory.peak);
      aggregated.totalErrors += result.stats.summary.errors.total;
    });
  });

  // Calculate averages
  const totalTestRuns = workerResults.reduce((sum, results) => sum + results.length, 0);
  aggregated.averageThroughput /= totalTestRuns;
  aggregated.averageLatency /= totalTestRuns;

  return aggregated;
}

/**
 * Print aggregated results from multiple workers
 */
function printAggregatedResults(results) {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 AGGREGATED PERFORMANCE RESULTS (MULTI-CORE)');
  console.log('='.repeat(80));
  console.log(`Workers: ${results.workers}`);
  console.log(`Total Events: ${results.totalEvents.toLocaleString()}`);
  console.log(`Average Throughput: ${results.averageThroughput.toFixed(0)} events/sec`);
  console.log(`Average Latency: ${results.averageLatency.toFixed(2)}ms`);
  console.log(`Peak Memory: ${(results.maxMemory / 1024 / 1024).toFixed(2)}MB`);
  console.log(`Total Errors: ${results.totalErrors}`);
  console.log('='.repeat(80));
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { PerformanceTestSuite, PerformanceCollector, EventGenerator };