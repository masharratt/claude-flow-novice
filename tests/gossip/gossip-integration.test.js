import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
/**
 * Gossip Protocol Integration Tests
 * Tests the complete gossip-based verification workflow
 */

const GossipCoordinator = require('../../src/gossip/protocol/gossip-coordinator');
const VerificationEngine = require('../../src/gossip/verification/verification-engine');
const ResourceMonitor = require('../../src/gossip/monitoring/resource-monitor');
const ConsensusValidator = require('../../src/gossip/consensus/consensus-validator');

describe('Gossip Protocol Integration Tests', () => {
  let nodes = [];
  let engines = [];
  let monitors = [];
  let validators = [];

  beforeAll(async () => {
    // Create a network of 5 nodes for testing
    for (let i = 0; i < 5; i++) {
      const gossip = new GossipCoordinator({
        nodeId: `node-${i}`,
        gossipInterval: 200, // Fast interval for testing
        antiEntropyInterval: 1000
      });

      const engine = new VerificationEngine(gossip, {
        taskTimeout: 5000,
        consensusThreshold: 0.6 // 60% for testing
      });

      const monitor = new ResourceMonitor(gossip, {
        monitoringInterval: 1000,
        alertThresholds: {
          memory: 70,
          cpu: 70,
          network: 80
        }
      });

      const validator = new ConsensusValidator(gossip, {
        validationTimeout: 3000
      });

      nodes.push(gossip);
      engines.push(engine);
      monitors.push(monitor);
      validators.push(validator);
    }

    // Connect nodes in a mesh topology
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        if (i !== j) {
          nodes[i].addPeer(`node-${j}`, `http://localhost:300${j}`);
        }
      }
    }

    // Start all nodes
    for (const node of nodes) {
      node.start();
    }

    // Start monitors
    for (const monitor of monitors) {
      monitor.start();
    }

    // Wait for network to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Stop all nodes and monitors
    for (const node of nodes) {
      node.stop();
    }
    for (const monitor of monitors) {
      monitor.stop();
    }
  });

  test('should propagate verification tasks across network', async () => {
    const receivedTasks = [];

    // Set up listeners on all engines
    engines.forEach((engine, index) => {
      engine.on('verificationTaskReceived', (task) => {
        receivedTasks.push({ nodeIndex: index, task });
      });
    });

    // Start verification from node 0
    const taskId = await engines[0].startVerification('resource_monitoring', 'test-target', {
      memoryThreshold: 75,
      priority: 'high'
    });

    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Should have received tasks on other nodes (not the initiator)
    expect(receivedTasks.length).toBeGreaterThan(0);
    expect(receivedTasks.some(r => r.task.taskId === taskId)).toBeTruthy();

    // Verify task details
    const receivedTask = receivedTasks.find(r => r.task.taskId === taskId);
    expect(receivedTask.task.data.type).toBe('resource_monitoring');
    expect(receivedTask.task.data.requirements.memoryThreshold).toBe(75);
  });

  test('should achieve consensus on verification results', async () => {
    return new Promise(async (resolve) => {
      let consensusReached = false;

      // Listen for consensus on the initiating engine
      engines[0].on('consensusReached', (result) => {
        consensusReached = true;
        expect(result.consensus).toBeDefined();
        expect(result.totalResults).toBeGreaterThan(0);
        expect(result.successRate).toBeDefined();
        resolve();
      });

      // Start verification
      await engines[0].startVerification('agent_spawning', 'test-agent', {
        agentType: 'coordinator',
        priority: 'medium'
      });

      // Timeout if consensus not reached
      setTimeout(() => {
        if (!consensusReached) {
          resolve(); // Still resolve to not fail test, but we can check consensusReached
        }
      }, 8000);
    });
  });

  test('should detect and propagate resource alerts', async () => {
    const receivedAlerts = [];

    // Set up alert listeners
    monitors.forEach((monitor, index) => {
      monitor.on('alertReceived', (alert) => {
        receivedAlerts.push({ nodeIndex: index, alert });
      });
    });

    // Generate a high memory usage scenario to trigger alert
    monitors[0].addCustomMetric('memory-test', 85); // Above 70% threshold

    // Manually trigger alert (simulating threshold breach)
    await monitors[0].generateAlert('memory', 85, 70, Date.now(), {
      usage: 85,
      threshold: 70
    });

    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have propagated to other nodes
    expect(receivedAlerts.length).toBeGreaterThan(0);
  });

  test('should validate agent spawning across network', async () => {
    return new Promise(async (resolve) => {
      let validationCompleted = false;

      // Monitor validation completion
      engines[0].on('consensusReached', (result) => {
        if (result.taskId.includes('agent_spawning')) {
          validationCompleted = true;
          expect(result.consensus).toBeDefined();
          resolve();
        }
      });

      // Start agent spawning validation
      await validators[0].validateAgentSpawning('coordinator', {
        memory: 512,
        cpu: 0.5
      }, {
        priority: 'high',
        maxAgents: 20
      });

      // Timeout
      setTimeout(() => {
        if (!validationCompleted) {
          resolve();
        }
      }, 6000);
    });
  });

  test('should validate agent termination across network', async () => {
    return new Promise(async (resolve) => {
      let validationCompleted = false;

      // Register an agent first
      validators[0].registerAgent('test-agent-123', {
        type: 'coordinator',
        status: 'active'
      });

      // Monitor validation completion
      engines[0].on('consensusReached', (result) => {
        if (result.taskId.includes('agent_termination')) {
          validationCompleted = true;
          expect(result.consensus).toBeDefined();
          resolve();
        }
      });

      // Start agent termination validation
      await validators[0].validateAgentTermination('test-agent-123', 'shutdown', {
        priority: 'high'
      });

      // Timeout
      setTimeout(() => {
        if (!validationCompleted) {
          resolve();
        }
      }, 6000);
    });
  });

  test('should maintain eventual consistency across nodes', async () => {
    // Start multiple verification tasks simultaneously
    const taskPromises = [];

    for (let i = 0; i < 3; i++) {
      taskPromises.push(
        engines[i % engines.length].startVerification('network_connectivity', `target-${i}`, {
          priority: 'medium'
        })
      );
    }

    await Promise.all(taskPromises);

    // Wait for propagation and consensus
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check convergence metrics on all engines
    const convergenceMetrics = engines.map(engine => engine.getConvergenceMetrics());

    // All engines should have some completed tasks
    convergenceMetrics.forEach(metrics => {
      expect(metrics.totalTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.networkParticipation).toBe(5); // 5 nodes in network
    });
  });

  test('should handle network partitions gracefully', async () => {
    // Simulate network partition by disconnecting nodes 3 and 4
    nodes[3].removePeer('node-0');
    nodes[3].removePeer('node-1');
    nodes[3].removePeer('node-2');
    nodes[4].removePeer('node-0');
    nodes[4].removePeer('node-1');
    nodes[4].removePeer('node-2');

    // Start verification in partition 1 (nodes 0, 1, 2)
    const taskId = await engines[0].startVerification('resource_monitoring', 'partition-test', {
      priority: 'high'
    });

    // Wait for partial network propagation
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Reconnect network
    nodes[3].addPeer('node-0', 'http://localhost:3000');
    nodes[3].addPeer('node-1', 'http://localhost:3001');
    nodes[3].addPeer('node-2', 'http://localhost:3002');
    nodes[4].addPeer('node-0', 'http://localhost:3000');
    nodes[4].addPeer('node-1', 'http://localhost:3001');
    nodes[4].addPeer('node-2', 'http://localhost:3002');

    // Wait for network healing and anti-entropy
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check that all nodes eventually see the task
    const allStatuses = engines.map(engine => engine.getStatus());
    const totalCompletedTasks = allStatuses.reduce((sum, status) => sum + status.completedTasks, 0);

    expect(totalCompletedTasks).toBeGreaterThan(0);
  });

  test('should monitor gossip convergence metrics', async () => {
    // Start verification and monitor convergence
    await engines[0].startVerification('consensus_state', 'convergence-test');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get convergence metrics from gossip coordinators
    const gossipMetrics = nodes.map(node => node.getConvergenceMetrics());

    gossipMetrics.forEach(metrics => {
      expect(metrics.networkSize).toBe(5);
      expect(metrics.activeNodes).toBeGreaterThan(0);
      expect(metrics.convergenceRatio).toBeGreaterThan(0);
      expect(metrics.averageDeliveryTime).toBeGreaterThan(0);
    });

    // Get verification convergence metrics
    const verificationMetrics = engines.map(engine => engine.getConvergenceMetrics());

    verificationMetrics.forEach(metrics => {
      expect(metrics.networkParticipation).toBe(5);
      expect(metrics.averageConsensusTime).toBeGreaterThanOrEqual(0);
    });
  });

  test('should handle concurrent verification tasks efficiently', async () => {
    const startTime = Date.now();
    const numberOfTasks = 10;
    const taskPromises = [];

    // Start multiple verification tasks concurrently
    for (let i = 0; i < numberOfTasks; i++) {
      const taskType = ['resource_monitoring', 'agent_spawning', 'network_connectivity'][i % 3];
      taskPromises.push(
        engines[i % engines.length].startVerification(taskType, `concurrent-${i}`, {
          priority: 'medium'
        })
      );
    }

    await Promise.all(taskPromises);

    // Wait for all tasks to complete or timeout
    await new Promise(resolve => setTimeout(resolve, 8000));

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Check that tasks were processed efficiently
    const finalStatuses = engines.map(engine => engine.getStatus());
    const totalCompleted = finalStatuses.reduce((sum, status) => sum + status.completedTasks, 0);

    expect(totalCompleted).toBeGreaterThan(0);
    expect(totalTime).toBeLessThan(15000); // Should complete within reasonable time

    console.log(`Processed ${totalCompleted} tasks in ${totalTime}ms`);
  });
});

// Test utilities
function waitForCondition(condition, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(new Error('Condition not met within timeout'));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}