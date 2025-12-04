/**
 * Pattern Extractor Tests - Sprint 1.4 Implementation
 *
 * Tests for pattern extraction from completed SEO onboarding pipelines.
 * Validates:
 * - Site profile pattern extraction
 * - Content strategy pattern extraction
 * - Competitor positioning pattern extraction
 * - Keyword cluster pattern extraction
 * - Pattern storage in RuVector
 * - Confidence scoring
 * - Type safety and validation
 *
 * @module seo/lib/ruvector/__tests__/pattern-extractor.test
 */

import {
  PatternExtractor,
  type SiteProfilePattern,
  type ContentStrategyPattern,
  type CompetitorPattern,
  type KeywordClusterPattern,
  type ExtractedPatterns,
  type PatternMetadata,
  type PatternExtractionResult,
} from '../pattern-extractor';
import { ContentPatternsCollection } from '../collections/content-patterns';
import type { ContentPatternEntry } from '../schemas';

// ============================================================================
// Mock Setup
// ============================================================================

class MockContentPatternsCollection implements Partial<ContentPatternsCollection> {
  private storedPatterns: Map<string, any> = new Map();

  async add(input: any): Promise<ContentPatternEntry> {
    const id = `pattern-${this.storedPatterns.size}`;

    const entry: ContentPatternEntry = {
      id,
      text: `${input.type}: ${input.description}`,
      metadata: {
        type: input.type,
        description: input.description,
        example: input.example,
        niche: input.niche,
        format: input.format,
        performanceMetrics: input.performanceMetrics,
        confidenceScore: input.confidenceScore ?? 0.5,
        articleIds: [],
        createdAt: new Date(),
        lastUsed: new Date(),
        useCount: 0,
        successCount: 0,
      },
    };

    this.storedPatterns.set(id, entry);
    return entry;
  }

  async update(id: string, updates: any): Promise<ContentPatternEntry | null> {
    const existing = this.storedPatterns.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      metadata: { ...existing.metadata, ...updates },
    };

