#!/bin/bash
# Enhanced B10 Agent Worker - Worker Pool Pattern
# Loops until queue empty with claim-before-remove, memory monitoring, circuit breaker

set -euo pipefail

REDIS_HOST="${REDIS_HOST:-redis}"
TASK_ID="${TASK_ID:-b10-typescript-fix}"
AGENT_ID="${AGENT_ID:-unknown}"
MAX_TASKS="${MAX_TASKS:-100}"  # Safety limit per agent
MEMORY_LIMIT_BYTES=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo "536870912")  # Default 512MB
MEMORY_THRESHOLD_PERCENT=80  # Restart if memory > 80%

echo "🤖 Agent $AGENT_ID starting (worker pool mode)..."
echo "   Max tasks per agent: $MAX_TASKS"
echo "   Memory limit: $((MEMORY_LIMIT_BYTES / 1048576))MB"
echo "   Memory threshold: ${MEMORY_THRESHOLD_PERCENT}%"

TASKS_COMPLETED=0

# Function: Atomic task claim with timeout
claim_task() {
    # Lua script for atomic claim-before-remove
    redis-cli -h "$REDIS_HOST" --eval - task:queue task:claimed "$AGENT_ID" <<'LUA'
-- Atomic: Pop from queue AND create claim with TTL
local queue_key = KEYS[1]
local claimed_prefix = KEYS[2]
local agent_id = ARGV[1]

-- Pop task from queue
local task_num = redis.call('RPOP', queue_key)
if not task_num then
    return nil  -- No tasks available
end

-- Create claim with 5-minute TTL (task must complete or claim expires)
local claim_key = claimed_prefix .. ':' .. task_num
redis.call('SETEX', claim_key, 300, agent_id)

return task_num
LUA
}

# Function: Check memory usage and decide if agent should restart
check_memory() {
    local CURRENT_MEM=$(cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null || echo "0")
    local MEM_PERCENT=$((CURRENT_MEM * 100 / MEMORY_LIMIT_BYTES))

    if [ $MEM_PERCENT -gt $MEMORY_THRESHOLD_PERCENT ]; then
        echo "⚠️  Memory usage at ${MEM_PERCENT}% (> ${MEMORY_THRESHOLD_PERCENT}%)"
        return 1  # Signal to restart
    fi

    return 0
}

# Function: Release claim (called on success or abort)
release_claim() {
    local TASK_NUM=$1
    redis-cli -h "$REDIS_HOST" DEL "task:claimed:$TASK_NUM" >/dev/null 2>&1 || true
}

# Function: Re-queue task (called on abort/failure)
requeue_task() {
    local TASK_NUM=$1
    local REASON=$2

    echo "   ↩️  Re-queuing task #$TASK_NUM (reason: $REASON)"
    redis-cli -h "$REDIS_HOST" LPUSH "task:queue" "$TASK_NUM" >/dev/null
    release_claim "$TASK_NUM"
}

# Function: Track OOM attempts for circuit breaker
track_oom() {
    local TASK_NUM=$1
    local OOM_COUNT=$(redis-cli -h "$REDIS_HOST" HINCRBY "task:$TASK_NUM" "oom_count" 1)

    if [ "$OOM_COUNT" -ge 3 ]; then
        echo "   🚨 Task #$TASK_NUM has caused $OOM_COUNT OOMs - escalating to high-memory queue"
        redis-cli -h "$REDIS_HOST" LPUSH "task:queue:high-memory" "$TASK_NUM" >/dev/null
        redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM" "requires_high_memory" "true" >/dev/null
        release_claim "$TASK_NUM"
        return 1  # Don't re-queue to normal queue
    fi

    return 0
}

