#!/usr/bin/env bash
# Docker Agent Memory Profiling
# Determines minimal viable memory allocation for agent containers

set -euo pipefail

echo "🔬 DOCKER AGENT MEMORY PROFILING"
echo "================================"
echo ""

# Test network
NETWORK_NAME="cfn-memory-profiling"
docker network create "$NETWORK_NAME" 2>/dev/null || true

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    docker rm -f profiling-idle profiling-write profiling-postedit 2>/dev/null || true
    docker network rm "$NETWORK_NAME" 2>/dev/null || true
}
trap cleanup EXIT

# Test 1: Idle container baseline
echo "Test 1: Idle container memory baseline"
echo "--------------------------------------"

IDLE_CONTAINER=$(docker run -d \
    --name profiling-idle \
    --network "$NETWORK_NAME" \
    --memory=512m \
    claude-flow-novice:agent \
    sleep 300)

sleep 5

IDLE_STATS=$(docker stats --no-stream --format "json" "$IDLE_CONTAINER")
IDLE_MEM=$(echo "$IDLE_STATS" | jq -r '.MemUsage' | cut -d'/' -f1 | tr -d ' ')
IDLE_MEM_PERCENT=$(echo "$IDLE_STATS" | jq -r '.MemPerc' | tr -d '%')

echo "   Memory: $IDLE_MEM"
echo "   Percent: ${IDLE_MEM_PERCENT}%"
echo ""

# Test 2: File write operation (no post-edit)
echo "Test 2: Simple file write (no post-edit validation)"
echo "---------------------------------------------------"

docker rm -f "$IDLE_CONTAINER" >/dev/null 2>&1

WRITE_CONTAINER=$(docker run -d \
    --name profiling-write \
    --network "$NETWORK_NAME" \
    --memory=512m \
    -v /tmp/profiling-workspace:/workspace \
    claude-flow-novice:agent \
    sh -c "mkdir -p /workspace && echo 'console.log(\"hello world\");' > /workspace/test.js && sleep 60")

sleep 5

WRITE_STATS=$(docker stats --no-stream --format "json" "$WRITE_CONTAINER")
WRITE_MEM=$(echo "$WRITE_STATS" | jq -r '.MemUsage' | cut -d'/' -f1 | tr -d ' ')
WRITE_MEM_PERCENT=$(echo "$WRITE_STATS" | jq -r '.MemPerc' | tr -d '%')

echo "   Memory: $WRITE_MEM"
echo "   Percent: ${WRITE_MEM_PERCENT}%"
echo ""

# Test 3: File write with post-edit validation (memory intensive)
echo "Test 3: File write with post-edit validation pipeline"
echo "------------------------------------------------------"

docker rm -f "$WRITE_CONTAINER" >/dev/null 2>&1
mkdir -p /tmp/profiling-workspace

POSTEDIT_CONTAINER=$(docker run -d \
    --name profiling-postedit \
    --network "$NETWORK_NAME" \
    --memory=512m \
    -v /tmp/profiling-workspace:/workspace \
    -v "$(pwd)/.claude:/app/.claude" \
    claude-flow-novice:agent \
    sh -c "mkdir -p /workspace && echo 'console.log(\"hello world\");' > /workspace/test.js && ./.claude/hooks/cfn-invoke-post-edit.sh /workspace/test.js --agent-id profiling && sleep 60")

sleep 10

POSTEDIT_STATS=$(docker stats --no-stream --format "json" "$POSTEDIT_CONTAINER")
POSTEDIT_MEM=$(echo "$POSTEDIT_STATS" | jq -r '.MemUsage' | cut -d'/' -f1 | tr -d ' ')
POSTEDIT_MEM_PERCENT=$(echo "$POSTEDIT_STATS" | jq -r '.MemPerc' | tr -d '%')

echo "   Memory: $POSTEDIT_MEM"
echo "   Percent: ${POSTEDIT_MEM_PERCENT}%"
echo ""

# Memory limit stress tests
echo "Test 4: Memory limit stress testing"
echo "------------------------------------"

MEMORY_LIMITS=(512 256 128 64)

for LIMIT in "${MEMORY_LIMITS[@]}"; do
    echo -n "   ${LIMIT}MB limit: "

    TEST_CONTAINER=$(docker run -d \
        --memory="${LIMIT}m" \
        --network "$NETWORK_NAME" \
        -v /tmp/profiling-workspace:/workspace \
        -v "$(pwd)/.claude:/app/.claude" \
        claude-flow-novice:agent \
        sh -c "mkdir -p /workspace && echo 'console.log(\"test\");' > /workspace/test-${LIMIT}.js && ./.claude/hooks/cfn-invoke-post-edit.sh /workspace/test-${LIMIT}.js --agent-id profiling-${LIMIT} 2>&1" 2>/dev/null || echo "")

    if [ -z "$TEST_CONTAINER" ]; then
        echo "❌ FAILED (container spawn failed)"
        continue
    fi

    # Wait for completion (max 30s)
    TIMEOUT=30
    ELAPSED=0
    while [ $ELAPSED -lt $TIMEOUT ]; do
        STATUS=$(docker inspect -f '{{.State.Status}}' "$TEST_CONTAINER" 2>/dev/null || echo "missing")
        if [ "$STATUS" = "exited" ]; then
            break
        fi
        sleep 1
        ((ELAPSED++))
    done

    EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' "$TEST_CONTAINER" 2>/dev/null || echo "999")
    LOGS=$(docker logs "$TEST_CONTAINER" 2>&1 | tail -5)

    if [ "$EXIT_CODE" -eq 0 ]; then
        PEAK_MEM=$(docker stats --no-stream --format "json" "$TEST_CONTAINER" 2>/dev/null | jq -r '.MemUsage' | cut -d'/' -f1 | tr -d ' ' || echo "N/A")
        echo "✅ SUCCESS (peak: $PEAK_MEM)"
    elif echo "$LOGS" | grep -q "OOMKilled\|out of memory"; then
        echo "❌ OOM KILLED"
    else
        echo "⚠️  FAILED (exit $EXIT_CODE, reason unknown)"
    fi

    docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1
    sleep 2
done

echo ""
echo "================================================"
echo "MEMORY PROFILING SUMMARY"
echo "================================================"
echo ""
echo "Baseline Measurements:"
echo "   Idle container:        $IDLE_MEM"
echo "   Simple file write:     $WRITE_MEM"
echo "   Post-edit validation:  $POSTEDIT_MEM"
echo ""
echo "Recommended Memory Allocations:"
echo "   Minimal (tight):       128MB"
echo "   Standard (safe):       256MB"
echo "   Comfortable (padded):  512MB"
echo ""
echo "For 50 parallel agents:"
echo "   @ 128MB: ~6.4GB total"
echo "   @ 256MB: ~12.8GB total"
echo "   @ 512MB: ~25.6GB total"
echo ""
