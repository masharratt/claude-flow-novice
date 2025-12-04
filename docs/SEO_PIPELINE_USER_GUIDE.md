# SEO Pipeline User Guide

## 1. Overview

### Introduction

The SEO Pipeline is a comprehensive, AI-powered system designed to accelerate search engine optimization workflow automation. It orchestrates multiple phases of SEO analysis, from technical audits to competitive intelligence, using advanced semantic search and pattern learning.

The pipeline reduces manual work and decision-making time by automating research, analysis, and insight discovery. It supports both full onboarding workflows and targeted, standalone analyses.

### Architecture Overview

The SEO Pipeline operates through two complementary systems:

#### 7-Phase Onboarding Pipeline
A complete, sequential workflow for comprehensive SEO analysis:

1. **Phase 1: Technical SEO Audit** - Crawl site structure, identify technical issues
2. **Phase 2: Keyword Discovery** - Find relevant keywords with search intent and volume
3. **Phase 3: Semantic Clustering** - Group keywords by topic and intent
4. **Phase 4: Content Gap Analysis** - Identify missing content opportunities
5. **Phase 5: Competitive Gap Analysis** - Benchmark against top competitors
6. **Phase 6: Intent-Driven Content Strategy** - Map content to user intent
7. **Phase 7: Performance Feedback Loop** - Continuous optimization and pattern learning

#### Keyword Discovery Module
A focused subsystem for rapid keyword research (Phases 2-3 condensed).

#### Standalone Analyses
Individual phases available for quick, targeted assessments:
- Phase 1: Technical audit without full pipeline
- Phase 5: Competitive analysis without full workflow

### RuVector Intelligence Explained

RuVector is the semantic search and intelligence engine powering the pipeline. It provides:

- **Semantic Search**: Understands intent, not just keywords
- **Pattern Recognition**: Learns from past analyses and SERP patterns
- **Cost Optimization**: Reduces API calls by 80%+ through intelligent caching
- **Knowledge Persistence**: Builds a growing knowledge base of SEO patterns and opportunities

RuVector integrates with 6 specialized SEO collections:

| Collection | Purpose | Update Frequency |
|---|---|---|
| expert_sources | Industry insights, best practices | Weekly |
| statistics | Search volume, trends, competitive data | Daily |
| keyword_research | Discovered keywords, long-tail variants | Per-query |
| competitor_intelligence | Competitor keywords, rankings, gaps | Weekly |
| serp_patterns | Search result layouts, featured snippets | Weekly |
| content_patterns | Successful content structures, formats | Monthly |

---

## 2. Commands Reference

### /seo-onboard

**Purpose**: Execute the full 7-phase SEO pipeline for complete site analysis and strategy development.

**Use Cases**:
- New site optimization from scratch
- Comprehensive SEO audit and planning
- Competitive market entry analysis
- Full content strategy refresh

**Input Requirements**:
```bash
/seo-onboard --site-url https://example.com \
  --target-country US \
  --target-language en \
  --competitor-urls url1,url2,url3 \
  [--custom-keywords keyword1,keyword2] \
  [--competitor-count 5]
```

| Parameter | Required | Description | Example |
|---|---|---|---|
| --site-url | Yes | Target website URL | https://example.com |
| --target-country | Yes | Geographic market (ISO code) | US, GB, DE |
| --target-language | Yes | Content language (ISO code) | en, de, fr |
| --competitor-urls | Yes | Comma-separated list of competitors | url1,url2,url3 |
| --custom-keywords | No | Additional keywords to research | keyword1,keyword2 |
| --competitor-count | No | Number of top competitors to analyze (def: 3) | 5 |

**Output Format**:
```json
{
  "pipeline_id": "seo-pipeline-20241204-001",
  "site_url": "https://example.com",
  "phases": [
    {
      "phase": 1,
      "name": "Technical SEO Audit",
      "status": "completed",
      "issues_found": 12,
      "summary": "..."
    },
    {
      "phase": 2,
      "name": "Keyword Discovery",
      "status": "completed",
      "keywords_found": 1250,
      "avg_volume": 450,
      "summary": "..."
    }
  ],
  "strategic_recommendations": [],
  "next_steps": []
}
```

