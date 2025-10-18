class MetricsCollector {
  constructor() {
    this.metrics = {
      performance: {},
      quality: {},
      consistency: {}
    };
  }

  async collect(response, responseTime) {
    return {
      performance: await this.collectPerformanceMetrics(response, responseTime),
      quality: await this.collectQualityMetrics(response),
      tokens: await this.estimateTokenUsage(response)
    };
  }

  async collectPerformanceMetrics(response, responseTime) {
    return {
      responseTime,
      timeToFirstToken: responseTime * 0.1, // Simulated TTFT (10% of total)
      tokensPerSecond: this.calculateTPS(response, responseTime),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 // MB
    };
  }

  async collectQualityMetrics(response) {
    return {
      length: response.content?.length || 0,
      hasCodeExamples: this.detectCodeExamples(response.content),
      hasMetrics: this.detectMetrics(response.content),
      hasRecommendations: this.detectRecommendations(response.content),
      structure: this.analyzeStructure(response.content)
    };
  }

  async estimateTokenUsage(response) {
    // Rough estimation: ~4 characters per token
    const contentLength = response.content?.length || 0;
    const estimatedTokens = Math.ceil(contentLength / 4);

    return {
      inputTokens: 500, // Estimated for prompt + scenario
      outputTokens: estimatedTokens,
      totalTokens: 500 + estimatedTokens
    };
  }

  calculateTPS(response, responseTime) {
    const tokens = this.estimateTokenUsage(response).outputTokens;
    const seconds = responseTime / 1000;
    return tokens / seconds;
  }

  detectCodeExamples(content) {
    if (!content) return false;
    return /```[\s\S]*```/.test(content);
  }

  detectMetrics(content) {
    if (!content) return false;
    const metricPatterns = [
      /\d+%/,  // Percentages
      /\d+ms/,  // Milliseconds
      /P\d+/,   // Percentiles
      /\d+x/    // Multipliers
    ];
    return metricPatterns.some(pattern => pattern.test(content));
  }

  detectRecommendations(content) {
    if (!content) return false;
    const recommendationPatterns = [
      /recommend/i,
      /suggest/i,
      /should/i,
      /optimization/i
    ];
    return recommendationPatterns.some(pattern => pattern.test(content));
  }

  analyzeStructure(content) {
    if (!content) return { score: 0 };

    const structure = {
      hasHeaders: /^#+\s/m.test(content),
      hasList: /^[-*]\s/m.test(content),
      hasNumberedList: /^\d+\.\s/m.test(content),
      hasCodeBlocks: this.detectCodeExamples(content),
      paragraphCount: content.split('\n\n').length
    };

    // Calculate structure score
    const score = Object.values(structure)
      .filter(v => typeof v === 'boolean')
      .filter(v => v).length / 4 * 100;

    return { ...structure, score };
  }
}

export { MetricsCollector };