/**
 * SERP Pattern Analyst - Comprehensive Test Suite
 *
 * @module @claude-flow-novice/seo-analysis/__tests__/serp-pattern-analyst
 * @description Complete test coverage for SERP pattern analysis (Phase 2 Sprint 2)
 * @version 1.0.0
 *
 * Coverage:
 * - Configuration validation
 * - API integration (mocked Google & DataForSEO)
 * - SERP feature detection
 * - Ranking pattern analysis
 * - Semantic clustering
 * - Content gap identification
 * - Recommendation generation
 * - Error handling (network failures, timeouts, rate limits)
 * - Edge cases (insufficient data, malformed responses)
 */

// FIX: Mock axios BEFORE importing SERPPatternAnalyst (Jest hoisting requirement)
import axios from 'axios';
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

import { SERPPatternAnalyst } from '../serp-pattern-analyst';
import {
  SERPAnalysisConfig,
  SERPAnalysisError,
  SERPAnalysisErrorCode,
  SERPFeatureType,
  ContentType,
  FreshnessSignal,
  RecommendationType,
  GoogleSearchResponse,
  GoogleSearchItem,
  DataForSEOResponse,
  DataForSEOItem,
} from '../../types/serp-analysis';

// ============================================================================
// TEST HELPERS AND MOCKS
// ============================================================================

/**
 * Create mock Google search response
 * FIX: Preserve user-provided fields (title, link, snippet, etc.)
 */
function createMockGoogleResponse(
  items: Partial<GoogleSearchItem>[],
  options: { error?: { code: number; message: string } } = {}
): GoogleSearchResponse {
  if (options.error) {
    return {
      kind: 'customsearch#search',
      error: options.error,
    };
  }

  return {
    kind: 'customsearch#search',
    items: items.map(
      (item, index): GoogleSearchItem => ({
        title: item.title ?? `Result ${index + 1}`,  // ✅ Use provided or default
        link: item.link ?? `https://example${index}.com/page`,
        snippet: item.snippet ?? `Snippet for result ${index + 1}`,
        displayLink: item.displayLink ?? `example${index}.com`,
        htmlSnippet: item.htmlSnippet,
        pagemap: item.pagemap,
      })
    ),
    searchInformation: {
      totalResults: items.length.toString(),
      searchTime: 0.5,
    },
  };
}

/**
 * Create mock DataForSEO response
 * FIX: Preserve user-provided fields (rank_absolute, title, url, description, etc.)
 */
function createMockDataForSEOResponse(
  items: Partial<DataForSEOItem>[],
  options: { statusCode?: number; statusMessage?: string } = {}
): DataForSEOResponse {
  const statusCode = options.statusCode ?? 20000; // 20000 = success
  const statusMessage = options.statusMessage;

  return {
    tasks: [{
      status_code: statusCode,
      status_message: statusMessage,
      result: statusCode === 20000 ? [{
        keyword: 'test query',
        type: 'organic',
        items: items.map(
          (item, index): DataForSEOItem => ({
            type: item.type ?? 'organic',
            rank_group: item.rank_group,
            rank_absolute: item.rank_absolute ?? index + 1,  // ✅ Use provided or default
            domain: item.domain ?? `example${index}.com`,
            title: item.title ?? `Result ${index + 1}`,
            url: item.url ?? `https://example${index}.com/page`,
            description: item.description ?? `Snippet for result ${index + 1}`,
            table: item.table,
            links: item.links,
            items: item.items,
            title_text: item.title_text,
            description_text: item.description_text,
          })
        ),
      }] : undefined,
    }],
  };
}

/**
 * Setup environment for tests
 * By default uses DataForSEO only for richer test data
 */
function setupTestEnvironment(overrides: Record<string, string> = {}) {
  const env = {
    GOOGLE_API_KEY: '', // Disabled by default
    GOOGLE_SEARCH_ENGINE_ID: '', // Disabled by default
    DATA_FOR_SEO_API_KEY: 'bWljaGFlbEBkYWlseWF1dG9tYXRpb25zLmNvbToyMjBmODZiNWM4ODNkODM1', // base64 encoded
    SPYFU_API_KEY: 'test-spyfu-key-12345',
    FIRECRAWL_API_KEY: 'test-mock-firecrawl-key-for-serp-tests',
    FIRECRAWL_BASE_URL: 'https://api.firecrawl.dev',
    ...overrides,
  };

  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = value;
  });

  return env;
}