**Example Usage**:

```bash
/seo-onboard --site-url https://myblog.com \
  --target-country US \
  --target-language en \
  --competitor-urls https://competitor1.com,https://competitor2.com,https://competitor3.com
```

**Expected Runtime**: 25-40 minutes (depends on site size and API availability)

**Output Location**: `.artifacts/seo-results/pipeline-{id}/`

---

### /seo-discover-keywords

**Purpose**: Rapid keyword discovery and semantic clustering (Phases 2-3 only).

**Use Cases**:
- Quick keyword research for a specific topic
- Expanding keyword coverage for existing content
- Market research before launching new content category
- Finding long-tail keyword opportunities

**Input Requirements**:
```bash
/seo-discover-keywords --seed-keywords "keyword1,keyword2" \
  --target-country US \
  --target-language en \
  [--expand-depth high|medium|low] \
  [--focus-intent commercial|informational|navigational]
```

| Parameter | Required | Description | Example |
|---|---|---|---|
| --seed-keywords | Yes | Starting keywords for expansion | "seo tools,keyword research" |
| --target-country | Yes | Geographic market | US, GB, CA |
| --target-language | Yes | Content language | en, de, es |
| --expand-depth | No | Expansion scope: high/medium/low (def: medium) | high |
| --focus-intent | No | Filter by search intent | commercial, informational |

**Output Format**:
```json
{
  "discovery_id": "kwd-discover-20241204-001",
  "clusters": [
    {
      "cluster_id": "cluster-001",
      "primary_keyword": "keyword",
      "intent": "informational",
      "keywords": [
        {
          "keyword": "how to keyword",
          "volume": 5200,
          "difficulty": 25,
          "trend": "stable"
        }
      ],
      "content_recommendation": "..."
    }
  ],
  "total_keywords": 420,
  "top_opportunities": []
}
```

**Example Usage**:

```bash
/seo-discover-keywords --seed-keywords "machine learning,AI trends" \
  --target-country US \
  --target-language en \
  --expand-depth high \
  --focus-intent informational
```

**Expected Runtime**: 5-10 minutes

**Output Location**: `.artifacts/seo-results/keyword-discovery-{id}/`

---

### /seo-technical-audit

**Purpose**: Standalone technical SEO audit (Phase 1 only).

**Use Cases**:
- Quick site health check
- Technical issue identification
- Crawlability assessment
- Site structure review

**Input Requirements**:
```bash
/seo-technical-audit --site-url https://example.com \
  [--crawl-depth shallow|deep] \
  [--include-mobile-audit true|false]
```

| Parameter | Required | Description | Example |
|---|---|---|---|
| --site-url | Yes | Website URL to audit | https://example.com |
| --crawl-depth | No | Crawl extent: shallow/deep (def: shallow) | deep |
| --include-mobile-audit | No | Include mobile SEO checks (def: true) | true |

**Output Format**:
```json
{
  "audit_id": "tech-audit-20241204-001",
  "site_url": "https://example.com",
  "overall_score": 78,
  "issues": [
    {
      "category": "crawlability",
      "severity": "high",
      "title": "Issue Title",
      "pages_affected": 5,
      "recommendation": "Fix recommendation",
      "impact": "SEO visibility impact"
    }
  ],
  "summary": "...",
  "quick_wins": []
}
```

**Example Usage**:

```bash
/seo-technical-audit --site-url https://example.com --crawl-depth deep
```

**Expected Runtime**: 3-8 minutes

**Output Location**: `.artifacts/seo-results/tech-audit-{id}/`

---

### /seo-gap-analysis

**Purpose**: Standalone competitive gap analysis (Phase 5 only).

**Use Cases**:
- Quick competitive benchmarking
- Identifying competitor keywords you're missing
- Content opportunity discovery
- Market positioning assessment

