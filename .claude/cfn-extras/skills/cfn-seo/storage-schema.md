# Redis + RuVector Dual Storage Schema

**Sprint:** 1.1
**Deliverable:** 1.1.4
**Epic:** SEO Site Onboarding & Keyword Discovery System
**Created:** 2025-12-03
**Status:** Implementation Ready

---

## Purpose

Define dual storage architecture combining Redis (real-time artifacts) and RuVector (semantic search intelligence) for SEO onboarding and keyword discovery workflows.

**Design Goals:**
- Redis: Fast access to active onboarding artifacts (30-day TTL)
- RuVector: Persistent semantic intelligence with collection-specific TTL (14-180 days)
- Cost reduction: 80%+ via RuVector cache reuse
- Time savings: 75%+ via pattern matching

---

## Redis Schema

### Purpose

Redis provides fast key-value storage for **active onboarding sessions** and **real-time artifacts**. All onboarding data is stored in Redis during workflow execution for immediate access by coordinator and phase agents.

### Security: Redis Key Sanitization

**CRITICAL (CVSS 9.8):** All user-supplied input (domains, run IDs, industry, etc.) used in Redis key construction MUST be sanitized using `sanitizeRedisKey()` from `onboarding-schemas.ts`.

This prevents Redis command injection attacks via special characters:

```typescript
import { sanitizeRedisKey } from './onboarding-schemas';

// Unsafe (vulnerable to injection):
const key = `seo:site:${userDomain}:audit`;

// Safe (injection-protected):
const key = `seo:site:${sanitizeRedisKey(userDomain)}:audit`;
```

**Sanitization Rules:**
- Replace dangerous chars: `:*?[]{}|<>;"'$&()`\\n\\r\\t and whitespace with `_`
- Collapse multiple consecutive underscores to single `_`
- Convert to lowercase
- Remove leading/trailing underscores
- Ensure non-empty result (default: `_input_`)

**Example:**
```
Input:  evil.com;CONFIG GET *
Output: evil_com_config_get
```

### Key Patterns

All Redis keys follow the namespace pattern:

```
seo:site:{domain}:{artifact_type}
```

**Examples:**
```
seo:site:example_com:technical_audit
seo:site:example_com:content_inventory
seo:site:example_com:competitors
```

**Note:** Domain values are automatically sanitized by ID generation functions to prevent injection attacks.

### Key Structure Reference

| Artifact Type | Redis Key | Description | TTL (days) |
|--------------|-----------|-------------|------------|
| **Technical Audit** | `seo:site:{domain}:technical_audit` | Phase 1 technical health analysis | 30 |
| **Content Inventory** | `seo:site:{domain}:content_inventory` | Phase 2 existing content catalog | 30 |
| **Competitors** | `seo:site:{domain}:competitors` | Phase 3 competitor analysis | 30 |
| **Keyword Universe** | `seo:site:{domain}:keyword_universe` | Phase 4 comprehensive keyword database | 30 |
| **Gap Analysis** | `seo:site:{domain}:gaps` | Phase 5 opportunity identification | 30 |
| **Strategy** | `seo:site:{domain}:strategy` | Phase 6 SEO strategy document | 30 |
| **Roadmap** | `seo:site:{domain}:roadmap` | Phase 7 action plan | 30 |
| **Onboarding Status** | `seo:site:{domain}:status` | Coordinator tracking | 30 |
| **Phase Metadata** | `seo:site:{domain}:phase:{N}:metadata` | Individual phase execution data | 30 |

### Data Structures

**1. Technical Audit (Phase 1)**

```json
{
  "domain": "example.com",
  "phase": 1,
  "timestamp": "2025-12-03T10:00:00Z",
  "technical_health_score": 0.78,
  "critical_issues": [
    {
      "issue": "50 pages blocked by robots.txt",
      "severity": "HIGH",
      "fix_effort": "MEDIUM"
    }
  ],
  "performance": {
    "lcp": "3.2s",
    "fid": "180ms",
    "cls": "0.15",
    "mobile_friendly": true,
    "https_enabled": true
  },
  "indexability": {
    "pages_crawled": 450,
    "pages_indexed": 380,
    "orphan_pages": 25,
    "sitemap_valid": true
  },
  "site_architecture": {
    "max_depth": 5,
    "avg_internal_links_per_page": 8
  },
  "schema_markup": {
    "pages_with_schema": 120,
    "schema_types": ["Organization", "WebPage", "Article"]
  }
}
```

**2. Content Inventory (Phase 2)**

