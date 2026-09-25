# Claude Code Skills Implementation Plan

**Epic:** Claude Code Skills Integration for Multi-Agent Coordination
**Status:** Not Started
**Priority:** High
**Estimated Duration:** 3 weeks
**Owner:** Core Platform Team

---

## Executive Summary

Integrate Claude Code Skills to reduce context usage by 30-40% and enable autonomous agent coordination through progressive disclosure of Redis patterns, CFN loop workflows, SQLite memory access, and post-edit hook integration.

**Strategic Value:**
- **Context Efficiency**: Skills load coordination patterns only when needed (progressive disclosure)
- **Consistency**: Redis/CFN/ACL rules encoded in skills → eliminates prompt drift
- **Autonomy**: Claude selects skills automatically → reduces coordination questions
- **Maintainability**: Update skill once → all agents get latest patterns
- **Shareability**: Skills version-controlled → team consistency

---

## Architecture Alignment

| System Component | Skills Capability | Integration Status |
|------------------|-------------------|-------------------|
| **Redis Coordination (LPUSH/BLPOP)** | ✅ Execute Bash scripts | **Perfect Fit** |
| **CFN Loop (3-loop validation)** | ✅ Task tool invocation | **Perfect Fit** |
| **SQLite Memory (5-level ACL)** | ✅ Database access | **Perfect Fit** |
| **Agent Spawning (coordinator-hybrid)** | ✅ CLI invocation | **Perfect Fit** |
| **Hook Pipeline (post-edit)** | ✅ Script execution | **Perfect Fit** |

---

## Three-Phase Implementation

### **Phase 1: Core Coordination Skills (Week 1)**
**Goal:** Eliminate repetitive Redis coordination and agent spawning explanations

**Deliverables:**
1. Redis Coordination Skill (hierarchical + mesh patterns)
2. Agent Spawning Skill (CLI wrapper with --agents flag)
3. CFN Loop Validation Skill (consensus threshold automation)

**Success Metrics:**
- 30% reduction in coordination-related prompts
- 100% autonomous Redis pattern selection
- Zero manual threshold checks in CFN loops

---

### **Phase 2: Memory & Hooks Integration (Week 2)**
**Goal:** Enable persistent state and automated quality gates

**Deliverables:**
1. SQLite Memory Access Skill (5-level ACL queries)
2. Hook Pipeline Skill (post-edit automation + ROOT_WARNING handling)
3. Test Execution Skill (coordinator pattern: run once, cache results)

**Success Metrics:**
- Agents persist state across sessions autonomously
- 100% ROOT_WARNING auto-resolution
- Zero concurrent test execution conflicts

---

### **Phase 3: Testing & Refinement (Week 3)**
**Goal:** Validate autonomous decision-making and optimize skill descriptions

**Deliverables:**
1. Skill invocation analytics dashboard
2. Prompt token reduction report
3. Autonomous coordination accuracy analysis
4. Skill description refinements based on usage data

**Success Metrics:**
- 40% overall context reduction
- 95%+ skill invocation accuracy
- <5% manual coordination overrides

---

## Skill Specifications

### 1. Redis Coordination Skill

**Location:** `.claude/skills/redis-coordination/`

