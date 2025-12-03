/**
 * CTR Optimization Engine
 *
 * Optimizes title tags and meta descriptions for maximum click-through rate.
 * Uses psychological triggers, power words, and proven SERP patterns.
 */

import type {
  CTROptimizationConfig,
  CTRScore,
  CTRScoreFactors,
  MetaOptimizationResult,
  PowerWordsDatabase,
  PsychologicalTrigger,
  TitleOptimizationResult,
  TitleVariation,
  TriggerAnalysis,
} from '../types/ctr-optimization';

export class CTROptimizationEngine {
  private powerWords: PowerWordsDatabase;
  private currentYear: string;
  private titleTemplates: string[];
  private callsToAction: string[];

  constructor() {
    this.currentYear = new Date().getFullYear().toString();
    this.powerWords = {
      curiosity: ['Secret', 'Hidden', 'Revealed', 'Surprising', 'Unknown', 'Discover', 'Uncover'],
      urgency: ['Now', 'Today', 'Limited', 'Fast', 'Quick', 'Instant', 'Immediately'],
      benefit: ['Free', 'Save', 'Boost', 'Increase', 'Improve', 'Easy', 'Simple', 'Better'],
      exclusivity: ['Exclusive', 'Premium', 'Elite', 'VIP', 'Members-Only', 'Limited'],
      trust: ['Proven', 'Guaranteed', 'Certified', 'Official', 'Trusted', 'Verified'],
      emotion: ['Amazing', 'Incredible', 'Stunning', 'Powerful', 'Ultimate', 'Perfect'],
      numbers: ['7', '10', '21', '101', '365', '5', '12', '50'],
    };

    this.titleTemplates = [
      '{Number} {Adjective} {Keyword} in {Year}',
      '{Adjective} Guide to {Keyword} [{Year}]',
      'How to {Keyword}: {Benefit} | {Brand}',
      '{Keyword}: {Number} {PowerWord} Tips',
      'The {Adjective} {Keyword} Guide ({Year})',
      '{Keyword} - {Benefit} in {Number} Steps',
      '{Number} Proven {Keyword} Strategies That Work',
      '{Adjective} {Keyword}: Complete Guide [{Year}]',
    ];

    this.callsToAction = [
      'Learn more',
      'Get started',
      'Discover how',
      'Find out',
      'See how',
      'Start now',
      'Try it free',
      'Get instant access',
    ];
  }

  /**
   * Optimize a title tag for CTR
   */
  public optimizeTitle(
    title: string,
    keyword: string,
    config: CTROptimizationConfig = {}
  ): TitleOptimizationResult {
    const original = title;
    let optimized = title;
    const changesMade: string[] = [];

    // Ensure keyword is present
    if (!optimized.toLowerCase().includes(keyword.toLowerCase())) {
      optimized = `${keyword} - ${optimized}`;
      changesMade.push('Added target keyword');
    }

    // Add power word if missing
    if (!this.hasPowerWord(optimized)) {
      optimized = this.addPowerWords(optimized);
      changesMade.push('Added power word');
    }

    // Add number if missing
    if (!this.hasNumber(optimized)) {
      optimized = this.addNumbers(optimized);
      changesMade.push('Added number for specificity');
    }

    // Add year if configured and missing
    if (config.includeYear !== false && !optimized.includes(this.currentYear)) {
      optimized = this.addCurrentYear(optimized);
      changesMade.push(`Added year (${this.currentYear})`);
    }

    // Add brackets for visual distinction if not present
    if (!this.hasBrackets(optimized)) {
      optimized = this.addBrackets(optimized);
      changesMade.push('Added brackets for visual distinction');
    }

    // Trim to optimal length
    const targetMax = config.targetLength?.title?.max || 60;
    if (optimized.length > targetMax) {
      optimized = this.trimToLength(optimized, targetMax);
      changesMade.push(`Trimmed to ${targetMax} characters`);
    }

    // Generate variations
    const variations = this.generateVariations(
      keyword,
      config.maxVariations || 5,
      config
    );

    // Score improvement
    const originalScore = this.scoreCTRPotential(original, '').score;
    const optimizedScore = this.scoreCTRPotential(optimized, '').score;

    // Recommendations
    const recommendations = this.generateTitleRecommendations(optimized, config);

    return {
      original,
      optimized,
      variations,
      score_improvement: optimizedScore - originalScore,
      changes_made: changesMade,
      recommendations,
    };
  }

