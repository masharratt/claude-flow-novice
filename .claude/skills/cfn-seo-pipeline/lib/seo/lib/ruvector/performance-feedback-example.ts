/**
 * Performance Feedback Loop - Usage Examples
 *
 * Demonstrates how to use the PerformanceFeedbackManager
 * for updating pattern confidence based on content performance.
 *
 * @module seo/lib/ruvector/performance-feedback-example
 */

import {
  PerformanceFeedbackManager,
  type PerformanceMetricsInput,
  DEFAULT_ADJUSTMENT_RULES,
} from './performance-feedback';
import type { SEOQueryManager } from './queries';
import type { VectorDB } from '@ruvector/core';

/**
 * Example 1: Process single content performance metrics
 *
 * Analyzes a single article's performance and updates pattern confidence
 */
export async function exampleSingleContentAnalysis(
  queryManager: SEOQueryManager,
  vectorDb: VectorDB
): Promise<void> {
  console.log('=== Example 1: Single Content Analysis ===\n');

  const manager = new PerformanceFeedbackManager(queryManager, vectorDb);

  // Metrics for an article that ranked well
  const highPerformanceMetrics: PerformanceMetricsInput = {
    contentId: 'how-to-seo-optimization',
    contentUrl: 'https://example.com/guides/seo-optimization',
    ranking: {
      averagePosition: 6,
      bestPosition: 2,
      topTenCount: 12,
      totalKeywordsTracked: 15,
    },
    traffic: {
      totalImpressions: 2500,
      totalClicks: 125,
      dailyAverageTraffic: 60,
      trafficTrendDirection: 0.22, // 22% growth trend
    },
    conversions: {
      averageCTR: 0.048, // 4.8% CTR
      conversionRate: 0.032, // 3.2% conversion rate
      totalConversions: 40,
      conversionValue: 2000,
    },
    timeWindow: 'short-term',
    metricsCollectedAt: new Date(),
    metadata: {
      dataSource: 'gsc',
      confidence: 0.95,
      notes: 'Strong performance across all metrics',
    },
  };

  const report = await manager.processPerfomanceMetrics(highPerformanceMetrics);

  console.log(`Report ID: ${report.reportId}`);
  console.log(`Content: ${report.contentUrl}`);
  console.log(`Patterns Updated: ${report.patternsUpdated}`);
  console.log(`Total Confidence Delta: ${report.totalConfidenceDelta.toFixed(3)}`);
  console.log(`Patterns Improved: ${report.patternsImproved}`);
  console.log(`Patterns Declined: ${report.patternsDeclined}`);
  console.log(`Average New Confidence: ${report.averageNewConfidence.toFixed(3)}`);
  console.log(`\nRecommendations:`);
  report.recommendations.forEach((rec, idx) => {
    console.log(`  ${idx + 1}. ${rec}`);
  });
  console.log();
}

/**
 * Example 2: Process underperforming content
 *
 * Analyzes content that didn't perform well and identifies
 * patterns that may need refinement
 */
export async function exampleUnderperformingContent(
  queryManager: SEOQueryManager,
  vectorDb: VectorDB
): Promise<void> {
  console.log('=== Example 2: Underperforming Content Analysis ===\n');

  const manager = new PerformanceFeedbackManager(queryManager, vectorDb);

  // Metrics for an article with poor performance
  const poorPerformanceMetrics: PerformanceMetricsInput = {
    contentId: 'advanced-seo-tactics',
    contentUrl: 'https://example.com/articles/advanced-seo-tactics',
    ranking: {
      averagePosition: 58,
      bestPosition: 45,
      topTenCount: 0,
      totalKeywordsTracked: 10,
    },
    traffic: {
      totalImpressions: 120,
      totalClicks: 3,
      dailyAverageTraffic: 0.8,
      trafficTrendDirection: -0.35, // 35% decline
    },
    conversions: {
      averageCTR: 0.0075, // 0.75% CTR (below target)
      conversionRate: 0.0,
      totalConversions: 0,
    },
    timeWindow: 'short-term',
    metricsCollectedAt: new Date(),
    metadata: {
      dataSource: 'gsc',
      confidence: 0.90,
      notes: 'Content not gaining traction despite publication',
    },
  };

  const report = await manager.processPerfomanceMetrics(poorPerformanceMetrics);

  console.log(`Report ID: ${report.reportId}`);
  console.log(`Content: ${report.contentUrl}`);
  console.log(`Patterns Updated: ${report.patternsUpdated}`);
  console.log(`Total Confidence Delta: ${report.totalConfidenceDelta.toFixed(3)}`);
  console.log(`\nRecommendations:`);
  report.recommendations.forEach((rec, idx) => {
    console.log(`  ${idx + 1}. ${rec}`);
  });
  console.log();
}

