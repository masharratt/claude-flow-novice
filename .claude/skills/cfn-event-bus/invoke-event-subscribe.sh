#!/bin/bash
#
# Event Bus - Subscribe to Events CLI Wrapper
#
# Usage:
#   ./invoke-event-subscribe.sh --topic <topic> --callback <function> [--filter <jq-expr>]
#
# Examples:
#   # Basic subscription
#   ./invoke-event-subscribe.sh \
#     --topic "agent:completed" \
#     --callback "handle_agent_complete"
#
#   # Filtered subscription
#   ./invoke-event-subscribe.sh \
#     --topic "agent:completed" \
#     --filter 'select(.confidence >= 0.90)' \
#     --callback "handle_high_confidence"

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Parse arguments
TOPIC=""
CALLBACK=""
FILTER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --topic)
            TOPIC="$2"
            shift 2
            ;;
        --callback)
            CALLBACK="$2"
            shift 2
            ;;
        --filter)
            FILTER="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$TOPIC" ] || [ -z "$CALLBACK" ]; then
    echo "Error: --topic and --callback are required"
    echo ""
    echo "Usage: $0 --topic <topic> --callback <function> [--filter <jq-expr>]"
    echo ""
    echo "Examples:"
    echo "  $0 --topic agent:completed --callback handle_agent_complete"
    echo "  $0 --topic agent:completed --filter 'select(.confidence >= 0.90)' --callback handle_high"
    exit 1
fi

# Validate callback function exists
if ! declare -f "$CALLBACK" >/dev/null 2>&1; then
    echo "Warning: Callback function '$CALLBACK' is not defined in current shell"
    echo "Ensure the function is defined before events are received"
fi

# Generate subscription ID
SUB_ID="sub-$(date +%s)-$(printf '%04d' $RANDOM)"

# Create subscription handler script
HANDLER_SCRIPT=$(mktemp)
trap "rm -f $HANDLER_SCRIPT" EXIT

cat > "$HANDLER_SCRIPT" <<'EOF'
const path = require('path');
const { eventBus } = require(path.join(process.env.PROJECT_ROOT, '.claude', 'core', 'event-bus.js'));
const { spawn } = require('child_process');

const topic = process.env.TOPIC;
const callback = process.env.CALLBACK;
const filter = process.env.FILTER || '';
const subId = process.env.SUB_ID;

// Define event handler
const handler = (data) => {
    let eventData = data;

    // Apply filter if provided
    if (filter) {
        try {
            const filterProc = spawn('jq', ['-e', filter], {
                stdio: ['pipe', 'pipe', 'inherit']
            });

            filterProc.stdin.write(JSON.stringify(data));
            filterProc.stdin.end();

            filterProc.on('exit', (code) => {
                if (code === 0) {
                    // Filter passed, invoke callback
                    invokeCallback(data);
                }
            });
        } catch (error) {
            console.error(`[EventBus] Filter error for ${topic}:`, error.message);
        }
    } else {
        // No filter, invoke callback directly
        invokeCallback(data);
    }
};

// Invoke bash callback function
function invokeCallback(data) {
    const proc = spawn('bash', ['-c', `${callback} '${JSON.stringify(data)}'`], {
        stdio: 'inherit',
        env: { ...process.env, EVENT_DATA: JSON.stringify(data) }
    });

    proc.on('error', (error) => {
        console.error(`[EventBus] Callback error for ${callback}:`, error.message);
    });
}

// Register event listener
eventBus.on(topic, handler);

console.log(JSON.stringify({
    status: 'subscribed',
    subscriptionId: subId,
    topic: topic,
    callback: callback,
    filter: filter || null,
    timestamp: Date.now()
}));

// Keep process alive
console.error(`[EventBus] Listening for events on topic: ${topic}`);
console.error(`[EventBus] Subscription ID: ${subId}`);
console.error('[EventBus] Press Ctrl+C to unsubscribe');

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.error('\n[EventBus] Unsubscribing...');
    eventBus.off(topic, handler);
    console.log(JSON.stringify({
        status: 'unsubscribed',
        subscriptionId: subId,
        topic: topic
    }));
    process.exit(0);
});
EOF

# Execute subscription handler
export PROJECT_ROOT
export TOPIC
export CALLBACK
export FILTER
export SUB_ID

if [ "${EVENTBUS_DEBUG:-false}" == "true" ]; then
    echo "[EventBus] Creating subscription: $TOPIC -> $CALLBACK" >&2
    [ -n "$FILTER" ] && echo "[EventBus] Filter: $FILTER" >&2
fi

# Run handler (blocks until Ctrl+C)
node "$HANDLER_SCRIPT"
