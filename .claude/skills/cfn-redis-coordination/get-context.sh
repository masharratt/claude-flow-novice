#!/bin/bash
# Retrieve CFN Loop task context from Redis
# Used by CLI-spawned agents to get structured context from orchestrator
#
# Usage:
#   get-context.sh --task-id <id> [--namespace <ns>]
#   get-context.sh --task-id <id> --key <key> [--namespace <ns>]
#   get-context.sh <task_id> (legacy mode)

set -euo pipefail

# Initialize variables
TASK_ID=""
KEY=""
NAMESPACE="swarm"
FORMAT="json"  # json or raw

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
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    *)
      # Legacy mode: positional argument
      if [ -z "$TASK_ID" ]; then
        TASK_ID="$1"
      fi
      shift
      ;;
  esac
done

# Validate required arguments
if [ -z "$TASK_ID" ]; then
    echo "Error: --task-id or TASK_ID required" >&2
    echo "Usage: $0 --task-id <id> [--key <key>] [--namespace <ns>] [--format <json|raw>]" >&2
    echo "   or: $0 <task_id> (legacy)" >&2
    exit 1
fi

REDIS_KEY="${NAMESPACE}:${TASK_ID}:context"

# Check if context exists
if ! redis-cli EXISTS "$REDIS_KEY" >/dev/null 2>&1; then
    echo "⚠️  No context found for task: $TASK_ID" >&2
    exit 1
fi

# Handle specific key retrieval
if [ -n "$KEY" ]; then
  VALUE=$(redis-cli HGET "$REDIS_KEY" "$KEY" 2>/dev/null || echo "")
  if [ -z "$VALUE" ]; then
    echo "⚠️  Key '$KEY' not found in context for task: $TASK_ID" >&2
    exit 1
  fi

  if [ "$FORMAT" = "raw" ]; then
    echo "$VALUE"
  else
    echo "{\"$KEY\":$VALUE}"
  fi
  exit 0
fi

# Handle full context retrieval
ALL_FIELDS=$(redis-cli HGETALL "$REDIS_KEY" 2>/dev/null || echo "")

if [ -z "$ALL_FIELDS" ]; then
    echo "⚠️  Empty context for task: $TASK_ID" >&2
    exit 1
fi

# Format as JSON
if [ "$FORMAT" = "json" ]; then
  echo "{"
  first=true
  while IFS= read -r field; do
    if [ -z "$field" ]; then continue; fi
    if [ "$first" = true ]; then
      first=false
    else
      echo ","
    fi
    # Skip empty lines and properly format JSON values
    if [[ $field =~ ^[0-9]+$ ]]; then
      # Numeric value
      echo -n "  \"$field\": $(redis-cli HGET "$REDIS_KEY" "$field")"
    else
      # String value
      value=$(redis-cli HGET "$REDIS_KEY" "$field" | sed 's/"/\\"/g')
      echo -n "  \"$field\": \"$value\""
    fi
  done <<< "$ALL_FIELDS"
  echo ""
  echo "}"
else
  # Raw format
  redis-cli HGETALL "$REDIS_KEY"
fi