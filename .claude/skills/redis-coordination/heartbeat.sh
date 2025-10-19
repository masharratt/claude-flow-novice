#!/bin/bash

# Heartbeat Monitoring Script for Agent Coordination
# Implements 60s TTL, 30s check interval, and quorum fallback detection

# Dependencies
REDIS_CLI=$(which redis-cli)
if [ -z "$REDIS_CLI" ]; then
    echo "Error: redis-cli not found. Please install Redis client."
    exit 1
fi

# Logging configuration
LOG_FILE="/tmp/heartbeat-debug.log"
touch "$LOG_FILE"

log_debug() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Configuration
HEARTBEAT_TTL=60  # 60 seconds TTL
CHECK_INTERVAL=30  # 30 seconds between checks
MISSED_THRESHOLD=2  # Number of missed heartbeats before considering agent hung
BUFFER_TIME=3      # Additional buffer time for timing flexibility

send_heartbeat() {
    local task_id="$1"
    local agent_id="$2"

    if [ -z "$task_id" ] || [ -z "$agent_id" ]; then
        echo "Usage: $0 send --task-id TASK_ID --agent-id AGENT_ID"
        exit 1
    fi

    log_debug "Sending heartbeat for task=$task_id, agent=$agent_id"

    # Use SETEX to create a key with expiration
    $REDIS_CLI SETEX "swarm:agent_status:${task_id}:${agent_id}" "$HEARTBEAT_TTL" "alive"
    echo "Heartbeat sent for agent ${agent_id} in task ${task_id}"
}

check_heartbeat() {
    local task_id="$1"
    local agent_id="$2"

    if [ -z "$task_id" ] || [ -z "$agent_id" ]; then
        echo "Usage: $0 check --task-id TASK_ID --agent-id AGENT_ID"
        exit 1
    fi

    local key="swarm:agent_status:${task_id}:${agent_id}"
    local status
    local ttl

    # Retrieve status and TTL
    status=$($REDIS_CLI GET "$key")
    ttl=$($REDIS_CLI TTL "$key")

    log_debug "Checking heartbeat for task=$task_id, agent=$agent_id: status=$status, ttl=$ttl"

    # Check for key existence and status
    if [ -z "$status" ] || [ "$ttl" -le 0 ]; then
        log_debug "Heartbeat DEAD: status missing or expired"
        echo "dead"
        increment_missed_counter "$task_id" "$agent_id"
        return 1
    else
        log_debug "Heartbeat ALIVE: status=$status, ttl=$ttl"
        echo "alive"
        return 0
    fi
}

increment_missed_counter() {
    local task_id="$1"
    local agent_id="$2"
    local missed_key="swarm:missed_heartbeats:${task_id}:${agent_id}"

    # Increment missed heartbeat counter
    local missed_count=$($REDIS_CLI INCR "$missed_key")

    # Set expiry for missed counter to match heartbeat TTL
    $REDIS_CLI EXPIRE "$missed_key" $HEARTBEAT_TTL

    log_debug "Missed heartbeat counter for task=$task_id, agent=$agent_id: count=$missed_count"

    if [ "$missed_count" -ge "$MISSED_THRESHOLD" ]; then
        # Trigger quorum fallback mechanism
        $REDIS_CLI LPUSH "swarm:${task_id}:quorum_fallback" "$agent_id"
        log_debug "QUORUM FALLBACK: Agent $agent_id missed $missed_count heartbeats"
        echo "WARN: Agent $agent_id missed $missed_count heartbeats. Quorum fallback triggered."
    fi
}

# Parse arguments
case "$1" in
    send)
        shift
        while [[ "$#" -gt 0 ]]; do
            case $1 in
                --task-id) task_id="$2"; shift ;;
                --agent-id) agent_id="$2"; shift ;;
                *) echo "Unknown parameter passed: $1"; exit 1 ;;
            esac
            shift
        done
        send_heartbeat "$task_id" "$agent_id"
        ;;
    check)
        shift
        while [[ "$#" -gt 0 ]]; do
            case $1 in
                --task-id) task_id="$2"; shift ;;
                --agent-id) agent_id="$2"; shift ;;
                *) echo "Unknown parameter passed: $1"; exit 1 ;;
            esac
            shift
        done
        check_heartbeat "$task_id" "$agent_id"
        ;;
    *)
        echo "Usage: $0 {send|check} --task-id TASK_ID --agent-id AGENT_ID"
        exit 1
        ;;
esac
