# RuVector SEO Intelligence Storage - Design Document

## Executive Summary

This document outlines a strategy for storing SEO research and analysis in RuVector to enable:
- **80%+ cost reduction** for content clusters (research once, use many times)
- **75%+ time savings** (skip redundant research)
- **Self-improving system** (patterns learn from performance feedback)
- **Cross-niche intelligence** (insights transfer between topics)

## The Core Insight

SEO research has different **reuse lifespans**:

| Category | Lifespan | Examples |
|----------|----------|----------|
| **Evergreen** | Indefinite | Expert sources, statistics, best practices |
| **Topic-specific** | 1-6 months | Keyword research, competitor analysis, SERP patterns |
| **Article-specific** | Single use | Specific angle, article metadata |

By storing reusable data in RuVector with semantic search, we avoid re-researching the same topics.

---

## Six Collections

### 1. seo_expert_sources (Evergreen)

**Purpose:** Store expert sources found during research for reuse across articles.

**Schema:**
```typescript
interface ExpertSourceEntry {
  id: string;                    // "{name_normalized}:{primary_domain}"
  name: string;                  // "Dr. Jane Smith"
  credentials: string;           // "PhD in Genealogy, Author of..."
  topics: string[];              // ["family history", "genealogy"]
  authority_score: number;       // 0.0-1.0
  quotes: {
    text: string;
    context: string;
    topic_tags: string[];
    added_date: Date;
  }[];
  sources: { url: string; type: string }[];
  first_seen: Date;
  last_updated: Date;
  use_count: number;
  article_ids: string[];         // Track which articles used this expert
}
```

**Embedding Text:** `"{name} - {credentials}. Topics: {topics}. Key insight: {best_quote}"`

**TTL:** Never expires (authority_score adjusts based on performance)

**Query Examples:**
- "Find experts in family preservation"
- "Genealogy PhD authors"
- "Oral history researchers"

---

### 2. seo_statistics (Evergreen with decay)

**Purpose:** Store statistics and facts with citations for data-backed content.

**Schema:**
```typescript
interface StatisticEntry {
  id: string;                    // hash(statistic_normalized)
  statistic: string;             // "73% of families have lost oral traditions"
  numeric_value: number;         // 73
  unit: string;                  // "percent"
  topics: string[];              // ["family history", "preservation"]
  source_name: string;           // "Genealogy Research Institute"
  source_url: string;
  publication_date: Date;
  credibility_score: number;     // 0.0-1.0
  time_sensitive: boolean;       // True if stat will change over time
  first_seen: Date;
  last_verified: Date;
  use_count: number;
  article_ids: string[];
}
```

**Embedding Text:** `"{statistic}. Topic: {topics}. Source: {source_name}"`

**TTL:** 6+ months (time_sensitive stats decay faster)

**Query Examples:**
- "Statistics about family story preservation"
- "Percentage of families with genealogy interest"
- "Digital archive adoption rates"

---

### 3. seo_keyword_research (Topic-specific)

**Purpose:** Cache keyword research results for topic clusters.

**Schema:**
```typescript
interface KeywordResearchEntry {
  id: string;                    // keyword_normalized
  primary_keyword: string;
  search_volume: number;
  keyword_difficulty: number;
  cpc: number;
  search_intent: "informational" | "navigational" | "transactional" | "commercial";
  secondary_keywords: { keyword: string; volume: number; difficulty: number; cpc: number }[];
  long_tail_keywords: string[];
  people_also_ask: string[];
  related_searches: string[];
  cluster_id?: string;           // If part of a cluster
  niche: string;
  created_at: Date;
  expires_at: Date;              // 3 months from creation
  freshness_score: number;       // 1.0 → 0.0 over TTL
}
```

**Embedding Text:** `"{primary_keyword}. Related: {secondary_keywords}. Intent: {search_intent}. Questions: {people_also_ask}"`

**TTL:** 3 months (keyword metrics shift over time)

**Query Examples:**
- "Keyword research for preserve family stories"
- "Long-tail keywords about genealogy"
- "Informational intent keywords for family history"

---

### 4. seo_competitor_intelligence (Topic-specific)

**Purpose:** Store competitor analysis for reuse within a niche.

