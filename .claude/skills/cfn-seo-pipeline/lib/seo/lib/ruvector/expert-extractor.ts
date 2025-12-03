/**
 * Expert Extractor for RuVector SEO Pipeline
 *
 * Parses research content to identify and extract expert sources with quotes.
 * Part of Phase 2 Sprint 2: SEO RuVector Intelligence Integration.
 */

import { ExpertQuote, ExpertSourceRef } from './schemas';

/**
 * Research content to extract experts from
 */
export interface ResearchContent {
  /** Full text content of research */
  text: string;

  /** Source URL where content was found */
  sourceUrl: string;

  /** Source type */
  sourceType: 'website' | 'book' | 'interview' | 'research_paper' | 'social_media' | 'podcast' | 'other';

  /** Topics/tags for this research */
  topics: string[];

  /** Niche category */
  niche: string;

  /** Parent niche for cross-niche */
  parentNiche?: string;
}

/**
 * Extracted expert ready for storage
 */
export interface ExtractedExpert {
  name: string;
  credentials: string;
  primaryDomain: string;
  topics: string[];
  authorityScore: number;
  quotes: ExpertQuote[];
  sources: ExpertSourceRef[];
  niche: string;
  parentNiche?: string;
}

/**
 * Extraction result with metrics
 */
export interface ExpertExtractionResult {
  experts: ExtractedExpert[];
  extractionTime: number;
  patterns: {
    quotesFound: number;
    namedEntitiesFound: number;
    credentialsMatched: number;
  };
}

/**
 * Configuration for expert extraction
 */
export interface ExpertExtractorConfig {
  /** Minimum confidence for name extraction (default: 0.7) */
  minNameConfidence?: number;

  /** Minimum quote length to consider (default: 20) */
  minQuoteLength?: number;

  /** Maximum quote length (default: 500) */
  maxQuoteLength?: number;

  /** Default authority score for new experts (default: 0.5) */
  defaultAuthorityScore?: number;
}

/**
 * Quote patterns to find expert statements
 * Supports both straight quotes (") and curly quotes ("")
 */
