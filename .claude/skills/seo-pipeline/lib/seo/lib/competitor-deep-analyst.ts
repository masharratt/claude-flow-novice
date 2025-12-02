/**
 * Competitor Deep Analyst Agent
 *
 * @module planning/seo/lib/competitor-deep-analyst
 * @description Deep competitor analysis agent for SEO Intelligence Phase 2 Sprint 1
 * @version 2.0.0
 *
 * Provides comprehensive competitor analysis including:
 * - Site-wide crawling (50+ pages with depth control)
 * - Hub page identification using centrality algorithms
 * - Site architecture pattern extraction
 * - Content strategy analysis
 * - Internal linking pattern discovery
 * - Content gap identification
 */

import * as cheerio from 'cheerio';
import {
  CompetitorAnalysisConfig,
  CompetitorAnalysisResult,
  CrawledPage,
  CrawlQueueEntry,
  CrawlResult,
  SiteArchitecturePattern,
  ContentStrategyPattern,
  HubPageMetadata,
  InternalLinkingPattern,
  ContentGap,
  FirecrawlResponse,
  CompetitorAnalysisError,
  CompetitorAnalysisErrorCode,
  isSuccessfulCrawl,
  HubPageScoringFactors,
  PatternExtractionConfig,
} from '../types/competitor-analysis';
import { ResearchService } from './research-service';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<CompetitorAnalysisConfig> = {
  maxPages: 50,
  maxDepth: 3,
  verbose: false,
  rateLimitMs: 1000,
  requestTimeoutMs: 30000,
};

/**
 * Default hub page scoring factors
 */
const DEFAULT_HUB_SCORING: HubPageScoringFactors = {
  incomingLinkWeight: 0.4,
  outgoingLinkWeight: 0.2,
  depthWeight: 0.2,
  contentQualityWeight: 0.1,
  topicalRelevanceWeight: 0.1,
};

/**
 * Default pattern extraction configuration
 */
const DEFAULT_PATTERN_CONFIG: PatternExtractionConfig = {
  minInstances: 3,
  minConfidence: 0.6,
  fuzzyMatching: true,
  similarityThreshold: 0.8,
};

/**
 * Competitor Deep Analyst Agent
 *
 * Performs deep analysis of competitor websites to extract actionable patterns
 * for SEO strategy.
 *
 * @example
 * ```typescript
 * const analyst = new CompetitorDeepAnalystAgent({
 *   domain: 'competitor.com',
 *   maxPages: 100,
 *   maxDepth: 4,
 *   verbose: true
 * });
 *
 * const result = await analyst.analyze();
 * console.log(`Analyzed ${result.pagesCrawled} pages`);
 * console.log(`Found ${result.hubPages.length} hub pages`);
 * ```
 */
export class CompetitorDeepAnalystAgent {
  private config: Required<CompetitorAnalysisConfig>;
  private researchService?: ResearchService;
  private crawledPages: Map<string, CrawledPage>;
  private errors: string[];
  private warnings: string[];

  /**
   * Create a new CompetitorDeepAnalystAgent
   *
   * @param config - Analysis configuration
   */
  constructor(config: CompetitorAnalysisConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<CompetitorAnalysisConfig>;
    this.crawledPages = new Map();
    this.errors = [];
    this.warnings = [];

    this.validateConfig();
  }

  /**
   * Set research service for integration testing
   *
   * @param service - ResearchService instance
   * @internal
   */
  setResearchService(service: ResearchService): void {
    this.researchService = service;
  }

  /**
   * Validate configuration
   *
   * @throws {CompetitorAnalysisError} If configuration is invalid
   */
  private validateConfig(): void {
    if (!this.config.domain || typeof this.config.domain !== 'string') {
      throw new CompetitorAnalysisError(
        CompetitorAnalysisErrorCode.INVALID_DOMAIN,
        'Domain must be a non-empty string'
      );
    }

    // Normalize domain (remove protocol, trailing slash)
    this.config.domain = this.config.domain
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');

    if (this.config.maxPages < 10) {
      throw new CompetitorAnalysisError(
        CompetitorAnalysisErrorCode.INVALID_DOMAIN,
        'maxPages must be at least 10 for meaningful analysis'
      );
    }

    if (this.config.maxPages > 200) {
      this.warnings.push('maxPages > 200 may take significant time and API costs');
    }

    if (this.config.maxDepth < 1 || this.config.maxDepth > 5) {
      throw new CompetitorAnalysisError(
        CompetitorAnalysisErrorCode.INVALID_DOMAIN,
        'maxDepth must be between 1 and 5'
      );
    }
  }

