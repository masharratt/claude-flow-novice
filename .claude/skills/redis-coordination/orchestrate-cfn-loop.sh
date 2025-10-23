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
#                             [--min-quorum-loop2 <n|n%|0.n>] \
#                             [--epic-context <json>] \
#                             [--phase-context <json>] \
#                             [--success-criteria <json>]
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
#     2. Review Loop 3 work
#     3. Signal done: redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
#     4. Report confidence: invoke-waiting-mode.sh report --confidence <0.0-1.0>
#     5. Enter waiting: invoke-waiting-mode.sh enter (for potential iteration)
##############################################################################

set -euo pipefail

# Configuration
TASK_ID=""
MODE="standard"
LOOP3_AGENTS=""
LOOP2_AGENTS=""
PRODUCT_OWNER=""
MAX_ITERATIONS=10
TIMEOUT=3600  # 60 minute default timeout for agent completion
RETRY_COUNT=3
RETRY_DELAY=5000  # Base delay in milliseconds
MIN_QUORUM_LOOP3=""  # Minimum agents required for Loop 3 (absolute or percentage)
MIN_QUORUM_LOOP2=""  # Minimum agents required for Loop 2 (absolute or percentage)
ORCHESTRATOR_PID=$$
SHUTDOWN_MONITOR_PID=""
SHUTDOWN_REQUESTED=0
LOOP3_HEARTBEAT_MONITOR_PID=""
LOOP2_HEARTBEAT_MONITOR_PID=""

# Epic Context (optional - for agent system prompts)
EPIC_CONTEXT=""
PHASE_CONTEXT=""
SUCCESS_CRITERIA=""
EXPECTED_FILES=""  # BUG #12 FIX: Explicit file verification
PHASE_ID=""  # BUG #16 FIX: Phase identifier for timeout configuration

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
    --epic-context)
      EPIC_CONTEXT="$2"
      shift 2
      ;;
    --phase-context)
      PHASE_CONTEXT="$2"
      shift 2
      ;;
    --success-criteria)
      SUCCESS_CRITERIA="$2"
      shift 2
      ;;
    --expected-files)
      EXPECTED_FILES="$2"
      shift 2
      ;;
    --phase-id)
      PHASE_ID="$2"
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
# Feedback Accumulation Function (PHASE 1 - BUG #23 FIX)
##############################################################################
# Accumulates feedback across iterations to enable learning
# Usage: accumulate_feedback <task_id> <iteration> <source> <feedback_message>
function accumulate_feedback() {
  local task_id="$1"
  local iteration="$2"
  local source="$3"
  local feedback_message="$4"

  local feedback_key="swarm:${task_id}:feedback:history"

  # Retrieve existing feedback history
  local feedback_history
  feedback_history=$(redis-cli GET "$feedback_key" 2>/dev/null)
  # Normalize empty/nil to valid JSON array
  if [ -z "$feedback_history" ] || [ "$feedback_history" = "(nil)" ]; then
    feedback_history="[]"
  fi

  # Append new feedback with metadata
  local new_feedback
  new_feedback=$(jq -nc \
    --argjson history "$feedback_history" \
    --arg iteration "$iteration" \
    --arg source "$source" \
    --arg feedback "$feedback_message" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '$history + [{
      iteration: ($iteration | tonumber),
      source: $source,
      feedback: $feedback,
      timestamp: $timestamp
    }]')

  # Store accumulated history
  echo "$new_feedback" | redis-cli -x SET "$feedback_key" EX 86400 >/dev/null

  echo "[Feedback] ✅ Accumulated feedback for iteration $iteration (source: $source)"
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
  local iteration="$3"

  # Agents create heartbeat as: swarm:${task_id}:agent:${agent_id} (HASH with heartbeat field)
  # Agent ID includes iteration suffix: react-frontend-engineer-1
  HB_KEY="swarm:${task_id}:agent:${agent}-${iteration}"
  HB_DATA=$(redis-cli HGET "$HB_KEY" heartbeat 2>/dev/null || echo "")

  if [ -z "$HB_DATA" ] || [ "$HB_DATA" = "(nil)" ]; then
    return 1  # Dead
  else
    return 0  # Alive
  fi
}

