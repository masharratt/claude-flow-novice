# CFN Loop Quick Reference Cheatsheet

**🔄 SELF-LOOPING SYSTEM**: The CFN Loop operates autonomously. Each failure triggers IMMEDIATE self-correction. NO WAIT for approval - system continues until consensus achieved.

## Quick Start Commands

```bash
# 1. Single-Phase CFN Loop (Original)
/cfn-loop "Implement JWT auth" --phase=auth --max-loop2=10 --max-loop3=10

# 2. Multi-Sprint Phase (NEW - Execute 3 sprints in sequence)
/cfn-loop-sprints "Authentication System" --sprints=3 --max-loop2=10

# 3. Multi-Phase Epic (NEW - Execute complete epic with phases)
/cfn-loop-epic "User Management System" --phases=4 --max-loop2=10

# 4. Initialize Swarm (MANDATORY for multi-agent tasks)
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",          # mesh (2-7 agents) | hierarchical (8+)
  maxAgents: 3,              # match actual agent count
  strategy: "balanced"       # balanced | adaptive
})

# 5. Spawn All Agents (single message)
Task("Agent 1", "Instructions", "type")
Task("Agent 2", "Instructions", "type")
Task("Agent 3", "Instructions", "type")

# 6. Post-Edit Hook (MANDATORY after EVERY file edit)
npx enhanced-hooks post-edit "file.js" \
  --memory-key "swarm/agent/task" \
  --minimum-coverage 80 \
  --structured

# 4. Check Swarm Status
npx claude-flow-novice swarm status --swarm-id task-swarm

# 5. View Memory
npx claude-flow-novice memory search "swarm/*"

# 6. Export Metrics
npx claude-flow-novice metrics export --format json
```

## Confidence Score Quick Reference

### Formula
```javascript
confidence = (testsPassed × 0.30) + (coverage × 0.25) +
             (noSyntaxErrors × 0.15) + (noSecurityIssues × 0.20) +
             (formattingCorrect × 0.10)
```

### Thresholds
| Phase | Threshold | Meaning |
|-------|-----------|---------|
| Self-Validation | 0.75 | Agent proceeds to consensus |
| Consensus Agreement | 0.90 | Validators approve |
| Consensus Confidence | 0.90 | Average validator confidence |
| Coverage Minimum | 0.80 | Test coverage requirement |

### Interpretation Table
| Score | Status | Action |
|-------|--------|--------|
| 1.00 | Perfect | Proceed to consensus |
| 0.75-0.99 | Pass | Proceed to consensus |
| 0.50-0.74 | Fail | Retry with feedback |
| 0.00-0.49 | Critical | Block and fix |

### Common Values
```javascript
// Perfect (1.00): All criteria met
{ testsPassed: true, coverage: 90, noSyntaxErrors: true,
  securityIssues: [], formattingCorrect: true }

// Pass (0.88): Minor coverage gap
{ testsPassed: true, coverage: 82, noSyntaxErrors: true,
  securityIssues: [{severity: "low"}], formattingCorrect: true }

// Fail (0.45): Tests missing
{ testsPassed: false, coverage: 0, noSyntaxErrors: true,
  securityIssues: [], formattingCorrect: true }
```

## Hook Commands (Copy-Paste Ready)

### Post-Edit Hook
```bash
# Standard (JavaScript/TypeScript)
npx enhanced-hooks post-edit "src/component.js" \
  --memory-key "swarm/coder/feature-name" \
  --minimum-coverage 80 \
  --structured

# Rust
npx enhanced-hooks post-edit "src/lib.rs" \
  --memory-key "swarm/backend-dev/rust-module" \
  --minimum-coverage 90 \
  --structured

# Python
npx enhanced-hooks post-edit "app/main.py" \
  --memory-key "swarm/backend-dev/api" \
  --minimum-coverage 80 \
  --structured
```

### Pre-Command Hook
```bash
npx claude-flow-novice hooks pre-command \
  --command "deploy" \
  --validate-safety true \
  --prepare-resources true
```

### Session Management
```bash
# Generate summary and persist state
npx claude-flow-novice hooks session-end \
  --generate-summary true \
  --persist-state true \
  --export-metrics true
```

## Memory Namespace Patterns

### Sprint/Phase Memory (NEW)
```
cfn-loop/epic-{id}/phase-{n}/sprint-{m}/iteration-{i}
Example: cfn-loop/epic-user-mgmt/phase-1/sprint-2/iteration-3
```

### Agent Task Memory
```
swarm/{agent-id}/{task-name}
Example: swarm/backend-dev/jwt-auth
```

