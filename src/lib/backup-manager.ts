/**
 * Unified Backup & Restore Manager
 *
 * Centralized backup and restore system for all critical file operations.
 * Part of Task 4.3: Unified Backup & Restore System
 *
 * Features:
 * - Multiple backup types (pre-edit, checkpoint, manual)
 * - SQLite metadata storage with queryability
 * - Restore operations (latest, by timestamp, by hash)
 * - Restore verification with hash comparison
 * - Dry-run mode for restore preview
 * - Automatic rollback on verification failure
 * - Rate limiting for restore operations
 * - Comprehensive audit trail
 * - Disk usage monitoring
 * - Automatic cleanup based on TTL
 * - Integration with FileLockManager
 *
 * Usage:
 *   const manager = new BackupManager();
 *   const backup = await manager.createBackup('/path/to/file.txt', {
 *     agentId: 'backend-dev-001',
 *     backupType: 'pre-edit'
 *   });
 *
 *   // Restore latest backup
 *   await manager.restoreLatest('/path/to/file.txt', {
 *     agentId: 'backend-dev-001',
 *     verify: true
 *   });
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { createLogger } from './logging';
import { createError, ErrorCode, StandardError } from './errors';
import { getFileLockManager, FileLockManager } from './file-lock-manager';

const logger = createLogger('backup-manager');

const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsCopyFile = promisify(fs.copyFile);
const fsStat = promisify(fs.stat);
const fsMkdir = promisify(fs.mkdir);
const fsAccess = promisify(fs.access);
const fsReaddir = promisify(fs.readdir);
const fsUnlink = promisify(fs.unlink);

/**
 * Backup type classification
 */
export enum BackupType {
  PRE_EDIT = 'pre-edit',
  CHECKPOINT = 'checkpoint',
  MANUAL = 'manual',
}

/**
 * Backup creation options
 */
export interface BackupOptions {
  /** Agent ID performing the backup */
  agentId: string;
  /** Backup type */
  backupType: BackupType;
  /** TTL in milliseconds (default: 24 hours) */
  ttlMs?: number;
  /** Additional metadata (JSON) */
  metadata?: Record<string, any>;
  /** Project root directory */
  projectRoot?: string;
}

/**
 * Restore operation options
 */
export interface RestoreOptions {
  /** Agent ID performing restore */
  agentId: string;
  /** Verify hash after restore (default: true) */
  verify?: boolean;
  /** Dry-run mode (preview only, default: false) */
  dryRun?: boolean;
  /** Force restore even if rate limit exceeded */
  force?: boolean;
  /** Create backup before restore (default: true) */
  createBackupBeforeRestore?: boolean;
}

/**
 * Backup metadata from database
 */
export interface BackupMetadata {
  id: string;
  agentId: string;
  filePath: string;
  backupPath: string;
  originalHash: string;
  backupHash: string;
  fileSize: number;
  backupSize?: number;
  backupType: BackupType;
  createdAt: string;
  expiresAt: string;
  isCompressed: boolean;
  compressedAt?: string;
  compressionRatio?: number;
  metadata?: string;
  deletedAt?: string;
}

/**
 * Backup instance
 */
export interface Backup {
  id: string;
  filePath: string;
  backupPath: string;
  agentId: string;
  backupType: BackupType;
  originalHash: string;
  backupHash: string;
  fileSize: number;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Restore result
 */
export interface RestoreResult {
  success: boolean;
  backupId: string;
  filePath: string;
  backupPath: string;
  verified: boolean;
  dryRun: boolean;
  restoredAt: Date;
  verificationHash?: string;
  expectedHash?: string;
  rollbackPerformed?: boolean;
  error?: string;
}

/**
 * Disk usage statistics
 */
export interface DiskUsageStats {
  totalBackups: number;
  activeBackups: number;
  expiredBackups: number;
  totalSizeBytes: number;
  compressedSizeBytes: number;
  averageCompressionRatio: number;
  oldestBackupDate: Date | null;
  newestBackupDate: Date | null;
  backupsByType: Record<BackupType, number>;
  backupsByAgent: Record<string, number>;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum restores per hour (default: 100) */
  maxRestoresPerHour: number;
}

/**
 * Backup Manager Configuration
 */
export interface BackupManagerConfig {
  /** Backup directory (default: .backups) */
  backupDir?: string;
  /** Database path (default: ./data/backups.db) */
  dbPath?: string;
  /** Default TTL in milliseconds (default: 24 hours) */
  defaultTtlMs?: number;
  /** Rate limit configuration */
  rateLimit?: RateLimitConfig;
  /** Project root directory */
  projectRoot?: string;
}

/**
 * Unified Backup & Restore Manager
 */
export class BackupManager {
  private db: Database.Database;
  private lockManager: FileLockManager;
  private backupDir: string;
  private defaultTtlMs: number;
  private rateLimitConfig: RateLimitConfig;
  private projectRoot: string;

