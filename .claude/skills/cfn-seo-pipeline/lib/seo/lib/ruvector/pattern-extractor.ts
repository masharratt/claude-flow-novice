/**
 * Pattern Extractor Module - Sprint 1.4, Step 12.5 Implementation
 *
 * Extracts and stores successful content patterns from completed onboarding pipelines.
 * Enables continuous learning by reusing patterns across similar sites and niches.
 *
 * Patterns extracted:
 * - Site Profile: industry, size, technical health, content maturity
 * - Content Strategy: pillars, keyword approach, content types, metrics
 * - Competitor Positioning: strategies, differentiators, moats
 * - Keyword Clusters: semantic grouping, performance data, recommendations
 *
 * Storage: RuVector content_patterns collection with semantic searchability
 * Tagging: industry, site-size, confidence for intelligent reuse
 *
 * @module seo/lib/ruvector/pattern-extractor
 */

import type { SEOQueryManager } from './queries';
import type { ContentPatternType, ContentPatternEntry } from './schemas';
import {
  generateContentPatternId,
  generateContentPatternEmbeddingText,
} from './schemas';
import type { ContentPatternsCollection } from './collections/content-patterns';

// ============================================================================
// Pattern Type Definitions
// ============================================================================

/**
 * Site profile pattern - extracted from Phase 1 & 2
 */
export interface SiteProfilePattern {
  /** Industry/niche classification */
  industry: string;

  /** Site size category */
  siteSize: 'small' | 'medium' | 'large' | 'enterprise';

  /** Technical health score (0-100) */
  technicalHealth: number;

  /** Content maturity level (0-100) */
  contentMaturity: number;

  /** Identified competitive landscape */
  competitiveLandscape: string;

  /** Key success factors identified */
  successFactors: string[];

  /** Overall confidence in this pattern (0.0-1.0) */
  confidence: number;

  /** Supporting metadata */
  metadata: {
    domain: string;
    crawlDate: Date;
    pageCount: number;
    averageLoadTime: number;
  };
}

/**
 * Content strategy pattern - extracted from Phase 3 & 4
 */
export interface ContentStrategyPattern {
  /** Content pillars identified */
  pillars: string[];

  /** Keyword targeting approach */
  keywordApproach: 'broad' | 'specific' | 'question-based' | 'long-tail';

  /** Content types employed */
  contentTypes: string[];

  /** Target publishing frequency */
  publishingFrequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';

  /** Performance indicators */
  successMetrics: {
    averageTrafficGrowth: number;
    averageRankingImprovement: number;
    averageCTRLift: number;
    targetTopicsCount: number;
  };

  /** Industries where this strategy applies */
  applicableIndustries: string[];

  /** Pattern confidence score */
  confidence: number;

  /** Structure recommendations */
  structureGuidance: {
    recommendedWordCount: number;
    recommendedHeadingLevels: number;
    recommendedSectionCount: number;
    recommendedMediaInclusion: string[];
  };
}

/**
 * Competitor positioning pattern - extracted from Phase 2.5
 */
export interface CompetitorPattern {
  /** Identified successful competitor strategies */
  strategies: {
    name: string;
    description: string;
    effectiveness: number; // 0-1
    examples: string[];
  }[];

  /** Identified competitive differentiators */
  differentiators: {
    factor: string;
    importance: number; // 0-1
    howCompetitorsImplement: string;
    opportunity: string;
  }[];

  /** Identified competitive moats */
  moats: {
    type: 'brand' | 'content-depth' | 'technical' | 'social-proof' | 'distribution';
    description: string;
    difficulty: number; // 0-1, how hard to replicate
  }[];

  /** Average competitor authority */
  averageCompetitorAuthority: number;

  /** Content gap opportunities identified */
  contentGaps: {
    topic: string;
    difficulty: number;
    opportunityScore: number; // 0-1
  }[];

  /** Pattern confidence */
  confidence: number;
}

/**
 * Keyword cluster pattern - extracted from Phase 1 & 3
 */
export interface KeywordClusterPattern {
  /** Cluster name/topic */
  cluster: string;

