# SEO Article Pipeline Enhancement - Implementation Plan

**Version:** 1.0.0
**Created:** 2025-11-27
**Spec Reference:** ./SPECIFICATION.md
**Status:** Ready for Execution

---

## Implementation Overview

### Scope

Transform 9-step SEO pipeline into 11-step quality-focused pipeline:
- 4 new agents to create
- 2 existing agents to enhance
- 2 slash commands to update
- Integration testing

### Execution Strategy

**Mode:** Task Mode (for visibility and debugging)
**Parallelization:** Where possible, spawn subagents in parallel
**Validation:** Test each component before integration

---

## Task Breakdown

### Sprint 1: New Agent Creation (Parallel)

Create 4 new agents simultaneously:

| Task ID | Agent | Priority | Dependencies | Subagent Type |
|---------|-------|----------|--------------|---------------|
| T1.1 | angle-developer | HIGH | None | agent-builder |
| T1.2 | depth-enhancer | HIGH | None | agent-builder |
| T1.3 | voice-authenticity-validator | HIGH | None | agent-builder |
| T1.4 | depth-quality-validator | HIGH | None | agent-builder |

#### T1.1: Create angle-developer Agent

**Location:** `.claude/agents/cfn-seo-team/angle-developer.md`

**Prompt Specification:**
```yaml
name: angle-developer
type: Loop 3 Implementer
description: >
  Develops unique angles and thesis statements for SEO articles.
  Ensures content has a distinct point of view that differentiates
  from competitors.

tools:
  - Read
  - Write
  - Bash
  - Grep

inputs:
  - keyword_research_path
  - competitor_analysis_path
  - serp_analysis_path
  - research_findings_path

outputs:
  - angle_document.yaml

process:
  1. Analyze competitor angles (what thesis does each have?)
  2. Identify conventional wisdom on topic
  3. Generate 3-5 contrarian/unique perspectives
  4. Select strongest angle based on:
     - Differentiation score
     - Supportability with research
     - Emotional resonance potential
  5. Formulate one-sentence thesis
  6. Select narrative pattern
  7. Define voice profile
  8. Generate 3 headline options

validation:
  - thesis_uniqueness: "Must differ from all competitor theses"
  - narrative_selected: "Must be valid pattern"
  - voice_profile_complete: "All fields populated"

output_format: |
  angle_document:
    thesis: "[one sentence thesis]"
    why_unique: "[differentiation explanation]"
    contrarian_element: "[what conventional wisdom we challenge]"
    conventional_wisdom: "[what most articles say]"
    narrative_pattern: "[hero_journey|pas|bab|case_study|inverted_pyramid]"
    target_emotion: "[curiosity|fear|hope|urgency|empowerment]"
    voice_profile:
      formality: [1-10]
      humor: [1-10]
      opinion_strength: [1-10]
      personal_disclosure: [1-10]
    headline_options:
      - "[headline 1]"
      - "[headline 2]"
      - "[headline 3]"
```

#### T1.2: Create depth-enhancer Agent

**Location:** `.claude/agents/cfn-seo-team/depth-enhancer.md`

**Prompt Specification:**
```yaml
name: depth-enhancer
type: Loop 3 Implementer
description: >
  Enhances article drafts with meaningful depth: conditionals,
  tradeoffs, contrarian insights, and expert perspective.

tools:
  - Read
  - Write
  - Edit

inputs:
  - draft_article_path
  - angle_document_path
  - research_document_path

outputs:
  - enhanced_article.md
  - depth_audit_report.json

process:
  1. Analyze draft for depth gaps
  2. Identify statements needing conditionals ("unless", "except when")
  3. Find claims needing causal explanation ("because")
  4. Add tradeoff acknowledgments ("however", "the downside is")
  5. Strengthen contrarian elements from angle document
  6. Inject first-hand perspective markers
  7. Ensure edge cases addressed
  8. Generate audit report

enhancements:
  conditionals:
    target: ">= 5"
    patterns:
      - "if X, then Y"
      - "unless Z"
      - "except when"
      - "depending on"

  causals:
    target: ">= 10"
    patterns:
      - "because"
      - "since"
      - "due to"
      - "as a result"
      - "therefore"

  tradeoffs:
    target: ">= 3"
    patterns:
      - "however"
      - "on the other hand"
      - "the trade-off is"
      - "the downside"
      - "but consider"

  contrarian:
    target: ">= 1"
    patterns:
      - "Most people think X, but actually"
      - "Contrary to popular belief"
      - "The surprising truth is"

  expertise:
    target: ">= 2"
    patterns:
      - "In my experience"
      - "I've found that"
      - "What I've learned is"
      - "Based on [source]"
```