  constructor(config: BackupManagerConfig = {}) {
    this.projectRoot = config.projectRoot || process.cwd();
    this.backupDir = config.backupDir || path.join(this.projectRoot, '.backups');
    this.defaultTtlMs = config.defaultTtlMs || 24 * 60 * 60 * 1000; // 24 hours
    this.rateLimitConfig = config.rateLimit || { maxRestoresPerHour: 100 };

    const dbPath =
      config.dbPath ||
      path.join(this.projectRoot, 'claude-assets/skills/cfn-redis-coordination/data/backups.db');

    // Initialize database
    this.db = this.initializeDatabase(dbPath);

    // Initialize file lock manager
    this.lockManager = getFileLockManager();

    // Ensure backup directory exists
    this.ensureBackupDirectory();

    logger.info('Backup manager initialized', {
      backupDir: this.backupDir,
      dbPath,
      defaultTtlMs: this.defaultTtlMs,
    });
  }

  /**
   * Create a backup of a file
   *
   * @param filePath - Path to file to backup
   * @param options - Backup options
   * @returns Backup instance
   */
  async createBackup(filePath: string, options: BackupOptions): Promise<Backup> {
    const startTime = Date.now();
    const absolutePath = path.resolve(filePath);

    logger.info('Creating backup', {
      filePath: absolutePath,
      agentId: options.agentId,
      backupType: options.backupType,
    });

    // Acquire file lock
    const lock = await this.lockManager.acquireLock(absolutePath, {
      agentId: options.agentId,
      timeout: 30000,
    });

    try {
      // Check if file exists
      const exists = await this.fileExists(absolutePath);

      if (!exists) {
        throw createError(
          ErrorCode.FILE_NOT_FOUND,
          `File does not exist: ${absolutePath}`,
          { filePath: absolutePath }
        );
      }

      // Read file and calculate hash
      const fileContent = await fsReadFile(absolutePath);
      const originalHash = this.calculateHash(fileContent);
      const fileSize = fileContent.length;

      // Create backup directory structure
      const timestamp = Date.now();
      const backupPath = this.getBackupPath(options.agentId, timestamp, originalHash);

      await this.ensureDirectory(path.dirname(backupPath));

      // Copy file to backup location
      await fsCopyFile(absolutePath, backupPath);

      // Verify backup
      const backupContent = await fsReadFile(backupPath);
      const backupHash = this.calculateHash(backupContent);

      if (originalHash !== backupHash) {
        // Cleanup failed backup
        await this.safeUnlink(backupPath);
        throw createError(
          ErrorCode.VALIDATION_FAILED,
          'Backup verification failed: hash mismatch',
          { originalHash, backupHash, filePath: absolutePath }
        );
      }

      // Calculate expiration
      const ttlMs = options.ttlMs || this.defaultTtlMs;
      const expiresAt = new Date(Date.now() + ttlMs);

      // Store metadata in database
      const backupId = randomUUID();
      const backup: Backup = {
        id: backupId,
        filePath: absolutePath,
        backupPath,
        agentId: options.agentId,
        backupType: options.backupType,
        originalHash,
        backupHash,
        fileSize,
        createdAt: new Date(),
        expiresAt,
        metadata: options.metadata,
      };

      this.insertBackup(backup);

      const duration = Date.now() - startTime;
      logger.info('Backup created successfully', {
        backupId,
        filePath: absolutePath,
        backupPath,
        fileSize,
        durationMs: duration,
      });

      return backup;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        'Backup creation failed',
        error instanceof Error ? error : undefined,
        { filePath: absolutePath, durationMs: duration }
      );

      // Log failed backup to audit trail
      this.logAuditEntry({
        backupId: null,
        operation: 'create',
        agentId: options.agentId,
        status: 'failure',
        filePath: absolutePath,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof StandardError ? error.code : ErrorCode.UNKNOWN_ERROR,
        durationMs: duration,
      });

      throw error;
    } finally {
      await this.lockManager.releaseLock(lock.id);
    }
  }

