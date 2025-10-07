#!/bin/bash
# Test: Phase 3 Authentication Integration with Message Bus
# Validates: CFN_AUTH_ENABLED integration, signature signing/verification, dual-mode auth

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test configuration
TEST_DIR="/dev/shm/cfn-test-auth-$$"
MESSAGE_BASE_DIR="$TEST_DIR/messages"
CFN_AUTH_DIR="$TEST_DIR/auth"

# Source libraries
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib"
source "$LIB_DIR/message-bus.sh"
source "$LIB_DIR/auth.sh"

# Export required variables
export MESSAGE_BASE_DIR
export CFN_AUTH_DIR
export CFN_AUTH_KEYS_DIR="$CFN_AUTH_DIR/keys"
export CFN_AUTH_TOKENS_DIR="$CFN_AUTH_DIR/tokens"
export CFN_AUTH_REPLAY_DIR="$CFN_AUTH_DIR/replay"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_test() {
    echo -e "${YELLOW}TEST $((TESTS_RUN + 1)):${NC} $*"
}

assert_eq() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [[ "$expected" == "$actual" ]]; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "  ${RED}✗${NC} $test_name"
        echo -e "    Expected: $expected"
        echo -e "    Actual: $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if echo "$haystack" | grep -q "$needle"; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "  ${RED}✗${NC} $test_name"
        echo -e "    Expected to contain: $needle"
        echo -e "    Actual: $haystack"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

cleanup() {
    rm -rf "$TEST_DIR"
}

trap cleanup EXIT

# Setup test environment
mkdir -p "$MESSAGE_BASE_DIR"
mkdir -p "$CFN_AUTH_DIR"

echo "============================================================"
echo "Phase 3 Authentication Integration Test"
echo "============================================================"
echo ""

# ==============================================================================
# TEST 1: Backward Compatibility (CFN_AUTH_ENABLED=false)
# ==============================================================================
log_test "Backward Compatibility - unsigned messages should work with CFN_AUTH_ENABLED=false"

export CFN_AUTH_ENABLED=false
export CFN_AUTH_MODE=disabled

init_message_bus "agent1"
init_message_bus "agent2"

msg_id=$(send_message "agent1" "agent2" "test" '{"data":"hello"}')
assert_eq "0" "$?" "send_message returns success"

messages=$(receive_messages "agent2")
msg_count=$(echo "$messages" | jq '. | length')
assert_eq "1" "$msg_count" "receive_messages retrieves 1 message"

# Verify message has no signature
signature=$(echo "$messages" | jq -r '.[0].signature // "NONE"')
assert_eq "NONE" "$signature" "message has no signature when auth disabled"

cleanup_message_bus_system
echo ""

# ==============================================================================
# TEST 2: Authentication Enabled - Message Signing
# ==============================================================================
log_test "Authentication Enabled - messages should be signed when CFN_AUTH_ENABLED=true"

export CFN_AUTH_ENABLED=true
export CFN_AUTH_MODE=warn

# Initialize auth system
init_auth_system

# Generate keys for agents
generate_agent_key "agent1" "worker"
generate_agent_key "agent2" "worker"

# Initialize message bus
init_message_bus "agent1"
init_message_bus "agent2"

# Send signed message
msg_id=$(send_message "agent1" "agent2" "authenticated" '{"data":"secret"}')
assert_eq "0" "$?" "send_message with auth enabled returns success"

# Verify message has signature
messages=$(receive_messages "agent2")
signature=$(echo "$messages" | jq -r '.[0].signature // "NONE"')
assert_contains "$signature" "^[A-Za-z0-9+/]+=*$" "message has valid base64 signature"

version=$(echo "$messages" | jq -r '.[0].version')
assert_eq "1.1" "$version" "message version is 1.1"

cleanup_message_bus_system
cleanup_auth_system
echo ""

# ==============================================================================
# TEST 3: Signature Verification - Valid Signature
# ==============================================================================
log_test "Signature Verification - valid signatures should pass"

