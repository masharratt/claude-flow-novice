# SEO Site Onboarding & Keyword Discovery Design

**Created:** 2025-12-03
**Status:** Design Document
**Purpose:** Define holistic site onboarding workflow and automated keyword discovery process

---

## Executive Summary

This document defines two interconnected workflows:

1. **Site Onboarding Audit** - One-time comprehensive analysis when starting SEO for a new site
2. **Keyword Discovery Process** - Ongoing system to identify and prioritize keyword opportunities

These workflows fill the gap between "I have a site" and "I know what keywords to target."

---

## Part 1: SEO Site Onboarding Workflow

### Overview

A systematic process to analyze a new site and create a prioritized SEO roadmap.

**Entry Point:** `/seo-onboard <domain> [--competitors=domain1,domain2] [--industry=INDUSTRY]`

**Output:** Complete SEO strategy document with prioritized action plan

### Required Input Data

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `domain` | Yes | Site to analyze | `ourstories.com` |
| `competitors` | Optional | Known competitors (auto-discovered if omitted) | `ancestry.com,familysearch.org` |
| `industry` | Optional | Industry/niche for context | `genealogy` |
| `google_search_console` | Recommended | GSC access for real data | API credentials |
| `google_analytics` | Recommended | GA4 access for traffic data | API credentials |
| `brand_guidelines` | Optional | Brand voice/style guide | File path |
| `business_goals` | Optional | Revenue targets, key products | JSON config |

### Onboarding Pipeline (7 Phases)

```
Phase 1: Technical Foundation
   ↓
Phase 2: Content Inventory
   ↓
Phase 3: Competitor Discovery
   ↓
Phase 4: Keyword Universe
   ↓
Phase 5: Gap Analysis
   ↓
Phase 6: Strategy Creation
   ↓
Phase 7: Roadmap Generation
```

---

### Phase 1: Technical Foundation (Day 1)

**Agent:** `technical-seo-specialist`

**Purpose:** Assess site health before planning content strategy

**Tasks:**
1. Site crawl (Screaming Frog or custom crawler)
2. Core Web Vitals assessment
3. Indexability audit (robots.txt, meta robots, sitemaps)
4. Mobile-friendliness check
5. HTTPS/security validation
6. Schema markup inventory
7. Site architecture mapping

**Output:**
```json
{
  "technical_health_score": 0.78,
  "critical_issues": [
    {"issue": "50 pages blocked by robots.txt", "severity": "HIGH"},
    {"issue": "Missing canonical tags on 120 pages", "severity": "HIGH"}
  ],
  "performance": {
    "lcp": "3.2s",
    "fid": "180ms",
    "cls": "0.15"
  },
  "indexability": {
    "pages_crawled": 450,
    "pages_indexed": 380,
    "orphan_pages": 25
  },
  "site_architecture": {
    "max_depth": 5,
    "avg_internal_links_per_page": 8
  }
}
```

**Blocking Condition:** If technical_health_score < 0.50, recommend fixing critical issues before content strategy.

---

### Phase 2: Content Inventory (Day 1-2)

**Agent:** `content-seo-strategist`

**Purpose:** Map existing content and identify strengths/gaps

**Tasks:**
1. Crawl all pages and extract metadata
2. Classify content by type (blog, product, service, landing)
3. Extract existing target keywords (title tags, H1s)
4. Measure content depth (word count, headings, media)
5. Identify thin/duplicate content
6. Map internal linking structure

**Output:**
```json
{
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
    {"keyword": "family history software", "pages": 8},
    {"keyword": "genealogy research", "pages": 12}
  ],
  "content_clusters": [
    {"topic": "DNA Testing", "pages": 25, "internal_links": 45},
    {"topic": "Family Trees", "pages": 35, "internal_links": 78}
  ]
}
```

---

### Phase 3: Competitor Discovery (Day 2)

**Agent:** `competitive-seo-analyst`

**Purpose:** Identify and analyze key competitors

**Tasks:**
1. Identify organic competitors (sites ranking for same keywords)
2. Gather competitor metrics (DA, traffic, backlinks)
3. Analyze competitor content strategy
4. Extract competitor keyword portfolio
5. Identify competitor backlink sources
6. Map SERP feature ownership