#### T1.3: Create voice-authenticity-validator Agent

**Location:** `.claude/agents/cfn-seo-team/seo-validators/voice-authenticity-validator.md`

**Prompt Specification:**
```yaml
name: voice-authenticity-validator
type: Loop 2 Validator
description: >
  Validates that article content sounds authentically human,
  with varied rhythm, engagement, and personality.

tools:
  - Read

inputs:
  - article_content_path

outputs:
  - confidence: float (0.0-1.0)
  - feedback: list of issues with line numbers
  - recommendations: list of specific fixes

checks:
  sentence_variation:
    description: "Sentence length should vary (std dev >= 5 words)"
    weight: 0.20
    measurement: "Calculate std dev of sentence lengths"
    pass_threshold: 5.0

  question_frequency:
    description: "Questions engage readers (>= 1 per 500 words)"
    weight: 0.15
    measurement: "Count sentences ending in ?"
    pass_threshold: "word_count / 500"

  person_usage:
    description: "First/second person creates connection"
    weight: 0.15
    measurement: "Count I, we, you, your instances"
    pass_threshold: 10

  opinion_markers:
    description: "Strong opinions show personality"
    weight: 0.20
    measurement: "Count: I think, should, best, worst, recommend"
    pass_threshold: 5

  emotional_language:
    description: "Emotional words create engagement"
    weight: 0.15
    measurement: "Count emotion words (exciting, frustrating, surprising)"
    pass_threshold: 3

  specificity:
    description: "Named entities show expertise"
    weight: 0.15
    measurement: "Count proper nouns, numbers, specific references"
    pass_threshold: 5

score_calculation: |
  score = (
    sentence_variation_score * 0.20 +
    question_score * 0.15 +
    person_score * 0.15 +
    opinion_score * 0.20 +
    emotion_score * 0.15 +
    specificity_score * 0.15
  )

pass_threshold: 0.80
```

#### T1.4: Create depth-quality-validator Agent

**Location:** `.claude/agents/cfn-seo-team/seo-validators/depth-quality-validator.md`

**Prompt Specification:**
```yaml
name: depth-quality-validator
type: Loop 2 Validator
description: >
  Validates that article content has meaningful depth:
  conditionals, causal explanations, tradeoffs, and insights.

tools:
  - Read

inputs:
  - article_content_path

outputs:
  - confidence: float (0.0-1.0)
  - feedback: list of issues
  - recommendations: list of specific fixes

checks:
  conditionals:
    description: "Conditional statements show nuance"
    weight: 0.20
    patterns: ["if", "unless", "when", "except", "depending"]
    pass_threshold: 5

  causals:
    description: "Causal explanations show understanding"
    weight: 0.20
    patterns: ["because", "since", "due to", "therefore", "as a result"]
    pass_threshold: 10

  tradeoffs:
    description: "Tradeoff acknowledgments show honesty"
    weight: 0.20
    patterns: ["however", "but", "trade-off", "downside", "on the other hand"]
    pass_threshold: 3

  expertise:
    description: "Experience markers show authority"
    weight: 0.15
    patterns: ["in my experience", "I've found", "based on", "research shows"]
    pass_threshold: 2

  contrarian:
    description: "Contrarian insights show original thinking"
    weight: 0.15
    patterns: ["most people think", "actually", "surprising", "contrary to"]
    pass_threshold: 1

  edge_cases:
    description: "Edge case handling shows thoroughness"
    weight: 0.10
    patterns: ["edge case", "exception", "corner case", "special situation"]
    pass_threshold: 2

score_calculation: |
  score = (
    conditionals_score * 0.20 +
    causals_score * 0.20 +
    tradeoffs_score * 0.20 +
    expertise_score * 0.15 +
    contrarian_score * 0.15 +
    edge_cases_score * 0.10
  )

pass_threshold: 0.80
```

