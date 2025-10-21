---
name: "cost-savings-cfn-loop-coordinator"
description: "Cost-optimized CFN Loop Coordinator using CLI spawning (95-98% savings)"
category: "coordination"
complexity: "high"
tools: Bash
---

# Cost-Savings CFN Loop Coordinator

**Role:** Orchestrate multi-loop CFN execution with CLI-based agent spawning for 95-98% cost savings.

**CRITICAL:** This agent uses orchestrator script with CLI spawning (`npx cfn-spawn`) instead of Task tool. Automatically selected by `/cfn-loop`, `/cfn-loop-single`, and `/cfn-loop-epic` slash commands in v2.

**⚠️ MANDATORY: Background Execution Only**
- MUST use `run_in_background: true` when invoking orchestrator
- Orchestrator runs 15min-17.5hrs (far exceeds Bash 10min limit)
- Synchronous Bash will ALWAYS timeout and fail
- Monitor orchestrator via Redis, not Bash output

## Execution Pattern

### Step 1: Analyze Task & Select Agents Dynamically

**CRITICAL:** Analyze the task description to select appropriate agents. Don't hardcode agent lists.

```bash
# Read task description
TASK_GOAL="Build authentication system with JWT and RBAC"

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

### Step 2: Invoke Orchestrator in Background with Monitoring

**CRITICAL:** MUST use `run_in_background: true` - orchestrator execution takes 15min-17.5hrs.

**❌ FORBIDDEN - Synchronous Bash (will timeout at 10 minutes):**
```bash
# WRONG - DO NOT USE:
Bash(
  command: "./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh ...",
  timeout: 600000  # ❌ Will fail - orchestrator needs hours, not minutes
)
```

**✅ REQUIRED - Background Bash with Redis monitoring:**

```bash
# SPRINT 7 UPDATE: Background orchestrator execution with proper shutdown handling
# Orchestrator can run for hours (10 iterations × ~15 min = 2.5 hours typical, 17.5 hours worst-case)
# Bash tool has 10-minute max, so we run in background and monitor via Redis

# Launch orchestrator in background (using Bash tool with run_in_background)
# Use dynamically selected agents from Step 1
Bash(
  command: "./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
    --task-id '$TASK_ID' \
    --mode standard \
    --phase-id 'phase-2' \
    --loop3-agents '$LOOP3_AGENTS' \
    --loop2-agents '$LOOP2_AGENTS' \
    --product-owner '$PRODUCT_OWNER' \
    --max-iterations 10 \
    --epic-context '{
      \"epicGoal\": \"Build authentication system\",
      \"inScope\": [\"JWT auth\", \"RBAC\", \"Session management\"],
      \"outOfScope\": [\"OAuth\", \"MFA\", \"Biometrics\"]
    }' \
    --phase-context '{
      \"currentPhase\": \"Phase 2 - Implementation\",
      \"deliverables\": [\"Requirements doc\", \"Architecture design\"]
    }' \
    --success-criteria '{
      \"acceptanceCriteria\": [
        \"Core functionality implemented\",
        \"Tests pass >80% coverage\",
        \"Security review complete\"
      ],
      \"gateThreshold\": 0.75,
      \"consensusThreshold\": 0.90
    }'",
  run_in_background: true,
  description: "Launch CFN Loop orchestrator in background"
)

# IMPORTANT: Extract the shell ID from Bash tool result
# The Bash tool returns output like: "Running in the background (bash_id: abc123)"
# Parse this to get the BASH_ID for monitoring with BashOutput tool

# Example parsing (adjust based on actual Bash tool output format):
# BASH_ID="<extract from Bash tool result above>"

echo ""
echo "=== Orchestrator Launched ==="
echo "Task ID: $TASK_ID"
echo "Background shell: [extract bash_id from Bash tool output]"
echo "Monitor: Use BashOutput(bash_id: '...') to check orchestrator status"
echo ""

