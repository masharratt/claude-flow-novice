/**
 * Atomic File Writer
 *
 * Provides atomic file write operations with SHA256 checksum verification,
 * rollback capability, and permission preservation.
 * Part of Task 4.2: Centralized File Locking & Atomic Operations
 *
 * Features:
 * - Write-then-move pattern (write to temp, verify, move to target)
 * - SHA256 checksum verification
 * - Automatic rollback on failure
 * - Preserve file permissions and ownership
 * - Backup creation before overwrite
 * - Integration with file lock manager
 *
 * Usage:
 *   const writer = new AtomicFileWriter();
 *   await writer.writeFile('/path/to/file.txt', content, {
 *     createBackup: true,
 *     preservePermissions: true
 *   });
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { createLogger } from './logging';
import { createError, ErrorCode } from './errors';
import { withFileLock, LockAcquisitionOptions } from './file-lock-manager';

const logger = createLogger('atomic-file-writer');

const fsWriteFile = promisify(fs.writeFile);
const fsReadFile = promisify(fs.readFile);
const fsRename = promisify(fs.rename);
const fsUnlink = promisify(fs.unlink);
const fsStat = promisify(fs.stat);
const fsMkdir = promisify(fs.mkdir);
const fsChmod = promisify(fs.chmod);
const fsChown = promisify(fs.chown);
const fsAccess = promisify(fs.access);
const fsCopyFile = promisify(fs.copyFile);

/**
 * File write options
 */
export interface WriteOptions {
  /** File encoding (default: 'utf8') */
  encoding?: BufferEncoding;
  /** Create backup before overwrite (default: false) */
  createBackup?: boolean;
  /** Preserve file permissions (default: true) */
  preservePermissions?: boolean;
  /** Preserve file ownership (default: false, requires sudo) */
  preserveOwnership?: boolean;
  /** Verify checksum after write (default: true) */
  verifyChecksum?: boolean;
  /** Lock file during write (default: true) */
  useLock?: boolean;
  /** Lock options (if useLock is true) */
  lockOptions?: LockAcquisitionOptions;
  /** Backup directory (default: same as target) */
  backupDir?: string;
}

/**
 * Write result with metadata
 */
export interface WriteResult {
  /** Success status */
  success: boolean;
  /** File path */
  filePath: string;
  /** SHA256 checksum of written content */
  checksum: string;
  /** Bytes written */
  bytesWritten: number;
  /** Write duration in milliseconds */
  durationMs: number;
  /** Backup path (if created) */
  backupPath?: string;
  /** Whether rollback occurred */
  rolledBack: boolean;
}

/**
 * File metadata for permission preservation
 */
interface FileMetadata {
  mode: number;
  uid: number;
  gid: number;
  exists: boolean;
}

/**
 * Atomic File Writer
 *
 * Provides safe atomic file writes with verification and rollback.
 */
export class AtomicFileWriter {
  /**
   * Write file atomically with verification
   *
   * @param filePath - Target file path
   * @param content - Content to write (string or Buffer)
   * @param options - Write options
   * @returns Promise<WriteResult> - Write result with metadata
   */
  async writeFile(
    filePath: string,
    content: string | Buffer,
    options: WriteOptions = {}
  ): Promise<WriteResult> {
    const startTime = Date.now();
    const absolutePath = path.resolve(filePath);

    const opts = {
      encoding: (options.encoding || 'utf8') as BufferEncoding,
      createBackup: options.createBackup || false,
      preservePermissions: options.preservePermissions !== false,
      preserveOwnership: options.preserveOwnership || false,
      verifyChecksum: options.verifyChecksum !== false,
      useLock: options.useLock !== false,
      lockOptions: options.lockOptions || {},
      backupDir: options.backupDir,
    };

    logger.debug('Starting atomic write', {
      filePath: absolutePath,
      contentLength: typeof content === 'string' ? content.length : content.length,
      options: opts,
    });

    // Calculate expected checksum
    const expectedChecksum = this.calculateChecksum(content);

    // Execute write with lock if requested
    if (opts.useLock) {
      return withFileLock(
        absolutePath,
        async () => this.performWrite(absolutePath, content, opts, expectedChecksum, startTime),
        opts.lockOptions
      );
    } else {
      return this.performWrite(absolutePath, content, opts, expectedChecksum, startTime);
    }
  }

