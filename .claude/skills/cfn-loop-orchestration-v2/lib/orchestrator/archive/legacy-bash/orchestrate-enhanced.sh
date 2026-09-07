#!/usr/bin/env bash

##############################################################################
# CFN Loop Orchestrator - Enhanced TypeScript Integration
#
# Orchestrates Fail Never (CFN) Loop workflow with progressive TypeScript adoption
# Supports both bash script calls (legacy) and TypeScript module calls (v3.0+)
#
# Usage:
#   ./orchestrate-enhanced.sh --task-id <id> --mode <mvp|standard|enterprise>
#
# Feature Flag: USE_TYPESCRIPT=true (default)
##############################################################################

set -euo pipefail

# Determine script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Configuration
USE_TYPESCRIPT="${USE_TYPESCRIPT:-true}"
TASK_ID=""
MODE="standard"
MAX_ITERATIONS=10
LOOP3_AGENTS=""
LOOP2_AGENTS=""
PRODUCT_OWNER=""
SUCCESS_CRITERIA=""
TASK_DESCRIPTION=""

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

##############################################################################
# Input Validation
##############################################################################

sanitize_input() {
  local input="$1"
  local max_length="${2:-256}"
  input="${input:0:$max_length}"
  echo "$input" | sed 's/[^a-zA-Z0-9._:, /-]//g'
}

##############################################################################
# TypeScript Helper Functions
##############################################################################

call_ts_spawn_agent() {
  local agent_type="$1"
  local task_id="$2"
  local iteration="$3"
  local mode="$4"

  if [[ "$USE_TYPESCRIPT" == "true" ]]; then
    node "$PROJECT_ROOT/dist/coordination/spawn-agent.js" \
      --agent-type "$agent_type" \
      --task-id "$task_id" \
      --iteration "$iteration" \
      --mode "$mode"
  else
    # Fallback to bash script
    "$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh" \
      --agent-type "$agent_type" \
      --task-id "$task_id" \
      --iteration "$iteration" \
      --mode "$mode"
  fi
}

call_ts_select_agents() {
  local task_description="$1"

  if [[ "$USE_TYPESCRIPT" == "true" ]]; then
    node "$PROJECT_ROOT/.claude/skills/cfn-agent-selection-with-fallback/dist/cli.cjs" \
      "$task_description" --min-validators 3 --format json
  else
    # Fallback to bash script
    "$PROJECT_ROOT/.claude/skills/cfn-agent-selection-with-fallback/select-agents.sh" \
      "$task_description"
  fi
}

call_ts_coordination_signal() {
  local task_id="$1"
  local channel="$2"
  local message="$3"

  if [[ "$USE_TYPESCRIPT" == "true" ]]; then
    # Use TypeScript coordination wrapper via Node CLI
    node -e "
      const { CoordinationWrapper } = require('$PROJECT_ROOT/dist/coordination/coordination-wrapper.js');

      (async () => {
        const coord = new CoordinationWrapper({
          taskId: '$task_id',
          redisHost: '$REDIS_HOST',
          redisPort: $REDIS_PORT
        });

        await coord.connect();
        await coord.signal('$channel', '$message');
        await coord.disconnect();
      })();
    "
  else
    # Fallback to bash script
    "$PROJECT_ROOT/.claude/skills/cfn-coordination/coordination-signal.sh" \
      --task-id "$task_id" \
      --channel "$channel" \
      --message "$message"
  fi
}

call_ts_coordination_wait() {
  local task_id="$1"
  local channel="$2"
  local timeout="$3"

  if [[ "$USE_TYPESCRIPT" == "true" ]]; then
    # Use TypeScript coordination wrapper via Node CLI
    node -e "
      const { CoordinationWrapper } = require('$PROJECT_ROOT/dist/coordination/coordination-wrapper.js');

      (async () => {
        const coord = new CoordinationWrapper({
          taskId: '$task_id',
          redisHost: '$REDIS_HOST',
          redisPort: $REDIS_PORT,
          defaultTimeout: $timeout
        });

        await coord.connect();
        const result = await coord.wait('$channel', $timeout);
        await coord.disconnect();

        console.log(JSON.stringify(result));
      })();
    "
  else
    # Fallback to bash script
    "$PROJECT_ROOT/.claude/skills/cfn-coordination/coordination-wait.sh" \
      --task-id "$task_id" \
      --channel "$channel" \
      --timeout "$timeout"
  fi
}

