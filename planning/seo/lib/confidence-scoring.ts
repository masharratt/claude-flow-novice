/**
 * Confidence Scoring System - SEO Intelligence Integration Phase 4 Sprint 1
 *
 * @module planning/seo/lib/confidence-scoring
 * @description Manages pattern confidence scoring based on outcomes, decay, and validation
 *              Implements automatic archival for low-confidence patterns
 */

import Redis from 'ioredis';

/**
 * Confidence update result
 */
export interface ConfidenceUpdate {
  /** Pattern ID */
  patternId: string;

  /** Previous confidence score */
  previousConfidence: number;

  /** New confidence score */
  newConfidence: number;

  /** Confidence delta */
  delta: number;

  /** Outcome that triggered update */
  outcome: 'success' | 'failure' | 'partial';

  /** Impact factor (0.0-1.0) */
  impact: number;

  /** Update timestamp */
  updatedAt: string;
}

/**
 * Decay calculation result
 */
export interface DecayResult {
  /** Pattern ID */
  patternId: string;

  /** Previous confidence score */
  previousConfidence: number;

  /** New confidence score after decay */
  newConfidence: number;

  /** Total decay applied */
  decayAmount: number;

  /** Days since last use */
  daysSinceLastUse: number;

  /** Decay rate category */
  decayCategory: 'none' | 'slow' | 'medium' | 'fast';

  /** Applied timestamp */
  appliedAt: string;
}

/**
 * Archive eligibility check result
 */
export interface ArchiveEligibility {
  /** Should pattern be archived? */
  shouldArchive: boolean;

  /** Current confidence score */
  confidence: number;

  /** Reason for archive decision */
  reason: string;

  /** Days since last use */
  daysSinceLastUse?: number;

  /** Recent success rate */
  recentSuccessRate?: number;
}

/**
 * Confidence boost calculation parameters
 */
export interface ConfidenceBoostParams {
  /** Base confidence score */
  baseConfidence: number;

  /** Number of successful uses */
  usageCount: number;

  /** Success rate (0.0-1.0) */
  successRate: number;
}

/**
 * Confidence Scoring Error
 */
export class ConfidenceError extends Error {
  constructor(
    message: string,
    public code: 'UPDATE_FAILED' | 'DECAY_FAILED' | 'ARCHIVE_CHECK_FAILED' | 'BOOST_CALCULATION_FAILED',
    public details?: unknown
  ) {
    super(message);
    this.name = 'ConfidenceError';
  }
}

/**
 * Update pattern confidence based on application outcome
 *
 * Update rules:
 * - Success: +0.05 to +0.15 (scaled by impact)
 * - Partial: +0.01 to +0.05 (scaled by impact)
 * - Failure: -0.10 to -0.20 (scaled by impact)
 * - Confidence capped at [0.20, 0.95]
 *
 * @param patternId - Pattern ID to update
 * @param outcome - Application outcome
 * @param impact - Impact factor (0.0-1.0, where 1.0 is maximum impact)
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix (default: 'pattern:local')
 * @returns Confidence update result
 */
