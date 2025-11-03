# SEO Task Mode Guide

**Purpose:** Execute SEO content pipeline using Task() spawning from Main Chat (no coordinator agent)

**When to Use:**
- Debugging SEO pipeline issues
- Learning the 8-step process
- Single-step testing (keyword research only)
- Development of new SEO agents

**Cost:** $5-15 per full pipeline (Anthropic pricing for all agents)

**Alternative:** CLI Mode via `cfn-seo-coordinator` ($1/pipeline with Z.ai routing)

---

## Table of Contents

1. [Quick Start - Full Pipeline](#quick-start-full-pipeline)
2. [8-Step Pipeline Guide](#8-step-pipeline-guide)
3. [Agent Selection by Step](#agent-selection-by-step)
4. [Sprint Workflow](#sprint-workflow)
5. [Validation Loop](#validation-loop)
6. [Single-Step Execution](#single-step-execution)
7. [Content Type Variations](#content-type-variations)
8. [Troubleshooting](#troubleshooting)

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

// Step 4: Research (External - Perplexity API)
// Note: This step uses Perplexity via OpenRouter, not a CFN agent
// Main Chat executes this directly or via a research-helper script

// Step 5: Content Writing
Task("content-seo-strategist", `
  Write blog post following outline: content/outlines/preserve-family-stories-outline.md

  Context:
  - Outline: content/outlines/preserve-family-stories-outline.md
  - Research sources: content/research/family-stories-research.md
  - Brand voice: OurStories (warm, personal, empowering)
  - Target audience: Families, genealogists, memory keepers

  Requirements:
  - 1500-2000 words
  - Conversational, human tone (avoid AI language)
  - Include personal examples/anecdotes
  - Natural keyword integration
  - Engaging introduction
  - Strong CTA at end

  Deliverables:
  - Full blog post draft (markdown)

  Output: content/drafts/preserve-family-stories.md

  Success Criteria:
  - Meets word count target
  - Primary keyword appears 3-5 times naturally
  - Conversational tone (no "delve into", "unlock potential")
  - Clear value proposition
`)

// Step 6: SEO Optimization
Task("technical-seo-specialist", `
  Optimize blog post for technical SEO

  Context:
  - Draft: content/drafts/preserve-family-stories.md
  - Primary keyword: "preserve family stories"
  - Target URL: /blog/preserve-family-stories

  Tasks:
  1. Meta title (50-60 chars, includes primary keyword)
  2. Meta description (150-160 chars, compelling CTA)
  3. Header optimization (H1, H2s include keywords)
  4. Internal linking (3-5 relevant internal links)
  5. Image alt text recommendations
  6. URL slug optimization
  7. Schema markup preparation (for Step 8)

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

// Step 7: Validation (3 Validators in Parallel)
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
`)

// Main Chat collects validator scores and calculates consensus
// IF consensus ≥0.95 → Proceed to Step 8
// IF consensus <0.95 → Iterate (spawn Step 5 again with validator feedback)

// Step 8: Publishing with Schema
Task("schema-markup-engineer", `
  Add schema markup and prepare for publishing

  Context:
  - Article: content/optimized/preserve-family-stories.md
  - URL: https://ourstories.com/blog/preserve-family-stories
  - Author: OurStories Team
  - Published: 2025-11-01

  Tasks:
  1. Add Article schema (JSON-LD)
  2. Add BreadcrumbList schema
  3. Add Organization schema
  4. Validate schema with Google Rich Results Test
  5. Final formatting (headings, lists, bold, italics)

  Deliverables:
  - Final blog post with embedded schema
  - Schema validation report

  Output: content/published/preserve-family-stories.md

  Success Criteria:
  - Valid Article schema (no errors in Rich Results Test)
  - Schema includes all required properties
  - Final formatting polished
`)
```

---

## 8-Step Pipeline Guide

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

### Step 3: Content Outline

**Agent:** `content-seo-strategist`

**Inputs:**
- Keyword research (Step 1)
- Competitor analysis (Step 2)
- Brand voice guidelines
- Target word count

**Outputs:**
- H1 title (SEO-optimized)
- 5-7 H2 sections
- H3 subsections
- Internal linking strategy
- CTA placement

**Success Criteria:**
- Primary keyword in H1
- Secondary keywords in H2s (natural)
- Logical flow (answers user intent)
- Better structure than competitors

**Output File:** `content/outlines/[topic]-outline.md`

---

### Step 4: Research

**Method:** Perplexity API via OpenRouter (no CFN agent)

**Inputs:**
- Content outline (Step 3)
- Research questions (extracted from outline)

**Outputs:**
- Research sources (5-10 credible sources)
- Key facts/statistics
- Expert quotes (if available)
- Data for content support

**Tools:**
- Perplexity API (via OpenRouter)
- Manual research (Google Scholar, industry publications)

**Success Criteria:**
- ≥5 credible sources cited
- Data supports outline sections
- Expert quotes included (where relevant)

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

### Step 5: Content Writing

**Agent:** `content-seo-strategist`

**Inputs:**
- Outline (Step 3)
- Research (Step 4)
- Brand voice guidelines
- Target word count (1500-2000 for blog)

**Outputs:**
- Full blog post draft (markdown)
- Keyword integration (natural)
- Engaging introduction
- Clear CTA

**Success Criteria:**
- Meets word count target
- Conversational tone (no AI language)
- Primary keyword appears 3-5 times naturally
- Includes personal examples/anecdotes
- Clear value proposition

**Output File:** `content/drafts/[topic].md`

---

### Step 6: SEO Optimization

**Agents:** `technical-seo-specialist` + `programmatic-seo-engineer` (optional)

**Inputs:**
- Draft (Step 5)
- Primary keyword
- Target URL

**Tasks:**
1. Meta title (50-60 chars, includes keyword)
2. Meta description (150-160 chars, compelling)
3. Header optimization (H1, H2s)
4. Internal linking (3-5 links)
5. Image alt text
6. URL slug optimization
7. Schema markup preparation

**Success Criteria:**
- Meta title ≤60 chars, includes primary keyword
- Meta description compelling, ≤160 chars
- 3-5 internal links added
- Headers optimized

**Output File:** `content/optimized/[topic].md`

---

### Step 7: Validation

**Agents (Parallel):**
1. `humanizer-validator` (natural writing)
2. `branding-validator` (brand alignment)
3. `audience-validator` (persona fit)

**Inputs:**
- Optimized article (Step 6)
- Iteration number

**Outputs (Per Validator):**
- Confidence score (0.0-1.0)
- Issues found (with line numbers)
- Specific rewrites recommended

**Consensus Calculation:**
```javascript
// Main Chat collects scores
const humanizerScore = 0.85;  // From humanizer-validator output
const brandingScore = 0.90;   // From branding-validator output
const audienceScore = 0.92;   // From audience-validator output

const consensus = (humanizerScore + brandingScore + audienceScore) / 3;
// consensus = 0.89

if (consensus >= 0.95) {
  console.log("✅ Validation passed - Proceed to Step 8");
} else {
  console.log(`🔄 Iteration required - Consensus: ${consensus.toFixed(2)}`);
  // Spawn Step 5 again with validator feedback
}
```

**Thresholds:**
- Individual validator: ≥0.75
- Consensus: ≥0.95

---

### Step 8: Publishing with Schema

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

## Agent Selection by Step

| Step | Primary Agent | Secondary Agent | Use When |
|------|---------------|-----------------|----------|
| 1. Keyword Research | seo-analytics-specialist | - | All content types |
| 2. Competitor Analysis | competitive-seo-analyst | - | Blog posts, competitive niches |
| 3. Content Outline | content-seo-strategist | - | All content types |
| 4. Research | Perplexity API (no agent) | - | Research-heavy content |
| 5. Writing | content-seo-strategist | - | All content types |
| 6. SEO Optimization | technical-seo-specialist | programmatic-seo-engineer | All content, programmatic at scale |
| 7. Validation | humanizer-validator | branding-validator, audience-validator | All content |
| 8. Publishing | schema-markup-engineer | - | All content |

**Additional Specialists (Use When):**
- `local-seo-optimizer` - Location pages, GBP content
- `programmatic-seo-engineer` - Template-based page generation (100+ pages)
- `geo-optimization-expert` - AI search optimization, citation tracking
- `link-building-specialist` - Backlink prospecting (post-publishing)
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

## Quick Reference: Agent Spawning by Step

```javascript
// Step 1
Task("seo-analytics-specialist", "Keyword research for [topic]")

// Step 2
Task("competitive-seo-analyst", "Analyze competitors for [keyword]")

// Step 3
Task("content-seo-strategist", "Create outline for [topic]")

// Step 4 (no agent - API call)
// curl Perplexity API for research

// Step 5
Task("content-seo-strategist", "Write blog post from outline")

// Step 6
Task("technical-seo-specialist", "Optimize [draft] for SEO")

// Step 7 (parallel)
Task("humanizer-validator", "Validate [article] for natural writing")
Task("branding-validator", "Validate [article] for brand alignment")
Task("audience-validator", "Validate [article] for audience fit")

// Step 8
Task("schema-markup-engineer", "Add schema markup and publish [article]")
```

---

**Version:** 1.0.0
**Last Updated:** 2025-11-01
**Maintained By:** CFN SEO Team
**Feedback:** Share your SEO pipeline improvements!
