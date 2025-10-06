#!/bin/bash
# test-agent-simple.sh - Simplified agent for scalability testing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export MESSAGE_BASE_DIR="${MESSAGE_BASE_DIR:-/dev/shm/cfn-mvp/messages}"
source "$SCRIPT_DIR/message-bus.sh"

AGENT_ID="${1:-}"
[[ -z "$AGENT_ID" ]] && exit 1

# Check for messages
msg_count=$(message_count "$AGENT_ID" "inbox")

if [[ $msg_count -gt 0 ]]; then
    inbox="$MESSAGE_BASE_DIR/$AGENT_ID/inbox"

    for msg_file in "$inbox"/*.json; do
        [[ ! -f "$msg_file" ]] && continue

        msg_from=$(grep -o '"from"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"\([^"]*\)".*/\1/')
        msg_type=$(grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' "$msg_file" | sed 's/.*"\([^"]*\)".*/\1/')

        # Send response
        send_message "$AGENT_ID" "$msg_from" "response" "{\"status\": \"ok\"}" >/dev/null 2>&1
    done

    clear_inbox "$AGENT_ID"
fi
