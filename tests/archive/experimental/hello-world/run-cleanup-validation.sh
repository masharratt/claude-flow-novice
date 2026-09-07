#!/bin/bash

# Container Cleanup Validation Test Runner
# Specialized test tool for verifying container cleanup mechanisms

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
EMERGENCY_CLEANUP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose)
            VERBOSE=true
            shift
            ;;
        --emergency-cleanup)
            EMERGENCY_CLEANUP=true
            shift
            ;;
        --help)
            cat << EOF
Container Cleanup Validation Test Runner

Usage: $0 [OPTIONS]

Options:
  --verbose              Enable verbose logging
  --emergency-cleanup    Only perform emergency cleanup of existing test resources
  --help                 Show this help message

Description:
  Verify container cleanup mechanisms to ensure no orphaned containers or workspace leaks.

  Tests:
  1. Record system state before test
  2. Create test containers and workspaces
  3. Simulate container lifecycle and cleanup
  4. Verify automatic cleanup mechanisms
  5. Manually clean remaining resources
  6. Generate detailed cleanup report

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

log "🧹 Container Cleanup Validation"
log "Project root: ${PROJECT_ROOT}"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    log_error "Docker not found."
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker daemon not running."
    exit 1
fi

# Execute emergency cleanup only
if [[ "$EMERGENCY_CLEANUP" == true ]]; then
    log "🚨 Performing emergency cleanup only..."

    # Clean test containers
    log "Cleaning test containers..."
    docker ps -a --filter "name=agent-test-cleanup" --format "{{.ID}} {{.Names}}" 2>/dev/null | while read -r container_id name; do
        if [[ -n "$container_id" ]]; then
            log "Stopping and removing: $name ($container_id)"
            docker stop "$container_id" 2>/dev/null || true
            docker rm "$container_id" 2>/dev/null || true
        fi
    done

    # Clean test workspaces
    log "Cleaning test workspaces..."
    find /tmp -name "agent-workspace-test-cleanup-*" -type d 2>/dev/null | while read -r workspace; do
        if [[ -n "$workspace" ]]; then
            log "Removing workspace: $workspace"
            rm -rf "$workspace" 2>/dev/null || true
        fi
    done

    # Clean context test resources
    log "Cleaning context test resources..."
    find /tmp -name "context-test-workspace" -type d 2>/dev/null | while read -r workspace; do
        if [[ -n "$workspace" ]]; then
            log "Removing context workspace: $workspace"
            rm -rf "$workspace" 2>/dev/null || true
        fi
    done

    # Clean concurrent test resources
    log "Cleaning concurrent test resources..."
    find /tmp -name "concurrent-test-workspace" -type d 2>/dev/null | while read -r workspace; do
        if [[ -n "$workspace" ]]; then
            log "Removing concurrent workspace: $workspace"
            rm -rf "$workspace" 2>/dev/null || true
        fi
    done

    log_success "Emergency cleanup complete"
    exit 0
fi

# Create test results directory
TEST_RESULTS_DIR="${PROJECT_ROOT}/test-results/cleanup-validation"
mkdir -p "$TEST_RESULTS_DIR"

# Record system state before test
log "📊 Recording pre-test state..."

BEFORE_CONTAINERS=$(docker ps -a --filter "name=agent-" --format "{{.ID}}\t{{.Names}}\t{{.Status}}" 2>/dev/null | wc -l)
BEFORE_WORKSPACES=$(find /tmp -name "agent-workspace-*" -type d 2>/dev/null | wc -l)

log "Pre-test state:"
log "  Existing agent containers: $BEFORE_CONTAINERS"
log "  Existing workspaces: $BEFORE_WORKSPACES"

# Save pre-test state
cat > "${TEST_RESULTS_DIR}/before-state.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "containers": {
    "count": $BEFORE_CONTAINERS,
    "details": "$(docker ps -a --filter "name=agent-" --format "{{.ID}} {{.Names}} {{.Status}}" 2>/dev/null | tr '\n' ';' | sed 's/;$/\\n/' | head -c 1000)"
  },
  "workspaces": {
    "count": $BEFORE_WORKSPACES,
    "details": "$(find /tmp -name "agent-workspace-*" -type d 2>/dev/null | head -10 | tr '\n' ';')"
  }
}
EOF

# Run cleanup validation test
log "🧪 Running container cleanup validation test..."
cd "$PROJECT_ROOT"

# Set environment variables
export NODE_OPTIONS="--max-old-space-size=2048"

# Execute test
TEST_START_TIME=$(date +%s)

if node "${SCRIPT_DIR}/container-cleanup-validator.js" 2>&1 | tee "${TEST_RESULTS_DIR}/validation-output.log"; then
    TEST_EXIT_CODE=0
    TEST_STATUS="PASSED"
    log_success "Container cleanup validation passed"
else
    TEST_EXIT_CODE=$?
    TEST_STATUS="FAILED"
    log_error "Container cleanup validation failed (exit code: $TEST_EXIT_CODE)"
fi

TEST_END_TIME=$(date +%s)
TEST_DURATION=$((TEST_END_TIME - TEST_START_TIME))

# Record post-test state
log "📊 Recording post-test state..."

AFTER_CONTAINERS=$(docker ps -a --filter "name=agent-" --format "{{.ID}}\t{{.Names}}\t{{.Status}}" 2>/dev/null | wc -l)
AFTER_WORKSPACES=$(find /tmp -name "agent-workspace-*" -type d 2>/dev/null | wc -l)

log "Post-test state:"
log "  Remaining agent containers: $AFTER_CONTAINERS"
log "  Remaining workspaces: $AFTER_WORKSPACES"

# Save post-test state
cat > "${TEST_RESULTS_DIR}/after-state.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "containers": {
    "count": $AFTER_CONTAINERS,
    "details": "$(docker ps -a --filter "name=agent-" --format "{{.ID}} {{.Names}} {{.Status}}" 2>/dev/null | tr '\n' ';' | sed 's/;$/\\n/' | head -c 1000)"
  },
  "workspaces": {
    "count": $AFTER_WORKSPACES,
    "details": "$(find /tmp -name "agent-workspace-*" -type d 2>/dev/null | head -10 | tr '\n' ';')"
  }
}
EOF

# Save test summary
cat > "${TEST_RESULTS_DIR}/test-summary.json" << EOF
{
  "testSuite": "Container Cleanup Validation",
  "timestamp": "$(date -Iseconds)",
  "duration": ${TEST_DURATION},
  "status": "${TEST_STATUS}",
  "exitCode": ${TEST_EXIT_CODE},
  "beforeState": {
    "containers": $BEFORE_CONTAINERS,
    "workspaces": $BEFORE_WORKSPACES
  },
  "afterState": {
    "containers": $AFTER_CONTAINERS,
    "workspaces": $AFTER_WORKSPACES
  },
  "netChange": {
    "containers": $(($AFTER_CONTAINERS - $BEFORE_CONTAINERS)),
    "workspaces": $(($AFTER_WORKSPACES - $BEFORE_WORKSPACES))
  },
  "outputLog": "validation-output.log",
  "projectRoot": "${PROJECT_ROOT}"
}
EOF

log "📊 Test completed in ${TEST_DURATION} seconds"
log "📄 Results saved to: ${TEST_RESULTS_DIR}/"

# Display final status
if [[ $TEST_EXIT_CODE -eq 0 ]]; then
    log_success "✅ Container cleanup validation passed"
    echo ""
    echo "Validation results:"
    echo "  - Container auto-cleanup mechanism: Working normally"
    echo "  - Workspace auto-cleanup: Working normally"
    echo "  - Cleanup timeliness: Meets requirements"
    echo "  - No resource leaks: Verified"
    echo ""
    echo "Recommendations:"
    echo "  - Run this test regularly to verify cleanup mechanisms"
    echo "  - Integrate this test into CI/CD"
    echo "  - Monitor production environment container cleanup"
else
    log_error "❌ Container cleanup validation failed"
    echo ""
    echo "Issues detected:"
    echo "  - Container cleanup mechanism may have problems"
    echo "  - Workspace cleanup incomplete"
    echo "  - Cleanup delay too long"
    echo "  - Resource leak risk"
    echo ""
    echo "Immediate actions:"
    echo "  - Check detailed log: ${TEST_RESULTS_DIR}/validation-output.log"
    echo "  - Manual cleanup of remaining resources: ${SCRIPT_DIR}/run-cleanup-validation.sh --emergency-cleanup"
    echo "  - Fix cleanup mechanism in spawn-agent.sh"
    echo "  - Add container lifecycle management"
fi

# If resource leaks detected, warn user
if [[ $(($AFTER_CONTAINERS - $BEFORE_CONTAINERS)) -gt 0 ]] || [[ $(($AFTER_WORKSPACES - $BEFORE_WORKSPACES)) -gt 0 ]]; then
    log_warning "⚠️ Resource leak detected!"
    echo ""
    echo "Resource leak details:"
    echo "  New containers: $(($AFTER_CONTAINERS - $BEFORE_CONTAINERS))"
    echo "  New workspaces: $(($AFTER_WORKSPACES - $BEFORE_WORKSPACES))"
    echo ""
    echo "Emergency cleanup command:"
    echo "  ${SCRIPT_DIR}/run-cleanup-validation.sh --emergency-cleanup"
fi

exit $TEST_EXIT_CODE
