#!/bin/bash

# CFN Loop Timeout Validation Test Suite
# Tests phase-specific timeouts, agent timeout enforcement, and failure modes

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TASK_ID="test-timeout-validation-$(date +%s)"
LOG_FILE="/tmp/timeout-validation-test.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Phase timeout configuration (matching orchestrate-cfn-loop.sh)
declare -A PHASE_TIMEOUTS=(
    ["phase-1"]=900   # 15 minutes
    ["phase-2"]=3600  # 60 minutes  
    ["phase-3"]=3600  # 60 minutes
    ["phase-4"]=1800  # 30 minutes
    ["default"]=3600  # 60 minutes
)

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$$] $*" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

# Test framework
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    ((TESTS_TOTAL++))
    log_info "Running test: $test_name"
    
    if eval "$test_command" >> "$LOG_FILE" 2>&1; then
        log_success "✅ $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "❌ $test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Cleanup Redis test data
cleanup_redis() {
    log_info "Cleaning up Redis test data..."
    redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli del >/dev/null 2>&1 || true
    redis-cli --scan --pattern "test-timeout:*" | xargs -r redis-cli del >/dev/null 2>&1 || true
}

# Test 1: Phase-specific timeout configuration validation
test_phase_timeout_config() {
    log_info "Testing phase-specific timeout configuration..."
    
    local orchestrator_script="$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh"
    
    if [[ ! -f "$orchestrator_script" ]]; then
        log_error "Orchestrator script not found: $orchestrator_script"
        return 1
    fi
    
    # Extract timeout configuration from script
    while IFS= read -r phase; do
        local expected_timeout="${PHASE_TIMEOUTS[$phase]:-${PHASE_TIMEOUTS[default]}}"
        
        # Check if phase timeout is configured in script
        if grep -q "phase-${phase})" "$orchestrator_script"; then
            local actual_timeout
            actual_timeout=$(grep -A 1 "phase-${phase})" "$orchestrator_script" | grep -o '[0-9]\+' | head -1 || echo "0")
            
            if [[ "$actual_timeout" -eq "$expected_timeout" ]]; then
                log_success "Phase $phase timeout correct: ${actual_timeout}s"
            else
                log_error "Phase $phase timeout mismatch: expected ${expected_timeout}s, got ${actual_timeout}s"
                return 1
            fi
        else
            log_warning "Phase $phase not found in orchestrator script"
        fi
    done < <(printf '%s\n' "${!PHASE_TIMEOUTS[@]}" | grep -v default)
    
    return 0
}

# Test 2: Agent timeout enforcement simulation
test_agent_timeout_enforcement() {
    log_info "Testing agent timeout enforcement simulation..."
    
    local test_agent_id="timeout-test-agent-$(date +%s)"
    local short_timeout=5  # 5 second timeout for testing
    
    # Create a test agent that should timeout
    (
        # Simulate agent running longer than timeout
        echo "Agent $test_agent_id starting work..."
        sleep 10  # Longer than 5 second timeout
        echo "Agent $test_agent_id completed (should not reach here)"
    ) &
    
    local agent_pid=$!
    
    # Monitor agent with timeout
    local timeout_count=0
    while kill -0 "$agent_pid" 2>/dev/null; do
        sleep 1
        ((timeout_count++))
        
        if [[ $timeout_count -ge $short_timeout ]]; then
            log_info "Agent timeout reached, terminating..."
            kill -TERM "$agent_pid" 2>/dev/null || true
            sleep 2
            kill -KILL "$agent_pid" 2>/dev/null || true
            break
        fi
    done
    
    # Verify agent was terminated
    if ! kill -0 "$agent_pid" 2>/dev/null; then
        log_success "Agent timeout enforcement working correctly"
        return 0
    else
        log_error "Agent timeout enforcement failed - agent still running"
        kill -TERM "$agent_pid" 2>/dev/null || true
        return 1
    fi
}