  /** Keywords in this cluster */
  keywords: string[];

  /** Identified search intent */
  searchIntent: 'informational' | 'navigational' | 'commercial' | 'transactional';

  /** Average keyword difficulty (0-100) */
  averageDifficulty: number;

  /** Average monthly search volume */
  averageVolume: number;

  /** Recommended content approach */
  contentRecommendations: string[];

  /** Semantic relationships to other clusters */
  relatedClusters: string[];

  /** Performance data if available */
  performanceMetrics?: {
    averageRankingPosition: number;
    averageCTR: number;
    estimatedTraffic: number;
  };

  /** Pattern confidence */
  confidence: number;
}

/**
 * All extracted patterns from a complete onboarding
 */
export interface ExtractedPatterns {
  /** Site profile pattern */
  siteProfile: SiteProfilePattern;

  /** Content strategy pattern */
  contentStrategy: ContentStrategyPattern;

  /** Competitor positioning pattern */
  competitorPositioning: CompetitorPattern;

  /** Keyword cluster patterns (1-N) */
  keywordClusters: KeywordClusterPattern[];

  /** Overall learning confidence */
  overallConfidence: number;

  /** When patterns were extracted */
  extractedAt: Date;

  /** Source site/task that generated patterns */
  sourceTask: {
    taskId: string;
    domain: string;
    niche: string;
  };
}

/**
 * Pattern metadata for storage and retrieval
 */
export interface PatternMetadata {
  /** Niche/industry for pattern tagging */
  niche: string;

  /** Parent niche for cross-niche queries */
  parentNiche?: string;

  /** Site size for applicability */
  appliedSiteSize?: 'small' | 'medium' | 'large' | 'enterprise';

  /** Minimum confidence threshold */
  minConfidence: number;

  /** When pattern should expire (null = never) */
  expiresAt?: Date;

  /** Additional tags for semantic search */
  tags: string[];
}

/**
 * Result of pattern extraction and storage
 */
export interface PatternExtractionResult {
  /** Number of patterns extracted */
  patternsExtracted: number;

  /** Number of patterns successfully stored in RuVector */
  patternsStored: number;

  /** Number of patterns skipped (low confidence) */
  patternsSkipped: number;

  /** Breakdown by pattern type */
  breakdown: {
    siteProfile: boolean;
    contentStrategy: boolean;
    competitorPositioning: boolean;
    keywordClusters: number;
  };

  /** Confidence scores */
  confidenceScores: {
    average: number;
    min: number;
    max: number;
  };

  /** RuVector document IDs for stored patterns */
  storedPatternIds: string[];

  /** Any warnings or issues */
  warnings: string[];

  /** Execution time in milliseconds */
  executionTimeMs: number;
}

// ============================================================================
// Pattern Extractor Class
// ============================================================================

/**
 * Extracts and stores patterns from completed SEO onboarding pipelines
 */
export class PatternExtractor {
  private contentPatterns: ContentPatternsCollection | null = null;
  private verbose: boolean;
  private minConfidenceThreshold: number;

  constructor(options?: {
    verbose?: boolean;
    minConfidenceThreshold?: number;
  }) {
    this.verbose = options?.verbose ?? false;
    this.minConfidenceThreshold = options?.minConfidenceThreshold ?? 0.6;
  }

  /**
   * Set the content patterns collection (dependency injection)
   */
  setContentPatternsCollection(collection: ContentPatternsCollection): void {
    this.contentPatterns = collection;
  }