export async function updateConfidenceFromOutcome(
  patternId: string,
  outcome: 'success' | 'failure' | 'partial',
  impact: number,
  redis: Redis,
  store: string = 'pattern:local'
): Promise<ConfidenceUpdate> {
  try {
    // P0-3 Fix: Pattern ID validation to prevent injection attacks
    const VALID_PATTERN_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
    if (!VALID_PATTERN_ID_REGEX.test(patternId)) {
      throw new ConfidenceError('Invalid pattern ID format', 'UPDATE_FAILED');
    }

    // Validate impact range
    if (impact < 0 || impact > 1) {
      throw new ConfidenceError(
        `Impact must be between 0.0 and 1.0, got ${impact}`,
        'UPDATE_FAILED'
      );
    }

    // Fetch current confidence
    const currentConfidenceStr = await redis.hget(`${store}:${patternId}`, 'confidence');
    const previousConfidence = parseFloat(currentConfidenceStr || '0.5');

    // P0-3 Fix: Validate confidence value for NaN/Infinity/invalid values
    if (!Number.isFinite(previousConfidence) || previousConfidence < 0 || previousConfidence > 1) {
      throw new ConfidenceError('Invalid confidence value in store', 'UPDATE_FAILED');
    }

    // Calculate delta based on outcome and impact
    let baseDelta: number;

    switch (outcome) {
      case 'success':
        baseDelta = 0.05 + (0.10 * impact); // +0.05 to +0.15
        break;
      case 'partial':
        baseDelta = 0.01 + (0.04 * impact); // +0.01 to +0.05
        break;
      case 'failure':
        baseDelta = -(0.10 + (0.10 * impact)); // -0.10 to -0.20
        break;
      default:
        throw new ConfidenceError(`Unknown outcome: ${outcome}`, 'UPDATE_FAILED');
    }

    // Apply delta with capping
    let newConfidence = previousConfidence + baseDelta;
    newConfidence = Math.max(0.20, Math.min(0.95, newConfidence));

    const delta = newConfidence - previousConfidence;

    // Update Redis
    await redis.hset(`${store}:${patternId}`, {
      confidence: newConfidence.toFixed(4),
      last_updated: new Date().toISOString(),
    });

    // Record confidence history
    const historyKey = `${store}:${patternId}:confidence_history`;
    await redis.lpush(
      historyKey,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        previousConfidence,
        newConfidence,
        delta,
        outcome,
        impact,
      })
    );

    // Keep only last 100 history entries
    await redis.ltrim(historyKey, 0, 99);

    return {
      patternId,
      previousConfidence,
      newConfidence,
      delta,
      outcome,
      impact,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof ConfidenceError) {
      throw error;
    }
    throw new ConfidenceError(
      `Failed to update confidence for pattern ${patternId}`,
      'UPDATE_FAILED',
      error
    );
  }
}

/**
 * Apply time-based confidence decay to unused patterns
 *
 * Decay schedule:
 * - <7 days: No decay
 * - 7-30 days: Slow decay (-0.01 per week)
 * - 31-90 days: Medium decay (-0.02 per week)
 * - >90 days: Fast decay (-0.05 per week)
 * - Floor: Stop decay at 0.4 confidence
 *
 * @param patternId - Pattern ID to apply decay
 * @param daysSinceLastUse - Days since pattern was last used
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix (default: 'pattern:local')
 * @returns Decay calculation result
 */
export async function applyConfidenceDecay(
  patternId: string,
  daysSinceLastUse: number,
  redis: Redis,
  store: string = 'pattern:local'
): Promise<DecayResult> {
  try {
    // Fetch current confidence
    const currentConfidenceStr = await redis.hget(`${store}:${patternId}`, 'confidence');
    const previousConfidence = parseFloat(currentConfidenceStr || '0.5');

    // Determine decay category and rate
    let decayCategory: 'none' | 'slow' | 'medium' | 'fast';
    let weeklyDecay: number;

    if (daysSinceLastUse < 7) {
      decayCategory = 'none';
      weeklyDecay = 0;
    } else if (daysSinceLastUse <= 30) {
      decayCategory = 'slow';
      weeklyDecay = 0.01;
    } else if (daysSinceLastUse <= 90) {
      decayCategory = 'medium';
      weeklyDecay = 0.02;
    } else {
      decayCategory = 'fast';
      weeklyDecay = 0.05;
    }

    // Calculate total decay (weeks * weekly rate)
    const weeks = daysSinceLastUse / 7;
    let totalDecay = weeks * weeklyDecay;

    // Apply decay with floor at 0.4
    let newConfidence = previousConfidence - totalDecay;
    const decayFloor = 0.4;

    if (newConfidence < decayFloor) {
      newConfidence = decayFloor;
      totalDecay = previousConfidence - decayFloor;
    }

    // Update Redis only if decay was applied
    if (totalDecay > 0) {
      await redis.hset(`${store}:${patternId}`, {
        confidence: newConfidence.toFixed(4),
        last_decay_applied: new Date().toISOString(),
      });

      // Record decay history
      const historyKey = `${store}:${patternId}:decay_history`;
      await redis.lpush(
        historyKey,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          previousConfidence,
          newConfidence,
          decayAmount: totalDecay,
          daysSinceLastUse,
          decayCategory,
        })
      );

      // Keep only last 50 decay history entries
      await redis.ltrim(historyKey, 0, 49);
    }

    return {
      patternId,
      previousConfidence,
      newConfidence,
      decayAmount: totalDecay,
      daysSinceLastUse,
      decayCategory,
      appliedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new ConfidenceError(
      `Failed to apply decay for pattern ${patternId}`,
      'DECAY_FAILED',
      error
    );
  }
}

