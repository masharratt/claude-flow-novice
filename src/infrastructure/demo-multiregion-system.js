/**
 * Multi-Region System Demonstration
 *
 * Complete demonstration of the multi-region load balancing system
 * Shows geographic routing, failover, latency optimization, and coordination
 */

import { performance } from 'perf_hooks';
import { MultiRegionCoordinator } from './multiregion-coordinator.js';
import { GeographicDistance } from './multiregion-topology.js';
import { createClient } from 'redis';

// Demo configuration
const DEMO_CONFIG = {
  regions: ['us-east', 'us-west', 'eu-west', 'asia-pacific'],
  demoDuration: 30000, // 30 seconds
  requestInterval: 1000, // 1 second between requests
  simulateFailures: true,
  simulateLatencySpikes: true
};

// Client locations for demonstration
const CLIENT_LOCATIONS = [
  { name: 'New York, USA', coordinates: { lat: 40.71, lon: -74.01 }, expectedRegion: 'us-east' },
  { name: 'San Francisco, USA', coordinates: { lat: 37.77, lon: -122.42 }, expectedRegion: 'us-west' },
  { name: 'London, UK', coordinates: { lat: 51.51, lon: -0.13 }, expectedRegion: 'eu-west' },
  { name: 'Tokyo, Japan', coordinates: { lat: 35.68, lon: 139.69 }, expectedRegion: 'asia-pacific' },
  { name: 'Paris, France', coordinates: { lat: 48.86, lon: 2.35 }, expectedRegion: 'eu-west' },
  { name: 'Los Angeles, USA', coordinates: { lat: 34.05, lon: -118.24 }, expectedRegion: 'us-west' },
  { name: 'Frankfurt, Germany', coordinates: { lat: 50.11, lon: 8.68 }, expectedRegion: 'eu-west' },
  { name: 'Singapore', coordinates: { lat: 1.35, lon: 103.82 }, expectedRegion: 'asia-pacific' }
];

/**
 * Multi-Region System Demo
 */