```json
{
  "domain": "example.com",
  "phase": 2,
  "timestamp": "2025-12-03T11:00:00Z",
  "content_inventory": {
    "total_pages": 450,
    "by_type": {
      "blog": 180,
      "product": 75,
      "service": 25,
      "landing": 40,
      "other": 130
    },
    "avg_word_count": 850,
    "thin_content_count": 45,
    "duplicate_content_count": 12
  },
  "existing_keywords": [
    {
      "keyword": "family history software",
      "pages": 8,
      "avg_position": 15
    }
  ],
  "content_clusters": [
    {
      "topic": "DNA Testing",
      "pages": 25,
      "internal_links": 45,
      "avg_word_count": 1200
    }
  ],
  "content_gaps_identified": [
    "DNA Test Comparison Guides",
    "Immigration Records Research"
  ]
}
```

**3. Competitors (Phase 3)**

```json
{
  "domain": "example.com",
  "phase": 3,
  "timestamp": "2025-12-03T12:00:00Z",
  "competitors_identified": 8,
  "primary_competitors": [
    {
      "domain": "ancestry.com",
      "da": 92,
      "monthly_traffic": "45M",
      "ranking_keywords": 850000,
      "backlinks": "12M",
      "content_strategy": "Comprehensive guides + tools",
      "avg_content_length": 2500,
      "publishing_frequency": "daily"
    }
  ],
  "competitive_position": {
    "your_da": 45,
    "your_traffic": "50K",
    "market_share": "0.1%"
  },
  "ruvector_cache_hits": 3,
  "new_competitors_analyzed": 5
}
```

**4. Keyword Universe (Phase 4)**

```json
{
  "domain": "example.com",
  "phase": 4,
  "timestamp": "2025-12-03T13:00:00Z",
  "keyword_universe": {
    "total_keywords": 2500,
    "by_intent": {
      "informational": 1500,
      "commercial": 600,
      "transactional": 250,
      "navigational": 150
    },
    "by_difficulty": {
      "easy_kd_0_30": 800,
      "medium_kd_31_60": 1200,
      "hard_kd_61_100": 500
    },
    "total_search_volume": 450000
  },
  "keyword_samples": [
    {
      "keyword": "how to build a family tree",
      "volume": 12000,
      "kd": 45,
      "intent": "informational",
      "cpc": 1.25
    }
  ],
  "ruvector_cache_hits": 1800,
  "new_keywords_researched": 700,
  "cost_savings_percent": 72
}
```

**5. Gap Analysis (Phase 5)**

```json
{
  "domain": "example.com",
  "phase": 5,
  "timestamp": "2025-12-03T14:00:00Z",
  "keyword_gaps": {
    "total_gaps": 450,
    "high_priority": [
      {
        "keyword": "dna test comparison",
        "volume": 8500,
        "kd": 35,
        "top_competitor": "ancestry.com",
        "competitor_position": 3,
        "opportunity_score": 0.92,
        "estimated_traffic": 3400
      }
    ],
    "traffic_potential": 85000
  },
  "content_gaps": [
    {
      "topic": "DNA Test Comparison Guides",
      "competitor_coverage": 3,
      "estimated_traffic": 15000,
      "priority": "HIGH"
    }
  ],
  "backlink_gaps": {
    "total_gap_domains": 250,
    "high_authority_domains": 45
  },
  "serp_feature_gaps": {
    "featured_snippets_available": 35,
    "paa_opportunities": 120,
    "video_carousel_opportunities": 15
  },
  "serp_patterns_applied": 12
}
```

**6. Strategy (Phase 6)**

```json
{
  "domain": "example.com",
  "phase": 6,
  "timestamp": "2025-12-03T15:00:00Z",
  "content_pillars": [
    {
      "pillar": "Family Tree Building",
      "target_keywords": 85,
      "estimated_traffic": 35000,
      "content_pieces_needed": 12,
      "priority": "HIGH",
      "ruvector_pattern_id": "pillar:family-tree-123abc"
    }
  ],
  "quick_wins": [
    {
      "action": "Optimize 10 pages for featured snippets",
      "effort": "LOW",
      "impact": "HIGH",
      "estimated_traffic_gain": 5000
    }
  ],
  "competitive_moats": [
    "Exclusive expert interviews",
    "Interactive family tree tool",
    "Video tutorial series"
  ],
  "link_building_strategy": {
    "target_domains": 50,
    "outreach_templates": 3,
    "estimated_backlinks_6_months": 100
  },
  "estimated_results": {
    "6_month_traffic_target": "+150%",
    "12_month_traffic_target": "+400%",
    "keyword_rankings_top_10_target": 200
  },
  "patterns_applied": 8
}
```

