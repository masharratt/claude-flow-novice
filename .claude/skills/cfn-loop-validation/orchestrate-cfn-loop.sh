#!/usr/bin/env bash

##############################################################################
# CFN Loop Orchestration v1.0.0
# Manages multi-loop CFN execution with dependency tracking and consensus
#
# Usage:
#   ./orchestrate-cfn-loop.sh --task-id <id> \
#                             --mode <mvp|standard|enterprise> \
#                             --loop3-agents <agent1,agent2,...> \
#                             --loop2-agents <agent1,agent2,...> \
#                             --product-owner <agent-id> \
#                             [--max-iterations <n>]
#
# CFN Loop Structure:
#   Loop 3 (Primary Swarm) → Loop 2 (Consensus) → Product Owner Decision
#
# Dependency Enforcement:
#   - Loop 2 agents BLOCK until all Loop 3 agents signal completion
#   - Product Owner BLOCKS until all Loop 2 agents signal completion
#   - Uses Redis BLPOP for zero-token waiting
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

echo "=== CFN Loop Orchestration ==="
echo "Task ID: $TASK_ID"
echo "Mode: $MODE (Gate: $GATE, Consensus: $CONSENSUS)"
echo "Max Iterations: $MAX_ITERATIONS"
echo ""

# Iteration loop
for ITERATION in $(seq 1 $MAX_ITERATIONS); do
  echo "=== Iteration $ITERATION/$MAX_ITERATIONS ==="

  # Step 1: Wait for Loop 3 agents to complete
  echo "[Loop 3] Waiting for implementers to complete..."
  IFS=',' read -ra AGENTS <<< "$LOOP3_AGENTS"

  for AGENT in "${AGENTS[@]}"; do
    DONE_KEY="swarm:${TASK_ID}:${AGENT}:done"
    echo "  Waiting for $AGENT..."

    # BLPOP with timeout (blocks until agent signals done)
    RESULT=$(timeout $TIMEOUT redis-cli blpop "$DONE_KEY" 0 2>/dev/null || echo "")

    if [ -z "$RESULT" ]; then
      echo "  ❌ ERROR: $AGENT timeout after ${TIMEOUT}s"
      exit 1
    fi

    echo "  ✅ $AGENT complete"
  done

  echo "[Loop 3] All implementers complete!"
  echo ""

  # Step 2: Collect Loop 3 confidence scores
  echo "[Loop 3] Collecting confidence scores..."
  LOOP3_CONSENSUS=$(./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
    --task-id "$TASK_ID" \
    --agent-ids "$LOOP3_AGENTS" | tail -1)

  echo "[Loop 3] Average confidence: $LOOP3_CONSENSUS"

  # Gate check
  if (( $(echo "$LOOP3_CONSENSUS < $GATE" | bc -l) )); then
    echo "❌ Gate FAILED ($LOOP3_CONSENSUS < $GATE)"
    echo "Decision: RELAUNCH iteration $((ITERATION + 1))"

    # Wake Loop 3 agents for next iteration
    IFS=',' read -ra AGENTS <<< "$LOOP3_AGENTS"
    for AGENT in "${AGENTS[@]}"; do
      ./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
        --task-id "$TASK_ID" \
        --agent-id "$AGENT" \
        --reason "gate_failed" \
        --iteration $((ITERATION + 1)) \
        --feedback "Improve confidence from $LOOP3_CONSENSUS to >$GATE"
    done

    continue  # Next iteration
  fi

  echo "✅ Gate PASSED ($LOOP3_CONSENSUS >= $GATE)"
  echo ""

  # Step 3: Wait for Loop 2 validators to complete
  echo "[Loop 2] Waiting for validators to complete..."
  IFS=',' read -ra VALIDATORS <<< "$LOOP2_AGENTS"

  for VALIDATOR in "${VALIDATORS[@]}"; do
    DONE_KEY="swarm:${TASK_ID}:${VALIDATOR}:done"
    echo "  Waiting for $VALIDATOR..."

    RESULT=$(timeout $TIMEOUT redis-cli blpop "$DONE_KEY" 0 2>/dev/null || echo "")

    if [ -z "$RESULT" ]; then
      echo "  ❌ ERROR: $VALIDATOR timeout after ${TIMEOUT}s"
      exit 1
    fi

    echo "  ✅ $VALIDATOR complete"
  done

  echo "[Loop 2] All validators complete!"
  echo ""

  # Step 4: Collect Loop 2 consensus scores
  echo "[Loop 2] Collecting consensus scores..."
  LOOP2_CONSENSUS=$(./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
    --task-id "$TASK_ID" \
    --agent-ids "$LOOP2_AGENTS" | tail -1)

  echo "[Loop 2] Average consensus: $LOOP2_CONSENSUS"

  # Consensus check
  if (( $(echo "$LOOP2_CONSENSUS >= $CONSENSUS" | bc -l) )); then
    echo "✅ CONSENSUS REACHED ($LOOP2_CONSENSUS >= $CONSENSUS)"
    echo ""

    # Signal Product Owner that consensus is ready
    DECISION_KEY="swarm:${TASK_ID}:${PRODUCT_OWNER}:consensus-ready"
    redis-cli lpush "$DECISION_KEY" "{\"iteration\": $ITERATION, \"consensus\": $LOOP2_CONSENSUS}" > /dev/null

    # Wait for Product Owner decision
    echo "[Product Owner] Waiting for GOAP decision..."
    DECISION_KEY="swarm:${TASK_ID}:${PRODUCT_OWNER}:decision"
    DECISION=$(timeout $TIMEOUT redis-cli blpop "$DECISION_KEY" 0 2>/dev/null | tail -1)

    if [ -z "$DECISION" ]; then
      echo "❌ ERROR: Product Owner timeout"
      exit 1
    fi

    DECISION_TYPE=$(echo "$DECISION" | jq -r '.decision')

    echo "[Product Owner] Decision: $DECISION_TYPE"

    if [ "$DECISION_TYPE" = "PROCEED" ]; then
      echo ""
      echo "🎉 CFN Loop Complete!"
      echo "Final Consensus: $LOOP2_CONSENSUS (Iteration $ITERATION)"

      # Wake all agents with completion signal
      IFS=',' read -ra ALL_AGENTS <<< "$LOOP3_AGENTS,$LOOP2_AGENTS"
      for AGENT in "${ALL_AGENTS[@]}"; do
        ./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
          --task-id "$TASK_ID" \
          --agent-id "$AGENT" \
          --reason "cfn_complete" \
          --iteration "$ITERATION"
      done

      exit 0
    fi

  else
    echo "⚠️ CONSENSUS NOT REACHED ($LOOP2_CONSENSUS < $CONSENSUS)"
    echo "Decision: RELAUNCH iteration $((ITERATION + 1))"
    echo ""
  fi

  # Relaunch next iteration
  if [ $ITERATION -eq $MAX_ITERATIONS ]; then
    echo "❌ Maximum iterations ($MAX_ITERATIONS) reached without consensus"
    exit 1
  fi

  # Wake all agents for next iteration
  echo "[Coordinator] Waking agents for iteration $((ITERATION + 1))..."
  IFS=',' read -ra ALL_AGENTS <<< "$LOOP3_AGENTS,$LOOP2_AGENTS"
  for AGENT in "${ALL_AGENTS[@]}"; do
    ./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
      --task-id "$TASK_ID" \
      --agent-id "$AGENT" \
      --reason "cfn_loop_iteration" \
      --iteration $((ITERATION + 1)) \
      --feedback "Improve consensus from $LOOP2_CONSENSUS to >=$CONSENSUS"
  done

  echo ""
done

echo "❌ CFN Loop failed after $MAX_ITERATIONS iterations"
exit 1
