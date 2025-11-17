# Comprehensive Assessment: Information Passed to CLI-Spawned Agents

**Date:** 2025-10-20
**Version:** v2.6.0
**Status:** ✅ Complete Analysis

---

## Executive Summary

CLI-spawned agents (`npx cfn-spawn`) receive information through **three primary channels**:
1. **Command-line arguments** (explicit parameters)
2. **Environment variables** (runtime context)
3. **Redis pub/sub** (shared coordination state)

This assessment analyzes all information flows, compares CLI agents to Task tool agents, identifies gaps, and provides recommendations.

---

## 1. Information Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Chat                                 │
│  (Spawns coordinator via Task tool with full context)       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 Coordinator Agent                            │
│  - Receives epic context in Task() prompt                   │
│  - Stores context in Redis (store-epic-context.sh)          │
│  - Invokes orchestrator script                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Orchestrator Script                             │
│  - orchestrate-cfn-loop.sh                                   │
│  - Spawns agents via CLI: npx cfn-spawn agent <type>        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 cfn-spawn (CLI)                              │
│  - agent-spawn.ts                                            │
│  - Reads Redis context keys                                 │
│  - Injects environment variables                            │
│  - Spawns: npx claude-flow-novice agent <type>              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Agent Process                              │
│  - Receives env vars + CLI args                             │
│  - Can read additional Redis keys                           │
│  - Executes task                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Command-Line Arguments

### Supported Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `<type>` | string | ✅ Yes | Agent type/role | `researcher`, `coder`, `reviewer` |
| `--task-id` | string | ⚠️ Conditional | Unique task identifier | `epic-auth-123` |
| `--iteration` | number | ❌ No | Iteration number (default: 1) | `2` |
| `--context` | string | ❌ No | Brief context description | `"Loop 3 implementation"` |
| `--mode` | string | ❌ No | Execution mode | `cli`, `api`, `hybrid` |
| `--priority` | number | ❌ No | Task priority 1-10 (default: 5) | `8` |
| `--parent-task-id` | string | ❌ No | Parent task reference | `epic-auth-parent` |

### Example Invocation

```bash
npx cfn-spawn agent researcher \
  --task-id "phase-1-1234567890" \
  --iteration 2 \
  --context "Loop 3 implementation" \
  --mode cli \
  --priority 7 \
  --parent-task-id "epic-auth-123"
```

### Source Code Reference

`src/cli/agent-spawn.ts:56-79` - Argument parsing
`src/cli/agent-spawn.ts:100-120` - Argument forwarding to claude-flow-novice

---

## 3. Environment Variables

### 3.1 Basic Execution Context

Automatically injected by `agent-spawn.ts` (lines 164-177):

| Variable | Source | Type | Description | Example Value |
|----------|--------|------|-------------|---------------|
| `AGENT_TYPE` | CLI arg | string | Agent role/type | `"researcher"` |
| `TASK_ID` | CLI arg | string | Task identifier | `"phase-1-1234567890"` |
| `ITERATION` | CLI arg | number | Current iteration | `"2"` |
| `CONTEXT` | CLI arg | string | Short context | `"Loop 3 implementation"` |
| `MODE` | CLI arg | string | Execution mode | `"cli"` |
| `PRIORITY` | CLI arg | number | Task priority | `"7"` |
| `PARENT_TASK_ID` | CLI arg | string | Parent task ID | `"epic-auth-123"` |

### 3.2 Epic-Level Context (NEW - v2.6.0)

Loaded from Redis by `agent-spawn.ts` (lines 122-177):

| Variable | Redis Key | Type | Description | Example |
|----------|-----------|------|-------------|---------|
| `EPIC_CONTEXT` | `swarm:<task-id>:epic-context` | JSON | Epic goals, scope, phases | `{"epicGoal":"Build auth","inScope":[...],"outOfScope":[...]}` |
| `PHASE_CONTEXT` | `swarm:<task-id>:phase-context` | JSON | Current phase info | `{"currentPhase":"assessment","dependencies":[],"deliverables":[...]}` |
| `SUCCESS_CRITERIA` | `swarm:<task-id>:success-criteria` | JSON | Acceptance criteria, gates | `{"acceptanceCriteria":[...],"gateThreshold":0.75,"consensusThreshold":0.90}` |

### 3.3 System Environment Variables

Inherited from parent process (`...process.env`):

