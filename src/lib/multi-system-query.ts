/**
 * Multi-System Query Engine
 *
 * Provides fluent interface for cross-database queries with priority-ordered execution.
 * Part of Task 3.3: Query Correlation Key Layer
 *
 * @example
 * ```typescript
 * const query = new MultiSystemQuery(dbService);
 * const results = await query
 *   .forTask('task-001')
 *   .includingEntities(['agent', 'skill', 'artifact'])
 *   .fromSystems(['redis', 'sqlite', 'postgres'])
 *   .withCache(true)
 *   .execute();
 * // Returns: { agents: [...], skills: [...], artifacts: [...] }
 * ```
 */

import { DatabaseService } from './database-service';
import {
  CorrelationKey,
  DatabaseError,
  DatabaseErrorCode,
  QueryFilter,
  QueryOptions,
} from './database-service/types';
import {
  buildCorrelationKey,
  buildWildcardPattern,
  getEntityTypes,
  WildcardPattern,
} from './database-service/correlation';
import { CorrelationCache } from './correlation-cache';
import { createLogger, Logger } from './logging';
import { createDatabaseError } from './database-service/errors';

/**
 * Database system type
 */
export type DatabaseSystem = 'redis' | 'sqlite' | 'postgres';

/**
 * Query execution priority
 */
export type ExecutionPriority = 'fastest' | 'balanced' | 'comprehensive';

/**
 * Multi-system query result
 */
export interface MultiSystemResult<T = any> {
  /** Correlation key used for query */
  correlationKey: string;
  /** Results from Redis */
  redis?: T[];
  /** Results from SQLite */
  sqlite?: T[];
  /** Results from PostgreSQL */
  postgres?: T[];
  /** Merged and deduplicated results */
  merged: T[];
  /** Query execution time in milliseconds */
  executionTime: number;
  /** Timestamp of query execution */
  timestamp: Date;
  /** Cache hit status */
  cacheHit?: boolean;
  /** Errors encountered during query */
  errors?: DatabaseError[];
}

/**
 * Query builder configuration
 */
export interface QueryBuilderConfig {
  /** Database service instance */
  dbService: DatabaseService;
  /** Correlation cache instance (optional) */
  cache?: CorrelationCache;
  /** Enable caching (default: false) */
  enableCache?: boolean;
  /** Default timeout in milliseconds (default: 2000) */
  defaultTimeout?: number;
  /** Logger instance (optional) */
  logger?: Logger;
}

/**
 * Multi-system query builder
 *
 * Provides fluent interface for building and executing cross-database queries.
 */
export class MultiSystemQuery {
  private dbService: DatabaseService;
  private cache?: CorrelationCache;
  private logger: Logger;

  // Query configuration
  private correlationKey?: CorrelationKey;
  private wildcardPattern?: WildcardPattern;
  private entities: string[] = [];
  private systems: DatabaseSystem[] = ['redis', 'sqlite', 'postgres'];
  private priority: ExecutionPriority = 'balanced';
  private useCache: boolean = false;
  private timeout: number = 2000; // 2 seconds
  private filters: QueryFilter[] = [];

  constructor(config: QueryBuilderConfig) {
    this.dbService = config.dbService;
    this.cache = config.cache;
    this.useCache = config.enableCache || false;
    this.timeout = config.defaultTimeout || 2000;
    this.logger = config.logger || createLogger('multi-system-query');
  }

  /**
   * Query for specific task
   *
   * @param taskId - Task ID to query
   * @returns Query builder (fluent)
   */
  forTask(taskId: string): this {
    this.correlationKey = {
      type: 'task',
      id: taskId,
    };
    return this;
  }

  /**
   * Query for specific agent
   *
   * @param agentId - Agent ID to query
   * @returns Query builder (fluent)
   */
  forAgent(agentId: string): this {
    this.correlationKey = {
      type: 'agent',
      id: agentId,
    };
    return this;
  }

  /**
   * Query for specific skill
   *
   * @param skillId - Skill ID to query
   * @returns Query builder (fluent)
   */
  forSkill(skillId: string): this {
    this.correlationKey = {
      type: 'skill',
      id: skillId,
    };
    return this;
  }

  /**
   * Query for specific execution
   *
   * @param executionId - Execution ID to query
   * @returns Query builder (fluent)
   */
  forExecution(executionId: string): this {
    this.correlationKey = {
      type: 'execution',
      id: executionId,
    };
    return this;
  }

  /**
   * Query with custom correlation key
   *
   * @param key - Correlation key
   * @returns Query builder (fluent)
   */
  withKey(key: CorrelationKey): this {
    this.correlationKey = key;
    return this;
  }

  /**
   * Query with wildcard pattern
   *
   * @param pattern - Wildcard pattern
   * @returns Query builder (fluent)
   */
  withPattern(pattern: WildcardPattern): this {
    this.wildcardPattern = pattern;
    return this;
  }

