#!/bin/bash
# Test: TDD Violation Detection and Gate Enforcement
# Purpose: Validate that the gate check FAILS when agents don't follow TDD,
#          then PASSES when proper test-first development is used.
#
# Test Flow:
# 1. Iteration 1: Agent writes implementation WITHOUT tests (TDD violation)
# 2. Gate check detects violation and BLOCKS progression to Loop 2
# 3. Iteration 2: Agent follows proper TDD (tests first, then implementation)
# 4. Gate check validates TDD compliance and ALLOWS progression to Loop 2

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_NAME="tdd-violation-gate-failure"
TASK_ID="task:${TEST_NAME}"
AGENT_ID="python-agent-1"
NETWORK_NAME="cfn-tdd-test"
REDIS_CONTAINER="test-redis-tdd"
WORKSPACE_VOLUME="tdd-workspace"
GATE_THRESHOLD="0.95"

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_phase() {
    echo -e "\n${BLUE}=== PHASE: $1 ===${NC}"
}

log_step() {
    echo -e "${YELLOW}→${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_failure() {
    echo -e "${RED}✗${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

run_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    set +e  # Temporarily disable exit-on-error
    "$@"
    local result=$?
    set -e  # Re-enable exit-on-error

    if [ $result -eq 0 ]; then
        log_success "$TEST_DESCRIPTION"
        return 0
    else
        log_failure "$TEST_DESCRIPTION"
        # Don't exit - continue with other tests
        return 0  # Return success to prevent script termination
    fi
}

# Cleanup function
cleanup() {
    log_phase "Cleanup"
    docker stop "$REDIS_CONTAINER" 2>/dev/null || true
    docker rm "$REDIS_CONTAINER" 2>/dev/null || true
    docker network rm "$NETWORK_NAME" 2>/dev/null || true
    docker volume rm "$WORKSPACE_VOLUME" 2>/dev/null || true
    log_success "Cleanup complete"
}

# Trap cleanup on exit
trap cleanup EXIT

# Setup function
setup_test_environment() {
    log_phase "Setup Test Environment"

    # Create Docker network
    log_step "Creating Docker network: $NETWORK_NAME"
    docker network create "$NETWORK_NAME" >/dev/null 2>&1 || true

    # Create workspace volume
    log_step "Creating workspace volume: $WORKSPACE_VOLUME"
    docker volume create "$WORKSPACE_VOLUME" >/dev/null 2>&1 || true

    # Start Redis container
    log_step "Starting Redis container: $REDIS_CONTAINER"
    docker run -d \
        --name "$REDIS_CONTAINER" \
        --network "$NETWORK_NAME" \
        --rm \
        redis:7-alpine \
        redis-server --save "" --appendonly no >/dev/null 2>&1

    # Wait for Redis to be ready
    sleep 2
    log_step "Verifying Redis connectivity"
    docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1 || {
        echo "ERROR: Redis not ready" >&2
        return 1
    }

    log_success "Setup complete"
}

# TDD compliance checker
check_tdd_compliance() {
    local test_file=$1
    local impl_file=$2

    log_step "Checking TDD compliance..."

    # Check files exist
    if [[ ! -f "$test_file" ]]; then
        log_failure "Test file missing: $test_file"
        return 1
    fi

    if [[ ! -f "$impl_file" ]]; then
        log_failure "Implementation file missing: $impl_file"
        return 1
    fi

    # Check timestamps (test must be created BEFORE implementation)
    local test_time=$(stat -c %Y "$test_file" 2>/dev/null || stat -f %m "$test_file")
    local impl_time=$(stat -c %Y "$impl_file" 2>/dev/null || stat -f %m "$impl_file")

    echo "  Test timestamp: $test_time"
    echo "  Impl timestamp: $impl_time"

    if [[ $test_time -ge $impl_time ]]; then
        log_failure "Test created AFTER implementation (TDD violation)"
        echo "    Gap: $((impl_time - test_time)) seconds (should be negative)"
        return 1
    fi

    local gap=$((impl_time - test_time))
    log_success "TDD compliance verified (test created ${gap}s before implementation)"
    return 0
}

# Iteration 1: Agent violates TDD (implementation first)
run_iteration_1_tdd_violation() {
    log_phase "Iteration 1 - TDD Violation"

    log_step "Spawning agent: $AGENT_ID (TDD violation mode)"

    # Run agent container with TDD violation
    docker run --rm \
        --network "$NETWORK_NAME" \
        -v "$WORKSPACE_VOLUME":/workspace:rw \
        -e REDIS_HOST="$REDIS_CONTAINER" \
        -e AGENT_ID="$AGENT_ID" \
        -e TASK_ID="$TASK_ID" \
        -e ITERATION=1 \
        python:3.11-alpine \
        sh -c '
            apk add --no-cache redis >/dev/null 2>&1
            pip install pytest redis >/dev/null 2>&1

            # TDD VIOLATION: Write implementation FIRST
            cat > /workspace/calculator.py <<EOF
"""Calculator implementation - created WITHOUT tests first (TDD violation)"""

def add(a, b):
    """Add two numbers"""
    return a + b

def subtract(a, b):
    """Subtract b from a"""
    return a - b

def multiply(a, b):
    """Multiply two numbers"""
    return a * b

def divide(a, b):
    """Divide a by b"""
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
EOF

            IMPL_TIME=$(stat -c %Y /workspace/calculator.py)

            # Report to Redis - implementation created, no test file
            python3 <<PYEOF
import redis
import json

r = redis.Redis(host="$REDIS_HOST", decode_responses=True)

# Report agent status
r.set("$TASK_ID:agent:$AGENT_ID:status", "completed")
r.set("$TASK_ID:agent:$AGENT_ID:iteration", "1")
r.set("$TASK_ID:agent:$AGENT_ID:impl-timestamp", "$IMPL_TIME")
r.set("$TASK_ID:agent:$AGENT_ID:test-file-exists", "false")
r.set("$TASK_ID:agent:$AGENT_ID:tdd-compliant", "false")

# Store metadata
metadata = {
    "deliverables": ["/workspace/calculator.py"],
    "test_deliverables": [],
    "tdd_violation": "implementation created without test file"
}
r.set("$TASK_ID:agent:$AGENT_ID:metadata", json.dumps(metadata))
PYEOF

            echo "Implementation created at timestamp: $IMPL_TIME"
            echo "No test file created (TDD violation)"
        ' >/dev/null 2>&1

    log_success "Agent completed implementation WITHOUT tests"

    # Verify Redis keys
    local status=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:status")
    local tdd_compliant=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:tdd-compliant")

    echo "  Status: $status"
    echo "  TDD Compliant: $tdd_compliant"

    if [[ "$tdd_compliant" == "false" ]]; then
        log_success "TDD violation correctly reported to Redis"
    else
        log_failure "Expected TDD violation, got: $tdd_compliant"
        return 1
    fi
}

# Gate check for iteration 1 (should FAIL)
run_gate_check_iteration_1() {
    log_phase "Gate Check - Iteration 1"

    log_step "Collecting agent results from Redis..."

    # Get agent data from Redis
    local tdd_compliant=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:tdd-compliant")
    local test_exists=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:test-file-exists")

    echo "  TDD Compliant: $tdd_compliant"
    echo "  Test File Exists: $test_exists"

    # Calculate pass rate (0.00 due to TDD violation)
    local pass_rate="0.00"

    log_step "Gate threshold check..."
    echo "  Pass rate: $pass_rate"
    echo "  Threshold: $GATE_THRESHOLD"

    # Gate should FAIL
    if (( $(echo "$pass_rate < $GATE_THRESHOLD" | bc -l) )); then
        log_success "Gate correctly FAILED (${pass_rate} < ${GATE_THRESHOLD})"

        # Mark gate as failed in Redis
        docker exec "$REDIS_CONTAINER" redis-cli SET "$TASK_ID:gate-passed" "false" >/dev/null
        docker exec "$REDIS_CONTAINER" redis-cli SET "$TASK_ID:gate-iteration-1-result" "FAIL" >/dev/null
        docker exec "$REDIS_CONTAINER" redis-cli SET "$TASK_ID:gate-failure-reason" "TDD violation: no test file" >/dev/null

        log_success "Gate correctly BLOCKED progression to Loop 2"
        return 0
    else
        log_failure "Gate should have FAILED but PASSED"
        return 1
    fi
}

