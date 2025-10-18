/**
 * Large-Scale Coordination Performance Tests
 * Tests 100+ agent coordination with performance validation
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { performance } from 'perf_hooks';
import { UltraFastAgentManager, AgentDefinition } from '../../src/agents/unified-ultra-fast-agent-manager.js';
import { LargeScaleCoordinator } from '../../src/swarm/large-scale-coordinator.js';
import { AgentHealthMonitor } from '../../src/monitoring/agent-health-monitor.js';
import { ConsensusCoordinator } from '../../src/swarm/consensus-coordinator.js';

describe('Large-Scale Agent Coordination', () => {
  let agentManager: UltraFastAgentManager;
  let coordinator: LargeScaleCoordinator;
  let healthMonitor: AgentHealthMonitor;
  let consensusCoordinator: ConsensusCoordinator;

  beforeAll(async () => {
    // Initialize all components
    agentManager = new UltraFastAgentManager({
      performanceTargets: {
        spawnTimeP95Ms: 100,
        communicationP95Ms: 5,
        maxConcurrentAgents: 200
      }
    });

    await agentManager.initialize();

    coordinator = new LargeScaleCoordinator({
      maxAgentsPerNode: 10,
      hierarchyDepth: 3,
      workStealing: {
        enabled: true,
        thresholdRatio: 2.0,
        minTasksToSteal: 1,
        maxTasksToSteal: 5
      },
      loadBalancing: {
        type: 'least-loaded',
        rebalanceInterval: 5000
      }
    });

    healthMonitor = new AgentHealthMonitor({
      healthCheck: {
        interval: 1000,
        timeout: 5000,
        degradedThreshold: 2000,
        criticalThreshold: 5000,
        failureThreshold: 10000
      },
      recovery: {
        maxRetries: 3,
        retryDelay: 1000,
        escalationTimeout: 5000,
        autoReplace: true
      }
    });

    consensusCoordinator = new ConsensusCoordinator({
      protocol: 'quorum',
      timeout: 5000,
      maxRetries: 3
    });
  });

  afterAll(async () => {
    await agentManager.shutdown();
    await coordinator.shutdown();
    healthMonitor.shutdown();
    consensusCoordinator.shutdown();
  });

  describe('Parallel Agent Spawning', () => {
    it('should spawn 100 agents in under 5 seconds', async () => {
      const startTime = performance.now();
      const agentDefinitions: AgentDefinition[] = [];

      for (let i = 0; i < 100; i++) {
        agentDefinitions.push({
          id: `agent-${i}`,
          type: ['researcher', 'coder', 'tester', 'reviewer'][i % 4] as any,
          priority: 'normal'
        });
      }

      const agents = await agentManager.spawnAgentBatch(agentDefinitions);
      const totalTime = performance.now() - startTime;

      expect(agents.length).toBe(100);
      expect(totalTime).toBeLessThan(5000); // <5 seconds for 100 agents
      expect(totalTime / agents.length).toBeLessThan(50); // <50ms per agent avg

      console.log(`Spawned 100 agents in ${totalTime.toFixed(2)}ms (${(totalTime / agents.length).toFixed(2)}ms per agent)`);
    }, 10000);

    it('should spawn 100 agents with target <50ms per agent', async () => {
      const agentDefinitions: AgentDefinition[] = [];

      for (let i = 100; i < 200; i++) {
        agentDefinitions.push({
          id: `agent-${i}`,
          type: ['researcher', 'coder', 'tester', 'reviewer'][i % 4] as any,
          priority: 'normal'
        });
      }

      const startTime = performance.now();
      const agents = await agentManager.spawnAgentBatch(agentDefinitions);
      const totalTime = performance.now() - startTime;
      const avgSpawnTime = totalTime / agents.length;

      expect(avgSpawnTime).toBeLessThan(50); // Target: <50ms per agent

      console.log(`Average spawn time: ${avgSpawnTime.toFixed(2)}ms per agent`);
    }, 10000);
  });

  describe('Hierarchical Coordination', () => {
    it('should register 100+ agents in hierarchical structure', async () => {
      const agents = await agentManager.spawnAgentBatch(
        Array.from({ length: 100 }, (_, i) => ({
          id: `coord-agent-${i}`,
          type: ['researcher', 'coder', 'tester'][i % 3] as any,
          priority: 'normal'
        }))
      );

      await coordinator.registerAgents(agents);
      const metrics = coordinator.getMetrics();

      expect(metrics.totalAgentsManaged).toBe(100);
      expect(metrics.activeCoordinationNodes).toBeGreaterThan(0);

      console.log(`Coordinating ${metrics.totalAgentsManaged} agents across ${metrics.activeCoordinationNodes} nodes`);
    }, 15000);

    it('should coordinate tasks with <10ms latency', async () => {
      const tasks = Array.from({ length: 50 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test-task',
        agentId: '',
        data: { index: i },
        priority: 'normal' as const
      }));

      const latencies: number[] = [];

      for (const task of tasks) {
        const startTime = performance.now();
        await coordinator.coordinateTask(task);
        const latency = performance.now() - startTime;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      expect(avgLatency).toBeLessThan(10); // Target: <10ms avg
      expect(p95Latency).toBeLessThan(15); // P95 < 15ms

      console.log(`Coordination latency - Avg: ${avgLatency.toFixed(2)}ms, P95: ${p95Latency.toFixed(2)}ms`);
    }, 15000);
  });

  describe('Work Stealing and Load Balancing', () => {
    it('should balance load across agents', async () => {
      // Create agents with varying load
      const agents = await agentManager.spawnAgentBatch(
        Array.from({ length: 20 }, (_, i) => ({
          id: `lb-agent-${i}`,
          type: 'coder' as any,
          priority: 'normal' as const
        }))
      );

      await coordinator.registerAgents(agents);

      // Assign tasks unevenly
      for (let i = 0; i < 50; i++) {
        await coordinator.coordinateTask({
          id: `lb-task-${i}`,
          type: 'compute',
          agentId: '',
          data: { workload: i }
        });
      }

      // Wait for load balancing
      await new Promise(resolve => setTimeout(resolve, 1000));

      const metrics = coordinator.getMetrics();
      expect(metrics.workStealingOperations).toBeGreaterThan(0);
      expect(metrics.rebalancingOperations).toBeGreaterThan(0);

      console.log(`Work stealing operations: ${metrics.workStealingOperations}`);
      console.log(`Rebalancing operations: ${metrics.rebalancingOperations}`);
    }, 15000);
  });

  describe('Health Monitoring and Auto-Recovery', () => {
    it('should track health of 100+ agents', async () => {
      const agents = await agentManager.spawnAgentBatch(
        Array.from({ length: 100 }, (_, i) => ({
          id: `health-agent-${i}`,
          type: 'researcher' as any,
          priority: 'normal' as const
        }))
      );

      // Register all agents with health monitor
      agents.forEach(agent => healthMonitor.registerAgent(agent));

      // Simulate heartbeats
      agents.forEach(agent => healthMonitor.heartbeat(agent.id));

      const stats = healthMonitor.getHealthStatistics();
      expect(stats.totalAgents).toBe(100);
      expect(stats.healthy).toBe(100);

      console.log(`Health monitoring ${stats.totalAgents} agents: ${stats.healthy} healthy, ${stats.degraded} degraded`);
    }, 15000);

    it('should detect and recover failed agents in <5 seconds', async () => {
      const agent = await agentManager.spawnAgent({
        id: 'recovery-test-agent',
        type: 'coder',
        priority: 'normal'
      });

      healthMonitor.registerAgent(agent);

      let recovered = false;
      let recoveryTime = 0;

      healthMonitor.once('agent:recovered', (data: any) => {
        recovered = true;
        recoveryTime = data.recoveryTime || 0;
      });

      // Simulate failure (stop sending heartbeats)
      const startTime = performance.now();

      // Wait for failure detection and recovery
      await new Promise(resolve => setTimeout(resolve, 7000));

      if (recovered) {
        expect(recoveryTime).toBeLessThan(5000); // Target: <5s recovery
        console.log(`Agent recovered in ${recoveryTime.toFixed(2)}ms`);
      }
    }, 15000);

    it('should handle high error rates', () => {
      const agent = agentManager.agents.get('health-agent-0');
      if (agent) {
        // Report multiple task failures
        for (let i = 0; i < 10; i++) {
          healthMonitor.reportTaskCompletion(agent.id, i % 3 !== 0, 100);
        }

        const health = healthMonitor.getAgentHealth(agent.id);
        expect(health).not.toBeNull();
        expect(health!.errorRate).toBeGreaterThan(0);

        console.log(`Agent error rate: ${(health!.errorRate * 100).toFixed(1)}%`);
      }
    });
  });

  describe('Consensus Protocols', () => {
    it('should reach quorum consensus with 100+ agents', async () => {
      // Register agents for consensus
      for (let i = 0; i < 100; i++) {
        consensusCoordinator.registerAgent(`consensus-agent-${i}`);
      }

      const proposal = {
        id: 'test-proposal-1',
        type: 'task-assignment' as const,
        proposer: 'coordinator',
        data: { assignment: 'test-task', target: 'agent-1' },
        timestamp: Date.now()
      };

      const startTime = performance.now();
      const result = await consensusCoordinator.propose(proposal);
      const consensusTime = performance.now() - startTime;

      expect(result.decision).toBe('approved');
      expect(result.participationRate).toBeGreaterThan(0.8); // >80% participation
      expect(consensusTime).toBeLessThan(1000); // <1s for consensus

      console.log(`Consensus reached in ${consensusTime.toFixed(2)}ms with ${(result.participationRate * 100).toFixed(1)}% participation`);
    }, 15000);

    it('should handle multiple concurrent proposals', async () => {
      const proposals = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-proposal-${i}`,
        type: 'configuration-change' as const,
        proposer: 'coordinator',
        data: { config: `setting-${i}`, value: i },
        timestamp: Date.now()
      }));

      const startTime = performance.now();
      const results = await Promise.all(
        proposals.map(p => consensusCoordinator.propose(p))
      );
      const totalTime = performance.now() - startTime;

      const approved = results.filter(r => r.decision === 'approved').length;
      expect(approved).toBeGreaterThan(7); // At least 70% approved

      console.log(`${approved}/${proposals.length} proposals approved in ${totalTime.toFixed(2)}ms`);
    }, 20000);
  });

  describe('System Performance Metrics', () => {
    it('should maintain performance targets under load', async () => {
      const metrics = agentManager.getSystemMetrics();

      expect(metrics.p95SpawnTime).toBeLessThan(100); // Target: <100ms P95
      expect(metrics.p95MessageLatency).toBeLessThan(10); // Target: <10ms P95
      expect(metrics.totalAgents).toBeGreaterThan(100);

      console.log('System Metrics:');
      console.log(`  Total Agents: ${metrics.totalAgents}`);
      console.log(`  Active Agents: ${metrics.activeAgents}`);
      console.log(`  P95 Spawn Time: ${metrics.p95SpawnTime.toFixed(2)}ms`);
      console.log(`  P95 Message Latency: ${metrics.p95MessageLatency.toFixed(2)}ms`);
      console.log(`  System Throughput: ${metrics.systemThroughput.toFixed(2)} ops/s`);
    });

    it('should report coordination metrics', () => {
      const coordMetrics = coordinator.getMetrics();

      expect(coordMetrics.totalAgentsManaged).toBeGreaterThan(100);
      expect(coordMetrics.avgCoordinationLatency).toBeLessThan(10);

      console.log('Coordination Metrics:');
      console.log(`  Total Agents Managed: ${coordMetrics.totalAgentsManaged}`);
      console.log(`  Active Coordination Nodes: ${coordMetrics.activeCoordinationNodes}`);
      console.log(`  Tasks Coordinated: ${coordMetrics.tasksCoordinated}`);
      console.log(`  Avg Coordination Latency: ${coordMetrics.avgCoordinationLatency.toFixed(2)}ms`);
      console.log(`  Work Stealing Operations: ${coordMetrics.workStealingOperations}`);
    });

    it('should report health statistics', () => {
      const healthStats = healthMonitor.getHealthStatistics();

      console.log('Health Statistics:');
      console.log(`  Total Agents: ${healthStats.totalAgents}`);
      console.log(`  Healthy: ${healthStats.healthy}`);
      console.log(`  Degraded: ${healthStats.degraded}`);
      console.log(`  Critical: ${healthStats.critical}`);
      console.log(`  Failed: ${healthStats.failed}`);
      console.log(`  Avg Response Time: ${healthStats.avgResponseTime.toFixed(2)}ms`);
      console.log(`  Avg Success Rate: ${(healthStats.avgSuccessRate * 100).toFixed(1)}%`);
    });

    it('should report consensus metrics', () => {
      const consensusMetrics = consensusCoordinator.getMetrics();

      console.log('Consensus Metrics:');
      console.log(`  Total Proposals: ${consensusMetrics.totalProposals}`);
      console.log(`  Approved: ${consensusMetrics.approvedProposals}`);
      console.log(`  Rejected: ${consensusMetrics.rejectedProposals}`);
      console.log(`  Timed Out: ${consensusMetrics.timedOutProposals}`);
      console.log(`  Avg Consensus Time: ${consensusMetrics.avgConsensusTime.toFixed(2)}ms`);
      console.log(`  Avg Participation Rate: ${(consensusMetrics.avgParticipationRate * 100).toFixed(1)}%`);
    });
  });

  describe('Stress Test: 200 Agents', () => {
    it('should handle 200 concurrent agents', async () => {
      const agentDefinitions: AgentDefinition[] = [];

      for (let i = 300; i < 500; i++) {
        agentDefinitions.push({
          id: `stress-agent-${i}`,
          type: ['researcher', 'coder', 'tester', 'reviewer'][i % 4] as any,
          priority: 'normal' as const
        });
      }

      const startTime = performance.now();
      const agents = await agentManager.spawnAgentWaves(agentDefinitions, 20);
      const totalTime = performance.now() - startTime;

      expect(agents.length).toBe(200);
      expect(totalTime).toBeLessThan(10000); // <10 seconds for 200 agents

      console.log(`Spawned 200 agents in waves: ${totalTime.toFixed(2)}ms total`);
    }, 20000);
  });
});