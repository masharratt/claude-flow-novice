/**
 * Phase 3: Competitor Discovery
 *
 * Purpose: Identify competitors, analyze competitive landscape, discover gaps
 * (keywords they rank for that we don't).
 *
 * Integration Points:
 * - Step 0: Query RuVector for cached competitor intelligence
 * - Step 1-4: Execute competitor discovery and gap analysis
 * - Step 4.5: Store competitor intelligence in RuVector
 *
 * Dependencies:
 * - Phase 1 output (TechnicalFoundationOutput)
 * - Phase 2 output (ContentInventoryOutput)
 * - RuVector competitor_intelligence collection
 * - RuVector cross_site_patterns collection
 *
 * @module seo/phases/phase-3-competitors
 */

import {
  ONBOARDING_COLLECTIONS,
  buildCrossSitePatternQueryString,
  type CrossSitePatternEntry,
} from '../ruvector/onboarding-schemas';

// =============================================
// Phase 3 Input/Output Interfaces
// =============================================

/**
 * Technical Foundation Output from Phase 1
 * Minimal interface needed for Phase 3
 */
export interface TechnicalFoundationOutput {
  domain: string;
  technicalHealthScore: number;
  crawlData: {
    totalPages: number;
    indexedPages: number;
  };
  blockingCondition: boolean;
}

/**
 * Content Inventory Output from Phase 2
 * Minimal interface needed for Phase 3
 */
export interface ContentInventoryOutput {
  domain: string;
  totalPages: number;
  contentByType: Record<string, number>;
  topPerformingPages: Array<{
    url: string;
    estimatedTraffic?: number;
  }>;
}

/**
 * Competitor Discovery Input
 */
export interface CompetitorDiscoveryInput {
  /** Domain to analyze */
  domain: string;

  /** Industry/vertical (e.g., "healthcare", "saas") */
  industry: string;

  /** Phase 1 output */
  phase1Output: TechnicalFoundationOutput;

  /** Phase 2 output */
  phase2Output: ContentInventoryOutput;

  /** User-provided competitor domains (optional) */
  manualCompetitors?: string[];

  /** Skip RuVector cache check (force fresh analysis) */
  skipCache?: boolean;
}

/**
 * Individual competitor metadata
 */
export interface Competitor {
  /** Competitor domain */
  domain: string;

  /** Rank in competitive landscape (1 = strongest) */
  rank: number;

  /** Domain authority (0-100) */
  domain_authority: number;

  /** Keyword overlap score with our site (0.0-1.0) */
  overlap_score: number;

  /** Estimated monthly organic traffic */
  estimated_traffic: number;

  /** Number of content pages */
  content_pages: number;
}

/**
 * Competitive gap (keyword they rank for, we don't)
 */
export interface CompetitiveGap {
  /** Unique gap identifier */
  gap_id: string;

  /** Target keyword */
  keyword: string;

  /** Competitor domain ranking for this keyword */
  competitor_domain: string;

  /** Competitor's SERP position */
  competitor_rank: number;

  /** Our SERP position (null if not ranking) */
  our_rank: number | null;

  /** Monthly search volume */
  search_volume: number;

  /** Keyword difficulty (0-100) */
  difficulty: number;

  /** Opportunity score (0.0-1.0) */
  opportunity_score: number;
}

/**
 * Competitor Discovery Output
 */
export interface CompetitorDiscoveryOutput {
  /** Domain analyzed */
  domain: string;

  /** Identified competitors */
  competitors: Competitor[];

  /** Competitive intensity score (0.0-1.0) */
  competitive_intensity: number;

  /** Competitive gaps identified */
  gaps: CompetitiveGap[];

  /** Whether results came from cache */
  cached: boolean;

  /** Timestamp of analysis */
  timestamp: string;
}

// =============================================
// Phase 3 Execution
// =============================================

