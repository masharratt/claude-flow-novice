/**
 * Load Test: Concurrent Agent Operations
 *
 * Target: Support 100 concurrent agents
 *
 * Tests:
 * - Concurrent agent spawning
 * - Parallel agent execution
 * - Resource contention handling
 * - System stability under load
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { DatabaseService } from '../../src/lib/database-service';
import { RedisCoordination } from '../../src/coordination';
import { AgentWorkspace } from '../../src/lib/agent-workspace';
import { MetricsLogger } from '../../src/lib/metrics-logger';
import { buildAgentKey } from '../../src/lib/database-service';

describe('Concurrent Agent Load Tests', () => {
  let dbService: DatabaseService;
  let coordination: RedisCoordination;
  let workspace: AgentWorkspace;
  let metricsLogger: MetricsLogger;

  beforeAll(async () => {
    dbService = new DatabaseService({
      redis: { type: 'redis', host: 'localhost', port: 6379 },
      sqlite: { type: 'sqlite', database: ':memory:' },
    });

    await dbService.initialize();

    coordination = new RedisCoordination({
      host: 'localhost',
      port: 6379,
    });

    await coordination.connect();

    workspace = new AgentWorkspace({
      baseDir: '.test-concurrent-workspace',
    });

    await workspace.initialize();

    metricsLogger = new MetricsLogger({
      enableRedis: true,
    });
  });

  afterAll(async () => {
    if (dbService) { await dbService.disconnect(); };
    await coordination.disconnect();
    await workspace.cleanup();
    await metricsLogger.close();
  });

  it('should spawn 100 agents concurrently within 5s', async () => {
    const agentCount = 100;
    const taskId = 'load-test-spawn';

    const start = Date.now();

    const promises = [];
    for (let i = 0; i < agentCount; i++) {
      const agentId = `agent-${i.toString().padStart(3, '0')}`;
      promises.push(
        workspace.createAgent(agentId, {
          task_id: taskId,
          type: 'test-agent',
          status: 'spawned',
        })
      );
    }

    await Promise.all(promises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000);

    const agents = await workspace.listAgents({ task_id: taskId });
    expect(agents).toHaveLength(agentCount);
  }, 10000);

  it('should handle 100 concurrent agent status updates', async () => {
    const agentCount = 100;
    const taskId = 'load-test-updates';

    // Create agents
    for (let i = 0; i < agentCount; i++) {
      const agentId = `update-agent-${i}`;
      await workspace.createAgent(agentId, {
        task_id: taskId,
        status: 'spawned',
      });
    }

    // Concurrent updates
    const start = Date.now();

    const updatePromises = [];
    for (let i = 0; i < agentCount; i++) {
      const agentId = `update-agent-${i}`;
      updatePromises.push(
        workspace.updateAgent(agentId, {
          status: 'running',
          confidence: 0.75 + (Math.random() * 0.2),
        })
      );
    }

    await Promise.all(updatePromises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(3000);

    // Verify all updated
    const agents = await workspace.listAgents({ task_id: taskId });
    const runningAgents = agents.filter(a => a.status === 'running');
    expect(runningAgents).toHaveLength(agentCount);
  }, 10000);

  it('should maintain coordination with 100 concurrent agents', async () => {
    const agentCount = 100;
    const taskId = 'load-test-coord';

    const start = Date.now();

    const coordPromises = [];
    for (let i = 0; i < agentCount; i++) {
      const agentId = `coord-agent-${i}`;
      coordPromises.push(
        (async () => {
          // Register agent
          await dbService.set('redis', buildAgentKey(agentId), {
            id: agentId,
            task_id: taskId,
            status: 'running',
          });

          // Signal completion
          await coordination.signal(`agent:${agentId}:done`, {
            status: 'completed',
            confidence: 0.85,
          });
        })()
      );
    }

    await Promise.all(coordPromises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000);

    // Verify all agents registered
    const agents = await dbService.query('redis', 'agent:coord-agent-*');
    expect(agents).toHaveLength(agentCount);
  }, 10000);

  it('should log metrics for 100 concurrent agents', async () => {
    const agentCount = 100;

    const start = Date.now();

    const metricPromises = [];
    for (let i = 0; i < agentCount; i++) {
      metricPromises.push(
        metricsLogger.log({
          name: 'agent_metric',
          value: i,
          tags: {
            agent_id: `metric-agent-${i}`,
            type: 'load-test',
          },
        })
      );
    }

    await Promise.all(metricPromises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(2000);
  }, 10000);

  it('should handle agent barrier synchronization with 100 agents', async () => {
    const agentCount = 100;
    const taskId = 'barrier-load-test';

    await coordination.createBarrier(`task:${taskId}:barrier`, agentCount);

    const start = Date.now();

    const arrivalPromises = [];
    for (let i = 0; i < agentCount; i++) {
      const agentId = `barrier-agent-${i}`;
      arrivalPromises.push(
        coordination.arriveAtBarrier(`task:${taskId}:barrier`, agentId)
      );
    }

    const results = await Promise.all(arrivalPromises);
    const duration = Date.now() - start;

    expect(results).toHaveLength(agentCount);
    expect(results.every(r => r.released)).toBe(true);
    expect(duration).toBeLessThan(3000);
  }, 10000);

  it('should maintain performance under sustained concurrent load', async () => {
    const concurrentAgents = 50;
    const operationsPerAgent = 10;
    const taskId = 'sustained-load';

    const start = Date.now();

    const agentWorkloads = [];
    for (let i = 0; i < concurrentAgents; i++) {
      const agentId = `sustained-agent-${i}`;
      agentWorkloads.push(
        (async () => {
          for (let op = 0; op < operationsPerAgent; op++) {
            await workspace.createAgent(`${agentId}-op${op}`, {
              task_id: taskId,
              status: 'running',
            });

            await metricsLogger.log({
              name: 'operation',
              value: op,
              tags: { agent_id: agentId },
            });

            await new Promise(resolve => setTimeout(resolve, 10));
          }
        })()
      );
    }

    await Promise.all(agentWorkloads);
    const duration = Date.now() - start;

    const totalOperations = concurrentAgents * operationsPerAgent;
    const throughput = totalOperations / (duration / 1000);

    expect(throughput).toBeGreaterThan(50); // ops/second
    expect(duration).toBeLessThan(15000);
  }, 20000);

  it('should recover gracefully from concurrent failures', async () => {
    const agentCount = 50;
    const failureRate = 0.2; // 20% failure rate

    const promises = [];
    for (let i = 0; i < agentCount; i++) {
      const agentId = `failure-agent-${i}`;
      promises.push(
        (async () => {
          try {
            await workspace.createAgent(agentId, {
              task_id: 'failure-test',
              status: 'running',
            });

            // Simulate random failures
            if (Math.random() < failureRate) {
              throw new Error('Simulated failure');
            }

            await workspace.updateAgent(agentId, { status: 'completed' });
          } catch (error) {
            // Record failure
            await metricsLogger.log({
              name: 'agent_failure',
              tags: { agent_id: agentId },
            });
          }
        })()
      );
    }

    await Promise.all(promises);

    const agents = await workspace.listAgents({ task_id: 'failure-test' });
    const completedAgents = agents.filter(a => a.status === 'completed');

    // Should have > 70% success rate despite failures
    expect(completedAgents.length).toBeGreaterThan(agentCount * 0.7);
  }, 15000);
});
