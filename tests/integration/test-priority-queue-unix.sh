#!/usr/bin/env bash
set -eu

# Enable DEBUG mode for verbose output
export DEBUG=true

# Determine script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WAITING_MODE_SCRIPT="$SCRIPT_DIR/.claude/skills/redis-coordination/invoke-waiting-mode.sh"

# Random identifier to prevent conflicts
TASK_ID="test-priority-$(date +%s)"
AGENT_ID="test-agent-1"

# Log function
log() {
    echo "[TEST] $1"
}

# Verbose log function
vlog() {
    echo "[VERBOSE] $1"
}

# Sanitize JSON function
sanitize_json() {
    echo "$1" | tr '\n' ' ' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//'
}

# Main test function
run_tests() {
    log "Starting priority queue tests..."

    # Clean previous test data
    redis-cli DEL "swarm:$TASK_ID:$AGENT_ID:wake-queue" || true
    redis-cli DEL "swarm:$TASK_ID:$AGENT_ID:shutdown" || true

    # Send wake messages with different priorities
    bash "$WAITING_MODE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "low" --priority 20
    bash "$WAITING_MODE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "high" --priority 90
    bash "$WAITING_MODE_SCRIPT" wake --task-id "$TASK_ID" --agent-id "$AGENT_ID" --reason "medium" --priority 50

    # Capture results
    log "Initiating waiting mode..."

    # Capture results from multiple calls
    RESULTS=$(
        for _ in {1..3}; do
            bash "$WAITING_MODE_SCRIPT" enter --task-id "$TASK_ID" --agent-id "$AGENT_ID" --context "priority-test"
        done | while read -r line; do
            # Process only lines looking like complete JSON
            if echo "$line" | grep -qP '^\{.*"reason":.*\}$'; then
                sanitize_json "$line"
            fi
        done
    )

    # Debug: show full raw results
    log "Raw Results: $RESULTS"

    # Attempt to parse full results string, using grep to ensure valid JSON
    PARSED_REASONS=$(echo "$RESULTS" | xargs -n1 | grep -E '^\{.*"reason":.*\}$' | jq -r '.reason' 2>/dev/null)

    log "Parsed Reasons: $PARSED_REASONS"

    # Convert to array
    readarray -t ORDERED_RESULTS <<< "$PARSED_REASONS"

    log "Detected Order: ${ORDERED_RESULTS[*]}"

    # Check array has at least 3 elements
    if [ ${#ORDERED_RESULTS[@]} -lt 3 ]; then
        log "FAILED: Not enough messages received (got: ${#ORDERED_RESULTS[@]})"
        return 1
    fi

    # Verify order: high, medium, low
    if [ "${ORDERED_RESULTS[0]}" != "high" ]; then
        log "FAILED: First message was not high priority (got '${ORDERED_RESULTS[0]}')"
        return 1
    fi

    if [ "${ORDERED_RESULTS[1]}" != "medium" ]; then
        log "FAILED: Second message was not medium priority (got '${ORDERED_RESULTS[1]}')"
        return 1
    fi

    if [ "${ORDERED_RESULTS[2]}" != "low" ]; then
        log "FAILED: Third message was not low priority (got '${ORDERED_RESULTS[2]}')"
        return 1
    fi

    log "Priority ordering test PASSED"
    return 0
}

# Execute tests and report confidence
if run_tests; then
    echo "0.95"
else
    echo "0.50"
fi