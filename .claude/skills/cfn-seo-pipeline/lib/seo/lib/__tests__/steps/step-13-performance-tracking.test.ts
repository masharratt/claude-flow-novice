/**
 * Step 13: Performance Tracking & Feedback Loop - Test Suite
 *
 * @module planning/seo/tests/step-13-performance-tracking.test
 * @description Comprehensive test suite for performance tracking and feedback system
 * @version 1.0.0
 */

import Redis from 'ioredis';
import {
  ContentPerformance,
  ContentPerformanceMetrics,
  AppliedPatternReference,
  calculateTimeWindow,
  calculateRankingTrend,
  determineContentStage,
  calculateCTR,
  calculateConversionRate,
  sanitizeContentId,
  isValidContentPerformance,
  isValidContentPerformanceMetrics,
} from '../lib/performance-tracker';
import {
  processPerformanceFeedback,
  detectAlgorithmUpdateCorrelation,
  DEFAULT_ADJUSTMENT_RULES,
} from '../lib/performance-feedback';
import {
  executeStep13,
  getContentPerformance,
  getAlgorithmCorrelations,
} from '../lib/steps/step-13-performance-tracking';

/**
 * Test Redis connection
 */
let redis: Redis;

beforeAll(() => {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  });
});

afterAll(async () => {
  await redis.quit();
});

// ============================================================================
// PERFORMANCE TRACKER TESTS
// ============================================================================

