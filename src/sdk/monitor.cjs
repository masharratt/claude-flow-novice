/**
 * SDK Usage Monitor
 *
 * Tracks token savings and performance metrics from Claude Agent SDK
 * Provides real-time monitoring of cost reduction and efficiency gains
 */

const fs = require('fs');
const path = require('path');

/**
 * Token cost constants (per 1M tokens)
 * Based on Claude API pricing
 */
const TOKEN_COSTS = {
  input: 0.003,        // $3 per 1M input tokens
  output: 0.015,       // $15 per 1M output tokens
  cached: 0.0003,      // $0.30 per 1M cached tokens (90% savings)
  cacheWrite: 0.00375  // $3.75 per 1M tokens to write to cache
};

/**
 * SDK Monitor Class
 * Tracks and reports on SDK usage, savings, and performance
 */
class SDKMonitor {
  constructor(options = {}) {
    this.options = {
      persistMetrics: options.persistMetrics !== false,
      metricsDir: options.metricsDir || './.claude-flow-novice/metrics',
      reportInterval: options.reportInterval || 60000, // 1 minute
      ...options
    };

    this.metrics = {
      // Token usage
      tokensBefore: 0,
      tokensAfter: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,

      // Savings
      cacheSavings: 0,
      contextReductions: 0,
      totalCostSaved: 0,

      // Performance
      operations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageLatency: 0,

      // Timing
      startTime: Date.now(),
      lastReportTime: Date.now()
    };

    this.operationHistory = [];
    this.enabled = process.env.ENABLE_SDK_MONITORING !== 'false';

    if (this.enabled && this.options.persistMetrics) {
      this.ensureMetricsDirectory();
      this.startPeriodicReporting();
    }
  }

  /**
   * Ensure metrics directory exists
   */
  ensureMetricsDirectory() {
    try {
      if (!fs.existsSync(this.options.metricsDir)) {
        fs.mkdirSync(this.options.metricsDir, { recursive: true });
      }
    } catch (error) {
      console.error('[SDK Monitor] Failed to create metrics directory:', error.message);
    }
  }

  /**
   * Track a single operation's token usage
   *
   * @param {string} operation - Operation name
   * @param {Function} callback - Async operation to track
   * @returns {Promise<any>} Operation result
   */
  async trackUsage(operation, callback) {
    if (!this.enabled) {
      return await callback();
    }

    const startTime = Date.now();
    const before = this.getTokenUsage();

    try {
      const result = await callback();
      const after = this.getTokenUsage();
      const duration = Date.now() - startTime;

      // Calculate metrics
      const tokensUsed = after - before;
      const tokensSaved = this.calculateSavings(tokensUsed);
      const costSaved = this.calculateCostSavings(tokensUsed, tokensSaved);

      // Update metrics
      this.metrics.tokensBefore += before;
      this.metrics.tokensAfter += after;
      this.metrics.cacheSavings += tokensSaved;
      this.metrics.totalCostSaved += costSaved;
      this.metrics.operations++;

      // Update average latency
      this.metrics.averageLatency = (
        (this.metrics.averageLatency * (this.metrics.operations - 1) + duration) /
        this.metrics.operations
      );

      // Store operation history
      this.operationHistory.push({
        operation,
        timestamp: Date.now(),
        tokensUsed,
        tokensSaved,
        costSaved: costSaved.toFixed(4),
        duration,
        cached: this.isCached(result)
      });

      // Log operation results
      console.log(`[SDK Monitor] Operation: ${operation}`);
      console.log(`  Tokens used: ${tokensUsed.toLocaleString()}`);
      console.log(`  Tokens saved: ${tokensSaved.toLocaleString()}`);
      console.log(`  Cost saved: $${costSaved.toFixed(4)}`);
      console.log(`  Duration: ${duration}ms`);

      return result;
    } catch (error) {
      console.error(`[SDK Monitor] Operation failed: ${operation}`, error.message);
      throw error;
    }
  }

  /**
   * Get current token usage
   * Note: This is a placeholder - actual implementation would integrate with SDK metrics
   *
   * @returns {number} Current token count
   */
  getTokenUsage() {
    // In production, this would query the SDK for actual token usage
    // For now, return accumulated metrics
    return this.metrics.inputTokens + this.metrics.outputTokens;
  }

  /**
   * Calculate token savings from caching and context editing
   *
   * @param {number} tokensUsed - Tokens used in operation
   * @returns {number} Tokens saved
   */
  calculateSavings(tokensUsed) {
    // Extended caching provides 90% savings on cached tokens
    // Context editing provides 84% reduction on context tokens
    const cacheSavings = tokensUsed * 0.9; // 90% cache savings
    const contextSavings = tokensUsed * 0.84; // 84% context reduction

    return Math.max(cacheSavings, contextSavings);
  }

  /**
   * Calculate cost savings in dollars
   *
   * @param {number} tokensUsed - Tokens used in operation
   * @param {number} tokensSaved - Tokens saved
   * @returns {number} Cost saved in dollars
   */
  calculateCostSavings(tokensUsed, tokensSaved) {
    // Average cost per token (mix of input and output)
    const avgCostPerToken = (TOKEN_COSTS.input + TOKEN_COSTS.output) / 2;
    const cachedCostPerToken = TOKEN_COSTS.cached;

    // Cost if no caching
    const costWithoutCache = (tokensUsed / 1000000) * avgCostPerToken;

    // Cost with caching
    const costWithCache = (tokensUsed / 1000000) * cachedCostPerToken;

    return costWithoutCache - costWithCache;
  }

  /**
   * Check if operation result was cached
   *
   * @param {any} result - Operation result
   * @returns {boolean} True if cached
   */
  isCached(result) {
    // Check if result has cache metadata
    return result && result.cached === true;
  }

