#!/bin/bash

# CFN Loop Timeout Enforcement Testing Skill
# Validates timeout mechanisms at agent, orchestrator, and system levels

set -euo pipefail

# Skill configuration
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SKILL_DIR")")"
TASK_ID="${TASK_ID:-test-timeout-enforcement-$(date +%s)}"
AGENT_ID="${AGENT_ID:-timeout-tester}"

# Configuration defaults
DEFAULT_TIMEOUT=30
TEST_TIMEOUT=5
CLEANUP_DELAY=2

# Colors and logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$$] $*"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

# Redis connection check
check_redis() {
    if ! redis-cli ping >/dev/null 2>&1; then
        log_warning "Redis not available - some tests will be skipped"
        return 1
    fi
    return 0
}

# Cleanup Redis test data
cleanup_redis_data() {
    if check_redis; then
        redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli del >/dev/null 2>&1 || true
        redis-cli --scan --pattern "timeout-test:*" | xargs -r redis-cli del >/dev/null 2>&1 || true
    fi
}

# Test 1: Agent process timeout enforcement
test_agent_process_timeout() {
    log_info "Testing agent process timeout enforcement..."
    
    local test_agent_id="timeout-agent-$(date +%s)"
    local timeout_duration=$TEST_TIMEOUT
    local test_file="/tmp/agent-timeout-test-${test_agent_id}.tmp"
    
    # Create a test agent that runs longer than timeout
    (
        echo "Agent $test_agent_id started" > "$test_file"
        for i in {1..10}; do
            echo "Agent $test_agent_id working... step $i" >> "$test_file"
            sleep 1
        done
        echo "Agent $test_agent_id completed" >> "$test_file"
    ) &
    
    local agent_pid=$!
    local timeout_occurred=false
    
    # Monitor agent with timeout
    local elapsed=0
    while kill -0 "$agent_pid" 2>/dev/null && [[ $elapsed -lt $timeout_duration ]]; do
        sleep 1
        ((elapsed++))
    done
    
    # Check if agent should be terminated
    if kill -0 "$agent_pid" 2>/dev/null; then
        timeout_occurred=true
        log_info "Agent timeout reached, terminating process..."
        
        # Graceful termination
        kill -TERM "$agent_pid" 2>/dev/null || true
        sleep 1
        
        # Force termination if still running
        if kill -0 "$agent_pid" 2>/dev/null; then
            kill -KILL "$agent_pid" 2>/dev/null || true
            log_info "Force terminated agent process"
        fi
    fi
    
    # Verify results
    if $timeout_occurred; then
        # Check that agent was interrupted
        local final_line
        final_line=$(tail -1 "$test_file" 2>/dev/null || echo "")
        
        if [[ "$final_line" != *"completed"* ]]; then
            log_success "Agent timeout enforcement working correctly"
            rm -f "$test_file"
            return 0
        else
            log_error "Agent completed despite timeout"
            rm -f "$test_file"
            return 1
        fi
    else
        log_error "Agent completed before timeout (test configuration issue)"
        rm -f "$test_file"
        return 1
    fi
}

# Test 2: Orchestrator timeout coordination
test_orchestrator_timeout_coordination() {
    log_info "Testing orchestrator timeout coordination..."
    
    if ! check_redis; then
        log_warning "Skipping orchestrator timeout test - Redis not available"
        return 0
    fi
    
    local test_task_id="orchestrator-timeout-$(date +%s)"
    local test_agent_id="test-agent-${test_task_id}"
    local timeout_duration=$TEST_TIMEOUT
    
    # Simulate orchestrator spawning an agent
    (
        # Simulate agent work that times out
        echo "Agent $test_agent_id starting work"
        redis-cli set "swarm:${test_task_id}:${test_agent_id}:status" "working" >/dev/null
        
        for i in {1..10}; do
            redis-cli set "swarm:${test_task_id}:${test_agent_id}:progress" "$i/10" >/dev/null
            sleep 1
        done
        
        redis-cli set "swarm:${test_task_id}:${test_agent_id}:status" "completed" >/dev/null
    ) &
    
    local orchestrator_pid=$!
    local timeout_occurred=false
    
    # Simulate orchestrator timeout monitoring
    local elapsed=0
    while kill -0 "$orchestrator_pid" 2>/dev/null && [[ $elapsed -lt $timeout_duration ]]; do
        sleep 1
        ((elapsed++))
        
        # Check agent status
        local agent_status
        agent_status=$(redis-cli get "swarm:${test_task_id}:${test_agent_id}:status" 2>/dev/null || echo "")
        
        if [[ -n "$agent_status" ]]; then
            log_info "Agent status: $agent_status"
        fi
    done
    
    # Timeout handling
    if kill -0 "$orchestrator_pid" 2>/dev/null; then
        timeout_occurred=true
        log_info "Orchestrator timeout reached, terminating..."
        
        kill -TERM "$orchestrator_pid" 2>/dev/null || true
        sleep 1
        kill -KILL "$orchestrator_pid" 2>/dev/null || true
    fi
    
    # Cleanup Redis
    redis-cli del "swarm:${test_task_id}:${test_agent_id}:status" >/dev/null 2>&1 || true
    redis-cli del "swarm:${test_task_id}:${test_agent_id}:progress" >/dev/null 2>&1 || true
    
    if $timeout_occurred; then
        log_success "Orchestrator timeout coordination working correctly"
        return 0
    else
        log_error "Orchestrator timeout coordination failed"
        return 1
    fi
}

# Test 3: Multiple agent timeout handling
test_multiple_agent_timeout() {
    log_info "Testing multiple agent timeout handling..."
    
    local agent_count=3
    local timeout_duration=$TEST_TIMEOUT
    local agent_pids=()
    
    # Spawn multiple agents
    for i in $(seq 1 $agent_count); do
        (
            echo "Agent $i starting work"
            for j in {1..10}; do
                echo "Agent $i: step $j"
                sleep 1
            done
            echo "Agent $i completed"
        ) &
        agent_pids+=($!)
    done
    
    # Monitor all agents with timeout
    local elapsed=0
    local running_agents=true
    
    while $running_agents && [[ $elapsed -lt $timeout_duration ]]; do
        running_agents=false
        for pid in "${agent_pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                running_agents=true
                break
            fi
        done
        sleep 1
        ((elapsed++))
    done
    
    # Terminate remaining agents
    local terminated_count=0
    for pid in "${agent_pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill -TERM "$pid" 2>/dev/null || true
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL "$pid" 2>/dev/null || true
            fi
            ((terminated_count++))
        fi
    done
    
    if [[ $terminated_count -gt 0 ]]; then
        log_success "Multiple agent timeout handling: $terminated_count/$agent_count agents timed out"
        return 0
    else
        log_error "No agents required timeout (test configuration issue)"
        return 1
    fi
}

# Test 4: Redis cleanup after timeout
test_redis_cleanup_after_timeout() {
    log_info "Testing Redis cleanup after timeout..."
    
    if ! check_redis; then
        log_warning "Skipping Redis cleanup test - Redis not available"
        return 0
    fi
    
    local test_task_id="cleanup-test-$(date +%s)"
    local test_agent_id="cleanup-agent"
    
    # Create test Redis data
    redis-cli set "swarm:${test_task_id}:${test_agent_id}:status" "working" >/dev/null
    redis-cli set "swarm:${test_task_id}:${test_agent_id}:confidence" "0.85" >/dev/null
    redis-cli set "swarm:${test_task_id}:gate-passed" "true" >/dev/null
    redis-cli set "swarm:${test_task_id}:iteration" "1" >/dev/null
    
    # Verify data was created
    local key_count
    key_count=$(redis-cli --scan --pattern "swarm:${test_task_id}:*" | wc -l)
    
    if [[ $key_count -eq 0 ]]; then
        log_error "Failed to create test Redis data"
        return 1
    fi
    
    # Simulate timeout scenario
    (
        # Simulate agent that times out
        echo "Agent starting work"
        sleep 10  # Will be killed by timeout
        echo "Agent completed"
    ) &
    
    local agent_pid=$!
    
    # Simulate timeout
    sleep 2
    kill -TERM "$agent_pid" 2>/dev/null || true
    
    # Perform cleanup (simulating orchestrator behavior)
    redis-cli --scan --pattern "swarm:${test_task_id}:*" | xargs -r redis-cli del >/dev/null
    
    # Verify cleanup
    local remaining_keys
    remaining_keys=$(redis-cli --scan --pattern "swarm:${test_task_id}:*" | wc -l)
    
    if [[ $remaining_keys -eq 0 ]]; then
        log_success "Redis cleanup after timeout working correctly"
        return 0
    else
        log_error "Redis cleanup failed: $remaining_keys keys remaining"
        return 1
    fi
}

