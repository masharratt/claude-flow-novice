/**
 * Phase 4-5 Type Foundation Module
 *
 * Central export for all Phase 4-5 type definitions needed for:
 * - Phase 4: Content Gap Analysis
 * - Phase 5: Opportunity Scoring & Prioritization
 *
 * @module types/phase-4-5-foundation
 * @version 1.0.0
 */

// RuVector core types
export type { VectorEntry, VectorQueryOptions, VectorDB, EmbeddingFunction, VectorDBFactory } from './ruvector-core';

// Gap analysis types
export type {
  CompetitorGapType,
  GapOpportunityPriority,
  GapOpportunityStatus,
  ContentGap,
  GapAnalysisResult,
  GapOpportunity,
  GapAnalysisCacheEntry,
} from './gap-analysis';

// Opportunity scoring types
export type {
  ScoringDimension,
  ScoreComponent,
  OpportunityScore,
  KeywordOpportunityAnalysis,
  OpportunityRankingSet,
  OpportunityPortfolio,
  OpportunityConfidenceMetrics,
} from './opportunity-scoring';

// DataForSEO API types
export type {
  SearchIntentType,
  DataForSEOKeywordData,
  DataForSEOSERPResult,
  DataForSEOSERPAnalysis,
  DataForSEORankPosition,
  DataForSEOBacklinkData,
  DataForSEOErrorResponse,
  DataForSEOAPIResponse,
  CachedDataForSEOResearch,
} from './dataforseo-api';

// Import types for composite interface
import type { GapAnalysisResult } from './gap-analysis';
import type { GapOpportunity } from './gap-analysis';
import type { KeywordOpportunityAnalysis } from './opportunity-scoring';
import type { OpportunityPortfolio } from './opportunity-scoring';
import type { VectorEntry } from './ruvector-core';
import type { OpportunityScore } from './opportunity-scoring';

/**
 * Composite type for Phase 4-5 research context
 */
export interface Phase45ResearchContext {
  clusterId: string;
  primaryKeyword: string;
  gapAnalysis: GapAnalysisResult;
  opportunities: GapOpportunity[];
  scoring: KeywordOpportunityAnalysis;
  portfolio: OpportunityPortfolio;
  generatedAt: Date;
}

/**
 * Type guard: check if value is a VectorEntry
 */
export function isVectorEntry(value: unknown): value is VectorEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'text' in value &&
    'metadata' in value
  );
}

/**
 * Type guard: check if value is a GapOpportunity
 */
export function isGapOpportunity(value: unknown): value is GapOpportunity {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'type' in value &&
    'priority' in value &&
    'status' in value
  );
}

/**
 * Type guard: check if value is an OpportunityScore
 */
export function isOpportunityScore(value: unknown): value is OpportunityScore {
  return (
    typeof value === 'object' &&
    value !== null &&
    'opportunityId' in value &&
    'overallScore' in value &&
    'components' in value
  );
}
