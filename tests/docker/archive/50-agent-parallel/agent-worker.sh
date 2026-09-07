#!/bin/bash
# Docker Agent Worker Script
# Executes a single task from Redis queue atomically

set -euo pipefail

REDIS_HOST="${REDIS_HOST:-redis}"
TASK_ID="${TASK_ID:-parallel-test}"
AGENT_ID="${AGENT_ID:-unknown}"

# Pop task from queue (atomic operation - prevents work overlap)
TASK_NUM=$(redis-cli -h "$REDIS_HOST" RPOP "task:queue" 2>/dev/null || echo "")

if [ -z "$TASK_NUM" ]; then
    echo "⚠️  No tasks available in queue"
    exit 0
fi

echo "📝 Agent $AGENT_ID claimed task #$TASK_NUM"

# Random sleep between 60-300 seconds to observe agents in Docker Desktop
SLEEP_DURATION=$((60 + RANDOM % 241))
echo "   ⏱️  Sleeping for ${SLEEP_DURATION}s (random delay for observation)..."
sleep "$SLEEP_DURATION"

# Get task details from Redis
FILE=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "file" 2>/dev/null)
CONTENT=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "content" 2>/dev/null)
EXPECTED_RESULT=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "expected" 2>/dev/null)

echo "   File: $FILE"
echo "   Expected: $EXPECTED_RESULT"

# Create workspace and write file
WORKSPACE="/tmp/workspace-$$"
mkdir -p "$WORKSPACE"
echo "$CONTENT" > "$WORKSPACE/$FILE"

# Simulate post-edit validation (simple syntax check for now)
VALIDATION_RESULT="PASS"

# Check for intentional errors
if echo "$CONTENT" | grep -q "SYNTAX_ERROR"; then
    VALIDATION_RESULT="SYNTAX_ERROR"
elif echo "$CONTENT" | grep -q "SECURITY_ISSUE"; then
    VALIDATION_RESULT="SECURITY_ISSUE"
elif echo "$CONTENT" | grep -q "COMPLEXITY_HIGH"; then
    VALIDATION_RESULT="COMPLEXITY_HIGH"
fi

# Report completion to Redis
redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
    "agent_id" "$AGENT_ID" \
    "validation_result" "$VALIDATION_RESULT" \
    "expected_result" "$EXPECTED_RESULT" \
    "completed_at" "$(date -Iseconds)" \
    "file" "$FILE" >/dev/null

# Increment completion counter
redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null

# Check if validation matched expectation
if [ "$VALIDATION_RESULT" = "$EXPECTED_RESULT" ]; then
    echo "   ✅ Validation correct: $VALIDATION_RESULT"
    exit 0
else
    echo "   ❌ Validation mismatch: got $VALIDATION_RESULT, expected $EXPECTED_RESULT"
    exit 1
fi
