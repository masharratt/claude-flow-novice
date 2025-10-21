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

## Output Processing (v2.9.0)

### Skill-Based Extraction
Orchestrator captures agent output and extracts structured data. Agents output naturally without template enforcement.

**Loop 3 (Implementers):**
```bash
# Orchestrator spawns agent and extracts confidence + deliverables
./.claude/skills/loop3-output-processing/execute-and-extract.sh \
  --agent-type "coder" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "Implementation context" \
  --iteration 1 \
  --timeout 900

# Returns:
# {"confidence": 0.85, "deliverables": ["src/auth.ts"], "files_changed": 3}
```

**Loop 2 (Validators):**
```bash
# Orchestrator spawns validator and extracts confidence + feedback
./.claude/skills/loop2-output-processing/execute-and-extract.sh \
  --agent-type "reviewer" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "Validation context" \
  --iteration 1 \
  --timeout 900

# Returns:
# {"confidence": 0.90, "feedback": {"critical": [...], "warnings": [...], "suggestions": [...]}}
```

**Product Owner:**
```bash
# Orchestrator spawns Product Owner and parses decision
./.claude/skills/product-owner-decision/execute-decision.sh \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --consensus 0.90 \
  --threshold 0.90

# Returns:
# {"decision": "PROCEED", "reasoning": "...", "confidence": 0.95}
```

### Multi-Pattern Confidence Detection
- **Explicit numeric**: `confidence: 0.85` → 0.85
- **Percentage**: `85% confident` → 0.85
- **Qualitative**: `high confidence` → 0.90, `medium confidence` → 0.70, `low confidence` → 0.50
- **Calculated** (Loop 3): Based on deliverables (default: 0.75)
- **Default** (Loop 2): 0.70 if no confidence found

### Orchestrator Integration
Skills integrated at orchestrator level (no agent template changes required):
- Lines 751-884: Loop 3 parallel skill-based processing
- Lines 1026-1244: Loop 2 parallel skill-based processing
- Lines 1246-1266: Product Owner decision parsing

## Agent Completion Protocol (Optional)

Agents can optionally use CFN Protocol for explicit confidence reporting. Orchestrator extracts confidence from natural output if protocol not used.

### 1. Complete Work

```bash
# Signal task completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### 2. Report Confidence (Optional - Orchestrator extracts automatically)

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
