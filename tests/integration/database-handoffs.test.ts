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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import {
  DatabaseService,
  RedisAdapter,
  SQLiteAdapter,
  PostgresAdapter,
  buildTaskKey,
  buildAgentKey,
  buildCorrelationKey,
  parseCorrelationKey,
  DatabaseErrorCode,
} from '../../src/lib/database-service';
import { TransactionManager } from '../../src/lib/database-service/transaction-manager';
import { RedisQueueManager } from '../../src/lib/redis-queue-manager';

describe('Database Handoffs Integration', () => {
  let dbService: DatabaseService;
  let txManager: TransactionManager;
  let queueManager: RedisQueueManager;

  beforeAll(async () => {
    // Initialize database service with all adapters
    dbService = new DatabaseService({
      redis: {
        type: 'redis',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        timeout: 5000,
      },
      sqlite: {
        type: 'sqlite',
        database: ':memory:',
      },
      postgres: {
        type: 'postgres',
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cfn_test',
        poolSize: 5,
      },
    });

    await dbService.initialize();

    txManager = new TransactionManager(dbService);
    queueManager = new RedisQueueManager({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  });

  afterAll(async () => {
    await dbService.disconnect();
    await queueManager.disconnect();
  });

  beforeEach(async () => {
    // Clean test data
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

      await txManager.executeTransaction(async (tx) => {
        // Write to Redis
        await tx.set('redis', buildTaskKey(taskId), {
          id: taskId,
          status: 'in_progress',
        });

        // Write to SQLite
        await tx.set('sqlite', 'task_audit', {
          task_id: taskId,
          agent_id: agentId,
          action: 'started',
          timestamp: new Date().toISOString(),
        });
      });

      // Verify both writes succeeded
      const redisData = await dbService.get('redis', buildTaskKey(taskId));
      expect(redisData.status).toBe('in_progress');

      const sqliteData = await dbService.get('sqlite', 'task_audit', { task_id: taskId });
      expect(sqliteData.action).toBe('started');
    });

    it('should rollback all operations on transaction failure', async () => {
      const taskId = 'rollback-test-001';

      try {
        await txManager.executeTransaction(async (tx) => {
          await tx.set('redis', buildTaskKey(taskId), { status: 'test' });
          await tx.set('sqlite', 'tasks', { id: taskId, status: 'test' });

          // Force transaction failure
          throw new Error('Simulated transaction failure');
        });
      } catch (error) {
        expect(error.message).toBe('Simulated transaction failure');
      }

      // Verify rollback - data should not exist
      const redisData = await dbService.get('redis', buildTaskKey(taskId));
      expect(redisData).toBeNull();
    });

    it('should handle nested transactions correctly', async () => {
      const taskId = 'nested-tx-001';

      await txManager.executeTransaction(async (tx1) => {
        await tx1.set('redis', buildTaskKey(taskId), { level: 1 });

        await txManager.executeTransaction(async (tx2) => {
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

      // Store correlation data in Redis
      await dbService.set('redis', correlationKey, {
        task_id: taskId,
        agent_id: agentId,
        loop: 'loop3',
        status: 'running',
        started_at: new Date().toISOString(),
      });

      // Store detailed audit in SQLite
      await dbService.set('sqlite', 'agent_audit', {
        correlation_key: correlationKey,
        agent_id: agentId,
        task_id: taskId,
        event: 'agent_spawned',
        details: JSON.stringify({ loop: 'loop3' }),
      });

      // Retrieve using correlation key
      const redisData = await dbService.get('redis', correlationKey);
      const sqliteData = await dbService.get('sqlite', 'agent_audit', { correlation_key: correlationKey });

      expect(redisData.agent_id).toBe(agentId);
      expect(sqliteData.correlation_key).toBe(correlationKey);
    });

    it('should support correlation key queries across databases', async () => {
      const taskId = 'multi-agent-task';

      // Create multiple agents with correlation keys
      for (let i = 1; i <= 3; i++) {
        const agentId = `agent-00${i}`;
        const corrKey = buildCorrelationKey(taskId, agentId, 'loop3');

        await dbService.set('redis', corrKey, {
          task_id: taskId,
          agent_id: agentId,
          confidence: 0.75 + (i * 0.05),
        });
      }

      // Query all correlation keys for task
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

      // Dequeue without ack - message should return to queue
      const msg1 = await queueManager.dequeue(queueName, { timeout: 1000 });
      expect(msg1.id).toBe('001');

      // Don't acknowledge - message should be redelivered
      await new Promise(resolve => setTimeout(resolve, 1100));

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

      // Test connection failure recovery
      await queueManager.disconnect();

      let error = null;
      try {
        await queueManager.enqueue(queueName, { data: 'test' });
      } catch (e) {
        error = e;
      }

      expect(error).not.toBeNull();

      // Reconnect and verify functionality
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

      await txManager.executeTransaction(async (tx) => {
        // Store skill metadata in Postgres
        await tx.set('postgres', 'skills', {
          id: skillId,
          name: skillData.name,
          version: skillData.version,
          status: 'active',
        });

        // Cache skill data in Redis
        await tx.set('redis', `skill:${skillId}`, skillData);

        // Log deployment in SQLite
        await tx.set('sqlite', 'skill_deployments', {
          skill_id: skillId,
          version: skillData.version,
          deployed_at: new Date().toISOString(),
          status: 'success',
        });
      });

      // Verify all systems updated
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
        await txManager.executeTransaction(async (tx) => {
          await tx.set('postgres', 'skills', { id: skillId, name: 'Invalid' });
          await tx.set('redis', `skill:${skillId}`, { id: skillId });

          // Simulate validation failure
          throw new Error('Skill validation failed');
        });
      } catch (error) {
        expect(error.message).toBe('Skill validation failed');
      }

      // Verify rollback
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

      // 1. Task creation in Postgres
      await dbService.set('postgres', 'tasks', {
        id: taskId,
        description: 'End-to-end test task',
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      // 2. Queue agent spawns in Redis
      for (const agentId of agents) {
        await queueManager.enqueue('agent-spawn-queue', {
          task_id: taskId,
          agent_id: agentId,
          loop: 'loop3',
        });
      }

      // 3. Process agents with correlation tracking
      for (const agentId of agents) {
        const spawnMsg = await queueManager.dequeue('agent-spawn-queue');
        const corrKey = buildCorrelationKey(taskId, agentId, 'loop3');

        await txManager.executeTransaction(async (tx) => {
          // Update agent status in Redis
          await tx.set('redis', corrKey, {
            task_id: taskId,
            agent_id: agentId,
            status: 'running',
            started_at: new Date().toISOString(),
          });

          // Log in SQLite
          await tx.set('sqlite', 'agent_logs', {
            correlation_key: corrKey,
            agent_id: agentId,
            event: 'agent_started',
          });
        });

        await queueManager.acknowledge('agent-spawn-queue', spawnMsg.messageId);
      }

      // 4. Verify complete workflow
      const taskData = await dbService.get('postgres', 'tasks', { id: taskId });
      expect(taskData).toBeTruthy();

      const agentStatuses = await dbService.query('redis', `corr:${taskId}:*`);
      expect(agentStatuses.length).toBe(3);

      const agentLogs = await dbService.query('sqlite', 'agent_logs', {
        correlation_key: { $like: `%${taskId}%` }
      });
      expect(agentLogs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Performance & Reliability', () => {
    it('should complete database operations within SLA (<2s)', async () => {
      const start = Date.now();

      await txManager.executeTransaction(async (tx) => {
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
          txManager.executeTransaction(async (tx) => {
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