  /**
   * Restore the latest backup for a file
   *
   * @param filePath - Path to file to restore
   * @param options - Restore options
   * @returns Restore result
   */
  async restoreLatest(filePath: string, options: RestoreOptions): Promise<RestoreResult> {
    const absolutePath = path.resolve(filePath);
    const backup = this.getLatestBackup(absolutePath);

    if (!backup) {
      throw createError(ErrorCode.FILE_NOT_FOUND, `No backup found for: ${absolutePath}`, {
        filePath: absolutePath,
      });
    }

    return this.restoreBackup(backup.id, options);
  }

  /**
   * Restore backup by timestamp
   *
   * @param filePath - Path to file
   * @param timestamp - Backup timestamp
   * @param options - Restore options
   * @returns Restore result
   */
  async restoreByTimestamp(
    filePath: string,
    timestamp: Date,
    options: RestoreOptions
  ): Promise<RestoreResult> {
    const absolutePath = path.resolve(filePath);
    const backup = this.getBackupByTimestamp(absolutePath, timestamp);

    if (!backup) {
      throw createError(
        ErrorCode.FILE_NOT_FOUND,
        `No backup found for: ${absolutePath} at timestamp ${timestamp.toISOString()}`,
        { filePath: absolutePath, timestamp: timestamp.toISOString() }
      );
    }

    return this.restoreBackup(backup.id, options);
  }

  /**
   * Restore backup by hash
   *
   * @param filePath - Path to file
   * @param hash - File hash
   * @param options - Restore options
   * @returns Restore result
   */
  async restoreByHash(filePath: string, hash: string, options: RestoreOptions): Promise<RestoreResult> {
    const absolutePath = path.resolve(filePath);
    const backup = this.getBackupByHash(absolutePath, hash);

    if (!backup) {
      throw createError(
        ErrorCode.FILE_NOT_FOUND,
        `No backup found for: ${absolutePath} with hash ${hash}`,
        { filePath: absolutePath, hash }
      );
    }

    return this.restoreBackup(backup.id, options);
  }

