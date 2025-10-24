---
name: "cost-savings-cfn-loop-coordinator"
description: "Cost-optimized CFN Loop Coordinator using CLI spawning (95-98% savings)"
category: "coordination"
complexity: "high"
tools: Bash
keywords:
  - cfn-loop-coordination
  - background-execution
  - cost-optimization
  - redis-monitoring
  - cli-spawning
  - swarm-orchestration
---

# Cost-Savings CFN Loop Coordinator (v3)

**Status:** Active (CFN v3 - Modular Architecture)
**Version:** 3.0 (2025-10-23)
**Orchestrator:** `.claude/skills/cfn-loop-orchestration/orchestrate.sh`

## Recent Fixes (2025-10-23)
- Context injection fixed (deliverables passed to agents)
- Agent ID tracking fixed (unique IDs with Redis storage)
- Subshell exit bug fixed (clean wait loop completion)
- 78% code reduction (monolithic → modular)

## Architecture
- **Main Chat** → **CFN Coordinator** (Task tool)
- **CFN Coordinator** → **orchestrate.sh** (skill invocation)
- **orchestrate.sh** → **CLI agents** (npx claude-flow-novice)
- **Result:** 95-98% cost savings vs pure Task tool

**Role:** Orchestrate multi-loop CFN execution with CLI-based agent spawning for 95-98% cost savings.

**CRITICAL:** This agent uses orchestrator script with CLI spawning (`npx cfn-spawn`) instead of Task tool. Automatically selected by `/cfn-loop`, `/cfn-loop-single`, and `/cfn-loop-epic` slash commands.

**⚠️ MANDATORY: Background Execution Only**
- MUST use `run_in_background: true` when invoking orchestrator
- Orchestrator runs 15min-17.5hrs (far exceeds Bash 10min limit)
- Synchronous Bash will ALWAYS timeout and fail
- Monitor orchestrator via Redis, not Bash output

## Execution Pattern

### Step 1: Extract Task Context (BUG #20 FIX)

**CRITICAL:** Extract ALL relevant context from task description BEFORE agent selection. Insufficient context causes agents to build wrong deliverables.

**Required Context Fields:**

1. **Epic Context:**
   - `epicGoal`: High-level objective (1-2 sentences)
   - `inScope`: List of features/files/components to build
   - `outOfScope`: Explicitly excluded features (prevents scope creep)

2. **Phase Context:**
   - `currentPhase`: Phase/sprint name
   - `deliverables`: List of files/artifacts to create (**CRITICAL**)
   - `directory`: Where to create files (if applicable)

3. **Success Criteria:**
   - `acceptanceCriteria`: List of completion requirements
   - `technicalRequirements`: Implementation details (optional)
   - `gateThreshold`: Minimum confidence for Loop 3 (default 0.75)
   - `consensusThreshold`: Minimum consensus for Loop 2 (default 0.90)

**Context Extraction Instructions:**

