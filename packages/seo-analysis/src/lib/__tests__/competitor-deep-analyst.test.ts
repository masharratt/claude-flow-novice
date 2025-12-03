/**
 * Competitor Deep Analyst Agent - Comprehensive Test Suite
 *
 * @module @claude-flow-novice/seo-analysis/__tests__/competitor-deep-analyst
 * @description Complete test coverage including integration, error handling, and edge cases
 * @version 2.0.0
 *
 * Coverage:
 * - End-to-end integration tests with mocked Firecrawl
 * - Error handling (network failures, timeouts, rate limits)
 * - Data scenarios (insufficient pages, empty sites, malformed HTML)
 * - Edge cases (max depth, circular links, rate limiting)
 * - Configuration validation
 * - All helper methods and algorithms
 */

import { CompetitorDeepAnalystAgent } from '../competitor-deep-analyst';
import {
  CompetitorAnalysisConfig,
  CompetitorAnalysisError,
  CompetitorAnalysisErrorCode,
  FirecrawlResponse,
  CrawledPage,
} from '../../types/competitor-analysis';

// ============================================================================
// TEST HELPERS AND MOCKS
// ============================================================================

/**
 * Create mock Firecrawl response
 */
function createMockFirecrawlResponse(
  url: string,
  options: {
    success?: boolean;
    title?: string;
    content?: string;
    links?: string[];
    error?: string;
  } = {}
): FirecrawlResponse {
  if (options.success === false) {
    return {
      success: false,
      error: options.error || 'Mock error',
    };
  }

  return {
    success: true,
    data: {
      content: options.content || `Mock content for ${url}`,
      markdown: options.content || `# ${options.title || 'Mock Page'}\n\nMock content`,
      html: `<html><head><title>${options.title || 'Mock Page'}</title></head><body><h1>${options.title || 'Mock Page'}</h1><p>${options.content || 'Mock content'}</p></body></html>`,
      metadata: {
        title: options.title || 'Mock Page',
        description: 'Mock description',
        language: 'en',
        sourceURL: url,
        statusCode: 200,
      },
      links: options.links || [],
    },
  };
}

/**
 * Create mock crawled page
 */
