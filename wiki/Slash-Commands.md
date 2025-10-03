# Slash Commands

Quick reference for all Claude Flow slash commands - powerful shortcuts for common workflows and operations.

---

## Overview

Slash commands provide convenient shortcuts for complex multi-agent workflows. Simply type the command in your Claude conversation to execute:

```bash
/command-name [arguments]
```

**Available commands:** 10+ slash commands for development, coordination, and cost optimization

---

## Core Development Commands

### `/cfn-loop`

**Purpose:** Execute self-correcting development loop with consensus validation

**Usage:**
```bash
/cfn-loop "task description"
```

**Example:**
```bash
/cfn-loop "Implement JWT authentication"
```

**What it does:**
1. Initializes swarm with optimal topology
2. Spawns implementation agents (3-8 agents)
3. Runs Loop 2 execution with self-validation
4. Spawns consensus validators (2-4 agents)
5. Provides next steps guidance

**Options:**
```bash
/cfn-loop "task" --agents 6 --topology mesh --confidence 0.80
```

**Documentation:** [CFN Loop Overview](CFN-Loop-Overview.md)

---

### `/cfn-loop-epic`

**Purpose:** Multi-phase project orchestration with cross-phase dependencies

**Usage:**
```bash
/cfn-loop-epic path/to/epic-config.json
```

**Example:**
```bash
/cfn-loop-epic planning/auth-system-epic.json
```

**What it does:**
1. Loads epic configuration (phases, sprints, dependencies)
2. Executes Loop 0 (epic orchestration)
3. Sequences through phases (Phase 1 → 2 → 3 → N)
4. Manages cross-phase dependencies
5. Provides phase completion summaries

**Epic config structure:**
```json
{
  "name": "Authentication System",
  "phases": [
    {
      "name": "Phase 1: Core Auth",
      "sprints": ["login", "logout", "session-management"],
      "dependencies": []
    },
    {
      "name": "Phase 2: Advanced Features",
      "sprints": ["2fa", "password-reset"],
      "dependencies": ["Phase 1"]
    }
  ]
}
```

