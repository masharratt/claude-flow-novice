# CFN Loop Orchestration Cheatsheet (v2)

## V2 Migration Overview

### Key Changes from V1
- Replaced manual Task() spawning with `orchestrate-cfn-loop.sh`
- Introduced zero-token waiting mode coordination
- Implemented explicit dependency enforcement
- Added cost-savings mode support
- Enhanced Redis coordination with BLPOP primitives

## Orchestration Modes

### Mode Comparison

| Mode       | Gate  | Consensus | Max Iterations | Validators |
|------------|-------|-----------|----------------|------------|
| MVP        | ≥0.65 | ≥0.85     | 5              | 2          |
| Standard   | ≥0.75 | ≥0.90     | 10             | 4          |
| Enterprise | ≥0.85 | ≥0.95     | 15             | 5          |

## Basic Orchestration Command

```bash
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "unique-task-id" \
  --mode standard \
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --product-owner "product-owner" \
  --max-iterations 10
```

## Agent Completion Protocol

### 1. Complete Work

```bash
# Signal task completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### 2. Report Confidence

```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85 \
  --iteration 1
```

### 3. Enter Waiting Mode

```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-complete"
```

## Cost-Savings Mode

### Coordinator Selection

```bash
# Cost-Savings Mode (Enabled)
COST_SAVINGS_MODE=yes:
  - CFN Loop tasks → cost-savings-cfn-loop-coordinator

# Standard Mode (Default)
COST_SAVINGS_MODE=no (or unset):
  - CFN Loop tasks → cfn-loop-coordinator (Task tool)
```

## Best Practices

1. **Always use orchestrator** for multi-agent workflows
2. Spawn coordinator + agents in a single message
3. Use parallel spawning for coordinator-based workflows
4. Implement comprehensive test coverage
5. Validate consensus and gate thresholds

## Troubleshooting

### Common Issues
- Agents blocking indefinitely without coordinator
- Premature consensus collection
- Iteration management failures

### Recommended Solutions
- Always use `./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
- Implement comprehensive error handling
- Use waiting mode protocol consistently

## Migration Guide

### V1 to V2 Transition

**Old (V1) Pattern:**
```bash
Task("researcher", "Investigate task...")
Task("backend-dev", "Implement solution...")
```

**New (V2) Pattern:**
```bash
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "migration-task" \
  --mode standard \
  --loop3-agents "researcher,backend-dev"
```

## References
- Redis Coordination Skill: `.claude/skills/redis-coordination/SKILL.md`
- CFN Loop Validation Skill: `.claude/skills/cfn-loop-validation/SKILL.md`
