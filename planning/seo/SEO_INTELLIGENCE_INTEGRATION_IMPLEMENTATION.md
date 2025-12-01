# SEO Intelligence Integration: Implementation Plan

**Status:** Implementation Ready
**Target:** Integrate SEO Intelligence System into existing 11-step pipeline
**Estimated Effort:** 4-6 weeks
**Dependencies:** Existing SEO pipeline (v1.2.0), RuVector (optional for Phase 2+)

---

## Executive Summary

This document details how to integrate the SEO Intelligence System (SERP analysis, competitor deep-dive, cross-domain learning, algorithm prediction) into the existing 11-step SEO content pipeline.

**Key Changes:**
1. Add 3 new agents: `serp-pattern-analyst`, `competitor-deep-analyst`, `intelligence-curator`
2. Modify 4 existing agents to consume/contribute intelligence
3. Create global knowledge store (file-based initially, RuVector later)
4. Add pre-pipeline intelligence injection and post-pipeline learning capture

**Expected Outcomes:**
- 30% faster content creation (pattern reuse)
- 25% higher quality scores (proven patterns applied)
- Cross-domain learning across your projects
- Algorithm risk awareness in content strategy

---

## Part 1: Architecture Overview

### Current Pipeline (11 Steps)

```
PHASE A: DISCOVERY
  Step 1: Keyword Research        → seo-analytics-specialist
  Step 2: Competitor Analysis     → competitive-seo-analyst + Firecrawl
  Step 3: SERP Analysis           → serp-analyst + Firecrawl

PHASE B: INTELLIGENCE
  Step 4: Research                → research-specialist + Perplexity
  Step 5: Angle Development       → angle-developer

PHASE C: CREATION
  Step 6: Outline                 → content-seo-strategist
  Step 7: Content Writing         → seo-content-writer

PHASE D: QUALITY
  Step 8: Depth Injection         → depth-enhancer
  Step 9: Validation Loop         → 6 validators

PHASE E: OPTIMIZATION
  Step 10: Internal Linking       → link-building-specialist
  Step 11: Schema Markup          → schema-markup-engineer
```

### Enhanced Pipeline (14 Steps)

```
PHASE 0: INTELLIGENCE PRE-LOAD (NEW)
  Step 0: Intelligence Injection  → intelligence-curator (NEW)
         - Pull relevant patterns from global store
         - Check algorithm risk for planned tactics
         - Inject learnings into pipeline context

PHASE A: DISCOVERY (Enhanced)
  Step 1: Keyword Research        → seo-analytics-specialist (+ pattern hints)
  Step 2: Competitor Analysis     → competitive-seo-analyst + Firecrawl
  Step 2.5: Competitor Deep-Dive  → competitor-deep-analyst (NEW)
         - Site-wide pattern extraction
         - Architecture analysis
         - Content strategy mapping
  Step 3: SERP Analysis           → serp-analyst + Firecrawl
  Step 3.5: SERP Pattern Analysis → serp-pattern-analyst (NEW)
         - Extract ranking correlations
         - Identify winning patterns
         - Compare to global knowledge

PHASE B: INTELLIGENCE (Enhanced)
  Step 4: Research                → research-specialist (+ example patterns)
  Step 5: Angle Development       → angle-developer (+ proven angles)

PHASE C: CREATION (Enhanced)
  Step 6: Outline                 → content-seo-strategist (+ structure patterns)
  Step 7: Content Writing         → seo-content-writer (+ style patterns)

PHASE D: QUALITY (Unchanged)
  Step 8: Depth Injection         → depth-enhancer
  Step 9: Validation Loop         → 6 validators

PHASE E: OPTIMIZATION (Enhanced)
  Step 10: Internal Linking       → link-building-specialist (+ link patterns)
  Step 11: Schema Markup          → schema-markup-engineer

PHASE F: LEARNING CAPTURE (NEW)
  Step 12: Pattern Extraction     → intelligence-curator
         - Extract successful patterns from completed content
         - Calculate confidence scores
         - Promote to global store if criteria met
```

