/**
 * Semantic Completeness Analyzer
 *
 * @module planning/seo/lib/semantic-completeness-analyzer
 * @description Analyzes content completeness by comparing against top competitors
 * @version 1.0.0
 *
 * Identifies semantic gaps, missing topics, and provides actionable recommendations
 * for comprehensive topic coverage using TF-IDF and topic extraction algorithms.
 */

import {
  Topic,
  TopicCategory,
  SemanticKeyword,
  TopicGap,
  GapPriority,
  Recommendation,
  RecommendationType,
  CompletenessReport,
  ContentStats,
  CompetitorComparison,
  CategoryBreakdown,
  SemanticAnalysisConfig,
  TopicExtractionResult,
  TfIdfResult,
  Ngram,
  SemanticAnalysisErrorCode,
  CompetitorExample,
} from '../types/semantic-analysis';

/**
 * Default configuration for semantic analysis
 */
const DEFAULT_CONFIG: Required<SemanticAnalysisConfig> = {
  minTopicFrequency: 1,
  minTopicImportance: 0.05,
  maxTopics: 100,
  fuzzyMatching: true,
  similarityThreshold: 0.85,
  tfidfSmoothing: 1.0,
  criticalThreshold: 3,
  verbose: false,
};

/**
 * Stop words to exclude from topic extraction
 */
const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
  'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
  'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
  'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
  'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
  'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
  'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had',
  'were', 'said', 'did', 'having', 'may', 'should', 'could', 'would',
]);

/**
 * Semantic Completeness Analyzer
 *
 * Analyzes content against competitors to identify semantic gaps and
 * provide actionable recommendations for comprehensive topic coverage.
 *
 * @example
 * ```typescript
 * const analyzer = new SemanticCompletenessAnalyzer({
 *   minTopicImportance: 0.15,
 *   criticalThreshold: 3,
 *   verbose: true
 * });
 *
 * const report = await analyzer.analyzeCompleteness(
 *   ourContent,
 *   [competitor1Content, competitor2Content, competitor3Content]
 * );
 *
 * console.log(`Completeness Score: ${report.score}/100`);
 * console.log(`Gaps Found: ${report.gaps.length}`);
 * console.log(`Recommendations: ${report.recommendations.length}`);
 * ```
 */
export class SemanticCompletenessAnalyzer {
  private config: Required<SemanticAnalysisConfig>;

