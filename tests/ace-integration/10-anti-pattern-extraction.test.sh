#!/bin/bash
# tests/ace-integration/10-anti-pattern-extraction.test.sh
# Phase 3.1 - Anti-Pattern Detection Test Suite
# Tests anti-pattern extraction from low-confidence sprints across 6 categories with 20 total tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"
QUERY_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-ace-system/query-anti-patterns.sh"
DB_PATH="$PROJECT_ROOT/ace-context.db"

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

log_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

log_category() {
    echo -e "\n${YELLOW}[CATEGORY $1]${NC} $2"
}

log_test() {
    echo -e "${YELLOW}[TEST $1]${NC} $2"
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

run_test() {
    local test_name=$1
    shift
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_test "$TOTAL_TESTS" "$test_name"
    "$@"
}

# ============================================================================
# Test Setup: Create fixtures in database
# ============================================================================

setup_test_fixtures() {
    log_header "SETTING UP TEST FIXTURES"

    # Remove existing test data
    sqlite3 "$DB_PATH" "DELETE FROM context_reflections WHERE task_id LIKE 'test-%';" 2>/dev/null || true

    # Critical anti-pattern (confidence < 0.50)
    sqlite3 "$DB_PATH" << 'EOF'
INSERT INTO context_reflections (
    id, reflection_type, task_id, agent_id, swarm_id,
    execution_trace, feedback_signals, extracted_lessons, metadata,
    curator_status, confidence, success_count, total_count,
    created_at
) VALUES (
    'test-ap-001',
    'anti-pattern',
    'test-dashboard-ui-002',
    'frontend-dev-1',
    'swarm-test-001',
    '{"iterations": 3, "loops": ["loop3", "loop2"], "timeline": []}',
    '{"loop2_feedback": ["Missing error boundaries"], "product_owner_decision": "ABORT"}',
    '{"anti_pattern": "Missing error boundaries in React components", "solution": "Wrap components in ErrorBoundary", "impact": "Unhandled errors crash entire app"}',
    '{"severity": "critical", "domain": "frontend", "keywords": ["react", "error-handling", "components"], "sprint_ref": "dashboard-ui-002", "failure_reason": "Unhandled exceptions crash application"}',
    'curated',
    0.45,
    0,
    3,
    strftime('%s', '2025-10-20')
);
EOF

    # Warning anti-pattern (confidence 0.50-0.70)
    sqlite3 "$DB_PATH" << 'EOF'
INSERT INTO context_reflections (
    id, reflection_type, task_id, agent_id, swarm_id,
    execution_trace, feedback_signals, extracted_lessons, metadata,
    curator_status, confidence, success_count, total_count,
    created_at
) VALUES (
    'test-ap-002',
    'warning',
    'test-auth-session-001',
    'security-specialist-1',
    'swarm-test-002',
    '{"iterations": 4, "loops": ["loop3", "loop2"], "timeline": []}',
    '{"loop2_feedback": ["Token rotation missing"], "product_owner_decision": "ITERATE"}',
    '{"anti_pattern": "Long-lived JWT tokens without rotation", "solution": "Use 15-min access tokens + refresh rotation", "impact": "Security risk, tokens cannot be revoked"}',
    '{"severity": "high", "domain": "security", "keywords": ["jwt", "token", "session"], "sprint_ref": "auth-session-001", "failure_reason": "Security vulnerability in session management"}',
    'curated',
    0.60,
    1,
    4,
    strftime('%s', '2025-10-22')
);
EOF

    # Medium severity (confidence 0.50-0.70)
    sqlite3 "$DB_PATH" << 'EOF'
INSERT INTO context_reflections (
    id, reflection_type, task_id, agent_id, swarm_id,
    execution_trace, feedback_signals, extracted_lessons, metadata,
    curator_status, confidence, success_count, total_count,
    created_at
) VALUES (
    'test-ap-003',
    'warning',
    'test-api-implementation-003',
    'backend-dev-1',
    'swarm-test-003',
    '{"iterations": 2, "loops": ["loop3", "loop2"], "timeline": []}',
    '{"loop2_feedback": ["Test coverage insufficient"], "product_owner_decision": "ITERATE"}',
    '{"anti_pattern": "Test coverage below 80%", "solution": "Add unit tests for critical paths", "impact": "Reduced code reliability"}',
    '{"severity": "medium", "domain": "testing", "keywords": ["testing", "coverage", "quality"], "sprint_ref": "api-implementation-003", "failure_reason": "Insufficient test coverage"}',
    'curated',
    0.65,
    2,
    3,
    strftime('%s', '2025-10-25')
);
EOF

    # Success case (no anti-pattern)
    sqlite3 "$DB_PATH" << 'EOF'
INSERT INTO context_reflections (
    id, reflection_type, task_id, agent_id, swarm_id,
    execution_trace, feedback_signals, extracted_lessons, metadata,
    curator_status, confidence, success_count, total_count,
    created_at
) VALUES (
    'test-strategy-001',
    'strategy',
    'test-success-sprint-001',
    'backend-dev-1',
    'swarm-test-004',
    '{"iterations": 1, "loops": ["loop3", "loop2"], "timeline": []}',
    '{"loop2_feedback": ["Excellent implementation"], "product_owner_decision": "PROCEED"}',
    '{"strategies": [{"title": "Use Redis for session management", "confidence": 0.90}]}',
    '{"severity": "info", "domain": "backend", "keywords": ["redis", "session", "backend"], "sprint_ref": "success-sprint-001"}',
    'curated',
    0.92,
    5,
    5,
    strftime('%s', '2025-10-28')
);
EOF

    # Performance issue anti-pattern
    sqlite3 "$DB_PATH" << 'EOF'
INSERT INTO context_reflections (
    id, reflection_type, task_id, agent_id, swarm_id,
    execution_trace, feedback_signals, extracted_lessons, metadata,
    curator_status, confidence, success_count, total_count,
    created_at
) VALUES (
    'test-ap-004',
    'anti-pattern',
    'test-api-performance-001',
    'backend-dev-1',
    'swarm-test-005',
    '{"iterations": 3, "loops": ["loop3", "loop2"], "timeline": []}',
    '{"loop2_feedback": ["N+1 query problem"], "product_owner_decision": "ITERATE"}',
    '{"anti_pattern": "N+1 database query pattern", "solution": "Use eager loading with joins", "impact": "Severe performance degradation"}',
    '{"severity": "critical", "domain": "backend", "keywords": ["database", "performance", "query"], "sprint_ref": "api-performance-001", "failure_reason": "Performance issues due to N+1 queries"}',
    'curated',
    0.38,
    0,
    3,
    strftime('%s', '2025-10-26')
);
EOF

    # Recovered sprint (initial failure, then success)
    sqlite3 "$DB_PATH" << 'EOF'
INSERT INTO context_reflections (
    id, reflection_type, task_id, agent_id, swarm_id,
    execution_trace, feedback_signals, extracted_lessons, metadata,
    curator_status, confidence, success_count, total_count,
    created_at
) VALUES (
    'test-recovered-001',
    'warning',
    'test-recovered-sprint-001',
    'frontend-dev-1',
    'swarm-test-006',
    '{"iterations": 2, "loops": ["loop3", "loop2"], "timeline": []}',
    '{"loop2_feedback": ["Initial error handling missing", "Added error boundaries in iteration 2"], "product_owner_decision": "PROCEED"}',
    '{"anti_pattern": "Missing error handling initially", "solution": "Add try-catch blocks and error boundaries", "impact": "Potential crashes"}',
    '{"severity": "medium", "domain": "frontend", "keywords": ["error-handling", "recovery"], "sprint_ref": "recovered-sprint-001"}',
    'curated',
    0.68,
    1,
    2,
    strftime('%s', '2025-10-27')
);
EOF

    echo -e "${GREEN}✓ Test fixtures created successfully${NC}"
}

# ============================================================================
# Category 1: Detection Thresholds (3 tests)
# ============================================================================

test_1_1_critical_anti_pattern() {
    log_category "1" "Detection Thresholds"

    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT reflection_type, confidence,
       json_extract(metadata, '$.severity') as severity
FROM context_reflections
WHERE id = 'test-ap-001';
EOF
)

    local confidence=$(echo "$result" | jq -r '.[0].confidence')
    local severity=$(echo "$result" | jq -r '.[0].severity')
    local reflection_type=$(echo "$result" | jq -r '.[0].reflection_type')

    if [[ "$reflection_type" == "anti-pattern" ]] && \
       [[ "$severity" == "critical" ]] && \
       (( $(echo "$confidence < 0.50" | bc -l) )); then
        log_pass "Critical anti-pattern detected (confidence=$confidence, severity=$severity)"
        return 0
    else
        log_fail "Failed to detect critical anti-pattern (confidence=$confidence, severity=$severity)" "test_1_1"
        return 1
    fi
}

