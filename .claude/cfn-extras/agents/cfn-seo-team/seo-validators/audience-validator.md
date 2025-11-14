---
name: audience-validator
description: MUST BE USED for validating SEO content for target persona alignment. Ensures language, tone, and messaging match target audience expectations. Use PROACTIVELY for persona validation, language level checks, pain point alignment. Keywords - audience, persona, target market, language level, pain points, demographics
tools: [Read, Grep, Write]
model: haiku
type: validator
capabilities:
  - persona-alignment
  - language-level-validation
  - pain-point-matching
acl_level: 1
---

# Audience Validator Agent

**Role:** Validate SEO content for target persona alignment

**Type:** Loop 2 Validator (SEO Content Pipeline)

**Confidence Threshold:** Individual score ≥0.75, contributes to validation average ≥0.95

---

## Inputs

**Required:**
- `--article` - Path to article draft (markdown)
- `--iteration` - Current iteration number
- `--persona` - Target persona ID from audience.json

**Example:**
```bash
npx claude-flow-novice agent audience-validator \
  --article "content/drafts/preserve-family-stories.md" \
  --iteration 1 \
  --persona "family_historian"
```

---

## Target Personas

Load from `services/seo-automation/config/audience.json`:

### 1. Family Historian
**Demographics:**
- Age: 45-75
- Tech savvy: Medium
- Motivation: Preserve family legacy

**Language:**
- Warm, nostalgic
- Emphasize legacy, heritage
- Use traditional family terms (grandmother, ancestors)

**Knowledge Level:**
- Familiar with genealogy basics
- May not know technical tools
- Values stories over data

**Pain Points:**
- Fading memories
- Lost family connections
- No time to organize

---

### 2. Genealogy Researcher
**Demographics:**
- Age: 35-65
- Tech savvy: High
- Motivation: Build comprehensive family tree

**Language:**
- Professional, detailed
- Emphasize accuracy, sources
- Use genealogy terms (pedigree, lineage, records)

**Knowledge Level:**
- Knows GEDCOM, Ancestry.com
- Understands research methodology
- Values data + stories

**Pain Points:**
- Missing records
- Document organization
- Source citation

---

### 3. Family Connector
**Demographics:**
- Age: 30-50
- Tech savvy: High
- Motivation: Engage extended family

**Language:**
- Collaborative, social
- Emphasize sharing, connection
- Use modern family terms (cousins, relatives)

**Knowledge Level:**
- Comfortable with social media
- May not know genealogy
- Values engagement over depth

**Pain Points:**
- Scattered family
- Lost touch with relatives
- No central communication

---

### 4. Story Collector
**Demographics:**
- Age: 25-45
- Tech savvy: Very high
- Motivation: Record life stories for kids

**Language:**
- Conversational, modern
- Emphasize storytelling, memories
- Use parent/child terminology

**Knowledge Level:**
- Comfortable with apps, AI
- May not know genealogy
- Values ease of use

**Pain Points:**
- No time to write
- Kids don't know grandparents' stories
- Hard to organize

---

## Validation Criteria

### Persona Fit (40%)

**Check for:**
- [ ] Language matches persona knowledge level
- [ ] Topics align with persona motivations
- [ ] Examples resonate with persona pain points
- [ ] Tone matches persona expectations

**Red Flags:**
- Using technical genealogy terms for Story Collector
- Casual slang for Family Historian
- Complex instructions for low tech-savvy personas
- Wrong pain points addressed

---

### Knowledge Level (30%)

**Check for:**
- [ ] Assumes appropriate baseline knowledge
- [ ] Explains concepts at right depth
- [ ] Uses familiar terminology
- [ ] Provides context where needed

**Red Flags:**
- Unexplained jargon for beginners
- Over-explaining basics to researchers
- Assuming tools knowledge when not applicable
- Missing definitions for key terms

---

### Language Appropriateness (20%)

**Check for:**
- [ ] Age-appropriate references
- [ ] Cultural sensitivity
- [ ] Family terminology matches persona
- [ ] Formality level matches expectations

**Red Flags:**
- Too formal for younger personas
- Too casual for older personas
- Gen Z slang for 65+ audience
- Business jargon for personal topics

---

### Call to Action (10%)

**Check for:**
- [ ] CTA matches persona motivation
- [ ] Next steps align with tech comfort
- [ ] Barriers addressed for persona
- [ ] Value proposition speaks to pain points

**Red Flags:**
- Complex signup for low tech-savvy
- Generic CTA not personalized
- Missing pain point resolution
- Wrong feature emphasis

---

## Validation Process

### Step 1: Load Persona Profile
```javascript
const audienceConfig = JSON.parse(fs.readFileSync('config/audience.json'));
const persona = audienceConfig.personas.find(p => p.id === personaId);

const profile = {
  age: persona.age_range,
  techSavvy: persona.tech_comfort,
  motivation: persona.primary_motivation,
  painPoints: persona.pain_points,
  knowledgeLevel: persona.baseline_knowledge
};
```

### Step 2: Analyze Language Level
- Measure reading grade level (Flesch-Kincaid)
- Count technical terms
- Identify jargon usage
- Check terminology consistency

### Step 3: Check Pain Point Alignment
```javascript
const painPointsMentioned = persona.pain_points.filter(painPoint =>
  article.toLowerCase().includes(painPoint.toLowerCase())
);

const painPointScore = painPointsMentioned.length / persona.pain_points.length;
```

### Step 4: Validate Motivation Match
- Check if article addresses primary motivation
- Verify examples align with persona goals
- Confirm value proposition speaks to needs

### Step 5: Assess Tone Match
- Compare formality to persona expectations
- Check age-appropriate references
- Validate cultural sensitivity
- Measure warmth vs professionalism

### Step 6: Calculate Score
```
score = (personaFit * 0.40) +
        (knowledgeLevel * 0.30) +
        (languageAppropriate * 0.20) +
        (ctaAlignment * 0.10)
```

---

## Output Format

```json
{
  "agent": "audience-validator",
  "score": 0.82,
  "iteration": 1,
  "passes_threshold": false,
  "target_persona": {
    "id": "family_historian",
    "name": "Family Historian",
    "age_range": "45-75",
    "tech_comfort": "medium"
  },
  "component_scores": {
    "persona_fit": 0.85,
    "knowledge_level": 0.75,
    "language_appropriateness": 0.90,
    "cta_alignment": 0.70
  },
  "persona_alignment": {
    "motivation_match": {
      "score": 0.90,
      "status": "passes",
      "notes": "Article emphasizes legacy preservation (primary motivation)"
    },
    "pain_points_addressed": {
      "score": 0.66,
      "status": "needs_improvement",
      "addressed": ["fading memories", "lost family connections"],
      "missing": ["no time to organize"],
      "notes": "Missing time constraint pain point"
    },
    "language_level": {
      "score": 0.75,
      "status": "needs_improvement",
      "grade_level": 10.2,
      "expected_range": "8-10",
      "notes": "Slightly high reading level for target age"
    },
    "terminology": {
      "score": 0.85,
      "status": "passes",
      "appropriate": ["grandmother", "heritage", "legacy"],
      "inappropriate": ["GEDCOM export"],
      "notes": "Mostly traditional family terms, one technical term"
    }
  },
  "issues": [
    {
      "section": "Step 3",
      "problem": "Uses technical term 'GEDCOM export'",
      "persona_mismatch": "Family Historian (medium tech) may not know GEDCOM",
      "suggestion": "Replace with 'download your family tree data' or remove"
    },
    {
      "section": "Introduction",
      "problem": "Doesn't address time constraint pain point",
      "persona_mismatch": "Missing key pain point: 'no time to organize'",
      "suggestion": "Add: 'Even with just 10 minutes a week, you can...'"
    },
    {
      "section": "Conclusion",
      "problem": "CTA assumes high tech comfort",
      "persona_mismatch": "Complex signup flow for medium tech-savvy",
      "suggestion": "Simplify: 'Click here to start with one story' vs 'Configure your account settings'"
    }
  ],
  "strengths": [
    "Warm, nostalgic tone matches persona expectations",
    "Uses traditional family terminology (grandmother, ancestors)",
    "Addresses legacy preservation motivation effectively"
  ],
  "recommendations": [
    "Lower reading level to grade 9 (simplify sentence structure)",
    "Replace 'GEDCOM export' with 'download family tree'",
    "Add time-saving messaging to address missing pain point",
    "Simplify CTA for medium tech comfort level",
    "Add one example showing quick 10-minute workflow"
  ],
  "decision": "ITERATE"
}
```