/**
 * Example 3: Batch processing multiple articles
 *
 * Processes multiple articles' performance metrics at once
 * for efficient batch updates
 */
export async function exampleBatchProcessing(
  queryManager: SEOQueryManager,
  vectorDb: VectorDB
): Promise<void> {
  console.log('=== Example 3: Batch Processing ===\n');

  const manager = new PerformanceFeedbackManager(queryManager, vectorDb);

  // Create array of metrics for multiple articles
  const batchMetrics: PerformanceMetricsInput[] = [
    {
      contentId: 'article-001',
      contentUrl: 'https://example.com/article-001',
      ranking: {
        averagePosition: 8,
        bestPosition: 4,
        topTenCount: 10,
        totalKeywordsTracked: 12,
      },
      traffic: {
        totalImpressions: 1200,
        totalClicks: 60,
        dailyAverageTraffic: 30,
        trafficTrendDirection: 0.15,
      },
      conversions: {
        averageCTR: 0.04,
        conversionRate: 0.025,
        totalConversions: 15,
        conversionValue: 750,
      },
      timeWindow: 'short-term',
      metricsCollectedAt: new Date(),
    },
    {
      contentId: 'article-002',
      contentUrl: 'https://example.com/article-002',
      ranking: {
        averagePosition: 15,
        bestPosition: 8,
        topTenCount: 5,
        totalKeywordsTracked: 10,
      },
      traffic: {
        totalImpressions: 600,
        totalClicks: 24,
        dailyAverageTraffic: 12,
        trafficTrendDirection: 0.08,
      },
      conversions: {
        averageCTR: 0.035,
        conversionRate: 0.018,
        totalConversions: 8,
        conversionValue: 400,
      },
      timeWindow: 'short-term',
      metricsCollectedAt: new Date(),
    },
    {
      contentId: 'article-003',
      contentUrl: 'https://example.com/article-003',
      ranking: {
        averagePosition: 25,
        bestPosition: 18,
        topTenCount: 2,
        totalKeywordsTracked: 8,
      },
      traffic: {
        totalImpressions: 300,
        totalClicks: 9,
        dailyAverageTraffic: 5,
        trafficTrendDirection: -0.12,
      },
      conversions: {
        averageCTR: 0.025,
        conversionRate: 0.01,
        totalConversions: 3,
        conversionValue: 150,
      },
      timeWindow: 'initial',
      metricsCollectedAt: new Date(),
    },
  ];

  const result = await manager.processBatchMetrics(batchMetrics);

  console.log(`Batch Results:`);
  console.log(`  Processed: ${result.processed}`);
  console.log(`  Successful: ${result.successful}`);
  console.log(`  Failed: ${result.failed}`);
  console.log(`  Total Patterns Updated: ${result.totalPatternsUpdated}`);
  console.log(`  Average Confidence Adjustment: ${result.averageConfidenceAdjustment.toFixed(3)}`);
  console.log(`  Execution Time: ${result.executionTimeMs}ms\n`);

  console.log(`Individual Reports:`);
  result.reports.forEach((report, idx) => {
    console.log(`\n  Report ${idx + 1}: ${report.contentId}`);
    console.log(`    Patterns Updated: ${report.patternsUpdated}`);
    console.log(`    Confidence Delta: ${report.totalConfidenceDelta.toFixed(3)}`);
    console.log(`    Improved: ${report.patternsImproved}, Declined: ${report.patternsDeclined}`);
  });
  console.log();
}

/**
 * Example 4: Custom adjustment rules
 *
 * Demonstrates how to customize confidence adjustment rules
 * for different optimization strategies
 */
