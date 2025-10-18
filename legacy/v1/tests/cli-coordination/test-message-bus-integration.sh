#!/bin/bash
# Test Message Bus Integration with MVP Coordinator
# Sprint 1.2 - Verification Script

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COORDINATOR="$SCRIPT_DIR/mvp-coordinator.sh"
MESSAGE_BUS="$SCRIPT_DIR/message-bus.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

test_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

test_fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

echo "=== Message Bus Integration Test ==="
echo ""

# Test 1: Initialize coordinator (should also initialize message bus)
echo "Test 1: Initialize coordinator and message bus system"
bash "$COORDINATOR" init >/dev/null 2>&1 || test_fail "Coordinator init failed"
bash "$MESSAGE_BUS" init-system >/dev/null 2>&1 || test_fail "Message bus system init failed"
test_pass "Coordinator and message bus initialized"

# Test 2: Spawn agents (should create message directories)
echo "Test 2: Spawn agents with message bus"
bash "$COORDINATOR" spawn agent-1 coder "Task 1" >/dev/null 2>&1 || test_fail "Spawn agent-1 failed"
bash "$COORDINATOR" spawn agent-2 tester "Task 2" >/dev/null 2>&1 || test_fail "Spawn agent-2 failed"

# Verify message directories exist
if [[ -d "/dev/shm/cfn-mvp/messages/agent-1/inbox" ]] && [[ -d "/dev/shm/cfn-mvp/messages/agent-1/outbox" ]]; then
    test_pass "Agent-1 message directories created"
else
    test_fail "Agent-1 message directories missing"
fi

if [[ -d "/dev/shm/cfn-mvp/messages/agent-2/inbox" ]] && [[ -d "/dev/shm/cfn-mvp/messages/agent-2/outbox" ]]; then
    test_pass "Agent-2 message directories created"
else
    test_fail "Agent-2 message directories missing"
fi

# Test 3: Send messages between agents
echo "Test 3: Send messages between agents"
msg_id=$(bash "$MESSAGE_BUS" send agent-1 agent-2 task-request '{"request":"run tests"}')
if [[ -n "$msg_id" ]]; then
    test_pass "Message sent: $msg_id"
else
    test_fail "Failed to send message"
fi

# Verify message in agent-2 inbox
inbox_count=$(bash "$MESSAGE_BUS" count agent-2 inbox)
if [[ "$inbox_count" -eq 1 ]]; then
    test_pass "Message received in agent-2 inbox (count: $inbox_count)"
else
    test_fail "Expected 1 message in agent-2 inbox, got: $inbox_count"
fi

# Test 4: Receive messages
echo "Test 4: Receive and parse messages"
messages=$(bash "$MESSAGE_BUS" receive agent-2)
if echo "$messages" | grep -q "task-request"; then
    test_pass "Messages retrieved successfully"
else
    test_fail "Failed to retrieve messages"
fi

# Test 5: Clear inbox
echo "Test 5: Clear inbox after processing"
bash "$MESSAGE_BUS" clear agent-2 >/dev/null 2>&1 || test_fail "Clear inbox failed"
inbox_count=$(bash "$MESSAGE_BUS" count agent-2 inbox)
if [[ "$inbox_count" -eq 0 ]]; then
    test_pass "Inbox cleared successfully"
else
    test_fail "Inbox not cleared (count: $inbox_count)"
fi

# Test 6: Shutdown and cleanup
echo "Test 6: Shutdown coordinator (should cleanup message bus)"
bash "$COORDINATOR" shutdown >/dev/null 2>&1 || test_fail "Coordinator shutdown failed"

# Verify message directories cleaned up
if [[ ! -d "/dev/shm/cfn-mvp/messages/agent-1" ]] && [[ ! -d "/dev/shm/cfn-mvp/messages/agent-2" ]]; then
    test_pass "Message directories cleaned up"
else
    test_fail "Message directories not cleaned up"
fi

# Final cleanup
bash "$MESSAGE_BUS" cleanup-system >/dev/null 2>&1 || true

echo ""
echo "=== All Tests Passed ==="
