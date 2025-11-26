---
description: "Generate conversion-optimized landing page (6-step pipeline, skip competitor analysis)"
argument-hint: "<target keyword> [--brand=BRAND] [--audience=AUDIENCE]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Bash"]
---

# SEO Landing Page Generator

Execute 6-step SEO pipeline for landing pages (skip competitor analysis, focus on conversion).

**Target Keyword**: $ARGUMENTS

## Landing Page Pipeline (6 Steps)

```
STEP 1: Keyword Research
   ↓
STEP 3: Outline (conversion-focused)
   ↓
STEP 5: Copywriting (800-1200 words)
   ↓
STEP 6: SEO + Conversion Optimization
   ↓
STEP 7: Validation (3 validators, consensus ≥0.95)
   ↓
STEP 8: Publishing Prep (schema markup)
```

## Execution

```javascript
Task("cfn-seo-coordinator", `
  SEO LANDING PAGE GENERATION

  Target Keyword: ${keyword}
  Content Type: landing
  Brand: ${brand}
  Audience: ${audience}
  Word Count: 800-1200
  Mode: STANDARD

  Success Criteria:
  - [ ] Clear value proposition above fold
  - [ ] 1 primary CTA (conversion-focused)
  - [ ] Social proof section (testimonials/stats)
  - [ ] FAQ section (objection handling)
  - [ ] Trust indicators (security, guarantees)
  - [ ] Mobile-optimized layout
  - [ ] Schema: Product/Service markup
  - [ ] Validation consensus ≥0.95

  Invoke:
  ./.claude/skills/seo-orchestration/orchestrate-seo.sh \\
    --task-id "seo-landing-$(date +%s)" \\
    --target-keyword "${keyword}" \\
    --content-type "landing" \\
    --brand "${brand}" \\
    --audience "${audience}" \\
    --word-count 800-1200
`, "cfn-seo-coordinator")
```

## Landing Page Specific Requirements

**Above the Fold:**
- Compelling H1 with keyword
- Benefit-driven subheading
- Primary CTA button
- Hero image/video

**Conversion Elements:**
- Social proof (3-5 testimonials)
- Trust badges (security, money-back)
- Scarcity/urgency (limited offer)
- Clear next steps

**SEO Optimization:**
- Meta title <60 chars (conversion-focused)
- Meta description 150-160 (include benefit)
- Internal links to blog/resources
- Schema: Product or Service markup

## Usage

```bash
# Basic
/seo-landing "family story recording service"

# With brand
/seo-landing "preserve family memories" --brand=ourstories --audience=family_connector
```
