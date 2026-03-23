/**
 * Context Lookup Helper - Phase 4 TypeScript Migration
 *
 * Retrieves and validates context from Redis for CFN Loop orchestration.
 * Handles task context lookup, iteration-specific retrieval, and broadcast context.
 *
 * Migrated from:
 * - .claude/skills/cfn-loop-orchestration/helpers/context-lookup.sh (359 LOC)
 *
 * Features:
 * - Single and batch context retrieval
 * - Iteration-specific lookup
 * - Context validation and completeness checking
 * - Graceful handling of missing context
 * - Broadcast context support
 * - Optional context caching
 *
 * @example
 * ```typescript
 * const lookup = new ContextLookup(redis, logger);
 *
 * // Retrieve task context
 * const context = await lookup.lookupContext('task-123');
 *
 * // Retrieve iteration-specific context
 * const iterContext = await lookup.lookupContext('task-123', 2);
 *
 * // Validate context structure
 * const isValid = await lookup.validateContextStructure(context);
 * ```
 */

import type { RedisCoordinator } from '../redis/redis-coordinator';
import type { Logger } from '../utils/logger';
import type {
  BroadcastContext,
  LoopPhase
} from './context-injector';

/**
 * Task ID type alias
 */
export type TaskId = string & { readonly __brand: 'TaskId' };

/**
 * Helper to create a branded TaskId
 */
export function taskId(value: string): TaskId {
  return value as TaskId;
}

/**
 * Context validation rules and schema
 */
interface ContextValidationRules {
  requiredFields: string[];
  optionalFields: string[];
  minIterations?: number;
  maxIterations?: number;
}

/**
 * Context lookup result with metadata
 */
export interface LookupResult<T = BroadcastContext> {
  context: T;
  found: boolean;
  cached: boolean;
  retrievedAt: string;
  source: 'redis' | 'cache' | 'computed';
}

/**
 * Batch lookup result
 */
export interface BatchLookupResult {
  taskId: TaskId;
  contexts: Map<string, BroadcastContext>;
  total: number;
  found: number;
  missing: string[];
  retrievedAt: string;
}

/**
 * Context Lookup Module
 *
 * Provides type-safe context retrieval from Redis with validation.
 * Supports caching for performance optimization.
 */
export class ContextLookup {
  private contextCache: Map<string, { context: BroadcastContext; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private redis: RedisCoordinator,
    private logger: Logger,
    private enableCache: boolean = true
  ) {}

  /**
   * Look up task context by task ID and optional iteration
   *
   * @param taskId Task identifier
   * @param iteration Optional iteration number
   * @returns LookupResult with context or empty result
   *
   * @throws Error if context retrieval fails
   */
  async lookupContext(
    taskId: TaskId | string,
    iteration?: number
  ): Promise<LookupResult> {
    const cacheKey = this.buildCacheKey(taskId, iteration);

    // Check cache first if enabled
    if (this.enableCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.logger.debug(`Context cache hit for ${cacheKey}`);
        return {
          context: cached,
          found: true,
          cached: true,
          retrievedAt: new Date().toISOString(),
          source: 'cache'
        };
      }
    }

