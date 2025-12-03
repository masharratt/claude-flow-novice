# SEO Onboarding Storage Schema

**Epic:** SEO Site Onboarding & Keyword Discovery System with RuVector Intelligence
**Sprint:** 1.1
**Deliverable:** 1.1.4 - Redis + RuVector Dual Storage Schema

---

## Overview

The SEO onboarding system uses a dual-storage architecture combining Redis for real-time task artifacts and RuVector for semantic search and pattern learning. This approach enables:

- **Fast task coordination** via Redis key-value operations
- **Intelligent caching** via RuVector semantic search
- **Pattern learning** from successful onboarding runs
- **80%+ cost savings** through research reuse

---

## Implementation Status

### Completed (Sprint 1.1)
- **RuVector Schemas**: 100% complete for 3 new collections
  - `SiteProfileEntry` (site_profiles collection, 180-day TTL)
  - `OnboardingResultsEntry` (onboarding_results collection, 365-day TTL)
  - `CrossSitePatternEntry` (cross_site_patterns collection, 365-day TTL)
- **TypeScript Type Safety**: Zero `any` types, full validation helpers
- **Redis Schema**: Documented for 7 phase outputs + status tracking

### Deferred to Sprint 1.2 (Backlog)
RuVector **client functions** for querying and storage are not yet implemented. The following functions are required:

1. **`upsertSiteProfile(domain: string, profile: SiteProfileMetadata): Promise<void>`**
   - Store/update site profile in `site_profiles` collection
   - Generate embedding from profile data
   - Set 180-day TTL

2. **`queryCrossSitePatterns(industry: string, limit: number): Promise<CrossSitePatternEntry[]>`**
   - Semantic search across `cross_site_patterns` collection
   - Filter by industry, sort by confidence score
   - Return top N patterns

3. **`logOnboardingResult(domain: string, results: OnboardingResultsMetadata): Promise<void>`**
   - Store complete onboarding run in `onboarding_results` collection
   - Include all 7 phase outputs, timestamps, confidence scores
   - Set 365-day TTL for long-term learning

**Backlog Reference**: Item created via `.claude/skills/cfn-backlog-management/add-backlog-item.sh`

---

## Redis Storage Schema

### Purpose
Redis provides fast key-value storage for:
- Active task coordination (agents read/write current phase outputs)
- Real-time status tracking (coordinator monitors progress)
- Session artifacts (available for 30 days)

### Key Namespace Structure

```
seo:site:{domain}:status                     # Overall onboarding status
seo:site:{domain}:run:{runId}:phase:{N}      # Phase N output artifact
seo:site:{domain}:run:{runId}:final          # Final strategy document
seo:site:{domain}:run:{runId}:metadata       # Run metadata
```

### Status Keys

#### `seo:site:{domain}:status`
**Type:** Hash
**Fields:**
- `currentPhase` - Current phase number (1-7)
- `runId` - Active run ID
- `status` - One of: `pending`, `in_progress`, `completed`, `failed`, `blocked`
- `startedAt` - ISO timestamp
- `completedAt` - ISO timestamp (if complete)
- `phasesCompleted` - Number of phases completed (0-7)
- `blockingReason` - Reason if status=blocked (e.g., "technical_health_below_threshold")

**TTL:** 30 days

**Example:**
```json
{
  "currentPhase": "3",
  "runId": "run_2025-12-03_abc123",
  "status": "in_progress",
  "startedAt": "2025-12-03T10:30:00Z",
  "phasesCompleted": "2",
  "blockingReason": null
}
```

---

### Phase Output Keys

#### `seo:site:{domain}:run:{runId}:phase:1` - Technical Foundation
**Type:** JSON
**Schema:**
```json
{
  "phaseId": 1,
  "phaseName": "Technical Foundation",
  "completedAt": "2025-12-03T10:45:00Z",
  "confidence": 0.92,
  "output": {
    "technicalHealthScore": 0.87,
    "blockingCondition": false,
    "crawlData": {
      "totalPages": 245,
      "indexablePages": 230,
      "nonIndexablePages": 15,
      "redirects": 5,
      "brokenLinks": 3
    },
    "coreWebVitals": {
      "lcp": 1.8,
      "fid": 45,
      "cls": 0.05,
      "overallScore": "good"
    },
    "technicalMetrics": [
      {
        "category": "indexability",
        "score": 0.94,
        "issues": ["3 broken internal links"],
        "recommendations": ["Fix broken links on /blog/post-1"]
      },
      {
        "category": "performance",
        "score": 0.85,
        "issues": ["LCP on /services is 2.4s"],
        "recommendations": ["Optimize hero image on services page"]
      }
    ],
    "siteArchitecture": {
      "maxDepth": 4,
      "avgDepth": 2.3,
      "orphanedPages": 2
    }
  }
}
```
**TTL:** 30 days

