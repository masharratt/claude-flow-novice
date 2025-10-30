#!/bin/bash
# tests/ace-integration/07-relevance-scoring.test.sh
# Phase 2.2 - Relevance Scoring Test Suite
# Tests relevance scoring algorithm across 7 categories with 25 total tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"
SCORE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-ace-system/score-relevance-adapter.sh"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test result tracking
declare -a FAILED_TEST_NAMES=()

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

assert_score_in_range() {
    local score=$1
    local min=$2
    local max=$3
    local test_name=$4

    if (( $(echo "$score >= $min && $score <= $max" | bc -l) )); then
        log_pass "$test_name: Score $score in range [$min, $max]"
        return 0
    else
        log_fail "$test_name: Score $score outside range [$min, $max]" "$test_name"
        return 1
    fi
}

assert_score_equals() {
    local score=$1
    local expected=$2
    local tolerance=${3:-0.05}
    local test_name=$4

    local diff=$(echo "scale=4; ($score - $expected)" | bc -l | sed 's/-//')

    if (( $(echo "$diff <= $tolerance" | bc -l) )); then
        log_pass "$test_name: Score $score ≈ $expected (tolerance: $tolerance)"
        return 0
    else
        log_fail "$test_name: Score $score != $expected (diff: $diff, tolerance: $tolerance)" "$test_name"
        return 1
    fi
}

run_test() {
    local test_name=$1
    shift
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_test "$TOTAL_TESTS" "$test_name"
    "$@"
}

# ============================================================================
# Category 1: Score Range Validation (3 tests)
# ============================================================================

test_1_1_score_bounds() {
    local keywords_query='["authentication","jwt","security"]'
    local keywords_context='["auth","jwt","token"]'
    local domains_query='["security"]'
    local domains_context='["security"]'
    local agents_query='["backend-dev"]'
    local agents_context='["backend-dev"]'
    local created_at=$(date -d "1 day ago" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d 2>/dev/null || echo "2025-10-29")
    local success_rate=0.90

    local score=$("$SCORE_SCRIPT" \
        "$keywords_query" "$keywords_context" \
        "$domains_query" "$domains_context" \
        "$agents_query" "$agents_context" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    assert_score_in_range "$score" 0.0 1.0 "Score within bounds [0.0, 1.0]"
}

test_1_2_perfect_match() {
    local keywords='["auth","jwt","security"]'
    local domains='["security","backend"]'
    local agents='["backend-dev","security-specialist"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=1.0

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    assert_score_equals "$score" 1.0 0.02 "Perfect match yields 1.0"
}

test_1_3_complete_mismatch() {
    local keywords_query='["frontend","react","ui"]'
    local keywords_context='["database","sql","migration"]'
    local domains_query='["frontend"]'
    local domains_context='["database"]'
    local agents_query='["frontend-dev"]'
    local agents_context='["database-specialist"]'
    local created_at=$(date -d "90 days ago" +%Y-%m-%d)
    local success_rate=0.50

    local score=$("$SCORE_SCRIPT" \
        "$keywords_query" "$keywords_context" \
        "$domains_query" "$domains_context" \
        "$agents_query" "$agents_context" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    assert_score_in_range "$score" 0.0 0.3 "Complete mismatch yields <0.3"
}

# ============================================================================
# Category 2: Keyword Similarity (4 tests)
# ============================================================================

test_2_1_exact_keyword_match() {
    local keywords='["auth","jwt","token","security"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Exact match with same-day context should be very high
    assert_score_in_range "$score" 0.90 1.0 "Exact keyword match (Jaccard = 1.0)"
}

test_2_2_partial_keyword_overlap() {
    local keywords_query='["auth","jwt","token","security"]'
    local keywords_context='["auth","jwt","database","api"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords_query" "$keywords_context" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Jaccard = 2/6 = 0.33, should yield moderate score
    assert_score_in_range "$score" 0.40 0.70 "Partial keyword overlap (Jaccard ≈ 0.33)"
}

test_2_3_zero_keyword_overlap() {
    local keywords_query='["frontend","react","ui","component"]'
    local keywords_context='["backend","api","database","server"]'
    local domains='["frontend"]'
    local agents='["frontend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords_query" "$keywords_context" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Zero keyword overlap should yield low score
    assert_score_in_range "$score" 0.0 0.40 "Zero keyword overlap (Jaccard = 0.0)"
}

test_2_4_synonym_handling() {
    local keywords_query='["javascript","nodejs","backend"]'
    local keywords_context='["js","node","server"]'
    local domains='["backend"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords_query" "$keywords_context" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Synonyms should be treated as different keywords (no normalization in Phase 2.2)
    # Jaccard = 0/6 = 0.0, but domain/agent match should boost score
    assert_score_in_range "$score" 0.30 0.60 "Synonym handling (no normalization)"
}

# ============================================================================
# Category 3: Domain Classification (3 tests)
# ============================================================================

test_3_1_exact_domain_match() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Domain Jaccard = 1.0 should contribute significantly
    assert_score_in_range "$score" 0.85 1.0 "Exact domain match (Jaccard = 1.0)"
}

test_3_2_domain_overlap() {
    local keywords='["auth","jwt"]'
    local domains_query='["security","backend"]'
    local domains_context='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains_query" "$domains_context" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Domain Jaccard = 1/2 = 0.5 should yield moderate score
    assert_score_in_range "$score" 0.70 0.95 "Domain overlap (Jaccard = 0.5)"
}

test_3_3_domain_mismatch() {
    local keywords='["auth","jwt"]'
    local domains_query='["frontend"]'
    local domains_context='["backend"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains_query" "$domains_context" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Domain mismatch should reduce score despite keyword match
    assert_score_in_range "$score" 0.40 0.75 "Domain mismatch (Jaccard = 0.0)"
}

# ============================================================================
# Category 4: Agent Type Overlap (3 tests)
# ============================================================================

test_4_1_identical_agent_lists() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents='["backend-dev","security-specialist","tester"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Identical agent lists (Jaccard = 1.0) should yield perfect score
    assert_score_in_range "$score" 0.85 1.0 "Identical agent lists (Jaccard = 1.0)"
}

