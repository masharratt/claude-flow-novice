/**
 * Redis Context Store - SEO Intelligence Integration Phase 1 Sprint 3
 *
 * @module planning/seo/lib/redis-context-store
 * @description Stores intelligence context and pattern applications in Redis
 *              for pipeline execution and learning capture
 */

import Redis from 'ioredis';
import { Pattern, PatternEvidence } from '../types';

/**
 * Redis Context Store configuration
 */
export interface RedisContextStoreConfig {
  /** Redis host */
  host?: string;

  /** Redis port */
  port?: number;

  /** Redis password */
  password?: string;

  /** Redis database number */
  db?: number;

  /** Key prefix for all stored data */
  keyPrefix?: string;

  /** Default TTL for context data (seconds) */
  defaultTtl?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Intelligence context data structure
 */
export interface IntelligenceContext {
  /** Task ID */
  taskId: string;

  /** Target keyword */
  targetKeyword: string;

  /** Loaded patterns for this context */
  patterns: Pattern[];

  /** Competitive intelligence data */
  competitive?: unknown[];

  /** SERP patterns */
  serpPatterns?: unknown[];

  /** Historical learnings */
  learnings?: unknown[];

  /** Context metadata */
  metadata: {
    loadedAt: Date;
    itemsLoaded: number;
    hasFreshData: boolean;
  };
}

/**
 * Pattern application record
 */
export interface PatternApplication {
  /** Application ID */
  applicationId: string;

  /** Task ID */
  taskId: string;

  /** Pattern ID applied */
  patternId: string;

  /** Pattern type */
  patternType: string;

  /** Pattern category */
  patternCategory: string;

  /** Application timestamp */
  appliedAt: Date;

  /** Outcome (if known) */
  outcome?: 'success' | 'failure';

  /** Performance metrics */
  metrics?: Record<string, number>;

  /** Notes about application */
  notes?: string;
}

/**
 * Redis Context Store implementation
 *
 * Responsibilities:
 * - Store intelligence context for pipeline execution
 * - Store pattern applications for learning capture
 * - Manage TTL for context data (24 hours)
 * - Integration with Intelligence Curator and Pattern Manager
 */
export class RedisContextStore {
  private redis: Redis;
  private keyPrefix: string;
  private defaultTtl: number;
  private verbose: boolean;

  constructor(config: RedisContextStoreConfig = {}) {
    this.redis = new Redis({
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password,
      db: config.db || 0,
    });

    this.keyPrefix = config.keyPrefix || 'seo';
    this.defaultTtl = config.defaultTtl || 86400; // 24 hours
    this.verbose = config.verbose ?? false;

    this.log('Redis Context Store initialized');
  }

  /**
   * Store intelligence context for a task
   *
   * @param context - Intelligence context to store
   * @param ttl - Optional custom TTL in seconds
   * @returns Whether storage succeeded
   */
  async storeContext(context: IntelligenceContext, ttl?: number): Promise<boolean> {
    const key = this.getContextKey(context.taskId);

    try {
      const data = JSON.stringify(context, (key, value) => {
        // Convert Date objects to ISO strings
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });

      const effectiveTtl = ttl ?? this.defaultTtl;
      await this.redis.setex(key, effectiveTtl, data);

      this.log(`Stored context for task ${context.taskId} (TTL: ${effectiveTtl}s)`);
      return true;
    } catch (error) {
      this.log(`Error storing context for task ${context.taskId}: ${error}`);
      return false;
    }
  }

  /**
   * Retrieve intelligence context for a task
   *
   * @param taskId - Task ID
   * @returns Intelligence context or null if not found
   */
  async getContext(taskId: string): Promise<IntelligenceContext | null> {
    const key = this.getContextKey(taskId);

    try {
      const data = await this.redis.get(key);
      if (!data) {
        this.log(`No context found for task ${taskId}`);
        return null;
      }

      const context = JSON.parse(data, (key, value) => {
        // Convert ISO strings back to Date objects
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
          return new Date(value);
        }
        return value;
      }) as IntelligenceContext;

      this.log(`Retrieved context for task ${taskId}`);
      return context;
    } catch (error) {
      this.log(`Error retrieving context for task ${taskId}: ${error}`);
      return null;
    }
  }

