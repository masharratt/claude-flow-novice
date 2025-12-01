---
description: "Generate SEO-optimized blog post through 8-step content pipeline"
argument-hint: "<target keyword> [--brand=BRAND] [--audience=AUDIENCE]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Bash"]
---

# SEO Blog Post Generator - Full Pipeline

Execute complete 8-step SEO content pipeline for blog posts with validation consensus ≥0.95.

🚨 **AUTONOMOUS SEO CONTENT GENERATION**

**Target Keyword**: $ARGUMENTS

## SEO Pipeline Structure (8 Steps)

```
STEP 1: Keyword Research (DataForSEO API)
   ↓
STEP 2: Competitor Analysis (SERP top 5)
   ↓
STEP 3: Outline Generation (H1, H2, H3 structure)
   ↓
STEP 4: Research & Citations (Perplexity API)
   ↓
STEP 5: Content Writing (1500-2000 words)
   ↓
STEP 6: SEO Optimization (meta, internal links, images)
   ↓
STEP 7: Validation Loop (3 validators, consensus ≥0.95)
   ↓
STEP 8: Publishing Prep (schema markup, final formatting)
```

## Execution Pattern

**MANDATORY: Spawn cfn-seo-coordinator agent that manages all orchestration internally.**

The coordinator uses CLI spawning (95% cost savings) via orchestrate-seo.sh skill.

### Step 1: Parse Arguments and Extract Context

```javascript
// Extract keyword from arguments
const args = "$ARGUMENTS";
const keyword = args.split('--')[0].trim();

// Parse optional parameters
const brandMatch = args.match(/--brand[=\s]+([^\s]+)/);
const audienceMatch = args.match(/--audience[=\s]+([^\s]+)/);

const brand = brandMatch ? brandMatch[1] : "default_brand";
const audience = audienceMatch ? audienceMatch[1] : "general";
```

### Step 2: Spawn SEO Coordinator (SINGLE AGENT PATTERN)

