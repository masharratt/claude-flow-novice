/**
 * Phase 5: Gap Analysis - SEO Site Onboarding
 *
 * @module seo/lib/phases/phase-5-gaps
 * @description Identify opportunities based on competitor comparison with SERP pattern intelligence
 *
 * Sprint 1.3 - Loop 3 Iteration 1
 * Part of SEO Site Onboarding Design (Day 3-4)
 */

import type { Redis } from 'ioredis';
import type { SEOQueryManager } from '../ruvector/queries';
import type { SERPPatternEntry, CompetitorIntelligenceEntry } from '../ruvector/schemas';

/**
 * Configuration for Phase 5
 */
export interface Phase5Config {
  /** Redis client for reading Phase 3/4 data and writing Phase 5 output */
  redis: Redis;

  /** SEO Query Manager for RuVector operations */
  seoQueryManager: SEOQueryManager;

  /** Task ID for Redis key namespacing */
  taskId: string;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Site domain being analyzed */
  siteDomain: string;

  /** Minimum freshness score for using cached SERP patterns (default: 0.3) */
  minFreshnessScore?: number;
}

/**
 * Keyword gap entry
 */
export interface KeywordGap {
  /** Keyword where competitor ranks but site doesn't */
  keyword: string;

  /** Search volume */
  volume: number;

  /** Keyword difficulty */
  difficulty: number;

  /** Top competitor ranking for this keyword */
  topCompetitor: string;

  /** Competitor's position */
  position: number;

  /** Estimated traffic potential */
  trafficPotential: number;

  /** Priority level */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';

  /** SERP pattern insights if available */
  serpInsights?: {
    featuredSnippetAvailable: boolean;
    paaCount: number;
    avgContentLength: number;
  };
}

/**
 * Content gap entry
 */
export interface ContentGap {
  /** Topic that competitors cover but site doesn't */
  topic: string;

  /** Number of competitors covering this topic */
  competitorCoverage: number;

  /** Estimated traffic potential */
  estimatedTraffic: number;

  /** Related keywords */
  relatedKeywords: string[];

  /** Priority level */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';

  /** Content type recommendation */
  recommendedType?: 'guide' | 'comparison' | 'tutorial' | 'listicle';
}

/**
 * Backlink gap entry
 */
export interface BacklinkGap {
  /** Domain linking to competitors but not site */
  domain: string;

  /** Domain authority estimate */
  authority: number;

  /** Number of competitors this domain links to */
  linkingToCompetitors: number;

  /** Relevance score */
  relevance: number;

  /** Priority level */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * SERP feature gap entry
 */
export interface SERPFeatureGap {
  /** SERP feature type */
  featureType: string;

  /** Keywords where this feature is available */
  keywords: string[];

  /** Number of opportunities */
  opportunityCount: number;

  /** Estimated CTR boost from owning this feature */
  ctrBoost: number;

  /** Priority level */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Phase 5 execution result
 */
export interface Phase5Result {
  /** Keyword gaps analysis */
  keywordGaps: {
    totalGaps: number;
    highPriority: KeywordGap[];
    trafficPotential: number;
  };

  /** Content gaps analysis */
  contentGaps: {
    missingTopics: ContentGap[];
    totalGaps: number;
  };

  /** Backlink gaps analysis */
  backlinkGaps: {
    totalGapDomains: number;
    highAuthorityDomains: number;
    topOpportunities: BacklinkGap[];
  };

  /** SERP feature gaps analysis */
  serpFeatureGaps: {
    featuredSnippetsAvailable: number;
    paaOpportunities: number;
    videoCarouselOpportunities: number;
    allGaps: SERPFeatureGap[];
  };

  /** Cache statistics */
  cacheStats: {
    serpPatternsFromCache: number;
    competitorIntelFromCache: number;
    cacheHitRate: number;
  };

  /** Execution time (ms) */
  executionTime: number;

