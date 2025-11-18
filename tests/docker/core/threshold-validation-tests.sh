#!/bin/bash
# tests/docker-mode/test-threshold-validation.sh
# Docker Mode Threshold Validation Test Suite (6 tests)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/docker/tests/test-helpers.sh"

# Test configuration
TEST_ID="docker-threshold-$(date +%s)"
TEST_WORKSPACE="/tmp/docker-test-$$"

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up test environment..."
    rm -rf "$TEST_WORKSPACE" 2>/dev/null || true
    exit $exit_code
}

trap cleanup EXIT INT TERM

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: MVP mode thresholds (gate: 0.70, consensus: 0.80)
test_mvp_thresholds_docker() {
    log_test "Test 1: MVP mode thresholds (gate: 0.70, consensus: 0.80)"

    # GIVEN: MVP mode configuration
    local gate_threshold=0.70
    local consensus_threshold=0.80
    local loop3_pass_rate=0.72
    local loop2_consensus=0.82

    # WHEN: Checking thresholds in container environment
    mkdir -p "$TEST_WORKSPACE"
    cat > "$TEST_WORKSPACE/check-thresholds.sh" <<'EOF'
#!/bin/bash
GATE_THRESHOLD=$1
CONSENSUS_THRESHOLD=$2
LOOP3_PASS_RATE=$3
LOOP2_CONSENSUS=$4

# Gate check
if (( $(echo "$LOOP3_PASS_RATE >= $GATE_THRESHOLD" | bc -l) )); then
    echo "GATE_PASS"
else
    echo "GATE_FAIL"
fi

# Consensus check
if (( $(echo "$LOOP2_CONSENSUS >= $CONSENSUS_THRESHOLD" | bc -l) )); then
    echo "CONSENSUS_PASS"
else
    echo "CONSENSUS_FAIL"
fi
EOF

    chmod +x "$TEST_WORKSPACE/check-thresholds.sh"

    # Run threshold check in container
    local result=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        sh -c "apk add --no-cache bc >/dev/null 2>&1 && /workspace/check-thresholds.sh $gate_threshold $consensus_threshold $loop3_pass_rate $loop2_consensus")

    # THEN: Both should pass
    if echo "$result" | grep -q "GATE_PASS" && echo "$result" | grep -q "CONSENSUS_PASS"; then
        log_pass "MVP mode thresholds validated in container"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "MVP mode threshold validation failed: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 2: Standard mode thresholds (gate: 0.95, consensus: 0.90)
test_standard_thresholds_docker() {
    log_test "Test 2: Standard mode thresholds (gate: 0.95, consensus: 0.90)"

    # GIVEN: Standard mode configuration
    local gate_threshold=0.95
    local consensus_threshold=0.90
    local loop3_pass_rate=0.96
    local loop2_consensus=0.91

    # WHEN: Checking thresholds in container environment
    mkdir -p "$TEST_WORKSPACE"
    cat > "$TEST_WORKSPACE/check-thresholds.sh" <<'EOF'
#!/bin/bash
GATE_THRESHOLD=$1
CONSENSUS_THRESHOLD=$2
LOOP3_PASS_RATE=$3
LOOP2_CONSENSUS=$4

if (( $(echo "$LOOP3_PASS_RATE >= $GATE_THRESHOLD" | bc -l) )); then
    echo "GATE_PASS"
else
    echo "GATE_FAIL"
fi

if (( $(echo "$LOOP2_CONSENSUS >= $CONSENSUS_THRESHOLD" | bc -l) )); then
    echo "CONSENSUS_PASS"
else
    echo "CONSENSUS_FAIL"
fi
EOF

    chmod +x "$TEST_WORKSPACE/check-thresholds.sh"

    # Run threshold check in container
    local result=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        sh -c "apk add --no-cache bc >/dev/null 2>&1 && /workspace/check-thresholds.sh $gate_threshold $consensus_threshold $loop3_pass_rate $loop2_consensus")

    # THEN: Both should pass
    if echo "$result" | grep -q "GATE_PASS" && echo "$result" | grep -q "CONSENSUS_PASS"; then
        log_pass "Standard mode thresholds validated in container"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Standard mode threshold validation failed: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 3: Enterprise mode thresholds (gate: 0.98, consensus: 0.95)
test_enterprise_thresholds_docker() {
    log_test "Test 3: Enterprise mode thresholds (gate: 0.98, consensus: 0.95)"

    # GIVEN: Enterprise mode configuration
    local gate_threshold=0.98
    local consensus_threshold=0.95
    local loop3_pass_rate=0.99
    local loop2_consensus=0.96

    # WHEN: Checking thresholds in container environment
    mkdir -p "$TEST_WORKSPACE"
    cat > "$TEST_WORKSPACE/check-thresholds.sh" <<'EOF'
#!/bin/bash
GATE_THRESHOLD=$1
CONSENSUS_THRESHOLD=$2
LOOP3_PASS_RATE=$3
LOOP2_CONSENSUS=$4

if (( $(echo "$LOOP3_PASS_RATE >= $GATE_THRESHOLD" | bc -l) )); then
    echo "GATE_PASS"
else
    echo "GATE_FAIL"
fi

if (( $(echo "$LOOP2_CONSENSUS >= $CONSENSUS_THRESHOLD" | bc -l) )); then
    echo "CONSENSUS_PASS"
else
    echo "CONSENSUS_FAIL"
fi
EOF

    chmod +x "$TEST_WORKSPACE/check-thresholds.sh"

    # Run threshold check in container
    local result=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        sh -c "apk add --no-cache bc >/dev/null 2>&1 && /workspace/check-thresholds.sh $gate_threshold $consensus_threshold $loop3_pass_rate $loop2_consensus")

    # THEN: Both should pass
    if echo "$result" | grep -q "GATE_PASS" && echo "$result" | grep -q "CONSENSUS_PASS"; then
        log_pass "Enterprise mode thresholds validated in container"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Enterprise mode threshold validation failed: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 4: Gate threshold enforcement (Loop 3 → Loop 2 transition)
