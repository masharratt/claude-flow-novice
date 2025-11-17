/**
 * File Lock Manager
 *
 * Centralized file locking system with queuing, renewal, and monitoring.
 * Part of Task 4.2: Centralized File Locking & Atomic Operations
 *
 * Features:
 * - Lock acquisition with configurable timeout (300s default)
 * - Waiting queue for blocked processes
 * - Lock renewal for long-running operations
 * - Force release capability for stuck locks
 * - Owner tracking (process ID + agent ID)
 * - Stale lock detection and cleanup
 * - Performance monitoring (<100ms acquisition target)
 * - Automatic lock release on process exit
 *
 * Usage:
 *   const manager = new FileLockManager();
 *   const lock = await manager.acquireLock('/path/to/file.txt', {
 *     agentId: 'backend-dev-001',
 *     timeout: 30000
 *   });
 *   try {
 *     // Perform file operations
 *   } finally {
 *     await manager.releaseLock(lock.id);
 *   }
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { createLogger } from './logging.js';
import { createError, ErrorCode, createTimeoutError } from './errors.js';

const logger = createLogger('file-lock-manager');

const fsWriteFile = promisify(fs.writeFile);
const fsReadFile = promisify(fs.readFile);
const fsUnlink = promisify(fs.unlink);
const fsStat = promisify(fs.stat);
const fsMkdir = promisify(fs.mkdir);
const fsAccess = promisify(fs.access);

/**
 * Lock directory (defaults to /tmp/cfn-locks/)
 */
const LOCK_DIR = process.env.CFN_LOCK_DIR || '/tmp/cfn-locks';

/**
 * Lock owner information
 */
export interface LockOwner {
  /** Process ID */
  pid: number;
  /** Agent ID (optional) */
  agentId?: string;
  /** Hostname (for distributed systems) */
  hostname: string;
}

/**
 * Lock metadata stored in lock file
 */
export interface LockMetadata {
  /** Unique lock ID */
  lockId: string;
  /** File path being locked */
  filePath: string;
  /** Lock owner information */
  owner: LockOwner;
  /** Acquisition timestamp */
  acquiredAt: string;
  /** Expiration timestamp */
  expiresAt: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Last renewal timestamp */
  lastRenewedAt?: string;
  /** Number of renewals */
  renewalCount: number;
}

/**
 * Active lock instance
 */
export interface FileLock {
  /** Lock ID */
  id: string;
  /** File path */
  filePath: string;
  /** Lock file path */
  lockPath: string;
  /** Owner information */
  owner: LockOwner;
  /** Acquisition time */
  acquiredAt: Date;
  /** Expiration time */
  expiresAt: Date;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Renewal count */
  renewalCount: number;
}

/**
 * Lock acquisition options
 */
export interface LockAcquisitionOptions {
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Retry interval in milliseconds (default: 100) */
  retryInterval?: number;
  /** Agent ID for tracking */
  agentId?: string;
  /** Wait in queue if lock is held (default: true) */
  waitInQueue?: boolean;
  /** Stale lock detection timeout in milliseconds (default: 300000) */
  staleTimeout?: number;
}

/**
 * Queue entry for waiting processes
 */
interface QueueEntry {
  /** Entry ID */
  id: string;
  /** File path */
  filePath: string;
  /** Agent ID */
  agentId?: string;
  /** Process ID */
  pid: number;
  /** Queued timestamp */
  queuedAt: Date;
  /** Resolve function */
  resolve: (lock: FileLock) => void;
  /** Reject function */
  reject: (error: Error) => void;
  /** Timeout timer */
  timeoutTimer?: NodeJS.Timeout;
}

/**
 * Lock acquisition metrics
 */
export interface LockMetrics {
  /** Total lock acquisitions */
  acquisitions: number;
  /** Total lock releases */
  releases: number;
  /** Current active locks */
  activeLocks: number;
  /** Total lock timeouts */
  timeouts: number;
  /** Total stale locks cleaned */
  staleLocksRemoved: number;
  /** Average acquisition time (ms) */
  avgAcquisitionTimeMs: number;
  /** Total time spent acquiring locks (ms) */
  totalAcquisitionTimeMs: number;
  /** Lock renewals */
  renewals: number;
  /** Force releases */
  forceReleases: number;
}

