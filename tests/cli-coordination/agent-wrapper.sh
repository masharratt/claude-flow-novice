#!/bin/bash
# agent-wrapper.sh - Wrapper for Claude Code Task tool to spawn coordinating agents
#
# Usage: agent-wrapper.sh <agent-id> <task-description>
#
# This script enables Claude Code's Task tool to spawn agents that coordinate
# via message-bus.sh CLI

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# CRITICAL: Preserve MESSAGE_BASE_DIR from parent environment if set
# This allows test scripts to use custom message bus locations
export MESSAGE_BASE_DIR="${MESSAGE_BASE_DIR:-/dev/shm/cfn-mvp/messages}"

source "$SCRIPT_DIR/message-bus.sh"

# Parse arguments
AGENT_ID="${1:-}"
TASK_DESCRIPTION="${2:-default task}"

if [[ -z "$AGENT_ID" ]]; then
    echo "ERROR: agent-id required" >&2
    echo "Usage: $0 <agent-id> <task-description>" >&2
    exit 1
fi

# Initialize agent's message bus
init_message_bus "$AGENT_ID"

echo "[$(date '+%H:%M:%S')] [$AGENT_ID] Agent started - Task: $TASK_DESCRIPTION"

# Simulate agent work with message bus integration
echo "[$(date '+%H:%M:%S')] [$AGENT_ID] Checking inbox for messages..."
message_count=$(message_count "$AGENT_ID" "inbox")
echo "[$(date '+%H:%M:%S')] [$AGENT_ID] Inbox contains $message_count messages"

if [[ $message_count -gt 0 ]]; then
    echo "[$(date '+%H:%M:%S')] [$AGENT_ID] Processing $message_count messages..."

    # Process messages directly from inbox files (no jq dependency)
    inbox="$MESSAGE_BASE_DIR/$AGENT_ID/inbox"

    for msg_file in "$inbox"/*.json; do
        if [[ ! -f "$msg_file" ]]; then
            continue
        fi

        # Extract fields using grep/sed (no jq required)
        msg_from=$(grep -o '"from"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"from"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        msg_type=$(grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        msg_id=$(grep -o '"msg_id"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"msg_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

        echo "[$(date '+%H:%M:%S')] [$AGENT_ID] Received: type=$msg_type from=$msg_from (msg_id=$msg_id)"

        # Example: Send response back to sender
        if [[ "$msg_type" == "request" ]]; then
            echo "[$(date '+%H:%M:%S')] [$AGENT_ID] Sending response to $msg_from..."
            send_message "$AGENT_ID" "$msg_from" "response" "{\"status\": \"completed\", \"agent\": \"$AGENT_ID\"}"
        fi
    done

    # Clear inbox after processing
    clear_inbox "$AGENT_ID"
fi

# Perform work based on task description
echo "[$(date '+%H:%M:%S')] [$AGENT_ID] Executing task: $TASK_DESCRIPTION"
sleep 1  # Simulate work

# Report completion
echo "[$(date '+%H:%M:%S')] [$AGENT_ID] Task completed successfully"
echo "[$(date '+%H:%M:%S')] [$AGENT_ID] Agent shutting down"

# Return structured result for Task tool
cat <<EOF
{
  "agent_id": "$AGENT_ID",
  "status": "completed",
  "task": "$TASK_DESCRIPTION",
  "messages_processed": $message_count,
  "timestamp": $(date +%s)
}
EOF