| Variable | Type | Description |
|----------|------|-------------|
| `PATH` | string | System PATH |
| `HOME` | string | User home directory |
| `NODE_ENV` | string | Node environment (production/development) |
| `API_KEY` | string | Custom routing API key (if enabled) |
| All other system env vars | various | Full system environment |

### 3.4 Agent Lifecycle Variables

Expected by agent markdown templates (`.claude/agents/*/lifecycle`):

| Variable | Set By | Description | Usage |
|----------|--------|-------------|-------|
| `AGENT_ID` | Agent runtime | Unique agent instance ID | Used in lifecycle hooks, Redis keys |
| `CONFIDENCE_SCORE` | Agent calculation | Self-reported confidence (0.0-1.0) | Stored post-task in SQLite/Redis |

### Environment Variables - Access Pattern

Agents access environment variables in their code:

```bash
# In agent execution context
EPIC_GOAL=$(echo "$EPIC_CONTEXT" | jq -r '.epicGoal')
IN_SCOPE=$(echo "$EPIC_CONTEXT" | jq -r '.inScope[]')
OUT_OF_SCOPE=$(echo "$EPIC_CONTEXT" | jq -r '.outOfScope[]')

CURRENT_PHASE=$(echo "$PHASE_CONTEXT" | jq -r '.currentPhase')
GATE_THRESHOLD=$(echo "$SUCCESS_CRITERIA" | jq -r '.gateThreshold')
```

---

## 4. Redis-Based Shared State

### 4.1 Coordination Keys (Read/Write)

| Key Pattern | Purpose | Set By | Read By | TTL |
|-------------|---------|--------|---------|-----|
| `swarm:<task-id>:<agent-id>:done` | Completion signal | Agent | Orchestrator | Manual cleanup |
| `swarm:<task-id>:<agent-id>:ready` | Ready signal | Agent | Orchestrator | Manual cleanup |
| `swarm:<task-id>:<agent-id>:result` | Agent result | Agent | Validators/PO | Manual cleanup |
| `swarm:<task-id>:gate-passed` | Loop 3 gate signal | Orchestrator | Loop 2 agents | Manual cleanup |
| `swarm:<task-id>:wake:<agent-id>` | Wake signal (BLPOP) | Orchestrator | Agent | Consumed on read |

### 4.2 Context Keys (Read-Only for Agents)

| Key Pattern | Purpose | Set By | Read By | TTL |
|-------------|---------|--------|---------|-----|
| `swarm:<task-id>:epic-context` | Epic goals/scope | Coordinator | cfn-spawn | 24h default |
| `swarm:<task-id>:phase-context` | Phase info | Coordinator | cfn-spawn | 24h default |
| `swarm:<task-id>:success-criteria` | Quality gates | Coordinator | cfn-spawn | 24h default |

### 4.3 Metrics & Monitoring Keys

| Key Pattern | Purpose | Set By | Read By | TTL |
|-------------|---------|--------|---------|-----|
| `swarm:<task-id>:metrics:iteration_start` | Iteration start time | Orchestrator | Metrics exporter | 7 days |
| `swarm:<task-id>:metrics:iteration_duration` | Iteration duration | Orchestrator | Metrics exporter | 7 days |
| `swarm:<task-id>:metrics:retry_count` | Retry counter | Orchestrator | Metrics exporter | 7 days |
| `swarm:<task-id>:<agent-id>:heartbeat` | Agent health | Agent (optional) | Heartbeat monitor | 60s |

### 4.4 Metadata Keys

| Key Pattern | Purpose | Set By | Read By | TTL |
|-------------|---------|--------|---------|-----|
| `swarm:<swarm-id>:metadata` | Swarm metadata hash | Init script | All agents | Manual cleanup |
| `swarm:<task-id>:logs:history` | Log history list | Agents | Log viewer | 7 days |

### Redis Access Pattern

Agents can read any Redis key using `redis-cli`:

```bash
# Read epic context (if cfn-spawn didn't inject it)
EPIC=$(redis-cli get "swarm:${TASK_ID}:epic-context")

# Read other agent results
PEER_RESULT=$(redis-cli get "swarm:${TASK_ID}:other-agent:result")

# Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Store result
redis-cli set "swarm:${TASK_ID}:${AGENT_ID}:result" "$MY_RESULT"
```

---

## 5. Comparison: CLI Agents vs Task Tool Agents

### Information Access Matrix

