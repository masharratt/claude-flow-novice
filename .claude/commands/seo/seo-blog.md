---
description: "Generate SEO-optimized blog post through 11-step quality-focused pipeline"
argument-hint: "<target keyword> [--brand=BRAND] [--audience=AUDIENCE]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Bash"]
---

# SEO Blog Post Generator - Full Pipeline (Quality-Focused)

Execute complete 11-step SEO content pipeline with angle development, depth injection, and 6-validator consensus ≥0.85.

🚨 **AUTONOMOUS SEO CONTENT GENERATION**

**Target Keyword**: $ARGUMENTS

## SEO Pipeline Structure (11 Steps - Quality-Focused)

```
PHASE A: DISCOVERY (Steps 1-3)
   STEP 1: Keyword Research        → seo-analytics-specialist
      ↓
   STEP 2: Competitor Analysis     → competitive-seo-analyst + Firecrawl 🔥
      ↓
   STEP 3: SERP Analysis           → serp-analyst + Firecrawl 🔥

PHASE B: INTELLIGENCE (Steps 4-5)
   STEP 4: Research ENHANCED       → research-specialist + Firecrawl + Perplexity
      ↓                              (Example mining from Reddit/Quora/Twitter)
   STEP 5: Angle Development 🆕    → angle-developer
                                     (Thesis, narrative pattern, voice profile)

PHASE C: CREATION (Steps 6-7)
   STEP 6: Outline + Narrative Arc → content-seo-strategist
      ↓                              (Story structure, not just headers)
   STEP 7: Content Writing ENHANCED → seo-content-writer
                                      (Voice profile, real examples, narrative adherence)

PHASE D: QUALITY (Steps 8-9)
   STEP 8: Depth Injection 🆕      → depth-enhancer
      ↓                              (Conditionals, tradeoffs, contrarian elements)
   STEP 9: Validation Loop EXPANDED → 6 validators in parallel
                                      (Consensus threshold ≥0.85)

PHASE E: OPTIMIZATION (Steps 10-11)
   STEP 10: Internal Linking + SEO → link-building-specialist + seo-optimizer
      ↓
   STEP 11: Schema Markup          → schema-markup-engineer
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
const pipelineSteps = 11;
const validatorCount = 6;
const consensusThreshold = 0.85;
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
  Pipeline: 11-step Quality-Focused
  Mode: STANDARD (validator: 0.75, consensus: 0.85)

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

  Content Quality (11-Step Pipeline):
  - [ ] Article has unique thesis (from angle-developer)
  - [ ] Article follows narrative pattern
  - [ ] >= 2 real examples with attribution
  - [ ] >= 1 expert quote with credentials
  - [ ] Voice profile applied consistently
  - [ ] Depth score >= 0.80
  - [ ] Natural, human-like writing (humanizer score ≥0.75)
  - [ ] Brand voice alignment (branding score ≥0.75)
  - [ ] Audience persona fit (audience score ≥0.75)
  - [ ] Voice authenticity (voice-authenticity-validator ≥0.75)
  - [ ] Content depth quality (depth-quality-validator ≥0.75)
  - [ ] Consensus ≥0.85 from all 6 validators
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
  11-STEP PIPELINE AGENTS (Quality-Focused)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PHASE A: DISCOVERY
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Step 1 - Keyword Research:
  - seo-analytics-specialist (DataForSEO API)
  - Output: primary keyword, secondaries, search volume, difficulty

  Step 2 - Competitor Analysis (Firecrawl 🔥):
  - competitive-seo-analyst + Firecrawl scraping
  - Crawl top 5 SERP results for content structure
  - Extract: word count, headers, backlinks, content gaps

  Step 3 - SERP Analysis (Firecrawl 🔥):
  - serp-analyst agent
  - Featured snippets, People Also Ask, images
  - Firecrawl for dynamic SERP rendering
  - Output: SERP opportunity map

  PHASE B: INTELLIGENCE
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Step 4 - Research ENHANCED (Firecrawl + Perplexity):
  - research-specialist agent
  - Firecrawl for source page scraping
  - Perplexity API for fact synthesis
  - Example mining from Reddit/Quora/Twitter
  - Output: 5-10 citations with quotes + real-world examples

  Step 5 - Angle Development 🆕:
  - angle-developer agent
  - Create unique thesis statement
  - Define narrative pattern (story arc)
  - Establish voice profile
  - Output: content angle document (thesis + narrative + voice)

  PHASE C: CREATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Step 6 - Outline with Narrative Arc:
  - content-seo-strategist agent
  - Story structure (not just H2 headers)
  - Narrative flow planning
  - Section-by-section purpose mapping

  Step 7 - Content Writing ENHANCED:
  - seo-content-writer (1500-2000 words)
  - Apply voice profile from Step 5
  - Integrate real examples from Step 4
  - Follow narrative arc from Step 6
  - Incorporates SERP gaps from Step 3

  PHASE D: QUALITY
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Step 8 - Depth Injection 🆕:
  - depth-enhancer agent
  - Add conditional statements ("if X, then Y")
  - Inject tradeoff analysis
  - Include contrarian perspectives
  - Nuance and complexity enhancement
  - Output: depth score + enhanced content

  Step 9 - Validation Loop EXPANDED (6 Validators, Parallel):
  - humanizer-validator (natural writing ≥0.75) [weight: 0.15]
  - branding-validator (brand voice ≥0.75) [weight: 0.10]
  - audience-validator (persona fit ≥0.75) [weight: 0.15]
  - seo-validator (keyword density, structure ≥0.75) [weight: 0.15]
  - voice-authenticity-validator 🆕 (consistency ≥0.75) [weight: 0.20]
  - depth-quality-validator 🆕 (depth score ≥0.80) [weight: 0.25]
  - CONSENSUS THRESHOLD: ≥0.85 (weighted average of 6)

  PHASE E: OPTIMIZATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Step 10 - Internal Linking + SEO Optimization:
  - link-building-specialist
  - seo-optimizer
  - Analyze existing content for link opportunities
  - Add 3-5 contextual internal links
  - Meta title/description optimization
  - Header hierarchy validation
  - Image alt text generation

  Step 11 - Schema Markup:
  - schema-markup-engineer
  - Article schema (JSON-LD)
  - FAQ schema from content
  - BreadcrumbList schema
  - Validate with Rich Results Test

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VALIDATION WEIGHTING (6 Validators)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  weights:
    humanizer-validator: 0.15
    branding-validator: 0.10
    audience-validator: 0.15
    seo-validator: 0.15
    voice-authenticity-validator: 0.20
    depth-quality-validator: 0.25

  consensus_threshold: 0.85

  quality_tiers:
    exceptional: ">= 0.95"
    high: ">= 0.90"
    standard: ">= 0.85"

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EXECUTION INSTRUCTIONS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. INVOKE SEO ORCHESTRATOR (11-Step Quality Pipeline):
     ./.claude/skills/seo-orchestration/orchestrate-seo.sh \\
       --task-id "seo-blog-$(date +%s)" \\
       --target-keyword "${keyword}" \\
       --content-type "blog" \\
       --brand "${brand}" \\
       --audience "${audience}" \\
       --mode "standard" \\
       --max-iterations 3 \\
       --word-count 1500-2000 \\
       --enable-firecrawl true \\
       --pipeline-steps 11 \\
       --validators 6 \\
       --consensus-threshold 0.85 \\
       --enable-angle-development true \\
       --enable-depth-injection true

  2. FIRECRAWL INTEGRATION PATTERN:
     # Step 2: Competitor scraping
     firecrawl scrape --url "$COMPETITOR_URL" --format markdown

     # Step 3: SERP rendering
     firecrawl scrape --url "https://google.com/search?q=${keyword}" \\
       --wait-for-selector ".g" --extract-selectors "h3,span"

     # Step 4: Source page extraction
     firecrawl batch-scrape --urls "$SOURCE_URLS" --format markdown

  3. VALIDATION ITERATION PATTERN (6 Validators):
     - Spawn 6 validators in parallel (humanizer, branding, audience, SEO, voice-authenticity, depth-quality)
     - Calculate weighted consensus using validator weights
     - IF consensus < 0.85 && iteration < 3:
       - Collect feedback from all validators
       - Respawn depth-enhancer if depth score low
       - Respawn seo-content-writer with feedback
       - Re-run 6 validators
     - IF consensus ≥ 0.85 || iteration == 3:
       - Report quality tier (exceptional/high/standard)
       - Proceed to Step 10 (internal linking + SEO optimization)

  3. MONITOR PROGRESS (Redis):
     redis-cli GET "seo:task:${TASK_ID}:status"
     redis-cli HGETALL "seo:task:${TASK_ID}:validation:scores"
     redis-cli LRANGE "seo:task:${TASK_ID}:logs" 0 -1

  4. REPORT STRUCTURED RESULT:
     {
       "taskId": "seo-blog-XXXXX",
       "keyword": "${keyword}",
       "pipeline": "11-step",
       "status": "complete|failed",
       "finalArticlePath": "content/blog/YYYY-MM-DD-slug.md",
       "validation": {
         "iterations": N,
         "finalConsensus": 0.XX,
         "qualityTier": "exceptional|high|standard",
         "scores": {
           "humanizer": 0.XX,
           "branding": 0.XX,
           "audience": 0.XX,
           "seo": 0.XX,
           "voiceAuthenticity": 0.XX,
           "depthQuality": 0.XX
         },
         "weights": {
           "humanizer": 0.15,
           "branding": 0.10,
           "audience": 0.15,
           "seo": 0.15,
           "voiceAuthenticity": 0.20,
           "depthQuality": 0.25
         }
       },
       "quality": {
         "thesis": "unique thesis statement",
         "narrativePattern": "story arc type",
         "voiceProfile": "voice characteristics",
         "depthScore": 0.XX,
         "realExamples": N,
         "expertQuotes": N
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

**Sequential Execution (11-Step Pipeline):**
1. Keyword research (DataForSEO API)
2. Competitor analysis (SERP top 5)
3. SERP analysis (Firecrawl)
4. Research & citations ENHANCED (Perplexity + example mining)
5. Angle development (thesis + narrative + voice)
6. Outline with narrative arc (story structure)
7. Content writing ENHANCED (1500-2000 words)
8. Depth injection (conditionals, tradeoffs, contrarian views)
9. **Validation loop** (6 validators, iterate if consensus < 0.85)
10. Internal linking + SEO optimization (meta, links)
11. Publishing prep (schema markup)

**Validation Loop Details (6 Validators - Weighted Consensus):**
```bash
# Spawn 6 validators in parallel
npx cfn-spawn humanizer-validator --task-id $TASK_ID &
npx cfn-spawn branding-validator --task-id $TASK_ID &
npx cfn-spawn audience-validator --task-id $TASK_ID &
npx cfn-spawn seo-validator --task-id $TASK_ID &
npx cfn-spawn voice-authenticity-validator --task-id $TASK_ID &
npx cfn-spawn depth-quality-validator --task-id $TASK_ID &
wait

