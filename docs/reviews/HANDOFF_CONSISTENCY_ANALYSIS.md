# Coordinator → Orchestrator → Agent Handoff Consistency Analysis

## Executive Summary

Analysis of the coordinator → orchestrator → agent handoff chain reveals **4 critical namespace inconsistencies** and **2 unused storage operations** that create fragility in the CFN Loop workflow. The system currently works due to fallback logic and graceful degradation, but the inconsistencies violate the design schema specified in the handoff documentation. Most critically, success criteria are stored in a different namespace (cfn_loop:task) than other task context (swarm), forcing the orchestrator to query two separate HASH keys for unified context.

## Critical Issues

### Issue 1: Redis Namespace Split for Task Context
**Location:** Coordinator (.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md:44-57, 94)

**Problem:** Coordinator stores task context across two Redis namespaces:
- **swarm namespace**: task_description, expected_files, mode, max_iterations → `swarm:${TASK_ID}:context` (HASH)
- **cfn_loop:task namespace**: success-criteria → `cfn_loop:task:${TASK_ID}:context` (HASH)

This creates two separate context objects when there should be one unified HASH.

**Evidence:**
```bash
# Coordinator writes (cfn-v3-coordinator.md)
Line 44:  HSET "swarm:${TASK_ID}:context" "task_description" "$TASK_DESCRIPTION"
Line 49:  HSET "swarm:${TASK_ID}:context" "expected_files" "$EXPECTED_FILES"
Line 54:  HSET "swarm:${TASK_ID}:context" "mode" "$MODE"
Line 57:  HSET "swarm:${TASK_ID}:context" "max_iterations" "$MAX_ITERATIONS"
Line 94:  HSET "cfn_loop:task:${TASK_ID}:context" "success-criteria" "$CRITERIA_JSON"
```

**Orchestrator reads (orchestrate.sh):**
```bash
Line 381: get-context.sh --task-id "$TASK_ID" --namespace "cfn_loop:task"  # success criteria
Line 512: redis_context=$("get-context.sh" --task-id "$task_id" --namespace "swarm")  # other context
```

**Impact:** 
- Orchestrator must query two separate Redis keys to get complete context
- Violates handoff schema which specifies single namespace per entity
- Increases latency (2 HGET calls instead of 1)
- Makes context retrieval fragile if either key is missing
- Future changes to context schema require updates in two locations

**Fix:** Unify all task context to single namespace (recommend: swarm). Store as:
```bash
HSET "swarm:${TASK_ID}:context" "task_description" "..."
HSET "swarm:${TASK_ID}:context" "success-criteria" "..."  # Move from cfn_loop:task
HSET "swarm:${TASK_ID}:context" "expected_files" "..."
HSET "swarm:${TASK_ID}:context" "mode" "..."
```

---

### Issue 2: Unused Agent Config Storage
**Location:** Coordinator (cfn-v3-coordinator.md:111-114)

**Problem:** Coordinator stores agent configuration to `swarm:${TASK_ID}:config` HASH, but orchestrator never reads from it.

**Evidence:**
```bash
# Coordinator writes (cfn-v3-coordinator.md:111-114)
HSET "swarm:${TASK_ID}:config" "loop3_agents" "$LOOP3_AGENTS"
HSET "swarm:${TASK_ID}:config" "loop2_agents" "$LOOP2_AGENTS"

# Orchestrator receives via command-line instead (orchestrate.sh:141-144)
--loop3-agents "$LOOP3_AGENTS"
--loop2-agents "$LOOP2_AGENTS"
# Never reads from swarm:${TASK_ID}:config
```

**Impact:**
- Unnecessary Redis write operations (I/O waste)
- Coordinator code complexity without benefit
- Orphaned Redis keys accumulate
- Misleading codebase (readers assume these stored values are used)

**Fix:** Remove HSET operations storing loop agents to Redis in coordinator. Agents are already passed via command-line parameters to orchestrator.

---

### Issue 3: Expected Files Field Never Used
**Location:** Coordinator (cfn-v3-coordinator.md:49)