  /**
   * Include specific entity types
   *
   * @param entities - Entity types to include
   * @returns Query builder (fluent)
   */
  includingEntities(entities: string[]): this {
    this.entities = entities;
    return this;
  }

  /**
   * Query from specific database systems
   *
   * @param systems - Database systems to query
   * @returns Query builder (fluent)
   */
  fromSystems(systems: DatabaseSystem[]): this {
    this.systems = systems;
    return this;
  }

  /**
   * Set execution priority
   *
   * @param priority - Execution priority
   * @returns Query builder (fluent)
   */
  withPriority(priority: ExecutionPriority): this {
    this.priority = priority;
    return this;
  }

  /**
   * Enable or disable caching
   *
   * @param enabled - Enable cache
   * @returns Query builder (fluent)
   */
  withCache(enabled: boolean): this {
    this.useCache = enabled;
    return this;
  }

  /**
   * Set query timeout
   *
   * @param timeout - Timeout in milliseconds
   * @returns Query builder (fluent)
   */
  withTimeout(timeout: number): this {
    this.timeout = timeout;
    return this;
  }

  /**
   * Add query filter
   *
   * @param filter - Query filter
   * @returns Query builder (fluent)
   */
  addFilter(filter: QueryFilter): this {
    this.filters.push(filter);
    return this;
  }

  /**
   * Execute multi-system query
   *
   * @returns Multi-system query results
   */
  async execute<T = any>(): Promise<MultiSystemResult<T>> {
    const startTime = Date.now();

    // Validate query configuration
    this.validateQuery();

    // Build cache key
    const cacheKey = this.buildCacheKey();

    // Check cache first
    if (this.useCache && this.cache) {
      const cached = this.cache.get<MultiSystemResult<T>>(cacheKey);
      if (cached) {
        this.logger.debug('Cache hit', { cacheKey });
        return {
          ...cached,
          cacheHit: true,
        };
      }
    }

    // Execute query based on priority
    const result = await this.executeByPriority<T>();

    // Merge and deduplicate results
    result.merged = this.mergeResults(result);

    // Calculate execution time
    result.executionTime = Date.now() - startTime;
    result.timestamp = new Date();
    result.cacheHit = false;

    // Validate performance requirement (<2s)
    if (result.executionTime >= this.timeout) {
      this.logger.warn('Query exceeded timeout', {
        executionTime: result.executionTime,
        timeout: this.timeout,
      });
    }

    // Store in cache
    if (this.useCache && this.cache) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Execute query based on priority strategy
   */
  private async executeByPriority<T>(): Promise<MultiSystemResult<T>> {
    const result: MultiSystemResult<T> = {
      correlationKey: this.buildCorrelationKeyString(),
      merged: [],
      executionTime: 0,
      timestamp: new Date(),
      errors: [],
    };

    switch (this.priority) {
      case 'fastest':
        return this.executeFastest<T>(result);

      case 'balanced':
        return this.executeBalanced<T>(result);

      case 'comprehensive':
        return this.executeComprehensive<T>(result);

      default:
        return this.executeBalanced<T>(result);
    }
  }

  /**
   * Execute fastest strategy (stop on first result)
   */
  private async executeFastest<T>(result: MultiSystemResult<T>): Promise<MultiSystemResult<T>> {
    // Query in priority order: Redis → SQLite → PostgreSQL
    const orderedSystems = this.getOrderedSystems();

    for (const system of orderedSystems) {
      try {
        const data = await this.querySystem<T>(system);
        if (data && data.length > 0) {
          result[system] = data;
          return result; // Stop on first non-empty result
        }
      } catch (error) {
        this.logger.warn(`Query failed for ${system}`, { error });
        result.errors?.push(this.createError(system, error));
      }
    }

    return result;
  }

  /**
   * Execute balanced strategy (priority-ordered parallel)
   */
  private async executeBalanced<T>(result: MultiSystemResult<T>): Promise<MultiSystemResult<T>> {
    const orderedSystems = this.getOrderedSystems();
    const promises = orderedSystems.map(async (system) => {
      try {
        const data = await this.querySystem<T>(system);
        if (data && data.length > 0) {
          result[system] = data;
        }
      } catch (error) {
        this.logger.warn(`Query failed for ${system}`, { error });
        result.errors?.push(this.createError(system, error));
      }
    });

    await Promise.all(promises);
    return result;
  }

  /**
   * Execute comprehensive strategy (all systems in parallel)
   */
  private async executeComprehensive<T>(result: MultiSystemResult<T>): Promise<MultiSystemResult<T>> {
    const promises = this.systems.map(async (system) => {
      try {
        const data = await this.querySystem<T>(system);
        result[system] = data || [];
      } catch (error) {
        this.logger.warn(`Query failed for ${system}`, { error });
        result.errors?.push(this.createError(system, error));
        result[system] = [];
      }
    });

    await Promise.all(promises);
    return result;
  }

  /**
   * Query specific database system
   */
  private async querySystem<T>(system: DatabaseSystem): Promise<T[]> {
    const adapter = this.dbService.getAdapter(system);
    const results: T[] = [];

    // If wildcard pattern, use pattern matching
    if (this.wildcardPattern) {
      const pattern = buildWildcardPattern(this.wildcardPattern);
      // For Redis, use SCAN with pattern
      if (system === 'redis') {
        const keys = await this.scanRedisKeys(pattern);
        for (const key of keys) {
          const data = await adapter.get<T>(key);
          if (data) results.push(data);
        }
      } else {
        // For SQLite/PostgreSQL, use query with LIKE
        const data = await adapter.query<T>(`
          SELECT * FROM correlation_data WHERE key LIKE ?
        `, [pattern.replace('*', '%')]);
        results.push(...data);
      }
    } else if (this.correlationKey) {
      // Query specific entities for correlation key
      if (this.entities.length > 0) {
        for (const entity of this.entities) {
          const key = buildCorrelationKey({
            ...this.correlationKey,
            entity,
          });
          const data = await adapter.get<T>(key);
          if (data) results.push(data);
        }
      } else {
        // Query just the correlation key
        const key = buildCorrelationKey(this.correlationKey);
        const data = await adapter.get<T>(key);
        if (data) results.push(data);
      }
    }

    return results;
  }

  /**
   * Scan Redis keys with pattern
   */
  private async scanRedisKeys(pattern: string): Promise<string[]> {
    const adapter = this.dbService.getAdapter('redis');
    const keys: string[] = [];

    // Use SCAN command for efficient key iteration
    let cursor = '0';
    do {
      const result = await adapter.query<any>('SCAN', [cursor, 'MATCH', pattern, 'COUNT', '100']);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Merge results from multiple databases
   */
  private mergeResults<T>(result: MultiSystemResult<T>): T[] {
    const allResults: T[] = [];
    const seen = new Set<string>();

    // Merge in priority order: Redis → SQLite → PostgreSQL
    const orderedSystems = this.getOrderedSystems();

    for (const system of orderedSystems) {
      const systemResults = result[system];
      if (!systemResults) continue;

      for (const item of systemResults) {
        const key = this.getDeduplicationKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(item);
        }
      }
    }

    return allResults;
  }

  /**
   * Get deduplication key for result item
   */
  private getDeduplicationKey(item: any): string {
    if (item && typeof item === 'object') {
      // Try common ID fields
      if (item.id) return `id:${item.id}`;
      if (item._id) return `_id:${item._id}`;
      if (item.key) return `key:${item.key}`;
      // Fallback to JSON stringify
      return JSON.stringify(item);
    }
    return String(item);
  }

  /**
   * Get ordered systems based on priority
   */
  private getOrderedSystems(): DatabaseSystem[] {
    // Priority order: Redis (fastest) → SQLite → PostgreSQL
    const order: DatabaseSystem[] = ['redis', 'sqlite', 'postgres'];
    return order.filter(system => this.systems.includes(system));
  }

  /**
   * Validate query configuration
   */
  private validateQuery(): void {
    if (!this.correlationKey && !this.wildcardPattern) {
      throw createDatabaseError(
        DatabaseErrorCode.VALIDATION_FAILED,
        'Query must specify either correlationKey or wildcardPattern',
        undefined,
        { query: this }
      );
    }

    if (this.systems.length === 0) {
      throw createDatabaseError(
        DatabaseErrorCode.VALIDATION_FAILED,
        'Query must specify at least one database system',
        undefined,
        { query: this }
      );
    }
  }

  /**
   * Build cache key for query
   */
  private buildCacheKey(): string {
    const parts: string[] = ['msq']; // multi-system-query

    if (this.correlationKey) {
      parts.push(buildCorrelationKey(this.correlationKey));
    } else if (this.wildcardPattern) {
      parts.push(buildWildcardPattern(this.wildcardPattern));
    }

    if (this.entities.length > 0) {
      parts.push(`entities:${this.entities.join(',')}`);
    }

    parts.push(`systems:${this.systems.join(',')}`);
    parts.push(`priority:${this.priority}`);

    return parts.join(':');
  }

  /**
   * Build correlation key string
   */
  private buildCorrelationKeyString(): string {
    if (this.correlationKey) {
      return buildCorrelationKey(this.correlationKey);
    } else if (this.wildcardPattern) {
      return buildWildcardPattern(this.wildcardPattern);
    }
    return 'unknown';
  }

  /**
   * Create database error
   */
  private createError(system: DatabaseSystem, error: any): DatabaseError {
    return {
      code: DatabaseErrorCode.QUERY_FAILED,
      message: `Query failed for ${system}: ${error.message || error}`,
      originalError: error instanceof Error ? error : undefined,
      context: { system },
    };
  }
}

/**
 * Create multi-system query builder
 *
 * @param config - Query builder configuration
 * @returns Multi-system query builder instance
 */
export function createMultiSystemQuery(config: QueryBuilderConfig): MultiSystemQuery {
  return new MultiSystemQuery(config);
}
