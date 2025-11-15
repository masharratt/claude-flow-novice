#!/usr/bin/env bash
#
# review-skill.sh - Expert Review CLI for Workflow Codification Approval
#
# Actions: approve, reject, correct
#
# Usage:
#   ./review-skill.sh --skill-id UUID --action approve|reject|correct [--feedback TEXT]
#   ./review-skill.sh --list-pending [--team TEAM_NAME]
#   ./review-skill.sh --check-sla
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Load environment
if [ -f "${PROJECT_ROOT}/.env" ]; then
    # shellcheck source=/dev/null
    source "${PROJECT_ROOT}/.env"
fi

DB_HOST="${CFN_DB_HOST:-localhost}"
DB_PORT="${CFN_DB_PORT:-5432}"
DB_NAME="${CFN_DB_NAME:-cfn_workflow}"
DB_USER="${CFN_DB_USER:-postgres}"
DB_PASSWORD="${CFN_DB_PASSWORD:-}"

# Expert information (from env or defaults)
EXPERT_ID="${CFN_EXPERT_ID:-$(whoami)}"
EXPERT_EMAIL="${CFN_EXPERT_EMAIL:-}"

# SLA thresholds (in hours)
SLA_HIGH_PRIORITY=48
SLA_MEDIUM_LOW_PRIORITY=168  # 7 days

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

#######################################
# Utility functions
#######################################
error_exit() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    exit 1
}

success_msg() {
    echo -e "${GREEN}✓ $1${NC}"
}

warn_msg() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

info_msg() {
    echo -e "${BLUE}ℹ $1${NC}"
}

#######################################
# Execute PostgreSQL query
#######################################
execute_query() {
    local query="$1"

    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "$query" 2>&1
}

execute_query_formatted() {
    local query="$1"

    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "$query" 2>&1
}

#######################################
# Get skill details by skill_id
# Arguments:
#   $1 - Skill ID (UUID)
#######################################
get_skill_details() {
    local skill_id="$1"

    local query="
    SELECT
        wp.id,
        wp.pattern_name,
        wp.status,
        wp.priority,
        wp.occurrence_count,
        wp.teams_affected,
        wp.estimated_savings_usd,
        wp.created_at,
        EXTRACT(EPOCH FROM (NOW() - wp.created_at))/3600 as hours_pending
    FROM workflow_patterns wp
    WHERE wp.id = '${skill_id}'
    LIMIT 1;
    "

    execute_query "$query"
}

#######################################
# Approve skill
# Arguments:
#   $1 - Skill ID
#   $2 - Feedback (optional)
#######################################
approve_skill() {
    local skill_id="$1"
    local feedback="${2:-Approved for deployment}"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%d %H:%M:%S")

    info_msg "Approving skill ${skill_id}..."

    # Get current status
    local current_status
    current_status=$(execute_query "SELECT status FROM workflow_patterns WHERE id = '${skill_id}';")

    if [ -z "$current_status" ]; then
        error_exit "Skill ID not found: ${skill_id}"
    fi

    if [ "$current_status" != "PENDING_REVIEW" ] && [ "$current_status" != "NEEDS_CORRECTION" ]; then
        error_exit "Cannot approve skill in state: ${current_status}. Must be PENDING_REVIEW or NEEDS_CORRECTION."
    fi

    # Log approval in skill_approvals table
    local approval_query="
    BEGIN;

    -- Insert approval record
    INSERT INTO skill_approvals (
        skill_id,
        expert_id,
        action,
        feedback,
        timestamp
    ) VALUES (
        '${skill_id}',
        '${EXPERT_ID}',
        'approve',
        '${feedback}',
        '${timestamp}'
    );

    -- Transition state to APPROVED (using approval-workflow.sh would be better, but inline for atomicity)
    UPDATE workflow_patterns
    SET status = 'APPROVED', updated_at = '${timestamp}'
    WHERE id = '${skill_id}';

    -- Log state transition
    INSERT INTO pattern_state_history (pattern_id, from_state, to_state, metadata, timestamp)
    VALUES (
        '${skill_id}',
        '${current_status}',
        'APPROVED',
        '{\"approved_by\": \"${EXPERT_ID}\", \"feedback\": \"${feedback}\"}'::jsonb,
        '${timestamp}'
    );

    -- Log audit event
    INSERT INTO workflow_audit_log (pattern_id, event_type, description, metadata, timestamp)
    VALUES (
        '${skill_id}',
        'SKILL_APPROVED',
        'Expert approved skill for deployment',
        '{\"expert_id\": \"${EXPERT_ID}\", \"feedback\": \"${feedback}\"}'::jsonb,
        '${timestamp}'
    );

    COMMIT;
    "

    if execute_query "$approval_query" > /dev/null 2>&1; then
        success_msg "Skill approved successfully!"
        info_msg "Skill is now ready for deployment to production."

        # Trigger deployment notification (optional)
        send_approval_notification "$skill_id" "approved"
    else
        error_exit "Failed to approve skill. Transaction rolled back."
    fi
}

