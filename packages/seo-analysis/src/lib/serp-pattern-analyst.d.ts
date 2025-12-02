/**
 * SERP Pattern Analyst Agent
 *
 * @module @claude-flow-novice/seo-analysis/lib/serp-pattern-analyst
 * @description SERP pattern analysis agent for SEO Intelligence Phase 2 Sprint 2
 * @version 1.0.0
 *
 * Provides comprehensive SERP analysis including:
 * - SERP feature detection (featured snippets, PAA, knowledge panels, etc.)
 * - Ranking pattern analysis (domain authority, content types, freshness)
 * - Semantic clustering and topic extraction
 * - Actionable recommendation generation
 */
import { SERPAnalysisConfig, SERPAnalysisResult } from '../types/serp-analysis';
import { ResearchService } from './research-service';
/**
 * SERP Pattern Analyst Agent
 *
 * Analyzes search engine results pages to extract patterns and generate
 * actionable SEO recommendations.
 *
 * @example
 * ```typescript
 * const analyst = new SERPPatternAnalyst({
 *   keyword: 'best running shoes 2024',
 *   maxResults: 10,
 *   enableContentScraping: true
 * });
 *
 * const result = await analyst.analyze();
 * console.log(`Found ${result.features.length} SERP features`);
 * console.log(`Generated ${result.recommendations.length} recommendations`);
 * ```
 */
export declare class SERPPatternAnalyst {
    private config;
    private researchService?;
    private warnings;
    private startTime;
    private httpsAgent;
    /**
     * Create a new SERPPatternAnalyst
     *
     * @param config - Analysis configuration
     */
    constructor(config: SERPAnalysisConfig);
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
     * @throws {SERPAnalysisError} If configuration is invalid
     * @private
     */
    private validateConfig;
    /**
     * Validate API key configuration
     *
     * @throws {SERPAnalysisError} If no valid API keys are configured
     * @private
     */
    private validateApiKeyConfig;
    /**
     * Check if API key is a placeholder
     *
     * @param key - API key to check
     * @returns True if placeholder
     * @private
     */
    private isPlaceholderApiKey;
    /**
     * Sanitize error messages to prevent sensitive data exposure
     *
     * @param message - Original error message
     * @returns Sanitized error message
     * @private
     */
    private sanitizeErrorMessage;
    /**
     * Main analysis method
     *
     * @returns Complete SERP analysis result
     * @throws {SERPAnalysisError} If analysis fails
     */
    analyze(): Promise<SERPAnalysisResult>;
    /**
     * Fetch search results from API
     *
     * @returns Array of search results
     * @throws {SERPAnalysisError} If fetch fails
     * @private
     */
    private fetchSearchResults;
    /**
     * Fetch results from Google Custom Search API
     *
     * @param apiKey - Google API key
     * @param searchEngineId - Custom Search Engine ID
     * @returns Array of search results
     * @throws {SERPAnalysisError} If fetch fails
     * @private
     */
    private fetchFromGoogleCustomSearch;
    /**
     * Fetch results from DataForSEO API
     *
     * @param apiKey - DataForSEO API key (base64-encoded login:password)
     * @returns Array of search results
     * @throws {SERPAnalysisError} If fetch fails
     * @private
     */
    private fetchFromDataForSEO;
    /**
     * Parse Google Custom Search results
     *
     * @param items - Google search items
     * @returns Parsed search results
     * @private
     */
    private parseGoogleSearchResults;
    /**
     * Parse DataForSEO results
     *
     * @param items - DataForSEO result items
     * @returns Parsed search results
     * @private
     */
    private parseDataForSEOResults;
    /**
     * Extract domain from URL
     *
     * @param url - Full URL
     * @returns Domain name
     * @private
     */
    private extractDomain;
    /**
     * Extract URL pattern
     *
     * @param url - Full URL
     * @returns URL pattern (e.g., /blog/{category}/{slug})
     * @private
     */
    private extractUrlPattern;
    /**
     * Detect freshness signals in title and URL
     *
     * @param title - Page title
     * @param url - Page URL
     * @returns Array of detected freshness signals
     * @private
     */
    private detectFreshnessSignals;
    /**
     * Classify content type based on title, snippet, and URL
     *
     * @param title - Page title
     * @param snippet - Meta description
     * @param url - Page URL
     * @returns Classified content type
     * @private
     */
    private classifyContentType;
    /**
     * Detect SERP features from search results
     *
     * @param results - Search results
     * @returns Detected SERP features
     * @private
     */
    private detectFeatures;
    /**
     * Analyze domain authority distribution using SpyFu backlink data
     *
     * @param results - Search results
     * @returns Domain authority pattern analysis
     * @private
     */
    private analyzeDomainAuthority;
    /**
     * Fetch backlinks from SpyFu for a domain
     *
     * @param domain - Domain to lookup
     * @returns Number of backlinks (0 if lookup fails)
     * @private
     */
    private fetchBacklinksFromSpyFu;
    /**
     * Analyze ranking patterns across search results
     *
     * @param results - Search results
     * @returns Ranking pattern analysis
     * @private
     */
    private analyzeRankingPatterns;
    /**
     * Analyze title and meta patterns
     *
     * @param results - Search results
     * @returns Title and meta pattern analysis
     * @private
     */
    private analyzeTitleMetaPatterns;
    /**
     * Extract common title patterns
     *
     * @param results - Search results
     * @returns Common title patterns
     * @private
     */
    private extractTitlePatterns;
    /**
     * Analyze URL structure patterns
     *
     * @param results - Search results
     * @returns URL structure pattern analysis
     * @private
     */
    private analyzeUrlStructurePatterns;
    /**
     * Analyze content type distribution
     *
     * @param results - Search results
     * @returns Content type distribution
     * @private
     */
    private analyzeContentTypeDistribution;
    /**
     * Analyze freshness signal distribution
     *
     * @param results - Search results
     * @returns Freshness signal distribution
     * @private
     */
    private analyzeFreshnessSignalDistribution;
    /**
     * Extract semantic clusters from search results
     *
     * @param results - Search results
     * @returns Semantic clusters
     * @private
     */
    private extractSemanticClusters;
    /**
     * Extract keywords from text using simple frequency analysis
     *
     * @param text - Input text
     * @returns Top keywords
     * @private
     */
    private extractKeywords;
    /**
     * Identify content gaps from analysis
     *
     * @param results - Search results
     * @param features - SERP features
     * @param clusters - Semantic clusters
     * @returns Identified content gaps
     * @private
     */
    private identifyContentGaps;
    /**
     * Generate actionable recommendations
     *
     * @param results - Search results
     * @param features - SERP features
     * @param patterns - Ranking patterns
     * @param clusters - Semantic clusters
     * @param gaps - Content gaps
     * @returns Array of recommendations
     * @private
     */
    private generateRecommendations;
    /**
     * Enrich search results with scraped content analysis
     *
     * @param results - Search results to enrich
     * @private
     */
    private enrichWithScrapedContent;
    /**
     * Calculate overall analysis confidence
     *
     * @param results - Search results
     * @param features - SERP features
     * @param patterns - Ranking patterns
     * @param clusters - Semantic clusters
     * @returns Confidence score (0.0-1.0)
     * @private
     */
    private calculateOverallConfidence;
    /**
     * Determine which API provider was used
     *
     * @returns API provider identifier
     * @private
     */
    private determineApiProvider;
    /**
     * Calculate average of array
     *
     * @param numbers - Array of numbers
     * @returns Average value
     * @private
     */
    private average;
}
//# sourceMappingURL=serp-pattern-analyst.d.ts.map