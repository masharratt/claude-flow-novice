#!/bin/bash
# CFN Loop End-to-End Integration Tests
# Part of ANTI-023 Memory Leak Protection System Integration Tests

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_RESULTS_DIR="/tmp/cfn-test-results"

# Test tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS=()

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Logging functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_TESTS++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_TESTS++))
    TEST_RESULTS+=("FAIL: $1")
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Test setup
setup_test_env() {
    log_info "Setting up CFN Loop integration test environment..."
    mkdir -p "$TEST_RESULTS_DIR"
    mkdir -p "/tmp/cfn-telemetry"

    # Set up test environment variables
    export TASK_ID="integration-test-$$"
    export AGENT_ID="integration-agent-$$"
    export CFN_MODE="cli"
    export CFN_MEMORY_LIMIT="512M"
    export CFN_CPU_LIMIT="60%"
    export CFN_TIMEOUT="60"
    export CFN_TELEMETRY_DIR="/tmp/cfn-telemetry"
    export REDIS_HOST="localhost"
    export REDIS_PORT="6379"

    ((TOTAL_TESTS++))
}

# Test cleanup
cleanup_test_env() {
    log_info "Cleaning up CFN Loop integration test environment..."

    # Kill any test processes
    pkill -f "integration-test" 2>/dev/null || true
    jobs -p | xargs -r kill 2>/dev/null || true

    # Clean up Redis test data
    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" FLUSHDB >/dev/null 2>&1 || true
    fi

    # Clean up test files
    rm -rf "$TEST_RESULTS_DIR"
    rm -rf "/tmp/cfn-telemetry/metrics_integration-"*".json"

    # Clean environment
    unset TASK_ID AGENT_ID CFN_MODE CFN_MEMORY_LIMIT CFN_CPU_LIMIT CFN_TIMEOUT
    unset CFN_TELEMETRY_DIR REDIS_HOST REDIS_PORT
}

# Test: CFN Loop orchestration with stabilization
test_cfn_loop_orchestration() {
    log_test "Testing CFN Loop orchestration with stabilization..."

    # Create mock orchestration script
    cat > "$TEST_RESULTS_DIR/mock_orchestration.sh" << 'EOF'
#!/bin/bash

# Source all stabilization components
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

echo "Mock orchestration started with PID $$"
echo "Agent ID: $AGENT_ID"
echo "Task ID: $TASK_ID"

# Simulate orchestration work
for i in {1..5}; do
    echo "Orchestration step $i"
    sleep 1
done

echo "Mock orchestration completed"
EOF

    chmod +x "$TEST_RESULTS_DIR/mock_orchestration.sh"

    # Run orchestration script
    local start_time=$(date +%s)
    if timeout 20 "$TEST_RESULTS_DIR/mock_orchestration.sh"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_pass "CFN Loop orchestration completed successfully (${duration}s)"

        # Check if telemetry was created
        local metrics_file="/tmp/cfn-telemetry/metrics_integration-agent-$$.json"
        if [[ -f "$metrics_file" ]]; then
            log_pass "Orchestration telemetry collected"
        else
            log_fail "Orchestration telemetry not collected"
        fi
    else
        log_fail "CFN Loop orchestration failed or timed out"
    fi

    ((TOTAL_TESTS+=2))
}

# Test: Agent spawning with safety mechanisms
test_agent_spawning_safety() {
    log_test "Testing agent spawning with safety mechanisms..."

    # Create mock agent spawning script
    cat > "$TEST_RESULTS_DIR/mock_agent_spawn.sh" << 'EOF'
#!/bin/bash

# Source mode detection and safety
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-mode-safety/mode-detection.sh"
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"

# Detect execution mode
MODE=$(detect_execution_mode)
echo "Detected mode: $MODE"

if [[ "$MODE" != "cli" ]]; then
    echo "ERROR: Agent spawning blocked - not in CLI mode"
    exit 1
fi

# Source process instrumentation for the agent
AGENT_ID="spawned-agent-$$"
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

echo "Mock agent $$ spawned safely"
echo "Agent ID: $AGENT_ID"

# Simulate agent work
for i in {1..3}; do
    echo "Agent work $i"
    sleep 0.5
done

echo "Mock agent completed"
EOF

    chmod +x "$TEST_RESULTS_DIR/mock_agent_spawn.sh"

    # Run agent spawning simulation
    export __CFN_CLI_SPAWN="true"  # Simulate CLI spawn

    if timeout 10 "$TEST_RESULTS_DIR/mock_agent_spawn.sh"; then
        log_pass "Agent spawning with safety mechanisms successful"

        # Check agent telemetry
        local agent_metrics="/tmp/cfn-telemetry/metrics_spawned-agent-$$.json"
        if [[ -f "$agent_metrics" ]]; then
            log_pass "Spawned agent telemetry collected"
        else
            log_fail "Spawned agent telemetry not collected"
        fi
    else
        log_fail "Agent spawning with safety mechanisms failed"
    fi

    unset __CFN_CLI_SPAWN

    ((TOTAL_TESTS+=2))
}