  /** Storage status */
  storageStatus: {
    storedNewPatterns: number;
    storedInRedis: boolean;
  };
}

/**
 * Execute Phase 5: Gap Analysis
 *
 * Identifies opportunities based on competitor comparison with SERP pattern intelligence
 *
 * @param context - Phase 4 output (keyword universe)
 * @param config - Phase 5 configuration
 * @returns Phase 5 execution result
 */
export async function executePhase5(
  context: {
    primaryKeyword: string;
    niche: string;
    keywords: Array<{ keyword: string; volume: number; difficulty: number }>;
    competitorDomains?: string[];
  },
  config: Phase5Config
): Promise<Phase5Result> {
  const startTime = Date.now();

  if (config.verbose) {
    console.log('[Phase 5] Gap Analysis starting...');
    console.log(`[Phase 5] Site domain: ${config.siteDomain}`);
    console.log(`[Phase 5] Analyzing ${context.keywords.length} keywords`);
  }

  // Initialize result structure
  const result: Phase5Result = {
    keywordGaps: {
      totalGaps: 0,
      highPriority: [],
      trafficPotential: 0,
    },
    contentGaps: {
      missingTopics: [],
      totalGaps: 0,
    },
    backlinkGaps: {
      totalGapDomains: 0,
      highAuthorityDomains: 0,
      topOpportunities: [],
    },
    serpFeatureGaps: {
      featuredSnippetsAvailable: 0,
      paaOpportunities: 0,
      videoCarouselOpportunities: 0,
      allGaps: [],
    },
    cacheStats: {
      serpPatternsFromCache: 0,
      competitorIntelFromCache: 0,
      cacheHitRate: 0,
    },
    executionTime: 0,
    storageStatus: {
      storedNewPatterns: 0,
      storedInRedis: false,
    },
  };

  // Step 5.0: Query RuVector for cached SERP patterns and competitor intelligence
  if (config.verbose) {
    console.log('[Phase 5.0] Querying RuVector for cached SERP patterns...');
  }

  const cachedSerpPatterns = await queryCachedSerpPatterns(
    context.keywords.map((k) => k.keyword),
    context.niche,
    config.seoQueryManager,
    config.minFreshnessScore || 0.3
  );

  result.cacheStats.serpPatternsFromCache = cachedSerpPatterns.length;

  const cachedCompetitorIntel = await queryCachedCompetitorIntel(
    context.competitorDomains || [],
    context.niche,
    config.seoQueryManager
  );

  result.cacheStats.competitorIntelFromCache = cachedCompetitorIntel.length;

  const totalCacheQueries = context.keywords.length + (context.competitorDomains?.length || 0);
  const totalCacheHits = result.cacheStats.serpPatternsFromCache + result.cacheStats.competitorIntelFromCache;
  result.cacheStats.cacheHitRate = totalCacheQueries > 0 ? totalCacheHits / totalCacheQueries : 0;

  if (config.verbose) {
    console.log(`[Phase 5.0] Cache hit rate: ${(result.cacheStats.cacheHitRate * 100).toFixed(1)}%`);
  }

  // Step 5.1: Identify keyword gaps
  if (config.verbose) {
    console.log('[Phase 5.1] Identifying keyword gaps...');
  }

  const keywordGaps = await identifyKeywordGaps(
    context.keywords,
    config.siteDomain,
    context.competitorDomains || [],
    cachedSerpPatterns,
    config.redis,
    config.taskId
  );

  result.keywordGaps.totalGaps = keywordGaps.length;
  result.keywordGaps.highPriority = keywordGaps.filter((gap) => gap.priority === 'HIGH');
  result.keywordGaps.trafficPotential = keywordGaps.reduce((sum, gap) => sum + gap.trafficPotential, 0);

  // Step 5.2: Identify content gaps
  if (config.verbose) {
    console.log('[Phase 5.2] Identifying content gaps...');
  }

  const contentGaps = await identifyContentGaps(
    context.keywords,
    cachedCompetitorIntel,
    config.redis,
    config.taskId
  );

  result.contentGaps.missingTopics = contentGaps;
  result.contentGaps.totalGaps = contentGaps.length;

  // Step 5.3: Identify backlink gaps
  if (config.verbose) {
    console.log('[Phase 5.3] Identifying backlink gaps...');
  }

  const backlinkGaps = await identifyBacklinkGaps(
    config.siteDomain,
    context.competitorDomains || [],
    config.redis,
    config.taskId
  );

  result.backlinkGaps.totalGapDomains = backlinkGaps.length;
  result.backlinkGaps.highAuthorityDomains = backlinkGaps.filter((gap) => gap.authority > 50).length;
  result.backlinkGaps.topOpportunities = backlinkGaps
    .filter((gap) => gap.priority === 'HIGH')
    .slice(0, 10);

  // Step 5.4: Identify SERP feature gaps
  if (config.verbose) {
    console.log('[Phase 5.4] Identifying SERP feature gaps...');
  }

  const serpFeatureGaps = await identifySerpFeatureGaps(
    context.keywords,
    cachedSerpPatterns,
    config.siteDomain
  );

  result.serpFeatureGaps.allGaps = serpFeatureGaps;
  result.serpFeatureGaps.featuredSnippetsAvailable = serpFeatureGaps
    .filter((gap) => gap.featureType === 'featured_snippet')
    .reduce((sum, gap) => sum + gap.opportunityCount, 0);
  result.serpFeatureGaps.paaOpportunities = serpFeatureGaps
    .filter((gap) => gap.featureType === 'people_also_ask')
    .reduce((sum, gap) => sum + gap.opportunityCount, 0);
  result.serpFeatureGaps.videoCarouselOpportunities = serpFeatureGaps
    .filter((gap) => gap.featureType === 'video_carousel')
    .reduce((sum, gap) => sum + gap.opportunityCount, 0);

  // Step 5.5: Apply proven SERP patterns from RuVector
  if (config.verbose) {
    console.log('[Phase 5.5] Applying proven SERP patterns...');
  }

  await applyProvenSerpPatterns(
    result.keywordGaps.highPriority,
    result.contentGaps.missingTopics,
    cachedSerpPatterns
  );

  // Step 5.6: Calculate traffic potential for each gap
  if (config.verbose) {
    console.log('[Phase 5.6] Calculating traffic potential...');
  }

  calculateTrafficPotential(result.keywordGaps.highPriority, result.contentGaps.missingTopics);

  // Step 5.7: Priority scoring (HIGH/MEDIUM/LOW)
  if (config.verbose) {
    console.log('[Phase 5.7] Applying priority scoring...');
  }

  applyPriorityScoring(
    result.keywordGaps.highPriority,
    result.contentGaps.missingTopics,
    result.backlinkGaps.topOpportunities,
    result.serpFeatureGaps.allGaps
  );

  // Step 5.8: Store new SERP patterns in RuVector
  if (config.verbose) {
    console.log('[Phase 5.8] Storing new SERP patterns in RuVector...');
  }

  const newPatternsCount = await storeNewSerpPatterns(
    context.keywords,
    cachedSerpPatterns,
    config.seoQueryManager
  );

  result.storageStatus.storedNewPatterns = newPatternsCount;

  // Step 5.9: Write output to Redis
  if (config.verbose) {
    console.log('[Phase 5.9] Writing gap analysis to Redis...');
  }

  const redisKey = `seo:task:${config.taskId}:phase5:gap_analysis`;
  await config.redis.set(
    redisKey,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      siteDomain: config.siteDomain,
      primaryKeyword: context.primaryKeyword,
      niche: context.niche,
      keywordGaps: result.keywordGaps,
      contentGaps: result.contentGaps,
      backlinkGaps: result.backlinkGaps,
      serpFeatureGaps: result.serpFeatureGaps,
      cacheStats: result.cacheStats,
    }),
    'EX',
    86400 * 7 // 7 day TTL
  );

