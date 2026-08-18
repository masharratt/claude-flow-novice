#!/usr/bin/env bash
# B10 Iterative TypeScript Fix Test with Memory Monitoring
# Iterates until all errors are gone, tracking memory usage per agent

set -euo pipefail

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6381}"
NETWORK_NAME="${NETWORK_NAME:-cfn-b10-fix}"
AGENT_MEMORY="${AGENT_MEMORY:-1g}"
NUM_AGENTS=32
MAX_ITERATIONS=5

# Path to the external frontend under test. Machine-specific, so it must be
# supplied; this test MODIFIES files there and refuses to guess a path.
FRONTEND_PATH="${FRONTEND_PATH:-}"
if [ -z "$FRONTEND_PATH" ] || [ ! -d "$FRONTEND_PATH" ]; then
  echo "SKIP: set FRONTEND_PATH to the frontend checkout under test." >&2
  exit 0
fi
BATCHES_JSON="${BATCHES_JSON:-${FRONTEND_PATH}/planning/frontend/frontend-error-batches.json}"

# Agents connect via container name
AGENT_REDIS_HOST="${AGENT_REDIS_HOST:-cfn-b10-redis}"

# Memory monitoring log
MEMORY_LOG="/tmp/b10-memory-usage.log"
echo "timestamp,iteration,agent_id,memory_used_mb,memory_limit_mb,memory_percent" > "$MEMORY_LOG"

echo "🎯 B10 ITERATIVE TYPESCRIPT FIX WITH MEMORY MONITORING"
echo "======================================================"
echo ""
echo "Configuration:"
echo "   Agents: $NUM_AGENTS"
echo "   Memory per agent: $AGENT_MEMORY"
echo "   Max iterations: $MAX_ITERATIONS"
echo "   Network: $NETWORK_NAME"
echo "   Frontend path: $FRONTEND_PATH"
echo "   Memory log: $MEMORY_LOG"
echo ""

# Validate paths
if [ ! -f "$BATCHES_JSON" ]; then
    echo "❌ Error: Batches JSON not found: $BATCHES_JSON"
    exit 1
fi

if [ ! -d "$FRONTEND_PATH" ]; then
    echo "❌ Error: Frontend path not found: $FRONTEND_PATH"
    exit 1
fi

# Function to count TypeScript errors
count_errors() {
    cd "$FRONTEND_PATH"
    local ERROR_COUNT=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -c "error TS" || echo "0")
    echo "$ERROR_COUNT"
}

# Function to monitor agent memory usage
monitor_memory() {
    local ITERATION=$1
    local TIMESTAMP=$(date +%s)

    for i in $(seq 1 $NUM_AGENTS); do
        local CONTAINER="b10-agent-$i"
        if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
            # Get memory stats using docker stats (no-stream for single reading)
            local STATS=$(docker stats "$CONTAINER" --no-stream --format "{{.MemUsage}}" 2>/dev/null || echo "0MiB / 0MiB")
            local MEM_USED=$(echo "$STATS" | awk '{print $1}' | sed 's/MiB//')
            local MEM_LIMIT=$(echo "$STATS" | awk '{print $3}' | sed 's/MiB//')
            local MEM_PERCENT=$(awk "BEGIN {if ($MEM_LIMIT > 0) print ($MEM_USED / $MEM_LIMIT * 100); else print 0}")

            echo "$TIMESTAMP,$ITERATION,$CONTAINER,$MEM_USED,$MEM_LIMIT,$MEM_PERCENT" >> "$MEMORY_LOG"
        fi
    done
}