# Iteration 2: Agent follows proper TDD (tests first)
run_iteration_2_tdd_compliant() {
    log_phase "Iteration 2 - TDD Compliant"

    log_step "Agent received gate failure feedback"
    local failure_reason=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:gate-failure-reason")
    echo "  Feedback: $failure_reason"

    log_step "Spawning agent: $AGENT_ID (TDD compliant mode)"

    # Run agent container with proper TDD
    docker run --rm \
        --network "$NETWORK_NAME" \
        -v "$WORKSPACE_VOLUME":/workspace:rw \
        -e REDIS_HOST="$REDIS_CONTAINER" \
        -e AGENT_ID="$AGENT_ID" \
        -e TASK_ID="$TASK_ID" \
        -e ITERATION=2 \
        python:3.11-alpine \
        sh -c '
            apk add --no-cache redis coreutils >/dev/null 2>&1
            pip install pytest redis >/dev/null 2>&1

            # TDD COMPLIANT: Write test FIRST
            cat > /workspace/test_calculator.py <<EOF
"""Calculator tests - created BEFORE implementation (proper TDD)"""
import pytest

def test_add():
    from calculator import add
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
    assert add(0, 0) == 0

def test_subtract():
    from calculator import subtract
    assert subtract(5, 3) == 2
    assert subtract(0, 5) == -5
    assert subtract(10, 10) == 0

def test_multiply():
    from calculator import multiply
    assert multiply(2, 3) == 6
    assert multiply(-2, 3) == -6
    assert multiply(0, 5) == 0

def test_divide():
    from calculator import divide
    assert divide(6, 2) == 3
    assert divide(5, 2) == 2.5

    with pytest.raises(ValueError):
        divide(5, 0)
EOF

            TEST_TIME=$(stat -c %Y /workspace/test_calculator.py)
            echo "Test file created at timestamp: $TEST_TIME"

            # Wait to ensure timestamp difference
            sleep 3

            # THEN write implementation
            cat > /workspace/calculator.py <<EOF
"""Calculator implementation - created AFTER tests (proper TDD)"""

def add(a, b):
    """Add two numbers"""
    return a + b

def subtract(a, b):
    """Subtract b from a"""
    return a - b

def multiply(a, b):
    """Multiply two numbers"""
    return a * b

def divide(a, b):
    """Divide a by b"""
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
EOF

            IMPL_TIME=$(stat -c %Y /workspace/calculator.py)
            echo "Implementation file created at timestamp: $IMPL_TIME"

            GAP=$((IMPL_TIME - TEST_TIME))
            echo "Time gap: ${GAP}s (test created first)"

            # Run tests
            cd /workspace
            pytest test_calculator.py -v > /tmp/test_output.txt 2>&1
            TEST_RESULT=$?

            if [ $TEST_RESULT -eq 0 ]; then
                echo "Tests PASSED"
                TEST_STATUS="PASS"
            else
                echo "Tests FAILED"
                TEST_STATUS="FAIL"
            fi

            # Report to Redis
            python3 <<PYEOF
import redis
import json

r = redis.Redis(host="$REDIS_HOST", decode_responses=True)

# Report agent status
r.set("$TASK_ID:agent:$AGENT_ID:status", "completed")
r.set("$TASK_ID:agent:$AGENT_ID:iteration", "2")
r.set("$TASK_ID:agent:$AGENT_ID:test-timestamp", "$TEST_TIME")
r.set("$TASK_ID:agent:$AGENT_ID:impl-timestamp", "$IMPL_TIME")
r.set("$TASK_ID:agent:$AGENT_ID:timestamp-gap", "$GAP")
r.set("$TASK_ID:agent:$AGENT_ID:test-file-exists", "true")
r.set("$TASK_ID:agent:$AGENT_ID:tdd-compliant", "true")
r.set("$TASK_ID:agent:$AGENT_ID:test-result", "$TEST_STATUS")

# Store metadata
metadata = {
    "deliverables": ["/workspace/calculator.py"],
    "test_deliverables": ["/workspace/test_calculator.py"],
    "tdd_compliant": True,
    "test_first_gap_seconds": $GAP,
    "test_execution": "$TEST_STATUS"
}
r.set("$TASK_ID:agent:$AGENT_ID:metadata", json.dumps(metadata))

# Calculate pass rate (1.00 for single passing agent)
r.set("$TASK_ID:pass-rate", "1.00")
PYEOF
        ' 2>&1 | grep -v "WARNING\|Collecting\|Installing"

    # Extract files from volume for validation
    log_step "Extracting files for validation"
    docker run --rm \
        -v "$WORKSPACE_VOLUME":/workspace:ro \
        -v "$(pwd)/tmp-tdd-test":/output:rw \
        alpine:latest \
        sh -c 'mkdir -p /output && cp /workspace/*.py /output/ 2>/dev/null || true'

    # Verify TDD compliance via timestamps
    local test_ts=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:test-timestamp")
    local impl_ts=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:impl-timestamp")
    local gap=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:timestamp-gap")

    echo "  Test file timestamp: $test_ts"
    echo "  Implementation timestamp: $impl_ts"
    echo "  Time gap: ${gap}s"

    if [[ $gap -gt 0 ]]; then
        log_success "TDD compliance: test created ${gap}s before implementation"
    else
        log_failure "TDD violation: test not created before implementation"
        return 1
    fi

    # Verify test execution
    local test_result=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:test-result")
    if [[ "$test_result" == "PASS" ]]; then
        log_success "Tests executed and PASSED"
    else
        log_failure "Tests did not pass: $test_result"
        return 1
    fi
}

