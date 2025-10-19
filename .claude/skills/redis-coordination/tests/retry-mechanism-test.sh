#!/bin/bash
# Retry Mechanism Test Suite
# Validates retry logic, backoff, and timeout behavior

set -euo pipefail

# Source common test utilities
source "$(dirname "$0")/test-utils.sh"

# Test retry mechanism with different retry counts
test_retry_mechanism() {
    local retry_counts=(0 1 3 5)
    local base_backoff=2  # Base backoff in seconds

    for retries in "${retry_counts[@]}"; do
        echo "Testing retry mechanism with $retries retries"

        # Simulated failure function
        mock_failed_operation() {
            local attempt=1
            local max_attempts=$((retries + 1))

            while [ $attempt -le $max_attempts ]; do
                if [ $attempt -eq $max_attempts ]; then
                    echo "Final attempt failed"
                    return 1
                fi

                # Simulate failure
                echo "Attempt $attempt failed, will retry"
                sleep $((base_backoff ** attempt))
                ((attempt++))
            done
        }

        # Capture timing and retry logs
        local start_time=$(date +%s)
        local log_file="/tmp/retry-test-$retries.log"

        if ! mock_failed_operation 2>"$log_file"; then
            local end_time=$(date +%s)
            local total_time=$((end_time - start_time))

            # Validate retry count and timing
            local actual_retries=$(($(grep -c "Attempt" "$log_file") - 1))
            assert_equal "$actual_retries" "$retries" "Retry count mismatch for $retries retries"

            # Validate exponential backoff (roughly)
            local expected_max_wait=$((base_backoff ** (retries + 1)))
            assert "[ $total_time -le $((expected_max_wait + 5)) ]" "Backoff timing incorrect"
        else
            fail "Operation should have failed after $retries retries"
        fi

        # Clean up log
        rm "$log_file"
    done
}

# Test timeout behavior
test_timeout_behavior() {
    local timeout_duration=10  # 10 seconds
    local long_running_operation() {
        sleep 15  # Longer than timeout
    }

    local start_time=$(date +%s)
    timeout $timeout_duration long_running_operation || true
    local end_time=$(date +%s)

    local total_time=$((end_time - start_time))
    assert "[ $total_time -ge $timeout_duration ] && [ $total_time -le $((timeout_duration + 2)) ]" "Timeout not enforced correctly"
}

# Run tests
main() {
    test_retry_mechanism
    test_timeout_behavior
    echo "Retry Mechanism Tests: PASSED"
}

main