call_ts_validate_gate() {
  local pass_rate="$1"
  local mode="$2"

  if [[ "$USE_TYPESCRIPT" == "true" ]]; then
    # Use TypeScript gate checker
    node -e "
      const { gateCheck } = require('$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/dist/helpers/gate-check.js');

      const result = gateCheck({
        passRate: parseFloat('$pass_rate'),
        mode: '$mode'
      });

      console.log(JSON.stringify(result));
    "
  else
    # Fallback to bash script
    "$PROJECT_ROOT/.claude/skills/cfn-loop-validation/validate-gate.sh" \
      --pass-rate "$pass_rate" \
      --mode "$mode"
  fi
}

call_ts_detect_vapor() {
  local output_file="$1"
  shift
  local deliverables="$@"

  if [[ "$USE_TYPESCRIPT" == "true" ]]; then
    # Use TypeScript vapor detector
    node -e "
      const fs = require('fs');
      const output = fs.readFileSync('$output_file', 'utf8');

      // Simple vapor detection: check for actual deliverables
      const deliverableList = '$deliverables'.split(' ');
      let hasVapor = false;

      for (const deliverable of deliverableList) {
        if (!output.includes(deliverable)) {
          hasVapor = true;
          break;
        }
      }

      console.log(JSON.stringify({ hasVapor, deliverables: deliverableList }));
    "
  else
    # Fallback to bash script
    "$PROJECT_ROOT/.claude/skills/cfn-loop-validation/detect-vapor.sh" \
      --output "$output_file" \
      --deliverables "$deliverables"
  fi
}

call_ts_collect_consensus() {
  local task_id="$1"
  local mode="$2"

  if [[ "$USE_TYPESCRIPT" == "true" ]]; then
    # Use TypeScript consensus collector
    node -e "
      const { CoordinationWrapper } = require('$PROJECT_ROOT/dist/coordination/coordination-wrapper.js');
      const { validateConsensus } = require('$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/dist/helpers/consensus.js');

      (async () => {
        const coord = new CoordinationWrapper({
          taskId: '$task_id',
          redisHost: '$REDIS_HOST',
          redisPort: $REDIS_PORT
        });

        await coord.connect();
        const scores = await coord.getConsensusScores();
        await coord.disconnect();

        const validation = validateConsensus({
          average: scores.reduce((a,b) => a+b, 0) / scores.length,
          mode: '$mode'
        });

        console.log(JSON.stringify(validation));
      })();
    "
  else
    # Fallback to bash script
    "$PROJECT_ROOT/.claude/skills/cfn-coordination/collect-consensus.sh" \
      --task-id "$task_id" \
      --mode "$mode"
  fi
}

##############################################################################
# Argument Parsing
##############################################################################

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID=$(sanitize_input "$2") || { echo "Invalid task ID"; exit 1; }
      shift 2
      ;;
    --mode)
      MODE="$2"
      if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
        echo "Invalid mode. Must be mvp, standard, or enterprise." >&2
        exit 1
      fi
      shift 2
      ;;
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --loop3-agents)
      LOOP3_AGENTS=$(sanitize_input "$2" 512)
      shift 2
      ;;
    --loop2-agents)
      LOOP2_AGENTS=$(sanitize_input "$2" 512)
      shift 2
      ;;
    --product-owner)
      PRODUCT_OWNER=$(sanitize_input "$2")
      shift 2
      ;;
    --success-criteria)
      SUCCESS_CRITERIA="$2"
      shift 2
      ;;
    --task-description)
      TASK_DESCRIPTION="$2"
      shift 2
      ;;
    --use-typescript)
      USE_TYPESCRIPT="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown option: '$1'" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$TASK_ID" ]; then
  echo "Error: --task-id is required" >&2
  exit 1
fi

##############################################################################
# Mode-Specific Thresholds
##############################################################################

case "$MODE" in
  mvp)
    GATE_THRESHOLD=0.70
    CONSENSUS_THRESHOLD=0.80
    ;;
  standard)
    GATE_THRESHOLD=0.95
    CONSENSUS_THRESHOLD=0.90
    ;;
  enterprise)
    GATE_THRESHOLD=0.98
    CONSENSUS_THRESHOLD=0.95
    ;;
esac