```javascript
Task("cfn-seo-coordinator", `
  SEO BLOG POST GENERATION

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  COST OPTIMIZATION - CUSTOM ROUTING (CRITICAL)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ⚠️  IMPORTANT: Enable custom routing for maximum cost savings!

  1. Enable routing (one-time setup):
     /switch-api zai

  2. Verify status:
     /switch-api status

  Cost Breakdown (per blog post):
  ┌─────────────────────┬──────────────┬────────────┐
  │ Component           │ Provider     │ Cost/Call  │
  ├─────────────────────┼──────────────┼────────────┤
  │ Main Chat           │ Anthropic    │ $0.015     │
  │ SEO Coordinator     │ Anthropic    │ $0.015     │
  │ SEO Agents (CLI)    │ Z.ai         │ $0.003 ea  │
  │ Validators (CLI)    │ Z.ai         │ $0.003 ea  │
  └─────────────────────┴──────────────┴────────────┘

  Expected Costs:
  • WITH custom routing:    ~$1.00 per blog post (10 agents)
  • WITHOUT custom routing: ~$15.00 per blog post
  • Savings:                93% cost reduction

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOG POST SPECIFICATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Target Keyword: ${keyword}
  Content Type: blog
  Brand: ${brand}
  Target Audience: ${audience}
  Word Count: 1500-2000
  Task ID: seo-blog-$(date +%s)
  Mode: STANDARD (validator: 0.75, consensus: 0.95)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SUCCESS CRITERIA (BLOG POST REQUIREMENTS)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SEO Requirements:
  - [ ] Target keyword in H1, meta title, meta description
  - [ ] Keyword density 1-2%
  - [ ] 3-5 internal links to related content
  - [ ] 2-3 external authoritative citations
  - [ ] 1 image per 300 words (optimized alt text)
  - [ ] FAQ schema markup included

  Content Quality:
  - [ ] Natural, human-like writing (humanizer score ≥0.75)
  - [ ] Brand voice alignment (branding score ≥0.75)
  - [ ] Audience persona fit (audience score ≥0.75)
  - [ ] Consensus ≥0.95 from all 3 validators
  - [ ] No AI tell-tale phrases
  - [ ] Conversational tone with personal examples

  Structure:
  - [ ] Compelling H1 (target keyword)
  - [ ] Clear H2/H3 hierarchy (5-7 sections)
  - [ ] Introduction with hook
  - [ ] Actionable takeaways
  - [ ] FAQ section (3-5 questions)
  - [ ] Clear CTA

  Technical:
  - [ ] Meta title <60 characters
  - [ ] Meta description 150-160 characters
  - [ ] Schema markup validated
  - [ ] Mobile-friendly formatting

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  8-STEP PIPELINE AGENTS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Step 1 - Keyword Research:
  - seo-analytics-specialist (DataForSEO API)

  Step 2 - Competitor Analysis:
  - competitive-seo-analyst (SERP analysis)

  Step 3 - Outline Generation:
  - content-seo-strategist (H1/H2/H3 structure)

  Step 4 - Research & Citations:
  - Perplexity API via OpenRouter (external)

  Step 5 - Content Writing:
  - content-seo-strategist (1500-2000 words)

  Step 6 - SEO Optimization:
  - technical-seo-specialist (meta, links, images)
  - programmatic-seo-engineer (internal linking)

  Step 7 - Validation Loop (Parallel, Max 3 Iterations):
  - humanizer-validator (natural writing ≥0.75)
  - branding-validator (brand voice ≥0.75)
  - audience-validator (persona fit ≥0.75)
  - CONSENSUS THRESHOLD: ≥0.95

  Step 8 - Publishing Prep:
  - schema-markup-engineer (schema.org markup)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EXECUTION INSTRUCTIONS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. INVOKE SEO ORCHESTRATOR:
     ./.claude/skills/seo-orchestration/orchestrate-seo.sh \\
       --task-id "seo-blog-$(date +%s)" \\
       --target-keyword "${keyword}" \\
       --content-type "blog" \\
       --brand "${brand}" \\
       --audience "${audience}" \\
       --mode "standard" \\
       --max-iterations 3 \\
       --word-count 1500-2000

  2. VALIDATION ITERATION PATTERN:
     - Spawn 3 validators in parallel
     - Calculate consensus (average of 3 scores)
     - IF consensus < 0.95 && iteration < 3:
       - Collect feedback from all validators
       - Respawn content-seo-strategist with feedback
       - Re-run 3 validators
     - IF consensus ≥ 0.95 || iteration == 3:
       - Proceed to Step 8 (publishing prep)

  3. MONITOR PROGRESS (Redis):
     redis-cli GET "seo:task:${TASK_ID}:status"
     redis-cli HGETALL "seo:task:${TASK_ID}:validation:scores"
     redis-cli LRANGE "seo:task:${TASK_ID}:logs" 0 -1

  4. REPORT STRUCTURED RESULT:
     {
       "taskId": "seo-blog-XXXXX",
       "keyword": "${keyword}",
       "status": "complete|failed",
       "finalArticlePath": "content/blog/YYYY-MM-DD-slug.md",
       "validation": {
         "iterations": N,
         "finalConsensus": 0.XX,
         "scores": {
           "humanizer": 0.XX,
           "branding": 0.XX,
           "audience": 0.XX
         }
       },
       "seo": {
         "wordCount": XXXX,
         "keywordDensity": "X.X%",
         "internalLinks": N,
         "externalLinks": N,
         "images": N,
         "schemaMarkup": true
       },
       "recommendations": [...]
     }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CRITICAL RULES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - DO NOT spawn agents with Task()
  - LET orchestrator handle CLI spawning
  - USE Redis for all agent coordination
  - STORE context in seo:task:${TASK_ID}:context
  - RETURN structured result to Main Chat
  - ITERATE automatically on consensus failure (max 3)
`, "cfn-seo-coordinator")
```

### Step 3: Coordinator Autonomous Execution

The coordinator runs orchestrate-seo.sh internally:

**Sequential Execution:**
1. Keyword research (DataForSEO API)
2. Competitor analysis (SERP top 5)
3. Outline creation (H1/H2/H3)
4. Research & citations (Perplexity)
5. Content writing (1500-2000 words)
6. SEO optimization (meta, links)
7. **Validation loop** (3 validators, iterate if consensus < 0.95)
8. Publishing prep (schema markup)

**Validation Loop Details:**
```bash
# Spawn validators in parallel
npx cfn-spawn humanizer-validator --task-id $TASK_ID &
npx cfn-spawn branding-validator --task-id $TASK_ID &
npx cfn-spawn audience-validator --task-id $TASK_ID &
wait

# Collect scores from Redis
HUMANIZER_SCORE=$(redis-cli HGET "seo:task:${TASK_ID}:validation:scores" "humanizer")
BRANDING_SCORE=$(redis-cli HGET "seo:task:${TASK_ID}:validation:scores" "branding")
AUDIENCE_SCORE=$(redis-cli HGET "seo:task:${TASK_ID}:validation:scores" "audience")

# Calculate consensus
CONSENSUS=$(echo "scale=2; ($HUMANIZER_SCORE + $BRANDING_SCORE + $AUDIENCE_SCORE) / 3" | bc)

# Iterate if needed
if (( $(echo "$CONSENSUS < 0.95" | bc -l) )) && [ $ITERATION -lt 3 ]; then
  # Collect feedback
  FEEDBACK=$(redis-cli LRANGE "seo:task:${TASK_ID}:validation:feedback" 0 -1)

  # Rewrite with feedback
  npx cfn-spawn content-seo-strategist \
    --task-id $TASK_ID \
    --context "Rewrite based on feedback: $FEEDBACK"

  # Re-run validators
  # (repeat validation loop)
fi
```