    try {
      // Build Redis key
      const redisKey = iteration
        ? `cfn_loop:${taskId}:context:iteration:${iteration}`
        : `cfn_loop:${taskId}:context`;

      this.logger.debug(`Looking up context from Redis: ${redisKey}`);

      // Retrieve from Redis
      const rawContext = await this.redis.get(redisKey);

      if (!rawContext) {
        this.logger.warn(`Context not found: ${redisKey}`);
        return {
          context: {} as BroadcastContext,
          found: false,
          cached: false,
          retrievedAt: new Date().toISOString(),
          source: 'redis'
        };
      }

      // Parse and validate
      const context = JSON.parse(rawContext) as BroadcastContext;

      if (!this.validateContextStructure(context)) {
        this.logger.error(`Invalid context structure: ${redisKey}`);
        return {
          context: {} as BroadcastContext,
          found: false,
          cached: false,
          retrievedAt: new Date().toISOString(),
          source: 'redis'
        };
      }

      // Cache if enabled
      if (this.enableCache) {
        this.saveToCache(cacheKey, context);
      }

      return {
        context,
        found: true,
        cached: false,
        retrievedAt: new Date().toISOString(),
        source: 'redis'
      };
    } catch (error) {
      this.logger.error(`Context lookup failed for ${taskId}:`, error);
      throw new Error(`Failed to lookup context: ${String(error)}`);
    }
  }

  /**
   * Look up multiple contexts in batch
   *
   * @param taskIds Array of task identifiers
   * @returns BatchLookupResult with all found contexts
   */
  async lookupMultipleContexts(
    taskIds: (TaskId | string)[]
  ): Promise<BatchLookupResult> {
    const contexts: Map<string, BroadcastContext> = new Map();
    const missing: string[] = [];
    const retrievedAt = new Date().toISOString();

    this.logger.info(`Batch context lookup for ${taskIds.length} tasks`);

    for (const taskId of taskIds) {
      try {
        const result = await this.lookupContext(taskId);
        if (result.found) {
          contexts.set(String(taskId), result.context);
        } else {
          missing.push(String(taskId));
        }
      } catch (error) {
        this.logger.warn(`Failed to lookup context for ${taskId}:`, error);
        missing.push(String(taskId));
      }
    }

    return {
      taskId: taskIds[0] as TaskId,
      contexts,
      total: taskIds.length,
      found: contexts.size,
      missing,
      retrievedAt
    };
  }

  /**
   * Get the latest context for a task (most recent iteration)
   *
   * @param taskId Task identifier
   * @returns BroadcastContext or undefined if not found
   */
  async getLatestContext(taskId: TaskId | string): Promise<BroadcastContext | undefined> {
    try {
      const redisKey = `cfn_loop:${taskId}:context:latest`;
      const rawContext = await this.redis.get(redisKey);

      if (!rawContext) {
        this.logger.debug(`Latest context not found for ${taskId}`);
        return undefined;
      }

      const context = JSON.parse(rawContext) as BroadcastContext;

      if (!this.validateContextStructure(context)) {
        this.logger.error(`Invalid latest context for ${taskId}`);
        return undefined;
      }

      return context;
    } catch (error) {
      this.logger.error(`Failed to get latest context for ${taskId}:`, error);
      return undefined;
    }
  }

  /**
   * Validate context structure against required fields
   *
   * @param context Context object to validate
   * @returns true if context is valid, false otherwise
   */
  validateContextStructure(context: unknown): context is BroadcastContext {
    if (!context || typeof context !== 'object') {
      this.logger.warn('Context is not an object');
      return false;
    }

    const ctx = context as Record<string, unknown>;

    // Required fields for BroadcastContext
    const requiredFields: (keyof BroadcastContext)[] = [
      'taskId',
      'iteration',
      'phase',
      'mode',
      'timestamp',
      'contextVersion'
    ];

    for (const field of requiredFields) {
      if (!(field in ctx) || ctx[field] === undefined || ctx[field] === null) {
        this.logger.warn(`Missing required field: ${String(field)}`);
        return false;
      }
    }

    // Type validation
    if (typeof ctx.taskId !== 'string') {
      this.logger.warn('taskId must be a string');
      return false;
    }

    if (typeof ctx.iteration !== 'number' || ctx.iteration < 1) {
      this.logger.warn('iteration must be a positive number');
      return false;
    }

    const validPhases = ['loop3', 'loop2', 'product-owner', 'iteration-prep'];
    if (!validPhases.includes(String(ctx.phase))) {
      this.logger.warn(`Invalid phase: ${String(ctx.phase)}`);
      return false;
    }

    const validModes = ['task', 'cli', 'unknown'];
    if (!validModes.includes(String(ctx.mode))) {
      this.logger.warn(`Invalid mode: ${String(ctx.mode)}`);
      return false;
    }

    if (typeof ctx.timestamp !== 'string') {
      this.logger.warn('timestamp must be a string');
      return false;
    }

    if (typeof ctx.contextVersion !== 'string') {
      this.logger.warn('contextVersion must be a string');
      return false;
    }

    return true;
  }

  /**
   * Validate that context contains all expected fields
   * More lenient than validateContextStructure - allows optional fields
   *
   * @param context Context to validate
   * @param rules Validation rules (optional)
   * @returns true if context is complete, false otherwise
   */
  isContextComplete(
    context: BroadcastContext,
    rules?: ContextValidationRules
  ): boolean {
    const ctx = context as unknown as Record<string, unknown>;

    // Check required fields
    if (rules?.requiredFields) {
      for (const field of rules.requiredFields) {
        if (!(field in ctx) || ctx[field] === undefined) {
          this.logger.warn(`Missing required field: ${field}`);
          return false;
        }
      }
    }

    // Check optional fields if all are present
    if (rules?.optionalFields) {
      const missingOptional = rules.optionalFields.filter(
        (field) => !(field in ctx) || ctx[field] === undefined
      );

      if (missingOptional.length > 0) {
        this.logger.debug(`Missing optional fields: ${missingOptional.join(', ')}`);
      }
    }

    return true;
  }

  /**
   * Get context by phase within a task
   *
   * @param taskId Task identifier
   * @param phase Loop phase to retrieve
   * @returns BroadcastContext for that phase or undefined
   */
  async getContextByPhase(
    taskId: TaskId | string,
    phase: LoopPhase
  ): Promise<BroadcastContext | undefined> {
    try {
      const redisKey = `cfn_loop:${taskId}:context:phase:${phase}`;
      const rawContext = await this.redis.get(redisKey);

      if (!rawContext) {
        this.logger.debug(`Context not found for phase ${phase} in task ${taskId}`);
        return undefined;
      }

      const context = JSON.parse(rawContext) as BroadcastContext;

      if (!this.validateContextStructure(context)) {
        this.logger.error(`Invalid context for phase ${phase} in task ${taskId}`);
        return undefined;
      }

      return context;
    } catch (error) {
      this.logger.error(`Failed to get context by phase for ${taskId}:${phase}:`, error);
      return undefined;
    }
  }

  /**
   * Clear cache for a specific context or all cache
   *
   * @param taskId Optional task ID to clear specific cache
   * @param iteration Optional iteration to clear specific cache
   */
  clearCache(taskId?: TaskId | string, iteration?: number): void {
    if (taskId) {
      const cacheKey = this.buildCacheKey(taskId, iteration);
      this.contextCache.delete(cacheKey);
      this.logger.debug(`Cleared cache for ${cacheKey}`);
    } else {
      this.contextCache.clear();
      this.logger.debug('Cleared all context cache');
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Object with cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.contextCache.size,
      maxSize: 1000, // Reasonable default
      ttlMs: this.CACHE_TTL_MS
    };
  }

  /**
   * Build cache key from task ID and optional iteration
   * @private
   */
  private buildCacheKey(taskId: TaskId | string, iteration?: number): string {
    return iteration
      ? `${taskId}:iteration:${iteration}`
      : String(taskId);
  }

  /**
   * Get context from cache if still valid
   * @private
   */
  private getFromCache(key: string): BroadcastContext | undefined {
    const cached = this.contextCache.get(key);
    if (!cached) {
      return undefined;
    }

    const age = Date.now() - cached.timestamp;
    if (age > this.CACHE_TTL_MS) {
      this.contextCache.delete(key);
      return undefined;
    }

    return cached.context;
  }

  /**
   * Save context to cache
   * @private
   */
  private saveToCache(key: string, context: BroadcastContext): void {
    // Prevent cache bloat
    if (this.contextCache.size >= 1000) {
      const firstKey = this.contextCache.keys().next().value;
      if (firstKey) {
        this.contextCache.delete(firstKey);
      }
    }

    this.contextCache.set(key, {
      context,
      timestamp: Date.now()
    });
  }
}

/**
 * Factory function for creating a ContextLookup instance
 *
 * @param redis Redis coordinator instance
 * @param logger Logger instance
 * @param enableCache Enable context caching (default: true)
 * @returns ContextLookup instance
 */
export function createContextLookup(
  redis: RedisCoordinator,
  logger: Logger,
  enableCache: boolean = true
): ContextLookup {
  return new ContextLookup(redis, logger, enableCache);
}
