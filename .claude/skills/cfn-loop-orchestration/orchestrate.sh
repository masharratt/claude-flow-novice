#!/usr/bin/env bash

##############################################################################
# CFN Loop Orchestration - Main Coordinator
# Version: 1.1.0 (Security Enhanced)
#
# Orchestrates the Complete Fail Never (CFN) Loop workflow using modular
# helper scripts, Redis Coordination primitives, and enhanced security.
#
# Usage:
#   ./orchestrate.sh --task-id <id> \
#                    --mode <mvp|standard|enterprise> \
#                    --loop3-agents <agent1,agent2,...> \
#                    --loop2-agents <agent1,agent2,...> \
#                    --product-owner <agent-id> \
#                    [--max-iterations <n>] \
#                    [--epic-context <json>] \
#                    [--phase-context <json>] \
#                    [--success-criteria <json>]
##############################################################################

set -euo pipefail

# Load security utilities
# shellcheck source=./security_utils.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/security_utils.sh"

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS_DIR="$SCRIPT_DIR/helpers"
REDIS_COORD_SKILL="$(cd "$SCRIPT_DIR/../redis-coordination" && pwd)"

# Configuration
TASK_ID=""
MODE="standard"
LOOP3_AGENTS=""
LOOP2_AGENTS=""
PRODUCT_OWNER=""
MAX_ITERATIONS=10
MIN_QUORUM_LOOP3="0.66"
MIN_QUORUM_LOOP2="0.66"
EPIC_CONTEXT=""
PHASE_CONTEXT=""
SUCCESS_CRITERIA=""
EXPECTED_FILES=""
PHASE_ID=""

# Mode-specific thresholds
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

# Execution tracking
START_TIME=$(date +%s)
ITERATIONS_COMPLETED=0
FINAL_DECISION=""
LOOP3_FINAL_CONFIDENCE=0.0
LOOP2_FINAL_CONSENSUS=0.0
DELIVERABLES_VERIFIED=false

