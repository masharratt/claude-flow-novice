# Product Owner Decision Skill

**Version:** 1.0.0
**Status:** Production
**Purpose:** Strategic decision-making for CFN Loop progression with guaranteed execution

---

## Overview

Provides autonomous Product Owner decision execution with:
- **Guaranteed Redis coordination** (orchestrator-controlled)
- **Output parsing with fallback patterns**
- **Decision validation** (ensures PROCEED/ITERATE/ABORT detection)
- **Context injection** (consensus, iteration, success criteria)

**Key Principle:** Orchestrator controls Redis coordination, agents focus on decision analysis.

---

## Architecture

### Skill Components

```
.claude/skills/product-owner-decision/
├── SKILL.md                          # This file
├── execute-decision.sh               # Main decision execution wrapper
├── parse-decision.sh                 # Output parsing with fallback patterns
└── validate-deliverables.sh          # Deliverable verification logic
```

### Decision Flow

```
1. Orchestrator → Spawn Product Owner with context
2. Skill → Capture agent output
3. Skill → Parse decision (PROCEED/ITERATE/ABORT)
4. Skill → Validate deliverables (for PROCEED)
5. Skill → Push decision to Redis
6. Skill → Signal completion
```

---

## Usage

### From Orchestrator (orchestrate-cfn-loop.sh)

```bash
# Replace Product Owner spawn+wait with skill execution
DECISION_RESULT=$(./.claude/skills/product-owner-decision/execute-decision.sh \
  --task-id "$TASK_ID" \
  --agent-id "$PO_UNIQUE_ID" \
  --consensus "$LOOP2_CONSENSUS" \
  --threshold "$CONSENSUS" \
  --iteration "$ITERATION" \
  --max-iterations "$MAX_ITERATIONS")

DECISION_TYPE=$(echo "$DECISION_RESULT" | jq -r '.decision')
```

### From Slash Commands

```bash
# Automatic - orchestrator uses skill by default
/cfn-loop "Implement feature" --mode=standard
```

---

## Parameters

### execute-decision.sh

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `--task-id` | Yes | CFN Loop task identifier | `cfn-auth-system-123` |
| `--agent-id` | Yes | Product Owner agent ID | `product-owner-1` |
| `--consensus` | Yes | Loop 2 consensus score | `0.92` |
| `--threshold` | Yes | Consensus threshold | `0.90` |
| `--iteration` | Yes | Current iteration number | `2` |
| `--max-iterations` | Yes | Max iterations allowed | `10` |
| `--success-criteria` | No | JSON success criteria | `{"tests":"pass"}` |

---

## Decision Logic (GOAP Framework)

### PROCEED
```bash
Consensus >= Threshold
AND Deliverables exist (for implementation tasks)
AND Iteration <= Max
```

### ITERATE
```bash
Consensus < Threshold
AND Iteration < Max
```

### ABORT
```bash
Iteration >= Max
OR Unrecoverable failure
```

---

## Output Parsing

### Pattern Matching (Robust)

```bash
# Primary: Labeled decision
grep -oiE "Decision:\s*(PROCEED|ITERATE|ABORT)"

# Fallback 1: Standalone keyword
grep -oE "(PROCEED|ITERATE|ABORT)"

# Fallback 2: Case-insensitive variations
grep -oiE "(proceed|iterate|abort)"
```

### Validation

```bash
if [ -z "$DECISION_TYPE" ]; then
  echo "❌ ERROR: Could not parse decision"
  echo "Product Owner output: $PO_OUTPUT"
  exit 1
fi
```

---

## Deliverable Verification

### For PROCEED Decisions

```bash
# Check git status for file changes
FILES_CHANGED=$(git status --short | grep -E "^(A|M|\?\?)" | wc -l)

if [ "$FILES_CHANGED" -eq 0 ]; then
  # Override PROCEED → ITERATE
  DECISION_TYPE="ITERATE"
  REASONING="No deliverables created - consensus on plans only"
fi
```

---

## Redis Coordination

### Keys Used

```bash
# Decision storage
swarm:${TASK_ID}:${AGENT_ID}:decision

# Completion signal
swarm:${TASK_ID}:${AGENT_ID}:done

# Metrics
swarm:${TASK_ID}:metrics:product_owner_decisions
```

### Decision JSON Format

