# Agent Selector Skill

**Version:** 1.0.0
**Purpose:** Select optimal agents for CFN Loop v3 based on task type and requirements

## Overview

Recommends Loop 3 (producers) and Loop 2 (evaluators) agents based on:
- Task type (from task-classifier)
- Task description keywords
- Complexity requirements

## Usage

```bash
AGENTS=$(./.claude/skills/agent-selector/select-agents.sh \
  --task-type "software-development" \
  --description "Implement JWT authentication with refresh tokens")

echo "$AGENTS" | jq '.loop3[]'  # ["backend-dev", "security-specialist"]
echo "$AGENTS" | jq '.loop2[]'  # ["reviewer", "tester", "security-auditor"]
```

## Output Format

```json
{
  "loop3": ["agent1", "agent2", "agent3"],
  "loop2": ["validator1", "validator2", "validator3"],
  "loop4": "product-owner",
  "reasoning": "Explanation of agent selection"
}
```

## Agent Selection Rules

### Software Development
**Base Loop 3:** backend-dev, coder
**Add if keywords:**
- "security", "authentication", "JWT" → security-specialist
- "database", "SQL", "schema" → database-engineer (if exists)
- "deploy", "CI/CD", "infrastructure" → devops-engineer
- "frontend", "React", "UI" → react-frontend-engineer

**Loop 2:** reviewer, tester, security-auditor

### Content Creation
**Base Loop 3:** copywriter, content-strategist
**Add if keywords:**
- "SEO", "search", "keywords" → seo-specialist
- "technical", "documentation" → technical-writer (if exists)

**Loop 2:** editor, brand-reviewer, compliance-checker

### Research
**Base Loop 3:** researcher, data-analyst
**Add if keywords:**
- "statistics", "data analysis" → statistician (if exists)
- "domain-specific" → domain-expert

**Loop 2:** fact-checker, methodology-reviewer, statistician

### Design
**Base Loop 3:** ui-designer, ux-researcher
**Add if keywords:**
- "visual", "branding" → visual-designer
- "accessibility" → accessibility-advocate

**Loop 2:** accessibility-advocate, design-critic, user-tester

### Infrastructure
**Base Loop 3:** devops-engineer, terraform-engineer
**Add if keywords:**
- "Kubernetes", "k8s", "container" → kubernetes-architect
- "network", "security" → network-engineer (if exists)

**Loop 2:** security-auditor, cost-optimizer, compliance-checker

### Data Engineering
**Base Loop 3:** data-engineer, pipeline-builder
**Add if keywords:**
- "ETL", "transformation" → etl-specialist
- "streaming", "real-time" → streaming-specialist (if exists)

**Loop 2:** data-quality-validator, schema-reviewer, performance-tester

## Integration

Used by:
- `.claude/agents/cfn-v3-coordinator.md` - Agent selection