---

#### `seo:site:{domain}:run:{runId}:phase:2` - Content Inventory
**Type:** JSON
**Schema:**
```json
{
  "phaseId": 2,
  "phaseName": "Content Inventory",
  "completedAt": "2025-12-03T11:15:00Z",
  "confidence": 0.89,
  "output": {
    "totalPages": 245,
    "contentByType": {
      "blog": 120,
      "product": 45,
      "service": 15,
      "landing": 10,
      "other": 55
    },
    "contentQualityDistribution": {
      "thin": 35,
      "adequate": 150,
      "comprehensive": 60
    },
    "duplicateContent": [
      {
        "page1": "/blog/seo-tips",
        "page2": "/resources/seo-guide",
        "similarity": 0.87
      }
    ],
    "internalLinking": {
      "avgInternalLinks": 8.5,
      "pagesWithNoInternalLinks": 12,
      "mostLinkedPages": [
        { "url": "/", "inboundLinks": 245 },
        { "url": "/about", "inboundLinks": 180 }
      ]
    },
    "contentGaps": ["No content targeting 'medical clinic marketing'"]
  }
}
```
**TTL:** 30 days

---

#### `seo:site:{domain}:run:{runId}:phase:3` - Competitor Discovery
**Type:** JSON
**Schema:**
```json
{
  "phaseId": 3,
  "phaseName": "Competitor Discovery",
  "completedAt": "2025-12-03T12:00:00Z",
  "confidence": 0.91,
  "output": {
    "competitorsIdentified": 5,
    "competitors": [
      {
        "domain": "competitor1.com",
        "domainAuthority": 65,
        "estimatedTraffic": 150000,
        "topKeywords": ["medical clinic", "healthcare services", "patient care"],
        "backlinks": 25000,
        "contentStrategy": "Three-pillar blog strategy with service pages",
        "serpFeatures": ["featured_snippets", "people_also_ask"]
      }
    ],
    "competitiveGaps": [
      "Competitors dominate 'medical clinic near me' searches",
      "Competitor1 owns 15 featured snippets"
    ],
    "sharedKeywords": 45,
    "uniqueKeywords": 120
  }
}
```
**TTL:** 30 days

---

#### `seo:site:{domain}:run:{runId}:phase:4` - Keyword Universe
**Type:** JSON
**Schema:**
```json
{
  "phaseId": 4,
  "phaseName": "Keyword Universe",
  "completedAt": "2025-12-03T13:30:00Z",
  "confidence": 0.93,
  "output": {
    "totalKeywords": 587,
    "keywordsByIntent": {
      "informational": 320,
      "commercial": 180,
      "transactional": 67,
      "navigational": 20
    },
    "topOpportunities": [
      {
        "keyword": "medical clinic marketing",
        "volume": 2400,
        "difficulty": 35,
        "intent": "commercial",
        "opportunityScore": 0.85,
        "currentRank": null,
        "competitorRanks": [1, 3, 5]
      }
    ],
    "clusters": [
      {
        "name": "Patient Acquisition",
        "keywords": 85,
        "totalVolume": 45000,
        "avgDifficulty": 42
      }
    ],
    "apiCallsMade": 50,
    "apiCallsCached": 200,
    "cacheHitRate": 0.80
  }
}
```
**TTL:** 30 days

---