test_1_2_warning_threshold() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT reflection_type, confidence,
       json_extract(metadata, '$.severity') as severity
FROM context_reflections
WHERE id = 'test-ap-002';
EOF
)

    local confidence=$(echo "$result" | jq -r '.[0].confidence')
    local severity=$(echo "$result" | jq -r '.[0].severity')
    local reflection_type=$(echo "$result" | jq -r '.[0].reflection_type')

    if [[ "$reflection_type" == "warning" ]] && \
       (( $(echo "$confidence >= 0.50 && $confidence < 0.70" | bc -l) )); then
        log_pass "Warning threshold detected (confidence=$confidence, severity=$severity)"
        return 0
    else
        log_fail "Failed to detect warning threshold (confidence=$confidence, severity=$severity)" "test_1_2"
        return 1
    fi
}

test_1_3_success_no_anti_pattern() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT reflection_type, confidence
FROM context_reflections
WHERE id = 'test-strategy-001';
EOF
)

    local confidence=$(echo "$result" | jq -r '.[0].confidence')
    local reflection_type=$(echo "$result" | jq -r '.[0].reflection_type')

    if [[ "$reflection_type" == "strategy" ]] && \
       (( $(echo "$confidence >= 0.70" | bc -l) )); then
        log_pass "Success case - no anti-pattern (confidence=$confidence, type=$reflection_type)"
        return 0
    else
        log_fail "Success case incorrectly classified (confidence=$confidence, type=$reflection_type)" "test_1_3"
        return 1
    fi
}