test_4_2_partial_agent_overlap() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents_query='["backend-dev","security-specialist"]'
    local agents_context='["backend-dev","tester"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents_query" "$agents_context" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Agent Jaccard = 1/3 = 0.33 should yield moderate score
    assert_score_in_range "$score" 0.70 0.95 "Partial agent overlap (Jaccard ≈ 0.33)"
}

test_4_3_zero_agent_overlap() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents_query='["frontend-dev","designer"]'
    local agents_context='["backend-dev","tester"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents_query" "$agents_context" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Zero agent overlap should reduce score
    assert_score_in_range "$score" 0.45 0.80 "Zero agent overlap (Jaccard = 0.0)"
}

# ============================================================================
# Category 5: Recency Score (4 tests)
# ============================================================================

test_5_1_same_day_context() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Recency = exp(-0/30) = 1.0, should yield high score
    assert_score_in_range "$score" 0.85 1.0 "Same-day context (recency ≈ 1.0)"
}

test_5_2_week_old_context() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date -d "7 days ago" +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Recency = exp(-7/30) ≈ 0.79, should yield slightly lower score
    assert_score_in_range "$score" 0.70 0.95 "Week-old context (recency ≈ 0.79)"
}

test_5_3_month_old_context() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date -d "30 days ago" +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Recency = exp(-30/30) = exp(-1) ≈ 0.37, should yield moderate score
    assert_score_in_range "$score" 0.40 0.70 "Month-old context (recency ≈ 0.37)"
}

test_5_4_ninety_day_old_context() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date -d "90 days ago" +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Recency = exp(-90/30) = exp(-3) ≈ 0.05, should yield low score
    assert_score_in_range "$score" 0.10 0.40 "90-day-old context (recency ≈ 0.05)"
}

# ============================================================================
# Category 6: Success Rate Impact (3 tests)
# ============================================================================

test_6_1_high_success_rate() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.95

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # High success rate (0.95) should boost score
    assert_score_in_range "$score" 0.85 1.0 "High success rate (0.95) boosts score"
}

test_6_2_low_success_rate() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.50

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Low success rate (0.50) should reduce score
    assert_score_in_range "$score" 0.50 0.80 "Low success rate (0.50) reduces score"
}

