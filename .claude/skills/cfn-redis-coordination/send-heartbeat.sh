#!/bin/bash
# Redis Coordination Skill - Agent Heartbeat Sender
# Version: 2.0.0
# Last Updated: 2025-10-20
#
# Usage:
#   # One-shot heartbeat (original behavior)
#   ./send-heartbeat.sh --task-id <id> --agent-id <id>
#
#   # Start continuous heartbeat loop
#   ./send-heartbeat.sh start --task-id <id> --agent-id <id> --interval 30 &
#   HEARTBEAT_PID=$!
#
#   # Stop heartbeat loop
#   ./send-heartbeat.sh stop --task-id <id> --agent-id <id> --pid $HEARTBEAT_PID

# Strict error handling
set -euo pipefail

# Default values
ACTION=""
TASK_ID=""
AGENT_ID=""
STATUS="active"
TTL=60
INTERVAL=30  # For continuous mode
HEARTBEAT_PID=""
DETAILS='{}'

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        start|stop|once)
            ACTION="$1"
            shift
            ;;
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --status)
            STATUS="$2"
            shift 2
            ;;
        --ttl)
            TTL="$2"
            shift 2
            ;;
        --interval)
            INTERVAL="$2"
            shift 2
            ;;
        --pid)
            HEARTBEAT_PID="$2"
            shift 2
            ;;
        --details)
            DETAILS="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$TASK_ID" || -z "$AGENT_ID" ]]; then
    echo "Error: task-id and agent-id are required"
    exit 1
fi

# If no action specified, default to one-shot (backward compatibility)
if [ -z "$ACTION" ]; then
    ACTION="once"
fi

HEARTBEAT_KEY="swarm:${TASK_ID}:${AGENT_ID}:heartbeat"
MARKER_FILE="/tmp/heartbeat-${TASK_ID}-${AGENT_ID}.active"

##############################################################################
# Send single heartbeat
##############################################################################
function send_heartbeat() {
    # Generate heartbeat payload
    HEARTBEAT_PAYLOAD=$(jq -n \
        --arg timestamp "$(date +%s)" \
        --arg status "$STATUS" \
        --arg task_id "$TASK_ID" \
        --arg agent_id "$AGENT_ID" \
        --argjson details "$DETAILS" \
        '{
            "timestamp": $timestamp,
            "status": $status,
            "task_id": $task_id,
            "agent_id": $agent_id,
            "details": $details
        }')

    # Send heartbeat via Redis with auto-expiration
    redis-cli setex "$HEARTBEAT_KEY" "$TTL" "$HEARTBEAT_PAYLOAD" >/dev/null
}

##############################################################################
# Start continuous heartbeat loop
##############################################################################
function start_heartbeat() {
    # Create marker file
    touch "$MARKER_FILE"

    # Background heartbeat loop
    (
        while [ -f "$MARKER_FILE" ]; do
            send_heartbeat
            sleep "$INTERVAL"
        done
    ) &

    echo "✓ Heartbeat started for $AGENT_ID (PID: $!, interval: ${INTERVAL}s)" >&2
}

##############################################################################
# Stop heartbeat loop
##############################################################################
function stop_heartbeat() {
    # Remove marker file to stop loop
    rm -f "$MARKER_FILE"

    # Kill heartbeat process if PID provided
    if [ -n "$HEARTBEAT_PID" ] && kill -0 "$HEARTBEAT_PID" 2>/dev/null; then
        kill "$HEARTBEAT_PID" 2>/dev/null || true
    fi

    # Clean up heartbeat key
    redis-cli DEL "$HEARTBEAT_KEY" >/dev/null

    echo "✓ Heartbeat stopped for $AGENT_ID" >&2
}

##############################################################################
# Main
##############################################################################
case "$ACTION" in
    start)
        start_heartbeat
        ;;
    stop)
        stop_heartbeat
        ;;
    once)
        send_heartbeat
        echo "✓ Heartbeat sent for $AGENT_ID" >&2
        ;;
    *)
        echo "Error: Invalid action: $ACTION"
        exit 1
        ;;
esac

exit 0