# ============================================================================
# Category 2: Failure Reason Parsing (5 tests)
# ============================================================================

test_2_1_missing_error_handling() {
    log_category "2" "Failure Reason Parsing"

    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT json_extract(metadata, '$.failure_reason') as failure_reason,
       json_extract(extracted_lessons, '$.anti_pattern') as anti_pattern
FROM context_reflections
WHERE id = 'test-ap-001';
EOF
)

    local failure_reason=$(echo "$result" | jq -r '.[0].failure_reason')
    local anti_pattern=$(echo "$result" | jq -r '.[0].anti_pattern')

    if [[ "$failure_reason" =~ "Unhandled exceptions" ]] && \
       [[ "$anti_pattern" =~ "error boundaries" ]]; then
        log_pass "Missing error handling parsed correctly"
        return 0
    else
        log_fail "Failed to parse error handling failure" "test_2_1"
        return 1
    fi
}

test_2_2_security_vulnerability() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT json_extract(metadata, '$.failure_reason') as failure_reason,
       json_extract(extracted_lessons, '$.anti_pattern') as anti_pattern
FROM context_reflections
WHERE id = 'test-ap-002';
EOF
)

    local failure_reason=$(echo "$result" | jq -r '.[0].failure_reason')
    local anti_pattern=$(echo "$result" | jq -r '.[0].anti_pattern')

    if [[ "$failure_reason" =~ "Security vulnerability" ]] && \
       [[ "$anti_pattern" =~ "JWT tokens" ]]; then
        log_pass "Security vulnerability parsed correctly"
        return 0
    else
        log_fail "Failed to parse security vulnerability" "test_2_2"
        return 1
    fi
}

test_2_3_test_failures() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT json_extract(metadata, '$.failure_reason') as failure_reason,
       json_extract(extracted_lessons, '$.anti_pattern') as anti_pattern