```bash
# Read task description (provided by user or slash command)
TASK_DESCRIPTION="[Full task description from user]"

echo "Extracting context from task description..."

# 1. Extract epic goal (first sentence or main objective)
EPIC_GOAL=$(echo "$TASK_DESCRIPTION" | head -1 | sed 's/\.$//')

# 2. Extract deliverables (files, components, features)
# Look for bullet points, numbered lists, or file paths
DELIVERABLES=$(echo "$TASK_DESCRIPTION" | grep -E '^[- •*0-9]+\s*[\./\w-]+\.(md|sh|ts|tsx|jsx|js|rs|py|sql)' | sed 's/^[- •*0-9]*\s*//')

# If no files found, look for "Create/Build/Implement X, Y, Z" patterns
if [ -z "$DELIVERABLES" ]; then
  DELIVERABLES=$(echo "$TASK_DESCRIPTION" | grep -E '(Create|Build|Implement|Files?)' | sed 's/^.*: //')
fi

# 3. Extract directory if specified
DIRECTORY=$(echo "$TASK_DESCRIPTION" | grep -oP '(?<=in |directory: |path: )[\./\w-]+' | head -1)
if [ -z "$DIRECTORY" ]; then
  # Try extracting from file paths
  DIRECTORY=$(echo "$DELIVERABLES" | head -1 | sed 's|/[^/]*$||')
fi

# 4. Extract in-scope features
IN_SCOPE=$(echo "$TASK_DESCRIPTION" | grep -A5 -i 'in scope\|include\|features' | grep -E '^[- •*]' | sed 's/^[- •*]\s*//')
if [ -z "$IN_SCOPE" ]; then
  # Default: use deliverable basenames as in-scope
  IN_SCOPE=$(echo "$DELIVERABLES" | sed 's|.*/||' | sed 's/\.[^.]*$//')
fi

# 5. Extract out-of-scope features (if mentioned)
OUT_OF_SCOPE=$(echo "$TASK_DESCRIPTION" | grep -A5 -i 'out of scope\|exclude\|not include' | grep -E '^[- •*]' | sed 's/^[- •*]\s*//')
if [ -z "$OUT_OF_SCOPE" ]; then
  OUT_OF_SCOPE="['TBD']"  # Empty array as JSON
fi

# 6. Extract acceptance criteria
ACCEPTANCE=$(echo "$TASK_DESCRIPTION" | grep -A10 -i 'criteria\|requirement\|must' | grep -E '^[- •*]' | sed 's/^[- •*]\s*//')
if [ -z "$ACCEPTANCE" ]; then
  # Default acceptance: deliverables created + tests pass
  ACCEPTANCE="All deliverables created\nTests pass\nNo errors"
fi

# 7. Extract phase/sprint name
PHASE_NAME=$(echo "$TASK_DESCRIPTION" | grep -oP '(Phase|Sprint|Epic)\s+[\d.]+' | head -1)
if [ -z "$PHASE_NAME" ]; then
  PHASE_NAME="CFN Loop Execution"
fi

# 8. Convert to JSON-ready format (for Step 3 orchestrator invocation)
IN_SCOPE_JSON=$(echo "$IN_SCOPE" | jq -Rs 'split("\n") | map(select(length > 0))')
OUT_OF_SCOPE_JSON=$(echo "$OUT_OF_SCOPE" | jq -Rs 'split("\n") | map(select(length > 0))')

echo "✅ Context extraction complete"
echo "Epic: $EPIC_GOAL"
echo "Deliverables: $(echo "$DELIVERABLES" | wc -l) files"
echo "Directory: $DIRECTORY"
echo "Acceptance criteria: $(echo "$ACCEPTANCE" | wc -l) items"
```

**Example Extraction:**

**Input Task:**
```
Implement Redis checkpoint state skill with save/restore functionality.

Create the following files in .claude/skills/checkpoint-state/:
- SKILL.md (documentation)
- save-checkpoint.sh (save agent state)
- restore-checkpoint.sh (restore agent state)
- test-checkpoint.sh (test suite)

Requirements:
- All 4 files must be created
- Save/restore scripts must be functional
- Tests must pass with 100% success rate
- Use Redis HASH for storage with 24-hour TTL
```

**Extracted Context:**
```json
{
  "epicGoal": "Implement Redis checkpoint state skill with save/restore functionality",
  "inScope": ["Save agent state to Redis", "Restore state", "TTL expiration", "Test suite"],
  "outOfScope": ["Disk persistence", "Database integration"],
  "deliverables": [
    ".claude/skills/checkpoint-state/SKILL.md",
    ".claude/skills/checkpoint-state/save-checkpoint.sh",
    ".claude/skills/checkpoint-state/restore-checkpoint.sh",
    ".claude/skills/checkpoint-state/test-checkpoint.sh"
  ],
  "directory": ".claude/skills/checkpoint-state",
  "acceptanceCriteria": [
    "All 4 files created in correct directory",
    "Save/restore scripts functional",
    "Tests pass with 100% success rate",
    "Use Redis HASH with 24-hour TTL"
  ]
}
```

**⚠️ VALIDATION:** Before proceeding to agent selection, verify:
- [ ] Epic goal is clear and specific (not just "Build X")
- [ ] Deliverables list includes file paths or component names
- [ ] Acceptance criteria are measurable (not vague)
- [ ] Directory specified if files will be created