#### `seo:site:{domain}:run:{runId}:phase:5` - Gap Analysis
**Type:** JSON
**Schema:**
```json
{
  "phaseId": 5,
  "phaseName": "Gap Analysis",
  "completedAt": "2025-12-03T14:00:00Z",
  "confidence": 0.90,
  "output": {
    "totalGaps": 127,
    "keywordGaps": [
      {
        "keyword": "telemedicine clinic",
        "volume": 1800,
        "difficulty": 28,
        "competitorsRanking": 3,
        "trafficPotential": 540,
        "priority": "HIGH"
      }
    ],
    "contentGaps": [
      {
        "topic": "Virtual clinic setup",
        "competitorCoverage": 4,
        "trafficPotential": 2500,
        "priority": "MEDIUM"
      }
    ],
    "backlinkGaps": [
      {
        "domain": "healthcareblog.com",
        "linksToCompetitors": 5,
        "linksToYou": 0,
        "authority": 72
      }
    ],
    "serpFeatureGaps": [
      {
        "feature": "featured_snippet",
        "keyword": "best medical clinic software",
        "currentOwner": "competitor1.com"
      }
    ]
  }
}
```
**TTL:** 30 days

---

#### `seo:site:{domain}:run:{runId}:phase:6` - Strategy Creation
**Type:** JSON
**Schema:**
```json
{
  "phaseId": 6,
  "phaseName": "Strategy Creation",
  "completedAt": "2025-12-03T15:00:00Z",
  "confidence": 0.88,
  "output": {
    "contentPillars": [
      {
        "name": "Patient Acquisition",
        "topics": ["marketing strategies", "online presence", "local SEO"],
        "targetKeywords": 85,
        "estimatedTraffic": 45000
      },
      {
        "name": "Clinic Operations",
        "topics": ["practice management", "efficiency", "software"],
        "targetKeywords": 62,
        "estimatedTraffic": 28000
      }
    ],
    "quickWins": [
      {
        "action": "Create 'medical clinic marketing guide' pillar page",
        "effort": "medium",
        "impact": "high",
        "timeframe": "Month 1"
      }
    ],
    "competitiveMoat": "Focus on local clinic management vs. generic healthcare advice",
    "linkBuildingStrategy": {
      "primaryTactics": ["Resource link building", "Local partnerships"],
      "targetDomains": 50,
      "estimatedTimeframe": "6 months"
    },
    "technicalIssuesTimeline": [
      {
        "issue": "Fix 3 broken internal links",
        "priority": "HIGH",
        "timeframe": "Week 1"
      }
    ]
  }
}
```
**TTL:** 30 days

---

#### `seo:site:{domain}:run:{runId}:phase:7` - Roadmap Generation
**Type:** JSON
**Schema:**
```json
{
  "phaseId": 7,
  "phaseName": "Roadmap Generation",
  "completedAt": "2025-12-03T15:30:00Z",
  "confidence": 0.91,
  "output": {
    "milestones": [
      {
        "month": 1,
        "name": "Foundation",
        "tasks": [
          "Fix technical issues",
          "Create 2 pillar pages",
          "Optimize existing service pages"
        ],
        "kpis": {
          "technicalHealthScore": 0.95,
          "newContentPieces": 2,
          "keywordsTargeted": 25
        }
      },
      {
        "month": 2,
        "name": "Content Build",
        "tasks": [
          "Publish 8 cluster articles",
          "Launch link building campaign",
          "Implement schema markup"
        ],
        "kpis": {
          "newContentPieces": 8,
          "backlinksAcquired": 15,
          "avgRankImprovement": 5
        }
      }
    ],
    "sixMonthTarget": {
      "organicTraffic": "+150%",
      "rankings": "50 keywords in top 10",
      "conversions": "+75%"
    },
    "twelveMonthTarget": {
      "organicTraffic": "+300%",
      "rankings": "100 keywords in top 10",
      "conversions": "+150%"
    }
  }
}
```
**TTL:** 30 days

---

### Final Output Keys

#### `seo:site:{domain}:run:{runId}:final`
**Type:** JSON
**Schema:**
```json
{
  "domain": "example.com",
  "runId": "run_2025-12-03_abc123",
  "completedAt": "2025-12-03T15:30:00Z",
  "overallConfidence": 0.90,
  "executiveSummary": {
    "currentState": "Site has solid technical foundation (0.87 health score) but lacks content depth",
    "keyFindings": [
      "587 keyword opportunities identified",
      "127 competitive gaps discovered",
      "80% cache hit rate achieved (cost savings)"
    ],
    "primaryRecommendation": "Focus on patient acquisition content pillar in Month 1-2"
  },
  "phaseOutputs": {
    "phase1": { "technicalHealthScore": 0.87 },
    "phase2": { "totalPages": 245, "contentQuality": "adequate" },
    "phase3": { "competitorsIdentified": 5 },
    "phase4": { "totalKeywords": 587, "cacheHitRate": 0.80 },
    "phase5": { "totalGaps": 127 },
    "phase6": { "contentPillars": 3, "quickWins": 5 },
    "phase7": { "milestonesCreated": 6 }
  },
  "topKeywordOpportunities": [
    { "keyword": "medical clinic marketing", "score": 0.85 }
  ],
  "topContentGaps": [
    { "topic": "Virtual clinic setup", "priority": "MEDIUM" }
  ],
  "roadmapUrl": "/docs/seo-roadmap-example-com.md",
  "ruvectorMetrics": {
    "cacheHitRate": 0.80,
    "patternsApplied": 3,
    "estimatedCostSavings": "$45"
  }
}
```
**TTL:** 30 days

