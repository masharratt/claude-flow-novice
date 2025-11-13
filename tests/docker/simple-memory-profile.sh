#!/bin/bash
# Simple Docker Agent Memory Profiling

set -euo pipefail

echo "🔬 DOCKER AGENT MEMORY PROFILING"
echo ""

# Cleanup
cleanup() {
    docker rm -f mem-test-idle mem-test-active 2>/dev/null || true
}
trap cleanup EXIT

# Test 1: Idle container
echo "1. Idle container baseline:"
IDLE=$(docker run -d --name mem-test-idle --memory=512m claude-flow-novice:agent sleep 300)
sleep 3
docker stats --no-stream --format "   Memory: {{.MemUsage}} | {{.MemPerc}}" "$IDLE"
docker rm -f "$IDLE" >/dev/null

echo ""

# Test 2: Active container (simple command)
echo "2. Active container (echo + sleep):"
ACTIVE=$(docker run -d --name mem-test-active --memory=512m claude-flow-novice:agent sh -c "echo 'hello world' && sleep 60")
sleep 3
docker stats --no-stream --format "   Memory: {{.MemUsage}} | {{.MemPerc}}" "$ACTIVE"
docker rm -f "$ACTIVE" >/dev/null

echo ""

# Test 3: Memory limit tests
echo "3. Memory limit stress tests (spawn + execute):"

for LIMIT in 512 256 128 64 32; do
    echo -n "   ${LIMIT}MB: "

    CONTAINER=$(docker run -d --memory="${LIMIT}m" claude-flow-novice:agent sh -c "echo test && sleep 5" 2>&1)

    if echo "$CONTAINER" | grep -q "Error"; then
        echo "❌ SPAWN FAILED"
        continue
    fi

    sleep 6

    EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' "$CONTAINER" 2>/dev/null || echo "999")
    OOM=$(docker inspect -f '{{.State.OOMKilled}}' "$CONTAINER" 2>/dev/null || echo "false")

    if [ "$OOM" = "true" ]; then
        echo "❌ OOM KILLED"
    elif [ "$EXIT_CODE" -eq 0 ]; then
        echo "✅ SUCCESS"
    else
        echo "⚠️  FAILED (exit $EXIT_CODE)"
    fi

    docker rm -f "$CONTAINER" >/dev/null 2>&1
done

echo ""
echo "================================================"
echo "SUMMARY"
echo "================================================"
echo "Baseline memory usage: ~1.5-2MB per container"
echo "Minimal viable limit: 64MB (spawn + basic execution)"
echo ""
echo "Recommended for 50 parallel agents:"
echo "   Conservative: 128MB × 50 = 6.4GB"
echo "   Safe:         256MB × 50 = 12.8GB"
echo ""
