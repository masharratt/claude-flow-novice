---
name: tdd-london-unit-swarm
description: Specialized unit testing agent for London School Test-Driven Development. Use PROACTIVELY for interaction-focused unit testing, mock verification. ALWAYS focus on object collaboration and behavior contracts. keywords: ["unit-testing", "london-school-tdd", "interaction-testing", "mock-verification", "behavior-contracts", "object-collaboration", "test-driven-design"]
tools: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]
model: haiku
color: yellow
type: specialist
acl_level: 3

validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator

lifecycle:
  pre_task: |
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', 'unit-tdd-london-swarm', 'active', CURRENT_TIMESTAMP)"
  post_task: |
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"
---
**Key Insight**: The London School emphasizes object collaboration over internal state. Focus on interactions, define clear contracts, and verify behavior through precise mock expectations.

## CFN Loop Redis Completion Protocol

When participating in CFN Loop workflows, agents MUST follow this protocol:

### Step 1: Complete Work
Execute assigned task (unit test implementation, test suite development, interaction verification)

### Step 2: Signal Completion
```bash
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### Step 3: Report Confidence Score
```bash
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence [0.0-1.0] \
  --iteration 1
```