/**
 * SEO Opportunity Scoring Type Definitions
 *
 * Type definitions for Phase 4-5: Opportunity Scoring and Prioritization
 *
 * @module types/opportunity-scoring
 * @version 1.0.0
 */

/**
 * Opportunity scoring dimension
 */
export type ScoringDimension =
  | 'search_volume'
  | 'traffic_potential'
  | 'difficulty'
  | 'relevance'
  | 'implementation_effort'
  | 'competitive_advantage'
  | 'time_to_impact'
  | 'freshness'
  | 'authority_gain';

/**
 * Opportunity score component
 */
export interface ScoreComponent {
  dimension: ScoringDimension;
  weight: number;
  rawScore: number;
  normalizedScore: number;
  reasoning: string;
}

/**
 * Opportunity score result
 */
export interface OpportunityScore {
  opportunityId: string;
  overallScore: number;
  components: ScoreComponent[];
  percentileRank: number;
  recommendation: 'immediate' | 'high_priority' | 'medium_priority' | 'defer' | 'skip';
  nextReviewDate: Date;
}

/**
 * Keyword opportunity analysis
 */
export interface KeywordOpportunityAnalysis {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc?: number;
  searchIntent: 'informational' | 'navigational' | 'commercial' | 'transactional';
  currentRanking?: {
    position: number;
    url: string;
    ctr?: number;
  };
  gapOpportunities: string[]; // Gap opportunity IDs
  competitorCount: number;
  estimatedTrafficPotential: number;
  score: OpportunityScore;
}

/**
 * Ranked opportunity set
 */
export interface OpportunityRankingSet {
  clusterid?: string;
  keyword: string;
  opportunities: Array<{
    id: string;
    type: string;
    score: number;
    rank: number;
    recommendation: string;
  }>;
  generatedAt: Date;
  validUntil: Date;
}

/**
 * Opportunity portfolio
 */
export interface OpportunityPortfolio {
  immediate: KeywordOpportunityAnalysis[];
  highPriority: KeywordOpportunityAnalysis[];
  mediumPriority: KeywordOpportunityAnalysis[];
  deferred: KeywordOpportunityAnalysis[];
  totalScore: number;
  estimatedMonthlyTraffic: number;
  implementationCapacity: 'constrained' | 'balanced' | 'abundant';
  generatedAt: Date;
}

/**
 * Opportunity confidence metrics
 */
export interface OpportunityConfidenceMetrics {
  opportunityId: string;
  scoreConfidence: number;
  recommendationConfidence: number;
  dataRecency: number;
  historicalAccuracy?: number;
  lastValidatedAt?: Date;
}