#######################################
# Reject skill
# Arguments:
#   $1 - Skill ID
#   $2 - Feedback (required)
#######################################
reject_skill() {
    local skill_id="$1"
    local feedback="${2:-}"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%d %H:%M:%S")

    if [ -z "$feedback" ]; then
        error_exit "Feedback is required when rejecting a skill. Use --feedback 'reason for rejection'"
    fi

    warn_msg "Rejecting skill ${skill_id}..."

    # Get current status
    local current_status
    current_status=$(execute_query "SELECT status FROM workflow_patterns WHERE id = '${skill_id}';")

    if [ -z "$current_status" ]; then
        error_exit "Skill ID not found: ${skill_id}"
    fi

    if [ "$current_status" != "PENDING_REVIEW" ] && [ "$current_status" != "NEEDS_CORRECTION" ]; then
        error_exit "Cannot reject skill in state: ${current_status}. Must be PENDING_REVIEW or NEEDS_CORRECTION."
    fi

    # Log rejection
    local rejection_query="
    BEGIN;

    -- Insert rejection record
    INSERT INTO skill_approvals (
        skill_id,
        expert_id,
        action,
        feedback,
        timestamp
    ) VALUES (
        '${skill_id}',
        '${EXPERT_ID}',
        'reject',
        '${feedback}',
        '${timestamp}'
    );

    -- Transition state to REJECTED
    UPDATE workflow_patterns
    SET status = 'REJECTED', updated_at = '${timestamp}'
    WHERE id = '${skill_id}';

    -- Log state transition
    INSERT INTO pattern_state_history (pattern_id, from_state, to_state, metadata, timestamp)
    VALUES (
        '${skill_id}',
        '${current_status}',
        'REJECTED',
        '{\"rejected_by\": \"${EXPERT_ID}\", \"feedback\": \"${feedback}\"}'::jsonb,
        '${timestamp}'
    );

    -- Log audit event
    INSERT INTO workflow_audit_log (pattern_id, event_type, description, metadata, timestamp)
    VALUES (
        '${skill_id}',
        'SKILL_REJECTED',
        'Expert rejected skill',
        '{\"expert_id\": \"${EXPERT_ID}\", \"reason\": \"${feedback}\"}'::jsonb,
        '${timestamp}'
    );

    COMMIT;
    "

    if execute_query "$rejection_query" > /dev/null 2>&1; then
        success_msg "Skill rejected successfully."
        info_msg "Reason: ${feedback}"

        # Send rejection notification
        send_approval_notification "$skill_id" "rejected"
    else
        error_exit "Failed to reject skill. Transaction rolled back."
    fi
}

