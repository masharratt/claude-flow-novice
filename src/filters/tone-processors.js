/**
 * Tone Processing System
 * Removes self-congratulatory language and customizes message tone
 */

class ToneProcessors {
  constructor(config = {}) {
    this.config = {
      tonePresets: config.tonePresets || {
        professional: { formality: 0.8, enthusiasm: 0.3, technical: 0.7 },
        casual: { formality: 0.3, enthusiasm: 0.6, technical: 0.4 },
        technical: { formality: 0.9, enthusiasm: 0.2, technical: 0.9 },
        concise: { formality: 0.6, enthusiasm: 0.1, technical: 0.8 },
        friendly: { formality: 0.4, enthusiasm: 0.8, technical: 0.5 }
      },
      removeSelfCongratulatory: config.removeSelfCongratulatory !== false,
      simplifyJargon: config.simplifyJargon || false,
      focusOnActionable: config.focusOnActionable !== false,
      customPatterns: config.customPatterns || {}
    };

    this.processingHistory = [];
  }

  /**
   * Process message through tone customization
   */
  processMessage(message, tonePreset = 'professional', userPreferences = {}) {
    const originalMessage = message;
    let processedMessage = message;

    const tone = { ...this.config.tonePresets[tonePreset], ...userPreferences };

    // Apply tone processing pipeline
    if (this.config.removeSelfCongratulatory) {
      processedMessage = this.removeSelfCongratulatory(processedMessage);
    }

    if (this.config.simplifyJargon || tone.technical < 0.5) {
      processedMessage = this.simplifyTechnicalJargon(processedMessage, tone.technical);
    }

    if (this.config.focusOnActionable) {
      processedMessage = this.focusOnActionableContent(processedMessage);
    }

    processedMessage = this.adjustFormality(processedMessage, tone.formality);
    processedMessage = this.adjustEnthusiasm(processedMessage, tone.enthusiasm);

    // Apply custom patterns
    processedMessage = this.applyCustomPatterns(processedMessage);

    // Log processing for analysis
    this.logProcessing(originalMessage, processedMessage, tonePreset, tone);

    return {
      original: originalMessage,
      processed: processedMessage,
      changes: this.detectChanges(originalMessage, processedMessage),
      tone: tone,
      metrics: this.calculateMetrics(processedMessage)
    };
  }

  /**
   * Remove self-congratulatory language
   */
  removeSelfCongratulatory(text) {
    const patterns = [
      // Excessive praise patterns
      { pattern: /\b(successfully|perfectly|flawlessly|brilliantly|masterfully)\s+(implemented|executed|completed|delivered|achieved)/gi, replacement: 'completed' },
      { pattern: /\b(amazing|incredible|outstanding|exceptional|remarkable)\s+(results|performance|implementation|solution)/gi, replacement: 'good results' },
      { pattern: /\b(effortlessly|seamlessly|smoothly)\s+(integrated|deployed|implemented)/gi, replacement: 'integrated' },

      // Self-praise phrases
      { pattern: /we have successfully/gi, replacement: 'we have' },
      { pattern: /i have perfectly/gi, replacement: 'I have' },
      { pattern: /this (perfectly|completely) solves/gi, replacement: 'this addresses' },
      { pattern: /our (excellent|outstanding|superior) approach/gi, replacement: 'our approach' },

      // Overly confident assertions
      { pattern: /this will definitely/gi, replacement: 'this should' },
      { pattern: /guaranteed to work/gi, replacement: 'expected to work' },
      { pattern: /absolutely (perfect|flawless)/gi, replacement: 'suitable' },

      // Excessive enthusiasm
      { pattern: /!{2,}/g, replacement: '!' },
      { pattern: /amazing!/gi, replacement: 'good.' },
      { pattern: /fantastic!/gi, replacement: 'good.' },
      { pattern: /incredible!/gi, replacement: 'notable.' }
    ];

    let processedText = text;
    const appliedChanges = [];

    patterns.forEach(({ pattern, replacement }) => {
      const matches = processedText.match(pattern);
      if (matches) {
        processedText = processedText.replace(pattern, replacement);
        appliedChanges.push({ pattern: pattern.source, matches: matches.length });
      }
    });

    return processedText;
  }