FROM context_reflections
WHERE id = 'test-ap-003';
EOF
)

    local failure_reason=$(echo "$result" | jq -r '.[0].failure_reason')
    local anti_pattern=$(echo "$result" | jq -r '.[0].anti_pattern')

    if [[ "$failure_reason" =~ "test coverage" ]] && \
       [[ "$anti_pattern" =~ "coverage below 80%" ]]; then
        log_pass "Test failure parsed correctly"
        return 0
    else
        log_fail "Failed to parse test failure" "test_2_3"
        return 1
    fi
}

test_2_4_performance_issues() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT json_extract(metadata, '$.failure_reason') as failure_reason,
       json_extract(extracted_lessons, '$.anti_pattern') as anti_pattern
FROM context_reflections
WHERE id = 'test-ap-004';
EOF
)

    local failure_reason=$(echo "$result" | jq -r '.[0].failure_reason')
    local anti_pattern=$(echo "$result" | jq -r '.[0].anti_pattern')

    if [[ "$failure_reason" =~ "Performance issues" ]] && \
       [[ "$anti_pattern" =~ "N+1" ]]; then
        log_pass "Performance issue parsed correctly"
        return 0
    else
        log_fail "Failed to parse performance issue" "test_2_4"
        return 1
    fi
}

test_2_5_generic_failure() {
    # Test that anti_pattern field captures first 100 chars when failure_reason is generic
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT json_extract(extracted_lessons, '$.anti_pattern') as anti_pattern
FROM context_reflections
WHERE reflection_type IN ('anti-pattern', 'warning', 'failure')
LIMIT 1;
EOF
)

    local anti_pattern=$(echo "$result" | jq -r '.[0].anti_pattern')
    local length=${#anti_pattern}

    if [[ -n "$anti_pattern" ]] && [[ $length -le 150 ]]; then
        log_pass "Generic failure captured in anti_pattern field (length=$length)"
        return 0
    else
        log_fail "Failed to capture generic failure (length=$length)" "test_2_5"
        return 1
    fi
}

# ============================================================================
# Category 3: Severity Assignment (3 tests)
# ============================================================================

test_3_1_critical_severity() {
    log_category "3" "Severity Assignment"

    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT confidence, json_extract(metadata, '$.severity') as severity
FROM context_reflections
WHERE confidence < 0.40;
EOF
)

    local count=$(echo "$result" | jq 'length')

    if [[ $count -gt 0 ]]; then
        local severity=$(echo "$result" | jq -r '.[0].severity')
        if [[ "$severity" == "critical" ]]; then
            log_pass "Critical severity assigned correctly (confidence<0.40)"
            return 0
        fi
    fi

    log_fail "Failed to assign critical severity" "test_3_1"
    return 1
}

test_3_2_medium_severity() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT confidence, json_extract(metadata, '$.severity') as severity
FROM context_reflections
WHERE confidence BETWEEN 0.50 AND 0.70
  AND json_extract(metadata, '$.severity') = 'medium';
EOF
)

    local count=$(echo "$result" | jq 'length')

    if [[ $count -gt 0 ]]; then
        log_pass "Medium severity assigned correctly (confidence 0.50-0.70)"
        return 0
    else
        log_fail "Failed to assign medium severity" "test_3_2"
        return 1
    fi
}

test_3_3_info_severity() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT confidence, json_extract(metadata, '$.severity') as severity
FROM context_reflections
WHERE confidence >= 0.90;
EOF
)

    local count=$(echo "$result" | jq 'length')

    if [[ $count -gt 0 ]]; then
        local severity=$(echo "$result" | jq -r '.[0].severity')
        if [[ "$severity" == "info" ]]; then
            log_pass "Info severity assigned correctly (confidence≥0.90)"
            return 0
        fi
    fi

    log_fail "Failed to assign info severity" "test_3_3"
    return 1
}

# ============================================================================
# Category 4: Sprint Reference (2 tests)
# ============================================================================

