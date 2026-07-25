/**
 * CFN Skill Loader
 * High-performance contextual skill loading with LRU caching and SHA256 validation
 */

import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import type { DatabaseService } from '../lib/database-service.js';
import type { Logger } from '../../lib/propagation/src/types.js';

export interface SkillLoadOptions {
  agentType: string;
  taskContext: string[];
  maxSkills?: number;
  includeBootstrap?: boolean;
  phase?: 'loop1' | 'loop2' | 'loop3';
  cacheKey?: string;
}

export interface SkillLoadResult {
  skills: Array<{
    name: string;
    content: string;
    metadata: SkillMetadata;
    hash: string;
  }>;
  totalSkills: number;
  loadTimeMs: number;
  cacheHitCount: number;
  cacheMissCount: number;
  skippedCount: number;
}

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  tags: string[];
  status: 'active' | 'deprecated' | 'experimental';
  namespace?: string;
  priority?: number;
  dependencies?: string[];
  agentTypes?: string[];
  phases?: string[];
  lastModified: string;
  contentHash?: string;
  size: number;
}

export interface CacheEntry {
  skill: any;
  hash: string;
  lastAccessed: number;
  loadCount: number;
}

export class SkillLoader {
  private cache = new Map<string, CacheEntry>();
  private readonly maxCacheSize = 100;
  private readonly skillsPath = '.claude/skills';

  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {}

  /**
   * Load skills based on agent type and task context
   */
  async loadContextualSkills(options: SkillLoadOptions): Promise<SkillLoadResult> {
    const startTime = Date.now();
    const result: SkillLoadResult = {
      skills: [],
      totalSkills: 0,
      loadTimeMs: 0,
      cacheHitCount: 0,
      cacheMissCount: 0,
      skippedCount: 0
    };

    try {
      // Get available skills from database
      const availableSkills = await this.db.getSkillsForAgent(options.agentType);
      result.totalSkills = availableSkills.length;

      // Filter and load relevant skills
      for (const skillMeta of availableSkills) {
        // Check relevance based on task context and phase
        if (!this.isSkillRelevant(skillMeta, options)) {
          result.skippedCount++;
          continue;
        }

        // Try cache first
        const cacheKey = `${skillMeta.name}:${skillMeta.version}`;
        const cached = this.cache.get(cacheKey);

        if (cached && this.validateSkillHash(skillMeta, cached.hash)) {
          result.skills.push(cached.skill);
          result.cacheHitCount++;
          this.updateCacheAccess(cacheKey);
        } else {
          // Load from disk
          const skill = await this.loadSkillFromDisk(skillMeta);
          if (skill) {
            result.skills.push(skill);
            result.cacheMissCount++;
            this.cache.set(cacheKey, {
              skill,
              hash: skill.hash,
              lastAccessed: Date.now(),
              loadCount: 1
            });
          }
        }

        // Respect maxSkills limit
        if (options.maxSkills && result.skills.length >= options.maxSkills) {
          break;
        }
      }

      // Clean up old cache entries
      this.cleanupCache();

      result.loadTimeMs = Date.now() - startTime;
      this.logger.debug(`Loaded ${result.skills.length} skills for ${options.agentType} in ${result.loadTimeMs}ms`);

      return result;
    } catch (error) {
      this.logger.error('Failed to load contextual skills', error as Error);
      throw error;
    }
  }

  /**
   * Load a specific skill by name
   */
  async loadSkillByName(skillName: string): Promise<any | null> {
    try {
      const skillMeta = await this.db.getSkillByName(skillName);
      if (!skillMeta) {
        return null;
      }

      const cacheKey = `${skillMeta.name}:${skillMeta.version}`;
      const cached = this.cache.get(cacheKey);

      if (cached && this.validateSkillHash(skillMeta, cached.hash)) {
        this.updateCacheAccess(cacheKey);
        return cached.skill;
      }

      const skill = await this.loadSkillFromDisk(skillMeta);
      if (skill) {
        this.cache.set(cacheKey, {
          skill,
          hash: skill.hash,
          lastAccessed: Date.now(),
          loadCount: 1
        });
      }

      return skill;
    } catch (error) {
      this.logger.error(`Failed to load skill: ${skillName}`, error as Error);
      return null;
    }
  }

