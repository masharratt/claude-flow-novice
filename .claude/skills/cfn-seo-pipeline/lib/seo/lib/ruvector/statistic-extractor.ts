/**
 * StatisticExtractor - Parses research content to identify and extract statistics with citations
 *
 * Part of Phase 2 Sprint 2: RuVector Intelligence Integration
 * Extracts numeric claims, percentages, currency values with source attribution
 */

import type { StatisticEntry } from './schemas';
import type { StatisticInput } from './collections/statistics';

/**
 * Research content to extract statistics from
 */
export interface ResearchContent {
  /** Full text content of research */
  text: string;

  /** Source name (organization/publication) */
  sourceName: string;

  /** Source URL where content was found */
  sourceUrl: string;

  /** Publication date if known */
  publicationDate?: Date;

  /** Topics/tags for this research */
  topics: string[];

  /** Niche category */
  niche: string;

  /** Parent niche for cross-niche */
  parentNiche?: string;
}

/**
 * Extracted statistic ready for storage
 */
export interface ExtractedStatistic {
  statistic: string;
  numericValue: number;
  unit: string;
  topics: string[];
  sourceName: string;
  sourceUrl: string;
  publicationDate: Date;
  credibilityScore: number;
  timeSensitive: boolean;
  niche: string;
  parentNiche?: string;
}

/**
 * Extraction result with metrics
 */
export interface StatisticExtractionResult {
  statistics: ExtractedStatistic[];
  extractionTime: number;
  patterns: {
    numericClaimsFound: number;
    percentagesFound: number;
    currencyValuesFound: number;
    citationsFound: number;
  };
}

/**
 * Configuration for StatisticExtractor
 */
export interface StatisticExtractorConfig {
  /** Minimum confidence for statistic extraction (default: 0.6) */
  minConfidence?: number;

  /** Maximum age in days for time-sensitive stats (default: 365) */
  timeSensitiveMaxAge?: number;

  /** Default credibility score (default: 0.6) */
  defaultCredibilityScore?: number;

  /** Patterns that indicate time sensitivity */
  timeSensitiveKeywords?: string[];
}

/**
 * Percentage patterns
 */
const PERCENTAGE_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*%\s+(?:of\s+)?([^.!?\n]+)/gi,  // "73% of families..."
  /(\d+(?:\.\d+)?)\s*percent\s+(?:of\s+)?([^.!?\n]+)/gi,
];

/**
 * Currency patterns
 */
const CURRENCY_PATTERNS = [
  /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(billion|million|trillion)?([^.!?\n]*)/gi,
  /(\d+(?:\.\d+)?)\s*(billion|million|trillion)\s*(?:dollars|USD)([^.!?\n]*)/gi,
];

/**
 * Numeric claim patterns
 */
const NUMERIC_PATTERNS = [
  /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(people|users|customers|companies|businesses|families|adults|children)([^.!?\n]*)/gi,
  /(\d+(?:\.\d+)?)\s*(?:times|x)\s+(?:more|less|higher|lower)([^.!?\n]*)/gi,
  /(?:increased|decreased|grew|fell)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%([^.!?\n]*)/gi,
  /(\d+)\s+out\s+of\s+(\d+)([^.!?\n]*)/gi,  // "3 out of 4"
];

/**
 * Citation context patterns
 */
const CITATION_PATTERNS = [
  /according to\s+([^,.\n]+)/gi,
  /(?:study|research|survey|report)\s+(?:by|from)\s+([^,.\n]+)/gi,
  /\(([^)]+,?\s*\d{4})\)/g,  // Academic citation format
];

/**
 * Default time-sensitive keywords
 */
const DEFAULT_TIME_SENSITIVE_KEYWORDS = [
  'current', 'latest', 'recent', 'this year', 'today',
  '2024', '2025', // Current years
  'Q1', 'Q2', 'Q3', 'Q4',
  'market', 'stock', 'price', 'rate',
  'pandemic', 'covid', 'inflation',
];

/**
 * Detect unit from match and context
 */
function detectUnit(match: string, context: string): string {
  if (/%|percent/i.test(match)) return 'percent';
  if (/\$|dollar|USD/i.test(match)) return 'USD';
  if (/billion/i.test(context)) return 'billion';
  if (/million/i.test(context)) return 'million';
  if (/people|users|customers/i.test(context)) return 'count';
  if (/times|x/i.test(match)) return 'multiplier';
  if (/year|month|day/i.test(context)) return 'time';
  return 'numeric';
}

/**
 * Estimate credibility score based on source characteristics
 */
