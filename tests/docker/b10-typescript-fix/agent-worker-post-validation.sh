#!/bin/bash
# B10 Agent Worker - Fix first, validate later
# Skips individual file validation, relies on post-execution project build

set -euo pipefail

REDIS_HOST="${REDIS_HOST:-redis}"
TASK_ID="${TASK_ID:-b10-typescript-fix}"
AGENT_ID="${AGENT_ID:-unknown}"

echo "🤖 Agent $AGENT_ID starting..."

# Pop task from queue
TASK_NUM=$(redis-cli -h "$REDIS_HOST" RPOP "task:queue" 2>/dev/null || echo "")

if [ -z "$TASK_NUM" ]; then
    echo "⚠️  No tasks available"
    exit 0
fi

echo "📝 Agent $AGENT_ID claimed task #$TASK_NUM"

# Get task details
FILE=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "file" 2>/dev/null)
EXPECTED_ERRORS=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "expected_errors" 2>/dev/null)

echo "   File: $FILE"
echo "   Expected errors: $EXPECTED_ERRORS"

FULL_PATH="/workspace/$FILE"

if [ ! -f "$FULL_PATH" ]; then
    echo "   ❌ File not found"
    redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
        "agent_id" "$AGENT_ID" \
        "status" "error" \
        "error" "file_not_found" >/dev/null
    redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null
    exit 1
fi

echo "   ✅ File exists"
echo "   🔧 Invoking Claude Code CLI to fix TypeScript errors..."

# Fix prompt
FIX_PROMPT="You are fixing TypeScript errors in this file: $FILE

REQUIRED ACTIONS:
1. Read the file using the Read tool
2. Identify approximately $EXPECTED_ERRORS TypeScript errors (type annotations, missing imports, incorrect types, type safety issues)
3. Use the Edit tool to fix EACH error - dont explain, just fix it
4. After all fixes, read the file again to confirm changes

The file is located at: /workspace/$FILE
Work directly in /workspace - all changes are persisted.

Fix the TypeScript errors. Report: COMPLETE when done with confidence 0.85+"

# Execute Claude Code CLI
cd /workspace
START_TIME=$(date +%s)
FIX_OUTPUT=$(node /app/dist/cli/index.js agent typescript-specialist "$FIX_PROMPT" 2>&1 || true)
FIX_TIME=$(($(date +%s) - START_TIME))

echo "   ✅ Claude Code CLI completed in ${FIX_TIME}s"
echo "   📋 Validation will happen after all agents complete"

# Report completion
redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
    "agent_id" "$AGENT_ID" \
    "status" "fixed" \
    "file" "$FILE" \
    "expected_errors" "$EXPECTED_ERRORS" \
    "fix_time_seconds" "$FIX_TIME" \
    "validation" "pending" \
    "completed_at" "$(date -Iseconds)" >/dev/null

redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null

echo "   ✅ Task completed (fix applied, validation pending)"
exit 0
