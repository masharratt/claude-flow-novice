---
name: cfn-loop-validation
description: "Multi-layer validation and quality gates for CFN Loop workflows. Use when implementing gate checks, consensus validation, or enforcing clean agent exit patterns."
version: 2.3.0
tags: [cfn-loop, validation, quality-gates, consensus, typescript]
status: production
confidence: 0.98
---

# CFN Loop Validation Skill

**Purpose:** Implement multi-layer validation and quality gates for CFN Loop workflows with clean agent exit patterns.

**Version:** 2.3.0
**Confidence:** 0.98
**Status:** Production Ready (Robustness Enhanced)

---

## Core Architecture

### Clean Agent Exit Protocol

**Critical Principle:** Agents MUST exit immediately after reporting confidence. No waiting mode for implementers/validators.

```bash
# ✅ CORRECT - Agent completion protocol
# Step 1: Complete work
# Step 2: Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Step 3: Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85 \
  --iteration 1

# Step 4: EXIT CLEANLY (no waiting mode)
# Agent process terminates here
```

```bash
# ❌ FORBIDDEN - Agents entering waiting mode
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "${AGENT_ID}" \
  --context "iteration-complete"
```

**Why Clean Exit Matters:**
- Prevents orchestrator blocking on `wait $PID`
- Enables adaptive agent specialization (different agents per iteration)
- Eliminates indefinite blocking scenarios
- Supports true parallel execution

### Validation Layers

#### Layer 1: Gate Validation (Loop 3 Self-Validation)
- **Threshold:** Mode-dependent (0.70-0.85)
- **Purpose:** Implementers self-assess work quality
- **Blocking:** Prevents validators from reviewing incomplete work

#### Layer 2: Consensus Validation (Loop 2 Validators)
- **Threshold:** Mode-dependent (0.80-0.95)
- **Purpose:** Independent quality assessment
- **Requirement:** Minimum 2 validators for robust consensus

#### Layer 3: Product Owner Decision
- **Purpose:** Strategic validation and scope enforcement
- **Options:** PROCEED/ITERATE/ABORT
- **Anti-Pattern Prevention:** Prevents "consensus on vapor"

### Dependency Enforcement

**Mandatory Flow:**
1. Loop 3 agents complete work
2. Gate check validates Loop 3 quality
3. **IF gate passes →** Signal `swarm:${TASK_ID}:gate-passed`
4. Loop 2 validators wait for gate signal via `blpop`
5. Loop 2 validators review and report consensus
6. Product Owner makes final decision

**Redis Coordination:**
```bash
# Loop 2 agents wait for gate signal
redis-cli blpop "swarm:${TASK_ID}:gate-passed" 0

# Gate signal sent by orchestrator
redis-cli lpush "swarm:${TASK_ID}:gate-passed" "true"
```

---

## Mode Configurations

### MVP Mode (Fast Validation)
- **Gate Threshold:** 0.70
- **Consensus Threshold:** 0.80
- **Max Iterations:** 5
- **Validators:** 2
- **Use Case:** Quick prototyping, proof-of-concepts

### Standard Mode (Balanced Quality)
- **Gate Threshold:** 0.75
- **Consensus Threshold:** 0.90
- **Max Iterations:** 10
- **Validators:** 3-4
- **Use Case:** Production features, standard development

### Enterprise Mode (Maximum Quality)
- **Gate Threshold:** 0.85
- **Consensus Threshold:** 0.95
- **Max Iterations:** 15
- **Validators:** 5
- **Use Case:** Critical systems, security-sensitive features

---

## Agent Lifecycle Management

### Coordinator Responsibilities
- Spawn agents via CLI (cost optimization)
- Manage Redis coordination
- Handle iteration logic
- Collect confidence scores
- Enforce dependency blocking

### Agent Responsibilities
- Complete assigned work
- Signal completion via Redis
- Report confidence score
- **Exit immediately (no waiting mode) - MANDATORY**

