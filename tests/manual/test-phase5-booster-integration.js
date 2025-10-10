#!/usr/bin/env node

/**
 * Phase 5 Agent-Booster Integration Test
 *
 * Comprehensive test suite for WASM integration and booster functionality
 * with Redis coordination and performance validation.
 */

import { performance } from 'perf_hooks';
import BoosterAgentRegistry from './src/booster/BoosterAgentRegistry.js';
import CodeBoosterAgent from './src/booster/CodeBoosterAgent.js';
import AgentBoosterWrapper from './src/booster/AgentBoosterWrapper.js';
import WASMInstanceManager from './src/booster/WASMInstanceManager.js';

class Phase5BoosterIntegrationTest {
  constructor() {
    this.testResults = [];
    this.currentTest = null;
    this.startTime = Date.now();
    this.redisConnected = false;

    // Test configuration
    this.testConfig = {
      wasmPoolSize: 5,
      testTimeout: 30000,
      performanceThreshold: {
        taskCompletionTime: 5000, // 5 seconds
        memoryUsage: 512 * 1024 * 1024, // 512MB
        successRate: 0.8 // 80%
      },
      concurrencyLevel: 3
    };
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🧪 Phase 5 Agent-Booster Integration Test Suite');
    console.log('=' .repeat(60));
    console.log(`⏰ Started: ${new Date().toISOString()}`);
    console.log(`🔧 Config: WASM Pool Size: ${this.testConfig.wasmPoolSize}, Concurrency: ${this.testConfig.concurrencyLevel}`);
    console.log('');

    try {
      // Check Redis connection
      await this.checkRedisConnection();

      // Test individual components
      await this.testWASMInstanceManager();
      await this.testAgentBoosterWrapper();
      await this.testCodeBoosterAgent();
      await this.testBoosterAgentRegistry();

      // Test integration scenarios
      await this.testConcurrentTaskExecution();
      await this.testErrorHandlingAndRecovery();
      await this.testPerformanceOptimization();
      await this.testRedisCoordination();

      // Generate final report
      this.generateFinalReport();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  /**
   * Check Redis connection
   */
  async checkRedisConnection() {
    this.runTest('Redis Connection Check', async () => {
      try {
        const { connectRedis } = await import('./src/cli/utils/redis-client.js');
        const client = await connectRedis({
          host: 'localhost',
          port: 6379,
          connectTimeout: 5000
        });

        await client.ping();
        await client.quit();
        this.redisConnected = true;

        return { connected: true, message: 'Redis connection successful' };
      } catch (error) {
        this.redisConnected = false;
        throw new Error(`Redis connection failed: ${error.message}`);
      }
    });
  }

  /**
   * Test WASM Instance Manager
   */
  async testWASMInstanceManager() {
    if (!this.redisConnected) {
      console.log('⚠️ Skipping WASM tests - Redis not available');
      return;
    }

    this.runTest('WASM Instance Manager Initialization', async () => {
      const manager = new WASMInstanceManager({
        poolSize: this.testConfig.wasmPoolSize,
        memoryLimit: 256, // 256MB for testing
        taskTimeout: 10000
      });

      await manager.initialize();

      const status = manager.getStatus();
      if (status.instances.total !== this.testConfig.wasmPoolSize) {
        throw new Error(`Expected ${this.testConfig.wasmPoolSize} instances, got ${status.instances.total}`);
      }

      if (status.instances.available !== this.testConfig.wasmPoolSize) {
        throw new Error(`Expected ${this.testConfig.wasmPoolSize} available instances, got ${status.instances.available}`);
      }

      await manager.shutdown();

      return {
        instancesCreated: status.instances.total,
        availableInstances: status.instances.available,
        memoryLimit: this.testConfig.memoryLimit
      };
    });

    this.runTest('WASM Instance Pool Operations', async () => {
      const manager = new WASMInstanceManager({
        poolSize: 3,
        memoryLimit: 256,
        taskTimeout: 5000
      });

      await manager.initialize();

      // Test instance acquisition
      const instances = [];
      for (let i = 0; i < 3; i++) {
        const instance = await manager.acquireInstance({
          taskId: `test-${i}`,
          taskType: 'code-generation'
        });
        instances.push(instance);
      }

      // Pool should be empty now
      let status = manager.getStatus();
      if (status.instances.available !== 0) {
        throw new Error('Expected no available instances after acquiring all');
      }

      // Release one instance
      await manager.releaseInstance(instances[0].instanceId);
      status = manager.getStatus();
      if (status.instances.available !== 1) {
        throw new Error('Expected 1 available instance after releasing one');
      }

      // Test task execution
      const result = await instances[1].execute({
        code: 'function test() { return "hello"; }',
        language: 'javascript'
      });

      if (!result.success) {
        throw new Error('Task execution failed');
      }

      // Cleanup
      for (const instance of instances) {
        await manager.releaseInstance(instance.instanceId);
      }

      await manager.shutdown();

      return {
        instancesAcquired: instances.length,
        taskExecutionSuccess: result.success,
        executionTime: result.executionTime
      };
    });
  }

  /**
   * Test Agent Booster Wrapper
   */
  async testAgentBoosterWrapper() {
    if (!this.redisConnected) {
      console.log('⚠️ Skipping Agent Booster Wrapper tests - Redis not available');
      return;
    }

    this.runTest('Agent Booster Wrapper Initialization', async () => {
      const wrapper = new AgentBoosterWrapper({
        fallbackEnabled: true,
        performanceTracking: true
      });

      await wrapper.initialize();

      const status = wrapper.getStatus();
      if (!status.isInitialized) {
        throw new Error('Agent Booster Wrapper not initialized');
      }

      await wrapper.shutdown();

      return {
        initialized: status.isInitialized,
        cacheSize: status.cacheSize,
        fallbackEnabled: wrapper.config.fallbackEnabled
      };
    });

    this.runTest('Agent Booster Task Execution', async () => {
      const wrapper = new AgentBoosterWrapper({
        fallbackEnabled: true,
        performanceTracking: true
      });

      await wrapper.initialize();

      // Test code generation task
      const result = await wrapper.executeTask({
        taskId: 'test-code-gen',
        agentId: 'test-agent',
        taskType: 'code-generation',
        description: 'Generate a simple function',
        input: {
          language: 'javascript',
          requirements: ['simple function', 'returns hello world'],
          patterns: []
        }
      });

      if (!result.success) {
        throw new Error('Code generation task failed');
      }

      if (result.executionTime > this.testConfig.performanceThreshold.taskCompletionTime) {
        throw new Error(`Task execution time ${result.executionTime}ms exceeds threshold ${this.testConfig.performanceThreshold.taskCompletionTime}ms`);
      }

      await wrapper.shutdown();

      return {
        taskSuccess: result.success,
        executionTime: result.executionTime,
        usedBooster: !result.usedFallback,
        fromCache: result.fromCache
      };
    });
  }

  /**
   * Test Code Booster Agent
   */
  async testCodeBoosterAgent() {
    if (!this.redisConnected) {
      console.log('⚠️ Skipping Code Booster Agent tests - Redis not available');
      return;
    }

    this.runTest('Code Booster Agent Initialization', async () => {
      const agent = new CodeBoosterAgent({
        name: 'Test Code Booster Agent',
        maxConcurrentTasks: 2,
        timeout: 10000
      });

      await agent.initialize();

      const status = agent.getStatus();
      if (status.status !== 'ready') {
        throw new Error(`Agent status not ready: ${status.status}`);
      }

      await agent.shutdown();

      return {
        agentId: status.agentId,
        status: status.status,
        capabilities: status.capabilities.length
      };
    });

    this.runTest('Code Booster Agent Task Execution', async () => {
      const agent = new CodeBoosterAgent({
        name: 'Test Code Booster Agent',
        maxConcurrentTasks: 2,
        timeout: 15000
      });

      await agent.initialize();

      // Test code optimization
      const result = await agent.optimizeCode('var x = 1; var y = 2; return x + y;', {
        language: 'javascript',
        level: 'standard'
      });

      if (!result.success) {
        throw new Error('Code optimization task failed');
      }

      // Test performance analysis
      const analysisResult = await agent.analyzePerformance(`
        function slowFunction(data) {
          let result = [];
          for (let i = 0; i < data.length; i++) {
            for (let j = 0; j < data.length; j++) {
              result.push(data[i] * data[j]);
            }
          }
          return result;
        }
      `, {
        language: 'javascript',
        depth: 'standard'
      });

      if (!analysisResult.success) {
        throw new Error('Performance analysis task failed');
      }

      await agent.shutdown();

      return {
        optimizationSuccess: result.success,
        optimizationTime: result.executionTime,
        analysisSuccess: analysisResult.success,
        analysisTime: analysisResult.executionTime
      };
    });
  }

  /**
   * Test Booster Agent Registry
   */
  async testBoosterAgentRegistry() {
    if (!this.redisConnected) {
      console.log('⚠️ Skipping Booster Agent Registry tests - Redis not available');
      return;
    }

    this.runTest('Booster Agent Registry Initialization', async () => {
      const registry = new BoosterAgentRegistry({
        maxAgents: 10,
        autoDiscovery: false // Disable for testing
      });

      await registry.initialize();

      const status = registry.getStatus();
      if (!status.isInitialized) {
        throw new Error('Registry not initialized');
      }

      if (status.types === 0) {
        throw new Error('No agent types registered');
      }

      await registry.shutdown();

      return {
        initialized: status.isInitialized,
        agentTypes: status.types,
        builtinTypesRegistered: status.types > 0
      };
    });

    this.runTest('Agent Creation and Task Execution', async () => {
      const registry = new BoosterAgentRegistry({
        maxAgents: 5,
        autoDiscovery: false
      });

      await registry.initialize();

      // Create a code booster agent
      const agent = await registry.createAgent('code-booster', {
        name: 'Test Registry Agent',
        maxConcurrentTasks: 2
      });

      if (!agent || !agent.config) {
        throw new Error('Failed to create agent');
      }

      // Execute task through registry
      const result = await registry.executeTask({
        taskId: 'registry-test-task',
        type: 'code-generation',
        description: 'Generate test code',
        input: {
          language: 'javascript',
          requirements: ['simple function']
        }
      });

      if (!result.success) {
        throw new Error('Registry task execution failed');
      }

      await registry.shutdown();

      return {
        agentCreated: !!agent,
        agentId: agent.config.agentId,
        taskSuccess: result.success,
        executionTime: result.executionTime
      };
    });
  }

  /**
   * Test concurrent task execution
   */
  async testConcurrentTaskExecution() {
    if (!this.redisConnected) {
      console.log('⚠️ Skipping concurrent execution tests - Redis not available');
      return;
    }

    this.runTest('Concurrent Task Execution', async () => {
      const registry = new BoosterAgentRegistry({
        maxAgents: 5,
        autoDiscovery: false
      });

      await registry.initialize();

      // Create multiple agents
      const agents = [];
      for (let i = 0; i < this.testConfig.concurrencyLevel; i++) {
        const agent = await registry.createAgent('code-booster', {
          name: `Concurrent Test Agent ${i}`,
          maxConcurrentTasks: 2
        });
        agents.push(agent);
      }

      // Execute concurrent tasks
      const tasks = [];
      const startTime = Date.now();

      for (let i = 0; i < this.testConfig.concurrencyLevel * 2; i++) {
        const task = registry.executeTask({
          taskId: `concurrent-task-${i}`,
          type: 'code-generation',
          description: `Generate concurrent test code ${i}`,
          input: {
            language: 'javascript',
            requirements: [`task ${i}`]
          }
        });
        tasks.push(task);
      }

      // Wait for all tasks to complete
      const results = await Promise.all(tasks);
      const totalTime = Date.now() - startTime;

      // Validate results
      const successCount = results.filter(r => r.success).length;
      const successRate = successCount / results.length;

      if (successRate < this.testConfig.performanceThreshold.successRate) {
        throw new Error(`Success rate ${successRate} below threshold ${this.testConfig.performanceThreshold.successRate}`);
      }

      await registry.shutdown();

      return {
        tasksExecuted: results.length,
        tasksSuccessful: successCount,
        successRate: successRate,
        totalTime: totalTime,
        averageTimePerTask: totalTime / results.length
      };
    });
  }

  /**
   * Test error handling and recovery
   */
  async testErrorHandlingAndRecovery() {
    if (!this.redisConnected) {
      console.log('⚠️ Skipping error handling tests - Redis not available');
      return;
    }

    this.runTest('Error Handling and Recovery', async () => {
      const manager = new WASMInstanceManager({
        poolSize: 2,
        memoryLimit: 256,
        taskTimeout: 2000, // Short timeout for testing
        maxRetries: 2
      });

      await manager.initialize();

      let recoveryAttempts = 0;
      let recoverySuccesses = 0;

      // Monitor recovery events
      manager.on('booster.recovered', () => {
        recoverySuccesses++;
      });

      // Test with invalid input to trigger errors
      try {
        const instance = await manager.acquireInstance({
          taskId: 'error-test',
          taskType: 'invalid-type' // This should cause an error
        });

        // Try to execute with invalid input
        await instance.execute(null);

        await manager.releaseInstance(instance.instanceId);
      } catch (error) {
        // Expected error
        recoveryAttempts++;
      }

      // Wait a bit for recovery attempts
      await new Promise(resolve => setTimeout(resolve, 3000));

      await manager.shutdown();

      return {
        recoveryAttempts: recoveryAttempts,
        recoverySuccesses: recoverySuccesses,
        errorHandlingWorking: recoveryAttempts > 0
      };
    });
  }

  /**
   * Test performance optimization scenarios
   */
  async testPerformanceOptimization() {
    if (!this.redisConnected) {
      console.log('⚠️ Skipping performance optimization tests - Redis not available');
      return;
    }

    this.runTest('Performance Optimization Validation', async () => {
      const agent = new CodeBoosterAgent({
        name: 'Performance Test Agent',
        autoOptimize: true
      });

      await agent.initialize();

      // Test with intentionally inefficient code
      const inefficientCode = `
        function processData(data) {
          var result = [];
          for (var i = 0; i < data.length; i++) {
            for (var j = 0; j < data.length; j++) {
              if (i === j) continue;
              for (var k = 0; k < 10; k++) {
                result.push(data[i] * data[j] + k);
              }
            }
          }
          return result;
        }
      `;

      const optimizationResult = await agent.optimizeCode(inefficientCode, {
        language: 'javascript',
        level: 'aggressive'
      });

      if (!optimizationResult.success) {
        throw new Error('Performance optimization failed');
      }

      // Check if optimizations were applied
      const optimizedCode = optimizationResult.result.optimizedCode;
      const hasOptimizations = optimizedCode !== inefficientCode;

      await agent.shutdown();

      return {
        optimizationSuccess: optimizationResult.success,
        hasOptimizations: hasOptimizations,
        optimizationsApplied: optimizationResult.result.improvements?.length || 0,
        estimatedGain: optimizationResult.result.performanceGain || 0
      };
    });
  }

  /**
   * Test Redis coordination
   */
  async testRedisCoordination() {
    if (!this.redisConnected) {
      console.log('⚠️ Skipping Redis coordination tests - Redis not available');
      return;
    }

    this.runTest('Redis Coordination and Persistence', async () => {
      const wrapper1 = new AgentBoosterWrapper({
        redisKey: 'test-coordination',
        performanceTracking: true
      });

      const wrapper2 = new AgentBoosterWrapper({
        redisKey: 'test-coordination',
        performanceTracking: true
      });

      await wrapper1.initialize();
      await wrapper2.initialize();

      // Execute task with first wrapper
      const result1 = await wrapper1.executeTask({
        taskId: 'coordination-test',
        agentId: 'wrapper1',
        taskType: 'code-generation',
        description: 'Test coordination',
        input: { language: 'javascript', requirements: ['test'] }
      });

      // Execute similar task with second wrapper (should benefit from cache)
      const result2 = await wrapper2.executeTask({
        taskId: 'coordination-test-2',
        agentId: 'wrapper2',
        taskType: 'code-generation',
        description: 'Test coordination',
        input: { language: 'javascript', requirements: ['test'] }
      });

      const cacheHit = result2.fromCache;

      await wrapper1.shutdown();
      await wrapper2.shutdown();

      return {
        task1Success: result1.success,
        task2Success: result2.success,
        cacheWorking: cacheHit,
        coordinationWorking: result1.success && result2.success
      };
    });
  }

  /**
   * Run a single test
   */
  async runTest(testName, testFunction) {
    const startTime = Date.now();
    this.currentTest = testName;

    console.log(`🔍 Running: ${testName}`);

    try {
      const result = await testFunction();
      const duration = Date.now() - startTime;

      this.testResults.push({
        name: testName,
        status: 'PASS',
        duration,
        result
      });

      console.log(`  ✅ PASS (${duration}ms)`);
      if (result && typeof result === 'object') {
        console.log(`  📊 Result: ${JSON.stringify(result, null, 2)}`);
      }

    } catch (error) {
      const duration = Date.now() - startTime;

      this.testResults.push({
        name: testName,
        status: 'FAIL',
        duration,
        error: error.message
      });

      console.log(`  ❌ FAIL (${duration}ms): ${error.message}`);
    }

    console.log('');
  }

  /**
   * Generate final test report
   */
  generateFinalReport() {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.testResults.filter(t => t.status === 'PASS').length;
    const failed = this.testResults.filter(t => t.status === 'FAIL').length;
    const total = this.testResults.length;

    console.log('=' .repeat(60));
    console.log('📊 PHASE 5 BOOSTER INTEGRATION TEST REPORT');
    console.log('=' .repeat(60));
    console.log(`⏰ Total Duration: ${totalDuration}ms`);
    console.log(`🧪 Tests: ${passed} passed, ${failed} failed, ${total} total`);
    console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log(`🔧 Redis Available: ${this.redisConnected ? 'Yes' : 'No'}`);
    console.log('');

    // Test results summary
    console.log('📋 Test Results:');
    this.testResults.forEach(test => {
      const icon = test.status === 'PASS' ? '✅' : '❌';
      console.log(`  ${icon} ${test.name} (${test.duration}ms)`);
      if (test.status === 'FAIL') {
        console.log(`     Error: ${test.error}`);
      }
    });

    console.log('');

    // Performance summary
    if (passed > 0) {
      const performanceTests = this.testResults.filter(t =>
        t.status === 'PASS' && t.result && typeof t.result === 'object'
      );

      if (performanceTests.length > 0) {
        console.log('🚀 Performance Highlights:');
        performanceTests.forEach(test => {
          if (test.result.executionTime) {
            console.log(`  ⚡ ${test.name}: ${test.result.executionTime}ms`);
          }
          if (test.result.taskSuccess !== undefined) {
            console.log(`  🎯 ${test.name}: ${test.result.taskSuccess ? 'Success' : 'Failed'}`);
          }
        });
        console.log('');
      }
    }

    // Overall assessment
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! Phase 5 Agent-Booster Integration is ready.');
    } else if (passed > failed) {
      console.log('⚠️  MOST TESTS PASSED. Some issues need attention before production use.');
    } else {
      console.log('❌ MULTIPLE TEST FAILURES. Phase 5 integration needs significant work.');
    }

    // Recommendations
    console.log('');
    console.log('💡 Recommendations:');
    if (!this.redisConnected) {
      console.log('  • Set up Redis server for full functionality testing');
    }
    if (failed > 0) {
      console.log('  • Address failing tests before deployment');
    }
    if (passed === total) {
      console.log('  • System is ready for production deployment');
      console.log('  • Consider load testing with higher concurrency');
      console.log('  • Monitor performance in production environment');
    }

    console.log('=' .repeat(60));
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new Phase5BoosterIntegrationTest();
  testSuite.runAllTests().catch(error => {
    console.error('Test suite execution failed:', error);
    process.exit(1);
  });
}

export default Phase5BoosterIntegrationTest;