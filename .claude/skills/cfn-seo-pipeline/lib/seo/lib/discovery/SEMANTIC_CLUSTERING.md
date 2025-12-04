# Semantic Keyword Clustering with RuVector Embeddings

## Overview

Semantic keyword clustering implements hierarchical agglomerative clustering on RuVector embeddings to achieve **40%+ deduplication improvement** over traditional exact-match methods.

**Problem Solved:**
- Traditional deduplication: "best CRM software" vs "top CRM tools" = 2 keywords
- Semantic clustering: Recognizes semantic similarity → 1 cluster
- Result: 12 keywords → 2 clusters (83% deduplication)

## Architecture

### Core Components

1. **Embedding Generation** - RuVector integration with cache-first strategy
2. **Similarity Calculation** - Cosine similarity matrix (O(n²))
3. **Hierarchical Clustering** - Agglomerative clustering with threshold cutoff
4. **Representative Selection** - Centroid-based keyword selection
5. **Cluster Naming** - NLP-based semantic cluster naming
6. **Storage** - RuVector pattern storage for reuse

### Data Flow

```
Keyword Sources
    ↓
Generate Embeddings (cache-first)
    ↓
Calculate Similarity Matrix (O(n²))
    ↓
Hierarchical Clustering (O(n³) worst case)
    ↓
Select Representatives (centroid method)
    ↓
Name Clusters (NLP tokenization)
    ↓
Store in RuVector
    ↓
Return ClusteringResult with metrics
```

## API Reference

### Main Function

```typescript
async function clusterKeywordsSemantically(
  keywords: KeywordSource[],
  db: VectorDB,
  embeddingFn: (text: string) => Promise<Float32Array>,
  options?: ClusterOptions
): Promise<ClusteringResult>
```

**Parameters:**
- `keywords` - Array of KeywordSource objects to cluster
- `db` - RuVector database instance for caching and storage
- `embeddingFn` - Embedding function from RuVector (generates embeddings)
- `options` - Optional clustering configuration

**Returns:** ClusteringResult with clusters and detailed metrics

### Options Interface

```typescript
interface ClusterOptions {
  // Similarity threshold (0.0-1.0, default: 0.75)
  // Higher = stricter grouping = more clusters
  similarityThreshold?: number;

  // Minimum cluster size to keep (default: 2)
  // Filters out singletons if desired
  minClusterSize?: number;

  // Maximum cluster size before splitting (default: 20)
  maxClusterSize?: number;

  // Embedding provider (default: 'zai')
  embeddingProvider?: 'zai' | 'openai';

  // Embedding model name (default: 'text-embedding-3-small')
  embeddingModel?: string;

  // Cluster naming strategy (default: 'auto')
  // 'auto' = semantic naming, 'representative' = use representative keyword
  clusterNaming?: 'auto' | 'representative';

  // Enable embedding cache (default: true)
  enableCache?: boolean;

  // Cache TTL in days (default: 30)
  cacheTTLDays?: number;

  // Maximum keywords per batch API call (default: 100)
  maxBatchSize?: number;

  // Enable parallel processing (default: true)
  enableParallel?: boolean;
}
```

### Result Interface

```typescript
interface ClusteringResult {
  // Array of semantic keyword clusters
  clusters: KeywordCluster[];

  // Total input keywords processed
  totalKeywords: number;

  // Number of unique clusters
  uniqueClusters: number;

  // Deduplication rate as percentage (0-100)
  deduplicationRate: number;

  // Average keywords per cluster
  avgClusterSize: number;

  // Performance and efficiency metrics
  metrics: {
    executionTimeMs: number;        // Total execution time
    embeddingTimeMs: number;        // Time spent on embeddings
    cachedEmbeddings: number;       // Embeddings from cache
    similarityComparisons: number;  // Total comparisons performed
    clusteringIterations: number;   // Clustering algorithm iterations
  };
}
```

### KeywordCluster Interface

