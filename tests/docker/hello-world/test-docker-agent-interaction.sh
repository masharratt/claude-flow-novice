#!/usr/bin/env bash
# Docker Agent Interaction POC Test
# Tests if we can deploy a Claude agent via Docker and interact with it

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="cfn-agent-poc"
IMAGE_TAG="latest"
CONTAINER_NAME="cfn-agent-test-$$"  # Unique name per run
TASK_ID="docker-test-$(date +%s)"
AGENT_TYPE="test-docker-agent"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"

# Test results
TEST_RESULTS=()
ERRORS=()

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    TEST_RESULTS+=("✅ $1")
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ERRORS+=("❌ $1")
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

cleanup() {
    log_info "Cleaning up test resources..."

    # Stop and remove container if it exists
    if docker ps -a | grep -q "$CONTAINER_NAME"; then
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
        log_info "Container removed: $CONTAINER_NAME"
    fi

    # Optionally remove image (comment out to keep for faster re-runs)
    # docker rmi "${IMAGE_NAME}:${IMAGE_TAG}" 2>/dev/null || true
}

# Trap cleanup on exit
trap cleanup EXIT

echo "=========================================="
echo "Docker Agent Interaction POC Test"
echo "=========================================="
echo ""

# Test 1: Build Docker image
log_info "Test 1: Building Docker image..."
cd "$PROJECT_ROOT"

if docker build -f tests/docker-deployment/Dockerfile.agent-poc -t "${IMAGE_NAME}:${IMAGE_TAG}" .; then
    IMAGE_SIZE=$(docker images "${IMAGE_NAME}:${IMAGE_TAG}" --format "{{.Size}}")
    log_success "Docker image built successfully (Size: $IMAGE_SIZE)"

    # Check if under 500MB
    SIZE_MB=$(docker images "${IMAGE_NAME}:${IMAGE_TAG}" --format "{{.Size}}" | sed 's/MB//' | awk '{print int($1)}')
    if [ "$SIZE_MB" -lt 500 ] 2>/dev/null; then
        log_success "Image size is under 500MB target"
    else
        log_warn "Image size exceeds 500MB target (actual: ${IMAGE_SIZE})"
    fi
else
    log_error "Docker image build failed"
    exit 1
fi

echo ""

# Test 2: Verify Redis is available (required for agent coordination)
log_info "Test 2: Verifying Redis availability..."
if redis-cli ping > /dev/null 2>&1; then
    log_success "Redis is running and accessible"
else
    log_error "Redis is not running. Start with: redis-server"
    log_warn "Agents require Redis for coordination protocol"
    exit 1
fi

echo ""

# Test 3: Check if agent definition exists
log_info "Test 3: Verifying agent definition..."
AGENT_FILE="tests/docker-deployment/test-docker-agent.md"
if [ -f "$AGENT_FILE" ]; then
    log_success "Agent definition found: $AGENT_FILE"
else
    log_error "Agent definition not found: $AGENT_FILE"
    exit 1
fi

echo ""

# Test 4: Run container with agent task
log_info "Test 4: Running agent in Docker container..."

# Check if ZAI_API_KEY is set
if [ -z "$ZAI_API_KEY" ]; then
    log_error "ZAI_API_KEY environment variable not set"
    log_warn "Docker agent needs Z.ai API key to communicate with Claude"
    exit 1
fi

# Run container with agent spawn command
log_info "Spawning agent in container..."
log_info "Task ID: $TASK_ID"
log_info "Agent Type: $AGENT_TYPE"

# Note: In POC, we run agent command directly
# In production, this would be via entry point with proper context injection
docker run --name "$CONTAINER_NAME" \
    --network host \
    -e ZAI_API_KEY="$ZAI_API_KEY" \
    -e ZAI_BASE_URL="https://api.z.ai/api/anthropic" \
    -e CLAUDE_API_PROVIDER="zai" \
    -e REDIS_HOST="localhost" \
    -e REDIS_PORT="6379" \
    -e NODE_ENV="production" \
    -v "$PROJECT_ROOT/tests/docker-deployment:/app/tests/docker-deployment" \
    "${IMAGE_NAME}:${IMAGE_TAG}" \
    node dist/cli/index.js agent "$AGENT_TYPE" \
        --task-id "$TASK_ID" \
        --context "Create file /tmp/docker-test.txt with content 'Hello from Docker agent'" \
    > /tmp/agent-output-$$.log 2>&1 &

