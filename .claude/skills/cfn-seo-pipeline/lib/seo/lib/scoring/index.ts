/**
 * SEO Scoring Module
 *
 * Exports opportunity scoring with pattern boost integration.
 *
 * @module seo/lib/scoring
 */

export {
  OpportunityScorer,
  scoreKeywordOpportunity,
  scoreAndRankOpportunities,
  type KeywordOpportunity,
  type ScoringFactors,
  type PatternMatchResult,
  type OpportunityScorerConfig,
} from './opportunity-scorer';
