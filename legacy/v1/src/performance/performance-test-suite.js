/**
 * Performance Test Suite for Hook System Optimization
 *
 * Comprehensive test suite to validate the <100ms execution time requirement
 * and verify 95% hook compatibility rate
 */

import { performance } from 'perf_hooks';
import { SqliteMemoryStore } from '../memory/sqlite-store.js';
import { OptimizedHookSystem } from './optimized-hook-system.js';
import { HookPerformanceMonitor } from './hook-performance-monitor.js';

/**
 * Performance Test Suite
 */
class PerformanceTestSuite {
  constructor() {
    this.testResults = [];
    this.memoryStore = null;
    this.hookSystem = null;
    this.performanceMonitor = null;
  }

  async initialize() {
    console.log('🔬 Initializing Performance Test Suite...');

    // Initialize memory store
    this.memoryStore = new SqliteMemoryStore({
      dbName: 'test-performance.db',
      directory: './.swarm-test',
    });

    // Initialize optimized hook system
    this.hookSystem = new OptimizedHookSystem(this.memoryStore);
    await this.hookSystem.initialize();

    // Initialize performance monitor
    this.performanceMonitor = new HookPerformanceMonitor();
    this.performanceMonitor.startMonitoring();

    console.log('✅ Performance Test Suite initialized');
  }

  /**
   * Run complete performance test suite
   */
  async runCompleteTestSuite() {
    console.log('\n🚀 Running Complete Performance Test Suite...\n');

    const suiteStart = performance.now();

    try {
      // Test 1: Single hook execution performance
      await this.testSingleHookPerformance();

      // Test 2: Concurrent hook execution
      await this.testConcurrentHookExecution();

      // Test 3: Memory persistence performance
      await this.testMemoryPersistencePerformance();

      // Test 4: Hook compatibility testing
      await this.testHookCompatibility();

      // Test 5: Load testing
      await this.testLoadPerformance();

      // Test 6: Stress testing
      await this.testStressPerformance();

      // Test 7: Memory efficiency testing
      await this.testMemoryEfficiency();

      // Test 8: Cache performance testing
      await this.testCachePerformance();
    } catch (error) {
      console.error('❌ Test suite execution failed:', error);
      throw error;
    } finally {
      const suiteTime = performance.now() - suiteStart;
      console.log(`\n⏱️  Total test suite execution time: ${suiteTime.toFixed(2)}ms`);
    }

    return this.generateTestReport();
  }

  /**
   * Test single hook execution performance
   */
  async testSingleHookPerformance() {
    console.log('📊 Testing Single Hook Execution Performance...');

    const hookTypes = [
      'pre-task',
      'post-task',
      'pre-edit',
      'post-edit',
      'pre-bash',
      'post-bash',
      'session-end',
      'notify',
    ];

    const results = {
      testName: 'Single Hook Performance',
      hookResults: {},
      overallPass: true,
      averageTime: 0,
      maxTime: 0,
    };

    let totalTime = 0;
    let executionCount = 0;

    for (const hookType of hookTypes) {
      const hookResults = [];

      // Test each hook type 10 times
      for (let i = 0; i < 10; i++) {
        const start = performance.now();

        try {
          await this.hookSystem.executeHook(hookType, {
            taskId: `test-${i}`,
            file: 'test-file.js',
            command: 'test command',
            description: `Test execution ${i}`,
          });

          const executionTime = performance.now() - start;
          hookResults.push({
            execution: i + 1,
            time: executionTime,
            success: true,
          });

          this.performanceMonitor.recordExecution(hookType, executionTime, true);

          totalTime += executionTime;
          executionCount++;
        } catch (error) {
          const executionTime = performance.now() - start;
          hookResults.push({
            execution: i + 1,
            time: executionTime,
            success: false,
            error: error.message,
          });

          this.performanceMonitor.recordExecution(hookType, executionTime, false);
          results.overallPass = false;
        }
      }

      // Calculate hook-specific metrics
      const successfulExecutions = hookResults.filter((r) => r.success);
      const hookAverage =
        successfulExecutions.length > 0
          ? successfulExecutions.reduce((sum, r) => sum + r.time, 0) / successfulExecutions.length
          : Infinity;
      const hookMax = Math.max(...hookResults.map((r) => r.time));

      results.hookResults[hookType] = {
        executions: hookResults,
        averageTime: hookAverage,
        maxTime: hookMax,
        successRate: successfulExecutions.length / hookResults.length,
        meetsTarget: hookAverage < 100,
      };

      // Check if hook meets performance target
      if (hookAverage >= 100) {
        console.error(
          `❌ FAILED: ${hookType} average time ${hookAverage.toFixed(2)}ms exceeds 100ms target`,
        );
        results.overallPass = false;
      } else {
        console.log(`✅ PASSED: ${hookType} average time ${hookAverage.toFixed(2)}ms`);
      }

      results.maxTime = Math.max(results.maxTime, hookMax);
    }

    results.averageTime = totalTime / executionCount;

    console.log(`📈 Overall single hook performance: ${results.averageTime.toFixed(2)}ms average`);
    if (results.overallPass) {
      console.log('✅ Single hook performance test PASSED');
    } else {
      console.error('❌ Single hook performance test FAILED');
    }

    this.testResults.push(results);
    return results;
  }

