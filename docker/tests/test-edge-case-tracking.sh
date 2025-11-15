#!/bin/bash
# Phase 4 Workflow Codification - Edge Case Tracking Test Suite
# Tests edge case capture, recurring detection, and resolution workflow

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

# ============================================================================
# Edge Case Tracking Implementation (for testing)
# ============================================================================

EDGE_CASE_DB="$TEST_DIR/edge-cases.json"

init_edge_case_db() {
    cat > "$EDGE_CASE_DB" <<'EOF'
{
  "edge_cases": []
}
EOF
}

capture_execution_failure() {
    local skill_id="$1"
    local error_type="$2"
    local error_message="$3"
    local severity="${4:-medium}"

    local case_id="edge-$(random_string 8)"
    local timestamp=$(iso_timestamp)

    # Check for duplicates
    local existing=$(jq --arg skill "$skill_id" --arg err_type "$error_type" --arg err_msg "$error_message" \
        '.edge_cases[] | select(.skill_id == $skill and .error_type == $err_type and .error_message == $err_msg) | .case_id' \
        "$EDGE_CASE_DB" | head -n 1)

    if [[ -n "$existing" ]]; then
        # Increment occurrence count
        local temp=$(mktemp)
        jq --arg id "$existing" --arg timestamp "$timestamp" \
            '(.edge_cases[] | select(.case_id == $id) | .occurrences) += 1 |
             (.edge_cases[] | select(.case_id == $id) | .last_seen) = $timestamp' \
            "$EDGE_CASE_DB" > "$temp"
        mv "$temp" "$EDGE_CASE_DB"
        echo "$existing"
    else
        # Create new edge case
        local temp=$(mktemp)
        jq --arg id "$case_id" \
           --arg skill "$skill_id" \
           --arg err_type "$error_type" \
           --arg err_msg "$error_message" \
           --arg severity "$severity" \
           --arg timestamp "$timestamp" \
           '.edge_cases += [{
              "case_id": $id,
              "skill_id": $skill,
              "error_type": $err_type,
              "error_message": $err_msg,
              "severity": $severity,
              "occurrences": 1,
              "first_seen": $timestamp,
              "last_seen": $timestamp,
              "resolved": false
           }]' "$EDGE_CASE_DB" > "$temp"
        mv "$temp" "$EDGE_CASE_DB"
        echo "$case_id"
    fi
}

detect_recurring() {
    local threshold="${1:-3}"

    jq --arg threshold "$threshold" \
        '.edge_cases[] | select(.occurrences >= ($threshold | tonumber) and .resolved == false)' \
        "$EDGE_CASE_DB"
}

generate_update_proposal() {
    local case_id="$1"

    local edge_case=$(jq --arg id "$case_id" '.edge_cases[] | select(.case_id == $id)' "$EDGE_CASE_DB")

    if [[ -z "$edge_case" ]]; then
        echo "not_found"
        return 1
    fi

    local skill_id=$(echo "$edge_case" | jq -r '.skill_id')
    local error_type=$(echo "$edge_case" | jq -r '.error_type')
    local occurrences=$(echo "$edge_case" | jq -r '.occurrences')

    cat <<EOF
{
  "proposal_id": "proposal-$(random_string 8)",
  "case_id": "$case_id",
  "skill_id": "$skill_id",
  "proposed_changes": "Add retry logic for $error_type errors",
  "justification": "Error occurred $occurrences times, needs handling",
  "priority": "high"
}
EOF
}

resolve_edge_case() {
    local case_id="$1"
    local resolution_notes="$2"

    local temp=$(mktemp)
    jq --arg id "$case_id" --arg notes "$resolution_notes" --arg timestamp "$(iso_timestamp)" \
        '(.edge_cases[] | select(.case_id == $id) | .resolved) = true |
         (.edge_cases[] | select(.case_id == $id) | .resolved_at) = $timestamp |
         (.edge_cases[] | select(.case_id == $id) | .resolution_notes) = $notes' \
        "$EDGE_CASE_DB" > "$temp"
    mv "$temp" "$EDGE_CASE_DB"
}

classify_severity() {
    local error_type="$1"
    local occurrences="$2"

    if [[ "$error_type" == "security" ]]; then
        echo "critical"
    elif [[ "$error_type" == "timeout" ]] && [[ $occurrences -ge 5 ]]; then
        echo "high"
    elif [[ $occurrences -ge 10 ]]; then
        echo "high"
    elif [[ $occurrences -ge 3 ]]; then
        echo "medium"
    else
        echo "low"
    fi
}

# ============================================================================
# Test Suite: Edge Case Tracking
# ============================================================================

log_section "Edge Case Tracking Test Suite"

# Setup
TEST_DIR=$(create_test_dir "edge-case-tracking")
init_edge_case_db

# ============================================================================
# Test 1: Capture Execution Failures
# ============================================================================

log_test "Edge Case Tracking - Capture Execution Failures"

CASE_ID=$(capture_execution_failure "skill-deploy" "timeout" "Docker build timeout after 300s" "medium")

if [[ "$CASE_ID" =~ ^edge- ]]; then
    log_pass "Execution failure captured successfully: $CASE_ID"
else
    log_fail "Failed to capture execution failure: $CASE_ID"
fi

# ============================================================================
# Test 2: Recurring Detection (≥3 occurrences)
# ============================================================================

log_test "Edge Case Tracking - Recurring Detection (≥3)"

# Create recurring failure
capture_execution_failure "skill-deploy" "network_error" "Connection refused" "medium" &>/dev/null
CASE2=$(capture_execution_failure "skill-deploy" "network_error" "Connection refused" "medium")
capture_execution_failure "skill-deploy" "network_error" "Connection refused" "medium" &>/dev/null

OCCURRENCES=$(jq --arg id "$CASE2" '.edge_cases[] | select(.case_id == $id) | .occurrences' "$EDGE_CASE_DB")

if [[ $OCCURRENCES -eq 3 ]]; then
    log_pass "Recurring failure detected correctly (3 occurrences)"
else
    log_fail "Incorrect occurrence count: $OCCURRENCES (expected 3)"
fi

# ============================================================================
# Test 3: Update Proposal Generation
# ============================================================================

log_test "Edge Case Tracking - Update Proposal Generation"

PROPOSAL=$(generate_update_proposal "$CASE2")

if echo "$PROPOSAL" | jq -e '.proposal_id' &>/dev/null; then
    log_pass "Update proposal generated successfully"
else
    log_fail "Update proposal generation failed: $PROPOSAL"
fi

# ============================================================================
# Test 4: Resolution Workflow
# ============================================================================

log_test "Edge Case Tracking - Resolution Workflow"

resolve_edge_case "$CASE2" "Added retry logic for network errors"

RESOLVED=$(jq --arg id "$CASE2" '.edge_cases[] | select(.case_id == $id) | .resolved' "$EDGE_CASE_DB")

if [[ "$RESOLVED" == "true" ]]; then
    log_pass "Edge case resolution workflow works correctly"
else
    log_fail "Edge case resolution failed: $RESOLVED"
fi

# ============================================================================
# Test 5: Severity Classification
# ============================================================================

log_test "Edge Case Tracking - Severity Classification"

CRITICAL=$(classify_severity "security" 1)
HIGH=$(classify_severity "timeout" 5)
MEDIUM=$(classify_severity "validation" 3)
LOW=$(classify_severity "warning" 1)

if [[ "$CRITICAL" == "critical" ]] && [[ "$HIGH" == "high" ]] && [[ "$MEDIUM" == "medium" ]] && [[ "$LOW" == "low" ]]; then
    log_pass "Severity classification correct"
else
    log_fail "Severity classification failed: critical=$CRITICAL, high=$HIGH, medium=$MEDIUM, low=$LOW"
fi

# ============================================================================
# Test 6: Edge Case - Deduplication
# ============================================================================

log_test "Edge Case - Deduplication of Identical Failures"

# Report same error multiple times
CASE3=$(capture_execution_failure "skill-test" "parse_error" "Invalid JSON" "low")
CASE3_DUP=$(capture_execution_failure "skill-test" "parse_error" "Invalid JSON" "low")

# Should return same case ID (deduplicated)
if [[ "$CASE3" == "$CASE3_DUP" ]]; then
    log_pass "Deduplication works correctly (same case ID returned)"
else
    log_fail "Deduplication failed: $CASE3 != $CASE3_DUP"
fi

# ============================================================================
# Test 7: Edge Case - Resolved Edge Cases Handling
# ============================================================================

log_test "Edge Case - Resolved Edge Cases Excluded from Recurring Detection"

RECURRING=$(detect_recurring 3)
RECURRING_COUNT=$(echo "$RECURRING" | jq -s 'length')

# CASE2 was resolved, should not appear in recurring list
CASE2_IN_RECURRING=$(echo "$RECURRING" | jq -r --arg id "$CASE2" 'select(.case_id == $id) | .case_id')

