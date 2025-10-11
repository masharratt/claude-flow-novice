/**
 * Coordinator Death with SQLite Recovery Chaos Tests - Sprint 1.7
 *
 * Test Coverage:
 * 1. Coordinator crash with SQLite checkpoint recovery
 * 2. Work transfer with SQLite state read
 * 3. New coordinator resuming from SQLite
 *
 * Epic: SQLite Integration Migration
 * Sprint: 1.7 - Testing & Validation
 *
 * @module tests/chaos/coordinator-death-sqlite.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import { join } from 'path';

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '1'),
};

const TEST_DB_PATH = join(process.cwd(), '.test-coord-death.db');

class CoordinatorRecovery {
  constructor(private redis: Redis, private db: Database.Database) {}

  async saveCheckpoint(coordinatorId: string, workState: any): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO coordinator_checkpoints
      (coordinator_id, work_state, timestamp)
      VALUES (?, ?, ?)
    `).run(coordinatorId, JSON.stringify(workState), Date.now());
  }

  async detectDeadCoordinator(coordinatorId: string, lastHeartbeat: number): Promise<boolean> {
    const now = Date.now();
    const timeSinceHeartbeat = now - lastHeartbeat;
    return timeSinceHeartbeat > 30000; // 30 seconds threshold
  }

  async transferWork(fromCoordinator: string, toCoordinator: string): Promise<any> {
    // Read work state from SQLite
    const checkpoint = this.db.prepare(`
      SELECT work_state FROM coordinator_checkpoints
      WHERE coordinator_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(fromCoordinator) as any;

    if (!checkpoint) {
      throw new Error('No checkpoint found for failed coordinator');
    }

    const workState = JSON.parse(checkpoint.work_state);

    // Transfer to new coordinator
    await this.saveCheckpoint(toCoordinator, {
      ...workState,
      transferredFrom: fromCoordinator,
      transferredAt: Date.now(),
    });

    return workState;
  }

  async resumeFromCheckpoint(coordinatorId: string): Promise<any> {
    const checkpoint = this.db.prepare(`
      SELECT work_state FROM coordinator_checkpoints
      WHERE coordinator_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(coordinatorId) as any;

    return checkpoint ? JSON.parse(checkpoint.work_state) : null;
  }
}

describe('Coordinator Death with SQLite Recovery (Chaos)', () => {
  let redis: Redis;
  let db: Database.Database;
  let recovery: CoordinatorRecovery;

  beforeEach(async () => {
    redis = new Redis(REDIS_CONFIG);
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });

    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore
    }

    db = new Database(TEST_DB_PATH);
    db.exec(`
      CREATE TABLE coordinator_checkpoints (
        coordinator_id TEXT PRIMARY KEY,
        work_state TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);

    recovery = new CoordinatorRecovery(redis, db);
  });

  afterEach(async () => {
    db.close();
    await redis.quit();
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore
    }
  });

  it('should detect dead coordinator and recover work from SQLite', async () => {
    const deadCoordinator = 'coordinator-dead';
    const newCoordinator = 'coordinator-backup';

    // Save checkpoint for coordinator
    await recovery.saveCheckpoint(deadCoordinator, {
      phase: 'implementation',
      progress: 0.65,
      agents: ['agent-1', 'agent-2', 'agent-3'],
      tasks: ['task-1', 'task-2'],
    });

    // Simulate coordinator death (old heartbeat)
    const lastHeartbeat = Date.now() - 60000; // 1 minute ago
    const isDead = await recovery.detectDeadCoordinator(deadCoordinator, lastHeartbeat);
    expect(isDead).toBe(true);

    // Transfer work to new coordinator
    const transferredWork = await recovery.transferWork(deadCoordinator, newCoordinator);

    expect(transferredWork.phase).toBe('implementation');
    expect(transferredWork.progress).toBe(0.65);
    expect(transferredWork.agents).toEqual(['agent-1', 'agent-2', 'agent-3']);

    // Verify new coordinator can resume
    const resumedWork = await recovery.resumeFromCheckpoint(newCoordinator);
    expect(resumedWork.transferredFrom).toBe(deadCoordinator);
    expect(resumedWork.agents).toEqual(['agent-1', 'agent-2', 'agent-3']);
  }, 30000);

  it('should preserve work state across coordinator death', async () => {
    const coordinator1 = 'coordinator-primary';
    const coordinator2 = 'coordinator-secondary';

    // Save multiple checkpoints over time
    await recovery.saveCheckpoint(coordinator1, { progress: 0.25 });
    await new Promise(resolve => setTimeout(resolve, 100));
    await recovery.saveCheckpoint(coordinator1, { progress: 0.50 });
    await new Promise(resolve => setTimeout(resolve, 100));
    await recovery.saveCheckpoint(coordinator1, { progress: 0.75 });

    // Transfer to new coordinator
    const transferred = await recovery.transferWork(coordinator1, coordinator2);

    // Should transfer latest checkpoint
    expect(transferred.progress).toBe(0.75);
  }, 30000);
});
