# Phase 4-5 Type System - Quick Reference

## Import Everything You Need

```typescript
// Single import for all Phase 4-5 types
import type {
  // RuVector types
  VectorDB,
  VectorEntry,
  VectorQueryOptions,
  EmbeddingFunction,
  VectorDBFactory,

  // Gap Analysis types
  CompetitorGapType,
  GapOpportunityPriority,
  GapOpportunityStatus,
  ContentGap,
  GapAnalysisResult,
  GapOpportunity,
  GapAnalysisCacheEntry,

  // Opportunity Scoring types
  ScoringDimension,
  ScoreComponent,
  OpportunityScore,
  KeywordOpportunityAnalysis,
  OpportunityRankingSet,
  OpportunityPortfolio,
  OpportunityConfidenceMetrics,

  // DataForSEO API types
  SearchIntentType,
  DataForSEOKeywordData,
  DataForSEOSERPResult,
  DataForSEOSERPAnalysis,
  DataForSEORankPosition,
  DataForSEOBacklinkData,
  DataForSEOErrorResponse,
  DataForSEOAPIResponse,
  CachedDataForSEOResearch,

  // Composite type
  Phase45ResearchContext,

  // Type guards
  isVectorEntry,
  isGapOpportunity,
  isOpportunityScore,
} from '@/types/phase-4-5-foundation';
```

## Phase 4: Gap Analysis Types

### CompetitorGapType (Union)
```typescript
type CompetitorGapType =
  | 'content_missing'      // Content doesn't exist on your site
  | 'format_opportunity'   // Different format (video, infographic, etc.)
  | 'depth_improvement'    // Content is shallower than competitors
  | 'freshness_gap'        // Content is outdated vs competitors
  | 'feature_gap'          // Missing SERP feature optimization
  | 'backlink_opportunity' // Competitors have backlinks you don't
  | 'entity_gap'           // Missing entity mentions
  | 'schema_gap'           // Missing schema markup
```

### GapOpportunity (Interface)
```typescript
interface GapOpportunity {
  id: string;
  type: CompetitorGapType;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'identified' | 'validated' | 'prioritized' | 'assigned' | 'completed';
  keyword: string;
  estimatedTrafficValue?: number;
  difficulty?: number;
  recommendation: string;
  competitors: Array<{
    domain: string;
    url: string;
    rankPosition?: number;
  }>;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### GapAnalysisResult (Interface)
```typescript
interface GapAnalysisResult {
  targetKeyword: string;
  yourUrl?: string;
  competitorAnalyzed: number;
  gapsIdentified: ContentGap[];
  totalGapScore: number;
  averageGapScore: number;
  timestamp: Date;
}
```

## Phase 5: Opportunity Scoring Types

### ScoringDimension (Union)
```typescript
type ScoringDimension =
  | 'search_volume'           // Monthly search volume
  | 'traffic_potential'       // Estimated traffic impact
  | 'difficulty'              // Keyword difficulty score
  | 'relevance'               // Topic relevance to site
  | 'implementation_effort'   // Effort to implement
  | 'competitive_advantage'   // Your competitive advantage
  | 'time_to_impact'          // Time to see ranking results
  | 'freshness'               // Freshness of opportunity
  | 'authority_gain'          // Authority building potential
```

### OpportunityScore (Interface)
```typescript
interface OpportunityScore {
  opportunityId: string;
  overallScore: number;  // 0-100
  components: ScoreComponent[];
  percentileRank: number;  // 0-100
  recommendation: 'immediate' | 'high_priority' | 'medium_priority' | 'defer' | 'skip';
  nextReviewDate: Date;
}

