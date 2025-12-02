/**
 * Content Refresh Trigger System - Test Suite
 *
 * @module planning/seo/tests/content-refresh-trigger.test.ts
 * @description Comprehensive tests for decay detection and refresh scheduling
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { ContentRefreshTrigger } from '../lib/content-refresh-trigger';
import {
  RefreshPriority,
  DecayPattern,
  DecayMetrics,
  REFRESH_PRIORITY_THRESHOLDS,
  DECAY_DETECTION_THRESHOLDS,
} from '../types/content-refresh';
import { ContentPerformance, PerformanceMetrics } from '../types/performance';

// ============================================================================
// TEST SETUP
// ============================================================================

let redis: Redis;
let trigger: ContentRefreshTrigger;

beforeEach(() => {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    db: 15, // Use separate DB for tests
  });
  trigger = new ContentRefreshTrigger(redis);
});

afterEach(async () => {
  await redis.flushdb();
  await redis.quit();
});

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create mock ContentPerformance data
 */
function createMockPerformance(overrides: Partial<ContentPerformance> = {}): ContentPerformance {
  const basePerformance: ContentPerformance = {
    contentId: 'test-content-123',
    contentUrl: 'https://example.com/test-content',
    targetKeyword: 'test keyword',
    topic: 'Test Topic',
    contentType: 'article',
    publishedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months ago
    timeWindow: 'long-term',
    daysSincePublication: 180,
    metrics: {
      ranking: {
        averagePosition: 15,
        bestPosition: 3,
        worstPosition: 20,
        topThreeCount: 0,
        topTenCount: 2,
        topFiftyCount: 8,
        topHundredCount: 10,
        totalKeywordsTracked: 10,
        trendDirection: -2,
        volatilityScore: 0.3,
      },
      traffic: {
        totalImpressions: 50000,
        totalClicks: 2000,
        changePercentage: -40,
        dailyAverageTraffic: 67,
        peakDailyTraffic: 150,
        trendDirection: -1,
        consistencyScore: 0.6,
      },
      ctr: {
        averageCTR: 0.04,
        bestDayCTR: 0.06,
        worstDayCTR: 0.02,
        ctrChange: -0.01,
        trendDirection: -0.5,
        benchmarkCTR: 0.05,
        benchmarkDeviation: -0.01,
      },
      overallScore: 0.65,
      calculatedAt: new Date().toISOString(),
    },
    keywordPerformance: [],
    appliedPatterns: [],
    affectedByUpdates: [],
    metricsUpdatedAt: new Date().toISOString(),
    dataSource: 'mock',
    domain: 'example.com',
  };

  return { ...basePerformance, ...overrides } as ContentPerformance;
}

/**
 * Create mock historical performance data showing decay
 */
function createDecayHistory(weeks: number = 8): ContentPerformance[] {
  const history: ContentPerformance[] = [];
  const now = new Date();

  for (let i = weeks; i >= 0; i--) {
    const weekOffset = i * 7 * 24 * 60 * 60 * 1000;
    const position = 3 + (weeks - i) * 1.5; // Gradual decline from position 3
    const traffic = 5000 - (weeks - i) * 400; // Traffic declining

    history.push(
      createMockPerformance({
        metrics: {
          ranking: {
            averagePosition: position,
            bestPosition: 3,
            worstPosition: position + 2,
            topThreeCount: position <= 3 ? 1 : 0,
            topTenCount: position <= 10 ? 1 : 0,
            topFiftyCount: 1,
            topHundredCount: 1,
            totalKeywordsTracked: 1,
            trendDirection: -1.5,
            volatilityScore: 0.2,
          },
          traffic: {
            totalImpressions: traffic * 10,
            totalClicks: traffic,
            changePercentage: i === 0 ? -40 : -10,
            dailyAverageTraffic: traffic / 7,
            peakDailyTraffic: (traffic / 7) * 1.5,
            trendDirection: -1,
            consistencyScore: 0.7,
          },
          ctr: {
            averageCTR: 0.04,
            bestDayCTR: 0.06,
            worstDayCTR: 0.02,
            ctrChange: -0.005,
            trendDirection: -0.3,
            benchmarkCTR: 0.05,
            benchmarkDeviation: -0.01,
          },
          overallScore: 0.7 - (weeks - i) * 0.05,
          calculatedAt: new Date(now.getTime() - weekOffset).toISOString(),
        },
        metricsUpdatedAt: new Date(now.getTime() - weekOffset).toISOString(),
      })
    );
  }

  return history;
}

