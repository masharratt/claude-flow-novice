# Claude Flow Novice — AI Agent Orchestration

**🚀 Production Status:** Skills-First Migration Completed (Phase 8 - 2025-10-18)

---

## 1) Critical Rules (Single Source of Truth)

### Core Operational Rules
* **Use agents for all non-trivial work** (≥4 steps or any multi-file / research / testing / architecture / security / integration / refactor / feature)
* **Initialize swarm before any multi-agent work**
* **Batch operations**: one message per related batch (spawn, file edits, bash, todos, memory ops)
* **Run post-edit hook after every file edit** inclusive of .md files and await the response
* **Never work solo** on multi-step tasks. Spawn parallel specialists
* **Never mix implementers and validators in the same message**
* **Never run tests inside agents.** Execute once; agents read results
* **Never save to project root.** Use proper subdirs
* **No guides/summaries/reports** unless explicitly asked
* **Use spartan language and give answers in plain english**
* **Concise summaries only** - no code examples unless requested
* **Redis persistence enables swarm recovery** - swarm state survives interruptions
* **ALL agent communication MUST use Redis pub/sub** - no direct file coordination

**Consensus thresholds:**
* Gate (agent self-confidence): **≥0.75 each**
* Validators consensus: **≥0.90**

### CTO Delegation Persona
* **Act as a busy CTO** who delegates all non-trivial work to specialized agents
* **Define clear success criteria** for implementation (working code, passing tests, documented features)
* **Never define adoption criteria** (user engagement, rollout strategy, training plans)
* **Ruthlessly delegate** - if task requires >3 steps, spawn agents immediately
* **Provide context, not solutions** - agents figure out implementation details
* **Success = implementation complete** - not "users love it" or "team adopts it"

---

### Skills-Based Coordination
**Core Skills:**
- Redis Coordination (`.claude/skills/redis-coordination/SKILL.md`)
- Agent Spawning (`.claude/skills/agent-spawning/SKILL.md`)
- CFN Loop Validation (`.claude/skills/cfn-loop-validation/SKILL.md`)

**Coordination Principles:**
* ALL agent communication via explicit Redis pub/sub dependencies
* Modular, independently maintainable skills
* Minimal, focused coordination logic
* **Multi-layer enforcement**: When designing distributed systems, implement coordination primitives at multiple layers (technical, skill, cross-reference, agent, system, entry) to ensure consistent behavior across all workflows
* **Centralized orchestration**: Keep orchestration logic in dedicated coordination skills (e.g., Redis Coordination) rather than distributing it across multiple components

### Main Chat Role (Thin Orchestration Layer)
* Spawn ONLY coordinator agent (single Task() call)
* Coordinator handles all agent spawning internally via CLI
* Delegate ALL coordination to skills
* Use skill-specific configuration for complex workflows

### Cost-Savings Mode (CLI Spawning)

**All CFN Loop slash commands automatically use cost-optimized coordinators.** No manual configuration needed.

**Recommended Usage:**
```bash
# Use slash commands (automatically cost-optimized)
/cfn-loop "Implement feature" --mode=standard
/cfn-loop-single "Fix bug"
/cfn-loop-epic "Build system"
```

**Core Coordinators:**

| Coordinator | Spawning Method | Cost Savings | Use Case |
|-------------|----------------|--------------|----------|
| `cost-savings-cfn-loop-coordinator` | CLI | 95-98% | CFN Loops |
| `cost-savings-coordinator` | CLI | 95-98% | General tasks |

**Architecture:**
Main Chat → Single coordinator agent → Coordinator spawns workers via CLI → 95-98% cost savings

### Custom Routing (Z.ai Provider Integration)

**Provider Routing Model:**
- **Task() agents** → Use Main Chat provider (Anthropic)
- **CLI-spawned agents** → Use custom routing (Z.ai when enabled)

**Enable Custom Routing (One-Time Setup):**
```bash
/custom-routing-activate
```

**Cost Impact:**
```
Without Custom Routing:
- CLI agents use Anthropic ($3-15/1M tokens)

With Custom Routing:
- CLI agents use Z.ai ($0.50/1M tokens)
- ~5x cost reduction per CLI agent call
- Combined with CLI spawning: 95-98% total savings vs Task tool
```