---

## Part 2: New Agents

### Agent 1: intelligence-curator

**Purpose:** Manage intelligence injection and learning capture

**File:** `.claude/agents/cfn-seo-team/intelligence-curator.md`

```yaml
---
name: intelligence-curator
description: Injects SEO intelligence before pipeline and captures learnings after
tools: [Read, Write, Bash]
model: haiku
type: coordinator
acl_level: 2
capabilities: [intelligence-injection, pattern-extraction, confidence-scoring, learning-promotion]
---
```

**Responsibilities:**

1. **Pre-Pipeline (Step 0):**
   - Query global knowledge for relevant patterns
   - Check algorithm risk scores for planned tactics
   - Assemble intelligence context for downstream agents

2. **Post-Pipeline (Step 12):**
   - Extract patterns from successful content
   - Calculate confidence scores based on validation results
   - Promote patterns to global store if eligible

**Input (Pre-Pipeline):**
```yaml
intelligence_request:
  keyword: "primary keyword"
  industry: "industry category"
  content_type: "blog|landing|product"
  brand: "brand name"
  domain: "your-domain.com"
```

**Output (Pre-Pipeline):**
```yaml
intelligence_context:
  global_patterns:
    title_tags:
      - pattern: "Question format with year"
        confidence: 0.87
        evidence: "Tested on 34 pages across 3 domains"
    content_structure:
      - pattern: "Table in first 500 words for comparison queries"
        confidence: 0.91
        evidence: "Featured snippet rate 3x higher"

  competitor_insights:
    top_performer: "competitor-domain.com"
    key_patterns:
      - "Integration page template with unique use cases"
      - "FAQ schema on every product page"

  algorithm_risks:
    - tactic: "Programmatic location pages"
      risk_level: "high"
      recommendation: "Add unique local content per page"
    - tactic: "AI-generated without human review"
      risk_level: "critical"
      recommendation: "Ensure human editing and expertise signals"

  cross_domain_learnings:
    from_projects:
      - project: "project-a"
        pattern: "Author bio with credentials increases E-E-A-T scores"
        confidence: 0.89
```

**Input (Post-Pipeline):**
```yaml
learning_capture_request:
  task_id: "seo-blog-xxxxx"
  final_content_path: "content/blog/article.md"
  validation_scores:
    humanizer: 0.88
    branding: 0.92
    audience: 0.89
    seo: 0.91
    voice_authenticity: 0.87
    depth_quality: 0.90
  consensus_score: 0.888
  quality_tier: "high"

  patterns_applied:
    - "Question format title"
    - "Table in first section"
    - "FAQ schema"
```

**Output (Post-Pipeline):**
```yaml
learning_capture_result:
  patterns_extracted:
    - pattern: "Hook with statistic opens engagement"
      confidence: 0.85
      eligible_for_promotion: true
    - pattern: "Three real examples per article"
      confidence: 0.78
      eligible_for_promotion: false  # Below 0.8 threshold

  promoted_to_global: 1
  stored_locally: 2
  recommendations:
    - "Run 2 more articles with statistic hooks to increase confidence"
```

---

### Agent 2: competitor-deep-analyst

**Purpose:** Deep site-wide competitor analysis (beyond individual page analysis)

**File:** `.claude/agents/cfn-seo-team/competitor-deep-analyst.md`

```yaml
---
name: competitor-deep-analyst
description: Conducts site-wide competitor analysis to extract systematic patterns
tools: [Read, Write, Bash, WebFetch]
model: sonnet
type: specialist
acl_level: 1
capabilities: [site-architecture-analysis, content-strategy-extraction, pattern-discovery]
---
```

**Responsibilities:**

1. **Architecture Analysis:**
   - URL structure mapping
   - Internal link pattern discovery
   - Site hierarchy assessment
   - Hub page identification

2. **Content Strategy Extraction:**
   - Content type inventory
   - Topic coverage mapping
   - Publishing cadence analysis
   - Content depth patterns