  /**
   * Extract site profile pattern from phases 1-2 data
   */
  extractSiteProfilePattern(phaseOutputs: {
    phase1?: Record<string, unknown>;
    phase2?: Record<string, unknown>;
    domain: string;
    niche: string;
  }): SiteProfilePattern {
    const phase1 = phaseOutputs.phase1 as any;
    const phase2 = phaseOutputs.phase2 as any;

    // Extract technical metrics
    const technicalHealth = this.calculateTechnicalHealth(phase1);
    const contentMaturity = this.calculateContentMaturity(phase1, phase2);
    const siteSize = this.determineSiteSize(phase1);

    // Extract competitive landscape
    const competitiveLandscape = phase2?.landscape || 'unknown';
    const successFactors = phase2?.successFactors || [];

    // Calculate confidence based on data quality
    const confidence = Math.min(
      1.0,
      (technicalHealth + contentMaturity) / 200 * 0.6 + 0.4
    );

    return {
      industry: phaseOutputs.niche,
      siteSize,
      technicalHealth,
      contentMaturity,
      competitiveLandscape,
      successFactors: Array.isArray(successFactors) ? successFactors : [],
      confidence,
      metadata: {
        domain: phaseOutputs.domain,
        crawlDate: new Date(),
        pageCount: phase1?.pageCount || 0,
        averageLoadTime: phase1?.averageLoadTime || 0,
      },
    };
  }

  /**
   * Extract content strategy pattern from phases 3-4 data
   */
  extractContentStrategyPattern(phaseOutputs: {
    phase3?: Record<string, unknown>;
    phase4?: Record<string, unknown>;
    niche: string;
  }): ContentStrategyPattern {
    const phase3 = phaseOutputs.phase3 as any;
    const phase4 = phaseOutputs.phase4 as any;

    // Extract pillars and structure
    const pillars = phase3?.contentPillars || [];
    const keywordApproach = this.determineKeywordApproach(phase3);
    const contentTypes = phase3?.contentTypes || [];
    const publishingFrequency = this.determinePublishingFrequency(phase4);

    // Extract success metrics
    const successMetrics = {
      averageTrafficGrowth: phase4?.trafficGrowth || 0,
      averageRankingImprovement: phase4?.rankingImprovement || 0,
      averageCTRLift: phase4?.ctrLift || 0,
      targetTopicsCount: Array.isArray(pillars) ? pillars.length : 0,
    };

    // Determine applicable industries
    const applicableIndustries = this.determineApplicableIndustries(
      phaseOutputs.niche,
      phase3,
      phase4
    );

    // Calculate confidence
    const confidence = this.calculateStrategyConfidence(phase3, phase4);

    // Structure guidance
    const structureGuidance = {
      recommendedWordCount: phase3?.recommendedWordCount || 2000,
      recommendedHeadingLevels: phase3?.recommendedHeadings || 3,
      recommendedSectionCount: phase3?.recommendedSections || 5,
      recommendedMediaInclusion: phase3?.recommendedMedia || [],
    };

    return {
      pillars: Array.isArray(pillars) ? pillars : [],
      keywordApproach,
      contentTypes: Array.isArray(contentTypes) ? contentTypes : [],
      publishingFrequency,
      successMetrics,
      applicableIndustries,
      confidence,
      structureGuidance,
    };
  }

  /**
   * Extract competitor positioning pattern from phase 2.5 data
   */
  extractCompetitorPattern(phaseOutputs: {
    phase2_5?: Record<string, unknown>;
    niche: string;
  }): CompetitorPattern {
    const phase2_5 = phaseOutputs.phase2_5 as any;

    // Extract strategies
    const strategies = this.extractStrategies(phase2_5?.strategies || []);

    // Extract differentiators
    const differentiators = this.extractDifferentiators(phase2_5?.differentiators || []);

    // Extract moats
    const moats = this.extractMoats(phase2_5?.moats || []);

    // Extract authority and gaps
    const averageCompetitorAuthority = phase2_5?.averageAuthority || 0;
    const contentGaps = this.extractContentGaps(phase2_5?.gaps || []);

    // Calculate confidence
    const confidence = Math.min(
      1.0,
      (strategies.length * 0.2 + differentiators.length * 0.2 + moats.length * 0.3) / 0.7
    );

    return {
      strategies,
      differentiators,
      moats,
      averageCompetitorAuthority,
      contentGaps,
      confidence,
    };
  }

