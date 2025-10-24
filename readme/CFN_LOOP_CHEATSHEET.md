# CFN Loop Orchestration Cheatsheet (v2.7)

## V2.7 Migration Overview

### Key Changes from V2.0
- **Feedback Accumulation** (v2.7): Multi-iteration learning via Redis history
- **Validator Feedback** (v2.7): Structured JSON feedback from Loop 2 validators
- **Sprint Execution** (v2.7): Sprint-aware context vs epic-level scope

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
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
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

## Feedback Accumulation (v2.7)

### Iterative Learning
Feedback accumulates across iterations, enabling agents to learn from previous mistakes.

**Redis Storage:**
- `swarm:${TASK_ID}:feedback:history` - Implementation feedback (deliverable_check, gate_check, product_owner_iterate)
- `swarm:${TASK_ID}:validator:history` - Validator feedback (CRITICAL/WARNING/SUGGESTION)

**Feedback Sources:**
1. **Deliverable Check**: No files created despite implementation
2. **Gate Check**: Confidence below threshold
3. **Product Owner ITERATE**: Consensus below threshold
4. **Validator Feedback**: Structured JSON from Loop 2 validators

**Context Injection:**
- Loop 3 (iteration > 1): Prepend full feedback history to implementer context
- Loop 2 (iteration > 1): Prepend validator history to validator context

**Sprint Execution:**
```bash
./.claude/skills/sprint-execution/execute-sprint-task.sh \
  coder \
  task-123 \
  agent-456 \
  sprint-1.1
```

**Impact**: Consensus improvement 0.81 → 0.90+ through iterative learning

## Agent Lifecycle (v3 Stateless)

Agents in v3 follow stateless lifecycle: spawn → work → report → exit. No waiting mode.

### 1. Agent Spawns with Context

```bash
# Orchestrator spawns agent with Redis context
npx claude-flow-novice agent "backend-dev" \
  --task-id "$TASK_ID" \
  --context "$(redis-cli hget swarm:$TASK_ID:epic-context epic_goal)"
```

### 2. Agent Works and Reports

Agents complete work and output confidence naturally. Orchestrator extracts confidence using skill-based parsing.

### 3. Agent Exits

Agent process exits after completion. For next iteration, orchestrator spawns fresh agent with updated context from Redis.

## Cost-Savings Mode

### Coordinator Selection

```bash
# Cost-Savings Mode (Enabled)
COST_SAVINGS_MODE=yes:
  - CFN Loop tasks → cfn-v3-coordinator

# Standard Mode (Default)
COST_SAVINGS_MODE=no (or unset):
  - CFN Loop tasks → cfn-loop-coordinator (Task tool)
```

## Context Injection Pattern (v3)

Agents receive complete context via `--context` parameter, retrieved from Redis:

```bash
# Orchestrator retrieves context for agent
EPIC_CONTEXT=$(redis-cli hgetall "swarm:$TASK_ID:epic-context")
PHASE_CONTEXT=$(redis-cli hgetall "swarm:$TASK_ID:phase-context")

# Spawn agent with complete context
npx claude-flow-novice agent "backend-dev" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "Epic: $EPIC_CONTEXT | Phase: $PHASE_CONTEXT | Deliverables: file1.ts,file2.md"
```

## Confidence Collection (v3)

Stateless confidence collection after agents exit:

```bash
# Collect confidence scores from completed agents
./.claude/skills/redis-coordination/collect-confidence-scores.sh \
  --task-id "$TASK_ID" \
  --agent-ids "agent1,agent2,agent3"

# Returns consensus score
# Output: 0.87
```

## Best Practices

1. **Always use orchestrator** for multi-agent workflows
2. Store all context in Redis before spawning agents
3. Use stateless agent spawning (no waiting mode)
4. Collect confidence after agent processes exit
5. Validate consensus and gate thresholds

## Troubleshooting

### Common Issues
- Missing context in agent spawns
- Confidence extraction failures
- Redis context storage issues

### Recommended Solutions
- Always use `./.claude/skills/cfn-loop-orchestration/orchestrate.sh`
- Store context in Redis before spawning agents
- Use skill-based output processing for confidence extraction
- Verify Redis keys exist before retrieval

## Migration Guide

### V2 to V3 Transition

**Old (V2) Pattern - Waiting Mode:**
```bash
# Agents entered waiting mode, woken by coordinator
invoke-waiting-mode.sh enter --task-id "$TASK_ID"
invoke-waiting-mode.sh wake --task-id "$TASK_ID"
```

**New (V3) Pattern - Stateless:**
```bash
# Agents exit after work, fresh spawn for iterations
npx claude-flow-novice agent "backend-dev" \
  --task-id "$TASK_ID" \
  --context "$(redis-cli hget swarm:$TASK_ID:context iteration_feedback)"
```

### V1 to V2 Transition

**Old (V1) Pattern:**
```bash
Task("researcher", "Investigate task...")
Task("backend-dev", "Implement solution...")
```

**New (V2) Pattern:**
```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "migration-task" \
  --mode standard \
  --loop3-agents "researcher,backend-dev"
```

## References
- Redis Coordination Skill: `.claude/skills/redis-coordination/SKILL.md`
- CFN Loop Validation Skill: `.claude/skills/cfn-loop-validation/SKILL.md`
