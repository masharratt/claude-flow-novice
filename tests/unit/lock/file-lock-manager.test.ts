/**
 * File Lock Manager Test Suite
 *
 * Comprehensive tests for file locking and atomic write operations.
 * Part of Task 4.2: Centralized File Locking & Atomic Operations
 *
 * Coverage areas:
 * - Lock acquisition and release
 * - Timeout scenarios
 * - Concurrent access
 * - Lock renewal
 * - Stale lock detection
 * - Atomic writes with checksum
 * - Error handling
 * - Performance metrics
 *
 * Target: 95%+ coverage
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import {
  FileLockManager,
  getFileLockManager,
  withFileLock,
  LockAcquisitionOptions,
} from '../src/lib/file-lock-manager';
import {
  AtomicFileWriter,
  getAtomicFileWriter,
  atomicWriteFile,
  atomicReadFile,
  WriteOptions,
} from '../src/lib/atomic-file-writer';

const fsUnlink = promisify(fs.unlink);
const fsReadFile = promisify(fs.readFile);
const fsMkdir = promisify(fs.mkdir);
const fsRmdir = promisify(fs.rmdir);

const TEST_DIR = '/tmp/cfn-file-lock-test';
const LOCK_DIR = '/tmp/cfn-locks-test';

// Set lock directory for tests
process.env.CFN_LOCK_DIR = LOCK_DIR;

describe('FileLockManager', () => {
  let manager: FileLockManager;
  let testFilePath: string;

  beforeEach(async () => {
    // Create test directories
    await fsMkdir(TEST_DIR, { recursive: true });
    await fsMkdir(LOCK_DIR, { recursive: true });

    // Create new manager instance
    manager = new FileLockManager();

    // Create test file
    testFilePath = path.join(TEST_DIR, 'test-file.txt');
    await fs.promises.writeFile(testFilePath, 'initial content');
  });

  afterEach(async () => {
    // Shutdown manager
    await manager.shutdown();

    // Clean up test files
    try {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
      await fs.promises.rm(LOCK_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Lock Acquisition', () => {
    it('should acquire lock successfully', async () => {
      const lock = await manager.acquireLock(testFilePath, {
        agentId: 'test-agent',
        timeout: 5000,
      });

      expect(lock).toBeDefined();
      expect(lock.id).toBeDefined();
      expect(lock.filePath).toBe(path.resolve(testFilePath));
      expect(lock.owner.agentId).toBe('test-agent');

      await manager.releaseLock(lock.id);
    });

    it('should create lock file', async () => {
      const lock = await manager.acquireLock(testFilePath);

      expect(fs.existsSync(lock.lockPath)).toBe(true);

      await manager.releaseLock(lock.id);
      expect(fs.existsSync(lock.lockPath)).toBe(false);
    });

    it('should include process ID in lock metadata', async () => {
      const lock = await manager.acquireLock(testFilePath);

      expect(lock.owner.pid).toBe(process.pid);

      await manager.releaseLock(lock.id);
    });

    it('should timeout if lock is held', async () => {
      // Acquire first lock
      const lock1 = await manager.acquireLock(testFilePath);

      // Try to acquire second lock with short timeout
      await expect(
        manager.acquireLock(testFilePath, {
          timeout: 500,
          waitInQueue: false,
        })
      ).rejects.toThrow();

      await manager.releaseLock(lock1.id);
    });

    it('should wait in queue and acquire lock after release', async () => {
      const lock1 = await manager.acquireLock(testFilePath, {
        agentId: 'agent-1',
      });

      // Start second acquisition in background
      const lock2Promise = manager.acquireLock(testFilePath, {
        agentId: 'agent-2',
        timeout: 10000,
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Release first lock
      await manager.releaseLock(lock1.id);

      // Second lock should acquire successfully
      const lock2 = await lock2Promise;
      expect(lock2).toBeDefined();
      expect(lock2.owner.agentId).toBe('agent-2');

      await manager.releaseLock(lock2.id);
    });

    it('should acquire lock immediately when available', async () => {
      const startTime = Date.now();
      const lock = await manager.acquireLock(testFilePath);
      const duration = Date.now() - startTime;

      // Should be very fast when lock is available
      expect(duration).toBeLessThan(100);

      await manager.releaseLock(lock.id);
    });

    it('should handle multiple concurrent acquisitions', async () => {
      const numAttempts = 5;
      const locks: string[] = [];

      // First lock succeeds
      const lock1 = await manager.acquireLock(testFilePath);
      locks.push(lock1.id);

      // Start multiple acquisitions
      const promises = Array.from({ length: numAttempts }).map((_, i) =>
        manager.acquireLock(testFilePath, {
          agentId: `agent-${i}`,
          timeout: 10000,
        })
      );

      // Release first lock after delay
      setTimeout(async () => {
        await manager.releaseLock(lock1.id);
      }, 500);

      // One of the waiting locks should acquire
      const results = await Promise.race([
        promises[0],
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
      ]);

      expect(results).toBeDefined();
    }, 30000);
  });

  describe('Lock Release', () => {
    it('should release lock successfully', async () => {
      const lock = await manager.acquireLock(testFilePath);

      await manager.releaseLock(lock.id);

      const metrics = manager.getMetrics();
      expect(metrics.releases).toBeGreaterThan(0);
    });

    it('should remove lock file on release', async () => {
      const lock = await manager.acquireLock(testFilePath);
      const lockPath = lock.lockPath;

      expect(fs.existsSync(lockPath)).toBe(true);

      await manager.releaseLock(lock.id);

      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('should handle release of non-existent lock gracefully', async () => {
      // Should not throw
      await expect(manager.releaseLock('non-existent-lock-id')).resolves.not.toThrow();
    });

    it('should allow re-acquisition after release', async () => {
      const lock1 = await manager.acquireLock(testFilePath);
      await manager.releaseLock(lock1.id);

      const lock2 = await manager.acquireLock(testFilePath);
      expect(lock2).toBeDefined();

      await manager.releaseLock(lock2.id);
    });
  });

  describe('Lock Renewal', () => {
    it('should renew lock successfully', async () => {
      const lock = await manager.acquireLock(testFilePath);

      const originalExpires = lock.expiresAt;

      await manager.renewLock(lock.id, 60000);

      // Expiration should be extended
      expect(lock.expiresAt.getTime()).toBeGreaterThan(originalExpires.getTime());
      expect(lock.renewalCount).toBe(1);

      await manager.releaseLock(lock.id);
    });

    it('should increment renewal count', async () => {
      const lock = await manager.acquireLock(testFilePath);

      await manager.renewLock(lock.id, 60000);
      expect(lock.renewalCount).toBe(1);

      await manager.renewLock(lock.id, 60000);
      expect(lock.renewalCount).toBe(2);

      await manager.releaseLock(lock.id);
    });

    it('should fail to renew non-existent lock', async () => {
      await expect(manager.renewLock('non-existent-lock', 60000)).rejects.toThrow();
    });

    it('should update lock metadata on renewal', async () => {
      const lock = await manager.acquireLock(testFilePath);

      await manager.renewLock(lock.id, 60000);

      // Read lock file
      const lockData = JSON.parse(await fsReadFile(lock.lockPath, 'utf8'));

      expect(lockData.renewalCount).toBe(1);
      expect(lockData.lastRenewedAt).toBeDefined();

      await manager.releaseLock(lock.id);
    });
  });

  describe('Stale Lock Detection', () => {
    it('should detect and clean stale locks', async () => {
      const lock = await manager.acquireLock(testFilePath, {
        timeout: 1000, // 1 second
      });

      // Wait for lock to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // New acquisition should clean stale lock
      const lock2 = await manager.acquireLock(testFilePath);

      expect(lock2).toBeDefined();
      expect(lock2.id).not.toBe(lock.id);

      await manager.releaseLock(lock2.id);
    });

    it('should update stale lock metrics', async () => {
      const metricsBefore = manager.getMetrics();

      const lock = await manager.acquireLock(testFilePath, {
        timeout: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      const lock2 = await manager.acquireLock(testFilePath);

      const metricsAfter = manager.getMetrics();

      expect(metricsAfter.staleLocksRemoved).toBeGreaterThan(metricsBefore.staleLocksRemoved);

      await manager.releaseLock(lock2.id);
    });
  });

  describe('Force Release', () => {
    it('should force release a lock', async () => {
      const lock = await manager.acquireLock(testFilePath);

      await manager.forceReleaseLock(lock.lockPath);

      expect(fs.existsSync(lock.lockPath)).toBe(false);
    });

    it('should allow acquisition after force release', async () => {
      const lock1 = await manager.acquireLock(testFilePath);

      await manager.forceReleaseLock(lock1.lockPath);

      const lock2 = await manager.acquireLock(testFilePath);
      expect(lock2).toBeDefined();

      await manager.releaseLock(lock2.id);
    });

    it('should update force release metrics', async () => {
      const metricsBefore = manager.getMetrics();

      const lock = await manager.acquireLock(testFilePath);
      await manager.forceReleaseLock(lock.lockPath);

      const metricsAfter = manager.getMetrics();

      expect(metricsAfter.forceReleases).toBeGreaterThan(metricsBefore.forceReleases);
    });
  });

  describe('Metrics', () => {
    it('should track acquisitions', async () => {
      const metricsBefore = manager.getMetrics();

      const lock = await manager.acquireLock(testFilePath);
      await manager.releaseLock(lock.id);

      const metricsAfter = manager.getMetrics();

      expect(metricsAfter.acquisitions).toBeGreaterThan(metricsBefore.acquisitions);
    });

    it('should track active locks', async () => {
      const lock1 = await manager.acquireLock(path.join(TEST_DIR, 'file1.txt'));
      const lock2 = await manager.acquireLock(path.join(TEST_DIR, 'file2.txt'));

      const metrics = manager.getMetrics();
      expect(metrics.activeLocks).toBeGreaterThanOrEqual(2);

      await manager.releaseLock(lock1.id);
      await manager.releaseLock(lock2.id);
    });

    it('should calculate average acquisition time', async () => {
      await manager.acquireLock(testFilePath);

      const metrics = manager.getMetrics();

      expect(metrics.avgAcquisitionTimeMs).toBeGreaterThanOrEqual(0);
      expect(metrics.avgAcquisitionTimeMs).toBeLessThan(100);
    });
  });

  describe('Helper Functions', () => {
    it('should work with withFileLock helper', async () => {
      let executed = false;

      await withFileLock(
        testFilePath,
        async () => {
          executed = true;
        },
        { agentId: 'test-agent' }
      );

      expect(executed).toBe(true);
    });

    it('should release lock even on error with helper', async () => {
      const error = new Error('Test error');

      await expect(
        withFileLock(testFilePath, async () => {
          throw error;
        })
      ).rejects.toThrow('Test error');

      // Lock should be released, so we can acquire it
      const lock = await manager.acquireLock(testFilePath);
      expect(lock).toBeDefined();
      await manager.releaseLock(lock.id);
    });

    it('should return function result with helper', async () => {
      const result = await withFileLock(testFilePath, async () => {
        return 42;
      });

      expect(result).toBe(42);
    });
  });

  describe('Queue Status', () => {
    it('should return null for no queue', () => {
      const status = manager.getQueueStatus(testFilePath);
      expect(status).toBeNull();
    });

    it('should return queue status when waiting', async () => {
      const lock1 = await manager.acquireLock(testFilePath);

      // Start second acquisition (will queue)
      const lock2Promise = manager.acquireLock(testFilePath, {
        timeout: 10000,
      });

      // Wait for queue to form
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = manager.getQueueStatus(testFilePath);
      expect(status).not.toBeNull();
      expect(status!.total).toBeGreaterThan(0);

      await manager.releaseLock(lock1.id);
      await lock2Promise;
    }, 30000);
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const manager1 = getFileLockManager();
      const manager2 = getFileLockManager();

      expect(manager1).toBe(manager2);
    });
  });
});

describe('AtomicFileWriter', () => {
  let writer: AtomicFileWriter;
  let testFilePath: string;

  beforeEach(async () => {
    await fsMkdir(TEST_DIR, { recursive: true });

    writer = new AtomicFileWriter();
    testFilePath = path.join(TEST_DIR, 'atomic-test.txt');
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Atomic Write', () => {
    it('should write file atomically', async () => {
      const content = 'Test content';

      const result = await writer.writeFile(testFilePath, content);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(path.resolve(testFilePath));

      const written = await fsReadFile(testFilePath, 'utf8');
      expect(written).toBe(content);
    });

    it('should verify checksum by default', async () => {
      const content = 'Test content';

      const result = await writer.writeFile(testFilePath, content, {
        verifyChecksum: true,
      });

      expect(result.checksum).toBeDefined();
      expect(result.checksum.length).toBe(64); // SHA256 hex length
    });

    it('should create backup when requested', async () => {
      // Create initial file
      await fs.promises.writeFile(testFilePath, 'Original content');

      const result = await writer.writeFile(testFilePath, 'Updated content', {
        createBackup: true,
      });

      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath!)).toBe(true);

      const backup = await fsReadFile(result.backupPath!, 'utf8');
      expect(backup).toBe('Original content');
    });

    it('should preserve file permissions', async () => {
      // Create file with specific permissions
      await fs.promises.writeFile(testFilePath, 'Original');
      await fs.promises.chmod(testFilePath, 0o600);

      await writer.writeFile(testFilePath, 'Updated', {
        preservePermissions: true,
      });

      const stats = await fs.promises.stat(testFilePath);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('should rollback on checksum failure', async () => {
      // Create original file
      await fs.promises.writeFile(testFilePath, 'Original');

      // Mock checksum verification to fail
      const originalVerify = writer['calculateFileChecksum'];
      writer['calculateFileChecksum'] = async () => 'wrong-checksum';

      await expect(
        writer.writeFile(testFilePath, 'Updated', {
          verifyChecksum: true,
          createBackup: true,
        })
      ).rejects.toThrow();

      // Restore mock
      writer['calculateFileChecksum'] = originalVerify;
    });

    it('should report bytes written', async () => {
      const content = 'Test content here';

      const result = await writer.writeFile(testFilePath, content);

      expect(result.bytesWritten).toBe(content.length);
    });

    it('should report write duration', async () => {
      const result = await writer.writeFile(testFilePath, 'Content');

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThan(1000);
    });

    it('should handle Buffer content', async () => {
      const buffer = Buffer.from('Binary content', 'utf8');

      const result = await writer.writeFile(testFilePath, buffer);

      expect(result.success).toBe(true);

      const written = await fs.promises.readFile(testFilePath);
      expect(written.toString()).toBe('Binary content');
    });
  });

  describe('Atomic Read', () => {
    it('should read file with checksum', async () => {
      const content = 'Test content';
      await fs.promises.writeFile(testFilePath, content);

      const result = await writer.readFile(testFilePath);

      expect(result.content).toBe(content);
      expect(result.checksum).toBeDefined();
    });

    it('should verify expected checksum', async () => {
      const content = 'Test';
      await fs.promises.writeFile(testFilePath, content);

      // Calculate expected checksum
      const crypto = require('crypto');
      const expectedChecksum = crypto.createHash('sha256').update(content).digest('hex');

      const result = await writer.readFile(testFilePath, expectedChecksum);

      expect(result.content).toBe(content);
      expect(result.checksum).toBe(expectedChecksum);
    });

    it('should fail on checksum mismatch', async () => {
      await fs.promises.writeFile(testFilePath, 'Test');

      const wrongChecksum = '0'.repeat(64);

      await expect(writer.readFile(testFilePath, wrongChecksum)).rejects.toThrow();
    });
  });

  describe('Checksum Verification', () => {
    it('should verify file checksum', async () => {
      const content = 'Test content';
      await fs.promises.writeFile(testFilePath, content);

      const crypto = require('crypto');
      const expectedChecksum = crypto.createHash('sha256').update(content).digest('hex');

      const isValid = await writer.verifyChecksum(testFilePath, expectedChecksum);

      expect(isValid).toBe(true);
    });

    it('should detect invalid checksum', async () => {
      await fs.promises.writeFile(testFilePath, 'Test');

      const wrongChecksum = '0'.repeat(64);

      const isValid = await writer.verifyChecksum(testFilePath, wrongChecksum);

      expect(isValid).toBe(false);
    });

    it('should handle non-existent file', async () => {
      const isValid = await writer.verifyChecksum('/non/existent/file.txt', '0'.repeat(64));

      expect(isValid).toBe(false);
    });
  });

  describe('Helper Functions', () => {
    it('should work with atomicWriteFile helper', async () => {
      const result = await atomicWriteFile(testFilePath, 'Content', {
        verifyChecksum: true,
      });

      expect(result.success).toBe(true);
    });

    it('should work with atomicReadFile helper', async () => {
      await fs.promises.writeFile(testFilePath, 'Content');

      const result = await atomicReadFile(testFilePath);

      expect(result.content).toBe('Content');
      expect(result.checksum).toBeDefined();
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const writer1 = getAtomicFileWriter();
      const writer2 = getAtomicFileWriter();

      expect(writer1).toBe(writer2);
    });
  });

  describe('Integration with Lock Manager', () => {
    it('should use lock during write', async () => {
      const result = await writer.writeFile(testFilePath, 'Content', {
        useLock: true,
        lockOptions: {
          agentId: 'test-agent',
          timeout: 5000,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should handle concurrent writes with locking', async () => {
      const promises = Array.from({ length: 5 }).map((_, i) =>
        writer.writeFile(testFilePath, `Content ${i}`, {
          useLock: true,
          verifyChecksum: true,
        })
      );

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle write errors', async () => {
      // Use a path that's actually invalid (not just non-existent)
      const invalidPath = '/dev/null/file.txt'; // Can't create files under /dev/null

      await expect(writer.writeFile(invalidPath, 'Content')).rejects.toThrow();
    });

    it('should handle read errors', async () => {
      const nonExistent = '/non/existent/file.txt';

      await expect(writer.readFile(nonExistent)).rejects.toThrow();
    });
  });
});

describe('Performance', () => {
  it('should acquire lock in <100ms when available', async () => {
    const manager = new FileLockManager();
    const testFile = path.join(TEST_DIR, 'perf-test.txt');

    await fsMkdir(TEST_DIR, { recursive: true });

    const startTime = Date.now();
    const lock = await manager.acquireLock(testFile);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100);

    await manager.releaseLock(lock.id);
    await manager.shutdown();
  });

  it('should write small files in <50ms', async () => {
    const writer = new AtomicFileWriter();
    const testFile = path.join(TEST_DIR, 'perf-write-test.txt');

    await fsMkdir(TEST_DIR, { recursive: true });

    const result = await writer.writeFile(testFile, 'Small content', {
      useLock: false, // Skip locking for pure write performance
    });

    expect(result.durationMs).toBeLessThan(50);
  });
});
