---
description: Full site onboarding with 7-phase analysis and RuVector intelligence
---

# /seo-onboard - SEO Site Onboarding Command

**Epic**: SEO Site Onboarding & Keyword Discovery System v2
**Sprint**: 1.1 (Site Onboarding Command, Coordinator & RuVector Schema)
**Purpose**: Systematic site analysis and SEO strategy generation with RuVector-powered intelligence
**Coordinator**: `seo-onboarding-coordinator`

---

## Command Syntax

```bash
/seo-onboard <domain> [--competitors=domain1,domain2,...] [--industry=INDUSTRY] [OPTIONS]
```

## Required Parameters

| Parameter | Description | Format |
|-----------|-------------|--------|
| `<domain>` | Domain to analyze | Valid domain (e.g., `example.com`) |

## Optional Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--competitors` | Comma-separated competitor domains | `ancestry.com,familysearch.org` |
| `--industry` | Industry/niche for context | `genealogy`, `saas`, `ecommerce` |
| `--gsc-credentials` | Google Search Console API credentials | Path to JSON file |
| `--ga4-credentials` | Google Analytics 4 API credentials | Path to JSON file |
| `--brand-guidelines` | Brand voice/style guide | Path to file |
| `--business-goals` | Revenue targets, key products | JSON config path |
| `--mode` | Analysis depth | `quick`, `standard` (default), `deep` |
| `--skip-cache` | Skip RuVector cache lookup | Flag |
| `--verbose` | Enable detailed logging | Flag |

---

## 7-Phase Onboarding Pipeline

The command orchestrates a comprehensive SEO analysis through seven sequential phases with RuVector intelligence integration:

### Phase 1: Technical Foundation
**Agent**: `technical-seo-specialist`
**Duration**: ~4-8 hours

**Pre-Phase (Step 0)**: Query RuVector for existing site profile

**Analysis**:
- Site crawl (all pages, sitemaps, discovery)
- Core Web Vitals assessment (PageSpeed Insights API)
- Indexability audit (robots.txt, meta robots, canonical tags)
- Mobile-friendliness check
- HTTPS/security validation
- Schema markup inventory
- Site architecture depth analysis

**Post-Phase (Step 4.5)**: Store site profile in RuVector for future reference

**Output**: Technical health score (0.0-1.0), critical issues list, performance metrics

**Blocking Condition**: If `technical_health_score < 0.50`, recommend fixing critical issues before content strategy

### Phase 2: Content Inventory
**Agent**: `content-seo-strategist`
**Duration**: ~6-10 hours

**Pre-Phase**: Query `content_patterns` collection for industry benchmarks

**Analysis**:
- Crawl all pages and extract metadata
- Classify content by type (blog, product, service, landing)
- Extract existing target keywords (title tags, H1s)
- Measure content depth (word count, headings, media)
- Compare against successful patterns from RuVector
- Identify thin content (<300 words) and duplicates
- Map internal linking structure

**Post-Phase**: Store content inventory metadata in RuVector

**Output**: Content inventory by type, existing keywords, content clusters, thin/duplicate content

### Phase 3: Competitor Discovery
**Agent**: `competitive-seo-analyst`
**Duration**: ~8-12 hours

**Pre-Phase**: Query `competitor_intelligence` for cached analysis

**Analysis**:
- Auto-discover competitors from SERP if not provided
- Skip API calls for previously analyzed competitors (cache hit)
- Gather competitor metrics (DA, traffic, backlinks)
- Analyze competitor content strategy patterns
- Extract competitor keyword portfolio (top 100)
- Identify competitor backlink sources
- Map SERP feature ownership

**Post-Phase**: Store new competitor intel in RuVector

**Output**: Competitor profiles with metrics, competitive positioning, market share

### Phase 4: Keyword Universe
**Agents**: `seo-analytics-specialist`, `content-seo-strategist`
**Duration**: ~10-16 hours

**Pre-Phase**: Query `keyword_research` collection for cached keywords (80%+ cost savings target)

**Analysis**:
- Seed keyword expansion (variations, modifiers)
- Competitor keyword extraction (from Phase 3)
- People Also Ask mining via DataForSEO (new keywords only)
- Google Suggest mining
- Search volume and difficulty lookup (cache first)
- Search intent classification (informational, commercial, transactional, navigational)
- Deduplication and clustering

