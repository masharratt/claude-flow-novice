/**
 * Performance Test Setup - Comprehensive performance testing utilities
 * Focuses on memory usage, execution time, and scalability testing
 */

import { jest } from '@jest/globals';
import { performance } from 'perf_hooks';

// Performance test configuration
global.PERFORMANCE_CONFIG = {
  timeouts: {
    fast: 100,      // < 100ms for fast operations
    medium: 1000,   // < 1s for medium operations
    slow: 5000,     // < 5s for slow operations
    bulk: 30000     // < 30s for bulk operations
  },
  memory: {
    small: 10 * 1024 * 1024,    // 10MB
    medium: 50 * 1024 * 1024,   // 50MB
    large: 100 * 1024 * 1024    // 100MB
  },
  iterations: {
    stress: 1000,
    load: 100,
    basic: 10
  }
};

// Performance measurement utilities
global.performanceUtils = {
  /**
   * Measure execution time with high precision
   */
  async measureExecutionTime(fn, iterations = 1) {
    const measurements = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      measurements.push(end - start);
    }

    return {
      measurements,
      average: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      median: this.calculateMedian(measurements),
      standardDeviation: this.calculateStandardDeviation(measurements)
    };
  },

  /**
   * Measure memory usage before and after operation
   */
  async measureMemoryUsage(fn) {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const beforeMemory = process.memoryUsage();
    const result = await fn();

    if (global.gc) {
      global.gc();
    }

    const afterMemory = process.memoryUsage();

    return {
      result,
      memoryDelta: {
        rss: afterMemory.rss - beforeMemory.rss,
        heapUsed: afterMemory.heapUsed - beforeMemory.heapUsed,
        heapTotal: afterMemory.heapTotal - beforeMemory.heapTotal,
        external: afterMemory.external - beforeMemory.external,
        arrayBuffers: afterMemory.arrayBuffers - beforeMemory.arrayBuffers
      },
      beforeMemory,
      afterMemory
    };
  },

  /**
   * Measure both time and memory together
   */
  async measurePerformance(fn, iterations = 1) {
    const measurements = [];

    for (let i = 0; i < iterations; i++) {
      if (global.gc) {
        global.gc();
      }

      const beforeMemory = process.memoryUsage();
      const start = performance.now();

      const result = await fn();

      const end = performance.now();
      const afterMemory = process.memoryUsage();

      measurements.push({
        duration: end - start,
        memoryDelta: afterMemory.heapUsed - beforeMemory.heapUsed,
        result
      });
    }

    return {
      measurements,
      averageDuration: measurements.reduce((a, b) => a + b.duration, 0) / measurements.length,
      averageMemoryDelta: measurements.reduce((a, b) => a + b.memoryDelta, 0) / measurements.length,
      totalMemoryPeak: Math.max(...measurements.map(m => m.memoryDelta))
    };
  },

  /**
   * Load testing utility
   */
  async loadTest(fn, config = {}) {
    const {
      concurrency = 10,
      duration = 10000,
      rampUpTime = 1000
    } = config;

    const results = {
      completedOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      responseTimes: [],
      errors: []
    };

    const startTime = Date.now();
    const endTime = startTime + duration;
    const workers = [];

    // Ramp up workers gradually
    for (let i = 0; i < concurrency; i++) {
      setTimeout(() => {
        workers.push(this.createWorker(fn, endTime, results));
      }, (i / concurrency) * rampUpTime);
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    // Calculate final statistics
    results.averageResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;

    return results;
  },

  /**
   * Create a worker for load testing
   */
  async createWorker(fn, endTime, results) {
    while (Date.now() < endTime) {
      try {
        const start = performance.now();
        await fn();
        const duration = performance.now() - start;

        results.completedOperations++;
        results.responseTimes.push(duration);
        results.minResponseTime = Math.min(results.minResponseTime, duration);
        results.maxResponseTime = Math.max(results.maxResponseTime, duration);
      } catch (error) {
        results.failedOperations++;
        results.errors.push(error.message);
      }
    }
  },

  /**
   * Stress test utility
   */
  async stressTest(fn, config = {}) {
    const {
      maxConcurrency = 100,
      stepSize = 10,
      stepDuration = 5000,
      failureThreshold = 0.05 // 5% failure rate
    } = config;

    const results = [];

    for (let concurrency = stepSize; concurrency <= maxConcurrency; concurrency += stepSize) {
      console.log(`Stress testing with ${concurrency} concurrent operations...`);

      const stepResult = await this.loadTest(fn, {
        concurrency,
        duration: stepDuration
      });

      stepResult.concurrency = concurrency;
      stepResult.failureRate = stepResult.failedOperations / (stepResult.completedOperations + stepResult.failedOperations);

      results.push(stepResult);

      // Stop if failure rate exceeds threshold
      if (stepResult.failureRate > failureThreshold) {
        console.log(`Stress test stopped at ${concurrency} concurrency due to high failure rate: ${stepResult.failureRate}`);
        break;
      }
    }

    return results;
  },

  /**
   * Calculate median of array
   */
  calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
      return sorted[middle];
    }
  },

  /**
   * Calculate standard deviation
   */
  calculateStandardDeviation(numbers) {
    const average = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDifferences = numbers.map(num => Math.pow(num - average, 2));
    const averageSquaredDifference = squaredDifferences.reduce((a, b) => a + b, 0) / squaredDifferences.length;
    return Math.sqrt(averageSquaredDifference);
  },

  /**
   * Create performance baseline
   */
  async createBaseline(testSuite) {
    const baseline = {};

    for (const [testName, testFn] of Object.entries(testSuite)) {
      console.log(`Creating baseline for ${testName}...`);
      const measurement = await this.measurePerformance(testFn, 5);
      baseline[testName] = {
        averageDuration: measurement.averageDuration,
        averageMemoryDelta: measurement.averageMemoryDelta,
        timestamp: Date.now()
      };
    }

    return baseline;
  },

  /**
   * Compare performance against baseline
   */
  compareToBaseline(current, baseline, tolerance = 0.1) {
    const comparison = {
      passed: true,
      results: {}
    };

    for (const [testName, currentResult] of Object.entries(current)) {
      const baselineResult = baseline[testName];
      if (!baselineResult) {
        comparison.results[testName] = {
          status: 'no-baseline',
          message: 'No baseline data available'
        };
        continue;
      }

      const durationRatio = currentResult.averageDuration / baselineResult.averageDuration;
      const memoryRatio = Math.abs(currentResult.averageMemoryDelta) / Math.abs(baselineResult.averageMemoryDelta);

      const passed = durationRatio <= (1 + tolerance) && memoryRatio <= (1 + tolerance);

      comparison.results[testName] = {
        status: passed ? 'passed' : 'failed',
        durationRatio,
        memoryRatio,
        durationIncrease: ((durationRatio - 1) * 100).toFixed(2) + '%',
        memoryIncrease: ((memoryRatio - 1) * 100).toFixed(2) + '%'
      };

      if (!passed) {
        comparison.passed = false;
      }
    }

    return comparison;
  }
};