## Autonomous Execution Rules

**YOU ARE FORBIDDEN FROM:**
- ❌ Asking "Should I retry validation?" (ALWAYS retry if iteration < 3)
- ❌ Asking "Proceed to next step?" (AUTO-PROCEED after each step)
- ❌ Waiting for approval during pipeline execution

**YOU MUST:**
- ✅ IMMEDIATELY rewrite on low consensus (iteration < 3)
- ✅ AUTOMATICALLY iterate with validator feedback
- ✅ ONLY escalate when truly blocked (API failure, max iterations)

## Example Execution

```
[Step 1] Keyword Research - COMPLETE
         → Search volume: 4,400/month
         → Competition: 0.45 (medium)
         → Related keywords: 12 identified

[Step 2] Competitor Analysis - COMPLETE
         → Top 5 URLs analyzed
         → Average word count: 1,800
         → Common topics: preservation methods, tools

[Step 3] Outline Generation - COMPLETE
         → H1: "How to Preserve Your Family Stories (2025 Guide)"
         → 6 H2 sections + FAQ
         → Estimated word count: 1,650

[Step 4] Research & Citations - COMPLETE
         → 5 authoritative sources found
         → 3 statistics for credibility

[Step 5] Content Writing - COMPLETE
         → 1,687 words written
         → 1.8% keyword density

[Step 6] SEO Optimization - COMPLETE
         → Meta title: 58 characters
         → Meta description: 156 characters
         → 4 internal links + 3 external

[Step 7] Validation Loop - Iteration 1/3
         → Humanizer: 0.72 ❌ (AI phrases detected)
         → Branding: 0.88 ✅
         → Audience: 0.81 ✅
         → Consensus: 0.80 (below 0.95)
         → IMMEDIATELY rewriting with feedback...

[Step 7] Validation Loop - Iteration 2/3
         → Humanizer: 0.91 ✅
         → Branding: 0.93 ✅
         → Audience: 0.89 ✅
         → Consensus: 0.91 (still below 0.95)
         → IMMEDIATELY rewriting with feedback...

[Step 7] Validation Loop - Iteration 3/3
         → Humanizer: 0.95 ✅
         → Branding: 0.96 ✅
         → Audience: 0.95 ✅
         → Consensus: 0.95 ✅ PASSED

[Step 8] Publishing Prep - COMPLETE
         → Schema markup added (Article + FAQ)
         → Images optimized (5 images)
         → Final article: content/blog/2025-11-01-preserve-family-stories.md
```

## API Credentials Required

Ensure these are in `.env`:

```bash
# DataForSEO (Keyword Research + SERP)
DATA_FOR_SEO_API_KEY=base64_encoded_login:password

# Perplexity (Research via OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Optional: Pexels (Stock Images)
PEXELS_API_KEY=xxxxx
```

## Output Format

Concise, structured result:

```
✅ SEO Blog Post Complete

Keyword: "how to preserve family stories"
Final Article: content/blog/2025-11-01-preserve-family-stories.md

Validation Results:
- Humanizer: 0.95 ✅
- Branding: 0.96 ✅
- Audience: 0.95 ✅
- Consensus: 0.95 ✅ (3 iterations)

SEO Metrics:
- Word Count: 1,687
- Keyword Density: 1.8%
- Internal Links: 4
- External Links: 3
- Images: 5 (optimized)
- Schema: Article + FAQ ✅

Ready for publishing!
```

## Usage Examples

```bash
# Basic (uses default brand/audience)
/seo-blog "how to preserve family stories"

# With brand specification
/seo-blog "how to preserve family stories" --brand=ourstories

# With brand and audience
/seo-blog "genealogy research tips" --brand=ourstories --audience=family_historian

# Long-tail keyword
/seo-blog "best ways to record elderly relatives stories"
```

## Troubleshooting

**Validation fails after 3 iterations:**
- Review validator feedback in Redis: `redis-cli LRANGE "seo:task:${TASK_ID}:validation:feedback" 0 -1`
- Common issues: AI phrases, weak brand voice, persona mismatch
- Manual review required at this point

**API failures:**
- DataForSEO: Check API key encoding (base64)
- Perplexity: Verify OpenRouter credit balance
- Fallback: Use manual keyword research if APIs fail

**Cost concerns:**
- Verify custom routing enabled: `/switch-api status`
- Without Z.ai routing: $15/article vs $1/article

## Related Commands

- `/seo-landing` - Landing page pipeline (6 steps, no competitor analysis)
- `/seo-product` - Product page pipeline (5 steps, schema focus)
- `/seo-local` - Local business content (+ local-seo-optimizer)
