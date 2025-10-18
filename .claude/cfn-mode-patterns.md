# CFN Loop Mode-Specific Patterns

**Phase 4: Redis Coordination Integration**

This document defines the distinct coordination patterns, thresholds, and resource allocations for each CFN Loop mode (MVP, Standard, Enterprise).

---

## Redis Channel Naming Convention

All CFN Loop Redis channels follow this pattern:

```
swarm:cfn:{mode}:{phaseId}:loop{N}:{action}
```

**Components:**
- `mode`: `mvp` | `standard` | `enterprise`
- `phaseId`: Unique phase identifier (e.g., `phase-0`, `auth-system`)
- `loop`: Loop number (3, 2, or 4)
- `action`: `complete` | `decision` | `escalate`

**Examples:**
```
swarm:cfn:mvp:phase-0:loop3:complete
swarm:cfn:standard:auth-system:loop2:complete
swarm:cfn:enterprise:payment-api:loop4:decision
```

---

## Loop 3: Implementation (Workers)

### MVP Mode
**Objective:** Rapid iteration, cost-optimized

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Workers** | 2-3 agents | Minimal viable team |
| **Agent Types** | `coder`, `tester` | Core implementation only |
| **Topology** | Sequential | Simplest coordination |
| **Gate Threshold** | ≥0.65 | Accept lower quality for speed |
| **Max Iterations** | 5 | Fail fast |
| **Timeout** | 15 minutes | Quick turnaround |
| **Cost Target** | $0.50-$1.50 | CLI spawning, zai provider |
| **SQLite ACL** | Level 4 (Project) | Team-wide visibility |
| **Retention** | 30 days | Short-term reference |

**Channel:**
```bash
swarm:cfn:mvp:${PHASE_ID}:loop3:complete
```

**Worker Spawn:**
```bash
npx claude-flow-spawn \
  "Implement [feature] for MVP - core functionality only" \
  --agents=coder,tester \
  --topology=sequential \
  --redis-channel="swarm:cfn:mvp:${PHASE_ID}:loop3" \
  --provider=zai \
  --timeout=900000
```

---

### Standard Mode
**Objective:** Balanced quality and speed

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Workers** | 3-5 agents | Balanced team |
| **Agent Types** | `architect`, `coder`, `coder`, `tester` | Architecture-first design |
| **Topology** | Collaborative | Q&A coordination |
| **Gate Threshold** | ≥0.75 | Production-ready quality |
| **Max Iterations** | 10 | More refinement cycles |
| **Timeout** | 30 minutes | Balanced development time |
| **Cost Target** | $1.50-$2.50 | More specialists |
| **SQLite ACL** | Level 4 (Project) | Team-wide visibility |
| **Retention** | 30 days | Standard reference period |

**Channel:**
```bash
swarm:cfn:standard:${PHASE_ID}:loop3:complete
```

**Worker Spawn:**
```bash
npx claude-flow-spawn \
  "Implement [feature] with balanced quality and speed" \
  --agents=architect,coder,coder,tester \
  --topology=collaborative \
  --redis-channel="swarm:cfn:standard:${PHASE_ID}:loop3" \
  --provider=zai \
  --timeout=1800000
```

---

### Enterprise Mode
**Objective:** Maximum quality, compliance-first

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Workers** | 5-8 agents | Full specialist team |
| **Agent Types** | `architect`, `architect`, `coder`, `coder`, `coder`, `tester`, `security-specialist`, `perf-analyzer` | Comprehensive coverage |
| **Topology** | Release-gate | Barrier synchronization |
| **Gate Threshold** | ≥0.85 | Enterprise quality standards |
| **Max Iterations** | 15 | Extensive refinement |
| **Timeout** | 60 minutes | Thorough development |
| **Cost Target** | $3.00-$5.00 | Quality over cost |
| **SQLite ACL** | Level 4 (Project) | Audit trail required |
| **Retention** | 365 days | Compliance retention |
| **Compliance** | Audit logs, Loop 0.5 planning | Regulatory requirements |

