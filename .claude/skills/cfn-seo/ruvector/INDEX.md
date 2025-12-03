# RuVector SEO Onboarding Schemas - Implementation Index

## Overview

This directory contains RuVector collection schemas for the SEO onboarding system, enabling semantic search, intelligent caching, and pattern learning across the 7-phase onboarding pipeline.

**Deliverable:** Sprint 1.1, Deliverable 1.1.3 - RuVector SEO Onboarding Collections
**File:** `onboarding-schemas.ts`
**Lines of Code:** 1,167
**Type-Safe:** ✓ Zero TypeScript errors
**Exports:** 37 (interfaces, functions, type guards, constants)

---

## Collection Overview

### 1. Site Profiles (`seo_site_profiles`)
**Purpose:** Cache site analysis results for future reference and comparison

**Use Cases:**
- Check if site was previously analyzed (pre-research query)
- Compare technical health across similar sites
- Track technical metrics over time

**Key Fields:**
- `domain` - Site being analyzed
- `industry`, `niche` - Site classification
- `technicalHealthScore` - Overall health (0.0-1.0)
- `crawlData` - Technical audit results
- `technicalMetrics` - Detailed health metrics
- `blockingConditionScore` - <0.5 blocks phase progression

**TTL:** 180 days (6 months)
**ID Format:** `{domain_normalized}`
**Embedding Text:** Domain, industry, health score, page count, niche

---

### 2. Onboarding Results (`seo_onboarding_results`)
**Purpose:** Store complete onboarding run outputs for historical tracking and pattern extraction

**Use Cases:**
- Track all onboarding runs for a domain
- Compare results across different runs
- Extract patterns from successful completions
- Analyze site progression over time

**Key Fields:**
- `domain`, `runId` - Unique run identification
- `industry`, `niche` - Site classification
- `phaseOutputs` - All 7 phase results
- `phasesCompleted` - Completion tracking
- `overallConfidence` - Result confidence (0.0-1.0)
- `keywordsDiscovered`, `contentGapsIdentified` - Key metrics
- `apiCallsMade`, `apiCallsCached` - Cost tracking
- `cacheHitRate` - Intelligence reuse percentage

**TTL:** 365 days (1 year)
**ID Format:** `{domain_normalized}:{date}:{run_id}`
**Embedding Text:** Domain, phase count, confidence, industry, keyword count

---

### 3. Cross-Site Patterns (`seo_cross_site_patterns`)
**Purpose:** Store successful strategies by industry for pattern reuse on similar sites

**Use Cases:**
- Suggest proven strategies when onboarding new site in same industry
- Learn what works across industries
- Validate patterns against new data
- Extract industry best practices

**Key Fields:**
- `patternType` - One of: TECHNICAL_FOUNDATION, CONTENT_STRUCTURE, COMPETITOR_STRATEGY, KEYWORD_CLUSTER, BACKLINK_STRATEGY, QUICK_WIN, ROADMAP_MILESTONE
- `description`, `reasoning` - Pattern explanation
- `implementationSteps` - How to apply pattern
- `applicableIndustries` - Industries where it works
- `overallConfidence` - Confidence score (0.0-1.0)
- `successCount`, `successRate` - Validation metrics
- `sourceProfileIds`, `validatingRunIds` - Origin tracking

**TTL:** 365 days (1 year)
**ID Format:** `{pattern_type}:{industry}:{pattern_hash}`
**Embedding Text:** Pattern type, description, industries, confidence, application count

---

## Integration Points

### With Existing 6 SEO Collections

```typescript
ALL_SEO_COLLECTIONS = {
  // Existing collections (from cfn-seo-pipeline)
  EXPERT_SOURCES: 'seo_expert_sources',           // Expert quotes for content
  STATISTICS: 'seo_statistics',                    // Statistics for data backing
  KEYWORD_RESEARCH: 'seo_keyword_research',        // Keyword research cache
  COMPETITOR_INTELLIGENCE: 'seo_competitor_intelligence', // Competitor analysis
  SERP_PATTERNS: 'seo_serp_patterns',              // SERP analysis patterns
  CONTENT_PATTERNS: 'seo_content_patterns',        // Successful content patterns

  // New onboarding collections
  SITE_PROFILES: 'seo_site_profiles',              // Site analysis results
  ONBOARDING_RESULTS: 'seo_onboarding_results',    // Complete onboarding outputs
  CROSS_SITE_PATTERNS: 'seo_cross_site_patterns',  // Successful strategies
}
```

### Phase Integration Points

**Step 0 - Pre-Research (Pre-Phase Query)**
- Query `seo_site_profiles` before Phase 1
- Query `seo_cross_site_patterns` before each phase
- Skip redundant analysis if cache hit

**Step 4.5 - Post-Phase Storage**
- Store new site profile after Phase 1 completes
- Store new competitor intelligence after Phase 3
- Store new keyword research after Phase 4
- Store new SERP patterns after Phase 5

**Step 12.5 - Pattern Extraction (Post-Onboarding)**
- Extract site profile patterns
- Extract content strategy patterns
- Extract competitor positioning patterns
- Extract keyword cluster patterns
- Store in `seo_cross_site_patterns` for future reuse

