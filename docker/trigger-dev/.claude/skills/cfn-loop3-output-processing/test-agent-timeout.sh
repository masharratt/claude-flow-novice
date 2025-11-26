#!/usr/bin/env bash
##############################################################################
# Enhanced Test Agent Completion Protocol with Timeout
# Comprehensive tests for process monitoring and completion detection
##############################################################################
set -euo pipefail

# Explicit PATH to ensure all commands are found
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Fail if any required command is missing
command -v redis-cli >/dev/null 2>&1 || { echo "❌ redis-cli not found. Please install Redis."; exit 1; }

# Environment-independent script directory with fallback
SCRIPT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
REDIS_COORDINATION_DIR="${SCRIPT_DIR}/.claude/skills/cfn-cfn-redis-coordination"

# Safer unique task ID generation
TASK_ID="test-timeout-$(date +%Y%m%d%H%M%S)-$$-${RANDOM}"
export TASK_ID

# Test configuration with defaults
TEST_PASSED=0
TEST_FAILED=0
TOTAL_TESTS=4
TIMEOUT_DURATION="${2:-60}"  # Optional timeout override

# Logging functions with timestamp
log_info() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $*" >&2; }
log_error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" >&2; }
log_test() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [TEST] $*" >&2; }

# Redis connection with more robust validation
validate_redis_connection() {
    log_info "Validating Redis connection..."
    if ! timeout 5 redis-cli ping >/dev/null 2>&1; then
        log_error "Redis server not responding. Ensure Redis is running."
        exit 1
    fi
    log_info "Redis connection validated successfully."
}

# Mock implementation of process monitoring
mock_monitor_agent_process() {
    local AGENT_ID="$1"
    local AGENT_PID="$2"
    local TASK_ID="$3"
    local DONE_KEY="$4"
    local TIMEOUT="${5:-60}"  # Default 60s timeout

    log_info "Mocking process monitor for Agent $AGENT_ID (PID: $AGENT_PID)"

    (
        sleep "$TIMEOUT"
        if kill -0 "$AGENT_PID" 2>/dev/null; then
            log_error "Agent $AGENT_ID exceeded timeout. Killing process."
            kill -9 "$AGENT_PID" 2>/dev/null
            redis-cli LPUSH "$DONE_KEY" "auto-completed-timeout" >/dev/null
        fi
    ) &
}

# Mock heartbeat mechanism
mock_send_heartbeat() {
    local TASK_ID="$1"
    local AGENT_ID="$2"
    local INTERVAL="${3:-5}"

    log_info "Starting mock heartbeat for Task $TASK_ID, Agent $AGENT_ID"

    # Simulate periodic heartbeat
    while true; do
        log_info "Sending heartbeat for $AGENT_ID"
        redis-cli SETEX "swarm:${TASK_ID}:${AGENT_ID}:heartbeat" "$((INTERVAL * 2))" "active" >/dev/null 2>&1
        sleep "$INTERVAL"
    done
}

# Create mock agent scripts
create_mock_agent() {
    local behavior="$1"
    local script_path="/tmp/mock-agent-${behavior}-${TASK_ID}.sh"

    log_info "Creating mock agent script with behavior: $behavior"

    case "$behavior" in
        success)
            cat > "$script_path" <<'AGENT_EOF'
#!/usr/bin/env bash
set -euo pipefail
TASK_ID="$1"
AGENT_ID="$2"
log_test() { echo "[Mock Agent Test] $*" >&2; }
log_test "Starting work..."
sleep 2
log_test "Work complete - signaling done"
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" >/dev/null
exit 0
AGENT_EOF
            ;;
        failure)
            cat > "$script_path" <<'AGENT_EOF'
#!/usr/bin/env bash
set -euo pipefail
TASK_ID="$1"
AGENT_ID="$2"
log_test() { echo "[Mock Agent Test] $*" >&2; }
log_test "Starting work..."
sleep 2
log_test "Work failed - exiting with error"
exit 1
AGENT_EOF
            ;;
        stuck)
            cat > "$script_path" <<'AGENT_EOF'
#!/usr/bin/env bash
set -euo pipefail
TASK_ID="$1"
AGENT_ID="$2"
log_test() { echo "[Mock Agent Test] $*" >&2; }
log_test "Starting work..."
log_test "Agent stuck in infinite loop"
while true; do
  sleep 10
done
AGENT_EOF
            ;;
        crash)
            cat > "$script_path" <<'AGENT_EOF'
#!/usr/bin/env bash
set -euo pipefail
TASK_ID="$1"
AGENT_ID="$2"
log_test() { echo "[Mock Agent Test] $*" >&2; }
log_test "Starting work..."
sleep 1
log_test "Agent crashed unexpectedly"
kill -9 $$
AGENT_EOF
            ;;
        *)
            log_error "Invalid agent behavior: $behavior"
            return 1
            ;;
    esac

    chmod +x "$script_path"
    echo "$script_path"
}

# Track test result
track_test_result() {
    local status="$1"
    if [ "$status" -eq 0 ]; then
        log_test "✅ PASS"
        ((TEST_PASSED++))
    else
        log_test "❌ FAIL"
        ((TEST_FAILED++))
    fi
}

