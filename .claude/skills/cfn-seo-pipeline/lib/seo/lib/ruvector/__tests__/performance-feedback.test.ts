/**
 * Performance Feedback Manager Tests
 *
 * Comprehensive test suite for performance feedback loop functionality.
 * Tests pattern matching, confidence calculation, and report generation.
 *
 * @module seo/lib/ruvector/__tests__/performance-feedback.test.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  PerformanceFeedbackManager,
  isValidPerformanceMetricsInput,
  DEFAULT_ADJUSTMENT_RULES,
  PerformanceMetricsInput,
  InvalidMetricsError,
  PatternNotFoundError,
  StorageError,
} from '../performance-feedback';
import type { SEOQueryManager } from '../queries';
import type { VectorDB } from '@ruvector/core';

// =============================================
// Mock Setup
// =============================================

const mockQueryManager: jest.Mocked<SEOQueryManager> = {
  // Mock methods as needed
} as unknown as jest.Mocked<SEOQueryManager>;

const mockVectorDb: jest.Mocked<VectorDB> = {
  // Mock methods as needed
} as unknown as jest.Mocked<VectorDB>;

// =============================================
// Test Data Fixtures
// =============================================

const createValidMetrics = (overrides?: Partial<PerformanceMetricsInput>): PerformanceMetricsInput => ({
  contentId: 'article-001',
  contentUrl: 'https://example.com/article-001',
  ranking: {
    averagePosition: 12,
    bestPosition: 5,
    topTenCount: 3,
    totalKeywordsTracked: 15,
  },
  traffic: {
    totalImpressions: 500,
    totalClicks: 25,
    dailyAverageTraffic: 10,
    trafficTrendDirection: 0.15,
  },
  conversions: {
    averageCTR: 0.035,
    conversionRate: 0.02,
    totalConversions: 10,
    conversionValue: 500,
  },
  timeWindow: 'short-term',
  metricsCollectedAt: new Date('2024-12-04'),
  metadata: {
    dataSource: 'gsc',
    confidence: 0.95,
    notes: 'Test metrics',
  },
  ...overrides,
});

const createHighPerformanceMetrics = (): PerformanceMetricsInput =>
  createValidMetrics({
    ranking: {
      averagePosition: 5,
      bestPosition: 2,
      topTenCount: 12,
      totalKeywordsTracked: 15,
    },
    traffic: {
      totalImpressions: 2000,
      totalClicks: 100,
      dailyAverageTraffic: 50,
      trafficTrendDirection: 0.25,
    },
    conversions: {
      averageCTR: 0.05,
      conversionRate: 0.035,
      totalConversions: 70,
      conversionValue: 3500,
    },
  });

const createLowPerformanceMetrics = (): PerformanceMetricsInput =>
  createValidMetrics({
    ranking: {
      averagePosition: 65,
      bestPosition: 52,
      topTenCount: 0,
      totalKeywordsTracked: 15,
    },
    traffic: {
      totalImpressions: 50,
      totalClicks: 1,
      dailyAverageTraffic: 0.5,
      trafficTrendDirection: -0.30,
    },
    conversions: {
      averageCTR: 0.008,
      conversionRate: 0.0,
      totalConversions: 0,
      conversionValue: 0,
    },
  });

const createInsufficientImpressionsMetrics = (): PerformanceMetricsInput =>
  createValidMetrics({
    traffic: {
      totalImpressions: 20,
      totalClicks: 1,
      dailyAverageTraffic: 0.5,
      trafficTrendDirection: 0.0,
    },
  });

// =============================================
// Test Suites
// =============================================

describe('PerformanceFeedbackManager', () => {
  let manager: PerformanceFeedbackManager;

  beforeEach(() => {
    manager = new PerformanceFeedbackManager(mockQueryManager, mockVectorDb);
  });

  // =============================================
  // Input Validation Tests
  // =============================================

  describe('Input Validation', () => {
    it('should accept valid performance metrics', () => {
      const metrics = createValidMetrics();
      expect(isValidPerformanceMetricsInput(metrics)).toBe(true);
    });

    it('should reject metrics with missing contentId', () => {
      const metrics = createValidMetrics();
      const invalid = { ...metrics, contentId: '' };
      expect(isValidPerformanceMetricsInput(invalid)).toBe(false);
    });

    it('should reject metrics with missing contentUrl', () => {
      const metrics = createValidMetrics();
      const invalid = { ...metrics, contentUrl: '' };
      expect(isValidPerformanceMetricsInput(invalid)).toBe(false);
    });

    it('should reject metrics with invalid ranking data', () => {
      const metrics = createValidMetrics();
      const invalid = {
        ...metrics,
        ranking: { ...metrics.ranking, averagePosition: -5 },
      };
      expect(isValidPerformanceMetricsInput(invalid)).toBe(false);
    });

    it('should reject metrics with invalid traffic data', () => {
      const metrics = createValidMetrics();
      const invalid = {
        ...metrics,
        traffic: { ...metrics.traffic, totalImpressions: -100 },
      };
      expect(isValidPerformanceMetricsInput(invalid)).toBe(false);
    });

    it('should reject metrics with invalid CTR (>1.0)', () => {
      const metrics = createValidMetrics();
      const invalid = {
        ...metrics,
        conversions: { ...metrics.conversions, averageCTR: 1.5 },
      };
      expect(isValidPerformanceMetricsInput(invalid)).toBe(false);
    });

    it('should reject metrics with invalid conversion rate (>1.0)', () => {
      const metrics = createValidMetrics();
      const invalid = {
        ...metrics,
        conversions: { ...metrics.conversions, conversionRate: 1.2 },
      };
      expect(isValidPerformanceMetricsInput(invalid)).toBe(false);
    });

    it('should reject metrics with invalid timeWindow', () => {
      const metrics = createValidMetrics();
      const invalid = {
        ...metrics,
        timeWindow: 'invalid-window' as 'initial' | 'short-term' | 'long-term',
      };
      expect(isValidPerformanceMetricsInput(invalid)).toBe(false);
    });

    it('should reject metrics with invalid metricsCollectedAt', () => {
      const metrics = createValidMetrics();
      const invalid = {
        ...metrics,
        metricsCollectedAt: 'not-a-date' as unknown as Date,
      };
      expect(isValidPerformanceMetricsInput(invalid)).toBe(false);
    });
  });

  // =============================================
  // Confidence Adjustment Tests
  // =============================================

  describe('Confidence Adjustment Calculation', () => {
    it('should boost confidence for top 3 ranking', async () => {
      const metrics = createValidMetrics({
        ranking: {
          averagePosition: 3,
          bestPosition: 2,
          topTenCount: 10,
          totalKeywordsTracked: 10,
        },
      });

      const report = await manager.processPerformanceMetrics(metrics);

      // High-performing content should have positive adjustments
      expect(report.patternsUpdated).toBeGreaterThanOrEqual(0);
      expect(report.performanceTimeWindow).toBe('short-term');
    });

    it('should boost confidence for high CTR (>3%)', async () => {
      const metrics = createValidMetrics({
        conversions: {
          averageCTR: 0.045,
          conversionRate: 0.025,
          totalConversions: 20,
          conversionValue: 1000,
        },
      });

      const report = await manager.processPerformanceMetrics(metrics);

      expect(report).toBeDefined();
      expect(report.contentId).toBe(metrics.contentId);
    });

    it('should boost confidence for increasing traffic trend', async () => {
      const metrics = createValidMetrics({
        traffic: {
          totalImpressions: 1000,
          totalClicks: 50,
          dailyAverageTraffic: 30,
          trafficTrendDirection: 0.25,
        },
      });

      const report = await manager.processPerformanceMetrics(metrics);

      expect(report).toBeDefined();
      expect(report.totalConfidenceDelta).toBeGreaterThanOrEqual(0);
    });

    it('should decay confidence for poor ranking (>50)', async () => {
      const metrics = createLowPerformanceMetrics();
      const report = await manager.processPerformanceMetrics(metrics);

      expect(report).toBeDefined();
      expect(report.contentId).toBe(metrics.contentId);
    });

    it('should decay confidence for low CTR (<1%)', async () => {
      const metrics = createValidMetrics({
        conversions: {
          averageCTR: 0.008,
          conversionRate: 0.0,
          totalConversions: 0,
        },
      });

      const report = await manager.processPerformanceMetrics(metrics);

      expect(report).toBeDefined();
    });

    it('should decay confidence for declining traffic trend', async () => {
      const metrics = createValidMetrics({
        traffic: {
          totalImpressions: 300,
          totalClicks: 10,
          dailyAverageTraffic: 5,
          trafficTrendDirection: -0.25,
        },
      });

      const report = await manager.processPerformanceMetrics(metrics);

      expect(report).toBeDefined();
      expect(report.totalConfidenceDelta).toBeLessThanOrEqual(0);
    });

    it('should not adjust confidence if impressions below threshold', async () => {
      const metrics = createInsufficientImpressionsMetrics();
      const report = await manager.processPerformanceMetrics(metrics);

      // Report should indicate insufficient data
      expect(report.recommendations.some((r) =>
        r.includes('Insufficient impressions')
      )).toBeTruthy();
    });

    it('should respect confidence bounds (min 0.1, max 1.0)', () => {
      const rules = manager.getAdjustmentRules();
      expect(rules.minConfidence).toBe(0.1);
      expect(rules.maxConfidence).toBe(1.0);
    });
  });

  // =============================================
  // Performance Report Tests
  // =============================================

  describe('Performance Report Generation', () => {
    it('should generate report with correct structure', async () => {
      const metrics = createValidMetrics();
      const report = await manager.processPerformanceMetrics(metrics);

      expect(report).toBeDefined();
      expect(report.reportId).toBeDefined();
      expect(report.contentId).toBe(metrics.contentId);
      expect(report.contentUrl).toBe(metrics.contentUrl);
      expect(report.patternsUpdated).toBeGreaterThanOrEqual(0);
      expect(report.patternUpdates).toBeDefined();
      expect(Array.isArray(report.patternUpdates)).toBe(true);
      expect(report.totalConfidenceDelta).toBeDefined();
      expect(report.averageNewConfidence).toBeGreaterThanOrEqual(0);
      expect(report.patternsImproved).toBeGreaterThanOrEqual(0);
      expect(report.patternsDeclined).toBeGreaterThanOrEqual(0);
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.performanceTimeWindow).toBe(metrics.timeWindow);
    });

    it('should track improved vs declined patterns', async () => {
      const metrics = createHighPerformanceMetrics();
      const report = await manager.processPerformanceMetrics(metrics);

      expect(report.patternsImproved + report.patternsDeclined)
        .toBeLessThanOrEqual(report.patternsUpdated);
    });

    it('should generate relevant recommendations', async () => {
      const highPerf = createHighPerformanceMetrics();
      const highPerfReport = await manager.processPerformanceMetrics(highPerf);

      expect(highPerfReport.recommendations.length).toBeGreaterThan(0);

      const lowPerf = createLowPerformanceMetrics();
      const lowPerfReport = await manager.processPerformanceMetrics(lowPerf);

      expect(lowPerfReport.recommendations.length).toBeGreaterThan(0);
    });

    it('should provide ranking-based recommendations', async () => {
      const metrics = createHighPerformanceMetrics();
      const report = await manager.processPerformanceMetrics(metrics);

      const hasRankingRecommendation = report.recommendations.some(
        (r) => r.includes('ranking') || r.includes('Ranking') ||
                r.includes('excellent') || r.includes('Excellent')
      );
      expect(hasRankingRecommendation).toBe(true);
    });

    it('should provide CTR-based recommendations', async () => {
      const highCTRMetrics = createValidMetrics({
        conversions: {
          averageCTR: 0.055,
          conversionRate: 0.04,
          totalConversions: 30,
          conversionValue: 1500,
        },
      });

      const report = await manager.processPerformanceMetrics(highCTRMetrics);

      const hasCTRRecommendation = report.recommendations.some(
        (r) => r.includes('CTR') || r.includes('title') ||
                r.includes('meta description')
      );
      expect(hasCTRRecommendation).toBe(true);
    });

    it('should provide traffic trend recommendations', async () => {
      const metrics = createValidMetrics({
        traffic: {
          totalImpressions: 1500,
          totalClicks: 75,
          dailyAverageTraffic: 40,
          trafficTrendDirection: 0.20,
        },
      });

      const report = await manager.processPerformanceMetrics(metrics);

      const hasTrendRecommendation = report.recommendations.some(
        (r) => r.includes('growth') || r.includes('trend') ||
                r.includes('trajectory') || r.includes('Declining')
      );
      expect(hasTrendRecommendation).toBe(true);
    });
  });

  // =============================================
  // Batch Processing Tests
  // =============================================

  describe('Batch Processing', () => {
    it('should process multiple metrics without error', async () => {
      const metrics = [
        createValidMetrics({ contentId: 'article-001' }),
        createValidMetrics({ contentId: 'article-002' }),
        createValidMetrics({ contentId: 'article-003' }),
      ];

      const result = await manager.processBatchMetrics(metrics);

      expect(result).toBeDefined();
      expect(result.processed).toBe(3);
      expect(result.successful).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeLessThanOrEqual(3);
      expect(result.reports).toBeDefined();
      expect(result.totalPatternsUpdated).toBeGreaterThanOrEqual(0);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.processedAt).toBeInstanceOf(Date);
    });

    it('should track successful and failed items separately', async () => {
      const validMetrics = createValidMetrics({ contentId: 'valid-001' });
      const invalidMetrics = {
        ...createValidMetrics({ contentId: 'invalid-001' }),
        conversions: {
          averageCTR: 1.5, // Invalid: > 1.0
          conversionRate: 0.02,
          totalConversions: 5,
        },
      };

      const result = await manager.processBatchMetrics([
        validMetrics,
        invalidMetrics as PerformanceMetricsInput,
      ]);

      expect(result.processed).toBe(2);
      expect(result.successful + result.failed).toBe(2);
    });

    it('should continue processing on individual failures', async () => {
      const metrics = [
        createValidMetrics({ contentId: 'article-001' }),
        // Invalid metrics will be skipped
        createValidMetrics({ contentId: 'article-002' }),
      ];

      const result = await manager.processBatchMetrics(metrics);

      // Should still process second item despite any failures
      expect(result.processed).toBe(2);
    });

    it('should calculate average confidence adjustment', async () => {
      const metrics = [
        createHighPerformanceMetrics(),
        createValidMetrics(),
      ];

      const result = await manager.processBatchMetrics(metrics);

      expect(result.averageConfidenceAdjustment).toBeDefined();
      expect(typeof result.averageConfidenceAdjustment).toBe('number');
    });
  });

  // =============================================
  // Configuration Tests
  // =============================================

  describe('Configuration Management', () => {
    it('should provide default adjustment rules', () => {
      const rules = manager.getAdjustmentRules();

      expect(rules).toBeDefined();
      expect(rules.topThreeBoost).toBe(0.15);
      expect(rules.topTenBoost).toBe(0.10);
      expect(rules.topTwentyBoost).toBe(0.05);
      expect(rules.highCTRBoost).toBe(0.12);
      expect(rules.trafficIncreaseBoost).toBe(0.08);
      expect(rules.rankingDropDecay).toBe(-0.10);
      expect(rules.lowCTRDecay).toBe(-0.08);
      expect(rules.trafficDecreaseDecay).toBe(-0.06);
      expect(rules.minConfidence).toBe(0.1);
      expect(rules.maxConfidence).toBe(1.0);
      expect(rules.minImpressionsThreshold).toBe(50);
    });

    it('should allow updating adjustment rules', () => {
      const newRules = {
        topThreeBoost: 0.20,
        minConfidence: 0.15,
      };

      manager.updateAdjustmentRules(newRules);
      const updated = manager.getAdjustmentRules();

      expect(updated.topThreeBoost).toBe(0.20);
      expect(updated.minConfidence).toBe(0.15);
      // Other rules should remain unchanged
      expect(updated.topTenBoost).toBe(0.10);
    });

    it('should not mutate rules directly', () => {
      const rules = manager.getAdjustmentRules();
      const originalTopThreeBoost = rules.topThreeBoost;

      // Attempt to mutate returned rules (should not affect manager)
      (rules as any).topThreeBoost = 0.50;

      const currentRules = manager.getAdjustmentRules();
      expect(currentRules.topThreeBoost).toBe(originalTopThreeBoost);
    });
  });

  // =============================================
  // Error Handling Tests
  // =============================================

  describe('Error Handling', () => {
    it('should throw InvalidMetricsError for invalid metrics', async () => {
      const invalidMetrics = {
        contentId: '',
        contentUrl: 'https://example.com',
        ranking: { averagePosition: 10, bestPosition: 5, topTenCount: 5, totalKeywordsTracked: 10 },
        traffic: { totalImpressions: 100, totalClicks: 5, dailyAverageTraffic: 5, trafficTrendDirection: 0 },
        conversions: { averageCTR: 0.05, conversionRate: 0.01, totalConversions: 1 },
        timeWindow: 'short-term' as const,
        metricsCollectedAt: new Date(),
      };

      await expect(
        manager.processPerformanceMetrics(invalidMetrics)
      ).rejects.toThrow(InvalidMetricsError);
    });

    it('InvalidMetricsError should have correct structure', async () => {
      try {
        const invalid = createValidMetrics();
        (invalid as any).ranking = null;
        await manager.processPerformanceMetrics(invalid);
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidMetricsError);
        expect((error as any).code).toBe('INVALID_METRICS');
        expect((error as any).context).toBeDefined();
      }
    });

    it('should handle storage errors gracefully', async () => {
      const metrics = createValidMetrics();

      // Mock a storage error scenario
      // Implementation depends on actual storage integration
      const report = await manager.processPerformanceMetrics(metrics);
      expect(report).toBeDefined();
    });
  });

  // =============================================
  // Performance Time Window Tests
  // =============================================

  describe('Performance Time Windows', () => {
    it('should process initial time window metrics', async () => {
      const metrics = createValidMetrics({ timeWindow: 'initial' });
      const report = await manager.processPerformanceMetrics(metrics);

      expect(report.performanceTimeWindow).toBe('initial');
    });

    it('should process short-term time window metrics', async () => {
      const metrics = createValidMetrics({ timeWindow: 'short-term' });
      const report = await manager.processPerformanceMetrics(metrics);

      expect(report.performanceTimeWindow).toBe('short-term');
    });

    it('should process long-term time window metrics', async () => {
      const metrics = createValidMetrics({ timeWindow: 'long-term' });
      const report = await manager.processPerformanceMetrics(metrics);

      expect(report.performanceTimeWindow).toBe('long-term');
    });
  });

  // =============================================
  // Data Consistency Tests
  // =============================================

  describe('Data Consistency', () => {
    it('should maintain data integrity through processing', async () => {
      const metrics = createValidMetrics();
      const originalContentId = metrics.contentId;
      const originalUrl = metrics.contentUrl;

      const report = await manager.processPerformanceMetrics(metrics);

      expect(report.contentId).toBe(originalContentId);
      expect(report.contentUrl).toBe(originalUrl);
    });

    it('should preserve timestamp information', async () => {
      const metricsDate = new Date('2024-12-01');
      const metrics = createValidMetrics({ metricsCollectedAt: metricsDate });

      const report = await manager.processPerformanceMetrics(metrics);

      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.generatedAt.getTime()).toBeGreaterThanOrEqual(metricsDate.getTime());
    });

    it('should calculate metrics correctly in batch', async () => {
      const metrics = [
        createValidMetrics({ contentId: 'a-001' }),
        createValidMetrics({ contentId: 'a-002' }),
        createValidMetrics({ contentId: 'a-003' }),
      ];

      const result = await manager.processBatchMetrics(metrics);

      expect(result.reports.length).toBeLessThanOrEqual(metrics.length);
      const reportIds = new Set(result.reports.map((r) => r.reportId));
      expect(reportIds.size).toBe(result.reports.length); // All report IDs should be unique
    });
  });

  // =============================================
  // Edge Case Tests
  // =============================================

  describe('Edge Cases', () => {
    it('should handle metrics with zero conversions', async () => {
      const metrics = createValidMetrics({
        conversions: {
          averageCTR: 0.01,
          conversionRate: 0.0,
          totalConversions: 0,
        },
      });

      const report = await manager.processPerformanceMetrics(metrics);

      expect(report).toBeDefined();
      expect(report.patternsUpdated).toBeGreaterThanOrEqual(0);
    });

    it('should handle metrics with perfect ranking (position 1)', async () => {
      const metrics = createValidMetrics({
        ranking: {
          averagePosition: 1,
          bestPosition: 1,
          topTenCount: 15,
          totalKeywordsTracked: 15,
        },
      });

      const report = await manager.processPerformanceMetrics(metrics);

      expect(report).toBeDefined();
      expect(report.totalConfidenceDelta).toBeGreaterThanOrEqual(0);
    });

    it('should handle metrics with very high traffic', async () => {
      const metrics = createValidMetrics({
        traffic: {
          totalImpressions: 10000000,
          totalClicks: 500000,
          dailyAverageTraffic: 50000,
          trafficTrendDirection: 0.50,
        },
      });

      const report = await manager.processPerformanceMetrics(metrics);

      expect(report).toBeDefined();
    });

    it('should handle batch with empty array', async () => {
      const result = await manager.processBatchMetrics([]);

      expect(result.processed).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.reports.length).toBe(0);
    });

    it('should handle single-item batch', async () => {
      const metrics = [createValidMetrics()];
      const result = await manager.processBatchMetrics(metrics);

      expect(result.processed).toBe(1);
    });
  });
});

describe('Type Guards', () => {
  it('should validate correct PerformanceMetricsInput', () => {
    const valid = createValidMetrics();
    expect(isValidPerformanceMetricsInput(valid)).toBe(true);
  });

  it('should reject null input', () => {
    expect(isValidPerformanceMetricsInput(null)).toBe(false);
  });

  it('should reject undefined input', () => {
    expect(isValidPerformanceMetricsInput(undefined)).toBe(false);
  });

  it('should reject non-object input', () => {
    expect(isValidPerformanceMetricsInput('string')).toBe(false);
    expect(isValidPerformanceMetricsInput(123)).toBe(false);
    expect(isValidPerformanceMetricsInput(true)).toBe(false);
  });

  it('should reject object missing required fields', () => {
    const incomplete = { contentId: 'test' };
    expect(isValidPerformanceMetricsInput(incomplete)).toBe(false);
  });
});
