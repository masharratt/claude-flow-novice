/**
 * Cost Tracking Utility Functions
 *
 * Tracks API costs and cache savings for DataForSEO integration.
 * Provides analytics on cost efficiency and ROI of caching strategy.
 *
 * @module seo/apis/cost-tracking
 */

/**
 * API cost estimate (2024 pricing)
 */
export const API_COSTS = {
  KEYWORD_RESEARCH: 0.02, // per call
  SERP_ANALYSIS: 0.05, // per call
  KEYWORD_DIFFICULTY: 0.015, // per call
  PEOPLE_ALSO_ASK: 0.02, // per call
} as const;

/**
 * Cache efficiency metrics
 */
export interface CacheEfficiencyMetrics {
  /** Total number of API calls made */
  totalApiCalls: number;

  /** Number of API calls that hit cache (avoided) */
  cachedApiCalls: number;

  /** Cache hit rate percentage (0-100) */
  cacheHitRate: number;

  /** Total cost without caching */
  totalCostWithoutCache: number;

  /** Total cost with caching */
  totalCostWithCache: number;

  /** Total amount saved by caching */
  totalSaved: number;

  /** Savings percentage (0-100) */
  savingsPercentage: number;

  /** Cost per keyword researched (with cache) */
  costPerKeyword: number;

  /** Average cost saved per cached call */
  avgSavedPerCachedCall: number;
}

/**
 * Time saving metrics
 */
export interface TimeSavingMetrics {
  /** Total time (minutes) without caching */
  totalTimeWithoutCache: number;

  /** Total time (minutes) with caching */
  totalTimeWithCache: number;

  /** Time saved (minutes) */
  timeSaved: number;

  /** Time savings percentage (0-100) */
  timeSavingsPercentage: number;

  /** Average time per API call (ms) */
  avgTimePerApiCall: number;

  /** Average time per cache hit (ms) */
  avgTimePerCacheHit: number;
}

/**
 * Calculate cache efficiency metrics
 *
 * @param totalCalls - Total number of data requests made
 * @param cacheHits - Number of cache hits
 * @param costPerCall - Cost per API call
 * @returns Efficiency metrics
 */
export function calculateCacheEfficiency(
  totalCalls: number,
  cacheHits: number,
  costPerCall: number = 0.03,
): CacheEfficiencyMetrics {
  const cacheMisses = totalCalls - cacheHits;
  const totalCostWithoutCache = totalCalls * costPerCall;
  const totalCostWithCache = cacheMisses * costPerCall;
  const totalSaved = totalCostWithoutCache - totalCostWithCache;
  const savingsPercentage = totalCalls > 0 ? (totalSaved / totalCostWithoutCache) * 100 : 0;
  const cacheHitRate = totalCalls > 0 ? (cacheHits / totalCalls) * 100 : 0;
  const costPerKeyword = totalCalls > 0 ? totalCostWithCache / totalCalls : 0;
  const avgSavedPerCachedCall = cacheHits > 0 ? totalSaved / cacheHits : 0;

  return {
    totalApiCalls: totalCalls,
    cachedApiCalls: cacheHits,
    cacheHitRate,
    totalCostWithoutCache,
    totalCostWithCache,
    totalSaved,
    savingsPercentage,
    costPerKeyword,
    avgSavedPerCachedCall,
  };
}

/**
 * Calculate time saving metrics
 *
 * Typical timings:
 * - API call: 500-1500ms
 * - Cache hit: 10-50ms
 *
 * @param totalCalls - Total number of requests
 * @param cacheHits - Number of cache hits
 * @param avgApiCallTimeMs - Average API call duration (default: 1000ms)
 * @param avgCacheHitTimeMs - Average cache hit duration (default: 30ms)
 * @returns Time saving metrics
 */
export function calculateTimeSavings(
  totalCalls: number,
  cacheHits: number,
  avgApiCallTimeMs: number = 1000,
  avgCacheHitTimeMs: number = 30,
): TimeSavingMetrics {
  const cacheMisses = totalCalls - cacheHits;

  // Calculate times in minutes
  const totalTimeWithoutCacheMs = totalCalls * avgApiCallTimeMs;
  const totalTimeWithCacheMs = cacheMisses * avgApiCallTimeMs + cacheHits * avgCacheHitTimeMs;
  const timeSavedMs = totalTimeWithoutCacheMs - totalTimeWithCacheMs;

  const totalTimeWithoutCache = totalTimeWithoutCacheMs / (1000 * 60);
  const totalTimeWithCache = totalTimeWithCacheMs / (1000 * 60);
  const timeSaved = timeSavedMs / (1000 * 60);
  const timeSavingsPercentage =
    totalTimeWithoutCache > 0 ? (timeSaved / totalTimeWithoutCache) * 100 : 0;

  return {
    totalTimeWithoutCache,
    totalTimeWithCache,
    timeSaved,
    timeSavingsPercentage,
    avgTimePerApiCall: avgApiCallTimeMs,
    avgTimePerCacheHit: avgCacheHitTimeMs,
  };
}

/**
 * Calculate ROI of caching implementation
 *
 * @param totalApiCallsAvoided - Number of API calls avoided through caching
 * @param cacheImplementationCost - One-time cost to implement caching (dollars)
 * @param costPerApiCall - Cost per API call (dollars)
 * @param maintenanceCostPerMonth - Monthly maintenance cost (dollars)
 * @returns ROI analysis
 */