describe('Performance Tracker', () => {
  describe('calculateTimeWindow', () => {
    it('should return "initial" for 0-14 days', () => {
      expect(calculateTimeWindow(0)).toBe('initial');
      expect(calculateTimeWindow(7)).toBe('initial');
      expect(calculateTimeWindow(14)).toBe('initial');
    });

    it('should return "short-term" for 15-60 days', () => {
      expect(calculateTimeWindow(15)).toBe('short-term');
      expect(calculateTimeWindow(30)).toBe('short-term');
      expect(calculateTimeWindow(60)).toBe('short-term');
    });

    it('should return "long-term" for 60+ days', () => {
      expect(calculateTimeWindow(61)).toBe('long-term');
      expect(calculateTimeWindow(90)).toBe('long-term');
      expect(calculateTimeWindow(365)).toBe('long-term');
    });
  });

  describe('calculateRankingTrend', () => {
    it('should detect new ranking', () => {
      expect(calculateRankingTrend(10, null)).toBe('new');
    });

    it('should detect lost ranking', () => {
      expect(calculateRankingTrend(null, 10)).toBe('lost');
    });

    it('should detect upward trend (improved position)', () => {
      expect(calculateRankingTrend(5, 10)).toBe('up'); // Moved from 10 to 5
    });

    it('should detect downward trend (worse position)', () => {
      expect(calculateRankingTrend(15, 10)).toBe('down'); // Moved from 10 to 15
    });

    it('should detect stable ranking', () => {
      expect(calculateRankingTrend(10, 10)).toBe('stable');
      expect(calculateRankingTrend(10, 11)).toBe('stable'); // Delta <= 2
    });
  });

  describe('determineContentStage', () => {
    it('should identify new content (0-7 days, minimal data)', () => {
      const metrics: ContentPerformanceMetrics = {
        averageRanking: 50,
        peakRanking: 45,
        rankingDelta: 0,
        rankingTrend: 'new',
        impressions: 50,
        clicks: 2,
        ctr: 0.04,
        periodStart: '2024-01-01',
        periodEnd: '2024-01-07',
        timeWindow: 'initial',
        source: 'gsc',
      };

      expect(determineContentStage(metrics, 5)).toBe('new');
    });

    it('should identify indexed content (8-14 days)', () => {
      const metrics: ContentPerformanceMetrics = {
        averageRanking: 45,
        peakRanking: 40,
        rankingDelta: 0,
        rankingTrend: 'stable',
        impressions: 150,
        clicks: 5,
        ctr: 0.033,
        periodStart: '2024-01-01',
        periodEnd: '2024-01-14',
        timeWindow: 'initial',
        source: 'gsc',
      };

      expect(determineContentStage(metrics, 10)).toBe('indexed');
    });

    it('should identify ranking content (15-60 days, gaining traction)', () => {
      const metrics: ContentPerformanceMetrics = {
        averageRanking: 25,
        peakRanking: 20,
        rankingDelta: 5,
        rankingTrend: 'up',
        impressions: 500,
        clicks: 40,
        ctr: 0.08,
        periodStart: '2024-01-01',
        periodEnd: '2024-01-30',
        timeWindow: 'short-term',
        source: 'gsc',
      };

      expect(determineContentStage(metrics, 30)).toBe('ranking');
    });

    it('should identify established content (60+ days, stable top rankings)', () => {
      const metrics: ContentPerformanceMetrics = {
        averageRanking: 8,
        peakRanking: 5,
        rankingDelta: 0,
        rankingTrend: 'stable',
        impressions: 2000,
        clicks: 200,
        ctr: 0.10,
        periodStart: '2024-01-01',
        periodEnd: '2024-03-01',
        timeWindow: 'long-term',
        source: 'gsc',
      };

      expect(determineContentStage(metrics, 90)).toBe('established');
    });

    it('should identify declining content (negative trend)', () => {
      const metrics: ContentPerformanceMetrics = {
        averageRanking: 55,
        peakRanking: 50,
        rankingDelta: -15,
        rankingTrend: 'down',
        impressions: 300,
        clicks: 10,
        ctr: 0.033,
        periodStart: '2024-01-01',
        periodEnd: '2024-02-01',
        timeWindow: 'short-term',
        source: 'gsc',
      };

      expect(determineContentStage(metrics, 45)).toBe('declining');
    });
  });

  describe('calculateCTR', () => {
    it('should calculate CTR correctly', () => {
      expect(calculateCTR(100, 1000)).toBe(0.1);
      expect(calculateCTR(50, 500)).toBe(0.1);
    });

    it('should return 0 for zero impressions', () => {
      expect(calculateCTR(10, 0)).toBe(0);
    });

    it('should clamp to [0, 1]', () => {
      expect(calculateCTR(100, 50)).toBe(1); // Clamped to 1.0
      expect(calculateCTR(-10, 100)).toBe(0); // Clamped to 0
    });
  });

  describe('sanitizeContentId', () => {
    it('should allow valid characters', () => {
      expect(sanitizeContentId('content-123')).toBe('content-123');
      expect(sanitizeContentId('content_abc')).toBe('content_abc');
    });

    it('should strip invalid characters', () => {
      expect(sanitizeContentId('content@#$123')).toBe('content123');
      expect(sanitizeContentId('content/../../../etc')).toBe('contentetc');
    });
  });

  describe('Type Guards', () => {
    it('should validate ContentPerformanceMetrics', () => {
      const validMetrics: ContentPerformanceMetrics = {
        averageRanking: 10,
        peakRanking: 8,
        rankingDelta: 2,
        rankingTrend: 'up',
        impressions: 1000,
        clicks: 100,
        ctr: 0.1,
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        timeWindow: 'short-term',
        source: 'gsc',
      };

      expect(isValidContentPerformanceMetrics(validMetrics)).toBe(true);
    });

    it('should reject invalid metrics', () => {
      const invalidMetrics = {
        averageRanking: -5, // Invalid: negative
        impressions: 1000,
      };

      expect(isValidContentPerformanceMetrics(invalidMetrics)).toBe(false);
    });
  });
});

// ============================================================================
// PERFORMANCE FEEDBACK TESTS
// ============================================================================