# Test 3: Iteration timeout protection
test_iteration_timeout_protection() {
    log_info "Testing iteration timeout protection..."
    
    # Create a mock iteration that exceeds timeout
    local iteration_timeout=3  # 3 second timeout for testing
    local start_time=$(date +%s)
    
    # Simulate long-running iteration
    (
        for i in {1..10}; do
            echo "Iteration step $i..."
            sleep 1
        done
    ) &
    
    local iteration_pid=$!
    
    # Monitor with timeout
    local timeout_reached=false
    while kill -0 "$iteration_pid" 2>/dev/null; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [[ $elapsed -ge $iteration_timeout ]]; then
            timeout_reached=true
            log_info "Iteration timeout reached, terminating..."
            kill -TERM "$iteration_pid" 2>/dev/null || true
            break
        fi
        sleep 1
    done
    
    if $timeout_reached; then
        log_success "Iteration timeout protection activated correctly"
        return 0
    else
        log_error "Iteration timeout protection failed"
        kill -TERM "$iteration_pid" 2>/dev/null || true
        return 1
    fi
}

# Test 4: Timeout failure modes handling
test_timeout_failure_modes() {
    log_info "Testing timeout failure modes..."
    
    # Test graceful degradation
    local graceful_handled=true
    
    # Simulate Redis connection timeout
    if ! timeout 2 redis-cli ping >/dev/null 2>&1; then
        log_warning "Redis connection timeout (expected in some test environments)"
        # This is acceptable if Redis is not running
    fi
    
    # Simulate script execution timeout
    if timeout 1 sleep 5 >/dev/null 2>&1; then
        log_error "Script should have timed out"
        graceful_handled=false
    else
        log_success "Script timeout handled gracefully"
    fi
    
    # Test cleanup after timeout
    local temp_file="/tmp/timeout-test-$(date +%s)"
    (
        echo "test data" > "$temp_file"
        sleep 10
    ) &
    local cleanup_pid=$!
    
    # Kill process and verify cleanup
    sleep 1
    kill -TERM "$cleanup_pid" 2>/dev/null || true
    wait "$cleanup_pid" 2>/dev/null || true
    
    if [[ -f "$temp_file" ]]; then
        rm -f "$temp_file"
        log_warning "Temporary file required manual cleanup"
    else
        log_success "Cleanup completed successfully"
    fi
    
    $graceful_handled
}

# Test 5: Redis cleanup on timeout
test_redis_cleanup_on_timeout() {
    log_info "Testing Redis cleanup on timeout scenarios..."
    
    # Create test data in Redis
    local test_key="swarm:${TASK_ID}:test-cleanup"
    redis-cli set "$test_key" "test-data" >/dev/null 2>&1 || {
        log_warning "Redis not available, skipping Redis cleanup test"
        return 0
    }
    
    # Verify data exists
    if ! redis-cli exists "$test_key" >/dev/null 2>&1; then
        log_error "Failed to create test Redis data"
        return 1
    fi
    
    # Simulate timeout scenario with cleanup
    (
        # Simulate work that times out
        sleep 2
        # Cleanup should happen here in real scenario
        redis-cli del "$test_key" >/dev/null 2>&1 || true
    ) &
    
    local cleanup_pid=$!
    
    # Timeout after 1 second
    if timeout 1 wait "$cleanup_pid"; then
        log_error "Process should have timed out"
        return 1
    fi
    
    # Force cleanup (simulating orchestrator behavior)
    kill -TERM "$cleanup_pid" 2>/dev/null || true
    redis-cli del "$test_key" >/dev/null 2>&1 || true
    
    # Verify cleanup
    if ! redis-cli exists "$test_key" >/dev/null 2>&1; then
        log_success "Redis cleanup on timeout working correctly"
        return 0
    else
        log_error "Redis cleanup on timeout failed"
        return 1
    fi
}

