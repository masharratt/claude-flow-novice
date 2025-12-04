---
description: Run gap analysis against competitors with pattern intelligence and RuVector cache
---

# /seo-gap-analysis - Competitive Gap Analysis Command

**Epic**: SEO Site Onboarding & Keyword Discovery System v2
**Sprint**: 2.2 (Standalone Commands & Performance Feedback)
**Purpose**: Identify competitive opportunities using cached intelligence and SERP patterns
**Agent**: `competitive-seo-analyst`

---

## Command Syntax

```bash
/seo-gap-analysis <domain> [--competitors=domain1,domain2,...] [OPTIONS]
```

## Required Parameters

| Parameter | Description | Format |
|-----------|-------------|--------|
| `<domain>` | Your domain to analyze | Valid domain (e.g., `example.com`) |

## Optional Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--competitors` | Comma-separated competitor domains | `ancestry.com,familysearch.org` |
| `--industry` | Industry/niche for pattern matching | `genealogy`, `saas`, `ecommerce` |
| `--auto-discover` | Auto-discover competitors from SERP | Flag (default: true if no competitors) |
| `--gap-types` | Types of gaps to analyze | `keywords,content,backlinks,serp` (default: all) |
| `--min-volume` | Minimum search volume for keyword gaps | Integer (default: 100) |
| `--max-difficulty` | Maximum KD for opportunity filtering | Integer (default: 70) |
| `--skip-cache` | Skip RuVector cache lookup | Flag |
| `--verbose` | Enable detailed logging | Flag |
| `--output-format` | Output format | `json`, `markdown`, `both` (default: `both`) |

---

## Purpose

Identify competitive SEO opportunities without full onboarding. Use for:
- Quick competitive research
- Keyword gap identification
- Content gap discovery
- Backlink opportunity analysis
- SERP feature capture strategies
- Ongoing competitive monitoring

This command runs **Phase 5 only** from the onboarding pipeline with heavy RuVector integration.

---

## Gap Analysis Scope

### Pre-Analysis (Step 0): RuVector Intelligence Lookup

Before running fresh analysis, query RuVector collections for cached intelligence:

```bash
# Check for cached competitor intelligence
./scripts/ruvector/query-competitor-intel.sh \
  --competitors "$COMPETITORS" \
  --collection competitor_intelligence \
  --min-freshness 0.4

# Check for proven SERP patterns
./scripts/ruvector/query-serp-patterns.sh \
  --industry "$INDUSTRY" \
  --collection serp_patterns \
  --min-freshness 0.5
```

**Cache Hit Benefits**:
- Reuse competitor keyword portfolios (80%+ cost savings)
- Apply proven SERP strategies from similar industries
- Skip redundant competitor analysis
- Faster analysis (minutes vs hours)

**Cache Miss Behavior**:
- Auto-discover competitors if not provided
- Fetch competitor metrics via DataForSEO API
- Extract competitor keyword portfolios
- Store new intelligence in RuVector

### Phase 5 Analysis

#### 1. Keyword Gaps
Identify keywords where competitors rank but you don't:

**Data Sources**:
- Cached competitor keyword portfolios (RuVector)
- Fresh DataForSEO keyword overlap analysis (if cache miss)
- Your site's current rankings (GSC or estimate)

**Gap Scoring**:
```typescript
keywordGapScore = (
  (searchVolume / 10000) * 0.35 +
  ((100 - keywordDifficulty) / 100) * 0.25 +
  competitorPositionBonus * 0.20 +
  trafficPotentialScore * 0.20
)
```

**Filters**:
- Minimum volume: 100 (configurable)
- Maximum difficulty: 70 (configurable)
- Competitor position: Top 10 only
- Exclude branded keywords

**Output**: Top 50 keyword opportunities with traffic potential

#### 2. Content Gaps
Identify topics competitors cover but you don't:

**Analysis Method**:
- Topic clustering via semantic analysis
- Content type classification (guide, comparison, tutorial)
- Competitor content inventory comparison
- Pattern matching against successful content types

**Gap Identification**:
- Topics covered by 2+ competitors but not by you
- High-traffic potential topics (based on keyword clusters)
- Topics matching proven content patterns from RuVector

**Output**: Top 20 content gaps with recommendations

