# WebSearch/WebFetch Integration Patterns for ResearchService

**Document Version:** 1.0.0
**Created:** 2025-11-30
**Epic:** SEO Intelligence Integration - Phase 1 Sprint 1
**Status:** Foundation Layer

---

## Executive Summary

This document provides integration patterns for Claude Code's WebSearch and WebFetch MCP tools within the SEO Intelligence ResearchService. These patterns enable SERP data extraction, competitor content analysis, and batch research workflows required for the intelligence system's foundation layer.

**Key Capabilities:**
- SERP data extraction for pattern analysis
- Competitor content deep-dive with normalization
- Rate-limited batch research
- Cache-first strategies for cost optimization
- Error handling with graceful fallbacks

**Target Use Cases:**
- Phase 1: Foundation knowledge store population
- Phase 2: Competitor and SERP pattern analysis
- Phase 3: Intelligence pattern validation
- Phase 4+: Cross-domain pattern discovery

---

## Part 1: Tool Analysis

### 1.1 WebSearch Tool Capabilities

**Purpose:** Fetches web search results and processes them using an AI model.

**Tool Signature:**
```typescript
interface WebSearchParams {
  query: string;              // Search query
  allowed_domains?: string[]; // Domain whitelist
  blocked_domains?: string[]; // Domain blacklist
}

interface WebSearchResult {
  // Search result blocks with links as markdown
  // Results formatted by AI processing
}
```

**Key Features:**
1. **Query Execution:** Performs web searches with domain filtering
2. **AI Processing:** Content processed through a small, fast model
3. **Result Formatting:** Returns markdown-formatted search results
4. **Domain Control:** Supports allowlist and blocklist filtering
5. **Caching:** 15-minute self-cleaning cache for repeated queries

**Limitations:**
1. **Geographic Scope:** US-only availability
2. **Rate Limits:** Not explicitly documented (testing required)
3. **Result Format:** AI-summarized, not raw SERP data
4. **Domain Filtering:** Must specify domains for targeted searches

**SEO Research Fit:**
- ✅ Broad keyword research
- ✅ Content topic discovery
- ✅ Competitor identification
- ❌ Precise SERP position data (AI-processed)
- ⚠️ SERP feature detection (depends on AI summary)

---

### 1.2 WebFetch Tool Capabilities

**Purpose:** Fetches and processes content from specified URLs using an AI model.

**Tool Signature:**
```typescript
interface WebFetchParams {
  url: string;     // Target URL (fully-formed, HTTP auto-upgraded to HTTPS)
  prompt: string;  // Extraction/analysis prompt for AI
}

interface WebFetchResult {
  // AI-processed content based on prompt
  // May indicate redirects requiring follow-up fetch
}
```

**Key Features:**
1. **Content Fetching:** Retrieves HTML and converts to markdown
2. **AI Analysis:** Processes content with custom prompts
3. **Redirect Handling:** Detects and reports cross-host redirects
4. **Protocol Upgrade:** Auto-upgrades HTTP to HTTPS
5. **Caching:** 15-minute cache for repeated fetches

**Limitations:**
1. **Read-Only:** Cannot modify content or files
2. **Redirect Behavior:** Cross-host redirects require manual follow-up
3. **Summarization:** Results may be summarized for large content
4. **Prompt Dependency:** Quality depends on prompt engineering

**SEO Research Fit:**
- ✅ Competitor page analysis
- ✅ Content structure extraction
- ✅ Metadata harvesting
- ✅ Schema markup detection
- ⚠️ Page speed metrics (not directly available)
- ❌ JavaScript-rendered content (may be incomplete)

---

### 1.3 Tool Comparison Matrix

| Feature | WebSearch | WebFetch | Best For |
|---------|-----------|----------|----------|
| **SERP Data** | AI-summarized | N/A | Keyword research |
| **Content Extraction** | Snippets | Full page | Deep content analysis |
| **Domain Filtering** | ✅ Yes | N/A | Competitor targeting |
| **Prompt Control** | Limited | ✅ Full | Custom extraction |
| **Rate Limits** | TBD | TBD | Testing required |
| **Caching** | 15 min | 15 min | Cost optimization |
| **Redirect Handling** | Auto | Manual | URL validation |
| **Geographic Scope** | US only | Global | International SEO |

**Decision Logic:**
```typescript
function selectTool(researchType: ResearchType): Tool {
  switch (researchType) {
    case 'serp':
      return 'WebSearch'; // Keyword research, SERP overview
    case 'content':
      return 'WebFetch';  // Competitor page analysis
    case 'hybrid':
      return 'Both';      // Full intelligence gathering
  }
}
```

---

## Part 2: Integration Patterns

### 2.1 SERP Data Extraction Pattern

**Use Case:** Extract ranking data, SERP features, and competitor URLs for pattern analysis.

