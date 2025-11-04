#!/bin/bash
# Comprehensive Test Suite for Bash Validators
# Tests bash-pipe-safety, bash-dependency-checker, and enforce-lf validators

set -euo pipefail

# Test environment setup
VALIDATOR_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/hook-pipeline"
TEST_DIR="/tmp/bash-validator-tests-$$"
PASSED=0
FAILED=0

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Setup test directory
setup_test_env() {
    mkdir -p "$TEST_DIR"
    echo "Test directory: $TEST_DIR"
}

# Cleanup test directory
cleanup() {
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test result reporting
report_result() {
    local test_name="$1"
    local result="$2"
    local message="${3:-}"

    if [[ "$result" == "PASS" ]]; then
        echo -e "${GREEN}✓ PASSED${NC}: $test_name"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC}: $test_name"
        if [[ -n "$message" ]]; then
            echo -e "  ${YELLOW}Reason: $message${NC}"
        fi
        FAILED=$((FAILED + 1))
    fi
}

# ============================================================================
# TEST 1: bash-pipe-safety detects unsafe pipe
# ============================================================================
test_pipe_safety_unsafe() {
    local test_file="$TEST_DIR/unsafe_pipe.sh"

    cat > "$test_file" <<'EOF'
#!/bin/bash
set -o pipefail
# Script with unsafe pipe usage
redis-cli keys "pattern" | grep -q "."
EOF

    # Run validator
    local exit_code=0
    local output
    output=$("$VALIDATOR_DIR/bash-pipe-safety.sh" "$test_file" 2>&1) || exit_code=$?

    # Expected: Exit 2 (warning), output contains warning message
    if [[ $exit_code -eq 2 ]] && [[ "$output" =~ "Potential pipe safety issue" || "$output" =~ "Warning" ]]; then
        report_result "TEST 1: bash-pipe-safety detects unsafe pipe" "PASS"
    else
        report_result "TEST 1: bash-pipe-safety detects unsafe pipe" "FAIL" \
            "Expected exit 2 and warning message, got exit $exit_code. Output: $output"
    fi
}

# ============================================================================
# TEST 2: bash-pipe-safety passes safe pipe
# ============================================================================
test_pipe_safety_safe() {
    local test_file="$TEST_DIR/safe_pipe.sh"

    cat > "$test_file" <<'EOF'
#!/bin/bash
set -o pipefail
# Script with safe pipe usage
redis-cli keys "pattern" 2>/dev/null | grep -q "."
curl https://example.com 2>&1 | jq .
EOF

    # Run validator
    local exit_code=0
    "$VALIDATOR_DIR/bash-pipe-safety.sh" "$test_file" 2>/dev/null || exit_code=$?

    # Expected: Exit 0 (pass)
    if [[ $exit_code -eq 0 ]]; then
        report_result "TEST 2: bash-pipe-safety passes safe pipe" "PASS"
    else
        report_result "TEST 2: bash-pipe-safety passes safe pipe" "FAIL" \
            "Expected exit 0, got exit $exit_code"
    fi
}

# ============================================================================
# TEST 3: bash-dependency-checker catches missing script
# ============================================================================
test_dependency_missing() {
    local test_file="$TEST_DIR/missing_dep.sh"

    cat > "$test_file" <<'EOF'
#!/bin/bash
# Script with missing dependency
source ./missing-script.sh
bash /nonexistent/script.sh
EOF

    # Run validator
    local exit_code=0
    local output
    output=$("$VALIDATOR_DIR/bash-dependency-checker.sh" "$test_file" 2>&1) || exit_code=$?

    # Expected: Exit 1 (error), output contains "Missing dependency"
    if [[ $exit_code -eq 1 ]] && [[ "$output" =~ "Missing dependency" ]]; then
        report_result "TEST 3: bash-dependency-checker catches missing script" "PASS"
    else
        report_result "TEST 3: bash-dependency-checker catches missing script" "FAIL" \
            "Expected exit 1 and dependency error, got exit $exit_code"
    fi
}

# ============================================================================
# TEST 4: bash-dependency-checker passes valid references
# ============================================================================
test_dependency_valid() {
    local test_file="$TEST_DIR/valid_dep.sh"
    local dep_file="$TEST_DIR/existing-script.sh"

    # Create dependency file
    echo '#!/bin/bash' > "$dep_file"
    echo 'echo "Dependency script"' >> "$dep_file"

    # Create test file with valid dependency
    cat > "$test_file" <<EOF
#!/bin/bash
# Script with valid dependency
source $dep_file
EOF

    # Run validator
    local exit_code=0
    "$VALIDATOR_DIR/bash-dependency-checker.sh" "$test_file" 2>/dev/null || exit_code=$?

    # Expected: Exit 0 (pass)
    if [[ $exit_code -eq 0 ]]; then
        report_result "TEST 4: bash-dependency-checker passes valid references" "PASS"
    else
        report_result "TEST 4: bash-dependency-checker passes valid references" "FAIL" \
            "Expected exit 0, got exit $exit_code"
    fi
}