| Information Type | Task() Agent | CLI Agent | Notes |
|------------------|--------------|-----------|-------|
| **Epic context in prompt** | ✅ Yes (full text) | ❌ No (env var only) | Task agents get verbose prompt with full context |
| **Epic context via env** | ❌ No | ✅ Yes (JSON) | CLI agents get structured JSON in env vars |
| **Task ID** | ✅ Yes (implicit) | ✅ Yes (explicit arg) | Both have task ID |
| **Iteration number** | ✅ Yes (if coordinator tracks) | ✅ Yes (explicit arg) | Both have iteration |
| **Success criteria** | ✅ Yes (in prompt) | ✅ Yes (env var) | Different format: text vs JSON |
| **Scope boundaries** | ✅ Yes (in prompt) | ✅ Yes (env var EPIC_CONTEXT) | Different format: text vs JSON |
| **Phase dependencies** | ✅ Yes (in prompt) | ✅ Yes (env var PHASE_CONTEXT) | Different format: text vs JSON |
| **Agent coordination** | ❌ No (isolated) | ✅ Yes (Redis pub/sub) | CLI agents can coordinate via Redis |
| **Peer agent results** | ❌ No | ✅ Yes (Redis keys) | CLI agents can read peer results |
| **Real-time wake signals** | ❌ No | ✅ Yes (Redis BLPOP) | CLI agents support waiting mode |
| **Heartbeat monitoring** | ❌ No | ✅ Yes (optional) | CLI agents can send heartbeats |
| **Cost** | 💰💰💰 High ($15/1M) | 💰 Low ($0.50/1M with z.ai) | 95-98% savings |
| **Token usage while waiting** | 🔥 High (constant polling) | ✅ Zero (BLPOP) | CLI agents block without API calls |

### Key Differences

**Task() Agents:**
- ✅ Receive full verbose context in natural language prompt
- ✅ Easier to understand context (readable English)
- ❌ Cannot coordinate with peers (isolated execution)
- ❌ Cannot enter waiting mode (would block Main Chat)
- ❌ Cannot read peer results
- ❌ Expensive ($15/1M tokens)
- ❌ Token cost while waiting/retrying

**CLI Agents:**
- ✅ Receive structured JSON context (parseable, consistent)
- ✅ Can coordinate via Redis pub/sub
- ✅ Can enter zero-token waiting mode (BLPOP)
- ✅ Can read peer results for validation
- ✅ Cost-efficient ($0.50/1M with z.ai routing)
- ⚠️ Require JSON parsing (jq) to extract context
- ⚠️ Context must be pre-stored in Redis by coordinator

---

## 6. Information Gaps & Missing Data

### 6.1 Currently Missing from CLI Agents

| Missing Information | Impact | Workaround | Priority |
|---------------------|--------|------------|----------|
| **Agent markdown template** | ❌ Agents don't see their own instructions | Include via file read or env var | 🔴 High |
| **CLAUDE.md context** | ❌ Missing project-level rules | Include via file read or Redis | 🟡 Medium |
| **Previous iteration feedback** | ❌ No direct access to why they're iterating | Store in Redis via wake signal | 🔴 High |
| **Peer agent count** | ❌ Don't know how many peers exist | Store in Redis metadata | 🟢 Low |
| **CFN Loop mode** | ⚠️ Implicit in thresholds only | Pass explicitly via env var | 🟡 Medium |
| **Time limits/deadlines** | ❌ No awareness of timeouts | Pass via env var or Redis | 🟢 Low |
| **Cost budget** | ❌ No cost awareness | Pass via env var | 🟢 Low |
| **Deliverables checklist** | ⚠️ In SUCCESS_CRITERIA but not explicit | Enhance SUCCESS_CRITERIA schema | 🟡 Medium |

### 6.2 Iteration Feedback Gap (CRITICAL)

**Problem:** When orchestrator wakes agents for iteration N+1, agents don't know **why** they failed or what to improve.

**Current State:**
```bash
# Orchestrator wakes agent
./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "coder-1" \
  --reason "improve_quality" \  # Generic reason
  --iteration 2
```

**What's Missing:**
- Specific validation failures
- Reviewer feedback
- Security issues found
- Test failures
- Consensus gaps

**Recommended Solution:**
```bash
# Enhanced wake signal with feedback
./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "coder-1" \
  --reason "validation_failed" \
  --iteration 2 \
  --feedback "Add error handling for null inputs,Improve test coverage for edge cases,Address security issue: SQL injection risk in query builder"
```

Store feedback in Redis:
```bash
redis-cli set "swarm:${TASK_ID}:${AGENT_ID}:feedback:iteration-2" \
  '["Add error handling","Improve test coverage","Fix SQL injection"]'
```

