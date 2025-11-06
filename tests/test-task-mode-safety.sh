#!/bin/bash
# CFN Task Mode Safety - Comprehensive Test Suite
# Tests ANTI-023 Memory Leak Protection System

set -e -u

# Test configuration
TEST_DIR="/tmp/cfn-task-mode-safety-tests"
LOG_FILE="$TEST_DIR/test.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.claude/skills/cfn-task-mode-safety" && pwd)"

# Setup test environment
setup_test_environment() {
    echo "🧪 Setting up test environment..."
    mkdir -p "$TEST_DIR"
    mkdir -p "$TEST_DIR/audit/task-mode"
    mkdir -p "$TEST_DIR/task-signals"
    mkdir -p "$TEST_DIR/background"

    # Copy test scripts
    cp "$SCRIPT_DIR/mode-detection.sh" "$TEST_DIR/"
    cp "$SCRIPT_DIR/cli-coordination.sh" "$TEST_DIR/"

    # Set up test Redis (use in-memory instance)
    redis-cli -h localhost -p 6379 FLUSHDB > /dev/null 2>&1 || true

    echo "✅ Test environment setup complete"
}

# Cleanup test environment
cleanup_test_environment() {
    echo "🧹 Cleaning up test environment..."

    # Clean up test files
    rm -rf "$TEST_DIR" > /dev/null 2>&1 || true

    # Clean up test Redis data
    redis-cli -h localhost -p 6379 FLUSHDB > /dev/null 2>&1 || true

    echo "✅ Test environment cleanup complete"
}

# Test Mode Detection
test_mode_detection() {
    echo "🔍 Testing mode detection..."

    # Test 1: Task mode detection (default)
    unset TASK_ID AGENT_ID CFN_MODE
    cd "$TEST_DIR"

    local task_mode_output=$(bash -c "source mode-detection.sh; is_task_mode && echo 'YES' || echo 'NO'")
    if [[ "$task_mode_output" == "YES" ]]; then
        echo "✅ Task mode detection passed"
    else
        echo "❌ Task mode detection failed"
        return 1
    fi

    # Test 2: CLI mode detection
    export TASK_ID="test-123" AGENT_ID="agent-001"
    local cli_mode_output=$(bash -c "source mode-detection.sh; is_cli_mode && echo 'YES' || echo 'NO'")
    if [[ "$cli_mode_output" == "YES" ]]; then
        echo "✅ CLI mode detection passed"
    else
        echo "❌ CLI mode detection failed"
        return 1
    fi

    # Test 3: Environment variable mode
    export CFN_MODE="task"
    local env_mode_output=$(bash -c "source mode-detection.sh; detect_execution_mode")
    if [[ "$env_mode_output" == "task" ]]; then
        echo "✅ Environment variable mode detection passed"
    else
        echo "❌ Environment variable mode detection failed"
        return 1
    fi

    # Clean up environment variables
    unset TASK_ID AGENT_ID CFN_MODE

    echo "✅ Mode detection tests passed"
}

# Test Mode Enforcement
test_mode_enforcement() {
    echo "🚨 Testing mode enforcement..."

    cd "$TEST_DIR"

    # Test 1: Task mode should block Redis operations
    unset TASK_ID AGENT_ID

    # Mock a Redis operation that should fail in Task mode
    local enforcement_result=$(bash -c "source mode-detection.sh; enforce_mode_compliance 'redis_cli'" 2>&1 || echo "BLOCKED")

    if [[ "$enforcement_result" == *"BLOCKED"* ]]; then
        echo "✅ Task mode enforcement passed (Redis blocked)"
    else
        echo "❌ Task mode enforcement failed (Redis not blocked)"
        return 1
    fi

    # Test 2: CLI mode should allow Redis operations
    export TASK_ID="test-123" AGENT_ID="agent-001"

    # Mock a Redis operation that should succeed in CLI mode
    local cli_enforcement_result=$(bash -c "source mode-detection.sh; enforce_mode_compliance 'redis_cli'" 2>&1 || echo "BLOCKED")

    if [[ "$cli_enforcement_result" != *"BLOCKED"* ]]; then
        echo "✅ CLI mode enforcement passed (Redis allowed)"
    else
        echo "❌ CLI mode enforcement failed (Redis blocked in CLI mode)"
        return 1
    fi

    # Clean up environment variables
    unset TASK_ID AGENT_ID

    echo "✅ Mode enforcement tests passed"
}

