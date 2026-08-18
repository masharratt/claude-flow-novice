#!/usr/bin/env bash
# 50-Agent Parallel Spawn Test
# Tests coordinator-based task assignment with 50 parallel agent containers
# NOTE: Agents have random delays (60-300s) for Docker Desktop observation

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true
\nPROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_NAME="cfn-50-agent-test"
REDIS_CONTAINER="cfn-50-redis"
AGENT_MEMORY="${AGENT_MEMORY:-128m}"

echo "🧪 50-AGENT PARALLEL SPAWN TEST"
echo "==============================="
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."

    # Stop all agent containers
    for i in {1..50}; do
        docker rm -f "agent-$i" 2>/dev/null || true
    done

    # Stop Redis and coordinator
    docker rm -f "$REDIS_CONTAINER" coordinator 2>/dev/null || true

    # Remove network
    docker network rm "$NETWORK_NAME" 2>/dev/null || true

    echo "   ✅ Cleanup complete"
}

trap cleanup EXIT

# Setup
echo "🔧 Setting up test environment..."

# Create network
docker network create "$NETWORK_NAME" >/dev/null 2>&1 || true
echo "   ✅ Network: $NETWORK_NAME"

# Start Redis with port published for host access (use 6380 to avoid conflict with host Redis)
docker run -d \
    --name "$REDIS_CONTAINER" \
    --network "$NETWORK_NAME" \
    -p 6380:6379 \
    redis:alpine >/dev/null

sleep 2
echo "   ✅ Redis container running (localhost:6380)"

# Copy worker script for agents
mkdir -p /tmp/50-agent-test
cp "$SCRIPT_DIR/50-agent-parallel/agent-worker.sh" /tmp/50-agent-test/
sed -i 's/\r$//' /tmp/50-agent-test/agent-worker.sh
chmod +x /tmp/50-agent-test/agent-worker.sh

echo ""

# Run coordinator directly on host (connects to Redis via localhost:6380)
echo "Running coordinator..."
REDIS_HOST="localhost" \
REDIS_PORT="6380" \
NETWORK_NAME="$NETWORK_NAME" \
AGENT_MEMORY="$AGENT_MEMORY" \
bash "$SCRIPT_DIR/50-agent-parallel/coordinator.sh"

COORDINATOR_EXIT=$?

echo ""
if [ $COORDINATOR_EXIT -eq 0 ]; then
    echo "✅ 50-AGENT PARALLEL SPAWN TEST PASSED"
else
    echo "❌ 50-AGENT PARALLEL SPAWN TEST FAILED (exit code: $COORDINATOR_EXIT)"
fi

exit $COORDINATOR_EXIT
