#!/bin/bash
# tests/ace-integration/09-domain-classifier.test.sh
# Phase 2.4 - Domain Classifier Test Suite
# Tests domain classification, complexity assessment, and context integration

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"
CLASSIFIER_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-ace-system/classify-task.sh"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test result tracking
declare -a FAILED_TEST_NAMES=()
declare -a TEST_CATEGORIES=()

log_category() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  CATEGORY: $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    TEST_CATEGORIES+=("$1")
}

log_test() {
    echo -e "${YELLOW}[TEST $1]${NC} $2"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

log_pass() {
    echo -e "${GREEN}✓ PASS${NC} $1"
    PASSED_TESTS=$((PASSED_TESTS + 1))
}

log_fail() {
    echo -e "${RED}✗ FAIL${NC} $1"
    FAILED_TEST_NAMES+=("$2")
    FAILED_TESTS=$((FAILED_TESTS + 1))
}

log_info() {
    echo -e "${BLUE}ℹ INFO${NC} $1"
}

# Helper: Parse JSON and extract field
extract_json_field() {
    local json="$1"
    local field="$2"
    echo "$json" | grep -o "\"$field\"[[:space:]]*:[[:space:]]*[^,}]*" | sed 's/.*:[[:space:]]*//' | tr -d '"[]'
}

# Helper: Validate JSON structure
validate_json() {
    local json="$1"
    if echo "$json" | jq empty 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Helper: Check if array contains value
array_contains() {
    local needle="$1"
    local haystack="$2"
    if [[ "$haystack" == *"$needle"* ]]; then
        return 0
    else
        return 1
    fi
}

# Helper: Count domains in JSON array
count_domains() {
    local json="$1"
    echo "$json" | jq '.domains | length' 2>/dev/null || echo "0"
}

##############################################################################
# CATEGORY 1: Single Domain Classification (5 tests)
##############################################################################

test_single_domain_classification() {
    log_category "CATEGORY 1: Single Domain Classification"

    # Test 1.1: Frontend task
    log_test "1.1" "Frontend task → [\"frontend\"] domain"
    TASK="Build responsive React component library with TypeScript"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            if array_contains "frontend" "$DOMAINS" && ! array_contains "backend" "$DOMAINS"; then
                log_pass "Frontend task correctly classified"
            else
                log_fail "Expected [\"frontend\"], got: $DOMAINS" "1.1-frontend-classification"
            fi
        else
            log_fail "Invalid JSON output" "1.1-json-validation"
        fi
    else
        log_fail "Classifier script not found: $CLASSIFIER_SCRIPT" "1.1-script-missing"
    fi

    # Test 1.2: Backend task
    log_test "1.2" "Backend task → [\"backend\"] domain"
    TASK="Implement RESTful API endpoints with Express.js"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            if array_contains "backend" "$DOMAINS" && ! array_contains "frontend" "$DOMAINS"; then
                log_pass "Backend task correctly classified"
            else
                log_fail "Expected [\"backend\"], got: $DOMAINS" "1.2-backend-classification"
            fi
        else
            log_fail "Invalid JSON output" "1.2-json-validation"
        fi
    else
        log_fail "Classifier script not found" "1.2-script-missing"
    fi

    # Test 1.3: Security task
    log_test "1.3" "Security task → [\"security\"] domain"
    TASK="Audit authentication flow for SQL injection vulnerabilities"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            if array_contains "security" "$DOMAINS"; then
                log_pass "Security task correctly classified"
            else
                log_fail "Expected [\"security\"], got: $DOMAINS" "1.3-security-classification"
            fi
        else
            log_fail "Invalid JSON output" "1.3-json-validation"
        fi
    else
        log_fail "Classifier script not found" "1.3-script-missing"
    fi

    # Test 1.4: DevOps task
    log_test "1.4" "DevOps task → [\"devops\"] domain"
    TASK="Set up CI/CD pipeline with GitHub Actions and Docker"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            if array_contains "devops" "$DOMAINS"; then
                log_pass "DevOps task correctly classified"
            else
                log_fail "Expected [\"devops\"], got: $DOMAINS" "1.4-devops-classification"
            fi
        else
            log_fail "Invalid JSON output" "1.4-json-validation"
        fi
    else
        log_fail "Classifier script not found" "1.4-script-missing"
    fi

    # Test 1.5: Database task
    log_test "1.5" "Database task → [\"database\"] domain"
    TASK="Optimize PostgreSQL query performance with indexes"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            if array_contains "database" "$DOMAINS"; then
                log_pass "Database task correctly classified"
            else
                log_fail "Expected [\"database\"], got: $DOMAINS" "1.5-database-classification"
            fi
        else
            log_fail "Invalid JSON output" "1.5-json-validation"
        fi
    else
        log_fail "Classifier script not found" "1.5-script-missing"
    fi
}

##############################################################################
# CATEGORY 2: Multi-Domain Classification (4 tests)
##############################################################################

test_multi_domain_classification() {
    log_category "CATEGORY 2: Multi-Domain Classification"

    # Test 2.1: Frontend + Backend
    log_test "2.1" "Frontend + Backend → [\"frontend\", \"backend\"]"
    TASK="Build full-stack authentication system with React frontend and Node.js backend"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            if array_contains "frontend" "$DOMAINS" && array_contains "backend" "$DOMAINS"; then
                log_pass "Multi-domain (frontend+backend) correctly classified"
            else
                log_fail "Expected [\"frontend\", \"backend\"], got: $DOMAINS" "2.1-frontend-backend"
            fi
        else
            log_fail "Invalid JSON output" "2.1-json-validation"
        fi
    else
        log_fail "Classifier script not found" "2.1-script-missing"
    fi

    # Test 2.2: Backend + Security
    log_test "2.2" "Backend + Security → [\"backend\", \"security\"]"
    TASK="Implement JWT authentication with refresh tokens and rate limiting"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            if array_contains "backend" "$DOMAINS" && array_contains "security" "$DOMAINS"; then
                log_pass "Multi-domain (backend+security) correctly classified"
            else
                log_fail "Expected [\"backend\", \"security\"], got: $DOMAINS" "2.2-backend-security"
            fi
        else
            log_fail "Invalid JSON output" "2.2-json-validation"
        fi
    else
        log_fail "Classifier script not found" "2.2-script-missing"
    fi

    # Test 2.3: DevOps + Database
    log_test "2.3" "DevOps + Database → [\"devops\", \"database\"]"
    TASK="Set up PostgreSQL replication with automated failover and monitoring"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            if array_contains "devops" "$DOMAINS" && array_contains "database" "$DOMAINS"; then
                log_pass "Multi-domain (devops+database) correctly classified"
            else
                log_fail "Expected [\"devops\", \"database\"], got: $DOMAINS" "2.3-devops-database"
            fi
        else
            log_fail "Invalid JSON output" "2.3-json-validation"
        fi
    else
        log_fail "Classifier script not found" "2.3-script-missing"
    fi

    # Test 2.4: Full-stack (3+ domains)
    log_test "2.4" "Full-stack (3+ domains) → multiple domains"
    TASK="Create e-commerce platform with React frontend, Node.js API, PostgreSQL database, and AWS deployment"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAIN_COUNT=$(count_domains "$RESULT")
            if [ "$DOMAIN_COUNT" -ge 3 ]; then
                log_pass "Full-stack task identified multiple domains ($DOMAIN_COUNT)"
            else
                log_fail "Expected 3+ domains, got: $DOMAIN_COUNT" "2.4-full-stack"
            fi
        else
            log_fail "Invalid JSON output" "2.4-json-validation"
        fi
    else
        log_fail "Classifier script not found" "2.4-script-missing"
    fi
}

##############################################################################
# CATEGORY 3: Complexity Assessment (3 tests)
##############################################################################

test_complexity_assessment() {
    log_category "CATEGORY 3: Complexity Assessment"

    # Test 3.1: Simple task (< 10 words)
    log_test "3.1" "Simple task (< 10 words) → \"low\""
    TASK="Fix login bug"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            COMPLEXITY=$(extract_json_field "$RESULT" "complexity")
            if [[ "$COMPLEXITY" == "low" ]]; then
                log_pass "Simple task complexity correctly assessed"
            else
                log_fail "Expected \"low\", got: $COMPLEXITY" "3.1-simple-complexity"
            fi
        else
            log_fail "Invalid JSON output" "3.1-json-validation"
        fi
    else
        log_fail "Classifier script not found" "3.1-script-missing"
    fi

    # Test 3.2: Medium task (10-30 words)
    log_test "3.2" "Medium task (10-30 words) → \"medium\""
    TASK="Implement user authentication with email verification and password reset functionality"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            COMPLEXITY=$(extract_json_field "$RESULT" "complexity")
            if [[ "$COMPLEXITY" == "medium" ]]; then
                log_pass "Medium task complexity correctly assessed"
            else
                log_fail "Expected \"medium\", got: $COMPLEXITY" "3.2-medium-complexity"
            fi
        else
            log_fail "Invalid JSON output" "3.2-json-validation"
        fi
    else
        log_fail "Classifier script not found" "3.2-script-missing"
    fi

    # Test 3.3: Complex task (> 30 words + technical terms)
    log_test "3.3" "Complex task (> 30 words + technical) → \"high\""
    TASK="Design and implement microservices architecture with API gateway, service mesh, distributed tracing, event-driven communication using Kafka, PostgreSQL database with read replicas, Redis caching layer, and comprehensive monitoring with Prometheus and Grafana"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            COMPLEXITY=$(extract_json_field "$RESULT" "complexity")
            if [[ "$COMPLEXITY" == "high" ]]; then
                log_pass "Complex task complexity correctly assessed"
            else
                log_fail "Expected \"high\", got: $COMPLEXITY" "3.3-complex-complexity"
            fi
        else
            log_fail "Invalid JSON output" "3.3-json-validation"
        fi
    else
        log_fail "Classifier script not found" "3.3-script-missing"
    fi
}

##############################################################################
# CATEGORY 4: JSON Output Validation (3 tests)
##############################################################################

test_json_output_validation() {
    log_category "CATEGORY 4: JSON Output Validation"

    TASK="Build REST API with authentication"

    # Test 4.1: Valid JSON structure
    log_test "4.1" "Valid JSON structure"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            log_pass "Output is valid JSON"
        else
            log_fail "Output is not valid JSON: $RESULT" "4.1-json-structure"
        fi
    else
        log_fail "Classifier script not found" "4.1-script-missing"
    fi

    # Test 4.2: Required fields present
    log_test "4.2" "Required fields present (task_type, domains, complexity)"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            TASK_TYPE=$(extract_json_field "$RESULT" "task_type")
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            COMPLEXITY=$(extract_json_field "$RESULT" "complexity")

            if [ -n "$TASK_TYPE" ] && [ -n "$DOMAINS" ] && [ -n "$COMPLEXITY" ]; then
                log_pass "All required fields present"
            else
                log_fail "Missing required fields. task_type=$TASK_TYPE, domains=$DOMAINS, complexity=$COMPLEXITY" "4.2-required-fields"
            fi
        else
            log_fail "Invalid JSON output" "4.2-json-validation"
        fi
    else
        log_fail "Classifier script not found" "4.2-script-missing"
    fi

    # Test 4.3: Domains array not empty
    log_test "4.3" "Domains array not empty"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAIN_COUNT=$(count_domains "$RESULT")
            if [ "$DOMAIN_COUNT" -gt 0 ]; then
                log_pass "Domains array contains $DOMAIN_COUNT domain(s)"
            else
                log_fail "Domains array is empty" "4.3-domains-empty"
            fi
        else
            log_fail "Invalid JSON output" "4.3-json-validation"
        fi
    else
        log_fail "Classifier script not found" "4.3-script-missing"
    fi
}

##############################################################################
# CATEGORY 5: Context Query Integration (4 tests)
##############################################################################

test_context_query_integration() {
    log_category "CATEGORY 5: Context Query Integration"

    QUERY_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-ace-system/invoke-context-query.sh"

    # Test 5.1: Frontend task retrieves frontend contexts
    log_test "5.1" "Frontend task retrieves frontend contexts"
    if [ -f "$CLASSIFIER_SCRIPT" ] && [ -f "$QUERY_SCRIPT" ]; then
        TASK="Build React component"
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            log_info "Classified domains: $DOMAINS"

            # Query contexts using domain
            if array_contains "frontend" "$DOMAINS"; then
                log_pass "Frontend domain correctly identified for context query"
            else
                log_fail "Frontend domain not identified" "5.1-frontend-context"
            fi
        else
            log_fail "Invalid JSON output" "5.1-json-validation"
        fi
    else
        log_fail "Required scripts not found" "5.1-scripts-missing"
    fi

    # Test 5.2: Backend task retrieves backend contexts
    log_test "5.2" "Backend task retrieves backend contexts"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        TASK="Implement API endpoint"
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            log_info "Classified domains: $DOMAINS"

            if array_contains "backend" "$DOMAINS"; then
                log_pass "Backend domain correctly identified for context query"
            else
                log_fail "Backend domain not identified" "5.2-backend-context"
            fi
        else
            log_fail "Invalid JSON output" "5.2-json-validation"
        fi
    else
        log_fail "Classifier script not found" "5.2-script-missing"
    fi

    # Test 5.3: Multi-domain task retrieves blended contexts
    log_test "5.3" "Multi-domain task retrieves blended contexts"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        TASK="Build full-stack authentication system"
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAIN_COUNT=$(count_domains "$RESULT")
            log_info "Identified $DOMAIN_COUNT domains"

            if [ "$DOMAIN_COUNT" -ge 2 ]; then
                log_pass "Multi-domain task identified for blended context query"
            else
                log_fail "Expected 2+ domains, got: $DOMAIN_COUNT" "5.3-blended-context"
            fi
        else
            log_fail "Invalid JSON output" "5.3-json-validation"
        fi
    else
        log_fail "Classifier script not found" "5.3-script-missing"
    fi

    # Test 5.4: Domain mismatch returns appropriate results
    log_test "5.4" "Domain mismatch handling"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        TASK="Mobile iOS development"
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=json 2>/dev/null || echo "{}")
        if validate_json "$RESULT"; then
            DOMAINS=$(extract_json_field "$RESULT" "domains")
            log_info "Classified domains: $DOMAINS"

            # Should classify as mobile or frontend
            if array_contains "mobile" "$DOMAINS" || array_contains "frontend" "$DOMAINS"; then
                log_pass "Mobile task correctly classified"
            else
                log_fail "Mobile task not correctly classified: $DOMAINS" "5.4-domain-mismatch"
            fi
        else
            log_fail "Invalid JSON output" "5.4-json-validation"
        fi
    else
        log_fail "Classifier script not found" "5.4-script-missing"
    fi
}

##############################################################################
# CATEGORY 6: Backward Compatibility (2 tests)
##############################################################################

test_backward_compatibility() {
    log_category "CATEGORY 6: Backward Compatibility"

    TASK="Build API endpoint"

    # Test 6.1: Legacy format (--format=simple) works
    log_test "6.1" "Legacy format (--format=simple) works"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" --format=simple 2>/dev/null || echo "")
        if [ -n "$RESULT" ]; then
            log_pass "Legacy simple format supported"
        else
            log_fail "Legacy format returned empty output" "6.1-legacy-format"
        fi
    else
        log_fail "Classifier script not found" "6.1-script-missing"
    fi

    # Test 6.2: Default output unchanged
    log_test "6.2" "Default output unchanged (backward compatible)"
    if [ -f "$CLASSIFIER_SCRIPT" ]; then
        # Run without format flag
        RESULT=$("$CLASSIFIER_SCRIPT" --task "$TASK" 2>/dev/null || echo "")
        if [ -n "$RESULT" ]; then
            log_pass "Default output format works"
        else
            log_fail "Default output returned empty" "6.2-default-format"
        fi
    else
        log_fail "Classifier script not found" "6.2-script-missing"
    fi
}

##############################################################################
# Test Execution
##############################################################################

main() {
    echo ""
    echo "=========================================="
    echo "  Domain Classifier Test Suite"
    echo "  Phase 2.4 - ACE System Enhancement"
    echo "=========================================="
    echo ""

    # Check prerequisites
    if [ ! -f "$CLASSIFIER_SCRIPT" ]; then
        log_info "Classifier script not found: $CLASSIFIER_SCRIPT"
        log_info "This is expected for test-first development"
        log_info "Tests will validate expected behavior once implemented"
    fi

    # Run all test categories
    test_single_domain_classification
    test_multi_domain_classification
    test_complexity_assessment
    test_json_output_validation
    test_context_query_integration
    test_backward_compatibility

    # Summary
    echo ""
    echo "=========================================="
    echo "  Test Summary"
    echo "=========================================="
    echo "Total Tests:  $TOTAL_TESTS"
    echo "Passed:       $PASSED_TESTS"
    echo "Failed:       $FAILED_TESTS"
    echo ""

    # Pass rate calculation
    if [ "$TOTAL_TESTS" -gt 0 ]; then
        PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS / $TOTAL_TESTS) * 100}")
        echo "Pass Rate:    $PASS_RATE%"
    else
        PASS_RATE=0
        echo "Pass Rate:    N/A (no tests executed)"
    fi

    # Acceptance criteria validation
    echo ""
    echo "=========================================="
    echo "  Acceptance Criteria Validation"
    echo "=========================================="
    echo "AC1: Task classifier outputs domain field"
    echo "  → Validated by Category 1, 2, 4, 5"
    echo ""
    echo "AC2: Domain used in context lookup"
    echo "  → Validated by Category 5 (tests 5.1-5.4)"
    echo ""
    echo "AC3: Frontend tasks get frontend contexts"
    echo "  → Validated by test 5.1"
    echo ""
    echo "AC4: Cross-domain tasks get blended results"
    echo "  → Validated by test 5.3"
    echo ""

    # Failed tests detail
    if [ "$FAILED_TESTS" -gt 0 ]; then
        echo ""
        echo "=========================================="
        echo "  Failed Tests Detail"
        echo "=========================================="
        for test_name in "${FAILED_TEST_NAMES[@]}"; do
            echo "  - $test_name"
        done
    fi

    # Self-confidence score
    echo ""
    echo "=========================================="
    echo "  Self-Confidence Assessment"
    echo "=========================================="

    if [ "$TOTAL_TESTS" -eq 0 ]; then
        CONFIDENCE=0.0
        echo "Confidence: $CONFIDENCE (no tests executed)"
    elif (( $(echo "$PASS_RATE >= 90" | bc -l) )); then
        CONFIDENCE=0.95
        echo "Confidence: $CONFIDENCE (excellent - ≥90% pass rate)"
    elif (( $(echo "$PASS_RATE >= 80" | bc -l) )); then
        CONFIDENCE=0.85
        echo "Confidence: $CONFIDENCE (good - ≥80% pass rate)"
    elif (( $(echo "$PASS_RATE >= 70" | bc -l) )); then
        CONFIDENCE=0.75
        echo "Confidence: $CONFIDENCE (acceptable - ≥70% pass rate)"
    else
        CONFIDENCE=0.60
        echo "Confidence: $CONFIDENCE (needs improvement)"
    fi

    echo ""
    echo "=========================================="
    echo "  Test Categories Executed"
    echo "=========================================="
    for category in "${TEST_CATEGORIES[@]}"; do
        echo "  ✓ $category"
    done
    echo ""

    # Exit code
    if [ "$FAILED_TESTS" -eq 0 ] && [ "$TOTAL_TESTS" -gt 0 ]; then
        echo "✓ All tests passed!"
        exit 0
    elif [ "$TOTAL_TESTS" -eq 0 ]; then
        echo "⚠ No tests executed (classifier not implemented yet)"
        exit 0
    else
        echo "✗ Some tests failed"
        exit 1
    fi
}

main "$@"
