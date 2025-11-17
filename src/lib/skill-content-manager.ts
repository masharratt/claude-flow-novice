/**
 * Skill Content Manager
 *
 * Manages standardized skill content storage, organization, and versioning
 * Enforces directory structure, validates required files, tracks versions
 *
 * @module skill-content-manager
 * @version 1.0.0
 */

import { join, basename, dirname } from 'path';
import { stat, readdir, access, chmod, readFile, writeFile, mkdir } from 'fs/promises';
import { constants } from 'fs';
import { StandardError } from './errors.js';
import {
  SkillFrontmatter,
  ParsedSkillDocument,
  parseFrontmatter,
  validateFrontmatter,
  parseAndValidate,
  updateFrontmatter,
  createSkillDocument
} from './skill-frontmatter-parser.js';
import {
  calculateFileHash,
  getCommitMetadata,
  getVersionHistory,
  commitFile,
  hasUncommittedChanges,
  verifyContentIntegrity,
  getFileCreationDate,
  getFileModificationDate,
  GitCommitMetadata,
  VersionHistoryEntry
} from './skill-git-integration.js';

/**
 * Required files in skill directory
 */
export const REQUIRED_SKILL_FILES = [
  'SKILL.md',
  'execute.sh',
  'test.sh',
  'validate.sh',
  'package.json'
] as const;

/**
 * Skill directory structure validation result
 */
export interface SkillStructureValidation {
  valid: boolean;
  skillName: string;
  skillPath: string;
  missingFiles: string[];
  invalidPermissions: string[];
  errors: string[];
  warnings: string[];
}

/**
 * Complete skill metadata including git info
 */
export interface SkillMetadata extends SkillFrontmatter {
  skillPath: string;
  contentHash: string;
  gitMetadata?: GitCommitMetadata;
  versionHistory?: VersionHistoryEntry[];
  hasUncommittedChanges?: boolean;
  fileCreated?: string;
  fileModified?: string;
}

/**
 * Skill update options
 */
export interface SkillUpdateOptions {
  autoCommit?: boolean;
  commitMessage?: string;
  updateTimestamp?: boolean;
  validateStructure?: boolean;
}

/**
 * Skill content manager error
 */
export class SkillContentError extends StandardError {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super('SKILL_CONTENT_ERROR', message, context);
    this.name = 'SkillContentError';
  }
}

/**
 * Validate skill directory structure
 *
 * @param skillPath - Path to skill directory
 * @returns Validation result with details
 */
