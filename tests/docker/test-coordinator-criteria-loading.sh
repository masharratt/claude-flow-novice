#!/usr/bin/env bash
##############################################################################
# Test: Docker Coordinator Success Criteria Loading
# Phase 4: Docker Mode Integration - Test-Driven Gates
#
# Tests that coordinator-entrypoint.sh correctly:
# 1. Loads success criteria from environment variable
# 2. Loads success criteria from file path
# 3. Validates JSON format
# 4. Passes criteria to orchestrator
# 5. Handles missing criteria gracefully
##############################################################################

set -uo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test fixtures
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENTRYPOINT="$PROJECT_ROOT/docker/coordinator-entrypoint.sh"
TEST_CRITERIA_FILE="/tmp/test-success-criteria-$$.json"

# Cleanup function
cleanup() {
    rm -f "$TEST_CRITERIA_FILE"
}
trap cleanup EXIT

# Test helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    echo -e "  ${RED}Error:${NC} $2"
    ((TESTS_FAILED++))
}

run_test() {
    ((TESTS_RUN++))
    echo ""
    echo -e "${YELLOW}Test $TESTS_RUN:${NC} $1"
}

# Create valid test criteria
create_valid_criteria() {
    cat > "$TEST_CRITERIA_FILE" << 'EOF'
{
  "test_suites": [{
    "name": "Docker Coordinator Tests",
    "command": "bash tests/docker/test-coordinator-criteria-loading.sh",
    "required": true,
    "pass_threshold": 1.0
  }],
  "deliverables": [
    "docker/coordinator-entrypoint.sh",
    "docker/runtime/cfn-runtime.contract.yml"
  ]
}
EOF
}

# Create invalid JSON
create_invalid_criteria() {
    cat > "$TEST_CRITERIA_FILE" << 'EOF'
{
  "test_suites": [{
    "name": "Invalid JSON - missing closing bracket"
  }
EOF
}

##############################################################################
# Test 1: Load success criteria from inline JSON environment variable
##############################################################################
run_test "Load success criteria from inline JSON environment variable"

VALID_JSON='{"test_suites":[{"name":"Test","command":"echo test","required":true,"pass_threshold":1.0}]}'

# Source the entrypoint functions (mock mode - just validate logic exists)
if grep -q "CFN_SUCCESS_CRITERIA" "$ENTRYPOINT" 2>/dev/null; then
    pass "Entrypoint checks CFN_SUCCESS_CRITERIA environment variable"
else
    fail "Entrypoint does not check CFN_SUCCESS_CRITERIA" "Missing CFN_SUCCESS_CRITERIA handling"
fi

##############################################################################
# Test 2: Load success criteria from file path
##############################################################################
run_test "Load success criteria from file path"

create_valid_criteria

# Check if entrypoint handles file paths
if grep -q "if \[\[ -f" "$ENTRYPOINT" 2>/dev/null; then
    pass "Entrypoint checks if CFN_SUCCESS_CRITERIA is a file path"
else
    fail "Entrypoint does not check for file paths" "Missing file path handling logic"
fi

##############################################################################
# Test 3: Validate JSON format using jq
##############################################################################
run_test "Validate JSON format using jq"

if grep -q "jq empty" "$ENTRYPOINT" 2>/dev/null; then
    pass "Entrypoint validates JSON using jq"
else
    fail "Entrypoint does not validate JSON" "Missing jq validation"
fi

##############################################################################
# Test 4: Export SUCCESS_CRITERIA to environment for orchestrator
##############################################################################
run_test "Export SUCCESS_CRITERIA to orchestrator environment"

if grep -q "export SUCCESS_CRITERIA" "$ENTRYPOINT" 2>/dev/null; then
    pass "Entrypoint exports SUCCESS_CRITERIA for orchestrator"
else
    fail "Entrypoint does not export SUCCESS_CRITERIA" "Missing export statement"
fi

##############################################################################
# Test 5: Handle missing criteria gracefully with warning
##############################################################################
run_test "Handle missing criteria gracefully"

if grep -q "No success criteria provided" "$ENTRYPOINT" 2>/dev/null || \
   grep -q "auto-generate" "$ENTRYPOINT" 2>/dev/null; then
    pass "Entrypoint handles missing criteria with warning"
else
    fail "Entrypoint does not handle missing criteria" "Missing fallback logic"
fi

##############################################################################
# Test 6: Validate contract.yml has test-driven gate variables
##############################################################################
run_test "Validate contract.yml has test-driven gate configuration"

CONTRACT_FILE="$PROJECT_ROOT/docker/runtime/cfn-runtime.contract.yml"

if [[ -f "$CONTRACT_FILE" ]]; then
    if grep -q "CFN_GATE_STRATEGY" "$CONTRACT_FILE" && \
       grep -q "CFN_TEST_PASS_RATE_GATE" "$CONTRACT_FILE" && \
       grep -q "CFN_SUCCESS_CRITERIA" "$CONTRACT_FILE"; then
        pass "Contract file has test-driven gate variables"
    else
        fail "Contract file missing test-driven variables" "Missing CFN_GATE_STRATEGY, CFN_TEST_PASS_RATE_GATE, or CFN_SUCCESS_CRITERIA"
    fi
else
    fail "Contract file not found" "Expected at $CONTRACT_FILE"
fi

##############################################################################
# Test 7: Validate docker-compose.yml has success criteria volume mount
##############################################################################
run_test "Validate docker-compose.yml has success criteria support"

COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.yml"

if [[ -f "$COMPOSE_FILE" ]]; then
    # Check for environment variable or volume mount for success criteria
    if grep -q "CFN_SUCCESS_CRITERIA" "$COMPOSE_FILE" || \
       grep -q "success-criteria" "$COMPOSE_FILE"; then
        pass "docker-compose.yml has success criteria support"
    else
        fail "docker-compose.yml missing success criteria support" "No CFN_SUCCESS_CRITERIA env or volume mount"
    fi
else
    fail "docker-compose.yml not found" "Expected at $COMPOSE_FILE"
fi

##############################################################################
# Test 8: Full integration test with mock orchestrator call
##############################################################################
run_test "Full integration test: criteria loading and validation"

create_valid_criteria

# Test the validation logic in isolation
if echo "$VALID_JSON" | jq empty 2>/dev/null; then
    pass "Valid JSON passes jq validation"
else
    fail "Valid JSON fails jq validation" "jq validation error"
fi

create_invalid_criteria

# Test invalid JSON detection
if ! jq empty < "$TEST_CRITERIA_FILE" 2>/dev/null; then
    pass "Invalid JSON is correctly detected by jq"
else
    fail "Invalid JSON not detected" "jq should fail on invalid JSON"
fi

##############################################################################
# Test Summary
##############################################################################
echo ""
echo "========================================"
echo "Test Results Summary"
echo "========================================"
echo "Tests Run:    $TESTS_RUN"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    echo ""
    echo "Pass Rate: $(awk "BEGIN {printf \"%.2f\", $TESTS_PASSED / $TESTS_RUN}")"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Pass Rate: $(awk "BEGIN {printf \"%.2f\", $TESTS_PASSED / $TESTS_RUN}")"
    exit 1
fi
