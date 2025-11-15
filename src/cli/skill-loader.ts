/**
 * Skill Loader
 *
 * High-performance skill loading system with LRU caching and hash-based validation.
 * Provides contextual skill selection for agent prompt building.
 *
 * Performance targets:
 * - Cold load: <1s
 * - Warm load: <100ms
 * - Cache TTL: 5 minutes
 *
 * @module skill-loader
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../lib/database-service';
import { createLogger, Logger } from '../lib/logging';
import { SkillsQueryBuilder, SkillRecord, BOOTSTRAP_SKILL_IDS } from '../db/skills-query';
import {
  SkillCacheValidator,
  CachedSkillEntry,
  ValidationResult,
} from './skill-cache-validator';

/**
 * Skill metadata with content
 */
export interface Skill {
  id: string;
  name: string;
  version: string;
  content: string;
  contentHash: string;
  namespace?: string;
  priority?: number;
  tags?: string[];
}

/**
 * Skill loader configuration options
 */
export interface SkillLoaderOptions {
  /** Agent type to load skills for */
  agentType: string;

  /** Optional task context keywords for contextual filtering */
  taskContext?: string[];

  /** Maximum number of skills to load (default: 20) */
  maxSkills?: number;

  /** Include bootstrap skills (default: true) */
  includeBootstrap?: boolean;

  /** CFN Loop phase for phase-specific skills */
  phase?: string;
}

/**
 * Load result with metadata
 */
export interface SkillLoadResult {
  skills: Skill[];
  loadTimeMs: number;
  cacheHitCount: number;
  cacheMissCount: number;
  cacheInvalidationCount: number;
  totalSkills: number;
  bootstrapCount: number;
}

/**
 * LRU Cache Entry
 */
interface LRUCacheEntry {
  data: CachedSkillEntry;
  lastAccessed: Date;
}

/**
 * Skill Loader
 *
 * Manages skill loading with LRU caching and hash-based validation.
 */
export class SkillLoader {
  private logger: Logger;
  private validator: SkillCacheValidator;
  private cache: Map<string, LRUCacheEntry>;
  private cacheMaxSize: number = 100;
  private cacheTTLMinutes: number = 5;
  private dbService?: DatabaseService;
  private skillsBasePath: string;

  constructor(
    dbService?: DatabaseService,
    logger?: Logger,
    skillsBasePath?: string
  ) {
    this.logger = logger ?? createLogger('skill-loader');
    this.dbService = dbService;
    this.validator = new SkillCacheValidator(this.logger, dbService);
    this.cache = new Map();
    this.skillsBasePath = skillsBasePath ?? path.join(process.cwd(), '.claude/skills');
  }

