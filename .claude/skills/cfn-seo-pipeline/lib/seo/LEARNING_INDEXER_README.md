# Learning Data Indexer - RuVector Integration

## Overview

The Learning Data Indexer provides semantic search capabilities for SEO pipeline learning captures using RuVector vector database. It enables pattern discovery, performance analysis, and intelligent recommendations based on historical execution data.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   SEO Pipeline Execution                      │
│                                                               │
│  Step 12: Learning Capture                                   │
│  └─> IntelligenceCurator.captureLearning()                  │
│       ├─> Store JSON file (backward compatibility)           │
│       └─> Index in RuVector (semantic search)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Learning Indexer                           │
│                                                               │
│  - Converts learning to searchable text                      │
│  - Stores metadata (outcome, approach, metrics)              │
│  - Enables semantic queries                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    RuVector Storage                           │
│                                                               │
│  Vector DB:  learning-captures                               │
│  Entries:    ID + Searchable Text + Metadata                │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. Automatic Indexing

Learning captures are automatically indexed when created via `IntelligenceCurator.captureLearning()`:

```typescript
import { intelligenceCurator } from './intelligence-curator';

await intelligenceCurator.captureLearning({
  outcome: 'success',
  topic: 'TypeScript generics',
  context: {
    targetKeyword: 'TypeScript generics',
    approach: 'guide',
    metrics: {
      'step-1-keyword-research': 150.5,
      'step-2-competitor-analysis': 200.3,
    },
  },
  lessons: ['Use concrete examples', 'Include type safety benefits'],
  recommendations: ['Continue using pattern-2-91'],
  capturedAt: new Date(),
});
```

### 2. Semantic Search

Search learning data using natural language queries:

```typescript
import { learningIndexer } from './learning-indexer';

// Find relevant learnings
const results = await learningIndexer.searchLearnings(
  'JavaScript async patterns',
  {
    limit: 10,
    minSimilarity: 0.7,
    outcomeFilter: 'success', // Only successful attempts
    approachFilter: 'guide',   // Only guide-type content
  }
);

results.forEach(({ learning, similarity }) => {
  console.log(`[${similarity.toFixed(2)}] ${learning.topic}`);
  console.log(`  Approach: ${learning.context.approach}`);
  console.log(`  Recommendations: ${learning.recommendations.join(', ')}`);
});
```

### 3. Aggregated Analytics

Get performance metrics across all learning data:

```typescript
const metrics = await learningIndexer.getAggregatedMetrics('guide');

console.log(`Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
console.log('Average Step Timings:');
Object.entries(metrics.avgStepTimings).forEach(([step, timing]) => {
  console.log(`  ${step}: ${timing.toFixed(2)}ms`);
});
```

## Data Storage

### Primary Storage: RuVector Index

Learning data is stored **exclusively in RuVector** for semantic search and analytics:

- **Collection**: `learning-captures`
- **Content**: Searchable text + metadata
- **Benefits**: Semantic search, pattern discovery, aggregated analytics
- **Retrieval**: Via `searchLearnings()` and `getAggregatedMetrics()`

### Temporary JSON Files

JSON files are created **temporarily during indexing** and **deleted after successful indexing**:

- **Purpose**: Intermediate format for indexing process
- **Lifecycle**: Created → Indexed → Deleted
- **Preservation**: Only kept if indexing fails (for manual recovery)
- **Location**: `knowledge-store/learning/successes/` and `learning/failures/`

### Storage Locations

```
.claude/skills/cfn-seo-pipeline/lib/seo/knowledge-store/
├── learning/
│   ├── successes/  (empty - files deleted after indexing)
│   └── failures/   (empty - files deleted after indexing)
└── [RuVector index data]
```

**Note**:
- Learning directories may contain JSON files temporarily during indexing
- Files are automatically deleted after successful indexing
- Only preserved if indexing fails (for manual recovery)

## Migration

### One-Time Migration

Index existing learning files (deletes JSON after indexing by default):

```bash
# Default migration (indexes and deletes JSON files)
npm run migrate:learning