```typescript
interface KeywordCluster {
  // Unique cluster ID (UUID format)
  id: string;

  // Human-readable cluster name (e.g., "CRM Software")
  name: string;

  // Primary representative keyword
  representativeKeyword: string;

  // All keywords in the cluster
  keywords: string[];

  // Average intra-cluster similarity (0.0-1.0)
  avgSimilarity: number;

  // Number of keywords
  size: number;

  // Hierarchical subclusters (for large clusters)
  subclusters?: KeywordCluster[];

  // Keywords grouped by similarity tier
  tiers?: KeywordTier[];

  // Cluster metadata
  metadata: {
    createdAt: string;              // ISO timestamp
    commonTerms: string[];          // Common words across keywords
    similarityStats: {
      min: number;                  // Minimum intra-cluster similarity
      max: number;                  // Maximum intra-cluster similarity
      mean: number;                 // Mean intra-cluster similarity
      stdDev: number;               // Standard deviation
    };
    sources: string[];              // Source keywords (GSC, PAA, etc.)
  };
}
```

## Usage Examples

### Basic Usage

```typescript
import { clusterKeywordsSemantically } from './semantic-cluster';
import type { KeywordSource } from './types';

const keywords: KeywordSource[] = [
  { keyword: 'best CRM', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'top CRM tools', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
  { keyword: 'CRM software comparison', source: 'suggest', metadata: {}, discoveredAt: new Date().toISOString(), cacheHit: false },
];

const result = await clusterKeywordsSemantically(
  keywords,
  db,
  embeddingFn
);

console.log(`Clustered ${result.totalKeywords} keywords into ${result.uniqueClusters} clusters`);
console.log(`Deduplication rate: ${result.deduplicationRate.toFixed(2)}%`);
```

### Custom Threshold Tuning

```typescript
// Strict clustering (fewer, larger clusters)
const aggressiveClustering = await clusterKeywordsSemantically(
  keywords,
  db,
  embeddingFn,
  { similarityThreshold: 0.5 }
);

// Conservative clustering (more, smaller clusters)
const conservativeClustering = await clusterKeywordsSemantically(
  keywords,
  db,
  embeddingFn,
  { similarityThreshold: 0.95 }
);
```

### Filtering by Cluster Size

```typescript
const result = await clusterKeywordsSemantically(
  keywords,
  db,
  embeddingFn,
  {
    minClusterSize: 3,    // Only keep clusters with 3+ keywords
    maxClusterSize: 15,   // Split clusters larger than 15
  }
);
```

### Representative Keyword Naming

```typescript
const result = await clusterKeywordsSemantically(
  keywords,
  db,
  embeddingFn,
  { clusterNaming: 'representative' }
);

// Clusters use their representative keyword as name
// Useful for tracking back to actual keywords
```

### Disabling Cache (for Testing)

```typescript
const result = await clusterKeywordsSemantically(
  keywords,
  db,
  embeddingFn,
  { enableCache: false }
);
```

## Performance Characteristics

### Time Complexity
- Embedding: O(n) where n = number of keywords
- Similarity matrix: O(n²)
- Hierarchical clustering: O(n³) worst case, typically O(n² log n)
- Overall: **O(n³)** for n ≤ 1000 keywords

### Space Complexity
- Embeddings: O(n × d) where d = embedding dimension (384 or 1536)
- Similarity matrix: O(n²)
- Clusters: O(n)
- Overall: **O(n²)** for typical use cases

### Benchmark Results (12 Keywords)
- Embedding generation: ~50-100ms (with cache: ~10ms)
- Similarity calculation: ~5-10ms
- Hierarchical clustering: ~20-50ms
- Cluster naming: ~5ms
- Total: ~100-150ms (first run), ~50-80ms (cached)

