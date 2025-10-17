# Claude Flow Novice — AI Agent Orchestration

---

## 1) Critical Rules (Single Source of Truth)

**Core Principles:**
* Use agents for all non-trivial work (≥4 steps or multi-file/research/testing/architecture/security)
* **PRIMARY COORDINATOR: Use coordinator-hybrid for all multi-agent coordination** (cost-optimized CLI spawning with typed agents)
* Initialize swarm before multi-agent work
* Batch operations: one message per related batch (spawn, file edits, bash, todos, memory ops)
* Run post-edit hook after every file edit
* **REQUIRED: All CLI agent spawning must use explicit --agents flag with typed agents**

**Prohibited Patterns:**
* Working solo on multi-step tasks — spawn parallel specialists via coordinator-hybrid
* Using generic "coordinator" fallback when coordinator-hybrid available
* Spawning agents without explicit --agents flag (must specify types from AVAILABLE-AGENTS.md)
* Mixing implementers + validators in same message
* Running tests inside agents — execute once; agents read results
* Concurrent test runs — terminate previous runs first
* Saving to project root — use proper subdirs
* Creating guides/summaries/reports unless explicitly asked
* Agent coordination without Redis pub/sub messaging
* Asking permission to retry/advance when criteria/iterations allow. Instead relaunch agents

**Communication:**
* Use spartan language
* Redis persistence enables swarm recovery — state survives interruptions
* ALL agent communication MUST use Redis pub/sub — no direct file coordination

**Consensus thresholds** (mode-dependent)

* Standard mode: Gate ≥0.75 • Consensus ≥0.90 • 4 validators • single PO
* MVP mode: Gate ≥0.65 • Consensus ≥0.85 • 2 validators • single PO
* Enterprise mode: Gate ≥0.85 • Consensus ≥0.95 • 5 validators • 4-person board • Loop 0.5 planning

---

## 2) When Agents Are Mandatory (Triggers)

If **any** apply, spawn coordinator-hybrid (which spawns typed specialist agents):

* > 3 distinct steps • multiple files • research+implement+test • design decisions • code review/quality • security/performance/compliance • system integration • docs generation • refactor/optimize • any feature work

**Coordinator Selection Priority:**
1. **coordinator-hybrid** (PRIMARY) - All multi-agent work, CLI spawning with --agents flag, cost-optimized ($0 coordinator + $0.50 workers)
2. **adaptive-coordinator** - Only for 8+ agents with dynamic topology switching
3. **coordinator** - FALLBACK ONLY when specialized coordinators unavailable

**Required Spawning Pattern:**
```bash
# ✅ CORRECT: Explicit typed agents
node src/cli/hybrid-routing/spawn-workers.js \
  "Task description" \
  --agents=analyst,architect,coder \
  --provider zai

# ❌ WRONG: Missing --agents flag (will error)
node src/cli/hybrid-routing/spawn-workers.js "Task description" --max-agents 3
```

---

## 3) Execution Patterns

### 3.1 Swarm Init → Spawn (Single Message)

**Swarm Init Pattern: ONCE per phase, not per round**
```bash
# Phase-level initialization (persistent through all loops)
executeSwarm({
  swarmId: "phase-0-mcp-less-foundation",
  objective: "Phase 0: MCP-Less Foundation",
  strategy: "development",
  mode: "mesh",
  persistence: true
})
```

**Redis-backed Swarm Execution**:
```bash
node tests/manual/test-swarm-direct.js "Create REST API with authentication" --executor --max-agents 3
# Or: executeSwarm(objective, { strategy: 'development', mode: 'mesh' })
```

**Topology**: mesh (2–7), hierarchical (8+)

**When to Re-Init:**
- ✅ New phase starts (Phase 0 → Phase 1 → Phase 2...)
- ✅ Swarm corruption detected
- ✅ >24 hours since last activity (TTL expiration)
- ❌ Loop 3 retry iterations (use existing swarm)
- ❌ Loop 2 consensus validations (use existing swarm)
- ❌ Agent respawns within same phase

### 3.2 Post-Edit Hook (Mandatory)

