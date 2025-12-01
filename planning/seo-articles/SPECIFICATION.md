# SEO Article Pipeline Enhancement - Specification Document

**Version:** 1.0.0
**Created:** 2025-11-27
**Status:** Specification Phase

---

## 1. Executive Summary

This specification defines enhancements to transform our 9-step SEO article pipeline into an 11-step quality-focused pipeline that produces articles people actually want to read and share, not just content that ranks.

### Core Problem Statement

> Current pipeline produces SEO-optimized content that is technically correct but forgettable. Articles lack unique angles, narrative structure, authentic voice, and meaningful depth.

### Success Definition

> Every article produced should be something the author would proudly share, that readers would bookmark and return to, and that provides genuine value beyond keyword targeting.

---

## 2. User Stories

### 2.1 Content Creator Stories

**US-001: Unique Angle Generation**
```
AS A content creator
I WANT the pipeline to generate a unique angle/thesis for each article
SO THAT my content stands out from competitors and has a clear point of view

ACCEPTANCE CRITERIA:
- Each article has a one-sentence thesis that differs from top 5 SERP results
- Thesis includes a contrarian element OR unique perspective OR original insight
- Angle is validated before content writing begins
- Angle document includes: thesis, why it's unique, target emotion
```

**US-002: Narrative Structure**
```
AS A content creator
I WANT articles to follow compelling narrative patterns
SO THAT readers stay engaged from beginning to end

ACCEPTANCE CRITERIA:
- Each article has explicit narrative pattern selected (Hero's Journey, PAS, etc.)
- Outline includes tension points and payoff moments
- Story arc is visible in final content structure
- Reader engagement metrics improve (scroll depth, time on page)
```

**US-003: Real Examples**
```
AS A content creator
I WANT articles to include real stories and named sources
SO THAT content feels authentic and credible

ACCEPTANCE CRITERIA:
- Each article includes ≥2 real examples (named people, companies, or studies)
- Examples sourced from Reddit, Quora, expert interviews, case studies
- No generic "for example, imagine a person who..." constructions
- Expert quotes include name, title, and source
```

**US-004: Authentic Voice**
```
AS A content creator
I WANT articles to sound like a knowledgeable human wrote them
SO THAT readers connect with the content emotionally

ACCEPTANCE CRITERIA:
- Voice profile defined before writing (formality, humor, opinion strength)
- Sentence length varies (std dev ≥5 words)
- Questions appear ≥1 per 500 words
- Strong opinions expressed (not hedging language)
- First/second person used naturally
- New voice-authenticity-validator passes (≥0.80)
```

**US-005: Meaningful Depth**
```
AS A content creator
I WANT articles to provide expert-level insights, not surface coverage
SO THAT readers learn something they can't find elsewhere

ACCEPTANCE CRITERIA:
- Articles include ≥5 conditional statements ("if X, then Y, unless Z")
- Articles include ≥3 tradeoff acknowledgments
- Articles include ≥1 contrarian or surprising insight
- Articles include ≥2 "what most people get wrong" elements
- New depth-quality-validator passes (≥0.80)
```

### 2.2 Editor/Quality Stories

**US-006: Quality Validation**
```
AS AN editor
I WANT automated validation that catches quality issues before publishing
SO THAT I don't have to manually review every article for depth and voice

ACCEPTANCE CRITERIA:
- 6-validator system (4 existing + 2 new quality validators)
- voice-authenticity-validator implemented and integrated
- depth-quality-validator implemented and integrated
- Overall quality score ≥0.85 required for publishing
- Quality tier classification (exceptional/high/standard/needs improvement)
```

**US-007: Quality Metrics Dashboard**
```
AS AN editor
I WANT to track quality metrics over time
SO THAT I can measure improvement and identify patterns

ACCEPTANCE CRITERIA:
- Quality scores logged per article
- Trends visible over time
- Comparison between pipeline versions (A/B)
- Correlation with engagement metrics (when available)
```

### 2.3 Reader Stories

**US-008: Actionable Value**
```
AS A reader
I WANT articles that give me specific, actionable guidance
SO THAT I can actually implement what I learn

ACCEPTANCE CRITERIA:
- Each article has clear "do this" recommendations (not just information)
- Recommendations include specific tools, numbers, or steps
- "Next step" or CTA is relevant and helpful (not just sales)
- Tradeoffs and edge cases addressed
```

**US-009: Memorable Content**
```
AS A reader
I WANT articles that I remember and want to share
SO THAT I can reference them later and share with others

ACCEPTANCE CRITERIA:
- Article has ≥1 "quotable" insight or statistic
- Unique angle is clear within first 100 words
- Emotional hook in introduction
- Content passes "would I share this?" subjective test
```

### 2.4 System Stories

**US-010: Pipeline Integration**
```
AS A system operator
I WANT the enhanced pipeline to integrate with existing CFN Loop infrastructure
SO THAT I can use existing tooling and workflows

ACCEPTANCE CRITERIA:
- New steps integrate with existing slash commands
- New validators follow existing validator patterns
- Cost tracking works for new steps
- Redis coordination (CLI mode) supports new steps
- Task mode supports new steps
```

**US-011: Backward Compatibility**
```
AS A system operator
I WANT the ability to run original 9-step pipeline if needed
SO THAT I can compare results or handle edge cases

ACCEPTANCE CRITERIA:
- Original pipeline still accessible via flag (--legacy or --mode=seo-only)
- New pipeline is default
- Clear documentation on when to use each
```

---

## 3. Functional Requirements

### 3.1 New Pipeline Steps

#### FR-001: Angle Development Step (Step 5)

**Input:**
- Keyword research results (Step 1)
- Competitor analysis (Step 2)
- SERP analysis (Step 3)
- Research findings (Step 4)

**Process:**
1. Analyze competitor angles (what thesis does each top result have?)
2. Identify conventional wisdom on topic
3. Generate contrarian/unique perspectives (3-5 options)
4. Select strongest angle based on:
   - Differentiation from competitors
   - Supportability with research
   - Emotional resonance potential
   - Brand alignment
5. Formulate one-sentence thesis
6. Select narrative pattern
7. Define voice profile

**Output:**
```yaml
angle_document:
  thesis: "string - one sentence capturing unique contribution"
  why_unique: "string - how this differs from competitors"
  contrarian_element: "string - what conventional wisdom we're challenging"
  narrative_pattern: "hero_journey|pas|bab|case_study|inverted_pyramid"
  target_emotion: "curiosity|fear|hope|urgency|empowerment"
  voice_profile:
    formality: 1-10
    humor: 1-10
    opinion_strength: 1-10
    personal_disclosure: 1-10
  headline_options:
    - "headline 1"
    - "headline 2"
    - "headline 3"
```

**Agent:** `angle-developer` (new agent)

#### FR-002: Enhanced Research Step (Step 4)

**Additional Capabilities:**
1. Example Mining
   - Reddit thread scraping (via Firecrawl)
   - Quora answer extraction
   - Twitter/X expert thread identification
   - Podcast transcript search

2. Expert Source Identification
   - Named authorities on topic
   - Credentials and affiliations
   - Quotable statements

3. Counter-Example Research
   - Failure stories
   - What happens when you don't follow advice
   - Cautionary tales

**Output Enhancement:**
```yaml
research_document:
  facts: [...]  # existing
  citations: [...]  # existing

  # NEW
  real_examples:
    - source: "reddit/r/genealogy"
      story: "User experience with family story recording"
      quotable: "direct quote"
      url: "link"
    - source: "expert_interview"
      person: "Name, Title, Organization"
      insight: "key insight"

  counter_examples:
    - scenario: "what went wrong"
      lesson: "what to learn"
      source: "where found"

  expert_sources:
    - name: "Expert Name"
      credentials: "Title, Organization"
      quote: "Quotable statement"
      topic_relevance: "how they relate to topic"
```