describe('Performance Feedback', () => {
  beforeEach(async () => {
    // Clear test data
    await redis.flushdb();
  });

  describe('processPerformanceFeedback', () => {
    it('should boost confidence for top 10 ranking', async () => {
      // Setup: Create pattern with base confidence
      const patternId = 'test-pattern-1';
      await redis.hset(`pattern:local:${patternId}`, {
        confidence: '0.60',
        name: 'Test Pattern',
        pattern_type: 'content',
      });

      // Create content performance with top 10 ranking
      const appliedPattern: AppliedPatternReference = {
        patternId,
        patternName: 'Test Pattern',
        patternType: 'content',
        appliedAt: '2024-01-01T00:00:00Z',
        confidenceAtApplication: 0.60,
        changesDescription: 'Applied test pattern',
      };

      const contentPerformance: ContentPerformance = {
        contentId: 'test-content-1',
        url: 'https://example.com/test',
        targetKeyword: 'test keyword',
        title: 'Test Content',
        publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        initialMetrics: {
          averageRanking: 8,
          peakRanking: 5,
          rankingDelta: 5,
          rankingTrend: 'up',
          impressions: 1000,
          clicks: 100,
          ctr: 0.1,
          periodStart: '2024-01-01',
          periodEnd: '2024-01-14',
          timeWindow: 'initial',
          source: 'gsc',
        },
        shortTermMetrics: {
          averageRanking: 8,
          peakRanking: 5,
          rankingDelta: 5,
          rankingTrend: 'up',
          impressions: 2000,
          clicks: 200,
          ctr: 0.1,
          periodStart: '2024-01-15',
          periodEnd: '2024-01-30',
          timeWindow: 'short-term',
          source: 'gsc',
        },
        appliedPatterns: [appliedPattern],
        lastUpdated: new Date().toISOString(),
        contentStage: 'ranking',
      };

      const result = await processPerformanceFeedback(
        contentPerformance,
        redis,
        'pattern:local',
        DEFAULT_ADJUSTMENT_RULES
      );

      expect(result.success).toBe(true);
      expect(result.patternsUpdated).toBe(1);
      expect(result.totalConfidenceDelta).toBeGreaterThan(0);

      // Verify pattern confidence increased
      const newConfidence = parseFloat(
        (await redis.hget(`pattern:local:${patternId}`, 'confidence')) || '0'
      );
      expect(newConfidence).toBeGreaterThan(0.60);
    });

    it('should penalize confidence for ranking drop', async () => {
      // Setup: Create pattern with good confidence
      const patternId = 'test-pattern-2';
      await redis.hset(`pattern:local:${patternId}`, {
        confidence: '0.80',
        name: 'Test Pattern 2',
        pattern_type: 'content',
      });

      const appliedPattern: AppliedPatternReference = {
        patternId,
        patternName: 'Test Pattern 2',
        patternType: 'content',
        appliedAt: '2024-01-01T00:00:00Z',
        confidenceAtApplication: 0.80,
        changesDescription: 'Applied test pattern',
      };

      const contentPerformance: ContentPerformance = {
        contentId: 'test-content-2',
        url: 'https://example.com/test2',
        targetKeyword: 'test keyword',
        title: 'Test Content 2',
        publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        initialMetrics: {
          averageRanking: 50,
          peakRanking: 45,
          rankingDelta: -15, // Dropped 15 positions
          rankingTrend: 'down',
          impressions: 500,
          clicks: 20,
          ctr: 0.04,
          periodStart: '2024-01-01',
          periodEnd: '2024-01-14',
          timeWindow: 'initial',
          source: 'gsc',
        },
        shortTermMetrics: {
          averageRanking: 50,
          peakRanking: 45,
          rankingDelta: -15,
          rankingTrend: 'down',
          impressions: 800,
          clicks: 30,
          ctr: 0.0375,
          periodStart: '2024-01-15',
          periodEnd: '2024-01-30',
          timeWindow: 'short-term',
          source: 'gsc',
        },
        appliedPatterns: [appliedPattern],
        lastUpdated: new Date().toISOString(),
        contentStage: 'declining',
      };

      const result = await processPerformanceFeedback(
        contentPerformance,
        redis,
        'pattern:local',
        DEFAULT_ADJUSTMENT_RULES
      );

      expect(result.success).toBe(true);
      expect(result.patternsUpdated).toBe(1);
      expect(result.totalConfidenceDelta).toBeLessThan(0);

      // Verify pattern confidence decreased
      const newConfidence = parseFloat(
        (await redis.hget(`pattern:local:${patternId}`, 'confidence')) || '0'
      );
      expect(newConfidence).toBeLessThan(0.80);
    });

    it('should skip feedback for insufficient impressions', async () => {
      const patternId = 'test-pattern-3';
      await redis.hset(`pattern:local:${patternId}`, {
        confidence: '0.70',
        name: 'Test Pattern 3',
        pattern_type: 'content',
      });

      const appliedPattern: AppliedPatternReference = {
        patternId,
        patternName: 'Test Pattern 3',
        patternType: 'content',
        appliedAt: '2024-01-01T00:00:00Z',
        confidenceAtApplication: 0.70,
        changesDescription: 'Applied test pattern',
      };

      const contentPerformance: ContentPerformance = {
        contentId: 'test-content-3',
        url: 'https://example.com/test3',
        targetKeyword: 'test keyword',
        title: 'Test Content 3',
        publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        initialMetrics: {
          averageRanking: 10,
          peakRanking: 8,
          rankingDelta: 0,
          rankingTrend: 'stable',
          impressions: 50, // Below threshold (100)
          clicks: 5,
          ctr: 0.1,
          periodStart: '2024-01-01',
          periodEnd: '2024-01-14',
          timeWindow: 'initial',
          source: 'gsc',
        },
        shortTermMetrics: {
          averageRanking: 10,
          peakRanking: 8,
          rankingDelta: 0,
          rankingTrend: 'stable',
          impressions: 50,
          clicks: 5,
          ctr: 0.1,
          periodStart: '2024-01-15',
          periodEnd: '2024-01-30',
          timeWindow: 'short-term',
          source: 'gsc',
        },
        appliedPatterns: [appliedPattern],
        lastUpdated: new Date().toISOString(),
        contentStage: 'ranking',
      };

      const result = await processPerformanceFeedback(
        contentPerformance,
        redis,
        'pattern:local',
        DEFAULT_ADJUSTMENT_RULES
      );

      expect(result.success).toBe(true);
      expect(result.patternsUpdated).toBe(0);
      expect(result.error).toContain('threshold');
    });
  });
});

