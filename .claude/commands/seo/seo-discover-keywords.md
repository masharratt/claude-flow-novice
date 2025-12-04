# /seo-discover-keywords

Automated keyword discovery with RuVector-powered semantic search and clustering.

## Usage

```bash
# Basic usage
/seo-discover-keywords --niche="project management software"

# With count limit
/seo-discover-keywords --niche="CRM tools" --count=100

# Quick mode (fast, low cost)
/seo-discover-keywords --niche="email marketing" --mode=quick

# Deep mode (comprehensive, higher cost)
/seo-discover-keywords --niche="SEO tools" --mode=deep --count=500
```

## Parameters

- `--niche` (required): Target niche or seed keyword
- `--count` (optional): Max keywords to return (default: 100, max: 1000)
- `--mode` (optional): Discovery mode - `quick` or `deep` (default: `quick`)
- `--task-id` (optional): Existing onboarding task ID to reuse context
- `--deduplicate` (optional): Enable semantic deduplication (default: `true`)
- `--cluster` (optional): Enable semantic clustering (default: `true`)

## Modes

### Quick Mode (fast, low cost)
- Sources: Google Search Console, Google Suggest, Competitor extraction
- Cache-first for all sources
- Semantic deduplication enabled
- Estimated cost: $0-0.50 (mostly free APIs)
- Execution time: 1-3 minutes

### Deep Mode (comprehensive)
- Sources: All sources (GSC, Suggest, PAA, Social, Competitors)
- Cache-first for paid APIs (DataForSEO)
- Semantic clustering enabled
- Estimated cost: $2-10 (depending on cache hit rate)
- Execution time: 5-15 minutes

## Workflow

### Step 0: RuVector Pre-Research Query
Query `keyword_research` collection for cached keywords in niche:
```bash
# Query RuVector for existing keyword data
./scripts/ruvector/query-keywords.sh \
  --collection keyword_research \
  --query "$NICHE" \
  --limit 1000 \
  --similarity-threshold 0.75
```

Returns cached keywords with metrics, reducing API calls by 40-70%.

### Step 1: Source Collection
Run collectors based on mode:

**Quick Mode Sources:**
- Google Search Console API (if connected)
- Google Suggest autocomplete
- Top 3 competitor keyword extraction

**Deep Mode Sources:**
- All Quick mode sources
- People Also Ask questions
- Social media hashtag research
- Top 10 competitor keyword extraction
- Related searches from SERP

Collectors write to:
```
.artifacts/seo/keyword-discovery/{taskId}/sources/
  ├── gsc-keywords.json
  ├── suggest-keywords.json
  ├── competitor-keywords.json
  ├── paa-questions.json
  └── social-keywords.json
```

### Step 2: Metric Enrichment
Lookup search volume and difficulty (cache-first via DataForSEO wrapper):

```bash
# Enrichment workflow
for keyword in "${NEW_KEYWORDS[@]}"; do
  # Check RuVector cache first
  cached_metrics=$(query_ruvector_metrics "$keyword")

  if [[ -n "$cached_metrics" ]]; then
    # Use cached data (free)
    use_cached_metrics "$keyword" "$cached_metrics"
  else
    # Fetch from DataForSEO API (paid)
    fetch_keyword_metrics "$keyword"
    store_in_ruvector "$keyword" "$metrics"
  fi
done
```

Metrics collected:
- Search volume (monthly avg)
- Keyword difficulty (0-100)
- CPC (cost per click)
- Search intent (informational, commercial, transactional, navigational)
- SERP features
- Trend data (12-month)

### Step 3: Semantic Deduplication
Use RuVector embeddings to remove near-duplicates (40%+ improvement):

```bash
# Deduplication via RuVector similarity
./scripts/ruvector/deduplicate-keywords.sh \
  --input keywords.json \
  --similarity-threshold 0.85 \
  --keep-strategy highest_volume
```

Example deduplication:
- "best project management software" (8,100 vol) → KEEP
- "best PM software" (1,200 vol) → REMOVE (88% similar)
- "top project management tools" (5,400 vol) → KEEP (72% similar)

Typical reduction: 43% fewer redundant keywords.

### Step 4: Semantic Clustering (Deep mode only)
Group keywords into topic clusters for content pillar planning:

```bash
# Clustering via RuVector embeddings
./scripts/ruvector/cluster-keywords.sh \
  --input deduplicated-keywords.json \
  --min-cluster-size 5 \
  --similarity-threshold 0.70 \
  --output clusters.json
```

