/**
 * Promotion SLA Enforcer
 *
 * Background job to enforce 48-hour SLA for skill promotion.
 * Checks for stale skills in staging and auto-promotes or notifies based on config.
 * Part of Task 1.2: Staging → Production Promotion Workflow
 *
 * Features:
 * - Detects skills >48h in staging
 * - Auto-promotes stale skills (optional)
 * - Sends notifications for SLA breaches
 * - Cron-job compatible
 * - Monitoring dashboard data
 *
 * @example
 * ```typescript
 * // Run as cron job
 * const enforcer = new PromotionSLAEnforcer(dbService, {
 *   autoPromote: true,
 *   notifyStale: true,
 * });
 *
 * await enforcer.enforceSLA();
 * ```
 *
 * @example
 * ```bash
 * # Cron job (daily at 9am)
 * 0 9 * * * cd /path/to/project && npx ts-node src/jobs/promotion-sla-enforcer.ts
 * ```
 */

import { DatabaseService } from '../lib/database-service';
import { createLogger } from '../lib/logging';
import { SkillPromotionService, StaleSkill } from '../services/skill-promotion';

const logger = createLogger('promotion-sla-enforcer');

/**
 * SLA enforcer configuration
 */
export interface SLAEnforcerConfig {
  /** Automatically promote stale skills */
  autoPromote?: boolean;
  /** Send notifications for stale skills */
  notifyStale?: boolean;
  /** SLA threshold in hours (default: 48) */
  slaThresholdHours?: number;
  /** Dry run mode (don't actually promote) */
  dryRun?: boolean;
  /** Enable git commits for auto-promotions */
  enableGitCommit?: boolean;
  /** Enable auto-deployment for promotions */
  enableAutoDeploy?: boolean;
}

/**
 * SLA enforcement result
 */
export interface SLAEnforcementResult {
  /** Number of stale skills found */
  staleSkillsFound: number;
  /** Number of skills auto-promoted */
  promoted: number;
  /** Number of notifications sent */
  notified: number;
  /** Promotion errors (if any) */
  errors?: Array<{
    skillName: string;
    error: string;
  }>;
  /** Enforcement timestamp */
  enforcedAt: Date;
  /** Execution duration (ms) */
  durationMs: number;
}

/**
 * Promotion SLA Enforcer
 */
export class PromotionSLAEnforcer {
  private dbService: DatabaseService;
  private promotionService: SkillPromotionService;
  private config: Required<SLAEnforcerConfig>;

  constructor(dbService: DatabaseService, config: SLAEnforcerConfig = {}) {
    this.dbService = dbService;
    this.promotionService = new SkillPromotionService(dbService, {
      slaThresholdHours: config.slaThresholdHours || 48,
    });

    // Default configuration
    this.config = {
      autoPromote: config.autoPromote ?? false,
      notifyStale: config.notifyStale ?? true,
      slaThresholdHours: config.slaThresholdHours ?? 48,
      dryRun: config.dryRun ?? false,
      enableGitCommit: config.enableGitCommit ?? true,
      enableAutoDeploy: config.enableAutoDeploy ?? false,
    };

    logger.info('SLA Enforcer initialized', { config: this.config });
  }