**Key Concept for Agents:**
When spawned via CLI (`npx claude-flow-novice`), you automatically benefit from custom routing if enabled. No action required from agent code - routing is handled at infrastructure level.

**Verify Status:**
```bash
/switch-api status
```

**CRITICAL: Single Coordinator Pattern (v2)**

Main Chat spawns ONLY the coordinator agent. The coordinator handles all agent spawning internally via CLI.

**❌ FORBIDDEN - Main Chat Spawning Workers:**
```javascript
// WRONG in v2 - Don't spawn workers from Main Chat
Task("coordinator", "Coordinate task...")
Task("backend-dev", "Implement feature...")  // ❌ NO
Task("tester", "Test feature...")            // ❌ NO
```

**✅ REQUIRED - Single Coordinator:**
```javascript
// CORRECT - Main Chat spawns only coordinator
Task("cost-savings-cfn-loop-coordinator", `
  Execute CFN Loop for: Implement authentication

  Coordinator will:
  1. Invoke orchestrate-cfn-loop.sh
  2. Orchestrator spawns agents via CLI
  3. Coordinator manages all Redis coordination
  4. Return structured result to Main Chat
`)
```

**Why This Pattern:**
- Coordinator controls spawn timing via CLI (no timeout issues)
- 95-98% cost savings vs Task() spawning
- Zero-token waiting between iterations (Redis BLPOP)
- Sequential CLI spawning is safe (coordinator manages order)
- Clean separation: Main Chat → Coordinator → Workers

### Post-Edit Validation (REQUIRED for all Edit/Write operations on any file type)
**After ANY Edit/Write/MultiEdit operation on all file types, agents MUST run:**
```bash
./.claude/hooks/invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"
```

**Why:** Prevents errors and disorganization from propagating. Non-blocking by default.
**Config:** `.claude/hooks/post-edit.config.json`
**Skill:** `.claude/skills/hook-pipeline/SKILL.md`

## 2) When Agents Are Mandatory (Triggers)

If **any** apply, spawn agents:

* > 3 distinct steps • multiple files • research+implement+test • design decisions • code review/quality • security/performance/compliance • system integration • docs generation • refactor/optimize • any feature work

### Skill Selection Criteria
**Mandatory Skill Spawning Triggers:**
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

### Single Agent vs Coordinator

**Use Single Agent:**
* 1 specialized task (coding, reviewing, testing)
* No dependencies on other agents
* Straightforward execution

**Use Coordinator:**
* Multiple agents needed (2+)
* Sequential dependencies (Loop 3 → Loop 2 → Product Owner)
* Iteration/consensus required
* CFN Loop workflows

## 3) Coordination Patterns

**Redis Coordination Patterns**
Refer to `.claude/skills/redis-coordination/SKILL.md` for:
- Simple Chain Coordination
- Hierarchical Broadcast
- Mesh Hybrid Patterns
- **Waiting Mode + Wake-Up** (✅ Operational)

### Redis Waiting Mode (Zero-Token Agent Coordination)

**Use Case:** CFN Loop iterations, long-running tasks, multi-agent consensus

**Agent enters waiting mode:**
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-1"
```

**Coordinator wakes agent:**
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --reason cfn_loop_iteration \
  --iteration 2 \
  --feedback "Add error handling,Improve test coverage"
```

**Agent reports result:**
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.92 \
  --iteration 2
```

**Coordinator collects results:**
```bash
CONSENSUS=$(./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
  --task-id "$TASK_ID" \
  --agent-ids "coder-1,reviewer-1,tester-1,security-1")

if (( $(echo "$CONSENSUS >= 0.90" | bc -l) )); then
  echo "✅ Consensus reached: $CONSENSUS"
fi
```

**Benefits:**
- 🚀 Zero token cost while waiting (BLPOP blocks, no API calls)
- 🔄 Context preserved across iterations
- ⚡ Instant wake-up (<100ms latency)
- 📈 Scalable (10+ agents, indefinite cycles)

**Key Pattern (STRAT-002):**
Use zero-token blocking mechanisms (like Redis BLPOP) to create efficient, low-overhead synchronization between agents without incurring API call costs. Validated by 8/8 passing tests in orchestrator test suite.

### ⚠️ Waiting Mode Without Coordinator (CRITICAL)

**Problem:** Agents entering waiting mode without a coordinator will block indefinitely.

**Why This Happens:**
- `invoke-waiting-mode.sh enter` uses `BLPOP` with timeout=0 (infinite)
- Agent blocks waiting for wake signal that never arrives
- No coordinator = no wake signal = agent stuck forever
- Shell/terminal timeout (typically 2min) may terminate the session

**When This Occurs:**
1. **Manual agent spawning** without orchestrator (testing, debugging)
2. **Epic execution** where Main Chat spawns agents directly
3. **Incomplete orchestration** where coordinator crashes mid-execution

**Solutions:**

**Option 1: Always Use Full Orchestration (RECOMMENDED)**
```bash
# CORRECT: Use orchestrator for all multi-agent workflows
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "coder-1,researcher-1" \
  --loop2-agents "reviewer-1,tester-1" \
  --product-owner "product-owner-1"
```

**Option 2: Manual Coordination (For Testing Only)**
```bash
# 1. Spawn agents (they enter waiting mode)
# 2. Collect confidence scores
CONSENSUS=$(./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
  --task-id "$TASK_ID" --agent-ids "coder-1,researcher-1")

# 3. Check consensus
if (( $(echo "$CONSENSUS >= 0.90" | bc -l) )); then
  echo "✅ Complete - no iteration needed"
  # Agents stay in waiting mode (expected, will timeout)
else
  # 4. Wake agents for iteration 2
  ./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
    --task-id "$TASK_ID" \
    --agent-id "coder-1" \
    --reason "improve_quality" \
    --iteration 2
fi
```

**Option 3: Skip Waiting Mode (Quick Testing)**
```bash
# Agent completion without waiting mode
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85

# Skip step 4 (enter waiting mode) - agent exits immediately
```

**Best Practice (STRAT-006):**
**Always spawn coordinator + agents together.** Never spawn agents in waiting mode without a coordinator unless you explicitly plan to wake them manually or accept timeout behavior.

```bash
# FORBIDDEN PATTERN:
Task("backend-dev", "Task with waiting mode...") # No coordinator!

# REQUIRED PATTERN:
Task("cfn-loop-coordinator", "Execute CFN Loop with orchestrator...")
# Coordinator spawns and manages all agents automatically
```

**Validation:** Agent timeouts during epic execution (Phases 1-3) were expected behavior - agents correctly entered waiting mode but no coordinator was present to wake them. This is acceptable for single-iteration phases where iteration is not needed.

## 4) CFN Loop Overview

**Skill-Driven Loop Management**
- Coordination via `.claude/skills/cfn-loop-validation/SKILL.md`
- **Automatic dependency orchestration** (v2.2.0)
- Adaptive context injection
- Modular loop progression

**Mode Comparison:**

| Mode | Gate | Consensus | Iterations | Validators |
|------|------|-----------|------------|------------|
| MVP | ≥0.70 | ≥0.80 | 5 | 2 |
| Standard | ≥0.75 | ≥0.90 | 10 | 3-4 |
| Enterprise | ≥0.85 | ≥0.95 | 15 | 5 |

### CFN Loop Dependency Enforcement (MANDATORY)

**All CFN loops use single coordinator pattern (v2):**

**1. Main Chat spawns coordinator:**
```javascript
Task("cost-savings-cfn-loop-coordinator", `
  Execute CFN Loop for: Implement authentication system

  Use orchestrator for dependency enforcement.
  Report structured result when complete.
`)
```

**2. Coordinator invokes orchestrator internally:**
```bash
# Coordinator runs this script (NOT Main Chat)
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "unique-task-id" \
  --mode standard \
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --product-owner "product-owner" \
  --max-iterations 10
