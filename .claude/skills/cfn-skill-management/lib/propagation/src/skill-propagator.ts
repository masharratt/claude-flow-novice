/**
 * Main Skill Propagator - orchestrates the skill update propagation process
 */

import type {
  SkillPropagator as ISkillPropagator,
  SkillPropagationOptions,
  PropagationResult,
  FileSystemAdapter,
  DatabaseAdapter,
  Logger,
} from './types';
import { SkillValidator } from './skill-validator';
import { SkillMetadataParser } from './metadata-parser';
import { VersionManager } from './version-manager';

export class SkillPropagator implements ISkillPropagator {
  private validator: SkillValidator;
  private metadataParser: SkillMetadataParser;

  constructor(
    private fs: FileSystemAdapter,
    private db: DatabaseAdapter,
    private logger: Logger
  ) {
    this.validator = new SkillValidator(fs, db);
    this.metadataParser = new SkillMetadataParser();
  }

  /**
   * Main propagation workflow
   */
  async propagate(options: SkillPropagationOptions): Promise<PropagationResult> {
    const startTime = new Date().toISOString();

    this.logger.info('========================================');
    this.logger.info('Propagate Skill Update');
    this.logger.info('========================================');
    this.logger.info(`Skill: ${options.skillName}`);
    this.logger.info(`New Version: ${options.newVersion}`);
    this.logger.info(`Update Path: ${options.updatePath}`);
    this.logger.info(`Change Type: ${options.changeType || 'patch'}`);
    this.logger.info('========================================');

    // Step 1: Validate inputs
    this.logger.info('Step 1: Validating inputs');
    const validationResult = await this.validator.validateParameters(options);
    if (!validationResult.valid) {
      throw new Error(`Validation failed:\n${validationResult.errors.join('\n')}`);
    }
    this.logger.success('Input validation passed');

    // Step 2: Look up existing skill
    this.logger.info('Step 2: Looking up existing skill');
    const skillInfo = await this.getSkillInfo(options.skillName);
    if (!skillInfo) {
      throw new Error(`Skill not found in database: ${options.skillName}`);
    }
    this.logger.info(`Found skill: ID=${skillInfo.id}, Current Version=${skillInfo.version}`);

    // Step 3: Validate version increment
    this.logger.info('Step 3: Validating version increment');
    const changeType = options.changeType || 'patch';
    const versionValidation = await this.validator.validateVersionIncrement(
      skillInfo.version,
      options.newVersion,
      changeType
    );
    if (!versionValidation.valid) {
      throw new Error(`Version validation failed:\n${versionValidation.errors.join('\n')}`);
    }
    this.logger.success(`Version increment validated: ${skillInfo.version} → ${options.newVersion} (${changeType})`);

    // Step 4: Calculate new content hash
    this.logger.info('Step 4: Calculating new content hash');
    const newHash = await this.fs.calculateHash(options.updatePath);
    this.logger.debug(`New Hash: ${newHash}`);

    const hashValidation = this.validator.validateContentHashChanged(skillInfo.content_hash, newHash);
    if (!hashValidation.valid) {
      throw new Error(`Content validation failed:\n${hashValidation.errors.join('\n')}`);
    }
    this.logger.success('Content hash calculated and differs from current');

    // Step 5: Parse frontmatter metadata
    this.logger.info('Step 5: Parsing frontmatter metadata from updated skill');
    const updateFileContent = await this.fs.readFile(options.updatePath);
    const metadata = this.metadataParser.parse(updateFileContent);

    const metadataValidation = this.metadataParser.validate(metadata);
    if (!metadataValidation.valid) {
      this.logger.warning(`Metadata validation warnings:\n${metadataValidation.errors.join('\n')}`);
    }

    // Use new metadata or fall back to existing
    const newTags = metadata.tags ? JSON.stringify(metadata.tags) : skillInfo.tags;
    const newCategory = metadata.category || skillInfo.category;
    const newOwner = metadata.owner || skillInfo.owner;
    const newApprovalLevel = metadata.approval_level || skillInfo.approval_level;

    // Step 6: Update skill record
    this.logger.info('Step 6: Updating skill record in database');
    await this.updateSkillRecord(skillInfo.id, {
      version: options.newVersion,
      content_hash: newHash,
      content_path: options.updatePath,
      tags: newTags,
      category: newCategory,
      owner: newOwner,
      approval_level: newApprovalLevel,
    });
    this.logger.success('Skill record updated with refreshed metadata');

    // Step 7: Record approval history
    this.logger.info('Step 7: Recording approval history');
    await this.recordApprovalHistory(skillInfo.id, options.newVersion, changeType);
    this.logger.success('Approval history recorded');

    // Step 8: Notify affected agents (optional)
    let affectedAgents: string[] = [];
    if (options.notifyAgents || options.enableAgentNotifications) {
      this.logger.info('Step 8: Notifying affected agents');
      affectedAgents = await this.notifyAffectedAgents(skillInfo.id, options.skillName);
    } else {
      this.logger.info('Step 8: Agent notification disabled (skipping)');
    }

    // Success summary
    this.logger.info('==========================================');
    this.logger.success('Skill Update Propagated Successfully');
    this.logger.info('==========================================');
    this.logger.info(`Skill Name: ${options.skillName}`);
    this.logger.info(`Version: ${skillInfo.version} → ${options.newVersion}`);
    this.logger.info(`Change Type: ${changeType}`);
    this.logger.info(`Content Hash: ${newHash.substring(0, 16)}...`);
    this.logger.info(`Update Path: ${options.updatePath}`);
    this.logger.info('Metadata Refreshed: Yes');
    this.logger.info(`  Tags: ${newTags}`);
    this.logger.info(`  Category: ${newCategory}`);
    this.logger.info(`  Owner: ${newOwner}`);
    this.logger.info(`  Approval Level: ${newApprovalLevel}`);
    this.logger.info('==========================================');

    return {
      success: true,
      skillName: options.skillName,
      newVersion: options.newVersion,
      oldVersion: skillInfo.version,
      changeType: VersionManager.compareVersions(skillInfo.version, options.newVersion),
      contentHash: newHash,
      metadata: {
        tags: newTags,
        category: newCategory,
        owner: newOwner,
        approval_level: newApprovalLevel,
      },
      affectedAgents,
      timestamp: startTime,
    };
  }

