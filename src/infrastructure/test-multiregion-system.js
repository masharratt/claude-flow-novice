/**
 * Multi-Region System Test Suite
 *
 * Comprehensive testing for multi-region load balancing with failover and latency optimization
 * Tests sub-5 second failover, latency-based routing, and cross-region coordination
 */

import { performance } from 'perf_hooks';
import { MultiRegionCoordinator } from './multiregion-coordinator.js';
import { MultiRegionTopology } from './multiregion-topology.js';
import { RegionalLoadBalancer } from './regional-load-balancer.js';
import { StateSynchronization } from './state-synchronization.js';
import { GeographicRoutingEngine, FastFailoverManager } from './geographic-routing.js';
import { createClient } from 'redis';

// Test configuration
const TEST_CONFIG = {
  regions: ['us-east', 'us-west', 'eu-west', 'asia-pacific'],
  testDuration: 60000, // 1 minute
  failoverTimeout: 5000, // 5 seconds
  maxAcceptableFailoverTime: 5000,
  maxAcceptableLatency: 500, // ms
  minSuccessRate: 0.95,
  concurrencyLevel: 10,
  requestsPerSecond: 100
};

// Test scenarios
const TEST_SCENARIOS = {
  BASIC_ROUTING: 'basic_routing',
  REGION_FAILURE: 'region_failure',
  LATENCY_SPIKE: 'latency_spike',
  HIGH_LOAD: 'high_load',
  NETWORK_PARTITION: 'network_partition',
  CONCURRENT_REQUESTS: 'concurrent_requests',
  STATE_CONFLICT: 'state_conflict',
  COORDINATION_FAILURE: 'coordination_failure'
};

/**
 * Multi-Region System Test Suite
 */
export class MultiRegionSystemTest {
  constructor(redisConfig) {
    this.redis = redisConfig;
    this.testResults = {
      scenarios: new Map(),
      overall: {
        startTime: null,
        endTime: null,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        averageFailoverTime: 0,
        averageLatency: 0,
        successRate: 0
      }
    };
    this.activeCoordinators = new Map();
    this.testMetrics = new Map();
  }

  async runAllTests() {
    console.log('🧪 Starting Multi-Region System Test Suite\n');

    this.testResults.overall.startTime = new Date();

    try {
      // Initialize test environment
      await this.initializeTestEnvironment();

      // Run test scenarios
      const scenarios = [
        TEST_SCENARIOS.BASIC_ROUTING,
        TEST_SCENARIOS.REGION_FAILURE,
        TEST_SCENARIOS.LATENCY_SPIKE,
        TEST_SCENARIOS.HIGH_LOAD,
        TEST_SCENARIOS.CONCURRENT_REQUESTS,
        TEST_SCENARIOS.STATE_CONFLICT
      ];

      for (const scenario of scenarios) {
        console.log(`\n🎯 Running test scenario: ${scenario.toUpperCase()}`);
        const result = await this.runTestScenario(scenario);
        this.testResults.scenarios.set(scenario, result);
        this.printScenarioResult(scenario, result);
      }

      // Calculate overall results
      this.calculateOverallResults();

      // Print comprehensive report
      this.printComprehensiveReport();

      return this.testResults;

    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      throw error;
    } finally {
      await this.cleanupTestEnvironment();
    }
  }

  async initializeTestEnvironment() {
    console.log('🔧 Initializing test environment...');

    // Initialize Redis test client
    this.redisClient = createClient(this.redis);
    await this.redisClient.connect();

    // Clear any existing test data
    await this.clearTestData();

    // Initialize coordinators for each region
    for (const regionId of TEST_CONFIG.regions) {
      const coordinator = new MultiRegionCoordinator(this.redis, regionId);
      await coordinator.initialize();
      this.activeCoordinators.set(regionId, coordinator);
    }

    console.log('✅ Test environment initialized');
  }

