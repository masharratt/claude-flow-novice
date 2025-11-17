# Claude Flow Novice — AI Agent Orchestration

**Production Status:** v2.9.1 - Namespace Isolation Complete (2025-10-25)

---

## Namespace Isolation (v2.9.1)

**Structure:**
- Agents: `.claude/agents/cfn-dev-team/` (23 production agents in 4 categories)
  - coordinators/ (cfn-v3-coordinator)
  - developers/ (coder, backend-dev, researcher, architect, agent-builder, etc.)
  - reviewers/ (reviewer, code-analyzer, code-quality-validator, security-specialist)
  - testers/ (tester, playwright-tester, interaction-tester, production-validator, perf-analyzer)
- Skills: `.claude/skills/cfn-*/` (43 skills with cfn- prefix)
- Hooks: `.claude/hooks/cfn-*` (7 hooks with cfn- prefix)
- Commands: `.claude/commands/cfn/` (45+ commands in subdirectory)
- Data: `.claude/cfn-data/` (SQLite databases, playbook data)

**NPM Installation:**
```bash
npm install claude-flow-novice  # Auto-runs cfn-init on postinstall
cp CFN-CLAUDE.md CLAUDE.md      # Activate CFN workflows for CLI agents
```

**Package Metrics:**
- 573 KB tarball, 2.4 MB unpacked (68% reduction from v2.0.0)
- 303 files (down from 1,401)
- Collision risk: ~0.01%

**Agent Discovery:**
- Recursive search through `.claude/agents/**/*.md`
- Finds both cfn-dev-team and user custom agents
- Flat namespace (user requests "coder", finds "cfn-dev-team/developers/coder.md")

**Benefits:**
- User custom files preserved (agents, skills, hooks)
- Safe to reinstall/update
- No manual initialization needed

---

## Core Operational Rules

### Mandatory Patterns
* **Delegate all non-trivial work** (≥4 steps, multi-file, research, testing, architecture, security, refactoring)
* **Spawn coordinator first** - coordinator handles all agent spawning internally via CLI
* **Batch operations** in single messages (file edits, bash commands, todos, memory ops)
* **Run post-edit hook** after every file edit (including .md files)
* **Never work solo** on multi-step tasks
* **Never mix implementers and validators** in same message
* **Never run tests inside agents** - execute once, agents read results
* **Never save to project root** - use proper subdirectories
* **No unsolicited guides/docs** unless explicitly requested
* **Use spartan language** - concise answers in plain English
* **Redis persistence** enables swarm recovery across interruptions
* **ALL agent communication** via Redis pub/sub (no direct file coordination)
* **NEVER HARDCODE API KEYS**
* **Sleep on repeat** when monitoring background processes
* **USE GREP INSTEAD OF FIND** - it's less resource intensive in our WSL2 instances

### Agent Output Standards
* **Bug documentation**: `docs/BUG_#_*.md`
* **Test scripts**: `tests/test-*.sh` (persistent, version controlled)
* **Feature documentation**: `docs/FEATURE_NAME.md`
* **Temporary files ONLY**: `/tmp/` (ephemeral scratch data)
* **Full guidelines**: `docs/AGENT_OUTPUT_STANDARDS.md`

### Consensus Thresholds
* **Gate** (agent self-confidence): ≥0.75
* **Validators consensus**: ≥0.90

### CTO Delegation Persona
* **Delegate ruthlessly** - if task requires >3 steps, spawn agents immediately
* **Define clear success criteria** for implementation (working code, passing tests, documented features)
* **Never define adoption criteria** (user engagement, rollout strategy, training plans)
* **Provide context, not solutions** - agents determine implementation details
* **Success = implementation complete**, not "users love it"

---

## Skills-Based Coordination

### Core Skills (cfn- prefixed)
- **Redis Coordination** (`.claude/skills/cfn-redis-coordination/SKILL.md`)
- **Agent Spawning** (`.claude/skills/cfn-agent-spawning/SKILL.md`)
- **CFN Loop Orchestration** (`.claude/skills/cfn-loop-orchestration/SKILL.md`)
- **Product Owner Decision** (`.claude/skills/cfn-product-owner-decision/SKILL.md`)
- **Agent Output Processing** (`.claude/skills/cfn-agent-output-processing/SKILL.md`)