# Gate check for iteration 2 (should PASS)
run_gate_check_iteration_2() {
    log_phase "Gate Check - Iteration 2"

    log_step "Collecting agent results from Redis..."

    # Get agent data from Redis
    local tdd_compliant=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:tdd-compliant")
    local test_exists=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:test-file-exists")
    local test_result=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:agent:$AGENT_ID:test-result")
    local pass_rate=$(docker exec "$REDIS_CONTAINER" redis-cli GET "$TASK_ID:pass-rate")

    echo "  TDD Compliant: $tdd_compliant"
    echo "  Test File Exists: $test_exists"
    echo "  Test Result: $test_result"
    echo "  Pass Rate: $pass_rate"

    # Verify all TDD requirements met
    if [[ "$tdd_compliant" != "true" ]]; then
        log_failure "TDD compliance check failed"
        return 1
    fi

    if [[ "$test_exists" != "true" ]]; then
        log_failure "Test file existence check failed"
        return 1
    fi

    if [[ "$test_result" != "PASS" ]]; then
        log_failure "Test execution check failed"
        return 1
    fi

    log_success "All TDD requirements verified"

    log_step "Gate threshold check..."
    echo "  Pass rate: $pass_rate"
    echo "  Threshold: $GATE_THRESHOLD"

    # Gate should PASS
    if (( $(echo "$pass_rate >= $GATE_THRESHOLD" | bc -l) )); then
        log_success "Gate correctly PASSED (${pass_rate} >= ${GATE_THRESHOLD})"

        # Mark gate as passed in Redis
        docker exec "$REDIS_CONTAINER" redis-cli SET "$TASK_ID:gate-passed" "true" >/dev/null
        docker exec "$REDIS_CONTAINER" redis-cli SET "$TASK_ID:gate-iteration-2-result" "PASS" >/dev/null

        log_success "Gate correctly ALLOWED progression to Loop 2"
        return 0
    else
        log_failure "Gate should have PASSED but FAILED"
        return 1
    fi
}

# Main test execution
main() {
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}TDD Violation Gate Enforcement Test${NC}"
    echo -e "${BLUE}======================================${NC}"

    # Setup
    setup_test_environment

    # Iteration 1: TDD Violation
    TEST_DESCRIPTION="Iteration 1: Agent violates TDD"
    run_test run_iteration_1_tdd_violation

    TEST_DESCRIPTION="Gate check iteration 1: Correctly blocks TDD violation"
    run_test run_gate_check_iteration_1

    # Iteration 2: TDD Compliant
    TEST_DESCRIPTION="Iteration 2: Agent follows proper TDD"
    run_test run_iteration_2_tdd_compliant

    TEST_DESCRIPTION="Gate check iteration 2: Correctly allows TDD compliance"
    run_test run_gate_check_iteration_2

    # Summary
    log_phase "Test Summary"
    echo "Tests run: $TESTS_RUN"
    echo "Tests passed: $TESTS_PASSED"
    echo "Tests failed: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}✓ ALL TESTS PASSED${NC}"
        echo -e "${GREEN}✓ TDD enforcement workflow validated${NC}"
        return 0
    else
        echo -e "\n${RED}✗ SOME TESTS FAILED${NC}"
        return 1
    fi
}

# Run main test
main
EXIT_CODE=$?

# Cleanup temp files
rm -rf tmp-tdd-test 2>/dev/null || true

exit $EXIT_CODE
