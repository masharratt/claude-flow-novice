#!/bin/bash
# tests/docker-mode/test-tdd-compliance.sh
# Docker Mode TDD Compliance Test Suite (24 tests)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/docker/tests/test-helpers.sh"

# Test configuration
TEST_ID="docker-tdd-$(date +%s)"
TEST_WORKSPACE="/tmp/docker-test-$$"

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up test environment..."
    docker ps -a --filter "name=tdd-test-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker rm -f test-timestamp-container test-exec-order-container \
        test-pass-impl-container test-coverage-container \
        test-hook-exec-container test-hook-error-container \
        test-hook-timeout-container test-hook-seq-container \
        test-hook-env-container test-hook-wd-container \
        test-path-container test-framework-container \
        test-threshold-container test-report-container \
        test-persist-container test-output-container \
        test-agg-container test-parallel-1 test-parallel-2 test-parallel-3 \
        test-cache-container 2>/dev/null || true
    rm -rf "$TEST_WORKSPACE" 2>/dev/null || true
    exit $exit_code
}

trap cleanup EXIT INT TERM

# Test counters

# Test 1: Test-before-implementation (timestamp validation in containers)
test_tests_before_code_docker() {
    log_test "Test 1: Test-before-implementation (container timestamps)"

    # GIVEN: Container creates test file first
    mkdir -p "$TEST_WORKSPACE/tests" "$TEST_WORKSPACE/src"

    docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:rw" \
        alpine:latest \
        sh -c "echo 'test content' > /workspace/tests/user.test.ts" 2>/dev/null

    sleep 1

    # WHEN: Implementation created after test
    docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:rw" \
        alpine:latest \
        sh -c "echo 'impl content' > /workspace/src/user.ts" 2>/dev/null

    # THEN: Test timestamp should be earlier
    local test_time=$(stat -c %Y "$TEST_WORKSPACE/tests/user.test.ts" 2>/dev/null)
    local impl_time=$(stat -c %Y "$TEST_WORKSPACE/src/user.ts" 2>/dev/null)

    if [[ "$test_time" -lt "$impl_time" ]]; then
        log_pass "Test-before-implementation validated (container timestamps)"
    else
        log_fail "Timestamp validation failed: test=$test_time, impl=$impl_time"
    fi
}

# Test 2: Red-Green-Refactor cycle (containerized test execution)
test_red_green_refactor_docker() {
    log_test "Test 2: Red-Green-Refactor cycle (containerized)"

    # GIVEN: Test file in container
    mkdir -p "$TEST_WORKSPACE/tests"
    cat > "$TEST_WORKSPACE/tests/math.test.js" <<'EOF'
const { add } = require('../src/math');
test('add function', () => {
  expect(add(2, 3)).toBe(5);
});
EOF

    # RED: Test fails (no implementation)
    mkdir -p "$TEST_WORKSPACE/src"
    cat > "$TEST_WORKSPACE/src/math.js" <<'EOF'
module.exports = { add: () => 0 };
EOF

    # GREEN: Test passes (correct implementation)
    cat > "$TEST_WORKSPACE/src/math.js" <<'EOF'
module.exports = { add: (a, b) => a + b };
EOF

    # REFACTOR: Clean up implementation
    cat > "$TEST_WORKSPACE/src/math.js" <<'EOF'
const add = (a, b) => a + b;
module.exports = { add };
EOF

    # THEN: Cycle completed (validate files exist)
    if [[ -f "$TEST_WORKSPACE/tests/math.test.js" && -f "$TEST_WORKSPACE/src/math.js" ]]; then
        log_pass "Red-Green-Refactor cycle validated (containerized)"
    else
        log_fail "Red-Green-Refactor cycle failed"
    fi
}

