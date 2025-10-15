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
🔍 Discovered 85 agent files in .claude/agents/
✅ Loaded 85 agents
📋 49 categories
```

## Agents by Category

### 📁 GENERAL (17 agents)

| Agent Type | Keywords |
|------------|----------|
| **analyst** | *(No keywords available)* |
| **architect** | *(No keywords available)* |
| **coder** | *(No keywords available)* |
| **coordinator** | *(No keywords available)* |
| **planner** | *(No keywords available)* |
| **researcher** | *(No keywords available)* |
| **reviewer** | *(No keywords available)* |
| **tester** | *(No keywords available)* |
| **architecture** | *(No keywords available)* |
| **pseudocode** | *(No keywords available)* |
| **refinement** | *(No keywords available)* |
| **specification** | *(No keywords available)* |

---

### 📁 AGENT (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **agent-type-guidelines** | *(No keywords available)* |

---

### 📁 FORMAT (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **format-selection** | *(No keywords available)* |

---

### 📁 PROMPT (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **prompt-engineering** | *(No keywords available)* |

---

### 📁 QUALITY (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **quality-metrics** | *(No keywords available)* |

---

### 📁 CODE (4 agents)

| Agent Type | Keywords |
|------------|----------|
| **code-analyzer** | *(No keywords available)* |
| **code-quality-validator** | *(No keywords available)* |
| **code-booster** | *(No keywords available)* |
| **code-booster** | *(No keywords available)* |

---

### 📁 ANALYZE (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **analyze-code-quality** | *(No keywords available)* |

---

### 📁 PERF (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **perf-analyzer** | *(No keywords available)* |

---

### 📁 SYSTEM (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **system-architect** | *(No keywords available)* |
| **system-architect-persona** | *(No keywords available)* |

---

### 📁 CFN (3 agents)

| Agent Type | Keywords |
|------------|----------|
| **cfn-coordinator-enterprise** | *(No keywords available)* |
| **cfn-coordinator-mvp** | *(No keywords available)* |
| **cfn-coordinator-standard** | *(No keywords available)* |

---

### 📁 PRODUCT (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **product-owner** | *(No keywords available)* |
| **product-owner-agent** | *(No keywords available)* |

---

### 📁 BYZANTINE (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **byzantine-coordinator** | *(No keywords available)* |

---

### 📁 CONSENSUS (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **consensus-builder** | *(No keywords available)* |

---

### 📁 CRDT (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **crdt-synchronizer** | *(No keywords available)* |

---

### 📁 GOSSIP (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **gossip-coordinator** | *(No keywords available)* |

---

### 📁 PERFORMANCE (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **performance-benchmarker** | *(No keywords available)* |

---

### 📁 QUORUM (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **quorum-manager** | *(No keywords available)* |

---

### 📁 RAFT (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **raft-manager** | *(No keywords available)* |

---

### 📁 SECURITY (4 agents)

| Agent Type | Keywords |
|------------|----------|
| **security-manager** | *(No keywords available)* |
| **security-architect-persona** | *(No keywords available)* |
| **security-specialist-existing** | *(No keywords available)* |
| **security-specialist** | *(No keywords available)* |

---

### 📁 CONTEXT (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **context-curator** | *(No keywords available)* |
| **context-reflector** | *(No keywords available)* |

---

### 📁 BASE (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **base-template-generator** | *(No keywords available)* |

---

### 📁 COORDINATOR (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **coordinator-hybrid** | *(No keywords available)* |

---

### 📁 TASK (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **task-coordinator** | *(No keywords available)* |

---

### 📁 DEV (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **dev-backend-api** | *(No keywords available)* |

---

### 📁 BACKEND (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **backend-dev** | *(No keywords available)* |

---

### 📁 DEVOPS (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **devops-engineer** | *(No keywords available)* |

---

### 📁 DOCS (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **docs-api-openapi** | *(No keywords available)* |

---

### 📁 API (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **api-docs** | *(No keywords available)* |
| **api-designer-persona** | *(No keywords available)* |

---

### 📁 BLOCKING (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **blocking-coordinator-example** | *(No keywords available)* |
| **blocking-coordinator-example** | *(No keywords available)* |

---

### 📁 INTERACTION (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **interaction-tester** | *(No keywords available)* |
| **interaction-tester** | *(No keywords available)* |

---

### 📁 REACT (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **react-frontend-engineer** | *(No keywords available)* |

---

### 📁 STATE (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **state-architect** | *(No keywords available)* |

---

### 📁 UI (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **ui-designer** | *(No keywords available)* |

---

### 📁 GOAL (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **goal-planner** | *(No keywords available)* |

---

### 📁 ACCESSIBILITY (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **accessibility-advocate-persona** | *(No keywords available)* |

---

### 📁 CTO (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **cto-agent** | *(No keywords available)* |

---

### 📁 POWER (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **power-user-persona** | *(No keywords available)* |

---

### 📁 CLI (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **cli-agent-optimizer** | *(No keywords available)* |

---

### 📁 MOBILE (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **mobile-dev** | *(No keywords available)* |

---

### 📁 SPEC (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **spec-mobile-react-native** | *(No keywords available)* |

---

### 📁 RUST (3 agents)

| Agent Type | Keywords |
|------------|----------|
| **rust-developer** | *(No keywords available)* |
| **rust-enterprise-developer** | *(No keywords available)* |
| **rust-mvp-developer** | *(No keywords available)* |

---

### 📁 ADAPTIVE (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **adaptive-coordinator-enhanced** | *(No keywords available)* |
| **adaptive-coordinator** | *(No keywords available)* |

---

### 📁 HIERARCHICAL (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **hierarchical-coordinator** | *(No keywords available)* |

---

### 📁 MESH (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **mesh-coordinator** | *(No keywords available)* |

---

### 📁 TEST (1 agents)

| Agent Type | Keywords |
|------------|----------|
| **test-coordinator** | *(No keywords available)* |

---

### 📁 PLAYWRIGHT (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **playwright-agent** | *(No keywords available)* |
| **playwright-tester** | *(No keywords available)* |

---

### 📁 PRODUCTION (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **production-validator** | *(No keywords available)* |
| **production-validator** | *(No keywords available)* |

---

### 📁 TDD (2 agents)

| Agent Type | Keywords |
|------------|----------|
| **tdd-london-swarm** | *(No keywords available)* |
| **tdd-london-swarm** | *(No keywords available)* |

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