  /**
   * Extract keyword cluster patterns from phase 1 & 3 data
   */
  extractKeywordClusterPatterns(phaseOutputs: {
    phase1?: Record<string, unknown>;
    phase3?: Record<string, unknown>;
    niche: string;
  }): KeywordClusterPattern[] {
    const phase1 = phaseOutputs.phase1 as any;
    const phase3 = phaseOutputs.phase3 as any;

    const clusters: KeywordClusterPattern[] = [];
    const keywordClusters = phase1?.clusters || phase3?.clusters || [];

    if (!Array.isArray(keywordClusters)) {
      return clusters;
    }

    for (const cluster of keywordClusters) {
      if (!cluster || typeof cluster !== 'object') continue;

      const keywords = Array.isArray(cluster.keywords) ? cluster.keywords : [];
      const searchIntent = this.determineSearchIntent(cluster.intent);
      const averageDifficulty = cluster.avgDifficulty || 0;
      const averageVolume = cluster.avgVolume || 0;

      // Content recommendations based on cluster characteristics
      const contentRecommendations = this.generateContentRecommendations(
        searchIntent,
        averageDifficulty,
        cluster
      );

      // Related clusters
      const relatedClusters = Array.isArray(cluster.relatedClusters)
        ? cluster.relatedClusters
        : [];

      // Performance metrics if available
      const performanceMetrics = cluster.performanceMetrics ? {
        averageRankingPosition: cluster.performanceMetrics.avgPosition || 0,
        averageCTR: cluster.performanceMetrics.avgCTR || 0,
        estimatedTraffic: cluster.performanceMetrics.traffic || 0,
      } : undefined;

      // Confidence based on cluster completeness
      const confidence = this.calculateClusterConfidence(cluster);

      clusters.push({
        cluster: cluster.name || `Cluster-${clusters.length}`,
        keywords,
        searchIntent,
        averageDifficulty,
        averageVolume,
        contentRecommendations,
        relatedClusters,
        performanceMetrics,
        confidence,
      });
    }

    return clusters;
  }