/**
 * Create mock DecayMetrics
 */
function createMockDecayMetrics(overrides: Partial<DecayMetrics> = {}): DecayMetrics {
  const base: DecayMetrics = {
    currentPosition: 15,
    peakPosition: 3,
    rankingDropPercent: 400, // (15-3)/3 * 100
    rankingDropVelocity: 1.5,
    currentTraffic: 2000,
    peakTraffic: 5000,
    trafficDropPercent: 60,
    competitorGains: 2,
    timeInDecay: 8,
    daysSinceLastUpdate: 180,
    measuredAt: new Date().toISOString(),
  };

  return { ...base, ...overrides };
}

// ============================================================================
// DECAY DETECTION TESTS
// ============================================================================

describe('ContentRefreshTrigger - Decay Detection', () => {
  it('should detect gradual decay pattern', async () => {
    const history = createDecayHistory(8); // 8 weeks of gradual decline
    const analysis = await trigger.analyzeDecayPattern('test-content-123', history);

    expect(analysis.pattern).toBe('gradual');
    expect(analysis.severity).toBeGreaterThan(0);
    expect(analysis.positionsLost).toBeGreaterThan(0);
    expect(analysis.weeksInDecay).toBeGreaterThanOrEqual(4);
    expect(analysis.confidence).toBeGreaterThan(0.7);
  });

  it('should detect sudden decay pattern', async () => {
    const history = [
      createMockPerformance({
        metrics: {
          ...createMockPerformance().metrics,
          ranking: {
            ...createMockPerformance().metrics.ranking,
            averagePosition: 3,
            bestPosition: 3,
          },
        },
        metricsUpdatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      createMockPerformance({
        metrics: {
          ...createMockPerformance().metrics,
          ranking: {
            ...createMockPerformance().metrics.ranking,
            averagePosition: 3,
            bestPosition: 3,
          },
        },
        metricsUpdatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      createMockPerformance({
        metrics: {
          ...createMockPerformance().metrics,
          ranking: {
            ...createMockPerformance().metrics.ranking,
            averagePosition: 15, // Sudden 12-position drop
            bestPosition: 3,
          },
        },
        metricsUpdatedAt: new Date().toISOString(),
      }),
    ];

    const analysis = await trigger.analyzeDecayPattern('test-content-123', history);

    expect(analysis.pattern).toBe('sudden');
    expect(analysis.severity).toBeGreaterThan(0.5);
    expect(analysis.positionsLost).toBeGreaterThanOrEqual(10);
  });

  it('should calculate decay severity correctly', async () => {
    const severeDecay = createDecayHistory(4);
    const mildDecay = createDecayHistory(2);

    const severeAnalysis = await trigger.analyzeDecayPattern('test-severe', severeDecay);
    const mildAnalysis = await trigger.analyzeDecayPattern('test-mild', mildDecay);

    expect(severeAnalysis.severity).toBeGreaterThan(mildAnalysis.severity);
    expect(severeAnalysis.severity).toBeGreaterThan(0.3);
    expect(severeAnalysis.severity).toBeLessThanOrEqual(1.0);
  });

  it('should throw error with insufficient history', async () => {
    const singlePoint = [createMockPerformance()];

    await expect(
      trigger.analyzeDecayPattern('test-content-123', singlePoint)
    ).rejects.toThrow('Insufficient history');
  });
});

// ============================================================================
// PRIORITY CALCULATION TESTS
// ============================================================================

describe('ContentRefreshTrigger - Priority Calculation', () => {
  it('should assign URGENT priority for critical decay', () => {
    const metrics = createMockDecayMetrics({
      currentPosition: 15,
      peakPosition: 3,
      trafficDropPercent: 60,
      timeInDecay: 2,
    });

    const priority = trigger.calculateRefreshPriority(metrics);
    expect(priority).toBe(RefreshPriority.URGENT);
  });

  it('should assign HIGH priority for significant decay', () => {
    const metrics = createMockDecayMetrics({
      currentPosition: 10,
      peakPosition: 3,
      trafficDropPercent: 35,
      timeInDecay: 3,
    });

    const priority = trigger.calculateRefreshPriority(metrics);
    expect(priority).toBe(RefreshPriority.HIGH);
  });

  it('should assign MEDIUM priority for moderate decay', () => {
    const metrics = createMockDecayMetrics({
      currentPosition: 8,
      peakPosition: 3,
      trafficDropPercent: 25,
      timeInDecay: 6,
    });

    const priority = trigger.calculateRefreshPriority(metrics);
    expect(priority).toBe(RefreshPriority.MEDIUM);
  });

  it('should assign MEDIUM priority for aging content', () => {
    const metrics = createMockDecayMetrics({
      currentPosition: 5,
      peakPosition: 3,
      trafficDropPercent: 10,
      daysSinceLastUpdate: 365, // 1 year old
    });

    const priority = trigger.calculateRefreshPriority(metrics);
    expect(priority).toBe(RefreshPriority.MEDIUM);
  });

  it('should assign LOW priority for stable content', () => {
    const metrics = createMockDecayMetrics({
      currentPosition: 4,
      peakPosition: 3,
      trafficDropPercent: 5,
      timeInDecay: 1,
      daysSinceLastUpdate: 90, // 3 months
    });

    const priority = trigger.calculateRefreshPriority(metrics);
    expect(priority).toBe(RefreshPriority.LOW);
  });
});

// ============================================================================
// REFRESH RECOMMENDATION TESTS
// ============================================================================

describe('ContentRefreshTrigger - Refresh Recommendations', () => {
  it('should recommend no action for stable content', async () => {
    const performance = createMockPerformance({
      metrics: {
        ...createMockPerformance().metrics,
        ranking: {
          ...createMockPerformance().metrics.ranking,
          averagePosition: 3,
          bestPosition: 3,
          trendDirection: 0,
        },
        traffic: {
          ...createMockPerformance().metrics.traffic,
          changePercentage: 5,
          trendDirection: 0.5,
        },
      },
      publishedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 3 months
    });

    const recommendation = await trigger.detectRefreshNeed(performance);

    expect(recommendation.action).toBe('no_action');
    expect(recommendation.priority).toBe(RefreshPriority.LOW);
  });

  it('should recommend full rewrite for severe decay', async () => {
    const performance = createMockPerformance({
      metrics: {
        ...createMockPerformance().metrics,
        ranking: {
          ...createMockPerformance().metrics.ranking,
          averagePosition: 25,
          bestPosition: 3,
        },
        traffic: {
          ...createMockPerformance().metrics.traffic,
          changePercentage: -70,
        },
      },
    });

    const recommendation = await trigger.detectRefreshNeed(performance);

    expect(recommendation.action).toBe('full_rewrite');
    expect(recommendation.priority).toBe(RefreshPriority.URGENT);
    expect(recommendation.tasks.length).toBeGreaterThan(0);
  });

  it('should recommend statistics refresh for aging content', async () => {
    const performance = createMockPerformance({
      publishedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(), // 13+ months
      metrics: {
        ...createMockPerformance().metrics,
        ranking: {
          ...createMockPerformance().metrics.ranking,
          averagePosition: 8,
          bestPosition: 5,
        },
        traffic: {
          ...createMockPerformance().metrics.traffic,
          changePercentage: -15,
        },
      },
    });

    const recommendation = await trigger.detectRefreshNeed(performance);

    expect(recommendation.action).toBe('statistics_refresh');
    expect(recommendation.tasks).toContain('Update all numerical data to latest available');
  });

  it('should include estimated impact metrics', async () => {
    const performance = createMockPerformance({
      metrics: {
        ...createMockPerformance().metrics,
        ranking: {
          ...createMockPerformance().metrics.ranking,
          averagePosition: 12,
          bestPosition: 3,
        },
        traffic: {
          ...createMockPerformance().metrics.traffic,
          changePercentage: -40,
        },
      },
    });

    const recommendation = await trigger.detectRefreshNeed(performance);

    expect(recommendation.estimatedRankingRecovery).toBeGreaterThan(0);
    expect(recommendation.estimatedTrafficRecovery).toBeGreaterThan(0);
    expect(recommendation.confidence).toBeGreaterThan(0);
  });
});

// ============================================================================
// SCHEDULING TESTS
// ============================================================================

describe('ContentRefreshTrigger - Scheduling', () => {
  it('should create refresh schedule with correct priority', async () => {
    const history = createDecayHistory(8);
    const analysis = await trigger.analyzeDecayPattern('test-content-123', history);
    const recommendation = await trigger.detectRefreshNeed(history[history.length - 1]);

    const schedule = await trigger.scheduleRefresh(
      'test-content-123',
      RefreshPriority.HIGH,
      recommendation,
      analysis
    );

    expect(schedule.contentId).toBe('test-content-123');
    expect(schedule.priority).toBe(RefreshPriority.HIGH);
    expect(schedule.status).toBe('pending');
    expect(schedule.estimatedEffortHours).toBeGreaterThan(0);
    expect(schedule.triggers.length).toBeGreaterThan(0);
  });

  it('should set appropriate deadline based on priority', async () => {
    const history = createDecayHistory(4);
    const analysis = await trigger.analyzeDecayPattern('test-urgent', history);
    const recommendation = await trigger.detectRefreshNeed(history[history.length - 1]);

    const urgentSchedule = await trigger.scheduleRefresh(
      'test-urgent',
      RefreshPriority.URGENT,
      recommendation,
      analysis
    );

    const urgentDeadline = new Date(urgentSchedule.scheduledDate);
    const now = new Date();
    const daysUntilDeadline = Math.floor(
      (urgentDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(daysUntilDeadline).toBeLessThanOrEqual(14); // URGENT should be within 2 weeks
  });

  it('should store schedule in Redis', async () => {
    const history = createDecayHistory(6);
    const analysis = await trigger.analyzeDecayPattern('test-redis', history);
    const recommendation = await trigger.detectRefreshNeed(history[history.length - 1]);

    const schedule = await trigger.scheduleRefresh(
      'test-redis',
      RefreshPriority.MEDIUM,
      recommendation,
      analysis
    );

    // Verify stored in Redis
    const stored = await redis.get('seo:content:refresh:schedule:test-redis');
    expect(stored).not.toBeNull();

    const parsedSchedule = JSON.parse(stored!);
    expect(parsedSchedule.contentId).toBe('test-redis');
  });
});

// ============================================================================
// FRESHNESS OPPORTUNITY TESTS
// ============================================================================

describe('ContentRefreshTrigger - Freshness Opportunities', () => {
  it('should identify outdated year references', async () => {
    const oldContent = createMockPerformance({
      publishedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(), // 13+ months
    });

    const opportunities = await trigger.identifyFreshnessOpportunities(oldContent);

    const yearOpportunity = opportunities.find(o => o.type === 'outdated_year_reference');
    expect(yearOpportunity).toBeDefined();
    expect(yearOpportunity!.impact).toBeGreaterThan(0);
  });

  it('should identify outdated statistics', async () => {
    const oldContent = createMockPerformance({
      publishedAt: new Date(Date.now() - 500 * 24 * 60 * 60 * 1000).toISOString(), // 16+ months
    });

    const opportunities = await trigger.identifyFreshnessOpportunities(oldContent);

    const statsOpportunity = opportunities.find(o => o.type === 'outdated_statistics');
    expect(statsOpportunity).toBeDefined();
    expect(statsOpportunity!.confidence).toBeGreaterThan(0.5);
  });

  it('should identify algorithm update impacts', async () => {
    const affectedContent = createMockPerformance({
      affectedByUpdates: [
        {
          updateId: 'core-2024-09',
          updateName: 'Core Update September 2024',
          updateDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          estimatedImpact: -0.4,
        },
      ],
    });

    const opportunities = await trigger.identifyFreshnessOpportunities(affectedContent);

    const algorithmOpportunity = opportunities.find(o => o.type === 'algorithm_update');
    expect(algorithmOpportunity).toBeDefined();
    expect(algorithmOpportunity!.impact).toBeGreaterThan(0);
  });

  it('should store opportunities in Redis', async () => {
    const performance = createMockPerformance();
    await trigger.identifyFreshnessOpportunities(performance);

    const stored = await redis.get(
      `seo:content:freshness:opportunities:${performance.contentId}`
    );
    expect(stored).not.toBeNull();
  });
});

// ============================================================================
// WORKFLOW TRIGGER TESTS
// ============================================================================

describe('ContentRefreshTrigger - Workflow Triggering', () => {
  it('should trigger full refresh workflow', async () => {
    const history = createDecayHistory(6);
    const latest = history[history.length - 1];

    const result = await trigger.triggerRefreshWorkflow(
      'test-workflow',
      latest,
      history.slice(0, -1)
    );

    expect(result.success).toBe(true);
    expect(result.workflowId).toBeTruthy();
    expect(result.schedule).toBeDefined();
    expect(result.decayAnalysis).toBeDefined();
    expect(result.recommendation).toBeDefined();
  });

  it('should enqueue workflow in Redis', async () => {
    const history = createDecayHistory(4);
    const latest = history[history.length - 1];

    await trigger.triggerRefreshWorkflow('test-queue', latest, history.slice(0, -1));

    const queueLength = await redis.llen('seo:content:refresh:workflow:queue');
    expect(queueLength).toBeGreaterThan(0);
  });

  it('should handle workflow errors gracefully', async () => {
    const invalidHistory = [createMockPerformance()]; // Only 1 point (insufficient)

    const result = await trigger.triggerRefreshWorkflow(
      'test-error',
      invalidHistory[0],
      []
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('ContentRefreshTrigger - Integration', () => {
  it('should complete full decay-to-schedule workflow', async () => {
    // 1. Create decay history
    const history = createDecayHistory(10);

    // 2. Analyze decay
    const analysis = await trigger.analyzeDecayPattern('integration-test', history);
    expect(analysis.pattern).toBeTruthy();

    // 3. Detect refresh need
    const recommendation = await trigger.detectRefreshNeed(history[history.length - 1]);
    expect(recommendation.action).not.toBe('no_action');

    // 4. Schedule refresh
    const schedule = await trigger.scheduleRefresh(
      'integration-test',
      recommendation.priority,
      recommendation,
      analysis
    );
    expect(schedule.status).toBe('pending');

    // 5. Verify stored in Redis
    const storedSchedule = await redis.get('seo:content:refresh:schedule:integration-test');
    expect(storedSchedule).not.toBeNull();
  });

  it('should maintain decay history in Redis', async () => {
    const history = createDecayHistory(5);

    // Analyze multiple times
    await trigger.analyzeDecayPattern('history-test', history);
    await trigger.analyzeDecayPattern('history-test', history);
    await trigger.analyzeDecayPattern('history-test', history);

    const historyLength = await redis.llen('seo:content:decay:history:history-test');
    expect(historyLength).toBe(3);
  });
});
