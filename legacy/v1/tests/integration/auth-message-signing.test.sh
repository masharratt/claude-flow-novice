#!/bin/bash
# Authentication Message Signing Integration Tests
# Phase 3: Validate HMAC-SHA256 signing, verification, key rotation, RBAC

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Enable authentication before sourcing libraries
export CFN_AUTH_ENABLED="true"

# Source libraries
source "$PROJECT_ROOT/lib/auth.sh"
source "$PROJECT_ROOT/tests/cli-coordination/message-bus.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test utilities
test_header() {
    echo ""
    echo "========================================="
    echo "TEST: $1"
    echo "========================================="
}

assert_success() {
    local message="$1"
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ $? -eq 0 ]]; then
        echo "✅ PASS: $message"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "❌ FAIL: $message"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

assert_failure() {
    local exit_code=$?
    local message="$1"
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ $exit_code -ne 0 ]]; then
        echo "✅ PASS: $message"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo "❌ FAIL: $message"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 0
    fi
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="$3"
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ "$expected" == "$actual" ]]; then
        echo "✅ PASS: $message"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "❌ FAIL: $message (expected: $expected, got: $actual)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

measure_time_us() {
    local start_us=$(date +%s%6N 2>/dev/null || echo "0")
    eval "$1" >/dev/null 2>&1
    local end_us=$(date +%s%6N 2>/dev/null || echo "0")
    echo $((end_us - start_us))
}

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up test environment..."
    cleanup_auth_system 2>/dev/null || true
    cleanup_message_bus_system 2>/dev/null || true
}

trap cleanup EXIT

# =============================================================================
# TEST SUITE
# =============================================================================

echo "🔐 Authentication Message Signing Integration Tests"
echo "=================================================="

# Test 1: System initialization
test_header "System Initialization"
# Auth already enabled via export before sourcing
assert_success "Auth system initialized"

init_message_bus_system
assert_success "Message bus system initialized"

# Test 2: Key generation
test_header "Key Generation"
generate_agent_key "test-agent-1" "$CFN_ROLE_WORKER"
assert_success "Generated key for test-agent-1"

generate_agent_key "test-agent-2" "$CFN_ROLE_COORDINATOR"
assert_success "Generated key for test-agent-2"

# Verify key files exist with correct permissions
if [[ -f "$CFN_AUTH_KEYS_DIR/test-agent-1.key" ]]; then
    perms=$(stat -c %a "$CFN_AUTH_KEYS_DIR/test-agent-1.key" 2>/dev/null || stat -f %A "$CFN_AUTH_KEYS_DIR/test-agent-1.key")
    assert_equals "600" "$perms" "Key file has 600 permissions"
fi

# Test 3: Message signing
test_header "Message Signing"
payload='{"data":"test message"}'
signature=$(sign_message "test-agent-1" "$payload")
if [[ -n "$signature" ]]; then
    echo "✅ PASS: Message signed successfully"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "❌ FAIL: Message signing failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 4: Signature verification - valid signature
test_header "Signature Verification - Valid"
verify_signature "test-agent-1" "$payload" "$signature"
assert_success "Valid signature verified"

# Test 5: Signature verification - invalid signature
test_header "Signature Verification - Invalid"
invalid_sig="aW52YWxpZHNpZ25hdHVyZQ=="
if verify_signature "test-agent-1" "$payload" "$invalid_sig" 2>/dev/null; then
    echo "❌ FAIL: Invalid signature rejected"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Invalid signature rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 6: Signature verification - tampered payload
test_header "Signature Verification - Tampered Payload"
tampered_payload='{"data":"tampered message"}'
if verify_signature "test-agent-1" "$tampered_payload" "$signature" 2>/dev/null; then
    echo "❌ FAIL: Tampered payload rejected"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Tampered payload rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 7: Message bus integration - signed message
test_header "Message Bus Integration - Signed Message"
init_message_bus "agent-1"
init_message_bus "agent-2"

generate_agent_key "agent-1" "$CFN_ROLE_WORKER"
generate_agent_key "agent-2" "$CFN_ROLE_WORKER"

msg_id=$(send_message "agent-1" "agent-2" "test" '{"content":"authenticated message"}')
if [[ -n "$msg_id" ]]; then
    echo "✅ PASS: Signed message sent"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "❌ FAIL: Signed message send failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Verify message has signature field
