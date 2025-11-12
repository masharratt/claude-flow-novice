#!/bin/bash
# B10 TypeScript Error Fix Test
# Deploys 32 agents to fix TypeScript errors in batch 10 files

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_NAME="cfn-b10-fix"
REDIS_CONTAINER="cfn-b10-redis"
AGENT_MEMORY="${AGENT_MEMORY:-1g}"

# Frontend path
FRONTEND_PATH="/mnt/c/Users/masha/Documents/ourstories-v2/frontend"

echo "🧪 B10 TYPESCRIPT ERROR FIX TEST"
echo "================================="
echo ""
echo "⚠️  WARNING: This will modify files in $FRONTEND_PATH"
echo "⚠️  Ensure you have committed all changes to git first!"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."

    # Stop all agent containers
    for i in {1..32}; do
        docker rm -f "b10-agent-$i" 2>/dev/null || true
    done

    # Stop Redis
    docker rm -f "$REDIS_CONTAINER" 2>/dev/null || true

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

# Start Redis on alternative port (6381 to avoid conflicts)
docker run -d \
    --name "$REDIS_CONTAINER" \
    --network "$NETWORK_NAME" \
    -p 6381:6379 \
    redis:alpine >/dev/null

sleep 2
echo "   ✅ Redis container running (localhost:6381)"

# Copy worker script for agents
mkdir -p /tmp/b10-fix-test
cp "$SCRIPT_DIR/b10-typescript-fix/agent-worker.sh" /tmp/b10-fix-test/
sed -i 's/\r$//' /tmp/b10-fix-test/agent-worker.sh
chmod +x /tmp/b10-fix-test/agent-worker.sh

echo "   ✅ Worker script prepared"
echo ""

# Run coordinator
echo "🎯 Starting coordinator..."
REDIS_HOST="localhost" \
REDIS_PORT="6381" \
NETWORK_NAME="$NETWORK_NAME" \
AGENT_MEMORY="$AGENT_MEMORY" \
FRONTEND_PATH="$FRONTEND_PATH" \
bash "$SCRIPT_DIR/b10-typescript-fix/coordinator.sh"

COORDINATOR_EXIT=$?

echo ""
if [ $COORDINATOR_EXIT -eq 0 ]; then
    echo "✅ B10 TYPESCRIPT ERROR FIX TEST COMPLETED"
    echo ""
    echo "📊 Results saved to: /tmp/b10-fix-results.json"
    echo ""
    echo "Next steps:"
    echo "1. Review the results file"
    echo "2. Run 'git diff' in $FRONTEND_PATH to see changes"
    echo "3. Run 'npm run type-check' to verify fixes"
    echo "4. Commit changes if satisfied"
else
    echo "❌ B10 TYPESCRIPT ERROR FIX TEST FAILED (exit code: $COORDINATOR_EXIT)"
fi

exit $COORDINATOR_EXIT