#### 3. Backlink Gaps
Identify sites linking to competitors but not to you:

**Data Sources**:
- Cached backlink profiles (RuVector competitor_intelligence)
- Fresh backlink analysis via Ahrefs/Moz API (if available)

**Gap Scoring**:
```typescript
backlinkGapScore = (
  domainAuthority * 0.40 +
  relevanceScore * 0.30 +
  linkingToMultipleCompetitors * 0.20 +
  followLinkBonus * 0.10
)
```

**Filters**:
- Minimum DA: 20
- Exclude spammy domains
- Prioritize sites linking to 2+ competitors
- Focus on follow links

**Output**: Top 30 backlink opportunities

#### 4. SERP Feature Gaps
Identify SERP features competitors own but you don't:

**Feature Types**:
- Featured Snippets
- People Also Ask (PAA)
- Image Pack
- Video Carousel
- Local Pack
- Reviews/Ratings
- Sitelinks
- Knowledge Panel

**Pattern Application**:
Query `serp_patterns` collection for proven strategies:
- Snippet optimization patterns (word count, structure)
- PAA capture strategies (question + answer format)
- Image optimization for Image Pack
- Video SEO for Video Carousel

**Output**: SERP feature capture opportunities with pattern-based strategies

#### 5. Priority Scoring

Prioritize all gaps by traffic potential and effort:

```typescript
priorityScore = (
  trafficPotential * 0.40 +
  ((100 - effort) / 100) * 0.30 +
  competitiveAdvantage * 0.20 +
  patternMatchBonus * 0.10
)
```

**Priority Levels**:
- HIGH: Score ≥ 0.75 (low effort, high impact)
- MEDIUM: Score 0.50-0.74 (moderate effort/impact)
- LOW: Score < 0.50 (high effort or low impact)

### Post-Analysis (Step 4.5): RuVector Storage

Store new SERP patterns and competitor intelligence:

```typescript
// Store SERP patterns discovered
{
  pattern: "comparison-guide-snippet-capture",
  industry: "genealogy",
  successRate: 0.82,
  avgWordCount: 450,
  structurePattern: "intro + comparison table + winner",
  exampleKeywords: [...],
  ttl: 14 // days
}

// Update competitor intelligence
{
  competitor: "ancestry.com",
  lastAnalyzed: "2025-12-04T10:30:00Z",
  keywordCount: 2400,
  topKeywords: [...],
  contentStrategy: "comparison + genealogy guides",
  backlinks: 45000,
  ttl: 30 // days
}
```

---

## Usage Examples

### 1. Basic Gap Analysis (Auto-Discover Competitors)
```bash
/seo-gap-analysis example.com --industry genealogy

# Behavior:
# - Auto-discovers top 3-5 competitors from SERP
# - Checks RuVector for cached competitor intel
# - Runs gap analysis (all types)
# - Applies SERP patterns from genealogy industry
# - Returns prioritized opportunities
# - Execution: 3-5 minutes
# - Cost: $2-5 (depending on cache hit rate)
```

### 2. Targeted Gap Analysis (Known Competitors)
```bash
/seo-gap-analysis example.com \
  --competitors ancestry.com,familysearch.org,myheritage.com \
  --industry genealogy

# Behavior:
# - Uses provided competitor list (skips auto-discovery)
# - Leverages cached competitor intelligence (if available)
# - Applies proven SERP patterns from RuVector
# - Faster execution: 2-3 minutes
# - Lower cost: $1-3 (higher cache hit rate)
```

### 3. Keyword Gaps Only (Quick Check)
```bash
/seo-gap-analysis example.com \
  --competitors competitor1.com,competitor2.com \
  --gap-types keywords \
  --min-volume 500 \
  --max-difficulty 50

# Behavior:
# - Analyzes keyword gaps only (skip content/backlink/SERP)
# - Filters: volume ≥ 500, difficulty ≤ 50
# - Quick wins focus
# - Execution: 1-2 minutes
# - Cost: $0.50-1.50
```

### 4. Content & SERP Gaps (Content Strategy)
```bash
/seo-gap-analysis example.com \
  --competitors competitor1.com,competitor2.com \
  --gap-types content,serp \
  --industry saas

# Behavior:
# - Content gaps + SERP feature opportunities
# - Applies SaaS industry patterns from RuVector
# - Recommends content types and SERP capture strategies
# - Execution: 2-3 minutes
# - Cost: $1-2
```

