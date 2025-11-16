#!/bin/bash
# Report agent completion and confidence to Redis
# Replaces deprecated invoke-waiting-mode.sh for CFN Loop coordination
#
# Usage: report-completion.sh --task-id <id> --agent-id <id> --confidence <0.0-1.0> [--result <json>]

set -euo pipefail

# Source centralized Redis functions (provides graceful fallback for Task mode)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/redis-functions.sh"

# Parse arguments
TASK_ID=""
AGENT_ID=""
CONFIDENCE=""
RESULT=""
ITERATION="1"

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
        --confidence)
            CONFIDENCE="$2"
            shift 2
            ;;
        --result)
            RESULT="$2"
            shift 2
            ;;
        --iteration)
            ITERATION="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Validate required parameters
# Note: ANTI-023 memory leak protection now handled by redis-cli-wrapper.sh
# Redis commands will fail gracefully in Task mode (no Redis available)
if [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$CONFIDENCE" ]; then
    echo "Error: Missing required parameters" >&2
    echo "Usage: $0 --task-id <id> --agent-id <id> --confidence <0.0-1.0> [--result <json>] [--iteration <n>]" >&2
    exit 1
fi

# Validate confidence range
if ! awk -v conf="$CONFIDENCE" 'BEGIN { if (conf < 0 || conf > 1) exit 1 }'; then
    echo "Error: Confidence must be between 0.0 and 1.0" >&2
    exit 1
fi

# Step 1: Signal completion (LPUSH for BLPOP coordination)
# Note: redis-cli wrapper handles graceful fallback if Redis unavailable (Task mode)
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" > /dev/null

# Step 2: Store confidence score (STRING key for fast access)
redis-cli SET "swarm:${TASK_ID}:${AGENT_ID}:confidence" "$CONFIDENCE" EX 3600 > /dev/null

# Step 3: Store result in hash (structured data)
if [ -n "$RESULT" ]; then
    redis-cli HSET "swarm:${TASK_ID}:${AGENT_ID}:result" \
        "confidence" "$CONFIDENCE" \
        "iteration" "$ITERATION" \
        "result" "$RESULT" \
        "timestamp" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /dev/null
else
    redis-cli HSET "swarm:${TASK_ID}:${AGENT_ID}:result" \
        "confidence" "$CONFIDENCE" \
        "iteration" "$ITERATION" \
        "timestamp" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /dev/null
fi

# Step 4: Add to agent completion list (for orchestrator tracking)
redis-cli LPUSH "swarm:${TASK_ID}:completed_agents" "$AGENT_ID" > /dev/null

# Step 5: Set TTL on keys (auto-cleanup)
redis-cli EXPIRE "swarm:${TASK_ID}:${AGENT_ID}:result" 3600 > /dev/null
redis-cli EXPIRE "swarm:${TASK_ID}:${AGENT_ID}:done" 3600 > /dev/null

echo "✅ Reported completion for agent: $AGENT_ID (confidence: $CONFIDENCE)"
exit 0
