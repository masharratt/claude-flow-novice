# Claude Flow Novice — AI Agent Orchestration

**🚀 Production Status:** Skills-First Migration Completed (Phase 8 - 2025-10-18)

---

## 1) Critical Rules (Single Source of Truth)

### Skills-Based Coordination
**Core Skills:**
- Redis Coordination (`.claude/skills/redis-coordination/SKILL.md`)
- Agent Spawning (`.claude/skills/agent-spawning/SKILL.md`)
- CFN Loop Validation (`.claude/skills/cfn-loop-validation/SKILL.md`)

**Coordination Principles:**
* ALL agent communication via explicit Redis pub/sub dependencies
* Modular, independently maintainable skills
* Minimal, focused coordination logic
* **Multi-layer enforcement**: When designing distributed systems, implement coordination primitives at multiple layers (technical, skill, cross-reference, agent, system, entry) to ensure consistent behavior across all workflows
* **Centralized orchestration**: Keep orchestration logic in dedicated coordination skills (e.g., Redis Coordination) rather than distributing it across multiple components

### Main Chat Role (Thin Orchestration Layer)
* Spawn coordinator + agents in single message
* Delegate ALL coordination to skills
* Use skill-specific configuration for complex workflows

### Cost-Savings Mode (CLI Spawning)
**Enable:** Set `COST_SAVINGS_MODE=yes` in root CLAUDE.md
**Default:** Disabled (safe mode with Task tool)

**Coordinator Selection:**
```
COST_SAVINGS_MODE=yes:
  - General tasks → cost-savings-coordinator (CLI spawning, 95-98% savings)
  - CFN Loop tasks → cost-savings-cfn-loop-coordinator (CLI spawning, 95-98% savings)

COST_SAVINGS_MODE=no (or unset):
  - General tasks → coordinator (Task tool, safe default)
  - CFN Loop tasks → cfn-loop-coordinator (Task tool, safe default)
```

**The 4 Core Coordinators:**
1. `coordinator` - Task tool spawning (safe, expensive)
2. `cost-savings-coordinator` - CLI spawning (fast, cheap)
3. `cfn-loop-coordinator` - CFN Loop with Task tool (consensus, expensive)
4. `cost-savings-cfn-loop-coordinator` - CFN Loop with CLI (consensus, cheap)

### Post-Edit Validation (REQUIRED for all Edit/Write operations)
**After ANY Edit/Write/MultiEdit operation, agents MUST run:**
```bash
./.claude/hooks/invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"
```

**Why:** Prevents TypeScript errors from propagating. Non-blocking by default.
**Config:** `.claude/hooks/post-edit.config.json`
**Skill:** `.claude/skills/hook-pipeline/SKILL.md`

## 2) Skill-Driven Agent Execution

### Skill Selection Criteria
**Mandatory Skill Spawning Triggers:**
- Complex tasks (>3 steps)
- Multi-file operations
- Research + implementation + testing
- Design decisions
- Code quality assessment
- Performance optimization
- System integration

### Spawning Pattern
```bash
# Explicit skill-based agent spawning
npx claude-flow-novice swarm "Task Description" \
  --skills=redis-coordination,agent-spawning \
  --strategy development
```

## 3) Coordination Patterns

**Redis Coordination Patterns**
Refer to `.claude/skills/redis-coordination/SKILL.md` for:
- Simple Chain Coordination
- Hierarchical Broadcast
- Mesh Hybrid Patterns
- **Waiting Mode + Wake-Up** (✅ Operational)

### Redis Waiting Mode (Zero-Token Agent Coordination)

**Use Case:** CFN Loop iterations, long-running tasks, multi-agent consensus

**Agent enters waiting mode:**
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-1"
```

**Coordinator wakes agent:**
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --reason cfn_loop_iteration \
  --iteration 2 \
  --feedback "Add error handling,Improve test coverage"
```

**Agent reports result:**
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.92 \
  --iteration 2
```

**Coordinator collects results:**
```bash
CONSENSUS=$(./claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
  --task-id "$TASK_ID" \
  --agent-ids "coder-1,reviewer-1,tester-1,security-1")

if (( $(echo "$CONSENSUS >= 0.90" | bc -l) )); then
  echo "✅ Consensus reached: $CONSENSUS"
fi
```

**Benefits:**
- 🚀 Zero token cost while waiting (BLPOP blocks, no API calls)
- 🔄 Context preserved across iterations
- ⚡ Instant wake-up (<100ms latency)
- 📈 Scalable (10+ agents, indefinite cycles)

**Key Pattern (STRAT-002):**
Use zero-token blocking mechanisms (like Redis BLPOP) to create efficient, low-overhead synchronization between agents without incurring API call costs. Validated by 8/8 passing tests in orchestrator test suite.

## 4) CFN Loop Overview

**Skill-Driven Loop Management**
- Coordination via `.claude/skills/cfn-loop-validation/SKILL.md`
- **Automatic dependency orchestration** (v2.2.0)
- Adaptive context injection
- Modular loop progression

**Mode Comparison:**

| Mode | Gate | Consensus | Iterations | Validators |
|------|------|-----------|------------|------------|
| MVP | ≥0.65 | ≥0.85 | 5 | 2 |
| Standard | ≥0.75 | ≥0.90 | 10 | 4 |
| Enterprise | ≥0.85 | ≥0.95 | 15 | 5 |

### CFN Loop Dependency Enforcement (MANDATORY)

**All CFN loops MUST use orchestration to enforce dependencies:**

```bash
# REQUIRED: Use orchestrator instead of manual Task() spawning
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "unique-task-id" \
  --mode standard \
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --product-owner "product-owner" \
  --max-iterations 10
```

**Why Orchestration is Mandatory:**
- ✅ Loop 2 validators BLOCKED until Loop 3 complete (BLPOP)
- ✅ Product Owner BLOCKED until Loop 2 complete (BLPOP)
- ✅ Prevents premature consensus collection
- ✅ Automatic iteration management
- ✅ Zero-token waiting between loops

**Agent Completion Protocol:**
Each agent MUST signal completion before entering waiting mode:

```bash
# 1. Complete work
# 2. Signal done
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# 3. Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85 \
  --iteration 1

# 4. Enter waiting mode
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-complete"
```

**Orchestration handles:**
- Automatic BLPOP blocking between loops
- Consensus collection after all agents report
- Wake-up for next iteration if consensus not reached
- Final completion when consensus achieved

## 5) Skill Management

### Skill Development Guidelines
- Maximum modularity
- Clear, explicit interfaces
- Minimal external dependencies
- Comprehensive test coverage

**Testing Best Practice (STRAT-005):**
Implement comprehensive test suites that validate both functional requirements and edge cases, including timeout scenarios and blocking mechanism effectiveness. Example: `.claude/skills/redis-coordination/test-orchestrator.sh` validates BLPOP blocking, agent completion protocol, and consensus collection with 8 targeted tests.

### Skill Maintenance
- Monthly functional review
- Quarterly performance audit
- Continuous improvement cycle

## 6) Additional Resources

**Skill References:**
- Redis Coordination: `.claude/skills/redis-coordination/SKILL.md`
- Agent Spawning: `.claude/skills/agent-spawning/SKILL.md`
- CFN Loop Validation: `.claude/skills/cfn-loop-validation/SKILL.md`

**Maintenance Plans:**
- Rollback Strategy: `planning/skills/ROLLBACK_PLAN.md`
- Maintenance Schedule: `planning/skills/MAINTENANCE_SCHEDULE.md`

**Migration Analytics:**
See `.artifacts/analytics/context-reduction-report.json`