/**
 * Skill Validator Service
 *
 * Validates skill content, schema compliance, and deployment readiness.
 * Part of Task 1.1: Automated Skill Deployment Pipeline
 *
 * @example
 * ```typescript
 * const result = await validateSkill(dbService, '/path/to/skill');
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 * }
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../lib/database-service';
import { StandardError, ErrorCode } from '../lib/errors';
import { createLogger } from '../lib/logging';
import { validateVersion } from './skill-versioning';

const logger = createLogger('skill-validator');

/**
 * Validation error detail
 */
export interface ValidationError {
  code: string;
  message: string;
  context?: Record<string, any>;
}

/**
 * Skill validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  metadata?: {
    skillName?: string;
    version?: string;
    contentPath?: string;
  };
}

/**
 * Skill frontmatter schema (parsed from SKILL.md)
 */
export interface SkillFrontmatter {
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: string[];
  tags?: string[];
  [key: string]: any;
}

/**
 * Parse frontmatter from SKILL.md file
 *
 * @param skillPath - Path to skill directory
 * @returns Parsed frontmatter object
 * @throws StandardError if frontmatter is invalid or missing
 */
export function parseFrontmatter(skillPath: string): SkillFrontmatter {
  const skillMdPath = path.join(skillPath, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    throw new StandardError(
      ErrorCode.FILE_NOT_FOUND,
      `SKILL.md not found in skill directory: ${skillPath}`,
      { skillPath, expectedFile: 'SKILL.md' }
    );
  }

  const content = fs.readFileSync(skillMdPath, 'utf-8');

  // Extract frontmatter between --- markers
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new StandardError(
      ErrorCode.PARSE_ERROR,
      'No frontmatter found in SKILL.md',
      { skillPath, file: skillMdPath }
    );
  }

  try {
    // Parse YAML-like frontmatter (simple key: value format)
    const frontmatterText = match[1];
    const lines = frontmatterText.split('\n').filter(line => line.trim());
    const frontmatter: any = {};

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      let value: any = line.substring(colonIndex + 1).trim();

      // Parse arrays (format: [item1, item2, item3])
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value
          .substring(1, value.length - 1)
          .split(',')
          .map(v => v.trim())
          .filter(v => v);
      }

      frontmatter[key] = value;
    }

    // Validate required fields
    if (!frontmatter.name || typeof frontmatter.name !== 'string') {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Frontmatter missing required field: name',
        { skillPath, frontmatter }
      );
    }

    if (!frontmatter.version || typeof frontmatter.version !== 'string') {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Frontmatter missing required field: version',
        { skillPath, frontmatter }
      );
    }

    return frontmatter as SkillFrontmatter;
  } catch (error) {
    if (error instanceof StandardError) {
      throw error;
    }
    throw new StandardError(
      ErrorCode.PARSE_ERROR,
      `Failed to parse frontmatter in SKILL.md: ${(error as Error).message}`,
      { skillPath, file: skillMdPath },
      error as Error
    );
  }
}

/**
 * Validate skill content path exists and has required files
 *
 * @param skillPath - Path to skill directory
 * @returns Validation errors (empty if valid)
 */
export function validateContentPath(skillPath: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check if directory exists
  if (!fs.existsSync(skillPath)) {
    errors.push({
      code: 'CONTENT_PATH_NOT_FOUND',
      message: `Skill directory not found: ${skillPath}`,
      context: { skillPath },
    });
    return errors;
  }

  // Check if it's a directory
  const stats = fs.statSync(skillPath);
  if (!stats.isDirectory()) {
    errors.push({
      code: 'CONTENT_PATH_NOT_DIRECTORY',
      message: `Skill path is not a directory: ${skillPath}`,
      context: { skillPath },
    });
    return errors;
  }

  // Check for required files
  const requiredFiles = ['SKILL.md', 'execute.sh'];
  for (const file of requiredFiles) {
    const filePath = path.join(skillPath, file);
    if (!fs.existsSync(filePath)) {
      errors.push({
        code: 'REQUIRED_FILE_MISSING',
        message: `Required file missing: ${file}`,
        context: { skillPath, file, expectedPath: filePath },
      });
    }
  }

  return errors;
}

/**
 * Validate execute.sh is executable
 *
 * @param skillPath - Path to skill directory
 * @returns Validation errors (empty if valid)
 */
