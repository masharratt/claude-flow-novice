#!/bin/bash
# Store CFN Loop task context in Redis
# Used by orchestrator to pass context to CLI-spawned agents
#
# Usage: store-context.sh <task_id> <context_json>

set -euo pipefail

TASK_ID="${1:-}"
CONTEXT="${2:-}"

if [ -z "$TASK_ID" ]; then
    echo "Error: TASK_ID required" >&2
    echo "Usage: $0 <task_id> <context_json>" >&2
    exit 1
fi

if [ -z "$CONTEXT" ]; then
    echo "Error: CONTEXT required" >&2
    echo "Usage: $0 <task_id> <context_json>" >&2
    exit 1
fi

# Store context in Redis
redis-cli HSET "cfn_loop:task:${TASK_ID}:context" \
    "task_description" "$CONTEXT" \
    "stored_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    > /dev/null

# Set TTL (24 hours)
redis-cli EXPIRE "cfn_loop:task:${TASK_ID}:context" 86400 > /dev/null

echo "✅ Context stored for task: $TASK_ID"
exit 0
