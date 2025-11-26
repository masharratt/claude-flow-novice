# Agent Selection with Fallback Skill

Fixes BUG #22: Empty agent arrays causing CFN Loop failures

## Quick Start

```bash
# Basic usage
./select-agents.sh "Implement JWT authentication"

# Custom validator count
./select-agents.sh "Build API" --min-validators 5

# Classify task only
./task-classifier.sh "Deploy Kubernetes cluster"
```

## Example Outputs

### Security Task
```bash
$ ./select-agents.sh "Implement JWT authentication"
{
  "loop3": ["security-specialist", "backend-developer"],
  "loop2": ["code-reviewer", "tester", "security-specialist"],
  "product_owner": "product-owner",
  "category": "security",
  "confidence": 0.95
}
```

### Infrastructure Task
```bash
$ ./select-agents.sh "Deploy Kubernetes cluster"
{
  "loop3": ["devops-engineer", "docker-specialist", "kubernetes-specialist"],
  "loop2": ["code-reviewer", "tester", "chaos-engineering-specialist"],
  "product_owner": "product-owner",
  "category": "infrastructure",
  "confidence": 0.93
}
```

### Fallback (Empty Task)
```bash
$ ./select-agents.sh ""
{
  "error": "empty task description",
  "loop3": ["backend-developer", "devops-engineer"],
  "loop2": ["code-reviewer", "tester", "code-quality-validator"],
  "product_owner": "product-owner",
  "category": "default",
  "confidence": 0.70
}
```

## Task Categories

- `security` - Authentication, authorization, encryption
- `infrastructure` - Docker, Kubernetes, CI/CD, cloud
- `mobile` - iOS, Android, React Native
- `fullstack` - Frontend + Backend combined
- `frontend` - React, TypeScript, UI/UX
- `database` - Schema design, migrations, optimization
- `performance` - Benchmarking, profiling, caching
- `backend-api` - REST, GraphQL, API endpoints
- `default` - Fallback for unclassified tasks

## Guarantees

- **Non-empty arrays**: Minimum 2 Loop 3 agents, 3 Loop 2 validators
- **Fallback behavior**: Default agents if classification fails
- **Agent validation**: All selected agents exist in `.claude/agents/`
- **JSON output**: Always valid and parseable
- **Product owner**: Always present

## Integration with Orchestrator

```bash
# In orchestrate.sh
AGENT_SELECTION=$(./claude/skills/cfn-agent-selection-with-fallback/select-agents.sh "$TASK_DESCRIPTION")

# Extract agents
LOOP3_AGENTS=$(echo "$AGENT_SELECTION" | jq -r '.loop3[]')
LOOP2_AGENTS=$(echo "$AGENT_SELECTION" | jq -r '.loop2[]')
PRODUCT_OWNER=$(echo "$AGENT_SELECTION" | jq -r '.product_owner')
CATEGORY=$(echo "$AGENT_SELECTION" | jq -r '.category')

# Spawn agents
for agent in $LOOP3_AGENTS; do
  cfn-spawn agent "$agent" --task-id "$TASK_ID"
done
```

## Testing

Run the comprehensive test suite:

```bash
./test-agent-selection.sh
```

Tests validate:
- Task classification (9 categories)
- Agent selection per category
- Minimum agent counts
- Fallback behavior
- JSON output format
- Confidence scoring
- Agent name validation

## Files

- `SKILL.md` - Detailed documentation
- `select-agents.sh` - Main selection script
- `task-classifier.sh` - Task categorization
- `agent-mappings.json` - Agent selections by category
- `test-agent-selection.sh` - Test suite
- `README.md` - This quick reference

## Success Criteria

- [x] 100% guaranteed non-empty agent arrays
- [x] 9 task categories supported
- [x] Fallback to default category on classification failure
- [x] Agent profile validation against available agents
- [x] JSON output parseable by orchestrator
- [x] Minimum 2 Loop 3 agents, 3 Loop 2 validators
- [x] Custom validator count support
- [x] Comprehensive test coverage