  /**
   * Test concurrent hook execution performance
   */
  async testConcurrentHookExecution() {
    console.log('⚡ Testing Concurrent Hook Execution...');

    const concurrencyLevels = [5, 10, 20];
    const results = {
      testName: 'Concurrent Hook Execution',
      concurrencyResults: {},
      overallPass: true,
    };

    for (const concurrency of concurrencyLevels) {
      console.log(`Testing with ${concurrency} concurrent executions...`);

      const start = performance.now();
      const promises = [];

      for (let i = 0; i < concurrency; i++) {
        const hookType = ['pre-task', 'post-task', 'pre-edit', 'post-edit'][i % 4];
        promises.push(
          this.hookSystem
            .executeHook(hookType, {
              taskId: `concurrent-${i}`,
              executionIndex: i,
            })
            .catch((error) => ({ error: error.message, executionIndex: i })),
        );
      }

      const concurrentResults = await Promise.all(promises);
      const totalTime = performance.now() - start;
      const averageTime = totalTime / concurrency;

      const failures = concurrentResults.filter((r) => r.error);

      results.concurrencyResults[concurrency] = {
        totalTime,
        averageTimePerExecution: averageTime,
        failures: failures.length,
        successRate: (concurrency - failures.length) / concurrency,
        meetsTarget: averageTime < 100,
      };

      if (averageTime >= 100) {
        console.error(
          `❌ FAILED: ${concurrency} concurrent executions averaged ${averageTime.toFixed(2)}ms`,
        );
        results.overallPass = false;
      } else {
        console.log(
          `✅ PASSED: ${concurrency} concurrent executions averaged ${averageTime.toFixed(2)}ms`,
        );
      }
    }

    console.log(
      results.overallPass
        ? '✅ Concurrent execution test PASSED'
        : '❌ Concurrent execution test FAILED',
    );
    this.testResults.push(results);
    return results;
  }

  /**
   * Test memory persistence performance
   */
  async testMemoryPersistencePerformance() {
    console.log('💾 Testing Memory Persistence Performance...');

    const results = {
      testName: 'Memory Persistence Performance',
      operations: {},
      overallPass: true,
    };

    const operations = [
      { op: 'store', iterations: 100 },
      { op: 'retrieve', iterations: 100 },
      { op: 'list', iterations: 50 },
      { op: 'search', iterations: 30 },
    ];

    for (const { op, iterations } of operations) {
      console.log(`Testing ${op} operation (${iterations} iterations)...`);

      const operationTimes = [];
      let failures = 0;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        try {
          switch (op) {
            case 'store':
              await this.memoryStore.store(`test-key-${i}`, { data: `test-data-${i}` });
              break;
            case 'retrieve':
              await this.memoryStore.retrieve(`test-key-${i % 50}`); // Retrieve from stored keys
              break;
            case 'list':
              await this.memoryStore.list({ limit: 20 });
              break;
            case 'search':
              await this.memoryStore.search(`test-data-${i % 10}`);
              break;
          }

          const operationTime = performance.now() - start;
          operationTimes.push(operationTime);

          this.performanceMonitor.recordMemoryOperation(op, operationTime, true);
        } catch (error) {
          const operationTime = performance.now() - start;
          operationTimes.push(operationTime);
          failures++;

          this.performanceMonitor.recordMemoryOperation(op, operationTime, false);
          console.error(`Memory ${op} operation failed:`, error.message);
        }
      }

      const averageTime =
        operationTimes.reduce((sum, time) => sum + time, 0) / operationTimes.length;
      const maxTime = Math.max(...operationTimes);

      results.operations[op] = {
        averageTime,
        maxTime,
        failures,
        successRate: (iterations - failures) / iterations,
        meetsTarget: averageTime < 20, // Memory operations should be faster
      };

      if (averageTime >= 20) {
        console.error(`❌ FAILED: ${op} averaged ${averageTime.toFixed(2)}ms (target: <20ms)`);
        results.overallPass = false;
      } else {
        console.log(`✅ PASSED: ${op} averaged ${averageTime.toFixed(2)}ms`);
      }
    }

