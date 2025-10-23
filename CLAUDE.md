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
* **Concise answers only** - no code examples unless requested
* **Redis persistence enables swarm recovery** - swarm state survives interruptions
* **ALL agent communication MUST use Redis pub/sub** - no direct file coordination
* **NEVER HARDCODE API KEYS**
* **sleep on repeat** when monitoring a background process. sleep x  minutes, check progress, sleep, repeat

**Agent Output Standards:**
* **Bug documentation**: `docs/BUG_#_*.md` (investigation, fix summary, validation)
* **Test scripts**: `tests/test-*.sh` (persistent, version controlled)
* **Feature documentation**: `docs/FEATURE_NAME.md` (architecture, process docs)
* **Temporary files ONLY**: `/tmp/` (ephemeral test fixtures, scratch data)
* **Full guidelines**: `docs/AGENT_OUTPUT_STANDARDS.md`

**Consensus thresholds:**
* Gate (agent self-confidence): **≥0.75 each**
* Validators consensus: **≥0.90**

### CTO Delegation Persona
* **Act as a busy CTO** who delegates all non-trivial work to specialized agents or a cfn-coordinator
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
- **Product Owner Decision** (`.claude/skills/product-owner-decision/SKILL.md`) - Strategic CFN loop decision execution
- **Agent Output Processing** (`.claude/skills/agent-output-processing/SKILL.md`) - Universal structured output extraction

**Coordination Principles:**
* ALL agent communication via explicit Redis pub/sub dependencies
* Modular, independently maintainable skills
* Minimal, focused coordination logic
* **Multi-layer enforcement**: When designing distributed systems, implement coordination primitives at multiple layers (technical, skill, cross-reference, agent, system, entry) to ensure consistent behavior across all workflows
* **Centralized orchestration**: Keep orchestration logic in dedicated coordination skills (e.g., Redis Coordination) rather than distributing it across multiple components

### Main Chat Role (Thin Orchestration Layer)
* Spawn ONLY coordinator agent (single Task() call)
* Coordinator handles all agent spawning internally via CLI using the orchestration skill
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

## CFN v3 Dual-Mode Architecture

**Two spawning modes:**
1. **CLI Mode** (default): Cost-optimized, Redis context, Z.ai routing
2. **Task Mode**: Simplified, direct injection, Anthropic routing

**Mode Selection:**
```bash
# Default: CLI mode (95-98% savings)
/cfn-loop "Task description"

# Explicit Task mode (full visibility)
/cfn-loop "Task description" --spawn-mode=task
```

**Key Differences:**
- CLI mode: Main Chat → Coordinator → orchestrate-cfn-loop-v3.sh → CLI agents
- Task mode: Main Chat → Coordinator → JSON → Main Chat spawns Task() agents
- CLI agents use Z.ai routing automatically
- Redis context enables swarm recovery (CLI mode)

**Context Storage:**
- Both modes store context in Redis
- CLI agents read from Redis: `redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"`
- Task mode: Main Chat injects directly but also stores in Redis

**Reference:** See `planning/cfn-v3/DUAL_MODE_IMPLEMENTATION.md`

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

Main Chat spawns ONLY the coordinator agent. The coordinator handles all agent spawning internally via CLI and  orchestrate-cfn-loop.sh

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
- Coordinator controls spawn timing via orchestrate-cfn-loop.sh and CLI (no timeout issues)
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
  --max-iterations 10 \
  --phase-id "phase-2" \
  --epic-context '{"epicGoal":"Build feature X","inScope":["A","B"]}' \
  --phase-context '{"currentPhase":"Phase 2","deliverables":["Component 1","Component 2"]}' \
  --success-criteria '{"acceptanceCriteria":["Tests pass","Coverage >80%"],"gateThreshold":0.75}'