**Channel:**
```bash
swarm:cfn:enterprise:${PHASE_ID}:loop3:complete
```

**Worker Spawn:**
```bash
npx claude-flow-spawn \
  "Implement [feature] with enterprise quality standards" \
  --agents=architect,architect,coder,coder,coder,tester,security-specialist,perf-analyzer \
  --topology=release-gate \
  --redis-channel="swarm:cfn:enterprise:${PHASE_ID}:loop3" \
  --provider=zai \
  --timeout=3600000
```

---

## Loop 2: Consensus Validation (Validators)

### MVP Mode
**Objective:** Essential validation only

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Validators** | 2 agents | Minimal review |
| **Agent Types** | `code-quality-validator`, `security-specialist` | Core safety checks |
| **Topology** | Sequential | Simple validation flow |
| **Consensus Threshold** | ≥0.85 | Good enough for MVP |
| **Timeout** | 10 minutes | Quick validation |
| **SQLite ACL** | Level 3 (Swarm) | Immutable consensus record |
| **Retention** | 90 days | Reference for iterations |

**Channels:**
```bash
# Wait for Loop 3
swarm:cfn:mvp:${PHASE_ID}:loop3:complete

# Signal to Loop 4
swarm:cfn:mvp:${PHASE_ID}:loop2:complete
```

**Validator Spawn:**
```bash
npx claude-flow-spawn \
  "Validate MVP implementation - focus on core functionality" \
  --agents=code-quality-validator,security-specialist \
  --topology=sequential \
  --redis-channel="swarm:cfn:mvp:${PHASE_ID}:loop2" \
  --provider=zai \
  --timeout=600000
```

---

### Standard Mode
**Objective:** Comprehensive peer review

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Validators** | 4 agents | Thorough review coverage |
| **Agent Types** | `code-quality-validator`, `security-specialist`, `perf-analyzer`, `interaction-tester` | Multi-faceted validation |
| **Topology** | Collaborative | Cross-review patterns |
| **Consensus Threshold** | ≥0.90 | High confidence required |
| **Timeout** | 20 minutes | Detailed validation |
| **SQLite ACL** | Level 3 (Swarm) | Immutable consensus record |
| **Retention** | 90 days | Standard audit period |

**Channels:**
```bash
# Wait for Loop 3
swarm:cfn:standard:${PHASE_ID}:loop3:complete

# Signal to Loop 4
swarm:cfn:standard:${PHASE_ID}:loop2:complete
```

**Validator Spawn:**
```bash
npx claude-flow-spawn \
  "Validate standard implementation - comprehensive review" \
  --agents=code-quality-validator,security-specialist,perf-analyzer,interaction-tester \
  --topology=collaborative \
  --redis-channel="swarm:cfn:standard:${PHASE_ID}:loop2" \
  --provider=zai \
  --timeout=1200000
```

---

### Enterprise Mode
**Objective:** Full compliance and risk assessment

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Validators** | 5 agents | Maximum validation rigor |
| **Agent Types** | `code-quality-validator`, `security-specialist`, `perf-analyzer`, `interaction-tester`, `compliance-auditor` | Regulatory compliance |
| **Topology** | Release-gate | Independent barrier reviews |
| **Consensus Threshold** | ≥0.95 | Enterprise-grade confidence |
| **Timeout** | 40 minutes | Thorough compliance checks |
| **SQLite ACL** | Level 3 (Swarm) | Immutable audit trail |
| **Retention** | 365 days | Compliance retention |

**Channels:**
```bash
# Wait for Loop 3
swarm:cfn:enterprise:${PHASE_ID}:loop3:complete

# Signal to Loop 4
swarm:cfn:enterprise:${PHASE_ID}:loop2:complete
```

**Validator Spawn:**
```bash
npx claude-flow-spawn \
  "Validate enterprise implementation - full compliance audit" \
  --agents=code-quality-validator,security-specialist,perf-analyzer,interaction-tester,compliance-auditor \
  --topology=release-gate \
  --redis-channel="swarm:cfn:enterprise:${PHASE_ID}:loop2" \
  --provider=zai \
  --timeout=2400000
```