**7. Roadmap (Phase 7)**

```json
{
  "domain": "example.com",
  "phase": 7,
  "timestamp": "2025-12-03T16:00:00Z",
  "roadmap_timeline": "6 months",
  "milestones": [
    {
      "month": 1,
      "title": "Foundation",
      "tasks": [
        {
          "task": "Fix 5 critical technical issues",
          "priority": "HIGH",
          "estimated_effort_days": 3
        }
      ],
      "kpis": {
        "technical_health_score": "> 0.85",
        "indexed_pages": "> 400"
      }
    }
  ],
  "monthly_targets": {
    "month_1_traffic": "+15%",
    "month_3_traffic": "+45%",
    "month_6_traffic": "+150%"
  },
  "actionable_items": 45
}
```

**8. Onboarding Status (Coordinator Tracking)**

```json
{
  "domain": "example.com",
  "started_at": "2025-12-03T09:00:00Z",
  "current_phase": 4,
  "completed_phases": [1, 2, 3],
  "failed_phases": [],
  "phase_status": {
    "phase_1": {
      "status": "completed",
      "started_at": "2025-12-03T09:00:00Z",
      "completed_at": "2025-12-03T10:00:00Z",
      "confidence": 0.92
    },
    "phase_4": {
      "status": "in_progress",
      "started_at": "2025-12-03T13:00:00Z",
      "progress_percent": 65
    }
  },
  "ruvector_intelligence_summary": {
    "total_cache_hits": 2100,
    "total_cache_misses": 900,
    "cache_hit_rate": 0.70,
    "cost_savings_percent": 82,
    "patterns_applied": 15
  },
  "coordinator_id": "coord-onboarding-abc123"
}
```

### TTL Management

**TTL Policy:**
- All Redis onboarding artifacts expire after **30 days**
- After 30 days, data transitions to **RuVector long-term storage**
- Status tracking keys expire after **7 days** post-completion

**TTL Implementation:**
```bash
# Set key with TTL
redis-cli SET "seo:site:example.com:technical_audit" "$JSON_DATA" EX 2592000  # 30 days

# Check remaining TTL
redis-cli TTL "seo:site:example.com:technical_audit"

# Extend TTL if needed
redis-cli EXPIRE "seo:site:example.com:technical_audit" 2592000
```

### Access Patterns

**1. Phase Write (during execution):**
```bash
# Agent stores phase result
redis-cli SET "seo:site:${DOMAIN}:${ARTIFACT_TYPE}" "$JSON_OUTPUT" EX 2592000
```

**2. Phase Read (by coordinator or subsequent phases):**
```bash
# Coordinator retrieves phase output
RESULT=$(redis-cli GET "seo:site:${DOMAIN}:${ARTIFACT_TYPE}")
```

**3. Status Update (coordinator):**
```bash
# Update onboarding status
redis-cli SET "seo:site:${DOMAIN}:status" "$STATUS_JSON" EX 2592000
```

**4. Pattern-based Retrieval:**
```bash
# Get all artifacts for a domain
redis-cli KEYS "seo:site:example.com:*"
```

**5. Cleanup (after completion):**
```bash
# Archive to RuVector before expiration
./.claude/skills/cfn-seo/scripts/archive-to-ruvector.sh --domain example.com

# Or force delete
redis-cli DEL "seo:site:example.com:*"
```

---

## RuVector Schema

### Purpose

RuVector provides **semantic search** and **persistent intelligence storage** for SEO workflows. Collections enable pattern reuse, cost reduction, and continuous learning.

**Architecture Reference:**
- Existing schema: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/schemas.ts`
- Implementation: `docker/trigger-dev/src/lib/ruvector-init.ts`

### Collection Overview

RuVector stores 6 SEO intelligence collections plus 3 new onboarding-specific collections:

| Collection | Purpose | TTL (days) | Reuse Scenario |
|-----------|---------|------------|----------------|
| **seo_expert_sources** | Expert quotes and authority | ∞ | Reuse expert citations across articles |
| **seo_statistics** | Statistics with citations | 180 | Reuse validated data across content |
| **seo_keyword_research** | Keyword metrics cache | 14 | Skip API calls for cached keywords |
| **seo_competitor_intelligence** | Competitor strategies | 30 | Reuse competitor analysis in same niche |
| **seo_serp_patterns** | SERP features and ranking patterns | 14 | Apply proven SERP strategies |
| **seo_content_patterns** | Successful content patterns | ∞ | Replicate high-performing structures |
| **seo_site_profiles** | Site technical health profiles (NEW) | 90 | Skip re-auditing recently analyzed sites |
| **seo_onboarding_results** | Completed onboarding outputs (NEW) | 180 | Learn from past onboardings |
| **seo_cross_site_patterns** | Successful strategies by industry (NEW) | ∞ | Apply proven industry-specific patterns |

### Collection Details

#### 1. seo_expert_sources (Existing)

**Purpose:** Store expert quotes, credentials, and authority scores for content enrichment.

**TTL:** Never expires (authority score adjusts via performance feedback)

**Schema:** See `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/schemas.ts#ExpertSourceEntry`