### Updated Agent Completion Protocol (v2.3)
```bash
# ✅ NEW MANDATORY PROTOCOL - All agents MUST follow
# Step 1: Complete work
# Step 2: Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Step 3: Report confidence score
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.92 \
  --iteration 1

# Step 4: EXIT CLEANLY (no waiting mode - agents MUST NOT enter waiting mode)
# Agent process terminates here - orchestrator uses wait $PID
exit 0
```

### Clean Exit Benefits
1. **No Blocking:** Orchestrator uses `wait $PID` successfully
2. **Adaptive Specialization:** Different agents per iteration
3. **Resource Efficiency:** No idle agent processes
4. **Simplified Debugging:** Clear agent lifecycle
5. **Prevents Orchestration Deadlock:** Eliminates indefinite agent blocking
6. **Enables True Parallelism:** Multiple agents can complete independently

### Forbidden Patterns (Critical Anti-Patterns)
```bash
# ❌ FORBIDDEN - Agents MUST NOT enter waiting mode
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "${AGENT_ID}" \
  --context "iteration-complete"

# ❌ FORBIDDEN - Only coordinators use waiting mode
if [[ "$AGENT_TYPE" != "coordinator" ]]; then
  echo "ERROR: Non-coordinator agents cannot use waiting mode"
  exit 1
fi
```

---

## Context Injection Patterns

### Multi-Layer Context Flow
```
Coordinator → Redis Storage → Orchestrator → Agent Spawning → Agent Context
```

**Critical Requirement:** Context must flow through ALL layers.

#### Context Components
- **Epic Context:** High-level goals and scope
- **Phase Context:** Sprint-specific requirements
- **Success Criteria:** Acceptance criteria and deliverables
- **Thresholds:** Gate and consensus values

#### Context Validation
1. **Coordinator:** Validates context has deliverables before spawning
2. **Orchestrator:** Validates Redis retrieval before agent spawning
3. **Agents:** Validate received context has required fields

**Anti-Pattern Prevention:** Avoid generic context when specifics exist in Redis.

---

## Quality Gates Implementation

### Deliverable Verification (STRAT-020)
**Mandatory check:** Validate actual file creation for implementation tasks.

```bash
# Check for deliverable creation
git_status=$(git status --porcelain 2>/dev/null || echo "")
if [[ -z "$git_status" ]] && [[ "$task_type" == "implementation" ]]; then
    # Force iteration - no files created
    consensus=0.0
    feedback="No deliverable files created. Must implement actual changes."
fi
```

### Confidence Scoring Patterns
- **Explicit Numeric:** `0.85` (preferred)
- **Percentage:** `85%` (supported)
- **Qualitative:** `high/medium/low` (converted to 0.8/0.5/0.2)
- **Calculated:** Based on deliverable completion

### Multi-Pattern Parsing (PATTERN-009)
```bash
# Extract confidence with fallback strategies
confidence=$(echo "$output" | grep -o "confidence: [0-9.]*" | tail -1 | cut -d' ' -f2)
if [[ -z "$confidence" ]]; then
    confidence=$(echo "$output" | grep -o "[0-9]*%" | tail -1 | sed 's/%//')
    if [[ -n "$confidence" ]]; then
        confidence=$(echo "scale=2; $confidence/100" | bc -l)
    fi
fi
```

---

## Testing and Validation

### Test Suite Requirements
- Validate clean agent exit
- Test dependency enforcement
- Verify context injection
- Check timeout handling
- Validate consensus calculations

### Key Test Cases
1. **Clean Exit Test:** Agents exit without waiting mode
2. **Blocking Test:** Loop 2 waits for Loop 3 gate signal
3. **Context Test:** Deliverables flow through all layers
4. **Iteration Test:** Quality gate triggers iteration
5. **Timeout Test:** Agents respect phase timeouts

---

## Integration Points

### Redis Coordination Skill
- Uses `invoke-waiting-mode.sh report` for confidence reporting
- No `enter` calls for implementers/validators
- Blocking via `blpop` for dependency enforcement

### Agent Spawning Skill
- CLI spawning for cost optimization
- Agent ID assignment and tracking
- Background process management

### Product Owner Decision Skill
- Structured decision parsing
- Deliverable validation
- Scope enforcement