  /**
   * Enforce SLA for skill promotions
   */
  async enforceSLA(): Promise<SLAEnforcementResult> {
    const startTime = Date.now();
    logger.info('Starting SLA enforcement', {
      slaThresholdHours: this.config.slaThresholdHours,
      autoPromote: this.config.autoPromote,
      dryRun: this.config.dryRun,
    });

    try {
      // 1. Find stale skills (>48 hours in staging)
      const staleSkills = await this.promotionService.checkStaleness();

      if (staleSkills.length === 0) {
        logger.info('No stale skills found');
        return {
          staleSkillsFound: 0,
          promoted: 0,
          notified: 0,
          enforcedAt: new Date(),
          durationMs: Date.now() - startTime,
        };
      }

      logger.warn('Stale skills detected', {
        count: staleSkills.length,
        skills: staleSkills.map((s) => ({
          name: s.name,
          ageHours: s.ageHours,
          slaBreachHours: s.slaBreachHours,
        })),
      });

      // 2. Process each stale skill
      let promoted = 0;
      let notified = 0;
      const errors: Array<{ skillName: string; error: string }> = [];

      for (const skill of staleSkills) {
        try {
          await this.processStaleSkill(skill);

          // Track promotion count
          if (this.config.autoPromote && !this.config.dryRun) {
            promoted++;
          }

          // Track notification count
          if (this.config.notifyStale) {
            notified++;
          }
        } catch (error) {
          logger.error('Failed to process stale skill', {
            skillName: skill.name,
            error,
          });

          errors.push({
            skillName: skill.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // 3. Record enforcement in database
      await this.recordEnforcement(staleSkills.length, promoted, notified);

      const result: SLAEnforcementResult = {
        staleSkillsFound: staleSkills.length,
        promoted,
        notified,
        errors: errors.length > 0 ? errors : undefined,
        enforcedAt: new Date(),
        durationMs: Date.now() - startTime,
      };

      logger.info('SLA enforcement complete', result);

      // 4. Generate summary report
      this.printSummary(result);

      return result;
    } catch (error) {
      logger.error('SLA enforcement failed', { error });
      throw error;
    }
  }

  /**
   * Process a single stale skill
   */
  private async processStaleSkill(skill: StaleSkill): Promise<void> {
    logger.info('Processing stale skill', {
      skillName: skill.name,
      ageHours: skill.ageHours,
      slaBreachHours: skill.slaBreachHours,
    });

    // 1. Send notification if enabled
    if (this.config.notifyStale) {
      await this.notifyStaleSkill(skill);
    }

    // 2. Auto-promote if enabled
    if (this.config.autoPromote) {
      if (this.config.dryRun) {
        logger.info('DRY RUN: Would auto-promote stale skill', {
          skillName: skill.name,
        });
      } else {
        logger.info('Auto-promoting stale skill', { skillName: skill.name });

        const result = await this.promotionService.promoteSkill(skill.stagingPath, {
          autoDeploy: this.config.enableAutoDeploy,
          gitCommit: this.config.enableGitCommit,
          notify: false, // Already notified above
          promotedBy: 'sla-enforcer',
        });

        if (!result.success) {
          logger.error('Auto-promotion failed', {
            skillName: skill.name,
            error: result.error,
          });
          throw new Error(result.error);
        }

        logger.info('Auto-promotion successful', {
          skillName: skill.name,
          productionPath: result.productionPath,
          deploymentId: result.deploymentId,
        });
      }
    }
  }

  /**
   * Send notification for stale skill
   */
  private async notifyStaleSkill(skill: StaleSkill): Promise<void> {
    // Console notification
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⚠️  SLA BREACH DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Skill:           ${skill.name}
  Age:             ${skill.ageHours} hours
  SLA Threshold:   ${this.config.slaThresholdHours} hours
  SLA Breach:      ${skill.slaBreachHours} hours over threshold
  Location:        ${skill.stagingPath}
  Auto-Promote:    ${this.config.autoPromote ? 'YES' : 'NO'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

    // Future: Add webhook, email, Slack notifications
    logger.info('Stale skill notification sent', { skillName: skill.name });
  }

  /**
   * Record enforcement in database
   */
  private async recordEnforcement(
    staleSkillsFound: number,
    promoted: number,
    notified: number
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO sla_enforcements (enforced_at, stale_skills_found, promoted, notified)
        VALUES (?, ?, ?, ?)
      `;

      const adapter = this.dbService.getAdapter('sqlite');
      await adapter.query(query, [
        new Date().toISOString(),
        staleSkillsFound,
        promoted,
        notified,
      ]);

      logger.debug('Enforcement recorded in database', {
        staleSkillsFound,
        promoted,
        notified,
      });
    } catch (error) {
      // Log error but don't fail enforcement
      logger.error('Failed to record enforcement in database', { error });
    }
  }

  /**
   * Print summary report
   */
  private printSummary(result: SLAEnforcementResult): void {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SLA ENFORCEMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Stale Skills Found:   ${result.staleSkillsFound}
  Auto-Promoted:        ${result.promoted}
  Notifications Sent:   ${result.notified}
  Errors:               ${result.errors?.length || 0}
  Duration:             ${result.durationMs}ms
  Enforced At:          ${result.enforcedAt.toISOString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

    if (result.errors && result.errors.length > 0) {
      console.log('Errors:');
      for (const error of result.errors) {
        console.log(`  - ${error.skillName}: ${error.error}`);
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }
}

/**
 * CLI entry point for running as standalone job
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: SLAEnforcerConfig = {
    autoPromote: args.includes('--auto-promote'),
    notifyStale: !args.includes('--no-notify'),
    dryRun: args.includes('--dry-run'),
    enableGitCommit: !args.includes('--no-git-commit'),
    enableAutoDeploy: args.includes('--auto-deploy'),
  };

  // Initialize database service
  const dbService = new DatabaseService({
    type: 'sqlite',
    path: process.env.CFN_DB_PATH || './data/cfn.db',
  });

  // Run SLA enforcer
  const enforcer = new PromotionSLAEnforcer(dbService, config);

  try {
    const result = await enforcer.enforceSLA();
    process.exit(result.errors && result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    logger.error('SLA enforcer failed', { error });
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