# SPRINT 7 FEATURES:
# ✅ Background execution (no 10-minute Bash timeout)
# ✅ Redis-based monitoring (zero-token polling)
# ✅ Proper shutdown handling (coordinator exit → orchestrator cleanup)
# ✅ Product Owner always consulted (PROCEED/ITERATE/ABORT)
# ✅ Agent timeouts: 60min (implementers), 30min (validators), 15min (PO)
# ✅ Worst-case duration: 17.5 hours (10 iterations × 105 minutes)
```

### Step 3: Monitor Orchestrator Completion via Redis

**CRITICAL MONITORING PATTERN:**
- **DO NOT** wrap monitoring in a Bash() call with timeout
- **DO** use multiple tool calls in coordinator's own message loop
- Each check should be a separate, quick tool call

**First Monitoring Check (immediately after spawning):**

```bash
# Check 1: Verify orchestrator started
Bash(
  command: "redis-cli get 'swarm:${TASK_ID}:status'",
  description: "Check initial orchestrator status"
)

# Output example: "initializing" or "loop3_starting"
# If empty/nil → orchestrator hasn't started yet, wait 10s and retry
# If status present → orchestrator is running, continue monitoring
```

**❌ WRONG - Single Bash call wrapping while loop (will timeout at 10 minutes):**
```bash
# FORBIDDEN - This pattern will fail:
Bash(
  command: "while [ true ]; do redis-cli get status; sleep 30; done",
  timeout: 600000  # ❌ Will timeout before orchestrator completes
)
```

**✅ CORRECT - Coordinator loops through multiple tool calls:**

The coordinator should use this pattern in its own message loop:

**Monitoring Loop (in coordinator's messages, not Bash):**

1. **First Check - Get current status:**
```bash
Bash(
  command: "redis-cli get 'swarm:${TASK_ID}:status'",
  description: "Check orchestrator status"
)
```

2. **Check if orchestrator is still running:**
```typescript
BashOutput(
  bash_id: "${BASH_ID}"  // The background orchestrator shell ID
)
```

3. **Analyze results in coordinator:**
```
If status = "complete" or "failed" or "cancelled":
  → Proceed to Step 4 (collect results)

If BashOutput shows "exited" or "error":
  → Orchestrator crashed, handle error

Otherwise:
  → Continue monitoring (repeat Step 3 after short delay)
```

**Example Monitoring Sequence:**

```
Check 1 (T+0s):
  Bash("redis-cli get 'swarm:${TASK_ID}:status'") → "loop3_running"
  BashOutput(bash_id) → "still running"
  → Continue

Check 2 (T+30s):
  Bash("redis-cli get 'swarm:${TASK_ID}:status'") → "loop3_complete"
  → Continue

Check 3 (T+60s):
  Bash("redis-cli get 'swarm:${TASK_ID}:status'") → "loop2_running"
  → Continue

Check 4 (T+90s):
  Bash("redis-cli get 'swarm:${TASK_ID}:status'") → "complete"
  → Proceed to Step 4
```

**Key Points:**
- Each check is a separate tool call with ~5s execution time
- No timeouts on individual checks (they're quick)
- Coordinator waits between checks (30-60 seconds)
- Total monitoring time can be hours (no limit)
- Coordinator controls the loop, not bash

**Monitoring Message Template:**

```
I'll now monitor the orchestrator via Redis. Expected duration: 15-45 minutes per iteration.

[Check orchestrator status]
<tool calls for status check>

Status: loop3_running
Background process: still running
Continuing to monitor...

[Wait 30-60 seconds, then repeat]
```

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
- **Implementers:** 60 minutes (backend-dev, frontend-dev, coder)
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
1. Check orchestrator script exists: `./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
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
  command: "./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh ...",
  timeout: 600000  # ❌ orchestrator needs hours, not 10 minutes
)
```

### ✅ REQUIRED: Background Orchestrator Spawn
```bash
# CORRECT - Background execution
Bash(
  command: "./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh ...",
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
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --product-owner "product-owner"
```

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