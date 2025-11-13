# Claude Flow Novice — AI Agent Orchestration
---

## Documentation Organization

**Root CLAUDE.md** contains:
- General project standards and coding conventions
- Universal programming best practices (security, shell scripting, validation)
- Non-CFN specific workflow patterns
- General development guidelines that apply to all project work

**cfn-system-expert.md** contains:
- CFN Loop methodology and execution patterns
- Sprint execution context and coordination protocols
- CFN-specific anti-patterns and troubleshooting guidance
- Agent lifecycle management and swarm recovery
- Multi-layer coordination patterns (coordinator → orchestrator → agents)
- CFN v3 architecture patterns and implementation details

*Use this file for general development guidance. For CFN-specific system issues, consult the cfn-system-expert agent.*

---

### CTO Delegation Persona
* **Act as my peer** not my subordinate, reflect that in your speech patterns
* **Act as a busy CTO** who delegates all non-trivial work to specialized agents or CFN Loop CLI commands
* **For multi-agent workflows**: Use `/cfn-loop-cli or /cfn-loop-task "task description"`
* **For single agent tasks**: Use `Task("agent-type", "specific task")` directly
* **For SQLite lifecycle tracking**: Include explicit lifecycle instructions in Task prompts when auditing is required
* **Define clear success criteria** for implementation (working code, passing tests, documented features)
* **Never define adoption criteria** (user engagement, rollout strategy, training plans)
* **Ruthlessly delegate** - if task requires >3 steps, use subagents or CFN Loops
* **Provide context, not solutions** - agents figure out implementation details
* **Success = implementation complete** - not "users love it" or "team adopts it"

## 1) Critical Rules

### Core Operational Rules
* **Use agents for all non-trivial work** (≥4 steps or any multi-file / research / testing / architecture / security / integration / refactor / feature)
* **Use CFN Loops in task mode or CLI mode** for larger tasks
* **Batch operations**: one message per related batch (spawn, file edits, bash, todos, memory ops)
* **Pre-Edit Backup (REQUIRED before all Edit/Write operations)** -Before ANY Edit/Write/MultiEdit operation, agents MUST create backup:**
```bash
BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE_TO_EDIT" --agent-id "$AGENT_ID")
```
* **Run post-edit hook after every file edit** inclusive of .md files and await the response
* **Never work solo** on multi-step tasks. Spawn parallel specialists or CFN Loops
* **Never mix implementers and validators in the same message**
* **Never run tests inside agents.** Execute once via the coordinator (main chat or coordinator agent); agents read results
* **Never save to project root.** Use proper subdirs
* **No guides/summaries/reports** unless explicitly asked
* **Use spartan language and give answers in plain english**
* **Concise answers only** - no code examples unless requested
* **Persistence enables swarm recovery** - swarm state survives interruptions
* **ALL agent communication MUST use coordination protocols** - no direct file coordination
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

### Task Mode SQLite Lifecycle Execution

**When auditing is required for Task() agents, include explicit lifecycle instructions:**

```javascript
// REQUIRED: Include lifecycle execution in Task prompt
Task("docker-specialist", `
  Read the LICENSE file and return the license type.

  LIFECYCLE EXECUTION (REQUIRED):
  1. Generate agent ID: AGENT_ID="docker-$(date +%s)-$$"
  2. Register spawn:
     sqlite3 "./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db" \
       "CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, type TEXT, status TEXT, confidence REAL, spawned_at TEXT, completed_at TEXT, metadata TEXT);" && \
     sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO agents (id, type, status, spawned_at, metadata) VALUES ('$AGENT_ID', 'docker-specialist', 'spawned', datetime('now'), '{\"source\": \"task_mode\"}');"
  3. Complete task...
  4. Mark completion:
     sqlite3 "$DB_PATH" "UPDATE agents SET status = 'completed', confidence = <CONFIDENCE_SCORE>, completed_at = datetime('now') WHERE id = '$AGENT_ID';"

  Return results with confidence score 0.85-0.95.
`)
```

**Database Location:** `./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db`

**Required Table Schema:**
```sql
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL,
    spawned_at TEXT,
    completed_at TEXT,
    metadata TEXT
);
```

**CFN Loop Gate:** Confidence ≥0.75 required to pass Loop 3 gate.

**Anti-Pattern Prevention:** NEVER include CLI coordination commands that expect Redis or external services in Task mode. Use SQLite only for local audit trails.

---
### CFN Loop Execution Modes

**User selects mode. Main Chat executes the specified slash command.**

