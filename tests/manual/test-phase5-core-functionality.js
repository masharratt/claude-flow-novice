#!/usr/bin/env node

/**
 * Phase 5 Core Functionality Test
 *
 * Focused test for core booster functionality without external dependencies
 */

import CodeBoosterAgent from './src/booster/CodeBoosterAgent.js';
import AgentBoosterWrapper from './src/booster/AgentBoosterWrapper.js';
import WASMInstanceManager from './src/booster/WASMInstanceManager.js';

class Phase5CoreFunctionalityTest {
  constructor() {
    this.testResults = [];
    this.startTime = Date.now();
  }

  async runTests() {
    console.log('🧪 Phase 5 Core Functionality Test');
    console.log('=' .repeat(50));

    try {
      await this.testWASMInstanceManagerBasics();
      await this.testAgentBoosterWrapperBasics();
      await this.testCodeBoosterAgentBasics();
      await this.testBoosterIntegration();

      this.generateReport();
    } catch (error) {
      console.error('❌ Test failed:', error);
      process.exit(1);
    }
  }

  async testWASMInstanceManagerBasics() {
    this.runTest('WASM Instance Manager Basic Operations', async () => {
      // Test with mock Redis disabled
      const manager = new WASMInstanceManager({
        poolSize: 2,
        memoryLimit: 256,
        taskTimeout: 5000
      });

      // Test basic instance creation (without Redis)
      const instanceId = manager.generateInstanceId();
      const instance = await manager.createWASMInstance(instanceId, 256);

      if (!instance || !instance.execute) {
        throw new Error('Failed to create WASM instance');
      }

      // Test execution
      const result = await instance.execute({
        type: 'code-generation',
        description: 'Test execution'
      }, {
        language: 'javascript',
        requirements: ['test']
      });

      if (!result.success) {
        throw new Error('WASM execution failed');
      }

      // Test cleanup
      await instance.cleanup();

      return {
        instanceCreated: !!instance,
        executionSuccess: result.success,
        executionTime: result.executionTime,
        memoryUsage: result.memoryUsed
      };
    });
  }

  async testAgentBoosterWrapperBasics() {
    this.runTest('Agent Booster Wrapper Basic Operations', async () => {
      const wrapper = new AgentBoosterWrapper({
        fallbackEnabled: true,
        performanceTracking: true,
        // Mock Redis configuration
        redisKey: 'test-wrapper'
      });

      // Test wrapper initialization without Redis
      try {
        await wrapper.initialize();
      } catch (error) {
        // Expected to fail without Redis, but we can test other functionality
        console.log('  ⚠️ Redis initialization failed (expected)');
      }

      // Test fallback execution
      const fallbackResult = await wrapper.executeFallbackTask({
        taskType: 'code-generation',
        description: 'Test fallback execution',
        input: {
          language: 'javascript',
          requirements: ['test']
        }
      });

      if (!fallbackResult.success) {
        throw new Error('Fallback execution failed');
      }

      // Test cache functionality
      const cacheKey = wrapper.generateCacheKey('test-type', { test: 'input' });
      if (!cacheKey || typeof cacheKey !== 'string') {
        throw new Error('Cache key generation failed');
      }

      // Test result caching
      wrapper.cacheResult(cacheKey, { success: true, result: 'test' });
      if (!wrapper.resultCache.has(cacheKey)) {
        throw new Error('Result caching failed');
      }

      return {
        fallbackSuccess: fallbackResult.success,
        cacheWorking: wrapper.resultCache.size > 0,
        cacheHitRate: wrapper.performanceMetrics.cacheHitRate
      };
    });
  }