Agent reads feedback:
```bash
FEEDBACK=$(redis-cli get "swarm:${TASK_ID}:${AGENT_ID}:feedback:iteration-${ITERATION}")
```

---

## 7. Context Schema Reference

### 7.1 EPIC_CONTEXT Schema

```json
{
  "epicGoal": "string",                    // High-level epic objective
  "inScope": ["string"],                   // Features/work in scope
  "outOfScope": ["string"],                // Features explicitly excluded
  "phases": ["string"],                    // Phase names/sequence
  "riskProfile": "string",                 // low|medium|high|critical
  "stakeholders": ["string"],              // Optional: key stakeholders
  "timeline": {                            // Optional: timeline constraints
    "start": "ISO8601",
    "end": "ISO8601",
    "milestones": [{"phase": "string", "date": "ISO8601"}]
  }
}
```

### 7.2 PHASE_CONTEXT Schema

```json
{
  "currentPhase": "string",                // Phase identifier
  "phaseNumber": "number",                 // Phase sequence number
  "dependencies": ["string"],              // Prerequisite phases
  "deliverables": ["string"],              // Expected outputs
  "blockers": ["string"],                  // Optional: current blockers
  "resources": {                           // Optional: resource allocation
    "agentCount": "number",
    "estimatedDuration": "number",         // hours
    "costBudget": "number"                 // dollars
  }
}
```

### 7.3 SUCCESS_CRITERIA Schema

```json
{
  "acceptanceCriteria": ["string"],        // Must-have conditions
  "gateThreshold": "number",               // 0.0-1.0 (Loop 3 gate)
  "consensusThreshold": "number",          // 0.0-1.0 (Loop 2 consensus)
  "qualityGates": {                        // Optional: specific quality gates
    "testCoverage": "number",              // percentage
    "securityScore": "number",             // 0.0-1.0
    "performanceBudget": "number"          // milliseconds
  },
  "definitionOfDone": ["string"],          // Completion checklist
  "nonFunctionalRequirements": ["string"]  // Optional: NFRs
}
```

---

## 8. Recommendations

### 8.1 Immediate Enhancements (High Priority)

**1. Iteration Feedback Mechanism** 🔴 Critical
```bash
# Add feedback parameter to wake signal
# Store detailed validation feedback in Redis
# Agents read feedback before starting iteration N+1
```

**2. Agent Instructions Injection** 🔴 High
```bash
# Include agent markdown template in env var or Redis
# Agents know their own responsibilities
AGENT_INSTRUCTIONS=$(cat ".claude/agents/core-agents/${AGENT_TYPE}.md")
```

**3. CFN Mode Explicit Passing** 🟡 Medium
```bash
# Add CFN_MODE env var
CFN_MODE="standard"  # mvp|standard|enterprise
```

### 8.2 Schema Enhancements (Medium Priority)

**1. Expand PHASE_CONTEXT**
```json
{
  "blockers": ["Waiting for API key", "Database migration pending"],
  "resources": {
    "agentCount": 5,
    "estimatedDuration": 3,  // hours
    "costBudget": 2.50       // dollars
  }
}
```

**2. Expand SUCCESS_CRITERIA**
```json
{
  "qualityGates": {
    "testCoverage": 80,      // percentage
    "securityScore": 0.90,   // 0.0-1.0
    "performanceBudget": 200 // ms
  }
}
```

### 8.3 Advanced Features (Low Priority)

**1. Context Versioning**
- Track context changes across iterations
- Agents see what changed since iteration N-1

**2. Context Diffing**
- Show delta between iterations
- Agents focus on what changed

**3. Peer Discovery**
- Agents know who their peers are
- Can query peer status/results

**4. Cost Awareness**
- Agents know cost budget
- Can optimize behavior for cost

---

## 9. Information Flow Diagram (Comprehensive)

