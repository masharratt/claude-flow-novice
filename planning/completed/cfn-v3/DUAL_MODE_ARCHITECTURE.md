# CFN v3 - Dual Mode Architecture

## Overview

CFN v3 supports TWO spawning modes that can be toggled based on use case:

1. **CLI Mode** (cost-optimized): Main Chat → Coordinator → Orchestrator → CLI spawns
2. **Task Mode** (simplified): Main Chat → Coordinator → Returns config → Main Chat spawns via Task()

---

## Mode Comparison

| Aspect | CLI Mode | Task Mode |
|--------|----------|-----------|
| **Cost** | 95-98% savings | Baseline (100%) |
| **Spawning** | CLI via orchestrator | Task() tool |
| **Waiting** | Redis BLPOP (0 tokens) | Sleep loops or no waiting |
| **Visibility** | Background processes | Full Main Chat visibility |
| **Debugging** | Harder (background) | Easier (inline) |
| **Use Case** | Production, long-running | Development, testing |

---

## Architecture Flow

### CLI Mode (Default)
```
Main Chat
  ↓
Task("cfn-v3-coordinator", task="...", mode="cli")
  ↓
Coordinator Agent:
  1. Classify task (task-classifier)
  2. Query playbook (playbook/query-playbook.sh)
  3. Estimate complexity (complexity-estimator)
  4. Select agents (agent-selector)
  5. Load validation template
  6. Prune context (context-pruner)
  ↓
  7. Call orchestrate-cfn-loop-v3.sh with config
  ↓
Orchestrator Script:
  - Spawns Loop 3 agents via CLI (npx claude-flow-novice)
  - Gate check (self-validation)
  - Spawns Loop 2 validators via CLI
  - Spawns Product Owner via CLI
  - Iteration logic with Redis BLPOP waiting
  ↓
Coordinator: Return structured result to Main Chat
```

### Task Mode (Simplified)
```
Main Chat
  ↓
Task("cfn-v3-coordinator", task="...", mode="task")
  ↓
Coordinator Agent:
  1-6. Same analysis as CLI mode
  ↓
  7. Return JSON config to Main Chat:
     {
       "loop3_agents": ["backend-dev", "coder"],
       "loop2_agents": ["reviewer", "tester"],
       "validation_criteria": {...},
       "estimated_iterations": 4,
       ...
     }
  ↓
Main Chat:
  - Spawns Loop 3 agents via Task()
  - Collects confidence scores
  - Gate check
  - Spawns Loop 2 validators via Task()
  - Collects consensus
  - Spawns Product Owner via Task()
  - Decision → ITERATE/PROCEED
  - Re-spawn agents for next iteration
```

---

## Implementation Changes Needed

### 1. Create v3 Orchestrator Script
**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop-v3.sh`

```bash
#!/bin/bash
# Enhanced orchestrator with v3 features:
# - Multi-domain validation templates
# - Playbook-driven agent selection
# - Context pruning
# - Intervention detection
# - Retrospective triggering

# Usage:
./orchestrate-cfn-loop-v3.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --task-type "software-development" \
  --loop3-agents "backend-dev,coder,security-specialist" \
  --loop2-agents "reviewer,tester,security-auditor" \
  --validation-template ".claude/skills/validation-templates/software.json" \
  --playbook-match "true" \
  --estimated-iterations 4
```

Enhancements over v2:
- Reads validation template for domain-specific criteria
- Applies context pruning per iteration
- Detects intervention triggers (plateau, recurring feedback)
- Triggers Loop 5 retrospective on completion
- Updates playbook automatically

---

### 2. Update cfn-v3-coordinator Agent
**File:** `.claude/agents/cfn-v3-coordinator.md`

Add mode parameter:
```markdown
## Parameters
- task: Task description
- mode: "cli" (default) or "task"
- epic-context: Optional epic-level context
- phase-context: Optional phase-level context

## Behavior by Mode

**CLI Mode:**
1. Analyze task (classify, playbook query, complexity, agent selection)
2. Call orchestrate-cfn-loop-v3.sh with config
3. Wait for orchestrator to complete
4. Return structured result

