# Available CFN Agents - Auto-Generated

**Generated:** 2025-11-18
**Source:** .claude/agents/ (dynamic discovery)
**Total Agents:** 63

---

## Agent Discovery

The system uses **dynamic agent discovery** via glob patterns:
- Searches `.claude/agents/**/*.md` recursively
- Normalizes names (kebab-case, handles underscores)
- Returns first exact match or closest partial match

**No registration required** - just add `.md` file to `.claude/agents/` subdirectory.

---

## Available Agents by Category

### 🎯 Coordinators

**Count:** 5 agents

| Agent Name | File Path |
|------------|-----------|
| **cfn-frontend-coordinator** | `.claude/agents/cfn-dev-team/coordinators/cfn-frontend-coordinator.md` |
| **cfn-v3-coordinator** | `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md` |
| **consensus-builder** | `.claude/agents/cfn-dev-team/coordinators/consensus-builder.md` |
| **handoff-coordinator** | `.claude/agents/cfn-dev-team/coordinators/handoff-coordinator.md` |
| **multi-sprint-coordinator** | `.claude/agents/cfn-dev-team/coordinators/multi-sprint-coordinator.md` |

### 🏗️ Architecture & Planning

**Count:** 5 agents

| Agent Name | File Path |
|------------|-----------|
| **api-designer-persona** | `.claude/agents/cfn-dev-team/architecture/api-designer-persona.md` |
| **base-template-generator** | `.claude/agents/cfn-dev-team/architecture/base-template-generator.md` |
| **goal-planner** | `.claude/agents/cfn-dev-team/architecture/goal-planner.md` |
| **planner** | `.claude/agents/cfn-dev-team/architecture/planner.md` |
| **system-architect** | `.claude/agents/cfn-dev-team/architecture/system-architect.md` |

### 💻 Developers - Backend

**Count:** 4 agents

| Agent Name | File Path |
|------------|-----------|
| **api-gateway-specialist** | `.claude/agents/cfn-dev-team/developers/api-gateway-specialist.md` |
| **backend-developer** | `.claude/agents/cfn-dev-team/developers/backend-developer.md` |
| **graphql-specialist** | `.claude/agents/cfn-dev-team/developers/graphql-specialist.md` |
| **rust-developer** | `.claude/agents/cfn-dev-team/developers/rust-developer.md` |

### 🎨 Developers - Frontend

**Count:** 4 agents

| Agent Name | File Path |
|------------|-----------|
| **mobile-dev** | `.claude/agents/cfn-dev-team/developers/frontend/mobile-dev.md` |
| **react-frontend-engineer** | `.claude/agents/cfn-dev-team/developers/frontend/react-frontend-engineer.md` |
| **typescript-specialist** | `.claude/agents/cfn-dev-team/developers/frontend/typescript-specialist.md` |
| **ui-designer** | `.claude/agents/cfn-dev-team/developers/frontend/ui-designer.md` |

### 📊 Developers - Data

**Count:** 1 agents

| Agent Name | File Path |
|------------|-----------|
| **data-engineer** | `.claude/agents/cfn-dev-team/developers/data/data-engineer.md` |

### 🗄️ Developers - Database

**Count:** 1 agents

| Agent Name | File Path |
|------------|-----------|
| **database-architect** | `.claude/agents/cfn-dev-team/developers/database/database-architect.md` |

### ⚙️ DevOps & Infrastructure

**Count:** 5 agents

| Agent Name | File Path |
|------------|-----------|
| **devops-engineer** | `.claude/agents/cfn-dev-team/dev-ops/devops-engineer.md` |
| **docker-specialist** | `.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md` |
| **github-commit-agent** | `.claude/agents/cfn-dev-team/dev-ops/github-commit-agent.md` |
| **kubernetes-specialist** | `.claude/agents/cfn-dev-team/dev-ops/kubernetes-specialist.md` |
| **monitoring-specialist** | `.claude/agents/cfn-dev-team/dev-ops/monitoring-specialist.md` |

### ✅ Quality & Testing

**Count:** 0 agents


### 🔍 Analysts

**Count:** 1 agents

| Agent Name | File Path |
|------------|-----------|
| **root-cause-analyst** | `.claude/agents/cfn-dev-team/analysts/root-cause-analyst.md` |

### 📋 Product & UX

**Count:** 0 agents


### 🎓 Specialists

**Count:** 0 agents


---

## Usage Examples

```bash
# Use exact agent name
/cfn-loop-cli "Build feature" --agents react-frontend-engineer,backend-developer

# Dynamic discovery works with variations
npx claude-flow-novice agent react-frontend-engineer  # Exact match
npx claude-flow-novice agent react_frontend_engineer  # Underscore (normalized)
```

---

## Common Agent Names

| Use Case | Correct Agent Name | ❌ Common Mistake |
|----------|-------------------|-------------------|
| Frontend React | `react-frontend-engineer` | ~~frontend-developer~~ |
| Backend API | `backend-developer` | ~~backend-engineer~~ |
| Testing | `tester` | ~~qa-tester~~ |
| DevOps | `devops-engineer` | ~~devops~~ |
| Docker | `docker-specialist` | ~~docker-engineer~~ |

---

**Regenerate this list:** `/list-agents-rebuild` or `bash /tmp/generate-agent-list.sh`