/**
 * Check if pattern should be archived based on confidence and usage
 *
 * Archive criteria:
 * - Confidence <0.4
 * - No usage in 180 days
 * - Success rate <0.2 (if used recently)
 *
 * @param patternId - Pattern ID to check
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix (default: 'pattern:local')
 * @returns Archive eligibility result
 */
export async function checkArchiveEligibility(
  patternId: string,
  redis: Redis,
  store: string = 'pattern:local'
): Promise<ArchiveEligibility> {
  try {
    // Fetch pattern data
    const patternData = await redis.hgetall(`${store}:${patternId}`);

    if (!patternData || Object.keys(patternData).length === 0) {
      return {
        shouldArchive: false,
        confidence: 0,
        reason: 'Pattern not found',
      };
    }

    const confidence = parseFloat(patternData.confidence || '0.5');
    const lastUsedStr = patternData.last_used;
    const lifecycle = patternData.lifecycle || 'discovery';

    // Don't archive already archived or promoted patterns
    if (lifecycle === 'archived' || lifecycle === 'promoted' || lifecycle === 'global') {
      return {
        shouldArchive: false,
        confidence,
        reason: `Pattern already in ${lifecycle} state`,
      };
    }

    // Check confidence threshold
    if (confidence < 0.4) {
      return {
        shouldArchive: true,
        confidence,
        reason: `Confidence ${confidence.toFixed(2)} below archive threshold 0.4`,
      };
    }

    // Check last usage
    if (lastUsedStr) {
      const lastUsed = new Date(lastUsedStr);
      const now = new Date();
      const daysSinceLastUse = Math.floor((now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceLastUse > 180) {
        return {
          shouldArchive: true,
          confidence,
          reason: `No usage in ${daysSinceLastUse} days (threshold: 180 days)`,
          daysSinceLastUse,
        };
      }

      // Check recent success rate
      const applicationIds = await redis.lrange(`${store}:${patternId}:applications`, 0, 9);
      let successCount = 0;
      let totalCount = 0;

      for (const appId of applicationIds) {
        const outcome = await redis.hget(`application:${appId}`, 'outcome');
        if (outcome) {
          totalCount++;
          if (outcome === 'success' || outcome === 'partial') {
            successCount++;
          }
        }
      }

      const successRate = totalCount > 0 ? successCount / totalCount : 0;

      if (totalCount >= 5 && successRate < 0.2) {
        return {
          shouldArchive: true,
          confidence,
          reason: `Low success rate ${successRate.toFixed(2)} in recent uses (${successCount}/${totalCount})`,
          daysSinceLastUse,
          recentSuccessRate: successRate,
        };
      }
    }

    // Pattern is healthy, don't archive
    return {
      shouldArchive: false,
      confidence,
      reason: 'Pattern meets retention criteria',
    };
  } catch (error) {
    throw new ConfidenceError(
      `Failed to check archive eligibility for pattern ${patternId}`,
      'ARCHIVE_CHECK_FAILED',
      error
    );
  }
}

/**
 * Archive a pattern by updating its lifecycle state
 *
 * @param patternId - Pattern ID to archive
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix (default: 'pattern:local')
 * @param reason - Reason for archival
 * @returns True if archived successfully
 */
export async function archivePattern(
  patternId: string,
  redis: Redis,
  store: string = 'pattern:local',
  reason: string = 'Manual archive'
): Promise<boolean> {
  try {
    // Update pattern lifecycle
    await redis.hset(`${store}:${patternId}`, {
      lifecycle: 'archived',
      archived_at: new Date().toISOString(),
      archive_reason: reason,
    });

    // Update lifecycle tracking
    await redis.hset(`pattern:lifecycle:${patternId}`, {
      stage: 'archived',
      pattern_id: patternId,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    throw new ConfidenceError(
      `Failed to archive pattern ${patternId}`,
      'ARCHIVE_CHECK_FAILED',
      error
    );
  }
}

/**
 * Calculate confidence boost for validated patterns
 *
 * Boost formula:
 * - Base: Start with baseConfidence
 * - Usage multiplier: +0.01 per 5 uses (capped at +0.10)
 * - Success multiplier: +0.05 * successRate (0.0-1.0)
 * - Cap: Maximum 0.95
 *
 * @param baseConfidence - Current confidence score
 * @param usageCount - Number of successful uses
 * @param successRate - Success rate (0.0-1.0)
 * @returns Boosted confidence score
 */
export function calculateConfidenceBoost(
  baseConfidence: number,
  usageCount: number,
  successRate: number
): number {
  try {
    // Validate inputs
    if (baseConfidence < 0 || baseConfidence > 1) {
      throw new ConfidenceError(
        `Base confidence must be between 0.0 and 1.0, got ${baseConfidence}`,
        'BOOST_CALCULATION_FAILED'
      );
    }

    if (usageCount < 0) {
      throw new ConfidenceError(
        `Usage count cannot be negative, got ${usageCount}`,
        'BOOST_CALCULATION_FAILED'
      );
    }

    if (successRate < 0 || successRate > 1) {
      throw new ConfidenceError(
        `Success rate must be between 0.0 and 1.0, got ${successRate}`,
        'BOOST_CALCULATION_FAILED'
      );
    }

    // Calculate usage boost (capped at +0.10)
    const usageBoost = Math.min(0.10, (usageCount / 5) * 0.01);

    // Calculate success rate boost
    const successBoost = 0.05 * successRate;

    // Apply boosts
    let boostedConfidence = baseConfidence + usageBoost + successBoost;

    // Cap at 0.95
    boostedConfidence = Math.min(0.95, boostedConfidence);

    return boostedConfidence;
  } catch (error) {
    if (error instanceof ConfidenceError) {
      throw error;
    }
    throw new ConfidenceError(
      'Failed to calculate confidence boost',
      'BOOST_CALCULATION_FAILED',
      error
    );
  }
}

/**
 * Batch update confidence for multiple patterns based on outcomes
 *
 * @param updates - Array of pattern updates
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix (default: 'pattern:local')
 * @returns Array of confidence update results
 */
export async function batchUpdateConfidence(
  updates: Array<{
    patternId: string;
    outcome: 'success' | 'failure' | 'partial';
    impact: number;
  }>,
  redis: Redis,
  store: string = 'pattern:local'
): Promise<ConfidenceUpdate[]> {
  const results: ConfidenceUpdate[] = [];

  for (const update of updates) {
    try {
      const result = await updateConfidenceFromOutcome(
        update.patternId,
        update.outcome,
        update.impact,
        redis,
        store
      );
      results.push(result);
    } catch (error) {
      // Log error but continue with other updates
      console.error(`Failed to update confidence for pattern ${update.patternId}:`, error);
    }
  }

  return results;
}

/**
 * Calculate days since last use from Redis timestamp
 *
 * @param lastUsedStr - ISO timestamp string from Redis
 * @returns Days since last use
 */
export function calculateDaysSinceLastUse(lastUsedStr: string | null): number {
  if (!lastUsedStr) {
    return Number.MAX_SAFE_INTEGER; // Pattern never used
  }

  try {
    const lastUsed = new Date(lastUsedStr);
    const now = new Date();
    const daysSince = Math.floor((now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));

    return daysSince >= 0 ? daysSince : 0;
  } catch (error) {
    console.error(`Failed to parse last_used timestamp: ${lastUsedStr}`, error);
    return 0;
  }
}

/**
 * Auto-archive patterns that meet archive criteria
 *
 * Scans all patterns in store and archives those that meet criteria
 *
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix (default: 'pattern:local')
 * @param verbose - Enable verbose logging
 * @returns Number of patterns archived
 */
export async function autoArchivePatterns(
  redis: Redis,
  store: string = 'pattern:local',
  verbose: boolean = false
): Promise<number> {
  try {
    let archivedCount = 0;

    // Get all pattern keys
    const patternKeys = await redis.keys(`${store}:*`);

    if (verbose) {
      console.log(`[Auto Archive] Checking ${patternKeys.length} patterns for archive eligibility...`);
    }

    for (const key of patternKeys) {
      // Skip non-pattern keys (like applications, history, etc.)
      if (key.includes(':applications') || key.includes(':history') || key.includes(':lifecycle')) {
        continue;
      }

      const patternId = key.replace(`${store}:`, '');

      // Check eligibility
      const eligibility = await checkArchiveEligibility(patternId, redis, store);

      if (eligibility.shouldArchive) {
        await archivePattern(patternId, redis, store, eligibility.reason);
        archivedCount++;

        if (verbose) {
          console.log(`[Auto Archive] Archived pattern ${patternId}: ${eligibility.reason}`);
        }
      }
    }

    if (verbose) {
      console.log(`[Auto Archive] Complete: ${archivedCount} patterns archived`);
    }

    return archivedCount;
  } catch (error) {
    throw new ConfidenceError(
      'Failed to auto-archive patterns',
      'ARCHIVE_CHECK_FAILED',
      error
    );
  }
}