**SKILL.md Structure:**
```yaml
---
name: Redis Agent Coordination
description: Coordinate multi-agent workflows using Redis LPUSH/BLPOP patterns with hierarchical or mesh topologies. Use when spawning 3+ agents with dependencies.
allowed-tools: [Bash, Read, Write]
---

# Redis Agent Coordination Skill

## When to Use
- Multi-agent tasks requiring dependency management
- Sequential workflows (A → B → C)
- Parallel aggregation (A,B,C → D)
- Hierarchical coordinator patterns

## Pattern Selection

### Pattern 1: Simple Chain (2 agents)
**Use when:** Sequential dependencies (A → B)

**Pattern:**
```bash
# Agent A completes, Agent B waits
redis-cli lpush "swarm:task:agentA:done" '{"data":"..."}'
result=$(timeout 300 redis-cli --csv blpop "swarm:task:agentA:done" 0)
```

### Pattern 2: Hierarchical Broadcast (3+ agents, 1:Many)
**Use when:** One agent's output feeds multiple downstream agents

**Pattern:**
```bash
# Coordinator broadcasts to dependents
data=$(redis-cli --csv blpop "swarm:task:researcher:done" 0)
redis-cli lpush "swarm:task:analyzer:inbox" "$data"
redis-cli lpush "swarm:task:architect:inbox" "$data"
```

### Pattern 3: Mesh Hybrid (2-5 agents, Many:1)
**Use when:** Multiple agents complete independently, one aggregates

**Pattern:**
```bash
# Hybrid LPUSH+SET for multiple readers
redis-cli lpush "swarm:task:agentA:done" '{"data":"..."}'  # First consumer
redis-cli set "swarm:task:agentA:result" '{"data":"..."}'   # Additional readers
redis-cli expire "swarm:task:agentA:result" 3600
```

### Pattern 4: Waiting Mode + Coordinator Wake-Up (NEW)
**Use when:** CFN Loop iterations, incomplete work recovery, agent clarifications

**Critical Benefits:**
- **Zero token cost while waiting** (agents blocked in BLPOP, no API calls)
- **Context preservation** (agents maintain ALL state across wake cycles)
- **CFN Loop native** (10+ agents can cycle through iterations indefinitely)
- **Instant wake-up** (<100ms latency)

**Pattern:**
```bash
# Step 1: Agent enters waiting mode (infinite timeout)
redis-cli lpush "swarm:task:agent-coder:ready" '{"status":"waiting","context":"iteration-1"}'
wake_signal=$(redis-cli --csv blpop "swarm:task:agent-coder:wake" 0)
# Agent maintains ALL context while blocked - NO token usage

# Step 2: Coordinator wakes agent when needed
redis-cli lpush "swarm:task:agent-coder:wake" '{
  "reason": "cfn_loop_iteration",
  "iteration": 2,
  "feedback": ["Add error handling", "Increase coverage"]
}'

# Step 3: Agent processes, returns to waiting
# Work done...
redis-cli lpush "swarm:task:agent-coder:ready" '{"status":"waiting","context":"iteration-2"}'
redis-cli --csv blpop "swarm:task:agent-coder:wake" 0  # Wait again
```

**CFN Loop Use Case:**
```bash
# Spawn 4 validators in waiting mode
for i in {1..4}; do
  Task("validator-$i", "Enter waiting mode, validate on wake", "reviewer")
done

# Iteration 1: consensus 0.78 < 0.90
# Wake same validators for iteration 2 (context preserved!)
for i in {1..4}; do
  redis-cli lpush "swarm:cfn:validator-$i:wake" '{
    "iteration": 2,
    "previous_consensus": 0.78,
    "feedback": "Improve validation criteria"
  }'
done

# Iteration 2: consensus 0.92 >= 0.90 ✅ PROCEED
```

## Timeout Handling
```bash
# Always use timeout for blocking operations
timeout 300 redis-cli --csv blpop "swarm:task:agent:complete" 0
if [ $? -eq 124 ]; then
  echo "TIMEOUT: Agent did not complete within 5 minutes"
  redis-cli lpush "swarm:task:coordinator:error" '{"agent":"X","error":"timeout"}'
fi
```

## Channel Naming Convention
```
swarm:{task-id}:{agent-role}:{event-type}

Examples:
- swarm:auth:researcher:complete
- swarm:auth:coder:progress
- swarm:auth:validator:result
```
```

**Supporting Files:**
- `examples/hierarchical-pattern.sh` (reusable coordinator template)
- `examples/mesh-pattern.sh` (reusable peer-to-peer template)
- `examples/timeout-handling.sh` (error recovery patterns)
- `examples/waiting-mode-pattern.sh` (CFN Loop + wake-up demonstrations)

---

### 2. CFN Loop Validation Skill

**Location:** `.claude/skills/cfn-loop-validation/`

**SKILL.md Structure:**
```yaml
---
name: CFN Loop Consensus Builder
description: Execute 3-loop CFN validation with automatic retry until consensus threshold reached. Use for quality gates requiring validator approval (code review, security, architecture).
allowed-tools: [Bash, Task, TodoWrite]
---

# CFN Loop Consensus Builder

## Mode Selection (Automatic)

| Mode | Gate | Consensus | Validators | Use Case |
|------|------|-----------|------------|----------|
| **MVP** | ≥0.65 | ≥0.85 | 2 | Prototypes, MVPs |
| **Standard** | ≥0.75 | ≥0.90 | 4 | Production features |
| **Enterprise** | ≥0.85 | ≥0.95 | 5 | Critical infrastructure |

## Execution Pattern

```bash
#!/bin/bash
# Auto-retry until consensus reached