---

## Loop 4: Product Owner GOAP Decisions

### Mode-Agnostic Pattern
**Objective:** Consistent decision framework across all modes

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Decision Maker** | Single Product Owner agent | Centralized authority |
| **Decision Logic** | GOAP A* search | Optimal path discovery |
| **Decisions** | `PROCEED`, `DEFER`, `ESCALATE` | Clear action space |
| **SQLite ACL** | Level 4 (Project) | Long-term decision record |
| **Retention** | 365 days | Compliance and retrospectives |

**Channels:**
```bash
# Wait for Loop 2
swarm:cfn:{mode}:${PHASE_ID}:loop2:complete

# Signal decision
swarm:cfn:{mode}:${PHASE_ID}:loop4:decision

# Escalate if needed
swarm:cfn:{mode}:${PHASE_ID}:escalate
```

**Decision Matrix:**

| Loop 3 Gate | Loop 2 Consensus | Critical Blockers | Decision | Action |
|-------------|------------------|-------------------|----------|--------|
| ✅ Pass | ✅ Pass | None | **PROCEED** | Auto-launch next phase |
| ✅ Pass | ❌ Fail | None | **DEFER** | Continue with concerns logged |
| ❌ Fail | ✅ Pass | None | **DEFER** | Retry Loop 3 with feedback |
| ❌ Fail | ❌ Fail | None | **DEFER** | Retry both loops |
| * | * | Yes | **ESCALATE** | Return to main chat |

**Critical Blocker Examples:**
- Security vulnerabilities (CVSS ≥7.0)
- Budget overruns (>120% of cost target)
- Timeline violations (>150% of timeout)
- Compliance failures (regulatory violations)
- Architectural conflicts (breaking changes)

---

## Mode-Specific Decision Thresholds

### MVP Mode
```javascript
const decision = {
  gateThreshold: 0.65,
  consensusThreshold: 0.85,
  costLimit: 1.50,
  timeLimit: 900000,  // 15 minutes
  escalateTriggers: ['security-critical', 'cost-exceeded']
};
```

### Standard Mode
```javascript
const decision = {
  gateThreshold: 0.75,
  consensusThreshold: 0.90,
  costLimit: 2.50,
  timeLimit: 1800000,  // 30 minutes
  escalateTriggers: ['security-high', 'performance-degradation', 'cost-exceeded']
};
```

### Enterprise Mode
```javascript
const decision = {
  gateThreshold: 0.85,
  consensusThreshold: 0.95,
  costLimit: 5.00,
  timeLimit: 3600000,  // 60 minutes
  escalateTriggers: ['security-any', 'compliance-failure', 'performance-degradation', 'cost-exceeded', 'breaking-change']
};
```

---

## Topology Selection Guide

### When to Use Sequential (MVP)
- Small team (2-3 agents)
- Simple tasks (CRUD operations, basic features)
- Cost-sensitive projects
- Rapid prototyping
- Low coordination overhead

### When to Use Collaborative (Standard)
- Medium team (3-5 agents)
- Architecture decisions required
- Cross-functional work (backend + frontend)
- Balanced quality/speed requirements
- Q&A coordination patterns

### When to Use Release-Gate (Enterprise)
- Large team (5-8 agents)
- Compliance requirements
- Security-critical systems
- Performance-sensitive applications
- Independent review barriers
- Audit trail requirements

---

## Cost Analysis

### MVP Mode (Sequential)
```
Coordinator: $0 (CLI spawn-workers.js)
Workers (2-3): $0.50-$1.50 (zai provider, 15min)
Validators (2): $0.25-$0.50 (zai provider, 10min)
Product Owner: $0 (single decision)
---
Total: $0.75-$2.00 per phase
```

### Standard Mode (Collaborative)
```
Coordinator: $0 (CLI spawn-workers.js)
Workers (3-5): $1.50-$2.50 (zai provider, 30min)
Validators (4): $0.50-$1.00 (zai provider, 20min)
Product Owner: $0 (single decision)
---
Total: $2.00-$3.50 per phase
```