---

## Type Safety Implementation

### Type Guards (Runtime Validation)
```typescript
isSiteProfileEntry(obj)           // Validate SiteProfileEntry
isOnboardingResultsEntry(obj)     // Validate OnboardingResultsEntry
isCrossSitePatternEntry(obj)      // Validate CrossSitePatternEntry
```

### Embedding Text Generators (Semantic Search)
```typescript
generateSiteProfileEmbeddingText(metadata)       // Create searchable text
generateOnboardingResultsEmbeddingText(metadata) // Create searchable text
generateCrossSitePatternEmbeddingText(metadata)  // Create searchable text
```

### ID Generators (Unique Identification)
```typescript
generateSiteProfileId(domain)
generateOnboardingResultsId(domain, runId, runDate)
generateCrossSitePatternId(patternType, industry, description)
normalizeForId(str)  // Utility for ID normalization
```

---

## Query Helpers (Pre-Research)

### Site Profile Lookup
```typescript
buildSiteProfileQueryString({
  domain: 'example.com',
  minFreshnessScore: 0.7,      // Optional: skip stale data
  industry: 'healthcare'        // Optional: filter by industry
}) // Returns query string for RuVector semantic search
```

### Onboarding Results Lookup
```typescript
buildOnboardingResultsQueryString({
  domain: 'example.com',
  industry: 'ecommerce',        // Optional
  minCompletionPercent: 80,     // Optional
  minConfidence: 0.8,           // Optional
  successfulOnly: true          // Optional: only successful runs
}) // Returns query string for RuVector semantic search
```

### Cross-Site Pattern Lookup
```typescript
buildCrossSitePatternQueryString({
  industry: 'saas',             // Required
  patternType: 'CONTENT_STRUCTURE',  // Optional: filter by type
  minConfidence: 0.8,           // Optional
  minSuccessRate: 0.75,         // Optional
  siteSizeFilter: 'medium',     // Optional
  minFreshnessScore: 0.6        // Optional
}) // Returns query string for RuVector semantic search
```

---

## Storage Helpers (Post-Research)

### Create Site Profile Entry
```typescript
createSiteProfileEntry(
  domain,
  industry,
  niche,
  phaseOutput,           // From Phase 1 completion
  technicalMetrics,      // TechnicalHealthMetric[]
  crawlData,            // SiteProfileCrawlData
  additionalMetadata    // Optional overrides
) // Returns: SiteProfileEntry ready for RuVector storage
```

### Create Onboarding Results Entry
```typescript
createOnboardingResultsEntry(
  domain,
  runId,
  industry,
  niche,
  phaseOutputs,         // PhaseOutput[] from all 7 phases
  additionalMetadata    // Optional overrides
) // Returns: OnboardingResultsEntry ready for RuVector storage
```

### Create Cross-Site Pattern Entry
```typescript
createCrossSitePatternEntry(
  patternType,          // CrossSitePatternType
  industry,
  description,
  implementationSteps,  // string[]
  successMetrics,       // IndustrySuccessMetric[]
  additionalMetadata    // Optional overrides
) // Returns: CrossSitePatternEntry ready for RuVector storage
```

---

## Freshness Management

### TTL by Collection
```typescript
ONBOARDING_COLLECTION_TTL_DAYS = {
  seo_site_profiles: 180,        // 6 months
  seo_onboarding_results: 365,   // 1 year
  seo_cross_site_patterns: 365,  // 1 year
}

ALL_SEO_COLLECTION_TTL_DAYS = {
  // Existing
  seo_expert_sources: Infinity,
  seo_statistics: 180,
  seo_keyword_research: 90,
  seo_competitor_intelligence: 180,
  seo_serp_patterns: 21,
  seo_content_patterns: Infinity,

  // New (same as above)
  seo_site_profiles: 180,
  seo_onboarding_results: 365,
  seo_cross_site_patterns: 365,
}
```

### Freshness Scoring
```typescript
calculateFreshnessScore(createdAt, ttlDays)
// Returns: 1.0 (fresh) → 0.0 (expired)
// Used to weight cached results and refresh stale data

isEntryStale(freshnessScore, threshold = 0.3)
// Returns: true if score < threshold
// Used to decide whether to skip API calls
```

---

## Cost Savings Architecture

### Cache Hit Workflow
1. **Pre-Research Query** - Check RuVector before starting phase
2. **Skip API Calls** - If cache hit with good freshness, reuse results
3. **Log Savings** - Track API calls avoided (cost reduction)

### Cost Metrics (Tracked in OnboardingResultsEntry)
- `apiCallsMade` - Actual API calls made
- `apiCallsCached` - API calls avoided via RuVector
- `cacheHitRate` - Percentage of lookups with cache hits
- `estimatedCostSavings` - Dollar savings from cache reuse

### Target Savings
- **80%+ reduction** in DataForSEO API calls via caching
- **60%+ cache hit rate** on repeat niche research
- **40%+ of insights** from stored patterns