  /**
   * Store all extracted patterns in RuVector
   */
  async storePatterns(
    patterns: ExtractedPatterns,
    metadata: PatternMetadata
  ): Promise<PatternExtractionResult> {
    const startTime = Date.now();
    const storedPatternIds: string[] = [];
    const warnings: string[] = [];
    let patternsStored = 0;
    let patternsSkipped = 0;

    if (!this.contentPatterns) {
      throw new Error('ContentPatternsCollection not initialized');
    }

    try {
      // Store site profile pattern
      if (patterns.siteProfile.confidence >= this.minConfidenceThreshold) {
        const siteProfileId = await this.storeSiteProfilePattern(
          patterns.siteProfile,
          metadata
        );
        storedPatternIds.push(siteProfileId);
        patternsStored++;
      } else {
        patternsSkipped++;
        warnings.push(
          `Site profile pattern skipped: confidence ${patterns.siteProfile.confidence.toFixed(2)} below threshold`
        );
      }

      // Store content strategy pattern
      if (patterns.contentStrategy.confidence >= this.minConfidenceThreshold) {
        const strategyIds = await this.storeContentStrategyPattern(
          patterns.contentStrategy,
          metadata
        );
        storedPatternIds.push(...strategyIds);
        patternsStored++;
      } else {
        patternsSkipped++;
        warnings.push(
          `Content strategy pattern skipped: confidence ${patterns.contentStrategy.confidence.toFixed(2)} below threshold`
        );
      }

      // Store competitor positioning pattern
      if (patterns.competitorPositioning.confidence >= this.minConfidenceThreshold) {
        const competitorIds = await this.storeCompetitorPattern(
          patterns.competitorPositioning,
          metadata
        );
        storedPatternIds.push(...competitorIds);
        patternsStored++;
      } else {
        patternsSkipped++;
        warnings.push(
          `Competitor pattern skipped: confidence ${patterns.competitorPositioning.confidence.toFixed(2)} below threshold`
        );
      }

      // Store keyword cluster patterns
      for (const cluster of patterns.keywordClusters) {
        if (cluster.confidence >= this.minConfidenceThreshold) {
          const clusterId = await this.storeKeywordClusterPattern(cluster, metadata);
          storedPatternIds.push(clusterId);
          patternsStored++;
        } else {
          patternsSkipped++;
          warnings.push(
            `Cluster pattern "${cluster.cluster}" skipped: confidence ${cluster.confidence.toFixed(2)} below threshold`
          );
        }
      }

      if (this.verbose) {
        console.log(`[PatternExtractor] Stored ${patternsStored} patterns in RuVector`);
      }

    } catch (error) {
      warnings.push(`Error storing patterns: ${error instanceof Error ? error.message : String(error)}`);
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      patternsExtracted: 4 + patterns.keywordClusters.length,
      patternsStored,
      patternsSkipped,
      breakdown: {
        siteProfile: patternsStored >= 1,
        contentStrategy: patternsStored >= 2,
        competitorPositioning: patternsStored >= 3,
        keywordClusters: patterns.keywordClusters.filter(
          (c) => c.confidence >= this.minConfidenceThreshold
        ).length,
      },
      confidenceScores: {
        average: patterns.overallConfidence,
        min: Math.min(
          patterns.siteProfile.confidence,
          patterns.contentStrategy.confidence,
          patterns.competitorPositioning.confidence,
          ...patterns.keywordClusters.map((c) => c.confidence)
        ),
        max: Math.max(
          patterns.siteProfile.confidence,
          patterns.contentStrategy.confidence,
          patterns.competitorPositioning.confidence,
          ...patterns.keywordClusters.map((c) => c.confidence)
        ),
      },
      storedPatternIds,
      warnings,
      executionTimeMs,
    };
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  private calculateTechnicalHealth(phase1: any): number {
    if (!phase1 || typeof phase1 !== 'object') return 0;

    let score = 50; // Base score

    // Core Web Vitals
    if (phase1.coreWebVitals?.pass) score += 15;
    if (phase1.mobileUsable) score += 10;
    if (phase1.sslCertificate) score += 10;
    if (phase1.crawlability?.good) score += 10;
    if (phase1.indexing?.good) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  private calculateContentMaturity(phase1: any, phase2: any): number {
    if (!phase1 || !phase2) return 0;

    let score = 30; // Base score

    // Content volume
    const pageCount = phase1.pageCount || 0;
    if (pageCount > 100) score += 20;
    else if (pageCount > 50) score += 15;
    else if (pageCount > 20) score += 10;

    // Topic coverage
    const topicCount = phase2.topicsCovered || 0;
    if (topicCount > 50) score += 20;
    else if (topicCount > 20) score += 15;
    else if (topicCount > 5) score += 10;

    // Content freshness
    if (phase2.recentUpdates?.count > 0) score += 10;

    return Math.min(100, Math.max(0, score));
  }

  private determineSiteSize(phase1: any): 'small' | 'medium' | 'large' | 'enterprise' {
    const pageCount = phase1?.pageCount || 0;

    if (pageCount > 1000) return 'enterprise';
    if (pageCount > 500) return 'large';
    if (pageCount > 100) return 'medium';
    return 'small';
  }

  private determineKeywordApproach(
    phase3: any
  ): 'broad' | 'specific' | 'question-based' | 'long-tail' {
    if (!phase3) return 'specific';

    const approach = phase3.keywordApproach;
    if (approach && ['broad', 'specific', 'question-based', 'long-tail'].includes(approach)) {
      return approach;
    }

    // Infer from data
    const avgVolume = phase3.avgSearchVolume || 0;
    if (avgVolume > 10000) return 'broad';
    if (phase3.questionKeywords?.count > phase3.keywords?.count / 2) return 'question-based';
    if (phase3.longTailPercentage > 0.6) return 'long-tail';

    return 'specific';
  }

  private determinePublishingFrequency(
    phase4: any
  ): 'daily' | 'weekly' | 'bi-weekly' | 'monthly' {
    if (!phase4) return 'weekly';

    const frequency = phase4.publishingFrequency;
    if (frequency && ['daily', 'weekly', 'bi-weekly', 'monthly'].includes(frequency)) {
      return frequency;
    }

    // Infer from capacity
    const articlesPerMonth = phase4.articlesPerMonth || 4;
    if (articlesPerMonth >= 30) return 'daily';
    if (articlesPerMonth >= 8) return 'weekly';
    if (articlesPerMonth >= 2) return 'bi-weekly';
    return 'monthly';
  }

  private determineApplicableIndustries(
    niche: string,
    phase3: any,
    phase4: any
  ): string[] {
    const industries = new Set<string>();
    industries.add(niche);

    // Add related industries from phase data
    if (phase3?.relatedNiches) {
      const related = Array.isArray(phase3.relatedNiches) ? phase3.relatedNiches : [];
      related.forEach((n) => industries.add(n));
    }

    return Array.from(industries);
  }

  private calculateStrategyConfidence(phase3: any, phase4: any): number {
    let confidence = 0.5;

    // Increase based on completeness
    if (phase3?.contentPillars?.length > 0) confidence += 0.1;
    if (phase3?.contentTypes?.length > 0) confidence += 0.1;
    if (phase4?.trafficGrowth !== undefined) confidence += 0.1;
    if (phase4?.rankingImprovement !== undefined) confidence += 0.1;
    if (phase4?.ctrLift !== undefined) confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  private extractStrategies(
    strategiesData: any[]
  ): CompetitorPattern['strategies'] {
    if (!Array.isArray(strategiesData)) return [];

    return strategiesData
      .filter((s) => s && typeof s === 'object')
      .map((strategy) => ({
        name: strategy.name || 'Unknown',
        description: strategy.description || '',
        effectiveness: strategy.effectiveness ?? 0.5,
        examples: Array.isArray(strategy.examples) ? strategy.examples : [],
      }));
  }

  private extractDifferentiators(
    differentiatorsData: any[]
  ): CompetitorPattern['differentiators'] {
    if (!Array.isArray(differentiatorsData)) return [];

    return differentiatorsData
      .filter((d) => d && typeof d === 'object')
      .map((diff) => ({
        factor: diff.factor || 'Unknown',
        importance: diff.importance ?? 0.5,
        howCompetitorsImplement: diff.howCompetitorsImplement || '',
        opportunity: diff.opportunity || '',
      }));
  }

  private extractMoats(moatsData: any[]): CompetitorPattern['moats'] {
    if (!Array.isArray(moatsData)) return [];

    return moatsData
      .filter((m) => m && typeof m === 'object')
      .map((moat) => ({
        type: (moat.type || 'brand') as any,
        description: moat.description || '',
        difficulty: moat.difficulty ?? 0.5,
      }));
  }

  private extractContentGaps(gapsData: any[]): CompetitorPattern['contentGaps'] {
    if (!Array.isArray(gapsData)) return [];

    return gapsData
      .filter((g) => g && typeof g === 'object')
      .map((gap) => ({
        topic: gap.topic || 'Unknown',
        difficulty: gap.difficulty ?? 0.5,
        opportunityScore: gap.opportunityScore ?? 0.5,
      }));
  }

  private determineSearchIntent(
    intent: string
  ): 'informational' | 'navigational' | 'commercial' | 'transactional' {
    if (intent && ['informational', 'navigational', 'commercial', 'transactional'].includes(intent)) {
      return intent as any;
    }
    return 'informational';
  }

  private generateContentRecommendations(
    intent: string,
    difficulty: number,
    cluster: any
  ): string[] {
    const recommendations: string[] = [];

    if (intent === 'informational') {
      recommendations.push('Create comprehensive guide');
      recommendations.push('Include expert quotes');
      recommendations.push('Add data and statistics');
    } else if (intent === 'transactional') {
      recommendations.push('Include product comparisons');
      recommendations.push('Add pricing information');
      recommendations.push('Create clear CTAs');
    } else if (intent === 'commercial') {
      recommendations.push('Highlight unique selling points');
      recommendations.push('Include reviews');
      recommendations.push('Create buying guides');
    }

    if (difficulty > 70) {
      recommendations.push('Target long-tail variations');
      recommendations.push('Create pillar content first');
    }

    return recommendations;
  }

  private calculateClusterConfidence(cluster: any): number {
    let confidence = 0.5;

    if (cluster.keywords?.length > 0) confidence += 0.1;
    if (cluster.avgVolume !== undefined) confidence += 0.1;
    if (cluster.avgDifficulty !== undefined) confidence += 0.1;
    if (cluster.performanceMetrics) confidence += 0.1;
    if (cluster.relatedClusters?.length > 0) confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  private async storeSiteProfilePattern(
    pattern: SiteProfilePattern,
    metadata: PatternMetadata
  ): Promise<string> {
    if (!this.contentPatterns) {
      throw new Error('ContentPatternsCollection not initialized');
    }

    const description = `Site profile for ${pattern.industry} industry: ${pattern.siteSize} site with ${pattern.technicalHealth}/100 technical health`;
    const example = `Domain: ${pattern.metadata.domain}, Pages: ${pattern.metadata.pageCount}`;
    const patternId = generateContentPatternId('STRUCTURE', description);

    const entry = await this.contentPatterns.add({
      type: 'STRUCTURE' as ContentPatternType,
      description,
      example,
      niche: metadata.niche,
      format: `site-profile-${pattern.siteSize}`,
      confidenceScore: pattern.confidence,
    });

    return entry.id;
  }

  private async storeContentStrategyPattern(
    pattern: ContentStrategyPattern,
    metadata: PatternMetadata
  ): Promise<string[]> {
    if (!this.contentPatterns) {
      throw new Error('ContentPatternsCollection not initialized');
    }

    const ids: string[] = [];
    const patternTypes: ContentPatternType[] = ['STRUCTURE', 'ANGLE', 'VOICE'];

    // Store structure-related aspects
    const structureDesc = `Content strategy with pillars: ${pattern.pillars.join(', ')}`;
    const structureExample = `Word count: ${pattern.structureGuidance.recommendedWordCount}, Sections: ${pattern.structureGuidance.recommendedSectionCount}`;

    const structureEntry = await this.contentPatterns.add({
      type: 'STRUCTURE',
      description: structureDesc,
      example: structureExample,
      niche: metadata.niche,
      confidenceScore: pattern.confidence,
    });
    ids.push(structureEntry.id);

    return ids;
  }

  private async storeCompetitorPattern(
    pattern: CompetitorPattern,
    metadata: PatternMetadata
  ): Promise<string[]> {
    if (!this.contentPatterns) {
      throw new Error('ContentPatternsCollection not initialized');
    }

    const ids: string[] = [];

    // Store top competitor strategies as patterns
    for (const strategy of pattern.strategies.slice(0, 2)) {
      const desc = `Competitor strategy: ${strategy.name}`;
      const example = strategy.description;

      const entry = await this.contentPatterns.add({
        type: 'ANGLE',
        description: desc,
        example: example || desc,
        niche: metadata.niche,
        confidenceScore: pattern.confidence * strategy.effectiveness,
      });
      ids.push(entry.id);
    }

    return ids;
  }

  private async storeKeywordClusterPattern(
    cluster: KeywordClusterPattern,
    metadata: PatternMetadata
  ): Promise<string> {
    if (!this.contentPatterns) {
      throw new Error('ContentPatternsCollection not initialized');
    }

    const description = `Keyword cluster: ${cluster.cluster} (${cluster.keywords.length} keywords, ${cluster.searchIntent} intent)`;
    const example = `Top keywords: ${cluster.keywords.slice(0, 3).join(', ')}`;

    const entry = await this.contentPatterns.add({
      type: 'STRUCTURE',
      description,
      example,
      niche: metadata.niche,
      confidenceScore: cluster.confidence,
      performanceMetrics: cluster.performanceMetrics,
    });

    return entry.id;
  }
}

// ============================================================================
// Export All Types and Classes
// ============================================================================

export type {
  SiteProfilePattern,
  ContentStrategyPattern,
  CompetitorPattern,
  KeywordClusterPattern,
  ExtractedPatterns,
  PatternMetadata,
  PatternExtractionResult,
};
