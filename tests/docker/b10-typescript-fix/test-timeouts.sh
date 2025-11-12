#!/bin/bash
# Test different TypeScript compilation timeouts with 3 agents
set -euo pipefail

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6381}"
NETWORK_NAME="cfn-b10-fix"
AGENT_REDIS_HOST="cfn-b10-redis"

FRONTEND_PATH="/mnt/c/Users/masha/Documents/ourstories-v2/frontend"
BATCHES_JSON="${FRONTEND_PATH}/planning/frontend/frontend-error-batches.json"

echo "🧪 TIMEOUT TEST - 3 Agents with Different Timeouts"
echo "=================================================="
echo ""
echo "Testing TypeScript compilation timeouts:"
echo "   Agent 1: 60 second timeout"
echo "   Agent 2: 120 second timeout (2 min)"
echo "   Agent 3: 180 second timeout (3 min)"
echo ""

# Clear Redis
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:queue" >/dev/null 2>&1 || true
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:completed" >/dev/null 2>&1 || true

# Create 3 tasks from B10
TASK_NUM=1
for FILE in \
    "src/services/auth.service.ts" \
    "src/services/security/EncryptedStorageService.ts" \
    "src/services/permissions/ReadOnlyEnforcer.ts"
do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "task:queue" "$TASK_NUM" >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "task:$TASK_NUM" \
        "file" "$FILE" \
        "expected_errors" "5" \
        "batch" "B10-timeout-test" >/dev/null
    ((TASK_NUM++))
done

redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "task:total" "3" >/dev/null

echo "✅ Created 3 test tasks"
echo ""

# Create 3 worker scripts with different timeouts
WORKER_DIR="/tmp/b10-timeout-test"
mkdir -p "$WORKER_DIR"

for TIMEOUT in 60 120 180; do
    cat > "$WORKER_DIR/worker-${TIMEOUT}s.sh" << 'WORKER_EOF'
#!/bin/bash
set -euo pipefail

REDIS_HOST="${REDIS_HOST:-redis}"
TASK_ID="${TASK_ID:-b10-timeout-test}"
AGENT_ID="${AGENT_ID:-unknown}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"

echo "🤖 Agent $AGENT_ID starting (timeout: ${TIMEOUT_SECONDS}s)..."

TASK_NUM=$(redis-cli -h "$REDIS_HOST" RPOP "task:queue" 2>/dev/null || echo "")
if [ -z "$TASK_NUM" ]; then
    echo "⚠️  No tasks available"
    exit 0
fi

echo "📝 Agent $AGENT_ID claimed task #$TASK_NUM"

FILE=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "file" 2>/dev/null)
echo "   File: $FILE"
echo "   Timeout: ${TIMEOUT_SECONDS}s"

FULL_PATH="/workspace/$FILE"
if [ ! -f "$FULL_PATH" ]; then
    echo "   ❌ File not found: $FULL_PATH"
    exit 1
fi

echo "   ✅ File exists, checking TypeScript errors with ${TIMEOUT_SECONDS}s timeout..."

cd /workspace
START_TIME=$(date +%s)
TSC_OUTPUT=$(timeout "$TIMEOUT_SECONDS" npx tsc --noEmit "$FILE" 2>&1 || true)
TSC_EXIT=$?
CHECK_TIME=$(($(date +%s) - START_TIME))

if [ $TSC_EXIT -eq 124 ]; then
    echo "   ⚠️  TypeScript check TIMED OUT after ${CHECK_TIME}s"
    INITIAL_ERROR_COUNT=0
    STATUS="timeout"
else
    INITIAL_ERROR_COUNT=$(echo "$TSC_OUTPUT" | grep "error TS" | wc -l)
    echo "   ✅ TypeScript check completed in ${CHECK_TIME}s"
    echo "   Initial error count: $INITIAL_ERROR_COUNT"
    STATUS="success"
fi

# Report results
redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
    "agent_id" "$AGENT_ID" \
    "status" "$STATUS" \
    "timeout_seconds" "$TIMEOUT_SECONDS" \
    "check_time_seconds" "$CHECK_TIME" \
    "initial_errors" "$INITIAL_ERROR_COUNT" \
    "timed_out" "$([ $TSC_EXIT -eq 124 ] && echo 'true' || echo 'false')" \
    "completed_at" "$(date -Iseconds)" >/dev/null

redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null