  /**
   * Validate skill content integrity using SHA256 hash
   */
  validateSkillHash(metadata: SkillMetadata, expectedHash: string): boolean {
    try {
      if (!metadata.contentHash) {
        return false;
      }
      return metadata.contentHash === expectedHash;
    } catch (error) {
      this.logger.warn(`Hash validation failed for ${metadata.name}`, error as Error);
      return false;
    }
  }

  /**
   * Clear the skill cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Skill cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        loadCount: entry.loadCount,
        lastAccessed: entry.lastAccessed
      }))
    };
  }

  private isSkillRelevant(skill: SkillMetadata, options: SkillLoadOptions): boolean {
    // Check agent type compatibility
    if (skill.agentTypes && !skill.agentTypes.includes(options.agentType)) {
      return false;
    }

    // Check phase compatibility
    if (options.phase && skill.phases && !skill.phases.includes(options.phase)) {
      return false;
    }

    // Check task context relevance
    if (options.taskContext.length > 0 && skill.tags.length > 0) {
      const hasRelevantTag = skill.tags.some(tag =>
        options.taskContext.some(context =>
          context.toLowerCase().includes(tag.toLowerCase()) ||
          tag.toLowerCase().includes(context.toLowerCase())
        )
      );
      if (!hasRelevantTag) {
        return false;
      }
    }

    // Check status
    if (skill.status === 'deprecated' && !options.includeBootstrap) {
      return false;
    }

    return true;
  }

  private async loadSkillFromDisk(metadata: SkillMetadata): Promise<any | null> {
    try {
      const skillPath = this.findSkillPath(metadata.name);
      if (!skillPath || !existsSync(skillPath)) {
        this.logger.warn(`Skill file not found: ${metadata.name}`);
        return null;
      }

      const content = readFileSync(skillPath, 'utf8');
      const hash = this.calculateHash(content);

      // Extract skill content from markdown
      const skillContent = this.extractSkillContent(content);

      return {
        name: metadata.name,
        content: skillContent,
        metadata,
        hash
      };
    } catch (error) {
      this.logger.error(`Failed to load skill from disk: ${metadata.name}`, error as Error);
      return null;
    }
  }

  private findSkillPath(skillName: string): string | null {
    const possiblePaths = [
      join(this.skillsPath, skillName, 'SKILL.md'),
      join(this.skillsPath, `cfn-${skillName}`, 'SKILL.md'),
      join(this.skillsPath, skillName + '.md'),
      join(this.skillsPath, `cfn-${skillName}.md`)
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return null;
  }

  private extractSkillContent(markdownContent: string): string {
    // Remove frontmatter
    const withoutFrontmatter = markdownContent.replace(/^---\n.*?\n---\n/s, '');

    // Extract only the main content, remove metadata sections
    const lines = withoutFrontmatter.split('\n');
    const contentLines: string[] = [];
    let skipSection = false;

    for (const line of lines) {
      // Skip common metadata sections
      if (line.startsWith('## ') && (
        line.includes('Version History') ||
        line.includes('Dependencies') ||
        line.includes('Related Skills') ||
        line.includes('Tags')
      )) {
        skipSection = true;
        continue;
      }

      if (skipSection && line.startsWith('## ')) {
        skipSection = false;
      }

      if (!skipSection) {
        contentLines.push(line);
      }
    }

    return contentLines.join('\n').trim();
  }

  private calculateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private updateCacheAccess(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.loadCount++;
    }
  }

  private cleanupCache(): void {
    if (this.cache.size <= this.maxCacheSize) {
      return;
    }

    // Sort by last accessed time (LRU)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    // Remove oldest entries
    const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }

    this.logger.debug(`Cache cleanup: removed ${toRemove.length} entries`);
  }
}

// Global instance for convenience
let globalLoader: SkillLoader | null = null;

export function getGlobalLoader(db?: DatabaseService, logger?: Logger): SkillLoader {
  if (!globalLoader) {
    if (!db || !logger) {
      throw new Error('Database service and logger required for first-time initialization');
    }
    globalLoader = new SkillLoader(db, logger);
  }
  return globalLoader;
}

export function resetGlobalLoader(): void {
  globalLoader = null;
}