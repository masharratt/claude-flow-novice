# DataForSEO Cache Architecture

## Overview

The DataForSEO API wrapper implements a **cache-first architecture** that queries RuVector before making external API calls. This design achieves **80%+ cost savings** by reusing research data across projects.

**Target Metrics:**
- Cache hit rate: 60%+
- Cost savings: 80%+
- API call reduction: 70%+

## Cache-First Workflow

```
User Request (get keyword metrics)
  ↓
Check RuVector Cache
  ├─ Found + Fresh? → Return cached data (CACHE HIT)
  ├─ Found + Stale? → Refresh from API, update cache
  └─ Not Found? → Call API, store in cache (CACHE MISS)
  ↓
Return Data + Cost Tracking
```

## Collections and TTLs

### Keyword Research Collection
- **Collection**: `seo_keyword_research`
- **TTL**: 14 days (keyword metrics shift, refresh on schedule)
- **Cached Data**:
  - Search volume
  - Keyword difficulty
  - CPC
  - Search intent
  - Secondary keywords
  - Long-tail variants
  - People Also Ask
  - Related searches

**Freshness Score**:
- Fresh (0-14 days): 1.0 → 0.0
- Stale (>14 days): 0.0

### SERP Patterns Collection
- **Collection**: `seo_serp_patterns`
- **TTL**: 7 days (SERPs change rapidly)
- **Cached Data**:
  - Top 10 SERP results
  - Featured snippets
  - People Also Ask
  - Knowledge panels
  - Search intent signals

**Freshness Score**:
- Fresh (0-7 days): 1.0 → 0.0
- Stale (>7 days): 0.0

## Cost Model

### API Pricing (2024)
| Operation | Cost | Cache Benefit |
|-----------|------|---------------|
| Keyword research | $0.02 | Check 10ms first |
| SERP analysis | $0.05 | Check 10ms first |
| Keyword difficulty | $0.015 | Bundled with keyword |
| People Also Ask | $0.02 | Bundled with SERP |

### Savings Example
**Without Caching** (100 keyword requests):
- 100 API calls × $0.02 = $2.00

**With Caching** (60% hit rate):
- 40 cache misses × $0.02 = $0.80
- 60 cache hits × $0.00 = $0.00
- **Total: $0.80 (60% savings)**

## Implementation Details

### 1. Cache Lookup

```typescript
// Query RuVector for keyword
const cachedResults = await keywordResearchCollection.query({
  queryText: keyword,
  limit: 1,
  niche,
  excludeStale: false, // Include all results, check freshness manually
});

// Check freshness
const age = Date.now() - cachedResult.createdAt;
const ttlMs = 14 * 24 * 60 * 60 * 1000; // 14 days
const isFresh = age < ttlMs;
```

### 2. Freshness Scoring

```typescript
// Calculate freshness score (0-1)
const ageMs = Date.now() - createdAt;
const ageDays = ageMs / (1000 * 60 * 60 * 24);
const freshnessScore = Math.max(0, 1 - ageDays / TTL_DAYS);

// Return if fresh
if (freshnessScore > 0) { // Not stale
  return cachedData;
}
```

### 3. Cache Miss Handling

```typescript
// Call API if cache miss or stale
const apiData = await callDataForSEOAPI(keyword);

// Store in RuVector immediately
await keywordResearchCollection.add({
  primaryKeyword: keyword,
  searchVolume: apiData.searchVolume,
  // ...
});

// Return data
return apiData;
```

## Cost Tracking

### Per-Request Tracking

```typescript
interface CostTrackingResult {
  cacheHit: boolean;
  apiCalled: boolean;
  costSaved?: number;        // $0.02 if cache hit
  totalCostWithoutCache?: number;
  totalCostWithCache?: number;
}
```

### Aggregate Metrics

```typescript
const summary = api.getCostSummary();
// {
//   totalCalls: 100,
//   cacheHits: 60,
//   cacheHitRate: 0.6,
//   estimatedCostSaved: $1.20,
//   totalCostWithoutCache: $2.00,
//   totalCostWithCache: $0.80
// }
```

## Mock Mode

For testing without real API credentials:

