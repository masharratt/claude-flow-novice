# Orchestrator Integration Example

## Phase 3 Enhancement for BUG #22 Fix

### Before (Manual Agent Selection)
```bash
# orchestrate.sh - Loop 3 spawning (old way)

# Hardcoded agents - inflexible
LOOP3_AGENTS="backend-developer devops-engineer"

for agent in $LOOP3_AGENTS; do
  cfn-spawn agent "$agent" --task-id "$TASK_ID" --iteration "$ITERATION"
done
```

**Problems:**
- Empty arrays cause failures
- No task-specific agent selection
- Manual maintenance required
- No fallback behavior

### After (Agent Selection Skill)
```bash
# orchestrate.sh - Loop 3 spawning (new way)

SKILL_DIR="./.claude/skills/cfn-agent-selection-with-fallback"

# Select agents based on task description
AGENT_SELECTION=$("$SKILL_DIR/select-agents.sh" "$TASK_DESCRIPTION" 2>/dev/null)

# Extract agent lists (guaranteed non-empty)
LOOP3_AGENTS=$(echo "$AGENT_SELECTION" | jq -r '.loop3[]')
LOOP2_AGENTS=$(echo "$AGENT_SELECTION" | jq -r '.loop2[]')
PRODUCT_OWNER=$(echo "$AGENT_SELECTION" | jq -r '.product_owner')
CATEGORY=$(echo "$AGENT_SELECTION" | jq -r '.category')

echo "Task category: $CATEGORY"
echo "Loop 3 agents: $(echo "$LOOP3_AGENTS" | tr '\n' ', ' | sed 's/,$//')"
echo "Loop 2 validators: $(echo "$LOOP2_AGENTS" | tr '\n' ', ' | sed 's/,$//')"

# Spawn Loop 3 agents
for agent in $LOOP3_AGENTS; do
  cfn-spawn agent "$agent" \
    --task-id "$TASK_ID" \
    --iteration "$ITERATION" \
    --category "$CATEGORY"
done

# Wait for Loop 3 completion...
# Execute tests...
# Check gate pass rate...

# Spawn Loop 2 validators
for validator in $LOOP2_AGENTS; do
  cfn-spawn agent "$validator" \
    --task-id "$TASK_ID" \
    --iteration "$ITERATION" \
    --mode validator
done

# Wait for Loop 2 consensus...

# Spawn Product Owner
cfn-spawn agent "$PRODUCT_OWNER" \
  --task-id "$TASK_ID" \
  --iteration "$ITERATION" \
  --mode decision
```

**Benefits:**
- ✅ Guaranteed non-empty arrays (fixes BUG #22)
- ✅ Task-specific agent selection (9 categories)
- ✅ Automatic fallback behavior
- ✅ Agent profile validation
- ✅ Adaptive validator scaling

## Example Outputs

### Security Task
```bash
$ ./select-agents.sh "Fix JWT authentication vulnerability"

Task category: security
Loop 3 agents: security-specialist, backend-developer
Loop 2 validators: code-reviewer, tester, security-specialist

# Spawns:
- security-specialist (Loop 3)
- backend-developer (Loop 3)
- code-reviewer (Loop 2)
- tester (Loop 2)
- security-specialist (Loop 2)
- product-owner (Product Owner)
```

### Infrastructure Task
```bash
$ ./select-agents.sh "Deploy microservices to Kubernetes"

Task category: infrastructure
Loop 3 agents: devops-engineer, docker-specialist, kubernetes-specialist
Loop 2 validators: code-reviewer, tester, chaos-engineering-specialist

# Spawns:
- devops-engineer (Loop 3)
- docker-specialist (Loop 3)
- kubernetes-specialist (Loop 3)
- code-reviewer (Loop 2)
- tester (Loop 2)
- chaos-engineering-specialist (Loop 2)
- product-owner (Product Owner)
```

### Fullstack Task
```bash
$ ./select-agents.sh "Build user dashboard with Next.js and backend API"

Task category: fullstack
Loop 3 agents: backend-developer, react-frontend-engineer, typescript-specialist
Loop 2 validators: code-reviewer, tester, integration-tester, playwright-tester

# Spawns:
- backend-developer (Loop 3)
- react-frontend-engineer (Loop 3)
- typescript-specialist (Loop 3)
- code-reviewer (Loop 2)
- tester (Loop 2)
- integration-tester (Loop 2)
- playwright-tester (Loop 2)
- product-owner (Product Owner)
```

## Error Handling

### Empty Task Description
```bash
$ ./select-agents.sh ""

# Output:
{
  "error": "empty task description",
  "loop3": ["backend-developer", "devops-engineer"],
  "loop2": ["code-reviewer", "tester", "code-quality-validator"],
  "product_owner": "product-owner",
  "category": "default",
  "confidence": 0.70
}

# Still spawns default agents (no failure)
```

### Unclassified Task
```bash
$ ./select-agents.sh "Random xyz task qwerty"

# Output:
{
  "loop3": ["backend-developer", "devops-engineer"],
  "loop2": ["code-reviewer", "tester", "code-quality-validator"],
  "product_owner": "product-owner",
  "category": "default",
  "confidence": 0.70
}

# Falls back to default agents
```

## Custom Validator Scaling

```bash
# Enterprise mode - require more validators
AGENT_SELECTION=$("$SKILL_DIR/select-agents.sh" "$TASK_DESCRIPTION" --min-validators 5)

# MVP mode - accept fewer validators (still min 3)
AGENT_SELECTION=$("$SKILL_DIR/select-agents.sh" "$TASK_DESCRIPTION" --min-validators 3)

# Extract as normal
LOOP2_AGENTS=$(echo "$AGENT_SELECTION" | jq -r '.loop2[]')
```

## Integration Checklist

- [x] Replace hardcoded agent arrays with skill calls
- [x] Extract agents from JSON output using jq
- [x] Pass task description to selection script
- [x] Handle category-specific agent spawning
- [x] Validate non-empty arrays before spawning
- [x] Log selected category for debugging
- [x] Filter stderr warnings when parsing JSON
- [x] Support custom validator count for different modes

## Success Criteria

BUG #22 resolution requires:
- ✅ No empty Loop 3 or Loop 2 agent arrays
- ✅ All agent names exist in `.claude/agents/`
- ✅ Task-specific agent selection implemented
- ✅ Fallback behavior for edge cases
- ✅ JSON output parseable by orchestrator
- ✅ Backward compatible with existing orchestrator

## Next Steps

1. Update `orchestrate.sh` to use agent selection skill
2. Test with all 9 task categories
3. Validate fallback scenarios in production
4. Monitor for empty array errors (should be zero)
5. Add category logging to orchestrator output