**Agent:** `research-specialist` (enhanced)

#### FR-003: Depth Injection Step (Step 8)

**Input:**
- Draft article (from Step 7)
- Angle document (from Step 5)
- Research document (from Step 4)

**Process:**
1. Analyze draft for depth gaps
2. Identify statements that need conditionals
3. Add "unless" and "except when" qualifiers
4. Strengthen causal explanations ("because")
5. Insert tradeoff acknowledgments
6. Add contrarian insights from angle document
7. Inject first-hand perspective or opinion
8. Ensure edge cases addressed

**Output:**
- Enhanced draft with depth markers
- Depth audit report showing what was added

**Agent:** `depth-enhancer` (new agent)

### 3.2 New Validators

#### FR-004: Voice Authenticity Validator

**Checks:**
| Check | Threshold | Weight |
|-------|-----------|--------|
| Sentence length std dev | ≥5 words | 0.20 |
| Question frequency | ≥1 per 500 words | 0.15 |
| First/second person count | ≥10 instances | 0.15 |
| Opinion marker presence | ≥5 instances | 0.20 |
| Emotional language | ≥3 instances | 0.15 |
| Specificity (named entities) | ≥5 instances | 0.15 |

**Score Calculation:**
```python
def calculate_voice_score(article):
    scores = {
        'rhythm': check_sentence_variation(article),
        'engagement': check_questions(article),
        'person': check_first_second_person(article),
        'opinion': check_opinion_markers(article),
        'emotion': check_emotional_language(article),
        'specificity': check_named_entities(article)
    }

    weighted = (
        scores['rhythm'] * 0.20 +
        scores['engagement'] * 0.15 +
        scores['person'] * 0.15 +
        scores['opinion'] * 0.20 +
        scores['emotion'] * 0.15 +
        scores['specificity'] * 0.15
    )

    return weighted
```

**Pass Threshold:** ≥0.80

**Agent:** `voice-authenticity-validator` (new agent)

#### FR-005: Depth Quality Validator

**Checks:**
| Check | Threshold | Weight |
|-------|-----------|--------|
| Conditional statements | ≥5 | 0.20 |
| Causal explanations | ≥10 | 0.20 |
| Tradeoff language | ≥3 | 0.20 |
| Expert/experience markers | ≥2 | 0.15 |
| Contrarian claims | ≥1 | 0.15 |
| Edge case handling | ≥2 | 0.10 |

**Score Calculation:**
```python
def calculate_depth_score(article):
    checks = {
        'conditionals': count_conditionals(article),  # if, unless, when, except
        'causals': count_causals(article),  # because, since, due to, therefore
        'tradeoffs': count_tradeoffs(article),  # however, but, trade-off, downside
        'expertise': count_expertise_markers(article),  # in my experience, I've found
        'contrarian': count_contrarian(article),  # most people think, actually, surprising
        'edge_cases': count_edge_cases(article)  # edge case, exception, corner case
    }

    scores = {
        'conditionals': min(1.0, checks['conditionals'] / 5),
        'causals': min(1.0, checks['causals'] / 10),
        'tradeoffs': min(1.0, checks['tradeoffs'] / 3),
        'expertise': min(1.0, checks['expertise'] / 2),
        'contrarian': min(1.0, checks['contrarian'] / 1),
        'edge_cases': min(1.0, checks['edge_cases'] / 2)
    }

    weighted = (
        scores['conditionals'] * 0.20 +
        scores['causals'] * 0.20 +
        scores['tradeoffs'] * 0.20 +
        scores['expertise'] * 0.15 +
        scores['contrarian'] * 0.15 +
        scores['edge_cases'] * 0.10
    )

    return weighted
```

**Pass Threshold:** ≥0.80

**Agent:** `depth-quality-validator` (new agent)

### 3.3 Enhanced Existing Steps

#### FR-006: Enhanced Content Writing (Step 7)

**New Inputs:**
- Angle document (thesis, narrative pattern, voice profile)
- Real examples from research
- Expert quotes from research