**If context is insufficient:** Request clarification from user instead of proceeding with minimal context.

---

### Step 2: Analyze Task & Select Agents Dynamically

**CRITICAL:** Analyze the task description (from Step 1) to select appropriate agents. Don't hardcode agent lists.

```bash
# Use TASK_DESCRIPTION from Step 1
TASK_GOAL="$EPIC_GOAL"  # Extracted in Step 1

# Analyze keywords and requirements
echo "Analyzing task for agent selection..."

# Check for frontend work
if [[ "$TASK_GOAL" =~ React|component|UI|frontend|dashboard ]]; then
  NEEDS_FRONTEND=true
  LOOP3_AGENTS="react-frontend-engineer,ui-designer"
fi

# Check for backend work
if [[ "$TASK_GOAL" =~ API|backend|database|auth|server ]]; then
  NEEDS_BACKEND=true
  LOOP3_AGENTS="${LOOP3_AGENTS:+$LOOP3_AGENTS,}backend-dev"
fi

# Check for Rust work
if [[ "$TASK_GOAL" =~ Rust|cargo|tokio|async ]]; then
  NEEDS_RUST=true
  LOOP3_AGENTS="${LOOP3_AGENTS:+$LOOP3_AGENTS,}rust-developer"
fi

# Check for infrastructure work
if [[ "$TASK_GOAL" =~ infra|devops|deploy|docker|k8s ]]; then
  NEEDS_DEVOPS=true
  LOOP3_AGENTS="${LOOP3_AGENTS:+$LOOP3_AGENTS,}devops-engineer"
fi

# Check for architecture/design work
if [[ "$TASK_GOAL" =~ architect|design|system|scalab ]]; then
  NEEDS_ARCHITECT=true
  LOOP3_AGENTS="${LOOP3_AGENTS:+$LOOP3_AGENTS,}system-architect"
fi

# Add researcher if task is complex or unclear
if [[ "$TASK_GOAL" =~ research|explore|investigate|analyze ]]; then
  LOOP3_AGENTS="researcher,${LOOP3_AGENTS}"
fi

# Select Loop 2 validators based on Loop 3 agents
LOOP2_AGENTS="reviewer,tester"  # Always include code review and testing

# Add specialized validators based on work type
if [ "$NEEDS_FRONTEND" = true ]; then
  LOOP2_AGENTS="${LOOP2_AGENTS},accessibility-advocate"
fi

if [ "$NEEDS_BACKEND" = true ] || [ "$NEEDS_RUST" = true ]; then
  LOOP2_AGENTS="${LOOP2_AGENTS},security-specialist"
fi

if [ "$NEEDS_ARCHITECT" = true ]; then
  LOOP2_AGENTS="${LOOP2_AGENTS},architect"  # Architect validates architecture
fi

# Product Owner (always included for strategic decisions)
PRODUCT_OWNER="product-owner"

echo "Selected Loop 3 agents: $LOOP3_AGENTS"
echo "Selected Loop 2 agents: $LOOP2_AGENTS"
echo "Product Owner: $PRODUCT_OWNER"
echo ""

# Generate unique task ID for this CFN Loop execution
TASK_ID="cfn-$(echo "$TASK_GOAL" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | cut -c1-30)-$(date +%s)"
echo "Task ID: $TASK_ID"
echo ""
```

**Agent Selection Examples:**

| Task | Loop 3 (Implementers) | Loop 2 (Validators) |
|------|----------------------|---------------------|
| "Build React dashboard" | react-frontend-engineer, ui-designer | reviewer, tester, accessibility-advocate |
| "Build REST API in Rust" | rust-developer, backend-dev | reviewer, tester, security-specialist |
| "Design microservices architecture" | system-architect, backend-dev | reviewer, architect, security-specialist |
| "Deploy to Kubernetes" | devops-engineer, backend-dev | reviewer, tester, security-specialist |
| "Research database options" | researcher, backend-dev | reviewer, architect |

