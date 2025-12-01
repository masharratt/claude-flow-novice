/**
 * Step 2.5: Competitor Analysis - SEO Intelligence Integration Phase 2 Sprint 4
 *
 * @module planning/seo/lib/steps/step-2.5-competitor-analysis
 * @description Performs deep competitor analysis using CompetitorDeepAnalystAgent
 *              to extract site architecture, content strategy, and competitive insights
 */

import {
  PipelineContext,
  CompetitorAnalysisConfig,
  CompetitorAnalysisResult,
  CompetitiveIntelligence,
  SiteArchitecturePattern,
  ContentStrategyPattern,
} from '../../types';
// Import from packages/seo-analysis directly since agents are not exported from main package
import { CompetitorDeepAnalystAgent } from '../../../../packages/seo-analysis/src/lib/competitor-deep-analyst';

/**
 * Step 2.5 configuration for competitor analysis
 */
export interface Step25Config {
  /** Competitor domains to analyze */
  competitorDomains: string[];

  /** Maximum pages to crawl per domain */
  maxPages?: number;

  /** Maximum crawl depth */
  maxDepth?: number;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Rate limit delay between requests (ms) */
  rateLimitMs?: number;

  /** Request timeout (ms) */
  requestTimeoutMs?: number;

  /** Firecrawl API key (uses env if not provided) */
  firecrawlApiKey?: string;
}

/**
 * Step 2.5 execution result
 */
export interface Step25Result {
  /** Number of domains analyzed */
  domainsAnalyzed: number;

  /** Total pages crawled across all domains */
  pagesCrawled: number;

  /** Total hub pages identified */
  hubPagesIdentified: number;

  /** Total patterns extracted */
  patternsExtracted: number;

  /** Analysis results by domain */
  analysisByDomain: Map<string, CompetitorAnalysisResult>;

  /** Execution time (ms) */
  executionTime: number;

  /** Any errors encountered during analysis */
  errors: string[];
}

/**
 * Execute Step 2.5: Competitor Analysis
 *
 * Performs deep analysis of competitor websites to extract:
 * - Site architecture patterns
 * - Content strategy patterns
 * - Hub page identification
 * - Internal linking patterns
 * - Content gaps
 *
 * @param context - Pipeline execution context
 * @param config - Step 2.5 configuration
 * @returns Step 2.5 execution result
 * @throws Will log errors but not throw, to allow pipeline to continue
 */
