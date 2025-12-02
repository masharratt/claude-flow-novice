/**
 * Step 11.5: Pre-Publication SEO Audit Types
 * SEO Intelligence Integration - Content Quality Gates
 *
 * @module planning/seo/types/pre-publication-audit
 * @description Type definitions for comprehensive pre-publication SEO audits
 * @version 1.0.0
 */

/**
 * Audit category types
 */
export type AuditCategory =
  | 'title'
  | 'meta'
  | 'schema'
  | 'links'
  | 'readability'
  | 'freshness'
  | 'images';

/**
 * Finding severity levels
 */
export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Individual audit finding
 */
export interface AuditFinding {
  /** Finding category */
  category: AuditCategory;

  /** Severity level */
  severity: AuditSeverity;

  /** Human-readable message */
  message: string;

  /** Actionable recommendation */
  recommendation: string;

  /** Expected impact (1-10) */
  impact: number;

  /** Optional: Specific location (e.g., "Title tag", "Paragraph 3") */
  location?: string;

  /** Optional: Current value */
  currentValue?: string;

  /** Optional: Suggested value */
  suggestedValue?: string;
}

/**
 * Audit score for a category
 */
export interface AuditScore {
  /** Category being scored */
  category: AuditCategory;

  /** Score 0-100 (100 = perfect) */
  score: number;

  /** Weight in overall score (0-1, sum = 1.0) */
  weight: number;

  /** All findings for this category */
  findings: AuditFinding[];

  /** Weighted contribution to overall score */
  weightedScore: number;
}

/**
 * Title tag audit details
 */
export interface TitleTagAudit {
  /** Current title text */
  title: string;

  /** Character length */
  length: number;

  /** Contains target keyword */
  hasKeyword: boolean;

  /** Contains power word */
  hasPowerWord: boolean;

  /** Power word found (if any) */
  powerWord?: string;

  /** Contains number */
  hasNumber: boolean;

  /** Number found (if any) */
  number?: string;

  /** Contains current year [2025] */
  hasCurrentYear: boolean;

  /** Contains visual separators (brackets/pipes) */
  hasVisualSeparator: boolean;

  /** Contains emotional trigger */
  hasEmotionalTrigger: boolean;

  /** Emotional trigger found (if any) */
  emotionalTrigger?: string;

  /** Estimated CTR impact (0-100) */
  ctrScore: number;
}

/**
 * Meta description audit details
 */
export interface MetaDescriptionAudit {
  /** Current meta description text */
  description: string;

  /** Character length */
  length: number;

  /** Contains target keyword */
  hasKeyword: boolean;

  /** Contains call-to-action */
  hasCTA: boolean;

  /** CTA found (if any) */
  cta?: string;

  /** Contains emotional trigger */
  hasEmotionalTrigger: boolean;

  /** Emotional trigger found (if any) */
  emotionalTrigger?: string;

  /** Length is optimal (150-160 chars) */
  isOptimalLength: boolean;

  /** Estimated CTR impact (0-100) */
  ctrScore: number;
}

/**
 * Schema markup audit details
 */
export interface SchemaMarkupAudit {
  /** Schema types detected */
  detectedSchemas: string[];

  /** Missing recommended schemas */
  missingSchemas: string[];

  /** Schema coverage score (0-100) */
  coverageScore: number;

  /** Content type requiring schema */
  contentType: string;
}

/**
 * Internal linking audit details
 */
export interface InternalLinkingAudit {
  /** Total internal links found */
  totalLinks: number;

  /** Contextual internal links (in-body) */
  contextualLinks: number;

  /** Links in optimal range (3-5) */
  isOptimalCount: boolean;

  /** Links to high-authority pages */
  highAuthorityLinks: number;

  /** Links with descriptive anchor text */
  descriptiveAnchors: number;

  /** Linking quality score (0-100) */
  qualityScore: number;
}

/**
 * Readability audit details
 */
export interface ReadabilityAudit {
  /** Flesch Reading Ease score */
  fleschScore: number;

  /** Average sentence length (words) */
  avgSentenceLength: number;

  /** Average paragraph length (sentences) */
  avgParagraphLength: number;

  /** Percentage of transition words */
  transitionWordPercent: number;

  /** Paragraphs exceeding 150 words */
  wallOfTextCount: number;

  /** Flesch score in optimal range (60-70) */
  isOptimalFlesch: boolean;

  /** Overall readability score (0-100) */
  readabilityScore: number;
}

/**
 * Freshness signals audit details
 */
export interface FreshnessAudit {
  /** Contains current year [2025] */
  hasCurrentYear: boolean;

  /** Contains recent data/statistics */
  hasRecentData: boolean;

  /** Most recent year mentioned */
  mostRecentYear?: number;

  /** Publication date is visible */
  hasVisibleDate: boolean;

  /** Last updated date is visible */
  hasLastUpdated: boolean;

  /** Freshness signal score (0-100) */
  freshnessScore: number;
}

/**
 * Image ALT text audit details
 */
export interface ImageAltAudit {
  /** Total images found */
  totalImages: number;

