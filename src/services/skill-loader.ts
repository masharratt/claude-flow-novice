/**
 * Skill Loader with Memory Budget
 *
 * High-performance skill loading system with:
 * - Lazy loading (metadata at startup, content on-demand)
 * - Memory budget enforcement (100MB default)
 * - LRU cache with eviction
 * - SHA-256 hash validation
 * - <2s startup for 500 skills
 * - <100ms cache hit, <500ms cache miss
 *
 * @module skill-loader
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { LRUSkillCache, CacheStatistics } from '../lib/skill-cache.js';
import { DatabaseService } from '../lib/database-service.js';
import { createLogger, Logger } from '../lib/logging.js';
import { StandardError } from '../lib/errors.js';

/**
 * Skill metadata (loaded at startup)
 */
export interface SkillMetadata {
  /** Skill ID */
  id: string;

  /** Skill file path (relative to skills base) */
  path: string;

  /** SHA-256 content hash */
  hash: string;

  /** File size in bytes */
  size: number;

  /** Last loaded timestamp */
  lastLoaded?: Date;

  /** Skill content (lazy loaded) */
  content?: SkillContent;
}

/**
 * Skill content (lazy loaded)
 */
export interface SkillContent {
  /** Full markdown content */
  markdown: string;

  /** Parsed frontmatter (optional) */
  frontmatter?: Record<string, any>;

  /** Skill title */
  title?: string;

  /** Skill description */
  description?: string;
}

/**
 * Skill with content loaded
 */
export interface LoadedSkill extends SkillMetadata {
  /** Skill content (always defined for loaded skill) */
  content: SkillContent;
}

/**
 * Loader metrics
 */
export interface LoaderMetrics {
  /** Total skills discovered (metadata loaded) */
  skillsLoaded: number;

  /** Skills with content loaded */
  skillContentLoaded: number;

  /** Current memory usage (bytes) */
  memoryUsageBytes: number;

  /** Cache hits */
  cacheHits: number;

  /** Cache misses */
  cacheMisses: number;

  /** Cache evictions */
  evictions: number;

  /** Hash mismatches detected */
  hashMismatches: number;

  /** Cache invalidations */
  cacheInvalidations: number;

  /** Cache hit rate (0-1) */
  cacheHitRate: number;
}

/**
 * Loader configuration
 */
export interface SkillLoaderConfig {
  /** Database service */
  dbService?: DatabaseService;

  /** Maximum memory budget (bytes) */
  maxMemoryBytes?: number;

  /** Skills base path */
  skillsBasePath?: string;

  /** Logger instance */
  logger?: Logger;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Skill Loader with memory budget and lazy loading
 */
export class SkillLoader {
  private cache: LRUSkillCache<SkillContent>;
  private metadata: Map<string, SkillMetadata>;
  private dbService?: DatabaseService;
  private skillsBasePath: string;
  private logger: Logger;
  private debug: boolean;
  private maxMemoryBytes: number;
  private initialized: boolean = false;

  // Loading locks (prevent duplicate loads)
  private loadingLocks: Map<string, Promise<LoadedSkill>> = new Map();

  // Metrics
  private metrics = {
    hashMismatches: 0,
    cacheInvalidations: 0,
  };

  constructor(config: SkillLoaderConfig) {
    this.dbService = config.dbService;
    this.maxMemoryBytes = config.maxMemoryBytes ?? 100 * 1024 * 1024; // 100MB default
    this.skillsBasePath = config.skillsBasePath ?? path.join(process.cwd(), '.claude/skills');
    this.logger = config.logger ?? createLogger('skill-loader');
    this.debug = config.debug ?? false;

    // Initialize metadata map
    this.metadata = new Map();

    // Initialize LRU cache
    this.cache = new LRUSkillCache<SkillContent>({
      maxMemoryBytes: this.maxMemoryBytes,
      logger: this.logger,
      debug: this.debug,
    });

    if (this.debug) {
      this.logger.info('SkillLoader initialized', {
        maxMemoryBytes: this.maxMemoryBytes,
        maxMemoryMB: (this.maxMemoryBytes / 1024 / 1024).toFixed(2),
        skillsBasePath: this.skillsBasePath,
      });
    }
  }

  /**
   * Initialize loader
   *
   * Scans skills directory and loads metadata (NOT content).
   * Fast: <2s for 500 skills.
   */
  async initialize(): Promise<void> {
    const startTime = Date.now();

    if (this.initialized) {
      this.logger.warn('SkillLoader already initialized');
      return;
    }

    this.logger.info('Initializing SkillLoader', { skillsBasePath: this.skillsBasePath });

    // Scan skills directory
    await this.scanSkillsDirectory();

    // Load metadata from database (if available)
    if (this.dbService) {
      await this.loadMetadataFromDatabase();
    }

    this.initialized = true;

    const initTime = Date.now() - startTime;
    this.logger.info('SkillLoader initialized', {
      skillsLoaded: this.metadata.size,
      initTimeMs: initTime,
    });

    if (initTime >= 2000) {
      this.logger.warn('Initialization time exceeded target', {
        initTimeMs: initTime,
        target: 2000,
      });
    }
  }

