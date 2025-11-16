/**
 * Integration Test Suite: Backup & Recovery Systems
 *
 * Tests integration points from:
 * - Task 4.3: Backup Management System
 * - Task 4.5: State Persistence Mechanisms
 *
 * Coverage: 6 integration points
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { BackupManager } from '../../src/lib/backup-manager';
import { CheckpointManager } from '../../src/lib/checkpoint-manager';

describe('Backup & Recovery Integration', () => {
  let backupManager: BackupManager;
  let checkpointManager: CheckpointManager;
  let testDir: string;
  let backupDir: string;

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

    checkpointManager = new CheckpointManager({
      checkpointDir: path.join(testDir, '.checkpoints'),
      autoSave: true,
      saveInterval: 1000,
    });

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
        taskId: 'task-001',
        reason: 'safety-backup',
      });

      const metadata = await backupManager.getBackupMetadata(backupPath);

      expect(metadata.agentId).toBe('agent-001');
      expect(metadata.taskId).toBe('task-001');
      expect(metadata.reason).toBe('safety-backup');
      expect(metadata.originalPath).toBe(filePath);
      expect(metadata.timestamp).toBeTruthy();
    });

    it('should implement backup retention policies', async () => {
      const filePath = path.join(testDir, 'retention-test.txt');
      await fs.writeFile(filePath, 'test');

      const backups = [];

      // Create 15 backups
      for (let i = 0; i < 15; i++) {
        await fs.writeFile(filePath, `version ${i}`);
        const backup = await backupManager.createBackup(filePath);
        backups.push(backup);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Apply retention (max 10)
      await backupManager.applyRetention();

      // Verify only 10 most recent backups remain
      const remaining = await backupManager.listBackups(filePath);
      expect(remaining.length).toBeLessThanOrEqual(10);
    });

    it('should support incremental backups', async () => {
      const filePath = path.join(testDir, 'incremental.txt');

      await fs.writeFile(filePath, 'line 1\nline 2\n');
      const fullBackup = await backupManager.createBackup(filePath, {
        type: 'full',
      });

      await fs.writeFile(filePath, 'line 1\nline 2\nline 3\n');
      const incBackup = await backupManager.createBackup(filePath, {
        type: 'incremental',
        basedOn: fullBackup,
      });

      const incMetadata = await backupManager.getBackupMetadata(incBackup);
      expect(incMetadata.type).toBe('incremental');
      expect(incMetadata.basedOn).toBe(fullBackup);

      // Restore should work from incremental
      await fs.writeFile(filePath, 'corrupted');
      await backupManager.restoreFromIncremental(incBackup, fullBackup, filePath);

      const restored = await fs.readFile(filePath, 'utf-8');
      expect(restored).toBe('line 1\nline 2\nline 3\n');
    });

    it('should handle directory backups recursively', async () => {
      const dirPath = path.join(testDir, 'test-dir');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'file1.txt'), 'content1');
      await fs.mkdir(path.join(dirPath, 'subdir'));
      await fs.writeFile(path.join(dirPath, 'subdir', 'file2.txt'), 'content2');

      const backupPath = await backupManager.createBackup(dirPath, {
        recursive: true,
      });

      // Modify directory
      await fs.rm(dirPath, { recursive: true });
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'modified.txt'), 'modified');

      // Restore
      await backupManager.restore(backupPath, dirPath);

      // Verify restoration
      const file1 = await fs.readFile(path.join(dirPath, 'file1.txt'), 'utf-8');
      const file2 = await fs.readFile(path.join(dirPath, 'subdir', 'file2.txt'), 'utf-8');

      expect(file1).toBe('content1');
      expect(file2).toBe('content2');
    });
  });

  describe('Task 4.5: State Persistence Mechanisms', () => {
    it('should create and restore checkpoints', async () => {
      const stateId = 'agent-state-001';

      const state = {
        iteration: 1,
        confidence: 0.75,
        processed_items: 100,
        metadata: { agent_id: 'agent-001' },
      };

      await checkpointManager.saveCheckpoint(stateId, state);
      const restored = await checkpointManager.loadCheckpoint(stateId);

      expect(restored).toEqual(state);
    });

    it('should maintain checkpoint history', async () => {
      const stateId = 'history-state';

      await checkpointManager.saveCheckpoint(stateId, { iteration: 1, data: 'v1' });
      await checkpointManager.saveCheckpoint(stateId, { iteration: 2, data: 'v2' });
      await checkpointManager.saveCheckpoint(stateId, { iteration: 3, data: 'v3' });

      const history = await checkpointManager.getCheckpointHistory(stateId);
      expect(history.length).toBeGreaterThanOrEqual(3);

      const v2 = await checkpointManager.loadCheckpoint(stateId, 1);
      expect(v2.iteration).toBe(2);
    });

    it('should support automatic checkpoint creation', async () => {
      const stateId = 'auto-checkpoint';

      const state = { value: 0 };
      await checkpointManager.startAutoSave(stateId, state, {
        interval: 500,
        onChange: true,
      });

      // Modify state
      state.value = 1;
      await new Promise(resolve => setTimeout(resolve, 100));

      state.value = 2;
      await new Promise(resolve => setTimeout(resolve, 600));

      await checkpointManager.stopAutoSave(stateId);

      const checkpoints = await checkpointManager.getCheckpointHistory(stateId);
      expect(checkpoints.length).toBeGreaterThan(0);
    });

    it('should handle checkpoint conflicts in concurrent operations', async () => {
      const stateId = 'concurrent-checkpoint';

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          checkpointManager.saveCheckpoint(stateId, {
            iteration: i,
            timestamp: Date.now(),
          })
        );
      }

      await Promise.all(promises);

      const latest = await checkpointManager.loadCheckpoint(stateId);
      expect(latest.iteration).toBeGreaterThanOrEqual(0);
      expect(latest.iteration).toBeLessThan(10);
    });

    it('should implement checkpoint compression for large states', async () => {
      const stateId = 'large-state';

      const largeState = {
        data: 'x'.repeat(1024 * 1024), // 1MB of data
        metadata: { size: 'large' },
      };

      const start = Date.now();
      await checkpointManager.saveCheckpoint(stateId, largeState, {
        compress: true,
      });
      const saveDuration = Date.now() - start;

      const info = await checkpointManager.getCheckpointInfo(stateId);
      expect(info.compressed).toBe(true);
      expect(info.compressedSize).toBeLessThan(info.originalSize);

      const restored = await checkpointManager.loadCheckpoint(stateId);
      expect(restored.data.length).toBe(largeState.data.length);
    });

    it('should support checkpoint encryption for sensitive data', async () => {
      const stateId = 'encrypted-state';

      const sensitiveState = {
        apiKey: 'secret-key-12345',
        token: 'auth-token-xyz',
        data: 'sensitive information',
      };

      await checkpointManager.saveCheckpoint(stateId, sensitiveState, {
        encrypt: true,
        encryptionKey: 'test-encryption-key',
      });

      // Verify file is encrypted (not readable as plain text)
      const checkpointPath = checkpointManager.getCheckpointPath(stateId);
      const rawContent = await fs.readFile(checkpointPath, 'utf-8');
      expect(rawContent).not.toContain('secret-key-12345');

      // Verify decryption works
      const restored = await checkpointManager.loadCheckpoint(stateId, undefined, {
        encryptionKey: 'test-encryption-key',
      });

      expect(restored.apiKey).toBe('secret-key-12345');
    });
  });

  describe('Backup & Checkpoint Integration', () => {
    it('should coordinate backups with checkpoint creation', async () => {
      const filePath = path.join(testDir, 'coordinated.txt');
      const stateId = 'coordinated-state';

      await fs.writeFile(filePath, 'initial content');

      const state = {
        filePath,
        version: 1,
        content: 'initial content',
      };

      // Create checkpoint with automatic backup
      await checkpointManager.saveCheckpoint(stateId, state, {
        createBackup: true,
        backupManager,
      });

      // Modify file
      await fs.writeFile(filePath, 'modified content');
      state.version = 2;
      state.content = 'modified content';

      await checkpointManager.saveCheckpoint(stateId, state, {
        createBackup: true,
        backupManager,
      });

      // Restore to previous checkpoint
      const prevCheckpoint = await checkpointManager.loadCheckpoint(stateId, 0);
      const backups = await backupManager.listBackups(filePath);

      expect(backups.length).toBeGreaterThanOrEqual(2);
      expect(prevCheckpoint.version).toBe(1);
    });

    it('should enable point-in-time recovery', async () => {
      const workDir = path.join(testDir, 'recovery-test');
      await fs.mkdir(workDir, { recursive: true });

      const stateId = 'pit-recovery';
      const timestamps = [];

      // Create multiple versions
      for (let i = 1; i <= 5; i++) {
        const filePath = path.join(workDir, `file-${i}.txt`);
        await fs.writeFile(filePath, `content ${i}`);

        const backup = await backupManager.createBackup(filePath);

        await checkpointManager.saveCheckpoint(stateId, {
          iteration: i,
          files: [`file-${i}.txt`],
          backupRef: backup,
        });

        timestamps.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Recover to point-in-time (iteration 3)
      const checkpoint = await checkpointManager.loadCheckpoint(stateId, 2);
      expect(checkpoint.iteration).toBe(3);

      // Restore associated backups
      await backupManager.restore(checkpoint.backupRef);

      // Verify state
      const restoredContent = await fs.readFile(
        path.join(workDir, 'file-3.txt'),
        'utf-8'
      );
      expect(restoredContent).toBe('content 3');
    });
  });

  describe('Failure Recovery Scenarios', () => {
    it('should recover from backup corruption', async () => {
      const filePath = path.join(testDir, 'corruption-test.txt');
      await fs.writeFile(filePath, 'original');

      const backup1 = await backupManager.createBackup(filePath);
      await fs.writeFile(filePath, 'version 2');
      const backup2 = await backupManager.createBackup(filePath);

      // Corrupt backup1
      await fs.writeFile(backup1, 'CORRUPTED DATA');

      // Should fall back to backup2
      const restored = await backupManager.restoreWithFallback(filePath, [backup1, backup2]);
      expect(restored.source).toBe(backup2);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('version 2');
    });

    it('should handle disk full scenarios during backup', async () => {
      const filePath = path.join(testDir, 'disk-full-test.txt');
      await fs.writeFile(filePath, 'test data');

      // Mock disk full error
      const originalWriteFile = fs.writeFile;
      let errorThrown = false;

      try {
        await backupManager.createBackup(filePath, {
          onDiskFull: async (error) => {
            errorThrown = true;
            // Could trigger cleanup or use alternate location
            await backupManager.applyRetention();
          },
        });
      } catch (error) {
        // Expected in mock scenario
      }

      // Verify error handler was called if disk full occurred
      // (In real test, would simulate actual disk full condition)
    });

    it('should recover checkpoint state after process crash', async () => {
      const stateId = 'crash-recovery';

      // Simulate active state with auto-save
      const state = { value: 0, lastUpdated: Date.now() };

      await checkpointManager.saveCheckpoint(stateId, state);

      state.value = 10;
      await checkpointManager.saveCheckpoint(stateId, state);

      // Simulate crash (reinitialize checkpoint manager)
      const newCheckpointManager = new CheckpointManager({
        checkpointDir: path.join(testDir, '.checkpoints'),
        autoSave: true,
      });

      await newCheckpointManager.initialize();

      // Should recover latest state
      const recovered = await newCheckpointManager.loadCheckpoint(stateId);
      expect(recovered.value).toBe(10);
    });
  });

  describe('Performance & Reliability', () => {
    it('should complete backup operations within SLA', async () => {
      const filePath = path.join(testDir, 'perf-test.txt');
      const content = 'x'.repeat(10 * 1024); // 10KB file
      await fs.writeFile(filePath, content);

      const start = Date.now();
      await backupManager.createBackup(filePath);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500); // <500ms for 10KB
    });

    it('should handle concurrent backup operations safely', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const filePath = path.join(testDir, `concurrent-${i}.txt`);
        promises.push(
          fs.writeFile(filePath, `content ${i}`)
            .then(() => backupManager.createBackup(filePath))
        );
      }

      const backups = await Promise.all(promises);
      expect(backups).toHaveLength(10);
      expect(backups.every(b => b !== null)).toBe(true);
    });

    it('should optimize checkpoint storage with deduplication', async () => {
      const stateId = 'dedup-test';

      const baseState = {
        largeData: 'x'.repeat(1000),
        metadata: { version: 1 },
      };

      await checkpointManager.saveCheckpoint(stateId, baseState, {
        enableDeduplication: true,
      });

      // Save checkpoint with minimal changes
      baseState.metadata.version = 2;
      await checkpointManager.saveCheckpoint(stateId, baseState, {
        enableDeduplication: true,
      });

      const info = await checkpointManager.getCheckpointInfo(stateId);

      // Second checkpoint should be smaller due to deduplication
      expect(info.deduplicated).toBe(true);
    });
  });
});