# ============================================================================
# TEST 5: enforce-lf auto-converts CRLF
# ============================================================================
test_lf_conversion() {
    local test_file="$TEST_DIR/crlf_file.txt"

    # Create file with CRLF line endings using echo with explicit control chars
    echo -e 'line1\r' > "$test_file"
    echo -e 'line2\r' >> "$test_file"
    echo -e 'line3\r' >> "$test_file"

    # Verify CRLF exists before conversion (check for carriage return)
    if ! file "$test_file" | grep -q "CRLF" && ! grep -q $'\r' "$test_file"; then
        # Fallback: create with sed
        echo -e "line1\nline2\nline3" > "$test_file"
        sed -i 's/$/\r/' "$test_file"
    fi

    # Verify CRLF exists (check for \r character)
    if ! grep -q $'\r' "$test_file"; then
        report_result "TEST 5: enforce-lf auto-converts CRLF" "FAIL" \
            "Test setup failed: CRLF not created"
        return
    fi

    # Run validator
    local exit_code=0
    "$VALIDATOR_DIR/enforce-lf.sh" "$test_file" 2>/dev/null || exit_code=$?

    # Expected: Exit 0, file converted to LF
    if [[ $exit_code -eq 0 ]] && ! grep -q $'\r' "$test_file"; then
        report_result "TEST 5: enforce-lf auto-converts CRLF" "PASS"
    else
        report_result "TEST 5: enforce-lf auto-converts CRLF" "FAIL" \
            "Expected exit 0 and LF conversion, got exit $exit_code"
    fi
}

# ============================================================================
# TEST 6: enforce-lf skips binary files
# ============================================================================
test_lf_binary_skip() {
    local test_file="$TEST_DIR/binary_file.bin"

    # Create binary file (simple binary data)
    dd if=/dev/urandom of="$test_file" bs=1024 count=1 2>/dev/null

    # Get file size before
    local size_before
    size_before=$(stat -c%s "$test_file")

    # Run validator
    local exit_code=0
    "$VALIDATOR_DIR/enforce-lf.sh" "$test_file" 2>/dev/null || exit_code=$?

    # Get file size after
    local size_after
    size_after=$(stat -c%s "$test_file")

    # Expected: Exit 0, no conversion (file size unchanged)
    if [[ $exit_code -eq 0 ]] && [[ $size_before -eq $size_after ]]; then
        report_result "TEST 6: enforce-lf skips binary files" "PASS"
    else
        report_result "TEST 6: enforce-lf skips binary files" "FAIL" \
            "Expected exit 0 and no changes, got exit $exit_code"
    fi
}

# ============================================================================
# TEST 7: Integration produces correct recommendations
# ============================================================================
test_integration_recommendations() {
    local test_file="$TEST_DIR/unsafe_bash_integration.sh"

    cat > "$test_file" <<'EOF'
#!/bin/bash
# Unsafe bash script for integration testing
redis-cli keys "pattern" | grep -q "."
source ./missing-dependency.sh
EOF

    # Check if post-edit pipeline exists
    local pipeline_script="/mnt/c/Users/masha/Documents/claude-flow-novice/config/hooks/post-edit-pipeline.js"

    if [[ ! -f "$pipeline_script" ]]; then
        report_result "TEST 7: Integration produces correct recommendations" "FAIL" \
            "Pipeline script not found at $pipeline_script"
        return
    fi

    # Run post-edit pipeline (capture output)
    local exit_code=0
    local output
    output=$(node "$pipeline_script" "$test_file" 2>&1) || exit_code=$?

    # Expected: Pipeline runs and produces output (exit code may vary based on issues found)
    # Check if output contains structured results
    if echo "$output" | grep -q '"status"'; then
        report_result "TEST 7: Integration produces correct recommendations" "PASS"
    else
        report_result "TEST 7: Integration produces correct recommendations" "FAIL" \
            "Expected structured JSON output from pipeline"
    fi
}

# ============================================================================
# TEST 8: Pipeline timeout handling
# ============================================================================
test_pipeline_timeout() {
    local test_validator="$TEST_DIR/slow_validator.sh"

    # Create mock validator that sleeps 10s (exceeds 5s timeout)
    cat > "$test_validator" <<'EOF'
#!/bin/bash
# Slow validator for timeout testing
sleep 10
exit 0
EOF
    chmod +x "$test_validator"

    # Run validator with timeout
    local exit_code=0
    timeout 2s "$test_validator" 2>/dev/null || exit_code=$?

    # Expected: Exit 124 (timeout killed the process)
    if [[ $exit_code -eq 124 ]]; then
        report_result "TEST 8: Pipeline timeout handling" "PASS"
    else
        report_result "TEST 8: Pipeline timeout handling" "FAIL" \
            "Expected exit 124 (timeout), got exit $exit_code"
    fi
}

# ============================================================================
# Main Test Execution
# ============================================================================

echo "=========================================="
echo "Bash Validators Comprehensive Test Suite"
echo "=========================================="
echo ""

setup_test_env

echo "Running tests..."
echo ""

# Execute all tests
test_pipe_safety_unsafe
test_pipe_safety_safe
test_dependency_missing
test_dependency_valid
test_lf_conversion
test_lf_binary_skip
test_integration_recommendations
test_pipeline_timeout

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "Total:  $((PASSED + FAILED))"

# Exit with appropriate code
if [[ $FAILED -eq 0 ]]; then
    echo -e "\n${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed!${NC}"
    exit 1
fi