  /**
   * Restore a specific backup by ID
   *
   * @param backupId - Backup ID
   * @param options - Restore options
   * @returns Restore result
   */
  async restoreBackup(backupId: string, options: RestoreOptions): Promise<RestoreResult> {
    const startTime = Date.now();
    const verify = options.verify !== false;
    const dryRun = options.dryRun || false;
    const force = options.force || false;
    const createBackupBeforeRestore = options.createBackupBeforeRestore !== false;

    logger.info('Restoring backup', {
      backupId,
      agentId: options.agentId,
      verify,
      dryRun,
    });

    // Get backup metadata
    const metadata = this.getBackupMetadata(backupId);

    if (!metadata) {
      throw createError(ErrorCode.FILE_NOT_FOUND, `Backup not found: ${backupId}`, {
        backupId,
      });
    }

    // Check rate limit
    if (!force && !dryRun) {
      const rateLimitOk = this.checkRateLimit(options.agentId);
      if (!rateLimitOk) {
        throw createError(
          ErrorCode.LOCK_TIMEOUT,
          'Restore rate limit exceeded',
          {
            agentId: options.agentId,
            maxRestoresPerHour: this.rateLimitConfig.maxRestoresPerHour,
          }
        );
      }
    }

    // Verify backup file exists
    const backupExists = await this.fileExists(metadata.backupPath);

    if (!backupExists) {
      throw createError(
        ErrorCode.FILE_NOT_FOUND,
        `Backup file not found: ${metadata.backupPath}`,
        { backupId, backupPath: metadata.backupPath }
      );
    }

    // Dry-run mode: just verify and return
    if (dryRun) {
      const backupContent = await fsReadFile(metadata.backupPath);
      const verificationHash = this.calculateHash(backupContent);

      return {
        success: true,
        backupId,
        filePath: metadata.filePath,
        backupPath: metadata.backupPath,
        verified: verificationHash === metadata.backupHash,
        dryRun: true,
        restoredAt: new Date(),
        verificationHash,
        expectedHash: metadata.backupHash,
      };
    }

    // Acquire file lock
    const lock = await this.lockManager.acquireLock(metadata.filePath, {
      agentId: options.agentId,
      timeout: 30000,
    });

    let rollbackBackupId: string | undefined;

    try {
      // Create backup of current file before restore
      if (createBackupBeforeRestore && (await this.fileExists(metadata.filePath))) {
        const rollbackBackup = await this.createBackup(metadata.filePath, {
          agentId: options.agentId,
          backupType: BackupType.PRE_EDIT,
          metadata: { reason: 'pre-restore-backup', restoringBackupId: backupId },
        });
        rollbackBackupId = rollbackBackup.id;
      }

      // Perform restore
      await fsCopyFile(metadata.backupPath, metadata.filePath);

      // Verify restore if requested
      let verified = false;
      let verificationHash: string | undefined;

      if (verify) {
        const restoredContent = await fsReadFile(metadata.filePath);
        verificationHash = this.calculateHash(restoredContent);
        verified = verificationHash === metadata.originalHash;

        if (!verified) {
          // Verification failed - rollback if we created a backup
          let rollbackPerformed = false;

          if (rollbackBackupId) {
            try {
              await this.restoreBackup(rollbackBackupId, {
                agentId: options.agentId,
                verify: false,
                dryRun: false,
                force: true,
                createBackupBeforeRestore: false,
              });
              rollbackPerformed = true;
            } catch (rollbackError) {
              logger.error(
                'Rollback failed after verification failure',
                rollbackError instanceof Error ? rollbackError : undefined,
                { backupId, rollbackBackupId }
              );
            }
          }

          throw createError(
            ErrorCode.VALIDATION_FAILED,
            'Restore verification failed: hash mismatch',
            {
              backupId,
              filePath: metadata.filePath,
              verificationHash,
              expectedHash: metadata.originalHash,
              rollbackPerformed,
            }
          );
        }
      }

      // Record restore in rate limit table
      this.recordRestore(backupId, options.agentId, metadata.filePath);

      // Log successful restore to audit trail
      const duration = Date.now() - startTime;
      this.logAuditEntry({
        backupId,
        operation: 'restore',
        agentId: options.agentId,
        status: 'success',
        filePath: metadata.filePath,
        backupPath: metadata.backupPath,
        durationMs: duration,
        metadata: { verified, rollbackBackupId },
      });

      logger.info('Restore completed successfully', {
        backupId,
        filePath: metadata.filePath,
        verified,
        durationMs: duration,
      });

      return {
        success: true,
        backupId,
        filePath: metadata.filePath,
        backupPath: metadata.backupPath,
        verified,
        dryRun: false,
        restoredAt: new Date(),
        verificationHash,
        expectedHash: metadata.originalHash,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        'Restore failed',
        error instanceof Error ? error : undefined,
        { backupId, filePath: metadata.filePath, durationMs: duration }
      );

      // Log failed restore to audit trail
      this.logAuditEntry({
        backupId,
        operation: 'restore',
        agentId: options.agentId,
        status: 'failure',
        filePath: metadata.filePath,
        backupPath: metadata.backupPath,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof StandardError ? error.code : ErrorCode.UNKNOWN_ERROR,
        durationMs: duration,
      });

      throw error;
    } finally {
      await this.lockManager.releaseLock(lock.id);
    }
  }