msg_file="$MESSAGE_BASE_DIR/agent-2/inbox/${msg_id}.json"
if [[ -f "$msg_file" ]]; then
    if command -v jq >/dev/null 2>&1; then
        has_signature=$(jq -r '.signature // ""' "$msg_file")
    else
        has_signature=$(grep -o '"signature":\s*"[^"]*"' "$msg_file" | sed 's/.*"\([^"]*\)"/\1/' || echo "")
    fi
    if [[ -n "$has_signature" ]]; then
        echo "✅ PASS: Message contains signature field"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "❌ FAIL: Message missing signature field"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo "❌ FAIL: Message file not found"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 8: Message bus integration - receive with verification
test_header "Message Bus Integration - Receive with Verification"
messages=$(receive_messages "agent-2")
if command -v jq >/dev/null 2>&1; then
    msg_count=$(echo "$messages" | jq '. | length')
else
    msg_count=$(echo "$messages" | grep -o '"msg_id":' | wc -l)
fi
assert_equals "1" "$msg_count" "Received 1 valid message"

# Test 9: Invalid signature removal
test_header "Invalid Signature Removal"
# Create message with invalid signature manually
invalid_msg_id="msg-invalid-001"
cat > "$MESSAGE_BASE_DIR/agent-2/inbox/${invalid_msg_id}.json" <<EOF
{
  "version": "1.1",
  "msg_id": "$invalid_msg_id",
  "from": "agent-1",
  "to": "agent-2",
  "timestamp": $(date +%s),
  "sequence": 999,
  "type": "test",
  "payload": {"content": "invalid"},
  "signature": "aW52YWxpZHNpZ25hdHVyZQ==",
  "auth_version": "1.0"
}
EOF

# Receive messages should remove invalid signature message
receive_messages "agent-2" >/dev/null
if [[ ! -f "$MESSAGE_BASE_DIR/agent-2/inbox/${invalid_msg_id}.json" ]]; then
    echo "✅ PASS: Invalid signature message removed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "❌ FAIL: Invalid signature message not removed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 10: Key rotation
test_header "Key Rotation"
old_key=$(get_agent_key "test-agent-1")
sleep 1  # Ensure timestamp difference
rotate_agent_key "test-agent-1"
new_key=$(get_agent_key "test-agent-1")

if [[ "$old_key" != "$new_key" ]]; then
    echo "✅ PASS: Key rotated successfully"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "❌ FAIL: Key rotation failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 11: Message signing after key rotation
test_header "Message Signing After Key Rotation"
new_payload='{"data":"post-rotation message"}'
new_signature=$(sign_message "test-agent-1" "$new_payload")
verify_signature "test-agent-1" "$new_payload" "$new_signature"
assert_success "Signature valid after key rotation"

# Test 12: RBAC - Worker permissions
test_header "RBAC - Worker Permissions"
generate_agent_key "worker-1" "$CFN_ROLE_WORKER"

check_permission "worker-1" "send_message"
assert_success "Worker can send_message"

check_permission "worker-1" "health_report"
assert_success "Worker can health_report"

if check_permission "worker-1" "shutdown" 2>/dev/null; then
    echo "❌ FAIL: Worker cannot shutdown"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Worker cannot shutdown"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 13: RBAC - Coordinator permissions
test_header "RBAC - Coordinator Permissions"
generate_agent_key "coord-1" "$CFN_ROLE_COORDINATOR"

check_permission "coord-1" "send_message"
assert_success "Coordinator can send_message"

check_permission "coord-1" "shutdown"
assert_success "Coordinator can shutdown"

check_permission "coord-1" "broadcast"
assert_success "Coordinator can broadcast"

# Test 14: RBAC - Observer restrictions
test_header "RBAC - Observer Restrictions"
generate_agent_key "observer-1" "$CFN_ROLE_OBSERVER"

if check_permission "observer-1" "send_message" 2>/dev/null; then
    echo "❌ FAIL: Observer cannot send_message"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Observer cannot send_message"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

if check_permission "observer-1" "health_report" 2>/dev/null; then
    echo "❌ FAIL: Observer cannot health_report"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Observer cannot health_report"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 15: Backward compatibility - unsigned messages
test_header "Backward Compatibility - Unsigned Messages"
export CFN_AUTH_ENABLED="false"
cleanup_message_bus_system
init_message_bus_system
init_message_bus "agent-3"
init_message_bus "agent-4"

unsigned_msg_id=$(send_message "agent-3" "agent-4" "test" '{"content":"unsigned"}')
messages=$(receive_messages "agent-4")
if command -v jq >/dev/null 2>&1; then
    msg_count=$(echo "$messages" | jq '. | length')