**Schema:**
```typescript
interface CompetitorIntelligenceEntry {
  id: string;                    // "{domain}:{niche_normalized}"
  domain: string;
  niche: string;
  architecture_patterns: {
    urlStructure: string;
    hierarchy: string;
    categoryPages: number;
  }[];
  content_strategy: {
    avgWordCount: number;
    publishFrequency: string;
    topFormats: string[];
  }[];
  hub_pages: { url: string; topic: string; internalLinks: number }[];
  internal_linking_patterns: string[];
  content_gaps: { topic: string; priority: string; opportunity: string }[];
  estimated_authority: number;
  cluster_id?: string;
  created_at: Date;
  expires_at: Date;              // 6 months
  freshness_score: number;
}
```

**Embedding Text:** `"Analysis of {domain} in {niche}. Architecture: {architecture_summary}. Gaps: {top_gaps}"`

**TTL:** 6 months (competitor strategies evolve slowly)

**Query Examples:**
- "Competitor analysis for family preservation niche"
- "Content gaps in genealogy space"
- "Hub page structures for storytelling sites"

---

### 5. seo_serp_patterns (Fast-changing)

**Purpose:** Store SERP analysis for keyword optimization.

**Schema:**
```typescript
interface SERPPatternEntry {
  id: string;                    // "{keyword_normalized}:{week_bucket}"
  keyword: string;
  features_present: { type: string; position: number }[];
  features_opportunity: { type: string; reason: string }[];
  ranking_patterns: {
    avgContentLength: number;
    avgDomainAuthority: number;
    freshnessSignal: boolean;
    topFactors: string[];
  };
  semantic_clusters: { topic: string; terms: string[] }[];
  top_competitors: string[];
  cluster_id?: string;
  captured_at: Date;
  expires_at: Date;              // 2-4 weeks
  freshness_score: number;
}
```

**Embedding Text:** `"SERP for {keyword}. Features: {features_present}. Top factors: {ranking_factors}"`

**TTL:** 2-4 weeks (SERPs change frequently)

**Query Examples:**
- "SERP features for preserve family stories"
- "Featured snippet opportunities in genealogy"
- "Ranking patterns for family history keywords"

---

### 6. seo_content_patterns (Learning-based)

**Purpose:** Store successful content patterns that can be replicated.

**Schema:**
```typescript
interface ContentPatternEntry {
  id: string;                    // "{type}:{pattern_hash}"
  type: "ANGLE" | "STRUCTURE" | "VOICE" | "HOOK" | "CTA" | "DEPTH";
  description: string;
  example: string;               // Actual example from successful article
  niche: string;
  format?: string;               // "how-to", "listicle", etc.
  performance_metrics?: {
    avgPosition: number;
    avgCTR: number;
    avgTimeOnPage: number;
  };
  confidence_score: number;      // 0.1-0.99, adjusts based on performance
  article_ids: string[];
  created_at: Date;
  last_used: Date;
  use_count: number;
  success_count: number;         // Articles with good performance
}
```

**Embedding Text:** `"{type}: {description}. Niche: {niche}. Success: {confidence_score}"`

**TTL:** Never expires (confidence adjusts based on feedback)

**Query Examples:**
- "Successful angle patterns for family preservation"
- "How-to structure patterns with high engagement"
- "Hook patterns that work for emotional topics"

---

## Workflow Integration

### Pre-Research Query (Step 0.5)

Before running research steps, query RuVector:

```
1. Query seo_keyword_research for topic
   → If fresh: SKIP Step 1, use cached
   → If stale/missing: Run Step 1, store result

2. Query seo_competitor_intelligence for niche
   → If fresh: SKIP Step 2.5, use cached
   → If stale/missing: Run Step 2.5, store result

3. Query seo_serp_patterns for keyword
   → If fresh: SKIP Step 3.5, use cached
   → If stale/missing: Run Step 3.5, store result

4. Query seo_expert_sources for topic
   → Always available, supplement if gaps

5. Query seo_statistics for topic
   → Always available, supplement if gaps

6. Query seo_content_patterns for niche/format
   → Guide content generation with proven patterns
```

### Post-Research Storage (Step 4.5)

After research completes, store to RuVector:

```
1. Store keyword research
   → Upsert by primary_keyword
   → Tag with cluster_id

2. Store competitor intelligence
   → Upsert by domain:niche
   → Tag with cluster_id

3. Store SERP patterns
   → Upsert by keyword:week_bucket
   → Tag with cluster_id

4. Extract and store expert sources
   → Merge quotes if expert exists
   → Create new if not found

5. Extract and store statistics
   → Dedupe by statistic_hash
   → Validate credibility
```

### Post-Success Learning (Step 12.5)

After successful content generation, store patterns:

```
1. Extract successful angle pattern
   → Store with initial confidence 0.5 + (consensus - 0.85) * 2

2. Extract successful structure pattern
   → Store with depth_quality weighting

3. Extract successful voice/hook patterns
   → Store with voice_authenticity weighting

4. Link patterns to article_id
   → Enable performance tracking
```

### Performance Feedback (Step 13.5)

After performance data available, update confidence:

```
1. Get patterns used by article
2. Calculate performance score (0-1)
3. If score > 0.7: boost confidence (+0.02 max)
4. If score < 0.3: reduce confidence (-0.03 max)
5. Update expert authority based on article performance
6. Update statistic credibility based on article performance
```

---

## Cluster Integration

When generating content clusters, share research:

```
1. Generate cluster_id at cluster creation
2. Run research ONCE, tag with cluster_id
3. All articles query by cluster_id
4. Research cost: 1× instead of N×
```

**Efficiency Gains:**

| Metric | Without RuVector | With RuVector |
|--------|------------------|---------------|
| Research per 10-article cluster | 10× | 1× |
| Research cost | $75 | $15 |
| Research time | 4 hours | 1 hour |
| Expert availability | 0 | Growing library |
| Pattern guidance | None | Performance-weighted |

---

## Freshness Management

Different collections decay at different rates:

| Collection | TTL | Decay Formula |
|------------|-----|---------------|
| seo_expert_sources | ∞ | authority_score adjusts |
| seo_statistics | 6+ months | credibility_score × (1 - days/180) for time_sensitive |
| seo_keyword_research | 3 months | freshness_score = 1 - (days / 90) |
| seo_competitor_intelligence | 6 months | freshness_score = 1 - (days / 180) |
| seo_serp_patterns | 2-4 weeks | freshness_score = 1 - (days / 21) |
| seo_content_patterns | ∞ | confidence_score adjusts |

**Query-Time Weighting:**
```
effective_relevance = semantic_similarity × freshness_score × confidence_score
```

**Cleanup Cron:**
- Weekly: Archive entries with freshness_score < 0.3
- Monthly: Prune collections to max size
- Quarterly: Re-embed if model changed

---

## Cross-Niche Intelligence

Enable learning transfer between related topics:

**Niche Hierarchy:**
```
Family History
├── Genealogy Research
├── Story Preservation
│   ├── Oral History
│   └── Digital Archives
└── Legacy Planning
```

**Cross-Niche Query Strategy:**
1. First: exact topic match
2. Second: parent topic entries
3. Third: sibling topic entries
4. Fourth: grandparent topic entries

**Cross-Niche Thresholds:**
- Same-niche similarity: 0.5
- Cross-niche similarity: 0.65 (stricter to reduce noise)

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cache hit rate | > 60% | (queries with usable cache) / (total queries) |
| Research cost reduction | > 70% | (baseline - actual) / baseline |
| Pattern reuse rate | 40-70% | (articles using patterns) / (total articles) |
| Cross-niche success | > 50% | (successful cross-niche) / (total cross-niche) |
| Query latency p95 | < 500ms | Monitoring |
| Confidence accuracy | > 0.7 | Correlation with actual performance |

---

## Implementation Phases

1. **Phase 1 (Week 1-2):** Create 6 collections with basic CRUD
2. **Phase 2 (Week 2-3):** Integrate storage into pipeline (Step 4.5)
3. **Phase 3 (Week 3-4):** Integrate queries into pre-research (Step 0.5)
4. **Phase 4 (Week 4-5):** Connect to cluster generator
5. **Phase 5 (Week 5-6):** Implement feedback loop (Step 13.5)
6. **Phase 6 (Week 6-7):** Cross-niche intelligence and analytics

---

## Files to Create

```
.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/
├── DESIGN.md                    # This file
├── schemas.ts                   # Collection schemas
├── collections/
│   ├── expert-sources.ts        # seo_expert_sources CRUD
│   ├── statistics.ts            # seo_statistics CRUD
│   ├── keyword-research.ts      # seo_keyword_research CRUD
│   ├── competitor-intelligence.ts
│   ├── serp-patterns.ts
│   └── content-patterns.ts
├── storage.ts                   # Unified storage utilities
├── queries.ts                   # Unified query utilities
├── freshness.ts                 # Freshness decay management
├── confidence-updater.ts        # Performance-based updates
├── cross-niche.ts               # Cross-niche query logic
└── index.ts                     # Public exports
```

---

## Version History

- **1.0.0** (2025-12-02): Initial design document
  - 6 collection architecture
  - Workflow integration points
  - Cluster optimization strategy
  - Feedback loop design
  - Cross-niche intelligence concept
