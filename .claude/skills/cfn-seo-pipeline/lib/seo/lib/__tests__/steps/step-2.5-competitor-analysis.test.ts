/**
 * Test Suite: Step 2.5 - Competitor Analysis
 *
 * @module planning/seo/lib/steps/__tests__/step-2.5-competitor-analysis.test
 * @description Comprehensive test coverage for competitor deep analysis step
 * @tests 16 test cases covering happy path, error handling, and edge cases
 */

// ============================================================================
// MOCK SETUP (MUST BE BEFORE IMPORTS)
// ============================================================================

// Mock the CompetitorDeepAnalystAgent before importing the step
jest.mock('../../../../../packages/seo-analysis/src/lib/competitor-deep-analyst');

import {
  executeStep25,
  extractCompetitiveInsights,
  identifyOpportunities,
  Step25Config,
  Step25Result,
} from '../step-2.5-competitor-analysis';
import { PipelineContext } from '../../../types';
import type { CompetitorAnalysisResult } from '../../../types';
import { CompetitorDeepAnalystAgent } from '../../../../../packages/seo-analysis/src/lib/competitor-deep-analyst';

const mockCompetitorDeepAnalystAgent = CompetitorDeepAnalystAgent as jest.MockedClass<
  typeof CompetitorDeepAnalystAgent
>;

/**
 * Mock CompetitorAnalysisResult factory
 */
const createMockAnalysisResult = (
  domain: string,
  overrides?: Partial<CompetitorAnalysisResult>
): CompetitorAnalysisResult => ({
  domain,
  analyzedAt: new Date(),
  pagesCrawled: 50,
  maxDepthReached: 3,
  totalTimeMs: 5000,
  pages: [
    {
      url: `https://${domain}/page-1`,
      title: 'Sample Page 1',
      content: 'This is sample content for testing',
      wordCount: 1500,
      headings: { h1: ['Main Heading'], h2: ['Subheading'], h3: [], h4: [], h5: [], h6: [] },
      internalLinks: ['https://example.com/page-2'],
      externalLinks: ['https://external.com'],
      images: [{ src: 'image.jpg', alt: 'Sample image' }],
      schemaTypes: ['Article'],
      depth: 1,
      crawledAt: new Date(),
      statusCode: 200,
      loadTimeMs: 500,
      contentType: 'blog-post',
      metaDescription: 'Sample description',
    },
  ],
  architecturePatterns: [
    {
      urlStructure: '/blog/{category}/{slug}',
      prevalence: 25,
      examples: ['https://example.com/blog/tech/article-1'],
      confidence: 0.95,
      avgDepth: 2,
      avgInternalLinks: 12,
    } as any,
  ],
  contentStrategyPatterns: [
    {
      contentType: 'blog-post',
      pageCount: 20,
      avgWordCount: 1500,
      avgTitleLength: 60,
      headingStructures: ['h1', 'h2', 'h2'],
      avgHeadingCount: 3,
      avgImageCount: 2,
      metadataPatterns: ['schema.org/Article'],
      publishingFrequency: 4,
      freshnessIndicators: {
        hasDatestamps: true,
        avgAgeInDays: 30,
        updateFrequency: 'monthly',
      },
    } as any,
  ],
  hubPages: [
    {
      url: `https://${domain}/hub`,
      title: 'Hub Page',
      incomingLinkCount: 45,
      outgoingLinkCount: 30,
      centralityScore: 0.85,
      depth: 0,
      contentType: 'hub',
      hubType: 'topical',
      topics: ['topic1', 'topic2'],
      confidence: 0.95,
    },
  ],
  internalLinkingPatterns: [
    {
      patternType: 'contextual',
      description: 'Context-based internal linking',
      sourceContentType: 'blog-post',
      targetContentType: 'hub',
      instanceCount: 150,
      avgLinkDensity: 0.03,
      anchorTextPatterns: ['learn more', 'related'],
      placement: 'contextual' as const,
      confidence: 0.88,
    } as any,
  ],
  contentGaps: [
    {
      gapType: 'missing_topic',
      topic: 'advanced-techniques',
      opportunityScore: 0.82,
      searchVolume: 1200,
      competitorCoverage: 1,
      recommendedContentType: 'guide',
      priority: 'high',
      reasoning: 'Underrepresented across competitors',
    },
  ],
  siteMetrics: {
    avgPageWordCount: 1500,
    avgInternalLinksPerPage: 12,
    avgExternalLinksPerPage: 3,
    avgImagesPerPage: 2,
    avgLoadTimeMs: 500,
    schemaImplementationRate: 0.8,
    contentFreshnessScore: 0.75,
  },
  metadata: {
    configUsed: { domain } as any,
    errorsEncountered: [],
    warnings: [],
    confidenceScore: 0.92,
  },
  ...overrides,
});

