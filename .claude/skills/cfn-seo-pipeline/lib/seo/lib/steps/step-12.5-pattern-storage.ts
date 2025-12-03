/**
 * Step 12.5: Pattern Storage
 *
 * Extracts and stores successful content patterns to RuVector for future reuse.
 * Runs after validation passes (Step 12) and stores patterns with initial confidence
 * scores based on validation results.
 *
 * Phase 4 Sprint 1 Task 3: SEO RuVector Intelligence Integration
 */

import type { SEOQueryManager } from '../ruvector/queries';
import type { ContentPatternType } from '../ruvector/schemas';

// ============================================================================
// Configuration Interface
// ============================================================================

export interface Step12_5Config {
  /** SEO Query Manager for RuVector operations */
  seoQueryManager: SEOQueryManager;

  /** Minimum validation score to store pattern (default: 0.7) */
  minValidationScore?: number;

  /** Initial confidence based on validation score (default formula) */
  calculateInitialConfidence?: (validationScore: number) => number;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Niche category for patterns */
  niche: string;

  /** Parent niche for cross-niche */
  parentNiche?: string;
}

// ============================================================================
// Content Context Interface
// ============================================================================

/**
 * Content context passed from validation
 */
export interface ContentContext {
  /** Article ID */
  articleId: string;

  /** Article title */
  title: string;

  /** Target keyword */
  targetKeyword: string;

  /** Content type/format */
  contentType: string;

  /** Full article text */
  content: string;

  /** Article structure */
  structure: {
    headings: string[];
    wordCount: number;
    paragraphCount: number;
    listCount: number;
    imageCount: number;
  };

  /** Validation scores */
  validationScores: {
    overall: number;
    depth: number;
    voice: number;
    structure: number;
    seo: number;
  };

  /** Unique angle/thesis */
  angle?: string;

  /** Opening hook */
  hook?: string;

  /** Call-to-action */
  cta?: string;
}

// ============================================================================
// Result Interfaces
// ============================================================================

export interface Step12_5Result {
  /** Number of patterns extracted */
  patternsExtracted: number;

  /** Number of patterns stored */
  patternsStored: number;

  /** Number of patterns skipped (below threshold) */
  patternsSkipped: number;

  /** Pattern details */
  patterns: StoredPatternInfo[];

  /** Execution time (ms) */
  executionTime: number;

  /** Errors (if any) */
  errors: string[];
}

export interface StoredPatternInfo {
  patternType: ContentPatternType;
  description: string;
  confidence: number;
  articleId: string;
  stored: boolean;
  reason: string;
}

// ============================================================================
// Internal Pattern Structure
// ============================================================================

interface ExtractedPattern {
  type: ContentPatternType;
  description: string;
  example: string;
  applicability: {
    contentTypes: string[];
    industries: string[];
    restrictions: string[];
  };
}

// ============================================================================
// Default Confidence Calculation
// ============================================================================

/**
 * Default formula for initial confidence
 *
 * Start at 0.5, scale up based on validation score
 * - Validation score of 0.7 (minimum) gives 0.55 confidence
 * - Validation score of 1.0 (perfect) gives 0.75 confidence
 */
function defaultConfidenceCalculation(validationScore: number): number {
  return 0.5 + (validationScore - 0.5) * 0.5;
}

// ============================================================================
// Pattern Extraction Functions
// ============================================================================

/**
 * Extract ANGLE pattern from content context
 */
function extractAnglePattern(context: ContentContext): ExtractedPattern | null {
  if (!context.angle) return null;

  return {
    type: 'ANGLE',
    description: context.angle,
    example: context.title,
    applicability: {
      contentTypes: [context.contentType],
      industries: [],
      restrictions: [],
    },
  };
}

/**
 * Extract STRUCTURE pattern from content context
 */
function extractStructurePattern(context: ContentContext): ExtractedPattern | null {
  const { structure, validationScores } = context;

  // Skip if structure score is too low
  if (validationScores.structure < 0.7) return null;

  return {
    type: 'STRUCTURE',
    description: `${structure.headings.length} sections, ${structure.wordCount} words, ${structure.listCount} lists, ${structure.imageCount} images`,
    example: JSON.stringify({
      headingPattern: structure.headings.slice(0, 5),
      wordCount: structure.wordCount,
      paragraphCount: structure.paragraphCount,
      listCount: structure.listCount,
      imageCount: structure.imageCount,
    }),
    applicability: {
      contentTypes: [context.contentType],
      industries: [],
      restrictions: [],
    },
  };
}

/**
 * Extract VOICE pattern from content context
 */