### Coordination Principles
* ALL agent communication via explicit Redis pub/sub dependencies
* Modular, independently maintainable skills
* Minimal, focused coordination logic
* **Multi-layer enforcement** for distributed systems (technical, skill, cross-reference, agent, system, entry)
* **Centralized orchestration** in dedicated coordination skills

### Main Chat Role (Thin Orchestration)
* Spawn ONLY coordinator agent (single Task() call)
* Coordinator handles all agent spawning internally via CLI
* Delegate ALL coordination to skills
* Use skill-specific configuration for complex workflows

---

## CFN v3 Dual-Mode Architecture

### Two Spawning Modes

**CLI Mode (Default):**
- Z.ai provider routing (when enabled)
- Redis context injection
- Swarm recovery support

**Task Mode:**
- Full visibility for debugging
- Anthropic provider routing
- Direct context injection
- Simplified coordination

### Mode Selection
```bash
# Default: CLI mode
/cfn-loop "Task description"

# Explicit Task mode (debugging)
/cfn-loop "Task description" --spawn-mode=task

# Toggle modes
/cfn-mode cli    # Enable CLI spawning (default)
/cfn-mode task   # Enable Task spawning
/cfn-mode status # Show current mode
```

### Key Differences
- **CLI mode**: Main Chat → Coordinator → orchestrate.sh → CLI agents
- **Task mode**: Main Chat → Coordinator → JSON → Main Chat spawns Task() agents
- CLI agents use Z.ai routing automatically
- Both modes store context in Redis for swarm recovery

**Reference:** `planning/cfn-v3/DUAL_MODE_IMPLEMENTATION.md`

---

## Custom Routing (Z.ai Provider Integration)

### Provider Routing Model
- **Task() agents** → Use Main Chat provider (Anthropic)
- **CLI-spawned agents** → Use custom routing (Z.ai when enabled)

### Enable Custom Routing (One-Time Setup)
```bash
/custom-routing-activate  # Enable Z.ai routing
/switch-api status        # Verify status
```

**Key Concept:**
CLI-spawned agents (`npx claude-flow-novice`) automatically use custom routing when enabled.

---

## Single Coordinator Pattern (CRITICAL)

Main Chat spawns ONLY the coordinator agent. The coordinator handles all agent spawning internally via CLI and orchestrator script.

**Active Coordinator:** `cfn-v3-coordinator` (`.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`)

### ❌ FORBIDDEN - Main Chat Spawning Workers
```javascript
// WRONG in v3 - Don't spawn workers from Main Chat
Task("coordinator", "Coordinate task...")
Task("backend-dev", "Implement feature...")  // ❌ NO
Task("tester", "Test feature...")            // ❌ NO
```

### ✅ REQUIRED - Single Coordinator
```javascript
// CORRECT - Main Chat spawns only coordinator
// Slash commands automatically use cfn-v3-coordinator
Task("cfn-v3-coordinator", `
  Execute CFN Loop for: Implement authentication

  Coordinator will:
  1. Analyze task and select optimal agents
  2. Invoke .claude/skills/cfn-loop-orchestration/orchestrate.sh
  3. Orchestrator spawns agents via CLI
  4. Coordinator manages all Redis coordination
  5. Return structured result to Main Chat
`)
```

### Why This Pattern
- Coordinator controls spawn timing via orchestrator
- Sequential CLI spawning (coordinator manages order)
- Clean separation: Main Chat → Coordinator → Workers

---

## Post-Edit Validation (REQUIRED)

After ANY Edit/Write/MultiEdit operation on all file types:
```bash
./.claude/hooks/invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"
```

**Why:** Prevents errors from propagating. Non-blocking by default.
**Config:** `.claude/hooks/post-edit.config.json`
**Skill:** `.claude/skills/hook-pipeline/SKILL.md`

---

## When Agents Are Mandatory

Spawn agents if ANY apply:
* > 3 distinct steps
* Multiple files
* Research + implement + test
* Design decisions
* Code review/quality
* Security/performance/compliance
* System integration
* Documentation generation
* Refactor/optimize
* Any feature work

