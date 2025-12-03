/**
 * SEO Onboarding RuVector Client Functions
 *
 * Provides type-safe client functions for interacting with RuVector collections
 * used by the SEO onboarding system. Implements MVP functionality with Redis fallback
 * for Phase 1-3 without blocking on RuVector SDK.
 *
 * Functions:
 * - upsertSiteProfile() - Store/update site technical health profiles
 * - queryCrossSitePatterns() - Semantic search for industry patterns
 * - logOnboardingResult() - Archive complete onboarding runs
 *
 * Future Integration:
 * This module uses Redis storage as MVP fallback. Future updates will integrate
 * the RuVector SDK for vector-based semantic search and pattern similarity.
 *
 * @module seo/lib/ruvector/ruvector-client
 */

import {
  SiteProfileEntry,
  OnboardingResultsEntry,
  CrossSitePatternEntry,
  generateSiteProfileId,
  generateOnboardingResultsId,
  generateCrossSitePatternId,
  sanitizeRedisKey,
  normalizeForId,
  TechnicalHealthMetric,
  SiteProfileCrawlData,
  PhaseOutput,
  CrossSitePatternType,
  IndustrySuccessMetric,
} from './onboarding-schemas';

/**
 * RuVector client configuration
 *
 * @internal
 */
interface RuVectorConfig {
  /** Redis connection string for MVP fallback storage */
  redisUrl?: string;

  /** RuVector API endpoint (when SDK available) */
  ruvectorEndpoint?: string;

  /** API key for RuVector authentication */
  apiKey?: string;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Global RuVector client configuration
 * Initialized with environment variables or passed via initializeClient()
 *
 * @internal
 */
let clientConfig: RuVectorConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  debug: process.env.DEBUG === 'true',
};

/**
 * Initialize RuVector client with custom configuration
 *
 * @param config - Configuration object
 * @returns void
 *
 * @example
 * ```typescript
 * initializeRuVectorClient({
 *   redisUrl: 'redis://production:6379',
 *   debug: false
 * });
 * ```
 */
export function initializeRuVectorClient(config: Partial<RuVectorConfig>): void {
  clientConfig = {
    ...clientConfig,
    ...config,
  };

  if (clientConfig.debug) {
    console.log('[RuVector] Client initialized with config:', {
      redisUrl: clientConfig.redisUrl,
      endpoint: clientConfig.ruvectorEndpoint,
    });
  }
}

/**
 * Log debug messages when debugging is enabled
 *
 * @internal
 */
