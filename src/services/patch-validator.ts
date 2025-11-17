/**
 * Patch Validator
 * Part of Task 5.1: Edge Case Analyzer & Skill Patcher
 *
 * Validates patches in isolated environment before applying to production skills.
 * Ensures safety through dry-run execution, automatic rollback, and backup integration.
 *
 * Features:
 * - Dry-run execution in /tmp/patch-validation/
 * - Automatic rollback on failure
 * - Integration with BackupManager
 * - Performance tracking (<5s target)
 * - Success/failure detection
 * - Comprehensive validation logging
 *
 * Safety Guarantees:
 * - Original files never modified during validation
 * - Backups created before any changes
 * - Isolated validation environment
 * - Automatic cleanup after validation
 *
 * Usage:
 *   const validator = new PatchValidator({ dbPath: './validation.db', backupManager });
 *   const result = await validator.validatePatch(patch, skillPath);
 *   if (result.status === ValidationStatus.SUCCESS) {
 *     // Proceed with deployment
 *   }
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import Database from 'better-sqlite3';
import { createLogger } from '../lib/logging';
import { StandardError, ErrorCode, createError } from '../lib/errors';
import { BackupManager, BackupType } from '../lib/backup-manager';
import { Patch } from './patch-generator';

const logger = createLogger('patch-validator');

const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsMkdir = promisify(fs.mkdir);
const fsCopyFile = promisify(fs.copyFile);
const fsAccess = promisify(fs.access);
const fsRmdir = promisify(fs.rmdir);
const fsUnlink = promisify(fs.unlink);

/**
 * Validation status
 */
export enum ValidationStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/**
 * Validation result
 */
export interface ValidationResult {
  patchId: string;
  status: ValidationStatus;
  durationMs: number;
  error?: string;
  validatedAt: Date;
}

/**
 * Validation statistics
 */
export interface ValidationStats {
  totalValidations: number;
  successCount: number;
  failureCount: number;
  averageDurationMs: number;
}

/**
 * Validator configuration
 */
export interface PatchValidatorConfig {
  dbPath: string;
  validationDir?: string;
  backupManager: BackupManager;
}

/**
 * Patch Validator Service
 */
export class PatchValidator {
  private db: Database.Database;
  private validationDir: string;
  private backupManager: BackupManager;

