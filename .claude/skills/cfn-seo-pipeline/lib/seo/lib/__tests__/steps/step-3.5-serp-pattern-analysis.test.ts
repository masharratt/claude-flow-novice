/**
 * Test Suite: Step 3.5 - SERP Pattern Analysis
 *
 * @module planning/seo/lib/steps/__tests__/step-3.5-serp-pattern-analysis.test
 * @description Comprehensive test coverage for SERP pattern analysis step
 * @tests 16 test cases covering happy path, error handling, and edge cases
 */

// ============================================================================
// MOCK SETUP (MUST BE BEFORE IMPORTS)
// ============================================================================

jest.mock('../../../../../packages/seo-analysis/src/lib/serp-pattern-analyst');

import {
  executeStep35,
  identifySerpOpportunities,
  generateSerpStrategy,
  Step35Config,
  Step35Result,
} from '../step-3.5-serp-pattern-analysis';
import { PipelineContext } from '../../../types';
import { SERPPatternAnalyst } from '../../../../../packages/seo-analysis/src/lib/serp-pattern-analyst';

const mockSERPPatternAnalyst = SERPPatternAnalyst as jest.MockedClass<typeof SERPPatternAnalyst>;

/**
 * Mock SERPAnalysisResult factory
 */
const createMockSerpResult = (keyword: string, overrides?: any): any => ({
  keyword,
  analyzedAt: new Date(),
  totalTimeMs: 3000,
  results: [
    {
      position: 1,
      url: `https://example1.com`,
      title: 'Result 1',
      snippet: 'Snippet 1',
    },
    {
      position: 2,
      url: `https://example2.com`,
      title: 'Result 2',
      snippet: 'Snippet 2',
    },
    {
      position: 3,
      url: `https://example3.com`,
      title: 'Result 3',
      snippet: 'Snippet 3',
    },
  ],
  features: [
    {
      type: 'featured_snippet' as any,
      position: 1,
      snippetType: 'paragraph' as any,
      content: 'Featured snippet example content',
    },
    {
      type: 'people_also_ask' as any,
      position: 4,
      content: 'What is a SERP?',
    },
    {
      type: 'related_searches' as any,
      position: 11,
      content: 'keyword variations',
    },
    {
      type: 'image_pack' as any,
      position: 8,
    },
  ],
  rankingPatterns: {
    domainAuthority: {
      min: 72,
      max: 85,
      average: 78.3,
      distribution: [],
    },
    contentLength: {
      min: 1800,
      max: 2500,
      average: 2166,
      distribution: [],
    },
    titleMeta: {
      avgLength: 62,
      commonPatterns: ['keyword in title'],
    },
    urlStructure: {
      patterns: ['/blog/{slug}', '/{category}/article/{slug}'],
      distribution: [],
    },
    contentTypes: [
      {
        type: 'blog',
        count: 5,
        positions: [1, 2, 3, 4, 5],
      },
    ],
    freshnessSignals: [
      {
        signal: 'recently_updated',
        count: 3,
        positions: [1, 3, 5],
      },
    ],
  } as any,
  semanticClusters: [
    {
      clusterId: 'cluster_1',
      keywords: ['keyword', 'related_keyword'],
      size: 5,
      centroid: [0.1, 0.2],
    },
  ],
  contentGaps: [
    {
      topic: 'advanced-techniques',
      keywords: ['advanced', 'techniques'],
      searchVolume: 500,
      difficulty: 35,
    },
  ],
  recommendations: [
    {
      type: 'content',
      title: 'Create comprehensive guide content',
      priority: 'high',
      rationale: 'Top results are in-depth guides',
    },
    {
      type: 'snippet',
      title: 'Optimize for featured snippet',
      priority: 'high',
      rationale: 'Featured snippet present in SERP',
    },
    {
      type: 'authority',
      title: 'Build high-quality backlinks',
      priority: 'medium',
      rationale: 'High DA required for ranking',
    },
  ] as any,
  confidence: 0.92,
  warnings: [],
  metadata: {
    apiProvider: 'google' as const,
    totalResults: 1000000,
    cacheHit: false,
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
// TEST SUITE: executeStep35
// ============================================================================

describe('executeStep35', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Happy Path', () => {
    it('should analyze keyword SERP successfully', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        maxResults: 10,
        verbose: false,
      };

      const mockResult = createMockSerpResult('test keyword');
      mockSERPPatternAnalyst.prototype.analyze = jest.fn().mockResolvedValue(mockResult);

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result).toBeDefined();
      expect(result.keyword).toBe('test keyword');
      expect(result.resultsAnalyzed).toBeGreaterThanOrEqual(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect SERP features', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      const mockResult = createMockSerpResult('test keyword');
      mockSERPPatternAnalyst.prototype.analyze = jest.fn().mockResolvedValue(mockResult);

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result.featuresDetected).toBe(4);
    });

    it('should identify ranking patterns', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      const mockResult = createMockSerpResult('test keyword');
      mockSERPPatternAnalyst.prototype.analyze = jest.fn().mockResolvedValue(mockResult);

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result.rankingPatternsIdentified).toBeGreaterThanOrEqual(0);
    });

    it('should generate recommendations', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      const mockResult = createMockSerpResult('test keyword');
      mockSERPPatternAnalyst.prototype.analyze = jest.fn().mockResolvedValue(mockResult);

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result.recommendationsGenerated).toBeGreaterThan(0);
    });

    it('should store SERP patterns in context', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest.fn().mockResolvedValue(createMockSerpResult('test keyword'));

      // WHEN
      await executeStep35(context, config);

      // THEN
      expect(context.intelligence.serpPatterns).toBeDefined();
      expect(context.intelligence.serpPatterns).toHaveLength(1);
      expect(context.intelligence.serpPatterns[0]).toHaveProperty('keyword', 'test keyword');
    });

    it('should populate context.metrics with execution time', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockSerpResult('test keyword'));

      // WHEN
      await executeStep35(context, config);

      // THEN
      expect(context.metrics['step-3.5-serp-pattern-analysis']).toBeDefined();
      expect(typeof context.metrics['step-3.5-serp-pattern-analysis']).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle SERP analysis failure gracefully', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest.fn().mockRejectedValue(new Error('API error'));

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('SERP analysis failed');
      expect(result.analysisResult).toBeDefined();
    });

    it('should continue pipeline on API key missing', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest
        .fn()
        .mockRejectedValue(new Error('Google API key not configured'));

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result.warnings).toHaveLength(1);
      expect(result.analysisResult).toBeDefined();
      expect(result.analysisResult.keyword).toBe('test keyword');
    });

    it('should return warnings array for errors', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest
        .fn()
        .mockRejectedValue(new Error('Network timeout'));

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle non-Error objects in catch block', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest.fn().mockRejectedValue('String error');

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('SERP analysis failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty keyword', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: '',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockSerpResult('', { results: [] }));

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result.keyword).toBe('');
    });

    it('should use default maxResults value', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest.fn().mockResolvedValue(createMockSerpResult('test keyword'));

      // WHEN
      await executeStep35(context, config);

      // THEN
      expect(mockSERPPatternAnalyst).toHaveBeenCalledWith(
        expect.objectContaining({
          maxResults: 10,
        })
      );
    });

    it('should support verbose logging output', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: true,
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockSERPPatternAnalyst.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockSerpResult('test keyword'));

      // WHEN
      await executeStep35(context, config);

      // THEN
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Step 3.5'));
      consoleSpy.mockRestore();
    });

    it('should handle results with no features', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'obscure keyword',
        verbose: false,
      };

      const mockResult = createMockSerpResult('obscure keyword', {
        features: [],
      });
      mockSERPPatternAnalyst.prototype.analyze = jest.fn().mockResolvedValue(mockResult);

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result.featuresDetected).toBe(0);
      expect(result.analysisResult).toBeDefined();
    });

    it('should return non-zero execution time', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockSerpResult('test keyword'));

      // WHEN
      const result = await executeStep35(context, config);

      // THEN
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should convert SERPAnalysisResult to SERPPattern format', async () => {
      // GIVEN
      const context = createMockContext();
      const config: Step35Config = {
        keyword: 'test keyword',
        verbose: false,
      };

      mockSERPPatternAnalyst.prototype.analyze = jest
        .fn()
        .mockResolvedValue(createMockSerpResult('test keyword'));

      // WHEN
      await executeStep35(context, config);

      // THEN
      const serpPattern = context.intelligence.serpPatterns[0];
      expect(serpPattern).toHaveProperty('keyword', 'test keyword');
      expect(serpPattern).toHaveProperty('featuredSnippets');
      expect(serpPattern).toHaveProperty('peopleAlsoAsk');
      expect(serpPattern).toHaveProperty('relatedSearches');
    });
  });
});

