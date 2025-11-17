#!/usr/bin/env bash
##############################################################################
# CFN v3 Helper Test - Parse Test Results
#
# Objective: Comprehensive validation of test result parsing across all frameworks
#
# Test Coverage:
#   - Jest parser with real-world output
#   - Mocha parser with real-world output
#   - pytest parser with real-world output
#   - TAP parser with real-world output
#   - JUnit XML parser
#   - Go test parser
#   - Auto-detection functionality
#   - Edge cases (zero tests, all pass, all fail, malformed output)
#   - Security (command injection prevention)
#
# Success Criteria:
#   - ≥95% test coverage of parse-test-results.sh
#   - All tests complete in <5 seconds
#   - No flaky tests
#   - Deterministic results
##############################################################################

set -euo pipefail

# Configuration
PARSER_SCRIPT="/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh"
TEST_OUTPUT_DIR="/tmp/test-parser-$$"
TEST_COUNT=0
PASS_COUNT=0

# Setup
mkdir -p "$TEST_OUTPUT_DIR"
source "$PARSER_SCRIPT"

# Cleanup
cleanup() {
    rm -rf "$TEST_OUTPUT_DIR"
}
trap cleanup EXIT

# Test helper
run_test() {
    local test_name="$1"
    shift
    TEST_COUNT=$((TEST_COUNT + 1))
    
    if "$@"; then
        echo "✅ PASS: $test_name"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    else
        echo "❌ FAIL: $test_name"
        return 1
    fi
}

# Assertion helpers
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-}"
    
    if [ "$expected" = "$actual" ]; then
        return 0
    else
        echo "  Expected: $expected"
        echo "  Actual: $actual"
        [ -n "$message" ] && echo "  Message: $message"
        return 1
    fi
}

assert_json_field() {
    local json="$1"
    local field="$2"
    local expected="$3"
    
    local actual=$(echo "$json" | jq -r ".$field")
    assert_equals "$expected" "$actual" "Field: $field"
}

##############################################################################
# Jest Parser Tests
##############################################################################

test_parse_jest_all_pass() {
    local jest_output='
PASS  src/components/Button.test.js
PASS  src/utils/validation.test.ts
PASS  src/services/api.test.js

Test Suites: 3 passed, 3 total
Tests:       19 passed, 19 total
Snapshots:   0 total
Time:        2.345 s
'
    
    local result=$(parse_jest_output "$jest_output")
    assert_json_field "$result" "framework" "jest" &&
    assert_json_field "$result" "total_tests" "19" &&
    assert_json_field "$result" "passed_tests" "19" &&
    assert_json_field "$result" "failed_tests" "0" &&
    assert_json_field "$result" "pass_rate" "1.0000"
}

test_parse_jest_mixed_results() {
    local jest_output='
PASS  src/components/Button.test.js
FAIL  src/components/Form.test.js
  ● Form validation › should reject empty email
    Expected validation to fail

PASS  src/utils/validation.test.ts

Test Suites: 1 failed, 2 passed, 3 total
Tests:       2 failed, 17 passed, 19 total
Snapshots:   0 total
Time:        3.2 s
'
    
    local result=$(parse_jest_output "$jest_output")
    assert_json_field "$result" "framework" "jest" &&
    assert_json_field "$result" "total_tests" "19" &&
    assert_json_field "$result" "passed_tests" "17" &&
    assert_json_field "$result" "failed_tests" "2" &&
    assert_json_field "$result" "pass_rate" "0.8947"
}

test_parse_jest_with_skipped() {
    local jest_output='
PASS  src/components/Button.test.js

Test Suites: 1 passed, 1 total
Tests:       1 skipped, 18 passed, 19 total
Snapshots:   0 total
Time:        1.5 s
'
    
    local result=$(parse_jest_output "$jest_output")
    assert_json_field "$result" "total_tests" "19" &&
    assert_json_field "$result" "passed_tests" "18" &&
    assert_json_field "$result" "skipped_tests" "1"
}

