/**
 * SERP Pattern Analysis Type Definitions
 *
 * @module @claude-flow-novice/seo-analysis/types/serp-analysis
 * @description Type definitions for SERP pattern analysis (Phase 2 Sprint 2)
 * @version 1.0.0
 *
 * Provides comprehensive types for:
 * - SERP feature detection (featured snippets, PAA, knowledge panels)
 * - Ranking pattern analysis across top 10 results
 * - Semantic clustering and topic extraction
 * - Actionable recommendation generation
 */

// ============================================================================
// CORE ANALYSIS TYPES
// ============================================================================

/**
 * Configuration for SERP pattern analysis
 */
export interface SERPAnalysisConfig {
  /** Target keyword to analyze */
  keyword: string;

  /** Google Custom Search API key (optional, uses env var if not provided) */
  googleApiKey?: string;

  /** Google Custom Search Engine ID (optional, uses env var if not provided) */
  googleSearchEngineId?: string;

  /** DataForSEO API key as alternative to Google Custom Search */
  dataForSeoApiKey?: string;

  /** SpyFu API key for backlink/domain authority data */
  spyfuApiKey?: string;

  /** Maximum number of results to analyze (default: 10) */
  maxResults?: number;

  /** Enable detailed content scraping for semantic analysis */
  enableContentScraping?: boolean;

  /** Timeout for individual requests (ms, default: 30000) */
  requestTimeoutMs?: number;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Rate limit delay between requests (ms, default: 1000) */
  rateLimitMs?: number;
}

/**
 * SERP feature types that can be detected
 */
export enum SERPFeatureType {
  FEATURED_SNIPPET = 'featured_snippet',
  PEOPLE_ALSO_ASK = 'people_also_ask',
  KNOWLEDGE_PANEL = 'knowledge_panel',
  IMAGE_PACK = 'image_pack',
  VIDEO_CAROUSEL = 'video_carousel',
  LOCAL_PACK = 'local_pack',
  SHOPPING_RESULTS = 'shopping_results',
  RELATED_SEARCHES = 'related_searches',
  TOP_STORIES = 'top_stories',
  SITE_LINKS = 'site_links',
  TWITTER_CAROUSEL = 'twitter_carousel',
  RECIPES = 'recipes',
  FLIGHTS = 'flights',
  HOTELS = 'hotels',
  JOBS = 'jobs',
  EVENTS = 'events',
}

/**
 * Featured snippet subtypes
 */
export enum FeaturedSnippetType {
  PARAGRAPH = 'paragraph',
  LIST = 'list',
  TABLE = 'table',
  VIDEO = 'video',
}

/**
 * Detected SERP feature with metadata
 */
export interface SERPFeature {
  /** Feature type */
  type: SERPFeatureType;

  /** Featured snippet subtype (if applicable) */
  snippetType?: FeaturedSnippetType;

  /** Position in SERP (0-based) */
  position: number;

  /** Domain owning the feature (if applicable) */
  domain?: string;

  /** Full URL owning the feature */
  url?: string;

  /** Feature content/text */
  content?: string;

  /** Feature title (for knowledge panels, etc.) */
  title?: string;

  /** Related questions (for PAA boxes) */
  questions?: string[];

  /** Related searches (for related searches box) */
  relatedSearches?: string[];

  /** Confidence score for detection (0.0-1.0) */
  confidence: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Content type classification
 */
export enum ContentType {
  BLOG = 'blog',
  PRODUCT = 'product',
  GUIDE = 'guide',
  NEWS = 'news',
  VIDEO = 'video',
  LANDING_PAGE = 'landing_page',
  FORUM = 'forum',
  DOCUMENTATION = 'documentation',
  ECOMMERCE = 'ecommerce',
  SOCIAL = 'social',
  OTHER = 'other',
}

/**
 * Freshness signal types
 */
export enum FreshnessSignal {
  DATE_IN_TITLE = 'date_in_title',
  DATE_IN_URL = 'date_in_url',
  RECENT_PUBLICATION = 'recent_publication',
  FREQUENT_UPDATES = 'frequent_updates',
  NEWS_ARTICLE = 'news_article',
  NONE = 'none',
}

/**
 * Individual search result data
 */
export interface SearchResult {
  /** Result position (1-10+) */
  position: number;

  /** Page title */
  title: string;

  /** Page URL */
  url: string;

  /** Domain name */
  domain: string;

  /** Meta description or snippet */
  snippet: string;

  /** Estimated domain authority (if available) */
  domainAuthority?: number;

  /** Detected content type */
  contentType: ContentType;

  /** Word count (if content scraped) */
  wordCount?: number;

  /** Title length in characters */
  titleLength: number;