---

#### `seo:site:{domain}:run:{runId}:metadata`
**Type:** Hash
**Fields:**
- `runId` - Unique run identifier
- `domain` - Target domain
- `industry` - Site industry (e.g., "healthcare")
- `niche` - Sub-niche (e.g., "medical-clinics")
- `competitors` - Comma-separated competitor domains
- `startedAt` - ISO timestamp
- `completedAt` - ISO timestamp
- `totalPhases` - Total phases (7)
- `phasesCompleted` - Phases completed (0-7)
- `overallConfidence` - Average confidence across all phases
- `apiCallsMade` - Total API calls made
- `apiCallsCached` - Total API calls avoided via RuVector
- `cacheHitRate` - Cache hit percentage

**TTL:** 30 days

---

## RuVector Storage Schema

### Purpose
RuVector provides semantic search and pattern learning for:
- Pre-research queries (Step 0: check cache before phase starts)
- Post-research storage (Step 4.5: store new findings)
- Pattern extraction (Step 12.5: extract successful strategies)
- Long-term intelligence (TTL: 180-365 days)

### Collections

#### 1. `seo_site_profiles` (Site Profiles)
**Purpose:** Cache site analysis results for future reference

**Entry Type:** `SiteProfileEntry`

**Key Fields:**
- `domain` - Site domain
- `industry`, `niche` - Classification
- `technicalHealthScore` - Overall health (0.0-1.0)
- `crawlData` - Technical audit results
- `technicalMetrics` - Detailed health metrics
- `blockingConditionScore` - <0.5 blocks progression

**TTL:** 180 days
**ID Format:** `{domain_normalized}`
**Embedding Text:** Domain, industry, health score, page count, niche

**Query Example:**
```typescript
const queryStr = buildSiteProfileQueryString({
  domain: 'example.com',
  minFreshnessScore: 0.7,
  industry: 'healthcare'
});
const results = await ruvector.search('seo_site_profiles', queryStr);
```

---

#### 2. `seo_onboarding_results` (Onboarding Results)
**Purpose:** Store complete onboarding run outputs

**Entry Type:** `OnboardingResultsEntry`

**Key Fields:**
- `domain`, `runId` - Unique identification
- `industry`, `niche` - Classification
- `phaseOutputs` - All 7 phase results
- `phasesCompleted` - Completion count
- `overallConfidence` - Result confidence (0.0-1.0)
- `keywordsDiscovered`, `contentGapsIdentified` - Metrics
- `apiCallsMade`, `apiCallsCached`, `cacheHitRate` - Cost tracking

**TTL:** 365 days
**ID Format:** `{domain_normalized}:{date}:{run_id}`
**Embedding Text:** Domain, phase count, confidence, industry, keyword count

**Query Example:**
```typescript
const queryStr = buildOnboardingResultsQueryString({
  domain: 'example.com',
  industry: 'healthcare',
  minConfidence: 0.8,
  successfulOnly: true
});
const results = await ruvector.search('seo_onboarding_results', queryStr);
```

---

#### 3. `seo_cross_site_patterns` (Cross-Site Patterns)
**Purpose:** Store successful strategies by industry

**Entry Type:** `CrossSitePatternEntry`

**Pattern Types:**
- `TECHNICAL_FOUNDATION`
- `CONTENT_STRUCTURE`
- `COMPETITOR_STRATEGY`
- `KEYWORD_CLUSTER`
- `BACKLINK_STRATEGY`
- `QUICK_WIN`
- `ROADMAP_MILESTONE`

