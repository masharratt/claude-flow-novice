/**
 * File Operations Utilities
 *
 * Provides atomic file writes and file locking mechanisms for safe concurrent operations.
 * Part of Task 0.5: Implementation Tooling & Utilities (Foundation)
 *
 * Usage:
 *   await atomicWrite('/path/to/file.json', JSON.stringify(data));
 *   const lock = await acquireLock('/path/to/file.json');
 *   // ... perform operations ...
 *   await releaseLock(lock);
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { createError, ErrorCode, createTimeoutError } from './errors.js';
import { createLogger } from './logging.js';

const logger = createLogger('file-operations');

const fsWriteFile = promisify(fs.writeFile);
const fsReadFile = promisify(fs.readFile);
const fsRename = promisify(fs.rename);
const fsUnlink = promisify(fs.unlink);
const fsStat = promisify(fs.stat);
const fsMkdir = promisify(fs.mkdir);
const fsAccess = promisify(fs.access);

/**
 * File lock information
 */
export interface FileLock {
  /** Path to the file being locked */
  filePath: string;
  /** Path to the lock file */
  lockPath: string;
  /** When the lock was acquired */
  acquired: Date;
  /** Lock ID (unique identifier) */
  lockId: string;
  /** Process ID that acquired the lock */
  pid: number;
}

/**
 * Lock options
 */
export interface LockOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Retry interval in milliseconds (default: 100) */
  retryIntervalMs?: number;
  /** Stale lock timeout in milliseconds (default: 60000) */
  staleTimeoutMs?: number;
}

/**
 * Default lock options
 */
const DEFAULT_LOCK_OPTIONS: Required<LockOptions> = {
  timeoutMs: 30000, // 30 seconds
  retryIntervalMs: 100, // 100ms
  staleTimeoutMs: 60000, // 60 seconds
};

/**
 * Atomically write content to a file
 *
 * Pattern: Write to temp file → verify → move to target
 * This ensures that the file is never left in a partially written state.
 *
 * @param filePath - Target file path
 * @param content - Content to write
 * @param encoding - File encoding (default: 'utf8')
 * @returns Promise that resolves when write is complete
 * @throws FILE_WRITE_FAILED if write operation fails
 */
