#!/bin/bash
# Store CFN Loop task context in Redis
# Used by orchestrator to pass structured context to CLI-spawned agents
#
# Usage:
#   store-context.sh --task-id <id> --key <key> --value <value> [--namespace <ns>]
#   store-context.sh <task_id> <context_json> (legacy mode)

set -euo pipefail

# Initialize variables
TASK_ID=""
KEY=""
VALUE=""
NAMESPACE="swarm"
CONTEXT=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --key)
      KEY="$2"
      shift 2
      ;;
    --value)
      VALUE="$2"
      shift 2
      ;;
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    *)
      # Legacy mode: positional arguments
      if [ -z "$TASK_ID" ]; then
        TASK_ID="$1"
      elif [ -z "$CONTEXT" ]; then
        CONTEXT="$1"
      fi
      shift
      ;;
  esac
done

# Validate required arguments
if [ -z "$TASK_ID" ]; then
    echo "Error: --task-id or TASK_ID required" >&2
    echo "Usage: $0 --task-id <id> --key <key> --value <value> [--namespace <ns>]" >&2
    echo "   or: $0 <task_id> <context_json> (legacy)" >&2
    exit 1
fi

# Handle structured mode (new)
if [ -n "$KEY" ] && [ -n "$VALUE" ]; then
  # Store structured context with specific key
  REDIS_KEY="${NAMESPACE}:${TASK_ID}:context"

  redis-cli HSET "$REDIS_KEY" \
      "$KEY" "$VALUE" \
      "updated_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      > /dev/null

  # Set TTL (24 hours)
  redis-cli EXPIRE "$REDIS_KEY" 86400 > /dev/null

  echo "✅ Context stored: $KEY for task: $TASK_ID"
  exit 0
fi

# Handle legacy mode
if [ -n "$CONTEXT" ]; then
  redis-cli HSET "swarm:${TASK_ID}:context" \
      "task_description" "$CONTEXT" \
      "stored_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      > /dev/null

  # Set TTL (24 hours)
  redis-cli EXPIRE "swarm:${TASK_ID}:context" 86400 > /dev/null

  echo "✅ Context stored for task: $TASK_ID"
  exit 0
fi

echo "Error: Either --key/--value or <context_json> required" >&2
exit 1