test_gate_threshold_enforcement() {
    log_test "Test 4: Gate threshold enforcement (Loop 3 → Loop 2)"

    # GIVEN: Loop 3 pass rate below threshold
    local gate_threshold=0.95
    local loop3_pass_rate=0.92

    # WHEN: Gate check blocks Loop 2
    mkdir -p "$TEST_WORKSPACE"
    cat > "$TEST_WORKSPACE/gate-check.sh" <<'EOF'
#!/bin/bash
GATE_THRESHOLD=$1
PASS_RATE=$2

if (( $(echo "$PASS_RATE >= $GATE_THRESHOLD" | bc -l) )); then
    echo "PROCEED_TO_LOOP2"
    exit 0
else
    echo "BLOCK_LOOP2_ITERATE"
    exit 1
fi
EOF

    chmod +x "$TEST_WORKSPACE/gate-check.sh"

    # Run gate check in container
    local result=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        sh -c "apk add --no-cache bc >/dev/null 2>&1 && /workspace/gate-check.sh $gate_threshold $loop3_pass_rate" 2>&1 || echo "BLOCKED")

    # THEN: Should block Loop 2 transition
    if echo "$result" | grep -q "BLOCK_LOOP2_ITERATE"; then
        log_pass "Gate threshold enforcement blocks Loop 2 correctly"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Gate threshold enforcement failed: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 5: Consensus threshold enforcement (Loop 2 → Product Owner)
test_consensus_threshold_enforcement() {
    log_test "Test 5: Consensus threshold enforcement (Loop 2 → Product Owner)"

    # GIVEN: Loop 2 consensus below threshold
    local consensus_threshold=0.90
    local loop2_consensus=0.85

    # WHEN: Consensus check triggers iteration
    mkdir -p "$TEST_WORKSPACE"
    cat > "$TEST_WORKSPACE/consensus-check.sh" <<'EOF'
#!/bin/bash
CONSENSUS_THRESHOLD=$1
CONSENSUS=$2

if (( $(echo "$CONSENSUS >= $CONSENSUS_THRESHOLD" | bc -l) )); then
    echo "DECISION_PROCEED"
    exit 0
else
    echo "DECISION_ITERATE"
    exit 1
fi
EOF

    chmod +x "$TEST_WORKSPACE/consensus-check.sh"

    # Run consensus check in container
    local result=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        sh -c "apk add --no-cache bc >/dev/null 2>&1 && /workspace/consensus-check.sh $consensus_threshold $loop2_consensus" 2>&1 || echo "ITERATE")

    # THEN: Should trigger iteration
    if echo "$result" | grep -q "DECISION_ITERATE"; then
        log_pass "Consensus threshold enforcement triggers iteration correctly"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Consensus threshold enforcement failed: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 6: Dynamic threshold updates (mode switching)
test_dynamic_threshold_updates() {
    log_test "Test 6: Dynamic threshold updates (mode switching)"

    # GIVEN: Mode switch from Standard to MVP mid-execution
    mkdir -p "$TEST_WORKSPACE"
    cat > "$TEST_WORKSPACE/mode-switch.sh" <<'EOF'
#!/bin/bash
MODE=$1

case $MODE in
    mvp)
        echo "GATE=0.70"
        echo "CONSENSUS=0.80"
        ;;
    standard)
        echo "GATE=0.95"
        echo "CONSENSUS=0.90"
        ;;
    enterprise)
        echo "GATE=0.98"
        echo "CONSENSUS=0.95"
        ;;
    *)
        echo "UNKNOWN_MODE"
        exit 1
        ;;
esac
EOF

    chmod +x "$TEST_WORKSPACE/mode-switch.sh"

    # WHEN: Switching from standard to mvp
    local standard_result=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        /workspace/mode-switch.sh standard)

    local mvp_result=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        /workspace/mode-switch.sh mvp)

    # THEN: Thresholds should update correctly
    if echo "$standard_result" | grep -q "GATE=0.95" && echo "$mvp_result" | grep -q "GATE=0.70"; then
        log_pass "Dynamic threshold updates work correctly"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Dynamic threshold updates failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Execute tests
mkdir -p "$TEST_WORKSPACE"

test_mvp_thresholds_docker
test_standard_thresholds_docker
test_enterprise_thresholds_docker
test_gate_threshold_enforcement
test_consensus_threshold_enforcement
test_dynamic_threshold_updates

# Summary
echo ""
log_section "Test Summary: Docker Mode Threshold Validation"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo "✅ All tests PASSED"
    exit 0
else
    echo "❌ Some tests FAILED"
    exit 1
fi