export async function executeStep25(
  context: PipelineContext,
  config: Step25Config
): Promise<Step25Result> {
  const startTime = Date.now();
  const errors: string[] = [];
  const analysisByDomain = new Map<string, CompetitorAnalysisResult>();

  // Initialize context objects if not present (defensive programming)
  if (!context.intelligence) {
    context.intelligence = {} as any;
  }
  if (!context.metrics) {
    context.metrics = {};
  }

  if (config.verbose) {
    console.log('[Step 2.5] Competitor Analysis starting...');
    console.log(`[Step 2.5] Target keyword: ${context.task.targetKeyword}`);
    console.log(`[Step 2.5] Analyzing ${config.competitorDomains.length} domains`);
  }

  let totalPagesCrawled = 0;
  let totalHubPages = 0;
  let totalPatterns = 0;

  // Analyze each competitor domain
  for (const domain of config.competitorDomains) {
    try {
      if (config.verbose) {
        console.log(`[Step 2.5] Analyzing domain: ${domain}`);
      }

      // Create competitor analysis agent
      const analyst = new CompetitorDeepAnalystAgent({
        domain,
        maxPages: config.maxPages || 50,
        maxDepth: config.maxDepth || 3,
        verbose: config.verbose,
        rateLimitMs: config.rateLimitMs || 1000,
        requestTimeoutMs: config.requestTimeoutMs || 30000,
        firecrawlApiKey: config.firecrawlApiKey,
      });

      // Execute analysis
      const result = await analyst.analyze();

      // Store result
      analysisByDomain.set(domain, result);

      // Aggregate metrics with null/undefined checks
      totalPagesCrawled += result.pagesCrawled || 0;
      totalHubPages += result.hubPages?.length || 0;
      totalPatterns += (result.architecturePatterns?.length || 0) + (result.contentStrategyPatterns?.length || 0);

      if (config.verbose) {
        console.log(`[Step 2.5]   Pages crawled: ${result.pagesCrawled}`);
        console.log(`[Step 2.5]   Hub pages found: ${result.hubPages.length}`);
        console.log(`[Step 2.5]   Patterns extracted: ${result.architecturePatterns.length + result.contentStrategyPatterns.length}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const message = `Failed to analyze domain ${domain}: ${errorMessage}`;
      errors.push(message);

      if (config.verbose) {
        console.warn(`[Step 2.5] Warning: ${message}`);
      }
    }
  }

  // Store competitor analysis results in context for downstream steps
  // Convert CompetitorAnalysisResult to CompetitiveIntelligence format
  const competitiveIntelligence: CompetitiveIntelligence[] = Array.from(analysisByDomain.values()).map(
    (result) => ({
      domain: result.domain,
      contentStrategy: {
        averageWordCount: result.contentStrategyPatterns[0]?.avgWordCount || 0,
        keywordDensity: {},
        contentTypes: result.contentStrategyPatterns.map((cs) => cs.contentType),
      },
      keywordTargeting: {
        primaryKeywords: [],
        secondaryKeywords: [],
        searchVolumes: {},
      },
      backlinks: {
        total: 0,
        domainAuthority: 0,
        topReferrers: [],
      },
      analyzedAt: new Date(),
    })
  );
  context.intelligence.competitive = competitiveIntelligence;

  const executionTime = Date.now() - startTime;

  if (config.verbose) {
    console.log(`[Step 2.5] Competitor Analysis completed in ${executionTime}ms`);
    if (errors.length > 0) {
      console.warn(`[Step 2.5] ${errors.length} domain(s) failed analysis`);
    }
  }

  // Track execution metrics
  context.metrics['step-2.5-competitor-analysis'] = executionTime;

  return {
    domainsAnalyzed: config.competitorDomains.length - errors.length,
    pagesCrawled: totalPagesCrawled,
    hubPagesIdentified: totalHubPages,
    patternsExtracted: totalPatterns,
    analysisByDomain,
    executionTime,
    errors,
  };
}

/**
 * Extract key competitive insights from analysis results
 *
 * @param results - Competitor analysis results by domain
 * @returns Aggregated competitive insights
 */
export function extractCompetitiveInsights(
  results: Map<string, CompetitorAnalysisResult>
): {
  commonArchitecturePatterns: string[];
  dominantContentTypes: string[];
  averageContentLength: number;
  commonHeaderStructures: string[];
} {
  const architecturePatterns = new Map<string, number>();
  const contentTypes = new Map<string, number>();
  let totalWordCount = 0;
  let contentCount = 0;
  const headerStructures = new Map<string, number>();

  for (const result of results.values()) {
    // Count architecture patterns with null safety
    if (result.architecturePatterns && Array.isArray(result.architecturePatterns)) {
      result.architecturePatterns.forEach((pattern) => {
        if (pattern && typeof pattern.urlStructure === 'string') {
          architecturePatterns.set(
            pattern.urlStructure,
            (architecturePatterns.get(pattern.urlStructure) || 0) + 1
          );
        }
      });
    }

    // Count content types with null safety
    if (result.contentStrategyPatterns && Array.isArray(result.contentStrategyPatterns)) {
      result.contentStrategyPatterns.forEach((strategy) => {
        if (strategy && typeof strategy.contentType === 'string') {
          contentTypes.set(
            strategy.contentType,
            (contentTypes.get(strategy.contentType) || 0) + 1
          );
          totalWordCount += (strategy.avgWordCount || 0) * (strategy.pageCount || 0);
          contentCount += strategy.pageCount || 0;
        }
      });

      // Count heading structures with null safety
      result.contentStrategyPatterns.forEach((strategy) => {
        if (strategy && Array.isArray(strategy.headingStructures)) {
          strategy.headingStructures.forEach((structure) => {
            if (typeof structure === 'string') {
              headerStructures.set(structure, (headerStructures.get(structure) || 0) + 1);
            }
          });
        }
      });
    }
  }

  // Sort and return top items
  const commonArchitectures = Array.from(architecturePatterns.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern]) => pattern);

  const dominantTypes = Array.from(contentTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type);

  const commonHeaders = Array.from(headerStructures.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([structure]) => structure);

  return {
    commonArchitecturePatterns: commonArchitectures,
    dominantContentTypes: dominantTypes,
    averageContentLength: contentCount > 0 ? totalWordCount / contentCount : 0,
    commonHeaderStructures: commonHeaders,
  };
}

/**
 * Identify content opportunities based on competitor analysis
 *
 * Analyzes gaps in competitor content strategy to suggest opportunities
 *
 * @param context - Pipeline execution context
 * @param config - Step 2.5 configuration
 * @returns Content opportunity recommendations
 */
export function identifyOpportunities(
  context: PipelineContext,
  config: Step25Config
): string[] {
  const opportunities: string[] = [];

  // Check if we have competitive intelligence
  if (!context.intelligence.competitive || context.intelligence.competitive.length === 0) {
    return opportunities;
  }

  // Check if we have competitive analysis results stored
  // These would be stored as CompetitorAnalysisResult objects from Step 2.5
  // For now, we work with the general competitive intelligence structure
  if (!Array.isArray(context.intelligence.competitive) || context.intelligence.competitive.length === 0) {
    return opportunities;
  }

  // Analyze content gaps and opportunities based on competitive data
  const competitiveData = context.intelligence.competitive;

  if (competitiveData.length > 0 && competitiveData[0]) {
    const firstCompetitor = competitiveData[0];

    // Check for underrepresented content types with proper type checking
    if (
      firstCompetitor &&
      typeof firstCompetitor === 'object' &&
      'contentStrategy' in firstCompetitor
    ) {
      const contentTypes = new Set<string>();
      const contentStrategyData = firstCompetitor.contentStrategy;

      if (
        contentStrategyData &&
        typeof contentStrategyData === 'object' &&
        'contentTypes' in contentStrategyData &&
        Array.isArray(contentStrategyData.contentTypes)
      ) {
        contentStrategyData.contentTypes.forEach((type: unknown) => {
          if (typeof type === 'string') {
            contentTypes.add(type);
          }
        });

        if (contentTypes.size < 3 && contentTypes.size > 0) {
          opportunities.push(
            `Competitors focus on limited content types (${Array.from(contentTypes).join(', ')}). ` +
            `Consider diversifying with additional formats.`
          );
        }
      }
    }
  }

  return opportunities;
}
