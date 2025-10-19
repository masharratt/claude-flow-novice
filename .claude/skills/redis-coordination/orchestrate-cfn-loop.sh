#!/usr/bin/env bash

##############################################################################
# CFN Loop Orchestration v2.0.0
# Manages multi-loop CFN execution with dependency tracking and consensus
#
# Usage:
#   ./orchestrate-cfn-loop.sh --task-id <id> \
#                             --mode <mvp|standard|enterprise> \
#                             --loop3-agents <agent1,agent2,...> \
#                             --loop2-agents <agent1,agent2,...> \
#                             --product-owner <agent-id> \
#                             [--max-iterations <n>] \
#                             [--min-quorum-loop3 <n|n%|0.n>] \
#                             [--min-quorum-loop2 <n|n%|0.n>]
#
# CFN Loop Structure (CORRECTED):
#   Loop 3 (Primary Swarm - Self Validation)
#     ↓
#   IF Loop 3 self-validation gate FAILS → RELAUNCH Loop 3 (skip Loop 2)
#   IF Loop 3 self-validation gate PASSES → Proceed to Loop 2
#     ↓
#   Loop 2 (Consensus Validators)
#     ↓
#   Product Owner Decision
#
# Dependency Enforcement:
#   - Loop 3 agents self-validate via confidence scores
#   - Gate check determines if Loop 2 validators should be engaged
#   - Loop 2 agents WAIT for gate pass signal before starting work
#   - Product Owner BLOCKS until all Loop 2 agents signal completion
#   - Uses Redis BLPOP for zero-token waiting
#
# Quorum Configuration:
#   - Absolute: --min-quorum-loop3 3 (requires exactly 3 agents)
#   - Percentage: --min-quorum-loop3 85% (requires 85% of agents)
#   - Decimal: --min-quorum-loop3 0.66 (requires 66% of agents)
#   - Default: 0.66 (2/3 majority) if not specified
#
# Agent Requirements:
#   Loop 3 (Implementers):
#     1. Complete work
#     2. Signal done: redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
#     3. Report confidence: invoke-waiting-mode.sh report --confidence <0.0-1.0>
#     4. Enter waiting: invoke-waiting-mode.sh enter (for potential iteration)
#
#   Loop 2 (Validators):
#     1. WAIT for gate pass: redis-cli blpop "swarm:${TASK_ID}:gate-passed" 0
#     2. Retrieve Loop 3 results for review
#     3. Perform validation
#     4. Signal done: redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
#     5. Report consensus: invoke-waiting-mode.sh report --confidence <0.0-1.0>
#     6. Enter waiting: invoke-waiting-mode.sh enter (for potential iteration)
##############################################################################

set -euo pipefail

# Configuration
TASK_ID=""
MODE="standard"
LOOP3_AGENTS=""
LOOP2_AGENTS=""
PRODUCT_OWNER=""
MAX_ITERATIONS=10
TIMEOUT=3600  # 1 hour timeout for agent completion
RETRY_COUNT=3
RETRY_DELAY=5000  # Base delay in milliseconds
MIN_QUORUM_LOOP3=""  # Minimum agents required for Loop 3 (absolute or percentage)
MIN_QUORUM_LOOP2=""  # Minimum agents required for Loop 2 (absolute or percentage)
ORCHESTRATOR_PID=$$
SHUTDOWN_MONITOR_PID=""
SHUTDOWN_REQUESTED=0
LOOP3_HEARTBEAT_MONITOR_PID=""
LOOP2_HEARTBEAT_MONITOR_PID=""

# Thresholds by mode
declare -A GATE_THRESHOLD=(
  [mvp]=0.70
  [standard]=0.75
  [enterprise]=0.75
)

declare -A CONSENSUS_THRESHOLD=(
  [mvp]=0.80
  [standard]=0.90
  [enterprise]=0.95
)

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --loop3-agents)
      LOOP3_AGENTS="$2"
      shift 2
      ;;
    --loop2-agents)
      LOOP2_AGENTS="$2"
      shift 2
      ;;
    --product-owner)
      PRODUCT_OWNER="$2"
      shift 2
      ;;
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --retry-count)
      RETRY_COUNT="$2"
      shift 2
      ;;
    --retry-delay)
      RETRY_DELAY="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --min-quorum-loop3)
      MIN_QUORUM_LOOP3="$2"
      shift 2
      ;;
    --min-quorum-loop2)
      MIN_QUORUM_LOOP2="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$TASK_ID" ] || [ -z "$LOOP3_AGENTS" ] || [ -z "$LOOP2_AGENTS" ] || [ -z "$PRODUCT_OWNER" ]; then
  echo "Error: Required parameters missing"
  echo "Usage: $0 --task-id <id> --mode <mode> --loop3-agents <agents> --loop2-agents <agents> --product-owner <agent>"
  exit 1
fi

