/**
 * Cross-Niche Query Functions for SEO Intelligence Transfer
 *
 * Enables intelligent knowledge transfer across related niches:
 * - Cross-niche expert search with relevance scoring
 * - Cross-niche statistic search with applicability tagging
 * - Cross-niche pattern transfer with adaptation suggestions
 * - Stricter similarity thresholds by niche distance
 *
 * Phase 6, Sprint 1, Task 2: Cross-Niche Intelligence Queries
 */

import {
  NicheHierarchy,
  nicheHierarchy,
  QueryExpansion,
  RelationshipType,
} from './niche-hierarchy';
import type {
  ExpertSourceEntry,
  StatisticEntry,
  ContentPatternEntry,
  ContentPatternType,
} from './schemas';

/**
 * Cross-niche similarity thresholds
 * Stricter thresholds for cross-niche queries to ensure quality
 */
export const CROSS_NICHE_THRESHOLDS = {
  sameNiche: 0.7,        // Standard threshold
  sibling: 0.75,         // +0.05
  parent: 0.75,          // +0.05
  cousin: 0.8,           // +0.10
  distantRelative: 0.85, // +0.15
} as const;

/**
 * Niche distance values for relevance calculation
 */
const NICHE_DISTANCE = {
  self: 0,
  parent: 1,
  child: 1,
  sibling: 1,
  cousin: 2,
  ancestor: 2,
  descendant: 2,
  unrelated: 999,
} as const;

/**
 * Interface for SEO Query Manager
 * Minimal interface needed for cross-niche queries
 */
export interface SEOQueryManager {
  expertSources: {
    query(topic: string, options?: {
      limit?: number;
      minSimilarity?: number;
      niche?: string;
    }): Promise<Array<{ entry: ExpertSourceEntry; similarity: number }>>;
  };
  statistics: {
    query(topic: string, options?: {
      limit?: number;
      minSimilarity?: number;
      niche?: string;
    }): Promise<Array<{ entry: StatisticEntry; similarity: number }>>;
  };
  contentPatterns: {
    query(patternType: ContentPatternType, options?: {
      limit?: number;
      minSimilarity?: number;
      niche?: string;
    }): Promise<Array<{ entry: ContentPatternEntry; similarity: number }>>;
  };
}

// ============================================================================
// Cross-Niche Expert Search
// ============================================================================

export interface CrossNicheExpertResult {
  experts: Array<{
    expert: ExpertSourceEntry;
    sourceNiche: string;
    relevanceScore: number;
    transferConfidence: number;
  }>;
  queriedNiches: string[];
  totalFound: number;
}

export interface CrossNicheExpertOptions {
  maxResults?: number;
  minRelevance?: number;
  includeNiches?: string[];
}

/**
 * Search for experts across related niches
 * Adjusts relevance scores based on niche distance
 */
