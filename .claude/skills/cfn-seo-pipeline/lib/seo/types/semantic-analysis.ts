/**
 * Semantic Completeness Analysis Type Definitions
 *
 * @module planning/seo/types/semantic-analysis
 * @description Type definitions for semantic completeness analysis against competitors
 * @version 1.0.0
 *
 * Provides types for:
 * - Topic extraction and analysis
 * - Semantic keyword identification
 * - Content gap detection
 * - Coverage scoring
 * - Actionable recommendations
 */

// ============================================================================
// CORE SEMANTIC TYPES
// ============================================================================

/**
 * Extracted topic with semantic context
 */
export interface Topic {
  /** Topic name/phrase */
  name: string;

  /** Frequency of topic in content */
  frequency: number;

  /** Importance score (0.0-1.0) based on TF-IDF or similar */
  importance: number;

  /** Contextual information where topic appears */
  context: string[];

  /** Category of topic (keyword, concept, question, etc.) */
  category: TopicCategory;

  /** Related subtopics */
  subtopics?: string[];

  /** Section/heading where topic appears */
  sections?: string[];
}

/**
 * Topic category classification
 */
export enum TopicCategory {
  PRIMARY_KEYWORD = 'primary_keyword',
  RELATED_CONCEPT = 'related_concept',
  QUESTION = 'question',
  USE_CASE = 'use_case',
  EXAMPLE = 'example',
  STATISTIC = 'statistic',
  EXPERT_QUOTE = 'expert_quote',
  TOOL_RESOURCE = 'tool_resource',
  DEFINITION = 'definition',
  COMPARISON = 'comparison',
}

/**
 * Semantic keyword with LSI (Latent Semantic Indexing) metadata
 */
export interface SemanticKeyword {
  /** Keyword phrase */
  keyword: string;

  /** Relevance score to main topic (0.0-1.0) */
  relevance: number;

  /** Number of competitors using this keyword */
  competitorsUsing: number;

  /** Competitor domains that use this keyword */
  competitorDomains: string[];

  /** Co-occurrence frequency with main keywords */
  coOccurrence: number;

  /** Semantic distance from main topic (lower = closer) */
  semanticDistance: number;
}

/**
 * Identified content gap
 */
export interface TopicGap {
  /** Topic name that is missing */
  topic: string;

  /** Number of competitors covering this topic */
  competitorsCovering: number;

  /** List of competitor domains covering this topic */
  competitorDomains: string[];

  /** Impact score if this gap is filled (0.0-1.0) */
  impactScore: number;

  /** Priority level for addressing this gap */
  priority: GapPriority;

  /** Topic category */
  category: TopicCategory;

  /** Average importance across competitors */
  avgCompetitorImportance: number;

  /** Estimated word count needed to cover this topic */
  estimatedWordCount?: number;
}

/**
 * Gap priority levels
 */
export enum GapPriority {
  CRITICAL = 'critical', // All 3+ competitors cover, high importance
  HIGH = 'high',         // 2+ competitors cover, medium-high importance
  MEDIUM = 'medium',     // 1-2 competitors cover, medium importance
  LOW = 'low',           // 1 competitor covers, low importance
}

/**
 * Completeness recommendation
 */
export interface Recommendation {
  /** Recommendation type */
  type: RecommendationType;

  /** Topic to address */
  topic: string;

  /** Suggested section/heading for content */
  suggestedSection: string;

  /** Priority level */
  priority: GapPriority;

  /** Rationale for recommendation */
  rationale: string;

  /** Related topics to include */
  relatedTopics: string[];

  /** Competitor examples to reference */
  competitorExamples: CompetitorExample[];

  /** Estimated effort (word count or time) */
  estimatedEffort?: number;
}

/**
 * Recommendation types
 */
export enum RecommendationType {
  ADD_SECTION = 'add_section',
  EXPAND_EXISTING = 'expand_existing',
  ADD_SUBTOPIC = 'add_subtopic',
  ADD_EXAMPLE = 'add_example',
  ADD_DEFINITION = 'add_definition',
  ADD_COMPARISON = 'add_comparison',
  ADD_USE_CASE = 'add_use_case',
  ADD_FAQ = 'add_faq',
}

/**
 * Competitor example reference
 */
export interface CompetitorExample {
  /** Competitor domain */
  domain: string;

  /** URL of example page */
  url: string;

  /** Brief description of how they cover the topic */
  description: string;

  /** Excerpt from competitor content */
  excerpt?: string;
}