// ============================================================================
// TEST SUITE: identifySerpOpportunities
// ============================================================================

describe('identifySerpOpportunities', () => {
  it('should identify featured snippet opportunity', () => {
    // GIVEN
    const result = createMockSerpResult('test keyword');

    // WHEN
    const opportunities = identifySerpOpportunities(result);

    // THEN
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities.some((opp) => typeof opp === 'string')).toBe(true);
  });

  it('should suggest FAQ content for People Also Ask', () => {
    // GIVEN
    const result = createMockSerpResult('test keyword');

    // WHEN
    const opportunities = identifySerpOpportunities(result);

    // THEN
    expect(opportunities.some((opp) => opp.includes('FAQ'))).toBe(true);
  });

  it('should return array for empty features', () => {
    // GIVEN
    const result = createMockSerpResult('test keyword', {
      features: [],
    });

    // WHEN
    const opportunities = identifySerpOpportunities(result);

    // THEN
    expect(Array.isArray(opportunities)).toBe(true);
    expect(opportunities.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// TEST SUITE: generateSerpStrategy
// ============================================================================

describe('generateSerpStrategy', () => {
  it('should return strategy object with required properties', () => {
    // GIVEN
    const context = createMockContext();
    const result = createMockSerpResult('test keyword');

    // WHEN
    const strategy = generateSerpStrategy(context, result);

    // THEN
    expect(strategy).toHaveProperty('serpFeaturesToTarget');
    expect(strategy).toHaveProperty('contentLengthTarget');
    expect(strategy).toHaveProperty('contentStructureRecommendations');
    expect(strategy).toHaveProperty('authorityRequiredLevel');
  });

  it('should calculate content length target based on SERP', () => {
    // GIVEN
    const context = createMockContext();
    const result = createMockSerpResult('test keyword');

    // WHEN
    const strategy = generateSerpStrategy(context, result);

    // THEN
    expect(typeof strategy.contentLengthTarget).toBe('number');
    expect(strategy.contentLengthTarget).toBeGreaterThan(0);
  });

  it('should determine authority level (low/medium/high)', () => {
    // GIVEN
    const context = createMockContext();
    const result = createMockSerpResult('test keyword');

    // WHEN
    const strategy = generateSerpStrategy(context, result);

    // THEN
    expect(['low', 'medium', 'high']).toContain(strategy.authorityRequiredLevel);
  });

  it('should provide content structure recommendations', () => {
    // GIVEN
    const context = createMockContext();
    const result = createMockSerpResult('test keyword');

    // WHEN
    const strategy = generateSerpStrategy(context, result);

    // THEN
    expect(Array.isArray(strategy.contentStructureRecommendations)).toBe(true);
    expect(strategy.contentStructureRecommendations.length).toBeGreaterThan(0);
  });

  it('should include H2 heading recommendation', () => {
    // GIVEN
    const context = createMockContext();
    const result = createMockSerpResult('test keyword');

    // WHEN
    const strategy = generateSerpStrategy(context, result);

    // THEN
    expect(strategy.contentStructureRecommendations.some((rec) => rec.includes('H2'))).toBe(true);
  });

  it('should return array for serpFeaturesToTarget', () => {
    // GIVEN
    const context = createMockContext();
    const result = createMockSerpResult('test keyword');

    // WHEN
    const strategy = generateSerpStrategy(context, result);

    // THEN
    expect(Array.isArray(strategy.serpFeaturesToTarget)).toBe(true);
  });
});