3. **Technical Pattern Discovery:**
   - Schema implementation audit
   - Page speed patterns
   - Mobile optimization approaches

**Input:**
```yaml
competitor_deep_request:
  competitor_url: "https://competitor.com"
  focus_areas:
    - "content_strategy"
    - "url_structure"
    - "internal_linking"
  sample_size: 50  # Pages to analyze
  industry: "automation tools"
```

**Output:**
```yaml
competitor_deep_analysis:
  competitor: "competitor.com"
  analysis_date: "2025-11-29"

  architecture:
    url_patterns:
      - pattern: "/integrations/[app-name]"
        page_count: 7000
        ranking_correlation: "high"
      - pattern: "/blog/[category]/[slug]"
        page_count: 2000
        ranking_correlation: "medium"

    hierarchy_depth:
      average_clicks_from_home: 2.3
      max_depth: 4
      orphan_pages: 150

    hub_pages:
      - url: "/integrations"
        internal_links_received: 12000
        purpose: "Integration directory"
      - url: "/blog"
        internal_links_received: 8500
        purpose: "Content hub"

  content_strategy:
    content_types:
      integration_pages:
        count: 7000
        avg_word_count: 450
        unique_elements: ["Use cases", "Triggers list", "Popular zaps"]
      blog_posts:
        count: 2000
        avg_word_count: 1800
        topics: ["Productivity", "Automation", "Tool comparisons"]
      template_pages:
        count: 10000
        avg_word_count: 200
        unique_elements: ["User reviews", "Usage stats"]

    publishing_cadence:
      blog_posts_per_week: 5
      new_integration_pages_per_month: 50

    topic_coverage:
      comprehensive: ["Automation basics", "Productivity tips"]
      thin: ["Enterprise use cases", "Industry-specific guides"]
      missing: ["Video tutorials", "Certification programs"]

  technical_patterns:
    schema_types:
      - "SoftwareApplication"
      - "HowTo"
      - "FAQPage"
      - "BreadcrumbList"
    schema_coverage: "87%"

    page_speed:
      average_lcp: "1.8s"
      average_cls: "0.05"

  replicable_patterns:
    - pattern: "Integration page template with unique use cases"
      effort: "high"
      impact: "high"
      recommendation: "Prioritize for long-term SEO strategy"

    - pattern: "Blog posts covering adjacent productivity topics"
      effort: "medium"
      impact: "high"
      recommendation: "Start content expansion immediately"

  gaps_to_exploit:
    - gap: "No video content"
      opportunity: "First-mover advantage in video tutorials"

    - gap: "Weak mobile experience on template pages"
      opportunity: "Mobile-first template design"
```

---

### Agent 3: serp-pattern-analyst

**Purpose:** Extract ranking patterns from SERP analysis

**File:** `.claude/agents/cfn-seo-team/serp-pattern-analyst.md`

```yaml
---
name: serp-pattern-analyst
description: Analyzes SERP results to extract ranking patterns and success factors
tools: [Read, Write, Bash]
model: haiku
type: analyst
acl_level: 1
capabilities: [serp-correlation-analysis, ranking-factor-extraction, pattern-comparison]
---
```

**Responsibilities:**

1. **Ranking Factor Correlation:**
   - Compare top 3 vs position 50+ page attributes
   - Identify statistically significant patterns
   - Calculate correlation strengths

2. **Winner Pattern Extraction:**
   - What do position 1-3 pages have in common?
   - What separates #1 from #10?
   - What SERP features do winners capture?

3. **Global Pattern Comparison:**
   - Compare SERP patterns to global knowledge
   - Identify novel patterns
   - Flag patterns that contradict global knowledge

**Input:**
```yaml
serp_pattern_request:
  keyword: "primary keyword"
  serp_data:
    # From Step 3 (serp-analyst)
    top_10_urls: [...]
    page_analysis: [...]  # Word count, headers, schema, etc.
    serp_features: [...]  # Featured snippets, PAA, etc.

  global_patterns:
    # From Step 0 (intelligence-curator)
    known_patterns: [...]
```