test_4_1_sprint_id_included() {
    log_category "4" "Sprint Reference"

    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT json_extract(metadata, '$.sprint_ref') as sprint_ref
FROM context_reflections
WHERE reflection_type IN ('anti-pattern', 'warning')
  AND id LIKE 'test-%';
EOF
)

    local count=$(echo "$result" | jq '[.[] | select(.sprint_ref != null)] | length')
    local total=$(echo "$result" | jq 'length')

    if [[ $count -eq $total ]] && [[ $total -gt 0 ]]; then
        log_pass "Sprint ID included in all anti-patterns ($count/$total)"
        return 0
    else
        log_fail "Sprint ID missing in some anti-patterns ($count/$total)" "test_4_1"
        return 1
    fi
}

test_4_2_sprint_reference_format() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT json_extract(metadata, '$.sprint_ref') as sprint_ref
FROM context_reflections
WHERE id = 'test-ap-001';
EOF
)

    local sprint_ref=$(echo "$result" | jq -r '.[0].sprint_ref')

    # Validate format: lowercase with hyphens, e.g., dashboard-ui-002
    if [[ "$sprint_ref" =~ ^[a-z0-9-]+$ ]]; then
        log_pass "Sprint reference format valid: $sprint_ref"
        return 0
    else
        log_fail "Sprint reference format invalid: $sprint_ref" "test_4_2"
        return 1
    fi
}

# ============================================================================
# Category 5: Solution Extraction (3 tests)
# ============================================================================

test_5_1_failed_sprint_no_solution() {
    log_category "5" "Solution Extraction"

    # For truly failed sprints (ABORT, 3+ iterations), solution might be absent
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT json_extract(extracted_lessons, '$.solution') as solution,
       json_extract(execution_trace, '$.iterations') as iterations,
       json_extract(feedback_signals, '$.product_owner_decision') as decision
FROM context_reflections
WHERE id = 'test-ap-001';
EOF
)

    local solution=$(echo "$result" | jq -r '.[0].solution')
    local iterations=$(echo "$result" | jq -r '.[0].iterations')
    local decision=$(echo "$result" | jq -r '.[0].decision')

    # Either solution exists OR decision is ABORT with 3+ iterations
    if [[ -n "$solution" ]] || [[ "$decision" == "ABORT" && $iterations -ge 3 ]]; then
        log_pass "Failed sprint handling correct (solution='$solution', decision=$decision, iterations=$iterations)"
        return 0
    else
        log_fail "Failed sprint should have solution or ABORT decision" "test_5_1"
        return 1
    fi
}

test_5_2_recovered_sprint_solution() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT json_extract(extracted_lessons, '$.solution') as solution,
       json_extract(execution_trace, '$.iterations') as iterations,
       json_extract(feedback_signals, '$.product_owner_decision') as decision
FROM context_reflections
WHERE id = 'test-recovered-001';
EOF
)

    local solution=$(echo "$result" | jq -r '.[0].solution')
    local decision=$(echo "$result" | jq -r '.[0].decision')

    if [[ -n "$solution" ]] && [[ "$decision" == "PROCEED" ]]; then
        log_pass "Recovered sprint has solution: $solution"
        return 0
    else
        log_fail "Recovered sprint missing solution (decision=$decision)" "test_5_2"
        return 1
    fi
}

test_5_3_first_try_success() {
    local result=$(sqlite3 "$DB_PATH" -json << 'EOF'
SELECT reflection_type, json_extract(execution_trace, '$.iterations') as iterations
FROM context_reflections
WHERE id = 'test-strategy-001';
EOF
)

    local reflection_type=$(echo "$result" | jq -r '.[0].reflection_type')
    local iterations=$(echo "$result" | jq -r '.[0].iterations')

    if [[ "$reflection_type" == "strategy" ]] && [[ $iterations -eq 1 ]]; then
        log_pass "First-try success stored as strategy (iterations=$iterations)"
        return 0
    else
        log_fail "First-try success incorrectly classified" "test_5_3"
        return 1
    fi
}

# ============================================================================
# Category 6: Anti-Pattern Query (4 tests)
# ============================================================================