### 5. Fresh Analysis (Skip Cache)
```bash
/seo-gap-analysis example.com \
  --competitors competitor1.com \
  --skip-cache \
  --verbose

# Behavior:
# - Bypasses RuVector cache
# - Fresh competitor analysis
# - Verbose logging for debugging
# - Updates RuVector with fresh data
# - Execution: 5-8 minutes
# - Cost: $5-10
```

---

## Expected Outputs

### Immediate (Command Execution)
- Task ID for tracking
- Cache hit status for competitors
- Pattern match count from RuVector
- Estimated completion time

### Progress Updates
- Competitor discovery/analysis progress
- Keyword gap extraction
- Content gap clustering
- Backlink gap analysis
- SERP feature mapping
- Priority scoring

### Final Deliverables

#### Redis Keys
```
seo:gap-analysis:{domain}:report
seo:gap-analysis:{domain}:keyword-gaps
seo:gap-analysis:{domain}:content-gaps
seo:gap-analysis:{domain}:backlink-gaps
seo:gap-analysis:{domain}:serp-gaps
```

#### Files Generated
```
.artifacts/seo/gap-analysis/{domain}/
  ├── report.json              # Full gap analysis report
  ├── report.md                # Human-readable summary
  ├── keyword-gaps.json        # Top keyword opportunities
  ├── content-gaps.json        # Content topic opportunities
  ├── backlink-gaps.json       # Backlink opportunities
  ├── serp-gaps.json           # SERP feature opportunities
  └── quick-wins.json          # Low-effort, high-impact gaps
```

### JSON Output Format