### Consensus Memory
```
swarm/consensus/{task-id}/round-{n}
Example: swarm/consensus/jwt-auth/round-1
```

### Iteration Feedback
```
swarm/iterations/round-{n}/feedback
Example: swarm/iterations/round-2/feedback
```

### Learning Patterns
```
swarm/{agent-id}/learning/patterns
Example: swarm/backend-dev/learning/patterns
```

### Pattern Examples
```javascript
// Sprint memory (NEW)
"cfn-loop/epic-user-mgmt/phase-1/sprint-1/iteration-0"

// Agent task
"swarm/coder/user-profile"

// Consensus validation
"swarm/consensus/auth-feature/round-3"

// Feedback injection
"swarm/iterations/round-2/feedback"

// Learning data
"swarm/security-specialist/learning/patterns"
```

## Troubleshooting Quick Fixes

### Circuit Breaker Stuck
```bash
# Reset specific breaker
npx claude-flow-novice circuit-breaker reset auth-implementation

# Reset all breakers
npx claude-flow-novice circuit-breaker reset-all

# Check breaker state
npx claude-flow-novice circuit-breaker status auth-implementation
```

### Low Confidence Score
```bash
# 1. Check validation breakdown
npx enhanced-hooks post-edit "file.js" --structured

# 2. Identify missing component (usually tests)
# Output shows: testsPassed: false, coverage: 0

# 3. Add tests first, then re-run
npx enhanced-hooks post-edit "file.js" --structured
```

### Memory Leak
```bash
# Clear phase history
npx claude-flow-novice memory clear-phase auth-implementation

# Full cleanup
npx claude-flow-novice memory cleanup --max-age 7d
```

### Tests Failing
```bash
# Run tests individually
npm test -- --testPathPattern=your-test.test.js

# Debug with verbose output
DEBUG=* npm test -- your-test.test.js

# Check coverage
npm test -- --coverage --testPathPattern=your-test.test.js
```

## Agent Configuration Tables

### Agent Type → Use Case
| Type | Use Case |
|------|----------|
| `coder` | General implementation, bug fixes |
| `tester` | Unit/integration tests |
| `reviewer` | Code quality, architecture |
| `security-specialist` | Security audits, auth, encryption |
| `backend-dev` | APIs, databases, servers |
| `frontend-dev` | UI, client-side logic |
| `devops-engineer` | Docker, K8s, CI/CD |
| `api-docs` | API specs, documentation |
| `perf-analyzer` | Performance optimization |
| `system-architect` | System design, scalability |

### Complexity → Agent Count
| Complexity | Steps | Agent Count | Team |
|------------|-------|-------------|------|
| Simple | 3-5 | 2-3 | coder + tester + reviewer |
| Medium | 6-10 | 4-6 | + researcher + architect + security |
| Complex | 11-20 | 8-12 | Full specialist team |
| Enterprise | 20+ | 15-20 | + devops + api-docs + perf-analyzer |

### Topology Selection Guide
| Agents | Topology | Structure |
|--------|----------|-----------|
| 2-7 | mesh | Peer-to-peer, equal collaboration |
| 8+ | hierarchical | Coordinator-led, structured delegation |

## Security Checklist

### Input Validation ✓
- [ ] Iteration limits validated (1-100)
- [ ] Confidence thresholds validated (0.0-1.0)
- [ ] Agent count validated (1-20)
- [ ] File paths sanitized

### Feedback Sanitization ✓
- [ ] Automatic prompt injection prevention
- [ ] Maximum length enforced (5000 chars)
- [ ] Malicious patterns blocked
- [ ] Command injection prevented

### Memory Cleanup ✓
- [ ] LRU eviction enabled (max 100 entries)
- [ ] Issue deduplication active
- [ ] Periodic cleanup scheduled
- [ ] Phase history clearable

### Circuit Breaker ✓
- [ ] Timeout configured (default: 30min)
- [ ] Failure threshold set (default: 3)
- [ ] Cooldown period enforced (default: 5min)
- [ ] State monitoring active

## CFN Loop Execution Flow

```
┌─────────────────────────────────────┐
│ LOOP 1: Initialize Swarm            │
│ • swarm_init(topology, maxAgents)   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ LOOP 2: Execution (Max 3 Retries)   │
│ • Spawn primary agents              │
│ • Run post-edit hooks               │
│ • Self-validation (threshold: 0.75) │
│ • GATE 1: Pass → Loop 3             │
│           Fail → Retry with feedback│
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ LOOP 3: Consensus (Max 10 Rounds)   │
│ • Spawn validators (2-4 agents)     │
│ • Multi-dimensional validation      │
│ • Byzantine consensus voting        │
│ • GATE 2: Pass → Success            │
│           Fail → Product Owner Gate │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Product Owner Decision Gate         │
│ • Consensus <90%? → GOAP analysis   │
│ • Decision: PROCEED | DEFER | ESCALATE │
│ • PROCEED → Return to Loop 2        │
│ • DEFER → Backlog + approve phase   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ EXIT: Next Steps Guidance           │
│ • Completed work summary            │
│ • Validation results                │
│ • Identified issues                 │
│ • Recommended next steps            │
└─────────────────────────────────────┘
```