  /**
   * Delete intelligence context for a task
   *
   * @param taskId - Task ID
   * @returns Whether deletion succeeded
   */
  async deleteContext(taskId: string): Promise<boolean> {
    const key = this.getContextKey(taskId);

    try {
      await this.redis.del(key);
      this.log(`Deleted context for task ${taskId}`);
      return true;
    } catch (error) {
      this.log(`Error deleting context for task ${taskId}: ${error}`);
      return false;
    }
  }

  /**
   * Store pattern application record
   *
   * @param application - Pattern application record
   * @param ttl - Optional custom TTL in seconds
   * @returns Whether storage succeeded
   */
  async storePatternApplication(
    application: PatternApplication,
    ttl?: number
  ): Promise<boolean> {
    const key = this.getPatternApplicationKey(application.taskId, application.applicationId);

    try {
      const data = JSON.stringify(application, (key, value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });

      const effectiveTtl = ttl ?? this.defaultTtl;
      await this.redis.setex(key, effectiveTtl, data);

      // Also add to task's application index
      const indexKey = this.getPatternApplicationsIndexKey(application.taskId);
      await this.redis.sadd(indexKey, application.applicationId);
      await this.redis.expire(indexKey, effectiveTtl);

      this.log(
        `Stored pattern application ${application.applicationId} for task ${application.taskId}`
      );
      return true;
    } catch (error) {
      this.log(
        `Error storing pattern application ${application.applicationId}: ${error}`
      );
      return false;
    }
  }