**Key Fields:**
- `patternType` - One of above types
- `description`, `reasoning` - Pattern explanation
- `implementationSteps` - How to apply
- `applicableIndustries` - Industries where it works
- `overallConfidence` - Confidence score (0.0-1.0)
- `successCount`, `successRate` - Validation metrics
- `sourceProfileIds`, `validatingRunIds` - Origin tracking

**TTL:** 365 days
**ID Format:** `{pattern_type}:{industry}:{pattern_hash}`
**Embedding Text:** Pattern type, description, industries, confidence, application count

**Query Example:**
```typescript
const queryStr = buildCrossSitePatternQueryString({
  industry: 'healthcare',
  patternType: 'CONTENT_STRUCTURE',
  minConfidence: 0.8,
  minSuccessRate: 0.75
});
const patterns = await ruvector.search('seo_cross_site_patterns', queryStr);
```

---

## Dual Storage Sync Strategy

### Redis → RuVector (Post-Onboarding)
After all 7 phases complete successfully:

1. **Read from Redis:**
   - Fetch `seo:site:{domain}:run:{runId}:phase:{1-7}`
   - Fetch `seo:site:{domain}:run:{runId}:metadata`

2. **Transform to RuVector:**
   - Create `SiteProfileEntry` from Phase 1 output
   - Create `OnboardingResultsEntry` from all phase outputs
   - Extract patterns → create `CrossSitePatternEntry[]`

3. **Store in RuVector:**
   - Upsert site profile (Step 4.5 equivalent)
   - Upsert onboarding results (logging)
   - Upsert patterns (Step 12.5 equivalent)

### RuVector → Redis (Pre-Phase Query)
Before starting each phase:

1. **Query RuVector:**
   - Check `seo_site_profiles` for cached site analysis
   - Check `seo_cross_site_patterns` for applicable strategies

2. **Cache Hit → Skip Work:**
   - If fresh profile exists, skip Phase 1
   - If patterns exist, apply to strategy (Phase 6)

3. **Cache Miss → Proceed:**
   - Run phase normally
   - Store output to Redis
   - Mark for RuVector storage post-onboarding

---

## TTL Management

### Redis TTLs
- **All keys:** 30 days (active task artifacts)
- **Purpose:** Fast access during onboarding, automatic cleanup

### RuVector TTLs
- **Site Profiles:** 180 days (6 months)
- **Onboarding Results:** 365 days (1 year)
- **Cross-Site Patterns:** 365 days (1 year)

### Freshness Scoring
```typescript
calculateFreshnessScore(createdAt, ttlDays)
// Returns: 1.0 (brand new) → 0.0 (expired)

isEntryStale(freshnessScore, threshold = 0.3)
// Returns: true if too old to reuse
```

**Example:**
- Entry created 90 days ago, TTL 180 days → freshness = 0.5 (still usable)
- Entry created 170 days ago, TTL 180 days → freshness = 0.06 (stale, skip cache)

---

## Query Helpers Reference

### Site Profile Queries
```typescript
buildSiteProfileQueryString({
  domain: 'example.com',           // Required
  minFreshnessScore: 0.7,          // Optional
  industry: 'healthcare'            // Optional
})
```

### Onboarding Results Queries
```typescript
buildOnboardingResultsQueryString({
  domain: 'example.com',           // Optional
  industry: 'healthcare',          // Optional
  minCompletionPercent: 80,        // Optional
  minConfidence: 0.8,              // Optional
  successfulOnly: true             // Optional
})
```

### Cross-Site Pattern Queries
```typescript
buildCrossSitePatternQueryString({
  industry: 'healthcare',          // Required
  patternType: 'CONTENT_STRUCTURE', // Optional
  minConfidence: 0.8,              // Optional
  minSuccessRate: 0.75,            // Optional
  siteSizeFilter: 'medium',        // Optional
  minFreshnessScore: 0.6           // Optional
})
```

---

## Storage Helpers Reference

### Create Site Profile
```typescript
createSiteProfileEntry(
  domain,
  industry,
  niche,
  phaseOutput,           // From Phase 1
  technicalMetrics,      // TechnicalHealthMetric[]
  crawlData,            // SiteProfileCrawlData
  additionalMetadata    // Optional overrides
)
```

### Create Onboarding Results
```typescript
createOnboardingResultsEntry(
  domain,
  runId,
  industry,
  niche,
  phaseOutputs,         // PhaseOutput[] (all 7 phases)
  additionalMetadata    // Optional overrides
)
```