**Implementation:**
```typescript
import { WebSearchParams, SerpResult } from '../types/research';

/**
 * Extract SERP data for keyword analysis
 *
 * @param keyword - Target keyword
 * @param options - Search configuration
 * @returns Normalized SERP results
 */
async function extractSerpData(
  keyword: string,
  options: {
    maxResults?: number;
    targetDomain?: string;
    excludeDomains?: string[];
  } = {}
): Promise<SerpResult[]> {
  const { maxResults = 10, targetDomain, excludeDomains = [] } = options;

  // Construct WebSearch query
  const searchParams: WebSearchParams = {
    query: keyword,
    ...(targetDomain && { allowed_domains: [targetDomain] }),
    ...(excludeDomains.length > 0 && { blocked_domains: excludeDomains }),
  };

  // Execute search via Claude Code MCP
  const results = await WebSearch(searchParams);

  // Parse and normalize results
  return parseSerpResults(results, maxResults);
}

/**
 * Parse AI-processed search results into structured SERP data
 */
function parseSerpResults(
  rawResults: string,
  maxResults: number
): SerpResult[] {
  const results: SerpResult[] = [];

  // Extract markdown links and descriptions
  // Format: [Title](URL)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  let position = 1;

  while ((match = linkRegex.exec(rawResults)) !== null && position <= maxResults) {
    const [, title, url] = match;

    // Extract description (text after link until next link or newline)
    const descStart = match.index + match[0].length;
    const nextLinkIndex = rawResults.indexOf('[', descStart);
    const descEnd = nextLinkIndex > -1
      ? Math.min(nextLinkIndex, rawResults.indexOf('\n\n', descStart))
      : rawResults.indexOf('\n\n', descStart);

    const description = rawResults
      .slice(descStart, descEnd > -1 ? descEnd : undefined)
      .trim();

    results.push({
      title,
      url: normalizeUrl(url),
      description,
      position,
      features: extractSerpFeatures(description),
    });

    position++;
  }

  return results;
}

/**
 * Normalize URL (handle redirects, clean params)
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove tracking parameters
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(param => {
      parsed.searchParams.delete(param);
    });
    return parsed.toString();
  } catch {
    return url; // Return as-is if invalid
  }
}

/**
 * Extract SERP features from description text
 */
function extractSerpFeatures(description: string): string[] {
  const features: string[] = [];

  const featurePatterns = {
    'featured_snippet': /featured snippet|answer box/i,
    'people_also_ask': /people also ask|related questions/i,
    'local_pack': /map|local|near me/i,
    'knowledge_panel': /knowledge panel|entity/i,
    'video': /video|youtube/i,
    'image': /image|gallery/i,
  };

  for (const [feature, pattern] of Object.entries(featurePatterns)) {
    if (pattern.test(description)) {
      features.push(feature);
    }
  }

  return features;
}
```

**Usage Example:**
```typescript
// Phase 2 Sprint: SERP pattern analysis
const serpData = await extractSerpData('automation tools comparison', {
  maxResults: 20,
  excludeDomains: ['ads.google.com'], // Remove ad results
});

// Store for pattern analysis
await storeSerpDataForAnalysis(serpData, {
  keyword: 'automation tools comparison',
  analysisType: 'competitor_identification',
});
```

**Caching Strategy:**
```typescript
// Leverage 15-minute cache for repeated queries
const cacheKey = `serp:${hashQuery(keyword)}`;
const cached = await getFromCache<SerpResult[]>(cacheKey);

if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
  return cached.data; // Use cached data
}

const fresh = await extractSerpData(keyword, options);
await setCache(cacheKey, fresh, { ttl: 15 * 60 }); // 15-minute TTL
return fresh;
```

**Error Handling:**
```typescript
try {
  const results = await extractSerpData(keyword, options);
  return { success: true, data: results };
} catch (error) {
  if (error.message.includes('rate limit')) {
    // Queue for retry
    return queueForRetry(keyword, options);
  }

  if (error.message.includes('unavailable')) {
    // Fall back to cached data or alternative source
    return fallbackToCache(keyword);
  }

  throw new ResearchError(
    `SERP extraction failed: ${error.message}`,
    ResearchErrorCode.FETCH_ERROR,
    { keyword, originalError: error }
  );
}
```

---

### 2.2 Competitor Content Analysis Pattern

**Use Case:** Deep-dive competitor page analysis for content strategy extraction.

**Implementation:**
```typescript
import { WebFetchParams, ContentResult } from '../types/research';

/**
 * Analyze competitor page content
 *
 * @param url - Competitor page URL
 * @param analysisType - Type of analysis to perform
 * @returns Structured content analysis
 */
async function analyzeCompetitorContent(
  url: string,
  analysisType: 'structure' | 'metadata' | 'full' = 'full'
): Promise<ContentResult> {
  // Construct analysis prompt based on type
  const prompt = buildAnalysisPrompt(analysisType);

  // Execute fetch via Claude Code MCP
  const fetchParams: WebFetchParams = {
    url: normalizeUrl(url),
    prompt,
  };

  const rawContent = await WebFetch(fetchParams);

  // Handle redirects
  if (isRedirectResponse(rawContent)) {
    const redirectUrl = extractRedirectUrl(rawContent);
    console.warn(`Redirect detected: ${url} -> ${redirectUrl}`);
    return analyzeCompetitorContent(redirectUrl, analysisType);
  }

  // Parse and normalize content
  return parseContentResult(rawContent, url);
}

/**
 * Build analysis prompt based on type
 */
function buildAnalysisPrompt(analysisType: string): string {
  const basePrompt = 'Extract and analyze the following from this page:';

  const prompts = {
    structure: `${basePrompt}
      1. Heading hierarchy (H1, H2, H3 tags and their text)
      2. Content sections and organization
      3. Word count estimate
      4. Internal link count and structure
      5. External link count`,

    metadata: `${basePrompt}
      1. Meta title and description
      2. Schema markup types present
      3. Open Graph tags
      4. Image count and alt text patterns
      5. Author information and E-E-A-T signals`,

    full: `${basePrompt}
      1. Full heading hierarchy with text
      2. Content sections and organization
      3. Word count estimate
      4. Internal and external link counts
      5. Meta title, description, and keywords
      6. Schema markup types
      7. Image count and alt patterns
      8. Author/expertise signals
      9. Content depth indicators (lists, tables, examples)
      10. Call-to-action placements`,
  };

  return prompts[analysisType] || prompts.full;
}

/**
 * Parse AI response into structured ContentResult
 */
function parseContentResult(
  rawContent: string,
  url: string
): ContentResult {
  // Extract structured data from AI response
  const title = extractField(rawContent, /title[:\s]+(.+)/i);
  const wordCount = extractNumber(rawContent, /word count[:\s]+(\d+)/i);
  const h1Count = extractNumber(rawContent, /h1[:\s]+(\d+)/i);
  const h2Count = extractNumber(rawContent, /h2[:\s]+(\d+)/i);
  const h3Count = extractNumber(rawContent, /h3[:\s]+(\d+)/i);
  const internalLinks = extractNumber(rawContent, /internal link[s]?[:\s]+(\d+)/i);
  const externalLinks = extractNumber(rawContent, /external link[s]?[:\s]+(\d+)/i);
  const images = extractNumber(rawContent, /image[s]?[:\s]+(\d+)/i);
  const schema = extractList(rawContent, /schema[:\s]+(.+)/i);

  return {
    url,
    title,
    content: rawContent, // Full AI analysis
    metadata: {
      wordCount,
      headings: { h1: h1Count, h2: h2Count, h3: h3Count },
      internalLinks,
      externalLinks,
      images,
      schema,
    },
    statusCode: 200, // Assume success if no error
    fetchedAt: new Date(),
  };
}

/**
 * Check if response indicates redirect
 */
function isRedirectResponse(content: string): boolean {
  return /redirect|moved|location/i.test(content.slice(0, 200));
}

/**
 * Extract redirect URL from response
 */
function extractRedirectUrl(content: string): string {
  const match = content.match(/(?:redirect|location)[:\s]+(.+)/i);
  return match?.[1]?.trim() || '';
}

// Helper extraction functions
function extractField(text: string, pattern: RegExp): string {
  return text.match(pattern)?.[1]?.trim() || '';
}

function extractNumber(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match ? parseInt(match[1], 10) : 0;
}

function extractList(text: string, pattern: RegExp): string[] {
  const match = text.match(pattern);
  if (!match) return [];
  return match[1].split(/[,;]/).map(s => s.trim()).filter(Boolean);
}
```

