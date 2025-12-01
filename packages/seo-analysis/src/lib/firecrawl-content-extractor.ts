/**
 * Firecrawl Content Extractor - Deep Content Analysis via Firecrawl API
 *
 * @module @claude-flow-novice/seo-analysis/lib/firecrawl-content-extractor
 * @description Batch content scraping and analysis for SERP Pattern Analyst (Phase 2 Sprint 3)
 * @version 1.0.0
 *
 * Provides:
 * - Batch URL scraping with rate limiting
 * - Content structure extraction (headings, links, schema)
 * - Word count and readability metrics
 * - Error handling for unreachable URLs
 * - SSRF protection for URL validation
 *
 * Integration:
 * - Used by SERP Pattern Analyst for deeper content analysis
 * - Complements Google Custom Search with full page content
 * - Enables semantic clustering and content gap detection
 *
 * Security:
 * - Validates URLs against SSRF attacks (private IP ranges, localhost)
 * - Sanitizes error messages to prevent information disclosure
 * - Rate limits API calls to respect Firecrawl quotas
 */

import type {
  FirecrawlExtractorConfig,
  ScrapedContentResult,
  ContentAnalysis,
  ContentStructure,
  FirecrawlBatchResponse,
  FirecrawlErrorCode,
} from '../types/serp-analysis.js';

/**
 * Firecrawl API response format
 */
interface FirecrawlAPIResponse {
  success: boolean;
  data?: {
    content: string;
    markdown?: string;
    html?: string;
    metadata: {
      title: string;
      description?: string;
      language?: string;
      sourceURL: string;
      statusCode: number;
    };
    links?: string[];
  };
  error?: string;
}

/**
 * Firecrawl Content Extractor Error
 */
export class FirecrawlExtractorError extends Error {
  constructor(
    public code: FirecrawlErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FirecrawlExtractorError';
    Object.setPrototypeOf(this, FirecrawlExtractorError.prototype);
  }
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<FirecrawlExtractorConfig> = {
  requestTimeoutMs: 30000,
  rateLimitMs: 1000,
  maxRetries: 2,
  batchSize: 5,
  verbose: false,
};

/**
 * Firecrawl Content Extractor
 *
 * Batch scrapes URLs using Firecrawl API and extracts content structure,
 * word counts, headings, links, and schema markup for SERP analysis.
 *
 * @example
 * ```typescript
 * const extractor = new FirecrawlContentExtractor({
 *   firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
 *   rateLimitMs: 1000,
 *   verbose: true
 * });
 *
 * const urls = ['https://example.com/page1', 'https://example.com/page2'];
 * const results = await extractor.scrapeUrls(urls);
 *
 * results.forEach(result => {
 *   if (result.success) {
 *     console.log(`${result.url}: ${result.analysis.wordCount} words`);
 *   } else {
 *     console.error(`Failed: ${result.error}`);
 *   }
 * });
 * ```
 */
export class FirecrawlContentExtractor {
  private config: Required<FirecrawlExtractorConfig>;

  /**
   * Create Firecrawl Content Extractor
   *
   * @param config - Extractor configuration
   * @throws {FirecrawlExtractorError} If API key is missing or invalid config
   */
  constructor(config: FirecrawlExtractorConfig) {
    // Validate API key
    const apiKey = config.firecrawlApiKey || process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new FirecrawlExtractorError(
        'API_KEY_MISSING',
        'Firecrawl API key required. Set FIRECRAWL_API_KEY environment variable or pass firecrawlApiKey in config.'
      );
    }

    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      firecrawlApiKey: apiKey,
    } as Required<FirecrawlExtractorConfig>;

    // Validate configuration
    if (this.config.requestTimeoutMs < 5000 || this.config.requestTimeoutMs > 60000) {
      throw new FirecrawlExtractorError(
        'INVALID_CONFIG',
        'requestTimeoutMs must be between 5000 and 60000'
      );
    }

    if (this.config.rateLimitMs < 0) {
      throw new FirecrawlExtractorError(
        'INVALID_CONFIG',
        'rateLimitMs must be >= 0'
      );
    }