### Enterprise Mode (Release-Gate)
```
Coordinator: $0 (CLI spawn-workers.js)
Workers (5-8): $3.00-$5.00 (zai provider, 60min)
Validators (5): $1.00-$1.50 (zai provider, 40min)
Product Owner: $0 (single decision)
---
Total: $4.00-$6.50 per phase
```

---

## SQLite ACL Level Summary

| Loop | ACL Level | Visibility | Immutable | Retention |
|------|-----------|------------|-----------|-----------|
| Loop 3 | 4 (Project) | All agents in project | No | 30-365 days |
| Loop 2 | 3 (Swarm) | Validators + Product Owner | Yes | 90-365 days |
| Loop 4 | 4 (Project) | All agents + main chat | Yes | 365 days |

**Read Access Hierarchy:**
- Loop 3 results: ACL 4 (Product Owner can read)
- Loop 2 consensus: ACL 3 (Product Owner can read, immutable)
- Loop 4 decisions: ACL 4 (All agents + main chat can read)

---

## Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Loop 3: Implementation                                       │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│ │  Worker  │→ │  Worker  │→ │  Worker  │                   │
│ │  (Coder) │  │ (Tester) │  │(Security)│                   │
│ └──────────┘  └──────────┘  └──────────┘                   │
│      ↓             ↓             ↓                           │
│ Gate Check (avgConfidence ≥ threshold)                      │
│      ↓                                                       │
│ LPUSH swarm:cfn:{mode}:{phaseId}:loop3:complete             │
│      ↓                                                       │
│ SQLite: cfn/phase:{phaseId}/loop3/results (ACL 4, 30d)      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Loop 2: Consensus Validation                                 │
│ BLPOP swarm:cfn:{mode}:{phaseId}:loop3:complete (wait)      │
│      ↓                                                       │
│ ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│ │Code     │  │Security │  │ Perf    │  │Interact │        │
│ │Quality  │  │Special  │  │Analyzer │  │Tester   │        │
│ └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│      ↓             ↓            ↓            ↓              │
│ Consensus Check (avgConfidence ≥ threshold)                 │
│      ↓                                                       │
│ LPUSH swarm:cfn:{mode}:{phaseId}:loop2:complete             │
│      ↓                                                       │
│ SQLite: cfn/phase:{phaseId}/loop2/consensus (ACL 3, 90d)    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Loop 4: Product Owner GOAP Decision                          │
│ BLPOP swarm:cfn:{mode}:{phaseId}:loop2:complete (wait)      │
│      ↓                                                       │
│ Read Loop 3 results (ACL 4)                                  │
│ Read Loop 2 consensus (ACL 3)                                │
│      ↓                                                       │
│ GOAP Decision Matrix                                         │
│ ├─ PROCEED → Auto-launch next phase                         │
│ ├─ DEFER   → Create backlog, continue                       │
│ └─ ESCALATE → Return to main chat                           │
│      ↓                                                       │
│ LPUSH swarm:cfn:{mode}:{phaseId}:loop4:decision              │
│      ↓                                                       │
│ SQLite: cfn/phase:{phaseId}/loop4/decision (ACL 4, 365d)    │
└─────────────────────────────────────────────────────────────┘
```

---

## Usage Examples

### MVP Mode - Quick Feature
```bash
# Spawn MVP CFN Loop
/cfn-loop "Add user registration endpoint" --mode=mvp

# Coordinator spawns workers
npx claude-flow-spawn \
  "Implement user registration endpoint - core functionality only" \
  --agents=coder,tester \
  --topology=sequential \
  --redis-channel="swarm:cfn:mvp:user-registration:loop3" \
  --provider=zai

# Gate check (≥0.65) → LPUSH loop3:complete
# Spawn validators (2 agents, ≥0.85 consensus) → LPUSH loop2:complete
# Product Owner decides → PROCEED (auto-launch next phase)
```

### Standard Mode - Feature Development
```bash
# Spawn Standard CFN Loop
/cfn-loop "Implement payment processing system" --mode=standard