**Usage Example:**
```typescript
// Phase 2 Sprint: Competitor deep-dive
const competitorUrl = 'https://zapier.com/apps/slack/integrations';

const analysis = await analyzeCompetitorContent(competitorUrl, 'full');

// Extract replicable patterns
const patterns = {
  avgWordCount: analysis.metadata.wordCount,
  headingStructure: analysis.metadata.headings,
  internalLinkDensity: analysis.metadata.internalLinks / analysis.metadata.wordCount,
  schemaTypes: analysis.metadata.schema,
};

// Store for pattern database
await storeCompetitorPattern({
  competitor: 'zapier.com',
  url: competitorUrl,
  patterns,
  confidence: calculatePatternConfidence(analysis),
});
```

**Batch Processing Pattern:**
```typescript
/**
 * Analyze multiple competitor pages with rate limiting
 */
async function batchAnalyzeCompetitors(
  urls: string[],
  options: {
    concurrency?: number;
    delayMs?: number;
  } = {}
): Promise<ContentResult[]> {
  const { concurrency = 3, delayMs = 2000 } = options;
  const results: ContentResult[] = [];

  // Process in batches with delay
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(url =>
        analyzeCompetitorContent(url, 'full')
          .catch(error => {
            console.error(`Failed to analyze ${url}:`, error);
            return null; // Continue on error
          })
      )
    );

    results.push(...batchResults.filter(Boolean) as ContentResult[]);

    // Delay between batches (rate limiting)
    if (i + concurrency < urls.length) {
      await sleep(delayMs);
    }
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

### 2.3 Hybrid Research Pattern

**Use Case:** Combined SERP + content analysis for comprehensive intelligence gathering.

**Implementation:**
```typescript
import { ResearchQuery, ResearchResult } from '../types/research';

/**
 * Execute hybrid research: SERP data + top competitor content
 *
 * @param query - Research query configuration
 * @returns Unified research result
 */
async function executeHybridResearch(
  query: ResearchQuery
): Promise<ResearchResult> {
  const startTime = Date.now();

  // Step 1: Extract SERP data
  const serpResults = await extractSerpData(query.query, {
    maxResults: query.options?.maxResults || 10,
  });

  // Step 2: Identify top competitors (positions 1-3)
  const topCompetitors = serpResults
    .filter(r => r.position <= 3)
    .map(r => r.url);

  // Step 3: Analyze competitor content (rate-limited)
  const contentResults = await batchAnalyzeCompetitors(topCompetitors, {
    concurrency: 2, // Conservative for initial requests
    delayMs: 3000,  // 3-second delay between batches
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
      cacheKey: `hybrid:${hashQuery(query.query)}`,
    },
    timestamp: new Date(),
  };

  // Step 5: Cache for 15 minutes
  await cacheResearchResult(result);

  return result;
}

/**
 * Cache research result with TTL
 */
async function cacheResearchResult(
  result: ResearchResult
): Promise<void> {
  const cacheKey = result.metadata.cacheKey;
  if (!cacheKey) return;

  await setCache(cacheKey, result, {
    ttl: 15 * 60, // 15-minute TTL (matches tool cache)
  });
}

/**
 * Hash query for cache key generation
 */
function hashQuery(query: string): string {
  // Simple hash for cache keys (use crypto in production)
  return Buffer.from(query).toString('base64').slice(0, 32);
}
```

**Usage Example:**
```typescript
// Phase 1 Sprint: Foundation knowledge gathering
const researchQuery: ResearchQuery = {
  query: 'automation tools for small business',
  type: 'hybrid',
  options: {
    maxResults: 10,
    cacheTtl: 15 * 60, // 15 minutes
    priority: 'high',
  },
  correlationId: 'seo-intelligence-phase1-001',
};

const result = await executeHybridResearch(researchQuery);

// Extract patterns for global store
const patterns = extractGlobalPatterns(result);

// Store in knowledge base
await storeInKnowledgeBase({
  category: 'content-patterns',
  subcategory: 'structure',
  patterns,
  source: 'hybrid-research',
  confidence: calculateConfidence(result),
});
```

---

### 2.4 Cache-First Strategy Pattern

**Use Case:** Minimize API calls and cost through intelligent caching.

**Implementation:**
```typescript
/**
 * Cache-first research execution
 *
 * Attempts cache retrieval before executing fresh research
 */