```

**3. Orchestrator spawns all agents via CLI:**
```bash
# Orchestrator spawns each agent
npx cfn-spawn agent researcher --task-id "$TASK_ID"
npx cfn-spawn agent backend-dev --task-id "$TASK_ID"
# ... etc
```

**4. Coordinator manages iterations and returns result to Main Chat**

**Why Orchestration is Mandatory:**
- ✅ Loop 2 validators BLOCKED until Loop 3 complete (BLPOP)
- ✅ Product Owner BLOCKED until Loop 2 complete (BLPOP)
- ✅ Prevents premature consensus collection
- ✅ Automatic iteration management
- ✅ Zero-token waiting between loops
- ✅ Coordinator controls entire flow from single agent

**Agent Completion Protocol:**
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

**Orchestration Flow (CORRECTED - Self-Validation Pattern):**
1. Loop 3 agents complete work and report confidence
2. **Gate Check:** Loop 3 self-validation scores checked
   - IF gate FAILS → Wake Loop 3 for iteration N+1 (skip Loop 2)
   - IF gate PASSES → Signal Loop 2 to start work
3. Loop 2 validators WAIT for gate pass signal (`redis-cli blpop "swarm:${TASK_ID}:gate-passed" 0`)
4. Loop 2 validators review Loop 3 work and report consensus
5. **Consensus Check:** Loop 2 scores checked
   - IF consensus reached → Task complete
   - IF consensus fails → Wake all agents for iteration N+1

### CFN Loop Slash Commands

**Recommended: Use slash commands for CFN Loop execution**

Main Chat should use these commands instead of manually spawning coordinators:

**Single Task:**
```bash
/cfn-loop "Implement JWT authentication" --mode=standard
/cfn-loop-single "Fix security bug in auth module"
```

**Multi-Phase Epic:**
```bash
/cfn-loop-epic "Build complete authentication system"
```

**What These Commands Do:**
- Automatically spawn `cost-savings-cfn-loop-coordinator`
- Pass structured parameters (success criteria, agent configuration)
- Include custom routing cost reminders
- Enable web portal visibility
- Handle all orchestration internally

**Benefits:**
- ✅ Consistent parameter structure
- ✅ Built-in cost optimization reminders
- ✅ Success criteria templates
- ✅ Reduced coordination errors
- ✅ Better visibility into process

**See:** `.claude/commands/CFN_COORDINATOR_PARAMETERS.md` for detailed parameter specifications

## 5) Skill Management

### Skill Development Guidelines
- Maximum modularity
- Clear, explicit interfaces
- Minimal external dependencies
- Comprehensive test coverage

**Testing Best Practice (STRAT-005):**
Implement comprehensive test suites that validate both functional requirements and edge cases, including timeout scenarios and blocking mechanism effectiveness. Example: `.claude/skills/redis-coordination/test-orchestrator.sh` validates BLPOP blocking, agent completion protocol, and consensus collection with 8 targeted tests.


## 6) Additional Resources

**Skill References:**
- Redis Coordination: `.claude/skills/redis-coordination/SKILL.md`
- Agent Spawning: `.claude/skills/agent-spawning/SKILL.md`
- CFN Loop Validation: `.claude/skills/cfn-loop-validation/SKILL.md`

**Maintenance Plans:**
- Rollback Strategy: `planning/skills/ROLLBACK_PLAN.md`
- Maintenance Schedule: `planning/skills/MAINTENANCE_SCHEDULE.md`

**Migration Analytics:**
See `.artifacts/analytics/context-reduction-report.json`
## Adaptive Context Extensions: CLI Agent Spawning Insights (v2.5.2)

### Strategy Patterns

#### PATTERN-001: Environment Configuration
- **Context**: CLI Entrypoints
- **Insight**: Always explicitly load environment configurations using 'import dotenv/config' to ensure provider-specific settings are correctly read and applied across different execution contexts.
- **Tags**: environment, configuration, cli, dotenv
- **Confidence**: 0.95
- **Priority**: 9/10

### Domain Insights

#### PATTERN-002: Multi-Provider API Integration
- **Context**: API Provider Configuration
- **Insight**: Create explicit provider-specific mappings that account for endpoint differences, model naming conventions, and protocol variations to ensure robust cross-provider compatibility.
- **Tags**: api-integration, provider-mapping, resilience, configuration
- **Confidence**: 0.92
- **Priority**: 8/10

### Edge Case Handling

#### PATTERN-004: Resilient API Call Mechanisms
- **Context**: Error Handling and Timeout Management
- **Insight**: Configure explicit timeouts and retry mechanisms for API calls to prevent indefinite hanging and provide built-in resilience, with provider-specific timeout and retry configurations.
- **Tags**: error-handling, timeout, resilience, api-calls
- **Confidence**: 0.90
- **Priority**: 9/10