**Input Requirements**:
```bash
/seo-gap-analysis --site-url https://example.com \
  --competitor-urls url1,url2,url3 \
  --target-country US \
  [--analysis-scope keywords|content|rankings]
```

| Parameter | Required | Description | Example |
|---|---|---|---|
| --site-url | Yes | Your website URL | https://example.com |
| --competitor-urls | Yes | Competitors to compare against | url1,url2,url3 |
| --target-country | Yes | Market for analysis | US, GB, DE |
| --analysis-scope | No | Focus area: keywords/content/rankings (def: all) | keywords |

**Output Format**:
```json
{
  "analysis_id": "gap-analysis-20241204-001",
  "your_site": "https://example.com",
  "competitors": ["url1", "url2"],
  "gaps": [
    {
      "gap_type": "keyword",
      "keyword": "missing keyword",
      "competitors_ranking": ["url1", "url2"],
      "opportunity_score": 0.85,
      "recommendation": "Create content targeting..."
    }
  ],
  "summary": "...",
  "top_10_gaps": []
}
```

**Example Usage**:

```bash
/seo-gap-analysis --site-url https://myblog.com \
  --competitor-urls https://competitor1.com,https://competitor2.com \
  --target-country US \
  --analysis-scope keywords
```

**Expected Runtime**: 5-12 minutes

**Output Location**: `.artifacts/seo-results/gap-analysis-{id}/`

---

## 3. RuVector Intelligence

### What is RuVector Semantic Search?

RuVector is an intelligent semantic search system that understands context and meaning beyond keyword matching. Instead of finding exact phrase matches, RuVector:

- **Understands Intent**: Recognizes user search intent (informational, commercial, navigational)
- **Captures Semantics**: Links related concepts and variations
- **Learns Patterns**: Builds knowledge from successful analyses
- **Optimizes Cost**: Reduces redundant API calls through intelligent caching

### The 6 SEO Collections

RuVector maintains specialized knowledge in 6 collections:

#### 1. expert_sources
- Industry publications, thought leaders, case studies
- Best practices and guidelines
- Algorithm insights and trends
- **Use**: Strategic recommendations, best practice validation
- **Update**: Weekly

#### 2. statistics
- Search volume data by country/language
- Keyword difficulty scores
- Search trends and seasonality
- CPC and competition metrics
- **Use**: Keyword prioritization, market sizing
- **Update**: Daily

#### 3. keyword_research
- Discovered and validated keywords
- Long-tail keyword variants
- Keyword groupings and clusters
- Intent classification
- **Use**: Keyword expansion, duplicate detection
- **Update**: Per-query (real-time)

#### 4. competitor_intelligence
- Competitor keyword rankings
- Estimated traffic and visibility
- Content topics and formats
- Competitive positioning data
- **Use**: Gap analysis, benchmarking
- **Update**: Weekly

#### 5. serp_patterns
- Search result layouts (snippet types)
- Featured snippet content patterns
- Seasonal SERP volatility
- Entity recognition and knowledge panels
- **Use**: Content formatting, featured snippet optimization
- **Update**: Weekly

#### 6. content_patterns
- Successful content structures
- Word counts, heading patterns
- Content formats by topic
- Engagement indicators
- **Use**: Content strategy, creation templates
- **Update**: Monthly

### Cache Behavior and TTLs

The pipeline uses an intelligent cache-first architecture:

| Data Type | TTL | Invalidation Trigger |
|---|---|---|
| Technical audit results | 30 days | Site change detected, manual refresh |
| Keyword research | 14 days | New query, competitive change |
| Competitor data | 7 days | Competitor update detected |
| SERP patterns | 7 days | Weekly SERP rescan |
| Content patterns | 30 days | Trending topic shift |
| Cached API responses | 24 hours | API limit exceeded, manual clear |

**Cache Hit Rates**: 60-80% on keyword queries, 40-60% on competitor analysis

### Cost Savings Mechanisms

