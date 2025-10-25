#!/bin/bash

##############################################################################
# CFN v3 Orchestration Test Suite - Full Runner
#
# Executes all CFN v3 orchestration tests in sequence:
# 1. Coordinator initialization
# 2. Worker connections (cfnConnectionCount tracking)
# 3. Task distribution
# 4. Handoff coordination (cfnHandoffCount tracking)
# 5. State persistence (Redis + SQLite)
# 6. Graceful shutdown (cfnOrphanedProcesses tracking)
#
# Usage:
#   ./run-full-suite.sh [OPTIONS]
#
# Options:
#   --verbose         Enable verbose output
#   --debug           Enable debug logging
#   --no-cleanup      Skip cleanup (for debugging)
#   --test=NAME       Run specific test only
#   --workers=N       Number of workers to spawn (default: 5)
#   --tasks=N         Number of tasks to assign (default: 10)
#   --reviewers=N     Number of reviewers (default: 3)
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Default configuration
VERBOSE=false
DEBUG=false
NO_CLEANUP=false
SPECIFIC_TEST=""
CFN_TEST_WORKERS=5
CFN_TEST_TASKS=10
CFN_TEST_REVIEWERS=3

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()
START_TIME=$(date +%s)

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose)
      VERBOSE=true
      shift
      ;;
    --debug)
      DEBUG=true
      VERBOSE=true
      shift
      ;;
    --no-cleanup)
      NO_CLEANUP=true
      shift
      ;;
    --test=*)
      SPECIFIC_TEST="${1#*=}"
      shift
      ;;
    --workers=*)
      CFN_TEST_WORKERS="${1#*=}"
      shift
      ;;
    --tasks=*)
      CFN_TEST_TASKS="${1#*=}"
      shift
      ;;
    --reviewers=*)
      CFN_TEST_REVIEWERS="${1#*=}"
      shift
      ;;
    --help)
      echo "CFN v3 Orchestration Test Suite"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --verbose         Enable verbose output"
      echo "  --debug           Enable debug logging"
      echo "  --no-cleanup      Skip cleanup (for debugging)"
      echo "  --test=NAME       Run specific test only (e.g., 02-worker-connections)"
      echo "  --workers=N       Number of workers to spawn (default: 5)"
      echo "  --tasks=N         Number of tasks to assign (default: 10)"
      echo "  --reviewers=N     Number of reviewers (default: 3)"
      echo ""
      echo "Examples:"
      echo "  $0"
      echo "  $0 --verbose"
      echo "  $0 --test=02-worker-connections --verbose"
      echo "  $0 --workers=10 --tasks=20"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Export environment variables
export CFN_TEST_VERBOSE=$VERBOSE
export CFN_TEST_DEBUG=$DEBUG
export CFN_TEST_WORKERS
export CFN_TEST_TASKS
export CFN_TEST_REVIEWERS

