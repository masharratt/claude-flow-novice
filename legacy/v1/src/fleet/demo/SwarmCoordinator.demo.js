#!/usr/bin/env node

/**
 * SwarmCoordinator Demo
 *
 * Demonstrates the complete SwarmCoordinator orchestration capabilities
 * including agent lifecycle management, task distribution, scaling, and monitoring
 */

import { SwarmCoordinator } from '../SwarmCoordinator.js';
import { createClient } from 'redis';

// Demo configuration
const DEMO_CONFIG = {
  swarmId: 'demo-swarmcoordinator',
  maxAgents: 20,
  loadBalancingStrategy: 'weighted_round_robin',
  redis: {
    host: 'localhost',
    port: 6379,
    db: 2 // Use demo database
  },
  coordinationInterval: 5000, // Faster for demo
  scalingThreshold: 0.7
};

/**
 * Demo utility functions
 */
function log(message, emoji = '📝') {
  console.log(`${emoji} ${new Date().toISOString()} - ${message}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`🎯 ${title}`);
  console.log('='.repeat(60));
}

function logMetrics(metrics) {
  log('📊 Current Metrics:', '📈');
  console.log('  ├─ Total Agents:', metrics.fleet.agents.total);
  console.log('  ├─ Active Agents:', metrics.fleet.agents.active);
  console.log('  ├─ Task Queue Size:', metrics.coordination.taskQueue.size);
  console.log('  ├─ Tasks Completed:', metrics.coordinator.metrics.completedTasks);
  console.log('  ├─ Tasks Failed:', metrics.coordinator.metrics.failedTasks);
  console.log('  ├─ Agent Utilization:', `${(metrics.performance.agentUtilization * 100).toFixed(1)}%`);
  console.log('  ├─ Average Performance:', `${(metrics.performance.averagePerformance * 100).toFixed(1)}%`);
  console.log('  └─ Scaling Events:', metrics.coordinator.metrics.scalingEvents);
}

/**
 * Main demo function
 */
async function runDemo() {
  let coordinator = null;
  let demoRedis = null;

  try {
    logSection('🚀 SwarmCoordinator Demo - Advanced Fleet Orchestration');

    // Setup demo Redis
    log('Setting up demo Redis environment...');
    demoRedis = createClient(DEMO_CONFIG.redis);
    await demoRedis.connect();
    await demoRedis.flushDb();
    log('Demo Redis ready');

    // Initialize SwarmCoordinator
    log('Initializing SwarmCoordinator...');
    coordinator = new SwarmCoordinator(DEMO_CONFIG);
    await coordinator.initialize();
    log('SwarmCoordinator initialized successfully', '✅');

    // Get initial status
    logSection('📊 Initial Fleet Status');
    const initialMetrics = await coordinator.getFleetMetrics();
    logMetrics(initialMetrics);

    // Demo 1: Agent Lifecycle Management
    logSection('🤖 Demo 1: Agent Lifecycle Management');

    log('Spawning specialized agents...');
    const agents = [];

    // Spawn different types of agents
    agents.push(await coordinator.spawnAgent({
      type: 'coder',
      capabilities: ['javascript', 'typescript', 'python'],
      priority: 8
    }));
    log(`Spawned coder agent: ${agents[agents.length - 1]}`);

    agents.push(await coordinator.spawnAgent({
      type: 'tester',
      capabilities: ['unit-testing', 'integration-testing'],
      priority: 7
    }));
    log(`Spawned tester agent: ${agents[agents.length - 1]}`);

    agents.push(await coordinator.spawnAgent({
      type: 'reviewer',
      capabilities: ['code-review', 'security-review'],
      priority: 6
    }));
    log(`Spawned reviewer agent: ${agents[agents.length - 1]}`);

    // Monitor agents
    log('Monitoring agent status...');
    for (const agentId of agents) {
      const status = await coordinator.monitorAgent(agentId);
      log(`Agent ${agentId}: ${status.agent.status} (Performance: ${(status.workload.performanceScore * 100).toFixed(1)}%)`);
    }

    // Demo 2: Task Distribution and Load Balancing
    logSection('📋 Demo 2: Task Distribution and Load Balancing');

    const tasks = [];

    // Submit various tasks with different priorities
    const taskDefinitions = [
      {
        title: 'Implement REST API endpoint',
        poolType: 'coder',
        capabilities: ['javascript'],
        priority: 9,
        estimatedDuration: 8000
      },
      {
        title: 'Write unit tests',
        poolType: 'tester',
        capabilities: ['unit-testing'],
        priority: 7,
        estimatedDuration: 5000
      },
      {
        title: 'Review security implementation',
        poolType: 'reviewer',
        capabilities: ['security-review'],
        priority: 8,
        estimatedDuration: 3000
      },
      {
        title: 'Optimize database queries',
        poolType: 'coder',
        capabilities: ['sql', 'optimization'],
        priority: 6,
        estimatedDuration: 6000
      },
      {
        title: 'Update documentation',
        poolType: 'coder',
        capabilities: ['documentation'],
        priority: 4,
        estimatedDuration: 4000
      },
      {
        title: 'Performance testing',
        poolType: 'tester',
        capabilities: ['performance-testing'],
        priority: 7,
        estimatedDuration: 7000
      },
      {
        title: 'Code review',
        poolType: 'reviewer',
        capabilities: ['code-review'],
        priority: 8,
        estimatedDuration: 2000
      }
    ];

    log('Submitting tasks to the queue...');
    for (const taskDef of taskDefinitions) {
      const taskId = await coordinator.submitTask(taskDef);
      tasks.push({ id: taskId, ...taskDef });
      log(`Task submitted: ${taskDef.title} (Priority: ${taskDef.priority})`);
    }

    // Wait for task processing
    log('Processing tasks...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check task distribution
    log('Task distribution results:');
    const currentMetrics = await coordinator.getFleetMetrics();
    logMetrics(currentMetrics);

    // Show active tasks
    if (coordinator.activeTasks.size > 0) {
      log('Active tasks:');
      for (const [taskId, execution] of coordinator.activeTasks.entries()) {
        const task = tasks.find(t => t.id === taskId);
        log(`  ├─ ${task?.title || taskId} -> Agent: ${execution.agentId}`);
      }
    }

    // Demo 3: Dynamic Scaling
    logSection('⚖️ Demo 3: Dynamic Agent Scaling');

    // Submit more tasks to trigger scaling
    log('Submitting additional tasks to trigger auto-scaling...');
    for (let i = 0; i < 10; i++) {
      await coordinator.submitTask({
        title: `Load test task ${i + 1}`,
        poolType: 'coder',
        capabilities: ['javascript'],
        priority: Math.floor(Math.random() * 10) + 1,
        estimatedDuration: Math.floor(Math.random() * 5000) + 2000
      });
    }

    // Wait for scaling to trigger
    log('Waiting for auto-scaling to trigger...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Show scaling results
    const scaledMetrics = await coordinator.getFleetMetrics();
    log('After auto-scaling:', '📈');
    logMetrics(scaledMetrics);

    // Show scaling history
    if (coordinator.scalingHistory.length > 0) {
      log('Scaling history:');
      for (const event of coordinator.scalingHistory.slice(-3)) {
        log(`  ├─ ${event.poolType}: ${event.previousSize} → ${event.newSize} (${event.reason})`);
      }
    }

    // Demo 4: Metrics Dashboard
    logSection('📊 Demo 4: Fleet Metrics Dashboard');

    const dashboard = await coordinator.createMetricsDashboard();

    log('Dashboard Overview:', '🎯');
    console.log('  ├─ Total Agents:', dashboard.overview.totalAgents);
    console.log('  ├─ Utilization Rate:', `${(dashboard.overview.utilizationRate * 100).toFixed(1)}%`);
    console.log('  ├─ Task Queue Size:', dashboard.overview.taskQueueSize);

    log('Performance Summary:', '⚡');
    console.log('  ├─ Tasks Completed:', dashboard.performance.tasksCompleted);
    console.log('  ├─ Tasks Failed:', dashboard.performance.tasksFailed);
    console.log('  ├─ Success Rate:', `${(dashboard.performance.successRate * 100).toFixed(1)}%`);
    console.log('  ├─ Average Task Duration:', `${dashboard.performance.averageTaskDuration.toFixed(0)}ms`);

    log('Pool Status:', '🏊');
    for (const [poolType, status] of Object.entries(dashboard.pools)) {
      console.log(`  ├─ ${poolType}: ${status.currentAgents}/${status.maxAgents} agents`);
    }

    // Demo 5: Redis Coordination
    logSection('📡 Demo 5: Redis Coordination');

    // Subscribe to coordination events
    let coordinationEvents = 0;
    await coordinator.redisCoordinator.subscribe(
      coordinator.config.channels.coordination,
      (message) => {
        coordinationEvents++;
        log(`Coordination event received: ${message.type}`, '📡');
      }
    );

    // Publish test coordination event
    await coordinator.publishCoordinationEvent({
      type: 'demo_coordination_test',
      message: 'Testing Redis coordination',
      timestamp: Date.now()
    });

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    log(`Processed ${coordinationEvents} coordination events`);

    // Demo 6: Error Handling and Recovery
    logSection('🔧 Demo 6: Error Handling and Recovery');

    // Simulate agent failure
    if (agents.length > 0) {
      const agentToFail = agents[0];
      log(`Simulating failure for agent: ${agentToFail}`);

      await coordinator.handleUnhealthyAgent(agentToFail, 'Demo failure simulation');

      // Check recovery metrics
      const recoveryMetrics = await coordinator.getFleetMetrics();
      log(`Recovery events: ${recoveryMetrics.coordinator.metrics.recoveryEvents}`, '🔄');
    }

    // Demo 7: Performance Monitoring
    logSection('⚡ Demo 7: Performance Monitoring');

    // Simulate high load
    log('Simulating high load scenario...');
    const highLoadTasks = [];

    for (let i = 0; i < 15; i++) {
      highLoadTasks.push(await coordinator.submitTask({
        title: `High load task ${i + 1}`,
        poolType: 'coder',
        capabilities: ['javascript'],
        priority: Math.floor(Math.random() * 10) + 1,
        estimatedDuration: Math.floor(Math.random() * 3000) + 1000
      }));
    }

    // Monitor performance during load
    await new Promise(resolve => setTimeout(resolve, 5000));

    const performanceMetrics = await coordinator.getFleetMetrics();
    log('Performance under load:', '🚀');
    logMetrics(performanceMetrics);

    // Demo 8: Graceful Shutdown
    logSection('🛑 Demo 8: Graceful Shutdown');

    log('Initiating graceful shutdown...');

    // Show final metrics
    const finalMetrics = await coordinator.getFleetMetrics();
    log('Final fleet metrics:', '📊');
    logMetrics(finalMetrics);

    // Calculate demo statistics
    const demoStats = {
      duration: finalMetrics.coordinator.uptime,
      totalTasks: finalMetrics.coordinator.metrics.totalTasks,
      completedTasks: finalMetrics.coordinator.metrics.completedTasks,
      failedTasks: finalMetrics.coordinator.metrics.failedTasks,
      scalingEvents: finalMetrics.coordinator.metrics.scalingEvents,
      recoveryEvents: finalMetrics.coordinator.metrics.recoveryEvents
    };

    log('Demo Statistics:', '🎉');
    console.log('  ├─ Duration:', `${(demoStats.duration / 1000).toFixed(1)}s`);
    console.log('  ├─ Total Tasks:', demoStats.totalTasks);
    console.log('  ├─ Completed Tasks:', demoStats.completedTasks);
    console.log('  ├─ Failed Tasks:', demoStats.failedTasks);
    console.log('  ├─ Success Rate:', `${((demoStats.completedTasks / Math.max(demoStats.totalTasks, 1)) * 100).toFixed(1)}%`);
    console.log('  ├─ Scaling Events:', demoStats.scalingEvents);
    console.log('  └─ Recovery Events:', demoStats.recoveryEvents);

    // Graceful shutdown
    await coordinator.shutdown();
    log('SwarmCoordinator shutdown complete', '✅');

    // Cleanup Redis
    await demoRedis.flushDb();
    await demoRedis.quit();
    log('Demo Redis cleaned up', '🧹');

    logSection('🎉 Demo Complete - SwarmCoordinator Orchestration Success');
    log('The SwarmCoordinator demonstrated:', '🚀');
    console.log('  ✅ Agent lifecycle orchestration');
    console.log('  ✅ Task distribution and load balancing');
    console.log('  ✅ Dynamic agent scaling');
    console.log('  ✅ Fleet monitoring and metrics');
    console.log('  ✅ Redis-based coordination');
    console.log('  ✅ Error handling and recovery');
    console.log('  ✅ Performance optimization');
    console.log('  ✅ Graceful shutdown');

  } catch (error) {
    log(`Demo failed: ${error.message}`, '❌');
    console.error(error);

    // Cleanup on error
    if (coordinator) {
      try {
        await coordinator.shutdown();
      } catch (shutdownError) {
        log(`Shutdown failed: ${shutdownError.message}`, '⚠️');
      }
    }

    if (demoRedis) {
      try {
        await demoRedis.quit();
      } catch (redisError) {
        log(`Redis cleanup failed: ${redisError.message}`, '⚠️');
      }
    }

    process.exit(1);
  }
}

// Handle process interruption
process.on('SIGINT', async () => {
  log('Demo interrupted by user', '⚠️');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('Demo terminated', '⚠️');
  process.exit(0);
});

// Run demo
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo()
    .then(() => {
      log('Demo completed successfully', '🎉');
      process.exit(0);
    })
    .catch((error) => {
      log(`Demo failed: ${error.message}`, '❌');
      process.exit(1);
    });
}

export { runDemo };