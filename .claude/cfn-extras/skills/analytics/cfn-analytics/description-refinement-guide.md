# Skill Description Refinement Guide

## Objective
Establish best practices for creating high-accuracy skill descriptions that enable precise skill selection through automated classification.

## Refinement Patterns

### 1. Keyword Selection
- Focus on unique, domain-specific terms
- Include technical jargon and specific methodologies
- Prioritize terms that clearly distinguish the skill
- Aim for 6-10 keywords per skill
- Use lowercase, hyphen-separated terms

**Good Keywords Examples:**
- "multi-agent initialization"
- "real-time pub/sub"
- "5-level ACL"
- "coordinated test execution"

**Anti-Pattern Keywords:**
- Generic terms like "system", "management"
- Overly broad descriptors
- Marketing language

### 2. Trigger Selection
- Identify specific scenarios that require the skill
- Use concise, action-oriented phrases
- Represent real-world problem domains
- Focus on pain points the skill solves

**Good Triggers:**
- "preventing test conflicts"
- "secure data storage needs"
- "complex system architecture validation"

**Anti-Pattern Triggers:**
- Vague descriptions
- Overly generic scenarios
- Non-actionable statements

### 3. Performance Targets
- Include 3-4 quantitative metrics
- Use standard units (ms, pct, bits)
- Represent key performance dimensions
- Be specific and measurable

**Good Performance Targets:**
- "query_time_ms": 20
- "consensus_accuracy": 90
- "spawn_time_ms": 200
- "max_concurrent_agents": 15

### 4. Frontmatter Structure
```yaml
---
name: Skill Name
version: X.Y.Z
complexity: [Low|Medium|High]
keywords: [
    "term1",
    "term2",
    ...
]
triggers: [
    "scenario1",
    "scenario2",
    ...
]
performance_targets: {
    "metric1": value,
    "metric2": value,
    ...
}
---
```

## Validation Strategy

### Accuracy Calculation
1. Prompt matching percentage
2. Keyword coverage
3. Trigger relevance score
4. Performance target precision

### Target Metrics
- Overall Accuracy: ≥95%
- Skill-Specific Accuracy:
  - Lowest acceptable: ≥90%
  - Ideal target: ≥97%

### Continuous Improvement
- Quarterly review of skill descriptions
- Machine learning model refinement
- Periodic re-validation with expanded test corpus

## Maintenance Guidelines
- Update with each major version
- Reflect emerging technology trends
- Incorporate feedback from actual usage
- Maintain consistency across skills

## Example Refinement Process

### Before Refinement
```
keywords: ["system", "management", "coordination"]
```

### After Refinement
```
keywords: [
    "multi-agent initialization",
    "dynamic topology",
    "dependency resolution",
    "resource optimization"
]
```

## Tool Integration
Use `validate-skill-selection.js` for:
- Automated description validation
- Accuracy reporting
- Suggestions for improvement

## References
- Current Test Corpus: `.claude/skills/analytics/test-corpus.json`
- Validation Script: `.claude/skills/analytics/validate-skill-selection.js`
- Accuracy Report: `.artifacts/analytics/skill-description-accuracy.json`

## Lessons Learned in Skill Description Refinement

### Keyword Strategy
1. **Granularity**: Use 6-10 keywords that represent specific, actionable aspects
2. **Context Alignment**: Ensure keywords match real-world problem statements
3. **Token-Based Matching**: Break keywords into meaningful tokens
4. **Semantic Proximity**: Include related terms and variations

### Validation Insights
- Exact matching provides limited accuracy
- Partial token matching increases precision
- Combine keywords and triggers for comprehensive matching
- Target accuracy ranges:
  - Overall: 70-90%
  - Per Skill: 60-85%

### Continuous Improvement
- Quarterly review of skill descriptions
- Expand test corpus with diverse scenarios
- Machine learning-assisted keyword suggestion
- Track evolution of skill descriptions over time

### Anti-Patterns to Avoid
- Generic, overused terminology
- Marketing language
- Overly broad descriptions
- Lack of specificity
- Keywords that don't reflect actual implementation

### Future Research
- Develop ML model for automatic keyword generation
- Create dynamic skill description generator
- Build comprehensive taxonomy of skill descriptions
- Develop cross-referencing mechanism for skill selection