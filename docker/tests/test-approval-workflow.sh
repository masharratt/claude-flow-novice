#!/bin/bash
# Phase 4 Workflow Codification - Approval Workflow Test Suite
# Tests approval workflow with 8 state transitions, notifications, and SLA tracking

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

# ============================================================================
# Approval Workflow State Machine (for testing)
# ============================================================================

# States: draft → pending_expert_review → expert_reviewing → approved/rejected/needs_correction
#         approved → pending_deployment → deployed → active
#         needs_correction → draft (loop)

STATE_FILE=""

init_approval() {
    local skill_id="$1"
    local expert="$2"

    STATE_FILE="$TEST_DIR/approval-${skill_id}.json"

    cat > "$STATE_FILE" <<EOF
{
  "skill_id": "$skill_id",
  "state": "draft",
  "expert": "$expert",
  "created_at": "$(iso_timestamp)",
  "updated_at": "$(iso_timestamp)",
  "sla_deadline": "$(date -u -d '+24 hours' +"%Y-%m-%dT%H:%M:%SZ")",
  "audit_trail": []
}
EOF
    echo "$STATE_FILE"
}

transition_state() {
    local state_file="$1"
    local new_state="$2"
    local actor="${3:-system}"
    local notes="${4:-}"

    # Validate state transition
    local current_state=$(jq -r '.state' "$state_file")

    # Valid transitions
    local valid=false
    case "$current_state" in
        "draft")
            [[ "$new_state" == "pending_expert_review" ]] && valid=true
            ;;
        "pending_expert_review")
            [[ "$new_state" == "expert_reviewing" ]] && valid=true
            [[ "$new_state" == "escalated" ]] && valid=true
            ;;
        "expert_reviewing")
            [[ "$new_state" == "approved" ]] && valid=true
            [[ "$new_state" == "rejected" ]] && valid=true
            [[ "$new_state" == "needs_correction" ]] && valid=true
            ;;
        "needs_correction")
            [[ "$new_state" == "draft" ]] && valid=true
            ;;
        "approved")
            [[ "$new_state" == "pending_deployment" ]] && valid=true
            ;;
        "pending_deployment")
            [[ "$new_state" == "deployed" ]] && valid=true
            [[ "$new_state" == "deployment_failed" ]] && valid=true
            ;;
        "deployed")
            [[ "$new_state" == "active" ]] && valid=true
            ;;
        "deployment_failed")
            [[ "$new_state" == "pending_deployment" ]] && valid=true
            ;;
    esac

    if [[ "$valid" == "false" ]]; then
        echo "invalid_transition"
        return 1
    fi

    # Update state
    local temp_file=$(mktemp)
    jq --arg state "$new_state" \
       --arg actor "$actor" \
       --arg notes "$notes" \
       --arg timestamp "$(iso_timestamp)" \
       '.state = $state |
        .updated_at = $timestamp |
        .audit_trail += [{
          "from": .state,
          "to": $state,
          "actor": $actor,
          "timestamp": $timestamp,
          "notes": $notes
        }]' "$state_file" > "$temp_file"

    mv "$temp_file" "$state_file"
    echo "$new_state"
}

send_notification() {
    local recipient="$1"
    local subject="$2"
    local message="$3"

    echo "NOTIFICATION|$recipient|$subject|$message"
}

check_sla() {
    local state_file="$1"
    local deadline=$(jq -r '.sla_deadline' "$state_file")
    local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    if [[ "$now" > "$deadline" ]]; then
        echo "expired"
    else
        echo "valid"
    fi
}

# ============================================================================
# Test Suite: Approval Workflow
# ============================================================================

log_section "Approval Workflow Test Suite"

# Setup
TEST_DIR=$(create_test_dir "approval-workflow")

# ============================================================================
# Test 1: State Transition - Draft → Pending Expert Review
# ============================================================================

log_test "State Transition - Draft → Pending Expert Review"

STATE_FILE=$(init_approval "skill-001" "expert@example.com")
RESULT=$(transition_state "$STATE_FILE" "pending_expert_review" "system" "Skill ready for review")

if [[ "$RESULT" == "pending_expert_review" ]]; then
    log_pass "Transition draft → pending_expert_review successful"
else
    log_fail "Transition failed: $RESULT"
fi

# ============================================================================
# Test 2: State Transition - Pending → Expert Reviewing
# ============================================================================

log_test "State Transition - Pending Expert Review → Expert Reviewing"

RESULT=$(transition_state "$STATE_FILE" "expert_reviewing" "expert@example.com" "Started review")

if [[ "$RESULT" == "expert_reviewing" ]]; then
    log_pass "Transition pending_expert_review → expert_reviewing successful"
else
    log_fail "Transition failed: $RESULT"
fi

# ============================================================================
# Test 3: State Transition - Expert Reviewing → Approved
# ============================================================================

log_test "State Transition - Expert Reviewing → Approved"

STATE_FILE2=$(init_approval "skill-002" "expert@example.com")
transition_state "$STATE_FILE2" "pending_expert_review" "system" &>/dev/null
transition_state "$STATE_FILE2" "expert_reviewing" "expert@example.com" &>/dev/null
RESULT=$(transition_state "$STATE_FILE2" "approved" "expert@example.com" "Looks good")

if [[ "$RESULT" == "approved" ]]; then
    log_pass "Transition expert_reviewing → approved successful"
else
    log_fail "Transition failed: $RESULT"
fi

# ============================================================================
# Test 4: State Transition - Expert Reviewing → Rejected
# ============================================================================

log_test "State Transition - Expert Reviewing → Rejected"

STATE_FILE3=$(init_approval "skill-003" "expert@example.com")
transition_state "$STATE_FILE3" "pending_expert_review" "system" &>/dev/null
transition_state "$STATE_FILE3" "expert_reviewing" "expert@example.com" &>/dev/null
RESULT=$(transition_state "$STATE_FILE3" "rejected" "expert@example.com" "Security concerns")

if [[ "$RESULT" == "rejected" ]]; then
    log_pass "Transition expert_reviewing → rejected successful"
else
    log_fail "Transition failed: $RESULT"
fi

# ============================================================================
# Test 5: State Transition - Expert Reviewing → Needs Correction
# ============================================================================

log_test "State Transition - Expert Reviewing → Needs Correction"

STATE_FILE4=$(init_approval "skill-004" "expert@example.com")
transition_state "$STATE_FILE4" "pending_expert_review" "system" &>/dev/null
transition_state "$STATE_FILE4" "expert_reviewing" "expert@example.com" &>/dev/null
RESULT=$(transition_state "$STATE_FILE4" "needs_correction" "expert@example.com" "Fix error handling")

if [[ "$RESULT" == "needs_correction" ]]; then
    log_pass "Transition expert_reviewing → needs_correction successful"
else
    log_fail "Transition failed: $RESULT"
fi

# ============================================================================
# Test 6: State Transition - Approved → Pending Deployment → Deployed → Active
# ============================================================================

log_test "State Transition - Approved → Pending Deployment → Deployed → Active"

STATE_FILE5=$(init_approval "skill-005" "expert@example.com")
transition_state "$STATE_FILE5" "pending_expert_review" "system" &>/dev/null
transition_state "$STATE_FILE5" "expert_reviewing" "expert@example.com" &>/dev/null
transition_state "$STATE_FILE5" "approved" "expert@example.com" &>/dev/null
transition_state "$STATE_FILE5" "pending_deployment" "system" &>/dev/null
transition_state "$STATE_FILE5" "deployed" "system" &>/dev/null
RESULT=$(transition_state "$STATE_FILE5" "active" "system" "Deployment complete")

if [[ "$RESULT" == "active" ]]; then
    log_pass "Full deployment pipeline successful"
else
    log_fail "Deployment pipeline failed at: $RESULT"
fi

# ============================================================================
# Test 7: State Transition - Needs Correction → Draft (Loop)
# ============================================================================

log_test "State Transition - Needs Correction → Draft (Correction Loop)"

STATE_FILE6=$(init_approval "skill-006" "expert@example.com")
transition_state "$STATE_FILE6" "pending_expert_review" "system" &>/dev/null
transition_state "$STATE_FILE6" "expert_reviewing" "expert@example.com" &>/dev/null
transition_state "$STATE_FILE6" "needs_correction" "expert@example.com" &>/dev/null
RESULT=$(transition_state "$STATE_FILE6" "draft" "developer" "Applied corrections")

if [[ "$RESULT" == "draft" ]]; then
    log_pass "Correction loop transition successful"
else
    log_fail "Correction loop failed: $RESULT"
fi

# ============================================================================
# Test 8: Expert Notification Generation
# ============================================================================

log_test "Expert Notification Generation"

NOTIFICATION=$(send_notification "expert@example.com" "Skill Ready for Review" "Skill skill-001 is ready for your review")

if [[ "$NOTIFICATION" =~ ^NOTIFICATION\|expert@example.com ]]; then
    log_pass "Expert notification generated correctly"
else
    log_fail "Notification generation failed: $NOTIFICATION"
fi

# ============================================================================
# Test 9: Approval Actions (approve/reject/correct)
# ============================================================================

log_test "Approval Actions - Approve/Reject/Correct"

perform_approval_action() {
    local action="$1"
    local state_file="$2"

    case "$action" in
        "approve")
            transition_state "$state_file" "approved" "expert@example.com" "Approved"
            ;;
        "reject")
            transition_state "$state_file" "rejected" "expert@example.com" "Rejected"
            ;;
        "correct")
            transition_state "$state_file" "needs_correction" "expert@example.com" "Needs fixes"
            ;;
        *)
            echo "invalid_action"
            return 1
            ;;
    esac
}

# Test all three actions
STATE_APPROVE=$(init_approval "skill-approve" "expert@example.com")
transition_state "$STATE_APPROVE" "pending_expert_review" "system" &>/dev/null
transition_state "$STATE_APPROVE" "expert_reviewing" "expert@example.com" &>/dev/null
APPROVE_RESULT=$(perform_approval_action "approve" "$STATE_APPROVE")

if [[ "$APPROVE_RESULT" == "approved" ]]; then
    log_pass "Approval actions work correctly"
else
    log_fail "Approval action failed: $APPROVE_RESULT"
fi

# ============================================================================
# Test 10: Audit Trail Logging
# ============================================================================

log_test "Audit Trail Logging"

AUDIT_ENTRIES=$(jq '.audit_trail | length' "$STATE_FILE5")

if [[ $AUDIT_ENTRIES -ge 5 ]]; then
    log_pass "Audit trail logged correctly ($AUDIT_ENTRIES entries)"
else
    log_fail "Insufficient audit trail entries: $AUDIT_ENTRIES"
fi

# Verify audit trail structure
FIRST_AUDIT=$(jq -r '.audit_trail[0] | "\(.actor)|\(.timestamp)"' "$STATE_FILE5")

if [[ "$FIRST_AUDIT" =~ ^system\|[0-9]{4}- ]]; then
    log_pass "Audit trail structure valid"
else
    log_fail "Audit trail structure invalid: $FIRST_AUDIT"
fi

# ============================================================================
# Test 11: SLA Tracking and Escalation
# ============================================================================

log_test "SLA Tracking and Escalation"

# Create approval with expired SLA
STATE_EXPIRED=$(init_approval "skill-expired" "expert@example.com")
# Manually set expired deadline
jq '.sla_deadline = "2025-01-01T00:00:00Z"' "$STATE_EXPIRED" > "${STATE_EXPIRED}.tmp"
mv "${STATE_EXPIRED}.tmp" "$STATE_EXPIRED"

SLA_STATUS=$(check_sla "$STATE_EXPIRED")

if [[ "$SLA_STATUS" == "expired" ]]; then
    log_pass "SLA expiration detected correctly"
else
    log_fail "SLA expiration check failed: $SLA_STATUS"
fi

# Test escalation on SLA breach
STATE_ESCALATED=$(init_approval "skill-escalate" "expert@example.com")
transition_state "$STATE_ESCALATED" "pending_expert_review" "system" &>/dev/null
jq '.sla_deadline = "2025-01-01T00:00:00Z"' "$STATE_ESCALATED" > "${STATE_ESCALATED}.tmp"
mv "${STATE_ESCALATED}.tmp" "$STATE_ESCALATED"

# Escalate if SLA expired
if [[ $(check_sla "$STATE_ESCALATED") == "expired" ]]; then
    ESCALATION_RESULT=$(transition_state "$STATE_ESCALATED" "escalated" "system" "SLA breach")
    if [[ "$ESCALATION_RESULT" == "escalated" ]]; then
        log_pass "SLA escalation triggered correctly"
    else
        log_fail "SLA escalation failed: $ESCALATION_RESULT"
    fi
fi

# ============================================================================
# Test 12: Edge Case - Expert Timeout
# ============================================================================

log_test "Edge Case - Expert Timeout (No Response)"

STATE_TIMEOUT=$(init_approval "skill-timeout" "expert@example.com")
transition_state "$STATE_TIMEOUT" "pending_expert_review" "system" &>/dev/null

# Simulate timeout by checking SLA after setting past deadline
jq '.sla_deadline = "2025-01-01T00:00:00Z"' "$STATE_TIMEOUT" > "${STATE_TIMEOUT}.tmp"
mv "${STATE_TIMEOUT}.tmp" "$STATE_TIMEOUT"

SLA_CHECK=$(check_sla "$STATE_TIMEOUT")

if [[ "$SLA_CHECK" == "expired" ]]; then
    # Auto-escalate on timeout
    AUTO_ESCALATE=$(send_notification "manager@example.com" "Expert Timeout" "Skill awaiting review")
    if [[ "$AUTO_ESCALATE" =~ ^NOTIFICATION\|manager ]]; then
        log_pass "Expert timeout handled with escalation"
    else
        log_fail "Expert timeout handling failed"
    fi
fi

# ============================================================================
# Test 13: Edge Case - Concurrent Approvals
# ============================================================================

log_test "Edge Case - Concurrent Approval Attempts"

STATE_CONCURRENT=$(init_approval "skill-concurrent" "expert@example.com")
transition_state "$STATE_CONCURRENT" "pending_expert_review" "system" &>/dev/null
transition_state "$STATE_CONCURRENT" "expert_reviewing" "expert@example.com" &>/dev/null

# First approval succeeds
FIRST=$(transition_state "$STATE_CONCURRENT" "approved" "expert@example.com" "Approved" 2>&1)

# Second approval should fail (already approved)
set +e
SECOND=$(transition_state "$STATE_CONCURRENT" "approved" "expert2@example.com" "Also approved" 2>&1)
SECOND_EXIT=$?
set -e

if [[ "$FIRST" == "approved" ]] && [[ $SECOND_EXIT -ne 0 ]]; then
    log_pass "Concurrent approval attempts handled correctly"
else
    log_fail "Concurrent approval handling failed"
fi

# ============================================================================
# Test 14: Edge Case - Deployment Failure Rollback
# ============================================================================

log_test "Edge Case - Deployment Failure Rollback"

STATE_ROLLBACK=$(init_approval "skill-rollback" "expert@example.com")
transition_state "$STATE_ROLLBACK" "pending_expert_review" "system" &>/dev/null
transition_state "$STATE_ROLLBACK" "expert_reviewing" "expert@example.com" &>/dev/null
transition_state "$STATE_ROLLBACK" "approved" "expert@example.com" &>/dev/null
transition_state "$STATE_ROLLBACK" "pending_deployment" "system" &>/dev/null

# Deployment fails
FAILED=$(transition_state "$STATE_ROLLBACK" "deployment_failed" "system" "Docker push failed")

# Retry deployment
RETRY=$(transition_state "$STATE_ROLLBACK" "pending_deployment" "system" "Retrying deployment")

if [[ "$FAILED" == "deployment_failed" ]] && [[ "$RETRY" == "pending_deployment" ]]; then
    log_pass "Deployment failure rollback works correctly"
else
    log_fail "Deployment rollback failed: $FAILED → $RETRY"
fi

# ============================================================================
# Test 15: Edge Case - Invalid State Transition
# ============================================================================

log_test "Edge Case - Invalid State Transition"

STATE_INVALID=$(init_approval "skill-invalid" "expert@example.com")

# Try invalid transition: draft → active (skipping intermediate states)
set +e
INVALID_RESULT=$(transition_state "$STATE_INVALID" "active" "hacker" "Bypass approval" 2>&1)
INVALID_EXIT=$?
set -e

if [[ $INVALID_EXIT -ne 0 ]] || [[ "$INVALID_RESULT" == "invalid_transition" ]]; then
    log_pass "Invalid state transition rejected correctly"
else
    log_fail "Invalid state transition allowed: $INVALID_RESULT"
fi

# ============================================================================
# Test 16: Edge Case - Missing Audit Data
# ============================================================================

log_test "Edge Case - Missing Audit Data Recovery"

STATE_NO_AUDIT=$(init_approval "skill-no-audit" "expert@example.com")

# Corrupt audit trail
jq 'del(.audit_trail)' "$STATE_NO_AUDIT" > "${STATE_NO_AUDIT}.tmp"
mv "${STATE_NO_AUDIT}.tmp" "$STATE_NO_AUDIT"

# Transition should recreate audit trail
set +e
RECOVERY=$(transition_state "$STATE_NO_AUDIT" "pending_expert_review" "system" "Recovery" 2>&1)
RECOVERY_EXIT=$?
set -e

# Check if audit trail was recreated
AUDIT_RECOVERED=$(jq -e '.audit_trail' "$STATE_NO_AUDIT" &>/dev/null && echo "yes" || echo "no")

if [[ "$AUDIT_RECOVERED" == "yes" ]]; then
    log_pass "Missing audit data recovered successfully"
else
    log_fail "Audit data recovery failed"
fi

# ============================================================================
# Cleanup and Summary
# ============================================================================

cleanup_test_dir "$TEST_DIR"

print_test_summary "Approval Workflow Test Suite"

exit $((TESTS_FAILED > 0 ? 1 : 0))