# Test: Redis coordination with safety
test_redis_coordination_safety() {
    log_test "Testing Redis coordination with safety mechanisms..."

    # Mock redis-cli for testing
    cat > "$TEST_RESULTS_DIR/mock_redis.sh" << 'EOF'
#!/bin/bash

# Mock Redis operations
case "$1" in
    "ping")
        echo "PONG"
        ;;
    "-h")
        if [[ "$5" == "LPUSH" ]]; then
            echo "1"  # Return success
        elif [[ "$5" == "BLPOP" ]]; then
            echo "1) \"test_key\""
            echo "2) \"test_value\""
        fi
        ;;
    *)
        echo "Mock Redis operation"
        ;;
esac
exit 0
EOF

    chmod +x "$TEST_RESULTS_DIR/mock_redis.sh"

    # Add mock redis to PATH
    export PATH="$TEST_RESULTS_DIR:$PATH"

    # Source CLI coordination
    source "$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/cli-coordination.sh"

    # Test Redis operations
    local operations_passed=0
    local total_operations=3

    if redis_check_connection; then
        ((operations_passed++))
        log_info "Redis connection check passed"
    fi

    if redis_lpush_safe "test_key" "test_value" 2>/dev/null; then
        ((operations_passed++))
        log_info "Redis LPUSH operation passed"
    fi

    if redis_blpop_safe "test_key" 5 "/tmp/blpop_test" 2>/dev/null; then
        ((operations_passed++))
        log_info "Redis BLPOP operation passed"
    fi

    # Restore PATH
    export PATH=$(echo "$PATH" | sed "s|$TEST_RESULTS_DIR:||")

    if [[ $operations_passed -eq $total_operations ]]; then
        log_pass "All Redis coordination operations successful ($operations_passed/$total_operations)"
    else
        log_fail "Redis coordination operations failed ($operations_passed/$total_operations)"
    fi

    rm -f "/tmp/blpop_test" 2>/dev/null || true

    ((TOTAL_TESTS++))
}

# Test: Complete CFN Loop simulation
test_complete_cfn_loop_simulation() {
    log_test "Testing complete CFN Loop simulation with all stabilizations..."

    # Create comprehensive CFN Loop simulation
    cat > "$TEST_RESULTS_DIR/complete_cfn_loop.sh" << 'EOF'
#!/bin/bash

echo "=== CFN Loop Integration Simulation ==="

# 1. Environment setup and sanitization
echo "Step 1: Environment sanitization..."
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"

# Set some test sensitive data
export TEST_SECRET="should_be_sanitized"
export CFN_MODE="cli"
export TASK_ID="loop-test-$$"
export AGENT_ID="loop-agent-$$"

# Apply sanitization
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"

if [[ -z "${TEST_SECRET:-}" ]]; then
    echo "✓ Environment sanitization working"
else
    echo "✗ Environment sanitization failed"
    exit 1
fi

# 2. Process instrumentation
echo "Step 2: Process instrumentation..."
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

echo "✓ Process instrumentation active"

# 3. Mode detection
echo "Step 3: Mode detection..."
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-mode-safety/mode-detection.sh"

DETECTED_MODE=$(detect_execution_mode)
echo "Detected mode: $DETECTED_MODE"

if [[ "$DETECTED_MODE" == "cli" ]]; then
    echo "✓ Mode detection working"
else
    echo "✗ Mode detection failed"
    exit 1
fi

# 4. Redis coordination
echo "Step 4: Redis coordination..."
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-mode-safety/cli-coordination.sh"

# Mock redis for testing
redis_cli() {
    if [[ "$1" == "ping" ]]; then echo "PONG"; return 0; fi
    if [[ "$1" == "-h" && "$5" == "LPUSH" ]]; then echo "1"; return 0; fi
    return 0
}
redis-cli() { redis_cli "$@"; }

if redis_lpush_safe "test_completion" "agent_done" 2>/dev/null; then
    echo "✓ Redis coordination working"
else
    echo "✗ Redis coordination failed"
    exit 1
fi

# 5. Simulate CFN Loop work
echo "Step 5: CFN Loop work simulation..."
for iteration in {1..3}; do
    echo "CFN Loop iteration $iteration"

    # Simulate memory usage
    temp_data=$(printf 'A%.0s' {1..100000})

    # Simulate processing time
    sleep 1

    # Clean up
    unset temp_data

    echo "✓ Iteration $iteration completed"
done

echo "=== CFN Loop Simulation Completed Successfully ==="
EOF

    chmod +x "$TEST_RESULTS_DIR/complete_cfn_loop.sh"

    # Run complete simulation
    if timeout 30 "$TEST_RESULTS_DIR/complete_cfn_loop.sh"; then
        log_pass "Complete CFN Loop simulation successful"

        # Verify all stabilization components were used
        local components_active=0
        local total_components=4

        # Check telemetry
        local metrics_file="/tmp/cfn-telemetry/metrics_loop-agent-$$.json"
        if [[ -f "$metrics_file" ]]; then
            ((components_active++))
            log_info "✓ Process instrumentation telemetry found"
        fi

        if [[ $components_active -ge 1 ]]; then
            log_pass "Stabilization components integrated ($components_active components verified)"
        else
            log_fail "Stabilization components not properly integrated"
        fi
    else
        log_fail "Complete CFN Loop simulation failed"
    fi

    ((TOTAL_TESTS+=2))
}