  /**
   * Optimize a meta description for CTR
   */
  public optimizeMeta(
    meta: string,
    keyword: string,
    config: CTROptimizationConfig = {}
  ): MetaOptimizationResult {
    const original = meta;
    let optimized = meta;
    const changesMade: string[] = [];
    let ctaAdded = false;
    let emotionalTrigger: string | null = null;

    // Ensure keyword is present
    if (!optimized.toLowerCase().includes(keyword.toLowerCase())) {
      optimized = `${keyword}: ${optimized}`;
      changesMade.push('Added target keyword');
    }

    // Add emotional trigger if missing
    if (!this.hasEmotionalTrigger(optimized)) {
      const result = this.addEmotionalTrigger(optimized);
      optimized = result.text;
      emotionalTrigger = result.trigger;
      changesMade.push(`Added emotional trigger: ${emotionalTrigger}`);
    }

    // Add call to action if missing
    if (!this.hasCTA(optimized)) {
      const cta = this.selectBestCTA(config);
      optimized = `${optimized.trim()} ${cta}.`;
      ctaAdded = true;
      changesMade.push(`Added CTA: "${cta}"`);
    }

    // Trim to optimal length
    const targetMax = config.targetLength?.meta?.max || 160;
    if (optimized.length > targetMax) {
      optimized = this.trimToLength(optimized, targetMax);
      changesMade.push(`Trimmed to ${targetMax} characters`);
    }

    const score = this.scoreCTRPotential('', optimized).score;
    const recommendations = this.generateMetaRecommendations(optimized, config);

    return {
      original,
      optimized,
      score,
      changes_made: changesMade,
      recommendations,
      cta_added: ctaAdded,
      emotional_trigger: emotionalTrigger,
    };
  }

  /**
   * Score the CTR potential of title and meta combination
   */
  public scoreCTRPotential(title: string, meta: string): CTRScore {
    const factors: CTRScoreFactors = {
      lengthOptimal: this.isLengthOptimal(title, meta),
      keywordPresent: true, // Assumed if calling this method
      powerWordPresent: this.hasPowerWord(title) || this.hasPowerWord(meta),
      numberPresent: this.hasNumber(title),
      yearPresent: title.includes(this.currentYear),
      bracketsPresent: this.hasBrackets(title),
      ctaPresent: this.hasCTA(meta),
      emotionPresent: this.hasEmotionalTrigger(title) || this.hasEmotionalTrigger(meta),
      uniqueness: 85, // Default; requires competitor analysis
    };

    // Calculate score
    let score = 0;
    score += factors.lengthOptimal ? 15 : 0;
    score += factors.keywordPresent ? 15 : 0;
    score += factors.powerWordPresent ? 12 : 0;
    score += factors.numberPresent ? 10 : 0;
    score += factors.yearPresent ? 8 : 0;
    score += factors.bracketsPresent ? 8 : 0;
    score += factors.ctaPresent ? 10 : 0;
    score += factors.emotionPresent ? 12 : 0;
    score += Math.round(factors.uniqueness * 0.1);

    // Generate recommendations
    const recommendations: string[] = [];
    if (!factors.lengthOptimal) {
      recommendations.push('Adjust title to 50-60 chars, meta to 150-160 chars');
    }
    if (!factors.powerWordPresent) {
      recommendations.push('Add power words to increase emotional impact');
    }
    if (!factors.numberPresent) {
      recommendations.push('Include specific numbers for credibility');
    }
    if (!factors.yearPresent) {
      recommendations.push(`Add current year (${this.currentYear}) for freshness`);
    }
    if (!factors.ctaPresent) {
      recommendations.push('Add clear call-to-action in meta description');
    }

    const estimatedImpact: 'low' | 'medium' | 'high' =
      score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';

    return {
      score,
      factors,
      recommendations,
      estimatedImpact,
    };
  }