**Query Pattern:**
```typescript
// Find experts for genealogy topic
const experts = await queryExpertSources({
  topics: ['genealogy', 'family-history'],
  minAuthorityScore: 0.75,
  limit: 10
});
```

**Storage Trigger:** Step 4.5 after Phase 2 (Content Inventory) identifies expert sources

---

#### 2. seo_statistics (Existing)

**Purpose:** Cache statistics and data points with citations for data-backed content.

**TTL:** 180 days (6 months), with freshness decay

**Schema:** See `schemas.ts#StatisticEntry`

**Query Pattern:**
```typescript
// Find recent statistics about DNA testing
const stats = await queryStatistics({
  topics: ['dna-testing', 'genealogy'],
  minFreshnessScore: 0.5,
  timeSensitive: true,
  limit: 20
});
```

**Storage Trigger:** Step 4.5 after Phase 4 (Keyword Universe) extracts statistics from research

---

#### 3. seo_keyword_research (Existing)

**Purpose:** Cache keyword research results (volume, difficulty, intent) to skip API calls.

**TTL:** 14 days (keyword metrics shift frequently)

**Schema:** See `schemas.ts#KeywordResearchEntry`

**Query Pattern:**
```typescript
// Check cache for keyword before API call
const cachedKeyword = await queryKeywordResearch({
  primaryKeyword: 'dna test comparison',
  minFreshnessScore: 0.3,  // Accept if < 2 weeks old
});

if (!cachedKeyword) {
  // Call DataForSEO API and store result
  const freshData = await dataForSEO.getKeywordMetrics('dna test comparison');
  await storeKeywordResearch(freshData);
}
```

**Storage Trigger:** Step 4.5 after Phase 4 (Keyword Universe) for all new keywords

**Cost Impact:** 80%+ API call reduction via caching

---

#### 4. seo_competitor_intelligence (Existing)

**Purpose:** Cache competitor analysis (strategies, architectures, gaps) for reuse within same niche.

**TTL:** 30 days (competitor strategies evolve moderately)

**Schema:** See `schemas.ts#CompetitorIntelligenceEntry`

**Query Pattern:**
```typescript
// Check if competitor already analyzed
const cachedCompetitor = await queryCompetitorIntelligence({
  domain: 'ancestry.com',
  niche: 'genealogy',
  minFreshnessScore: 0.5,
});

if (cachedCompetitor) {
  // Reuse analysis, skip re-scraping
  return cachedCompetitor;
}
```

**Storage Trigger:** Step 4.5 after Phase 3 (Competitor Discovery) for each new competitor

**Time Impact:** 60%+ time savings on repeat niche onboarding

---

#### 5. seo_serp_patterns (Existing)

**Purpose:** Store SERP features, ranking patterns, and semantic clusters for optimization insights.

**TTL:** 14 days (SERPs change frequently)

**Schema:** See `schemas.ts#SERPPatternEntry`

**Query Pattern:**
```typescript
// Find SERP patterns for similar keywords
const serpPatterns = await querySERPPatterns({
  keyword: 'dna test comparison',
  minFreshnessScore: 0.4,
  limit: 5
});

// Apply patterns to gap analysis
const featuresAvailable = serpPatterns
  .flatMap(p => p.metadata.featuresOpportunity)
  .filter(f => f.type === 'featured_snippet');
```

**Storage Trigger:** Step 4.5 after Phase 5 (Gap Analysis) extracts SERP patterns

---

#### 6. seo_content_patterns (Existing)

**Purpose:** Store successful content patterns with confidence scores for replication.

**TTL:** Never expires (confidence adjusts via performance feedback loop)

**Schema:** See `schemas.ts#ContentPatternEntry`

**Query Pattern:**
```typescript
// Find high-performing patterns for niche
const patterns = await queryContentPatterns({
  niche: 'genealogy',
  type: 'STRUCTURE',
  minConfidenceScore: 0.80,
  limit: 10
});

// Apply to strategy creation
const recommendedStructure = patterns[0].metadata.description;
```

