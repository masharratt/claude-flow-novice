#!/bin/bash
# Report agent completion and confidence to Redis
# Replaces deprecated invoke-waiting-mode.sh for CFN Loop coordination
#
# Usage: report-completion.sh --task-id <id> --agent-id <id> --confidence <0.0-1.0> [--result <json>]

set -euo pipefail

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

# ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Block Task Mode agents
# Task Mode agents spawn via Task() tool and should NOT use Redis coordination
if [[ -z "${TASK_ID:-}" || -z "${AGENT_ID:-}" ]]; then
    echo "❌ TASK MODE DETECTED - Redis coordination forbidden" >&2
    echo "🚨 ANTI-023: This script is for CLI-spawned agents only" >&2
    echo "💡 Task Mode agents should return JSON directly to Main Chat" >&2
    echo "🔧 Agent spawned via Task() tool - use structured JSON output instead" >&2
    exit 1
fi

# Validate required parameters
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

# Set TTL on hash
redis-cli EXPIRE "swarm:${TASK_ID}:${AGENT_ID}:result" 3600 > /dev/null
redis-cli EXPIRE "swarm:${TASK_ID}:${AGENT_ID}:done" 3600 > /dev/null

echo "✅ Reported completion for agent: $AGENT_ID (confidence: $CONFIDENCE)"
exit 0