PHASE_ID="$1"
MODE="${2:-standard}"  # Default: standard
MAX_ITERATIONS=10

# Load thresholds based on mode
case "$MODE" in
  mvp)
    GATE_THRESHOLD=0.65
    CONSENSUS_THRESHOLD=0.85
    NUM_VALIDATORS=2
    ;;
  standard)
    GATE_THRESHOLD=0.75
    CONSENSUS_THRESHOLD=0.90
    NUM_VALIDATORS=4
    ;;
  enterprise)
    GATE_THRESHOLD=0.85
    CONSENSUS_THRESHOLD=0.95
    NUM_VALIDATORS=5
    ;;
esac

iteration=1
consensus=0

while [ $(echo "$consensus < $CONSENSUS_THRESHOLD" | bc) -eq 1 ] && [ $iteration -le $MAX_ITERATIONS ]; do
  echo "CFN Loop Iteration $iteration (Consensus: $consensus, Target: $CONSENSUS_THRESHOLD)"

  # Spawn validators in parallel (Task tool)
  # (Claude spawns validators based on NUM_VALIDATORS)

  # Aggregate consensus from Redis
  consensus=$(redis-cli get "cfn:$PHASE_ID:iteration:$iteration:consensus")

  iteration=$((iteration + 1))
done

if [ $(echo "$consensus >= $CONSENSUS_THRESHOLD" | bc) -eq 1 ]; then
  echo "✅ Consensus achieved: $consensus"
  exit 0
else
  echo "❌ Max iterations reached. Consensus: $consensus"
  exit 1
fi
```

## Memory Integration

Store feedback in SQLite for evidence chain:
```bash
sqlite3 .artifacts/cfn-loop-memory.db <<EOF
INSERT INTO feedback (phase_id, iteration, consensus, stored_at)
VALUES ('$PHASE_ID', $iteration, $consensus, $(date +%s));
EOF
```

## Automatic Relaunch Logic

**When to relaunch:**
- Consensus < threshold AND iterations < max
- No manual permission required

**When to escalate:**
- Max iterations reached without consensus
- Critical blocker reported by validator
```

**Supporting Files:**
- `consensus-calculator.js` (aggregate validator scores)
- `evidence-chain.sql` (SQLite schema for feedback storage)

---

### 3. Agent Spawning Skill

**Location:** `.claude/skills/agent-spawning/`

**SKILL.md Structure:**
```yaml
---
name: Multi-Agent CLI Spawner
description: Spawn typed agents via CLI with cost-optimized coordination ($0 coordinator + $0.50 workers). Use coordinator-hybrid for all multi-agent work with explicit --agents flag.
allowed-tools: [Bash, Read]
---

# Multi-Agent CLI Spawner

## CLI Pattern (Required)

```bash
# ✅ CORRECT: Explicit typed agents
node src/cli/hybrid-routing/spawn-workers.js \
  "Task description" \
  --agents=analyst,architect,coder \
  --provider zai

# ❌ WRONG: Missing --agents flag (will error)
node src/cli/hybrid-routing/spawn-workers.js "Task" --max-agents 3
```

## Agent Type Selection

**Available Types:** (Read from `AVAILABLE-AGENTS.md`)
- `analyst` - Code analysis, research
- `architect` - System design, architecture
- `coder` - Implementation, coding
- `tester` - Test writing, validation
- `reviewer` - Code review, quality
- `security-specialist` - Security audit
- `coordinator-hybrid` - Multi-agent coordination

## Topology Selection

| Scenario | Agents | Topology | Coordinator |
|----------|--------|----------|-------------|
| Research task | 2-3 | Mesh | ❌ No |
| Feature implementation | 3-5 | Hierarchical | ✅ coordinator-hybrid |
| Security audit | 5+ | Hierarchical | ✅ coordinator-hybrid |

## Redis Integration

Spawned agents auto-coordinate via Redis:
```bash
# Agent A completes work
redis-cli lpush "swarm:task:agentA:done" '{"result":"..."}'