# Keep JSON files after indexing
npm run migrate:learning --keep-files

# Clear and rebuild index
npm run migrate:learning --clear

# Dry run (preview only, no deletion)
npm run migrate:learning --dry-run --verbose

# Custom knowledge store path
npm run migrate:learning --knowledge-store /path/to/knowledge-store
```

### Programmatic Migration

```typescript
import { LearningIndexer } from './learning-indexer';

const indexer = new LearningIndexer({
  knowledgeStorePath: './knowledge-store',
  verbose: true,
});

const stats = await indexer.indexAllLearnings();

console.log(`Indexed ${stats.totalIndexed} learnings`);
console.log(`Successes: ${stats.successCount}, Failures: ${stats.failureCount}`);
console.log(`Errors: ${stats.errors.length}`);
```

## API Reference

### LearningIndexer

```typescript
class LearningIndexer {
  constructor(config?: {
    knowledgeStorePath?: string;
    vectorDB?: VectorDB;
    collectionName?: string;
    verbose?: boolean;
  });

  // Index single learning
  async indexLearning(learning: LearningCapture): Promise<string>;

  // Index all JSON files
  async indexAllLearnings(): Promise<{
    successCount: number;
    failureCount: number;
    totalIndexed: number;
    errors: string[];
  }>;

  // Semantic search
  async searchLearnings(
    query: string,
    options?: {
      limit?: number;
      minSimilarity?: number;
      outcomeFilter?: 'success' | 'failure';
      approachFilter?: string;
    }
  ): Promise<Array<{ learning: LearningCapture; similarity: number }>>;

  // Analytics
  async getAggregatedMetrics(approach?: string): Promise<{
    totalLearnings: number;
    successRate: number;
    avgStepTimings: Record<string, number>;
    topRecommendations: Array<{ recommendation: string; count: number }>;
  }>;

  // Maintenance
  async deleteLearning(id: string): Promise<void>;
  async clearIndex(): Promise<void>;
}
```

### Convenience Functions

```typescript
// Quick access without instantiation
import { indexAllLearnings, searchLearnings } from './learning-indexer';

await indexAllLearnings();
const results = await searchLearnings('React hooks');
```

## Use Cases

### 1. Pattern Discovery

Find which approaches work best for specific topics:

```typescript
const successfulGuides = await learningIndexer.searchLearnings(
  'JavaScript tutorial',
  {
    outcomeFilter: 'success',
    approachFilter: 'guide',
    limit: 20,
  }
);