// ============================================================================
// STEP 13 INTEGRATION TESTS
// ============================================================================

describe('Step 13 Integration', () => {
  beforeEach(async () => {
    await redis.flushdb();
  });

  describe('executeStep13', () => {
    it('should execute full step with mock data', async () => {
      // Setup: Create patterns and applied pattern references
      const patternId1 = 'test-pattern-mock-1';
      const patternId2 = 'test-pattern-mock-2';

      await redis.hset(`pattern:local:${patternId1}`, {
        confidence: '0.65',
        name: 'Mock Pattern 1',
        pattern_type: 'content',
      });

      await redis.hset(`pattern:local:${patternId2}`, {
        confidence: '0.70',
        name: 'Mock Pattern 2',
        pattern_type: 'content',
      });

      // Create applied patterns for content
      const contentId = 'mock-content-1';
      const appliedKey = `content:performance:${contentId}:applied_patterns`;

      await redis.rpush(
        appliedKey,
        JSON.stringify({
          patternId: patternId1,
          patternName: 'Mock Pattern 1',
          patternType: 'content',
          appliedAt: '2024-01-01T00:00:00Z',
          confidenceAtApplication: 0.65,
          changesDescription: 'Applied mock pattern 1',
        })
      );

      await redis.rpush(
        appliedKey,
        JSON.stringify({
          patternId: patternId2,
          patternName: 'Mock Pattern 2',
          patternType: 'content',
          appliedAt: '2024-01-01T00:00:00Z',
          confidenceAtApplication: 0.70,
          changesDescription: 'Applied mock pattern 2',
        })
      );

      // Execute Step 13
      const result = await executeStep13([contentId], redis, {
        useMockData: true,
        detectAlgorithmCorrelation: false, // Disable for simpler test
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.contentProcessed).toBe(1);
      expect(result.patternsUpdated).toBeGreaterThanOrEqual(0);

      // Verify content performance was stored
      const storedPerformance = await getContentPerformance(contentId, redis);
      expect(storedPerformance).not.toBeNull();
      expect(storedPerformance?.contentId).toBe(contentId);
    });

    it('should detect algorithm correlations when enabled', async () => {
      // Setup: Create pattern with failure history
      const patternId = 'test-pattern-correlation';
      await redis.hset(`pattern:local:${patternId}`, {
        confidence: '0.60',
        name: 'Test Pattern Correlation',
        pattern_type: 'content',
      });

      // Add fake feedback history with failures
      const feedbackKey = `pattern:local:${patternId}:feedback_history`;
      await redis.lpush(
        feedbackKey,
        JSON.stringify({
          patternId,
          delta: -0.15,
          feedbackAt: new Date().toISOString(),
          contentId: 'test-content-correlation',
          metrics: { rankingDelta: -15 },
        })
      );

      // Execute Step 13 with correlation detection (provide at least one content ID)
      const result = await executeStep13(['test-content-correlation'], redis, {
        useMockData: true,
        detectAlgorithmCorrelation: true,
        correlationLookbackDays: 30,
        verbose: false,
      });

      expect(result.success).toBe(true);
      expect(result.algorithmCorrelations).toBeDefined();
      // Note: Actual correlations depend on algorithm update database
    });
  });
});
