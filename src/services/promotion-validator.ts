/**
 * Promotion Validator
 *
 * Validates skills in staging before promotion to production.
 * Part of Task 1.2: Staging → Production Promotion Workflow
 *
 * Validation checks:
 * - Content integrity (all required files exist)
 * - Schema compliance (frontmatter valid)
 * - Test results (test.sh passes - if exists)
 * - No conflicts with existing production skills
 *
 * @example
 * ```typescript
 * const validation = await validateStagedSkill('.claude/skills/staging/auth-v2');
 * if (!validation.success) {
 *   console.error('Validation failed:', validation.errors);
 * }
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { StandardError, ErrorCode } from '../lib/errors.js';
import { createLogger } from '../lib/logging.js';
import { fileExists } from '../lib/file-operations.js';
import { validateSkill, parseFrontmatter } from './skill-validator.js';

const logger = createLogger('promotion-validator');

const fsReadFile = promisify(fs.readFile);
const fsStat = promisify(fs.stat);
const fsAccess = promisify(fs.access);
const execPromise = promisify(exec);

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  success: boolean;
  /** Validation errors (if any) */
  errors?: string[];
  /** Validation warnings (non-fatal) */
  warnings?: string[];
  /** Detailed check results */
  checks?: {
    contentIntegrity: boolean;
    schemaCompliance: boolean;
    testsPassed: boolean;
    noConflicts: boolean;
  };
  /** Validation timestamp */
  validatedAt?: Date;
}

/**
 * Validate a staged skill before promotion
 */
export async function validateStagedSkill(skillPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks = {
    contentIntegrity: false,
    schemaCompliance: false,
    testsPassed: false,
    noConflicts: false,
  };

  try {
    logger.info('Starting staged skill validation', { skillPath });

    // Normalize path
    const normalizedPath = path.resolve(skillPath);

    // 1. Check if skill directory exists
    if (!(await fileExists(normalizedPath))) {
      errors.push(`Skill directory does not exist: ${normalizedPath}`);
      return {
        success: false,
        errors,
        warnings,
        checks,
        validatedAt: new Date(),
      };
    }

    const stats = await fsStat(normalizedPath);
    if (!stats.isDirectory()) {
      errors.push(`Path is not a directory: ${normalizedPath}`);
      return {
        success: false,
        errors,
        warnings,
        checks,
        validatedAt: new Date(),
      };
    }

    // 2. Content integrity check
    logger.debug('Checking content integrity', { skillPath });
    const contentCheck = await checkContentIntegrity(normalizedPath);
    checks.contentIntegrity = contentCheck.success;
    if (!contentCheck.success) {
      errors.push(...(contentCheck.errors || []));
    }
    if (contentCheck.warnings) {
      warnings.push(...contentCheck.warnings);
    }

    // 3. Schema compliance check
    logger.debug('Checking schema compliance', { skillPath });
    const schemaCheck = await checkSchemaCompliance(normalizedPath);
    checks.schemaCompliance = schemaCheck.success;
    if (!schemaCheck.success) {
      errors.push(...(schemaCheck.errors || []));
    }
    if (schemaCheck.warnings) {
      warnings.push(...schemaCheck.warnings);
    }

    // 4. Test execution check (if test.sh exists)
    logger.debug('Checking tests', { skillPath });
    const testCheck = await checkTests(normalizedPath);
    checks.testsPassed = testCheck.success;
    if (!testCheck.success && testCheck.errors) {
      // Test failures are warnings, not hard errors (unless critical)
      if (testCheck.critical) {
        errors.push(...testCheck.errors);
      } else {
        warnings.push(...testCheck.errors);
      }
    }
    if (testCheck.warnings) {
      warnings.push(...testCheck.warnings);
    }

    // 5. Conflict check (production skill doesn't exist or is compatible)
    logger.debug('Checking for conflicts', { skillPath });
    const conflictCheck = await checkConflicts(normalizedPath);
    checks.noConflicts = conflictCheck.success;
    if (!conflictCheck.success) {
      errors.push(...(conflictCheck.errors || []));
    }
    if (conflictCheck.warnings) {
      warnings.push(...conflictCheck.warnings);
    }

    // Determine overall success
    const success = errors.length === 0;

    if (success) {
      logger.info('Validation passed', { skillPath, warnings: warnings.length });
    } else {
      logger.error('Validation failed', { skillPath, errors: errors.length, warnings: warnings.length });
    }

    return {
      success,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      checks,
      validatedAt: new Date(),
    };
  } catch (error) {
    logger.error('Validation error', { error, skillPath });
    return {
      success: false,
      errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
      warnings,
      checks,
      validatedAt: new Date(),
    };
  }
}

/**
 * Check content integrity (all required files exist)
 */
async function checkContentIntegrity(skillPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Required files
    const requiredFiles = ['SKILL.md', 'execute.sh'];

    for (const file of requiredFiles) {
      const filePath = path.join(skillPath, file);
      if (!(await fileExists(filePath))) {
        errors.push(`Missing required file: ${file}`);
      } else {
        // Check file is readable
        try {
          await fsAccess(filePath, fs.constants.R_OK);
        } catch {
          errors.push(`File not readable: ${file}`);
        }
      }
    }

    // Optional files (warn if missing)
    const optionalFiles = ['test.sh', 'README.md'];
    for (const file of optionalFiles) {
      const filePath = path.join(skillPath, file);
      if (!(await fileExists(filePath))) {
        warnings.push(`Optional file missing: ${file}`);
      }
    }

    // Check execute.sh is executable
    const executeScript = path.join(skillPath, 'execute.sh');
    if (await fileExists(executeScript)) {
      try {
        const stats = await fsStat(executeScript);
        const isExecutable = (stats.mode & fs.constants.S_IXUSR) !== 0;
        if (!isExecutable) {
          errors.push('execute.sh is not executable (chmod +x required)');
        }
      } catch (error) {
        warnings.push(`Could not check execute.sh permissions: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Content integrity check failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Check schema compliance (frontmatter valid)
 */
async function checkSchemaCompliance(skillPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    if (!(await fileExists(skillMdPath))) {
      errors.push('SKILL.md does not exist');
      return { success: false, errors };
    }

    // Parse frontmatter
    const frontmatter = parseFrontmatter(skillPath);

    // Required fields
    const requiredFields = ['name', 'description', 'version'];
    for (const field of requiredFields) {
      if (!frontmatter[field]) {
        errors.push(`Missing required frontmatter field: ${field}`);
      }
    }

    // Validate version format (semantic versioning)
    if (frontmatter.version) {
      const versionRegex = /^\d+\.\d+\.\d+$/;
      if (!versionRegex.test(frontmatter.version)) {
        errors.push(`Invalid version format: ${frontmatter.version} (expected: X.Y.Z)`);
      }
    }

    // Optional fields (warn if missing)
    const optionalFields = ['author', 'tags', 'dependencies'];
    for (const field of optionalFields) {
      if (!frontmatter[field]) {
        warnings.push(`Optional frontmatter field missing: ${field}`);
      }
    }

    // Validate tags (should be array)
    if (frontmatter.tags && !Array.isArray(frontmatter.tags)) {
      warnings.push('Frontmatter tags should be an array');
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Schema compliance check failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Check test execution (run test.sh if exists)
 */
async function checkTests(skillPath: string): Promise<ValidationResult & { critical?: boolean }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const testScript = path.join(skillPath, 'test.sh');

    // If test.sh doesn't exist, pass (tests are optional)
    if (!(await fileExists(testScript))) {
      warnings.push('No test.sh found (tests are optional)');
      return {
        success: true,
        warnings,
      };
    }

    // Check if test.sh is executable
    const stats = await fsStat(testScript);
    const isExecutable = (stats.mode & fs.constants.S_IXUSR) !== 0;
    if (!isExecutable) {
      errors.push('test.sh exists but is not executable');
      return {
        success: false,
        errors,
        critical: true,
      };
    }

    // Run tests with 30-second timeout
    logger.debug('Running tests', { testScript });
    try {
      const { stdout, stderr } = await execPromise(`cd ${skillPath} && ./test.sh`, {
        timeout: 30000,
        maxBuffer: 1024 * 1024, // 1MB
      });

      logger.debug('Tests passed', { stdout, stderr });
      return {
        success: true,
      };
    } catch (execError: unknown) {
      const error = execError as { code?: number; stdout?: string; stderr?: string };
      // Test failed
      const errorMsg = `Tests failed (exit code ${error.code || 'unknown'}): ${error.stderr || error.stdout || 'No output'}`;
      errors.push(errorMsg);
      logger.warn('Tests failed', { error: errorMsg });

      // Test failures are non-critical warnings (allow promotion with --force)
      return {
        success: false,
        errors,
        critical: false,
      };
    }
  } catch (error) {
    return {
      success: false,
      errors: [`Test check failed: ${error instanceof Error ? error.message : String(error)}`],
      critical: false,
    };
  }
}

/**
 * Check for conflicts with existing production skills
 */
async function checkConflicts(skillPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const skillName = path.basename(skillPath);
    const productionPath = path.join('.claude/skills', skillName);

    // Check if production skill already exists
    if (await fileExists(productionPath)) {
      warnings.push(`Production skill already exists: ${skillName} (use --overwrite to replace)`);

      // Check if production skill has a different version
      try {
        const stagingFrontmatter = parseFrontmatter(skillPath);
        const productionFrontmatter = parseFrontmatter(productionPath);

        const stagingVersion = stagingFrontmatter.version;
        const productionVersion = productionFrontmatter.version;

        if (stagingVersion === productionVersion) {
          warnings.push(`Both staging and production have version ${stagingVersion}`);
        } else {
          warnings.push(`Version mismatch: staging=${stagingVersion}, production=${productionVersion}`);
        }
      } catch (error) {
        warnings.push('Could not compare versions (frontmatter parse error)');
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Conflict check failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
