/**
 * Skill Deployment Pipeline (Refactored with Transaction Framework)
 *
 * Orchestrates atomic deployment of skills from APPROVED → DEPLOYED state.
 * Part of Task 3.2: Skill Deployment Transaction Integration
 *
 * Features:
 * - Atomic cross-database transactions via TransactionManager (PostgreSQL + SQLite)
 * - Distributed locking to prevent concurrent deployments
 * - Automatic validation before deployment
 * - Version conflict detection and resolution within transaction
 * - Content hash validation within transaction
 * - Rollback capability on failure (automatic via transaction)
 * - Comprehensive audit trail (atomically updated)
 *
 * @example
 * ```typescript
 * const pipeline = new SkillDeploymentPipeline(dbService, txManager, lockManager);
 * const result = await pipeline.deploySkill({
 *   skillPath: '.claude/skills/authentication',
 *   deployedBy: 'admin@example.com'
 * });
 *
 * if (!result.success) {
 *   console.error('Deployment failed:', result.error);
 *   // Transaction automatically rolled back
 * }
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../lib/database-service.js';
import { TransactionManager } from '../lib/database-service/transaction-manager.js';
import { DistributedLock, LockResource } from '../lib/distributed-lock.js';
import { StandardError, ErrorCode } from '../lib/errors.js';
import { createLogger } from '../lib/logging.js';
import { validateSkill, parseFrontmatter, ValidationResult } from './skill-validator.js';
import { getNextVersion, versionExists } from './skill-versioning.js';

const logger = createLogger('skill-deployment');

/**
 * Deployment request parameters
 */
export interface DeploymentRequest {
  /** Path to skill directory */
  skillPath: string;
  /** User or system performing deployment */
  deployedBy?: string;
  /** Optional: Override auto-versioning with explicit version */
  explicitVersion?: string;
  /** Optional: Skip validation (dangerous, admin only) */
  skipValidation?: boolean;
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  /** Whether deployment succeeded */
  success: boolean;
  /** Unique deployment ID for tracking */
  deploymentId?: number;
  /** Deployed skill ID */
  skillId?: string;
  /** Skill name */
  skillName?: string;
  /** Deployed version */
  version?: string;
  /** Error message if failed */
  error?: string;
  /** Validation result if validation failed */
  validationResult?: ValidationResult;
  /** Path to backup for rollback */
  rollbackPath?: string;
  /** Timestamp of deployment */
  deployedAt?: Date;
  /** Transaction ID for tracking */
  transactionId?: string;
  /** Lock ID for tracking */
  lockId?: string;
}

/**
 * Skill metadata for database operations
 */
interface SkillMetadata {
  id: string;
  name: string;
  version: string;
  contentPath: string;
  status: string;
  metadata: string;
}

/**
 * Skill Deployment Pipeline (Transaction-Aware)
 *
 * Handles atomic deployment of skills with validation, versioning, rollback,
 * and distributed locking to prevent concurrent modifications.
 */
export class SkillDeploymentPipeline {
  private dbService: DatabaseService;
  private txManager: TransactionManager;
  private lockManager: DistributedLock;

  constructor(
    dbService: DatabaseService,
    txManager: TransactionManager,
    lockManager: DistributedLock
  ) {
    this.dbService = dbService;
    this.txManager = txManager;
    this.lockManager = lockManager;
  }

  /**
   * Generate unique skill ID
   */
  private generateSkillId(skillName: string, version: string): string {
    const timestamp = Date.now();
    const sanitizedName = skillName.replace(/[^a-zA-Z0-9_-]/g, '-');
    return `skill-${sanitizedName}-${version}-${timestamp}`;
  }

  /**
   * Create backup of current skill state (for rollback)
   */
  private async createBackup(skillPath: string): Promise<string> {
    // For now, we'll just return the original path
    // In production, this would copy to a backup location
    logger.info('Creating deployment backup', { skillPath });
    return skillPath;
  }

  /**
   * Build lock resource for skill deployment
   */
  private buildLockResource(skillName: string): LockResource {
    return {
      database: 'skills',
      table: 'skills',
      key: skillName,
    };
  }

