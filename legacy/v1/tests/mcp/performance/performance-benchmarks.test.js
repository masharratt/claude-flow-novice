/**
 * Performance Benchmark Tests for MCP Configuration Manager
 * Comprehensive performance testing for scalability and resource usage
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import { execSync } from 'child_process';

import { McpConfigurationManager } from '../../../src/mcp/mcp-config-manager.js';
import { performanceConfigurations } from '../fixtures/config-samples.js';

// Extended timeout for performance tests
const PERFORMANCE_TIMEOUT = 60000;

describe('MCP Performance Benchmark Tests', () => {
  let manager;
  let performanceBaseline;

  beforeEach(async () => {
    manager = new McpConfigurationManager({
      verbose: false,
      autoFix: true,
      dryRun: true // Dry run for consistent timing
    });

    // Setup test files
    await global.testUtils.createMockClaudeConfig();
    await global.testUtils.createMockProjectConfig();
  });

  afterEach(() => {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Configuration Reading Performance', () => {
    test('should read small configurations quickly', async () => {
      const smallConfig = performanceConfigurations.manyServers(10);
      await global.testUtils.createMockProjectConfig(smallConfig);

      await global.expectPerformance.toCompleteWithin(
        () => manager.readProjectConfig(),
        global.PERFORMANCE_CONFIG.timeouts.fast
      );
    }, PERFORMANCE_TIMEOUT);

    test('should handle medium configurations within reasonable time', async () => {
      const mediumConfig = performanceConfigurations.manyServers(100);
      await global.testUtils.createMockProjectConfig(mediumConfig);

      await global.expectPerformance.toCompleteWithin(
        () => manager.readProjectConfig(),
        global.PERFORMANCE_CONFIG.timeouts.medium
      );
    }, PERFORMANCE_TIMEOUT);

    test('should handle large configurations efficiently', async () => {
      const largeConfig = performanceConfigurations.manyServers(1000);
      await global.testUtils.createMockProjectConfig(largeConfig);

      const measurement = await global.performanceUtils.measurePerformance(
        () => manager.readProjectConfig()
      );

      expect(measurement.averageDuration).toBeLessThan(global.PERFORMANCE_CONFIG.timeouts.slow);
      expect(measurement.averageMemoryDelta).toBeLessThan(global.PERFORMANCE_CONFIG.memory.medium);
    }, PERFORMANCE_TIMEOUT);

    test('should handle extremely large configurations without crashing', async () => {
      const extremeConfig = performanceConfigurations.manyServers(10000);
      await global.testUtils.createMockProjectConfig(extremeConfig);

      const measurement = await global.performanceUtils.measureMemoryUsage(
        () => manager.readProjectConfig()
      );

      expect(measurement.result).toBeTruthy();
      expect(measurement.memoryDelta.heapUsed).toBeLessThan(global.PERFORMANCE_CONFIG.memory.large);
    }, PERFORMANCE_TIMEOUT);

    test('should show consistent performance across multiple reads', async () => {
      const config = performanceConfigurations.manyServers(500);
      await global.testUtils.createMockProjectConfig(config);

      await global.expectPerformance.toBeStable(
        () => manager.readProjectConfig(),
        10,
        0.1 // 10% variance threshold
      );
    }, PERFORMANCE_TIMEOUT);
  });

  describe('Configuration Validation Performance', () => {
    test('should validate server paths efficiently', async () => {
      const servers = [];
      for (let i = 0; i < 1000; i++) {
        servers.push({
          name: `server-${i}`,
          command: 'node',
          args: [`server-${i}.js`]
        });
      }

      await global.expectPerformance.toCompleteWithin(
        () => manager.findBrokenServerPaths(servers),
        global.PERFORMANCE_CONFIG.timeouts.slow
      );
    }, PERFORMANCE_TIMEOUT);

    test('should handle deep configuration structures', async () => {
      const deepConfig = performanceConfigurations.deeplyNested(20);
      await global.testUtils.createMockProjectConfig(deepConfig);

      const measurement = await global.performanceUtils.measurePerformance(
        () => manager.readProjectConfig()
      );

      expect(measurement.averageDuration).toBeLessThan(global.PERFORMANCE_CONFIG.timeouts.slow);
    }, PERFORMANCE_TIMEOUT);

    test('should process configurations with many file paths efficiently', async () => {
      const pathConfig = performanceConfigurations.manyServers(100);
      await global.testUtils.createMockProjectConfig(pathConfig);

      const servers = manager.extractMcpServers(pathConfig);

      await global.expectPerformance.toCompleteWithin(
        () => manager.findBrokenServerPaths(servers),
        global.PERFORMANCE_CONFIG.timeouts.medium
      );
    }, PERFORMANCE_TIMEOUT);

    test('should validate large string content efficiently', async () => {
      const largeStringConfig = performanceConfigurations.largeStrings;
      await global.testUtils.createMockProjectConfig(largeStringConfig);

      const measurement = await global.performanceUtils.measurePerformance(
        () => manager.detectConfigurationState()
      );

      expect(measurement.averageDuration).toBeLessThan(global.PERFORMANCE_CONFIG.timeouts.slow);
    }, PERFORMANCE_TIMEOUT);
  });

  describe('State Detection Performance', () => {
    test('should detect configuration state quickly for small setups', async () => {
      await global.expectPerformance.toCompleteWithin(
        () => manager.detectConfigurationState(),
        global.PERFORMANCE_CONFIG.timeouts.medium
      );
    }, PERFORMANCE_TIMEOUT);

    test('should scale linearly with configuration size', async () => {
      const sizes = [10, 50, 100, 200];
      const measurements = [];

      for (const size of sizes) {
        const config = performanceConfigurations.manyServers(size);
        await global.testUtils.createMockProjectConfig(config);

        const measurement = await global.performanceUtils.measureExecutionTime(
          () => manager.detectConfigurationState()
        );

        measurements.push({
          size,
          duration: measurement.average
        });
      }

      // Check that performance scales reasonably
      for (let i = 1; i < measurements.length; i++) {
        const prev = measurements[i - 1];
        const curr = measurements[i];
        const scaleFactor = curr.size / prev.size;
        const performanceRatio = curr.duration / prev.duration;

        // Performance should not degrade more than 2x the scale factor
        expect(performanceRatio).toBeLessThan(scaleFactor * 2);
      }
    }, PERFORMANCE_TIMEOUT);

    test('should maintain performance with many broken servers', async () => {
      const brokenConfig = {
        mcpServers: {}
      };

      // Add many broken servers
      for (let i = 0; i < 500; i++) {
        brokenConfig.mcpServers[`broken-${i}`] = {
          command: 'non-existent-command',
          args: [`/non/existent/path-${i}/server.js`]
        };
      }

      await global.testUtils.createMockProjectConfig(brokenConfig);

      await global.expectPerformance.toCompleteWithin(
        () => manager.detectConfigurationState(),
        global.PERFORMANCE_CONFIG.timeouts.slow
      );
    }, PERFORMANCE_TIMEOUT);
  });

  describe('Memory Usage Optimization', () => {
    test('should not leak memory during repeated operations', async () => {
      const config = performanceConfigurations.manyServers(100);
      await global.testUtils.createMockProjectConfig(config);

      const iterations = 50;
      const memorySnapshots = [];

      for (let i = 0; i < iterations; i++) {
        await manager.detectConfigurationState();

        if (global.gc) {
          global.gc();
        }

        memorySnapshots.push(process.memoryUsage().heapUsed);
      }

      // Memory should not grow significantly over iterations
      const initialMemory = memorySnapshots[0];
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = finalMemory - initialMemory;

      expect(memoryGrowth).toBeLessThan(global.PERFORMANCE_CONFIG.memory.small);
    }, PERFORMANCE_TIMEOUT);

    test('should handle large configurations with bounded memory usage', async () => {
      const largeConfig = performanceConfigurations.manyServers(5000);
      await global.testUtils.createMockProjectConfig(largeConfig);

      const measurement = await global.performanceUtils.measureMemoryUsage(
        () => manager.readProjectConfig()
      );

      expect(measurement.memoryDelta.heapUsed).toBeLessThan(global.PERFORMANCE_CONFIG.memory.large);
    }, PERFORMANCE_TIMEOUT);

    test('should release memory after configuration processing', async () => {
      const beforeMemory = process.memoryUsage().heapUsed;

      const largeConfig = performanceConfigurations.manyServers(1000);
      await global.testUtils.createMockProjectConfig(largeConfig);

      await manager.detectConfigurationState();

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      const afterMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = afterMemory - beforeMemory;

      // Memory increase should be minimal after GC
      expect(memoryIncrease).toBeLessThan(global.PERFORMANCE_CONFIG.memory.small);
    }, PERFORMANCE_TIMEOUT);
  });

  describe('Concurrent Operation Performance', () => {
    test('should handle concurrent state detection requests', async () => {
      const concurrency = 10;
      const promises = [];

      for (let i = 0; i < concurrency; i++) {
        promises.push(manager.detectConfigurationState());
      }

      const start = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      expect(results).toHaveLength(concurrency);
      expect(duration).toBeLessThan(global.PERFORMANCE_CONFIG.timeouts.slow);

      // All results should be consistent
      const firstResult = results[0];
      results.forEach(result => {
        expect(result.healthScore).toBe(firstResult.healthScore);
      });
    }, PERFORMANCE_TIMEOUT);

    test('should handle concurrent file operations safely', async () => {
      const config = performanceConfigurations.manyServers(50);
      const concurrency = 20;
      const promises = [];

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          global.testUtils.createMockProjectConfig(config)
            .then(() => manager.readProjectConfig())
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(concurrency);
      results.forEach(result => {
        expect(result).toBeTruthy();
        expect(result.mcpServers).toBeTruthy();
      });
    }, PERFORMANCE_TIMEOUT);
  });

  describe('Load Testing', () => {
    test('should maintain performance under continuous load', async () => {
      const config = performanceConfigurations.manyServers(100);
      await global.testUtils.createMockProjectConfig(config);

      const loadTest = await global.performanceUtils.loadTest(
        () => manager.detectConfigurationState(),
        {
          concurrency: 5,
          duration: 10000, // 10 seconds
          rampUpTime: 1000
        }
      );

      expect(loadTest.failedOperations).toBe(0);
      expect(loadTest.averageResponseTime).toBeLessThan(global.PERFORMANCE_CONFIG.timeouts.medium);
      expect(loadTest.maxResponseTime).toBeLessThan(global.PERFORMANCE_CONFIG.timeouts.slow);
    }, PERFORMANCE_TIMEOUT);

    test('should handle stress testing gracefully', async () => {
      const config = performanceConfigurations.manyServers(50);
      await global.testUtils.createMockProjectConfig(config);

      const stressTest = await global.performanceUtils.stressTest(
        () => manager.readProjectConfig(),
        {
          maxConcurrency: 50,
          stepSize: 10,
          stepDuration: 3000,
          failureThreshold: 0.1 // 10% failure rate
        }
      );

      expect(stressTest.length).toBeGreaterThan(0);

      // Should handle at least some level of concurrency
      const successfulSteps = stressTest.filter(step => step.failureRate <= 0.1);
      expect(successfulSteps.length).toBeGreaterThan(0);
    }, PERFORMANCE_TIMEOUT);
  });

  describe('File System Performance', () => {
    test('should optimize file I/O operations', async () => {
      const config = performanceConfigurations.manyServers(100);

      const measurement = await global.performanceUtils.measureExecutionTime(
        async () => {
          await global.testUtils.createMockProjectConfig(config);
          return await manager.readProjectConfig();
        }
      );

      expect(measurement.average).toBeLessThan(global.PERFORMANCE_CONFIG.timeouts.medium);
    }, PERFORMANCE_TIMEOUT);

    test('should handle multiple file operations efficiently', async () => {
      const operations = [];

      for (let i = 0; i < 100; i++) {
        operations.push(async () => {
          const tempConfig = performanceConfigurations.manyServers(10);
          await global.testUtils.createMockProjectConfig(tempConfig);
          return await manager.readProjectConfig();
        });
      }

      const measurement = await global.performanceUtils.measureExecutionTime(
        async () => {
          const promises = operations.map(op => op());
          return await Promise.all(promises);
        }
      );

      expect(measurement.average).toBeLessThan(global.PERFORMANCE_CONFIG.timeouts.slow);
    }, PERFORMANCE_TIMEOUT);
  });

  describe('Performance Regression Detection', () => {
    test('should establish performance baseline', async () => {
      const baseline = await global.performanceUtils.createBaseline(
        global.performanceBenchmarks.mcpOperations
      );

      expect(baseline).toBeTruthy();
      expect(baseline.smallConfigRead).toBeTruthy();
      expect(baseline.largeConfigRead).toBeTruthy();
      expect(baseline.configValidation).toBeTruthy();
      expect(baseline.stateDetection).toBeTruthy();

      // Store baseline for future comparisons
      performanceBaseline = baseline;
    }, PERFORMANCE_TIMEOUT);

    test('should detect performance regressions', async () => {
      if (!performanceBaseline) {
        console.log('No baseline available, creating one...');
        performanceBaseline = await global.performanceUtils.createBaseline(
          global.performanceBenchmarks.mcpOperations
        );
      }

      const currentResults = await global.performanceUtils.createBaseline(
        global.performanceBenchmarks.mcpOperations
      );

      const comparison = global.performanceUtils.compareToBaseline(
        currentResults,
        performanceBaseline,
        0.2 // 20% tolerance
      );

      expect(comparison.passed).toBe(true);

      // Log performance comparison
      console.log('Performance Comparison Results:');
      Object.entries(comparison.results).forEach(([testName, result]) => {
        console.log(`  ${testName}: ${result.status} (${result.durationIncrease} slower, ${result.memoryIncrease} more memory)`);
      });
    }, PERFORMANCE_TIMEOUT);
  });

  describe('Resource Monitoring', () => {
    test('should monitor CPU usage during operations', async () => {
      const config = performanceConfigurations.manyServers(500);
      await global.testUtils.createMockProjectConfig(config);

      const startCpuUsage = process.cpuUsage();
      await manager.detectConfigurationState();
      const endCpuUsage = process.cpuUsage(startCpuUsage);

      // CPU usage should be reasonable
      const totalCpuTime = endCpuUsage.user + endCpuUsage.system;
      expect(totalCpuTime).toBeLessThan(5000000); // 5 seconds in microseconds
    }, PERFORMANCE_TIMEOUT);

    test('should monitor peak memory usage', async () => {
      const config = performanceConfigurations.manyServers(1000);
      await global.testUtils.createMockProjectConfig(config);

      let peakMemory = 0;
      const memoryMonitor = setInterval(() => {
        const currentMemory = process.memoryUsage().heapUsed;
        peakMemory = Math.max(peakMemory, currentMemory);
      }, 10);

      try {
        await manager.detectConfigurationState();
      } finally {
        clearInterval(memoryMonitor);
      }

      expect(peakMemory).toBeLessThan(global.PERFORMANCE_CONFIG.memory.large);
    }, PERFORMANCE_TIMEOUT);

    test('should track operation timing breakdown', async () => {
      const config = performanceConfigurations.manyServers(200);
      await global.testUtils.createMockProjectConfig(config);

      const timings = {};

      // Override key methods to measure timing
      const originalReadProjectConfig = manager.readProjectConfig;
      manager.readProjectConfig = async function() {
        const start = Date.now();
        const result = await originalReadProjectConfig.call(this);
        timings.readConfig = Date.now() - start;
        return result;
      };

      const originalFindBrokenServerPaths = manager.findBrokenServerPaths;
      manager.findBrokenServerPaths = async function(servers) {
        const start = Date.now();
        const result = await originalFindBrokenServerPaths.call(this, servers);
        timings.findBrokenPaths = Date.now() - start;
        return result;
      };

      await manager.detectConfigurationState();

      expect(timings.readConfig).toBeTruthy();
      expect(timings.findBrokenPaths).toBeTruthy();

      console.log('Operation timing breakdown:', timings);
    }, PERFORMANCE_TIMEOUT);
  });
});