**Post-Phase**: Store all new keywords in RuVector

**Output**: 500+ keywords with volume, difficulty, intent, clusters

### Phase 5: Gap Analysis
**Agent**: `competitive-seo-analyst`
**Duration**: ~6-10 hours

**Pre-Phase**: Query `serp_patterns` collection for known ranking strategies

**Analysis**:
- Keyword gaps (competitors rank, you don't)
- Content gaps (topics competitors cover, you don't)
- Backlink gaps (sites linking to competitors, not you)
- SERP feature gaps (snippets competitors own)
- Apply proven SERP patterns from RuVector
- Traffic potential calculation for each gap
- Priority scoring (HIGH/MEDIUM/LOW)

**Post-Phase**: Store new SERP patterns in RuVector

**Output**: Prioritized gaps with traffic potential, actionable opportunities

### Phase 6: Strategy Creation
**Agents**: `content-seo-strategist`, `competitive-seo-analyst`
**Duration**: ~8-12 hours

**Pre-Phase**: Query `content_patterns` for successful strategies by industry

**Strategy Components**:
- Content pillars (3-5 topic clusters) using pattern insights
- Quick wins (low effort, high impact)
- Competitive moats (unique content angles)
- Link building strategy prioritized using backlink patterns
- Technical issue resolution timeline
- Estimated results (6-month, 12-month targets)

**Output**: SEO strategy document with actionable roadmap

### Phase 7: Roadmap Generation
**Agent**: Coordinator (synthesis)
**Duration**: ~2-4 hours

**Output**: Month-by-month action plan with milestones, KPIs, dependencies

**Final Deliverables**:
- Executive summary with key findings
- Technical audit summary
- Content inventory summary
- Competitor landscape overview
- Top 20 keyword opportunities (with pattern match notes)
- Top 10 content gaps
- Prioritized 6-month roadmap
- Success metrics and KPIs
- RuVector intelligence summary (cache hits, patterns applied, cost savings)

---

## RuVector Intelligence Integration

### Pre-Research Queries (Step 0)
Before each phase, the coordinator queries RuVector collections:

- **Phase 1**: `site_profiles` - Check for existing technical analysis
- **Phase 2**: `content_patterns` - Get industry content benchmarks
- **Phase 3**: `competitor_intelligence` - Retrieve cached competitor data
- **Phase 4**: `keyword_research` - Skip API calls for known keywords
- **Phase 5**: `serp_patterns` - Apply proven ranking strategies

**Cache Hit Benefits**:
- 80%+ reduction in DataForSEO API calls
- Skip redundant research for same niche/cluster
- Faster analysis (hours vs days)

### Post-Research Storage (Step 4.5)
After each phase, new findings are stored:

- **Site profiles**: Domain metadata, technical health, industry
- **Content patterns**: Successful structures and performance metrics
- **Competitor intelligence**: Strategies, metrics, patterns
- **Keyword research**: Volume, difficulty, intent, clusters
- **SERP patterns**: Ranking features, semantic clusters

**Storage Benefits**:
- Cross-site learning and pattern reuse
- Continuous improvement via performance feedback
- Intelligence compounds over time

### Pattern Extraction (Step 12.5)
After successful completion, extract patterns:

- Site profile pattern (technical health + industry)
- Content strategy pattern (pillars + structure)
- Competitor positioning pattern
- Keyword cluster patterns

**Learning Benefits**:
- Enable pattern reuse for future similar sites
- Self-improving system via feedback loop
- 75%+ time savings for content clusters

---

## Usage Examples

### 1. Basic Onboarding (Auto-Discover Competitors)
```bash
/seo-onboard example.com --industry genealogy
```

**Behavior**:
- Phase 3 auto-discovers competitors from SERP
- Uses RuVector cache when available
- Completes in ~2-3 days

### 2. Full Onboarding with Known Competitors
```bash
/seo-onboard example.com \
  --competitors ancestry.com,familysearch.org,myheritage.com \
  --industry genealogy \
  --gsc-credentials /path/to/gsc-creds.json \
  --ga4-credentials /path/to/ga4-creds.json
```

**Behavior**:
- Uses provided competitor list (skips auto-discovery)
- Integrates real GSC/GA4 data for existing traffic analysis
- Completes in ~2-3 days

### 3. Quick Mode (Cache-Heavy Analysis)
```bash
/seo-onboard example.com --industry saas --mode quick
```

**Behavior**:
- Prioritizes RuVector cache hits
- Minimal new API calls
- Completes in ~1-2 days
- Best for repeat niche analysis

### 4. Deep Mode (Comprehensive Analysis)
```bash
/seo-onboard example.com \
  --competitors competitor1.com,competitor2.com \
  --industry ecommerce \
  --mode deep \
  --brand-guidelines /path/to/brand.md \
  --business-goals /path/to/goals.json
```

**Behavior**:
- Full API calls with minimal cache reliance
- Integrates brand guidelines for content recommendations
- Aligns strategy with business goals
- Completes in ~3-5 days

### 5. Fresh Analysis (Skip Cache)
```bash
/seo-onboard example.com --skip-cache --verbose
```

**Behavior**:
- Bypasses RuVector cache
- Fresh data from all API sources
- Verbose logging for debugging
- Use for validation or cache issues

---

## Expected Outputs

### Immediate (Command Execution)
- Task ID for tracking
- Estimated completion time
- Coordinator agent spawned confirmation

### Phase Progress Updates (Redis Pub/Sub)
- Phase 1 completion: Technical health score
- Phase 2 completion: Content inventory summary
- Phase 3 completion: Competitor count and metrics
- Phase 4 completion: Keyword universe size
- Phase 5 completion: Gap count and priority distribution
- Phase 6 completion: Strategy document ready
- Phase 7 completion: Roadmap generated

### Final Deliverables (Redis Storage)

**Redis Keys**:
```
seo:site:{domain}:technical_audit
seo:site:{domain}:content_inventory
seo:site:{domain}:competitors
seo:site:{domain}:keyword_universe
seo:site:{domain}:gaps
seo:site:{domain}:strategy
seo:site:{domain}:roadmap
```

**Files Generated**:
```
docs/seo/{domain}/SEO_STRATEGY_REPORT.md
docs/seo/{domain}/SEO_ROADMAP.md
docs/seo/{domain}/TECHNICAL_AUDIT.json
docs/seo/{domain}/KEYWORD_OPPORTUNITIES.json
docs/seo/{domain}/CONTENT_GAPS.json
```

### RuVector Intelligence Summary
```json
{
  "cache_performance": {
    "total_queries": 150,
    "cache_hits": 95,
    "cache_hit_rate": "63.3%",
    "api_calls_saved": 95,
    "estimated_cost_savings": "$47.50"
  },
  "patterns_applied": {
    "content_patterns": 8,
    "serp_patterns": 12,
    "competitor_patterns": 5
  },
  "patterns_extracted": {
    "site_profile": 1,
    "content_strategy": 1,
    "keyword_clusters": 5
  },
  "time_savings": "~18 hours (vs no cache)"
}
```

---

## Domain Validation

Before execution, the command validates the domain format:

**Valid Formats**:
- `example.com`
- `www.example.com`
- `subdomain.example.com`

**Invalid Formats**:
- `http://example.com` (no protocol)
- `example` (incomplete domain)
- `example.com/path` (no path)

**Validation Process**:
1. Strip protocol if present
2. Validate domain format (regex)
3. Check DNS resolution
4. Confirm site is accessible

**Failure Handling**:
- Invalid format: Error message with correct format
- DNS failure: Warning, proceed with caution
- Site inaccessible: Error, cannot proceed

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid domain format` | Domain doesn't match regex | Use format `example.com` |
| `Cannot resolve DNS` | Domain doesn't exist | Verify domain spelling |
| `Site not accessible` | HTTP error (4xx, 5xx) | Check site availability |
| `API quota exceeded` | DataForSEO rate limit | Wait or use `--skip-cache` |
| `RuVector connection failed` | Vector DB unavailable | Check RuVector service status |
| `Phase X failed` | Agent error during phase | Review phase logs, retry |
| `Technical health <0.50` | Critical site issues | Fix issues before strategy |

---

## Performance Metrics

### Expected Duration by Mode

| Mode | Duration | Cache Hit Rate | API Calls |
|------|----------|----------------|-----------|
| Quick | 1-2 days | 70-80% | ~50 |
| Standard | 2-3 days | 60-70% | ~150 |
| Deep | 3-5 days | 40-50% | ~400 |

### Cost Estimation

**Standard Mode** (cache hit rate 60%):
- DataForSEO API: ~$8-12
- Embeddings (Z.ai): ~$2-3
- Total: ~$10-15

**Deep Mode** (cache hit rate 40%):
- DataForSEO API: ~$25-35
- Embeddings (Z.ai): ~$5-7
- Total: ~$30-42

**Quick Mode** (cache hit rate 75%):
- DataForSEO API: ~$3-5
- Embeddings (Z.ai): ~$1-2
- Total: ~$4-7

---

## Coordinator Agent Responsibilities

The `seo-onboarding-coordinator` agent:

1. **Phase Orchestration**: Manages sequential execution of 7 phases
2. **Agent Spawning**: Spawns appropriate specialist agents per phase
3. **Output Aggregation**: Collects and synthesizes outputs from all phases
4. **RuVector Integration**: Triggers pre-research queries and post-storage
5. **Error Handling**: Handles phase failures with rollback capability
6. **Progress Tracking**: Publishes phase completion updates via Redis pub/sub
7. **Pattern Extraction**: Extracts patterns after successful completion
8. **Final Synthesis**: Generates comprehensive SEO strategy document

**Coordinator Spawning**:
```javascript
Task("seo-onboarding-coordinator", `
Execute 7-phase SEO site onboarding for domain: ${domain}

Competitors: ${competitors || 'auto-discover'}
Industry: ${industry || 'general'}
Mode: ${mode || 'standard'}

Parameters:
- GSC Credentials: ${gscCredentials || 'none'}
- GA4 Credentials: ${ga4Credentials || 'none'}
- Brand Guidelines: ${brandGuidelines || 'none'}
- Business Goals: ${businessGoals || 'none'}
- Skip Cache: ${skipCache ? 'true' : 'false'}

Expected Output:
- Complete SEO strategy document (Markdown + JSON)
- 6-month prioritized roadmap
- Redis artifacts for all 7 phases
- RuVector intelligence summary
- Confidence score ≥0.85
`)
```

---

## Success Criteria

- ✅ All 7 phases complete without critical failures
- ✅ Technical audit produces valid health score (0.0-1.0)
- ✅ Content inventory includes classification and clusters
- ✅ Competitor analysis covers ≥3 competitors
- ✅ Keyword universe contains ≥500 keywords
- ✅ Gap analysis identifies ≥50 opportunities
- ✅ Strategy document includes 3-5 content pillars
- ✅ Roadmap spans 6 months with clear milestones
- ✅ RuVector cache hit rate ≥60% (standard mode)
- ✅ API cost savings ≥50% (vs no cache baseline)
- ✅ Final confidence score ≥0.85
- ✅ Deliverables stored in Redis and filesystem

---

## Related Documentation

- Epic: `planning/epics/seo-onboarding-discovery/epic.json`
- Design Doc: `planning/seo/SEO_SITE_ONBOARDING_DESIGN.md`
- Coordinator Agent: `.claude/cfn-extras/agents/cfn-seo-team/seo-onboarding-coordinator.md`
- RuVector Collections: `.claude/skills/cfn-seo/ruvector/onboarding-schemas.ts`
- Storage Schema: `.claude/skills/cfn-seo/storage-schema.md`
- DataForSEO Integration: `.claude/skills/cfn-seo/apis/dataforseo-cached.ts`

---

## Future Enhancements

- [ ] Automated refresh workflow (monthly re-analysis)
- [ ] Email/Slack notifications for phase completion
- [ ] Dashboard visualization for strategy roadmap
- [ ] Multi-language site support
- [ ] Real-time competitor monitoring
- [ ] Automated A/B test suggestions

---

**Version**: 1.0.0
**Last Updated**: 2025-12-03
**Sprint**: 1.1 - Deliverable 1.1.1
**Confidence Score**: 0.92
