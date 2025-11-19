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

# Fix prompt with explicit, non-negotiable instructions
FIX_PROMPT="YOUR ONLY JOB: Fix TypeScript errors in ONE FILE.

FILE TO FIX: /workspace/$FILE
EXPECTED ERRORS: Approximately $EXPECTED_ERRORS

STEP 1: Read(/workspace/$FILE)
STEP 2: For each TypeScript error you find, use Edit() to fix it immediately
STEP 3: After fixing all errors, respond with 'COMPLETE'

DO NOT:
- Read tsconfig.json
- Explore project structure
- Check other files
- Use Bash to find files
- Read any file except /workspace/$FILE

ONLY:
- Read /workspace/$FILE
- Edit /workspace/$FILE to fix TypeScript errors
- Nothing else

Start NOW by reading /workspace/$FILE"

# Execute Claude Code CLI with full logging
cd /workspace

# Capture file state before
BEFORE_HASH=$(md5sum "$FULL_PATH" 2>/dev/null | awk '{print $1}' || echo "none")

echo "   🔧 Executing CLI agent..."
echo "   📁 File: $FULL_PATH"
echo "   🔍 Hash before: $BEFORE_HASH"

START_TIME=$(date +%s)
LOG_FILE="/tmp/agent-${AGENT_ID}-task-${TASK_NUM}.log"

# Execute with full output capture (typescript-specialist now at root level)
FIX_OUTPUT=$(node /app/dist/cli/index.js agent typescript-specialist "$FIX_PROMPT" 2>&1 | tee "$LOG_FILE" || true)
CLI_EXIT_CODE=${PIPESTATUS[0]}
FIX_TIME=$(($(date +%s) - START_TIME))

# Capture file state after
AFTER_HASH=$(md5sum "$FULL_PATH" 2>/dev/null | awk '{print $1}' || echo "none")
FILE_CHANGED="false"
[ "$BEFORE_HASH" != "$AFTER_HASH" ] && FILE_CHANGED="true"

echo "   ⏱️  CLI completed in ${FIX_TIME}s (exit: $CLI_EXIT_CODE)"
echo "   🔍 Hash after: $AFTER_HASH"
echo "   📝 File changed: $FILE_CHANGED"
echo "   📄 Full output: $LOG_FILE"

# Report completion with detailed results
redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
    "agent_id" "$AGENT_ID" \
    "status" "fixed" \
    "file" "$FILE" \
    "expected_errors" "$EXPECTED_ERRORS" \
    "fix_time_seconds" "$FIX_TIME" \
    "cli_exit_code" "$CLI_EXIT_CODE" \
    "file_changed" "$FILE_CHANGED" \
    "before_hash" "$BEFORE_HASH" \
    "after_hash" "$AFTER_HASH" \
    "log_file" "$LOG_FILE" \
    "validation" "pending" \
    "completed_at" "$(date -Iseconds)" >/dev/null

redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null

echo "   ✅ Task completed (fix applied, validation pending)"
exit 0
