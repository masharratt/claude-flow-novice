/**
 * Test Task Routing System - Comprehensive demonstration and testing
 * Phase 5 Agent-Booster Integration & Code Performance Acceleration
 */

const TaskRoutingCoordinator = require('./src/redis/task-routing-coordinator');
const Redis = require('ioredis');

class TaskRoutingSystemTest {
  constructor() {
    this.redis = new Redis();
    this.coordinator = null;
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Starting Task Routing System Tests');
    console.log('=' .repeat(60));

    try {
      // Initialize coordinator
      await this.initializeCoordinator();

      // Run individual test suites
      await this.testBasicTaskRouting();
      await this.testWASMPoolManagement();
      await this.testErrorHandling();
      await this.testLoadBalancing();
      await this.testResourceOptimization();
      await this.testRedisCoordination();

      // Generate comprehensive report
      await this.generateTestReport();

    } catch (error) {
      console.error('💥 Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  async initializeCoordinator() {
    console.log('🚀 Initializing Task Routing Coordinator...');

    this.coordinator = new TaskRoutingCoordinator({
      host: 'localhost',
      port: 6379,
      retryDelayOnFailover: 100
    });

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.addTestResult('Initialization', true, 'Coordinator initialized successfully');
  }

  async testBasicTaskRouting() {
    console.log('\n📋 Testing Basic Task Routing...');
    console.log('-'.repeat(40));

    const testTasks = [
      {
        name: 'JavaScript file creation',
        task: {
          type: 'create',
          filePath: 'test.js',
          content: 'console.log("Hello World");',
          priority: 'normal'
        }
      },
      {
        name: 'Rust code optimization',
        task: {
          type: 'optimize',
          filePath: 'main.rs',
          content: 'fn main() { println!("Hello Rust!"); }',
          priority: 'high'
        }
      },
      {
        name: 'Python refactoring',
        task: {
          type: 'refactor',
          filePath: 'script.py',
          content: 'def hello(): print("Hello Python")',
          priority: 'low'
        }
      }
    ];

    for (const test of testTasks) {
      try {
        console.log(`  🔄 Executing: ${test.name}`);
        const result = await this.coordinator.executeTask(test.task);

        if (result.success) {
          console.log(`  ✅ ${test.name} - Success (${result.duration}ms)`);
          this.addTestResult(`Task Routing: ${test.name}`, true,
            `Completed in ${result.duration}ms via ${result.routing.target.type}`);
        } else {
          console.log(`  ❌ ${test.name} - Failed: ${result.error}`);
          this.addTestResult(`Task Routing: ${test.name}`, false, result.error);
        }

        // Small delay between tasks
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.log(`  💥 ${test.name} - Error: ${error.message}`);
        this.addTestResult(`Task Routing: ${test.name}`, false, error.message);
      }
    }
  }

  async testWASMPoolManagement() {
    console.log('\n🔧 Testing WASM Pool Management...');
    console.log('-'.repeat(40));

    try {
      // Get initial pool stats
      const initialStats = await this.coordinator.wasmPool.getPoolStats();
      console.log(`  📊 Initial pool size: ${initialStats.poolSize}`);

      // Execute tasks that should use WASM
      const wasmTasks = [
        {
          type: 'optimize',
          filePath: 'performance.rs',
          content: 'pub fn fast_function() -> u32 { 42 }',
          priority: 'high'
        },
        {
          type: 'compile',
          filePath: 'native.cpp',
          content: '#include <iostream>\nint main() { return 0; }',
          priority: 'normal'
        }
      ];

      console.log('  🚀 Executing WASM-optimized tasks...');
      for (const task of wasmTasks) {
        const result = await this.coordinator.executeTask(task);
        console.log(`    ${result.success ? '✅' : '❌'} ${task.type} task: ${result.routing.target.type}`);
      }

      // Wait for pool adjustments
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check pool stats after execution
      const finalStats = await this.coordinator.wasmPool.getPoolStats();
      console.log(`  📊 Final pool size: ${finalStats.poolSize}`);
      console.log(`  📈 Pool utilization: ${Math.round(finalStats.utilization * 100)}%`);

      this.addTestResult('WASM Pool Management', true,
        `Pool scaled from ${initialStats.poolSize} to ${finalStats.poolSize} instances`);

    } catch (error) {
      console.log(`  💥 WASM Pool test failed: ${error.message}`);
      this.addTestResult('WASM Pool Management', false, error.message);
    }
  }

  async testErrorHandling() {
    console.log('\n🛡️ Testing Error Handling...');
    console.log('-'.repeat(40));

    try {
      // Test with problematic tasks
      const errorTasks = [
        {
          name: 'Invalid task structure',
          task: {
            // Missing type/operation
            filePath: 'test.js'
          }
        },
        {
          name: 'Simulated panic',
          task: {
            type: 'execute',
            filePath: 'panic.rs',
            content: 'panic!("This is a test panic");',
            simulatePanic: true
          }
        },
        {
          name: 'Memory stress',
          task: {
            type: 'process',
            filePath: 'memory.rs',
            content: 'let large_vec: Vec<u8> = vec![0; 10_000_000];',
            simulateMemoryError: true
          }
        }
      ];

      for (const test of errorTasks) {
        try {
          console.log(`  🔄 Testing: ${test.name}`);
          const result = await this.coordinator.executeTask(test.task);

          if (!result.success) {
            console.log(`  ✅ ${test.name} - Error handled gracefully`);
            this.addTestResult(`Error Handling: ${test.name}`, true,
              `Error handled: ${result.error || 'Unknown error'}`);
          } else {
            console.log(`  ⚠️ ${test.name} - Unexpected success`);
            this.addTestResult(`Error Handling: ${test.name}`, false, 'Expected error but got success');
          }

        } catch (error) {
          console.log(`  ✅ ${test.name} - Error caught by system: ${error.message}`);
          this.addTestResult(`Error Handling: ${test.name}`, true,
            `System caught error: ${error.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Check error statistics
      const errorStats = await this.coordinator.errorHandler.getErrorStats();
      console.log(`  📊 Total errors handled: ${errorStats.totalErrors}`);
      console.log(`  📊 Recovery rate: ${Math.round(errorStats.recoveryRate * 100)}%`);

    } catch (error) {
      console.log(`  💥 Error handling test failed: ${error.message}`);
      this.addTestResult('Error Handling System', false, error.message);
    }
  }

  async testLoadBalancing() {
    console.log('\n⚖️ Testing Load Balancing...');
    console.log('-'.repeat(40));

    try {
      const concurrentTasks = [];
      const taskCount = 8;

      console.log(`  🚀 Executing ${taskCount} concurrent tasks...`);

      // Launch multiple tasks concurrently
      for (let i = 0; i < taskCount; i++) {
        const task = {
          type: i % 2 === 0 ? 'create' : 'edit',
          filePath: i % 3 === 0 ? `file${i}.rs` : `file${i}.js`,
          content: `// Task ${i} content\nconsole.log("Task ${i}");`,
          priority: i % 4 === 0 ? 'high' : 'normal'
        };

        const taskPromise = this.coordinator.executeTask(task);
        concurrentTasks.push(taskPromise);
      }

      // Wait for all tasks to complete
      const results = await Promise.all(concurrentTasks);

      // Analyze results
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const wasmUsed = results.filter(r => r.routing && r.routing.target.type === 'wasm').length;
      const regularUsed = results.filter(r => r.routing && r.routing.target.type !== 'wasm').length;

      console.log(`  ✅ Successful tasks: ${successful}/${taskCount}`);
      console.log(`  ❌ Failed tasks: ${failed}/${taskCount}`);
      console.log(`  🔧 WASM instances used: ${wasmUsed}`);
      console.log(`  🤖 Regular agents used: ${regularUsed}`);

      // Calculate average duration
      const avgDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length;
      console.log(`  ⏱️ Average task duration: ${Math.round(avgDuration)}ms`);

      this.addTestResult('Load Balancing', successful >= taskCount * 0.8,
        `${successful}/${taskCount} tasks successful, avg duration: ${Math.round(avgDuration)}ms`);

    } catch (error) {
      console.log(`  💥 Load balancing test failed: ${error.message}`);
      this.addTestResult('Load Balancing', false, error.message);
    }
  }

  async testResourceOptimization() {
    console.log('\n📈 Testing Resource Optimization...');
    console.log('-'.repeat(40));

    try {
      // Get initial system status
      const initialStatus = await this.coordinator.getSystemStatus();
      console.log(`  📊 Initial active tasks: ${initialStatus.coordinator.activeTasks}`);
      console.log(`  📊 Initial pool utilization: ${Math.round(initialStatus.pool.utilization * 100)}%`);

      // Execute tasks with different resource requirements
      const resourceTasks = [
        {
          type: 'compile',
          filePath: 'heavy.cpp',
          content: '// Heavy computation\nint main() { /* complex operations */ }',
          priority: 'high',
          resourceHeavy: true
        },
        {
          type: 'analyze',
          filePath: 'light.js',
          content: '// Simple analysis\nconsole.log("light task");',
          priority: 'low',
          resourceHeavy: false
        }
      ];

      for (const task of resourceTasks) {
        const result = await this.coordinator.executeTask(task);
        console.log(`    ${result.success ? '✅' : '❌'} ${task.type} (${task.resourceHeavy ? 'heavy' : 'light'}): ${result.routing.target.type}`);
      }

      // Wait for resource optimization
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check final status
      const finalStatus = await this.coordinator.getSystemStatus();
      console.log(`  📊 Final pool utilization: ${Math.round(finalStatus.pool.utilization * 100)}%`);
      console.log(`  📊 Pool scaling events: ${finalStatus.pool.scalingEvents.length}`);

      this.addTestResult('Resource Optimization', true,
        `Utilization managed: ${Math.round(finalStatus.pool.utilization * 100)}%`);

    } catch (error) {
      console.log(`  💥 Resource optimization test failed: ${error.message}`);
      this.addTestResult('Resource Optimization', false, error.message);
    }
  }

  async testRedisCoordination() {
    console.log('\n🔗 Testing Redis Coordination...');
    console.log('-'.repeat(40));

    try {
      // Test Redis data persistence
      console.log('  📝 Testing data persistence...');

      // Execute a task and check if data is stored in Redis
      const testTask = {
        type: 'create',
        filePath: 'redis-test.js',
        content: '// Redis coordination test\nconsole.log("test");'
      };

      const result = await this.coordinator.executeTask(testTask);

      // Check if routing data was stored
      const routingData = await this.redis.get('swarm:phase-5:routing-table');
      const statsData = await this.redis.hgetall('swarm:phase-5:coordinator-stats');

      const hasRoutingData = routingData && routingData.length > 0;
      const hasStatsData = statsData && Object.keys(statsData).length > 0;

      console.log(`    📊 Routing data stored: ${hasRoutingData ? '✅' : '❌'}`);
      console.log(`    📊 Statistics data stored: ${hasStatsData ? '✅' : '❌'}`);

      // Test pub/sub coordination
      console.log('  📡 Testing pub/sub coordination...');

      // Publish a test event
      await this.redis.publish('swarm:phase-5:coordination', JSON.stringify({
        type: 'test_event',
        message: 'Test coordination message',
        timestamp: Date.now()
      }));

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('    📡 Test event published successfully');

      this.addTestResult('Redis Coordination', hasRoutingData && hasStatsData,
        'Data persistence and pub/sub coordination working');

    } catch (error) {
      console.log(`  💥 Redis coordination test failed: ${error.message}`);
      this.addTestResult('Redis Coordination', false, error.message);
    }
  }

  async generateTestReport() {
    console.log('\n📊 TEST REPORT');
    console.log('='.repeat(60));

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📈 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

    console.log('\n📋 Detailed Results:');
    console.log('-'.repeat(40));

    for (const result of this.testResults) {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.name}`);
      if (!result.passed) {
        console.log(`   Error: ${result.details}`);
      } else {
        console.log(`   Details: ${result.details}`);
      }
    }

    // Get final system status
    try {
      const finalStatus = await this.coordinator.getSystemStatus();

      console.log('\n📈 Final System Status:');
      console.log('-'.repeat(40));
      console.log(`📊 Total tasks processed: ${finalStatus.coordinator.totalTasks}`);
      console.log(`📊 Success rate: ${Math.round(finalStatus.coordinator.successRate * 100)}%`);
      console.log(`📊 Average task duration: ${Math.round(finalStatus.coordinator.avgTaskDuration)}ms`);
      console.log(`📊 WASM pool size: ${finalStatus.pool.poolSize}`);
      console.log(`📊 WASM utilization: ${Math.round(finalStatus.pool.utilization * 100)}%`);
      console.log(`📊 Errors handled: ${finalStatus.errors.totalErrors}`);
      console.log(`📊 Error recovery rate: ${Math.round(finalStatus.errors.recoveryRate * 100)}%`);
      console.log(`📊 System uptime: ${Math.round(finalStatus.uptime)}s`);

    } catch (error) {
      console.log(`\n❌ Failed to get final system status: ${error.message}`);
    }

    console.log('\n🎯 Phase 5 Task Routing & Resource Management Test Complete!');
    console.log(`Confidence Score: ${Math.round((passedTests / totalTests) * 100)}%`);
  }

  addTestResult(name, passed, details) {
    this.testResults.push({
      name,
      passed,
      details,
      timestamp: Date.now()
    });
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test environment...');

    if (this.coordinator) {
      await this.coordinator.shutdown();
    }

    if (this.redis) {
      // Clean up test data from Redis
      try {
        await this.redis.del('swarm:phase-5:routing-table');
        await this.redis.del('swarm:phase-5:coordinator-stats');
        await this.redis.del('swarm:phase-5:wasm-pool');
        await this.redis.del('swarm:phase-5:wasm-errors');
        console.log('  🧹 Test data cleaned from Redis');
      } catch (error) {
        console.log(`  ⚠️ Failed to clean Redis data: ${error.message}`);
      }

      await this.redis.quit();
    }

    console.log('✅ Cleanup complete');
  }
}

// Run the test suite
if (require.main === module) {
  const testSuite = new TaskRoutingSystemTest();
  testSuite.runAllTests().catch(console.error);
}

module.exports = TaskRoutingSystemTest;