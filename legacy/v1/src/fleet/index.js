/**
 * Fleet Manager - Main entry point for the fleet management system
 *
 * Exports all fleet management components and provides utilities
 * for easy integration with the swarm system.
 */

import { FleetCommanderAgent } from './FleetCommanderAgent.js';
import { AgentRegistry } from './AgentRegistry.js';
import { ResourceAllocator } from './ResourceAllocator.js';
import { HealthMonitor } from './HealthMonitor.js';
import { RedisCoordinator } from './RedisCoordinator.js';
import { SwarmCoordinator } from './SwarmCoordinator.js';

// Export all components
export {
  FleetCommanderAgent,
  AgentRegistry,
  ResourceAllocator,
  HealthMonitor,
  RedisCoordinator,
  SwarmCoordinator
};

// Default export SwarmCoordinator for convenience
export default SwarmCoordinator;

/**
 * Create a complete fleet management system
 */
export async function createFleetSystem(options = {}) {
  const fleetOptions = {
    swarmId: 'phase-1-foundation-infrastructure',
    maxAgents: 1000,
    redis: {
      host: 'localhost',
      port: 6379,
      db: 0,
      ...options.redis
    },
    ...options
  };

  // Create fleet commander
  const fleetCommander = new FleetCommanderAgent(fleetOptions);

  // Initialize the system
  await fleetCommander.initialize();

  return {
    fleetCommander,
    registry: fleetCommander.registry,
    allocator: fleetCommander.allocator,
    healthMonitor: fleetCommander.healthMonitor,

    // Convenience methods
    async getFleetStatus() {
      return await fleetCommander.getFleetStatus();
    },

    async allocateAgent(taskRequirements) {
      return await fleetCommander.allocateAgent(taskRequirements);
    },

    async releaseAgent(agentId, result) {
      return await fleetCommander.releaseAgent(agentId, result);
    },

    async scalePool(poolType, targetSize) {
      return await fleetCommander.scalePool(poolType, targetSize);
    },

    async shutdown() {
      return await fleetCommander.shutdown();
    }
  };
}

/**
 * Create an advanced swarm orchestration system with SwarmCoordinator
 */
export async function createSwarmOrchestrationSystem(options = {}) {
  const swarmOptions = {
    swarmId: 'phase-1-swarmcoordinator-fix',
    maxAgents: 1000,
    redis: {
      host: 'localhost',
      port: 6379,
      db: 0,
      ...options.redis
    },
    ...options
  };

  // Create swarm coordinator
  const swarmCoordinator = new SwarmCoordinator(swarmOptions);

  // Initialize the system
  await swarmCoordinator.initialize();

  return {
    swarmCoordinator,
    fleetCommander: swarmCoordinator.fleetCommander,
    registry: swarmCoordinator.agentRegistry,
    allocator: swarmCoordinator.resourceAllocator,
    healthMonitor: swarmCoordinator.healthMonitor,
    redisCoordinator: swarmCoordinator.redisCoordinator,

    // Advanced orchestration methods
    async spawnAgent(agentConfig) {
      return await swarmCoordinator.spawnAgent(agentConfig);
    },

    async terminateAgent(agentId, reason) {
      return await swarmCoordinator.terminateAgent(agentId, reason);
    },

    async submitTask(task) {
      return await swarmCoordinator.submitTask(task);
    },

    async getFleetMetrics() {
      return await swarmCoordinator.getFleetMetrics();
    },

    async createMetricsDashboard() {
      return await swarmCoordinator.createMetricsDashboard();
    },

    async scalePool(poolType, targetSize) {
      return await swarmCoordinator.scalePool(poolType, targetSize);
    },

    async getFleetStatus() {
      return await swarmCoordinator.fleetCommander.getFleetStatus();
    },

    async shutdown() {
      return await swarmCoordinator.shutdown();
    }
  };
}

/**
 * Quick start example
 */