export function calculateCachingROI(
  totalApiCallsAvoided: number,
  cacheImplementationCost: number = 5000, // Engineering time
  costPerApiCall: number = 0.03,
  maintenanceCostPerMonth: number = 500, // RuVector storage, etc.
): {
  totalSavings: number;
  totalCosts: number;
  netBenefit: number;
  roi: number;
  roiPercentage: number;
  paybackMonths: number;
} {
  const costSavings = totalApiCallsAvoided * costPerApiCall;

  // Assume 12 months of operation
  const maintenanceCostAnnual = maintenanceCostPerMonth * 12;
  const totalCosts = cacheImplementationCost + maintenanceCostAnnual;
  const totalSavings = costSavings;
  const netBenefit = totalSavings - totalCosts;
  const roi = totalCosts > 0 ? netBenefit / totalCosts : 0;
  const roiPercentage = roi * 100;

  // Payback period in months
  const monthlySavings = costSavings / 12;
  const monthlyNetCost = totalCosts / 12;
  const paybackMonths = monthlyNetCost > 0 ? Math.ceil(monthlyNetCost / (monthlySavings || 1)) : 12;

  return {
    totalSavings,
    totalCosts,
    netBenefit,
    roi,
    roiPercentage,
    paybackMonths,
  };
}

/**
 * Format cost as currency
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Format time duration
 */
export function formatTime(minutes: number): string {
  if (minutes < 1) {
    return `${Math.round(minutes * 60)}s`;
  }
  if (minutes < 60) {
    return `${minutes.toFixed(1)}m`;
  }
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Generate cost efficiency report
 */
export function generateEfficiencyReport(metrics: CacheEfficiencyMetrics): string {
  return `
Cache Efficiency Report
=======================

Total API Requests:       ${metrics.totalApiCalls}
Cached Requests:         ${metrics.cachedApiCalls}
Cache Hit Rate:          ${formatPercentage(metrics.cacheHitRate)}

Cost Analysis:
  Without Cache:         ${formatCost(metrics.totalCostWithoutCache)}
  With Cache:            ${formatCost(metrics.totalCostWithCache)}
  Total Saved:           ${formatCost(metrics.totalSaved)}
  Savings Rate:          ${formatPercentage(metrics.savingsPercentage)}

Per-Request Economics:
  Cost per Keyword:      ${formatCost(metrics.costPerKeyword)}
  Avg Saved per Hit:     ${formatCost(metrics.avgSavedPerCachedCall)}
`;
}

/**
 * Generate time savings report
 */
export function generateTimeSavingsReport(metrics: TimeSavingMetrics): string {
  return `
Time Savings Report
===================

Total Time (Without Cache):  ${formatTime(metrics.totalTimeWithoutCache)}
Total Time (With Cache):     ${formatTime(metrics.totalTimeWithCache)}
Time Saved:                  ${formatTime(metrics.timeSaved)}
Time Savings Rate:           ${formatPercentage(metrics.timeSavingsPercentage)}

Timing Details:
  API Call Latency:        ${metrics.avgTimePerApiCall}ms
  Cache Hit Latency:       ${metrics.avgTimePerCacheHit}ms
  Speedup Factor:          ${(metrics.avgTimePerApiCall / metrics.avgTimePerCacheHit).toFixed(1)}x
`;
}

/**
 * Compare caching strategy effectiveness
 */
export function compareStrategies(
  withCachingMetrics: CacheEfficiencyMetrics,
  withoutCachingMetrics: CacheEfficiencyMetrics,
): {
  costImprovement: number;
  costImprovementPercentage: number;
  efficiencyGain: number;
} {
  const costImprovement = withoutCachingMetrics.totalCostWithCache - withCachingMetrics.totalCostWithCache;
  const costImprovementPercentage =
    (costImprovement / withoutCachingMetrics.totalCostWithCache) * 100;

  const efficiencyGain = withCachingMetrics.cacheHitRate - withoutCachingMetrics.cacheHitRate;

  return {
    costImprovement,
    costImprovementPercentage,
    efficiencyGain,
  };
}

/**
 * Track cumulative cost savings over time
 */
export class CostTracker {
  private history: Array<{
    timestamp: Date;
    apiCallsAvoided: number;
    costSaved: number;
    cacheHitRate: number;
  }> = [];

  /**
   * Record a tracking event
   */
  recordEvent(apiCallsAvoided: number, costSaved: number, cacheHitRate: number): void {
    this.history.push({
      timestamp: new Date(),
      apiCallsAvoided,
      costSaved,
      cacheHitRate,
    });
  }

  /**
   * Get total savings
   */
  getTotalSavings(): number {
    return this.history.reduce((sum, event) => sum + event.costSaved, 0);
  }

  /**
   * Get total API calls avoided
   */
  getTotalApiCallsAvoided(): number {
    return this.history.reduce((sum, event) => sum + event.apiCallsAvoided, 0);
  }

  /**
   * Get average cache hit rate
   */
  getAverageCacheHitRate(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((acc, event) => acc + event.cacheHitRate, 0);
    return sum / this.history.length;
  }

  /**
   * Get history
   */
  getHistory(): typeof this.history {
    return [...this.history];
  }

  /**
   * Clear history
   */
  clear(): void {
    this.history = [];
  }
}
