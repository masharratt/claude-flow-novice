#!/bin/bash
set -euo pipefail
source message-bus.sh

export MESSAGE_BASE_DIR="/dev/shm/debug-test-$$"
init_message_bus_system
init_message_bus "sender"
init_message_bus "receiver"

# Send message
send_message "sender" "receiver" "request" '{"task":"test"}' >/dev/null

# Simulate agent-wrapper.sh logic
echo "=== Agent receiving ==="
msg_count=$(message_count "receiver" "inbox")
echo "Inbox count: $msg_count"

messages=$(receive_messages "receiver")
echo "Messages JSON:"
echo "$messages"

echo ""
echo "=== Parsing with jq ==="
echo "$messages" | jq -c '.[]' 2>&1 | head -5

cleanup_message_bus_system
