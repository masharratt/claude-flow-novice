# SEO Research Service - Phase 1 Sprint 1

## Overview

ResearchService provides a unified interface for SEO intelligence gathering via WebSearch and WebFetch MCP tools. This is the foundational implementation for Phase 1 of the SEO Intelligence Integration epic.

## Components

### 1. Type Definitions (`types/research.ts`)

Core TypeScript interfaces and types:

- **ResearchQuery**: Query configuration with type, options, and priority
- **ResearchResult**: Unified result structure with SERP and content data
- **SerpResult**: Normalized SERP result (title, URL, description, position)
- **ContentResult**: Normalized content result with metadata extraction
- **CacheEntry**: Cache storage structure with TTL and access tracking
- **RateLimitConfig**: Rate limiter configuration with backoff strategies
- **ResearchError**: Typed error class with error codes

### 2. Rate Limiter (`lib/rate-limiter.ts`)

Token bucket algorithm implementation:

**Features:**
- Token bucket with configurable refill rate
- Request queuing with priority support
- Exponential/linear backoff strategies
- Per-service rate limits (WebSearch: 10/min, WebFetch: 20/min)
- Queue overflow protection
- Real-time statistics

**Usage:**
```typescript
import { RateLimiter } from './lib/rate-limiter';

const limiter = new RateLimiter('websearch');
await limiter.acquireToken(query); // Blocks until token available

const stats = limiter.getStats();
console.log(`Tokens: ${stats.currentTokens}, Queue: ${stats.queueLength}`);
```

### 3. Cache Layer (`lib/research-cache.ts`)

File-based cache with TTL support:

**Features:**
- SHA-256 cache key generation from query
- Configurable TTL per query type (SERP: 24h, Content: 7d)
- Automatic expiration and eviction (LRU)
- Access tracking for analytics
- Pattern-based invalidation
- Size-based eviction (max 100MB)

**Storage Location:**
```
~/.cfn/seo/cache/research/
  ├── <cache-key>.json  # Cache entries
  └── ...
```

**Usage:**
```typescript
import { ResearchCache } from './lib/research-cache';

const cache = new ResearchCache();
const cachedResult = await cache.get(query);
if (!cachedResult) {
  const result = await executeResearch(query);
  await cache.set(query, result);
}

const stats = cache.getStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
```

### 4. Research Service (`lib/research-service.ts`)

Main service orchestrating WebSearch/WebFetch integration:

**Features:**
- Unified interface for SERP, content, and hybrid queries
- Automatic caching with cache-aware results
- Rate limiting with queuing
- Result parsing and normalization
- Comprehensive error handling
- Statistics and monitoring

**Query Types:**

1. **SERP Query** (`type: 'serp'`):
   - Uses WebSearch MCP tool
   - Returns normalized SERP results
   - Caches for 24 hours

2. **Content Query** (`type: 'content'`):
   - Uses WebFetch MCP tool
   - Requires `targetUrl` option
   - Extracts metadata (headings, links, images, schema)
   - Caches for 7 days

3. **Hybrid Query** (`type: 'hybrid'`):
   - Executes both WebSearch and WebFetch in parallel
   - Returns combined results
   - Uses shortest cache TTL (24 hours)

**Usage:**

```typescript
import { ResearchService, searchSerp, fetchContent, hybridResearch } from './lib/research-service';

// SERP query
const serpResults = await searchSerp('best seo tools 2025', { maxResults: 10 });
console.log(serpResults.serpResults);

// Content fetch
const contentResults = await fetchContent('https://example.com/article', { deepCrawl: true });
console.log(contentResults.contentResults[0].metadata);

// Hybrid query
const hybridResults = await hybridResearch(
  'seo best practices',
  'https://competitor.com/guide',
  { maxResults: 5, deepCrawl: false }
);

// Direct service usage
const service = new ResearchService({ verbose: true });
const result = await service.execute({
  query: 'keyword research',
  type: 'serp',
  options: { maxResults: 20, priority: 'high' },
});
```

## Integration with SEO Pipeline

### Phase 1 Integration Points

1. **Step 0: Intelligence Injection**
   - Load cached SERP/content patterns
   - Inject into pipeline context via Redis

2. **Step 2.5: Competitor Deep-Dive**
   - Fetch competitor content via `fetchContent()`
   - Extract site-wide patterns

3. **Step 3.5: SERP Pattern Analysis**
   - Query SERPs via `searchSerp()`
   - Analyze ranking correlations

### Redis Context Storage

```typescript
import Redis from 'ioredis';
import { searchSerp } from './lib/research-service';

const redis = new Redis();

// Store research result in Redis context
const serpResults = await searchSerp('target keyword');
await redis.set(
  `cfn:seo:task:${taskId}:serp`,
  JSON.stringify(serpResults),
  'EX',
  3600 // 1 hour TTL
);

// Agents retrieve from Redis
const serpData = await redis.get(`cfn:seo:task:${taskId}:serp`);
const results = JSON.parse(serpData);
```

## Configuration

### Environment Variables

