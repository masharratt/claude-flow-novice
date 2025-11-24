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
* **NEVER HARDCODE API KEYS** (in code OR documentation)
* **ALWAYS REDACT SENSITIVE DATA** in documentation, bug reports, and security audits using `[REDACTED]` placeholder
* **sleep on repeat** when monitoring a background process. sleep x  minutes, check progress, sleep, repeat
* **USE GREP INSTEAD OF FIND** - it's less resource intensive in our WSL2 instances

### Docker Build Requirements (WSL2 Performance)

**CRITICAL: Always use Linux native storage for Docker builds**

* **96% faster builds**: Linux native storage vs Windows mounts (755s → <20s)
* **Use docker-build skill**: `./.claude/skills/docker-build/build.sh`
* **Manual builds**: Use `scripts/docker/build-from-linux.sh` (not direct `docker build`)
* **Required for**: All CFN Docker images (cfn-agent, cfn-orchestrator, cfn-coordinator)

**Quick Reference:**
```bash
# Build any Docker image (correct - 96% faster)
./.claude/skills/docker-build/build.sh --dockerfile docker/Dockerfile.agent --tag cfn-agent:latest

# Build using manual script (also correct)
DOCKERFILE="docker/Dockerfile.agent" IMAGE_NAME="cfn-agent" ./scripts/docker/build-from-linux.sh

# ❌ NEVER DO THIS (755s build time on WSL2)
docker build -f docker/Dockerfile.agent -t cfn-agent:latest .
```

**Why This Matters:**
- Windows mounts in WSL2 have severe I/O performance penalties
- Docker build context transfer: 0.1s (Linux) vs 755s (Windows)
- Linux build script: syncs to `/tmp/cfn-build`, builds there, returns image

**Agent Requirement:**
- docker-specialist MUST use Linux build scripts
- All Dockerfiles MUST document this requirement
- Build failures = check if Linux build was used

**Agent Output Standards:**
* **Bug documentation**: `docs/BUG_#_*.md` (investigation, fix summary, validation)
* **Test scripts**: `tests/test-*.sh` (persistent, version controlled)
* **Feature documentation**: `docs/FEATURE_NAME.md` (architecture, process docs)
* **Temporary files ONLY**: `/tmp/` (ephemeral test fixtures, scratch data)
* **Backlog items**: Use `.claude/skills/cfn-backlog-management/add-backlog-item.sh` when deferring work (requires: item, why, solution)
* **Changelog entries**: Use `.claude/skills/cfn-changelog-management/add-changelog-entry.sh` after feature/bugfix/breaking change (10-100 char summary, sparse impact)
* **Full guidelines**: `docs/AGENT_OUTPUT_STANDARDS.md`

**Test-Driven Gates (v3.0+):**
* Loop 3 gate (test pass rate): **≥0.95** (Standard mode)
* Loop 2 consensus (validator scores): **≥0.90** (Standard mode)

**Mode-Specific Thresholds:**
* MVP: Gate ≥0.70, Consensus ≥0.80
* Standard: Gate ≥0.95, Consensus ≥0.90
* Enterprise: Gate ≥0.98, Consensus ≥0.95

### Multi-Worktree Docker Coordination

**Team Development Patterns:**

When teams use git worktrees for parallel development, Docker isolation prevents port and service name conflicts:

* **Each developer works in separate git worktree** - Independent branches
* **Docker isolation via `COMPOSE_PROJECT_NAME` per branch** - Unique container namespace
* **Port offsets prevent conflicts** - Automatic calculation via `run-in-worktree.sh`
* **Redis coordination scoped to worktree when needed** - Isolated task IDs

**Environment Variable Injection (Coordinators):**

Coordinators MUST inject these variables to spawned agents:

```bash
# Required for multi-worktree support
export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"      # e.g., cfn-feature-auth
export CFN_REDIS_PORT="${CFN_REDIS_PORT}"        # Base port + offset
export CFN_POSTGRES_PORT="${CFN_POSTGRES_PORT}"  # Base port + offset
export WORKTREE_BRANCH="${BRANCH}"               # Git branch name
```

Pass these when spawning agents:
```bash
npx claude-flow-novice agent backend-dev \
  --task-id "$TASK_ID" \
  --env COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  --env CFN_REDIS_PORT="$CFN_REDIS_PORT" \
  --env CFN_POSTGRES_PORT="$CFN_POSTGRES_PORT"
```

**Service Discovery Pattern:**

Within Docker networks, use **service names** (not container names):

