class PromptEvaluator {
  constructor() {
    this.weights = {
      completeness: 0.3,
      accuracy: 0.3,
      relevance: 0.2,
      clarity: 0.2
    };

    // Rust-specific weights
    this.rustWeights = {
      correctness: 0.30,
      rustIdioms: 0.25,
      codeQuality: 0.20,
      testing: 0.15,
      performance: 0.10
    };
  }

  async evaluate(response, scenario) {
    const scores = {
      completeness: await this.evaluateCompleteness(response, scenario),
      accuracy: await this.evaluateAccuracy(response, scenario),
      relevance: await this.evaluateRelevance(response, scenario),
      clarity: await this.evaluateClarity(response, scenario)
    };

    // Calculate weighted score
    const totalScore = Object.entries(scores).reduce((sum, [key, value]) => {
      return sum + (value * this.weights[key]);
    }, 0);

    return totalScore;
  }

  async evaluateCompleteness(response, scenario) {
    const criteria = scenario.scoringCriteria;
    let score = 0;
    let totalWeight = 0;

    for (const [criterion, weight] of Object.entries(criteria)) {
      totalWeight += weight;

      // Simple heuristic evaluation based on criterion
      if (this.checkCriterion(response, criterion)) {
        score += weight;
      }
    }

    return (score / totalWeight) * 100;
  }

  async evaluateAccuracy(response, scenario) {
    // Evaluate technical accuracy based on complexity
    const complexityModifiers = {
      low: 0.9,     // Easier to be accurate
      medium: 0.8,
      high: 0.7     // Harder to maintain accuracy
    };

    const baseAccuracy = 85; // Base accuracy score
    const modifier = complexityModifiers[scenario.complexity] || 0.8;

    // Check for common accuracy indicators
    const hasSpecifics = this.hasSpecificRecommendations(response);
    const hasMetrics = this.hasQuantifiableMetrics(response);
    const hasExamples = this.hasCodeExamples(response);

    let bonus = 0;
    if (hasSpecifics) bonus += 5;
    if (hasMetrics) bonus += 5;
    if (hasExamples) bonus += 5;

    return Math.min(100, (baseAccuracy * modifier) + bonus);
  }

  async evaluateRelevance(response, scenario) {
    const content = response.content || '';
    const task = scenario.task || '';

    // Extract key terms from task
    const taskTerms = this.extractKeyTerms(task);
    const responseTerms = this.extractKeyTerms(content);

    // Calculate term overlap
    const overlap = taskTerms.filter(term =>
      responseTerms.some(respTerm => respTerm.includes(term) || term.includes(respTerm))
    );

    const relevanceScore = (overlap.length / taskTerms.length) * 100;

    // Bonus for addressing expected capabilities
    const capabilityScore = this.checkCapabilities(response, scenario.expectedCapabilities);

    return Math.min(100, relevanceScore * 0.7 + capabilityScore * 0.3);
  }

  async evaluateClarity(response, scenario) {
    const content = response.content || '';

    // Clarity indicators
    const indicators = {
      hasStructure: /^#+\s/m.test(content),
      hasLists: /^[-*\d+]\.\s/m.test(content),
      hasCodeBlocks: /```[\s\S]*```/.test(content),
      appropriateLength: content.length > 200 && content.length < 4000,
      hasSections: (content.match(/^#+\s/gm) || []).length >= 2
    };

    const score = Object.values(indicators)
      .filter(Boolean).length / Object.keys(indicators).length * 100;

    return score;
  }

  checkCriterion(response, criterion) {
    const content = (response.content || '').toLowerCase();

    // Map criteria to detection patterns
    const patterns = {
      identifiesNestedLoops: /nested.*loop|loop.*loop|o\(n[²2]\)/i,
      suggestsHashMap: /hash.*map|map|dictionary|object/i,
      calculatesComplexity: /o\([^)]+\)|complexity|time.*complexity/i,
      providesCodeExample: /```[\s\S]*```/,
      estimatesImprovement: /\d+%|faster|improvement|speedup/i,
      identifiesMemoryLeak: /memory.*leak|leak|cleanup|remove.*listener/i,
      suggestsCleanup: /cleanup|off\(|remove|unsubscribe/i,
      providesFixedCode: /```[\s\S]*```/,
      explainsImpact: /impact|affect|result|consequence/i,
      identifiesNPlusOne: /n\s*\+\s*1|n\+1|query.*loop/i,
      suggestsJoin: /join|left.*join|inner.*join/i,
      providesOptimizedQuery: /```[\s\S]*```/,
      suggestsMultiLevel: /multi.*level|layer|l1.*l2|cache.*cache/i,
      specifiesTTL: /ttl|time.*live|expir|timeout/i,
      addressesInvalidation: /invalidat|clear.*cache|refresh|update/i,
      providesImplementation: /```[\s\S]*```/,
      calculatesImpact: /\d+%|calculate|estimate/i,
      calculatesThreads: /thread|pool.*size|worker/i,
      calculatesConnections: /connection|pool.*size/i,
      justifiesNumbers: /formula|calculate|because|based.*on/i,
      addressesMemory: /memory|heap|allocation/i,
      providesFormulas: /formula|equation|calculation/i,
      identifiesSequential: /sequential|series|one.*time|synchronous/i,
      suggestsParallel: /parallel|concurrent|promise\.all|async/i,
      handlesErrors: /error|catch|try.*catch|handle/i,
      identifiesSort: /sort|o\(n.*log.*n\)/i,
      suggestsHeap: /heap|priority.*queue/i,
      explainsComplexity: /o\([^)]+\)|complexity/i,
      comparesBigO: /o\([^)]+\)|vs|compare.*complexity/i,
      definesTestPhases: /phase|stage|step|test.*type/i,
      specifiesTools: /tool|k6|jmeter|gatling|artillery/i,
      providesMetrics: /metric|measure|p\d+|latency|throughput/i,
      addressesFailures: /fail|error|timeout|retry/i,
      includesScaling: /scale|capacity|load/i,
      identifiesDatabase: /database|query|db/i,
      metricsInterpretation: /metric|p\d+|percentile/i,
      prioritizesCorrectly: /priority|first|primary|main/i,
      suggestsSpecificFix: /fix|optimize|index|query/i,
      providesScalingStrategy: /scale|horizontal|vertical|shard/i,
      addressesCaching: /cache|redis|memcache|cdn/i,
      considersDatabase: /database|shard|replica|partition/i,
      includesCDN: /cdn|cloudflare|cloudfront|edge/i,
      estimatesCost: /cost|price|budget|\$/i
    };

    const pattern = patterns[criterion];
    if (!pattern) return false;

    return pattern.test(content);
  }