Cluster output example:
```json
{
  "clusters": [
    {
      "id": "cluster-001",
      "name": "PM Software Selection",
      "keywords": 42,
      "centroid": "project management software comparison",
      "avgOpportunityScore": 0.82,
      "recommendedContentType": "comparison-guide",
      "topKeywords": [
        {"keyword": "best PM software", "volume": 8100, "score": 0.89},
        {"keyword": "PM tools comparison", "volume": 5400, "score": 0.85}
      ]
    }
  ]
}
```

### Step 5: Opportunity Scoring
Apply opportunity scorer from Sprint 1.3 with pattern boost:

```bash
# Score keywords using proven patterns
./claude-assets/skills/seo-opportunity-scorer/score-keywords.sh \
  --input deduplicated-keywords.json \
  --patterns-collection ruvector_patterns \
  --boost-pattern-matches 0.15
```

Scoring formula:
```
opportunityScore = (
  (searchVolume / 10000) * 0.30 +
  ((100 - keywordDifficulty) / 100) * 0.25 +
  intentWeight * 0.20 +
  cpcScore * 0.15 +
  patternMatchBoost * 0.10
)
```

Pattern boost examples:
- Matches "comparison" pattern → +0.15 score
- Matches "best X for Y" pattern → +0.12 score
- No pattern match → +0.00 score

### Step 6: RuVector Storage
Store new discoveries in `keyword_research` collection:

```bash
# Store keywords in RuVector
./scripts/ruvector/index-keywords.sh \
  --collection keyword_research \
  --input scored-keywords.json \
  --ttl-days 14 \
  --metadata niche,volume,difficulty,intent
```

Storage schema:
```typescript
{
  keyword: "best PM software",
  embedding: [0.123, -0.456, ...], // 1536-dim vector
  metadata: {
    niche: "project management",
    searchVolume: 8100,
    keywordDifficulty: 65,
    cpc: 12.50,
    intent: "commercial",
    opportunityScore: 0.89,
    discoveredAt: "2025-12-03T10:30:00Z",
    source: "suggest",
    ttl: 14 // days
  }
}
```

TTL management:
- Cached keywords expire after 14 days
- Volume/difficulty metrics refresh on next query
- Prevents stale data from skewing results

### Step 7: Output Generation
Return prioritized keyword list with recommendations:

Outputs generated:
1. JSON report (`.artifacts/seo/keyword-discovery/{taskId}/report.json`)
2. Markdown report (`.artifacts/seo/keyword-discovery/{taskId}/report.md`)
3. CSV export (`.artifacts/seo/keyword-discovery/{taskId}/keywords.csv`)
4. Redis cache (key: `seo:discovery:{taskId}:results`, TTL: 30 days)

## Output Format

### JSON Output (programmatic)

```json
{
  "taskId": "keyword-discovery-1234567890",
  "niche": "project management software",
  "mode": "deep",
  "totalKeywords": 487,
  "cachedKeywords": 312,
  "newKeywords": 175,
  "cacheHitRate": 0.64,
  "costSavings": "$8.20",
  "executionTime": "8m 42s",
  "deduplicationRate": 0.43,
  "keywords": [
    {
      "keyword": "best project management software",
      "searchVolume": 8100,
      "keywordDifficulty": 65,
      "cpc": 12.50,
      "searchIntent": "commercial",
      "opportunityScore": 0.89,
      "source": "suggest",
      "cluster": "PM Software Selection",
      "clusterRank": 1,
      "recommendedAction": "Create comparison article",
      "estimatedTraffic": 2430,
      "patternMatch": true,
      "patternType": "comparison",
      "competitorGap": false
    },
    {
      "keyword": "project management tools comparison",
      "searchVolume": 5400,
      "keywordDifficulty": 58,
      "cpc": 10.80,
      "searchIntent": "commercial",
      "opportunityScore": 0.85,
      "source": "competitor",
      "cluster": "PM Software Selection",
      "clusterRank": 2,
      "recommendedAction": "Create comparison guide",
      "estimatedTraffic": 1620,
      "patternMatch": true,
      "patternType": "comparison",
      "competitorGap": true
    }
  ],
  "clusters": [
    {
      "id": "cluster-001",
      "name": "PM Software Selection",
      "keywords": 42,
      "avgOpportunityScore": 0.82,
      "totalSearchVolume": 85400,
      "avgKeywordDifficulty": 61,
      "recommendedContentType": "comparison-guide",
      "quickWins": 8,
      "estimatedTraffic": 25620
    },
    {
      "id": "cluster-002",
      "name": "PM for Small Teams",
      "keywords": 28,
      "avgOpportunityScore": 0.76,
      "totalSearchVolume": 42800,
      "avgKeywordDifficulty": 48,
      "recommendedContentType": "buying-guide",
      "quickWins": 12,
      "estimatedTraffic": 12840
    }
  ],
  "recommendations": [
    "Focus on 'PM Software Selection' cluster (42 keywords, high opportunity)",
    "Quick wins: 12 keywords with KD < 30 and volume > 1000",
    "Content gaps: Create comparison guide for top 10 keywords",
    "Pattern insight: 67% of keywords match successful 'comparison' pattern"
  ],
  "intelligence": {
    "cacheHits": 312,
    "cacheMisses": 175,
    "cacheHitRate": 0.64,
    "apiCallsSaved": 312,
    "costPerCall": 0.025,
    "totalSavings": 7.80,
    "executionCost": 4.38,
    "netSavings": 3.42,
    "savingsPercentage": 0.44,
    "deduplicationRate": 0.43,
    "patternMatches": 189,
    "competitorGaps": 67,
    "quickWinCount": 34,
    "estimatedMonthlyTrafficValue": 8200
  }
}
```

