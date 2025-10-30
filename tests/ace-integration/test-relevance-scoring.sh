#!/usr/bin/env bash
# test-relevance-scoring.sh - Validation tests for ACE relevance scoring
# Part of ACE System Phase 2.2 validation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/../.."
SCORE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-ace-system/score-relevance.sh"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test result tracking
declare -a FAILED_TESTS

# Helper function to run test
run_test() {
    local test_name="$1"
    local expected_min="$2"
    local expected_max="$3"
    shift 3
    local cmd=("$@")

    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "\n${YELLOW}Test $TESTS_RUN: $test_name${NC}"

    # Run command and capture output
    local result
    result=$("${cmd[@]}" 2>&1) || {
        echo -e "${RED}FAILED: Command execution error${NC}"
        echo "Output: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        FAILED_TESTS+=("$test_name")
        return 1
    }

    echo "Result: $result"
    echo "Expected range: $expected_min - $expected_max"

    # Validate result is numeric
    if ! [[ "$result" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        echo -e "${RED}FAILED: Result is not numeric${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        FAILED_TESTS+=("$test_name")
        return 1
    fi

    # Check if result is within expected range
    if (( $(echo "$result >= $expected_min && $result <= $expected_max" | bc -l) )); then
        echo -e "${GREEN}PASSED${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}FAILED: Score outside expected range${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        FAILED_TESTS+=("$test_name")
        return 1
    fi
}

# Print test summary
print_summary() {
    echo -e "\n========================================="
    echo "Test Summary"
    echo "========================================="
    echo "Tests Run:    $TESTS_RUN"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "\n${RED}Failed Tests:${NC}"
        printf '%s\n' "${FAILED_TESTS[@]}"
        exit 1
    else
        echo -e "\n${GREEN}All tests passed!${NC}"
        exit 0
    fi
}

echo "========================================="
echo "ACE Relevance Scoring Validation Suite"
echo "========================================="

# Test 1: Exact match - same tags, domain, agents, recent timestamp, high confidence
# Expected: Very high score (0.85-1.0)
run_test \
    "Exact match (same tags/domain/agents/recent/high confidence)" \
    0.85 1.0 \
    "$SCORE_SCRIPT" \
    --current-tags '["backend","authentication","jwt"]' \
    --current-domain "security" \
    --current-agents "backend-dev,security-specialist" \
    --historical-record '{"tags":["backend","authentication","jwt"],"domain":"security","agents":"backend-dev,security-specialist","timestamp":"2025-10-29","confidence":0.95}'

# Test 2: High overlap - similar tags, same domain, different agents
# Expected: Medium-high score (0.60-0.80)
run_test \
    "High overlap (similar tags/same domain/different agents)" \
    0.60 0.80 \
    "$SCORE_SCRIPT" \
    --current-tags '["backend","authentication","jwt"]' \
    --current-domain "security" \
    --current-agents "backend-dev,security-specialist" \
    --historical-record '{"tags":["backend","auth","oauth"],"domain":"security","agents":"backend-dev","timestamp":"2025-10-25","confidence":0.92}'

# Test 3: Recency test - same tags/domain but old timestamp
# Expected: High score (0.80-0.95) - recency only 15% weight
run_test \
    "Recency penalty (same tags/domain but 60 days old)" \
    0.80 0.95 \
    "$SCORE_SCRIPT" \
    --current-tags '["backend","authentication","jwt"]' \
    --current-domain "security" \
    --current-agents "backend-dev,security-specialist" \
    --historical-record '{"tags":["backend","authentication","jwt"],"domain":"security","agents":"backend-dev,security-specialist","timestamp":"2025-08-30","confidence":0.90}'

# Test 4: Domain mismatch - similar tags but completely different domain
# Expected: Low-medium score (0.30-0.55) due to domain penalty
run_test \
    "Domain mismatch (similar tags/different domain)" \
    0.30 0.55 \
    "$SCORE_SCRIPT" \
    --current-tags '["backend","authentication","jwt"]' \
    --current-domain "security" \
    --current-agents "backend-dev,security-specialist" \
    --historical-record '{"tags":["backend","authentication","session"],"domain":"frontend","agents":"backend-dev","timestamp":"2025-10-28","confidence":0.85}'

# Test 5: Low success rate - similar context but low confidence
# Expected: Medium-high score (0.75-0.85) - success only 10% weight
run_test \
    "Low success rate (similar context/low confidence)" \
    0.75 0.85 \
    "$SCORE_SCRIPT" \
    --current-tags '["backend","authentication","jwt"]' \
    --current-domain "security" \
    --current-agents "backend-dev,security-specialist" \
    --historical-record '{"tags":["backend","auth","jwt"],"domain":"security","agents":"backend-dev,security-specialist","timestamp":"2025-10-27","confidence":0.50}'

# Test 6: No overlap - completely different tags/domain/agents
# Expected: Very low score (0.0-0.15)
run_test \
    "No overlap (completely different context)" \
    0.0 0.15 \
    "$SCORE_SCRIPT" \
    --current-tags '["backend","authentication","jwt"]' \
    --current-domain "security" \
    --current-agents "backend-dev,security-specialist" \
    --historical-record '{"tags":["frontend","ui","react"],"domain":"presentation","agents":"frontend-dev","timestamp":"2025-09-15","confidence":0.80}'

# Test 7: Partial domain match - substring overlap
# Expected: Medium score (0.45-0.65)
run_test \
    "Partial domain match (substring overlap)" \
    0.45 0.65 \
    "$SCORE_SCRIPT" \
    --current-tags '["backend","api","rest"]' \
    --current-domain "backend-api" \
    --current-agents "backend-dev" \
    --historical-record '{"tags":["backend","endpoint","http"],"domain":"backend","agents":"backend-dev","timestamp":"2025-10-25","confidence":0.88}'

# Test 8: Edge case - empty historical tags
# Expected: Medium score (0.60-0.75) - domain/agent still match
run_test \
    "Empty historical tags" \
    0.60 0.75 \
    "$SCORE_SCRIPT" \
    --current-tags '["backend","authentication","jwt"]' \
    --current-domain "security" \
    --current-agents "backend-dev" \
    --historical-record '{"tags":[],"domain":"security","agents":"backend-dev","timestamp":"2025-10-28","confidence":0.90}'

# Print summary
print_summary