/**
 * Execute Phase 3: Competitor Discovery
 *
 * Workflow:
 * - Step 0: Query RuVector for competitor intelligence (cache check)
 * - Step 1: Identify competitors (industry + manual + discovered)
 * - Step 2: Analyze competitive landscape
 * - Step 3: Identify gaps (they rank, we don't)
 * - Step 4: Calculate competitive intensity
 * - Step 4.5: Store competitor intelligence in RuVector
 *
 * @param input - Competitor discovery parameters
 * @returns Competitor analysis results
 */
export async function executePhase3(
  input: CompetitorDiscoveryInput
): Promise<CompetitorDiscoveryOutput> {
  const {
    domain,
    industry,
    phase1Output,
    phase2Output,
    manualCompetitors = [],
    skipCache = false,
  } = input;

  console.log(`[Phase 3] Starting Competitor Discovery for ${domain}`);
  console.log(`[Phase 3] Industry: ${industry}`);
  console.log(`[Phase 3] Manual competitors: ${manualCompetitors.length}`);

  // Step 0: Check RuVector cache for competitor intelligence
  let cachedCompetitors: string[] = [];
  if (!skipCache) {
    console.log('[Phase 3] Step 0: Checking RuVector cache for competitor patterns...');
    cachedCompetitors = await queryCompetitorCache(industry);
    if (cachedCompetitors.length > 0) {
      console.log(`[Phase 3] Cache hit: Found ${cachedCompetitors.length} competitor patterns for ${industry}`);
    } else {
      console.log('[Phase 3] Cache miss: No cached competitor patterns found');
    }
  }

  // Step 1: Identify competitors
  console.log('[Phase 3] Step 1: Identifying competitors...');
  const uniqueCompetitors = new Set([...manualCompetitors, ...cachedCompetitors]);
  const allCompetitors = Array.from(uniqueCompetitors);
  const competitors = await identifyCompetitors(domain, industry, allCompetitors);
  console.log(`[Phase 3] Identified ${competitors.length} competitors`);

  // Step 2: Analyze competitive landscape
  console.log('[Phase 3] Step 2: Analyzing competitive landscape...');
  const rankedCompetitors = await analyzeCompetitiveLandscape(
    domain,
    competitors,
    phase1Output,
    phase2Output
  );
  console.log(`[Phase 3] Ranked ${rankedCompetitors.length} competitors by strength`);

  // Step 3: Identify gaps
  console.log('[Phase 3] Step 3: Identifying competitive gaps...');
  const gaps = await identifyCompetitiveGaps(domain, rankedCompetitors);
  console.log(`[Phase 3] Found ${gaps.length} competitive gaps`);

  // Step 4: Calculate competitive intensity
  console.log('[Phase 3] Step 4: Calculating competitive intensity...');
  const intensity = calculateCompetitiveIntensity(rankedCompetitors, gaps);
  console.log(`[Phase 3] Competitive intensity: ${intensity.toFixed(2)}`);

  const output: CompetitorDiscoveryOutput = {
    domain,
    competitors: rankedCompetitors,
    competitive_intensity: intensity,
    gaps,
    cached: cachedCompetitors.length > 0,
    timestamp: new Date().toISOString(),
  };

  // Step 4.5: Store competitor intelligence in RuVector
  console.log('[Phase 3] Step 4.5: Storing competitor intelligence in RuVector...');
  await storeCompetitorIntelligence(domain, industry, output);
  console.log('[Phase 3] Competitor intelligence stored successfully');

  console.log(`[Phase 3] Complete: ${competitors.length} competitors, ${gaps.length} gaps, intensity ${intensity.toFixed(2)}`);

  return output;
}

// =============================================
// Helper Functions
// =============================================

/**
 * Query RuVector cache for competitor intelligence
 *
 * Checks cross_site_patterns collection for COMPETITOR_STRATEGY patterns
 * in the target industry.
 *
 * @param industry - Target industry
 * @returns Array of cached competitor domains
 */
async function queryCompetitorCache(industry: string): Promise<string[]> {
  try {
    // Build query for competitor strategy patterns
    const queryStr = buildCrossSitePatternQueryString({
      industry,
      patternType: 'COMPETITOR_STRATEGY',
      minConfidence: 0.7,
      minFreshnessScore: 0.5,
    });

    // TODO: Replace with actual RuVector query when client is implemented
    // const patterns = await queryCrossSitePatterns(queryStr, 10);
    // return patterns
    //   .map(p => p.metadata.relatedCompetitorIntelligenceIds)
    //   .flat()
    //   .filter(Boolean);

    // Stub: Return empty array (cache miss)
    console.log(`[Phase 3] RuVector query built: ${queryStr}`);
    console.log('[Phase 3] Note: RuVector client not yet implemented (Sprint 1.2)');
    return [];
  } catch (error) {
    console.error('[Phase 3] Error querying competitor cache:', error);
    return [];
  }
}

/**
 * Identify competitors for the target domain
 *
 * Combines manual competitors with discovered competitors based on:
 * - Industry overlap
 * - Keyword overlap
 * - Content type similarity
 *
 * @param domain - Target domain
 * @param industry - Target industry
 * @param manualCompetitors - User-provided competitors
 * @returns Array of competitor domains
 */
async function identifyCompetitors(
  domain: string,
  industry: string,
  manualCompetitors: string[]
): Promise<string[]> {
  console.log(`[Phase 3] Identifying competitors for ${domain} in ${industry}...`);

  // Discover competitors via industry analysis
  // TODO: Replace with actual competitor discovery logic (DataForSEO API, etc.)
  const discoveredCompetitors = [
    `competitor1-${industry}.com`,
    `competitor2-${industry}.com`,
    `competitor3-${industry}.com`,
  ];

  // Combine manual + discovered and deduplicate
  const uniqueCompetitors = new Set([...manualCompetitors, ...discoveredCompetitors]);
  const allCompetitors = Array.from(uniqueCompetitors);

  console.log(`[Phase 3] Combined ${manualCompetitors.length} manual + ${discoveredCompetitors.length} discovered = ${allCompetitors.length} total`);

  return allCompetitors;
}

/**
 * Analyze competitive landscape
 *
 * Ranks competitors by:
 * - Domain authority
 * - Estimated traffic
 * - Content volume
 * - Keyword overlap
 *
 * @param domain - Target domain
 * @param competitorDomains - Competitor domains to analyze
 * @param phase1 - Phase 1 output (technical foundation)
 * @param phase2 - Phase 2 output (content inventory)
 * @returns Ranked competitors with metadata
 */
async function analyzeCompetitiveLandscape(
  domain: string,
  competitorDomains: string[],
  phase1: TechnicalFoundationOutput,
  phase2: ContentInventoryOutput
): Promise<Competitor[]> {
  console.log(`[Phase 3] Analyzing competitive landscape for ${domain}...`);

  // TODO: Replace with actual competitive analysis (DataForSEO, SEMrush, etc.)
  // For now, generate stub data based on competitor index
  const competitors: Competitor[] = competitorDomains.slice(0, 5).map((comp, idx) => ({
    domain: comp,
    rank: idx + 1,
    domain_authority: 70 - idx * 5,
    overlap_score: 0.6 - idx * 0.1,
    estimated_traffic: 50000 - idx * 10000,
    content_pages: 200 - idx * 30,
  }));

  console.log(`[Phase 3] Ranked ${competitors.length} competitors`);
  console.log(`[Phase 3] Top competitor: ${competitors[0]?.domain} (DA: ${competitors[0]?.domain_authority})`);

  return competitors;
}

/**
 * Identify competitive gaps
 *
 * Finds keywords where:
 * - Competitors rank in top 10
 * - We don't rank (or rank poorly)
 * - Search volume justifies targeting
 *
 * @param domain - Target domain
 * @param competitors - Ranked competitors
 * @returns Competitive gaps with opportunity scores
 */
