/**
 * Performance Benchmark Suite for Phase 4 Optimization
 * Provides comprehensive performance testing and baseline measurement
 */

import { performance } from 'perf_hooks';
import { connectRedis, checkRedisHealth } from '../cli/utils/redis-client.js';
import { promises as fs } from 'fs';
import path from 'path';

export class PerformanceBenchmarkSuite {
  constructor(config = {}) {
    this.config = {
      redis: {
        host: 'localhost',
        port: 6379,
        database: 1 // Separate database for benchmarks
      },
      testDuration: 60000, // 60 seconds
      warmupIterations: 100,
      benchmarkIterations: 1000,
      monitoringInterval: 1000, // 1 second
      ...config
    };

    this.redisClient = null;
    this.baselineMetrics = new Map();
    this.currentMetrics = new Map();
    this.monitoringActive = false;
    this.benchmarkResults = [];
  }

  /**
   * Initialize benchmark suite and Redis connection
   */
  async initialize() {
    console.log('🚀 Initializing Performance Benchmark Suite...');

    try {
      this.redisClient = await connectRedis(this.config.redis);

      // Verify Redis health
      const health = await checkRedisHealth(this.redisClient);
      if (health.status !== 'healthy') {
        throw new Error(`Redis unhealthy: ${health.error}`);
      }

      console.log('✅ Redis connection established');
      console.log(`📊 Response time: ${health.responseTime}ms`);
      console.log(`💾 Memory usage: ${health.memoryUsage}`);

      // Create benchmark results directory
      await fs.mkdir('./benchmark-results', { recursive: true });

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize benchmark suite:', error.message);
      throw error;
    }
  }

  /**
   * Run comprehensive performance benchmarks
   */
  async runBenchmarks() {
    console.log('\n🎯 Starting Comprehensive Performance Benchmarks...');

    const startTime = performance.now();
    const results = {
      timestamp: Date.now(),
      duration: 0,
      tests: {},
      summary: {}
    };

    try {
      // Warmup phase
      await this.warmup();

      // Run individual benchmarks
      results.tests.redisOperations = await this.benchmarkRedisOperations();
      results.tests.eventBusLatency = await this.benchmarkEventBusLatency();
      results.tests.memoryUsage = await this.benchmarkMemoryUsage();
      results.tests.cpuUtilization = await this.benchmarkCPUUtilization();
      results.tests.concurrentOperations = await this.benchmarkConcurrentOperations();
      results.tests.garbageCollection = await this.benchmarkGarbageCollection();

      // Calculate summary
      results.summary = this.calculateSummary(results.tests);
      results.duration = performance.now() - startTime;

      // Save results
      await this.saveBenchmarkResults(results);

      console.log('\n✅ Benchmark suite completed successfully');
      console.log(`📊 Total duration: ${results.duration.toFixed(2)}ms`);

      return results;

    } catch (error) {
      console.error('❌ Benchmark suite failed:', error.message);
      throw error;
    }
  }

  /**
   * Warmup phase to stabilize performance measurements
   */
  async warmup() {
    console.log('🔥 Warming up systems...');

    const warmupStart = performance.now();

    // Redis warmup operations
    for (let i = 0; i < this.config.warmupIterations; i++) {
      await this.redisClient.set(`warmup:${i}`, `value_${i}`);
      await this.redisClient.get(`warmup:${i}`);
    }

    // Memory warmup
    const warmupData = [];
    for (let i = 0; i < this.config.warmupIterations; i++) {
      warmupData.push({
        id: i,
        data: 'x'.repeat(1000),
        timestamp: Date.now()
      });
    }

    // Clean up warmup data
    for (let i = 0; i < this.config.warmupIterations; i++) {
      await this.redisClient.del(`warmup:${i}`);
    }

    const warmupTime = performance.now() - warmupStart;
    console.log(`✅ Warmup completed in ${warmupTime.toFixed(2)}ms`);
  }

