/**
 * ResearchService Usage Examples
 *
 * @module planning/seo/examples/research-usage
 * @description Executable examples demonstrating WebSearch/WebFetch integration patterns
 * @see planning/seo/docs/RESEARCH_INTEGRATION_PATTERNS.md
 */

import { ResearchQuery, ResearchResult, SerpResult, ContentResult } from '../types/research';

// ============================================================================
// Example 1: SERP Data Extraction
// ============================================================================

/**
 * Extract SERP data for keyword analysis
 * Use Case: Phase 2 - SERP pattern analysis
 */
async function example1_SerpDataExtraction() {
  console.log('\n=== Example 1: SERP Data Extraction ===\n');

  const keyword = 'automation tools comparison';

  // Execute SERP extraction
  const serpData = await extractSerpData(keyword, {
    maxResults: 10,
    excludeDomains: ['ads.google.com'], // Filter out ads
  });

  console.log(`Extracted ${serpData.length} SERP results for "${keyword}"`);
  console.log('\nTop 3 Results:');

  serpData.slice(0, 3).forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.title}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Position: ${result.position}`);
    console.log(`   Features: ${result.features?.join(', ') || 'none'}`);
  });

  // Store for pattern analysis (Phase 2)
  await storeSerpDataForAnalysis(serpData, {
    keyword,
    analysisType: 'competitor_identification',
  });

  return serpData;
}

/**
 * Mock implementation: Extract SERP data using WebSearch
 * Production: Replace with actual WebSearch MCP call
 */
async function extractSerpData(
  keyword: string,
  options: {
    maxResults?: number;
    excludeDomains?: string[];
  }
): Promise<SerpResult[]> {
  // Mock implementation for demonstration
  // Production: Call WebSearch MCP tool
  console.log(`[WebSearch] Querying: "${keyword}"`);
  console.log(`[WebSearch] Options:`, options);

  // Simulate API call
  await sleep(1000);

  // Return mock SERP data
  return [
    {
      title: 'Top 10 Automation Tools for 2025',
      url: 'https://example.com/automation-tools',
      description: 'Comprehensive comparison of automation tools...',
      position: 1,
      features: ['featured_snippet'],
    },
    {
      title: 'Zapier vs Make: Complete Comparison',
      url: 'https://competitor.com/zapier-vs-make',
      description: 'Side-by-side comparison of leading automation platforms...',
      position: 2,
      features: ['people_also_ask'],
    },
    {
      title: 'Best Automation Software | Reviews 2025',
      url: 'https://reviews.com/automation-software',
      description: 'Expert reviews and ratings for automation tools...',
      position: 3,
      features: [],
    },
  ];
}

async function storeSerpDataForAnalysis(data: SerpResult[], meta: any): Promise<void> {
  console.log(`\n[Storage] Storing ${data.length} SERP results for analysis`);
  console.log(`[Storage] Metadata:`, meta);
}

// ============================================================================
// Example 2: Competitor Content Analysis
// ============================================================================

/**
 * Analyze competitor page content
 * Use Case: Phase 2 - Competitor deep-dive
 */
async function example2_CompetitorContentAnalysis() {
  console.log('\n=== Example 2: Competitor Content Analysis ===\n');

  const competitorUrl = 'https://zapier.com/apps/slack/integrations';

  // Execute content analysis
  const analysis = await analyzeCompetitorContent(competitorUrl, 'full');

  console.log(`Analyzed: ${analysis.url}`);
  console.log(`\nContent Metrics:`);
  console.log(`  Title: ${analysis.title}`);
  console.log(`  Word Count: ${analysis.metadata.wordCount}`);
  console.log(`  Heading Structure:`);
  console.log(`    H1: ${analysis.metadata.headings.h1}`);
  console.log(`    H2: ${analysis.metadata.headings.h2}`);
  console.log(`    H3: ${analysis.metadata.headings.h3}`);
  console.log(`  Internal Links: ${analysis.metadata.internalLinks}`);
  console.log(`  External Links: ${analysis.metadata.externalLinks}`);
  console.log(`  Images: ${analysis.metadata.images}`);
  console.log(`  Schema Types: ${analysis.metadata.schema?.join(', ') || 'none'}`);

  // Extract replicable patterns
  const patterns = {
    avgWordCount: analysis.metadata.wordCount,
    headingStructure: analysis.metadata.headings,
    internalLinkDensity: analysis.metadata.internalLinks / analysis.metadata.wordCount,
    schemaTypes: analysis.metadata.schema,
  };

  console.log(`\nExtracted Patterns:`, patterns);

  // Store for pattern database
  await storeCompetitorPattern({
    competitor: 'zapier.com',
    url: competitorUrl,
    patterns,
    confidence: 0.85,
  });

  return analysis;
}

/**
 * Mock implementation: Analyze content using WebFetch
 * Production: Replace with actual WebFetch MCP call
 */
async function analyzeCompetitorContent(
  url: string,
  analysisType: 'structure' | 'metadata' | 'full'
): Promise<ContentResult> {
  console.log(`[WebFetch] Fetching: ${url}`);
  console.log(`[WebFetch] Analysis Type: ${analysisType}`);

  // Simulate API call
  await sleep(2000);

  // Return mock content analysis
  return {
    url,
    title: 'Slack + Zapier Integrations | Connect Your Apps',
    content: 'Full page content analysis would be here...',
    metadata: {
      wordCount: 1850,
      headings: { h1: 1, h2: 8, h3: 15 },
      internalLinks: 42,
      externalLinks: 5,
      images: 12,
      schema: ['SoftwareApplication', 'HowTo', 'FAQPage'],
    },
    statusCode: 200,
    fetchedAt: new Date(),
  };
}

async function storeCompetitorPattern(data: any): Promise<void> {
  console.log(`\n[Storage] Storing competitor pattern`);
  console.log(`[Storage] Data:`, data);
}

// ============================================================================
// Example 3: Hybrid Research (SERP + Content)
// ============================================================================

/**
 * Execute hybrid research: SERP data + top competitor content
 * Use Case: Phase 1 - Foundation knowledge gathering
 */
async function example3_HybridResearch() {
  console.log('\n=== Example 3: Hybrid Research ===\n');

  const query: ResearchQuery = {
    query: 'automation tools for small business',
    type: 'hybrid',
    options: {
      maxResults: 5,
      cacheTtl: 15 * 60, // 15 minutes
      priority: 'high',
    },
    correlationId: 'phase1-foundation-001',
  };

  console.log(`Executing hybrid research for: "${query.query}"`);

  const startTime = Date.now();

  // Step 1: Extract SERP data
  console.log('\nStep 1: Extracting SERP data...');
  const serpResults = await extractSerpData(query.query, {
    maxResults: query.options?.maxResults || 10,
  });

  // Step 2: Identify top competitors
  console.log('\nStep 2: Identifying top competitors...');
  const topCompetitors = serpResults
    .filter(r => r.position <= 3)
    .map(r => r.url);
  console.log(`  Found ${topCompetitors.length} top competitors`);

  // Step 3: Analyze competitor content
  console.log('\nStep 3: Analyzing competitor content...');
  const contentResults = await batchAnalyzeCompetitors(topCompetitors, {
    concurrency: 2,
    delayMs: 3000,
  });

  // Step 4: Build unified result
  const result: ResearchResult = {
    query,
    serpResults,
    contentResults,
    metadata: {
      resultCount: serpResults.length + contentResults.length,
      executionTime: Date.now() - startTime,
      fromCache: false,
    },
    timestamp: new Date(),
  };

  console.log(`\nHybrid Research Complete:`);
  console.log(`  SERP Results: ${result.serpResults?.length}`);
  console.log(`  Content Results: ${result.contentResults?.length}`);
  console.log(`  Execution Time: ${result.metadata.executionTime}ms`);

  // Extract patterns for global store
  const patterns = extractGlobalPatterns(result);
  console.log(`\nExtracted ${patterns.length} global patterns`);

  return result;
}

async function batchAnalyzeCompetitors(
  urls: string[],
  options: { concurrency: number; delayMs: number }
): Promise<ContentResult[]> {
  const results: ContentResult[] = [];

  for (let i = 0; i < urls.length; i += options.concurrency) {
    const batch = urls.slice(i, i + options.concurrency);
    console.log(`  Batch ${Math.floor(i / options.concurrency) + 1}: ${batch.length} URLs`);

    const batchResults = await Promise.all(
      batch.map(url => analyzeCompetitorContent(url, 'full'))
    );

    results.push(...batchResults);

    // Delay between batches
    if (i + options.concurrency < urls.length) {
      console.log(`  Waiting ${options.delayMs}ms before next batch...`);
      await sleep(options.delayMs);
    }
  }

  return results;
}

function extractGlobalPatterns(result: ResearchResult): any[] {
  // Mock pattern extraction
  return [
    { type: 'title_format', pattern: 'Year in title increases CTR', confidence: 0.85 },
    { type: 'structure', pattern: 'Table in first H2 section', confidence: 0.90 },
    { type: 'schema', pattern: 'FAQPage schema present on top 3', confidence: 0.95 },
  ];
}

// ============================================================================
// Example 4: Batch Research with Rate Limiting
// ============================================================================

/**
 * Process multiple queries with rate limiting
 * Use Case: Phase 1 - Populate knowledge store
 */
async function example4_BatchResearchWithRateLimiting() {
  console.log('\n=== Example 4: Batch Research with Rate Limiting ===\n');

  const queries: ResearchQuery[] = [
    { query: 'SEO content structure 2025', type: 'hybrid' },
    { query: 'featured snippet optimization', type: 'serp' },
    { query: 'internal linking strategies', type: 'hybrid' },
    { query: 'schema markup best practices', type: 'serp' },
    { query: 'content depth indicators', type: 'hybrid' },
  ];

  console.log(`Processing ${queries.length} queries with rate limiting...`);

  const results: ResearchResult[] = [];
  const errors: Array<{ query: string; error: Error }> = [];

  // Rate limit: 10 requests per minute
  const delayBetweenRequests = 6000; // 6 seconds

  for (const [index, query] of queries.entries()) {
    try {
      console.log(`\n[${index + 1}/${queries.length}] Processing: "${query.query}"`);

      // Execute research (cache-first)
      const result = await cacheFirstResearch(query);
      results.push(result);

      console.log(`  ✓ Success (${result.metadata.fromCache ? 'cached' : 'fresh'})`);

      // Rate limiting delay
      if (index < queries.length - 1) {
        console.log(`  Waiting ${delayBetweenRequests / 1000}s before next request...`);
        await sleep(delayBetweenRequests);
      }

    } catch (error) {
      console.log(`  ✗ Error: ${(error as Error).message}`);
      errors.push({ query: query.query, error: error as Error });
    }
  }

  console.log(`\n=== Batch Complete ===`);
  console.log(`Success: ${results.length}/${queries.length}`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\nError Details:`);
    errors.forEach(({ query, error }) => {
      console.log(`  - "${query}": ${error.message}`);
    });
  }

  return results;
}

