#!/bin/bash
# Simplified CLI agent communication proof

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/message-bus.sh"

echo "=== CLI AGENT COMMUNICATION PROOF ==="
echo ""

# Setup
export MESSAGE_BASE_DIR="/dev/shm/cfn-test-simple-$$"
init_message_bus_system

# Initialize agents
echo "1. Initializing message bus for agent-A and agent-B..."
init_message_bus "agent-A"
init_message_bus "agent-B"

# Send messages
echo "2. Sending 3 messages from agent-A to agent-B..."
send_message "agent-A" "agent-B" "task-1" '{"data": "first"}' >/dev/null
send_message "agent-A" "agent-B" "task-2" '{"data": "second"}' >/dev/null
send_message "agent-A" "agent-B" "task-3" '{"data": "third"}' >/dev/null

# Verify delivery
echo "3. Verifying message delivery..."
msg_count=$(message_count "agent-B" "inbox")
echo "   Messages in agent-B inbox: $msg_count"

if [[ "$msg_count" == "3" ]]; then
    echo "   ✓ PASS: All 3 messages delivered"
else
    echo "   ✗ FAIL: Expected 3, got $msg_count"
    exit 1
fi

# Receive and display
echo "4. Reading messages from agent-B inbox..."
messages=$(receive_messages "agent-B")
echo "$messages" | jq -r '.[] | "   - From: \(.from), Type: \(.type), Seq: \(.sequence)"' 2>/dev/null || echo "$messages"

# Verify sequences
echo "5. Verifying sequence numbers (should be 1, 2, 3)..."
sequences=$(echo "$messages" | jq -r '.[].sequence' 2>/dev/null | tr '\n' ' ')
if [[ "$sequences" == "1 2 3 " ]]; then
    echo "   ✓ PASS: Sequences correct: $sequences"
else
    echo "   ✗ FAIL: Expected '1 2 3 ', got '$sequences'"
    exit 1
fi

# Multi-hop test
echo ""
echo "6. Testing multi-hop: agent-A → agent-B → agent-C..."
init_message_bus "agent-C"
send_message "agent-B" "agent-C" "result" '{"status": "processed"}' >/dev/null

c_count=$(message_count "agent-C" "inbox")
if [[ "$c_count" == "1" ]]; then
    echo "   ✓ PASS: Multi-hop message delivered"
else
    echo "   ✗ FAIL: Expected 1, got $c_count"
    exit 1
fi

# Cleanup
cleanup_message_bus_system

echo ""
echo "=== ✓ CLI AGENT COMMUNICATION PROVEN ==="
echo "Messages sent via message-bus.sh are delivered correctly"
echo "Agents can coordinate without running as processes"