**Auto-Discovery Method:**
```python
# If competitors not provided, discover from:
# 1. Top 10 results for seed keywords
# 2. Sites linking to industry resources
# 3. Sites mentioned in industry publications
```

**Output:**
```json
{
  "competitors_identified": 8,
  "primary_competitors": [
    {
      "domain": "ancestry.com",
      "da": 92,
      "monthly_traffic": "45M",
      "ranking_keywords": 850000,
      "backlinks": "12M",
      "content_strategy": "Comprehensive guides + tools"
    },
    {
      "domain": "familysearch.org",
      "da": 85,
      "monthly_traffic": "28M",
      "ranking_keywords": 420000,
      "content_strategy": "Educational content + free tools"
    }
  ],
  "competitive_position": {
    "your_da": 45,
    "your_traffic": "50K",
    "market_share": "0.1%"
  }
}
```

---

### Phase 4: Keyword Universe (Day 2-3)

**Agent:** `seo-analytics-specialist` + `content-seo-strategist`

**Purpose:** Build comprehensive keyword database for the niche

**Tasks:**
1. Seed keyword expansion (variations, modifiers)
2. Competitor keyword extraction
3. "People Also Ask" mining
4. Reddit/forum topic extraction
5. Google Suggest mining
6. Search volume and difficulty lookup
7. Search intent classification

**Keyword Sources:**
- Google Search Console (existing traffic)
- DataForSEO API (volume, difficulty)
- Competitor keyword export (Ahrefs/SEMrush)
- AnswerThePublic (questions)
- Reddit/Quora topic mining

**Output:**
```json
{
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
    "total_search_volume": "450,000/month"
  },
  "sample_keywords": [
    {"keyword": "how to build a family tree", "volume": 12000, "kd": 45, "intent": "informational"},
    {"keyword": "best genealogy software", "volume": 8500, "kd": 52, "intent": "commercial"},
    {"keyword": "ancestry dna test", "volume": 35000, "kd": 78, "intent": "transactional"}
  ]
}
```

---

### Phase 5: Gap Analysis (Day 3-4)

**Agent:** `competitive-seo-analyst`

**Purpose:** Identify opportunities based on competitor comparison