```json
{
  "domain": "example.com",
  "competitors": ["ancestry.com", "familysearch.org", "myheritage.com"],
  "industry": "genealogy",
  "analysisDate": "2025-12-04T10:30:00Z",
  "cacheStatus": {
    "competitorIntelHits": 2,
    "competitorIntelMisses": 1,
    "serpPatternHits": 8,
    "cacheHitRate": 0.67,
    "costSavings": "$8.40"
  },
  "gapSummary": {
    "keywordGaps": 127,
    "contentGaps": 18,
    "backlinkGaps": 45,
    "serpFeatureGaps": 12,
    "totalOpportunities": 202,
    "highPriority": 34,
    "mediumPriority": 89,
    "lowPriority": 79
  },
  "keywordGaps": [
    {
      "keyword": "best genealogy software",
      "searchVolume": 8100,
      "keywordDifficulty": 58,
      "topCompetitor": "ancestry.com",
      "competitorPosition": 3,
      "trafficPotential": 2430,
      "priority": "HIGH",
      "opportunityScore": 0.87,
      "serpInsights": {
        "featuredSnippetAvailable": true,
        "paaCount": 4,
        "avgContentLength": 2800,
        "patternMatch": "comparison-guide",
        "patternConfidence": 0.82
      },
      "recommendedAction": "Create comprehensive comparison guide with comparison table",
      "estimatedEffort": "8-12 hours",
      "estimatedRank": "5-10 (within 6 months)"
    },
    {
      "keyword": "how to start genealogy research",
      "searchVolume": 3600,
      "keywordDifficulty": 42,
      "topCompetitor": "familysearch.org",
      "competitorPosition": 2,
      "trafficPotential": 1440,
      "priority": "HIGH",
      "opportunityScore": 0.81,
      "serpInsights": {
        "featuredSnippetAvailable": true,
        "paaCount": 6,
        "avgContentLength": 1800,
        "patternMatch": "how-to-guide",
        "patternConfidence": 0.89
      },
      "recommendedAction": "Create beginner's guide with step-by-step instructions",
      "estimatedEffort": "6-8 hours",
      "estimatedRank": "3-7 (within 4 months)"
    }
  ],
  "contentGaps": [
    {
      "topic": "DNA Testing Comparison",
      "competitorCoverage": 3,
      "estimatedTraffic": 12400,
      "relatedKeywords": [
        "best DNA test for genealogy",
        "AncestryDNA vs 23andMe",
        "DNA test accuracy"
      ],
      "priority": "HIGH",
      "recommendedType": "comparison",
      "patternMatch": {
        "pattern": "product-comparison-table",
        "confidence": 0.85,
        "structure": "intro + feature comparison + pricing + verdict"
      },
      "competitorExamples": [
        "ancestry.com/dna-comparison (position 2, 4.2K traffic)",
        "familysearch.org/dna-guide (position 5, 2.8K traffic)"
      ],
      "estimatedEffort": "12-16 hours",
      "estimatedImpact": "High (12.4K monthly traffic potential)"
    },
    {
      "topic": "Free Genealogy Resources",
      "competitorCoverage": 2,
      "estimatedTraffic": 8600,
      "relatedKeywords": [
        "free genealogy websites",
        "free ancestry records",
        "free family tree builder"
      ],
      "priority": "MEDIUM",
      "recommendedType": "listicle",
      "patternMatch": {
        "pattern": "resource-list",
        "confidence": 0.78,
        "structure": "intro + categorized resources + descriptions + links"
      },
      "estimatedEffort": "6-8 hours",
      "estimatedImpact": "Medium (8.6K monthly traffic potential)"
    }
  ],
  "backlinkGaps": [
    {
      "domain": "genealogyblog.com",
      "domainAuthority": 45,
      "linkingToCompetitors": ["ancestry.com", "familysearch.org"],
      "relevanceScore": 0.92,
      "linkType": "follow",
      "opportunityScore": 0.84,
      "priority": "HIGH",
      "recommendedApproach": "Guest post on DNA testing comparison",
      "estimatedEffort": "4-6 hours",
      "estimatedImpact": "High (DA 45, highly relevant)"
    },
    {
      "domain": "historysociety.org",
      "domainAuthority": 38,
      "linkingToCompetitors": ["ancestry.com"],
      "relevanceScore": 0.78,
      "linkType": "follow",
      "opportunityScore": 0.72,
      "priority": "MEDIUM",
      "recommendedApproach": "Resource page inclusion",
      "estimatedEffort": "2-3 hours",
      "estimatedImpact": "Medium (DA 38, relevant)"
    }
  ],
  "serpFeatureGaps": [
    {
      "featureType": "Featured Snippet",
      "keyword": "how to read census records",
      "currentOwner": "familysearch.org",
      "searchVolume": 2400,
      "difficulty": 35,
      "priority": "HIGH",
      "patternMatch": {
        "pattern": "numbered-list-snippet",
        "confidence": 0.88,
        "structure": "5-7 step process with brief descriptions",
        "wordCount": "250-350",
        "format": "numbered list"
      },
      "recommendedAction": "Create concise how-to guide with numbered steps",
      "estimatedEffort": "3-4 hours",
      "estimatedImpact": "High (2.4K monthly clicks from snippet)"
    },
    {
      "featureType": "People Also Ask",
      "keyword": "genealogy software",
      "paaQuestions": [
        "What is the best free genealogy software?",
        "Is Ancestry better than MyHeritage?",
        "How much does genealogy software cost?"
      ],
      "currentOwners": ["ancestry.com", "myheritage.com"],
      "estimatedTraffic": 1800,
      "priority": "MEDIUM",
      "patternMatch": {
        "pattern": "qa-format",
        "confidence": 0.82,
        "structure": "Clear question + 2-3 sentence answer + supporting details"
      },
      "recommendedAction": "Add FAQ section to comparison guide",
      "estimatedEffort": "2-3 hours",
      "estimatedImpact": "Medium (1.8K monthly clicks from PAA)"
    }
  ],
  "quickWins": [
    {
      "type": "keyword",
      "keyword": "genealogy templates free",
      "volume": 1200,
      "difficulty": 28,
      "priority": "HIGH",
      "effort": "Low (2-4 hours)",
      "impact": "Medium (480 monthly visits)",
      "action": "Create downloadable template resource page"
    },
    {
      "type": "serp",
      "feature": "Featured Snippet",
      "keyword": "what is a genealogy chart",
      "volume": 800,
      "priority": "HIGH",
      "effort": "Low (1-2 hours)",
      "impact": "Medium (320 monthly clicks)",
      "action": "Add definition section to genealogy guide"
    }
  ],
  "recommendations": [
    "Focus on comparison guides (34 keyword opportunities, proven pattern)",
    "Target featured snippets (12 opportunities with high success rates)",
    "Create DNA testing comparison content (3 competitors cover, high traffic)",
    "Build backlinks from genealogy blogs (15 high-DA opportunities)",
    "Capture PAA boxes for 'genealogy software' cluster (8 questions)"
  ],
  "intelligence": {
    "patternsApplied": 8,
    "patternTypes": ["comparison-guide", "how-to-guide", "resource-list"],
    "avgPatternConfidence": 0.84,
    "competitorIntelReused": 2,
    "serpPatternsReused": 8,
    "cacheHitRate": 0.67,
    "costSavings": "$8.40",
    "executionTime": "3m 42s",
    "executionCost": "$2.60",
    "netSavings": "$5.80 (69%)"
  },
  "executionMetrics": {
    "executionTime": "3m 42s",
    "competitorsAnalyzed": 3,
    "keywordsCompared": 4800,
    "apiCallsMade": 12,
    "costEstimate": "$2.60"
  }
}
```