# Test Task Mode Completion Protocol
test_task_mode_completion() {
    echo "✅ Testing Task mode completion protocol..."

    cd "$TEST_DIR"
    unset TASK_ID AGENT_ID

    # Test 1: Valid completion output
    local completion_output=$(bash -c "source mode-detection.sh; task_mode_complete 0.85 'COMPLETE' 'Work done' 'file1.js' 'file2.js'")

    # Validate JSON structure
    if echo "$completion_output" | grep -q '"confidence": 0.85' && \
       echo "$completion_output" | grep -q '"status": "COMPLETE"' && \
       echo "$completion_output" | grep -q '"deliverables"'; then
        echo "✅ Task mode completion structure valid"
    else
        echo "❌ Task mode completion structure invalid"
        echo "Output: $completion_output"
        return 1
    fi

    # Test 2: Invalid confidence value
    local invalid_result=$(bash -c "source mode-detection.sh; task_mode_complete 1.5 'COMPLETE' 'Test' 2>&1" || echo "ERROR")

    if [[ "$invalid_result" == *"Invalid confidence value"* ]]; then
        echo "✅ Invalid confidence validation passed"
    else
        echo "❌ Invalid confidence validation failed"
        return 1
    fi

    # Test 3: No deliverables
    local no_deliverables=$(bash -c "source mode-detection.sh; task_mode_complete 0.90 'COMPLETE' 'Work done'")

    if echo "$no_deliverables" | grep -q '"mode": "task"' && \
       ! echo "$no_deliverables" | grep -q '"deliverables": \[\]'; then
        echo "✅ No deliverables case handled correctly"
    else
        echo "❌ No deliverables case failed"
        return 1
    fi

    echo "✅ Task mode completion tests passed"
}

