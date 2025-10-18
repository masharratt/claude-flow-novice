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

### Main Chat Role (Thin Orchestration Layer)
* Spawn coordinator + agents in single message
* Delegate ALL coordination to skills
* Use skill-specific configuration for complex workflows

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
- Waiting Mode + Wake-Up Mechanisms

## 4) CFN Loop Overview

**Skill-Driven Loop Management**
- Coordination via `.claude/skills/cfn-loop-validation/SKILL.md`
- Adaptive context injection
- Modular loop progression

**Mode Comparison:**

| Mode | Gate | Consensus | Iterations | Validators |
|------|------|-----------|------------|------------|
| MVP | ≥0.65 | ≥0.85 | 5 | 2 |
| Standard | ≥0.75 | ≥0.90 | 10 | 4 |
| Enterprise | ≥0.85 | ≥0.95 | 15 | 5 |

## 5) Skill Management

### Skill Development Guidelines
- Maximum modularity
- Clear, explicit interfaces
- Minimal external dependencies
- Comprehensive test coverage

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