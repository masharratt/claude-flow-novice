#!/bin/bash
# Redis Coordination Skill - Agent Heartbeat Sender
# Version: 1.0.0
# Last Updated: 2025-10-19

# Strict error handling
set -euo pipefail

# Default values
TASK_ID=""
AGENT_ID=""
STATUS="active"
TTL=60
DETAILS='{}'

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
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

# Send heartbeat via Redis
redis-cli setex "swarm:${TASK_ID}:${AGENT_ID}:heartbeat" "$TTL" "$HEARTBEAT_PAYLOAD"

# Log heartbeat
echo "[$(date -u)] Heartbeat sent: task=${TASK_ID}, agent=${AGENT_ID}, status=${STATUS}" >> /var/log/claude-flow/heartbeats.log

exit 0