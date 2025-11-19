/**
 * Skill Validator - validates skill structure, metadata, and parameters
 */

import type {
  SkillValidator as ISkillValidator,
  ValidationResult,
  SkillPropagationOptions,
  FileSystemAdapter,
  DatabaseAdapter,
} from './types';
import { VersionManager } from './version-manager';

export class SkillValidator implements ISkillValidator {
  constructor(
    private fs: FileSystemAdapter,
    private db: DatabaseAdapter
  ) {}

  /**
   * Validate all input parameters
   */
  async validateParameters(options: SkillPropagationOptions): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate required fields
    if (!options.skillName || options.skillName.trim().length === 0) {
      errors.push('Missing required parameter: skillName');
    }

    if (!options.newVersion || options.newVersion.trim().length === 0) {
      errors.push('Missing required parameter: newVersion');
    }

    if (!options.updatePath || options.updatePath.trim().length === 0) {
      errors.push('Missing required parameter: updatePath');
    }

    // Validate skill name format (alphanumeric, hyphens, underscores)
    if (options.skillName && !/^[a-zA-Z0-9_-]+$/.test(options.skillName)) {
      errors.push(`Invalid skill name: ${options.skillName}. Use only alphanumeric, hyphens, and underscores.`);
    }

    // Validate version format
    if (options.newVersion && !VersionManager.isValidVersion(options.newVersion)) {
      errors.push(
        `Invalid version format: ${options.newVersion}. Expected format: MAJOR.MINOR.PATCH (e.g., 1.0.0)`
      );
    }

    // Validate change type
    if (options.changeType && !['patch', 'minor', 'major'].includes(options.changeType)) {
      errors.push(`Invalid changeType: ${options.changeType}. Must be one of: patch, minor, major`);
    }

    // Validate file exists and is readable
    if (options.updatePath) {
      const exists = await this.fs.fileExists(options.updatePath);
      if (!exists) {
        errors.push(`Update file not found: ${options.updatePath}`);
      }

      const readable = await this.fs.isReadable(options.updatePath);
      if (!readable) {
        errors.push(`Update file is not readable: ${options.updatePath}`);
      }
    }

    // Validate database exists
    const dbExists = await this.fs.fileExists(options.databasePath || './.claude/skills-database/skills.db');
    if (!dbExists) {
      errors.push(`Skills database not found: ${options.databasePath}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if skill exists in database
   */
  async validateSkillExists(skillName: string): Promise<boolean> {
    try {
      const result = await this.db.selectOne(
        'SELECT COUNT(*) as count FROM skills WHERE name = ?1',
        [skillName]
      );

      return result && (result.count > 0 || result.value > 0);
    } catch {
      return false;
    }
  }

  /**
   * Validate version increment matches expected change type
   */
  async validateVersionIncrement(
    currentVersion: string,
    newVersion: string,
    expectedChangeType: 'patch' | 'minor' | 'major'
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    const result = VersionManager.validateVersionIncrement(
      currentVersion,
      newVersion,
      expectedChangeType
    );

    if (!result.isValid) {
      const changeType = result.changeType;

      switch (changeType) {
        case 'same':
          errors.push(`Version unchanged: ${currentVersion} → ${newVersion}`);
          break;

        case 'downgrade':
          errors.push(`Version downgrade not allowed: ${currentVersion} → ${newVersion}`);
          break;

        case 'major':
        case 'minor':
        case 'patch':
          if (changeType !== expectedChangeType) {
            errors.push(
              `Version change type mismatch: detected ${changeType}, but expected ${expectedChangeType} ` +
              `(version: ${currentVersion} → ${newVersion})`
            );
          }
          break;

        default:
          errors.push(`Invalid version comparison result: ${changeType}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate skill structure (must have SKILL.md)
   */
  async validateSkillStructure(skillPath: string): Promise<ValidationResult> {
    const errors: string[] = [];

    const skillMdExists = await this.fs.fileExists(`${skillPath}/SKILL.md`);
    if (!skillMdExists) {
      errors.push(`SKILL.md not found in ${skillPath}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate content hash changed
   */
  validateContentHashChanged(oldHash: string, newHash: string): ValidationResult {
    const errors: string[] = [];

    if (oldHash === newHash) {
      errors.push('Content hash unchanged - no actual content changes detected');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