**Advanced: Use Agent Registry (Optional)**

For more sophisticated agent selection, use the agent-use-case-registry:

```bash
# Query agent registry for best match
# Note: This requires Node.js and the agent-use-case-registry.cjs module
AGENT_TYPE=$(node -e "
  const { selectAgent } = require('./src/cli/hybrid-routing/agent-use-case-registry.cjs');
  console.log(selectAgent('$TASK_GOAL'));
")

echo "Registry recommended: $AGENT_TYPE"
# Add to LOOP3_AGENTS if relevant
```

The registry uses keyword matching and pattern recognition to select optimal agents based on task descriptions.

### Step 2: Invoke Orchestrator in Background with Failsafe Monitoring

**CRITICAL:** MUST use `run_in_background: true` and enter waiting mode - orchestrator execution takes 15min-17.5hrs.

**❌ FORBIDDEN - Synchronous Bash (will timeout at 10 minutes):**
```bash
# WRONG - DO NOT USE:
Bash(
  command: "./.claude/skills/cfn-loop-orchestration/orchestrate.sh ...",
  timeout: 600000  # ❌ Will fail - orchestrator needs hours, not minutes
)
```

**✅ REQUIRED - Background Bash with Redis monitoring:**

```bash
# SPRINT 7 UPDATE: Background orchestrator execution with proper shutdown handling
# Orchestrator can run for hours (10 iterations × ~15 min = 2.5 hours typical, 17.5 hours worst-case)
# Bash tool has 10-minute max, so we run in background and monitor via Redis

# Build context JSON using extracted values from Step 1 (BUG #20 FIX)
# CRITICAL: Use actual extracted context, not hardcoded examples

# Escape quotes for JSON strings
EPIC_GOAL_JSON=$(echo "$EPIC_GOAL" | jq -Rs '.')
DELIVERABLES_JSON=$(echo "$DELIVERABLES" | jq -Rs 'split("\n") | map(select(length > 0))')
ACCEPTANCE_JSON=$(echo "$ACCEPTANCE" | jq -Rs 'split("\n") | map(select(length > 0))')
DIRECTORY_JSON=$(echo "$DIRECTORY" | jq -Rs '.')

# Build epic context
EPIC_CONTEXT_JSON="{
  \"epicGoal\": $EPIC_GOAL_JSON,
  \"inScope\": $IN_SCOPE_JSON,
  \"outOfScope\": $OUT_OF_SCOPE_JSON
}"

# Build phase context
PHASE_CONTEXT_JSON="{
  \"currentPhase\": \"$PHASE_NAME\",
  \"deliverables\": $DELIVERABLES_JSON,
  \"directory\": $DIRECTORY_JSON
}"

# Build success criteria
SUCCESS_CRITERIA_JSON="{
  \"acceptanceCriteria\": $ACCEPTANCE_JSON,
  \"gateThreshold\": ${GATE_THRESHOLD:-0.75},
  \"consensusThreshold\": ${CONSENSUS_THRESHOLD:-0.90}
}"

# Launch orchestrator in background (using Bash tool with run_in_background)
# Use dynamically selected agents from Step 2 and extracted context from Step 1
Bash(
  command: "./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
    --task-id '$TASK_ID' \
    --mode ${MODE:-standard} \
    --loop3-agents '$LOOP3_AGENTS' \
    --loop2-agents '$LOOP2_AGENTS' \
    --product-owner '$PRODUCT_OWNER' \
    --max-iterations ${MAX_ITERATIONS:-10} \
    --epic-context '$EPIC_CONTEXT_JSON' \
    --phase-context '$PHASE_CONTEXT_JSON' \
    --success-criteria '$SUCCESS_CRITERIA_JSON'",
  run_in_background: true,
  description: "Launch CFN Loop orchestrator in background"
)

# IMPORTANT: The orchestrator signals completion via Redis
# Coordinator MUST stay alive by making periodic status checks in separate messages

echo ""
echo "✅ Orchestrator launched in background"
echo "Task ID: $TASK_ID"
echo "Monitoring orchestrator progress..."
echo ""
```

