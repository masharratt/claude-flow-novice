/**
 * Pattern Sync Mechanism - SEO Intelligence Integration Phase 4 Sprint 2
 *
 * @module planning/seo/lib/pattern-sync
 * @description Implements bidirectional pattern synchronization between global and local stores
 *              with conflict resolution, version drift detection, and incremental sync support
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { Pattern, PatternLifecycle as PatternLifecycleType } from '../types';
import {
  promotePattern,
  detectSimilarPatterns,
  AnonymizedPattern,
  PromotionResult,
  PromotionOptions,
} from './pattern-promotion';
import { updateConfidenceFromOutcome } from './confidence-scoring';

/**
 * Pattern synchronization result
 */
export interface SyncResult {
  /** Success status */
  success: boolean;

  /** Sync direction performed */
  direction: 'pull' | 'push' | 'both';

  /** Sync mode used */
  mode: 'incremental' | 'full';

  /** Number of patterns synced */
  patternsSynced: number;

  /** Number of conflicts resolved */
  conflictsResolved: number;

  /** Patterns that failed to sync */
  failedPatterns: string[];

  /** Sync duration in milliseconds */
  durationMs: number;

  /** Sync timestamp */
  syncedAt: string;

  /** Error message if failed */
  error?: string;

  /** Detailed sync metrics */
  metrics: SyncMetrics;
}

/**
 * Sync metrics breakdown
 */
export interface SyncMetrics {
  /** Patterns pulled from global */
  pulled: number;

  /** Patterns pushed to global */
  pushed: number;

  /** Patterns merged during sync */
  merged: number;

  /** Patterns skipped (already up-to-date) */
  skipped: number;

  /** Conflicts detected */
  conflictsDetected: number;

  /** Conflicts auto-resolved */
  conflictsAutoResolved: number;

  /** Conflicts requiring manual resolution */
  conflictsManual: number;
}

/**
 * Pattern conflict detected during sync
 */
export interface PatternConflict {
  /** Conflict ID */
  conflictId: string;

  /** Local pattern */
  localPattern: Pattern;

  /** Global pattern */
  globalPattern: Pattern;

  /** Conflict type */
  type: 'version_drift' | 'confidence_mismatch' | 'data_divergence';

  /** Conflict severity */
  severity: 'low' | 'medium' | 'high';

  /** Auto-resolution available */
  autoResolvable: boolean;

  /** Recommended resolution strategy */
  recommendedStrategy: 'use_local' | 'use_global' | 'merge' | 'manual';

  /** Conflict detection timestamp */
  detectedAt: string;
}

/**
 * Version drift detection result
 */
export interface VersionDrift {
  /** Pattern ID */
  patternId: string;

  /** Local version */
  localVersion: string;

  /** Global version */
  globalVersion: string;

  /** Version difference magnitude */
  driftMagnitude: 'none' | 'minor' | 'major';

  /** Local pattern timestamp */
  localUpdatedAt: string;

  /** Global pattern timestamp */
  globalUpdatedAt: string;

  /** Time drift in milliseconds */
  timeDriftMs: number;

  /** Confidence difference */
  confidenceDrift: number;

  /** Drift detected timestamp */
  detectedAt: string;
}

/**
 * Pull options
 */
export interface PullOptions {
  /** Project ID for local store */
  projectId: string;

  /** Pattern types to sync (all if undefined) */
  patternTypes?: string[];

  /** Incremental sync (only changed patterns) */
  incremental?: boolean;

  /** Last sync timestamp for incremental mode */
  lastSyncTimestamp?: number;

  /** Overwrite local patterns with global (default: false) */
  forceOverwrite?: boolean;

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Push options
 */
export interface PushOptions {
  /** Project ID for local store */
  projectId: string;

  /** Pattern types to sync (all if undefined) */
  patternTypes?: string[];

  /** Force promotion even if ineligible */
  forcePromotion?: boolean;

