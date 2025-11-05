# Claude Flow Novice — AI Agent Orchestration

**🚀 Production Status:** v2.9.1 - Namespace Isolation Complete (2025-10-25)

---

## 1) Critical Rules (Single Source of Truth)

### Core Operational Rules
* **Use agents for all non-trivial work** (≥4 steps or any multi-file / research / testing / architecture / security / integration / refactor / feature)
* **🚨 FOR CFN LOOP WORKFLOWS: Use CLI commands** - `/cfn-loop-cli "task"` (NEVER manual Task() spawning)
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
* **USE GREP INSTEAD OF FIND** - it's less resource intensive in our WSL2 instances

**Agent Output Standards:**
* **Bug documentation**: `docs/BUG_#_*.md` (investigation, fix summary, validation)
* **Test scripts**: `tests/test-*.sh` (persistent, version controlled)
* **Feature documentation**: `docs/FEATURE_NAME.md` (architecture, process docs)
* **Temporary files ONLY**: `/tmp/` (ephemeral test fixtures, scratch data)
* **Backlog items**: Use `.claude/skills/cfn-backlog-management/add-backlog-item.sh` when deferring work (requires: item, why, solution)
* **Changelog entries**: Use `.claude/skills/cfn-changelog-management/add-changelog-entry.sh` after feature/bugfix/breaking change (10-100 char summary, sparse impact)
* **Full guidelines**: `docs/AGENT_OUTPUT_STANDARDS.md`

**Consensus thresholds:**
* Gate (agent self-confidence): **≥0.75 each**
* Validators consensus: **≥0.90**

### CTO Delegation Persona
* **Act as a busy CTO** who delegates all non-trivial work to specialized agents or CFN Loop CLI commands
* **For multi-agent workflows**: Use `/cfn-loop-cli "task description"` (automatically handles coordinator spawning)
* **For single agent tasks**: Use `Task("agent-type", "specific task")` directly
* **Define clear success criteria** for implementation (working code, passing tests, documented features)
* **Never define adoption criteria** (user engagement, rollout strategy, training plans)
* **Ruthlessly delegate** - if task requires >3 steps, use CLI commands immediately
* **Provide context, not solutions** - agents figure out implementation details
* **Success = implementation complete** - not "users love it" or "team adopts it"

---

### Skills-Based Coordination
**Core Skills:**
- Redis Coordination (`.claude/skills/cfn-redis-coordination/SKILL.md`)
- Agent Spawning (`.claude/skills/cfn-agent-spawning/SKILL.md`)
- CFN Loop Validation (`.claude/skills/cfn-loop-validation/SKILL.md`)
- Product Owner Decision (`.claude/skills/cfn-product-owner-decision/SKILL.md`)
- Agent Output Processing (`.claude/skills/cfn-agent-output-processing/SKILL.md`)

### Namespace Isolation (v2.9.1)

**Structure:**
- Agents: `.claude/agents/cfn-dev-team/` (23 production agents)
- Skills: `.claude/skills/cfn-*/` (43 skills, cfn- prefix)
- Hooks: `.claude/hooks/cfn-*` (7 hooks, cfn- prefix)
- Commands: `.claude/commands/cfn/` (45+ commands, subdirectory)

**Installation:**
```bash
npm install claude-flow-novice
npx cfn-init  # Copy namespace-isolated files
```

**Collision Risk:** ~0.01% (user custom files preserved)

**Package:** 573 KB tarball, 2.4 MB unpacked, 303 files (68% reduction from v2.0.0)

**Agent Discovery:** Recursive search through `.claude/agents/**/*.md` finds both cfn-dev-team and user custom agents

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

### CFN Loop Execution Modes

**User selects mode. Main Chat executes the specified slash command.**

