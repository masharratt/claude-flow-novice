/**
 * Competitor Deep Analyst Agent
 *
 * @module @claude-flow-novice/seo-analysis/lib/competitor-deep-analyst
 * @description Deep competitor analysis agent for SEO Intelligence Phase 2 Sprint 1
 * @version 2.0.0
 *
 * Provides comprehensive competitor analysis including:
 * - Site-wide crawling (50+ pages with depth control) using Firecrawl API
 * - Hub page identification using centrality algorithms
 * - Site architecture pattern extraction
 * - Content strategy analysis with Cheerio HTML parsing
 * - Internal linking pattern discovery
 * - Content gap identification
 */
import { CompetitorAnalysisConfig, CompetitorAnalysisResult } from '../types/competitor-analysis';
import { ResearchService } from './research-service';
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
export declare class CompetitorDeepAnalystAgent {
    private config;
    private researchService?;
    private crawledPages;
    private errors;
    private warnings;
    /**
     * Create a new CompetitorDeepAnalystAgent
     *
     * @param config - Analysis configuration
     */
    constructor(config: CompetitorAnalysisConfig);
    /**
     * Set research service for integration testing
     *
     * @param service - ResearchService instance
     * @internal
     */
    setResearchService(service: ResearchService): void;
    /**
     * Validate configuration
     *
     * @throws {CompetitorAnalysisError} If configuration is invalid
     */
    private validateConfig;
    /**
     * Validate Firecrawl API key configuration
     *
     * @throws {CompetitorAnalysisError} If API key is missing or invalid
     * @private
     */
    private validateApiKeyConfig;
    /**
     * Sanitize error messages to prevent sensitive data exposure
     *
     * @param message - Original error message
     * @returns Sanitized error message
     * @private
     */
    private sanitizeErrorMessage;
    /**
     * Validate URL for SSRF prevention
     *
     * Blocks private/local IP ranges, localhost, and other risky targets
     *
     * @param url - URL to validate
     * @returns True if URL is safe to request
     * @private
     */
    private isUrlSafe;
    /**
     * Execute full competitor analysis
     *
     * @returns Complete analysis result
     * @throws {CompetitorAnalysisError} If analysis fails
     */
    analyze(): Promise<CompetitorAnalysisResult>;
    /**
     * Crawl competitor site with depth-first traversal
     *
     * @private
     */
    private crawlSite;
    /**
     * Crawl individual page
     *
     * @param url - Page URL to crawl
     * @param depth - Crawl depth
     * @returns Crawl result
     * @private
     */
    private crawlPage;
    /**
     * Fetch page content using Firecrawl API
     *
     * @param url - URL to fetch
     * @returns Firecrawl API response
     * @private
     */
    private fetchWithFirecrawl;
    /**
     * Parse Firecrawl response into CrawledPage
     *
     * @param response - Firecrawl API response
     * @param url - Original URL
     * @param depth - Crawl depth
     * @returns Parsed page data
     * @private
     */
    private parseFirecrawlResponse;
    /**
     * Check if link is internal to analyzed domain
     *
     * @param link - Link URL
     * @returns True if internal link
     * @private
     */
    private isInternalLink;
    /**
     * Classify content type based on URL pattern
     *
     * @param url - Page URL
     * @returns Content type classification
     * @private
     */
    private classifyContentType;
    /**
     * Extract site architecture patterns from crawled pages
     *
     * @returns Architecture patterns
     * @private
     */
    private extractArchitecturePatterns;
    /**
     * Extract URL pattern from specific URL
     *
     * @param url - Specific URL
     * @returns Generalized URL pattern
     * @private
     */
    private extractUrlPattern;
    /**
     * Extract content strategy patterns
     *
     * @returns Content strategy patterns
     * @private
     */
    private extractContentStrategyPatterns;
    /**
     * Extract common heading structures from pages
     *
     * @param pages - Pages to analyze
     * @returns Common heading structures
     * @private
     */
    private extractHeadingStructures;
    /**
     * Identify hub pages using centrality algorithm
     *
     * @returns Hub page metadata
     * @private
     */
    private identifyHubPages;
    /**
     * Build link graph for centrality calculations
     *
     * @returns Link graph with incoming/outgoing links
     * @private
     */
    private buildLinkGraph;
    /**
     * Calculate hub score for a page
     *
     * @param factors - Scoring factors
     * @returns Hub score (0.0-1.0)
     * @private
     */
    private calculateHubScore;
    /**
     * Classify hub type based on page characteristics
     *
     * @param page - Page to classify
     * @returns Hub type
     * @private
     */
    private classifyHubType;
    /**
     * Extract topics from page content
     *
     * @param page - Page to extract topics from
     * @returns Topic keywords
     * @private
     */
    private extractTopics;
    /**
     * Analyze internal linking patterns
     *
     * @returns Internal linking patterns
     * @private
     */
    private analyzeInternalLinkingPatterns;
    /**
     * Identify content gaps
     *
     * @returns Content gaps
     * @private
     */
    private identifyContentGaps;
    /**
     * Calculate site-wide metrics
     *
     * @returns Site metrics
     * @private
     */
    private calculateSiteMetrics;
    /**
     * Calculate overall confidence score for analysis
     *
     * @returns Confidence score (0.0-1.0)
     * @private
     */
    private calculateOverallConfidence;
    /**
     * Log message if verbose mode enabled
     *
     * @param message - Message to log
     * @private
     */
    private log;
    /**
     * Sleep for specified milliseconds
     *
     * @param ms - Milliseconds to sleep
     * @private
     */
    private sleep;
}
//# sourceMappingURL=competitor-deep-analyst.d.ts.map