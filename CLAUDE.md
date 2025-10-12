
# Claude Flow Novice — AI Agent Orchestration

---

## 1) Critical Rules (Single Source of Truth)

**Core Principles:**
* Use agents for all non-trivial work (≥4 steps or multi-file/research/testing/architecture/security)
* Initialize swarm before multi-agent work
* Batch operations: one message per related batch (spawn, file edits, bash, todos, memory ops)
* Run post-edit hook after every file edit

**Prohibited Patterns:**
* Working solo on multi-step tasks — spawn parallel specialists
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
* MVP mode: Gate ≥0.70 • Consensus ≥0.80 • 2 validators • single PO
* Enterprise mode: Gate ≥0.75 • Consensus ≥0.95 • 4 validators • 4-person board • Loop 0.5 planning

---

## 2) When Agents Are Mandatory (Triggers)

If **any** apply, spawn agents:

* > 3 distinct steps • multiple files • research+implement+test • design decisions • code review/quality • security/performance/compliance • system integration • docs generation • refactor/optimize • any feature work

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

* Spawn all agents with Task tool in one message.
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

**Detailed Mode Instructions**:
See instruction files for complete spawn patterns, Redis pub/sub coordination, SQLite memory patterns, git commit templates, and retry strategies.
- MVP: `config/cfn-loop/instructions/mvp-instructions.md`
- Standard: `config/cfn-loop/instructions/standard-instructions.md`
- Enterprise: `config/cfn-loop/instructions/enterprise-instructions.md`

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
| **MVP** | Prototypes, MVPs | ≥0.70 | ≥0.80 | 5 | 2 | Single | No |
| **Standard** | General features | ≥0.75 | ≥0.90 | 10 | 4 | Single | No |
| **Enterprise** | Production systems | ≥0.75 | ≥0.95 | 15 | 4 | 4-person board | Yes (≥0.85) |

**Auto-Detection**: Epic parser infers mode from filename patterns (`-mvp`, `-enterprise`)

```bash
/parse-epic ./auth-mvp.json --cfn-mode=auto  # Detects MVP mode
/parse-epic ./platform.json --cfn-mode=enterprise
```

**Mode Storage**: Redis key `cfn:mode:{phaseId}` stores mode for swarm coordination


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
/sqlite-memory store --key "cfn/phase-auth/loop3/results" --level project --data '{"confidence":0.85}'
/sqlite-memory retrieve --key "cfn/phase-auth/*" --level project

# Redis State (Ephemeral) - Active coordination state
redis-cli setex "cfn:phase-auth:state" 3600 '{"loop":3,"agents":5,"confidence":0.85}'
redis-cli get "cfn:phase-auth:state"
```

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

**Before**: assess complexity → set agent count/types → choose topology → prepare single spawn message → unique non-overlapping instructions.

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

## 7) Output & Telemetry (Concise)

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

## 8) CLI Command Reference

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
/sqlite-memory init --database-path ./memory.db --acl-enabled
/sqlite-memory store --key "cfn/phase/loop3" --level project --data '{"confidence":0.85}'
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