// Performance test fixtures
global.performanceFixtures = {
  /**
   * Generate large configuration for testing
   */
  generateLargeConfig(serverCount) {
    const servers = {};
    for (let i = 0; i < serverCount; i++) {
      servers[`test-server-${i}`] = {
        command: 'node',
        args: [`server-${i}.js`, '--port', `${3000 + i}`],
        env: {
          NODE_ENV: 'production',
          PORT: `${3000 + i}`,
          SERVER_ID: `server-${i}`,
          LOG_LEVEL: 'info'
        }
      };
    }
    return { mcpServers: servers };
  },

  /**
   * Generate deeply nested configuration
   */
  generateDeepConfig(depth) {
    const createLevel = (currentDepth) => {
      if (currentDepth >= depth) {
        return { value: `leaf-${currentDepth}` };
      }
      return {
        [`level-${currentDepth}`]: createLevel(currentDepth + 1),
        [`array-${currentDepth}`]: new Array(10).fill(null).map((_, i) => ({
          index: i,
          data: `data-${currentDepth}-${i}`
        }))
      };
    };

    return {
      mcpServers: {
        'deep-config-test': {
          command: 'node',
          args: ['server.js'],
          env: {},
          config: createLevel(0)
        }
      }
    };
  },

  /**
   * Generate configuration with many file paths
   */
  generateManyPathsConfig(pathCount) {
    const servers = {};
    for (let i = 0; i < pathCount; i++) {
      servers[`path-server-${i}`] = {
        command: 'node',
        args: [`/very/long/path/to/server/directory/level${i}/server-${i}.js`],
        env: {
          CONFIG_PATH: `/very/long/path/to/config/directory/level${i}/config-${i}.json`,
          LOG_PATH: `/very/long/path/to/logs/directory/level${i}/app-${i}.log`,
          DATA_PATH: `/very/long/path/to/data/directory/level${i}/data-${i}.db`
        }
      };
    }
    return { mcpServers: servers };
  }
};

