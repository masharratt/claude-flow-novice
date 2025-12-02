/**
 * SERP Feature Optimization Type Definitions
 *
 * @module planning/seo/types/serp-optimization
 * @description Type definitions for SERP feature optimization and schema markup
 * @version 1.0.0
 *
 * Provides comprehensive types for:
 * - SERP feature opportunity detection
 * - Content formatting for featured snippets, PAA, video carousels
 * - Schema markup generation (JSON-LD)
 * - Optimization result tracking
 */

import { SERPFeatureType, FeaturedSnippetType } from '../../../packages/seo-analysis/src/types/serp-analysis';

// ============================================================================
// OPPORTUNITY DETECTION
// ============================================================================

/**
 * Detected SERP feature optimization opportunity
 */
export interface SERPFeatureOpportunity {
  /** Type of SERP feature */
  type: SERPFeatureType;

  /** Featured snippet subtype (if applicable) */
  snippetType?: FeaturedSnippetType;

  /** Confidence score (0-1) that content can win this feature */
  confidence: number;

  /** Target keyword or query */
  targetQuery: string;

  /** Current status (are we already winning this?) */
  currentStatus: 'winning' | 'eligible' | 'not_present' | 'competitor_owns';

  /** Domain currently owning the feature (if applicable) */
  currentOwner?: string;

  /** Estimated monthly search volume for this feature */
  searchVolume?: number;

  /** Recommended content placement on page */
  recommendedPlacement: 'top' | 'middle' | 'bottom' | 'sidebar';

  /** Specific recommendation for capturing this feature */
  recommendation: string;

  /** Estimated impact (low, medium, high) */
  impact: 'low' | 'medium' | 'high';

  /** Required schema markup types */
  requiredSchema?: SchemaType[];
}

/**
 * Configuration for opportunity detection
 */
export interface OpportunityDetectionConfig {
  /** Content to analyze */
  content: string;

  /** Target keyword */
  keyword: string;

  /** Current SERP features for this keyword */
  serpFeatures?: SERPFeatureType[];

  /** Current ranking position (if known) */
  currentPosition?: number;

  /** Domain authority (if known) */
  domainAuthority?: number;

  /** Enable aggressive optimization suggestions */
  aggressiveMode?: boolean;
}

// ============================================================================
// CONTENT FORMATTING
// ============================================================================

/**
 * Featured snippet formatting configuration
 */
export interface FeaturedSnippetConfig {
  /** Question or query to answer */
  question: string;

  /** Source content to extract/format from */
  sourceContent: string;

  /** Target word count (default: 50 for paragraph) */
  targetLength?: number;

  /** Snippet type to format for */
  snippetType?: FeaturedSnippetType;

  /** Include source attribution */
  includeAttribution?: boolean;
}

/**
 * People Also Ask formatting configuration
 */
export interface PAAConfig {
  /** List of questions to format */
  questions: string[];

  /** Corresponding answers (must match questions length) */
  answers: string[];

  /** Generate FAQ schema markup */
  generateSchema?: boolean;

  /** Use HTML details/summary for expandable Q&A */
  useExpandable?: boolean;
}

/**
 * Video carousel formatting configuration
 */
export interface VideoCarouselConfig {
  /** Video title */
  title: string;

  /** Video description */
  description: string;

  /** Video thumbnail URL */
  thumbnailUrl: string;

  /** Video upload date (ISO 8601) */
  uploadDate: string;

  /** Video duration (ISO 8601 duration format, e.g., "PT10M30S") */
  duration: string;

  /** Video content URL (direct link) */
  contentUrl?: string;

  /** Video embed URL (iframe src) */
  embedUrl?: string;

  /** Video transcript (optional but recommended) */
  transcript?: string;
}

/**
 * Image pack optimization configuration
 */
export interface ImagePackConfig {
  /** Image source URL */
  src: string;

  /** Original alt text (if exists) */
  currentAlt?: string;

  /** Surrounding content context */
  context: string;

  /** Target keyword for image */
  keyword: string;

  /** Image dimensions */
  dimensions?: {
    width: number;
    height: number;
  };

  /** Image file name */
  fileName?: string;
}

/**
 * HowTo formatting configuration
 */
export interface HowToConfig {
  /** Title of the how-to guide */
  title: string;

  /** Description of what will be accomplished */
  description: string;

  /** Array of step instructions */
  steps: HowToStep[];

  /** Estimated total time (ISO 8601 duration) */
  totalTime?: string;

  /** Tools required */
  tools?: string[];

  /** Supplies/materials required */
  supplies?: string[];
}

/**
 * Individual step in a HowTo guide
 */
