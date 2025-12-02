/**
 * Competitor Deep Analysis Type Definitions
 *
 * @module planning/seo/types/competitor-analysis
 * @description Type definitions for deep competitor analysis (Phase 2 Sprint 1)
 * @version 2.0.0
 *
 * Provides comprehensive types for:
 * - Site-wide crawling and analysis (50+ pages)
 * - Hub page identification algorithms
 * - Site architecture pattern extraction
 * - Content strategy analysis
 * - Internal linking pattern analysis
 * - Content gap identification
 */
/**
 * Configuration for competitor deep analysis
 */
export interface CompetitorAnalysisConfig {
    /** Target competitor domain to analyze */
    domain: string;
    /** Maximum pages to crawl (default: 50, max: 200) */
    maxPages?: number;
    /** Maximum crawl depth (default: 3, max: 5) */
    maxDepth?: number;
    /** Enable verbose logging */
    verbose?: boolean;
    /** Rate limit delay between requests (ms, default: 1000) */
    rateLimitMs?: number;
    /** Firecrawl API key (optional, uses env var if not provided) */
    firecrawlApiKey?: string;
    /** Timeout for individual requests (ms, default: 30000) */
    requestTimeoutMs?: number;
}
/**
 * Site architecture pattern extracted from analysis
 */
export interface SiteArchitecturePattern {
    /** URL structure pattern (e.g., /blog/{category}/{slug}) */
    urlStructure: string;
    /** Pattern prevalence (number of pages matching pattern) */
    prevalence: number;
    /** Example URLs matching this pattern */
    examples: string[];
    /** Confidence score for pattern validity (0.0-1.0) */
    confidence: number;
    /** Navigation depth for this pattern */
    avgDepth: number;
    /** Internal links pointing to pages in this pattern */
    avgInternalLinks: number;
}
/**
 * Content strategy pattern extracted from analysis
 */
export interface ContentStrategyPattern {
    /** Content type identifier (blog, guide, product, landing, etc.) */
    contentType: string;
    /** Number of pages of this type */
    pageCount: number;
    /** Average word count for this content type */
    avgWordCount: number;
    /** Average title length */
    avgTitleLength: number;
    /** Common heading structures (H1-H6 patterns) */
    headingStructures: string[];
    /** Average number of headings per page */
    avgHeadingCount: number;
    /** Average number of images per page */
    avgImageCount: number;
    /** Common metadata patterns (schema, meta tags) */
    metadataPatterns: string[];
    /** Publishing frequency (pages per month, if timestamps available) */
    publishingFrequency?: number;
    /** Content freshness indicators */
    freshnessIndicators: {
        hasDatestamps: boolean;
        avgAgeInDays?: number;
        updateFrequency?: string;
    };
}
/**
 * Hub page metadata and characteristics
 */
export interface HubPageMetadata {
    /** Page URL */
    url: string;
    /** Page title */
    title: string;
    /** Number of internal links pointing TO this page */
    incomingLinkCount: number;
    /** Number of internal links FROM this page */
    outgoingLinkCount: number;
    /** PageRank-style centrality score */
    centralityScore: number;
    /** Navigation depth from homepage (0 = homepage) */
    depth: number;
    /** Content type classification */
    contentType: string;
    /** Hub type (topical, navigational, resource) */
    hubType: 'topical' | 'navigational' | 'resource' | 'mixed';
    /** Topics/keywords associated with hub */
    topics: string[];
    /** Confidence this is a hub page (0.0-1.0) */
    confidence: number;
}
/**
 * Internal linking pattern analysis
 */
export interface InternalLinkingPattern {
    /** Pattern type identifier */
    patternType: string;
    /** Pattern description */
    description: string;
    /** Source content type */
    sourceContentType: string;
    /** Target content type */
    targetContentType: string;
    /** Number of instances found */
    instanceCount: number;
    /** Average link density for this pattern */
    avgLinkDensity: number;
    /** Anchor text patterns */
    anchorTextPatterns: string[];
    /** Link placement (contextual, navigational, footer) */
    placement: 'contextual' | 'navigational' | 'footer' | 'sidebar' | 'mixed';
    /** Confidence score (0.0-1.0) */
    confidence: number;
}
/**
 * Content gap identified through analysis
 */
export interface ContentGap {
    /** Gap type (missing topic, thin content, underserved keyword) */
    gapType: 'missing_topic' | 'thin_content' | 'underserved_keyword' | 'outdated_content';
    /** Topic or keyword identifier */
    topic: string;
    /** Opportunity score (0.0-1.0, higher = better opportunity) */
    opportunityScore: number;
    /** Estimated search volume (if available) */
    searchVolume?: number;
    /** Competitor coverage (number of competitor pages on topic) */
    competitorCoverage: number;
    /** Recommended content type */
    recommendedContentType: string;
    /** Priority level (high, medium, low) */
    priority: 'high' | 'medium' | 'low';
    /** Reasoning for gap identification */
    reasoning: string;
}
/**
 * Crawled page data
 */