---

## Error Handling and Recovery

### Timeout Scenarios
- **Phase-specific timeouts:** Based on work complexity
- **Agent timeout:** `timeout` command wrapper
- **Orchestrator timeout:** Background execution with monitoring

### Failure Recovery
- **Redis state cleanup:** Clear iteration data
- **Agent PID tracking:** Monitor and cleanup stuck processes
- **Context validation:** Fail-fast on missing context

---

## Performance Optimization

### Cost Savings
- **CLI Spawning:** 95-98% cost reduction vs Task()
- **Zero-Token Waiting:** Redis BLPOP for coordination
- **Parallel Execution:** Background agent spawning

### Resource Management
- **Clean Exit:** No idle agent processes
- **Timeout Enforcement:** Prevent resource leaks
- **Redis Cleanup:** Automatic state management

---

## Usage Examples

### Standard CFN Loop Execution
```bash
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "feature-auth-123" \
  --mode standard \
  --loop3-agents "backend-dev,security-specialist" \
  --loop2-agents "reviewer,tester,architect" \
  --product-owner "product-owner" \
  --phase-id "phase-2" \
  --epic-context '{"epicGoal":"Build auth system","inScope":["JWT","OAuth"]}' \
  --phase-context '{"deliverables":["auth.js","tests/auth.test.js"]}' \
  --success-criteria '{"acceptanceCriteria":["JWT tokens work","Tests pass"]}'
```

### Agent Implementation Protocol
```bash
# Agent receives task context
# Completes implementation work

# Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.92 \
  --iteration 1

# EXIT CLEANLY - no waiting mode
```

---

## Monitoring and Debugging

### Key Redis Keys
- `swarm:${TASK_ID}:${AGENT_ID}:done` - Completion signal
- `swarm:${TASK_ID}:${AGENT_ID}:confidence` - Confidence score
- `swarm:${TASK_ID}:gate-passed` - Gate signal
- `swarm:${TASK_ID}:epic-context` - Epic context
- `swarm:${TASK_ID}:success-criteria` - Acceptance criteria

### Debug Commands
```bash
# Check agent completion
redis-cli lrange "swarm:${TASK_ID}:${AGENT_ID}:done" 0 -1

# Check confidence scores
redis-cli get "swarm:${TASK_ID}:${AGENT_ID}:confidence"

# Monitor gate signals
redis-cli blpop "swarm:${TASK_ID}:gate-passed" 1
```

---

**Maintenance:** Regular validation of clean exit patterns and dependency enforcement. Test suite should validate all lifecycle scenarios.

---

## ⚠️ Bash Deprecation Notice

**The bash implementation of this skill is deprecated as of 2025-11-20.**

**Deprecation Date:** 2025-11-20  
**Removal Date:** 2026-02-20 (90 days)  
**TypeScript Implementation:** dist/validator.js and dist/cli/validate-*.js  
**Migration Guide:** .claude/skills/cfn-loop-validation/SKILL_TYPESCRIPT.md  

### Why Migrate to TypeScript?

- **Type Safety:** Zero runtime type errors with compile-time validation
- **Better Performance:** 5-10ms faster execution, optimized Redis operations
- **Comprehensive Testing:** 90%+ test coverage with unit, integration, and E2E tests
- **Modern Tooling:** Full IDE support, autocomplete, and inline documentation
- **Maintainability:** Single source of truth, easier debugging

### Automatic Migration

Set environment variable to automatically use TypeScript:

```bash
export USE_TYPESCRIPT=true
```

All coordinators and orchestrators will automatically prefer TypeScript implementations.

### Rollback

If issues arise:

```bash
export USE_TYPESCRIPT=false
```

Bash scripts will continue working for the 90-day deprecation period.

### See Also

- **Complete Deprecation List:** [docs/BASH_DEPRECATION_NOTICE.md](../../../docs/BASH_DEPRECATION_NOTICE.md)
- **TypeScript Benefits:** See individual migration guides
- **Test Coverage:** Run `npm test` to verify TypeScript implementation

---