**Problem:** Coordinator stores `expected_files` to `swarm:${TASK_ID}:context`, but no downstream component reads or uses this value.

**Evidence:**
```bash
# Coordinator stores (cfn-v3-coordinator.md:49)
HSET "swarm:${TASK_ID}:context" "expected_files" "$EXPECTED_FILES"

# Orchestrator's build_agent_context() queries for target_files (orchestrate.sh:510):
target_files=$(echo "$redis_context" | jq -r '.["target-files"] // ""')

# Key name mismatch: expects "target-files", coordinator stores "expected_files"
```

**Orchestrator context extraction (orchestrate.sh:510):**
```bash
target_files=$(echo "$redis_context" | jq -r '.["target-files"] // ""')
# This queries for "target-files" but coordinator stored "expected_files"
```

**Impact:**
- Stored value is never retrieved (wasted I/O)
- Success criteria stores redundant data: `test_suites[].name` should match expected files
- Redis contains unused fields

**Fix:** Either:
1. Store to correct field name ("target-files" instead of "expected_files"), OR
2. Remove from coordinator storage entirely (files are in success criteria JSON already)

---

### Issue 4: Variable Naming Inconsistency in Agent Context
**Location:** Coordinator (cfn-v3-coordinator.md:26-29) and Agent Executor (src/cli/agent-executor.ts:455-457)

**Problem:** Variable naming conventions inconsistent between coordinator environment and agent execution context:

**Coordinator defines (cfn-v3-coordinator.md):**
```bash
TASK_ID="${TASK_ID:-cfn-$(date +%s)}"
MODE="${MODE:-standard}"
MAX_ITERATIONS="${MAX_ITERATIONS:-5}"
```

**Agent executor injects (src/cli/agent-executor.ts:455-457):**
```typescript
env.TASK_ID = context.taskId || '';
env.ITERATION = String(context.iteration || 1);
env.MODE = context.mode || 'cli';
```

**Orchestrator parameters (orchestrate.sh:155-174):**
```bash
--loop3-agents)
    LOOP3_AGENTS="$2"
--loop2-agents)
    LOOP2_AGENTS="$2"
```

**Agent context string (orchestrate.sh:495-600):**
```bash
local context="Task: $task_desc"  # Context is plain string, not BASH variables
```

**Impact:**
- No direct impact on current system (works due to string-based context)
- Violates principle of least surprise
- Makes coordination harder to debug
- Future refactoring to environment-variable-based context would break

**Fix:** Standardize variable naming and document expected format:
```bash
# All uppercase for environment variables
TASK_ID, MODE, MAX_ITERATIONS, ITERATION, LOOP_TYPE
```

---

## Warnings (Non-Breaking Inconsistencies)

### Warning 1: Multiple Redis Retrieval Attempts in Orchestrator
**Location:** orchestrate.sh:512

Orchestrator tries to retrieve context from Redis, but has fallback to hardcoded `SUCCESS_CRITERIA` variable:
```bash
if redis_context=$("$REDIS_COORD_SKILL/get-context.sh" --task-id "$task_id" --namespace "swarm" 2>/dev/null); then
    # Extract from redis_context
else
    echo "⚠️  Failed to retrieve Redis context, using local SUCCESS_CRITERIA"
fi
```

This works but creates two code paths:
1. Happy path: Redis context available
2. Fallback path: Use hardcoded variable (possible divergence)

**Recommendation:** Document which path is the primary one and test both paths regularly.

### Warning 2: Namespace Parameter Default in get-context.sh
**Location:** .claude/skills/cfn-redis-coordination/get-context.sh:70

Default namespace is `swarm`, but success criteria are stored in `cfn_loop:task`:
```bash
NAMESPACE="swarm"  # Line 70, but success criteria uses cfn_loop:task
```

This means every call to get success criteria must explicitly pass `--namespace "cfn_loop:task"`.

**Recommendation:** Document that success criteria require explicit namespace parameter. Or move success criteria to swarm namespace (preferred).