export async function validateSkillStructure(
  skillPath: string
): Promise<SkillStructureValidation> {
  const skillName = basename(skillPath);
  const missingFiles: string[] = [];
  const invalidPermissions: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Check if directory exists
    const dirStat = await stat(skillPath);
    if (!dirStat.isDirectory()) {
      errors.push(`${skillPath} is not a directory`);
      return {
        valid: false,
        skillName,
        skillPath,
        missingFiles,
        invalidPermissions,
        errors,
        warnings
      };
    }
  } catch (error) {
    errors.push(`Skill directory does not exist: ${skillPath}`);
    return {
      valid: false,
      skillName,
      skillPath,
      missingFiles,
      invalidPermissions,
      errors,
      warnings
    };
  }

  // Check required files
  for (const fileName of REQUIRED_SKILL_FILES) {
    const filePath = join(skillPath, fileName);

    try {
      await access(filePath, constants.F_OK);

      // Check execute permission for .sh files
      if (fileName.endsWith('.sh')) {
        try {
          await access(filePath, constants.X_OK);
        } catch {
          invalidPermissions.push(fileName);
          errors.push(`${fileName} is not executable`);
        }
      }
    } catch {
      missingFiles.push(fileName);
      errors.push(`Required file missing: ${fileName}`);
    }
  }

  // Validate SKILL.md frontmatter if exists
  const skillMdPath = join(skillPath, 'SKILL.md');
  try {
    await access(skillMdPath, constants.F_OK);
    const content = await readFile(skillMdPath, 'utf-8');

    try {
      const parsed = parseFrontmatter(content);
      const validation = validateFrontmatter(parsed.frontmatter);

      if (!validation.valid) {
        errors.push(...validation.errors);
      }

      warnings.push(...validation.warnings);
    } catch (error) {
      errors.push(`SKILL.md frontmatter error: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch {
    // Already reported as missing file
  }

  return {
    valid: errors.length === 0,
    skillName,
    skillPath,
    missingFiles,
    invalidPermissions,
    errors,
    warnings
  };
}

/**
 * Fix skill file permissions
 *
 * @param skillPath - Path to skill directory
 * @returns Array of files that were fixed
 */
export async function fixSkillPermissions(skillPath: string): Promise<string[]> {
  const fixed: string[] = [];

  for (const fileName of REQUIRED_SKILL_FILES) {
    if (fileName.endsWith('.sh')) {
      const filePath = join(skillPath, fileName);

      try {
        await access(filePath, constants.F_OK);
        await chmod(filePath, 0o755); // rwxr-xr-x
        fixed.push(fileName);
      } catch {
        // File doesn't exist, skip
      }
    }
  }

  return fixed;
}

/**
 * Load skill metadata with git integration
 *
 * @param skillPath - Path to skill directory
 * @param includeHistory - Include version history (default: false)
 * @returns Complete skill metadata
 */
export async function loadSkillMetadata(
  skillPath: string,
  includeHistory: boolean = false
): Promise<SkillMetadata> {
  const skillMdPath = join(skillPath, 'SKILL.md');

  try {
    // Read and parse SKILL.md
    const content = await readFile(skillMdPath, 'utf-8');
    const parsed = parseAndValidate(content);

    // Calculate content hash
    const contentHash = calculateFileHash(skillMdPath);

    // Get git metadata (graceful fallback if not in git repo)
    let gitMetadata: GitCommitMetadata | undefined;
    let versionHistory: VersionHistoryEntry[] | undefined;
    let hasChanges: boolean | undefined;
    let fileCreated: string | undefined;
    let fileModified: string | undefined;

    try {
      gitMetadata = await getCommitMetadata(skillMdPath);
      hasChanges = await hasUncommittedChanges(skillMdPath);
      fileCreated = await getFileCreationDate(skillMdPath);
      fileModified = await getFileModificationDate(skillMdPath);

      if (includeHistory) {
        versionHistory = await getVersionHistory(skillMdPath);
      }
    } catch {
      // Not in git repo or no git history - continue without git data
    }

    return {
      ...parsed.frontmatter,
      skillPath,
      contentHash: await contentHash,
      gitMetadata,
      versionHistory,
      hasUncommittedChanges: hasChanges,
      fileCreated,
      fileModified
    };
  } catch (error) {
    throw new SkillContentError(
      `Failed to load skill metadata from ${skillPath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Update skill frontmatter
 *
 * @param skillPath - Path to skill directory
 * @param updates - Partial frontmatter updates
 * @param options - Update options
 * @returns Updated skill metadata
 */
export async function updateSkillFrontmatter(
  skillPath: string,
  updates: Partial<SkillFrontmatter>,
  options: SkillUpdateOptions = {}
): Promise<SkillMetadata> {
  const {
    autoCommit = false,
    commitMessage,
    updateTimestamp = true,
    validateStructure = true
  } = options;

  const skillMdPath = join(skillPath, 'SKILL.md');

  try {
    // Validate structure first if requested
    if (validateStructure) {
      const validation = await validateSkillStructure(skillPath);
      if (!validation.valid) {
        throw new SkillContentError('Skill structure validation failed', {
          errors: validation.errors
        });
      }
    }

    // Read current content
    const currentContent = await readFile(skillMdPath, 'utf-8');

    // Update frontmatter
    const updatedContent = updateFrontmatter(currentContent, updates);

    // Write updated content
    await writeFile(skillMdPath, updatedContent, 'utf-8');

    // Auto-commit if requested
    if (autoCommit) {
      const message = commitMessage || `Update ${basename(skillPath)} frontmatter`;
      await commitFile(skillMdPath, message);
    }

    // Return updated metadata
    return await loadSkillMetadata(skillPath);
  } catch (error) {
    throw new SkillContentError(
      `Failed to update skill frontmatter for ${skillPath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Create new skill directory with standard structure
 *
 * @param parentDir - Parent directory for skills
 * @param skillName - Name of skill to create
 * @param frontmatter - Initial frontmatter
 * @param content - Initial SKILL.md content
 * @returns Created skill metadata
 */
export async function createSkill(
  parentDir: string,
  skillName: string,
  frontmatter: SkillFrontmatter,
  content: string = ''
): Promise<SkillMetadata> {
  const skillPath = join(parentDir, skillName);

  try {
    // Create skill directory
    await mkdir(skillPath, { recursive: true });

    // Create SKILL.md
    const skillMdPath = join(skillPath, 'SKILL.md');
    const skillDocument = createSkillDocument(frontmatter, content);
    await writeFile(skillMdPath, skillDocument, 'utf-8');

    // Create placeholder files
    const executeSh = `#!/bin/bash
# ${frontmatter.name} - Execution Script
# Version: ${frontmatter.version}

set -euo pipefail

echo "Executing ${frontmatter.name}..."
# Add implementation here
`;

    const testSh = `#!/bin/bash
# ${frontmatter.name} - Test Script
# Version: ${frontmatter.version}

set -euo pipefail

echo "Testing ${frontmatter.name}..."
# Add tests here
`;

    const validateSh = `#!/bin/bash
# ${frontmatter.name} - Validation Script
# Version: ${frontmatter.version}

set -euo pipefail

echo "Validating ${frontmatter.name}..."
# Add validation here
`;

    const packageJson = {
      name: skillName,
      version: frontmatter.version,
      description: frontmatter.description,
      scripts: {
        execute: './execute.sh',
        test: './test.sh',
        validate: './validate.sh'
      }
    };

    await writeFile(join(skillPath, 'execute.sh'), executeSh, 'utf-8');
    await writeFile(join(skillPath, 'test.sh'), testSh, 'utf-8');
    await writeFile(join(skillPath, 'validate.sh'), validateSh, 'utf-8');
    await writeFile(join(skillPath, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf-8');

    // Fix permissions
    await fixSkillPermissions(skillPath);

    // Return metadata
    return await loadSkillMetadata(skillPath);
  } catch (error) {
    throw new SkillContentError(
      `Failed to create skill ${skillName}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Scan directory for all skills
 *
 * @param skillsDir - Path to skills directory
 * @returns Array of skill paths
 */
export async function scanSkills(skillsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    const skillPaths: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(skillsDir, entry.name);
        const skillMdPath = join(skillPath, 'SKILL.md');

        try {
          await access(skillMdPath, constants.F_OK);
          skillPaths.push(skillPath);
        } catch {
          // Not a valid skill directory, skip
        }
      }
    }

    return skillPaths.sort();
  } catch (error) {
    throw new SkillContentError(
      `Failed to scan skills directory ${skillsDir}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Verify skill content integrity
 *
 * @param skillPath - Path to skill directory
 * @param expectedHash - Expected content hash
 * @returns True if content matches expected hash
 */
export async function verifySkillIntegrity(
  skillPath: string,
  expectedHash: string
): Promise<boolean> {
  const skillMdPath = join(skillPath, 'SKILL.md');
  return await verifyContentIntegrity(skillMdPath, expectedHash);
}
