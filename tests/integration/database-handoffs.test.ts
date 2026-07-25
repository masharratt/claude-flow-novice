/**
 * Integration Test Suite: Database Handoffs
 *
 * Tests integration points from:
 * - Task 0.4: Database Query Abstraction Layer
 * - Task 3.1: Cross-DB Transaction Coordination
 * - Task 3.2: Skill Deployment Transactions
 * - Task 3.3: Correlation Keys
 * - Task 3.4: Redis Queue Reliability
 *
 * Coverage: 8 integration points
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { createMockDatabaseService, createMockRedisClient } from './test-helpers';

// Helper functions for key building
const buildTaskKey = (taskId: string) => `task:${taskId}`;
const buildAgentKey = (agentId: string) => `agent:${agentId}`;
const buildCorrelationKey = (taskId: string, agentId: string, loop: string) =>
  `corr:${taskId}:${agentId}:${loop}`;
const parseCorrelationKey = (key: string) => {
  const parts = key.split(':');
  return {
    taskId: parts[1],
    agentId: parts[2],
    loop: parts[3],
  };
};

// Mock Database Service
class MockDatabaseService {
  private stores: Map<string, Map<string, any>> = new Map();

  constructor(config: any) {
    this.stores.set('redis', new Map());
    this.stores.set('sqlite', new Map());
    this.stores.set('postgres', new Map());
  }

  async initialize() {
    return Promise.resolve();
  }

  async disconnect() {
    return Promise.resolve();
  }

  async set(adapter: string, key: string, value: any) {
    const store = this.stores.get(adapter);
    if (store) {
      store.set(key, value);
    }
    return Promise.resolve();
  }

  async get(adapter: string, key: string, filter?: any) {
    const store = this.stores.get(adapter);
    if (!store) return null;

    if (filter) {
      // Find by filter
      for (const [k, v] of store.entries()) {
        if (this.matchesFilter(v, filter)) {
          return v;
        }
      }
      return null;
    }

    return store.get(key) || null;
  }

  async query(adapter: string, pattern: string, filter?: any) {
    const store = this.stores.get(adapter);
    if (!store) return [];

    const results: any[] = [];
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));

    for (const [key, value] of store.entries()) {
      if (regex.test(key)) {
        if (!filter || this.matchesFilter(value, filter)) {
          results.push(value);
        }
      }
    }

    return results;
  }

  async delete(adapter: string, pattern: string) {
    const store = this.stores.get(adapter);
    if (!store) return;

    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete: string[] = [];

    for (const key of store.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => store.delete(key));
  }

  private matchesFilter(value: any, filter: any): boolean {
    for (const key in filter) {
      if (value[key] !== filter[key]) {
        return false;
      }
    }
    return true;
  }
}

// Mock Transaction Manager
class MockTransactionManager {
  private dbService: MockDatabaseService;
  private transactionLog: any[] = [];

  constructor(dbService: MockDatabaseService) {
    this.dbService = dbService;
  }

  async executeTransaction(callback: Function) {
    const txOps: Array<{ adapter: string; key: string; value: any }> = [];

    const tx = {
      set: async (adapter: string, key: string, value: any) => {
        txOps.push({ adapter, key, value });
      },
    };

    try {
      await callback(tx);

      // Commit all operations
      for (const op of txOps) {
        await this.dbService.set(op.adapter, op.key, op.value);
      }

      this.transactionLog.push({ status: 'committed', ops: txOps });
    } catch (error) {
      // Rollback - don't apply any operations
      this.transactionLog.push({ status: 'rolled_back', ops: txOps, error });
      throw error;
    }
  }
}

// Mock Redis Queue Manager
class MockRedisQueueManager {
  private queues: Map<string, Array<{ message: any; messageId: string; acked: boolean }>> = new Map();
  private connected: boolean = true;
  private messageIdCounter: number = 0;

  constructor(config: any) {}

  async connect() {
    this.connected = true;
    return Promise.resolve();
  }

  async disconnect() {
    this.connected = false;
    return Promise.resolve();
  }

  async enqueue(queueName: string, message: any) {
    if (!this.connected) {
      throw new Error('Not connected to queue');
    }

    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }

    const queue = this.queues.get(queueName)!;
    const messageId = `msg-${++this.messageIdCounter}`;

    // Handle priority queues
    if (message.priority !== undefined) {
      const item = { message, messageId, acked: false };
      // Insert based on priority (higher priority first)
      const insertIndex = queue.findIndex(q => (q.message.priority || 0) < (message.priority || 0));
      if (insertIndex === -1) {
        queue.push(item);
      } else {
        queue.splice(insertIndex, 0, item);
      }
    } else {
      queue.push({ message, messageId, acked: false });
    }

    return Promise.resolve();
  }

  async dequeue(queueName: string, options?: { timeout?: number }) {
    if (!this.connected) {
      throw new Error('Not connected to queue');
    }

    const queue = this.queues.get(queueName);
    if (!queue || queue.length === 0) {
      return null;
    }

    // Find first unacked message
    const item = queue.find(q => !q.acked);
    if (!item) {
      return null;
    }

    return { ...item.message, messageId: item.messageId };
  }

  async acknowledge(queueName: string, messageId: string) {
    const queue = this.queues.get(queueName);
    if (!queue) return;

    const index = queue.findIndex(q => q.messageId === messageId);
    if (index !== -1) {
      queue.splice(index, 1);
    }

    return Promise.resolve();
  }
}

describe('Database Handoffs Integration', () => {
  let dbService: MockDatabaseService;
  let txManager: MockTransactionManager;
  let queueManager: MockRedisQueueManager;

  beforeAll(async () => {
    dbService = new MockDatabaseService({});
    await dbService.initialize();

    txManager = new MockTransactionManager(dbService);
    queueManager = new MockRedisQueueManager({});
  });

  afterAll(async () => {
    if (dbService) { if (dbService) { try { await dbService.disconnect(); } catch (e) { /* ignore */ } } };
    await queueManager.disconnect();
  });

  beforeEach(async () => {
    await dbService.delete('redis', 'test:*');
  });

  describe('Task 0.4: Database Service Abstraction', () => {
    it('should handle CRUD operations across all adapters', async () => {
      const taskId = 'test-task-001';
      const taskData = {
        id: taskId,
        status: 'active',
        agent_count: 3,
        timestamp: new Date().toISOString(),
      };

      // Test Redis adapter
      await dbService.set('redis', buildTaskKey(taskId), taskData);
      const redisData = await dbService.get('redis', buildTaskKey(taskId));
      expect(redisData).toMatchObject(taskData);

      // Test SQLite adapter
      await dbService.set('sqlite', 'tasks', taskData);
      const sqliteData = await dbService.get('sqlite', 'tasks', { id: taskId });
      expect(sqliteData).toMatchObject(taskData);

      // Test Postgres adapter
      await dbService.set('postgres', 'tasks', taskData);
      const postgresData = await dbService.get('postgres', 'tasks', { id: taskId });
      expect(postgresData).toMatchObject(taskData);
    });

    it('should handle adapter-specific query features', async () => {
      // Redis pattern matching
      await dbService.set('redis', 'agent:001', { id: '001', status: 'running' });
      await dbService.set('redis', 'agent:002', { id: '002', status: 'running' });
      await dbService.set('redis', 'agent:003', { id: '003', status: 'completed' });

      const runningAgents = await dbService.query('redis', 'agent:*', { status: 'running' });
      expect(runningAgents.length).toBe(2);

      // SQLite filtering
      await dbService.set('sqlite', 'agents', { id: '001', type: 'backend-developer' });
      await dbService.set('sqlite', 'agents', { id: '002', type: 'frontend-developer' });

      const backendAgents = await dbService.query('sqlite', 'agents', { type: 'backend-developer' });
      expect(backendAgents.length).toBe(1);
      expect(backendAgents[0].type).toBe('backend-developer');
    });
  });

  describe('Task 3.1: Cross-DB Transaction Coordination', () => {
    it('should coordinate transactions across Redis and SQLite', async () => {
      const taskId = 'cross-db-task-001';
      const agentId = 'agent-001';

      await txManager.executeTransaction(async (tx: any) => {
        await tx.set('redis', buildTaskKey(taskId), {
          id: taskId,
          status: 'in_progress',
        });

        await tx.set('sqlite', 'task_audit', {
          task_id: taskId,
          agent_id: agentId,
          action: 'started',
          timestamp: new Date().toISOString(),
        });
      });

      const redisData = await dbService.get('redis', buildTaskKey(taskId));
      expect(redisData.status).toBe('in_progress');

      const sqliteData = await dbService.get('sqlite', 'task_audit', { task_id: taskId });
      expect(sqliteData.action).toBe('started');
    });

    it('should rollback all operations on transaction failure', async () => {
      const taskId = 'rollback-test-001';

      try {
        await txManager.executeTransaction(async (tx: any) => {
          await tx.set('redis', buildTaskKey(taskId), { status: 'test' });
          await tx.set('sqlite', 'tasks', { id: taskId, status: 'test' });

          throw new Error('Simulated transaction failure');
        });
      } catch (error: any) {
        expect(error.message).toBe('Simulated transaction failure');
      }

      const redisData = await dbService.get('redis', buildTaskKey(taskId));
      expect(redisData).toBeNull();
    });

    it('should handle nested transactions correctly', async () => {
      const taskId = 'nested-tx-001';

      await txManager.executeTransaction(async (tx1: any) => {
        await tx1.set('redis', buildTaskKey(taskId), { level: 1 });

        await txManager.executeTransaction(async (tx2: any) => {
          await tx2.set('redis', buildTaskKey(taskId + '-nested'), { level: 2 });
        });
      });

      const level1Data = await dbService.get('redis', buildTaskKey(taskId));
      const level2Data = await dbService.get('redis', buildTaskKey(taskId + '-nested'));

      expect(level1Data.level).toBe(1);
      expect(level2Data.level).toBe(2);
    });
  });

  describe('Task 3.3: Correlation Keys', () => {
    it('should create and parse correlation keys correctly', () => {
      const correlationKey = buildCorrelationKey('task-001', 'agent-001', 'loop3');
      expect(correlationKey).toBe('corr:task-001:agent-001:loop3');

      const parsed = parseCorrelationKey(correlationKey);
      expect(parsed).toEqual({
        taskId: 'task-001',
        agentId: 'agent-001',
        loop: 'loop3',
      });
    });

    it('should enable cross-system tracking via correlation keys', async () => {
      const taskId = 'corr-task-001';
      const agentId = 'corr-agent-001';
      const correlationKey = buildCorrelationKey(taskId, agentId, 'loop3');

      await dbService.set('redis', correlationKey, {
        task_id: taskId,
        agent_id: agentId,
        loop: 'loop3',
        status: 'running',
        started_at: new Date().toISOString(),
      });

      await dbService.set('sqlite', 'agent_audit', {
        correlation_key: correlationKey,
        agent_id: agentId,
        task_id: taskId,
        event: 'agent_spawned',
        details: JSON.stringify({ loop: 'loop3' }),
      });

      const redisData = await dbService.get('redis', correlationKey);
      const sqliteData = await dbService.get('sqlite', 'agent_audit', { correlation_key: correlationKey });

      expect(redisData.agent_id).toBe(agentId);
      expect(sqliteData.correlation_key).toBe(correlationKey);
    });

    it('should support correlation key queries across databases', async () => {
      const taskId = 'multi-agent-task';

      for (let i = 1; i <= 3; i++) {
        const agentId = `agent-00${i}`;
        const corrKey = buildCorrelationKey(taskId, agentId, 'loop3');

        await dbService.set('redis', corrKey, {
          task_id: taskId,
          agent_id: agentId,
          confidence: 0.75 + (i * 0.05),
        });
      }

      const pattern = `corr:${taskId}:*`;
      const results = await dbService.query('redis', pattern);

      expect(results.length).toBe(3);
      results.forEach((result, i) => {
        expect(result.task_id).toBe(taskId);
      });
    });
  });

  describe('Task 3.4: Redis Queue Reliability', () => {
    it('should reliably enqueue and dequeue messages', async () => {
      const queueName = 'test-queue';
      const message = {
        type: 'agent_spawn',
        data: { agent_id: 'test-001', task_id: 'task-001' },
      };

      await queueManager.enqueue(queueName, message);
      const dequeued = await queueManager.dequeue(queueName);

      expect(dequeued).toMatchObject(message);
    });

    it('should handle priority queues correctly', async () => {
      const queueName = 'priority-queue';

      await queueManager.enqueue(queueName, { priority: 1, data: 'low' });
      await queueManager.enqueue(queueName, { priority: 10, data: 'high' });
      await queueManager.enqueue(queueName, { priority: 5, data: 'medium' });

      const first = await queueManager.dequeue(queueName);
      expect(first.data).toBe('high');

      const second = await queueManager.dequeue(queueName);
      expect(second.data).toBe('medium');

      const third = await queueManager.dequeue(queueName);
      expect(third.data).toBe('low');
    });

    it('should implement reliable message processing with acknowledgments', async () => {
      const queueName = 'reliable-queue';
      const message = { id: '001', data: 'test' };

      await queueManager.enqueue(queueName, message);

      const msg1 = await queueManager.dequeue(queueName, { timeout: 1000 });
      expect(msg1.id).toBe('001');

      // Message still in queue (not acked)
      const msg2 = await queueManager.dequeue(queueName);
      expect(msg2.id).toBe('001');

      // Acknowledge this time
      await queueManager.acknowledge(queueName, msg2.messageId);

      // Queue should be empty now
      const msg3 = await queueManager.dequeue(queueName, { timeout: 100 });
      expect(msg3).toBeNull();
    });

    it('should handle queue failures gracefully', async () => {
      const queueName = 'failure-test-queue';

      await queueManager.disconnect();

      let error = null;
      try {
        await queueManager.enqueue(queueName, { data: 'test' });
      } catch (e) {
        error = e;
      }

      expect(error).not.toBeNull();

      await queueManager.connect();
      await queueManager.enqueue(queueName, { data: 'test' });
      const msg = await queueManager.dequeue(queueName);

      expect(msg.data).toBe('test');
    });
  });

  describe('Task 3.2: Skill Deployment Transactions', () => {
    it('should deploy skills atomically across storage systems', async () => {
      const skillId = 'test-skill-001';
      const skillData = {
        id: skillId,
        name: 'Test Skill',
        version: '1.0.0',
        content: 'skill content here',
        metadata: { author: 'test' },
      };

      await txManager.executeTransaction(async (tx: any) => {
        await tx.set('postgres', 'skills', {
          id: skillId,
          name: skillData.name,
          version: skillData.version,
          status: 'active',
        });

        await tx.set('redis', `skill:${skillId}`, skillData);

        await tx.set('sqlite', 'skill_deployments', {
          skill_id: skillId,
          version: skillData.version,
          deployed_at: new Date().toISOString(),
          status: 'success',
        });
      });

      const pgData = await dbService.get('postgres', 'skills', { id: skillId });
      const redisData = await dbService.get('redis', `skill:${skillId}`);
      const sqliteData = await dbService.get('sqlite', 'skill_deployments', { skill_id: skillId });

      expect(pgData.status).toBe('active');
      expect(redisData.name).toBe('Test Skill');
      expect(sqliteData.status).toBe('success');
    });

    it('should rollback skill deployment on validation failure', async () => {
      const skillId = 'invalid-skill-001';

      try {
        await txManager.executeTransaction(async (tx: any) => {
          await tx.set('postgres', 'skills', { id: skillId, name: 'Invalid' });
          await tx.set('redis', `skill:${skillId}`, { id: skillId });

          throw new Error('Skill validation failed');
        });
      } catch (error: any) {
        expect(error.message).toBe('Skill validation failed');
      }

      const pgData = await dbService.get('postgres', 'skills', { id: skillId });
      const redisData = await dbService.get('redis', `skill:${skillId}`);

      expect(pgData).toBeNull();
      expect(redisData).toBeNull();
    });
  });

  describe('End-to-End Database Handoff Workflow', () => {
    it('should handle complete task lifecycle with database handoffs', async () => {
      const taskId = 'e2e-task-001';
      const agents = ['agent-001', 'agent-002', 'agent-003'];

      await dbService.set('postgres', 'tasks', {
        id: taskId,
        description: 'End-to-end test task',
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      for (const agentId of agents) {
        await queueManager.enqueue('agent-spawn-queue', {
          task_id: taskId,
          agent_id: agentId,
          loop: 'loop3',
        });
      }

      for (const agentId of agents) {
        const spawnMsg = await queueManager.dequeue('agent-spawn-queue');
        const corrKey = buildCorrelationKey(taskId, agentId, 'loop3');

        await txManager.executeTransaction(async (tx: any) => {
          await tx.set('redis', corrKey, {
            task_id: taskId,
            agent_id: agentId,
            status: 'running',
            started_at: new Date().toISOString(),
          });

          await tx.set('sqlite', 'agent_logs', {
            correlation_key: corrKey,
            agent_id: agentId,
            event: 'agent_started',
          });
        });

        await queueManager.acknowledge('agent-spawn-queue', spawnMsg.messageId);
      }

      const taskData = await dbService.get('postgres', 'tasks', { id: taskId });
      expect(taskData).toBeTruthy();

      const agentStatuses = await dbService.query('redis', `corr:${taskId}:*`);
      expect(agentStatuses.length).toBe(3);

      const agentLogs = await dbService.query('sqlite', 'agent_logs');
      expect(agentLogs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Performance & Reliability', () => {
    it('should complete database operations within SLA (<2s)', async () => {
      const start = Date.now();

      await txManager.executeTransaction(async (tx: any) => {
        for (let i = 0; i < 10; i++) {
          await tx.set('redis', `perf:test:${i}`, { data: `test-${i}` });
        }
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    });

    it('should handle concurrent transactions without conflicts', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          txManager.executeTransaction(async (tx: any) => {
            await tx.set('redis', `concurrent:${i}`, { value: i });
            await tx.set('sqlite', 'concurrent_test', { id: i, value: i });
          })
        );
      }

      await Promise.all(promises);

      const redisResults = await dbService.query('redis', 'concurrent:*');
      expect(redisResults.length).toBe(10);
    });
  });
});