export function validateExecuteScript(skillPath: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const executePath = path.join(skillPath, 'execute.sh');

  if (!fs.existsSync(executePath)) {
    // Already caught by validateContentPath
    return errors;
  }

  try {
    const stats = fs.statSync(executePath);
    // Check if file has execute permission (any execute bit set)
    const isExecutable = (stats.mode & 0o111) !== 0;

    if (!isExecutable) {
      errors.push({
        code: 'EXECUTE_SCRIPT_NOT_EXECUTABLE',
        message: 'execute.sh is not executable',
        context: { skillPath, file: executePath, mode: stats.mode.toString(8) },
      });
    }
  } catch (error) {
    errors.push({
      code: 'EXECUTE_SCRIPT_CHECK_FAILED',
      message: `Failed to check execute.sh permissions: ${(error as Error).message}`,
      context: { skillPath, file: executePath },
    });
  }

  return errors;
}

/**
 * Validate skill schema compliance (frontmatter structure)
 *
 * @param skillPath - Path to skill directory
 * @returns Validation errors (empty if valid)
 */
export function validateSchemaCompliance(skillPath: string): ValidationError[] {
  const errors: ValidationError[] = [];

  try {
    const frontmatter = parseFrontmatter(skillPath);

    // Validate version format
    if (!validateVersion(frontmatter.version)) {
      errors.push({
        code: 'INVALID_VERSION_FORMAT',
        message: `Invalid semantic version format: ${frontmatter.version}`,
        context: {
          skillPath,
          version: frontmatter.version,
          expectedFormat: 'x.y.z',
        },
      });
    }

    // Validate name format (alphanumeric, hyphens, underscores only)
    const nameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!nameRegex.test(frontmatter.name)) {
      errors.push({
        code: 'INVALID_NAME_FORMAT',
        message: `Invalid skill name format: ${frontmatter.name}`,
        context: {
          skillPath,
          name: frontmatter.name,
          expectedFormat: 'alphanumeric, hyphens, and underscores only',
        },
      });
    }
  } catch (error) {
    if (error instanceof StandardError) {
      errors.push({
        code: error.code,
        message: error.message,
        context: error.context,
      });
    } else {
      errors.push({
        code: 'SCHEMA_VALIDATION_FAILED',
        message: `Schema validation failed: ${(error as Error).message}`,
        context: { skillPath },
      });
    }
  }

  return errors;
}

/**
 * Check if skill name is unique (no existing skill with same name)
 *
 * @param dbService - Database service instance
 * @param skillName - Name of the skill to check
 * @param excludeSkillId - Optional skill ID to exclude from uniqueness check (for updates)
 * @returns Validation errors (empty if unique)
 */
export async function validateNameUniqueness(
  dbService: DatabaseService,
  skillName: string,
  excludeSkillId?: string
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  try {
    const adapter = dbService.getAdapter('sqlite');

    let query = 'SELECT id, name FROM skills WHERE name = ?';
    const params: any[] = [skillName];

    if (excludeSkillId) {
      query += ' AND id != ?';
      params.push(excludeSkillId);
    }

    const result = await adapter.query(query, params);

    if (result.rows && result.rows.length > 0) {
      errors.push({
        code: 'NAME_NOT_UNIQUE',
        message: `Skill name already exists: ${skillName}`,
        context: {
          skillName,
          existingSkillId: result.rows[0].id,
        },
      });
    }
  } catch (error) {
    errors.push({
      code: 'NAME_UNIQUENESS_CHECK_FAILED',
      message: `Failed to check name uniqueness: ${(error as Error).message}`,
      context: { skillName },
    });
  }

  return errors;
}

/**
 * Check for version conflicts (version already exists for this skill)
 *
 * @param dbService - Database service instance
 * @param skillName - Name of the skill
 * @param version - Version to check
 * @returns Validation errors (empty if no conflict)
 */
export async function validateVersionConflict(
  dbService: DatabaseService,
  skillName: string,
  version: string
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  try {
    const adapter = dbService.getAdapter('sqlite');

    const result = await adapter.query(
      'SELECT id, version FROM skills WHERE name = ? AND version = ?',
      [skillName, version]
    );

    if (result.rows && result.rows.length > 0) {
      errors.push({
        code: 'VERSION_CONFLICT',
        message: `Version ${version} already exists for skill: ${skillName}`,
        context: {
          skillName,
          version,
          existingSkillId: result.rows[0].id,
        },
      });
    }
  } catch (error) {
    errors.push({
      code: 'VERSION_CONFLICT_CHECK_FAILED',
      message: `Failed to check version conflict: ${(error as Error).message}`,
      context: { skillName, version },
    });
  }

  return errors;
}