#######################################
# Request correction for skill
# Arguments:
#   $1 - Skill ID
#   $2 - Feedback (required)
#######################################
request_correction() {
    local skill_id="$1"
    local feedback="${2:-}"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%d %H:%M:%S")

    if [ -z "$feedback" ]; then
        error_exit "Feedback is required when requesting corrections. Use --feedback 'what needs to be corrected'"
    fi

    info_msg "Requesting corrections for skill ${skill_id}..."

    # Get current status
    local current_status
    current_status=$(execute_query "SELECT status FROM workflow_patterns WHERE id = '${skill_id}';")

    if [ -z "$current_status" ]; then
        error_exit "Skill ID not found: ${skill_id}"
    fi

    if [ "$current_status" != "PENDING_REVIEW" ]; then
        error_exit "Cannot request corrections for skill in state: ${current_status}. Must be PENDING_REVIEW."
    fi

    # Log correction request
    local correction_query="
    BEGIN;

    -- Insert correction request record
    INSERT INTO skill_approvals (
        skill_id,
        expert_id,
        action,
        feedback,
        timestamp
    ) VALUES (
        '${skill_id}',
        '${EXPERT_ID}',
        'correct',
        '${feedback}',
        '${timestamp}'
    );

    -- Transition state to NEEDS_CORRECTION
    UPDATE workflow_patterns
    SET status = 'NEEDS_CORRECTION', updated_at = '${timestamp}'
    WHERE id = '${skill_id}';

    -- Log state transition
    INSERT INTO pattern_state_history (pattern_id, from_state, to_state, metadata, timestamp)
    VALUES (
        '${skill_id}',
        '${current_status}',
        'NEEDS_CORRECTION',
        '{\"requested_by\": \"${EXPERT_ID}\", \"feedback\": \"${feedback}\"}'::jsonb,
        '${timestamp}'
    );

    -- Log audit event
    INSERT INTO workflow_audit_log (pattern_id, event_type, description, metadata, timestamp)
    VALUES (
        '${skill_id}',
        'CORRECTION_REQUESTED',
        'Expert requested corrections',
        '{\"expert_id\": \"${EXPERT_ID}\", \"corrections\": \"${feedback}\"}'::jsonb,
        '${timestamp}'
    );

    COMMIT;
    "

    if execute_query "$correction_query" > /dev/null 2>&1; then
        success_msg "Correction request submitted successfully."
        info_msg "Feedback: ${feedback}"
        info_msg "Skill will be regenerated with your feedback."

        # Send correction notification
        send_approval_notification "$skill_id" "needs_correction"
    else
        error_exit "Failed to request corrections. Transaction rolled back."
    fi
}

#######################################
# List pending skills for review
# Arguments:
#   $1 - Team filter (optional)
#######################################
list_pending_skills() {
    local team_filter="${1:-}"

    info_msg "Fetching pending skills for review..."

    local query="
    SELECT
        wp.id,
        wp.pattern_name,
        wp.status,
        wp.priority,
        wp.occurrence_count,
        wp.estimated_savings_usd,
        ROUND(EXTRACT(EPOCH FROM (NOW() - wp.created_at))/3600, 1) as hours_pending,
        CASE
            WHEN wp.priority = 'high' AND EXTRACT(EPOCH FROM (NOW() - wp.created_at))/3600 > ${SLA_HIGH_PRIORITY} THEN 'SLA_BREACH'
            WHEN wp.priority IN ('medium', 'low') AND EXTRACT(EPOCH FROM (NOW() - wp.created_at))/3600 > ${SLA_MEDIUM_LOW_PRIORITY} THEN 'SLA_BREACH'
            ELSE 'OK'
        END as sla_status
    FROM workflow_patterns wp
    WHERE wp.status IN ('PENDING_REVIEW', 'NEEDS_CORRECTION')
    "

    if [ -n "$team_filter" ]; then
        query+=" AND '${team_filter}' = ANY(wp.teams_affected)"
    fi

    query+=" ORDER BY
        CASE wp.priority
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
        END,
        wp.created_at ASC;"

    echo -e "${CYAN}=== Pending Skills for Review ===${NC}"
    execute_query_formatted "$query"
}

#######################################
# Check SLA status for pending reviews
#######################################
check_sla_status() {
    info_msg "Checking SLA status for pending reviews..."

    local query="
    SELECT
        COUNT(*) FILTER (WHERE
            priority = 'high' AND
            EXTRACT(EPOCH FROM (NOW() - created_at))/3600 > ${SLA_HIGH_PRIORITY}
        ) as high_priority_breaches,
        COUNT(*) FILTER (WHERE
            priority IN ('medium', 'low') AND
            EXTRACT(EPOCH FROM (NOW() - created_at))/3600 > ${SLA_MEDIUM_LOW_PRIORITY}
        ) as medium_low_breaches,
        COUNT(*) as total_pending
    FROM workflow_patterns
    WHERE status IN ('PENDING_REVIEW', 'NEEDS_CORRECTION');
    "

    echo -e "${CYAN}=== SLA Status ===${NC}"
    local result
    result=$(execute_query "$query")

    # Parse result (format: high_breaches|medium_breaches|total)
    IFS='|' read -r high_breaches medium_breaches total <<< "$result"

    echo "High Priority Breaches (>48h): ${high_breaches}"
    echo "Medium/Low Priority Breaches (>7d): ${medium_breaches}"
    echo "Total Pending Reviews: ${total}"

    if [ "$high_breaches" -gt 0 ] || [ "$medium_breaches" -gt 0 ]; then
        warn_msg "SLA breaches detected! Please review pending skills urgently."
        return 1
    else
        success_msg "All pending reviews within SLA."
        return 0
    fi
}

