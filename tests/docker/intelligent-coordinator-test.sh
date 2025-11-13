#!/bin/bash
# Intelligent TypeScript Error Coordinator Test
# Tests coordinator on FULL frontend (400+ errors)

set -euo pipefail

echo "🎯 INTELLIGENT TYPESCRIPT ERROR COORDINATOR TEST"
echo "================================================"
echo ""

# Configuration
REDIS_PORT=6379
NETWORK_NAME="cfn-network"
COORDINATOR_IMAGE="cfn-intelligent-coordinator:latest"
FRONTEND_PATH="/mnt/c/Users/masha/Documents/ourstories-v2/frontend"

# Verify frontend path exists
if [ ! -d "$FRONTEND_PATH" ]; then
    echo "❌ Error: Frontend path not found: $FRONTEND_PATH"
    exit 1
fi

# Verify coordinator image exists
if ! docker image inspect "$COORDINATOR_IMAGE" >/dev/null 2>&1; then
    echo "❌ Error: Coordinator image not found: $COORDINATOR_IMAGE"
    echo "   Please build the coordinator image first:"
    echo "   export DOCKERFILE=\"Dockerfile.coordinator\" && export IMAGE_NAME=\"cfn-intelligent-coordinator\" && export IMAGE_TAG=\"latest\" && ./scripts/docker/build-from-linux.sh"
    exit 1
fi

echo "✅ Configuration validated"
echo "   Frontend path: $FRONTEND_PATH"
echo "   Coordinator image: $COORDINATOR_IMAGE"
echo "   Network: $NETWORK_NAME"
echo ""

# Count initial errors
echo "📊 Counting initial TypeScript errors..."
cd "$FRONTEND_PATH"
INITIAL_ERRORS=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -c "error TS" || echo "0")
# Strip whitespace and newlines for proper integer comparison
INITIAL_ERRORS=$(echo "$INITIAL_ERRORS" | tr -d ' \n\r')
echo "   Initial errors: $INITIAL_ERRORS"
echo ""

if [ "$INITIAL_ERRORS" -eq 0 ]; then
    echo "✅ No TypeScript errors found. Nothing to fix!"
    exit 0
fi

# Check minimum error threshold for batch testing
if [ "$INITIAL_ERRORS" -lt 10 ]; then
    echo "⚠️  Frontend has only $INITIAL_ERRORS errors (below batch test threshold)"
    echo ""
    echo "    The intelligent coordinator is designed for large-scale error fixing (100+)"
    echo "    With fewer than 10 errors, consider:"
    echo ""
    echo "    1. Fix manually with Claude Code"
    echo "    2. Use test fixtures with known error counts"
    echo "    3. Temporarily increase TypeScript strictness:"
    echo "       - Enable noUnusedLocals"
    echo "       - Enable noUnusedParameters"
    echo "       - Enable noImplicitAny"
    echo ""
    echo "    Or proceed anyway by setting FORCE_RUN=true"
    echo ""

    if [ "${FORCE_RUN:-false}" != "true" ]; then
        exit 1
    else
        echo "    FORCE_RUN=true detected, proceeding with $INITIAL_ERRORS errors..."
        echo ""
    fi
fi

# Setup network
echo "🔧 Setting up Docker environment..."
docker network create "$NETWORK_NAME" >/dev/null 2>&1 || true
echo "   ✅ Network: $NETWORK_NAME"

# Start Redis
echo "   Starting Redis..."
docker rm -f cfn-redis >/dev/null 2>&1 || true
docker run -d \
    --name cfn-redis \
    --network "$NETWORK_NAME" \
    -p "$REDIS_PORT:6379" \
    redis:7-alpine >/dev/null

sleep 2
echo "   ✅ Redis running (port $REDIS_PORT)"
echo ""

# Run coordinator
echo "🚀 Launching intelligent coordinator..."
echo "   This will:"
echo "   1. Analyze ALL frontend TypeScript errors"
echo "   2. Build dependency graph"
echo "   3. Create strategic file batches"
echo "   4. Spawn agents in waves (40GB budget)"
echo "   5. Iterate until errors = 0 or max iterations"
echo ""
echo "   Coordinator output:"
echo "   ───────────────────────────────────────"

START_TIME=$(date +%s)

docker run --rm \
    --name cfn-coordinator \
    --memory=2g \
    --network "$NETWORK_NAME" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$FRONTEND_PATH:/workspace:rw" \
    -e MEMORY_BUDGET=40g \
    -e MAX_ITERATIONS=5 \
    -e REDIS_HOST=cfn-redis \
    -e REDIS_PORT=$REDIS_PORT \
    -e NETWORK_NAME=$NETWORK_NAME \
    -e AGENT_IMAGE=claude-flow-novice-agent:frontend \
    --env-file .env \
    "$COORDINATOR_IMAGE"

COORDINATOR_EXIT=$?
TOTAL_TIME=$(($(date +%s) - START_TIME))

echo "   ───────────────────────────────────────"
echo ""

# Check coordinator exit status
if [ $COORDINATOR_EXIT -ne 0 ]; then
    echo "❌ Coordinator exited with error (code: $COORDINATOR_EXIT)"
else
    echo "✅ Coordinator completed successfully"
fi

echo "   Total execution time: ${TOTAL_TIME}s ($(($TOTAL_TIME / 60))m $(($TOTAL_TIME % 60))s)"
echo ""

# Count final errors
echo "📊 Counting final TypeScript errors..."
cd "$FRONTEND_PATH"
FINAL_ERRORS=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -c "error TS" || echo "0")
# Strip whitespace and newlines for proper integer comparison
FINAL_ERRORS=$(echo "$FINAL_ERRORS" | tr -d ' \n\r')
ERRORS_FIXED=$((INITIAL_ERRORS - FINAL_ERRORS))

echo "   Final errors: $FINAL_ERRORS"
echo "   Errors fixed: $ERRORS_FIXED"
echo ""

# Cleanup
echo "🧹 Cleaning up..."
docker rm -f cfn-redis >/dev/null 2>&1 || true
echo "   ✅ Cleanup complete"
echo ""

# Summary
echo "═══════════════════════════════════════"
echo "INTELLIGENT COORDINATOR TEST SUMMARY"
echo "═══════════════════════════════════════"
echo ""
echo "Execution time:  ${TOTAL_TIME}s"
echo "Initial errors:  $INITIAL_ERRORS"
echo "Final errors:    $FINAL_ERRORS"
echo "Errors fixed:    $ERRORS_FIXED"
echo ""

if [ "$FINAL_ERRORS" -eq 0 ]; then
    echo "✅ SUCCESS: All TypeScript errors resolved!"
    exit 0
else
    REDUCTION_PERCENT=$((ERRORS_FIXED * 100 / INITIAL_ERRORS))
    echo "⚠️  PARTIAL: $REDUCTION_PERCENT% error reduction"
    echo ""
    echo "Remaining errors require manual review or additional iterations."
    exit 0
fi