# SPRINT 6 UPDATE: Phase-specific timeouts (automatic based on --phase-id)
# - phase-1: 15 minutes (backend work)
# - phase-2: 60 minutes (React components)
# - phase-3: 60 minutes (advanced components)
# - phase-4: 30 minutes (testing)
# - default: 60 minutes (unknown phases)
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
5. **Product Owner Decision (BUG #11 FIX):** Orchestrator spawns Product Owner and parses output
   - Uses `.claude/skills/product-owner-decision/execute-decision.sh`
   - Extracts PROCEED/ITERATE/ABORT from agent output
   - Validates deliverables (prevents "consensus on vapor")
   - Orchestrator pushes decision to Redis (not agent)
6. **Decision Execution:**
   - IF PROCEED → Task complete
   - IF ITERATE → Wake all agents for iteration N+1
   - IF ABORT → Exit with error

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
## Sprint 7 Adaptive Context Lessons

### STRAT-007: Background Execution Strategy
- **Confidence:** 0.95
- **Priority:** 9
- **Insight**: Use background execution with Redis monitoring for long-running orchestration workflows (>10 minutes). Bash tool has hard 10-minute timeout that cannot be extended.
- **Tags**: orchestration, bash-timeout, redis-monitoring, background-execution

### ANTI-004: Regex Validation Anti-Pattern
- **Confidence:** 0.92
- **Priority:** 8
- **Insight**: Avoid simplistic regex matching for agent validation. Pattern `[[ $AGENTS =~ $AGENTS ]]` always returns true (self-matching).
- **Tags**: regex, validation, bug-prevention, orchestration

### PATTERN-008: Product Owner Decision Flow
- **Confidence:** 0.90
- **Priority:** 8
- **Insight**: Implement explicit Product Owner decision flow after Loop 2 consensus to prevent validator scope creep and enforce strategic boundaries.
- **Tags**: cfn-loop, product-owner, scope-management, decision-flow

## Sprint 8 Adaptive Context Lessons (Phase 1 & 2 - Skill-Based Output Processing)

### PATTERN-009: Multi-Pattern Confidence Parsing
- **Confidence:** 0.95
- **Priority:** 9
- **Insight**: Implement multi-pattern confidence parsing with fallback strategies. Design interfaces that gracefully handle multiple input formats, with explicit confidence scoring for each parsing attempt. Patterns: explicit numeric (0.85), percentage (85%), qualitative (high/medium/low), calculated defaults.
- **Tags**: parsing, confidence, strategy, error-handling, skill-based-processing
- **Applied in**: Loop 3 output processing, Loop 2 feedback extraction
- **Impact**: 100% confidence extraction success rate, eliminates 0.0 defaults

### STRAT-014: Skill Interface Consistency
- **Confidence:** 0.90
- **Priority:** 8
- **Insight**: Design skill interfaces with consistent parameter structures across skills. Use named parameters (--agent-type, --task-id, --agent-id, --context, --iteration, --timeout) with explicit type definitions, default values, and clear error messaging to improve skill reusability and reduce integration complexity. Enabled 95% code reuse between Loop 3 and Loop 2 implementations.
- **Tags**: interface, skill-design, consistency, reusability, pattern-reuse
- **Applied in**: loop3-output-processing, loop2-output-processing skills
- **Impact**: Phase 2 took 1.2h vs 3h from scratch (36% time savings)

### PATTERN-010: Parallel Execution with Temp Files
- **Confidence:** 0.93
- **Priority:** 9
- **Insight**: Use background processes with temporary files to eliminate race conditions in parallel agent coordination. Pattern: spawn all agents in background with `(skill-execution > /tmp/output-file) &`, collect PIDs, use `wait` to synchronize, read results from temp files after completion. Eliminates polling wait and guarantees synchronous output capture.
- **Tags**: parallel-execution, race-conditions, temp-files, background-processes, coordination
- **Applied in**: orchestrate-cfn-loop.sh (lines 751-884, 1026-1244)
- **Impact**: 3x speedup for 3 agents, zero race conditions

## Adaptive Context Extensions: CLI Agent Spawning Insights (v2.5.2)

### Strategy Patterns

#### PATTERN-001: Environment Configuration
- **Context**: CLI Entrypoints
- **Insight**: Always explicitly load environment configurations using 'import dotenv/config' to ensure provider-specific settings are correctly read and applied across different execution contexts.
- **Tags**: environment, configuration, cli, dotenv
- **Confidence**: 0.95
- **Priority**: 9/10


## Adaptive Context Extensions: CFN Loop Context Injection Insights (BUG #20)

### Strategy Patterns

#### STRAT-020: Mandatory Deliverable Verification
- **Context**: CFN Loop Consensus Validation
- **Insight**: Implement mandatory deliverable verification with forced iteration when no files created. After Loop 2 consensus, check git status for file changes. If task requires implementation (keywords: create/build/implement) but git shows zero changes, override consensus and force ITERATE with explicit deliverable requirements in feedback. Prevents 'consensus on vapor' where validators approve plans without actual code.
- **Tags**: deliverable-verification, consensus-validation, git-diff, cfn-loop, quality-gate
- **Confidence**: 0.95
- **Priority**: 10/10
- **Validation**: Core implementation in `.claude/skills/cfn-loop-validation/validate-deliverables.sh`
- **Retry Pattern**: Limited to 3 iterations, escalate to Product Owner if still no deliverables

#### STRAT-021: Standardized Context Extraction Templates
- **Context**: Coordinator Design
- **Insight**: Use standardized context extraction templates in coordinators. Template structure: epicGoal (1-2 sentences), inScope (list), outOfScope (list), deliverables (file paths), directory (creation path), acceptanceCriteria (measurable requirements). Extract using bash text processing (grep, sed, jq) with reasonable defaults for missing fields. Prevents minimal context ('Checkpoint' + '4.1') that causes wrong deliverables.
- **Tags**: context-extraction, coordinator, templates, standardization, parsing
- **Confidence**: 0.93
- **Priority**: 9/10

### Implementation Patterns

#### PATTERN-020: Multi-Layer Context Injection
- **Context**: Coordinator → Orchestrator → Agent Flow
- **Insight**: When implementing multi-layer coordination (coordinator → orchestrator → agents), ensure context flows through ALL layers. Pattern: Coordinator extracts context from task description, orchestrator retrieves context from Redis and injects into agent spawn parameters, agents receive complete deliverables/acceptance criteria in --context parameter. Breaking this chain causes 'consensus on vapor' (high confidence, zero deliverables).
- **Tags**: context-injection, cfn-loop, coordination, multi-layer, deliverables
- **Confidence**: 0.92
- **Priority**: 9/10

#### PATTERN-021: Context Validation Pipeline
- **Context**: Multi-Layer Coordination
- **Insight**: Design context validation pipeline with checkpoints at each layer. Pattern: (1) Coordinator validates extracted context has deliverables/acceptance criteria before spawning orchestrator, (2) Orchestrator validates Redis context retrieval succeeded before spawning agents, (3) Agents validate received context contains required fields before starting work. Each layer logs validation results. Fail-fast prevents cascading context loss.
- **Tags**: validation, context-injection, fail-fast, multi-layer, checkpoints
- **Confidence**: 0.87
- **Priority**: 8/10

#### PATTERN-022: Agent Lifecycle - Exit vs Waiting Mode
- **Context**: CFN Loop Agent Management
- **Insight**: When agents enter waiting mode after reporting confidence, they block orchestrator's wait $PID indefinitely. Solution: Remove waiting mode from CFN protocol Step 3, let agents exit cleanly. Enables adaptive agent specialization - orchestrator can spawn different specialist (security-specialist for security issues, not original coder) for next iteration based on feedback type. Pattern validated by BUG #18 fix.
- **Tags**: waiting-mode, agent-lifecycle, adaptive-specialization, orchestrator-blocking
- **Confidence**: 0.89
- **Priority**: 8/10

### Anti-Patterns

#### ANTI-020: Context Storage Without Injection
- **Context**: Redis Coordination
- **Insight**: Avoid storing context in Redis without retrieving and injecting it into agent prompts. Anti-pattern: Orchestrator stores epic-context, phase-context, success-criteria in Redis but spawns agents with generic context ('Loop 3 implementation for iteration N'). Result: Agents have no access to deliverables list, acceptance criteria, or directory paths despite context being 'available'.
- **Tags**: context-injection, redis, agent-spawning, storage-without-use
- **Confidence**: 0.88
- **Priority**: 8/10

#### ANTI-021: Generic Context When Specifics Exist
- **Context**: Agent Spawning
- **Insight**: Never pass generic iteration-level context when task-specific deliverables exist. Anti-pattern: Agent receives 'Loop 3 implementation for iteration 2' when Redis contains detailed deliverables list. Agents have no telepathy - they cannot infer '.claude/skills/checkpoint-state/SKILL.md' from 'iteration 2'. Always inject complete deliverables, directory paths, and acceptance criteria even if 'already in Redis'.
- **Tags**: agent-context, specificity, deliverables, telepathy-fallacy, explicitness
- **Confidence**: 0.91
- **Priority**: 9/10

### Edge Cases & Testing

#### EDGE-020: Comparative Agent Spawn Testing
- **Context**: Context Debugging
- **Insight**: When debugging context issues, use comparative agent spawn testing. Edge case discovered: Agents succeed when spawned manually with explicit context ('Create /tmp/test.sh') but fail in CFN Loop with generic context ('Loop 3 implementation'). This reveals context injection failure rather than tool/API issues. Test pattern: Manual spawn with explicit deliverables → verify file created → confirms agent capability → proves orchestrator context gap.
- **Tags**: debugging, context-testing, manual-spawn, comparative-testing, isolation
- **Confidence**: 0.90
- **Priority**: 7/10

## Sprint Execution in Claude Flow Novice

### Sprint Context Injection

#### Purpose
Decompose large epics into focused, manageable sprints with clear deliverables and scope boundaries.

#### Key Principles
1. **Focused Scope**: Each sprint targets a specific subset of epic requirements
2. **Incremental Progress**: Sprints build upon each other
3. **Precise Deliverables**: Create only sprint-specific files
4. **Context Specificity**: Agents receive sprint-level, not epic-level context

#### Sprint Context Structure

```json
{
  "sprint_name": "P1 Coordinator Monitoring",
  "sprint_num": 1,
  "total_sprints": 7,
  "deliverables": [
    "test-p1-monitoring.sh",
    "docs/P1_MONITORING_RESULTS.md"
  ],
  "in_scope": [
    "P1 coordinator monitoring validation",
    "Test timeout mechanisms",
    "Logging verification"
  ],
  "out_of_scope": [
    "P2-P7 monitoring",
    "Cross-priority integration",
    "Epic-level summary"
  ],
  "directory": "/mnt/c/Users/masha/Documents/claude-flow-novice/tests/p1"
}
```

#### Sprint Execution Tool: `execute-sprint-task.sh`

Enables sprint-aware agent execution with focused context injection.

**Usage:**
```bash
./.claude/skills/sprint-execution/execute-sprint-task.sh \
  [AGENT_TYPE] \
  [TASK_ID] \
  [AGENT_ID] \
  [SPRINT_ID]
```

### Sprint vs Epic Implementation

**Epic Context (Broad)**:
```
Validate P1-P7 monitoring across entire system
Deliverables:
- Comprehensive test suite
- System-wide monitoring report
```

**Sprint Context (Focused)**:
```
Sprint: 1.1 - P1 Coordinator Monitoring
Deliverables:
- test-p1-monitoring.sh
- docs/P1_MONITORING_RESULTS.md

Scope:
- P1 coordinator timeout verification
- Basic logging checks

Out of Scope:
- P2-P7 monitoring
- Cross-priority tests
```

### Confidence Reporting

- Report confidence based on **sprint deliverable completion**
- 0.90+ confidence means sprint objectives met
- Do NOT report confidence for entire epic
- when monitoring something, sleep for X minutes on repeat with check in between
### STRAT-025: Explicit Deliverable Tracking

## Sprint 9 Adaptive Context Lessons (CFN v3 Dual-Mode Implementation)

### STRAT-026: Redis Context Storage Over CLI Parameters
- **Confidence:** 0.95
- **Priority:** 9
- **Insight**: Use Redis for complex JSON context storage instead of CLI parameters. Eliminates shell escaping issues, enables swarm recovery, and provides single source of truth for agent coordination.
- **Tags**: redis, context-storage, cli-spawning, swarm-recovery

### PATTERN-023: Dual-Mode Architecture Pattern
- **Confidence:** 0.92
- **Priority:** 9
- **Insight**: Implement dual execution modes (optimized vs simplified) sharing core logic. CLI mode for production (cost-optimized), Task mode for debugging (full visibility), both using same coordinator and context structure.
- **Tags**: architecture, dual-mode, debugging, production

### STRAT-027: Consensus Validation for Architecture
- **Confidence:** 0.90
- **Priority:** 8
- **Insight**: Use specialized consensus teams (reviewer + tester) to validate implementations before deployment. Achieved 0.92-0.95 confidence scores, caught design issues early.
- **Tags**: validation, consensus, testing, quality-assurance

### ANTI-022: Premature Optimization (Context Pruning)
- **Confidence:** 0.88
- **Priority:** 7
- **Insight**: Avoid implementing optimization features (like context pruning) before validating necessity. CFN v3 removed pruning after determining context small enough without it, saving implementation complexity.
- **Tags**: optimization, yagni, context-management, simplification

### PATTERN-024: Swarm Recovery via Persistence
- **Confidence:** 0.93
- **Priority:** 9
- **Insight**: Store swarm state in Redis with TTL to enable crash recovery. Agents can resume from last known state using task_id as recovery key. Critical for long-running CFN Loops.
- **Tags**: recovery, redis, persistence, fault-tolerance, swarm-coordination

### STRAT-028: Modular Skill Architecture
- **Confidence:** 0.91
- **Priority:** 8
- **Insight**: Decompose complex systems into independent skills (20 skills in CFN v3: task-classifier, playbook, validation-templates, etc.). Enables reuse, testing isolation, and incremental enhancement.
- **Tags**: modularity, skills, architecture, reusability