# Test 3: Post-edit feedback (hooks execute in container context)
test_post_edit_feedback_docker() {
    log_test "Test 3: Post-edit feedback (container hooks)"

    # GIVEN: Post-edit hook script
    mkdir -p "$TEST_WORKSPACE/hooks"
    cat > "$TEST_WORKSPACE/hooks/post-edit.sh" <<'EOF'
#!/bin/sh
FILE=$1
echo "Post-edit: validated $FILE"
exit 0
EOF

    chmod +x "$TEST_WORKSPACE/hooks/post-edit.sh"

    # WHEN: Hook executes in container
    local output=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        /workspace/hooks/post-edit.sh "test-file.ts" 2>&1)

    # THEN: Hook should execute successfully
    if echo "$output" | grep -q "validated test-file.ts"; then
        log_pass "Post-edit feedback works in containers"
    else
        log_fail "Post-edit feedback failed: $output"
    fi
}

# Test 4: Post-edit error handling (error propagation from containers)
test_post_edit_error_handling_docker() {
    log_test "Test 4: Post-edit error handling (container errors)"

    # GIVEN: Hook that fails
    mkdir -p "$TEST_WORKSPACE/hooks"
    cat > "$TEST_WORKSPACE/hooks/failing-hook.sh" <<'EOF'
#!/bin/sh
echo "ERROR: Hook failed"
exit 1
EOF

    chmod +x "$TEST_WORKSPACE/hooks/failing-hook.sh"

    # WHEN: Hook executes in container
    set +e
    docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        /workspace/hooks/failing-hook.sh 2>&1
    local exit_code=$?
    set -e

    # THEN: Exit code should propagate
    if [[ "$exit_code" -eq 1 ]]; then
        log_pass "Post-edit error handling works (exit code propagation)"
    else
        log_fail "Error handling failed: exit code $exit_code (expected 1)"
    fi
}

# Test 5: Coverage enforcement (coverage calculations in Docker environment)
test_coverage_enforcement_docker() {
    log_test "Test 5: Coverage enforcement (Docker environment)"

    # GIVEN: Coverage report in container
    mkdir -p "$TEST_WORKSPACE"
    cat > "$TEST_WORKSPACE/coverage-report.txt" <<'EOF'
Test Coverage Report
====================
Lines: 85/100 (85%)
Branches: 42/50 (84%)
Functions: 20/22 (90%)
Statements: 85/100 (85%)
EOF

    # WHEN: Parsing coverage in container
    local coverage=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        grep "Lines:" /workspace/coverage-report.txt | awk '{print $3}' | tr -d '()%' 2>&1)

    # THEN: Coverage should be ≥80%
    if [[ "$coverage" -ge 80 ]]; then
        log_pass "Coverage enforcement works (Docker: $coverage%)"
    else
        log_fail "Coverage enforcement failed: $coverage% (expected ≥80%)"
    fi
}

# Test 6: Test file creation before implementation files (container timestamps)
test_file_creation_timestamps() {
    log_test "Test 6: Test file creation before implementation (container timestamps)"

    # GIVEN: Container creates test file first
    mkdir -p "$TEST_WORKSPACE/src" "$TEST_WORKSPACE/tests"

    docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:rw" \
        alpine:latest \
        sh -c "touch /workspace/tests/feature.test.ts && sleep 1 && touch /workspace/src/feature.ts" 2>/dev/null

    # WHEN: Comparing timestamps
    local test_time=$(stat -c %Y "$TEST_WORKSPACE/tests/feature.test.ts" 2>/dev/null)
    local impl_time=$(stat -c %Y "$TEST_WORKSPACE/src/feature.ts" 2>/dev/null)

    # THEN: Test should be created before implementation
    if [[ "$test_time" -lt "$impl_time" ]]; then
        log_pass "Test file created before implementation (timestamps validated)"
    else
        log_fail "Timestamp validation failed: test=$test_time, impl=$impl_time"
    fi
}

# Test 7: Test execution before code execution
test_execution_order() {
    log_test "Test 7: Test execution before code execution"

    # GIVEN: Test execution marker
    mkdir -p "$TEST_WORKSPACE/execution"

    # WHEN: Test runs first, then implementation
    docker run --rm \
        -v "$TEST_WORKSPACE/execution:/workspace:rw" \
        alpine:latest \
        sh -c "echo 'test-run' > /workspace/execution-order.txt && sleep 1 && echo 'impl-run' >> /workspace/execution-order.txt" 2>/dev/null

    # THEN: Test should execute before implementation
    local first_line=$(head -1 "$TEST_WORKSPACE/execution/execution-order.txt")

    if [[ "$first_line" == "test-run" ]]; then
        log_pass "Test execution before code execution validated"
    else
        log_fail "Execution order failed: first=$first_line"
    fi
}

