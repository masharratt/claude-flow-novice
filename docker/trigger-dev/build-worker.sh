#!/bin/bash
# Build custom trigger.dev worker with CFN agent infrastructure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Building Custom Trigger.dev Worker with CFN Infrastructure ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Build the custom worker image
cd "$SCRIPT_DIR"

echo "Building trigger-dev-worker-cfn:latest..."
docker build \
  -f Dockerfile.worker \
  -t trigger-dev-worker-cfn:latest \
  "$PROJECT_ROOT"

echo ""
echo "✅ Worker image built successfully!"
echo ""
echo "Image: trigger-dev-worker-cfn:latest"
echo "Includes:"
echo "  - trigger.dev worker runtime"
echo "  - claude-flow-novice CLI"
echo "  - TypeScript compiler"
echo "  - CFN agent templates (.claude)"
echo "  - Workflow definitions (trigger-dev/src)"
echo ""
echo "To deploy:"
echo "  cd $SCRIPT_DIR"
echo "  docker-compose up -d trigger-worker"
echo ""
