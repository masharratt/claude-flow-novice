# Claude Flow Novice — AI Agent Orchestration

**🚀 Production Status:** Redis coordination system fully deployed (Phase 7 - 2025-10-17)

---

## 1) Critical Rules (Single Source of Truth)

**Main Chat Role (Thin Orchestration Layer):**
* Main chat does ONLY: minimal investigation → determine task type → spawn coordinator + agents in single message → wait for results
* ALL coordination happens via Redis between coordinator and agents
* Main chat does NOT orchestrate agents directly - coordinator handles all agent coordination
* Agents communicate via Redis pub/sub with explicit dependencies (see `.claude/redis-agent-dependencies.md`)

**Core Principles:**
* Use agents for all non-trivial work (≥3 steps or multi-file/research/testing/architecture/security)
* **PRIMARY COORDINATOR: Use coordinator-hybrid for all multi-agent coordination** (cost-optimized CLI spawning with typed agents)
* Initialize swarm before multi-agent work
* Batch operations: spawn ALL agents (coordinator + workers) in single message
* Run post-edit hook after every file edit
* **REQUIRED: All CLI agent spawning must use explicit --agents flag with typed agents**
* **Context continuity:** Redis/SQLite persistence enables unlimited continuation — never stop due to context/token concerns

**Prohibited Patterns:**
* Main chat orchestrating agents directly — spawn coordinator to handle orchestration
* Spawning agents across multiple messages — use single message for coordinator + all agents
* Working solo on multi-step tasks — spawn parallel specialists via coordinator-hybrid
* Using generic "coordinator" fallback when coordinator-hybrid available
* Spawning agents without explicit --agents flag (must specify types from AVAILABLE-AGENTS.md)
* Agent coordination without Redis pub/sub messaging — ALL agents must use Redis
* Running tests inside agents — coordinator runs tests ONCE; workers read cached results from test-results.json
* Concurrent test runs — terminate previous runs first
* **Saving to project root — check `.artifacts/logs/post-edit-pipeline.log` after writes; move files if ROOT_WARNING**
* Creating guides/summaries/reports unless explicitly asked
* Asking permission to retry/advance when criteria/iterations allow — **relaunch agents immediately when consensus <threshold and iterations <max**
* Stopping work due to context/token concerns — Redis/SQLite persistence handles continuation automatically

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
npx claude-flow-novice swarm "Create REST API with authentication" --strategy development --max-agents 3
```

**Topology**: mesh (2–7), hierarchical (8+)

### 3.2 Post-Edit Hook (Mandatory)

```bash
node config/hooks/post-edit-pipeline.js "[FILE]" --memory-key "swarm/[agent]/[step]"
```

**Hook runs automatically after Edit/Write/MultiEdit** but output is NOT captured by default.

**Root Directory Warnings:**
If file created in root, hook returns `status: "ROOT_WARNING"` with `rootWarning.suggestions[]`. Agent MUST:
1. Check log file: `.artifacts/logs/post-edit-pipeline.log` (last entry)
2. If `status: "ROOT_WARNING"`, move file to suggested location
3. Common suggestions: `src/`, `docs/`, `config/`, `tests/`, `scripts/`

**Example Response:**
```json
{
  "status": "ROOT_WARNING",
  "rootWarning": {
    "suggestions": [
      {"location": "src/example.js", "reason": "Source code directory"},
      {"location": "docs/example.md", "reason": "Documentation directory"}
    ]
  }
}
```

### 3.3 Safe Test Execution

**Pattern: Coordinator runs tests ONCE before spawning workers**

```bash
# 1. Coordinator terminates any existing test runs
pkill -f vitest; pkill -f "npm test"

# 2. Coordinator runs tests once and caches results
npm test -- --run --reporter=json > test-results.json 2>&1

# 3. Workers read cached results only (no test execution)
cat test-results.json