GATE=${GATE_THRESHOLD[$MODE]}
CONSENSUS=${CONSENSUS_THRESHOLD[$MODE]}

# Set default quorum values if not specified (66% = 2/3 majority)
MIN_QUORUM_LOOP3=${MIN_QUORUM_LOOP3:-0.66}
MIN_QUORUM_LOOP2=${MIN_QUORUM_LOOP2:-0.66}

##############################################################################
# Shutdown Handling Functions
##############################################################################
function cleanup_and_exit() {
  local exit_code="${1:-130}"
  local reason="${2:-user_interrupt}"

  # Set shutdown flag to stop any ongoing operations
  SHUTDOWN_REQUESTED=1

  echo ""
  echo "=============================================="
  echo "🛑 Orchestrator shutting down gracefully..."
  echo "=============================================="
  echo "Reason: $reason"
  echo "Exit Code: $exit_code"

  # Kill shutdown monitor if running
  if [ -n "$SHUTDOWN_MONITOR_PID" ] && kill -0 "$SHUTDOWN_MONITOR_PID" 2>/dev/null; then
    kill "$SHUTDOWN_MONITOR_PID" 2>/dev/null || true
    wait "$SHUTDOWN_MONITOR_PID" 2>/dev/null || true
  fi

  # Stop heartbeat monitors if running
  if [ -n "${LOOP3_HEARTBEAT_MONITOR_PID:-}" ]; then
    echo "Stopping Loop 3 heartbeat monitor..."
    stop_heartbeat_monitor "$TASK_ID" "loop3" "$LOOP3_HEARTBEAT_MONITOR_PID"
  fi
  if [ -n "${LOOP2_HEARTBEAT_MONITOR_PID:-}" ]; then
    echo "Stopping Loop 2 heartbeat monitor..."
    stop_heartbeat_monitor "$TASK_ID" "loop2" "$LOOP2_HEARTBEAT_MONITOR_PID"
  fi

  # Mark swarm as cancelled if initialized
  if [ -n "$TASK_ID" ] && [ -n "${SWARM_ID:-}" ]; then
    echo "Marking swarm as cancelled..."
    ./.claude/skills/redis-coordination/complete-swarm.sh \
      --swarm-id "$SWARM_ID" \
      --final-metric "status=cancelled" \
      --final-metric "shutdown_reason=$reason" 2>/dev/null || echo "  ⚠️ Failed to mark swarm as cancelled"
  fi

  # Clean up Redis keys
  if [ -n "$TASK_ID" ]; then
    echo "Cleaning up Redis keys..."
    local keys_deleted=$(redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL 2>/dev/null || echo "0")
    echo "  Deleted $keys_deleted Redis keys"
  fi

  # Clean up heartbeat monitor marker files
  rm -f /tmp/heartbeat-monitor-${TASK_ID}-*.active 2>/dev/null || true

  echo "=============================================="
  echo "Shutdown complete"
  echo "=============================================="

  exit "$exit_code"
}

# Trap SIGTERM and SIGINT for graceful shutdown
trap 'echo "[TRAP] Caught SIGINT" >&2; cleanup_and_exit 130 "SIGINT_received"' SIGINT
trap 'echo "[TRAP] Caught SIGTERM" >&2; cleanup_and_exit 143 "SIGTERM_received"' SIGTERM

##############################################################################
# Start Shutdown Monitor (Background Process)
##############################################################################
function start_shutdown_monitor() {
  local task_id="$1"

  (
    # Block on shutdown channel (zero-token waiting)
    SHUTDOWN_KEY="swarm:${task_id}:shutdown"
    SHUTDOWN_RESULT=$(redis-cli BLPOP "$SHUTDOWN_KEY" 0 2>/dev/null || echo "")

    if [ -n "$SHUTDOWN_RESULT" ]; then
      # Extract shutdown payload (format: key value)
      SHUTDOWN_PAYLOAD=$(echo "$SHUTDOWN_RESULT" | tail -1)
      REASON=$(echo "$SHUTDOWN_PAYLOAD" | jq -r '.reason // "external_shutdown"' 2>/dev/null || echo "external_shutdown")

      echo ""
      echo "🛑 Shutdown signal received from Redis channel: $REASON"
      echo "  Sending SIGTERM to orchestrator PID: $ORCHESTRATOR_PID"

      # Send SIGTERM to main orchestrator process
      if kill -TERM "$ORCHESTRATOR_PID" 2>/dev/null; then
        echo "  ✅ SIGTERM sent successfully"
      else
        echo "  ❌ Failed to send SIGTERM (process may have already exited)"
        exit 0
      fi
    fi
  ) &

  SHUTDOWN_MONITOR_PID=$!
  echo "Shutdown monitor started (PID: $SHUTDOWN_MONITOR_PID)"
}

