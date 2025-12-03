/**
 * Example Usage: Cluster Research Context Builder
 *
 * Demonstrates how to use ClusterResearchContextBuilder to query
 * all 6 RuVector collections and build unified research context.
 *
 * @module seo/lib/cluster-research-context.example
 */

import { ClusterResearchContextBuilder } from './cluster-research-context';
import { SEOQueryManager } from './ruvector/queries';
import { createSEOCollections } from './ruvector';
import type { VectorDB } from '@ruvector/core';

/**
 * Example 1: Basic cluster research context
 */
async function exampleBasicClusterContext() {
  // Setup (assumes you have SEOQueryManager configured)
  const collections = new Map<string, VectorDB>(); // ... initialize collections
  const embeddingFn = async (text: string) => new Float32Array(384); // ... your embedding function
  const seoQueryManager = new SEOQueryManager(collections, embeddingFn);

  // Create builder
  const builder = new ClusterResearchContextBuilder({
    seoQueryManager,
    freshnessThreshold: 0.3,
    verbose: true,
  });

  // Build context for a cluster
  const context = await builder.buildContext({
    clusterId: 'cluster-123',
    primaryTopic: 'best running shoes',
    niche: 'running_gear',
    competitorDomains: ['runnersworld.com', 'runrepeat.com', 'solereview.com'],
  });

  console.log('Cluster Research Context:', context);
  console.log('Cache Completeness:', `${(context.cacheStatus.overallCompleteness * 100).toFixed(1)}%`);
  console.log('Estimated Savings:', `$${context.estimatedSavings.costSavedUSD.toFixed(2)}`);
  console.log('Research Gaps:', context.researchGaps.length);
}

/**
 * Example 2: Check cache completeness
 */
async function exampleCheckCacheCompleteness() {
  const collections = new Map<string, VectorDB>();
  const embeddingFn = async (text: string) => new Float32Array(384);
  const seoQueryManager = new SEOQueryManager(collections, embeddingFn);

  const builder = new ClusterResearchContextBuilder({
    seoQueryManager,
  });

  // Check if cluster has sufficient cached research
  const completeness = await builder.checkCacheCompleteness('cluster-456', 'fitness');

  if (completeness >= 0.8) {
    console.log('Cluster has excellent cache coverage (>= 80%)');
  } else if (completeness >= 0.5) {
    console.log('Cluster has partial cache coverage (50-80%)');
  } else {
    console.log('Cluster needs significant research');
  }
}

/**
 * Example 3: Identify research gaps
 */
async function exampleIdentifyResearchGaps() {
  const collections = new Map<string, VectorDB>();
  const embeddingFn = async (text: string) => new Float32Array(384);
  const seoQueryManager = new SEOQueryManager(collections, embeddingFn);

  const builder = new ClusterResearchContextBuilder({
    seoQueryManager,
  });

  // Get research gaps for a cluster
  const gaps = await builder.getResearchGaps('cluster-789', 'technology');

  // Prioritize high-priority gaps
  const highPriorityGaps = gaps.filter((gap) => gap.priority === 'high');

  console.log(`Total gaps: ${gaps.length}`);
  console.log(`High priority: ${highPriorityGaps.length}`);

  for (const gap of highPriorityGaps) {
    console.log(`- ${gap.type}: ${gap.description} ($${gap.estimatedCost.toFixed(2)})`);
  }
}

/**
 * Example 4: Cross-niche intelligence
 */
async function exampleCrossNicheIntelligence() {
  const collections = new Map<string, VectorDB>();
  const embeddingFn = async (text: string) => new Float32Array(384);
  const seoQueryManager = new SEOQueryManager(collections, embeddingFn);

  const builder = new ClusterResearchContextBuilder({
    seoQueryManager,
    maxExperts: 30,
    maxStatistics: 50,
  });

  // Query with cross-niche enabled
  const context = await builder.buildContext({
    clusterId: 'cluster-cross-1',
    primaryTopic: 'best yoga mats',
    niche: 'yoga_equipment',
    parentNiche: 'fitness',
    includeCrossNiche: true,
  });

  console.log('Expert sources found:', context.expertSources.length);
  console.log('Statistics found:', context.statistics.length);
  console.log('Content patterns:', context.contentPatterns.length);
}

/**
 * Example 5: Calculate savings from cache hits
 */
async function exampleCalculateSavings() {
  const collections = new Map<string, VectorDB>();
  const embeddingFn = async (text: string) => new Float32Array(384);
  const seoQueryManager = new SEOQueryManager(collections, embeddingFn);

  const builder = new ClusterResearchContextBuilder({
    seoQueryManager,
  });

  const context = await builder.buildContext({
    clusterId: 'cluster-savings',
    primaryTopic: 'best protein powder',
    niche: 'supplements',
    competitorDomains: [
      'examine.com',
      'labdoor.com',
      'bodybuilding.com',
      'myprotein.com',
    ],
  });

  const savings = context.estimatedSavings;

  console.log('Estimated Savings:');
  console.log(`- API calls saved: ${savings.apiCallsSaved}`);
  console.log(`- Time saved: ${savings.timeSavedMinutes} minutes`);
  console.log(`- Cost saved: $${savings.costSavedUSD.toFixed(2)}`);

  // Calculate ROI
  const totalResearchTime = 120; // minutes for full research
  const roi = (savings.timeSavedMinutes / totalResearchTime) * 100;
  console.log(`- Time savings ROI: ${roi.toFixed(1)}%`);
}

/**
 * Example 6: Detailed cache status analysis
 */
async function exampleCacheStatusAnalysis() {
  const collections = new Map<string, VectorDB>();
  const embeddingFn = async (text: string) => new Float32Array(384);
  const seoQueryManager = new SEOQueryManager(collections, embeddingFn);

  const builder = new ClusterResearchContextBuilder({
    seoQueryManager,
  });

  const context = await builder.buildContext({
    clusterId: 'cluster-status',
    primaryTopic: 'best noise cancelling headphones',
    niche: 'audio_equipment',
  });

  const status = context.cacheStatus;

  console.log('Cache Status Summary:');
  console.log(`- Keyword Research: ${status.keywordResearch}`);
  console.log(`- Competitor Count: ${status.competitorCount}`);
  console.log(`- SERP Patterns: ${status.serpPatterns}`);
  console.log(`- Expert Sources: ${status.expertCount}`);
  console.log(`- Statistics: ${status.statisticCount}`);
  console.log(`- Content Patterns: ${status.patternCount}`);
  console.log(`- Overall Completeness: ${(status.overallCompleteness * 100).toFixed(1)}%`);

  // Breakdown by freshness
  if (context.keywordResearch) {
    const kr = context.keywordResearch;
    console.log(`\nKeyword Research:`);
    console.log(`- Status: ${kr.cacheStatus}`);
    console.log(`- Freshness: ${(kr.freshness * 100).toFixed(1)}%`);
  }

  for (const comp of context.competitorIntelligence) {
    console.log(`\nCompetitor: ${comp.domain}`);
    console.log(`- Status: ${comp.cacheStatus}`);
    console.log(`- Freshness: ${(comp.freshness * 100).toFixed(1)}%`);
  }
}

// Export examples
export {
  exampleBasicClusterContext,
  exampleCheckCacheCompleteness,
  exampleIdentifyResearchGaps,
  exampleCrossNicheIntelligence,
  exampleCalculateSavings,
  exampleCacheStatusAnalysis,
};
