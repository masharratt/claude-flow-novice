/**
 * Integration Test Suite: Coordination Protocols
 *
 * Tests integration points from:
 * - Task 2.1: Redis Coordination Layer
 * - Task 2.2: Schema Mapping Service
 * - Task 2.3: Unified Metrics & Logging
 * - Task 2.4: Agent Lifecycle Management
 *
 * Coverage: 12 integration points
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { RedisCoordination } from '../../src/coordination';
import { SchemaTransform } from '../../src/lib/schema-transform';
import { MetricsLogger } from '../../src/lib/metrics-logger';
import { AgentWorkspace } from '../../src/lib/agent-workspace';

describe('Coordination Protocols Integration', () => {
  let coordination: RedisCoordination;
  let schemaTransform: SchemaTransform;
  let metricsLogger: MetricsLogger;
  let workspace: AgentWorkspace;

  beforeAll(async () => {
    coordination = new RedisCoordination({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      namespace: 'test',
    });

    await coordination.connect();

    schemaTransform = new SchemaTransform();
    metricsLogger = new MetricsLogger({
      enableRedis: true,
      enableSQLite: true,
      namespace: 'test',
    });

    workspace = new AgentWorkspace({
      baseDir: '.test-workspace',
    });

    await workspace.initialize();
  });

  afterAll(async () => {
    await coordination.disconnect();
    await metricsLogger.close();
    await workspace.cleanup();
  });

  beforeEach(async () => {
    await coordination.clear('test:*');
  });

  describe('Task 2.1: Redis Coordination Layer', () => {
    it('should broadcast messages to all agents', async () => {
      const taskId = 'broadcast-test-001';
      const agents = ['agent-001', 'agent-002', 'agent-003'];

      // Subscribe agents
      const subscribers = await Promise.all(
        agents.map(agentId => coordination.subscribe(`task:${taskId}:${agentId}`))
      );

      // Broadcast message
      await coordination.broadcast(`task:${taskId}:*`, {
        type: 'start_work',
        payload: { task: 'integration test' },
      });

      // Verify all agents received message
      const messages = await Promise.all(
        subscribers.map(sub => sub.waitForMessage(2000))
      );

      expect(messages).toHaveLength(3);
      messages.forEach(msg => {
        expect(msg.type).toBe('start_work');
      });

      // Cleanup
      await Promise.all(subscribers.map(sub => sub.unsubscribe()));
    });

    it('should support point-to-point messaging', async () => {
      const agentId = 'p2p-agent-001';
      const channel = `agent:${agentId}:messages`;

      const subscriber = await coordination.subscribe(channel);

      await coordination.publish(channel, {
        from: 'coordinator',
        to: agentId,
        message: 'direct message',
      });

      const received = await subscriber.waitForMessage(2000);
      expect(received.to).toBe(agentId);
      expect(received.message).toBe('direct message');

      await subscriber.unsubscribe();
    });

    it('should implement blocking wait with timeout', async () => {
      const signal = 'test:wait:signal';

      const waitPromise = coordination.wait(signal, 2000);

      // Signal should timeout
      await expect(waitPromise).rejects.toThrow(/timeout/i);

      // Now test successful signal
      const waitPromise2 = coordination.wait(signal, 5000);

      setTimeout(() => {
        coordination.signal(signal, { status: 'ready' });
      }, 500);

      const result = await waitPromise2;
      expect(result.status).toBe('ready');
    });

    it('should support coordination barriers', async () => {
      const barrier = 'test:barrier:gate';
      const participants = 3;

      await coordination.createBarrier(barrier, participants);

      // Simulate agents arriving at barrier
      const arrivals = [];
      for (let i = 0; i < participants; i++) {
        arrivals.push(
          coordination.arriveAtBarrier(barrier, `agent-00${i + 1}`)
        );
      }

      // All should be released when all arrive
      const results = await Promise.all(arrivals);
      expect(results).toHaveLength(participants);
      results.forEach(result => {
        expect(result.released).toBe(true);
      });
    });

    it('should track agent liveness with heartbeats', async () => {
      const agentId = 'heartbeat-agent-001';

      await coordination.startHeartbeat(agentId, 1000);

      // Wait and check status
      await new Promise(resolve => setTimeout(resolve, 1500));

      const isAlive = await coordination.isAgentAlive(agentId);
      expect(isAlive).toBe(true);

      // Stop heartbeat and verify timeout
      await coordination.stopHeartbeat(agentId);
      await new Promise(resolve => setTimeout(resolve, 3000));

      const stillAlive = await coordination.isAgentAlive(agentId, 2000);
      expect(stillAlive).toBe(false);
    });
  });

  describe('Task 2.2: Schema Mapping Service', () => {
    it('should transform between different data formats', () => {
      const redisFormat = {
        task_id: 'task-001',
        agent_id: 'agent-001',
        confidence_score: 0.85,
      };

      const postgresFormat = schemaTransform.toPostgres(redisFormat);

      expect(postgresFormat).toEqual({
        taskId: 'task-001',
        agentId: 'agent-001',
        confidenceScore: 0.85,
      });

      const backToRedis = schemaTransform.toRedis(postgresFormat);
      expect(backToRedis).toEqual(redisFormat);
    });

    it('should handle nested object transformations', () => {
      const complexData = {
        task_id: 'task-001',
        metadata: {
          agent_type: 'backend-developer',
          skill_versions: ['1.0.0', '1.1.0'],
        },
        execution_stats: {
          start_time: '2024-01-01T00:00:00Z',
          end_time: '2024-01-01T00:05:00Z',
        },
      };

      const transformed = schemaTransform.toPostgres(complexData);

      expect(transformed.metadata.agentType).toBe('backend-developer');
      expect(transformed.executionStats.startTime).toBe('2024-01-01T00:00:00Z');
    });

    it('should support custom transformation rules', () => {
      schemaTransform.addRule('custom_field', (value) => ({
        customField: value.toUpperCase(),
      }));

      const data = { custom_field: 'test' };
      const transformed = schemaTransform.transform(data, 'postgres');

      expect(transformed.customField).toBe('TEST');
    });

    it('should validate schema compatibility', () => {
      const validSchema = {
        task_id: 'string',
        confidence: 'number',
        status: 'string',
      };

      const invalidSchema = {
        unknown_field: 'invalid',
      };

      expect(schemaTransform.isValid(validSchema)).toBe(true);
      expect(schemaTransform.isValid(invalidSchema)).toBe(false);
    });
  });

  describe('Task 2.3: Unified Metrics & Logging', () => {
    it('should log metrics to both Redis and SQLite', async () => {
      const metric = {
        name: 'agent_execution_time',
        value: 1234,
        tags: { agent_id: 'agent-001', task_id: 'task-001' },
        timestamp: new Date().toISOString(),
      };

      await metricsLogger.log(metric);

      // Verify in Redis
      const redisMetrics = await metricsLogger.query({
        source: 'redis',
        name: 'agent_execution_time',
      });
      expect(redisMetrics.length).toBeGreaterThan(0);
      expect(redisMetrics[0].value).toBe(1234);

      // Verify in SQLite
      const sqliteMetrics = await metricsLogger.query({
        source: 'sqlite',
        name: 'agent_execution_time',
      });
      expect(sqliteMetrics.length).toBeGreaterThan(0);
    });

    it('should support metric aggregation', async () => {
      const metrics = [
        { name: 'response_time', value: 100, tags: { endpoint: '/api' } },
        { name: 'response_time', value: 150, tags: { endpoint: '/api' } },
        { name: 'response_time', value: 200, tags: { endpoint: '/api' } },
      ];

      for (const metric of metrics) {
        await metricsLogger.log(metric);
      }

      const aggregated = await metricsLogger.aggregate({
        name: 'response_time',
        operation: 'avg',
        groupBy: 'endpoint',
      });

      expect(aggregated['/api'].avg).toBeCloseTo(150, 0);
    });

    it('should implement log level filtering', async () => {
      await metricsLogger.log({ level: 'debug', message: 'debug msg' });
      await metricsLogger.log({ level: 'info', message: 'info msg' });
      await metricsLogger.log({ level: 'error', message: 'error msg' });

      const errorLogs = await metricsLogger.query({
        level: 'error',
      });

      expect(errorLogs.length).toBe(1);
      expect(errorLogs[0].message).toBe('error msg');
    });

    it('should support distributed tracing', async () => {
      const traceId = 'trace-001';
      const spanId = 'span-001';

      await metricsLogger.startTrace(traceId, spanId, {
        operation: 'agent_execution',
        agent_id: 'agent-001',
      });

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));

      await metricsLogger.endTrace(traceId, spanId, {
        status: 'success',
        output_size: 1024,
      });

      const trace = await metricsLogger.getTrace(traceId);
      expect(trace.spans).toHaveLength(1);
      expect(trace.spans[0].duration).toBeGreaterThan(90);
    });
  });

  describe('Task 2.4: Agent Lifecycle Management', () => {
    it('should track agent spawning and completion', async () => {
      const agentId = 'lifecycle-agent-001';
      const taskId = 'lifecycle-task-001';

      await workspace.createAgent(agentId, {
        task_id: taskId,
        type: 'backend-developer',
        status: 'spawned',
      });

      await workspace.updateAgent(agentId, { status: 'running' });
      await workspace.updateAgent(agentId, { status: 'completed', confidence: 0.88 });

      const lifecycle = await workspace.getAgentLifecycle(agentId);

      expect(lifecycle.events).toContainEqual(
        expect.objectContaining({ status: 'spawned' })
      );
      expect(lifecycle.events).toContainEqual(
        expect.objectContaining({ status: 'running' })
      );
      expect(lifecycle.events).toContainEqual(
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('should handle agent failure and recovery', async () => {
      const agentId = 'recovery-agent-001';

      await workspace.createAgent(agentId, { status: 'spawned' });
      await workspace.updateAgent(agentId, { status: 'running' });

      // Simulate failure
      await workspace.updateAgent(agentId, {
        status: 'failed',
        error: 'Connection timeout',
      });

      // Trigger recovery
      await workspace.recoverAgent(agentId);

      const status = await workspace.getAgentStatus(agentId);
      expect(status.status).toBe('recovered');
      expect(status.recoveryAttempts).toBe(1);
    });

    it('should support agent checkpointing', async () => {
      const agentId = 'checkpoint-agent-001';

      await workspace.createAgent(agentId, { status: 'running' });

      // Create checkpoints
      await workspace.checkpoint(agentId, {
        iteration: 1,
        state: { processed: 100 },
      });

      await workspace.checkpoint(agentId, {
        iteration: 2,
        state: { processed: 200 },
      });

      const checkpoints = await workspace.getCheckpoints(agentId);
      expect(checkpoints).toHaveLength(2);
      expect(checkpoints[1].state.processed).toBe(200);

      // Restore from checkpoint
      const restored = await workspace.restoreCheckpoint(agentId, 1);
      expect(restored.state.processed).toBe(100);
    });

    it('should track resource usage per agent', async () => {
      const agentId = 'resource-agent-001';

      await workspace.createAgent(agentId, { status: 'running' });

      await workspace.recordResourceUsage(agentId, {
        cpu_percent: 45,
        memory_mb: 256,
        io_operations: 1000,
      });

      const usage = await workspace.getResourceUsage(agentId);
      expect(usage.cpu_percent).toBe(45);
      expect(usage.memory_mb).toBe(256);
    });
  });

  describe('Cross-Protocol Integration', () => {
    it('should coordinate agent workflow across all protocols', async () => {
      const taskId = 'cross-protocol-task';
      const agents = ['agent-001', 'agent-002', 'agent-003'];

      // 1. Broadcast task start
      await coordination.broadcast(`task:${taskId}:*`, {
        type: 'task_start',
        task_id: taskId,
      });

      // 2. Create agent workspaces
      for (const agentId of agents) {
        await workspace.createAgent(agentId, {
          task_id: taskId,
          status: 'spawned',
        });
      }

      // 3. Track metrics
      for (const agentId of agents) {
        await metricsLogger.log({
          name: 'agent_spawned',
          tags: { agent_id: agentId, task_id: taskId },
        });

        await workspace.updateAgent(agentId, { status: 'running' });
      }

      // 4. Coordination barrier - all agents ready
      await coordination.createBarrier(`task:${taskId}:ready`, agents.length);

      const arrivals = agents.map(agentId =>
        coordination.arriveAtBarrier(`task:${taskId}:ready`, agentId)
      );
      await Promise.all(arrivals);

      // 5. Execute work (simulated)
      for (const agentId of agents) {
        await workspace.checkpoint(agentId, {
          iteration: 1,
          state: { confidence: 0.75 + Math.random() * 0.15 },
        });

        await metricsLogger.log({
          name: 'agent_confidence',
          value: 0.85,
          tags: { agent_id: agentId },
        });
      }

      // 6. Signal completion
      for (const agentId of agents) {
        await workspace.updateAgent(agentId, { status: 'completed' });
        await coordination.signal(`agent:${agentId}:done`, { status: 'success' });
      }

      // 7. Verify workflow
      const metrics = await metricsLogger.query({ name: 'agent_spawned' });
      expect(metrics.length).toBeGreaterThanOrEqual(3);

      for (const agentId of agents) {
        const lifecycle = await workspace.getAgentLifecycle(agentId);
        expect(lifecycle.events).toContainEqual(
          expect.objectContaining({ status: 'completed' })
        );
      }
    });
  });

  describe('Performance & Reliability', () => {
    it('should handle high-frequency coordination events', async () => {
      const taskId = 'perf-test';
      const eventCount = 100;

      const start = Date.now();

      const promises = [];
      for (let i = 0; i < eventCount; i++) {
        promises.push(
          coordination.publish(`task:${taskId}:events`, {
            event_id: i,
            timestamp: Date.now(),
          })
        );
      }

      await Promise.all(promises);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000); // Should handle 100 events in <2s
    });

    it('should recover from Redis connection failures', async () => {
      // Simulate connection drop
      await coordination.disconnect();

      let error = null;
      try {
        await coordination.publish('test:channel', { data: 'test' });
      } catch (e) {
        error = e;
      }

      expect(error).not.toBeNull();

      // Reconnect and verify
      await coordination.connect();
      await coordination.publish('test:channel', { data: 'test' });

      // Should work after reconnection
      const subscriber = await coordination.subscribe('test:channel');
      await coordination.publish('test:channel', { data: 'success' });

      const msg = await subscriber.waitForMessage(2000);
      expect(msg.data).toBe('success');

      await subscriber.unsubscribe();
    });

    it('should handle concurrent agent operations without race conditions', async () => {
      const taskId = 'concurrent-ops';
      const agentCount = 20;

      const promises = [];
      for (let i = 0; i < agentCount; i++) {
        const agentId = `concurrent-agent-${i}`;
        promises.push(
          workspace.createAgent(agentId, {
            task_id: taskId,
            index: i,
          }).then(() =>
            workspace.updateAgent(agentId, { status: 'completed' })
          )
        );
      }

      await Promise.all(promises);

      const agents = await workspace.listAgents({ task_id: taskId });
      expect(agents).toHaveLength(agentCount);

      // Verify all completed
      const completed = agents.filter(a => a.status === 'completed');
      expect(completed).toHaveLength(agentCount);
    });
  });
});
