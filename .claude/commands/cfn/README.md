# CFN Loop Commands - Quick Reference

## Workflows vs Skills vs Playbooks - When to Use What

### Skills (Most Common) - Building Blocks
**What:** Single-purpose bash scripts in `.claude/skills/`
**When:** Most tasks - they're the building blocks
**Example:** `cfn-redis-coordination`, `cfn-agent-spawning`, `cfn-loop-validation`

```bash
# Direct skill invocation
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "task-123" \
  --agent-id "coder-1"
```

**Use skills when:**
- Single, focused operation needed
- Called by agents or coordinators
- Part of larger workflow
- Reusable across different tasks

### Playbooks (Not Currently Used) - Pre-Configured Sequences
**What:** JSON files defining skill sequences for common patterns
**When:** Repeating the same skill sequence often
**Status:** Not implemented yet, use skills directly

### Workflows - Complex Automation
**What:** Event-driven, multi-step automation with conditions/branching
**When:** Complex sequences with conditional logic
**Example:** CI/CD pipelines, feature development workflows

```yaml
name: "feature-development"
trigger: "branch-created"
steps:
  - name: "analyze"
    agent: "researcher"

  - name: "implement"
    agent: "backend-dev"
    depends: ["analyze"]
    parallel: true  # Multiple agents in parallel

  - name: "test"
    agent: "tester"
    depends: ["implement"]
    condition: "if tests_exist"  # Conditional execution
```

**Use workflows when:**
- Event-driven automation (git hooks, CI/CD)
- Conditional branching logic needed
- Multi-agent parallel execution
- Long-running background processes
- Integration with external systems

## Decision Tree

```
Need to automate something?
├─ Single operation?
│  └─ Use SKILL directly
├─ Complex logic (conditionals, events, parallel)?
│  └─ Create WORKFLOW (YAML via /workflow)
└─ CFN Loop execution?
   ├─ Planning first? → /write-plan then /cfn-loop-cli
   ├─ Production? → /cfn-loop-cli
   ├─ Debugging? → /cfn-loop-task
   └─ Frontend? → /cfn-loop-frontend
```

## Examples

### Example 1: Simple Task (Use Skill)
**Goal:** Enter waiting mode for agent

```bash
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "task-123" --agent-id "coder-1"
```

### Example 2: CFN Loop Execution
**Goal:** Implement JWT authentication

**Option 1: Plan First (Recommended for Complex Tasks)**
```bash
# Step 1: Generate plan
/write-plan "Implement JWT authentication" --mode=standard
# Reviews: planning/PLAN_jwt_authentication.md

# Step 2: Execute
/cfn-loop-cli "Implement JWT authentication" --mode=standard
```

**Option 2: Direct Execution (Simple Tasks)**
```bash
# Production execution (cost-optimized)
/cfn-loop-cli "Implement JWT authentication" --mode=standard

# OR debugging (full visibility)
/cfn-loop-task "Implement JWT authentication" --mode=standard
```

### Example 3: Complex Automation (Use Workflow)
**Goal:** Full feature development (analyze → implement → test → deploy)

```bash
# Create workflow (via /workflow)
/workflow create feature-pipeline

# Execute workflow
/workflow execute feature-pipeline
```

## Quick Reference Table

| Type | Files | Complexity | Conditional Logic | Parallel Execution | Event-Driven |
|------|-------|------------|-------------------|-------------------|--------------|
| **Skill** | `.sh` scripts | Low | No | No | No |
| **CFN Loop** | Slash commands | Medium | Yes (built-in) | Yes (agents) | No |
| **Workflow** | `.yaml` definitions | High | Yes | Yes | Yes |

---

## CFN Loop Commands (Current)

### Execution Commands
- `/cfn-loop-task` - Task mode (debugging, full visibility, Main Chat coordinates)
- `/cfn-loop-cli` - CLI mode (production, cost-optimized, coordinator spawns CLI agents)
- `/cfn-loop-frontend` - Visual iteration (screenshot + video validation, supports both modes)

### Planning & Documentation
- `/write-plan` - Pre-planning phase (generates TDD implementation plan)
- `/cfn-loop-document` - Documentation generation (updates `/readme`)

### Configuration
- `/cfn-mode` - Toggle CLI vs Task spawning mode
- `/cfn-optimize-agents` - Agent optimization settings
- `/cfn-claude-sync` - Sync rules from CLAUDE.md to commands

### Infrastructure
- `/switch-api` - Switch between Z.ai and Anthropic providers

### Automation
- `/workflow` - Event-driven workflow automation (complex multi-step)

### Testing & Utilities
- `/hello-world-tests` - CFN coordination validation tests (4 layers)
- `/github-commit` - Git commit with CI/CD monitoring
- `/launch-web-dashboard` - Start web portal (http://localhost:3000)
- `/list-agents-rebuild` - Regenerate agent list from discovery

### Adaptive Context (ACE System)
- `/context-stats` - View adaptive context statistics
- `/context-reflect` - Extract lessons from task execution
- `/context-query` - Query context bullets by category/tags
- `/context-inject` - Inject context into CLAUDE.md dynamically
- `/context-curate` - Merge reflection deltas with deduplication

---

## When to Use Each Command

### /write-plan (Pre-Planning)
**Use before complex CFN Loop tasks:**
- Security-critical features
- Complex architecture decisions
- Team collaboration (plan review)
- Learning CFN Loop workflow

### /cfn-loop-cli (Production)
**Use for:**
- Production features
- Long-running tasks (>10 min)
- Multi-iteration workflows
- Cost-sensitive projects
- **Cost:** $0.054/iteration with Z.ai routing

### /cfn-loop-task (Debugging)
**Use for:**
- Debugging CFN Loop issues
- Learning agent interactions
- Prototyping configurations
- Short tasks (<5 min)
- **Cost:** $0.150/iteration (3x CLI, but full visibility)

### /cfn-loop-frontend (Visual Iteration)
**Use for:**
- React/Vue/Angular components
- UI implementation with mockups
- Accessibility validation
- Visual regression testing
- **Supports:** Both CLI and Task modes

### /workflow (Complex Automation)
**Use for:**
- CI/CD pipelines
- Event-driven automation
- Multi-step with conditionals
- External system integration

---

**Version:** 3.0.0 (2025-10-31) - Consolidated command structure with workflows/skills guide