# Collect scores from Redis
HUMANIZER_SCORE=$(redis-cli HGET "seo:task:${TASK_ID}:validation:scores" "humanizer")
BRANDING_SCORE=$(redis-cli HGET "seo:task:${TASK_ID}:validation:scores" "branding")
AUDIENCE_SCORE=$(redis-cli HGET "seo:task:${TASK_ID}:validation:scores" "audience")
SEO_SCORE=$(redis-cli HGET "seo:task:${TASK_ID}:validation:scores" "seo")
VOICE_AUTH_SCORE=$(redis-cli HGET "seo:task:${TASK_ID}:validation:scores" "voice_authenticity")
DEPTH_QUALITY_SCORE=$(redis-cli HGET "seo:task:${TASK_ID}:validation:scores" "depth_quality")

# Calculate weighted consensus
CONSENSUS=$(echo "scale=2; \
  ($HUMANIZER_SCORE * 0.15) + \
  ($BRANDING_SCORE * 0.10) + \
  ($AUDIENCE_SCORE * 0.15) + \
  ($SEO_SCORE * 0.15) + \
  ($VOICE_AUTH_SCORE * 0.20) + \
  ($DEPTH_QUALITY_SCORE * 0.25)" | bc)

# Determine quality tier
if (( $(echo "$CONSENSUS >= 0.95" | bc -l) )); then
  QUALITY_TIER="exceptional"