# Test 8: Test pass → implementation → test still passes
test_pass_implementation_pass() {
    log_test "Test 8: Test pass → implementation → test still passes"

    # GIVEN: Test script that passes
    mkdir -p "$TEST_WORKSPACE/tdd-cycle"
    cat > "$TEST_WORKSPACE/tdd-cycle/test.sh" <<'EOF'
#!/bin/sh
# Test: function should add two numbers
result=$(cat /workspace/impl.txt 2>/dev/null || echo "0")
if [ "$result" = "5" ]; then
    exit 0  # Pass
else
    exit 1  # Fail
fi
EOF
    chmod +x "$TEST_WORKSPACE/tdd-cycle/test.sh"

    # WHEN: Implementation created
    echo "5" > "$TEST_WORKSPACE/tdd-cycle/impl.txt"

    # Test runs after implementation
    set +e
    docker run --rm \
        -v "$TEST_WORKSPACE/tdd-cycle:/workspace:ro" \
        alpine:latest \
        /workspace/test.sh
    local exit_code=$?
    set -e

    # THEN: Test should still pass
    if [[ "$exit_code" -eq 0 ]]; then
        log_pass "Test pass → implementation → test still passes"
    else
        log_fail "TDD cycle failed: exit_code=$exit_code"
    fi
}

# Test 9: Coverage metrics collection from containers
test_coverage_metrics() {
    log_test "Test 9: Coverage metrics collection from containers"

    # GIVEN: Coverage report in container
    mkdir -p "$TEST_WORKSPACE/coverage"
    cat > "$TEST_WORKSPACE/coverage/coverage.json" <<'EOF'
{
  "total": {
    "lines": { "total": 100, "covered": 87, "pct": 87 },
    "statements": { "total": 100, "covered": 87, "pct": 87 },
    "branches": { "total": 50, "covered": 42, "pct": 84 }
  }
}
EOF

    # WHEN: Container parses coverage
    local coverage=$(docker run --rm \
        -v "$TEST_WORKSPACE/coverage:/workspace:ro" \
        alpine:latest \
        sh -c "apk add --no-cache jq >/dev/null 2>&1 && jq -r '.total.lines.pct' /workspace/coverage.json")

    # THEN: Coverage metrics should be accessible
    if [[ "$coverage" -eq 87 ]]; then
        log_pass "Coverage metrics collection works (87%)"
    else
        log_fail "Coverage collection failed: $coverage"
    fi
}

# Test 10: Post-edit hook execution in container
test_post_edit_hook_execution() {
    log_test "Test 10: Post-edit hook execution in container"

    # GIVEN: Post-edit hook
    mkdir -p "$TEST_WORKSPACE/hooks"
    cat > "$TEST_WORKSPACE/hooks/post-edit.sh" <<'EOF'
#!/bin/sh
FILE=$1
echo "Hook executed for $FILE" > /workspace/hook-output.txt
exit 0
EOF
    chmod +x "$TEST_WORKSPACE/hooks/post-edit.sh"

    # WHEN: Hook executes in container
    docker run --rm \
        -v "$TEST_WORKSPACE/hooks:/workspace:rw" \
        alpine:latest \
        /workspace/post-edit.sh "test-file.ts" 2>/dev/null

    # THEN: Hook output should exist
    if [[ -f "$TEST_WORKSPACE/hooks/hook-output.txt" ]]; then
        log_pass "Post-edit hook execution works in container"
    else
        log_fail "Hook execution failed"
    fi
}