echo "=== CFN Loop Orchestrator (Enhanced) ==="
echo "Task ID: $TASK_ID"
echo "Mode: $MODE (Gate: $GATE_THRESHOLD, Consensus: $CONSENSUS_THRESHOLD)"
echo "TypeScript: $USE_TYPESCRIPT"
echo "Max Iterations: $MAX_ITERATIONS"
echo ""

##############################################################################
# Main Orchestration Loop
##############################################################################

ITERATION=0
DECISION="ITERATE"

while [[ $ITERATION -lt $MAX_ITERATIONS && "$DECISION" == "ITERATE" ]]; do
  ITERATION=$((ITERATION + 1))
  echo "=== Iteration $ITERATION/$MAX_ITERATIONS ==="

  ##########################################################################
  # Phase 1: Agent Selection (if not provided)
  ##########################################################################

  if [[ -z "$LOOP3_AGENTS" && -n "$TASK_DESCRIPTION" ]]; then
    echo "Selecting agents for task..."
    AGENT_SELECTION=$(call_ts_select_agents "$TASK_DESCRIPTION")

    # Parse JSON response (assumes {"loop3": [...], "loop2": [...]})
    LOOP3_AGENTS=$(echo "$AGENT_SELECTION" | jq -r '.loop3 | join(" ")' 2>/dev/null || echo "backend-developer tester")
    LOOP2_AGENTS=$(echo "$AGENT_SELECTION" | jq -r '.loop2 | join(" ")' 2>/dev/null || echo "code-reviewer security-specialist")
  fi

  # Use defaults if still empty
  LOOP3_AGENTS="${LOOP3_AGENTS:-backend-developer tester}"
  LOOP2_AGENTS="${LOOP2_AGENTS:-code-reviewer security-specialist}"

  echo "Loop 3 Agents: $LOOP3_AGENTS"
  echo "Loop 2 Agents: $LOOP2_AGENTS"

  ##########################################################################
  # Phase 2: Loop 3 Execution (Implementers)
  ##########################################################################

  echo ""
  echo "--- Phase 2: Loop 3 Execution ---"

  LOOP3_PASS_RATES=()

  for agent in $LOOP3_AGENTS; do
    echo "Spawning Loop 3 agent: $agent (iteration $ITERATION)"

    # Spawn agent with TypeScript or bash
    AGENT_ID="${agent}-${ITERATION}-$$"
    call_ts_spawn_agent "$agent" "$TASK_ID" "$ITERATION" "$MODE" &

    # Store agent PID for monitoring
    AGENT_PIDS+=($!)
  done

  # Wait for all Loop 3 agents to complete
  echo "Waiting for Loop 3 agents to complete..."

  if [[ "$USE_TYPESCRIPT" == "true" ]]; then
    # Use TypeScript coordination wait
    WAIT_RESULT=$(call_ts_coordination_wait "$TASK_ID" "loop3-complete" 600000)
    echo "Loop 3 completion: $WAIT_RESULT"
  else
    # Wait for process completion
    for pid in "${AGENT_PIDS[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
  fi

  ##########################################################################
  # Phase 3: Gate Check (Test Pass Rate)
  ##########################################################################

  echo ""
  echo "--- Phase 3: Gate Check ---"

  # Collect test pass rates from agents
  TOTAL_PASS=0
  TOTAL_TESTS=0

  for agent in $LOOP3_AGENTS; do
    # Read agent test results (from Redis or file)
    if [[ "$USE_TYPESCRIPT" == "true" ]]; then
      AGENT_RESULT=$(node -e "
        const { CoordinationWrapper } = require('$PROJECT_ROOT/dist/coordination/coordination-wrapper.js');
        (async () => {
          const coord = new CoordinationWrapper({
            taskId: '$TASK_ID',
            redisHost: '$REDIS_HOST',
            redisPort: $REDIS_PORT
          });
          await coord.connect();
          const state = await coord.getAgentState('${agent}-${ITERATION}');
          await coord.disconnect();
          console.log(JSON.stringify(state || {}));
        })();
      ")

      PASS=$(echo "$AGENT_RESULT" | jq -r '.testsPassed // 0')
      TESTS=$(echo "$AGENT_RESULT" | jq -r '.testsRun // 0')
    else
      # Fallback: read from file
      PASS=0
      TESTS=0
    fi

    TOTAL_PASS=$((TOTAL_PASS + PASS))
    TOTAL_TESTS=$((TOTAL_TESTS + TESTS))
  done

  # Calculate pass rate
  if [[ $TOTAL_TESTS -gt 0 ]]; then
    PASS_RATE=$(echo "scale=4; $TOTAL_PASS / $TOTAL_TESTS" | bc)
  else
    PASS_RATE=0
  fi

  echo "Test Results: $TOTAL_PASS/$TOTAL_TESTS passed (rate: $PASS_RATE)"

  # Validate gate
  GATE_RESULT=$(call_ts_validate_gate "$PASS_RATE" "$MODE")
  GATE_PASSED=$(echo "$GATE_RESULT" | jq -r '.passed')

  echo "Gate Check: $GATE_PASSED (threshold: $GATE_THRESHOLD)"

  if [[ "$GATE_PASSED" != "true" ]]; then
    echo "Gate FAILED. Iterating Loop 3..."
    DECISION="ITERATE"
    continue
  fi

  # Signal Loop 2 to start
  echo "Gate PASSED. Signaling Loop 2..."
  call_ts_coordination_signal "$TASK_ID" "gate-passed" "true"

  ##########################################################################
  # Phase 4: Loop 2 Execution (Validators)
  ##########################################################################

  echo ""
  echo "--- Phase 4: Loop 2 Execution ---"

  AGENT_PIDS=()

  for validator in $LOOP2_AGENTS; do
    echo "Spawning Loop 2 validator: $validator (iteration $ITERATION)"

    VALIDATOR_ID="${validator}-${ITERATION}-$$"
    call_ts_spawn_agent "$validator" "$TASK_ID" "$ITERATION" "$MODE" &

    AGENT_PIDS+=($!)
  done

  # Wait for all Loop 2 validators
  echo "Waiting for Loop 2 validators to complete..."

  if [[ "$USE_TYPESCRIPT" == "true" ]]; then
    WAIT_RESULT=$(call_ts_coordination_wait "$TASK_ID" "loop2-complete" 600000)
    echo "Loop 2 completion: $WAIT_RESULT"
  else
    for pid in "${AGENT_PIDS[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
  fi

  ##########################################################################
  # Phase 5: Consensus Check
  ##########################################################################

  echo ""
  echo "--- Phase 5: Consensus Check ---"

  CONSENSUS_RESULT=$(call_ts_collect_consensus "$TASK_ID" "$MODE")
  CONSENSUS_PASSED=$(echo "$CONSENSUS_RESULT" | jq -r '.passed')
  CONSENSUS_AVG=$(echo "$CONSENSUS_RESULT" | jq -r '.average')

  echo "Consensus: $CONSENSUS_AVG (threshold: $CONSENSUS_THRESHOLD, passed: $CONSENSUS_PASSED)"

  ##########################################################################
  # Phase 6: Product Owner Decision
  ##########################################################################

  echo ""
  echo "--- Phase 6: Product Owner Decision ---"

  PRODUCT_OWNER="${PRODUCT_OWNER:-product-owner}"

  echo "Spawning Product Owner: $PRODUCT_OWNER"

  # Spawn Product Owner with TypeScript or bash
  PO_OUTPUT="/tmp/cfn-po-decision-${TASK_ID}-${ITERATION}.txt"
  call_ts_spawn_agent "$PRODUCT_OWNER" "$TASK_ID" "$ITERATION" "$MODE" > "$PO_OUTPUT"

  # Parse decision from output
  DECISION="ITERATE"

  if grep -qi "PROCEED" "$PO_OUTPUT"; then
    DECISION="PROCEED"
  elif grep -qi "ABORT" "$PO_OUTPUT"; then
    DECISION="ABORT"
  elif grep -qi "ITERATE" "$PO_OUTPUT"; then
    DECISION="ITERATE"
  fi

  echo "Product Owner Decision: $DECISION"

  if [[ "$DECISION" == "PROCEED" ]]; then
    echo ""
    echo "=== CFN Loop Complete (PROCEED) ==="
    exit 0
  elif [[ "$DECISION" == "ABORT" ]]; then
    echo ""
    echo "=== CFN Loop Aborted (ABORT) ==="
    exit 1
  fi

  # Continue to next iteration
  echo ""
done

# Max iterations reached
echo ""
echo "=== CFN Loop Complete (Max Iterations Reached) ==="
exit 0