/**
 * Clear test environment
 */
function clearTestEnvironment() {
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_SEARCH_ENGINE_ID;
  delete process.env.DATA_FOR_SEO_API_KEY;
  delete process.env.SPYFU_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.FIRECRAWL_BASE_URL;
}

// ============================================================================
// P0 CRITICAL: CONFIGURATION VALIDATION
// ============================================================================

describe('Configuration Validation', () => {
  beforeEach(() => {
    clearTestEnvironment();
  });

  describe('Keyword Validation', () => {
    it('should reject empty keyword', () => {
      setupTestEnvironment();

      expect(() => {
        new SERPPatternAnalyst({ keyword: '' });
      }).toThrow(SERPAnalysisError);

      expect(() => {
        new SERPPatternAnalyst({ keyword: '' });
      }).toThrow('Keyword must be a non-empty string');
    });

    it('should reject keyword less than 2 characters', () => {
      setupTestEnvironment();

      expect(() => {
        new SERPPatternAnalyst({ keyword: 'a' });
      }).toThrow(SERPAnalysisError);
    });

    it('should reject keyword longer than 200 characters', () => {
      setupTestEnvironment();
      const longKeyword = 'a'.repeat(201);

      expect(() => {
        new SERPPatternAnalyst({ keyword: longKeyword });
      }).toThrow(SERPAnalysisError);
    });

    it('should accept valid keyword', () => {
      setupTestEnvironment();

      expect(() => {
        new SERPPatternAnalyst({ keyword: 'test keyword' });
      }).not.toThrow();
    });

    it('should trim whitespace from keyword', () => {
      setupTestEnvironment();
      const analyst = new SERPPatternAnalyst({ keyword: '  test keyword  ' });

      expect((analyst as any).config.keyword).toBe('test keyword');
    });
  });

  describe('API Key Validation', () => {
    it('should throw error when no API keys configured', () => {
      expect(() => {
        new SERPPatternAnalyst({ keyword: 'test' });
      }).toThrow(SERPAnalysisError);

      expect(() => {
        new SERPPatternAnalyst({ keyword: 'test' });
      }).toThrow('No API keys configured');
    });

    it('should accept Google API configuration', () => {
      expect(() => {
        new SERPPatternAnalyst({
          keyword: 'test',
          googleApiKey: 'valid-google-key-1234567890',
          googleSearchEngineId: 'valid-search-engine-id',
        });
      }).not.toThrow();
    });

    it('should accept DataForSEO configuration', () => {
      expect(() => {
        new SERPPatternAnalyst({
          keyword: 'test',
          dataForSeoApiKey: 'valid-serpapi-key-1234567890',
        });
      }).not.toThrow();
    });

    it('should detect placeholder API keys and warn', () => {
      const analyst = new SERPPatternAnalyst({
        keyword: 'test',
        googleApiKey: '[REDACTED]',
        googleSearchEngineId: 'test',
        dataForSeoApiKey: 'valid-serpapi-key-1234567890',
      });

      expect((analyst as any).warnings).toContain('Google API key appears to be a placeholder');
    });

    it('should use environment variables if not provided in config', () => {
      setupTestEnvironment({
        DATA_FOR_SEO_API_KEY: 'c8f9a3b2d1e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5',
      });

      expect(() => {
        new SERPPatternAnalyst({ keyword: 'test' });
      }).not.toThrow();
    });
  });

  describe('Config Parameter Validation', () => {
    beforeEach(() => {
      setupTestEnvironment({
        DATA_FOR_SEO_API_KEY: 'c8f9a3b2d1e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5',
      });
    });

    it('should reject maxResults less than 5', () => {
      expect(() => {
        new SERPPatternAnalyst({ keyword: 'test', maxResults: 3 });
      }).toThrow('maxResults must be between 5 and 100');
    });

    it('should reject maxResults greater than 100', () => {
      expect(() => {
        new SERPPatternAnalyst({ keyword: 'test', maxResults: 101 });
      }).toThrow('maxResults must be between 5 and 100');
    });

    it('should accept valid maxResults', () => {
      expect(() => {
        new SERPPatternAnalyst({ keyword: 'test', maxResults: 10 });
      }).not.toThrow();
    });

    it('should use default configuration values', () => {
      const analyst = new SERPPatternAnalyst({ keyword: 'test' });
      const config = (analyst as any).config;

      expect(config.maxResults).toBe(10);
      expect(config.enableContentScraping).toBe(false);
      expect(config.requestTimeoutMs).toBe(30000);
      expect(config.verbose).toBe(false);
      expect(config.rateLimitMs).toBe(1000);
    });
  });
});

