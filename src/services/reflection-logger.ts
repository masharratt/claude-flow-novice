/**
 * Reflection Logger Service
 * Task 5.3: ACE Reflection Persistence Standardization
 *
 * Manages reflection data flow: PostgreSQL → Redis (24h TTL) with automatic archival
 *
 * Performance targets:
 * - Write to Redis: <100ms
 * - Query spanning both: <200ms
 * - Archive to PostgreSQL: <500ms (background)
 */

import { DatabaseService } from '../lib/database-service.js';
import { StandardError, ErrorCode } from '../lib/errors.js';
import { logger } from '../lib/logging.js';

export interface Reflection {
  agent_id: string;
  task_id: string;
  reflection_type: 'confidence' | 'status' | 'progress' | 'error' | 'decision';
  confidence: number;
  payload: Record<string, any>;
  timestamp?: Date;
}

export interface ReflectionQuery {
  agent_id?: string;
  task_id?: string;
  reflection_type?: string;
  start_date?: Date;
  end_date?: Date;
  min_confidence?: number;
}

export interface ReflectionStats {
  total_count: number;
  average_confidence: number;
  min_confidence: number;
  max_confidence: number;
  by_type?: Record<string, number>;
}

const REDIS_TTL_SECONDS = 86400; // 24 hours
const ARCHIVE_THRESHOLD_SECONDS = 3600; // Archive when TTL < 1 hour

export class ReflectionLogger {
  private dbService: DatabaseService;
  private redisAvailable: boolean = true;
  private reflectionLossCount: number = 0;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  /**
   * Log a reflection to Redis with 24h TTL and PostgreSQL for persistence
   * Performance target: <100ms
   */
  async logReflection(reflection: Reflection): Promise<void> {
    const startTime = Date.now();

    // Validate reflection schema
    this.validateReflection(reflection);

    // Ensure timestamp is set
    const reflectionWithTimestamp: Reflection = {
      ...reflection,
      timestamp: reflection.timestamp || new Date(),
    };

    // Generate Redis key
    const redisKey = this.buildRedisKey(
      reflectionWithTimestamp.agent_id,
      reflectionWithTimestamp.timestamp!
    );

    // Serialize reflection
    const serialized = JSON.stringify(reflectionWithTimestamp);

    try {
      // Write to Redis with TTL
      const redisAdapter = this.dbService.getAdapter('redis');
      await redisAdapter.setex(redisKey, REDIS_TTL_SECONDS, serialized);

      logger.debug('Reflection logged to Redis', {
        agent_id: reflectionWithTimestamp.agent_id,
        task_id: reflectionWithTimestamp.task_id,
        key: redisKey,
        ttl: REDIS_TTL_SECONDS,
      });

      this.redisAvailable = true;
    } catch (error) {
      // Graceful degradation: Redis unavailable
      this.redisAvailable = false;
      this.reflectionLossCount++;

      logger.warn('Redis unavailable, falling back to PostgreSQL only', {
        error: error instanceof Error ? error.message : String(error),
        reflection_loss_count: this.reflectionLossCount,
      });
    }

    // Always write to PostgreSQL for long-term persistence
    try {
      await this.writeToPostgreSQL(reflectionWithTimestamp);
    } catch (error) {
      throw new StandardError(
        ErrorCode.DATABASE_ERROR,
        'Failed to persist reflection to PostgreSQL',
        { reflection, error: error instanceof Error ? error.message : String(error) }
      );
    }

    const duration = Date.now() - startTime;
    logger.debug('Reflection logged', {
      agent_id: reflectionWithTimestamp.agent_id,
      duration_ms: duration,
      redis_available: this.redisAvailable,
    });

    if (duration >= 100) {
      logger.warn('Reflection write exceeded performance target', {
        duration_ms: duration,
        target_ms: 100,
      });
    }
  }