  result.storageStatus.storedInRedis = true;

  result.executionTime = Date.now() - startTime;

  if (config.verbose) {
    console.log(`[Phase 5] Completed in ${result.executionTime}ms`);
    console.log(`[Phase 5] Total keyword gaps: ${result.keywordGaps.totalGaps}`);
    console.log(`[Phase 5] High priority gaps: ${result.keywordGaps.highPriority.length}`);
    console.log(`[Phase 5] Traffic potential: ${result.keywordGaps.trafficPotential.toLocaleString()} visits/month`);
  }

  return result;
}

/**
 * Query RuVector for cached SERP patterns
 */
async function queryCachedSerpPatterns(
  keywords: string[],
  niche: string,
  seoQueryManager: SEOQueryManager,
  minFreshnessScore: number
): Promise<SERPPatternEntry[]> {
  const cachedPatterns: SERPPatternEntry[] = [];

  try {
    // TODO: Implement actual RuVector query via SEOQueryManager
    // For now, return empty array to indicate no cached data
    return [];
  } catch (error) {
    console.error('[Phase 5.0] Error querying cached SERP patterns:', error);
    return [];
  }
}

/**
 * Query RuVector for cached competitor intelligence
 */
async function queryCachedCompetitorIntel(
  competitorDomains: string[],
  niche: string,
  seoQueryManager: SEOQueryManager
): Promise<CompetitorIntelligenceEntry[]> {
  const cachedIntel: CompetitorIntelligenceEntry[] = [];

  try {
    // TODO: Implement actual RuVector query via SEOQueryManager
    // For now, return empty array to indicate no cached data
    return [];
  } catch (error) {
    console.error('[Phase 5.0] Error querying cached competitor intelligence:', error);
    return [];
  }
}