### Markdown Output (human-readable)

```markdown
# Keyword Discovery Report: project management software

**Mode:** Deep | **Keywords:** 487 | **Cache Hit Rate:** 64% | **Cost Savings:** $8.20

## Top 20 Opportunities

| Keyword | Volume | KD | Score | Intent | Action |
|---------|--------|-------|-------|---------|---------|
| best project management software | 8,100 | 65 | 0.89 | Commercial | Comparison article |
| project management tools comparison | 5,400 | 58 | 0.85 | Commercial | Comparison guide |
| PM software for small teams | 3,600 | 42 | 0.81 | Commercial | Buying guide |
| free project management tools | 6,200 | 55 | 0.78 | Informational | Listicle |
| Asana vs Trello vs Monday | 2,800 | 48 | 0.76 | Commercial | Head-to-head |
| project management software pricing | 1,900 | 38 | 0.74 | Commercial | Pricing guide |
| best PM tools for remote teams | 2,400 | 44 | 0.72 | Commercial | Buying guide |
| project management software features | 1,600 | 35 | 0.70 | Informational | Feature guide |
| how to choose PM software | 1,200 | 28 | 0.68 | Informational | How-to guide |
| project management software reviews | 3,100 | 52 | 0.67 | Commercial | Review roundup |
| cloud project management tools | 1,800 | 46 | 0.65 | Commercial | Listicle |
| agile project management software | 2,200 | 50 | 0.64 | Commercial | Buying guide |
| PM software integrations | 980 | 32 | 0.62 | Informational | Integration guide |
| project management software ROI | 750 | 25 | 0.60 | Informational | Case study |
| best PM software 2025 | 4,200 | 58 | 0.59 | Commercial | Annual roundup |
| project tracking software | 3,400 | 54 | 0.58 | Commercial | Comparison article |
| team collaboration tools | 5,600 | 62 | 0.57 | Commercial | Listicle |
| PM software for construction | 1,400 | 40 | 0.56 | Commercial | Industry guide |
| project management templates | 2,600 | 36 | 0.55 | Informational | Resource library |
| PM software mobile app | 890 | 30 | 0.54 | Commercial | App comparison |

## Keyword Clusters

### 1. PM Software Selection (42 keywords)
- Avg opportunity score: 0.82
- Total search volume: 85,400/month
- Avg keyword difficulty: 61
- Recommended content: Comparison guide
- Quick wins: 8 keywords (KD < 30)
- Estimated traffic: 25,620 visits/month

**Top keywords:**
- best project management software (8,100 vol, 0.89 score)
- project management tools comparison (5,400 vol, 0.85 score)
- PM software for small teams (3,600 vol, 0.81 score)

### 2. PM for Small Teams (28 keywords)
- Avg opportunity score: 0.76
- Total search volume: 42,800/month
- Avg keyword difficulty: 48
- Recommended content: Buying guide
- Quick wins: 12 keywords
- Estimated traffic: 12,840 visits/month

**Top keywords:**
- PM software for small teams (3,600 vol, 0.81 score)
- best PM tools for remote teams (2,400 vol, 0.72 score)
- simple project management software (1,800 vol, 0.68 score)

### 3. PM Software Features (18 keywords)
- Avg opportunity score: 0.68
- Total search volume: 24,600/month
- Avg keyword difficulty: 38
- Recommended content: Feature guide
- Quick wins: 7 keywords
- Estimated traffic: 7,380 visits/month

**Top keywords:**
- project management software features (1,600 vol, 0.70 score)
- PM software integrations (980 vol, 0.62 score)
- time tracking in PM tools (1,200 vol, 0.59 score)

## Recommendations

1. **Content Priority:** Create comparison guide for "PM Software Selection" cluster (42 keywords, highest opportunity)
2. **Quick Wins:** Target 12 keywords with KD < 30 in "PM for Small Teams" cluster (easy rankings)
3. **Content Gaps:** Missing guides for small business and remote teams (competitor opportunity)
4. **Pattern Insights:** 67% of keywords match successful "comparison" pattern from RuVector intelligence
5. **Competitor Gaps:** 67 keywords where competitors rank but you don't (immediate opportunities)

## Intelligence Summary

- **Cache hits:** 312/487 keywords (64% cost savings)
- **Semantic deduplication:** 487 raw keywords → 278 unique clusters (43% reduction)
- **Pattern matches:** 189 keywords match proven RuVector success patterns
- **Quick wins:** 34 keywords with KD < 30 and volume > 500
- **Competitor gaps:** 67 keywords where top competitors rank but you don't
- **Estimated ROI:** $4.38 spent → $8,200 potential monthly traffic value (1,872x return)
- **Execution efficiency:** 8m 42s (deep mode), saved $8.20 via RuVector caching

## Cost Breakdown

| Item | Count | Unit Cost | Total |
|------|-------|-----------|-------|
| Cached keyword lookups | 312 | $0.00 | $0.00 |
| New keyword metrics (DataForSEO) | 175 | $0.025 | $4.38 |
| **Total execution cost** | | | **$4.38** |
| **API calls saved via cache** | 312 | $0.025 | **$7.80** |
| **Net savings** | | | **$3.42 (44%)** |

## Next Steps

1. Create comparison guide targeting "PM Software Selection" cluster
2. Publish buying guide for "PM for Small Teams" cluster
3. Target 34 quick-win keywords (low competition, decent volume)
4. Monitor rankings weekly, refresh keyword data in 14 days
```

## Redis Storage

Store discovery results for 30-day caching and reuse:

```bash
# Store full report
redis-cli SET "seo:discovery:${TASK_ID}:results" "$JSON_REPORT" EX 2592000

# Store metadata for analytics
redis-cli HSET "seo:discovery:${TASK_ID}:meta" \
  niche "$NICHE" \
  mode "$MODE" \
  keywordCount "$TOTAL_KEYWORDS" \
  cacheHitRate "$CACHE_HIT_RATE" \
  costSavings "$COST_SAVINGS" \
  executionTime "$EXECUTION_TIME"

# Store cluster data
redis-cli SET "seo:discovery:${TASK_ID}:clusters" "$CLUSTERS_JSON" EX 2592000

# Store quick wins for rapid access
redis-cli SET "seo:discovery:${TASK_ID}:quickwins" "$QUICK_WINS_JSON" EX 2592000
```

Keys created:
- `seo:discovery:{taskId}:results` - Full JSON report (30-day TTL)
- `seo:discovery:{taskId}:meta` - Metadata hash (30-day TTL)
- `seo:discovery:{taskId}:clusters` - Cluster data (30-day TTL)
- `seo:discovery:{taskId}:quickwins` - Quick-win keywords (30-day TTL)

## RuVector Storage

Store new keywords in `keyword_research` collection with metadata:

```typescript
// Collection: keyword_research
{
  id: "kw-best-pm-software-123",
  keyword: "best PM software",
  embedding: [0.123, -0.456, ...], // 1536-dimensional vector
  metadata: {
    niche: "project management",
    searchVolume: 8100,
    keywordDifficulty: 65,
    cpc: 12.50,
    intent: "commercial",
    opportunityScore: 0.89,
    discoveredAt: "2025-12-03T10:30:00Z",
    source: "suggest",
    cluster: "PM Software Selection",
    patternMatch: true,
    patternType: "comparison",
    ttl: 14 // days until metrics refresh needed
  }
}
```

RuVector queries for cache retrieval:

```bash
# Query for existing keywords in niche
./scripts/ruvector/search-collection.sh \
  --collection keyword_research \
  --query "project management software" \
  --filter "metadata.niche == 'project management'" \
  --limit 1000 \
  --min-score 0.75

# Query for pattern matches
./scripts/ruvector/search-collection.sh \
  --collection ruvector_patterns \
  --query "$KEYWORD" \
  --limit 5 \
  --min-score 0.80
```

## Error Handling

### Missing Required Parameters
```bash
if [[ -z "$NICHE" ]]; then
  echo "ERROR: --niche parameter is required"
  echo "Usage: /seo-discover-keywords --niche=\"your niche here\""
  exit 1
fi
```

### API Failures
```bash
# Fallback to cached data only
if ! fetch_keyword_metrics "$keyword"; then
  log_warn "API failure for '$keyword', using cached data only"
  cached_data=$(query_ruvector_cache "$keyword")

  if [[ -n "$cached_data" ]]; then
    use_cached_metrics "$keyword" "$cached_data"
  else
    log_error "No cached data available for '$keyword', skipping"
    continue
  fi
fi
```

### Rate Limits
```bash
# Throttle and resume from checkpoint
attempt=0
while [[ $attempt -lt 3 ]]; do
  if fetch_batch_metrics "$batch"; then
    break
  else
    log_warn "Rate limit hit, waiting 60s before retry (attempt $((attempt+1))/3)"
    sleep 60
    ((attempt++))
  fi
done

# Save checkpoint for resume
save_checkpoint "$processed_keywords" "$CHECKPOINT_FILE"
```

### Invalid Mode
```bash
# Default to quick mode
if [[ "$MODE" != "quick" && "$MODE" != "deep" ]]; then
  log_warn "Invalid mode '$MODE', defaulting to 'quick'"
  MODE="quick"
fi
```

### RuVector Connection Failures
```bash
# Graceful degradation
if ! ping_ruvector; then
  log_warn "RuVector unavailable, disabling semantic features"
  DEDUPLICATE=false
  CLUSTER=false
  PATTERN_BOOST=false
fi
```

## Cost Tracking

Log cost savings from RuVector cache hits:

```bash
# Calculate savings
CACHE_HITS=312
API_COST_PER_CALL=0.025
TOTAL_SAVINGS=$(echo "$CACHE_HITS * $API_COST_PER_CALL" | bc)

# Calculate execution cost
NEW_LOOKUPS=175
EXECUTION_COST=$(echo "$NEW_LOOKUPS * $API_COST_PER_CALL" | bc)

# Calculate net savings
NET_SAVINGS=$(echo "$TOTAL_SAVINGS - $EXECUTION_COST" | bc)
SAVINGS_PCT=$(echo "scale=2; $NET_SAVINGS / $TOTAL_SAVINGS * 100" | bc)

# Log to analytics
log_cost_metrics \
  --cache-hits "$CACHE_HITS" \
  --api-calls-saved "$CACHE_HITS" \
  --total-savings "$TOTAL_SAVINGS" \
  --execution-cost "$EXECUTION_COST" \
  --net-savings "$NET_SAVINGS" \
  --savings-percentage "$SAVINGS_PCT"
```

Example output:
```
Total API calls avoided: 312
Cost per call: $0.025
Total savings: $7.80
Execution cost: $4.38 (175 new lookups)
Net savings: $3.42 (44% reduction)
```

## Examples

### Example 1: Quick Discovery
```bash
/seo-discover-keywords --niche="email marketing tools" --mode=quick

# Returns: 50-100 keywords in 1-2 minutes
# Sources: GSC + Suggest + Top 3 competitors
# Cost: $0-0.50 (mostly cached + free APIs)
# Output: JSON + Markdown reports in .artifacts/seo/keyword-discovery/
```

### Example 2: Deep Discovery with Clustering
```bash
/seo-discover-keywords --niche="CRM software" --mode=deep --count=500

# Returns: 400-500 keywords with semantic clusters
# Sources: All sources (GSC, Suggest, PAA, Social, Competitors)
# Execution: 5-10 minutes
# Cost: $2-10 (depending on cache hit rate)
# Features: Semantic clustering, pattern matching, competitor gap analysis
# Output: Clustered keyword groups with content pillar recommendations
```

### Example 3: Reuse Onboarding Context
```bash
/seo-discover-keywords --task-id="onboarding-abc123" --mode=deep

# Reuses competitor data and site context from previous onboarding
# Skips competitor extraction (already done)
# Faster execution: 3-5 minutes
# Lower cost: Reuses cached competitor keywords
```