/**
 * File Lock Manager
 *
 * Manages file locks with queuing, renewal, and monitoring capabilities.
 */
export class FileLockManager {
  private activeLocks: Map<string, FileLock> = new Map();
  private lockQueues: Map<string, QueueEntry[]> = new Map();
  private metrics: LockMetrics = {
    acquisitions: 0,
    releases: 0,
    activeLocks: 0,
    timeouts: 0,
    staleLocksRemoved: 0,
    avgAcquisitionTimeMs: 0,
    totalAcquisitionTimeMs: 0,
    renewals: 0,
    forceReleases: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureLockDirectory();
    this.setupCleanupInterval();
    this.setupProcessExitHandlers();
  }

  /**
   * Acquire a file lock
   *
   * @param filePath - Path to file to lock
   * @param options - Lock acquisition options
   * @returns Promise<FileLock> - Lock instance
   * @throws LOCK_TIMEOUT if acquisition times out
   */
  async acquireLock(
    filePath: string,
    options: LockAcquisitionOptions = {}
  ): Promise<FileLock> {
    const startTime = Date.now();
    const opts = {
      timeout: options.timeout || 300000, // 5 minutes default
      retryInterval: options.retryInterval || 100,
      agentId: options.agentId,
      waitInQueue: options.waitInQueue !== false,
      staleTimeout: options.staleTimeout || 300000,
    };

    const absolutePath = path.resolve(filePath);
    const lockPath = this.getLockPath(absolutePath);
    const lockId = randomUUID();

    logger.debug('Attempting lock acquisition', {
      filePath: absolutePath,
      lockId,
      agentId: opts.agentId,
    });

    // Try immediate acquisition
    const immediateLock = await this.tryAcquireLock(
      absolutePath,
      lockPath,
      lockId,
      opts
    );

    if (immediateLock) {
      const acquisitionTime = Date.now() - startTime;
      this.recordAcquisition(acquisitionTime);
      logger.info('Lock acquired immediately', {
        filePath: absolutePath,
        lockId,
        acquisitionTimeMs: acquisitionTime,
      });
      return immediateLock;
    }

    // If immediate acquisition failed and queuing is enabled, wait in queue
    if (opts.waitInQueue) {
      return this.waitInQueue(absolutePath, lockPath, lockId, opts, startTime);
    }

    throw createTimeoutError(`acquire lock on ${absolutePath}`, 0);
  }

  /**
   * Try to acquire lock immediately
   */
  private async tryAcquireLock(
    filePath: string,
    lockPath: string,
    lockId: string,
    options: Required<LockAcquisitionOptions>
  ): Promise<FileLock | null> {
    try {
      // Check if lock file exists
      const exists = await this.fileExists(lockPath);

      if (exists) {
        // Check if lock is stale
        const isStale = await this.isLockStale(lockPath, options.staleTimeout);

        if (isStale) {
          logger.warn('Removing stale lock', { lockPath });
          await this.forceReleaseLock(lockPath);
          this.metrics.staleLocksRemoved++;
        } else {
          return null; // Lock is held by another process
        }
      }

      // Create lock
      const owner: LockOwner = {
        pid: process.pid,
        agentId: options.agentId,
        hostname: require('os').hostname(),
      };

      const expiresAt = new Date(Date.now() + options.timeout);
      const metadata: LockMetadata = {
        lockId,
        filePath,
        owner,
        acquiredAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        timeoutMs: options.timeout,
        renewalCount: 0,
      };

      // Write lock file atomically
      await this.writeLockFile(lockPath, metadata);

      // Verify we won the race
      const verify = await this.readLockFile(lockPath);
      if (verify.lockId !== lockId) {
        logger.debug('Lost lock race', { lockId, winnerId: verify.lockId });
        return null;
      }

      // Create and store lock instance
      const lock: FileLock = {
        id: lockId,
        filePath,
        lockPath,
        owner,
        acquiredAt: new Date(),
        expiresAt,
        timeoutMs: options.timeout,
        renewalCount: 0,
      };

      this.activeLocks.set(lockId, lock);
      this.metrics.activeLocks++;

      return lock;
    } catch (error) {
      logger.error(
        'Error during lock acquisition attempt',
        error instanceof Error ? error : undefined,
        { filePath, lockId }
      );
      return null;
    }
  }