async function cacheFirstResearch(query: ResearchQuery): Promise<ResearchResult> {
  const cacheKey = `research:${hashQuery(query.query)}`;

  // Check cache
  const cached = await getFromCache(cacheKey);
  if (cached) {
    console.log(`  [Cache] Hit`);
    return {
      ...cached,
      metadata: { ...cached.metadata, fromCache: true },
    };
  }

  console.log(`  [Cache] Miss - executing fresh research`);

  // Execute fresh research based on type
  let result: ResearchResult;
  if (query.type === 'serp') {
    const serpResults = await extractSerpData(query.query);
    result = {
      query,
      serpResults,
      metadata: { resultCount: serpResults.length, executionTime: 0, fromCache: false },
      timestamp: new Date(),
    };
  } else {
    // Hybrid (simplified for example)
    const serpResults = await extractSerpData(query.query, { maxResults: 3 });
    const topUrls = serpResults.slice(0, 2).map(r => r.url);
    const contentResults = await batchAnalyzeCompetitors(topUrls, { concurrency: 2, delayMs: 2000 });

    result = {
      query,
      serpResults,
      contentResults,
      metadata: {
        resultCount: serpResults.length + contentResults.length,
        executionTime: 0,
        fromCache: false
      },
      timestamp: new Date(),
    };
  }

  // Store in cache
  await setCache(cacheKey, result, { ttl: 15 * 60 });

  return result;
}