export async function searchExpertsAcrossNiches(
  queryManager: SEOQueryManager,
  targetNiche: string,
  topic: string,
  options?: CrossNicheExpertOptions
): Promise<CrossNicheExpertResult> {
  const opts = {
    maxResults: options?.maxResults ?? 10,
    minRelevance: options?.minRelevance ?? 0.6,
    includeNiches: options?.includeNiches,
  };

  // Expand query to related niches
  const expansion = nicheHierarchy.expandQueryByHierarchy(targetNiche, {
    includeSiblings: true,
    includeParent: true,
    includeCousins: true,
    maxExpansion: 10,
  });

  const nichesToQuery = opts.includeNiches ?? expansion.expandedNiches;
  const allExperts: Array<{
    expert: ExpertSourceEntry;
    sourceNiche: string;
    relevanceScore: number;
    transferConfidence: number;
  }> = [];

  // Query each niche
  for (const nicheId of nichesToQuery) {
    const relationship = nicheHierarchy.getRelationship(targetNiche, nicheId);
    const nicheDistance = NICHE_DISTANCE[relationship];
    const threshold = getThresholdForRelationship(relationship);

    try {
      const results = await queryManager.expertSources.query(topic, {
        limit: opts.maxResults * 2, // Get more to filter
        minSimilarity: threshold,
        niche: nicheId,
      });

      for (const result of results) {
        const relevanceScore = calculateCrossNicheRelevance(
          result.similarity,
          nicheDistance,
          getRecencyDays(result.entry.metadata.lastUpdated)
        );

        if (relevanceScore >= opts.minRelevance) {
          const transferConfidence = calculateTransferConfidence(
            result.entry,
            targetNiche,
            nicheId,
            relationship
          );

          allExperts.push({
            expert: result.entry,
            sourceNiche: nicheId,
            relevanceScore,
            transferConfidence,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to query niche ${nicheId}:`, error);
      continue;
    }
  }

  // Sort by relevance and transfer confidence
  allExperts.sort((a, b) => {
    const scoreA = a.relevanceScore * 0.6 + a.transferConfidence * 0.4;
    const scoreB = b.relevanceScore * 0.6 + b.transferConfidence * 0.4;
    return scoreB - scoreA;
  });

  return {
    experts: allExperts.slice(0, opts.maxResults),
    queriedNiches: nichesToQuery,
    totalFound: allExperts.length,
  };
}

// ============================================================================
// Cross-Niche Statistic Search
// ============================================================================

export type StatisticApplicability = 'direct' | 'analogous' | 'contextual';

export interface CrossNicheStatResult {
  statistics: Array<{
    statistic: StatisticEntry;
    sourceNiche: string;
    relevanceScore: number;
    applicability: StatisticApplicability;
  }>;
  queriedNiches: string[];
}

export interface CrossNicheStatOptions {
  maxResults?: number;
  minRelevance?: number;
  preferRecent?: boolean;
}

/**
 * Search for statistics across related niches
 * Tags each statistic with applicability level
 */
export async function searchStatisticsAcrossNiches(
  queryManager: SEOQueryManager,
  targetNiche: string,
  topic: string,
  options?: CrossNicheStatOptions
): Promise<CrossNicheStatResult> {
  const opts = {
    maxResults: options?.maxResults ?? 10,
    minRelevance: options?.minRelevance ?? 0.6,
    preferRecent: options?.preferRecent ?? true,
  };

  // Expand query to related niches
  const expansion = nicheHierarchy.expandQueryByHierarchy(targetNiche, {
    includeSiblings: true,
    includeParent: true,
    includeCousins: true,
    maxExpansion: 10,
  });

  const allStatistics: Array<{
    statistic: StatisticEntry;
    sourceNiche: string;
    relevanceScore: number;
    applicability: StatisticApplicability;
  }> = [];

  // Query each niche
  for (const nicheId of expansion.expandedNiches) {
    const relationship = nicheHierarchy.getRelationship(targetNiche, nicheId);
    const nicheDistance = NICHE_DISTANCE[relationship];
    const threshold = getThresholdForRelationship(relationship);

    try {
      const results = await queryManager.statistics.query(topic, {
        limit: opts.maxResults * 2,
        minSimilarity: threshold,
        niche: nicheId,
      });

      for (const result of results) {
        const recencyDays = getRecencyDays(result.entry.metadata.publicationDate);
        const relevanceScore = calculateCrossNicheRelevance(
          result.similarity,
          nicheDistance,
          recencyDays,
          opts.preferRecent
        );

        if (relevanceScore >= opts.minRelevance) {
          const applicability = determineStatisticApplicability(
            relationship,
            result.entry,
            targetNiche
          );

          allStatistics.push({
            statistic: result.entry,
            sourceNiche: nicheId,
            relevanceScore,
            applicability,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to query statistics for niche ${nicheId}:`, error);
      continue;
    }
  }

  // Sort by relevance
  allStatistics.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return {
    statistics: allStatistics.slice(0, opts.maxResults),
    queriedNiches: expansion.expandedNiches,
  };
}

// ============================================================================
// Cross-Niche Pattern Transfer
// ============================================================================

export type AdaptationLevel = 'none' | 'minor' | 'significant';

export interface PatternTransferResult {
  patterns: Array<{
    pattern: ContentPatternEntry;
    sourceNiche: string;
    transferScore: number;
    adaptationNeeded: AdaptationLevel;
    suggestions: string[];
  }>;
  queriedNiches: string[];
}

export interface PatternTransferOptions {
  maxResults?: number;
  minTransferScore?: number;
}

/**
 * Transfer content patterns from related niches
 * Provides adaptation suggestions for each pattern
 */
export async function transferPatternsFromRelatedNiches(
  queryManager: SEOQueryManager,
  targetNiche: string,
  patternType: ContentPatternType,
  options?: PatternTransferOptions
): Promise<PatternTransferResult> {
  const opts = {
    maxResults: options?.maxResults ?? 10,
    minTransferScore: options?.minTransferScore ?? 0.65,
  };

  // Expand query to related niches
  const expansion = nicheHierarchy.expandQueryByHierarchy(targetNiche, {
    includeSiblings: true,
    includeParent: true,
    includeCousins: true,
    maxExpansion: 10,
  });

  const allPatterns: Array<{
    pattern: ContentPatternEntry;
    sourceNiche: string;
    transferScore: number;
    adaptationNeeded: AdaptationLevel;
    suggestions: string[];
  }> = [];

  // Query each niche
  for (const nicheId of expansion.expandedNiches) {
    const relationship = nicheHierarchy.getRelationship(targetNiche, nicheId);
    const nicheDistance = NICHE_DISTANCE[relationship];
    const threshold = getThresholdForRelationship(relationship);

    try {
      const results = await queryManager.contentPatterns.query(patternType, {
        limit: opts.maxResults * 2,
        minSimilarity: threshold,
        niche: nicheId,
      });

      for (const result of results) {
        const transferScore = calculatePatternTransferScore(
          result.similarity,
          nicheDistance,
          result.entry,
          targetNiche
        );

        if (transferScore >= opts.minTransferScore) {
          const adaptationNeeded = determineAdaptationLevel(
            relationship,
            transferScore
          );

          const suggestions = generateAdaptationSuggestions(
            result.entry,
            targetNiche,
            nicheId,
            relationship
          );

          allPatterns.push({
            pattern: result.entry,
            sourceNiche: nicheId,
            transferScore,
            adaptationNeeded,
            suggestions,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to query patterns for niche ${nicheId}:`, error);
      continue;
    }
  }

  // Sort by transfer score
  allPatterns.sort((a, b) => b.transferScore - a.transferScore);

  return {
    patterns: allPatterns.slice(0, opts.maxResults),
    queriedNiches: expansion.expandedNiches,
  };
}

// ============================================================================
// Combined Cross-Niche Intelligence
// ============================================================================

export interface CrossNicheIntelligence {
  experts: CrossNicheExpertResult;
  statistics: CrossNicheStatResult;
  patterns: PatternTransferResult;
  summary: {
    totalItems: number;
    nichesCovered: string[];
    averageRelevance: number;
    topSourceNiche: string;
  };
}

/**
 * Gather comprehensive cross-niche intelligence
 * Combines experts, statistics, and patterns in one query
 */
export async function gatherCrossNicheIntelligence(
  queryManager: SEOQueryManager,
  targetNiche: string,
  topic: string
): Promise<CrossNicheIntelligence> {
  // Query all three types in parallel
  const [experts, statistics, patterns] = await Promise.all([
    searchExpertsAcrossNiches(queryManager, targetNiche, topic, {
      maxResults: 5,
      minRelevance: 0.6,
    }),
    searchStatisticsAcrossNiches(queryManager, targetNiche, topic, {
      maxResults: 5,
      minRelevance: 0.6,
    }),
    transferPatternsFromRelatedNiches(queryManager, targetNiche, 'ANGLE', {
      maxResults: 5,
      minTransferScore: 0.65,
    }),
  ]);

  // Calculate summary statistics
  const allNiches = new Set([
    ...experts.queriedNiches,
    ...statistics.queriedNiches,
    ...patterns.queriedNiches,
  ]);

  const nicheFrequency = new Map<string, number>();
  for (const expert of experts.experts) {
    nicheFrequency.set(expert.sourceNiche, (nicheFrequency.get(expert.sourceNiche) ?? 0) + 1);
  }
  for (const stat of statistics.statistics) {
    nicheFrequency.set(stat.sourceNiche, (nicheFrequency.get(stat.sourceNiche) ?? 0) + 1);
  }
  for (const pattern of patterns.patterns) {
    nicheFrequency.set(pattern.sourceNiche, (nicheFrequency.get(pattern.sourceNiche) ?? 0) + 1);
  }

  const topSourceNiche = Array.from(nicheFrequency.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? targetNiche;

  const totalRelevance =
    experts.experts.reduce((sum, e) => sum + e.relevanceScore, 0) +
    statistics.statistics.reduce((sum, s) => sum + s.relevanceScore, 0) +
    patterns.patterns.reduce((sum, p) => sum + p.transferScore, 0);

  const totalItems = experts.experts.length + statistics.statistics.length + patterns.patterns.length;

  return {
    experts,
    statistics,
    patterns,
    summary: {
      totalItems,
      nichesCovered: Array.from(allNiches),
      averageRelevance: totalItems > 0 ? totalRelevance / totalItems : 0,
      topSourceNiche,
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate cross-niche relevance score
 * Adjusts vector similarity by niche distance and recency
 */
export function calculateCrossNicheRelevance(
  vectorSimilarity: number,
  nicheDistance: number,
  lastUsedDays: number,
  preferRecent: boolean = false
): number {
  // Apply niche weight (10% penalty per level)
  const nicheWeight = Math.pow(0.9, nicheDistance);

  // Apply recency boost if preferred
  const recencyBoost = preferRecent && lastUsedDays < 30 ? 1.1 : 1.0;

  // Apply recency penalty for very old content
  const recencyPenalty = lastUsedDays > 365 ? 0.9 : 1.0;

  return vectorSimilarity * nicheWeight * recencyBoost * recencyPenalty;
}

/**
 * Calculate transfer confidence for experts
 * Based on topic overlap and authority
 */
function calculateTransferConfidence(
  expert: ExpertSourceEntry,
  targetNiche: string,
  sourceNiche: string,
  relationship: RelationshipType
): number {
  let confidence = 0.5;

  // Higher confidence for closer relationships
  if (relationship === 'self') confidence = 1.0;
  else if (relationship === 'sibling' || relationship === 'parent') confidence = 0.85;
  else if (relationship === 'cousin') confidence = 0.7;
  else confidence = 0.6;

  // Boost for high authority
  if (expert.metadata.authorityScore > 0.8) {
    confidence += 0.1;
  }

  // Boost for multiple uses
  if (expert.metadata.useCount > 5) {
    confidence += 0.05;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Determine statistic applicability
 */
function determineStatisticApplicability(
  relationship: RelationshipType,
  stat: StatisticEntry,
  targetNiche: string
): StatisticApplicability {
  if (relationship === 'self') return 'direct';
  if (relationship === 'sibling' || relationship === 'parent' || relationship === 'child') {
    return 'analogous';
  }
  return 'contextual';
}

/**
 * Calculate pattern transfer score
 */
function calculatePatternTransferScore(
  vectorSimilarity: number,
  nicheDistance: number,
  pattern: ContentPatternEntry,
  targetNiche: string
): number {
  // Base score from similarity
  let score = vectorSimilarity;

  // Apply niche distance penalty (8% per level)
  score *= Math.pow(0.92, nicheDistance);

  // Boost for high confidence patterns
  if (pattern.metadata.confidenceScore && pattern.metadata.confidenceScore > 0.8) {
    score *= 1.1;
  }

  // Boost for frequently used patterns
  if (pattern.metadata.useCount && pattern.metadata.useCount > 10) {
    score *= 1.05;
  }

  return Math.min(score, 1.0);
}

/**
 * Determine adaptation level needed
 */
function determineAdaptationLevel(
  relationship: RelationshipType,
  transferScore: number
): AdaptationLevel {
  if (relationship === 'self') return 'none';
  if (transferScore > 0.85) return 'none';
  if (transferScore > 0.75) return 'minor';
  return 'significant';
}

/**
 * Generate adaptation suggestions
 */
function generateAdaptationSuggestions(
  pattern: ContentPatternEntry,
  targetNiche: string,
  sourceNiche: string,
  relationship: RelationshipType
): string[] {
  const suggestions: string[] = [];

  const targetNode = nicheHierarchy.nodes.get(targetNiche);
  const sourceNode = nicheHierarchy.nodes.get(sourceNiche);

  if (!targetNode || !sourceNode) {
    return ['Verify niche-specific terminology and examples'];
  }

  if (relationship === 'self') {
    return ['Pattern can be used directly'];
  }

  if (relationship === 'sibling' || relationship === 'parent' || relationship === 'child') {
    suggestions.push(
      `Replace ${sourceNode.name} terminology with ${targetNode.name} equivalents`,
      'Update examples to match target audience',
      'Adjust technical depth if needed'
    );
  } else {
    suggestions.push(
      `Heavily adapt from ${sourceNode.name} to ${targetNode.name} context`,
      'Replace all domain-specific examples',
      'Reframe value proposition for new audience',
      'Verify assumptions and constraints are valid'
    );
  }

  // Pattern type specific suggestions
  if (pattern.metadata.type === 'ANGLE') {
    suggestions.push('Validate that the angle resonates with target niche pain points');
  } else if (pattern.metadata.type === 'CTA') {
    suggestions.push('Update call-to-action to match target niche conversion goals');
  } else if (pattern.metadata.type === 'VOICE') {
    suggestions.push('Adjust tone and formality to match target niche expectations');
  }

  return suggestions;
}

/**
 * Get appropriate similarity threshold for relationship
 */
function getThresholdForRelationship(relationship: RelationshipType): number {
  switch (relationship) {
    case 'self':
      return CROSS_NICHE_THRESHOLDS.sameNiche;
    case 'sibling':
      return CROSS_NICHE_THRESHOLDS.sibling;
    case 'parent':
    case 'child':
      return CROSS_NICHE_THRESHOLDS.parent;
    case 'cousin':
      return CROSS_NICHE_THRESHOLDS.cousin;
    default:
      return CROSS_NICHE_THRESHOLDS.distantRelative;
  }
}

/**
 * Calculate days since date
 */
function getRecencyDays(date: Date): number {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
