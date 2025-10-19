---
name: CFN Loop Validation
version: 2.2.0
complexity: High
status: OPERATIONAL
keywords: [
    "consensus-driven",
    "validation framework",
    "adaptive thresholds",
    "quality assurance",
    "multi-mode validation",
    "agent-accessible",
    "CLI wrapper",
    "claim validation"
]
triggers: [
    "complex system architecture validation",
    "iterative quality assessment",
    "multi-phase validation",
    "feedback cycles",
    "improvement cycles",
    "CFN loop iteration validation",
    "claim-based verification"
]
performance_targets: {
    "consensus_accuracy": 90,
    "validation_speed_ms": 1000,
    "max_parallel_validators": 15,
    "resource_utilization_pct": 50,
    "claim_validation_threshold": 0.8
}
---
# CFN Loop Validation Skill
## Overview
Advanced validation framework for iterative development workflows, enabling dynamic consensus calculation, multi-mode validation, and adaptive quality assurance across complex system development. Now with claim validation support in agent-accessible CLI wrapper.
## Status: OPERATIONAL
The CFN Loop Validation skill is fully operational with the following components:
- CLI Wrapper: `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-validation/validate-iteration.sh`
- Configuration: `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-validation/config.json`
- Consensus Calculator: `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-validation/consensus-calculator.js`
- Evidence Database: `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-validation/evidence-chain.sql`
---
# [Rest of previous SKILL.md content remains the same, with following updates]

## 10. CFN Loop Orchestration (NEW in v2.2.0)

### Orchestration Script
The CFN Loop skill now includes **automatic dependency orchestration** via `orchestrate-cfn-loop.sh`.

**Purpose:** Ensures agents complete work in the correct order with BLPOP-based dependency enforcement.

### Loop Structure
```
Loop 3 (Primary Swarm - Implementers)
  ↓ [BLPOP blocks until all Loop 3 agents signal :done]
Loop 2 (Consensus - Validators)
  ↓ [BLPOP blocks until all Loop 2 agents signal :done]
Product Owner (GOAP Decision)
  ↓ Decision: PROCEED | RELAUNCH iteration N+1
```

### Dependency Enforcement (CORRECTED - Self-Validation Pattern)
```bash
# 1. Loop 3 agents complete and self-validate
for agent in loop3-agents; do
  redis-cli blpop "swarm:${TASK_ID}:${agent}:done" 0
done

# 2. Gate check on Loop 3 self-validation
if gate_passed; then
  # Signal Loop 2 validators to start
  redis-cli lpush "swarm:${TASK_ID}:gate-passed" "{\"loop3_confidence\": $CONFIDENCE}"
else
  # Relaunch Loop 3 for iteration N+1 (skip Loop 2)
  wake_loop3_agents
  continue
fi

# 3. Loop 2 agents WAIT for gate pass signal
# (Each validator blocks until gate passes)
redis-cli blpop "swarm:${TASK_ID}:gate-passed" 0

# 4. Loop 2 agents complete validation
for validator in loop2-agents; do
  redis-cli blpop "swarm:${TASK_ID}:${validator}:done" 0
done

# 5. Product Owner makes decision based on Loop 2 consensus
```

### Usage
```bash
./orchestrate-cfn-loop.sh \
  --task-id "sprint1-feature-x" \
  --mode standard \
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --product-owner "product-owner" \
  --max-iterations 10
```

### Agent Requirements
Each agent MUST signal completion:
```bash
# After completing work, agent signals done
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Then report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85

# Then enter waiting mode for next iteration
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-complete"
```

### Benefits
- ✅ **Automatic dependency blocking** - No manual coordination needed
- ✅ **Zero-token waiting** - Agents blocked via BLPOP (no API calls)
- ✅ **Consistent enforcement** - Same pattern across all CFN loops
- ✅ **Product Owner protection** - Cannot collect before validators finish
- ✅ **Iteration management** - Automatic wake-up for next iteration

## 11. Version History
### v2.2.0 (2025-10-18)
- **NEW:** Added `orchestrate-cfn-loop.sh` for dependency orchestration
- Automatic BLPOP-based dependency blocking between loops
- Product Owner integration with consensus-ready signals
- Iteration management with automatic wake-up
- Prevents premature consensus collection
### v2.1.0 (2025-10-18)
- Added claim-based validation support
- New `--claims` CLI flag for JSON claim validation
- Claim confidence scoring
- Detailed claim validation metrics
- Support for legacy system claim integration
### v2.0.0 (2025-10-18)
- Added agent-accessible CLI wrapper (`validate-iteration.sh`)
- Updated configuration with TypeScript alignment
- Comprehensive documentation for integration patterns
- Evidence chain persistence
- JSON output mode for agent consumption
### v1.0.5 (Previous)
- Basic validation framework
- Consensus calculator
- Evidence database schema

## 11. Agent Completion Protocol (STRAT-003)

**Pattern:** Explicit multi-step process for agent task completion in CFN Loops.

When building agent completion protocols, design explicit multi-step processes that include work completion, status signaling, confidence reporting, and explicit waiting modes. This prevents race conditions and ensures proper dependency blocking.

### 4-Step Completion Protocol

```bash
# Step 1: Complete work
# Agent performs implementation/validation tasks

# Step 2: Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Step 3: Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85 \
  --iteration 1

# Step 4: Enter waiting mode
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-complete"
```

### Benefits
- **Race condition prevention**: Explicit signaling prevents premature collection
- **Clear state transitions**: Each step has observable state in Redis
- **Confidence tracking**: Separate confidence reporting for gate checks
- **Iteration support**: Agents can be woken for retry without respawning

### Integration with Orchestration
The orchestrator (`.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`) enforces this protocol by:
1. BLPOP blocking on `:done` signals (Step 2)
2. Collecting confidence scores (Step 3)
3. Waking agents for next iteration if needed (Step 4)

## 12. Claim Validation
### Claim Validation Overview
Claim-based validation enables granular assessment of iteration results through explicit claim confidence scoring.

#### Claim Structure
```json
{
  "id": "claim_001",
  "description": "Authentication flow meets OAUTH2 standards",
  "confidence": 0.85,
  "strategy": "oauth_standard_check"
}
```

### Claim Validation CLI Usage
```bash
# Validate with claims
./validate-iteration.sh \
  --mode enterprise \
  --iteration 1 \
  --confidence 0.88 \
  --claims '[
    {
      "id": "auth_security",
      "description": "Secure authentication flow",
      "confidence": 0.90
    },
    {
      "id": "oauth_compliance",
      "description": "OAUTH2 compliance",
      "confidence": 0.75
    }
  ]'
```

### Claim Validation Result Example
```json
{
  "claims": {
    "total_count": 2,
    "valid_count": 1,
    "invalid_count": 1,
    "confidence": 0.5,
    "details": [
      {
        "id": "auth_security",
        "description": "Secure authentication flow",
        "confidence": 0.90,
        "valid": true
      },
      {
        "id": "oauth_compliance",
        "description": "OAUTH2 compliance",
        "confidence": 0.75,
        "valid": false
      }
    ]
  }
}
```

### Claim Validation Metrics
- **Confidence Threshold:** 0.8 (configurable)
- **Metrics Captured:**
  - Total claims
  - Valid claims
  - Invalid claims
  - Overall claim confidence
  - Detailed claim validation

[Rest of the previous SKILL.md remains unchanged]