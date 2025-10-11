# 🛡️ NPX-Protected CLAUDE.md Content

## 📋 Merge Instructions

This file was generated because you have an existing CLAUDE.md file.
To protect your customizations from being overwritten by NPX installs,
the new content is provided here for manual review and merging.

### 🔄 How to Merge:
1. Review the content below
2. Copy sections you want to your main CLAUDE.md
3. Delete this file when done
4. Your customizations remain safe!

---

# Generated CLAUDE.md Content


# Claude Flow Novice — AI Agent Orchestration

---

## 1) Critical Rules (Single Source of Truth)

* **Use agents for all non-trivial work** (≥4 steps or any multi-file / research / testing / architecture / security / integration / refactor / feature).
* **Initialize swarm before any multi-agent work.**
* **Batch operations**: one message per related batch (spawn, file edits, bash, todos, memory ops).
* **Run post-edit hook after every file edit.**
* **Never work solo** on multi-step tasks. Spawn parallel specialists.
* **Never mix implementers and validators in the same message.**
* **Never run tests inside agents.** Execute once; agents read results.
* **Never save to project root.** Use proper subdirs.
* **No guides/summaries/reports** unless explicitly asked.
* **Use spartan language.**
* **Redis persistence enables swarm recovery** - swarm state survives interruptions.
* **ALL agent communication MUST use Redis pub/sub** - no direct file coordination.

**Consensus thresholds**

* Gate (agent self-confidence): **≥0.75 each**
* Validators consensus: **≥0.90**

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

**Useful flags (optional)**: `--tdd-mode` • `--minimum-coverage 80..90` • `--rust-strict`

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
Loop 0: Epic/Sprint orchestration (multi-phase) → no iteration limit
Loop 1: Phase execution (sequential phases) → no limit
Loop 2: Consensus validation (team of 2-4 validators) → max 10/phase; exit at ≥0.90
Loop 3: Primary swarm implementation → max 10/subtask; exit when all ≥0.75
Loop 4: Product Owner decision gate (GOAP) → PROCEED / DEFER / ESCALATE

Flow

Loop 3 implementers produce output + self-confidence scores.
Can use up to 7 agents in mesh, if > 7 agents needed, use coordinators in mesh with teams under them in hierarchical. Can use up to 50 agents under a coordinator

Gate: if all ≥0.75, go to Loop 2; else retry Loop 3 with targeted/different agents.

Loop 2 validator team of 2-4 agents run; refer recommendations to product owner for decisions

**🎯 CRITICAL:** Loop 4 Product Owner runs autonomous GOAP decision:

After consensus validation, Product Owner agent makes autonomous PROCEED/DEFER/ESCALATE decision:

PROCEED: Relaunch Loop 3 with targeted fixes or move to next sprint

DEFER: Approve work, backlog out-of-scope issues. launch swarms for next steps

ESCALATE: Critical ambiguity → human review.

Auto-transition phases when complete by rereading the root claude.md file and launching a swarm for next steps. No permission prompts.

### CFN Loop Coordination Example