function estimateCredibilityScore(
  sourceName: string,
  sourceUrl: string,
  hasCitation: boolean,
  publicationDate?: Date
): number {
  let score = 0.5; // Base score

  // Source type boosts
  if (/\.gov$/i.test(sourceUrl)) score += 0.20;
  if (/\.edu$/i.test(sourceUrl)) score += 0.15;
  if (/research|study|journal/i.test(sourceName)) score += 0.10;
  if (/university|institute/i.test(sourceName)) score += 0.10;

  // Citation presence boost
  if (hasCitation) score += 0.10;

  // Recency boost (within 2 years)
  if (publicationDate) {
    const ageInDays = (Date.now() - publicationDate.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 365) score += 0.10;
    else if (ageInDays < 730) score += 0.05;
  }

  return Math.min(score, 1.0);
}

/**
 * Check if statistic is time-sensitive
 */
function isTimeSensitive(
  statistic: string,
  context: string,
  keywords: string[]
): boolean {
  const combined = `${statistic} ${context}`.toLowerCase();
  return keywords.some(keyword =>
    combined.includes(keyword.toLowerCase())
  );
}

/**
 * Extract publication date from text or URL
 */
function extractPublicationDate(text: string, sourceUrl: string): Date | undefined {
  // Try to extract year from citation
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return new Date(`${yearMatch[0]}-01-01`);
  }

  // Try URL date patterns
  const urlYearMatch = sourceUrl.match(/\/(19|20)\d{2}\//);
  if (urlYearMatch) {
    return new Date(`${urlYearMatch[0].replace(/\//g, '')}-01-01`);
  }

  // Default to now if no date found
  return new Date();
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
function similarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1.0 : 0.0;
  if (len2 === 0) return 0.0;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Calculate Levenshtein distance
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1.0 - (distance / maxLen);
}

/**
 * Check if two statistics are duplicates
 */
function isDuplicateStat(stat1: ExtractedStatistic, stat2: ExtractedStatistic): boolean {
  // Normalize: remove extra whitespace, lowercase
  const norm1 = stat1.statistic.toLowerCase().replace(/\s+/g, ' ').trim();
  const norm2 = stat2.statistic.toLowerCase().replace(/\s+/g, ' ').trim();

  // Same numeric value and similar text
  if (stat1.numericValue === stat2.numericValue) {
    // Check if ~80% similar
    return similarity(norm1, norm2) > 0.8;
  }
  return false;
}

/**
 * Parse numeric value from string, handling commas and decimal points
 */
function parseNumericValue(valueStr: string): number {
  // Remove commas
  const cleaned = valueStr.replace(/,/g, '');
  return parseFloat(cleaned);
}

/**
 * StatisticExtractor - Main extraction class
 */
export class StatisticExtractor {
  private minConfidence: number;
  private timeSensitiveMaxAge: number;
  private defaultCredibilityScore: number;
  private timeSensitiveKeywords: string[];

  constructor(config: StatisticExtractorConfig = {}) {
    this.minConfidence = config.minConfidence ?? 0.6;
    this.timeSensitiveMaxAge = config.timeSensitiveMaxAge ?? 365;
    this.defaultCredibilityScore = config.defaultCredibilityScore ?? 0.6;
    this.timeSensitiveKeywords = config.timeSensitiveKeywords ?? DEFAULT_TIME_SENSITIVE_KEYWORDS;
  }

  /**
   * Extract statistics from research content
   */
  extract(content: ResearchContent): StatisticExtractionResult {
    const startTime = Date.now();
    const statistics: ExtractedStatistic[] = [];
    const patterns = {
      numericClaimsFound: 0,
      percentagesFound: 0,
      currencyValuesFound: 0,
      citationsFound: 0,
    };

    const text = content.text;

    // Extract publication date if not provided
    const publicationDate = content.publicationDate ??
      extractPublicationDate(text, content.sourceUrl) ??
      new Date();

    // Find all citations in the text
    const citations: string[] = [];
    for (const pattern of CITATION_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        citations.push(match[1]);
        patterns.citationsFound++;
      }
    }

    const hasCitation = citations.length > 0;

