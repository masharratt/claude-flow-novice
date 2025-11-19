#!/bin/bash
# Docker Coordinator - Spawns 50 agent containers in parallel
# Coordinates work via Redis to prevent overlap

set -euo pipefail

REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
NETWORK_NAME="${NETWORK_NAME:-cfn-50-agent-test}"
AGENT_MEMORY="${AGENT_MEMORY:-128m}"
NUM_AGENTS=50

# Agents need to connect to Redis via container name, not localhost
AGENT_REDIS_HOST="${AGENT_REDIS_HOST:-cfn-50-redis}"

echo "🎯 50-AGENT PARALLEL SPAWN COORDINATOR"
echo "======================================"
echo ""
echo "Configuration:"
echo "   Agents: $NUM_AGENTS"
echo "   Memory per agent: $AGENT_MEMORY"
echo "   Network: $NETWORK_NAME"
echo "   Redis (coordinator): $REDIS_HOST"
echo "   Redis (agents): $AGENT_REDIS_HOST"
echo ""

# Initialize Redis task queue
echo "📋 Initializing task queue..."

redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:queue" >/dev/null 2>&1 || true
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:completed" >/dev/null 2>&1 || true

# Create 50 tasks (mix of valid, syntax errors, security issues, complexity)
for i in {1..10}; do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "task:queue" "$i" >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "task:$i" \
        "file" "valid-$i.js" \
        "content" "console.log('hello world $i');" \
        "expected" "PASS" >/dev/null
done

for i in {11..20}; do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "task:queue" "$i" >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "task:$i" \
        "file" "syntax-error-$i.js" \
        "content" "// SYNTAX_ERROR\nconsole.log('missing semicolon'" \
        "expected" "SYNTAX_ERROR" >/dev/null
done

for i in {21..30}; do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "task:queue" "$i" >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "task:$i" \
        "file" "security-$i.js" \
        "content" "// SECURITY_ISSUE\neval('dangerous code');" \
        "expected" "SECURITY_ISSUE" >/dev/null
done

for i in {31..40}; do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "task:queue" "$i" >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "task:$i" \
        "file" "complexity-$i.js" \
        "content" "// COMPLEXITY_HIGH\nif(a){if(b){if(c){if(d){if(e){}}}}}" \
        "expected" "COMPLEXITY_HIGH" >/dev/null
done

for i in {41..50}; do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "task:queue" "$i" >/dev/null
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "task:$i" \
        "file" "valid-$i.js" \
        "content" "console.log('hello world $i');" \
        "expected" "PASS" >/dev/null
done

echo "   ✅ Created 50 tasks in Redis queue"
echo ""

# Spawn 50 agent containers in parallel
echo "🚀 Spawning $NUM_AGENTS agent containers..."
START_TIME=$(date +%s)

# Mount worker script as volume instead of embedding
WORKER_SCRIPT_PATH="/tmp/50-agent-test/agent-worker.sh"

AGENT_PIDS=()
for i in $(seq 1 $NUM_AGENTS); do
    docker run -d \
        --name "agent-$i" \
        --network "$NETWORK_NAME" \
        --memory="$AGENT_MEMORY" \
        -v "$WORKER_SCRIPT_PATH:/tmp/worker.sh:ro" \
        -e REDIS_HOST="$AGENT_REDIS_HOST" \
        -e TASK_ID="parallel-test" \
        -e AGENT_ID="agent-$i" \
        -e AGENT_TYPE="parallel-worker" \
        claude-flow-novice:agent \
        bash /tmp/worker.sh >/dev/null 2>&1 &

    AGENT_PIDS+=($!)

    # Print progress every 10 agents
    if [ $((i % 10)) -eq 0 ]; then
        echo "   Spawned $i/$NUM_AGENTS agents..."
    fi
done

# Wait for all spawn operations to complete
for pid in "${AGENT_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

SPAWN_TIME=$(($(date +%s) - START_TIME))
echo "   ✅ All $NUM_AGENTS agents spawned in ${SPAWN_TIME}s"
echo ""

# Monitor completion (agents sleep 60-300s, so max wait ~330s with buffer)
echo "📊 Monitoring task completion..."
echo "   Note: Agents have random delays (60-300s) for observation in Docker Desktop"

MONITOR_START=$(date +%s)
TIMEOUT=360  # 6 minutes max

while true; do
    COMPLETED=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "task:completed" 2>/dev/null || echo "0")
    QUEUE_LENGTH=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LLEN "task:queue" 2>/dev/null || echo "0")
    ELAPSED=$(($(date +%s) - MONITOR_START))

    echo -ne "   Progress: $COMPLETED/50 tasks completed, $QUEUE_LENGTH in queue (${ELAPSED}s elapsed)\r"

    if [ "$COMPLETED" -ge 50 ] && [ "$QUEUE_LENGTH" -eq 0 ]; then
        echo ""
        break
    fi

    if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
        echo ""
        echo "   ⚠️  Timeout reached (${TIMEOUT}s) - some agents may still be running"
        break
    fi

    sleep 2
done

TOTAL_TIME=$(($(date +%s) - START_TIME))
echo ""
echo "   ✅ All tasks completed in ${TOTAL_TIME}s"
echo ""

# Validate no work overlap
echo "🔍 Validating task distribution (no overlap)..."

OVERLAP_DETECTED=0
for i in {1..50}; do
    AGENT_ASSIGNED=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "task:$i:result" "agent_id" 2>/dev/null || echo "")

    if [ -z "$AGENT_ASSIGNED" ]; then
        echo "   ⚠️  Task $i: Not completed"
        ((OVERLAP_DETECTED++))
    fi
done

# Check for duplicate assignments (shouldn't happen with atomic RPOP)
UNIQUE_ASSIGNMENTS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "task:*:result" 2>/dev/null | wc -l)

if [ "$UNIQUE_ASSIGNMENTS" -ne 50 ]; then
    echo "   ❌ Assignment mismatch: expected 50, got $UNIQUE_ASSIGNMENTS"
    OVERLAP_DETECTED=1
fi

if [ "$OVERLAP_DETECTED" -eq 0 ]; then
    echo "   ✅ No work overlap detected - all tasks assigned uniquely"
else
    echo "   ❌ Work overlap or missing tasks detected!"
fi

echo ""
echo "================================================"
echo "RESULTS SUMMARY"
echo "================================================"
echo "   Agents spawned: $NUM_AGENTS"
echo "   Spawn time: ${SPAWN_TIME}s"
echo "   Total time: ${TOTAL_TIME}s"
echo "   Tasks completed: $COMPLETED/50"
echo "   Memory per agent: $AGENT_MEMORY"
echo "   Total memory: $((${AGENT_MEMORY%m} * NUM_AGENTS))MB"
echo ""

exit 0