  async clearTestData() {
    try {
      const keys = await this.redisClient.keys('test:*');
      if (keys.length > 0) {
        await this.redisClient.del(keys);
        console.log(`🗑️ Cleared ${keys.length} test keys`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to clear test data:', error.message);
    }
  }

  async runTestScenario(scenario) {
    const startTime = performance.now();
    const scenarioResult = {
      scenario,
      startTime: new Date(),
      endTime: null,
      duration: 0,
      passed: false,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        failoverCount: 0,
        averageFailoverTime: 0,
        conflictsResolved: 0,
        coordinationEvents: 0
      },
      details: [],
      errors: []
    };

    try {
      switch (scenario) {
        case TEST_SCENARIOS.BASIC_ROUTING:
          await this.testBasicRouting(scenarioResult);
          break;
        case TEST_SCENARIOS.REGION_FAILURE:
          await this.testRegionFailure(scenarioResult);
          break;
        case TEST_SCENARIOS.LATENCY_SPIKE:
          await this.testLatencySpike(scenarioResult);
          break;
        case TEST_SCENARIOS.HIGH_LOAD:
          await this.testHighLoad(scenarioResult);
          break;
        case TEST_SCENARIOS.CONCURRENT_REQUESTS:
          await this.testConcurrentRequests(scenarioResult);
          break;
        case TEST_SCENARIOS.STATE_CONFLICT:
          await this.testStateConflict(scenarioResult);
          break;
        default:
          throw new Error(`Unknown test scenario: ${scenario}`);
      }

      scenarioResult.endTime = new Date();
      scenarioResult.duration = performance.now() - startTime;

      // Evaluate scenario success
      scenarioResult.passed = this.evaluateScenarioSuccess(scenario, scenarioResult);

    } catch (error) {
      scenarioResult.errors.push(error.message);
      scenarioResult.endTime = new Date();
      scenarioResult.duration = performance.now() - startTime;
      console.error(`❌ Test scenario ${scenario} failed:`, error.message);
    }

    return scenarioResult;
  }

  async testBasicRouting(result) {
    console.log('  📍 Testing basic geographic routing...');

    const testRequests = [
      {
        clientInfo: { coordinates: { lat: 40.71, lon: -74.01 } }, // New York
        expectedRegion: 'us-east'
      },
      {
        clientInfo: { coordinates: { lat: 51.51, lon: -0.13 } }, // London
        expectedRegion: 'eu-west'
      },
      {
        clientInfo: { coordinates: { lat: 35.68, lon: 139.69 } }, // Tokyo
        expectedRegion: 'asia-pacific'
      },
      {
        clientInfo: { coordinates: { lat: 37.77, lon: -122.42 } }, // San Francisco
        expectedRegion: 'us-west'
      }
    ];

    for (const test of testRequests) {
      const startTime = performance.now();

      try {
        // Get coordinator for a region
        const coordinator = this.activeCoordinators.get('us-east');
        const routingDecision = await coordinator.routingEngine.routeRequest({
          clientInfo: test.clientInfo,
          requestType: 'read',
          priority: 'normal'
        });

        const latency = performance.now() - startTime;

        result.metrics.totalRequests++;
        result.metrics.successfulRequests++;
        result.metrics.averageLatency = (result.metrics.averageLatency * (result.metrics.successfulRequests - 1) + latency) / result.metrics.successfulRequests;

        result.details.push({
          test: 'basic_routing',
          clientLocation: test.clientInfo,
          selectedRegion: routingDecision.primaryRegion,
          expectedRegion: test.expectedRegion,
          latency,
          success: true
        });

        console.log(`    ✅ ${test.clientInfo.coordinates.lat}, ${test.clientInfo.coordinates.lon} → ${routingDecision.primaryRegion} (${latency.toFixed(2)}ms)`);

      } catch (error) {
        result.metrics.totalRequests++;
        result.metrics.failedRequests++;
        result.errors.push(`Basic routing failed: ${error.message}`);

        result.details.push({
          test: 'basic_routing',
          clientLocation: test.clientInfo,
          error: error.message,
          success: false
        });
      }
    }
  }

  async testRegionFailure(result) {
    console.log('  🚨 Testing region failure and failover...');

    const coordinator = this.activeCoordinators.get('us-east');

    // Simulate region failure
    const failedRegion = 'us-west';
    console.log(`    💥 Simulating failure in ${failedRegion}...`);

    // Mark region as unhealthy
    const topologyManager = coordinator.topologyManager;
    await topologyManager.updateRegionHealth(failedRegion, {
      status: 'unhealthy',
      latency: 9999,
      metrics: { load: 100, connectionsActive: 0, throughput: 0, errorRate: 1.0 }
    });

    // Test routing after failure
    const testRequests = 10;
    const failoverTimes = [];

    for (let i = 0; i < testRequests; i++) {
      const startTime = performance.now();

      try {
        const routingDecision = await coordinator.routingEngine.routeRequest({
          clientInfo: { coordinates: { lat: 34.05, lon: -118.24 } }, // Los Angeles
          requestType: 'read',
          priority: 'normal'
        });

        const latency = performance.now() - startTime;

        result.metrics.totalRequests++;
        result.metrics.successfulRequests++;
        result.metrics.averageLatency = (result.metrics.averageLatency * (result.metrics.successfulRequests - 1) + latency) / result.metrics.successfulRequests;

        if (routingDecision.primaryRegion !== failedRegion) {
          failoverTimes.push(latency);
          result.metrics.failoverCount++;
        }

        result.details.push({
          test: 'region_failure',
          attempt: i + 1,
          selectedRegion: routingDecision.primaryRegion,
          failedRegion,
          latency,
          success: true
        });

      } catch (error) {
        result.metrics.totalRequests++;
        result.metrics.failedRequests++;
        result.errors.push(`Region failure test failed: ${error.message}`);
      }
    }

    if (failoverTimes.length > 0) {
      result.metrics.averageFailoverTime = failoverTimes.reduce((a, b) => a + b, 0) / failoverTimes.length;
      console.log(`    📊 Average failover time: ${result.metrics.averageFailoverTime.toFixed(2)}ms`);
    }

    // Restore region health
    await topologyManager.updateRegionHealth(failedRegion, {
      status: 'healthy',
      latency: 100,
      metrics: { load: 30, connectionsActive: 50, throughput: 500, errorRate: 0.01 }
    });
  }

  async testLatencySpike(result) {
    console.log('  📈 Testing latency spike handling...');

    const coordinator = this.activeCoordinators.get('us-east');
    const affectedRegion = 'eu-west';

    // Simulate latency spike
    console.log(`    ⚡ Simulating latency spike in ${affectedRegion}...`);

    // Update latency matrix to simulate spike
    await coordinator.routingEngine.updateLatencyMetrics('us-east', affectedRegion, 800);

    // Test routing adaptation
    const testRequests = 20;
    const latencies = [];

    for (let i = 0; i < testRequests; i++) {
      const startTime = performance.now();

      try {
        const routingDecision = await coordinator.routingEngine.routeRequest({
          clientInfo: { coordinates: { lat: 48.86, lon: 2.35 } }, // Paris
          requestType: 'read',
          priority: 'normal'
        });

        const latency = performance.now() - startTime;
        latencies.push(latency);

        result.metrics.totalRequests++;
        result.metrics.successfulRequests++;

        result.details.push({
          test: 'latency_spike',
          attempt: i + 1,
          selectedRegion: routingDecision.primaryRegion,
          latency,
          estimatedLatency: routingDecision.estimatedLatency,
          success: true
        });

      } catch (error) {
        result.metrics.totalRequests++;
        result.metrics.failedRequests++;
        result.errors.push(`Latency spike test failed: ${error.message}`);
      }
    }

    if (latencies.length > 0) {
      result.metrics.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      console.log(`    📊 Average latency during spike: ${result.metrics.averageLatency.toFixed(2)}ms`);
    }

    // Restore normal latency
    await coordinator.routingEngine.updateLatencyMetrics('us-east', affectedRegion, 150);
  }

  async testHighLoad(result) {
    console.log('  🔥 Testing high load conditions...');

    const coordinator = this.activeCoordinators.get('us-east');
    const requestsPerSecond = TEST_CONFIG.requestsPerSecond;
    const testDuration = 10000; // 10 seconds
    const totalRequests = (requestsPerSecond * testDuration) / 1000;

    console.log(`    ⚡ Generating ${totalRequests} requests over ${testDuration}ms...`);

    const startTime = Date.now();
    const promises = [];
    const requestInterval = 1000 / requestsPerSecond;

    for (let i = 0; i < totalRequests; i++) {
      const requestTime = startTime + (i * requestInterval);
      const delay = Math.max(0, requestTime - Date.now());

      promises.push(
        new Promise(async (resolve) => {
          if (delay > 0) await new Promise(r => setTimeout(r, delay));

          const reqStart = performance.now();
          try {
            const routingDecision = await coordinator.routingEngine.routeRequest({
              clientInfo: { coordinates: { lat: 40.71, lon: -74.01 } },
              requestType: 'read',
              priority: 'normal'
            });

            const latency = performance.now() - reqStart;

            resolve({
              success: true,
              latency,
              region: routingDecision.primaryRegion,
              timestamp: Date.now()
            });

          } catch (error) {
            resolve({
              success: false,
              error: error.message,
              timestamp: Date.now()
            });
          }
        })
      );
    }

    const responses = await Promise.all(promises);

    // Process results
    const successfulResponses = responses.filter(r => r.success);
    const failedResponses = responses.filter(r => !r.success);
    const latencies = successfulResponses.map(r => r.latency);

    result.metrics.totalRequests = responses.length;
    result.metrics.successfulRequests = successfulResponses.length;
    result.metrics.failedRequests = failedResponses.length;
    result.metrics.averageLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    console.log(`    📊 Load test results: ${successfulResponses.length}/${responses.length} successful, avg latency: ${result.metrics.averageLatency.toFixed(2)}ms`);
  }

  async testConcurrentRequests(result) {
    console.log('  🔄 Testing concurrent request handling...');

    const coordinator = this.activeCoordinators.get('us-east');
    const concurrencyLevel = TEST_CONFIG.concurrencyLevel;
    const requestsPerWorker = 10;

    console.log(`    ⚡ Launching ${concurrencyLevel} concurrent workers, ${requestsPerWorker} requests each...`);

    const promises = [];

    for (let worker = 0; worker < concurrencyLevel; worker++) {
      promises.push(
        new Promise(async (resolve) => {
          const workerResults = [];

          for (let req = 0; req < requestsPerWorker; req++) {
            const startTime = performance.now();

            try {
              const routingDecision = await coordinator.routingEngine.routeRequest({
                clientInfo: {
                  coordinates: {
                    lat: 40.71 + (Math.random() - 0.5) * 10,
                    lon: -74.01 + (Math.random() - 0.5) * 10
                  }
                },
                requestType: 'read',
                priority: 'normal'
              });

              const latency = performance.now() - startTime;

              workerResults.push({
                success: true,
                latency,
                region: routingDecision.primaryRegion,
                worker,
                request: req
              });

            } catch (error) {
              workerResults.push({
                success: false,
                error: error.message,
                worker,
                request: req
              });
            }
          }

          resolve(workerResults);
        })
      );
    }

    const allResults = await Promise.all(promises).then(results => results.flat());

    // Process results
    const successfulResults = allResults.filter(r => r.success);
    const failedResults = allResults.filter(r => !r.success);
    const latencies = successfulResults.map(r => r.latency);

    result.metrics.totalRequests = allResults.length;
    result.metrics.successfulRequests = successfulResults.length;
    result.metrics.failedRequests = failedResults.length;
    result.metrics.averageLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    // Analyze concurrency performance
    const workerPerformance = {};
    for (let worker = 0; worker < concurrencyLevel; worker++) {
      const workerResults = allResults.filter(r => r.worker === worker);
      const workerSuccess = workerResults.filter(r => r.success);
      workerPerformance[worker] = {
        total: workerResults.length,
        successful: workerSuccess.length,
        avgLatency: workerSuccess.length > 0 ? workerSuccess.reduce((sum, r) => sum + r.latency, 0) / workerSuccess.length : 0
      };
    }

    console.log(`    📊 Concurrency test: ${successfulResults.length}/${allResults.length} successful, avg latency: ${result.metrics.averageLatency.toFixed(2)}ms`);
  }

  async testStateConflict(result) {
    console.log('  ⚔️ Testing state conflict resolution...');

    const coordinator = this.activeCoordinators.get('us-east');
    const stateSync = coordinator.stateSync;

    // Create conflicting state updates
    const testKey = 'test_conflict_key';
    const conflictingValues = [
      { value: 'value_from_us_east', region: 'us-east' },
      { value: 'value_from_eu_west', region: 'eu-west' },
      { value: 'value_from_asia_pacific', region: 'asia-pacific' }
    ];

    console.log(`    🔥 Creating conflicts for key: ${testKey}`);

    // Simulate conflicting updates from different regions
    for (const conflict of conflictingValues) {
      try {
        await stateSync.updateState(testKey, conflict.value, {
          sourceRegion: conflict.region,
          conflict: true
        });

        result.details.push({
          test: 'state_conflict',
          action: 'update_state',
          region: conflict.region,
          value: conflict.value,
          success: true
        });

      } catch (error) {
        result.errors.push(`State conflict test failed for ${conflict.region}: ${error.message}`);
      }
    }

    // Check conflict resolution
    const finalState = stateSync.getState(testKey);
    const syncStatus = stateSync.getSyncStatus();

    result.metrics.conflictsResolved = syncStatus.conflictLog.filter(c => c.resolved).length;

    console.log(`    ✅ Conflicts resolved: ${result.metrics.conflictsResolved}`);

    result.details.push({
      test: 'state_conflict',
      action: 'resolution_check',
      finalState,
      conflictsResolved: result.metrics.conflictsResolved,
      syncStatus,
      success: true
    });
  }

  evaluateScenarioSuccess(scenario, result) {
    switch (scenario) {
      case TEST_SCENARIOS.BASIC_ROUTING:
        return result.metrics.successRate >= TEST_CONFIG.minSuccessRate &&
               result.metrics.averageLatency <= TEST_CONFIG.maxAcceptableLatency;

      case TEST_SCENARIOS.REGION_FAILURE:
        return result.metrics.failoverCount > 0 &&
               result.metrics.averageFailoverTime <= TEST_CONFIG.maxAcceptableFailoverTime &&
               result.metrics.successRate >= TEST_CONFIG.minSuccessRate;

      case TEST_SCENARIOS.LATENCY_SPIKE:
        return result.metrics.successRate >= TEST_CONFIG.minSuccessRate;

      case TEST_SCENARIOS.HIGH_LOAD:
        return result.metrics.successRate >= (TEST_CONFIG.minSuccessRate * 0.9); // Slightly lower threshold for high load

      case TEST_SCENARIOS.CONCURRENT_REQUESTS:
        return result.metrics.successRate >= TEST_CONFIG.minSuccessRate;

      case TEST_SCENARIOS.STATE_CONFLICT:
        return result.metrics.conflictsResolved > 0;

      default:
        return result.metrics.successRate >= TEST_CONFIG.minSuccessRate;
    }
  }

  calculateOverallResults() {
    this.testResults.overall.endTime = new Date();
    this.testResults.overall.totalTests = this.testResults.scenarios.size;
    this.testResults.overall.passedTests = Array.from(this.testResults.scenarios.values()).filter(r => r.passed).length;
    this.testResults.overall.failedTests = this.testResults.overall.totalTests - this.testResults.overall.passedTests;

    // Calculate aggregate metrics
    let totalRequests = 0;
    let totalSuccessful = 0;
    let totalLatency = 0;
    let totalFailoverTime = 0;
    let failoverCount = 0;

    for (const result of this.testResults.scenarios.values()) {
      totalRequests += result.metrics.totalRequests;
      totalSuccessful += result.metrics.successfulRequests;
      totalLatency += result.metrics.averageLatency * result.metrics.totalRequests;
      totalFailoverTime += result.metrics.averageFailoverTime * result.metrics.failoverCount;
      failoverCount += result.metrics.failoverCount;
    }

    this.testResults.overall.successRate = totalRequests > 0 ? totalSuccessful / totalRequests : 0;
    this.testResults.overall.averageLatency = totalRequests > 0 ? totalLatency / totalRequests : 0;
    this.testResults.overall.averageFailoverTime = failoverCount > 0 ? totalFailoverTime / failoverCount : 0;
  }

  printScenarioResult(scenario, result) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const duration = result.duration.toFixed(0);
    const successRate = ((result.metrics.successfulRequests / result.metrics.totalRequests) * 100).toFixed(1);

    console.log(`  ${status} ${scenario} (${duration}ms) - Success Rate: ${successRate}%`);

    if (result.metrics.failoverCount > 0) {
      console.log(`    🔄 Failovers: ${result.metrics.failoverCount}, Avg Time: ${result.metrics.averageFailoverTime.toFixed(2)}ms`);
    }

    if (result.metrics.conflictsResolved > 0) {
      console.log(`    ⚔️ Conflicts Resolved: ${result.metrics.conflictsResolved}`);
    }

    if (result.errors.length > 0) {
      console.log(`    ❌ Errors: ${result.errors.length}`);
      result.errors.slice(0, 3).forEach(error => console.log(`       - ${error}`));
    }
  }

  printComprehensiveReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 MULTI-REGION SYSTEM TEST REPORT');
    console.log('='.repeat(80));

    const { overall } = this.testResults;

    console.log(`\n🎯 OVERALL RESULTS:`);
    console.log(`   Total Tests: ${overall.totalTests}`);
    console.log(`   Passed: ${overall.passedTests} ✅`);
    console.log(`   Failed: ${overall.failedTests} ❌`);
    console.log(`   Success Rate: ${((overall.passedTests / overall.totalTests) * 100).toFixed(1)}%`);

    console.log(`\n📈 PERFORMANCE METRICS:`);
    console.log(`   Total Requests: ${this.testResults.scenarios.size > 0 ? Array.from(this.testResults.scenarios.values()).reduce((sum, r) => sum + r.metrics.totalRequests, 0) : 0}`);
    console.log(`   Overall Success Rate: ${(overall.successRate * 100).toFixed(1)}%`);
    console.log(`   Average Latency: ${overall.averageLatency.toFixed(2)}ms`);
    console.log(`   Average Failover Time: ${overall.averageFailoverTime.toFixed(2)}ms`);

    console.log(`\n📋 TEST SCENARIOS:`);
    for (const [scenario, result] of this.testResults.scenarios.entries()) {
      const status = result.passed ? '✅' : '❌';
      const successRate = ((result.metrics.successfulRequests / result.metrics.totalRequests) * 100).toFixed(1);
      console.log(`   ${status} ${scenario.replace(/_/g, ' ').toUpperCase()}: ${successRate}% success, ${result.metrics.averageLatency.toFixed(2)}ms avg latency`);
    }