    // Extract percentage statistics
    for (const pattern of PERCENTAGE_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        const numericValue = parseFloat(match[1]);
        const context = match[2] || '';
        const statistic = `${match[1]}% ${context}`.trim();

        const credibilityScore = estimateCredibilityScore(
          content.sourceName,
          content.sourceUrl,
          hasCitation,
          publicationDate
        );

        if (credibilityScore >= this.minConfidence) {
          statistics.push({
            statistic,
            numericValue,
            unit: 'percent',
            topics: content.topics,
            sourceName: content.sourceName,
            sourceUrl: content.sourceUrl,
            publicationDate,
            credibilityScore,
            timeSensitive: isTimeSensitive(statistic, context, this.timeSensitiveKeywords),
            niche: content.niche,
            parentNiche: content.parentNiche,
          });
          patterns.percentagesFound++;
        }
      }
    }

    // Extract currency statistics
    for (const pattern of CURRENCY_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        const valueStr = match[1];
        const magnitude = match[2] || '';
        const context = match[3] || '';

        let numericValue = parseNumericValue(valueStr);

        // Apply magnitude multiplier
        if (magnitude.toLowerCase() === 'billion') numericValue *= 1e9;
        else if (magnitude.toLowerCase() === 'million') numericValue *= 1e6;
        else if (magnitude.toLowerCase() === 'trillion') numericValue *= 1e12;

        const unit = detectUnit(match[0], context);
        const statistic = `$${valueStr}${magnitude ? ' ' + magnitude : ''}${context}`.trim();

        const credibilityScore = estimateCredibilityScore(
          content.sourceName,
          content.sourceUrl,
          hasCitation,
          publicationDate
        );

        if (credibilityScore >= this.minConfidence) {
          statistics.push({
            statistic,
            numericValue,
            unit,
            topics: content.topics,
            sourceName: content.sourceName,
            sourceUrl: content.sourceUrl,
            publicationDate,
            credibilityScore,
            timeSensitive: isTimeSensitive(statistic, context, this.timeSensitiveKeywords),
            niche: content.niche,
            parentNiche: content.parentNiche,
          });
          patterns.currencyValuesFound++;
        }
      }
    }

    // Extract numeric claim statistics
    for (const pattern of NUMERIC_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        let numericValue: number;
        let statistic: string;
        let context: string;

        // Handle "X out of Y" pattern
        if (match[0].includes('out of')) {
          const numerator = parseFloat(match[1]);
          const denominator = parseFloat(match[2]);
          numericValue = (numerator / denominator) * 100; // Convert to percentage
          context = match[3] || '';
          statistic = `${match[1]} out of ${match[2]}${context}`.trim();
        } else if (match[0].match(/increased|decreased|grew|fell/i)) {
          numericValue = parseFloat(match[1]);
          context = match[2] || '';
          statistic = match[0].trim();
        } else {
          numericValue = parseNumericValue(match[1]);
          context = match[3] || match[2] || '';
          statistic = match[0].trim();
        }

        const unit = detectUnit(match[0], context);

        const credibilityScore = estimateCredibilityScore(
          content.sourceName,
          content.sourceUrl,
          hasCitation,
          publicationDate
        );

        if (credibilityScore >= this.minConfidence) {
          statistics.push({
            statistic,
            numericValue,
            unit,
            topics: content.topics,
            sourceName: content.sourceName,
            sourceUrl: content.sourceUrl,
            publicationDate,
            credibilityScore,
            timeSensitive: isTimeSensitive(statistic, context, this.timeSensitiveKeywords),
            niche: content.niche,
            parentNiche: content.parentNiche,
          });
          patterns.numericClaimsFound++;
        }
      }
    }

    // Deduplicate statistics
    const deduped = this.deduplicateStatistics(statistics);

    const extractionTime = Date.now() - startTime;

    return {
      statistics: deduped,
      extractionTime,
      patterns,
    };
  }

  /**
   * Extract statistics from multiple research items
   */
  extractBatch(contents: ResearchContent[]): StatisticExtractionResult {
    const startTime = Date.now();
    const allStatistics: ExtractedStatistic[] = [];
    const patterns = {
      numericClaimsFound: 0,
      percentagesFound: 0,
      currencyValuesFound: 0,
      citationsFound: 0,
    };

    for (const content of contents) {
      const result = this.extract(content);
      allStatistics.push(...result.statistics);
      patterns.numericClaimsFound += result.patterns.numericClaimsFound;
      patterns.percentagesFound += result.patterns.percentagesFound;
      patterns.currencyValuesFound += result.patterns.currencyValuesFound;
      patterns.citationsFound += result.patterns.citationsFound;
    }

    // Deduplicate across all extractions
    const deduped = this.deduplicateStatistics(allStatistics);

    const extractionTime = Date.now() - startTime;

    return {
      statistics: deduped,
      extractionTime,
      patterns,
    };
  }

  /**
   * Deduplicate statistics using normalized text comparison
   */
  private deduplicateStatistics(statistics: ExtractedStatistic[]): ExtractedStatistic[] {
    const unique: ExtractedStatistic[] = [];

    for (const stat of statistics) {
      const isDupe = unique.some(existing => isDuplicateStat(existing, stat));
      if (!isDupe) {
        unique.push(stat);
      }
    }

    return unique;
  }

  /**
   * Convert extracted statistic to StatisticInput for storage
   * The collection's add() method handles metadata fields
   */
  static toStatisticInput(extracted: ExtractedStatistic): StatisticInput {
    return {
      statistic: extracted.statistic,
      numericValue: extracted.numericValue,
      unit: extracted.unit,
      topics: extracted.topics,
      sourceName: extracted.sourceName,
      sourceUrl: extracted.sourceUrl,
      publicationDate: extracted.publicationDate,
      credibilityScore: extracted.credibilityScore,
      timeSensitive: extracted.timeSensitive,
      niche: extracted.niche,
      parentNiche: extracted.parentNiche,
    };
  }
}
