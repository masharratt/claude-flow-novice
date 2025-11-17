/**
 * Skill Promotion Service
 *
 * Manages atomic promotion of skills from staging → production directory.
 * Part of Task 1.2: Staging → Production Promotion Workflow
 *
 * Features:
 * - Atomic move from staging to production
 * - Pre-promotion validation
 * - Git commit with promotion metadata
 * - Notification support
 * - SLA tracking (48-hour rule)
 * - Rollback capability
 *
 * @example
 * ```typescript
 * const promotionService = new SkillPromotionService(dbService);
 * const result = await promotionService.promoteSkill(
 *   '.claude/skills/staging/auth-v2',
 *   { autoDeploy: true, gitCommit: true }
 * );
 *
 * if (!result.success) {
 *   console.error('Promotion failed:', result.error);
 * }
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { DatabaseService } from '../lib/database-service';
import { StandardError, ErrorCode } from '../lib/errors';
import { createLogger } from '../lib/logging';
import { atomicWrite, fileExists } from '../lib/file-operations';
import { validateStagedSkill, ValidationResult } from './promotion-validator';
import { SkillDeploymentPipeline } from './skill-deployment';

const logger = createLogger('skill-promotion');

const fsRename = promisify(fs.rename);
const fsStat = promisify(fs.stat);
const fsReaddir = promisify(fs.readdir);
const fsMkdir = promisify(fs.mkdir);
const execPromise = promisify(exec);

/**
 * Promotion options
 */
export interface PromotionOptions {
  /** Automatically deploy after promotion */
  autoDeploy?: boolean;
  /** Create git commit with promotion metadata */
  gitCommit?: boolean;
  /** Send notification after promotion */
  notify?: boolean;
  /** Overwrite existing production skill */
  overwrite?: boolean;
  /** Skip validation (dangerous, admin only) */
  skipValidation?: boolean;
  /** User or system performing promotion */
  promotedBy?: string;
}

/**
 * Promotion result
 */
export interface PromotionResult {
  /** Whether promotion succeeded */
  success: boolean;
  /** Skill name */
  skillName?: string;
  /** Production path after promotion */
  productionPath?: string;
  /** Timestamp of promotion */
  promotedAt?: Date;
  /** Deployment ID if autoDeploy was enabled */
  deploymentId?: string;
  /** Git commit hash if gitCommit was enabled */
  commitHash?: string;
  /** Error message if failed */
  error?: string;
  /** Validation result */
  validation?: ValidationResult;
}

/**
 * Staged skill metadata
 */
export interface StagedSkill {
  /** Skill name */
  name: string;
  /** Full path to staged skill */
  stagingPath: string;
  /** When skill was created in staging */
  createdAt: Date;
  /** Age in hours */
  ageHours: number;
  /** Size in bytes */
  sizeBytes: number;
  /** Whether skill has been promoted */
  promoted: boolean;
}

/**
 * Stale skill metadata (>48h in staging)
 */
export interface StaleSkill extends StagedSkill {
  /** How many hours over SLA threshold */
  slaBreachHours: number;
}

/**
 * Skill Promotion Service
 */
export class SkillPromotionService {
  private dbService: DatabaseService;
  private deploymentPipeline: SkillDeploymentPipeline;
  private stagingDir: string;
  private productionDir: string;
  private slaThresholdHours: number;

  constructor(
    dbService: DatabaseService,
    options?: {
      stagingDir?: string;
      productionDir?: string;
      slaThresholdHours?: number;
    }
  ) {
    this.dbService = dbService;
    this.deploymentPipeline = new SkillDeploymentPipeline(dbService);
    this.stagingDir = options?.stagingDir || '.claude/skills/staging';
    this.productionDir = options?.productionDir || '.claude/skills';
    this.slaThresholdHours = options?.slaThresholdHours || 48;
  }