**Documentation:** [CFN Loop Overview](CFN-Loop-Overview.md#loop-0-epic-orchestration)

---

### `/cfn-loop-sprints`

**Purpose:** Single phase with multiple coordinated sprints

**Usage:**
```bash
/cfn-loop-sprints path/to/phase-config.json
```

**Example:**
```bash
/cfn-loop-sprints planning/api-endpoints-phase.json
```

**What it does:**
1. Loads phase configuration (sprints, dependencies)
2. Sequences through sprints within phase
3. Manages sprint-level dependencies
4. Validates sprint completion before progression

**Phase config structure:**
```json
{
  "phase": "API Endpoints",
  "sprints": [
    {
      "id": "users-api",
      "description": "User CRUD endpoints",
      "dependencies": []
    },
    {
      "id": "auth-api",
      "description": "Authentication endpoints",
      "dependencies": ["users-api"]
    }
  ]
}
```

---

### `/fullstack`

**Purpose:** Launch full-stack development team with complete coverage

**Usage:**
```bash
/fullstack "feature description"
```

**Example:**
```bash
/fullstack "Build user dashboard with analytics"
```

**What it does:**
1. Spawns full-stack agent team (8-12 agents):
   - Backend developers (API, database)
   - Frontend developers (UI, state management)
   - Security specialists (auth, validation)
   - DevOps engineers (deployment, monitoring)
   - Testers (unit, integration, e2e)
   - Reviewers (code quality, architecture)
2. Coordinates parallel work streams
3. Integrates frontend + backend + infrastructure
4. Runs comprehensive validation

**Documentation:** [.claude/commands/fullstack.md](../commands/fullstack.md)

---

## Swarm Coordination Commands

### `/swarm`

**Purpose:** Initialize and manage agent swarms

**Usage:**
```bash
/swarm init --topology mesh --agents 5
/swarm status
/swarm stop
```

**Examples:**

**Initialize mesh swarm:**
```bash
/swarm init --topology mesh --agents 5 --strategy balanced
```

**Initialize hierarchical swarm:**
```bash
/swarm init --topology hierarchical --agents 15 --coordinator system-architect
```

**Check swarm status:**
```bash
/swarm status

# Expected output:
# Swarm Status:
# Topology: mesh
# Active Agents: 5
# Coordination Strategy: balanced
# Memory Usage: 45MB
# Average Confidence: 0.87
```

**Documentation:** [Agent Coordination](Agent-Coordination.md)

---

### `/sparc`

**Purpose:** Execute SPARC methodology (Specification, Pseudocode, Architecture, Refinement, Completion)

**Usage:**
```bash
/sparc "project description"
```

**Example:**
```bash
/sparc "Build RESTful API for e-commerce platform"
```

**What it does:**
1. **S**pecification - Researcher analyzes requirements
2. **P**seudocode - Planner creates implementation plan
3. **A**rchitecture - Architect designs system structure
4. **R**efinement - Reviewer validates and refines
5. **C**ompletion - Coder implements final solution

**Agent sequence:**
```
researcher → planner → architect → reviewer → coder → tester
```

**Documentation:** [core-concepts/sparc-methodology](core-concepts/sparc-methodology)

---

## Cost Optimization Commands

### `/custom-routing-activate`

**Purpose:** Enable tiered provider routing for cost optimization

**Usage:**
```bash
/custom-routing-activate
```

**What it does:**
1. Activates tiered routing system
2. Routes non-critical agents to zai (free)
3. Routes standard agents to deepseek (budget)
4. Routes critical agents to anthropic (premium)
5. Loads agent profile overrides

**Output:**
```
✅ Custom routing activated

Priority System:
1. Agent profile provider overrides (if specified)
2. Tiered routing: zai (free) → deepseek (budget) → anthropic (premium)
3. Default fallback: anthropic

Cost Optimization:
- Estimated savings: ~64% for typical workloads
- Free tier usage: ~70% of requests
- Budget tier usage: ~20% of requests
- Premium tier usage: ~10% of requests
```

**Cost savings:** 60-85% reduction in API costs

**Documentation:**
- [Provider Routing](Provider-Routing.md)
- [Cost Optimization](Cost-Optimization.md)

---

### `/custom-routing-deactivate`

**Purpose:** Disable tiered routing and revert to default provider

**Usage:**
```bash
/custom-routing-deactivate
```

**What it does:**
1. Disables tiered routing
2. Routes all agents to default provider (anthropic)
3. Ignores profile overrides
4. Ensures consistent quality across all agents

**Output:**
```
✅ Custom routing deactivated

All agents now use default provider: anthropic

Note: This increases API costs but ensures consistent quality
across all agents regardless of profile settings.
```

**Use cases:**
- Testing quality differences
- Debugging provider issues
- Ensuring consistent behavior

**Documentation:**
- [Provider Routing](Provider-Routing.md)
- [Cost Optimization](Cost-Optimization.md)

---

## Utility Commands

### `/hooks`

**Purpose:** Manage pre-command, post-edit, and session hooks

**Usage:**
```bash
/hooks list
/hooks run pre-command --command "npm test"
/hooks run post-edit --file "src/app.js"
```

**Examples:**

**List available hooks:**
```bash
/hooks list

# Expected output:
# Available Hooks:
# - pre-command: Validation before command execution
# - post-edit: Validation after file edits
# - session-end: Cleanup and summary generation
```

**Run post-edit hook:**
```bash
/hooks run post-edit --file "src/routes/users.js" \
  --memory-key "swarm/backend-dev/users" \
  --structured
```

**Documentation:** [core-concepts/hooks-lifecycle](core-concepts/hooks-lifecycle)

---

### `/parse-epic`

**Purpose:** Parse and validate epic configuration files

**Usage:**
```bash
/parse-epic path/to/epic-config.json
```

**Example:**
```bash
/parse-epic planning/auth-epic.json

# Expected output:
# ✅ Epic configuration valid
#
# Epic: Authentication System
# Total Phases: 3
# Total Sprints: 8
# Dependencies: 4 cross-phase dependencies
#
# Phase Breakdown:
# - Phase 1: Core Auth (3 sprints)
# - Phase 2: Advanced Features (3 sprints)
# - Phase 3: Integration & Testing (2 sprints)
```

**Validation checks:**
- JSON syntax validity
- Required fields present
- Dependency references valid
- No circular dependencies
- Sprint IDs unique

---

## Slash Command Cheatsheet

| Command | Purpose | Typical Usage |
|---------|---------|---------------|
| `/cfn-loop` | Self-correcting development | Feature implementation |
| `/cfn-loop-epic` | Multi-phase orchestration | Large projects |
| `/cfn-loop-sprints` | Single-phase sprints | Medium projects |
| `/fullstack` | Full-stack development | Complete features |
| `/swarm` | Swarm management | Coordination setup |
| `/sparc` | SPARC methodology | Structured development |
| `/custom-routing-activate` | Enable cost optimization | Production development |
| `/custom-routing-deactivate` | Disable routing | Testing/debugging |
| `/hooks` | Hook management | Validation workflows |
| `/parse-epic` | Epic validation | Epic planning |

---

## Custom Slash Commands

### Creating Custom Commands

Add custom slash commands in `.claude/commands/[command-name].md`:

**Example: /deploy-staging.md**
```markdown
# /deploy-staging - Deploy to Staging

Deploy current branch to staging environment with validation.

## Usage

```bash
/deploy-staging
```

## What It Does

1. Run full test suite
2. Build production bundle
3. Deploy to staging environment
4. Run smoke tests
5. Generate deployment report

## Configuration

Deployment settings in `.claude/settings.json`:

```json
{
  "deployment": {
    "staging": {
      "url": "https://staging.example.com",
      "branch": "develop"
    }
  }
}
```
```

**Auto-discovery:** Custom commands are automatically discovered and available in Claude conversations.

---

## Best Practices

### When to Use Slash Commands

**Use slash commands for:**
- ✅ Frequently repeated workflows
- ✅ Multi-step processes with specific agent teams
- ✅ Standardized development patterns
- ✅ Quick access to complex coordination

**Use manual agent spawning for:**
- ❌ One-off experimental tasks
- ❌ Custom agent combinations
- ❌ Learning agent coordination patterns

### Command Composition

Combine commands for complex workflows:

```bash
# Step 1: Enable cost optimization
/custom-routing-activate

# Step 2: Execute development loop
/cfn-loop "Implement payment gateway"

# Step 3: Deploy to staging
/deploy-staging

# Step 4: Disable routing for testing
/custom-routing-deactivate
```

### Debugging Commands

If a slash command fails:

1. **Check syntax:**
   ```bash
   /command-name --help
   ```

2. **Enable debug mode:**
   ```bash
   export CLAUDE_FLOW_DEBUG=1
   /command-name
   ```

3. **View command logs:**
   ```bash
   npx claude-flow-novice logs --command /command-name
   ```

---

## Related Documentation

- **[CFN Loop Overview](CFN-Loop-Overview.md)** - Self-correcting development loops
- **[Agent Coordination](Agent-Coordination.md)** - Swarm management and coordination
- **[Provider Routing](Provider-Routing.md)** - Cost optimization routing
- **[CLI Commands](command-reference/cli-commands.md)** - Terminal command reference
- **[Custom Commands](command-reference/workflows.md)** - Create custom workflows

---

**Last Updated:** 2025-10-03
**Version:** 1.5.22