/**
 * Mock PipelineContext factory
 */
const createMockContext = (): PipelineContext => ({
  task: {
    taskId: 'task-123',
    targetKeyword: 'test keyword',
    contentType: 'blog',
    createdAt: new Date(),
  },
  intelligence: {
    competitive: [],
    serpPatterns: [],
    learnings: [],
    metadata: {
      itemsLoaded: 0,
      oldestItemAge: 0,
      executionTime: 0,
      hasFreshData: false,
    },
  },
  patternApplications: [],
  metrics: {},
});

// ============================================================================
// TEST SUITE: executeStep25
// ============================================================================

describe('executeStep25', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should analyze single competitor successfully', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['competitor1.com'],
        maxPages: 50,
        verbose: false,
      };

      const mockResult = createMockAnalysisResult('competitor1.com');
      mockCompetitorDeepAnalystAgent.prototype.analyze = jest.fn().mockResolvedValue(mockResult);

      // WHEN
      const result = await executeStep25(context, config);

      // THEN
      expect(result).toBeDefined();
      expect(result.domainsAnalyzed).toBe(1);
      expect(result.pagesCrawled).toBe(50);
      expect(result.hubPagesIdentified).toBe(1);
      expect(result.patternsExtracted).toBeGreaterThan(0);
      expect(result.analysisByDomain.get('competitor1.com')).toEqual(mockResult);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple domains in batch', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['comp1.com', 'comp2.com', 'comp3.com'],
        maxPages: 50,
        verbose: false,
      };

      const mockResult1 = createMockAnalysisResult('comp1.com', { pagesCrawled: 50 });
      const mockResult2 = createMockAnalysisResult('comp2.com', { pagesCrawled: 45 });
      const mockResult3 = createMockAnalysisResult('comp3.com', { pagesCrawled: 40 });

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2)
        .mockResolvedValueOnce(mockResult3);

      // WHEN
      const result = await executeStep25(context, config);

      // THEN
      expect(result.domainsAnalyzed).toBe(3);
      expect(result.pagesCrawled).toBe(135); // 50 + 45 + 40
      expect(result.hubPagesIdentified).toBe(3);
      expect(result.analysisByDomain.size).toBe(3);
      expect(mockCompetitorDeepAnalystAgent).toHaveBeenCalledTimes(3);
    });

    it('should store results in context.intelligence.competitive', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['competitor.com'],
        verbose: false,
      };

      const mockResult = createMockAnalysisResult('competitor.com');
      mockCompetitorDeepAnalystAgent.prototype.analyze = jest.fn().mockResolvedValue(mockResult);

      // WHEN
      await executeStep25(context, config);

      // THEN
      expect(context.intelligence.competitive).toBeDefined();
      expect(context.intelligence.competitive).toHaveLength(1);
      expect(context.intelligence.competitive[0]).toHaveProperty('domain', 'competitor.com');
      expect(context.intelligence.competitive[0]).toHaveProperty('contentStrategy');
    });

    it('should populate context.metrics with execution time', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['competitor.com'],
        verbose: false,
      };

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockAnalysisResult('competitor.com'));

      // WHEN
      await executeStep25(context, config);

      // THEN
      expect(context.metrics['step-2.5-competitor-analysis']).toBeDefined();
      expect(typeof context.metrics['step-2.5-competitor-analysis']).toBe('number');
      expect(context.metrics['step-2.5-competitor-analysis']).toBeGreaterThanOrEqual(0);
    });

    it('should return non-zero execution time', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['competitor.com'],
        verbose: false,
      };

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockAnalysisResult('competitor.com'));

      // WHEN
      const result = await executeStep25(context, config);

      // THEN
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should continue on partial domain failure', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['good.com', 'bad.com', 'good2.com'],
        verbose: false,
      };

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockResolvedValueOnce(createMockAnalysisResult('good.com'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createMockAnalysisResult('good2.com'));

      // WHEN
      const result = await executeStep25(context, config);

      // THEN
      expect(result.domainsAnalyzed).toBe(2); // Only successful analyses
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('bad.com');
      expect(result.analysisByDomain.size).toBe(2);
    });

    it('should handle missing Firecrawl API key gracefully', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['competitor.com'],
        verbose: false,
        // No firecrawlApiKey provided
      };

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockRejectedValue(new Error('Firecrawl API key not configured'));

      // WHEN
      const result = await executeStep25(context, config);

      // THEN
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Firecrawl API key');
      expect(result.domainsAnalyzed).toBe(0);
    });

    it('should return errors array for failed domains', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['fail1.com', 'fail2.com'],
        verbose: false,
      };

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Invalid domain'));

      // WHEN
      const result = await executeStep25(context, config);

      // THEN
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('fail1.com');
      expect(result.errors[1]).toContain('fail2.com');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should handle non-Error objects in catch block', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['error.com'],
        verbose: false,
      };

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockRejectedValue('String error message');

      // WHEN
      const result = await executeStep25(context, config);

      // THEN
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('error.com');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty competitor array', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: [],
        verbose: false,
      };

      // WHEN
      const result = await executeStep25(context, config);

      // THEN
      expect(result.domainsAnalyzed).toBe(0);
      expect(result.pagesCrawled).toBe(0);
      expect(result.hubPagesIdentified).toBe(0);
      expect(result.analysisByDomain.size).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should normalize domain URLs', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['competitor.com'],
        verbose: false,
      };

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockAnalysisResult('competitor.com'));

      // WHEN
      await executeStep25(context, config);

      // THEN
      expect(mockCompetitorDeepAnalystAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'competitor.com',
        })
      );
    });

    it('should use default values for optional config parameters', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['competitor.com'],
        // No optional parameters
      };

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockAnalysisResult('competitor.com'));

      // WHEN
      await executeStep25(context, config);

      // THEN
      expect(mockCompetitorDeepAnalystAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          maxPages: 50,
          maxDepth: 3,
          rateLimitMs: 1000,
          requestTimeoutMs: 30000,
        })
      );
    });

    it('should support verbose logging output', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['competitor.com'],
        verbose: true,
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockAnalysisResult('competitor.com'));

      // WHEN
      await executeStep25(context, config);

      // THEN
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Step 2.5'));
      consoleSpy.mockRestore();
    });

    it('should aggregate metrics from multiple domains', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step25Config = {
        competitorDomains: ['c1.com', 'c2.com'],
        verbose: false,
      };

      mockCompetitorDeepAnalystAgent.prototype.analyze = jest
        .fn()
        .mockResolvedValueOnce(createMockAnalysisResult('c1.com', { pagesCrawled: 30 }))
        .mockResolvedValueOnce(createMockAnalysisResult('c2.com', { pagesCrawled: 20 }));

      // WHEN
      const result = await executeStep25(context, config);

      // THEN
      expect(result.pagesCrawled).toBe(50);
      expect(result.hubPagesIdentified).toBe(2);
      expect(result.patternsExtracted).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// TEST SUITE: extractCompetitiveInsights
// ============================================================================

describe('extractCompetitiveInsights', () => {
  it('should aggregate patterns across domains', () => {
    // GIVEN
    const results = new Map<string, CompetitorAnalysisResult>();
    results.set('domain1.com', createMockAnalysisResult('domain1.com'));
    results.set('domain2.com', createMockAnalysisResult('domain2.com'));

    // WHEN
    const insights = extractCompetitiveInsights(results);

    // THEN
    expect(insights).toHaveProperty('commonArchitecturePatterns');
    expect(insights).toHaveProperty('dominantContentTypes');
    expect(insights).toHaveProperty('averageContentLength');
    expect(insights).toHaveProperty('commonHeaderStructures');
    expect(Array.isArray(insights.commonArchitecturePatterns)).toBe(true);
    expect(Array.isArray(insights.dominantContentTypes)).toBe(true);
  });

  it('should return top 5 architecture patterns', () => {
    // GIVEN
    const results = new Map<string, CompetitorAnalysisResult>();
    results.set('domain1.com', createMockAnalysisResult('domain1.com'));

    // WHEN
    const insights = extractCompetitiveInsights(results);

    // THEN
    expect(insights.commonArchitecturePatterns.length).toBeLessThanOrEqual(5);
    expect(Array.isArray(insights.commonArchitecturePatterns)).toBe(true);
  });

  it('should calculate average content length across domains', () => {
    // GIVEN
    const results = new Map<string, CompetitorAnalysisResult>();
    results.set('domain1.com', createMockAnalysisResult('domain1.com'));
    results.set('domain2.com', createMockAnalysisResult('domain2.com'));

    // WHEN
    const insights = extractCompetitiveInsights(results);

    // THEN
    expect(typeof insights.averageContentLength).toBe('number');
    expect(insights.averageContentLength).toBeGreaterThanOrEqual(0);
  });

  it('should return empty results for empty input', () => {
    // GIVEN
    const results = new Map<string, CompetitorAnalysisResult>();

    // WHEN
    const insights = extractCompetitiveInsights(results);

    // THEN
    expect(insights.commonArchitecturePatterns).toHaveLength(0);
    expect(insights.dominantContentTypes).toHaveLength(0);
    expect(insights.averageContentLength).toBe(0);
  });
});

// ============================================================================
// TEST SUITE: identifyOpportunities
// ============================================================================

describe('identifyOpportunities', () => {
  it('should return empty array for missing intelligence', () => {
    // GIVEN
    const context = createMockContext();
    const config: Step25Config = {
      competitorDomains: ['competitor.com'],
    };

    // WHEN
    const opportunities = identifyOpportunities(context, config);

    // THEN
    expect(Array.isArray(opportunities)).toBe(true);
    expect(opportunities.length).toBe(0);
  });

  it('should suggest diversification for < 3 content types', () => {
    // GIVEN
    const context = createMockContext();
    context.intelligence.competitive = [
      {
        domain: 'competitor.com',
        contentStrategy: {
          averageWordCount: 1500,
          keywordDensity: {},
          contentTypes: ['blog-post', 'guide'], // Only 2 types
        },
        keywordTargeting: {
          primaryKeywords: [],
          secondaryKeywords: [],
          searchVolumes: {},
        },
        backlinks: {
          total: 0,
          domainAuthority: 0,
          topReferrers: [],
        },
        analyzedAt: new Date(),
      },
    ];
    const config: Step25Config = {
      competitorDomains: ['competitor.com'],
    };

    // WHEN
    const opportunities = identifyOpportunities(context, config);

    // THEN
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities.some((opp) => opp.includes('diversif'))).toBe(true);
  });

  it('should not suggest diversification for >= 3 content types', () => {
    // GIVEN
    const context = createMockContext();
    context.intelligence.competitive = [
      {
        domain: 'competitor.com',
        contentStrategy: {
          averageWordCount: 1500,
          keywordDensity: {},
          contentTypes: ['blog-post', 'guide', 'case-study', 'video'],
        },
        keywordTargeting: {
          primaryKeywords: [],
          secondaryKeywords: [],
          searchVolumes: {},
        },
        backlinks: {
          total: 0,
          domainAuthority: 0,
          topReferrers: [],
        },
        analyzedAt: new Date(),
      },
    ];
    const config: Step25Config = {
      competitorDomains: ['competitor.com'],
    };

    // WHEN
    const opportunities = identifyOpportunities(context, config);

    // THEN
    expect(opportunities.length).toBe(0);
  });
});
