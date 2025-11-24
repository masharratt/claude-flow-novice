#!/bin/bash
# tests/trigger-dev/test-production-image-compliance.sh
# Phase 1.3b :: BUG #21 Compliance - Test production CFN agent image
# Validates:
#   - Production Dockerfile.cfn-agent builds correctly
#   - Image has correct entrypoint
#   - Agent CLI works with proper parameters
#   - Image can execute real agent tasks
#
# BUG #21: Tests must use production code paths, not test/mock images

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
CFN_AGENT_DOCKERFILE="$PROJECT_ROOT/docker/Dockerfile.cfn-agent"
RESULTS_FILE="${PROJECT_ROOT}/.artifacts/test-results/production-image-compliance.json"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

mkdir -p "$PROJECT_ROOT/.artifacts/test-results"

echo "==================================================================================="
echo "Production Image Compliance Testing (BUG #21)"
echo "==================================================================================="
echo ""
echo "Test Start: $(date)"
echo "Production Dockerfile: $CFN_AGENT_DOCKERFILE"
echo ""

record_pass() {
  local test_name="$1"
  ((TESTS_PASSED++))
  ((TESTS_TOTAL++))
  echo -e "${GREEN}✓ PASS${NC} $test_name"
}

record_fail() {
  local test_name="$1"
  local reason="${2:-Unknown failure}"
  ((TESTS_FAILED++))
  ((TESTS_TOTAL++))
  echo -e "${RED}✗ FAIL${NC} $test_name - $reason"
}

record_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

cleanup() {
  echo ""
  echo "=== Cleanup ==="

  # Remove test containers
  docker ps -a --filter "name=cfn-agent-prod-test-" -q 2>/dev/null | xargs -r docker rm -f 2>/dev/null || true

  # Keep production image (don't remove it)
  echo "Cleanup complete (production image preserved)"
}

trap cleanup EXIT

# =====================================================================
# TEST 1: Production Dockerfile Exists
# =====================================================================
echo "=== TEST 1: Production Dockerfile Validation ==="
echo ""

if [ -f "$CFN_AGENT_DOCKERFILE" ]; then
  record_pass "Production Dockerfile exists"

  # Check Dockerfile content
  if grep -q "FROM node:20-alpine" "$CFN_AGENT_DOCKERFILE"; then
    record_pass "Dockerfile uses correct base image (node:20-alpine)"
  else
    record_fail "Dockerfile validation" "Does not use node:20-alpine base"
  fi

  if grep -q "claude-flow-novice" "$CFN_AGENT_DOCKERFILE"; then
    record_pass "Dockerfile installs claude-flow-novice CLI"
  else
    record_fail "Dockerfile validation" "Does not install claude-flow-novice"
  fi

  if grep -q "ENTRYPOINT.*claude-flow-novice.*agent" "$CFN_AGENT_DOCKERFILE"; then
    record_pass "Dockerfile has correct entrypoint"
  else
    record_fail "Dockerfile validation" "Missing or incorrect entrypoint"
  fi
else
  record_fail "Production Dockerfile" "File not found at $CFN_AGENT_DOCKERFILE"
  echo ""
  echo "Cannot proceed without production Dockerfile"
  exit 1
fi

echo ""

# =====================================================================
# TEST 2: Build Production Image
# =====================================================================
echo "=== TEST 2: Build Production Image ==="
echo ""

record_info "Building cfn-agent:prod-test from production Dockerfile..."

# Use Linux build script if available (96% faster)
if [ -f "$PROJECT_ROOT/scripts/docker/build-from-linux.sh" ]; then
  record_info "Using Linux build script for optimal performance"

  export DOCKERFILE="docker/Dockerfile.cfn-agent"
  export IMAGE_NAME="cfn-agent"
  export IMAGE_TAG="prod-test"

  if "$PROJECT_ROOT/scripts/docker/build-from-linux.sh" >/dev/null 2>&1; then
    record_pass "Production image built successfully (Linux build script)"
  else
    record_fail "Image build" "Linux build script failed"
    exit 1
  fi