  /**
   * Benchmark Redis operations performance
   */
  async benchmarkRedisOperations() {
    console.log('📡 Benchmarking Redis operations...');

    const operations = ['set', 'get', 'hset', 'hget', 'lpush', 'lrange', 'sadd', 'smembers'];
    const results = {};

    for (const operation of operations) {
      const times = [];

      for (let i = 0; i < this.config.benchmarkIterations; i++) {
        const start = performance.now();

        switch (operation) {
          case 'set':
            await this.redisClient.set(`benchmark:${operation}:${i}`, `value_${i}`);
            break;
          case 'get':
            await this.redisClient.get(`benchmark:${operation}:${i}`);
            break;
          case 'hset':
            await this.redisClient.hSet(`benchmark:${operation}:${i}`, 'field', 'value');
            break;
          case 'hget':
            await this.redisClient.hGet(`benchmark:${operation}:${i}`, 'field');
            break;
          case 'lpush':
            await this.redisClient.lPush(`benchmark:${operation}:${i}`, 'item');
            break;
          case 'lrange':
            await this.redisClient.lRange(`benchmark:${operation}:${i}`, 0, -1);
            break;
          case 'sadd':
            await this.redisClient.sAdd(`benchmark:${operation}:${i}`, 'member');
            break;
          case 'smembers':
            await this.redisClient.sMembers(`benchmark:${operation}:${i}`);
            break;
        }

        times.push(performance.now() - start);
      }

      // Calculate statistics
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const p95Time = this.percentile(times, 0.95);
      const p99Time = this.percentile(times, 0.99);

      results[operation] = {
        avgLatency: avgTime.toFixed(3),
        minLatency: minTime.toFixed(3),
        maxLatency: maxTime.toFixed(3),
        p95Latency: p95Time.toFixed(3),
        p99Latency: p99Time.toFixed(3),
        throughput: (1000 / avgTime).toFixed(0)
      };

      // Cleanup
      for (let i = 0; i < this.config.benchmarkIterations; i++) {
        await this.redisClient.del(`benchmark:${operation}:${i}`);
      }
    }

    return results;
  }