  /**
   * Execute full competitor analysis
   *
   * @returns Complete analysis result
   * @throws {CompetitorAnalysisError} If analysis fails
   */
  async analyze(): Promise<CompetitorAnalysisResult> {
    const startTime = Date.now();

    this.log(`Starting deep analysis of ${this.config.domain}`);
    this.log(`Config: maxPages=${this.config.maxPages}, maxDepth=${this.config.maxDepth}`);

    try {
      // Step 1: Site-wide crawling
      this.log('Step 1: Crawling site...');
      await this.crawlSite();

      if (this.crawledPages.size < 10) {
        throw new CompetitorAnalysisError(
          CompetitorAnalysisErrorCode.INSUFFICIENT_DATA,
          `Only crawled ${this.crawledPages.size} pages, minimum 10 required`,
          { pagesCrawled: this.crawledPages.size }
        );
      }

      this.log(`Crawled ${this.crawledPages.size} pages`);

      // Step 2: Extract architecture patterns
      this.log('Step 2: Extracting architecture patterns...');
      const architecturePatterns = this.extractArchitecturePatterns();
      this.log(`Found ${architecturePatterns.length} architecture patterns`);

      // Step 3: Extract content strategy patterns
      this.log('Step 3: Analyzing content strategy...');
      const contentStrategyPatterns = this.extractContentStrategyPatterns();
      this.log(`Found ${contentStrategyPatterns.length} content strategy patterns`);

      // Step 4: Identify hub pages
      this.log('Step 4: Identifying hub pages...');
      const hubPages = this.identifyHubPages();
      this.log(`Identified ${hubPages.length} hub pages`);

      // Step 5: Analyze internal linking patterns
      this.log('Step 5: Analyzing internal linking...');
      const internalLinkingPatterns = this.analyzeInternalLinkingPatterns();
      this.log(`Found ${internalLinkingPatterns.length} linking patterns`);

      // Step 6: Identify content gaps
      this.log('Step 6: Identifying content gaps...');
      const contentGaps = this.identifyContentGaps();
      this.log(`Identified ${contentGaps.length} content gaps`);

      // Step 7: Calculate site-wide metrics
      const siteMetrics = this.calculateSiteMetrics();

      const totalTimeMs = Date.now() - startTime;
      const maxDepthReached = Math.max(...Array.from(this.crawledPages.values()).map(p => p.depth));

      const result: CompetitorAnalysisResult = {
        domain: this.config.domain,
        analyzedAt: new Date(),
        pagesCrawled: this.crawledPages.size,
        maxDepthReached,
        totalTimeMs,
        pages: Array.from(this.crawledPages.values()),
        architecturePatterns,
        contentStrategyPatterns,
        hubPages,
        internalLinkingPatterns,
        contentGaps,
        siteMetrics,
        metadata: {
          configUsed: this.config,
          errorsEncountered: this.errors,
          warnings: this.warnings,
          confidenceScore: this.calculateOverallConfidence(),
        },
      };

      this.log(`Analysis complete in ${(totalTimeMs / 1000).toFixed(2)}s`);
      return result;

    } catch (error) {
      if (error instanceof CompetitorAnalysisError) {
        throw error;
      }

      throw new CompetitorAnalysisError(
        CompetitorAnalysisErrorCode.ANALYSIS_FAILED,
        error instanceof Error ? error.message : 'Unknown analysis error',
        { originalError: error }
      );
    }
  }