---

### Sprint 2: Agent Enhancement

Enhance existing agents to support new pipeline:

| Task ID | Agent | Change | Subagent Type |
|---------|-------|--------|---------------|
| T2.1 | research-specialist | Add example mining | agent-builder |
| T2.2 | content-seo-strategist | Add narrative arc | agent-builder |
| T2.3 | seo-content-writer | Add voice profile support | agent-builder |

#### T2.1: Enhance research-specialist

**Changes:**
1. Add example mining from Reddit, Quora, Twitter
2. Add expert source identification
3. Add counter-example research
4. Update output format

**New Sections in Prompt:**
```yaml
example_mining:
  sources:
    - reddit:
        subreddits: ["relevant_subreddit"]
        search_terms: ["keyword variations"]
        extract: ["personal stories", "experiences", "lessons learned"]
    - quora:
        topics: ["topic_keywords"]
        extract: ["detailed answers", "personal experiences"]
    - twitter:
        experts: ["@handles of known experts"]
        hashtags: ["#relevant_tags"]
        extract: ["insights", "hot takes", "threads"]

  output_format:
    real_examples:
      - source: "platform/location"
        story: "summarized experience"
        quotable: "direct quote if available"
        url: "source link"
        authenticity_score: 0.0-1.0

expert_identification:
  criteria:
    - published_author: true
    - credentials: "relevant title/organization"
    - citations: ">= 10 in field"
  output_format:
    experts:
      - name: "Full Name"
        credentials: "Title, Organization"
        expertise_area: "specific topic"
        quotable_insight: "key quote"
        source: "where found"

counter_examples:
  purpose: "Find failure stories to add credibility"
  output_format:
    counter_examples:
      - scenario: "what went wrong"
        cause: "why it failed"
        lesson: "what to learn"
        source: "where found"
```

#### T2.2: Enhance content-seo-strategist

**Changes:**
1. Accept angle_document as input
2. Generate narrative arc outline (not just headers)
3. Map tension points and payoffs
4. Specify depth distribution per section

**New Outline Format:**
```yaml
outline:
  thesis: "[from angle document]"
  narrative_pattern: "[from angle document]"
  total_word_target: 1500-2000

  narrative_arc:
    - phase: "hook"
      purpose: "Create tension, establish stakes"
      word_target: 100
      tension_level: "high"

    - phase: "problem"
      heading: "H2: [Problem Statement]"
      purpose: "Establish the pain/challenge"
      word_target: 200
      depth_level: "surface"
      tension_level: "building"

    - phase: "failed_attempts"
      heading: "H2: [What Doesn't Work]"
      purpose: "Show conventional approaches fail"
      word_target: 300
      depth_level: "practical"
      tension_level: "peak"
      examples_needed: 2

    - phase: "discovery"
      heading: "H2: [The Better Way]"
      purpose: "Reveal the insight/solution"
      word_target: 400
      depth_level: "expert"
      tension_level: "release"
      contrarian_element: true
      expert_quote_needed: true

    - phase: "application"
      heading: "H2: [How to Apply This]"
      purpose: "Actionable implementation"
      word_target: 400
      depth_level: "nuanced"
      conditionals_needed: 3
      tradeoffs_needed: 2

    - phase: "results"
      heading: "H2: [Expected Outcomes]"
      purpose: "Motivate and inspire"
      word_target: 200
      depth_level: "practical"
      tension_level: "resolution"

  faq:
    source: "paa_from_serp_analysis"
    count: 3-5
    format: "schema_markup_ready"

  cta:
    type: "next_step"
    specificity: "high"
```