  /**
   * Query reflections spanning both Redis (recent) and PostgreSQL (archived)
   * Performance target: <200ms
   */
  async queryReflections(query: ReflectionQuery): Promise<Reflection[]> {
    const startTime = Date.now();

    const results: Reflection[] = [];

    // Query Redis for recent reflections
    if (this.redisAvailable) {
      try {
        const redisResults = await this.queryRedis(query);
        results.push(...redisResults);
      } catch (error) {
        logger.warn('Redis query failed, using PostgreSQL only', {
          error: error instanceof Error ? error.message : String(error),
        });
        this.redisAvailable = false;
      }
    }

    // Query PostgreSQL for archived reflections
    try {
      const pgResults = await this.queryPostgreSQL(query);
      results.push(...pgResults);
    } catch (error) {
      logger.error('PostgreSQL query failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Remove duplicates (prefer Redis version for recent data)
    const uniqueResults = this.deduplicateResults(results);

    // Sort by timestamp descending
    uniqueResults.sort((a, b) => {
      const timeA = a.timestamp?.getTime() || 0;
      const timeB = b.timestamp?.getTime() || 0;
      return timeB - timeA;
    });

    const duration = Date.now() - startTime;
    logger.debug('Reflections queried', {
      count: uniqueResults.length,
      duration_ms: duration,
    });

    if (duration >= 200) {
      logger.warn('Reflection query exceeded performance target', {
        duration_ms: duration,
        target_ms: 200,
      });
    }

    return uniqueResults;
  }

  /**
   * Get aggregate statistics for reflections
   */
  async getReflectionStats(agentId?: string): Promise<ReflectionStats> {
    const query: ReflectionQuery = agentId ? { agent_id: agentId } : {};
    const reflections = await this.queryReflections(query);

    if (reflections.length === 0) {
      return {
        total_count: 0,
        average_confidence: 0,
        min_confidence: 0,
        max_confidence: 0,
      };
    }

    const confidences = reflections.map(r => r.confidence);
    const sum = confidences.reduce((a, b) => a + b, 0);

    const byType: Record<string, number> = {};
    reflections.forEach(r => {
      byType[r.reflection_type] = (byType[r.reflection_type] || 0) + 1;
    });

    return {
      total_count: reflections.length,
      average_confidence: sum / reflections.length,
      min_confidence: Math.min(...confidences),
      max_confidence: Math.max(...confidences),
      by_type: byType,
    };
  }

  /**
   * Archive reflections approaching TTL expiration to PostgreSQL
   * Runs as background task
   * Performance target: <500ms per reflection
   */
  async archiveExpiredReflections(): Promise<number> {
    if (!this.redisAvailable) {
      logger.debug('Redis unavailable, skipping archive check');
      return 0;
    }

    try {
      const redisAdapter = this.dbService.getAdapter('redis');

      // Get all reflection keys
      const keys = await redisAdapter.keys('reflection:*');

      let archivedCount = 0;

      for (const key of keys) {
        try {
          // Check TTL
          const ttl = await redisAdapter.ttl(key);

          // Archive if TTL is approaching expiration
          if (ttl > 0 && ttl < ARCHIVE_THRESHOLD_SECONDS) {
            const data = await redisAdapter.get(key);

            if (data) {
              const reflection: Reflection = JSON.parse(data);

              // Ensure it's in PostgreSQL (idempotent)
              await this.writeToPostgreSQL(reflection);

              archivedCount++;

              logger.debug('Reflection archived before expiration', {
                key,
                ttl,
                agent_id: reflection.agent_id,
              });
            }
          }
        } catch (error) {
          logger.error('Failed to archive reflection', {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return archivedCount;
    } catch (error) {
      logger.error('Archive scan failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Get reflection loss monitoring metrics
   */
  getMonitoringMetrics(): { redis_available: boolean; reflection_loss_count: number } {
    return {
      redis_available: this.redisAvailable,
      reflection_loss_count: this.reflectionLossCount,
    };
  }

  // ========== Private Methods ==========

  private validateReflection(reflection: Reflection): void {
    const errors: string[] = [];

    if (!reflection.agent_id || reflection.agent_id.trim() === '') {
      errors.push('agent_id is required and must not be empty');
    }

    if (!reflection.task_id || reflection.task_id.trim() === '') {
      errors.push('task_id is required and must not be empty');
    }

    if (!['confidence', 'status', 'progress', 'error', 'decision'].includes(reflection.reflection_type)) {
      errors.push('reflection_type must be one of: confidence, status, progress, error, decision');
    }

    if (typeof reflection.confidence !== 'number' || reflection.confidence < 0 || reflection.confidence > 1) {
      errors.push('confidence must be a number between 0 and 1');
    }

    if (!reflection.payload || typeof reflection.payload !== 'object') {
      errors.push('payload must be an object');
    }

    if (errors.length > 0) {
      throw new StandardError(
        ErrorCode.VALIDATION_ERROR,
        'Reflection validation failed',
        { errors, reflection }
      );
    }
  }

  private buildRedisKey(agentId: string, timestamp: Date): string {
    const isoTimestamp = timestamp.toISOString();
    return `reflection:${agentId}:${isoTimestamp}`;
  }

  private async writeToPostgreSQL(reflection: Reflection): Promise<void> {
    const pgAdapter = this.dbService.getAdapter('postgres');

    const query = `
      INSERT INTO reflections (
        agent_id,
        task_id,
        reflection_type,
        confidence,
        payload,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (agent_id, task_id, timestamp)
      DO UPDATE SET
        reflection_type = EXCLUDED.reflection_type,
        confidence = EXCLUDED.confidence,
        payload = EXCLUDED.payload
    `;

    const params = [
      reflection.agent_id,
      reflection.task_id,
      reflection.reflection_type,
      reflection.confidence,
      JSON.stringify(reflection.payload),
      reflection.timestamp || new Date(),
    ];

    await pgAdapter.execute(query, params);
  }

  private async queryRedis(query: ReflectionQuery): Promise<Reflection[]> {
    const redisAdapter = this.dbService.getAdapter('redis');

    // Build Redis key pattern
    let pattern = 'reflection:';

    if (query.agent_id) {
      pattern += `${query.agent_id}:`;
    } else {
      pattern += '*:';
    }

    pattern += '*';

    const keys = await redisAdapter.keys(pattern);

    const results: Reflection[] = [];

    for (const key of keys) {
      try {
        const data = await redisAdapter.get(key);

        if (data) {
          const reflection: Reflection = JSON.parse(data);

          // Apply filters
          if (this.matchesQuery(reflection, query)) {
            results.push(reflection);
          }
        }
      } catch (error) {
        logger.warn('Failed to parse Redis reflection', {
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private async queryPostgreSQL(query: ReflectionQuery): Promise<Reflection[]> {
    const pgAdapter = this.dbService.getAdapter('postgres');

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.agent_id) {
      conditions.push(`agent_id = $${paramIndex++}`);
      params.push(query.agent_id);
    }

    if (query.task_id) {
      conditions.push(`task_id = $${paramIndex++}`);
      params.push(query.task_id);
    }

    if (query.reflection_type) {
      conditions.push(`reflection_type = $${paramIndex++}`);
      params.push(query.reflection_type);
    }

    if (query.start_date) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(query.start_date);
    }

    if (query.end_date) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(query.end_date);
    }

    if (query.min_confidence !== undefined) {
      conditions.push(`confidence >= $${paramIndex++}`);
      params.push(query.min_confidence);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        agent_id,
        task_id,
        reflection_type,
        confidence,
        payload,
        timestamp
      FROM reflections
      ${whereClause}
      ORDER BY timestamp DESC
    `;

    const result = await pgAdapter.query(sql, params);

    return result.rows.map(row => ({
      agent_id: row.agent_id,
      task_id: row.task_id,
      reflection_type: row.reflection_type,
      confidence: row.confidence,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      timestamp: new Date(row.timestamp),
    }));
  }

  private matchesQuery(reflection: Reflection, query: ReflectionQuery): boolean {
    if (query.task_id && reflection.task_id !== query.task_id) {
      return false;
    }

    if (query.reflection_type && reflection.reflection_type !== query.reflection_type) {
      return false;
    }

    if (query.min_confidence !== undefined && reflection.confidence < query.min_confidence) {
      return false;
    }

    if (query.start_date && reflection.timestamp && reflection.timestamp < query.start_date) {
      return false;
    }

    if (query.end_date && reflection.timestamp && reflection.timestamp > query.end_date) {
      return false;
    }

    return true;
  }

  private deduplicateResults(results: Reflection[]): Reflection[] {
    const seen = new Map<string, Reflection>();

    for (const reflection of results) {
      const key = `${reflection.agent_id}:${reflection.task_id}:${reflection.timestamp?.toISOString()}`;

      if (!seen.has(key)) {
        seen.set(key, reflection);
      }
    }

    return Array.from(seen.values());
  }
}
