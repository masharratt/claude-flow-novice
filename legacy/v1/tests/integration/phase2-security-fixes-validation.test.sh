#!/usr/bin/env bash
# Phase 2 Sprint 2.1 - Security Fixes Validation Test Suite
# Tests CRITICAL security fixes: TOCTOU race, path traversal, auth strategy

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LIB_DIR="$PROJECT_ROOT/lib"

# Source libraries
source "$LIB_DIR/message-bus.sh"
source "$LIB_DIR/health.sh"
source "$LIB_DIR/shutdown.sh"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TEST_LOG="$PROJECT_ROOT/test-results/security-validation-$(date +%s).log"

mkdir -p "$(dirname "$TEST_LOG")"

# Logging functions
log_test() {
    echo "[TEST] $*" | tee -a "$TEST_LOG"
}

log_pass() {
    echo "[PASS] $*" | tee -a "$TEST_LOG"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo "[FAIL] $*" | tee -a "$TEST_LOG"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_info() {
    echo "[INFO] $*" | tee -a "$TEST_LOG"
}

# Cleanup function
cleanup_test_env() {
    log_info "Cleaning up test environment..."
    cleanup_message_bus_system 2>/dev/null || true
    rm -rf /dev/shm/cfn-health/* 2>/dev/null || true
    rm -rf /dev/shm/cfn-coordination/* 2>/dev/null || true
}

trap cleanup_test_env EXIT

# ==============================================================================
# TEST SUITE 1: TOCTOU Race Condition Fix (message-bus.sh:67)
# ==============================================================================

log_test "=== SUITE 1: TOCTOU Race Condition Fix ==="

test_sequence_file_race() {
    log_test "Test 1.1: Sequence file TOCTOU race fix"

    cleanup_message_bus_system

    # Initialize message bus
    init_message_bus_system
    init_message_bus "sender-agent"
    init_message_bus "recipient-agent"

    # Simulate concurrent sequence generation (100 parallel processes)
    local temp_results=$(mktemp)
    for i in {1..100}; do
        (get_next_sequence "sender-agent" "recipient-agent" >> "$temp_results") &
    done
    wait

    # Verify: All sequences are unique (no duplicates)
    local total_count=$(wc -l < "$temp_results")
    local unique_count=$(sort -u "$temp_results" | wc -l)

    if [[ "$total_count" -eq "$unique_count" ]] && [[ "$total_count" -eq 100 ]]; then
        log_pass "TOCTOU race fix: All 100 sequences unique (no duplicates)"
    else
        log_fail "TOCTOU race fix: Found duplicates (total: $total_count, unique: $unique_count)"
    fi

    rm -f "$temp_results"
}

test_sequence_initialization_inside_lock() {
    log_test "Test 1.2: Sequence file initialized inside flock"

    cleanup_message_bus_system
    init_message_bus_system
    init_message_bus "agent-a"
    init_message_bus "agent-b"

    # Remove existing sequence file to test initialization
    rm -rf "$MESSAGE_BASE_DIR/agent-a/.sequences"

    # Concurrent initialization (should not create duplicates)
    local seq1=$(get_next_sequence "agent-a" "agent-b")
    local seq2=$(get_next_sequence "agent-a" "agent-b")
    local seq3=$(get_next_sequence "agent-a" "agent-b")

    if [[ "$seq1" -eq 1 ]] && [[ "$seq2" -eq 2 ]] && [[ "$seq3" -eq 3 ]]; then
        log_pass "Sequence initialization inside flock: Correct sequence (1, 2, 3)"
    else
        log_fail "Sequence initialization inside flock: Incorrect sequence ($seq1, $seq2, $seq3)"
    fi
}

# ==============================================================================
# TEST SUITE 2: Agent ID Path Traversal Prevention
# ==============================================================================

log_test "=== SUITE 2: Agent ID Path Traversal Prevention ==="

test_path_traversal_blocked_message_bus() {
    log_test "Test 2.1: Path traversal blocked in message-bus.sh"

    cleanup_message_bus_system
    init_message_bus_system

    # Attempt path traversal attacks
    local attack_ids=(
        "../../etc/passwd"
        "../../../root/.ssh/id_rsa"
        "agent-1/../../../etc/shadow"
        "agent-1\x00/etc/passwd"
        "$(cat /etc/passwd)"
    )

    local blocked=0
    local total=${#attack_ids[@]}

    for attack_id in "${attack_ids[@]}"; do
        if ! init_message_bus "$attack_id" 2>/dev/null; then
            blocked=$((blocked + 1))
        fi
    done

    if [[ "$blocked" -eq "$total" ]]; then
        log_pass "Path traversal blocked: All $total attack attempts rejected"
    else
        log_fail "Path traversal blocked: Only $blocked/$total attacks blocked"
    fi
}

test_path_traversal_blocked_health() {
    log_test "Test 2.2: Path traversal blocked in health.sh"

    local attack_ids=(
        "../../etc/passwd"
        "../../../root/.ssh/id_rsa"
    )

    local blocked=0
    local total=${#attack_ids[@]}

    for attack_id in "${attack_ids[@]}"; do
        if ! report_health "$attack_id" "healthy" "{}" 2>/dev/null; then
            blocked=$((blocked + 1))
        fi
    done

    if [[ "$blocked" -eq "$total" ]]; then
        log_pass "Health path traversal blocked: All $total attacks rejected"
    else
        log_fail "Health path traversal blocked: Only $blocked/$total attacks blocked"
    fi
}

test_path_traversal_blocked_shutdown() {
    log_test "Test 2.3: Path traversal blocked in shutdown.sh"

    local attack_ids=(
        "../../etc/passwd"
        "../../../var/log/syslog"
    )

    local blocked=0
    local total=${#attack_ids[@]}

    for attack_id in "${attack_ids[@]}"; do
        if ! drain_inbox "$attack_id" 1 2>/dev/null; then
            blocked=$((blocked + 1))
        fi
    done

    if [[ "$blocked" -eq "$total" ]]; then
        log_pass "Shutdown path traversal blocked: All $total attacks rejected"
    else
        log_fail "Shutdown path traversal blocked: Only $blocked/$total attacks blocked"
    fi
}

test_valid_agent_ids_accepted() {
    log_test "Test 2.4: Valid agent IDs accepted"

    cleanup_message_bus_system
    init_message_bus_system

    local valid_ids=(
        "agent-1"
        "coordinator-123"
        "worker_abc"
        "validator-99"
        "a1b2c3"
        "AGENT-UPPERCASE"
        "MixedCase123"
    )

    local accepted=0
    local total=${#valid_ids[@]}

    for valid_id in "${valid_ids[@]}"; do
        if init_message_bus "$valid_id" 2>/dev/null; then
            accepted=$((accepted + 1))
        fi
    done

    if [[ "$accepted" -eq "$total" ]]; then
        log_pass "Valid agent IDs accepted: All $total valid IDs accepted"
    else
        log_fail "Valid agent IDs accepted: Only $accepted/$total valid IDs accepted"
    fi
}

test_invalid_agent_ids_rejected() {
    log_test "Test 2.5: Invalid agent IDs rejected"

    local invalid_ids=(
        ""                          # Empty
        "agent id with spaces"      # Spaces
        "agent@domain.com"          # Special chars
        "agent#123"                 # Hash
        "agent;rm -rf /"            # Command injection
        "$(whoami)"                 # Command substitution
        "verylongagentidthatexceedssixtyfourcharacterlimitabcdefghijklmnop"  # >64 chars
    )

    local rejected=0
    local total=${#invalid_ids[@]}

    for invalid_id in "${invalid_ids[@]}"; do
        if ! init_message_bus "$invalid_id" 2>/dev/null; then
            rejected=$((rejected + 1))
        fi
    done

    if [[ "$rejected" -eq "$total" ]]; then
        log_pass "Invalid agent IDs rejected: All $total invalid IDs rejected"
    else
        log_fail "Invalid agent IDs rejected: Only $rejected/$total invalid IDs rejected"
    fi
}

# ==============================================================================
# TEST SUITE 3: Authentication Strategy Documentation
# ==============================================================================

log_test "=== SUITE 3: Authentication Strategy Documentation ==="

test_auth_strategy_document_exists() {
    log_test "Test 3.1: Authentication strategy document exists"

    local auth_doc="$PROJECT_ROOT/planning/agent-coordination-v2/PHASE3_AUTHENTICATION_STRATEGY.md"

    if [[ -f "$auth_doc" ]]; then
        log_pass "Authentication strategy document exists: $auth_doc"
    else
        log_fail "Authentication strategy document missing: $auth_doc"
        return
    fi

    # Verify document contains required sections
    local required_sections=(
        "Authentication Strategy"
        "HMAC-SHA256"
        "Authorization"
        "RBAC"
        "Encryption"
        "Audit"
        "Implementation Roadmap"
    )

    local found=0
    local total=${#required_sections[@]}

    for section in "${required_sections[@]}"; do
        if grep -qi "$section" "$auth_doc"; then
            found=$((found + 1))
        fi
    done

    if [[ "$found" -eq "$total" ]]; then
        log_pass "Authentication strategy document complete: All $total sections present"
    else
        log_fail "Authentication strategy document incomplete: Only $found/$total sections found"
    fi
}

test_auth_strategy_addresses_vulnerabilities() {
    log_test "Test 3.2: Authentication strategy addresses audit vulnerabilities"

    local auth_doc="$PROJECT_ROOT/planning/agent-coordination-v2/PHASE3_AUTHENTICATION_STRATEGY.md"

    if [[ ! -f "$auth_doc" ]]; then
        log_fail "Cannot verify vulnerabilities: Document missing"
        return
    fi

    # Check if document addresses specific vulnerabilities from audit
    local vulnerabilities=(
        "CWE-306"           # Missing Authentication
        "impersonation"     # Agent impersonation
        "path traversal"    # CWE-22
        "signature"         # Message signing
        "authorization"     # Access control
    )

    local addressed=0
    local total=${#vulnerabilities[@]}

    for vuln in "${vulnerabilities[@]}"; do
        if grep -qi "$vuln" "$auth_doc"; then
            addressed=$((addressed + 1))
        fi
    done

    if [[ "$addressed" -eq "$total" ]]; then
        log_pass "Authentication strategy addresses vulnerabilities: All $total vulnerabilities covered"
    else
        log_fail "Authentication strategy addresses vulnerabilities: Only $addressed/$total covered"
    fi
}

# ==============================================================================
# TEST SUITE 4: Integration Tests (All Fixes Combined)
# ==============================================================================

log_test "=== SUITE 4: Integration Tests ==="

test_end_to_end_secure_messaging() {
    log_test "Test 4.1: End-to-end secure messaging (with validation)"

    cleanup_message_bus_system
    init_message_bus_system

    # Initialize agents with valid IDs
    init_message_bus "sender-123"
    init_message_bus "recipient-456"

    # Send messages with concurrent sequence generation
    local msg_ids=()
    for i in {1..10}; do
        local msg_id=$(send_message "sender-123" "recipient-456" "test" "{\"seq\":$i}")
        msg_ids+=("$msg_id")
    done

    # Verify: All messages received
    local received_count=$(message_count "recipient-456" "inbox")

    if [[ "$received_count" -eq 10 ]]; then
        log_pass "End-to-end messaging: All 10 messages delivered"
    else
        log_fail "End-to-end messaging: Only $received_count/10 messages delivered"
    fi

    # Verify: Sequences are sequential
    local messages=$(receive_messages "recipient-456")
    local prev_seq=0
    local sequential=true

    for i in {0..9}; do
        local seq=$(echo "$messages" | jq -r ".[$i].sequence")
        local expected=$((prev_seq + 1))

        if [[ "$seq" -ne "$expected" ]]; then
            sequential=false
            break
        fi
        prev_seq=$seq
    done

    if [[ "$sequential" == "true" ]]; then
        log_pass "Message sequencing: All sequences sequential (1-10)"
    else
        log_fail "Message sequencing: Sequences not sequential"
    fi
}

test_attack_resistance() {
    log_test "Test 4.2: Attack resistance (path traversal + concurrent races)"

    cleanup_message_bus_system
    init_message_bus_system

    # Attack 1: Path traversal in sender ID
    local attack1_blocked=false
    if ! send_message "../../etc/passwd" "victim" "attack" "{}" 2>/dev/null; then
        attack1_blocked=true
    fi

    # Attack 2: Path traversal in recipient ID
    local attack2_blocked=false
    if ! send_message "attacker" "../../root/.ssh/id_rsa" "attack" "{}" 2>/dev/null; then
        attack2_blocked=true
    fi

    # Attack 3: Concurrent race condition exploit
    init_message_bus "race-sender"
    init_message_bus "race-receiver"

    local race_results=$(mktemp)
    for i in {1..50}; do
        (get_next_sequence "race-sender" "race-receiver" >> "$race_results") &
    done
    wait

    local race_unique=$(sort -u "$race_results" | wc -l)
    local race_total=$(wc -l < "$race_results")
    local race_blocked=$([[ "$race_unique" -eq "$race_total" ]] && echo "true" || echo "false")

    rm -f "$race_results"

    if [[ "$attack1_blocked" == "true" ]] && [[ "$attack2_blocked" == "true" ]] && [[ "$race_blocked" == "true" ]]; then
        log_pass "Attack resistance: All 3 attack vectors blocked"
    else
        log_fail "Attack resistance: Some attacks succeeded (traversal1: $attack1_blocked, traversal2: $attack2_blocked, race: $race_blocked)"
    fi
}

# ==============================================================================
# RUN ALL TESTS
# ==============================================================================

log_info "Starting Phase 2 Sprint 2.1 security validation tests..."
log_info ""

# Suite 1: TOCTOU Race Fix
test_sequence_file_race
test_sequence_initialization_inside_lock

# Suite 2: Path Traversal Prevention
test_path_traversal_blocked_message_bus
test_path_traversal_blocked_health
test_path_traversal_blocked_shutdown
test_valid_agent_ids_accepted
test_invalid_agent_ids_rejected

# Suite 3: Authentication Strategy
test_auth_strategy_document_exists
test_auth_strategy_addresses_vulnerabilities

# Suite 4: Integration
test_end_to_end_secure_messaging
test_attack_resistance

# ==============================================================================
# TEST SUMMARY
# ==============================================================================

log_info ""
log_info "=========================================="
log_info "SECURITY VALIDATION TEST SUMMARY"
log_info "=========================================="
log_info "Tests Passed: $TESTS_PASSED"
log_info "Tests Failed: $TESTS_FAILED"
log_info "Total Tests:  $((TESTS_PASSED + TESTS_FAILED))"
log_info "Success Rate: $((TESTS_PASSED * 100 / (TESTS_PASSED + TESTS_FAILED)))%"
log_info "=========================================="
log_info ""
log_info "Full test log: $TEST_LOG"

if [[ "$TESTS_FAILED" -eq 0 ]]; then
    log_info "✅ ALL SECURITY FIXES VALIDATED - PRODUCTION READY"
    exit 0
else
    log_info "❌ SECURITY VALIDATION FAILED - FIXES NEEDED"
    exit 1
fi