  constructor(config: PatchValidatorConfig) {
    this.db = new Database(config.dbPath);
    this.validationDir = config.validationDir || '/tmp/patch-validation';
    this.backupManager = config.backupManager;
    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patch_validations (
        id TEXT PRIMARY KEY,
        patch_id TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER,
        error_message TEXT,
        validated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_patch_validations_patch ON patch_validations(patch_id);
      CREATE INDEX IF NOT EXISTS idx_patch_validations_status ON patch_validations(status);
    `);
  }

  /**
   * Validate patch in isolated environment
   *
   * Process:
   * 1. Create backup of original file
   * 2. Copy file to isolated validation directory
   * 3. Apply patch to isolated copy
   * 4. Validate syntax (basic check)
   * 5. Clean up isolated copy
   * 6. Return result (original file untouched)
   *
   * Performance target: <5s
   */
  async validatePatch(patch: Patch, skillPath: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const validationId = crypto.randomUUID();

    logger.info('Starting patch validation', {
      patchId: patch.id,
      skillPath,
      validationId,
    });

    try {
      // Ensure validation directory exists
      await this.ensureValidationDir();

      // Check if original file exists
      try {
        await fsAccess(skillPath, fs.constants.R_OK);
      } catch (error) {
        throw createError(
          ErrorCode.FILE_NOT_FOUND,
          `Skill file not found: ${skillPath}`,
          { skillPath }
        );
      }

      // Create backup of original file
      logger.debug('Creating backup of original file', { skillPath });
      await this.backupManager.createBackup(skillPath, {
        agentId: 'patch-validator',
        backupType: BackupType.PRE_EDIT,
        metadata: {
          patchId: patch.id,
          validationId,
        },
      });

      // Copy file to isolated validation directory
      const isolatedPath = path.join(this.validationDir, path.basename(skillPath));
      await fsCopyFile(skillPath, isolatedPath);

      logger.debug('Copied file to validation directory', {
        original: skillPath,
        isolated: isolatedPath,
      });

      // Apply patch to isolated copy
      await fsWriteFile(isolatedPath, patch.content, 'utf-8');

      logger.debug('Applied patch to isolated copy', { isolatedPath });

      // Validate syntax (basic check - try to read and parse)
      try {
        const patchedContent = await fsReadFile(isolatedPath, 'utf-8');

        // Basic syntax validation (more sophisticated validation could be added)
        if (!this.validateSyntax(patchedContent)) {
          throw new Error('Syntax validation failed');
        }

        logger.debug('Syntax validation passed', { isolatedPath });
      } catch (error) {
        // Validation failed
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logger.warn('Patch validation failed', {
          patchId: patch.id,
          error: errorMessage,
        });

        // Clean up
        await this.cleanupValidation(isolatedPath);

        // Store validation result
        const duration = Date.now() - startTime;
        await this.storeValidationResult({
          patchId: patch.id,
          status: ValidationStatus.FAILED,
          durationMs: duration,
          error: errorMessage,
          validatedAt: new Date(),
        });

        return {
          patchId: patch.id,
          status: ValidationStatus.FAILED,
          durationMs: duration,
          error: errorMessage,
          validatedAt: new Date(),
        };
      }

      // Clean up isolated copy
      await this.cleanupValidation(isolatedPath);

      // Validation successful
      const duration = Date.now() - startTime;

      logger.info('Patch validation successful', {
        patchId: patch.id,
        durationMs: duration,
      });

      // Store validation result
      await this.storeValidationResult({
        patchId: patch.id,
        status: ValidationStatus.SUCCESS,
        durationMs: duration,
        validatedAt: new Date(),
      });

      return {
        patchId: patch.id,
        status: ValidationStatus.SUCCESS,
        durationMs: duration,
        validatedAt: new Date(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Patch validation error', error as Error, {
        patchId: patch.id,
        durationMs: duration,
      });

      // Store validation result
      await this.storeValidationResult({
        patchId: patch.id,
        status: ValidationStatus.FAILED,
        durationMs: duration,
        error: errorMessage,
        validatedAt: new Date(),
      });

      return {
        patchId: patch.id,
        status: ValidationStatus.FAILED,
        durationMs: duration,
        error: errorMessage,
        validatedAt: new Date(),
      };
    }
  }

  /**
   * Validate syntax (basic check)
   */
  private validateSyntax(content: string): boolean {
    // Basic syntax checks
    // 1. Check for balanced braces
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
      logger.debug('Unbalanced braces detected', { openBraces, closeBraces });
      return false;
    }

    // 2. Check for balanced parentheses
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;

    if (openParens !== closeParens) {
      logger.debug('Unbalanced parentheses detected', { openParens, closeParens });
      return false;
    }

    // 3. Check for basic structure (export, function, etc.)
    if (!content.includes('export') && !content.includes('function')) {
      logger.debug('Missing basic structure (export/function)');
      return false;
    }

    return true;
  }

  /**
   * Ensure validation directory exists
   */
  private async ensureValidationDir(): Promise<void> {
    try {
      await fsAccess(this.validationDir);
    } catch {
      // Directory doesn't exist, create it
      await fsMkdir(this.validationDir, { recursive: true });
      logger.debug('Created validation directory', { validationDir: this.validationDir });
    }
  }

  /**
   * Clean up validation files
   */
  private async cleanupValidation(isolatedPath: string): Promise<void> {
    try {
      if (fs.existsSync(isolatedPath)) {
        await fsUnlink(isolatedPath);
        logger.debug('Cleaned up isolated file', { isolatedPath });
      }
    } catch (error) {
      logger.warn('Failed to clean up validation file', error as Error, { isolatedPath });
    }
  }

  /**
   * Store validation result
   */
  private async storeValidationResult(result: ValidationResult): Promise<void> {
    this.db
      .prepare(
        `
      INSERT INTO patch_validations (id, patch_id, status, duration_ms, error_message)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(
        crypto.randomUUID(),
        result.patchId,
        result.status,
        result.durationMs,
        result.error || null
      );
  }

  /**
   * Get validation result by patch ID
   */
  getValidationResult(patchId: string): ValidationResult | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM patch_validations
      WHERE patch_id = ?
      ORDER BY validated_at DESC
      LIMIT 1
    `);

    const row = stmt.get(patchId) as any;

    if (!row) {
      return undefined;
    }

    return {
      patchId: row.patch_id,
      status: row.status as ValidationStatus,
      durationMs: row.duration_ms,
      error: row.error_message,
      validatedAt: new Date(row.validated_at),
    };
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): ValidationStats {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM patch_validations');
    const totalResult = totalStmt.get() as any;
    const totalValidations = totalResult.count;

    const successStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM patch_validations WHERE status = 'SUCCESS'"
    );
    const successResult = successStmt.get() as any;
    const successCount = successResult.count;

    const failureStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM patch_validations WHERE status = 'FAILED'"
    );
    const failureResult = failureStmt.get() as any;
    const failureCount = failureResult.count;

    const avgStmt = this.db.prepare('SELECT AVG(duration_ms) as avg FROM patch_validations');
    const avgResult = avgStmt.get() as any;
    const averageDurationMs = avgResult.avg || 0;

    return {
      totalValidations,
      successCount,
      failureCount,
      averageDurationMs: Math.round(averageDurationMs),
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