```typescript
// If no API key provided, use mock mode
const api = new DataForSEOCached(
  db,
  embeddingFn,
  undefined, // No API key → mock mode
);

// Returns synthetic data with deterministic patterns
const { metrics } = await api.getKeywordMetrics('target keyword', 'niche');
// metrics.searchVolume = deterministic based on keyword hash
```

## Integration Points

### Phase 4: Research Phase
1. Collect keywords for research
2. Call `getKeywordMetrics()` for each keyword
3. Get cache hits from previous research
4. Store new metrics in RuVector
5. Use cached expert sources, statistics

### Phase 5: Gap Analysis
1. Query `getSERPAnalysis()` for current rankings
2. Compare site ranking vs competitors
3. Identify opportunities with RuVector patterns
4. Score with `OpportunityScorer`

### Pattern-Enhanced Scoring
```typescript
// Opportunity scorer queries patterns during scoring
const { patternMatchBonus } = scoring;
// Bonus based on RuVector pattern matches
```

## Optimization Strategies

### 1. Batch Operations
```typescript
// Query multiple keywords efficiently
const keywords = ['keyword1', 'keyword2', ...];
const metrics = await Promise.all(
  keywords.map(kw => api.getKeywordMetrics(kw, niche))
);
```

### 2. Stale Data Refresh
```typescript
// Automatically refresh stale data
if (freshnessScore < 0.3) { // Very old
  // Refresh from API
  await api.getKeywordMetrics(keyword, niche);
}
```

### 3. Niche-Scoped Caching
```typescript
// Cache is scoped by niche
const seoMetrics = await api.getKeywordMetrics('ranking', 'seo');
const ecomMetrics = await api.getKeywordMetrics('ranking', 'ecommerce');
// Different cache entries for different niches
```

## Error Handling

### API Failures
```typescript
try {
  const data = await api.getKeywordMetrics(keyword, niche);
} catch (error) {
  // API call failed, but cache may still have stale data
  // Fall back to cached data if available
  const staleData = await getFromCache(keyword);
  if (staleData) {
    console.warn('Using stale cache due to API failure');
  }
}
```

### Storage Failures
```typescript
// Cache write fails (e.g., storage issue)
// Continue without caching; log error
console.log('Failed to store in RuVector, continuing with direct API data');
```

## Performance Metrics

### Expected Performance
- Cache hit latency: 10-50ms
- API call latency: 500-1500ms
- Speedup factor: 10-50x for cache hits

### Monitoring
```typescript
const summary = api.getCostSummary();
console.log(`Cache hit rate: ${(summary.cacheHitRate * 100).toFixed(1)}%`);
console.log(`Savings: $${summary.estimatedCostSaved.toFixed(2)}`);
```

## Testing

### Mock Mode Testing
```typescript
// No credentials needed
const api = new DataForSEOCached(
  mockDb,
  mockEmbeddingFn,
  undefined, // Mock mode
  true // Verbose logging
);

const { metrics, cache, cost } = await api.getKeywordMetrics('test', 'niche');
// metrics.searchVolume = deterministic value
// cache.cached = false (first call)
// cost.cacheHit = false
```

### Real API Testing
```typescript
const api = new DataForSEOCached(
  realDb,
  embeddingFn,
  process.env.DATA_FOR_SEO_API_KEY, // Use real key
  true
);

// First call: cache miss, stores in RuVector
const call1 = await api.getKeywordMetrics('test', 'niche');
// cost.cacheHit = false

// Second call: cache hit
const call2 = await api.getKeywordMetrics('test', 'niche');
// cost.cacheHit = true
// cost.costSaved = $0.02
```

## Future Enhancements

1. **Predictive Refresh**: Refresh cache before TTL expiry if data trending
2. **Compression**: Compress cached SERP data to save storage
3. **Partial Updates**: Update only changed SERP positions
4. **Cost Optimization**: Dynamic API call batching based on volume
5. **A/B Testing**: Track cache hit rate improvements over time

## References

- **Phase 4-5 Requirements**: `.claude/skills/cfn-seo-pipeline/PHASE_4_5_REQUIREMENTS.md`
- **RuVector Schemas**: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/schemas.ts`
- **Cost Tracking**: `.claude/skills/cfn-seo-pipeline/lib/seo/apis/cost-tracking.ts`