# Agent B waits for Agent A
result=$(timeout 300 redis-cli --csv blpop "swarm:task:agentA:done" 0)
```

## Cost Optimization

- **CLI Mode**: $0 coordinator + $0.50/worker
- **Task Mode**: $0.50 coordinator + $0.50/worker
- **Use CLI for cost savings when possible**
```

**Supporting Files:**
- `spawn-templates.sh` (reusable CLI invocation patterns)
- `agent-selection-guide.md` (when to use which agents)

---

### 4. SQLite Memory Access Skill

**Location:** `.claude/skills/sqlite-memory/`

**SKILL.md Structure:**
```yaml
---
name: SQLite Memory Manager
description: Read/write to SQLite memory system with 5-level ACL enforcement. Use for persistent agent state, evidence chains, and cross-session context.
allowed-tools: [Bash, Read]
---

# SQLite Memory Manager

## ACL Levels

| Level | Scope | Encryption | Use Case |
|-------|-------|------------|----------|
| 1 | Agent | AES-256 | Private agent state (Loop 3) |
| 2 | Team | AES-256 | Team coordination data |
| 3 | Swarm | None | Swarm-wide context (Loop 2) |
| 4 | Project | None | Project knowledge base (Loop 4) |
| 5 | System | Master key | Audit logs |

## Query Patterns

### Read Agent Memory (Level 1)
```bash
sqlite3 .artifacts/swarm-memory.db \
  "SELECT value FROM memory WHERE key='agent/$AGENT_ID/state' AND acl_level=1"
```

### Write Swarm Context (Level 3, TTL 1 hour)
```bash
sqlite3 .artifacts/swarm-memory.db <<EOF
INSERT INTO memory (key, value, acl_level, ttl, created_at)
VALUES (
  'swarm/$SWARM_ID/status',
  '$STATUS',
  3,
  3600,
  $(date +%s)
);
EOF
```

### Query Evidence Chain (Level 4)
```bash
sqlite3 .artifacts/swarm-memory.db \
  "SELECT * FROM memory WHERE key LIKE 'cfn-loop/%/feedback' AND acl_level=4 ORDER BY created_at DESC LIMIT 10"
```

## Redis Integration

Hot cache in Redis (1h TTL), persistent in SQLite (30-365d):
```bash
# Write to Redis first (hot cache)
redis-cli set "memory:$KEY" "$VALUE" EX 3600

# Then persist to SQLite (cold storage)
sqlite3 .artifacts/swarm-memory.db <<EOF
INSERT INTO memory (key, value, acl_level, ttl) VALUES ('$KEY', '$VALUE', 3, 86400);
EOF
```

## TTL Management

| Data Type | Redis TTL | SQLite TTL | Cleanup |
|-----------|-----------|------------|---------|
| Agent state | 1h | 30d | Auto-expire |
| Swarm context | 1h | 90d | Manual review |
| Evidence chain | N/A | 365d | Audit archive |
| Project knowledge | N/A | Permanent | Manual |
```

**Supporting Files:**
- `acl-queries.sql` (pre-built queries by ACL level)
- `ttl-cleanup.sh` (automated TTL expiration script)

---

### 5. Hook Pipeline Skill

**Location:** `.claude/skills/hook-pipeline/`

**SKILL.md Structure:**
```yaml
---
name: Post-Edit Hook Automation
description: Automatically run post-edit hooks after file edits and handle feedback (ROOT_WARNING, TDD_VIOLATION, etc.). Use after every Edit/Write/MultiEdit operation.
allowed-tools: [Bash, Read, Edit]
---

# Post-Edit Hook Automation

## Automatic Execution

**ALWAYS run after:**
- `Edit` tool
- `Write` tool
- `MultiEdit` tool

**Pattern:**
```bash
# After editing file
node config/hooks/post-edit-pipeline.js "$FILE_PATH" \
  --memory-key "swarm/$AGENT_ID/$STEP"
