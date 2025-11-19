#!/bin/bash
# Test TypeScript compilation with different memory allocations and timeouts
# 4 agents total: 2GB/60s, 2GB/180s, 4GB/60s, 4GB/180s

set -euo pipefail

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6381}"
NETWORK_NAME="cfn-b10-fix"
AGENT_REDIS_HOST="cfn-b10-redis"

FRONTEND_PATH="/mnt/c/Users/masha/Documents/ourstories-v2/frontend"
BATCHES_JSON="${FRONTEND_PATH}/planning/frontend/frontend-error-batches.json"

echo "🧪 MEMORY + TIMEOUT TEST - 4 Agent Configurations"
echo "=================================================="
echo ""
echo "Testing TypeScript compilation with different resources:"
echo "   Agent 1: 2GB RAM, 60 second timeout (1 min)"
echo "   Agent 2: 2GB RAM, 180 second timeout (3 min)"
echo "   Agent 3: 4GB RAM, 60 second timeout (1 min)"
echo "   Agent 4: 4GB RAM, 180 second timeout (3 min)"
echo ""

# Clear Redis
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:queue" >/dev/null 2>&1 || true
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:completed" >/dev/null 2>&1 || true

# Create 4 tasks from B10
TASK_NUM=1
for FILE in \
    "src/services/auth.service.ts" \
    "src/services/security/EncryptedStorageService.ts" \
    "src/services/permissions/ReadOnlyEnforcer.ts" \
    "src/services/security/BiometricAuthService.ts"
do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "task:queue" "$TASK_NUM" >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "task:$TASK_NUM" \
        "file" "$FILE" \
        "expected_errors" "5" \
        "batch" "B10-memory-timeout-test" >/dev/null
    ((TASK_NUM++))
done

redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "task:total" "4" >/dev/null

echo "✅ Created 4 test tasks"
echo ""

# Create worker script template
WORKER_DIR="/tmp/b10-memory-timeout-test"
mkdir -p "$WORKER_DIR"

cat > "$WORKER_DIR/worker-template.sh" << 'WORKER_EOF'
#!/bin/bash
set -euo pipefail

REDIS_HOST="${REDIS_HOST:-redis}"
TASK_ID="${TASK_ID:-b10-memory-timeout-test}"
AGENT_ID="${AGENT_ID:-unknown}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"
MEMORY_GB="${MEMORY_GB:-2}"

echo "🤖 Agent $AGENT_ID starting (memory: ${MEMORY_GB}GB, timeout: ${TIMEOUT_SECONDS}s)..."

TASK_NUM=$(redis-cli -h "$REDIS_HOST" RPOP "task:queue" 2>/dev/null || echo "")
if [ -z "$TASK_NUM" ]; then
    echo "⚠️  No tasks available"
    exit 0
fi

echo "📝 Agent $AGENT_ID claimed task #$TASK_NUM"

FILE=$(redis-cli -h "$REDIS_HOST" HGET "task:$TASK_NUM" "file" 2>/dev/null)
echo "   File: $FILE"
echo "   Memory: ${MEMORY_GB}GB"
echo "   Timeout: ${TIMEOUT_SECONDS}s"

FULL_PATH="/workspace/$FILE"
if [ ! -f "$FULL_PATH" ]; then
    echo "   ❌ File not found: $FULL_PATH"
    exit 1
fi

echo "   ✅ File exists, checking TypeScript errors..."

cd /workspace
START_TIME=$(date +%s)
TSC_OUTPUT=$(timeout "$TIMEOUT_SECONDS" npx tsc --noEmit "$FILE" 2>&1 || true)
TSC_EXIT=$?
CHECK_TIME=$(($(date +%s) - START_TIME))

if [ $TSC_EXIT -eq 124 ]; then
    echo "   ⚠️  TypeScript check TIMED OUT after ${CHECK_TIME}s"
    INITIAL_ERROR_COUNT=0
    STATUS="timeout"
    TIMED_OUT="true"