# 4. Cleanup after all work complete
pkill -f vitest; pkill -f "npm test"
```

**Rules:**
* Coordinator executes tests before worker spawn
* Workers ONLY read test-results.json (never run tests)
* Single test execution prevents concurrent run conflicts
* Cache results in test-results.json for worker consumption

### 3.4 Batching (One message = all related ops)

* Spawn all agents with Task tool in one message
* Batch file ops, bash, todos, memory ops

---

## 4) CFN Loop Overview

**→ Full CFN Loop rules: `.claude/cfn-loop-rules.md` (auto-injected by CFN commands)**

**Mode Comparison:**

| Mode | Gate | Consensus | Iterations | Validators |
|------|------|-----------|------------|------------|
| MVP | ≥0.65 | ≥0.85 | 5 | 2 |
| Standard | ≥0.75 | ≥0.90 | 10 | 4 |
| Enterprise | ≥0.85 | ≥0.95 | 15 | 5 |

**Coordinator Patterns:** See `.claude/coordinator-patterns.md`

---

## 5) Coordination Checklist

**Before**: initialize SQLite memory system → assess complexity → set agent count/types → choose topology → prepare single spawn message

**During**: coordinate via SwarmMemory → post-edit hook after every edit → self-validate and report confidence

**After**: achieve ≥0.80-0.95 validator consensus → store results → auto next steps

---

## 6) Hook Feedback System (Phase 4.5)

**Auto-enabled:** Agents receive real-time feedback from post-edit hook via Redis.

### CLI Mode (Direct Subscription)
CLI-spawned agents auto-subscribe to `agent:{agentId}:feedback`:
- Feedback delivered within 100ms
- Written to `.artifacts/agents/{agentId}/pending-feedback.json`

### Task Mode (Coordinator-Mediated)
Task-spawned agents receive feedback via coordinator wake:
- Coordinator polls `coordinator:{id}:feedback` every 5s
- On feedback: Coordinator wakes agent with system reminder

### Feedback Types (Priority Order)

| Type | Severity | Action Required |
|------|----------|-----------------|
| `ROOT_WARNING` | High | Move file from root to suggested location |
| `TDD_VIOLATION` | High | Write tests before continuing |
| `LOW_COVERAGE` | Medium | Increase test coverage to threshold |
| `RUST_QUALITY` | Medium | Fix code quality issues |
| `LINT_ISSUES` | Low | Fix linting errors |

### Handling Feedback (Agents)

**ROOT_WARNING example:**
```bash
# Feedback: File created in root
mv test.txt src/test.txt  # Move to suggested location
```

**→ Pattern: `.claude/coordinator-feedback-pattern.md`**

### 6.3 Dashboard Integration (Phase 5)

**Real-time Dashboard:**
- URL: http://localhost:3001 (RealtimeServer)
- WebSocket: ws://localhost:3001/ws
- Components: RedisCoordinationMonitor.tsx

**REST API Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/redis/feedback | GET | Recent feedback (limit=100) |
| /api/redis/metrics | GET | Current metrics snapshot |
| /api/swarm/status | GET | Current swarm coordination status |

**CLI Monitoring Commands:**
```bash
# Monitor feedback
./scripts/monitor-swarm-redis.sh feedback

# Monitor CFN Loop
./scripts/monitor-swarm-redis.sh coordination

# Realtime dashboard launch
npx claude-flow-novice dashboard --port 3001
```

**Post-Spawn Validation:**
```bash
# Validate CLI agent
node config/hooks/post-spawn-validation.js coder-1

# Validate Task agent
node config/hooks/post-spawn-validation.js task_abc123 --coordinator-id coordinator-cfn
```

**WebSocket Event Types:**
- `swarm:coordination`
- `agent:feedback`
- `system:metrics`
- `dashboard:status`

---

## 7) Commands & Setup

**Swarm Execution:**
```bash
npx claude-flow-novice swarm "Create REST API" --strategy development --max-agents 3
redis-cli publish "swarm:coordination" '{"agent":"id","status":"message"}'
```

**CFN Loop Commands:**
```bash
/cfn-loop "Task" --mode=mvp|standard|enterprise
/cfn-loop-sprints "Phase" --sprints=3
/cfn-loop-epic "Epic" --phases=4
```

---

## 8) SQLite Memory System

**5-Level ACL:**

| Level | Scope | Encryption | Loop Use |
|-------|-------|------------|----------|
| 1 | Agent | AES-256 | Loop 3 |
| 2 | Team | AES-256 | Team sync |
| 3 | Swarm | None | Loop 2 |
| 4 | Project | None | Loop 4 |
| 5 | System | Master key | Audit |

**Agent Usage:**
```javascript
const memory = new SQLiteMemorySystem({ swarmId, agentId, dbPath });
await memory.initialize();
await memory.memoryAdapter.set(key, value, { agentId, aclLevel, namespace });
const data = await memory.memoryAdapter.get(key, { agentId });
```

**Architecture**: Redis (hot, 1h TTL) + SQLite (persistent, 30-365d)
**Performance**: Write <60ms, Read <5ms (Redis) / <20ms (SQLite)

**→ Detailed commands: `readme/additional-commands.md` Section "SQLite Memory & ACL Commands"**

---

## 8) Output & Telemetry (Concise)

**Agent confidence JSON (per agent)**
```json
{ "agent": "coder-1", "confidence": 0.85, "reasoning": "tests pass; security clean", "blockers": [] }
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
# Initialize and execute swarms
npx claude-flow-novice swarm "Objective description" --strategy development --max-agents 5
npx claude-flow-novice swarm "Research cloud patterns" --strategy research

# Monitor swarm status
claude-flow-novice swarm status
claude-flow-novice metrics --format=json
```

### Development Workflows
```bash
# Execute CFN Loop
/cfn-loop "Implement authentication system" --phase=auth --mode=standard
/cfn-loop "Build MVP prototype" --mode=mvp
/cfn-loop "Production API" --mode=enterprise

# Epic and sprint orchestration
/cfn-loop-sprints "E-commerce platform" --sprints=3 --mode=enterprise
/cfn-loop-epic "User management system" --phases=4 --mode=standard
```

---

For specialized commands (fullstack development, SPARC methodology, fleet management, event bus, compliance, performance, markdown validation, utilities, metrics reporting, WASM optimization, build/deployment, neural operations, GitHub integration, workflow automation, security/monitoring, debugging, and SDK integration), see `readme/additional-commands.md`.