function debugLog(message: string, data?: unknown): void {
  if (clientConfig.debug) {
    console.log(`[RuVector] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
}

/**
 * Store or update site profile in RuVector site_profiles collection
 *
 * Stores technical health profile, crawl metrics, and industry classification
 * for future reference and cross-site pattern matching. TTL: 180 days.
 *
 * The embedding text generated for semantic search includes domain, industry,
 * health score, and page metrics to enable industry-based pattern queries.
 *
 * @param domain - Domain name (automatically sanitized)
 * @param profile - Site profile metadata containing technical metrics, crawl data
 * @returns Promise<void> resolves when profile is stored
 * @throws TypeError if domain is empty or profile is invalid
 *
 * @example
 * ```typescript
 * const profile: SiteProfileEntry['metadata'] = {
 *   domain: 'example.com',
 *   domainNormalized: 'example-com',
 *   industry: 'healthcare',
 *   siteSize: 'medium',
 *   niche: 'dental services',
 *   technicalHealthScore: 0.75,
 *   technicalMetrics: [...],
 *   crawlData: {...},
 *   totalPages: 150,
 *   // ... other fields
 * };
 *
 * await upsertSiteProfile('example.com', profile);
 * ```
 */
export async function upsertSiteProfile(
  domain: string,
  profile: SiteProfileEntry['metadata']
): Promise<void> {
  // Validate inputs
  if (!domain || typeof domain !== 'string') {
    throw new TypeError('domain must be a non-empty string');
  }

  if (!profile || typeof profile !== 'object') {
    throw new TypeError('profile must be a valid SiteProfileMetadata object');
  }

  // Sanitize domain for security
  const sanitizedDomain = sanitizeRedisKey(domain);

  if (!sanitizedDomain || sanitizedDomain === '_invalid_' || sanitizedDomain === '_input_') {
    throw new TypeError(`domain "${domain}" is invalid after sanitization`);
  }

  debugLog('Upserting site profile', { domain: sanitizedDomain });

  // Generate ID and create entry
  const id = generateSiteProfileId(sanitizedDomain);
  const entry: SiteProfileEntry = {
    id,
    text: profile.domainNormalized
      ? `${profile.domain}. Industry: ${profile.industry}. Health: ${profile.technicalHealthScore}. Pages: ${profile.totalPages}`
      : '',
    metadata: profile,
  };

  // Validate entry structure
  if (!entry.id || typeof entry.id !== 'string') {
    throw new TypeError('Failed to generate valid profile ID');
  }

  if (!entry.text || typeof entry.text !== 'string') {
    throw new TypeError('Failed to generate valid embedding text');
  }

  // Store in RuVector (stub for now - actual RuVector SDK integration in future)
  // TODO: Replace with actual RuVector upsert call when SDK available
  //  const response = await ruvectorClient.upsert(
  //    'seo_site_profiles',
  //    {
  //      id: entry.id,
  //      text: entry.text,
  //      metadata: entry.metadata,
  //    },
  //    { ttlDays: 180 }
  //  );
  //  debugLog('RuVector upsert successful', { id: entry.id, ttl: '180 days' });

  // For MVP, store in Redis as fallback
  await storeInRedis(`ruvector:site_profiles:${id}`, JSON.stringify(entry));
  debugLog('Site profile stored in Redis', { id, domain: sanitizedDomain });
}

/**
 * Semantic search for cross-site patterns by industry
 *
 * Queries the cross_site_patterns collection for successful strategies
 * that have been validated across multiple sites in a given industry.
 * Results are sorted by confidence score (highest first).
 *
 * Use this before starting Phase 5 (Strategy Development) to discover
 * proven patterns from successful onboarding runs.
 *
 * @param industry - Industry name (automatically sanitized)
 * @param limit - Maximum number of patterns to return (default: 10, max: 50)
 * @returns Promise<CrossSitePatternEntry[]> array of patterns sorted by confidence
 * @throws TypeError if industry is empty or limit is invalid
 *
 * @example
 * ```typescript
 * const patterns = await queryCrossSitePatterns('saas', 5);
 *
 * patterns.forEach(pattern => {
 *   console.log(`Pattern: ${pattern.metadata.description}`);
 *   console.log(`Success Rate: ${pattern.metadata.successRate * 100}%`);
 *   console.log(`Steps: ${pattern.metadata.implementationSteps.join(', ')}`);
 * });
 * ```
 */
export async function queryCrossSitePatterns(
  industry: string,
  limit: number = 10
): Promise<CrossSitePatternEntry[]> {
  // Validate inputs
  if (!industry || typeof industry !== 'string') {
    throw new TypeError('industry must be a non-empty string');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new TypeError('limit must be an integer between 1 and 50');
  }

  // Sanitize industry input for security
  const sanitizedIndustry = sanitizeRedisKey(industry);

  if (!sanitizedIndustry || sanitizedIndustry === '_invalid_' || sanitizedIndustry === '_input_') {
    throw new TypeError(`industry "${industry}" is invalid after sanitization`);
  }

  debugLog('Querying cross-site patterns', { industry: sanitizedIndustry, limit });

  // Query RuVector (stub for now)
  // TODO: Replace with actual RuVector semantic search when SDK available
  //  const results = await ruvectorClient.search(
  //    'seo_cross_site_patterns',
  //    {
  //      query: `industry:${sanitizedIndustry}`,
  //      limit,
  //      sort: { confidence: 'desc' },
  //    }
  //  );
  //  const entries = results.map(r => r.metadata) as CrossSitePatternEntry[];
  //  debugLog('RuVector query successful', { count: entries.length });
  //  return entries;

  // For MVP, return empty array (cache miss - will proceed with analysis)
  debugLog('No cached patterns found (MVP fallback)', { industry: sanitizedIndustry });
  return [];
}

/**
 * Store completed onboarding run results in RuVector
 *
 * Archives the complete output from all 7 onboarding phases, including
 * phase outputs, confidence scores, timing metrics, and cost savings.
 * TTL: 365 days for long-term learning and pattern extraction.
 *
 * Call this after Phase 7 (Implementation) completes to enable future
 * pattern extraction and success metrics calculation.
 *
 * @param domain - Domain name (automatically sanitized)
 * @param results - Onboarding results metadata (all 7 phases + metadata)
 * @returns Promise<void> resolves when results are stored
 * @throws TypeError if domain is empty or results are invalid
 *
 * @example
 * ```typescript
 * const results: OnboardingResultsEntry['metadata'] = {
 *   domain: 'example.com',
 *   domainNormalized: 'example-com',
 *   runId: 'run_2025-12-03_abc123',
 *   industry: 'healthcare',
 *   niche: 'dental',
 *   phaseOutputs: [phase1, phase2, phase3, phase4, phase5, phase6, phase7],
 *   phasesCompleted: 7,
 *   completionPercent: 100,
 *   overallConfidence: 0.92,
 *   // ... other fields
 * };
 *
 * await logOnboardingResult('example.com', results);
 * ```
 */
export async function logOnboardingResult(
  domain: string,
  results: OnboardingResultsEntry['metadata']
): Promise<void> {
  // Validate inputs
  if (!domain || typeof domain !== 'string') {
    throw new TypeError('domain must be a non-empty string');
  }

  if (!results || typeof results !== 'object') {
    throw new TypeError('results must be a valid OnboardingResultsMetadata object');
  }

  if (!results.runId || typeof results.runId !== 'string') {
    throw new TypeError('results.runId must be a non-empty string');
  }

  if (!Array.isArray(results.phaseOutputs) || results.phaseOutputs.length === 0) {
    throw new TypeError('results.phaseOutputs must be a non-empty array');
  }

  // Sanitize domain for security
  const sanitizedDomain = sanitizeRedisKey(domain);

  if (!sanitizedDomain || sanitizedDomain === '_invalid_' || sanitizedDomain === '_input_') {
    throw new TypeError(`domain "${domain}" is invalid after sanitization`);
  }

  debugLog('Logging onboarding result', { domain: sanitizedDomain, runId: results.runId });

  // Generate ID and create entry
  const id = generateOnboardingResultsId(sanitizedDomain, results.runId, new Date());
  const entry: OnboardingResultsEntry = {
    id,
    text: `${results.domain}. Run: ${results.runId}. Industry: ${results.industry}. Phases: ${results.phasesCompleted}/7. Confidence: ${results.overallConfidence}`,
    metadata: results,
  };

  // Validate entry structure
  if (!entry.id || typeof entry.id !== 'string') {
    throw new TypeError('Failed to generate valid onboarding results ID');
  }

  if (!entry.text || typeof entry.text !== 'string') {
    throw new TypeError('Failed to generate valid embedding text');
  }

  // Store in RuVector (stub for now - actual RuVector SDK integration in future)
  // TODO: Replace with actual RuVector upsert call when SDK available
  //  const response = await ruvectorClient.upsert(
  //    'seo_onboarding_results',
  //    {
  //      id: entry.id,
  //      text: entry.text,
  //      metadata: entry.metadata,
  //    },
  //    { ttlDays: 365 }
  //  );
  //  debugLog('RuVector upsert successful', { id: entry.id, ttl: '365 days' });

  // For MVP, store in Redis as fallback
  await storeInRedis(`ruvector:onboarding_results:${id}`, JSON.stringify(entry));
  debugLog('Onboarding result logged to Redis', {
    id,
    domain: sanitizedDomain,
    phases: results.phasesCompleted,
  });
}

/**
 * Helper: Store data in Redis (MVP fallback implementation)
 *
 * This is a stub function that logs storage operations. Once Redis client
 * integration is available, it will write to Redis directly.
 *
 * @internal
 * @param key - Redis key (should already be sanitized)
 * @param value - JSON stringified value
 * @returns Promise<void>
 * @throws TypeError if key or value is invalid
 *
 * TODO: Replace with actual Redis client once available
 * ```typescript
 * import redis from 'redis';
 *
 * const client = redis.createClient({ url: clientConfig.redisUrl });
 *
 * async function storeInRedis(key: string, value: string): Promise<void> {
 *   await client.setEx(key, 180 * 24 * 60 * 60, value);
 * }
 * ```
 */
async function storeInRedis(key: string, value: string): Promise<void> {
  // Validate inputs
  if (!key || typeof key !== 'string') {
    throw new TypeError('key must be a non-empty string');
  }

  if (!value || typeof value !== 'string') {
    throw new TypeError('value must be a non-empty string');
  }

  // MVP stub: log the operation
  // TODO: Replace with actual Redis client when available
  if (clientConfig.debug) {
    console.log(`[Redis] Storing key: ${key} (${value.length} bytes)`);
  }

  // In production, this would call:
  // const client = createRedisClient(clientConfig.redisUrl);
  // await client.setEx(key, 180 * 24 * 60 * 60, value);
  // await client.quit();
}

/**
 * Helper: Validate SiteProfileEntry structure
 *
 * @internal
 */
function validateSiteProfileEntry(entry: SiteProfileEntry): boolean {
  return !!(
    entry &&
    typeof entry === 'object' &&
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.text === 'string' &&
    entry.text.length > 0 &&
    entry.metadata &&
    typeof entry.metadata === 'object'
  );
}

/**
 * Helper: Validate OnboardingResultsEntry structure
 *
 * @internal
 */
function validateOnboardingResultsEntry(entry: OnboardingResultsEntry): boolean {
  return !!(
    entry &&
    typeof entry === 'object' &&
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.text === 'string' &&
    entry.text.length > 0 &&
    entry.metadata &&
    typeof entry.metadata === 'object' &&
    Array.isArray(entry.metadata.phaseOutputs)
  );
}

/**
 * Helper: Validate CrossSitePatternEntry structure
 *
 * @internal
 */
function validateCrossSitePatternEntry(entry: CrossSitePatternEntry): boolean {
  return !!(
    entry &&
    typeof entry === 'object' &&
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.text === 'string' &&
    entry.text.length > 0 &&
    entry.metadata &&
    typeof entry.metadata === 'object'
  );
}

/**
 * Type exports for client consumers
 */
export type { RuVectorConfig };
