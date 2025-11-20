/**
 * Backup Manager Tests
 * Validates backup creation, restoration, cleanup, and metadata handling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BackupManager } from '../src/hooks/backup-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('BackupManager', () => {
  let tempDir: string;
  let backupManager: BackupManager;
  let testFilePath: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
    backupManager = new BackupManager(tempDir, {
      retentionHours: 1,
      maxBackups: 5,
      backupDir: '.backups',
    });

    // Create test file
    testFilePath = path.join(tempDir, 'test-file.ts');
    await fs.writeFile(testFilePath, 'console.log("test");\n');
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createBackup', () => {
    it('should create a backup with correct directory structure', async () => {
      const result = await backupManager.createBackup(testFilePath, 'test-agent');

      expect(result.backupPath).toBeDefined();
      expect(result.fileHash).toBeDefined();
      expect(result.fileHash.length).toBe(8);
      expect(result.metadata.agentId).toBe('test-agent');
      expect(result.metadata.originalFile).toBe(testFilePath);

      // Verify directory structure exists
      await expect(fs.stat(result.backupPath)).resolves.toBeDefined();
    });

    it('should create metadata file', async () => {
      const result = await backupManager.createBackup(testFilePath, 'test-agent');
      const metadataPath = path.join(result.backupPath, 'metadata.json');

      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);

      expect(metadata.timestamp).toBeDefined();
      expect(metadata.agentId).toBe('test-agent');
      expect(metadata.originalFile).toBe(testFilePath);
      expect(metadata.fileHash).toBe(result.fileHash);
    });

    it('should create revert script', async () => {
      const result = await backupManager.createBackup(testFilePath, 'test-agent');
      const revertPath = path.join(result.backupPath, 'revert.sh');

      const revertContent = await fs.readFile(revertPath, 'utf-8');

      expect(revertContent).toContain('#!/bin/bash');
      expect(revertContent).toContain('Reverting');
      expect(revertContent).toContain(testFilePath);
    });

    it('should copy file to backup location', async () => {
      const result = await backupManager.createBackup(testFilePath, 'test-agent');
      const backupedFileName = path.basename(testFilePath);
      const backupedFilePath = path.join(result.backupPath, backupedFileName);

      const originalContent = await fs.readFile(testFilePath, 'utf-8');
      const backupedContent = await fs.readFile(backupedFilePath, 'utf-8');

      expect(originalContent).toBe(backupedContent);
    });

    it('should reject backup without agent ID', async () => {
      await expect(
        backupManager.createBackup(testFilePath, '')
      ).rejects.toThrow('Agent ID is required');
    });

    it('should reject backup without file path', async () => {
      await expect(
        backupManager.createBackup('', 'test-agent')
      ).rejects.toThrow('File path is required');
    });

    it('should reject backup of non-existent file', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.ts');
      await expect(
        backupManager.createBackup(nonExistentPath, 'test-agent')
      ).rejects.toThrow('File does not exist');
    });

    it('should generate consistent hash for same file', async () => {
      const result1 = await backupManager.createBackup(testFilePath, 'agent1');
      const result2 = await backupManager.createBackup(testFilePath, 'agent2');

      expect(result1.fileHash).toBe(result2.fileHash);
    });

    it('should generate different hash for different content', async () => {
      const result1 = await backupManager.createBackup(testFilePath, 'agent1');

      // Modify file
      await fs.writeFile(testFilePath, 'console.log("modified");\n');

      const result2 = await backupManager.createBackup(testFilePath, 'agent2');

      expect(result1.fileHash).not.toBe(result2.fileHash);
    });

    it('should count lines correctly in metadata', async () => {
      const content = 'line1\nline2\nline3\n';
      await fs.writeFile(testFilePath, content);

      const result = await backupManager.createBackup(testFilePath, 'test-agent');

      expect(result.metadata.lineCount).toBeGreaterThan(0);
    });

    it('should store file size in metadata', async () => {
      const result = await backupManager.createBackup(testFilePath, 'test-agent');

      expect(result.metadata.fileSize).toBeGreaterThan(0);
    });

    it('should create timestamped backup directory names', async () => {
      const result1 = await backupManager.createBackup(testFilePath, 'test-agent');

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result2 = await backupManager.createBackup(testFilePath, 'test-agent');

      expect(result1.backupPath).not.toBe(result2.backupPath);
    });
  });

  describe('revertFile', () => {
    it('should restore file from backup', async () => {
      const originalContent = 'console.log("test");\n';
      await fs.writeFile(testFilePath, originalContent);

      const backupResult = await backupManager.createBackup(testFilePath, 'test-agent');

      // Modify file
      const modifiedContent = 'console.log("modified");\n';
      await fs.writeFile(testFilePath, modifiedContent);

      // Revert
      await backupManager.revertFile(testFilePath, 'test-agent');

      const restoredContent = await fs.readFile(testFilePath, 'utf-8');

      expect(restoredContent).toBe(originalContent);
    });

    it('should reject revert when no backups exist', async () => {
      const fileWithoutBackup = path.join(tempDir, 'no-backup.ts');
      await fs.writeFile(fileWithoutBackup, 'test\n');

      await expect(
        backupManager.revertFile(fileWithoutBackup, 'test-agent')
      ).rejects.toThrow('No backups found');
    });

    it('should revert to most recent backup', async () => {
      const content1 = 'version1\n';
      await fs.writeFile(testFilePath, content1);
      await backupManager.createBackup(testFilePath, 'test-agent');

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 50));

      const content2 = 'version2\n';
      await fs.writeFile(testFilePath, content2);
      await backupManager.createBackup(testFilePath, 'test-agent');

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Modify to something else
      await fs.writeFile(testFilePath, 'current version\n');

      // Revert should go to version2
      await backupManager.revertFile(testFilePath, 'test-agent');

      const restoredContent = await fs.readFile(testFilePath, 'utf-8');

      expect(restoredContent).toBe(content2);
    });
  });

  describe('listBackups', () => {
    it('should list all backups for a file', async () => {
      await backupManager.createBackup(testFilePath, 'agent1');

      await new Promise((resolve) => setTimeout(resolve, 50));

      await backupManager.createBackup(testFilePath, 'agent2');

      const backups = await backupManager.listBackups(testFilePath);

      expect(backups.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty list for file with no backups', async () => {
      const fileWithoutBackup = path.join(tempDir, 'no-backup.ts');
      await fs.writeFile(fileWithoutBackup, 'test\n');

      const backups = await backupManager.listBackups(fileWithoutBackup);

      expect(backups.length).toBe(0);
    });

    it('should sort backups by most recent first', async () => {
      await backupManager.createBackup(testFilePath, 'agent1');

      await new Promise((resolve) => setTimeout(resolve, 100));

      await backupManager.createBackup(testFilePath, 'agent2');

      const backups = await backupManager.listBackups(testFilePath);

      if (backups.length >= 2) {
        const time1 = new Date(backups[0].metadata.createdAt).getTime();
        const time2 = new Date(backups[1].metadata.createdAt).getTime();

        expect(time1).toBeGreaterThanOrEqual(time2);
      }
    });

    it('should return backup metadata', async () => {
      await backupManager.createBackup(testFilePath, 'test-agent');

      const backups = await backupManager.listBackups(testFilePath);

      expect(backups.length).toBeGreaterThan(0);
      expect(backups[0].metadata).toBeDefined();
      expect(backups[0].metadata.agentId).toBe('test-agent');
      expect(backups[0].metadata.originalFile).toBe(testFilePath);
    });
  });

  describe('cleanOldBackups', () => {
    it('should remove old backups exceeding max count', async () => {
      // Create more backups than max (5)
      for (let i = 0; i < 8; i++) {
        const content = `version ${i}\n`;
        await fs.writeFile(testFilePath, content);
        await backupManager.createBackup(testFilePath, 'test-agent');

        // Small delay between backups
        if (i < 7) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      const deletedCount = await backupManager.cleanOldBackups('test-agent');

      expect(deletedCount).toBeGreaterThan(0);

      const remainingBackups = await backupManager.listBackups(testFilePath);

      expect(remainingBackups.length).toBeLessThanOrEqual(5);
    });

    it('should not clean up recent backups', async () => {
      await backupManager.createBackup(testFilePath, 'test-agent');

      const deletedCount = await backupManager.cleanOldBackups('test-agent');

      // Recent backup should not be deleted
      expect(deletedCount).toBe(0);
    });

    it('should return count of deleted backups', async () => {
      // Create multiple backups
      for (let i = 0; i < 3; i++) {
        const content = `version ${i}\n`;
        await fs.writeFile(testFilePath, content);
        await backupManager.createBackup(testFilePath, 'test-agent');

        if (i < 2) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      const initialBackups = await backupManager.listBackups(testFilePath);
      const deletedCount = await backupManager.cleanOldBackups('test-agent');

      expect(typeof deletedCount).toBe('number');
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('verifyBackup', () => {
    it('should verify valid backup', async () => {
      const result = await backupManager.createBackup(testFilePath, 'test-agent');

      const isValid = await backupManager.verifyBackup(result.backupPath);

      expect(isValid).toBe(true);
    });

    it('should detect corrupted backup', async () => {
      const result = await backupManager.createBackup(testFilePath, 'test-agent');

      // Corrupt the backup file
      const backupedFileName = path.basename(testFilePath);
      const backupedFilePath = path.join(result.backupPath, backupedFileName);
      await fs.writeFile(backupedFilePath, 'corrupted content\n');

      const isValid = await backupManager.verifyBackup(result.backupPath);

      expect(isValid).toBe(false);
    });

    it('should detect missing backup metadata', async () => {
      const result = await backupManager.createBackup(testFilePath, 'test-agent');

      // Delete metadata
      const metadataPath = path.join(result.backupPath, 'metadata.json');
      await fs.rm(metadataPath);

      const isValid = await backupManager.verifyBackup(result.backupPath);

      expect(isValid).toBe(false);
    });

    it('should handle invalid backup path', async () => {
      const invalidPath = path.join(tempDir, 'nonexistent');

      const isValid = await backupManager.verifyBackup(invalidPath);

      expect(isValid).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle files with special characters in name', async () => {
      const specialFile = path.join(tempDir, 'file-with-special_chars.1.ts');
      await fs.writeFile(specialFile, 'test\n');

      const result = await backupManager.createBackup(specialFile, 'test-agent');

      expect(result.backupPath).toBeDefined();
    });

    it('should handle empty files', async () => {
      const emptyFile = path.join(tempDir, 'empty.ts');
      await fs.writeFile(emptyFile, '');

      const result = await backupManager.createBackup(emptyFile, 'test-agent');

      expect(result.metadata.fileSize).toBe(0);
    });

    it('should handle large files', async () => {
      const largeFile = path.join(tempDir, 'large.ts');
      const largeContent = 'x'.repeat(1000000) + '\n'; // 1MB
      await fs.writeFile(largeFile, largeContent);

      const result = await backupManager.createBackup(largeFile, 'test-agent');

      expect(result.metadata.fileSize).toBeGreaterThan(1000000);
    });

    it('should handle files with binary content', async () => {
      const binaryFile = path.join(tempDir, 'binary.bin');
      await fs.writeFile(binaryFile, Buffer.from([0x00, 0x01, 0x02, 0x03]));

      const result = await backupManager.createBackup(binaryFile, 'test-agent');

      expect(result.backupPath).toBeDefined();
    });

    it('should handle concurrent backups', async () => {
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const content = `version ${i}\n`;
        await fs.writeFile(testFilePath, content);

        promises.push(backupManager.createBackup(testFilePath, `agent-${i}`));
      }

      const results = await Promise.all(promises);

      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result.backupPath).toBeDefined();
      });
    });
  });
});