    // Performance validation
    console.log(`\n🎯 PERFORMANCE VALIDATION:`);
    const latencyOk = overall.averageLatency <= TEST_CONFIG.maxAcceptableLatency;
    const failoverOk = overall.averageFailoverTime <= TEST_CONFIG.maxAcceptableFailoverTime || overall.averageFailoverTime === 0;
    const successRateOk = overall.successRate >= TEST_CONFIG.minSuccessRate;

    console.log(`   Latency <${TEST_CONFIG.maxAcceptableLatency}ms: ${latencyOk ? '✅' : '❌'} (${overall.averageLatency.toFixed(2)}ms)`);
    console.log(`   Failover <${TEST_CONFIG.maxAcceptableFailoverTime}ms: ${failoverOk ? '✅' : '❌'} (${overall.averageFailoverTime.toFixed(2)}ms)`);
    console.log(`   Success Rate ≥${(TEST_CONFIG.minSuccessRate * 100).toFixed(1)}%: ${successRateOk ? '✅' : '❌'} (${(overall.successRate * 100).toFixed(1)}%)`);

    const allPerformanceOk = latencyOk && failoverOk && successRateOk;
    console.log(`\n🏆 OVERALL STATUS: ${allPerformanceOk ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    console.log('\n' + '='.repeat(80));
  }

  async cleanupTestEnvironment() {
    console.log('\n🧹 Cleaning up test environment...');

    // Shutdown coordinators
    for (const [regionId, coordinator] of this.activeCoordinators.entries()) {
      try {
        await coordinator.shutdown();
        console.log(`  ✅ Shut down coordinator for ${regionId}`);
      } catch (error) {
        console.warn(`  ⚠️ Failed to shutdown coordinator for ${regionId}:`, error.message);
      }
    }

    // Close Redis connection
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log('✅ Test environment cleaned up');
  }
}

// Test runner for direct execution
async function runMultiRegionTests() {
  const redisConfig = {
    host: 'localhost',
    port: 6379,
    db: 0
  };

  const testSuite = new MultiRegionSystemTest(redisConfig);

  try {
    const results = await testSuite.runAllTests();

    if (results.overall.passedTests === results.overall.totalTests) {
      console.log('\n🎉 All multi-region tests passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed. See report above for details.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Test execution failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMultiRegionTests();
}

export { TEST_CONFIG, TEST_SCENARIOS };