**Storage Trigger:** Step 12.5 after Phase 7 (Roadmap Generation) extracts successful patterns

**Learning Impact:** Continuous improvement via performance feedback (Step 13)

---

#### 7. seo_site_profiles (NEW)

**Purpose:** Store site technical health profiles to avoid re-auditing recently analyzed sites.

**TTL:** 90 days (3 months, technical health changes moderately)

**Schema:**
```typescript
interface SiteProfileEntry {
  id: string;  // domain_normalized
  text: string;  // Embedding text
  metadata: {
    domain: string;
    industry: string;
    technicalHealthScore: number;
    performanceMetrics: {
      lcp: string;
      fid: string;
      cls: string;
    };
    indexabilityMetrics: {
      pagesCrawled: number;
      pagesIndexed: number;
      orphanPages: number;
    };
    siteArchitecture: {
      maxDepth: number;
      avgInternalLinksPerPage: number;
    };
    criticalIssues: Array<{
      issue: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    createdAt: Date;
    expiresAt: Date;
    freshnessScore: number;
  };
}
```

**Embedding Text:**
```
"Site: {domain} in {industry}. Health: {technical_health_score}. Issues: {top_3_critical_issues}"
```

**Query Pattern:**
```typescript
// Step 0: Check if site recently profiled
const existingProfile = await querySiteProfile({
  domain: 'example.com',
  minFreshnessScore: 0.5,  // < 45 days old
});

if (existingProfile) {
  console.log('Reusing cached technical audit from', existingProfile.metadata.createdAt);
  return existingProfile;
}

// Run Phase 1, store result in Step 4.5
await storeSiteProfile(technicalAuditResult);
```

**Storage Trigger:** Step 4.5 after Phase 1 (Technical Foundation)

**Time Impact:** Skip entire Phase 1 if recent profile exists

---

#### 8. seo_onboarding_results (NEW)

**Purpose:** Store completed onboarding outputs for pattern extraction and cross-site learning.

**TTL:** 180 days (6 months, strategic insights remain valuable)

**Schema:**
```typescript
interface OnboardingResultEntry {
  id: string;  // domain:timestamp_bucket
  text: string;  // Embedding text
  metadata: {
    domain: string;
    industry: string;
    completedAt: Date;
    phaseOutputs: {
      phase1: object;  // Technical audit
      phase2: object;  // Content inventory
      phase3: object;  // Competitors
      phase4: object;  // Keyword universe
      phase5: object;  // Gap analysis
      phase6: object;  // Strategy
      phase7: object;  // Roadmap
    };
    successMetrics: {
      totalKeywordsIdentified: number;
      totalGapsIdentified: number;
      contentPillarsCreated: number;
      estimatedTrafficPotential: number;
    };
    intelligenceMetrics: {
      cacheHitRate: number;
      costSavingsPercent: number;
      patternsApplied: number;
    };
    createdAt: Date;
    expiresAt: Date;
    freshnessScore: number;
    confidence: number;
  };
}
```

**Embedding Text:**
```
"Onboarding for {domain} in {industry}. Strategy: {content_pillars}. Traffic potential: {estimated_traffic}. Patterns applied: {patterns_applied}"
```

**Query Pattern:**
```typescript
// Step 0: Find similar past onboardings for insights
const similarOnboardings = await queryOnboardingResults({
  industry: 'genealogy',
  minConfidence: 0.85,
  limit: 5
});

// Extract common strategies
const commonStrategies = similarOnboardings
  .flatMap(o => o.metadata.phaseOutputs.phase6.content_pillars)
  .reduce((acc, pillar) => {
    acc[pillar.pillar] = (acc[pillar.pillar] || 0) + 1;
    return acc;
  }, {});
```

**Storage Trigger:** Step 12.5 after Phase 7 (Roadmap Generation) completion

**Learning Impact:** Future onboardings leverage past successful strategies

---

#### 9. seo_cross_site_patterns (NEW)

**Purpose:** Store successful strategies by industry/site size for pattern replication.

**TTL:** Never expires (confidence adjusts via performance feedback)

**Schema:**
```typescript
interface CrossSitePatternEntry {
  id: string;  // pattern_type:industry:hash
  text: string;  // Embedding text
  metadata: {
    patternType: 'CONTENT_PILLAR' | 'LINK_BUILDING' | 'TECHNICAL_FIX' | 'COMPETITIVE_MOAT';
    description: string;
    industry: string;
    siteSize: 'small' | 'medium' | 'large';  // By page count
    successExamples: Array<{
      domain: string;
      resultsAchieved: string;
      timeToResults: string;
    }>;
    confidenceScore: number;
    performanceMetrics?: {
      avgTrafficGrowth: number;
      avgRankingImprovement: number;
    };
    useCount: number;
    successCount: number;
    createdAt: Date;
    lastUsed: Date;
  };
}
```

