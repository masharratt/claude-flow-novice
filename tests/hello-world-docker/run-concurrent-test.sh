#!/bin/bash

# Concurrent Docker Agent Test Runner
# Usage: ./run-concurrent-test.sh [--verbose] [--skip-cleanup]

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
SKIP_CLEANUP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose)
            VERBOSE=true
            shift
            ;;
        --skip-cleanup)
            SKIP_CLEANUP=true
            shift
            ;;
        --help)
            cat << EOF
Concurrent Docker Agent Test Runner

Usage: $0 [OPTIONS]

Options:
  --verbose       Enable verbose logging
  --skip-cleanup  Skip cleanup step (for debugging)
  --help          Show this help message

Description:
  Runs concurrent Docker agent test with 6-7 agents in parallel.
  Tests real container file operations, result coordination,
  and automatic cleanup verification.

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

log "🚀 Starting Concurrent Docker Agent Test"
log "Project root: ${PROJECT_ROOT}"
log "Test script: ${SCRIPT_DIR}/concurrent-agent-test.js"

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
TEST_RESULTS_DIR="${PROJECT_ROOT}/test-results/concurrent-docker-test"
mkdir -p "$TEST_RESULTS_DIR"

# Run the test
log "🧪 Running concurrent agent test..."
log "Results will be saved to: ${TEST_RESULTS_DIR}"

cd "$PROJECT_ROOT"

# Set environment variables
export NODE_OPTIONS="--max-old-space-size=4096"
export VERBOSE_LOGGING=$VERBOSE

# Execute the test
TEST_START_TIME=$(date +%s)

if node "${SCRIPT_DIR}/concurrent-agent-test.js" 2>&1 | tee "${TEST_RESULTS_DIR}/test-output.log"; then
    TEST_EXIT_CODE=0
    TEST_STATUS="PASSED"
    log_success "Test completed successfully"
else
    TEST_EXIT_CODE=$?
    TEST_STATUS="FAILED"
    log_error "Test failed with exit code: $TEST_EXIT_CODE"
fi

TEST_END_TIME=$(date +%s)
TEST_DURATION=$((TEST_END_TIME - TEST_START_TIME))

# Save test results
cat > "${TEST_RESULTS_DIR}/test-summary.json" << EOF
{
  "testSuite": "Concurrent Docker Agent MVP Test",
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
    log_success "✅ CONCURRENT AGENT TEST PASSED"
    echo ""
    echo "Next steps:"
    echo "  - Review test output: ${TEST_RESULTS_DIR}/test-output.log"
    echo "  - Check generated files in workspaces"
    echo "  - Verify container cleanup was successful"
else
    log_error "❌ CONCURRENT AGENT TEST FAILED"
    echo ""
    echo "Debugging steps:"
    echo "  - Review error log: ${TEST_RESULTS_DIR}/test-output.log"
    echo "  - Check Docker containers: docker ps -a | grep agent-"
    echo "  - Check Redis state: redis-cli keys '*'"
    echo "  - Re-run with --verbose for detailed logging"
fi

# Optional cleanup check
if [[ "$SKIP_CLEANUP" == false ]]; then
    log "🧹 Checking for any remaining resources..."

    # Check for orphaned containers
    ORPHANED_CONTAINERS=$(docker ps -a --filter "name=agent-" --format "{{.Names}}" | wc -l)
    if [[ $ORPHANED_CONTAINERS -gt 0 ]]; then
        log_warning "Found ${ORPHANED_CONTAINERS} orphaned containers:"
        docker ps -a --filter "name=agent-" --format "table {{.Names}}\t{{.Status}}"

        log_warning "You may want to manually clean up:"
        echo "  docker stop \$(docker ps -a -q --filter 'name=agent-')"
        echo "  docker rm \$(docker ps -a -q --filter 'name=agent-')"
    else
        log_success "No orphaned containers found"
    fi

    # Check for workspace directories
    WORKSPACE_COUNT=$(find /tmp -name "agent-workspace-*" -type d 2>/dev/null | wc -l)
    if [[ $WORKSPACE_COUNT -gt 0 ]]; then
        log_warning "Found ${WORKSPACE_COUNT} workspace directories in /tmp"
        find /tmp -name "agent-workspace-*" -type d 2>/dev/null | head -5
    else
        log_success "No workspace directories found"
    fi
fi

exit $TEST_EXIT_CODE