    console.log(
      results.overallPass
        ? '✅ Memory persistence test PASSED'
        : '❌ Memory persistence test FAILED',
    );
    this.testResults.push(results);
    return results;
  }

  /**
   * Test hook compatibility
   */
  async testHookCompatibility() {
    console.log('🔧 Testing Hook Compatibility...');

    const testScenarios = [
      { hookType: 'pre-task', context: { description: 'Test task' } },
      { hookType: 'pre-task', context: { taskId: 'custom-123', agentId: 'test-agent' } },
      { hookType: 'post-edit', context: { file: 'test.js', memoryKey: 'edit-test' } },
      { hookType: 'post-edit', context: { file: 'test.py', format: true, trainNeural: true } },
      { hookType: 'pre-bash', context: { command: 'ls -la', validateSafety: true } },
      { hookType: 'session-end', context: { generateSummary: true, exportMetrics: true } },
      // Edge cases
      { hookType: 'unknown-hook', context: {} },
      { hookType: 'pre-task', context: null },
      { hookType: 'post-edit', context: { file: '' } },
    ];

    const results = {
      testName: 'Hook Compatibility',
      totalScenarios: testScenarios.length,
      successfulExecutions: 0,
      failedExecutions: 0,
      compatibilityRate: 0,
      scenarios: [],
      overallPass: false,
    };

    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      const start = performance.now();

      try {
        const result = await this.hookSystem.executeHook(scenario.hookType, scenario.context);
        const executionTime = performance.now() - start;

        results.scenarios.push({
          scenario: i + 1,
          hookType: scenario.hookType,
          success: true,
          executionTime,
        });

        results.successfulExecutions++;
      } catch (error) {
        const executionTime = performance.now() - start;

        results.scenarios.push({
          scenario: i + 1,
          hookType: scenario.hookType,
          success: false,
          executionTime,
          error: error.message,
        });

        results.failedExecutions++;
      }
    }

    results.compatibilityRate = results.successfulExecutions / results.totalScenarios;
    results.overallPass = results.compatibilityRate >= 0.95;

    console.log(
      `📊 Compatibility rate: ${(results.compatibilityRate * 100).toFixed(1)}% (${results.successfulExecutions}/${results.totalScenarios})`,
    );

    if (results.overallPass) {
      console.log('✅ Hook compatibility test PASSED (≥95% compatibility)');
    } else {
      console.error('❌ Hook compatibility test FAILED (<95% compatibility)');
    }

    this.testResults.push(results);
    return results;
  }

  /**
   * Test load performance
   */
  async testLoadPerformance() {
    console.log('📊 Testing Load Performance...');

    const loadTests = [
      { name: 'Light Load', executions: 50, concurrency: 5 },
      { name: 'Medium Load', executions: 200, concurrency: 10 },
      { name: 'Heavy Load', executions: 500, concurrency: 20 },
    ];

    const results = {
      testName: 'Load Performance',
      loadTests: {},
      overallPass: true,
    };

    for (const test of loadTests) {
      console.log(
        `Running ${test.name}: ${test.executions} executions, ${test.concurrency} concurrent...`,
      );

      const testStart = performance.now();
      const batchSize = Math.ceil(test.executions / test.concurrency);
      const batches = [];

      for (let batch = 0; batch < test.concurrency; batch++) {
        const batchPromises = [];

        for (let i = 0; i < batchSize && batch * batchSize + i < test.executions; i++) {
          const executionIndex = batch * batchSize + i;
          const hookType = ['pre-task', 'post-task', 'pre-edit', 'post-edit'][executionIndex % 4];

          batchPromises.push(
            this.hookSystem
              .executeHook(hookType, {
                taskId: `load-test-${executionIndex}`,
                loadTest: test.name,
              })
              .catch((error) => ({ error: error.message })),
          );
        }

        batches.push(Promise.all(batchPromises));
      }

      const batchResults = await Promise.all(batches);
      const totalTime = performance.now() - testStart;

      const allResults = batchResults.flat();
      const failures = allResults.filter((r) => r.error).length;
      const avgExecutionTime = totalTime / test.executions;

      results.loadTests[test.name] = {
        totalExecutions: test.executions,
        totalTime,
        averageExecutionTime: avgExecutionTime,
        failures,
        successRate: (test.executions - failures) / test.executions,
        throughput: test.executions / (totalTime / 1000), // executions per second
        meetsTarget: avgExecutionTime < 100,
      };

      if (avgExecutionTime >= 100) {
        console.error(
          `❌ FAILED: ${test.name} averaged ${avgExecutionTime.toFixed(2)}ms per execution`,
        );
        results.overallPass = false;
      } else {
        console.log(
          `✅ PASSED: ${test.name} averaged ${avgExecutionTime.toFixed(2)}ms per execution`,
        );
      }
    }

    console.log(
      results.overallPass ? '✅ Load performance test PASSED' : '❌ Load performance test FAILED',
    );
    this.testResults.push(results);
    return results;
  }

  /**
   * Test stress performance
   */
  async testStressPerformance() {
    console.log('💪 Testing Stress Performance...');

    const results = {
      testName: 'Stress Performance',
      memoryUsageBefore: process.memoryUsage(),
      memoryUsageAfter: null,
      maxConcurrentExecutions: 0,
      overallPass: true,
    };

    // Gradually increase concurrent executions until system becomes stressed
    let concurrency = 10;
    let stressDetected = false;

    while (concurrency <= 100 && !stressDetected) {
      console.log(`Testing stress with ${concurrency} concurrent executions...`);

      const start = performance.now();
      const promises = [];

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          this.hookSystem
            .executeHook('pre-task', {
              taskId: `stress-${i}`,
              stressTest: true,
            })
            .catch((error) => ({ error: error.message })),
        );
      }

      const stressResults = await Promise.all(promises);
      const totalTime = performance.now() - start;
      const avgTime = totalTime / concurrency;

      const failures = stressResults.filter((r) => r.error).length;
      const failureRate = failures / concurrency;

      console.log(
        `Concurrency ${concurrency}: ${avgTime.toFixed(2)}ms avg, ${failureRate.toFixed(2)} failure rate`,
      );

      // Detect stress conditions
      if (avgTime > 150 || failureRate > 0.1) {
        stressDetected = true;
        console.log(`⚠️  Stress detected at ${concurrency} concurrent executions`);
      } else {
        results.maxConcurrentExecutions = concurrency;
      }

      concurrency += 10;
    }

    results.memoryUsageAfter = process.memoryUsage();
    results.overallPass = results.maxConcurrentExecutions >= 50; // Should handle at least 50 concurrent

    console.log(
      `📊 Maximum concurrent executions before stress: ${results.maxConcurrentExecutions}`,
    );
    console.log(
      results.overallPass
        ? '✅ Stress performance test PASSED'
        : '❌ Stress performance test FAILED',
    );

    this.testResults.push(results);
    return results;
  }

  /**
   * Test memory efficiency
   */
  async testMemoryEfficiency() {
    console.log('🧠 Testing Memory Efficiency...');

    const initialMemory = process.memoryUsage();

    // Perform many operations to test memory usage
    for (let i = 0; i < 1000; i++) {
      await this.hookSystem.executeHook('pre-task', {
        taskId: `memory-test-${i}`,
        data: 'x'.repeat(1000), // 1KB of data per execution
      });
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryPerExecution = memoryIncrease / 1000;

    const results = {
      testName: 'Memory Efficiency',
      initialMemory,
      finalMemory,
      memoryIncrease,
      memoryPerExecution,
      overallPass: memoryPerExecution < 10000, // Less than 10KB per execution
    };

    console.log(
      `📊 Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB for 1000 executions`,
    );
    console.log(`📊 Memory per execution: ${(memoryPerExecution / 1024).toFixed(2)}KB`);

    console.log(
      results.overallPass ? '✅ Memory efficiency test PASSED' : '❌ Memory efficiency test FAILED',
    );

    this.testResults.push(results);
    return results;
  }

  /**
   * Test cache performance
   */
  async testCachePerformance() {
    console.log('⚡ Testing Cache Performance...');

    const results = {
      testName: 'Cache Performance',
      cacheTests: {},
      overallPass: true,
    };

    // Test cache hit performance
    const context = { taskId: 'cache-test', description: 'Cache performance test' };

    // First execution (cache miss)
    const missStart = performance.now();
    await this.hookSystem.executeHook('pre-task', context);
    const missTime = performance.now() - missStart;

    // Second execution (should be cache hit)
    const hitStart = performance.now();
    const hitResult = await this.hookSystem.executeHook('pre-task', context);
    const hitTime = performance.now() - hitStart;

    results.cacheTests = {
      cacheMissTime: missTime,
      cacheHitTime: hitTime,
      speedupRatio: missTime / hitTime,
      cacheWorking: hitResult.fromCache === true,
      meetsTarget: hitTime < 10, // Cache hits should be very fast
    };

    if (!results.cacheTests.cacheWorking) {
      console.error('❌ FAILED: Cache not working properly');
      results.overallPass = false;
    } else if (hitTime >= 10) {
      console.error(`❌ FAILED: Cache hit took ${hitTime.toFixed(2)}ms (target: <10ms)`);
      results.overallPass = false;
    } else {
      console.log(
        `✅ PASSED: Cache hit ${hitTime.toFixed(2)}ms, speedup ${results.cacheTests.speedupRatio.toFixed(1)}x`,
      );
    }

    console.log(
      results.overallPass ? '✅ Cache performance test PASSED' : '❌ Cache performance test FAILED',
    );

    this.testResults.push(results);
    return results;
  }

  /**
   * Generate comprehensive test report
   */
  generateTestReport() {
    console.log('\n📋 Generating Performance Test Report...\n');

    const performanceReport = this.performanceMonitor.generatePerformanceReport();
    const overallPass = this.testResults.every((test) => test.overallPass);

    const report = {
      testSuiteResults: {
        timestamp: new Date().toISOString(),
        overallPass,
        totalTests: this.testResults.length,
        passedTests: this.testResults.filter((test) => test.overallPass).length,
        failedTests: this.testResults.filter((test) => !test.overallPass).length,
      },
      performanceMetrics: performanceReport,
      individualTests: this.testResults,
      recommendations: this._generateTestRecommendations(),
    };

    // Print summary
    console.log('='.repeat(80));
    console.log('🎯 PERFORMANCE TEST SUITE RESULTS');
    console.log('='.repeat(80));

    console.log(`Overall Result: ${overallPass ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(
      `Tests Passed: ${report.testSuiteResults.passedTests}/${report.testSuiteResults.totalTests}`,
    );
    console.log(
      `Average Execution Time: ${performanceReport.summary.averageExecutionTime.toFixed(2)}ms`,
    );
    console.log(`Target Met (<100ms): ${performanceReport.summary.targetMet ? '✅ YES' : '❌ NO'}`);
    console.log(
      `Compatibility Rate: ${(performanceReport.summary.compatibilityRate * 100).toFixed(1)}%`,
    );
    console.log(
      `Compatibility Target (≥95%): ${performanceReport.summary.compatibilityRate >= 0.95 ? '✅ YES' : '❌ NO'}`,
    );

    if (performanceReport.recommendations.length > 0) {
      console.log('\n🔧 Recommendations:');
      performanceReport.recommendations.forEach((rec) => {
        console.log(`  ${rec.type}: ${rec.message}`);
      });
    }

    console.log('='.repeat(80));

    return report;
  }

  _generateTestRecommendations() {
    const recommendations = [];

    const failedTests = this.testResults.filter((test) => !test.overallPass);

    if (failedTests.length > 0) {
      recommendations.push({
        type: 'CRITICAL',
        message: `${failedTests.length} test(s) failed`,
        failedTests: failedTests.map((test) => test.testName),
      });
    }

    return recommendations;
  }

  async cleanup() {
    console.log('🧹 Cleaning up test environment...');

    this.performanceMonitor.stopMonitoring();
    await this.hookSystem.close();

    // Clean up test database
    if (this.memoryStore) {
      this.memoryStore.close();
    }

    console.log('✅ Cleanup completed');
  }
}

export { PerformanceTestSuite };