  /**
   * Create a new SemanticCompletenessAnalyzer
   *
   * @param config - Analysis configuration
   */
  constructor(config: Partial<SemanticAnalysisConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze completeness of our content against competitors
   *
   * @param ourContent - Our content to analyze
   * @param competitorContents - Array of competitor content with metadata
   * @returns Completeness analysis report
   */
  public async analyzeCompleteness(
    ourContent: string,
    competitorContents: Array<{ domain: string; content: string }>
  ): Promise<CompletenessReport> {
    const startTime = Date.now();

    if (this.config.verbose) {
      console.log(`[SemanticAnalyzer] Analyzing content completeness...`);
      console.log(`[SemanticAnalyzer] Competitors: ${competitorContents.length}`);
    }

    // Validate inputs
    this.validateInputs(ourContent, competitorContents);

    // Extract topics from our content
    const ourTopicsResult = this.extractTopics(ourContent);
    const ourTopics = ourTopicsResult.topics;

    if (this.config.verbose) {
      console.log(`[SemanticAnalyzer] Our topics: ${ourTopics.length}`);
    }

    // Extract topics from each competitor
    const competitorTopicsByDomain = new Map<string, Topic[]>();
    for (const competitor of competitorContents) {
      const topics = this.extractTopics(competitor.content).topics;
      competitorTopicsByDomain.set(competitor.domain, topics);

      if (this.config.verbose) {
        console.log(`[SemanticAnalyzer] ${competitor.domain} topics: ${topics.length}`);
      }
    }

    // Find union of all competitor topics
    const allCompetitorTopics = this.unionCompetitorTopics(
      Array.from(competitorTopicsByDomain.values())
    );

    if (this.config.verbose) {
      console.log(`[SemanticAnalyzer] Total unique competitor topics: ${allCompetitorTopics.length}`);
    }

    // Identify gaps
    const gaps = this.identifyGaps(ourTopics, allCompetitorTopics, competitorTopicsByDomain);

    if (this.config.verbose) {
      console.log(`[SemanticAnalyzer] Gaps identified: ${gaps.length}`);
    }

    // Extract semantic keywords
    const ourKeywords = this.extractSemanticKeywords(ourContent, ourTopics);
    const competitorKeywords = this.extractSemanticKeywords(
      competitorContents.map(c => c.content).join('\n\n'),
      allCompetitorTopics
    );

    // Find missing keywords
    const missingKeywords = this.findMissingKeywords(
      ourKeywords,
      competitorKeywords,
      competitorContents.map(c => c.domain)
    );

    // Calculate coverage score
    const coverageScore = this.calculateCoverageScore(ourTopics, allCompetitorTopics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(gaps, missingKeywords);

    // Build competitor comparisons
    const competitorComparison = this.buildCompetitorComparisons(
      ourTopics,
      competitorTopicsByDomain,
      competitorContents
    );

    // Identify unique topics (we have but competitors don't)
    const uniqueTopics = this.findUniqueTopics(ourTopics, allCompetitorTopics);

    // Build category breakdown
    const categoryBreakdown = this.buildCategoryBreakdown(
      ourTopics,
      Array.from(competitorTopicsByDomain.values())
    );

    // Calculate content stats
    const ourContentStats = this.calculateContentStats(ourContent, ourTopics, ourKeywords);
    const competitorContentStats = this.calculateAggregateStats(
      competitorContents,
      Array.from(competitorTopicsByDomain.values())
    );

    const processingTime = Date.now() - startTime;

    if (this.config.verbose) {
      console.log(`[SemanticAnalyzer] Analysis complete in ${processingTime}ms`);
      console.log(`[SemanticAnalyzer] Coverage score: ${coverageScore.toFixed(1)}/100`);
    }

    return {
      score: Math.round(coverageScore * 10) / 10,
      analyzedAt: new Date(),
      competitorsAnalyzed: competitorContents.length,
      ourContent: ourContentStats,
      competitorContent: competitorContentStats,
      gaps,
      missingKeywords,
      recommendations,
      competitorComparison,
      uniqueTopics,
      categoryBreakdown,
    };
  }

  /**
   * Extract topics from content using TF-IDF
   *
   * @param content - Content to analyze
   * @returns Extracted topics with metadata
   */
  public extractTopics(content: string): TopicExtractionResult {
    const startTime = Date.now();

    // Tokenize content
    const tokens = this.tokenize(content);
    const uniqueTerms = new Set(tokens).size;

    // Extract n-grams (unigrams, bigrams, trigrams)
    const ngrams = this.extractNgrams(tokens, 3);

    // Calculate TF-IDF scores
    const tfidfScores = this.calculateTfIdf(ngrams, [content]);

    // Convert to topics with categorization
    const topics: Topic[] = tfidfScores
      .filter(score => score.score >= this.config.minTopicImportance)
      .slice(0, this.config.maxTopics)
      .map(score => this.createTopic(score, content, tokens));

    const processingTime = Date.now() - startTime;

    return {
      topics,
      processingTime,
      tokensAnalyzed: tokens.length,
      uniqueTerms,
    };
  }

  /**
   * Extract semantic keywords using LSI approach
   *
   * @param content - Content to analyze
   * @param topics - Already extracted topics
   * @returns Semantic keywords with relevance scores
   */
  public extractSemanticKeywords(content: string, topics: Topic[]): SemanticKeyword[] {
    const tokens = this.tokenize(content);
    const topicTerms = new Set(topics.map(t => t.name.toLowerCase()));

    // Extract keyword candidates (excluding already identified topics)
    const candidates = tokens.filter(
      token => !topicTerms.has(token) && !STOP_WORDS.has(token)
    );

    // Calculate co-occurrence with main topics
    const coOccurrenceMap = new Map<string, number>();
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!candidates.includes(token)) continue;

      // Check window of ±5 tokens for topic co-occurrence
      const window = tokens.slice(Math.max(0, i - 5), Math.min(tokens.length, i + 6));
      const hasTopicInWindow = window.some(t => topicTerms.has(t.toLowerCase()));

      if (hasTopicInWindow) {
        coOccurrenceMap.set(token, (coOccurrenceMap.get(token) || 0) + 1);
      }
    }

    // Build semantic keywords
    const keywords: SemanticKeyword[] = [];
    const termFrequency = this.calculateTermFrequency(candidates);

    for (const [term, coOccurrence] of coOccurrenceMap.entries()) {
      const frequency = termFrequency.get(term) || 0;
      const relevance = Math.min(1.0, (coOccurrence / Math.max(1, topics.length)) * 0.5 + frequency * 0.5);

      if (relevance >= 0.2) {
        keywords.push({
          keyword: term,
          relevance,
          competitorsUsing: 0, // Will be set by caller
          competitorDomains: [],
          coOccurrence,
          semanticDistance: 1.0 - relevance,
        });
      }
    }

    return keywords
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 50);
  }

  /**
   * Identify content gaps between our content and competitors
   *
   * @param ourTopics - Our extracted topics
   * @param competitorTopics - Union of all competitor topics
   * @param competitorTopicsByDomain - Topics grouped by competitor domain
   * @returns Identified topic gaps with priorities
   */
  public identifyGaps(
    ourTopics: Topic[],
    competitorTopics: Topic[],
    competitorTopicsByDomain: Map<string, Topic[]>
  ): TopicGap[] {
    const ourTopicNames = new Set(
      ourTopics.map(t => this.normalizeTopicName(t.name))
    );

    const gaps: TopicGap[] = [];

    for (const compTopic of competitorTopics) {
      const normalizedName = this.normalizeTopicName(compTopic.name);

      // Skip if we already cover this topic
      if (this.hasMatchingTopic(normalizedName, ourTopicNames)) {
        continue;
      }

      // Count how many competitors cover this topic
      const competitorDomains: string[] = [];
      let totalImportance = 0;
      let count = 0;

      for (const [domain, topics] of competitorTopicsByDomain.entries()) {
        const hasMatch = topics.some(
          t => this.normalizeTopicName(t.name) === normalizedName
        );

        if (hasMatch) {
          competitorDomains.push(domain);
          const matchingTopic = topics.find(
            t => this.normalizeTopicName(t.name) === normalizedName
          );
          if (matchingTopic) {
            totalImportance += matchingTopic.importance;
            count++;
          }
        }
      }

      const competitorsCovering = competitorDomains.length;
      const avgImportance = count > 0 ? totalImportance / count : 0;

      // Calculate impact score
      const impactScore = this.calculateImpactScore(
        competitorsCovering,
        avgImportance,
        competitorTopicsByDomain.size
      );

      // Determine priority
      const priority = this.determinePriority(competitorsCovering, avgImportance);

      // Estimate word count needed
      const estimatedWordCount = this.estimateWordCount(compTopic.category, avgImportance);

      gaps.push({
        topic: compTopic.name,
        competitorsCovering,
        competitorDomains,
        impactScore,
        priority,
        category: compTopic.category,
        avgCompetitorImportance: avgImportance,
        estimatedWordCount,
      });
    }

    // Sort by impact score descending
    return gaps.sort((a, b) => b.impactScore - a.impactScore);
  }

  /**
   * Calculate overall coverage score (0-100)
   *
   * @param ourTopics - Our topics
   * @param competitorTopics - Union of competitor topics
   * @returns Coverage score from 0 to 100
   */
  public calculateCoverageScore(ourTopics: Topic[], competitorTopics: Topic[]): number {
    if (competitorTopics.length === 0) return 100;

    const ourTopicNames = new Set(
      ourTopics.map(t => this.normalizeTopicName(t.name))
    );

    let coveredCount = 0;
    let totalImportance = 0;
    let coveredImportance = 0;

    for (const compTopic of competitorTopics) {
      const normalizedName = this.normalizeTopicName(compTopic.name);
      totalImportance += compTopic.importance;

      if (this.hasMatchingTopic(normalizedName, ourTopicNames)) {
        coveredCount++;
        coveredImportance += compTopic.importance;
      }
    }

    // Weighted score: 60% based on count coverage, 40% based on importance coverage
    const countScore = (coveredCount / competitorTopics.length) * 60;
    const importanceScore = totalImportance > 0 ? (coveredImportance / totalImportance) * 40 : 0;

    return Math.min(100, countScore + importanceScore);
  }

  /**
   * Generate actionable recommendations from gaps
   *
   * @param gaps - Identified topic gaps
   * @param missingKeywords - Missing semantic keywords
   * @returns Prioritized recommendations
   */
  public generateRecommendations(
    gaps: TopicGap[],
    missingKeywords: SemanticKeyword[]
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Generate recommendations from topic gaps
    for (const gap of gaps.filter(g => g.priority !== GapPriority.LOW)) {
      const type = this.determineRecommendationType(gap.category);
      const suggestedSection = this.suggestSection(gap.topic, gap.category);
      const relatedTopics = this.findRelatedTopics(gap.topic, gaps);

      recommendations.push({
        type,
        topic: gap.topic,
        suggestedSection,
        priority: gap.priority,
        rationale: this.generateRationale(gap),
        relatedTopics,
        competitorExamples: this.buildCompetitorExamples(gap),
        estimatedEffort: gap.estimatedWordCount,
      });
    }

    // Add keyword-based recommendations
    const topKeywords = missingKeywords
      .filter(k => k.competitorsUsing >= 2 && k.relevance >= 0.5)
      .slice(0, 5);

    for (const keyword of topKeywords) {
      recommendations.push({
        type: RecommendationType.EXPAND_EXISTING,
        topic: keyword.keyword,
        suggestedSection: 'Throughout content',
        priority: keyword.competitorsUsing >= 3 ? GapPriority.HIGH : GapPriority.MEDIUM,
        rationale: `${keyword.competitorsUsing} competitors use this semantic keyword with ${(keyword.relevance * 100).toFixed(0)}% relevance`,
        relatedTopics: [],
        competitorExamples: keyword.competitorDomains.map(domain => ({
          domain,
          url: '',
          description: `Uses "${keyword.keyword}" effectively`,
        })),
        estimatedEffort: 50,
      });
    }

    // Sort by priority
    const priorityOrder = {
      [GapPriority.CRITICAL]: 0,
      [GapPriority.HIGH]: 1,
      [GapPriority.MEDIUM]: 2,
      [GapPriority.LOW]: 3,
    };

    return recommendations.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private validateInputs(
    ourContent: string,
    competitorContents: Array<{ domain: string; content: string }>
  ): void {
    if (!ourContent || ourContent.trim().length === 0) {
      throw this.createError(
        SemanticAnalysisErrorCode.INVALID_CONTENT,
        'Our content is empty or invalid'
      );
    }

    if (!competitorContents || competitorContents.length === 0) {
      throw this.createError(
        SemanticAnalysisErrorCode.INSUFFICIENT_COMPETITORS,
        'At least one competitor content is required'
      );
    }

    for (const comp of competitorContents) {
      if (!comp.domain || !comp.content) {
        throw this.createError(
          SemanticAnalysisErrorCode.INVALID_CONTENT,
          `Invalid competitor data for domain: ${comp.domain || 'unknown'}`
        );
      }
    }
  }

  private tokenize(content: string): string[] {
    return content
      .toLowerCase()
      .replace(/[^\w\s'-]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 2 && !STOP_WORDS.has(token));
  }

  private extractNgrams(tokens: string[], maxN: number): Ngram[] {
    const ngrams: Ngram[] = [];
    const ngramCounts = new Map<string, number>();

    for (let n = 1; n <= maxN; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const phrase = tokens.slice(i, i + n).join(' ');
        ngramCounts.set(phrase, (ngramCounts.get(phrase) || 0) + 1);
      }
    }

    for (const [phrase, frequency] of ngramCounts.entries()) {
      if (frequency >= this.config.minTopicFrequency) {
        ngrams.push({
          phrase,
          n: phrase.split(' ').length,
          frequency,
        });
      }
    }

    return ngrams;
  }

  private calculateTfIdf(ngrams: Ngram[], documents: string[]): TfIdfResult[] {
    const results: TfIdfResult[] = [];
    const documentCount = Math.max(1, documents.length);

    // Find max frequency for normalization
    const maxFreq = Math.max(...ngrams.map(n => n.frequency), 1);

    for (const ngram of ngrams) {
      // Term Frequency (TF) - normalized to 0-1 range
      const tf = ngram.frequency / maxFreq;

      // Document Frequency (DF) - how many documents contain this term
      const df = documents.filter(doc =>
        doc.toLowerCase().includes(ngram.phrase)
      ).length;

      // Inverse Document Frequency (IDF) with smoothing
      const idf = Math.log((documentCount + this.config.tfidfSmoothing) / (Math.max(1, df) + this.config.tfidfSmoothing));

      // TF-IDF score - scale by ngram length bonus (longer phrases are more valuable)
      const ngramBonus = 1 + (ngram.n - 1) * 0.3;
      const score = tf * idf * ngramBonus;

      results.push({
        term: ngram.phrase,
        tf,
        idf,
        score,
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private createTopic(tfidf: TfIdfResult, content: string, tokens: string[]): Topic {
    const category = this.categorizeTopicCategory(tfidf.term, content);
    const context = this.extractContext(tfidf.term, content, 3);
    const sections = this.extractSections(tfidf.term, content);
    const subtopics = this.extractSubtopics(tfidf.term, tokens);

    // Normalize importance score to 0-1 range
    // TF is already 0-1, IDF typically ranges from 0-2, with ngram bonus 0-1.6
    // So max expected score is around 3.2, we'll normalize by dividing by 4
    const normalizedImportance = Math.min(1.0, tfidf.score / 4);

    return {
      name: tfidf.term,
      frequency: Math.round(tfidf.tf * 100), // Convert back to actual frequency for display
      importance: normalizedImportance,
      context,
      category,
      subtopics,
      sections,
    };
  }

  private categorizeTopicCategory(term: string, content: string): TopicCategory {
    const lowerTerm = term.toLowerCase();
    const lowerContent = content.toLowerCase();

    if (lowerTerm.includes('?') || lowerContent.includes(`what is ${lowerTerm}`) || lowerContent.includes(`how to ${lowerTerm}`)) {
      return TopicCategory.QUESTION;
    }

    if (lowerContent.includes(`use case`) && lowerContent.includes(lowerTerm)) {
      return TopicCategory.USE_CASE;
    }

    if (lowerContent.includes(`example`) && lowerContent.includes(lowerTerm)) {
      return TopicCategory.EXAMPLE;
    }

    if (/\d+%|\d+ percent|\d+ users|\d+ companies/.test(lowerTerm)) {
      return TopicCategory.STATISTIC;
    }

    if (lowerContent.includes(`says`) || lowerContent.includes(`according to`) || lowerContent.includes(`expert`)) {
      return TopicCategory.EXPERT_QUOTE;
    }

    if (lowerContent.includes(`tool`) || lowerContent.includes(`resource`) || lowerContent.includes(`platform`)) {
      return TopicCategory.TOOL_RESOURCE;
    }

    if (lowerContent.includes(`${lowerTerm} is`) || lowerContent.includes(`${lowerTerm} means`)) {
      return TopicCategory.DEFINITION;
    }

    if (lowerContent.includes(`vs`) || lowerContent.includes(`versus`) || lowerContent.includes(`compared to`)) {
      return TopicCategory.COMPARISON;
    }

    if (term.split(' ').length <= 2) {
      return TopicCategory.PRIMARY_KEYWORD;
    }

    return TopicCategory.RELATED_CONCEPT;
  }

  private extractContext(term: string, content: string, maxContexts: number): string[] {
    const contexts: string[] = [];
    const sentences = content.split(/[.!?]+/);

    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(term.toLowerCase())) {
        contexts.push(sentence.trim());
        if (contexts.length >= maxContexts) break;
      }
    }

    return contexts;
  }

  private extractSections(term: string, content: string): string[] {
    const sections: string[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,6}\s/.test(line)) {
        // Found a heading
        const heading = line.replace(/^#{1,6}\s/, '').trim();
        // Check if term appears in next 10 lines
        const nextLines = lines.slice(i + 1, i + 11).join('\n');
        if (nextLines.toLowerCase().includes(term.toLowerCase())) {
          sections.push(heading);
        }
      }
    }

    return sections;
  }

  private extractSubtopics(mainTopic: string, tokens: string[]): string[] {
    // Find terms that frequently appear near the main topic
    const mainTerms = mainTopic.toLowerCase().split(' ');
    const subtopicCandidates = new Map<string, number>();

    for (let i = 0; i < tokens.length; i++) {
      if (mainTerms.includes(tokens[i])) {
        // Look at surrounding context
        const start = Math.max(0, i - 3);
        const end = Math.min(tokens.length, i + 4);
        for (let j = start; j < end; j++) {
          if (j !== i && !mainTerms.includes(tokens[j])) {
            subtopicCandidates.set(tokens[j], (subtopicCandidates.get(tokens[j]) || 0) + 1);
          }
        }
      }
    }

    return Array.from(subtopicCandidates.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([term, _]) => term);
  }

  private unionCompetitorTopics(competitorTopicArrays: Topic[][]): Topic[] {
    const topicMap = new Map<string, Topic>();

    for (const topics of competitorTopicArrays) {
      for (const topic of topics) {
        const normalized = this.normalizeTopicName(topic.name);
        const existing = topicMap.get(normalized);

        if (!existing || topic.importance > existing.importance) {
          topicMap.set(normalized, topic);
        }
      }
    }

    return Array.from(topicMap.values());
  }

  private normalizeTopicName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private hasMatchingTopic(normalizedName: string, ourTopicNames: Set<string>): boolean {
    if (ourTopicNames.has(normalizedName)) {
      return true;
    }

    if (!this.config.fuzzyMatching) {
      return false;
    }

    // Check fuzzy matches
    for (const ourTopic of ourTopicNames) {
      if (this.calculateSimilarity(normalizedName, ourTopic) >= this.config.similarityThreshold) {
        return true;
      }
    }

    return false;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Jaccard similarity using word sets
    const set1 = new Set(str1.split(' '));
    const set2 = new Set(str2.split(' '));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  private calculateImpactScore(
    competitorsCovering: number,
    avgImportance: number,
    totalCompetitors: number
  ): number {
    const coverageRatio = competitorsCovering / totalCompetitors;
    return coverageRatio * 0.7 + avgImportance * 0.3;
  }

  private determinePriority(competitorsCovering: number, avgImportance: number): GapPriority {
    if (competitorsCovering >= this.config.criticalThreshold && avgImportance >= 0.5) {
      return GapPriority.CRITICAL;
    }

    if (competitorsCovering >= 2 && avgImportance >= 0.3) {
      return GapPriority.HIGH;
    }

    if (competitorsCovering >= 1 && avgImportance >= 0.2) {
      return GapPriority.MEDIUM;
    }

    return GapPriority.LOW;
  }

  private estimateWordCount(category: TopicCategory, importance: number): number {
    const baseWordCounts: Record<TopicCategory, number> = {
      [TopicCategory.PRIMARY_KEYWORD]: 300,
      [TopicCategory.RELATED_CONCEPT]: 200,
      [TopicCategory.QUESTION]: 150,
      [TopicCategory.USE_CASE]: 250,
      [TopicCategory.EXAMPLE]: 200,
      [TopicCategory.STATISTIC]: 100,
      [TopicCategory.EXPERT_QUOTE]: 100,
      [TopicCategory.TOOL_RESOURCE]: 150,
      [TopicCategory.DEFINITION]: 100,
      [TopicCategory.COMPARISON]: 300,
    };

    const base = baseWordCounts[category] || 150;
    return Math.round(base * (0.5 + importance * 0.5));
  }

  private findRelatedTopics(topic: string, gaps: TopicGap[]): string[] {
    const topicWords = new Set(topic.toLowerCase().split(' '));
    const related: Array<{ topic: string; score: number }> = [];

    for (const gap of gaps) {
      if (gap.topic === topic) continue;

      const gapWords = new Set(gap.topic.toLowerCase().split(' '));
      const similarity = this.calculateSimilarity(topic.toLowerCase(), gap.topic.toLowerCase());

      if (similarity >= 0.3) {
        related.push({ topic: gap.topic, score: similarity });
      }
    }

    return related
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(r => r.topic);
  }

  private determineRecommendationType(category: TopicCategory): RecommendationType {
    const typeMap: Partial<Record<TopicCategory, RecommendationType>> = {
      [TopicCategory.QUESTION]: RecommendationType.ADD_FAQ,
      [TopicCategory.USE_CASE]: RecommendationType.ADD_USE_CASE,
      [TopicCategory.EXAMPLE]: RecommendationType.ADD_EXAMPLE,
      [TopicCategory.DEFINITION]: RecommendationType.ADD_DEFINITION,
      [TopicCategory.COMPARISON]: RecommendationType.ADD_COMPARISON,
    };

    return typeMap[category] || RecommendationType.ADD_SECTION;
  }

  private suggestSection(topic: string, category: TopicCategory): string {
    const sectionMap: Partial<Record<TopicCategory, string>> = {
      [TopicCategory.QUESTION]: 'Frequently Asked Questions',
      [TopicCategory.USE_CASE]: 'Use Cases and Applications',
      [TopicCategory.EXAMPLE]: 'Examples and Case Studies',
      [TopicCategory.DEFINITION]: 'Key Concepts and Definitions',
      [TopicCategory.COMPARISON]: 'Comparisons and Alternatives',
      [TopicCategory.TOOL_RESOURCE]: 'Tools and Resources',
      [TopicCategory.STATISTIC]: 'Data and Statistics',
    };

    return sectionMap[category] || `Section: ${topic}`;
  }

  private generateRationale(gap: TopicGap): string {
    const parts: string[] = [];

    parts.push(`${gap.competitorsCovering} out of ${gap.competitorDomains.length} top competitors cover this topic`);

    if (gap.avgCompetitorImportance >= 0.5) {
      parts.push('with high importance');
    } else if (gap.avgCompetitorImportance >= 0.3) {
      parts.push('with moderate importance');
    }

    parts.push(`(impact score: ${(gap.impactScore * 100).toFixed(0)}%)`);

    return parts.join(' ');
  }

  private buildCompetitorExamples(gap: TopicGap): CompetitorExample[] {
    return gap.competitorDomains.slice(0, 3).map(domain => ({
      domain,
      url: '', // Would need actual URLs from analysis
      description: `Covers "${gap.topic}" in their content`,
    }));
  }

  private calculateTermFrequency(tokens: string[]): Map<string, number> {
    const frequency = new Map<string, number>();
    const total = tokens.length;

    for (const token of tokens) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }

    // Normalize to 0-1
    for (const [term, count] of frequency.entries()) {
      frequency.set(term, count / total);
    }

    return frequency;
  }

  private findMissingKeywords(
    ourKeywords: SemanticKeyword[],
    competitorKeywords: SemanticKeyword[],
    competitorDomains: string[]
  ): SemanticKeyword[] {
    const ourKeywordSet = new Set(ourKeywords.map(k => k.keyword.toLowerCase()));
    const missing: SemanticKeyword[] = [];

    for (const compKeyword of competitorKeywords) {
      if (!ourKeywordSet.has(compKeyword.keyword.toLowerCase())) {
        missing.push({
          ...compKeyword,
          competitorsUsing: 1, // Simplified - would count across multiple competitors
          competitorDomains: competitorDomains.slice(0, 1),
        });
      }
    }

    return missing.sort((a, b) => b.relevance - a.relevance).slice(0, 20);
  }

  private buildCompetitorComparisons(
    ourTopics: Topic[],
    competitorTopicsByDomain: Map<string, Topic[]>,
    competitorContents: Array<{ domain: string; content: string }>
  ): CompetitorComparison[] {
    const comparisons: CompetitorComparison[] = [];
    const ourTopicNames = new Set(ourTopics.map(t => this.normalizeTopicName(t.name)));

    for (const [domain, compTopics] of competitorTopicsByDomain.entries()) {
      const compTopicNames = new Set(compTopics.map(t => this.normalizeTopicName(t.name)));

      // Find unique topics
      const uniqueTopics = compTopics.filter(
        t => !ourTopicNames.has(this.normalizeTopicName(t.name))
      );

      // Find shared topics
      const sharedTopics = compTopics.filter(
        t => ourTopicNames.has(this.normalizeTopicName(t.name))
      );

      // Calculate overlap
      const overlapPercentage = (sharedTopics.length / Math.max(ourTopics.length, compTopics.length)) * 100;

      // Get content stats
      const content = competitorContents.find(c => c.domain === domain)?.content || '';
      const keywords = this.extractSemanticKeywords(content, compTopics);
      const contentStats = this.calculateContentStats(content, compTopics, keywords);

      // Calculate relative quality
      const relativeQuality = this.calculateRelativeQuality(ourTopics, compTopics);

      comparisons.push({
        domain,
        uniqueTopics,
        sharedTopics,
        overlapPercentage: Math.round(overlapPercentage * 10) / 10,
        contentStats,
        relativeQuality,
      });
    }

    return comparisons;
  }

  private findUniqueTopics(ourTopics: Topic[], competitorTopics: Topic[]): Topic[] {
    const compTopicNames = new Set(
      competitorTopics.map(t => this.normalizeTopicName(t.name))
    );

    return ourTopics.filter(
      t => !compTopicNames.has(this.normalizeTopicName(t.name))
    );
  }

  private buildCategoryBreakdown(
    ourTopics: Topic[],
    competitorTopicArrays: Topic[][]
  ): CategoryBreakdown[] {
    const breakdown: CategoryBreakdown[] = [];
    const categories = Object.values(TopicCategory);

    for (const category of categories) {
      const ourCount = ourTopics.filter(t => t.category === category).length;

      const competitorCounts = competitorTopicArrays.map(
        topics => topics.filter(t => t.category === category).length
      );

      const competitorAvgCount = competitorCounts.length > 0
        ? competitorCounts.reduce((sum, count) => sum + count, 0) / competitorCounts.length
        : 0;

      const gap = competitorAvgCount - ourCount;
      const coverageRatio = competitorAvgCount > 0 ? ourCount / competitorAvgCount : 1.0;

      breakdown.push({
        category,
        ourCount,
        competitorAvgCount: Math.round(competitorAvgCount * 10) / 10,
        gap: Math.round(gap * 10) / 10,
        coverageRatio: Math.round(coverageRatio * 100) / 100,
      });
    }

    return breakdown.sort((a, b) => b.gap - a.gap);
  }

  private calculateContentStats(
    content: string,
    topics: Topic[],
    keywords: SemanticKeyword[]
  ): ContentStats {
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    const sections = (content.match(/^#{1,6}\s/gm) || []).length;
    const questions = (content.match(/\?/g) || []).length;
    const examples = (content.match(/\bexample\b|\bfor instance\b|\be\.g\.\b/gi) || []).length;

    const avgTopicImportance = topics.length > 0
      ? topics.reduce((sum, t) => sum + t.importance, 0) / topics.length
      : 0;

    // Topic diversity using Shannon entropy
    const topicFrequencies = topics.map(t => t.frequency);
    const totalFrequency = topicFrequencies.reduce((sum, f) => sum + f, 0);
    let entropy = 0;

    if (totalFrequency > 0) {
      for (const freq of topicFrequencies) {
        const p = freq / totalFrequency;
        if (p > 0) {
          entropy -= p * Math.log2(p);
        }
      }
    }

    const maxEntropy = topics.length > 0 ? Math.log2(topics.length) : 1;
    const topicDiversity = maxEntropy > 0 ? entropy / maxEntropy : 0;

    return {
      wordCount,
      topicCount: topics.length,
      keywordCount: keywords.length,
      sectionCount: sections,
      exampleCount: examples,
      questionCount: questions,
      avgTopicImportance: Math.round(avgTopicImportance * 100) / 100,
      topicDiversity: Math.round(topicDiversity * 100) / 100,
    };
  }

  private calculateAggregateStats(
    competitorContents: Array<{ domain: string; content: string }>,
    competitorTopicArrays: Topic[][]
  ): ContentStats {
    const allStats = competitorContents.map((comp, i) => {
      const topics = competitorTopicArrays[i] || [];
      const keywords = this.extractSemanticKeywords(comp.content, topics);
      return this.calculateContentStats(comp.content, topics, keywords);
    });

    const count = allStats.length;

    return {
      wordCount: Math.round(allStats.reduce((sum, s) => sum + s.wordCount, 0) / count),
      topicCount: Math.round(allStats.reduce((sum, s) => sum + s.topicCount, 0) / count),
      keywordCount: Math.round(allStats.reduce((sum, s) => sum + s.keywordCount, 0) / count),
      sectionCount: Math.round(allStats.reduce((sum, s) => sum + s.sectionCount, 0) / count),
      exampleCount: Math.round(allStats.reduce((sum, s) => sum + s.exampleCount, 0) / count),
      questionCount: Math.round(allStats.reduce((sum, s) => sum + s.questionCount, 0) / count),
      avgTopicImportance: Math.round((allStats.reduce((sum, s) => sum + s.avgTopicImportance, 0) / count) * 100) / 100,
      topicDiversity: Math.round((allStats.reduce((sum, s) => sum + s.topicDiversity, 0) / count) * 100) / 100,
    };
  }

  private calculateRelativeQuality(ourTopics: Topic[], compTopics: Topic[]): number {
    // Compare based on topic count, importance, and diversity
    const ourAvgImportance = ourTopics.length > 0
      ? ourTopics.reduce((sum, t) => sum + t.importance, 0) / ourTopics.length
      : 0;

    const compAvgImportance = compTopics.length > 0
      ? compTopics.reduce((sum, t) => sum + t.importance, 0) / compTopics.length
      : 0;

    const countRatio = ourTopics.length / Math.max(1, compTopics.length);
    const importanceRatio = ourAvgImportance / Math.max(0.01, compAvgImportance);

    const quality = (countRatio * 0.5 + importanceRatio * 0.5) - 1.0;

    return Math.max(-1.0, Math.min(1.0, quality));
  }

  private createError(code: SemanticAnalysisErrorCode, message: string): Error {
    const error = new Error(message) as any;
    error.code = code;
    return error;
  }
}