  /** Meta description length */
  snippetLength: number;

  /** Detected freshness signals */
  freshnessSignals: FreshnessSignal[];

  /** URL structure pattern */
  urlPattern: string;

  /** Extracted headings (if content scraped) */
  headings?: {
    h1: string[];
    h2: string[];
    h3: string[];
  };

  /** Detected schema types */
  schemaTypes?: string[];

  /** Site links present */
  hasSiteLinks: boolean;

  /** Rich snippet features */
  richSnippetFeatures: string[];
}

/**
 * Ranking pattern extracted from top results
 */
export interface RankingPattern {
  /** Pattern type identifier */
  patternType: string;

  /** Pattern description */
  description: string;

  /** Prevalence across top results (0.0-1.0) */
  prevalence: number;

  /** Positions where pattern appears */
  positions: number[];

  /** Example results demonstrating pattern */
  examples: {
    position: number;
    url: string;
    title: string;
  }[];

  /** Pattern insights */
  insights: string[];

  /** Confidence score (0.0-1.0) */
  confidence: number;

  /** Scraped content enrichment (optional, Phase 2 Sprint 3) */
  scrapedContent?: ScrapedContentResult[];
}

/**
 * Domain authority pattern
 */
export interface DomainAuthorityPattern {
  /** High authority sites (backlinks > 10,000) */
  highAuthority: number;

  /** Medium authority sites (backlinks 1,000-10,000) */
  mediumAuthority: number;

  /** Low authority sites (backlinks < 1,000) */
  lowAuthority: number;

  /** Domains appearing multiple times in top 10 */
  dominantDomains: string[];

  /** Insight on required authority */
  insight?: string;
}

/**
 * Content length pattern
 */
export interface ContentLengthPattern {
  /** Average word count */
  averageWordCount: number;

  /** Minimum word count */
  minWordCount: number;

  /** Maximum word count */
  maxWordCount: number;

  /** Standard deviation */
  standardDeviation: number;

  /** Recommended range */
  recommendedRange: {
    min: number;
    max: number;
  };

  /** Insight on content length */
  insight: string;
}

/**
 * Title and meta pattern
 */
export interface TitleMetaPattern {
  /** Average title length */
  avgTitleLength: number;

  /** Title length range */
  titleLengthRange: {
    min: number;
    max: number;
  };

  /** Average meta description length */
  avgMetaLength: number;

  /** Meta length range */
  metaLengthRange: {
    min: number;
    max: number;
  };

  /** Common title patterns */
  commonTitlePatterns: string[];

  /** Common title structures */
  titleStructures: {
    pattern: string;
    count: number;
    examples: string[];
  }[];

  /** Keyword placement analysis */
  keywordPlacement: {
    inTitle: number; // Percentage
    atTitleStart: number; // Percentage
    inMeta: number; // Percentage
  };

  /** Insights */
  insights: string[];
}

/**
 * URL structure pattern
 */
export interface URLStructurePattern {
  /** Common URL patterns */
  patterns: {
    pattern: string;
    count: number;
    examples: string[];
  }[];

  /** Average URL length */
  avgUrlLength: number;

  /** URL component analysis */
  components: {
    hasKeyword: number; // Percentage
    pathDepth: number; // Average
    hasHyphens: number; // Percentage
    hasNumbers: number; // Percentage
    hasCategory: number; // Percentage
  };

  /** Insights */
  insights: string[];
}

/**
 * Semantic cluster of related topics
 */
export interface SemanticCluster {
  /** Cluster identifier */
  clusterId: string;

  /** Main topic/theme */
  mainTopic: string;

  /** Related keywords and phrases */
  keywords: string[];

  /** Topic prevalence across results (0.0-1.0) */
  prevalence: number;

  /** Positions where topic appears */
  positions: number[];

  /** Subtopics within cluster */
  subtopics: string[];

  /** Related entities (people, places, concepts) */
  entities: string[];

  /** Content coverage score (0.0-1.0) */
  coverageScore: number;

  /** Example content demonstrating cluster */
  examples: {
    position: number;
    url: string;
    snippet: string;
  }[];
}

/**
 * Content gap identified through SERP analysis
 */
export interface ContentGap {
  /** Gap type */
  gapType: 'missing_topic' | 'insufficient_depth' | 'outdated_content' | 'format_mismatch';

  /** Topic or angle missing */
  topic: string;

  /** Opportunity score (0.0-1.0) */
  opportunityScore: number;

  /** Current SERP coverage */
  currentCoverage: number;

  /** Recommended content type */
  recommendedContentType: ContentType;

  /** Reasoning */
  reasoning: string;

