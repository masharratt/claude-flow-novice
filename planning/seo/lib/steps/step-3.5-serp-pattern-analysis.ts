/**
 * Step 3.5: SERP Pattern Analysis - SEO Intelligence Integration Phase 2 Sprint 4
 *
 * @module planning/seo/lib/steps/step-3.5-serp-pattern-analysis
 * @description Analyzes SERP patterns using SERPPatternAnalyst to extract features,
 *              ranking patterns, and generate actionable SEO recommendations
 */

import {
  PipelineContext,
  SERPPattern,
  SERPAnalysisResult,
} from '../../types';
// Import from packages/seo-analysis directly since agents are not exported from main package
import { SERPPatternAnalyst } from '../../../../packages/seo-analysis/src/lib/serp-pattern-analyst';
import { SERPFeatureType, SERPFeature } from '../../../../packages/seo-analysis/src/types/serp-analysis';

/**
 * Type guard to check if SERP feature is of specific type
 */
function isSerpFeatureType(feature: SERPFeature, type: SERPFeatureType): boolean {
  return feature && feature.type === type;
}

/**
 * Step 3.5 configuration for SERP pattern analysis
 */
export interface Step35Config {
  /** Target keyword to analyze */
  keyword: string;

  /** Maximum SERP results to analyze */
  maxResults?: number;

  /** Enable detailed content scraping */
  enableContentScraping?: boolean;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Rate limit delay between requests (ms) */
  rateLimitMs?: number;

  /** Request timeout (ms) */
  requestTimeoutMs?: number;

  /** Google API key (uses env if not provided) */
  googleApiKey?: string;

  /** Google Search Engine ID (uses env if not provided) */
  googleSearchEngineId?: string;

  /** DataForSEO API key (optional) */
  dataForSeoApiKey?: string;

  /** SpyFu API key (optional) */
  spyfuApiKey?: string;
}

/**
 * Step 3.5 execution result
 */
export interface Step35Result {
  /** Target keyword analyzed */
  keyword: string;

  /** Number of SERP results analyzed */
  resultsAnalyzed: number;

  /** SERP features detected */
  featuresDetected: number;

  /** Ranking patterns identified */
  rankingPatternsIdentified: number;

  /** Recommendations generated */
  recommendationsGenerated: number;

  /** Full SERP analysis result */
  analysisResult: SERPAnalysisResult;

  /** Execution time (ms) */
  executionTime: number;

  /** Any warnings or errors encountered */
  warnings: string[];
}

/**
 * Execute Step 3.5: SERP Pattern Analysis
 *
 * Analyzes the search engine results page (SERP) for the target keyword to extract:
 * - SERP feature patterns (featured snippets, PAA, knowledge panels, etc.)
 * - Ranking domain patterns and authority signals
 * - Content type and length patterns
 * - Title and meta tag patterns
 * - URL structure patterns
 * - Semantic clustering and topic relationships
 * - Content gaps and opportunities
 *
 * @param context - Pipeline execution context
 * @param config - Step 3.5 configuration
 * @returns Step 3.5 execution result
 * @throws Will log errors but not throw, to allow pipeline to continue
 */