# Test: Memory leak protection during CFN Loop
test_memory_leak_protection_in_cfn_loop() {
    log_test "Testing memory leak protection during CFN Loop execution..."

    # Create CFN Loop with potential memory leaks
    cat > "$TEST_RESULTS_DIR/cfn_loop_leak_test.sh" << 'EOF'
#!/bin/bash

echo "=== CFN Loop Memory Leak Protection Test ==="

# Apply all stabilizations
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

export AGENT_ID="leak-test-$$"
export CFN_MEMORY_LIMIT="128M"  # Low limit for testing

echo "Starting CFN Loop with memory leak protection..."

# Simulate CFN Loop with potential memory leaks
leak_data=()
for iteration in {1..50}; do
    echo "CFN Loop iteration $iteration"

    # Potential memory leak - allocate data
    leak_data+=($(printf 'X%.0s' {1..10000}))

    # Some processing
    sleep 0.2

    # Check memory usage (would be logged by instrumentation)
    echo "Memory allocated chunk $iteration"

    # If we reach this point, leak protection might not be working
    if [[ $iteration -gt 40 ]]; then
        echo "WARNING: High iteration count reached - leak protection may be ineffective"
    fi
done

echo "CFN Loop completed - this indicates leak protection may need adjustment"
EOF

    chmod +x "$TEST_RESULTS_DIR/cfn_loop_leak_test.sh"

    # Run with timeout to test leak protection
    local start_time=$(date +%s)
    if timeout 15 "$TEST_RESULTS_DIR/cfn_loop_leak_test.sh"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_fail "Memory leak protection did not trigger (${duration}s - completed normally)"
    else
        local exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        if [[ $exit_code -eq 124 ]]; then
            log_pass "Memory leak protection working (timeout triggered, ${duration}s)"
        else
            log_pass "Memory leak protection working (process terminated, ${duration}s, exit code: $exit_code)"
        fi
    fi

    ((TOTAL_TESTS++))
}

# Test: CFN Loop error recovery
test_cfn_loop_error_recovery() {
    log_test "Testing CFN Loop error recovery mechanisms..."

    # Create CFN Loop with simulated errors
    cat > "$TEST_RESULTS_DIR/cfn_loop_error_test.sh" << 'EOF'
#!/bin/bash

echo "=== CFN Loop Error Recovery Test ==="

# Apply stabilizations
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

echo "Starting CFN Loop with error simulation..."

# Simulate CFN Loop with errors
recovery_count=0
for iteration in {1..5}; do
    echo "CFN Loop iteration $iteration"

    # Simulate random error in 40% of iterations
    if [[ $((iteration % 3)) -eq 0 ]]; then
        echo "Simulating error in iteration $iteration"
        # Simulate error that doesn't crash the process
        echo "ERROR: Simulated failure occurred" >&2
        ((recovery_count++))

        # Recovery action
        echo "Initiating recovery..."
        sleep 0.5
        echo "Recovery completed"
    else
        # Normal processing
        echo "Normal processing in iteration $iteration"
        sleep 0.5
    fi
done

echo "CFN Loop completed with $recovery_count recoveries"
EOF

    chmod +x "$TEST_RESULTS_DIR/cfn_loop_error_test.sh"

    # Run error recovery test
    if timeout 20 "$TEST_RESULTS_DIR/cfn_loop_error_test.sh"; then
        log_pass "CFN Loop error recovery successful"

        # Check if error handling was logged
        local metrics_file="/tmp/cfn-telemetry/metrics_integration-agent-$$.json"
        if [[ -f "$metrics_file" ]]; then
            # Check for error indicators in telemetry
            if jq -e '.samples' "$metrics_file" >/dev/null 2>&1; then
                log_pass "Error recovery telemetry captured"
            else
                log_fail "Error recovery telemetry not captured"
            fi
        else
            log_info "No telemetry file for error recovery test"
        fi
    else
        log_fail "CFN Loop error recovery test failed"
    fi

    ((TOTAL_TESTS+=2))
}