  /** Priority */
  priority: 'high' | 'medium' | 'low';
}

/**
 * Recommendation type
 */
export enum RecommendationType {
  SERP_FEATURE = 'serp_feature',
  CONTENT_STRUCTURE = 'content_structure',
  KEYWORD_VARIATION = 'keyword_variation',
  COMPETITIVE_POSITIONING = 'competitive_positioning',
  TECHNICAL_SEO = 'technical_seo',
  CONTENT_STRATEGY = 'content_strategy',
}

/**
 * Actionable recommendation
 */
export interface Recommendation {
  /** Recommendation type */
  type: RecommendationType;

  /** Recommendation title */
  title: string;

  /** Detailed description */
  description: string;

  /** Expected impact (high, medium, low) */
  impact: 'high' | 'medium' | 'low';

  /** Implementation effort (high, medium, low) */
  effort: 'high' | 'medium' | 'low';

  /** Priority score (0.0-1.0) */
  priority: number;

  /** Supporting data/evidence */
  evidence: string[];

  /** Actionable steps */
  actionSteps: string[];

  /** Related SERP features or patterns */
  relatedFeatures?: string[];
}

/**
 * Complete SERP analysis result
 */
export interface SERPAnalysisResult {
  /** Analyzed keyword */
  keyword: string;

  /** Analysis timestamp */
  analyzedAt: Date;

  /** Total time for analysis (ms) */
  totalTimeMs: number;

  /** Search results analyzed */
  results: SearchResult[];

  /** Detected SERP features */
  features: SERPFeature[];

  /** Ranking patterns */
  rankingPatterns: {
    domainAuthority: DomainAuthorityPattern;
    contentLength: ContentLengthPattern;
    titleMeta: TitleMetaPattern;
    urlStructure: URLStructurePattern;
    contentTypes: {
      type: ContentType;
      count: number;
      positions: number[];
    }[];
    freshnessSignals: {
      signal: FreshnessSignal;
      count: number;
      positions: number[];
    }[];
  };

  /** Semantic clusters */
  semanticClusters: SemanticCluster[];

  /** Content gaps */
  contentGaps: ContentGap[];

  /** Recommendations */
  recommendations: Recommendation[];

  /** Overall analysis confidence (0.0-1.0) */
  confidence: number;

  /** Warnings encountered */
  warnings: string[];

  /** Metadata */
  metadata: {
    apiProvider: 'google' | 'dataforseo' | 'scraping';
    totalResults: number;
    cacheHit: boolean;
  };
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * SERP analysis error codes
 */
export enum SERPAnalysisErrorCode {
  INVALID_KEYWORD = 'INVALID_KEYWORD',
  INVALID_CONFIG = 'INVALID_CONFIG',
  API_KEY_MISSING = 'API_KEY_MISSING',
  API_REQUEST_FAILED = 'API_REQUEST_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TIMEOUT = 'TIMEOUT',
  PARSE_ERROR = 'PARSE_ERROR',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * SERP analysis error
 */
export class SERPAnalysisError extends Error {
  constructor(
    public code: SERPAnalysisErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SERPAnalysisError';
    Object.setPrototypeOf(this, SERPAnalysisError.prototype);
  }
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Google Custom Search API response
 */
export interface GoogleSearchResponse {
  kind: string;
  items?: GoogleSearchItem[];
  searchInformation?: {
    totalResults: string;
    searchTime: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Google Custom Search result item
 */
export interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  htmlSnippet?: string;
  pagemap?: {
    metatags?: Array<Record<string, string>>;
    cse_thumbnail?: Array<{ src: string }>;
    cse_image?: Array<{ src: string }>;
  };
}

/**
 * DataForSEO API response
 */
export interface DataForSEOResponse {
  tasks: Array<{
    status_code: number;
    status_message?: string;
    result?: Array<{
      keyword: string;
      type: string;
      items: DataForSEOItem[];
    }>;
  }>;
}

/**
 * DataForSEO result item
 */
export interface DataForSEOItem {
  type: 'organic' | 'featured_snippet' | 'people_also_ask' | 'images' | 'videos' | 'local_pack' | 'knowledge_graph';
  rank_group?: number;
  rank_absolute: number;
  domain: string;
  title: string;
  url: string;
  description: string;
  // Rich snippets (for featured snippets, tables, etc.)
  table?: string[][];
  links?: Array<{ title: string; url: string }>;
  // People Also Ask items
  items?: Array<{
    question?: string;
    expanded_element?: any[]
  }>;
  // Knowledge graph
  title_text?: string;
  description_text?: string;
}

/**
 * SpyFu Domain Overview response
 */
export interface SpyFuDomainOverview {
  domain: string;
  organic_value?: number;
  total_organic_results?: number;
  total_paid_results?: number;
  domain_authority?: number;
  backlinks?: number;
  referring_domains?: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Type guard for successful Google search response
 */
export function isSuccessfulGoogleSearch(
  response: GoogleSearchResponse
): response is Required<GoogleSearchResponse> & { items: GoogleSearchItem[] } {
  return !response.error && Array.isArray(response.items) && response.items.length > 0;
}

/**
 * Type guard for successful DataForSEO response
 */
export function isSuccessfulDataForSEOSearch(
  response: DataForSEOResponse
): response is DataForSEOResponse & {
  tasks: Array<{
    status_code: number;
    result: Array<{ items: DataForSEOItem[] }>;
  }>;
} {
  return (
    Array.isArray(response.tasks) &&
    response.tasks.length > 0 &&
    response.tasks[0].status_code === 20000 &&
    Array.isArray(response.tasks[0].result) &&
    response.tasks[0].result.length > 0 &&
    Array.isArray(response.tasks[0].result[0].items) &&
    response.tasks[0].result[0].items.length > 0
  );
}

/**
 * Cache entry for SERP data
 */
export interface SERPCacheEntry {
  keyword: string;
  result: SERPAnalysisResult;
  cachedAt: Date;
  expiresAt: Date;
}

/**
 * Pattern extraction configuration
 */
export interface PatternExtractionConfig {
  /** Minimum instances required to establish pattern */
  minInstances: number;