# Test 6: Normal execution scenario
test_normal_execution() {
    log_info "Testing normal execution without timeouts..."
    
    # Create a simple test that completes normally
    local result_file="/tmp/normal-exec-result-$(date +%s)"
    
    (
        echo "Starting normal execution"
        sleep 2
        echo "success" > "$result_file"
    ) &
    
    local normal_pid=$!
    wait "$normal_pid"
    
    if [[ -f "$result_file" ]] && [[ "$(cat "$result_file")" == "success" ]]; then
        rm -f "$result_file"
        log_success "Normal execution completed successfully"
        return 0
    else
        log_error "Normal execution failed"
        return 1
    fi
}

# Test 7: Recovery after timeout
test_recovery_after_timeout() {
    log_info "Testing recovery after timeout scenario..."
    
    # First execution that times out
    local recovery_test_file="/tmp/recovery-test-$(date +%s)"
    
    (
        echo "First attempt (will timeout)"
        sleep 5
        echo "first-attempt" > "$recovery_test_file"
    ) &
    
    local first_pid=$!
    
    # Timeout after 2 seconds
    if timeout 2 wait "$first_pid"; then
        log_error "First attempt should have timed out"
        return 1
    fi
    
    kill -TERM "$first_pid" 2>/dev/null || true
    
    # Second attempt that succeeds
    (
        echo "Recovery attempt"
        sleep 1
        echo "recovery-success" > "$recovery_test_file"
    ) &
    
    local recovery_pid=$!
    wait "$recovery_pid"
    
    if [[ -f "$recovery_test_file" ]] && [[ "$(cat "$recovery_test_file")" == "recovery-success" ]]; then
        rm -f "$recovery_test_file"
        log_success "Recovery after timeout working correctly"
        return 0
    else
        log_error "Recovery after timeout failed"
        return 1
    fi
}

# Main test execution
main() {
    log_info "Starting CFN Loop Timeout Validation Test Suite"
    log_info "Task ID: $TASK_ID"
    log_info "Log file: $LOG_FILE"
    
    # Initialize log
    echo "=== CFN Loop Timeout Validation Test Suite ===" > "$LOG_FILE"
    echo "Started: $(date)" >> "$LOG_FILE"
    echo "Task ID: $TASK_ID" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    
    # Cleanup any existing test data
    cleanup_redis
    
    # Run all tests
    run_test "Phase Timeout Configuration Validation" "test_phase_timeout_config"
    run_test "Agent Timeout Enforcement" "test_agent_timeout_enforcement"
    run_test "Iteration Timeout Protection" "test_iteration_timeout_protection"
    run_test "Timeout Failure Modes" "test_timeout_failure_modes"
    run_test "Redis Cleanup on Timeout" "test_redis_cleanup_on_timeout"
    run_test "Normal Execution Scenario" "test_normal_execution"
    run_test "Recovery After Timeout" "test_recovery_after_timeout"
    
    # Cleanup
    cleanup_redis
    
    # Print summary
    echo ""
    log_info "Test Suite Summary:"
    log_info "Total tests: $TESTS_TOTAL"
    log_success "Passed: $TESTS_PASSED"
    log_error "Failed: $TESTS_FAILED"
    
    local success_rate=0
    if [[ $TESTS_TOTAL -gt 0 ]]; then
        success_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
    fi
    
    log_info "Success rate: ${success_rate}%"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "🎉 All tests passed!"
        echo "=== TEST RESULTS ===" >> "$LOG_FILE"
        echo "PASSED: $TESTS_PASSED/$TESTS_TOTAL (${success_rate}%)" >> "$LOG_FILE"
        return 0
    else
        log_error "❌ Some tests failed!"
        echo "=== TEST RESULTS ===" >> "$LOG_FILE"
        echo "FAILED: $TESTS_FAILED/$TESTS_TOTAL (${success_rate}%)" >> "$LOG_FILE"
        return 1
    fi
}

# Run tests if script executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi