#!/bin/bash
# Redis Coordination Skill - Agent Emergency Recovery
# Version: 1.0.0
# Last Updated: 2025-10-19

# Strict error handling
set -euo pipefail

# Default values
TASK_ID=""
AGENT_ID=""
RECOVERY_MODE="soft"  # Options: soft, hard

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --mode)
            RECOVERY_MODE="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$TASK_ID" || -z "$AGENT_ID" ]]; then
    echo "Error: task-id and agent-id are required"
    exit 1
fi

# Log recovery attempt
echo "[$(date -u)] Attempting ${RECOVERY_MODE} recovery for agent: ${AGENT_ID}" >> /var/log/claude-flow/agent-recovery.log

# Retrieve agent context before recovery
AGENT_CONTEXT=$(redis-cli get "swarm:${TASK_ID}:${AGENT_ID}:context")

# Recovery actions based on mode
case "$RECOVERY_MODE" in
    "soft")
        # Soft recovery: Spawn new agent with previous context
        npx claude-flow@alpha spawn "$AGENT_ID" \
            --task-id "$TASK_ID" \
            --recovery-context "$AGENT_CONTEXT"
        ;;
    "hard")
        # Hard recovery: Full agent replacement
        npx claude-flow@alpha spawn "$AGENT_ID" \
            --task-id "$TASK_ID" \
            --mode replace \
            --recovery-context "$AGENT_CONTEXT"
        ;;
    *)
        echo "Invalid recovery mode: ${RECOVERY_MODE}"
        exit 1
        ;;
esac

# Update active agents set
redis-cli sadd "swarm:${TASK_ID}:active-agents" "$AGENT_ID"

# Log recovery completion
echo "[$(date -u)] Recovery completed for agent: ${AGENT_ID}" >> /var/log/claude-flow/agent-recovery.log

exit 0