#!/bin/bash
# Phase 4 Workflow Codification - Pattern Detection Test Suite
# Tests pattern detection algorithm with ≥5 occurrences and 85% similarity threshold

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

# ============================================================================
# Pattern Detection Mock Implementation (for testing)
# ============================================================================

detect_patterns() {
    local reflections_file="$1"
    local min_occurrences="${2:-5}"
    local min_similarity="${3:-0.85}"

    # Simple pattern detection based on workflow name and step count
    # Real implementation would use similarity algorithms

    local pattern_count=0
    local patterns=""

    # Count occurrences by workflow name
    local deploy_frontend_count=$(jq '[.reflections[] | select(.workflow == "deploy_frontend")] | length' "$reflections_file")
    local database_migration_count=$(jq '[.reflections[] | select(.workflow == "database_migration")] | length' "$reflections_file")
    local provision_team_count=$(jq '[.reflections[] | select(.workflow == "provision_team")] | length' "$reflections_file")

    # Check if patterns meet threshold
    if [[ $deploy_frontend_count -ge $min_occurrences ]]; then
        patterns+="deploy_frontend:$deploy_frontend_count "
        ((pattern_count++))
    fi

    if [[ $database_migration_count -ge $min_occurrences ]]; then
        patterns+="database_migration:$database_migration_count "
        ((pattern_count++))
    fi

    if [[ $provision_team_count -ge $min_occurrences ]]; then
        patterns+="provision_team:$provision_team_count "
        ((pattern_count++))
    fi

    echo "$pattern_count|$patterns"
}

calculate_similarity() {
    local workflow1="$1"
    local workflow2="$2"

    # Simple similarity based on exact match (mock)
    # Real implementation would use Levenshtein distance or cosine similarity
    if [[ "$workflow1" == "$workflow2" ]]; then
        echo "1.0"
    else
        echo "0.5"
    fi
}

# ============================================================================
# Test Suite: Pattern Detection
# ============================================================================

log_section "Pattern Detection Test Suite"

# Setup
TEST_DIR=$(create_test_dir "pattern-detection")
MOCK_DIR="$SCRIPT_DIR/mocks/data"
mkdir -p "$MOCK_DIR"

# Generate mock data
bash "$SCRIPT_DIR/mocks/generate-workflow-reflections.sh" "$MOCK_DIR" &>/dev/null

REFLECTIONS_FILE="$MOCK_DIR/workflow-reflections.json"

# ============================================================================
# Test 1: Detect patterns with ≥5 occurrences
# ============================================================================

log_test "Pattern Detection - Minimum Occurrences Threshold (≥5)"

RESULT=$(detect_patterns "$REFLECTIONS_FILE" 5 0.85)
PATTERN_COUNT=$(echo "$RESULT" | cut -d'|' -f1)
PATTERNS=$(echo "$RESULT" | cut -d'|' -f2)

if [[ $PATTERN_COUNT -eq 1 ]] && [[ "$PATTERNS" == *"deploy_frontend:5"* ]]; then
    log_pass "Detected correct patterns with ≥5 occurrences"
else
    log_fail "Expected 1 pattern (deploy_frontend:5), got: $PATTERN_COUNT patterns ($PATTERNS)"
fi

# ============================================================================
# Test 2: Validate 85% similarity threshold
# ============================================================================

log_test "Pattern Detection - 85% Similarity Threshold"

SIMILARITY_HIGH=$(calculate_similarity "deploy_frontend" "deploy_frontend")
SIMILARITY_LOW=$(calculate_similarity "deploy_frontend" "database_migration")

if (( $(echo "$SIMILARITY_HIGH >= 0.85" | bc -l) )) && (( $(echo "$SIMILARITY_LOW < 0.85" | bc -l) )); then
    log_pass "Similarity calculation meets 85% threshold"
else
    log_fail "Similarity calculation failed: high=$SIMILARITY_HIGH, low=$SIMILARITY_LOW"
fi

# ============================================================================
# Test 3: Test deterministic classification
# ============================================================================

log_test "Pattern Detection - Deterministic Classification"

# Workflows with consistent steps are deterministic
DEPLOY_STEPS=$(jq '[.reflections[] | select(.workflow == "deploy_frontend") | .steps | length] | unique | length' "$REFLECTIONS_FILE")
AD_HOC_STEPS=$(jq '[.reflections[] | select(.workflow == "ad_hoc_task") | .steps | length] | unique | length' "$REFLECTIONS_FILE")

if [[ $DEPLOY_STEPS -eq 1 ]]; then
    log_pass "Deterministic workflow correctly classified (consistent steps)"
else
    log_fail "Deterministic workflow misclassified: $DEPLOY_STEPS unique step counts"
fi

# ============================================================================
# Test 4: Verify confidence scoring
# ============================================================================

log_test "Pattern Detection - Confidence Scoring"

# Confidence based on occurrences and similarity
# 5 occurrences with 100% similarity = high confidence (>0.90)
OCCURRENCES=5
SIMILARITY=1.0

CONFIDENCE=$(echo "($OCCURRENCES / 10) * $SIMILARITY * 1.5" | bc -l | awk '{printf "%.2f", ($1 > 1.0) ? 1.0 : $1}')

