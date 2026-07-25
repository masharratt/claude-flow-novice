/**
 * Checkpoint Manager Test Suite
 *
 * Comprehensive tests for the checkpoint manager and dual persistence model.
 * Part of Task 4.5: Memory State Persistence Cleanup
 *
 * Test Coverage:
 * - Checkpoint creation (all triggers)
 * - Idempotency validation
 * - State capture and storage
 * - Recovery procedures
 * - Consistency checks
 * - Error handling
 * - Periodic cleanup
 * - Atomic operations
 *
 * Target Coverage: 95%+
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import {
  CheckpointManager,
  CheckpointTrigger,
  CheckpointStatus,
  RuntimeState,
  DurableState,
  AgentExecutionState,
  createCheckpointManager,
} from '../src/lib/checkpoint-manager';
import { DatabaseService } from '../src/lib/database-service';

describe('CheckpointManager', () => {
  let dbService: DatabaseService;
  let checkpointMgr: CheckpointManager;
  let redisAdapter: any;
  let sqliteAdapter: any;

  beforeAll(async () => {
    // Initialize database service
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
    });

    await dbService.connect();

    redisAdapter = dbService.getAdapter('redis');
    sqliteAdapter = dbService.getAdapter('sqlite');

    // Create test tables
    await createTestTables(sqliteAdapter);

    // Initialize checkpoint manager
    checkpointMgr = new CheckpointManager(dbService, {
      enablePeriodicCheckpoints: false, // Disable for tests
      enableAutoCleanup: true,
      retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    await checkpointMgr.initialize();
  });

  afterAll(async () => {
    await checkpointMgr.shutdown();
    await dbService.disconnect();
  });

  beforeEach(async () => {
    // Clear Redis state
    await redisAdapter.raw('FLUSHDB');

    // Clear SQLite tables
    await sqliteAdapter.raw('DELETE FROM checkpoints');
    await sqliteAdapter.raw('DELETE FROM task_results');
    await sqliteAdapter.raw('DELETE FROM agent_metrics');
    await sqliteAdapter.raw('DELETE FROM audit_trail');
  });

  afterEach(async () => {
    // Cleanup after each test
    await redisAdapter.raw('FLUSHDB');
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const mgr = new CheckpointManager(dbService);
      await mgr.initialize();
      await mgr.shutdown();
    });

    it('should create checkpoint tables', async () => {
      const result = await sqliteAdapter.raw(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='checkpoints'
      `);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should not initialize twice', async () => {
      const mgr = new CheckpointManager(dbService);
      await mgr.initialize();

      // Second initialization should be safe (no-op)
      await expect(mgr.initialize()).resolves.not.toThrow();

      await mgr.shutdown();
    });

    it('should create with factory function', () => {
      const mgr = createCheckpointManager(dbService);
      expect(mgr).toBeInstanceOf(CheckpointManager);
    });
  });

  // ============================================================================
  // Checkpoint Creation Tests
  // ============================================================================

  describe('Checkpoint Creation', () => {
    it('should create checkpoint on task completion', async () => {
      const taskId = 'task-completion-test';

      // Setup runtime state
      await setupRuntimeState(redisAdapter, taskId);

      // Setup durable state
      await setupDurableState(sqliteAdapter, taskId);

      // Create checkpoint
      const checkpoint = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.TASK_COMPLETION
      );

      expect(checkpoint).toBeDefined();
      expect(checkpoint.taskId).toBe(taskId);
      expect(checkpoint.trigger).toBe(CheckpointTrigger.TASK_COMPLETION);
      expect(checkpoint.status).toBe(CheckpointStatus.COMPLETED);
      expect(checkpoint.runtimeStateHash).toBeTruthy();
      expect(checkpoint.durableStateHash).toBeTruthy();
      expect(checkpoint.createdAt).toBeInstanceOf(Date);
      expect(checkpoint.completedAt).toBeInstanceOf(Date);
    });

    it('should create checkpoint on iteration boundary', async () => {
      const taskId = 'task-iteration-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      const checkpoint = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.ITERATION_BOUNDARY
      );

      expect(checkpoint.trigger).toBe(CheckpointTrigger.ITERATION_BOUNDARY);
      expect(checkpoint.status).toBe(CheckpointStatus.COMPLETED);
    });

    it('should create checkpoint periodically', async () => {
      const taskId = 'task-periodic-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      const checkpoint = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.PERIODIC
      );

      expect(checkpoint.trigger).toBe(CheckpointTrigger.PERIODIC);
      expect(checkpoint.status).toBe(CheckpointStatus.COMPLETED);
    });

    it('should create manual checkpoint', async () => {
      const taskId = 'task-manual-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      const checkpoint = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.MANUAL,
        { reason: 'debug', user: 'test-user' }
      );

      expect(checkpoint.trigger).toBe(CheckpointTrigger.MANUAL);
      expect(checkpoint.status).toBe(CheckpointStatus.COMPLETED);
      expect(checkpoint.metadata).toEqual({ reason: 'debug', user: 'test-user' });
    });

    it('should store checkpoint data', async () => {
      const taskId = 'task-storage-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      const checkpoint = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.TASK_COMPLETION
      );

      // Verify checkpoint metadata stored
      const metadataRow = await sqliteAdapter.get(`checkpoint:${checkpoint.checkpointId}`);
      expect(metadataRow).toBeDefined();
      expect(metadataRow.task_id).toBe(taskId);

      // Verify runtime state stored
      const runtimeStateStr = await sqliteAdapter.get(
        `checkpoint_runtime:${checkpoint.checkpointId}`
      );
      expect(runtimeStateStr).toBeTruthy();

      const runtimeState = JSON.parse(runtimeStateStr);
      expect(runtimeState.taskId).toBe(taskId);
      expect(runtimeState.agents).toBeDefined();

      // Verify durable state stored
      const durableStateStr = await sqliteAdapter.get(
        `checkpoint_durable:${checkpoint.checkpointId}`
      );
      expect(durableStateStr).toBeTruthy();

      const durableState = JSON.parse(durableStateStr);
      expect(durableState.taskId).toBe(taskId);
    });
  });

  // ============================================================================
  // Idempotency Tests
  // ============================================================================

  describe('Idempotency', () => {
    it('should return same checkpoint for identical state', async () => {
      const taskId = 'task-idempotent-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Create first checkpoint
      const checkpoint1 = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.PERIODIC
      );

      // Create second checkpoint with same state
      const checkpoint2 = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.PERIODIC
      );

      // Should return same checkpoint
      expect(checkpoint2.checkpointId).toBe(checkpoint1.checkpointId);
      expect(checkpoint2.runtimeStateHash).toBe(checkpoint1.runtimeStateHash);
      expect(checkpoint2.durableStateHash).toBe(checkpoint1.durableStateHash);
    });

    it('should create new checkpoint for changed state', async () => {
      const taskId = 'task-state-change-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Create first checkpoint
      const checkpoint1 = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.PERIODIC
      );

      // Change runtime state
      await redisAdapter.set(`agent:${taskId}:agent-new`, {
        agentId: 'agent-new',
        agentType: 'tester',
        status: 'completed',
        confidence: 0.95,
      });

      // Create second checkpoint
      const checkpoint2 = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.TASK_COMPLETION
      );

      // Should create new checkpoint
      expect(checkpoint2.checkpointId).not.toBe(checkpoint1.checkpointId);
      expect(checkpoint2.runtimeStateHash).not.toBe(checkpoint1.runtimeStateHash);
    });

    it('should handle concurrent checkpoint creation', async () => {
      const taskId = 'task-concurrent-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Create checkpoints concurrently
      const promises = [
        checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.PERIODIC),
        checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.PERIODIC),
        checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.PERIODIC),
      ];

      const checkpoints = await Promise.all(promises);

      // All should return same checkpoint (idempotent)
      expect(checkpoints[0].checkpointId).toBe(checkpoints[1].checkpointId);
      expect(checkpoints[1].checkpointId).toBe(checkpoints[2].checkpointId);
    });
  });

  // ============================================================================
  // State Validation Tests
  // ============================================================================

  describe('State Validation', () => {
    it('should validate runtime state before checkpoint', async () => {
      const taskId = 'task-validation-test';

      // Setup valid state
      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Should succeed
      await expect(
        checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION)
      ).resolves.toBeDefined();
    });

    it('should reject checkpoint with mismatched task IDs', async () => {
      const taskId1 = 'task-mismatch-1';
      const taskId2 = 'task-mismatch-2';

      // Setup runtime state with taskId1
      await setupRuntimeState(redisAdapter, taskId1);

      // Setup durable state with taskId2
      await setupDurableState(sqliteAdapter, taskId2);

      // Should fail validation
      await expect(
        checkpointMgr.createCheckpoint(taskId1, CheckpointTrigger.TASK_COMPLETION)
      ).rejects.toThrow();
    });

    it('should capture all runtime state components', async () => {
      const taskId = 'task-components-test';

      // Setup comprehensive runtime state
      await setupCompleteRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      const checkpoint = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.TASK_COMPLETION
      );

      // Load and verify runtime state
      const runtimeStateStr = await sqliteAdapter.get(
        `checkpoint_runtime:${checkpoint.checkpointId}`
      );
      const runtimeState = JSON.parse(runtimeStateStr);

      expect(runtimeState.agents.length).toBeGreaterThan(0);
      expect(runtimeState.coordinationSignals.length).toBeGreaterThan(0);
      expect(runtimeState.queueData.length).toBeGreaterThan(0);
      expect(runtimeState.activeLocks.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Recovery Tests
  // ============================================================================

  describe('Recovery', () => {
    it('should recover from latest checkpoint', async () => {
      const taskId = 'task-recovery-test';

      // Create initial state
      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Create checkpoint
      const checkpoint = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.TASK_COMPLETION
      );

      // Clear Redis (simulate crash)
      await redisAdapter.raw('FLUSHDB');

      // Verify Redis cleared
      const keysBeforeRecovery = await redisAdapter.raw('KEYS', `agent:${taskId}:*`);
      expect(keysBeforeRecovery.length).toBe(0);

      // Recover from checkpoint
      const recovery = await checkpointMgr.recoverFromCheckpoint(taskId);

      expect(recovery.success).toBe(true);
      expect(recovery.checkpointId).toBe(checkpoint.checkpointId);
      expect(recovery.runtimeStateRestored).toBe(true);
      expect(recovery.durableStateRestored).toBe(true);

      // Verify Redis state restored
      const keysAfterRecovery = await redisAdapter.raw('KEYS', `agent:${taskId}:*`);
      expect(keysAfterRecovery.length).toBeGreaterThan(0);
    });

    it('should restore agent execution state', async () => {
      const taskId = 'task-agent-recovery-test';

      // Setup with specific agent state
      const agentId = 'agent-123';
      await redisAdapter.set(`agent:${taskId}:${agentId}`, {
        agentId,
        agentType: 'backend-developer',
        status: 'completed',
        confidence: 0.92,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      await setupDurableState(sqliteAdapter, taskId);

      // Create checkpoint
      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);

      // Clear Redis
      await redisAdapter.raw('FLUSHDB');

      // Recover
      await checkpointMgr.recoverFromCheckpoint(taskId);

      // Verify agent state restored
      const agentState = await redisAdapter.get(`agent:${taskId}:${agentId}`);
      expect(agentState).toBeDefined();
      expect(agentState.agentId).toBe(agentId);
      expect(agentState.agentType).toBe('backend-developer');
      expect(agentState.confidence).toBe(0.92);
    });

    it('should restore coordination signals with TTL', async () => {
      const taskId = 'task-signal-recovery-test';

      await setupRuntimeState(redisAdapter, taskId);

      // Create coordination signal with TTL
      const signalKey = `swarm:${taskId}:gate-passed`;
      await redisAdapter.set(signalKey, 'true');
      await redisAdapter.raw('EXPIRE', signalKey, 300); // 5 minutes

      await setupDurableState(sqliteAdapter, taskId);

      // Create checkpoint
      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);

      // Clear Redis
      await redisAdapter.raw('FLUSHDB');

      // Recover
      await checkpointMgr.recoverFromCheckpoint(taskId);

      // Verify signal restored
      const signalValue = await redisAdapter.get(signalKey);
      expect(signalValue).toBe('true');

      // Verify TTL restored
      const ttl = await redisAdapter.raw('TTL', signalKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should restore queue data', async () => {
      const taskId = 'task-queue-recovery-test';

      await setupRuntimeState(redisAdapter, taskId);

      // Create queue with items
      const queueKey = `queue:${taskId}:pending-work`;
      await redisAdapter.raw('RPUSH', queueKey, 'task-1', 'task-2', 'task-3');

      await setupDurableState(sqliteAdapter, taskId);

      // Create checkpoint
      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);

      // Clear Redis
      await redisAdapter.raw('FLUSHDB');

      // Recover
      await checkpointMgr.recoverFromCheckpoint(taskId);

      // Verify queue restored
      const queueItems = await redisAdapter.raw('LRANGE', queueKey, 0, -1);
      expect(queueItems).toEqual(['task-1', 'task-2', 'task-3']);
    });

    it('should restore active locks with expiration', async () => {
      const taskId = 'task-lock-recovery-test';

      await setupRuntimeState(redisAdapter, taskId);

      // Create active lock
      const lockKey = `lock:${taskId}:file-xyz`;
      await redisAdapter.set(lockKey, 'agent-123');
      await redisAdapter.raw('EXPIRE', lockKey, 60); // 1 minute

      await setupDurableState(sqliteAdapter, taskId);

      // Create checkpoint
      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);

      // Clear Redis
      await redisAdapter.raw('FLUSHDB');

      // Recover
      await checkpointMgr.recoverFromCheckpoint(taskId);

      // Verify lock restored
      const lockOwner = await redisAdapter.get(lockKey);
      expect(lockOwner).toBe('agent-123');

      // Verify expiration set
      const ttl = await redisAdapter.raw('TTL', lockKey);
      expect(ttl).toBeGreaterThan(0);
    });

    it('should handle recovery when no checkpoint exists', async () => {
      const taskId = 'task-no-checkpoint';

      const recovery = await checkpointMgr.recoverFromCheckpoint(taskId);

      expect(recovery.success).toBe(false);
      expect(recovery.errors).toBeDefined();
      expect(recovery.errors.length).toBeGreaterThan(0);
    });

    it('should handle corrupted checkpoint data', async () => {
      const taskId = 'task-corrupted-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Create checkpoint
      const checkpoint = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.TASK_COMPLETION
      );

      // Corrupt checkpoint data
      await sqliteAdapter.set(
        `checkpoint_runtime:${checkpoint.checkpointId}`,
        'invalid-json-data'
      );

      // Recovery should fail gracefully
      const recovery = await checkpointMgr.recoverFromCheckpoint(taskId);

      expect(recovery.success).toBe(false);
      expect(recovery.errors).toBeDefined();
    });
  });

  // ============================================================================
  // Checkpoint Management Tests
  // ============================================================================

  describe('Checkpoint Management', () => {
    it('should list checkpoints for a task', async () => {
      const taskId = 'task-list-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Create multiple checkpoints
      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.PERIODIC);

      // Change state
      await redisAdapter.set(`agent:${taskId}:agent-new`, {
        agentId: 'agent-new',
        agentType: 'tester',
        status: 'completed',
      });

      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.ITERATION_BOUNDARY);

      // List checkpoints
      const checkpoints = await checkpointMgr.listCheckpoints(taskId);

      expect(checkpoints.length).toBeGreaterThanOrEqual(2);
      expect(checkpoints[0].taskId).toBe(taskId);
      expect(checkpoints[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        checkpoints[1].createdAt.getTime()
      );
    });

    it('should cleanup old checkpoints', async () => {
      const taskId = 'task-cleanup-test';

      // Create checkpoint manager with short retention
      const shortRetentionMgr = new CheckpointManager(dbService, {
        enableAutoCleanup: true,
        retentionPeriod: 1000, // 1 second
      });
      await shortRetentionMgr.initialize();

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Create checkpoint
      await shortRetentionMgr.createCheckpoint(taskId, CheckpointTrigger.PERIODIC);

      // Wait for retention period to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Cleanup
      const deletedCount = await shortRetentionMgr.cleanupOldCheckpoints();

      expect(deletedCount).toBeGreaterThan(0);

      await shortRetentionMgr.shutdown();
    });

    it('should not cleanup recent checkpoints', async () => {
      const taskId = 'task-no-cleanup-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Create recent checkpoint
      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);

      // Cleanup (should not delete recent checkpoint)
      const deletedCount = await checkpointMgr.cleanupOldCheckpoints();

      expect(deletedCount).toBe(0);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle Redis connection errors', async () => {
      const taskId = 'task-redis-error-test';

      // Disconnect Redis
      await dbService.disconnect();

      // Should throw error
      await expect(
        checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION)
      ).rejects.toThrow();

      // Reconnect
      await dbService.connect();
      redisAdapter = dbService.getAdapter('redis');
      sqliteAdapter = dbService.getAdapter('sqlite');
    });

    it('should mark checkpoint as failed on error', async () => {
      const taskId = 'task-failed-checkpoint';

      // Create checkpoint without setup (will fail)
      await expect(
        checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION)
      ).rejects.toThrow();

      // Verify failed checkpoint recorded
      const checkpoints = await checkpointMgr.listCheckpoints(taskId);
      const failedCheckpoint = checkpoints.find(c => c.status === CheckpointStatus.FAILED);

      expect(failedCheckpoint).toBeDefined();
      expect(failedCheckpoint.error).toBeTruthy();
    });

    it('should require initialization before operations', async () => {
      const uninitializedMgr = new CheckpointManager(dbService);

      // Should throw error
      await expect(
        uninitializedMgr.createCheckpoint('task-123', CheckpointTrigger.TASK_COMPLETION)
      ).rejects.toThrow(/not initialized/i);
    });

    it('should handle shutdown gracefully', async () => {
      const mgr = new CheckpointManager(dbService);
      await mgr.initialize();
      await mgr.shutdown();

      // Operations after shutdown should fail
      await expect(
        mgr.createCheckpoint('task-123', CheckpointTrigger.TASK_COMPLETION)
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // Consistency Tests
  // ============================================================================

  describe('Consistency', () => {
    it('should maintain consistency between runtime and durable state', async () => {
      const taskId = 'task-consistency-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      const checkpoint = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.TASK_COMPLETION
      );

      // Load states
      const runtimeStateStr = await sqliteAdapter.get(
        `checkpoint_runtime:${checkpoint.checkpointId}`
      );
      const durableStateStr = await sqliteAdapter.get(
        `checkpoint_durable:${checkpoint.checkpointId}`
      );

      const runtimeState = JSON.parse(runtimeStateStr);
      const durableState = JSON.parse(durableStateStr);

      // Verify task IDs match
      expect(runtimeState.taskId).toBe(taskId);
      expect(durableState.taskId).toBe(taskId);
      expect(runtimeState.taskId).toBe(durableState.taskId);
    });

    it('should generate consistent hashes for same state', async () => {
      const taskId = 'task-hash-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      // Create two checkpoints with same state
      const checkpoint1 = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.PERIODIC
      );

      const checkpoint2 = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.PERIODIC
      );

      // Hashes should match (idempotent)
      expect(checkpoint1.runtimeStateHash).toBe(checkpoint2.runtimeStateHash);
      expect(checkpoint1.durableStateHash).toBe(checkpoint2.durableStateHash);
    });

    it('should generate different hashes for different states', async () => {
      const taskId = 'task-hash-diff-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      const checkpoint1 = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.PERIODIC
      );

      // Modify state
      await redisAdapter.set(`agent:${taskId}:agent-modified`, {
        agentId: 'agent-modified',
        agentType: 'tester',
        status: 'completed',
        confidence: 0.99,
      });

      const checkpoint2 = await checkpointMgr.createCheckpoint(
        taskId,
        CheckpointTrigger.TASK_COMPLETION
      );

      // Hashes should differ
      expect(checkpoint1.runtimeStateHash).not.toBe(checkpoint2.runtimeStateHash);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should create checkpoint within reasonable time', async () => {
      const taskId = 'task-performance-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      const startTime = Date.now();

      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);

      const duration = Date.now() - startTime;

      // Should complete within 200ms
      expect(duration).toBeLessThan(200);
    });

    it('should recover within reasonable time', async () => {
      const taskId = 'task-recovery-perf-test';

      await setupRuntimeState(redisAdapter, taskId);
      await setupDurableState(sqliteAdapter, taskId);

      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);

      await redisAdapter.raw('FLUSHDB');

      const startTime = Date.now();

      await checkpointMgr.recoverFromCheckpoint(taskId);

      const duration = Date.now() - startTime;

      // Should complete within 300ms
      expect(duration).toBeLessThan(300);
    });

    it('should handle large state efficiently', async () => {
      const taskId = 'task-large-state-test';

      // Create large runtime state
      for (let i = 0; i < 100; i++) {
        await redisAdapter.set(`agent:${taskId}:agent-${i}`, {
          agentId: `agent-${i}`,
          agentType: 'backend-developer',
          status: 'completed',
          confidence: 0.85,
        });
      }

      await setupDurableState(sqliteAdapter, taskId);

      const startTime = Date.now();

      await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);

      const duration = Date.now() - startTime;

      // Should complete within 500ms even with large state
      expect(duration).toBeLessThan(500);
    });
  });
});

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create test tables in SQLite
 */
async function createTestTables(sqliteAdapter: any): Promise<void> {
  await sqliteAdapter.raw(`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      status TEXT,
      created_at TEXT
    )
  `);

  await sqliteAdapter.raw(`
    CREATE TABLE IF NOT EXISTS task_results (
      task_id TEXT PRIMARY KEY,
      status TEXT,
      result TEXT,
      confidence REAL,
      iterations INTEGER,
      started_at TEXT,
      completed_at TEXT,
      metadata TEXT
    )
  `);

  await sqliteAdapter.raw(`
    CREATE TABLE IF NOT EXISTS agent_metrics (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      agent_id TEXT,
      agent_type TEXT,
      execution_time INTEGER,
      confidence REAL,
      tokens_used INTEGER,
      cost REAL,
      timestamp TEXT,
      metadata TEXT
    )
  `);

  await sqliteAdapter.raw(`
    CREATE TABLE IF NOT EXISTS audit_trail (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      agent_id TEXT,
      action TEXT,
      details TEXT,
      timestamp TEXT
    )
  `);

  await sqliteAdapter.raw(`
    CREATE TABLE IF NOT EXISTS skill_metadata (
      skill_name TEXT PRIMARY KEY,
      version TEXT,
      execution_count INTEGER,
      success_rate REAL,
      avg_execution_time REAL,
      last_executed_at TEXT
    )
  `);
}