  /**
   * Benchmark event bus latency with pub/sub
   */
  async benchmarkEventBusLatency() {
    console.log('📢 Benchmarking event bus latency...');

    const channelName = 'benchmark:events';
    const latencies = [];
    let messagesReceived = 0;

    // Subscribe to benchmark channel
    const subscriber = await connectRedis(this.config.redis);
    await subscriber.subscribe(channelName, (message) => {
      const data = JSON.parse(message);
      const latency = performance.now() - data.timestamp;
      latencies.push(latency);
      messagesReceived++;
    });

    // Publish test messages
    for (let i = 0; i < this.config.benchmarkIterations; i++) {
      const message = {
        id: i,
        timestamp: performance.now(),
        payload: 'x'.repeat(100)
      };

      await this.redisClient.publish(channelName, JSON.stringify(message));

      // Small delay to prevent overwhelming
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Wait for all messages to be received
    let attempts = 0;
    while (messagesReceived < this.config.benchmarkIterations && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    // Cleanup
    await subscriber.quit();

    // Calculate statistics
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const p95Latency = this.percentile(latencies, 0.95);
    const p99Latency = this.percentile(latencies, 0.99);

    return {
      avgLatency: avgLatency.toFixed(3),
      minLatency: minLatency.toFixed(3),
      maxLatency: maxLatency.toFixed(3),
      p95Latency: p95Latency.toFixed(3),
      p99Latency: p99Latency.toFixed(3),
      messagesProcessed: messagesReceived,
      messageLoss: ((this.config.benchmarkIterations - messagesReceived) / this.config.benchmarkIterations * 100).toFixed(2)
    };
  }

  /**
   * Benchmark memory usage patterns
   */
  async benchmarkMemoryUsage() {
    console.log('💾 Benchmarking memory usage...');

    const initialMemory = process.memoryUsage();
    const memorySnapshots = [initialMemory];

    // Simulate memory-intensive operations
    const dataArrays = [];

    for (let i = 0; i < 100; i++) {
      // Create memory pressure
      const dataArray = new Array(10000).fill(0).map((_, index) => ({
        id: i * 10000 + index,
        data: 'x'.repeat(100),
        timestamp: Date.now(),
        metadata: {
          type: 'benchmark',
          iteration: i,
          processed: false
        }
      }));

      dataArrays.push(dataArray);

      // Take memory snapshot
      if (i % 10 === 0) {
        memorySnapshots.push(process.memoryUsage());
      }

      // Simulate some processing
      dataArray.forEach(item => {
        item.metadata.processed = true;
      });

      // Clean up some arrays to simulate garbage collection
      if (i > 50 && i % 20 === 0) {
        dataArrays.splice(0, 5);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        memorySnapshots.push(process.memoryUsage());
      }
    }

    const finalMemory = process.memoryUsage();

    return {
      initialMemory: {
        rss: (initialMemory.rss / 1024 / 1024).toFixed(2),
        heapUsed: (initialMemory.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (initialMemory.heapTotal / 1024 / 1024).toFixed(2)
      },
      finalMemory: {
        rss: (finalMemory.rss / 1024 / 1024).toFixed(2),
        heapUsed: (finalMemory.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (finalMemory.heapTotal / 1024 / 1024).toFixed(2)
      },
      memoryGrowth: {
        rss: ((finalMemory.rss - initialMemory.rss) / 1024 / 1024).toFixed(2),
        heapUsed: ((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)
      },
      snapshots: memorySnapshots.map(snapshot => ({
        rss: (snapshot.rss / 1024 / 1024).toFixed(2),
        heapUsed: (snapshot.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (snapshot.heapTotal / 1024 / 1024).toFixed(2)
      }))
    };
  }

  /**
   * Benchmark CPU utilization
   */
  async benchmarkCPUUtilization() {
    console.log('⚡ Benchmarking CPU utilization...');

    const startCPU = process.cpuUsage();
    const startTime = performance.now();

    // CPU-intensive tasks
    const tasks = [];

    for (let i = 0; i < 10; i++) {
      const taskStart = performance.now();

      // Simulate computational work
      let result = 0;
      for (let j = 0; j < 1000000; j++) {
        result += Math.sqrt(j) * Math.sin(j);
      }

      const taskEnd = performance.now();
      tasks.push({
        id: i,
        duration: taskEnd - taskStart,
        result: result
      });
    }

    const endCPU = process.cpuUsage(startCPU);
    const totalTime = performance.now() - startTime;

    return {
      totalDuration: totalTime.toFixed(2),
      cpuUser: (endCPU.user / 1000).toFixed(2),
      cpuSystem: (endCPU.system / 1000).toFixed(2),
      taskCount: tasks.length,
      avgTaskDuration: (tasks.reduce((sum, task) => sum + task.duration, 0) / tasks.length).toFixed(2),
      tasksPerSecond: (tasks.length / (totalTime / 1000)).toFixed(2)
    };
  }

  /**
   * Benchmark concurrent operations
   */
  async benchmarkConcurrentOperations() {
    console.log('🔄 Benchmarking concurrent operations...');

    const concurrency = 100;
    const operationsPerBatch = 50;
    const results = {
      batches: [],
      summary: {}
    };

    for (let batch = 0; batch < 10; batch++) {
      const batchStart = performance.now();

      // Create concurrent operations
      const promises = [];

      for (let i = 0; i < concurrency; i++) {
        const promise = this.runConcurrentOperationBatch(batch, i, operationsPerBatch);
        promises.push(promise);
      }

      const batchResults = await Promise.all(promises);
      const batchEnd = performance.now();

      const batchDuration = batchEnd - batchStart;
      const totalOperations = batchResults.reduce((sum, result) => sum + result.operations, 0);

      results.batches.push({
        batchId: batch,
        duration: batchDuration.toFixed(2),
        totalOperations,
        operationsPerSecond: (totalOperations / (batchDuration / 1000)).toFixed(2),
        successRate: (batchResults.filter(r => r.success).length / batchResults.length * 100).toFixed(2)
      });
    }

    // Calculate summary
    const totalDuration = results.batches.reduce((sum, batch) => sum + parseFloat(batch.duration), 0);
    const totalOperations = results.batches.reduce((sum, batch) => sum + batch.totalOperations, 0);
    const avgOPS = results.batches.reduce((sum, batch) => sum + parseFloat(batch.operationsPerSecond), 0) / results.batches.length;

    results.summary = {
      totalBatches: results.batches.length,
      totalDuration: totalDuration.toFixed(2),
      totalOperations,
      avgOperationsPerSecond: avgOPS.toFixed(2),
      peakOperationsPerSecond: Math.max(...results.batches.map(b => parseFloat(b.operationsPerSecond))).toFixed(2)
    };

    return results;
  }

  /**
   * Run a batch of concurrent operations
   */
  async runConcurrentOperationBatch(batchId, operationId, operations) {
    try {
      const start = performance.now();

      for (let i = 0; i < operations; i++) {
        const key = `concurrent:${batchId}:${operationId}:${i}`;
        await this.redisClient.set(key, `value_${i}`);
        await this.redisClient.get(key);
      }

      const end = performance.now();

      return {
        success: true,
        operations,
        duration: end - start
      };
    } catch (error) {
      return {
        success: false,
        operations: 0,
        error: error.message
      };
    }
  }

  /**
   * Benchmark garbage collection impact
   */
  async benchmarkGarbageCollection() {
    console.log('🗑️ Benchmarking garbage collection impact...');

    const snapshots = [];

    // Create objects and measure GC impact
    for (let cycle = 0; cycle < 20; cycle++) {
      const cycleStart = performance.now();
      const memBefore = process.memoryUsage();

      // Create memory pressure
      const objects = [];
      for (let i = 0; i < 50000; i++) {
        objects.push({
          id: i,
          data: 'x'.repeat(100),
          cycle: cycle,
          timestamp: Date.now()
        });
      }

      const memAfterCreation = process.memoryUsage();

      // Clear references
      objects.length = 0;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const memAfterGC = process.memoryUsage();
      const cycleEnd = performance.now();

      snapshots.push({
        cycle,
        duration: cycleEnd - cycleStart,
        memoryBefore: {
          heapUsed: (memBefore.heapUsed / 1024 / 1024).toFixed(2),
          heapTotal: (memBefore.heapTotal / 1024 / 1024).toFixed(2)
        },
        memoryAfterCreation: {
          heapUsed: (memAfterCreation.heapUsed / 1024 / 1024).toFixed(2),
          heapTotal: (memAfterCreation.heapTotal / 1024 / 1024).toFixed(2)
        },
        memoryAfterGC: {
          heapUsed: (memAfterGC.heapUsed / 1024 / 1024).toFixed(2),
          heapTotal: (memAfterGC.heapTotal / 1024 / 1024).toFixed(2)
        },
        memoryFreed: ((memAfterCreation.heapUsed - memAfterGC.heapUsed) / 1024 / 1024).toFixed(2)
      });
    }

    return {
      cycles: snapshots.length,
      avgCycleDuration: (snapshots.reduce((sum, s) => sum + s.duration, 0) / snapshots.length).toFixed(2),
      avgMemoryFreed: (snapshots.reduce((sum, s) => sum + parseFloat(s.memoryFreed), 0) / snapshots.length).toFixed(2),
      snapshots
    };
  }

  /**
   * Calculate summary statistics from all benchmarks
   */
  calculateSummary(tests) {
    return {
      performanceScore: this.calculatePerformanceScore(tests),
      bottlenecks: this.identifyBottlenecks(tests),
      recommendations: this.generateRecommendations(tests),
      optimizationTargets: {
        latencyReduction: '30%',
        throughputImprovement: '50%',
        memoryOptimization: '20%',
        cpuEfficiency: '25%'
      }
    };
  }

  /**
   * Calculate overall performance score
   */
  calculatePerformanceScore(tests) {
    let score = 100;

    // Redis operations performance
    const redisAvg = Object.values(tests.redisOperations).reduce((sum, op) => sum + parseFloat(op.avgLatency), 0) / Object.keys(tests.redisOperations).length;
    if (redisAvg > 5) score -= 20;
    else if (redisAvg > 2) score -= 10;

    // Event bus latency
    const eventLatency = parseFloat(tests.eventBusLatency.avgLatency);
    if (eventLatency > 20) score -= 20;
    else if (eventLatency > 10) score -= 10;

    // Memory efficiency
    const memoryGrowth = parseFloat(tests.memoryUsage.memoryGrowth.heapUsed);
    if (memoryGrowth > 100) score -= 15;
    else if (memoryGrowth > 50) score -= 8;

    // Concurrency performance
    const concurrency = parseFloat(tests.concurrentOperations.summary.avgOperationsPerSecond);
    if (concurrency < 1000) score -= 15;
    else if (concurrency < 2000) score -= 8;

    return Math.max(0, score).toFixed(1);
  }

  /**
   * Identify performance bottlenecks
   */
  identifyBottlenecks(tests) {
    const bottlenecks = [];

    // Check Redis performance
    const slowRedisOps = Object.entries(tests.redisOperations)
      .filter(([_, metrics]) => parseFloat(metrics.avgLatency) > 5)
      .map(([op, _]) => op);

    if (slowRedisOps.length > 0) {
      bottlenecks.push({
        type: 'redis',
        severity: 'high',
        description: `Slow Redis operations: ${slowRedisOps.join(', ')}`,
        impact: 'High latency in data operations'
      });
    }

    // Check event bus
    if (parseFloat(tests.eventBusLatency.avgLatency) > 10) {
      bottlenecks.push({
        type: 'eventbus',
        severity: 'medium',
        description: 'High event bus latency',
        impact: 'Delayed message processing'
      });
    }

    // Check memory
    if (parseFloat(tests.memoryUsage.memoryGrowth.heapUsed) > 50) {
      bottlenecks.push({
        type: 'memory',
        severity: 'medium',
        description: 'Excessive memory growth',
        impact: 'Potential memory leaks and GC pressure'
      });
    }

    return bottlenecks;
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(tests) {
    const recommendations = [];

    // Redis optimizations
    recommendations.push({
      category: 'redis',
      priority: 'high',
      action: 'Implement connection pooling',
      description: 'Use Redis connection pool to reduce connection overhead',
      expectedImprovement: '20-30% latency reduction'
    });

    recommendations.push({
      category: 'redis',
      priority: 'medium',
      action: 'Optimize data structures',
      description: 'Use appropriate Redis data structures for specific use cases',
      expectedImprovement: '10-15% performance improvement'
    });

    // Memory optimizations
    recommendations.push({
      category: 'memory',
      priority: 'high',
      action: 'Implement object pooling',
      description: 'Reuse objects to reduce garbage collection pressure',
      expectedImprovement: '25% reduction in GC pauses'
    });

    // Concurrency optimizations
    recommendations.push({
      category: 'concurrency',
      priority: 'high',
      action: 'Implement batch processing',
      description: 'Group operations to reduce per-operation overhead',
      expectedImprovement: '40% throughput improvement'
    });

    return recommendations;
  }

  /**
   * Save benchmark results to file
   */
  async saveBenchmarkResults(results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `benchmark-results-${timestamp}.json`;
    const filepath = path.join('./benchmark-results', filename);

    await fs.writeFile(filepath, JSON.stringify(results, null, 2));

    console.log(`💾 Benchmark results saved to: ${filepath}`);

    // Also save as latest for easy access
    const latestPath = path.join('./benchmark-results', 'latest.json');
    await fs.writeFile(latestPath, JSON.stringify(results, null, 2));

    return filepath;
  }

  /**
   * Calculate percentile from array of numbers
   */
  percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((sorted.length - 1) * p);
    return sorted[index];
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    this.monitoringActive = false;
    console.log('✅ Benchmark suite cleaned up');
  }
}

// Export for use in other modules
export default PerformanceBenchmarkSuite;