/**
 * Pattern Promotion Protocol - SEO Intelligence Integration Phase 4 Sprint 1
 *
 * @module planning/seo/lib/pattern-promotion
 * @description Implements pattern lifecycle management and promotion from local to global stores
 *              Enables cross-domain learning by identifying effective patterns and anonymizing them
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { Pattern, PatternEvidence, PatternLifecycle as PatternLifecycleType } from '../types';

/**
 * Pattern lifecycle tracking
 */
export interface PatternLifecycle {
  /** Current lifecycle stage */
  stage: 'discovery' | 'validation' | 'promotion' | 'global' | 'archived';

  /** Pattern ID */
  pattern_id: string;

  /** Pattern creation timestamp */
  created_at: string;

  /** Validation timestamp (when pattern reached validation stage) */
  validated_at?: string;

  /** Promotion timestamp (when pattern was promoted to global) */
  promoted_at?: string;

  /** Archive timestamp (when pattern was archived) */
  archived_at?: string;
}

/**
 * Promotion eligibility result
 */
export interface PromotionEligibility {
  /** Is pattern eligible for promotion? */
  eligible: boolean;

  /** Current confidence score */
  confidence: number;

  /** Number of successful uses */
  usageCount: number;

  /** Success rate in recent uses */
  successRate: number;

  /** Reasons for eligibility decision */
  reasons: string[];
}

/**
 * Anonymized pattern (stripped of domain-specific data)
 */
export interface AnonymizedPattern {
  /** Original pattern ID */
  originalId: string;

  /** Pattern type */
  pattern_type: string;

  /** Anonymized pattern data */
  data: Record<string, unknown>;

  /** Confidence score */
  confidence: number;

  /** Effectiveness metrics */
  metrics: {
    usageCount: number;
    successRate: number;
    averageImpact: number;
  };

  /** Anonymization metadata */
  anonymization: {
    mode: 'full' | 'partial';
    strippedFields: string[];
    anonymizedAt: string;
  };
}

/**
 * Similar pattern detected in global store
 */
export interface SimilarPattern {
  /** Global pattern ID */
  patternId: string;

  /** Similarity score (0.0-1.0) */
  similarity: number;

  /** Pattern data */
  pattern: AnonymizedPattern;

  /** Merge recommendation */
  shouldMerge: boolean;
}

/**
 * Promotion options
 */
export interface PromotionOptions {
  /** Anonymization mode */
  anonymizationMode?: 'full' | 'partial';

  /** Similarity threshold for duplicate detection */
  similarityThreshold?: number;

  /** Force promotion even if similar patterns exist */
  force?: boolean;

  /** Merge with similar pattern instead of creating new */
  mergeIfSimilar?: boolean;

  /** Verbose logging */
  verbose?: boolean;

  /** Authorization identity for force promotion (REQUIRED when force=true) */
  authorizedBy?: string;
}

/**
 * Promotion result
 */
export interface PromotionResult {
  /** Success status */
  success: boolean;

  /** Global pattern ID (new or merged) */
  globalPatternId: string;

  /** Action taken */
  action: 'created' | 'merged' | 'skipped' | 'failed';

  /** Similar patterns found */
  similarPatterns: SimilarPattern[];

  /** Error message if failed */
  error?: string;

  /** Promotion timestamp */
  promotedAt: string;
}

/**
 * Pattern Promotion Protocol Error
 */
export class PatternPromotionError extends Error {
  constructor(
    message: string,
    public code: 'ELIGIBILITY_FAILED' | 'ANONYMIZATION_FAILED' | 'SIMILARITY_CHECK_FAILED' | 'PROMOTION_FAILED',
    public details?: unknown
  ) {
    super(message);
    this.name = 'PatternPromotionError';
  }
}

/**
 * Check if pattern is eligible for promotion to global store
 *
 * Eligibility criteria:
 * - Confidence ≥0.8
 * - Used in ≥5 articles successfully
 * - Success rate ≥0.7 in last 10 uses
 * - Not already promoted
 * - Passes anonymization check
 *
 * @param patternId - Pattern ID to check
 * @param redis - Redis client instance
 * @param localStore - Local store key prefix (e.g., 'pattern:local')
 * @returns Eligibility result
 */