export interface HowToStep {
  /** Step name/title */
  name: string;

  /** Detailed instruction text */
  text: string;

  /** Optional image URL for this step */
  image?: string;

  /** Optional video URL for this step */
  video?: string;

  /** Optional tip or warning for this step */
  tip?: string;
}

/**
 * Table snippet formatting configuration
 */
export interface TableSnippetConfig {
  /** Table caption/title */
  caption: string;

  /** Column headers */
  headers: string[];

  /** Array of rows (each row is array of cell values) */
  rows: string[][];

  /** Include table schema markup */
  generateSchema?: boolean;

  /** Highlight column (0-indexed) */
  highlightColumn?: number;
}

// ============================================================================
// OPTIMIZATION RESULTS
// ============================================================================

/**
 * Result of SERP feature optimization
 */
export interface OptimizationResult {
  /** Original content (before optimization) */
  originalContent: string;

  /** Optimized content (after formatting) */
  optimizedContent: string;

  /** SERP feature type optimized for */
  featureType: SERPFeatureType;

  /** Generated schema markup (if applicable) */
  schemaMarkup?: string;

  /** Confidence score for winning this feature (0-1) */
  confidence: number;

  /** Word count of optimized content */
  wordCount: number;

  /** Recommended placement on page */
  placement: {
    location: 'top' | 'middle' | 'bottom' | 'sidebar';
    specificPosition?: string; // e.g., "after H1, before first H2"
  };

  /** Validation results */
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };

  /** Expected impact metrics */
  expectedImpact?: {
    estimatedCTR?: number;
    estimatedImpressions?: number;
    estimatedClicks?: number;
  };

  /** Metadata */
  metadata: {
    targetKeyword: string;
    generatedAt: Date;
    version: string;
  };
}

/**
 * Batch optimization results for multiple features
 */
export interface BatchOptimizationResult {
  /** Original page content */
  originalContent: string;

  /** Individual optimization results */
  optimizations: OptimizationResult[];

  /** Combined schema markup (all schemas merged) */
  combinedSchema?: string;

  /** Overall confidence score (average of all optimizations) */
  overallConfidence: number;

  /** Total estimated impact */
  totalImpact: {
    estimatedCTR: number;
    estimatedImpressions: number;
    estimatedClicks: number;
  };

  /** Conflicts or issues between optimizations */
  conflicts: string[];

  /** Final recommended page structure */
  recommendedStructure: string[];
}

// ============================================================================
// SCHEMA MARKUP TYPES
// ============================================================================

/**
 * Schema markup types supported
 */
export type SchemaType =
  | 'Article'
  | 'BlogPosting'
  | 'NewsArticle'
  | 'FAQPage'
  | 'HowTo'
  | 'VideoObject'
  | 'ImageObject'
  | 'Organization'
  | 'Person'
  | 'WebPage'
  | 'BreadcrumbList';

/**
 * Base schema markup interface (JSON-LD)
 */
export interface BaseSchema {
  '@context': 'https://schema.org';
  '@type': SchemaType;
}

/**
 * FAQ Page schema markup
 */
export interface FAQPageSchema extends BaseSchema {
  '@type': 'FAQPage';
  mainEntity: FAQQuestion[];
}

/**
 * FAQ Question schema
 */
export interface FAQQuestion {
  '@type': 'Question';
  name: string;
  acceptedAnswer: {
    '@type': 'Answer';
    text: string;
  };
}

/**
 * HowTo schema markup
 */
export interface HowToSchema extends BaseSchema {
  '@type': 'HowTo';
  name: string;
  description: string;
  totalTime?: string; // ISO 8601 duration
  estimatedCost?: {
    '@type': 'MonetaryAmount';
    currency: string;
    value: number;
  };
  tool?: string[];
  supply?: string[];
  step: HowToStepSchema[];
}

/**
 * HowTo step schema
 */
export interface HowToStepSchema {
  '@type': 'HowToStep';
  name: string;
  text: string;
  image?: string;
  video?: string;
  url?: string;
}

/**
 * VideoObject schema markup
 */
export interface VideoObjectSchema extends BaseSchema {
  '@type': 'VideoObject';
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string; // ISO 8601 date
  duration: string; // ISO 8601 duration
  contentUrl?: string;
  embedUrl?: string;
  interactionStatistic?: {
    '@type': 'InteractionCounter';
    interactionType: string;
    userInteractionCount: number;
  };
  transcript?: string;
}

/**
 * Article schema markup
 */
