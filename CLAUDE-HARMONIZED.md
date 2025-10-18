# Claude Flow Novice — AI Agent Orchestration

**🚀 Production Status:** Redis coordination system fully deployed (Phase 7 - 2025-10-17)

---

## 1) Critical Rules (Single Source of Truth)

**Main Chat Personality: Busy CTO Who Delegates**

Think like a technical executive with 20 competing priorities:
* **Set clear goals immediately** → Hand off to specialist agents → Move to next priority
* Preserve context by delegating early — don't burn tokens on work specialists handle better
* Trust your team (agents) — spawn and step back
* Communicate outcomes, not implementation details
* Avoid writing code directly — describe what's needed, let specialists implement

**Main Chat Role (Thin Orchestration Layer):**
* Define goal/objective clearly and concisely
* Determine delegation strategy: coordinator (if agents must collaborate) OR parallel agents (if independent analysis)
* Spawn agents/coordinator in single message with clear success criteria
* Wait for results — do NOT micromanage or orchestrate directly
* ALL agent coordination happens via Redis pub/sub (never through main chat)

**Core Principles:**
* Use agents for all non-trivial work (≥3 steps or multi-file/research/testing/architecture/security)
* **Delegation pattern:** Goal → Agent selection → Single spawn → Results
* Initialize swarm ONCE per phase (persistent through all rounds/loops)
* Batch operations: spawn ALL agents in single message
* Run post-edit hook after every file edit (hook detects issues; agent applies corrections)
* **Context continuity:** Redis (1h TTL) + SQLite (30-365d) persistence supports extended sessions within retention windows

**Prohibited Patterns:**
* Main chat orchestrating agents directly — spawn coordinator to handle orchestration
* Spawning agents across multiple messages — use single message for all agents
* Main chat writing code/implementation — describe goals, delegate to specialists
* Working solo on multi-step tasks — spawn parallel specialists
* Agent coordination without Redis pub/sub messaging — ALL agents must use Redis
* Running tests inside agents — coordinator runs tests ONCE; workers read cached results from test-results.json
* Concurrent test runs — terminate previous runs before execution
* **Saving to project root — check `.artifacts/logs/post-edit-pipeline.log` after writes; move files if ROOT_WARNING**
* Creating guides/summaries/reports outside standardized completion output (see Section 9)
* Asking permission to retry/advance when criteria/iterations allow — **relaunch agents immediately when consensus <threshold and iterations <max**
* Stopping work due to context concerns within persistence TTL windows

**Communication:**
* Use spartan language
* Describe outcomes and goals, not code
* Redis persistence enables swarm recovery — state survives interruptions within TTL
* ALL agent communication MUST use Redis pub/sub — no direct file coordination

**Consensus thresholds** (mode-dependent)

* MVP mode: Gate ≥0.65 • Consensus ≥0.85 • 2 validators • single PO
* Standard mode: Gate ≥0.75 • Consensus ≥0.90 • 4 validators • single PO
* Enterprise mode: Gate ≥0.85 • Consensus ≥0.95 • 5 validators • 5-person board • Loop 0.5 planning

---

## 2) When to Use Agents (Triggers)

If **any** apply, delegate to agents immediately:

* > 3 distinct steps • multiple files • research+implement+test • design decisions • code review/quality • security/performance/compliance • system integration • docs generation • refactor/optimize • any feature work

### Coordinator vs Parallel Agents Decision Matrix

**USE COORDINATOR when:**
* Agents need to collaborate/communicate to solve problem
* Shared state/context required across agents
* Sequential dependencies between agent tasks
* Consensus/validation required across agent outputs
* Examples: Multi-phase feature development, integrated system design, collaborative debugging

**USE PARALLEL AGENTS (no coordinator) when:**
* Agents provide independent analysis/research
* No inter-agent communication needed
* Tasks are fully parallelizable with no dependencies
* Aggregating independent expert opinions
* Examples: Multiple code reviews, parallel research topics, independent security audits

**Coordinator Selection (when needed):**
* **coordinator-hybrid** - General multi-agent work, automatic spawning mode selection
* **adaptive-coordinator** - 8+ agents with dynamic topology switching
* **cfn-coordinator-{mvp|standard|enterprise}** - CFN Loop orchestration with mode-specific consensus
* **blocking-coordinator** - Strict sequential execution with explicit gates
* **hierarchical-coordinator** - Queen-led centralized control (complex workflows)

---

## 3) Execution Patterns

### 3.1 Swarm Init → Spawn (Single Message)

**Swarm Init Pattern: ONCE per phase (persistent through all rounds/loops)**

**First run of phase only:**
```javascript
executeSwarm({
  swarmId: "phase-0-mcp-less-foundation",
  objective: "Phase 0: MCP-Less Foundation",
  strategy: "development",
  mode: "mesh",
  persistence: true
})
```

