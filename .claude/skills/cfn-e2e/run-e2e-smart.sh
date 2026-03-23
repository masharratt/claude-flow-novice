#!/usr/bin/env bash
set -euo pipefail

#######################################################################
# CFN E2E Smart Runner
# Executes E2E tests with intelligent batching for memory optimization
#######################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"

# Configuration with defaults
TEST_DIR="${TEST_DIR:-tests/e2e}"
PARALLELISM="${PARALLELISM:-3}"
BATCH_SIZE="${BATCH_SIZE:-all}"
WORKERS="${WORKERS:-3}"
HEAP_SIZE_MB="${HEAP_SIZE_MB:-6144}"
TIMEOUT_MS="${TIMEOUT_MS:-30000}"
RESULTS_FILE="/tmp/cfn-e2e-results-$(date +%s).json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }

# Try to source CFN utilities if available
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-utilities/execute.sh" ]]; then
    source "$PROJECT_ROOT/.claude/skills/cfn-utilities/execute.sh" 2>/dev/null || true
fi

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Smart parallel E2E test execution with automatic batching.

OPTIONS:
    -d, --test-dir DIR      Test directory (default: tests/e2e)
    -p, --parallelism N     Parallel batch count (default: 3)
    -b, --batch-size SIZE   fast|medium|large|all|smoke (default: all)
    -w, --workers N         Playwright workers per batch (default: 3)
    -h, --help              Show this help

ENVIRONMENT:
    TEST_DIR        Same as --test-dir
    PARALLELISM     Same as --parallelism
    BATCH_SIZE      Same as --batch-size
    WORKERS         Same as --workers
    HEAP_SIZE_MB    Node heap size (default: 6144)
    TIMEOUT_MS      Per-test timeout (default: 30000)

EXAMPLES:
    $(basename "$0")                          # Run all tests
    $(basename "$0") -b smoke                 # Run smoke tests only
    $(basename "$0") -p 2 -w 2               # Lower resource usage
    TEST_DIR=e2e $(basename "$0")            # Custom test directory
EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--test-dir) TEST_DIR="$2"; shift 2 ;;
        -p|--parallelism) PARALLELISM="$2"; shift 2 ;;
        -b|--batch-size) BATCH_SIZE="$2"; shift 2 ;;
        -w|--workers) WORKERS="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) log_error "Unknown option: $1"; exit 2 ;;
    esac
done

# Validate test directory
if [[ ! -d "$PROJECT_ROOT/$TEST_DIR" ]]; then
    log_error "Test directory not found: $PROJECT_ROOT/$TEST_DIR"
    exit 2
fi

# Check for Playwright
if ! command -v npx &>/dev/null; then
    log_error "npx not found. Install Node.js first."
    exit 2
fi

# Analyze batches
log_info "Analyzing test files in $TEST_DIR..."
source "$SCRIPT_DIR/analyze-batches.sh"
analyze_batches "$PROJECT_ROOT/$TEST_DIR"

# Get batch arrays from analysis
declare -a FAST_BATCHES=()
declare -a MEDIUM_BATCHES=()
declare -a LARGE_BATCHES=()

categorize_test_files "$PROJECT_ROOT/$TEST_DIR"

# Filter based on BATCH_SIZE
case "$BATCH_SIZE" in
    smoke)
        # Look for smoke test files
        mapfile -t FAST_BATCHES < <(find "$PROJECT_ROOT/$TEST_DIR" -name "*smoke*.spec.ts" -o -name "*smoke*.test.ts" 2>/dev/null)
        MEDIUM_BATCHES=()
        LARGE_BATCHES=()
        ;;
    fast)
        MEDIUM_BATCHES=()
        LARGE_BATCHES=()
        ;;
    medium)
        FAST_BATCHES=()
        LARGE_BATCHES=()
        ;;
    large)
        FAST_BATCHES=()
        MEDIUM_BATCHES=()
        ;;
    all)
        # Keep all batches as categorized
        ;;
    *)
        log_error "Invalid batch size: $BATCH_SIZE"
        exit 2
        ;;
esac

