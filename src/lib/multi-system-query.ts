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

import { DatabaseService } from './database-service.js';
import {
  CorrelationKey,
  DatabaseError,
  DatabaseErrorCode,
  QueryFilter,
  QueryOptions,
} from './database-service/types.js';
import {
  buildCorrelationKey,
  buildWildcardPattern,
  getEntityTypes,
  WildcardPattern,
} from './database-service/correlation.js';
import { CorrelationCache } from './correlation-cache.js';
import { createLogger, Logger } from './logging.js';
import { createDatabaseError } from './database-service/errors.js';
import {
  ErrorAggregator,
  createErrorAggregator,
  ErrorSeverity,
} from './error-aggregator.js';

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
  private errorAggregator?: ErrorAggregator;

  // Query configuration
  private correlationKey?: CorrelationKey;
  private wildcardPattern?: WildcardPattern;
  private entities: string[] = [];
  private systems: DatabaseSystem[] = ['redis', 'sqlite', 'postgres'];
  private priority: ExecutionPriority = 'balanced';
  private useCache: boolean = false;
  private timeout: number = 2000; // 2 seconds
  private filters: QueryFilter[] = [];
  private strictMode: boolean = false; // Fail operation if any system fails

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
   * Set whether to fail on partial errors
   *
   * @param fail - Fail if any system fails
   * @returns Query builder (fluent)
   */
  failOnPartialError(fail: boolean = true): this {
    this.strictMode = fail;
    return this;
  }

  /**
   * Execute multi-system query
   *
   * @returns Multi-system query results
   * @throws {DatabaseError} If all systems fail or critical error occurs
   */
  async execute<T = any>(): Promise<MultiSystemResult<T>> {
    const startTime = Date.now();

    // Validate query configuration
    this.validateQuery();

    // Initialize error aggregator with correlation ID
    this.errorAggregator = createErrorAggregator();
    const correlationId = this.errorAggregator.getCorrelationId();

    this.logger.info('Starting multi-system query', {
      correlationId,
      systems: this.systems,
      priority: this.priority,
    });

    // Build cache key
    const cacheKey = this.buildCacheKey();

    // Check cache first
    if (this.useCache && this.cache) {
      const cached = this.cache.get<MultiSystemResult<T>>(cacheKey);
      if (cached) {
        this.logger.debug('Cache hit', { cacheKey, correlationId });
        return {
          ...cached,
          cacheHit: true,
        };
      }
    }

    // Execute query based on priority
    let result: MultiSystemResult<T>;
    try {
      result = await this.executeByPriority<T>();
    } catch (error) {
      // Critical error during execution
      this.logger.error(
        'Critical error during query execution',
        error instanceof Error ? error : undefined,
        {
          correlationId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      );

      throw createDatabaseError(
        DatabaseErrorCode.QUERY_FAILED,
        'Multi-system query failed with critical error',
        error instanceof Error ? error : undefined,
        { correlationId, systems: this.systems }
      );
    }

    // Check if we should fail based on errors
    if (this.errorAggregator.shouldFailOperation(this.systems)) {
      const errorReport = this.errorAggregator.createReport();
      this.logger.error(
        'Multi-system query failed',
        undefined,
        {
          correlationId,
          errorReport,
        }
      );

      const aggregationResult = this.errorAggregator.getResult(this.systems);

      throw createDatabaseError(
        aggregationResult.hasCriticalErrors
          ? DatabaseErrorCode.QUERY_FAILED
          : DatabaseErrorCode.QUERY_FAILED,
        aggregationResult.allSystemsFailed
          ? 'All database systems failed'
          : 'Critical errors occurred during query execution',
        undefined,
        {
          correlationId,
          errorCount: aggregationResult.totalErrors,
          failedSystems: Object.keys(aggregationResult.errorsBySystem),
          errors: aggregationResult.allErrors.map(e => ({
            system: e.system,
            code: e.error.code,
            message: e.error.message,
            severity: e.severity,
          })),
        }
      );
    }

    // Check for partial errors
    if (this.strictMode && result.errors && result.errors.length > 0) {
      const errorReport = this.errorAggregator.createReport();
      this.logger.error(
        'Query failed due to partial errors',
        undefined,
        {
          correlationId,
          errorCount: result.errors.length,
          errorReport,
        }
      );

      throw createDatabaseError(
        DatabaseErrorCode.QUERY_FAILED,
        `Query failed with ${result.errors.length} error(s)`,
        undefined,
        {
          correlationId,
          errors: result.errors,
        }
      );
    }

    // Merge and deduplicate results
    result.merged = this.mergeResults(result);

    // Calculate execution time
    result.executionTime = Date.now() - startTime;
    result.timestamp = new Date();
    result.cacheHit = false;

    // Validate performance requirement (<2s)
    if (result.executionTime >= this.timeout) {
      this.logger.warn('Query exceeded timeout', {
        correlationId,
        executionTime: result.executionTime,
        timeout: this.timeout,
      });
    }

    // Log success
    this.logger.info('Multi-system query completed', {
      correlationId,
      executionTime: result.executionTime,
      resultCount: result.merged.length,
      errorCount: result.errors?.length || 0,
    });

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
    if (!this.errorAggregator) {
      throw new Error('Error aggregator not initialized');
    }

    // Query in priority order: Redis → SQLite → PostgreSQL
    const orderedSystems = this.getOrderedSystems();

    for (const system of orderedSystems) {
      // Check circuit breaker
      if (this.errorAggregator.isCircuitOpen(system)) {
        this.logger.warn(`Circuit breaker open for ${system}, skipping`, {
          correlationId: this.errorAggregator.getCorrelationId(),
        });
        const error = this.createError(system, new Error('Circuit breaker open'));
        result.errors?.push(error);
        this.errorAggregator.addError(system, error, { strategy: 'fastest' });
        continue;
      }

      try {
        const data = await this.querySystem<T>(system);
        this.errorAggregator.recordSuccess(system);

        if (data && data.length > 0) {
          result[system] = data;
          return result; // Stop on first non-empty result
        }
      } catch (error) {
        const dbError = this.createError(system, error);
        this.logger.warn(`Query failed for ${system}`, {
          error: dbError,
          correlationId: this.errorAggregator.getCorrelationId(),
        });
        result.errors?.push(dbError);
        this.errorAggregator.addError(system, dbError, { strategy: 'fastest' });
      }
    }

    return result;
  }

  /**
   * Execute balanced strategy (priority-ordered parallel)
   */
  private async executeBalanced<T>(result: MultiSystemResult<T>): Promise<MultiSystemResult<T>> {
    if (!this.errorAggregator) {
      throw new Error('Error aggregator not initialized');
    }

    const orderedSystems = this.getOrderedSystems();
    const promises = orderedSystems.map(async (system) => {
      // Check circuit breaker
      if (this.errorAggregator!.isCircuitOpen(system)) {
        this.logger.warn(`Circuit breaker open for ${system}, skipping`, {
          correlationId: this.errorAggregator!.getCorrelationId(),
        });
        const error = this.createError(system, new Error('Circuit breaker open'));
        result.errors?.push(error);
        this.errorAggregator!.addError(system, error, { strategy: 'balanced' });
        return;
      }

      try {
        const data = await this.querySystem<T>(system);
        this.errorAggregator!.recordSuccess(system);

        if (data && data.length > 0) {
          result[system] = data;
        }
      } catch (error) {
        const dbError = this.createError(system, error);
        this.logger.warn(`Query failed for ${system}`, {
          error: dbError,
          correlationId: this.errorAggregator!.getCorrelationId(),
        });
        result.errors?.push(dbError);
        this.errorAggregator!.addError(system, dbError, { strategy: 'balanced' });
      }
    });

    await Promise.all(promises);
    return result;
  }

  /**
   * Execute comprehensive strategy (all systems in parallel)
   */
  private async executeComprehensive<T>(result: MultiSystemResult<T>): Promise<MultiSystemResult<T>> {
    if (!this.errorAggregator) {
      throw new Error('Error aggregator not initialized');
    }

    const promises = this.systems.map(async (system) => {
      // Check circuit breaker
      if (this.errorAggregator!.isCircuitOpen(system)) {
        this.logger.warn(`Circuit breaker open for ${system}, skipping`, {
          correlationId: this.errorAggregator!.getCorrelationId(),
        });
        const error = this.createError(system, new Error('Circuit breaker open'));
        result.errors?.push(error);
        this.errorAggregator!.addError(system, error, { strategy: 'comprehensive' });
        result[system] = [];
        return;
      }

      try {
        const data = await this.querySystem<T>(system);
        this.errorAggregator!.recordSuccess(system);
        result[system] = data || [];
      } catch (error) {
        const dbError = this.createError(system, error);
        this.logger.warn(`Query failed for ${system}`, {
          error: dbError,
          correlationId: this.errorAggregator!.getCorrelationId(),
        });
        result.errors?.push(dbError);
        this.errorAggregator!.addError(system, dbError, { strategy: 'comprehensive' });
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
        // For SQLite/PostgreSQL, use raw query with LIKE
        const data = await adapter.raw<T>(
          'SELECT * FROM correlation_data WHERE key LIKE ?',
          [pattern.replace('*', '%')]
        );
        results.push(...(Array.isArray(data) ? data : []));
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
      const result = await adapter.raw<any>('SCAN', [cursor, 'MATCH', pattern, 'COUNT', '100']);
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