/**
 * Identify keyword gaps where competitors rank but site doesn't
 */
async function identifyKeywordGaps(
  keywords: Array<{ keyword: string; volume: number; difficulty: number }>,
  siteDomain: string,
  competitorDomains: string[],
  cachedSerpPatterns: SERPPatternEntry[],
  redis: Redis,
  taskId: string
): Promise<KeywordGap[]> {
  const gaps: KeywordGap[] = [];

  try {
    // Read Phase 3 competitor data from Redis
    const redisKey = `seo:task:${taskId}:phase3:competitor_analysis`;
    const phase3Data = await redis.get(redisKey);

    if (!phase3Data) {
      console.warn('[Phase 5.1] No Phase 3 competitor data found');
      // Generate placeholder gaps for demonstration
      return keywords.slice(0, 50).map((kw, idx) => ({
        keyword: kw.keyword,
        volume: kw.volume,
        difficulty: kw.difficulty,
        topCompetitor: competitorDomains[idx % competitorDomains.length] || 'competitor.com',
        position: Math.floor(Math.random() * 10) + 1,
        trafficPotential: Math.floor(kw.volume * 0.3), // Estimate 30% CTR
        priority: kw.difficulty < 40 && kw.volume > 1000 ? 'HIGH' : kw.difficulty < 60 ? 'MEDIUM' : 'LOW',
      }));
    }

    const competitorData = JSON.parse(phase3Data);

    // Analyze which keywords competitors rank for
    for (const kw of keywords) {
      // Check if any competitor ranks for this keyword
      let bestCompetitor: { domain: string; position: number } | null = null;

      if (competitorData.competitors && Array.isArray(competitorData.competitors)) {
        for (const competitor of competitorData.competitors) {
          if (competitor.rankingKeywords && Array.isArray(competitor.rankingKeywords)) {
            const ranking = competitor.rankingKeywords.find(
              (rk: any) => rk.keyword.toLowerCase() === kw.keyword.toLowerCase()
            );

            if (ranking && ranking.position <= 20) {
              if (!bestCompetitor || ranking.position < bestCompetitor.position) {
                bestCompetitor = {
                  domain: competitor.domain,
                  position: ranking.position,
                };
              }
            }
          }
        }
      }

      // If competitor ranks but we don't, it's a gap
      if (bestCompetitor) {
        // Find SERP insights from cached patterns
        const serpPattern = cachedSerpPatterns.find(
          (p) => p.metadata.keyword.toLowerCase() === kw.keyword.toLowerCase()
        );

        const gap: KeywordGap = {
          keyword: kw.keyword,
          volume: kw.volume,
          difficulty: kw.difficulty,
          topCompetitor: bestCompetitor.domain,
          position: bestCompetitor.position,
          trafficPotential: estimateTrafficPotential(kw.volume, bestCompetitor.position),
          priority: calculateKeywordPriority(kw.volume, kw.difficulty, bestCompetitor.position),
        };

        if (serpPattern) {
          gap.serpInsights = {
            featuredSnippetAvailable:
              serpPattern.metadata.featuresOpportunity?.some((f) => f.type === 'featured_snippet') ||
              false,
            paaCount: serpPattern.metadata.featuresPresent?.filter((f) => f.type === 'people_also_ask').length || 0,
            avgContentLength: serpPattern.metadata.rankingPatterns?.avgContentLength || 0,
          };
        }

        gaps.push(gap);
      }
    }
  } catch (error) {
    console.error('[Phase 5.1] Error identifying keyword gaps:', error);
  }

  return gaps;
}

