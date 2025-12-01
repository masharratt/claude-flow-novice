/**
 * Type definitions for SEO Analysis
 */

/**
 * Page data from crawl result
 */
export interface PageData {
  url: string;
  title?: string;
  description?: string;
  content?: string;
  headings?: string[];
  links?: {
    internal: string[];
    external: string[];
  };
  metadata?: Record<string, unknown>;
  lastModified?: string;
  statusCode?: number;
}

/**
 * Complete crawl result for a website
 */
export interface CrawlResult {
  domain: string;
  crawledAt: string;
  pages: PageData[];
  totalPages: number;
  metadata: {
    title?: string;
    description?: string;
    robots?: string;
    canonical?: string;
  };
  patterns?: PatternAnalysis;
}

/**
 * Extracted patterns from website analysis
 */
export interface PatternAnalysis {
  headingStructure?: {
    h1Count: number;
    h2Count: number;
    h3Count: number;
    pattern: string;
  };
  contentStrategy?: {
    averagePageLength: number;
    contentTypes: Record<string, number>;
    topicClusters: string[];
  };
  linkingPatterns?: {
    averageLinksPerPage: number;
    internalLinkDensity: number;
    externalLinkDensity: number;
    anchorTextPatterns: Record<string, number>;
  };
  technicalSEO?: {
    httpStatus: Record<string, number>;
    mobileOptimized: boolean;
    hasSchema: boolean;
    hasOGTags: boolean;
  };
}

/**
 * Analyzer configuration options
 */
export interface AnalyzerOptions {
  apiKey: string;
  maxUrls?: number;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Analysis result with insights
 */
export interface AnalysisResult {
  success: boolean;
  data?: CrawlResult;
  error?: string;
  insights?: string[];
  timestamp: string;
  duration: number;
}

/**
 * Configuration loaded from environment
 */
export interface Config {
  firecrawlApiKey: string;
  firecrawlApiUrl: string;
  maxUrlsPerDomain: number;
  requestTimeout: number;
  maxRetries: number;
  retryDelay: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
