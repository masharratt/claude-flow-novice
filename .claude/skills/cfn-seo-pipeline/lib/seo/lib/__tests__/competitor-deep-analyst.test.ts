/**
 * Competitor Deep Analyst Agent - Unit Tests
 *
 * @module planning/seo/lib/__tests__/competitor-deep-analyst
 * @description Comprehensive test suite for CompetitorDeepAnalystAgent
 */

import { CompetitorDeepAnalystAgent } from '../competitor-deep-analyst';
import {
  CompetitorAnalysisConfig,
  CompetitorAnalysisError,
  CompetitorAnalysisErrorCode,
  isSuccessfulCrawl,
  isHubPage,
  isHighPriorityGap,
  isHighConfidencePattern,
} from '../../types/competitor-analysis';

describe('CompetitorDeepAnalystAgent', () => {
  describe('Configuration Validation', () => {
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

    it('should accept valid configuration', () => {
      expect(() => {
        new CompetitorDeepAnalystAgent({
          domain: 'example.com',
          maxPages: 50,
          maxDepth: 3,
          verbose: true,
        });
      }).not.toThrow();
    });
  });

  describe('Configuration Defaults', () => {
    it('should apply default values for optional config', () => {
      const agent = new CompetitorDeepAnalystAgent({ domain: 'example.com' });
      const config = (agent as any).config;

      expect(config.maxPages).toBe(50);
      expect(config.maxDepth).toBe(3);
      expect(config.verbose).toBe(false);
      expect(config.rateLimitMs).toBe(1000);
      expect(config.requestTimeoutMs).toBe(30000);
    });

    it('should override defaults with provided values', () => {
      const agent = new CompetitorDeepAnalystAgent({
        domain: 'example.com',
        maxPages: 100,
        maxDepth: 4,
        verbose: true,
        rateLimitMs: 500,
      });

      const config = (agent as any).config;

      expect(config.maxPages).toBe(100);
      expect(config.maxDepth).toBe(4);
      expect(config.verbose).toBe(true);
      expect(config.rateLimitMs).toBe(500);
    });
  });

  describe('URL Pattern Extraction', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });
    });

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

    it('should extract pattern with HTML extension', () => {
      const pattern = (agent as any).extractUrlPattern('https://example.com/docs/guide.html');
      expect(pattern).toBe('/docs/{slug}.html');
    });
  });

  describe('Content Type Classification', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });
    });

    it('should classify homepage', () => {
      expect((agent as any).classifyContentType('https://example.com/')).toBe('homepage');
      expect((agent as any).classifyContentType('https://example.com')).toBe('homepage');
    });

    it('should classify blog posts', () => {
      expect((agent as any).classifyContentType('https://example.com/blog/my-post')).toBe('blog');
    });

    it('should classify product pages', () => {
      expect((agent as any).classifyContentType('https://example.com/products/widget')).toBe('product');
    });

    it('should classify guide pages', () => {
      expect((agent as any).classifyContentType('https://example.com/guides/getting-started')).toBe('guide');
      expect((agent as any).classifyContentType('https://example.com/tutorials/advanced')).toBe('guide');
    });

    it('should classify documentation', () => {
      expect((agent as any).classifyContentType('https://example.com/docs/api')).toBe('documentation');
    });

    it('should classify other pages', () => {
      expect((agent as any).classifyContentType('https://example.com/random-page')).toBe('other');
    });
  });

  describe('Internal Link Detection', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });
    });

    it('should identify internal links', () => {
      expect((agent as any).isInternalLink('https://example.com/page')).toBe(true);
      expect((agent as any).isInternalLink('https://www.example.com/page')).toBe(true);
      expect((agent as any).isInternalLink('/relative-path')).toBe(true);
    });

    it('should identify external links', () => {
      expect((agent as any).isInternalLink('https://other-domain.com/page')).toBe(false);
      expect((agent as any).isInternalLink('https://example.org')).toBe(false);
    });
  });

  describe('Hub Page Identification', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });

      // Mock crawled pages
      (agent as any).crawledPages = new Map([
        [
          'https://example.com/hub',
          {
            url: 'https://example.com/hub',
            title: 'Hub Page',
            content: 'Hub content '.repeat(500),
            wordCount: 2000,
            depth: 1,
            internalLinks: Array(15).fill('https://example.com/page'),
            externalLinks: [],
            images: [],
            headings: { h1: ['Hub'], h2: [], h3: [], h4: [], h5: [], h6: [] },
            schemaTypes: [],
            contentType: 'hub',
            crawledAt: new Date(),
            statusCode: 200,
            loadTimeMs: 100,
          },
        ],
        [
          'https://example.com/regular',
          {
            url: 'https://example.com/regular',
            title: 'Regular Page',
            content: 'Regular content',
            wordCount: 500,
            depth: 2,
            internalLinks: ['https://example.com/hub'],
            externalLinks: [],
            images: [],
            headings: { h1: ['Regular'], h2: [], h3: [], h4: [], h5: [], h6: [] },
            schemaTypes: [],
            contentType: 'blog',
            crawledAt: new Date(),
            statusCode: 200,
            loadTimeMs: 100,
          },
        ],
      ]);
    });

    it('should identify hub pages', () => {
      const hubPages = (agent as any).identifyHubPages();

      expect(hubPages.length).toBeGreaterThan(0);
      expect(hubPages[0].url).toBe('https://example.com/hub');
      expect(hubPages[0].incomingLinkCount).toBe(1);
      expect(hubPages[0].outgoingLinkCount).toBe(15);
    });

    it('should calculate hub scores correctly', () => {
      const score = (agent as any).calculateHubScore({
        incomingLinkCount: 10,
        outgoingLinkCount: 15,
        depth: 1,
        wordCount: 2000,
      });

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should classify hub types', () => {
      const topical = (agent as any).classifyHubType({
        depth: 1,
        wordCount: 3000,
        internalLinks: Array(20).fill(''),
        externalLinks: [],
      });
      expect(topical).toBe('topical');

      const navigational = (agent as any).classifyHubType({
        depth: 0,
        wordCount: 500,
        internalLinks: Array(10).fill(''),
        externalLinks: [],
      });
      expect(navigational).toBe('navigational');
    });
  });

  describe('Pattern Extraction', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });

      // Mock crawled pages with patterns
      const mockPages = new Map();
      for (let i = 0; i < 5; i++) {
        mockPages.set(`https://example.com/blog/post-${i}`, {
          url: `https://example.com/blog/post-${i}`,
          title: `Blog Post ${i}`,
          content: 'Blog content '.repeat(200),
          wordCount: 1000,
          depth: 2,
          internalLinks: [],
          externalLinks: [],
          images: [],
          headings: { h1: [`Post ${i}`], h2: ['Section 1', 'Section 2'], h3: [], h4: [], h5: [], h6: [] },
          schemaTypes: ['Article'],
          contentType: 'blog',
          crawledAt: new Date(),
          statusCode: 200,
          loadTimeMs: 100,
        });
      }

      (agent as any).crawledPages = mockPages;
    });

    it('should extract architecture patterns', () => {
      const patterns = (agent as any).extractArchitecturePatterns();

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].urlStructure).toContain('/blog/{slug}');
      expect(patterns[0].prevalence).toBe(5);
    });

    it('should extract content strategy patterns', () => {
      const patterns = (agent as any).extractContentStrategyPatterns();

      expect(patterns.length).toBeGreaterThan(0);
      const blogPattern = patterns.find((p: any) => p.contentType === 'blog');
      expect(blogPattern).toBeDefined();
      expect(blogPattern.pageCount).toBe(5);
      expect(blogPattern.avgWordCount).toBe(1000);
    });

    it('should extract heading structures', () => {
      const pages = Array.from((agent as any).crawledPages.values());
      const structures = (agent as any).extractHeadingStructures(pages);

      expect(structures.length).toBeGreaterThan(0);
      expect(structures[0]).toContain('h1:1');
      expect(structures[0]).toContain('h2:2');
    });
  });

  describe('Internal Linking Analysis', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });

      // Mock pages with internal linking patterns
      (agent as any).crawledPages = new Map([
        [
          'https://example.com/blog-1',
          {
            url: 'https://example.com/blog-1',
            title: 'Blog 1',
            content: 'Content',
            wordCount: 500,
            depth: 2,
            internalLinks: ['https://example.com/product-1', 'https://example.com/product-2'],
            externalLinks: [],
            images: [],
            headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
            schemaTypes: [],
            contentType: 'blog',
            crawledAt: new Date(),
            statusCode: 200,
            loadTimeMs: 100,
          },
        ],
        [
          'https://example.com/blog-2',
          {
            url: 'https://example.com/blog-2',
            title: 'Blog 2',
            content: 'Content',
            wordCount: 500,
            depth: 2,
            internalLinks: ['https://example.com/product-1'],
            externalLinks: [],
            images: [],
            headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
            schemaTypes: [],
            contentType: 'blog',
            crawledAt: new Date(),
            statusCode: 200,
            loadTimeMs: 100,
          },
        ],
        [
          'https://example.com/product-1',
          {
            url: 'https://example.com/product-1',
            title: 'Product 1',
            content: 'Content',
            wordCount: 500,
            depth: 2,
            internalLinks: [],
            externalLinks: [],
            images: [],
            headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
            schemaTypes: [],
            contentType: 'product',
            crawledAt: new Date(),
            statusCode: 200,
            loadTimeMs: 100,
          },
        ],
        [
          'https://example.com/product-2',
          {
            url: 'https://example.com/product-2',
            title: 'Product 2',
            content: 'Content',
            wordCount: 500,
            depth: 2,
            internalLinks: [],
            externalLinks: [],
            images: [],
            headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
            schemaTypes: [],
            contentType: 'product',
            crawledAt: new Date(),
            statusCode: 200,
            loadTimeMs: 100,
          },
        ],
      ]);
    });

    it('should analyze internal linking patterns', () => {
      const patterns = (agent as any).analyzeInternalLinkingPatterns();

      expect(patterns.length).toBeGreaterThan(0);

      const blogToProduct = patterns.find((p: any) => p.patternType === 'blog->product');
      expect(blogToProduct).toBeDefined();
      expect(blogToProduct.instanceCount).toBe(3);
    });
  });

  describe('Content Gap Identification', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });

      // Mock pages with unbalanced content types
      const mockPages = new Map();
      for (let i = 0; i < 8; i++) {
        mockPages.set(`https://example.com/blog-${i}`, {
          url: `https://example.com/blog-${i}`,
          title: `Blog ${i}`,
          content: 'Content',
          wordCount: 500,
          depth: 2,
          internalLinks: [],
          externalLinks: [],
          images: [],
          headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
          schemaTypes: [],
          contentType: 'blog',
          crawledAt: new Date(),
          statusCode: 200,
          loadTimeMs: 100,
        });
      }

      mockPages.set('https://example.com/guide', {
        url: 'https://example.com/guide',
        title: 'Guide',
        content: 'Content',
        wordCount: 500,
        depth: 2,
        internalLinks: [],
        externalLinks: [],
        images: [],
        headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
        schemaTypes: [],
        contentType: 'guide',
        crawledAt: new Date(),
        statusCode: 200,
        loadTimeMs: 100,
      });

      (agent as any).crawledPages = mockPages;
    });

    it('should identify content gaps', () => {
      const gaps = (agent as any).identifyContentGaps();

      expect(gaps.length).toBeGreaterThan(0);

      const guideGap = gaps.find((g: any) => g.topic === 'guide');
      expect(guideGap).toBeDefined();
      expect(guideGap.gapType).toBe('thin_content');
      expect(guideGap.priority).toBe('high');
    });
  });

  describe('Site Metrics Calculation', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });

      (agent as any).crawledPages = new Map([
        [
          'https://example.com/page-1',
          {
            url: 'https://example.com/page-1',
            title: 'Page 1',
            content: 'Content',
            wordCount: 1000,
            depth: 1,
            internalLinks: Array(10).fill(''),
            externalLinks: Array(5).fill(''),
            images: Array(3).fill({ src: '', alt: '' }),
            headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
            schemaTypes: ['Article'],
            contentType: 'blog',
            crawledAt: new Date(),
            statusCode: 200,
            loadTimeMs: 200,
          },
        ],
        [
          'https://example.com/page-2',
          {
            url: 'https://example.com/page-2',
            title: 'Page 2',
            content: 'Content',
            wordCount: 2000,
            depth: 2,
            internalLinks: Array(15).fill(''),
            externalLinks: Array(3).fill(''),
            images: Array(5).fill({ src: '', alt: '' }),
            headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
            schemaTypes: [],
            contentType: 'guide',
            crawledAt: new Date(),
            statusCode: 200,
            loadTimeMs: 300,
          },
        ],
      ]);
    });

    it('should calculate site metrics correctly', () => {
      const metrics = (agent as any).calculateSiteMetrics();

      expect(metrics.avgPageWordCount).toBe(1500);
      expect(metrics.avgInternalLinksPerPage).toBeGreaterThan(0);
      expect(metrics.avgExternalLinksPerPage).toBeGreaterThan(0);
      expect(metrics.avgImagesPerPage).toBeGreaterThan(0);
      expect(metrics.avgLoadTimeMs).toBe(250);
      expect(metrics.schemaImplementationRate).toBe(0.5);
    });
  });

  describe('Topic Extraction', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 10 });
    });

    it('should extract topics from page content', () => {
      const page = {
        title: 'TypeScript Advanced Patterns Tutorial',
        headings: {
          h1: ['TypeScript Advanced Patterns'],
          h2: ['Generics', 'Decorators', 'TypeScript Utility Types'],
          h3: [],
          h4: [],
          h5: [],
          h6: [],
        },
        content: '',
        wordCount: 0,
        url: '',
        depth: 0,
        internalLinks: [],
        externalLinks: [],
        images: [],
        schemaTypes: [],
        contentType: '',
        crawledAt: new Date(),
        statusCode: 200,
        loadTimeMs: 0,
      };

      const topics = (agent as any).extractTopics(page);

      expect(topics.length).toBeGreaterThan(0);
      expect(topics).toContain('typescript');
    });

    it('should filter out stop words', () => {
      const page = {
        title: 'The Quick Brown Fox',
        headings: {
          h1: ['The Quick Brown Fox'],
          h2: ['A Story About The Fox'],
          h3: [],
          h4: [],
          h5: [],
          h6: [],
        },
        content: '',
        wordCount: 0,
        url: '',
        depth: 0,
        internalLinks: [],
        externalLinks: [],
        images: [],
        schemaTypes: [],
        contentType: '',
        crawledAt: new Date(),
        statusCode: 200,
        loadTimeMs: 0,
      };

      const topics = (agent as any).extractTopics(page);

      expect(topics).not.toContain('the');
      expect(topics).not.toContain('about');
    });
  });

  describe('Overall Confidence Calculation', () => {
    let agent: CompetitorDeepAnalystAgent;

    beforeEach(() => {
      agent = new CompetitorDeepAnalystAgent({ domain: 'example.com', maxPages: 50 });
    });

    it('should calculate confidence based on data completeness', () => {
      // Mock 50 pages crawled (100% completion)
      for (let i = 0; i < 50; i++) {
        (agent as any).crawledPages.set(`https://example.com/page-${i}`, {
          url: `https://example.com/page-${i}`,
          title: `Page ${i}`,
          content: 'Content',
          wordCount: 500,
          depth: 1,
          internalLinks: [],
          externalLinks: [],
          images: [],
          headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
          schemaTypes: [],
          contentType: 'blog',
          crawledAt: new Date(),
          statusCode: 200,
          loadTimeMs: 100,
        });
      }

      const confidence = (agent as any).calculateOverallConfidence();

      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should reduce confidence with errors', () => {
      // Mock 25 pages and 10 errors
      for (let i = 0; i < 25; i++) {
        (agent as any).crawledPages.set(`https://example.com/page-${i}`, {
          url: `https://example.com/page-${i}`,
          title: `Page ${i}`,
          content: 'Content',
          wordCount: 500,
          depth: 1,
          internalLinks: [],
          externalLinks: [],
          images: [],
          headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
          schemaTypes: [],
          contentType: 'blog',
          crawledAt: new Date(),
          statusCode: 200,
          loadTimeMs: 100,
        });
      }

      (agent as any).errors = Array(10).fill('Error');

      const confidence = (agent as any).calculateOverallConfidence();

      expect(confidence).toBeLessThan(0.7);
    });
  });

  describe('Type Guards', () => {
    it('should check successful crawl results', () => {
      const success = {
        success: true,
        page: {
          url: 'https://example.com',
          title: 'Example',
          content: '',
          wordCount: 0,
          depth: 0,
          internalLinks: [],
          externalLinks: [],
          images: [],
          headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
          schemaTypes: [],
          contentType: 'blog',
          crawledAt: new Date(),
          statusCode: 200,
          loadTimeMs: 100,
        },
      };

      expect(isSuccessfulCrawl(success)).toBe(true);

      const failure = { success: false, error: { message: 'Error', url: '' } };
      expect(isSuccessfulCrawl(failure)).toBe(false);
    });

    it('should check hub pages by confidence', () => {
      const hub = {
        url: '',
        title: '',
        incomingLinkCount: 10,
        outgoingLinkCount: 10,
        centralityScore: 0.9,
        depth: 1,
        contentType: 'blog',
        hubType: 'topical' as const,
        topics: [],
        confidence: 0.85,
      };

      expect(isHubPage(hub, 0.75)).toBe(true);
      expect(isHubPage(hub, 0.9)).toBe(false);
    });

    it('should check high priority gaps', () => {
      const highPriority = {
        gapType: 'missing_topic' as const,
        topic: 'test',
        opportunityScore: 0.8,
        competitorCoverage: 0,
        recommendedContentType: 'blog',
        priority: 'high' as const,
        reasoning: 'Test',
      };

      expect(isHighPriorityGap(highPriority)).toBe(true);

      const lowPriority = { ...highPriority, priority: 'low' as const };
      expect(isHighPriorityGap(lowPriority)).toBe(false);
    });

    it('should check high confidence patterns', () => {
      const pattern = {
        urlStructure: '/blog/{slug}',
        prevalence: 10,
        examples: [],
        confidence: 0.85,
        avgDepth: 2,
        avgInternalLinks: 5,
      };

      expect(isHighConfidencePattern(pattern, 0.8)).toBe(true);
      expect(isHighConfidencePattern(pattern, 0.9)).toBe(false);
    });
  });
});