**Output:**
```yaml
serp_pattern_analysis:
  keyword: "primary keyword"

  ranking_correlations:
    strong_positive:
      - factor: "Word count > 1500"
        correlation: 0.78
        top_3_avg: 1850
        position_50_avg: 680

      - factor: "FAQ schema present"
        correlation: 0.72
        top_3_presence: "100%"
        position_50_presence: "23%"

    moderate_positive:
      - factor: "Video embed"
        correlation: 0.45
        note: "Present in #1 and #3, not #2"

    no_correlation:
      - factor: "Exact match domain"
        correlation: 0.02

    negative:
      - factor: "Interstitial ads before content"
        correlation: -0.65

  winner_patterns:
    position_1:
      unique_factors:
        - "Only page with original research data"
        - "Author has Google Knowledge Panel"

    common_to_top_3:
      - "Table comparing options in first section"
      - "Author bio with credentials"
      - "Updated within last 90 days"

  serp_feature_ownership:
    featured_snippet:
      owner: "position 1"
      format: "paragraph"
      trigger: "Definition-style opening"

    people_also_ask:
      positions_appearing: [1, 2, 4, 5]
      common_pattern: "FAQ section with exact PAA questions"

  novel_patterns:
    - pattern: "Comparison table in H2 section gets featured snippet"
      confidence: 0.75
      recommendation: "Add to outline, test across more keywords"

  contradictions_with_global:
    - global_pattern: "Longer content always ranks better"
      serp_observation: "#2 has 1200 words, #5 has 2500 words"
      interpretation: "Quality and relevance matter more than length for this query type"

  recommendations_for_pipeline:
    must_include:
      - "FAQ schema with PAA questions"
      - "Author bio with credentials"
      - "Comparison table in first section"

    should_include:
      - "Video embed (differentiator)"
      - "Original data point if possible"

    avoid:
      - "Interstitial elements"
      - "Thin sections without depth"
```

---

## Part 3: Agent Modifications

### Modify: seo-analytics-specialist (Step 1)

**Add Input:**
```yaml
intelligence_context:
  keyword_patterns:
    # From intelligence-curator
    - "Long-tail variations that converted well on other domains"
    - "Question-format keywords with high CTR history"
```

**Add Output:**
```yaml
keyword_research:
  # ... existing fields ...

  pattern_influenced_selections:
    - keyword: "how to [action]"
      reason: "Question format shows 23% higher CTR in global patterns"
```

---

### Modify: content-seo-strategist (Step 6)

**Add Input:**
```yaml
intelligence_context:
  structure_patterns:
    - pattern: "Hook with statistic"
      confidence: 0.87
      placement: "First 100 words"

    - pattern: "Table for comparisons"
      confidence: 0.91
      placement: "First H2 section"

  serp_patterns:
    # From serp-pattern-analyst
    must_include: [...]
    should_include: [...]
```

**Modify Outline Generation:**
```yaml
outline_document:
  # ... existing fields ...

  pattern_applications:
    - pattern: "Hook with statistic"
      applied_in: "Phase 1: Hook"
      source: "global_patterns (confidence: 0.87)"

    - pattern: "Table for comparisons"
      applied_in: "H2: Options Comparison"
      source: "serp_patterns (correlation: 0.72)"

  pattern_experiments:
    - pattern: "Video embed placeholder"
      applied_in: "H2: Tutorial Section"
      source: "serp_patterns (differentiator)"
      tracking: "Mark for learning capture"
```

---

### Modify: seo-content-writer (Step 7)

**Add Input:**
```yaml
intelligence_context:
  style_patterns:
    voice_characteristics:
      - "Conversational with rhetorical questions"
      - "Personal anecdotes in problem section"

    proven_hooks:
      - "Did you know that [statistic]?"
      - "Most people think [common belief], but [contrarian truth]..."

    engagement_patterns:
      - "Question before each major section"
      - "Bullet lists for actionable steps"
```

