#!/bin/bash
# B10 Agent Worker - TypeScript Fixer (No Pre-Validation)
# Just fixes based on expected error count, skips TypeScript compilation checks

set -euo pipefail

REDIS_HOST="${REDIS_HOST:-redis}"
TASK_ID="${TASK_ID:-b10-typescript-fix}"
AGENT_ID="${AGENT_ID:-unknown}"

echo "🤖 Agent $AGENT_ID starting..."

# Pop task from queue (atomic operation)
TASK_NUM=$(redis-cli -h "$REDIS_HOST" RPOP "task:queue" 2>/dev/null || echo "")

if [ -z "$TASK_NUM" ]; then
    echo "⚠️  No tasks available in queue"
    exit 0
fi

echo "📝 Agent $AGENT_ID claimed task #$TASK_NUM"

# Get task details from Redis
FILE=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "file" 2>/dev/null)
EXPECTED_ERRORS=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "expected_errors" 2>/dev/null)

echo "   File: $FILE"
echo "   Expected errors: $EXPECTED_ERRORS"

# Full file path
FULL_PATH="/workspace/$FILE"

if [ ! -f "$FULL_PATH" ]; then
    echo "   ❌ File not found: $FULL_PATH"

    redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
        "agent_id" "$AGENT_ID" \
        "status" "error" \
        "error" "file_not_found" \
        "fixes_applied" "0" \
        "errors_remaining" "$EXPECTED_ERRORS" \
        "completed_at" "$(date -Iseconds)" >/dev/null

    redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null
    exit 1
fi

echo "   ✅ File exists"
echo "   🔧 Invoking Claude Code CLI to fix TypeScript errors (skipping pre-validation)..."

# Create fix prompt
