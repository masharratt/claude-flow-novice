/**
 * Step 4.5: Research Storage - SEO Intelligence Integration Phase 2 Sprint 2
 *
 * @module planning/seo/lib/steps/step-4.5-research-storage
 * @description Stores research results to RuVector for future reuse after Step 4 completes
 */

import type { PipelineContext } from '../../types';
import type { SEOQueryManager } from '../ruvector/queries';
import type { ResearchResult } from '../../types/research';
import type {
  ExpertSourceInput as CollectionExpertSourceInput,
} from '../ruvector/collections/expert-sources';
import type {
  StatisticInput as CollectionStatisticInput,
} from '../ruvector/collections/statistics';

/**
 * Expert source input data
 * Re-export from collections for type compatibility
 */
export type ExpertSourceInput = CollectionExpertSourceInput;

/**
 * Statistic input data
 * Re-export from collections for type compatibility
 */
export type StatisticInput = CollectionStatisticInput;

/**
 * Expert extraction interface (to be implemented)
 * Extracts expert sources from research content
 */
export interface ExpertExtractor {
  /**
   * Extract expert sources from research results
   * @param research - Research content to analyze
   * @returns Array of expert source inputs with authority scores
   */
  extract(research: ResearchResult): Promise<ExpertSourceInput[]>;
}

/**
 * Statistic extraction interface (to be implemented)
 * Extracts statistics and data points from research content
 */
export interface StatisticExtractor {
  /**
   * Extract statistics from research results
   * @param research - Research content to analyze
   * @returns Array of statistic inputs with credibility scores
   */
  extract(research: ResearchResult): Promise<StatisticInput[]>;
}

/**
 * Step 4.5 configuration
 */
export interface Step4_5Config {
  /** SEO Query Manager for RuVector operations */
  seoQueryManager: SEOQueryManager;

  /** Expert extractor instance */
  expertExtractor: ExpertExtractor;

  /** Statistic extractor instance */
  statisticExtractor: StatisticExtractor;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Minimum credibility score for statistics (default: 0.5) */
  minCredibilityScore?: number;

  /** Minimum authority score for experts (default: 0.3) */
  minAuthorityScore?: number;
}

/**
 * Step 4.5 execution result
 */
export interface Step4_5Result {
  /** Number of keyword research entries stored */
  keywordResearchStored: number;

  /** Number of competitor intelligence entries stored */
  competitorIntelligenceStored: number;

  /** Number of SERP patterns stored */
  serpPatternsStored: number;

  /** Number of expert sources extracted and stored */
  expertSourcesStored: number;

  /** Number of statistics extracted and stored */
  statisticsStored: number;

  /** Execution time (ms) */
  executionTime: number;

  /** Storage errors (if any) */
  errors: string[];
}

/**
 * Execute Step 4.5: Research Storage
 *
 * Stores all research results to RuVector for future reuse:
 * - Keyword research data
 * - Competitor intelligence
 * - SERP patterns
 * - Extracted expert sources
 * - Extracted statistics
 *
 * @param context - Pipeline execution context
 * @param config - Step 4.5 configuration
 * @returns Step 4.5 execution result
 */