function extractVoicePattern(context: ContentContext): ExtractedPattern | null {
  const { validationScores, content } = context;

  // Skip if voice score is too low
  if (validationScores.voice < 0.7) return null;

  // Extract voice characteristics
  const hasFirstPerson = /\b(I|we|my|our)\b/i.test(content);
  const hasQuestions = (content.match(/\?/g) || []).length > 3;
  const hasContractions = /\b(don't|won't|can't|it's|that's)\b/i.test(content);

  const voiceTraits: string[] = [];
  if (hasFirstPerson) voiceTraits.push('first-person');
  if (hasQuestions) voiceTraits.push('conversational');
  if (hasContractions) voiceTraits.push('casual');
  if (!hasFirstPerson && !hasContractions) voiceTraits.push('professional');

  // Extract first 200 characters as example
  const example = content.substring(0, 200).trim();

  return {
    type: 'VOICE',
    description: `Voice style: ${voiceTraits.join(', ')}`,
    example,
    applicability: {
      contentTypes: [context.contentType],
      industries: [],
      restrictions: [],
    },
  };
}

/**
 * Extract HOOK pattern from content context
 */
function extractHookPattern(context: ContentContext): ExtractedPattern | null {
  let hook: string;
  let description: string;

  if (context.hook) {
    // Use provided hook
    hook = context.hook;
    description = 'Custom hook pattern';
  } else {
    // Try to extract first paragraph as hook
    const firstPara = context.content.split('\n\n')[0];

    // Validate paragraph length
    if (!firstPara || firstPara.length < 50 || firstPara.length > 500) {
      return null;
    }

    hook = firstPara;
    description = 'Opening paragraph pattern';
  }

  return {
    type: 'HOOK',
    description,
    example: hook,
    applicability: {
      contentTypes: [context.contentType],
      industries: [],
      restrictions: [],
    },
  };
}

/**
 * Extract CTA pattern from content context
 */
function extractCTAPattern(context: ContentContext): ExtractedPattern | null {
  if (!context.cta) return null;

  return {
    type: 'CTA',
    description: 'Call-to-action pattern',
    example: context.cta,
    applicability: {
      contentTypes: [context.contentType],
      industries: [],
      restrictions: [],
    },
  };
}

/**
 * Extract DEPTH pattern from content context
 */
function extractDepthPattern(context: ContentContext): ExtractedPattern | null {
  const { validationScores, structure } = context;

  // Skip if depth score is too low
  if (validationScores.depth < 0.7) return null;

  // Calculate depth metrics
  const avgWordsPerSection = structure.wordCount / Math.max(structure.headings.length, 1);
  const hasSubheadings = structure.headings.length > 5;
  const hasLists = structure.listCount > 0;

  return {
    type: 'DEPTH',
    description: `Depth: ${avgWordsPerSection.toFixed(0)} words/section, ${hasSubheadings ? 'detailed structure' : 'simple structure'}, ${hasLists ? 'with lists' : 'no lists'}`,
    example: JSON.stringify({
      avgWordsPerSection: Math.round(avgWordsPerSection),
      sectionCount: structure.headings.length,
      listCount: structure.listCount,
      hasSubheadings,
    }),
    applicability: {
      contentTypes: [context.contentType],
      industries: [],
      restrictions: [],
    },
  };
}

// ============================================================================
// Pattern Storage Logic
// ============================================================================

/**
 * Store a single pattern to RuVector
 */
async function storePattern(
  pattern: ExtractedPattern,
  context: ContentContext,
  config: Step12_5Config
): Promise<StoredPatternInfo> {
  // Calculate initial confidence
  const confidence = config.calculateInitialConfidence
    ? config.calculateInitialConfidence(context.validationScores.overall)
    : defaultConfidenceCalculation(context.validationScores.overall);

  // Check validation threshold
  const minScore = config.minValidationScore || 0.7;
  if (context.validationScores.overall < minScore) {
    return {
      patternType: pattern.type,
      description: pattern.description,
      confidence,
      articleId: context.articleId,
      stored: false,
      reason: `Validation score ${context.validationScores.overall.toFixed(2)} below threshold ${minScore.toFixed(2)}`,
    };
  }

  // Attempt to store pattern
  try {
    await config.seoQueryManager.contentPatterns.add({
      type: pattern.type,
      description: pattern.description,
      example: pattern.example,
      confidenceScore: confidence,
      niche: config.niche,
      format: context.contentType,
      performanceMetrics: {
        successRate: context.validationScores.overall,
        avgEngagement: 0, // Will be updated as pattern is used
        conversionRate: 0,
        lastUpdated: new Date(),
      },
    });

    if (config.verbose) {
      console.log(`[Step 12.5] Stored ${pattern.type} pattern (confidence: ${confidence.toFixed(2)})`);
    }

    return {
      patternType: pattern.type,
      description: pattern.description,
      confidence,
      articleId: context.articleId,
      stored: true,
      reason: 'Successfully stored',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (config.verbose) {
      console.error(`[Step 12.5] Failed to store ${pattern.type} pattern:`, errorMsg);
    }

    return {
      patternType: pattern.type,
      description: pattern.description,
      confidence,
      articleId: context.articleId,
      stored: false,
      reason: `Storage failed: ${errorMsg}`,
    };
  }
}

// ============================================================================
// Main Execution Function
// ============================================================================

/**
 * Execute Step 12.5: Pattern Storage
 *
 * Extracts patterns from validated content and stores them to RuVector
 * for future reuse and learning.
 */
export async function executeStep12_5(
  context: ContentContext,
  config: Step12_5Config
): Promise<Step12_5Result> {
  const startTime = Date.now();
  const errors: string[] = [];
  const patterns: StoredPatternInfo[] = [];

  if (config.verbose) {
    console.log('[Step 12.5] Starting pattern extraction and storage');
    console.log(`[Step 12.5] Article: ${context.articleId}`);
    console.log(`[Step 12.5] Overall validation score: ${context.validationScores.overall.toFixed(2)}`);
  }

  // Extract all patterns
  const extractedPatterns: ExtractedPattern[] = [];

  try {
    // Extract ANGLE pattern
    const anglePattern = extractAnglePattern(context);
    if (anglePattern) {
      extractedPatterns.push(anglePattern);
      if (config.verbose) {
        console.log(`[Step 12.5] Extracted ANGLE pattern: ${anglePattern.description}`);
      }
    }

    // Extract STRUCTURE pattern
    const structurePattern = extractStructurePattern(context);
    if (structurePattern) {
      extractedPatterns.push(structurePattern);
      if (config.verbose) {
        console.log(`[Step 12.5] Extracted STRUCTURE pattern: ${structurePattern.description}`);
      }
    }

    // Extract VOICE pattern
    const voicePattern = extractVoicePattern(context);
    if (voicePattern) {
      extractedPatterns.push(voicePattern);
      if (config.verbose) {
        console.log(`[Step 12.5] Extracted VOICE pattern: ${voicePattern.description}`);
      }
    }

    // Extract HOOK pattern
    const hookPattern = extractHookPattern(context);
    if (hookPattern) {
      extractedPatterns.push(hookPattern);
      if (config.verbose) {
        console.log(`[Step 12.5] Extracted HOOK pattern: ${hookPattern.description}`);
      }
    }

    // Extract CTA pattern
    const ctaPattern = extractCTAPattern(context);
    if (ctaPattern) {
      extractedPatterns.push(ctaPattern);
      if (config.verbose) {
        console.log(`[Step 12.5] Extracted CTA pattern: ${ctaPattern.description}`);
      }
    }

    // Extract DEPTH pattern
    const depthPattern = extractDepthPattern(context);
    if (depthPattern) {
      extractedPatterns.push(depthPattern);
      if (config.verbose) {
        console.log(`[Step 12.5] Extracted DEPTH pattern: ${depthPattern.description}`);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Pattern extraction failed: ${errorMsg}`);

    if (config.verbose) {
      console.error('[Step 12.5] Pattern extraction error:', errorMsg);
    }
  }

  // Store all extracted patterns
  for (const pattern of extractedPatterns) {
    try {
      const result = await storePattern(pattern, context, config);
      patterns.push(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to store ${pattern.type} pattern: ${errorMsg}`);

      // Add failed pattern info
      patterns.push({
        patternType: pattern.type,
        description: pattern.description,
        confidence: 0,
        articleId: context.articleId,
        stored: false,
        reason: `Unexpected error: ${errorMsg}`,
      });
    }
  }

  // Calculate summary statistics
  const patternsStored = patterns.filter(p => p.stored).length;
  const patternsSkipped = patterns.filter(p => !p.stored).length;
  const executionTime = Date.now() - startTime;

  if (config.verbose) {
    console.log('[Step 12.5] Pattern storage complete');
    console.log(`[Step 12.5] Extracted: ${extractedPatterns.length}, Stored: ${patternsStored}, Skipped: ${patternsSkipped}`);
    console.log(`[Step 12.5] Execution time: ${executionTime}ms`);
  }

  return {
    patternsExtracted: extractedPatterns.length,
    patternsStored,
    patternsSkipped,
    patterns,
    executionTime,
    errors,
  };
}

// ============================================================================
// Exports
// ============================================================================

export type {
  ExtractedPattern,
};

export {
  defaultConfidenceCalculation,
  extractAnglePattern,
  extractStructurePattern,
  extractVoicePattern,
  extractHookPattern,
  extractCTAPattern,
  extractDepthPattern,
  storePattern,
};
