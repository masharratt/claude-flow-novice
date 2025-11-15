#!/bin/bash
# docker-rebuild-all-agents.sh
# Rebuild all CFN agent Docker images after Redis connection fixes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🐳 Rebuilding All CFN Agent Images with Redis Fix"
echo "=================================================="
echo "Project Root: $PROJECT_ROOT"
echo ""

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Change to project directory
cd "$PROJECT_ROOT"

# Enable BuildKit for faster builds
export DOCKER_BUILDKIT=1

BUILD_START=$(date +%s)

# 1. Base agent image (used by all variants)
echo "📦 [1/4] Building claude-flow-novice-agent:latest"
echo "   Dockerfile: Dockerfile.agent"
docker build \
    --progress=plain \
    --cache-from claude-flow-novice-agent:latest \
    -f Dockerfile.agent \
    -t claude-flow-novice-agent:latest \
    . || {
    echo "❌ Failed to build claude-flow-novice-agent:latest"
    exit 1
}
echo "✅ claude-flow-novice-agent:latest built successfully"
echo ""

# 2. Frontend specialist (for TypeScript coordinator)
echo "📦 [2/4] Building claude-flow-novice-agent:frontend"
echo "   Dockerfile: Dockerfile.agent-frontend"
docker build \
    --progress=plain \
    --cache-from claude-flow-novice-agent:frontend \
    -f Dockerfile.agent-frontend \
    -t claude-flow-novice-agent:frontend \
    . || {
    echo "❌ Failed to build claude-flow-novice-agent:frontend"
    exit 1
}
echo "✅ claude-flow-novice-agent:frontend built successfully"
echo ""

# 3. Backend specialist (if Dockerfile exists)
if [ -f "$PROJECT_ROOT/Dockerfile.agent-backend" ]; then
    echo "📦 [3/4] Building claude-flow-novice-agent:backend"
    echo "   Dockerfile: Dockerfile.agent-backend"
    docker build \
        --progress=plain \
        --cache-from claude-flow-novice-agent:backend \
        -f Dockerfile.agent-backend \
        -t claude-flow-novice-agent:backend \
        . || {
        echo "❌ Failed to build claude-flow-novice-agent:backend"
        exit 1
    }
    echo "✅ claude-flow-novice-agent:backend built successfully"
    echo ""
else
    echo "⏭️  [3/4] Skipping claude-flow-novice-agent:backend (Dockerfile not found)"
    echo ""
fi

# 4. Intelligent coordinator
echo "📦 [4/4] Building cfn-intelligent-coordinator:latest"
echo "   Dockerfile: Dockerfile.coordinator"
docker build \
    --progress=plain \
    --cache-from cfn-intelligent-coordinator:latest \
    -f Dockerfile.coordinator \
    -t cfn-intelligent-coordinator:latest \
    . || {
    echo "❌ Failed to build cfn-intelligent-coordinator:latest"
    exit 1
}
echo "✅ cfn-intelligent-coordinator:latest built successfully"
echo ""

BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))

# Verify images
echo "=================================================="
echo "✅ All Images Built Successfully!"
echo "=================================================="
echo ""
echo "📋 Image Details:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | \
    grep -E "(claude-flow-novice-agent|cfn-intelligent-coordinator)" | \
    grep -E "(latest|frontend|backend)" | \
    head -10

echo ""
echo "⏱️  Build Time: ${BUILD_TIME}s"
echo ""
echo "🎯 Next Step: Run validation tests to confirm Redis connection"
echo "   Command: ./tests/docker/validate-redis-connection.sh"
echo ""
echo "📝 Rebuild Report:"
echo "   - Base agent: claude-flow-novice-agent:latest"
echo "   - Frontend specialist: claude-flow-novice-agent:frontend"
echo "   - Backend specialist: claude-flow-novice-agent:backend (if exists)"
echo "   - Intelligent coordinator: cfn-intelligent-coordinator:latest"
echo ""
echo "💾 Image Sizes:"
TOTAL_SIZE=$(docker images --format "{{.Size}}" | \
    grep -E "MB|GB" | \
    awk '{gsub(/MB/, "", $1); gsub(/GB/, "", $1); if ($1 ~ /GB/) print $1*1024; else print $1}' | \
    awk '{sum+=$1} END {printf "%.0f MB\n", sum}')
echo "   Total disk usage: $TOTAL_SIZE"
echo ""
echo "🚀 Ready for Redis validation and integration testing!"