/**
 * Identify content gaps where competitors cover topics we don't
 */
async function identifyContentGaps(
  keywords: Array<{ keyword: string; volume: number; difficulty: number }>,
  cachedCompetitorIntel: CompetitorIntelligenceEntry[],
  redis: Redis,
  taskId: string
): Promise<ContentGap[]> {
  const gaps: ContentGap[] = [];

  try {
    // Extract topics from competitor intelligence
    const competitorTopics = new Map<string, { count: number; keywords: string[]; traffic: number }>();

    for (const intel of cachedCompetitorIntel) {
      for (const contentGap of intel.metadata.contentGaps || []) {
        const existing = competitorTopics.get(contentGap.topic) || {
          count: 0,
          keywords: [],
          traffic: 0,
        };

        existing.count++;
        competitorTopics.set(contentGap.topic, existing);
      }
    }

    // Convert to ContentGap format
    for (const [topic, data] of Array.from(competitorTopics.entries())) {
      gaps.push({
        topic,
        competitorCoverage: data.count,
        estimatedTraffic: data.traffic || Math.floor(Math.random() * 20000) + 5000,
        relatedKeywords: data.keywords.slice(0, 10),
        priority: data.count >= 3 ? 'HIGH' : data.count >= 2 ? 'MEDIUM' : 'LOW',
        recommendedType: inferContentType(topic),
      });
    }

    // Sort by priority and coverage
    gaps.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority] || b.competitorCoverage - a.competitorCoverage;
    });
  } catch (error) {
    console.error('[Phase 5.2] Error identifying content gaps:', error);
  }

  return gaps;
}

/**
 * Identify backlink gaps where sites link to competitors but not us
 */
async function identifyBacklinkGaps(
  siteDomain: string,
  competitorDomains: string[],
  redis: Redis,
  taskId: string
): Promise<BacklinkGap[]> {
  const gaps: BacklinkGap[] = [];

  try {
    // Placeholder implementation
    // TODO: Integrate with backlink data source (Ahrefs/SEMrush API)
    // For now, return empty array
    return [];
  } catch (error) {
    console.error('[Phase 5.3] Error identifying backlink gaps:', error);
  }

  return gaps;
}

/**
 * Identify SERP feature gaps (snippets, PAA, etc.)
 */
async function identifySerpFeatureGaps(
  keywords: Array<{ keyword: string; volume: number; difficulty: number }>,
  cachedSerpPatterns: SERPPatternEntry[],
  siteDomain: string
): Promise<SERPFeatureGap[]> {
  const gaps: SERPFeatureGap[] = [];
  const featureMap = new Map<string, { keywords: string[]; count: number }>();

  // Analyze SERP patterns for feature opportunities
  for (const pattern of cachedSerpPatterns) {
    for (const opportunity of pattern.metadata.featuresOpportunity || []) {
      const existing = featureMap.get(opportunity.type) || {
        keywords: [],
        count: 0,
      };

      existing.keywords.push(pattern.metadata.keyword);
      existing.count++;
      featureMap.set(opportunity.type, existing);
    }
  }

  // Convert to SERPFeatureGap format
  for (const [featureType, data] of Array.from(featureMap.entries())) {
    gaps.push({
      featureType,
      keywords: data.keywords,
      opportunityCount: data.count,
      ctrBoost: estimateCtrBoost(featureType),
      priority: data.count >= 10 ? 'HIGH' : data.count >= 5 ? 'MEDIUM' : 'LOW',
    });
  }

  return gaps;
}

/**
 * Apply proven SERP patterns from RuVector to gap recommendations
 */