export async function atomicWrite(
  filePath: string,
  content: string,
  encoding: BufferEncoding = 'utf8'
): Promise<void> {
  const absolutePath = path.resolve(filePath);
  const dir = path.dirname(absolutePath);
  const tempPath = path.join(dir, `.${path.basename(absolutePath)}.${randomUUID()}.tmp`);

  try {
    // Ensure directory exists
    await ensureDirectory(dir);

    // Write to temporary file
    logger.debug('Writing to temporary file', { tempPath });
    await fsWriteFile(tempPath, content, encoding);

    // Verify write by reading back
    const written = await fsReadFile(tempPath, encoding);
    if (written !== content) {
      throw createError(
        ErrorCode.FILE_WRITE_FAILED,
        'Content verification failed after write',
        { filePath: absolutePath, tempPath }
      );
    }

    // Atomically move temp file to target
    logger.debug('Moving temp file to target', { tempPath, target: absolutePath });
    await fsRename(tempPath, absolutePath);

    logger.info('Atomic write completed', { filePath: absolutePath });
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fsUnlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    throw createError(
      ErrorCode.FILE_WRITE_FAILED,
      `Failed to write file: ${absolutePath}`,
      { filePath: absolutePath, tempPath },
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Acquire a lock on a file
 *
 * Creates a lock file with metadata about the lock holder.
 * Implements stale lock detection and automatic cleanup.
 *
 * @param filePath - File path to lock
 * @param options - Lock options
 * @returns FileLock object
 * @throws LOCK_TIMEOUT if lock cannot be acquired within timeout
 */
export async function acquireLock(
  filePath: string,
  options: LockOptions = {}
): Promise<FileLock> {
  const opts = { ...DEFAULT_LOCK_OPTIONS, ...options };
  const absolutePath = path.resolve(filePath);
  const lockPath = `${absolutePath}.lock`;
  const lockId = randomUUID();
  const startTime = Date.now();

  logger.debug('Acquiring lock', { filePath: absolutePath, lockId });

  while (Date.now() - startTime < opts.timeoutMs) {
    try {
      // Check if lock file exists
      const lockExists = await fileExists(lockPath);

      if (lockExists) {
        // Check if lock is stale
        const isStale = await isLockStale(lockPath, opts.staleTimeoutMs);

        if (isStale) {
          logger.warn('Removing stale lock', { lockPath });
          await fsUnlink(lockPath);
        } else {
          // Lock is held by another process, wait and retry
          await sleep(opts.retryIntervalMs);
          continue;
        }
      }

      // Attempt to create lock file
      const lockData: FileLock = {
        filePath: absolutePath,
        lockPath,
        acquired: new Date(),
        lockId,
        pid: process.pid,
      };

      // Write lock file atomically
      await atomicWrite(lockPath, JSON.stringify(lockData, null, 2));

      // Verify we actually acquired the lock (check for race condition)
      const verifyData = await fsReadFile(lockPath, 'utf8');
      const verifyLock = JSON.parse(verifyData) as FileLock;

      if (verifyLock.lockId !== lockId) {
        // Another process won the race
        logger.debug('Lost lock race', { lockId, winnerId: verifyLock.lockId });
        await sleep(opts.retryIntervalMs);
        continue;
      }

      logger.info('Lock acquired', { filePath: absolutePath, lockId });
      return lockData;
    } catch (error) {
      logger.error('Error acquiring lock', error instanceof Error ? error : undefined, {
        filePath: absolutePath,
        lockId,
      });
      throw createError(
        ErrorCode.LOCK_TIMEOUT,
        `Failed to acquire lock: ${absolutePath}`,
        { filePath: absolutePath, lockPath },
        error instanceof Error ? error : undefined
      );
    }
  }

  // Timeout reached
  throw createTimeoutError(`acquire lock on ${absolutePath}`, opts.timeoutMs);
}

/**
 * Release a file lock
 *
 * @param lock - FileLock object from acquireLock
 * @returns Promise that resolves when lock is released
 */
export async function releaseLock(lock: FileLock): Promise<void> {
  try {
    // Verify lock still exists and belongs to us
    const lockExists = await fileExists(lock.lockPath);

    if (!lockExists) {
      logger.warn('Lock file already removed', { lockPath: lock.lockPath });
      return;
    }

    const currentData = await fsReadFile(lock.lockPath, 'utf8');
    const currentLock = JSON.parse(currentData) as FileLock;

    if (currentLock.lockId !== lock.lockId) {
      logger.warn('Lock was taken by another process', {
        ourLockId: lock.lockId,
        currentLockId: currentLock.lockId,
      });
      return;
    }

    // Remove lock file
    await fsUnlink(lock.lockPath);
    logger.info('Lock released', { filePath: lock.filePath, lockId: lock.lockId });
  } catch (error) {
    logger.error('Error releasing lock', error instanceof Error ? error : undefined, {
      lockPath: lock.lockPath,
      lockId: lock.lockId,
    });
    throw createError(
      ErrorCode.FILE_WRITE_FAILED,
      `Failed to release lock: ${lock.lockPath}`,
      { lockPath: lock.lockPath, lockId: lock.lockId },
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Execute a function with a file lock
 *
 * @param filePath - File path to lock
 * @param fn - Function to execute while holding the lock
 * @param options - Lock options
 * @returns Result of the function
 */
export async function withLock<T>(
  filePath: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const lock = await acquireLock(filePath, options);

  try {
    return await fn();
  } finally {
    await releaseLock(lock);
  }
}

/**
 * Check if a lock is stale
 *
 * @param lockPath - Path to lock file
 * @param staleTimeoutMs - Stale timeout in milliseconds
 * @returns True if lock is stale
 */
async function isLockStale(lockPath: string, staleTimeoutMs: number): Promise<boolean> {
  try {
    const lockData = await fsReadFile(lockPath, 'utf8');
    const lock = JSON.parse(lockData) as FileLock;

    const acquiredTime = new Date(lock.acquired).getTime();
    const now = Date.now();
    const age = now - acquiredTime;

    return age > staleTimeoutMs;
  } catch {
    // If we can't read the lock file, consider it stale
    return true;
  }
}

/**
 * Check if a file exists
 *
 * @param filePath - File path to check
 * @returns True if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsAccess(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists, creating it if necessary
 *
 * @param dirPath - Directory path
 * @returns Promise that resolves when directory exists
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fsMkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Sleep for specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read file with automatic retry
 *
 * @param filePath - File path to read
 * @param encoding - File encoding (default: 'utf8')
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns File content
 */
export async function readFileWithRetry(
  filePath: string,
  encoding: BufferEncoding = 'utf8',
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fsReadFile(filePath, encoding);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        await sleep(100 * Math.pow(2, attempt)); // Exponential backoff
      }
    }
  }

  throw createError(
    ErrorCode.FILE_NOT_FOUND,
    `Failed to read file after ${maxRetries} attempts: ${filePath}`,
    { filePath, maxRetries },
    lastError
  );
}

/**
 * Write file with automatic retry
 *
 * @param filePath - File path to write
 * @param content - Content to write
 * @param encoding - File encoding (default: 'utf8')
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Promise that resolves when write is complete
 */
export async function writeFileWithRetry(
  filePath: string,
  content: string,
  encoding: BufferEncoding = 'utf8',
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await atomicWrite(filePath, content, encoding);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        await sleep(100 * Math.pow(2, attempt)); // Exponential backoff
      }
    }
  }

  throw createError(
    ErrorCode.FILE_WRITE_FAILED,
    `Failed to write file after ${maxRetries} attempts: ${filePath}`,
    { filePath, maxRetries },
    lastError
  );
}

/**
 * Copy file atomically
 *
 * @param sourcePath - Source file path
 * @param targetPath - Target file path
 * @returns Promise that resolves when copy is complete
 */
export async function atomicCopy(sourcePath: string, targetPath: string): Promise<void> {
  const content = await fsReadFile(sourcePath, 'utf8');
  await atomicWrite(targetPath, content);
  logger.info('Atomic copy completed', { source: sourcePath, target: targetPath });
}

/**
 * Move file atomically
 *
 * @param sourcePath - Source file path
 * @param targetPath - Target file path
 * @returns Promise that resolves when move is complete
 */
export async function atomicMove(sourcePath: string, targetPath: string): Promise<void> {
  const absoluteSource = path.resolve(sourcePath);
  const absoluteTarget = path.resolve(targetPath);

  try {
    await fsRename(absoluteSource, absoluteTarget);
    logger.info('Atomic move completed', { source: absoluteSource, target: absoluteTarget });
  } catch (error) {
    // If rename fails (e.g., cross-device), fall back to copy + delete
    await atomicCopy(absoluteSource, absoluteTarget);
    await fsUnlink(absoluteSource);
  }
}