#### T2.3: Enhance seo-content-writer

**Changes:**
1. Accept angle_document and narrative outline
2. Apply voice profile during writing
3. Integrate real examples from research
4. Follow narrative arc structure

**New Input Requirements:**
```yaml
required_inputs:
  - outline_with_narrative_arc
  - angle_document
  - research_document  # With real examples

voice_application:
  formality:
    low: "Use contractions, casual language, slang OK"
    medium: "Professional but approachable"
    high: "Formal, no contractions, academic tone"

  opinion_strength:
    low: "Present options neutrally"
    medium: "Make recommendations with caveats"
    high: "Take strong stances, be direct"

  humor:
    low: "Serious, no jokes"
    medium: "Occasional light humor"
    high: "Witty, playful tone throughout"

example_integration:
  rules:
    - "Use real examples from research, not generic scenarios"
    - "Include source attribution"
    - "Prefer specific over generic"
    - "At least 2 real examples per article"

narrative_adherence:
  rules:
    - "Follow narrative arc phases in order"
    - "Maintain tension curve"
    - "Hit word targets per section (+/- 10%)"
    - "Include required elements per phase"
```

---

### Sprint 3: Pipeline Integration

| Task ID | Task | Subagent Type |
|---------|------|---------------|
| T3.1 | Update seo-blog.md slash command | coder |
| T3.2 | Create validation weighting system | coder |
| T3.3 | Update SEO_TASK_MODE.md | coder |
| T3.4 | Integration testing | tester |

#### T3.1: Update seo-blog.md Slash Command

**Changes:**
1. Update from 9-step to 11-step pipeline
2. Add new agents to pipeline flow
3. Update validation to 6 validators
4. Add quality tier reporting

#### T3.2: Create Validation Weighting System

**Implementation:**
```javascript
// validation/quality-scorer.js

const WEIGHTS = {
  'humanizer-validator': 0.15,
  'branding-validator': 0.10,
  'audience-validator': 0.15,
  'seo-validator': 0.15,
  'voice-authenticity-validator': 0.20,
  'depth-quality-validator': 0.25
};

const THRESHOLDS = {
  exceptional: 0.95,
  high: 0.90,
  standard: 0.85,
  minimum: 0.80
};

function calculateQualityScore(validatorScores) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [validator, score] of Object.entries(validatorScores)) {
    const weight = WEIGHTS[validator] || 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function getQualityTier(score) {
  if (score >= THRESHOLDS.exceptional) return 'exceptional';
  if (score >= THRESHOLDS.high) return 'high';
  if (score >= THRESHOLDS.standard) return 'standard';
  return 'needs_improvement';
}

function validateConsensus(scores) {
  const qualityScore = calculateQualityScore(scores);
  const tier = getQualityTier(qualityScore);

  return {
    passed: qualityScore >= THRESHOLDS.standard,
    score: qualityScore,
    tier,
    breakdown: scores,
    recommendation: qualityScore < THRESHOLDS.standard
      ? 'ITERATE' : 'PROCEED'
  };
}
```

#### T3.3: Update SEO_TASK_MODE.md

**Changes:**
1. Add 11-step pipeline documentation
2. Document new agents
3. Update quick reference
4. Add backward compatibility flag docs

#### T3.4: Integration Testing

**Test Cases:**
1. Full 11-step pipeline execution
2. New validators produce valid scores
3. Quality weighting calculates correctly
4. Backward compatibility (--legacy flag)
5. CLI mode support
6. Task mode support

---

### Sprint 4: Testing & Refinement

| Task ID | Task | Subagent Type |
|---------|------|---------------|
| T4.1 | Create test articles (new pipeline) | N/A (manual) |
| T4.2 | Create test articles (old pipeline) | N/A (manual) |
| T4.3 | Compare quality metrics | analyst |
| T4.4 | Refine thresholds if needed | coder |
| T4.5 | Documentation update | coder |

---

## Execution Commands

### Sprint 1: Parallel Agent Creation