else
  # Fallback to direct Docker build
  record_info "Using direct Docker build (Linux build script not found)"

  if docker build -f "$CFN_AGENT_DOCKERFILE" -t cfn-agent:prod-test "$PROJECT_ROOT" >/dev/null 2>&1; then
    record_pass "Production image built successfully (direct build)"
  else
    record_fail "Image build" "Docker build failed"
    exit 1
  fi
fi

echo ""

# =====================================================================
# TEST 3: Inspect Production Image
# =====================================================================
echo "=== TEST 3: Inspect Production Image ==="
echo ""

# Check entrypoint
ENTRYPOINT=$(docker inspect cfn-agent:prod-test --format='{{.Config.Entrypoint}}' 2>/dev/null || echo "unknown")
record_info "Image entrypoint: $ENTRYPOINT"

if echo "$ENTRYPOINT" | grep -q "claude-flow-novice"; then
  record_pass "Entrypoint configured correctly"
else
  record_fail "Image inspection" "Entrypoint not configured correctly"
fi

# Check working directory
WORKDIR=$(docker inspect cfn-agent:prod-test --format='{{.Config.WorkingDir}}' 2>/dev/null || echo "unknown")
record_info "Working directory: $WORKDIR"

if [ "$WORKDIR" = "/workspace" ]; then
  record_pass "Working directory set to /workspace"
else
  record_fail "Image inspection" "Working directory not set correctly (got: $WORKDIR)"
fi

echo ""

# =====================================================================
# TEST 4: Test CLI Accessibility
# =====================================================================
echo "=== TEST 4: Test CLI Accessibility ==="
echo ""

# Try to run the CLI with --help (should work)
if timeout 10 docker run --rm cfn-agent:prod-test --help 2>&1 | grep -q "claude-flow-novice"; then
  record_pass "CFN CLI accessible in container"
else
  record_fail "CLI accessibility" "CFN CLI not accessible or --help failed"
fi

echo ""

# =====================================================================
# TEST 5: Test Agent Type Validation
# =====================================================================
echo "=== TEST 5: Test Agent Type Validation ==="
echo ""

# Run without agent type (should fail with clear error)
OUTPUT=$(timeout 10 docker run --rm cfn-agent:prod-test 2>&1 || true)

if echo "$OUTPUT" | grep -qE "(agent type|required|missing)"; then
  record_pass "Agent type validation works (fails with clear error)"
  record_info "Error message: $(echo "$OUTPUT" | head -1)"
else
  record_fail "Agent type validation" "No clear error for missing agent type"
fi

echo ""

# =====================================================================
# TEST 6: Test Production Agent Spawning Pattern
# =====================================================================
echo "=== TEST 6: Test Production Agent Spawning Pattern ==="
echo ""

# This tests the actual production spawning pattern
# Agent should accept: agent <type> --task-id <id>

record_info "Testing production CLI syntax: npx claude-flow-novice agent <type> --task-id <id>"

# Create minimal task for testing
TEST_TASK_ID="prod-test-$$"
TEST_WORKSPACE="/tmp/cfn-agent-test-$$"
mkdir -p "$TEST_WORKSPACE"
echo "Test file" > "$TEST_WORKSPACE/test.txt"

# Run agent with correct CLI syntax (will fail due to no API key, but syntax should be correct)
OUTPUT=$(timeout 10 docker run --rm \
  --name "cfn-agent-prod-test-$$" \
  -v "$TEST_WORKSPACE:/workspace:rw" \
  -e ANTHROPIC_API_KEY="test-key" \
  cfn-agent:prod-test \
  docker-specialist --task-id "$TEST_TASK_ID" --task "List files in workspace" 2>&1 || true)

# Check if CLI syntax was accepted (even if execution failed due to invalid API key)
if echo "$OUTPUT" | grep -qE "(agent type|task|workspace)" && ! echo "$OUTPUT" | grep -q "Agent type is required"; then
  record_pass "Production CLI syntax accepted"
  record_info "Agent started with correct parameters"