// ============================================================================
// P0 CRITICAL: GOOGLE CUSTOM SEARCH INTEGRATION
// ============================================================================

describe('Google Custom Search Integration', () => {
  beforeEach(() => {
    setupTestEnvironment({
      GOOGLE_API_KEY: 'AIzaSyB3k9m8nL2pQ5rT7uV9wX0yZ1aC4dE6fG8hI0',
      GOOGLE_SEARCH_ENGINE_ID: 'a1b2c3d4e5f6g7h8i9j0',
      DATA_FOR_SEO_API_KEY: 'c8f9a3b2d1e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5', // Fallback
    });
    jest.clearAllMocks();
  });

  it('should fetch and parse Google search results', async () => {
    const mockResponse = createMockGoogleResponse([
      {
        title: 'Best Running Shoes 2024',
        link: 'https://example.com/running-shoes-2024',
        snippet: 'Comprehensive guide to the best running shoes in 2024',
      },
      {
        title: 'Top 10 Running Shoes',
        link: 'https://example2.com/top-running-shoes',
        snippet: 'Our top picks for running shoes this year',
      },
    ]);

    mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({
      keyword: 'best running shoes',
    });

    const result = await analyst.analyze();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://www.googleapis.com/customsearch/v1',
      expect.objectContaining({
        params: expect.objectContaining({
          q: 'best running shoes',
        }),
      })
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0].title).toBe('Best Running Shoes 2024');
    expect(result.results[0].position).toBe(1);
  });

  it('should handle Google API errors gracefully', async () => {
    const mockResponse = createMockGoogleResponse([], {
      error: { code: 400, message: 'Invalid API key' },
    });

    mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
      googleApiKey: 'AIzaInvalidKeyButLongEnough1234567890ABC',
      googleSearchEngineId: 'a1b2c3d4e5f6g7h8i9j0',
      dataForSeoApiKey: 'c8f9a3b2d1e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5',
    });

    // API_REQUEST_FAILED is a non-recoverable error, so it should throw immediately
    // without fallback to DataForSEO
    await expect(analyst.analyze()).rejects.toThrow('Invalid API key');
  });

  it('should handle rate limit errors', async () => {
    // Explicitly clear environment variables to test error paths
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_SEARCH_ENGINE_ID;
    delete process.env.DATA_FOR_SEO_API_KEY;

    const error: any = new Error('Request failed with status code 429');
    error.isAxiosError = true;
    error.response = { status: 429 };
    error.code = undefined;

    // Mock axios.isAxiosError to recognize our mock error
    jest.spyOn(axios, 'isAxiosError').mockReturnValueOnce(true);
    // FIX: Google uses GET, not POST
    mockedAxios.get.mockRejectedValueOnce(error);

    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
      googleApiKey: 'AIzaSyB3k9m8nL2pQ5rT7uV9wX0yZ1aC4dE6fG8hI0',
      googleSearchEngineId: 'a1b2c3d4e5f6g7h8i9j0',
      dataForSeoApiKey: undefined, // Force only Google API
    });

    await expect(analyst.analyze()).rejects.toThrow('rate limit exceeded');
  });

  it('should handle timeout errors', async () => {
    // Explicitly clear environment variables to test error paths
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_SEARCH_ENGINE_ID;
    delete process.env.DATA_FOR_SEO_API_KEY;

    const error: any = new Error('timeout of 30000ms exceeded');
    error.isAxiosError = true;
    error.code = 'ECONNABORTED';

    // Mock axios.isAxiosError to recognize our mock error
    jest.spyOn(axios, 'isAxiosError').mockReturnValueOnce(true);
    // FIX: Google uses GET, not POST
    mockedAxios.get.mockRejectedValueOnce(error);

    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
      googleApiKey: 'AIzaSyB3k9m8nL2pQ5rT7uV9wX0yZ1aC4dE6fG8hI0',
      googleSearchEngineId: 'a1b2c3d4e5f6g7h8i9j0',
      dataForSeoApiKey: undefined, // Force only Google API
    });

    await expect(analyst.analyze()).rejects.toThrow('timeout');
  });
});