  /**
   * Generate multiple title variations
   */
  public generateVariations(
    keyword: string,
    count: number,
    config: CTROptimizationConfig = {}
  ): TitleVariation[] {
    const variations: TitleVariation[] = [];
    const adjectives = [...this.powerWords.emotion, ...this.powerWords.trust];
    const benefits = this.powerWords.benefit;
    const numbers = this.powerWords.numbers;

    for (let i = 0; i < count && i < this.titleTemplates.length; i++) {
      const template = this.titleTemplates[i];
      let title = template
        .replace('{Keyword}', keyword)
        .replace('{Year}', this.currentYear)
        .replace('{Number}', numbers[i % numbers.length])
        .replace('{Adjective}', adjectives[i % adjectives.length])
        .replace('{PowerWord}', this.powerWords.curiosity[i % this.powerWords.curiosity.length])
        .replace('{Benefit}', benefits[i % benefits.length])
        .replace('{Brand}', config.brandName || 'Guide');

      // Trim if needed
      const maxLength = config.targetLength?.title?.max || 60;
      if (title.length > maxLength) {
        title = this.trimToLength(title, maxLength);
      }

      const analysis = this.analyzePsychologicalTriggers(title);
      const score = this.scoreCTRPotential(title, '').score;

      variations.push({
        title,
        score,
        triggers_used: this.extractTriggersUsed(analysis),
        length: title.length,
        template,
      });
    }

    // Sort by score descending
    variations.sort((a, b) => b.score - a.score);

    return variations;
  }

  /**
   * Analyze psychological triggers in text
   */
  public analyzePsychologicalTriggers(text: string): TriggerAnalysis {
    const lowerText = text.toLowerCase();
    const scores: Record<PsychologicalTrigger, number> = {
      curiosity: 0,
      urgency: 0,
      benefit: 0,
      exclusivity: 0,
      trust: 0,
      emotion: 0,
      social_proof: 0,
    };

    // Check for curiosity triggers
    scores.curiosity = this.countMatches(lowerText, this.powerWords.curiosity);

    // Check for urgency triggers
    scores.urgency = this.countMatches(lowerText, this.powerWords.urgency);

    // Check for benefit triggers
    scores.benefit = this.countMatches(lowerText, this.powerWords.benefit);

    // Check for exclusivity triggers
    scores.exclusivity = this.countMatches(lowerText, this.powerWords.exclusivity);

    // Check for trust triggers
    scores.trust = this.countMatches(lowerText, this.powerWords.trust);

    // Check for emotion triggers
    scores.emotion = this.countMatches(lowerText, this.powerWords.emotion);

    // Check for social proof (numbers, testimonials)
    scores.social_proof = this.hasNumber(text) ? 50 : 0;
    if (/(review|rating|customer|user|testimonial)/i.test(text)) {
      scores.social_proof += 50;
    }

    // Find dominant trigger
    let dominantTrigger: PsychologicalTrigger | null = null;
    let maxScore = 0;
    for (const [trigger, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        dominantTrigger = trigger as PsychologicalTrigger;
      }
    }

    const triggerCount = Object.values(scores).filter(s => s > 0).length;

    return {
      curiosity: scores.curiosity,
      urgency: scores.urgency,
      benefit: scores.benefit,
      emotion: scores.emotion,
      social_proof: scores.social_proof,
      dominant_trigger: maxScore > 0 ? dominantTrigger : null,
      trigger_count: triggerCount,
    };
  }

  /**
   * Add power words to text
   */
  public addPowerWords(title: string): string {
    // Select a random power word
    const category = ['curiosity', 'emotion', 'trust'][Math.floor(Math.random() * 3)] as keyof PowerWordsDatabase;
    const words = this.powerWords[category];
    const powerWord = words[Math.floor(Math.random() * words.length)];

    // Try to insert naturally
    if (title.includes(':')) {
      return title.replace(':', `: ${powerWord}`);
    }
    return `${powerWord} ${title}`;
  }

  /**
   * Add numbers to text
   */
  public addNumbers(title: string): string {
    const numbers = this.powerWords.numbers;
    const number = numbers[Math.floor(Math.random() * numbers.length)];

    // Try to insert naturally
    if (title.includes('Guide') || title.includes('Tips') || title.includes('Ways')) {
      return title.replace(/(Guide|Tips|Ways)/i, `${number} $1`);
    }
    return `${number} ${title}`;
  }

  /**
   * Add brackets to text for visual distinction
   */
  public addBrackets(title: string): string {
    // Add year in brackets at the end if not too long
    if (title.length + 8 <= 60) {
      return `${title} [${this.currentYear}]`;
    }
    return title;
  }