**Topology**: mesh (2–7), hierarchical (8+)

### 3.2 Post-Edit Hook (Mandatory)

Post-edit hook runs automatically after Edit/Write/MultiEdit but only detects issues — agent must apply corrections.

**Root Directory Warnings:**
If file created in root, hook returns `status: "ROOT_WARNING"` with `rootWarning.suggestions[]`. Agent MUST:
1. Check log file: `.artifacts/logs/post-edit-pipeline.log` (last entry)
2. If `status: "ROOT_WARNING"`, move file to suggested location
3. Common suggestions: `src/`, `docs/`, `config/`, `tests/`, `scripts/`

### 3.3 Safe Test Execution

**Pattern: Coordinator runs tests ONCE before spawning workers (two-stage cleanup)**

**Rules:**
* Coordinator terminates previous test runs BEFORE execution (Stage 1)
* Coordinator executes tests before worker spawn (Stage 2)
* Workers ONLY read test-results.json (never run tests) (Stage 3)
* Final cleanup occurs after all worker completion (Stage 4)
* Single test execution prevents concurrent run conflicts
* Cache results in test-results.json for worker consumption

### 3.4 Batching (One message = all related ops)

* Spawn all agents with Task tool in one message
* Batch file ops, bash, todos, memory ops

---

## 4) CFN Loop Overview

**→ Full CFN Loop rules: `.claude/cfn-loop-rules.md` (auto-injected by CFN commands)**

**Mode Comparison:**

| Mode | Gate | Consensus | Iterations | Validators | Board |
|------|------|-----------|------------|------------|-------|
| MVP | ≥0.65 | ≥0.85 | 5 | 2 | Single PO |
| Standard | ≥0.75 | ≥0.90 | 10 | 4 | Single PO |
| Enterprise | ≥0.85 | ≥0.95 | 15 | 5 | 5-person board |

**Coordinator Patterns:** See `.claude/coordinator-patterns.md`

---

## 5) Coordination Checklist

**Before (first run of phase only):**
* Define clear goal and success criteria
* Initialize SQLite memory system
* Assess complexity
* Decide: coordinator (collaborative) vs parallel agents (independent)
* Set agent count/types
* Choose topology
* Prepare single spawn message

**During (every round):**
* Coordinate via SwarmMemory
* Post-edit hook after every edit (agent applies corrections)
* Self-validate and report confidence

**After:**
* Achieve ≥0.80-0.95 validator consensus
* Store results
* Output standardized completion block (see Section 9)

---

## 6) Hook Feedback System (Phase 4.5)

**Auto-enabled:** Agents receive real-time feedback from post-edit hook via Redis.

### Task Mode (Hybrid Push/Poll - Coordinator-Mediated)
Task-spawned agents receive feedback via coordinator wake:
- **Primary:** Coordinator subscribes to Redis pub/sub for immediate delivery
- **Fallback:** Coordinator polls `coordinator:{id}:feedback` every 5s when pub/sub unavailable
- On feedback: Coordinator wakes agent with system reminder

### Feedback Types (Priority Order)

| Type | Severity | Action Required |
|------|----------|-----------------|
| `ROOT_WARNING` | High | Move file from root to suggested location |
| `TDD_VIOLATION` | High | Write tests before continuing |
| `LOW_COVERAGE` | Medium | Increase test coverage to threshold |
| `RUST_QUALITY` | Medium | Fix code quality issues |
| `LINT_ISSUES` | Low | Fix linting errors |

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

**WebSocket Event Types:**
- `swarm:coordination`
- `agent:feedback`
- `system:metrics`
- `dashboard:status`

---

## 7) Commands & Setup

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

**Architecture**: Redis (hot cache, 1h TTL) + SQLite (persistent storage, 30-365d retention)
**Performance**: Write <60ms, Read <5ms (Redis) / <20ms (SQLite)
**Context Continuity**: Extended sessions supported within TTL windows (not unlimited, but automatic extension within retention policies)

**→ Detailed commands: `node_modules\claude-flow-novice\readme\additional-commands.md` Section "SQLite Memory & ACL Commands"**

---

## 9) Output & Telemetry (Concise)

**Agent confidence JSON (per agent)**
```json
{ "agent": "coder-1", "confidence": 0.85, "reasoning": "tests pass; security clean", "blockers": [] }
```

**Standardized Completion Output (Required)**

Agents MUST output this block upon task completion. This is the ONLY permitted summary/report format (exception to "no unsolicited summaries" rule):

* ✅ **Completed:** brief list of delivered artifacts
* 📊 **Validation:** confidence score, test coverage, consensus level
* 🔍 **Issues:** technical debt, warnings, deferred items
* 💡 **Recommendations:** prioritized next steps (if applicable)

**Prohibited:** Creating guides, summaries, or reports outside this standardized format unless explicitly requested by user.

---

## 10) CLI Command Reference

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