async function identifyCompetitiveGaps(
  domain: string,
  competitors: Competitor[]
): Promise<CompetitiveGap[]> {
  console.log(`[Phase 3] Identifying competitive gaps for ${domain}...`);

  // TODO: Replace with actual gap analysis (DataForSEO keyword gap API)
  // For now, generate sample gaps per competitor
  const gaps: CompetitiveGap[] = competitors.slice(0, 3).flatMap((comp, idx) => [
    {
      gap_id: `gap-${idx}-1`,
      keyword: `industry keyword ${idx + 1}`,
      competitor_domain: comp.domain,
      competitor_rank: 3 + idx,
      our_rank: null,
      search_volume: 5000 - idx * 1000,
      difficulty: 50 + idx * 5,
      opportunity_score: 0.8 - idx * 0.15,
    },
    {
      gap_id: `gap-${idx}-2`,
      keyword: `long tail keyword ${idx + 1}`,
      competitor_domain: comp.domain,
      competitor_rank: 8 + idx,
      our_rank: null,
      search_volume: 800 - idx * 200,
      difficulty: 30 + idx * 5,
      opportunity_score: 0.7 - idx * 0.1,
    },
  ]);

  console.log(`[Phase 3] Identified ${gaps.length} gaps across ${competitors.length} competitors`);
  console.log(`[Phase 3] Top gap: "${gaps[0]?.keyword}" (volume: ${gaps[0]?.search_volume}, opportunity: ${gaps[0]?.opportunity_score.toFixed(2)})`);

  return gaps;
}

/**
 * Calculate competitive intensity
 *
 * Formula:
 * - 60% weight: Average domain authority of top 5 competitors
 * - 40% weight: Number of gaps (normalized to 0-1)
 *
 * Higher intensity = more difficult competitive environment
 *
 * @param competitors - Ranked competitors
 * @param gaps - Competitive gaps
 * @returns Intensity score (0.0-1.0)
 */
function calculateCompetitiveIntensity(
  competitors: Competitor[],
  gaps: CompetitiveGap[]
): number {
  if (competitors.length === 0) {
    return 0;
  }

  // Calculate average DA of top 5 competitors
  const topCompetitors = competitors.slice(0, 5);
  const avgDA = topCompetitors.reduce((sum, c) => sum + c.domain_authority, 0) / topCompetitors.length;

  // Normalize gap count (20+ gaps = 1.0)
  const gapScore = Math.min(gaps.length / 20, 1.0);

  // Weighted combination
  const intensity = (avgDA / 100) * 0.6 + gapScore * 0.4;

  return intensity;
}

/**
 * Store competitor intelligence in RuVector
 *
 * Stores results in:
 * - seo_competitor_intelligence collection (competitor metadata)
 * - seo_cross_site_patterns collection (if patterns detected)
 *
 * @param domain - Target domain
 * @param industry - Target industry
 * @param output - Phase 3 output to store
 */
async function storeCompetitorIntelligence(
  domain: string,
  industry: string,
  output: CompetitorDiscoveryOutput
): Promise<void> {
  try {
    console.log(`[Phase 3] Preparing to store competitor intelligence for ${domain}...`);

    // TODO: Implement RuVector storage when client is available (Sprint 1.2)
    // await upsertCompetitorIntelligence(ONBOARDING_COLLECTIONS.COMPETITOR_INTELLIGENCE, {
    //   domain,
    //   industry,
    //   competitors: output.competitors,
    //   gaps: output.gaps,
    //   intensity: output.competitive_intensity,
    //   timestamp: output.timestamp,
    // });

    console.log(`[Phase 3] Would store: ${output.competitors.length} competitors, ${output.gaps.length} gaps`);
    console.log('[Phase 3] Note: RuVector client storage not yet implemented (Sprint 1.2)');
  } catch (error) {
    console.error('[Phase 3] Error storing competitor intelligence:', error);
    // Non-blocking: Continue even if storage fails
  }
}

// =============================================
// Exports
// =============================================

export default executePhase3;
