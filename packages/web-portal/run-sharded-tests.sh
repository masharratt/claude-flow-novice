#!/bin/bash
set -e

echo "=== Running Sharded Test Suite ==="
echo ""

# Track results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
START_TIME=$(date +%s)

# Test group function
run_test_group() {
  local group_name=$1
  local npm_command=$2
  
  echo "[$group_name] Starting..."
  if timeout 120 npm run "$npm_command" > "/tmp/test-${group_name}.log" 2>&1; then
    local count=$(grep "Test Files" "/tmp/test-${group_name}.log" | tail -1 | grep -oP '\d+ passed' | grep -oP '\d+' || echo "0")
    PASSED_TESTS=$((PASSED_TESTS + count))
    echo "[$group_name] ✅ PASSED ($count tests)"
  else
    echo "[$group_name] ❌ FAILED or TIMEOUT"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# Run all test groups
run_test_group "Stores" "test:stores"
run_test_group "Services" "test:services" || true
run_test_group "Hooks" "test:hooks" || true  
run_test_group "Components" "test:components" || true
run_test_group "Server" "test:server" || true
run_test_group "Performance" "test:performance" || true
run_test_group "A11y" "test:a11y" || true
run_test_group "Minimal" "test:minimal" || true

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "=== Test Suite Summary ==="
echo "Total Passed: $PASSED_TESTS tests"
echo "Failed Groups: $FAILED_TESTS"
echo "Duration: ${DURATION}s"
echo ""

# Generate summary JSON
cat > test-sharded-summary.json << SUMMARY
{
  "timestamp": "$(date -Iseconds)",
  "totalPassed": $PASSED_TESTS,
  "failedGroups": $FAILED_TESTS,
  "durationSeconds": $DURATION,
  "status": "$([ $FAILED_TESTS -eq 0 ] && echo 'PASS' || echo 'PARTIAL')"
}
SUMMARY

cat test-sharded-summary.json