export interface CrawledPage {
    /** Page URL */
    url: string;
    /** Page title */
    title: string;
    /** Meta description */
    metaDescription?: string;
    /** Page content (text only) */
    content: string;
    /** Word count */
    wordCount: number;
    /** Heading structure */
    headings: {
        h1: string[];
        h2: string[];
        h3: string[];
        h4: string[];
        h5: string[];
        h6: string[];
    };
    /** Internal links found on page */
    internalLinks: string[];
    /** External links found on page */
    externalLinks: string[];
    /** Images on page */
    images: {
        src: string;
        alt?: string;
    }[];
    /** Schema markup found */
    schemaTypes: string[];
    /** Crawl depth from starting URL */
    depth: number;
    /** Crawl timestamp */
    crawledAt: Date;
    /** HTTP status code */
    statusCode: number;
    /** Load time (ms) */
    loadTimeMs: number;
    /** Estimated content type */
    contentType: string;
}
/**
 * Complete competitor analysis result
 */
export interface CompetitorAnalysisResult {
    /** Analyzed domain */
    domain: string;
    /** Analysis timestamp */
    analyzedAt: Date;
    /** Total pages crawled */
    pagesCrawled: number;
    /** Maximum depth reached */
    maxDepthReached: number;
    /** Total time for analysis (ms) */
    totalTimeMs: number;
    /** Crawled pages data */
    pages: CrawledPage[];
    /** Site architecture patterns */
    architecturePatterns: SiteArchitecturePattern[];
    /** Content strategy patterns */
    contentStrategyPatterns: ContentStrategyPattern[];
    /** Identified hub pages */
    hubPages: HubPageMetadata[];
    /** Internal linking patterns */
    internalLinkingPatterns: InternalLinkingPattern[];
    /** Content gaps identified */
    contentGaps: ContentGap[];
    /** Site-wide metrics */
    siteMetrics: {
        avgPageWordCount: number;
        avgInternalLinksPerPage: number;
        avgExternalLinksPerPage: number;
        avgImagesPerPage: number;
        avgLoadTimeMs: number;
        schemaImplementationRate: number;
        contentFreshnessScore: number;
    };
    /** Analysis metadata */
    metadata: {
        configUsed: CompetitorAnalysisConfig;
        errorsEncountered: string[];
        warnings: string[];
        confidenceScore: number;
    };
}
/**
 * Firecrawl API response type
 */
export interface FirecrawlResponse {
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
 * Crawl queue entry
 */
export interface CrawlQueueEntry {
    url: string;
    depth: number;
    parentUrl?: string;
}
/**
 * Crawl result for individual page
 */
export interface CrawlResult {
    success: boolean;
    page?: CrawledPage;
    error?: {
        message: string;
        code?: string;
        url: string;
    };
}
/**
 * Hub page scoring factors
 */
export interface HubPageScoringFactors {
    /** Incoming link weight */
    incomingLinkWeight: number;
    /** Outgoing link weight */
    outgoingLinkWeight: number;
    /** Depth weight (lower depth = higher score) */
    depthWeight: number;
    /** Content quality weight */
    contentQualityWeight: number;
    /** Topical relevance weight */
    topicalRelevanceWeight: number;
}
/**
 * Pattern extraction configuration
 */
export interface PatternExtractionConfig {
    /** Minimum pattern instances required */
    minInstances: number;
    /** Minimum confidence threshold */
    minConfidence: number;
    /** Enable fuzzy matching for patterns */
    fuzzyMatching: boolean;
    /** Similarity threshold for fuzzy matching */
    similarityThreshold: number;
}
/**
 * Competitor analysis error codes
 */
export declare enum CompetitorAnalysisErrorCode {
    INVALID_DOMAIN = "INVALID_DOMAIN",
    FIRECRAWL_API_ERROR = "FIRECRAWL_API_ERROR",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    CRAWL_TIMEOUT = "CRAWL_TIMEOUT",
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
    ANALYSIS_FAILED = "ANALYSIS_FAILED"
}
/**
 * Competitor analysis error
 */
export declare class CompetitorAnalysisError extends Error {
    readonly code: CompetitorAnalysisErrorCode;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: CompetitorAnalysisErrorCode, message: string, details?: Record<string, unknown> | undefined);
}
/**
 * Type guard: Check if result is a successful crawl
 */
export declare function isSuccessfulCrawl(result: CrawlResult): result is CrawlResult & {
    page: CrawledPage;
};
/**
 * Type guard: Check if page is a hub page (by confidence threshold)
 */
export declare function isHubPage(metadata: HubPageMetadata, minConfidence?: number): boolean;
/**
 * Type guard: Check if content gap is high priority
 */
export declare function isHighPriorityGap(gap: ContentGap): boolean;
/**
 * Type guard: Check if pattern is high confidence
 */
export declare function isHighConfidencePattern(pattern: SiteArchitecturePattern | InternalLinkingPattern, minConfidence?: number): boolean;
//# sourceMappingURL=competitor-analysis.d.ts.map