    if (this.config.batchSize < 1 || this.config.batchSize > 50) {
      throw new FirecrawlExtractorError(
        'INVALID_CONFIG',
        'batchSize must be between 1 and 50'
      );
    }
  }

  /**
   * Batch scrape URLs and return analyzed content
   *
   * Processes URLs in batches with rate limiting, gracefully handles failures,
   * and extracts content structure from successful scrapes.
   *
   * @param urls - Array of URLs to scrape
   * @returns Array of scrape results (success or error)
   * @throws {FirecrawlExtractorError} If batch processing fails critically
   *
   * @example
   * ```typescript
   * const urls = [
   *   'https://example.com/article-1',
   *   'https://example.com/article-2'
   * ];
   * const results = await extractor.scrapeUrls(urls);
   *
   * const successful = results.filter(r => r.success);
   * const failed = results.filter(r => !r.success);
   *
   * console.log(`Scraped: ${successful.length}/${urls.length}`);
   * ```
   */
  async scrapeUrls(urls: string[]): Promise<ScrapedContentResult[]> {
    this.log(`Starting batch scrape of ${urls.length} URLs`);

    if (urls.length === 0) {
      return [];
    }

    // Validate all URLs before scraping
    const validatedUrls = urls.map(url => ({
      url,
      isValid: this.isUrlSafe(url),
    }));

    const results: ScrapedContentResult[] = [];
    const validUrls = validatedUrls.filter(v => v.isValid);
    const invalidUrls = validatedUrls.filter(v => !v.isValid);

    // Add failures for invalid URLs
    invalidUrls.forEach(({ url }) => {
      results.push({
        success: false,
        url,
        error: 'URL is not allowed (private/local range or invalid format)',
        errorCode: 'INVALID_URL',
      });
    });

    // Process valid URLs in batches
    const batches = this.createBatches(validUrls.map(v => v.url), this.config.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} URLs)`);

      const batchResults = await Promise.all(
        batch.map(url => this.scrapeUrl(url))
      );

      results.push(...batchResults);

      // Rate limiting between batches
      if (i < batches.length - 1 && this.config.rateLimitMs > 0) {
        this.log(`Rate limiting: waiting ${this.config.rateLimitMs}ms`);
        await this.sleep(this.config.rateLimitMs);
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.log(`Batch scrape complete: ${successCount}/${urls.length} successful`);

    return results;
  }

  /**
   * Scrape single URL with retry logic
   *
   * @param url - URL to scrape
   * @returns Scrape result
   * @private
   */
  private async scrapeUrl(url: string): Promise<ScrapedContentResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.log(`Retry ${attempt}/${this.config.maxRetries} for ${url}`);
          await this.sleep(1000 * attempt); // Exponential backoff
        }

        const response = await this.fetchWithFirecrawl(url);

        if (!response.success || !response.data) {
          return {
            success: false,
            url,
            error: response.error || 'Unknown Firecrawl error',
            errorCode: 'SCRAPE_FAILED',
          };
        }

        const analysis = this.analyzeContent(response.data.markdown || response.data.content, response.data.metadata);
        const structure = this.extractStructure(response.data.markdown || response.data.content);

        return {
          success: true,
          url,
          title: response.data.metadata.title,
          content: response.data.content,
          markdown: response.data.markdown,
          html: response.data.html,
          analysis,
          structure,
          metadata: {
            statusCode: response.data.metadata.statusCode,
            language: response.data.metadata.language,
            scrapedAt: new Date(),
          },
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        this.log(`Attempt ${attempt + 1} failed for ${url}: ${lastError.message}`);
      }
    }

    // All retries exhausted
    const sanitizedError = this.sanitizeErrorMessage(lastError?.message || 'Unknown error');
    return {
      success: false,
      url,
      error: `Failed after ${this.config.maxRetries + 1} attempts: ${sanitizedError}`,
      errorCode: 'MAX_RETRIES_EXCEEDED',
    };
  }

  /**
   * Fetch page content using Firecrawl API
   *
   * @param url - URL to fetch
   * @returns Firecrawl API response
   * @private
   */
  private async fetchWithFirecrawl(url: string): Promise<FirecrawlAPIResponse> {
    try {
      const response = await fetch('https://api.firecrawl.dev/v0/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown', 'html'],
          onlyMainContent: true,
          timeout: this.config.requestTimeoutMs,
        }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);

        // Check for rate limiting
        if (response.status === 429) {
          throw new FirecrawlExtractorError(
            'RATE_LIMIT_EXCEEDED',
            'Firecrawl API rate limit exceeded',
            { statusCode: 429 }
          );
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as FirecrawlAPIResponse;

      return data;

    } catch (error) {
      if (error instanceof FirecrawlExtractorError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      const sanitizedMessage = this.sanitizeErrorMessage(message);

      throw new FirecrawlExtractorError(
        'API_REQUEST_FAILED',
        `Failed to fetch ${url}: ${sanitizedMessage}`,
        { url }
      );
    }
  }

  /**
   * Analyze scraped content for patterns
   *
   * Extracts word count, heading distribution, link counts, and potential
   * schema markup from content.
   *
   * @param markdown - Markdown content from Firecrawl
   * @param metadata - Response metadata
   * @returns Content analysis
   * @private
   */
  private analyzeContent(markdown: string, metadata: any): ContentAnalysis {
    // Word count (rough estimate from markdown)
    const textContent = markdown
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract link text
      .replace(/[#*_~`]/g, '') // Remove markdown formatting
      .trim();

    const words = textContent.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Heading distribution
    const h1Count = (markdown.match(/^# [^\n]+$/gm) || []).length;
    const h2Count = (markdown.match(/^## [^\n]+$/gm) || []).length;
    const h3Count = (markdown.match(/^### [^\n]+$/gm) || []).length;
    const h4Count = (markdown.match(/^#### [^\n]+$/gm) || []).length;

    // Link analysis
    const linkMatches = markdown.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
    const totalLinks = linkMatches.length;

    // Estimate internal vs external (rough heuristic)
    const internalLinks = linkMatches.filter(link =>
      link.includes('](/') || link.includes('](#') || !link.includes('://')
    ).length;
    const externalLinks = totalLinks - internalLinks;

    // Schema detection (basic heuristics from metadata or content)
    const schemaTypes: string[] = [];
    if (metadata.description) {
      schemaTypes.push('WebPage');
    }
    if (markdown.includes('## Reviews') || markdown.includes('## Rating')) {
      schemaTypes.push('Product');
    }
    if (markdown.includes('## Recipe') || markdown.includes('## Ingredients')) {
      schemaTypes.push('Recipe');
    }
    if (markdown.match(/\d{4}-\d{2}-\d{2}/)) {
      schemaTypes.push('Article');
    }

    return {
      wordCount,
      headingDistribution: {
        h1: h1Count,
        h2: h2Count,
        h3: h3Count,
        h4: h4Count,
      },
      linkCount: {
        total: totalLinks,
        internal: internalLinks,
        external: externalLinks,
      },
      schemaTypes: schemaTypes.length > 0 ? schemaTypes : undefined,
      hasStructuredData: schemaTypes.length > 0,
    };
  }

  /**
   * Extract headings, links, and structure from markdown
   *
   * @param markdown - Markdown content
   * @returns Content structure
   * @private
   */
  private extractStructure(markdown: string): ContentStructure {
    // Extract headings
    const headings = {
      h1: this.extractHeadings(markdown, /^# (.+)$/gm),
      h2: this.extractHeadings(markdown, /^## (.+)$/gm),
      h3: this.extractHeadings(markdown, /^### (.+)$/gm),
      h4: this.extractHeadings(markdown, /^#### (.+)$/gm),
      h5: this.extractHeadings(markdown, /^##### (.+)$/gm),
      h6: this.extractHeadings(markdown, /^###### (.+)$/gm),
    };

    // Extract links
    const linkMatches = Array.from(markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g));
    const links: { text: string; url: string }[] = [];

    for (const match of linkMatches) {
      links.push({
        text: match[1],
        url: match[2],
      });
    }

    // Separate internal and external
    const internalLinks = links.filter(link =>
      link.url.startsWith('/') || link.url.startsWith('#') || !link.url.includes('://')
    );
    const externalLinks = links.filter(link =>
      link.url.includes('://') && !link.url.startsWith('/')
    );

    return {
      headings,
      links: {
        internal: internalLinks,
        external: externalLinks,
      },
    };
  }

  /**
   * Extract headings matching a specific level pattern
   *
   * @param markdown - Markdown content
   * @param pattern - Regex pattern for heading level
   * @returns Array of heading texts
   * @private
   */
  private extractHeadings(markdown: string, pattern: RegExp): string[] {
    const matches = markdown.matchAll(pattern);
    return Array.from(matches).map(m => m[1].trim());
  }

  /**
   * Validate URL for SSRF prevention
   *
   * Blocks private/local IP ranges, localhost, and other risky targets.
   *
   * @param url - URL to validate
   * @returns True if URL is safe to request
   * @private
   */
  private isUrlSafe(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Block localhost and IPv6 loopback
      if (hostname === 'localhost' || hostname === '::1' || hostname === '127.0.0.1') {
        return false;
      }

      // Parse IPv4 address
      const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipv4Match) {
        const octet1 = parseInt(ipv4Match[1]);
        const octet2 = parseInt(ipv4Match[2]);

        // Block private IPv4 ranges
        // 10.0.0.0/8
        if (octet1 === 10) return false;
        // 172.16.0.0/12
        if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return false;
        // 192.168.0.0/16
        if (octet1 === 192 && octet2 === 168) return false;
        // 127.0.0.0/8 (loopback)
        if (octet1 === 127) return false;
        // 169.254.0.0/16 (link-local)
        if (octet1 === 169 && octet2 === 254) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize error messages to prevent information disclosure
   *
   * Removes API keys, tokens, and sensitive data from error messages.
   *
   * @param message - Raw error message
   * @returns Sanitized error message
   * @private
   */
  private sanitizeErrorMessage(message: string): string {
    return message
      .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
      .replace(/Authorization:\s*[A-Za-z0-9_\-\.]+/gi, 'Authorization: [REDACTED]')
      .replace(/[a-z0-9]{32,}/gi, '[REDACTED]') // Redact long hex/alphanumeric strings
      .replace(/sk-[A-Za-z0-9_\-]+/gi, 'sk-[REDACTED]') // OpenAI-style keys
      .replace(/cf-[A-Za-z0-9_\-]+/gi, 'cf-[REDACTED]') // Firecrawl-style keys
      .replace(/npm_[A-Za-z0-9_\-]+/gi, 'npm_[REDACTED]'); // NPM keys
  }

  /**
   * Create batches from array
   *
   * @param items - Items to batch
   * @param batchSize - Size of each batch
   * @returns Array of batches
   * @private
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep for specified milliseconds
   *
   * @param ms - Milliseconds to sleep
   * @private
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log message if verbose mode enabled
   *
   * @param message - Message to log
   * @private
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[FirecrawlExtractor] ${message}`);
    }
  }
}

/**
 * Convenience function to scrape URLs with default configuration
 *
 * @param urls - URLs to scrape
 * @param config - Optional configuration overrides
 * @returns Scrape results
 *
 * @example
 * ```typescript
 * import { scrapeUrls } from './firecrawl-content-extractor';
 *
 * const results = await scrapeUrls([
 *   'https://example.com/page1',
 *   'https://example.com/page2'
 * ], { verbose: true });
 * ```
 */
export async function scrapeUrls(
  urls: string[],
  config?: Partial<FirecrawlExtractorConfig>
): Promise<ScrapedContentResult[]> {
  const extractor = new FirecrawlContentExtractor({
    firecrawlApiKey: config?.firecrawlApiKey || process.env.FIRECRAWL_API_KEY || '',
    ...config,
  });

  return extractor.scrapeUrls(urls);
}