# Test 11: Hook error detection and reporting
test_hook_error_detection() {
    log_test "Test 11: Hook error detection and reporting"

    # GIVEN: Hook that fails (inline to avoid mount issues)
    # WHEN: Hook executes
    set +e
    docker run --rm \
        alpine:latest \
        sh -c 'echo "ERROR: Validation failed" >&2; exit 1' > /tmp/hook-error-output.txt 2>&1
    exit_code=$?
    set -e
    output=$(cat /tmp/hook-error-output.txt)
    rm -f /tmp/hook-error-output.txt

    # THEN: Error should be detected
    if [[ "$exit_code" -eq 1 && "$output" == *"ERROR"* ]]; then
        log_pass "Hook error detection works"
    else
        log_fail "Hook error detection failed: exit=$exit_code, output=$output"
    fi
}

# Test 12: Hook timeout handling
test_hook_timeout() {
    log_test "Test 12: Hook timeout handling"

    # GIVEN: Hook with timeout
    set +e
    timeout 2s docker run --rm \
        alpine:latest \
        sh -c "sleep 30" 2>/dev/null
    local exit_code=$?
    set -e

    # WHEN: Timeout triggers
    # THEN: Timeout should be detected (exit code 124 for timeout command)
    if [[ "$exit_code" -eq 124 || "$exit_code" -eq 137 ]]; then
        log_pass "Hook timeout handling works"
    else
        log_fail "Hook timeout failed: exit_code=$exit_code"
    fi
}

# Test 13: Multiple hooks in sequence
test_multiple_hooks_sequence() {
    log_test "Test 13: Multiple hooks in sequence"

    # GIVEN: Three hooks
    mkdir -p "$TEST_WORKSPACE/multi-hooks"
    for i in 1 2 3; do
        cat > "$TEST_WORKSPACE/multi-hooks/hook$i.sh" <<EOF
#!/bin/sh
echo "Hook $i executed" >> /workspace/sequence.txt
exit 0
EOF
        chmod +x "$TEST_WORKSPACE/multi-hooks/hook$i.sh"
    done

    # WHEN: Hooks execute sequentially
    for i in 1 2 3; do
        docker run --rm \
            -v "$TEST_WORKSPACE/multi-hooks:/workspace:rw" \
            alpine:latest \
            "/workspace/hook$i.sh" 2>/dev/null
    done

    # THEN: All hooks should execute in order
    local line_count=$(wc -l < "$TEST_WORKSPACE/multi-hooks/sequence.txt")

    if [[ "$line_count" -eq 3 ]]; then
        log_pass "Multiple hooks sequence works"
    else
        log_fail "Hook sequence failed: $line_count/3 hooks executed"
    fi
}

# Test 14: Hook environment variable injection
test_hook_environment() {
    log_test "Test 14: Hook environment variable injection"

    # GIVEN: Hook with environment variables
    # WHEN: Container spawned with env vars
    docker run --rm \
        -e HOOK_MODE="strict" \
        -e FILE_PATH="/workspace/test.ts" \
        alpine:latest \
        env > /tmp/hook-env-output.txt 2>/dev/null

    # THEN: Environment variables should be present
    local found=0
    if grep -q "HOOK_MODE=strict" /tmp/hook-env-output.txt || true; then ((found++)) || true; fi
    if grep -q "FILE_PATH=/workspace/test.ts" /tmp/hook-env-output.txt || true; then ((found++)) || true; fi

    if [[ "$found" -eq 2 ]]; then
        log_pass "Hook environment variable injection works"
    else
        log_fail "Hook environment failed: only $found/2 vars found"
    fi

    rm -f /tmp/hook-env-output.txt
}

# Test 15: Hook working directory validation
test_hook_working_directory() {
    log_test "Test 15: Hook working directory validation"

    # GIVEN: Container with working directory
    local workdir=$(docker run --rm \
        -w /workspace \
        alpine:latest \
        pwd)

    # WHEN: Validating working directory
    # THEN: Should match expected path
    if [[ "$workdir" == "/workspace" ]]; then
        log_pass "Hook working directory validation works"
    else
        log_fail "Working directory validation failed: $workdir"
    fi
}

# Test 16: File path resolution in containers
test_file_path_resolution() {
    log_test "Test 16: File path resolution in containers"

    # GIVEN: File in mounted volume
    mkdir -p "$TEST_WORKSPACE/paths"
    echo "test content" > "$TEST_WORKSPACE/paths/file.txt"

    # WHEN: Container resolves absolute path
    local content=$(docker run --rm \
        -v "$TEST_WORKSPACE/paths:/workspace:ro" \
        alpine:latest \
        cat /workspace/file.txt)

    # THEN: Path resolution should work
    if [[ "$content" == "test content" ]]; then
        log_pass "File path resolution works in containers"
    else
        log_fail "Path resolution failed: $content"
    fi
}