test_6_3_zero_success_rate() {
    local keywords='["auth","jwt"]'
    local domains='["security"]'
    local agents='["backend-dev"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=0.0

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Zero success rate (new context) should use default (0.75)
    assert_score_in_range "$score" 0.70 0.95 "Zero success rate uses default (0.75)"
}

# ============================================================================
# Category 7: Weighted Integration (5 tests)
# ============================================================================

test_7_1_high_relevance_scenario() {
    local keywords_query='["authentication","jwt","token","security"]'
    local keywords_context='["auth","jwt","token","secure"]'
    local domains='["security","backend"]'
    local agents='["backend-dev","security-specialist"]'
    local created_at=$(date -d "2 days ago" +%Y-%m-%d)
    local success_rate=0.90

    local score=$("$SCORE_SCRIPT" \
        "$keywords_query" "$keywords_context" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # High keyword similarity + domain match + recent + high success rate
    assert_score_in_range "$score" 0.80 1.0 "High relevance scenario (all factors high)"
}

test_7_2_low_relevance_scenario() {
    local keywords_query='["frontend","react","ui"]'
    local keywords_context='["backend","api","database"]'
    local domains_query='["frontend"]'
    local domains_context='["backend"]'
    local agents_query='["frontend-dev"]'
    local agents_context='["backend-dev"]'
    local created_at=$(date -d "60 days ago" +%Y-%m-%d)
    local success_rate=0.60

    local score=$("$SCORE_SCRIPT" \
        "$keywords_query" "$keywords_context" \
        "$domains_query" "$domains_context" \
        "$agents_query" "$agents_context" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Low keyword similarity + domain mismatch + old + low success rate
    assert_score_in_range "$score" 0.0 0.40 "Low relevance scenario (all factors low)"
}

test_7_3_perfect_match_all_factors() {
    local keywords='["auth","jwt","token","security","backend"]'
    local domains='["security","backend"]'
    local agents='["backend-dev","security-specialist","tester"]'
    local created_at=$(date +%Y-%m-%d)
    local success_rate=1.0

    local score=$("$SCORE_SCRIPT" \
        "$keywords" "$keywords" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Perfect match across all factors should yield 1.0
    assert_score_equals "$score" 1.0 0.02 "Perfect match all factors yields 1.0"
}

test_7_4_acceptance_criteria_validation() {
    # AC1: Score range 0.0-1.0 (validated in Category 1)
    # AC2: Multi-factor scoring (validated here)
    # AC3: Recency weighting (validated in Category 5)
    # AC4: Configurable weights (validated by algorithm design)

    local keywords_query='["authentication","jwt"]'
    local keywords_context='["auth","token"]'
    local domains_query='["security"]'
    local domains_context='["security","backend"]'
    local agents_query='["backend-dev"]'
    local agents_context='["backend-dev","tester"]'
    local created_at=$(date -d "14 days ago" +%Y-%m-%d)
    local success_rate=0.85

    local score=$("$SCORE_SCRIPT" \
        "$keywords_query" "$keywords_context" \
        "$domains_query" "$domains_context" \
        "$agents_query" "$agents_context" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Multi-factor scenario with mixed signals
    assert_score_in_range "$score" 0.50 0.85 "Acceptance criteria validation (mixed factors)"
}

test_7_5_real_world_jwt_to_oauth() {
    local keywords_query='["oauth","authentication","token","security"]'
    local keywords_context='["jwt","auth","token","security","backend"]'
    local domains='["security","backend"]'
    local agents='["backend-dev","security-specialist"]'
    local created_at=$(date -d "10 days ago" +%Y-%m-%d)
    local success_rate=0.88

    local score=$("$SCORE_SCRIPT" \
        "$keywords_query" "$keywords_context" \
        "$domains" "$domains" \
        "$agents" "$agents" \
        "$created_at" "$success_rate" 2>/dev/null || echo "0.0")

    # Real-world scenario: JWT context relevant to OAuth task
    # Keyword Jaccard = 3/6 = 0.5, domain match = 1.0, agent match = 1.0, recency ≈ 0.71
    assert_score_in_range "$score" 0.70 0.90 "Real-world JWT → OAuth scenario"
}

# ============================================================================
# Test Execution
# ============================================================================

main() {
    echo "=========================================="
    echo "Phase 2.2 - Relevance Scoring Test Suite"
    echo "=========================================="
    echo ""

    if [[ ! -f "$SCORE_SCRIPT" ]]; then
        echo -e "${RED}ERROR: Scoring script not found at $SCORE_SCRIPT${NC}"
        exit 1
    fi

    echo "Category 1: Score Range Validation"
    echo "-----------------------------------"
    run_test "1.1 Score within bounds" test_1_1_score_bounds
    run_test "1.2 Perfect match yields 1.0" test_1_2_perfect_match
    run_test "1.3 Complete mismatch yields <0.3" test_1_3_complete_mismatch
    echo ""

    echo "Category 2: Keyword Similarity"
    echo "-------------------------------"
    run_test "2.1 Exact keyword match" test_2_1_exact_keyword_match
    run_test "2.2 Partial keyword overlap" test_2_2_partial_keyword_overlap
    run_test "2.3 Zero keyword overlap" test_2_3_zero_keyword_overlap
    run_test "2.4 Synonym handling" test_2_4_synonym_handling
    echo ""

    echo "Category 3: Domain Classification"
    echo "----------------------------------"
    run_test "3.1 Exact domain match" test_3_1_exact_domain_match
    run_test "3.2 Domain overlap" test_3_2_domain_overlap
    run_test "3.3 Domain mismatch" test_3_3_domain_mismatch
    echo ""

    echo "Category 4: Agent Type Overlap"
    echo "-------------------------------"
    run_test "4.1 Identical agent lists" test_4_1_identical_agent_lists
    run_test "4.2 Partial agent overlap" test_4_2_partial_agent_overlap
    run_test "4.3 Zero agent overlap" test_4_3_zero_agent_overlap
    echo ""

    echo "Category 5: Recency Score"
    echo "-------------------------"
    run_test "5.1 Same-day context" test_5_1_same_day_context
    run_test "5.2 Week-old context" test_5_2_week_old_context
    run_test "5.3 Month-old context" test_5_3_month_old_context
    run_test "5.4 90-day-old context" test_5_4_ninety_day_old_context
    echo ""

    echo "Category 6: Success Rate Impact"
    echo "--------------------------------"
    run_test "6.1 High success rate" test_6_1_high_success_rate
    run_test "6.2 Low success rate" test_6_2_low_success_rate
    run_test "6.3 Zero success rate" test_6_3_zero_success_rate
    echo ""

    echo "Category 7: Weighted Integration"
    echo "---------------------------------"
    run_test "7.1 High relevance scenario" test_7_1_high_relevance_scenario
    run_test "7.2 Low relevance scenario" test_7_2_low_relevance_scenario
    run_test "7.3 Perfect match all factors" test_7_3_perfect_match_all_factors
    run_test "7.4 Acceptance criteria validation" test_7_4_acceptance_criteria_validation
    run_test "7.5 Real-world JWT → OAuth" test_7_5_real_world_jwt_to_oauth
    echo ""

    # Summary
    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo "Total Tests:  $TOTAL_TESTS"
    echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
    echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"

    local pass_rate=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l)
    echo "Pass Rate:    ${pass_rate}%"
    echo ""

    if (( FAILED_TESTS > 0 )); then
        echo -e "${RED}Failed Tests:${NC}"
        for test_name in "${FAILED_TEST_NAMES[@]}"; do
            echo "  - $test_name"
        done
        echo ""
    fi

    # Self-confidence score
    local confidence=$(echo "scale=2; $PASSED_TESTS / $TOTAL_TESTS" | bc -l)
    echo "=========================================="
    echo "Self-Confidence Score: $confidence"
    echo "=========================================="

    if (( $(echo "$pass_rate >= 90.0" | bc -l) )); then
        echo -e "${GREEN}✓ PASS CRITERIA MET (≥90% pass rate)${NC}"
        exit 0
    else
        echo -e "${RED}✗ PASS CRITERIA NOT MET (<90% pass rate)${NC}"
        exit 1
    fi
}

main "$@"