```bash
# Correct: Service discovery via Docker DNS
redis-cli -h redis -p 6379              # Service name
psql -h postgres -U postgres            # Service name

# ❌ WRONG: Container names don't resolve in networks
redis-cli -h cfn-redis -p 6379          # Won't work
```

Docker automatically resolves service names to container IPs within the same network:
- `redis` → internal Docker DNS (dynamic IP)
- `postgres` → internal Docker DNS (dynamic IP)
- `orchestrator` → internal Docker DNS (dynamic IP)

Container names are auto-prefixed: `${COMPOSE_PROJECT_NAME}_service_1`

**Team Coordination Checklist:**

* [ ] Each developer runs `./scripts/docker/run-in-worktree.sh up -d` (not `docker-compose up`)
* [ ] Redis keys include task IDs for scope isolation (already scoped by design)
* [ ] Shared volumes avoided - each worktree has isolated volumes
* [ ] Port conflicts handled automatically by offset calculation
* [ ] Service names used in all connections (not container names)
* [ ] `COMPOSE_PROJECT_NAME` environment variable injected to all spawned agents
* [ ] All database connections use `postgres` service name (not container name)

**Port Allocation Strategy:**

```
Main/master branch:
  Offset: 0
  Redis: 6379, Postgres: 5432, Orchestrator: 3001

Feature-auth branch:
  Offset: ~42 (calculated from branch name)
  Redis: 6421, Postgres: 5474, Orchestrator: 3043

Bugfix-validation branch:
  Offset: ~78 (calculated from branch name)
  Redis: 6457, Postgres: 5510, Orchestrator: 3079
```

Offsets are calculated deterministically from branch name, ensuring consistency across restarts.

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

**CFN Loop Gate (v3.0+):** Test pass rate ≥0.95 required to pass Loop 3 gate (Standard mode). For Task Mode audit trails, confidence scores are still tracked in SQLite for lifecycle monitoring.

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

**2. CLI Mode (Production - NEW Simplified Architecture):**
```bash
/cfn-loop-cli "Task description" --mode=standard --provider kimi
```
- Main Chat spawns CLI agents DIRECTLY (no coordinator)
- CLI agents send Redis completion signals to Main Chat
- Cost: $0.050/iteration (67% savings vs Task)
- Use: Production, provider routing, cost-sensitive
- **NEW:** Simplified 2-layer coordination (Main Chat → CLI agents)

**Mode selection guidance for users:**
- "execute cfn loop on X" → `/cfn-loop-task` (default)
- "use task mode on X" → `/cfn-loop-task`
- "use cli mode on X" → `/cfn-loop-cli`
- "production cfn loop on X" → `/cfn-loop-cli`

**Architecture patterns:**
- CLI (NEW): Main Chat → CLI agents (direct) + Redis BLPOP coordination
- CLI (OLD): Main Chat → cfn-v3-coordinator → orchestrate.sh → CLI workers (background)
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


**🚨 CRITICAL: Main Chat CLI Mode - NEW SIMPLIFIED ARCHITECTURE**

**CLI Mode (NEW): Main Chat coordinates CLI agents directly via Redis BLPOP signaling.**
No coordinator required for simplified 2-layer coordination.

**✅ CLI Mode (NEW) - Direct Agent Spawning:**
```bash
# NEW: Direct CLI agent spawning with provider routing
/cfn-loop-cli "Implement feature" --provider kimi
# Results: Main Chat spawns CLI agent directly, waits via Redis BLPOP

# Provider options (fallback to Z.ai glm-4.6 if not specified)
--provider zai          # Cost-optimized ($0.50/1M tokens)
--provider kimi         # Mid-range quality ($2/1M tokens)
--provider openrouter  # Access 400+ models
--provider max         # High quality (Anthropic)

# Mode options for quality control
--mode mvp              # Fast prototyping (70% gates)
--mode standard         # Production features (95% gates)
--mode enterprise       # Security/compliance (98% gates)
```

**❌ DEPRECATED: Manual Task() Spawning:**
```javascript
// OLD - Complex coordinator spawning (deprecated)
Task("cfn-v3-coordinator", "Execute CFN Loop...")           // ❌ OLD
Task("backend-developer", "Implement feature...")          // ❌ OLD
Task("tester", "Test feature...")                         // ❌ OLD
```