function check_heartbeats_loop() {
  local task_id="$1"
  local loop_name="$2"
  local iteration="$3"
  shift 3
  local agents=("$@")

  for AGENT in "${agents[@]}"; do
    # Skip agents already marked as failed
    if [[ " ${LOOP3_FAILED_AGENTS[@]} ${LOOP2_FAILED_AGENTS[@]} " =~ " ${AGENT} " ]]; then
      continue
    fi

    if ! check_agent_heartbeat "$AGENT" "$task_id" "$iteration"; then
      MISSED_HEARTBEATS["$AGENT"]=$((${MISSED_HEARTBEATS["$AGENT"]:-0} + 1))

      if [ ${MISSED_HEARTBEATS["$AGENT"]} -ge 2 ]; then
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        echo "  [$timestamp] [$loop_name] ⚠️ $AGENT appears hung (no heartbeat for 60s)" >&2

        # Determine which loop this agent belongs to and check quorum
        if [[ " ${LOOP3_AGENTS} " =~ " ${AGENT} " ]]; then
          REMAINING=$((${#LOOP3_COMPLETED_AGENTS[@]}))
          REQUIRED=$(calculate_quorum "$MIN_QUORUM_LOOP3" "$LOOP3_TOTAL")
        elif [[ " ${LOOP2_AGENTS} " =~ " ${AGENT} " ]]; then
          # Safety check: Skip if Loop 2 hasn't been initialized yet
          if [ -z "${LOOP2_COMPLETED_AGENTS+x}" ]; then
            continue
          fi
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
  local iteration="$3"
  shift 3
  local agents=("$@")

  # Create marker file for this monitor
  local monitor_marker="/tmp/heartbeat-monitor-${task_id}-${loop_name}.active"
  touch "$monitor_marker"

  # [BUG #7 FIX] Spawn background process and let caller capture $!
  (
    while [ -f "$monitor_marker" ]; do
      # Check for shutdown
      if [ "$SHUTDOWN_REQUESTED" -eq 1 ]; then
        break
      fi

      check_heartbeats_loop "$task_id" "$loop_name" "$iteration" "${agents[@]}"
      sleep 30
    done
  ) &

  # No echo - caller will use $! to get PID
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
# Process-Based Completion Monitoring
##############################################################################
function monitor_agent_process() {
  local agent_id="$1"
  local agent_pid="$2"
  local task_id="$3"
  local done_key="$4"

  # Monitor agent process in background
  (
    # Wait for process to exit
    wait "$agent_pid" 2>/dev/null
    EXIT_CODE=$?

    # Check if done signal already sent (agent may have signaled normally)
    DONE_COUNT=$(redis-cli LLEN "$done_key" 2>/dev/null || echo "0")
    if [ "$DONE_COUNT" -gt 0 ]; then
      # Agent signaled normally - nothing to do
      exit 0
    fi

    # Process exited without signaling - auto-complete
    if [ $EXIT_CODE -eq 0 ]; then
      echo "  [Process Monitor] $agent_id exited successfully (code 0) - auto-signaling completion" >&2
      redis-cli LPUSH "$done_key" "auto-completed-success" >/dev/null
    else
      echo "  [Process Monitor] $agent_id exited with error (code $EXIT_CODE) - auto-signaling failure" >&2
      redis-cli LPUSH "$done_key" "auto-completed-error:$EXIT_CODE" >/dev/null

      # METRICS: Increment error counter
      redis-cli INCR "swarm:${task_id}:metrics:agent_errors" >/dev/null
    fi
  ) &
}

##############################################################################
# BLPOP with Retry Logic + Process Monitoring
##############################################################################
function blpop_with_retry() {
  local agent="$1"
  local done_key="$2"
  local timeout="$3"
  local retry_count="$4"
  local retry_delay="$5"
  local agent_pid="${6:-}"  # Optional: PID for process monitoring

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

    # BLPOP timeout - check if process is still alive
    if [ -n "$agent_pid" ]; then
      if ! kill -0 "$agent_pid" 2>/dev/null; then
        echo "  [Process Check] Agent process $agent_pid no longer running" >&2

        # Process exited - check if done signal was auto-generated
        RESULT=$(redis-cli LPOP "$done_key" 2>/dev/null || echo "")
        if [ -n "$RESULT" ]; then
          echo "  [Auto-Complete] Retrieved: $RESULT" >&2
          echo "$RESULT"
          return 0
        fi
      fi
    fi

    # Check for shutdown after BLPOP timeout
    if [ "$SHUTDOWN_REQUESTED" -eq 1 ]; then
      echo "  [SHUTDOWN] Aborting retry for $agent" >&2
      return 1
    fi

    # Check heartbeat status
    HEARTBEAT_KEY="swarm:${TASK_ID}:${agent}:heartbeat"
    HEARTBEAT_EXISTS=$(redis-cli EXISTS "$HEARTBEAT_KEY" 2>/dev/null || echo "0")

    if [ "$HEARTBEAT_EXISTS" -eq 0 ]; then
      echo "  ⚠️  No heartbeat from $agent - agent may be stuck or crashed" >&2

      # If we have PID and process is stuck, kill it
      if [ -n "$agent_pid" ] && kill -0 "$agent_pid" 2>/dev/null; then
        echo "  [Timeout Kill] Terminating stuck process $agent_pid" >&2
        kill "$agent_pid" 2>/dev/null || true
        sleep 2

        # Force kill if still alive
        if kill -0 "$agent_pid" 2>/dev/null; then
          kill -9 "$agent_pid" 2>/dev/null || true
        fi

        # METRICS: Increment timeout counter
        redis-cli INCR "swarm:${TASK_ID}:metrics:agent_killed" >/dev/null
      fi
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

# LOG: Swarm initialization
./.claude/skills/redis-coordination/log-event.sh \
  --task-id "$TASK_ID" \
  --event-type "swarm_init" \
  --details "{\"mode\": \"$MODE\", \"loop3_agents\": \"$LOOP3_AGENTS\", \"loop2_agents\": \"$LOOP2_AGENTS\", \"product_owner\": \"$PRODUCT_OWNER\", \"max_iterations\": $MAX_ITERATIONS, \"gate_threshold\": $GATE, \"consensus_threshold\": $CONSENSUS}" \
  --level "INFO" 2>/dev/null || true

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

# Store epic context in Redis (if provided)
if [ -n "$EPIC_CONTEXT" ]; then
  echo "📋 Storing epic context in Redis..."
  # Escape single quotes for Redis
  EPIC_ESCAPED="${EPIC_CONTEXT//\'/\'\\\'\'}"
  redis-cli setex "swarm:${TASK_ID}:epic-context" 604800 "$EPIC_ESCAPED" >/dev/null
  echo "  ✅ Epic context stored (TTL: 7 days)"
fi

if [ -n "$PHASE_CONTEXT" ]; then
  echo "📋 Storing phase context in Redis..."
  PHASE_ESCAPED="${PHASE_CONTEXT//\'/\'\\\'\'}"
  redis-cli setex "swarm:${TASK_ID}:phase-context" 604800 "$PHASE_ESCAPED" >/dev/null
  echo "  ✅ Phase context stored (TTL: 7 days)"
fi

if [ -n "$SUCCESS_CRITERIA" ]; then
  echo "📋 Storing success criteria in Redis..."
  CRITERIA_ESCAPED="${SUCCESS_CRITERIA//\'/\'\\\'\'}"
  redis-cli setex "swarm:${TASK_ID}:success-criteria" 604800 "$CRITERIA_ESCAPED" >/dev/null
  echo "  ✅ Success criteria stored (TTL: 7 days)"
fi

echo ""

# [BUG #15 FIX] REMOVED: Early Product Owner spawn at iteration 0
# Product Owner now only spawned after Loop 2 completes (see line 1283)
# This prevents timeout issues with waiting mode initialization
echo "[Product Owner] Will spawn after Loop 2 consensus (just-in-time pattern)"
echo ""

# Iteration loop
for ITERATION in $(seq 1 $MAX_ITERATIONS); do
  echo "=== Iteration $ITERATION/$MAX_ITERATIONS ==="

  # METRICS: Iteration start timestamp
  ITERATION_START=$(date +%s%N | cut -b1-13)  # milliseconds
  ITERATION_START_SEC=$(date +%s)  # seconds for timeout check
  redis-cli LPUSH "swarm:${TASK_ID}:metrics:iteration_start" "$ITERATION_START" >/dev/null
  redis-cli SET "swarm:${TASK_ID}:iteration:${ITERATION}:start" "$ITERATION_START_SEC" EX 86400 >/dev/null

  # Set iteration timeout (1 hour per iteration max)
  ITERATION_TIMEOUT=3600
  ITERATION_DEADLINE=$((ITERATION_START_SEC + ITERATION_TIMEOUT))
  echo "[Timeout Protection] Iteration $ITERATION deadline: $(date -d "@$ITERATION_DEADLINE" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "$ITERATION_DEADLINE")"

  # Step 1: Build detailed agent context from Redis (BUG #20 FIX - Option 2)
  echo "[Loop 3] Building agent context from Redis..."

  # Retrieve stored context
  EPIC_CTX=$(redis-cli get "swarm:${TASK_ID}:epic-context" 2>/dev/null || echo "{}")
  PHASE_CTX=$(redis-cli get "swarm:${TASK_ID}:phase-context" 2>/dev/null || echo "{}")
  SUCCESS_CTX=$(redis-cli get "swarm:${TASK_ID}:success-criteria" 2>/dev/null || echo "{}")

  # Extract key fields with jq (safe parsing)
  EPIC_GOAL=$(echo "$EPIC_CTX" | jq -r '.epicGoal // "No epic goal specified"')
  IN_SCOPE=$(echo "$EPIC_CTX" | jq -r '.inScope[]? // empty' | sed 's/^/- /' || echo "- (not specified)")
  OUT_SCOPE=$(echo "$EPIC_CTX" | jq -r '.outOfScope[]? // empty' | sed 's/^/- /' || echo "- (not specified)")
  DELIVERABLES=$(echo "$PHASE_CTX" | jq -r '.deliverables[]? // empty' | sed 's/^/- /' || echo "- (not specified)")
  DIRECTORY=$(echo "$PHASE_CTX" | jq -r '.directory // ""')
  ACCEPTANCE=$(echo "$SUCCESS_CTX" | jq -r '.acceptanceCriteria[]? // empty' | sed 's/^/- /' || echo "- (not specified)")

  # Build structured agent context
  LOOP3_AGENT_CONTEXT="Loop 3 implementation for iteration $ITERATION

Epic Goal: $EPIC_GOAL

In Scope:
$IN_SCOPE

Out of Scope:
$OUT_SCOPE

Deliverables (CRITICAL - you MUST create these files):
$DELIVERABLES
$([ -n "$DIRECTORY" ] && echo "
Target Directory: $DIRECTORY")

Acceptance Criteria:
$ACCEPTANCE

IMPORTANT:
- Use Write tool to create each deliverable file
- Verify files created with 'ls -la \$DIRECTORY' after each Write
- All deliverables must exist for validation to pass
- Report confidence score based on actual file creation
"

  # NEW: Add real-time file checklist (STRAT-025: Explicit Deliverable Tracking)
  # Extract deliverable file paths from phase context
  DELIVERABLE_FILES=$(echo "$PHASE_CTX" | jq -r '.deliverables[]? // empty' 2>/dev/null)

  if [ -n "$DELIVERABLE_FILES" ]; then
    DELIVERABLE_CHECKLIST="\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DELIVERABLE CHECKLIST (verify BEFORE reporting confidence)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"

    MISSING_COUNT=0
    COMPLETE_COUNT=0

    # Check each deliverable file
    while IFS= read -r file; do
      # Skip empty lines
      [ -z "$file" ] && continue

      # Convert relative paths to absolute if needed
      if [[ "$file" != /* ]]; then
        # If DIRECTORY is set, prepend it
        if [ -n "$DIRECTORY" ]; then
          file="${DIRECTORY}/${file}"
        fi
      fi

      if [ -f "$file" ]; then
        DELIVERABLE_CHECKLIST="${DELIVERABLE_CHECKLIST}✅ COMPLETE: $file\n"
        COMPLETE_COUNT=$((COMPLETE_COUNT + 1))
      else
        DELIVERABLE_CHECKLIST="${DELIVERABLE_CHECKLIST}❌ MISSING: $file (YOU MUST CREATE THIS)\n"
        MISSING_COUNT=$((MISSING_COUNT + 1))
      fi
    done <<< "$DELIVERABLE_FILES"

    # Add status summary
    DELIVERABLE_CHECKLIST="${DELIVERABLE_CHECKLIST}\nStatus: ${COMPLETE_COUNT} complete, ${MISSING_COUNT} missing\n"

    if [ "$MISSING_COUNT" -gt 0 ]; then
      DELIVERABLE_CHECKLIST="${DELIVERABLE_CHECKLIST}\n⚠️  CRITICAL: ${MISSING_COUNT} file(s) marked ❌ MISSING above.
Your confidence should be LOW (<0.50) until ALL files are created.
Create ALL missing files before reporting high confidence.\n"
    else
      DELIVERABLE_CHECKLIST="${DELIVERABLE_CHECKLIST}\n✅ All deliverables complete! You may report high confidence if quality requirements met.\n"
    fi

    # Append checklist to agent context
    LOOP3_AGENT_CONTEXT="${LOOP3_AGENT_CONTEXT}${DELIVERABLE_CHECKLIST}"

    echo "  📋 Deliverable checklist: ${COMPLETE_COUNT} complete, ${MISSING_COUNT} missing"
  fi

  # PHASE 1 (BUG #23): Inject feedback history for iterative learning
  if [ "$ITERATION" -gt 1 ]; then
    FEEDBACK_HISTORY=$(redis-cli GET "swarm:${TASK_ID}:feedback:history" 2>/dev/null)
    # Normalize empty/nil to valid JSON array
    if [ -z "$FEEDBACK_HISTORY" ] || [ "$FEEDBACK_HISTORY" = "(nil)" ]; then
      FEEDBACK_HISTORY="[]"
    fi

    if [ "$FEEDBACK_HISTORY" != "[]" ]; then
      # Format feedback for human readability
      FEEDBACK_SUMMARY=$(echo "$FEEDBACK_HISTORY" | jq -r '.[] | "- Iteration \(.iteration) (\(.source)): \(.feedback)"' 2>/dev/null || echo "")

      if [ -n "$FEEDBACK_SUMMARY" ]; then
        # Prepend feedback to agent context
        LOOP3_AGENT_CONTEXT="Loop 3 implementation for iteration $ITERATION

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREVIOUS ITERATION FEEDBACK (LEARN FROM THIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$FEEDBACK_SUMMARY

CRITICAL: Address the feedback above. Do NOT repeat previous mistakes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$LOOP3_AGENT_CONTEXT"
        echo "  📝 Injected feedback history ($(echo "$FEEDBACK_HISTORY" | jq '. | length') items)"
      fi
    fi
  fi

  echo "  ✅ Agent context built ($(echo "$LOOP3_AGENT_CONTEXT" | wc -c) characters)"
  echo ""

  # Step 2: Spawn Loop 3 agents via CLI
  echo "[Loop 3] Spawning implementers via CLI..."
  IFS=',' read -ra AGENTS <<< "$LOOP3_AGENTS"

  # Track instance counts to generate unique agent IDs for duplicate agent types
  declare -A AGENT_INSTANCE_COUNTS
  declare -A AGENT_IDS  # Map from array index to unique agent ID

  # Pre-calculate unique agent IDs
  for i in "${!AGENTS[@]}"; do
    AGENT="${AGENTS[$i]}"

    # Increment instance counter for this agent type
    AGENT_INSTANCE_COUNTS["$AGENT"]=$((${AGENT_INSTANCE_COUNTS["$AGENT"]:-0} + 1))
    INSTANCE_NUM="${AGENT_INSTANCE_COUNTS["$AGENT"]}"

    # Generate unique agent ID: agent-type-iteration-instance
    UNIQUE_AGENT_ID="${AGENT}-${ITERATION}-${INSTANCE_NUM}"
    AGENT_IDS["$i"]="$UNIQUE_AGENT_ID"

    echo "  [Instance Tracking] ${AGENT} #${INSTANCE_NUM} → ${UNIQUE_AGENT_ID}"
  done

  echo ""

  # [PHASE 1 INTEGRATION] Loop 3 Skill-Based Output Processing (Parallel)
  # Uses .claude/skills/loop3-output-processing/ for guaranteed confidence extraction
  echo "[Loop 3] Using skill-based output processing (parallel execution)"

  LOOP3_TOTAL=${#AGENTS[@]}
  LOOP3_REQUIRED=$(calculate_quorum "$MIN_QUORUM_LOOP3" "$LOOP3_TOTAL")
  LOOP3_COMPLETED_AGENTS=()
  LOOP3_FAILED_AGENTS=()

  echo "[Loop 3] Quorum: $LOOP3_REQUIRED/$LOOP3_TOTAL agents required"
  echo ""

  # Step 2a: Spawn all agents in parallel (background processes)
  declare -A AGENT_PIDS
  declare -A AGENT_OUTPUT_FILES

  for i in "${!AGENTS[@]}"; do
    AGENT="${AGENTS[$i]}"
    UNIQUE_AGENT_ID="${AGENT_IDS[$i]}"

    # Get agent-specific timeout
    AGENT_TIMEOUT=$(get_agent_timeout "$AGENT" "$TASK_ID")

    # Create temp file for agent output
    OUTPUT_FILE="/tmp/loop3-${TASK_ID}-${UNIQUE_AGENT_ID}.json"
    AGENT_OUTPUT_FILES["$UNIQUE_AGENT_ID"]="$OUTPUT_FILE"

    echo "  Spawning $AGENT (ID: $UNIQUE_AGENT_ID, timeout: ${AGENT_TIMEOUT}s)"

    # LOG: Loop 3 agent spawn
    ./.claude/skills/redis-coordination/log-event.sh \
      --task-id "$TASK_ID" \
      --event-type "agent_spawn" \
      --loop "loop3" \
      --agent-id "$UNIQUE_AGENT_ID" \
      --iteration "$ITERATION" \
      --details "{\"agent_type\": \"$AGENT\", \"timeout\": $AGENT_TIMEOUT}" \
      --level "INFO" 2>/dev/null || true

    # Execute agent via Loop 3 skill in background
    (
      # Record start time
      START_TIME=$(date +%s%N | cut -b1-13)

      # Execute skill (BUG #20 FIX - inject detailed context)
      if SKILL_RESULT=$(./.claude/skills/loop3-output-processing/execute-and-extract.sh \
        --agent-type "$AGENT" \
        --task-id "$TASK_ID" \
        --agent-id "$UNIQUE_AGENT_ID" \
        --context "$LOOP3_AGENT_CONTEXT" \
        --iteration "$ITERATION" \
        --timeout "$AGENT_TIMEOUT" 2>&1); then

        # Record end time
        END_TIME=$(date +%s%N | cut -b1-13)
        LATENCY=$((END_TIME - START_TIME))

        # Add latency to result
        RESULT_WITH_LATENCY=$(echo "$SKILL_RESULT" | jq --arg latency "$LATENCY" '. + {latency_ms: ($latency | tonumber)}')

        # Save to temp file
        echo "$RESULT_WITH_LATENCY" > "$OUTPUT_FILE"

        # Store result in Redis
        echo "$RESULT_WITH_LATENCY" | redis-cli -x LPUSH "swarm:${TASK_ID}:${UNIQUE_AGENT_ID}:result" >/dev/null
        redis-cli LPUSH "swarm:${TASK_ID}:${UNIQUE_AGENT_ID}:done" "complete" >/dev/null

        exit 0
      else
        # Skill failed - save error
        echo "{\"error\": true, \"output\": \"$SKILL_RESULT\"}" > "$OUTPUT_FILE"
        exit 1
      fi
    ) &

    AGENT_PIDS["$UNIQUE_AGENT_ID"]=$!
    echo "  ✅ Spawned $UNIQUE_AGENT_ID (PID: ${AGENT_PIDS[$UNIQUE_AGENT_ID]})"
  done

  echo ""
  echo "[Loop 3] All agents spawned, waiting for completion..."
  echo ""

  # Step 2b: Wait for all agents to complete
  for i in "${!AGENTS[@]}"; do
    AGENT="${AGENTS[$i]}"
    UNIQUE_AGENT_ID="${AGENT_IDS[$i]}"
    AGENT_PID="${AGENT_PIDS[$UNIQUE_AGENT_ID]}"
    OUTPUT_FILE="${AGENT_OUTPUT_FILES[$UNIQUE_AGENT_ID]}"

    echo "  Waiting for $UNIQUE_AGENT_ID (PID: $AGENT_PID)..."

    # Wait for specific agent process
    if wait "$AGENT_PID" 2>/dev/null; then
      # Success - read result from temp file
      if [ -f "$OUTPUT_FILE" ]; then
        SKILL_RESULT=$(cat "$OUTPUT_FILE")

        # Check if result has error flag
        HAS_ERROR=$(echo "$SKILL_RESULT" | jq -r '.error // false')

        if [ "$HAS_ERROR" = "false" ]; then
          # Extract metrics
          CONFIDENCE=$(echo "$SKILL_RESULT" | jq -r '.confidence')
          FILES_CHANGED=$(echo "$SKILL_RESULT" | jq -r '.files_changed')
          CONFIDENCE_SOURCE=$(echo "$SKILL_RESULT" | jq -r '.confidence_source')
          LATENCY=$(echo "$SKILL_RESULT" | jq -r '.latency_ms')

          echo "  ✅ $UNIQUE_AGENT_ID complete (${LATENCY}ms, confidence: $CONFIDENCE [$CONFIDENCE_SOURCE], files: $FILES_CHANGED)"

          # BUGFIX #21: Store confidence in Redis for consensus collection
          # The skill script extracts confidence but doesn't store it where invoke-waiting-mode.sh collect expects
          ./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
            --task-id "$TASK_ID" \
            --agent-id "$UNIQUE_AGENT_ID" \
            --confidence "$CONFIDENCE" \
            --iteration "$ITERATION" >/dev/null

          # LOG: Loop 3 agent completion
          ./.claude/skills/redis-coordination/log-event.sh \
            --task-id "$TASK_ID" \
            --event-type "agent_complete" \
            --loop "loop3" \
            --agent-id "$UNIQUE_AGENT_ID" \
            --iteration "$ITERATION" \
            --details "{\"confidence\": $CONFIDENCE, \"confidence_source\": \"$CONFIDENCE_SOURCE\", \"files_changed\": $FILES_CHANGED, \"latency_ms\": $LATENCY}" \
            --level "INFO" 2>/dev/null || true

          # Store latency metric
          METRIC=$(jq -nc \
            --arg agent "$UNIQUE_AGENT_ID" \
            --arg latency "$LATENCY" \
            --arg loop "loop3" \
            --arg iteration "$ITERATION" \
            '{agent: $agent, latency_ms: ($latency | tonumber), loop: $loop, iteration: ($iteration | tonumber)}')
          echo "$METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:agent_latency" >/dev/null

          LOOP3_COMPLETED_AGENTS+=("$UNIQUE_AGENT_ID")
        else
          ERROR_OUTPUT=$(echo "$SKILL_RESULT" | jq -r '.output')
          echo "  ❌ $UNIQUE_AGENT_ID failed (skill execution error)"
          echo "     Error: $ERROR_OUTPUT"

          # LOG: Loop 3 agent failure
          ./.claude/skills/redis-coordination/log-event.sh \
            --task-id "$TASK_ID" \
            --event-type "agent_failure" \
            --loop "loop3" \
            --agent-id "$UNIQUE_AGENT_ID" \
            --iteration "$ITERATION" \
            --details "{\"error\": \"skill_execution_error\", \"output\": \"$ERROR_OUTPUT\"}" \
            --level "ERROR" 2>/dev/null || true

          LOOP3_FAILED_AGENTS+=("$AGENT")
          redis-cli INCR "swarm:${TASK_ID}:metrics:agent_failure_count" >/dev/null
        fi

        # Cleanup temp file
        rm -f "$OUTPUT_FILE"
      else
        echo "  ❌ $UNIQUE_AGENT_ID failed (no output file)"
        LOOP3_FAILED_AGENTS+=("$AGENT")
        redis-cli INCR "swarm:${TASK_ID}:metrics:agent_failure_count" >/dev/null
      fi
    else
      echo "  ❌ $UNIQUE_AGENT_ID failed (process error)"
      LOOP3_FAILED_AGENTS+=("$AGENT")
      redis-cli INCR "swarm:${TASK_ID}:metrics:agent_failure_count" >/dev/null
      rm -f "$OUTPUT_FILE"
    fi

    echo ""
  done

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

  # BUG #12 FIX: Deliverable Verification with explicit file checking
  echo "[Deliverable Check] Verifying implementation artifacts..."

  # Use enhanced validate-deliverables.sh skill
  DELIVERABLE_ARGS="--task-id $TASK_ID"
  if [ -n "$EXPECTED_FILES" ]; then
    DELIVERABLE_ARGS="$DELIVERABLE_ARGS --expected-files $EXPECTED_FILES"
    echo "  Expected files: $EXPECTED_FILES"
  fi

  DELIVERABLE_STATUS=$(./.claude/skills/product-owner-decision/validate-deliverables.sh $DELIVERABLE_ARGS)

  if [ "$DELIVERABLE_STATUS" = "FAILED" ]; then
    # Retrieve missing files from Redis (if available)
    MISSING_FILES_JSON=$(redis-cli get "swarm:${TASK_ID}:missing-files" 2>/dev/null || echo "[]")
    MISSING_FILES_LIST=$(echo "$MISSING_FILES_JSON" | jq -r '.[]' | tr '\n' ', ' | sed 's/,$//')

    if [ -n "$MISSING_FILES_LIST" ]; then
      echo "❌ DELIVERABLE VERIFICATION FAILED: Missing files"
      echo "   Expected but not found: $MISSING_FILES_LIST"
    else
      echo "❌ DELIVERABLE VERIFICATION FAILED: No files created or modified"
    fi

    echo "   This prevents 'consensus on vapor' - validators approving nothing"
    echo ""
    echo "Decision: RELAUNCH iteration $((ITERATION + 1)) (skip Loop 2 validation)"
    echo ""

    # METRICS: Increment deliverable failure counter
    redis-cli INCR "swarm:${TASK_ID}:metrics:deliverable_failures" >/dev/null

    # Override all Loop 3 confidence scores to 0.0 (prevent gate pass)
    for AGENT in "${LOOP3_COMPLETED_AGENTS[@]}"; do
      redis-cli DEL "swarm:${TASK_ID}:${AGENT}:result" >/dev/null
      redis-cli LPUSH "swarm:${TASK_ID}:${AGENT}:result" "0.0" >/dev/null
      echo "  [Override] ${AGENT} confidence: 1.0 → 0.0 (no deliverables)"
    done

    # Recalculate consensus (should be 0.0 now)
    LOOP3_CONSENSUS=$(./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
      --task-id "$TASK_ID" \
      --agent-ids "$LOOP3_COMPLETED_IDS" | tail -1)

    echo ""
    echo "[Loop 3] Recalculated confidence after override: $LOOP3_CONSENSUS"
    echo ""

    # Build specific feedback with missing files
    if [ -n "$MISSING_FILES_LIST" ]; then
      FEEDBACK="CRITICAL: Create these missing files: $MISSING_FILES_LIST

Use the Write tool for each file. Verify with 'ls -la' after each Write operation."
    else
      FEEDBACK="CRITICAL: You must create or modify files. No deliverables were produced in iteration $ITERATION."
    fi

    # PHASE 1 (BUG #23): Accumulate feedback across iterations for learning
    # BUGFIX #22: Store feedback in Redis for next iteration (agents will be re-spawned, not woken)
    # Per P3 agent lifecycle: agents exit cleanly, orchestrator spawns fresh agents
    accumulate_feedback "$TASK_ID" "$ITERATION" "deliverable_check" "$FEEDBACK"
    echo "  Reason: no_deliverables"
    echo "  Priority: 40 (HIGH)"

    continue  # Next iteration (skip gate check and Loop 2)
  fi

  echo "[Deliverable Check] ✅ Deliverables verified - proceeding to gate check"
  echo ""

  # Gate check
  if (( $(echo "$LOOP3_CONSENSUS < $GATE" | bc -l) )); then
    echo "❌ Gate FAILED ($LOOP3_CONSENSUS < $GATE)"
    echo "Decision: RELAUNCH iteration $((ITERATION + 1))"

    # LOG: Gate check failure
    ./.claude/skills/redis-coordination/log-event.sh \
      --task-id "$TASK_ID" \
      --event-type "gate_check" \
      --iteration "$ITERATION" \
      --details "{\"consensus\": $LOOP3_CONSENSUS, \"threshold\": $GATE, \"result\": \"FAIL\", \"decision\": \"RELAUNCH\"}" \
      --level "WARN" 2>/dev/null || true

    # METRICS: Increment gate failure counter
    redis-cli INCR "swarm:${TASK_ID}:metrics:gate_failures" >/dev/null

    # PHASE 1 (BUG #23): Accumulate feedback across iterations for learning
    # BUGFIX #22: Store feedback in Redis for next iteration (agents will be re-spawned, not woken)
    # Per P3 agent lifecycle: agents exit cleanly, orchestrator spawns fresh agents
    FEEDBACK_MSG="Improve confidence from $LOOP3_CONSENSUS to >$GATE"
    accumulate_feedback "$TASK_ID" "$ITERATION" "gate_check" "$FEEDBACK_MSG"
    echo "  Reason: gate_failed"
    echo "  Priority: 30 (MEDIUM)"

    continue  # Next iteration
  fi

  echo "✅ Gate PASSED ($LOOP3_CONSENSUS >= $GATE)"

  # LOG: Gate check success
  ./.claude/skills/redis-coordination/log-event.sh \
    --task-id "$TASK_ID" \
    --event-type "gate_check" \
    --iteration "$ITERATION" \
    --details "{\"consensus\": $LOOP3_CONSENSUS, \"threshold\": $GATE, \"result\": \"PASS\"}" \
    --level "INFO" 2>/dev/null || true

  echo ""

  # Simple Gate Pass Signaling (Loop 2 validators spawned AFTER this signal)
  GATE_PASS_KEY="swarm:${TASK_ID}:gate-passed"
  redis-cli lpush "$GATE_PASS_KEY" "{\"iteration\": $ITERATION, \"loop3_confidence\": $LOOP3_CONSENSUS}" > /dev/null
  echo "[Loop 3] ✅ Gate PASSED (consensus: $LOOP3_CONSENSUS >= $GATE)"
  echo "[Loop 3] Gate pass signal sent to Loop 2 validators"
  echo ""

  # Step 2.5: Deliverable Pre-Verification (before Loop 2 validation)
  echo "[Deliverable Pre-Check] Verifying files before Loop 2 validation..."

  # Get expected deliverables from phase context
  PHASE_CONTEXT_JSON=$(redis-cli GET "swarm:${TASK_ID}:phase-context" 2>/dev/null)
  EXPECTED_DELIVERABLES=$(echo "$PHASE_CONTEXT_JSON" | jq -r '.deliverables[]?' 2>/dev/null)

  if [ -n "$EXPECTED_DELIVERABLES" ]; then
    MISSING_FILES=""
    MISSING_COUNT=0
    TOTAL_COUNT=0

    while IFS= read -r file; do
      [ -z "$file" ] && continue  # Skip empty lines
      TOTAL_COUNT=$((TOTAL_COUNT + 1))
      if [ ! -f "$file" ]; then
        MISSING_FILES="${MISSING_FILES}${file}\n"
        MISSING_COUNT=$((MISSING_COUNT + 1))
        echo "  ❌ Missing: $file"
      else
        echo "  ✅ Found: $file"
      fi
    done <<< "$EXPECTED_DELIVERABLES"

    # If ANY files missing, force iteration with explicit feedback
    if [ $MISSING_COUNT -gt 0 ]; then
      echo "❌ Deliverable pre-check FAILED: $MISSING_COUNT of $TOTAL_COUNT files missing"
      echo ""

      # Build explicit feedback list
      FEEDBACK_MSG="CRITICAL: Create these missing deliverables:
$(echo -e "$MISSING_FILES")
Use Write tool for each file. Verify with 'ls -la' after each Write operation."

      # Accumulate feedback for next iteration
      accumulate_feedback "$TASK_ID" "$ITERATION" "deliverable_pre_check" "$FEEDBACK_MSG"

      echo "  Reason: missing_deliverables"
      echo "  Priority: 50 (CRITICAL)"
      echo ""

      # LOG: Deliverable pre-check failure
      ./.claude/skills/redis-coordination/log-event.sh \
        --task-id "$TASK_ID" \
        --event-type "deliverable_pre_check" \
        --iteration "$ITERATION" \
        --details "{\"missing_count\": $MISSING_COUNT, \"total_count\": $TOTAL_COUNT, \"result\": \"FAIL\"}" \
        --level "ERROR" 2>/dev/null || true

      continue  # Skip Loop 2, go to next iteration
    fi

    echo "✅ Deliverable pre-check PASSED: All $TOTAL_COUNT files exist"

    # LOG: Deliverable pre-check success
    ./.claude/skills/redis-coordination/log-event.sh \
      --task-id "$TASK_ID" \
      --event-type "deliverable_pre_check" \
      --iteration "$ITERATION" \
      --details "{\"total_count\": $TOTAL_COUNT, \"result\": \"PASS\"}" \
      --level "INFO" 2>/dev/null || true
  else
    echo "⚠️  No deliverables specified in phase context, skipping pre-check"
  fi
  echo ""

  # Step 3: Build Loop 2 validator context (BUG #20 FIX - inject same deliverables)
  LOOP2_VALIDATOR_CONTEXT="Loop 2 validation for iteration $ITERATION

Review Loop 3 implementation against these requirements:

Epic Goal: $EPIC_GOAL

Expected Deliverables:
$DELIVERABLES
$([ -n "$DIRECTORY" ] && echo "
Target Directory: $DIRECTORY")

Acceptance Criteria:
$ACCEPTANCE

Your Validation Tasks:
- Verify all deliverable files exist in correct directory
- Check files contain actual implementation (not placeholders)
- Validate against acceptance criteria
- Provide structured feedback (critical/warnings/suggestions)
- Report confidence score based on deliverable completeness
"

  echo "[Loop 2] Validator context built"
  echo ""

  # BUG #30 FIX: Determine spawn mode (parallel vs sequential) based on phase
  SEQUENTIAL_SPAWN=false
  if [[ "$PHASE_ID" == "phase-5" ]] || [[ "$PHASE_ID" == "phase-6" ]]; then
    SEQUENTIAL_SPAWN=true
    echo "[Loop 2] Using sequential spawn mode for $PHASE_ID (complex test phase)" >&2
  else
    echo "[Loop 2] Using parallel spawn mode for $PHASE_ID" >&2
  fi
  echo ""

  # BUG #30 FIX: Log environment state before validator spawn
  echo "[Loop 2] Environment State:" >&2
  echo "  TASK_ID: $TASK_ID" >&2
  echo "  ITERATION: $ITERATION" >&2
  echo "  PHASE_ID: ${PHASE_ID:-none}" >&2
  echo "  HOME: ${HOME}" >&2
  echo "  PATH: ${PATH:0:100}..." >&2
  echo "  REDIS_HOST: ${REDIS_HOST:-localhost}" >&2
  echo "  PWD: $(pwd)" >&2
  echo ""

  # Step 4: Spawn Loop 2 validators using skill-based output processing
  if [ "$SEQUENTIAL_SPAWN" = true ]; then
    echo "[Loop 2] Using skill-based output processing (sequential execution)"
  else
    echo "[Loop 2] Using skill-based output processing (parallel execution)"
  fi
  IFS=',' read -ra VALIDATORS <<< "$LOOP2_AGENTS"

  # Track instance counts to generate unique validator IDs for duplicate validator types
  declare -A VALIDATOR_INSTANCE_COUNTS
  declare -A VALIDATOR_IDS  # Map from array index to unique validator ID

  # Pre-calculate unique validator IDs
  for i in "${!VALIDATORS[@]}"; do
    VALIDATOR="${VALIDATORS[$i]}"

    # Increment instance counter for this validator type
    VALIDATOR_INSTANCE_COUNTS["$VALIDATOR"]=$((${VALIDATOR_INSTANCE_COUNTS["$VALIDATOR"]:-0} + 1))
    INSTANCE_NUM="${VALIDATOR_INSTANCE_COUNTS["$VALIDATOR"]}"

    # Generate unique validator ID: validator-type-iteration-instance
    UNIQUE_VALIDATOR_ID="${VALIDATOR}-${ITERATION}-${INSTANCE_NUM}"
    VALIDATOR_IDS["$i"]="$UNIQUE_VALIDATOR_ID"

    echo "  [Instance Tracking] ${VALIDATOR} #${INSTANCE_NUM} → ${UNIQUE_VALIDATOR_ID}"
  done

  echo ""

  # Step 3a: Spawn all validators using skill
  if [ "$SEQUENTIAL_SPAWN" = true ]; then
    echo "[Loop 2] Spawning validators sequentially..."
  else
    echo "[Loop 2] Spawning validators in parallel..."
  fi
  declare -A VALIDATOR_PIDS  # Map from validator ID to background PID
  declare -A VALIDATOR_OUTPUT_FILES  # Map from validator ID to temp output file
  declare -A VALIDATOR_STDERR_FILES  # BUG #30 FIX: Map from validator ID to stderr log file

  LOOP2_TOTAL=${#VALIDATORS[@]}
  LOOP2_REQUIRED=$(calculate_quorum "$MIN_QUORUM_LOOP2" "$LOOP2_TOTAL")

  echo "[Loop 2] Quorum: $LOOP2_REQUIRED/$LOOP2_TOTAL validators required"
  echo ""

  for i in "${!VALIDATORS[@]}"; do
    VALIDATOR="${VALIDATORS[$i]}"
    UNIQUE_VALIDATOR_ID="${VALIDATOR_IDS[$i]}"

    # Get agent-specific timeout (use base validator type, not unique ID)
    AGENT_TIMEOUT=$(get_agent_timeout "$VALIDATOR" "$TASK_ID")

    # Create temp output and stderr files for this validator
    OUTPUT_FILE="/tmp/loop2-${TASK_ID}-${UNIQUE_VALIDATOR_ID}.json"
    STDERR_FILE="/tmp/loop2-${TASK_ID}-${UNIQUE_VALIDATOR_ID}.stderr"
    VALIDATOR_OUTPUT_FILES["$UNIQUE_VALIDATOR_ID"]="$OUTPUT_FILE"
    VALIDATOR_STDERR_FILES["$UNIQUE_VALIDATOR_ID"]="$STDERR_FILE"

    echo "  Spawning: $VALIDATOR (ID: $UNIQUE_VALIDATOR_ID, timeout: ${AGENT_TIMEOUT}s)"

    # BUG #30 FIX: Execute skill in background - captures stdout AND stderr separately
    (
      # METRICS: Agent latency start
      AGENT_START=$(date +%s%N | cut -b1-13)

      # Execute skill to spawn validator and extract feedback (BUG #20 FIX - inject detailed context)
      # BUG #27 FIX: Use process-validator-output.sh (includes structured template injection)
      # BUG #30 FIX: Capture stderr to separate file for error analysis
      SKILL_RESULT=$(./.claude/skills/loop2-output-processing/process-validator-output.sh \
        --agent-type "$VALIDATOR" \
        --task-id "$TASK_ID" \
        --agent-id "$UNIQUE_VALIDATOR_ID" \
        --context "$LOOP2_VALIDATOR_CONTEXT" \
        --iteration "$ITERATION" \
        --timeout "$AGENT_TIMEOUT" 2>"$STDERR_FILE")

      # METRICS: Agent latency end
      AGENT_END=$(date +%s%N | cut -b1-13)
      LATENCY=$((AGENT_END - AGENT_START))

      # BUG #27 FIX: Check for validation warnings (default output detection)
      # Now check both stdout and stderr for warnings
      if echo "$SKILL_RESULT" | grep -q "VALIDATION_WARNING.*default_output"; then
        echo "  ⚠️  Validator produced default output (confidence: 0.70, feedback: 0)" >&2
        echo "     This may indicate validator agent needs guidance on structured format" >&2
      fi

      # BUG #30 FIX: Check stderr for error indicators
      if [ -s "$STDERR_FILE" ]; then
        if grep -q "ERROR\|CRITICAL\|FATAL\|spawn.*failed" "$STDERR_FILE"; then
          echo "  ⚠️  Validator encountered errors during execution (see stderr log)" >&2
        fi
      fi

      # Inject latency into result JSON
      SKILL_RESULT_WITH_LATENCY=$(echo "$SKILL_RESULT" | jq --arg latency "$LATENCY" '. + {latency_ms: ($latency | tonumber)}')

      # Write result to temp file
      echo "$SKILL_RESULT_WITH_LATENCY" > "$OUTPUT_FILE"

      # Also push to Redis for compatibility with existing tools
      echo "$SKILL_RESULT_WITH_LATENCY" | redis-cli -x LPUSH "swarm:${TASK_ID}:${UNIQUE_VALIDATOR_ID}:result" >/dev/null

      # Signal completion
      redis-cli LPUSH "swarm:${TASK_ID}:${UNIQUE_VALIDATOR_ID}:done" "complete" >/dev/null
    ) &

    # Track background PID
    VALIDATOR_PIDS["$UNIQUE_VALIDATOR_ID"]=$!
    echo "  ✅ Spawned $UNIQUE_VALIDATOR_ID (PID: ${VALIDATOR_PIDS[$UNIQUE_VALIDATOR_ID]})"

    # BUG #30 FIX: If sequential mode, wait for this validator before spawning next
    if [ "$SEQUENTIAL_SPAWN" = true ]; then
      echo "  [Sequential Mode] Waiting for $UNIQUE_VALIDATOR_ID to complete before next spawn..."
      wait "${VALIDATOR_PIDS[$UNIQUE_VALIDATOR_ID]}" 2>/dev/null || true
      echo "  [Sequential Mode] $UNIQUE_VALIDATOR_ID complete, pausing 0.5s before next spawn"
      sleep 0.5
    fi
  done

  echo ""
  if [ "$SEQUENTIAL_SPAWN" = true ]; then
    echo "[Loop 2] All validators spawned sequentially, collecting results..."
  else
    echo "[Loop 2] All validators spawned in parallel, waiting for completion..."
  fi
  echo ""

  # Step 3b: Wait for all validators to complete and collect results
  LOOP2_COMPLETED_AGENTS=()
  LOOP2_FAILED_AGENTS=()
  declare -A LOOP2_CONFIDENCES  # Map from validator ID to confidence score

  for i in "${!VALIDATORS[@]}"; do
    VALIDATOR="${VALIDATORS[$i]}"
    UNIQUE_VALIDATOR_ID="${VALIDATOR_IDS[$i]}"
    VALIDATOR_PID="${VALIDATOR_PIDS[$UNIQUE_VALIDATOR_ID]}"
    OUTPUT_FILE="${VALIDATOR_OUTPUT_FILES[$UNIQUE_VALIDATOR_ID]}"
    STDERR_FILE="${VALIDATOR_STDERR_FILES[$UNIQUE_VALIDATOR_ID]}"

    echo "  Waiting for $UNIQUE_VALIDATOR_ID (PID: $VALIDATOR_PID)..."

    # BUG #30 FIX: Wait for background process to complete with enhanced error reporting
    # In sequential mode, process already waited for, so this is instant
    if wait "$VALIDATOR_PID" 2>/dev/null; then
      # Process completed successfully, read result from temp file
      if [ -f "$OUTPUT_FILE" ] && [ -s "$OUTPUT_FILE" ]; then
        SKILL_RESULT=$(cat "$OUTPUT_FILE")

        # Validate JSON structure
        if echo "$SKILL_RESULT" | jq empty 2>/dev/null; then
          # Extract confidence score
          CONFIDENCE=$(echo "$SKILL_RESULT" | jq -r '.confidence // 0.0')
          CONFIDENCE_SOURCE=$(echo "$SKILL_RESULT" | jq -r '.confidence_source // "unknown"')
          FEEDBACK=$(echo "$SKILL_RESULT" | jq -r '.feedback // {}')
          LATENCY=$(echo "$SKILL_RESULT" | jq -r '.latency_ms // 0')

          # Store confidence for consensus calculation
          LOOP2_CONFIDENCES["$UNIQUE_VALIDATOR_ID"]="$CONFIDENCE"

          # Store latency metric
          METRIC=$(jq -nc \
            --arg agent "$UNIQUE_VALIDATOR_ID" \
            --arg latency "$LATENCY" \
            --arg loop "loop2" \
            --arg iteration "$ITERATION" \
            '{agent: $agent, latency_ms: ($latency | tonumber), loop: $loop, iteration: ($iteration | tonumber)}')
          echo "$METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:agent_latency" >/dev/null

          # Count feedback items
          CRITICAL_COUNT=$(echo "$FEEDBACK" | jq -r '.critical | length')
          WARNINGS_COUNT=$(echo "$FEEDBACK" | jq -r '.warnings | length')
          SUGGESTIONS_COUNT=$(echo "$FEEDBACK" | jq -r '.suggestions | length')

          echo "  ✅ $UNIQUE_VALIDATOR_ID complete (${LATENCY}ms, confidence: $CONFIDENCE [$CONFIDENCE_SOURCE], feedback: ${CRITICAL_COUNT}C/${WARNINGS_COUNT}W/${SUGGESTIONS_COUNT}S)"

          # BUG #30 FIX: Check stderr for warnings even on success
          if [ -s "$STDERR_FILE" ]; then
            STDERR_LINES=$(wc -l < "$STDERR_FILE")
            if [ "$STDERR_LINES" -gt 0 ]; then
              echo "  ℹ️  $UNIQUE_VALIDATOR_ID stderr ($STDERR_LINES lines logged to $STDERR_FILE)" >&2
            fi
          fi

          LOOP2_COMPLETED_AGENTS+=("$UNIQUE_VALIDATOR_ID")
        else
          echo "  ⚠️  $UNIQUE_VALIDATOR_ID returned invalid JSON, treating as failed"

          # BUG #30 FIX: Display stderr content on JSON validation failure
          if [ -s "$STDERR_FILE" ]; then
            echo "  [STDERR Content]:" >&2
            head -20 "$STDERR_FILE" | sed 's/^/    /' >&2
            if [ "$(wc -l < "$STDERR_FILE")" -gt 20 ]; then
              echo "    ... (truncated, see full log at $STDERR_FILE)" >&2
            fi
          fi

          LOOP2_FAILED_AGENTS+=("$VALIDATOR")

          # METRICS: Increment timeout counter
          redis-cli INCR "swarm:${TASK_ID}:metrics:timeout_count" >/dev/null
        fi
      else
        echo "  ⚠️  $UNIQUE_VALIDATOR_ID completed but no output file found"

        # BUG #30 FIX: Display stderr to diagnose missing output
        if [ -s "$STDERR_FILE" ]; then
          echo "  [STDERR Content]:" >&2
          head -20 "$STDERR_FILE" | sed 's/^/    /' >&2
          if [ "$(wc -l < "$STDERR_FILE")" -gt 20 ]; then
            echo "    ... (truncated, see full log at $STDERR_FILE)" >&2
          fi
        else
          echo "  [No stderr output captured]" >&2
        fi

        LOOP2_FAILED_AGENTS+=("$VALIDATOR")

        # METRICS: Increment timeout counter
        redis-cli INCR "swarm:${TASK_ID}:metrics:timeout_count" >/dev/null
      fi
    else
      # BUG #30 FIX: Enhanced error reporting with stderr content
      WAIT_EXIT_CODE=$?
      echo "  ❌ $UNIQUE_VALIDATOR_ID failed (process exited with code $WAIT_EXIT_CODE)"

      # Display stderr content for crash diagnosis
      if [ -s "$STDERR_FILE" ]; then
        echo "  [STDERR Content]:" >&2
        head -20 "$STDERR_FILE" | sed 's/^/    /' >&2
        if [ "$(wc -l < "$STDERR_FILE")" -gt 20 ]; then
          echo "    ... (truncated, see full log at $STDERR_FILE)" >&2
        fi
      else
        echo "  [No stderr output captured]" >&2
      fi

      LOOP2_FAILED_AGENTS+=("$VALIDATOR")

      # METRICS: Increment timeout counter
      redis-cli INCR "swarm:${TASK_ID}:metrics:timeout_count" >/dev/null
    fi

    # BUG #30 FIX: Cleanup temp files (keep stderr for debugging if failed)
    rm -f "$OUTPUT_FILE"
    if [[ " ${LOOP2_COMPLETED_AGENTS[@]} " =~ " ${UNIQUE_VALIDATOR_ID} " ]]; then
      # Success - cleanup stderr
      rm -f "$STDERR_FILE"
    else
      # Failure - keep stderr for post-mortem analysis
      echo "  [Debug] Stderr log preserved at: $STDERR_FILE" >&2
    fi
  done

  echo ""

  # Validate quorum
  if [ ${#LOOP2_COMPLETED_AGENTS[@]} -ge "$LOOP2_REQUIRED" ]; then
    echo "[Loop 2] ✅ Quorum met: ${#LOOP2_COMPLETED_AGENTS[@]}/$LOOP2_REQUIRED validators completed"
    if [ ${#LOOP2_FAILED_AGENTS[@]} -gt 0 ]; then
      echo "[Loop 2] ⚠️ Failed validators (continuing with quorum): ${LOOP2_FAILED_AGENTS[*]}"

      # METRICS: Increment quorum fallback counter
      redis-cli INCR "swarm:${TASK_ID}:metrics:quorum_fallback" >/dev/null
    fi
  else
    echo "[Loop 2] ❌ Quorum FAILED: ${#LOOP2_COMPLETED_AGENTS[@]} < $LOOP2_REQUIRED"
    echo "[Loop 2] Failed validators: ${LOOP2_FAILED_AGENTS[*]}"
    exit 1
  fi
  echo ""

  # Step 3c: Calculate Loop 2 consensus from extracted confidence scores
  echo "[Loop 2] Calculating consensus from ${#LOOP2_COMPLETED_AGENTS[@]} validators..."

  # Calculate average confidence from completed validators
  LOOP2_TOTAL_CONFIDENCE=0
  LOOP2_CONFIDENCE_COUNT=0

  for VALIDATOR_ID in "${LOOP2_COMPLETED_AGENTS[@]}"; do
    CONFIDENCE="${LOOP2_CONFIDENCES[$VALIDATOR_ID]}"
    if [ -n "$CONFIDENCE" ] && [ "$CONFIDENCE" != "null" ]; then
      LOOP2_TOTAL_CONFIDENCE=$(echo "$LOOP2_TOTAL_CONFIDENCE + $CONFIDENCE" | bc -l)
      LOOP2_CONFIDENCE_COUNT=$((LOOP2_CONFIDENCE_COUNT + 1))
    fi
  done

  if [ "$LOOP2_CONFIDENCE_COUNT" -gt 0 ]; then
    LOOP2_CONSENSUS=$(echo "scale=2; $LOOP2_TOTAL_CONFIDENCE / $LOOP2_CONFIDENCE_COUNT" | bc -l)
  else
    echo "⚠️  No valid confidence scores found, defaulting to 0.0"
    LOOP2_CONSENSUS=0.0
  fi

  echo "[Loop 2] Average consensus: $LOOP2_CONSENSUS (from ${LOOP2_CONFIDENCE_COUNT} validators)"

  # METRICS: Store Loop 2 consensus score
  LOOP2_METRIC=$(jq -nc \
    --arg consensus "$LOOP2_CONSENSUS" \
    --arg iteration "$ITERATION" \
    '{consensus: ($consensus | tonumber), iteration: ($iteration | tonumber)}')
  echo "$LOOP2_METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:loop2_consensus" >/dev/null

  # Display consensus status
  echo ""
  if (( $(echo "$LOOP2_CONSENSUS >= $CONSENSUS" | bc -l) )); then
    echo "✅ CONSENSUS REACHED ($LOOP2_CONSENSUS >= $CONSENSUS)"
  else
    echo "⚠️ CONSENSUS NOT REACHED ($LOOP2_CONSENSUS < $CONSENSUS)"
  fi
  echo ""

  # [BUG #11 FIX] Product Owner decision via output parsing (not Redis wait)
  echo "[Product Owner] Spawning Product Owner for strategic decision..."

  # BUG #19 FIX: Define PO_UNIQUE_ID BEFORE building context string
  PO_UNIQUE_ID="${PRODUCT_OWNER}-${ITERATION}"

  # Build Product Owner context
  PO_CONTEXT="CFN Loop iteration $ITERATION complete.

Loop 2 Consensus: $LOOP2_CONSENSUS (threshold: $CONSENSUS)
Task ID: $TASK_ID
Agent ID: $PO_UNIQUE_ID

Make your strategic decision: PROCEED, ITERATE, or ABORT

Decision Framework:
- PROCEED: Consensus >= $CONSENSUS AND deliverables verified
- ITERATE: Consensus < $CONSENSUS AND iteration < $MAX_ITERATIONS
- ABORT: Max iterations reached without consensus

Output your decision clearly with reasoning."

  # Spawn Product Owner and capture output
  PO_TIMEOUT=$(get_agent_timeout "$PRODUCT_OWNER" "$TASK_ID")
  echo "[Product Owner] Spawning with timeout: ${PO_TIMEOUT}s"

  PO_OUTPUT=$(timeout "$PO_TIMEOUT" npx claude-flow-novice agent "$PRODUCT_OWNER" \
    --task-id "$TASK_ID" \
    --agent-id "$PO_UNIQUE_ID" \
    --context "$PO_CONTEXT" 2>&1 || true)

  # Parse structured decision JSON from Redis (created by execute-product-owner-decision.sh)
  echo "[Product Owner] Retrieving structured decision from Redis..."
  DECISION=$(redis-cli lindex "swarm:${TASK_ID}:${PO_UNIQUE_ID}:decision" 0)

  if [ -z "$DECISION" ] || [ "$DECISION" = "(nil)" ]; then
    echo "❌ ERROR: Could not retrieve Product Owner decision from Redis"
    echo "Expected key: swarm:${TASK_ID}:${PO_UNIQUE_ID}:decision"
    echo "Product Owner output:"
    echo "$PO_OUTPUT"
    exit 1
  fi

  # Extract fields from structured JSON
  DECISION_TYPE=$(echo "$DECISION" | jq -r '.decision')
  DECISION_REASONING=$(echo "$DECISION" | jq -r '.reasoning')
  DECISION_CONFIDENCE=$(echo "$DECISION" | jq -r '.confidence')
  IN_SCOPE_CONSENSUS=$(echo "$DECISION" | jq -r '.scope_analysis.in_scope_consensus // 0')
  BACKLOG_COUNT=$(echo "$DECISION" | jq -r '.backlog_items | length')

  if [ -z "$DECISION_TYPE" ] || [ "$DECISION_TYPE" = "null" ]; then
    echo "❌ ERROR: Invalid Product Owner decision JSON"
    echo "Received: $DECISION"
    exit 1
  fi

  echo "  Decision Type: $DECISION_TYPE"
  echo "  Confidence: $DECISION_CONFIDENCE"
  echo "  In-Scope Consensus: $IN_SCOPE_CONSENSUS"
  echo "  Backlog Items: $BACKLOG_COUNT"
  echo ""

  # LOG: Product Owner decision
  ./.claude/skills/redis-coordination/log-event.sh \
    --task-id "$TASK_ID" \
    --event-type "po_decision" \
    --agent-id "$PO_UNIQUE_ID" \
    --iteration "$ITERATION" \
    --details "$DECISION" \
    --level "INFO" 2>/dev/null || true

  echo "[Product Owner] Decision: $DECISION_TYPE"
  echo ""

  # Handle Product Owner decision
  if [ "$DECISION_TYPE" = "PROCEED" ] || [ "$DECISION_TYPE" = "DEFER_AND_PROCEED" ]; then
    # Handle backlog items if DEFER_AND_PROCEED
    if [ "$DECISION_TYPE" = "DEFER_AND_PROCEED" ]; then
      echo "📋 Product Owner Decision: DEFER_AND_PROCEED"
      echo "   In-scope work complete (consensus: $IN_SCOPE_CONSENSUS)"
      echo "   Deferred $BACKLOG_COUNT out-of-scope items to backlog"
      echo ""
    fi

    # DELIVERABLE VERIFICATION (Sprint 8 - prevent "consensus on vapor")
    echo "[Deliverable Verification] Checking success criteria..."

    SUCCESS_CRITERIA_RAW=$(redis-cli GET "swarm:${TASK_ID}:success-criteria" 2>/dev/null)
    if [ -n "$SUCCESS_CRITERIA_RAW" ]; then
      # Check if task description includes file/deliverable keywords
      TASK_DESC=$(redis-cli GET "swarm:${TASK_ID}:task" 2>/dev/null)

      if echo "$TASK_DESC" | grep -qiE "create|build|implement|generate|file|component|module|test"; then
        echo "[Deliverable Verification] Task involves implementation - checking for file changes..."

        # Count modified/created files since orchestrator started
        FILES_CREATED=$(git status --short 2>/dev/null | grep -E "^(A|M|\\?\\?)" | wc -l)

        if [ "$FILES_CREATED" -eq 0 ]; then
          echo "⚠️ DELIVERABLE VERIFICATION FAILED"
          echo "   Task requires implementation but no files were created/modified"
          echo "   Consensus reached on plans without actual deliverables"
          echo ""
          echo "   Options:"
          echo "   1. Force ITERATE to create actual implementation"
          echo "   2. Override verification (--skip-deliverable-check flag)"
          echo "   3. Manual intervention to verify work was done"
          echo ""
          echo "   Recommendation: Force ITERATE with explicit deliverable requirement"

          # Store verification failure
          redis-cli SET "swarm:${TASK_ID}:deliverable_verification" "failed" EX 86400 >/dev/null

          # Optional: Force ITERATE (commented for now - requires flag)
          # echo "[Forced Override] Changing PROCEED → ITERATE due to missing deliverables"
          # DECISION_TYPE="ITERATE"
          # DECISION_REASONING="No deliverables created despite implementation task"
        else
          echo "✅ Deliverable verification passed ($FILES_CREATED files created/modified)"
          redis-cli SET "swarm:${TASK_ID}:deliverable_verification" "passed:$FILES_CREATED" EX 86400 >/dev/null
        fi
      else
        echo "[Deliverable Verification] Task is analysis/planning - skipping file check"
      fi
    fi

    echo "🎉 CFN Loop Complete (Product Owner: PROCEED)"
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

    # BUGFIX #22: Agents have already exited (P3 clean-exit pattern), no wake needed
    # The task is complete, agents were already cleaned up when they reported confidence
    echo "[Coordinator] Task complete (PROCEED decision)"
    echo "  All agents have already exited cleanly per P3 lifecycle"

    # Use general complete-swarm primitive
    ./.claude/skills/redis-coordination/complete-swarm.sh \
      --swarm-id "$SWARM_ID" \
      --final-metric "final_consensus=$LOOP2_CONSENSUS" \
      --final-metric "total_iterations=$ITERATION" > /dev/null

    exit 0

  elif [ "$DECISION_TYPE" = "ITERATE" ]; then
    echo "⚠️ Product Owner Decision: ITERATE (improve quality)"

    # METRICS: Iteration end timestamp and duration
    ITERATION_END=$(date +%s%N | cut -b1-13)
    ITERATION_DURATION=$((ITERATION_END - ITERATION_START))

    # Store iteration duration metric
    DURATION_METRIC=$(jq -nc \
      --arg duration "$ITERATION_DURATION" \
      --arg iteration "$ITERATION" \
      '{duration_ms: ($duration | tonumber), iteration: ($iteration | tonumber)}')
    echo "$DURATION_METRIC" | redis-cli -x LPUSH "swarm:${TASK_ID}:metrics:iteration_duration" >/dev/null

    # Check max iterations
    if [ $ITERATION -eq $MAX_ITERATIONS ]; then
      echo "❌ Maximum iterations ($MAX_ITERATIONS) reached - cannot iterate further"
      echo "   Product Owner wanted ITERATE but max iterations exhausted"
      exit 1
    fi

    # PHASE 1 (BUG #23): Accumulate feedback across iterations for learning
    # BUGFIX #22: Store feedback in Redis for next iteration (agents will be re-spawned, not woken)
    # Per P3 agent lifecycle: agents exit cleanly, orchestrator spawns fresh agents for next iteration
    echo "[Coordinator] Storing feedback for iteration $((ITERATION + 1))..."

    FEEDBACK_MSG="Product Owner decision: ITERATE - Improve consensus from $LOOP2_CONSENSUS to >=$CONSENSUS"
    accumulate_feedback "$TASK_ID" "$ITERATION" "product_owner_iterate" "$FEEDBACK_MSG"

    echo "  Reason: cfn_loop_iteration (Product Owner ITERATE decision)"
    echo "  Priority: 30 (MEDIUM - Loop 3), 10 (HIGH - Loop 2)"
    echo ""

    # Check iteration timeout before continuing
    CURRENT_TIME=$(date +%s)
    ITERATION_ELAPSED=$((CURRENT_TIME - ITERATION_START_SEC))
    if [ "$ITERATION_ELAPSED" -gt "$ITERATION_TIMEOUT" ]; then
      echo "❌ Iteration $ITERATION timeout (>${ITERATION_TIMEOUT}s, actual: ${ITERATION_ELAPSED}s)"
      echo "   Cannot proceed to next iteration"
      exit 1
    fi

    # BUG FIX: Explicit iteration progression tracking
    NEXT_ITERATION=$((ITERATION + 1))
    echo "[CFN Loop] Iteration $ITERATION complete (${ITERATION_ELAPSED}s) - proceeding to iteration $NEXT_ITERATION"
    redis-cli SET "swarm:${TASK_ID}:current-iteration" "$NEXT_ITERATION" EX 86400 >/dev/null

    # LOG: Iteration transition
    ./.claude/skills/redis-coordination/log-event.sh \
      --task-id "$TASK_ID" \
      --event-type "iteration_transition" \
      --iteration "$ITERATION" \
      --details "{\"from_iteration\": $ITERATION, \"to_iteration\": $NEXT_ITERATION, \"reason\": \"ITERATE_decision\", \"consensus\": $LOOP2_CONSENSUS, \"elapsed_sec\": $ITERATION_ELAPSED}" \
      --level "INFO" 2>/dev/null || true

    # BUGFIX: Explicit continue to next iteration (makes flow clearer)
    # While for loop automatically continues, explicit continue ensures proper flow
    echo "[CFN Loop] Starting iteration $NEXT_ITERATION..."
    echo ""
    continue

  elif [ "$DECISION_TYPE" = "ABORT" ]; then
    echo "❌ Product Owner Decision: ABORT (scope too large or out of scope)"
    echo "   Consensus: $LOOP2_CONSENSUS, Iteration: $ITERATION"
    exit 1

  else
    echo "❌ ERROR: Unknown Product Owner decision: $DECISION_TYPE"
    echo "   Expected: PROCEED, DEFER_AND_PROCEED, ITERATE, or ABORT"
    exit 1
  fi
done

echo "❌ CFN Loop failed after $MAX_ITERATIONS iterations"
exit 1