  /**
   * Load contextual skills for an agent
   *
   * Main entry point for skill loading with caching and validation.
   *
   * @param options - Skill loader options
   * @returns Load result with skills and metadata
   */
  async loadContextualSkills(options: SkillLoaderOptions): Promise<SkillLoadResult> {
    const startTime = Date.now();
    const {
      agentType,
      taskContext = [],
      maxSkills = 20,
      includeBootstrap = true,
      phase,
    } = options;

    this.logger.info('Loading contextual skills', {
      agentType,
      taskContext,
      maxSkills,
      includeBootstrap,
      phase,
    });

    const result: SkillLoadResult = {
      skills: [],
      loadTimeMs: 0,
      cacheHitCount: 0,
      cacheMissCount: 0,
      cacheInvalidationCount: 0,
      totalSkills: 0,
      bootstrapCount: 0,
    };

    try {
      // Validate cache integrity with bulk hash check (if database available)
      if (this.dbService && this.cache.size > 0) {
        const cachedEntries = Array.from(this.cache.values()).map((entry) => entry.data);
        const validation = await this.validator.validateCachedSkills(cachedEntries);

        if (!validation.isValid) {
          // Invalidate cache entries with hash mismatches
          for (const skillId of validation.invalidSkillIds) {
            this.cache.delete(skillId);
            result.cacheInvalidationCount++;
          }

          this.logger.warn('Cache invalidated due to hash mismatches', {
            invalidatedCount: validation.invalidCount,
            invalidSkillIds: validation.invalidSkillIds,
            validationDurationMs: validation.durationMs,
          });
        } else {
          this.logger.debug('Cache validation passed', {
            validCount: validation.validCount,
            validationDurationMs: validation.durationMs,
          });
        }
      }

      // Load bootstrap skills first (always included unless explicitly disabled)
      if (includeBootstrap) {
        const bootstrapSkills = await this.loadBootstrapSkills();
        result.skills.push(...bootstrapSkills);
        result.bootstrapCount = bootstrapSkills.length;
      }

      // Load agent-specific skills from database
      if (this.dbService) {
        const agentSkills = await this.loadAgentSkills(
          agentType,
          taskContext,
          phase,
          maxSkills - result.skills.length
        );

        // Track cache hits/misses from agent skill loading
        const { skills, cacheHits, cacheMisses } = agentSkills;
        result.skills.push(...skills);
        result.cacheHitCount = cacheHits;
        result.cacheMissCount = cacheMisses;
      } else {
        this.logger.warn('Database service not configured - loading bootstrap skills only');
      }

      result.totalSkills = result.skills.length;
      result.loadTimeMs = Date.now() - startTime;

      this.logger.info('Skills loaded successfully', {
        totalSkills: result.totalSkills,
        bootstrapSkills: result.bootstrapCount,
        agentSkills: result.totalSkills - result.bootstrapCount,
        cacheHits: result.cacheHitCount,
        cacheMisses: result.cacheMissCount,
        cacheInvalidations: result.cacheInvalidationCount,
        loadTimeMs: result.loadTimeMs,
      });

      // Log performance warning if exceeding targets
      if (result.loadTimeMs > 1000) {
        this.logger.warn('Skill loading exceeded 1s target', {
          loadTimeMs: result.loadTimeMs,
          target: 1000,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to load skills', error as Error, {
        agentType,
        taskContext,
      });

      throw new Error(`Skill loading failed: ${(error as Error).message}`);
    }
  }

  /**
   * Load bootstrap skills (always included)
   *
   * Bootstrap skills are loaded from static files without database dependency.
   */
  private async loadBootstrapSkills(): Promise<Skill[]> {
    const skills: Skill[] = [];

    for (const skillId of BOOTSTRAP_SKILL_IDS) {
      try {
        // Check cache first
        const cached = this.getCachedSkill(skillId);

        if (cached) {
          skills.push({
            id: cached.skillId,
            name: skillId,
            version: '1.0.0',
            content: cached.content,
            contentHash: cached.contentHash,
            namespace: 'cfn',
            priority: 10,
          });
          continue;
        }

        // Load from file
        const skillPath = path.join(this.skillsBasePath, skillId, 'SKILL.md');

        if (!fs.existsSync(skillPath)) {
          this.logger.warn('Bootstrap skill file not found', { skillId, skillPath });
          continue;
        }

        const content = await fs.promises.readFile(skillPath, 'utf-8');
        const contentHash = this.validator.computeHash(content);

        // Cache the skill
        this.setCachedSkill(skillId, content, contentHash);

        skills.push({
          id: skillId,
          name: skillId,
          version: '1.0.0',
          content,
          contentHash,
          namespace: 'cfn',
          priority: 10,
        });
      } catch (error) {
        this.logger.error('Failed to load bootstrap skill', error as Error, { skillId });
      }
    }

    return skills;
  }

  /**
   * Load agent-specific skills from database
   */
  private async loadAgentSkills(
    agentType: string,
    taskContext: string[],
    phase?: string,
    maxSkills?: number
  ): Promise<{ skills: Skill[]; cacheHits: number; cacheMisses: number }> {
    if (!this.dbService) {
      return { skills: [], cacheHits: 0, cacheMisses: 0 };
    }

    const skills: Skill[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    try {
      // Get SQLite adapter
      const sqlite = this.dbService.getAdapter('sqlite');

      // Build query
      const { sql, params } = SkillsQueryBuilder.getSkillsByAgentType(
        agentType,
        taskContext,
        phase
      );

      // Execute query
      const records = await sqlite.raw<SkillRecord[]>(sql, params);

      // Limit results if specified
      const limitedRecords = maxSkills ? records.slice(0, maxSkills) : records;

      // Load skill content for each record
      for (const record of limitedRecords) {
        try {
          const skill = await this.loadSkillContent(record);

          if (skill) {
            skills.push(skill);

            // Track cache hits
            if (this.cache.has(skill.id)) {
              cacheHits++;
            } else {
              cacheMisses++;
            }
          }
        } catch (error) {
          this.logger.error('Failed to load skill content', error as Error, {
            skillId: record.id,
          });
        }
      }

      return { skills, cacheHits, cacheMisses };
    } catch (error) {
      this.logger.error('Failed to load agent skills from database', error as Error, {
        agentType,
        taskContext,
      });

      return { skills: [], cacheHits: 0, cacheMisses: 0 };
    }
  }

  /**
   * Load skill content from file with caching and validation
   */
  private async loadSkillContent(record: SkillRecord): Promise<Skill | null> {
    // Check cache first
    const cached = this.getCachedSkill(record.id);

    if (cached) {
      // Validate cached entry against database hash
      const validation = this.validator.validateCachedEntry(
        cached,
        record.content_hash
      );

      if (validation.isValid) {
        // Update last accessed time
        this.updateCacheAccess(record.id);

        return {
          id: record.id,
          name: record.name,
          version: record.version,
          content: cached.content,
          contentHash: cached.contentHash,
          namespace: record.namespace,
          priority: record.priority,
          tags: record.tags ? record.tags.split(',') : [],
        };
      }

      // Cache invalid - remove it
      this.logger.debug('Cache invalidated', {
        skillId: record.id,
        reason: validation.reason,
      });
      this.cache.delete(record.id);
    }

    // Load from file
    const skillPath = path.isAbsolute(record.file_path)
      ? record.file_path
      : path.join(this.skillsBasePath, record.file_path);

    if (!fs.existsSync(skillPath)) {
      this.logger.error('Skill file not found', undefined, {
        skillId: record.id,
        filePath: skillPath,
      });
      return null;
    }

    const content = await fs.promises.readFile(skillPath, 'utf-8');

    // Validate file content hash
    const actualHash = this.validator.computeHash(content);

    if (actualHash !== record.content_hash) {
      this.logger.warn('Skill content hash mismatch', {
        skillId: record.id,
        expectedHash: record.content_hash,
        actualHash,
      });

      // Note: We still return the skill but log the discrepancy
      // In production, you might want to reject or update the database
    }

    // Cache the skill
    this.setCachedSkill(record.id, content, record.content_hash);

    return {
      id: record.id,
      name: record.name,
      version: record.version,
      content,
      contentHash: record.content_hash,
      namespace: record.namespace,
      priority: record.priority,
      tags: record.tags ? record.tags.split(',') : [],
    };
  }

  /**
   * Get cached skill if valid
   */
  private getCachedSkill(skillId: string): CachedSkillEntry | null {
    const entry = this.cache.get(skillId);

    if (!entry) {
      return null;
    }

    // Check TTL
    const now = new Date();
    if (now > entry.data.validUntil) {
      this.cache.delete(skillId);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached skill
   */
  private setCachedSkill(skillId: string, content: string, contentHash: string): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      this.evictOldestEntry();
    }

    const cacheEntry = this.validator.createCacheEntry(
      skillId,
      content,
      this.cacheTTLMinutes
    );

    // Override contentHash if provided (from database)
    if (contentHash) {
      cacheEntry.contentHash = contentHash;
    }

    this.cache.set(skillId, {
      data: cacheEntry,
      lastAccessed: new Date(),
    });
  }

  /**
   * Update cache access time for LRU tracking
   */
  private updateCacheAccess(skillId: string): void {
    const entry = this.cache.get(skillId);

    if (entry) {
      entry.lastAccessed = new Date();
    }
  }

  /**
   * Evict oldest cache entry (LRU)
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime: Date | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldestTime || entry.lastAccessed < oldestTime) {
        oldestKey = key;
        oldestTime = entry.lastAccessed;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug('Evicted LRU cache entry', { skillId: oldestKey });
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Skill cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    ttlMinutes: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      ttlMinutes: this.cacheTTLMinutes,
    };
  }

  /**
   * Validate all cached entries against database
   *
   * Useful for cache integrity checks and monitoring.
   *
   * @returns Validation result with invalidated skill IDs
   */
  async validateCache(): Promise<{
    isValid: boolean;
    invalidSkillIds: string[];
    validCount: number;
    invalidCount: number;
    durationMs: number;
  }> {
    if (!this.dbService) {
      this.logger.warn('Database service not configured - cannot validate cache');
      return {
        isValid: true,
        invalidSkillIds: [],
        validCount: 0,
        invalidCount: 0,
        durationMs: 0,
      };
    }

    const cachedEntries = Array.from(this.cache.values()).map((entry) => entry.data);
    const validation = await this.validator.validateCachedSkills(cachedEntries);

    // Automatically invalidate entries with hash mismatches
    if (!validation.isValid) {
      for (const skillId of validation.invalidSkillIds) {
        this.cache.delete(skillId);
      }

      this.logger.info('Cache validation found and removed stale entries', {
        invalidatedCount: validation.invalidCount,
        invalidSkillIds: validation.invalidSkillIds,
        durationMs: validation.durationMs,
      });
    }

    return validation;
  }

  /**
   * Preload skills into cache (warm up)
   */
  async preloadSkills(skillIds: string[]): Promise<void> {
    this.logger.info('Preloading skills', { count: skillIds.length });

    const promises = skillIds.map(async (skillId) => {
      try {
        const skillPath = path.join(this.skillsBasePath, skillId, 'SKILL.md');

        if (fs.existsSync(skillPath)) {
          const content = await fs.promises.readFile(skillPath, 'utf-8');
          const contentHash = this.validator.computeHash(content);
          this.setCachedSkill(skillId, content, contentHash);
        }
      } catch (error) {
        this.logger.error('Failed to preload skill', error as Error, { skillId });
      }
    });

    await Promise.all(promises);

    this.logger.info('Skill preload completed', {
      cachedCount: this.cache.size,
    });
  }
}

/**
 * Singleton instance for global use
 */
let globalLoader: SkillLoader | null = null;

/**
 * Get or create global skill loader instance
 *
 * @param dbService - Database service instance
 * @param logger - Optional logger instance
 * @returns Global loader instance
 */
export function getGlobalLoader(
  dbService?: DatabaseService,
  logger?: Logger
): SkillLoader {
  if (!globalLoader) {
    globalLoader = new SkillLoader(dbService, logger);
  }
  return globalLoader;
}

/**
 * Set global loader instance
 *
 * @param loader - Loader instance to use globally
 */
export function setGlobalLoader(loader: SkillLoader): void {
  globalLoader = loader;
}
