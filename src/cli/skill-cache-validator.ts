/**
 * Skill Cache Validator
 *
 * Provides SHA256 hash-based validation for skill content integrity and cache invalidation.
 * Ensures cached skills remain synchronized with database content hashes.
 *
 * @module skill-cache-validator
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import { createLogger, Logger } from '../lib/logging.js';
import { DatabaseService } from '../lib/database-service.js';

/**
 * Cache validation result
 */
export interface ValidationResult {
  isValid: boolean;
  expectedHash: string;
  actualHash?: string;
  reason?: string;
}

/**
 * Skill content metadata for validation
 */
export interface SkillContentMetadata {
  skillId: string;
  content: string;
  filePath?: string;
  lastModified?: Date;
}

/**
 * Cache entry with validation metadata
 */
export interface CachedSkillEntry {
  skillId: string;
  content: string;
  contentHash: string;
  cachedAt: Date;
  validUntil: Date;
}

/**
 * Skill Cache Validator
 *
 * Validates skill content integrity using SHA256 hashing.
 * Supports both in-memory content and file-based validation.
 */
export class SkillCacheValidator {
  private logger: Logger;
  private hashAlgorithm: string = 'sha256';
  private dbService?: DatabaseService;

  constructor(logger?: Logger, dbService?: DatabaseService) {
    this.logger = logger ?? createLogger('skill-cache-validator');
    this.dbService = dbService;
  }

  /**
   * Compute SHA256 hash of skill content
   *
   * @param content - Skill content to hash
   * @returns SHA256 hash as hex string
   */
  computeHash(content: string): string {
    return crypto
      .createHash(this.hashAlgorithm)
      .update(content, 'utf8')
      .digest('hex');
  }

  /**
   * Compute SHA256 hash from file
   *
   * @param filePath - Path to skill file
   * @returns SHA256 hash as hex string
   */
  async computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(this.hashAlgorithm);
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Validate skill content against expected hash
   *
   * @param content - Skill content to validate
   * @param expectedHash - Expected SHA256 hash
   * @returns Validation result
   */
  validateContent(content: string, expectedHash: string): ValidationResult {
    const actualHash = this.computeHash(content);

    if (actualHash === expectedHash) {
      return {
        isValid: true,
        expectedHash,
        actualHash,
      };
    }

    this.logger.warn('Skill content hash mismatch', {
      expectedHash,
      actualHash,
    });

    return {
      isValid: false,
      expectedHash,
      actualHash,
      reason: 'Content hash mismatch - skill content has been modified',
    };
  }