  /**
   * Load skill content
   *
   * Lazy loading: content loaded on-demand.
   * - Cache hit: <100ms
   * - Cache miss: <500ms (disk I/O + hash validation)
   *
   * @param skillId - Skill ID to load
   * @returns Loaded skill with content
   */
  async loadSkill(skillId: string): Promise<LoadedSkill> {
    const startTime = Date.now();

    if (!this.initialized) {
      throw new StandardError(
        'LOADER_NOT_INITIALIZED',
        'SkillLoader not initialized. Call initialize() first.'
      );
    }

    // Check if already loading (prevent duplicate loads)
    const existingLoad = this.loadingLocks.get(skillId);
    if (existingLoad) {
      if (this.debug) {
        this.logger.debug('Waiting for existing load', { skillId });
      }
      return existingLoad;
    }

    // Create loading promise
    const loadPromise = this.doLoadSkill(skillId, startTime);
    this.loadingLocks.set(skillId, loadPromise);

    try {
      const skill = await loadPromise;
      return skill;
    } finally {
      this.loadingLocks.delete(skillId);
    }
  }

  /**
   * Internal skill loading implementation
   */
  private async doLoadSkill(skillId: string, startTime: number): Promise<LoadedSkill> {
    // Get metadata
    const meta = this.metadata.get(skillId);
    if (!meta) {
      throw new StandardError(
        'SKILL_NOT_FOUND',
        `Skill not found: ${skillId}`,
        { skillId }
      );
    }

    // Check cache first
    const cached = this.cache.get(skillId);
    if (cached) {
      const loadTime = Date.now() - startTime;

      if (this.debug) {
        this.logger.debug('Cache hit', {
          skillId,
          loadTimeMs: loadTime,
        });
      }

      // Verify hash (detect file changes)
      const currentHash = await this.computeFileHash(meta.path);
      if (currentHash !== meta.hash) {
        // Hash mismatch - invalidate cache and reload
        this.metrics.hashMismatches++;
        this.metrics.cacheInvalidations++;
        this.cache.delete(skillId);

        if (this.debug) {
          this.logger.debug('Hash mismatch detected, reloading', {
            skillId,
            oldHash: meta.hash,
            newHash: currentHash,
          });
        }

        // Fall through to load from disk
      } else {
        // Cache hit with valid hash
        return {
          ...meta,
          content: cached,
        };
      }
    }

    // Cache miss - load from disk
    const content = await this.loadSkillFromDisk(meta);
    const loadTime = Date.now() - startTime;

    if (this.debug) {
      this.logger.debug('Cache miss, loaded from disk', {
        skillId,
        loadTimeMs: loadTime,
      });
    }

    if (loadTime >= 500) {
      this.logger.warn('Load time exceeded target', {
        skillId,
        loadTimeMs: loadTime,
        target: 500,
      });
    }

    // Update metadata with new hash (if changed)
    const currentHash = await this.computeFileHash(meta.path);
    if (currentHash !== meta.hash) {
      meta.hash = currentHash;
      this.metrics.hashMismatches++;

      // Update database
      if (this.dbService) {
        await this.updateMetadataInDatabase(meta);
      }
    }

    // Cache the content
    const contentSize = this.estimateContentSize(content);
    this.cache.set(skillId, content, contentSize);

    return {
      ...meta,
      content,
    };
  }

  /**
   * Load skill content from disk
   */
  private async loadSkillFromDisk(meta: SkillMetadata): Promise<SkillContent> {
    const skillPath = path.join(this.skillsBasePath, meta.path);

    try {
      const markdown = await fs.readFile(skillPath, 'utf-8');

      // Validate content
      if (!markdown || markdown.trim().length === 0) {
        throw new StandardError(
          'EMPTY_SKILL_FILE',
          `Empty skill file: ${meta.id}`,
          { skillId: meta.id, path: skillPath }
        );
      }

      // Check for corrupted content (null bytes, invalid characters)
      if (markdown.includes('\0') || /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(markdown)) {
        throw new StandardError(
          'CORRUPTED_SKILL_FILE',
          `Corrupted skill file (invalid characters): ${meta.id}`,
          { skillId: meta.id, path: skillPath }
        );
      }

      // Validate minimum content length (reasonable skill should be >50 chars)
      if (markdown.trim().length < 50) {
        throw new StandardError(
          'INVALID_SKILL_FILE',
          `Invalid skill file (too short): ${meta.id}`,
          { skillId: meta.id, path: skillPath, length: markdown.trim().length }
        );
      }

      // Parse frontmatter (simple implementation)
      const { frontmatter, content } = this.parseFrontmatter(markdown);

      return {
        markdown,
        frontmatter,
        title: frontmatter?.title ?? meta.id,
        description: frontmatter?.description,
      };
    } catch (error) {
      throw new StandardError(
        'SKILL_LOAD_ERROR',
        `Failed to load skill from disk: ${meta.id}`,
        { skillId: meta.id, path: skillPath, error: String(error) }
      );
    }
  }