**New Requirements:**
- Follow selected narrative pattern structure
- Apply voice profile settings
- Integrate real examples (not generic)
- Include expert quotes with attribution
- Build toward thesis throughout

**Agent:** `seo-content-writer` (enhanced prompt)

#### FR-007: Enhanced Outline Step (Step 6)

**New Outputs:**
- Narrative arc mapping (not just H2 list)
- Tension points identified
- Payoff moments planned
- Depth distribution specified

**Structure:**
```yaml
outline:
  narrative_pattern: "hero_journey"

  sections:
    - type: "hook"
      content: "Opening that creates tension"
      word_target: 100

    - type: "problem"
      heading: "H2: The Problem"
      tension: "Establish stakes"
      word_target: 200
      depth_level: "surface"

    - type: "failed_attempts"
      heading: "H2: What Doesn't Work"
      content_notes: "Common approaches that fail"
      word_target: 300
      depth_level: "practical"
      real_examples: ["example_1_id", "example_2_id"]

    - type: "discovery"
      heading: "H2: The Better Approach"
      content_notes: "The contrarian insight"
      word_target: 400
      depth_level: "expert"
      expert_quotes: ["quote_1_id"]

    - type: "transformation"
      heading: "H2: How to Apply This"
      content_notes: "Actionable steps"
      word_target: 400
      depth_level: "nuanced"
      conditionals_needed: 3

    - type: "resolution"
      heading: "H2: The Results You'll See"
      content_notes: "Payoff and motivation"
      word_target: 200
      depth_level: "practical"

  faq:
    source: "paa_questions"
    count: 5

  cta:
    type: "next_step"
    content: "Specific action reader should take"
```

**Agent:** `content-seo-strategist` (enhanced prompt)

---

## 4. Non-Functional Requirements

### NFR-001: Performance

| Metric | Current | Target |
|--------|---------|--------|
| Pipeline duration | 15-30 min | 20-40 min |
| LLM calls per article | 15-20 | 22-28 |
| Cost per article | $1-2 | $1.50-3 |

**Acceptable trade-off:** 40-50% cost increase for significant quality improvement.

### NFR-002: Quality Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Overall quality score | ~0.85 | ≥0.90 |
| Time on page | Baseline | +20% |
| Scroll depth | ~50% | 70%+ |
| Social shares | Baseline | +30% |
| Backlinks | Baseline | +50% |

### NFR-003: Compatibility

- Must integrate with existing CFN Loop infrastructure
- Must support both CLI mode and Task mode
- Must work with existing provider routing
- Must maintain backward compatibility with 9-step pipeline

### NFR-004: Observability

- All new steps must log to standard CFN logging
- Quality scores must be tracked and stored
- Pipeline metrics must be exportable for analysis

---

## 5. Technical Architecture

### 5.1 New Agent Specifications

```yaml
new_agents:
  - name: angle-developer
    type: Loop 3 Implementer
    tools: [Read, Write, Bash, Grep]
    inputs:
      - keyword_research
      - competitor_analysis
      - serp_analysis
      - research_findings
    outputs:
      - angle_document.yaml
    success_criteria:
      - thesis_uniqueness >= 0.80
      - narrative_pattern_selected
      - voice_profile_defined

  - name: depth-enhancer
    type: Loop 3 Implementer
    tools: [Read, Write, Edit]
    inputs:
      - draft_article
      - angle_document
      - research_document
    outputs:
      - enhanced_article.md
      - depth_audit_report.json
    success_criteria:
      - conditionals_added >= 3
      - tradeoffs_added >= 2
      - contrarian_strengthened

  - name: voice-authenticity-validator
    type: Loop 2 Validator
    tools: [Read]
    inputs:
      - article_content
    outputs:
      - validation_score
      - validation_feedback
    success_criteria:
      - score >= 0.80

  - name: depth-quality-validator
    type: Loop 2 Validator
    tools: [Read]
    inputs:
      - article_content
    outputs:
      - validation_score
      - validation_feedback
    success_criteria:
      - score >= 0.80
```