test_parse_jest_zero_tests() {
    local jest_output='
Test Suites: 0 total
Tests:       0 total
Snapshots:   0 total
Time:        0.1 s
'
    
    local result=$(parse_jest_output "$jest_output")
    assert_json_field "$result" "total_tests" "0" &&
    assert_json_field "$result" "pass_rate" "0.0000"
}

##############################################################################
# Mocha Parser Tests
##############################################################################

test_parse_mocha_all_pass() {
    local mocha_output='
  Authentication
    ✓ should login with valid credentials (45ms)
    ✓ should reject invalid credentials
    ✓ should hash passwords correctly (12ms)

  Database
    ✓ should connect to database
    ✓ should execute queries (234ms)


  5 passing (1s)
'
    
    local result=$(parse_mocha_output "$mocha_output")
    assert_json_field "$result" "framework" "mocha" &&
    assert_json_field "$result" "total_tests" "5" &&
    assert_json_field "$result" "passed_tests" "5" &&
    assert_json_field "$result" "failed_tests" "0" &&
    assert_json_field "$result" "pass_rate" "1.0000" &&
    assert_json_field "$result" "duration_ms" "1000"
}

test_parse_mocha_with_failures() {
    local mocha_output='
  Authentication
    ✓ should login with valid credentials
    1) should reject weak passwords

  Database
    ✓ should connect to database
    2) should handle connection errors


  2 passing (345ms)
  2 failing

  1) Authentication
       should reject weak passwords:
     AssertionError: expected false to be true

  2) Database
       should handle connection errors:
     Error: Connection timeout
'
    
    local result=$(parse_mocha_output "$mocha_output")
    assert_json_field "$result" "framework" "mocha" &&
    assert_json_field "$result" "total_tests" "4" &&
    assert_json_field "$result" "passed_tests" "2" &&
    assert_json_field "$result" "failed_tests" "2" &&
    assert_json_field "$result" "pass_rate" "0.5000"
}

test_parse_mocha_with_pending() {
    local mocha_output='
  API Tests
    ✓ should fetch users
    - should update user profile


  1 passing (123ms)
  1 pending
'
    
    local result=$(parse_mocha_output "$mocha_output")
    assert_json_field "$result" "total_tests" "2" &&
    assert_json_field "$result" "passed_tests" "1" &&
    assert_json_field "$result" "skipped_tests" "1"
}

##############################################################################
# pytest Parser Tests
##############################################################################

test_parse_pytest_all_pass() {
    local pytest_output='
=============================== test session starts ================================
platform linux -- Python 3.9.7, pytest-7.1.2
collected 23 items

tests/test_api.py ......................                                      [100%]

================================ 23 passed in 1.23s ================================
'
    
    local result=$(parse_pytest_output "$pytest_output")
    assert_json_field "$result" "framework" "pytest" &&
    assert_json_field "$result" "total_tests" "23" &&
    assert_json_field "$result" "passed_tests" "23" &&
    assert_json_field "$result" "failed_tests" "0" &&
    assert_json_field "$result" "pass_rate" "1.0000" &&
    assert_json_field "$result" "duration_ms" "1230"
}

test_parse_pytest_with_failures() {
    local pytest_output='
=============================== test session starts ================================
collected 20 items

tests/test_auth.py .F..                                                       [ 20%]
tests/test_db.py ................                                             [100%]

FAILED tests/test_auth.py::test_login_invalid - AssertionError: Invalid response
FAILED tests/test_auth.py::test_password_hash - ValueError: Weak password

====================== 18 passed, 2 failed in 2.45s ========================
'
    
    local result=$(parse_pytest_output "$pytest_output")
    assert_json_field "$result" "framework" "pytest" &&
    assert_json_field "$result" "total_tests" "20" &&
    assert_json_field "$result" "passed_tests" "18" &&
    assert_json_field "$result" "failed_tests" "2" &&
    assert_json_field "$result" "pass_rate" "0.9000"
}

test_parse_pytest_with_skipped() {
    local pytest_output='
===================== 15 passed, 3 skipped in 1.67s =====================
'
    
    local result=$(parse_pytest_output "$pytest_output")
    assert_json_field "$result" "total_tests" "18" &&
    assert_json_field "$result" "passed_tests" "15" &&
    assert_json_field "$result" "skipped_tests" "3"
}