// Performance assertions
global.expectPerformance = {
  /**
   * Expect operation to complete within time limit
   */
  async toCompleteWithin(fn, timeLimit) {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(timeLimit);
    return duration;
  },

  /**
   * Expect memory usage to stay within limit
   */
  async toUseMemoryWithin(fn, memoryLimit) {
    const measurement = await global.performanceUtils.measureMemoryUsage(fn);
    expect(Math.abs(measurement.memoryDelta.heapUsed)).toBeLessThan(memoryLimit);
    return measurement;
  },

  /**
   * Expect performance to be stable across iterations
   */
  async toBeStable(fn, iterations = 10, varianceThreshold = 0.1) {
    const measurement = await global.performanceUtils.measureExecutionTime(fn, iterations);
    const coefficientOfVariation = measurement.standardDeviation / measurement.average;

    expect(coefficientOfVariation).toBeLessThan(varianceThreshold);
    return measurement;
  }
};

// Performance benchmarks
global.performanceBenchmarks = {
  /**
   * Standard benchmark suite for MCP operations
   */
  mcpOperations: {
    async smallConfigRead() {
      const { McpConfigurationManager } = await import('../../../src/mcp/mcp-config-manager.js');
      const manager = new McpConfigurationManager({ verbose: false, dryRun: true });

      await global.testUtils.createMockProjectConfig();
      return await manager.readProjectConfig();
    },

    async largeConfigRead() {
      const { McpConfigurationManager } = await import('../../../src/mcp/mcp-config-manager.js');
      const manager = new McpConfigurationManager({ verbose: false, dryRun: true });

      const largeConfig = global.performanceFixtures.generateLargeConfig(1000);
      await global.testUtils.createMockProjectConfig(largeConfig);
      return await manager.readProjectConfig();
    },

    async configValidation() {
      const { McpConfigurationManager } = await import('../../../src/mcp/mcp-config-manager.js');
      const manager = new McpConfigurationManager({ verbose: false, dryRun: true });

      const config = global.performanceFixtures.generateLargeConfig(100);
      const servers = manager.extractMcpServers(config);
      return await manager.findBrokenServerPaths(servers);
    },

    async stateDetection() {
      const { McpConfigurationManager } = await import('../../../src/mcp/mcp-config-manager.js');
      const manager = new McpConfigurationManager({ verbose: false, dryRun: true });

      await global.testUtils.createMockClaudeConfig();
      await global.testUtils.createMockProjectConfig();
      return await manager.detectConfigurationState();
    }
  }
};

// Setup performance monitoring
beforeEach(() => {
  global.performanceMetrics = {
    startTime: performance.now(),
    startMemory: process.memoryUsage()
  };
});

afterEach(() => {
  const endTime = performance.now();
  const endMemory = process.memoryUsage();

  global.performanceMetrics.duration = endTime - global.performanceMetrics.startTime;
  global.performanceMetrics.memoryDelta = {
    rss: endMemory.rss - global.performanceMetrics.startMemory.rss,
    heapUsed: endMemory.heapUsed - global.performanceMetrics.startMemory.heapUsed
  };

  // Warn about slow tests
  if (global.performanceMetrics.duration > global.PERFORMANCE_CONFIG.timeouts.slow) {
    console.warn(`Slow test detected: ${global.performanceMetrics.duration.toFixed(2)}ms`);
  }

  // Warn about high memory usage
  if (global.performanceMetrics.memoryDelta.heapUsed > global.PERFORMANCE_CONFIG.memory.medium) {
    console.warn(`High memory usage detected: ${(global.performanceMetrics.memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  }
});