# Logging functions
log() {
  echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

log_success() {
  echo -e "${GREEN}✅ $*${NC}"
}

log_error() {
  echo -e "${RED}❌ $*${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $*${NC}"
}

# Check prerequisites
check_prerequisites() {
  log "Checking prerequisites..."

  # Check Redis
  if ! redis-cli ping >/dev/null 2>&1; then
    log_error "Redis is not running. Please start Redis and try again."
    exit 1
  fi
  log_success "Redis is running"

  # Check Node.js version
  NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js version 18 or higher required (found: $(node --version))"
    exit 1
  fi
  log_success "Node.js version OK: $(node --version)"

  echo ""
}

# Create results directory
setup_results_dir() {
  mkdir -p "$SCRIPT_DIR/results"
  log_success "Results directory created"
  echo ""
}

# Run a single test
run_test() {
  local test_file=$1
  local test_name=$2
  local test_num=$3
  local total_tests=$4

  echo -e "${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}[$test_num/$total_tests] $test_name${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
  echo ""

  if [ ! -f "$test_file" ]; then
    log_warning "Test file not found: $test_file (SKIPPED)"
    echo ""
    return 0
  fi

  local start=$(date +%s)

  if node "$test_file"; then
    local duration=$(($(date +%s) - start))
    log_success "$test_name PASSED (${duration}s)"
    ((TESTS_PASSED++))
  else
    local duration=$(($(date +%s) - start))
    log_error "$test_name FAILED (${duration}s)"
    FAILED_TESTS+=("$test_name")
    ((TESTS_FAILED++))
  fi

  echo ""
}

# Main test execution
main() {
  echo -e "${BOLD}"
  echo "═══════════════════════════════════════════════════════════════════"
  echo "CFN v3 Orchestration Test Suite"
  echo "═══════════════════════════════════════════════════════════════════"
  echo -e "${NC}"
  echo "Configuration:"
  echo "  Workers:   $CFN_TEST_WORKERS"
  echo "  Tasks:     $CFN_TEST_TASKS"
  echo "  Reviewers: $CFN_TEST_REVIEWERS"
  echo "  Verbose:   $VERBOSE"
  echo "  Debug:     $DEBUG"
  echo ""

  check_prerequisites
  setup_results_dir

  # Define all tests
  declare -A TESTS
  TESTS["01-coordinator-init"]="Coordinator Initialization"
  TESTS["02-worker-connections"]="Worker Connections"
  TESTS["03-task-distribution"]="Task Distribution"
  TESTS["04-handoff-coordination"]="Handoff Coordination"
  TESTS["05-state-persistence"]="State Persistence"
  TESTS["06-graceful-shutdown"]="Graceful Shutdown"

  # Run specific test or all tests
  if [ -n "$SPECIFIC_TEST" ]; then
    if [ -z "${TESTS[$SPECIFIC_TEST]}" ]; then
      log_error "Unknown test: $SPECIFIC_TEST"
      echo "Available tests: ${!TESTS[@]}"
      exit 1
    fi

    run_test "$SCRIPT_DIR/tests/$SPECIFIC_TEST.test.js" "${TESTS[$SPECIFIC_TEST]}" 1 1
  else
    local test_count=${#TESTS[@]}
    local current=0

    for test_id in $(echo "${!TESTS[@]}" | tr ' ' '\n' | sort); do
      ((current++))
      run_test "$SCRIPT_DIR/tests/$test_id.test.js" "${TESTS[$test_id]}" $current $test_count
    done
  fi

  # Print final summary
  local total_duration=$(($(date +%s) - START_TIME))

  echo -e "${BOLD}"
  echo "═══════════════════════════════════════════════════════════════════"
  echo "Test Suite Summary"
  echo "═══════════════════════════════════════════════════════════════════"
  echo -e "${NC}"

  echo "Tests Passed: ${TESTS_PASSED}"
  echo "Tests Failed: ${TESTS_FAILED}"
  echo "Total Duration: ${total_duration}s"
  echo ""

  if [ ${TESTS_FAILED} -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✅ ALL TESTS PASSED${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Save success report
    cat > "$SCRIPT_DIR/results/full-report.json" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "status": "PASSED",
  "testsPassed": $TESTS_PASSED,
  "testsFailed": $TESTS_FAILED,
  "totalDuration": ${total_duration},
  "configuration": {
    "workers": $CFN_TEST_WORKERS,
    "tasks": $CFN_TEST_TASKS,
    "reviewers": $CFN_TEST_REVIEWERS
  }
}
EOF

    exit 0
  else
    echo -e "${RED}${BOLD}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Failed tests:"
    for test in "${FAILED_TESTS[@]}"; do
      echo "  - $test"
    done
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Save failure report
    cat > "$SCRIPT_DIR/results/full-report.json" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "status": "FAILED",
  "testsPassed": $TESTS_PASSED,
  "testsFailed": $TESTS_FAILED,
  "totalDuration": ${total_duration},
  "failedTests": [$(printf '"%s",' "${FAILED_TESTS[@]}" | sed 's/,$//')]
  "configuration": {
    "workers": $CFN_TEST_WORKERS,
    "tasks": $CFN_TEST_TASKS,
    "reviewers": $CFN_TEST_REVIEWERS
  }
}
EOF

    exit 1
  fi
}

# Run main function
main "$@"