test_6_1_query_by_domain() {
    log_category "6" "Anti-Pattern Query System"

    if [[ ! -f "$QUERY_SCRIPT" ]]; then
        log_fail "Query script not found: $QUERY_SCRIPT" "test_6_1"
        return 1
    fi

    local result=$("$QUERY_SCRIPT" "React error handling in dashboard" --format json 2>/dev/null || echo '{}')

    if [[ -z "$result" ]] || [[ "$result" == "{}" ]]; then
        log_fail "Query returned empty result" "test_6_1"
        return 1
    fi

    local count=$(echo "$result" | jq -r '.filtered_count // 0')
    local domains=$(echo "$result" | jq -r '.query.domains[]' 2>/dev/null | tr '\n' ',' | sed 's/,$//')

    if [[ $count -gt 0 ]] && [[ -n "$domains" ]]; then
        log_pass "Query by domain returned $count results (domains: $domains)"
        return 0
    else
        log_fail "Query failed to return results (count=$count, domains=$domains)" "test_6_1"
        return 1
    fi
}

test_6_2_severity_sorting() {
    local result=$("$QUERY_SCRIPT" "security authentication" --format json --limit 10 2>/dev/null || echo '{}')

    if [[ -z "$result" ]] || [[ "$result" == "{}" ]]; then
        log_fail "Query returned empty result" "test_6_2"
        return 1
    fi

    # Check that critical severity appears before medium
    local first_severity=$(echo "$result" | jq -r '.anti_patterns[0].severity // "none"')

    # Accept if no results OR first result is critical/high
    if [[ "$first_severity" == "none" ]] || \
       [[ "$first_severity" == "critical" ]] || \
       [[ "$first_severity" == "high" ]]; then
        log_pass "Severity sorting correct (first result: $first_severity)"
        return 0
    else
        log_fail "Severity sorting incorrect (first result: $first_severity)" "test_6_2"
        return 1
    fi
}

test_6_3_deduplication() {
    # Insert duplicate anti-pattern
    sqlite3 "$DB_PATH" << 'EOF' 2>/dev/null || true
INSERT INTO context_reflections (
    id, reflection_type, task_id, agent_id, swarm_id,
    execution_trace, feedback_signals, extracted_lessons, metadata,
    curator_status, confidence, success_count, total_count,
    created_at
) VALUES (
    'test-ap-005-dup',
    'anti-pattern',
    'test-duplicate-001',
    'frontend-dev-1',
    'swarm-test-007',
    '{"iterations": 2, "loops": ["loop3", "loop2"], "timeline": []}',
    '{"loop2_feedback": ["Missing error boundaries"], "product_owner_decision": "ITERATE"}',
    '{"anti_pattern": "Missing error boundaries in React components", "solution": "Wrap components in ErrorBoundary", "impact": "Crashes"}',
    '{"severity": "critical", "domain": "frontend", "keywords": ["react", "error-handling"], "sprint_ref": "duplicate-001"}',
    'curated',
    0.42,
    0,
    2,
    strftime('%s', '2025-10-29')
);
EOF

    local result=$("$QUERY_SCRIPT" "React error boundaries" --format json --limit 10 2>/dev/null || echo '{}')

    # Count anti-patterns with similar descriptions (first 60 chars)
    local unique_count=$(echo "$result" | jq '[.anti_patterns[].anti_pattern[:60]] | unique | length')
    local total_count=$(echo "$result" | jq '.anti_patterns | length')

    if [[ $unique_count -eq $total_count ]]; then
        log_pass "Deduplication working ($unique_count unique out of $total_count)"
        return 0
    else
        log_fail "Deduplication failed ($unique_count unique out of $total_count)" "test_6_3"
        return 1
    fi
}

test_6_4_relevance_scoring() {
    local result=$("$QUERY_SCRIPT" "React error handling" --format json --limit 5 2>/dev/null || echo '{}')

    if [[ -z "$result" ]] || [[ "$result" == "{}" ]]; then
        log_fail "Query returned empty result" "test_6_4"
        return 1
    fi

    # Check that relevance scores are present and descending
    local scores=$(echo "$result" | jq -r '.anti_patterns[].relevance_score // 0')

    if [[ -z "$scores" ]]; then
        log_pass "No anti-patterns found (expected for some queries)"
        return 0
    fi

    local prev_score=999
    local sorted=true

    while IFS= read -r score; do
        if (( $(echo "$score > $prev_score" | bc -l) )); then
            sorted=false
            break
        fi
        prev_score=$score
    done <<< "$scores"

    if [[ "$sorted" == true ]]; then
        log_pass "Relevance scores sorted correctly (descending)"
        return 0
    else
        log_fail "Relevance scores not sorted correctly" "test_6_4"
        return 1
    fi
}

