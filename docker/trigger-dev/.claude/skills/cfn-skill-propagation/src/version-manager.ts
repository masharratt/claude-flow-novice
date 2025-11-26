/**
 * Version management utilities for Skill Propagation
 */

import type { VersionInfo, VersionChangeType, VersionComparisonResult } from './types';

export class VersionManager {
  /**
   * Parse a semantic version string into components
   */
  static parseVersion(version: string): VersionInfo {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match || match.length !== 4) {
      throw new Error(`Invalid version format: ${version}. Expected format: MAJOR.MINOR.PATCH`);
    }

    return {
      major: parseInt(match[1]!, 10),
      minor: parseInt(match[2]!, 10),
      patch: parseInt(match[3]!, 10),
    };
  }

  /**
   * Validate version format
   */
  static isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(version);
  }

  /**
   * Compare two versions and determine the change type
   */
  static compareVersions(currentVersion: string, newVersion: string): VersionChangeType {
    const current = this.parseVersion(currentVersion);
    const next = this.parseVersion(newVersion);

    if (next.major > current.major) {
      return 'major';
    }
    if (next.major < current.major) {
      return 'downgrade';
    }

    if (next.minor > current.minor) {
      return 'minor';
    }
    if (next.minor < current.minor) {
      return 'downgrade';
    }

    if (next.patch > current.patch) {
      return 'patch';
    }
    if (next.patch < current.patch) {
      return 'downgrade';
    }

    return 'same';
  }

  /**
   * Validate version increment matches expected change type
   */
  static validateVersionIncrement(
    currentVersion: string,
    newVersion: string,
    expectedChangeType: 'patch' | 'minor' | 'major'
  ): VersionComparisonResult {
    const actualChangeType = this.compareVersions(currentVersion, newVersion);

    const result: VersionComparisonResult = {
      changeType: actualChangeType,
      isValid: false,
    };

    switch (actualChangeType) {
      case 'same':
        return {
          ...result,
          isValid: false,
        };

      case 'downgrade':
        return {
          ...result,
          isValid: false,
        };

      case 'major':
      case 'minor':
      case 'patch':
        result.isValid = actualChangeType === expectedChangeType;
        return result;

      default:
        return {
          ...result,
          isValid: false,
        };
    }
  }

  /**
   * Get human-readable version change description
   */
  static getChangeDescription(changeType: VersionChangeType): string {
    const descriptions: Record<VersionChangeType, string> = {
      major: 'Breaking changes (incompatible API changes)',
      minor: 'New features added (backward compatible)',
      patch: 'Bug fix (no new features)',
      same: 'Version unchanged',
      downgrade: 'Version downgrade (not allowed)',
    };

    return descriptions[changeType];
  }
}