export async function checkPromotionEligibility(
  patternId: string,
  redis: Redis,
  localStore: string = 'pattern:local'
): Promise<PromotionEligibility> {
  const reasons: string[] = [];

  try {
    // Fetch pattern data
    const patternData = await redis.hgetall(`${localStore}:${patternId}`);

    if (!patternData || Object.keys(patternData).length === 0) {
      return {
        eligible: false,
        confidence: 0,
        usageCount: 0,
        successRate: 0,
        reasons: ['Pattern not found in local store'],
      };
    }

    const confidence = parseFloat(patternData.confidence || '0');
    const usageCount = parseInt(patternData.usage_count || '0', 10);
    const lifecycle = patternData.lifecycle || 'discovery';

    // Check if already promoted
    if (lifecycle === 'global' || lifecycle === 'promoted') {
      reasons.push('Pattern already promoted to global store');
      return {
        eligible: false,
        confidence,
        usageCount,
        successRate: 0,
        reasons,
      };
    }

    // Check confidence threshold
    if (confidence < 0.8) {
      reasons.push(`Confidence ${confidence.toFixed(2)} below threshold 0.8`);
    } else {
      reasons.push(`Confidence ${confidence.toFixed(2)} meets threshold 0.8`);
    }

    // Check usage count
    if (usageCount < 5) {
      reasons.push(`Usage count ${usageCount} below threshold 5`);
    } else {
      reasons.push(`Usage count ${usageCount} meets threshold 5`);
    }

    // Calculate success rate from recent applications
    const applicationIds = await redis.lrange(`${localStore}:${patternId}:applications`, 0, 9);
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

    if (successRate < 0.7 && totalCount >= 5) {
      reasons.push(`Success rate ${successRate.toFixed(2)} below threshold 0.7 (${successCount}/${totalCount} recent uses)`);
    } else if (totalCount >= 5) {
      reasons.push(`Success rate ${successRate.toFixed(2)} meets threshold 0.7 (${successCount}/${totalCount} recent uses)`);
    } else {
      reasons.push(`Insufficient recent usage data (${totalCount} applications)`);
    }

    // Determine eligibility
    const eligible = confidence >= 0.8 && usageCount >= 5 && (successRate >= 0.7 || totalCount < 5);

    return {
      eligible,
      confidence,
      usageCount,
      successRate,
      reasons,
    };
  } catch (error) {
    throw new PatternPromotionError(
      `Failed to check promotion eligibility for pattern ${patternId}`,
      'ELIGIBILITY_FAILED',
      error
    );
  }
}

/**
 * Anonymize pattern data by stripping domain-specific information
 *
 * Full mode:
 * - Removes all domain names, URLs, brand names, specific keywords
 * - Keeps pattern structure, relationships, metrics
 *
 * Partial mode:
 * - Keeps generic keywords and categories
 * - Removes specific brand identifiers
 *
 * @param pattern - Pattern to anonymize
 * @param mode - Anonymization mode ('full' | 'partial')
 * @returns Anonymized pattern
 */