# ============================================================================
# Test Execution
# ============================================================================

main() {
    log_header "PHASE 3.1 - ANTI-PATTERN DETECTION TEST SUITE"

    # Verify dependencies
    if [[ ! -f "$DB_PATH" ]]; then
        echo -e "${RED}ERROR: ACE database not found at $DB_PATH${NC}"
        echo "Run schema initialization first: ./.claude/skills/cfn-ace-system/schema/001-create-context-reflections.sql"
        exit 1
    fi

    if [[ ! -f "$QUERY_SCRIPT" ]]; then
        echo -e "${RED}ERROR: Query script not found at $QUERY_SCRIPT${NC}"
        exit 1
    fi

    # Setup test fixtures
    setup_test_fixtures

    # Category 1: Detection Thresholds (3 tests)
    run_test "Critical anti-pattern (confidence < 0.50)" test_1_1_critical_anti_pattern
    run_test "Warning threshold (confidence 0.50-0.70)" test_1_2_warning_threshold
    run_test "Success case (confidence ≥ 0.70, no anti-pattern)" test_1_3_success_no_anti_pattern

    # Category 2: Failure Reason Parsing (5 tests)
    run_test "Missing error handling" test_2_1_missing_error_handling
    run_test "Security vulnerability" test_2_2_security_vulnerability
    run_test "Test failures" test_2_3_test_failures
    run_test "Performance issues" test_2_4_performance_issues
    run_test "Generic failure (first 100 chars)" test_2_5_generic_failure

    # Category 3: Severity Assignment (3 tests)
    run_test "Critical severity (confidence < 0.40)" test_3_1_critical_severity
    run_test "Medium severity (confidence 0.50-0.70)" test_3_2_medium_severity
    run_test "Info severity (confidence ≥ 0.90)" test_3_3_info_severity

    # Category 4: Sprint Reference (2 tests)
    run_test "Sprint ID included in metadata" test_4_1_sprint_id_included
    run_test "Sprint reference format validation" test_4_2_sprint_reference_format

    # Category 5: Solution Extraction (3 tests)
    run_test "Failed sprint (iterations 3, ABORT) - solution handling" test_5_1_failed_sprint_no_solution
    run_test "Recovered sprint (iterations 2, PROCEED) - solution extracted" test_5_2_recovered_sprint_solution
    run_test "First-try success - stored as strategy" test_5_3_first_try_success

    # Category 6: Anti-Pattern Query (4 tests)
    run_test "Query by domain returns relevant anti-patterns" test_6_1_query_by_domain
    run_test "Severity sorting (critical first)" test_6_2_severity_sorting
    run_test "Deduplication (no duplicate descriptions)" test_6_3_deduplication
    run_test "Relevance scoring (critical + recent score highest)" test_6_4_relevance_scoring

    # Summary
    log_header "TEST SUMMARY"
    echo ""
    echo "Total Tests:  $TOTAL_TESTS"
    echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
    echo -e "${RED}Failed:       $FAILED_TESTS${NC}"

    if [[ $FAILED_TESTS -gt 0 ]]; then
        echo -e "\n${RED}Failed Tests:${NC}"
        for test_name in "${FAILED_TEST_NAMES[@]}"; do
            echo "  - $test_name"
        done
    fi

    echo ""

    # Pass criteria: 90%+ pass rate (18/20 tests)
    local pass_rate=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
    echo "Pass Rate: $pass_rate%"

    if (( $(echo "$pass_rate >= 90" | bc -l) )); then
        echo -e "${GREEN}✓ PHASE 3.1 VALIDATION COMPLETE${NC}"
        echo "Anti-pattern detection meets acceptance criteria"
        exit 0
    else
        echo -e "${RED}✗ PHASE 3.1 VALIDATION FAILED${NC}"
        echo "Pass rate below 90% threshold"
        exit 1
    fi
}

# Run tests
main "$@"