  /**
   * Scan skills directory and load metadata
   */
  private async scanSkillsDirectory(): Promise<void> {
    try {
      const entries = await fs.readdir(this.skillsBasePath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillId = entry.name;
          const skillFile = path.join(this.skillsBasePath, skillId, 'SKILL.md');

          try {
            const stat = await fs.stat(skillFile);
            const hash = await this.computeFileHash(path.join(skillId, 'SKILL.md'));

            const metadata: SkillMetadata = {
              id: skillId,
              path: path.join(skillId, 'SKILL.md'),
              hash,
              size: stat.size,
            };

            this.metadata.set(skillId, metadata);
          } catch (error) {
            // Skip invalid skills
            if (this.debug) {
              this.logger.debug('Skipping invalid skill', {
                skillId,
                error: String(error),
              });
            }
          }
        }
      }
    } catch (error) {
      throw new StandardError(
        'SCAN_ERROR',
        'Failed to scan skills directory',
        { skillsBasePath: this.skillsBasePath, error: String(error) }
      );
    }
  }

  /**
   * Compute SHA-256 hash of file
   */
  private async computeFileHash(relativePath: string): Promise<string> {
    const fullPath = path.join(this.skillsBasePath, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Load metadata from database
   */
  private async loadMetadataFromDatabase(): Promise<void> {
    if (!this.dbService) {
      return;
    }

    try {
      const sqliteAdapter = this.dbService.getAdapter('sqlite');
      const rows = await sqliteAdapter.raw<any[]>(
        'SELECT id, path, hash, size, last_loaded FROM skill_metadata'
      );

      for (const row of rows) {
        const existing = this.metadata.get(row.id);
        if (existing) {
          // Update with database values
          existing.lastLoaded = row.last_loaded ? new Date(row.last_loaded) : undefined;
        }
      }
    } catch (error) {
      // Table might not exist yet
      if (this.debug) {
        this.logger.debug('Failed to load metadata from database', {
          error: String(error),
        });
      }
    }
  }

  /**
   * Update metadata in database
   */
  private async updateMetadataInDatabase(meta: SkillMetadata): Promise<void> {
    if (!this.dbService) {
      return;
    }

    try {
      const sqliteAdapter = this.dbService.getAdapter('sqlite');
      await sqliteAdapter.raw(
        `INSERT OR REPLACE INTO skill_metadata (id, path, hash, size, last_loaded)
         VALUES (?, ?, ?, ?, ?)`,
        [meta.id, meta.path, meta.hash, meta.size, new Date().toISOString()]
      );
    } catch (error) {
      if (this.debug) {
        this.logger.debug('Failed to update metadata in database', {
          skillId: meta.id,
          error: String(error),
        });
      }
    }
  }

  /**
   * Parse frontmatter from markdown
   */
  private parseFrontmatter(markdown: string): {
    frontmatter?: Record<string, any>;
    content: string;
  } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = markdown.match(frontmatterRegex);

    if (!match) {
      return { content: markdown };
    }

    const [, frontmatterText, content] = match;
    const frontmatter: Record<string, any> = {};

    // Simple YAML parser (key: value)
    const lines = frontmatterText.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        frontmatter[key] = value;
      }
    }

    return { frontmatter, content };
  }

  /**
   * Estimate content size in bytes
   */
  private estimateContentSize(content: SkillContent): number {
    // Rough estimate: markdown size + frontmatter overhead
    let size = Buffer.byteLength(content.markdown, 'utf-8');

    if (content.frontmatter) {
      size += JSON.stringify(content.frontmatter).length;
    }

    return size;
  }

  /**
   * Get loader metrics
   */
  getMetrics(): LoaderMetrics {
    const cacheStats = this.cache.getStatistics();
    const contentLoaded = this.cache.size;

    return {
      skillsLoaded: this.metadata.size,
      skillContentLoaded: contentLoaded,
      memoryUsageBytes: cacheStats.memoryUsageBytes,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      evictions: cacheStats.evictions,
      hashMismatches: this.metrics.hashMismatches,
      cacheInvalidations: this.metrics.cacheInvalidations,
      cacheHitRate: cacheStats.hitRate,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.cache.resetStatistics();
    this.metrics = {
      hashMismatches: 0,
      cacheInvalidations: 0,
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): CacheStatistics {
    return this.cache.getStatistics();
  }

  /**
   * Get loader configuration
   */
  getConfig(): { maxMemoryBytes: number; skillsBasePath: string } {
    return {
      maxMemoryBytes: this.maxMemoryBytes,
      skillsBasePath: this.skillsBasePath,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }
}
