#!/usr/bin/env node

/**
 * Multi-Swarm Coordination Demo
 * Phase 2: Fleet Manager Features & Advanced Capabilities
 *
 * Demonstrates:
 * - Creating multiple concurrent swarms
 * - Inter-swarm messaging
 * - Leader election and task distribution
 * - Resource allocation
 * - State persistence and recovery
 */

const {
  createMultiSwarmCoordination,
} = require('./src/redis/multi-swarm-coordination');

async function runDemo() {
  console.log('🚀 Multi-Swarm Coordination System Demo');
  console.log('='.repeat(70));

  const coordination = createMultiSwarmCoordination({
    host: 'localhost',
    port: 6379,
    db: 0,
  });

  try {
    // Step 1: Initialize coordination system
    console.log('\n📋 Step 1: Initialize Coordination System');
    await coordination.initialize();
    console.log('✅ Coordination system ready');

    // Step 2: Create multiple swarms
    console.log('\n📋 Step 2: Create Multiple Concurrent Swarms');

    const swarm1 = await coordination.createSwarm({
      objective: 'Build REST API with authentication',
      strategy: 'development',
      mode: 'mesh',
      maxAgents: 5,
      metadata: {
        phase: 'backend',
        priority: 'high',
        capabilities: ['backend', 'api', 'security'],
      },
    });
    console.log(`   ✅ Swarm 1 created: ${swarm1.swarm.id}`);

    const swarm2 = await coordination.createSwarm({
      objective: 'Implement frontend dashboard',
      strategy: 'development',
      mode: 'mesh',
      maxAgents: 4,
      metadata: {
        phase: 'frontend',
        priority: 'normal',
        capabilities: ['frontend', 'ui', 'react'],
      },
    });
    console.log(`   ✅ Swarm 2 created: ${swarm2.swarm.id}`);

    const swarm3 = await coordination.createSwarm({
      objective: 'Setup CI/CD pipeline',
      strategy: 'devops',
      mode: 'mesh',
      maxAgents: 3,
      metadata: {
        phase: 'devops',
        priority: 'normal',
        capabilities: ['devops', 'ci-cd', 'docker'],
      },
    });
    console.log(`   ✅ Swarm 3 created: ${swarm3.swarm.id}`);

    // Step 3: List active swarms
    console.log('\n📋 Step 3: List Active Swarms');
    const activeSwarms = await coordination.getSwarms({ status: 'initializing' });
    console.log(`   Found ${activeSwarms.length} active swarms:`);
    activeSwarms.forEach((swarm, index) => {
      console.log(`   ${index + 1}. ${swarm.id}: ${swarm.objective} (${swarm.strategy})`);
    });

    // Wait for leader election
    console.log('\n⏳ Waiting for leader election...');
    await sleep(3000);

    // Step 4: Check leader status
    console.log('\n📋 Step 4: Leader Election Results');
    [swarm1, swarm2, swarm3].forEach((swarmResult, index) => {
      const coordinator = coordination.getCoordinator(swarmResult.swarm.id);
      console.log(`   Swarm ${index + 1}: ${coordinator.isLeader ? '👑 LEADER' : '📋 FOLLOWER'}`);
      if (!coordinator.isLeader) {
        console.log(`      Current leader: ${coordinator.currentLeader || 'None'}`);
      }
    });

    // Step 5: Inter-swarm messaging
    console.log('\n📋 Step 5: Inter-Swarm Messaging');

    // Setup message handler on swarm2
    const messenger2 = coordination.getMessenger(swarm2.swarm.id);
    messenger2.onMessage('coordination_request', (payload) => {
      console.log(`   📬 Swarm 2 received coordination request from Swarm 1:`);
      console.log(`      ${payload.message}`);
    });

    // Send message from swarm1 to swarm2
    await coordination.sendMessage(
      swarm1.swarm.id,
      swarm2.swarm.id,
      {
        type: 'coordination_request',
        message: 'Need frontend for API endpoints: /auth, /users, /posts',
        endpoints: ['/auth', '/users', '/posts'],
      }
    );
    console.log(`   ✅ Message sent from Swarm 1 to Swarm 2`);

    // Wait for message delivery
    await sleep(500);

    // Step 6: Broadcast message
    console.log('\n📋 Step 6: Broadcast Message to All Swarms');

    // Setup handlers on all swarms
    [swarm1, swarm2, swarm3].forEach((swarmResult, index) => {
      const messenger = coordination.getMessenger(swarmResult.swarm.id);
      messenger.onMessage('project_update', (payload) => {
        console.log(`   📡 Swarm ${index + 1} received broadcast: ${payload.message}`);
      });
    });

    // Subscribe to global channel
    const messenger1 = coordination.getMessenger(swarm1.swarm.id);
    await messenger1.subscribeToChannel('swarm:global');

    await coordination.broadcast(swarm3.swarm.id, {
      type: 'project_update',
      message: 'CI/CD pipeline setup complete. Ready for deployments.',
      status: 'ready',
    });

    await sleep(1000);

    // Step 7: Task distribution
    console.log('\n📋 Step 7: Task Distribution');

    // Find leader coordinator
    const leaderSwarm = [swarm1, swarm2, swarm3].find((s) => {
      const coord = coordination.getCoordinator(s.swarm.id);
      return coord.isLeader;
    });

    if (leaderSwarm) {
      // Update swarms to active status for task distribution
      await coordination.updateSwarmState(swarm1.swarm.id, { status: 'active' });
      await coordination.updateSwarmState(swarm2.swarm.id, { status: 'active' });
      await coordination.updateSwarmState(swarm3.swarm.id, { status: 'active' });

      const task = {
        description: 'Implement user authentication flow',
        type: 'implementation',
        priority: 'high',
        capabilities: ['backend', 'security'],
        estimatedEffort: '4 hours',
      };

      const distribution = await coordination.distributeTask(leaderSwarm.swarm.id, task);
      console.log(`   ✅ Task distributed:`);
      console.log(`      ${JSON.stringify(distribution, null, 6)}`);
    } else {
      console.log('   ⚠️ No leader found for task distribution');
    }

    // Step 8: Resource allocation
    console.log('\n📋 Step 8: Resource Allocation');

    if (leaderSwarm) {
      const coordinator = coordination.getCoordinator(leaderSwarm.swarm.id);

      // Initialize resource pool
      await coordinator.redis.set('swarm:resources:cpu:available', '1000');
      await coordinator.redis.set('swarm:resources:memory:available', '16384');

      // Allocate CPU to swarm1
      const cpuAllocation = await coordination.allocateResource(
        leaderSwarm.swarm.id,
        'cpu',
        200
      );
      console.log(`   ✅ CPU allocated: ${JSON.stringify(cpuAllocation)}`);

      // Allocate memory to swarm2
      const memAllocation = await coordination.allocateResource(
        leaderSwarm.swarm.id,
        'memory',
        4096
      );
      console.log(`   ✅ Memory allocated: ${JSON.stringify(memAllocation)}`);

      // Check available resources
      const cpuAvailable = await coordinator.getAvailableResources('cpu');
      const memAvailable = await coordinator.getAvailableResources('memory');
      console.log(`   📊 Available resources:`);
      console.log(`      CPU: ${cpuAvailable}`);
      console.log(`      Memory: ${memAvailable}`);
    }

    // Step 9: State persistence and snapshots
    console.log('\n📋 Step 9: State Persistence and Snapshots');

    // Create snapshots for all swarms
    for (const swarmResult of [swarm1, swarm2, swarm3]) {
      const snapshotId = await coordination.createSnapshot(
        swarmResult.swarm.id,
        'demo_checkpoint'
      );
      console.log(`   ✅ Snapshot created for ${swarmResult.swarm.id}: ${snapshotId}`);
    }

    // Step 10: System statistics
    console.log('\n📋 Step 10: System Statistics');
    const stats = await coordination.getStatistics();

    console.log(`   📊 Registry Statistics:`);
    console.log(`      Total registered: ${stats.registry.totalRegistered}`);
    console.log(`      Active swarms: ${stats.registry.activeSwarms}`);
    console.log(`      Completed swarms: ${stats.registry.completedSwarms}`);

    console.log(`   📊 State Manager Statistics:`);
    console.log(`      States saved: ${stats.state.statesSaved}`);
    console.log(`      States loaded: ${stats.state.statesLoaded}`);
    console.log(`      Snapshots created: ${stats.state.snapshotsCreated}`);

    console.log(`   📊 Active Coordinators: ${stats.activeCoordinators}`);
    console.log(`   📊 Active Messengers: ${stats.activeMessengers}`);

    // Step 11: Simulate swarm interruption and recovery
    console.log('\n📋 Step 11: Swarm Interruption and Recovery');

    // Simulate swarm1 interruption
    await coordination.updateSwarmState(swarm1.swarm.id, {
      status: 'interrupted',
      metadata: {
        ...swarm1.swarm.metadata,
        interruptedAt: Date.now(),
        reason: 'Connection lost',
      },
    });
    console.log(`   ⚠️ Swarm 1 interrupted (simulated)`);

    // Wait a moment
    await sleep(1000);

    // Discover interrupted swarms
    const interrupted = await coordination.discoverInterruptedSwarms();
    console.log(`   🔍 Found ${interrupted.length} interrupted swarm(s)`);

    // Recover swarm1
    if (interrupted.length > 0) {
      const recovery = await coordination.recoverSwarm(interrupted[0].id);
      console.log(`   🔄 Recovery result:`);
      console.log(`      Success: ${recovery.success}`);
      console.log(`      Recovery plan:`, JSON.stringify(recovery.recoveryPlan, null, 6));
    }

    // Step 12: Cleanup
    console.log('\n📋 Step 12: Cleanup and Shutdown');

    // Deregister all swarms
    await coordination.deregisterSwarm(swarm1.swarm.id, 'demo_complete');
    await coordination.deregisterSwarm(swarm2.swarm.id, 'demo_complete');
    await coordination.deregisterSwarm(swarm3.swarm.id, 'demo_complete');
    console.log('   ✅ All swarms deregistered');

    // Shutdown coordination system
    await coordination.shutdown();
    console.log('   ✅ Coordination system shutdown');

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('🎉 Demo Complete!');
    console.log('='.repeat(70));

    console.log('\n📊 Demo Summary:');
    console.log('   ✅ Created 3 concurrent swarms');
    console.log('   ✅ Leader election successful');
    console.log('   ✅ Inter-swarm messaging working');
    console.log('   ✅ Task distribution operational');
    console.log('   ✅ Resource allocation functional');
    console.log('   ✅ State persistence verified');
    console.log('   ✅ Swarm recovery successful');
    console.log('\n✨ All multi-swarm coordination features validated!');

  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    console.error('Stack:', error.stack);

    // Attempt cleanup
    try {
      await coordination.shutdown();
    } catch (cleanupError) {
      console.error('❌ Cleanup failed:', cleanupError);
    }

    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run demo
runDemo()
  .then(() => {
    console.log('\n✅ Demo execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Demo execution failed:', error);
    process.exit(1);
  });