  /**
   * Retrieve skill info from database
   */
  private async getSkillInfo(skillName: string) {
    const result = await this.db.selectOne(
      'SELECT id, version, content_hash, content_path, tags, category, owner, approval_level FROM skills WHERE name = ?1',
      [skillName]
    );

    if (!result) {
      return null;
    }

    // Handle different result formats
    if (Array.isArray(result)) {
      return {
        id: result[0],
        version: result[1],
        content_hash: result[2],
        content_path: result[3],
        tags: result[4],
        category: result[5],
        owner: result[6],
        approval_level: result[7],
      };
    }

    return result;
  }

  /**
   * Update skill record in database
   */
  private async updateSkillRecord(
    skillId: number,
    updates: Record<string, any>
  ): Promise<void> {
    const setClauses = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ');

    const values = Object.values(updates);
    values.push(skillId);

    const sql = `UPDATE skills SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`;

    await this.db.execute(sql, values);
  }

  /**
   * Record approval history entry
   */
  private async recordApprovalHistory(
    skillId: number,
    newVersion: string,
    changeType: string
  ): Promise<void> {
    const metadata = JSON.stringify({
      change_type: changeType,
      source: 'propagate-skill-update',
      propagated_at: new Date().toISOString(),
    });

    const sql = `
      INSERT INTO approval_history (
        skill_id,
        version,
        approval_level,
        approver,
        decision,
        reasoning,
        approval_criteria_check,
        timestamp
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `;

    const reasoning = 'Skill update propagated through automated workflow';

    await this.db.execute(sql, [
      skillId,
      newVersion,
      'auto',
      'propagate-skill-update',
      'approved',
      reasoning,
      metadata,
    ]);
  }

  /**
   * Get and notify affected agents
   */
  private async notifyAffectedAgents(skillId: number, skillName: string): Promise<string[]> {
    const agents = await this.db.getAffectedAgents(skillId);

    if (agents.length === 0) {
      this.logger.info('No agents using this skill');
      return [];
    }

    this.logger.info(`Agents using this skill (${agents.length}):`);
    for (const agent of agents) {
      this.logger.info(`  - ${agent}`);
    }

    this.logger.success(`Notification: Skill '${skillName}' has been updated`);
    this.logger.info('Affected agents should reload skill content on next invocation');

    return agents;
  }
}
