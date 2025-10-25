#!/usr/bin/env bash

##############################################################################
# List Active Swarms - Redis Coordination
#
# Queries Redis for all active swarm metadata to help track multiple
# concurrent CFN Loop sessions.
#
# Usage:
#   ./list-active-swarms.sh [--task-id <id>] [--mode <mode>] [--json]
##############################################################################

set -euo pipefail

# Configuration
TASK_ID_FILTER=""
MODE_FILTER=""
JSON_OUTPUT=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID_FILTER="$2"
      shift 2
      ;;
    --mode)
      MODE_FILTER="$2"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--task-id <id>] [--mode <mode>] [--json]"
      exit 1
      ;;
  esac
done

# Get all swarm metadata keys
SWARM_KEYS=$(redis-cli --scan --pattern "swarm:*:metadata" 2>/dev/null || echo "")

if [ -z "$SWARM_KEYS" ]; then
  if [ "$JSON_OUTPUT" = true ]; then
    echo '{"swarms": [], "count": 0}'
  else
    echo "No active swarms found"
  fi
  exit 0
fi

# Initialize JSON array
if [ "$JSON_OUTPUT" = true ]; then
  echo '{"swarms": ['
  FIRST=true
fi

# Process each swarm
while IFS= read -r KEY; do
  if [ -z "$KEY" ]; then
    continue
  fi

  # Extract swarm ID from key (swarm:swarm-<task-id>:metadata)
  SWARM_ID=$(echo "$KEY" | sed 's/swarm:\(.*\):metadata/\1/')

  # Get metadata
  TASK_ID=$(redis-cli hget "$KEY" task_id 2>/dev/null || echo "")
  MODE=$(redis-cli hget "$KEY" mode 2>/dev/null || echo "")
  MAX_AGENTS=$(redis-cli hget "$KEY" max_agents 2>/dev/null || echo "")
  LOOP3_AGENTS=$(redis-cli hget "$KEY" loop3_agents 2>/dev/null || echo "")
  LOOP2_AGENTS=$(redis-cli hget "$KEY" loop2_agents 2>/dev/null || echo "")
  PRODUCT_OWNER=$(redis-cli hget "$KEY" product_owner 2>/dev/null || echo "")
  CREATED_AT=$(redis-cli hget "$KEY" created_at 2>/dev/null || echo "")
  STATUS=$(redis-cli hget "$KEY" status 2>/dev/null || echo "in_progress")
  FINAL_CONSENSUS=$(redis-cli hget "$KEY" final_consensus 2>/dev/null || echo "")
  TOTAL_ITERATIONS=$(redis-cli hget "$KEY" total_iterations 2>/dev/null || echo "")
  COMPLETED_AT=$(redis-cli hget "$KEY" completed_at 2>/dev/null || echo "")

  # Apply filters
  if [ -n "$TASK_ID_FILTER" ] && [ "$TASK_ID" != "$TASK_ID_FILTER" ]; then
    continue
  fi

  if [ -n "$MODE_FILTER" ] && [ "$MODE" != "$MODE_FILTER" ]; then
    continue
  fi

  # Output
  if [ "$JSON_OUTPUT" = true ]; then
    if [ "$FIRST" = false ]; then
      echo ","
    fi
    FIRST=false

    cat <<EOF
  {
    "swarm_id": "$SWARM_ID",
    "task_id": "$TASK_ID",
    "mode": "$MODE",
    "status": "$STATUS",
    "max_agents": $MAX_AGENTS,
    "loop3_agents": "$LOOP3_AGENTS",
    "loop2_agents": "$LOOP2_AGENTS",
    "product_owner": "$PRODUCT_OWNER",
    "created_at": "$CREATED_AT",
    "final_consensus": "$FINAL_CONSENSUS",
    "total_iterations": "$TOTAL_ITERATIONS",
    "completed_at": "$COMPLETED_AT"
  }
EOF
  else
    echo "========================================="
    echo "Swarm ID: $SWARM_ID"
    echo "Task ID: $TASK_ID"
    echo "Mode: $MODE"
    echo "Status: $STATUS"
    echo "Agents: $MAX_AGENTS total"
    echo "  Loop 3: $LOOP3_AGENTS"
    echo "  Loop 2: $LOOP2_AGENTS"
    echo "  Product Owner: $PRODUCT_OWNER"
    echo "Created: $CREATED_AT"

    if [ -n "$COMPLETED_AT" ]; then
      echo "Completed: $COMPLETED_AT"
      echo "Final Consensus: $FINAL_CONSENSUS"
      echo "Total Iterations: $TOTAL_ITERATIONS"
    fi

    echo ""
  fi

done <<< "$SWARM_KEYS"

# Close JSON array
if [ "$JSON_OUTPUT" = true ]; then
  echo ""
  echo "],"

  # Count swarms
  COUNT=$(echo "$SWARM_KEYS" | wc -l)
  echo "\"count\": $COUNT"
  echo "}"
fi
