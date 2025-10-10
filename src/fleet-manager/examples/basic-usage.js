/**
 * Basic Fleet Manager Usage Example
 *
 * Demonstrates core fleet management operations:
 * - Fleet initialization
 * - Agent allocation and release
 * - Status monitoring
 * - Graceful shutdown
 */

import { FleetManager, FLEET_PRESETS } from '../index.js';

async function main() {
  console.log('🚀 Fleet Manager - Basic Usage Example\n');

  // Create fleet with development preset
  const fleet = new FleetManager({
    ...FLEET_PRESETS.development,
    fleetId: 'example-fleet',
    swarmId: 'example-swarm',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    }
  });

  // Listen for fleet events
  fleet.on('agent_registered', ({ agentId }) => {
    console.log(`✅ Agent registered: ${agentId}`);
  });

  fleet.on('agent_allocated', ({ agentId, taskId }) => {
    console.log(`📌 Agent ${agentId} allocated to task ${taskId}`);
  });

  fleet.on('allocation_released', ({ agentId, result }) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} Agent ${agentId} released (${result.duration}ms)`);
  });

  fleet.on('error', ({ type, error }) => {
    console.error(`❌ Error [${type}]:`, error);
  });

  try {
    // Initialize fleet
    console.log('Initializing fleet...');
    await fleet.initialize();
    console.log('✅ Fleet initialized\n');

    // Get initial status
    const initialStatus = await fleet.getStatus();
    console.log('📊 Initial Status:');
    console.log(`   Agents: ${initialStatus.agents.total} (${initialStatus.agents.idle} idle)`);
    console.log(`   Pools: ${Object.keys(initialStatus.pools).length}`);
    console.log();

    // Allocate agents for different tasks
    console.log('Allocating agents...');
    const allocations = await Promise.all([
      fleet.allocateAgent({
        type: 'coder',
        taskId: 'task-001',
        capabilities: ['javascript', 'typescript']
      }),
      fleet.allocateAgent({
        type: 'tester',
        taskId: 'task-002',
        capabilities: ['unit-testing']
      }),
      fleet.allocateAgent({
        type: 'reviewer',
        taskId: 'task-003',
        capabilities: ['code-review']
      })
    ]);

    console.log(`\n✅ Allocated ${allocations.length} agents\n`);

    // Simulate task execution
    console.log('Simulating task execution...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Release agents
    console.log('\nReleasing agents...');
    await Promise.all([
      fleet.releaseAgent(allocations[0].agentId, {
        success: true,
        duration: 1234
      }),
      fleet.releaseAgent(allocations[1].agentId, {
        success: true,
        duration: 987
      }),
      fleet.releaseAgent(allocations[2].agentId, {
        success: false,
        duration: 456,
        error: 'Review rejected'
      })
    ]);

    console.log();

    // Get final status
    const finalStatus = await fleet.getStatus();
    console.log('📊 Final Status:');
    console.log(`   Agents: ${finalStatus.agents.total} (${finalStatus.agents.idle} idle, ${finalStatus.agents.active} active)`);
    console.log(`   Tasks Completed: ${finalStatus.metrics.tasksCompleted}`);
    console.log(`   Tasks Failed: ${finalStatus.metrics.tasksFailed}`);
    console.log(`   Uptime: ${Math.floor(finalStatus.metrics.uptime / 1000)}s`);
    console.log();

    // Get health status
    const health = await fleet.getHealth();
    console.log('🏥 Health Status:', health.status);
    console.log('   Components:');
    console.log(`   - Coordinator: ${health.components.coordinator.status}`);
    console.log(`   - Registry: ${health.components.registry.status}`);
    console.log(`   - Allocator: ${health.components.allocator.status}`);
    console.log(`   - Auto-Scaler: ${health.components.autoScaler.status}`);
    console.log(`   - Monitor: ${health.components.monitor.status}`);
    console.log();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    // Shutdown fleet
    console.log('Shutting down fleet...');
    await fleet.shutdown();
    console.log('✅ Fleet shutdown complete\n');
  }
}

// Run example
main().catch(console.error);