  /** Authorization identity for force operations */
  authorizedBy?: string;

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Sync options
 */
export interface SyncOptions {
  /** Project ID for local store */
  projectId: string;

  /** Sync direction */
  direction: 'pull' | 'push' | 'both';

  /** Sync mode */
  mode: 'incremental' | 'full';

  /** Pattern types to sync (all if undefined) */
  patternTypes?: string[];

  /** Last sync timestamp for incremental mode */
  lastSyncTimestamp?: number;

  /** Force operations (overwrite/promotion) */
  force?: boolean;

  /** Authorization identity for force operations */
  authorizedBy?: string;

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Valid pattern types whitelist (Fix #3 - P1 Security Issue)
 */
const VALID_PATTERN_TYPES = new Set([
  'title-tags',
  'meta-descriptions',
  'hooks',
  'structure',
  'schema-markup',
  'internal-linking',
  'content-patterns',
  'technical-patterns',
  'link-patterns',
]);

/**
 * Validate and filter pattern types (Fix #3 - P1 Security Issue)
 * @param types - Pattern types to validate
 * @returns Validated pattern types
 */
function validatePatternTypes(types: string[]): string[] {
  const validated = types.filter((type) => VALID_PATTERN_TYPES.has(type));

  if (validated.length !== types.length) {
    const invalid = types.filter((type) => !VALID_PATTERN_TYPES.has(type));
    console.warn(`Invalid pattern types filtered: ${invalid.join(', ')}`);
  }

  return validated;
}

/**
 * Safe JSON parsing helper (Fix #1 - P1 Security Issue)
 * @param jsonString - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed object or fallback
 */
function safeJSONParse<T>(jsonString: string, fallback: T): T {
  try {
    const parsed = JSON.parse(jsonString);
    return parsed as T;
  } catch (error) {
    console.warn(
      `JSON parse error: ${error instanceof Error ? error.message : String(error)}, using fallback`
    );
    return fallback;
  }
}

/**
 * Scan Redis patterns using cursor (Fix #2 - P1 Security Issue)
 * Replaces blocking KEYS command with non-blocking SCAN
 *
 * @param redis - Redis client instance
 * @param pattern - Redis key pattern (e.g., "pattern:global:*")
 * @param count - Batch size hint for SCAN (default: 100)
 * @returns Async generator yielding matching keys
 */
async function* scanPatterns(
  redis: Redis,
  pattern: string,
  count: number = 100
): AsyncGenerator<string> {
  let cursor = 0;

  do {
    const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    const [nextCursor, keys] = result;

    cursor = parseInt(nextCursor as string, 10);

    for (const key of keys as string[]) {
      yield key;
    }
  } while (cursor !== 0);
}

/**
 * Validate pattern ID format (Fix #5 - CVSS 8.1 Log Injection Prevention)
 * @throws PatternSyncError if pattern ID is invalid
 */
function validatePatternId(patternId: string): void {
  if (!patternId || !/^[a-zA-Z0-9_-]+$/.test(patternId)) {
    throw new PatternSyncError(
      `Invalid pattern ID format: ${patternId}`,
      'INVALID_OPTIONS',
      { patternId, reason: 'Pattern ID must contain only alphanumeric characters, hyphens, and underscores' }
    );
  }
}

/**
 * Pattern Sync Error
 */
export class PatternSyncError extends Error {
  constructor(
    message: string,
    public code:
      | 'PULL_FAILED'
      | 'PUSH_FAILED'
      | 'CONFLICT_RESOLUTION_FAILED'
      | 'VERSION_DRIFT_FAILED'
      | 'INVALID_OPTIONS',
    public details?: unknown
  ) {
    super(message);
    this.name = 'PatternSyncError';
  }
}

/**
 * Pull patterns from global store to local store
 *
 * Process:
 * 1. Query global patterns by type/project
 * 2. Check local versions for drift
 * 3. Resolve conflicts (confidence-based)
 * 4. Update local store with merged patterns
 * 5. Track sync metadata
 *
 * @param options - Pull configuration
 * @param redis - Redis client instance
 * @param localStore - Local store key prefix
 * @param globalStore - Global store key prefix
 * @returns Pull result
 */
export async function pullPatternsFromGlobal(
  options: PullOptions,
  redis: Redis,
  localStore: string = 'pattern:local',
  globalStore: string = 'pattern:global'
): Promise<SyncResult> {
  const startTime = Date.now();
  const syncMetrics: SyncMetrics = {
    pulled: 0,
    pushed: 0,
    merged: 0,
    skipped: 0,
    conflictsDetected: 0,
    conflictsAutoResolved: 0,
    conflictsManual: 0,
  };
  const failedPatterns: string[] = [];

  // Fix #7 - Acquire distributed lock to prevent concurrent pull operations
  const lockKey = `sync:lock:${options.projectId}:pull`;
  const lockToken = randomUUID();
  const lockAcquired = await redis.set(lockKey, lockToken, 'EX', 60, 'NX');

  if (!lockAcquired) {
    throw new PatternSyncError(
      'Another pull sync is in progress for this project',
      'PULL_FAILED',
      { projectId: options.projectId, lockKey }
    );
  }

  try {
    // Input validation
    const VALID_PROJECT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
    if (!VALID_PROJECT_ID_REGEX.test(options.projectId)) {
      throw new PatternSyncError('Invalid project ID format', 'INVALID_OPTIONS');
    }

    // Fix #3 - Validate pattern types
    if (options.patternTypes && options.patternTypes.length > 0) {
      options.patternTypes = validatePatternTypes(options.patternTypes);
    }

    if (options.verbose) {
      console.log(`[PatternSync] Starting pull for project: ${options.projectId}`);
    }

    // Fix #2 - Use SCAN instead of blocking KEYS command
    const validKeys: string[] = [];
    for await (const key of scanPatterns(redis, `${globalStore}:*`)) {
      if (/^[a-zA-Z0-9:_-]+$/.test(key)) {
        validKeys.push(key);
      }
      // Optional: Limit batch size to prevent memory issues
      if (validKeys.length >= 10000) {
        console.warn(`[PatternSync] Pattern limit reached (10000), stopping scan`);
        break;
      }
    }

    if (options.verbose) {
      console.log(`[PatternSync] Found ${validKeys.length} global patterns`);
    }

    // Process each global pattern
    for (const globalKey of validKeys) {
      try {
        const globalPatternData = await redis.hgetall(globalKey);
        if (!globalPatternData || Object.keys(globalPatternData).length === 0) {
          continue;
        }

        const patternId = globalKey.replace(`${globalStore}:`, '');
        validatePatternId(patternId); // Fix #5 - Validate pattern ID

        // Filter by pattern type if specified
        if (
          options.patternTypes &&
          options.patternTypes.length > 0 &&
          !options.patternTypes.includes(globalPatternData.pattern_type || '')
        ) {
          continue;
        }

        // Incremental sync: check timestamp
        if (options.incremental && options.lastSyncTimestamp) {
          const globalUpdatedAt = new Date(globalPatternData.updated_at || 0).getTime();
          if (globalUpdatedAt <= options.lastSyncTimestamp) {
            syncMetrics.skipped++;
            continue;
          }
        }

        // Check if pattern exists locally
        const localKey = `${localStore}:${patternId}`;
        const localPatternData = await redis.hgetall(localKey);

        if (localPatternData && Object.keys(localPatternData).length > 0) {
          // Pattern exists - check for conflicts
          const conflict = await detectConflict(
            localPatternData,
            globalPatternData,
            patternId
          );

          if (conflict) {
            syncMetrics.conflictsDetected++;

            if (conflict.autoResolvable) {
              // Auto-resolve conflict
              const resolved = await resolveConflict(conflict);
              if (resolved) {
                await storePattern(redis, localKey, resolved);
                syncMetrics.conflictsAutoResolved++;
                syncMetrics.merged++;
              } else {
                failedPatterns.push(patternId);
                syncMetrics.conflictsManual++;
              }
            } else {
              // Manual resolution required
              syncMetrics.conflictsManual++;
              await trackConflict(redis, options.projectId, conflict);
              if (options.forceOverwrite) {
                await storePattern(redis, localKey, globalPatternData);
                syncMetrics.pulled++;
              } else {
                failedPatterns.push(patternId);
              }
            }
          } else {
            // No conflict - update local
            await storePattern(redis, localKey, globalPatternData);
            syncMetrics.pulled++;
          }
        } else {
          // New pattern - pull to local
          await storePattern(redis, localKey, globalPatternData);
          syncMetrics.pulled++;
        }
      } catch (error) {
        const patternId = globalKey.replace(`${globalStore}:`, '');
        try {
          validatePatternId(patternId); // Fix #5 - Validate even in error path
        } catch (validationError) {
          // Skip invalid pattern IDs in error reporting
          continue;
        }
        failedPatterns.push(patternId);
        if (options.verbose) {
          console.error(`[PatternSync] Failed to pull pattern ${patternId}:`, error);
        }
      }
    }

    // Update sync metadata
    await updateSyncMetadata(redis, options.projectId, {
      last_pull: new Date().toISOString(),
      patterns_pulled: syncMetrics.pulled,
      conflicts_resolved: syncMetrics.conflictsAutoResolved,
    });

    const durationMs = Date.now() - startTime;

    return {
      success: failedPatterns.length === 0,
      direction: 'pull',
      mode: options.incremental ? 'incremental' : 'full',
      patternsSynced: syncMetrics.pulled + syncMetrics.merged,
      conflictsResolved: syncMetrics.conflictsAutoResolved,
      failedPatterns,
      durationMs,
      syncedAt: new Date().toISOString(),
      metrics: syncMetrics,
    };
  } catch (error) {
    throw new PatternSyncError(
      `Pull operation failed: ${error instanceof Error ? error.message : String(error)}`,
      'PULL_FAILED',
      error
    );
  } finally {
    // Fix #7 - Release distributed lock
    const currentToken = await redis.get(lockKey);
    if (currentToken === lockToken) {
      await redis.del(lockKey);
    }
  }
}

/**
 * Push patterns from local store to global store
 *
 * Uses P4-S1 promotion protocol for eligibility checking
 *
 * @param options - Push configuration
 * @param redis - Redis client instance
 * @param localStore - Local store key prefix
 * @param globalStore - Global store key prefix
 * @returns Push result
 */
export async function pushPatternsToGlobal(
  options: PushOptions,
  redis: Redis,
  localStore: string = 'pattern:local',
  globalStore: string = 'pattern:global'
): Promise<SyncResult> {
  const startTime = Date.now();
  const syncMetrics: SyncMetrics = {
    pulled: 0,
    pushed: 0,
    merged: 0,
    skipped: 0,
    conflictsDetected: 0,
    conflictsAutoResolved: 0,
    conflictsManual: 0,
  };
  const failedPatterns: string[] = [];

  // Fix #7 - Acquire distributed lock to prevent concurrent push operations
  const lockKey = `sync:lock:${options.projectId}:push`;
  const lockToken = randomUUID();
  const lockAcquired = await redis.set(lockKey, lockToken, 'EX', 60, 'NX');

  if (!lockAcquired) {
    throw new PatternSyncError(
      'Another push sync is in progress for this project',
      'PUSH_FAILED',
      { projectId: options.projectId, lockKey }
    );
  }

  try {
    // Input validation
    const VALID_PROJECT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
    if (!VALID_PROJECT_ID_REGEX.test(options.projectId)) {
      throw new PatternSyncError('Invalid project ID format', 'INVALID_OPTIONS');
    }

    if (options.forcePromotion && !options.authorizedBy) {
      throw new PatternSyncError(
        'Force promotion requires authorizedBy field',
        'INVALID_OPTIONS'
      );
    }

    // Fix #3 - Validate pattern types
    if (options.patternTypes && options.patternTypes.length > 0) {
      options.patternTypes = validatePatternTypes(options.patternTypes);
    }

    if (options.verbose) {
      console.log(`[PatternSync] Starting push for project: ${options.projectId}`);
    }

    // Fix #2 - Use SCAN instead of blocking KEYS command
    const validKeys: string[] = [];
    for await (const key of scanPatterns(redis, `${localStore}:*`)) {
      if (/^[a-zA-Z0-9:_-]+$/.test(key)) {
        validKeys.push(key);
      }
      // Optional: Limit batch size to prevent memory issues
      if (validKeys.length >= 10000) {
        console.warn(`[PatternSync] Pattern limit reached (10000), stopping scan`);
        break;
      }
    }

    if (options.verbose) {
      console.log(`[PatternSync] Found ${validKeys.length} local patterns`);
    }

    // Process each local pattern
    for (const localKey of validKeys) {
      try {
        const localPatternData = await redis.hgetall(localKey);
        if (!localPatternData || Object.keys(localPatternData).length === 0) {
          continue;
        }

        const patternId = localKey.replace(`${localStore}:`, '');
        validatePatternId(patternId); // Fix #5 - Validate pattern ID

        // Filter by pattern type if specified
        if (
          options.patternTypes &&
          options.patternTypes.length > 0 &&
          !options.patternTypes.includes(localPatternData.pattern_type || '')
        ) {
          continue;
        }

        // Use P4-S1 promotion protocol
        const promotionOptions: PromotionOptions = {
          force: options.forcePromotion,
          authorizedBy: options.authorizedBy,
          verbose: options.verbose,
          mergeIfSimilar: true,
        };

        const promotionResult = await promotePattern(
          patternId,
          redis,
          localStore,
          globalStore,
          promotionOptions
        );

        if (promotionResult.success) {
          if (promotionResult.action === 'created') {
            syncMetrics.pushed++;
          } else if (promotionResult.action === 'merged') {
            syncMetrics.merged++;
          } else if (promotionResult.action === 'skipped') {
            syncMetrics.skipped++;
          }
        } else {
          failedPatterns.push(patternId);
        }
      } catch (error) {
        const patternId = localKey.replace(`${localStore}:`, '');
        try {
          validatePatternId(patternId); // Fix #5 - Validate even in error path
        } catch (validationError) {
          // Skip invalid pattern IDs in error reporting
          continue;
        }
        failedPatterns.push(patternId);
        if (options.verbose) {
          console.error(`[PatternSync] Failed to push pattern ${patternId}:`, error);
        }
      }
    }

    // Update sync metadata
    await updateSyncMetadata(redis, options.projectId, {
      last_push: new Date().toISOString(),
      patterns_pushed: syncMetrics.pushed,
      patterns_merged: syncMetrics.merged,
    });

    const durationMs = Date.now() - startTime;

    return {
      success: failedPatterns.length === 0,
      direction: 'push',
      mode: 'full', // Push is always full sync
      patternsSynced: syncMetrics.pushed + syncMetrics.merged,
      conflictsResolved: 0,
      failedPatterns,
      durationMs,
      syncedAt: new Date().toISOString(),
      metrics: syncMetrics,
    };
  } catch (error) {
    throw new PatternSyncError(
      `Push operation failed: ${error instanceof Error ? error.message : String(error)}`,
      'PUSH_FAILED',
      error
    );
  } finally {
    // Fix #7 - Release distributed lock
    const currentToken = await redis.get(lockKey);
    if (currentToken === lockToken) {
      await redis.del(lockKey);
    }
  }
}

/**
 * Bidirectional pattern sync
 *
 * @param options - Sync configuration
 * @param redis - Redis client instance
 * @param localStore - Local store key prefix
 * @param globalStore - Global store key prefix
 * @returns Combined sync result
 */
export async function syncPatterns(
  options: SyncOptions,
  redis: Redis,
  localStore: string = 'pattern:local',
  globalStore: string = 'pattern:global'
): Promise<SyncResult> {
  try {
    // Input validation
    const VALID_PROJECT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
    if (!VALID_PROJECT_ID_REGEX.test(options.projectId)) {
      throw new PatternSyncError('Invalid project ID format', 'INVALID_OPTIONS');
    }

    if (!['pull', 'push', 'both'].includes(options.direction)) {
      throw new PatternSyncError(
        'Invalid sync direction (must be pull, push, or both)',
        'INVALID_OPTIONS'
      );
    }

    if (!['incremental', 'full'].includes(options.mode)) {
      throw new PatternSyncError('Invalid sync mode (must be incremental or full)', 'INVALID_OPTIONS');
    }

    const startTime = Date.now();
    const combinedMetrics: SyncMetrics = {
      pulled: 0,
      pushed: 0,
      merged: 0,
      skipped: 0,
      conflictsDetected: 0,
      conflictsAutoResolved: 0,
      conflictsManual: 0,
    };
    const allFailedPatterns: string[] = [];

    // Pull operation
    if (options.direction === 'pull' || options.direction === 'both') {
      const pullResult = await pullPatternsFromGlobal(
        {
          projectId: options.projectId,
          patternTypes: options.patternTypes,
          incremental: options.mode === 'incremental',
          lastSyncTimestamp: options.lastSyncTimestamp,
          forceOverwrite: options.force,
          verbose: options.verbose,
        },
        redis,
        localStore,
        globalStore
      );

      combinedMetrics.pulled += pullResult.metrics.pulled;
      combinedMetrics.merged += pullResult.metrics.merged;
      combinedMetrics.skipped += pullResult.metrics.skipped;
      combinedMetrics.conflictsDetected += pullResult.metrics.conflictsDetected;
      combinedMetrics.conflictsAutoResolved += pullResult.metrics.conflictsAutoResolved;
      combinedMetrics.conflictsManual += pullResult.metrics.conflictsManual;
      allFailedPatterns.push(...pullResult.failedPatterns);
    }

    // Push operation
    if (options.direction === 'push' || options.direction === 'both') {
      const pushResult = await pushPatternsToGlobal(
        {
          projectId: options.projectId,
          patternTypes: options.patternTypes,
          forcePromotion: options.force,
          authorizedBy: options.authorizedBy,
          verbose: options.verbose,
        },
        redis,
        localStore,
        globalStore
      );

      combinedMetrics.pushed += pushResult.metrics.pushed;
      combinedMetrics.merged += pushResult.metrics.merged;
      combinedMetrics.skipped += pushResult.metrics.skipped;
      allFailedPatterns.push(...pushResult.failedPatterns);
    }

    const durationMs = Date.now() - startTime;
    const totalSynced =
      combinedMetrics.pulled + combinedMetrics.pushed + combinedMetrics.merged;

    return {
      success: allFailedPatterns.length === 0,
      direction: options.direction,
      mode: options.mode,
      patternsSynced: totalSynced,
      conflictsResolved: combinedMetrics.conflictsAutoResolved,
      failedPatterns: allFailedPatterns,
      durationMs,
      syncedAt: new Date().toISOString(),
      metrics: combinedMetrics,
    };
  } catch (error) {
    throw new PatternSyncError(
      `Sync operation failed: ${error instanceof Error ? error.message : String(error)}`,
      'PUSH_FAILED',
      error
    );
  }
}

/**
 * Resolve pattern conflict
 *
 * Resolution strategy:
 * - Higher confidence wins
 * - If confidence similar (±0.05), merge patterns
 * - Track conflict history in Redis
 *
 * @param conflict - Pattern conflict to resolve
 * @returns Resolved pattern data or null if manual resolution required
 */
export async function resolveConflict(
  conflict: PatternConflict
): Promise<Record<string, string> | null> {
  try {
    const localConf = parseFloat(conflict.localPattern.confidence.toString());
    const globalConf = parseFloat(conflict.globalPattern.confidence.toString());

    // Validate confidence values
    if (!Number.isFinite(localConf) || !Number.isFinite(globalConf)) {
      return null; // Manual resolution required
    }

    const confidenceDiff = Math.abs(localConf - globalConf);

    if (confidenceDiff < 0.05) {
      // Similar confidence - merge patterns
      return mergePatterns(conflict.localPattern, conflict.globalPattern);
    } else if (localConf > globalConf) {
      // Local pattern has higher confidence
      return patternToRedisData(conflict.localPattern);
    } else {
      // Global pattern has higher confidence
      return patternToRedisData(conflict.globalPattern);
    }
  } catch (error) {
    throw new PatternSyncError(
      `Conflict resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      'CONFLICT_RESOLUTION_FAILED',
      error
    );
  }
}

/**
 * Detect version drift between local and global patterns
 *
 * @param localPattern - Local pattern
 * @param globalPattern - Global pattern
 * @returns Version drift analysis
 */
export async function detectVersionDrift(
  localPattern: Pattern,
  globalPattern: Pattern
): Promise<VersionDrift> {
  try {
    const localUpdatedAt = new Date(localPattern.updatedAt).getTime();
    const globalUpdatedAt = new Date(globalPattern.updatedAt).getTime();
    const timeDriftMs = Math.abs(localUpdatedAt - globalUpdatedAt);

    const confidenceDrift = Math.abs(localPattern.confidence - globalPattern.confidence);

    // Determine drift magnitude
    let driftMagnitude: 'none' | 'minor' | 'major' = 'none';
    const versionParts = localPattern.version.split('.').map((v) => parseInt(v, 10));
    const globalVersionParts = globalPattern.version.split('.').map((v) => parseInt(v, 10));

    if (versionParts[0] !== globalVersionParts[0]) {
      driftMagnitude = 'major';
    } else if (versionParts[1] !== globalVersionParts[1]) {
      driftMagnitude = 'minor';
    }

    return {
      patternId: localPattern.id,
      localVersion: localPattern.version,
      globalVersion: globalPattern.version,
      driftMagnitude,
      localUpdatedAt: localPattern.updatedAt.toString(),
      globalUpdatedAt: globalPattern.updatedAt.toString(),
      timeDriftMs,
      confidenceDrift,
      detectedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new PatternSyncError(
      `Version drift detection failed: ${error instanceof Error ? error.message : String(error)}`,
      'VERSION_DRIFT_FAILED',
      error
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect conflict between local and global patterns
 */
async function detectConflict(
  localData: Record<string, string>,
  globalData: Record<string, string>,
  patternId: string
): Promise<PatternConflict | null> {
  const localConf = parseFloat(localData.confidence || '0');
  const globalConf = parseFloat(globalData.confidence || '0');
  const confidenceDiff = Math.abs(localConf - globalConf);

  const localVersion = localData.version || '0.0.0';
  const globalVersion = globalData.version || '0.0.0';

  // Check for significant differences
  if (confidenceDiff > 0.1 || localVersion !== globalVersion) {
    // Convert Redis data to Pattern objects
    const localPattern = redisDataToPattern(localData, patternId);
    const globalPattern = redisDataToPattern(globalData, patternId);

    return {
      conflictId: randomUUID(),
      localPattern,
      globalPattern,
      type: localVersion !== globalVersion ? 'version_drift' : 'confidence_mismatch',
      severity: confidenceDiff > 0.2 ? 'high' : confidenceDiff > 0.1 ? 'medium' : 'low',
      autoResolvable: confidenceDiff < 0.2, // Auto-resolve if confidence diff < 0.2
      recommendedStrategy: confidenceDiff < 0.05 ? 'merge' : localConf > globalConf ? 'use_local' : 'use_global',
      detectedAt: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Merge two patterns (prioritize higher confidence values)
 */
function mergePatterns(
  localPattern: Pattern,
  globalPattern: Pattern
): Record<string, string> {
  const merged: Record<string, string> = {};

  // Use higher confidence pattern as base
  const base = localPattern.confidence >= globalPattern.confidence ? localPattern : globalPattern;
  const other = base === localPattern ? globalPattern : localPattern;

  // Merge fields
  merged.pattern_id = base.id;
  merged.pattern_type = base.type;
  merged.confidence = Math.max(localPattern.confidence, globalPattern.confidence).toFixed(4);
  merged.version = base.version;
  merged.lifecycle = base.lifecycle;
  merged.category = base.category;
  merged.name = base.name;
  merged.description = base.description;
  merged.created_at = new Date(
    Math.min(new Date(base.createdAt).getTime(), new Date(other.createdAt).getTime())
  ).toISOString();
  merged.updated_at = new Date().toISOString();

  // Merge metadata
  if (base.metadata) {
    merged.metadata = JSON.stringify(base.metadata);
  }

  // Merge evidence
  if (base.evidence) {
    merged.evidence = JSON.stringify(base.evidence);
  }

  return merged;
}

/**
 * Convert Pattern object to Redis hash data
 */
function patternToRedisData(pattern: Pattern): Record<string, string> {
  return {
    pattern_id: pattern.id,
    pattern_type: pattern.type,
    confidence: pattern.confidence.toFixed(4),
    version: pattern.version,
    lifecycle: pattern.lifecycle,
    category: pattern.category,
    name: pattern.name,
    description: pattern.description,
    created_at: pattern.createdAt.toString(),
    updated_at: new Date().toISOString(),
    metadata: JSON.stringify(pattern.metadata),
    evidence: JSON.stringify(pattern.evidence),
  };
}

/**
 * Convert Redis hash data to Pattern object
 */
function redisDataToPattern(data: Record<string, string>, patternId: string): Pattern {
  // Default metadata structure to satisfy PatternMetadata type
  const defaultMetadata = {
    applicability: {
      contentTypes: [],
      industries: [],
    },
    performance: {
      successRate: 0,
      totalApplications: 0,
    },
  };

  return {
    id: patternId,
    type: data.pattern_type as any,
    category: data.category || 'unknown',
    name: data.name || 'Unknown Pattern',
    description: data.description || '',
    confidence: parseFloat(data.confidence || '0'),
    lifecycle: (data.lifecycle || 'discovery') as PatternLifecycleType,
    // Fix #1 - Use safe JSON parsing
    evidence: data.evidence ? safeJSONParse<any[]>(data.evidence, []) : [],
    metadata: data.metadata
      ? safeJSONParse<any>(data.metadata, defaultMetadata)
      : defaultMetadata,
    createdAt: new Date(data.created_at || Date.now()),
    updatedAt: new Date(data.updated_at || Date.now()),
    version: data.version || '1.0.0',
  };
}

/**
 * Store pattern in Redis
 */
async function storePattern(
  redis: Redis,
  key: string,
  data: Record<string, string>
): Promise<void> {
  await redis.hset(key, data);
}

/**
 * Track conflict in Redis for manual review
 */
async function trackConflict(
  redis: Redis,
  projectId: string,
  conflict: PatternConflict
): Promise<void> {
  const conflictKey = `pattern:sync:conflicts:${projectId}`;
  await redis.lpush(conflictKey, JSON.stringify(conflict));

  // Set TTL on conflict list (30 days)
  await redis.expire(conflictKey, 30 * 24 * 60 * 60);
}

/**
 * Update sync metadata in Redis
 */
async function updateSyncMetadata(
  redis: Redis,
  projectId: string,
  metadata: Record<string, string | number>
): Promise<void> {
  const metaKey = `pattern:sync:meta:${projectId}`;
  await redis.hset(metaKey, metadata as any);
}