/**
 * Setup basic runtime state in Redis
 */
async function setupRuntimeState(redisAdapter: any, taskId: string): Promise<void> {
  // Create agent execution state
  await redisAdapter.set(`agent:${taskId}:agent-1`, {
    agentId: 'agent-1',
    agentType: 'backend-developer',
    status: 'completed',
    confidence: 0.88,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });

  await redisAdapter.set(`agent:${taskId}:agent-2`, {
    agentId: 'agent-2',
    agentType: 'tester',
    status: 'in_progress',
    startedAt: new Date().toISOString(),
  });
}

/**
 * Setup comprehensive runtime state
 */
async function setupCompleteRuntimeState(redisAdapter: any, taskId: string): Promise<void> {
  // Agents
  await setupRuntimeState(redisAdapter, taskId);

  // Coordination signals
  await redisAdapter.set(`swarm:${taskId}:gate-passed`, 'true');
  await redisAdapter.raw('EXPIRE', `swarm:${taskId}:gate-passed`, 300);

  // Queue data
  await redisAdapter.raw('RPUSH', `queue:${taskId}:pending`, 'task-1', 'task-2');

  // Active locks
  await redisAdapter.set(`lock:${taskId}:file-abc`, 'agent-1');
  await redisAdapter.raw('EXPIRE', `lock:${taskId}:file-abc`, 60);
}

/**
 * Setup durable state in SQLite
 */
async function setupDurableState(sqliteAdapter: any, taskId: string): Promise<void> {
  // Task result
  await sqliteAdapter.raw(
    `
    INSERT OR REPLACE INTO task_results (task_id, status, confidence, iterations, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    [taskId, 'completed', 0.90, 3, new Date().toISOString(), new Date().toISOString()]
  );

  // Agent metrics
  await sqliteAdapter.raw(
    `
    INSERT OR REPLACE INTO agent_metrics (id, task_id, agent_id, agent_type, execution_time, confidence, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [
      `metric-${taskId}-1`,
      taskId,
      'agent-1',
      'backend-developer',
      5000,
      0.88,
      new Date().toISOString(),
    ]
  );

  // Audit trail
  await sqliteAdapter.raw(
    `
    INSERT OR REPLACE INTO audit_trail (id, task_id, agent_id, action, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    [
      `audit-${taskId}-1`,
      taskId,
      'agent-1',
      'task_completed',
      JSON.stringify({ confidence: 0.88 }),
      new Date().toISOString(),
    ]
  );
}