### 5.2 Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE A: DISCOVERY                           │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: Keyword Research (seo-analytics-specialist)            │
│     ↓                                                           │
│  Step 2: Competitor Analysis (competitive-seo-analyst)          │
│     ↓                                                           │
│  Step 3: SERP Analysis (serp-analyst + Firecrawl)              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE B: INTELLIGENCE                        │
├─────────────────────────────────────────────────────────────────┤
│  Step 4: Research ENHANCED (research-specialist + Firecrawl)    │
│          + Example mining (Reddit, Quora, Twitter)              │
│          + Expert source identification                         │
│          + Counter-example research                             │
│     ↓                                                           │
│  Step 5: ANGLE DEVELOPMENT [NEW] (angle-developer)              │
│          - Thesis formulation                                   │
│          - Narrative pattern selection                          │
│          - Voice profile definition                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE C: CREATION                            │
├─────────────────────────────────────────────────────────────────┤
│  Step 6: Outline with Narrative Arc (content-seo-strategist)    │
│          - Story structure, not just headers                    │
│          - Tension points mapped                                │
│     ↓                                                           │
│  Step 7: Content Writing ENHANCED (seo-content-writer)          │
│          - Write to narrative arc                               │
│          - Apply voice profile                                  │
│          - Integrate real examples                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE D: QUALITY                             │
├─────────────────────────────────────────────────────────────────┤
│  Step 8: DEPTH INJECTION [NEW] (depth-enhancer)                 │
│          - Add conditionals, tradeoffs                          │
│          - Strengthen contrarian elements                       │
│     ↓                                                           │
│  Step 9: Validation Loop EXPANDED (6 validators parallel)       │
│          - humanizer-validator                                  │
│          - branding-validator                                   │
│          - audience-validator                                   │
│          - seo-validator                                        │
│          - voice-authenticity-validator [NEW]                   │
│          - depth-quality-validator [NEW]                        │
│          Consensus: ≥0.85 (weighted average)                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE E: OPTIMIZATION                        │
├─────────────────────────────────────────────────────────────────┤
│  Step 10: Internal Linking + SEO (link-building + seo-optimizer)│
│     ↓                                                           │
│  Step 11: Schema Markup + Publishing (schema-markup-engineer)   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Validation Weighting

```yaml
validation_weights:
  humanizer-validator: 0.15
  branding-validator: 0.10
  audience-validator: 0.15
  seo-validator: 0.15
  voice-authenticity-validator: 0.20  # Higher for quality
  depth-quality-validator: 0.25       # Highest for depth

consensus_threshold: 0.85

quality_tiers:
  exceptional: ">= 0.95"
  high: ">= 0.90"
  standard: ">= 0.85"
  needs_improvement: "< 0.85"
```

---

## 6. Acceptance Tests

### AT-001: Angle Development

**Given:** Keyword "how to preserve family stories" with competitor analysis
**When:** Angle development step runs
**Then:**
- Thesis differs from all top 5 competitors
- Thesis contains contrarian or unique element
- Narrative pattern is selected and documented
- Voice profile has all required fields

### AT-002: Real Examples

**Given:** Research step for family stories topic
**When:** Enhanced research completes
**Then:**
- ≥2 real examples with named sources
- ≥1 expert quote with credentials
- ≥1 counter-example (failure story)
- No generic "imagine a person" examples

### AT-003: Voice Authenticity

**Given:** Completed article draft
**When:** voice-authenticity-validator runs
**Then:**
- Sentence length std dev ≥5
- Questions present ≥1 per 500 words
- First/second person ≥10 instances
- Score ≥0.80

### AT-004: Depth Quality

**Given:** Completed article after depth injection
**When:** depth-quality-validator runs
**Then:**
- Conditional statements ≥5
- Causal explanations ≥10
- Tradeoff acknowledgments ≥3
- Contrarian claims ≥1
- Score ≥0.80