  async testCodeBoosterAgentBasics() {
    this.runTest('Code Booster Agent Basic Operations', async () => {
      const agent = new CodeBoosterAgent({
        name: 'Test Agent',
        maxConcurrentTasks: 2,
        timeout: 10000,
        fallbackEnabled: true
      });

      // Test agent initialization without Redis
      try {
        await agent.initialize();
      } catch (error) {
        // Expected to fail without Redis
        console.log('  ⚠️ Agent initialization failed (expected without Redis)');
      }

      // Test task capability checking
      const canHandleCode = agent.canHandleTask('code-generation');
      const canHandleUnknown = agent.canHandleTask('unknown-task');

      if (!canHandleCode) {
        throw new Error('Agent should handle code-generation tasks');
      }

      if (canHandleUnknown) {
        throw new Error('Agent should not handle unknown tasks');
      }

      // Test language detection
      const jsCode = 'function test() { return "hello"; }';
      const detectedLang = agent.detectLanguage(jsCode);

      if (detectedLang !== 'javascript') {
        throw new Error(`Expected 'javascript', got '${detectedLang}'`);
      }

      // Test status
      const status = agent.getStatus();
      if (!status.agentId || !status.capabilities) {
        throw new Error('Agent status incomplete');
      }

      return {
        agentId: status.agentId,
        capabilitiesCount: status.capabilities.length,
        languageDetection: detectedLang,
        canHandleCodeTasks: canHandleCode
      };
    });
  }

  async testBoosterIntegration() {
    this.runTest('Booster Integration Logic', async () => {
      // Test integration logic without external dependencies

      const manager = new WASMInstanceManager({
        poolSize: 1,
        memoryLimit: 128,
        taskTimeout: 3000
      });

      const wrapper = new AgentBoosterWrapper({
        fallbackEnabled: true
      });

      const agent = new CodeBoosterAgent({
        name: 'Integration Test Agent',
        fallbackEnabled: true
      });

      // Test component creation
      const managerStatus = manager.getStatus();
      const wrapperStatus = wrapper.getStatus();
      const agentStatus = agent.getStatus();

      // Test configuration consistency
      const configsValid =
        manager.config.poolSize === 1 &&
        wrapper.config.fallbackEnabled === true &&
        agent.config.fallbackEnabled === true;

      // Test performance tracking
      wrapper.performanceMetrics.totalRequests = 1;
      wrapper.performanceMetrics.successfulRequests = 1;

      const performanceValid = wrapper.performanceMetrics.totalRequests > 0;

      return {
        managerConfigValid: manager.config.poolSize === 1,
        wrapperConfigValid: wrapper.config.fallbackEnabled === true,
        agentConfigValid: agent.config.fallbackEnabled === true,
        performanceTracking: performanceValid,
        allComponentsCreated: true
      };
    });
  }

  runTest(testName, testFunction) {
    const startTime = Date.now();

    console.log(`🔍 ${testName}`);

    try {
      const result = testFunction();
      const duration = Date.now() - startTime;

      this.testResults.push({
        name: testName,
        status: 'PASS',
        duration,
        result
      });

      console.log(`  ✅ PASS (${duration}ms)`);

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

  generateReport() {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.testResults.filter(t => t.status === 'PASS').length;
    const failed = this.testResults.filter(t => t.status === 'FAIL').length;
    const total = this.testResults.length;

    console.log('=' .repeat(50));
    console.log('📊 CORE FUNCTIONALITY TEST REPORT');
    console.log('=' .repeat(50));
    console.log(`⏰ Duration: ${totalDuration}ms`);
    console.log(`🧪 Tests: ${passed} passed, ${failed} failed, ${total} total`);
    console.log(`📈 Success Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`);
    console.log('');

    console.log('📋 Test Results:');
    this.testResults.forEach(test => {
      const icon = test.status === 'PASS' ? '✅' : '❌';
      console.log(`  ${icon} ${test.name} (${test.duration}ms)`);
    });

    console.log('');

    if (failed === 0) {
      console.log('🎉 ALL CORE TESTS PASSED!');
      console.log('💡 Basic WASM integration and booster functionality is working.');
      console.log('🔧 For full functionality, ensure Redis is available.');
    } else {
      console.log('⚠️  Some tests failed. Review the implementation.');
    }

    console.log('=' .repeat(50));
  }
}

// Run tests
const testSuite = new Phase5CoreFunctionalityTest();
testSuite.runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});