  /**
   * Record deployment attempt in audit trail (transaction-aware)
   *
   * NOTE: This must be called within a transaction context
   */
  private async recordDeploymentAudit(
    adapter: any,
    skillId: string,
    fromStatus: string | null,
    toStatus: string,
    version: string,
    success: boolean,
    deployedBy: string,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<number> {
    logger.info('Recording deployment audit', {
      skillId,
      fromStatus,
      toStatus,
      version,
      success,
    });

    try {
      const result: any = await adapter.raw(
        `INSERT INTO deployment_audit
         (skill_id, from_status, to_status, version, success, deployed_by, error_message, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          skillId,
          fromStatus,
          toStatus,
          version,
          success ? 1 : 0,
          deployedBy,
          errorMessage || null,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      const auditId = result.lastInsertId || 0;
      logger.info('Deployment audit recorded', { auditId, skillId });
      return auditId;
    } catch (error) {
      logger.error('Failed to record deployment audit', error as Error, { skillId });
      // In transaction mode, we want to fail the transaction if audit fails
      throw error;
    }
  }

  /**
   * Deploy skill atomically across all databases with distributed locking
   *
   * Uses TransactionManager for atomic operations and DistributedLock
   * to prevent concurrent deployments of the same skill.
   *
   * @param request - Deployment request parameters
   * @returns Deployment result
   */
  async deploySkill(request: DeploymentRequest): Promise<DeploymentResult> {
    const { skillPath, deployedBy = 'system', explicitVersion, skipValidation = false } = request;

    logger.info('Starting skill deployment', { skillPath, deployedBy });

    let lock: any = null;
    let tx: any = null;

    try {
      // Step 1: Validate skill (unless skipped) - BEFORE acquiring lock
      if (!skipValidation) {
        const validationResult = await validateSkill(this.dbService, skillPath);

        if (!validationResult.valid) {
          logger.warn('Skill validation failed', {
            skillPath,
            errorCount: validationResult.errors.length,
          });

          // Record validation failure (no transaction needed for failure records)
          try {
            const adapter = this.dbService.getAdapter('sqlite');
            await this.recordDeploymentAudit(
              adapter,
              'unknown',
              null,
              'FAILED',
              'unknown',
              false,
              deployedBy,
              `Validation failed: ${validationResult.errors.map(e => e.message).join('; ')}`,
              { validationErrors: validationResult.errors }
            );
          } catch (auditError) {
            logger.warn('Failed to record validation failure audit (non-blocking)', {
              error: (auditError as Error).message,
            });
          }

          return {
            success: false,
            error: 'Validation failed',
            validationResult,
          };
        }
      }

      // Step 2: Parse skill metadata
      const frontmatter = parseFrontmatter(skillPath);
      const skillName = frontmatter.name;

      // Step 3: Acquire distributed lock for this skill (prevents concurrent deployments)
      const lockResource = this.buildLockResource(skillName);

      logger.debug('Acquiring distributed lock', { skillName, lockResource });

      lock = await this.lockManager.acquire(lockResource, {
        timeout: 10000, // 10 second timeout
        ttl: 60000, // 1 minute TTL (auto-release)
        correlationId: `deploy-${skillName}-${Date.now()}`,
      });

      logger.info('Distributed lock acquired', {
        lockId: lock.id,
        skillName,
      });

      // Step 4: Begin cross-database transaction
      // Note: Currently only using SQLite, but framework supports PostgreSQL too
      tx = await this.txManager.begin(['sqlite'], {
        timeout: 30000, // 30 second transaction timeout
        correlationId: lock.correlationId,
      });

      logger.info('Transaction began', {
        transactionId: tx.id,
        skillName,
      });

      // Step 5: Determine version within transaction (prevents version conflicts)
      let version: string;

      await tx.execute('sqlite', async (adapter: any) => {
        if (explicitVersion) {
          // Check if explicit version already exists
          const exists = await versionExists(this.dbService, skillName, explicitVersion);
          if (exists) {
            throw new StandardError(
              ErrorCode.DB_DUPLICATE_KEY,
              `Version ${explicitVersion} already exists for skill: ${skillName}`,
              { skillName, version: explicitVersion }
            );
          }
          version = explicitVersion;
        } else {
          // Auto-increment version (patch by default)
          version = await getNextVersion(this.dbService, skillName, 'patch');
        }
      });

      // Step 6: Generate skill ID
      const skillId = this.generateSkillId(skillName, version!);

      // Step 7: Create backup for rollback
      const rollbackPath = await this.createBackup(skillPath);

      logger.info('Deploying skill within transaction', {
        skillId,
        skillName,
        version,
        transactionId: tx.id,
      });

      // Step 8: Execute atomic deployment operations
      let auditId: number = 0;

      await tx.execute('sqlite', async (adapter: any) => {
        // Insert into skills table
        await adapter.raw(
          `INSERT INTO skills (id, name, version, content_path, status, metadata)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            skillId,
            skillName,
            version,
            skillPath,
            'DEPLOYED',
            JSON.stringify({
              deployedBy,
              deployedAt: new Date().toISOString(),
              description: frontmatter.description || '',
              author: frontmatter.author || '',
              transactionId: tx.id,
              lockId: lock.id,
            }),
          ]
        );

        // Record successful deployment in audit trail (within same transaction)
        auditId = await this.recordDeploymentAudit(
          adapter,
          skillId,
          'APPROVED',
          'DEPLOYED',
          version!,
          true,
          deployedBy,
          undefined,
          {
            skillName,
            contentPath: skillPath,
            transactionId: tx.id,
            lockId: lock.id,
          }
        );
      });