  /**
   * Retrieve pattern application record
   *
   * @param taskId - Task ID
   * @param applicationId - Application ID
   * @returns Pattern application or null if not found
   */
  async getPatternApplication(
    taskId: string,
    applicationId: string
  ): Promise<PatternApplication | null> {
    const key = this.getPatternApplicationKey(taskId, applicationId);

    try {
      const data = await this.redis.get(key);
      if (!data) {
        this.log(`No pattern application found: ${applicationId}`);
        return null;
      }

      const application = JSON.parse(data, (key, value) => {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
          return new Date(value);
        }
        return value;
      }) as PatternApplication;

      this.log(`Retrieved pattern application ${applicationId}`);
      return application;
    } catch (error) {
      this.log(`Error retrieving pattern application ${applicationId}: ${error}`);
      return null;
    }
  }

  /**
   * Get all pattern applications for a task
   *
   * @param taskId - Task ID
   * @returns Array of pattern applications
   */
  async getPatternApplications(taskId: string): Promise<PatternApplication[]> {
    const indexKey = this.getPatternApplicationsIndexKey(taskId);

    try {
      const applicationIds = await this.redis.smembers(indexKey);
      if (applicationIds.length === 0) {
        this.log(`No pattern applications found for task ${taskId}`);
        return [];
      }

      const applications: PatternApplication[] = [];
      for (const applicationId of applicationIds) {
        const application = await this.getPatternApplication(taskId, applicationId);
        if (application) {
          applications.push(application);
        }
      }

      this.log(`Retrieved ${applications.length} pattern applications for task ${taskId}`);
      return applications;
    } catch (error) {
      this.log(`Error retrieving pattern applications for task ${taskId}: ${error}`);
      return [];
    }
  }

  /**
   * Update pattern application outcome
   *
   * @param taskId - Task ID
   * @param applicationId - Application ID
   * @param outcome - Outcome classification
   * @param metrics - Performance metrics (optional)
   * @returns Whether update succeeded
   */
  async updatePatternOutcome(
    taskId: string,
    applicationId: string,
    outcome: 'success' | 'failure',
    metrics?: Record<string, number>
  ): Promise<boolean> {
    const application = await this.getPatternApplication(taskId, applicationId);
    if (!application) {
      this.log(`Cannot update outcome: Application ${applicationId} not found`);
      return false;
    }

    application.outcome = outcome;
    if (metrics) {
      application.metrics = { ...application.metrics, ...metrics };
    }

    return this.storePatternApplication(application);
  }

  /**
   * Cache frequently accessed patterns
   *
   * @param patterns - Array of patterns to cache
   * @param ttl - Optional custom TTL in seconds (default: 1 hour)
   * @returns Whether caching succeeded
   */
  async cachePatterns(patterns: Pattern[], ttl?: number): Promise<boolean> {
    const key = this.getPatternCacheKey();

    try {
      const data = JSON.stringify(patterns, (key, value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });

      const effectiveTtl = ttl ?? 3600; // 1 hour for pattern cache
      await this.redis.setex(key, effectiveTtl, data);

      this.log(`Cached ${patterns.length} patterns (TTL: ${effectiveTtl}s)`);
      return true;
    } catch (error) {
      this.log(`Error caching patterns: ${error}`);
      return false;
    }
  }

  /**
   * Retrieve cached patterns
   *
   * @returns Array of cached patterns or null if not found
   */
  async getCachedPatterns(): Promise<Pattern[] | null> {
    const key = this.getPatternCacheKey();

    try {
      const data = await this.redis.get(key);
      if (!data) {
        this.log('No cached patterns found');
        return null;
      }

      const patterns = JSON.parse(data, (key, value) => {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
          return new Date(value);
        }
        return value;
      }) as Pattern[];

      this.log(`Retrieved ${patterns.length} cached patterns`);
      return patterns;
    } catch (error) {
      this.log(`Error retrieving cached patterns: ${error}`);
      return null;
    }
  }

  /**
   * Get TTL for a task's context
   *
   * @param taskId - Task ID
   * @returns TTL in seconds or -1 if key doesn't exist, -2 if no TTL
   */
  async getContextTtl(taskId: string): Promise<number> {
    const key = this.getContextKey(taskId);
    return this.redis.ttl(key);
  }

  /**
   * Extend TTL for a task's context
   *
   * @param taskId - Task ID
   * @param ttl - New TTL in seconds
   * @returns Whether extension succeeded
   */
  async extendContextTtl(taskId: string, ttl: number): Promise<boolean> {
    const key = this.getContextKey(taskId);

    try {
      await this.redis.expire(key, ttl);
      this.log(`Extended TTL for task ${taskId} to ${ttl}s`);
      return true;
    } catch (error) {
      this.log(`Error extending TTL for task ${taskId}: ${error}`);
      return false;
    }
  }

  /**
   * Clear all data for a task
   *
   * @param taskId - Task ID
   * @returns Number of keys deleted
   */
  async clearTaskData(taskId: string): Promise<number> {
    try {
      // Get all application IDs
      const indexKey = this.getPatternApplicationsIndexKey(taskId);
      const applicationIds = await this.redis.smembers(indexKey);

      // Build list of all keys to delete
      const keysToDelete = [
        this.getContextKey(taskId),
        indexKey,
        ...applicationIds.map((id) => this.getPatternApplicationKey(taskId, id)),
      ];

      // Delete all keys
      const deleted = await this.redis.del(...keysToDelete);
      this.log(`Cleared ${deleted} keys for task ${taskId}`);
      return deleted;
    } catch (error) {
      this.log(`Error clearing task data for ${taskId}: ${error}`);
      return 0;
    }
  }

  /**
   * Health check - verify Redis connection
   *
   * @returns Whether Redis is connected and responsive
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.log(`Health check failed: ${error}`);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.log('Redis connection closed');
  }

  /**
   * Generate context key for a task
   */
  private getContextKey(taskId: string): string {
    return `${this.keyPrefix}:context:${taskId}`;
  }

  /**
   * Generate pattern application key
   */
  private getPatternApplicationKey(taskId: string, applicationId: string): string {
    return `${this.keyPrefix}:patterns:${taskId}:${applicationId}`;
  }

  /**
   * Generate pattern applications index key
   */
  private getPatternApplicationsIndexKey(taskId: string): string {
    return `${this.keyPrefix}:patterns:${taskId}:index`;
  }

  /**
   * Generate pattern cache key
   */
  private getPatternCacheKey(): string {
    return `${this.keyPrefix}:patterns:cache`;
  }

  /**
   * Log message if verbose mode enabled
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(`[RedisContextStore] ${message}`);
    }
  }
}