The pipeline achieves 80%+ API cost reduction through:

1. **Query Deduplication**: Identical queries within 24 hours use cache instead of API
2. **Semantic Similarity Matching**: Similar queries reuse related cached results
3. **Pattern Reuse**: Learned patterns from historical analyses avoid re-querying
4. **Batch Processing**: Multiple queries combined into single API calls
5. **Predictive Caching**: Preemptively caches likely follow-up queries

**Example Cost Savings**:
- Full onboarding (without cache): ~$150 in API costs
- Full onboarding (with cache): ~$25 in API costs
- 85% reduction on repeat keyword research

### Pattern Learning and Reuse

The pipeline continuously improves through pattern learning:

1. **Success Patterns**: High-performing keywords/content structures stored
2. **Failure Patterns**: Unsuccessful approaches logged to avoid repetition
3. **Trend Detection**: Emerging opportunities identified from pattern shifts
4. **Confidence Scoring**: Each pattern assigned confidence (0.0-1.0) based on historical accuracy
5. **Automatic Refinement**: Low-confidence patterns gradually deprioritized

Pattern data feeds into later analyses, improving recommendations over time.

---

## 4. Cache Behavior

### Cache-First Architecture

The pipeline operates on a cache-first principle:

```
Request → Check Cache → Cache Hit? → Return Cached Result
                             ↓
                            No
                             ↓
                       Execute API Call → Store Result → Return
```

### When Cache Hits Occur

Cache hits happen when:
- Same query executed within TTL window
- Semantically similar queries within TTL (fuzzy matching)
- Pattern confidence exceeds threshold (0.75+)
- Result freshness verified against source data
- API rate limits require cached fallback

### Freshness Checking

Before returning cached results, the system:

1. **Verifies TTL**: Confirms cache entry hasn't expired
2. **Checks Dependencies**: Ensures related data hasn't changed
3. **Samples Live Data**: For critical queries, validates against fresh API call
4. **Confidence Assessment**: Updates confidence based on staleness

### Cache Invalidation

Cache automatically invalidates when:

- TTL expires (see Cache Behavior table above)
- Source data updates detected (competitive change, SERP update)
- Manual refresh requested (`--force-refresh` flag)
- Error threshold exceeded (stale result caused issues)
- User explicitly clears cache (`--clear-cache` flag)

**Manual Cache Clear**:
```bash
/seo-clear-cache --collection keyword_research
/seo-clear-cache --all  # Clear all collections
```

---

## 5. Performance Feedback

### Step 13 Feedback Loop Setup

After Phase 7 completes, the pipeline enters a continuous feedback phase:

1. **Performance Tracking**: Monitor keyword ranking progress, traffic gains
2. **Confidence Updates**: Pipeline learns which recommendations worked
3. **Pattern Refinement**: Successful patterns reinforced, failures deprioritized
4. **Predictive Improvement**: Next analyses incorporate learnings

### How to Provide Performance Metrics

```bash
/seo-provide-feedback --pipeline-id seo-pipeline-20241204-001 \
  --keyword "target keyword" \
  --ranking-change -5 \
  --traffic-change +250 \
  --content-performance "good|fair|poor" \
  --implementation-status "done|in-progress|planned"
```

### Pattern Confidence Updates

The system automatically updates confidence based on outcomes:

- Positive outcome (rank gain, traffic increase): +0.05 confidence
- Neutral outcome (no change): -0.02 confidence (slight decay)
- Negative outcome (rank loss): -0.10 confidence
- Minimum confidence floor: 0.0, Maximum: 1.0

High-confidence patterns (0.85+) become default recommendations; low-confidence patterns (0.3-) fade from suggestions.

### Continuous Improvement Workflow

```
Week 1-2: Run /seo-onboard
     ↓
Week 2-4: Implement recommendations
     ↓
Week 4-5: Provide /seo-provide-feedback with results
     ↓
Week 5+: Run /seo-discover-keywords or /seo-gap-analysis
     ↓
System learns from outcomes → Better recommendations next cycle
```