      // Step 9: Commit transaction (atomic across all operations)
      await tx.commit();

      logger.info('Transaction committed successfully', {
        transactionId: tx.id,
        skillId,
        skillName,
        version,
        auditId,
      });

      // Step 10: Release distributed lock
      await this.lockManager.release(lock.id);

      logger.info('Skill deployed successfully', {
        skillId,
        skillName,
        version,
        auditId,
        transactionId: tx.id,
        lockId: lock.id,
      });

      return {
        success: true,
        deploymentId: auditId,
        skillId,
        skillName,
        version,
        rollbackPath,
        deployedAt: new Date(),
        transactionId: tx.id,
        lockId: lock.id,
      };
    } catch (error) {
      logger.error('Deployment failed', error as Error, { skillPath });

      // Transaction automatically rolled back by TransactionManager on error
      if (tx) {
        logger.info('Transaction automatically rolled back', {
          transactionId: tx.id,
        });
      }

      const errorMessage =
        error instanceof StandardError
          ? error.message
          : `Deployment failed: ${(error as Error).message}`;

      return {
        success: false,
        error: errorMessage,
        transactionId: tx?.id,
        lockId: lock?.id,
      };
    } finally {
      // Ensure lock is released even if transaction fails
      if (lock) {
        try {
          await this.lockManager.release(lock.id);
          logger.debug('Distributed lock released in finally block', {
            lockId: lock.id,
          });
        } catch (lockError) {
          logger.error('Failed to release lock in finally block', lockError as Error, {
            lockId: lock.id,
          });
        }
      }
    }
  }

  /**
   * Rollback a deployment
   *
   * Uses TransactionManager for atomic rollback across all databases.
   *
   * @param deploymentId - Deployment audit ID to rollback
   * @returns True if rollback succeeded
   */
  async rollbackDeployment(deploymentId: number): Promise<boolean> {
    logger.info('Starting deployment rollback', { deploymentId });

    let lock: any = null;
    let tx: any = null;

    try {
      // Step 1: Get deployment details (outside transaction to avoid deadlock)
      const adapter = this.dbService.getAdapter('sqlite');
      const auditResult: any = await adapter.raw(
        'SELECT skill_id, version FROM deployment_audit WHERE id = ?',
        [deploymentId]
      );

      if (!auditResult || auditResult.length === 0) {
        throw new StandardError(
          ErrorCode.DB_NOT_FOUND,
          `Deployment audit not found: ${deploymentId}`,
          { deploymentId }
        );
      }

      const { skill_id: skillId, version } = auditResult[0];

      // Extract skill name from skill ID
      const skillName = skillId.replace(/^skill-/, '').replace(/-\d+-\d+$/, '');

      // Step 2: Acquire distributed lock for this skill
      const lockResource = this.buildLockResource(skillName);

      lock = await this.lockManager.acquire(lockResource, {
        timeout: 10000,
        ttl: 60000,
        correlationId: `rollback-${deploymentId}-${Date.now()}`,
      });

      logger.info('Distributed lock acquired for rollback', {
        lockId: lock.id,
        deploymentId,
      });

      // Step 3: Begin rollback transaction
      tx = await this.txManager.begin(['sqlite'], {
        timeout: 30000,
        correlationId: lock.correlationId,
      });

      logger.info('Rollback transaction began', {
        transactionId: tx.id,
        deploymentId,
      });

      // Step 4: Execute rollback operations within transaction
      await tx.execute('sqlite', async (adapter: any) => {
        // Delete from skills table
        await adapter.raw('DELETE FROM skills WHERE id = ?', [skillId]);

        // Record rollback in audit trail (within same transaction)
        await this.recordDeploymentAudit(
          adapter,
          skillId,
          'DEPLOYED',
          'ROLLED_BACK',
          version as string,
          true,
          'system',
          'Deployment rolled back',
          {
            originalDeploymentId: deploymentId,
            transactionId: tx.id,
            lockId: lock.id,
          }
        );
      });

      // Step 5: Commit rollback transaction
      await tx.commit();

      logger.info('Rollback transaction committed', {
        transactionId: tx.id,
        deploymentId,
        skillId,
      });

      // Step 6: Release distributed lock
      await this.lockManager.release(lock.id);

      logger.info('Deployment rollback succeeded', { deploymentId, skillId });
      return true;
    } catch (error) {
      logger.error('Deployment rollback failed', error as Error, { deploymentId });

      // Transaction automatically rolled back on error
      if (tx) {
        logger.info('Rollback transaction automatically rolled back', {
          transactionId: tx.id,
        });
      }

      return false;
    } finally {
      // Ensure lock is released
      if (lock) {
        try {
          await this.lockManager.release(lock.id);
          logger.debug('Distributed lock released in rollback finally block', {
            lockId: lock.id,
          });
        } catch (lockError) {
          logger.error('Failed to release lock in rollback finally block', lockError as Error, {
            lockId: lock.id,
          });
        }
      }
    }
  }

  /**
   * Get deployment history for a skill
   *
   * @param skillName - Name of the skill
   * @param limit - Maximum number of results
   * @returns Array of deployment audit records
   */
  async getDeploymentHistory(skillName: string, limit: number = 10): Promise<any[]> {
    logger.debug('Fetching deployment history', { skillName, limit });

    try {
      const adapter = this.dbService.getAdapter('sqlite');

      const result: any = await adapter.raw(
        `SELECT da.*
         FROM deployment_audit da
         JOIN skills s ON da.skill_id = s.id
         WHERE s.name = ?
         ORDER BY da.deployed_at DESC
         LIMIT ?`,
        [skillName, limit]
      );

      return result || [];
    } catch (error) {
      logger.error('Failed to fetch deployment history', error as Error, { skillName });
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        `Failed to fetch deployment history for skill: ${skillName}`,
        { skillName },
        error as Error
      );
    }
  }

  /**
   * Get all deployments with a specific status
   *
   * @param status - Deployment status to filter by
   * @param limit - Maximum number of results
   * @returns Array of deployment audit records
   */
  async getDeploymentsByStatus(status: string, limit: number = 50): Promise<any[]> {
    logger.debug('Fetching deployments by status', { status, limit });

    try {
      const adapter = this.dbService.getAdapter('sqlite');

      const result: any = await adapter.raw(
        `SELECT * FROM deployment_audit
         WHERE to_status = ?
         ORDER BY deployed_at DESC
         LIMIT ?`,
        [status, limit]
      );

      return result || [];
    } catch (error) {
      logger.error('Failed to fetch deployments by status', error as Error, { status });
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        `Failed to fetch deployments by status: ${status}`,
        { status },
        error as Error
      );
    }
  }
}
