/**
 * SEO Intelligence Unified Storage Utilities
 *
 * Provides unified storage interface for all SEO RuVector collections.
 * Handles post-research storage (Step 4.5) and post-success pattern extraction (Step 12.5).
 *
 * @module seo/lib/ruvector/storage
 */

import type { VectorDB } from '@ruvector/core';
import { SEO_COLLECTIONS, SEOCollectionName } from './schemas';
import { ExpertSourcesCollection, ExpertSourceInput } from './collections/expert-sources';
import { StatisticsCollection, StatisticInput } from './collections/statistics';
import { KeywordResearchCollection, KeywordResearchInput } from './collections/keyword-research';
import {
  CompetitorIntelligenceCollection,
  CompetitorIntelligenceInput,
} from './collections/competitor-intelligence';
import { SERPPatternsCollection, SERPPatternInput } from './collections/serp-patterns';
import { ContentPatternsCollection, ContentPatternInput } from './collections/content-patterns';

/**
 * Research data to store after completing research phase (Step 4.5)
 */
export interface ResearchStorageData {
  /** Target keyword from research */
  keyword: string;

  /** Niche/topic area */
  niche: string;

  /** Optional cluster ID for grouping */
  clusterId?: string;

  /** Keyword research data */
  keywordResearch?: KeywordResearchInput;

  /** Competitor analysis data */
  competitorIntelligence?: CompetitorIntelligenceInput[];

  /** SERP pattern data */
  serpPatterns?: SERPPatternInput;

  /** Expert sources found */
  expertSources?: ExpertSourceInput[];

  /** Statistics found */
  statistics?: StatisticInput[];
}

/**
 * Result of storing research data
 */
export interface ResearchStorageResult {
  stored: {
    keywordResearch: boolean;
    competitorCount: number;
    serpPatterns: boolean;
    expertSourceCount: number;
    statisticCount: number;
  };
  errors: string[];
}

/**
 * Pattern data to extract after successful content generation (Step 12.5)
 */
export interface PatternExtractionData {
  /** Article ID for tracking */
  articleId: string;

  /** Niche/topic area */
  niche: string;

  /** Content format */
  format?: string;

  /** Consensus score from validation */
  consensusScore: number;

  /** Depth quality score */
  depthQualityScore?: number;

  /** Voice authenticity score */
  voiceAuthenticityScore?: number;

  /** Angle pattern to extract */
  anglePattern?: Omit<ContentPatternInput, 'confidenceScore'>;

  /** Structure pattern to extract */
  structurePattern?: Omit<ContentPatternInput, 'confidenceScore'>;

  /** Voice pattern to extract */
  voicePattern?: Omit<ContentPatternInput, 'confidenceScore'>;

  /** Hook pattern to extract */
  hookPattern?: Omit<ContentPatternInput, 'confidenceScore'>;

  /** Expert sources used */
  expertSourceIds?: string[];

  /** Statistics used */
  statisticIds?: string[];
}

/**
 * Result of pattern extraction
 */
export interface PatternExtractionResult {
  stored: {
    anglePattern: boolean;
    structurePattern: boolean;
    voicePattern: boolean;
    hookPattern: boolean;
  };
  patternIds: string[];
  errors: string[];
}

/**
 * Unified SEO Storage Manager
 *
 * Provides high-level storage operations for SEO intelligence data.
 */
export class SEOStorageManager {
  private expertSources: ExpertSourcesCollection;
  private statistics: StatisticsCollection;
  private keywordResearch: KeywordResearchCollection;
  private competitorIntelligence: CompetitorIntelligenceCollection;
  private serpPatterns: SERPPatternsCollection;
  private contentPatterns: ContentPatternsCollection;

