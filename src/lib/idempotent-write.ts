/**
 * Idempotent Write Utility
 *
 * Provides content-based deduplication for metrics logging using SHA256 hashing.
 * Part of Task 2.3: Unified Metrics and Execution Logging
 *
 * Features:
 * - Content-based idempotency keys (prevents duplicate metrics)
 * - TTL-based cleanup (24-hour retention)
 * - Atomic write tracking across databases
 */

import * as crypto from 'crypto';
import { IDatabaseAdapter, OperationResult } from './database-service/types.js';
import { createLogger } from './logging.js';

const logger = createLogger('idempotent-write');

/**
 * Execution metrics interface (must match ExecutionMetrics in metrics-logger.ts)
 */
export interface ExecutionMetrics {
  id?: string;
  timestamp: Date;
  agent_id: string;
  skill_id?: string;
  task_id: string;
  duration_ms: number;
  tokens_used: number;
  cost_usd: number;
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  error_message?: string;
  metadata?: Record<string, any>;
}

/**
 * Idempotency key record
 */
export interface IdempotencyKey {
  key: string;
  metrics_id?: string;
  written_at: Date;
  expires_at: Date;
}

/**
 * Default TTL for idempotency keys (24 hours)
 */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Create idempotency key from execution metrics
 *
 * Key is based on: agent_id + task_id + timestamp + duration_ms
 * This combination ensures uniqueness while allowing retries to be detected
 *
 * @param metrics - Execution metrics to create key from
 * @returns SHA256 hash as idempotency key
 */
export function createIdempotentKey(metrics: ExecutionMetrics): string {
  // Normalize timestamp to ISO string for consistent hashing
  const timestampStr = metrics.timestamp instanceof Date
    ? metrics.timestamp.toISOString()
    : new Date(metrics.timestamp).toISOString();

  // Build content string for hashing
  const content = [
    metrics.agent_id,
    metrics.task_id,
    timestampStr,
    metrics.duration_ms.toString(),
    metrics.status,
  ].join(':');

  // Generate SHA256 hash
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  logger.debug('Created idempotency key', {
    agent_id: metrics.agent_id,
    task_id: metrics.task_id,
    key: hash.substring(0, 16) + '...', // Log truncated key
  });

  return hash;
}

/**
 * Check if metrics have already been written
 *
 * @param key - Idempotency key to check
 * @param db - Database adapter
 * @returns True if already written, false otherwise
 */
export async function hasBeenWritten(
  key: string,
  db: IDatabaseAdapter
): Promise<boolean> {
  try {
    // Query idempotency_keys table
    const result = await db.get<IdempotencyKey>(`idempotency_keys:${key}`);

    if (!result) {
      logger.debug('Idempotency key not found', { key: key.substring(0, 16) + '...' });
      return false;
    }

    // Check if key has expired
    const expiresAt = new Date(result.expires_at);
    const now = new Date();

    if (expiresAt < now) {
      logger.debug('Idempotency key expired', {
        key: key.substring(0, 16) + '...',
        expired_at: expiresAt.toISOString(),
      });
      return false;
    }

    logger.debug('Idempotency key found', {
      key: key.substring(0, 16) + '...',
      written_at: result.written_at,
    });

    return true;
  } catch (error) {
    logger.error('Failed to check idempotency key', {
      key: key.substring(0, 16) + '...',
      error: error instanceof Error ? error.message : String(error),
    });

    // On error, assume not written to allow retry
    return false;
  }
}

/**
 * Mark metrics as written
 *
 * @param key - Idempotency key
 * @param db - Database adapter
 * @param metricsId - Optional metrics ID to link
 * @param ttlMs - Time-to-live in milliseconds (default: 24 hours)
 */
export async function markWritten(
  key: string,
  db: IDatabaseAdapter,
  metricsId?: string,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const idempotencyRecord: IdempotencyKey = {
      key,
      metrics_id: metricsId,
      written_at: now,
      expires_at: expiresAt,
    };

    // Insert into idempotency_keys table
    await db.insert('idempotency_keys', idempotencyRecord);

    logger.debug('Marked idempotency key as written', {
      key: key.substring(0, 16) + '...',
      metrics_id: metricsId,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error('Failed to mark idempotency key', {
      key: key.substring(0, 16) + '...',
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Batch check for written metrics
 *
 * @param keys - Array of idempotency keys
 * @param db - Database adapter
 * @returns Map of key -> boolean (written status)
 */
export async function batchCheckWritten(
  keys: string[],
  db: IDatabaseAdapter
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  try {
    // Check all keys in parallel
    const checks = keys.map(async (key) => {
      const written = await hasBeenWritten(key, db);
      return { key, written };
    });

    const checkResults = await Promise.all(checks);

    // Build result map
    checkResults.forEach(({ key, written }) => {
      results.set(key, written);
    });

    logger.debug('Batch idempotency check complete', {
      total_keys: keys.length,
      already_written: Array.from(results.values()).filter(v => v).length,
    });

    return results;
  } catch (error) {
    logger.error('Failed to batch check idempotency keys', {
      total_keys: keys.length,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Batch mark metrics as written
 *
 * @param entries - Array of { key, metricsId? } entries
 * @param db - Database adapter
 * @param ttlMs - Time-to-live in milliseconds (default: 24 hours)
 */
export async function batchMarkWritten(
  entries: Array<{ key: string; metricsId?: string }>,
  db: IDatabaseAdapter,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const records: IdempotencyKey[] = entries.map(({ key, metricsId }) => ({
      key,
      metrics_id: metricsId,
      written_at: now,
      expires_at: expiresAt,
    }));

    // Batch insert
    await db.insertMany('idempotency_keys', records);

    logger.debug('Batch marked idempotency keys as written', {
      total_keys: entries.length,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error('Failed to batch mark idempotency keys', {
      total_keys: entries.length,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Cleanup expired idempotency keys
 *
 * @param db - Database adapter
 * @returns Number of keys deleted
 */
export async function cleanupExpiredKeys(db: IDatabaseAdapter): Promise<number> {
  try {
    const now = new Date();

    // Query for expired keys
    const expiredKeys = await db.query<IdempotencyKey>('idempotency_keys', [
      {
        field: 'expires_at' as keyof IdempotencyKey,
        operator: 'lt',
        value: now,
      },
    ]);

    // Delete expired keys
    let deletedCount = 0;
    for (const key of expiredKeys) {
      await db.delete('idempotency_keys', key.key);
      deletedCount++;
    }

    logger.info('Cleaned up expired idempotency keys', {
      deleted_count: deletedCount,
    });

    return deletedCount;
  } catch (error) {
    logger.error('Failed to cleanup expired idempotency keys', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Validate cost accuracy (within $0.001 precision)
 *
 * @param cost - Cost value to validate
 * @returns True if cost is accurate to $0.001
 */
export function validateCostAccuracy(cost: number): boolean {
  const rounded = parseFloat(cost.toFixed(3));
  return Math.abs(cost - rounded) < 0.0001;
}

/**
 * Round cost to $0.001 precision
 *
 * Uses standard "round half up" behavior for consistent rounding.
 *
 * @param cost - Cost value to round
 * @returns Cost rounded to 3 decimal places
 */
export function roundCost(cost: number): number {
  // Use Math.round for proper "round half up" behavior
  // Multiply by 1000, round, then divide by 1000 for $0.001 precision
  return Math.round(cost * 1000) / 1000;
}
