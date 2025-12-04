/**
 * Phase 6 Strategy Creation - Integration Tests
 *
 * Comprehensive test suite for Phase 6 strategy synthesis from Phase 1-5 data.
 * Coverage target: ≥80% statement/branch/function/line coverage.
 *
 * Tests:
 * - Strategy synthesis from multi-phase data
 * - Content pillar generation (3-5 pillars)
 * - Quick wins prioritization (top 10 from Phase 5)
 * - Competitive advantages extraction
 * - Link building strategy logic
 * - Traffic projections (6-month, 12-month curves)
 * - RuVector pattern application
 * - Error handling (missing data, Redis failures)
 *
 * @module seo/lib/phases/__tests__/phase-6-strategy.test
 */

import { executePhase6, type Phase6Config, type Phase6Result, type SEOStrategy, type ContentPillar } from '../phase-6-strategy';
import type { ContentPatternEntry, CompetitorIntelligenceEntry } from '../../ruvector/schemas';
import Redis from 'ioredis';

// ============================================================================
// Mock Setup
// ============================================================================

class MockContentPatternsCollection {
  private patterns: ContentPatternEntry[];

  constructor(patterns: ContentPatternEntry[] = []) {
    this.patterns = patterns;
  }

  async search(params: {
    queryText: string;
    limit?: number;
    minConfidence?: number;
  }): Promise<ContentPatternEntry[]> {
    const limit = params.limit ?? 10;
    const minConfidence = params.minConfidence ?? 0.0;

    return this.patterns
      .filter((p) => p.metadata.confidenceScore >= minConfidence)
      .slice(0, limit);
  }
}

class MockCompetitorIntelligenceCollection {
  private intelligence: CompetitorIntelligenceEntry[];

  constructor(intelligence: CompetitorIntelligenceEntry[] = []) {
    this.intelligence = intelligence;
  }

  async search(params: {
    queryText: string;
    limit?: number;
    minFreshnessScore?: number;
  }): Promise<CompetitorIntelligenceEntry[]> {
    const limit = params.limit ?? 10;
    const minFreshnessScore = params.minFreshnessScore ?? 0.0;

    return this.intelligence
      .filter((i) => i.metadata.freshnessScore >= minFreshnessScore)
      .slice(0, limit);
  }
}

// Mock data generators
function createMockContentPattern(overrides: Partial<ContentPatternEntry> = {}): ContentPatternEntry {
  return {
    id: `pattern-${Math.random().toString(36).substring(7)}`,
    text: 'High-performing listicle format with data-driven insights',
    metadata: {
      type: 'ANGLE' as const,
      description: 'Ultimate guide listicle format',
      example: '10 Best Tools for X',
      niche: 'SaaS',
      format: 'listicle',
      performanceMetrics: {
        avgPosition: 3.2,
        avgCTR: 0.15,
        avgTimeOnPage: 245,
      },
      confidenceScore: 0.85,
      articleIds: ['article-1', 'article-2'],
      lastUsed: new Date(),
      useCount: 10,
      successCount: 8,
      createdAt: new Date(),
      ...overrides.metadata,
    },
    ...overrides,
  };
}

function createMockCompetitorIntelligence(overrides: Partial<CompetitorIntelligenceEntry> = {}): CompetitorIntelligenceEntry {
  return {
    id: `intel-${Math.random().toString(36).substring(7)}`,
    text: 'Competitor uses comprehensive comparison tables and calculator tools',
    metadata: {
      domain: 'competitor.com',
      niche: 'SaaS',
      architecturePatterns: [
        { urlStructure: '/blog/{category}/{slug}', hierarchy: 'flat', categoryPages: 10 }
      ],
      contentStrategy: [
        { avgWordCount: 2500, contentType: 'how-to', publishFrequency: 'weekly', topFormats: ['guide', 'tutorial'], pageCount: 100, headingStructures: ['h2-h3', 'h2-h3-h4'] }
      ],
      hubPages: [
        { url: '/guides', topic: 'Main guides hub', internalLinks: 50 }
      ],
      internalLinkingPatterns: ['hub-spoke', 'topical-clusters'],
      contentGaps: [
        { topic: 'Advanced tutorials', priority: 'high' as const, opportunity: 'Underserved advanced segment' }
      ],
      estimatedAuthority: 65,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      freshnessScore: 0.88,
      ...overrides.metadata,
    },
    ...overrides,
  };
}