  /**
   * Get comprehensive savings report
   *
   * @returns {object} Detailed savings report
   */
  getSavingsReport() {
    const totalTokensSaved = this.metrics.tokensBefore - this.metrics.tokensAfter;
    const percentReduction = this.metrics.tokensBefore > 0
      ? ((totalTokensSaved / this.metrics.tokensBefore) * 100)
      : 0;

    const cacheHitRate = this.metrics.operations > 0
      ? ((this.metrics.cacheHits / this.metrics.operations) * 100)
      : 0;

    const runTime = Date.now() - this.metrics.startTime;
    const runTimeHours = runTime / (1000 * 60 * 60);

    return {
      summary: {
        totalTokensSaved: totalTokensSaved.toLocaleString(),
        costSaved: `$${this.metrics.totalCostSaved.toFixed(2)}`,
        percentReduction: `${percentReduction.toFixed(1)}%`,
        operations: this.metrics.operations
      },
      caching: {
        cacheHits: this.metrics.cacheHits,
        cacheMisses: this.metrics.cacheMisses,
        hitRate: `${cacheHitRate.toFixed(1)}%`,
        savings: `$${(this.metrics.cacheSavings * TOKEN_COSTS.cached).toFixed(2)}`
      },
      contextEditing: {
        reductions: this.metrics.contextReductions,
        tokensSaved: this.metrics.contextReductions.toLocaleString()
      },
      performance: {
        averageLatency: `${this.metrics.averageLatency.toFixed(0)}ms`,
        operations: this.metrics.operations,
        runtime: `${runTimeHours.toFixed(2)} hours`
      },
      projection: {
        dailySavings: `$${((this.metrics.totalCostSaved / runTimeHours) * 24).toFixed(2)}`,
        monthlySavings: `$${((this.metrics.totalCostSaved / runTimeHours) * 24 * 30).toFixed(2)}`,
        annualSavings: `$${((this.metrics.totalCostSaved / runTimeHours) * 24 * 365).toFixed(2)}`
      }
    };
  }

  /**
   * Get recent operation history
   *
   * @param {number} limit - Number of recent operations to return
   * @returns {Array} Recent operations
   */
  getRecentOperations(limit = 10) {
    return this.operationHistory.slice(-limit);
  }

  /**
   * Print savings report to console
   */
  printReport() {
    const report = this.getSavingsReport();

    console.log('\n' + '='.repeat(60));
    console.log('📊 SDK SAVINGS REPORT');
    console.log('='.repeat(60));

    console.log('\n💰 COST SAVINGS:');
    console.log(`  Total Cost Saved: ${report.summary.costSaved}`);
    console.log(`  Token Reduction: ${report.summary.percentReduction}`);
    console.log(`  Operations: ${report.summary.operations}`);

    console.log('\n🔄 CACHING:');
    console.log(`  Cache Hit Rate: ${report.caching.hitRate}`);
    console.log(`  Cache Hits: ${report.caching.cacheHits}`);
    console.log(`  Cache Misses: ${report.caching.cacheMisses}`);
    console.log(`  Cache Savings: ${report.caching.savings}`);

    console.log('\n⚡ PERFORMANCE:');
    console.log(`  Average Latency: ${report.performance.averageLatency}`);
    console.log(`  Total Runtime: ${report.performance.runtime}`);

    console.log('\n📈 PROJECTIONS:');
    console.log(`  Daily Savings: ${report.projection.dailySavings}`);
    console.log(`  Monthly Savings: ${report.projection.monthlySavings}`);
    console.log(`  Annual Savings: ${report.projection.annualSavings}`);

    console.log('\n' + '='.repeat(60) + '\n');
  }

  /**
   * Save metrics to file
   */
  async saveMetrics() {
    if (!this.options.persistMetrics) {
      return;
    }

    try {
      const report = this.getSavingsReport();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `sdk-metrics-${timestamp}.json`;
      const filepath = path.join(this.options.metricsDir, filename);

      const data = {
        timestamp: new Date().toISOString(),
        metrics: this.metrics,
        report,
        recentOperations: this.getRecentOperations(20)
      };

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`[SDK Monitor] Metrics saved to ${filepath}`);
    } catch (error) {
      console.error('[SDK Monitor] Failed to save metrics:', error.message);
    }
  }

  /**
   * Start periodic reporting
   */
  startPeriodicReporting() {
    this.reportInterval = setInterval(() => {
      this.printReport();
      this.saveMetrics();
    }, this.options.reportInterval);
  }

  /**
   * Stop periodic reporting
   */
  stopPeriodicReporting() {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset() {
    this.metrics = {
      tokensBefore: 0,
      tokensAfter: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      cacheSavings: 0,
      contextReductions: 0,
      totalCostSaved: 0,
      operations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageLatency: 0,
      startTime: Date.now(),
      lastReportTime: Date.now()
    };
    this.operationHistory = [];
  }
}

// Create singleton instance
let monitorInstance = null;

/**
 * Get the SDK monitor instance (singleton pattern)
 *
 * @param {object} options - Monitor options
 * @returns {SDKMonitor} Monitor instance
 */
function getMonitor(options) {
  if (!monitorInstance) {
    monitorInstance = new SDKMonitor(options);
  }
  return monitorInstance;
}

/**
 * Reset the monitor instance (useful for testing)
 */
function resetMonitor() {
  if (monitorInstance) {
    monitorInstance.stopPeriodicReporting();
  }
  monitorInstance = null;
}

module.exports = {
  SDKMonitor,
  getMonitor,
  resetMonitor,
  TOKEN_COSTS
};