#######################################
# Send approval notification
# Arguments:
#   $1 - Skill ID
#   $2 - Action (approved|rejected|needs_correction)
#######################################
send_approval_notification() {
    local skill_id="$1"
    local action="$2"

    # Get skill details
    local skill_name
    skill_name=$(execute_query "SELECT pattern_name FROM workflow_patterns WHERE id = '${skill_id}';")

    # Placeholder for notification integration
    # In production, integrate with email/Slack services

    info_msg "Notification: Skill '${skill_name}' has been ${action}"

    # TODO: Integrate with notification service
    # - Send email using templates/email-notification.txt
    # - Send Slack message using templates/slack-notification.md
}

#######################################
# Initialize skill_approvals table
#######################################
init_approvals_table() {
    info_msg "Initializing skill_approvals table..."

    local schema_query="
    CREATE TABLE IF NOT EXISTS skill_approvals (
        id SERIAL PRIMARY KEY,
        skill_id UUID REFERENCES workflow_patterns(id) ON DELETE CASCADE,
        expert_id VARCHAR(255) NOT NULL,
        action VARCHAR(50) NOT NULL,
        feedback TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_skill_approvals_skill_id ON skill_approvals(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_approvals_expert_id ON skill_approvals(expert_id);
    CREATE INDEX IF NOT EXISTS idx_skill_approvals_timestamp ON skill_approvals(timestamp);
    "

    if execute_query "$schema_query" > /dev/null 2>&1; then
        success_msg "skill_approvals table initialized successfully"
    else
        error_exit "Failed to initialize skill_approvals table"
    fi
}

#######################################
# Show usage information
#######################################
usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
    (default)          Review a specific skill (requires --skill-id and --action)
    --list-pending     List all pending skills for review
    --check-sla        Check SLA status for pending reviews
    --init             Initialize skill_approvals table

Review Options:
    --skill-id UUID    Skill ID to review (required for review action)
    --action ACTION    Action to take: approve, reject, correct (required)
    --feedback TEXT    Feedback/reason for action (required for reject/correct)

List Options:
    --team TEAM_NAME   Filter pending skills by team (optional)

Examples:
    # Approve a skill
    $0 --skill-id "123e4567-e89b-12d3-a456-426614174000" --action approve

    # Reject a skill with feedback
    $0 --skill-id "123e4567-e89b-12d3-a456-426614174000" \\
        --action reject --feedback "Script has security vulnerabilities"

    # Request corrections
    $0 --skill-id "123e4567-e89b-12d3-a456-426614174000" \\
        --action correct --feedback "Add input validation for domain parameter"

    # List all pending skills
    $0 --list-pending

    # List pending skills for frontend team
    $0 --list-pending --team frontend

    # Check SLA status
    $0 --check-sla

EOF
    exit 1
}

#######################################
# Main execution
#######################################
main() {
    local skill_id=""
    local action=""
    local feedback=""
    local team_filter=""
    local list_pending=false
    local check_sla=false
    local init_table=false

    # Parse arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --skill-id)
                skill_id="$2"
                shift 2
                ;;
            --action)
                action="$2"
                shift 2
                ;;
            --feedback)
                feedback="$2"
                shift 2
                ;;
            --team)
                team_filter="$2"
                shift 2
                ;;
            --list-pending)
                list_pending=true
                shift
                ;;
            --check-sla)
                check_sla=true
                shift
                ;;
            --init)
                init_table=true
                shift
                ;;
            --help|-h)
                usage
                ;;
            *)
                error_exit "Unknown option: $1"
                ;;
        esac
    done

    # Execute command
    if [ "$init_table" = true ]; then
        init_approvals_table
        exit 0
    fi

    if [ "$list_pending" = true ]; then
        list_pending_skills "$team_filter"
        exit 0
    fi

    if [ "$check_sla" = true ]; then
        check_sla_status
        exit $?
    fi

    # Default: review action
    if [ -z "$skill_id" ] || [ -z "$action" ]; then
        usage
    fi

    # Validate action
    case "$action" in
        approve)
            approve_skill "$skill_id" "$feedback"
            ;;
        reject)
            reject_skill "$skill_id" "$feedback"
            ;;
        correct)
            request_correction "$skill_id" "$feedback"
            ;;
        *)
            error_exit "Invalid action: $action. Must be approve, reject, or correct."
            ;;
    esac
}

main "$@"