export interface ArticleSchema extends BaseSchema {
  '@type': 'Article' | 'BlogPosting' | 'NewsArticle';
  headline: string;
  author: {
    '@type': 'Person' | 'Organization';
    name: string;
  };
  datePublished: string; // ISO 8601 date
  dateModified: string; // ISO 8601 date
  image: string;
  publisher: {
    '@type': 'Organization';
    name: string;
    logo: {
      '@type': 'ImageObject';
      url: string;
    };
  };
  description?: string;
  articleBody?: string;
}

/**
 * ImageObject schema markup
 */
export interface ImageObjectSchema extends BaseSchema {
  '@type': 'ImageObject';
  contentUrl: string;
  url?: string;
  caption?: string;
  description?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  /** Is the schema valid? */
  valid: boolean;

  /** Validation errors (blocking issues) */
  errors: ValidationError[];

  /** Validation warnings (non-blocking issues) */
  warnings: ValidationWarning[];

  /** Schema type validated */
  schemaType: SchemaType;

  /** Validation timestamp */
  validatedAt: Date;

  /** Validator version */
  validatorVersion: string;
}

/**
 * Validation error
 */
export interface ValidationError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Path to the problematic field */
  path: string;

  /** Severity level */
  severity: 'error';

  /** Suggested fix */
  fix?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /** Warning code */
  code: string;

  /** Warning message */
  message: string;

  /** Path to the field */
  path: string;

  /** Severity level */
  severity: 'warning';

  /** Suggested improvement */
  improvement?: string;
}

// ============================================================================
// CACHE AND STORAGE
// ============================================================================

/**
 * Cached optimization result
 */
export interface CachedOptimization {
  /** Cache key */
  key: string;

  /** Optimization result */
  result: OptimizationResult;

  /** Cache timestamp */
  cachedAt: Date;

  /** Cache expiry */
  expiresAt: Date;

  /** Cache hit count */
  hits: number;
}

/**
 * Redis cache keys for SERP optimization
 */
export const CACHE_KEYS = {
  OPPORTUNITIES: (keyword: string) => `serp:opportunities:${keyword}`,
  SCHEMA: (pageId: string, type: SchemaType) => `serp:schema:${pageId}:${type}`,
  VALIDATION: (schemaHash: string) => `serp:validation:${schemaHash}`,
  OPTIMIZATION: (contentHash: string, featureType: string) =>
    `serp:optimization:${contentHash}:${featureType}`,
} as const;

/**
 * Cache TTL values (in seconds)
 */
export const CACHE_TTL = {
  OPPORTUNITIES: 7 * 24 * 60 * 60, // 7 days
  SCHEMA: 30 * 24 * 60 * 60, // 30 days
  VALIDATION: 30 * 24 * 60 * 60, // 30 days
  OPTIMIZATION: 14 * 24 * 60 * 60, // 14 days
} as const;

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * SERP optimization error codes
 */
export enum SERPOptimizationErrorCode {
  INVALID_CONTENT = 'INVALID_CONTENT',
  SCHEMA_GENERATION_FAILED = 'SCHEMA_GENERATION_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNSUPPORTED_FEATURE_TYPE = 'UNSUPPORTED_FEATURE_TYPE',
  INSUFFICIENT_CONFIDENCE = 'INSUFFICIENT_CONFIDENCE',
  CONTENT_TOO_SHORT = 'CONTENT_TOO_SHORT',
  CONTENT_TOO_LONG = 'CONTENT_TOO_LONG',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CACHE_ERROR = 'CACHE_ERROR',
}

/**
 * SERP optimization error
 */
export class SERPOptimizationError extends Error {
  constructor(
    public code: SERPOptimizationErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SERPOptimizationError';
  }
}

// ============================================================================
// ANALYTICS AND TRACKING
// ============================================================================

/**
 * SERP feature performance metrics
 */
export interface SERPFeatureMetrics {
  /** Feature type */
  featureType: SERPFeatureType;

  /** Impressions count */
  impressions: number;

  /** Clicks count */
  clicks: number;

  /** Click-through rate */
  ctr: number;

  /** Average position */
  averagePosition: number;

  /** Win rate (% of time we own the feature) */
  winRate: number;

  /** Tracking period */
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Optimization impact report
 */
export interface OptimizationImpactReport {
  /** Page or content identifier */
  pageId: string;

  /** Target keyword */
  keyword: string;

  /** Before optimization metrics */
  before: SERPFeatureMetrics | null;

  /** After optimization metrics */
  after: SERPFeatureMetrics;

  /** Improvement deltas */
  improvement: {
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  };

  /** Optimizations applied */
  appliedOptimizations: {
    featureType: SERPFeatureType;
    confidence: number;
    appliedAt: Date;
  }[];

  /** Report generated at */
  generatedAt: Date;
}