**✅ REQUIRED - Use CLI Mode Slash Commands:**
```bash
# PRODUCTION - NEW Simplified CLI mode (Main Chat coordination)
/cfn-loop-cli "Implement JWT authentication" --mode=standard --provider kimi

# DEBUGGING - Task mode (full visibility)
/cfn-loop-task "Fix security bug in auth module" --mode=standard

# COST-OPTIMIZED - Use Z.ai for all CLI agents
/switch-api zai
/cfn-loop-cli "Batch data processing" --provider zai

# QUALITY-FOCUSED - Use Anthropic for critical tasks
/switch-api max
/cfn-loop-cli "Security audit" --provider max --mode enterprise

# MID-RANGE QUALITY - Use Kimi for balanced cost/quality
/cfn-loop-cli "Feature development" --provider kimi --mode standard

# FALLBACK - Automatic Z.ai glm-4.6 when no provider specified
/cfn-loop-cli "Quick prototype" --mode mvp
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

**NEW in v2.15**: Agents can now use different AI providers (Z.ai, Kimi, Gemini, XAi, OpenRouter, Anthropic) based on agent-specific configuration.

**Quick Start:**
```bash
# 1. Enable custom routing (defaults to Z.ai + glm-4.6)
echo "CFN_CUSTOM_ROUTING=true" >> .env

# 2. Configure Main Chat provider (optional)
/switch-api kimi  # or zai, gemini, xai, openrouter, max

# 3. Add provider parameters to agent profiles (optional)
<!-- PROVIDER_PARAMETERS
provider: xai
model: grok-beta
-->
```

**Default Behavior:**
- `CFN_CUSTOM_ROUTING=false`: All agents use Main Chat settings
- `CFN_CUSTOM_ROUTING=true`: Agents without provider params default to **Z.ai + glm-4.6**

**Provider Options:**
- `zai` - Cost-optimized ($0.50/1M tokens, default)
- `kimi` - Mid-range ($2/1M tokens)
- `gemini` - Google Gemini via OpenRouter (~$0.30/1M input, ~$1.20/1M output)
- `xai` - XAi Grok (Anthropic-compatible API)
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

**Test-Driven Validation (v3.0+)**
- Objective test execution replaces subjective confidence scoring
- 95%+ accuracy (was 55% with confidence-based approach)
- Automated quality gates prevent "consensus on vapor"
- See: `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md` (comprehensive guide)
- See: `docs/guides/SUCCESS_CRITERIA_EXAMPLES.md` (25+ examples)
- See: `docs/migration/CONFIDENCE_TO_TEST_DRIVEN_MIGRATION.md` (migration from v1.x-2.x)

**Skill-Driven Loop Management**
- Coordination via `.claude/skills/cfn-loop-validation/SKILL.md`
- **Automatic dependency orchestration** (v2.2.0)
- Adaptive context injection
- Modular loop progression

**Mode Comparison (Test-Driven Gates):**

| Mode | Loop 3 Gate (Pass Rate) | Loop 2 Consensus | Iterations | Validators |
|------|------------------------|------------------|------------|------------|
| MVP | ≥0.70 | ≥0.80 | 5 | 2 |
| Standard | ≥0.95 | ≥0.90 | 10 | 3-5 |
| Enterprise | ≥0.98 | ≥0.95 | 15 | 5-7 |

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
- Executes tests and collects pass rates with metadata validation
- Gate check: spawn Loop 2 if pass rate ≥threshold (with health verification)
- Spawns Loop 2 agents (validators) with monitoring
- Collects consensus scores with stuck agent detection
- Spawns Product Owner for decision
- Manages iterations based on PROCEED/ITERATE/ABORT with timeout handling

**Agent Completion Protocol (Mode-Specific):**

**CLI Mode v3.0** (spawned via `cfn-spawn agent`):
```bash
# 1. Complete work with enhanced context
# 2. Automatic context validation (prevents "consensus on vapor")
# 3. Agents use Redis coordination (CLI spawning handles this)
# 4. Report confidence score and deliverables
# 5. Agent exits cleanly (orchestrator monitors via enhanced waiting)

