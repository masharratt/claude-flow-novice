/**
 * ResearchService Example Usage
 *
 * @module planning/seo/lib/example-usage
 * @description Demonstrates ResearchService integration patterns for SEO Intelligence
 */

import {
  ResearchService,
  searchSerp,
  fetchContent,
  hybridResearch,
} from './research-service';
import { ResearchQuery, ResearchResult } from '../types/research';

/**
 * Example 1: Basic SERP query
 */
async function exampleSerpQuery() {
  console.log('\n=== Example 1: SERP Query ===');

  const result = await searchSerp('best keyword research tools 2025', {
    maxResults: 10,
    priority: 'normal',
  });

  console.log(`Query: ${result.query.query}`);
  console.log(`Results: ${result.metadata.resultCount}`);
  console.log(`Execution time: ${result.metadata.executionTime}ms`);
  console.log(`From cache: ${result.metadata.fromCache}`);

  if (result.serpResults) {
    console.log('\nTop 3 results:');
    result.serpResults.slice(0, 3).forEach((serp) => {
      console.log(`  ${serp.position}. ${serp.title}`);
      console.log(`     ${serp.url}`);
    });
  }
}

/**
 * Example 2: Content fetch with metadata extraction
 */
async function exampleContentFetch() {
  console.log('\n=== Example 2: Content Fetch ===');

  const result = await fetchContent('https://example.com/seo-guide', {
    deepCrawl: false,
    priority: 'high',
  });

  if (result.contentResults && result.contentResults[0]) {
    const content = result.contentResults[0];
    console.log(`URL: ${content.url}`);
    console.log(`Title: ${content.title}`);
    console.log(`Word count: ${content.metadata.wordCount}`);
    console.log(`Headings: H1=${content.metadata.headings.h1}, H2=${content.metadata.headings.h2}, H3=${content.metadata.headings.h3}`);
    console.log(`Internal links: ${content.metadata.internalLinks}`);
    console.log(`Images: ${content.metadata.images}`);

    if (content.metadata.schema && content.metadata.schema.length > 0) {
      console.log(`Schema types: ${content.metadata.schema.join(', ')}`);
    }
  }
}

/**
 * Example 3: Hybrid query (SERP + content)
 */
async function exampleHybridQuery() {
  console.log('\n=== Example 3: Hybrid Query ===');

  const result = await hybridResearch(
    'content marketing strategy',
    'https://competitor.com/content-guide',
    {
      maxResults: 5,
      deepCrawl: false,
      priority: 'normal',
    }
  );

  console.log(`Query: ${result.query.query}`);
  console.log(`Total results: ${result.metadata.resultCount}`);
  console.log(`SERP results: ${result.serpResults?.length || 0}`);
  console.log(`Content results: ${result.contentResults?.length || 0}`);
}

/**
 * Example 4: Custom ResearchService with configuration
 */
async function exampleCustomService() {
  console.log('\n=== Example 4: Custom Service ===');

  const service = new ResearchService({
    verbose: true, // Enable logging
    timeout: 30000, // 30 second timeout
  });

  const query: ResearchQuery = {
    query: 'technical seo checklist',
    type: 'serp',
    options: {
      maxResults: 15,
      priority: 'high',
      cacheTtl: 3600, // 1 hour cache TTL
    },
    correlationId: 'task-12345',
  };

  const result = await service.execute(query);

  console.log(`Correlation ID: ${result.query.correlationId}`);
  console.log(`Cache key: ${result.metadata.cacheKey}`);

  // Get service statistics
  const cacheStats = await service.getCacheStats();
  const rateLimitStats = service.getRateLimiterStats();

  console.log('\nCache statistics:');
  console.log(`  Hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`);
  console.log(`  Total entries: ${cacheStats.totalEntries}`);
  console.log(`  Cache size: ${(cacheStats.sizeBytes / 1024 / 1024).toFixed(2)} MB`);

  console.log('\nRate limiter statistics:');
  console.log(`  WebSearch tokens: ${rateLimitStats.websearch.currentTokens}`);
  console.log(`  WebSearch queue: ${rateLimitStats.websearch.queueLength}`);
  console.log(`  WebFetch tokens: ${rateLimitStats.webfetch.currentTokens}`);
  console.log(`  WebFetch queue: ${rateLimitStats.webfetch.queueLength}`);
}

/**
 * Example 5: SEO pipeline integration pattern
 */