async function cacheFirstResearch(
  query: ResearchQuery
): Promise<ResearchResult> {
  const cacheKey = generateCacheKey(query);

  // Attempt cache retrieval
  const cached = await getFromCache<ResearchResult>(cacheKey);

  if (cached && isCacheValid(cached, query)) {
    console.log(`Cache hit: ${cacheKey}`);
    return {
      ...cached.data,
      metadata: {
        ...cached.data.metadata,
        fromCache: true,
      },
    };
  }

  console.log(`Cache miss: ${cacheKey}`);

  // Execute fresh research
  const fresh = await executeResearch(query);

  // Store in cache
  await setCache(cacheKey, fresh, {
    ttl: query.options?.cacheTtl || 15 * 60,
  });

  return fresh;
}

/**
 * Generate consistent cache key from query
 */
function generateCacheKey(query: ResearchQuery): string {
  const parts = [
    query.type,
    query.query,
    query.options?.maxResults || 'default',
    query.options?.targetUrl || '',
  ];
  return `research:${hashQuery(parts.join(':'))}`;
}

/**
 * Validate cache entry freshness and relevance
 */
function isCacheValid(
  cached: CacheEntry<ResearchResult>,
  query: ResearchQuery
): boolean {
  // Check expiration
  if (Date.now() > cached.expiresAt.getTime()) {
    return false;
  }

  // Check custom TTL override
  if (query.options?.cacheTtl) {
    const age = Date.now() - cached.createdAt.getTime();
    if (age > query.options.cacheTtl * 1000) {
      return false;
    }
  }

  return true;
}

/**
 * Execute research based on query type
 */
async function executeResearch(
  query: ResearchQuery
): Promise<ResearchResult> {
  switch (query.type) {
    case 'serp':
      return executeSerpResearch(query);
    case 'content':
      return executeContentResearch(query);
    case 'hybrid':
      return executeHybridResearch(query);
    default:
      throw new ResearchError(
        `Invalid query type: ${query.type}`,
        ResearchErrorCode.INVALID_QUERY
      );
  }
}

async function executeSerpResearch(query: ResearchQuery): Promise<ResearchResult> {
  const serpResults = await extractSerpData(query.query, query.options);
  return {
    query,
    serpResults,
    metadata: {
      resultCount: serpResults.length,
      executionTime: 0, // Set by wrapper
      fromCache: false,
    },
    timestamp: new Date(),
  };
}

async function executeContentResearch(query: ResearchQuery): Promise<ResearchResult> {
  if (!query.options?.targetUrl) {
    throw new ResearchError(
      'targetUrl required for content research',
      ResearchErrorCode.INVALID_QUERY
    );
  }

  const contentResults = [
    await analyzeCompetitorContent(query.options.targetUrl, 'full')
  ];

  return {
    query,
    contentResults,
    metadata: {
      resultCount: contentResults.length,
      executionTime: 0,
      fromCache: false,
    },
    timestamp: new Date(),
  };
}
```

**Cache Performance Optimization:**
```typescript
/**
 * Warm cache with common queries
 */
async function warmCache(queries: ResearchQuery[]): Promise<void> {
  console.log(`Warming cache for ${queries.length} queries...`);

  for (const query of queries) {
    try {
      await cacheFirstResearch(query);
      await sleep(2000); // Rate limiting
    } catch (error) {
      console.error(`Failed to warm cache for ${query.query}:`, error);
    }
  }

  console.log('Cache warming complete');
}

// Usage: Warm cache with Phase 1 foundation queries
const foundationQueries: ResearchQuery[] = [
  { query: 'automation tools comparison', type: 'hybrid' },
  { query: 'productivity software reviews', type: 'hybrid' },
  { query: 'workflow automation best practices', type: 'serp' },
];

await warmCache(foundationQueries);
```

---

## Part 3: Error Handling and Fallback Strategies

### 3.1 Rate Limit Handling

**Pattern:**
```typescript
class RateLimitHandler {
  private queue: QueuedRequest[] = [];
  private processing = false;

  async handleRateLimit(
    query: ResearchQuery,
    error: Error
  ): Promise<ResearchResult> {
    // Extract retry-after from error if available
    const retryAfter = this.extractRetryAfter(error);

    // Queue request
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: generateId(),
        query,
        queuedAt: new Date(),
        priority: query.options?.priority || 'normal',
        retries: 0,
        maxRetries: 3,
        resolve,
        reject,
      });

      // Sort by priority
      this.queue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Start processing if not already running
      if (!this.processing) {
        this.processQueue(retryAfter);
      }
    });
  }

  private async processQueue(delayMs: number = 60000): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      await sleep(delayMs);

      const request = this.queue.shift();
      if (!request) break;

      try {
        const result = await executeResearch(request.query);
        request.resolve(result);
      } catch (error) {
        if (this.isRateLimitError(error) && request.retries < request.maxRetries) {
          request.retries++;
          this.queue.unshift(request); // Retry
          continue;
        }
        request.reject(error);
      }
    }

    this.processing = false;
  }

  private extractRetryAfter(error: Error): number {
    // Parse retry-after header or default to 60s
    const match = error.message.match(/retry after (\d+)/i);
    return match ? parseInt(match[1], 10) * 1000 : 60000;
  }

  private isRateLimitError(error: unknown): boolean {
    return error instanceof ResearchError &&
           error.code === ResearchErrorCode.RATE_LIMIT_EXCEEDED;
  }
}

const rateLimitHandler = new RateLimitHandler();

// Usage in research function
try {
  return await executeResearch(query);
} catch (error) {
  if (error.code === ResearchErrorCode.RATE_LIMIT_EXCEEDED) {
    return rateLimitHandler.handleRateLimit(query, error);
  }
  throw error;
}
```

---

### 3.2 Fallback Strategy

**Pattern:**
```typescript
/**
 * Execute research with fallback chain
 */
