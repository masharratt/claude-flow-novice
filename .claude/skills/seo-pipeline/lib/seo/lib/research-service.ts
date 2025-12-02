/**
 * Research Service with WebSearch/WebFetch Integration
 *
 * @module planning/seo/lib/research-service
 * @description Main research service integrating MCP tools, caching, and rate limiting
 */

import {
  ResearchQuery,
  ResearchResult,
  SerpResult,
  ContentResult,
  ResearchError,
  ResearchErrorCode,
} from '../types/research';
import { ResearchCache, researchCache } from './research-cache';
import { RateLimiter, rateLimiterManager } from './rate-limiter';
import { ErrorSanitizer } from './error-sanitizer';

/**
 * MCP tool interface (abstract for testing/mocking)
 */
interface MCPTool {
  webSearch(query: string, options?: Record<string, unknown>): Promise<unknown>;
  webFetch(url: string, options?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Research service configuration
 */
interface ResearchServiceConfig {
  /** Custom cache instance */
  cache?: ResearchCache;

  /** Custom rate limiter instances */
  rateLimiters?: {
    websearch?: RateLimiter;
    webfetch?: RateLimiter;
  };

  /** Enable request timeout (milliseconds) */
  timeout?: number;

  /** Enable detailed logging */
  verbose?: boolean;
}

/**
 * Research Service implementation
 */
export class ResearchService {
  private cache: ResearchCache;
  private webSearchLimiter: RateLimiter;
  private webFetchLimiter: RateLimiter;
  private config: ResearchServiceConfig;

  constructor(config: ResearchServiceConfig = {}) {
    this.config = config;
    this.cache = config.cache || researchCache;
    this.webSearchLimiter =
      config.rateLimiters?.websearch || rateLimiterManager.getLimiter('websearch');
    this.webFetchLimiter =
      config.rateLimiters?.webfetch || rateLimiterManager.getLimiter('webfetch');
  }

  /**
   * Execute research query
   *
   * @param query - Research query configuration
   * @returns Research result with SERP and/or content data
   */
  async execute(query: ResearchQuery): Promise<ResearchResult> {
    const startTime = Date.now();

    // Validate query
    this.validateQuery(query);

    // Check cache first
    const cachedResult = await this.cache.get(query);
    if (cachedResult) {
      if (this.config.verbose) {
        console.log(`[ResearchService] Cache hit for query: ${query.query}`);
      }
      return cachedResult;
    }

    if (this.config.verbose) {
      console.log(`[ResearchService] Cache miss for query: ${query.query}`);
    }

    try {
      let serpResults: SerpResult[] | undefined;
      let contentResults: ContentResult[] | undefined;

      // Execute based on query type
      switch (query.type) {
        case 'serp':
          serpResults = await this.executeSerpQuery(query);
          break;

        case 'content':
          contentResults = await this.executeContentQuery(query);
          break;

        case 'hybrid':
          [serpResults, contentResults] = await Promise.all([
            this.executeSerpQuery(query),
            this.executeContentQuery(query),
          ]);
          break;

        default:
          throw new ResearchError(
            `Invalid query type: ${query.type}`,
            ResearchErrorCode.INVALID_QUERY,
            { query }
          );
      }

      // Build result
      const executionTime = Date.now() - startTime;
      const result: ResearchResult = {
        query,
        serpResults,
        contentResults,
        metadata: {
          resultCount: (serpResults?.length || 0) + (contentResults?.length || 0),
          executionTime,
          fromCache: false,
          rateLimitStatus: {
            remaining: this.webSearchLimiter.getStats().currentTokens,
            resetAt: new Date(Date.now() + 60000), // Approximate
          },
        },
        timestamp: new Date(),
      };

      // Cache result
      await this.cache.set(query, result);

      return result;
    } catch (error) {
      if (error instanceof ResearchError) {
        throw error;
      }

      // SECURITY FIX: Sanitize error before throwing to prevent information leakage
      const sanitizedError = ErrorSanitizer.sanitize(error as Error);
      const safeMessage = ErrorSanitizer.createSafeMessage(
        error as Error,
        'Research execution failed'
      );

      throw new ResearchError(safeMessage, ResearchErrorCode.UNKNOWN_ERROR, {
        cause: sanitizedError,
        code: 'EXECUTION_ERROR',
      });
    }
  }

  /**
   * Execute SERP query via WebSearch MCP tool
   *
   * @param query - Research query
   * @returns Normalized SERP results
   */
  private async executeSerpQuery(query: ResearchQuery): Promise<SerpResult[]> {
    // Acquire rate limit token
    await this.webSearchLimiter.acquireToken(query);

    try {
      // Call MCP WebSearch tool
      // NOTE: Actual MCP integration would use the MCP SDK or API
      // This is a placeholder that shows the expected interface
      const maxResults = (query.options && 'maxResults' in query.options) ? query.options.maxResults : 10;
      const rawResults = await this.callWebSearch(query.query, {
        maxResults,
      });

      // Parse and normalize results
      return this.parseSerpResults(rawResults);
    } catch (error) {
      // SECURITY FIX: Sanitize error to prevent query leakage in error messages
      const sanitizedError = ErrorSanitizer.sanitize(error as Error);
      const safeMessage = ErrorSanitizer.createSafeMessage(
        error as Error,
        'WebSearch execution failed'
      );

      throw new ResearchError(safeMessage, ResearchErrorCode.FETCH_ERROR, {
        cause: sanitizedError,
        code: 'WEBSEARCH_FAILED',
      });
    }
  }

  /**
   * Execute content query via WebFetch MCP tool
   *
   * @param query - Research query
   * @returns Normalized content results
   */
  private async executeContentQuery(query: ResearchQuery): Promise<ContentResult[]> {
    const targetUrl = (query.options && 'targetUrl' in query.options) ? query.options.targetUrl : undefined;

    if (!targetUrl) {
      throw new ResearchError(
        'targetUrl is required for content queries',
        ResearchErrorCode.INVALID_QUERY,
        { query }
      );
    }

    // Acquire rate limit token
    await this.webFetchLimiter.acquireToken(query);

    try {
      // Call MCP WebFetch tool
      const deepCrawl = (query.options && 'deepCrawl' in query.options) ? query.options.deepCrawl : false;
      const rawContent = await this.callWebFetch(targetUrl, {
        deepCrawl: deepCrawl || false,
      });

      // Parse and normalize content
      return [this.parseContentResult(rawContent, targetUrl)];
    } catch (error) {
      // SECURITY FIX: Sanitize error to prevent URL leakage in error messages
      const sanitizedError = ErrorSanitizer.sanitize(error as Error);
      const safeMessage = ErrorSanitizer.createSafeMessage(
        error as Error,
        'WebFetch execution failed'
      );

      throw new ResearchError(safeMessage, ResearchErrorCode.FETCH_ERROR, {
        cause: sanitizedError,
        code: 'WEBFETCH_FAILED',
      });
    }
  }

  /**
   * Call WebSearch MCP tool
   *
   * @param query - Search query
   * @param options - Search options
   * @returns Raw search results
   */
  private async callWebSearch(
    query: string,
    options?: Record<string, unknown>
  ): Promise<unknown> {
    // Placeholder for actual MCP integration
    // In production, this would use the MCP SDK or make API calls to the WebSearch tool
    if (this.config.verbose) {
      console.log(`[ResearchService] Calling WebSearch: ${query}`, options);
    }

    // Simulate MCP call delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Return mock data structure
    return {
      results: [
        {
          title: 'Example Result',
          url: 'https://example.com',
          description: 'Example description',
          position: 1,
        },
      ],
    };
  }

  /**
   * Call WebFetch MCP tool
   *
   * @param url - URL to fetch
   * @param options - Fetch options
   * @returns Raw content data
   */
  private async callWebFetch(url: string, options?: Record<string, unknown>): Promise<unknown> {
    // Placeholder for actual MCP integration
    if (this.config.verbose) {
      console.log(`[ResearchService] Calling WebFetch: ${url}`, options);
    }

    // Simulate MCP call delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Return mock data structure
    return {
      url,
      title: 'Example Page',
      content: 'Example content text',
      html: '<html><body>Example</body></html>',
      statusCode: 200,
    };
  }

  /**
   * Parse raw SERP results into normalized format
   *
   * @param rawResults - Raw results from WebSearch
   * @returns Normalized SERP results
   */
  private parseSerpResults(rawResults: unknown): SerpResult[] {
    try {
      // Type guard and parse logic
      if (!rawResults || typeof rawResults !== 'object') {
        return [];
      }

      const data = rawResults as Record<string, unknown>;
      const results = Array.isArray(data.results) ? data.results : [];

      return results.map((item: unknown, index: number) => {
        const result = item as Record<string, unknown>;

        return {
          title: String(result.title || ''),
          url: String(result.url || ''),
          description: String(result.description || result.snippet || ''),
          position: Number(result.position || index + 1),
          features: Array.isArray(result.features)
            ? (result.features as string[])
            : undefined,
          raw: result,
        };
      });
    } catch (error) {
      // SECURITY FIX: Don't leak raw results in error message
      const sanitizedError = ErrorSanitizer.sanitize(error as Error);

      throw new ResearchError(
        'Failed to parse search results',
        ResearchErrorCode.PARSE_ERROR,
        {
          cause: sanitizedError,
          code: 'SERP_PARSE_FAILED',
        }
      );
    }
  }

  /**
   * Parse raw content data into normalized format
   *
   * @param rawContent - Raw content from WebFetch
   * @param url - Source URL
   * @returns Normalized content result
   */
  private parseContentResult(rawContent: unknown, url: string): ContentResult {
    try {
      if (!rawContent || typeof rawContent !== 'object') {
        throw new Error('Invalid content data');
      }

      const data = rawContent as Record<string, unknown>;
      const content = String(data.content || data.text || '');
      const html = String(data.html || '');

      // Extract metadata from HTML (simplified)
      const wordCount = content.split(/\s+/).length;
      const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
      const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
      const h3Count = (html.match(/<h3[^>]*>/gi) || []).length;
      const internalLinks = (html.match(/<a[^>]*href=["'][^"']*["'][^>]*>/gi) || []).length;
      const images = (html.match(/<img[^>]*>/gi) || []).length;

      // Extract schema types
      const schemaMatches = html.match(/@type["']?\s*:\s*["']([^"']+)["']/gi) || [];
      const schema = schemaMatches.map((match) => {
        const type = match.match(/["']([^"']+)["']$/);
        return type ? type[1] : '';
      });

      return {
        url,
        title: String(data.title || ''),
        content,
        metadata: {
          wordCount,
          headings: {
            h1: h1Count,
            h2: h2Count,
            h3: h3Count,
          },
          internalLinks,
          externalLinks: 0, // Simplified - would need domain analysis
          images,
          schema: schema.length > 0 ? schema : undefined,
        },
        statusCode: Number(data.statusCode || 200),
        fetchedAt: new Date(),
      };
    } catch (error) {
      // SECURITY FIX: Don't leak raw content or URLs in error message
      const sanitizedError = ErrorSanitizer.sanitize(error as Error);

      throw new ResearchError(
        'Failed to parse content',
        ResearchErrorCode.PARSE_ERROR,
        {
          cause: sanitizedError,
          code: 'CONTENT_PARSE_FAILED',
        }
      );
    }
  }

  /**
   * Validate research query
   *
   * @param query - Query to validate
   * @throws ResearchError if validation fails
   */
  private validateQuery(query: ResearchQuery): void {
    if (!query.query || typeof query.query !== 'string') {
      throw new ResearchError(
        'Query text is required',
        ResearchErrorCode.INVALID_QUERY,
        { query }
      );
    }

    if (!['serp', 'content', 'hybrid'].includes(query.type)) {
      throw new ResearchError(
        `Invalid query type: ${query.type}`,
        ResearchErrorCode.INVALID_QUERY,
        { query }
      );
    }

    const targetUrl = (query.options && 'targetUrl' in query.options) ? query.options.targetUrl : undefined;
    if (query.type === 'content' && !targetUrl) {
      throw new ResearchError(
        'targetUrl is required for content queries',
        ResearchErrorCode.INVALID_QUERY,
        { query }
      );
    }

    const maxResults = (query.options && 'maxResults' in query.options) ? query.options.maxResults : undefined;
    if (maxResults && maxResults < 1) {
      throw new ResearchError(
        'maxResults must be >= 1',
        ResearchErrorCode.INVALID_QUERY,
        { query }
      );
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get rate limiter statistics
   */
  getRateLimiterStats() {
    return {
      websearch: this.webSearchLimiter.getStats(),
      webfetch: this.webFetchLimiter.getStats(),
    };
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateCacheByPattern(pattern: string): Promise<number> {
    return await this.cache.invalidateByPattern(pattern);
  }
}

/**
 * Default research service instance
 */
export const researchService = new ResearchService({ verbose: false });

/**
 * Convenience function for SERP queries
 *
 * @param query - Search query text
 * @param options - Optional query options
 * @returns Research result with SERP data
 */
export async function searchSerp(
  query: string,
  options?: { maxResults?: number; priority?: 'low' | 'normal' | 'high' }
): Promise<ResearchResult> {
  return researchService.execute({
    query,
    type: 'serp',
    options: {
      maxResults: options?.maxResults,
      priority: options?.priority,
    },
  });
}

/**
 * Convenience function for content fetching
 *
 * @param url - URL to fetch
 * @param options - Optional query options
 * @returns Research result with content data
 */
export async function fetchContent(
  url: string,
  options?: { deepCrawl?: boolean; priority?: 'low' | 'normal' | 'high' }
): Promise<ResearchResult> {
  return researchService.execute({
    query: `fetch:${url}`,
    type: 'content',
    options: {
      targetUrl: url,
      deepCrawl: options?.deepCrawl,
      priority: options?.priority,
    },
  });
}

/**
 * Convenience function for hybrid queries (SERP + content)
 *
 * @param query - Search query text
 * @param targetUrl - URL to fetch content from
 * @param options - Optional query options
 * @returns Research result with both SERP and content data
 */
export async function hybridResearch(
  query: string,
  targetUrl: string,
  options?: {
    maxResults?: number;
    deepCrawl?: boolean;
    priority?: 'low' | 'normal' | 'high';
  }
): Promise<ResearchResult> {
  return researchService.execute({
    query,
    type: 'hybrid',
    options: {
      maxResults: options?.maxResults,
      targetUrl,
      deepCrawl: options?.deepCrawl,
      priority: options?.priority,
    },
  });
}
