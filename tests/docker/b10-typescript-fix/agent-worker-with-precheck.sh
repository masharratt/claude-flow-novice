#!/bin/bash
# B10 Agent Worker - WITH TypeScript Pre-Check
# Validates errors exist before invoking agent, includes error details in prompt

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

# NEW: Pre-check TypeScript errors in this file
echo "   🔍 Pre-checking TypeScript errors..."
cd /workspace

# Run tsc on just this file, filter to errors in this file only
TSC_CHECK=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "$FILE.*error TS" || echo "")
ERROR_COUNT=$(echo "$TSC_CHECK" | grep -c "error TS" || echo "0")

echo "   📊 Pre-check found $ERROR_COUNT TypeScript errors"

if [ "$ERROR_COUNT" -eq 0 ]; then
    echo "   ✅ No TypeScript errors found - skipping fix"
    redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
        "agent_id" "$AGENT_ID" \
        "status" "skipped" \
        "file" "$FILE" \
        "reason" "no_errors_found" \
        "expected_errors" "$EXPECTED_ERRORS" \
        "actual_errors" "0" \
        "completed_at" "$(date -Iseconds)" >/dev/null
    redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null
    exit 0
fi

# Extract error details for prompt
ERROR_DETAILS=$(echo "$TSC_CHECK" | head -10)

echo "   🔧 Invoking Claude Code CLI to fix TypeScript errors..."

# Capture file state before
BEFORE_HASH=$(md5sum "$FULL_PATH" 2>/dev/null | awk '{print $1}' || echo "none")

echo "   📁 File: $FULL_PATH"
echo "   🔍 Hash before: $BEFORE_HASH"

START_TIME=$(date +%s)
LOG_FILE="/tmp/agent-${AGENT_ID}-task-${TASK_NUM}.log"

# Simple prompt with error context
FIX_PROMPT="Fix TypeScript errors in /workspace/$FILE using Edit tool.

Errors found:
$ERROR_DETAILS"

# Execute with full output capture
FIX_OUTPUT=$(node /app/dist/cli/index.js agent docker-ts-fixer "$FIX_PROMPT" 2>&1 | tee "$LOG_FILE" || true)
CLI_EXIT_CODE=${PIPESTATUS[0]}
FIX_TIME=$(($(date +%s) - START_TIME))

# Capture file state after
AFTER_HASH=$(md5sum "$FULL_PATH" 2>/dev/null | awk '{print $1}' || echo "none")
FILE_CHANGED="false"
[ "$BEFORE_HASH" != "$AFTER_HASH" ] && FILE_CHANGED="true"

# NEW: Post-check TypeScript errors
echo "   🔍 Post-checking TypeScript errors..."
TSC_RECHECK=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "$FILE.*error TS" || echo "")
ERRORS_REMAINING=$(echo "$TSC_RECHECK" | grep -c "error TS" || echo "0")

echo "   ⏱️  CLI completed in ${FIX_TIME}s (exit: $CLI_EXIT_CODE)"
echo "   🔍 Hash after: $AFTER_HASH"
echo "   📝 File changed: $FILE_CHANGED"
echo "   📊 Errors before: $ERROR_COUNT"
echo "   📊 Errors after: $ERRORS_REMAINING"
echo "   📄 Full output: $LOG_FILE"

# Calculate fixes applied
FIXES_APPLIED=$((ERROR_COUNT - ERRORS_REMAINING))
if [ $FIXES_APPLIED -lt 0 ]; then
    FIXES_APPLIED=0
fi

# Report completion with detailed results
redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
    "agent_id" "$AGENT_ID" \
    "status" "fixed" \
    "file" "$FILE" \
    "expected_errors" "$EXPECTED_ERRORS" \
    "errors_before" "$ERROR_COUNT" \
    "errors_after" "$ERRORS_REMAINING" \
    "fixes_applied" "$FIXES_APPLIED" \
    "fix_time_seconds" "$FIX_TIME" \
    "cli_exit_code" "$CLI_EXIT_CODE" \
    "file_changed" "$FILE_CHANGED" \
    "before_hash" "$BEFORE_HASH" \
    "after_hash" "$AFTER_HASH" \
    "log_file" "$LOG_FILE" \
    "completed_at" "$(date -Iseconds)" >/dev/null

redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null

if [ "$ERRORS_REMAINING" -eq 0 ]; then
    echo "   ✅ All TypeScript errors fixed!"
elif [ "$FIXES_APPLIED" -gt 0 ]; then
    echo "   ⚠️  Partial fix: $FIXES_APPLIED/$ERROR_COUNT errors resolved"
else
    echo "   ❌ No errors fixed (file may still have issues)"
fi

exit 0
