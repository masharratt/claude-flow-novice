/**
 * Fleet Manager Load Test - 1000+ Agents
 *
 * Validates:
 * - Fleet Manager can spawn and coordinate 1000+ agents
 * - Agent allocation latency <100ms
 * - Auto-scaling behavior under load
 * - Resource cleanup and efficiency
 * - Redis coordination at scale
 */

const { performance } = require('perf_hooks');
const { FleetCommanderAgent } = require('../../src/fleet/FleetCommanderAgent.js');
const { AutoScalingManager } = require('../../src/fleet/AutoScalingManager.js');
const { createClient } = require('redis');

describe('Fleet Manager 1000+ Agent Load Test', () => {
  let fleetCommander;
  let autoScalingManager;
  let redisClient;
  let testResults;

  beforeAll(async () => {
    // Initialize Redis connection
    redisClient = createClient({ host: 'localhost', port: 6379 });
    await redisClient.connect().catch(() => {
      console.log('⚠️ Redis not available - tests will use in-memory fallback');
    });

    testResults = {
      fleetScaling: {},
      allocationLatency: [],
      throughput: {},
      resourceUsage: {},
      confidence: 0
    };
  });

  afterAll(async () => {
    if (fleetCommander) await fleetCommander.shutdown();
    if (autoScalingManager) await autoScalingManager.shutdown();
    if (redisClient) await redisClient.quit();
  });

  describe('1000 Agent Spawning and Coordination', () => {
    it('should spawn 1000 agents with <100ms average allocation latency', async () => {
      const startTime = performance.now();

      // Initialize fleet commander with high capacity
      fleetCommander = new FleetCommanderAgent({
        swarmId: 'load-test-1000-agents',
        maxAgents: 1500,
        redis: { host: 'localhost', port: 6379 }
      });

      await fleetCommander.initialize();

      const spawnTimes = [];
      const agents = [];
      const targetAgentCount = 1000;

      // Spawn agents in batches for realistic load simulation
      const batchSize = 50;
      const batches = Math.ceil(targetAgentCount / batchSize);

      for (let batch = 0; batch < batches; batch++) {
        const batchStartTime = performance.now();
        const batchPromises = [];

        for (let i = 0; i < batchSize; i++) {
          const agentIndex = batch * batchSize + i;
          if (agentIndex >= targetAgentCount) break;

          const agentType = ['coder', 'tester', 'reviewer', 'analyst', 'optimizer'][agentIndex % 5];

          const spawnStart = performance.now();
          const promise = fleetCommander.registerAgent({
            type: agentType,
            priority: 5,
            capabilities: fleetCommander.getDefaultCapabilities(agentType),
            resources: { memory: 256, cpu: 0.3 }
          }).then(agentId => {
            const spawnEnd = performance.now();
            spawnTimes.push(spawnEnd - spawnStart);
            agents.push({ id: agentId, type: agentType });
            return agentId;
          });

          batchPromises.push(promise);
        }

        await Promise.all(batchPromises);

        const batchEndTime = performance.now();
        const batchDuration = batchEndTime - batchStartTime;

        console.log(`✅ Batch ${batch + 1}/${batches} completed in ${batchDuration.toFixed(2)}ms`);
      }

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      // Calculate metrics
      const averageSpawnTime = spawnTimes.reduce((a, b) => a + b, 0) / spawnTimes.length;
      const p95SpawnTime = spawnTimes.sort((a, b) => a - b)[Math.floor(spawnTimes.length * 0.95)];
      const p99SpawnTime = spawnTimes.sort((a, b) => a - b)[Math.floor(spawnTimes.length * 0.99)];

      testResults.fleetScaling = {
        totalAgents: agents.length,
        totalDuration: totalDuration,
        averageSpawnTime,
        p95SpawnTime,
        p99SpawnTime,
        throughput: (agents.length / totalDuration) * 1000 // agents/second
      };

      // Get fleet status
      const fleetStatus = await fleetCommander.getFleetStatus();

      console.log('\n📊 Fleet Scaling Results:');
      console.log(`  Total Agents: ${agents.length}`);
      console.log(`  Total Duration: ${totalDuration.toFixed(2)}ms`);
      console.log(`  Average Spawn Time: ${averageSpawnTime.toFixed(2)}ms`);
      console.log(`  P95 Spawn Time: ${p95SpawnTime.toFixed(2)}ms`);
      console.log(`  P99 Spawn Time: ${p99SpawnTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${testResults.fleetScaling.throughput.toFixed(2)} agents/sec`);
      console.log(`  Fleet Status: ${fleetStatus.agents.total} total, ${fleetStatus.agents.active} active`);

      // Assertions
      expect(agents.length).toBe(targetAgentCount);
      expect(averageSpawnTime).toBeLessThan(100); // <100ms target
      expect(p95SpawnTime).toBeLessThan(200); // P95 <200ms
      expect(fleetStatus.agents.total).toBeGreaterThanOrEqual(targetAgentCount);

      // Calculate confidence score
      const latencyScore = averageSpawnTime < 100 ? 1.0 : (100 / averageSpawnTime);
      const completionScore = agents.length === targetAgentCount ? 1.0 : 0.8;
      testResults.confidence = (latencyScore + completionScore) / 2;

      expect(testResults.confidence).toBeGreaterThanOrEqual(0.75);
    }, 300000); // 5 minute timeout
  });

  describe('Agent Allocation Performance', () => {
    it('should allocate agents with <100ms latency under load', async () => {
      const allocationCount = 100;
      const allocationLatencies = [];

      for (let i = 0; i < allocationCount; i++) {
        const startTime = performance.now();

        try {
          const allocation = await fleetCommander.allocateAgent({
            taskId: `task-${i}`,
            type: 'coder',
            priority: 5,
            resources: { memory: 256, cpu: 0.3 }
          });

          const endTime = performance.now();
          const latency = endTime - startTime;
          allocationLatencies.push(latency);

          // Release agent immediately for next allocation
          await fleetCommander.releaseAgent(allocation.agentId, { success: true, duration: 100 });
        } catch (error) {
          console.warn(`Allocation ${i} failed:`, error.message);
        }
      }

      const averageLatency = allocationLatencies.reduce((a, b) => a + b, 0) / allocationLatencies.length;
      const maxLatency = Math.max(...allocationLatencies);
      const minLatency = Math.min(...allocationLatencies);

      testResults.allocationLatency = {
        count: allocationCount,
        average: averageLatency,
        min: minLatency,
        max: maxLatency
      };

      console.log('\n📊 Allocation Latency Results:');
      console.log(`  Allocations: ${allocationCount}`);
      console.log(`  Average Latency: ${averageLatency.toFixed(2)}ms`);
      console.log(`  Min Latency: ${minLatency.toFixed(2)}ms`);
      console.log(`  Max Latency: ${maxLatency.toFixed(2)}ms`);

      expect(averageLatency).toBeLessThan(100);
      expect(maxLatency).toBeLessThan(500); // No allocation should take >500ms
    }, 120000);
  });

  describe('Auto-Scaling Behavior', () => {
    it('should auto-scale based on load with predictive algorithms', async () => {
      autoScalingManager = new AutoScalingManager({
        redis: { host: 'localhost', port: 6379 },
        limits: {
          minAgents: 10,
          maxAgents: 1500,
          maxScaleUpStep: 100
        }
      });

      await autoScalingManager.initialize();

      // Simulate load increase
      const loadSimulationStart = performance.now();

      // Inject high load metrics
      await redisClient.hSet('system:metrics', {
        avgResponseTime: '5000',
        cpuUtilization: '0.85',
        memoryUtilization: '0.80',
        queueLength: '150',
        throughput: '100'
      });

      // Wait for auto-scaling evaluation
      await new Promise(resolve => setTimeout(resolve, 65000)); // Wait for evaluation cycle

      const status = await autoScalingManager.getAutoScalingStatus();
      const loadSimulationEnd = performance.now();

      testResults.autoScaling = {
        initialAgents: status.agentCounts.min,
        finalAgents: status.agentCounts.current,
        scaleUps: status.metrics.scaling.totalScaleUps,
        scaleDowns: status.metrics.scaling.totalScaleDowns,
        duration: loadSimulationEnd - loadSimulationStart
      };

      console.log('\n📊 Auto-Scaling Results:');
      console.log(`  Initial Agents: ${testResults.autoScaling.initialAgents}`);
      console.log(`  Final Agents: ${testResults.autoScaling.finalAgents}`);
      console.log(`  Scale-Ups: ${testResults.autoScaling.scaleUps}`);
      console.log(`  Scale-Downs: ${testResults.autoScaling.scaleDowns}`);

      // Verify auto-scaling responded to load
      expect(status.metrics.scaling.totalScaleUps).toBeGreaterThan(0);
      expect(status.agentCounts.current).toBeGreaterThan(status.agentCounts.min);
    }, 120000);
  });

  describe('Resource Cleanup and Efficiency', () => {
    it('should cleanup resources efficiently when scaling down', async () => {
      const initialStatus = await fleetCommander.getFleetStatus();
      const initialAgentCount = initialStatus.agents.total;

      // Simulate low load for scale-down
      await redisClient.hSet('system:metrics', {
        avgResponseTime: '500',
        cpuUtilization: '0.20',
        memoryUtilization: '0.30',
        queueLength: '5',
        throughput: '10'
      });

      // Wait for scale-down evaluation
      await new Promise(resolve => setTimeout(resolve, 125000)); // Wait for cooldown + evaluation

      const finalStatus = await fleetCommander.getFleetStatus();
      const finalAgentCount = finalStatus.agents.total;

      testResults.resourceCleanup = {
        initialAgents: initialAgentCount,
        finalAgents: finalAgentCount,
        cleaned: initialAgentCount - finalAgentCount,
        efficiency: ((initialAgentCount - finalAgentCount) / initialAgentCount) * 100
      };

      console.log('\n📊 Resource Cleanup Results:');
      console.log(`  Initial Agents: ${initialAgentCount}`);
      console.log(`  Final Agents: ${finalAgentCount}`);
      console.log(`  Cleaned: ${testResults.resourceCleanup.cleaned}`);
      console.log(`  Efficiency: ${testResults.resourceCleanup.efficiency.toFixed(2)}%`);

      // Verify cleanup occurred
      expect(finalAgentCount).toBeLessThan(initialAgentCount);
    }, 180000);
  });

  describe('Performance Validation Summary', () => {
    it('should generate comprehensive performance report', async () => {
      const report = {
        timestamp: new Date().toISOString(),
        testSuite: 'Fleet Manager 1000+ Agent Load Test',
        results: testResults,
        validation: {
          fleetScaling: testResults.fleetScaling?.averageSpawnTime < 100,
          allocationLatency: testResults.allocationLatency?.average < 100,
          autoScaling: testResults.autoScaling?.scaleUps > 0,
          resourceCleanup: testResults.resourceCleanup?.cleaned > 0
        },
        overallConfidence: testResults.confidence,
        status: testResults.confidence >= 0.75 ? 'PASS' : 'FAIL'
      };

      console.log('\n📋 Performance Test Summary:');
      console.log(JSON.stringify(report, null, 2));

      // Write report to file
      const fs = require('fs-extra');
      await fs.writeJSON(
        '/mnt/c/Users/masha/Documents/claude-flow-novice/tests/performance/fleet-1000-agents-report.json',
        report,
        { spaces: 2 }
      );

      expect(report.status).toBe('PASS');
      expect(report.overallConfidence).toBeGreaterThanOrEqual(0.75);
    });
  });
});