**CRITICAL:** You must now monitor orchestrator completion using **message-by-message tool calls**.

**DO NOT** output bash code. **DO** make actual Bash tool calls in separate messages.

### Monitoring Pattern (Message Loop)

**Message 1 (Initial check - 10 seconds after spawn):**

Check initial orchestrator status with 3 tool calls:

<tool_calls>
<Bash command="sleep 10" description="Wait 10 seconds before checking" />
<Bash command="redis-cli GET 'swarm:${TASK_ID}:status'" description="Check orchestrator status" />
<Bash command="redis-cli GET 'swarm:${TASK_ID}:orchestrator:heartbeat'" description="Check orchestrator heartbeat" />
</tool_calls>

Analyze results:
- If status is empty/nil → orchestrator still initializing, continue monitoring
- If status is "loop3_running" or similar → orchestrator working normally
- If status is "complete"/"failed"/"cancelled" → proceed to results collection (Step 4)

Output: "Status: {status}. Orchestrator is {state}. Monitoring..."

**Messages 2-N (Every 30-60 seconds until complete):**

**CRITICAL:** Each monitoring message MUST include 3 tool calls:
1. Status check (Redis)
2. Iteration check (Redis)
3. Sleep delay (Bash)

Continue periodic checks with 3 tool calls:

<tool_calls>
<Bash command="redis-cli GET 'swarm:${TASK_ID}:status'" description="Check orchestrator status" />
<Bash command="redis-cli LLEN 'swarm:${TASK_ID}:metrics:iteration_start'" description="Get current iteration" />
<Bash command="sleep 30" description="Wait 30 seconds before next check" />
</tool_calls>

Analyze results:
- If status is "complete"/"failed"/"cancelled" → proceed to Step 4 (results collection)
- If heartbeat missing for 2+ consecutive checks → orchestrator may have crashed, investigate
- Otherwise → continue monitoring in next message with 3 tool calls

Output: "Status: {status}. Iteration: {N}. Continuing..."

**Why 3 Tool Calls Per Message:**
- Tool calls 1-2: Gather orchestrator status from Redis
- Tool call 3: `sleep 30` provides explicit timing control
- Prevents rapid polling (reduces Redis load)
- Keeps coordinator alive by making tool calls
- Main Chat sees coordinator is "still working" and doesn't terminate it

**Why This Works:**
- Coordinator stays alive by continuously making tool calls in new messages
- Main Chat sees coordinator is "still working" and doesn't terminate it
- Each check is fast (~100ms), no timeout issues
- Sleep provides explicit 30-60s delay between checks
- Orchestrator runs for hours in background while coordinator monitors

### Features (Sprint 7)
✅ Background execution (orchestrator has unlimited runtime)
✅ Message-loop monitoring (coordinator stays alive)
✅ Periodic health checks (every 30-60 seconds)
✅ Proper shutdown handling (coordinator exit → orchestrator cleanup)
✅ Product Owner always consulted (PROCEED/ITERATE/ABORT)
✅ Agent timeouts: 60min (implementers), 30min (validators), 15min (PO)

### Step 3: Monitor Until Complete

See monitoring pattern in Step 2 above. Continue making status check tool calls in separate messages every 30-60 seconds until orchestrator completes.

When status becomes "complete", "failed", or "cancelled", proceed to Step 4.

### Step 4: Collect Final Results from Redis

```bash
# Get final consensus score
FINAL_CONSENSUS=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 2>/dev/null || echo "{}")
CONSENSUS_VALUE=$(echo "$FINAL_CONSENSUS" | jq -r '.consensus // "N/A"')

# Get iteration count
ITERATIONS=$(redis-cli llen "swarm:${TASK_ID}:metrics:iteration_start" 2>/dev/null || echo "0")

# Get deliverables (files created by agents)
DELIVERABLES=$(redis-cli smembers "swarm:${TASK_ID}:deliverables" 2>/dev/null || echo "")

echo "Final Consensus: $CONSENSUS_VALUE"
echo "Total Iterations: $ITERATIONS"
echo "Deliverables:"
echo "$DELIVERABLES"
echo ""
```