elif (( $(echo "$CONSENSUS >= 0.90" | bc -l) )); then
  QUALITY_TIER="high"
elif (( $(echo "$CONSENSUS >= 0.85" | bc -l) )); then
  QUALITY_TIER="standard"
else
  QUALITY_TIER="below_threshold"
fi

# Iterate if needed
if (( $(echo "$CONSENSUS < 0.85" | bc -l) )) && [ $ITERATION -lt 3 ]; then
  # Collect feedback from all 6 validators
  FEEDBACK=$(redis-cli LRANGE "seo:task:${TASK_ID}:validation:feedback" 0 -1)

  # If depth score is low, re-run depth injection
  if (( $(echo "$DEPTH_QUALITY_SCORE < 0.80" | bc -l) )); then
    npx cfn-spawn depth-enhancer \
      --task-id $TASK_ID \
      --context "Add more depth: $FEEDBACK"
  fi

  # Rewrite with feedback
  npx cfn-spawn seo-content-writer \
    --task-id $TASK_ID \
    --context "Rewrite based on feedback: $FEEDBACK"

  # Re-run 6 validators
  # (repeat validation loop)
fi

# After validation passes, proceed to Steps 10-11
npx cfn-spawn link-building-specialist --task-id $TASK_ID  # Step 10a
npx cfn-spawn seo-optimizer --task-id $TASK_ID              # Step 10b
npx cfn-spawn schema-markup-engineer --task-id $TASK_ID     # Step 11
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