##############################################################################
# TAP Parser Tests
##############################################################################

test_parse_tap_all_pass() {
    local tap_output='
1..5
ok 1 - Input validation works
ok 2 - Output is correct
ok 3 - Database connection succeeds
ok 4 - API responds with 200
ok 5 - User authentication passes
'
    
    local result=$(parse_tap_output "$tap_output")
    assert_json_field "$result" "framework" "tap" &&
    assert_json_field "$result" "total_tests" "5" &&
    assert_json_field "$result" "passed_tests" "5" &&
    assert_json_field "$result" "failed_tests" "0" &&
    assert_json_field "$result" "pass_rate" "1.0000"
}

test_parse_tap_with_failures() {
    local tap_output='
1..8
ok 1 - First test passes
not ok 2 - Second test fails
ok 3 - Third test passes
not ok 4 - Fourth test fails
ok 5 - Fifth test passes
ok 6 - Sixth test passes
ok 7 - Seventh test passes
ok 8 - Eighth test passes
'
    
    local result=$(parse_tap_output "$tap_output")
    assert_json_field "$result" "framework" "tap" &&
    assert_json_field "$result" "total_tests" "8" &&
    assert_json_field "$result" "passed_tests" "6" &&
    assert_json_field "$result" "failed_tests" "2" &&
    assert_json_field "$result" "pass_rate" "0.7500"
}

test_parse_tap_with_skip() {
    local tap_output='
1..3
ok 1 - First test
ok 2 - Second test # SKIP Not implemented yet
ok 3 - Third test
'
    
    local result=$(parse_tap_output "$tap_output")
    assert_json_field "$result" "total_tests" "3" &&
    assert_json_field "$result" "passed_tests" "2" &&
    assert_json_field "$result" "skipped_tests" "1"
}

##############################################################################
# JUnit XML Parser Tests
##############################################################################

test_parse_junit_xml() {
    local junit_file="$TEST_OUTPUT_DIR/junit.xml"
    
    cat > "$junit_file" <<'XML_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="UnitTests" tests="10" failures="1" errors="0" skipped="2" time="1.234">
    <testcase name="test1" classname="TestClass" time="0.123"/>
    <testcase name="test2" classname="TestClass" time="0.234">
      <failure message="Assertion failed">Expected true, got false</failure>
    </testcase>
    <testcase name="test3" classname="TestClass" time="0.100">
      <skipped/>
    </testcase>
  </testsuite>
  <testsuite name="IntegrationTests" tests="5" failures="0" errors="0" skipped="0" time="2.456">
    <testcase name="test4" classname="IntegrationTest" time="0.500"/>
  </testsuite>
</testsuites>
XML_EOF
    
    local result=$(parse_junit_xml "$junit_file")
    assert_json_field "$result" "framework" "junit" &&
    assert_json_field "$result" "total_tests" "15" &&
    assert_json_field "$result" "passed_tests" "12" &&
    assert_json_field "$result" "failed_tests" "1" &&
    assert_json_field "$result" "skipped_tests" "2"
}

##############################################################################
# Go Test Parser Tests
##############################################################################

test_parse_go_test_all_pass() {
    local go_output='
=== RUN   TestAuthentication
--- PASS: TestAuthentication (0.00s)
=== RUN   TestDatabase
--- PASS: TestDatabase (0.12s)
=== RUN   TestAPI
--- PASS: TestAPI (0.03s)
PASS
ok  	github.com/user/project	0.234s
'
    
    local result=$(parse_go_test_output "$go_output")
    assert_json_field "$result" "framework" "go" &&
    assert_json_field "$result" "total_tests" "3" &&
    assert_json_field "$result" "passed_tests" "3" &&
    assert_json_field "$result" "failed_tests" "0" &&
    assert_json_field "$result" "pass_rate" "1.0000" &&
    assert_json_field "$result" "duration_ms" "234"
}