# The CLI spawning system automatically handles:
# - Coordination signal dispatch
# - Confidence score reporting with metadata
# - Process health monitoring
```

**Task Mode** (spawned via Task() tool in Main Chat):
```bash
# Simply complete work and return output
# Main Chat receives output automatically
# NO coordination signals required
# NO explicit completion protocol needed
```

**Enhanced Agent Protocol Requirements:**
- ✅ **Completion signaling**: Redis coordination via CLI spawning system
- ✅ **Context awareness**: Broadcast messages automatically injected
- ✅ **Metadata tracking**: Agent status and process PID monitored by orchestrator
- ✅ **Health checking**: Process health validated during execution

**Orchestration Flow (v3.0 - Test-Driven Self-Validation):**
1. Loop 3 agents complete work, execute tests, and report pass rates
2. **Gate Check:** Loop 3 test pass rates checked against threshold
   - IF gate FAILS (pass rate < threshold) → Wake Loop 3 for iteration N+1 (skip Loop 2)
   - IF gate PASSES (pass rate ≥ threshold) → Signal Loop 2 to start work
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


## 4) Test Execution Guidance for Developers

### When to Run Tests

**Always run tests before committing:**
- After implementing features or bug fixes
- Before creating pull requests
- After modifying agent behavior or coordination logic
- When validating CFN Loop workflows

**Different test suites for different contexts:**
- **Local development**: Use npm tests for fast feedback (1-5 minutes)
- **Pre-commit validation**: Run CLI mode tests (5-10 minutes)
- **Production validation**: Run Docker mode tests (3-5 minutes)
- **CI/CD pipeline**: All tests run automatically (see CI/CD documentation)

### Test Suite Selection Matrix

| Context | Command | Duration | Use When |
|---------|---------|----------|----------|
| Development | `npm test` | 1-5 min | Making code changes, quick feedback |
| Unit validation | `npm run test:unit` | ~1 min | Testing isolated functions |
| Integration | `npm run test:integration` | ~2 min | Testing module interactions |
| E2E | `npm run test:e2e` | ~5 min | Testing full workflows |
| CLI validation | `./tests/cli-mode/run-all-tests.sh` | 5-10 min | Before commits, validates `/cfn-loop-cli` |
| Docker validation | `./tests/docker-mode/run-all-implementations.sh` | 3-5 min | Pre-release, validates containers |
| CFN Loop | `./tests/cfn-v3/test-e2e-cfn-loop.sh` | 5-15 min | Testing coordinator and orchestration |

### CLI Mode Test Suite (Production Validation)

CLI mode tests validate the end-to-end coordination layer that agents depend on:

```bash
# Run full CLI test suite
./tests/cli-mode/run-all-tests.sh

# Expected output indicates:
# - 8 test suites passing
# - 159 total assertions validated
# - Coverage of Redis coordination, thresholds, agent spawning, path resolution
```

**What gets tested:**
- `/cfn-loop-cli` slash command workflow
- Coordinator spawning with environment validation
- Loop 3 → Loop 2 → Product Owner progression
- Quality gate enforcement (MVP/Standard/Enterprise modes)
- Redis coordination blocking and messaging
- Agent tool access and permissions
- Path resolution and TASK_ID sanitization

**Run this before:**
- Committing changes to agent spawning logic
- Modifying coordinator or orchestrator
- Changing quality gate thresholds
- Updating Redis coordination patterns

### Docker Mode Test Suite (Integration Validation)

Docker mode tests validate real container-based orchestration:

```bash
# Run all 45 Docker tests
./tests/docker-mode/run-all-implementations.sh

# Three test suites run sequentially:
# 1. Coordinator spawning (13 tests)
# 2. Orchestrator workflow (13 tests)
# 3. TDD compliance (19 tests)
```

**What gets tested:**
- Container spawning with proper cleanup
- Exit code propagation and error handling
- Service discovery (Redis, Postgres)
- Network isolation and port conflicts
- Iteration management and monitoring
- Process health checking
- Test-driven validation patterns

**Run this before:**
- Committing Docker-related changes
- Modifying spawning logic
- Changing orchestrator behavior
- Before releases to production

### Development Test Suite (Fast Feedback)

NPM tests provide rapid feedback during active development:

```bash
# Full test suite
npm test

# Run with coverage report
npm test -- --coverage

# Watch mode for continuous testing
npm test -- --watch

# Individual test types
npm run test:unit
npm run test:integration
npm run test:e2e
```

**Use for:**
- Immediate validation while coding
- Quick regression checks
- Coverage analysis
- Pre-commit validation

### Test Authoring Standards

All tests must follow the standards documented in `tests/CLAUDE.md`:

**Template structure:**
```bash
#!/bin/bash
# tests/docker/<topic>/<name>.sh
# Phase X :: <one-line purpose> (Bug #<id> / Reference)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # Always clean up: docker rm, rm -rf, git worktree prune, etc.
}
trap cleanup EXIT

test_case_name() {
  log_step "GIVEN <context>"
  # WHEN <action>
  # THEN assert_* "<result>"
}