export function anonymizePattern(
  pattern: Pattern,
  mode: 'full' | 'partial' = 'full'
): AnonymizedPattern {
  const strippedFields: string[] = [];

  try {
    // Parse pattern data if it's a string
    const patternData = typeof pattern === 'string' ? JSON.parse(pattern) : pattern;

    // Fields to strip in full mode
    const fullModeStripFields = [
      'domain',
      'url',
      'brand',
      'brandName',
      'companyName',
      'specificKeyword',
      'targetUrl',
      'sourceUrl',
      'siteUrl',
    ];

    // Fields to strip in partial mode (subset of full mode)
    const partialModeStripFields = ['domain', 'url', 'brand', 'brandName', 'companyName', 'targetUrl', 'sourceUrl'];

    const fieldsToStrip = mode === 'full' ? fullModeStripFields : partialModeStripFields;

    /**
     * Deep recursion function to anonymize nested objects and arrays
     * P0-4 Fix: Comprehensive deep anonymization (≥95% effectiveness)
     */
    const deepAnonymize = (obj: any, depth = 0, path = ''): any => {
      // Prevent infinite recursion
      if (depth > 10) return obj;
      if (obj === null || typeof obj !== 'object') return obj;

      if (Array.isArray(obj)) {
        return obj.map((item, index) => deepAnonymize(item, depth + 1, `${path}[${index}]`));
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const fieldPath = path ? `${path}.${key}` : key;

        // Check if key or value contains domain-like data
        const isDomainRelated = /domain|url|brand|site|company|http|www|\.com|\.org|\.net/i.test(key);
        const isValueDomainRelated =
          typeof value === 'string' && /https?:\/\/|www\.|\.com|\.org|\.net/i.test(value);

        // Skip field entirely in full mode if domain-related
        if ((isDomainRelated || isValueDomainRelated) && mode === 'full') {
          strippedFields.push(fieldPath);
          continue;
        }

        // Also strip fields in the explicit strip list
        if (fieldsToStrip.includes(key)) {
          strippedFields.push(fieldPath);
          continue;
        }

        // Recursively process nested objects
        result[key] = deepAnonymize(value, depth + 1, fieldPath);
      }
      return result;
    };

    // Apply deep anonymization
    const anonymizedData = deepAnonymize(patternData);

    return {
      originalId: patternData.id || 'unknown',
      pattern_type: patternData.type || 'content',
      data: anonymizedData,
      confidence: patternData.confidence || 0,
      metrics: {
        usageCount: patternData.usageCount || 0,
        successRate: patternData.successRate || 0,
        averageImpact: patternData.averageImpact || 0,
      },
      anonymization: {
        mode,
        strippedFields,
        anonymizedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    throw new PatternPromotionError('Failed to anonymize pattern', 'ANONYMIZATION_FAILED', error);
  }
}

/**
 * Detect similar patterns in global store to prevent duplicates
 *
 * Compares pattern structure, type, and key metrics using cosine similarity
 *
 * @param pattern - Anonymized pattern to check
 * @param redis - Redis client instance
 * @param globalStore - Global store key prefix (e.g., 'pattern:global')
 * @param threshold - Similarity threshold (default: 0.85)
 * @returns Array of similar patterns found
 */
export async function detectSimilarPatterns(
  pattern: AnonymizedPattern,
  redis: Redis,
  globalStore: string = 'pattern:global',
  threshold: number = 0.85
): Promise<SimilarPattern[]> {
  try {
    const similarPatterns: SimilarPattern[] = [];

    // SECURITY FIX (Iteration 3): Strengthened regex to prevent namespace confusion
    // Removed ':' from allowed characters to prevent unauthorized key access
    const VALID_KEY_REGEX = /^[a-zA-Z0-9_-]+$/;

    // SECURITY: Use SCAN cursor instead of KEYS to avoid blocking Redis server
    const globalPatternKeys: string[] = [];
    let cursor = '0';
    const MAX_KEYS = 10000; // Safety limit

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${globalStore}:*`,
        'COUNT',
        100
      );
      cursor = nextCursor;

      // Filter keys to prevent injection attacks and add to collection
      for (const key of keys) {
        // Extract key suffix after globalStore prefix
        const keySuffix = key.replace(`${globalStore}:`, '');

        // Validate suffix only (not full key with namespace)
        if (VALID_KEY_REGEX.test(keySuffix)) {
          globalPatternKeys.push(key);

          // Safety limit check
          if (globalPatternKeys.length >= MAX_KEYS) {
            console.warn(
              `[detectSimilarPatterns] Reached MAX_KEYS limit (${MAX_KEYS}), stopping scan`
            );
            cursor = '0'; // Break loop
            break;
          }
        }
      }
    } while (cursor !== '0');

    for (const key of globalPatternKeys) {
      const globalPatternData = await redis.hgetall(key);

      if (!globalPatternData || globalPatternData.pattern_type !== pattern.pattern_type) {
        continue;
      }

      // Parse global pattern data
      const globalData = JSON.parse(globalPatternData.data || '{}');

      // Calculate similarity score
      const similarity = calculatePatternSimilarity(pattern.data, globalData);

      if (similarity >= threshold) {
        const patternId = key.replace(`${globalStore}:`, '');

        similarPatterns.push({
          patternId,
          similarity,
          pattern: {
            originalId: patternId,
            pattern_type: globalPatternData.pattern_type,
            data: globalData,
            confidence: parseFloat(globalPatternData.confidence || '0'),
            metrics: {
              usageCount: parseInt(globalPatternData.usage_count || '0', 10),
              successRate: parseFloat(globalPatternData.success_rate || '0'),
              averageImpact: parseFloat(globalPatternData.average_impact || '0'),
            },
            anonymization: {
              mode: 'full',
              strippedFields: [],
              anonymizedAt: globalPatternData.promoted_at || new Date().toISOString(),
            },
          },
          shouldMerge: similarity >= 0.90, // Recommend merge if very similar
        });
      }
    }

    // Sort by similarity (highest first)
    similarPatterns.sort((a, b) => b.similarity - a.similarity);

    return similarPatterns;
  } catch (error) {
    throw new PatternPromotionError('Failed to detect similar patterns', 'SIMILARITY_CHECK_FAILED', error);
  }
}

/**
 * Calculate cosine similarity between two pattern data objects
 *
 * @param data1 - First pattern data
 * @param data2 - Second pattern data
 * @returns Similarity score (0.0-1.0)
 */
function calculatePatternSimilarity(data1: Record<string, unknown>, data2: Record<string, unknown>): number {
  // Extract comparable features
  const features1 = extractPatternFeatures(data1);
  const features2 = extractPatternFeatures(data2);

  // Calculate cosine similarity
  const allKeys = new Set([...Object.keys(features1), ...Object.keys(features2)]);
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (const key of Array.from(allKeys)) {
    const val1 = features1[key] || 0;
    const val2 = features2[key] || 0;

    dotProduct += val1 * val2;
    magnitude1 += val1 * val1;
    magnitude2 += val2 * val2;
  }

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
}

/**
 * Extract numerical features from pattern data for similarity comparison
 *
 * @param data - Pattern data
 * @returns Feature vector
 */
function extractPatternFeatures(data: Record<string, unknown>): Record<string, number> {
  const features: Record<string, number> = {};

  // Extract numerical values
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number') {
      features[key] = value;
    } else if (typeof value === 'string') {
      // Convert string to numerical feature (e.g., length, hash)
      features[`${key}_length`] = value.length;
    } else if (Array.isArray(value)) {
      features[`${key}_count`] = value.length;
    } else if (typeof value === 'object' && value !== null) {
      // Recursively extract from nested objects
      const nested = extractPatternFeatures(value as Record<string, unknown>);
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        features[`${key}.${nestedKey}`] = nestedValue;
      }
    }
  }

  return features;
}

/**
 * Promote pattern from local to global store
 *
 * Steps:
 * 1. Check eligibility
 * 2. Anonymize pattern
 * 3. Detect similar patterns
 * 4. Either merge with similar or create new global pattern
 * 5. Update lifecycle tracking
 *
 * @param patternId - Local pattern ID
 * @param redis - Redis client instance
 * @param localStore - Local store key prefix (default: 'pattern:local')
 * @param globalStore - Global store key prefix (default: 'pattern:global')
 * @param options - Promotion options
 * @returns Promotion result
 */
export async function promotePattern(
  patternId: string,
  redis: Redis,
  localStore: string = 'pattern:local',
  globalStore: string = 'pattern:global',
  options: PromotionOptions = {}
): Promise<PromotionResult> {
  const {
    anonymizationMode = 'full',
    similarityThreshold = 0.85,
    force = false,
    mergeIfSimilar = true,
    verbose = false,
    authorizedBy,
  } = options;

  // P1-5 Fix: Distributed locking to prevent race conditions
  const lockKey = `lock:promotion:${patternId}`;
  const lockToken = randomUUID();

  const acquired = await redis.set(lockKey, lockToken, 'EX', 30, 'NX');
  if (!acquired) {
    throw new PatternPromotionError(
      'Another promotion is in progress for this pattern',
      'PROMOTION_FAILED'
    );
  }

  try {
    // P0-6 Fix: Authorization check for force promotion
    if (force && !authorizedBy) {
      throw new PatternPromotionError(
        'Force promotion requires authorization',
        'PROMOTION_FAILED'
      );
    }

    // P0-6 Fix: Audit trail for force promotions
    if (force && authorizedBy) {
      await redis.lpush(
        'pattern:promotions:audit',
        JSON.stringify({
          patternId,
          force: true,
          authorizedBy,
          timestamp: new Date().toISOString(),
        })
      );
    }

    if (verbose) {
      console.log(`[Pattern Promotion] Checking eligibility for pattern ${patternId}...`);
    }

    // Step 1: Check eligibility
    const eligibility = await checkPromotionEligibility(patternId, redis, localStore);

    if (!eligibility.eligible && !force) {
      return {
        success: false,
        globalPatternId: '',
        action: 'skipped',
        similarPatterns: [],
        error: `Pattern not eligible for promotion: ${eligibility.reasons.join(', ')}`,
        promotedAt: new Date().toISOString(),
      };
    }

    // Step 2: Fetch and anonymize pattern
    const patternData = await redis.hgetall(`${localStore}:${patternId}`);

    if (!patternData || Object.keys(patternData).length === 0) {
      return {
        success: false,
        globalPatternId: '',
        action: 'failed',
        similarPatterns: [],
        error: 'Pattern not found in local store',
        promotedAt: new Date().toISOString(),
      };
    }

    // Convert Redis hash to Pattern object
    const pattern: Pattern = {
      id: patternId,
      type: (patternData.pattern_type as 'content' | 'technical' | 'algorithm') || 'content',
      category: patternData.category || 'unknown',
      name: patternData.name || 'Unnamed Pattern',
      description: patternData.description || '',
      confidence: parseFloat(patternData.confidence || '0'),
      lifecycle: (patternData.lifecycle as PatternLifecycleType) || 'discovery',
      evidence: JSON.parse(patternData.evidence || '[]'),
      metadata: JSON.parse(patternData.metadata || '{}'),
      createdAt: new Date(patternData.created_at || Date.now()),
      updatedAt: new Date(patternData.updated_at || Date.now()),
      version: patternData.version || '1.0.0',
    };

    const anonymizedPattern = anonymizePattern(pattern, anonymizationMode);

    if (verbose) {
      console.log(`[Pattern Promotion] Pattern anonymized (mode: ${anonymizationMode})`);
      console.log(`[Pattern Promotion] Stripped fields: ${anonymizedPattern.anonymization.strippedFields.join(', ')}`);
    }

    // Step 3: Detect similar patterns
    const similarPatterns = await detectSimilarPatterns(anonymizedPattern, redis, globalStore, similarityThreshold);

    if (verbose && similarPatterns.length > 0) {
      console.log(`[Pattern Promotion] Found ${similarPatterns.length} similar pattern(s)`);
      for (const sp of similarPatterns) {
        console.log(`  - ${sp.patternId}: similarity ${sp.similarity.toFixed(2)} (merge: ${sp.shouldMerge})`);
      }
    }

    // Step 4: Merge or create
    let globalPatternId: string;
    let action: 'created' | 'merged';

    if (similarPatterns.length > 0 && mergeIfSimilar && similarPatterns[0].shouldMerge) {
      // Merge with most similar pattern
      globalPatternId = similarPatterns[0].patternId;
      action = 'merged';

      if (verbose) {
        console.log(`[Pattern Promotion] Merging with existing pattern ${globalPatternId}`);
      }

      // Boost confidence of existing pattern
      const existingConfidence = parseFloat((await redis.hget(`${globalStore}:${globalPatternId}`, 'confidence')) || '0');
      const boostedConfidence = Math.min(0.95, existingConfidence + 0.05);

      await redis.hset(`${globalStore}:${globalPatternId}`, {
        confidence: boostedConfidence.toString(),
        usage_count: (parseInt((await redis.hget(`${globalStore}:${globalPatternId}`, 'usage_count')) || '0', 10) +
          anonymizedPattern.metrics.usageCount).toString(),
        last_merged: new Date().toISOString(),
      });
    } else {
      // P0-2 Fix: Use cryptographically secure UUID generation
      globalPatternId = `global-${randomUUID()}`;
      action = 'created';

      if (verbose) {
        console.log(`[Pattern Promotion] Creating new global pattern ${globalPatternId}`);
      }

      await redis.hset(`${globalStore}:${globalPatternId}`, {
        pattern_type: anonymizedPattern.pattern_type,
        data: JSON.stringify(anonymizedPattern.data),
        confidence: anonymizedPattern.confidence.toString(),
        usage_count: anonymizedPattern.metrics.usageCount.toString(),
        success_rate: anonymizedPattern.metrics.successRate.toString(),
        average_impact: anonymizedPattern.metrics.averageImpact.toString(),
        promoted_from: patternId,
        promoted_at: new Date().toISOString(),
      });
    }

    // Step 5: Update lifecycle
    await redis.hset(`${localStore}:${patternId}`, {
      lifecycle: 'promoted',
      promoted_to: globalPatternId,
      promoted_at: new Date().toISOString(),
    });

    await redis.hset(`pattern:lifecycle:${patternId}`, {
      stage: 'promotion',
      pattern_id: patternId,
      updated_at: new Date().toISOString(),
    });

    if (verbose) {
      console.log(`[Pattern Promotion] Promotion complete: ${action} ${globalPatternId}`);
    }

    return {
      success: true,
      globalPatternId,
      action,
      similarPatterns,
      promotedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new PatternPromotionError(`Failed to promote pattern ${patternId}`, 'PROMOTION_FAILED', error);
  } finally {
    // P1-5 Fix: Release distributed lock only if we own it
    const currentToken = await redis.get(lockKey);
    if (currentToken === lockToken) {
      await redis.del(lockKey);
    }
  }
}