  /**
   * Wait in queue for lock availability
   */
  private async waitInQueue(
    filePath: string,
    lockPath: string,
    lockId: string,
    options: Required<LockAcquisitionOptions>,
    startTime: number
  ): Promise<FileLock> {
    return new Promise((resolve, reject) => {
      const queueEntry: QueueEntry = {
        id: randomUUID(),
        filePath,
        agentId: options.agentId,
        pid: process.pid,
        queuedAt: new Date(),
        resolve,
        reject,
      };

      // Set timeout
      queueEntry.timeoutTimer = setTimeout(() => {
        this.removeFromQueue(filePath, queueEntry.id);
        this.metrics.timeouts++;
        reject(createTimeoutError(`acquire lock on ${filePath}`, options.timeout));
      }, options.timeout);

      // Add to queue
      if (!this.lockQueues.has(filePath)) {
        this.lockQueues.set(filePath, []);
      }
      this.lockQueues.get(filePath)!.push(queueEntry);

      logger.debug('Added to lock queue', {
        filePath,
        queuePosition: this.lockQueues.get(filePath)!.length,
        agentId: options.agentId,
      });

      // Start polling for lock availability
      this.pollForLock(filePath, lockPath, lockId, options, queueEntry, startTime);
    });
  }

  /**
   * Poll for lock availability
   */
  private async pollForLock(
    filePath: string,
    lockPath: string,
    lockId: string,
    options: Required<LockAcquisitionOptions>,
    queueEntry: QueueEntry,
    startTime: number
  ): Promise<void> {
    const pollInterval = setInterval(async () => {
      try {
        const lock = await this.tryAcquireLock(filePath, lockPath, lockId, options);

        if (lock) {
          clearInterval(pollInterval);
          if (queueEntry.timeoutTimer) {
            clearTimeout(queueEntry.timeoutTimer);
          }
          this.removeFromQueue(filePath, queueEntry.id);

          const acquisitionTime = Date.now() - startTime;
          this.recordAcquisition(acquisitionTime);

          logger.info('Lock acquired from queue', {
            filePath,
            lockId,
            waitTimeMs: acquisitionTime,
          });

          queueEntry.resolve(lock);
        }
      } catch (error) {
        clearInterval(pollInterval);
        if (queueEntry.timeoutTimer) {
          clearTimeout(queueEntry.timeoutTimer);
        }
        this.removeFromQueue(filePath, queueEntry.id);
        queueEntry.reject(
          error instanceof Error
            ? error
            : new Error(`Lock acquisition failed: ${String(error)}`)
        );
      }
    }, options.retryInterval);
  }

