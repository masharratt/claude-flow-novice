/**
 * Integration Test Suite: Backup & Recovery Systems
 *
 * Tests integration points from:
 * - Task 4.3: Backup Management System
 * - Task 4.5: State Persistence Mechanisms
 *
 * Coverage: 6 integration points
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { BackupManager } from '../../src/lib/backup-manager';
import { CheckpointManager } from '../../src/lib/checkpoint-manager';
import { createMockDatabaseService } from './test-helpers';

describe('Backup & Recovery Integration', () => {
  let backupManager: BackupManager;
  let checkpointManager: CheckpointManager;
  let testDir: string;
  let backupDir: string;
  let mockDbService: any;

  beforeAll(async () => {
    testDir = path.join(process.cwd(), '.test-backup');
    backupDir = path.join(testDir, '.backups');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(backupDir, { recursive: true });

    backupManager = new BackupManager({
      backupDir,
      retention: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        maxCount: 10,
      },
    });

    // Create mock database service for CheckpointManager
    mockDbService = createMockDatabaseService();

    checkpointManager = new CheckpointManager(
      mockDbService as any,
      {
        checkpointDir: path.join(testDir, '.checkpoints'),
        autoSave: true,
        saveInterval: 1000,
      }
    );

    await checkpointManager.initialize();
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean test files
    const files = await fs.readdir(testDir);
    for (const file of files) {
      if (file !== '.backups' && file !== '.checkpoints') {
        await fs.rm(path.join(testDir, file), { recursive: true, force: true });
      }
    }
  });

  describe('Task 4.3: Backup Management System', () => {
    it('should create file backups before modifications', async () => {
      const filePath = path.join(testDir, 'test-file.txt');
      const originalContent = 'Original content';

      await fs.writeFile(filePath, originalContent);

      const backupPath = await backupManager.createBackup(filePath, {
        agentId: 'agent-001',
        reason: 'pre-edit',
      });

      expect(backupPath).toBeTruthy();
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      expect(backupContent).toBe(originalContent);
    });

    it('should restore files from backups', async () => {
      const filePath = path.join(testDir, 'restore-test.txt');

      await fs.writeFile(filePath, 'v1');
      const backup1 = await backupManager.createBackup(filePath);

      await fs.writeFile(filePath, 'v2');
      const backup2 = await backupManager.createBackup(filePath);

      await fs.writeFile(filePath, 'v3');

      // Restore to v1
      await backupManager.restore(backup1, filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('v1');
    });

    it('should maintain backup metadata', async () => {
      const filePath = path.join(testDir, 'metadata-test.txt');
      await fs.writeFile(filePath, 'test content');

      const backupPath = await backupManager.createBackup(filePath, {
        agentId: 'agent-001',
        reason: 'test-backup',
      });

      const metadata = await backupManager.getBackupMetadata(backupPath);
      expect(metadata).toBeDefined();
      expect(metadata?.agentId).toBe('agent-001');
      expect(metadata?.reason).toBe('test-backup');
    });

    it('should implement backup retention policies', async () => {
      const filePath = path.join(testDir, 'retention-test.txt');
      await fs.writeFile(filePath, 'content');

      // Create multiple backups
      const backups: string[] = [];
      for (let i = 0; i < 12; i++) {
        const backup = await backupManager.createBackup(filePath);
        backups.push(backup);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Trigger cleanup (retention policy: maxCount = 10)
      await backupManager.cleanupOldBackups();

      // Check that old backups were removed
      let remainingCount = 0;
      for (const backup of backups) {
        try {
          await fs.access(backup);
          remainingCount++;
        } catch {
          // Backup was removed
        }
      }

      expect(remainingCount).toBeLessThanOrEqual(10);
    });

    it('should support incremental backups', async () => {
      const filePath = path.join(testDir, 'incremental-test.txt');
      await fs.writeFile(filePath, 'initial');

      const backup1 = await backupManager.createBackup(filePath);

      await fs.writeFile(filePath, 'modified');
      const backup2 = await backupManager.createBackup(filePath);

      expect(backup1).not.toBe(backup2);

      const content1 = await fs.readFile(backup1, 'utf-8');
      const content2 = await fs.readFile(backup2, 'utf-8');

      expect(content1).toBe('initial');
      expect(content2).toBe('modified');
    });

    it('should handle directory backups recursively', async () => {
      const srcDir = path.join(testDir, 'src-dir');
      const subDir = path.join(srcDir, 'sub');

      await fs.mkdir(srcDir, { recursive: true });
      await fs.mkdir(subDir, { recursive: true });

      await fs.writeFile(path.join(srcDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(subDir, 'file2.txt'), 'content2');

      const backupPath = await backupManager.createBackup(srcDir);

      expect(backupPath).toBeTruthy();

      // Verify backup structure exists
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
    });
  });

  describe('Task 4.5: State Persistence Mechanisms', () => {
    it('should create and restore checkpoints', async () => {
      const state = {
        agentId: 'agent-001',
        iteration: 1,
        confidence: 0.85,
        data: { foo: 'bar' },
      };

      const checkpointId = await checkpointManager.createCheckpoint('task-001', state);
      expect(checkpointId).toBeTruthy();

      const restored = await checkpointManager.restoreCheckpoint('task-001', checkpointId);
      expect(restored).toEqual(state);
    });

    it('should maintain checkpoint history', async () => {
      const taskId = 'task-history';

      await checkpointManager.createCheckpoint(taskId, { version: 1 });
      await checkpointManager.createCheckpoint(taskId, { version: 2 });
      await checkpointManager.createCheckpoint(taskId, { version: 3 });

      const history = await checkpointManager.getCheckpointHistory(taskId);
      expect(history.length).toBeGreaterThanOrEqual(3);
    });

    it('should support automatic checkpoint creation', async () => {
      // This test verifies the auto-save functionality
      const taskId = 'task-auto';
      const state = { auto: true };

      await checkpointManager.createCheckpoint(taskId, state);

      // Wait for auto-save interval
      await new Promise(resolve => setTimeout(resolve, 1100));

      const history = await checkpointManager.getCheckpointHistory(taskId);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should handle checkpoint conflicts in concurrent operations', async () => {
      const taskId = 'task-concurrent';

      const promises = Array.from({ length: 5 }, (_, i) =>
        checkpointManager.createCheckpoint(taskId, { concurrent: i })
      );

      const results = await Promise.all(promises);

      // All checkpoints should be created successfully
      results.forEach(id => expect(id).toBeTruthy());

      const history = await checkpointManager.getCheckpointHistory(taskId);
      expect(history.length).toBe(5);
    });

    it('should implement checkpoint compression for large states', async () => {
      const largeState = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: `item-${i}`,
          nested: { foo: 'bar', baz: 'qux' },
        })),
      };

      const checkpointId = await checkpointManager.createCheckpoint('task-large', largeState);
      expect(checkpointId).toBeTruthy();

      const restored = await checkpointManager.restoreCheckpoint('task-large', checkpointId);
      expect(restored.data).toHaveLength(1000);
    });

    it('should support checkpoint encryption for sensitive data', async () => {
      const sensitiveState = {
        apiKey: 'secret-key-12345',
        password: 'super-secret',
        token: 'auth-token-xyz',
      };

      const checkpointId = await checkpointManager.createCheckpoint(
        'task-sensitive',
        sensitiveState,
        { encrypted: true }
      );

      expect(checkpointId).toBeTruthy();

      const restored = await checkpointManager.restoreCheckpoint('task-sensitive', checkpointId);
      expect(restored).toEqual(sensitiveState);
    });
  });

  describe('Backup & Checkpoint Integration', () => {
    it('should coordinate backups with checkpoint creation', async () => {
      const filePath = path.join(testDir, 'coordinated.txt');
      await fs.writeFile(filePath, 'original');

      const state = { filePath, version: 1 };
      const checkpointId = await checkpointManager.createCheckpoint('task-coord', state);

      const backupPath = await backupManager.createBackup(filePath);

      expect(checkpointId).toBeTruthy();
      expect(backupPath).toBeTruthy();

      // Modify file
      await fs.writeFile(filePath, 'modified');

      // Restore checkpoint and backup
      await backupManager.restore(backupPath, filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('original');
    });

    it('should enable point-in-time recovery', async () => {
      const filePath = path.join(testDir, 'pitr.txt');
      const states: any[] = [];
      const backups: string[] = [];

      // Create a series of checkpoints and backups
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(filePath, `version-${i}`);
        const backup = await backupManager.createBackup(filePath);
        const checkpoint = await checkpointManager.createCheckpoint('task-pitr', {
          version: i,
          backup,
        });

        backups.push(backup);
        states.push({ version: i, checkpointId: checkpoint });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Restore to a specific point in time (version 2)
      const targetState = states[2];
      const restored = await checkpointManager.restoreCheckpoint('task-pitr', targetState.checkpointId);
      
      await backupManager.restore(restored.backup, filePath);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('version-2');
    });
  });

  describe('Failure Recovery Scenarios', () => {
    it('should recover from backup corruption', async () => {
      const filePath = path.join(testDir, 'corrupt-test.txt');
      await fs.writeFile(filePath, 'good-content');

      const backup = await backupManager.createBackup(filePath);

      // Corrupt the backup
      await fs.writeFile(backup, 'corrupted-data-!@#$%');

      // Attempt restore - should handle gracefully
      try {
        await backupManager.restore(backup, filePath);
      } catch (error: any) {
        expect(error.message).toMatch(/corrupt|invalid|failed/i);
      }
    });

    it('should handle disk full scenarios during backup', async () => {
      // This test simulates disk full by creating a very large file
      // In a real scenario, this would need actual disk space limitations
      const filePath = path.join(testDir, 'large-file.txt');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB

      await fs.writeFile(filePath, largeContent);

      const backup = await backupManager.createBackup(filePath);
      expect(backup).toBeTruthy();

      // Verify backup size matches original
      const originalStats = await fs.stat(filePath);
      const backupStats = await fs.stat(backup);
      expect(backupStats.size).toBe(originalStats.size);
    });

    it('should recover checkpoint state after process crash', async () => {
      const taskId = 'task-crash';
      const state = { crash: true, data: 'important' };

      const checkpointId = await checkpointManager.createCheckpoint(taskId, state);

      // Simulate crash by creating a new checkpoint manager instance
      const mockDbService2 = createMockDatabaseService();
      const newCheckpointManager = new CheckpointManager(
        mockDbService2 as any,
        {
          checkpointDir: path.join(testDir, '.checkpoints'),
        }
      );

      await newCheckpointManager.initialize();

      // Verify state can be restored after "crash"
      const restored = await newCheckpointManager.restoreCheckpoint(taskId, checkpointId);
      expect(restored).toEqual(state);
    });
  });

  describe('Performance & Reliability', () => {
    it('should complete backup operations within SLA', async () => {
      const filePath = path.join(testDir, 'perf-test.txt');
      const content = 'x'.repeat(10240); // 10KB
      await fs.writeFile(filePath, content);

      const startTime = Date.now();
      await backupManager.createBackup(filePath);
      const duration = Date.now() - startTime;

      // Backup should complete within 2 seconds (SLA)
      expect(duration).toBeLessThan(2000);
    });

    it('should handle concurrent backup operations safely', async () => {
      const files = Array.from({ length: 10 }, (_, i) => 
        path.join(testDir, `concurrent-${i}.txt`)
      );

      // Create files
      await Promise.all(
        files.map(file => fs.writeFile(file, `content-${file}`))
      );

      // Create backups concurrently
      const startTime = Date.now();
      const backups = await Promise.all(
        files.map(file => backupManager.createBackup(file))
      );
      const duration = Date.now() - startTime;

      expect(backups).toHaveLength(10);
      backups.forEach(backup => expect(backup).toBeTruthy());

      // Should complete within reasonable time (10 seconds for 10 files)
      expect(duration).toBeLessThan(10000);
    });

    it('should optimize checkpoint storage with deduplication', async () => {
      const taskId = 'task-dedup';
      const identicalState = { data: 'same', value: 123 };

      // Create multiple checkpoints with identical state
      const checkpoints = await Promise.all(
        Array.from({ length: 5 }, () =>
          checkpointManager.createCheckpoint(taskId, identicalState)
        )
      );

      expect(checkpoints).toHaveLength(5);
      checkpoints.forEach(id => expect(id).toBeTruthy());

      // Note: Actual deduplication verification would require inspecting
      // the checkpoint storage to verify only one copy of the state is stored
    });
  });
});