/**
 * Semantic completeness analysis report
 */
export interface CompletenessReport {
  /** Overall completeness score (0-100) */
  score: number;

  /** Timestamp of analysis */
  analyzedAt: Date;

  /** Number of competitors analyzed */
  competitorsAnalyzed: number;

  /** Our content statistics */
  ourContent: ContentStats;

  /** Aggregated competitor statistics */
  competitorContent: ContentStats;

  /** Identified topic gaps */
  gaps: TopicGap[];

  /** Semantic keywords we're missing */
  missingKeywords: SemanticKeyword[];

  /** Actionable recommendations */
  recommendations: Recommendation[];

  /** Detailed comparison by competitor */
  competitorComparison: CompetitorComparison[];

  /** Topics we cover that competitors don't */
  uniqueTopics: Topic[];

  /** Coverage breakdown by category */
  categoryBreakdown: CategoryBreakdown[];
}

/**
 * Content statistics
 */
export interface ContentStats {
  /** Total word count */
  wordCount: number;

  /** Total topics identified */
  topicCount: number;

  /** Total semantic keywords */
  keywordCount: number;

  /** Number of sections/headings */
  sectionCount: number;

  /** Number of examples/case studies */
  exampleCount: number;

  /** Number of questions answered */
  questionCount: number;

  /** Average topic importance */
  avgTopicImportance: number;

  /** Topic diversity score (0.0-1.0) */
  topicDiversity: number;
}

/**
 * Individual competitor comparison
 */
export interface CompetitorComparison {
  /** Competitor domain */
  domain: string;

  /** Topics they cover that we don't */
  uniqueTopics: Topic[];

  /** Topics both cover (overlap) */
  sharedTopics: Topic[];

  /** Content overlap percentage (0-100) */
  overlapPercentage: number;

  /** Their content stats */
  contentStats: ContentStats;

  /** Quality score relative to us (-1.0 to 1.0) */
  relativeQuality: number;
}

/**
 * Coverage breakdown by category
 */
export interface CategoryBreakdown {
  /** Topic category */
  category: TopicCategory;

  /** Our topic count in this category */
  ourCount: number;

  /** Average competitor count in this category */
  competitorAvgCount: number;

  /** Gap (competitor avg - our count) */
  gap: number;

  /** Coverage ratio (our count / competitor avg) */
  coverageRatio: number;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Configuration for semantic completeness analysis
 */
export interface SemanticAnalysisConfig {
  /** Minimum topic frequency to consider (default: 2) */
  minTopicFrequency?: number;

  /** Minimum importance score for topics (0.0-1.0, default: 0.1) */
  minTopicImportance?: number;

  /** Maximum number of topics to extract (default: 100) */
  maxTopics?: number;

  /** Enable fuzzy topic matching (default: true) */
  fuzzyMatching?: boolean;

  /** Similarity threshold for fuzzy matching (0.0-1.0, default: 0.85) */
  similarityThreshold?: number;

  /** TF-IDF smoothing parameter (default: 1.0) */
  tfidfSmoothing?: number;

  /** Minimum competitors covering for critical priority (default: 3) */
  criticalThreshold?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Topic extraction result
 */
export interface TopicExtractionResult {
  /** Extracted topics */
  topics: Topic[];

  /** Processing time (ms) */
  processingTime: number;

  /** Total tokens analyzed */
  tokensAnalyzed: number;

  /** Unique terms found */
  uniqueTerms: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * TF-IDF calculation result
 */
export interface TfIdfResult {
  /** Term */
  term: string;

  /** Term frequency */
  tf: number;

  /** Inverse document frequency */
  idf: number;

  /** TF-IDF score */
  score: number;
}

/**
 * N-gram phrase
 */
export interface Ngram {
  /** Phrase text */
  phrase: string;

  /** N-gram size (1=unigram, 2=bigram, 3=trigram) */
  n: number;

  /** Frequency in content */
  frequency: number;
}

/**
 * Error types for semantic analysis
 */
export enum SemanticAnalysisErrorCode {
  INVALID_CONTENT = 'INVALID_CONTENT',
  INSUFFICIENT_COMPETITORS = 'INSUFFICIENT_COMPETITORS',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  SCORING_FAILED = 'SCORING_FAILED',
  RECOMMENDATION_FAILED = 'RECOMMENDATION_FAILED',
}

/**
 * Semantic analysis error
 */
export interface SemanticAnalysisError extends Error {
  code: SemanticAnalysisErrorCode;
  details?: Record<string, unknown>;
}