interface ScoreComponent {
  dimension: ScoringDimension;
  weight: number;  // 0-1
  rawScore: number;
  normalizedScore: number;  // 0-1
  reasoning: string;
}
```

### OpportunityPortfolio (Interface)
```typescript
interface OpportunityPortfolio {
  immediate: KeywordOpportunityAnalysis[];
  highPriority: KeywordOpportunityAnalysis[];
  mediumPriority: KeywordOpportunityAnalysis[];
  deferred: KeywordOpportunityAnalysis[];
  totalScore: number;
  estimatedMonthlyTraffic: number;
  implementationCapacity: 'constrained' | 'balanced' | 'abundant';
  generatedAt: Date;
}
```

## RuVector Integration Types

### VectorDB (Interface)
```typescript
interface VectorDB {
  add(id: string, text: string, metadata: Record<string, unknown>): Promise<void>;
  query(text: string, options?: VectorQueryOptions): Promise<VectorEntry[]>;
  update(id: string, text: string, metadata: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
  clear(): Promise<void>;
}
```

### VectorEntry (Generic Interface)
```typescript
interface VectorEntry<T = Record<string, unknown>> {
  id: string;
  text: string;
  metadata: T;
  similarity?: number;
  score?: number;
}

// Usage
const entry: VectorEntry<GapOpportunity> = {
  id: "gap-001",
  text: "content gap for keyword xyz",
  metadata: { /* GapOpportunity data */ }
};
```

## DataForSEO API Types

### DataForSEOKeywordData (Interface)
```typescript
interface DataForSEOKeywordData {
  keyword: string;
  search_volume: number;
  cpc: number;
  competition: number;
  search_intent_type: 'informational' | 'navigational' | 'commercial' | 'transactional';
  keyword_difficulty: number;
  monthly_searches: Array<{
    month: number;
    year: number;
    search_volume: number;
  }>;
}
```

### DataForSEOSERPAnalysis (Interface)
```typescript
interface DataForSEOSERPAnalysis {
  keyword: string;
  location: string;
  language: string;
  search_engine: string;
  results_count: number;
  serp_items: DataForSEOSERPResult[];
  featured_snippet?: {
    title: string;
    description: string;
    url: string;
    domain: string;
  };
  people_also_ask?: Array<{
    question: string;
    answers: Array<{
      title: string;
      url: string;
      domain: string;
    }>;
  }>;
  related_searches?: string[];
}
```

### DataForSEOAPIResponse (Generic Interface)
```typescript
interface DataForSEOAPIResponse<T> {
  status_code: number;
  status_message: string;
  time: string;
  data: T;
}

// Usage
const response: DataForSEOAPIResponse<DataForSEOKeywordData[]> = {
  status_code: 20000,
  status_message: 'Ok.',
  time: '2025-12-03T10:28:00Z',
  data: [{ /* KeywordData */ }]
};
```

## Type Guards (Runtime Validation)

```typescript
// Check if something is a VectorEntry
if (isVectorEntry(value)) {
  console.log(value.id, value.text);  // TypeScript knows it's VectorEntry
}

// Check if something is a GapOpportunity
if (isGapOpportunity(value)) {
  console.log(value.priority, value.type);  // Type-checked properties
}

// Check if something is an OpportunityScore
if (isOpportunityScore(value)) {
  console.log(value.overallScore, value.components);  // Type-checked
}
```

## Common Type Combinations

### Gap Analysis Workflow
```typescript
// Input: keyword + competitors
const keyword: string = "typescript types";
const competitors: string[] = ["competitor1.com", "competitor2.com"];

// Process
const result: GapAnalysisResult = await analyzer.analyze(keyword, competitors);

// Output: typed opportunities
const opportunities: GapOpportunity[] = result.gapsIdentified.map(gap => ({
  id: generateId(),
  type: gap.type,  // Type-safe gap type
  priority: calculatePriority(gap),  // 'critical' | 'high' | ...
  // ...
}));
```

### Opportunity Scoring Workflow
```typescript
// Input: gap opportunity
const gap: GapOpportunity = { /* ... */ };

// Process
const score: OpportunityScore = await scorer.scoreOpportunity(gap);

// Use typed result
const { overallScore, recommendation } = score;
if (recommendation === 'immediate') {
  // Handle immediate opportunities
}

// Aggregate to portfolio
const portfolio: OpportunityPortfolio = await scorer.generatePortfolio([gap]);
console.log(portfolio.totalScore);  // Aggregate score
```

## Build Commands

```bash
# Type check Phase 4-5
npm run check-types

# Build Phase 4-5 declarations only
npx tsc --project tsconfig.phase-4-5.json

# Full verification
npm run verify

# Watch mode for development
npm run build:watch
```

## Common Patterns

### Creating Typed Vector Entries
```typescript
const gapEntry: VectorEntry<GapOpportunity> = {
  id: `gap-${gap.type}-${keyword}`,
  text: `Gap: ${gap.type} for ${keyword}. ${gap.recommendation}`,
  metadata: gap,
};

await vectorDB.add(gapEntry.id, gapEntry.text, gapEntry.metadata);
```

### Querying Vector Database
```typescript
const results: VectorEntry<GapOpportunity>[] = await vectorDB.query(
  "content gap for typescript",
  { limit: 10, minSimilarity: 0.7 }
);

// Type-safe iteration
results.forEach(entry => {
  console.log(entry.metadata.priority);  // GapOpportunity property
});
```

### Building Opportunity Portfolios
```typescript
const immediate: KeywordOpportunityAnalysis[] = [];
const portfolio: OpportunityPortfolio = {
  immediate,
  highPriority: [],
  mediumPriority: [],
  deferred: [],
  totalScore: 0,
  estimatedMonthlyTraffic: 0,
  implementationCapacity: 'balanced',
  generatedAt: new Date(),
};
```

## Error Handling with Types

```typescript
try {
  const response: DataForSEOAPIResponse<DataForSEOKeywordData[]> =
    await dataforseoClient.get(keyword);

  if (response.status_code !== 20000) {
    throw new Error(`API Error: ${response.status_message}`);
  }

  // Type-safe data access
  const keywords = response.data;  // DataForSEOKeywordData[]
  keywords.forEach(kw => {
    console.log(kw.search_volume);  // Type-checked property
  });
} catch (error) {
  console.error('DataForSEO request failed:', error);
}
```

## Testing with Types

```typescript
// Mock type-safe test data
const mockGapOpportunity: GapOpportunity = {
  id: 'test-1',
  type: 'content_missing',
  priority: 'high',
  status: 'identified',
  keyword: 'test keyword',
  recommendation: 'Create missing content',
  competitors: [{
    domain: 'competitor.com',
    url: 'https://competitor.com/page',
  }],
  confidence: 0.85,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Type-safe assertions
expect(mockGapOpportunity.type).toBe('content_missing');
expect(mockGapOpportunity.priority).toBe('high');
expect(isGapOpportunity(mockGapOpportunity)).toBe(true);
```

---

**Last Updated**: 2025-12-03
**Version**: 1.0
**Status**: Ready for Phase 4-5 Implementation