  constructor(
    collections: Map<SEOCollectionName, VectorDB>,
    embeddingFn: (text: string) => Promise<Float32Array>
  ) {
    const getDb = (name: SEOCollectionName): VectorDB => {
      const db = collections.get(name);
      if (!db) throw new Error(`Collection ${name} not found`);
      return db;
    };

    this.expertSources = new ExpertSourcesCollection(
      getDb(SEO_COLLECTIONS.EXPERT_SOURCES),
      embeddingFn
    );
    this.statistics = new StatisticsCollection(getDb(SEO_COLLECTIONS.STATISTICS), embeddingFn);
    this.keywordResearch = new KeywordResearchCollection(
      getDb(SEO_COLLECTIONS.KEYWORD_RESEARCH),
      embeddingFn
    );
    this.competitorIntelligence = new CompetitorIntelligenceCollection(
      getDb(SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE),
      embeddingFn
    );
    this.serpPatterns = new SERPPatternsCollection(
      getDb(SEO_COLLECTIONS.SERP_PATTERNS),
      embeddingFn
    );
    this.contentPatterns = new ContentPatternsCollection(
      getDb(SEO_COLLECTIONS.CONTENT_PATTERNS),
      embeddingFn
    );
  }

  /**
   * Store research data after completing research phase (Step 4.5)
   *
   * Called after Steps 1-4 complete to cache research for reuse.
   */
  async storeResearchData(data: ResearchStorageData): Promise<ResearchStorageResult> {
    const result: ResearchStorageResult = {
      stored: {
        keywordResearch: false,
        competitorCount: 0,
        serpPatterns: false,
        expertSourceCount: 0,
        statisticCount: 0,
      },
      errors: [],
    };

    // Store keyword research
    if (data.keywordResearch) {
      try {
        await this.keywordResearch.add({
          ...data.keywordResearch,
          clusterId: data.clusterId,
          niche: data.niche,
        });
        result.stored.keywordResearch = true;
      } catch (error) {
        result.errors.push(`Keyword research: ${error}`);
      }
    }

    // Store competitor intelligence
    if (data.competitorIntelligence) {
      for (const competitor of data.competitorIntelligence) {
        try {
          await this.competitorIntelligence.add({
            ...competitor,
            clusterId: data.clusterId,
            niche: data.niche,
          });
          result.stored.competitorCount++;
        } catch (error) {
          result.errors.push(`Competitor ${competitor.domain}: ${error}`);
        }
      }
    }

    // Store SERP patterns
    if (data.serpPatterns) {
      try {
        await this.serpPatterns.add({
          ...data.serpPatterns,
          clusterId: data.clusterId,
        });
        result.stored.serpPatterns = true;
      } catch (error) {
        result.errors.push(`SERP patterns: ${error}`);
      }
    }

    // Store expert sources
    if (data.expertSources) {
      for (const expert of data.expertSources) {
        try {
          await this.expertSources.add({
            ...expert,
            niche: data.niche,
          });
          result.stored.expertSourceCount++;
        } catch (error) {
          result.errors.push(`Expert ${expert.name}: ${error}`);
        }
      }
    }

    // Store statistics
    if (data.statistics) {
      for (const stat of data.statistics) {
        try {
          await this.statistics.add({
            ...stat,
            niche: data.niche,
          });
          result.stored.statisticCount++;
        } catch (error) {
          result.errors.push(`Statistic: ${error}`);
        }
      }
    }

    return result;
  }