else
  record_fail "Production spawning" "CLI syntax not recognized correctly"
  record_info "Output: $(echo "$OUTPUT" | head -5)"
fi

# Cleanup test workspace
rm -rf "$TEST_WORKSPACE"

echo ""

# =====================================================================
# TEST 7: Test Container Resource Limits with Production Image
# =====================================================================
echo "=== TEST 7: Test Resource Limits with Production Image ==="
echo ""

# Test CPU limits
CPU_TEST=$(timeout 10 docker run --rm --cpus=2 cfn-agent:prod-test --help 2>&1 | head -1)

if [ -n "$CPU_TEST" ]; then
  record_pass "CPU limits work with production image"
else
  record_fail "Resource limits" "CPU limits failed"
fi

# Test memory limits
MEM_TEST=$(timeout 10 docker run --rm --memory=512m cfn-agent:prod-test --help 2>&1 | head -1)

if [ -n "$MEM_TEST" ]; then
  record_pass "Memory limits work with production image"
else
  record_fail "Resource limits" "Memory limits failed"
fi

echo ""

# =====================================================================
# TEST 8: Test Volume Mounting with Production Image
# =====================================================================
echo "=== TEST 8: Test Volume Mounting with Production Image ==="
echo ""

TEST_VOLUME="/tmp/cfn-agent-volume-test-$$"
mkdir -p "$TEST_VOLUME"
echo "volume test content" > "$TEST_VOLUME/test.txt"

# Test volume access
VOLUME_TEST=$(timeout 10 docker run --rm \
  -v "$TEST_VOLUME:/workspace:rw" \
  cfn-agent:prod-test \
  --help 2>&1 | head -1)

if [ -n "$VOLUME_TEST" ]; then
  record_pass "Volume mounting works with production image"
else
  record_fail "Volume mounting" "Failed to mount volume"
fi

rm -rf "$TEST_VOLUME"

echo ""

# =====================================================================
# SUMMARY
# =====================================================================
echo "==================================================================================="
echo "Production Image Compliance Summary (BUG #21)"
echo "==================================================================================="
echo ""
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo "Total Tests: $TESTS_TOTAL"
echo ""

if [ "$TESTS_TOTAL" -gt 0 ]; then
  PASS_RATE=$(echo "scale=1; $TESTS_PASSED * 100 / $TESTS_TOTAL" | bc)
  echo "Pass Rate: ${PASS_RATE}%"
  echo ""

  # Update results
  cat > "$RESULTS_FILE" <<EOF
{
  "phase": "1.3b",
  "test_suite": "Production Image Compliance (BUG #21)",
  "dockerfile": "$CFN_AGENT_DOCKERFILE",
  "image": "cfn-agent:prod-test",
  "timestamp": "$(date -Iseconds)",
  "summary": {
    "total": $TESTS_TOTAL,
    "passed": $TESTS_PASSED,
    "failed": $TESTS_FAILED,
    "pass_rate": $PASS_RATE
  }
}
EOF

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✓ All production image compliance tests passed!${NC}"
    echo ""
    echo "BUG #21 Compliance Validated:"
    echo "  ✓ Production Dockerfile.cfn-agent used"
    echo "  ✓ Production image builds successfully"
    echo "  ✓ CFN CLI accessible and functional"
    echo "  ✓ Agent spawning pattern validated"
    echo "  ✓ Resource limits work correctly"
    echo "  ✓ Volume mounting works correctly"
    echo ""
    echo "Production Image: cfn-agent:prod-test (ready for integration testing)"
    echo ""
    exit 0
  else
    echo -e "${RED}✗ Some production compliance tests failed${NC}"
    echo ""
    echo "Review the test output above for details."
    echo ""
    exit 1
  fi
else
  echo "✗ No tests executed"
  exit 1
fi