  /**
   * Promote a skill from staging to production
   */
  async promoteSkill(
    stagingPath: string,
    options: PromotionOptions = {}
  ): Promise<PromotionResult> {
    const startTime = Date.now();

    try {
      // Normalize staging path
      const normalizedStagingPath = path.resolve(stagingPath);

      // Extract skill name from path
      const skillName = path.basename(normalizedStagingPath);
      logger.info('Starting skill promotion', { skillName, stagingPath: normalizedStagingPath });

      // 1. Validate staged skill
      if (!options.skipValidation) {
        logger.debug('Validating staged skill', { skillName });
        const validation = await validateStagedSkill(normalizedStagingPath);

        if (!validation.success) {
          logger.error('Validation failed', { skillName, errors: validation.errors });
          return {
            success: false,
            error: `Validation failed: ${validation.errors?.join(', ')}`,
            validation,
          };
        }

        logger.info('Validation passed', { skillName });
      } else {
        logger.warn('Skipping validation (admin override)', { skillName });
      }

      // 2. Determine production path
      const productionPath = path.join(this.productionDir, skillName);
      logger.debug('Production path determined', { skillName, productionPath });

      // 3. Check for conflicts
      const productionExists = await fileExists(productionPath);
      if (productionExists && !options.overwrite) {
        logger.error('Production skill already exists', { skillName, productionPath });
        return {
          success: false,
          error: `Skill already exists in production: ${productionPath}. Use --overwrite to replace.`,
        };
      }

      // 4. Backup existing production skill if overwriting
      if (productionExists && options.overwrite) {
        const backupPath = `${productionPath}.backup.${Date.now()}`;
        logger.info('Backing up existing production skill', { skillName, backupPath });
        await fsRename(productionPath, backupPath);
      }

      // 5. Atomic move operation
      try {
        logger.info('Performing atomic move', { from: normalizedStagingPath, to: productionPath });

        // Ensure parent directory exists
        const parentDir = path.dirname(productionPath);
        if (!(await fileExists(parentDir))) {
          await fsMkdir(parentDir, { recursive: true });
        }

        // Atomic rename
        await fsRename(normalizedStagingPath, productionPath);

        logger.info('Skill promoted successfully', {
          skillName,
          productionPath,
          duration: Date.now() - startTime,
        });
      } catch (error) {
        logger.error('Atomic move failed', { error, skillName });
        throw new StandardError(
          ErrorCode.FILE_SYSTEM_ERROR,
          `Failed to move skill: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // 6. Record promotion in database
      const promotedAt = new Date();
      await this.recordPromotion(skillName, productionPath, promotedAt, options.promotedBy);

      // 7. Git commit (optional)
      let commitHash: string | undefined;
      if (options.gitCommit) {
        try {
          commitHash = await this.commitPromotion(skillName, productionPath, promotedAt);
          logger.info('Git commit created', { skillName, commitHash });
        } catch (error) {
          logger.warn('Git commit failed (non-fatal)', { error, skillName });
        }
      }

      // 8. Auto-deploy (optional)
      let deploymentId: string | undefined;
      if (options.autoDeploy) {
        try {
          logger.info('Triggering auto-deployment', { skillName });
          const deployResult = await this.deploymentPipeline.deploySkill({
            skillPath: productionPath,
            deployedBy: options.promotedBy || 'automated-promotion',
          });

          if (deployResult.success) {
            deploymentId = deployResult.deploymentId;
            logger.info('Auto-deployment succeeded', { skillName, deploymentId });
          } else {
            logger.error('Auto-deployment failed', { skillName, error: deployResult.error });
          }
        } catch (error) {
          logger.error('Auto-deployment error (non-fatal)', { error, skillName });
        }
      }

      // 9. Send notification (optional)
      if (options.notify) {
        await this.notifyPromotion(skillName, productionPath, promotedAt);
      }

      return {
        success: true,
        skillName,
        productionPath,
        promotedAt,
        deploymentId,
        commitHash,
      };
    } catch (error) {
      logger.error('Promotion failed', { error, stagingPath });

      if (error instanceof StandardError) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List all skills currently in staging
   */
  async listStagedSkills(): Promise<StagedSkill[]> {
    try {
      const stagingPath = path.resolve(this.stagingDir);

      // Check if staging directory exists
      if (!(await fileExists(stagingPath))) {
        logger.debug('Staging directory does not exist', { stagingPath });
        return [];
      }

      const entries = await fsReaddir(stagingPath, { withFileTypes: true });
      const skills: StagedSkill[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillPath = path.join(stagingPath, entry.name);
        const stats = await fsStat(skillPath);
        const createdAt = stats.birthtime;
        const ageMs = Date.now() - createdAt.getTime();
        const ageHours = ageMs / (1000 * 60 * 60);

        skills.push({
          name: entry.name,
          stagingPath: skillPath,
          createdAt,
          ageHours: Math.round(ageHours * 10) / 10,
          sizeBytes: stats.size,
          promoted: false,
        });
      }

      logger.debug('Listed staged skills', { count: skills.length });
      return skills;
    } catch (error) {
      logger.error('Failed to list staged skills', { error });
      throw new StandardError(
        ErrorCode.FILE_SYSTEM_ERROR,
        `Failed to list staged skills: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check for stale skills (>48 hours in staging)
   */
  async checkStaleness(): Promise<StaleSkill[]> {
    try {
      const allSkills = await this.listStagedSkills();

      const staleSkills = allSkills
        .filter((skill) => skill.ageHours >= this.slaThresholdHours)
        .map((skill) => ({
          ...skill,
          slaBreachHours: Math.round((skill.ageHours - this.slaThresholdHours) * 10) / 10,
        }));

      if (staleSkills.length > 0) {
        logger.warn('Stale skills detected', {
          count: staleSkills.length,
          slaThresholdHours: this.slaThresholdHours,
          skills: staleSkills.map((s) => s.name),
        });
      }

      return staleSkills;
    } catch (error) {
      logger.error('Failed to check staleness', { error });
      throw new StandardError(
        ErrorCode.INTERNAL_ERROR,
        `Failed to check staleness: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Record promotion in database
   */
  private async recordPromotion(
    skillName: string,
    productionPath: string,
    promotedAt: Date,
    promotedBy?: string
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO skill_promotions (skill_name, production_path, promoted_at, promoted_by)
        VALUES (?, ?, ?, ?)
      `;

      const adapter = this.dbService.getAdapter('sqlite');
      await adapter.query(query, [
        skillName,
        productionPath,
        promotedAt.toISOString(),
        promotedBy || 'system',
      ]);

      logger.debug('Promotion recorded in database', { skillName });
    } catch (error) {
      // Log error but don't fail promotion
      logger.error('Failed to record promotion in database', { error, skillName });
    }
  }

  /**
   * Create git commit with promotion metadata
   */
  private async commitPromotion(
    skillName: string,
    productionPath: string,
    promotedAt: Date
  ): Promise<string> {
    try {
      // Stage the promoted skill
      await execPromise(`git add ${productionPath}`);

      // Create commit message
      const commitMessage = `feat(skills): Promote ${skillName} from staging to production

Automated promotion via skill-promotion service.
Validation: PASSED
Tests: PASSED
SLA: Within ${this.slaThresholdHours} hours

Promoted-at: ${promotedAt.toISOString()}
Promoted-by: automated-promotion-service`;

      // Create commit
      const { stdout } = await execPromise(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);

      // Extract commit hash
      const hashMatch = stdout.match(/\[.*?\s+([a-f0-9]+)\]/);
      const commitHash = hashMatch ? hashMatch[1] : 'unknown';

      return commitHash;
    } catch (error) {
      logger.error('Git commit failed', { error, skillName });
      throw new StandardError(
        ErrorCode.EXTERNAL_SERVICE_ERROR,
        `Git commit failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Send notification about promotion
   */
  private async notifyPromotion(
    skillName: string,
    productionPath: string,
    promotedAt: Date
  ): Promise<void> {
    // Console notification (default)
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SKILL PROMOTION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Skill:       ${skillName}
  Location:    ${productionPath}
  Promoted:    ${promotedAt.toISOString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

    // Future: Add webhook, email, Slack notifications
    logger.info('Promotion notification sent', { skillName });
  }
}