const QUOTE_PATTERNS = [
  // Pattern: "quote" said/says Name Name (with optional trailing context)
  /["""]([^"""]+)["""]\s*(?:said|says|stated|explains?|noted|according to)\s+([A-Z][a-z]+(?: [A-Z][a-z'-]+)+)(?:,|\.|\s|$)/gi,

  // Pattern: Name Name, credentials/title, said/says "quote"
  /([A-Z][a-z]+(?: [A-Z][a-z'-]+)+)(?:,?\s*(?:Ph\.?D\.?|M\.?D\.?|CEO|founder|professor|director|expert|chief|Dr\.?|researcher|scientist))[^"]*?\s*(?:said|says|stated|explains?|noted|told|wrote|explained)(?:\s+that)?\s*["""']([^"""']+)["""']/gi,

  // Pattern: According to Name Name, "quote"
  /According to ([A-Z][a-z]+(?: [A-Z][a-z'-]+)+)(?:,?\s*[^,]+)?,?\s*["""']([^"""']+)["""']/gi,

  // Pattern: Name Name explains/notes: "quote"
  /([A-Z][a-z]+(?: [A-Z][a-z'-]+)+)\s+(?:explains?|notes?|states?|argues?|suggests?):\s*["""']([^"""']+)["""']/gi,

  // Pattern: Dr. Name Name, title of Domain, said "quote"
  /(?:Dr\.?|Professor)?\s*([A-Z][a-z]+(?: [A-Z][a-z'-]+)+),\s*(?:professor|director|expert|researcher)\s+(?:of|in|at)\s+[A-Za-z\s]+,\s*(?:said|says|stated|explains?|noted|told)\s*["""']([^"""']+)["""']/gi,
];

/**
 * Credential patterns with capture groups
 */
const CREDENTIAL_PATTERNS = [
  /\b(Ph\.?D\.?(?:\s+in\s+[A-Za-z\s]+)?)\b/i,
  /\b(M\.?D\.?(?:\s+in\s+[A-Za-z\s]+)?)\b/i,
  /\b((?:Chief\s+)?(?:Executive\s+)?Officer|CEO|CTO|CFO|COO)\b/i,
  /\b((?:co-)?founder(?:\s+(?:and|&)\s+(?:co-)?founder)?(?:\s+of\s+[A-Za-z\s]+)?)\b/i,
  /\b(professor(?:\s+of\s+[A-Za-z\s]+)?|Prof\.?)\b/i,
  /\b(director(?:\s+of\s+[A-Za-z\s]+)?)\b/i,
  /\b(author\s+of\s+[^,.\n]+)\b/i,
  /\b(expert\s+in\s+[^,.\n]+)\b/i,
  /\b(researcher\s+at\s+[A-Za-z\s]+)\b/i,
  /\b(scientist\s+at\s+[A-Za-z\s]+)\b/i,
  /\b(lead\s+[A-Za-z\s]+\s+at\s+[A-Za-z\s]+)\b/i,
  /\b(senior\s+[A-Za-z\s]+\s+at\s+[A-Za-z\s]+)\b/i,
];

/**
 * Domain extraction patterns
 */
const DOMAIN_PATTERNS = [
  /(?:expert in|specializing in|professor of|director of)\s+([^,.\n]+)/i,
  /([A-Za-z\s]+)\s+(?:researcher|scientist|professor|specialist)/i,
  /Ph\.?D\.?\s+in\s+([^,.\n]+)/i,
  /M\.?D\.?\s+in\s+([^,.\n]+)/i,
];

/**
 * Expert Extractor
 *
 * Extracts expert sources and quotes from research content using
 * pattern-based detection and heuristic authority scoring.
 */
export class ExpertExtractor {
  private config: Required<ExpertExtractorConfig>;

  constructor(config?: ExpertExtractorConfig) {
    this.config = {
      minNameConfidence: config?.minNameConfidence ?? 0.7,
      minQuoteLength: config?.minQuoteLength ?? 20,
      maxQuoteLength: config?.maxQuoteLength ?? 500,
      defaultAuthorityScore: config?.defaultAuthorityScore ?? 0.5,
    };
  }

  /**
   * Extract experts from research content
   */
  extract(content: ResearchContent): ExpertExtractionResult {
    const startTime = Date.now();
    const experts = new Map<string, ExtractedExpert>();

    let quotesFound = 0;
    let namedEntitiesFound = 0;
    let credentialsMatched = 0;

    // Extract quotes and associated experts
    for (let patternIndex = 0; patternIndex < QUOTE_PATTERNS.length; patternIndex++) {
      const pattern = QUOTE_PATTERNS[patternIndex];
      const matches = Array.from(content.text.matchAll(pattern));

      for (const match of matches) {
        // Patterns have different group orders
        let name: string;
        let quote: string;

        // Determine group order based on pattern index
        if (match[1] && match[2]) {
          if (patternIndex === 0) {
            // Pattern 0: "quote" said Name -> [quote, name]
            quote = match[1];
            name = match[2];
          } else {
            // Patterns 1-4: Name ... "quote" -> [name, quote]
            name = match[1];
            quote = match[2];
          }
        } else {
          continue;
        }

        // Validate quote length
        if (quote.length < this.config.minQuoteLength ||
            quote.length > this.config.maxQuoteLength) {
          continue;
        }

        quotesFound++;
        namedEntitiesFound++;

        // Normalize name
        const normalizedName = this.normalizeName(name);

        // Extract credentials from surrounding context
        const contextWindow = this.getContextWindow(content.text, match.index!);
        const credentials = this.extractCredentials(contextWindow);

        if (credentials) {
          credentialsMatched++;
        }

        // Get or create expert entry
        const expertKey = normalizedName.toLowerCase();
        let expert = experts.get(expertKey);

        if (!expert) {
          const primaryDomain = this.extractPrimaryDomain(
            credentials || '',
            content.topics
          );

          const authorityScore = this.estimateAuthorityScore(
            normalizedName,
            credentials || '',
            1,
            content.sourceType
          );

          expert = {
            name: normalizedName,
            credentials: credentials || '',
            primaryDomain,
            topics: [...content.topics],
            authorityScore,
            quotes: [],
            sources: [{
              url: content.sourceUrl,
              type: content.sourceType,
            }],
            niche: content.niche,
            parentNiche: content.parentNiche,
          };

          experts.set(expertKey, expert);
        }

        // Add quote if not duplicate
        const expertQuote: ExpertQuote = {
          text: quote.trim(),
          context: contextWindow.trim(),
          topicTags: content.topics,
          addedDate: new Date(),
        };

        if (!this.isDuplicateQuote(expert.quotes, expertQuote)) {
          expert.quotes.push(expertQuote);

          // Update authority score based on quote count
          expert.authorityScore = this.estimateAuthorityScore(
            expert.name,
            expert.credentials,
            expert.quotes.length,
            content.sourceType
          );
        }

        // Merge topics
        expert.topics = Array.from(new Set([...expert.topics, ...content.topics]));
      }
    }

    const extractionTime = Date.now() - startTime;

    return {
      experts: Array.from(experts.values()),
      extractionTime,
      patterns: {
        quotesFound,
        namedEntitiesFound,
        credentialsMatched,
      },
    };
  }

  /**
   * Extract experts from multiple research items
   */
  extractBatch(contents: ResearchContent[]): ExpertExtractionResult {
    const startTime = Date.now();
    const expertMap = new Map<string, ExtractedExpert>();

    let totalQuotes = 0;
    let totalEntities = 0;
    let totalCredentials = 0;

    for (const content of contents) {
      const result = this.extract(content);

      totalQuotes += result.patterns.quotesFound;
      totalEntities += result.patterns.namedEntitiesFound;
      totalCredentials += result.patterns.credentialsMatched;

      // Merge experts
      for (const expert of result.experts) {
        const key = expert.name.toLowerCase();
        const existing = expertMap.get(key);

        if (existing) {
          expertMap.set(key, this.mergeExperts(existing, expert));
        } else {
          expertMap.set(key, expert);
        }
      }
    }

    const extractionTime = Date.now() - startTime;

    return {
      experts: Array.from(expertMap.values()),
      extractionTime,
      patterns: {
        quotesFound: totalQuotes,
        namedEntitiesFound: totalEntities,
        credentialsMatched: totalCredentials,
      },
    };
  }

  /**
   * Normalize expert name for deduplication
   */
  private normalizeName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[,.;:]+$/, '')
      .replace(/\b(Dr|Prof|Mr|Ms|Mrs)\.?\s+/gi, '');
  }

  /**
   * Extract context window around a match
   */
  private getContextWindow(text: string, index: number, windowSize: number = 200): string {
    const start = Math.max(0, index - windowSize);
    const end = Math.min(text.length, index + windowSize);
    return text.substring(start, end);
  }

  /**
   * Extract credentials from text
   */
  private extractCredentials(text: string): string | null {
    const credentials: string[] = [];

    for (const pattern of CREDENTIAL_PATTERNS) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        credentials.push(match[1].trim());
      }
    }

    return credentials.length > 0 ? credentials.join(', ') : null;
  }

  /**
   * Extract primary domain from credentials and topics
   */
  private extractPrimaryDomain(credentials: string, topics: string[]): string {
    // Try to extract domain from credentials
    for (const pattern of DOMAIN_PATTERNS) {
      const match = pattern.exec(credentials);
      if (match && match[1]) {
        return match[1].trim().toLowerCase();
      }
    }

    // Fall back to most common topic
    return topics[0]?.toLowerCase() || 'general';
  }

  /**
   * Estimate authority score based on credentials and source type
   */
  private estimateAuthorityScore(
    name: string,
    credentials: string,
    quotesFound: number,
    sourceType: string
  ): number {
    let score = this.config.defaultAuthorityScore;

    // Credential boosts
    if (/Ph\.?D|professor/i.test(credentials)) score += 0.15;
    if (/M\.?D/i.test(credentials)) score += 0.12;
    if (/CEO|founder|director|chief/i.test(credentials)) score += 0.10;
    if (/researcher|scientist/i.test(credentials)) score += 0.08;
    if (/author of/i.test(credentials)) score += 0.05;

    // Source type boosts
    if (sourceType === 'research_paper') score += 0.10;
    if (sourceType === 'interview') score += 0.05;
    if (sourceType === 'book') score += 0.08;

    // Multiple quotes boost
    if (quotesFound > 1) score += 0.05;
    if (quotesFound > 3) score += 0.05;
    if (quotesFound > 5) score += 0.03;

    return Math.min(score, 1.0);
  }

  /**
   * Check if quote is duplicate
   */
  private isDuplicateQuote(quotes: ExpertQuote[], newQuote: ExpertQuote): boolean {
    const normalizedNew = newQuote.text.toLowerCase().trim();

    return quotes.some(q => {
      const normalized = q.text.toLowerCase().trim();
      // Consider duplicates if 90% similar (simple Levenshtein-like check)
      return normalized === normalizedNew || this.similarity(normalized, normalizedNew) > 0.9;
    });
  }

  /**
   * Simple similarity check (character overlap)
   */
  private similarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    // Count matching characters
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++;
    }

    return matches / longer.length;
  }

  /**
   * Merge new expert data with existing expert
   */
  private mergeExperts(
    existing: ExtractedExpert,
    newData: ExtractedExpert
  ): ExtractedExpert {
    // Merge quotes (dedupe)
    const mergedQuotes = [...existing.quotes];
    for (const quote of newData.quotes) {
      if (!this.isDuplicateQuote(mergedQuotes, quote)) {
        mergedQuotes.push(quote);
      }
    }

    // Merge topics (unique)
    const mergedTopics = Array.from(new Set([...existing.topics, ...newData.topics]));

    // Merge sources (unique by URL)
    const mergedSources = this.dedupeSources([...existing.sources, ...newData.sources]);

    // Update credentials (prefer longer/more detailed)
    const mergedCredentials = existing.credentials.length > newData.credentials.length
      ? existing.credentials
      : newData.credentials;

    // Update authority score (use max)
    const mergedAuthorityScore = Math.max(existing.authorityScore, newData.authorityScore);

    return {
      ...existing,
      credentials: mergedCredentials,
      quotes: mergedQuotes,
      topics: mergedTopics,
      sources: mergedSources,
      authorityScore: mergedAuthorityScore,
    };
  }

  /**
   * Deduplicate sources by URL
   */
  private dedupeSources(sources: ExpertSourceRef[]): ExpertSourceRef[] {
    const seen = new Set<string>();
    const unique: ExpertSourceRef[] = [];

    for (const source of sources) {
      if (!seen.has(source.url)) {
        seen.add(source.url);
        unique.push(source);
      }
    }

    return unique;
  }
}