  /**
   * Get disk usage statistics
   */
  getDiskUsage(): DiskUsageStats {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_backups,
        SUM(CASE WHEN deleted_at IS NULL AND expires_at > datetime('now') THEN 1 ELSE 0 END) as active_backups,
        SUM(CASE WHEN deleted_at IS NULL AND expires_at <= datetime('now') THEN 1 ELSE 0 END) as expired_backups,
        SUM(file_size) as total_size_bytes,
        SUM(CASE WHEN is_compressed = 1 THEN file_size ELSE 0 END) as compressed_size_bytes,
        AVG(CASE WHEN is_compressed = 1 THEN compression_ratio ELSE NULL END) as avg_compression_ratio,
        MIN(created_at) as oldest_backup,
        MAX(created_at) as newest_backup
      FROM backups
      WHERE deleted_at IS NULL
    `);

    const result = stmt.get() as any;

    const byTypeStmt = this.db.prepare(`
      SELECT backup_type, COUNT(*) as count
      FROM backups
      WHERE deleted_at IS NULL
      GROUP BY backup_type
    `);

    const byType = byTypeStmt.all() as Array<{ backup_type: string; count: number }>;

    const byAgentStmt = this.db.prepare(`
      SELECT agent_id, COUNT(*) as count
      FROM backups
      WHERE deleted_at IS NULL
      GROUP BY agent_id
    `);

    const byAgent = byAgentStmt.all() as Array<{ agent_id: string; count: number }>;

    return {
      totalBackups: result.total_backups || 0,
      activeBackups: result.active_backups || 0,
      expiredBackups: result.expired_backups || 0,
      totalSizeBytes: result.total_size_bytes || 0,
      compressedSizeBytes: result.compressed_size_bytes || 0,
      averageCompressionRatio: result.avg_compression_ratio || 0,
      oldestBackupDate: result.oldest_backup ? new Date(result.oldest_backup) : null,
      newestBackupDate: result.newest_backup ? new Date(result.newest_backup) : null,
      backupsByType: byType.reduce(
        (acc, row) => {
          acc[row.backup_type as BackupType] = row.count;
          return acc;
        },
        {} as Record<BackupType, number>
      ),
      backupsByAgent: byAgent.reduce(
        (acc, row) => {
          acc[row.agent_id] = row.count;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }

  /**
   * List backups for a file
   */
  listBackups(filePath: string): BackupMetadata[] {
    const absolutePath = path.resolve(filePath);
    const stmt = this.db.prepare(`
      SELECT * FROM backups
      WHERE file_path = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `);

    return stmt.all(absolutePath) as BackupMetadata[];
  }

  /**
   * Delete expired backups
   */
  deleteExpiredBackups(): number {
    const expiredBackups = this.db
      .prepare(`
      SELECT id, backup_path FROM backups
      WHERE deleted_at IS NULL AND expires_at <= datetime('now')
    `)
      .all() as Array<{ id: string; backup_path: string }>;

    let deletedCount = 0;

    for (const backup of expiredBackups) {
      try {
        // Delete backup file
        fs.unlinkSync(backup.backup_path);

        // Mark as deleted in database
        this.db
          .prepare(`
          UPDATE backups SET deleted_at = datetime('now')
          WHERE id = ?
        `)
          .run(backup.id);

        deletedCount++;
      } catch (error) {
        logger.error(
          'Failed to delete expired backup',
          error instanceof Error ? error : undefined,
          { backupId: backup.id, backupPath: backup.backup_path }
        );
      }
    }

    logger.info('Expired backups deleted', { count: deletedCount });

    return deletedCount;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Backup manager closed');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private initializeDatabase(dbPath: string): Database.Database {
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new Database(dbPath);

    // Run migration
    const migrationPath = path.join(
      this.projectRoot,
      'src/db/migrations/004-backup-metadata-schema.sql'
    );

    if (fs.existsSync(migrationPath)) {
      const migration = fs.readFileSync(migrationPath, 'utf8');
      db.exec(migration);
      logger.info('Database migration applied', { migrationPath });
    }

    return db;
  }

  private ensureBackupDirectory(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true, mode: 0o755 });
      logger.info('Created backup directory', { directory: this.backupDir });
    }
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fsMkdir(dirPath, { recursive: true, mode: 0o755 });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private getBackupPath(agentId: string, timestamp: number, hash: string): string {
    return path.join(this.backupDir, agentId, `${timestamp}_${hash}`, 'original');
  }

  private calculateHash(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsAccess(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fsUnlink(filePath);
    } catch {
      // Ignore errors
    }
  }

  private insertBackup(backup: Backup): void {
    const stmt = this.db.prepare(`
      INSERT INTO backups (
        id, agent_id, file_path, backup_path, original_hash, backup_hash,
        file_size, backup_type, created_at, expires_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      backup.id,
      backup.agentId,
      backup.filePath,
      backup.backupPath,
      backup.originalHash,
      backup.backupHash,
      backup.fileSize,
      backup.backupType,
      backup.createdAt.toISOString(),
      backup.expiresAt.toISOString(),
      backup.metadata ? JSON.stringify(backup.metadata) : null
    );
  }