function hashQuery(query: string): string {
  // Simple hash for demo (use crypto.subtle in production)
  return Buffer.from(query).toString('base64').slice(0, 32);
}

// ============================================================================
// Example 5: Cache-First with Stale Fallback
// ============================================================================

/**
 * Robust research with fallback chain
 * Use Case: Production pipeline with high reliability requirements
 */
async function example5_CacheFirstWithFallback() {
  console.log('\n=== Example 5: Cache-First with Stale Fallback ===\n');

  const query: ResearchQuery = {
    query: 'automation best practices',
    type: 'hybrid',
  };

  console.log(`Executing robust research for: "${query.query}"`);

  const strategies = [
    { name: 'Cache-first (fresh)', fn: () => cacheFirstResearch(query) },
    { name: 'Stale cache', fn: () => fallbackToStaleCache(query) },
    { name: 'Alternative source', fn: () => fallbackToAlternativeSource(query) },
  ];

  for (const [index, strategy] of strategies.entries()) {
    try {
      console.log(`\nTrying strategy ${index + 1}: ${strategy.name}`);
      const result = await strategy.fn();

      console.log(`✓ Success via ${strategy.name}`);
      console.log(`  Results: ${result.metadata.resultCount}`);
      console.log(`  From cache: ${result.metadata.fromCache}`);

      return result;

    } catch (error) {
      console.log(`✗ Failed: ${(error as Error).message}`);

      if (index < strategies.length - 1) {
        console.log(`  Trying next strategy...`);
      }
    }
  }

  throw new Error('All fallback strategies exhausted');
}