##############################################################################
# Argument Parsing
##############################################################################
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      if [[ $# -lt 2 ]]; then
        echo "Error: --task-id requires a value"
        exit 1
      fi
      TASK_ID=$(sanitize_input "$2") || { echo "Invalid task ID"; exit 1; }
      shift 2
      ;;
    --mode)
      if [[ $# -lt 2 ]]; then
        echo "Error: --mode requires a value"
        exit 1
      fi
      MODE="$2"
      # Whitelist allowed modes
      if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
        echo "Invalid mode. Must be mvp, standard, or enterprise."
        exit 1
      fi
      shift 2
      ;;
    --loop3-agents)
      if [[ $# -lt 2 ]]; then
        echo "Error: --loop3-agents requires a value"
        exit 1
      fi
      validate_agent_list "$2" || { echo "Invalid Loop 3 agent list"; exit 1; }
      LOOP3_AGENTS="$2"
      shift 2
      ;;
    --loop2-agents)
      if [[ $# -lt 2 ]]; then
        echo "Error: --loop2-agents requires a value"
        exit 1
      fi
      validate_agent_list "$2" || { echo "Invalid Loop 2 agent list"; exit 1; }
      LOOP2_AGENTS="$2"
      shift 2
      ;;
    --product-owner)
      if [[ $# -lt 2 ]]; then
        echo "Error: --product-owner requires a value"
        exit 1
      fi
      PRODUCT_OWNER=$(sanitize_input "$2") || { echo "Invalid product owner"; exit 1; }
      shift 2
      ;;
    --max-iterations)
      if [[ $# -lt 2 ]]; then
        echo "Error: --max-iterations requires a value"
        exit 1
      fi
      # Validate max iterations is a positive integer
      if [[ ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Max iterations must be a positive integer"
        exit 1
      fi
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --min-quorum-loop3)
      if [[ $# -lt 2 ]]; then
        echo "Error: --min-quorum-loop3 requires a value"
        exit 1
      fi
      # Validate quorum is a valid decimal between 0 and 1
      if [[ ! "$2" =~ ^0\.[0-9]+$ ]] || (( $(echo "$2 > 1" | bc -l) )); then
        echo "Invalid Loop 3 quorum. Must be between 0 and 1."
        exit 1
      fi
      MIN_QUORUM_LOOP3="$2"
      shift 2
      ;;
    --min-quorum-loop2)
      if [[ $# -lt 2 ]]; then
        echo "Error: --min-quorum-loop2 requires a value"
        exit 1
      fi
      # Validate quorum is a valid decimal between 0 and 1
      if [[ ! "$2" =~ ^0\.[0-9]+$ ]] || (( $(echo "$2 > 1" | bc -l) )); then
        echo "Invalid Loop 2 quorum. Must be between 0 and 1."
        exit 1
      fi
      MIN_QUORUM_LOOP2="$2"
      shift 2
      ;;
    --epic-context)
      if [[ $# -lt 2 ]]; then
        echo "Error: --epic-context requires a value"
        exit 1
      fi
      validate_json_context "$2" || { echo "Invalid epic context JSON"; exit 1; }
      EPIC_CONTEXT="$2"
      shift 2
      ;;
    --phase-context)
      if [[ $# -lt 2 ]]; then
        echo "Error: --phase-context requires a value"
        exit 1
      fi
      validate_json_context "$2" || { echo "Invalid phase context JSON"; exit 1; }
      PHASE_CONTEXT="$2"
      shift 2
      ;;
    --success-criteria)
      if [[ $# -lt 2 ]]; then
        echo "Error: --success-criteria requires a value"
        exit 1
      fi
      validate_json_context "$2" || { echo "Invalid success criteria JSON"; exit 1; }
      SUCCESS_CRITERIA="$2"
      shift 2
      ;;
    --expected-files)
      if [[ $# -lt 2 ]]; then
        echo "Error: --expected-files requires a value"
        exit 1
      fi
      # Optional: validate each expected file name if not empty
      if [ -n "$2" ]; then
        IFS=',' read -ra FILES <<< "$2"
        for file in "${FILES[@]}"; do
          sanitize_input "$file" 256 || { echo "Invalid expected filename: $file"; exit 1; }
        done
      fi
      EXPECTED_FILES="$2"
      shift 2
      ;;
    --phase-id)
      if [[ $# -lt 2 ]]; then
        echo "Error: --phase-id requires a value"
        exit 1
      fi
      PHASE_ID=$(sanitize_input "$2") || { echo "Invalid phase ID"; exit 1; }
      shift 2
      ;;
    *)
      echo "Error: Unknown option: '$1'"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Required options:"
      echo "  --task-id <id>              Unique task identifier"
      echo "  --loop3-agents <agents>     Comma-separated list of Loop 3 agents"
      echo "  --loop2-agents <agents>     Comma-separated list of Loop 2 agents"
      echo "  --product-owner <agent>     Product owner agent ID"
      echo ""
      echo "Optional options:"
      echo "  --mode <mode>               CFN mode: mvp, standard, enterprise (default: standard)"
      echo "  --max-iterations <n>        Maximum iterations (default: 10)"
      echo "  --min-quorum-loop3 <n>      Loop 3 quorum threshold (default: 0.66)"
      echo "  --min-quorum-loop2 <n>      Loop 2 quorum threshold (default: 0.66)"
      echo "  --epic-context <json>       Epic context JSON"
      echo "  --phase-context <json>      Phase context JSON"
      echo "  --success-criteria <json>   Success criteria JSON"
      echo "  --expected-files <files>    Comma-separated expected deliverables"
      echo "  --phase-id <id>             Phase identifier for timeout calculation"
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

# Get thresholds for mode
# Add additional mode validation with safe fallback
case "$MODE" in
  mvp)
    GATE=${GATE_THRESHOLD[mvp]:-0.70}
    CONSENSUS=${CONSENSUS_THRESHOLD[mvp]:-0.80}
    ;;
  standard)
    GATE=${GATE_THRESHOLD[standard]:-0.75}
    CONSENSUS=${CONSENSUS_THRESHOLD[standard]:-0.90}
    ;;
  enterprise)
    GATE=${GATE_THRESHOLD[enterprise]:-0.85}
    CONSENSUS=${CONSENSUS_THRESHOLD[enterprise]:-0.95}
    ;;
  *)
    echo "Invalid mode: $MODE"
    exit 1
    ;;
esac

# Calculate timeout
TIMEOUT=$("$HELPERS_DIR/timeout-calculator.sh" --phase-id "${PHASE_ID:-unknown}")

echo "=============================================="
echo "CFN Loop Orchestration v1.0.0"
echo "=============================================="
echo "Task ID: $TASK_ID"
echo "Mode: $MODE"
echo "Gate Threshold: $GATE"
echo "Consensus Threshold: $CONSENSUS"
echo "Max Iterations: $MAX_ITERATIONS"
echo "Timeout: ${TIMEOUT}s"
echo "=============================================="
echo ""

##############################################################################
# Helper Functions
##############################################################################

function store_context() {
  local task_id="$1"

  # Store epic context if provided using Redis coordination primitive
  if [ -n "$EPIC_CONTEXT" ]; then
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "epic-context" \
      --value "$EPIC_CONTEXT" \
      --namespace "swarm" >/dev/null
    echo "Stored epic context"
  fi

  # Store phase context if provided using Redis coordination primitive
  if [ -n "$PHASE_CONTEXT" ]; then
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "phase-context" \
      --value "$PHASE_CONTEXT" \
      --namespace "swarm" >/dev/null
    echo "Stored phase context"
  fi

  # Store success criteria if provided using Redis coordination primitive
  if [ -n "$SUCCESS_CRITERIA" ]; then
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "success-criteria" \
      --value "$SUCCESS_CRITERIA" \
      --namespace "swarm" >/dev/null
    echo "Stored success criteria"
  fi

  echo ""
}

function spawn_loop3_agents() {
  local task_id="$1"
  local iteration="$2"
  local agents="$3"

  echo "[Loop 3] Spawning implementer agents (iteration $iteration)..."

  # Convert comma-separated agents to array
  IFS=',' read -ra AGENT_ARRAY <<< "$agents"

  # Spawn each agent via CLI
  for agent_id in "${AGENT_ARRAY[@]}"; do
    echo "  Spawning: $agent_id"

    # Validate agent input
    local safe_agent_id safe_task_id
    safe_agent_id=$(sanitize_input "$agent_id") || continue
    safe_task_id=$(sanitize_input "$task_id") || continue

    # Spawn agent in background
    npx claude-flow-novice agent "$safe_agent_id" \
      --task-id "$safe_task_id" \
      --iteration "$iteration" \
      --context "Loop 3 implementation" &

    # Store PID for monitoring using Redis coordination primitive
    AGENT_PID=$!
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "${agent_id}:pid" \
      --value "{\"pid\": $AGENT_PID}" \
      --namespace "swarm" >/dev/null
  done

  echo "[Loop 3] All agents spawned"
  echo ""
}

function wait_for_agents() {
  local task_id="$1"
  local agents="$2"
  local timeout="$3"

  echo "Waiting for agents to complete (timeout: ${timeout}s)..."

  # Convert comma-separated agents to array
  IFS=',' read -ra AGENT_ARRAY <<< "$agents"

  # Parallel BLPOP implementation with shared timeout
  # Track start time for global timeout calculation
  local start_time=$(date +%s)

  # Spawn parallel BLPOP processes for each agent
  local pids=()
  local temp_files=()

  for agent_id in "${AGENT_ARRAY[@]}"; do
    # Create temporary file for this agent's result
    local temp_file="/tmp/cfn-wait-${task_id}-${agent_id}-$$.tmp"
    temp_files+=("$temp_file")

    # Spawn BLPOP in background, write result to temp file
    # BLOCKER #1 FIX: Use redis-cli blpop directly instead of signal.sh wait (which doesn't exist)
    (
      redis-cli blpop "swarm:${task_id}:${agent_id}:done" "$timeout" >/dev/null 2>&1 && echo "success" > "$temp_file" || echo "timeout" > "$temp_file"
    ) &

    pids+=($!)
  done

  # Wait for all parallel BLPOP processes to complete
  # This ensures timeout is global (60s total), not per-agent (60s * N)
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done

  # Calculate actual elapsed time
  local end_time=$(date +%s)
  local elapsed=$((end_time - start_time))

  # Check results and report status
  local completed=0
  local timed_out=0

  for i in "${!AGENT_ARRAY[@]}"; do
    local agent_id="${AGENT_ARRAY[$i]}"
    local temp_file="${temp_files[$i]}"

    if [ -f "$temp_file" ]; then
      local result=$(cat "$temp_file")
      if [ "$result" = "success" ]; then
        ((completed++))
      else
        ((timed_out++))
        echo "  Warning: $agent_id did not complete within timeout"
      fi
      rm -f "$temp_file"
    else
      ((timed_out++))
      echo "  Warning: $agent_id result file missing"
    fi
  done

  echo "Agents completed: $completed/${#AGENT_ARRAY[@]} (elapsed: ${elapsed}s)"
  echo ""
}

function spawn_loop2_agents() {
  local task_id="$1"
  local iteration="$2"
  local agents="$3"

  echo "[Loop 2] Spawning validator agents (iteration $iteration)..."

  # Convert comma-separated agents to array
  IFS=',' read -ra AGENT_ARRAY <<< "$agents"

  # Spawn each agent via CLI
  for agent_id in "${AGENT_ARRAY[@]}"; do
    echo "  Spawning: $agent_id"

    # Spawn agent in background
    npx claude-flow-novice agent "$agent_id" \
      --task-id "$task_id" \
      --iteration "$iteration" \
      --context "Loop 2 validation" &

    # Store PID for monitoring using Redis coordination primitive
    AGENT_PID=$!
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "${agent_id}:pid" \
      --value "{\"pid\": $AGENT_PID}" \
      --namespace "swarm" >/dev/null
  done

  echo "[Loop 2] All agents spawned"
  echo ""
}

function spawn_product_owner() {
  local task_id="$1"
  local iteration="$2"

  echo "[Product Owner] Spawning decision agent..."

  # BLOCKER #2 FIX: Match execute-decision.sh actual parameters
  # Required: --task-id, --agent-id, --consensus, --threshold, --iteration, --max-iterations
  local decision_output
  decision_output=$("$SCRIPT_DIR/../product-owner-decision/execute-decision.sh" \
    --task-id "$task_id" \
    --agent-id "$PRODUCT_OWNER" \
    --consensus "$LOOP2_FINAL_CONSENSUS" \
    --threshold "$CONSENSUS" \
    --iteration "$iteration" \
    --max-iterations "$MAX_ITERATIONS")

  # Parse decision from output
  if echo "$decision_output" | grep -q "PROCEED"; then
    FINAL_DECISION="PROCEED"
  elif echo "$decision_output" | grep -q "ITERATE"; then
    FINAL_DECISION="ITERATE"
  elif echo "$decision_output" | grep -q "ABORT"; then
    FINAL_DECISION="ABORT"
  else
    echo "Warning: Could not parse Product Owner decision, defaulting to ITERATE"
    FINAL_DECISION="ITERATE"
  fi

  echo "[Product Owner] Decision: $FINAL_DECISION"
  echo ""
}

function output_result() {
  local status="$1"
  local end_time=$(date +%s)
  local execution_time=$((end_time - START_TIME))

  echo "=============================================="
  echo "CFN Loop Execution Complete"
  echo "=============================================="
  echo "Status: $status"
  echo "Iterations: $ITERATIONS_COMPLETED"
  echo "Final Decision: $FINAL_DECISION"
  echo "Loop 3 Confidence: $LOOP3_FINAL_CONFIDENCE"
  echo "Loop 2 Consensus: $LOOP2_FINAL_CONSENSUS"
  echo "Deliverables Verified: $DELIVERABLES_VERIFIED"
  echo "Execution Time: ${execution_time}s"
  echo "=============================================="

  # Output structured JSON result
  cat <<EOF
{
  "status": "$status",
  "iterations_completed": $ITERATIONS_COMPLETED,
  "final_decision": "$FINAL_DECISION",
  "loop3_confidence": $LOOP3_FINAL_CONFIDENCE,
  "loop2_consensus": $LOOP2_FINAL_CONSENSUS,
  "deliverables_verified": $DELIVERABLES_VERIFIED,
  "execution_time_seconds": $execution_time
}
EOF
}

##############################################################################
# Main CFN Loop
##############################################################################

# Store context in Redis
store_context "$TASK_ID"

# Iteration loop
for ((ITERATION=1; ITERATION<=MAX_ITERATIONS; ITERATION++)); do
  echo ""
  echo "=========================================="
  echo "Iteration $ITERATION / $MAX_ITERATIONS"
  echo "=========================================="
  echo ""

  ITERATIONS_COMPLETED=$ITERATION

  # Step 1: Spawn Loop 3 agents (implementers)
  spawn_loop3_agents "$TASK_ID" "$ITERATION" "$LOOP3_AGENTS"

  # Step 2: Wait for Loop 3 completion
  wait_for_agents "$TASK_ID" "$LOOP3_AGENTS" "$TIMEOUT"

  # Step 3: Verify deliverables (prevent "consensus on vapor")
  if [ -n "$EXPECTED_FILES" ] || [ -n "$EPIC_CONTEXT" ]; then
    # Extract task type from epic context for keyword detection
    TASK_TYPE=""
    if [ -n "$EPIC_CONTEXT" ]; then
      TASK_TYPE=$(echo "$EPIC_CONTEXT" | jq -r '.epicGoal // ""' 2>/dev/null || echo "")
    fi

    if "$HELPERS_DIR/deliverable-verifier.sh" \
         --expected-files "${EXPECTED_FILES:-}" \
         --task-type "${TASK_TYPE:-}"; then
      DELIVERABLES_VERIFIED=true
    else
      echo "❌ Deliverable verification failed - forcing Loop 3 iteration"
      # Use iteration manager to wake Loop 3 agents with explicit feedback
      "$HELPERS_DIR/iteration-manager.sh" \
        --task-id "$TASK_ID" \
        --iteration "$((ITERATION + 1))" \
        --agents "$LOOP3_AGENTS" \
        --feedback-source "swarm:${TASK_ID}:feedback"
      continue
    fi
  fi

  # Step 4: Gate check (Loop 3 self-validation)
  if "$HELPERS_DIR/gate-check.sh" \
       --task-id "$TASK_ID" \
       --agents "$LOOP3_AGENTS" \
       --threshold "$GATE" \
       --min-quorum "$MIN_QUORUM_LOOP3"; then
    # Gate passed - store confidence
    LOOP3_FINAL_CONFIDENCE=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
      --task-id "$TASK_ID" \
      --agent-ids "$LOOP3_AGENTS" \
      --min-quorum "$MIN_QUORUM_LOOP3")
  else
    # Gate failed - iterate Loop 3
    echo "❌ Gate check failed - iterating Loop 3"
    "$HELPERS_DIR/iteration-manager.sh" \
      --task-id "$TASK_ID" \
      --iteration "$((ITERATION + 1))" \
      --agents "$LOOP3_AGENTS" \
      --feedback-source "swarm:${TASK_ID}:feedback"
    continue
  fi

  # Step 5: Spawn Loop 2 agents (validators)
  spawn_loop2_agents "$TASK_ID" "$ITERATION" "$LOOP2_AGENTS"

  # Step 6: Wait for Loop 2 completion
  wait_for_agents "$TASK_ID" "$LOOP2_AGENTS" "$TIMEOUT"

  # Step 7: Consensus check (Loop 2 validation)
  if "$HELPERS_DIR/consensus.sh" \
       --task-id "$TASK_ID" \
       --agents "$LOOP2_AGENTS" \
       --threshold "$CONSENSUS" \
       --min-quorum "$MIN_QUORUM_LOOP2"; then
    # Consensus reached - store score
    LOOP2_FINAL_CONSENSUS=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
      --task-id "$TASK_ID" \
      --agent-ids "$LOOP2_AGENTS" \
      --min-quorum "$MIN_QUORUM_LOOP2")
  else
    # Consensus failed - iterate all agents
    echo "❌ Consensus check failed - iterating all agents"
    "$HELPERS_DIR/iteration-manager.sh" \
      --task-id "$TASK_ID" \
      --iteration "$((ITERATION + 1))" \
      --agents "$LOOP3_AGENTS,$LOOP2_AGENTS" \
      --feedback-source "swarm:${TASK_ID}:feedback"
    continue
  fi

  # Step 8: Product Owner Decision
  spawn_product_owner "$TASK_ID" "$ITERATION"

  # Step 9: Execute decision
  case "$FINAL_DECISION" in
    PROCEED)
      output_result "success"
      exit 0
      ;;
    ABORT)
      output_result "aborted"
      exit 1
      ;;
    ITERATE)
      if [ $ITERATION -ge $MAX_ITERATIONS ]; then
        echo "❌ Max iterations reached"
        output_result "failed"
        exit 1
      fi

      echo "🔄 Product Owner requested iteration"
      "$HELPERS_DIR/iteration-manager.sh" \
        --task-id "$TASK_ID" \
        --iteration "$((ITERATION + 1))" \
        --agents "$LOOP3_AGENTS,$LOOP2_AGENTS" \
        --feedback-source "swarm:${TASK_ID}:feedback"
      continue
      ;;
  esac
done

# Max iterations reached without success
echo "❌ Max iterations ($MAX_ITERATIONS) reached without PROCEED decision"
output_result "failed"
exit 1