// Extract common patterns
const patterns = successfulGuides
  .flatMap(({ learning }) => learning.recommendations)
  .reduce((acc, rec) => {
    acc[rec] = (acc[rec] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

console.log('Most successful patterns:', patterns);
```

### 2. Performance Benchmarking

Compare step timings across approaches:

```typescript
const guideMetrics = await learningIndexer.getAggregatedMetrics('guide');
const tutorialMetrics = await learningIndexer.getAggregatedMetrics('tutorial');

console.log('Guide avg timing:', guideMetrics.avgStepTimings);
console.log('Tutorial avg timing:', tutorialMetrics.avgStepTimings);
```

### 3. Failure Analysis

Identify common failure patterns:

```typescript
const failures = await learningIndexer.searchLearnings('', {
  outcomeFilter: 'failure',
  limit: 50,
});

const failureReasons = failures
  .flatMap(({ learning }) => learning.lessons)
  .reduce((acc, lesson) => {
    acc[lesson] = (acc[lesson] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

console.log('Common failure reasons:', failureReasons);
```

### 4. Recommendation Engine

Get recommendations for new content:

```typescript
const query = 'Python async programming';

const similar = await learningIndexer.searchLearnings(query, {
  outcomeFilter: 'success',
  limit: 5,
  minSimilarity: 0.75,
});

const recommendations = similar.flatMap(({ learning }) =>
  learning.recommendations
);

console.log('Recommended patterns for', query);
console.log(recommendations);
```

## Testing

### Unit Tests

```bash
# Run all learning indexer tests
npm test -- learning-indexer.test.ts

# Watch mode
npm test -- --watch learning-indexer.test.ts
```

### Test Coverage

Tests cover:
- ✅ Indexing individual learnings
- ✅ Batch indexing from files
- ✅ Semantic search with filters
- ✅ Aggregated metrics calculation
- ✅ Delete and clear operations
- ✅ Error handling (outcome mismatch, empty directories)

Location: `.claude/skills/cfn-seo-pipeline/lib/seo/__tests__/learning-indexer.test.ts`

## Performance Considerations

### Indexing Performance

- **Batch indexing**: ~50-100 files/second (MockVectorDB)
- **Real-time indexing**: <10ms per learning capture
- **Search latency**: <50ms for typical queries

### Storage Overhead

- **JSON files**: ~1KB per learning (165 files = ~165KB)
- **Vector index**: Variable based on VectorDB implementation
- **Metadata**: ~500 bytes per entry

### Optimization Tips

1. **Batch Operations**: Use `indexAllLearnings()` for initial migration
2. **Selective Filtering**: Apply `outcomeFilter` and `approachFilter` to reduce search space
3. **Similarity Threshold**: Set `minSimilarity >= 0.7` to filter low-quality matches
4. **Limit Results**: Keep `limit <= 20` for UI display

## Troubleshooting

### Migration Issues

**Problem**: Migration fails with "Outcome mismatch" errors

**Solution**: Some files may have incorrect outcome values. Check file content:

```bash
jq '.outcome' knowledge-store/learning/successes/*.json | sort | uniq -c
```

**Problem**: No files found during migration

**Solution**: Verify knowledge store path:

```bash
ls -la .claude/skills/cfn-seo-pipeline/lib/seo/knowledge-store/learning/
```

### Search Issues

**Problem**: No results returned for obvious matches

**Solution**: Lower `minSimilarity` threshold or check if data is indexed:

```typescript
const metrics = await learningIndexer.getAggregatedMetrics();
console.log('Total learnings:', metrics.totalLearnings);
```

**Problem**: Search returns too many irrelevant results

**Solution**: Increase `minSimilarity` and add filters:

```typescript
const results = await learningIndexer.searchLearnings(query, {
  minSimilarity: 0.8,
  outcomeFilter: 'success',
  approachFilter: 'guide',
});
```

## Future Enhancements

### Planned Features

1. **Top Recommendations Extraction**: Parse recommendation patterns from stored data
2. **Trend Analysis**: Track success rate changes over time
3. **Pattern Correlation**: Identify which patterns work best for specific topics
4. **Real RuVector Integration**: Replace MockVectorDB with production VectorDB
5. **Advanced Analytics**: Cluster similar learnings, detect anomalies

### Integration Points

- **Step 0 Intelligence Preload**: Query historical learnings for context
- **Pattern Optimizer**: Use aggregated metrics to score patterns
- **Content Planner**: Recommend approaches based on similar topics
- **Performance Monitor**: Compare current execution to historical baselines

## Contributing

### Adding Features

1. Update `LearningIndexer` class in `learning-indexer.ts`
2. Add corresponding tests in `__tests__/learning-indexer.test.ts`
3. Update this README with new functionality
4. Run full test suite: `npm test`

### Code Standards

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public methods
- Include error handling for all async operations
- Maintain backward compatibility with JSON storage

## See Also

- [IntelligenceCurator](./lib/intelligence-curator.ts) - Learning capture integration
- [RuVector Core](./lib/ruvector-core.ts) - Vector database implementation
- [SEO Types](./types/index.ts) - Type definitions
- [Migration Script](./scripts/migrate-learning-data.ts) - Batch indexing tool