**Task Mode:**
1. Analyze task (same as CLI)
2. Return JSON config to Main Chat
3. Exit (Main Chat handles spawning)
```

---

### 3. Update CLAUDE.md
**Section:** CFN Loop Overview

```markdown
## CFN v3 Modes

### CLI Mode (Production - Default)
**Use when:** Production tasks, cost optimization critical, long-running loops

**Benefits:**
- 95-98% cost savings vs Task spawning
- Zero-token waiting (Redis BLPOP)
- Supports indefinite iterations

**Usage:**
/cfn-loop "Task description" --mode=cli

### Task Mode (Development)
**Use when:** Testing, debugging, need full visibility

**Benefits:**
- Full visibility in Main Chat
- Easier debugging (inline agent output)
- Simpler mental model

**Usage:**
/cfn-loop "Task description" --mode=task
```

---

### 4. Create Mode Toggle Slash Command
**File:** `.claude/commands/cfn-mode.md`

```markdown
---
name: cfn-mode
description: Toggle CFN Loop spawning mode (cli vs task)
---

Usage:
/cfn-mode cli      # Enable CLI spawning (cost-optimized)
/cfn-mode task     # Enable Task spawning (simplified)
/cfn-mode status   # Show current mode

Saves preference to `.cfn-mode.json`
```

---

### 5. Slash Command Updates
**File:** `.claude/commands/cfn-loop.md`

Add mode parameter:
```markdown
Usage:
/cfn-loop "Task description" [--mode=cli|task] [--mode=standard]

--mode=cli   Use CLI spawning (cost-optimized, default)
--mode=task  Use Task spawning (simplified, full visibility)
```

---

## Configuration File

**File:** `.cfn-mode.json`
```json
{
  "default_spawn_mode": "cli",
  "cli_provider": "zai",
  "task_provider": "anthropic",
  "last_updated": "2025-10-23"
}
```

---

## Migration Path

### Phase 1: Create Dual-Mode Coordinator (Week 1)
- [ ] Update cfn-v3-coordinator.md with mode parameter
- [ ] Keep all analysis logic (classifier, playbook, etc.)
- [ ] Add mode branching: CLI → orchestrator, Task → return JSON

### Phase 2: Create v3 Orchestrator (Week 1-2)
- [ ] Copy orchestrate-cfn-loop.sh → orchestrate-cfn-loop-v3.sh
- [ ] Add validation template loading
- [ ] Add context pruning per iteration
- [ ] Add intervention detection
- [ ] Add retrospective triggering
- [ ] Add playbook auto-update

### Phase 3: Update Documentation (Week 2)
- [ ] Update CLAUDE.md with dual-mode docs
- [ ] Create mode toggle command
- [ ] Update all slash commands with --mode parameter
- [ ] Create configuration file

### Phase 4: Testing (Week 2-3)
- [ ] Test CLI mode (cost verification)
- [ ] Test Task mode (output verification)
- [ ] Test mode switching
- [ ] Validate playbook learning works in both modes

---

## Trade-offs

### When to Use CLI Mode
✅ Production CFN Loops
✅ Long-running tasks (>5 iterations)
✅ Cost optimization critical
✅ Background execution acceptable

### When to Use Task Mode
✅ Development and testing
✅ Short tasks (1-2 iterations)
✅ Need full visibility
✅ Debugging agent behavior

---

## Cost Impact

**Example: 10-iteration CFN Loop with 5 agents**

**Task Mode:**
- Main Chat: 10 iterations × 5 agents × 50K tokens = 2.5M tokens
- Cost: $7.50 (Anthropic pricing)

**CLI Mode:**
- Coordinator: 1 spawn × 30K tokens = 30K tokens
- CLI agents: 10 iterations × 5 agents × 50K tokens = 2.5M tokens (Z.ai pricing)
- Coordinator cost: $0.09
- CLI agent cost: $1.25
- Total: $1.34
- **Savings: 82%**

---

## Open Questions

1. Should playbook store spawning mode used? (helps learning)
2. Should intervention detection differ by mode?
3. Should retrospective run in both modes?
4. Default mode for new users?

---

## Success Criteria

✅ Both modes functional and tested
✅ Coordinator handles mode branching cleanly
✅ Orchestrator v3 has all new features
✅ Documentation clear on when to use each
✅ Slash commands support mode toggle
✅ Configuration persists between sessions