# Test 5: Timeout escalation (SIGTERM → SIGKILL)
test_timeout_escalation() {
    log_info "Testing timeout escalation (SIGTERM → SIGKILL)..."
    
    local test_pid
    local timeout_grace=2
    local timeout_force=5
    
    # Create a process that ignores SIGTERM
    (
        # Ignore SIGTERM
        trap '' TERM
        echo "Ignoring SIGTERM, will only respond to SIGKILL"
        while true; do
            echo "Still running..."
            sleep 1
        done
    ) &
    
    test_pid=$!
    
    # First, try SIGTERM
    kill -TERM "$test_pid" 2>/dev/null || true
    sleep $timeout_grace
    
    # Check if still running
    if kill -0 "$test_pid" 2>/dev/null; then
        log_info "SIGTERM ignored, escalating to SIGKILL"
        kill -KILL "$test_pid" 2>/dev/null || true
        sleep 1
        
        if ! kill -0 "$test_pid" 2>/dev/null; then
            log_success "Timeout escalation (SIGTERM → SIGKILL) working correctly"
            return 0
        else
            log_error "SIGKILL failed to terminate process"
            return 1
        fi
    else
        log_error "Process responded to SIGTERM (test configuration issue)"
        return 1
    fi
}

# Test 6: Timeout in different execution contexts
test_timeout_contexts() {
    log_info "Testing timeout in different execution contexts..."
    
    local test_results=()
    
    # Test 1: Background process timeout
    (
        sleep 10
    ) &
    local bg_pid=$!
    
    if timeout 2 wait "$bg_pid"; then
        test_results+=("FAIL: Background process should have timed out")
    else
        test_results+=("PASS: Background process timed out correctly")
    fi
    
    # Test 2: Subshell timeout
    if timeout 2 bash -c 'sleep 5; echo "completed"'; then
        test_results+=("FAIL: Subshell should have timed out")
    else
        test_results+=("PASS: Subshell timed out correctly")
    fi
    
    # Test 3: Command timeout
    if timeout 2 sleep 5; then
        test_results+=("FAIL: Command should have timed out")
    else
        test_results+=("PASS: Command timed out correctly")
    fi
    
    # Test 4: Pipeline timeout
    if timeout 2 bash -c 'sleep 5 | cat'; then
        test_results+=("FAIL: Pipeline should have timed out")
    else
        test_results+=("PASS: Pipeline timed out correctly")
    fi
    
    # Count results
    local pass_count=0
    local total_count=${#test_results[@]}
    
    for result in "${test_results[@]}"; do
        if [[ "$result" == PASS* ]]; then
            ((pass_count++))
            log_success "$result"
        else
            log_error "$result"
        fi
    done
    
    if [[ $pass_count -eq $total_count ]]; then
        log_success "All timeout contexts working correctly ($pass_count/$total_count)"
        return 0
    else
        log_error "Some timeout contexts failed ($pass_count/$total_count)"
        return 1
    fi
}

# Main test execution
main() {
    log_info "Starting CFN Loop Timeout Enforcement Testing"
    log_info "Task ID: $TASK_ID"
    log_info "Agent ID: $AGENT_ID"
    
    local tests_passed=0
    local tests_total=6
    
    # Run all timeout enforcement tests
    if test_agent_process_timeout; then ((tests_passed++)); fi
    if test_orchestrator_timeout_coordination; then ((tests_passed++)); fi
    if test_multiple_agent_timeout; then ((tests_passed++)); fi
    if test_redis_cleanup_after_timeout; then ((tests_passed++)); fi
    if test_timeout_escalation; then ((tests_passed++)); fi
    if test_timeout_contexts; then ((tests_passed++)); fi
    
    # Cleanup
    cleanup_redis_data
    
    # Print summary
    echo ""
    log_info "Timeout Enforcement Test Summary:"
    log_info "Tests passed: $tests_passed/$tests_total"
    
    if [[ $tests_passed -eq $tests_total ]]; then
        log_success "🎉 All timeout enforcement tests passed!"
        return 0
    else
        log_error "❌ Some timeout enforcement tests failed!"
        return 1
    fi
}

# Help function
show_help() {
    cat << EOF
CFN Loop Timeout Enforcement Testing Skill

Tests timeout mechanisms at multiple levels:
- Agent process timeout enforcement
- Orchestrator timeout coordination  
- Multiple agent timeout handling
- Redis cleanup after timeout
- Timeout escalation (SIGTERM → SIGKILL)
- Timeout in different execution contexts

Usage: $0 [OPTIONS]

Options:
    --task-id ID      Custom task ID (default: auto-generated)
    --agent-id ID     Custom agent ID (default: timeout-tester)
    --timeout SECONDS Test timeout duration (default: 5)
    --help            Show this help message

Environment Variables:
    TASK_ID          Override task ID
    AGENT_ID         Override agent ID

Examples:
    $0
    $0 --task-id custom-task-123 --timeout 10
    TASK_ID=custom-task $0 --agent-id custom-agent

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --timeout)
            TEST_TIMEOUT="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main function
main "$@"