```
┌─────────────────────────────────────────────────────────────────┐
│                         MAIN CHAT                                │
│                                                                   │
│  Input: User request + /cfn-loop command                        │
│  Output: Task description, epic context, success criteria       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Task() tool call with full prompt
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   COORDINATOR AGENT                              │
│                 (cost-savings-cfn-loop-coordinator)              │
│                                                                   │
│  Receives via Task() prompt:                                    │
│  ✅ Epic goal, scope (in/out), phases                           │
│  ✅ Phase context, dependencies, deliverables                   │
│  ✅ Success criteria, gates, acceptance criteria                │
│  ✅ Agent lists (Loop 3, Loop 2, Product Owner)                 │
│  ✅ CFN mode, max iterations                                    │
│                                                                   │
│  Coordinator Actions:                                            │
│  1️⃣  Parse task requirements                                    │
│  2️⃣  Store epic context in Redis ← NEW (v2.6.0)                │
│  3️⃣  Invoke orchestrator script                                 │
│  4️⃣  Monitor progress via web portal                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Bash invocation
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  REDIS CONTEXT STORAGE                           │
│          (.claude/skills/redis-coordination/                     │
│            store-epic-context.sh)                                │
│                                                                   │
│  Stores:                                                         │
│  📦 swarm:<task-id>:epic-context      (JSON, TTL 24h)          │
│  📦 swarm:<task-id>:phase-context     (JSON, TTL 24h)          │
│  📦 swarm:<task-id>:success-criteria  (JSON, TTL 24h)          │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                ORCHESTRATOR SCRIPT                               │
│          (.claude/skills/redis-coordination/                     │
│            orchestrate-cfn-loop.sh)                              │
│                                                                   │
│  Receives via CLI args:                                          │
│  ✅ --task-id                                                    │
│  ✅ --mode (mvp|standard|enterprise)                            │
│  ✅ --loop3-agents (comma-separated)                            │
│  ✅ --loop2-agents (comma-separated)                            │
│  ✅ --product-owner                                              │
│  ✅ --max-iterations                                             │
│                                                                   │
│  Orchestrator Actions:                                           │
│  1️⃣  Spawn Loop 3 agents via CLI                                │
│  2️⃣  Collect confidence scores                                  │
│  3️⃣  Check gate threshold (≥0.75)                               │
│  4️⃣  Signal Loop 2 if gate passes                               │
│  5️⃣  Spawn Loop 2 validators                                    │
│  6️⃣  Collect consensus scores                                   │
│  7️⃣  Check consensus threshold (≥0.90)                          │
│  8️⃣  Wake agents for iteration N+1 if needed                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ For each agent: npx cfn-spawn agent <type>
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CFN-SPAWN CLI                               │
│                  (src/cli/agent-spawn.ts)                        │
│                                                                   │
│  Receives via CLI args:                                          │
│  ✅ <agent-type>                                                 │
│  ✅ --task-id                                                    │
│  ✅ --iteration                                                  │
│  ✅ --context ("Loop 3 implementation")                         │
│  ✅ --mode (cli)                                                 │
│                                                                   │
│  cfn-spawn Actions:                                              │
│  1️⃣  Read Redis context keys:                                   │
│     📖 swarm:<task-id>:epic-context                             │
│     📖 swarm:<task-id>:phase-context                            │
│     📖 swarm:<task-id>:success-criteria                         │
│  2️⃣  Inject environment variables                               │
│  3️⃣  Spawn: npx claude-flow-novice agent <type>                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Process spawn with env vars
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT PROCESS                               │
│                  (claude-flow-novice agent)                      │
│                                                                   │
│  Receives via ENVIRONMENT VARIABLES:                             │
│  ✅ AGENT_TYPE              (e.g., "researcher")                │
│  ✅ TASK_ID                 (e.g., "phase-1-1234567890")        │
│  ✅ ITERATION               (e.g., "2")                         │
│  ✅ CONTEXT                 (e.g., "Loop 3 implementation")     │
│  ✅ MODE                    (e.g., "cli")                        │
│  ✅ PRIORITY                (e.g., "5")                          │
│  ✅ PARENT_TASK_ID          (if provided)                       │
│  ✅ EPIC_CONTEXT            (JSON from Redis)                   │
│  ✅ PHASE_CONTEXT           (JSON from Redis)                   │
│  ✅ SUCCESS_CRITERIA        (JSON from Redis)                   │
│  ✅ [All system env vars]   (PATH, HOME, etc.)                  │
│                                                                   │
│  Agent can READ from Redis:                                      │
│  📖 swarm:<task-id>:<other-agent>:result                        │
│  📖 swarm:<task-id>:gate-passed                                 │
│  📖 swarm:*:metadata                                             │
│                                                                   │
│  Agent WRITES to Redis:                                          │
│  📝 swarm:<task-id>:<agent-id>:done                             │
│  📝 swarm:<task-id>:<agent-id>:result                           │
│  📝 swarm:<task-id>:<agent-id>:heartbeat (optional)             │
│                                                                   │
│  Agent executes:                                                 │
│  1️⃣  Read agent markdown template                               │
│  2️⃣  Parse epic/phase/success context from env vars            │
│  3️⃣  Execute task according to role                             │
│  4️⃣  Signal completion                                          │
│  5️⃣  Report confidence score                                    │
│  6️⃣  Enter waiting mode (for potential iteration)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Summary Table: Complete Information Inventory

### What CLI Agents Receive

| Category | Item | Source | Format | Access Method |
|----------|------|--------|--------|---------------|
| **Identity** | Agent type | CLI arg | String | `$AGENT_TYPE` |
| | Task ID | CLI arg | String | `$TASK_ID` |
| | Iteration | CLI arg | Number | `$ITERATION` |
| | Agent ID | Runtime | String | `$AGENT_ID` (set by agent) |
| **Context** | Short description | CLI arg | String | `$CONTEXT` |
| | Epic context | Redis → Env | JSON | `$EPIC_CONTEXT` |
| | Phase context | Redis → Env | JSON | `$PHASE_CONTEXT` |
| | Success criteria | Redis → Env | JSON | `$SUCCESS_CRITERIA` |
| **Execution** | Mode | CLI arg | String | `$MODE` |
| | Priority | CLI arg | Number | `$PRIORITY` |
| | Parent task | CLI arg | String | `$PARENT_TASK_ID` |
| **Coordination** | Peer results | Redis read | Mixed | `redis-cli get swarm:*:result` |
| | Gate signal | Redis BLPOP | String | `redis-cli blpop swarm:*:gate-passed` |
| | Wake signal | Redis BLPOP | JSON | `redis-cli blpop swarm:*:wake:*` |
| | Swarm metadata | Redis hash | Hash | `redis-cli hgetall swarm:*:metadata` |
| **Monitoring** | Metrics | Redis read | Mixed | `redis-cli get swarm:*:metrics:*` |
| | Logs | Redis list | List | `redis-cli lrange swarm:*:logs:*` |

### What CLI Agents Can Access (But Don't Automatically Receive)

| Item | How to Access | Notes |
|------|---------------|-------|
| CLAUDE.md | File read | `cat CLAUDE.md` |
| Agent markdown | File read | `cat .claude/agents/core-agents/$AGENT_TYPE.md` |
| Previous results | Redis read | `redis-cli get swarm:$TASK_ID:$AGENT_ID:result:iteration-$((ITERATION-1))` |
| Peer count | Redis scan | `redis-cli keys "swarm:$TASK_ID:*:done" \| wc -l` |
| Iteration feedback | Redis read | ⚠️ **NOT YET IMPLEMENTED** |

---

## 11. Conclusion

### ✅ Strengths of Current Implementation

1. **Comprehensive CLI arg support** - All essential parameters covered
2. **Rich environment variable injection** - Epic/phase/success context available
3. **Redis coordination** - Agents can coordinate via pub/sub
4. **Zero-token waiting** - BLPOP enables efficient iteration
5. **Cost efficiency** - 95-98% savings vs Task tool
6. **Structured context** - JSON format enables parsing and validation

### ⚠️ Key Gaps

1. **No iteration feedback mechanism** - Agents don't know why they're iterating
2. **Missing agent instructions** - Agents don't have their markdown template
3. **No explicit CFN mode** - Only implicit via thresholds
4. **Limited peer discovery** - Agents don't know who their peers are

### 🎯 Priority Improvements

**HIGH (Immediate):**
1. Implement iteration feedback via Redis
2. Inject agent markdown template
3. Add CFN_MODE env var

**MEDIUM (Next sprint):**
1. Expand PHASE_CONTEXT schema with blockers/resources
2. Expand SUCCESS_CRITERIA with quality gates
3. Add peer discovery mechanism

**LOW (Future):**
1. Context versioning and diffing
2. Cost awareness
3. Timeline/deadline tracking

---

## Appendix A: Code References

| Component | File | Lines |
|-----------|------|-------|
| CLI argument parsing | `src/cli/agent-spawn.ts` | 30-82 |
| Redis context loading | `src/cli/agent-spawn.ts` | 122-161 |
| Environment variable injection | `src/cli/agent-spawn.ts` | 164-177 |
| Context storage | `.claude/skills/redis-coordination/store-epic-context.sh` | 102-116 |
| Orchestrator spawning | `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh` | 566-575 |
| Agent lifecycle hooks | `.claude/agents/core-agents/coder.md` | 19-25 |

---

**Document Status:** ✅ Complete
**Last Updated:** 2025-10-20
**Next Review:** After iteration feedback implementation