function createMockPage(url: string, depth: number, overrides: Partial<CrawledPage> = {}): CrawledPage {
  return {
    url,
    title: overrides.title || 'Mock Page',
    metaDescription: overrides.metaDescription,
    content: overrides.content || 'Mock content',
    wordCount: overrides.wordCount || 100,
    headings: overrides.headings || { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
    internalLinks: overrides.internalLinks || [],
    externalLinks: overrides.externalLinks || [],
    images: overrides.images || [],
    schemaTypes: overrides.schemaTypes || [],
    depth,
    crawledAt: overrides.crawledAt || new Date(),
    statusCode: overrides.statusCode || 200,
    loadTimeMs: overrides.loadTimeMs || 100,
    contentType: overrides.contentType || 'other',
    ...overrides,
  };
}

// ============================================================================
// P0 CRITICAL: END-TO-END INTEGRATION TESTS
// ============================================================================

describe('End-to-End Integration Tests', () => {
  describe('Full Analysis Workflow', () => {
    it('should complete full analysis with mocked Firecrawl', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'example.com',
        maxPages: 15,
        maxDepth: 2,
        verbose: false,
      });

      // Mock fetchWithFirecrawl to return realistic crawl results
      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Homepage response with links
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com', {
          title: 'Homepage',
          content: 'Welcome to example.com',
          links: [
            'https://example.com/about',
            'https://example.com/blog',
            'https://example.com/products',
          ],
        })
      );

      // About page
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com/about', {
          title: 'About Us',
          content: 'About our company',
          links: ['https://example.com/contact'],
        })
      );

      // Blog page with articles
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com/blog', {
          title: 'Blog',
          content: 'Our latest articles',
          links: [
            'https://example.com/blog/article-1',
            'https://example.com/blog/article-2',
            'https://example.com/blog/article-3',
          ],
        })
      );

      // Products page
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com/products', {
          title: 'Products',
          content: 'Product catalog',
          links: [
            'https://example.com/products/product-1',
            'https://example.com/products/product-2',
          ],
        })
      );

      // Mock subsequent pages (blog articles and products)
      for (let i = 1; i <= 3; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://example.com/blog/article-${i}`, {
            title: `Article ${i}`,
            content: `Article content ${i}`,
            links: ['https://example.com/blog'],
          })
        );
      }

      for (let i = 1; i <= 2; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://example.com/products/product-${i}`, {
            title: `Product ${i}`,
            content: `Product description ${i}`,
            links: ['https://example.com/products'],
          })
        );
      }

      // Contact page
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com/contact', {
          title: 'Contact',
          content: 'Contact information',
          links: [],
        })
      );

      // Act
      const result = await agent.analyze();

      // Assert - Verify complete analysis structure
      expect(result).toBeDefined();
      expect(result.domain).toBe('example.com');
      expect(result.pagesCrawled).toBeGreaterThanOrEqual(10);
      expect(result.maxDepthReached).toBeLessThanOrEqual(2);

      // Verify architecture patterns extracted
      expect(result.architecturePatterns).toBeDefined();
      expect(Array.isArray(result.architecturePatterns)).toBe(true);

      // Verify content strategy patterns
      expect(result.contentStrategyPatterns).toBeDefined();
      expect(Array.isArray(result.contentStrategyPatterns)).toBe(true);

      // Verify hub pages identified
      expect(result.hubPages).toBeDefined();
      expect(Array.isArray(result.hubPages)).toBe(true);
      expect(result.hubPages.length).toBeGreaterThan(0);

      // Verify internal linking patterns
      expect(result.internalLinkingPatterns).toBeDefined();
      expect(Array.isArray(result.internalLinkingPatterns)).toBe(true);

      // Verify content gaps
      expect(result.contentGaps).toBeDefined();
      expect(Array.isArray(result.contentGaps)).toBe(true);

      // Verify site metrics
      expect(result.siteMetrics).toBeDefined();
      expect(result.siteMetrics.avgPageWordCount).toBeGreaterThan(0);
      expect(result.siteMetrics.avgInternalLinksPerPage).toBeGreaterThan(0);

      // Verify metadata
      expect(result.metadata).toBeDefined();
      expect(result.metadata.confidenceScore).toBeGreaterThan(0);
      expect(result.metadata.confidenceScore).toBeLessThanOrEqual(1);

      // Verify timing
      expect(result.totalTimeMs).toBeGreaterThan(0);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });

    it(
      'should handle large site crawl (50 pages)',
      async () => {
        // Arrange
        const agent = new CompetitorDeepAnalystAgent({
          domain: 'large-site.com',
          maxPages: 50,
          maxDepth: 3,
        });

        const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

        // Mock 50+ page responses with BRANCHING link structure (not linear chain)
        // Each page has 3-5 links to create a realistic but manageable site graph
        for (let i = 0; i < 55; i++) {
          const links: string[] = [];

          // Add 3-5 links per page (realistic website structure)
          const linkCount = 3 + (i % 3); // Varies between 3-5 links
          for (let j = 1; j <= linkCount && (i + j) < 55; j++) {
            links.push(`https://large-site.com/page-${i + j}`);
          }

          // Also add some backlinks to earlier pages (realistic internal linking)
          if (i > 2) {
            links.push(`https://large-site.com/page-${i - 2}`);
          }

          mockFetch.mockResolvedValueOnce(
            createMockFirecrawlResponse(`https://large-site.com/page-${i}`, {
              title: `Page ${i}`,
              content: `Content for page ${i}`,
              links,
            })
          );
        }

        // Act
        const result = await agent.analyze();

        // Assert
        expect(result.pagesCrawled).toBeLessThanOrEqual(50); // Should respect maxPages
        expect(result.pagesCrawled).toBeGreaterThanOrEqual(10); // Should have minimum data
      },
      60000
    ); // 60 second timeout for large crawl
  });
});

// ============================================================================
// P0 CRITICAL: ERROR HANDLING TESTS
// ============================================================================