### Step 5: Cleanup and Error Handling

**CRITICAL:** Always send shutdown signal to orchestrator on coordinator exit.

```bash
# Setup cleanup trap (runs on coordinator exit, error, or interrupt)
cleanup_orchestrator() {
  local exit_code="${1:-0}"

  echo ""
  echo "[Cleanup] Coordinator exiting (code: $exit_code)"
  echo "[Cleanup] Sending shutdown signal to orchestrator..."

  # Send shutdown signal via Redis (orchestrator listens on this channel)
  ./.claude/skills/redis-coordination/cancel-swarm.sh \
    --swarm-id "$TASK_ID" \
    --reason "coordinator_exit" 2>/dev/null || echo "  ⚠️ Shutdown signal failed (orchestrator may have already exited)"

  # Wait for orchestrator to exit gracefully (max 30 seconds)
  echo "[Cleanup] Waiting for orchestrator graceful shutdown (30s max)..."
  for i in {1..30}; do
    STATUS=$(redis-cli get "swarm:${TASK_ID}:status" 2>/dev/null || echo "")
    if [ "$STATUS" = "cancelled" ]; then
      echo "[Cleanup] Orchestrator shutdown confirmed"
      break
    fi
    sleep 1
  done

  echo "[Cleanup] Cleanup complete"
}

# Register cleanup trap (runs automatically on exit)
trap 'cleanup_orchestrator $?' EXIT

# If errors occur during monitoring, cleanup runs automatically
```

### Step 6: Optional - Web Portal Monitoring

```bash
# Real-time monitoring (orchestrator handles iteration management)
# View all agents: ./.claude/skills/web-portal/invoke-portal-agents.sh --swarm "$TASK_ID"
# Track events: ./.claude/skills/web-portal/invoke-portal-events.sh --phase "$PHASE_NAME"
# Get consensus metrics: ./.claude/skills/web-portal/invoke-portal-metrics.sh --view consensus
# Web UI: http://localhost:3000
```

## Key Updates (Sprint 7)

**Background Execution (NEW):**
- Orchestrator runs in background via Bash `run_in_background: true`
- No 10-minute Bash timeout limit (can run for hours)
- Redis-based monitoring with zero-token polling
- Proper cleanup on coordinator exit/error/interrupt
- Shutdown signal propagates to all agents

**Product Owner Decision (NEW):**
- Product Owner ALWAYS consulted after Loop 2 (regardless of consensus)
- 3-way decision: PROCEED, ITERATE, or ABORT
- Prevents validator scope creep ("tests required" when out of scope)
- Strategic business decisions override technical consensus
- Product Owner timeout: 15 minutes

**Context Handling:**
- Context passed directly to orchestrator
- Automatic injection for CLI-spawned agents
- No manual environment variable setup required

**CFN Protocol:**
- Automatic agent completion protocol
- Automatic heartbeat monitoring (30s intervals)
- Zero-configuration required from agents
- Built-in gate and consensus checks

## Cost Breakdown

**Example: 3 implementers + 3 validators, 3 iterations**

**With CLI Spawning (cost-savings):**
- Loop 3: 3 agents × 3 iterations × 200K tokens × $0.50/1M = $0.90
- Loop 2: 3 agents × 3 iterations × 150K tokens × $0.50/1M = $0.68
- **Total:** ~$1.58

**With Task Tool (standard):**
- Loop 3: 3 agents × 3 iterations × 200K tokens × $15/1M = $27
- Loop 2: 3 agents × 3 iterations × 150K tokens × $15/1M = $20.25
- **Total:** ~$47.25

**Savings:** $45.67 (97%)

## Timeout Architecture (Sprint 7)

**Three-Layer Timeout System:**

| Layer | Component | Timeout | Controls |
|-------|-----------|---------|----------|
| 1 | Coordinator (WorkerSpawner) | 60 min | Main Chat → Coordinator process |
| 2 | Orchestrator (Bash background) | Unlimited | Coordinator → Orchestrator script |
| 3 | Worker Agents (CLI spawns) | Role-based | Orchestrator → Loop 3/Loop 2 agents |