if [[ -z "$CASE2_IN_RECURRING" ]]; then
    log_pass "Resolved edge cases correctly excluded from recurring detection"
else
    log_fail "Resolved edge case incorrectly included in recurring list"
fi

# ============================================================================
# Test 8: Edge Case - High-Frequency Failures
# ============================================================================

log_test "Edge Case - High-Frequency Failure Detection"

# Create high-frequency failure (>10 occurrences)
CASE_HF="edge-highfreq"
for i in {1..12}; do
    capture_execution_failure "skill-critical" "memory_leak" "Out of memory" "high" &>/dev/null
done

HF_OCCURRENCES=$(jq '.edge_cases[] | select(.error_type == "memory_leak") | .occurrences' "$EDGE_CASE_DB")

if [[ $HF_OCCURRENCES -ge 10 ]]; then
    # Check if severity escalated
    HF_SEVERITY=$(classify_severity "memory_leak" "$HF_OCCURRENCES")
    if [[ "$HF_SEVERITY" == "high" ]]; then
        log_pass "High-frequency failure detected and escalated ($HF_OCCURRENCES occurrences)"
    else
        log_fail "High-frequency failure not escalated: severity=$HF_SEVERITY"
    fi
else
    log_fail "High-frequency failure count incorrect: $HF_OCCURRENCES"
fi

# ============================================================================
# Test 9: Edge Case Metadata Completeness
# ============================================================================

log_test "Edge Case - Metadata Completeness"

FIRST_CASE=$(jq '.edge_cases[0]' "$EDGE_CASE_DB")

REQUIRED_FIELDS=("case_id" "skill_id" "error_type" "error_message" "severity" "occurrences" "first_seen" "last_seen" "resolved")
MISSING_FIELDS=()

for field in "${REQUIRED_FIELDS[@]}"; do
    if ! echo "$FIRST_CASE" | jq -e ".$field" &>/dev/null; then
        MISSING_FIELDS+=("$field")
    fi
done

if [[ ${#MISSING_FIELDS[@]} -eq 0 ]]; then
    log_pass "Edge case metadata complete (all required fields present)"
else
    log_fail "Missing metadata fields: ${MISSING_FIELDS[*]}"
fi

# ============================================================================
# Test 10: Recurring Detection Threshold Tuning
# ============================================================================

log_test "Edge Case - Recurring Detection Threshold Tuning"

# Test different thresholds
RECURRING_3=$(detect_recurring 3 | jq -s 'length')
RECURRING_5=$(detect_recurring 5 | jq -s 'length')
RECURRING_10=$(detect_recurring 10 | jq -s 'length')

# Higher threshold should return fewer or equal results
if [[ $RECURRING_3 -ge $RECURRING_5 ]] && [[ $RECURRING_5 -ge $RECURRING_10 ]]; then
    log_pass "Recurring detection threshold tuning works correctly"
else
    log_fail "Threshold tuning failed: 3=$RECURRING_3, 5=$RECURRING_5, 10=$RECURRING_10"
fi

# ============================================================================
# Test 11: Edge Case Timeline Tracking
# ============================================================================

log_test "Edge Case - Timeline Tracking (First/Last Seen)"

CASE_TIMELINE=$(capture_execution_failure "skill-timeline" "api_error" "Rate limit exceeded" "medium")

# Capture again after a moment
sleep 1
capture_execution_failure "skill-timeline" "api_error" "Rate limit exceeded" "medium" &>/dev/null

FIRST_SEEN=$(jq --arg id "$CASE_TIMELINE" '.edge_cases[] | select(.case_id == $id) | .first_seen' "$EDGE_CASE_DB")
LAST_SEEN=$(jq --arg id "$CASE_TIMELINE" '.edge_cases[] | select(.case_id == $id) | .last_seen' "$EDGE_CASE_DB")

# Last seen should be after first seen
if [[ "$FIRST_SEEN" < "$LAST_SEEN" ]]; then
    log_pass "Timeline tracking works correctly (first_seen < last_seen)"
else
    log_fail "Timeline tracking failed: first=$FIRST_SEEN, last=$LAST_SEEN"
fi

# ============================================================================
# Cleanup and Summary
# ============================================================================

cleanup_test_dir "$TEST_DIR"

print_test_summary "Edge Case Tracking Test Suite"

exit $((TESTS_FAILED > 0 ? 1 : 0))