describe('Error Handling', () => {
  describe('Crawl Failures', () => {
    it('should handle crawl failures gracefully', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'example.com',
        maxPages: 20,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // First page succeeds with links to many pages
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com', {
          title: 'Homepage',
          links: Array.from({ length: 20 }, (_, i) => `https://example.com/page-${i}`),
        })
      );

      // First 10 pages succeed (minimum required)
      for (let i = 0; i < 10; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://example.com/page-${i}`, {
            title: `Page ${i}`,
            links: [],
          })
        );
      }

      // Remaining pages fail (simulating network issues)
      for (let i = 10; i < 20; i++) {
        mockFetch.mockResolvedValueOnce({
          success: false,
          error: 'Network error: Connection timeout',
        });
      }

      // Act
      const result = await agent.analyze();

      // Assert - Should complete with at least 10 pages and errors logged
      expect(result).toBeDefined();
      expect(result.pagesCrawled).toBeGreaterThanOrEqual(10);
      expect(result.metadata.errorsEncountered).toBeDefined();
      expect(result.metadata.errorsEncountered.length).toBeGreaterThan(0);
      expect(result.metadata.errorsEncountered.some(e => e.includes('Failed to crawl'))).toBe(true);
    });

    it('should throw error when insufficient pages crawled', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'example.com',
        maxPages: 50,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Only 2 pages succeed (below minimum of 10)
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com', {
          links: ['https://example.com/page-1'],
        })
      );
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com/page-1', {
          links: [],
        })
      );

      // Act & Assert
      await expect(agent.analyze()).rejects.toThrow(CompetitorAnalysisError);
      await expect(agent.analyze()).rejects.toThrow('Only crawled 2 pages');
    });

    it('should throw error when no pages crawled', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'example.com',
        maxPages: 50,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // All fetches fail
      mockFetch.mockResolvedValue({
        success: false,
        error: 'All requests failed',
      });

      // Act & Assert
      await expect(agent.analyze()).rejects.toThrow(CompetitorAnalysisError);
      await expect(agent.analyze()).rejects.toThrow('No pages were successfully crawled');
    });
  });

  describe('Network Errors', () => {
    it('should handle network timeout errors', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'example.com',
        maxPages: 20,
        requestTimeoutMs: 5000,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Simulate timeout on homepage
      mockFetch.mockRejectedValueOnce(new Error('Request timeout after 5000ms'));

      // Act & Assert
      await expect(agent.analyze()).rejects.toThrow();
    });

    it('should handle DNS resolution failures', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'nonexistent-domain-xyz123.com',
        maxPages: 20,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');
      mockFetch.mockRejectedValue(new Error('DNS resolution failed: ENOTFOUND'));

      // Act & Assert
      await expect(agent.analyze()).rejects.toThrow();
    });

    it('should handle HTTP error responses (4xx, 5xx)', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'example.com',
        maxPages: 20,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // First page works with links
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com', {
          links: Array.from({ length: 20 }, (_, i) => `https://example.com/page-${i}`),
        })
      );

      // First 10 pages succeed (minimum required)
      for (let i = 0; i < 10; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://example.com/page-${i}`, {
            links: [],
          })
        );
      }

      // Remaining requests return HTTP errors
      for (let i = 10; i < 20; i++) {
        mockFetch.mockResolvedValueOnce({
          success: false,
          error: 'HTTP 404: Page not found',
        });
      }

      // Act
      const result = await agent.analyze();

      // Assert
      expect(result.pagesCrawled).toBeGreaterThanOrEqual(10);
      expect(result.metadata.errorsEncountered.length).toBeGreaterThan(0);
    });
  });

  describe('Rate Limit Handling', () => {
    it('should handle rate limit errors from Firecrawl API', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'example.com',
        maxPages: 20,
        rateLimitMs: 100,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Homepage with links
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com', {
          links: Array.from({ length: 20 }, (_, i) => `https://example.com/page-${i}`),
        })
      );

      // First 7 pages succeed
      for (let i = 0; i < 7; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://example.com/page-${i}`, {
            links: [`https://example.com/page-${i + 10}`],
          })
        );
      }

      // Then rate limit hit (3 failures)
      for (let i = 7; i < 10; i++) {
        mockFetch.mockResolvedValueOnce({
          success: false,
          error: 'Rate limit exceeded: 429 Too Many Requests',
        });
      }

      // Then recover with more successful pages
      for (let i = 10; i < 13; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://example.com/page-${i}`, {
            links: [],
          })
        );
      }

      // Act
      const result = await agent.analyze();

      // Assert - Should have at least 10 successful pages with errors logged
      expect(result.pagesCrawled).toBeGreaterThanOrEqual(10);
      expect(result.metadata.errorsEncountered.length).toBeGreaterThan(0);
      expect(result.metadata.errorsEncountered.some(e => e.includes('Rate limit') || e.includes('429'))).toBe(true);
    });

    it('should respect rate limiting configuration', async () => {
      // Arrange
      const rateLimitMs = 200;
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'example.com',
        maxPages: 12,
        rateLimitMs,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');
      const mockSleep = jest.spyOn(agent as any, 'sleep');

      // Homepage with links
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://example.com', {
          links: Array.from({ length: 12 }, (_, i) => `https://example.com/page-${i}`),
        })
      );

      // Mock 12 successful fetches
      for (let i = 0; i < 12; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://example.com/page-${i}`, {
            links: [],
          })
        );
      }

      // Act
      await agent.analyze();

      // Assert - Sleep should be called with rate limit value
      expect(mockSleep).toHaveBeenCalled();
      expect(mockSleep).toHaveBeenCalledWith(rateLimitMs);
    });
  });

  describe('API Configuration Errors', () => {
    it('should throw error when Firecrawl API key missing', async () => {
      // Arrange
      const originalKey = process.env.FIRECRAWL_API_KEY;
      delete process.env.FIRECRAWL_API_KEY;

      // Act & Assert - Constructor should throw when API key missing
      expect(() => {
        new CompetitorDeepAnalystAgent({
          domain: 'example.com',
          maxPages: 20,
        });
      }).toThrow(CompetitorAnalysisError);

      expect(() => {
        new CompetitorDeepAnalystAgent({
          domain: 'example.com',
          maxPages: 20,
        });
      }).toThrow('FIRECRAWL_API_KEY not configured');

      // Cleanup
      if (originalKey) process.env.FIRECRAWL_API_KEY = originalKey;
    });
  });
});

