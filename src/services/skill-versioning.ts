/**
 * Skill Versioning Service
 *
 * Provides semantic versioning management for skill deployment.
 * Part of Task 1.1: Automated Skill Deployment Pipeline
 *
 * @example
 * ```typescript
 * const version = await getNextVersion('authentication', 'minor');
 * // Returns '1.1.0' if current version is '1.0.0'
 *
 * const isValid = validateVersion('1.2.3'); // true
 * const isValid = validateVersion('v1.2.3'); // false
 * ```
 */

import { DatabaseService } from '../lib/database-service.js';
import { StandardError, ErrorCode } from '../lib/errors.js';
import { createLogger, Logger } from '../lib/logging.js';

const logger = createLogger('skill-versioning');

/**
 * Semantic version change type
 */
export type VersionChangeType = 'major' | 'minor' | 'patch';

/**
 * Parsed semantic version
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

/**
 * Validate semantic version format (x.y.z)
 *
 * @param version - Version string to validate
 * @returns True if valid semantic version format
 */
export function validateVersion(version: string): boolean {
  // Must match semantic versioning format: x.y.z where x, y, z are non-negative integers
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  return semverRegex.test(version);
}

/**
 * Parse semantic version string into components
 *
 * @param version - Version string to parse
 * @returns Parsed version components
 * @throws StandardError if version format is invalid
 */
export function parseVersion(version: string): ParsedVersion {
  if (!validateVersion(version)) {
    throw new StandardError(
      ErrorCode.VALIDATION_FAILED,
      `Invalid semantic version format: ${version}`,
      { version, expectedFormat: 'x.y.z' }
    );
  }

  const parts = version.split('.').map(Number);
  return {
    major: parts[0],
    minor: parts[1],
    patch: parts[2],
    raw: version,
  };
}

/**
 * Compare two semantic versions
 *
 * @param v1 - First version
 * @param v2 - Second version
 * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);

  if (parsed1.major !== parsed2.major) {
    return parsed1.major > parsed2.major ? 1 : -1;
  }

  if (parsed1.minor !== parsed2.minor) {
    return parsed1.minor > parsed2.minor ? 1 : -1;
  }

  if (parsed1.patch !== parsed2.patch) {
    return parsed1.patch > parsed2.patch ? 1 : -1;
  }

  return 0;
}

/**
 * Increment version based on change type
 *
 * @param version - Current version
 * @param changeType - Type of change (major, minor, patch)
 * @returns New version string
 */
export function incrementVersion(version: string, changeType: VersionChangeType): string {
  const parsed = parseVersion(version);

  switch (changeType) {
    case 'major':
      return `${parsed.major + 1}.0.0`;
    case 'minor':
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case 'patch':
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    default:
      throw new StandardError(
        ErrorCode.INVALID_INPUT,
        `Invalid version change type: ${changeType}`,
        { changeType, validTypes: ['major', 'minor', 'patch'] }
      );
  }
}

/**
 * Get the next version for a skill based on change type
 *
 * @param dbService - Database service instance
 * @param skillName - Name of the skill
 * @param changeType - Type of change (major, minor, patch)
 * @returns Next version string
 * @throws StandardError if skill not found or version conflict
 */
export async function getNextVersion(
  dbService: DatabaseService,
  skillName: string,
  changeType: VersionChangeType
): Promise<string> {
  logger.info('Getting next version for skill', { skillName, changeType });

  try {
    const adapter = dbService.getAdapter('sqlite');

    // Get current version from skills table
    const result = await adapter.query(
      'SELECT version FROM skills WHERE name = ? ORDER BY created_at DESC LIMIT 1',
      [skillName]
    );

    if (!result.rows || result.rows.length === 0) {
      // No existing version, start at 1.0.0
      logger.info('No existing version found, starting at 1.0.0', { skillName });
      return '1.0.0';
    }

    const currentVersion = result.rows[0].version as string;
    const nextVersion = incrementVersion(currentVersion, changeType);

    logger.info('Calculated next version', {
      skillName,
      currentVersion,
      nextVersion,
      changeType,
    });

    return nextVersion;
  } catch (error) {
    logger.error('Failed to get next version', error as Error, { skillName, changeType });
    throw new StandardError(
      ErrorCode.DB_QUERY_FAILED,
      `Failed to get next version for skill: ${skillName}`,
      { skillName, changeType },
      error as Error
    );
  }
}

/**
 * Check if version already exists for a skill
 *
 * @param dbService - Database service instance
 * @param skillName - Name of the skill
 * @param version - Version to check
 * @returns True if version exists
 */
export async function versionExists(
  dbService: DatabaseService,
  skillName: string,
  version: string
): Promise<boolean> {
  logger.debug('Checking if version exists', { skillName, version });

  try {
    const adapter = dbService.getAdapter('sqlite');

    const result = await adapter.query(
      'SELECT COUNT(*) as count FROM skills WHERE name = ? AND version = ?',
      [skillName, version]
    );

    const count = result.rows?.[0]?.count as number || 0;
    const exists = count > 0;

    logger.debug('Version existence check complete', { skillName, version, exists });
    return exists;
  } catch (error) {
    logger.error('Failed to check version existence', error as Error, { skillName, version });
    throw new StandardError(
      ErrorCode.DB_QUERY_FAILED,
      `Failed to check version existence for skill: ${skillName}`,
      { skillName, version },
      error as Error
    );
  }
}

/**
 * Get all versions for a skill, sorted by semantic version
 *
 * @param dbService - Database service instance
 * @param skillName - Name of the skill
 * @returns Array of version strings, sorted from oldest to newest
 */
export async function getSkillVersions(
  dbService: DatabaseService,
  skillName: string
): Promise<string[]> {
  logger.debug('Getting all versions for skill', { skillName });

  try {
    const adapter = dbService.getAdapter('sqlite');

    const result = await adapter.query(
      'SELECT version FROM skills WHERE name = ? ORDER BY created_at ASC',
      [skillName]
    );

    const versions = (result.rows || []).map(row => row.version as string);

    // Sort by semantic version
    versions.sort(compareVersions);

    logger.debug('Retrieved skill versions', { skillName, count: versions.length });
    return versions;
  } catch (error) {
    logger.error('Failed to get skill versions', error as Error, { skillName });
    throw new StandardError(
      ErrorCode.DB_QUERY_FAILED,
      `Failed to get versions for skill: ${skillName}`,
      { skillName },
      error as Error
    );
  }
}

/**
 * Get the latest version for a skill
 *
 * @param dbService - Database service instance
 * @param skillName - Name of the skill
 * @returns Latest version string, or null if no versions exist
 */
export async function getLatestVersion(
  dbService: DatabaseService,
  skillName: string
): Promise<string | null> {
  logger.debug('Getting latest version for skill', { skillName });

  try {
    const versions = await getSkillVersions(dbService, skillName);

    if (versions.length === 0) {
      logger.debug('No versions found for skill', { skillName });
      return null;
    }

    const latestVersion = versions[versions.length - 1];
    logger.debug('Retrieved latest version', { skillName, latestVersion });
    return latestVersion;
  } catch (error) {
    logger.error('Failed to get latest version', error as Error, { skillName });
    throw new StandardError(
      ErrorCode.DB_QUERY_FAILED,
      `Failed to get latest version for skill: ${skillName}`,
      { skillName },
      error as Error
    );
  }
}