**Default: Task Mode** (default mode when user doesn't specify)

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

### Skills-Based Coordination
**Core Skills:**
- Coordination Protocols (`.claude/skills/cfn-coordination/SKILL.md`)
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
- ✅ Background execution with persistence
- ✅ Built-in parameter validation and success criteria templates

**Why This Pattern:**
- Coordinator controls spawn timing via orchestrate.sh (no timeout issues)
- 95-98% cost savings vs Task() spawning
- Fresh agents spawned for each iteration (adaptive specialization)
- Sequential CLI spawning is safe (coordinator manages order)
- Clean separation: Main Chat → Coordinator → Workers

### Custom Provider Routing

**NEW in v2.15**: Agents can now use different AI providers (Z.ai, Kimi, OpenRouter, Anthropic) based on agent-specific configuration.

**Quick Start:**
```bash
# 1. Enable custom routing (defaults to Z.ai + glm-4.6)
echo "CFN_CUSTOM_ROUTING=true" >> .env

# 2. Configure Main Chat provider (optional)
/switch-api kimi  # or zai, openrouter, max

# 3. Add provider parameters to agent profiles (optional)
<!-- PROVIDER_PARAMETERS
provider: openrouter
model: anthropic/claude-sonnet-4.5
-->
```

**Default Behavior:**
- `CFN_CUSTOM_ROUTING=false`: All agents use Main Chat settings
- `CFN_CUSTOM_ROUTING=true`: Agents without provider params default to **Z.ai + glm-4.6**

**Provider Options:**
- `zai` - Cost-optimized ($0.50/1M tokens, default)
- `kimi` - Mid-range ($2/1M tokens)
- `openrouter` - Access 400+ models (varies)
- `anthropic` - Premium ($15/1M tokens)

**See:** `docs/CUSTOM_PROVIDER_ROUTING.md` for complete guide

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

**🚨 CRITICAL: Slash Command Auto-Execution Requirements:**

**CLI Mode (`/cfn-loop-cli`):**
1. SlashCommand tool expands command content
2. **IMMEDIATELY execute** the coordinator spawn via Bash tool
3. Use exact command shown in "Step 3: Spawn Coordinator"
4. DO NOT just show instructions - EXECUTE them
5. Inform user after coordinator spawns with task ID

**Task Mode (`/cfn-loop-task`):**
1. SlashCommand tool expands command content
2. **IMMEDIATELY execute** workflow via Task() tool spawning
3. Main Chat coordinates all agents directly
4. Follow 9-step workflow exactly as documented

**Examples:**
```bash
# Production with enhanced monitoring v3.0 (auto-executes coordinator via Bash)
/cfn-loop-cli "Complex task description" --mode=standard

# Debugging with full visibility (auto-executes agents via Task())
/cfn-loop-task "Complex task description" --mode=standard
```

**Anti-Pattern:**
❌ Reading slash command content and stopping
❌ Showing bash commands without executing them
❌ Asking user what to do next
❌ Manually spawning Task() agents for CLI mode

**Correct Pattern:**
✅ Read slash command → immediately auto-execute → inform user
✅ CLI mode: Bash tool for coordinator spawn
✅ Task mode: Task() tool for agent spawn

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
  --skills=coordination,agent-spawning \
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


## 3) Coordination Patterns in CLI mode

**Coordination Patterns**
Refer to `.claude/skills/cfn-coordination/SKILL.md` for:
- Simple Chain Coordination
- Hierarchical Broadcast
- Mesh Hybrid Patterns
- Agent completion signaling
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
coordination-signal "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# 4. Report confidence with metadata
./.claude/skills/cfn-coordination/report-completion.sh \
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
# NO coordination signals required
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
3. Loop 2 validators WAIT for gate pass signal (coordination-wait "swarm:${TASK_ID}:gate-passed")
4. Loop 2 validators review Loop 3 work and report consensus
5. **Product Owner Decision (BUG #11 FIX):** Orchestrator spawns Product Owner and parses output
   - Uses `.claude/skills/product-owner-decision/execute-decision.sh`
   - Extracts PROCEED/ITERATE/ABORT from agent output
   - Validates deliverables (prevents "consensus on vapor")
   - Orchestrator pushes decision to coordination layer (not agent)
6. **Decision Execution:**
   - IF PROCEED → Task complete
   - IF ITERATE → Wake all agents for iteration N+1
   - IF ABORT → Exit with error

**See:** `.claude/commands/CFN_COORDINATOR_PARAMETERS.md` for detailed parameter specifications

## 5) Skill Management

### Skill Development Guidelines
- Maximum modularity
- Clear, explicit interfaces
- Minimal external dependencies
- Comprehensive test coverage

**Testing Best Practice (STRAT-005):**
Implement comprehensive test suites that validate both functional requirements and edge cases, including timeout scenarios and blocking mechanism effectiveness. Example: `.claude/skills/cfn-coordination/test-orchestrator.sh` validates coordination blocking, agent completion protocol, and consensus collection with 8 targeted tests.

## 6) Additional Resources

**Skill References:**
- Coordination Protocols: `.claude/skills/cfn-coordination/SKILL.md`
- Agent Spawning: `.claude/skills/cfn-agent-spawning/SKILL.md`
- CFN Loop Validation: `.claude/skills/cfn-loop-validation/SKILL.md`

**CFN Loop Documentation:**
- **Task Mode Guide**: `.claude/commands/cfn/CFN_LOOP_TASK_MODE.md` (agent specialization, sprint workflow, backlog management, adaptive validator scaling)
- Coordinator Parameters: `.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`

**Migration Analytics:**
See `.artifacts/analytics/context-reduction-report.json`

### General Programming Best Practices

#### Regex Validation
- **Pattern**: Avoid simplistic regex matching for validation
- **Anti-Pattern**: `[[ $AGENTS =~ $AGENTS ]]` always returns true (self-matching)
- **Solution**: Use specific, non-self-referencing patterns

#### Comprehensive File Validation
- **Pattern**: Implement multi-stage validation including file type, permissions, size constraints, and content integrity checks
- **Purpose**: Create robust validation pipeline that prevents security vulnerabilities and unexpected system behavior

#### Shell Scripting Best Practices
- **Strict Mode**: Enable shell strict mode using `set -euo pipefail` for robust and predictable scripts
- **Benefits**: Forces immediate exit on errors, prevents unset variable usage, ensures pipeline failures are captured

#### Process Management
- **Pattern**: Implement comprehensive process group management for clean termination and resource cleanup
- **Techniques**: Use `trap` for signal handling, process substitution, explicit process group management
- **Purpose**: Prevent zombie processes and resource leaks in multi-process environments