async function researchWithFallback(
  query: ResearchQuery
): Promise<ResearchResult> {
  const strategies = [
    () => cacheFirstResearch(query),           // Primary: Cache-first
    () => executeResearch(query),              // Secondary: Direct API
    () => fallbackToStaleCache(query),         // Tertiary: Stale cache
    () => fallbackToAlternativeSource(query),  // Quaternary: Alternative
  ];

  let lastError: Error | null = null;

  for (const [index, strategy] of strategies.entries()) {
    try {
      const result = await strategy();
      if (index > 0) {
        console.warn(`Fallback strategy ${index} succeeded for ${query.query}`);
      }
      return result;
    } catch (error) {
      console.error(`Strategy ${index} failed:`, error);
      lastError = error as Error;

      // Wait before next strategy (exponential backoff)
      if (index < strategies.length - 1) {
        await sleep(Math.pow(2, index) * 1000);
      }
    }
  }

  // All strategies failed
  throw new ResearchError(
    `All fallback strategies exhausted for query: ${query.query}`,
    ResearchErrorCode.UNKNOWN_ERROR,
    { originalError: lastError }
  );
}

/**
 * Fallback to stale cache (expired but available)
 */
async function fallbackToStaleCache(
  query: ResearchQuery
): Promise<ResearchResult> {
  const cacheKey = generateCacheKey(query);
  const stale = await getFromCache<ResearchResult>(cacheKey, { allowStale: true });

  if (!stale) {
    throw new ResearchError(
      'No stale cache available',
      ResearchErrorCode.CACHE_ERROR
    );
  }

  console.warn(`Using stale cache for ${query.query} (age: ${getAge(stale)} seconds)`);

  return {
    ...stale.data,
    metadata: {
      ...stale.data.metadata,
      fromCache: true,
      cacheKey: `${cacheKey}:stale`,
    },
  };
}

/**
 * Fallback to alternative data source (local DB, previous results)
 */
async function fallbackToAlternativeSource(
  query: ResearchQuery
): Promise<ResearchResult> {
  // Query local knowledge base for similar past results
  const similar = await querySimilarResults(query.query);

  if (!similar) {
    throw new ResearchError(
      'No alternative source available',
      ResearchErrorCode.UNKNOWN_ERROR
    );
  }

  console.warn(`Using alternative source for ${query.query} (similarity: ${similar.similarity})`);

  return {
    ...similar.result,
    metadata: {
      ...similar.result.metadata,
      fromCache: false,
      cacheKey: `alternative:${similar.id}`,
    },
  };
}

function getAge(cached: CacheEntry): number {
  return Math.floor((Date.now() - cached.createdAt.getTime()) / 1000);
}
```

---

## Part 4: Performance Considerations

### 4.1 Optimal Cache TTLs

**Recommendations by Research Type:**

| Research Type | TTL | Rationale |
|---------------|-----|-----------|
| **SERP Data** | 6-12 hours | SERP positions change frequently, balance freshness with cost |
| **Competitor Content** | 24-48 hours | Content updates less frequently, safe to cache longer |
| **Hybrid Research** | 12 hours | Combination requires moderate TTL |
| **Pattern Validation** | 7 days | Patterns are stable, long cache acceptable |
| **Algorithm Intelligence** | 30 days | Algorithm updates are rare, maximize cache |

**Implementation:**
```typescript
const TTL_CONFIGS = {
  serp: 6 * 60 * 60,        // 6 hours
  content: 24 * 60 * 60,    // 24 hours
  hybrid: 12 * 60 * 60,     // 12 hours
  pattern: 7 * 24 * 60 * 60,  // 7 days
  algorithm: 30 * 24 * 60 * 60, // 30 days
};

function getTTL(queryType: string, context: string): number {
  const key = context === 'pattern' || context === 'algorithm'
    ? context
    : queryType;
  return TTL_CONFIGS[key] || TTL_CONFIGS.hybrid;
}
```

---

### 4.2 Rate Limit Configurations

**Conservative Estimates (pending testing):**

```typescript
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  websearch: {
    maxRequests: 10,        // Conservative estimate
    windowMs: 60 * 1000,    // 1 minute
    service: 'websearch',
    enableQueue: true,
    maxQueueSize: 50,
    backoffStrategy: 'exponential',
    backoffDelay: 1000,     // 1 second initial
    maxBackoffDelay: 60000, // 60 seconds max
  },

  webfetch: {
    maxRequests: 20,        // Likely higher than search
    windowMs: 60 * 1000,    // 1 minute
    service: 'webfetch',
    enableQueue: true,
    maxQueueSize: 100,
    backoffStrategy: 'exponential',
    backoffDelay: 1000,
    maxBackoffDelay: 60000,
  },
};

// Usage
const limiter = new RateLimiter(RATE_LIMITS.websearch);
await limiter.acquire(); // Blocks if rate limited
const result = await WebSearch({ query: 'test' });
limiter.release();
```

**Testing Protocol:**
```typescript
/**
 * Test rate limits empirically
 */
async function testRateLimits(): Promise<{
  websearch: { limit: number; windowMs: number };
  webfetch: { limit: number; windowMs: number };
}> {
  const testQueries = Array(50).fill('test query');
  const results = { websearch: { limit: 0, windowMs: 60000 }, webfetch: { limit: 0, windowMs: 60000 } };

  // Test WebSearch
  let searchCount = 0;
  const searchStart = Date.now();
  for (const query of testQueries) {
    try {
      await WebSearch({ query });
      searchCount++;
      await sleep(100); // Small delay
    } catch (error) {
      if (error.message.includes('rate limit')) {
        results.websearch.limit = searchCount;
        results.websearch.windowMs = Date.now() - searchStart;
        break;
      }
    }
  }

  // Test WebFetch (similar pattern)
  // ...

  return results;
}
```

---

### 4.3 Request Batching Opportunities

**Pattern:**
```typescript
/**
 * Batch multiple queries with intelligent grouping
 */