  /** Images with ALT text */
  imagesWithAlt: number;

  /** Images missing ALT text */
  imagesMissingAlt: number;

  /** ALT texts containing target keyword */
  altWithKeyword: number;

  /** Descriptive ALT text count (>5 words) */
  descriptiveAltCount: number;

  /** ALT coverage percentage */
  altCoverage: number;

  /** ALT quality score (0-100) */
  altQualityScore: number;
}

/**
 * Step 11.5 configuration
 */
export interface Step115Config {
  /** Target keyword for audit */
  targetKeyword: string;

  /** Content HTML to audit */
  contentHtml: string;

  /** Current title tag */
  titleTag: string;

  /** Current meta description */
  metaDescription: string;

  /** Content type (article, guide, etc.) */
  contentType?: string;

  /** Industry/niche */
  industry?: string;

  /** Minimum acceptable overall score (0-100) */
  minAcceptableScore?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Step 11.5 execution result
 */
export interface Step115Result {
  /** Audit success status */
  success: boolean;

  /** Overall audit score (0-100, weighted average) */
  overallScore: number;

  /** Pass/fail based on minAcceptableScore */
  passed: boolean;

  /** Category-specific scores */
  categoryScores: AuditScore[];

  /** All findings across categories */
  allFindings: AuditFinding[];

  /** Critical findings requiring immediate action */
  criticalFindings: AuditFinding[];

  /** Detailed audit results by category */
  details: {
    title: TitleTagAudit;
    meta: MetaDescriptionAudit;
    schema: SchemaMarkupAudit;
    links: InternalLinkingAudit;
    readability: ReadabilityAudit;
    freshness: FreshnessAudit;
    images: ImageAltAudit;
  };

  /** Execution timestamp */
  executedAt: string;

  /** Execution duration (ms) */
  durationMs: number;

  /** Error message if failed */
  error?: string;
}

/**
 * Category weight configuration
 * Weights must sum to 1.0
 */
export interface CategoryWeights {
  title: number; // Default: 0.25
  meta: number; // Default: 0.15
  schema: number; // Default: 0.20
  links: number; // Default: 0.15
  readability: number; // Default: 0.15
  freshness: number; // Default: 0.05
  images: number; // Default: 0.05
}

/**
 * Default category weights
 */
export const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
  title: 0.25,
  meta: 0.15,
  schema: 0.2,
  links: 0.15,
  readability: 0.15,
  freshness: 0.05,
  images: 0.05,
};

/**
 * Power words for title optimization
 */
export const POWER_WORDS = [
  'Ultimate',
  'Complete',
  'Essential',
  'Best',
  'Top',
  'Proven',
  'Expert',
  'Advanced',
  'Simple',
  'Easy',
  'Quick',
  'Definitive',
  'Comprehensive',
  'Effective',
  'Powerful',
  'Amazing',
  'Incredible',
  'Revolutionary',
  'Exclusive',
  'Secret',
];

/**
 * Emotional trigger words
 */
export const EMOTIONAL_TRIGGERS = [
  'Revolutionary',
  'Shocking',
  'Exclusive',
  'Secret',
  'Guaranteed',
  'Proven',
  'Mistakes',
  'Warning',
  'Critical',
  'Essential',
  'Breakthrough',
  'Transform',
  'Unlock',
  'Discover',
  'Revealed',
];

/**
 * Call-to-action phrases
 */
export const CTA_PHRASES = [
  'Learn',
  'Discover',
  'Get',
  'Download',
  'Start',
  'Try',
  'Join',
  'Subscribe',
  'Sign up',
  'Find out',
  'See how',
  'Click here',
  'Read more',
  'Explore',
];

/**
 * Schema types by content type
 */
export const RECOMMENDED_SCHEMAS: Record<string, string[]> = {
  article: ['Article', 'BreadcrumbList', 'Person', 'Organization'],
  guide: ['HowTo', 'BreadcrumbList', 'Person', 'Organization'],
  review: ['Review', 'Product', 'AggregateRating', 'BreadcrumbList'],
  product: ['Product', 'Offer', 'AggregateRating', 'BreadcrumbList'],
  faq: ['FAQPage', 'Question', 'Answer', 'BreadcrumbList'],
  recipe: ['Recipe', 'NutritionInformation', 'Person', 'BreadcrumbList'],
  course: ['Course', 'CourseInstance', 'Person', 'Organization'],
  event: ['Event', 'Place', 'Offer', 'BreadcrumbList'],
};

/**
 * Type guard for Step115Config
 */
export function isValidStep115Config(config: unknown): config is Step115Config {
  const c = config as Step115Config;
  return (
    typeof c === 'object' &&
    c !== null &&
    typeof c.targetKeyword === 'string' &&
    c.targetKeyword.length > 0 &&
    typeof c.contentHtml === 'string' &&
    c.contentHtml.length > 0 &&
    typeof c.titleTag === 'string' &&
    c.titleTag.length > 0 &&
    typeof c.metaDescription === 'string' &&
    c.metaDescription.length > 0
  );
}