**Embedding Text:**
```
"{pattern_type} for {industry} sites. Description: {description}. Success rate: {confidence_score}"
```

**Query Pattern:**
```typescript
// Step 0: Find proven patterns for this industry
const industryPatterns = await queryCrossSitePatterns({
  industry: 'genealogy',
  siteSize: 'medium',
  minConfidenceScore: 0.80,
  limit: 10
});

// Apply to Phase 6 strategy creation
const recommendedPillars = industryPatterns
  .filter(p => p.metadata.patternType === 'CONTENT_PILLAR')
  .map(p => p.metadata.description);
```

**Storage Trigger:** Step 12.5 after successful onboarding + validation

**Learning Impact:** Cross-site knowledge accumulation for industry-specific best practices

---

### Freshness Scoring

RuVector entries include a `freshnessScore` (1.0 → 0.0) based on age and TTL:

```typescript
function calculateFreshnessScore(createdAt: Date, ttlDays: number): number {
  if (ttlDays === Infinity) return 1.0;

  const ageMs = Date.now() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return Math.max(0, 1 - ageDays / ttlDays);
}
```

**Usage in queries:**
```typescript
// Only accept fresh data (< 50% of TTL expired)
const freshResults = await queryKeywordResearch({
  keyword: 'dna test',
  minFreshnessScore: 0.5,
});
```

---

### Query Helpers

RuVector queries use semantic search with metadata filters:

**1. Step 0: Pre-Research Queries**

Run before each phase to check for cached intelligence:

```typescript
// Before Phase 1: Check for site profile
const siteProfile = await querySiteProfile({ domain, minFreshnessScore: 0.5 });

// Before Phase 2: Check for content patterns
const contentPatterns = await queryContentPatterns({ industry, type: 'STRUCTURE' });

// Before Phase 3: Check for competitor intel
const competitorIntel = await queryCompetitorIntelligence({ domain: competitorDomain, niche });

// Before Phase 4: Check for keyword research
const cachedKeywords = await queryKeywordResearch({ keywords: seedKeywords });

// Before Phase 5: Check for SERP patterns
const serpPatterns = await querySERPPatterns({ keyword, minFreshnessScore: 0.4 });

// Before Phase 6: Check for cross-site patterns
const crossSitePatterns = await queryCrossSitePatterns({ industry, siteSize });
```

**2. Step 4.5: Post-Phase Storage**

Store new findings after each phase:

```typescript
// After Phase 1: Store site profile
await storeSiteProfile(technicalAuditResult);

// After Phase 2: Store expert sources
await storeExpertSources(expertSourcesFound);

// After Phase 3: Store competitor intel
await storeCompetitorIntelligence(competitorAnalysis);

// After Phase 4: Store keyword research
await storeKeywordResearch(keywordUniverse);

// After Phase 5: Store SERP patterns
await storeSERPPatterns(serpAnalysis);

// After Phase 6: Store content patterns (if strategy successful)
await storeContentPatterns(strategyPatterns);
```

**3. Step 12.5: Pattern Extraction**

Extract and store patterns after successful onboarding:

```typescript
// Extract site-level patterns
const onboardingPatterns = extractOnboardingPatterns(onboardingResult);
await storeOnboardingResult(onboardingPatterns);

// Extract cross-site patterns
const crossSitePatterns = extractCrossSitePatterns(onboardingResult, industry);
await storeCrossSitePatterns(crossSitePatterns);
```

**4. Step 13: Performance Feedback**

Update confidence scores based on actual performance:

```typescript
// Update pattern confidence after content performance data available
await updatePatternConfidence({
  patternId: 'pillar:family-tree-123abc',
  performanceMetrics: {
    avgPosition: 5.2,
    avgCTR: 0.08,
    trafficGrowth: 0.45
  }
});
```

---

## Integration Strategy

### When to Use Redis vs RuVector

| Use Case | Storage | Reason |
|----------|---------|--------|
| **Active onboarding session artifacts** | Redis | Fast access, coordinator orchestration |
| **Phase-to-phase data handoff** | Redis | Real-time coordination between agents |
| **Semantic pattern search** | RuVector | Find similar past research via embeddings |
| **Cost-saving cache lookups** | RuVector | Avoid repeat API calls for keywords, competitors |
| **Long-term pattern learning** | RuVector | Continuous improvement via performance feedback |
| **Temporary status tracking** | Redis | Session state, progress monitoring |
| **Historical analysis** | RuVector | Learn from past onboardings, cross-site patterns |