**Add to Instructions:**
```
When writing content:
1. Apply style patterns from intelligence context
2. Use proven hook templates where natural
3. Mark any NEW patterns you discover for learning capture
4. Note which intelligence patterns you applied in output
```

---

### Modify: link-building-specialist (Step 10)

**Add Input:**
```yaml
intelligence_context:
  link_patterns:
    internal_link_density:
      optimal_range: "5-8 per 1500 words"
      source: "Cross-domain learning (confidence: 0.83)"

    anchor_text_patterns:
      - "Descriptive, not exact-match keyword"
      - "Natural placement in sentence flow"

    hub_page_strategy:
      - "Link to category hubs from related content"
      - "Link to pillar content from supporting articles"
```

---

## Part 4: Knowledge Store Structure

### File-Based Store (Phase 1)

```
~/.cfn/seo/
├── global-knowledge/
│   ├── content-patterns/
│   │   ├── title-tags.yaml
│   │   ├── hooks.yaml
│   │   ├── structure.yaml
│   │   └── engagement.yaml
│   │
│   ├── technical-patterns/
│   │   ├── schema.yaml
│   │   ├── page-speed.yaml
│   │   └── mobile.yaml
│   │
│   ├── link-patterns/
│   │   ├── internal-linking.yaml
│   │   └── anchor-text.yaml
│   │
│   ├── competitor-profiles/
│   │   ├── zapier.yaml
│   │   ├── make.yaml
│   │   └── index.yaml
│   │
│   ├── algorithm-intelligence/
│   │   ├── risk-scores.yaml
│   │   ├── predictions.yaml
│   │   └── update-history.yaml
│   │
│   └── validated-experiments/
│       ├── successful.yaml
│       └── failed.yaml

project/.cfn/seo/
├── local-knowledge/
│   ├── patterns-applied.yaml      # Track what patterns used
│   ├── patterns-discovered.yaml   # New patterns found
│   ├── experiments.yaml           # A/B tests and results
│   └── sync-log.yaml             # What synced to/from global
│
├── keyword-tracking/
│   └── rankings.yaml
│
└── content-inventory/
    └── articles.yaml
```

### Pattern Schema

```yaml
# Example: global-knowledge/content-patterns/hooks.yaml

patterns:
  - id: "hook-statistic-001"
    pattern: "Open with surprising statistic"
    template: "Did you know that [X%] of [audience] [behavior]?"

    evidence:
      domains_tested: 4
      articles_tested: 47
      success_rate: 0.87

    metrics:
      avg_time_on_page_improvement: "+34%"
      avg_bounce_rate_change: "-12%"

    context:
      works_best_for:
        - "How-to content"
        - "Problem-aware audiences"
      less_effective_for:
        - "News content"
        - "Technical documentation"

    confidence: 0.87
    last_validated: "2025-11-29"
    first_seen: "2025-09-15"

    applications:
      - domain: "[anonymized]"
        date: "2025-11-01"
        result: "success"
        validation_score: 0.91
```

### RuVector Migration (Phase 2)

When RuVector is ready:

```typescript
// Convert file-based patterns to RuVector embeddings

interface PatternEntry {
  text: string;  // Pattern description + template + context
  metadata: {
    pattern_id: string;
    pattern_type: 'hook' | 'structure' | 'style' | 'technical';
    confidence: number;
    domains_tested: number;
    success_rate: number;
    works_best_for: string[];
    less_effective_for: string[];
    last_validated: number;
  }
}

// Query similar patterns
const relevantPatterns = await ruvector.query({
  collection: 'seo_patterns',
  text: `${keyword} ${industry} ${content_type}`,
  topK: 10,
  filter: { confidence: { $gt: 0.75 } }
});
```

---

## Part 5: Pipeline Integration

### Updated Orchestrator Flow