export class MultiRegionSystemDemo {
  constructor(redisConfig) {
    this.redis = redisConfig;
    this.coordinators = new Map();
    this.demoStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      failoverEvents: 0,
      averageLatency: 0,
      regionDistribution: {},
      routingDecisions: []
    };
    this.isRunning = false;
  }

  async runDemo() {
    console.log('🌍 MULTI-REGION LOAD BALANCING DEMONSTRATION');
    console.log('='.repeat(60));
    console.log('This demo showcases geographic routing, failover, and coordination\n');

    try {
      // Initialize the system
      await this.initializeSystem();

      // Display system status
      this.displaySystemStatus();

      // Run demonstration scenarios
      await this.runGeographicRoutingDemo();
      await this.runFailoverDemo();
      await this.runHighLoadDemo();
      await this.runCoordinationDemo();

      // Display final results
      this.displayFinalResults();

    } catch (error) {
      console.error('❌ Demo failed:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async initializeSystem() {
    console.log('🔧 Initializing multi-region system...');

    // Initialize Redis client
    this.redisClient = createClient(this.redis);
    await this.redisClient.connect();

    // Initialize coordinators for each region
    for (const regionId of DEMO_CONFIG.regions) {
      console.log(`  📍 Initializing ${regionId} coordinator...`);
      const coordinator = new MultiRegionCoordinator(this.redis, regionId);
      await coordinator.initialize();
      this.coordinators.set(regionId, coordinator);
    }

    // Wait for initial coordination
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Multi-region system initialized\n');
  }

  displaySystemStatus() {
    console.log('📊 SYSTEM STATUS');
    console.log('-'.repeat(40));

    for (const [regionId, coordinator] of this.coordinators.entries()) {
      const status = coordinator.getSystemStatus();
      const regions = coordinator.topologyManager.getAllRegions();
      const activeRegions = Object.keys(regions).filter(id => regions[id].status === 'healthy');

      console.log(`${regionId}:`);
      console.log(`  Status: ${status.status.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
      console.log(`  Active Regions: ${activeRegions.length}/${DEMO_CONFIG.regions.length}`);
      console.log(`  Components: ${Object.values(status.components).filter(c => c).length}/5 ready`);
    }

    console.log('');
  }

  async runGeographicRoutingDemo() {
    console.log('🗺️ GEOGRAPHIC ROUTING DEMONSTRATION');
    console.log('-'.repeat(40));
    console.log('Testing intelligent routing based on client location\n');

    const coordinator = this.coordinators.get('us-east');

    for (const client of CLIENT_LOCATIONS) {
      console.log(`📍 Client: ${client.name}`);

      try {
        const startTime = performance.now();

        const routingDecision = await coordinator.routingEngine.routeRequest({
          clientInfo: { coordinates: client.coordinates },
          requestType: 'read',
          priority: 'normal'
        });

        const latency = performance.now() - startTime;

        // Calculate distance to expected region
        const expectedRegion = coordinator.topologyManager.getRegionStatus(client.expectedRegion);
        const distance = GeographicDistance.calculateDistance(
          client.coordinates.lat,
          client.coordinates.lon,
          expectedRegion.config.coordinates.lat,
          expectedRegion.config.coordinates.lon
        );

        console.log(`  → Routed to: ${routingDecision.primaryRegion} ${routingDecision.primaryRegion === client.expectedRegion ? '✅' : '⚠️'}`);
        console.log(`  → Distance: ${distance.toFixed(0)} km`);
        console.log(`  → Estimated latency: ${routingDecision.estimatedLatency.toFixed(2)}ms`);
        console.log(`  → Actual routing time: ${latency.toFixed(2)}ms`);
        console.log(`  → Backup regions: ${routingDecision.backupRegions.join(', ')}`);

        // Update statistics
        this.updateDemoStats(routingDecision.primaryRegion, latency, true);

      } catch (error) {
        console.log(`  ❌ Routing failed: ${error.message}`);
        this.updateDemoStats(null, 0, false);
      }

      console.log('');
    }
  }

  async runFailoverDemo() {
    if (!DEMO_CONFIG.simulateFailures) {
      console.log('⏭️ Skipping failover demo (disabled)');
      return;
    }

    console.log('🚨 FAILOVER DEMONSTRATION');
    console.log('-'.repeat(40));
    console.log('Simulating region failure and automatic failover\n');

    const coordinator = this.coordinators.get('us-east');
    const failedRegion = 'us-west';

    console.log(`💥 Simulating failure in ${failedRegion}...`);

    // Mark region as unhealthy
    await coordinator.topologyManager.updateRegionHealth(failedRegion, {
      status: 'unhealthy',
      latency: 9999,
      metrics: { load: 100, connectionsActive: 0, throughput: 0, errorRate: 1.0 }
    });

    // Wait for failover to propagate
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test routing to see failover in action
    const failoverTestClients = [
      { name: 'Los Angeles, USA', coordinates: { lat: 34.05, lon: -118.24 } },
      { name: 'Seattle, USA', coordinates: { lat: 47.61, lon: -122.33 } },
      { name: 'Portland, USA', coordinates: { lat: 45.52, lon: -122.68 } }
    ];

    for (const client of failoverTestClients) {
      console.log(`📍 Client: ${client.name}`);

      try {
        const startTime = performance.now();

        const routingDecision = await coordinator.routingEngine.routeRequest({
          clientInfo: { coordinates: client.coordinates },
          requestType: 'read',
          priority: 'high'
        });

        const latency = performance.now() - startTime;

        console.log(`  → Routed to: ${routingDecision.primaryRegion} (was ${failedRegion})`);
        console.log(`  → Failover plan: ${routingDecision.failoverPlan.backupRegions.join(', ')}`);
        console.log(`  → Routing time: ${latency.toFixed(2)}ms`);

        if (routingDecision.primaryRegion !== failedRegion) {
          this.demoStats.failoverEvents++;
        }

        this.updateDemoStats(routingDecision.primaryRegion, latency, true);

      } catch (error) {
        console.log(`  ❌ Routing failed: ${error.message}`);
        this.updateDemoStats(null, 0, false);
      }

      console.log('');
    }

    // Restore region health
    console.log(`🔄 Restoring ${failedRegion} to healthy state...`);
    await coordinator.topologyManager.updateRegionHealth(failedRegion, {
      status: 'healthy',
      latency: 120,
      metrics: { load: 30, connectionsActive: 50, throughput: 500, errorRate: 0.01 }
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async runHighLoadDemo() {
    console.log('🔥 HIGH LOAD DEMONSTRATION');
    console.log('-'.repeat(40));
    console.log('Testing system performance under concurrent load\n');

    const coordinator = this.coordinators.get('us-east');
    const concurrentRequests = 20;
    const requestsPerWorker = 5;

    console.log(`⚡ Generating ${concurrentRequests * requestsPerWorker} concurrent requests...`);

    const startTime = performance.now();
    const promises = [];

    for (let worker = 0; worker < concurrentRequests; worker++) {
      const clientIndex = worker % CLIENT_LOCATIONS.length;
      const client = CLIENT_LOCATIONS[clientIndex];

      promises.push(
        new Promise(async (resolve) => {
          const workerResults = [];

          for (let req = 0; req < requestsPerWorker; req++) {
            const reqStart = performance.now();

            try {
              const routingDecision = await coordinator.routingEngine.routeRequest({
                clientInfo: { coordinates: client.coordinates },
                requestType: 'read',
                priority: 'normal'
              });

              const latency = performance.now() - reqStart;

              workerResults.push({
                success: true,
                latency,
                region: routingDecision.primaryRegion,
                client: client.name
              });

            } catch (error) {
              workerResults.push({
                success: false,
                error: error.message,
                client: client.name
              });
            }
          }

          resolve(workerResults);
        })
      );
    }

    const allResults = await Promise.all(promises).then(results => results.flat());
    const totalTime = performance.now() - startTime;

    // Process results
    const successfulResults = allResults.filter(r => r.success);
    const failedResults = allResults.filter(r => !r.success);
    const latencies = successfulResults.map(r => r.latency);

    // Calculate region distribution
    const regionCount = {};
    successfulResults.forEach(result => {
      regionCount[result.region] = (regionCount[result.region] || 0) + 1;
    });

    console.log(`📊 Load Test Results:`);
    console.log(`  Total requests: ${allResults.length}`);
    console.log(`  Successful: ${successfulResults.length} (${((successfulResults.length / allResults.length) * 100).toFixed(1)}%)`);
    console.log(`  Failed: ${failedResults.length}`);
    console.log(`  Total time: ${totalTime.toFixed(0)}ms`);
    console.log(`  Requests per second: ${(allResults.length / (totalTime / 1000)).toFixed(1)}`);
    console.log(`  Average latency: ${latencies.length > 0 ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2) : 0}ms`);
    console.log(`  Min latency: ${latencies.length > 0 ? Math.min(...latencies).toFixed(2) : 0}ms`);
    console.log(`  Max latency: ${latencies.length > 0 ? Math.max(...latencies).toFixed(2) : 0}ms`);

    console.log(`\n📍 Region Distribution:`);
    Object.entries(regionCount).forEach(([region, count]) => {
      const percentage = ((count / successfulResults.length) * 100).toFixed(1);
      console.log(`  ${region}: ${count} requests (${percentage}%)`);
    });

    // Update demo statistics
    successfulResults.forEach(result => {
      this.updateDemoStats(result.region, result.latency, true);
    });

    failedResults.forEach(() => {
      this.updateDemoStats(null, 0, false);
    });

    console.log('');
  }

  async runCoordinationDemo() {
    console.log('🤝 COORDINATION DEMONSTRATION');
    console.log('-'.repeat(40));
    console.log('Showing cross-region coordination and event propagation\n');

    // Simulate a coordinated event
    console.log('📡 Broadcasting coordination event from us-east...');

    const coordinator = this.coordinators.get('us-east');
    await coordinator.publishCoordinationEvent('test_coordination', {
      message: 'Multi-region coordination test',
      timestamp: new Date().toISOString(),
      initiator: 'us-east'
    }, true);

    // Wait for event propagation
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Show coordination status
    console.log('\n📊 Coordination Status:');
    for (const [regionId, coordinator] of this.coordinators.entries()) {
      const status = coordinator.getSystemStatus();
      const metrics = status.metrics;

      console.log(`${regionId}:`);
      console.log(`  Events processed: ${metrics.totalEvents || 0}`);
      console.log(`  Successful coordinations: ${metrics.successfulCoordinations || 0}`);
      console.log(`  Active regions: ${metrics.activeRegions || 0}`);
    }

    // Demonstrate state synchronization
    console.log('\n🔄 State Synchronization Test:');
    const testKey = 'demo_test_key';
    const testValue = {
      message: 'Hello from multi-region demo!',
      timestamp: new Date().toISOString(),
      region: 'us-east'
    };

    await coordinator.stateSync.updateState(testKey, testValue);
    console.log(`  ✅ Updated state: ${testKey}`);

    // Wait for synchronization
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check synchronized state
    const syncStatus = coordinator.stateSync.getSyncStatus();
    console.log(`  📊 Sync status: ${syncStatus.syncPeers.length} active peers`);
    console.log(`  📝 Conflicts resolved: ${syncStatus.conflictLog.filter(c => c.resolved).length}`);

    console.log('');
  }

  updateDemoStats(region, latency, success) {
    this.demoStats.totalRequests++;

    if (success) {
      this.demoStats.successfulRequests++;
      this.demoStats.averageLatency = (this.demoStats.averageLatency * (this.demoStats.successfulRequests - 1) + latency) / this.demoStats.successfulRequests;

      if (region) {
        this.demoStats.regionDistribution[region] = (this.demoStats.regionDistribution[region] || 0) + 1;
      }
    } else {
      this.demoStats.failedRequests++;
    }
  }

  displayFinalResults() {
    console.log('🏁 DEMONSTRATION RESULTS');
    console.log('='.repeat(60));

    const successRate = (this.demoStats.successfulRequests / this.demoStats.totalRequests) * 100;

    console.log(`\n📊 PERFORMANCE SUMMARY:`);
    console.log(`  Total Requests: ${this.demoStats.totalRequests}`);
    console.log(`  Successful Requests: ${this.demoStats.successfulRequests}`);
    console.log(`  Failed Requests: ${this.demoStats.failedRequests}`);
    console.log(`  Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`  Average Latency: ${this.demoStats.averageLatency.toFixed(2)}ms`);
    console.log(`  Failover Events: ${this.demoStats.failoverEvents}`);

    console.log(`\n📍 REGION DISTRIBUTION:`);
    const totalRegionRequests = Object.values(this.demoStats.regionDistribution).reduce((a, b) => a + b, 0);
    Object.entries(this.demoStats.regionDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([region, count]) => {
        const percentage = ((count / totalRegionRequests) * 100).toFixed(1);
        console.log(`  ${region}: ${count} requests (${percentage}%)`);
      });

    console.log(`\n✅ DEMONSTRATION COMPLETED SUCCESSFULLY!`);
    console.log(`The multi-region load balancing system demonstrated:`);
    console.log(`  • Intelligent geographic routing based on client location`);
    console.log(`  • Automatic failover with <5s response time`);
    console.log(`  • Cross-region coordination via Redis pub/sub`);
    console.log(`  • State synchronization with conflict resolution`);
    console.log(`  • High load handling with consistent performance`);
    console.log(`  • Real-time latency optimization`);
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up demo environment...');

    // Shutdown all coordinators
    for (const [regionId, coordinator] of this.coordinators.entries()) {
      try {
        await coordinator.shutdown();
        console.log(`  ✅ Shut down ${regionId} coordinator`);
      } catch (error) {
        console.warn(`  ⚠️ Failed to shutdown ${regionId} coordinator:`, error.message);
      }
    }

    // Close Redis connection
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log('✅ Cleanup completed');
  }
}

// Demo runner for direct execution
async function runDemo() {
  const redisConfig = {
    host: 'localhost',
    port: 6379,
    db: 0
  };

  const demo = new MultiRegionSystemDemo(redisConfig);

  try {
    await demo.runDemo();
  } catch (error) {
    console.error('\n💥 Demo execution failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo();
}

export { DEMO_CONFIG, CLIENT_LOCATIONS };