##############################################################################
# Quorum Calculation Function
##############################################################################
function calculate_quorum() {
  local quorum_spec="$1"
  local total_agents="$2"

  # If no quorum specified, require all agents
  if [ -z "$quorum_spec" ]; then
    echo "$total_agents"
    return 0
  fi

  # Check if percentage format (e.g., "85%")
  if [[ "$quorum_spec" =~ %$ ]]; then
    # Extract percentage value (remove % suffix)
    local pct="${quorum_spec%\%}"
    # Calculate: ceil(total_agents * pct / 100)
    echo "scale=0; ($total_agents * $pct + 50) / 100" | bc
  # Check if decimal (0.0-1.0), treat as fraction
  elif [[ "$quorum_spec" =~ ^0?\.[0-9]+$ ]]; then
    # Calculate: ceil(total_agents * fraction)
    echo "scale=0; ($quorum_spec * $total_agents + 0.5) / 1" | bc
  else
    # Absolute number - validate it doesn't exceed total
    if [ "$quorum_spec" -gt "$total_agents" ]; then
      echo "Error: Quorum ($quorum_spec) exceeds total agents ($total_agents)" >&2
      return 1
    fi
    echo "$quorum_spec"
  fi
}

##############################################################################
# Dead Letter Queue (DLQ) Functions
##############################################################################
function write_to_dlq() {
  local agent="$1"
  local reason="$2"
  local retry_count="$3"

  DLQ_KEY="swarm:${TASK_ID}:dlq:${agent}"
  DLQ_ENTRY=$(jq -n \
    --arg reason "$reason" \
    --arg retries "$retry_count" \
    --arg ts "$(date +%s)" \
    '{reason: $reason, retry_count: ($retries | tonumber), timestamp: ($ts | tonumber)}')

  echo "$DLQ_ENTRY" | redis-cli -x LPUSH "$DLQ_KEY" >/dev/null
  redis-cli EXPIRE "$DLQ_KEY" 604800 >/dev/null  # 7 days TTL

  echo "  ❌ $agent → DLQ (reason: $reason, retries: $retry_count)"
}

##############################################################################
# Exponential Backoff Retry Function
##############################################################################
function retry_with_backoff() {
  local agent="$1"
  local attempt="$2"
  local max_retries="$3"
  local base_delay="$4"

  # Check for shutdown before sleeping
  if [ "$SHUTDOWN_REQUESTED" -eq 1 ]; then
    echo "  [SHUTDOWN] Skipping backoff delay for $agent" >&2
    return 0
  fi

  # Exponential backoff: delay = base_delay * (2 ^ attempt)
  local delay=$(echo "$base_delay * (2 ^ $attempt)" | bc)
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  echo "  [$timestamp] [Retry $attempt/$max_retries] Waiting ${delay}ms before retry for $agent..."

  # Use interruptible sleep - sleep in small increments and check for shutdown
  local delay_sec=$(echo "scale=3; $delay / 1000" | bc)
  local elapsed=0
  while (( $(echo "$elapsed < $delay_sec" | bc -l) )); do
    # Sleep for 0.5s increments (or remaining time if less)
    local remaining=$(echo "$delay_sec - $elapsed" | bc)
    local sleep_time=$(echo "if ($remaining < 0.5) $remaining else 0.5" | bc)

    sleep "$sleep_time" &
    wait $! 2>/dev/null || return 0  # If wait is interrupted (SIGTERM), return immediately

    elapsed=$(echo "$elapsed + $sleep_time" | bc)

    # Check for shutdown after each sleep increment
    if [ "$SHUTDOWN_REQUESTED" -eq 1 ]; then
      echo "  [SHUTDOWN] Interrupted backoff delay for $agent" >&2
      return 0
    fi
  done
}

##############################################################################
# Heartbeat Monitoring Functions
##############################################################################
declare -A MISSED_HEARTBEATS  # Track missed heartbeats per agent

function check_agent_heartbeat() {
  local agent="$1"
  local task_id="$2"

  HB_KEY="swarm:${task_id}:${agent}:heartbeat"
  HB_DATA=$(redis-cli GET "$HB_KEY" 2>/dev/null || echo "")

  if [ -z "$HB_DATA" ] || [ "$HB_DATA" = "(nil)" ]; then
    return 1  # Dead
  else
    return 0  # Alive
  fi
}

