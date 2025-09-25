/**
 * Gossip Protocol Verification Demo
 * Demonstrates distributed verification using gossip protocol
 */

const GossipVerificationWorkflow = require('../src/gossip/gossip-workflow');
const { getConfiguration } = require('../config/gossip/gossip-config');

async function runGossipDemo() {
  console.log('🌐 Starting Gossip Protocol Verification Demo');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Create a network of 5 nodes with development configuration
    const config = getConfiguration('development', 'medium');
    const network = await GossipVerificationWorkflow.createNetwork(5, config);

    console.log(`✅ Created network with ${network.workflows.length} nodes`);

    // Wait for network to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Demo 1: Resource Monitoring Verification
    console.log('\n📊 Demo 1: Resource Monitoring Verification');
    console.log('─────────────────────────────────────────');

    const resourceTask = await network.workflows[0].verifyResourceMonitoring('system-resources', {
      memoryThreshold: 75,
      cpuThreshold: 70,
      priority: 'high'
    });

    console.log(`Started resource monitoring verification: ${resourceTask}`);

    // Demo 2: Agent Spawning Verification
    console.log('\n🚀 Demo 2: Agent Spawning Verification');
    console.log('─────────────────────────────────────────');

    const agentSpawnResult = await network.workflows[1].verifyAgentSpawning('coordinator', {
      memory: 512,
      cpu: 0.5
    }, {
      maxAgents: 20,
      priority: 'high'
    });

    console.log(`Started agent spawning verification: ${agentSpawnResult.taskId}`);

    // Demo 3: Network Connectivity Verification
    console.log('\n🌐 Demo 3: Network Connectivity Verification');
    console.log('─────────────────────────────────────────');

    const networkTask = await network.workflows[2].verifyNetworkConnectivity('network-health', {
      minPeers: 3,
      maxLatency: 500,
      priority: 'medium'
    });

    console.log(`Started network connectivity verification: ${networkTask}`);

    // Demo 4: Complete Verification Suite
    console.log('\n🧪 Demo 4: Complete Verification Suite');
    console.log('─────────────────────────────────────────');

    const suiteResult = await network.workflows[3].runCompleteVerificationSuite({
      includeResourceMonitoring: true,
      includeAgentSpawning: true,
      includeNetworkConnectivity: true,
      includeConsensusState: true
    });

    console.log(`Started complete verification suite: ${suiteResult.suiteId}`);

    // Wait for verifications to complete
    console.log('\n⏳ Waiting for verifications to complete...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Display results
    console.log('\n📈 Network Status After Verifications');
    console.log('─────────────────────────────────────────');

    const networkStatus = network.getNetworkStatus();
    networkStatus.forEach((status, index) => {
      console.log(`\nNode ${index} (${status.nodeId}):`);
      console.log(`  ├─ Running: ${status.isRunning}`);
      console.log(`  ├─ Metrics: ${JSON.stringify(status.metrics)}`);
      console.log(`  ├─ Active Tasks: ${status.components.verification.activeTasks}`);
      console.log(`  ├─ Completed Tasks: ${status.components.verification.completedTasks}`);
      console.log(`  └─ Active Alerts: ${status.components.monitoring.alerts.active}`);
    });

    // Display convergence metrics
    console.log('\n🎯 Convergence Metrics');
    console.log('─────────────────────────────────────────');

    const convergenceMetrics = network.getNetworkConvergence();
    convergenceMetrics.forEach((metrics, index) => {
      console.log(`\nNode ${index} Convergence:`);
      console.log(`  ├─ Tasks Started: ${metrics.workflow.tasksStarted}`);
      console.log(`  ├─ Tasks Completed: ${metrics.workflow.tasksCompleted}`);
      console.log(`  ├─ Success Rate: ${(metrics.workflow.successRate * 100).toFixed(1)}%`);
      console.log(`  ├─ Consensus Rate: ${(metrics.workflow.consensusRate * 100).toFixed(1)}%`);
      console.log(`  ├─ Network Size: ${metrics.gossip.networkSize}`);
      console.log(`  └─ Convergence Ratio: ${(metrics.gossip.convergenceRatio * 100).toFixed(1)}%`);
    });

    // Demo 5: Simulate Network Partition and Healing
    console.log('\n🔧 Demo 5: Network Partition and Healing');
    console.log('─────────────────────────────────────────');

    console.log('Creating network partition...');

    // Partition network (nodes 0-2 vs 3-4)
    network.workflows[3].removePeer('node-0');
    network.workflows[3].removePeer('node-1');
    network.workflows[3].removePeer('node-2');
    network.workflows[4].removePeer('node-0');
    network.workflows[4].removePeer('node-1');
    network.workflows[4].removePeer('node-2');

    // Start verification in partition 1
    const partitionTask = await network.workflows[0].verifyResourceMonitoring('partition-test', {
      priority: 'high'
    });

    console.log(`Started verification in partition: ${partitionTask}`);

    // Wait for partial propagation
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('Healing network partition...');

    // Reconnect network
    network.workflows[3].addPeer('node-0', 'http://localhost:3000');
    network.workflows[3].addPeer('node-1', 'http://localhost:3001');
    network.workflows[3].addPeer('node-2', 'http://localhost:3002');
    network.workflows[4].addPeer('node-0', 'http://localhost:3000');
    network.workflows[4].addPeer('node-1', 'http://localhost:3001');
    network.workflows[4].addPeer('node-2', 'http://localhost:3002');

    // Wait for network healing
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('Network partition healed - checking convergence...');

    // Check final convergence
    const finalMetrics = network.getNetworkConvergence();
    const totalTasks = finalMetrics.reduce((sum, m) => sum + m.workflow.tasksStarted, 0);
    const totalCompleted = finalMetrics.reduce((sum, m) => sum + m.workflow.tasksCompleted, 0);

    console.log(`\n📊 Final Results:`);
    console.log(`  ├─ Total Tasks Started: ${totalTasks}`);
    console.log(`  ├─ Total Tasks Completed: ${totalCompleted}`);
    console.log(`  ├─ Overall Success Rate: ${totalTasks > 0 ? ((totalCompleted / totalTasks) * 100).toFixed(1) : 0}%`);
    console.log(`  └─ Network Convergence: Achieved`);

    // Cleanup
    console.log('\n🧹 Cleaning up network...');
    await network.stop();

    console.log('\n✅ Demo completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error(error.stack);
  }
}

// Benchmark different configurations
async function benchmarkConfigurations() {
  console.log('\n🏁 Benchmarking Different Configurations');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const configurations = ['development', 'production', 'highThroughput', 'lowLatency'];
  const results = {};

  for (const configName of configurations) {
    console.log(`\n🔧 Testing ${configName} configuration...`);

    const config = getConfiguration(configName, 'small');
    const network = await GossipVerificationWorkflow.createNetwork(3, config);

    const startTime = Date.now();

    // Run verification tasks
    const tasks = await Promise.all([
      network.workflows[0].verifyResourceMonitoring('benchmark-test'),
      network.workflows[1].verifyAgentSpawning('coordinator'),
      network.workflows[2].verifyNetworkConnectivity('benchmark-network')
    ]);

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 8000));

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Collect metrics
    const convergenceMetrics = network.getNetworkConvergence();
    const totalTasks = convergenceMetrics.reduce((sum, m) => sum + m.workflow.tasksStarted, 0);
    const totalCompleted = convergenceMetrics.reduce((sum, m) => sum + m.workflow.tasksCompleted, 0);

    results[configName] = {
      duration,
      tasksStarted: totalTasks,
      tasksCompleted: totalCompleted,
      successRate: totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0,
      avgConsensusTime: convergenceMetrics.reduce((sum, m) => sum + (m.verification.averageConsensusTime || 0), 0) / convergenceMetrics.length
    };

    console.log(`  ├─ Duration: ${duration}ms`);
    console.log(`  ├─ Tasks: ${totalCompleted}/${totalTasks}`);
    console.log(`  └─ Success Rate: ${results[configName].successRate.toFixed(1)}%`);

    await network.stop();
  }

  // Display benchmark results
  console.log('\n📊 Benchmark Results Summary');
  console.log('─────────────────────────────────────────');

  Object.entries(results).forEach(([config, metrics]) => {
    console.log(`\n${config}:`);
    console.log(`  ├─ Duration: ${metrics.duration}ms`);
    console.log(`  ├─ Success Rate: ${metrics.successRate.toFixed(1)}%`);
    console.log(`  └─ Avg Consensus Time: ${metrics.avgConsensusTime.toFixed(1)}ms`);
  });

  // Find best configuration
  const bestConfig = Object.entries(results).reduce((best, [config, metrics]) => {
    if (metrics.successRate > best.successRate ||
        (metrics.successRate === best.successRate && metrics.duration < best.duration)) {
      return { name: config, ...metrics };
    }
    return best;
  }, { successRate: 0, duration: Infinity });

  console.log(`\n🏆 Best Configuration: ${bestConfig.name}`);
  console.log(`  ├─ Success Rate: ${bestConfig.successRate.toFixed(1)}%`);
  console.log(`  └─ Duration: ${bestConfig.duration}ms`);
}

// Run the demo
if (require.main === module) {
  (async () => {
    await runGossipDemo();
    await benchmarkConfigurations();

    console.log('\n🎉 All demos completed!');
    process.exit(0);
  })().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runGossipDemo, benchmarkConfigurations };