  /**
   * Crawl competitor site with depth-first traversal
   *
   * @private
   */
  private async crawlSite(): Promise<void> {
    const queue: CrawlQueueEntry[] = [
      { url: `https://${this.config.domain}`, depth: 0 }
    ];
    const visited = new Set<string>();

    while (queue.length > 0 && this.crawledPages.size < this.config.maxPages) {
      const entry = queue.shift()!;

      // Skip if already visited or max depth exceeded
      if (visited.has(entry.url) || entry.depth > this.config.maxDepth) {
        continue;
      }

      visited.add(entry.url);

      try {
        const result = await this.crawlPage(entry.url, entry.depth);

        if (isSuccessfulCrawl(result)) {
          this.crawledPages.set(entry.url, result.page);

          // Add internal links to queue
          const newEntries = result.page.internalLinks
            .filter(url => !visited.has(url))
            .map(url => ({
              url,
              depth: entry.depth + 1,
              parentUrl: entry.url,
            }));

          queue.push(...newEntries);

          // Rate limiting
          if (this.config.rateLimitMs > 0) {
            await this.sleep(this.config.rateLimitMs);
          }
        } else if (result.error) {
          this.errors.push(`Failed to crawl ${result.error.url}: ${result.error.message}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.errors.push(`Exception crawling ${entry.url}: ${message}`);
      }
    }

    if (this.crawledPages.size === 0) {
      throw new CompetitorAnalysisError(
        CompetitorAnalysisErrorCode.INSUFFICIENT_DATA,
        'No pages were successfully crawled'
      );
    }
  }

  /**
   * Crawl individual page
   *
   * @param url - Page URL to crawl
   * @param depth - Crawl depth
   * @returns Crawl result
   * @private
   */
  private async crawlPage(url: string, depth: number): Promise<CrawlResult> {
    this.log(`Crawling ${url} (depth ${depth})`);

    try {
      // In real implementation, use Firecrawl API
      // For now, use placeholder structure
      const response = await this.fetchWithFirecrawl(url);

      if (!response.success || !response.data) {
        return {
          success: false,
          error: {
            message: response.error || 'Unknown fetch error',
            url,
          },
        };
      }

      const page = this.parseFirecrawlResponse(response, url, depth);

      return {
        success: true,
        page,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          url,
        },
      };
    }
  }

  /**
   * Fetch page content using Firecrawl API
   *
   * @param url - URL to fetch
   * @returns Firecrawl API response
   * @private
   */
  private async fetchWithFirecrawl(url: string): Promise<FirecrawlResponse> {
    const apiKey = this.config.firecrawlApiKey || process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new CompetitorAnalysisError(
        CompetitorAnalysisErrorCode.FIRECRAWL_API_ERROR,
        'Firecrawl API key not configured. Set FIRECRAWL_API_KEY environment variable or pass firecrawlApiKey in config.'
      );
    }

    try {
      const response = await fetch('https://api.firecrawl.dev/v0/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          formats: ['markdown', 'html'],
          onlyMainContent: true,
          timeout: this.config.requestTimeoutMs
        }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // Handle Firecrawl API response format
      if (!data.success) {
        return {
          success: false,
          error: data.error || 'Unknown Firecrawl API error'
        };
      }

      return {
        success: true,
        data: {
          content: data.data?.content || data.data?.markdown || '',
          markdown: data.data?.markdown,
          html: data.data?.html,
          metadata: {
            title: data.data?.metadata?.title || '',
            description: data.data?.metadata?.description,
            language: data.data?.metadata?.language,
            sourceURL: data.data?.metadata?.sourceURL || url,
            statusCode: data.data?.metadata?.statusCode || 200,
          },
          links: data.data?.links || [],
        }
      };

    } catch (error) {
      throw new CompetitorAnalysisError(
        CompetitorAnalysisErrorCode.FIRECRAWL_API_ERROR,
        `Failed to fetch ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { url, originalError: error }
      );
    }
  }

  /**
   * Parse Firecrawl response into CrawledPage
   *
   * @param response - Firecrawl API response
   * @param url - Original URL
   * @param depth - Crawl depth
   * @returns Parsed page data
   * @private
   */
  private parseFirecrawlResponse(
    response: FirecrawlResponse,
    url: string,
    depth: number
  ): CrawledPage {
    const data = response.data!;
    const startTime = Date.now();

    // Parse HTML content with Cheerio
    const $ = cheerio.load(data.html || '');

    // Extract content (prefer markdown, fallback to text extraction)
    const content = data.markdown || data.content || $('body').text();
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

    // Extract headings from HTML
    const headings = {
      h1: $('h1').map((_, el) => $(el).text().trim()).get().filter(h => h.length > 0),
      h2: $('h2').map((_, el) => $(el).text().trim()).get().filter(h => h.length > 0),
      h3: $('h3').map((_, el) => $(el).text().trim()).get().filter(h => h.length > 0),
      h4: $('h4').map((_, el) => $(el).text().trim()).get().filter(h => h.length > 0),
      h5: $('h5').map((_, el) => $(el).text().trim()).get().filter(h => h.length > 0),
      h6: $('h6').map((_, el) => $(el).text().trim()).get().filter(h => h.length > 0),
    };

    // Extract images with alt text
    const images = $('img')
      .map((_, el) => ({
        src: $(el).attr('src') || '',
        alt: $(el).attr('alt')
      }))
      .get()
      .filter(img => img.src.length > 0);

    // Extract schema.org structured data
    const schemaTypes: string[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const schemaText = $(el).html();
        if (schemaText) {
          const schema = JSON.parse(schemaText);
          if (Array.isArray(schema)) {
            schema.forEach(item => {
              if (item['@type']) schemaTypes.push(item['@type']);
              if (item.type) schemaTypes.push(item.type);
            });
          } else {
            if (schema['@type']) schemaTypes.push(schema['@type']);
            if (schema.type) schemaTypes.push(schema.type);
          }
        }
      } catch (error) {
        // Ignore invalid JSON-LD
        this.log(`Warning: Invalid JSON-LD on ${url}: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    });

    // Extract all links from HTML
    const allLinks = $('a')
      .map((_, el) => {
        const href = $(el).attr('href');
        if (!href) return null;

        try {
          // Resolve relative URLs
          const absoluteUrl = new URL(href, url).href;
          return absoluteUrl;
        } catch {
          return null;
        }
      })
      .get()
      .filter((link): link is string => link !== null);

    // Merge with Firecrawl-provided links
    const firecrawlLinks = (data.links || []).map(link => {
      try {
        return new URL(link, url).href;
      } catch {
        return null;
      }
    }).filter((link): link is string => link !== null);

    const uniqueLinks = Array.from(new Set([...allLinks, ...firecrawlLinks]));

    // Filter internal vs external links
    const internalLinks = uniqueLinks.filter(link => this.isInternalLink(link));
    const externalLinks = uniqueLinks.filter(link => !this.isInternalLink(link));

    // Classify content type based on URL pattern
    const contentType = this.classifyContentType(url);

    const loadTimeMs = Date.now() - startTime;

    return {
      url,
      title: data.metadata.title || $('title').text().trim() || 'Untitled',
      metaDescription: data.metadata.description || $('meta[name="description"]').attr('content'),
      content,
      wordCount,
      headings,
      internalLinks,
      externalLinks,
      images,
      schemaTypes: Array.from(new Set(schemaTypes)),
      depth,
      crawledAt: new Date(),
      statusCode: data.metadata.statusCode,
      loadTimeMs,
      contentType,
    };
  }

  /**
   * Check if link is internal to analyzed domain
   *
   * @param link - Link URL
   * @returns True if internal link
   * @private
   */
  private isInternalLink(link: string): boolean {
    try {
      const url = new URL(link, `https://${this.config.domain}`);
      return url.hostname === this.config.domain || url.hostname === `www.${this.config.domain}`;
    } catch {
      return false;
    }
  }

  /**
   * Classify content type based on URL pattern
   *
   * @param url - Page URL
   * @returns Content type classification
   * @private
   */
  private classifyContentType(url: string): string {
    const path = new URL(url).pathname.toLowerCase();

    if (path === '' || path === '/') return 'homepage';
    if (path.includes('/blog/')) return 'blog';
    if (path.includes('/product')) return 'product';
    if (path.includes('/guide') || path.includes('/tutorial')) return 'guide';
    if (path.includes('/docs')) return 'documentation';
    if (path.includes('/about')) return 'about';
    if (path.includes('/contact')) return 'contact';
    if (path.includes('/pricing')) return 'pricing';

    return 'other';
  }

  /**
   * Extract site architecture patterns from crawled pages
   *
   * @returns Architecture patterns
   * @private
   */
  private extractArchitecturePatterns(): SiteArchitecturePattern[] {
    const patterns = new Map<string, { urls: string[], depths: number[], internalLinks: number[] }>();

    // Group pages by URL pattern
    for (const page of this.crawledPages.values()) {
      const pattern = this.extractUrlPattern(page.url);

      if (!patterns.has(pattern)) {
        patterns.set(pattern, { urls: [], depths: [], internalLinks: [] });
      }

      const group = patterns.get(pattern)!;
      group.urls.push(page.url);
      group.depths.push(page.depth);
      group.internalLinks.push(page.internalLinks.length);
    }

    // Convert to SiteArchitecturePattern objects
    return Array.from(patterns.entries())
      .filter(([_, group]) => group.urls.length >= DEFAULT_PATTERN_CONFIG.minInstances)
      .map(([pattern, group]) => ({
        urlStructure: pattern,
        prevalence: group.urls.length,
        examples: group.urls.slice(0, 3),
        confidence: Math.min(group.urls.length / 10, 1.0),
        avgDepth: group.depths.reduce((a, b) => a + b, 0) / group.depths.length,
        avgInternalLinks: group.internalLinks.reduce((a, b) => a + b, 0) / group.internalLinks.length,
      }))
      .sort((a, b) => b.prevalence - a.prevalence);
  }

  /**
   * Extract URL pattern from specific URL
   *
   * @param url - Specific URL
   * @returns Generalized URL pattern
   * @private
   */
  private extractUrlPattern(url: string): string {
    const path = new URL(url).pathname;

    // Replace specific identifiers with placeholders (order matters!)
    return path
      .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, '/{uuid}')
      .replace(/\/\d+/g, '/{id}')
      .replace(/\/[\w-]+\.html?$/, '/{slug}.html')
      .replace(/\/[\w-]+$/, '/{slug}');
  }

  /**
   * Extract content strategy patterns
   *
   * @returns Content strategy patterns
   * @private
   */
  private extractContentStrategyPatterns(): ContentStrategyPattern[] {
    const patterns = new Map<string, CrawledPage[]>();

    // Group by content type
    for (const page of this.crawledPages.values()) {
      if (!patterns.has(page.contentType)) {
        patterns.set(page.contentType, []);
      }
      patterns.get(page.contentType)!.push(page);
    }

    return Array.from(patterns.entries())
      .map(([contentType, pages]) => {
        const avgWordCount = pages.reduce((sum, p) => sum + p.wordCount, 0) / pages.length;
        const avgTitleLength = pages.reduce((sum, p) => sum + p.title.length, 0) / pages.length;
        const avgHeadingCount = pages.reduce((sum, p) => {
          return sum + Object.values(p.headings).flat().length;
        }, 0) / pages.length;
        const avgImageCount = pages.reduce((sum, p) => sum + p.images.length, 0) / pages.length;

        // Extract common heading structures
        const headingStructures = this.extractHeadingStructures(pages);

        return {
          contentType,
          pageCount: pages.length,
          avgWordCount: Math.round(avgWordCount),
          avgTitleLength: Math.round(avgTitleLength),
          headingStructures,
          avgHeadingCount: Math.round(avgHeadingCount),
          avgImageCount: Math.round(avgImageCount),
          metadataPatterns: [],
          freshnessIndicators: {
            hasDatestamps: false,
          },
        };
      })
      .sort((a, b) => b.pageCount - a.pageCount);
  }

  /**
   * Extract common heading structures from pages
   *
   * @param pages - Pages to analyze
   * @returns Common heading structures
   * @private
   */
  private extractHeadingStructures(pages: CrawledPage[]): string[] {
    // Simplified heading structure extraction
    const structures = new Set<string>();

    for (const page of pages) {
      const structure: string[] = [];
      for (const [level, headings] of Object.entries(page.headings)) {
        if (headings.length > 0) {
          structure.push(`${level}:${headings.length}`);
        }
      }
      if (structure.length > 0) {
        structures.add(structure.join(','));
      }
    }

    return Array.from(structures).slice(0, 5);
  }

  /**
   * Identify hub pages using centrality algorithm
   *
   * @returns Hub page metadata
   * @private
   */
  private identifyHubPages(): HubPageMetadata[] {
    const linkGraph = this.buildLinkGraph();
    const hubScores = new Map<string, number>();

    // Calculate hub scores for each page
    for (const [url, page] of this.crawledPages.entries()) {
      const incomingLinks = linkGraph.incoming.get(url) || [];
      const outgoingLinks = page.internalLinks.length;

      const score = this.calculateHubScore({
        incomingLinkCount: incomingLinks.length,
        outgoingLinkCount: outgoingLinks,
        depth: page.depth,
        wordCount: page.wordCount,
      });

      hubScores.set(url, score);
    }

    // Sort by score and take top candidates
    const sortedPages = Array.from(this.crawledPages.values())
      .map(page => ({
        page,
        score: hubScores.get(page.url) || 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(10, Math.ceil(this.crawledPages.size * 0.2)));

    return sortedPages.map(({ page, score }) => {
      const incomingLinks = linkGraph.incoming.get(page.url) || [];

      return {
        url: page.url,
        title: page.title,
        incomingLinkCount: incomingLinks.length,
        outgoingLinkCount: page.internalLinks.length,
        centralityScore: score,
        depth: page.depth,
        contentType: page.contentType,
        hubType: this.classifyHubType(page),
        topics: this.extractTopics(page),
        confidence: Math.min(score, 1.0),
      };
    });
  }

  /**
   * Build link graph for centrality calculations
   *
   * @returns Link graph with incoming/outgoing links
   * @private
   */
  private buildLinkGraph(): { incoming: Map<string, string[]>; outgoing: Map<string, string[]> } {
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();

    for (const [url, page] of this.crawledPages.entries()) {
      outgoing.set(url, page.internalLinks);

      for (const targetUrl of page.internalLinks) {
        if (!incoming.has(targetUrl)) {
          incoming.set(targetUrl, []);
        }
        incoming.get(targetUrl)!.push(url);
      }
    }

    return { incoming, outgoing };
  }

  /**
   * Calculate hub score for a page
   *
   * @param factors - Scoring factors
   * @returns Hub score (0.0-1.0)
   * @private
   */
  private calculateHubScore(factors: {
    incomingLinkCount: number;
    outgoingLinkCount: number;
    depth: number;
    wordCount: number;
  }): number {
    // Build link graph to get accurate incoming link counts
    const linkGraph = this.buildLinkGraph();

    // Calculate max values using DISTINCT metrics (BUGFIX: Issue #4)
    // maxIncoming: maximum number of links pointing TO any page
    const maxIncoming = Math.max(
      ...Array.from(linkGraph.incoming.entries()).map(([_, sources]) => sources.length),
      1 // Prevent division by zero
    );

    // maxOutgoing: maximum number of links FROM any page
    const maxOutgoing = Math.max(
      ...Array.from(this.crawledPages.values()).map(p => p.internalLinks.length),
      1 // Prevent division by zero
    );

    // Normalize using correct max values for each metric
    const normalizedIncoming = factors.incomingLinkCount / maxIncoming;
    const normalizedOutgoing = factors.outgoingLinkCount / maxOutgoing;
    const depthScore = 1 - (factors.depth / this.config.maxDepth);
    const contentQuality = Math.min(factors.wordCount / 2000, 1.0);

    return (
      normalizedIncoming * DEFAULT_HUB_SCORING.incomingLinkWeight +
      normalizedOutgoing * DEFAULT_HUB_SCORING.outgoingLinkWeight +
      depthScore * DEFAULT_HUB_SCORING.depthWeight +
      contentQuality * DEFAULT_HUB_SCORING.contentQualityWeight
    );
  }

  /**
   * Classify hub type based on page characteristics
   *
   * @param page - Page to classify
   * @returns Hub type
   * @private
   */
  private classifyHubType(page: CrawledPage): 'topical' | 'navigational' | 'resource' | 'mixed' {
    if (page.depth === 0) return 'navigational';
    if (page.wordCount > 2000 && page.internalLinks.length > 10) return 'topical';
    if (page.externalLinks.length > page.internalLinks.length) return 'resource';
    return 'mixed';
  }

  /**
   * Extract topics from page content
   *
   * @param page - Page to extract topics from
   * @returns Topic keywords
   * @private
   */
  private extractTopics(page: CrawledPage): string[] {
    // Simplified topic extraction from title and headings
    const text = [page.title, ...Object.values(page.headings).flat()].join(' ');
    const words = text.toLowerCase().split(/\W+/);

    // Count word frequency (excluding common words)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'about']);
    const wordFreq = new Map<string, number>();

    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Analyze internal linking patterns
   *
   * @returns Internal linking patterns
   * @private
   */
  private analyzeInternalLinkingPatterns(): InternalLinkingPattern[] {
    const patterns = new Map<string, {
      sources: string[];
      targets: string[];
      avgDensity: number;
    }>();

    for (const page of this.crawledPages.values()) {
      for (const targetUrl of page.internalLinks) {
        const targetPage = this.crawledPages.get(targetUrl);
        if (!targetPage) continue;

        const patternKey = `${page.contentType}->${targetPage.contentType}`;

        if (!patterns.has(patternKey)) {
          patterns.set(patternKey, { sources: [], targets: [], avgDensity: 0 });
        }

        patterns.get(patternKey)!.sources.push(page.url);
        patterns.get(patternKey)!.targets.push(targetUrl);
      }
    }

    return Array.from(patterns.entries())
      .filter(([_, data]) => data.sources.length >= DEFAULT_PATTERN_CONFIG.minInstances)
      .map(([pattern, data]) => {
        const [sourceType, targetType] = pattern.split('->');

        return {
          patternType: pattern,
          description: `${sourceType} pages link to ${targetType} pages`,
          sourceContentType: sourceType,
          targetContentType: targetType,
          instanceCount: data.sources.length,
          avgLinkDensity: data.sources.length / this.crawledPages.size,
          anchorTextPatterns: [],
          placement: 'contextual' as const,
          confidence: Math.min(data.sources.length / 10, 1.0),
        };
      })
      .sort((a, b) => b.instanceCount - a.instanceCount);
  }

  /**
   * Identify content gaps
   *
   * @returns Content gaps
   * @private
   */
  private identifyContentGaps(): ContentGap[] {
    const gaps: ContentGap[] = [];

    // Analyze content type distribution
    const contentTypeCounts = new Map<string, number>();
    for (const page of this.crawledPages.values()) {
      contentTypeCounts.set(page.contentType, (contentTypeCounts.get(page.contentType) || 0) + 1);
    }

    // Identify underrepresented content types
    const avgCount = Array.from(contentTypeCounts.values()).reduce((a, b) => a + b, 0) / contentTypeCounts.size;

    for (const [contentType, count] of contentTypeCounts.entries()) {
      if (count < avgCount * 0.5) {
        gaps.push({
          gapType: 'thin_content',
          topic: contentType,
          opportunityScore: 1 - (count / avgCount),
          competitorCoverage: count,
          recommendedContentType: contentType,
          priority: count < avgCount * 0.25 ? 'high' : 'medium',
          reasoning: `Only ${count} pages of type ${contentType}, below average of ${Math.round(avgCount)}`,
        });
      }
    }

    return gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  /**
   * Calculate site-wide metrics
   *
   * @returns Site metrics
   * @private
   */
  private calculateSiteMetrics() {
    const pages = Array.from(this.crawledPages.values());

    const avgPageWordCount = pages.reduce((sum, p) => sum + p.wordCount, 0) / pages.length;
    const avgInternalLinksPerPage = pages.reduce((sum, p) => sum + p.internalLinks.length, 0) / pages.length;
    const avgExternalLinksPerPage = pages.reduce((sum, p) => sum + p.externalLinks.length, 0) / pages.length;
    const avgImagesPerPage = pages.reduce((sum, p) => sum + p.images.length, 0) / pages.length;
    const avgLoadTimeMs = pages.reduce((sum, p) => sum + p.loadTimeMs, 0) / pages.length;
    const schemaImplementationRate = pages.filter(p => p.schemaTypes.length > 0).length / pages.length;

    return {
      avgPageWordCount: Math.round(avgPageWordCount),
      avgInternalLinksPerPage: Math.round(avgInternalLinksPerPage),
      avgExternalLinksPerPage: Math.round(avgExternalLinksPerPage),
      avgImagesPerPage: Math.round(avgImagesPerPage),
      avgLoadTimeMs: Math.round(avgLoadTimeMs),
      schemaImplementationRate: Math.round(schemaImplementationRate * 100) / 100,
      contentFreshnessScore: 0.5, // Placeholder
    };
  }

  /**
   * Calculate overall confidence score for analysis
   *
   * @returns Confidence score (0.0-1.0)
   * @private
   */
  private calculateOverallConfidence(): number {
    const factors = {
      dataCompleteness: this.crawledPages.size / this.config.maxPages,
      errorRate: 1 - (this.errors.length / Math.max(this.crawledPages.size, 1)),
      patternConfidence: 0.8, // Based on pattern extraction quality
    };

    return (factors.dataCompleteness * 0.4 + factors.errorRate * 0.3 + factors.patternConfidence * 0.3);
  }

  /**
   * Log message if verbose mode enabled
   *
   * @param message - Message to log
   * @private
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[CompetitorDeepAnalyst] ${message}`);
    }
  }

  /**
   * Sleep for specified milliseconds
   *
   * @param ms - Milliseconds to sleep
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