### Create Cross-Site Pattern
```typescript
createCrossSitePatternEntry(
  patternType,          // CrossSitePatternType
  industry,
  description,
  implementationSteps,  // string[]
  successMetrics,       // IndustrySuccessMetric[]
  additionalMetadata    // Optional overrides
)
```

---

## Integration with 6 Existing SEO Collections

### Existing Collections (from cfn-seo-pipeline)
- `seo_expert_sources` - Expert quotes for content enrichment
- `seo_statistics` - Statistics and data points
- `seo_keyword_research` - Keyword research cache
- `seo_competitor_intelligence` - Competitor analysis
- `seo_serp_patterns` - SERP analysis patterns
- `seo_content_patterns` - Successful content patterns

### New Onboarding Collections
- `seo_site_profiles` - Site analysis results
- `seo_onboarding_results` - Complete phase outputs
- `seo_cross_site_patterns` - Industry strategies

### Combined TTL Matrix
```typescript
ALL_SEO_COLLECTION_TTL_DAYS = {
  // Existing
  seo_expert_sources: Infinity,
  seo_statistics: 180,
  seo_keyword_research: 90,
  seo_competitor_intelligence: 180,
  seo_serp_patterns: 21,
  seo_content_patterns: Infinity,

  // New (onboarding)
  seo_site_profiles: 180,
  seo_onboarding_results: 365,
  seo_cross_site_patterns: 365,
}
```

---

## Cost Savings Architecture

### Cache Hit Workflow
1. **Pre-Research Query (Step 0)** - Check RuVector before starting phase
2. **Skip API Calls** - If cache hit with good freshness, reuse results
3. **Log Savings** - Track API calls avoided (cost reduction)

### Cost Metrics Tracked
- `apiCallsMade` - Actual API calls made
- `apiCallsCached` - API calls avoided via RuVector
- `cacheHitRate` - Percentage of lookups with cache hits
- `estimatedCostSavings` - Dollar savings from cache reuse

### Target Savings (from Epic Goals)
- **80%+ reduction** in DataForSEO API calls via caching
- **60%+ cache hit rate** on repeat niche research
- **40%+ of insights** from stored patterns

---

## Implementation Files

### RuVector Schemas
- **File:** `.claude/skills/cfn-seo/ruvector/onboarding-schemas.ts`
- **Lines:** 1,167
- **Exports:** 37 (interfaces, type guards, helpers)
- **Type Safety:** Zero TypeScript errors

### Query Helpers (Deferred to Sprint 1.2)
- **File:** `.claude/skills/cfn-seo/ruvector/phase-queries.ts` (to be created)
- **Functions:**
  - `querySiteProfile(domain)`
  - `queryContentPatterns(industry, contentType)`
  - `queryCompetitorIntel(domain)`
  - `storeSiteProfile(domain, profile)`
  - `storeCompetitorIntel(competitor, intel)`

### Redis Integration
- **Coordination:** Handled by coordinator agent (Sprint 1.1)
- **Storage:** Native Redis client in phase implementations (Sprint 1.2-1.4)

---

## Related Documentation

- **RuVector Schemas:** `.claude/skills/cfn-seo/ruvector/onboarding-schemas.ts`
- **RuVector Index:** `.claude/skills/cfn-seo/ruvector/INDEX.md`
- **RuVector Usage:** `.claude/skills/cfn-seo/ruvector/USAGE_EXAMPLES.md`
- **Onboarding Design:** `planning/seo/SEO_SITE_ONBOARDING_DESIGN.md`
- **Epic:** `planning/epics/seo-onboarding-discovery/epic.json`

---

## Next Steps

**Sprint 1.1 Remaining:**
1. Create `/seo-onboard` slash command (Deliverable 1.1.1)
2. Create `seo-onboarding-coordinator` agent (Deliverable 1.1.2)
3. Create phase orchestration tests (Deliverable 1.1.5)

**Sprint 1.2:**
- Implement RuVector client functions (upsert, query)
- Implement Phase 1-3 with Redis storage
- Add pre-research queries (Step 0) to phases

**Sprint 1.3:**
- Implement Phase 4-5 with cache layer
- DataForSEO API wrapper with RuVector caching

**Sprint 1.4:**
- Implement Phase 6-7
- Pattern extraction module (Step 12.5)

---

**Author:** Code Implementation Agent
**Date:** 2025-12-03
**Confidence:** 0.91