export async function quickStart() {
  console.log('🚀 Starting Fleet Manager Quick Start...');

  try {
    // Create fleet system
    const fleet = await createFleetSystem({
      swarmId: 'demo-fleet',
      maxAgents: 10
    });

    // Get initial status
    const status = await fleet.getFleetStatus();
    console.log('📊 Initial Fleet Status:', {
      totalAgents: status.agents.total,
      activeAgents: status.agents.active,
      pools: Object.keys(status.pools)
    });

    // Example task allocation
    const allocation = await fleet.allocateAgent({
      taskId: 'demo-task-1',
      poolType: 'coder',
      capabilities: ['javascript', 'typescript'],
      strategy: 'priority_based'
    });

    console.log('✅ Agent Allocated:', {
      agentId: allocation.agentId,
      poolType: allocation.poolType
    });

    // Release agent
    await fleet.releaseAgent(allocation.agentId, {
      success: true,
      duration: 1500
    });

    console.log('✅ Agent Released');

    // Scale a pool
    await fleet.scalePool('coder', 8);
    console.log('✅ Pool Scaled');

    // Get final status
    const finalStatus = await fleet.getFleetStatus();
    console.log('📊 Final Fleet Status:', {
      totalAgents: finalStatus.agents.total,
      tasksCompleted: finalStatus.metrics.tasksCompleted
    });

    // Shutdown
    await fleet.shutdown();
    console.log('🛑 Fleet System Shutdown Complete');

    return fleet;
  } catch (error) {
    console.error('❌ Quick Start Failed:', error.message);
    throw error;
  }
}

/**
 * Swarm Orchestration Quick Start example
 */
export async function swarmOrchestrationQuickStart() {
  console.log('🚀 Starting Swarm Orchestration Quick Start...');

  try {
    // Create swarm orchestration system
    const swarm = await createSwarmOrchestrationSystem({
      swarmId: 'demo-swarm-orchestration',
      maxAgents: 20,
      loadBalancingStrategy: 'weighted_round_robin'
    });

    // Get initial metrics
    const initialMetrics = await swarm.getFleetMetrics();
    console.log('📊 Initial Swarm Metrics:', {
      totalAgents: initialMetrics.fleet.agents.total,
      activeAgents: initialMetrics.fleet.agents.active,
      coordinatorUptime: initialMetrics.coordinator.uptime
    });

    // Spawn a new agent
    const agentId = await swarm.spawnAgent({
      type: 'coder',
      capabilities: ['javascript', 'typescript', 'python'],
      priority: 8
    });
    console.log('✅ Agent Spawned:', agentId);

    // Submit tasks
    const task1Id = await swarm.submitTask({
      title: 'Write JavaScript function',
      poolType: 'coder',
      capabilities: ['javascript'],
      priority: 7,
      estimatedDuration: 10000
    });
    console.log('✅ Task Submitted:', task1Id);

    const task2Id = await swarm.submitTask({
      title: 'Code review',
      poolType: 'reviewer',
      capabilities: ['code-review'],
      priority: 6,
      estimatedDuration: 5000
    });
    console.log('✅ Task Submitted:', task2Id);

    // Wait for task processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get metrics dashboard
    const dashboard = await swarm.createMetricsDashboard();
    console.log('📊 Metrics Dashboard:', {
      totalAgents: dashboard.overview.totalAgents,
      utilizationRate: dashboard.overview.utilizationRate,
      tasksCompleted: dashboard.performance.tasksCompleted,
      taskQueueSize: dashboard.overview.taskQueueSize
    });

    // Scale a pool
    await swarm.scalePool('coder', 10);
    console.log('✅ Pool Scaled');

    // Monitor an agent
    const agentStatus = await swarm.swarmCoordinator.monitorAgent(agentId);
    console.log('🔍 Agent Status:', {
      agentId: agentStatus.agent.id,
      status: agentStatus.agent.status,
      workload: agentStatus.workload.currentTasks
    });

    // Shutdown
    await swarm.shutdown();
    console.log('🛑 Swarm Orchestration System Shutdown Complete');

    return swarm;
  } catch (error) {
    console.error('❌ Swarm Orchestration Quick Start Failed:', error.message);
    throw error;
  }
}

// Run quick start if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const useSwarmOrchestration = args.includes('--swarm');

  const quickStartFn = useSwarmOrchestration ? swarmOrchestrationQuickStart : quickStart;

  quickStartFn()
    .then(() => {
      console.log(`✅ ${useSwarmOrchestration ? 'Swarm Orchestration' : 'Fleet Manager'} Quick Start Completed Successfully`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`❌ ${useSwarmOrchestration ? 'Swarm Orchestration' : 'Fleet Manager'} Quick Start Failed:`, error);
      process.exit(1);
    });
}