### Warning 3: Context String Format vs JSON Format
**Location:** orchestrate.sh:495-600 (build_agent_context returns pipe-delimited string)

Agent context is built as pipe-delimited string:
```bash
local context="Task: $task_desc | Deliverables: $deliverables | Acceptance Criteria: ..."
```

But agent executor expects to parse it as JavaScript object potentially:
```typescript
// src/cli/agent-executor.ts:89 - parseContextToEnv expects shell variable format
function parseContextToEnv(contextString: string | undefined): Record<string, string> {
```

These are different formats:
- Orchestrator: `"Task: X | Deliverables: Y | ..."`
- Agent executor: `"TASK_ID='...' MODE='...' MAX_ITERATIONS=5"`

**Impact:** Agent executor's context parsing is not used for orchestrator context (which is text, not env vars). Works because agents receive both:
1. Context string in agent prompt
2. Environment variables separately

**Recommendation:** Clarify intent: Is context for human agents (text) or machine parsing (env vars)? Current dual approach works but is confusing.

---

## Verified Consistency ✅

### Agent Completion Signaling
**Location:** agent-executor.ts:167, orchestrate.sh:854, 957

✅ Verified working: Agents complete work and signal via Redis:
```bash
redis-cli lpush "swarm:${taskId}:${agentId}:done" "complete"
```

Orchestrator waits for this signal:
```bash
redis-cli blpop "swarm:${task_id}:${unique_agent_id}:done" "$timeout"
```

**Status:** Consistent across all implementations ✅

### Loop3/Loop2 Agent ID Tracking
**Location:** orchestrate.sh:793-815, 1079-1095

✅ Verified working: Agent IDs stored atomically using Lua script:
```bash
redis-cli --eval - "swarm:${task_id}:loop3:agent_ids:iteration${iteration}" "$UNIQUE_AGENT_ID" <<'LUA'
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], 86400)
LUA
```

Later retrieved with SMEMBERS:
```bash
stored_ids=$(redis-cli SMEMBERS "swarm:${task_id}:loop3:agent_ids:iteration${iteration}")
```

**Status:** Consistent pattern across Loop 3 and Loop 2 ✅

### TASK_ID Format Validation
**Location:** orchestrate.sh:79-83, spawn-agent.sh:20

✅ Verified: Both coordinator and agent spawner validate TASK_ID:
```bash
# orchestrate.sh:139
TASK_ID=$(sanitize_input "$2") || { echo "Invalid task ID"; exit 1; }

# spawn-agent.sh:20
if [[ "${TASK_ID}" =~ [^a-zA-Z0-9._-] ]]; then
    echo "❌ ERROR: TASK_ID contains invalid characters"
```

**Status:** Consistent validation pattern ✅

### MODE Validation
**Location:** orchestrate.sh:149, cfn-v3-coordinator.md (implicit in defaults)

✅ Verified: Orchestrator validates MODE parameter:
```bash
if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
    echo "Invalid mode. Must be mvp, standard, or enterprise."
```

Coordinator defaults to `standard` without explicit validation, but orchestrator catches invalid values.

**Status:** Covered by orchestrator validation ✅

---

## Recommendations

### Recommendation 1: Unify Task Context Namespace (PRIORITY: HIGH)
**Effort:** 2-3 hours | **Impact:** Eliminates fragile dual-namespace pattern

**Changes Required:**
1. Update `store-success-criteria.sh` (Line 68):
   ```bash
   # FROM:
   REDIS_KEY="cfn_loop:task:${TASK_ID}:context"
   # TO:
   REDIS_KEY="swarm:${TASK_ID}:context"
   ```

2. Update `orchestrate.sh` (Line 381, 480):
   ```bash
   # FROM:
   get-context.sh --task-id "$TASK_ID" --namespace "cfn_loop:task"
   # TO:
   get-context.sh --task-id "$TASK_ID" --namespace "swarm"
   ```

3. Update coordinator documentation to reflect single namespace