/**
 * Validate tests exist and pass (optional check)
 *
 * @param skillPath - Path to skill directory
 * @returns Validation warnings (not errors, as tests are optional)
 */
export function validateTests(skillPath: string): ValidationError[] {
  const warnings: ValidationError[] = [];
  const testPath = path.join(skillPath, 'test.sh');

  if (!fs.existsSync(testPath)) {
    warnings.push({
      code: 'TESTS_NOT_FOUND',
      message: 'No test.sh found (tests are recommended but optional)',
      context: { skillPath, expectedFile: testPath },
    });
    return warnings;
  }

  // Check if test.sh is executable
  try {
    const stats = fs.statSync(testPath);
    const isExecutable = (stats.mode & 0o111) !== 0;

    if (!isExecutable) {
      warnings.push({
        code: 'TEST_SCRIPT_NOT_EXECUTABLE',
        message: 'test.sh exists but is not executable',
        context: { skillPath, file: testPath },
      });
    }
  } catch (error) {
    warnings.push({
      code: 'TEST_SCRIPT_CHECK_FAILED',
      message: `Failed to check test.sh: ${(error as Error).message}`,
      context: { skillPath, file: testPath },
    });
  }

  return warnings;
}

/**
 * Comprehensive skill validation
 *
 * Runs all validation checks and returns aggregated results.
 *
 * @param dbService - Database service instance
 * @param skillPath - Path to skill directory
 * @param excludeSkillId - Optional skill ID to exclude from uniqueness check
 * @returns Validation result with all errors and warnings
 */
export async function validateSkill(
  dbService: DatabaseService,
  skillPath: string,
  excludeSkillId?: string
): Promise<ValidationResult> {
  logger.info('Starting skill validation', { skillPath });

  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let metadata: ValidationResult['metadata'] = {};

  // 1. Validate content path exists
  const contentPathErrors = validateContentPath(skillPath);
  errors.push(...contentPathErrors);

  // If content path is invalid, stop here
  if (contentPathErrors.length > 0) {
    logger.warn('Skill validation failed: content path invalid', {
      skillPath,
      errorCount: errors.length,
    });
    return { valid: false, errors, warnings };
  }

  // 2. Validate schema compliance
  const schemaErrors = validateSchemaCompliance(skillPath);
  errors.push(...schemaErrors);

  // If schema is invalid, stop here
  if (schemaErrors.length > 0) {
    logger.warn('Skill validation failed: schema invalid', {
      skillPath,
      errorCount: errors.length,
    });
    return { valid: false, errors, warnings };
  }

  // Parse frontmatter for subsequent checks
  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = parseFrontmatter(skillPath);
    metadata = {
      skillName: frontmatter.name,
      version: frontmatter.version,
      contentPath: skillPath,
    };
  } catch (error) {
    // Already handled in schema validation
    logger.warn('Skill validation failed: frontmatter parsing error', {
      skillPath,
      error: (error as Error).message,
    });
    return { valid: false, errors, warnings, metadata };
  }

  // 3. Validate execute.sh is executable
  const executeErrors = validateExecuteScript(skillPath);
  errors.push(...executeErrors);

  // 4. Validate name uniqueness
  const nameErrors = await validateNameUniqueness(
    dbService,
    frontmatter.name,
    excludeSkillId
  );
  errors.push(...nameErrors);

  // 5. Validate version conflict
  const versionErrors = await validateVersionConflict(
    dbService,
    frontmatter.name,
    frontmatter.version
  );
  errors.push(...versionErrors);

  // 6. Validate tests (warnings only)
  const testWarnings = validateTests(skillPath);
  warnings.push(...testWarnings);

  const valid = errors.length === 0;

  if (valid) {
    logger.info('Skill validation passed', {
      skillPath,
      skillName: frontmatter.name,
      version: frontmatter.version,
      warningCount: warnings.length,
    });
  } else {
    logger.warn('Skill validation failed', {
      skillPath,
      errorCount: errors.length,
      warningCount: warnings.length,
    });
  }

  return { valid, errors, warnings, metadata };
}