async function fallbackToStaleCache(query: ResearchQuery): Promise<ResearchResult> {
  const cacheKey = `research:${hashQuery(query.query)}`;
  const stale = await getFromCache(cacheKey, { allowStale: true });

  if (!stale) {
    throw new Error('No stale cache available');
  }

  console.log(`  Using stale cache (age: ${getAge(stale)}s)`);

  return {
    ...stale,
    metadata: { ...stale.metadata, fromCache: true, cacheKey: `${cacheKey}:stale` },
  };
}

async function fallbackToAlternativeSource(query: ResearchQuery): Promise<ResearchResult> {
  console.log(`  Querying local knowledge base...`);

  // Mock: Query similar results from local DB
  const similar = {
    id: 'alt-001',
    similarity: 0.85,
    result: {
      query,
      serpResults: [],
      metadata: { resultCount: 0, executionTime: 0, fromCache: false, cacheKey: 'alternative:alt-001' },
      timestamp: new Date(),
    },
  };

  console.log(`  Found similar result (similarity: ${similar.similarity})`);

  return similar.result;
}

function getAge(cached: any): number {
  return Math.floor((Date.now() - new Date(cached.timestamp).getTime()) / 1000);
}

// ============================================================================
// Mock Cache Implementation
// ============================================================================

const mockCache = new Map<string, any>();

async function getFromCache(
  key: string,
  options: { allowStale?: boolean } = {}
): Promise<any> {
  const cached = mockCache.get(key);

  if (!cached) return null;

  const age = Date.now() - cached.createdAt;
  const ttl = cached.ttl || 15 * 60 * 1000; // 15 minutes default

  if (age > ttl && !options.allowStale) {
    return null; // Expired
  }

  return cached.data;
}

async function setCache(
  key: string,
  data: any,
  options: { ttl?: number } = {}
): Promise<void> {
  mockCache.set(key, {
    data,
    createdAt: Date.now(),
    ttl: (options.ttl || 15 * 60) * 1000,
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Main Execution
// ============================================================================

async function runAllExamples() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ResearchService Usage Examples                           ║');
  console.log('║  SEO Intelligence Integration - Phase 1 Sprint 1          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await example1_SerpDataExtraction();
    await example2_CompetitorContentAnalysis();
    await example3_HybridResearch();
    await example4_BatchResearchWithRateLimiting();
    await example5_CacheFirstWithFallback();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  ✓ All Examples Completed Successfully                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n✗ Example execution failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}

// Export for use in other modules
export {
  example1_SerpDataExtraction,
  example2_CompetitorContentAnalysis,
  example3_HybridResearch,
  example4_BatchResearchWithRateLimiting,
  example5_CacheFirstWithFallback,
};