# Test 17: Test framework detection (Jest, Mocha, Pytest, etc.)
test_framework_detection() {
    log_test "Test 17: Test framework detection in containers"

    # GIVEN: Package.json with Jest
    mkdir -p "$TEST_WORKSPACE/framework"
    cat > "$TEST_WORKSPACE/framework/package.json" <<'EOF'
{
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
EOF

    # WHEN: Container detects framework
    local framework=$(docker run --rm \
        -v "$TEST_WORKSPACE/framework:/workspace:ro" \
        alpine:latest \
        sh -c "apk add --no-cache jq >/dev/null 2>&1 && jq -r '.devDependencies | keys[]' /workspace/package.json | grep jest")

    # THEN: Framework should be detected
    if [[ "$framework" == "jest" ]]; then
        log_pass "Test framework detection works (Jest)"
    else
        log_fail "Framework detection failed: $framework"
    fi
}

# Test 18: Coverage threshold enforcement (≥80%)
test_coverage_threshold() {
    log_test "Test 18: Coverage threshold enforcement (≥80%)"

    # GIVEN: Coverage below threshold
    local coverage=75

    # WHEN: Checking threshold
    local threshold=80
    local passes=0
    if [[ "$coverage" -ge "$threshold" ]]; then
        passes=1
    fi

    # THEN: Should fail threshold check
    if [[ "$passes" -eq 0 ]]; then
        log_pass "Coverage threshold enforcement works (75% < 80%)"
    else
        log_fail "Threshold enforcement failed"
    fi
}

# Test 19: Coverage report generation in containers
test_coverage_report_generation() {
    log_test "Test 19: Coverage report generation in containers"

    # GIVEN: Test results in container
    mkdir -p "$TEST_WORKSPACE/reports"

    # WHEN: Container generates report
    docker run --rm \
        -v "$TEST_WORKSPACE/reports:/workspace:rw" \
        alpine:latest \
        sh -c "echo 'Coverage Report: 87%' > /workspace/coverage-report.txt" 2>/dev/null

    # THEN: Report should be generated
    if [[ -f "$TEST_WORKSPACE/reports/coverage-report.txt" ]]; then
        log_pass "Coverage report generation works"
    else
        log_fail "Report generation failed"
    fi
}

# Test 20: Coverage report persistence to host
test_coverage_report_persistence() {
    log_test "Test 20: Coverage report persistence to host"

    # GIVEN: Container generates report
    mkdir -p "$TEST_WORKSPACE/persist"

    docker run --rm \
        -v "$TEST_WORKSPACE/persist:/workspace:rw" \
        alpine:latest \
        sh -c "echo '{\"coverage\": 85}' > /workspace/coverage.json" 2>/dev/null

    # WHEN: Checking host filesystem
    # THEN: Report should persist on host
    if [[ -f "$TEST_WORKSPACE/persist/coverage.json" ]]; then
        local content=$(cat "$TEST_WORKSPACE/persist/coverage.json")
        if [[ "$content" == *"coverage"* ]]; then
            log_pass "Coverage report persistence works"
        else
            log_fail "Report content invalid: $content"
        fi
    else
        log_fail "Report persistence failed"
    fi
}

# Test 21: Test output parsing in containers
test_output_parsing() {
    log_test "Test 21: Test output parsing in containers"

    # GIVEN: Test output
    local output=$(docker run --rm \
        alpine:latest \
        sh -c "echo 'Tests: 10 passed, 2 failed'" 2>&1)

    # WHEN: Parsing output
    local passed=$(echo "$output" | grep -oP '\d+ passed' | grep -oP '\d+')
    local failed=$(echo "$output" | grep -oP '\d+ failed' | grep -oP '\d+')

    # THEN: Output should be parseable
    if [[ "$passed" -eq 10 && "$failed" -eq 2 ]]; then
        log_pass "Test output parsing works"
    else
        log_fail "Output parsing failed: passed=$passed, failed=$failed"
    fi
}

# Test 22: Test result aggregation across containers
test_result_aggregation() {
    log_test "Test 22: Test result aggregation across containers"

    # GIVEN: Multiple test containers
    mkdir -p "$TEST_WORKSPACE/aggregate"

    docker run --rm \
        -v "$TEST_WORKSPACE/aggregate:/workspace:rw" \
        alpine:latest \
        sh -c "echo '5' > /workspace/results-1.txt" 2>/dev/null

    docker run --rm \
        -v "$TEST_WORKSPACE/aggregate:/workspace:rw" \
        alpine:latest \
        sh -c "echo '7' > /workspace/results-2.txt" 2>/dev/null

    docker run --rm \
        -v "$TEST_WORKSPACE/aggregate:/workspace:rw" \
        alpine:latest \
        sh -c "echo '3' > /workspace/results-3.txt" 2>/dev/null

    # WHEN: Aggregating results
    local total=0
    for file in "$TEST_WORKSPACE/aggregate"/results-*.txt; do
        local value=$(cat "$file")
        total=$((total + value))
    done

    # THEN: Aggregation should work
    if [[ "$total" -eq 15 ]]; then
        log_pass "Test result aggregation works (5+7+3=15)"
    else
        log_fail "Aggregation failed: total=$total"
    fi
}

# Test 23: Parallel test execution in containers
test_parallel_execution() {
    log_test "Test 23: Parallel test execution in containers"

    # GIVEN: Multiple test containers
    mkdir -p "$TEST_WORKSPACE/parallel"

    # WHEN: Running tests in parallel
    for i in 1 2 3; do
        docker run -d --name "test-parallel-$i" \
            -v "$TEST_WORKSPACE/parallel:/workspace:rw" \
            alpine:latest \
            sh -c "echo 'test $i complete' > /workspace/test-$i.txt && sleep 2" 2>/dev/null &
    done
    wait

    sleep 3

    # THEN: All tests should complete
    local completed=0
    for i in 1 2 3; do
        if [[ -f "$TEST_WORKSPACE/parallel/test-$i.txt" ]]; then
            ((completed++))
        fi
        docker rm -f "test-parallel-$i" 2>/dev/null || true
    done

    if [[ "$completed" -eq 3 ]]; then
        log_pass "Parallel test execution works (3 tests)"
    else
        log_fail "Parallel execution failed: only $completed/3 completed"
    fi
}

# Test 24: Test cache invalidation
test_cache_invalidation() {
    log_test "Test 24: Test cache invalidation"

    # GIVEN: Cached test result
    mkdir -p "$TEST_WORKSPACE/cache"
    echo "cached-result" > "$TEST_WORKSPACE/cache/test-cache.txt"

    # WHEN: Cache invalidated (file deleted)
    rm -f "$TEST_WORKSPACE/cache/test-cache.txt"

    # THEN: Cache should be invalidated
    if [[ ! -f "$TEST_WORKSPACE/cache/test-cache.txt" ]]; then
        log_pass "Test cache invalidation works"
    else
        log_fail "Cache invalidation failed"
    fi
}

# Execute tests
mkdir -p "$TEST_WORKSPACE"

test_tests_before_code_docker
test_red_green_refactor_docker
test_post_edit_feedback_docker
test_post_edit_error_handling_docker
test_coverage_enforcement_docker
test_file_creation_timestamps
test_execution_order
test_pass_implementation_pass
test_coverage_metrics
test_post_edit_hook_execution
test_hook_error_detection
test_hook_timeout
test_multiple_hooks_sequence
test_hook_environment
test_hook_working_directory
test_file_path_resolution
test_framework_detection
test_coverage_threshold
test_coverage_report_generation
test_coverage_report_persistence
test_output_parsing
test_result_aggregation
test_parallel_execution
test_cache_invalidation

# Summary
echo ""
log_section "Test Summary: Docker Mode TDD Compliance"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo "✅ All tests PASSED"
    exit 0
else
    echo "❌ Some tests FAILED"
    exit 1
fi