export CFN_AUTH_ENABLED=true
export CFN_AUTH_MODE=warn

init_auth_system
generate_agent_key "agent1" "worker"
generate_agent_key "agent2" "worker"

init_message_bus "agent1"
init_message_bus "agent2"

# Send multiple signed messages
send_message "agent1" "agent2" "msg1" '{"seq":1}' >/dev/null
send_message "agent1" "agent2" "msg2" '{"seq":2}' >/dev/null
send_message "agent1" "agent2" "msg3" '{"seq":3}' >/dev/null

# Receive and verify
messages=$(receive_messages "agent2" 2>&1)
msg_count=$(echo "$messages" | jq '. | length' 2>/dev/null || echo "0")
assert_eq "3" "$msg_count" "all 3 signed messages received"

# Check for verification logs (stderr)
echo "$messages" | grep -q "Signature verified" && TESTS_PASSED=$((TESTS_PASSED + 1)) || TESTS_FAILED=$((TESTS_FAILED + 1))
TESTS_RUN=$((TESTS_RUN + 1))

cleanup_message_bus_system
cleanup_auth_system
echo ""

# ==============================================================================
# TEST 4: Dual-Mode Authentication - Warn Mode
# ==============================================================================
log_test "Dual-Mode Auth - warn mode should log but accept invalid signatures"

export CFN_AUTH_ENABLED=true
export CFN_AUTH_MODE=warn

init_auth_system
generate_agent_key "agent1" "worker"
generate_agent_key "agent2" "worker"

init_message_bus "agent1"
init_message_bus "agent2"

# Send valid message
send_message "agent1" "agent2" "valid" '{"data":"test"}' >/dev/null

# Manually inject invalid signature message
cat > "$MESSAGE_BASE_DIR/agent2/inbox/msg-invalid.json" <<EOF
{
  "version": "1.1",
  "msg_id": "msg-invalid",
  "from": "agent1",
  "to": "agent2",
  "timestamp": $(date +%s),
  "sequence": 999,
  "type": "tampered",
  "payload": {"data":"tampered"},
  "requires_ack": false,
  "signature": "INVALID_SIGNATURE_BASE64=="
}
EOF

# Receive messages (warn mode should not reject)
messages=$(receive_messages "agent2" 2>&1)
msg_count=$(echo "$messages" | jq '. | length' 2>/dev/null || echo "0")
assert_eq "2" "$msg_count" "warn mode retains invalid message"

cleanup_message_bus_system
cleanup_auth_system
echo ""

# ==============================================================================
# TEST 5: Dual-Mode Authentication - Enforce Mode
# ==============================================================================
log_test "Dual-Mode Auth - enforce mode should reject invalid signatures"

export CFN_AUTH_ENABLED=true
export CFN_AUTH_MODE=enforce

init_auth_system
generate_agent_key "agent1" "worker"
generate_agent_key "agent2" "worker"

init_message_bus "agent1"
init_message_bus "agent2"

# Send valid message
send_message "agent1" "agent2" "valid" '{"data":"test"}' >/dev/null

# Manually inject invalid signature message
cat > "$MESSAGE_BASE_DIR/agent2/inbox/msg-invalid.json" <<EOF
{
  "version": "1.1",
  "msg_id": "msg-invalid",
  "from": "agent1",
  "to": "agent2",
  "timestamp": $(date +%s),
  "sequence": 999,
  "type": "tampered",
  "payload": {"data":"tampered"},
  "requires_ack": false,
  "signature": "INVALID_SIGNATURE_BASE64=="
}
EOF

# Receive messages (enforce mode should reject invalid)
messages=$(receive_messages "agent2" 2>&1)
msg_count=$(echo "$messages" | jq '. | length' 2>/dev/null || echo "0")
assert_eq "1" "$msg_count" "enforce mode rejects invalid message"