---

## 6. Common Scenarios

### Scenario 1: New Site Onboarding Workflow

**Timeline**: 1-2 weeks

**Step 1: Initial Analysis**
```bash
/seo-onboard --site-url https://newsite.com \
  --target-country US \
  --target-language en \
  --competitor-urls https://competitor1.com,https://competitor2.com,https://competitor3.com
```

**Step 2: Review Results** (1-2 hours)
- Review technical issues from Phase 1
- Analyze keyword opportunities from Phase 2-3
- Identify content gaps from Phase 4-5
- Prioritize content strategy from Phase 6

**Step 3: Implement** (1-2 weeks)
- Fix technical issues first (high ROI)
- Create content for top keywords from clusters
- Optimize for competitive gaps
- Deploy content following intent-driven strategy

**Step 4: Monitor & Feedback**
```bash
/seo-provide-feedback --pipeline-id seo-pipeline-xxx \
  --keyword "primary keyword" \
  --ranking-change +3 \
  --traffic-change +150 \
  --content-performance good
```

---

### Scenario 2: Regular Keyword Discovery

**Timeline**: 2-3 hours per month

**Use Case**: Expand keyword coverage, find new opportunities

**Step 1: Run Discovery**
```bash
/seo-discover-keywords --seed-keywords "your-main-topic,related-topic" \
  --target-country US \
  --target-language en \
  --expand-depth high
```

**Step 2: Review & Cluster** (30 min)
- Review keyword clusters and intent groupings
- Identify quick-win opportunities (high volume, low difficulty)
- Note seasonal keywords for planning

**Step 3: Plan Content**
- Select 5-10 high-priority keywords for next sprint
- Create content briefs based on clustering and intent
- Schedule for publication

---

### Scenario 3: Quick Technical Audit

**Timeline**: 15-30 minutes

**Use Case**: Monthly health check or pre-campaign verification

**Step 1: Run Audit**
```bash
/seo-technical-audit --site-url https://example.com --crawl-depth shallow
```

**Step 2: Review Issues** (10 min)
- Scan high-severity issues
- Note any new problems vs. last audit
- Prioritize fixes

**Step 3: Action Plan**
- Assign quick wins to development team
- Schedule complex fixes for next sprint

---

### Scenario 4: Competitive Gap Analysis

**Timeline**: 20-40 minutes

**Use Case**: Identify competitor advantages, find ranking opportunities

**Step 1: Run Analysis**
```bash
/seo-gap-analysis --site-url https://yoursite.com \
  --competitor-urls https://comp1.com,https://comp2.com,https://comp3.com \
  --target-country US \
  --analysis-scope keywords
```

**Step 2: Analyze Gaps** (15 min)
- Review top 20 gaps by opportunity score
- Identify patterns (missing topics, weak coverage)
- Assess feasibility vs. importance

**Step 3: Create Content Plan**
- Prioritize gap-closing content by ROI
- Estimate traffic potential
- Schedule creation and publication

---

## 7. Troubleshooting

### API Credential Setup

#### DataForSEO API

Required for keyword data, search volume, and competitive analysis.

**Setup Steps**:
1. Create account at https://app.dataforseo.com
2. Generate API credentials
3. Set environment variables:

```bash
export DATAFORSEO_LOGIN=your_email@example.com
export DATAFORSEO_PASSWORD=your_api_password
```

**Verify Setup**:
```bash
/seo-verify-credentials --provider dataforseo
```

#### Z.ai / OpenAI API

Required for semantic search and content analysis.

**Setup Steps**:
1. Obtain API key from Z.ai or OpenAI
2. Set environment variables:

```bash
export ZAI_API_KEY=your_zai_api_key
# OR
export OPENAI_API_KEY=your_openai_api_key
```

**Verify Setup**:
```bash
/seo-verify-credentials --provider zai
/seo-verify-credentials --provider openai
```

### Common Errors and Fixes

#### Error: "API Authentication Failed"

**Cause**: Invalid or missing API credentials