export async function exampleCustomAdjustmentRules(
  queryManager: SEOQueryManager,
  vectorDb: VectorDB
): Promise<void> {
  console.log('=== Example 4: Custom Adjustment Rules ===\n');

  const manager = new PerformanceFeedbackManager(queryManager, vectorDb);

  // View default rules
  console.log('Default Rules:');
  const defaultRules = manager.getAdjustmentRules();
  console.log(`  Top 3 Boost: ${defaultRules.topThreeBoost}`);
  console.log(`  High CTR Boost: ${defaultRules.highCTRBoost}`);
  console.log(`  Min Confidence: ${defaultRules.minConfidence}`);
  console.log(`  Max Confidence: ${defaultRules.maxConfidence}\n`);

  // Custom strategy 1: Conservative (prioritize safety)
  console.log('Strategy 1: Conservative (safer patterns)');
  manager.updateAdjustmentRules({
    topThreeBoost: 0.08,           // More conservative boost
    minConfidence: 0.2,            // Higher minimum floor
    minImpressionsThreshold: 200,  // Require more data
  });

  let rules = manager.getAdjustmentRules();
  console.log(`  Updated Top 3 Boost: ${rules.topThreeBoost}`);
  console.log(`  Updated Min Confidence: ${rules.minConfidence}`);
  console.log(`  Updated Min Impressions: ${rules.minImpressionsThreshold}\n`);

  // Custom strategy 2: Aggressive (fast learning)
  console.log('Strategy 2: Aggressive (fast learning)');
  manager.updateAdjustmentRules({
    topThreeBoost: 0.25,           // Higher boost for winners
    topTenBoost: 0.18,
    rankingDropDecay: -0.20,       // Stronger penalty for failures
    minConfidence: 0.05,           // Lower floor for exploration
    minImpressionsThreshold: 20,   // Minimal data requirement
  });

  rules = manager.getAdjustmentRules();
  console.log(`  Updated Top 3 Boost: ${rules.topThreeBoost}`);
  console.log(`  Updated Ranking Drop Decay: ${rules.rankingDropDecay}`);
  console.log(`  Updated Min Confidence: ${rules.minConfidence}`);
  console.log(`  Updated Min Impressions: ${rules.minImpressionsThreshold}\n`);

  // Reset to defaults for next example
  manager.updateAdjustmentRules(DEFAULT_ADJUSTMENT_RULES);
}

/**
 * Example 5: Error handling
 *
 * Demonstrates proper error handling for various scenarios
 */
export async function exampleErrorHandling(
  queryManager: SEOQueryManager,
  vectorDb: VectorDB
): Promise<void> {
  console.log('=== Example 5: Error Handling ===\n');

  const manager = new PerformanceFeedbackManager(queryManager, vectorDb);

  // Example 1: Invalid metrics (empty content ID)
  console.log('Test 1: Invalid metrics (empty content ID)');
  try {
    const invalidMetrics: PerformanceMetricsInput = {
      contentId: '', // Invalid: empty
      contentUrl: 'https://example.com',
      ranking: {
        averagePosition: 10,
        bestPosition: 5,
        topTenCount: 5,
        totalKeywordsTracked: 10,
      },
      traffic: {
        totalImpressions: 100,
        totalClicks: 5,
        dailyAverageTraffic: 5,
        trafficTrendDirection: 0,
      },
      conversions: {
        averageCTR: 0.05,
        conversionRate: 0.01,
        totalConversions: 1,
      },
      timeWindow: 'short-term',
      metricsCollectedAt: new Date(),
    };

    await manager.processPerfomanceMetrics(invalidMetrics);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.log(`  Error: ${error.message}`);
      console.log(`  Type: ${error.constructor.name}\n`);
    }
  }

  // Example 2: Invalid CTR (>1.0)
  console.log('Test 2: Invalid metrics (CTR > 1.0)');
  try {
    const invalidCTR: PerformanceMetricsInput = {
      contentId: 'article-001',
      contentUrl: 'https://example.com',
      ranking: {
        averagePosition: 10,
        bestPosition: 5,
        topTenCount: 5,
        totalKeywordsTracked: 10,
      },
      traffic: {
        totalImpressions: 100,
        totalClicks: 5,
        dailyAverageTraffic: 5,
        trafficTrendDirection: 0,
      },
      conversions: {
        averageCTR: 1.5, // Invalid: > 1.0
        conversionRate: 0.01,
        totalConversions: 1,
      },
      timeWindow: 'short-term',
      metricsCollectedAt: new Date(),
    };

    await manager.processPerfomanceMetrics(invalidCTR);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.log(`  Error: ${error.message}`);
      console.log(`  Type: ${error.constructor.name}\n`);
    }
  }

  // Example 3: Insufficient data (below impression threshold)
  console.log('Test 3: Insufficient data (below threshold)');
  const insufficientData: PerformanceMetricsInput = {
    contentId: 'new-article',
    contentUrl: 'https://example.com/new-article',
    ranking: {
      averagePosition: 25,
      bestPosition: 18,
      topTenCount: 1,
      totalKeywordsTracked: 5,
    },
    traffic: {
      totalImpressions: 10, // Below default threshold of 50
      totalClicks: 1,
      dailyAverageTraffic: 0.5,
      trafficTrendDirection: 0,
    },
    conversions: {
      averageCTR: 0.08,
      conversionRate: 0.0,
      totalConversions: 0,
    },
    timeWindow: 'initial',
    metricsCollectedAt: new Date(),
  };

  try {
    const report = await manager.processPerfomanceMetrics(insufficientData);
    console.log(`  Report generated (no error)`);
    console.log(`  Recommendations:`);
    report.recommendations.forEach((rec) => console.log(`    - ${rec}`));
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.log(`  Error: ${error.message}`);
    }
  }
  console.log();
}