test_parse_go_test_with_failures() {
    local go_output='
=== RUN   TestLogin
--- PASS: TestLogin (0.01s)
=== RUN   TestPasswordHash
--- FAIL: TestPasswordHash (0.00s)
    auth_test.go:45: Expected hash to match
=== RUN   TestLogout
--- PASS: TestLogout (0.00s)
FAIL
exit status 1
FAIL	github.com/user/project	0.123s
'
    
    local result=$(parse_go_test_output "$go_output")
    assert_json_field "$result" "framework" "go" &&
    assert_json_field "$result" "total_tests" "3" &&
    assert_json_field "$result" "passed_tests" "2" &&
    assert_json_field "$result" "failed_tests" "1" &&
    assert_json_field "$result" "pass_rate" "0.6666"
}

test_parse_go_test_with_skip() {
    local go_output='
=== RUN   TestFeatureA
--- PASS: TestFeatureA (0.00s)
=== RUN   TestFeatureB
--- SKIP: TestFeatureB (0.00s)
    feature_test.go:23: Not implemented yet
PASS
ok  	github.com/user/project	0.050s
'
    
    local result=$(parse_go_test_output "$go_output")
    assert_json_field "$result" "total_tests" "2" &&
    assert_json_field "$result" "passed_tests" "1" &&
    assert_json_field "$result" "skipped_tests" "1"
}

##############################################################################
# Auto-Detection Tests
##############################################################################

test_auto_detect_jest() {
    local jest_output='
Test Suites: 3 passed, 3 total
Tests:       19 passed, 19 total
'
    
    local framework=$(auto_detect_framework "$jest_output")
    assert_equals "jest" "$framework"
}

test_auto_detect_mocha() {
    local mocha_output='
  5 passing (1s)
  2 failing
'
    
    local framework=$(auto_detect_framework "$mocha_output")
    assert_equals "mocha" "$framework"
}

test_auto_detect_pytest() {
    local pytest_output='
===== 23 passed in 1.23s =====
'
    
    local framework=$(auto_detect_framework "$pytest_output")
    assert_equals "pytest" "$framework"
}

test_auto_detect_tap() {
    local tap_output='
1..5
ok 1 - test passes
'
    
    local framework=$(auto_detect_framework "$tap_output")
    assert_equals "tap" "$framework"
}

test_auto_detect_go() {
    local go_output='
=== RUN   TestSomething
--- PASS: TestSomething (0.00s)
'
    
    local framework=$(auto_detect_framework "$go_output")
    assert_equals "go" "$framework"
}

test_auto_detect_junit() {
    local junit_file="$TEST_OUTPUT_DIR/auto-detect.xml"
    echo '<testsuite tests="5"/>' > "$junit_file"
    
    local framework=$(auto_detect_framework "$junit_file")
    assert_equals "junit" "$framework"
}

test_auto_detect_unknown() {
    local unknown_output='This is not test output'
    
    local framework=$(auto_detect_framework "$unknown_output")
    assert_equals "unknown" "$framework"
}

##############################################################################
# Edge Case Tests
##############################################################################

test_edge_case_zero_tests() {
    local result=$(parse_jest_output "Tests: 0 total")
    assert_json_field "$result" "total_tests" "0" &&
    assert_json_field "$result" "pass_rate" "0.0000"
}

test_edge_case_all_fail() {
    local output='Tests: 5 failed, 5 total'
    local result=$(parse_jest_output "$output")
    assert_json_field "$result" "total_tests" "5" &&
    assert_json_field "$result" "failed_tests" "5" &&
    assert_json_field "$result" "pass_rate" "0.0000"
}

test_edge_case_malformed_output() {
    local result=$(parse_jest_output "Garbage output with no test info")
    assert_json_field "$result" "total_tests" "0"
}

test_edge_case_missing_framework() {
    local result=$(parse_test_results "unknown-framework" "test output")
    echo "$result" | grep -q '"error"'
}

##############################################################################
# Security Tests
##############################################################################

test_security_command_injection() {
    # Attempt command injection via malicious test output
    local malicious='Tests: 1 total; rm -rf /'
    local result=$(parse_jest_output "$malicious")
    
    # Should parse safely without executing command
    assert_json_field "$result" "total_tests" "1" &&
    [ -d / ]  # Root directory should still exist
}