# Coordinator spawns workers
npx claude-flow-spawn \
  "Implement payment processing system with balanced quality and speed" \
  --agents=architect,coder,coder,tester \
  --topology=collaborative \
  --redis-channel="swarm:cfn:standard:payment-system:loop3" \
  --provider=zai

# Gate check (≥0.75) → LPUSH loop3:complete
# Spawn validators (4 agents, ≥0.90 consensus) → LPUSH loop2:complete
# Product Owner decides → PROCEED or DEFER with logged concerns
```

### Enterprise Mode - Production System
```bash
# Spawn Enterprise CFN Loop
/cfn-loop "Deploy HIPAA-compliant patient data API" --mode=enterprise

# Coordinator spawns workers
npx claude-flow-spawn \
  "Implement HIPAA-compliant patient data API with enterprise quality standards" \
  --agents=architect,architect,coder,coder,coder,tester,security-specialist,perf-analyzer \
  --topology=release-gate \
  --redis-channel="swarm:cfn:enterprise:patient-api:loop3" \
  --provider=zai

# Gate check (≥0.85) → LPUSH loop3:complete
# Spawn validators (5 agents, ≥0.95 consensus) → LPUSH loop2:complete
# Product Owner decides → ESCALATE if any compliance issues detected
```

---

## Troubleshooting

### Loop 3 Gate Failures
**Symptom:** `avgConfidence < threshold`, retrying iterations

**MVP Mode:**
- Check if core functionality is implemented (ignore edge cases)
- Reduce scope if >5 iterations needed
- Consider DEFER decision if blockers exist

**Standard Mode:**
- Review architect feedback for design issues
- Check test coverage and quality metrics
- Refine implementation based on tester feedback

**Enterprise Mode:**
- Analyze security and performance scores
- Review compliance audit logs
- Check for breaking changes or regulatory violations

### Loop 2 Consensus Failures
**Symptom:** `avgConsensus < threshold`, validators disagree

**MVP Mode:**
- Consensus ≥0.85: Check if 1 of 2 validators hard-failed
- Review security-critical findings first

**Standard Mode:**
- Consensus ≥0.90: Likely 1-2 validators found issues
- Cross-check code-quality vs security vs performance feedback
- Identify common concerns across validators

**Enterprise Mode:**
- Consensus ≥0.95: Even minor issues fail consensus
- Review compliance-auditor findings (regulatory blockers)
- Ensure all 5 validators reach agreement

### Loop 4 Decision Delays
**Symptom:** BLPOP timeout waiting for Loop 2

**Check:**
1. Redis connection alive: `redis-cli ping`
2. Loop 3 signaled completion: `redis-cli llen swarm:cfn:{mode}:{phaseId}:loop3:complete`
3. Loop 2 spawned validators: Check logs for spawn-workers.js execution
4. Validators completed: `redis-cli llen swarm:cfn:{mode}:{phaseId}:loop2:complete`

**Fix:**
- If Loop 3 failed to signal: Re-run gate check manually
- If Loop 2 validators hung: Kill and respawn validators
- If BLPOP timeout: Increase timeout in mode-specific coordinator

---

## References

- **CFN Loop Rules:** `.claude/cfn-loop-rules.md`
- **Coordinator Patterns:** `.claude/coordinator-patterns.md`
- **Redis Dependencies:** `.claude/redis-agent-dependencies.md`
- **Implementation Plan:** `planning/orchestration/PHASE-4-IMPLEMENTATION-PLAN.md`
- **Coordinators:**
  - `.claude/agents/cfn-loop/cfn-coordinator-mvp.md`
  - `.claude/agents/cfn-loop/cfn-coordinator-standard.md`
  - `.claude/agents/cfn-loop/cfn-coordinator-enterprise.md`
- **Product Owner:** `.claude/agents/cfn-loop/product-owner.md`
