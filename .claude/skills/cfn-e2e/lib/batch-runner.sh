#!/usr/bin/env bash
#######################################################################
# CFN E2E Batch Runner Library
# Utilities for running batched E2E tests
#######################################################################

# Run a batch with retry support

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true
run_batch_with_retry() {
    local test_file="$1"
    local max_retries="${2:-2}"
    local workers="${3:-3}"
    local timeout="${4:-30000}"

    local attempt=1
    local result=1

    while [[ $attempt -le $max_retries ]]; do
        if [[ $attempt -gt 1 ]]; then
            echo "[RETRY] Attempt $attempt for $(basename "$test_file")"
        fi

        if npx playwright test "$test_file" \
            --workers="$workers" \
            --timeout="$timeout" \
            --reporter=list 2>&1; then
            result=0
            break
        fi

        ((attempt++))
        sleep 2
    done

    return $result
}

# Run tests matching a pattern
run_tests_by_pattern() {
    local pattern="$1"
    local workers="${2:-3}"
    local timeout="${3:-30000}"

    npx playwright test --grep "$pattern" \
        --workers="$workers" \
        --timeout="$timeout" \
        --reporter=list
}

# Run tests with specific tags
run_tagged_tests() {
    local tag="$1"
    local workers="${2:-3}"

    npx playwright test --grep "@$tag" \
        --workers="$workers" \
        --reporter=list
}

# Check system resources before running
check_system_resources() {
    local min_ram_mb="${1:-4096}"

    # Get available RAM in MB
    local available_ram
    available_ram=$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}' || echo "0")

    if [[ $available_ram -lt $min_ram_mb ]]; then
        echo "[WARN] Low memory: ${available_ram}MB available, ${min_ram_mb}MB recommended"
        return 1
    fi

    return 0
}

# Kill orphaned browser processes
cleanup_browsers() {
    pkill -f "chromium" 2>/dev/null || true
    pkill -f "chrome" 2>/dev/null || true
    pkill -f "firefox" 2>/dev/null || true
    pkill -f "webkit" 2>/dev/null || true
}

# Estimate batch duration based on test count
estimate_duration() {
    local test_count="$1"
    local workers="${2:-3}"

    # Rough estimate: 3 seconds per test, divided by workers
    local seconds=$((test_count * 3 / workers))
    echo "$seconds"
}

# Generate JUnit XML report from Playwright results
generate_junit_report() {
    local output_file="${1:-junit-results.xml}"

    npx playwright test --reporter=junit 2>/dev/null > "$output_file" || true
}

# Aggregate results from multiple batch logs
aggregate_results() {
    local log_dir="${1:-/tmp}"
    local pattern="${2:-cfn-e2e-batch-*.log}"

    local total_passed=0
    local total_failed=0
    local total_skipped=0

    for log_file in "$log_dir"/$pattern; do
        if [[ -f "$log_file" ]]; then
            # Extract counts from Playwright output
            local passed
            passed=$(grep -oP '\d+(?= passed)' "$log_file" 2>/dev/null | tail -1 || echo "0")
            local failed
            failed=$(grep -oP '\d+(?= failed)' "$log_file" 2>/dev/null | tail -1 || echo "0")
            local skipped
            skipped=$(grep -oP '\d+(?= skipped)' "$log_file" 2>/dev/null | tail -1 || echo "0")

            ((total_passed += passed))
            ((total_failed += failed))
            ((total_skipped += skipped))
        fi
    done

    cat <<EOF
{
  "passed": $total_passed,
  "failed": $total_failed,
  "skipped": $total_skipped,
  "total": $((total_passed + total_failed + total_skipped))
}
EOF
}
