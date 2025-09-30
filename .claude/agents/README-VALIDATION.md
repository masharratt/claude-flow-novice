# Agent Profile Validation Tool

A comprehensive validation script that checks agent profiles against CLAUDE.md standards and provides actionable feedback.

## Usage

### Validate a single agent

```bash
node validate-agent.js path/to/agent.md
```

**Example:**

```bash
node validate-agent.js coder.md
node validate-agent.js benchmarking-tests/test-agent-minimal.md
node validate-agent.js architecture/system-architect.md
```

### Validate all agents

```bash
node validate-agent.js --all
```

This will:
- Recursively find all `.md` files in the agents directory
- Validate each agent profile
- Generate summary statistics
- Show top performers and agents needing improvement

## What it Validates

### 1. Frontmatter Structure

- Required fields: `name`, `description`, `tools`, `model`, `color`
- Tools from approved list: `Read, Write, Edit, MultiEdit, Bash, Glob, Grep, TodoWrite`
- Valid model names: `sonnet, haiku, opus, sonnet-3-5, sonnet-4-5`
- Color format: Named colors, hex (`#FF9800`), or RGB (`rgb(255, 152, 0)`)

### 2. Format Classification

Automatically detects agent format based on content analysis:

- **MINIMAL** (200-400 lines): Complex tasks requiring reasoning
- **METADATA** (400-700 lines): Medium complexity with structured workflows
- **CODE-HEAVY** (700-1200 lines): Basic tasks benefiting from examples

### 3. Complexity Analysis

Analyzes task complexity based on keywords:

- **Basic**: String processing, parsing, CRUD operations
- **Medium**: Multi-component integration, refactoring, pipelines
- **Complex**: Architecture, distributed systems, design trade-offs

### 4. Format Alignment

Checks if the current format aligns with best practices for the detected complexity:

- Basic tasks → CODE-HEAVY format (+43% quality boost validated)
- Medium tasks → METADATA format (balanced approach)
- Complex tasks → MINIMAL format (avoid over-constraining)

### 5. Quality Checks

- Clear role definition in opening paragraph
- Specific responsibilities section
- Appropriate use of negative instructions
- Anti-pattern detection

## Output Example

```
════════════════════════════════════════════════════════════════════════════════
AGENT VALIDATION REPORT: coder.md
════════════════════════════════════════════════════════════════════════════════

SUMMARY
────────────────────────────────────────────────────────────────────────────────
Agent Profile Status: Excellent (100/100)
✅ Format aligned with best practices (metadata)

FORMAT ANALYSIS
────────────────────────────────────────────────────────────────────────────────
Detected Format: METADATA
Confidence: 60%
Estimated Tokens: ~1000
Word Count: 1215

Characteristics:
  • codeBlocks: 1
  • verbosity: medium

COMPLEXITY ANALYSIS
────────────────────────────────────────────────────────────────────────────────
Estimated Complexity: MEDIUM
Confidence: HIGH
Indicator Scores:
  • basic: 2.0
  • medium: 3.5
  • complex: 3.0

FORMAT RECOMMENDATION
────────────────────────────────────────────────────────────────────────────────
Current Format: METADATA
Recommended Format: METADATA
Alignment: ✅ ALIGNED
Confidence: MEDIUM
Reason: Medium complexity benefits from structure without over-constraining
Evidence: Hypothesized from validated coder agent patterns

════════════════════════════════════════════════════════════════════════════════
Compliance Score: 100/100
════════════════════════════════════════════════════════════════════════════════
```

## Compliance Scoring

The script calculates a compliance score (0-100) based on:

- **Critical Issues** (-20 points each): Missing required fields, invalid values
- **Warnings** (-5 points each): Recommended improvements
- **Recommendations** (-2 points each): Quality enhancement suggestions

### Score Interpretation

- **90-100**: Excellent - Production ready
- **75-89**: Good - Minor improvements recommended
- **60-74**: Fair - Several issues to address
- **<60**: Needs Improvement - Significant work required

## Exit Codes

- **0**: Agent is valid (no critical issues)
- **1**: Agent has critical issues or validation errors

## Integration with CI/CD

You can use this script in your CI/CD pipeline:

```yaml
# .github/workflows/validate-agents.yml
name: Validate Agents

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd .claude/agents && node validate-agent.js --all
```

## Programmatic Usage

You can also import and use the validation functions:

```javascript
import { validateAgent, classifyFormat, estimateComplexity, recommendFormat } from './validate-agent.js';

// Validate a single agent
const result = await validateAgent('/path/to/agent.md');
console.log(`Valid: ${result.valid}`);
console.log(`Score: ${result.complianceScore}/100`);
console.log(`Format: ${result.format.classification.format}`);

// Classify format
const format = classifyFormat(content, frontmatter);
console.log(`Detected format: ${format.format}`);

// Estimate complexity
const complexity = estimateComplexity(frontmatter, content);
console.log(`Complexity: ${complexity.complexity}`);

// Get format recommendation
const recommendation = recommendFormat('coder', 'basic');
console.log(`Recommended: ${recommendation.recommended}`);
```

## Best Practices

1. **Run validation before committing** new or updated agent profiles
2. **Aim for 90+ score** for production agents
3. **Address critical issues immediately** - they block deployment
4. **Consider recommendations** - they improve agent effectiveness
5. **Re-validate periodically** as CLAUDE.md standards evolve

## Troubleshooting

### "No frontmatter found"

Ensure your agent file starts with:

```markdown
---
name: agent-name
description: Agent description
tools: Read, Write, Edit
model: sonnet
color: blue
---

# Agent Name
...
```

### "Invalid YAML syntax"

Check for:
- Proper indentation (use spaces, not tabs)
- Quoted strings containing special characters
- Balanced brackets and quotes
- No duplicate keys

### "Format mismatch"

The validator detected your agent format doesn't match the recommended format for the task complexity. Consider:

- Is the agent truly for basic/medium/complex tasks?
- Does the format align with empirical findings?
- Should you add/remove examples or structure?

## Future Enhancements

- Integration with Claude Flow hooks
- Automated fix suggestions
- Performance benchmarking integration
- Format conversion tools
- Custom rule definitions

## Support

For issues or suggestions, please file an issue in the project repository.

## License

This validation tool is part of the Claude Flow project.