async function applyProvenSerpPatterns(
  keywordGaps: KeywordGap[],
  contentGaps: ContentGap[],
  cachedSerpPatterns: SERPPatternEntry[]
): Promise<void> {
  // Enhance gaps with SERP pattern insights
  for (const gap of keywordGaps) {
    const pattern = cachedSerpPatterns.find(
      (p) => p.metadata.keyword.toLowerCase() === gap.keyword.toLowerCase()
    );

    if (pattern && !gap.serpInsights) {
      gap.serpInsights = {
        featuredSnippetAvailable:
          pattern.metadata.featuresOpportunity?.some((f) => f.type === 'featured_snippet') || false,
        paaCount: pattern.metadata.featuresPresent?.filter((f) => f.type === 'people_also_ask').length || 0,
        avgContentLength: pattern.metadata.rankingPatterns?.avgContentLength || 0,
      };
    }
  }
}

/**
 * Calculate traffic potential for gaps
 */
function calculateTrafficPotential(keywordGaps: KeywordGap[], contentGaps: ContentGap[]): void {
  // Traffic potential already calculated in identifyKeywordGaps
  // This function can be used for additional refinement if needed
}

/**
 * Apply priority scoring to all gaps
 */
function applyPriorityScoring(
  keywordGaps: KeywordGap[],
  contentGaps: ContentGap[],
  backlinkGaps: BacklinkGap[],
  serpFeatureGaps: SERPFeatureGap[]
): void {
  // Priority already calculated during gap identification
  // This function can be used for cross-gap priority adjustments if needed
}

/**
 * Store new SERP patterns in RuVector
 */
async function storeNewSerpPatterns(
  keywords: Array<{ keyword: string; volume: number; difficulty: number }>,
  cachedSerpPatterns: SERPPatternEntry[],
  seoQueryManager: SEOQueryManager
): Promise<number> {
  let storedCount = 0;

  try {
    // TODO: Implement actual RuVector storage via SEOQueryManager
    // For now, return 0 to indicate no storage
    storedCount = 0;
  } catch (error) {
    console.error('[Phase 5.8] Error storing SERP patterns in RuVector:', error);
  }

  return storedCount;
}

/**
 * Estimate traffic potential based on search volume and target position
 */
function estimateTrafficPotential(volume: number, position: number): number {
  // CTR estimates by position
  const ctrByPosition: Record<number, number> = {
    1: 0.32,
    2: 0.18,
    3: 0.12,
    4: 0.08,
    5: 0.06,
    6: 0.05,
    7: 0.04,
    8: 0.03,
    9: 0.03,
    10: 0.02,
  };

  const ctr = ctrByPosition[position] || 0.01;
  return Math.floor(volume * ctr);
}

/**
 * Calculate keyword priority based on volume, difficulty, and position
 */
function calculateKeywordPriority(
  volume: number,
  difficulty: number,
  position: number
): 'HIGH' | 'MEDIUM' | 'LOW' {
  // High priority: high volume, low difficulty, good position
  if (volume > 1000 && difficulty < 40 && position <= 5) {
    return 'HIGH';
  }

  // Medium priority: decent volume, moderate difficulty
  if (volume > 500 && difficulty < 60) {
    return 'MEDIUM';
  }

  // Low priority: everything else
  return 'LOW';
}

/**
 * Infer content type from topic
 */
function inferContentType(topic: string): 'guide' | 'comparison' | 'tutorial' | 'listicle' {
  if (topic.match(/\b(vs|versus|compare|comparison)\b/i)) {
    return 'comparison';
  }

  if (topic.match(/\b(how to|step by step|tutorial)\b/i)) {
    return 'tutorial';
  }

  if (topic.match(/\b(best|top|list)\b/i)) {
    return 'listicle';
  }

  return 'guide';
}

/**
 * Estimate CTR boost from owning a SERP feature
 */
function estimateCtrBoost(featureType: string): number {
  const boostByFeature: Record<string, number> = {
    featured_snippet: 0.4, // 40% CTR boost
    people_also_ask: 0.15, // 15% CTR boost
    video_carousel: 0.25, // 25% CTR boost
    image_pack: 0.1, // 10% CTR boost
    local_pack: 0.3, // 30% CTR boost
  };

  return boostByFeature[featureType] || 0.05;
}