/**
 * Example 6: Integration with pipeline
 *
 * Shows how to integrate performance feedback into the
 * SEO intelligence pipeline
 */
export async function examplePipelineIntegration(
  queryManager: SEOQueryManager,
  vectorDb: VectorDB
): Promise<void> {
  console.log('=== Example 6: Pipeline Integration ===\n');

  const manager = new PerformanceFeedbackManager(queryManager, vectorDb);

  // Simulate monthly performance review workflow
  console.log('Monthly Performance Review Workflow\n');

  // Step 1: Collect metrics from GSC/GA4
  console.log('Step 1: Collect performance metrics from GSC/GA4');
  const monthlyMetrics: PerformanceMetricsInput[] = [
    {
      contentId: 'guide-seo-2024',
      contentUrl: 'https://example.com/guides/seo-2024',
      ranking: {
        averagePosition: 5,
        bestPosition: 2,
        topTenCount: 15,
        totalKeywordsTracked: 20,
      },
      traffic: {
        totalImpressions: 5000,
        totalClicks: 250,
        dailyAverageTraffic: 80,
        trafficTrendDirection: 0.30,
      },
      conversions: {
        averageCTR: 0.05,
        conversionRate: 0.035,
        totalConversions: 90,
        conversionValue: 4500,
      },
      timeWindow: 'short-term',
      metricsCollectedAt: new Date(),
    },
  ];
  console.log(`  Collected metrics for ${monthlyMetrics.length} article(s)\n`);

  // Step 2: Process metrics and update patterns
  console.log('Step 2: Process metrics and update pattern confidence');
  const result = await manager.processBatchMetrics(monthlyMetrics);
  console.log(`  Updated ${result.totalPatternsUpdated} patterns`);
  console.log(`  Average confidence adjustment: ${result.averageConfidenceAdjustment.toFixed(3)}\n`);

  // Step 3: Review recommendations
  console.log('Step 3: Review recommendations for next month');
  result.reports.forEach((report) => {
    console.log(`  Article: ${report.contentId}`);
    report.recommendations.forEach((rec) => {
      console.log(`    - ${rec}`);
    });
  });
  console.log();

  // Step 4: Plan content strategy
  console.log('Step 4: Plan content strategy based on patterns');
  console.log('  - Replicate high-confidence patterns');
  console.log('  - Investigate declining patterns');
  console.log('  - Experiment with new pattern variations\n');
}

/**
 * Run all examples
 */
export async function runAllExamples(
  queryManager: SEOQueryManager,
  vectorDb: VectorDB
): Promise<void> {
  try {
    await exampleSingleContentAnalysis(queryManager, vectorDb);
    await exampleUnderperformingContent(queryManager, vectorDb);
    await exampleBatchProcessing(queryManager, vectorDb);
    await exampleCustomAdjustmentRules(queryManager, vectorDb);
    await exampleErrorHandling(queryManager, vectorDb);
    await examplePipelineIntegration(queryManager, vectorDb);

    console.log('=== All Examples Completed Successfully ===');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}