// ============================================================================
// P1 HIGH: DATA SCENARIO TESTS
// ============================================================================

describe('Data Scenarios', () => {
  describe('Insufficient Data', () => {
    it('should handle site with less than 10 pages', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'small-site.com',
        maxPages: 50,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Homepage linking to only 4 other pages (total 5 pages < 10 minimum)
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://small-site.com', {
          links: Array.from({ length: 4 }, (_, i) => `https://small-site.com/page-${i}`),
        })
      );

      // Only 4 additional pages available (total 5 pages)
      for (let i = 0; i < 4; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://small-site.com/page-${i}`, {
            links: [], // No more links to follow
          })
        );
      }

      // Act & Assert - Should throw INSUFFICIENT_DATA because only 5 pages exist
      await expect(agent.analyze()).rejects.toThrow(CompetitorAnalysisError);
    });

    it('should handle empty site (homepage only)', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'empty-site.com',
        maxPages: 50,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://empty-site.com', {
          links: [], // No outgoing links
        })
      );

      // Act & Assert
      await expect(agent.analyze()).rejects.toThrow('Only crawled 1 pages');
    });
  });

  describe('Malformed HTML', () => {
    it('should handle pages with malformed HTML gracefully', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'malformed-site.com',
        maxPages: 15,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Homepage with valid HTML
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://malformed-site.com', {
          links: Array.from({ length: 10 }, (_, i) => `https://malformed-site.com/page-${i}`),
        })
      );

      // Pages with malformed/empty HTML
      for (let i = 0; i < 10; i++) {
        mockFetch.mockResolvedValueOnce({
          success: true,
          data: {
            content: '',
            markdown: '',
            html: '<html><body><h1>Broken', // Unclosed tags
            metadata: {
              title: '',
              sourceURL: `https://malformed-site.com/page-${i}`,
              statusCode: 200,
            },
            links: [],
          },
        });
      }

      // Act
      const result = await agent.analyze();

      // Assert - Should handle gracefully
      expect(result).toBeDefined();
      expect(result.pagesCrawled).toBeGreaterThanOrEqual(10);
    });

    it('should handle pages with invalid JSON-LD schema', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'invalid-schema.com',
        maxPages: 15,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Homepage with links to 12 pages
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://invalid-schema.com', {
          links: Array.from({ length: 12 }, (_, i) => `https://invalid-schema.com/page-${i}`),
        })
      );

      // 12 pages with invalid JSON-LD schema
      for (let i = 0; i < 12; i++) {
        mockFetch.mockResolvedValueOnce({
          success: true,
          data: {
            content: `Content for page ${i}`,
            html: '<script type="application/ld+json">{ invalid json</script>',
            metadata: {
              title: `Page ${i}`,
              sourceURL: `https://invalid-schema.com/page-${i}`,
              statusCode: 200,
            },
            links: [],
          },
        });
      }

      // Act - Should not throw, just log warning
      const result = await agent.analyze();

      // Assert
      expect(result.pagesCrawled).toBeGreaterThanOrEqual(10);
    });
  });
});

