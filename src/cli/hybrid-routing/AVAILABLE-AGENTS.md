# Available Specialized Agents

**Hybrid Routing System - Dynamic Agent Discovery**

**Generated**: 2025-10-15
**Source**: `.claude/agents/` folder (live discovery)
**Purpose**: Documentation snapshot - coordinators read from `.claude/agents/` directly

## Architecture

**Source of Truth**: `.claude/agents/` folder
- Coordinators use `HybridWorkerSpawner.loadAgentDefinitions()`
- Recursive scanning with YAML frontmatter parsing
- In-memory caching after first load
- This file is documentation only (not used by spawning system)

## Discovery Statistics

```
🔍 Discovered 137 agent files in .claude/agents/
✅ Loaded 121 agents (16 skipped)
📋 76 agents in 14 categories
```

## Agents by Category

### 📁 ANALYSIS (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **code-analyzer** | analyze, review, audit (+13) |
| **perf-analyzer** | performance analysis, bottleneck detection, profiling (+6) |

---

### 📁 CFN-LOOP (3 agents)

| Agent Type | Keywords |
|------------|----------|
| **cfn-coordinator-enterprise** | enterprise, mission-critical, enterprise-grade validation (+3) |
| **cfn-coordinator-mvp** | mvp, rapid development, simplified validation (+2) |
| **product-owner** | goap, product owner, scope enforcement (+6) |

---

### 📁 CONSENSUS (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **gossip-coordinator** | *(No keywords available)* |
| **performance-benchmarker** | performance benchmarking, throughput measurement, latency analysis (+7) |

---

### 📁 CORE-AGENTS (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **tester** | test, validate, tdd (+13) |

---

### 📁 DEVOPS (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **devops-engineer** | ci/cd, pipeline, deploy (+19) |

---

### 📁 DOCUMENTATION (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **api-docs** | api documentation, openapi, swagger (+12) |

---

### 📁 GOAL (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **goal-planner** | goap, planning, a* search (+5) |

---

### 📁 OPTIMIZED (37 agents)

| Agent Type | Keywords |
|------------|----------|
| **analyst** | analyze, review, audit (+8) |
| **api-docs-optimized** | *(No keywords available)* |
| **architect** | design, architect, structure (+7) |
| **backend-dev** | api, rest, graphql (+10) |
| **base-template-generator** | template, boilerplate, scaffold (+17) |
| **byzantine-coordinator** | pbft, byzantine fault tolerance, consensus (+6) |
| **cfn-coordinator-enterprise-optimized** | *(No keywords available)* |
| **cfn-coordinator-mvp-optimized** | *(No keywords available)* |
| **cfn-coordinator-standard** | standard, balanced development, comprehensive validation (+4) |
| **code-analyzer-optimized** | *(No keywords available)* |
| **code-quality-validator** | code analysis, quality analysis, technical debt (+8) |
| **coder** | implement, code, build (+9) |
| **consensus-builder** | consensus, distributed decision-making, byzantine tolerance (+7) |
| **coordinator** | general coordination, fallback coordinator, basic orchestration (+6) |
| **coordinator-hybrid** | hybrid orchestration, cli spawning, cost optimization (+2) |
| **crdt-synchronizer** | crdt, conflict-free, state synchronization (+7) |
| **devops-engineer-optimized** | *(No keywords available)* |
| **goal-planner-optimized** | *(No keywords available)* |
| **gossip-coordinator-optimized** | *(No keywords available)* |
| **hierarchical-coordinator-optimized** | *(No keywords available)* |
| **mesh-coordinator-optimized** | *(No keywords available)* |
| **perf-analyzer-optimized** | *(No keywords available)* |
| **performance-benchmarker-optimized** | *(No keywords available)* |
| **planner** | general planning, task breakdown, fallback planner (+1) |
| **product-owner-optimized** | *(No keywords available)* |
| **pseudocode-optimized** | *(No keywords available)* |
| **quorum-manager** | quorum management, distributed consensus, membership coordination (+3) |
| **raft-manager** | raft consensus, leader election, log replication (+3) |
| **react-frontend-engineer** | react, typescript, css (+5) |
| **refinement-optimized** | *(No keywords available)* |
| **researcher** | general research, investigate, explore (+3) |
| **reviewer** | general review, fallback reviewer, basic code review (+2) |
| **security-manager** | consensus security, threshold cryptography, zero-knowledge proof (+4) |
| **state-architect** | state management, zustand, react-query (+2) |
| **system-architect** | enterprise architecture, system design, technical leadership (+13) |
| **task-coordinator** | task coordination, multi-agent orchestration, workflow management (+5) |
| **ui-designer** | ui design, ux, accessibility (+6) |