```bash
#!/bin/bash
# orchestrate-seo-v2.sh

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 0: INTELLIGENCE PRE-LOAD (NEW)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "[Step 0] Intelligence Pre-Load..."

# Query global knowledge
INTELLIGENCE_CONTEXT=$(npx cfn-spawn intelligence-curator \
  --task-id "$TASK_ID" \
  --mode "pre-pipeline" \
  --keyword "$KEYWORD" \
  --industry "$INDUSTRY" \
  --content-type "$CONTENT_TYPE" \
  --domain "$DOMAIN")

# Store for downstream agents
redis-cli SET "seo:task:${TASK_ID}:intelligence" "$INTELLIGENCE_CONTEXT"

# Check algorithm risks
RISK_ALERTS=$(echo "$INTELLIGENCE_CONTEXT" | jq '.algorithm_risks[] | select(.risk_level == "critical")')
if [ -n "$RISK_ALERTS" ]; then
  echo "⚠️  Critical algorithm risks detected:"
  echo "$RISK_ALERTS"
  # Log but continue (human can review)
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE A: DISCOVERY (Enhanced)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "[Step 1] Keyword Research (with pattern hints)..."
npx cfn-spawn seo-analytics-specialist \
  --task-id "$TASK_ID" \
  --keyword "$KEYWORD" \
  --intelligence-context "$(redis-cli GET seo:task:${TASK_ID}:intelligence)"

echo "[Step 2] Competitor Analysis..."
npx cfn-spawn competitive-seo-analyst \
  --task-id "$TASK_ID"

echo "[Step 2.5] Competitor Deep-Dive (NEW)..."
TOP_COMPETITOR=$(redis-cli HGET "seo:task:${TASK_ID}:competitors" "top_performer")
npx cfn-spawn competitor-deep-analyst \
  --task-id "$TASK_ID" \
  --competitor-url "$TOP_COMPETITOR" \
  --sample-size 50

echo "[Step 3] SERP Analysis..."
npx cfn-spawn serp-analyst \
  --task-id "$TASK_ID"

echo "[Step 3.5] SERP Pattern Analysis (NEW)..."
npx cfn-spawn serp-pattern-analyst \
  --task-id "$TASK_ID" \
  --global-patterns "$(redis-cli GET seo:task:${TASK_ID}:intelligence)"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASES B-E: (Same as before, but agents receive intelligence context)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ... Steps 4-11 ...

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE F: LEARNING CAPTURE (NEW)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "[Step 12] Learning Capture..."

# Only capture if validation passed
CONSENSUS=$(redis-cli HGET "seo:task:${TASK_ID}:validation" "consensus_score")
if (( $(echo "$CONSENSUS >= 0.85" | bc -l) )); then

  npx cfn-spawn intelligence-curator \
    --task-id "$TASK_ID" \
    --mode "post-pipeline" \
    --final-content-path "$FINAL_CONTENT_PATH" \
    --validation-scores "$(redis-cli HGETALL seo:task:${TASK_ID}:validation:scores)" \
    --patterns-applied "$(redis-cli GET seo:task:${TASK_ID}:patterns_applied)"

  echo "✅ Learning captured and patterns updated"
else
  echo "⚠️  Validation below threshold, skipping learning capture"
fi
```

### Slash Command Update

Update `/seo-blog` to include intelligence integration:

```yaml
# Add to seo-blog.md

# New parameters
--enable-intelligence true          # Enable intelligence system (default: true)
--skip-deep-competitor false        # Skip competitor deep-dive (faster)
--learning-capture true             # Capture learnings after completion

# Intelligence context injection
The coordinator now:
1. Queries global patterns before starting (Step 0)
2. Injects patterns into agent contexts
3. Captures learnings after successful completion (Step 12)

# New output fields
intelligence:
  patterns_applied: 5
  patterns_discovered: 1
  competitor_insights_used: 3
  algorithm_risks_flagged: 1
  learning_captured: true
  promoted_to_global: 1
```

---

## Part 6: Cross-Domain Learning Flow

### Pattern Lifecycle

```
1. DISCOVERY
   ↓
   Pattern observed during content creation
   Marked as "local hypothesis"

2. LOCAL VALIDATION
   ↓
   Applied to 3+ articles on same domain
   Tracked via patterns-applied.yaml
   Confidence calculated from validation scores

3. ELIGIBILITY CHECK
   ↓
   If confidence >= 0.8 AND articles >= 5:
     Eligible for global promotion

4. ANONYMIZATION
   ↓
   Remove: domain names, specific URLs, keyword data
   Keep: pattern description, evidence structure, confidence

5. GLOBAL PROMOTION
   ↓
   Check for similar existing pattern (similarity > 0.9)
   If exists: Merge (increment counts, update confidence)
   If new: Insert into global store

6. CROSS-DOMAIN APPLICATION
   ↓
   Other projects query global patterns
   Apply with tracking
   Report results back

7. CONFIDENCE UPDATE
   ↓
   Success: Increase confidence
   Failure: Decrease confidence
   Below 0.4: Archive pattern
```

### Sync Protocol

```bash
# Manual sync (run periodically or after successful articles)
cfn seo sync --direction both

# Auto-sync after successful validation
# (Built into Step 12)

# Sync specific pattern to global
cfn seo promote-pattern --pattern-id "hook-001" --force
```

---

## Part 7: Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Tasks:**
1. Create file-based knowledge store structure
2. Build intelligence-curator agent
3. Add Step 0 (pre-load) to orchestrator
4. Add Step 12 (learning capture) to orchestrator
5. Create pattern schema and initial patterns from experience

**Deliverables:**
- Knowledge store directories created
- intelligence-curator agent functional
- Basic pattern injection working
- Manual learning capture working

**Success Criteria:**
- Pipeline runs with Step 0 and Step 12
- Patterns loaded from files
- Learnings written to local store

### Phase 2: Deep Analysis Agents (Week 3-4)

**Tasks:**
1. Build competitor-deep-analyst agent
2. Build serp-pattern-analyst agent
3. Integrate Firecrawl for site-wide crawling
4. Add Steps 2.5 and 3.5 to orchestrator

**Deliverables:**
- Competitor deep-dive functional
- SERP pattern analysis functional
- Integration with existing pipeline

**Success Criteria:**
- Competitor analysis extracts site-wide patterns
- SERP analysis identifies ranking correlations
- Patterns flow into content creation steps

### Phase 3: Agent Enhancement (Week 4-5)

**Tasks:**
1. Modify seo-analytics-specialist for pattern hints
2. Modify content-seo-strategist for structure patterns
3. Modify seo-content-writer for style patterns
4. Modify link-building-specialist for link patterns

**Deliverables:**
- All 4 agents consuming intelligence context
- Pattern application tracking in outputs

**Success Criteria:**
- Agents use patterns in their outputs
- Pattern applications tracked in Redis
- Validation scores improve with patterns

### Phase 4: Cross-Domain Learning (Week 5-6)

**Tasks:**
1. Implement pattern promotion protocol
2. Build sync mechanism
3. Create confidence decay system
4. Add multi-project support

**Deliverables:**
- Global ↔ Local sync working
- Cross-domain pattern sharing
- Confidence scoring and decay

**Success Criteria:**
- Patterns promote from local to global
- Other projects receive global patterns
- Confidence updates based on outcomes

### Phase 5: Algorithm Intelligence (Week 6+)

**Tasks:**
1. Build algorithm risk scoring
2. Create prediction model
3. Integrate with Step 0 warnings
4. Add risk alerts to pipeline

**Deliverables:**
- Risk scoring for tactics
- Prediction model with updates
- Pipeline warnings for high-risk tactics

**Success Criteria:**
- High-risk tactics flagged
- Predictions documented and tracked
- Pipeline adapts to algorithm changes

---

## Part 8: Metrics and Success Criteria

### Pipeline Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Validation pass rate (first try) | 40% | 60% | Patterns improve first-pass quality |
| Average iterations to pass | 2.1 | 1.5 | Better patterns = fewer rewrites |
| Time to completion | 8 min | 6 min | Pattern reuse speeds creation |
| Consensus score average | 0.87 | 0.91 | Proven patterns boost scores |