export async function executeStep35(
  context: PipelineContext,
  config: Step35Config
): Promise<Step35Result> {
  const startTime = Date.now();
  const warnings: string[] = [];

  // Initialize context objects if not present (defensive programming)
  if (!context.intelligence) {
    context.intelligence = {} as any;
  }
  if (!context.metrics) {
    context.metrics = {};
  }

  if (config.verbose) {
    console.log('[Step 3.5] SERP Pattern Analysis starting...');
    console.log(`[Step 3.5] Target keyword: ${config.keyword}`);
    console.log(`[Step 3.5] Max results to analyze: ${config.maxResults || 10}`);
  }

  let analysisResult: SERPAnalysisResult | null = null;

  try {
    // Create SERP pattern analyst
    const analyst = new SERPPatternAnalyst({
      keyword: config.keyword,
      maxResults: config.maxResults || 10,
      enableContentScraping: config.enableContentScraping || false,
      verbose: config.verbose,
      rateLimitMs: config.rateLimitMs || 1000,
      requestTimeoutMs: config.requestTimeoutMs || 30000,
      googleApiKey: config.googleApiKey,
      googleSearchEngineId: config.googleSearchEngineId,
      dataForSeoApiKey: config.dataForSeoApiKey,
      spyfuApiKey: config.spyfuApiKey,
    });

    // Execute SERP analysis
    analysisResult = await analyst.analyze();

    if (config.verbose) {
      console.log(`[Step 3.5] Analysis completed`);
      console.log(`[Step 3.5]   Results analyzed: ${analysisResult.results?.length || 0}`);
      console.log(`[Step 3.5]   SERP features found: ${analysisResult.features?.length || 0}`);
      console.log(`[Step 3.5]   Ranking patterns: domain authority, content length, title/meta, URL structure`);
      console.log(`[Step 3.5]   Recommendations generated: ${analysisResult.recommendations?.length || 0}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const warning = `SERP analysis failed: ${errorMessage}`;
    warnings.push(warning);

    if (config.verbose) {
      console.warn(`[Step 3.5] Warning: ${warning}`);
    }

    // Create minimal result to allow pipeline to continue
    analysisResult = {
      keyword: config.keyword,
      analyzedAt: new Date(),
      totalTimeMs: Date.now() - startTime,
      results: [],
      features: [],
      rankingPatterns: {
        domainAuthority: { highAuthority: 0, mediumAuthority: 0, lowAuthority: 0, dominantDomains: [] },
        contentLength: { min: 0, max: 0, average: 0, distribution: [] },
        titleMeta: { avgLength: 0, commonPatterns: [] },
        urlStructure: { patterns: [], distribution: [] },
        contentTypes: [],
        freshnessSignals: [],
      },
      semanticClusters: [],
      contentGaps: [],
      recommendations: [],
      confidence: 0,
      warnings: [warning],
      metadata: {
        apiProvider: 'scraping' as const,
        totalResults: 0,
        cacheHit: false,
      },
    } as unknown as SERPAnalysisResult;
  }

  // Convert SERP analysis results to SERPPattern for storage
  const serpPattern: SERPPattern = convertToSerpPattern(analysisResult);

  // Store SERP patterns in context for downstream steps
  context.intelligence.serpPatterns = [serpPattern];

  const executionTime = Date.now() - startTime;

  if (config.verbose) {
    console.log(`[Step 3.5] SERP Pattern Analysis completed in ${executionTime}ms`);
    if (warnings.length > 0) {
      console.warn(`[Step 3.5] Warnings: ${warnings.join('; ')}`);
    }
  }

  // Track execution metrics
  context.metrics['step-3.5-serp-pattern-analysis'] = executionTime;

  return {
    keyword: config.keyword,
    resultsAnalyzed: analysisResult.results.length,
    featuresDetected: analysisResult.features.length,
    rankingPatternsIdentified:
      Object.values(analysisResult.rankingPatterns.contentTypes).length +
      Object.values(analysisResult.rankingPatterns.freshnessSignals).length,
    recommendationsGenerated: analysisResult.recommendations.length,
    analysisResult,
    executionTime,
    warnings,
  };
}

/**
 * Convert SERPAnalysisResult to SERPPattern format for storage
 *
 * @param result - SERP analysis result from analyst
 * @returns SERP pattern for storage in intelligence context
 */
function convertToSerpPattern(result: SERPAnalysisResult): SERPPattern {
  // Extract featured snippet patterns
  const featuredSnippets = result.features
    .filter((feature: SERPFeature) => isSerpFeatureType(feature, SERPFeatureType.FEATURED_SNIPPET))
    .map((feature: SERPFeature) => ({
      type: feature.snippetType || 'paragraph',
      structure: `Featured snippet at position ${feature.position}`,
      example: feature.content || 'No example available',
    }));

  // Extract People Also Ask questions
  const paa = result.features
    .filter((feature: SERPFeature) => isSerpFeatureType(feature, SERPFeatureType.PEOPLE_ALSO_ASK))
    .map((feature: SERPFeature) => feature.content || 'Question not captured')
    .slice(0, 5);

  // Extract related searches
  const relatedSearches = result.features
    .filter((feature: SERPFeature) => isSerpFeatureType(feature, SERPFeatureType.RELATED_SEARCHES))
    .map((feature: SERPFeature) => feature.content || 'Search not captured')
    .slice(0, 5);

  return {
    keyword: result.keyword,
    featuredSnippets,
    peopleAlsoAsk: paa,
    relatedSearches,
    capturedAt: new Date(),
  };
}

/**
 * Identify SERP feature opportunities for content strategy
 *
 * Analyzes which SERP features are present and suggests strategies to target them
 *
 * @param result - SERP analysis result
 * @returns Feature opportunity recommendations
 */
export function identifySerpOpportunities(result: SERPAnalysisResult): string[] {
  const opportunities: string[] = [];

  // Check for featured snippet opportunity
  const hasSnippet = result.features.some((f: SERPFeature) => isSerpFeatureType(f, SERPFeatureType.FEATURED_SNIPPET));
  if (hasSnippet) {
    opportunities.push(
      'Featured snippet present in SERP - optimize content structure with clear answers, lists, or tables'
    );
  } else {
    opportunities.push('No featured snippet detected - opportunity to claim featured snippet position');
  }

  // Check for People Also Ask
  const hasPaa = result.features.some((f: SERPFeature) => isSerpFeatureType(f, SERPFeatureType.PEOPLE_ALSO_ASK));
  if (hasPaa) {
    opportunities.push('People Also Ask section present - create FAQ content targeting related questions');
  }

  // Check for knowledge panel
  const hasKnowledgePanel = result.features.some((f: SERPFeature) => isSerpFeatureType(f, SERPFeatureType.KNOWLEDGE_PANEL));
  if (hasKnowledgePanel) {
    opportunities.push('Knowledge panel present - verify and optimize entity markup');
  }

  // Analyze ranking patterns for positioning strategy (using proper type structure)
  const domainAuthorityPattern = result.rankingPatterns?.domainAuthority;
  const highAuthorityCount = domainAuthorityPattern?.highAuthority || 0;
  const mediumAuthorityCount = domainAuthorityPattern?.mediumAuthority || 0;
  const totalAuthoritySites = highAuthorityCount + mediumAuthorityCount;

  if (highAuthorityCount > 5 || totalAuthoritySites > 7) {
    opportunities.push('High domain authority required - focus on backlink acquisition and brand building');
  }

  // Check content length patterns (using proper type structure)
  const contentLengthPattern = result.rankingPatterns?.contentLength;
  const avgContentLength = contentLengthPattern?.averageWordCount || 0;

  if (avgContentLength > 2000) {
    opportunities.push(`Average content length is ${Math.round(avgContentLength)} words - create comprehensive content`);
  }

  // Identify content gaps with proper type checking
  if (result.contentGaps && result.contentGaps.length > 0) {
    const topGap = result.contentGaps[0];
    if (topGap && typeof topGap.topic === 'string') {
      const priority = topGap.priority || 'medium';
      opportunities.push(
        `Content gap identified: "${topGap.topic}" with ${priority} priority - address this topic in your content`
      );
    }
  }

  return opportunities;
}

/**
 * Generate SERP-specific SEO strategy recommendations
 *
 * @param context - Pipeline execution context
 * @param result - SERP analysis result
 * @returns Strategic recommendations based on SERP patterns
 */
export function generateSerpStrategy(
  context: PipelineContext,
  result: SERPAnalysisResult
): {
  serpFeaturesToTarget: string[];
  contentLengthTarget: number;
  contentStructureRecommendations: string[];
  authorityRequiredLevel: 'low' | 'medium' | 'high';
} {
  const serpFeatures: string[] = [];
  let avgAuthority = 0;

  // Collect feature recommendations
  if (result.features.some((f: SERPFeature) => isSerpFeatureType(f, SERPFeatureType.FEATURED_SNIPPET))) {
    serpFeatures.push('featured_snippet');
  }
  if (result.features.some((f: SERPFeature) => isSerpFeatureType(f, SERPFeatureType.PEOPLE_ALSO_ASK))) {
    serpFeatures.push('faq_schema');
  }
  if (result.features.some((f: SERPFeature) => isSerpFeatureType(f, SERPFeatureType.KNOWLEDGE_PANEL))) {
    serpFeatures.push('entity_markup');
  }
  if (result.features.some((f: SERPFeature) => isSerpFeatureType(f, SERPFeatureType.IMAGE_PACK))) {
    serpFeatures.push('image_optimization');
  }

  // Calculate domain authority level from proper type structure
  const domainAuthorityPattern = result.rankingPatterns?.domainAuthority;
  const highAuthorityCount = domainAuthorityPattern?.highAuthority || 0;
  const mediumAuthorityCount = domainAuthorityPattern?.mediumAuthority || 0;
  const lowAuthorityCount = domainAuthorityPattern?.lowAuthority || 0;
  const totalSites = highAuthorityCount + mediumAuthorityCount + lowAuthorityCount;

  // Determine authority level required based on distribution
  const authorityLevel: 'low' | 'medium' | 'high' =
    totalSites === 0 || lowAuthorityCount / totalSites > 0.6
      ? 'low'
      : highAuthorityCount / totalSites > 0.5
      ? 'high'
      : 'medium';

  // Get average content length from proper type structure
  const contentLengthPattern = result.rankingPatterns?.contentLength;
  const avgLength = contentLengthPattern?.averageWordCount || 1500;

  // Content structure recommendations
  const structureRecs: string[] = [];
  structureRecs.push('Use clear H2 headings to structure content');

  if (result.features.some((f: SERPFeature) => isSerpFeatureType(f, SERPFeatureType.FEATURED_SNIPPET))) {
    structureRecs.push('Start with a concise definition or summary paragraph (40-60 words)');
  }

  if (result.features.some((f: SERPFeature) => isSerpFeatureType(f, SERPFeatureType.PEOPLE_ALSO_ASK))) {
    structureRecs.push('Include FAQ section addressing common questions');
  }

  structureRecs.push('Include relevant lists or tables for scanability');

  return {
    serpFeaturesToTarget: serpFeatures,
    contentLengthTarget: Math.round(avgLength),
    contentStructureRecommendations: structureRecs,
    authorityRequiredLevel: authorityLevel,
  };
}
