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
# RESULTS_FILE is overridable (tests pin a known path); default keeps prior behavior.
RESULTS_FILE="${RESULTS_FILE:-/tmp/cfn-e2e-results-$(date +%s).json}"

# Strict console-guard mode (flag --strict-console or env CFN_E2E_STRICT_CONSOLE=1)
STRICT_CONSOLE="${CFN_E2E_STRICT_CONSOLE:-0}"
CONSOLE_GUARD_STATUS=""
ARTIFACTS_JSON="[]"
FAILED_FILES_JSON="[]"

# Safe defaults so the results writer works even on an early (pre-run) exit.
total_tests=0
total_fast=0
total_medium=0
total_large=0
FAILURES=0
DURATION=0

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

# Turn newline-separated stdin into a JSON array of strings (no jq dependency).
to_json_array() {
    local out="[" first=1 line esc
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        esc="${line//\\/\\\\}"
        esc="${esc//\"/\\\"}"
        if [[ $first -eq 1 ]]; then first=0; else out+=","; fi
        out+="\"$esc\""
    done
    out+="]"
    printf '%s' "$out"
}

# console_guard detection: present (all specs import the fixture) | partial | absent.
detect_console_guard() {
    local specs=() total=0 present=0 f
    while IFS= read -r -d '' f; do
        specs+=("$f")
    done < <(find "$PROJECT_ROOT/$TEST_DIR" -type f \( -name '*.spec.ts' -o -name '*.test.ts' \) -print0 2>/dev/null)
    total=${#specs[@]}
    for f in "${specs[@]}"; do
        if grep -qE "console-guard" "$f" 2>/dev/null; then
            present=$((present + 1))
        fi
    done
    if [[ $total -eq 0 || $present -eq 0 ]]; then
        echo "absent"
    elif [[ $present -eq $total ]]; then
        echo "present"
    else
        echo "partial"
    fi
}

# Collect console-violation attachments + screenshots emitted under test-results/.
aggregate_console_artifacts() {
    local results_dir="$PROJECT_ROOT/test-results"
    ARTIFACTS_JSON="[]"
    FAILED_FILES_JSON="[]"
    [[ -d "$results_dir" ]] || return 0
    ARTIFACTS_JSON="$(find "$results_dir" -type f \( -iname '*console-violation*' -o -iname '*.png' \) 2>/dev/null | LC_ALL=C sort | to_json_array)"
    FAILED_FILES_JSON="$(find "$results_dir" -type f -iname '*console-violation*' -printf '%h\n' 2>/dev/null | LC_ALL=C sort -u | to_json_array)"
}

# Write the results JSON. Strict mode appends console_guard/artifacts/failed_files;
# non-strict output is byte-identical to the pre-strict-console layout.
write_results_json() {
    {
        printf '{\n'
        printf '  "timestamp": "%s",\n' "$(date -Iseconds)"
        printf '  "duration_seconds": %s,\n' "$DURATION"
        printf '  "total_files": %s,\n' "$total_tests"
        printf '  "fast_files": %s,\n' "$total_fast"
        printf '  "medium_files": %s,\n' "$total_medium"
        printf '  "large_files": %s,\n' "$total_large"
        printf '  "failures": %s,\n' "$FAILURES"
        printf '  "config": {\n'
        printf '    "test_dir": "%s",\n' "$TEST_DIR"
        printf '    "parallelism": %s,\n' "$PARALLELISM"
        printf '    "batch_size": "%s",\n' "$BATCH_SIZE"
        printf '    "workers": %s,\n' "$WORKERS"
        printf '    "heap_size_mb": %s,\n' "$HEAP_SIZE_MB"
        printf '    "timeout_ms": %s\n' "$TIMEOUT_MS"
        if [[ "$STRICT_CONSOLE" == "1" ]]; then
            printf '  },\n'
            printf '  "console_guard": "%s",\n' "$CONSOLE_GUARD_STATUS"
            printf '  "artifacts": %s,\n' "$ARTIFACTS_JSON"
            printf '  "failed_files": %s\n' "$FAILED_FILES_JSON"
        else
            printf '  }\n'
        fi
        printf '}\n'
    } > "$RESULTS_FILE"
}

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
    --strict-console        Require the console-guard fixture in specs (exit 1 if absent)
    -h, --help              Show this help

ENVIRONMENT:
    TEST_DIR                Same as --test-dir
    PARALLELISM             Same as --parallelism
    BATCH_SIZE              Same as --batch-size
    WORKERS                 Same as --workers
    HEAP_SIZE_MB            Node heap size (default: 6144)
    TIMEOUT_MS              Per-test timeout (default: 30000)
    CFN_E2E_STRICT_CONSOLE  Set to 1 for --strict-console
    RESULTS_FILE            Override results JSON path (default: /tmp/cfn-e2e-results-<ts>.json)

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
        --strict-console) STRICT_CONSOLE=1; shift ;;
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

# Strict console-guard wiring gate (runs before any browser work).
if [[ "$STRICT_CONSOLE" == "1" ]]; then
    CONSOLE_GUARD_STATUS="$(detect_console_guard)"
    log_info "Strict console mode: console_guard=$CONSOLE_GUARD_STATUS"
    if [[ "$CONSOLE_GUARD_STATUS" == "absent" ]]; then
        log_error "Strict console guard: no spec imports the console-guard fixture."
        aggregate_console_artifacts
        write_results_json
        log_error "Results: $RESULTS_FILE"
        exit 1
    fi
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
                    wait "$pid" || failed=$((failed + 1))
                    pids=("${pids[@]/$pid}")
                    running=$((running - 1))
                fi
            done
            sleep 0.5
        done

        # Start new batch
        batch_id="$(basename "$test_file" .spec.ts)"
        batch_id="${batch_id%.test.ts}"
        run_test_file "$test_file" "$batch_id" &
        pids+=($!)
        running=$((running + 1))
    done

    # Wait for remaining
    for pid in "${pids[@]}"; do
        wait "$pid" || failed=$((failed + 1))
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
        run_test_file "$test_file" "$batch_id" || failed=$((failed + 1))
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

# Generate results JSON (strict mode aggregates console-violation artifacts).
if [[ "$STRICT_CONSOLE" == "1" ]]; then
    aggregate_console_artifacts
fi
write_results_json

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