### Example 4: Disable Semantic Features
```bash
/seo-discover-keywords --niche="project management" --deduplicate=false --cluster=false

# Fast raw keyword list without semantic processing
# Useful for quick exports or when RuVector is unavailable
# Execution: 1-2 minutes
# Output: Flat keyword list sorted by opportunity score
```

## Related Commands

- `/seo-onboard`: Full site onboarding (includes Phase 4 keyword universe)
- `/seo-gap-analysis`: Competitive keyword gap analysis (Sprint 2.2)
- `/seo-blog`: Generate SEO-optimized blog post from keyword research
- `/seo-landing`: Generate conversion-optimized landing page

## Integration Points

### RuVector Collections Used
- `keyword_research`: Cached keyword metrics (14-day TTL)
- `ruvector_patterns`: Proven content patterns from successful pages
- `competitor_keywords`: Competitor keyword tracking

### Redis Keys Used
- `seo:discovery:{taskId}:results`: Full report cache
- `seo:discovery:{taskId}:meta`: Execution metadata
- `seo:discovery:{taskId}:clusters`: Cluster data
- `seo:discovery:{taskId}:quickwins`: Low-competition opportunities

### Artifacts Generated
```
.artifacts/seo/keyword-discovery/{taskId}/
  ├── report.json          # Full JSON report
  ├── report.md            # Human-readable markdown
  ├── keywords.csv         # Spreadsheet export
  ├── clusters.json        # Semantic clusters
  ├── quickwins.json       # Low-competition keywords
  └── sources/             # Raw source data
      ├── gsc-keywords.json
      ├── suggest-keywords.json
      ├── competitor-keywords.json
      ├── paa-questions.json
      └── social-keywords.json
```

## Agent Spawned

This command spawns `seo-analytics-specialist` agent to orchestrate discovery workflow:

```bash
# Spawning pattern (internal)
Task("seo-analytics-specialist", `
  Execute keyword discovery workflow for niche: ${NICHE}

  Parameters:
  - Mode: ${MODE}
  - Count: ${COUNT}
  - Task ID: ${TASK_ID}
  - Deduplicate: ${DEDUPLICATE}
  - Cluster: ${CLUSTER}

  Workflow:
  1. Query RuVector for cached keywords in niche
  2. Run source collectors (${MODE} mode sources)
  3. Enrich keywords with metrics (cache-first)
  4. Semantic deduplication (${DEDUPLICATE})
  5. Semantic clustering (${CLUSTER})
  6. Opportunity scoring with pattern boost
  7. Store new discoveries in RuVector
  8. Generate JSON + Markdown reports
  9. Store results in Redis (30-day TTL)

  Success criteria:
  - All sources queried successfully
  - Metrics enriched for all keywords
  - Reports generated in .artifacts/seo/keyword-discovery/${TASK_ID}/
  - Results stored in Redis and RuVector
  - Cost tracking logged

  Report:
  - Cache hit rate
  - Cost savings
  - Top opportunities
  - Cluster recommendations
  - Quick wins
  - Execution time
`, { provider: "kimi" });
```

## Performance Benchmarks

Expected performance by mode:

### Quick Mode
- Keywords: 50-100
- Execution time: 1-3 minutes
- API calls: 20-50 (rest cached)
- Cost: $0.50-$1.25
- Cache hit rate: 60-80%
- Sources: 3 (GSC, Suggest, Competitors)

### Deep Mode
- Keywords: 300-500
- Execution time: 5-15 minutes
- API calls: 100-300 (rest cached)
- Cost: $2.50-$7.50
- Cache hit rate: 40-70% (improves over time)
- Sources: 6 (all available)
- Clustering: Yes
- Pattern matching: Yes

## Best Practices

1. **Start with Quick Mode**: Use quick mode for initial exploration, deep mode for comprehensive research
2. **Reuse Task IDs**: Reference previous onboarding task IDs to skip redundant competitor extraction
3. **Monitor Cache Hit Rate**: Low rates indicate new niche, high rates indicate mature research
4. **Refresh Every 14 Days**: Keyword metrics have 14-day TTL, refresh for current volume/difficulty
5. **Focus on Clusters**: Deep mode clusters reveal content pillar opportunities
6. **Prioritize Quick Wins**: Target keywords with KD < 30 first for fast rankings
7. **Track Pattern Matches**: Keywords matching RuVector patterns have proven success rates
8. **Use Competitor Gaps**: Keywords where competitors rank but you don't are immediate opportunities