  /**
   * Add current year to text
   */
  public addCurrentYear(title: string): string {
    if (title.length + 7 <= 60) {
      return `${title} (${this.currentYear})`;
    }
    return title;
  }

  /**
   * Add emotional trigger to meta description
   */
  public addEmotionalTrigger(meta: string): { text: string; trigger: string } {
    const emotionWords = this.powerWords.emotion;
    const trigger = emotionWords[Math.floor(Math.random() * emotionWords.length)];

    // Insert at the beginning or after first sentence
    if (meta.includes('.')) {
      const firstSentence = meta.split('.')[0];
      const rest = meta.substring(firstSentence.length);
      return {
        text: `${firstSentence}. ${trigger} insights${rest}`,
        trigger,
      };
    }

    return {
      text: `${trigger} insights: ${meta}`,
      trigger,
    };
  }

  // Helper methods

  private hasPowerWord(text: string): boolean {
    const lowerText = text.toLowerCase();
    for (const category of Object.values(this.powerWords)) {
      if (category.some((word: string) => lowerText.includes(word.toLowerCase()))) {
        return true;
      }
    }
    return false;
  }

  private hasNumber(text: string): boolean {
    return /\d+/.test(text);
  }

  private hasBrackets(text: string): boolean {
    return /[\[\(\{]/.test(text);
  }

  private hasCTA(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.callsToAction.some(cta => lowerText.includes(cta.toLowerCase()));
  }

  private hasEmotionalTrigger(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.powerWords.emotion.some((word: string) => lowerText.includes(word.toLowerCase()));
  }

  private isLengthOptimal(title: string, meta: string): boolean {
    const titleOptimal = title.length >= 50 && title.length <= 60;
    const metaOptimal = meta.length >= 150 && meta.length <= 160;
    return title ? titleOptimal : metaOptimal;
  }

  private trimToLength(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Try to trim at word boundary
    let trimmed = text.substring(0, maxLength - 3);
    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      trimmed = trimmed.substring(0, lastSpace);
    }

    return trimmed + '...';
  }

  private countMatches(text: string, words: string[]): number {
    let count = 0;
    for (const word of words) {
      if (text.includes(word.toLowerCase())) {
        count += 50;
      }
    }
    return Math.min(count, 100);
  }

  private extractTriggersUsed(analysis: TriggerAnalysis): PsychologicalTrigger[] {
    const triggers: PsychologicalTrigger[] = [];
    if (analysis.curiosity > 0) triggers.push('curiosity');
    if (analysis.urgency > 0) triggers.push('urgency');
    if (analysis.benefit > 0) triggers.push('benefit');
    if (analysis.emotion > 0) triggers.push('emotion');
    if (analysis.social_proof > 0) triggers.push('social_proof');
    return triggers;
  }

  private selectBestCTA(config: CTROptimizationConfig): string {
    // Prioritize based on config or use default
    if (config.priorityTriggers?.includes('urgency')) {
      return 'Start now';
    }
    if (config.priorityTriggers?.includes('benefit')) {
      return 'Learn more';
    }
    return this.callsToAction[0];
  }

  private generateTitleRecommendations(
    title: string,
    config: CTROptimizationConfig
  ): string[] {
    const recommendations: string[] = [];

    if (title.length < 50) {
      recommendations.push('Title is too short, consider expanding to 50-60 characters');
    }

    if (!this.hasNumber(title)) {
      recommendations.push('Add specific numbers for increased credibility');
    }

    if (config.competitorTitles && config.competitorTitles.length > 0) {
      recommendations.push('Review competitor titles for differentiation opportunities');
    }

    return recommendations;
  }

  private generateMetaRecommendations(
    meta: string,
    config: CTROptimizationConfig
  ): string[] {
    const recommendations: string[] = [];

    if (meta.length < 150) {
      recommendations.push('Meta description is too short, expand to 150-160 characters');
    }

    if (!this.hasCTA(meta)) {
      recommendations.push('Add a clear call-to-action to drive clicks');
    }

    if (!this.hasEmotionalTrigger(meta)) {
      recommendations.push('Include emotional triggers to connect with searchers');
    }

    return recommendations;
  }
}