DOCKER_PID=$!

# Wait for container to complete (with timeout)
log_info "Waiting for agent to complete (timeout: 120s)..."
WAIT_TIME=0
MAX_WAIT=120

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        log_info "Container has stopped"
        break
    fi
    sleep 2
    WAIT_TIME=$((WAIT_TIME + 2))
    echo -n "."
done
echo ""

# Get container exit code
EXIT_CODE=$(docker inspect "$CONTAINER_NAME" --format='{{.State.ExitCode}}' 2>/dev/null || echo "255")

if [ "$EXIT_CODE" = "0" ]; then
    log_success "Container exited cleanly (exit code: 0)"
else
    log_error "Container exited with error (exit code: $EXIT_CODE)"
fi

echo ""

# Test 5: Verify agent output
log_info "Test 5: Verifying agent output..."
CONTAINER_LOGS=$(docker logs "$CONTAINER_NAME" 2>&1)

echo "$CONTAINER_LOGS" > "/tmp/docker-agent-logs-$TASK_ID.txt"
log_info "Logs saved to: /tmp/docker-agent-logs-$TASK_ID.txt"

# Check for key indicators in output
if echo "$CONTAINER_LOGS" | grep -q "docker-test.txt"; then
    log_success "Agent attempted file creation"
else
    log_warn "No evidence of file creation attempt in logs"
fi

if echo "$CONTAINER_LOGS" | grep -qi "confidence"; then
    CONFIDENCE=$(echo "$CONTAINER_LOGS" | grep -i "confidence" | head -1)
    log_success "Agent reported confidence: $CONFIDENCE"
else
    log_warn "No confidence score found in output"
fi

echo ""

# Test 6: Check for file creation in container
log_info "Test 6: Checking file creation inside container..."

# Note: Since agent ran and container stopped, file is gone
# In production, we'd use volumes or check during execution
# For POC, we verify from logs

if echo "$CONTAINER_LOGS" | grep -q "created\|written\|success"; then
    log_success "Agent indicates file operations succeeded"
else
    log_warn "No clear success indicators in output"
fi

echo ""

# Test 7: Verify Redis coordination signals
log_info "Test 7: Checking Redis coordination signals..."

# Check if agent signaled completion
COMPLETION_SIGNAL=$(redis-cli llen "swarm:${TASK_ID}:${AGENT_TYPE}:done" 2>/dev/null || echo "0")
if [ "$COMPLETION_SIGNAL" != "0" ]; then
    log_success "Agent signaled completion to Redis"
else
    log_warn "No completion signal found in Redis (key: swarm:${TASK_ID}:${AGENT_TYPE}:done)"
fi

# Check confidence score in Redis
CONFIDENCE_KEY=$(redis-cli keys "*${TASK_ID}*confidence*" 2>/dev/null | head -1)
if [ -n "$CONFIDENCE_KEY" ]; then
    CONFIDENCE_VALUE=$(redis-cli get "$CONFIDENCE_KEY" 2>/dev/null || echo "N/A")
    log_success "Confidence score stored in Redis: $CONFIDENCE_VALUE"
else
    log_warn "No confidence score found in Redis"
fi

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""

# Print all results
echo "Successful Tests:"
for result in "${TEST_RESULTS[@]}"; do
    echo "$result"
done

echo ""

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "Errors Encountered:"
    for error in "${ERRORS[@]}"; do
        echo "$error"
    done
    echo ""
    FINAL_RESULT="FAILED"
else
    FINAL_RESULT="PASSED"
fi

echo "Container Logs Preview (last 20 lines):"
echo "----------------------------------------"
docker logs --tail 20 "$CONTAINER_NAME" 2>&1 || echo "(no logs available)"
echo "----------------------------------------"
echo ""

echo "Final Result: $FINAL_RESULT"
echo ""
echo "Next Steps:"
echo "1. Review detailed logs: /tmp/docker-agent-logs-$TASK_ID.txt"
echo "2. Check POC_RESULTS.md for findings and recommendations"
echo "3. If successful, proceed to production Dockerfile implementation"
echo ""

# Exit with appropriate code
if [ "$FINAL_RESULT" = "PASSED" ]; then
    exit 0
else
    exit 1
fi