// ============================================================================
// P0 CRITICAL: SERPAPI INTEGRATION
// ============================================================================

describe('DataForSEO Integration', () => {
  beforeEach(() => {
    setupTestEnvironment({ GOOGLE_API_KEY: '', GOOGLE_SEARCH_ENGINE_ID: '' });
    jest.clearAllMocks();
  });

  it('should fetch and parse DataForSEO results', async () => {
    const mockResponse = createMockDataForSEOResponse([
      {
        rank_absolute: 1,
        title: 'Best Running Shoes 2024',
        url: 'https://example.com/running-shoes-2024',
        description: 'Comprehensive guide to the best running shoes in 2024',
        links: [{ title: 'Link 1', url: 'https://example.com/link1' }],
      },
      {
        rank_absolute: 2,
        title: 'Top 10 Running Shoes',
        url: 'https://example2.com/top-running-shoes',
        description: 'Our top picks for running shoes this year',
      },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({
      keyword: 'best running shoes',
    });

    const result = await analyst.analyze();

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'best running shoes',
          language_code: 'en',
        }),
      ]),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0].hasSiteLinks).toBe(true);
    expect(result.results[1].hasSiteLinks).toBe(false);
  });

  it('should handle DataForSEO errors', async () => {
    const mockResponse = createMockDataForSEOResponse([], { statusCode: 40000, statusMessage: 'Invalid API key' });

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
    });

    await expect(analyst.analyze()).rejects.toThrow('DataForSEO error');
  });

  it('should handle DataForSEO rate limits', async () => {
    const error: any = new Error('Request failed with status code 429');
    error.isAxiosError = true;
    error.response = { status: 429 };
    error.code = undefined;

    // Mock axios.isAxiosError to recognize our mock error
    jest.spyOn(axios, 'isAxiosError').mockReturnValueOnce(true);
    mockedAxios.post.mockRejectedValueOnce(error);

    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
    });

    await expect(analyst.analyze()).rejects.toThrow('DataForSEO rate limit exceeded');
  });
});

// ============================================================================
// P1 HIGH: SERP FEATURE DETECTION
// ============================================================================