// ============================================================================
// P1 HIGH: EDGE CASE TESTS
// ============================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = 'test-mock-key-for-edge-case-tests';
  });

  afterEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
  });

  describe('Maximum Depth Boundary', () => {
    it('should respect maximum depth limit', async () => {
      // Arrange
      const maxDepth = 2;
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'deep-site.com',
        maxPages: 50,
        maxDepth,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Homepage (depth 0) with 12 links to depth-1 pages
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://deep-site.com', {
          links: Array.from({ length: 12 }, (_, i) => `https://deep-site.com/depth-1/page-${i}`),
        })
      );

      // Depth 1 pages (12 pages) - each links to depth-2 pages
      for (let i = 0; i < 12; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://deep-site.com/depth-1/page-${i}`, {
            links: [`https://deep-site.com/depth-2/page-${i}`],
          })
        );
      }

      // Depth 2 pages (should stop here due to maxDepth=2)
      for (let i = 0; i < 12; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://deep-site.com/depth-2/page-${i}`, {
            links: [`https://deep-site.com/depth-3/page-${i}`], // These shouldn't be followed
          })
        );
      }

      // Act
      const result = await agent.analyze();

      // Assert - Should not exceed maxDepth and should crawl at least 10 pages
      expect(result.pagesCrawled).toBeGreaterThanOrEqual(10);
      expect(result.maxDepthReached).toBeLessThanOrEqual(maxDepth);
    });

    it('should handle depth=1 (shallow crawl)', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'shallow-site.com',
        maxPages: 20,
        maxDepth: 1,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Homepage with many links
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://shallow-site.com', {
          links: Array.from({ length: 20 }, (_, i) => `https://shallow-site.com/page-${i}`),
        })
      );

      // First level pages
      for (let i = 0; i < 20; i++) {
        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://shallow-site.com/page-${i}`, {
            links: [],
          })
        );
      }

      // Act
      const result = await agent.analyze();

      // Assert
      expect(result.maxDepthReached).toBe(1);
    });
  });

  describe('Circular Link Detection', () => {
    it('should detect and handle circular links without infinite loop', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'circular-site.com',
        maxPages: 20,
        maxDepth: 3,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Create a circular graph with 12 pages (minimum 10 required)
      // Page 0 (homepage) -> pages 1, 2, 3
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://circular-site.com', {
          links: [
            'https://circular-site.com/page-1',
            'https://circular-site.com/page-2',
            'https://circular-site.com/page-3',
          ],
        })
      );

      // Page 1 links back to homepage and to page 4
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://circular-site.com/page-1', {
          links: ['https://circular-site.com', 'https://circular-site.com/page-4'],
        })
      );

      // Page 2 links to pages 5 and 6
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://circular-site.com/page-2', {
          links: ['https://circular-site.com/page-5', 'https://circular-site.com/page-6'],
        })
      );

      // Page 3 links to pages 7 and 8
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://circular-site.com/page-3', {
          links: ['https://circular-site.com/page-7', 'https://circular-site.com/page-8'],
        })
      );

      // Pages 4-11 create circular references back to earlier pages
      for (let i = 4; i <= 11; i++) {
        const links: string[] = [];
        // Each page links back to an earlier page (circular reference)
        if (i > 4) links.push(`https://circular-site.com/page-${i - 2}`);
        // Also link to homepage to create more circular paths
        if (i % 2 === 0) links.push('https://circular-site.com');
        // Last page links to page 1 to complete the circle
        if (i === 11) links.push('https://circular-site.com/page-1');

        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://circular-site.com/page-${i}`, {
            links,
          })
        );
      }

      // Act
      const result = await agent.analyze();

      // Assert - Should visit each page only once despite circular links
      // Agent will crawl at least 10 pages (minimum required)
      expect(result.pagesCrawled).toBeGreaterThanOrEqual(10);
      expect(result.pagesCrawled).toBeLessThanOrEqual(12);
      // Verify no page was crawled more than once (circular detection working)
      const urls = result.pages.map(p => p.url);
      const uniqueUrls = new Set(urls);
      expect(uniqueUrls.size).toBe(urls.length);
    });

    it('should handle self-referencing pages', async () => {
      // Arrange
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'self-ref.com',
        maxPages: 15,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Homepage with self-reference and links to multiple pages
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://self-ref.com', {
          links: [
            'https://self-ref.com', // Self-reference
            'https://self-ref.com/page-1',
            'https://self-ref.com/page-2',
            'https://self-ref.com/page-3',
            'https://self-ref.com/page-4',
          ],
        })
      );

      // Pages that link to themselves and create branching paths
      for (let i = 1; i <= 14; i++) {
        const url = `https://self-ref.com/page-${i}`;
        const links: string[] = [url]; // Self-reference

        // Add branching links to create enough unique pages
        if (i < 14) {
          links.push(`https://self-ref.com/page-${i + 1}`);
        }
        // Also add links to multiple other pages to ensure breadth
        if (i === 1) {
          links.push('https://self-ref.com/page-5');
          links.push('https://self-ref.com/page-6');
        }
        if (i === 2) {
          links.push('https://self-ref.com/page-7');
          links.push('https://self-ref.com/page-8');
        }

        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(url, {
            links,
          })
        );
      }

      // Act
      const result = await agent.analyze();

      // Assert - Should not get stuck in loops, should crawl at least 10 unique pages
      expect(result.pagesCrawled).toBeGreaterThanOrEqual(10);
      // Verify no page was crawled more than once (self-reference detection working)
      const urls = result.pages.map(p => p.url);
      const uniqueUrls = new Set(urls);
      expect(uniqueUrls.size).toBe(urls.length);
    });
  });

  describe('Page Limit Enforcement', () => {
    it('should stop crawling when maxPages reached', async () => {
      // Arrange
      const maxPages = 15;
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'unlimited-site.com',
        maxPages,
      });

      const mockFetch = jest.spyOn(agent as any, 'fetchWithFirecrawl');

      // Create branching structure (not linear) to ensure crawling continues
      // Homepage links to 5 top-level pages
      mockFetch.mockResolvedValueOnce(
        createMockFirecrawlResponse('https://unlimited-site.com', {
          links: [
            'https://unlimited-site.com/page-1',
            'https://unlimited-site.com/page-2',
            'https://unlimited-site.com/page-3',
            'https://unlimited-site.com/page-4',
            'https://unlimited-site.com/page-5',
          ],
        })
      );

      // Mock 50 more pages in branching structure
      for (let i = 1; i <= 50; i++) {
        const links: string[] = [];
        // Each page links to 2-3 subsequent pages
        for (let j = 1; j <= 2; j++) {
          links.push(`https://unlimited-site.com/page-${i + (j * 5)}`);
        }

        mockFetch.mockResolvedValueOnce(
          createMockFirecrawlResponse(`https://unlimited-site.com/page-${i}`, {
            links,
          })
        );
      }

      // Act
      const result = await agent.analyze();

      // Assert - Should stop at maxPages
      expect(result.pagesCrawled).toBe(maxPages);
      expect(mockFetch).toHaveBeenCalledTimes(maxPages);
    });
  });
});