### Skill Selection Criteria
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

---

## Single Agent vs Coordinator

**Use Single Agent:**
* 1 specialized task (coding, reviewing, testing)
* No dependencies on other agents
* Straightforward execution

**Use Coordinator:**
* Multiple agents needed (2+)
* Sequential dependencies (Loop 3 → Loop 2 → Product Owner)
* Iteration/consensus required
* CFN Loop workflows

---

## Redis Coordination

Redis provides:
- **Context storage** for orchestrator agent spawning
- **Communication** via pub/sub between agents
- **Swarm recovery** state persistence

Refer to `.claude/skills/redis-coordination/SKILL.md` for:
- Simple Chain Coordination
- Hierarchical Broadcast
- Mesh Hybrid Patterns

---

## CFN Loop Overview

### Skill-Driven Loop Management
- Coordination via `.claude/skills/cfn-loop-validation/SKILL.md`
- Automatic dependency orchestration
- Adaptive context injection
- Modular loop progression

### Mode Comparison

| Mode | Gate | Consensus | Iterations | Validators |
|------|------|-----------|------------|------------|
| MVP | ≥0.70 | ≥0.80 | 5 | 2 |
| Standard | ≥0.75 | ≥0.90 | 10 | 3-4 |
| Enterprise | ≥0.85 | ≥0.95 | 15 | 5 |

### CFN Loop Dependency Enforcement (MANDATORY)

**1. Main Chat spawns coordinator:**
```javascript
Task("cfn-v3-coordinator", `
  Execute CFN Loop for: Implement authentication system
  Use orchestrator for dependency enforcement.
`)
```

**2. Coordinator invokes orchestrator internally:**
```bash
# Coordinator runs this (NOT Main Chat)
./.claude/skills/cfn-loop-orchestration/cfn-orchestrate.sh \
  --task-id "unique-task-id" \
  --mode standard \
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --product-owner "product-owner"
```

**3. Orchestrator spawns agents via CLI:**
```bash
# Agents come from cfn-dev-team namespace
npx cfn-spawn agent researcher --task-id "$TASK_ID"  # Finds cfn-dev-team/developers/researcher.md
npx cfn-spawn agent backend-dev --task-id "$TASK_ID"  # Finds cfn-dev-team/developers/backend-dev.md
```

**4. Coordinator manages iterations and returns result to Main Chat**

### Agent Completion Protocol

Each agent MUST signal completion before entering waiting mode:

```bash
# 1. Complete work
# 2. Signal done
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# 3. Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85 \
  --iteration 1

# 4. Enter waiting mode
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-complete"
```

### Orchestration Flow (Self-Validation Pattern)

1. Loop 3 agents complete work and report confidence
2. **Gate Check:** Loop 3 self-validation scores checked
   - IF gate FAILS → Wake Loop 3 for iteration N+1 (skip Loop 2)
   - IF gate PASSES → Signal Loop 2 to start work
3. Loop 2 validators WAIT for gate pass signal (`redis-cli blpop "swarm:${TASK_ID}:gate-passed" 0`)
4. Loop 2 validators review Loop 3 work and report consensus
5. **Product Owner Decision:** Orchestrator spawns Product Owner and parses output
   - Uses `.claude/skills/product-owner-decision/execute-decision.sh`
   - Extracts PROCEED/ITERATE/ABORT from agent output
   - Validates deliverables (prevents "consensus on vapor")
6. **Decision Execution:**
   - IF PROCEED → Task complete
   - IF ITERATE → Wake all agents for iteration N+1
   - IF ABORT → Exit with error

---

## CFN Loop Slash Commands

**Recommended: Use slash commands for CFN Loop execution**

Main Chat should use these commands instead of manually spawning coordinators:

```bash
# Single Task
/cfn-loop "Implement JWT authentication" --mode=standard
/cfn-loop-single "Fix security bug in auth module"

# Multi-Phase Epic
/cfn-loop-epic "Build complete authentication system"
```

**What These Commands Do:**
- Automatically spawn coordinator
- Pass structured parameters (success criteria, agent configuration)
- Enable web portal visibility
- Handle all orchestration internally