## Example Execution (11-Step Quality Pipeline)

```
PHASE A: DISCOVERY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Step 1] Keyword Research - COMPLETE
         → Primary: "preserve family stories" (4,400/month)
         → Competition: 0.45 (medium)
         → Related keywords: 12 identified
         → Search intent: Informational

[Step 2] Competitor Analysis (Firecrawl 🔥) - COMPLETE
         → Top 5 URLs scraped via Firecrawl
         → Average word count: 1,800
         → Header patterns extracted
         → Content gaps: video guides, templates, tools comparison

[Step 3] SERP Analysis (Firecrawl 🔥) - COMPLETE
         → Featured snippet opportunity: "How to record..." format
         → People Also Ask: 8 questions captured
         → Image pack present (need hero image)
         → SERP gap: No video carousel results

PHASE B: INTELLIGENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Step 4] Research ENHANCED (Firecrawl + Perplexity) - COMPLETE
         → 7 sources scraped via Firecrawl
         → 5 citations synthesized via Perplexity
         → 3 statistics with sources
         → Expert quote from StoryCorps
         → 4 real-world examples from Reddit r/genealogy
         → 2 Twitter threads with attribution

[Step 5] Angle Development 🆕 - COMPLETE
         → Thesis: "Family stories aren't just memories—they're survival guides"
         → Narrative pattern: Hero's Journey (struggle → solution → transformation)
         → Voice profile: Warm storyteller, conversational, empathetic
         → Unique angle: Focus on intergenerational wisdom transfer

PHASE C: CREATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Step 6] Outline with Narrative Arc - COMPLETE
         → Story structure: Problem-Agitate-Solution
         → Narrative hooks per section
         → Emotional beats mapped
         → 6 H2 sections with purpose statements

[Step 7] Content Writing ENHANCED - COMPLETE
         → 1,687 words written
         → Voice profile applied (warmth: 92%)
         → 4 real examples integrated with attribution
         → 1 expert quote with credentials
         → Narrative arc maintained throughout

PHASE D: QUALITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Step 8] Depth Injection 🆕 - COMPLETE
         → 7 conditional statements added ("if recording video, consider...")
         → 3 tradeoff analyses (quality vs. convenience)
         → 2 contrarian perspectives (analog vs. digital debate)
         → Depth score: 0.84 ✅

[Step 9] Validation Loop EXPANDED (6 Validators) - Iteration 1/3
         → Humanizer: 0.78 [weight: 0.15] ✅
         → Branding: 0.88 [weight: 0.10] ✅
         → Audience: 0.82 [weight: 0.15] ✅
         → SEO: 0.85 [weight: 0.15] ✅
         → Voice Authenticity: 0.76 [weight: 0.20] ✅
         → Depth Quality: 0.81 [weight: 0.25] ✅
         → Weighted Consensus: 0.808 (below 0.85)
         → Quality Tier: below_threshold
         → IMMEDIATELY rewriting with feedback...

[Step 9] Validation Loop EXPANDED (6 Validators) - Iteration 2/3
         → Humanizer: 0.88 [weight: 0.15] ✅
         → Branding: 0.92 [weight: 0.10] ✅
         → Audience: 0.89 [weight: 0.15] ✅
         → SEO: 0.91 [weight: 0.15] ✅
         → Voice Authenticity: 0.87 [weight: 0.20] ✅
         → Depth Quality: 0.90 [weight: 0.25] ✅
         → Weighted Consensus: 0.888 ✅ PASSED
         → Quality Tier: high

PHASE E: OPTIMIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Step 10] Internal Linking + SEO Optimization - COMPLETE
          → 4 internal links added
          → Link context validated
          → Anchor text optimized
          → Meta title: 58 characters ✅
          → Meta description: 156 characters ✅
          → Header hierarchy: H1→H2→H3 valid
          → 5 images with alt text

[Step 11] Schema Markup - COMPLETE
          → Article schema (JSON-LD) ✅
          → FAQ schema (5 questions) ✅
          → BreadcrumbList schema ✅
          → Rich Results Test: PASSED
          → Final: content/blog/2025-11-01-preserve-family-stories.md
```