test_case_name
```

**Key principles:**
- Start with `#!/bin/bash` and `set -euo pipefail`
- Immediately source test utilities: `source "$PROJECT_ROOT/tests/test-utils.sh"`
- Define cleanup trap that runs even on failure
- Use GIVEN/WHEN/THEN markers for clarity
- Use `log_step`, `log_info`, `annotate`, `assert_success` helpers
- Cite relevant bugs for context (e.g., "Bug #21 validation")

**Critical testing requirement from BUG #21:**
- Infrastructure tests can use mocks (Docker networking, volumes, Redis connectivity)
- Integration tests MUST use production code paths:
  - Use actual spawning scripts (spawn-agent.sh)
  - Use production images (cfn-agent:latest, not alpine)
  - Validate actual CLI syntax (not inline scripts)
  - Check container logs for runtime errors

### Test Documentation Structure

```
tests/
├── README.md                      # Test suite overview
├── CLAUDE.md                      # Test authoring standards
├── test-utils.sh                  # Shared test helpers
│
├── cli-mode/                      # CLI mode validation
│   ├── README.md                  # CLI test documentation
│   ├── run-all-tests.sh          # Main test runner
│   └── test-*.sh                 # Individual test suites
│
├── docker-mode/                   # Docker integration tests
│   ├── README.md                  # Docker test documentation
│   ├── run-all-implementations.sh # Main test runner
│   └── implementations/           # 45 production tests
│
├── cfn-v3/                        # CFN Loop validation
│   ├── test-e2e-cfn-loop.sh      # End-to-end test
│   └── test-coordinator-handoffs.sh
│
├── docker/                        # Docker-based core tests
│   ├── coordination/              # Redis coordination
│   ├── lifecycle/                 # Container lifecycle
│   └── perf/                      # Performance tests
│
└── enterprise/                    # Enterprise mode tests
```

### Test Results and Artifacts

Test results are stored in standard locations:

```bash
# Test results archive
.artifacts/test-results/

# Coverage reports
.artifacts/coverage/

# Test logs
.artifacts/logs/

# Benchmarks
.artifacts/benchmarks/

# Runtime artifacts
.artifacts/runtime/
```

Check these locations to:
- Verify test pass rates
- Review coverage metrics
- Analyze performance benchmarks
- Debug test failures

### Troubleshooting Test Failures

**Common issues and solutions:**

1. **Redis not available:**
   ```bash
   redis-server --daemonize yes
   # Or: docker run -d -p 6379:6379 redis:7-alpine
   ```

2. **Docker daemon not running:**
   ```bash
   # Start Docker
   sudo systemctl start docker
   # Or on Mac: open /Applications/Docker.app
   ```

3. **Port conflicts:**
   ```bash
   docker stop $(docker ps -aq)
   docker rm $(docker ps -aq)
   docker network prune -f
   ```

4. **Permission issues:**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

5. **Verbose debugging:**
   ```bash
   DEBUG=true ./tests/cli-mode/run-all-tests.sh
   tail -100 .artifacts/logs/test-execution.log
   ```

### CI/CD Integration

Tests run automatically on every push and pull request via GitHub Actions. See `docker/CI_CD_TEST_INTEGRATION.md` for:
- Coverage gates (80%+ lines/statements/functions)
- Test failure notifications
- Performance benchmarking
- Security scanning
- Deployment workflows

**Local pre-commit validation:**
```bash
# Before committing to main or feature branches
npm test && \
  ./tests/cli-mode/run-all-tests.sh && \
  ./tests/docker-mode/run-all-implementations.sh
```

### Related Documentation

- **Test Suite Overview**: `tests/README.md`
- **Test Authoring Standards**: `tests/CLAUDE.md` (boilerplate, GIVEN/WHEN/THEN patterns, BUG #21 validation)
- **CLI Mode Tests**: `tests/cli-mode/README.md` (8 suites, 159 assertions)
- **Docker Mode Tests**: `tests/docker-mode/README.md` (45 production tests, 3 categories)
- **Test Coverage Matrix**: `tests/TEST_COVERAGE_MATRIX.md`
- **CFN Loop Architecture**: `docs/CFN_LOOP_ARCHITECTURE.md`
- **CI/CD Pipeline**: `docker/CI_CD_TEST_INTEGRATION.md`


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
- **Task Mode Guide**: `.claude/commands/CFN_LOOP_TASK_MODE.md` (agent specialization, sprint workflow, backlog management, adaptive validator scaling)
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