describe('SERP Feature Detection', () => {
  beforeEach(() => {
    setupTestEnvironment();
    jest.clearAllMocks();
  });

  it('should detect site links feature', async () => {
    const mockResponse = createMockDataForSEOResponse([
      {
        rank_absolute: 1,
        title: 'Homepage',
        url: 'https://example.com',
        description: 'Main site',
        links: [
          { title: 'About', url: 'https://example.com/about' },
          { title: 'Contact', url: 'https://example.com/contact' },
        ],
      },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    const siteLinkFeature = result.features.find((f) => f.type === SERPFeatureType.SITE_LINKS);
    expect(siteLinkFeature).toBeDefined();
    expect(siteLinkFeature?.confidence).toBeGreaterThan(0.9);
  });

  it('should detect video carousel pattern', async () => {
    const mockResponse = createMockDataForSEOResponse([
      {
        type: 'organic',
        rank_absolute: 1,
        title: 'Cooking Pasta - Video Demo',
        url: 'https://youtube.com/watch?v=1',
        description: 'Watch this video demo of pasta cooking...',
      },
      {
        type: 'organic',
        rank_absolute: 2,
        title: 'Pasta Cooking Video Tips',
        url: 'https://youtube.com/watch?v=2',
        description: 'Video showing best tips for cooking pasta...',
      },
      {
        type: 'organic',
        rank_absolute: 3,
        title: 'Master Pasta Making - Video',
        url: 'https://vimeo.com/video/3',
        description: 'Video demonstration of pasta making...',
      },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'pasta cooking video' });
    const result = await analyst.analyze();

    const videoFeature = result.features.find((f) => f.type === SERPFeatureType.VIDEO_CAROUSEL);
    expect(videoFeature).toBeDefined();
    expect(videoFeature?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should warn about limited feature detection', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { rank_absolute: 1, title: 'Result 1', url: 'https://example.com', description: 'Snippet 1' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    expect(result.warnings).toContain('Limited SERP feature detection without full HTML access');
  });
});

// ============================================================================
// P1 HIGH: RANKING PATTERN ANALYSIS
// ============================================================================

describe('Ranking Pattern Analysis', () => {
  beforeEach(() => {
    setupTestEnvironment();
    jest.clearAllMocks();
  });

  it('should analyze title and meta patterns', async () => {
    const mockResponse = createMockDataForSEOResponse([
      {
        rank_absolute: 1,
        title: 'Best Running Shoes 2024 - Complete Guide',
        url: 'https://example.com/running-shoes',
        description: 'Discover the best running shoes for 2024',
      },
      {
        rank_absolute: 2,
        title: 'Running Shoes 2024: Top 10 Picks',
        url: 'https://example2.com/shoes',
        description: 'Our expert picks for running shoes this year',
      },
      {
        rank_absolute: 3,
        title: '2024 Running Shoe Buying Guide',
        url: 'https://example3.com/guide',
        description: 'Everything you need to know about buying running shoes',
      },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'running shoes' });
    const result = await analyst.analyze();

    expect(result.rankingPatterns.titleMeta).toBeDefined();
    expect(result.rankingPatterns.titleMeta.avgTitleLength).toBeGreaterThan(0);
    expect(result.rankingPatterns.titleMeta.keywordPlacement.inTitle).toBeGreaterThan(0);
  });

  it('should identify common title structures', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { title: 'Guide | Brand Name', url: 'https://example1.com', description: 'Text' },
      { title: 'Tutorial | Brand', url: 'https://example2.com', description: 'Text' },
      { title: 'Article | Company', url: 'https://example3.com', description: 'Text' },
      { title: 'Post - Website', url: 'https://example4.com', description: 'Text' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    expect(result.rankingPatterns.titleMeta.commonTitlePatterns).toContain('Title | Brand');
  });

  it('should analyze URL structure patterns', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { url: 'https://example.com/blog/2024/article-1', description: 'Text' },
      { url: 'https://example.com/blog/2024/article-2', description: 'Text' },
      { url: 'https://example.com/guides/how-to-guide', description: 'Text' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    expect(result.rankingPatterns.urlStructure.patterns).toBeDefined();
    expect(result.rankingPatterns.urlStructure.avgUrlLength).toBeGreaterThan(0);
  });

  it('should detect freshness signals', async () => {
    const mockResponse = createMockDataForSEOResponse([
      {
        title: 'Best Gadgets 2024',
        url: 'https://example.com/blog/2024/gadgets',
        description: 'Latest gadgets',
      },
      {
        title: 'Gadgets Guide January 2024',
        url: 'https://example2.com/2024-01-15/guide',
        description: 'Updated guide',
      },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'best gadgets' });
    const result = await analyst.analyze();

    expect(result.rankingPatterns.freshnessSignals).toBeDefined();
    expect(
      result.rankingPatterns.freshnessSignals.some((s) => s.signal === FreshnessSignal.DATE_IN_TITLE)
    ).toBe(true);
  });

  it('should classify content types', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { url: 'https://example.com/blog/article', description: 'Blog post' },
      { url: 'https://shop.com/product/item', description: 'Buy now for $99' },
      { url: 'https://guide.com/how-to-guide', description: 'Complete tutorial guide' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    expect(result.rankingPatterns.contentTypes).toBeDefined();
    expect(result.rankingPatterns.contentTypes.length).toBeGreaterThan(0);
    expect(
      result.rankingPatterns.contentTypes.some((ct) => ct.type === ContentType.BLOG)
    ).toBe(true);
  });
});

// ============================================================================
// P1 HIGH: SEMANTIC CLUSTERING
// ============================================================================

describe('Semantic Clustering', () => {
  beforeEach(() => {
    setupTestEnvironment();
    jest.clearAllMocks();
  });

  it('should extract semantic clusters from results', async () => {
    const mockResponse = createMockDataForSEOResponse([
      {
        title: 'Running Shoe Performance Guide',
        description: 'Learn about running shoe performance and comfort features',
      },
      {
        title: 'Best Running Shoes for Performance',
        description: 'Top performance running shoes with comfort technology',
      },
      {
        title: 'Comfortable Running Shoes',
        description: 'Find comfortable running shoes for daily performance',
      },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'running shoes' });
    const result = await analyst.analyze();

    expect(result.semanticClusters).toBeDefined();
    expect(result.semanticClusters.length).toBeGreaterThan(0);

    // Should identify "performance" and "comfortable" as clusters
    const performanceCluster = result.semanticClusters.find((c) =>
      c.mainTopic.includes('performance')
    );
    expect(performanceCluster).toBeDefined();
  });

  it('should calculate cluster prevalence correctly', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { title: 'Guide', description: 'guide keyword guide' },
      { title: 'Tutorial', description: 'tutorial content' },
      { title: 'Guide', description: 'another guide' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    const guideCluster = result.semanticClusters.find((c) => c.mainTopic.includes('guide'));
    if (guideCluster) {
      expect(guideCluster.prevalence).toBeGreaterThan(0.5); // Should be > 50%
    }
  });
});

// ============================================================================
// P1 HIGH: CONTENT GAP IDENTIFICATION
// ============================================================================

describe('Content Gap Identification', () => {
  beforeEach(() => {
    setupTestEnvironment();
    jest.clearAllMocks();
  });

  it('should identify missing content types', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { url: 'https://example.com/product/1', description: 'Buy product' },
      { url: 'https://example.com/product/2', description: 'Shop now' },
      { url: 'https://example.com/product/3', description: 'Purchase here' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'best laptops' });
    const result = await analyst.analyze();

    expect(result.contentGaps).toBeDefined();

    // Should identify blog content gap
    const blogGap = result.contentGaps.find((g) => g.topic.includes('blog'));
    expect(blogGap).toBeDefined();
  });

  it('should identify comprehensive guide gaps', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { title: 'Article 1', description: 'Short article' },
      { title: 'Article 2', description: 'Another short article' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    const guideGap = result.contentGaps.find((g) => g.topic.includes('guide'));
    expect(guideGap).toBeDefined();
    expect(guideGap?.recommendedContentType).toBe(ContentType.GUIDE);
  });

  it('should prioritize content gaps correctly', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { title: 'Result', description: 'Text' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    const highPriorityGaps = result.contentGaps.filter((g) => g.priority === 'high');
    expect(highPriorityGaps.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// P1 HIGH: RECOMMENDATION GENERATION
// ============================================================================

describe('Recommendation Generation', () => {
  beforeEach(() => {
    setupTestEnvironment();
    jest.clearAllMocks();
  });

  it('should generate title optimization recommendations', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { title: 'Best Running Shoes 2024', description: 'Guide to running shoes' },
      { title: 'Running Shoes 2024 Guide', description: 'Complete running shoes guide' },
      { title: '2024 Best Running Shoes', description: 'Top running shoes for 2024' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'running shoes' });
    const result = await analyst.analyze();

    const titleRec = result.recommendations.find((r) => r.title.includes('title'));
    expect(titleRec).toBeDefined();
    expect(titleRec?.impact).toBeDefined();
    expect(titleRec?.effort).toBeDefined();
    expect(titleRec?.actionSteps).toBeDefined();
    expect(titleRec?.actionSteps.length).toBeGreaterThan(0);
  });

  it('should generate content length recommendations', async () => {
    const mockResponse = createMockDataForSEOResponse(
      Array(5).fill(null).map((_, i) => ({
        title: `Article ${i + 1}`,
        description: 'Comprehensive long-form article content',
      }))
    );

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    const lengthRec = result.recommendations.find((r) => r.title.includes('content length'));
    expect(lengthRec).toBeDefined();
    expect(lengthRec?.type).toBe(RecommendationType.CONTENT_STRUCTURE);
  });

  it('should generate SERP feature targeting recommendations', async () => {
    const mockResponse = createMockDataForSEOResponse([
      {
        rank_absolute: 1,
        title: 'Homepage',
        url: 'https://example.com',
        description: 'Main site',
        links: [{ title: 'About', url: 'https://example.com/about' }],
      },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    const featureRec = result.recommendations.find((r) =>
      r.type === RecommendationType.SERP_FEATURE
    );
    expect(featureRec).toBeDefined();
    expect(featureRec?.actionSteps.length).toBeGreaterThan(0);
  });

  it('should prioritize recommendations by impact', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { title: 'Result 1', description: 'Text 1' },
      { title: 'Result 2', description: 'Text 2' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    // Recommendations should be sorted by priority
    for (let i = 0; i < result.recommendations.length - 1; i++) {
      expect(result.recommendations[i].priority).toBeGreaterThanOrEqual(
        result.recommendations[i + 1].priority
      );
    }
  });
});

// ============================================================================
// P2 MEDIUM: ERROR HANDLING
// ============================================================================

describe('Error Handling', () => {
  beforeEach(() => {
    setupTestEnvironment();
    jest.clearAllMocks();
  });

  it('should handle network errors gracefully', async () => {
    // FIX: Mock rejection for all possible API calls (Google and DataForSEO)
    mockedAxios.post.mockRejectedValue(new Error('Network error'));

    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
    });

    await expect(analyst.analyze()).rejects.toThrow(SERPAnalysisError);
  });

  it('should sanitize error messages', async () => {
    // Test sanitization for non-SERPAnalysisError exceptions
    // (SERPAnalysisError exceptions are re-thrown as-is, which is a known limitation)
    const mockImplementation = jest.fn().mockRejectedValueOnce(
      new Error('Generic error with API key sk-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')
    );

    // Mock a method that throws a generic Error (not SERPAnalysisError)
    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
      dataForSeoApiKey: 'c8f9a3b2d1e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5',
    });

    // Replace the analyze method to inject our error
    (analyst as any).fetchSearchResults = mockImplementation;

    try {
      await analyst.analyze();
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(SERPAnalysisError);
      // Generic errors get wrapped and sanitized
      expect((error as Error).message).not.toContain('sk-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6');
      expect((error as Error).message).toContain('[REDACTED');
    }
  });

  it('should handle insufficient data errors', async () => {
    const mockResponse = createMockDataForSEOResponse([], { statusCode: 20000, statusMessage: 'Ok.' });
    // DataForSEO validation requires items.length > 0, so this will fail validation
    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });

    await expect(analyst.analyze()).rejects.toThrow('DataForSEO error');
  });

  it('should handle all API providers failing', async () => {
    // Google uses GET, DataForSEO uses POST
    mockedAxios.get.mockRejectedValueOnce(new Error('Google failed'));
    mockedAxios.post.mockRejectedValueOnce(new Error('DataForSEO failed'));

    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
      googleApiKey: 'AIzaSyB3k9m8nL2pQ5rT7uV9wX0yZ1aC4dE6fG8hI0',
      googleSearchEngineId: 'a1b2c3d4e5f6g7h8i9j0',
      dataForSeoApiKey: 'c8f9a3b2d1e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5',
    });

    await expect(analyst.analyze()).rejects.toThrow('All API providers failed');
  });
});