## API Credentials Required

Ensure these are in `.env`:

```bash
# Firecrawl (Competitor/SERP Scraping) - REQUIRED for 9-step pipeline
FIRECRAWL_API_KEY=fc-xxxxx

# DataForSEO (Keyword Research + SERP)
DATA_FOR_SEO_API_KEY=base64_encoded_login:password

# Perplexity (Research via OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Optional: Pexels (Stock Images)
PEXELS_API_KEY=xxxxx
```

## Firecrawl Integration Details

```bash
# Install Firecrawl CLI
npm install -g firecrawl

# Verify installation
firecrawl --version

# Test scraping
firecrawl scrape --url "https://example.com" --format markdown
```

**Firecrawl Usage by Step:**
| Step | Firecrawl Function | Rate Limit |
|------|-------------------|------------|
| 2 | `scrape` (5 competitor URLs) | 5 req/min |
| 3 | `scrape` (SERP page) | 1 req/min |
| 4 | `batch-scrape` (source pages) | 10 req/min |

## Output Format

Concise, structured result:

```
✅ SEO Blog Post Complete (11-Step Quality Pipeline)

Keyword: "how to preserve family stories"
Pipeline: 11-step quality-focused
Final Article: content/blog/2025-11-01-preserve-family-stories.md

Quality Results:
- Quality Tier: HIGH (0.888 weighted consensus) ✅
- Thesis: "Family stories aren't just memories—they're survival guides"
- Narrative Pattern: Hero's Journey
- Voice Profile: Warm storyteller, conversational, empathetic
- Depth Score: 0.84 ✅
- Real Examples: 4 (with attribution)
- Expert Quotes: 1 (with credentials)

Validation Results (6 Validators):
- Humanizer: 0.88 [15%] ✅
- Branding: 0.92 [10%] ✅
- Audience: 0.89 [15%] ✅
- SEO: 0.91 [15%] ✅
- Voice Authenticity: 0.87 [20%] ✅
- Depth Quality: 0.90 [25%] ✅
- Weighted Consensus: 0.888 ✅ (2 iterations)

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
# Basic
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
- Common issues: AI phrases, weak brand voice, persona mismatch, low depth score, voice inconsistency
- Check depth score if depth-quality-validator is low
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