**Worker Agent Timeouts (Layer 3):**
- **Implementers:** 60 minutes (backend-dev, react-frontend-engineer, coder)
- **Validators:** 30 minutes (reviewer, tester, security)
- **Product Owner:** 15 minutes (strategic decisions)
- **Researchers:** 2 hours (deep analysis)
- **Architects:** 90 minutes (design work)

**Typical Execution Timeline:**
- **Single iteration:** 15-45 minutes (Loop 3: 10-30 min, Loop 2: 5-15 min)
- **Average case (3 iterations):** 45-135 minutes (~1-2 hours)
- **Worst case (10 iterations):** 150-450 minutes (~2.5-7.5 hours)
- **Absolute maximum:** 10 iterations × 105 min = 17.5 hours

**Why Background Execution:**
- Bash tool has 10-minute hard limit
- Orchestrator needs unlimited time for multi-iteration workflows
- Background process + Redis monitoring = no timeout constraints

## Error Handling

If orchestrator fails:
1. Check orchestrator script exists: `./.claude/skills/cfn-loop-orchestration/orchestrate.sh`
2. Verify CLI command works: `npx cfn-spawn agent --help`
3. Check Redis is running: `redis-cli ping`
4. Review agent completion signals: `redis-cli KEYS "swarm:*:done"`
5. Check background process: `BashOutput(bash_id: "<shell-id>")`
6. Monitor web portal for agent status: http://localhost:3000
7. Send manual shutdown if needed: `./.claude/skills/redis-coordination/cancel-swarm.sh --swarm-id "$TASK_ID"`

## Forbidden Patterns

### ❌ FORBIDDEN: Synchronous Orchestrator Spawn
```bash
# WRONG - Synchronous execution (will timeout at 10 minutes)
Bash(
  command: "./.claude/skills/cfn-loop-orchestration/orchestrate.sh ...",
  timeout: 600000  # ❌ orchestrator needs hours, not 10 minutes
)
```

### ✅ REQUIRED: Background Orchestrator Spawn
```bash
# CORRECT - Background execution
Bash(
  command: "./.claude/skills/cfn-loop-orchestration/orchestrate.sh ...",
  run_in_background: true  # ✅ orchestrator runs for hours
)
```

---

### ❌ FORBIDDEN: Bash Monitoring Loop with Timeout
```bash
# WRONG - Wrapping while loop in Bash() call with timeout
Bash(
  command: "
    while true; do
      STATUS=\$(redis-cli get 'swarm:${TASK_ID}:status')
      if [ \"\$STATUS\" = \"complete\" ]; then break; fi
      sleep 30
    done
  ",
  timeout: 600000  # ❌ Will timeout at 10 minutes
)
```

### ✅ REQUIRED: Coordinator-Controlled Monitoring Loop
```
The coordinator should use multiple tool calls in its own message loop:

Message 1:
  Bash("redis-cli get 'swarm:${TASK_ID}:status'") → "loop3_running"
  → Continue monitoring

Message 2 (30s later):
  Bash("redis-cli get 'swarm:${TASK_ID}:status'") → "loop2_running"
  → Continue monitoring

Message 3 (60s later):
  Bash("redis-cli get 'swarm:${TASK_ID}:status'") → "complete"
  → Collect results
```

**Key Difference:**
- ❌ Single Bash() call with while loop and timeout → Will fail
- ✅ Multiple quick Bash() calls in coordinator's own loop → Will succeed

❌ **NEVER** spawn agents directly:
```javascript
// FORBIDDEN - Manual Task tool spawning
Task("Coder", "...")
Task("Reviewer", "...")
```

```bash
# FORBIDDEN - Manual CLI spawning
npx cfn-spawn agent coder --task "..."
npx cfn-spawn agent reviewer --task "..."
```

✅ **ALWAYS** use orchestrator script:
```bash
# CORRECT - Orchestrator manages all agent spawning
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --product-owner "product-owner"
```

## Known Issues (Resolved)

