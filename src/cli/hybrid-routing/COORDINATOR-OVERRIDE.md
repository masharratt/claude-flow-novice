# Coordinator Override for Agent Selection

## Overview

The hybrid routing system supports **three modes** of agent selection:

1. **Automatic Selection** (default) - Keyword-based matching
2. **Coordinator Override** - Manual agent type specification
3. **Full Override** - Custom agents + custom subtasks

## Decision Flow

```
Coordinator Spawns Workers
         ↓
   Has --agents flag?
         ↓
    YES ──────────→ Use coordinator-specified agents
         ↓           Load from .claude/agents/{type}.md
         NO          Generate subtasks (auto or --subtasks)
         ↓
   Keyword Matching
         ↓
   Select top N agents
         ↓
   Auto-generate subtasks
```

## Mode 1: Automatic Selection (Default)

**When to use:** Let the system intelligently match agents to the task.

**How it works:**
1. Script extracts keywords from task description
2. Scores all available agents based on keyword matches
3. Selects top N agents with highest scores
4. Auto-generates agent-specific subtasks

**Example:**
```bash
node src/cli/hybrid-routing/spawn-workers.js \
  "Build authentication system with security audit" \
  --max-agents=3

# Output:
# 🎯 Specialized Agent Assignment:
#    Worker 1: coder - Implement core functionality for: Build authentication...
#    Worker 2: security-specialist - Perform security analysis for: Build authentication...
#    Worker 3: tester - Create comprehensive tests for: Build authentication...
```

**Pros:**
- ✅ No manual agent selection needed
- ✅ Adapts to task keywords automatically
- ✅ Good for standard workflows

**Cons:**
- ❌ Less control over agent selection
- ❌ May miss nuanced task requirements
- ❌ Limited to keyword matching heuristics

---

## Mode 2: Coordinator Override

**When to use:** You (coordinator) know exactly which specialists are needed.

**How it works:**
1. Coordinator specifies agent types via `--agents` flag
2. Script loads agent profiles from `.claude/agents/` folder
3. Auto-generates agent-specific subtasks
4. Falls back to keyword matching if agent type not found

**Example:**
```bash
node src/cli/hybrid-routing/spawn-workers.js \
  "Refactor API with performance optimization" \
  --max-agents=3 \
  --agents=architect,coder,reviewer

# Output:
# 🎯 Using Coordinator Override for agent selection
# 🎯 Specialized Agent Assignment:
#    Worker 1: architect - Design system architecture for: Refactor API...
#    Worker 2: coder - Implement core functionality for: Refactor API...
#    Worker 3: reviewer - Review implementation of: Refactor API...
```

**Available Agent Types:**
- `coder` - Implementation and feature development
- `architect` - System design and architecture
- `tester` - Test creation and validation
- `reviewer` - Code review and quality checks
- `security-specialist` - Security analysis and audits

**Pros:**
- ✅ Full control over agent selection
- ✅ Can enforce specific workflow (e.g., architect → coder → reviewer)
- ✅ Better for complex tasks with known requirements

**Cons:**
- ❌ Requires coordinator to know available agent types
- ❌ Still uses auto-generated subtasks (less control over exact instructions)

---

## Mode 3: Full Override

**When to use:** You need complete control over both agents AND their exact tasks.

**How it works:**
1. Coordinator specifies agent types via `--agents`
2. Coordinator provides custom subtasks via `--subtasks` (pipe-separated)
3. Script pairs agents with subtasks in order
4. No auto-generation - uses exact coordinator instructions

**Example:**
```bash
node src/cli/hybrid-routing/spawn-workers.js \
  "OAuth2 implementation and security review" \
  --max-agents=2 \
  --agents=coder,security-specialist \
  --subtasks="Implement OAuth2 authorization code flow with PKCE|Perform comprehensive security audit of authentication system focusing on token handling and session management"

# Output:
# 🎯 Using Coordinator Override for agent selection
# 🎯 Specialized Agent Assignment:
#    Worker 1: coder - Implement OAuth2 authorization code flow with PKCE
#    Worker 2: security-specialist - Perform comprehensive security audit...
```

**Subtask Format:**
- Use `|` (pipe) to separate subtasks
- Each subtask maps to corresponding agent in `--agents` list
- If fewer subtasks than agents, remaining agents get auto-generated subtasks
- If more subtasks than agents, extra subtasks ignored

**Pros:**
- ✅ Complete control over agent selection AND instructions
- ✅ Can provide highly specific, detailed subtasks
- ✅ Best for complex, nuanced requirements

**Cons:**
- ❌ Most verbose (requires detailed subtask descriptions)
- ❌ No automatic task decomposition fallback

---

## Programmatic Usage (for Coordinators)

### JavaScript/Node.js