function check_heartbeats_loop() {
  local task_id="$1"
  local loop_name="$2"
  shift 2
  local agents=("$@")

  for AGENT in "${agents[@]}"; do
    # Skip agents already marked as failed
    if [[ " ${LOOP3_FAILED_AGENTS[@]} ${LOOP2_FAILED_AGENTS[@]} " =~ " ${AGENT} " ]]; then
      continue
    fi

    if ! check_agent_heartbeat "$AGENT" "$task_id"; then
      MISSED_HEARTBEATS["$AGENT"]=$((${MISSED_HEARTBEATS["$AGENT"]:-0} + 1))

      if [ ${MISSED_HEARTBEATS["$AGENT"]} -ge 2 ]; then
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        echo "  [$timestamp] [$loop_name] ⚠️ $AGENT appears hung (no heartbeat for 60s)" >&2

        # Determine which loop this agent belongs to and check quorum
        if [[ " ${LOOP3_AGENTS} " =~ " ${AGENT} " ]]; then
          REMAINING=$((${#LOOP3_COMPLETED_AGENTS[@]}))
          REQUIRED=$(calculate_quorum "$MIN_QUORUM_LOOP3" "$LOOP3_TOTAL")
        elif [[ " ${LOOP2_AGENTS} " =~ " ${LOOP2_AGENTS} " ]]; then
          REMAINING=$((${#LOOP2_COMPLETED_AGENTS[@]}))
          REQUIRED=$(calculate_quorum "$MIN_QUORUM_LOOP2" "$LOOP2_TOTAL")
        else
          continue
        fi

        if [ $REMAINING -ge $REQUIRED ]; then
          echo "  [$timestamp] [$loop_name] ℹ️ Continuing with quorum (${REMAINING}/${REQUIRED} agents)" >&2
        else
          echo "  [$timestamp] [$loop_name] ⚠️ Cannot meet quorum without $AGENT (${REMAINING}/${REQUIRED})" >&2
        fi
      fi
    else
      MISSED_HEARTBEATS["$AGENT"]=0  # Reset counter
    fi
  done
}

function start_heartbeat_monitor() {
  local task_id="$1"
  local loop_name="$2"
  shift 2
  local agents=("$@")

  # Create marker file for this monitor
  local monitor_marker="/tmp/heartbeat-monitor-${task_id}-${loop_name}.active"
  touch "$monitor_marker"

  (
    while [ -f "$monitor_marker" ]; do
      # Check for shutdown
      if [ "$SHUTDOWN_REQUESTED" -eq 1 ]; then
        break
      fi

      check_heartbeats_loop "$task_id" "$loop_name" "${agents[@]}"
      sleep 30
    done
  ) &

  echo "$!"  # Return PID
}

function stop_heartbeat_monitor() {
  local task_id="$1"
  local loop_name="$2"
  local monitor_pid="$3"

  # Remove marker file to stop the monitor loop
  rm -f "/tmp/heartbeat-monitor-${task_id}-${loop_name}.active"

  # Kill monitor process if still running
  if [ -n "$monitor_pid" ] && kill -0 "$monitor_pid" 2>/dev/null; then
    kill "$monitor_pid" 2>/dev/null || true
    wait "$monitor_pid" 2>/dev/null || true
  fi
}

##############################################################################
# Get Agent-Specific Timeout
##############################################################################
function get_agent_timeout() {
  local agent="$1"
  local task_id="$2"

  # Use get-agent-timeout.sh helper script
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  AGENT_TIMEOUT=$("$SCRIPT_DIR/get-agent-timeout.sh" --task-id "$task_id" --agent-id "$agent" 2>/dev/null || echo "$TIMEOUT")

  echo "$AGENT_TIMEOUT"
}

##############################################################################
# BLPOP with Retry Logic
##############################################################################
function blpop_with_retry() {
  local agent="$1"
  local done_key="$2"
  local timeout="$3"
  local retry_count="$4"
  local retry_delay="$5"

  for ATTEMPT in $(seq 1 $retry_count); do
    # Check for shutdown before attempting BLPOP
    if [ "$SHUTDOWN_REQUESTED" -eq 1 ]; then
      echo "  [SHUTDOWN] Aborting BLPOP for $agent" >&2
      return 1
    fi

    # Use Redis's native BLPOP timeout instead of shell timeout command
    # This allows SIGTERM to properly interrupt the process
    RESULT=$(redis-cli blpop "$done_key" "$timeout" 2>/dev/null || echo "")

    if [ -n "$RESULT" ]; then
      echo "$RESULT"
      return 0  # Success
    fi

    # Check for shutdown after BLPOP timeout
    if [ "$SHUTDOWN_REQUESTED" -eq 1 ]; then
      echo "  [SHUTDOWN] Aborting retry for $agent" >&2
      return 1
    fi

    # Log retry attempt (to stderr so it's visible during command substitution)
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "  [$timestamp] ⚠️ BLPOP attempt $ATTEMPT/$retry_count failed for $agent" >&2

    if [ $ATTEMPT -lt $retry_count ]; then
      # METRICS: Increment retry counter
      redis-cli INCR "swarm:${TASK_ID}:metrics:retry_count" >/dev/null

      retry_with_backoff "$agent" "$ATTEMPT" "$retry_count" "$retry_delay" >&2
    else
      # Final failure - write to DLQ
      echo "  [$timestamp] ❌ FINAL FAILURE: $agent after $retry_count attempts" >&2
      write_to_dlq "$agent" "timeout_after_retries" "$retry_count"
      return 1
    fi
  done

  return 1
}

echo "=== CFN Loop Orchestration ==="
echo "Task ID: $TASK_ID"
echo "Mode: $MODE (Gate: $GATE, Consensus: $CONSENSUS)"
echo "Max Iterations: $MAX_ITERATIONS"
echo ""

# Initialize swarm using general Redis coordination primitive
SWARM_ID="swarm-${TASK_ID}"
ALL_AGENTS="${LOOP3_AGENTS},${LOOP2_AGENTS},${PRODUCT_OWNER}"

# Build CFN-specific metadata
CFN_METADATA=$(cat <<EOF
{
  "mode": "$MODE",
  "loop3_agents": "$LOOP3_AGENTS",
  "loop2_agents": "$LOOP2_AGENTS",
  "product_owner": "$PRODUCT_OWNER",
  "workflow_type": "cfn_loop"
}
EOF
)

# Use general init-swarm primitive
./.claude/skills/redis-coordination/init-swarm.sh \
  --swarm-id "$SWARM_ID" \
  --agents "$ALL_AGENTS" \
  --task-id "$TASK_ID" \
  --topology "hierarchical" \
  --metadata "$CFN_METADATA" > /dev/null

# Start shutdown monitor in background
start_shutdown_monitor "$TASK_ID"

echo ""

# Iteration loop
for ITERATION in $(seq 1 $MAX_ITERATIONS); do
  echo "=== Iteration $ITERATION/$MAX_ITERATIONS ==="

  # METRICS: Iteration start timestamp
  ITERATION_START=$(date +%s%N | cut -b1-13)  # milliseconds
  redis-cli LPUSH "swarm:${TASK_ID}:metrics:iteration_start" "$ITERATION_START" >/dev/null

  # Step 1: Wait for Loop 3 agents to complete
  echo "[Loop 3] Waiting for implementers to complete..."
  IFS=',' read -ra AGENTS <<< "$LOOP3_AGENTS"

  LOOP3_TOTAL=${#AGENTS[@]}
  LOOP3_REQUIRED=$(calculate_quorum "$MIN_QUORUM_LOOP3" "$LOOP3_TOTAL")
  LOOP3_COMPLETED_AGENTS=()
  LOOP3_FAILED_AGENTS=()

  echo "[Loop 3] Quorum: $LOOP3_REQUIRED/$LOOP3_TOTAL agents required"

  # Start Loop 3 heartbeat monitor
  echo "[Loop 3] Starting heartbeat monitor (checking every 30s)..."
  LOOP3_HEARTBEAT_MONITOR_PID=$(start_heartbeat_monitor "$TASK_ID" "loop3" "${AGENTS[@]}")

  for AGENT in "${AGENTS[@]}"; do
    DONE_KEY="swarm:${TASK_ID}:${AGENT}:done"

    # Get agent-specific timeout
    AGENT_TIMEOUT=$(get_agent_timeout "$AGENT" "$TASK_ID")
    echo "  Waiting for $AGENT (timeout: ${AGENT_TIMEOUT}s)..."

    # METRICS: Agent latency start
    AGENT_START=$(date +%s%N | cut -b1-13)

    # BLPOP with retry logic using agent-specific timeout
    if RESULT=$(blpop_with_retry "$AGENT" "$DONE_KEY" "$AGENT_TIMEOUT" "$RETRY_COUNT" "$RETRY_DELAY"); then
      # METRICS: Agent latency end
      AGENT_END=$(date +%s%N | cut -b1-13)
      LATENCY=$((AGENT_END - AGENT_START))

      # Store latency metric with agent label and loop context
      METRIC=$(jq -nc \
        --arg agent "$AGENT" \
        --arg latency "$LATENCY" \
        --arg loop "loop3" \
        --arg iteration "$ITERATION" \
        '{agent: $agent, latency_ms: ($latency | tonumber), loop: $loop, iteration: ($iteration | tonumber)}')
      echo "$METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:agent_latency" >/dev/null

      echo "  ✅ $AGENT complete (${LATENCY}ms)"
      LOOP3_COMPLETED_AGENTS+=("$AGENT")
    else
      echo "  ❌ $AGENT failed after $RETRY_COUNT retry attempts"
      LOOP3_FAILED_AGENTS+=("$AGENT")

      # METRICS: Increment timeout counter
      redis-cli INCR "swarm:${TASK_ID}:metrics:timeout_count" >/dev/null
    fi
  done

  # Stop Loop 3 heartbeat monitor
  echo "[Loop 3] Stopping heartbeat monitor..."
  stop_heartbeat_monitor "$TASK_ID" "loop3" "$LOOP3_HEARTBEAT_MONITOR_PID"
  LOOP3_HEARTBEAT_MONITOR_PID=""

  # Validate quorum
  if [ ${#LOOP3_COMPLETED_AGENTS[@]} -ge "$LOOP3_REQUIRED" ]; then
    echo "[Loop 3] ✅ Quorum met: ${#LOOP3_COMPLETED_AGENTS[@]}/$LOOP3_REQUIRED agents completed"
    if [ ${#LOOP3_FAILED_AGENTS[@]} -gt 0 ]; then
      echo "[Loop 3] ⚠️ Failed agents (continuing with quorum): ${LOOP3_FAILED_AGENTS[*]}"

      # METRICS: Increment quorum fallback counter
      redis-cli INCR "swarm:${TASK_ID}:metrics:quorum_fallback" >/dev/null
    fi
  else
    echo "[Loop 3] ❌ Quorum FAILED: ${#LOOP3_COMPLETED_AGENTS[@]} < $LOOP3_REQUIRED"
    echo "[Loop 3] Failed agents: ${LOOP3_FAILED_AGENTS[*]}"
    exit 1
  fi
  echo ""

  # Step 2: Collect Loop 3 confidence scores (only from completed agents)
  echo "[Loop 3] Collecting confidence scores from ${#LOOP3_COMPLETED_AGENTS[@]} agents..."
  LOOP3_COMPLETED_IDS=$(IFS=','; echo "${LOOP3_COMPLETED_AGENTS[*]}")
  LOOP3_CONSENSUS=$(./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
    --task-id "$TASK_ID" \
    --agent-ids "$LOOP3_COMPLETED_IDS" | tail -1)

  echo "[Loop 3] Average confidence: $LOOP3_CONSENSUS (from ${#LOOP3_COMPLETED_AGENTS[@]}/${LOOP3_TOTAL} agents)"

  # METRICS: Store Loop 3 consensus score
  LOOP3_METRIC=$(jq -nc \
    --arg consensus "$LOOP3_CONSENSUS" \
    --arg iteration "$ITERATION" \
    '{consensus: ($consensus | tonumber), iteration: ($iteration | tonumber)}')
  echo "$LOOP3_METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:loop3_consensus" >/dev/null

  # Gate check
  if (( $(echo "$LOOP3_CONSENSUS < $GATE" | bc -l) )); then
    echo "❌ Gate FAILED ($LOOP3_CONSENSUS < $GATE)"
    echo "Decision: RELAUNCH iteration $((ITERATION + 1))"

    # METRICS: Increment gate failure counter
    redis-cli INCR "swarm:${TASK_ID}:metrics:gate_failures" >/dev/null

    # Wake Loop 3 agents for next iteration with MEDIUM priority (priority=30)
    IFS=',' read -ra AGENTS <<< "$LOOP3_AGENTS"
    for AGENT in "${AGENTS[@]}"; do
      ./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT" \
        --priority 30 \
        --reason "gate_failed" \
        --iteration $((ITERATION + 1)) \
        --feedback "Improve confidence from $LOOP3_CONSENSUS to >$GATE"
    done

    continue  # Next iteration
  fi

  echo "✅ Gate PASSED ($LOOP3_CONSENSUS >= $GATE)"
  echo ""

  # Signal Loop 2 validators that gate has passed (they can start work)
  GATE_PASS_KEY="swarm:${TASK_ID}:gate-passed"
  redis-cli lpush "$GATE_PASS_KEY" "{\"iteration\": $ITERATION, \"loop3_confidence\": $LOOP3_CONSENSUS}" > /dev/null
  echo "[Loop 3] Gate pass signal sent to Loop 2 validators"
  echo ""

  # Step 3: Wait for Loop 2 validators to complete
  echo "[Loop 2] Waiting for validators to complete..."
  IFS=',' read -ra VALIDATORS <<< "$LOOP2_AGENTS"

  LOOP2_TOTAL=${#VALIDATORS[@]}
  LOOP2_REQUIRED=$(calculate_quorum "$MIN_QUORUM_LOOP2" "$LOOP2_TOTAL")
  LOOP2_COMPLETED_AGENTS=()
  LOOP2_FAILED_AGENTS=()

  echo "[Loop 2] Quorum: $LOOP2_REQUIRED/$LOOP2_TOTAL agents required"

  # Start Loop 2 heartbeat monitor
  echo "[Loop 2] Starting heartbeat monitor (checking every 30s)..."
  LOOP2_HEARTBEAT_MONITOR_PID=$(start_heartbeat_monitor "$TASK_ID" "loop2" "${VALIDATORS[@]}")

  for VALIDATOR in "${VALIDATORS[@]}"; do
    DONE_KEY="swarm:${TASK_ID}:${VALIDATOR}:done"

    # Get agent-specific timeout
    AGENT_TIMEOUT=$(get_agent_timeout "$VALIDATOR" "$TASK_ID")
    echo "  Waiting for $VALIDATOR (timeout: ${AGENT_TIMEOUT}s)..."

    # METRICS: Agent latency start
    AGENT_START=$(date +%s%N | cut -b1-13)

    # BLPOP with retry logic using agent-specific timeout
    if RESULT=$(blpop_with_retry "$VALIDATOR" "$DONE_KEY" "$AGENT_TIMEOUT" "$RETRY_COUNT" "$RETRY_DELAY"); then
      # METRICS: Agent latency end
      AGENT_END=$(date +%s%N | cut -b1-13)
      LATENCY=$((AGENT_END - AGENT_START))

      # Store latency metric with agent label and loop context
      METRIC=$(jq -nc \
        --arg agent "$VALIDATOR" \
        --arg latency "$LATENCY" \
        --arg loop "loop2" \
        --arg iteration "$ITERATION" \
        '{agent: $agent, latency_ms: ($latency | tonumber), loop: $loop, iteration: ($iteration | tonumber)}')
      echo "$METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:agent_latency" >/dev/null

      echo "  ✅ $VALIDATOR complete (${LATENCY}ms)"
      LOOP2_COMPLETED_AGENTS+=("$VALIDATOR")
    else
      echo "  ❌ $VALIDATOR failed after $RETRY_COUNT retry attempts"
      LOOP2_FAILED_AGENTS+=("$VALIDATOR")

      # METRICS: Increment timeout counter
      redis-cli INCR "swarm:${TASK_ID}:metrics:timeout_count" >/dev/null
    fi
  done

  # Stop Loop 2 heartbeat monitor
  echo "[Loop 2] Stopping heartbeat monitor..."
  stop_heartbeat_monitor "$TASK_ID" "loop2" "$LOOP2_HEARTBEAT_MONITOR_PID"
  LOOP2_HEARTBEAT_MONITOR_PID=""

  # Validate quorum
  if [ ${#LOOP2_COMPLETED_AGENTS[@]} -ge "$LOOP2_REQUIRED" ]; then
    echo "[Loop 2] ✅ Quorum met: ${#LOOP2_COMPLETED_AGENTS[@]}/$LOOP2_REQUIRED agents completed"
    if [ ${#LOOP2_FAILED_AGENTS[@]} -gt 0 ]; then
      echo "[Loop 2] ⚠️ Failed agents (continuing with quorum): ${LOOP2_FAILED_AGENTS[*]}"

      # METRICS: Increment quorum fallback counter
      redis-cli INCR "swarm:${TASK_ID}:metrics:quorum_fallback" >/dev/null
    fi
  else
    echo "[Loop 2] ❌ Quorum FAILED: ${#LOOP2_COMPLETED_AGENTS[@]} < $LOOP2_REQUIRED"
    echo "[Loop 2] Failed agents: ${LOOP2_FAILED_AGENTS[*]}"
    exit 1
  fi
  echo ""

  # Step 4: Collect Loop 2 consensus scores (only from completed agents)
  echo "[Loop 2] Collecting consensus scores from ${#LOOP2_COMPLETED_AGENTS[@]} agents..."
  LOOP2_COMPLETED_IDS=$(IFS=','; echo "${LOOP2_COMPLETED_AGENTS[*]}")
  LOOP2_CONSENSUS=$(./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
    --task-id "$TASK_ID" \
    --agent-ids "$LOOP2_COMPLETED_IDS" | tail -1)

  echo "[Loop 2] Average consensus: $LOOP2_CONSENSUS (from ${#LOOP2_COMPLETED_AGENTS[@]}/${LOOP2_TOTAL} agents)"

  # METRICS: Store Loop 2 consensus score
  LOOP2_METRIC=$(jq -nc \
    --arg consensus "$LOOP2_CONSENSUS" \
    --arg iteration "$ITERATION" \
    '{consensus: ($consensus | tonumber), iteration: ($iteration | tonumber)}')
  echo "$LOOP2_METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:loop2_consensus" >/dev/null

  # Consensus check
  if (( $(echo "$LOOP2_CONSENSUS >= $CONSENSUS" | bc -l) )); then
    echo "✅ CONSENSUS REACHED ($LOOP2_CONSENSUS >= $CONSENSUS)"
    echo ""

    # Wake Product Owner with CRITICAL priority (priority=5)
    echo "[Coordinator] Waking Product Owner with CRITICAL priority..."
    ./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
      --task-id "$TASK_ID" \
      --agent-id "$PRODUCT_OWNER" \
      --priority 5 \
      --reason "consensus_ready" \
      --iteration "$ITERATION" \
      --feedback "Loop 2 consensus: $LOOP2_CONSENSUS"

    # Wait for Product Owner decision
    echo "[Product Owner] Waiting for GOAP decision..."
    DECISION_KEY="swarm:${TASK_ID}:${PRODUCT_OWNER}:decision"

    # Get agent-specific timeout for Product Owner
    PO_TIMEOUT=$(get_agent_timeout "$PRODUCT_OWNER" "$TASK_ID")
    echo "[Product Owner] Using timeout: ${PO_TIMEOUT}s"

    # BLPOP with retry logic for decision using agent-specific timeout
    if ! DECISION_RESULT=$(blpop_with_retry "$PRODUCT_OWNER" "$DECISION_KEY" "$PO_TIMEOUT" "$RETRY_COUNT" "$RETRY_DELAY"); then
      echo "❌ ERROR: Product Owner failed after $RETRY_COUNT retry attempts"
      exit 1
    fi

    # Extract decision from BLPOP result (format: key value)
    DECISION=$(echo "$DECISION_RESULT" | tail -1)

    DECISION_TYPE=$(echo "$DECISION" | jq -r '.decision')

    echo "[Product Owner] Decision: $DECISION_TYPE"

    if [ "$DECISION_TYPE" = "PROCEED" ]; then
      echo ""
      echo "🎉 CFN Loop Complete!"
      echo "Final Consensus: $LOOP2_CONSENSUS (Iteration $ITERATION)"

      # METRICS: Iteration end timestamp and duration
      ITERATION_END=$(date +%s%N | cut -b1-13)
      ITERATION_DURATION=$((ITERATION_END - ITERATION_START))

      # Store final iteration duration metric
      DURATION_METRIC=$(jq -nc \
        --arg duration "$ITERATION_DURATION" \
        --arg iteration "$ITERATION" \
        '{duration_ms: ($duration | tonumber), iteration: ($iteration | tonumber)}')
      echo "$DURATION_METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:iteration_duration" >/dev/null

      # Wake all agents with completion signal - CRITICAL priority (priority=5)
      echo "[Coordinator] Waking all agents with CRITICAL priority for completion..."
      IFS=',' read -ra ALL_AGENTS <<< "$LOOP3_AGENTS,$LOOP2_AGENTS"
      for AGENT in "${ALL_AGENTS[@]}"; do
        ./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
          --task-id "$TASK_ID" \
          --agent-id "$AGENT" \
          --priority 5 \
          --reason "cfn_complete" \
          --iteration "$ITERATION"
      done

      # Use general complete-swarm primitive
      ./.claude/skills/redis-coordination/complete-swarm.sh \
        --swarm-id "$SWARM_ID" \
        --final-metric "final_consensus=$LOOP2_CONSENSUS" \
        --final-metric "total_iterations=$ITERATION" > /dev/null

      exit 0
    fi

  else
    echo "⚠️ CONSENSUS NOT REACHED ($LOOP2_CONSENSUS < $CONSENSUS)"
    echo "Decision: RELAUNCH iteration $((ITERATION + 1))"
    echo ""
  fi

  # METRICS: Iteration end timestamp and duration (for relaunch scenario)
  ITERATION_END=$(date +%s%N | cut -b1-13)
  ITERATION_DURATION=$((ITERATION_END - ITERATION_START))

  # Store iteration duration metric
  DURATION_METRIC=$(jq -nc \
    --arg duration "$ITERATION_DURATION" \
    --arg iteration "$ITERATION" \
    '{duration_ms: ($duration | tonumber), iteration: ($iteration | tonumber)}')
  echo "$DURATION_METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:iteration_duration" >/dev/null

  # Relaunch next iteration
  if [ $ITERATION -eq $MAX_ITERATIONS ]; then
    echo "❌ Maximum iterations ($MAX_ITERATIONS) reached without consensus"
    exit 1
  fi

  # Wake agents for next iteration with role-based priorities
  echo "[Coordinator] Waking agents for iteration $((ITERATION + 1)) with priorities..."

  # Wake Loop 3 implementers with MEDIUM priority (priority=30)
  IFS=',' read -ra LOOP3_ARRAY <<< "$LOOP3_AGENTS"
  for AGENT in "${LOOP3_ARRAY[@]}"; do
    ./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
      --task-id "$TASK_ID" \
      --agent-id "$AGENT" \
      --priority 30 \
      --reason "cfn_loop_iteration" \
      --iteration $((ITERATION + 1)) \
      --feedback "Improve consensus from $LOOP2_CONSENSUS to >=$CONSENSUS"
  done

  # Wake Loop 2 validators with HIGH priority (priority=10)
  IFS=',' read -ra LOOP2_ARRAY <<< "$LOOP2_AGENTS"
  for AGENT in "${LOOP2_ARRAY[@]}"; do
    ./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
      --task-id "$TASK_ID" \
      --agent-id "$AGENT" \
      --priority 10 \
      --reason "cfn_loop_iteration" \
      --iteration $((ITERATION + 1)) \
      --feedback "Improve consensus from $LOOP2_CONSENSUS to >=$CONSENSUS"
  done

  echo ""
done

echo "❌ CFN Loop failed after $MAX_ITERATIONS iterations"
exit 1