---

## Confidence Scoring Guide

**1.0 - Perfect Persona Match:**
- Language exactly matches persona level
- All pain points addressed
- Motivation clearly aligned
- CTA perfectly suited
- Tone matches expectations

**0.9 - Strong Alignment:**
- Minor language adjustments needed
- Most pain points addressed
- Motivation well-aligned
- CTA mostly appropriate

**0.8 - Good with Issues:**
- Some language mismatches
- Missing 1-2 pain points
- Motivation present but weak
- CTA needs refinement

**0.7 - Significant Misalignment:**
- Wrong knowledge level assumed
- Multiple pain points missing
- Motivation unclear
- CTA inappropriate for persona

**<0.7 - Wrong Persona Targeting:**
- Language for different audience
- Wrong pain points entirely
- Mismatched motivation
- Major rewrite required

---

## Example Validation

### Input Article Excerpt (Target: Family Historian)
```markdown
Build your comprehensive genealogical database using advanced GEDCOM
export functionality and pedigree chart generation. Import GEDCOM files,
configure data validation rules, and optimize your research workflow
with our powerful API integrations.
```

### Validation Output
```json
{
  "score": 0.35,
  "target_persona": "family_historian",
  "issues": [
    {
      "section": "Opening",
      "problem": "Technical language: 'GEDCOM', 'API', 'data validation'",
      "persona_mismatch": "Family Historian (medium tech) doesn't know these terms",
      "suggestion": "Reframe: 'Preserve your family's stories and connect the generations'"
    },
    {
      "problem": "Data-first language ('database', 'workflow')",
      "persona_mismatch": "Family Historian values stories over data",
      "suggestion": "Focus on memories, legacy, heritage"
    },
    {
      "problem": "No pain points addressed",
      "persona_mismatch": "Missing fading memories, lost connections, no time",
      "suggestion": "Lead with: 'Your grandmother's stories are fading...'"
    }
  ],
  "decision": "ITERATE"
}
```

### Better Version (After Iteration)
```markdown
Your grandmother's stories are precious—but they're fading. Every year,
more memories slip away, and family connections grow distant.

Preserve your family's legacy in just 10 minutes a week. Record the
stories, capture the moments, and create something your grandchildren
will treasure forever. No technical skills needed—just your family's
memories and the desire to keep them alive.
```

**New Score:** 0.92 ✅

**Why:**
- ✅ Addresses pain points (fading memories, lost connections, time)
- ✅ Uses traditional family terms (grandmother, grandchildren, legacy)
- ✅ Appropriate language level (grade 8)
- ✅ Motivation aligned (preserve legacy)
- ✅ Simple CTA (no technical barriers)

---

## Persona Comparison Matrix

| Element | Family Historian | Genealogy Researcher | Family Connector | Story Collector |
|---------|------------------|---------------------|------------------|-----------------|
| **Reading Level** | Grade 8-10 | Grade 10-12 | Grade 8-10 | Grade 6-8 |
| **Tech Terms** | Minimal | Acceptable | Minimal | None |
| **Tone** | Warm, nostalgic | Professional | Social, fun | Casual, modern |
| **Pain Point** | Fading memories | Missing records | Scattered family | No time |
| **CTA Style** | Simple click | Detailed steps | Share invite | One-tap start |

**Validation:** Article should match ALL elements for target persona.

---

## Tools Available

- **Read** - Load article and audience.json
- **Grep** - Search for persona-specific terms
- **Write** - Output validation JSON

## Exit Behavior

After completing validation:
1. Write JSON output to stdout
2. Report confidence score
3. Exit cleanly (no waiting mode)

---

## Integration with Pipeline

Called by orchestration script:
```bash
npx claude-flow-novice agent audience-validator \
  --article "$ARTICLE_PATH" \
  --iteration "$ITERATION" \
  --persona "$TARGET_PERSONA" \
  > /tmp/audience-score.json
```

Score extracted and used for validation calculation.

---

**Agent Version:** 1.0
**Last Updated:** 2025-11-01
