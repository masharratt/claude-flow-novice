# Agent Selection with Fallback Skill

## Purpose
Classify tasks and select appropriate agents for Loop 3 (implementers) and Loop 2 (validators) with guaranteed fallback behavior. Fixes BUG #22 (empty agent arrays causing CFN Loop failures).

## Capabilities
- Task classification into predefined categories
- Agent selection based on task type
- Guaranteed non-empty agent arrays
- Fallback to defaults if classification fails
- Agent name validation against available profiles

## Usage

### Basic Selection
```bash
# Select agents for a task
./select-agents.sh "Implement JWT authentication API"

# Output (JSON):
# {
#   "loop3": ["backend-developer", "security-specialist"],
#   "loop2": ["code-reviewer", "tester", "security-specialist"],
#   "product_owner": "product-owner",
#   "category": "backend-api",
#   "confidence": 0.92
# }
```

### With Custom Validator Count
```bash
# Specify minimum validators (default: 3)
./select-agents.sh "Build React dashboard" --min-validators 5

# Output includes adaptive validator scaling
```

### Classify Task Only
```bash
# Get task category without agent selection
./task-classifier.sh "Deploy Kubernetes cluster"

# Output: infrastructure
```

## Task Categories

### backend-api
Backend API development and REST/GraphQL endpoints
- Loop 3: backend-developer, api-gateway-specialist
- Loop 2: code-reviewer, tester, api-testing-specialist

### fullstack
Full-stack application with frontend and backend
- Loop 3: backend-developer, react-frontend-engineer, typescript-specialist
- Loop 2: code-reviewer, tester, integration-tester, playwright-tester

### mobile
Mobile application development (iOS/Android)
- Loop 3: mobile-dev, backend-developer
- Loop 2: code-reviewer, tester, interaction-tester

### infrastructure
DevOps, Docker, Kubernetes, cloud deployment
- Loop 3: devops-engineer, docker-specialist, kubernetes-specialist
- Loop 2: code-reviewer, tester, chaos-engineering-specialist

### security
Security audits, vulnerability fixes, authentication
- Loop 3: security-specialist, backend-developer
- Loop 2: code-reviewer, tester, security-specialist

### frontend
Frontend-only development (React, TypeScript, UI/UX)
- Loop 3: react-frontend-engineer, typescript-specialist, ui-designer
- Loop 2: code-reviewer, tester, playwright-tester

### database
Database schema design, migrations, optimization
- Loop 3: database-architect, backend-developer
- Loop 2: code-reviewer, tester, data-engineer

### performance
Performance optimization and benchmarking
- Loop 3: backend-developer, perf-analyzer
- Loop 2: code-reviewer, tester, performance-benchmarker

### default
Fallback for unclassified tasks
- Loop 3: backend-developer, devops-engineer
- Loop 2: code-reviewer, tester, code-quality-validator

## Fallback Behavior

### Classification Failure
If task classification fails or returns unknown category:
- Category: "default"
- Loop 3: ["backend-developer", "devops-engineer"]
- Loop 2: ["code-reviewer", "tester", "code-quality-validator"]
- Confidence: 0.70

### Empty Agent Arrays
If category mapping returns empty arrays:
- Fallback to default category mappings
- Log warning with category name
- Guarantee minimum 2 Loop 3 agents, 3 Loop 2 validators

### Invalid Agent Names
If selected agents don't exist in `.claude/agents/`:
- Replace with valid fallback agents
- Log warning with invalid agent names
- Maintain category-appropriate selection

## Agent Validation

The skill validates all selected agents against available profiles:
```bash
# Valid agent directories:
.claude/agents/cfn-dev-team/developers/backend-developer.md
.claude/agents/cfn-dev-team/dev-ops/devops-engineer.md
.claude/agents/cfn-dev-team/reviewers/code-reviewer.md
.claude/agents/cfn-dev-team/testers/tester.md
# ... etc
```

Invalid agents are replaced with category-appropriate fallbacks.

## Output Format

### JSON Structure
```json
{
  "loop3": ["agent1", "agent2"],           // Always 2+ agents
  "loop2": ["validator1", "validator2"],   // Always 3+ validators
  "product_owner": "product-owner",        // Always present
  "category": "task-category",             // Classification result
  "confidence": 0.85                       // 0.0-1.0 score
}
```

### Confidence Scoring
- 0.95+: Exact keyword match with high certainty
- 0.85-0.94: Strong category indicators
- 0.75-0.84: Moderate category match
- 0.70-0.74: Weak match or fallback used

## Integration with Orchestrator

```bash
# In orchestrate.sh (Loop 3 spawning)
AGENT_SELECTION=$(./claude/skills/cfn-agent-selection-with-fallback/select-agents.sh "$TASK_DESCRIPTION")

LOOP3_AGENTS=$(echo "$AGENT_SELECTION" | jq -r '.loop3[]')
LOOP2_AGENTS=$(echo "$AGENT_SELECTION" | jq -r '.loop2[]')
PRODUCT_OWNER=$(echo "$AGENT_SELECTION" | jq -r '.product_owner')

# Spawn agents
for agent in $LOOP3_AGENTS; do
  cfn-spawn agent "$agent" --task-id "$TASK_ID" --iteration "$ITERATION"
done
```

## Classification Keywords

### backend-api
- jwt, auth, authentication, authorization
- api, rest, graphql, endpoint
- middleware, express, fastify
- database, postgres, mongodb

### fullstack
- fullstack, full-stack, full stack
- react + backend, frontend + api
- next.js, remix, sveltekit

### mobile
- mobile, ios, android, react-native
- swift, kotlin, flutter

### infrastructure
- docker, kubernetes, k8s, helm
- deployment, ci/cd, pipeline
- aws, gcp, azure, cloud

### security
- security, vulnerability, exploit
- encryption, ssl, tls, certificate
- oauth, saml, rbac, permissions

### frontend
- react, vue, angular, svelte
- typescript, javascript, css
- ui, ux, design, component

### database
- schema, migration, index
- sql, nosql, query optimization
- postgres, mongodb, redis

### performance
- performance, optimization, benchmark
- latency, throughput, caching
- profiling, memory leak

## Testing

Run the test suite to validate selection logic:
```bash
./test-agent-selection.sh
```

Tests cover:
- All task categories (9 categories)
- Fallback behavior (classification failure, empty arrays)
- Agent validation (invalid agent names)
- JSON output format
- Minimum agent counts
- Confidence scoring accuracy

## Dependencies
- jq (JSON processing)
- bash 4.0+
- Access to `.claude/agents/cfn-dev-team/` directory

## Error Handling
- Missing jq: Exit with error message
- Invalid task description: Use default category
- Missing agent mappings file: Use hardcoded defaults
- Agent profile validation failure: Replace with fallbacks

## Success Criteria
- 100% guaranteed non-empty agent arrays
- Category classification accuracy >85%
- Agent validation against available profiles
- Fallback coverage for all failure modes
- JSON output parseable by orchestrator

## Files
- `select-agents.sh` - Main selection script
- `task-classifier.sh` - Task category classification
- `agent-mappings.json` - Agent selections by category
- `test-agent-selection.sh` - Test suite
- `SKILL.md` - This documentation