  private getBackupMetadata(backupId: string): BackupMetadata | null {
    const stmt = this.db.prepare(`
      SELECT * FROM backups WHERE id = ? AND deleted_at IS NULL
    `);

    return (stmt.get(backupId) as BackupMetadata) || null;
  }

  private getLatestBackup(filePath: string): BackupMetadata | null {
    const stmt = this.db.prepare(`
      SELECT * FROM backups
      WHERE file_path = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return (stmt.get(filePath) as BackupMetadata) || null;
  }

  private getBackupByTimestamp(filePath: string, timestamp: Date): BackupMetadata | null {
    const stmt = this.db.prepare(`
      SELECT * FROM backups
      WHERE file_path = ? AND deleted_at IS NULL AND created_at <= ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return (stmt.get(filePath, timestamp.toISOString()) as BackupMetadata) || null;
  }

  private getBackupByHash(filePath: string, hash: string): BackupMetadata | null {
    const stmt = this.db.prepare(`
      SELECT * FROM backups
      WHERE file_path = ? AND original_hash = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return (stmt.get(filePath, hash) as BackupMetadata) || null;
  }

  private checkRateLimit(agentId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM restore_rate_limits
      WHERE agent_id = ? AND restored_at > datetime('now', '-1 hour')
    `);

    const result = stmt.get(agentId) as { count: number };

    return result.count < this.rateLimitConfig.maxRestoresPerHour;
  }

  private recordRestore(backupId: string, agentId: string, filePath: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO restore_rate_limits (id, backup_id, agent_id, file_path, restored_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(randomUUID(), backupId, agentId, filePath);
  }

  private logAuditEntry(entry: {
    backupId: string | null;
    operation: string;
    agentId: string;
    status: string;
    filePath: string;
    backupPath?: string;
    errorMessage?: string;
    errorCode?: string;
    durationMs?: number;
    metadata?: Record<string, any>;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO backup_audit_log (
        id, backup_id, operation, agent_id, status, file_path, backup_path,
        timestamp, duration_ms, error_message, error_code, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)
    `);

    stmt.run(
      randomUUID(),
      entry.backupId,
      entry.operation,
      entry.agentId,
      entry.status,
      entry.filePath,
      entry.backupPath || null,
      entry.durationMs || null,
      entry.errorMessage || null,
      entry.errorCode || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    );
  }
}

/**
 * Singleton instance
 */
let defaultManager: BackupManager | null = null;

/**
 * Get the default backup manager instance
 */
export function getBackupManager(config?: BackupManagerConfig): BackupManager {
  if (!defaultManager) {
    defaultManager = new BackupManager(config);
  }
  return defaultManager;
}

/**
 * Execute a function with automatic backup
 *
 * @param filePath - File to backup
 * @param fn - Function to execute
 * @param options - Backup options
 * @returns Promise that resolves with function result
 */
export async function withBackup<T>(
  filePath: string,
  fn: () => Promise<T>,
  options: BackupOptions
): Promise<T> {
  const manager = getBackupManager();
  await manager.createBackup(filePath, options);

  return fn();
}