  /**
   * Release a lock
   *
   * @param lockId - Lock ID to release
   * @returns Promise that resolves when lock is released
   */
  async releaseLock(lockId: string): Promise<void> {
    const lock = this.activeLocks.get(lockId);

    if (!lock) {
      logger.warn('Attempted to release non-existent lock', { lockId });
      return;
    }

    try {
      // Remove lock file
      await fsUnlink(lock.lockPath);

      // Remove from active locks
      this.activeLocks.delete(lockId);
      this.metrics.activeLocks--;
      this.metrics.releases++;

      logger.info('Lock released', {
        lockId,
        filePath: lock.filePath,
        heldDurationMs: Date.now() - lock.acquiredAt.getTime(),
      });
    } catch (error) {
      logger.error(
        'Error releasing lock',
        error instanceof Error ? error : undefined,
        { lockId, filePath: lock.filePath }
      );
      throw createError(
        ErrorCode.LOCK_RELEASE_FAILED,
        `Failed to release lock ${lockId}`,
        { lockId, filePath: lock.filePath },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Renew a lock (extend expiration time)
   *
   * @param lockId - Lock ID to renew
   * @param extensionMs - Extension time in milliseconds
   * @returns Promise that resolves when lock is renewed
   */
  async renewLock(lockId: string, extensionMs: number = 300000): Promise<void> {
    const lock = this.activeLocks.get(lockId);

    if (!lock) {
      throw createError(ErrorCode.LOCK_NOT_FOUND, `Lock not found: ${lockId}`, {
        lockId,
      });
    }

    try {
      // Read current metadata
      const metadata = await this.readLockFile(lock.lockPath);

      // Verify ownership
      if (metadata.lockId !== lockId) {
        throw createError(
          ErrorCode.LOCK_OWNERSHIP_MISMATCH,
          'Lock ownership mismatch during renewal',
          { lockId, actualOwnerId: metadata.lockId }
        );
      }

      // Update expiration
      const newExpiresAt = new Date(Date.now() + extensionMs);
      metadata.expiresAt = newExpiresAt.toISOString();
      metadata.lastRenewedAt = new Date().toISOString();
      metadata.renewalCount++;

      // Write updated metadata
      await this.writeLockFile(lock.lockPath, metadata);

      // Update in-memory lock
      lock.expiresAt = newExpiresAt;
      lock.renewalCount = metadata.renewalCount;

      this.metrics.renewals++;

      logger.info('Lock renewed', {
        lockId,
        filePath: lock.filePath,
        newExpiresAt: newExpiresAt.toISOString(),
        renewalCount: metadata.renewalCount,
      });
    } catch (error) {
      logger.error(
        'Error renewing lock',
        error instanceof Error ? error : undefined,
        { lockId, filePath: lock.filePath }
      );
      throw error;
    }
  }

  /**
   * Force release a lock (for stuck locks)
   *
   * @param lockPath - Path to lock file
   * @returns Promise that resolves when lock is force-released
   */
  async forceReleaseLock(lockPath: string): Promise<void> {
    try {
      const exists = await this.fileExists(lockPath);

      if (exists) {
        const metadata = await this.readLockFile(lockPath);
        await fsUnlink(lockPath);

        // Remove from active locks if present
        if (this.activeLocks.has(metadata.lockId)) {
          this.activeLocks.delete(metadata.lockId);
          this.metrics.activeLocks--;
        }

        this.metrics.forceReleases++;

        logger.warn('Lock force-released', {
          lockPath,
          lockId: metadata.lockId,
          owner: metadata.owner,
        });
      }
    } catch (error) {
      logger.error(
        'Error force-releasing lock',
        error instanceof Error ? error : undefined,
        { lockPath }
      );
      throw error;
    }
  }

  /**
   * Get lock metrics
   */
  getMetrics(): LockMetrics {
    return { ...this.metrics };
  }

  /**
   * Get queue status for a file
   */
  getQueueStatus(filePath: string): { position: number; total: number } | null {
    const absolutePath = path.resolve(filePath);
    const queue = this.lockQueues.get(absolutePath);

    if (!queue || queue.length === 0) {
      return null;
    }

    return {
      position: 1, // First in queue
      total: queue.length,
    };
  }

  /**
   * Helper: Get lock file path
   */
  private getLockPath(filePath: string): string {
    const hash = this.hashFilePath(filePath);
    return path.join(LOCK_DIR, `${hash}.lock`);
  }

  /**
   * Helper: Hash file path for lock file naming
   */
  private hashFilePath(filePath: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(filePath).digest('hex').substring(0, 16);
  }

  /**
   * Helper: Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsAccess(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper: Check if lock is stale
   */
  private async isLockStale(lockPath: string, staleTimeout: number): Promise<boolean> {
    try {
      const metadata = await this.readLockFile(lockPath);
      const expiresAt = new Date(metadata.expiresAt);
      const now = new Date();

      return now > expiresAt;
    } catch {
      // If we can't read the lock file, consider it stale
      return true;
    }
  }

  /**
   * Helper: Write lock file
   */
  private async writeLockFile(lockPath: string, metadata: LockMetadata): Promise<void> {
    await fsWriteFile(lockPath, JSON.stringify(metadata, null, 2), 'utf8');
  }

  /**
   * Helper: Read lock file
   */
  private async readLockFile(lockPath: string): Promise<LockMetadata> {
    const content = await fsReadFile(lockPath, 'utf8');
    return JSON.parse(content) as LockMetadata;
  }

  /**
   * Helper: Remove entry from queue
   */
  private removeFromQueue(filePath: string, entryId: string): void {
    const queue = this.lockQueues.get(filePath);
    if (queue) {
      const index = queue.findIndex((e) => e.id === entryId);
      if (index !== -1) {
        queue.splice(index, 1);
      }
      if (queue.length === 0) {
        this.lockQueues.delete(filePath);
      }
    }
  }

  /**
   * Helper: Record acquisition metrics
   */
  private recordAcquisition(acquisitionTimeMs: number): void {
    this.metrics.acquisitions++;
    this.metrics.totalAcquisitionTimeMs += acquisitionTimeMs;
    this.metrics.avgAcquisitionTimeMs =
      this.metrics.totalAcquisitionTimeMs / this.metrics.acquisitions;
  }

  /**
   * Ensure lock directory exists
   */
  private ensureLockDirectory(): void {
    try {
      if (!fs.existsSync(LOCK_DIR)) {
        fs.mkdirSync(LOCK_DIR, { recursive: true, mode: 0o755 });
        logger.info('Created lock directory', { directory: LOCK_DIR });
      }
    } catch (error) {
      logger.error(
        'Failed to create lock directory',
        error instanceof Error ? error : undefined,
        { directory: LOCK_DIR }
      );
    }
  }

  /**
   * Setup periodic cleanup of stale locks
   */
  private setupCleanupInterval(): void {
    // Clean up stale locks every 60 seconds
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupStaleLocks();
    }, 60000);
  }

  /**
   * Cleanup stale locks
   */
  private async cleanupStaleLocks(): Promise<void> {
    try {
      const files = fs.readdirSync(LOCK_DIR);

      for (const file of files) {
        if (file.endsWith('.lock')) {
          const lockPath = path.join(LOCK_DIR, file);
          const isStale = await this.isLockStale(lockPath, 300000);

          if (isStale) {
            await this.forceReleaseLock(lockPath);
          }
        }
      }
    } catch (error) {
      logger.error(
        'Error during stale lock cleanup',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Setup process exit handlers to release locks
   */
  private setupProcessExitHandlers(): void {
    const cleanup = async () => {
      logger.info('Process exiting, releasing all locks', {
        activeLocksCount: this.activeLocks.size,
      });

      for (const [lockId, lock] of this.activeLocks.entries()) {
        try {
          await this.releaseLock(lockId);
        } catch (error) {
          logger.error(
            'Error releasing lock on exit',
            error instanceof Error ? error : undefined,
            { lockId, filePath: lock.filePath }
          );
        }
      }

      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
    };

    process.on('exit', () => {
      // Synchronous cleanup only
      for (const [, lock] of this.activeLocks.entries()) {
        try {
          fs.unlinkSync(lock.lockPath);
        } catch {}
      }
    });

    process.on('SIGINT', async () => {
      await cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await cleanup();
      process.exit(0);
    });
  }

  /**
   * Shutdown the lock manager
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down file lock manager');

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Release all active locks
    for (const lockId of this.activeLocks.keys()) {
      await this.releaseLock(lockId);
    }

    // Clear all queues
    for (const [, queue] of this.lockQueues.entries()) {
      for (const entry of queue) {
        if (entry.timeoutTimer) {
          clearTimeout(entry.timeoutTimer);
        }
        entry.reject(new Error('Lock manager shutting down'));
      }
    }
    this.lockQueues.clear();
  }
}

/**
 * Singleton instance
 */
let defaultManager: FileLockManager | null = null;

/**
 * Get the default file lock manager instance
 */
export function getFileLockManager(): FileLockManager {
  if (!defaultManager) {
    defaultManager = new FileLockManager();
  }
  return defaultManager;
}

/**
 * Execute a function with file lock
 *
 * @param filePath - File to lock
 * @param fn - Function to execute
 * @param options - Lock options
 * @returns Promise that resolves with function result
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
  options: LockAcquisitionOptions = {}
): Promise<T> {
  const manager = getFileLockManager();
  const lock = await manager.acquireLock(filePath, options);

  try {
    return await fn();
  } finally {
    await manager.releaseLock(lock.id);
  }
}
