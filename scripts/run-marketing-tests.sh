#!/bin/bash
# Run Marketing Infrastructure Integration Tests

set -e

# Ensure the correct working directory
cd "$(dirname "$0")/.." || exit 1

# Run all marketing test scripts
echo "🚀 Starting Marketing Infrastructure Integration Tests..."

# Function to run test and capture exit code
run_test() {
    local test_script="$1"
    local start_time=$(date +%s)

    echo "Running $test_script..."

    if bash "$test_script"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo "✅ $test_script PASSED (${duration}s)"
    else
        echo "❌ $test_script FAILED"
        exit 1
    fi
}

# Array of test scripts
TEST_SCRIPTS=(
    "tests/marketing-email-campaigns-test.sh"
    "tests/marketing-social-publishing-test.sh"
    "tests/marketing-analytics-data-test.sh"
    "tests/marketing-crm-contacts-test.sh"
)

# Run each test script
for test in "${TEST_SCRIPTS[@]}"; do
    run_test "$test"
done

echo "🎉 All Marketing Infrastructure Integration Tests PASSED!"
exit 0