// ============================================================================
// CONFIGURATION VALIDATION TESTS (from planning/seo)
// ============================================================================

describe('Configuration Validation', () => {
  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = 'test-mock-key-for-config-tests';
  });

  afterEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
  });

  it('should throw error for missing domain', () => {
    expect(() => {
      new CompetitorDeepAnalystAgent({ domain: '' } as CompetitorAnalysisConfig);
    }).toThrow(CompetitorAnalysisError);
  });

  it('should throw error for invalid domain type', () => {
    expect(() => {
      new CompetitorDeepAnalystAgent({ domain: null as unknown as string });
    }).toThrow(CompetitorAnalysisError);
  });

  it('should throw error for maxPages < 10', () => {
    expect(() => {
      new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 5 });
    }).toThrow(CompetitorAnalysisError);
  });

  it('should throw error for invalid maxDepth', () => {
    expect(() => {
      new CompetitorDeepAnalystAgent({ domain: 'example.com', maxDepth: 0 });
    }).toThrow(CompetitorAnalysisError);

    expect(() => {
      new CompetitorDeepAnalystAgent({ domain: 'example.com', maxDepth: 10 });
    }).toThrow(CompetitorAnalysisError);
  });

  it('should normalize domain by removing protocol', () => {
    const agent = new CompetitorDeepAnalystAgent({
      domain: 'https://example.com/',
      maxPages: 10,
    });

    expect((agent as any).config.domain).toBe('example.com');
  });

  it('should add warning for maxPages > 200', () => {
    const agent = new CompetitorDeepAnalystAgent({
      domain: 'example.com',
      maxPages: 250,
    });

    expect((agent as any).warnings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// HELPER METHOD TESTS
// ============================================================================

describe('Helper Methods', () => {
  let agent: CompetitorDeepAnalystAgent;

  beforeEach(() => {
    // Set mock API key for helper method tests that don't need real API calls
    process.env.FIRECRAWL_API_KEY = 'test-mock-key-for-helper-tests';
    agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });
  });

  afterEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
  });

  describe('URL Pattern Extraction', () => {
    it('should extract pattern with numeric IDs', () => {
      const pattern = (agent as any).extractUrlPattern('https://example.com/blog/123');
      expect(pattern).toBe('/blog/{id}');
    });

    it('should extract pattern with slugs', () => {
      const pattern = (agent as any).extractUrlPattern('https://example.com/articles/my-article');
      expect(pattern).toBe('/articles/{slug}');
    });

    it('should extract pattern with UUIDs', () => {
      const pattern = (agent as any).extractUrlPattern(
        'https://example.com/page/550e8400-e29b-41d4-a716-446655440000'
      );
      expect(pattern).toBe('/page/{uuid}');
    });
  });

  describe('Content Type Classification', () => {
    it('should classify homepage', () => {
      expect((agent as any).classifyContentType('https://example.com/')).toBe('homepage');
    });

    it('should classify blog posts', () => {
      expect((agent as any).classifyContentType('https://example.com/blog/my-post')).toBe('blog');
    });

    it('should classify product pages', () => {
      expect((agent as any).classifyContentType('https://example.com/products/widget')).toBe('product');
    });
  });

  describe('Internal Link Detection', () => {
    it('should identify internal links', () => {
      expect((agent as any).isInternalLink('https://example.com/page')).toBe(true);
      expect((agent as any).isInternalLink('https://www.example.com/page')).toBe(true);
    });

    it('should identify external links', () => {
      expect((agent as any).isInternalLink('https://other-domain.com/page')).toBe(false);
    });
  });
});