  /**
   * Validate skill file against expected hash
   *
   * @param filePath - Path to skill file
   * @param expectedHash - Expected SHA256 hash
   * @returns Validation result
   */
  async validateFile(filePath: string, expectedHash: string): Promise<ValidationResult> {
    try {
      const actualHash = await this.computeFileHash(filePath);

      if (actualHash === expectedHash) {
        return {
          isValid: true,
          expectedHash,
          actualHash,
        };
      }

      this.logger.warn('Skill file hash mismatch', {
        filePath,
        expectedHash,
        actualHash,
      });

      return {
        isValid: false,
        expectedHash,
        actualHash,
        reason: `File hash mismatch - skill file has been modified: ${filePath}`,
      };
    } catch (error) {
      this.logger.error('Failed to validate skill file', error as Error, { filePath });

      return {
        isValid: false,
        expectedHash,
        reason: `Failed to read skill file: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Validate cached skill entry
   *
   * Checks both content hash and TTL expiration.
   *
   * @param cachedEntry - Cached skill entry to validate
   * @param expectedHash - Expected SHA256 hash from database
   * @returns Validation result
   */
  validateCachedEntry(
    cachedEntry: CachedSkillEntry,
    expectedHash: string
  ): ValidationResult {
    const now = new Date();

    // Check TTL expiration
    if (now > cachedEntry.validUntil) {
      return {
        isValid: false,
        expectedHash,
        actualHash: cachedEntry.contentHash,
        reason: 'Cache entry expired (TTL exceeded)',
      };
    }

    // Check content hash
    const actualHash = this.computeHash(cachedEntry.content);

    if (actualHash !== cachedEntry.contentHash) {
      this.logger.error('Cached entry content hash mismatch (cache corruption)', undefined, {
        skillId: cachedEntry.skillId,
        cachedHash: cachedEntry.contentHash,
        actualHash,
      });

      return {
        isValid: false,
        expectedHash,
        actualHash,
        reason: 'Cache corruption detected - cached hash does not match content',
      };
    }

    // Check against expected hash from database
    if (cachedEntry.contentHash !== expectedHash) {
      return {
        isValid: false,
        expectedHash,
        actualHash: cachedEntry.contentHash,
        reason: 'Database content hash updated - cache invalidated',
      };
    }

    return {
      isValid: true,
      expectedHash,
      actualHash: cachedEntry.contentHash,
    };
  }

  /**
   * Batch validate multiple skill contents
   *
   * @param skills - Array of skill metadata to validate
   * @returns Map of skillId to validation result
   */
  batchValidate(
    skills: Array<{ skillId: string; content: string; expectedHash: string }>
  ): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();
    const startTime = Date.now();

    for (const skill of skills) {
      results.set(
        skill.skillId,
        this.validateContent(skill.content, skill.expectedHash)
      );
    }

    const duration = Date.now() - startTime;
    this.logger.debug('Batch validation completed', {
      count: skills.length,
      durationMs: duration,
      avgMs: duration / skills.length,
    });

    return results;
  }

  /**
   * Generate cache key for skill
   *
   * @param skillId - Skill identifier
   * @param version - Skill version
   * @returns Cache key string
   */
  generateCacheKey(skillId: string, version: string): string {
    return `skill:${skillId}:${version}`;
  }

  /**
   * Check if cache entry should be invalidated based on file modification time
   *
   * @param filePath - Path to skill file
   * @param cachedAt - When the entry was cached
   * @returns True if file was modified after caching
   */
  async shouldInvalidateByFileTime(
    filePath: string,
    cachedAt: Date
  ): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.mtime > cachedAt;
    } catch (error) {
      this.logger.warn('Failed to check file modification time', {
        filePath,
        error: (error as Error).message,
      });
      // If we can't check the file, invalidate the cache to be safe
      return true;
    }
  }

  /**
   * Create cache entry with validation metadata
   *
   * @param skillId - Skill identifier
   * @param content - Skill content
   * @param ttlMinutes - Time-to-live in minutes (default: 5)
   * @returns Cached skill entry
   */
  createCacheEntry(
    skillId: string,
    content: string,
    ttlMinutes: number = 5
  ): CachedSkillEntry {
    const now = new Date();
    const validUntil = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    return {
      skillId,
      content,
      contentHash: this.computeHash(content),
      cachedAt: now,
      validUntil,
    };
  }

  /**
   * Verify batch of hashes match their content
   *
   * Used for bulk cache warming and validation.
   *
   * @param entries - Array of cached entries to verify
   * @returns Array of invalid skill IDs
   */
  verifyBatchIntegrity(entries: CachedSkillEntry[]): string[] {
    const invalidSkills: string[] = [];
    const startTime = Date.now();

    for (const entry of entries) {
      const actualHash = this.computeHash(entry.content);

      if (actualHash !== entry.contentHash) {
        invalidSkills.push(entry.skillId);
        this.logger.error('Cache integrity check failed', undefined, {
          skillId: entry.skillId,
          expectedHash: entry.contentHash,
          actualHash,
        });
      }
    }

    const duration = Date.now() - startTime;

    if (invalidSkills.length > 0) {
      this.logger.warn('Cache integrity check found corrupted entries', {
        totalChecked: entries.length,
        corruptedCount: invalidSkills.length,
        corruptedSkills: invalidSkills,
        durationMs: duration,
      });
    } else {
      this.logger.debug('Cache integrity check passed', {
        entriesChecked: entries.length,
        durationMs: duration,
      });
    }

    return invalidSkills;
  }

  /**
   * Query skill content hashes from database in bulk
   *
   * Optimized single query with WHERE IN clause for performance.
   * Performance target: <100ms for 100 skills
   *
   * @param skillIds - Array of skill IDs to query
   * @returns Map of skill ID to content hash
   */
  async querySkillHashes(skillIds: string[]): Promise<Map<string, string>> {
    if (!this.dbService) {
      this.logger.warn('Database service not configured - cannot query skill hashes');
      return new Map();
    }

    if (skillIds.length === 0) {
      return new Map();
    }

    const startTime = Date.now();
    const hashes = new Map<string, string>();

    try {
      // Get SQLite adapter
      const sqlite = this.dbService.getAdapter('sqlite');

      // Build bulk query with WHERE IN clause
      const placeholders = skillIds.map(() => '?').join(',');
      const sql = `
        SELECT id, content_hash
        FROM skills
        WHERE id IN (${placeholders})
      `;

      // Execute query
      const records = await sqlite.raw<Array<{ id: string; content_hash: string }>>(
        sql,
        skillIds
      );

      // Build hash map
      for (const record of records) {
        hashes.set(record.id, record.content_hash);
      }

      const duration = Date.now() - startTime;

      this.logger.debug('Bulk hash query completed', {
        skillCount: skillIds.length,
        foundCount: hashes.size,
        durationMs: duration,
        avgMs: duration / skillIds.length,
      });

      // Log performance warning if exceeding target
      if (duration > 100) {
        this.logger.warn('Bulk hash query exceeded 100ms target', {
          durationMs: duration,
          skillCount: skillIds.length,
          target: 100,
        });
      }

      return hashes;
    } catch (error) {
      this.logger.error('Failed to query skill hashes', error as Error, {
        skillIds,
      });

      return new Map();
    }
  }

  /**
   * Validate cached skills against database hashes in bulk
   *
   * Optimized for performance with single database query.
   * Performance target: <100ms for 100 skills
   *
   * @param cachedSkills - Array of cached skills to validate
   * @returns Bulk validation result with invalid skill IDs
   */
  async validateCachedSkills(
    cachedSkills: CachedSkillEntry[]
  ): Promise<{
    isValid: boolean;
    invalidSkillIds: string[];
    validCount: number;
    invalidCount: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    if (cachedSkills.length === 0) {
      return {
        isValid: true,
        invalidSkillIds: [],
        validCount: 0,
        invalidCount: 0,
        durationMs: 0,
      };
    }

    // Extract skill IDs
    const skillIds = cachedSkills.map((skill) => skill.skillId);

    // Bulk query current hashes from database (single query)
    const currentHashes = await this.querySkillHashes(skillIds);

    // Compare cached vs current hashes in parallel
    const invalidSkillIds: string[] = [];
    const comparisons = cachedSkills.map((skill) => {
      const currentHash = currentHashes.get(skill.skillId);

      if (!currentHash) {
        // Skill not found in database - consider invalid
        invalidSkillIds.push(skill.skillId);
        return false;
      }

      if (currentHash !== skill.contentHash) {
        // Hash mismatch - cache invalid
        invalidSkillIds.push(skill.skillId);
        this.logger.debug('Cache invalidated for skill', {
          skillId: skill.skillId,
          cachedHash: skill.contentHash,
          currentHash,
        });
        return false;
      }

      return true;
    });

    const validCount = comparisons.filter((match) => match === true).length;
    const invalidCount = invalidSkillIds.length;
    const isValid = invalidCount === 0;
    const durationMs = Date.now() - startTime;

    this.logger.debug('Bulk cache validation completed', {
      totalSkills: cachedSkills.length,
      validCount,
      invalidCount,
      durationMs,
      avgMs: durationMs / cachedSkills.length,
    });

    // Log performance warning if exceeding target
    if (durationMs > 100 && cachedSkills.length <= 100) {
      this.logger.warn('Bulk cache validation exceeded 100ms target', {
        durationMs,
        skillCount: cachedSkills.length,
        target: 100,
      });
    }

    return {
      isValid,
      invalidSkillIds,
      validCount,
      invalidCount,
      durationMs,
    };
  }
}

/**
 * Singleton instance for global use
 */
let globalValidator: SkillCacheValidator | null = null;

/**
 * Get or create global validator instance
 *
 * @param logger - Optional logger instance
 * @returns Global validator instance
 */
export function getGlobalValidator(logger?: Logger): SkillCacheValidator {
  if (!globalValidator) {
    globalValidator = new SkillCacheValidator(logger);
  }
  return globalValidator;
}

/**
 * Set global validator instance
 *
 * @param validator - Validator instance to use globally
 */
export function setGlobalValidator(validator: SkillCacheValidator): void {
  globalValidator = validator;
}