```bash
node config/hooks/post-edit-pipeline.js "[FILE]" --memory-key "swarm/[agent]/[step]"
```

**Useful flags (optional)**: `--tdd-mode` • `--minimum-coverage 80..90` • `--rust-strict` • `--no-wasm` (disable 52x acceleration)

**Markdown validation** (opt-in, better for CI): `--validate-markdown`

**WASM 52x acceleration** enabled by default for:
- JavaScript/TypeScript: AST parsing, linting, type checking
- Rust files: Pattern matching (unwrap, panic, expect detection)
- Markdown (opt-in): Link checking, structure analysis

### 3.3 Safe Test Execution

```bash
# Run once, save results
npm test -- --run --reporter=json > test-results.json 2>&1
# Agents read results only
cat test-results.json
# Cleanup
pkill -f vitest; pkill -f "npm test"
```

**Forbidden**: tests executed inside agents; concurrent test runs; long-running tests without cleanup.

### 3.4 Batching (One message = all related ops)

* Spawn all agents with Task tool in one message (this will mostly be coordinator launches)
* Batch file ops, bash, todos, memory ops.

---

## 4) CFN Loop (Single Section)

### 4.1 Loop Structure

Loop 0: Epic/Sprint orchestration (multi-phase) → no iteration limit
Loop 0.5: Planning consensus (Enterprise only) → architects vote on design; ≥0.85 consensus
Loop 1: Phase execution (sequential phases) → no limit
Loop 2: Consensus validation (2-4 validators) → max 5-15/phase; exit at ≥0.80-0.95
Loop 3: Primary swarm implementation → max 5-15/subtask; exit when all ≥0.70-0.75
Loop 4: Product Owner decision gate (GOAP) → PROCEED / DEFER / ESCALATE -> Re-inject detailed mode instructions

**SQLite Persistence (Dual-Layer)**:
- Redis: Active coordination (pub/sub, heartbeats, 1h TTL)
- SQLite: Persistent state (audit trails, 30-365 day retention)

Loop storage patterns:
- Loop 3: `cfn/phase:{id}/loop3/{agentId}/confidence` → ACL Level 1 (Private)
- Loop 2: `consensus` table → ACL Level 3 (Swarm), immutable audit
- Loop 4: `cfn/phase:{id}/loop4/decision` → ACL Level 4 (Project)

**Detailed Mode Instructions**:
See coordinator profiles for complete spawn patterns, Redis pub/sub coordination, SQLite memory patterns, git commit templates, and retry strategies. Each coordinator maintains mode-specific expertise and auto-injects instructions for next phases.

### 4.2 CFN Loop Modes

**Mode Selection**: Adapt quality gates to project needs

```bash
/cfn-loop "Task" --mode=mvp          # Fast iteration
/cfn-loop "Task" --mode=standard     # Balanced (default)
/cfn-loop "Task" --mode=enterprise   # Full quality gates
```

**Mode Comparison**:

| Mode | Best For | Gate | Consensus | Iterations | Validators | Product Owner | Loop 0.5 |
|------|----------|------|-----------|------------|------------|---------------|----------|
| **MVP** | Prototypes, MVPs | ≥0.65 | ≥0.85 | 5 | 2 | Single | No |
| **Standard** | General features | ≥0.75 | ≥0.90 | 10 | 4 | Single | No |
| **Enterprise** | Production systems | ≥0.85 | ≥0.95 | 15 | 5 | 4-person board | Yes (≥0.85) |

**Auto-Detection**: Epic parser infers mode from filename patterns (`-mvp`, `-enterprise`)

```bash
/parse-epic ./auth-mvp.json --cfn-mode=auto  # Detects MVP mode
/parse-epic ./platform.json --cfn-mode=enterprise
```

**Mode Storage**: Redis key `cfn:mode:{phaseId}` stores mode for swarm coordination

### 4.3 Dedicated CFN Coordinators

**Mode-Based Coordinator Selection**:
Specialized coordinators handle entire sprints with mode-specific expertise and autonomous phase execution:

| Coordinator | Mode | Focus | Cost Target | Phase Duration |
|-------------|------|-------|-------------|----------------|
| **cfn-coordinator-mvp** | MVP | Rapid iteration, cost optimization | <$1.00/phase | 15 minutes |
| **cfn-coordinator-standard** | Standard | Balanced quality and speed | $2.00/phase | 30 minutes |
| **cfn-coordinator-enterprise** | Enterprise | Full quality gates, compliance | $5.00/phase | 60 minutes |

**Coordinator Spawning Pattern**:
```bash
# Auto-spawn appropriate coordinator based on mode
node src/cli/hybrid-routing/spawn-coordinator.js \
  "Execute sprint: User Authentication System" \
  --mode=mvp --sprint-id=auth-sprint-001

# Coordinator spawns workers for each phase
node src/cli/hybrid-routing/spawn-workers.js \
  "Implement core authentication features" \
  --max-agents 3 --provider zai --redis-channel swarm:mvp-phase
```

**Auto-Phase-Launch Pattern**:
Coordinators autonomously execute Loop 3→2→4 for each phase:

1. **Loop 3**: Spawn workers (2-5 based on mode)
2. **Loop 2**: Coordinate validators (2-4 based on mode)
3. **Loop 4**: Product Owner decision
4. **Auto-Inject**: Mode-specific instructions for next phase

**Single-Coordinator-Per-Sprint Pattern**:
- One coordinator handles entire sprint lifecycle
- Persistent state across all phases
- Mode-specific parameter enforcement
- Automatic return-to-chat triggers

**Return-to-Chat Triggers**:
Coordinators return to main chat only for:

1. **Human Decision Required**:
   - Major architectural changes
   - Budget/timeline adjustments
   - Critical technical blockers
   - Stakeholder approval needed

2. **Sprint Complete**:
   - All planned phases executed
   - Deliverables ready for review
   - Next iteration planning required

```javascript
// Return-to-chat trigger logic
const shouldReturnToChat = {
  humanDecision: blockers.critical || scope.majorChange,
  sprintComplete: phases.remaining === 0 && deliverables.ready
};
```

**Coordinator Auto-Injection**:
After each Loop 4 PROCEED decision, coordinators auto-inject mode-specific instructions:

```javascript
// MVP coordinator auto-injection example
const mvpInstructions = `
## MVP Mode Instructions for Next Phase

### Development Priorities
1. **Speed Over Perfection**: Focus on functional delivery
2. **Core Features Only**: Implement essential functionality
3. **Rapid Testing**: Basic test coverage (70%+ acceptable)
4. **Quick Validation**: 2-validator consensus process

### Cost Constraints
- Phase Budget: <$1.00 total
- Worker Count: 2-3 maximum
- Timeline: 15 minutes per phase
- Provider: z.ai (cost optimization)
`;
```

**Coordinator Telemetry**:
Each coordinator tracks and reports phase metrics:

```javascript
const coordinatorMetrics = {
  phaseId: 'user-auth-mvp',
  mode: 'mvp',
  coordinator: 'cfn-coordinator-mvp',
  
  loop3: {
    workers: 2,
    avgConfidence: 0.75,
    gateThreshold: 0.70,
    cost: 0.27,
    duration: 720000
  },
  
  loop2: {
    validators: 2,
    consensus: 0.85,
    consensusThreshold: 0.80,
    cost: 0.08,
    duration: 300000
  },
  
  totalCost: 0.35,
  totalDuration: 1020000,
  savingsVsPureClaude: 0.96
};
```

### CFN Loop Coordination Framework