# Iteration loop
for ITERATION in $(seq 1 $MAX_ITERATIONS); do
    echo ""
    echo "=========================================="
    echo "ITERATION $ITERATION of $MAX_ITERATIONS"
    echo "=========================================="
    echo ""

    # Count errors before iteration
    INITIAL_ERRORS=$(count_errors)
    echo "📊 TypeScript errors before iteration: $INITIAL_ERRORS"

    if [ "$INITIAL_ERRORS" -eq 0 ]; then
        echo "✅ All TypeScript errors resolved!"
        break
    fi

    echo ""

    # Setup test environment
    echo "🔧 Setting up test environment..."

    # Create network if it doesn't exist
    docker network create "$NETWORK_NAME" >/dev/null 2>&1 || true
    echo "   ✅ Network: $NETWORK_NAME"

    # Start Redis container
    docker rm -f cfn-b10-redis >/dev/null 2>&1 || true
    docker run -d \
        --name cfn-b10-redis \
        --network "$NETWORK_NAME" \
        -p "$REDIS_PORT:6379" \
        redis:7-alpine >/dev/null

    sleep 2
    echo "   ✅ Redis container running (localhost:$REDIS_PORT)"

    # Prepare worker script directory
    mkdir -p /tmp/b10-fix-test

    # Copy worker script
    cp tests/docker/b10-typescript-fix/agent-worker.sh /tmp/b10-fix-test/
    echo "   ✅ Worker script prepared"
    echo ""

    # Initialize Redis task queue
    echo "📋 Initializing task queue from B10 batch..."

    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:queue" >/dev/null 2>&1 || true
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:completed" >/dev/null 2>&1 || true
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:total" >/dev/null 2>&1 || true

    # Clear previous task results
    for i in $(seq 1 100); do
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "task:$i:result" >/dev/null 2>&1 || true
    done

    # Extract B10 files and create tasks
    readarray -t TASKS < <(jq -c '.B10.files[]' "$BATCHES_JSON")
    TASK_COUNT=${#TASKS[@]}

    for i in "${!TASKS[@]}"; do
        TASK_NUM=$((i + 1))
        FILE=$(echo "${TASKS[$i]}" | jq -r '.file')
        ERRORS=$(echo "${TASKS[$i]}" | jq -r '.errors')

        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "task:queue" "$TASK_NUM" >/dev/null
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "task:$TASK_NUM" \
            "file" "$FILE" \
            "expected_errors" "$ERRORS" \
            "batch" "B10" \
            "iteration" "$ITERATION" >/dev/null
    done

    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "task:total" "$TASK_COUNT" >/dev/null

    echo "   ✅ Created $TASK_COUNT tasks from B10 batch (iteration $ITERATION)"
    echo ""

    # Spawn agent containers
    echo "🚀 Spawning $NUM_AGENTS agent containers..."
    START_TIME=$(date +%s)

    WORKER_SCRIPT_PATH="/tmp/b10-fix-test/agent-worker.sh"

    AGENT_PIDS=()
    for i in $(seq 1 $NUM_AGENTS); do
        docker run -d \
            --name "b10-agent-$i" \
            --network "$NETWORK_NAME" \
            --memory="$AGENT_MEMORY" \
            --env-file $PROJECT_ROOT/.env \
            -v "$WORKER_SCRIPT_PATH:/tmp/worker.sh:ro" \
            -v "$FRONTEND_PATH:/workspace:rw" \
            -e REDIS_HOST="$AGENT_REDIS_HOST" \
            -e TASK_ID="b10-typescript-fix" \
            -e AGENT_ID="b10-agent-$i" \
            -e AGENT_TYPE="typescript-fixer" \
            -e ITERATION="$ITERATION" \
            claude-flow-novice-agent:frontend \
            bash /tmp/worker.sh >/dev/null 2>&1 &

        AGENT_PIDS+=($!)

        if [ $((i % 8)) -eq 0 ]; then
            echo "   Spawned $i/$NUM_AGENTS agents..."
        fi
    done

    # Wait for all spawn operations
    for pid in "${AGENT_PIDS[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    SPAWN_TIME=$(($(date +%s) - START_TIME))
    echo "   ✅ All $NUM_AGENTS agents spawned in ${SPAWN_TIME}s"
    echo ""

    # Monitor completion with memory tracking
    echo "📊 Monitoring task completion and memory usage..."
    echo "   Sampling memory every 10 seconds"

    MONITOR_START=$(date +%s)
    TIMEOUT=600
    LAST_MEMORY_CHECK=0

    while true; do
        COMPLETED=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "task:completed" 2>/dev/null || echo "0")
        QUEUE_LENGTH=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LLEN "task:queue" 2>/dev/null || echo "0")
        ELAPSED=$(($(date +%s) - MONITOR_START))

        # Memory monitoring every 10 seconds
        if [ $((ELAPSED - LAST_MEMORY_CHECK)) -ge 10 ]; then
            monitor_memory "$ITERATION"
            LAST_MEMORY_CHECK=$ELAPSED
        fi

        echo -ne "   Progress: $COMPLETED/$TASK_COUNT tasks, $QUEUE_LENGTH queued (${ELAPSED}s elapsed)\\r"

        if [ "$COMPLETED" -ge "$TASK_COUNT" ] && [ "$QUEUE_LENGTH" -eq 0 ]; then
            echo ""
            break
        fi

        if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
            echo ""
            echo "   ⚠️  Timeout reached (${TIMEOUT}s)"
            break
        fi

        sleep 3
    done

    # Final memory snapshot
    monitor_memory "$ITERATION"

    TOTAL_TIME=$(($(date +%s) - START_TIME))
    echo "   ✅ Iteration completed in ${TOTAL_TIME}s"
    echo ""

    # Cleanup containers
    echo "🧹 Cleaning up iteration $ITERATION containers..."
    for i in $(seq 1 $NUM_AGENTS); do
        docker rm -f "b10-agent-$i" >/dev/null 2>&1 || true
    done
    docker rm -f cfn-b10-redis >/dev/null 2>&1 || true
    echo "   ✅ Cleanup complete"

    # Count errors after iteration
    FINAL_ERRORS=$(count_errors)
    ERRORS_FIXED=$((INITIAL_ERRORS - FINAL_ERRORS))

    echo ""
    echo "📊 ITERATION $ITERATION RESULTS"
    echo "   Errors before: $INITIAL_ERRORS"
    echo "   Errors after: $FINAL_ERRORS"
    echo "   Errors fixed: $ERRORS_FIXED"
    echo ""

    if [ "$FINAL_ERRORS" -eq 0 ]; then
        echo "✅ All errors resolved in iteration $ITERATION!"
        break
    fi