```

## Feedback Types (Priority Order)

| Type | Severity | Auto-Resolution | Manual Escalation |
|------|----------|-----------------|-------------------|
| `ROOT_WARNING` | High | ✅ Move file to suggested location | No |
| `TDD_VIOLATION` | High | ⚠️ Prompt to write tests | Yes (if blocked) |
| `LOW_COVERAGE` | Medium | ⚠️ Prompt to add tests | Yes (if <threshold) |
| `RUST_QUALITY` | Medium | ✅ Auto-fix with rustfmt/clippy | No |
| `LINT_ISSUES` | Low | ✅ Auto-fix with eslint | No |

## ROOT_WARNING Handling (Auto-Resolution)

```bash
# 1. Check hook output log
LAST_LOG=$(tail -1 .artifacts/logs/post-edit-pipeline.log)
STATUS=$(echo "$LAST_LOG" | jq -r '.status')

if [ "$STATUS" = "ROOT_WARNING" ]; then
  # 2. Extract suggested location
  SUGGESTED=$(echo "$LAST_LOG" | jq -r '.rootWarning.suggestions[0].location')

  # 3. Move file automatically
  mv "$FILE_PATH" "$SUGGESTED"
  echo "✅ Moved $FILE_PATH → $SUGGESTED (ROOT_WARNING resolved)"
fi
```

## TDD_VIOLATION Handling (Semi-Auto)

```bash
if [ "$STATUS" = "TDD_VIOLATION" ]; then
  echo "⚠️ TDD_VIOLATION: Tests required before continuing"
  echo "Write tests for: $FILE_PATH"

  # Spawn tester agent to write tests
  # (Use Task tool or CLI spawning)
fi
```

## Redis Feedback Integration (CLI Mode)

CLI-spawned agents receive feedback via Redis:
```bash
# Subscribe to agent feedback channel
redis-cli --csv blpop "agent:$AGENT_ID:feedback" 0

# Feedback structure:
{
  "type": "ROOT_WARNING",
  "severity": "high",
  "file": "/path/to/file",
  "suggestions": [...]
}
```
```

**Supporting Files:**
- `post-edit-handler.sh` (reusable hook invocation)
- `feedback-resolver.sh` (auto-resolution logic for each feedback type)

---

### 6. Test Execution Skill

**Location:** `.claude/skills/test-execution/`

**SKILL.md Structure:**
```yaml
---
name: Safe Test Execution
description: Coordinator-pattern test execution to prevent concurrent runs. Coordinator runs tests ONCE before spawning workers; workers read cached results only.
allowed-tools: [Bash, Read]
---

# Safe Test Execution

## Coordinator Pattern (Required)

**Problem:** Concurrent test runs cause conflicts and failures.

**Solution:** Coordinator runs tests ONCE; workers read cached results.

## Execution Steps

### Step 1: Coordinator Terminates Existing Tests
```bash
# Kill any existing test processes
pkill -f vitest
pkill -f "npm test"
```

### Step 2: Coordinator Runs Tests (Once)
```bash
# Run tests and cache results
npm test -- --run --reporter=json > test-results.json 2>&1
```

### Step 3: Workers Read Cached Results (No Execution)
```bash
# Workers ONLY read test-results.json
cat test-results.json | jq '.numPassedTests, .numFailedTests'
```

### Step 4: Cleanup After All Work Complete
```bash
# Coordinator cleans up after all agents done
pkill -f vitest
pkill -f "npm test"
rm -f test-results.json
```

## Redis Coordination

Coordinator signals test completion:
```bash
# Coordinator: Tests complete
redis-cli lpush "swarm:task:tests:complete" '{"status":"done","passed":42,"failed":0}'

# Workers: Wait for test completion
redis-cli --csv blpop "swarm:task:tests:complete" 0
# Then read test-results.json
```

## Anti-Patterns (DO NOT DO)

❌ **Workers running tests directly**
```bash
# WRONG - causes concurrent test conflicts
npm test  # In worker agent
```

✅ **Workers reading cached results**
```bash
# CORRECT - read coordinator's cached results
cat test-results.json
```
```

**Supporting Files:**
- `test-coordinator-pattern.sh` (reusable coordinator template)
- `test-cache-reader.sh` (worker result parsing)

---

## File Structure