export async function executeStep4_5(
  context: PipelineContext,
  config: Step4_5Config
): Promise<Step4_5Result> {
  const startTime = Date.now();
  const errors: string[] = [];

  if (config.verbose) {
    console.log('[Step 4.5] Research Storage starting...');
    console.log(`[Step 4.5] Target keyword: ${context.task.targetKeyword}`);
  }

  let keywordResearchStored = 0;
  let competitorIntelligenceStored = 0;
  let serpPatternsStored = 0;
  let expertSourcesStored = 0;
  let statisticsStored = 0;

  const minCredibilityScore = config.minCredibilityScore ?? 0.5;
  const minAuthorityScore = config.minAuthorityScore ?? 0.3;

  // 1. Store Keyword Research (if available in context)
  // Note: Step 4 would populate context with keywordResearch data
  if ((context as any).keywordResearch) {
    try {
      const keywordData = (context as any).keywordResearch;

      // keywordData should already be in the format the collection expects
      // It may contain metadata.clusterId from the research step
      await config.seoQueryManager['keywordResearch'].add(keywordData);
      keywordResearchStored++;

      if (config.verbose) {
        console.log(
          `[Step 4.5] Stored keyword research for "${context.task.targetKeyword}"`
        );
      }
    } catch (error) {
      const errorMsg = `Failed to store keyword research: ${(error as Error).message}`;
      errors.push(errorMsg);
      if (config.verbose) {
        console.warn(`[Step 4.5] WARNING: ${errorMsg}`);
      }
    }
  }

  // 2. Store Competitor Intelligence (if available in context)
  if ((context as any).competitorAnalysis) {
    const competitorData = (context as any).competitorAnalysis;

    // competitorData could be a single object or array
    const competitors = Array.isArray(competitorData) ? competitorData : [competitorData];

    for (const competitor of competitors) {
      try {
        await config.seoQueryManager['competitorIntelligence'].add(competitor);
        competitorIntelligenceStored++;

        if (config.verbose) {
          console.log(
            `[Step 4.5] Stored competitor intelligence for ${competitor.domain || 'competitor'}`
          );
        }
      } catch (error) {
        const errorMsg = `Failed to store competitor intelligence: ${(error as Error).message}`;
        errors.push(errorMsg);
        if (config.verbose) {
          console.warn(`[Step 4.5] WARNING: ${errorMsg}`);
        }
      }
    }
  }

  // 3. Store SERP Patterns (if available in context)
  if ((context as any).serpPatterns) {
    try {
      const serpPatterns = (context as any).serpPatterns;

      // Week bucket ID is auto-generated by the collection
      await config.seoQueryManager['serpPatterns'].add(serpPatterns);
      serpPatternsStored++;

      if (config.verbose) {
        console.log(
          `[Step 4.5] Stored SERP patterns for "${context.task.targetKeyword}"`
        );
      }
    } catch (error) {
      const errorMsg = `Failed to store SERP patterns: ${(error as Error).message}`;
      errors.push(errorMsg);
      if (config.verbose) {
        console.warn(`[Step 4.5] WARNING: ${errorMsg}`);
      }
    }
  }

  // 4. Extract and Store Expert Sources
  if ((context as any).research) {
    try {
      const extractedExperts = await config.expertExtractor.extract(
        (context as any).research
      );

      // Filter by minimum authority score
      const qualifiedExperts = extractedExperts.filter(
        (expert) => expert.authorityScore >= minAuthorityScore
      );

      if (config.verbose) {
        console.log(
          `[Step 4.5] Extracted ${extractedExperts.length} expert sources, ${qualifiedExperts.length} meet authority threshold (>= ${minAuthorityScore})`
        );
      }

      for (const expert of qualifiedExperts) {
        try {
          // Add expert to collection (will create or update)
          await config.seoQueryManager['expertSources'].add(expert);
          expertSourcesStored++;
        } catch (error) {
          const errorMsg = `Failed to store expert source "${expert.name}": ${(error as Error).message}`;
          errors.push(errorMsg);
          if (config.verbose) {
            console.warn(`[Step 4.5] WARNING: ${errorMsg}`);
          }
        }
      }

      if (config.verbose) {
        console.log(`[Step 4.5] Stored ${expertSourcesStored} expert sources`);
      }
    } catch (error) {
      const errorMsg = `Failed to extract expert sources: ${(error as Error).message}`;
      errors.push(errorMsg);
      if (config.verbose) {
        console.warn(`[Step 4.5] WARNING: ${errorMsg}`);
      }
    }
  }

  // 5. Extract and Store Statistics
  if ((context as any).research) {
    try {
      const extractedStatistics = await config.statisticExtractor.extract(
        (context as any).research
      );

      // Filter by minimum credibility score
      const qualifiedStatistics = extractedStatistics.filter(
        (stat) => stat.credibilityScore >= minCredibilityScore
      );

      if (config.verbose) {
        console.log(
          `[Step 4.5] Extracted ${extractedStatistics.length} statistics, ${qualifiedStatistics.length} meet credibility threshold (>= ${minCredibilityScore})`
        );
      }

      for (const statistic of qualifiedStatistics) {
        try {
          await config.seoQueryManager['statistics'].add(statistic);
          statisticsStored++;
        } catch (error) {
          const errorMsg = `Failed to store statistic "${statistic.statistic}": ${(error as Error).message}`;
          errors.push(errorMsg);
          if (config.verbose) {
            console.warn(`[Step 4.5] WARNING: ${errorMsg}`);
          }
        }
      }

      if (config.verbose) {
        console.log(`[Step 4.5] Stored ${statisticsStored} statistics`);
      }
    } catch (error) {
      const errorMsg = `Failed to extract statistics: ${(error as Error).message}`;
      errors.push(errorMsg);
      if (config.verbose) {
        console.warn(`[Step 4.5] WARNING: ${errorMsg}`);
      }
    }
  }

  const executionTime = Date.now() - startTime;

  if (config.verbose) {
    console.log(`[Step 4.5] Research Storage completed in ${executionTime}ms`);
    console.log(`[Step 4.5] Summary:`);
    console.log(`  - Keyword research stored: ${keywordResearchStored}`);
    console.log(`  - Competitor intelligence stored: ${competitorIntelligenceStored}`);
    console.log(`  - SERP patterns stored: ${serpPatternsStored}`);
    console.log(`  - Expert sources stored: ${expertSourcesStored}`);
    console.log(`  - Statistics stored: ${statisticsStored}`);
    if (errors.length > 0) {
      console.log(`  - Errors encountered: ${errors.length}`);
    }
  }

  // Track execution metrics
  context.metrics['step-4.5-research-storage'] = executionTime;

  return {
    keywordResearchStored,
    competitorIntelligenceStored,
    serpPatternsStored,
    expertSourcesStored,
    statisticsStored,
    executionTime,
    errors,
  };
}