```bash
# Cache directory (default: ~/.cfn/seo/cache/research)
export CFN_SEO_CACHE_DIR=/custom/cache/path

# Rate limit overrides
export CFN_WEBSEARCH_RATE_LIMIT=15  # requests per minute
export CFN_WEBFETCH_RATE_LIMIT=30   # requests per minute

# Cache TTL overrides (seconds)
export CFN_CACHE_TTL_SERP=43200     # 12 hours
export CFN_CACHE_TTL_CONTENT=259200 # 3 days
```

### Custom Configuration

```typescript
import { ResearchService, ResearchCache, RateLimiter } from './lib';

// Custom cache
const cache = new ResearchCache('/custom/cache/path');

// Custom rate limiters
const webSearchLimiter = new RateLimiter('websearch', {
  maxRequests: 15,
  windowMs: 60000,
  backoffStrategy: 'linear',
});

const webFetchLimiter = new RateLimiter('webfetch', {
  maxRequests: 30,
  windowMs: 60000,
  enableQueue: true,
  maxQueueSize: 200,
});

// Create service with custom components
const service = new ResearchService({
  cache,
  rateLimiters: {
    websearch: webSearchLimiter,
    webfetch: webFetchLimiter,
  },
  verbose: true,
});
```

## Monitoring and Statistics

### Cache Statistics

```typescript
import { researchCache } from './lib/research-cache';

const stats = researchCache.getStats();
console.log({
  hitRate: `${(stats.hitRate * 100).toFixed(2)}%`,
  totalEntries: stats.totalEntries,
  cacheSizeMB: (stats.sizeBytes / 1024 / 1024).toFixed(2),
  avgAccessCount: stats.avgAccessCount?.toFixed(2),
});
```

### Rate Limiter Statistics

```typescript
import { researchService } from './lib/research-service';

const stats = researchService.getRateLimiterStats();
console.log({
  websearch: {
    tokens: stats.websearch.currentTokens,
    queueLength: stats.websearch.queueLength,
    throttleRate: `${(stats.websearch.throttleRate * 100).toFixed(2)}%`,
  },
  webfetch: {
    tokens: stats.webfetch.currentTokens,
    queueLength: stats.webfetch.queueLength,
    throttleRate: `${(stats.webfetch.throttleRate * 100).toFixed(2)}%`,
  },
});
```

## Error Handling

All errors throw `ResearchError` with typed error codes:

```typescript
import { ResearchError, ResearchErrorCode } from './types/research';

try {
  const result = await searchSerp('query');
} catch (error) {
  if (error instanceof ResearchError) {
    switch (error.code) {
      case ResearchErrorCode.RATE_LIMIT_EXCEEDED:
        console.error('Rate limit exceeded, retry later');
        break;
      case ResearchErrorCode.CACHE_ERROR:
        console.error('Cache operation failed:', error.details);
        break;
      case ResearchErrorCode.PARSE_ERROR:
        console.error('Failed to parse results:', error.details);
        break;
      default:
        console.error('Research failed:', error.message);
    }
  }
}
```

## Performance Considerations

### Cache Hit Optimization

- SERP queries are deduplicated by query text and options
- Content fetches are deduplicated by URL
- Cache keys use SHA-256 hashing for consistent lookup

### Rate Limit Optimization

- Priority queuing allows critical requests to jump the queue
- Token bucket smooths burst traffic
- Backoff strategies prevent API quota exhaustion

### Memory Management

- File-based cache prevents memory exhaustion
- LRU eviction when cache exceeds 100MB
- Automatic expiration of stale entries

## Future Enhancements (Deferred)

### Phase 5: RuVector Integration

- Migrate cache to RuVector for semantic search
- Enable pattern similarity matching
- Cross-domain pattern discovery via embeddings

### Compression

- Optional gzip compression for cache entries
- Reduces disk usage for large content results

### Real-time SERP Monitoring

- Webhook integration for SERP changes
- Automatic cache invalidation on ranking shifts

## Testing

### Unit Tests

```bash
npm test -- research-service
npm test -- research-cache
npm test -- rate-limiter
```

### Integration Tests

```bash
# Test with live MCP tools (requires MCP server)
npm run test:integration -- research-service

# Test cache persistence
npm run test:integration -- research-cache

# Stress test rate limiter
npm run test:stress -- rate-limiter
```

## Troubleshooting

### Cache Issues

**Problem:** Cache not persisting
```bash
# Check cache directory permissions
ls -la ~/.cfn/seo/cache/research/

# Verify disk space
df -h ~/.cfn/seo/cache/
```

**Problem:** High cache miss rate
```bash
# Check cache statistics
node -e "
const { researchCache } = require('./lib/research-cache');
console.log(researchCache.getStats());
"
```

### Rate Limit Issues

**Problem:** Frequent rate limit errors
```bash
# Check rate limiter stats
node -e "
const { researchService } = require('./lib/research-service');
console.log(researchService.getRateLimiterStats());
"

# Increase rate limits
export CFN_WEBSEARCH_RATE_LIMIT=20
export CFN_WEBFETCH_RATE_LIMIT=40
```

**Problem:** Queue overflow
```typescript
// Increase queue size
const limiter = new RateLimiter('websearch', {
  maxQueueSize: 100, // Default: 50
});
```

## License

Part of Claude Flow Novice - SEO Intelligence Integration Epic