---

## Usage Examples

### Pre-Onboarding (Phase 0)
```typescript
// Check if site was previously analyzed
const queryStr = buildSiteProfileQueryString({
  domain: 'example.com',
  minFreshnessScore: 0.7
});
const results = await ruvector.search(ONBOARDING_COLLECTIONS.SITE_PROFILES, queryStr);

if (results.length > 0 && !isEntryStale(results[0].metadata.freshnessScore)) {
  // Reuse cached profile instead of re-analyzing
  const cachedProfile = results[0] as SiteProfileEntry;
  skipPhase1 = true;
}
```

### Post-Phase 1 (After Technical Audit)
```typescript
// Store new site profile for future reference
const profile = createSiteProfileEntry(
  'example.com',
  'healthcare',
  'medical-clinics',
  phase1Output,
  technicalMetrics,
  crawlData
);

await ruvector.upsert(ONBOARDING_COLLECTIONS.SITE_PROFILES, [profile]);
```

### Pattern Lookup (Pre-Phase 6)
```typescript
// Find successful content strategies for same industry
const queryStr = buildCrossSitePatternQueryString({
  industry: 'healthcare',
  patternType: 'CONTENT_STRUCTURE',
  minConfidence: 0.8
});
const patterns = await ruvector.search(ONBOARDING_COLLECTIONS.CROSS_SITE_PATTERNS, queryStr);

// Apply patterns to strategy generation
const successfulPatterns = patterns.filter(p => !isEntryStale(p.metadata.freshnessScore));
```

### Post-Onboarding (Step 12.5)
```typescript
// Extract patterns from successful onboarding
const patternEntries = [
  createCrossSitePatternEntry(
    'CONTENT_STRUCTURE',
    'healthcare',
    'Three-pillar content strategy with internal linking clusters',
    ['Define 3 content pillars', 'Create internal linking maps', 'Build out cluster pages'],
    [{ industry: 'healthcare', successCount: 5, avgImprovement: 2.3, confidence: 0.85, lastValidatedAt: new Date() }]
  ),
  // ... more patterns
];

await ruvector.upsert(ONBOARDING_COLLECTIONS.CROSS_SITE_PATTERNS, patternEntries);
```

---

## File Structure

```
.claude/skills/cfn-seo/ruvector/
├── onboarding-schemas.ts      # Main schema definitions (1,167 lines)
├── INDEX.md                    # This file
└── [phase-queries.ts]         # Query helpers (to be created in sprint 1.2)
```

---

## Integration Checklist

- [x] **Site Profile Collection** - Domain metadata, technical health, industry classification
- [x] **Onboarding Results Collection** - Complete phase outputs, timestamps, confidence
- [x] **Cross-Site Patterns Collection** - Successful strategies by industry
- [x] **Integration with 6 Existing Collections** - References and TTL management
- [x] **Freshness Scoring** - calculateFreshnessScore(), isEntryStale()
- [x] **TTL Management** - All collections have defined TTLs
- [x] **Query Helpers** - Pre-research lookup functions
- [x] **Type Guards** - Runtime validation functions
- [x] **Embedding Generators** - Semantic search text generation
- [x] **ID Generators** - Consistent unique identification
- [x] **Storage Helpers** - Post-research creation functions

---

## Related Files

- Reference Schemas: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/schemas.ts`
- Onboarding Design: `planning/seo/SEO_SITE_ONBOARDING_DESIGN.md`
- Epic: `planning/epics/seo-onboarding-discovery/epic.json`
- Step 0 Integration: Phase coordinator (to be created in sprint 1.1)
- Step 4.5 Integration: Phase handlers (to be created in sprint 1.2-1.4)
- Step 12.5 Integration: Pattern extractor (to be created in sprint 1.4)

---

## Next Steps

**Sprint 1.1 - Remaining:**
1. Create `/seo-onboard` slash command (Deliverable 1.1.1)
2. Create `seo-onboarding-coordinator` agent (Deliverable 1.1.2)
3. Create Redis + RuVector dual storage schema (Deliverable 1.1.4)
4. Create phase orchestration tests (Deliverable 1.1.5)

**Sprint 1.2 - Phases 1-3 Implementation:**
- Phase 1: Technical Foundation with RuVector caching
- Phase 2: Content Inventory with pattern matching
- Phase 3: Competitor Discovery with intelligence reuse
- Create phase-specific query helpers (phase-queries.ts)

**Sprint 1.3 - Phases 4-5 Implementation:**
- Phase 4: Keyword Universe with cached research
- Phase 5: Gap Analysis with SERP pattern intelligence
- DataForSEO API wrapper with cache layer

**Sprint 1.4 - Phases 6-7 + Pattern Extraction:**
- Phase 6: Strategy Creation with pattern application
- Phase 7: Roadmap Generation
- Pattern Extraction Module (Step 12.5)

---

## Contact

**Implemented by:** TypeScript Specialist
**Date:** 2025-12-03
**Confidence Score:** 0.95

For questions or integration issues, refer to the epic at `planning/epics/seo-onboarding-discovery/epic.json`.
