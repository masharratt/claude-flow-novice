#!/usr/bin/env bash
#
# Event Bus - Agent Lifecycle Tracking CLI Wrapper
#
# Usage:
#   ./invoke-lifecycle-track.sh --agent-id <id> --event <type> --metadata <json>
#
# Event Types:
#   - spawn: Agent created and initialized
#   - complete: Agent successfully finished task
#   - fail: Agent encountered critical error
#   - timeout: Agent exceeded execution time limit
#
# Examples:
#   # Track agent spawn
#   ./invoke-lifecycle-track.sh \
#     --agent-id "backend-dev-1" \
#     --event "spawn" \
#     --metadata '{"taskId": "auth-system", "role": "backend-developer"}'
#
#   # Track agent completion
#   ./invoke-lifecycle-track.sh \
#     --agent-id "backend-dev-1" \
#     --event "complete" \
#     --metadata '{"taskId": "auth-system", "confidence": 0.92, "duration": 45000}'
#
#   # Track agent failure
#   ./invoke-lifecycle-track.sh \
#     --agent-id "backend-dev-1" \
#     --event "fail" \
#     --metadata '{"taskId": "auth-system", "error": "TypeScript compilation failed"}'
#
#   # Track agent timeout
#   ./invoke-lifecycle-track.sh \
#     --agent-id "backend-dev-1" \
#     --event "timeout" \
#     --metadata '{"taskId": "auth-system", "timeLimit": 300000, "elapsed": 305000}'

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
EVENTBUS_WRAPPER="$SCRIPT_DIR/eventbus-wrapper.cjs"

# Parse arguments
AGENT_ID=""
EVENT_TYPE=""
METADATA=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --event)
            EVENT_TYPE="$2"
            shift 2
            ;;
        --metadata)
            METADATA="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$AGENT_ID" ] || [ -z "$EVENT_TYPE" ] || [ -z "$METADATA" ]; then
    echo "Error: --agent-id, --event, and --metadata are required"
    echo ""
    echo "Usage: $0 --agent-id <id> --event <type> --metadata <json>"
    echo ""
    echo "Event Types: spawn, complete, fail, timeout"
    echo ""
    echo "Examples:"
    echo "  $0 --agent-id backend-dev-1 --event spawn --metadata '{\"taskId\": \"auth\"}'"
    echo "  $0 --agent-id backend-dev-1 --event complete --metadata '{\"confidence\": 0.92}'"
    exit 1
fi

# Validate event type
VALID_EVENTS=("spawn" "complete" "fail" "timeout")
if [[ ! " ${VALID_EVENTS[@]} " =~ " ${EVENT_TYPE} " ]]; then
    echo "Error: Invalid event type '$EVENT_TYPE'"
    echo "Valid types: ${VALID_EVENTS[*]}"
    exit 1
fi

# Validate JSON metadata
if ! echo "$METADATA" | jq empty 2>/dev/null; then
    echo "Error: Invalid JSON metadata"
    exit 1
fi

# Build lifecycle event
TIMESTAMP=$(date +%s)
TRACKING_ID="track-$(date +%s)-$(printf '%04d' $RANDOM)"

LIFECYCLE_EVENT=$(jq -n \
    --arg trackingId "$TRACKING_ID" \
    --arg eventType "lifecycle" \
    --arg stage "$EVENT_TYPE" \
    --arg agentId "$AGENT_ID" \
    --argjson metadata "$METADATA" \
    --arg timestamp "$TIMESTAMP" \
    '{
        trackingId: $trackingId,
        eventType: $eventType,
        stage: $stage,
        agentId: $agentId,
        timestamp: ($timestamp | tonumber),
        recordedAt: (now | todate),
        metadata: $metadata
    }')

# Determine event topic based on lifecycle stage
case "$EVENT_TYPE" in
    spawn)
        TOPIC="agent:spawned"
        ;;
    complete)
        TOPIC="agent:completed"
        ;;
    fail)
        TOPIC="agent:failed"
        ;;
    timeout)
        TOPIC="agent:timeout"
        ;;
esac

# Publish lifecycle event
# Create temp script to avoid heredoc issues
TEMP_SCRIPT=$(mktemp)
trap "rm -f $TEMP_SCRIPT" EXIT

cat > "$TEMP_SCRIPT" << 'EOF'
const { eventBus } = require(process.env.EVENTBUS_WRAPPER);

const lifecycleEvent = JSON.parse(process.env.LIFECYCLE_EVENT);
const topic = process.env.TOPIC;

try {
    // Emit lifecycle event
    eventBus.emitEvent(topic, lifecycleEvent);

    // Also emit generic lifecycle event
    eventBus.emitEvent('lifecycle', lifecycleEvent);

    // Return success result
    console.log(JSON.stringify({
        status: 'tracked',
        trackingId: lifecycleEvent.trackingId,
        agentId: lifecycleEvent.agentId,
        event: lifecycleEvent.stage,
        topic: topic,
        timestamp: lifecycleEvent.timestamp
    }));
} catch (error) {
    console.error(JSON.stringify({
        status: 'error',
        error: error.message,
        agentId: lifecycleEvent.agentId,
        event: lifecycleEvent.stage
    }));
    process.exit(1);
}
EOF

export LIFECYCLE_EVENT
export PROJECT_ROOT
export EVENTBUS_WRAPPER
export TOPIC
RESULT=$(node "$TEMP_SCRIPT")

# Output result
echo "$RESULT" | jq '.'

# Log successful tracking
if [ "${EVENTBUS_DEBUG:-false}" == "true" ]; then
    echo "[EventBus] Lifecycle tracked: $AGENT_ID -> $EVENT_TYPE (ID: $TRACKING_ID)" >&2
    echo "[EventBus] Published to topics: $TOPIC, lifecycle" >&2
fi

# Optional: Store lifecycle event in Redis for persistence
if [ "${EVENTBUS_PERSIST:-false}" == "true" ]; then
    LIFECYCLE_KEY="lifecycle:${AGENT_ID}"
    echo "$LIFECYCLE_EVENT" | redis-cli -x LPUSH "$LIFECYCLE_KEY" >/dev/null
    redis-cli EXPIRE "$LIFECYCLE_KEY" 86400 >/dev/null  # 24-hour TTL

    if [ "${EVENTBUS_DEBUG:-false}" == "true" ]; then
        echo "[EventBus] Persisted to Redis: $LIFECYCLE_KEY" >&2
    fi
fi

# Return tracking ID for reference
echo "$RESULT" | jq -r '.trackingId'