### Sync Workflow

**Onboarding Lifecycle:**

```
1. START: Coordinator creates Redis status key
   ↓
2. PHASE 0: Query RuVector for cached intelligence (Step 0)
   ↓
3. PHASE 1-7: Execute, write artifacts to Redis
   ↓
4. STEP 4.5: Store new findings in RuVector (after each phase)
   ↓
5. STEP 12.5: Extract patterns, store in RuVector
   ↓
6. COMPLETION: Redis artifacts remain for 30 days
   ↓
7. EXPIRATION: Redis data auto-expires, RuVector persists per TTL
```

**Example: Phase 4 (Keyword Universe)**

```typescript
async function executePhase4(domain: string, seedKeywords: string[]) {
  // Step 0: Query RuVector cache
  const cachedKeywords = await queryKeywordResearch({
    keywords: seedKeywords,
    minFreshnessScore: 0.3,  // Accept if < 5 days old
  });

  const cacheHits = cachedKeywords.length;
  const cacheMisses = seedKeywords.filter(k =>
    !cachedKeywords.find(c => c.metadata.primaryKeyword === k)
  );

  // Only call API for cache misses
  const freshKeywords = await dataForSEO.getKeywordMetrics(cacheMisses);

  // Combine cached + fresh
  const keywordUniverse = [...cachedKeywords, ...freshKeywords];

  // Step 4.5: Store new keywords in RuVector
  for (const keyword of freshKeywords) {
    await storeKeywordResearch(keyword);
  }

  // Store final result in Redis
  const phase4Result = {
    keyword_universe: keywordUniverse,
    ruvector_cache_hits: cacheHits,
    new_keywords_researched: cacheMisses.length,
    cost_savings_percent: (cacheHits / seedKeywords.length) * 100,
  };

  await redis.set(
    `seo:site:${domain}:keyword_universe`,
    JSON.stringify(phase4Result),
    'EX',
    2592000  // 30 days
  );

  return phase4Result;
}
```

### Cache Invalidation

**RuVector TTL-based expiration:**
- Automatic: `freshnessScore` decays to 0.0 over TTL
- Manual: Delete stale entries via cleanup script

**Redis expiration:**
- Automatic: Keys expire after 30 days
- Manual: Coordinator can force delete after completion

**Cleanup script:**
```bash
# Remove stale RuVector entries (freshnessScore < 0.1)
./.claude/skills/cfn-seo/scripts/cleanup-stale-ruvector.sh

# Archive Redis data before expiration
./.claude/skills/cfn-seo/scripts/archive-to-ruvector.sh --domain example.com
```

### Error Handling

**Redis Errors:**
```typescript
try {
  await redis.set(key, value, 'EX', ttl);
} catch (error) {
  console.error('[Redis Error]', error.message);
  // Fallback: Write to file system
  await fs.writeFile(`/tmp/redis-fallback/${key}.json`, value);
  throw new RedisStorageError('Failed to store artifact', error);
}
```

**RuVector Errors:**
```typescript
try {
  const results = await queryKeywordResearch({ keyword });
  return results;
} catch (error) {
  console.warn('[RuVector Query Failed]', error.message);
  // Fallback: Proceed without cache, call API directly
  return await dataForSEO.getKeywordMetrics(keyword);
}
```

**Partial Cache Hits:**
```typescript
// If some keywords cached, some not
const cachedKeywords = await queryKeywordResearch({ keywords: allKeywords });
const missingKeywords = allKeywords.filter(k => !cachedKeywords.includes(k));

if (missingKeywords.length > 0) {
  const freshData = await dataForSEO.getKeywordMetrics(missingKeywords);
  return [...cachedKeywords, ...freshData];
}
```

---

## Performance Metrics

### Target Metrics (from Epic)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Cache Hit Rate** | 60%+ | On repeat niche research |
| **Cost Savings** | 80%+ | API call reduction via RuVector |
| **Time Savings** | 75%+ | For content clusters via cached intelligence |
| **Pattern Reuse** | 40%+ | Insights from stored patterns |

### Monitoring

**Redis Monitoring:**
```bash
# Check key count
redis-cli DBSIZE

# Check memory usage
redis-cli INFO memory

# List all onboarding keys
redis-cli KEYS "seo:site:*"

# Monitor TTL
redis-cli TTL "seo:site:example.com:technical_audit"
```