**Tasks:**
1. Keyword gaps (competitors rank, you don't)
2. Content gaps (topics competitors cover, you don't)
3. Backlink gaps (sites linking to competitors, not you)
4. SERP feature gaps (snippets competitors own, you don't)
5. Technical gaps (competitor advantages)

**Output:**
```json
{
  "keyword_gaps": {
    "total_gaps": 450,
    "high_priority": [
      {"keyword": "dna test comparison", "volume": 8500, "top_competitor": "ancestry.com", "position": 3},
      {"keyword": "free family tree maker", "volume": 6200, "top_competitor": "familysearch.org", "position": 2}
    ],
    "traffic_potential": "85,000 visits/month"
  },
  "content_gaps": {
    "missing_topics": [
      {"topic": "DNA Test Comparison Guides", "competitor_coverage": 3, "estimated_traffic": 15000},
      {"topic": "Immigration Records Research", "competitor_coverage": 2, "estimated_traffic": 8000}
    ]
  },
  "backlink_gaps": {
    "total_gap_domains": 250,
    "high_authority_domains": 45
  },
  "serp_feature_gaps": {
    "featured_snippets_available": 35,
    "paa_opportunities": 120,
    "video_carousel_opportunities": 15
  }
}
```

---

### Phase 6: Strategy Creation (Day 4-5)

**Agent:** `content-seo-strategist` + `competitive-seo-analyst`

**Purpose:** Create actionable SEO strategy based on analysis

**Strategy Components:**

1. **Content Pillars** - 3-5 core topic clusters
2. **Quick Wins** - Low-effort, high-impact opportunities
3. **Competitive Moats** - Unique content angles
4. **Link Building Strategy** - Prioritized outreach targets
5. **Technical Roadmap** - Issue resolution timeline
6. **Content Calendar** - Publishing schedule

**Output:**
```json
{
  "content_pillars": [
    {
      "pillar": "Family Tree Building",
      "target_keywords": 85,
      "estimated_traffic": 35000,
      "content_pieces_needed": 12,
      "priority": "HIGH"
    },
    {
      "pillar": "DNA Testing Guides",
      "target_keywords": 45,
      "estimated_traffic": 28000,
      "content_pieces_needed": 8,
      "priority": "HIGH"
    }
  ],
  "quick_wins": [
    {"action": "Optimize 10 pages for featured snippets", "effort": "LOW", "impact": "HIGH"},
    {"action": "Fix 50 missing canonical tags", "effort": "LOW", "impact": "MEDIUM"}
  ],
  "competitive_moats": [
    "Exclusive expert interviews",
    "Interactive family tree tool",
    "Video tutorial series"
  ],
  "estimated_results": {
    "6_month_traffic_target": "+150%",
    "12_month_traffic_target": "+400%",
    "keyword_rankings_top_10_target": 200
  }
}
```

---

### Phase 7: Roadmap Generation (Day 5)

**Agent:** Coordinator (synthesizes all phases)

**Purpose:** Create prioritized action plan with timelines

**Output: SEO Roadmap Document**

```markdown
# SEO Roadmap - [Domain]

## Month 1: Foundation
- [ ] Fix 5 critical technical issues
- [ ] Optimize Core Web Vitals (target: green scores)
- [ ] Implement missing schema markup
- [ ] Create 4 quick-win content pieces

## Month 2-3: Content Foundation
- [ ] Build Pillar 1: "Family Tree Building" cluster (12 pages)
- [ ] Optimize 20 existing pages for target keywords
- [ ] Build 10 high-quality backlinks
- [ ] Launch featured snippet optimization campaign

## Month 4-6: Scale
- [ ] Build Pillar 2: "DNA Testing Guides" cluster (8 pages)
- [ ] Build Pillar 3: [Topic] cluster
- [ ] Reach 100 pages optimized
- [ ] Build 30 additional backlinks

## KPIs to Track
- Organic traffic growth (target: +15%/month)
- Keyword rankings top 10 (target: 50 by month 3)
- Domain authority growth (target: +5 points by month 6)
- Conversion rate (target: maintain or improve)
```

---

## Part 2: Keyword Discovery Process

### Overview

An automated system that continuously identifies new keyword opportunities.

**Entry Point:** `/seo-discover-keywords [--niche=NICHE] [--count=100] [--mode=quick|deep]`

**Output:** Prioritized keyword list with actionable recommendations

### Discovery Pipeline

```
Source Collection
   ↓
Keyword Extraction
   ↓
Deduplication & Clustering
   ↓
Metrics Enrichment
   ↓
Opportunity Scoring
   ↓
Prioritized Output
```

---

### Keyword Sources (Automated)

| Source | Method | Keywords/Run | Cost |
|--------|--------|--------------|------|
| Google Search Console | API query | 500-2000 | Free |
| Competitor Keywords | Ahrefs/SEMrush API | 1000+ | Paid API |
| People Also Ask | SERP scraping | 50-100 | DataForSEO |
| Reddit/Quora | Forum mining | 100-200 | Free (API) |
| Google Suggest | Autocomplete API | 200-500 | Free/API |
| AnswerThePublic | Question mining | 100-300 | Free tier |
| Semantic Expansion | NLP processing | 200-500 | OpenRouter |

### Opportunity Scoring Algorithm

```python
def calculate_opportunity_score(keyword):
    # Base score from volume vs difficulty ratio
    base_score = (search_volume / (keyword_difficulty + 1)) * 0.4

    # Intent alignment bonus
    intent_bonus = 0.2 if intent in ['commercial', 'transactional'] else 0.1

    # Gap bonus (competitors rank, you don't)
    gap_bonus = 0.2 if is_keyword_gap else 0

    # Trend bonus (growing volume)
    trend_bonus = 0.1 if volume_trend == 'growing' else 0

    # Quick win bonus (low KD, you're on page 2)
    quick_win_bonus = 0.1 if kd < 30 and current_position in range(11, 30) else 0

    return base_score + intent_bonus + gap_bonus + trend_bonus + quick_win_bonus
```

### Output Format

```json
{
  "discovery_session": {
    "timestamp": "2025-12-03T10:00:00Z",
    "keywords_discovered": 250,
    "keywords_after_dedup": 180,
    "new_opportunities": 45
  },
  "top_opportunities": [
    {
      "keyword": "free family tree template pdf",
      "volume": 4500,
      "difficulty": 22,
      "intent": "transactional",
      "opportunity_score": 0.92,
      "current_position": null,
      "recommendation": "Create downloadable PDF template library",
      "estimated_traffic": 1800,
      "priority": "HIGH"
    },
    {
      "keyword": "how to interview grandparents about family history",
      "volume": 2800,
      "difficulty": 18,
      "intent": "informational",
      "opportunity_score": 0.88,
      "current_position": 45,
      "recommendation": "Create comprehensive interview guide with questions",
      "estimated_traffic": 1200,
      "priority": "HIGH"
    }
  ],
  "keyword_clusters": [
    {
      "cluster_name": "Family Tree Templates",
      "keywords": 15,
      "total_volume": 12000,
      "avg_difficulty": 25,
      "content_recommendation": "Create template hub page with downloadable resources"
    }
  ]
}
```

---

## Implementation Plan

### New Commands to Create

| Command | Purpose | Primary Agent |
|---------|---------|---------------|
| `/seo-onboard` | Full site onboarding | Coordinator |
| `/seo-discover-keywords` | Keyword discovery | `seo-analytics-specialist` |
| `/seo-gap-analysis` | Standalone gap analysis | `competitive-seo-analyst` |
| `/seo-technical-audit` | Standalone technical audit | `technical-seo-specialist` |

### New Agents Needed

| Agent | Purpose | Model |
|-------|---------|-------|
| `seo-onboarding-coordinator` | Orchestrate 7-phase onboarding | Sonnet |
| `keyword-opportunity-scorer` | Score and prioritize keywords | Haiku |
| `content-gap-identifier` | Find missing content topics | Haiku |

### Data Storage

```
Redis Keys:
- seo:site:{domain}:technical_audit - Technical audit results
- seo:site:{domain}:content_inventory - Content inventory
- seo:site:{domain}:competitors - Competitor analysis
- seo:site:{domain}:keyword_universe - Full keyword database
- seo:site:{domain}:gaps - Gap analysis
- seo:site:{domain}:strategy - Strategy document
- seo:site:{domain}:roadmap - Action roadmap

SQLite Tables:
- keywords (id, keyword, volume, difficulty, intent, score, discovered_at)
- competitors (id, domain, da, traffic, strategy)
- content_gaps (id, topic, priority, competitor_coverage)
- opportunities (id, keyword_id, score, status, created_at)
```

### API Requirements

| API | Purpose | Cost Estimate |
|-----|---------|---------------|
| DataForSEO | Keyword metrics, SERP data | ~$50/month |
| Google Search Console | Existing traffic data | Free |
| Google Analytics 4 | Traffic analysis | Free |
| Ahrefs/SEMrush | Competitor data | ~$100/month |
| OpenRouter (Perplexity) | Research queries | ~$10/month |

---

## Success Metrics

### Onboarding Success
- Complete onboarding in < 5 days
- Technical audit accuracy > 95%
- Strategy actionability score > 0.85
- Client satisfaction > 4.5/5

### Keyword Discovery Success
- New opportunities discovered: > 50/month
- Keyword accuracy (volume, difficulty): > 90%
- Opportunity conversion rate: > 20% acted upon
- Traffic gain from discoveries: > 10% monthly growth

---

## Next Steps

1. Create `/seo-onboard` command (Phase 1-7 orchestration)
2. Create `/seo-discover-keywords` command (automated discovery)
3. Build `seo-onboarding-coordinator` agent
4. Integrate DataForSEO API for keyword metrics
5. Create Redis/SQLite storage schema
6. Test with pilot site

---

**Document Status:** Ready for Implementation
**Estimated Development Time:** 2-3 days for core workflow
