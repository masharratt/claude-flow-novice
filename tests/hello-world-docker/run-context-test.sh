#!/bin/bash

# Context Passing Test Runner
# Tests coordinator-to-agent communication patterns

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

# Parse arguments
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            cat << EOF
Context Passing Test Runner

Usage: $0 [OPTIONS]

Options:
  --verbose       Enable verbose logging
  --help          Show this help message

Description:
  Tests different methods of passing context from coordinator to agents:
  1. File-based instruction passing (last resort)
  2. Environment variable context
  3. Volume-mounted configuration files
  4. Dynamic task assignment

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log "📬 Starting Context Passing Test"
log "Project root: ${PROJECT_ROOT}"
log "Test script: ${SCRIPT_DIR}/context-passing-test.js"

# Verify prerequisites
log "🔍 Verifying prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker not found. Please install Docker."
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker daemon not running. Please start Docker."
    exit 1
fi

log_success "Docker is available"

# Check Redis
if ! command -v redis-cli &> /dev/null; then
    log_error "redis-cli not found. Please install Redis tools."
    exit 1
fi

if ! redis-cli ping &> /dev/null; then
    log_error "Redis server not running. Please start Redis."
    exit 1
fi

log_success "Redis is available"

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Please install Node.js."
    exit 1
fi

log_success "Node.js is available"

# Verify Docker image exists
DOCKER_IMAGE="claude-flow-novice:agent"
if ! docker image inspect "$DOCKER_IMAGE" &> /dev/null; then
    log_error "Docker image '$DOCKER_IMAGE' not found."
    log_error "Please build the agent image first:"
    log_error "  docker build -t $DOCKER_IMAGE ."
    exit 1
fi

log_success "Docker image '$DOCKER_IMAGE' is available"

# Create test results directory
TEST_RESULTS_DIR="${PROJECT_ROOT}/test-results/context-passing-test"
mkdir -p "$TEST_RESULTS_DIR"

# Run the test
log "📬 Running context passing test..."
log "Results will be saved to: ${TEST_RESULTS_DIR}"

cd "$PROJECT_ROOT"

# Set environment variables
export NODE_OPTIONS="--max-old-space-size=2048"
export VERBOSE_LOGGING=$VERBOSE

# Execute the test
TEST_START_TIME=$(date +%s)

if node "${SCRIPT_DIR}/context-passing-test.js" 2>&1 | tee "${TEST_RESULTS_DIR}/test-output.log"; then
    TEST_EXIT_CODE=0
    TEST_STATUS="PASSED"
    log_success "Context passing test completed successfully"
else
    TEST_EXIT_CODE=$?
    TEST_STATUS="FAILED"
    log_error "Context passing test failed with exit code: $TEST_EXIT_CODE"
fi

TEST_END_TIME=$(date +%s)
TEST_DURATION=$((TEST_END_TIME - TEST_START_TIME))

# Save test results
cat > "${TEST_RESULTS_DIR}/test-summary.json" << EOF
{
  "testSuite": "Context Passing Test",
  "timestamp": "$(date -Iseconds)",
  "duration": ${TEST_DURATION},
  "status": "${TEST_STATUS}",
  "exitCode": ${TEST_EXIT_CODE},
  "outputLog": "test-output.log",
  "projectRoot": "${PROJECT_ROOT}"
}
EOF

log "📊 Test completed in ${TEST_DURATION} seconds"
log "📄 Results saved to: ${TEST_RESULTS_DIR}/"

# Show final status
if [[ $TEST_EXIT_CODE -eq 0 ]]; then
    log_success "✅ CONTEXT PASSING TEST PASSED"
    echo ""
    echo "Validated communication patterns:"
    echo "  - File-based instruction passing"
    echo "  - Environment variable context"
    echo "  - Volume-mounted configuration"
    echo "  - Dynamic task assignment"
    echo ""
    echo "Next steps:"
    echo "  - Review detailed output: ${TEST_RESULTS_DIR}/test-output.log"
    echo "  - Check agent output files and context processing"
    echo "  - Verify context delivery mechanisms work reliably"
else
    log_error "❌ CONTEXT PASSING TEST FAILED"
    echo ""
    echo "Debugging steps:"
    echo "  - Review error log: ${TEST_RESULTS_DIR}/test-output.log"
    echo "  - Check agent container logs: docker logs <container-id>"
    echo "  - Verify context files were created correctly"
    echo "  - Re-run with --verbose for detailed logging"
fi

exit $TEST_EXIT_CODE