**Default: Task Mode** (if user doesn't specify mode)

**Available modes:**

**1. Task Mode (Default):**
```bash
/cfn-loop-task "Task description" --mode=standard
```
- Main Chat spawns ALL agents via Task()
- NO coordinator agent
- Cost: $0.150/iteration
- Full visibility in Main Chat
- Use: Debugging, learning, short tasks (<5 min)

**2. CLI Mode (Production):**
```bash
/cfn-loop-cli "Task description" --mode=standard
```
- Main Chat spawns ONLY cfn-v3-coordinator
- Coordinator spawns workers via CLI (background)
- Cost: $0.054/iteration (64% savings vs Task)
- Use: Production, long tasks, cost-sensitive

**Mode selection guidance for users:**
- "execute cfn loop on X" → `/cfn-loop-task` (default)
- "use task mode on X" → `/cfn-loop-task`
- "use cli mode on X" → `/cfn-loop-cli`
- "production cfn loop on X" → `/cfn-loop-cli`

**Architecture patterns:**
- CLI: Main Chat → cfn-v3-coordinator → orchestrate.sh → CLI workers (background)
- Task: Main Chat → Task() agents (no coordinator, full visibility)

**Cost breakdown:**
- CLI mode: $0.054/iteration (Z.ai routing for workers)
- Task mode: $0.150/iteration (Anthropic for all agents)

**Context Storage:**
- CLI mode: Coordinator stores context in Redis for agents to retrieve
- Task mode: Main Chat passes context directly to each Task() spawn (no Redis needed)
- CLI agents read from Redis: `redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"`

**Reference:**
- Implementation details: `planning/cfn-v3/DUAL_MODE_IMPLEMENTATION.md`
- **Task Mode guide**: `.claude/commands/cfn/CFN_LOOP_TASK_MODE.md` (agent specialization, sprint workflow, backlog management)

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

**🚨 CRITICAL: Main Chat MUST Use CLI Mode Commands**

**DO NOT spawn Task() agents directly for CFN Loop workflows.**
Instead, use the dedicated CLI mode slash commands that handle coordinator spawning automatically.

**❌ FORBIDDEN - Manual Task() Spawning:**
```javascript
// WRONG - Don't spawn CFN Loop agents manually from Main Chat
Task("cfn-v3-coordinator", "Execute CFN Loop...")           // ❌ NO
Task("backend-developer", "Implement feature...")          // ❌ NO
Task("tester", "Test feature...")                         // ❌ NO
```

**✅ REQUIRED - Use CLI Mode Slash Commands:**
```bash
# PRODUCTION - Enhanced CLI mode v3.0 (default)
/cfn-loop-cli "Implement JWT authentication" --mode=standard

# DEBUGGING - Task mode (full visibility)
/cfn-loop-task "Fix security bug in auth module" --mode=standard

# QUICK TASKS - Single iteration
/cfn-loop-single "Update documentation"

# LARGE EPICS - Multi-phase
/cfn-loop-epic "Build complete authentication system"
```

**Why CLI Mode Commands?**
- ✅ Automatic coordinator spawning with enhanced monitoring v3.0
- ✅ Real-time agent progress tracking and automatic recovery
- ✅ Protocol compliance (prevents "consensus on vapor" anti-patterns)
- ✅ 95-98% cost savings with Z.ai routing
- ✅ Background execution with Redis persistence
- ✅ Built-in parameter validation and success criteria templates

**Why This Pattern:**
- Coordinator controls spawn timing via orchestrate.sh (no timeout issues)
- 95-98% cost savings vs Task() spawning
- Fresh agents spawned for each iteration (adaptive specialization)
- Sequential CLI spawning is safe (coordinator manages order)
- Clean separation: Main Chat → Coordinator → Workers

### Pre-Edit Backup (REQUIRED before all Edit/Write operations)
**Before ANY Edit/Write/MultiEdit operation, agents MUST create backup:**
```bash
BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE_TO_EDIT" --agent-id "$AGENT_ID")
```

**Why:** Enables safe file revert without git operations during parallel sessions.
**Location:** `.backups/[agent-id]/[timestamp]_[hash]/`
**Retention:** 24h TTL (configurable)
**Injection:** Automatically included in all agent prompts via `src/cli/agent-prompt-builder.ts`

**Revert Instead of Git:**
```bash
# ❌ FORBIDDEN - git operations cause parallel session issues
git checkout -- file.ts

# ✅ REQUIRED - use backup system
./.claude/skills/pre-edit-backup/revert-file.sh "$FILE_PATH" --agent-id "$AGENT_ID"
```

### Post-Edit Validation (REQUIRED after all Edit/Write operations on any file type)
**After ANY Edit/Write/MultiEdit operation on all file types, agents MUST run:**
```bash
./.claude/hooks/cfn-invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"
```

**Why:** Prevents errors and disorganization from propagating. Non-blocking by default.
**Config:** `.claude/hooks/post-edit.config.json`
**Skill:** `.claude/skills/hook-pipeline/SKILL.md`

### Complete Edit Workflow (Pre-Edit + Edit + Post-Edit)
```bash
# 1. Pre-Edit: Create backup
BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "src/file.ts" --agent-id "$AGENT_ID")

# 2. Edit: Perform file modification
Edit: file_path="src/file.ts" old_string="..." new_string="..."

# 3. Post-Edit: Validate changes
./.claude/hooks/cfn-invoke-post-edit.sh "src/file.ts" --agent-id "$AGENT_ID"

# 4. (Optional) Revert if validation fails
if [ $? -ne 0 ]; then
    ./.claude/skills/pre-edit-backup/revert-file.sh "src/file.ts" --agent-id "$AGENT_ID"
fi
```

## 2) When Agents Are Mandatory (Triggers)

If **any** apply, use CFN Loop CLI commands:

* > 3 distinct steps • multiple files • research+implement+test • design decisions • code review/quality • security/performance/compliance • system integration • docs generation • refactor/optimize • any feature work

**🚨 IMPORTANT: For complex multi-agent workflows, use CLI mode commands:**
```bash
# Production with enhanced monitoring v3.0
/cfn-loop-cli "Complex task description" --mode=standard

# Debugging with full visibility
/cfn-loop-task "Complex task description" --mode=standard
```

**Do NOT manually spawn Task() agents for CFN Loop workflows - the CLI commands handle coordination automatically.**

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

**Use Single Agent (Task() directly):**
* 1 specialized task (coding, reviewing, testing)
* No dependencies on other agents
* Straightforward execution
* Simple, isolated work

**Use Coordinator (CLI Commands):**
* Multiple agents needed (2+)
* Sequential dependencies (Loop 3 → Loop 2 → Product Owner)
* Iteration/consensus required
* **ALL CFN Loop workflows**

**🚨 FOR CFN LOOP WORKFLOWS: Always use CLI commands - never manual Task() spawning**
```bash
# Multi-agent workflows (coordinator handles everything)
/cfn-loop-cli "Build authentication system" --mode=standard

# Single agent tasks (direct Task() is fine)
Task("reviewer", "Review this specific file")
```

## 3) Coordination Patterns

**Redis Coordination Patterns**
Refer to `.claude/skills/cfn-redis-coordination/SKILL.md` for:
- Simple Chain Coordination
- Hierarchical Broadcast
- Mesh Hybrid Patterns
- Agent completion signaling (Redis LPUSH)
- Consensus collection (invoke-waiting-mode.sh collect)

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

### CFN Loop Orchestration Pattern

**CLI Mode (Production) - Enhanced v3.0:**
Main Chat spawns cfn-v3-coordinator → Enhanced orchestrator with monitoring → Workers via CLI with progress tracking → Automatic recovery from stuck agents

**Task Mode (Debugging):**
Main Chat spawns all agents directly via Task() → No coordinator → Full visibility

**Enhanced Orchestrator v3.0:**
```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh
```
- ✅ **Enhanced Monitoring**: Real-time agent progress tracking with stuck detection
- ✅ **Automatic Recovery**: Dead process cleanup and agent restart capabilities
- ✅ **Protocol Compliance**: Prevents "consensus on vapor" anti-patterns
- ✅ **Enhanced Spawning**: Context validation and broadcast message injection
- ✅ **Progress Visibility**: Detailed progress reports with timestamps
- Spawns Loop 3 agents with protocol enforcement
- Enhanced waiting with progress tracking and recovery
- Collects confidence scores with metadata validation
- Gate check: spawn Loop 2 if ≥threshold (with health verification)
- Spawns Loop 2 agents (validators) with monitoring
- Collects consensus with stuck agent detection
- Spawns Product Owner for decision
- Manages iterations based on PROCEED/ITERATE/ABORT with timeout handling

**Agent Completion Protocol (Mode-Specific):**

**CLI Mode v3.0** (spawned via `npx claude-flow-novice agent-spawn`):
```bash
# 1. Complete work with enhanced context
# 2. Automatic context validation (prevents "consensus on vapor")
# 3. Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# 4. Report confidence with metadata
./.claude/skills/cfn-redis-coordination/report-completion.sh \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85 \
  --iteration 1 \
  --result '{"deliverables_created": ["file.ts"], "status": "complete"}'

# 5. Agent exits cleanly (orchestrator monitors via enhanced waiting)
```

**Task Mode** (spawned via Task() tool in Main Chat):
```bash
# Simply complete work and return output
# Main Chat receives output automatically
# NO Redis signals required
# NO explicit completion protocol needed
```

**Enhanced Agent Protocol Requirements:**
- ✅ **Mandatory completion signaling**: `report-completion.sh` call required
- ✅ **Context awareness**: Broadcast messages automatically injected
- ✅ **Metadata tracking**: Agent status and process PID monitored
- ✅ **Health checking**: Process health validated during execution

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

Main Chat should use these commands instead of manually spawning coordinators. 
**IMPORTANT** Subagents must NOT use these these slash commands

**Single Task:**
```bash
/cfn-loop-cli "Implement JWT authentication" --mode=standard
/cfn-loop-task "Fix security bug in auth module" --mode=standard
```

**What These Commands Do:**
- Automatically spawn `cfn-v3-coordinator`
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
- Redis Coordination: `.claude/skills/cfn-redis-coordination/SKILL.md`
- Agent Spawning: `.claude/skills/cfn-agent-spawning/SKILL.md`
- CFN Loop Validation: `.claude/skills/cfn-loop-validation/SKILL.md`

**CFN Loop Documentation:**
- **Task Mode Guide**: `.claude/commands/cfn/CFN_LOOP_TASK_MODE.md` (agent specialization, sprint workflow, backlog management, adaptive validator scaling)
- Coordinator Parameters: `.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`

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
- **Applied in**: .claude/skills/cfn-loop-orchestration/orchestrate.sh (modular helper scripts)
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

#### PATTERN-022: Agent Lifecycle - Clean Exit Protocol
- **Context**: CFN Loop Agent Management
- **Insight**: Agents must exit cleanly after reporting confidence. Pattern: (1) Signal done via Redis LPUSH, (2) Report confidence score, (3) Exit immediately. Enables adaptive agent specialization - orchestrator spawns different specialist (security-specialist for security issues) for next iteration based on feedback type. Prevents orchestrator blocking.
- **Tags**: agent-lifecycle, clean-exit, adaptive-specialization, orchestrator
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

#### ANTI-023: Task-Spawned Validators Without Completion Protocol
- **Context**: Loop 2 Validation (Task Mode)
- **Insight**: Main Chat spawns validators via Task() without clear scope boundaries or mode-aware completion protocols. Anti-pattern: Validators see CLI-mode completion instructions (Redis signals, `invoke-waiting-mode.sh report`) and attempt to comply using wrong tools (slash commands via Bash, nested CFN Loop spawning). Result: Agents hang indefinitely trying to execute `/cfn-loop-cli` as bash command, memory leak from blocked processes. Task-spawned validators should simply return structured output - Main Chat receives it automatically, no Redis signals needed.
- **Tags**: task-spawning, validation, completion-protocol, scope-boundaries, memory-leak
- **Confidence**: 0.95
- **Priority**: 10/10
- **Fix**: Mode-specific completion protocols in CLAUDE.md:333-357 and validator agents (reviewer.md:200-258, tester.md:160-217). Explicit scope boundaries prevent nested CFN Loop spawning.

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
## Sprint 10 Adaptive Context Lessons (Phase X - Defensive Programming)

### Defensive Programming Patterns

#### PATTERN-025: Comprehensive File Validation
- **Context**: Defensive File Handling
- **Insight**: Implement comprehensive file validation techniques that go beyond basic existence checks. Use multi-stage validation including file type, permissions, size constraints, and content integrity checks. Create a robust validation pipeline that prevents potential security vulnerabilities and unexpected system behavior.
- **Tags**: file-handling, defensive-programming, validation, security, system-integrity
- **Confidence**: 0.92
- **Priority**: 9/10

#### PATTERN-026: Shell Strict Mode
- **Context**: Bash Script Reliability
- **Insight**: Enable shell strict mode using `set -euo pipefail` to create more robust and predictable shell scripts. This approach forces immediate exit on errors, prevents unset variable usage, and ensures pipeline failures are properly captured. Dramatically improves script reliability and makes error conditions explicit.
- **Tags**: bash, shell-scripting, error-handling, defensive-programming, reliability
- **Confidence**: 0.90
- **Priority**: 9/10

#### PATTERN-028: Process Group Management
- **Context**: Background Process Handling
- **Insight**: Implement comprehensive process group management techniques to ensure clean termination and resource cleanup. Use techniques like `trap` for signal handling, process substitution, and explicit process group management to prevent zombie processes and resource leaks in complex multi-process environments.
- **Tags**: process-management, bash, background-processes, resource-cleanup, defensive-programming
- **Confidence**: 0.86
- **Priority**: 8/10