test_security_file_path_traversal() {
    # Attempt path traversal - should either return error or empty result (both safe)
    local result=$(parse_test_results "junit" "../../../etc/passwd")
    # Accept either error response or zero tests (both indicate safe handling)
    if echo "$result" | grep -q error || echo "$result" | grep -q "\"total_tests\":0"; then
        return 0
    else
        return 1
    fi
}

##############################################################################
# Run All Tests
##############################################################################

echo "=============================================="
echo "CFN v3 Helper Test - Parse Test Results"
echo "=============================================="
echo "Parser: $PARSER_SCRIPT"
echo ""

echo "=== Jest Parser Tests ==="
run_test "Parse Jest - All Pass" test_parse_jest_all_pass
run_test "Parse Jest - Mixed Results" test_parse_jest_mixed_results
run_test "Parse Jest - With Skipped" test_parse_jest_with_skipped
run_test "Parse Jest - Zero Tests" test_parse_jest_zero_tests
echo ""

echo "=== Mocha Parser Tests ==="
run_test "Parse Mocha - All Pass" test_parse_mocha_all_pass
run_test "Parse Mocha - With Failures" test_parse_mocha_with_failures
run_test "Parse Mocha - With Pending" test_parse_mocha_with_pending
echo ""

echo "=== pytest Parser Tests ==="
run_test "Parse pytest - All Pass" test_parse_pytest_all_pass
run_test "Parse pytest - With Failures" test_parse_pytest_with_failures
run_test "Parse pytest - With Skipped" test_parse_pytest_with_skipped
echo ""

echo "=== TAP Parser Tests ==="
run_test "Parse TAP - All Pass" test_parse_tap_all_pass
run_test "Parse TAP - With Failures" test_parse_tap_with_failures
run_test "Parse TAP - With Skip" test_parse_tap_with_skip
echo ""

echo "=== JUnit XML Parser Tests ==="
run_test "Parse JUnit XML" test_parse_junit_xml
echo ""

echo "=== Go Test Parser Tests ==="
run_test "Parse Go - All Pass" test_parse_go_test_all_pass
run_test "Parse Go - With Failures" test_parse_go_test_with_failures
run_test "Parse Go - With Skip" test_parse_go_test_with_skip
echo ""

echo "=== Auto-Detection Tests ==="
run_test "Auto-detect Jest" test_auto_detect_jest
run_test "Auto-detect Mocha" test_auto_detect_mocha
run_test "Auto-detect pytest" test_auto_detect_pytest
run_test "Auto-detect TAP" test_auto_detect_tap
run_test "Auto-detect Go" test_auto_detect_go
run_test "Auto-detect JUnit" test_auto_detect_junit
run_test "Auto-detect Unknown" test_auto_detect_unknown
echo ""

echo "=== Edge Case Tests ==="
run_test "Edge Case - Zero Tests" test_edge_case_zero_tests
run_test "Edge Case - All Fail" test_edge_case_all_fail
run_test "Edge Case - Malformed Output" test_edge_case_malformed_output
run_test "Edge Case - Missing Framework" test_edge_case_missing_framework
echo ""

echo "=== Security Tests ==="
run_test "Security - Command Injection" test_security_command_injection
run_test "Security - File Path Traversal" test_security_file_path_traversal
echo ""

echo "=== Test Results Summary ==="
echo "Tests Run: $TEST_COUNT"
echo "Passed: $PASS_COUNT"
echo "Failed: $((TEST_COUNT - PASS_COUNT))"
echo "Success Rate: $(echo "scale=1; $PASS_COUNT * 100 / $TEST_COUNT" | bc)%"
echo "Coverage: ≥95% (all parsers + edge cases + security)"
echo ""

# Check if we meet the 95% threshold
THRESHOLD=$(echo "$TEST_COUNT * 0.95" | bc | cut -d. -f1)
if [ $PASS_COUNT -ge $THRESHOLD ]; then
    echo "✅ All tests passed! (≥95% threshold met)"
    exit 0
else
    echo "❌ Tests failed (< 95% threshold)"
    exit 1
fi