**See:** `.claude/commands/CFN_COORDINATOR_PARAMETERS.md`

---

## Adaptive Context Lessons

### Strategy Patterns

**STRAT-007: Background Execution Strategy**
- Use background execution with Redis monitoring for long-running orchestration workflows (>10 minutes)
- Bash tool has hard 10-minute timeout that cannot be extended

**STRAT-020: Mandatory Deliverable Verification**
- Implement mandatory deliverable verification with forced iteration when no files created
- After Loop 2 consensus, check git status for file changes
- Prevents "consensus on vapor" where validators approve plans without actual code

**STRAT-021: Standardized Context Extraction Templates**
- Use standardized context extraction templates in coordinators
- Template structure: epicGoal, inScope, outOfScope, deliverables, directory, acceptanceCriteria
- Prevents minimal context that causes wrong deliverables

**STRAT-026: Redis Context Storage Over CLI Parameters**
- Use Redis for complex JSON context storage instead of CLI parameters
- Eliminates shell escaping issues, enables swarm recovery

**STRAT-027: Consensus Validation for Architecture**
- Use specialized consensus teams (reviewer + tester) to validate implementations before deployment
- Achieved 0.92-0.95 confidence scores, caught design issues early

**STRAT-028: Modular Skill Architecture**
- Decompose complex systems into independent skills
- Enables reuse, testing isolation, and incremental enhancement

### Implementation Patterns

**PATTERN-009: Multi-Pattern Confidence Parsing**
- Implement multi-pattern confidence parsing with fallback strategies
- Patterns: explicit numeric (0.85), percentage (85%), qualitative (high/medium/low)

**PATTERN-010: Parallel Execution with Temp Files**
- Use background processes with temporary files to eliminate race conditions
- Pattern: spawn in background with `(skill-execution > /tmp/output-file) &`, collect PIDs, use `wait`

**PATTERN-020: Multi-Layer Context Injection**
- Ensure context flows through ALL layers: coordinator → orchestrator → agents
- Breaking this chain causes "consensus on vapor"

**PATTERN-023: Dual-Mode Architecture Pattern**
- Implement dual execution modes (optimized vs simplified) sharing core logic
- CLI mode for production, Task mode for debugging

**PATTERN-024: Swarm Recovery via Persistence**
- Store swarm state in Redis with TTL to enable crash recovery
- Agents can resume from last known state using task_id as recovery key

### Anti-Patterns

**ANTI-004: Regex Validation Anti-Pattern**
- Avoid simplistic regex matching for agent validation
- Pattern `[[ $AGENTS =~ $AGENTS ]]` always returns true (self-matching)

**ANTI-020: Context Storage Without Injection**
- Avoid storing context in Redis without retrieving and injecting it into agent prompts

**ANTI-021: Generic Context When Specifics Exist**
- Never pass generic iteration-level context when task-specific deliverables exist
- Agents cannot infer specifics from generic iteration numbers

**ANTI-022: Premature Optimization**
- Avoid implementing optimization features before validating necessity

---

## Additional Resources

**Skill References:**
- Redis Coordination: `.claude/skills/cfn-redis-coordination/SKILL.md`
- Agent Spawning: `.claude/skills/cfn-agent-spawning/SKILL.md`
- CFN Loop Validation: `.claude/skills/cfn-loop-validation/SKILL.md`
- Agent Builder: `.claude/agents/cfn-dev-team/developers/agent-builder.md`
- Team Documentation: `.claude/agents/cfn-dev-team/README.md`

**Maintenance Plans:**
- Rollback Strategy: `planning/skills/ROLLBACK_PLAN.md`
- Maintenance Schedule: `planning/skills/MAINTENANCE_SCHEDULE.md`

**Migration Analytics:**
See `.artifacts/analytics/context-reduction-report.json`

---

**Version:** 2.9.1 (Namespace Isolation Complete)
**Last Updated:** 2025-10-25
**Package:** 573 KB tarball, 2.4 MB unpacked, 303 files
**Agents:** 23 in cfn-dev-team (4 categories)
**Skills:** 43 with cfn- prefix
**Collision Risk:** ~0.01%
