/**
 * SEO APIs Module
 *
 * Exports DataForSEO wrapper, cost tracking utilities, and related types.
 *
 * @module seo/apis
 */

export {
  DataForSEOCached,
  createDataForSEOCached,
  type DataForSEOKeywordMetrics,
  type SERPResult,
  type PeopleAlsoAskResult,
  type CostTrackingResult,
  type KeywordCacheResult,
  type SERPCacheResult,
  type MockKeywordResponse,
} from './dataforseo-cached';

export {
  calculateCacheEfficiency,
  calculateTimeSavings,
  calculateCachingROI,
  formatCost,
  formatTime,
  formatPercentage,
  generateEfficiencyReport,
  generateTimeSavingsReport,
  compareStrategies,
  CostTracker,
  API_COSTS,
  type CacheEfficiencyMetrics,
  type TimeSavingMetrics,
} from './cost-tracking';