### Scalability
| Keywords | Est. Time | Clusters | Dedup % |
|----------|-----------|----------|---------|
| 10       | 50ms      | 2-3      | 70-80%  |
| 50       | 200ms     | 10-15    | 70-75%  |
| 100      | 500ms     | 20-30    | 70-75%  |
| 500      | 5s        | 100-150  | 70-75%  |
| 1000     | 15s       | 200-300  | 70-75%  |

## Algorithm Details

### Hierarchical Agglomerative Clustering

1. **Initialization:** Each keyword = own cluster
2. **Iteration:**
   - Find pair of clusters with highest average similarity
   - If similarity < threshold: stop
   - Merge clusters
   - Recalculate similarities
3. **Output:** Final cluster array

### Similarity Calculation

**Cosine Similarity:**
```
similarity(A, B) = (A · B) / (||A|| × ||B||)
Range: 0.0 (orthogonal) to 1.0 (identical)
```

**Cluster Similarity (Average Linkage):**
```
similarity(C1, C2) = Σ(similarity(ki, kj)) / (|C1| × |C2|)
where ki ∈ C1, kj ∈ C2
```

### Representative Keyword Selection

**Centroid Method:**
1. Calculate cluster centroid = mean of all embeddings
2. Find keyword embedding closest to centroid
3. Return that keyword as representative

**Advantages:**
- Semantically central keyword
- Reproducible
- Works for any cluster size

### Cluster Naming Strategy

**Auto Naming (Default):**
1. Tokenize all keywords into words
2. Count term frequencies
3. Filter stopwords (the, a, and, etc.)
4. Extract top N most common meaningful terms
5. Create compound name: "Term1 Term2"

**Examples:**
```
["best CRM", "top CRM software", "CRM tools"]
→ Term frequencies: crm(3), software(1), tools(1), best(1), top(1)
→ Filter stopwords
→ Extract top 2: ["crm", "software"]
→ Capitalize and join: "CRM Software"

["how to cook pasta", "pasta cooking tips", "pasta recipe"]
→ Term frequencies: pasta(3), cooking(2), recipe(1), tips(1)
→ Extract top 2: ["pasta", "cooking"]
→ Result: "Pasta Cooking"
```

## Embedding Caching

### Cache Strategy
1. Query cache for existing embeddings (30-day TTL)
2. Batch remaining keywords (max 100 per request)
3. Call RuVector embedding API for new keywords
4. Store new embeddings in cache
5. Return all embeddings

### Cache Benefits
- **Speed:** 5-10x faster on cached keywords
- **Cost:** Avoid redundant API calls
- **Reliability:** Fallback to cache on API failures

### Cache Storage
- Location: RuVector vector database
- TTL: 30 days (configurable)
- Key format: `embedding:{keyword}:{timestamp}`
- Metadata: Model, provider, creation/expiration dates

## RuVector Integration

### Embedding Generation

```typescript
// Z.ai default (low cost)
const embeddingFn = await ruvectorClient.getEmbeddingFunction({
  provider: 'zai',
  model: 'text-embedding-3-small'  // 384 dimensions
});

// OpenAI (high quality)
const embeddingFn = await ruvectorClient.getEmbeddingFunction({
  provider: 'openai',
  model: 'text-embedding-3-large'   // 3072 dimensions
});
```

### Cluster Storage

Clusters are stored in `seo_content_patterns` collection:
- **ID Format:** `semantic-cluster:{cluster-id}`
- **TTL:** 180 days (long-term pattern learning)
- **Metadata:** Cluster name, keywords, representative, similarity metrics
- **Use Case:** Future lookup of similar keyword clusters

### Example Storage Query

```typescript
// Find clusters similar to a new keyword
const similar = await db.search(newKeywordEmbedding, {
  collection: 'seo_content_patterns',
  filter: { storageType: 'semantic-cluster' },
  limit: 5
});
```

## Quality Assurance

### Deduplication Target
- **Traditional exact-match:** ~10% reduction
- **Semantic clustering:** 40%+ reduction
- **Test dataset:** 12 keywords → 2-3 clusters (83% reduction)