# Task Mode Audit Logging
test_task_mode_audit() {
    echo "📝 Testing Task mode audit logging..."

    cd "$TEST_DIR"
    unset TASK_ID AGENT_ID

    # Test audit logging
    local test_data='{"event": "test", "data": "test_value"}'
    bash -c "source mode-detection.sh; task_mode_audit 'test' '$test_data'" 2>/dev/null

    # Check if audit file was created
    local audit_files=("$TEST_DIR/audit/task-mode/"*.json)
    if [[ ${#audit_files[@]} -gt 0 ]]; then
        local audit_file="${audit_files[0]}"
        if grep -q '"event": "test"' "$audit_file" && \
           grep -q '"mode": "task"' "$audit_file"; then
            echo "✅ Task mode audit logging passed"
        else
            echo "❌ Task mode audit logging failed"
            echo "Audit file content:"
            cat "$audit_file"
            return 1
        fi
    else
        echo "❌ Task mode audit file not created"
        return 1
    fi

    echo "✅ Task mode audit tests passed"
}

# Test Task Mode Fallback
test_task_mode_fallback() {
    echo "🔄 Testing Task mode fallback mechanisms..."

    cd "$TEST_DIR"
    unset TASK_ID AGENT_ID

    # Test 1: Task mode fallback for completion signal
    local signal_file="$TEST_DIR/task-signals/test_unknown_agent_complete.json"

    # Mock task mode fallback
    bash -c "source mode-detection.sh; cfn_coordination_safe 'signal-complete' 'test' 'unknown-agent'" 2>/dev/null

    if [[ -f "$signal_file" ]]; then
        if grep -q '"signal": "complete"' "$signal_file" && \
           grep -q '"mode": "task"' "$signal_file"; then
            echo "✅ Task mode fallback signal passed"
        else
            echo "❌ Task mode fallback signal failed"
            return 1
        fi
    else
        echo "❌ Task mode fallback signal file not created"
        return 1
    fi

    # Test 2: Task mode fallback for confidence storage
    local confidence_file="$TEST_DIR/task-signals/test_unknown_agent_confidence.json"

    bash -c "source mode-detection.sh; cfn_coordination_safe 'store-confidence' 'test' 'unknown-agent' 0.75" 2>/dev/null

    if [[ -f "$confidence_file" ]]; then
        if grep -q '"confidence": 0.75' "$confidence_file" && \
           grep -q '"mode": "task"' "$confidence_file"; then
            echo "✅ Task mode fallback confidence passed"
        else
            echo "❌ Task mode fallback confidence failed"
            return 1
        fi
    else
        echo "❌ Task mode fallback confidence file not created"
        return 1
    fi

    echo "✅ Task mode fallback tests passed"
}

# Test CLI Mode Coordination
test_cli_mode_coordination() {
    echo "🔗 Testing CLI mode coordination..."

    cd "$TEST_DIR"

    # Set up CLI mode
    export TASK_ID="cli-test-123" AGENT_ID="cli-agent-001"

    # Test 1: Redis connection check
    local connection_result=$(bash -c "source cli-coordination.sh; redis_check_connection" 2>&1 || echo "FAILED")

    if [[ "$connection_result" == *"✅ Redis connection"* ]]; then
        echo "✅ CLI mode Redis connection passed"
    else
        echo "❌ CLI mode Redis connection failed"
        echo "Result: $connection_result"
        return 1
    fi

    # Test 2: Agent completion signaling
    if bash -c "source cli-coordination.sh; cfn_signal_agent_complete 'cli-test-123' 'cli-agent-001'" 2>/dev/null; then
        echo "✅ CLI mode agent signaling passed"
    else
        echo "❌ CLI mode agent signaling failed"
        return 1
    fi

    # Test 3: Confidence storage
    if bash -c "source cli-coordination.sh; cfn_store_agent_confidence 'cli-test-123' 'cli-agent-001' 0.90" 2>/dev/null; then
        echo "✅ CLI mode confidence storage passed"
    else
        echo "❌ CLI mode confidence storage failed"
        return 1
    fi

    # Test 4: Result storage
    if bash -c "source cli-coordination.sh; cfn_store_agent_result 'cli-test-123' 'cli-agent-001' 0.90 2" 2>/dev/null; then
        echo "✅ CLI mode result storage passed"
    else
        echo "❌ CLI mode result storage failed"
        return 1
    fi

    # Test 5: Confidence score collection
    local collection_result=$(bash -c "source cli-coordination.sh; cfn_collect_confidence_scores 'cli-test-123' 'cli-agent-001' 0.75 1")

    if echo "$collection_result" | grep -q '"average_confidence"' && \
       echo "$collection_result" | grep -q '"passes_gate": true'; then
        echo "✅ CLI mode confidence collection passed"
    else
        echo "❌ CLI mode confidence collection failed"
        echo "Result: $collection_result"
        return 1
    fi

    # Clean up environment variables
    unset TASK_ID AGENT_ID

    echo "✅ CLI mode coordination tests passed"
}

# Test Integration Scenarios
test_integration_scenarios() {
    echo "🔧 Testing integration scenarios..."

    cd "$TEST_DIR"

    # Scenario 1: Task mode agent output validation
    unset TASK_ID AGENT_ID

    local task_output=$(bash -c "source mode-detection.sh; task_mode_complete 0.85 'COMPLETE' 'Integration test' 'integration.js'")

    if echo "$task_output" | grep -q '"mode": "task"' && \
       echo "$task_output" | grep -q '"confidence": 0.85'; then
        echo "✅ Task mode integration scenario passed"
    else
        echo "❌ Task mode integration scenario failed"
        return 1
    fi

    # Scenario 2: CLI mode coordination with task mode detection
    export TASK_ID="integration-test-123" AGENT_ID="integration-agent-001"

    # Test that CLI mode functions work
    local cli_works=$(bash -c "source mode-detection.sh; is_cli_mode && echo 'YES' || echo 'NO'")
    if [[ "$cli_works" == "YES" ]]; then
        echo "✅ CLI mode integration detection passed"
    else
        echo "❌ CLI mode integration detection failed"
        return 1
    fi

    # Clean up environment variables
    unset TASK_ID AGENT_ID

    echo "✅ Integration scenario tests passed"
}

# Run Performance Tests
test_performance() {
    echo "⚡ Running performance tests..."

    cd "$TEST_DIR"
    unset TASK_ID AGENT_ID

    # Test mode detection performance
    local start_time=$(date +%s%N)

    for i in {1..100}; do
        bash -c "source mode-detection.sh; detect_execution_mode" > /dev/null
    done

    local end_time=$(date +%s%N)
    local duration=$((($end_time - $start_time) / 1000000))  # Convert to milliseconds
    local avg_time=$(($duration / 100))

    if [[ $avg_time -lt 10 ]]; then
        echo "✅ Mode detection performance passed (${avg_time}ms average)"
    else
        echo "⚠️ Mode detection performance warning (${avg_time}ms average)"
    fi

    # Test JSON generation performance
    local json_start_time=$(date +%s%N)

    for i in {1..100}; do
        bash -c "source mode-detection.sh; task_mode_complete 0.$i 'COMPLETE' 'Perf test'" > /dev/null
    done

    local json_end_time=$(date +%s%N)
    local json_duration=$((($json_end_time - $json_start_time) / 1000000))
    local json_avg_time=$(($json_duration / 100))

    if [[ $json_avg_time -lt 20 ]]; then
        echo "✅ JSON generation performance passed (${json_avg_time}ms average)"
    else
        echo "⚠️ JSON generation performance warning (${json_avg_time}ms average)"
    fi

    echo "✅ Performance tests completed"
}

# Main test runner
main() {
    echo "🧪 CFN Task Mode Safety Test Suite"
    echo "====================================="
    echo "Test ID: $(date +%Y%m%d_%H%M%S)"
    echo "Test Directory: $TEST_DIR"
    echo ""

    # Setup
    setup_test_environment
    echo ""

    # Test suite
    local test_results=()

    run_test() {
        local test_name="$1"
        local test_command="$2"

        echo "🔬 Running $test_name..."
        if eval "$test_command"; then
            echo "✅ $test_name PASSED"
            test_results+=("PASS: $test_name")
            return 0
        else
            echo "❌ $test_name FAILED"
            test_results+=("FAIL: $test_name")
            return 1
        fi
        echo ""
    }

    # Execute all tests
    run_test "Mode Detection" "test_mode_detection"
    run_test "Mode Enforcement" "test_mode_enforcement"
    run_test "Task Mode Completion" "test_task_mode_completion"
    run_test "Task Mode Audit" "test_task_mode_audit"
    run_test "Task Mode Fallback" "test_task_mode_fallback"
    run_test "CLI Mode Coordination" "test_cli_mode_coordination"
    run_test "Integration Scenarios" "test_integration_scenarios"
    run_test "Performance Tests" "test_performance"

    # Results summary
    echo "📊 Test Results Summary"
    echo "======================"

    local pass_count=0
    local fail_count=0

    for result in "${test_results[@]}"; do
        if [[ "$result" == PASS:* ]]; then
            pass_count=$((pass_count + 1))
            echo "✅ $result"
        else
            fail_count=$((fail_count + 1))
            echo "❌ $result"
        fi
    done

    echo ""
    echo "Total Tests: $((pass_count + fail_count))"
    echo "Passed: $pass_count"
    echo "Failed: $fail_count"
    echo "Success Rate: $(echo "scale=1; $pass_count * 100 / ($pass_count + $fail_count)" | bc)%"

    # Determine overall result
    if [[ $fail_count -eq 0 ]]; then
        echo ""
        echo "🎉 ALL TESTS PASSED - ANTI-023 Memory Leak Protection System is working correctly!"
        return 0
    else
        echo ""
        echo "⚠️ SOME TESTS FAILED - Please review the implementation"
        return 1
    fi
}

# Cleanup on exit
trap cleanup_test_environment EXIT

# Run tests if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit $?
fi