**Benefits:**
- Single Redis query instead of two
- Eliminates namespace confusion
- Matches handoff schema specification
- Reduces context retrieval latency

---

### Recommendation 2: Remove Unused Agent Config Storage (PRIORITY: MEDIUM)
**Effort:** 30 minutes | **Impact:** Reduces Redis overhead, clarifies coordinator purpose

**Changes Required:**
1. Delete from `cfn-v3-coordinator.md` (Lines 110-114):
   ```bash
   # DELETE THESE:
   redis-cli HSET "swarm:${TASK_ID}:config" "loop3_agents" "$LOOP3_AGENTS"
   redis-cli HSET "swarm:${TASK_ID}:config" "loop2_agents" "$LOOP2_AGENTS"
   ```

2. Update coordinator comments to clarify agents are passed via command-line

**Benefits:**
- Eliminates unnecessary I/O
- Reduces Redis key pollution
- Clearer control flow (env vars → orchestrator, not via Redis)
- Simpler to test (one fewer dependency)

---

### Recommendation 3: Fix Expected Files Field Name Mismatch (PRIORITY: MEDIUM)
**Effort:** 1 hour | **Impact:** Ensures data is actually retrievable

**Option A: Fix Naming (Recommended)**
```bash
# In cfn-v3-coordinator.md, Line 49:
# FROM:
HSET "swarm:${TASK_ID}:context" "expected_files" "$EXPECTED_FILES"
# TO:
HSET "swarm:${TASK_ID}:context" "target-files" "$EXPECTED_FILES"
```

**Option B: Remove If Redundant**
If expected files are already in success_criteria test_suites, remove entirely from coordinator storage.

**Benefits (Option A):**
- Field is now retrievable by orchestrator
- Can be used for agent context injection
- Consistent naming with orchestrator expectations

**Benefits (Option B):**
- Eliminates redundant storage
- Single source of truth (success criteria)
- Simpler coordinator logic

**Recommendation:** Choose Option B if success_criteria already contains the same information.

---

### Recommendation 4: Document Context Format Standards (PRIORITY: LOW)
**Effort:** 1 hour | **Impact:** Prevents future inconsistencies

**Create Documentation:**
File: `.claude/commands/CFN_CONTEXT_FORMAT_STANDARDS.md`

Should document:
1. **Redis Context Keys:**
   - Task context: `swarm:${TASK_ID}:context` (HASH with fields)
   - Agent IDs: `swarm:${TASK_ID}:loop3:agent_ids:iteration${N}` (SET)
   - Feedback: `swarm:${TASK_ID}:feedback` (LIST)

2. **Environment Variables:**
   - TASK_ID (string, alphanumeric + dash/underscore/dot)
   - MODE (enum: mvp|standard|enterprise)
   - ITERATION (integer ≥ 1)
   - LOOP_TYPE (enum: loop3|loop2|loop4)

3. **Context String Format:**
   - Format: "Key: Value | Key: Value | ..."
   - Is human-readable, not machine-parsed
   - Used in agent prompts, not env vars

4. **Versioning:**
   - Current: v3.1.0 (as of 2025-11-19)
   - Breaking changes require major version bump

---

## Summary Table

| Issue | Component | Current | Expected | Impact | Priority |
|-------|-----------|---------|----------|--------|----------|
| **Namespace Split** | Coordinator | swarm + cfn_loop:task | swarm (unified) | 2 queries instead of 1 | **HIGH** |
| **Unused Config** | Coordinator | Stores to swarm:${ID}:config | Remove entirely | Orphaned keys, I/O waste | **MEDIUM** |
| **Field Name Mismatch** | Coordinator | "expected_files" | "target-files" OR remove | Data unretrievable OR redundant | **MEDIUM** |
| **Variable Naming** | Coordinator + Executor | Mixed conventions | UPPERCASE standard | Confusing for debugging | **LOW** |
| **Context Format** | Orchestrator | Pipe-delimited string | Documented standard | Ambiguity about intent | **LOW** |