async function batchResearchQueries(
  queries: ResearchQuery[]
): Promise<Map<string, ResearchResult>> {
  const results = new Map<string, ResearchResult>();

  // Group by type for optimized execution
  const grouped = groupBy(queries, q => q.type);

  for (const [type, typeQueries] of Object.entries(grouped)) {
    // Process in parallel batches
    const batchSize = type === 'serp' ? 5 : 3; // SERP can be more aggressive

    for (let i = 0; i < typeQueries.length; i += batchSize) {
      const batch = typeQueries.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(query => cacheFirstResearch(query))
      );

      batchResults.forEach((result, index) => {
        const query = batch[index];
        if (result.status === 'fulfilled') {
          results.set(query.query, result.value);
        } else {
          console.error(`Batch query failed: ${query.query}`, result.reason);
        }
      });

      // Rate limiting delay between batches
      if (i + batchSize < typeQueries.length) {
        await sleep(type === 'serp' ? 3000 : 5000);
      }
    }
  }

  return results;
}

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
```

---

### 4.4 Async/Await Patterns

**Best Practices:**

```typescript
/**
 * Parallel research with error isolation
 */
async function parallelResearch(
  queries: ResearchQuery[]
): Promise<ResearchResult[]> {
  // Use Promise.allSettled to prevent one failure from blocking all
  const results = await Promise.allSettled(
    queries.map(query => cacheFirstResearch(query))
  );

  return results
    .filter((result): result is PromiseFulfilledResult<ResearchResult> =>
      result.status === 'fulfilled'
    )
    .map(result => result.value);
}

/**
 * Sequential research with early termination
 */
async function sequentialResearch(
  queries: ResearchQuery[],
  options: { stopOnFirstSuccess?: boolean } = {}
): Promise<ResearchResult[]> {
  const results: ResearchResult[] = [];

  for (const query of queries) {
    try {
      const result = await cacheFirstResearch(query);
      results.push(result);

      if (options.stopOnFirstSuccess) {
        break; // Early termination
      }
    } catch (error) {
      console.error(`Sequential query failed: ${query.query}`, error);
      // Continue to next query
    }
  }

  return results;
}

/**
 * Timeout wrapper for research operations
 */
async function researchWithTimeout(
  query: ResearchQuery,
  timeoutMs: number = 30000
): Promise<ResearchResult> {
  return Promise.race([
    cacheFirstResearch(query),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new ResearchError('Timeout', ResearchErrorCode.TIMEOUT_ERROR)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Retry with exponential backoff
 */
async function researchWithRetry(
  query: ResearchQuery,
  maxRetries: number = 3
): Promise<ResearchResult> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await cacheFirstResearch(query);
    } catch (error) {
      lastError = error as Error;

      // Don't retry on invalid query
      if (error.code === ResearchErrorCode.INVALID_QUERY) {
        throw error;
      }

      // Exponential backoff
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.warn(`Retry ${attempt + 1}/${maxRetries} after ${delayMs}ms delay`);
      await sleep(delayMs);
    }
  }

  throw lastError!;
}
```

---

## Part 5: Usage Examples

### 5.1 Phase 1: Foundation Knowledge Store Population

**Scenario:** Populate global knowledge store with initial patterns.

```typescript
// planning/seo/examples/phase1-foundation.ts

import { cacheFirstResearch, batchResearchQueries } from '../lib/research-service';

async function populateFoundationKnowledge(): Promise<void> {
  // Define foundation queries
  const foundationQueries: ResearchQuery[] = [
    {
      query: 'SEO content structure best practices 2025',
      type: 'hybrid',
      options: { maxResults: 20, cacheTtl: 7 * 24 * 60 * 60 }, // 7 days
      correlationId: 'foundation-content-structure',
    },
    {
      query: 'featured snippet optimization techniques',
      type: 'serp',
      options: { maxResults: 15 },
      correlationId: 'foundation-serp-features',
    },
    {
      query: 'internal linking strategies 2025',
      type: 'hybrid',
      options: { maxResults: 10 },
      correlationId: 'foundation-link-patterns',
    },
  ];

  // Execute batch research
  const results = await batchResearchQueries(foundationQueries);

  // Extract and store patterns
  for (const [query, result] of results) {
    const patterns = await extractPatternsFromResult(result);

    await storeInGlobalKnowledge({
      category: inferCategory(query),
      patterns,
      source: 'foundation-research',
      confidence: calculateInitialConfidence(patterns),
      metadata: {
        query,
        timestamp: new Date(),
        resultCount: result.metadata.resultCount,
      },
    });
  }

  console.log(`Foundation knowledge populated with ${results.size} research results`);
}

function inferCategory(query: string): string {
  if (/structure|format|outline/i.test(query)) return 'content-patterns';
  if (/link|anchor/i.test(query)) return 'link-patterns';
  if (/snippet|serp|feature/i.test(query)) return 'technical-patterns';
  return 'general';
}
```

---

### 5.2 Phase 2: Competitor Pattern Analysis

**Scenario:** Deep-dive competitor analysis for pattern extraction.

```typescript
// planning/seo/examples/phase2-competitor-analysis.ts

import { analyzeCompetitorContent, batchAnalyzeCompetitors } from '../lib/research-service';