done

# Generate memory usage report
echo ""
echo "📊 MEMORY USAGE ANALYSIS"
echo "========================"
echo ""

if [ -f "$MEMORY_LOG" ]; then
    # Calculate average memory usage per agent
    AVG_MEMORY=$(awk -F',' 'NR>1 {sum+=$4; count++} END {if (count>0) print sum/count; else print 0}' "$MEMORY_LOG")
    MAX_MEMORY=$(awk -F',' 'NR>1 {if ($4>max) max=$4} END {print max}' "$MEMORY_LOG")
    AVG_PERCENT=$(awk -F',' 'NR>1 {sum+=$6; count++} END {if (count>0) print sum/count; else print 0}' "$MEMORY_LOG")

    echo "   Average memory per agent: ${AVG_MEMORY}MB"
    echo "   Peak memory usage: ${MAX_MEMORY}MB"
    echo "   Average memory utilization: ${AVG_PERCENT}% of allocated 1GB"
    echo ""
    echo "   Detailed log: $MEMORY_LOG"

    # Show memory usage by iteration
    echo ""
    echo "   Memory by iteration:"
    for ITER in $(seq 1 $MAX_ITERATIONS); do
        ITER_AVG=$(awk -F',' -v iter="$ITER" 'NR>1 && $2==iter {sum+=$4; count++} END {if (count>0) print sum/count; else print 0}' "$MEMORY_LOG")
        ITER_MAX=$(awk -F',' -v iter="$ITER" 'NR>1 && $2==iter {if ($4>max) max=$4} END {print max}' "$MEMORY_LOG")
        if [ "$ITER_AVG" != "0" ]; then
            echo "      Iteration $ITER: avg=${ITER_AVG}MB, max=${ITER_MAX}MB"
        fi
    done
fi

echo ""
echo "✅ B10 ITERATIVE TEST COMPLETE"
echo ""

# Cleanup network
docker network rm "$NETWORK_NAME" >/dev/null 2>&1 || true