**Fix**:
1. Verify credentials are correctly set:
   ```bash
   echo $DATAFORSEO_LOGIN
   echo $ZAI_API_KEY
   ```
2. Check credentials are correct on provider dashboard
3. Regenerate API keys if needed
4. Retry command

#### Error: "Rate Limit Exceeded"

**Cause**: API quota exhausted for the day

**Fix**:
1. Wait 24 hours for quota reset (recommended)
2. Or upgrade API plan for higher limits
3. Check cache to reuse recent results:
   ```bash
   /seo-show-cache --collection statistics
   ```

#### Error: "Site Not Reachable"

**Cause**: Target website is down or blocked by robots.txt

**Fix**:
1. Verify site is accessible: `curl -I https://example.com`
2. Check robots.txt allows crawling:
   ```bash
   curl https://example.com/robots.txt
   ```
3. Whitelist crawler IP if geo-blocked
4. Retry command

#### Error: "Keyword Cluster Too Large"

**Cause**: Search term too broad, generates too many keywords

**Fix**:
1. Use more specific seed keywords:
   ```bash
   # Instead of: "marketing"
   # Use: "content marketing strategy, B2B"
   ```
2. Add focus intent filter:
   ```bash
   /seo-discover-keywords --seed-keywords "..." --focus-intent commercial
   ```
3. Reduce expand-depth:
   ```bash
   /seo-discover-keywords --seed-keywords "..." --expand-depth low
   ```

### Cache Issues

#### Cache Not Clearing

**Problem**: Results feel stale or old data being returned

**Solution**:
```bash
# Clear specific collection
/seo-clear-cache --collection keyword_research

# Clear all cache
/seo-clear-cache --all

# Force API call (bypass cache)
/seo-discover-keywords --seed-keywords "..." --force-refresh
```

#### High Cache Miss Rate

**Problem**: Few results using cache, many API calls needed

**Cause**: Queries too varied, patterns not established yet

**Solution**:
1. Run similar queries consistently (builds cache)
2. Use more seed keywords from similar categories
3. Check if TTLs are too aggressive:
   ```bash
   /seo-show-cache-settings
   ```

### Performance Issues

#### Pipeline Running Slowly

**Cause**: Large site, many competitors, or API latency

**Solution**:
1. For full onboarding, reduce scope:
   ```bash
   /seo-onboarding --site-url ... --competitor-count 3
   ```
2. Use focused commands instead of full pipeline:
   ```bash
   # Instead of full onboard
   /seo-technical-audit --site-url ... --crawl-depth shallow
   /seo-discover-keywords --seed-keywords "..."
   ```
3. Check API provider status:
   ```bash
   /seo-check-api-status --provider dataforseo
   ```

#### High API Cost

**Problem**: API charges are higher than expected

**Solution**:
1. Leverage cache more effectively:
   ```bash
   /seo-show-cache --all
   ```
2. Batch similar queries together
3. Run on lower frequency (weekly vs. daily)
4. Use focused commands instead of full onboarding
5. Consider upgrading API plan for volume discounts

#### Keyword Discoveries Not Matching Expectations

**Cause**: Seed keywords too niche, target market filters too restrictive

**Solution**:
1. Adjust seed keywords to more common terms
2. Remove intent filters if too restrictive
3. Increase expand-depth for broader discovery
4. Check market exists in target country:
   ```bash
   /seo-verify-market --country US --language en --topic "your-topic"
   ```

---

## 8. API Credentials Setup and Configuration

### Environment Variables Needed

Create a `.env` file or export these variables:

```bash
# DataForSEO (required for keyword and competitive data)
export DATAFORSEO_LOGIN=your_email@example.com
export DATAFORSEO_PASSWORD=your_api_password

# Z.ai or OpenAI (required for semantic search)
export ZAI_API_KEY=your_api_key
# OR
export OPENAI_API_KEY=your_api_key

# Optional: SEO pipeline configuration
export SEO_CACHE_DIR=~/.cache/seo-pipeline
export SEO_MAX_CACHE_AGE_DAYS=30
export SEO_PARALLEL_QUERIES=3
```