  /**
   * Extract and store patterns from successful content (Step 12.5)
   *
   * Called after successful content generation to capture reusable patterns.
   */
  async extractPatterns(data: PatternExtractionData): Promise<PatternExtractionResult> {
    const result: PatternExtractionResult = {
      stored: {
        anglePattern: false,
        structurePattern: false,
        voicePattern: false,
        hookPattern: false,
      },
      patternIds: [],
      errors: [],
    };

    // Calculate confidence multipliers based on quality scores
    const depthMultiplier = data.depthQualityScore ?? 1.0;
    const voiceMultiplier = data.voiceAuthenticityScore ?? 1.0;

    // Store angle pattern
    if (data.anglePattern) {
      try {
        const pattern = await this.contentPatterns.extractAndStore(
          {
            ...data.anglePattern,
            niche: data.niche,
            format: data.format,
          },
          data.consensusScore
        );
        await this.contentPatterns.recordUsage(pattern.id, data.articleId);
        result.stored.anglePattern = true;
        result.patternIds.push(pattern.id);
      } catch (error) {
        result.errors.push(`Angle pattern: ${error}`);
      }
    }

    // Store structure pattern (weighted by depth quality)
    if (data.structurePattern) {
      try {
        const adjustedConsensus = data.consensusScore * depthMultiplier;
        const pattern = await this.contentPatterns.extractAndStore(
          {
            ...data.structurePattern,
            niche: data.niche,
            format: data.format,
          },
          adjustedConsensus
        );
        await this.contentPatterns.recordUsage(pattern.id, data.articleId);
        result.stored.structurePattern = true;
        result.patternIds.push(pattern.id);
      } catch (error) {
        result.errors.push(`Structure pattern: ${error}`);
      }
    }

    // Store voice pattern (weighted by voice authenticity)
    if (data.voicePattern) {
      try {
        const adjustedConsensus = data.consensusScore * voiceMultiplier;
        const pattern = await this.contentPatterns.extractAndStore(
          {
            ...data.voicePattern,
            niche: data.niche,
            format: data.format,
          },
          adjustedConsensus
        );
        await this.contentPatterns.recordUsage(pattern.id, data.articleId);
        result.stored.voicePattern = true;
        result.patternIds.push(pattern.id);
      } catch (error) {
        result.errors.push(`Voice pattern: ${error}`);
      }
    }

    // Store hook pattern
    if (data.hookPattern) {
      try {
        const pattern = await this.contentPatterns.extractAndStore(
          {
            ...data.hookPattern,
            niche: data.niche,
            format: data.format,
          },
          data.consensusScore
        );
        await this.contentPatterns.recordUsage(pattern.id, data.articleId);
        result.stored.hookPattern = true;
        result.patternIds.push(pattern.id);
      } catch (error) {
        result.errors.push(`Hook pattern: ${error}`);
      }
    }

    // Update expert source usage
    if (data.expertSourceIds) {
      for (const expertId of data.expertSourceIds) {
        try {
          await this.expertSources.recordUsage(expertId, data.articleId);
        } catch (error) {
          result.errors.push(`Expert usage ${expertId}: ${error}`);
        }
      }
    }

    // Update statistic usage
    if (data.statisticIds) {
      for (const statId of data.statisticIds) {
        try {
          await this.statistics.recordUsage(statId, data.articleId);
        } catch (error) {
          result.errors.push(`Statistic usage ${statId}: ${error}`);
        }
      }
    }

    return result;
  }

  /**
   * Update confidence scores based on performance feedback (Step 13.5)
   *
   * Called when performance data becomes available.
   */
  async updatePerformanceFeedback(feedback: {
    articleId: string;
    performanceScore: number; // 0-1
    patternIds: string[];
    expertSourceIds?: string[];
    statisticIds?: string[];
  }): Promise<void> {
    // Update pattern confidence
    for (const patternId of feedback.patternIds) {
      try {
        await this.contentPatterns.updateConfidence(patternId, feedback.performanceScore);

        // Record success if performance is good
        if (feedback.performanceScore > 0.7) {
          await this.contentPatterns.recordSuccess(patternId, feedback.articleId);
        }
      } catch (error) {
        console.warn(`Failed to update pattern ${patternId}:`, error);
      }
    }

    // Update expert authority
    if (feedback.expertSourceIds) {
      for (const expertId of feedback.expertSourceIds) {
        try {
          await this.expertSources.updateAuthorityScore(expertId, feedback.performanceScore);
        } catch (error) {
          console.warn(`Failed to update expert ${expertId}:`, error);
        }
      }
    }

    // Update statistic credibility
    if (feedback.statisticIds) {
      for (const statId of feedback.statisticIds) {
        try {
          await this.statistics.updateCredibilityScore(statId, feedback.performanceScore);
        } catch (error) {
          console.warn(`Failed to update statistic ${statId}:`, error);
        }
      }
    }
  }

  /**
   * Get collection managers for direct access
   */
  getCollections() {
    return {
      expertSources: this.expertSources,
      statistics: this.statistics,
      keywordResearch: this.keywordResearch,
      competitorIntelligence: this.competitorIntelligence,
      serpPatterns: this.serpPatterns,
      contentPatterns: this.contentPatterns,
    };
  }
}