```json
{
  "decision": "PROCEED|ITERATE|ABORT",
  "reasoning": "Explanation of decision",
  "confidence": 0.90,
  "iteration": 2,
  "consensus": 0.92,
  "deliverables_verified": true
}
```

---

## Error Handling

### Agent Timeout
```bash
# Use agent-specific timeout
PO_TIMEOUT=$(get_agent_timeout "product-owner" "$TASK_ID")
timeout "$PO_TIMEOUT" npx claude-flow-novice agent product-owner ...
```

### Parse Failure
```bash
# Fallback to ABORT with error context
DECISION_TYPE="ABORT"
REASONING="Failed to parse Product Owner decision after $RETRY_COUNT attempts"
```

### Deliverable Verification Failure
```bash
# Override PROCEED → ITERATE
DECISION_TYPE="ITERATE"
REASONING="Deliverable verification failed - no files created"
```

---

## Testing

### Unit Tests

```bash
# Test decision parsing
./.claude/skills/product-owner-decision/test-parse-decision.sh

# Test deliverable verification
./.claude/skills/product-owner-decision/test-deliverable-verification.sh
```

### Integration Tests

```bash
# Test full CFN Loop with Product Owner decisions
./.claude/skills/redis-coordination/test-orchestrator.sh
```

---

## Advantages Over Template-Based Approach

| Aspect | Template-Based | Skill-Based |
|--------|----------------|-------------|
| **Execution Guarantee** | ❌ Agent decides | ✅ Script enforces |
| **Redis Coordination** | ❌ Agent must execute | ✅ Orchestrator controls |
| **Output Parsing** | ❌ None | ✅ Robust fallback patterns |
| **Deliverable Verification** | ❌ Manual | ✅ Automated |
| **Error Handling** | ❌ Agent-dependent | ✅ Skill-controlled |
| **Testability** | ❌ Hard to test | ✅ Unit + integration tests |

---

## Migration from Template-Based

### Before (BUG #11)
```markdown
## Decision Execution Protocol (CRITICAL)
**YOUR TASK:** Use the Bash tool to execute:
bash ./.claude/skills/redis-coordination/execute-product-owner-decision.sh
```

Agent output: `bash execute-product-owner-decision.sh` (NOT executed)

### After (Skill-Based)
```bash
# Orchestrator uses skill directly
DECISION_RESULT=$(./.claude/skills/product-owner-decision/execute-decision.sh \
  --task-id "$TASK_ID" ...)
```

Skill executes, parses, validates, pushes to Redis → Guaranteed

---

## Agent Template Simplification

Product Owner template becomes pure decision analysis:

```markdown
## Decision Framework

Make strategic decision for CFN Loop progression:

- **PROCEED:** Quality threshold met, deliverables complete
- **ITERATE:** Improvements needed, iterations remaining
- **ABORT:** Max iterations reached or unrecoverable failure

Consider:
- Loop 2 consensus vs threshold
- Current iteration vs max iterations
- Deliverable completeness
- Success criteria satisfaction

Output format:
Decision: PROCEED|ITERATE|ABORT
Reasoning: [explanation]
```

Agent focuses on **analysis**, skill handles **execution**.

---

## Metrics

### Decision Tracking
```bash
# Store all Product Owner decisions
redis-cli LPUSH "swarm:${TASK_ID}:metrics:product_owner_decisions" "$DECISION_JSON"

# Count decision types
redis-cli INCR "swarm:metrics:decisions:proceed"
redis-cli INCR "swarm:metrics:decisions:iterate"
redis-cli INCR "swarm:metrics:decisions:abort"
```

### Performance
```bash
# Decision latency (time from Loop 2 complete to decision)
DECISION_START=$(date +%s)
DECISION_RESULT=$(execute-decision.sh ...)
DECISION_END=$(date +%s)
LATENCY=$((DECISION_END - DECISION_START))
```

---

## Related Skills

- **Redis Coordination** (`.claude/skills/redis-coordination/SKILL.md`)
- **CFN Loop Validation** (`.claude/skills/cfn-loop-validation/SKILL.md`)

---

## Version History

### 1.0.0 (2025-10-20)
- Initial skill creation
- Solves BUG #11 (Product Owner execution failure)
- Orchestrator-controlled decision execution
- Robust output parsing with fallbacks
- Automated deliverable verification