```javascript
import { HybridWorkerSpawner } from './src/cli/hybrid-routing/spawn-workers.js';

// Mode 1: Automatic selection
const spawner1 = new HybridWorkerSpawner({
  task: "Build authentication system",
  maxAgents: 3,
  provider: 'zai'
});

// Mode 2: Coordinator override (agent types only)
const spawner2 = new HybridWorkerSpawner({
  task: "Refactor API",
  maxAgents: 3,
  provider: 'zai',
  agentOverride: ['architect', 'coder', 'reviewer']
});

// Mode 3: Full override (agents + custom subtasks)
const spawner3 = new HybridWorkerSpawner({
  task: "Security review",
  maxAgents: 2,
  provider: 'zai',
  agentOverride: ['security-specialist', 'reviewer'],
  subtaskOverride: [
    'Audit authentication system for vulnerabilities',
    'Review authorization logic and access control'
  ]
});

await spawner3.initialize();
await spawner3.spawnAll();
spawner3.printSummary();
await spawner3.cleanup();
```

### From Coordinator Agent (via Task tool)

The coordinator agent can spawn workers with override by writing a wrapper script:

```javascript
// coordinator-spawn-workers.js
import { HybridWorkerSpawner } from './src/cli/hybrid-routing/spawn-workers.js';

const spawner = new HybridWorkerSpawner({
  task: process.env.TASK_DESCRIPTION,
  maxAgents: parseInt(process.env.MAX_AGENTS) || 3,
  provider: process.env.PROVIDER || 'zai',
  agentOverride: process.env.AGENT_TYPES?.split(','),
  subtaskOverride: process.env.SUBTASKS?.split('|')
});

await spawner.initialize();
await spawner.spawnAll();
spawner.printSummary();
await spawner.cleanup();
```

Then coordinator calls:
```bash
TASK_DESCRIPTION="Build feature" \
MAX_AGENTS=3 \
AGENT_TYPES="architect,coder,tester" \
node coordinator-spawn-workers.js
```

---

## Comparison Table

| Feature | Automatic | Coordinator Override | Full Override |
|---------|-----------|---------------------|---------------|
| **Agent Selection** | Keyword-based | Manual specification | Manual specification |
| **Subtask Generation** | Auto | Auto | Manual (custom) |
| **Control Level** | Low | Medium | High |
| **Ease of Use** | Easy | Medium | Complex |
| **CLI Flag** | None | `--agents` | `--agents` + `--subtasks` |
| **Best For** | Standard tasks | Known workflows | Complex requirements |

---

## Fallback Behavior

**Coordinator override gracefully falls back to automatic selection if:**
1. Specified agent type not found in `.claude/agents/` folder
2. Agent profile file missing or malformed
3. Error loading agent definitions

**Example:**
```bash
# Typo in agent type: "codder" instead of "coder"
node src/cli/hybrid-routing/spawn-workers.js "Task" \
  --agents=codder,tester

# Output:
# ⚠️  Agent type 'codder' not found, falling back to keyword matching
# 🎯 Specialized Agent Assignment:
#    Worker 1: coder - Implement core functionality for: Task
#    Worker 2: tester - Create comprehensive tests for: Task
```

---

## Best Practices

### For Coordinators

1. **Use Mode 2 for workflow enforcement:**
   ```bash
   --agents=architect,coder,tester,reviewer
   ```
   Ensures proper phase sequence (design → implement → test → review)

2. **Use Mode 3 for complex, nuanced tasks:**
   ```bash
   --agents=coder,security-specialist \
   --subtasks="Implement OAuth2 with PKCE extension and refresh token rotation|Audit for OWASP Top 10 vulnerabilities with focus on injection attacks"
   ```

3. **Validate agent types before spawning:**
   - Check available agents: `ls .claude/agents/core-agents/ .claude/agents/security/`
   - Valid types: coder, architect, tester, reviewer, security-specialist

### For Agent Selection

**When automatic selection is best:**
- Generic tasks with clear keywords
- Standard development workflows
- Quick prototypes or MVPs

**When coordinator override is best:**
- Enforcing specific workflow phases
- Tasks requiring rare specialists (security, performance)
- Known task decomposition patterns

**When full override is best:**
- Highly specialized, complex tasks
- Nuanced requirements not captured by keywords
- Precise control over agent instructions needed

---

## Examples by Use Case

### Use Case: Feature Development (Standard Workflow)

**Automatic:**
```bash
node src/cli/hybrid-routing/spawn-workers.js "Build user dashboard" --max-agents=3
```

**Coordinator Override:**
```bash
node src/cli/hybrid-routing/spawn-workers.js "Build user dashboard" \
  --max-agents=3 --agents=architect,coder,tester
```

---

### Use Case: Security-Critical Feature

**Full Override (Recommended):**
```bash
node src/cli/hybrid-routing/spawn-workers.js "Payment processing" \
  --max-agents=3 \
  --agents=coder,security-specialist,reviewer \
  --subtasks="Implement Stripe payment flow with PCI compliance|Audit for payment security vulnerabilities and data exposure|Review code for PCI DSS compliance and best practices"
```

---

### Use Case: Architecture Refactor

**Coordinator Override:**
```bash
node src/cli/hybrid-routing/spawn-workers.js "Migrate to microservices" \
  --max-agents=4 \
  --agents=architect,architect,coder,reviewer
```
*(Note: Can repeat agent types to assign multiple workers same role)*

---

## Future Enhancements

- [ ] Dynamic agent loading from custom directories
- [ ] Agent capability matrix for complex routing
- [ ] Multi-round coordination (architect → coders → reviewer)
- [ ] Cost estimation before spawning
- [ ] Agent performance tracking and selection optimization
