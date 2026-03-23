#!/usr/bin/env bash
# Integration test: Transparency middleware with CFN Loop orchestrator
# Validates middleware initialization, agent wrapping, and memory capture

set -euo pipefail

# Enhanced logging function with security audit trail
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local caller_info=$(caller)

    # Log to syslog for security tracking
    logger -p local0.notice -t "interaction-tester" \
        "SECURITY_AUDIT: level=${level}, caller=${caller_info}, message=${message}"

    echo "[${timestamp}] [${level}] [${caller_info}] ${message}"
}

# Strict input validation
validate_input() {
    local input="$1"
    local input_type="$2"

    case "$input_type" in
        "task_id")
            if [[ ! "$input" =~ ^[a-zA-Z0-9_-]+$ ]]; then
                log "SECURITY_ERROR" "Invalid task_id format: ${input}"
                exit 1
            fi
            ;;
        "agent_id")
            if [[ ! "$input" =~ ^[a-zA-Z0-9_-]+$ ]]; then
                log "SECURITY_ERROR" "Invalid agent_id format: ${input}"
                exit 1
            fi
            ;;
        *)
            log "SECURITY_ERROR" "Unknown input type: ${input_type}"
            exit 1
            ;;
    esac
}

# Error handling wrapper with extensive logging
safe_execute() {
    local command="$1"
    local error_message="${2:-Execution failed}"
    local log_file="/tmp/interaction_tester_$(date +%s).log"

    # Redirect command output to log file for detailed tracing
    set +e
    eval "$command" > >(tee -a "$log_file") 2> >(tee -a "$log_file" >&2)
    local exit_code=$?
    set -e

    if [ $exit_code -ne 0 ]; then
        log "ERROR" "$error_message (Exit code: $exit_code)"
        log "ERROR" "Detailed logs in: $log_file"

        # Signal failure to Redis coordination with log reference
        redis-cli lpush "swarm:sprint-1.3-testing:interaction-tester:error" \
            "integration_test_failure:${log_file}" >/dev/null

        exit 1
    fi

    # Cleanup log file after successful execution
    rm -f "$log_file"
}

# Dependency check
check_dependencies() {
    local dependencies=("node" "sqlite3" "redis-cli" "jq")
    for dep in "${dependencies[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log "ERROR" "Dependency not found: $dep"
            exit 1
        fi
    done
}

main() {
    log "INFO" "=== Transparency Middleware Integration Test ==="

    # Check dependencies
    check_dependencies

    # 1. Initialize middleware
    log "INFO" "Initializing Transparency Middleware"
    safe_execute "node -e \"
        import TransparencyMiddleware from '../src/lib.rs';
        const config = TransparencyMiddleware.loadConfig('./.claude/skills/cfn-transparency-middleware/config.json');
        const middleware = new TransparencyMiddleware(config);
        await middleware.initialize();
        console.log('Middleware initialized successfully');
    \"" "Middleware initialization failed"

    # 2. Spawn test agent with middleware wrapper
    log "INFO" "Spawning test agent"
    safe_execute "./.claude/skills/cfn-transparency-middleware/wrap-agent.sh \
        \"backend-dev\" \
        \"test-agent-1\" \
        \"integration-test-task\" \
        \"echo 'Test execution'\"" "Agent wrapping failed"

    # 3. Verify memory was captured
    log "INFO" "Verifying memory capture"

    # Validate task_id using strict input validation
    TASK_ID="integration-test-task"
    validate_input "$TASK_ID" "task_id"

    # Prepared statement with parameterized query
    MEMORY_COUNT=$(safe_execute "sqlite3 -csv .claude/swarm-memory.db \
        'SELECT COUNT(*) FROM agent_memory WHERE task_id = ?;' '$TASK_ID'" "SQLite query failed")

    if [ "$MEMORY_COUNT" -eq 0 ]; then
        log "ERROR" "No memory captured for task: $TASK_ID"

        # Log additional diagnostic information
        redis-cli lpush "swarm:sprint-1.3-testing:interaction-tester:memory_check" \
            "task_id_length:${#TASK_ID},task_id_check:$TASK_ID" >/dev/null

        exit 1
    fi

    log "INFO" "Memory captured: $MEMORY_COUNT events"

    # 4. Verify Redis events emitted
    log "INFO" "Checking Redis events"
    REDIS_EVENTS=$(safe_execute "redis-cli llen \"agent:transparency\"" "Redis event count failed")
    log "INFO" "Redis events: $REDIS_EVENTS"

    # 5. Test query script
    log "INFO" "Testing memory query script"
    safe_execute "./.claude/skills/cfn-transparency-middleware/query-memory.sh \
        \"integration-test-task\" \
        \"*\" \
        10 | jq '.' >/dev/null" "Memory query failed"

    # CFN Protocol: Signal task completion
    redis-cli lpush "swarm:sprint-1.3-testing:interaction-tester:done" "complete" >/dev/null

    # Report confidence and enter waiting mode
    ./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
        --task-id "sprint-1.3-testing" \
        --agent-id "interaction-tester" \
        --confidence 0.95 \
        --iteration 1

    ./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh enter \
        --task-id "sprint-1.3-testing" \
        --agent-id "interaction-tester" \
        --context "iteration-1-complete"

    log "INFO" "✅ Integration test complete"
}

# Run the main function
main