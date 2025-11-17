/**
 * Unified Backup & Restore Manager Tests
 * Part of Task 4.3: Unified Backup & Restore System
 *
 * Test Coverage:
 * - Backup creation (all types)
 * - Restore operations (latest, timestamp, hash)
 * - Verification and rollback
 * - Rate limiting
 * - Retention and cleanup
 * - Disk usage monitoring
 * - Error handling and edge cases
 * - Concurrent operations with locking
 *
 * Target: 90%+ code coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import {
  BackupManager,
  BackupType,
  BackupOptions,
  RestoreOptions,
  Backup,
  RestoreResult,
  DiskUsageStats,
  getBackupManager,
  withBackup,
} from '../src/lib/backup-manager';

// Test configuration
const TEST_DIR = path.join(__dirname, '.test-backup-manager');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-backups.db');
const TEST_BACKUP_DIR = path.join(TEST_DIR, '.backups');
const TEST_FILES_DIR = path.join(TEST_DIR, 'files');

jest.setTimeout(30000);

describe('BackupManager', () => {
  let manager: BackupManager;

  beforeAll(() => {
    // Create test directories
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    if (!fs.existsSync(TEST_FILES_DIR)) {
      fs.mkdirSync(TEST_FILES_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    // Clean up from previous tests
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }

    // Create fresh backup manager
    manager = new BackupManager({
      backupDir: TEST_BACKUP_DIR,
      dbPath: TEST_DB_PATH,
      defaultTtlMs: 60000, // 1 minute for tests
      projectRoot: TEST_DIR,
      rateLimit: { maxRestoresPerHour: 10 },
    });
  });

  afterEach(() => {
    // Close database connection
    if (manager) {
      await manager.close();
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function createTestFile(filename: string, content: string): string {
    const filePath = path.join(TEST_FILES_DIR, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  function readTestFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
  }

  function deleteTestFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  function calculateFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Backup Creation Tests
  // ============================================================================

  describe('createBackup', () => {
    it('should create a pre-edit backup successfully', async () => {
      const filePath = createTestFile('test1.txt', 'Original content');
      const options: BackupOptions = {
        agentId: 'test-agent-001',
        backupType: BackupType.PRE_EDIT,
      };

      const backup = await manager.createBackup(filePath, options);

      expect(backup).toBeDefined();
      expect(backup.id).toBeDefined();
      expect(backup.filePath).toBe(filePath);
      expect(backup.agentId).toBe('test-agent-001');
      expect(backup.backupType).toBe(BackupType.PRE_EDIT);
      expect(backup.originalHash).toBeDefined();
      expect(backup.backupHash).toBe(backup.originalHash);
      expect(backup.fileSize).toBe('Original content'.length);
      expect(fs.existsSync(backup.backupPath)).toBe(true);
    });

    it('should create a checkpoint backup successfully', async () => {
      const filePath = createTestFile('test2.txt', 'Checkpoint content');
      const options: BackupOptions = {
        agentId: 'test-agent-002',
        backupType: BackupType.CHECKPOINT,
      };

      const backup = await manager.createBackup(filePath, options);

      expect(backup.backupType).toBe(BackupType.CHECKPOINT);
      expect(fs.existsSync(backup.backupPath)).toBe(true);
    });

    it('should create a manual backup successfully', async () => {
      const filePath = createTestFile('test3.txt', 'Manual backup content');
      const options: BackupOptions = {
        agentId: 'test-agent-003',
        backupType: BackupType.MANUAL,
        metadata: { reason: 'Manual backup before major changes' },
      };

      const backup = await manager.createBackup(filePath, options);

      expect(backup.backupType).toBe(BackupType.MANUAL);
      expect(backup.metadata).toEqual({ reason: 'Manual backup before major changes' });
    });

    it('should fail when file does not exist', async () => {
      const filePath = path.join(TEST_FILES_DIR, 'nonexistent.txt');
      const options: BackupOptions = {
        agentId: 'test-agent-004',
        backupType: BackupType.PRE_EDIT,
      };

      await expect(manager.createBackup(filePath, options)).rejects.toThrow('File does not exist');
    });

    it('should create backup with custom TTL', async () => {
      const filePath = createTestFile('test4.txt', 'Custom TTL content');
      const customTtl = 5000; // 5 seconds
      const options: BackupOptions = {
        agentId: 'test-agent-005',
        backupType: BackupType.PRE_EDIT,
        ttlMs: customTtl,
      };

      const backup = await manager.createBackup(filePath, options);
      const expiresInMs = backup.expiresAt.getTime() - backup.createdAt.getTime();

      expect(expiresInMs).toBeGreaterThanOrEqual(customTtl - 100);
      expect(expiresInMs).toBeLessThanOrEqual(customTtl + 100);
    });

    it('should verify backup integrity', async () => {
      const filePath = createTestFile('test5.txt', 'Integrity test content');
      const options: BackupOptions = {
        agentId: 'test-agent-006',
        backupType: BackupType.PRE_EDIT,
      };

      const backup = await manager.createBackup(filePath, options);

      // Verify backup file matches original
      const originalHash = calculateFileHash(filePath);
      const backupHash = calculateFileHash(backup.backupPath);

      expect(backupHash).toBe(originalHash);
      expect(backup.originalHash).toBe(originalHash);
      expect(backup.backupHash).toBe(backupHash);
    });

    it('should create multiple backups for the same file', async () => {
      const filePath = createTestFile('test6.txt', 'Version 1');
      const agentId = 'test-agent-007';

      // Create first backup
      const backup1 = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.PRE_EDIT,
      });

      // Modify file
      await sleep(10);
      fs.writeFileSync(filePath, 'Version 2', 'utf8');

      // Create second backup
      const backup2 = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.CHECKPOINT,
      });

      expect(backup1.id).not.toBe(backup2.id);
      expect(backup1.originalHash).not.toBe(backup2.originalHash);

      const backups = manager.listBackups(filePath);
      expect(backups.length).toBe(2);
    });
  });

  // ============================================================================
  // Restore Operations Tests
  // ============================================================================

  describe('restoreLatest', () => {
    it('should restore the latest backup successfully', async () => {
      const filePath = createTestFile('restore1.txt', 'Original content');

      // Create backup
      await manager.createBackup(filePath, {
        agentId: 'test-agent-008',
        backupType: BackupType.PRE_EDIT,
      });

      // Modify file
      fs.writeFileSync(filePath, 'Modified content', 'utf8');

      // Restore
      const result = await manager.restoreLatest(filePath, {
        agentId: 'test-agent-008',
        verify: true,
      });

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(readTestFile(filePath)).toBe('Original content');
    });

    it('should fail when no backup exists', async () => {
      const filePath = createTestFile('restore2.txt', 'No backup');

      await expect(
        manager.restoreLatest(filePath, {
          agentId: 'test-agent-009',
        })
      ).rejects.toThrow('No backup found');
    });

    it('should support dry-run mode', async () => {
      const filePath = createTestFile('restore3.txt', 'Original content');

      await manager.createBackup(filePath, {
        agentId: 'test-agent-010',
        backupType: BackupType.PRE_EDIT,
      });

      fs.writeFileSync(filePath, 'Modified content', 'utf8');

      const result = await manager.restoreLatest(filePath, {
        agentId: 'test-agent-010',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(readTestFile(filePath)).toBe('Modified content'); // File unchanged
    });

    it('should restore without verification when disabled', async () => {
      const filePath = createTestFile('restore4.txt', 'Original content');

      await manager.createBackup(filePath, {
        agentId: 'test-agent-011',
        backupType: BackupType.PRE_EDIT,
      });

      fs.writeFileSync(filePath, 'Modified content', 'utf8');

      const result = await manager.restoreLatest(filePath, {
        agentId: 'test-agent-011',
        verify: false,
      });

      expect(result.success).toBe(true);
      expect(result.verified).toBe(false);
      expect(readTestFile(filePath)).toBe('Original content');
    });
  });

  describe('restoreByTimestamp', () => {
    it('should restore backup by timestamp', async () => {
      const filePath = createTestFile('restore5.txt', 'Version 1');
      const agentId = 'test-agent-012';

      // Create first backup
      const backup1 = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.CHECKPOINT,
      });

      await sleep(100);

      // Modify and create second backup
      fs.writeFileSync(filePath, 'Version 2', 'utf8');
      await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.CHECKPOINT,
      });

      // Modify file again
      fs.writeFileSync(filePath, 'Version 3', 'utf8');

      // Restore first backup by timestamp
      const result = await manager.restoreByTimestamp(filePath, backup1.createdAt, {
        agentId,
        verify: true,
      });

      expect(result.success).toBe(true);
      expect(readTestFile(filePath)).toBe('Version 1');
    });
  });

  describe('restoreByHash', () => {
    it('should restore backup by hash', async () => {
      const filePath = createTestFile('restore6.txt', 'Version 1');
      const agentId = 'test-agent-013';

      const backup1 = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.CHECKPOINT,
      });

      // Modify file
      fs.writeFileSync(filePath, 'Version 2', 'utf8');

      // Restore by hash
      const result = await manager.restoreByHash(filePath, backup1.originalHash, {
        agentId,
        verify: true,
      });

      expect(result.success).toBe(true);
      expect(readTestFile(filePath)).toBe('Version 1');
    });
  });

  // ============================================================================
  // Verification and Rollback Tests
  // ============================================================================

  describe('Verification and Rollback', () => {
    it('should detect hash mismatch during restore', async () => {
      const filePath = createTestFile('verify1.txt', 'Original content');

      const backup = await manager.createBackup(filePath, {
        agentId: 'test-agent-014',
        backupType: BackupType.PRE_EDIT,
      });

      // Corrupt backup file
      fs.writeFileSync(backup.backupPath, 'Corrupted content', 'utf8');

      // Modify original file
      fs.writeFileSync(filePath, 'Modified content', 'utf8');

      // Attempt restore with verification
      await expect(
        manager.restoreBackup(backup.id, {
          agentId: 'test-agent-014',
          verify: true,
        })
      ).rejects.toThrow('verification failed');
    });

    it('should rollback on verification failure', async () => {
      const filePath = createTestFile('verify2.txt', 'Original content');

      const backup = await manager.createBackup(filePath, {
        agentId: 'test-agent-015',
        backupType: BackupType.PRE_EDIT,
      });

      // Modify file (this will be backed up before restore)
      fs.writeFileSync(filePath, 'Modified content', 'utf8');

      // Corrupt backup
      fs.writeFileSync(backup.backupPath, 'Corrupted', 'utf8');

      // Attempt restore - should rollback to "Modified content"
      try {
        await manager.restoreBackup(backup.id, {
          agentId: 'test-agent-015',
          verify: true,
          createBackupBeforeRestore: true,
        });
      } catch (error) {
        // Expected to fail
      }

      // File should be rolled back to "Modified content"
      const content = readTestFile(filePath);
      expect(content).toBe('Modified content');
    });
  });

  // ============================================================================
  // Rate Limiting Tests
  // ============================================================================

  describe('Rate Limiting', () => {
    it('should enforce restore rate limits', async () => {
      const filePath = createTestFile('rate1.txt', 'Original content');
      const agentId = 'test-agent-016';

      const backup = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.PRE_EDIT,
      });

      // Perform 10 restores (rate limit max)
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(filePath, `Modified ${i}`, 'utf8');
        await manager.restoreBackup(backup.id, {
          agentId,
          verify: false,
        });
      }

      // 11th restore should fail
      fs.writeFileSync(filePath, 'Modified 11', 'utf8');
      await expect(
        manager.restoreBackup(backup.id, {
          agentId,
          verify: false,
        })
      ).rejects.toThrow('rate limit exceeded');
    });

    it('should allow force restore bypassing rate limit', async () => {
      const filePath = createTestFile('rate2.txt', 'Original content');
      const agentId = 'test-agent-017';

      const backup = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.PRE_EDIT,
      });

      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(filePath, `Modified ${i}`, 'utf8');
        await manager.restoreBackup(backup.id, {
          agentId,
          verify: false,
        });
      }

      // Force restore should succeed
      fs.writeFileSync(filePath, 'Modified 11', 'utf8');
      const result = await manager.restoreBackup(backup.id, {
        agentId,
        verify: false,
        force: true,
      });

      expect(result.success).toBe(true);
    });

    it('should not apply rate limit in dry-run mode', async () => {
      const filePath = createTestFile('rate3.txt', 'Original content');
      const agentId = 'test-agent-018';

      const backup = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.PRE_EDIT,
      });

      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(filePath, `Modified ${i}`, 'utf8');
        await manager.restoreBackup(backup.id, {
          agentId,
          verify: false,
        });
      }

      // Dry-run should succeed
      fs.writeFileSync(filePath, 'Modified 11', 'utf8');
      const result = await manager.restoreBackup(backup.id, {
        agentId,
        verify: false,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });
  });

  // ============================================================================
  // Retention and Cleanup Tests
  // ============================================================================

  describe('Retention and Cleanup', () => {
    it('should delete expired backups', async () => {
      const filePath = createTestFile('cleanup1.txt', 'Original content');

      // Create backup with very short TTL
      await manager.createBackup(filePath, {
        agentId: 'test-agent-019',
        backupType: BackupType.PRE_EDIT,
        ttlMs: 100, // 100ms
      });

      // Wait for expiration
      await sleep(200);

      // Delete expired backups
      const deletedCount = manager.deleteExpiredBackups();

      expect(deletedCount).toBe(1);
    });

    it('should not delete active backups', async () => {
      const filePath = createTestFile('cleanup2.txt', 'Original content');

      await manager.createBackup(filePath, {
        agentId: 'test-agent-020',
        backupType: BackupType.PRE_EDIT,
        ttlMs: 60000, // 1 minute
      });

      const deletedCount = manager.deleteExpiredBackups();

      expect(deletedCount).toBe(0);
    });

    it('should list all backups for a file', async () => {
      const filePath = createTestFile('cleanup3.txt', 'Version 1');
      const agentId = 'test-agent-021';

      await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.PRE_EDIT,
      });

      fs.writeFileSync(filePath, 'Version 2', 'utf8');

      await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.CHECKPOINT,
      });

      const backups = manager.listBackups(filePath);

      expect(backups.length).toBe(2);
      expect(backups[0].backupType).toBe('checkpoint'); // Latest first
      expect(backups[1].backupType).toBe('pre-edit');
    });
  });

  // ============================================================================
  // Disk Usage Monitoring Tests
  // ============================================================================

  describe('Disk Usage Monitoring', () => {
    it('should report disk usage statistics', async () => {
      const file1 = createTestFile('disk1.txt', 'File 1 content');
      const file2 = createTestFile('disk2.txt', 'File 2 content longer');

      await manager.createBackup(file1, {
        agentId: 'test-agent-022',
        backupType: BackupType.PRE_EDIT,
      });

      await manager.createBackup(file2, {
        agentId: 'test-agent-023',
        backupType: BackupType.CHECKPOINT,
      });

      const stats = manager.getDiskUsage();

      expect(stats.totalBackups).toBe(2);
      expect(stats.activeBackups).toBe(2);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.backupsByType[BackupType.PRE_EDIT]).toBe(1);
      expect(stats.backupsByType[BackupType.CHECKPOINT]).toBe(1);
    });

    it('should track backups by agent', async () => {
      const file1 = createTestFile('disk3.txt', 'Agent 1 file');
      const file2 = createTestFile('disk4.txt', 'Agent 2 file');

      await manager.createBackup(file1, {
        agentId: 'agent-001',
        backupType: BackupType.PRE_EDIT,
      });

      await manager.createBackup(file2, {
        agentId: 'agent-002',
        backupType: BackupType.PRE_EDIT,
      });

      const stats = manager.getDiskUsage();

      expect(stats.backupsByAgent['agent-001']).toBe(1);
      expect(stats.backupsByAgent['agent-002']).toBe(1);
    });

    it('should report expired backups separately', async () => {
      const file1 = createTestFile('disk5.txt', 'Active backup');
      const file2 = createTestFile('disk6.txt', 'Expired backup');

      await manager.createBackup(file1, {
        agentId: 'test-agent-024',
        backupType: BackupType.PRE_EDIT,
        ttlMs: 60000, // Active
      });

      await manager.createBackup(file2, {
        agentId: 'test-agent-025',
        backupType: BackupType.PRE_EDIT,
        ttlMs: 100, // Will expire
      });

      await sleep(200);

      const stats = manager.getDiskUsage();

      expect(stats.totalBackups).toBe(2);
      expect(stats.activeBackups).toBe(1);
      expect(stats.expiredBackups).toBe(1);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle missing backup file gracefully', async () => {
      const filePath = createTestFile('error1.txt', 'Original content');

      const backup = await manager.createBackup(filePath, {
        agentId: 'test-agent-026',
        backupType: BackupType.PRE_EDIT,
      });

      // Delete backup file
      fs.unlinkSync(backup.backupPath);

      await expect(
        manager.restoreBackup(backup.id, {
          agentId: 'test-agent-026',
        })
      ).rejects.toThrow('Backup file not found');
    });

    it('should handle concurrent backup creation', async () => {
      const filePath = createTestFile('concurrent1.txt', 'Concurrent test');

      const promises = [
        manager.createBackup(filePath, {
          agentId: 'test-agent-027',
          backupType: BackupType.PRE_EDIT,
        }),
        manager.createBackup(filePath, {
          agentId: 'test-agent-028',
          backupType: BackupType.CHECKPOINT,
        }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      expect(results[0].id).not.toBe(results[1].id);
    });
  });

  // ============================================================================
  // Utility Functions Tests
  // ============================================================================

  describe('Utility Functions', () => {
    it('should get singleton backup manager', () => {
      const manager1 = getBackupManager();
      const manager2 = getBackupManager();

      expect(manager1).toBe(manager2);
    });

    it('should execute function with automatic backup', async () => {
      const filePath = createTestFile('utility1.txt', 'Original content');

      let executionCount = 0;

      await withBackup(
        filePath,
        async () => {
          executionCount++;
          fs.writeFileSync(filePath, 'Modified content', 'utf8');
        },
        {
          agentId: 'test-agent-029',
          backupType: BackupType.PRE_EDIT,
        }
      );

      expect(executionCount).toBe(1);

      const backups = manager.listBackups(filePath);
      expect(backups.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    it('should handle complete backup and restore workflow', async () => {
      const filePath = createTestFile('integration1.txt', 'Version 1');
      const agentId = 'integration-agent-001';

      // 1. Create initial backup
      const backup1 = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.CHECKPOINT,
      });

      // 2. Modify file
      fs.writeFileSync(filePath, 'Version 2', 'utf8');

      // 3. Create second backup
      const backup2 = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.CHECKPOINT,
      });

      // 4. Modify file again
      fs.writeFileSync(filePath, 'Version 3', 'utf8');

      // 5. Restore to version 2
      await manager.restoreByHash(filePath, backup2.originalHash, {
        agentId,
        verify: true,
      });

      expect(readTestFile(filePath)).toBe('Version 2');

      // 6. Restore to version 1
      await manager.restoreByHash(filePath, backup1.originalHash, {
        agentId,
        verify: true,
      });

      expect(readTestFile(filePath)).toBe('Version 1');

      // 7. Check disk usage
      const stats = manager.getDiskUsage();
      expect(stats.totalBackups).toBeGreaterThanOrEqual(2);
    });

    it('should handle file locking during concurrent operations', async () => {
      const filePath = createTestFile('integration2.txt', 'Concurrent test');
      const agentId = 'integration-agent-002';

      const backup = await manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.PRE_EDIT,
      });

      // Modify file
      fs.writeFileSync(filePath, 'Modified', 'utf8');

      // Concurrent operations should be serialized by file locking
      const promise1 = manager.restoreBackup(backup.id, {
        agentId,
        verify: true,
      });

      const promise2 = manager.createBackup(filePath, {
        agentId,
        backupType: BackupType.CHECKPOINT,
      });

      await expect(Promise.all([promise1, promise2])).resolves.toBeDefined();
    });
  });
});