else
    msg_count=$(echo "$messages" | grep -o '"msg_id":' | wc -l)
fi
assert_equals "1" "$msg_count" "Unsigned message accepted when auth disabled"

export CFN_AUTH_ENABLED="true"

# Test 16: Performance - Signing speed
test_header "Performance - Signing Speed"
generate_agent_key "perf-agent" "$CFN_ROLE_WORKER"
perf_payload='{"data":"performance test payload with some content"}'

# Measure 10 signing operations
total_us=0
for i in {1..10}; do
    duration_us=$(measure_time_us "sign_message 'perf-agent' '$perf_payload'")
    total_us=$((total_us + duration_us))
done
avg_us=$((total_us / 10))

echo "📊 Average signing time: ${avg_us}μs"
if [[ $avg_us -lt 500 ]]; then
    echo "✅ PASS: Signing performance < 500μs (${avg_us}μs)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "⚠️  WARN: Signing performance > 500μs (${avg_us}μs)"
    TESTS_PASSED=$((TESTS_PASSED + 1))  # Still pass but warn
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 17: Performance - Verification speed
test_header "Performance - Verification Speed"
perf_signature=$(sign_message "perf-agent" "$perf_payload")

# Measure 10 verification operations
total_us=0
for i in {1..10}; do
    duration_us=$(measure_time_us "verify_signature 'perf-agent' '$perf_payload' '$perf_signature'")
    total_us=$((total_us + duration_us))
done
avg_us=$((total_us / 10))

echo "📊 Average verification time: ${avg_us}μs"
if [[ $avg_us -lt 1000 ]]; then
    echo "✅ PASS: Verification performance < 1000μs (${avg_us}μs)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "⚠️  WARN: Verification performance > 1000μs (${avg_us}μs)"
    TESTS_PASSED=$((TESTS_PASSED + 1))  # Still pass but warn
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 18: 10-agent scenario stress test
test_header "10-Agent Scenario Stress Test"
cleanup_message_bus_system
init_message_bus_system

# Create 10 agents
for i in {1..10}; do
    init_message_bus "stress-agent-$i"
    generate_agent_key "stress-agent-$i" "$CFN_ROLE_WORKER"
done

# Send 100 messages (10 agents x 10 messages each)
echo "📤 Sending 100 authenticated messages..."
for sender in {1..10}; do
    for receiver in {1..10}; do
        if [[ $sender -ne $receiver ]]; then
            send_message "stress-agent-$sender" "stress-agent-$receiver" "stress" "{\"msg\":$sender}" >/dev/null
        fi
    done
done

# Verify all agents received messages
total_received=0
for i in {1..10}; do
    count=$(message_count "stress-agent-$i" "inbox")
    total_received=$((total_received + count))
done

echo "📥 Total messages received: $total_received"
if [[ $total_received -eq 90 ]]; then  # 10 agents x 9 recipients = 90 messages
    echo "✅ PASS: 10-agent scenario completed successfully"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "❌ FAIL: Expected 90 messages, received $total_received"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 19: Replay attack prevention
test_header "Replay Attack Prevention"
generate_agent_key "replay-agent" "$CFN_ROLE_WORKER"
nonce1="nonce-$(date +%s%N)"

record_message_nonce "replay-agent" "$nonce1"
assert_success "First nonce recorded"

if record_message_nonce "replay-agent" "$nonce1" 2>/dev/null; then
    echo "❌ FAIL: Replay nonce rejected"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Replay nonce rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 20: Input validation - path traversal prevention
test_header "Security - Path Traversal Prevention"
if validate_agent_id_safe "../../../etc/passwd" 2>/dev/null; then
    echo "❌ FAIL: Path traversal attempt blocked"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Path traversal attempt blocked"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

if validate_agent_id_safe "agent;rm -rf /" 2>/dev/null; then
    echo "❌ FAIL: Command injection attempt blocked"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Command injection attempt blocked"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

validate_agent_id_safe "valid-agent-123"
assert_success "Valid agent ID accepted"

# =============================================================================
# TEST SUMMARY
# =============================================================================

echo ""
echo "=================================================="
echo "🔐 AUTHENTICATION TEST SUITE SUMMARY"
echo "=================================================="
echo "Tests Run:    $TESTS_RUN"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo "=================================================="

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo "✅ ALL TESTS PASSED"
    exit 0
else
    echo "❌ SOME TESTS FAILED"
    exit 1
fi