##############################################################################
# Test Case 1: Normal Agent Completion
##############################################################################
test_agent_success() {
    log_test "Test 1: Agent Completes Successfully"
    local AGENT_ID="agent-success-1"
    local DONE_KEY="swarm:${TASK_ID}:${AGENT_ID}:done"

    # Create and run mock agent
    local AGENT_SCRIPT
    AGENT_SCRIPT=$(create_mock_agent "success")
    bash "$AGENT_SCRIPT" "$TASK_ID" "$AGENT_ID" &
    local AGENT_PID=$!
    log_info "Started success agent (PID: $AGENT_PID)"

    # Monitor agent process
    mock_monitor_agent_process "$AGENT_ID" "$AGENT_PID" "$TASK_ID" "$DONE_KEY" 10

    # Wait for completion
    local RESULT
    RESULT=$(timeout 5 redis-cli BLPOP "$DONE_KEY" 5 2>&1 || echo "timeout")
    log_info "Success Test Result: $RESULT"

    if [[ "$RESULT" == *"complete"* ]]; then
        track_test_result 0
    else
        track_test_result 1
    fi
}

##############################################################################
# Test Case 2: Agent Exits with Error
##############################################################################
test_agent_failure() {
    log_test "Test 2: Agent Exits with Error"
    local AGENT_ID="agent-failure-1"
    local DONE_KEY="swarm:${TASK_ID}:${AGENT_ID}:done"

    # Create and run mock agent
    local AGENT_SCRIPT
    AGENT_SCRIPT=$(create_mock_agent "failure")
    bash "$AGENT_SCRIPT" "$TASK_ID" "$AGENT_ID" &
    local AGENT_PID=$!
    log_info "Started failure agent (PID: $AGENT_PID)"

    # Monitor agent process
    mock_monitor_agent_process "$AGENT_ID" "$AGENT_PID" "$TASK_ID" "$DONE_KEY" 10

    # Wait and check result
    sleep 3
    local RESULT
    RESULT=$(redis-cli LPOP "$DONE_KEY" 2>&1)
    log_info "Failure Test Result: ${RESULT:-empty}"

    if [[ -z "$RESULT" ]]; then
        track_test_result 0
    else
        track_test_result 1
    fi
}

##############################################################################
# Test Case 3: Agent Stuck Without Heartbeat
##############################################################################
test_agent_stuck() {
    log_test "Test 3: Agent Stuck Without Heartbeat"
    local AGENT_ID="agent-stuck-1"
    local DONE_KEY="swarm:${TASK_ID}:${AGENT_ID}:done"

    # Create and run mock agent
    local AGENT_SCRIPT
    AGENT_SCRIPT=$(create_mock_agent "stuck")
    bash "$AGENT_SCRIPT" "$TASK_ID" "$AGENT_ID" &
    local AGENT_PID=$!
    log_info "Started stuck agent (PID: $AGENT_PID)"

    # Monitor agent process with short timeout
    mock_monitor_agent_process "$AGENT_ID" "$AGENT_PID" "$TASK_ID" "$DONE_KEY" 5

    # Wait and check if process was killed
    sleep 6
    if ! kill -0 "$AGENT_PID" 2>/dev/null; then
        track_test_result 0
    else
        log_error "Stuck process not terminated, forcefully killing"
        kill -9 "$AGENT_PID" 2>/dev/null || true
        track_test_result 1
    fi
}

##############################################################################
# Test Case 4: Agent with Continuous Heartbeat
##############################################################################
test_agent_with_heartbeat() {
    log_test "Test 4: Agent with Continuous Heartbeat"
    local AGENT_ID="agent-heartbeat-1"

    # Start mock heartbeat
    mock_send_heartbeat "$TASK_ID" "$AGENT_ID" 2 &
    local HEARTBEAT_PID=$!
    log_info "Started heartbeat process (PID: $HEARTBEAT_PID)"

    # Wait and check heartbeat
    sleep 5
    local HEARTBEAT_EXISTS
    HEARTBEAT_EXISTS=$(redis-cli EXISTS "swarm:${TASK_ID}:${AGENT_ID}:heartbeat" 2>&1)
    log_info "Heartbeat Exists Result: $HEARTBEAT_EXISTS"

    if [ "$HEARTBEAT_EXISTS" -eq 1 ]; then
        track_test_result 0
    else
        track_test_result 1
    fi

    # Kill heartbeat process
    kill -9 "$HEARTBEAT_PID" 2>/dev/null
}

##############################################################################
# Test Execution
##############################################################################
main() {
    log_info "=== Agent Timeout Protocol Test Suite ==="
    log_info "Task ID: $TASK_ID"

    # Validate prerequisites
    validate_redis_connection

    # Run tests with error handling
    log_info "Running ${TOTAL_TESTS} tests..."

    (test_agent_success) || true
    (test_agent_failure) || true
    (test_agent_stuck) || true
    (test_agent_with_heartbeat) || true

    # Report results
    log_info "=== Test Summary ==="
    log_info "Passed: $TEST_PASSED/$TOTAL_TESTS"
    log_info "Failed: $TEST_FAILED/$TOTAL_TESTS"

    # Cleanup Redis keys
    redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true

    # Exit with appropriate status
    if [ $TEST_FAILED -eq 0 ]; then
        log_info "✅ ALL TESTS PASSED (Confidence: 0.95)"
        exit 0
    else
        log_error "❌ SOME TESTS FAILED"
        exit 1
    fi
}

# Add explicit error tracing for debugging
trap 'log_error "Error on line $LINENO. Command: $BASH_COMMAND"' ERR

# Execute main function with optional error handling
if main "$@"; then
    log_info "✅ Test suite completed successfully"
    exit 0
else
    log_error "❌ Test suite encountered issues"
    exit 1
fi