**RuVector Monitoring:**
```typescript
// Query collection stats
const stats = await getRuVectorCollectionStats('seo_keyword_research');
console.log('Total entries:', stats.entryCount);
console.log('Avg freshness:', stats.avgFreshnessScore);
console.log('Cache hit rate (last 24h):', stats.cacheHitRate24h);
```

**Cost Tracking:**
```typescript
// Log cost savings per onboarding
const costMetrics = {
  total_api_calls_baseline: 3000,  // Without cache
  actual_api_calls: 600,           // With cache
  cost_per_call: 0.01,             // $0.01 per DataForSEO call
  cost_baseline: 30.00,            // $30 baseline
  cost_actual: 6.00,               // $6 with cache
  savings_percent: 80,
  savings_amount: 24.00,
};

await logCostSavings(domain, costMetrics);
```

---

## Implementation Checklist

**Phase 0: Setup**
- [ ] Redis running and accessible
- [ ] RuVector initialized with 9 SEO collections
- [ ] Environment variables configured (REDIS_URL, RUVECTOR_DB_PATH)

**Phase 1: Redis Schema**
- [ ] Key naming convention enforced (`seo:site:{domain}:{artifact_type}`)
- [ ] TTL set to 30 days for all artifacts
- [ ] JSON validation for each artifact type
- [ ] Error handling for Redis connection failures

**Phase 2: RuVector Schema**
- [ ] 6 existing collections verified (expert_sources, statistics, keyword_research, competitor_intelligence, serp_patterns, content_patterns)
- [ ] 3 new collections created (site_profiles, onboarding_results, cross_site_patterns)
- [ ] Freshness scoring implemented
- [ ] Query helpers implemented for Step 0

**Phase 3: Integration**
- [ ] Step 0 pre-research queries integrated into coordinator
- [ ] Step 4.5 post-phase storage integrated into each phase agent
- [ ] Step 12.5 pattern extraction integrated into coordinator
- [ ] Step 13 performance feedback loop implemented

**Phase 4: Testing**
- [ ] Cache hit scenario tested (repeat niche onboarding)
- [ ] Cache miss scenario tested (new niche onboarding)
- [ ] Partial cache scenario tested (some keywords cached, some not)
- [ ] Cost savings calculated and logged
- [ ] TTL expiration tested

**Phase 5: Monitoring**
- [ ] Redis memory usage monitored
- [ ] RuVector collection stats dashboard
- [ ] Cost savings tracking per onboarding
- [ ] Cache hit rate tracking per collection

---

## References

**Existing Files:**
- RuVector schemas: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/schemas.ts`
- RuVector init: `docker/trigger-dev/src/lib/ruvector-init.ts`
- RuVector skill: `.claude/skills/cfn-ruvector-codebase-index/SKILL.md`
- Epic definition: `planning/epics/seo-onboarding-discovery/epic.json`
- Onboarding design: `planning/seo/SEO_SITE_ONBOARDING_DESIGN.md`

**Related Deliverables:**
- 1.1.1: `/seo-onboard` slash command
- 1.1.2: `seo-onboarding-coordinator` agent
- 1.1.3: RuVector onboarding collection schemas (TypeScript)
- 1.1.5: Phase orchestration tests

---

## Confidence Score

**Deliverable Confidence:** 0.94

**Rationale:**
- Redis schema leverages proven patterns from existing CFN coordination
- RuVector schema extends existing 6-collection architecture with 3 new collections
- TTL management aligns with epic targets (14-180 days per collection)
- Integration strategy clearly separates real-time (Redis) vs semantic (RuVector) use cases
- Query helpers enable Step 0, 4.5, 12.5, 13 workflow integration
- Error handling covers Redis failures, RuVector query failures, partial cache hits
- Performance targets (60%+ cache hit, 80%+ cost savings) are measurable

**Deductions:**
- -0.03: New collections (site_profiles, onboarding_results, cross_site_patterns) require validation
- -0.03: Step 13 performance feedback loop requires post-implementation tuning

**Next Steps:**
1. Implement TypeScript query helpers (Deliverable 1.1.3)
2. Integrate Step 0 pre-research into coordinator (Deliverable 1.1.2)
3. Test cache hit/miss scenarios (Deliverable 1.1.5)
4. Measure cost savings on pilot onboarding

---

**Status:** ✅ Ready for Implementation
**Created:** 2025-12-03
**Sprint:** 1.1 (Site Onboarding Command, Coordinator & RuVector Schema)