async function exampleSEOPipelineIntegration() {
  console.log('\n=== Example 5: SEO Pipeline Integration ===');

  const taskId = 'seo-task-12345';
  const targetKeyword = 'seo automation tools';

  // Step 1: SERP analysis
  const serpResults = await searchSerp(targetKeyword, { maxResults: 10 });

  console.log(`Step 1: Analyzed ${serpResults.serpResults?.length || 0} SERP results`);

  // Step 2: Competitor content analysis
  const topCompetitorUrl = serpResults.serpResults?.[0]?.url;

  if (topCompetitorUrl) {
    const competitorContent = await fetchContent(topCompetitorUrl, { deepCrawl: false });

    if (competitorContent.contentResults?.[0]) {
      const content = competitorContent.contentResults[0];
      console.log(`Step 2: Analyzed competitor content (${content.metadata.wordCount} words)`);

      // Extract insights for pipeline context
      const insights = {
        taskId,
        keyword: targetKeyword,
        topCompetitor: {
          url: content.url,
          wordCount: content.metadata.wordCount,
          headingStructure: content.metadata.headings,
          internalLinks: content.metadata.internalLinks,
          schema: content.metadata.schema,
        },
        serpPositions: serpResults.serpResults?.map((s) => ({
          position: s.position,
          url: s.url,
          title: s.title,
        })),
      };

      console.log('\nPipeline context insights:');
      console.log(JSON.stringify(insights, null, 2));

      // In production, store in Redis:
      // await redis.set(`cfn:seo:task:${taskId}:insights`, JSON.stringify(insights), 'EX', 3600);
    }
  }
}

/**
 * Example 6: Cache management
 */
async function exampleCacheManagement() {
  console.log('\n=== Example 6: Cache Management ===');

  const service = new ResearchService();

  // Query with caching
  console.log('First query (cache miss):');
  const result1 = await searchSerp('link building strategies');
  console.log(`  From cache: ${result1.metadata.fromCache}`);
  console.log(`  Execution time: ${result1.metadata.executionTime}ms`);

  // Same query (cache hit)
  console.log('\nSecond query (cache hit):');
  const result2 = await searchSerp('link building strategies');
  console.log(`  From cache: ${result2.metadata.fromCache}`);
  console.log(`  Execution time: ${result2.metadata.executionTime}ms`);

  // Invalidate specific pattern
  console.log('\nInvalidating cache entries with "link building"...');
  const invalidatedCount = await service.invalidateCacheByPattern('link building');
  console.log(`  Invalidated ${invalidatedCount} entries`);

  // Query again (cache miss)
  console.log('\nThird query (cache miss after invalidation):');
  const result3 = await searchSerp('link building strategies');
  console.log(`  From cache: ${result3.metadata.fromCache}`);

  // Clear entire cache
  console.log('\nClearing entire cache...');
  await service.clearCache();
  console.log('  Cache cleared');

  const stats = await service.getCacheStats();
  console.log(`  Total entries: ${stats.totalEntries}`);
}

/**
 * Example 7: Error handling
 */
async function exampleErrorHandling() {
  console.log('\n=== Example 7: Error Handling ===');

  const service = new ResearchService();

  // Invalid query type
  try {
    await service.execute({
      query: 'test',
      type: 'invalid' as any,
    });
  } catch (error: any) {
    console.log(`Error 1: ${error.code} - ${error.message}`);
  }

  // Missing targetUrl for content query
  try {
    await service.execute({
      query: 'test',
      type: 'content',
    });
  } catch (error: any) {
    console.log(`Error 2: ${error.code} - ${error.message}`);
  }

  // Invalid maxResults
  try {
    await service.execute({
      query: 'test',
      type: 'serp',
      options: { maxResults: -1 },
    });
  } catch (error: any) {
    console.log(`Error 3: ${error.code} - ${error.message}`);
  }
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('ResearchService Usage Examples');
  console.log('===============================');

  try {
    await exampleSerpQuery();
    await exampleContentFetch();
    await exampleHybridQuery();
    await exampleCustomService();
    await exampleSEOPipelineIntegration();
    await exampleCacheManagement();
    await exampleErrorHandling();

    console.log('\n✓ All examples completed successfully');
  } catch (error) {
    console.error('\n✗ Example failed:', error);
    throw error;
  }
}

// Run examples if executed directly
if (require.main === module) {
  runExamples().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  exampleSerpQuery,
  exampleContentFetch,
  exampleHybridQuery,
  exampleCustomService,
  exampleSEOPipelineIntegration,
  exampleCacheManagement,
  exampleErrorHandling,
  runExamples,
};