  /** Minimum confidence threshold (0.0-1.0) */
  minConfidence: number;

  /** Enable fuzzy matching for pattern detection */
  fuzzyMatching: boolean;

  /** Similarity threshold for fuzzy matching (0.0-1.0) */
  similarityThreshold: number;
}

// ============================================================================
// FIRECRAWL CONTENT EXTRACTION TYPES
// ============================================================================

/**
 * Firecrawl extractor error codes
 */
export type FirecrawlErrorCode =
  | 'API_KEY_MISSING'
  | 'INVALID_CONFIG'
  | 'INVALID_URL'
  | 'SCRAPE_FAILED'
  | 'API_REQUEST_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MAX_RETRIES_EXCEEDED'
  | 'TIMEOUT';

/**
 * Firecrawl content extractor configuration
 */
export interface FirecrawlExtractorConfig {
  /** Firecrawl API key (optional, uses env var if not provided) */
  firecrawlApiKey?: string;

  /** Request timeout in milliseconds (default: 30000) */
  requestTimeoutMs?: number;

  /** Rate limit delay between batches (ms, default: 1000) */
  rateLimitMs?: number;

  /** Maximum retry attempts per URL (default: 2) */
  maxRetries?: number;

  /** Batch size for parallel requests (default: 5) */
  batchSize?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Content analysis metrics
 */
export interface ContentAnalysis {
  /** Total word count */
  wordCount: number;

  /** Heading distribution */
  headingDistribution: {
    h1: number;
    h2: number;
    h3: number;
    h4: number;
  };

  /** Link count breakdown */
  linkCount: {
    total: number;
    internal: number;
    external: number;
  };

  /** Detected schema types */
  schemaTypes?: string[];

  /** Has structured data markup */
  hasStructuredData: boolean;
}

/**
 * Content structure (headings, links)
 */
export interface ContentStructure {
  /** Extracted headings by level */
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
    h4: string[];
    h5: string[];
    h6: string[];
  };

  /** Extracted links */
  links: {
    internal: Array<{ text: string; url: string }>;
    external: Array<{ text: string; url: string }>;
  };
}

/**
 * Scraped content result (success or error)
 */
export interface ScrapedContentResult {
  /** Whether scrape succeeded */
  success: boolean;

  /** Source URL */
  url: string;

  /** Page title (if successful) */
  title?: string;

  /** Full text content (if successful) */
  content?: string;

  /** Markdown content (if successful) */
  markdown?: string;

  /** HTML content (if successful) */
  html?: string;

  /** Content analysis (if successful) */
  analysis?: ContentAnalysis;

  /** Content structure (if successful) */
  structure?: ContentStructure;

  /** Scrape metadata (if successful) */
  metadata?: {
    statusCode: number;
    language?: string;
    scrapedAt: Date;
  };

  /** Error message (if failed) */
  error?: string;

  /** Error code (if failed) */
  errorCode?: FirecrawlErrorCode;
}

/**
 * Firecrawl batch response
 */
export interface FirecrawlBatchResponse {
  /** Total URLs processed */
  totalUrls: number;

  /** Successful scrapes */
  successCount: number;

  /** Failed scrapes */
  failureCount: number;

  /** Individual results */
  results: ScrapedContentResult[];

  /** Processing time (ms) */
  processingTimeMs: number;
}