**Event Bus Coordination (Critical Rule #19 - Mandatory Redis pub/sub):**
```bash
# Loop 3 Start: Publish phase transition event
/eventbus publish --type cfn.loop.phase.start --data '{"loop":3,"phase":"auth","swarmId":"cfn-phase-auth"}' --priority 9

# Agent spawned: Publish lifecycle event
/eventbus publish --type agent.lifecycle --data '{"agent":"coder-1","status":"spawned","loop":3}' --priority 8

# Agent completion: Publish confidence score
/eventbus publish --type agent.complete --data '{"agent":"coder-1","confidence":0.85,"loop":3}' --priority 8

# Loop 2 Start: Publish validation event
/eventbus publish --type cfn.loop.validation.start --data '{"loop":2,"validators":["reviewer-1","security-1"]}' --priority 9

# Subscribe to all CFN Loop events for coordination
/eventbus subscribe --pattern "cfn.loop.*" --handler cfn-coordinator --batch-size 50
```

**Memory Persistence Across Loops:**
```bash
# Loop 3: Store implementation results in SQLite with ACL
/sqlite-memory store --key "cfn/phase-auth/loop3/results" --level project --data '{"confidence":0.85,"files":["auth.js"]}'

# Loop 2: Validators read Loop 3 results
/sqlite-memory retrieve --key "cfn/phase-auth/loop3/results" --level project

# Loop 4: Product Owner reads all loop data for decision
/sqlite-memory retrieve --key "cfn/phase-auth/*" --level project

# Redis state for active coordination
redis-cli setex "cfn:phase-auth:state" 3600 '{"loop":3,"agents":5,"confidence":0.85}'
```

**Git Commit After Each Completion:**
```bash
# After Loop 3 completes (all agents ≥0.75)
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 3 - Authentication Phase

Loop 3 Implementation Results:
- Confidence: 0.85 (target: ≥0.75) ✅
- Agents: coder-1, coder-2, security-1
- Files: auth.js, auth.test.js, auth-middleware.js

Ready for Loop 2 validation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# After Loop 2 validation completes (consensus ≥0.90)
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 2 - Validation Phase

Loop 2 Validation Results:
- Consensus: 0.92 (target: ≥0.90) ✅
- Validators: reviewer-1, security-1
- Issues: None
- Recommendations: Add rate limiting (deferred to backlog)

Ready for Loop 4 Product Owner decision

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# After Loop 4 Product Owner decision (PROCEED/DEFER)
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Phase - Authentication System

Loop 4 Product Owner Decision: DEFER ✅
- Phase: Authentication System COMPLETE
- Overall Confidence: 0.92
- Status: Production ready, backlog created for enhancements

Next: Auto-transition to next phase

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# After Sprint completes (multiple phases done)
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Sprint 1 - User Management

Sprint Summary:
- Phases Completed: Auth (0.92), Profile (0.88), Permissions (0.91)
- Total Agents: 15
- Sprint Confidence: 0.90
- Status: All phases validated and production ready

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# After Epic completes (all sprints done)
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Epic - E-commerce Platform v1.0

Epic Summary:
- Sprints: User Management (0.90), Product Catalog (0.89), Checkout (0.92)
- Total Phases: 12
- Epic Confidence: 0.90
- Status: Platform launch ready

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Complete CFN Loop Flow with Coordination:**
1. **Loop 3**: Agents coordinate via event bus, store results in SQLite → Commit on completion (≥0.75)
2. **Loop 2**: Validators read Loop 3 memory, validate, publish consensus → Commit on validation (≥0.90)
3. **Loop 4**: Product Owner reads all memory, makes GOAP decision → Commit on decision
4. **Phase Complete**: Commit phase summary with all metrics
5. **Sprint Complete**: Commit sprint summary with all phase results
6. **Epic Complete**: Commit epic summary with all sprint results

### CFN Loop Enterprise Commands

**Enterprise Fleet Management in CFN Loop:**
```bash
# Initialize fleet for CFN Loop phase (1000+ agents)
/fleet init --max-agents 1500 --efficiency-target 0.40 --regions us-east-1,eu-west-1

# Scale fleet during complex CFN phases
/fleet scale --fleet-id cfn-fleet-phase3 --target-size 2000 --strategy predictive

# Optimize resources for CFN Loop efficiency
/fleet optimize --fleet-id cfn-fleet-phase3 --efficiency-target 0.45
```

**Event Bus Coordination for CFN Loop:**
```bash
# Initialize event bus for CFN Loop messaging (10,000+ events/sec)
/eventbus init --throughput-target 10000 --worker-threads 4

# CFN Loop event publishing
/eventbus publish --type cfn.loop.phase --data '{"phase":3,"status":"in-progress"}' --priority 8

# CFN Loop event subscriptions
/eventbus subscribe --pattern "cfn.loop.*" --handler cfn-loop-coordinator
```

**Compliance Validation in CFN Loop:**
```bash
# Validate compliance for CFN Loop deliverables
/compliance validate --standard GDPR --scope data-privacy,audit-trail --detailed

# Generate compliance reports for CFN Loop phases
/compliance audit --period phase --format pdf --include-recommendations
```

**Performance Monitoring in CFN Loop:**
```bash
# Monitor CFN Loop performance metrics
/performance analyze --component cfn-loop --timeframe phase

# WASM optimization for CFN Loop tasks
/wasm optimize --code "./cfn-loop-implementation.js" --target 40x

# Error recovery for CFN Loop failures
claude-flow-novice recovery:status --effectiveness-target 0.90
```

**Dashboard Visualization for CFN Loop:**
```bash
# CFN Loop progress dashboard
/dashboard insights --fleet-id cfn-fleet-phase3 --timeframe phase

# Real-time CFN Loop monitoring
/dashboard monitor --fleet-id cfn-fleet-phase3 --alerts cfn-loop
```

Retry Templates

Loop 3 retry (low confidence): replace failing agents with specialists; add missing roles (security/perf).
Loop 2 retry (consensus <0.90): target validator issues (e.g., fix SQLi, raise coverage) and refer recommendations to product owner for improvements

Stop only if: dual iteration limits reached, critical security/compilation error, or explicit STOP/PAUSE.

---

## 5) Coordination Checklist (Before / During / After)

**Before**: assess complexity → set agent count/types → choose topology → prepare single spawn message → unique non-overlapping instructions.

**During**: coordinate via SwarmMemory → post-edit hook after every edit → self-validate and report confidence.

**After**: achieve ≥0.90 validator consensus → store results → auto next steps.

---

## 6) Prohibited Patterns

* Implementers + validators in same message.
* Tests inside agents; multiple concurrent test runs.
* Solo work on multi-step tasks.
* Asking permission to retry/advance when criteria/iterations allow.
* Saving to root.
* Creating guides/summaries/reports unless asked.
* Agent coordination without Redis pub/sub messaging.

---

## 7) Agent Selection Cheatsheet

* **Core**: coder • tester • reviewer
* **Backend**: backend-dev • api-docs • system-architect
* **Frontend/Mobile**: coder (specialized) • mobile-dev
* **Quality**: tester • reviewer • security-specialist • perf-analyzer
* **Planning/Ops**: researcher • planner • architect • devops-engineer • cicd-engineer
* **Docs**: api-docs • researcher

Pick roles for actual needs (no generic redundancy).

---

## 8) Commands & Setup

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

**Essentials**

* `npx claude-flow-novice status` — health
* `npx claude-flow-novice --help` — commands
* `/fullstack "goal"` — full-stack team + consensus
* `/swarm`, `/sparc`, `/hooks` — autodiscovered
* Redis persistence provides automatic recovery

**File organization**: never save working files to root.

---

## 9) Output & Telemetry (Concise)

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

## 10) CLI Command Reference (Agent Commands)

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
/cfn-loop "Implement authentication system" --phase=auth --max-loop2=10
/cfn-loop-sprints "E-commerce platform" --sprints=3 --max-loop2=5
/cfn-loop-epic "User management system" --phases=4

# SPARC methodology phases for systematic specification, architecture, refinement, and completion workflows
/sparc analysis "Database performance issues"
/sparc design "Microservices architecture"
/sparc refine "API optimization"
```

### Fleet Management (Enterprise Scale)

```bash
# Initialize enterprise fleet manager for coordinating 1000+ agents with predictive scaling algorithms
/fleet init --max-agents 1500 --regions us-east-1,eu-west-1 --efficiency-target 0.40

# Auto-scale fleet size dynamically based on workload patterns and efficiency targets
/fleet scale --fleet-id fleet-123 --target-size 2000 --strategy predictive

# Optimize resource allocation across fleet with cost reduction and performance balancing algorithms
/fleet optimize --fleet-id fleet-123 --efficiency-target 0.45 --cost-optimization

# Deploy fleet across multiple regions with automatic failover and geographic load balancing
/fleet regions --fleet-id fleet-123 --regions us-east-1,eu-west-1,ap-southeast-1 --failover

# Monitor fleet health with deep inspection of agent states and coordination metrics
/fleet health --fleet-id fleet-123 --deep-check

# Retrieve detailed performance metrics for fleet analysis and optimization decision making
/fleet metrics --fleet-id fleet-123 --timeframe 24h --detailed
```

### Event Bus Management (10,000+ events/sec)

```bash
# Initialize high-throughput event bus implementing mandatory Redis pub/sub coordination (Critical Rule #19)
/eventbus init --throughput-target 10000 --latency-target 50 --worker-threads 4

# Publish agent lifecycle and coordination events with weighted routing for priority handling
/eventbus publish --type agent.lifecycle --data '{"agent": "coder-1", "status": "spawned"}' --strategy weighted

# Subscribe to event patterns with batch processing for efficient coordination message handling
/eventbus subscribe --pattern "agent.*" --handler process-agent-events --batch-size 100

# Retrieve event bus throughput and latency metrics for performance monitoring and tuning
/eventbus metrics --timeframe 1h --detailed

# Monitor real-time event flow with filtering for debugging coordination issues and bottlenecks
/eventbus monitor --filter "agent.*" --format table
```

### Fullstack Development

```bash
# Launch coordinated fullstack team with frontend, backend, and database specialists working in parallel
/fullstack "Build e-commerce platform"
/fullstack:develop "Add user authentication"
/fullstack:status  # Check fullstack swarm coordination status and agent health
/fullstack:terminate  # Clean shutdown of all fullstack agents with state preservation
/fullstack:spawn "backend developer"  # Dynamically add specific agent role to active fullstack swarm
```


### Memory and State Management

```bash
# Validate memory operations for safety and prevent leaks or corruption across agent coordination
/check:memory  # Check memory safety across all active swarms and agent instances
/memory-safety --validate  # Run comprehensive memory validation with leak detection
claude-flow-novice memory list  # List all memory entries organized by namespace and agent
claude-flow-novice memory clear --namespace=swarm

# Persist swarm state to Redis with TTL for recovery and cross-session coordination
redis-cli setex "swarm:state" 3600 "$(cat swarm-state.json)"
redis-cli get "swarm:state" | jq .  # Retrieve and parse swarm state JSON with pretty formatting
redis-cli --scan --pattern "memory:*"  # Scan all memory entries for debugging and cleanup
```


### Utilities and Maintenance

```bash
# Clean up build artifacts, test processes, and development data for fresh environment resets
claude-flow-novice utils:cleanup  # Remove all build artifacts and temporary files
claude-flow-novice clean:test  # Clean test artifacts and cached test results
redis-cli flushall  # Clear all Redis data (development only - destroys all state)
pkill -f vitest; pkill -f "npm test"  # Force terminate hanging test processes


### SQLite Memory Management

```bash
# Initialize SQLite-backed memory with 6-level ACL security (private/agent/swarm/project/team/system)
/sqlite-memory init --database-path ./memory.db --acl-enabled --data-residency eu-west-1

# Configure access control permissions at different security levels for project isolation
/sqlite-memory set-acl --key "project-data" --level project --permissions read,write

# Store and retrieve memory with ACL enforcement providing security layer Redis doesn't offer
/sqlite-memory store --key "sensitive-data" --level system --data '{"encrypted": true}'
/sqlite-memory retrieve --key "project-data" --level project
```

---

## Additional Commands

For specialized commands (compliance, performance optimization, WASM, build/deployment, neural operations, GitHub integration, workflow automation, security/monitoring, debugging, and SDK integration), see `readme/additional-commands.md`.


---

## 🗑️ Cleanup
Delete this file after merging: `rm claude-copy-to-main.md`