**Agent Coordination (Critical Rule #19 - Mandatory Redis pub/sub):**

Choose coordination method based on scale and requirements:

| Method | Use When | Example |
|--------|----------|---------|
| **Event Bus** | Enterprise scale (1000+ agents, 10K+ events/sec) | `/eventbus publish --type cfn.loop.phase.start` |
| **Redis Pub/Sub** | Standard coordination (10-100 agents) | `redis-cli publish "swarm:coord" '{"agent":"id"}'` |
| **SQLite Memory** | Persistent state with ACL (cross-loop data) | `/sqlite-memory store --key "cfn/phase/loop3" --level project` |
| **Redis State** | Active coordination (ephemeral, TTL-based) | `redis-cli setex "cfn:phase:state" 3600 '{"loop":3}'` |

**Coordination Examples:**

```bash
# Event Bus (Enterprise) - High-throughput coordination
/eventbus publish --type cfn.loop.phase.start --data '{"loop":3,"phase":"auth"}' --priority 9
/eventbus subscribe --pattern "cfn.loop.*" --handler cfn-coordinator --batch-size 50

# Redis Pub/Sub (Standard) - Direct agent coordination
redis-cli publish "swarm:coordination" '{"agent":"coder-1","status":"ready","loop":3}'
redis-cli subscribe "swarm:coordination"

# SQLite Memory (Persistent) - Cross-loop data with ACL
/sqlite-memory store --key "cfn/phase-auth/loop3/results" --level project
/sqlite-memory retrieve --key "cfn/phase-auth/*" --level project

# Redis State (Ephemeral) - Active coordination state
redis-cli setex "cfn:phase-auth:state" 3600 '{"loop":3,"agents":5,"confidence":0.85}'
redis-cli get "cfn:phase-auth:state"
```

### Hybrid CLI-Based Routing (Default with Claude Max)

**Enabled automatically when using `/switch-api max`**

**Architecture:**
```
Main Chat (Claude Max subscription, $0)
  ↓
  Task("Coordinator", "intelligent coordination", "coordinator")
  ↓
  Bash: node src/cli/hybrid-routing/spawn-workers.js --max-agents 5 --provider zai
  ↓
  Workers (z.ai, $0.10-2/1M tokens)
```

**CLI Spawning (spawn-workers.js) - REQUIRED --agents Flag:**

```bash
# ✅ CORRECT: Explicit typed agents (REQUIRED)
node src/cli/hybrid-routing/spawn-workers.js \
  "Fix SQLite dependency injection" \
  --agents=analyst,coder \
  --provider zai --redis-channel swarm:task1

# ❌ WRONG: Missing --agents flag (will error)
node src/cli/hybrid-routing/spawn-workers.js \
  "Fix SQLite dependency injection" \
  --max-agents 2 --provider zai

# List available agent types:
node src/cli/hybrid-routing/spawn-workers.js --list-agents

# Features:
# - REQUIRED: --agents flag with typed agents from AVAILABLE-AGENTS.md
# - Automatic 502 retry with exponential backoff (1s, 2s, 4s max)
# - 30-minute timeout with explicit logging
# - Redis pub/sub coordination
# - SQLite memory persistence
# - Token usage tracking
```

**Automatic Error Recovery:**

```bash
⚠️  Worker 1 502 error, retry 1/3 in 1s
⚠️  Worker 1 502 error, retry 2/3 in 2s
✅ Worker 1 completed: confidence 0.85
```

**Timeout Handling:**

```bash
⏱️  TIMEOUT: Workers exceeded 30-minute limit
📊 Workers completed: 3/5
💡 Fallback: Check /tmp/ for partial results
   - Redis keys: redis-cli keys "swarm:phase0:*"
   - SQLite: Check ./swarm-memory.db
```

**Loop 3 Implementation Pattern (Hybrid Mode):**

```javascript
// Coordinator spawned via Task tool (uses Claude Max subscription)
Task("coordinator-hybrid",
  `Lead implementation of authentication system.

   **Spawning Strategy (Hybrid CLI):**
   1. Spawn typed worker agents via CLI with z.ai provider (REQUIRED --agents flag):

      node src/cli/hybrid-routing/spawn-workers.js \\
        "Implement auth: JWT (coder-1), sessions (coder-2), rate-limiting (security-1)" \\
        --agents=coder,coder,security-specialist \\
        --provider zai --redis-channel swarm:auth

   2. Workers will coordinate via Redis pub/sub on channels:
      - swarm:auth:coder-1:complete
      - swarm:auth:coder-2:complete
      - swarm:auth:security-1:complete
      - (etc)

   3. Monitor Redis for worker completion events.

   4. Aggregate confidence scores from all workers.

   5. Report when all workers ≥0.75 confidence:
      {
        "phase": "auth",
        "workers": 5,
        "avgConfidence": 0.82,
        "status": "READY_FOR_LOOP2"
      }

   **Your Role:**
   - Intelligent task decomposition
   - Progress monitoring via Redis
   - Error handling and recovery
   - Result aggregation
   - Structured reporting to main chat

   **Cost Structure:**
   - You (coordinator): $0 (subscription)
   - Workers: 5 × 200K tokens × $0.50/1M = $0.50
   - Total phase cost: ~$0.50
   - Savings vs pure Claude: 97%`,
  "coordinator"
)
```

**Benefits of Hybrid Approach:**
- ✅ Best coordinator quality (Claude 3.5 Sonnet for orchestration)
- ✅ 97% cost savings on worker execution
- ✅ Intelligent progress reporting to main chat
- ✅ Error handling and recovery logic
- ✅ Structured result aggregation
- ⚠️ Sequential spawning (~10s for 5 agents)

**When Hybrid Routing is Disabled (Pure Provider Mode):**
- All agents use main provider (Claude Max or z.ai)
- No coordinator intelligence layer
- Direct CLI spawning without orchestration

**Git Commit After Loop Completion:**

Use `/github-commit --chat` after each loop completes. Example:

```bash
# After Loop 3 completes (all agents ≥0.75)
/github-commit --chat
# Generates: feat(cfn-loop): Complete Loop 3 - [Phase Name]
# Includes: Confidence scores, agent list, files modified, next step
```

**When to Commit:**
- **Loop 3 complete**: All agents meet gate threshold (≥0.70-0.75)
- **Loop 2 complete**: Validation consensus achieved (≥0.80-0.95)
- **Loop 4 complete**: Product Owner decision made (PROCEED/DEFER/ESCALATE)
- **Phase complete**: All loops done, ready for next phase
- **Sprint complete**: Use `/github-commit --full` (auto-triggers `/cfn-loop-document --sprint=name`)
- **Epic complete**: Use `/github-commit --full` + `/cfn-loop-document --epic=name`

**Loop Telemetry (Print to Main Chat)**

ALWAYS print telemetry between loops to keep user informed:

**After Loop 3 (Gate Check):**
```
## Loop 3 Complete - [Phase Name] ([Mode])

**Confidence Scores:**
- agent-1: 0.85 ✅ (description, key files)
- agent-2: 0.82 ✅ (description, key files)
- agent-3: 0.78 ✅ (description, key files)

**Gate Result:** PASS (avg 0.82, target ≥[threshold])
**Files Changed:** N files
**Coverage:** X% (target ≥Y%)
**Security:** Clean / Issues found
**Blockers:** None / List issues

→ Proceeding to Loop 2 ([N] validators)
```

**After Loop 2 (Consensus):**
```
## Loop 2 Complete - Validation ([Mode])

**Validator Scores:**
- validator-1: 0.92 ✅ (key findings)
- validator-2: 0.85 ✅ (key findings)

**Consensus:** 0.88 (target ≥[threshold]) [✅ or ⚠️]
**Recommendations:**
- [SEVERITY] Description (action: defer/backlog/fix)

→ Proceeding to Loop 4 (Product Owner can override)
```

**After Loop 4 (PO Decision):**
```
## Loop 4 Complete - Product Owner Decision ([Mode])

**PO Review:**
- Loop 3 avg: 0.82 ✅
- Loop 2 consensus: 0.88 ([met/below] threshold)
- Validator recommendations: [list]

**Decision: [DEFER/PROCEED/ESCALATE]** [✅/⚠️]
**Reasoning:** "[PO reasoning, including override justification if applicable]"
**Override:** [Yes/No] (if consensus below threshold)

**Backlog Items:** [list]
**Required Fixes:** [list if PROCEED]

→ [Launching agents for next phase / Relaunching Loop 3 with fixes / Escalating to human]
```

**Retry Templates**

Loop 3 retry (low confidence): replace failing agents with specialists; add missing roles (security/perf); relaunch agents
Loop 2 retry (consensus <threshold): ALWAYS proceed to Loop 4; PO decides PROCEED (relaunch Loop 3) or DEFER (override validators)

**Mode-Specific Iteration Limits**:
- MVP: Loop 3 max 5 iterations • Loop 2 max 5 iterations
- Standard: Loop 3 max 10 iterations • Loop 2 max 10 iterations
- Enterprise: Loop 3 max 15 iterations • Loop 2 max 15 iterations

Stop only if: mode-specific iteration limits reached, critical security/compilation error, or explicit STOP/PAUSE.

---

## 5) Coordination Checklist (Before / During / After)

**Before**: initialize SQLite memory system for agent persistence → assess complexity → set agent count/types → choose topology → prepare single spawn message → unique non-overlapping instructions.

**During**: coordinate via SwarmMemory → post-edit hook after every edit → self-validate and report confidence.

**After**: achieve ≥0.80-0.95 validator consensus → store results → auto next steps.

---

## 6) Commands & Setup

**Swarm Execution**

```bash
# Direct swarm execution (Redis-backed)
node tests/manual/test-swarm-direct.js "Create REST API" --executor --max-agents 3

# Swarm recovery after interruption
redis-cli keys "swarm:*"  # Find interrupted swarms
node tests/manual/test-swarm-recovery.js  # Execute recovery

# CRITICAL: All agents MUST use Redis pub/sub for coordination
redis-cli publish "swarm:coordination" '{"agent":"id","status":"message"}'
```

## 7) SQLite Memory System















<!-- TASK_COORDINATORS_START -->
### Task-Tool Coordinators (Cost-Savings Mode DISABLED)

**When cost-savings mode is disabled, use these Task spawning patterns:**

#### coordinator-hybrid (PRIMARY)
```javascript
Task("coordinator-hybrid",
  `Coordinate task: [description]

   Spawn workers via Task tool:
   - Task("analyst", "Analyze requirements", "analyst")
   - Task("coder", "Implement solution", "coder")
   - Task("tester", "Validate tests", "tester")

   Coordinate via Redis pub/sub on swarm:task channel`,
  "coordinator"
)
```

#### cfn-coordinator-mvp
```javascript
Task("cfn-coordinator-mvp",
  `Execute MVP phase: [description]

   MVP Parameters:
   - Gate threshold: 0.70
   - Consensus: 0.80
   - Validators: 2
   - Max iterations: 5

   Spawn 2-3 workers via Task tool`,
  "coordinator"
)
```

#### cfn-coordinator-standard
```javascript
Task("cfn-coordinator-standard",
  `Execute standard phase: [description]

   Standard Parameters:
   - Gate threshold: 0.75
   - Consensus: 0.90
   - Validators: 4
   - Max iterations: 10

   Spawn 3-5 workers via Task tool`,
  "coordinator"
)
```

#### cfn-coordinator-enterprise
```javascript
Task("cfn-coordinator-enterprise",
  `Execute enterprise phase: [description]

   Enterprise Parameters:
   - Gate threshold: 0.75
   - Consensus: 0.95
   - Validators: 4
   - Max iterations: 15
   - Loop 0.5: Planning consensus

   Spawn 5-8 workers via Task tool`,
  "coordinator"
)
```

#### adaptive-coordinator
```javascript
Task("adaptive-coordinator",
  `Coordinate with adaptive topology:

   Topology: mesh (2-7) | hierarchical (8+)
   Dynamic switching based on agent count

   Spawn workers via Task tool`,
  "coordinator"
)
```

**Cost Structure (Task-Tool Mode):**
- All agents use main provider (Claude Max or z.ai based on /switch-api)
- Higher cost but maximum coordinator intelligence
- Direct Task tool orchestration

<!-- TASK_COORDINATORS_END -->

### 5-Level ACL

| Level | Scope      | Encryption | Loop Use    |
|-------|------------|------------|-------------|
| 1     | Agent      | AES-256    | Loop 3      |
| 2     | Team       | AES-256    | Team sync   |
| 3     | Swarm      | None       | Loop 2      |
| 4     | Project    | None       | Loop 4      |
| 5     | System     | Master key | Audit       |

### Agent Usage

```javascript
// Initialize
const memory = new SQLiteMemorySystem({ swarmId, agentId, dbPath });
await memory.initialize();

// Store with ACL
await memory.memoryAdapter.set(key, value, { agentId, aclLevel, namespace });

// Retrieve
const data = await memory.memoryAdapter.get(key, { agentId });
```

### Loop Storage Keys

- Loop 3: `cfn/phase:{id}/loop3/{agentId}/confidence` (ACL 1)
- Loop 2: `consensus` table (ACL 3)
- Loop 4: `cfn/phase:{id}/loop4/decision` (ACL 4)

**Architecture**: Redis (hot, 1h TTL) + SQLite (persistent, 30-365d)
**Performance**: Write <60ms, Read <5ms (Redis) / <20ms (SQLite)

**Detailed commands**: See `readme/additional-commands.md` Section "SQLite Memory & ACL Commands"

---

## 8) Output & Telemetry (Concise)

**Agent confidence JSON (per agent)**

```json
{ "agent": "coder-1", "confidence": 0.85, "reasoning": "tests pass; security clean", "blockers": [] }
```

**Phase/Loop status (sample)**

```
Loop 3: avg 0.82 (target 0.75) ✅ → Proceed to Loop 2
Loop 2: 0.87 (target 0.90) ❌ → Relaunch Loop 3 (security + coverage)
```

**Next steps block**

* ✅ Completed: brief list
* 📊 Validation: confidence, coverage, consensus
* 🔍 Issues: debt/warnings
* 💡 Recommendations: prioritized

---

## 9) CLI Command Reference

### Swarm Management

```bash
# Initialize and execute swarms with Redis-backed coordination for persistent state across interruptions
node tests/manual/test-swarm-direct.js "Objective description" --executor --max-agents 5
node src/cli/simple-commands/swarm.js "Build REST API" --strategy development --mode mesh
claude-flow-novice swarm "Research cloud patterns" --strategy research --output-format json

# Monitor swarm status and retrieve real-time metrics from Redis coordination layer
claude-flow-novice swarm status
claude-flow-novice monitor
claude-flow-novice metrics --format=json
redis-cli keys "swarm:*"  # Find all active and persisted swarms in Redis
redis-cli get "swarm:swarm_id"  # Retrieve complete state for specific swarm instance
```


### Development Workflows

```bash
# Execute CFN Loop autonomous workflow with self-correcting consensus validation and retry mechanisms
/cfn-loop "Implement authentication system" --phase=auth --mode=standard
/cfn-loop "Build MVP prototype" --mode=mvp  # Fast iteration (Gate: 0.70, Consensus: 0.80)
/cfn-loop "Production API" --mode=enterprise  # Full quality gates with Loop 0.5 planning

# Epic-level mode selection with auto-detection
/parse-epic ./auth-mvp.json --cfn-mode=auto  # Detects MVP mode from filename
/parse-epic ./platform-enterprise.json --cfn-mode=auto  # Detects Enterprise mode

# Sprint and epic orchestration
/cfn-loop-sprints "E-commerce platform" --sprints=3 --mode=enterprise
/cfn-loop-epic "User management system" --phases=4 --mode=standard
```

### Coordination and State Management

**Redis Pub/Sub (Standard coordination):**
```bash
redis-cli publish "swarm:coordination" '{"agent":"coder-1","status":"ready"}'
redis-cli subscribe "swarm:coordination"
redis-cli setex "swarm:state" 3600 "$(cat swarm-state.json)"
redis-cli get "swarm:state" | jq .
```

**SQLite Memory (Persistent state with ACL):**
```bash
/sqlite-memory store --key "cfn/phase/loop3" --level project
/sqlite-memory retrieve --key "cfn/phase/*" --level project
```

**Memory Safety:**
```bash
/check:memory  # Check memory safety across swarms
claude-flow-novice memory list
claude-flow-novice memory clear --namespace=swarm
```

---

For specialized commands (fullstack development, SPARC methodology, fleet management, event bus, compliance, performance, markdown validation, utilities, metrics reporting, WASM optimization, build/deployment, neural operations, GitHub integration, workflow automation, security/monitoring, debugging, and SDK integration), see `readme/additional-commands.md`.