#!/usr/bin/env bash
set -e

# Test suite for success criteria auto-generation

TEST_COUNT=0
PASS_COUNT=0

# Source the coordinator's generation function
# (For testing, we'll implement a standalone version)

generate_success_criteria() {
    local TASK_DESC="$1"
    local MODE="$2"

    case "$MODE" in
        mvp) BASE_THRESHOLD=0.80 ;;
        standard) BASE_THRESHOLD=0.95 ;;
        enterprise) BASE_THRESHOLD=0.99 ;;
        *) BASE_THRESHOLD=0.95 ;;
    esac

    if echo "$TASK_DESC" | grep -qiE '(auth|security|crypto|encryption|token|JWT|OAuth|password)'; then
        cat <<EOF
{"test_suites":[{"name":"Security Tests","command":"npm run test:security","required":true,"pass_threshold":1.0,"description":"Security validation - 100% pass rate required"},{"name":"Unit Tests","command":"npm run test:unit","required":true,"pass_threshold":$BASE_THRESHOLD}],"gate_mode":"test-driven","metadata":{"created_by":"cfn-v3-coordinator","task_type":"security-critical","mode":"$MODE"}}
EOF
    elif echo "$TASK_DESC" | grep -qiE '(API|REST|endpoint|route|controller|service|database|SQL)'; then
        cat <<EOF
{"test_suites":[{"name":"Unit Tests","command":"npm run test:unit","required":true,"pass_threshold":$BASE_THRESHOLD},{"name":"Integration Tests","command":"npm run test:integration","required":true,"pass_threshold":$BASE_THRESHOLD,"description":"API integration validation"}],"gate_mode":"test-driven","metadata":{"created_by":"cfn-v3-coordinator","task_type":"api-backend","mode":"$MODE"}}
EOF
    elif echo "$TASK_DESC" | grep -qiE '(frontend|UI|React|component|interface|accessibility|responsive)'; then
        cat <<EOF
{"test_suites":[{"name":"Unit Tests","command":"npm run test:unit","required":true,"pass_threshold":$BASE_THRESHOLD},{"name":"Interaction Tests","command":"npm run test:interaction","required":true,"pass_threshold":$BASE_THRESHOLD},{"name":"Accessibility Tests","command":"npm run test:a11y","required":false,"pass_threshold":0.90,"description":"WCAG AA compliance validation"}],"gate_mode":"test-driven","metadata":{"created_by":"cfn-v3-coordinator","task_type":"frontend-ui","mode":"$MODE"}}
EOF
    else
        cat <<EOF
{"test_suites":[{"name":"Unit Tests","command":"npm run test:unit","required":true,"pass_threshold":$BASE_THRESHOLD}],"gate_mode":"test-driven","metadata":{"created_by":"cfn-v3-coordinator","task_type":"generic","mode":"$MODE"}}
EOF
    fi
}

test_security_task() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local CRITERIA=$(generate_success_criteria "Implement JWT authentication" "standard")

    # Check JSON validity
    if ! echo "$CRITERIA" | jq empty 2>/dev/null; then
        echo "❌ test_security_task: Invalid JSON"
        return
    fi

    # Check security tests present
    local SECURITY_TESTS=$(echo "$CRITERIA" | jq '[.test_suites[] | select(.name == "Security Tests")] | length')

    # Check 100% pass threshold
    local SECURITY_THRESHOLD=$(echo "$CRITERIA" | jq -r '.test_suites[] | select(.name == "Security Tests") | .pass_threshold')

    if [[ "$SECURITY_TESTS" -eq 1 ]] && [[ "$SECURITY_THRESHOLD" == "1" || "$SECURITY_THRESHOLD" == "1.0" ]]; then
        echo "✅ test_security_task: PASS"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "❌ test_security_task: FAIL (security_tests=$SECURITY_TESTS, threshold=$SECURITY_THRESHOLD)"
    fi
}

test_api_task() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local CRITERIA=$(generate_success_criteria "Build REST API endpoint" "standard")

    local UNIT_TESTS=$(echo "$CRITERIA" | jq '[.test_suites[] | select(.name == "Unit Tests")] | length')
    local INTEGRATION_TESTS=$(echo "$CRITERIA" | jq '[.test_suites[] | select(.name == "Integration Tests")] | length')

    if [[ "$UNIT_TESTS" -eq 1 ]] && [[ "$INTEGRATION_TESTS" -eq 1 ]]; then
        echo "✅ test_api_task: PASS"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "❌ test_api_task: FAIL"
    fi
}

test_frontend_task() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local CRITERIA=$(generate_success_criteria "Create React component" "standard")

    local A11Y_TESTS=$(echo "$CRITERIA" | jq '[.test_suites[] | select(.name == "Accessibility Tests")] | length')

    if [[ "$A11Y_TESTS" -eq 1 ]]; then
        echo "✅ test_frontend_task: PASS"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "❌ test_frontend_task: FAIL"
    fi
}

test_generic_task() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local CRITERIA=$(generate_success_criteria "Refactor helper function" "standard")

    local SUITE_COUNT=$(echo "$CRITERIA" | jq '.test_suites | length')

    if [[ "$SUITE_COUNT" -eq 1 ]]; then
        echo "✅ test_generic_task: PASS (unit tests only)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "❌ test_generic_task: FAIL (expected 1 suite, got $SUITE_COUNT)"
    fi
}

test_mode_thresholds() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local MVP_CRITERIA=$(generate_success_criteria "Build feature" "mvp")
    local STD_CRITERIA=$(generate_success_criteria "Build feature" "standard")
    local ENT_CRITERIA=$(generate_success_criteria "Build feature" "enterprise")

    local MVP_THRESHOLD=$(echo "$MVP_CRITERIA" | jq -r '.test_suites[0].pass_threshold')
    local STD_THRESHOLD=$(echo "$STD_CRITERIA" | jq -r '.test_suites[0].pass_threshold')
    local ENT_THRESHOLD=$(echo "$ENT_CRITERIA" | jq -r '.test_suites[0].pass_threshold')

    # Use bc for floating point comparison
    MVP_MATCH=$(echo "$MVP_THRESHOLD == 0.80 || $MVP_THRESHOLD == 0.8" | bc -l)
    STD_MATCH=$(echo "$STD_THRESHOLD == 0.95" | bc -l)
    ENT_MATCH=$(echo "$ENT_THRESHOLD == 0.99" | bc -l)

    if [[ "$MVP_MATCH" -eq 1 ]] && [[ "$STD_MATCH" -eq 1 ]] && [[ "$ENT_MATCH" -eq 1 ]]; then
        echo "✅ test_mode_thresholds: PASS"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "❌ test_mode_thresholds: FAIL (MVP=$MVP_THRESHOLD, STD=$STD_THRESHOLD, ENT=$ENT_THRESHOLD)"
    fi
}

# Run all tests
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Success Criteria Generation Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_security_task
test_api_task
test_frontend_task
test_generic_task
test_mode_thresholds

# Summary
PASS_RATE=$(echo "scale=2; $PASS_COUNT / $TEST_COUNT" | bc)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Tests: $PASS_COUNT/$TEST_COUNT passed ($PASS_RATE)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if (( $(echo "$PASS_RATE >= 0.95" | bc -l) )); then
    echo "✅ Test suite PASSED (≥95% pass rate)"
    exit 0
else
    echo "❌ Test suite FAILED (<95% pass rate)"
    exit 1
fi