## Product Owner Decision Gate

**When**: After consensus <90% in Loop 3
**Agent**: `product-owner` (GOAP-based decision engine)
**Decision**: PROCEED | DEFER | ESCALATE

### Quick Setup

```javascript
// 1. Initialize scope (project start - ONCE per epic)
mcp__claude-flow-novice__memory_usage({
  action: "store",
  namespace: "scope-control",
  key: "project-boundaries",
  value: JSON.stringify({
    primary_goal: "Implement help system",
    in_scope: ["help routing", "agent matching", "coordinator logic"],
    out_of_scope: ["ML features", "JWT auth", "performance optimization"],
    risk_profile: "internal-only-low-risk"
  })
})

// 2. Product Owner spawns (automatic when consensus <90%)
Task("Product Owner", "GOAP decision: analyze consensus failure + scope boundaries", "product-owner")
```

### GOAP Cost Functions

| Action | Scope Impact | Cost | Decision |
|--------|-------------|------|----------|
| Relaunch Loop 3 (in-scope issue) | Maintains | 50-100 | PROCEED |
| Defer to backlog (out-of-scope) | Maintains | 20 | DEFER |
| Expand scope (add new features) | Expands | 1000 ❌ | Blocked |

**Cost < 150**: Autonomous decision (NO human approval)
**Cost ≥ 150**: Generate options for review

### Decision Outcomes

**PROCEED** (in-scope, fixable):
- Spawn Loop 3 with targeted agents (NO permission needed)
- Example: "Security issue in auth module" → spawn `security-specialist` + `backend-dev`

**DEFER** (out-of-scope, non-critical):
- Save to backlog in memory namespace `scope-control/backlog/{item-id}`
- Approve current phase (consensus override: 90% → approved)
- Auto-transition to next phase

**ESCALATE** (ambiguous, high-risk):
- Generate 2-3 options with trade-offs
- Present to human for decision
- Example: "Add ML-based routing?" → new feature vs. original scope

### Example Commands

```bash
# View scope boundaries
mcp__claude-flow-novice__memory_usage({
  action: "retrieve",
  namespace: "scope-control",
  key: "project-boundaries"
})

# Check deferred items
mcp__claude-flow-novice__memory_usage({
  action: "list",
  namespace: "scope-control/backlog"
})

# View decision history
mcp__claude-flow-novice__memory_usage({
  action: "list",
  namespace: "product-owner/decisions"
})
```

### Example Decision Flow

```javascript
// Consensus: 82% (below 90%)
// Validator feedback: "Missing ML-based routing for complex queries"

// Product Owner GOAP Analysis:
{
  "issue": "ML-based routing requested",
  "scope_check": "out_of_scope: ['ML features']",
  "cost_analysis": {
    "defer": 20,        // Save to backlog
    "proceed": 1500     // Requires scope expansion
  },
  "decision": "DEFER",
  "action": "Save 'ML routing' to backlog + approve phase transition"
}

// Result: Phase approved, next phase begins, ML routing saved for future sprint
```

## Key Iteration Limits (Self-Looping)

| Loop | Max Iterations | Self-Correcting Behavior |
|------|----------------|--------------------------|
| Loop 2 (Self-Validation) | 10 iterations | IMMEDIATELY self-correct with feedback (autonomous) |
| Loop 3 (Consensus) | 10 rounds | IMMEDIATELY invoke Product Owner gate if <90% |
| Product Owner Decision | 1 decision per failure | PROCEED → Loop 2 | DEFER → approve phase |
| Total Maximum | 100 iterations | System continues autonomously - NO HUMAN WAIT |

**Note**: Product Owner gate enables autonomous scope control - most decisions execute without human approval.

**Sprint/Phase Limits**:
- **Sprints per Phase**: 1-5 sprints (typical: 2-3)
- **Phases per Epic**: 2-5 phases (typical: 3-4)
- **Total Epic Duration**: 1-3 weeks for complex systems

---

**Version**: 1.0.0
**Last Updated**: 2025-10-02
**Full Docs**: `/mnt/c/Users/masha/Documents/claude-flow-novice/docs/CFN_LOOP.md`