echo "   ✅ Task completed (status: $STATUS, check took ${CHECK_TIME}s)"
exit 0
WORKER_EOF

    sed -i 's/\r$//' "$WORKER_DIR/worker-${TIMEOUT}s.sh"
    chmod +x "$WORKER_DIR/worker-${TIMEOUT}s.sh"
done

echo "🚀 Spawning 3 agents with different timeout configurations..."

# Spawn agent 1: 60s timeout
docker run -d \
    --name "b10-timeout-test-60s" \
    --network "$NETWORK_NAME" \
    --memory="1g" \
    -v "$WORKER_DIR/worker-60s.sh:/tmp/worker.sh:ro" \
    -v "$FRONTEND_PATH:/workspace:rw" \
    -e REDIS_HOST="$AGENT_REDIS_HOST" \
    -e TASK_ID="b10-timeout-test" \
    -e AGENT_ID="timeout-60s" \
    -e TIMEOUT_SECONDS="60" \
    claude-flow-novice:agent \
    bash /tmp/worker.sh >/dev/null 2>&1

# Spawn agent 2: 120s timeout
docker run -d \
    --name "b10-timeout-test-120s" \
    --network "$NETWORK_NAME" \
    --memory="1g" \
    -v "$WORKER_DIR/worker-120s.sh:/tmp/worker.sh:ro" \
    -v "$FRONTEND_PATH:/workspace:rw" \
    -e REDIS_HOST="$AGENT_REDIS_HOST" \
    -e TASK_ID="b10-timeout-test" \
    -e AGENT_ID="timeout-120s" \
    -e TIMEOUT_SECONDS="120" \
    claude-flow-novice:agent \
    bash /tmp/worker.sh >/dev/null 2>&1

# Spawn agent 3: 180s timeout
docker run -d \
    --name "b10-timeout-test-180s" \
    --network "$NETWORK_NAME" \
    --memory="1g" \
    -v "$WORKER_DIR/worker-180s.sh:/tmp/worker.sh:ro" \
    -v "$FRONTEND_PATH:/workspace:rw" \
    -e REDIS_HOST="$AGENT_REDIS_HOST" \
    -e TASK_ID="b10-timeout-test" \
    -e AGENT_ID="timeout-180s" \
    -e TIMEOUT_SECONDS="180" \
    claude-flow-novice:agent \
    bash /tmp/worker.sh >/dev/null 2>&1

echo "   ✅ All 3 agents spawned"
echo ""

# Monitor completion
echo "📊 Monitoring timeout test (max 5 minutes)..."
START_TIME=$(date +%s)
MAX_WAIT=300

while true; do
    COMPLETED=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "task:completed" 2>/dev/null || echo "0")
    ELAPSED=$(($(date +%s) - START_TIME))

    echo -ne "   Progress: $COMPLETED/3 tasks completed (${ELAPSED}s elapsed)\r"

    if [ "$COMPLETED" -ge 3 ]; then
        echo ""
        break
    fi

    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
        echo ""
        echo "   ⚠️  Max wait time reached"
        break
    fi

    sleep 2
done

TOTAL_TIME=$(($(date +%s) - START_TIME))
echo ""
echo "================================================"
echo "TIMEOUT TEST RESULTS"
echo "================================================"

for i in 1 2 3; do
    AGENT_ID=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "agent_id" 2>/dev/null || echo "none")
    STATUS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "status" 2>/dev/null || echo "incomplete")
    TIMEOUT_SEC=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "timeout_seconds" 2>/dev/null || echo "0")
    CHECK_TIME=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "check_time_seconds" 2>/dev/null || echo "0")
    TIMED_OUT=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "timed_out" 2>/dev/null || echo "unknown")
    ERRORS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "initial_errors" 2>/dev/null || echo "0")

    echo ""
    echo "Task $i ($AGENT_ID):"
    echo "   Timeout configured: ${TIMEOUT_SEC}s"
    echo "   Check time: ${CHECK_TIME}s"
    echo "   Timed out: $TIMED_OUT"
    echo "   Status: $STATUS"
    echo "   Errors found: $ERRORS"
done

echo ""
echo "Total test time: ${TOTAL_TIME}s"
echo ""

# Show agent logs
echo "📋 Agent Logs:"
echo ""
for AGENT in "b10-timeout-test-60s" "b10-timeout-test-120s" "b10-timeout-test-180s"; do
    echo "=== $AGENT ==="
    docker logs "$AGENT" 2>&1 | tail -10
    echo ""
done

exit 0