async function analyzeTopCompetitors(keyword: string): Promise<void> {
  // Step 1: Get top competitors from SERP
  const serpData = await extractSerpData(keyword, { maxResults: 10 });
  const topUrls = serpData.filter(r => r.position <= 5).map(r => r.url);

  // Step 2: Batch analyze competitor content
  const analyses = await batchAnalyzeCompetitors(topUrls, {
    concurrency: 2,
    delayMs: 3000,
  });

  // Step 3: Extract common patterns
  const patterns = {
    avgWordCount: average(analyses.map(a => a.metadata.wordCount)),
    commonHeadingStructure: findCommonStructure(analyses),
    schemaTypes: findCommonSchemaTypes(analyses),
    internalLinkDensity: average(
      analyses.map(a => a.metadata.internalLinks / a.metadata.wordCount)
    ),
  };

  // Step 4: Store competitor profile
  await storeCompetitorProfile({
    keyword,
    topCompetitors: topUrls,
    patterns,
    confidence: calculatePatternConfidence(analyses),
    analyzedAt: new Date(),
  });

  console.log(`Competitor analysis complete for "${keyword}"`);
  console.log(`Patterns extracted:`, patterns);
}

function findCommonStructure(analyses: ContentResult[]): string {
  // Find most common H2 count
  const h2Counts = analyses.map(a => a.metadata.headings.h2);
  const mode = h2Counts.sort((a,b) =>
    h2Counts.filter(v => v===a).length - h2Counts.filter(v => v===b).length
  ).pop();
  return `H2: ${mode}, H3: ${average(analyses.map(a => a.metadata.headings.h3)).toFixed(0)}`;
}

function findCommonSchemaTypes(analyses: ContentResult[]): string[] {
  const allSchemas = analyses.flatMap(a => a.metadata.schema || []);
  const counts = allSchemas.reduce((acc, schema) => {
    acc[schema] = (acc[schema] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Return schemas present in >50% of pages
  const threshold = analyses.length / 2;
  return Object.entries(counts)
    .filter(([, count]) => count >= threshold)
    .map(([schema]) => schema);
}

function average(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}
```

---

### 5.3 Batch Research with Rate Limiting

**Scenario:** Process 100+ queries with proper rate limiting.

```typescript
// planning/seo/examples/batch-research.ts

import { RateLimiter } from '../lib/rate-limiter';
import { cacheFirstResearch } from '../lib/research-service';

async function batchResearchWithRateLimiting(
  queries: ResearchQuery[]
): Promise<ResearchResult[]> {
  const limiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 requests per minute
    service: 'websearch',
    enableQueue: true,
    maxQueueSize: 200,
    backoffStrategy: 'exponential',
  });

  const results: ResearchResult[] = [];
  const errors: Array<{ query: string; error: Error }> = [];

  console.log(`Processing ${queries.length} queries with rate limiting...`);

  for (const [index, query] of queries.entries()) {
    try {
      // Acquire rate limit token
      await limiter.acquire();

      // Execute research
      const result = await cacheFirstResearch(query);
      results.push(result);

      // Release token
      limiter.release();

      // Progress logging
      if ((index + 1) % 10 === 0) {
        console.log(`Progress: ${index + 1}/${queries.length} (${Math.round((index + 1) / queries.length * 100)}%)`);
      }

    } catch (error) {
      errors.push({ query: query.query, error: error as Error });
      limiter.release(); // Release even on error
    }
  }

  // Report results
  console.log(`\nBatch complete:`);
  console.log(`  Success: ${results.length}/${queries.length}`);
  console.log(`  Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\nError summary:`);
    errors.forEach(({ query, error }) => {
      console.log(`  - ${query}: ${error.message}`);
    });
  }

  return results;
}

// Usage example
const largeQuerySet: ResearchQuery[] = [
  // 100+ queries...
];

const results = await batchResearchWithRateLimiting(largeQuerySet);
```

---

### 5.4 Cache-First with Stale Fallback

**Scenario:** Maximize cache usage with graceful degradation.

```typescript
// planning/seo/examples/cache-first-example.ts

import { cacheFirstResearch, fallbackToStaleCache } from '../lib/research-service';

async function robustResearch(query: ResearchQuery): Promise<ResearchResult> {
  try {
    // Primary: Cache-first (15-minute fresh)
    return await cacheFirstResearch(query);

  } catch (primaryError) {
    console.warn(`Primary strategy failed: ${primaryError.message}`);

    try {
      // Secondary: Stale cache (expired but available)
      return await fallbackToStaleCache(query);

    } catch (secondaryError) {
      console.error(`Secondary strategy failed: ${secondaryError.message}`);

      // Tertiary: Alternative source (local DB)
      return await fallbackToAlternativeSource(query);
    }
  }
}

// Usage in production pipeline
async function executeResearchPipeline(keyword: string): Promise<void> {
  const queries: ResearchQuery[] = [
    { query: `${keyword} best practices`, type: 'hybrid' },
    { query: `${keyword} examples`, type: 'serp' },
    { query: `${keyword} case studies`, type: 'hybrid' },
  ];

  const results = await Promise.all(
    queries.map(query => robustResearch(query))
  );

  // Process results...
  results.forEach((result, index) => {
    console.log(`Query ${index + 1}: ${result.metadata.fromCache ? 'CACHED' : 'FRESH'}`);
    console.log(`  Results: ${result.metadata.resultCount}`);
    console.log(`  Execution: ${result.metadata.executionTime}ms`);
  });
}
```

---

## Part 6: Testing and Validation

### 6.1 Integration Test Suite

```typescript
// planning/seo/tests/research-integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { extractSerpData, analyzeCompetitorContent, executeHybridResearch } from '../lib/research-service';

