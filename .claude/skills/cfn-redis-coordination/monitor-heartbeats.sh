#!/bin/bash
# Redis Coordination Skill - Agent Heartbeat Monitor
# Version: 1.0.0
# Last Updated: 2025-10-19

# Strict error handling
set -euo pipefail

# Default values
TASK_ID=""
CHECK_INTERVAL=30
MISS_THRESHOLD=2
AGENTS=()

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --check-interval)
            CHECK_INTERVAL="$2"
            shift 2
            ;;
        --miss-threshold)
            MISS_THRESHOLD="$2"
            shift 2
            ;;
        --agents)
            IFS=',' read -ra AGENTS <<< "$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$TASK_ID" ]]; then
    echo "Error: task-id is required"
    exit 1
fi

# Function to check agent heartbeat
check_agent_heartbeat() {
    local agent_id="$1"
    local miss_count=0
    local last_heartbeat

    # Check heartbeat key
    last_heartbeat=$(redis-cli get "swarm:${TASK_ID}:${agent_id}:heartbeat")

    # If no heartbeat found, increment miss count
    if [[ -z "$last_heartbeat" ]]; then
        ((miss_count++))
        echo "[$(date -u)] No heartbeat detected for agent: ${agent_id}" >> /var/log/claude-flow/heartbeat-misses.log
    else
        # Reset miss count if heartbeat exists
        miss_count=0
    fi

    # Trigger actions on missed heartbeats
    if ((miss_count >= MISS_THRESHOLD)); then
        handle_agent_failure "$agent_id"
    fi
}

# Function to handle agent failure
handle_agent_failure() {
    local agent_id="$1"

    # Log agent failure
    echo "[$(date -u)] CRITICAL: Agent ${agent_id} failed health check" >> /var/log/claude-flow/agent-failures.log

    # Remove from active agents
    redis-cli srem "swarm:${TASK_ID}:active-agents" "$agent_id"

    # Trigger emergency recovery
    ./.claude/skills/redis-coordination/agent-recovery.sh \
        --task-id "$TASK_ID" \
        --agent-id "$agent_id"
}

# Main monitoring loop
while true; do
    # If no agents specified, fetch from Redis set
    if [[ ${#AGENTS[@]} -eq 0 ]]; then
        mapfile -t AGENTS < <(redis-cli smembers "swarm:${TASK_ID}:active-agents")
    fi

    # Check heartbeat for each agent
    for agent in "${AGENTS[@]}"; do
        check_agent_heartbeat "$agent"
    done

    # Sleep before next check
    sleep "$CHECK_INTERVAL"
done