### Markdown Output Format

```markdown
# SEO Gap Analysis: example.com

**Analysis Date:** 2025-12-04
**Competitors:** ancestry.com, familysearch.org, myheritage.com
**Industry:** genealogy
**Cache Status:** 67% hit rate (saved $8.40)

## Summary

Identified 202 competitive opportunities across keywords, content, backlinks, and SERP features. Focus on **34 high-priority gaps** including comparison guides and featured snippets. Competitors excel at DNA testing comparison content and genealogy how-to guides.

## Gap Overview

| Type | Total | High Priority | Medium | Low |
|------|-------|---------------|--------|-----|
| Keyword Gaps | 127 | 28 | 64 | 35 |
| Content Gaps | 18 | 4 | 9 | 5 |
| Backlink Gaps | 45 | 2 | 18 | 25 |
| SERP Feature Gaps | 12 | 0 | 8 | 4 |
| **Total** | **202** | **34** | **89** | **79** |

## Top Keyword Gaps (10 of 127)

| Keyword | Volume | KD | Competitor | Position | Priority | Action |
|---------|--------|-------|------------|----------|----------|--------|
| best genealogy software | 8,100 | 58 | ancestry.com | 3 | HIGH | Comparison guide |
| how to start genealogy research | 3,600 | 42 | familysearch.org | 2 | HIGH | Beginner's guide |
| genealogy vs family history | 2,400 | 38 | ancestry.com | 4 | HIGH | Explainer article |
| best DNA test for ancestry | 6,200 | 62 | 23andme.com | 5 | HIGH | Product comparison |
| free genealogy websites | 4,800 | 45 | familysearch.org | 2 | MEDIUM | Resource list |
| genealogy templates free | 1,200 | 28 | ancestry.com | 6 | HIGH | Template library |
| how to read census records | 2,400 | 35 | familysearch.org | 3 | HIGH | How-to guide |
| genealogy chart types | 1,800 | 32 | myheritage.com | 4 | MEDIUM | Visual guide |
| best genealogy books | 1,400 | 30 | goodreads.com | 8 | MEDIUM | Curated list |
| genealogy research tips | 2,200 | 40 | ancestry.com | 5 | MEDIUM | Tips article |

**Estimated Traffic Potential:** 34,200 monthly visits from top 10 keywords

## Top Content Gaps (5 of 18)

### 1. DNA Testing Comparison [HIGH]
- **Coverage:** 3 competitors
- **Traffic Potential:** 12,400 monthly visits
- **Keywords:** best DNA test, AncestryDNA vs 23andMe, DNA accuracy
- **Recommended Type:** Comparison guide with feature table
- **Pattern Match:** product-comparison-table (85% confidence)
- **Effort:** 12-16 hours
- **Impact:** High (12.4K traffic potential)

### 2. Free Genealogy Resources [MEDIUM]
- **Coverage:** 2 competitors
- **Traffic Potential:** 8,600 monthly visits
- **Keywords:** free genealogy sites, free ancestry records, free family tree
- **Recommended Type:** Categorized resource list
- **Pattern Match:** resource-list (78% confidence)
- **Effort:** 6-8 hours
- **Impact:** Medium (8.6K traffic potential)

### 3. Genealogy for Beginners [HIGH]
- **Coverage:** 3 competitors
- **Traffic Potential:** 6,800 monthly visits
- **Keywords:** how to start genealogy, beginner tips, first steps
- **Recommended Type:** Comprehensive beginner's guide
- **Pattern Match:** step-by-step-guide (82% confidence)
- **Effort:** 10-14 hours
- **Impact:** High (6.8K traffic potential)

### 4. Census Record Interpretation [MEDIUM]
- **Coverage:** 2 competitors
- **Traffic Potential:** 5,200 monthly visits
- **Keywords:** how to read census, census abbreviations, census columns
- **Recommended Type:** Visual how-to guide
- **Pattern Match:** illustrated-tutorial (80% confidence)
- **Effort:** 8-10 hours
- **Impact:** Medium (5.2K traffic potential)

### 5. Genealogy Software Reviews [MEDIUM]
- **Coverage:** 2 competitors
- **Traffic Potential:** 4,600 monthly visits
- **Keywords:** genealogy software reviews, best PM tools, software ratings
- **Recommended Type:** Review roundup with ratings
- **Pattern Match:** review-roundup (75% confidence)
- **Effort:** 12-16 hours
- **Impact:** Medium (4.6K traffic potential)

## Top Backlink Gaps (5 of 45)

| Domain | DA | Linking To | Relevance | Priority | Approach |
|--------|-------|-----------|-----------|----------|----------|
| genealogyblog.com | 45 | ancestry, familysearch | 0.92 | HIGH | Guest post |
| historysociety.org | 38 | ancestry | 0.78 | MEDIUM | Resource page |
| genealogytoday.com | 42 | ancestry, myheritage | 0.85 | HIGH | Content partnership |
| familytreemagazine.com | 50 | ancestry, familysearch | 0.88 | HIGH | Expert quote |
| rootsweb.org | 48 | familysearch | 0.82 | MEDIUM | Directory listing |

**Estimated Link Value:** 15 high-quality backlinks from DA 38-50 domains

## SERP Feature Gaps (5 of 12)

### Featured Snippets (4 opportunities)
1. **"how to read census records"** (2.4K volume, DA 35) → Create numbered list guide
2. **"what is a genealogy chart"** (800 volume, KD 28) → Add definition section
3. **"best free genealogy software"** (3.2K volume, KD 45) → Create comparison with winner
4. **"how to organize genealogy research"** (1.6K volume, KD 32) → Create step-by-step guide

### People Also Ask (8 opportunities)
1. **"genealogy software"** cluster (8 questions, 3.6K traffic) → Add FAQ section
2. **"DNA testing"** cluster (6 questions, 2.8K traffic) → Add FAQ to comparison
3. **"census records"** cluster (5 questions, 1.9K traffic) → Add Q&A to guide

**Estimated SERP Feature Traffic:** 14,200 monthly clicks

## Quick Wins (10 low-effort, high-impact opportunities)

| Opportunity | Type | Volume | Priority | Effort | Impact |
|-------------|------|--------|----------|--------|--------|
| genealogy templates free | Keyword | 1,200 | HIGH | 2-4h | 480 visits |
| what is a genealogy chart | SERP | 800 | HIGH | 1-2h | 320 clicks |
| genealogy research tips | Keyword | 2,200 | MEDIUM | 4-6h | 880 visits |
| how to start family tree | Keyword | 1,800 | HIGH | 3-5h | 720 visits |
| genealogy abbreviations | SERP | 600 | MEDIUM | 1h | 240 clicks |
| free family tree template | Keyword | 900 | HIGH | 2h | 360 visits |
| genealogy websites list | Content | 1,400 | MEDIUM | 4-6h | 560 visits |
| DNA test comparison table | Content | 3,200 | HIGH | 6-8h | 1,280 visits |
| census record examples | SERP | 500 | MEDIUM | 2h | 200 clicks |
| genealogy for beginners PDF | Keyword | 1,100 | HIGH | 3-4h | 440 visits |

**Total Quick Win Potential:** 5,480 monthly visits (20-40 hours effort)

## Recommendations

### Immediate Actions (Next 30 Days)
1. **Create DNA testing comparison guide** (12-16h, 12.4K traffic potential)
2. **Target 4 featured snippets** (6-10h, 4.8K traffic potential)
3. **Build 2 high-DA backlinks** (6-10h, significant authority boost)
4. **Launch 5 quick win opportunities** (12-20h, 2.4K traffic potential)

### Short-Term (60-90 Days)
5. Create genealogy beginner's guide (10-14h, 6.8K traffic)
6. Build free resource library (6-8h, 8.6K traffic)
7. Capture 8 PAA boxes (8-12h, 3.6K traffic)
8. Add FAQ sections to 3 key pages (6-8h, SERP feature captures)

### Long-Term (6-12 Months)
9. Develop comprehensive content cluster for "genealogy software" (40-60h)
10. Build 15 high-quality backlinks from genealogy community (50-80h)
11. Capture featured snippets for 10 how-to queries (30-40h)
12. Create video content for video carousel opportunities (80-120h)

## Pattern Intelligence Summary

**Patterns Applied:**
- comparison-guide (85% confidence): 8 opportunities
- how-to-guide (89% confidence): 12 opportunities
- resource-list (78% confidence): 4 opportunities
- product-comparison-table (85% confidence): 3 opportunities

**Pattern Sources:**
- RuVector genealogy industry patterns: 8 patterns
- Cross-industry proven patterns: 4 patterns
- SERP-specific patterns: 6 patterns

**Pattern Success Rates:**
- Comparison guides: 82% avg success rate (based on RuVector data)
- How-to guides: 89% avg success rate
- Resource lists: 76% avg success rate

## Intelligence Metrics

- **Competitor Intel Reused:** 2/3 competitors (67% cache hit)
- **SERP Patterns Applied:** 8 patterns from RuVector
- **Cost Savings:** $8.40 (cache hits avoided 18 API calls)
- **Execution Cost:** $2.60 (12 API calls)
- **Net Savings:** $5.80 (69% reduction)
- **Execution Time:** 3m 42s
- **Pattern Confidence:** 84% avg across all recommendations

## Next Steps

1. **Prioritize quick wins** (5 opportunities, 20-40 hours, 5.5K traffic)
2. **Start with DNA comparison guide** (highest traffic potential)
3. **Target 4 featured snippets** (low effort, high visibility)
4. **Outreach for 2 high-DA backlinks** (authority boost)
5. **Monitor rankings weekly** and iterate based on performance
6. **Re-run analysis in 90 days** to track progress and find new gaps

---

**Execution Time:** 3m 42s
**Cost:** $2.60 (12 API calls)
**Cache Savings:** $8.40 (67% hit rate)
**Total Opportunities:** 202 (34 high priority)
```