# Main task loop
while [ $TASKS_COMPLETED -lt $MAX_TASKS ]; do
    # Atomic claim
    TASK_NUM=$(claim_task)

    if [ -z "$TASK_NUM" ]; then
        echo "✅ No more tasks available (completed $TASKS_COMPLETED tasks)"
        exit 0
    fi

    echo ""
    echo "📝 Agent $AGENT_ID claimed task #$TASK_NUM (task $((TASKS_COMPLETED + 1))/$MAX_TASKS)"

    # Get task details
    FILE=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "file" 2>/dev/null)
    EXPECTED_ERRORS=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "expected_errors" 2>/dev/null)

    echo "   File: $FILE"
    echo "   Expected errors: $EXPECTED_ERRORS"

    # Pre-flight checks
    FULL_PATH="/workspace/$FILE"

    if [ ! -f "$FULL_PATH" ]; then
        echo "   ❌ File not found"
        redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
            "agent_id" "$AGENT_ID" \
            "status" "error" \
            "error" "file_not_found" >/dev/null
        redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null
        release_claim "$TASK_NUM"
        TASKS_COMPLETED=$((TASKS_COMPLETED + 1))
        continue
    fi

    # Memory check before starting work
    if ! check_memory; then
        echo "   🔄 Memory threshold exceeded - restarting agent for clean state"
        requeue_task "$TASK_NUM" "memory_threshold"
        exit 0  # Coordinator will spawn fresh agent
    fi

    echo "   ✅ File exists, starting work..."

    # Fix prompt
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

    # Execute Claude Code CLI
    cd /workspace

    BEFORE_HASH=$(md5sum "$FULL_PATH" 2>/dev/null | awk '{print $1}' || echo "none")
    echo "   🔧 Executing CLI agent..."
    echo "   📁 File: $FULL_PATH"
    echo "   🔍 Hash before: $BEFORE_HASH"

    START_TIME=$(date +%s)
    LOG_FILE="/tmp/agent-${AGENT_ID}-task-${TASK_NUM}.log"

    # Execute with timeout protection (5 min per task)
    timeout 300 node /app/dist/cli/index.js agent typescript-specialist "$FIX_PROMPT" 2>&1 | tee "$LOG_FILE" || CLI_EXIT_CODE=$?
    CLI_EXIT_CODE=${CLI_EXIT_CODE:-0}
    FIX_TIME=$(($(date +%s) - START_TIME))

    # Capture file state after
    AFTER_HASH=$(md5sum "$FULL_PATH" 2>/dev/null | awk '{print $1}' || echo "none")
    FILE_CHANGED="false"
    [ "$BEFORE_HASH" != "$AFTER_HASH" ] && FILE_CHANGED="true"

    echo "   ⏱️  CLI completed in ${FIX_TIME}s (exit: $CLI_EXIT_CODE)"
    echo "   🔍 Hash after: $AFTER_HASH"
    echo "   📝 File changed: $FILE_CHANGED"
    echo "   📄 Full output: $LOG_FILE"

    # Handle timeout (exit code 124 from timeout command)
    if [ $CLI_EXIT_CODE -eq 124 ]; then
        echo "   ⏱️  Task timeout (5 minutes) - re-queuing"
        requeue_task "$TASK_NUM" "timeout"
        TASKS_COMPLETED=$((TASKS_COMPLETED + 1))
        continue
    fi

    # Handle OOM (exit code 137)
    if [ $CLI_EXIT_CODE -eq 137 ]; then
        echo "   💥 OOM killed during task execution"
        if track_oom "$TASK_NUM"; then
            requeue_task "$TASK_NUM" "oom_kill"
        fi
        # Agent likely dying, exit gracefully
        exit 137
    fi

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
        "completed_at" "$(date -Iseconds)" \
        "task_number_in_agent" "$((TASKS_COMPLETED + 1))" >/dev/null

    redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null
    release_claim "$TASK_NUM"

    echo "   ✅ Task completed successfully"

    TASKS_COMPLETED=$((TASKS_COMPLETED + 1))

    # Aggressive garbage collection between tasks (if Node.js supports it)
    if command -v node >/dev/null 2>&1; then
        node --expose-gc -e "if (global.gc) global.gc(); console.log('GC triggered')" 2>/dev/null || true
    fi

    # Brief pause between tasks (prevent CPU spin)
    sleep 1
done

echo ""
echo "✅ Agent $AGENT_ID completed $TASKS_COMPLETED tasks (max limit reached)"
exit 0