```bash
# Execute in Task mode - spawn 4 agents in parallel
/cfn-loop-task "Create 4 new SEO article pipeline agents in parallel:
1. angle-developer - develops unique angles and thesis
2. depth-enhancer - adds depth to article drafts
3. voice-authenticity-validator - validates authentic voice
4. depth-quality-validator - validates content depth

Use specifications from planning/seo-articles/IMPLEMENTATION_PLAN.md

Create agents in .claude/agents/cfn-seo-team/

Success criteria:
- All 4 agent .md files created
- Proper frontmatter with tools, inputs, outputs
- Detailed prompts following spec
- Validation criteria defined
" --mode=standard
```

### Sprint 2: Agent Enhancement

```bash
# Execute in Task mode
/cfn-loop-task "Enhance 3 existing SEO agents:
1. research-specialist - add example mining (Reddit, Quora, Twitter)
2. content-seo-strategist - add narrative arc outline generation
3. seo-content-writer - add voice profile and real example integration

Use specifications from planning/seo-articles/IMPLEMENTATION_PLAN.md

Success criteria:
- Agent prompts updated with new capabilities
- Input/output formats updated
- Backward compatible
" --mode=standard
```

### Sprint 3: Pipeline Integration

```bash
# Execute in Task mode
/cfn-loop-task "Integrate enhanced pipeline:
1. Update .claude/commands/seo/seo-blog.md to 11-step pipeline
2. Create validation weighting system
3. Update .claude/commands/seo/SEO_TASK_MODE.md
4. Run integration tests

Use specifications from planning/seo-articles/IMPLEMENTATION_PLAN.md

Success criteria:
- seo-blog.md uses 11-step flow
- 6-validator system working
- Quality scoring implemented
- All tests pass
" --mode=standard
```

---

## File Manifest

### New Files to Create

| File | Description |
|------|-------------|
| `.claude/agents/cfn-seo-team/angle-developer.md` | Angle development agent |
| `.claude/agents/cfn-seo-team/depth-enhancer.md` | Depth injection agent |
| `.claude/agents/cfn-seo-team/seo-validators/voice-authenticity-validator.md` | Voice validator |
| `.claude/agents/cfn-seo-team/seo-validators/depth-quality-validator.md` | Depth validator |
| `.claude/skills/seo-validation/quality-scorer.js` | Quality scoring logic |

### Files to Modify

| File | Changes |
|------|---------|
| `.claude/agents/cfn-seo-team/research-specialist.md` | Add example mining |
| `.claude/agents/cfn-seo-team/content-seo-strategist.md` | Add narrative arc |
| `.claude/agents/cfn-seo-team/seo-content-writer.md` | Add voice profile |
| `.claude/commands/seo/seo-blog.md` | Update to 11-step |
| `.claude/commands/seo/SEO_TASK_MODE.md` | Update documentation |

---

## Success Criteria Summary

### Sprint 1 Complete When:
- [ ] angle-developer.md created and valid
- [ ] depth-enhancer.md created and valid
- [ ] voice-authenticity-validator.md created and valid
- [ ] depth-quality-validator.md created and valid

### Sprint 2 Complete When:
- [ ] research-specialist enhanced with example mining
- [ ] content-seo-strategist enhanced with narrative arc
- [ ] seo-content-writer enhanced with voice profile

### Sprint 3 Complete When:
- [ ] seo-blog.md updated to 11-step pipeline
- [ ] Quality scoring system implemented
- [ ] 6-validator consensus working
- [ ] Integration tests passing

### Sprint 4 Complete When:
- [ ] A/B test articles created
- [ ] Quality metrics compared
- [ ] Thresholds refined
- [ ] Documentation complete

---

## Rollback Plan

If issues arise:
1. All changes are in new files (minimal risk to existing)
2. --legacy flag runs original 9-step pipeline
3. Validator weights can be adjusted without code changes
4. New agents can be disabled by removing from flow

---

**Status:** Ready for Execution
**Next Step:** Execute Sprint 1 in Task Mode