# Summary
total_fast=${#FAST_BATCHES[@]}
total_medium=${#MEDIUM_BATCHES[@]}
total_large=${#LARGE_BATCHES[@]}
total_tests=$((total_fast + total_medium + total_large))

log_info "Test Distribution:"
log_info "  Fast batches:   $total_fast files"
log_info "  Medium batches: $total_medium files"
log_info "  Large batches:  $total_large files"
log_info "  Total:          $total_tests files"

if [[ $total_tests -eq 0 ]]; then
    log_warn "No test files found matching criteria"
    exit 0
fi

# Set Node options
export NODE_OPTIONS="--max-old-space-size=$HEAP_SIZE_MB"

# Results tracking
declare -A BATCH_RESULTS=()
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
START_TIME=$(date +%s)

# Run a single test file
run_test_file() {
    local test_file="$1"
    local batch_id="$2"
    local log_file="/tmp/cfn-e2e-batch-${batch_id}.log"

    log_info "Running: $(basename "$test_file")"

    if npx playwright test "$test_file" \
        --workers="$WORKERS" \
        --timeout="$TIMEOUT_MS" \
        --reporter=list \
        > "$log_file" 2>&1; then
        log_success "$(basename "$test_file")"
        return 0
    else
        log_error "$(basename "$test_file") - see $log_file"
        return 1
    fi
}

# Run batches in parallel
run_parallel_batches() {
    local -n batch_array=$1
    local max_parallel=$2
    local batch_type=$3

    if [[ ${#batch_array[@]} -eq 0 ]]; then
        return 0
    fi

    log_info "Running $batch_type batches (parallelism: $max_parallel)..."

    local pids=()
    local running=0
    local failed=0

    for test_file in "${batch_array[@]}"; do
        # Wait if we've reached max parallelism
        while [[ $running -ge $max_parallel ]]; do
            for pid in "${pids[@]}"; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    wait "$pid" || ((failed++))
                    pids=("${pids[@]/$pid}")
                    ((running--))
                fi
            done
            sleep 0.5
        done

        # Start new batch
        batch_id="$(basename "$test_file" .spec.ts)"
        batch_id="${batch_id%.test.ts}"
        run_test_file "$test_file" "$batch_id" &
        pids+=($!)
        ((running++))
    done

    # Wait for remaining
    for pid in "${pids[@]}"; do
        wait "$pid" || ((failed++))
    done

    return $failed
}

# Run batches sequentially
run_sequential_batches() {
    local -n batch_array=$1
    local batch_type=$2

    if [[ ${#batch_array[@]} -eq 0 ]]; then
        return 0
    fi

    log_info "Running $batch_type batches sequentially..."

    local failed=0

    for test_file in "${batch_array[@]}"; do
        batch_id="$(basename "$test_file" .spec.ts)"
        batch_id="${batch_id%.test.ts}"
        run_test_file "$test_file" "$batch_id" || ((failed++))
    done

    return $failed
}

# Execute test plan
FAILURES=0

# Round 1: Fast batches in parallel
if [[ ${#FAST_BATCHES[@]} -gt 0 ]]; then
    log_info "=== Round 1: Fast Batches (parallel) ==="
    run_parallel_batches FAST_BATCHES "$PARALLELISM" "fast" || ((FAILURES+=$?))
fi

# Round 2: Medium batches with reduced parallelism
if [[ ${#MEDIUM_BATCHES[@]} -gt 0 ]]; then
    log_info "=== Round 2: Medium Batches (parallel) ==="
    medium_parallel=$((PARALLELISM > 2 ? PARALLELISM - 1 : PARALLELISM))
    run_parallel_batches MEDIUM_BATCHES "$medium_parallel" "medium" || ((FAILURES+=$?))
fi

# Round 3: Large batches sequentially
if [[ ${#LARGE_BATCHES[@]} -gt 0 ]]; then
    log_info "=== Round 3: Large Batches (sequential) ==="
    run_sequential_batches LARGE_BATCHES "large" || ((FAILURES+=$?))
fi

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# Generate results JSON
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "duration_seconds": $DURATION,
  "total_files": $total_tests,
  "fast_files": $total_fast,
  "medium_files": $total_medium,
  "large_files": $total_large,
  "failures": $FAILURES,
  "config": {
    "test_dir": "$TEST_DIR",
    "parallelism": $PARALLELISM,
    "batch_size": "$BATCH_SIZE",
    "workers": $WORKERS,
    "heap_size_mb": $HEAP_SIZE_MB,
    "timeout_ms": $TIMEOUT_MS
  }
}
EOF

# Summary
echo ""
log_info "=========================================="
log_info "E2E Test Summary"
log_info "=========================================="
log_info "Duration:     ${MINUTES}m ${SECONDS}s"
log_info "Test Files:   $total_tests"
log_info "Failures:     $FAILURES"
log_info "Results:      $RESULTS_FILE"

if [[ $FAILURES -gt 0 ]]; then
    log_error "E2E tests completed with $FAILURES failure(s)"
    exit 1
else
    log_success "All E2E tests passed!"
    exit 0
fi