### AT-005: End-to-End Quality

**Given:** Full 11-step pipeline execution
**When:** All steps complete
**Then:**
- Overall quality score ≥0.85
- Article has clear thesis in first 100 words
- Article follows selected narrative pattern
- Article contains real examples
- Article demonstrates depth (conditionals, tradeoffs)

### AT-006: Backward Compatibility

**Given:** --legacy flag passed to pipeline
**When:** Pipeline executes
**Then:**
- Original 9-step pipeline runs
- New steps skipped
- Original 4-validator system used
- Output matches original pipeline format

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)
- Create new agent profiles (angle-developer, depth-enhancer, voice-authenticity-validator, depth-quality-validator)
- Define agent prompts and success criteria
- Create unit tests for validators

### Phase 2: Integration (Week 2)
- Integrate new steps into pipeline flow
- Update slash commands
- Implement validation weighting
- Add CLI and Task mode support

### Phase 3: Enhancement (Week 3)
- Enhance research step (example mining)
- Enhance outline step (narrative arc)
- Enhance content writing step (voice profile)
- Update existing agent prompts

### Phase 4: Testing & Refinement (Week 4)
- Run A/B tests (10 articles each pipeline)
- Measure quality metrics
- Refine validator thresholds
- Documentation and training

---

## 8. Success Metrics

### Short-term (30 days)
- [ ] All new agents created and functional
- [ ] Pipeline executes end-to-end
- [ ] Quality scores average ≥0.88
- [ ] No regressions in SEO metrics

### Medium-term (90 days)
- [ ] Time on page +15% vs baseline
- [ ] Scroll depth 65%+
- [ ] Social shares +20% vs baseline
- [ ] Quality scores average ≥0.90

### Long-term (180 days)
- [ ] Backlinks +40% vs baseline
- [ ] Organic traffic maintained or improved
- [ ] Quality scores consistently ≥0.90
- [ ] Cost per quality article optimized

---

## 9. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Increased cost not justified by quality | High | Medium | A/B test before full rollout |
| New validators too strict | Medium | Medium | Tunable thresholds, gradual rollout |
| Angle development slows pipeline | Medium | Low | Parallel processing where possible |
| Example mining hits rate limits | Low | Medium | Caching, fallback to existing examples |
| Backward compatibility issues | High | Low | Comprehensive testing, --legacy flag |

---

## 10. Appendix

### A. Narrative Patterns Reference

1. **Hero's Journey:** Hook → Problem → Failed attempts → Discovery → Transformation → Resolution
2. **Problem-Agitate-Solve:** Problem → Agitation → Solution
3. **Before/After/Bridge:** Before state → After state → How to get there
4. **Case Study:** Situation → Challenge → Action → Result → Lessons
5. **Inverted Pyramid + Depth:** Key insight → Evidence → Deep dives → Implications

### B. Voice Profile Defaults by Brand

```yaml
brand_voice_profiles:
  default:
    formality: 5
    humor: 3
    opinion_strength: 6
    personal_disclosure: 4

  professional:
    formality: 7
    humor: 2
    opinion_strength: 5
    personal_disclosure: 2

  casual:
    formality: 3
    humor: 5
    opinion_strength: 7
    personal_disclosure: 6
```

### C. Depth Level Definitions

| Level | Description | Example |
|-------|-------------|---------|
| Surface | What is X? | "Family stories are narratives passed down..." |
| Overview | How does X work? | "Recording family stories involves..." |
| Practical | How do I do X? | "To record family stories, follow these steps..." |
| Nuanced | When X vs Y? | "Audio recording works best for..., while video is better when..." |
| Expert | What do people get wrong? | "Most people start with the wrong questions..." |
| Contrarian | Why conventional wisdom is wrong | "Forget the 'interview' format—here's why casual conversation captures better stories..." |

---

**Document Status:** Ready for Implementation Plan
**Next Step:** Create IMPLEMENTATION_PLAN.md with detailed tasks
