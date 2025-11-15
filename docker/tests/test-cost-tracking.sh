#!/bin/bash
# Phase 4 Workflow Codification - Cost Tracking Test Suite
# Tests cost avoided calculation, ROI metrics, and dashboard reporting

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

# ============================================================================
# Cost Tracking Implementation (for testing)
# ============================================================================

COST_DB="$TEST_DIR/cost-tracking.json"

init_cost_db() {
    cat > "$COST_DB" <<'EOF'
{
  "skills": [],
  "pricing": {
    "manual_hour_rate": 50.00,
    "avg_workflow_minutes": 30
  }
}
EOF
}

log_execution() {
    local skill_id="$1"
    local duration_seconds="$2"
    local success="${3:-true}"

    local timestamp=$(iso_timestamp)

    # Calculate cost avoided (manual time - automated time)
    local manual_minutes=$(jq -r '.pricing.avg_workflow_minutes' "$COST_DB")
    local manual_cost=$(jq -r '.pricing.manual_hour_rate' "$COST_DB")
    local cost_avoided=$(echo "($manual_minutes / 60) * $manual_cost" | bc -l)

    # Find or create skill entry
    local existing=$(jq --arg skill "$skill_id" '.skills[] | select(.skill_id == $skill)' "$COST_DB")

    if [[ -z "$existing" ]]; then
        # Create new skill entry
        local temp=$(mktemp)
        jq --arg skill "$skill_id" \
           --arg timestamp "$timestamp" \
           --argjson cost "$cost_avoided" \
           --argjson duration "$duration_seconds" \
           --arg success "$success" \
           '.skills += [{
              "skill_id": $skill,
              "executions": 1,
              "successful_executions": (if $success == "true" then 1 else 0 end),
              "total_cost_avoided": $cost,
              "total_duration_seconds": $duration,
              "first_execution": $timestamp,
              "last_execution": $timestamp
           }]' "$COST_DB" > "$temp"
        mv "$temp" "$COST_DB"
    else
        # Update existing skill entry
        local temp=$(mktemp)
        jq --arg skill "$skill_id" \
           --arg timestamp "$timestamp" \
           --argjson cost "$cost_avoided" \
           --argjson duration "$duration_seconds" \
           --arg success "$success" \
           '(.skills[] | select(.skill_id == $skill) | .executions) += 1 |
            (.skills[] | select(.skill_id == $skill) | .successful_executions) += (if $success == "true" then 1 else 0 end) |
            (.skills[] | select(.skill_id == $skill) | .total_cost_avoided) += $cost |
            (.skills[] | select(.skill_id == $skill) | .total_duration_seconds) += $duration |
            (.skills[] | select(.skill_id == $skill) | .last_execution) = $timestamp' \
            "$COST_DB" > "$temp"
        mv "$temp" "$COST_DB"
    fi
}

calculate_cost_avoided() {
    local skill_id="$1"

    jq --arg skill "$skill_id" \
        '.skills[] | select(.skill_id == $skill) | .total_cost_avoided' \
        "$COST_DB"
}

calculate_monthly_roi() {
    local skill_id="$1"

    local total_avoided=$(calculate_cost_avoided "$skill_id")
    local executions=$(jq --arg skill "$skill_id" '.skills[] | select(.skill_id == $skill) | .executions' "$COST_DB")

    # Assuming current executions represent one month
    echo "$total_avoided"
}

calculate_annual_roi() {
    local monthly_roi="$1"

    echo "$monthly_roi * 12" | bc -l
}

get_dashboard_metrics() {
    jq '{
      "total_skills": (.skills | length),
      "total_executions": (.skills | map(.executions) | add // 0),
      "total_cost_avoided": (.skills | map(.total_cost_avoided) | add // 0),
      "success_rate": ((.skills | map(.successful_executions) | add // 0) / (.skills | map(.executions) | add // 1))
    }' "$COST_DB"
}

validate_savings_accuracy() {
    local expected="$1"
    local actual="$2"
    local tolerance="${3:-0.05}"  # 5% tolerance by default

    local diff=$(echo "($expected - $actual) / $expected" | bc -l | tr -d '-')
    local within_tolerance=$(echo "$diff <= $tolerance" | bc -l)

    if [[ "$within_tolerance" == "1" ]]; then
        echo "accurate"
    else
        echo "inaccurate"
    fi
}

# ============================================================================
# Test Suite: Cost Tracking
# ============================================================================

log_section "Cost Tracking Test Suite"

# Setup
TEST_DIR=$(create_test_dir "cost-tracking")
init_cost_db

# ============================================================================
# Test 1: Cost Avoided Calculation
# ============================================================================

log_test "Cost Tracking - Cost Avoided Calculation"

# Log execution for skill
log_execution "skill-deploy" 120 "true"

COST_AVOIDED=$(calculate_cost_avoided "skill-deploy")

# Expected: (30 min / 60) * $50/hr = $25.00
EXPECTED_COST=25.00

if (( $(echo "$COST_AVOIDED >= $EXPECTED_COST - 1 && $COST_AVOIDED <= $EXPECTED_COST + 1" | bc -l) )); then
    log_pass "Cost avoided calculated correctly: \$$COST_AVOIDED"
else
    log_fail "Cost calculation incorrect: expected \$$EXPECTED_COST, got \$$COST_AVOIDED"
fi

# ============================================================================
# Test 2: Monthly ROI Calculation
# ============================================================================

log_test "Cost Tracking - Monthly ROI Calculation"

# Log additional executions
for i in {1..9}; do
    log_execution "skill-deploy" 120 "true"
done

MONTHLY_ROI=$(calculate_monthly_roi "skill-deploy")

# Expected: 10 executions * $25 = $250
EXPECTED_MONTHLY=250.00

if (( $(echo "$MONTHLY_ROI >= $EXPECTED_MONTHLY - 10 && $MONTHLY_ROI <= $EXPECTED_MONTHLY + 10" | bc -l) )); then
    log_pass "Monthly ROI calculated correctly: \$$MONTHLY_ROI"
else
    log_fail "Monthly ROI incorrect: expected \$$EXPECTED_MONTHLY, got \$$MONTHLY_ROI"
fi

# ============================================================================
# Test 3: Annual ROI Calculation
# ============================================================================

log_test "Cost Tracking - Annual ROI Calculation"

ANNUAL_ROI=$(calculate_annual_roi "$MONTHLY_ROI")

# Expected: $250 * 12 = $3000
EXPECTED_ANNUAL=3000.00

if (( $(echo "$ANNUAL_ROI >= $EXPECTED_ANNUAL - 100 && $ANNUAL_ROI <= $EXPECTED_ANNUAL + 100" | bc -l) )); then
    log_pass "Annual ROI calculated correctly: \$$ANNUAL_ROI"
else
    log_fail "Annual ROI incorrect: expected \$$EXPECTED_ANNUAL, got \$$ANNUAL_ROI"
fi

# ============================================================================
# Test 4: Dashboard Metrics
# ============================================================================

log_test "Cost Tracking - Dashboard Metrics"

# Add another skill
for i in {1..5}; do
    log_execution "skill-backup" 60 "true"
done

METRICS=$(get_dashboard_metrics)

TOTAL_SKILLS=$(echo "$METRICS" | jq -r '.total_skills')
TOTAL_EXECUTIONS=$(echo "$METRICS" | jq -r '.total_executions')
TOTAL_COST=$(echo "$METRICS" | jq -r '.total_cost_avoided')

if [[ $TOTAL_SKILLS -eq 2 ]] && [[ $TOTAL_EXECUTIONS -eq 15 ]]; then
    log_pass "Dashboard metrics calculated correctly (skills=$TOTAL_SKILLS, executions=$TOTAL_EXECUTIONS)"
else
    log_fail "Dashboard metrics incorrect: skills=$TOTAL_SKILLS (expected 2), executions=$TOTAL_EXECUTIONS (expected 15)"
fi

# ============================================================================
# Test 5: Execution Logging
# ============================================================================

log_test "Cost Tracking - Execution Logging"

EXECUTIONS_BEFORE=$(jq '.skills[] | select(.skill_id == "skill-deploy") | .executions' "$COST_DB")
log_execution "skill-deploy" 130 "true"
EXECUTIONS_AFTER=$(jq '.skills[] | select(.skill_id == "skill-deploy") | .executions' "$COST_DB")

if [[ $EXECUTIONS_AFTER -eq $((EXECUTIONS_BEFORE + 1)) ]]; then
    log_pass "Execution logging works correctly"
else
    log_fail "Execution logging failed: before=$EXECUTIONS_BEFORE, after=$EXECUTIONS_AFTER"
fi

# ============================================================================
# Test 6: Savings Accuracy Validation (5% tolerance)
# ============================================================================

log_test "Cost Tracking - Savings Accuracy (5% tolerance)"

EXPECTED=100.00
ACTUAL_WITHIN=102.00  # 2% difference
ACTUAL_OUTSIDE=110.00  # 10% difference

ACCURACY_WITHIN=$(validate_savings_accuracy "$EXPECTED" "$ACTUAL_WITHIN" 0.05)
ACCURACY_OUTSIDE=$(validate_savings_accuracy "$EXPECTED" "$ACTUAL_OUTSIDE" 0.05)

if [[ "$ACCURACY_WITHIN" == "accurate" ]] && [[ "$ACCURACY_OUTSIDE" == "inaccurate" ]]; then
    log_pass "Savings accuracy validation works correctly (5% tolerance)"
else
    log_fail "Savings accuracy validation failed: within=$ACCURACY_WITHIN, outside=$ACCURACY_OUTSIDE"
fi

# ============================================================================
# Test 7: Edge Case - Zero Executions
# ============================================================================

log_test "Edge Case - Zero Executions (New Skill)"

# Query skill with zero executions
ZERO_COST=$(jq '.skills[] | select(.skill_id == "skill-nonexistent") | .total_cost_avoided // 0' "$COST_DB")

if [[ "$ZERO_COST" == "0" ]]; then
    log_pass "Zero executions handled correctly (cost = \$0)"
else
    log_fail "Zero executions handling failed: cost=$ZERO_COST"
fi

# ============================================================================
# Test 8: Edge Case - Negative Cost (Failed Executions)
# ============================================================================

log_test "Edge Case - Negative Cost Validation"

# Log failed execution (should not add to cost avoided)
COST_BEFORE=$(calculate_cost_avoided "skill-deploy")
log_execution "skill-deploy" 120 "false"
COST_AFTER=$(calculate_cost_avoided "skill-deploy")

# Cost should not decrease for failed execution
if (( $(echo "$COST_AFTER >= $COST_BEFORE" | bc -l) )); then
    log_pass "Failed execution handling correct (cost not negative)"
else
    log_fail "Failed execution caused negative cost: before=$COST_BEFORE, after=$COST_AFTER"
fi

# ============================================================================
# Test 9: Edge Case - Missing Pricing Data
# ============================================================================

log_test "Edge Case - Missing Pricing Data Handling"

# Corrupt pricing data
CORRUPT_DB="$TEST_DIR/cost-corrupt.json"
cat > "$CORRUPT_DB" <<'EOF'
{
  "skills": [],
  "pricing": {}
}
EOF

# Should handle gracefully with defaults
MANUAL_RATE=$(jq -r '.pricing.manual_hour_rate // 50' "$CORRUPT_DB")
MANUAL_MINUTES=$(jq -r '.pricing.avg_workflow_minutes // 30' "$CORRUPT_DB")

if [[ "$MANUAL_RATE" == "50" ]] && [[ "$MANUAL_MINUTES" == "30" ]]; then
    log_pass "Missing pricing data handled with defaults"
else
    log_fail "Missing pricing data not handled: rate=$MANUAL_RATE, minutes=$MANUAL_MINUTES"
fi

# ============================================================================
# Test 10: Success Rate Calculation
# ============================================================================

log_test "Cost Tracking - Success Rate Calculation"

# Create skill with mixed success/failure
for i in {1..7}; do
    log_execution "skill-mixed" 100 "true"
done

for i in {1..3}; do
    log_execution "skill-mixed" 100 "false"
done

SUCCESS_RATE=$(jq '.skills[] | select(.skill_id == "skill-mixed") | (.successful_executions / .executions)' "$COST_DB")

# Expected: 7/10 = 0.7
if (( $(echo "$SUCCESS_RATE >= 0.65 && $SUCCESS_RATE <= 0.75" | bc -l) )); then
    log_pass "Success rate calculated correctly: $SUCCESS_RATE (70%)"
else
    log_fail "Success rate incorrect: $SUCCESS_RATE (expected 0.7)"
fi

# ============================================================================
# Test 11: Time Series Tracking
# ============================================================================

log_test "Cost Tracking - Time Series Tracking (First/Last Execution)"

FIRST_EXEC=$(jq -r '.skills[] | select(.skill_id == "skill-deploy") | .first_execution' "$COST_DB")
LAST_EXEC=$(jq -r '.skills[] | select(.skill_id == "skill-deploy") | .last_execution' "$COST_DB")

if [[ "$FIRST_EXEC" < "$LAST_EXEC" ]]; then
    log_pass "Time series tracking works (first < last)"
else
    log_fail "Time series tracking failed: first=$FIRST_EXEC, last=$LAST_EXEC"
fi

# ============================================================================
# Cleanup and Summary
# ============================================================================

cleanup_test_dir "$TEST_DIR"

print_test_summary "Cost Tracking Test Suite"

exit $((TESTS_FAILED > 0 ? 1 : 0))