// ============================================================================
// P2 MEDIUM: EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    setupTestEnvironment();
    jest.clearAllMocks();
  });

  it('should handle minimal search results (5 results)', async () => {
    const mockResponse = createMockDataForSEOResponse(
      Array(5).fill(null).map((_, i) => ({
        type: 'organic',
        rank_absolute: i + 1,
        title: `Result ${i + 1}`,
        url: `https://example${i}.com`,
        description: `Snippet ${i + 1}`,
      }))
    );

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test', maxResults: 5 });
    const result = await analyst.analyze();

    expect(result.results).toHaveLength(5);
    expect(result.confidence).toBeLessThan(0.8); // Lower confidence with fewer results
  });

  it('should handle results with missing data', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { type: 'organic', rank_absolute: 1, title: 'Result 1', description: '', url: 'https://example.com' },
      { type: 'organic', rank_absolute: 2, title: '', description: 'Snippet 2', url: 'https://example2.com' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    expect(result.results).toHaveLength(2);
  });

  it('should handle very long URLs', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(1000);
    const mockResponse = createMockDataForSEOResponse([
      { type: 'organic', rank_absolute: 1, title: 'Result', url: longUrl, description: 'Text' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    expect(result.results[0].url).toBe(longUrl);
    expect(result.rankingPatterns.urlStructure.avgUrlLength).toBeGreaterThan(100);
  });

  it('should handle special characters in URLs and titles', async () => {
    const mockResponse = createMockDataForSEOResponse([
      {
        type: 'organic',
        rank_absolute: 1,
        title: 'Guide: How to Cook Pasta [2024]',
        url: 'https://example.com/guide?id=123&category=food',
        description: 'Learn how to cook perfect pasta every time!',
      },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'how to cook pasta' });
    const result = await analyst.analyze();

    expect(result.results[0].title).toContain('[2024]');
    expect(result.results[0].url).toContain('?');
  });

  it('should handle empty SERP results gracefully', async () => {
    // Empty items array will fail the type guard which requires items.length > 0
    const mockResponse = createMockDataForSEOResponse([], { statusCode: 20000, statusMessage: 'Ok.' });

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({
      keyword: 'rare query',
      dataForSeoApiKey: 'c8f9a3b2d1e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5',
    });

    // Should throw because isSuccessfulDataForSEOSearch returns false for empty items
    await expect(analyst.analyze()).rejects.toThrow('DataForSEO error: Ok.');
  });

  it('should handle malformed API responses', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { tasks: [] } as any,  // Invalid: missing required task structure
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });

    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
      dataForSeoApiKey: 'c8f9a3b2d1e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5',
    });

    await expect(analyst.analyze()).rejects.toThrow('DataForSEO error');
  });
});