describe('ResearchService Integration', () => {
  describe('WebSearch Integration', () => {
    it('should extract SERP data for keyword', async () => {
      const results = await extractSerpData('automation tools', { maxResults: 5 });

      expect(results).toHaveLength(5);
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('url');
      expect(results[0]).toHaveProperty('position', 1);
    });

    it('should handle domain filtering', async () => {
      const results = await extractSerpData('automation', {
        maxResults: 10,
        excludeDomains: ['ads.google.com'],
      });

      expect(results.every(r => !r.url.includes('ads.google.com'))).toBe(true);
    });

    it('should extract SERP features', async () => {
      const results = await extractSerpData('what is automation');

      const withFeatures = results.filter(r => r.features && r.features.length > 0);
      expect(withFeatures.length).toBeGreaterThan(0);
    });
  });

  describe('WebFetch Integration', () => {
    it('should analyze competitor content', async () => {
      const result = await analyzeCompetitorContent(
        'https://zapier.com/apps',
        'structure'
      );

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('title');
      expect(result.metadata).toHaveProperty('wordCount');
      expect(result.metadata.wordCount).toBeGreaterThan(0);
    });

    it('should handle redirects', async () => {
      // Test URL that redirects
      const result = await analyzeCompetitorContent(
        'http://example.com', // Will redirect to https
        'metadata'
      );

      expect(result.url).toMatch(/^https:/);
    });
  });

  describe('Hybrid Research', () => {
    it('should execute SERP + content analysis', async () => {
      const query: ResearchQuery = {
        query: 'automation tools comparison',
        type: 'hybrid',
        options: { maxResults: 3 },
      };

      const result = await executeHybridResearch(query);

      expect(result.serpResults).toBeDefined();
      expect(result.contentResults).toBeDefined();
      expect(result.serpResults!.length).toBeGreaterThan(0);
      expect(result.contentResults!.length).toBeGreaterThan(0);
    });
  });

  describe('Caching', () => {
    it('should cache and retrieve results', async () => {
      const query: ResearchQuery = {
        query: 'test caching query',
        type: 'serp',
      };

      // First call (cache miss)
      const result1 = await cacheFirstResearch(query);
      expect(result1.metadata.fromCache).toBe(false);

      // Second call (cache hit)
      const result2 = await cacheFirstResearch(query);
      expect(result2.metadata.fromCache).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle rate limits gracefully', async () => {
      // Simulate rate limit by rapid requests
      const queries = Array(20).fill(null).map((_, i) => ({
        query: `test query ${i}`,
        type: 'serp' as const,
      }));

      const results = await Promise.allSettled(
        queries.map(q => cacheFirstResearch(q))
      );

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(0);
    });

    it('should fall back to stale cache on error', async () => {
      // Warm cache
      const query: ResearchQuery = { query: 'fallback test', type: 'serp' };
      await cacheFirstResearch(query);

      // Wait for cache to expire (or manually expire)
      // Then test fallback

      const result = await fallbackToStaleCache(query);
      expect(result).toBeDefined();
    });
  });
});
```

---

## Part 7: Recommendations and Next Steps

### 7.1 Phase 1 Sprint 1 Implementation Checklist

- [ ] Create `planning/seo/lib/research-service.ts` with core integration patterns
- [ ] Implement `extractSerpData()` with WebSearch integration
- [ ] Implement `analyzeCompetitorContent()` with WebFetch integration
- [ ] Build cache layer with 15-minute TTL alignment
- [ ] Create rate limiter with conservative initial limits
- [ ] Add error handling and fallback strategies
- [ ] Write integration tests for all patterns
- [ ] Document usage examples in `planning/seo/examples/`
- [ ] Test rate limits empirically and update configurations
- [ ] Validate cache hit rates in production

### 7.2 Performance Optimization Priorities

1. **Immediate (Sprint 1):**
   - Implement cache-first strategy
   - Add basic rate limiting (conservative estimates)
   - Create error handling with retries

2. **Short-term (Phase 1):**
   - Optimize TTL configurations based on usage patterns
   - Add cache warming for common queries
   - Implement intelligent batching

3. **Long-term (Phase 2+):**
   - Migrate to persistent cache store (Redis)
   - Add cache analytics and hit rate monitoring
   - Implement predictive cache warming

### 7.3 Monitoring and Observability

**Key Metrics to Track:**
```typescript
interface ResearchMetrics {
  // Performance
  avgExecutionTime: number;
  cacheHitRate: number;
  rateLimitThrottleRate: number;

  // Reliability
  errorRate: number;
  fallbackUsageRate: number;
  staleServeRate: number;

  // Usage
  queriesPerHour: number;
  topQueries: Array<{ query: string; count: number }>;
  resultQuality: number; // Avg result count
}

async function collectMetrics(): Promise<ResearchMetrics> {
  // Implementation
}
```

---

## Appendix A: Type Definitions Reference

See `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/seo/types/research.ts` for complete type definitions.

---

## Appendix B: Configuration Templates

### Cache Configuration
```yaml
cache:
  provider: memory  # memory | redis | file
  ttl:
    serp: 21600      # 6 hours
    content: 86400   # 24 hours
    hybrid: 43200    # 12 hours
  maxSize: 1000      # entries
  evictionPolicy: lru
```

### Rate Limit Configuration
```yaml
rateLimits:
  websearch:
    maxRequests: 10
    windowMs: 60000   # 1 minute
    queueSize: 50
  webfetch:
    maxRequests: 20
    windowMs: 60000
    queueSize: 100
```

---

## Document History

- **v1.0.0 (2025-11-30):** Initial documentation for Phase 1 Sprint 1
- Research patterns validated against Claude Code MCP tool specifications
- Integration examples aligned with SEO Intelligence epic requirements

---

**Confidence Score:** 0.92

This documentation provides comprehensive integration patterns for WebSearch/WebFetch tools within the SEO Intelligence ResearchService, covering:
- ✅ Tool capability analysis with SEO research fit assessment
- ✅ SERP extraction, competitor analysis, and hybrid research patterns
- ✅ Cache-first strategies with 15-minute TTL alignment
- ✅ Rate limiting with conservative initial estimates and testing protocol
- ✅ Error handling with graceful fallbacks (stale cache, alternative sources)
- ✅ Performance recommendations (TTL optimization, batching, async patterns)
- ✅ Complete usage examples for Phase 1-2 implementation
- ✅ Integration test suite structure

**Next Steps:**
1. Implement core ResearchService in TypeScript
2. Create executable usage examples
3. Test rate limits empirically
4. Validate integration with intelligence-curator agent (Phase 1)