  /**
   * Perform the actual write operation
   */
  private async performWrite(
    absolutePath: string,
    content: string | Buffer,
    options: Required<WriteOptions>,
    expectedChecksum: string,
    startTime: number
  ): Promise<WriteResult> {
    const dir = path.dirname(absolutePath);
    const tempPath = path.join(dir, `.${path.basename(absolutePath)}.${randomUUID()}.tmp`);
    let backupPath: string | undefined;
    let originalMetadata: FileMetadata | null = null;
    let rolledBack = false;

    try {
      // Ensure directory exists
      await this.ensureDirectory(dir);

      // Get original file metadata (if exists)
      originalMetadata = await this.getFileMetadata(absolutePath);

      // Create backup if requested and file exists
      if (options.createBackup && originalMetadata.exists) {
        backupPath = await this.createBackup(absolutePath, options.backupDir);
        logger.info('Backup created', { original: absolutePath, backup: backupPath });
      }

      // Write to temporary file
      logger.debug('Writing to temporary file', { tempPath });
      await fsWriteFile(tempPath, content, options.encoding);

      // Verify checksum
      if (options.verifyChecksum) {
        const actualChecksum = await this.calculateFileChecksum(tempPath);
        if (actualChecksum !== expectedChecksum) {
          throw createError(
            ErrorCode.CHECKSUM_MISMATCH,
            'Checksum verification failed after write',
            {
              expected: expectedChecksum,
              actual: actualChecksum,
              filePath: absolutePath,
            }
          );
        }
        logger.debug('Checksum verified', { checksum: actualChecksum });
      }

      // Preserve permissions if requested
      if (options.preservePermissions && originalMetadata.exists) {
        await fsChmod(tempPath, originalMetadata.mode);
        logger.debug('Permissions preserved', { mode: originalMetadata.mode.toString(8) });
      }

      // Preserve ownership if requested (requires privileges)
      if (options.preserveOwnership && originalMetadata.exists) {
        try {
          await fsChown(tempPath, originalMetadata.uid, originalMetadata.gid);
          logger.debug('Ownership preserved', {
            uid: originalMetadata.uid,
            gid: originalMetadata.gid,
          });
        } catch (error) {
          logger.warn(
            'Failed to preserve ownership (requires elevated privileges)',
            error instanceof Error ? error : undefined
          );
        }
      }

      // Atomic move to target location
      logger.debug('Moving to target location', { from: tempPath, to: absolutePath });
      await fsRename(tempPath, absolutePath);

      // Get final file size
      const stat = await fsStat(absolutePath);
      const bytesWritten = stat.size;

      const durationMs = Date.now() - startTime;

      logger.info('Atomic write completed successfully', {
        filePath: absolutePath,
        bytesWritten,
        checksum: expectedChecksum,
        durationMs,
      });

      return {
        success: true,
        filePath: absolutePath,
        checksum: expectedChecksum,
        bytesWritten,
        durationMs,
        backupPath,
        rolledBack: false,
      };
    } catch (error) {
      logger.error(
        'Atomic write failed, attempting rollback',
        error instanceof Error ? error : undefined,
        { filePath: absolutePath }
      );

      // Attempt rollback
      try {
        // Remove temp file if it exists
        if (await this.fileExists(tempPath)) {
          await fsUnlink(tempPath);
          logger.debug('Temporary file removed', { tempPath });
        }

        // Restore from backup if available
        if (backupPath && (await this.fileExists(backupPath))) {
          await fsCopyFile(backupPath, absolutePath);
          logger.info('Restored from backup after failed write', {
            backup: backupPath,
            target: absolutePath,
          });
          rolledBack = true;
        }
      } catch (rollbackError) {
        logger.error(
          'Rollback failed',
          rollbackError instanceof Error ? rollbackError : undefined,
          { filePath: absolutePath, backupPath }
        );
      }

      const durationMs = Date.now() - startTime;

      throw createError(
        ErrorCode.FILE_WRITE_FAILED,
        `Atomic write failed: ${absolutePath}`,
        {
          filePath: absolutePath,
          durationMs,
          backupPath,
          rolledBack,
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Calculate SHA256 checksum of content
   */
  private calculateChecksum(content: string | Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }

  /**
   * Calculate SHA256 checksum of file
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Get file metadata for permission preservation
   */
  private async getFileMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const stats = await fsStat(filePath);
      return {
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
        exists: true,
      };
    } catch (error) {
      // File doesn't exist
      return {
        mode: 0o644, // Default permissions
        uid: process.getuid ? process.getuid() : 0,
        gid: process.getgid ? process.getgid() : 0,
        exists: false,
      };
    }
  }

  /**
   * Create backup of existing file
   */
  private async createBackup(filePath: string, backupDir?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const basename = path.basename(filePath);
    const targetDir = backupDir || path.dirname(filePath);

    // Ensure backup directory exists
    await this.ensureDirectory(targetDir);

    const backupPath = path.join(targetDir, `${basename}.${timestamp}.backup`);

    try {
      await fsCopyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      throw createError(
        ErrorCode.BACKUP_FAILED,
        `Failed to create backup: ${filePath}`,
        { filePath, backupPath },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if file exists
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
   * Ensure directory exists
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
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
   * Read file atomically with checksum verification
   *
   * @param filePath - File to read
   * @param expectedChecksum - Optional expected checksum
   * @param encoding - File encoding (default: 'utf8')
   * @returns Promise<{content: string, checksum: string}> - File content and checksum
   */
  async readFile(
    filePath: string,
    expectedChecksum?: string,
    encoding: BufferEncoding = 'utf8'
  ): Promise<{ content: string; checksum: string }> {
    const absolutePath = path.resolve(filePath);

    try {
      const content = await fsReadFile(absolutePath, encoding);
      const checksum = this.calculateChecksum(content);

      if (expectedChecksum && checksum !== expectedChecksum) {
        throw createError(
          ErrorCode.CHECKSUM_MISMATCH,
          'Checksum verification failed during read',
          {
            expected: expectedChecksum,
            actual: checksum,
            filePath: absolutePath,
          }
        );
      }

      logger.debug('File read with checksum verification', {
        filePath: absolutePath,
        checksum,
        verified: !!expectedChecksum,
      });

      return { content, checksum };
    } catch (error) {
      throw createError(
        ErrorCode.FILE_READ_FAILED,
        `Failed to read file: ${absolutePath}`,
        { filePath: absolutePath },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Verify file checksum
   *
   * @param filePath - File to verify
   * @param expectedChecksum - Expected SHA256 checksum
   * @returns Promise<boolean> - True if checksum matches
   */
  async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    const absolutePath = path.resolve(filePath);

    try {
      const actualChecksum = await this.calculateFileChecksum(absolutePath);
      const matches = actualChecksum === expectedChecksum;

      logger.debug('Checksum verification', {
        filePath: absolutePath,
        expected: expectedChecksum,
        actual: actualChecksum,
        matches,
      });

      return matches;
    } catch (error) {
      logger.error(
        'Checksum verification failed',
        error instanceof Error ? error : undefined,
        { filePath: absolutePath }
      );
      return false;
    }
  }
}

/**
 * Singleton instance
 */
let defaultWriter: AtomicFileWriter | null = null;

/**
 * Get the default atomic file writer instance
 */
export function getAtomicFileWriter(): AtomicFileWriter {
  if (!defaultWriter) {
    defaultWriter = new AtomicFileWriter();
  }
  return defaultWriter;
}

/**
 * Helper function for atomic writes
 *
 * @param filePath - Target file path
 * @param content - Content to write
 * @param options - Write options
 * @returns Promise<WriteResult> - Write result
 */
export async function atomicWriteFile(
  filePath: string,
  content: string | Buffer,
  options: WriteOptions = {}
): Promise<WriteResult> {
  const writer = getAtomicFileWriter();
  return writer.writeFile(filePath, content, options);
}

/**
 * Helper function for atomic reads with checksum
 *
 * @param filePath - File to read
 * @param expectedChecksum - Optional expected checksum
 * @param encoding - File encoding
 * @returns Promise<{content: string, checksum: string}>
 */
export async function atomicReadFile(
  filePath: string,
  expectedChecksum?: string,
  encoding: BufferEncoding = 'utf8'
): Promise<{ content: string; checksum: string }> {
  const writer = getAtomicFileWriter();
  return writer.readFile(filePath, expectedChecksum, encoding);
}