---

### 📁 PLANNING-TEAM (3 agents)

| Agent Type | Keywords |
|------------|----------|
| **api-designer-persona** | *(No keywords available)* |
| **security-architect-persona** | *(No keywords available)* |
| **system-architect-persona** | *(No keywords available)* |

---

### 📁 SECURITY (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **security-specialist** | security audit, vulnerability, threat model (+19) |
| **security-specialist-optimized** | security audit, vulnerability, threat model (+18) |

---

### 📁 SPARC (5 agents)

| Agent Type | Keywords |
|------------|----------|
| **architecture** | sparc, architecture, system design (+9) |
| **pseudocode** | sparc, pseudocode, algorithm (+9) |
| **refinement** | sparc, refinement, tdd (+9) |
| **specification** | sparc, specification, requirements (+8) |
| **specification-optimized** | sparc, specification, requirements (+3) |

---

### 📁 SPECIALIZED (8 agents)

| Agent Type | Keywords |
|------------|----------|
| **cli-agent-optimizer** | *(No keywords available)* |
| **code-booster** | performance optimization, code refactoring, efficiency (+7) |
| **mobile-dev** | react native, mobile, ios (+9) |
| **mobile-dev-optimized** | react native, mobile, ios (+9) |
| **rust-developer** | *(No keywords available)* |
| **rust-developer-optimized** | rust, development, mvp (+5) |
| **rust-enterprise-developer** | *(No keywords available)* |
| **rust-mvp-developer** | *(No keywords available)* |

---

### 📁 SWARM (6 agents)

| Agent Type | Keywords |
|------------|----------|
| **adaptive-coordinator** | *(No keywords available)* |
| **adaptive-coordinator-enhanced** | adaptive coordination, machine learning, predictive analytics (+4) |
| **adaptive-coordinator-optimized** | *(No keywords available)* |
| **blocking-coordinator-example** | coordinator, blocking, signal ack (+6) |
| **hierarchical-coordinator** | *(No keywords available)* |
| **mesh-coordinator** | mesh coordination, distributed systems, peer-to-peer (+2) |

---

### 📁 TESTING (4 agents)

| Agent Type | Keywords |
|------------|----------|
| **interaction-tester** | interaction testing, integration tests, e2e (+5) |
| **playwright-tester** | playwright, e2e testing, browser automation (+7) |
| **production-validator** | production validation, deployment ready, real implementation (+8) |
| **tdd-london-swarm** | tdd london school, mock-driven, outside-in tdd (+9) |

---


---

## Usage

### CLI Commands

```bash
# List all agents (flat view)
node src/cli/hybrid-routing/spawn-workers.js --list-agents

# List agents by category
node src/cli/hybrid-routing/spawn-workers.js --agents-by-category

# Regenerate this documentation file
/list-agents-rebuild
```

### Coordinator Usage

```bash
# Automatic selection (keyword-based)
node src/cli/hybrid-routing/spawn-workers.js "Build auth" --max-agents=3

# Coordinator override (manual agent types)
node src/cli/hybrid-routing/spawn-workers.js "Task" \
  --agents=architect,coder,tester

# Full override (custom agents + subtasks)
node src/cli/hybrid-routing/spawn-workers.js "Task" \
  --agents=coder,security-specialist \
  --subtasks="Subtask 1|Subtask 2"
```

---

## Notes

- **Live Discovery**: Coordinators read from `.claude/agents/` folder directly
- **This File**: Documentation snapshot for human reference
- **Regenerate**: Run `/list-agents-rebuild` to update this documentation
- **Agent Files**: Add/modify agents in `.claude/agents/` folder (auto-discovered)
- **Caching**: Agent definitions cached after first load (lazy loading)
- **Missing Keywords**: Some agents without keywords can be used via coordinator override