  /**
   * Simplify overly technical jargon
   */
  simplifyTechnicalJargon(text, technicalLevel = 0.5) {
    if (technicalLevel > 0.7) return text; // Keep technical if requested

    const jargonMap = {
      // Architecture terms
      'microservices architecture': 'modular system',
      'distributed systems': 'connected systems',
      'event-driven architecture': 'responsive system',
      'containerization': 'packaging',
      'orchestration': 'coordination',

      // Development terms
      'refactoring': 'code improvement',
      'optimization': 'improvement',
      'paradigm': 'approach',
      'methodology': 'method',
      'implementation': 'build',

      // Technical processes
      'asynchronous processing': 'background processing',
      'load balancing': 'traffic distribution',
      'horizontal scaling': 'adding servers',
      'vertical scaling': 'upgrading hardware',

      // Buzzwords
      'leverage': 'use',
      'utilize': 'use',
      'facilitate': 'enable',
      'optimize': 'improve',
      'streamline': 'simplify'
    };

    let simplifiedText = text;

    Object.entries(jargonMap).forEach(([jargon, simple]) => {
      const regex = new RegExp(`\\b${jargon}\\b`, 'gi');
      simplifiedText = simplifiedText.replace(regex, simple);
    });

    return simplifiedText;
  }

  /**
   * Focus on actionable content
   */
  focusOnActionableContent(text) {
    // Remove or minimize non-actionable fluff
    const fluffPatterns = [
      /\b(obviously|clearly|of course|naturally|as you can see),?\s*/gi,
      /\b(it should be noted that|it's worth mentioning that|please note that)\s*/gi,
      /\b(furthermore|moreover|additionally|in addition),?\s*/gi,
      /\bin conclusion,?\s*/gi,
      /\bto summarize,?\s*/gi
    ];

    let actionableText = text;

    fluffPatterns.forEach(pattern => {
      actionableText = actionableText.replace(pattern, '');
    });

    // Enhance action-oriented language
    const actionEnhancements = [
      { pattern: /you should probably/gi, replacement: 'you should' },
      { pattern: /you might want to consider/gi, replacement: 'consider' },
      { pattern: /it would be good to/gi, replacement: 'to' },
      { pattern: /you could potentially/gi, replacement: 'you can' }
    ];

    actionEnhancements.forEach(({ pattern, replacement }) => {
      actionableText = actionableText.replace(pattern, replacement);
    });

    return actionableText;
  }

  /**
   * Adjust formality level
   */
  adjustFormality(text, formalityLevel = 0.5) {
    if (formalityLevel > 0.7) {
      // Increase formality
      const formalizations = [
        { pattern: /\bcan't\b/gi, replacement: 'cannot' },
        { pattern: /\bwon't\b/gi, replacement: 'will not' },
        { pattern: /\bdon't\b/gi, replacement: 'do not' },
        { pattern: /\bisn't\b/gi, replacement: 'is not' },
        { pattern: /\blet's\b/gi, replacement: 'let us' },
        { pattern: /\bthat's\b/gi, replacement: 'that is' },
        { pattern: /\bit's\b/gi, replacement: 'it is' }
      ];

      return formalizations.reduce((text, { pattern, replacement }) =>
        text.replace(pattern, replacement), text);
    } else if (formalityLevel < 0.3) {
      // Decrease formality
      const casualizations = [
        { pattern: /\bcannot\b/gi, replacement: 'can\'t' },
        { pattern: /\bwill not\b/gi, replacement: 'won\'t' },
        { pattern: /\bdo not\b/gi, replacement: 'don\'t' },
        { pattern: /\bis not\b/gi, replacement: 'isn\'t' },
        { pattern: /\blet us\b/gi, replacement: 'let\'s' }
      ];

      return casualizations.reduce((text, { pattern, replacement }) =>
        text.replace(pattern, replacement), text);
    }

    return text;
  }

  /**
   * Adjust enthusiasm level
   */
  adjustEnthusiasm(text, enthusiasmLevel = 0.5) {
    if (enthusiasmLevel < 0.3) {
      // Reduce enthusiasm
      return text
        .replace(/!+/g, '.')
        .replace(/\b(exciting|thrilling|amazing)\b/gi, 'notable')
        .replace(/\b(love|adore)\b/gi, 'prefer')
        .replace(/\bawesome\b/gi, 'good');
    } else if (enthusiasmLevel > 0.7) {
      // Increase enthusiasm (but not self-congratulatory)
      return text
        .replace(/\bgood\b/gi, 'great')
        .replace(/\bworks\b/gi, 'works well')
        .replace(/\bhelps\b/gi, 'really helps');
    }

    return text;
  }

  /**
   * Apply custom user-defined patterns
   */
  applyCustomPatterns(text) {
    let processedText = text;

    Object.entries(this.config.customPatterns).forEach(([pattern, replacement]) => {
      try {
        const regex = new RegExp(pattern, 'gi');
        processedText = processedText.replace(regex, replacement);
      } catch (e) {
        console.warn(`Invalid custom pattern: ${pattern}`);
      }
    });

    return processedText;
  }

  /**
   * Batch process multiple messages
   */
  batchProcess(messages, tonePreset = 'professional', userPreferences = {}) {
    return messages.map(message =>
      this.processMessage(message, tonePreset, userPreferences)
    );
  }

  /**
   * Get tone suggestions for content type
   */
  suggestTone(contentType) {
    const suggestions = {
      'api-documentation': 'technical',
      'user-guide': 'friendly',
      'error-message': 'concise',
      'status-update': 'professional',
      'tutorial': 'casual',
      'technical-spec': 'technical',
      'email': 'professional',
      'chat-message': 'casual',
      'presentation': 'professional',
      'code-comment': 'concise'
    };

    return suggestions[contentType] || 'professional';
  }

  /**
   * Analyze text characteristics
   */
  analyzeText(text) {
    return {
      length: text.length,
      sentences: text.split(/[.!?]+/).length - 1,
      avgSentenceLength: text.length / Math.max(1, text.split(/[.!?]+/).length - 1),
      exclamationCount: (text.match(/!/g) || []).length,
      questionCount: (text.match(/\?/g) || []).length,
      jargonDensity: this.calculateJargonDensity(text),
      formalityScore: this.calculateFormalityScore(text),
      enthusiasmScore: this.calculateEnthusiasmScore(text),
      actionabilityScore: this.calculateActionabilityScore(text)
    };
  }

  // Private helper methods

  detectChanges(original, processed) {
    const changes = [];

    if (original.length !== processed.length) {
      changes.push(`Length changed from ${original.length} to ${processed.length} characters`);
    }

    const originalExclamations = (original.match(/!/g) || []).length;
    const processedExclamations = (processed.match(/!/g) || []).length;
    if (originalExclamations !== processedExclamations) {
      changes.push(`Exclamation marks: ${originalExclamations} → ${processedExclamations}`);
    }

    return changes;
  }

  calculateJargonDensity(text) {
    const jargonTerms = [
      'microservices', 'containerization', 'orchestration', 'kubernetes',
      'distributed', 'asynchronous', 'paradigm', 'methodology',
      'implementation', 'optimization', 'refactoring', 'leverage'
    ];

    const words = text.toLowerCase().split(/\s+/);
    const jargonCount = words.filter(word =>
      jargonTerms.some(term => word.includes(term))
    ).length;

    return jargonCount / Math.max(1, words.length);
  }

  calculateFormalityScore(text) {
    const formalIndicators = [
      /\bcannot\b/gi, /\bwill not\b/gi, /\bdo not\b/gi,
      /\btherefore\b/gi, /\bconsequently\b/gi, /\bfurthermore\b/gi
    ];

    const informalIndicators = [
      /\bcan't\b/gi, /\bwon't\b/gi, /\bdon't\b/gi,
      /\bokay\b/gi, /\byeah\b/gi, /\bgonna\b/gi
    ];

    const formalCount = formalIndicators.reduce((count, pattern) =>
      count + (text.match(pattern) || []).length, 0);
    const informalCount = informalIndicators.reduce((count, pattern) =>
      count + (text.match(pattern) || []).length, 0);

    return formalCount / Math.max(1, formalCount + informalCount);
  }

  calculateEnthusiasmScore(text) {
    const enthusiasmIndicators = [
      /!/g, /\b(amazing|awesome|incredible|fantastic|great|love|excited)\b/gi,
      /\b(wonderful|brilliant|excellent|outstanding)\b/gi
    ];

    const totalIndicators = enthusiasmIndicators.reduce((count, pattern) =>
      count + (text.match(pattern) || []).length, 0);

    const words = text.split(/\s+/).length;
    return totalIndicators / Math.max(1, words);
  }

  calculateActionabilityScore(text) {
    const actionWords = [
      /\b(should|must|need to|have to|will|can|let's|do|create|build|implement|fix|update|add|remove|change)\b/gi
    ];

    const actionCount = actionWords.reduce((count, pattern) =>
      count + (text.match(pattern) || []).length, 0);

    const sentences = text.split(/[.!?]+/).length - 1;
    return actionCount / Math.max(1, sentences);
  }

  calculateMetrics(text) {
    return {
      readabilityScore: this.calculateReadabilityScore(text),
      clarityScore: this.calculateClarityScore(text),
      concisenessScore: this.calculateConcisenessScore(text)
    };
  }

  calculateReadabilityScore(text) {
    // Simple readability based on sentence and word length
    const sentences = text.split(/[.!?]+/).length - 1;
    const words = text.split(/\s+/).length;
    const avgWordsPerSentence = words / Math.max(1, sentences);

    // Lower scores for very long or very short sentences
    return Math.max(0, Math.min(1, 1 - Math.abs(avgWordsPerSentence - 15) / 15));
  }

  calculateClarityScore(text) {
    // Based on jargon density and sentence complexity
    const jargonDensity = this.calculateJargonDensity(text);
    return Math.max(0, 1 - jargonDensity * 2);
  }

  calculateConcisenessScore(text) {
    // Based on word efficiency and fluff words
    const fluffWords = ['obviously', 'clearly', 'basically', 'actually', 'really', 'quite', 'very', 'extremely'];
    const words = text.toLowerCase().split(/\s+/);
    const fluffCount = words.filter(word => fluffWords.includes(word)).length;

    return Math.max(0, 1 - (fluffCount / Math.max(1, words.length)) * 5);
  }

  logProcessing(original, processed, preset, tone) {
    this.processingHistory.push({
      timestamp: new Date().toISOString(),
      originalLength: original.length,
      processedLength: processed.length,
      preset,
      tone,
      changesMade: original !== processed
    });

    // Keep history manageable
    if (this.processingHistory.length > 500) {
      this.processingHistory = this.processingHistory.slice(-250);
    }
  }

  /**
   * Get processing statistics
   */
  getProcessingStats() {
    const recent = this.processingHistory.slice(-50);

    return {
      totalProcessed: this.processingHistory.length,
      avgLengthReduction: recent.reduce((sum, entry) =>
        sum + (entry.originalLength - entry.processedLength), 0) / Math.max(1, recent.length),
      changesRate: recent.filter(entry => entry.changesMade).length / Math.max(1, recent.length),
      popularPresets: this.getPopularPresets(),
      recentProcessing: recent.slice(-10)
    };
  }

  getPopularPresets() {
    const presetCounts = {};
    this.processingHistory.forEach(entry => {
      presetCounts[entry.preset] = (presetCounts[entry.preset] || 0) + 1;
    });

    return Object.entries(presetCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([preset, count]) => ({ preset, count }));
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Export configuration
   */
  exportConfig() {
    return {
      ...this.config,
      stats: this.getProcessingStats()
    };
  }

  /**
   * Reset processing history
   */
  reset() {
    this.processingHistory = [];
  }
}

export default ToneProcessors;
export { ToneProcessors };