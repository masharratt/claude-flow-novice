# SEO Task Mode Guide (11-Step Quality-Focused Pipeline)

**Purpose:** Execute SEO content pipeline using Task() spawning from Main Chat (no coordinator agent)

**When to Use:**
- Debugging SEO pipeline issues
- Learning the 11-step quality-focused process
- Single-step testing (keyword research only)
- Development of new SEO agents
- Premium content requiring unique angles and depth

**Cost:** $7-20 per full pipeline (Anthropic pricing for all agents)

**Alternative:** CLI Mode via `cfn-seo-coordinator` ($1/pipeline with Z.ai routing)

**Pipeline Version:** 11-Step Quality-Focused (6 validators)

**Legacy Mode:** Use `--legacy` flag for original 9-step Firecrawl pipeline (4 validators)

---

## Table of Contents

1. [Quick Start - Full Pipeline](#quick-start-full-pipeline)
2. [11-Step Pipeline Guide (Quality-Focused)](#11-step-pipeline-guide)
3. [NEW: Angle Development (Step 5)](#step-5-angle-development)
4. [NEW: Depth Injection (Step 8)](#step-8-depth-injection)
5. [Agent Selection by Step](#agent-selection-by-step)
6. [Sprint Workflow](#sprint-workflow)
7. [Validation Loop (6 Validators)](#validation-loop)
8. [Quality Tier Reporting](#quality-tier-reporting)
9. [Single-Step Execution](#single-step-execution)
10. [Content Type Variations](#content-type-variations)
11. [Legacy Mode (9-Step Pipeline)](#legacy-mode)
12. [Troubleshooting](#troubleshooting)

---

## Quick Start - Full Pipeline

**Example Task:** "Write a blog post about preserving family stories for OurStories"

**Main Chat Execution:**

```javascript
// Step 1: Keyword Research
Task("seo-analytics-specialist", `
  Perform keyword research for blog post topic: "preserving family stories"

  Deliverables:
  - Primary keyword (target keyword)
  - 10-15 secondary keywords (search volume, difficulty, CPC)
  - Long-tail keyword variations
  - Related questions (People Also Ask)

  Output: content/seo-data/keyword-research-family-stories.json

  Success Criteria:
  - Primary keyword identified with search volume data
  - Keyword difficulty ≤60 (rankable)
  - Mix of high-volume and low-competition keywords
`)

// Step 2: Competitor Analysis
Task("competitive-seo-analyst", `
  Analyze top 3 competitors for keyword "preserve family stories"

  Context:
  - Primary keyword: [from Step 1 output]
  - Target audience: Families, genealogists

  Deliverables:
  - Competitor content analysis (structure, word count, headers)
  - Backlink profiles (domain authority, backlinks count)
  - Content gaps (what competitors miss)
  - SERP feature analysis (featured snippets, People Also Ask)

  Output: content/seo-data/competitor-analysis-family-stories.md

  Success Criteria:
  - 3 competitors analyzed
  - Content gaps identified (≥3 opportunities)
  - SERP features mapped
`)

// Step 3: Content Outline
Task("content-seo-strategist", `
  Create SEO-optimized content outline for "preserve family stories" blog post

  Context:
  - Keyword research: content/seo-data/keyword-research-family-stories.json
  - Competitor analysis: content/seo-data/competitor-analysis-family-stories.md
  - Brand: OurStories
  - Target word count: 1500-2000 words

  Deliverables:
  - H1 title (includes primary keyword)
  - 5-7 H2 sections
  - H3 subsections where needed
  - Internal linking opportunities
  - CTA placement recommendations

  Output: content/outlines/preserve-family-stories-outline.md

  Success Criteria:
  - Primary keyword in H1
  - Secondary keywords distributed across H2s
  - Natural flow (not keyword stuffed)
  - Addresses user intent
`)

// Step 4: Research (Enhanced with Example Mining)
Task("research-specialist", `
  Deep research for blog post: "preserving family stories"

  Context:
  - Outline: content/outlines/preserve-family-stories-outline.md
  - Primary keyword: "preserve family stories"

  Research Requirements:
  1. Real examples from Reddit, Quora, Twitter (user stories)
  2. Expert source identification (genealogists, archivists)
  3. Counter-examples (common mistakes, what NOT to do)
  4. Statistical data with citations
  5. Expert quotes (with attribution)

  Deliverables:
  - Research document with categorized sources
  - Real-world examples (at least 5)
  - Expert insights (at least 3)
  - Counter-examples (at least 2)

  Output: content/research/family-stories-research.md

  Success Criteria:
  - ≥5 credible sources cited
  - ≥5 real examples from social platforms
  - ≥3 expert sources identified
  - Counter-examples documented
`)

// Step 5: Angle Development (NEW)
Task("angle-developer", `
  Develop unique content angle for "preserve family stories"

  Context:
  - Keyword research: content/seo-data/keyword-research-family-stories.json
  - Competitor analysis: content/seo-data/competitor-analysis-family-stories.md
  - SERP analysis: content/seo-data/serp-analysis-family-stories.json
  - Research: content/research/family-stories-research.md

  Deliverables:
  - Thesis statement (unique perspective/claim)
  - Narrative pattern (story structure, not just headers)
  - Voice profile (tone, style, vocabulary)
  - Differentiation analysis (how this differs from competitors)

  Output: content/angles/family-stories-angle.yaml

  Success Criteria:
  - Thesis uniqueness score ≥0.80 (compared to competitors)
  - Voice profile distinct from competitor patterns
  - Narrative structure supports thesis
  - Differentiation clearly articulated
`)

// Step 6: Content Outline (Enhanced with Narrative Arc)
Task("content-seo-strategist", `
  Create narrative-driven outline for "preserve family stories"

  Context:
  - Angle document: content/angles/family-stories-angle.yaml
  - Keyword research: content/seo-data/keyword-research-family-stories.json
  - SERP analysis: content/seo-data/serp-analysis-family-stories.json
  - Research: content/research/family-stories-research.md

  Deliverables:
  - Story structure outline (not just headers)
  - Tension point mapping (where to create engagement)
  - Depth distribution planning (where to go deep)
  - Internal linking opportunities
  - CTA placement recommendations

  Output: content/outlines/preserve-family-stories-outline.md

  Success Criteria:
  - Narrative arc supports angle thesis
  - Tension points mapped to key sections
  - Depth distribution planned (not uniform)
  - Keywords integrated naturally into story flow
`)

// Step 7: Content Writing (Enhanced with Voice & Examples)
Task("seo-content-writer", `
  Write blog post following narrative outline

  Context:
  - Outline: content/outlines/preserve-family-stories-outline.md
  - Angle document: content/angles/family-stories-angle.yaml
  - Research: content/research/family-stories-research.md
  - Brand voice: OurStories (warm, personal, empowering)
  - Target audience: Families, genealogists, memory keepers

  Requirements:
  - 1500-2000 words
  - Apply voice profile from angle document
  - Integrate real examples from research
  - Follow narrative arc (not just headers)
  - Adhere to thesis from angle document
  - Natural keyword integration
  - Engaging introduction with tension
  - Strong CTA at end

  Deliverables:
  - Full blog post draft (markdown)

  Output: content/drafts/preserve-family-stories.md

  Success Criteria:
  - Meets word count target
  - Voice profile consistently applied
  - ≥5 real examples integrated from research
  - Narrative arc followed (not listicle structure)
  - Thesis supported throughout
  - Primary keyword appears 3-5 times naturally
`)

// Step 8: Depth Injection (NEW)
Task("depth-enhancer", `
  Enhance content depth for "preserve family stories"

  Context:
  - Draft article: content/drafts/preserve-family-stories.md
  - Angle document: content/angles/family-stories-angle.yaml
  - Research document: content/research/family-stories-research.md

  Enhancement Requirements:
  1. Add deeper insights to shallow sections
  2. Expand examples with context and outcomes
  3. Add counter-examples where missing
  4. Deepen expert perspectives
  5. Add nuance to simplistic statements

  Deliverables:
  - Enhanced article with depth markers
  - Depth audit report (before/after scores)

  Output: content/enhanced/preserve-family-stories.md

  Success Criteria:
  - Depth score improvement ≥20% per section
  - All sections meet minimum depth threshold
  - Examples expanded with context
  - Counter-examples added to key claims
  - Expert insights deepened
`)

// Step 9: SEO Optimization
Task("technical-seo-specialist", `
  Optimize enhanced blog post for technical SEO

  Context:
  - Enhanced draft: content/enhanced/preserve-family-stories.md
  - Primary keyword: "preserve family stories"
  - Target URL: /blog/preserve-family-stories

  Tasks:
  1. Meta title (50-60 chars, includes primary keyword)
  2. Meta description (150-160 chars, compelling CTA)
  3. Header optimization (H1, H2s include keywords)
  4. Internal linking (3-5 relevant internal links)
  5. Image alt text recommendations
  6. URL slug optimization

  Deliverables:
  - Optimized blog post (with frontmatter metadata)
  - SEO checklist (what was optimized)

  Output: content/optimized/preserve-family-stories.md

  Success Criteria:
  - Meta title ≤60 chars, includes primary keyword
  - Meta description compelling, ≤160 chars
  - 3-5 internal links added
  - Headers optimized (H1 has primary keyword)
`)

// Step 10: Validation (6 Validators in Parallel)
Task("humanizer-validator", `
  Validate blog post for natural, human-like writing

  Context:
  - Article: content/optimized/preserve-family-stories.md
  - Iteration: 1

  Check for:
  - AI-generated language patterns (red flags)
  - Conversational tone
  - Personal examples/anecdotes
  - Varied sentence structure

  Output Format:
  - Confidence score: [0.0-1.0]
  - Issues found (with line numbers)
  - Specific rewrites recommended

  Threshold: ≥0.75 to pass
  Weight: 0.15
`)

Task("branding-validator", `
  Validate blog post alignment with OurStories brand

  Context:
  - Article: content/optimized/preserve-family-stories.md
  - Brand: OurStories
  - Iteration: 1

  Check for:
  - Brand voice consistency (warm, personal, empowering)
  - Value proposition clarity
  - Tone alignment
  - Messaging consistency

  Output Format:
  - Confidence score: [0.0-1.0]
  - Brand alignment issues
  - Recommended adjustments

  Threshold: ≥0.75 to pass
  Weight: 0.15
`)

Task("audience-validator", `
  Validate blog post fit for target audience

  Context:
  - Article: content/optimized/preserve-family-stories.md
  - Audience: Families, genealogists, memory keepers
  - Iteration: 1

  Check for:
  - Resonance with audience pain points
  - Appropriate complexity level
  - Relatable examples
  - Clear value for target personas

  Output Format:
  - Confidence score: [0.0-1.0]
  - Audience fit issues
  - Suggested improvements

  Threshold: ≥0.75 to pass
  Weight: 0.15
`)

Task("seo-validator", `
  Validate blog post SEO optimization

  Context:
  - Article: content/optimized/preserve-family-stories.md
  - Primary keyword: "preserve family stories"
  - Iteration: 1

  Check for:
  - Keyword density (not over-optimized)
  - Header hierarchy (H1 → H2 → H3)
  - Meta tags quality
  - Internal linking relevance

  Output Format:
  - Confidence score: [0.0-1.0]
  - SEO issues found
  - Optimization recommendations

  Threshold: ≥0.75 to pass
  Weight: 0.15
`)

Task("voice-authenticity-validator", `
  Validate voice profile adherence (NEW)

  Context:
  - Article: content/optimized/preserve-family-stories.md
  - Angle document: content/angles/family-stories-angle.yaml
  - Iteration: 1

  Check for:
  - Voice profile consistency with angle document
  - Tone deviations from intended voice
  - Vocabulary alignment with voice profile
  - Narrative adherence to angle thesis

  Output Format:
  - Confidence score: [0.0-1.0]
  - Voice deviations found (with line numbers)
  - Voice adjustment recommendations

  Threshold: ≥0.75 to pass
  Weight: 0.20
`)

Task("depth-quality-validator", `
  Validate content depth and quality (NEW)

  Context:
  - Article: content/optimized/preserve-family-stories.md
  - Research document: content/research/family-stories-research.md
  - Depth audit: content/enhanced/preserve-family-stories-depth-audit.md
  - Iteration: 1

  Check for:
  - Depth sufficiency across all sections
  - Example integration quality
  - Counter-example presence
  - Expert insight utilization
  - Nuance in claims and statements

  Output Format:
  - Confidence score: [0.0-1.0]
  - Depth gaps identified (section-level)
  - Quality improvement recommendations

  Threshold: ≥0.75 to pass
  Weight: 0.25
`)

// Main Chat collects validator scores and calculates weighted consensus
// Weighted consensus formula:
// consensus = (humanizer * 0.15) + (branding * 0.15) + (audience * 0.15) +
//             (seo * 0.15) + (voice * 0.20) + (depth * 0.25)
//
// IF consensus ≥0.95 → Proceed to Step 11
// IF consensus <0.95 → Iterate (spawn Steps 7-8 again with validator feedback)

// Step 11: Publishing with Schema
Task("schema-markup-engineer", `
  Add schema markup and prepare for publishing

  Context:
  - Validated article: content/optimized/preserve-family-stories.md
  - URL: https://ourstories.com/blog/preserve-family-stories
  - Author: OurStories Team
  - Published: 2025-11-01

  Tasks:
  1. Add Article schema (JSON-LD)
  2. Add BreadcrumbList schema
  3. Add Organization schema
  4. Validate schema with Google Rich Results Test
  5. Final formatting (headings, lists, bold, italics)
  6. Quality tier reporting (consensus score, tier assignment)

  Deliverables:
  - Final blog post with embedded schema
  - Schema validation report
  - Quality tier report

  Output: content/published/preserve-family-stories.md

  Success Criteria:
  - Valid Article schema (no errors in Rich Results Test)
  - Schema includes all required properties
  - Final formatting polished
  - Quality tier documented
`)
```

---

## 11-Step Pipeline Guide (Quality-Focused)

**Overview:** The 11-step pipeline adds **Angle Development** (Step 5) and **Depth Injection** (Step 8) to create premium content with unique perspectives and comprehensive depth.

**New Capabilities:**
- Unique thesis development (not just keyword targeting)
- Narrative-driven structure (story arc, not listicles)
- Voice profile application (consistent tone/style)
- Real example integration (Reddit, Quora, Twitter)
- Depth enhancement (nuance, counter-examples, expert insights)
- 6-validator system (including voice and depth validation)
- Quality tier reporting (Premium/Standard/Basic)

**When to Use 11-Step vs Legacy:**
- Use 11-step for: Thought leadership, competitive niches, premium brands, content differentiation
- Use legacy (9-step) for: Quick turnarounds, basic content, cost-sensitive projects

---

## Pipeline Steps Overview

| Step | Agent | Focus | NEW? |
|------|-------|-------|------|
| 1 | seo-analytics-specialist | Keyword research | - |
| 2 | competitive-seo-analyst | Competitor analysis | - |
| 3 | serp-analyst | SERP features & PAA | - |
| 4 | research-specialist | Deep research + examples | Enhanced |
| 5 | angle-developer | Unique thesis & voice | **NEW** |
| 6 | content-seo-strategist | Narrative outline | Enhanced |
| 7 | seo-content-writer | Content writing | Enhanced |
| 8 | depth-enhancer | Depth injection | **NEW** |
| 9 | technical-seo-specialist | SEO optimization | - |
| 10 | 6 validators (parallel) | Quality validation | Enhanced |
| 11 | schema-markup-engineer | Publishing + schema | - |

---

## Step 5: Angle Development

**Agent:** `angle-developer`

**Purpose:** Develop a unique content angle that differentiates from competitors through thesis, narrative pattern, and voice profile.

**Inputs:**
- Keyword research (Step 1)
- Competitor analysis (Step 2)
- SERP analysis (Step 3)
- Research document (Step 4)

**Outputs:**
- Thesis statement (unique perspective/claim)
- Narrative pattern (story structure)
- Voice profile (tone, style, vocabulary guidelines)
- Differentiation analysis

**Process:**
1. Analyze competitor positioning and identify gaps
2. Develop unique thesis based on research insights
3. Define narrative structure that supports thesis
4. Create voice profile for consistent tone
5. Document differentiation strategy

**Success Criteria:**
- Thesis uniqueness score ≥0.80 (vs competitors)
- Voice profile distinct from competitor patterns
- Narrative structure supports thesis
- Differentiation clearly articulated

**Output File:** `content/angles/[topic]-angle.yaml`

**Example Output:**
```yaml
topic: "Preserving Family Stories"
thesis:
  claim: "Family stories die not from lack of technology, but from lack of emotional permission to ask the hard questions"
  uniqueness_score: 0.87
  differentiation: "Competitors focus on tools/methods; we focus on the psychological barriers"

narrative_pattern:
  structure: "Challenge → Permission → Action"
  arc:
    - opening: "Emotional tension (fear of loss)"
    - middle: "Permission framework (how to ask difficult questions)"
    - closing: "Empowerment (stories preserved through vulnerability)"
  tension_points:
    - "Why we wait until it's too late"
    - "The questions we're afraid to ask"
    - "What gets lost when we play it safe"

voice_profile:
  tone: "Intimate, permission-giving, vulnerable"
  style: "First-person experiences, direct address, emotional honesty"
  vocabulary:
    - use: ["permission", "vulnerability", "courage", "legacy"]
    - avoid: ["platform", "solution", "leverage", "optimize"]
  sentence_patterns:
    - "Short sentences for emotional impact"
    - "Questions that invite reflection"
    - "Stories before instructions"
```

---

## Step 8: Depth Injection

**Agent:** `depth-enhancer`

**Purpose:** Enhance content depth by adding nuance, expanding examples, incorporating counter-examples, and deepening expert insights.

**Inputs:**
- Draft article (Step 7)
- Angle document (Step 5)
- Research document (Step 4)

**Outputs:**
- Enhanced article with depth markers
- Depth audit report (before/after scores per section)

**Enhancement Types:**
1. **Insight Deepening:** Add "why" and "how" to surface-level claims
2. **Example Expansion:** Add context, outcomes, and lessons to examples
3. **Counter-Example Integration:** Add what NOT to do and why
4. **Expert Perspective:** Deepen quotes with context and implications
5. **Nuance Addition:** Add caveats, exceptions, and situational factors

**Depth Scoring Criteria:**
- **Level 1 (Shallow):** Surface facts, no context, generic advice
- **Level 2 (Adequate):** Some context, basic examples, limited nuance
- **Level 3 (Deep):** Rich context, detailed examples, counter-examples, nuance
- **Level 4 (Exceptional):** Multiple perspectives, expert synthesis, actionable insights

**Success Criteria:**
- Depth score improvement ≥20% per section
- All sections achieve Level 3 (Deep) minimum
- Examples expanded with context and outcomes
- Counter-examples added to key claims (≥2)
- Expert insights deepened with implications

**Output Files:**
- `content/enhanced/[topic].md` (enhanced article)
- `content/enhanced/[topic]-depth-audit.md` (before/after report)

**Example Depth Enhancement:**

**Before (Shallow - Level 1):**
```
To preserve family stories, record interviews with older relatives. Use a voice recorder app on your phone.
```

**After (Deep - Level 3):**
```
The most powerful family stories live in the moments we're afraid to ask about. When my grandmother was 87, I finally asked about the sister she never mentioned. The two-hour conversation that followed—full of tears, laughter, and truths I'd never imagined—became our family's most treasured recording.

Start with the questions that make you uncomfortable. Not "tell me about your childhood" (too broad, too safe), but "what's the one thing you've never told me?" Use your phone's voice recorder, but more importantly, use your courage. The technical quality matters far less than emotional permission.

Counter-example: My cousin waited for "the right equipment" and never asked. His father passed before the interview happened. Perfect audio quality of silence is still silence.
```

**Depth Audit Report Example:**
```markdown
# Depth Audit Report: Preserving Family Stories

## Section-Level Scores

| Section | Before | After | Improvement |
|---------|--------|-------|-------------|
| Introduction | 1.5 | 3.2 | +113% |
| Core Methods | 2.0 | 3.5 | +75% |
| Common Mistakes | 1.2 | 3.8 | +217% |
| Expert Tips | 2.5 | 3.7 | +48% |

## Enhancements Applied

### Introduction
- Added personal story (grandmother interview)
- Introduced emotional tension (fear of asking)
- Deepened "why" (permission > technology)

### Core Methods
- Expanded 3 examples with outcomes
- Added 2 counter-examples
- Integrated expert quote with context

### Common Mistakes
- Added 4 detailed counter-examples
- Explained consequences of each mistake
- Provided specific remediation strategies

### Expert Tips
- Deepened 2 expert quotes with implications
- Added nuance to 3 recommendations
- Included situational factors
```

---

## 9-Step Pipeline Guide (Firecrawl Enhanced - LEGACY)

### Step 1: Keyword Research

**Agent:** `seo-analytics-specialist`

**Inputs:**
- Topic/title (from user request)
- Target audience (optional)

**Outputs:**
- Primary keyword (target keyword)
- Secondary keywords (10-15 with metrics)
- Long-tail variations
- People Also Ask questions
- Search intent analysis

**Tools:**
- DataForSEO API (keyword metrics)
- Google Search Console (existing rankings)
- SE Ranking (keyword suggestions)

**Success Criteria:**
- Primary keyword identified (search volume >100/month)
- Keyword difficulty ≤60 (rankable)
- Mix of head terms and long-tail
- Search intent clear (informational/transactional/navigational)

**Output File:** `content/seo-data/keyword-research-[topic].json`

---

### Step 2: Competitor Analysis

**Agent:** `competitive-seo-analyst`

**Inputs:**
- Primary keyword (from Step 1)
- Target SERP position (default: top 3)

**Outputs:**
- Top 3 competitor analysis
- Content structure comparison
- Backlink profiles
- Content gaps (what competitors miss)
- SERP features (featured snippets, PAA, images)

**Tools:**
- DataForSEO API (SERP data)
- Ahrefs API (backlink analysis)
- SE Ranking (competitor keywords)

**Success Criteria:**
- 3 competitors analyzed
- Content gaps identified (≥3 opportunities)
- SERP features mapped
- Competitive advantage defined

**Output File:** `content/seo-data/competitor-analysis-[topic].md`

---

### Step 3: SERP Analysis (Firecrawl 🔥)

**Agent:** `serp-analyst` + Firecrawl

**Inputs:**
- Primary keyword (from Step 1)
- Competitor URLs (from Step 2)

**Outputs:**
- SERP feature map (featured snippets, PAA, images, videos)
- Featured snippet opportunity analysis
- People Also Ask questions (extracted)
- SERP gap identification
- Content format recommendations

**Tools:**
- Firecrawl (dynamic SERP page rendering)
- DataForSEO SERP API (structured data)

**Firecrawl Usage:**
```bash
# Scrape Google SERP for keyword
firecrawl scrape \
  --url "https://google.com/search?q=${keyword}" \
  --wait-for-selector ".g" \
  --extract-selectors "h3,span,.related-question-pair"
```

**Success Criteria:**
- Featured snippet opportunity identified (if any)
- ≥5 People Also Ask questions extracted
- SERP feature gaps documented
- Content format recommendation (listicle, how-to, guide)

**Output File:** `content/seo-data/serp-analysis-[topic].json`

---

### Step 4: Content Outline

**Agent:** `content-seo-strategist`

**Inputs:**
- Keyword research (Step 1)
- Competitor analysis (Step 2)
- SERP analysis (Step 3) ← NEW
- Brand voice guidelines
- Target word count

**Outputs:**
- H1 title (SEO-optimized, targets featured snippet)
- 5-7 H2 sections (addresses PAA questions)
- H3 subsections
- Internal linking strategy
- CTA placement

**Success Criteria:**
- Primary keyword in H1
- Secondary keywords in H2s (natural)
- Addresses PAA questions from SERP analysis
- Better structure than competitors

**Output File:** `content/outlines/[topic]-outline.md`

---

### Step 5: Research & Citations (Firecrawl + Perplexity)

**Agent:** `research-specialist` + Firecrawl + Perplexity

**Inputs:**
- Content outline (Step 4)
- Research questions (extracted from outline)
- Source URLs (from competitor analysis)

**Outputs:**
- Research sources (5-10 credible sources)
- Key facts/statistics (with citations)
- Expert quotes (scraped from source pages)
- Data for content support

**Tools:**
- Firecrawl (source page scraping)
- Perplexity API (fact synthesis via OpenRouter)
- Manual research (Google Scholar, industry publications)

**Firecrawl Usage:**
```bash
# Batch scrape source pages for citations
firecrawl batch-scrape \
  --urls "source1.com,source2.com,source3.com" \
  --format markdown \
  --extract-selectors "blockquote,.expert-quote,.statistic"
```

**Success Criteria:**
- ≥5 credible sources cited
- Data supports outline sections
- Expert quotes included (where relevant)
- All citations scraped and verified

**Output File:** `content/research/[topic]-research.md`

**Main Chat Execution:**
```bash
# Example: Research via Perplexity API
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "perplexity/pplx-70b-online",
    "messages": [{
      "role": "user",
      "content": "Research: Best methods for preserving family stories. Include statistics, expert quotes, and credible sources."
    }]
  }' > content/research/family-stories-research.json
```

---

### Step 6: Content Writing

**Agent:** `seo-content-writer`

**Inputs:**
- Outline (Step 4)
- Research (Step 5)
- SERP analysis (Step 3) ← incorporates SERP gaps
- Brand voice guidelines
- Target word count (1500-2000 for blog)

**Outputs:**
- Full blog post draft (markdown)
- Keyword integration (natural)
- SERP gap coverage
- Engaging introduction
- Clear CTA

**Success Criteria:**
- Meets word count target
- Conversational tone (no AI language)
- Primary keyword appears 3-5 times naturally
- Addresses SERP gaps from Step 3
- Includes personal examples/anecdotes
- Clear value proposition

**Output File:** `content/drafts/[topic].md`

---

### Step 7: Validation Loop (4 Validators)

**Agents (Parallel):**
1. `humanizer-validator` (natural writing)
2. `branding-validator` (brand alignment)
3. `audience-validator` (persona fit)
4. `seo-validator` (keyword density, structure) ← NEW

**Inputs:**
- Draft article (Step 6)
- Iteration number

**Outputs (Per Validator):**
- Confidence score (0.0-1.0)
- Issues found (with line numbers)
- Specific rewrites recommended

**Consensus Calculation (11-Step Quality Pipeline):**
```javascript
// Main Chat collects scores from 6 validators with weights
const humanizerScore = 0.85;   // Weight: 0.15
const brandingScore = 0.90;    // Weight: 0.15
const audienceScore = 0.92;    // Weight: 0.15
const seoScore = 0.88;         // Weight: 0.15
const voiceScore = 0.87;       // Weight: 0.20 (NEW)
const depthScore = 0.91;       // Weight: 0.25 (NEW)

// Weighted consensus calculation
const consensus = (
  (humanizerScore * 0.15) +
  (brandingScore * 0.15) +
  (audienceScore * 0.15) +
  (seoScore * 0.15) +
  (voiceScore * 0.20) +
  (depthScore * 0.25)
);
// consensus = 0.8935

// Quality tier assignment
let qualityTier;
if (consensus >= 0.95) {
  qualityTier = "Premium";
} else if (consensus >= 0.85) {
  qualityTier = "Standard";
} else {
  qualityTier = "Basic";
}

if (consensus >= 0.95) {
  console.log(`✅ Validation passed - Proceed to Step 11 [${qualityTier}]`);
} else {
  console.log(`🔄 Iteration required - Consensus: ${consensus.toFixed(2)} [${qualityTier}]`);
  // Spawn Steps 7-8 again with validator feedback
}
```

**Thresholds:**
- Individual validator: ≥0.75
- Weighted consensus: ≥0.95 (for Premium tier)

**Validator Weights (11-Step Pipeline):**
| Validator | Weight | Rationale |
|-----------|--------|-----------|
| humanizer-validator | 0.15 | Base quality check |
| branding-validator | 0.15 | Brand alignment |
| audience-validator | 0.15 | Audience fit |
| seo-validator | 0.15 | Technical SEO |
| voice-authenticity-validator | 0.20 | Voice differentiation (NEW) |
| depth-quality-validator | 0.25 | Content depth (NEW) |

**Legacy 9-Step Consensus (Equal Weights):**
```javascript
// 4 validators, equal weights
const consensus = (humanizerScore + brandingScore + audienceScore + seoScore) / 4;
```

**Thresholds:**
- Individual validator: ≥0.75
- Consensus: ≥0.95 (average of 4)

---

### Step 8: Internal Linking

**Agent:** `link-building-specialist`

**Inputs:**
- Validated article (Step 7)
- Site content inventory
- Existing internal link structure

**Tasks:**
1. Analyze existing content for link opportunities
2. Identify 3-5 contextual internal link targets
3. Add internal links with optimized anchor text
4. Suggest external authority links (2-3)
5. Validate link context and relevance

**Success Criteria:**
- 3-5 internal links added
- Anchor text optimized (not over-optimized)
- Links contextually relevant
- No broken links

**Output File:** `content/linked/[topic].md`

---

### Step 9: SEO Optimization

**Agent:** `seo-optimizer`

**Inputs:**
- Linked article (Step 8)
- Primary keyword
- Target URL

**Tasks:**
1. Meta title (50-60 chars, includes keyword)
2. Meta description (150-160 chars, compelling)
3. Header hierarchy validation (H1→H2→H3)
4. Image alt text generation
5. URL slug optimization
6. Final keyword density check

**Success Criteria:**
- Meta title ≤60 chars, includes primary keyword
- Meta description compelling, ≤160 chars
- Header hierarchy valid
- All images have alt text

**Output File:** `content/optimized/[topic].md`

---

### Step 9 (Final): Schema Markup (Publishing)

**Agent:** `schema-markup-engineer`

**Inputs:**
- Optimized article (Step 6, or final iteration from Step 7)
- URL
- Author
- Publication date

**Tasks:**
1. Add Article schema (JSON-LD)
2. Add BreadcrumbList schema
3. Add Organization schema
4. Validate with Google Rich Results Test
5. Final formatting

**Success Criteria:**
- Valid Article schema (no errors)
- All required properties included
- Rich Results Test passes

**Output File:** `content/published/[topic].md`

**Schema Example:**
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Preserve Family Stories: Complete Guide for 2025",
  "description": "Learn proven methods to preserve family stories...",
  "author": {
    "@type": "Organization",
    "name": "OurStories"
  },
  "datePublished": "2025-11-01",
  "dateModified": "2025-11-01",
  "image": "https://ourstories.com/images/family-stories.jpg"
}
```

---

## Quality Tier Reporting

**Purpose:** Classify content quality based on weighted validator consensus scores.

**Quality Tiers:**

| Tier | Consensus Range | Characteristics | Use Case |
|------|----------------|-----------------|----------|
| **Premium** | ≥0.95 | Exceptional depth, unique voice, strong differentiation | Thought leadership, competitive niches, flagship content |
| **Standard** | 0.85-0.94 | Good depth, consistent voice, solid quality | Regular blog posts, standard content |
| **Basic** | 0.75-0.84 | Meets minimum standards, needs iteration | Quick content, cost-sensitive projects |
| **Below Standard** | <0.75 | Fails validation, requires rework | - |

**Tier Reporting Format:**
```markdown
# Quality Report: Preserving Family Stories

**Final Consensus:** 0.9235
**Quality Tier:** Premium

## Validator Breakdown

| Validator | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| Humanizer | 0.88 | 0.15 | 0.132 |
| Branding | 0.92 | 0.15 | 0.138 |
| Audience | 0.94 | 0.15 | 0.141 |
| SEO | 0.89 | 0.15 | 0.134 |
| Voice Authenticity | 0.96 | 0.20 | 0.192 |
| Depth Quality | 0.95 | 0.25 | 0.238 |

**Weighted Consensus:** 0.9235

## Quality Highlights
- Voice differentiation score: 0.96 (Excellent)
- Depth improvement: +127% avg across sections
- Thesis uniqueness: 0.87 (Strong differentiation)
- Real examples integrated: 7
- Counter-examples: 4

## Recommendations
- Tier: Premium - Ready for publication
- Suggested placement: Homepage feature, pillar content
- Expected performance: Top 3 SERP within 3-6 months
```

---

## Agent Selection by Step (11-Step Quality Pipeline)

| Step | Primary Agent | Focus | NEW/Enhanced |
|------|---------------|-------|--------------|
| 1. Keyword Research | seo-analytics-specialist | Keyword metrics | - |
| 2. Competitor Analysis | competitive-seo-analyst | Competitive gaps | - |
| 3. SERP Analysis | serp-analyst | SERP features | - |
| 4. Research & Citations | research-specialist | Deep research + examples | Enhanced |
| 5. Angle Development | angle-developer | Thesis + voice | **NEW** |
| 6. Content Outline | content-seo-strategist | Narrative structure | Enhanced |
| 7. Content Writing | seo-content-writer | Voice-driven writing | Enhanced |
| 8. Depth Injection | depth-enhancer | Content depth | **NEW** |
| 9. SEO Optimization | technical-seo-specialist | Technical SEO | - |
| 10. Validation Loop | 6 validators (parallel) | Quality validation | Enhanced |
| 11. Schema Markup | schema-markup-engineer | Publishing | - |

**Validators (Step 10 - Parallel Execution, Weighted):**

| Validator | Focus | Threshold | Weight |
|-----------|-------|-----------|--------|
| humanizer-validator | Natural writing, no AI language | ≥0.75 | 0.15 |
| branding-validator | Brand voice alignment | ≥0.75 | 0.15 |
| audience-validator | Persona fit, resonance | ≥0.75 | 0.15 |
| seo-validator | Keyword density, structure | ≥0.75 | 0.15 |
| voice-authenticity-validator | Voice profile adherence | ≥0.75 | 0.20 |
| depth-quality-validator | Content depth, examples | ≥0.75 | 0.25 |

**Consensus Requirement:** ≥0.95 (weighted average) for Premium tier

---

## Agent Selection by Step (9-Step Firecrawl Pipeline - LEGACY)

| Step | Primary Agent | Secondary Tool | Use When |
|------|---------------|----------------|----------|
| 1. Keyword Research | seo-analytics-specialist | DataForSEO API | All content types |
| 2. Competitor Analysis | competitive-seo-analyst | Firecrawl 🔥 | Blog posts, competitive niches |
| 3. SERP Analysis | serp-analyst | Firecrawl 🔥 | All content (featured snippets, PAA) |
| 4. Research & Citations | research-specialist | Firecrawl + Perplexity | Research-heavy content |
| 5. Content Writing | seo-content-writer | - | All content types |
| 6. Validation Loop | 4 validators (parallel) | - | All content |
| 7. Internal Linking | link-building-specialist | - | Blog posts, pillar pages |
| 8. SEO Optimization | seo-optimizer | - | All content |
| 9. Schema Markup | schema-markup-engineer | Rich Results Test | All content |

**Validators (Step 6 - Parallel Execution, Equal Weights):**
| Validator | Focus | Threshold |
|-----------|-------|-----------|
| humanizer-validator | Natural writing, no AI language | ≥0.75 |
| branding-validator | Brand voice alignment | ≥0.75 |
| audience-validator | Persona fit, resonance | ≥0.75 |
| seo-validator | Keyword density, structure | ≥0.75 |

**Consensus Requirement:** ≥0.95 (simple average of 4 validators)

**Additional Specialists (Use When):**
- `local-seo-optimizer` - Location pages, GBP content
- `programmatic-seo-engineer` - Template-based page generation (100+ pages)
- `geo-optimization-expert` - AI search optimization, citation tracking
- `eeat-content-auditor` - E-E-A-T compliance, expert review

---

## Sprint Workflow

**When to Use Sprints:**
- Large content projects (10+ articles)
- Multi-phase rollouts (keyword research → outline → writing)
- Team collaboration (separate planning and execution)

**Sprint Pattern:**

**Sprint 1: Planning (Steps 1-3)**
```javascript
// Sprint Goal: Complete keyword research and outlines for 10 articles

Task("seo-analytics-specialist", `
  Keyword research for 10 blog post topics

  Topics:
  1. Preserve family stories
  2. Digital scrapbooking
  3. Genealogy research tips
  [... 7 more topics ...]

  Deliverables:
  - content/seo-data/keyword-research-sprint-1.json (all 10 topics)

  Success: Primary keyword identified for each topic
`)

Task("content-seo-strategist", `
  Create outlines for 10 blog posts

  Context:
  - Keyword research: content/seo-data/keyword-research-sprint-1.json

  Deliverables:
  - content/outlines/sprint-1/ (10 outline files)

  Success: Each outline has 5-7 H2 sections, keywords integrated
`)
```

**Sprint 2: Writing (Steps 4-5)**
```javascript
// Sprint Goal: Write 10 blog post drafts

// Main Chat spawns 10 content-seo-strategist agents (one per article)
// Or sequentially if resource-constrained
```

**Sprint 3: Optimization & Publishing (Steps 6-8)**
```javascript
// Sprint Goal: Optimize, validate, and publish 10 articles

// Spawn technical-seo-specialist for each article
// Then validators in parallel
// Finally schema-markup-engineer for publishing
```

---

## Validation Loop

**Iteration Pattern:**

**Iteration 1:**
1. Content written (Step 5)
2. SEO optimized (Step 6)
3. Validators run (Step 7)
4. Consensus calculated

**IF Consensus <0.95:**

**Iteration 2:**
```javascript
// Main Chat spawns Step 5 again with validator feedback

Task("content-seo-strategist", `
  Rewrite blog post addressing validator feedback

  Context:
  - Current draft: content/optimized/preserve-family-stories.md
  - Validator feedback:
    - Humanizer (0.75): Remove AI phrases ("delve into" on line 23, "unlock potential" on line 67)
    - Branding (0.85): Strengthen OurStories value proposition in intro
    - Audience (0.92): Add more specific examples for genealogists

  Tasks:
  1. Remove all AI-generated phrases
  2. Rewrite intro with stronger OurStories messaging
  3. Add 2-3 specific genealogy examples

  Success: Address all validator feedback, maintain SEO optimization
`)

// Then re-run Step 6 (SEO Optimization) if needed
// Then re-run Step 7 (Validation)
```

**Iteration 3 (if needed):**
Repeat pattern until consensus ≥0.95

**Iteration Limit:** 3 iterations
- After 3 iterations, escalate to manual review or product owner decision

---

## Single-Step Execution

**Use Case:** Testing individual agents or debugging specific steps

**Example: Test Keyword Research Only**

```javascript
Task("seo-analytics-specialist", `
  Test keyword research for topic: "preserve family stories"

  Deliverables:
  - Primary keyword
  - 10 secondary keywords

  Output: /tmp/test-keyword-research.json
`)
```

**Example: Test Validator Only**

```javascript
Task("humanizer-validator", `
  Validate this sample paragraph for AI language:

  "In today's digital age, preserving family stories has become more important than ever.
  By leveraging modern technology, you can unlock the potential of your family's legacy
  and embark on a journey to delve into your heritage."

  Expected: Confidence ≤0.50 (AI language detected)
`)
```

---

## Content Type Variations

### Blog Post (Full Pipeline)
**Steps:** 1, 2, 3, 4, 5, 6, 7, 8
**Validators:** humanizer + branding + audience
**Word Count:** 1500-2000
**Focus:** Keyword optimization, natural writing, brand voice

### Landing Page
**Steps:** 1, 3, 5, 6, 7, 8 (skip competitor analysis, minimal research)
**Validators:** humanizer + branding + audience
**Word Count:** 800-1200
**Focus:** Conversion optimization, CTA strength, schema markup

### Product Page
**Steps:** 1, 5, 6, 7, 8 (minimal outline, focus on schema)
**Validators:** humanizer + audience (branding optional)
**Word Count:** 400-800
**Focus:** Product schema, technical SEO, conversion

### Local Business Content
**Steps:** 1, 3, 5, 6, 7, 8 + `local-seo-optimizer`
**Validators:** humanizer + audience
**Word Count:** 600-1000
**Focus:** Local keywords, GBP integration, LocalBusiness schema

### Programmatic SEO (100+ Pages)
**Steps:** 1, 3, 6, 7, 8 (use templates, not custom writing)
**Agents:** `programmatic-seo-engineer` for Step 6
**Validators:** humanizer + audience (scaled validation)
**Word Count:** Variable (template-driven)
**Focus:** Template quality, duplicate content prevention, schema at scale

---

## Troubleshooting

### Validator Consensus Too Low

**Problem:** Validators consistently score <0.75

**Solutions:**
1. Check validator instructions (are they too strict?)
2. Review validator feedback (what specific issues?)
3. Provide clearer brand voice guidelines
4. Use more specific examples in writing prompt

**Example:**
```javascript
// Before (vague)
Task("content-seo-strategist", "Write blog post about family stories")

// After (specific)
Task("content-seo-strategist", `
  Write blog post about preserving family stories

  Brand Voice: Warm, personal, empowering (like talking to a family member)
  Tone: Conversational, not academic
  Examples: Include specific scenarios (recording grandparent interviews, digitizing photos)
  Avoid: Corporate jargon, AI phrases, generic advice
`)
```

### Keyword Research Returns No Results

**Problem:** DataForSEO API returns no keyword data

**Solutions:**
1. Check API credentials (DATAFORSEO_EMAIL, DATAFORSEO_PASSWORD)
2. Verify API quota not exceeded
3. Try broader search terms
4. Fallback to manual research (Google Keyword Planner, Ahrefs)

### Schema Validation Fails

**Problem:** Google Rich Results Test shows errors

**Solutions:**
1. Check required properties (headline, author, datePublished)
2. Validate image URLs (must be absolute, not relative)
3. Ensure date format is ISO 8601 (YYYY-MM-DD)
4. Test schema at https://validator.schema.org/

### Writing Too "AI-Like"

**Problem:** Humanizer validator scores ≤0.60

**Solutions:**
1. Add specific examples/anecdotes to prompt
2. Request conversational tone explicitly
3. Provide list of AI phrases to avoid
4. Include sample paragraphs in desired style

**Example:**
```javascript
Task("content-seo-strategist", `
  Write blog post with HUMAN, conversational tone

  Style Guide:
  - ✅ Use contractions (don't, can't, you'll)
  - ✅ Address reader directly (you, your)
  - ✅ Include specific examples (not generic advice)
  - ❌ NO "delve into", "unlock potential", "embark on journey"
  - ❌ NO "In today's digital age" openings
  - ❌ NO corporate jargon

  Example paragraph in desired style:
  "Think about the last family gathering. Did Grandma tell that story about her first job?
  Those stories matter. Here's how to save them before they're gone."
`)
```

---

## Cost Comparison: Task Mode vs CLI Mode

| Execution Mode | Cost/Pipeline | Use Case |
|----------------|---------------|----------|
| **Task Mode** (this guide) | $5-15 | Debugging, learning, single articles |
| **CLI Mode** (cfn-seo-coordinator) | $1 | Production, bulk content, cost optimization |

**When Task Mode Makes Sense:**
- Learning the SEO pipeline
- Debugging agent behavior
- Testing new validators
- Single-article projects (<5 articles)

**When to Switch to CLI Mode:**
- Production content creation
- Bulk article generation (10+ articles)
- Ongoing content programs
- Cost-sensitive projects

**Switching to CLI Mode:**
```bash
# Instead of Task() spawning, use coordinator
/cfn-seo-cli "Write blog post about preserving family stories for OurStories"

# Coordinator handles all agent spawning via CLI (Z.ai routing)
# Same 8-step pipeline, 95% cost savings
```

---

## Related Documentation

- **CLI Mode Coordinator:** `.claude/agents/cfn-seo-team/cfn-seo-coordinator.md`
- **Agent Delegation Matrix:** `.claude/agents/cfn-seo-team/DELEGATION_MATRIX.md`
- **Integration Requirements:** `.claude/agents/cfn-seo-team/INTEGRATION_REQUIREMENTS.md`
- **Validator Guides:**
  - `.claude/agents/cfn-seo-team/seo-validators/humanizer-validator.md`
  - `.claude/agents/cfn-seo-team/seo-validators/branding-validator.md`
  - `.claude/agents/cfn-seo-team/seo-validators/audience-validator.md`

---

## Legacy Mode (9-Step Pipeline)

**When to Use Legacy Mode:**
- Quick turnarounds (24-48 hours vs 3-5 days)
- Cost-sensitive projects ($7-10 vs $15-20)
- Basic content needs (no differentiation required)
- High-volume content generation
- Lower competitive niches

**How to Use Legacy Mode:**
```javascript
// Add --legacy flag to CLI command
/cfn-seo-cli "Write blog post about [topic]" --legacy

// Or manually spawn with original 9-step sequence (see Quick Reference below)
```

**Legacy vs Quality Pipeline Comparison:**

| Feature | Legacy (9-Step) | Quality (11-Step) |
|---------|----------------|-------------------|
| Angle Development | ❌ No | ✅ Yes (Step 5) |
| Depth Injection | ❌ No | ✅ Yes (Step 8) |
| Validators | 4 (equal weights) | 6 (weighted) |
| Voice Validation | ❌ No | ✅ Yes |
| Depth Validation | ❌ No | ✅ Yes |
| Quality Tiers | ❌ No | ✅ Yes |
| Example Mining | Basic | Enhanced (social platforms) |
| Narrative Structure | Basic outline | Story arc |
| Cost | $7-10 | $15-20 |
| Timeline | 1-2 days | 3-5 days |
| Best For | Volume, basic content | Premium, competitive niches |

---

## Quick Reference: Agent Spawning by Step

### 11-Step Quality Pipeline (Recommended)

```javascript
// Step 1: Keyword Research
Task("seo-analytics-specialist", "Keyword research for [topic]")

// Step 2: Competitor Analysis
Task("competitive-seo-analyst", "Analyze top 3 competitors for [keyword]")

// Step 3: SERP Analysis
Task("serp-analyst", "Extract SERP features and PAA for [keyword]")

// Step 4: Deep Research (Enhanced)
Task("research-specialist", `
  Deep research for [topic]:
  - Real examples from Reddit, Quora, Twitter
  - Expert source identification
  - Counter-examples research
`)

// Step 5: Angle Development (NEW)
Task("angle-developer", `
  Develop unique angle for [topic]:
  - Thesis statement
  - Narrative pattern
  - Voice profile
  - Differentiation analysis
`)

// Step 6: Narrative Outline (Enhanced)
Task("content-seo-strategist", `
  Create narrative-driven outline:
  - Story structure (not just headers)
  - Tension point mapping
  - Depth distribution planning
`)

// Step 7: Content Writing (Enhanced)
Task("seo-content-writer", `
  Write content with:
  - Voice profile application
  - Real example integration
  - Narrative adherence
`)

// Step 8: Depth Injection (NEW)
Task("depth-enhancer", `
  Enhance content depth:
  - Expand examples with context
  - Add counter-examples
  - Deepen expert insights
  - Add nuance to claims
`)

// Step 9: SEO Optimization
Task("technical-seo-specialist", "Optimize meta, headers, internal links")

// Step 10: Validation (6 validators in parallel, weighted)
Task("humanizer-validator", "Validate natural writing (weight: 0.15)")
Task("branding-validator", "Validate brand alignment (weight: 0.15)")
Task("audience-validator", "Validate audience fit (weight: 0.15)")
Task("seo-validator", "Validate SEO optimization (weight: 0.15)")
Task("voice-authenticity-validator", "Validate voice profile adherence (weight: 0.20)")
Task("depth-quality-validator", "Validate content depth (weight: 0.25)")

// Step 11: Schema Markup & Publishing
Task("schema-markup-engineer", "Add schema, final formatting, quality tier report")
```

### 9-Step Firecrawl Pipeline (Legacy)

```javascript
// Step 1: Keyword Research
Task("seo-analytics-specialist", "Keyword research for [topic]")

// Step 2: Competitor Analysis (Firecrawl)
Task("competitive-seo-analyst", `
  Analyze competitors for [keyword]
  Use Firecrawl to scrape top 5 SERP results
`)

// Step 3: SERP Analysis (Firecrawl)
Task("serp-analyst", `
  Extract SERP features for [keyword]
  - Featured snippets
  - People Also Ask
  - Image/video packs
  - SERP gaps
`)

// Step 4: Research & Citations (Firecrawl + Perplexity)
Task("research-specialist", `
  Research [topic] with citations
  Use Firecrawl for source scraping
  Use Perplexity for fact synthesis
`)

// Step 5: Content Writing
Task("seo-content-writer", "Write blog post from outline with SERP gaps addressed")

// Step 6: Validation Loop (4 validators in parallel, equal weights)
Task("humanizer-validator", "Validate [article] for natural writing")
Task("branding-validator", "Validate [article] for brand alignment")
Task("audience-validator", "Validate [article] for audience fit")
Task("seo-validator", "Validate [article] for keyword density and structure")

// Step 7: Internal Linking
Task("link-building-specialist", "Add internal links to [article]")

// Step 8: SEO Optimization
Task("seo-optimizer", "Optimize [article] meta, headers, images")

// Step 9: Schema Markup
Task("schema-markup-engineer", "Add schema markup and publish [article]")
```

---

**Version:** 2.0.0 (11-Step Quality-Focused Pipeline)
**Last Updated:** 2025-11-27
**Maintained By:** CFN SEO Team
**Previous Version:** 1.0.0 (9-Step Firecrawl Pipeline - available via --legacy flag)
**Feedback:** Share your SEO pipeline improvements!

---

## Migration Notes (1.0 → 2.0)

**Breaking Changes:**
- Default pipeline is now 11-step (was 9-step)
- Validation uses weighted consensus (was simple average)
- Quality tier reporting added (Premium/Standard/Basic)

**New Agents Required:**
- `angle-developer` (Step 5)
- `depth-enhancer` (Step 8)
- `voice-authenticity-validator` (Step 10)
- `depth-quality-validator` (Step 10)

**Backward Compatibility:**
- Use `--legacy` flag for original 9-step pipeline
- All legacy agents still supported
- Legacy consensus calculation unchanged (simple average)

**When to Upgrade:**
- Competitive niches requiring differentiation
- Premium content/thought leadership
- Brands needing voice consistency
- Content requiring exceptional depth

**When to Stay on Legacy:**
- High-volume content generation
- Cost-sensitive projects
- Quick turnarounds (24-48 hours)
- Basic SEO content needs