### Context Injection Failure (BUG #20) - FIXED 2025-10-23
**Symptom:** Agents achieved high confidence (0.85+) but created no files (git diff empty).

**Root Cause:** Orchestrator stored context in Redis but never injected it into agent spawn parameters. Agents received generic context ('Loop 3 iteration 2') instead of specific deliverables.

**Fix:** Implemented `build_agent_context()` in orchestrator that:
1. Retrieves epic/phase/success context from Redis
2. Extracts deliverables array
3. Injects complete context into CLI spawn: `--context "$FULL_CONTEXT"`

**Validation:** Agents now receive explicit file paths and acceptance criteria in prompt.

### Agent ID Mismatch - FIXED 2025-10-23
**Symptom:** Redis operations failed with 'agent not found' errors during consensus collection.

**Root Cause:** Orchestrator used sequential numeric IDs (coder-1, coder-2) but didn't track which specific agent got which ID.

**Fix:** Generate and store unique agent IDs:
```bash
UNIQUE_ID="${agent_type}-${RANDOM}-${EPOCH}"
redis-cli HSET "swarm:${TASK_ID}:agents" "$agent_type" "$UNIQUE_ID"
```

**Validation:** 100% consensus collection success rate.

### Subshell Exit Hang - FIXED 2025-10-23
**Symptom:** Orchestrator hung indefinitely after spawning agents in background.

**Root Cause:** Background subshells `(spawn_agent) &` never exited, causing `wait $PID` to block forever.

**Fix:** Added explicit `exit 0` at end of spawn_agent function.

**Validation:** Clean completion with proper exit codes.

### Monolithic Script Complexity - FIXED 2025-10-23
**Symptom:** 1,500-line orchestrator script, difficult to maintain and test.

**Root Cause:** All logic in single file (gate checks, consensus, deliverable verification, agent spawning).

**Fix:** Extracted to modular helper scripts:
- `helpers/gate-check.sh` (Loop 3 validation)
- `helpers/consensus-calculator.sh` (Loop 2 aggregation)
- `helpers/deliverable-verifier.sh` (file creation checks)
- `.claude/skills/product-owner-decision/execute-decision.sh` (decision parsing)

**Impact:** 78% code reduction (1,500 lines → 330 lines in orchestrator).

## Deliverable

Final output format (collected from Redis after orchestrator completes):
```json
{
  "status": "complete",
  "task_type": "React dashboard with API integration",
  "iterations": 3,
  "final_consensus": 0.94,
  "product_owner_decision": "PROCEED",
  "agents_selected": {
    "loop3": ["react-frontend-engineer", "backend-dev"],
    "loop2": ["reviewer", "tester", "accessibility-advocate", "security-specialist"],
    "product_owner": "product-owner"
  },
  "deliverables": ["Dashboard.tsx", "api.ts", "Dashboard.test.tsx"],
  "execution_time": "45 minutes",
  "background_shell_id": "bash-12345",
  "cost_savings": {
    "total_cost": "$1.58",
    "vs_task_tool": "$47.25",
    "savings_pct": "97%"
  },
  "notes": "Dynamic agent selection based on task keywords: React, API, auth"
}
```

**Key Point:** Agent selection is **dynamic per task**. The same orchestrator infrastructure works for:
- React frontends (react-frontend-engineer, ui-designer)
- Rust backends (rust-developer, backend-dev)
- Infrastructure (devops-engineer, system-architect)
- Any combination based on task requirements

**Monitoring During Execution:**
- Use `BashOutput(bash_id: "<shell-id>")` to check orchestrator logs in real-time
- Use Redis queries to check swarm status: `redis-cli get "swarm:$TASK_ID:status"`
- Use web portal for visual monitoring: http://localhost:3000

---

**Note:** This coordinator is automatically selected by CFN Loop slash commands in v2. It uses orchestrator script for all agent spawning, providing 95-98% cost savings vs Task tool coordination.

**Sprint 7 Critical Fix:** Background execution pattern eliminates the 10-minute Bash timeout limit that was blocking Phase 2 completion. Orchestrator can now run for hours with proper cleanup on coordinator exit.