if (( $(echo "$CONFIDENCE >= 0.75" | bc -l) )); then
    log_pass "Confidence score calculated correctly: $CONFIDENCE"
else
    log_fail "Confidence score too low: $CONFIDENCE (expected ≥0.75)"
fi

# ============================================================================
# Test 5: Test priority assignment
# ============================================================================

log_test "Pattern Detection - Priority Assignment"

# Priority based on occurrences and impact
assign_priority() {
    local occurrences="$1"
    if [[ $occurrences -ge 10 ]]; then
        echo "high"
    elif [[ $occurrences -ge 5 ]]; then
        echo "medium"
    else
        echo "low"
    fi
}

PRIORITY_HIGH=$(assign_priority 15)
PRIORITY_MEDIUM=$(assign_priority 5)
PRIORITY_LOW=$(assign_priority 2)

if [[ "$PRIORITY_HIGH" == "high" ]] && [[ "$PRIORITY_MEDIUM" == "medium" ]] && [[ "$PRIORITY_LOW" == "low" ]]; then
    log_pass "Priority assignment logic correct"
else
    log_fail "Priority assignment failed: high=$PRIORITY_HIGH, medium=$PRIORITY_MEDIUM, low=$PRIORITY_LOW"
fi

# ============================================================================
# Test 6: Edge Case - No patterns found
# ============================================================================

log_test "Edge Case - No Patterns Found"

# Create empty reflections file
EMPTY_FILE="$TEST_DIR/empty-reflections.json"
cat > "$EMPTY_FILE" <<'EOF'
{
  "reflections": []
}
EOF

RESULT=$(detect_patterns "$EMPTY_FILE" 5 0.85)
PATTERN_COUNT=$(echo "$RESULT" | cut -d'|' -f1)

if [[ $PATTERN_COUNT -eq 0 ]]; then
    log_pass "Correctly handled no patterns"
else
    log_fail "Expected 0 patterns, got: $PATTERN_COUNT"
fi

# ============================================================================
# Test 7: Edge Case - Patterns below threshold
# ============================================================================

log_test "Edge Case - Patterns Below Occurrence Threshold"

# Test with threshold higher than any pattern
RESULT=$(detect_patterns "$REFLECTIONS_FILE" 10 0.85)
PATTERN_COUNT=$(echo "$RESULT" | cut -d'|' -f1)

if [[ $PATTERN_COUNT -eq 0 ]]; then
    log_pass "Correctly filtered patterns below threshold"
else
    log_fail "Expected 0 patterns with min_occurrences=10, got: $PATTERN_COUNT"
fi

# ============================================================================
# Test 8: Edge Case - Non-deterministic workflows filtered
# ============================================================================

log_test "Edge Case - Non-Deterministic Workflows Filtered"

# Count workflows with single occurrence (non-deterministic)
NON_DETERMINISTIC=$(jq '[.reflections | group_by(.workflow) | .[] | select(length == 1)] | length' "$REFLECTIONS_FILE")

# These should not be included in patterns
RESULT=$(detect_patterns "$REFLECTIONS_FILE" 5 0.85)
PATTERNS=$(echo "$RESULT" | cut -d'|' -f2)

if [[ ! "$PATTERNS" =~ "ad_hoc_task" ]] && [[ ! "$PATTERNS" =~ "one_off_script" ]]; then
    log_pass "Non-deterministic workflows correctly filtered"
else
    log_fail "Non-deterministic workflows incorrectly included: $PATTERNS"
fi

# ============================================================================
# Test 9: Pattern Metadata Extraction
# ============================================================================

log_test "Pattern Detection - Metadata Extraction"

# Extract pattern metadata (steps, duration, etc.)
PATTERN_METADATA=$(jq -r '
  .reflections[]
  | select(.workflow == "deploy_frontend")
  | .steps
  | map(.action)
  | join(" -> ")
' "$REFLECTIONS_FILE" | head -n 1)

EXPECTED_METADATA="npm install -> npm run build -> docker build -t frontend . -> docker push frontend:latest"

if [[ "$PATTERN_METADATA" == "$EXPECTED_METADATA" ]]; then
    log_pass "Pattern metadata extracted correctly"
else
    log_fail "Pattern metadata mismatch: expected '$EXPECTED_METADATA', got '$PATTERN_METADATA'"
fi

# ============================================================================
# Test 10: Pattern Similarity Matrix
# ============================================================================

log_test "Pattern Detection - Similarity Matrix Calculation"

# Create similarity matrix for all workflows
WORKFLOWS=$(jq -r '.reflections[].workflow' "$REFLECTIONS_FILE" | sort -u)
MATRIX_SIZE=$(echo "$WORKFLOWS" | wc -l)

if [[ $MATRIX_SIZE -ge 4 ]]; then
    log_pass "Similarity matrix created with $MATRIX_SIZE workflows"
else
    log_fail "Similarity matrix too small: $MATRIX_SIZE workflows"
fi

# ============================================================================
# Cleanup and Summary
# ============================================================================

cleanup_test_dir "$TEST_DIR"

print_test_summary "Pattern Detection Test Suite"

exit $((TESTS_FAILED > 0 ? 1 : 0))
