#!/usr/bin/env bash

##############################################################################
# Query Dead Letter Queue (DLQ)
# Retrieves and displays failed agent signals from DLQ
#
# Usage:
#   ./query-dlq.sh --task-id <id> [--agent-id <id>]
#
# Examples:
#   # List all DLQ entries for a task
#   ./query-dlq.sh --task-id redis-phase1-1760875302
#
#   # List DLQ entries for specific agent
#   ./query-dlq.sh --task-id redis-phase1-1760875302 --agent-id backend-dev-2
##############################################################################

set -euo pipefail

# Configuration
TASK_ID=""
AGENT_ID=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --agent-id)
      AGENT_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$TASK_ID" ]; then
  echo "Error: --task-id is required"
  echo "Usage: $0 --task-id <id> [--agent-id <id>]"
  exit 1
fi

##############################################################################
# Query DLQ Entries
##############################################################################

if [ -n "$AGENT_ID" ]; then
  # Query specific agent's DLQ
  DLQ_KEY="swarm:${TASK_ID}:dlq:${AGENT_ID}"

  echo "=== DLQ Entries for Agent: $AGENT_ID ==="
  echo "Task ID: $TASK_ID"
  echo ""

  # Check if DLQ exists
  EXISTS=$(redis-cli EXISTS "$DLQ_KEY")

  if [ "$EXISTS" = "0" ]; then
    echo "No DLQ entries found for agent: $AGENT_ID"
    exit 0
  fi

  # Get entry count
  ENTRY_COUNT=$(redis-cli LLEN "$DLQ_KEY")

  if [ "$ENTRY_COUNT" = "0" ]; then
    echo "No DLQ entries found for agent: $AGENT_ID"
    exit 0
  fi

  # Parse and display entries
  for i in $(seq 0 $((ENTRY_COUNT - 1))); do
    ENTRY=$(redis-cli LINDEX "$DLQ_KEY" "$i")

    if [ -n "$ENTRY" ]; then
      REASON=$(echo "$ENTRY" | jq -r '.reason')
      RETRIES=$(echo "$ENTRY" | jq -r '.retry_count')
      TIMESTAMP=$(echo "$ENTRY" | jq -r '.timestamp')
      HUMAN_TIME=$(date -d "@$TIMESTAMP" -u +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || date -r "$TIMESTAMP" -u +"%Y-%m-%d %H:%M:%S UTC")

      echo "Entry #$((i + 1)):"
      echo "  Agent: $AGENT_ID"
      echo "  Reason: $REASON"
      echo "  Retries: $RETRIES"
      echo "  Timestamp: $HUMAN_TIME ($TIMESTAMP)"
      echo ""
    fi
  done

else
  # Query all agents' DLQs for this task
  echo "=== DLQ Entries for Task: $TASK_ID ==="
  echo ""

  # Find all DLQ keys for this task
  DLQ_PATTERN="swarm:${TASK_ID}:dlq:*"
  DLQ_KEYS=$(redis-cli KEYS "$DLQ_PATTERN")

  if [ -z "$DLQ_KEYS" ]; then
    echo "No DLQ entries found for task: $TASK_ID"
    exit 0
  fi

  # Process each DLQ key
  echo "$DLQ_KEYS" | while IFS= read -r DLQ_KEY; do
    if [ -n "$DLQ_KEY" ]; then
      # Extract agent ID from key (format: swarm:task-id:dlq:agent-id)
      AGENT=$(echo "$DLQ_KEY" | awk -F':' '{print $NF}')

      # Get entry count for this agent
      ENTRY_COUNT=$(redis-cli LLEN "$DLQ_KEY")

      if [ "$ENTRY_COUNT" -gt 0 ]; then
        for i in $(seq 0 $((ENTRY_COUNT - 1))); do
          ENTRY=$(redis-cli LINDEX "$DLQ_KEY" "$i")

          if [ -n "$ENTRY" ]; then
            REASON=$(echo "$ENTRY" | jq -r '.reason')
            RETRIES=$(echo "$ENTRY" | jq -r '.retry_count')
            TIMESTAMP=$(echo "$ENTRY" | jq -r '.timestamp')
            HUMAN_TIME=$(date -d "@$TIMESTAMP" -u +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || date -r "$TIMESTAMP" -u +"%Y-%m-%d %H:%M:%S UTC")

            echo "Agent: $AGENT (Entry #$((i + 1))/$ENTRY_COUNT)"
            echo "  Reason: $REASON"
            echo "  Retries: $RETRIES"
            echo "  Timestamp: $HUMAN_TIME ($TIMESTAMP)"
            echo ""
          fi
        done
      fi
    fi
  done
fi

# Display summary
echo "=== Summary ==="
if [ -n "$AGENT_ID" ]; then
  DLQ_KEY="swarm:${TASK_ID}:dlq:${AGENT_ID}"
  TOTAL=$(redis-cli LLEN "$DLQ_KEY")
  echo "Total DLQ entries for $AGENT_ID: $TOTAL"
else
  DLQ_PATTERN="swarm:${TASK_ID}:dlq:*"
  TOTAL_KEYS=$(redis-cli KEYS "$DLQ_PATTERN" | wc -l)
  echo "Total agents with DLQ entries: $TOTAL_KEYS"
fi

# Check TTL
if [ -n "$AGENT_ID" ]; then
  DLQ_KEY="swarm:${TASK_ID}:dlq:${AGENT_ID}"
  TTL=$(redis-cli TTL "$DLQ_KEY")
  if [ "$TTL" -gt 0 ]; then
    DAYS=$((TTL / 86400))
    HOURS=$(((TTL % 86400) / 3600))
    echo "TTL remaining: ${DAYS}d ${HOURS}h"
  fi
fi