  extractKeyTerms(text) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'this', 'that', 'these', 'those']);

    return text
      .toLowerCase()
      .match(/\b\w+\b/g) || []
      .filter(word => word.length > 3 && !stopWords.has(word))
      .filter((word, index, self) => self.indexOf(word) === index);
  }

  checkCapabilities(response, expectedCapabilities) {
    const content = (response.content || '').toLowerCase();

    const capabilityMatches = expectedCapabilities.filter(capability => {
      const terms = capability.split('_');
      return terms.some(term => content.includes(term));
    });

    return (capabilityMatches.length / expectedCapabilities.length) * 100;
  }

  hasSpecificRecommendations(response) {
    const content = response.content || '';
    const recommendationPatterns = [
      /recommend/i,
      /suggest/i,
      /should.*use/i,
      /implement/i,
      /\d+\.\s+/  // Numbered list
    ];
    return recommendationPatterns.some(pattern => pattern.test(content));
  }

  hasQuantifiableMetrics(response) {
    const content = response.content || '';
    const metricPatterns = [
      /\d+%/,
      /\d+ms/,
      /\d+x\s+faster/i,
      /P\d+/,
      /O\([^)]+\)/
    ];
    return metricPatterns.some(pattern => pattern.test(content));
  }

  hasCodeExamples(response) {
    const content = response.content || '';
    return /```[\s\S]*```/.test(content);
  }

  /**
   * Evaluate Rust code submissions using weighted criteria from scenario
   */
  async evaluateRust(response, scenario) {
    const content = response.content || '';
    const rubric = scenario.scoringRubric || {};
    const criteria = rubric.criteria || [];

    let totalScore = 0;
    let totalWeight = 0;

    // Evaluate each category in the rubric
    for (const category of criteria) {
      const categoryScore = await this.evaluateRustCategory(content, category);
      totalScore += categoryScore * (category.weight / 100);
      totalWeight += category.weight;
    }

    // Normalize to 0-100 scale
    return totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
  }

  /**
   * Evaluate a single Rust category (Correctness, Rust Idioms, etc.)
   */
  async evaluateRustCategory(content, category) {
    let categoryScore = 0;
    let maxCategoryPoints = 0;

    for (const check of category.checks || []) {
      maxCategoryPoints += check.points;

      // Check if the code meets the criterion
      if (this.checkRustCriterion(content, check)) {
        categoryScore += check.points;
      }
    }

    return maxCategoryPoints > 0 ? (categoryScore / maxCategoryPoints) * 100 : 0;
  }

  /**
   * Check if Rust code meets a specific criterion
   */
  checkRustCriterion(content, check) {
    const checkName = check.name.toLowerCase();
    const testDesc = (check.test || '').toLowerCase();

    // Compilation check
    if (checkName.includes('compil') || testDesc.includes('compil')) {
      return this.checkRustCompilation(content);
    }

    // Iterator usage
    if (checkName.includes('iterator') || testDesc.includes('iterator') ||
        testDesc.includes('split_whitespace')) {
      return /\.split_whitespace\(\)|\.iter\(\)|\.map\(|\.filter\(|\.collect\(/i.test(content);
    }

    // Result type usage
    if (checkName.includes('result') || testDesc.includes('result<')) {
      return /Result<[\w\s,]+>/i.test(content);
    }

    // Error handling
    if (checkName.includes('error') || testDesc.includes('err(') || testDesc.includes('error')) {
      return /Err\(|\.unwrap\(\)|\.expect\(|if.*\.is_err\(\)/i.test(content);
    }

    // Borrowing efficiency
    if (checkName.includes('borrow') || testDesc.includes('&str') ||
        testDesc.includes('without.*clon')) {
      return /&str|&\[|&mut/i.test(content) && !/\.clone\(\)/.test(content);
    }

    // Documentation
    if (checkName.includes('documentation') || testDesc.includes('rustdoc')) {
      return /\/\/\/|\/\*\*|#\[doc\]/i.test(content);
    }

    // Test coverage
    if (checkName.includes('test') || testDesc.includes('#[test]')) {
      return /#\[test\]|#\[cfg\(test\)\]/i.test(content);
    }

    // Ownership patterns
    if (checkName.includes('ownership') || testDesc.includes('ownership')) {
      return /&self|&mut self|impl|pub fn/i.test(content);
    }

    // Lifetime annotations
    if (checkName.includes('lifetime') || testDesc.includes('lifetime')) {
      return /<'[a-z]+>/i.test(content);
    }

    // Memory safety (unsafe usage)
    if (checkName.includes('unsafe') || checkName.includes('safety')) {
      const hasUnsafe = /unsafe\s+\{/.test(content);
      const hasJustification = /\/\/.*unsafe|\/\*.*unsafe.*\*\//i.test(content);
      // Good if no unsafe, or if unsafe with justification
      return !hasUnsafe || hasJustification;
    }

    // Pattern matching
    if (checkName.includes('match') || testDesc.includes('match')) {
      return /match\s+\w+\s*\{/i.test(content);
    }

    // Idiomatic error handling
    if (checkName.includes('idiomatic') && testDesc.includes('error')) {
      return /\?(?!;)|\.map_err\(|Result<|Option</i.test(content);
    }

    // Performance - avoiding allocations
    if (checkName.includes('performance') || testDesc.includes('alloc') ||
        testDesc.includes('zero-copy')) {
      return /&str|&\[/.test(content) && !/to_string\(\)|String::from/.test(content);
    }

    // Generic usage
    if (checkName.includes('generic') || testDesc.includes('generic')) {
      return /<T>|<T:|impl\s+\w+/i.test(content);
    }

    // Trait implementation
    if (checkName.includes('trait') || testDesc.includes('trait')) {
      return /impl\s+\w+\s+for|trait\s+\w+/i.test(content);
    }

    // Basic functionality - look for function definition
    if (checkName.includes('basic') || checkName.includes('functionality')) {
      return /fn\s+\w+\s*\(/i.test(content) && /\{[\s\S]*\}/i.test(content);
    }

    // Edge cases handling
    if (checkName.includes('edge case') || testDesc.includes('edge case')) {
      const tests = content.match(/#\[test\]/g) || [];
      return tests.length >= 3; // At least 3 test cases suggests edge case coverage
    }

    // Default: check for keywords in test description
    const keywords = testDesc.split(' ').filter(w => w.length > 3);
    return keywords.some(keyword =>
      new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(content)
    );
  }

  /**
   * Basic Rust compilation check (syntax patterns)
   */
  checkRustCompilation(content) {
    // Check for basic Rust syntax validity
    const hasFunction = /fn\s+\w+/.test(content);
    const balancedBraces = this.checkBalancedBraces(content);
    const noObviousSyntaxErrors = !/\}\s*\{|\(\s*\)|\[\s*\]/.test(content);

    return hasFunction && balancedBraces && noObviousSyntaxErrors;
  }

  /**
   * Check if braces are balanced in code
   */
  checkBalancedBraces(content) {
    let count = 0;
    for (const char of content) {
      if (char === '{') count++;
      if (char === '}') count--;
      if (count < 0) return false;
    }
    return count === 0;
  }

  /**
   * Check for Rust idiomaticity
   */
  checkRustIdiomaticity(content) {
    const idioms = {
      iterators: /\.iter\(\)|\.map\(|\.filter\(|\.collect\(/i.test(content),
      resultTypes: /Result<[\w\s,]+>/i.test(content),
      optionTypes: /Option<\w+>/i.test(content),
      matchExpressions: /match\s+\w+\s*\{/i.test(content),
      borrowing: /&str|&\[|&mut/i.test(content),
      noUnnecessaryClones: !/(\.clone\(\).*){3,}/i.test(content)
    };

    const score = Object.values(idioms).filter(Boolean).length;
    return (score / Object.keys(idioms).length) * 100;
  }

  /**
   * Check for Rust performance characteristics
   */
  checkRustPerformance(content) {
    const performanceIndicators = {
      avoidAllocations: /&str|&\[/.test(content),
      iteratorChains: /\.iter\(\).*\.map\(.*\.collect\(/i.test(content),
      noUnnecessaryClones: (content.match(/\.clone\(\)/g) || []).length < 2,
      capacityPrealloc: /with_capacity\(/i.test(content),
      inPlaceOps: /&mut|\.iter_mut\(/i.test(content)
    };

    const score = Object.values(performanceIndicators).filter(Boolean).length;
    return (score / Object.keys(performanceIndicators).length) * 100;
  }
}

export { PromptEvaluator };