#!/bin/bash
# Test Single Agent Job
# Phase 1 :: Validate single agent container spawning via trigger.dev

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
TRIGGER_DIR="$PROJECT_ROOT/docker/trigger-dev"

echo "=== Phase 1: Test Single Agent Job ==="
echo ""

# Step 1: Build TypeScript
echo "[1/5] Building TypeScript..."
cd "$TRIGGER_DIR"
npm install --silent 2>/dev/null || true
npm run build

if [ ! -f "dist/jobs/test-single-agent.js" ]; then
  echo "❌ Build failed: dist/jobs/test-single-agent.js not found"
  exit 1
fi
echo "✅ TypeScript build successful"
echo ""

# Step 2: Check Docker image exists
echo "[2/5] Checking cfn-agent:test image..."
if ! docker image inspect cfn-agent:test >/dev/null 2>&1; then
  echo "⚠️  cfn-agent:test image not found"
  echo "Building minimal test agent image..."

  cat > /tmp/Dockerfile.cfn-agent-test <<'EOF'
FROM node:20-alpine

# Install CFN Loop CLI and dependencies
RUN npm install -g claude-flow-novice && \
    apk add --no-cache bash git curl

WORKDIR /workspace

# Simple test entrypoint (just echo for Phase 1 validation)
ENTRYPOINT ["sh", "-c", "echo 'Agent Type: ${AGENT_TYPE}' && echo 'Task ID: ${TASK_ID}' && echo 'Task: $@' && sleep 2"]
EOF

  docker build -f /tmp/Dockerfile.cfn-agent-test -t cfn-agent:test "$PROJECT_ROOT"
  rm /tmp/Dockerfile.cfn-agent-test
fi
echo "✅ cfn-agent:test image ready"
echo ""

# Step 3: Check cfn-network exists
echo "[3/5] Checking cfn-network..."
if ! docker network inspect cfn-network >/dev/null 2>&1; then
  echo "Creating cfn-network..."
  docker network create cfn-network
fi
echo "✅ cfn-network ready"
echo ""

# Step 4: Test direct Docker spawning (bypass trigger.dev for validation)
echo "[4/5] Testing direct container spawning..."
CONTAINER_NAME="cfn-agent-test-$$"

docker run --rm \
  --name "$CONTAINER_NAME" \
  --network cfn-network \
  --cpus=2 \
  --memory=4g \
  -e TASK_ID="test-task-123" \
  -e AGENT_TYPE="backend-developer" \
  -v /tmp:/workspace \
  cfn-agent:test \
  "Test container spawning" || {
    echo "❌ Direct container spawning failed"
    exit 1
  }

echo "✅ Direct container spawning successful"
echo ""

# Step 5: Validate job structure
echo "[5/5] Validating job structure..."

# Check job exports
if ! grep -q "testSingleAgentJob" "$TRIGGER_DIR/dist/jobs/index.js"; then
  echo "❌ Job not exported from index.js"
  exit 1
fi

# Check client initialization
if ! grep -q "TriggerClient" "$TRIGGER_DIR/dist/index.js"; then
  echo "❌ TriggerClient not initialized in index.js"
  exit 1
fi

echo "✅ Job structure valid"
echo ""

# Summary
echo "=== Phase 1 Validation Complete ==="
echo ""
echo "✅ All validation checks passed"
echo ""
echo "Next steps:"
echo "1. Start trigger.dev server: cd $TRIGGER_DIR && docker-compose up -d"
echo "2. Register job with trigger.dev API"
echo "3. Trigger test event:"
echo ""
echo "   curl -X POST http://localhost:3000/api/v1/events \\
     -H 'Authorization: Bearer \$TRIGGER_API_KEY' \\
     -H 'Content-Type: application/json' \\
     -d '{
       \"event\": \"test.agent.spawn\",
       \"payload\": {
         \"agentType\": \"backend-developer\",
         \"taskDescription\": \"Test container spawning\"
       }
     }'"
echo ""
echo "4. Monitor job execution in trigger.dev dashboard: http://localhost:3040"
echo ""