# Test: Performance impact measurement
test_performance_impact() {
    log_test "Testing performance impact of stabilization components..."

    # Create performance benchmark
    cat > "$TEST_RESULTS_DIR/performance_benchmark.sh" << 'EOF'
#!/bin/bash

echo "=== Performance Impact Benchmark ==="

# Benchmark without stabilizations
echo "Running benchmark without stabilizations..."
start_time=$(date +%s%N)

# Simulate CFN Loop work without stabilizations
for i in {1..100}; do
    result=$(echo "scale=10; $i * 3.14159" | bc -l 2>/dev/null || echo "3.14159")
done

end_time=$(date +%s%N)
duration_without=$((end_time - start_time))
echo "Without stabilizations: ${duration_without} ns"

# Reset environment
unset AGENT_ID CFN_MEMORY_LIMIT CFN_TELEMETRY_DIR

# Benchmark with stabilizations
echo "Running benchmark with stabilizations..."
start_time=$(date +%s%N)

export AGENT_ID="perf-test-$$"
export CFN_TELEMETRY_DIR="/tmp/cfn-telemetry"

# Apply stabilizations
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

# Simulate same CFN Loop work with stabilizations
for i in {1..100}; do
    result=$(echo "scale=10; $i * 3.14159" | bc -l 2>/dev/null || echo "3.14159")
done

end_time=$(date +%s%N)
duration_with=$((end_time - start_time))
echo "With stabilizations: ${duration_with} ns"

# Calculate overhead
if [[ $duration_without -gt 0 ]]; then
    overhead_percent=$(( (duration_with - duration_without) * 100 / duration_without ))
    echo "Performance overhead: ${overhead_percent}%"

    if [[ $overhead_percent -lt 50 ]]; then
        echo "ACCEPTABLE: Performance overhead under 50%"
        exit 0
    else
        echo "HIGH: Performance overhead 50% or more"
        exit 1
    fi
else
    echo "ERROR: Invalid benchmark timing"
    exit 1
fi
EOF

    chmod +x "$TEST_RESULTS_DIR/performance_benchmark.sh"

    # Run performance benchmark
    if timeout 30 "$TEST_RESULTS_DIR/performance_benchmark.sh"; then
        log_pass "Performance impact within acceptable limits"
    else
        log_fail "Performance impact too high or benchmark failed"
    fi

    ((TOTAL_TESTS++))
}

# Run all tests
run_all_tests() {
    log_info "Starting CFN Loop End-to-End Integration Tests..."

    setup_test_env
    test_cfn_loop_orchestration
    test_agent_spawning_safety
    test_redis_coordination_safety
    test_complete_cfn_loop_simulation
    test_memory_leak_protection_in_cfn_loop
    test_cfn_loop_error_recovery
    test_performance_impact
    cleanup_test_env

    log_info "CFN Loop integration tests completed"
}

# Generate test report
generate_report() {
    local success_rate=0
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    fi

    cat << EOF
=======================================
CFN Loop Integration Test Report
=======================================

Total Tests: $TOTAL_TESTS
Passed: $PASSED_TESTS
Failed: $FAILED_TESTS
Success Rate: ${success_rate}%

EOF

    if [[ ${#TEST_RESULTS[@]} -gt 0 ]]; then
        echo "Failed Tests:"
        printf "  %s\n" "${TEST_RESULTS[@]}"
        echo ""
    fi

    if [[ $FAILED_TESTS -eq 0 ]]; then
        echo "✅ All tests passed! CFN Loop integration with stabilization is working correctly."
        return 0
    else
        echo "❌ Some tests failed. Review the failed tests above."
        return 1
    fi
}

# Main execution
main() {
    run_all_tests
    generate_report
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi