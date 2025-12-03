---
name: SEO_TASK_MODE
description: Execute SEO content pipeline using Task() spawning from Main Chat (15-step intelligence-enhanced)
version: 3.0.0
tags: [seo, pipeline, task-mode, intelligence, optimization]
status: production
---

# SEO Task Mode Guide (15-Step Intelligence-Enhanced Pipeline)

**Purpose:** Execute SEO content pipeline using Task() spawning from Main Chat (no coordinator agent)

**When to Use:**
- Debugging SEO pipeline issues
- Learning the 15-step intelligence-enhanced process
- Single-step testing (keyword research only)
- Development of new SEO agents
- Premium content requiring unique angles and depth

**Cost:** $10-25 per full pipeline (Anthropic pricing for all agents)

**Alternative:** CLI Mode via `cfn-seo-coordinator` ($1-3/pipeline with Z.ai routing)

**Pipeline Version:** 15-Step Intelligence-Enhanced (6 validators + 5 optimization components)

**Skill Location:** `.claude/skills/cfn-seo-pipeline/lib/seo/`

---

## Table of Contents

1. [Quick Start - Full Pipeline](#quick-start-full-pipeline)
2. [Pipeline Overview (15 Steps)](#pipeline-overview-15-steps)
3. [Intelligence Layer (Steps 0, 12, 13)](#intelligence-layer)
4. [Analysis Layer (Steps 2.5, 3.5)](#analysis-layer)
5. [Optimization Layer (5 Components)](#optimization-layer)
6. [Pre-Publication Quality Gate (Step 11.5)](#pre-publication-quality-gate)
7. [Agent Selection by Step](#agent-selection-by-step)
8. [Validation Loop (6 Validators)](#validation-loop)
9. [Quality Tier Reporting](#quality-tier-reporting)
10. [Single-Step Execution](#single-step-execution)
11. [Troubleshooting](#troubleshooting)

---

## Pipeline Overview (15 Steps)

The current pipeline has evolved from 11-step to **15-step** with intelligence integration:

| Step | Name | Agent/Component | Focus | Phase |
|------|------|-----------------|-------|-------|
| **0** | Intelligence Pre-load | `executeStep0()` | Load patterns, assess risk | Pre-pipeline |
| 1 | Keyword Research | `seo-analytics-specialist` | Keyword metrics, intent | Research |
| 2 | Competitor Analysis (Basic) | `competitive-seo-analyst` | Top 3 competitors | Research |
| **2.5** | Competitor Deep Analysis | `CompetitorDeepAnalystAgent` | Site architecture, content strategy | Research |
| 3 | SERP Analysis (Basic) | `serp-analyst` | SERP features, PAA | Research |
| **3.5** | SERP Pattern Analysis | `SERPPatternAnalyst` | Ranking patterns, semantic clusters | Research |
| 4 | Deep Research | `research-specialist` | Examples, expert sources | Research |
| 5 | Angle Development | `angle-developer` | Thesis, voice, differentiation | Strategy |
| 6 | Narrative Outline | `content-seo-strategist` | Story structure, depth planning | Strategy |
| 7 | Content Writing | `seo-content-writer` | Voice-driven writing | Creation |
| 8 | Depth Injection | `depth-enhancer` | Expand examples, add nuance | Enhancement |
| 9 | SEO Optimization | `technical-seo-specialist` | Meta, headers, links | Optimization |
| 10 | Validation Loop | 6 validators (parallel) | Quality validation | Validation |
| 11 | Schema Markup | `schema-markup-engineer` | JSON-LD, publishing prep | Publishing |
| **11.5** | Pre-Publication Audit | `executeStep115()` | 7-category weighted audit | Quality Gate |
| **12** | Learning Capture | `executeStep12()` | Pattern confidence updates | Post-pipeline |
| **13** | Performance Tracking | `executeStep13()` | GSC/GA4 feedback, algorithm correlation | Feedback Loop |

---

## Intelligence Layer

### Step 0: Intelligence Pre-load

**Purpose:** Load historical patterns and assess algorithm risk BEFORE content creation starts.

**What It Does:**
- Loads high-confidence patterns from Redis (confidence ≥0.60)
- Evaluates algorithm risk for planned tactics
- Returns risk warnings (critical/high/medium/low)
- Pre-populates pipeline context with intelligence

**Main Chat Execution:**
```javascript
// Step 0 is typically called automatically by pipeline orchestrator
// But can be invoked manually for debugging:

Task("backend-developer", `
  Execute Step 0: Intelligence Pre-load

  Use: executeStep0() from .claude/skills/cfn-seo-pipeline/lib/seo/lib/steps/step-0-intelligence-preload.ts

  Configuration:
  - minPatternConfidence: 0.60
  - maxPatterns: 50
  - verbose: true

  Deliverables:
  - Intelligence items loaded count
  - Patterns loaded count
  - Risk warnings (if any)
  - Context pre-populated

  Success Criteria:
  - No critical risk warnings
  - At least 5 patterns loaded (if available)
  - Context intelligence object populated
`)
```

**Risk Warning Levels:**
| Level | Action | Example |
|-------|--------|---------|
| Critical | Stop pipeline, require approval | Algorithm update detected, high volatility |
| High | Proceed with caution, document | Pattern confidence dropping rapidly |
| Medium | Log and continue | Minor ranking fluctuations |
| Low | Continue normally | Standard variation |

---

### Step 12: Learning Capture

**Purpose:** Capture learnings AFTER content generation and update pattern confidence.

**What It Does:**
- Extracts pattern applications from pipeline context
- Updates pattern confidence (success: +0.05, failure: -0.10)
- Promotes patterns above threshold (≥0.80) to global store
- Archives patterns below threshold (≤0.40)

**Main Chat Execution:**
```javascript
Task("backend-developer", `
  Execute Step 12: Learning Capture

  Use: executeStep12() from .claude/skills/cfn-seo-pipeline/lib/seo/lib/steps/step-12-learning-capture.ts

  Context:
  - Pipeline context from completed steps
  - Pattern applications (which patterns were used)
  - Outcome: success/failure

  Configuration:
  - successConfidenceDelta: 0.05
  - failureConfidenceDelta: -0.10
  - archiveThreshold: 0.40
  - promotionThreshold: 0.80

  Deliverables:
  - Learnings captured count
  - Patterns updated count
  - Patterns promoted count
  - Patterns archived count

  Success Criteria:
  - All pattern applications tracked
  - Confidence scores updated
  - High-performing patterns promoted
`)
```

---

### Step 13: Performance Tracking & Feedback Loop

**Purpose:** Track published content performance and correlate with algorithm updates.

**What It Does:**
- Fetches GSC data (impressions, clicks, position)
- Fetches GA4 data (engagement, conversions)
- Processes performance feedback to adjust pattern confidence
- Detects algorithm update correlations
- Identifies content decay patterns

**Main Chat Execution:**
```javascript
Task("backend-developer", `
  Execute Step 13: Performance Tracking

  Use: executeStep13() from .claude/skills/cfn-seo-pipeline/lib/seo/lib/steps/step-13-performance-tracking.ts

  Configuration:
  - useMockData: true (or false with real API credentials)
  - detectAlgorithmCorrelation: true
  - correlationLookbackDays: 30
  - verbose: true

  Content to Track:
  - URL: /blog/preserve-family-stories
  - Published: 2025-11-01
  - Applied patterns: [pattern IDs from context]

  Deliverables:
  - Content performance metrics
  - Pattern confidence adjustments
  - Algorithm correlation report (if detected)
  - Refresh recommendations (if content decaying)

  Success Criteria:
  - Performance data fetched/mocked
  - Patterns updated based on performance
  - Algorithm correlations documented
`)
```

---

## Analysis Layer

### Step 2.5: Competitor Deep Analysis

**Purpose:** Deep crawl competitor sites to extract architecture and content strategy patterns.

**What It Does:**
- Crawls competitor sites using Firecrawl
- Extracts site architecture patterns (URL structure, hub pages)
- Identifies content strategy patterns (topics, formats, lengths)
- Maps internal linking patterns
- Identifies content gaps and opportunities

**Main Chat Execution:**
```javascript
Task("competitive-seo-analyst", `
  Execute Step 2.5: Competitor Deep Analysis

  Use: CompetitorDeepAnalystAgent from .claude/skills/cfn-seo-pipeline/lib/seo/lib/competitor-deep-analyst.ts

  Configuration:
  - competitorDomains: ["competitor1.com", "competitor2.com", "competitor3.com"]
  - maxPages: 50 per domain
  - maxDepth: 3
  - rateLimitMs: 1000
  - firecrawlApiKey: [from env]

  Deliverables:
  - Site architecture patterns (URL structure, hierarchy)
  - Content strategy patterns (topics, formats)
  - Hub page identification
  - Internal linking patterns
  - Content gaps with priority scores

  Output: content/seo-data/competitor-deep-analysis.json

  Success Criteria:
  - All 3 competitors crawled
  - Architecture patterns extracted
  - Content gaps identified with priority
  - Hub pages mapped
`)
```

---

### Step 3.5: SERP Pattern Analysis

**Purpose:** Analyze SERP patterns to extract ranking signals and feature opportunities.

**What It Does:**
- Fetches SERP data via Google API or scraping
- Detects all 16 SERP feature types
- Extracts ranking patterns (domain authority, content length, freshness)
- Identifies semantic clusters
- Generates actionable recommendations

**SERP Features Detected:**
1. Featured Snippet
2. People Also Ask
3. Knowledge Panel
4. Image Pack
5. Video Carousel
6. Local Pack
7. News Box
8. Shopping Results
9. Top Stories
10. Twitter/X Cards
11. Related Searches
12. Site Links
13. FAQ Rich Result
14. How-To Rich Result
15. Recipe Rich Result
16. Review Rich Result

**Main Chat Execution:**
```javascript
Task("serp-analyst", `
  Execute Step 3.5: SERP Pattern Analysis

  Use: SERPPatternAnalyst from packages/seo-analysis/src/lib/serp-pattern-analyst.ts

  Configuration:
  - keyword: "preserve family stories"
  - maxResults: 10
  - enableContentScraping: true
  - rateLimitMs: 1000

  Deliverables:
  - SERP features detected (16 types)
  - Ranking patterns:
    - Domain authority distribution
    - Content length patterns
    - Title/meta patterns
    - URL structure patterns
  - Semantic clusters
  - Content gaps
  - Actionable recommendations

  Output: content/seo-data/serp-pattern-analysis.json

  Success Criteria:
  - All SERP features mapped
  - Ranking patterns extracted
  - Featured snippet opportunity identified
  - Recommendations generated
`)
```

---

## Optimization Layer (5 Components)

### 1. SERP Feature Optimizer

**Purpose:** Optimize content for specific SERP features (featured snippets, PAA, etc.)

**Location:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/serp-feature-optimizer.ts`

**Capabilities:**
- `detectSERPOpportunities()` - Identify targetable features
- `formatForFeaturedSnippet()` - Create 40-60 word answer paragraphs
- `formatForPAA()` - Structure FAQ content
- `formatForVideoCarousel()` - Video optimization
- `formatForImagePack()` - Image optimization
- `formatForHowTo()` - Step-by-step formatting
- `generateFAQSchema()` - FAQPage JSON-LD
- `generateHowToSchema()` - HowTo JSON-LD
- `generateVideoObjectSchema()` - VideoObject JSON-LD
- `generateArticleSchema()` - Article JSON-LD
- `validateSchema()` - Schema validation

**Usage:**
```javascript
Task("serp-feature-optimizer", `
  Optimize content for SERP features

  Input: content/enhanced/preserve-family-stories.md
  SERP Analysis: content/seo-data/serp-pattern-analysis.json

  Tasks:
  1. Detect SERP feature opportunities
  2. Format content for featured snippet (40-60 word answer)
  3. Add FAQ section for People Also Ask
  4. Generate appropriate schemas (FAQ, HowTo, Article)
  5. Validate all schemas

  Output: content/optimized/preserve-family-stories-serp.md

  Success Criteria:
  - Featured snippet paragraph added
  - FAQ schema generated and valid
  - All schemas pass validation
`)
```

---

### 2. CTR Optimization Engine

**Purpose:** Optimize titles and meta descriptions for click-through rate.

**Location:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ctr-optimization-engine.ts`

**Capabilities:**
- `optimizeTitle()` - 9-factor title optimization
- `optimizeMeta()` - Meta description optimization
- `scoreCTRPotential()` - 0-100 CTR score
- `generateVariations()` - A/B test variations
- `analyzePsychologicalTriggers()` - Emotional analysis

**9 CTR Scoring Factors:**
1. Power words presence
2. Emotional triggers
3. Number inclusion
4. Question format
5. Keyword prominence
6. Length optimization
7. Uniqueness vs competitors
8. Call-to-action strength
9. Urgency/curiosity elements

**Usage:**
```javascript
Task("backend-developer", `
  Optimize CTR for content

  Use: CTROptimizationEngine from .claude/skills/cfn-seo-pipeline/lib/seo/lib/ctr-optimization-engine.ts

  Input:
  - Title: "How to Preserve Family Stories"
  - Meta: "Learn methods to preserve your family stories for future generations."
  - Keyword: "preserve family stories"

  Tasks:
  1. Score current CTR potential
  2. Generate 5 optimized title variations
  3. Optimize meta description
  4. Analyze psychological triggers
  5. Select highest-scoring combination

  Output:
  - Optimized title (CTR score ≥80)
  - Optimized meta (CTR score ≥75)
  - 3 A/B test variations

  Success Criteria:
  - CTR improvement ≥20%
  - Power words included
  - Emotional triggers present
`)
```

---

### 3. Semantic Completeness Analyzer

**Purpose:** Ensure content covers all relevant topics compared to competitors.

**Location:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/semantic-completeness-analyzer.ts`

**Capabilities:**
- `analyzeCompleteness()` - Full topic coverage analysis
- `extractTopics()` - TF-IDF topic extraction with n-grams
- `identifyGaps()` - Missing topic detection
- `calculateCoverageScore()` - 0-100 coverage score

**Usage:**
```javascript
Task("backend-developer", `
  Analyze semantic completeness

  Use: SemanticCompletenessAnalyzer from .claude/skills/cfn-seo-pipeline/lib/seo/lib/semantic-completeness-analyzer.ts

  Input:
  - Our content: content/enhanced/preserve-family-stories.md
  - Competitor content: [scraped from Step 2.5]

  Tasks:
  1. Extract topics from our content (TF-IDF)
  2. Extract topics from competitors
  3. Identify topic gaps
  4. Calculate coverage score
  5. Generate gap recommendations

  Output:
  - Coverage score (target: ≥85%)
  - Topic gaps list with priority
  - Recommendations for each gap

  Success Criteria:
  - Coverage score ≥85%
  - All high-priority gaps identified
  - Actionable recommendations
`)
```

---

### 4. Content Refresh Trigger

**Purpose:** Detect content decay and trigger refresh workflows.

**Location:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/content-refresh-trigger.ts`

**Decay Patterns Detected:**
- Gradual decline (slow ranking drop)
- Sudden drop (algorithm update or competitor)
- Seasonal decay (cyclical traffic patterns)
- Competitor displacement (new competitor ranking)

**Priority Levels:**
- URGENT: >50% traffic drop, immediate action
- HIGH: 30-50% drop, action within 1 week
- MEDIUM: 15-30% drop, action within 2 weeks
- LOW: <15% drop, monitor and schedule

**Usage:**
```javascript
Task("backend-developer", `
  Check content refresh needs

  Use: ContentRefreshTrigger from .claude/skills/cfn-seo-pipeline/lib/seo/lib/content-refresh-trigger.ts

  Input:
  - Content ID: preserve-family-stories
  - Performance history: [from Step 13]

  Tasks:
  1. Analyze performance trajectory
  2. Detect decay pattern (if any)
  3. Calculate refresh priority
  4. Generate refresh recommendations

  Output:
  - Decay pattern detected (or "stable")
  - Refresh priority (URGENT/HIGH/MEDIUM/LOW/NONE)
  - Specific refresh recommendations

  Success Criteria:
  - Decay patterns accurately detected
  - Priority correctly assigned
  - Actionable refresh plan
`)
```

---

### 5. Algorithm Risk Scoring

**Purpose:** Assess risk of SEO tactics based on algorithm update history.

**Location:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/algorithm-risk-scoring.ts`

**Capabilities:**
- `calculateAggregateRisk()` - Overall risk assessment
- `evaluateTactic()` - Per-tactic risk evaluation
- `loadRiskDatabase()` - Historical algorithm update data

**Risk Levels:**
- CRITICAL: Immediate risk of penalty
- HIGH: Significant risk, requires mitigation
- MEDIUM: Moderate risk, monitor closely
- LOW: Acceptable risk

**Usage:**
```javascript
Task("backend-developer", `
  Assess algorithm risk for planned tactics

  Use: algorithm-risk-scoring from .claude/skills/cfn-seo-pipeline/lib/seo/lib/algorithm-risk-scoring.ts

  Tactics to Evaluate:
  - Keyword density: 2.5%
  - Internal links: 15 per 1000 words
  - External links: 5 per 1000 words
  - Schema types: FAQ, HowTo, Article

  Tasks:
  1. Load algorithm update history
  2. Evaluate each tactic against history
  3. Calculate aggregate risk
  4. Generate mitigation recommendations

  Output:
  - Aggregate risk level
  - Per-tactic risk scores
  - Mitigation strategies (if HIGH/CRITICAL)

  Success Criteria:
  - No CRITICAL risks
  - Mitigation plans for HIGH risks
  - Document all risk assessments
`)
```

---

## Pre-Publication Quality Gate

### Step 11.5: Pre-Publication SEO Audit

**Purpose:** Comprehensive audit before publishing with weighted scoring.

**7 Audit Categories with Weights:**

| Category | Weight | What It Checks |
|----------|--------|----------------|
| Title Tag | 25% | Keyword presence, length, power words, CTR elements |
| Schema Markup | 20% | Required schemas, validation, completeness |
| Internal Linking | 15% | Link count, anchor text, relevance |
| Meta Description | 15% | Length, keyword, CTA, emotional triggers |
| Readability | 15% | Flesch score, sentence length, paragraph breaks |
| Freshness | 5% | Date signals, update indicators |
| Images | 5% | Alt text, keyword relevance, optimization |

**Main Chat Execution:**
```javascript
Task("backend-developer", `
  Execute Step 11.5: Pre-Publication SEO Audit

  Use: executeStep115() from .claude/skills/cfn-seo-pipeline/lib/seo/lib/steps/step-11.5-pre-publication-audit.ts

  Configuration:
  - targetKeyword: "preserve family stories"
  - contentHtml: [from content/optimized/*.md]
  - titleTag: "How to Preserve Family Stories: Complete Guide 2025"
  - metaDescription: "Learn proven methods to preserve family stories..."
  - contentType: "article"
  - minAcceptableScore: 75
  - verbose: true

  Deliverables:
  - Overall score (0-100)
  - Pass/fail status
  - Category scores breakdown
  - Critical findings (if any)
  - Recommendations for improvement

  Output: content/audit/preserve-family-stories-audit.json

  Success Criteria:
  - Overall score ≥75 (PASS)
  - No critical findings
  - All category scores ≥60
`)
```

**Audit Result Example:**
```json
{
  "success": true,
  "overallScore": 82,
  "passed": true,
  "categoryScores": [
    { "category": "title", "score": 88, "weight": 0.25 },
    { "category": "schema", "score": 75, "weight": 0.20 },
    { "category": "links", "score": 80, "weight": 0.15 },
    { "category": "meta", "score": 85, "weight": 0.15 },
    { "category": "readability", "score": 78, "weight": 0.15 },
    { "category": "freshness", "score": 90, "weight": 0.05 },
    { "category": "images", "score": 70, "weight": 0.05 }
  ],
  "criticalFindings": [],
  "allFindings": [
    { "severity": "warning", "category": "schema", "message": "Missing HowTo schema" },
    { "severity": "info", "category": "images", "message": "2 images missing keyword in alt text" }
  ]
}
```

---

## Quick Start - Full Pipeline

**Example Task:** "Write a blog post about preserving family stories for OurStories"

**Full 15-Step Execution:**

```javascript
// ============================================
// PRE-PIPELINE: Intelligence Load
// ============================================

// Step 0: Intelligence Pre-load (automatic or manual)
Task("backend-developer", `
  Execute Step 0: Load intelligence and assess risk
  - Load patterns with confidence ≥0.60
  - Assess algorithm risk
  - Pre-populate context
  Output: Pipeline context with intelligence loaded
`)

// ============================================
// RESEARCH PHASE (Steps 1-4)
// ============================================

// Step 1: Keyword Research
Task("seo-analytics-specialist", `
  Keyword research for "preserving family stories"

  Deliverables:
  - Primary keyword with search volume
  - 10-15 secondary keywords
  - Long-tail variations
  - People Also Ask questions
  - Search intent analysis

  Output: content/seo-data/keyword-research-family-stories.json
`)

// Step 2: Basic Competitor Analysis
Task("competitive-seo-analyst", `
  Analyze top 3 competitors for "preserve family stories"

  Deliverables:
  - Competitor content structure
  - Backlink profiles
  - Basic content gaps
  - SERP position analysis

  Output: content/seo-data/competitor-analysis-family-stories.md
`)

// Step 2.5: Competitor Deep Analysis
Task("competitive-seo-analyst", `
  Deep analysis using CompetitorDeepAnalystAgent

  Configuration:
  - competitorDomains: [from Step 2]
  - maxPages: 50
  - maxDepth: 3

  Deliverables:
  - Site architecture patterns
  - Content strategy patterns
  - Hub page mapping
  - Internal linking patterns
  - Content gaps with priority

  Output: content/seo-data/competitor-deep-analysis.json
`)

// Step 3: Basic SERP Analysis
Task("serp-analyst", `
  Extract SERP features for "preserve family stories"

  Deliverables:
  - Featured snippet analysis
  - People Also Ask extraction
  - SERP feature mapping
  - Basic recommendations

  Output: content/seo-data/serp-analysis-family-stories.json
`)

// Step 3.5: SERP Pattern Analysis
Task("serp-analyst", `
  Deep SERP pattern analysis using SERPPatternAnalyst

  Deliverables:
  - All 16 SERP features detected
  - Ranking patterns (DA, content length, freshness)
  - Semantic clusters
  - Content gaps
  - Actionable recommendations

  Output: content/seo-data/serp-pattern-analysis.json
`)

// Step 4: Deep Research
Task("research-specialist", `
  Deep research for "preserving family stories"

  Research Requirements:
  - Real examples (Reddit, Quora, Twitter)
  - Expert source identification
  - Counter-examples
  - Statistics with citations

  Deliverables:
  - ≥5 credible sources
  - ≥5 real-world examples
  - ≥3 expert sources
  - Counter-examples documented

  Output: content/research/family-stories-research.md
`)

// ============================================
// STRATEGY PHASE (Steps 5-6)
// ============================================

// Step 5: Angle Development
Task("angle-developer", `
  Develop unique angle for "preserve family stories"

  Context:
  - Keyword research: content/seo-data/keyword-research-family-stories.json
  - Competitor analysis: content/seo-data/competitor-deep-analysis.json
  - SERP patterns: content/seo-data/serp-pattern-analysis.json
  - Research: content/research/family-stories-research.md

  Deliverables:
  - Thesis statement (uniqueness score ≥0.80)
  - Narrative pattern
  - Voice profile
  - Differentiation analysis

  Output: content/angles/family-stories-angle.yaml
`)

// Step 6: Narrative Outline
Task("content-seo-strategist", `
  Create narrative-driven outline

  Context:
  - Angle: content/angles/family-stories-angle.yaml
  - SERP analysis: content/seo-data/serp-pattern-analysis.json
  - Research: content/research/family-stories-research.md

  Deliverables:
  - Story structure (not just headers)
  - Tension point mapping
  - Depth distribution planning
  - Internal linking opportunities

  Output: content/outlines/preserve-family-stories-outline.md
`)

// ============================================
// CREATION PHASE (Steps 7-8)
// ============================================

// Step 7: Content Writing
Task("seo-content-writer", `
  Write blog post following narrative outline

  Context:
  - Outline: content/outlines/preserve-family-stories-outline.md
  - Angle: content/angles/family-stories-angle.yaml
  - Research: content/research/family-stories-research.md
  - Voice: OurStories (warm, personal, empowering)

  Requirements:
  - 1500-2000 words
  - Apply voice profile
  - Integrate real examples
  - Follow narrative arc
  - Natural keyword integration

  Output: content/drafts/preserve-family-stories.md
`)

// Step 8: Depth Injection
Task("depth-enhancer", `
  Enhance content depth

  Context:
  - Draft: content/drafts/preserve-family-stories.md
  - Angle: content/angles/family-stories-angle.yaml
  - Research: content/research/family-stories-research.md

  Enhancement Tasks:
  - Add deeper insights to shallow sections
  - Expand examples with context/outcomes
  - Add counter-examples
  - Deepen expert perspectives
  - Add nuance to claims

  Output: content/enhanced/preserve-family-stories.md

  Success: Depth improvement ≥20% per section
`)

// ============================================
// OPTIMIZATION PHASE (Steps 9-11)
// ============================================

// Step 9: SEO Optimization
Task("technical-seo-specialist", `
  Optimize for technical SEO

  Context:
  - Enhanced draft: content/enhanced/preserve-family-stories.md
  - Primary keyword: "preserve family stories"
  - Target URL: /blog/preserve-family-stories

  Tasks:
  - Meta title (50-60 chars)
  - Meta description (150-160 chars)
  - Header optimization
  - Internal linking (3-5 links)
  - Image alt text

  Output: content/optimized/preserve-family-stories.md
`)

// Step 10: Validation Loop (6 validators in parallel)
Task("humanizer-validator", `Validate for natural writing (weight: 0.15)`)
Task("branding-validator", `Validate brand alignment (weight: 0.15)`)
Task("audience-validator", `Validate audience fit (weight: 0.15)`)
Task("seo-validator", `Validate SEO optimization (weight: 0.15)`)
Task("voice-authenticity-validator", `Validate voice adherence (weight: 0.20)`)
Task("depth-quality-validator", `Validate content depth (weight: 0.25)`)

// Main Chat calculates weighted consensus:
// IF consensus ≥0.95 → Proceed to Step 11
// IF consensus <0.95 → Iterate Steps 7-8

// Step 11: Schema Markup
Task("schema-markup-engineer", `
  Add schema and prepare for publishing

  Context:
  - Validated article: content/optimized/preserve-family-stories.md
  - URL: https://ourstories.com/blog/preserve-family-stories

  Tasks:
  - Add Article schema (JSON-LD)
  - Add FAQ schema (from PAA optimization)
  - Add BreadcrumbList schema
  - Validate with Rich Results Test

  Output: content/published/preserve-family-stories.md
`)

// ============================================
// QUALITY GATE (Step 11.5)
// ============================================

// Step 11.5: Pre-Publication Audit
Task("backend-developer", `
  Execute Step 11.5: Pre-Publication Audit

  Use: executeStep115()

  Configuration:
  - targetKeyword: "preserve family stories"
  - contentHtml: [from Step 11 output]
  - minAcceptableScore: 75

  Deliverables:
  - Overall score (must be ≥75 to publish)
  - Category breakdown
  - Critical findings

  Output: content/audit/preserve-family-stories-audit.json

  IF score <75: Return to Step 9 with findings
  IF score ≥75: Proceed to publishing
`)

// ============================================
// POST-PIPELINE: Learning & Tracking
// ============================================

// Step 12: Learning Capture (after publishing)
Task("backend-developer", `
  Execute Step 12: Capture learnings

  Use: executeStep12()

  Context:
  - Pipeline outcome: success
  - Pattern applications: [from context]

  Deliverables:
  - Learnings captured
  - Pattern confidence updates
  - Promotions/archives
`)

// Step 13: Performance Tracking (ongoing)
Task("backend-developer", `
  Execute Step 13: Track performance

  Use: executeStep13()

  Configuration:
  - useMockData: false (production)
  - detectAlgorithmCorrelation: true

  Deliverables:
  - Performance metrics
  - Pattern adjustments
  - Refresh recommendations
`)
```

---

## Agent Selection by Step

| Step | Primary Agent | Secondary/Component | Skill File |
|------|---------------|---------------------|------------|
| 0 | backend-developer | executeStep0() | step-0-intelligence-preload.ts |
| 1 | seo-analytics-specialist | DataForSEO API | - |
| 2 | competitive-seo-analyst | - | - |
| 2.5 | competitive-seo-analyst | CompetitorDeepAnalystAgent | competitor-deep-analyst.ts |
| 3 | serp-analyst | - | - |
| 3.5 | serp-analyst | SERPPatternAnalyst | serp-pattern-analyst.ts |
| 4 | research-specialist | Firecrawl + Perplexity | research-service.ts |
| 5 | angle-developer | - | - |
| 6 | content-seo-strategist | - | - |
| 7 | seo-content-writer | - | - |
| 8 | depth-enhancer | - | - |
| 9 | technical-seo-specialist | CTROptimizationEngine | ctr-optimization-engine.ts |
| 10 | 6 validators (parallel) | - | - |
| 11 | schema-markup-engineer | SERPFeatureOptimizer | serp-feature-optimizer.ts |
| 11.5 | backend-developer | executeStep115() | step-11.5-pre-publication-audit.ts |
| 12 | backend-developer | executeStep12() | step-12-learning-capture.ts |
| 13 | backend-developer | executeStep13() | step-13-performance-tracking.ts |

---

## Validation Loop (6 Validators)

**Validators with Weights:**

| Validator | Weight | Focus | Threshold |
|-----------|--------|-------|-----------|
| humanizer-validator | 0.15 | Natural writing, no AI language | ≥0.75 |
| branding-validator | 0.15 | Brand voice alignment | ≥0.75 |
| audience-validator | 0.15 | Persona fit, resonance | ≥0.75 |
| seo-validator | 0.15 | Keyword density, structure | ≥0.75 |
| voice-authenticity-validator | 0.20 | Voice profile adherence | ≥0.75 |
| depth-quality-validator | 0.25 | Content depth, examples | ≥0.75 |

**Weighted Consensus Calculation:**
```javascript
const consensus =
  (humanizer * 0.15) +
  (branding * 0.15) +
  (audience * 0.15) +
  (seo * 0.15) +
  (voice * 0.20) +
  (depth * 0.25);

// Premium: ≥0.95
// Standard: 0.85-0.94
// Basic: 0.75-0.84
// Fail: <0.75
```

---

## Quality Tier Reporting

| Tier | Consensus | Characteristics |
|------|-----------|-----------------|
| **Premium** | ≥0.95 | Exceptional depth, unique voice, strong differentiation |
| **Standard** | 0.85-0.94 | Good depth, consistent voice, solid quality |
| **Basic** | 0.75-0.84 | Meets minimum standards, needs iteration |
| **Below Standard** | <0.75 | Fails validation, requires rework |

---

## Troubleshooting

### Intelligence Pre-load Fails
- Check Redis connection
- Verify pattern store has data
- Check minPatternConfidence threshold

### Competitor Deep Analysis Times Out
- Reduce maxPages per domain
- Increase rateLimitMs
- Check Firecrawl API key

### SERP Pattern Analysis Returns Empty
- Verify Google API credentials
- Check rate limits
- Try with scraping fallback

### Pre-Publication Audit Fails
- Review critical findings
- Address category scores <60
- Re-run optimization steps

### Performance Tracking No Data
- Verify GSC/GA4 property IDs
- Check API credentials
- Use mock data for testing

---

## Related Documentation

- **Skill Location:** `.claude/skills/cfn-seo-pipeline/lib/seo/`
- **Agent Profiles:** `.claude/agents/cfn-seo-team/`
- **CLI Mode:** `.claude/commands/seo/SEO_CLI_MODE.md`
- **Pattern Sync:** `.claude/commands/cfn-seo/seo-sync.md`
- **Type Definitions:** `.claude/skills/cfn-seo-pipeline/lib/seo/types/`

---

**Version:** 3.0.0 (15-Step Intelligence-Enhanced Pipeline)
**Last Updated:** 2025-12-02
**Maintained By:** CFN SEO Team
**Previous Version:** 2.0.0 (11-Step Quality Pipeline)