---

## Domain Validation

Same validation as `/seo-technical-audit` (see above).

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid domain format` | Domain doesn't match regex | Use format `example.com` |
| `No competitors provided/found` | Auto-discovery failed | Manually specify competitors |
| `Competitor analysis failed` | API error or site inaccessible | Skip competitor or retry |
| `Insufficient data` | Competitor has minimal online presence | Use different competitor |
| `API quota exceeded` | DataForSEO rate limit | Wait or use cached data only |
| `RuVector connection failed` | Vector DB unavailable | Continue without patterns |
| `Industry not recognized` | Invalid industry parameter | Use general patterns |

---

## Performance Metrics

### Expected Duration by Scenario

| Scenario | Competitors | Cache Hit | Duration | API Calls | Cost |
|----------|-------------|-----------|----------|-----------|------|
| Cached competitors | 3 | 80% | 1-2 min | 5-8 | $0.50-1.00 |
| Mixed cache | 3 | 50% | 2-4 min | 10-15 | $1.50-2.50 |
| Fresh analysis | 3 | 0% | 5-8 min | 25-35 | $5.00-8.00 |
| Auto-discover + fresh | 5 | 0% | 8-12 min | 40-60 | $8.00-12.00 |

### Gap Type Analysis Time

| Gap Type | Duration | API Calls | Cost |
|----------|----------|-----------|------|
| Keywords only | 1-2 min | 5-10 | $0.50-1.50 |
| Content only | 1-2 min | 3-5 | $0.30-0.80 |
| Backlinks only | 2-3 min | 8-12 | $1.50-2.50 |
| SERP features only | 1-2 min | 5-8 | $0.50-1.20 |
| All types | 3-6 min | 15-25 | $2.50-5.00 |

---

## Agent Responsibilities

The `competitive-seo-analyst` agent:

1. **Intelligence Lookup**: Query RuVector for cached competitor intel and SERP patterns
2. **Competitor Analysis**: Analyze provided or auto-discovered competitors
3. **Keyword Gap Analysis**: Identify ranking opportunities
4. **Content Gap Analysis**: Discover topic and content type opportunities
5. **Backlink Gap Analysis**: Find link building opportunities
6. **SERP Feature Analysis**: Map feature capture strategies
7. **Pattern Application**: Apply proven patterns from RuVector
8. **Priority Scoring**: Calculate opportunity scores
9. **Recommendations**: Generate actionable next steps
10. **Storage**: Save results and update RuVector intelligence

**Agent Spawning**:
```javascript
Task("competitive-seo-analyst", `
Execute Phase 5 gap analysis for domain: ${domain}

Competitors: ${competitors || 'auto-discover'}
Industry: ${industry || 'general'}
Gap Types: ${gapTypes || 'all'}

Parameters:
- Min Volume: ${minVolume}
- Max Difficulty: ${maxDifficulty}
- Skip Cache: ${skipCache ? 'true' : 'false'}
- Output Format: ${outputFormat}

Workflow:
1. Query RuVector for cached competitor intelligence
2. Query RuVector for SERP patterns (${industry})
3. Analyze competitors (or auto-discover)
4. Extract keyword gaps with traffic potential
5. Identify content gaps with pattern matching
6. Map backlink opportunities
7. Identify SERP feature gaps
8. Apply RuVector patterns to recommendations
9. Calculate priority scores
10. Generate quick wins list
11. Store results in Redis and RuVector
12. Output JSON + Markdown reports

Success Criteria:
- All gap types analyzed (${gapTypes})
- Minimum 50 opportunities identified
- Pattern confidence ≥ 0.75 for recommendations
- Quick wins list includes 10+ opportunities
- Reports include effort/impact estimates
- Cache metrics logged

Pattern Application:
- Apply industry-specific patterns from RuVector
- Boost opportunities matching proven patterns
- Include pattern confidence in recommendations

Report Format:
- JSON: .artifacts/seo/gap-analysis/${domain}/report.json
- Markdown: .artifacts/seo/gap-analysis/${domain}/report.md
- Quick wins: .artifacts/seo/gap-analysis/${domain}/quick-wins.json
`)
```

---

## Success Criteria

- Minimum 50 total opportunities identified
- All requested gap types analyzed
- Competitor intelligence cached or updated in RuVector
- SERP patterns applied with ≥ 0.75 confidence
- Priority scoring completed for all gaps
- Quick wins list includes 10+ opportunities
- Recommendations include effort and impact estimates
- Reports generated in specified format(s)
- Results cached in Redis with 30-day TTL

---

## Related Documentation

- Epic: `planning/epics/seo-onboarding-discovery/epic.json` (Sprint 2.2)
- Full Onboarding: `/seo-onboard` command
- Phase 5 Implementation: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-5-gaps.ts`
- RuVector Schemas: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/schemas.ts`
- Agent: `.claude/cfn-extras/agents/cfn-seo-team/competitive-seo-analyst.md`

---

## Integration with Other Commands

- `/seo-onboard`: Full onboarding includes Phase 5 gap analysis
- `/seo-technical-audit`: Run technical audit before gap analysis
- `/seo-discover-keywords`: Keyword discovery complements gap analysis

**Recommended Workflow**:
1. Run `/seo-technical-audit` (ensure technical health ≥ 0.70)
2. Run `/seo-gap-analysis` (identify competitive opportunities)
3. Prioritize quick wins and high-impact gaps
4. Create content based on gap recommendations
5. Re-run analysis quarterly to track progress

---

**Version**: 1.0.0
**Last Updated**: 2025-12-04
**Sprint**: 2.2 - Deliverable 2.2.2
**Confidence Score**: 0.92
