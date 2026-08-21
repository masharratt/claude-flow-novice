#!/usr/bin/env bash
#
# Event Bus - Publish Event CLI Wrapper
#
# Usage:
#   ./invoke-event-publish.sh --topic <topic> --payload <json> [--trace-id <id>]
#
# Examples:
#   # Basic event publishing
#   ./invoke-event-publish.sh \
#     --topic "task:completed" \
#     --payload '{"taskId": "auth", "agentId": "backend-dev-1", "confidence": 0.92}'
#
#   # Publishing with trace ID
#   ./invoke-event-publish.sh \
#     --topic "validation:passed" \
#     --payload '{"validator": "security-agent", "checks": ["auth"]}' \
#     --trace-id "trace-123-abc"

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
EVENTBUS_WRAPPER="$SCRIPT_DIR/eventbus-wrapper.cjs"

# Parse arguments
TOPIC=""
PAYLOAD=""
TRACE_ID=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --topic)
            TOPIC="$2"
            shift 2
            ;;
        --payload)
            PAYLOAD="$2"
            shift 2
            ;;
        --trace-id)
            TRACE_ID="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$TOPIC" ] || [ -z "$PAYLOAD" ]; then
    echo "Error: --topic and --payload are required"
    echo ""
    echo "Usage: $0 --topic <topic> --payload <json> [--trace-id <id>]"
    echo ""
    echo "Examples:"
    echo "  $0 --topic task:completed --payload '{\"taskId\": \"auth\"}'"
    echo "  $0 --topic validation:passed --payload '{...}' --trace-id trace-123"
    exit 1
fi

# Validate JSON payload
if ! echo "$PAYLOAD" | jq empty 2>/dev/null; then
    echo "Error: Invalid JSON payload"
    exit 1
fi

# Build event object
EVENT_ID="evt-$(date +%s)-$(printf '%04d' $RANDOM)"
TIMESTAMP=$(date +%s)

EVENT_DATA=$(jq -n \
    --arg eventId "$EVENT_ID" \
    --arg topic "$TOPIC" \
    --argjson payload "$PAYLOAD" \
    --arg traceId "$TRACE_ID" \
    --arg timestamp "$TIMESTAMP" \
    '{
        eventId: $eventId,
        topic: $topic,
        payload: $payload,
        traceId: (if $traceId == "" then null else $traceId end),
        timestamp: ($timestamp | tonumber),
        publishedAt: (now | todate)
    }' 2>&1)

# Debug output
if [ "${EVENTBUS_DEBUG:-false}" == "true" ]; then
    echo "[DEBUG] EVENT_DATA: $EVENT_DATA" >&2
fi

# Check if EVENT_DATA is empty
if [ -z "$EVENT_DATA" ]; then
    echo "Error: Failed to generate event data"
    exit 1
fi

# Publish event via Node.js event bus
# Create temp script to avoid heredoc issues
TEMP_SCRIPT=$(mktemp)
trap "rm -f $TEMP_SCRIPT" EXIT

cat > "$TEMP_SCRIPT" << 'EOF'
const { eventBus } = require(process.env.EVENTBUS_WRAPPER);

const eventData = JSON.parse(process.env.EVENT_DATA);

try {
    // Emit the event
    eventBus.emitEvent(eventData.topic, eventData.payload);

    // Return success result
    console.log(JSON.stringify({
        status: 'published',
        eventId: eventData.eventId,
        topic: eventData.topic,
        timestamp: eventData.timestamp,
        traceId: eventData.traceId || null
    }));
} catch (error) {
    console.error(JSON.stringify({
        status: 'error',
        error: error.message,
        topic: eventData.topic
    }));
    process.exit(1);
}
EOF

export EVENT_DATA
export PROJECT_ROOT
export EVENTBUS_WRAPPER
RESULT=$(node "$TEMP_SCRIPT")

# Output result
echo "$RESULT" | jq '.'

# Log successful publish
if [ "${EVENTBUS_DEBUG:-false}" == "true" ]; then
    echo "[EventBus] Published event: $TOPIC (ID: $EVENT_ID)" >&2
    [ -n "$TRACE_ID" ] && echo "[EventBus] Trace ID: $TRACE_ID" >&2
fi

# Return event ID for chaining
echo "$RESULT" | jq -r '.eventId'