    this.storedPatterns.set(id, updated);
    return updated;
  }

  async getById(id: string): Promise<ContentPatternEntry | null> {
    return this.storedPatterns.get(id) ?? null;
  }

  async search(query: string, options: any): Promise<any[]> {
    return Array.from(this.storedPatterns.values()).slice(0, options.limit || 10);
  }

  async getByType(type: string, options: any): Promise<ContentPatternEntry[]> {
    return Array.from(this.storedPatterns.values()).filter(
      (p) => p.metadata.type === type
    );
  }

  getStoredPatternsCount(): number {
    return this.storedPatterns.size;
  }

  getStoredPatterns(): ContentPatternEntry[] {
    return Array.from(this.storedPatterns.values());
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('PatternExtractor', () => {
  let extractor: PatternExtractor;
  let mockCollection: MockContentPatternsCollection;

  beforeEach(() => {
    extractor = new PatternExtractor({ verbose: false, minConfidenceThreshold: 0.5 });
    mockCollection = new MockContentPatternsCollection();
    extractor.setContentPatternsCollection(mockCollection as any);
  });

  // ========================================================================
  // Site Profile Pattern Tests
  // ========================================================================

  describe('Site Profile Pattern Extraction', () => {
    it('should extract site profile pattern with valid phase outputs', () => {
      const phaseOutputs = {
        phase1: {
          pageCount: 250,
          averageLoadTime: 2.5,
          coreWebVitals: { pass: true },
          mobileUsable: true,
          sslCertificate: true,
          crawlability: { good: true },
          indexing: { good: true },
        },
        phase2: {
          landscape: 'Competitive B2B SaaS',
          successFactors: ['Technical depth', 'Case studies', 'ROI focus'],
          topicsCovered: 45,
          recentUpdates: { count: 12 },
        },
        domain: 'example.com',
        niche: 'SaaS Marketing',
      };

      const profile = extractor.extractSiteProfilePattern(phaseOutputs);

      expect(profile).toBeDefined();
      expect(profile.industry).toBe('SaaS Marketing');
      expect(profile.siteSize).toBe('medium');
      expect(profile.technicalHealth).toBeGreaterThan(50);
      expect(profile.contentMaturity).toBeGreaterThan(30);
      expect(profile.competitiveLandscape).toBe('Competitive B2B SaaS');
      expect(profile.successFactors).toContain('Technical depth');
      expect(profile.confidence).toBeGreaterThan(0);
      expect(profile.confidence).toBeLessThanOrEqual(1);
      expect(profile.metadata.domain).toBe('example.com');
      expect(profile.metadata.pageCount).toBe(250);
    });

    it('should handle missing phase data gracefully', () => {
      const phaseOutputs = {
        domain: 'example.com',
        niche: 'Technology',
      };

      const profile = extractor.extractSiteProfilePattern(phaseOutputs);

      expect(profile).toBeDefined();
      expect(profile.technicalHealth).toBe(0);
      expect(profile.contentMaturity).toBe(0);
      expect(profile.siteSize).toBe('small');
      expect(profile.successFactors).toEqual([]);
    });

    it('should correctly determine site size categories', () => {
      const testCases = [
        { pageCount: 25, expected: 'small' as const },
        { pageCount: 150, expected: 'medium' as const },
        { pageCount: 750, expected: 'large' as const },
        { pageCount: 1500, expected: 'enterprise' as const },
      ];

      for (const testCase of testCases) {
        const profile = extractor.extractSiteProfilePattern({
          phase1: { pageCount: testCase.pageCount },
          domain: 'test.com',
          niche: 'Test',
        });

        expect(profile.siteSize).toBe(testCase.expected);
      }
    });

    it('should calculate reasonable technical health scores', () => {
      const highHealthOutputs = {
        phase1: {
          coreWebVitals: { pass: true },
          mobileUsable: true,
          sslCertificate: true,
          crawlability: { good: true },
          indexing: { good: true },
        },
        domain: 'good.com',
        niche: 'Tech',
      };

      const lowHealthOutputs = {
        phase1: {
          coreWebVitals: { pass: false },
          mobileUsable: false,
        },
        domain: 'poor.com',
        niche: 'Tech',
      };

      const highProfile = extractor.extractSiteProfilePattern(highHealthOutputs);
      const lowProfile = extractor.extractSiteProfilePattern(lowHealthOutputs);

      expect(highProfile.technicalHealth).toBeGreaterThan(lowProfile.technicalHealth);
    });
  });

  // ========================================================================
  // Content Strategy Pattern Tests
  // ========================================================================

  describe('Content Strategy Pattern Extraction', () => {
    it('should extract content strategy pattern from phase 3 and 4', () => {
      const phaseOutputs = {
        phase3: {
          contentPillars: ['How-To Guides', 'Best Practices', 'Industry Insights'],
          contentTypes: ['Blog posts', 'Whitepapers', 'Case studies'],
          recommendedWordCount: 2500,
          recommendedHeadings: 4,
          recommendedSections: 6,
          recommendedMedia: ['Images', 'Diagrams'],
          keywordApproach: 'long-tail',
          avgSearchVolume: 500,
          longTailPercentage: 0.75,
          relatedNiches: ['Product Management', 'Agile'],
        },
        phase4: {
          trafficGrowth: 0.35,
          rankingImprovement: 0.28,
          ctrLift: 0.12,
          articlesPerMonth: 8,
          publishingFrequency: 'weekly',
        },
        niche: 'Software Development',
      };

      const strategy = extractor.extractContentStrategyPattern(phaseOutputs);

      expect(strategy).toBeDefined();
      expect(strategy.pillars).toContain('How-To Guides');
      expect(strategy.keywordApproach).toBe('long-tail');
      expect(strategy.contentTypes).toContain('Blog posts');
      expect(strategy.publishingFrequency).toBe('weekly');
      expect(strategy.successMetrics.averageTrafficGrowth).toBe(0.35);
      expect(strategy.successMetrics.averageCTRLift).toBe(0.12);
      expect(strategy.confidence).toBeGreaterThan(0);
      expect(strategy.structureGuidance.recommendedWordCount).toBe(2500);
      expect(strategy.applicableIndustries).toContain('Software Development');
      expect(strategy.applicableIndustries).toContain('Product Management');
    });

    it('should infer keyword approach from data', () => {
      const testCases = [
        { avgSearchVolume: 15000, expected: 'broad' as const },
        { longTailPercentage: 0.8, expected: 'long-tail' as const },
        { questionKeywords: { count: 40 }, keywords: { count: 50 }, expected: 'question-based' as const },
      ];

      for (const testCase of testCases) {
        const strategy = extractor.extractContentStrategyPattern({
          phase3: {
            contentPillars: [],
            contentTypes: [],
            ...testCase,
          },
          niche: 'Test',
        });

        expect(strategy.keywordApproach).toBe(testCase.expected);
      }
    });

    it('should infer publishing frequency from capacity', () => {
      const testCases = [
        { articlesPerMonth: 35, expected: 'daily' as const },
        { articlesPerMonth: 10, expected: 'weekly' as const },
        { articlesPerMonth: 3, expected: 'bi-weekly' as const },
        { articlesPerMonth: 1, expected: 'monthly' as const },
      ];

      for (const testCase of testCases) {
        const strategy = extractor.extractContentStrategyPattern({
          phase4: { articlesPerMonth: testCase.articlesPerMonth },
          niche: 'Test',
        });

        expect(strategy.publishingFrequency).toBe(testCase.expected);
      }
    });
  });

  // ========================================================================
  // Competitor Pattern Tests
  // ========================================================================

  describe('Competitor Positioning Pattern Extraction', () => {
    it('should extract competitor patterns from phase 2.5', () => {
      const phaseOutputs = {
        phase2_5: {
          strategies: [
            {
              name: 'In-depth guides',
              description: 'Comprehensive 5000+ word guides',
              effectiveness: 0.85,
              examples: ['Guide 1', 'Guide 2'],
            },
            {
              name: 'Video content',
              description: 'Educational video series',
              effectiveness: 0.72,
              examples: ['Video 1'],
            },
          ],
          differentiators: [
            {
              factor: 'Expert credentials',
              importance: 0.9,
              howCompetitorsImplement: 'Feature expert bios',
              opportunity: 'Highlight team credentials more prominently',
            },
          ],
          moats: [
            {
              type: 'content-depth',
              description: 'Deep technical content library',
              difficulty: 0.8,
            },
          ],
          averageAuthority: 68,
          gaps: [
            {
              topic: 'Advanced tutorials',
              difficulty: 0.6,
              opportunityScore: 0.8,
            },
          ],
        },
        niche: 'Technical Education',
      };

      const pattern = extractor.extractCompetitorPattern(phaseOutputs);

      expect(pattern).toBeDefined();
      expect(pattern.strategies).toHaveLength(2);
      expect(pattern.strategies[0].name).toBe('In-depth guides');
      expect(pattern.strategies[0].effectiveness).toBe(0.85);
      expect(pattern.differentiators).toHaveLength(1);
      expect(pattern.differentiators[0].factor).toBe('Expert credentials');
      expect(pattern.moats).toHaveLength(1);
      expect(pattern.moats[0].type).toBe('content-depth');
      expect(pattern.contentGaps).toHaveLength(1);
      expect(pattern.contentGaps[0].topic).toBe('Advanced tutorials');
      expect(pattern.confidence).toBeGreaterThan(0);
    });

    it('should handle missing competitor data', () => {
      const pattern = extractor.extractCompetitorPattern({
        phase2_5: {},
        niche: 'Test',
      });

      expect(pattern.strategies).toEqual([]);
      expect(pattern.differentiators).toEqual([]);
      expect(pattern.moats).toEqual([]);
      expect(pattern.contentGaps).toEqual([]);
    });
  });

  // ========================================================================
  // Keyword Cluster Tests
  // ========================================================================

  describe('Keyword Cluster Pattern Extraction', () => {
    it('should extract keyword cluster patterns', () => {
      const phaseOutputs = {
        phase1: {
          clusters: [
            {
              name: 'TypeScript Basics',
              keywords: ['typescript', 'typescript tutorial', 'learn typescript'],
              avgVolume: 4000,
              avgDifficulty: 35,
              intent: 'informational',
              relatedClusters: ['Advanced TypeScript'],
              performanceMetrics: {
                avgPosition: 12,
                avgCTR: 0.08,
                traffic: 450,
              },
            },
            {
              name: 'TypeScript Tools',
              keywords: ['tsc', 'typescript compiler', 'typescript linter'],
              avgVolume: 1200,
              avgDifficulty: 52,
              intent: 'transactional',
            },
          ],
        },
        niche: 'Programming',
      };

      const clusters = extractor.extractKeywordClusterPatterns(phaseOutputs);

      expect(clusters).toHaveLength(2);
      expect(clusters[0].cluster).toBe('TypeScript Basics');
      expect(clusters[0].keywords).toContain('typescript');
      expect(clusters[0].searchIntent).toBe('informational');
      expect(clusters[0].averageVolume).toBe(4000);
      expect(clusters[0].averageDifficulty).toBe(35);
      expect(clusters[0].relatedClusters).toContain('Advanced TypeScript');
      expect(clusters[0].contentRecommendations.length).toBeGreaterThan(0);
      expect(clusters[0].performanceMetrics?.averageRankingPosition).toBe(12);
      expect(clusters[0].confidence).toBeGreaterThan(0);

      expect(clusters[1].cluster).toBe('TypeScript Tools');
      expect(clusters[1].searchIntent).toBe('transactional');
    });

    it('should generate appropriate content recommendations by intent', () => {
      const informationalCluster = {
        name: 'Test',
        keywords: ['test'],
        intent: 'informational',
      };

      const transactionalCluster = {
        name: 'Test',
        keywords: ['test'],
        intent: 'transactional',
      };

      const phaseOutputs1 = {
        phase1: { clusters: [informationalCluster] },
        niche: 'Test',
      };

      const phaseOutputs2 = {
        phase1: { clusters: [transactionalCluster] },
        niche: 'Test',
      };

      const clusters1 = extractor.extractKeywordClusterPatterns(phaseOutputs1);
      const clusters2 = extractor.extractKeywordClusterPatterns(phaseOutputs2);

      expect(clusters1[0].contentRecommendations).toContain('Create comprehensive guide');
      expect(clusters2[0].contentRecommendations).toContain('Create clear CTAs');
    });

    it('should handle invalid cluster data gracefully', () => {
      const clusters = extractor.extractKeywordClusterPatterns({
        phase1: { clusters: null },
        niche: 'Test',
      });

      expect(clusters).toEqual([]);
    });
  });

  // ========================================================================
  // Pattern Storage Tests
  // ========================================================================

  describe('Pattern Storage in RuVector', () => {
    it('should store all pattern types successfully', async () => {
      const patterns: ExtractedPatterns = {
        siteProfile: {
          industry: 'SaaS',
          siteSize: 'medium',
          technicalHealth: 85,
          contentMaturity: 75,
          competitiveLandscape: 'Competitive',
          successFactors: ['Technical', 'Content'],
          confidence: 0.85,
          metadata: { domain: 'test.com', crawlDate: new Date(), pageCount: 250, averageLoadTime: 2.5 },
        },
        contentStrategy: {
          pillars: ['Guides', 'Tips'],
          keywordApproach: 'specific',
          contentTypes: ['Blog', 'Guide'],
          publishingFrequency: 'weekly',
          successMetrics: {
            averageTrafficGrowth: 0.25,
            averageRankingImprovement: 0.15,
            averageCTRLift: 0.08,
            targetTopicsCount: 2,
          },
          applicableIndustries: ['SaaS'],
          confidence: 0.82,
          structureGuidance: {
            recommendedWordCount: 2000,
            recommendedHeadingLevels: 3,
            recommendedSectionCount: 5,
            recommendedMediaInclusion: [],
          },
        },
        competitorPositioning: {
          strategies: [{ name: 'Deep content', description: 'Long-form', effectiveness: 0.8, examples: [] }],
          differentiators: [{ factor: 'Expert team', importance: 0.9, howCompetitorsImplement: 'Bios', opportunity: 'More' }],
          moats: [{ type: 'content-depth', description: 'Large library', difficulty: 0.7 }],
          averageCompetitorAuthority: 65,
          contentGaps: [{ topic: 'Advanced', difficulty: 0.6, opportunityScore: 0.8 }],
          confidence: 0.78,
        },
        keywordClusters: [
          {
            cluster: 'Basics',
            keywords: ['intro', 'start'],
            searchIntent: 'informational',
            averageDifficulty: 30,
            averageVolume: 1000,
            contentRecommendations: [],
            relatedClusters: [],
            confidence: 0.75,
          },
        ],
        overallConfidence: 0.8,
        extractedAt: new Date(),
        sourceTask: {
          taskId: 'task-123',
          domain: 'test.com',
          niche: 'SaaS',
        },
      };

      const metadata: PatternMetadata = {
        niche: 'SaaS',
        minConfidence: 0.5,
        tags: ['test', 'saas'],
      };

      const result = await extractor.storePatterns(patterns, metadata);

      expect(result).toBeDefined();
      expect(result.patternsExtracted).toBe(5);
      expect(result.patternsStored).toBeGreaterThan(0);
      expect(result.storedPatternIds.length).toBe(result.patternsStored);
      expect(result.confidenceScores.average).toBe(0.8);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(mockCollection.getStoredPatternsCount()).toBe(result.patternsStored);
    });

    it('should skip patterns below confidence threshold', async () => {
      const patterns: ExtractedPatterns = {
        siteProfile: { industry: 'Test', siteSize: 'small', technicalHealth: 20, contentMaturity: 15, competitiveLandscape: 'Unknown', successFactors: [], confidence: 0.3, metadata: { domain: 'test.com', crawlDate: new Date(), pageCount: 10, averageLoadTime: 5 } },
        contentStrategy: { pillars: [], keywordApproach: 'specific', contentTypes: [], publishingFrequency: 'monthly', successMetrics: { averageTrafficGrowth: 0, averageRankingImprovement: 0, averageCTRLift: 0, targetTopicsCount: 0 }, applicableIndustries: [], confidence: 0.2, structureGuidance: { recommendedWordCount: 1000, recommendedHeadingLevels: 2, recommendedSectionCount: 3, recommendedMediaInclusion: [] } },
        competitorPositioning: { strategies: [], differentiators: [], moats: [], averageCompetitorAuthority: 30, contentGaps: [], confidence: 0.25 },
        keywordClusters: [],
        overallConfidence: 0.25,
        extractedAt: new Date(),
        sourceTask: { taskId: 'task-low', domain: 'test.com', niche: 'Test' },
      };

      const metadata: PatternMetadata = { niche: 'Test', minConfidence: 0.5, tags: [] };

      const result = await extractor.storePatterns(patterns, metadata);

      expect(result.patternsSkipped).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle uninitialized collection gracefully', async () => {
      const extractorWithoutCollection = new PatternExtractor();

      const patterns: ExtractedPatterns = {
        siteProfile: { industry: 'Test', siteSize: 'small', technicalHealth: 50, contentMaturity: 50, competitiveLandscape: 'Test', successFactors: [], confidence: 0.7, metadata: { domain: 'test.com', crawlDate: new Date(), pageCount: 100, averageLoadTime: 3 } },
        contentStrategy: { pillars: [], keywordApproach: 'specific', contentTypes: [], publishingFrequency: 'monthly', successMetrics: { averageTrafficGrowth: 0, averageRankingImprovement: 0, averageCTRLift: 0, targetTopicsCount: 0 }, applicableIndustries: [], confidence: 0.7, structureGuidance: { recommendedWordCount: 1000, recommendedHeadingLevels: 2, recommendedSectionCount: 3, recommendedMediaInclusion: [] } },
        competitorPositioning: { strategies: [], differentiators: [], moats: [], averageCompetitorAuthority: 50, contentGaps: [], confidence: 0.7 },
        keywordClusters: [],
        overallConfidence: 0.7,
        extractedAt: new Date(),
        sourceTask: { taskId: 'task-123', domain: 'test.com', niche: 'Test' },
      };

      const metadata: PatternMetadata = { niche: 'Test', minConfidence: 0.5, tags: [] };

      await expect(extractorWithoutCollection.storePatterns(patterns, metadata)).rejects.toThrow();
    });
  });

  // ========================================================================
  // Confidence Scoring Tests
  // ========================================================================

  describe('Confidence Scoring', () => {
    it('should calculate site profile confidence based on data quality', () => {
      const completeOutputs = {
        phase1: {
          pageCount: 500,
          coreWebVitals: { pass: true },
          mobileUsable: true,
          sslCertificate: true,
          crawlability: { good: true },
          indexing: { good: true },
        },
        phase2: {
          landscape: 'Competitive',
          successFactors: ['Content', 'Technical'],
          topicsCovered: 50,
        },
        domain: 'test.com',
        niche: 'Tech',
      };

      const incompleteOutputs = {
        domain: 'test.com',
        niche: 'Tech',
      };

      const completeProfile = extractor.extractSiteProfilePattern(completeOutputs);
      const incompleteProfile = extractor.extractSiteProfilePattern(incompleteOutputs);

      expect(completeProfile.confidence).toBeGreaterThan(incompleteProfile.confidence);
    });

    it('should calculate strategy confidence incrementally', () => {
      const minimalOutputs = {
        phase3: {},
        niche: 'Test',
      };

      const richOutputs = {
        phase3: {
          contentPillars: ['A', 'B', 'C'],
          contentTypes: ['Blog', 'Video'],
          recommendedWordCount: 2000,
          recommendedHeadings: 4,
          recommendedSections: 5,
          recommendedMedia: ['Images'],
        },
        phase4: {
          trafficGrowth: 0.25,
          rankingImprovement: 0.15,
          ctrLift: 0.08,
        },
        niche: 'Test',
      };

      const minimalStrategy = extractor.extractContentStrategyPattern(minimalOutputs);
      const richStrategy = extractor.extractContentStrategyPattern(richOutputs);

      expect(richStrategy.confidence).toBeGreaterThan(minimalStrategy.confidence);
    });

    it('should validate all confidence scores are within valid range', () => {
      const phaseOutputs = {
        phase1: { pageCount: 150 },
        phase2: { landscape: 'Test', topicsCovered: 25 },
        domain: 'test.com',
        niche: 'Test',
      };

      const profile = extractor.extractSiteProfilePattern(phaseOutputs);

      expect(profile.confidence).toBeGreaterThanOrEqual(0);
      expect(profile.confidence).toBeLessThanOrEqual(1);
    });
  });

  // ========================================================================
  // Integration Tests
  // ========================================================================

  describe('Full Extraction and Storage Workflow', () => {
    it('should complete end-to-end extraction from phase outputs to storage', async () => {
      const phaseOutputs = {
        phase1: {
          pageCount: 250,
          coreWebVitals: { pass: true },
          mobileUsable: true,
          sslCertificate: true,
          crawlability: { good: true },
          clusters: [
            {
              name: 'Basics',
              keywords: ['intro', 'start'],
              avgVolume: 2000,
              avgDifficulty: 25,
              intent: 'informational',
            },
          ],
        },
        phase2: {
          landscape: 'Competitive',
          successFactors: ['Depth', 'Authority'],
          topicsCovered: 40,
          recentUpdates: { count: 5 },
        },
        phase2_5: {
          strategies: [
            {
              name: 'In-depth guides',
              description: 'Comprehensive content',
              effectiveness: 0.85,
              examples: [],
            },
          ],
          differentiators: [],
          moats: [],
          averageAuthority: 60,
          gaps: [],
        },
        phase3: {
          contentPillars: ['Guides', 'Tutorials'],
          contentTypes: ['Blog', 'Video'],
          recommendedWordCount: 2500,
          recommendedHeadings: 4,
          recommendedSections: 6,
          recommendedMedia: ['Images'],
          keywordApproach: 'specific',
          avgSearchVolume: 1500,
        },
        phase4: {
          trafficGrowth: 0.30,
          rankingImprovement: 0.20,
          ctrLift: 0.10,
          articlesPerMonth: 8,
          publishingFrequency: 'weekly',
        },
        domain: 'example.com',
        niche: 'Technology Education',
      };

      // Extract all patterns
      const siteProfile = extractor.extractSiteProfilePattern(phaseOutputs);
      const contentStrategy = extractor.extractContentStrategyPattern(phaseOutputs);
      const competitorPattern = extractor.extractCompetitorPattern(phaseOutputs);
      const keywordClusters = extractor.extractKeywordClusterPatterns(phaseOutputs);

      // Create extracted patterns object
      const allPatterns: ExtractedPatterns = {
        siteProfile,
        contentStrategy,
        competitorPositioning: competitorPattern,
        keywordClusters,
        overallConfidence: 0.8,
        extractedAt: new Date(),
        sourceTask: {
          taskId: 'task-e2e',
          domain: 'example.com',
          niche: 'Technology Education',
        },
      };

      // Store patterns
      const metadata: PatternMetadata = {
        niche: 'Technology Education',
        parentNiche: 'Education',
        minConfidence: 0.5,
        tags: ['tech', 'education', 'e2e-test'],
      };

      const result = await extractor.storePatterns(allPatterns, metadata);

      expect(result.patternsExtracted).toBeGreaterThan(0);
      expect(result.patternsStored).toBeGreaterThan(0);
      expect(result.breakdown.siteProfile).toBe(true);
      expect(result.breakdown.contentStrategy).toBe(true);
      expect(result.confidenceScores.average).toBeCloseTo(0.8, 0.1);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should maintain type safety throughout extraction process', () => {
      const phaseOutputs = {
        phase1: { pageCount: 100 },
        phase2: { landscape: 'Test' },
        domain: 'test.com',
        niche: 'Test',
      };

      // These should all be properly typed
      const profile: SiteProfilePattern = extractor.extractSiteProfilePattern(phaseOutputs);
      const strategy: ContentStrategyPattern = extractor.extractContentStrategyPattern(phaseOutputs);
      const competitor: CompetitorPattern = extractor.extractCompetitorPattern(phaseOutputs);
      const clusters: KeywordClusterPattern[] = extractor.extractKeywordClusterPatterns(phaseOutputs);

      expect(profile).toBeDefined();
      expect(strategy).toBeDefined();
      expect(competitor).toBeDefined();
      expect(Array.isArray(clusters)).toBe(true);
    });
  });

  // ========================================================================
  // Edge Cases and Error Handling
  // ========================================================================

  describe('Edge Cases and Error Handling', () => {
    it('should handle null and undefined values safely', () => {
      const pattern = extractor.extractSiteProfilePattern({
        phase1: null as any,
        phase2: undefined as any,
        domain: 'test.com',
        niche: 'Test',
      });

      expect(pattern).toBeDefined();
      expect(pattern.technicalHealth).toBe(0);
      expect(pattern.contentMaturity).toBe(0);
    });

    it('should handle arrays with invalid elements', () => {
      const clusters = extractor.extractKeywordClusterPatterns({
        phase1: {
          clusters: [
            { name: 'Valid', keywords: ['test'] },
            null,
            undefined,
            { name: 'AlsoValid', keywords: [] },
          ] as any[],
        },
        niche: 'Test',
      });

      expect(clusters.length).toBe(2);
      expect(clusters[0].cluster).toBe('Valid');
      expect(clusters[1].cluster).toBe('AlsoValid');
    });

    it('should clamp confidence scores to valid range', () => {
      const testExtractor = new PatternExtractor();

      // Through various extraction methods, confidence should stay in [0, 1]
      const profile = testExtractor.extractSiteProfilePattern({
        phase1: {
          pageCount: 10000000,
          coreWebVitals: { pass: true },
          mobileUsable: true,
          sslCertificate: true,
        },
        phase2: { topicsCovered: 10000000 },
        domain: 'test.com',
        niche: 'Test',
      });

      expect(profile.confidence).toBeLessThanOrEqual(1);
      expect(profile.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing pattern storage gracefully', async () => {
      const extractorWithoutInit = new PatternExtractor({ minConfidenceThreshold: 0.5 });

      const patterns: ExtractedPatterns = {
        siteProfile: { industry: 'Test', siteSize: 'small', technicalHealth: 50, contentMaturity: 50, competitiveLandscape: 'Test', successFactors: [], confidence: 0.7, metadata: { domain: 'test.com', crawlDate: new Date(), pageCount: 100, averageLoadTime: 3 } },
        contentStrategy: { pillars: [], keywordApproach: 'specific', contentTypes: [], publishingFrequency: 'monthly', successMetrics: { averageTrafficGrowth: 0, averageRankingImprovement: 0, averageCTRLift: 0, targetTopicsCount: 0 }, applicableIndustries: [], confidence: 0.7, structureGuidance: { recommendedWordCount: 1000, recommendedHeadingLevels: 2, recommendedSectionCount: 3, recommendedMediaInclusion: [] } },
        competitorPositioning: { strategies: [], differentiators: [], moats: [], averageCompetitorAuthority: 50, contentGaps: [], confidence: 0.7 },
        keywordClusters: [],
        overallConfidence: 0.7,
        extractedAt: new Date(),
        sourceTask: { taskId: 'task-123', domain: 'test.com', niche: 'Test' },
      };

      const metadata: PatternMetadata = { niche: 'Test', minConfidence: 0.5, tags: [] };

      // Should throw error when collection is not initialized
      await expect(extractorWithoutInit.storePatterns(patterns, metadata)).rejects.toThrow();
    });
  });
});