```
.claude/skills/
├── redis-coordination/
│   ├── SKILL.md
│   └── examples/
│       ├── hierarchical-pattern.sh
│       ├── mesh-pattern.sh
│       ├── timeout-handling.sh
│       └── waiting-mode-pattern.sh
├── cfn-loop-validation/
│   ├── SKILL.md
│   ├── consensus-calculator.js
│   └── evidence-chain.sql
├── agent-spawning/
│   ├── SKILL.md
│   ├── spawn-templates.sh
│   └── agent-selection-guide.md
├── sqlite-memory/
│   ├── SKILL.md
│   ├── acl-queries.sql
│   └── ttl-cleanup.sh
├── hook-pipeline/
│   ├── SKILL.md
│   ├── post-edit-handler.sh
│   └── feedback-resolver.sh
└── test-execution/
    ├── SKILL.md
    ├── test-coordinator-pattern.sh
    └── test-cache-reader.sh
```

---

## Success Metrics

### Phase 1 (Week 1)
- **Context Reduction**: 30% reduction in coordination-related prompts
- **Autonomous Selection**: 100% Redis pattern selection without manual intervention
- **Threshold Automation**: Zero manual CFN consensus checks

### Phase 2 (Week 2)
- **State Persistence**: Agents persist state autonomously across sessions
- **ROOT_WARNING Resolution**: 100% auto-resolution rate
- **Test Conflicts**: Zero concurrent test execution conflicts

### Phase 3 (Week 3)
- **Overall Context Reduction**: 40% reduction in total prompt tokens
- **Invocation Accuracy**: 95%+ skill invocation correctness
- **Manual Overrides**: <5% coordination requiring manual intervention

---

## Validation Criteria

### Skill Quality Gates
1. **Description Clarity**: Claude selects skill correctly in 95%+ of scenarios
2. **Example Completeness**: All supporting files referenced in SKILL.md exist
3. **Tool Permissions**: `allowed-tools` field accurately reflects skill requirements
4. **Progressive Disclosure**: SKILL.md ≤500 lines; detailed logic in supporting files

### Integration Gates
1. **Redis Patterns**: All skills use LPUSH/BLPOP correctly (not pub/sub)
2. **CFN Thresholds**: Mode-dependent thresholds encoded in skills
3. **ACL Enforcement**: SQLite queries respect 5-level ACL model
4. **Hook Execution**: Post-edit hooks run automatically after edits

---

## Rollback Plan

If skills cause >10% accuracy degradation:
1. **Immediate**: Disable skills via `.claude/skills/.disabled` flag
2. **Investigate**: Review skill invocation logs for mismatches
3. **Refine**: Update skill descriptions based on failure patterns
4. **Re-enable**: Gradual rollout per skill (not all at once)

---

## Migration Path

### Week 1: Parallel Operation
- Skills available but not required
- Manual coordination still documented in prompts
- Monitor skill invocation logs

### Week 2: Skills-First
- Prompts reference skills ("Use Redis Coordination Skill")
- Manual coordination deprecated but supported
- Measure token reduction

### Week 3: Skills-Only
- Manual coordination removed from prompts
- CLAUDE.md references skills exclusively
- Full context optimization achieved

---

## Maintenance Plan

### Monthly Review
- Analyze skill invocation logs
- Identify missing patterns (add to backlog)
- Update skill descriptions based on usage

### Quarterly Audit
- Validate skill accuracy (≥95% target)
- Review context reduction metrics (≥40% target)
- Archive outdated patterns

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Skills selected incorrectly | Medium | High | Iterative description refinement |
| Context usage increases | Low | High | Rollback plan + parallel operation |
| Redis patterns outdated | Low | Medium | Monthly skill review process |
| ACL violations | Low | High | SQLite query validation in skill tests |

---

## Related Documentation

- `CLAUDE.md` - Main coordination rules (references skills)
- `.claude/redis-agent-dependencies.md` - Redis coordination patterns (source material)
- `.claude/cfn-loop-rules.md` - CFN loop thresholds (source material)
- `planning/skills/epic-config.json` - Epic configuration for tracking

---

## Version History

- **2025-10-18**: Initial implementation plan created
- Three-phase rollout: Core Coordination → Memory/Hooks → Testing
- Success metrics: 40% context reduction, 95% accuracy, <5% manual overrides