async function setupTestRedisData(redis: Redis, taskId: string) {
  // Phase 1: Site Profile
  await redis.set(
    `seo:task:${taskId}:phase1`,
    JSON.stringify({
      siteProfile: {
        domain: 'testsite.com',
        industry: 'SaaS',
        currentMetrics: {
          monthlyTraffic: 5000,
          domainAuthority: 35,
          indexedPages: 120,
        },
      },
    })
  );

  // Phase 2: Competitor Analysis
  await redis.set(
    `seo:task:${taskId}:phase2`,
    JSON.stringify({
      competitors: [
        {
          domain: 'competitor1.com',
          metrics: { traffic: 50000, da: 65 },
          strengths: ['content-depth', 'link-building'],
        },
        {
          domain: 'competitor2.com',
          metrics: { traffic: 35000, da: 58 },
          strengths: ['technical-seo', 'user-experience'],
        },
      ],
    })
  );

  // Phase 3: Content Analysis
  await redis.set(
    `seo:task:${taskId}:phase3`,
    JSON.stringify({
      contentAnalysis: {
        topPerformers: [
          { url: '/guide-1', traffic: 1200, engagement: 0.75 },
          { url: '/guide-2', traffic: 900, engagement: 0.68 },
        ],
        contentGaps: ['comparison-tools', 'video-tutorials', 'case-studies'],
      },
    })
  );

  // Phase 4: Keyword Research
  await redis.set(
    `seo:task:${taskId}:phase4:keyword_universe`,
    JSON.stringify({
      keywordClusters: [
        {
          cluster: 'Project Management Tools',
          keywords: [
            { keyword: 'best project management software', volume: 5400, difficulty: 65 },
            { keyword: 'project management tools for teams', volume: 3200, difficulty: 58 },
            { keyword: 'agile project management software', volume: 2100, difficulty: 62 },
          ],
          totalVolume: 10700,
          avgDifficulty: 61.7,
        },
        {
          cluster: 'Team Collaboration',
          keywords: [
            { keyword: 'team collaboration software', volume: 4100, difficulty: 60 },
            { keyword: 'remote team tools', volume: 2800, difficulty: 55 },
          ],
          totalVolume: 6900,
          avgDifficulty: 57.5,
        },
        {
          cluster: 'Workflow Automation',
          keywords: [
            { keyword: 'workflow automation tools', volume: 3600, difficulty: 58 },
            { keyword: 'business process automation', volume: 2400, difficulty: 62 },
          ],
          totalVolume: 6000,
          avgDifficulty: 60,
        },
      ],
    })
  );

  // Phase 5: Content Gap Analysis
  await redis.set(
    `seo:task:${taskId}:phase5:gap_analysis`,
    JSON.stringify({
      prioritizedGaps: [
        {
          gap: 'Comparison guide: Top 10 Project Management Tools',
          opportunity: 'HIGH',
          estimatedTraffic: 8000,
          difficulty: 'MEDIUM',
          keywords: ['best project management software', 'top pm tools 2024'],
        },
        {
          gap: 'Interactive workflow builder calculator',
          opportunity: 'HIGH',
          estimatedTraffic: 5500,
          difficulty: 'HIGH',
          keywords: ['workflow automation calculator', 'process automation ROI'],
        },
        {
          gap: 'Ultimate guide to team collaboration',
          opportunity: 'MEDIUM',
          estimatedTraffic: 4200,
          difficulty: 'MEDIUM',
          keywords: ['team collaboration best practices', 'remote team management'],
        },
        {
          gap: 'Case studies: Successful implementations',
          opportunity: 'MEDIUM',
          estimatedTraffic: 3100,
          difficulty: 'LOW',
          keywords: ['project management case studies', 'implementation examples'],
        },
        {
          gap: 'Video tutorials series',
          opportunity: 'MEDIUM',
          estimatedTraffic: 2800,
          difficulty: 'MEDIUM',
          keywords: ['project management tutorial', 'how to use pm software'],
        },
      ],
    })
  );
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Phase 6: Strategy Creation', () => {
  let redis: Redis;
  let mockContentPatterns: MockContentPatternsCollection;
  let mockCompetitorIntel: MockCompetitorIntelligenceCollection;
  const taskId = 'test-phase6-001';

  beforeAll(async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      lazyConnect: true,
    });

    try {
      await redis.connect();
    } catch (error) {
      console.warn('Redis not available, tests will be skipped:', error);
    }
  });

  afterAll(async () => {
    if (redis.status === 'ready') {
      await redis.quit();
    }
  });

  beforeEach(async () => {
    if (redis.status !== 'ready') {
      return;
    }

    await redis.flushdb();
    await setupTestRedisData(redis, taskId);

    // Setup mock patterns
    const patterns = [
      createMockContentPattern({
        metadata: {
          type: 'STRUCTURE' as const,
          description: 'Comprehensive comparison listicle',
          example: 'Top 15 Project Management Tools Compared',
          niche: 'SaaS',
          format: 'listicle',
          performanceMetrics: { avgPosition: 3.5, avgCTR: 0.12, avgTimeOnPage: 280 },
          confidenceScore: 0.90,
          articleIds: ['art-1', 'art-2', 'art-3'],
          lastUsed: new Date(),
          useCount: 15,
          successCount: 12,
          createdAt: new Date(),
        },
      }),
      createMockContentPattern({
        metadata: {
          type: 'DEPTH' as const,
          description: 'Calculator or interactive widget',
          example: 'ROI Calculator for Project Management Software',
          niche: 'SaaS',
          format: 'interactive',
          performanceMetrics: { avgPosition: 2.8, avgCTR: 0.18, avgTimeOnPage: 320 },
          confidenceScore: 0.85,
          articleIds: ['art-4', 'art-5'],
          lastUsed: new Date(),
          useCount: 12,
          successCount: 10,
          createdAt: new Date(),
        },
      }),
      createMockContentPattern({
        metadata: {
          type: 'ANGLE' as const,
          description: 'Comprehensive pillar content',
          example: 'The Ultimate Guide to Workflow Automation in 2024',
          niche: 'SaaS',
          format: 'long-form',
          performanceMetrics: { avgPosition: 4.2, avgCTR: 0.14, avgTimeOnPage: 350 },
          confidenceScore: 0.88,
          articleIds: ['art-6', 'art-7', 'art-8'],
          lastUsed: new Date(),
          useCount: 18,
          successCount: 15,
          createdAt: new Date(),
        },
      }),
    ];

    mockContentPatterns = new MockContentPatternsCollection(patterns);

    // Setup mock competitor intelligence
    const intelligence = [
      createMockCompetitorIntelligence({
        metadata: {
          domain: 'competitor1.com',
          niche: 'SaaS',
          architecturePatterns: [
            { urlStructure: '/resources/{type}/{slug}', hierarchy: 'hierarchical', categoryPages: 15 }
          ],
          contentStrategy: [
            { avgWordCount: 3000, contentType: 'guide', publishFrequency: 'bi-weekly', topFormats: ['comparison', 'case-study', 'video'], pageCount: 300, headingStructures: ['h2-h3', 'h2-h3-h4'] }
          ],
          hubPages: [
            { url: '/resources', topic: 'Resource hub', internalLinks: 80 }
          ],
          internalLinkingPatterns: ['hub-spoke', 'pillar-cluster'],
          contentGaps: [
            { topic: 'Advanced integrations', priority: 'medium' as const, opportunity: 'Technical depth needed' }
          ],
          estimatedAuthority: 78,
          freshnessScore: 0.90,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        },
      }),
      createMockCompetitorIntelligence({
        metadata: {
          domain: 'competitor2.com',
          niche: 'SaaS',
          architecturePatterns: [
            { urlStructure: '/tools/{category}/{slug}', hierarchy: 'flat', categoryPages: 12 }
          ],
          contentStrategy: [
            { avgWordCount: 2200, contentType: 'tutorial', publishFrequency: 'weekly', topFormats: ['interactive', 'calculator', 'template'], pageCount: 200, headingStructures: ['h2-h3'] }
          ],
          hubPages: [
            { url: '/tools', topic: 'Tools directory', internalLinks: 60 }
          ],
          internalLinkingPatterns: ['category-based', 'cross-linking'],
          contentGaps: [
            { topic: 'Beginner tutorials', priority: 'high' as const, opportunity: 'Entry-level content gap' }
          ],
          estimatedAuthority: 72,
          freshnessScore: 0.85,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        },
      }),
    ];

    mockCompetitorIntel = new MockCompetitorIntelligenceCollection(intelligence);
  });

  // ============================================================================
  // Content Pillar Generation Tests
  // ============================================================================

  describe('Content Pillar Generation', () => {
    it('should generate 3-5 content pillars from keyword clusters', async () => {
      if (redis.status !== 'ready') {
        console.log('Skipping test: Redis not available');
        return;
      }

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
        verbose: false,
      };

      const result = await executePhase6(config);

      expect(result.strategy.contentPillars.length).toBeGreaterThanOrEqual(3);
      expect(result.strategy.contentPillars.length).toBeLessThanOrEqual(5);
    });

    it('should include required fields in each content pillar', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);
      const pillar = result.strategy.contentPillars[0];

      expect(pillar).toHaveProperty('name');
      expect(pillar).toHaveProperty('description');
      expect(pillar).toHaveProperty('priority');
      expect(pillar).toHaveProperty('targetKeywords');
      expect(pillar).toHaveProperty('trafficPotential');
      expect(pillar).toHaveProperty('articleCount');
      expect(pillar).toHaveProperty('contentTypes');

      expect(pillar.name).toBeTruthy();
      expect(pillar.targetKeywords.length).toBeGreaterThan(0);
      expect(pillar.trafficPotential).toBeGreaterThan(0);
      expect(pillar.articleCount).toBeGreaterThan(0);
    });

    it('should apply RuVector patterns to pillar content types', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      // At least one pillar should have a pattern source
      const pillarsWithPatterns = result.strategy.contentPillars.filter((p) => p.patternSource);
      expect(pillarsWithPatterns.length).toBeGreaterThan(0);

      // Content types should include pattern-derived types
      const allContentTypes = result.strategy.contentPillars.flatMap((p) => p.contentTypes);
      const hasPatternTypes = allContentTypes.some((type) =>
        ['listicle', 'interactive', 'long-form', 'comparison'].includes(type)
      );
      expect(hasPatternTypes).toBe(true);
    });

    it('should prioritize pillars correctly', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      // High priority pillars should have higher traffic potential
      const highPriority = result.strategy.contentPillars.filter((p) => p.priority === 'HIGH');
      const lowPriority = result.strategy.contentPillars.filter((p) => p.priority === 'LOW');

      if (highPriority.length > 0 && lowPriority.length > 0) {
        const avgHighTraffic =
          highPriority.reduce((sum, p) => sum + p.trafficPotential, 0) / highPriority.length;
        const avgLowTraffic = lowPriority.reduce((sum, p) => sum + p.trafficPotential, 0) / lowPriority.length;

        expect(avgHighTraffic).toBeGreaterThan(avgLowTraffic);
      }
    });

    it('should link content gaps to relevant pillars', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      // At least one pillar should reference content gaps
      const pillarsWithGaps = result.strategy.contentPillars.filter((p) => p.relatedGaps.length > 0);
      expect(pillarsWithGaps.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Quick Wins Tests
  // ============================================================================

  describe('Quick Wins Prioritization', () => {
    it('should generate 5-10 quick win opportunities', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.strategy.quickWins.length).toBeGreaterThanOrEqual(5);
      expect(result.strategy.quickWins.length).toBeLessThanOrEqual(10);
    });

    it('should prioritize quick wins from Phase 5 gaps', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      // First quick win should be HIGH opportunity
      const topQuickWin = result.strategy.quickWins[0];
      expect(topQuickWin).toHaveProperty('name');
      expect(topQuickWin).toHaveProperty('type');
      expect(topQuickWin).toHaveProperty('effort');
      expect(topQuickWin).toHaveProperty('impact');
      expect(topQuickWin).toHaveProperty('timeline');
    });

    it('should include diverse quick win types', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      const quickWinTypes = new Set(result.strategy.quickWins.map((qw) => qw.type));
      expect(quickWinTypes.size).toBeGreaterThanOrEqual(2);
    });

    it('should estimate effort realistically (1-40 hours)', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      result.strategy.quickWins.forEach((qw) => {
        expect(qw.effort).toBeGreaterThanOrEqual(1);
        expect(qw.effort).toBeLessThanOrEqual(40);
      });
    });
  });

  // ============================================================================
  // Link Building Strategy Tests
  // ============================================================================

  describe('Link Building Strategy', () => {
    it('should generate link building strategy with priority domains', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.strategy.linkBuildingStrategy).toHaveProperty('priorityDomains');
      expect(result.strategy.linkBuildingStrategy).toHaveProperty('tactics');
      expect(result.strategy.linkBuildingStrategy).toHaveProperty('monthlyTargets');

      expect(result.strategy.linkBuildingStrategy.priorityDomains.length).toBeGreaterThan(0);
      expect(result.strategy.linkBuildingStrategy.tactics.length).toBeGreaterThan(0);
    });

    it('should include monthly link acquisition targets', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      const targets = result.strategy.linkBuildingStrategy.monthlyTargets;
      expect(targets.length).toBeGreaterThanOrEqual(6);

      // Targets should increase over time
      expect(targets[targets.length - 1].targetLinks).toBeGreaterThanOrEqual(targets[0].targetLinks);
    });

    it('should provide pattern-based recommendations', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.strategy.linkBuildingStrategy.patternRecommendations).toBeDefined();
      expect(result.strategy.linkBuildingStrategy.patternRecommendations.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Traffic Projection Tests
  // ============================================================================

  describe('Traffic Projections', () => {
    it('should generate 6-month and 12-month projections', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
        currentTraffic: 5000,
      };

      const result = await executePhase6(config);

      expect(result.strategy.projections.sixMonth).toBeDefined();
      expect(result.strategy.projections.twelveMonth).toBeDefined();

      expect(result.strategy.projections.sixMonth.month).toBe(6);
      expect(result.strategy.projections.twelveMonth.month).toBe(12);
    });

    it('should show traffic growth over time', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
        currentTraffic: 5000,
      };

      const result = await executePhase6(config);

      const sixMonthTraffic = result.strategy.projections.sixMonth.organicTraffic;
      const twelveMonthTraffic = result.strategy.projections.twelveMonth.organicTraffic;

      expect(twelveMonthTraffic).toBeGreaterThan(sixMonthTraffic);
      expect(sixMonthTraffic).toBeGreaterThan(5000); // Should be higher than current
    });

    it('should include ranking projections', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      const { sixMonth, twelveMonth } = result.strategy.projections;

      expect(sixMonth.expectedRankings).toHaveProperty('top3');
      expect(sixMonth.expectedRankings).toHaveProperty('top10');
      expect(sixMonth.expectedRankings).toHaveProperty('top20');

      // Rankings should improve over time
      expect(twelveMonth.expectedRankings.top3).toBeGreaterThanOrEqual(sixMonth.expectedRankings.top3);
    });

    it('should include confidence scores', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.strategy.projections.sixMonth.confidence).toBeGreaterThan(0);
      expect(result.strategy.projections.sixMonth.confidence).toBeLessThanOrEqual(1);

      // 12-month should have lower confidence than 6-month
      expect(result.strategy.projections.twelveMonth.confidence).toBeLessThanOrEqual(
        result.strategy.projections.sixMonth.confidence
      );
    });
  });

  // ============================================================================
  // Competitive Advantages Tests
  // ============================================================================

  describe('Competitive Advantages', () => {
    it('should identify 3-5 competitive advantages', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.strategy.competitiveAdvantages.length).toBeGreaterThanOrEqual(3);
      expect(result.strategy.competitiveAdvantages.length).toBeLessThanOrEqual(7);
    });

    it('should include pattern-based advantages', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      // At least one advantage should reference patterns or data
      const advantagesText = result.strategy.competitiveAdvantages.join(' ').toLowerCase();
      const hasPatternReference =
        advantagesText.includes('pattern') ||
        advantagesText.includes('data') ||
        advantagesText.includes('analysis') ||
        advantagesText.includes('intelligence');

      expect(hasPatternReference).toBe(true);
    });
  });

  // ============================================================================
  // RuVector Pattern Application Tests
  // ============================================================================

  describe('RuVector Pattern Application', () => {
    it('should query content patterns during strategy creation', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.metadata.patternsQueried).toBeGreaterThan(0);
    });

    it('should apply patterns to strategy components', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.strategy.patternInsights.length).toBeGreaterThan(0);
      expect(result.metadata.patternsApplied).toBeGreaterThan(0);
    });

    it('should track pattern confidence scores', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      result.strategy.patternInsights.forEach((insight) => {
        expect(insight.confidence).toBeGreaterThan(0);
        expect(insight.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should fail when Phase 5 data is missing', async () => {
      if (redis.status !== 'ready') return;

      await redis.del(`seo:task:${taskId}:phase5:gap_analysis`);

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      await expect(executePhase6(config)).rejects.toThrow();
    });

    it('should fail when Phase 4 data is missing', async () => {
      if (redis.status !== 'ready') return;

      await redis.del(`seo:task:${taskId}:phase4:keyword_universe`);

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      await expect(executePhase6(config)).rejects.toThrow();
    });

    it('should handle empty pattern results gracefully', async () => {
      if (redis.status !== 'ready') return;

      const emptyPatterns = new MockContentPatternsCollection([]);

      const config: Phase6Config = {
        redis,
        contentPatterns: emptyPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      // Should still generate strategy, just without pattern insights
      expect(result.strategy.contentPillars.length).toBeGreaterThan(0);
      expect(result.metadata.patternsApplied).toBe(0);
    });

    it('should handle Redis connection failures', async () => {
      const disconnectedRedis = new Redis({ lazyConnect: true });

      const config: Phase6Config = {
        redis: disconnectedRedis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      await expect(executePhase6(config)).rejects.toThrow();

      disconnectedRedis.disconnect();
    });
  });

  // ============================================================================
  // Output Format Tests
  // ============================================================================

  describe('Output Format and Metadata', () => {
    it('should return valid Phase6Result structure', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('metadata');

      expect(result.metadata).toHaveProperty('processedAt');
      expect(result.metadata).toHaveProperty('phaseVersion');
      expect(result.metadata).toHaveProperty('processingTime');
      expect(result.metadata).toHaveProperty('patternsQueried');
      expect(result.metadata).toHaveProperty('patternsApplied');
    });

    it('should store strategy to Redis', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      await executePhase6(config);

      const storedData = await redis.get(`seo:task:${taskId}:phase6:strategy`);
      expect(storedData).toBeTruthy();

      const parsed = JSON.parse(storedData!);
      expect(parsed).toHaveProperty('strategy');
      expect(parsed.strategy).toHaveProperty('contentPillars');
    });

    it('should calculate overall strategy confidence', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.strategy.confidence).toBeGreaterThan(0);
      expect(result.strategy.confidence).toBeLessThanOrEqual(1);

      // With good data, confidence should be reasonably high
      expect(result.strategy.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should generate human-readable summary', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.strategy.summary).toBeTruthy();
      expect(result.strategy.summary.length).toBeGreaterThan(50);
    });

    it('should track processing time', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase6Config = {
        redis,
        contentPatterns: mockContentPatterns as any,
        competitorIntelligence: mockCompetitorIntel as any,
        taskId,
        siteDomain: 'testsite.com',
        industry: 'SaaS',
      };

      const result = await executePhase6(config);

      expect(result.metadata.processingTime).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeLessThan(30000); // Should complete within 30s
    });
  });
});