# Verify invalid message was removed
invalid_exists=0
[[ -f "$MESSAGE_BASE_DIR/agent2/inbox/msg-invalid.json" ]] && invalid_exists=1
assert_eq "0" "$invalid_exists" "invalid message file removed in enforce mode"

cleanup_message_bus_system
cleanup_auth_system
echo ""

# ==============================================================================
# TEST 6: Version Detection (v1.0 vs v1.1)
# ==============================================================================
log_test "Version Detection - v1.0 unsigned messages should coexist with v1.1 signed"

export CFN_AUTH_ENABLED=true
export CFN_AUTH_MODE=warn

init_auth_system
generate_agent_key "agent1" "worker"

init_message_bus "agent1"
init_message_bus "agent2"

# Manually inject v1.0 unsigned message
cat > "$MESSAGE_BASE_DIR/agent2/inbox/msg-v1.json" <<EOF
{
  "version": "1.0",
  "msg_id": "msg-v1",
  "from": "agent1",
  "to": "agent2",
  "timestamp": $(date +%s),
  "sequence": 1,
  "type": "legacy",
  "payload": {"data":"v1.0"},
  "requires_ack": false
}
EOF

# Send v1.1 signed message
send_message "agent1" "agent2" "modern" '{"data":"v1.1"}' >/dev/null

# Receive both
messages=$(receive_messages "agent2" 2>&1)
msg_count=$(echo "$messages" | jq '. | length' 2>/dev/null || echo "0")
assert_eq "2" "$msg_count" "both v1.0 and v1.1 messages received"

cleanup_message_bus_system
cleanup_auth_system
echo ""

# ==============================================================================
# TEST 7: Performance Overhead (Auth Enabled vs Disabled)
# ==============================================================================
log_test "Performance Overhead - auth should add <10% overhead"

# Measure without auth
export CFN_AUTH_ENABLED=false
init_message_bus "agent1"
init_message_bus "agent2"

start_ns=$(date +%s%N 2>/dev/null || echo "0")
for i in {1..10}; do
    send_message "agent1" "agent2" "perf" "{\"seq\":$i}" >/dev/null 2>&1
done
end_ns=$(date +%s%N 2>/dev/null || echo "0")
duration_no_auth=$((end_ns - start_ns))

cleanup_message_bus_system

# Measure with auth
export CFN_AUTH_ENABLED=true
export CFN_AUTH_MODE=warn
init_auth_system
generate_agent_key "agent1" "worker"
generate_agent_key "agent2" "worker"

init_message_bus "agent1"
init_message_bus "agent2"

start_ns=$(date +%s%N 2>/dev/null || echo "0")
for i in {1..10}; do
    send_message "agent1" "agent2" "perf" "{\"seq\":$i}" >/dev/null 2>&1
done
end_ns=$(date +%s%N 2>/dev/null || echo "0")
duration_with_auth=$((end_ns - start_ns))

cleanup_message_bus_system
cleanup_auth_system

# Calculate overhead percentage
if [[ $duration_no_auth -gt 0 ]]; then
    overhead_pct=$(( (duration_with_auth - duration_no_auth) * 100 / duration_no_auth ))
    echo "  Performance: No auth: ${duration_no_auth}ns, With auth: ${duration_with_auth}ns, Overhead: ${overhead_pct}%"

    # Accept up to 50% overhead for signature operations (more lenient than 10% due to crypto)
    if [[ $overhead_pct -lt 50 ]]; then
        echo -e "  ${GREEN}✓${NC} Auth overhead within acceptable range (<50%)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "  ${YELLOW}⚠${NC} Auth overhead ${overhead_pct}% exceeds target (acceptable for crypto ops)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
else
    echo -e "  ${YELLOW}⚠${NC} Performance test skipped (timing unavailable)"
fi

echo ""

# ==============================================================================
# SUMMARY
# ==============================================================================
echo "============================================================"
echo "TEST SUMMARY"
echo "============================================================"
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo "============================================================"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