### Intelligence Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Patterns in global store | 50+ | After 3 months |
| Pattern confidence > 0.8 | 70% | Validated patterns |
| Cross-domain success rate | 60% | Patterns work on new domains |
| Algorithm prediction accuracy | 70% | Predictions validated |

### Quality Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Organic traffic (90 days) | Baseline | +30% |
| Average ranking position | Baseline | +5 positions |
| Featured snippet capture | Baseline | +50% |
| Time on page | Baseline | +20% |

---

## Part 9: Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Pattern overfitting | Medium | Medium | Confidence decay, cross-domain validation |
| Performance overhead | Low | Medium | Async intelligence loading, caching |
| Pattern staleness | Medium | Low | Forced revalidation after algorithm updates |
| Cross-domain leakage | Low | High | Strict anonymization before promotion |
| Complexity creep | Medium | Medium | Phase rollout, feature flags |

---

## Appendix A: Agent File Templates

### intelligence-curator.md (Full)

```markdown
---
name: intelligence-curator
description: Manages SEO intelligence injection and learning capture
tools: [Read, Write, Bash]
model: haiku
type: coordinator
acl_level: 2
capabilities: [intelligence-injection, pattern-extraction, confidence-scoring]
---

# Intelligence Curator

You manage the flow of SEO intelligence into and out of the content pipeline.

## Mode: pre-pipeline

Query and assemble intelligence context for downstream agents.

### Steps:
1. Read global patterns from ~/.cfn/seo/global-knowledge/
2. Filter by relevance (industry, content type)
3. Check algorithm risks
4. Read cross-domain learnings
5. Assemble intelligence context
6. Store in Redis for pipeline access

### Output:
```yaml
intelligence_context:
  global_patterns: [...]
  competitor_insights: [...]
  algorithm_risks: [...]
  cross_domain_learnings: [...]
```

## Mode: post-pipeline

Capture learnings from successful content creation.

### Steps:
1. Read final content and validation scores
2. Extract applied patterns
3. Identify new patterns discovered
4. Calculate confidence scores
5. Check promotion eligibility
6. Write to local store
7. Promote eligible patterns to global

### Promotion Criteria:
- Confidence >= 0.8
- Articles tested >= 5
- Anonymization complete

### Output:
```yaml
learning_capture_result:
  patterns_extracted: [...]
  promoted_to_global: N
  stored_locally: N
```
```

---

## Appendix B: Redis Keys

```
# Intelligence context
seo:task:{task_id}:intelligence           # Full context JSON
seo:task:{task_id}:patterns_applied       # List of pattern IDs applied
seo:task:{task_id}:patterns_discovered    # New patterns found

# Competitor deep analysis
seo:task:{task_id}:competitor_deep        # Deep analysis result

# SERP pattern analysis
seo:task:{task_id}:serp_patterns          # Pattern correlations

# Learning capture
seo:task:{task_id}:learning_captured      # Boolean
seo:task:{task_id}:patterns_promoted      # List of pattern IDs promoted
```

---

## Appendix C: CLI Commands

```bash
# Intelligence commands
cfn seo intelligence status           # Show global store stats
cfn seo intelligence query "keyword"  # Query relevant patterns
cfn seo intelligence sync             # Sync local ↔ global

# Pattern commands
cfn seo patterns list                 # List all patterns
cfn seo patterns show "pattern-id"    # Show pattern details
cfn seo patterns promote "pattern-id" # Manually promote to global
cfn seo patterns archive "pattern-id" # Archive low-confidence pattern

# Competitor commands
cfn seo competitor analyze "url"      # Run deep analysis
cfn seo competitor compare "url1" "url2"  # Compare two competitors

# Algorithm commands
cfn seo algorithm risks               # Show current risk scores
cfn seo algorithm predictions         # Show predictions
cfn seo algorithm update-history      # Record new update
```

---

*This implementation integrates the SEO Intelligence System into the existing 11-step pipeline, creating a learning system that improves with each article across all your domains.*