### API Key Configuration

#### Step 1: DataForSEO Setup

1. Visit https://app.dataforseo.com
2. Sign up or log in
3. Navigate to "Account Settings" → "API Credentials"
4. Copy your Email and Password
5. Set environment variables:

```bash
export DATAFORSEO_LOGIN="your_email@example.com"
export DATAFORSEO_PASSWORD="your_api_password"
```

**Verify Connection**:
```bash
/seo-verify-credentials --provider dataforseo
# Expected output: "Connection successful. Quota: X requests/day"
```

#### Step 2: OpenAI or Z.ai Setup

**For OpenAI**:
1. Visit https://platform.openai.com/api-keys
2. Create new API key
3. Set environment variable:

```bash
export OPENAI_API_KEY="sk-..."
```

**For Z.ai**:
1. Get API key from Z.ai platform
2. Set environment variable:

```bash
export ZAI_API_KEY="your_zai_key"
```

**Verify Connection**:
```bash
/seo-verify-credentials --provider openai
/seo-verify-credentials --provider zai
```

### Cost Estimation and Limits

#### API Usage by Command

| Command | Avg Cost | Queries Required | Notes |
|---|---|---|---|
| /seo-technical-audit | $2-5 | 10-20 | Depends on site size |
| /seo-discover-keywords | $5-15 | 20-50 | Per seed keyword expansion |
| /seo-gap-analysis | $8-20 | 30-80 | Per competitor analyzed |
| /seo-onboard (full) | $30-60 | 150-300 | All 7 phases combined |

#### Cost Optimization Tips

1. **Leverage Cache**: 80%+ cost reduction through intelligent caching
2. **Batch Queries**: Group similar keywords together
3. **Schedule Off-Peak**: Run during low-traffic hours for potentially lower rates
4. **Upgrade Plan**: Volume plans offer 30-50% discounts
5. **Use Focused Commands**: Avoid full onboarding if you only need keyword discovery

#### Typical Monthly Spend

- **Small site, monthly discovery**: $50-100/month
- **Growing site, bi-weekly audits + discovery**: $150-300/month
- **Competitive site, weekly full analysis**: $400-800/month
- **Enterprise, daily tracking**: $1000-2000+/month

#### Usage Monitoring

```bash
# Check current API usage
/seo-show-api-usage --provider dataforseo

# Set spending alert
/seo-set-spending-alert --limit 500 --provider all

# View cost projections
/seo-show-cost-projections --commands "onboard,gap-analysis"
```

---

## 9. Quick Reference: Commands Summary

| Command | Purpose | Runtime | Cost |
|---|---|---|---|
| /seo-onboard | Full 7-phase pipeline | 25-40 min | $30-60 |
| /seo-discover-keywords | Keyword + clustering | 5-10 min | $5-15 |
| /seo-technical-audit | Phase 1 only | 3-8 min | $2-5 |
| /seo-gap-analysis | Phase 5 only | 5-12 min | $8-20 |
| /seo-clear-cache | Clear cache | Instant | Free |
| /seo-verify-credentials | Check API setup | 1 min | Free |
| /seo-provide-feedback | Feedback loop | 1 min | Free |

---

## 10. Support and Resources

### Documentation
- Full architecture: `docs/CFN_LOOP_ARCHITECTURE.md`
- Technical deep-dive: `.claude/skills/cfn-seo-pipeline/SKILL.md`
- Troubleshooting: This guide (Section 7)

### Getting Help
- Check troubleshooting section first
- Verify API credentials are set correctly
- Check cache status for unexpected results
- Review command examples for correct syntax

### Feedback and Improvements
- Report issues with: `--verbose` flag for detailed logs
- Provide feedback via: `/seo-provide-feedback` command
- Suggest features via project documentation

---

**Last Updated**: December 4, 2024
**Version**: 2.2
**Status**: Complete