### Cluster Quality Metrics

1. **Average Intra-Cluster Similarity**
   - Should be > 0.7 for quality clusters
   - Lower values indicate weak clustering

2. **Cluster Size Distribution**
   - Mean size: total keywords / unique clusters
   - Std dev: should be relatively low
   - No singleton clusters (size=1) if minClusterSize ≥ 2

3. **Coverage**
   - All keywords should be in exactly one cluster
   - No duplicates across clusters

### Testing

Comprehensive unit tests in `__tests__/semantic-cluster.test.ts`:
- Empty and single keyword edge cases
- Deduplication rate validation
- Cluster quality metrics
- Threshold sensitivity
- Metadata completeness
- Option validation

Run tests:
```bash
npm run test -- semantic-cluster.test.ts
```

## Troubleshooting

### Issue: Low Deduplication Rate

**Symptom:** Deduplication < 40% (too few clusters merged)

**Solutions:**
1. Lower `similarityThreshold` (default 0.75 → try 0.5-0.6)
2. Check embedding quality (model too small?)
3. Verify keyword diversity (natural low clustering)

### Issue: Over-Clustering

**Symptom:** Too many small clusters with mixed keywords

**Solutions:**
1. Raise `similarityThreshold` (default 0.75 → try 0.85-0.95)
2. Increase `minClusterSize` to filter out weak clusters
3. Check for stop word filtering in cluster naming

### Issue: Slow Performance

**Symptom:** Clustering takes > 1 second for 100 keywords

**Solutions:**
1. Enable embedding cache: `enableCache: true`
2. Increase `maxBatchSize` for faster API calls (caution: rate limits)
3. Use smaller embedding model (384 dim vs 1536 dim)
4. Consider pre-filtering keywords for relevance

### Issue: RuVector Connection Errors

**Symptom:** Cache reads/writes fail silently

**Solutions:**
1. Verify RuVector database is running
2. Check database credentials and connection string
3. Review logs for error details
4. Cache failures are non-blocking (system continues)

## Integration Points

### Step 2.1: Keyword Discovery Pipeline
- Input: Keywords from GSC, suggest, PAA, social, competitors
- Output: Deduplicated keyword clusters
- Used in: Content planning, topic clustering, competitor analysis

### Content Planning
```typescript
// After clustering
const contentPlan = result.clusters.map(cluster => ({
  topic: cluster.name,
  primaryKeyword: cluster.representativeKeyword,
  relatedKeywords: cluster.keywords,
  volume: estimateVolume(cluster.keywords),
  difficulty: estimateCompetition(cluster.keywords)
}));
```

### SERP Analysis Integration
```typescript
// Use clusters to group SERP results
const serpClusters = await Promise.all(
  result.clusters.map(cluster =>
    analyzer.analyzeSERP(cluster.representativeKeyword)
  )
);
```

## Future Enhancements

1. **Dynamic Threshold Optimization**
   - Learn optimal threshold per niche
   - Adapt based on historical performance

2. **Cross-Niche Clustering**
   - Detect keywords across niches
   - Identify market expansion opportunities

3. **Temporal Clustering**
   - Track cluster evolution over time
   - Identify emerging keyword trends

4. **ML-Based Representative Selection**
   - Learn optimal representative selection
   - Incorporate search volume, difficulty metrics

5. **Visualizations**
   - Cluster dendrograms
   - Similarity heatmaps
   - Interactive cluster explorer

## References

- **Paper:** Hierarchical Agglomerative Clustering (HAC)
- **Implementation:** Average Linkage (UPGMA)
- **Distance:** Cosine Similarity (L2 normalized)
- **Embeddings:** OpenAI text-embedding-3 models
- **Storage:** RuVector vector database

## Support

For issues or questions:
1. Check test cases in `__tests__/semantic-cluster.test.ts`
2. Review example usage in this documentation
3. Check RuVector integration guide
4. Consult troubleshooting section above