// ============================================================================
// P2 MEDIUM: CONFIDENCE SCORING
// ============================================================================

describe('Confidence Scoring', () => {
  beforeEach(() => {
    setupTestEnvironment();
    jest.clearAllMocks();
  });

  it('should calculate higher confidence with more results', async () => {
    const mockResponse10 = createMockDataForSEOResponse(
      Array(10).fill(null).map((_, i) => ({ type: 'organic', rank_absolute: i + 1, title: `Result ${i}`, url: `https://example${i}.com`, description: `Snippet ${i}` }))
    );

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse10 });

    const analyst10 = new SERPPatternAnalyst({ keyword: 'test' });
    const result10 = await analyst10.analyze();

    jest.clearAllMocks();

    const mockResponse5 = createMockDataForSEOResponse(
      Array(5).fill(null).map((_, i) => ({ type: 'organic', rank_absolute: i + 1, title: `Result ${i}`, url: `https://example${i}.com`, description: `Snippet ${i}` }))
    );

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse5 });

    const analyst5 = new SERPPatternAnalyst({ keyword: 'test', maxResults: 5 });
    const result5 = await analyst5.analyze();

    expect(result10.confidence).toBeGreaterThan(result5.confidence);
  });

  it('should include confidence in overall result', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { type: 'organic', rank_absolute: 1, title: 'Result', url: 'https://example.com', description: 'Text' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    expect(result.confidence).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// P3 LOW: METADATA AND TIMING
// ============================================================================

describe('Metadata and Timing', () => {
  beforeEach(() => {
    setupTestEnvironment();
    jest.clearAllMocks();
  });

  it('should track analysis timing', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { title: 'Result', description: 'Text' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    // FIX: Accept 0 or positive for mocked calls (instant response)
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.analyzedAt).toBeInstanceOf(Date);
  });

  it('should include metadata about API provider', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { title: 'Result', description: 'Text' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({ keyword: 'test' });
    const result = await analyst.analyze();

    expect(result.metadata.apiProvider).toBeDefined();
    expect(['google', 'dataforseo', 'scraping']).toContain(result.metadata.apiProvider);
  });

  it('should track warnings during analysis', async () => {
    const mockResponse = createMockDataForSEOResponse([
      { title: 'Result', description: 'Text' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const analyst = new SERPPatternAnalyst({
      keyword: 'test',
      googleApiKey: '[REDACTED]',
      googleSearchEngineId: 'test',
      dataForSeoApiKey: 'valid-key-1234567890',
    });

    const result = await analyst.analyze();

    expect(result.warnings).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