elif [ $TSC_EXIT -eq 137 ]; then
    echo "   ⚠️  TypeScript check KILLED (OOM?) after ${CHECK_TIME}s"
    INITIAL_ERROR_COUNT=0
    STATUS="oom"
    TIMED_OUT="false"
else
    INITIAL_ERROR_COUNT=$(echo "$TSC_OUTPUT" | grep "error TS" | wc -l)
    echo "   ✅ TypeScript check completed in ${CHECK_TIME}s"
    echo "   Initial error count: $INITIAL_ERROR_COUNT"
    STATUS="success"
    TIMED_OUT="false"
fi

# Report results
redis-cli -h "$REDIS_HOST" HSET "task:$TASK_NUM:result" \
    "agent_id" "$AGENT_ID" \
    "status" "$STATUS" \
    "memory_gb" "$MEMORY_GB" \
    "timeout_seconds" "$TIMEOUT_SECONDS" \
    "check_time_seconds" "$CHECK_TIME" \
    "initial_errors" "$INITIAL_ERROR_COUNT" \
    "timed_out" "$TIMED_OUT" \
    "exit_code" "$TSC_EXIT" \
    "completed_at" "$(date -Iseconds)" >/dev/null

redis-cli -h "$REDIS_HOST" INCR "task:completed" >/dev/null

echo "   ✅ Task completed (status: $STATUS, check took ${CHECK_TIME}s)"
exit 0
WORKER_EOF

sed -i 's/\r$//' "$WORKER_DIR/worker-template.sh"
chmod +x "$WORKER_DIR/worker-template.sh"

echo "🚀 Spawning 4 agents with different configurations..."

# Spawn agent 1: 2GB, 60s
docker run -d \
    --name "b10-test-2gb-60s" \
    --network "$NETWORK_NAME" \
    --memory="2g" \
    -v "$WORKER_DIR/worker-template.sh:/tmp/worker.sh:ro" \
    -v "$FRONTEND_PATH:/workspace:rw" \
    -e REDIS_HOST="$AGENT_REDIS_HOST" \
    -e TASK_ID="b10-memory-timeout-test" \
    -e AGENT_ID="2gb-60s" \
    -e TIMEOUT_SECONDS="60" \
    -e MEMORY_GB="2" \
    claude-flow-novice:agent \
    bash /tmp/worker.sh >/dev/null 2>&1

echo "   ✅ Spawned agent 1: 2GB, 60s timeout"

# Spawn agent 2: 2GB, 180s
docker run -d \
    --name "b10-test-2gb-180s" \
    --network "$NETWORK_NAME" \
    --memory="2g" \
    -v "$WORKER_DIR/worker-template.sh:/tmp/worker.sh:ro" \
    -v "$FRONTEND_PATH:/workspace:rw" \
    -e REDIS_HOST="$AGENT_REDIS_HOST" \
    -e TASK_ID="b10-memory-timeout-test" \
    -e AGENT_ID="2gb-180s" \
    -e TIMEOUT_SECONDS="180" \
    -e MEMORY_GB="2" \
    claude-flow-novice:agent \
    bash /tmp/worker.sh >/dev/null 2>&1

echo "   ✅ Spawned agent 2: 2GB, 180s timeout"

# Spawn agent 3: 4GB, 60s
docker run -d \
    --name "b10-test-4gb-60s" \
    --network "$NETWORK_NAME" \
    --memory="4g" \
    -v "$WORKER_DIR/worker-template.sh:/tmp/worker.sh:ro" \
    -v "$FRONTEND_PATH:/workspace:rw" \
    -e REDIS_HOST="$AGENT_REDIS_HOST" \
    -e TASK_ID="b10-memory-timeout-test" \
    -e AGENT_ID="4gb-60s" \
    -e TIMEOUT_SECONDS="60" \
    -e MEMORY_GB="4" \
    claude-flow-novice:agent \
    bash /tmp/worker.sh >/dev/null 2>&1

echo "   ✅ Spawned agent 3: 4GB, 60s timeout"

# Spawn agent 4: 4GB, 180s
docker run -d \
    --name "b10-test-4gb-180s" \
    --network "$NETWORK_NAME" \
    --memory="4g" \
    -v "$WORKER_DIR/worker-template.sh:/tmp/worker.sh:ro" \
    -v "$FRONTEND_PATH:/workspace:rw" \
    -e REDIS_HOST="$AGENT_REDIS_HOST" \
    -e TASK_ID="b10-memory-timeout-test" \
    -e AGENT_ID="4gb-180s" \
    -e TIMEOUT_SECONDS="180" \
    -e MEMORY_GB="4" \
    claude-flow-novice:agent \
    bash /tmp/worker.sh >/dev/null 2>&1

echo "   ✅ Spawned agent 4: 4GB, 180s timeout"
echo ""

# Monitor completion
echo "📊 Monitoring memory + timeout test (max 5 minutes)..."
START_TIME=$(date +%s)
MAX_WAIT=300

while true; do
    COMPLETED=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "task:completed" 2>/dev/null || echo "0")
    ELAPSED=$(($(date +%s) - START_TIME))

    echo -ne "   Progress: $COMPLETED/4 tasks completed (${ELAPSED}s elapsed)\r"

    if [ "$COMPLETED" -ge 4 ]; then
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
echo "MEMORY + TIMEOUT TEST RESULTS"
echo "================================================"

for i in 1 2 3 4; do
    AGENT_ID=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "agent_id" 2>/dev/null || echo "none")
    STATUS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "status" 2>/dev/null || echo "incomplete")
    MEMORY_GB=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "memory_gb" 2>/dev/null || echo "0")
    TIMEOUT_SEC=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "timeout_seconds" 2>/dev/null || echo "0")
    CHECK_TIME=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "check_time_seconds" 2>/dev/null || echo "0")
    TIMED_OUT=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "timed_out" 2>/dev/null || echo "unknown")
    EXIT_CODE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "exit_code" 2>/dev/null || echo "unknown")
    ERRORS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "initial_errors" 2>/dev/null || echo "0")

    echo ""
    echo "Task $i ($AGENT_ID):"
    echo "   Memory: ${MEMORY_GB}GB"
    echo "   Timeout configured: ${TIMEOUT_SEC}s"
    echo "   Check time: ${CHECK_TIME}s"
    echo "   Timed out: $TIMED_OUT"
    echo "   Exit code: $EXIT_CODE"
    echo "   Status: $STATUS"
    echo "   Errors found: $ERRORS"
done

echo ""
echo "Total test time: ${TOTAL_TIME}s"
echo ""

# Show agent logs
echo "📋 Agent Logs:"
echo ""
for AGENT in "b10-test-2gb-60s" "b10-test-2gb-180s" "b10-test-4gb-60s" "b10-test-4gb-180s"; do
    echo "=== $AGENT ==="
    docker logs "$AGENT" 2>&1 | tail -15
    echo ""
done

echo "================================================"
echo "ANALYSIS"
echo "================================================"
echo ""
echo "Successful configurations:"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "task:*:result" | while read -r key; do
    STATUS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$key" "status" 2>/dev/null)
    if [ "$STATUS" = "success" ]; then
        AGENT_ID=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$key" "agent_id" 2>/dev/null)
        echo "   ✅ $AGENT_ID"
    fi
done

echo ""
echo "Failed configurations:"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "task:*:result" | while read -r key; do
    STATUS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$key" "status" 2>/dev/null)
    if [ "$STATUS" != "success" ]; then
        AGENT_ID=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$key" "agent_id" 2>/dev/null)
        echo "   ❌ $AGENT_ID ($STATUS)"
    fi
done

exit 0
