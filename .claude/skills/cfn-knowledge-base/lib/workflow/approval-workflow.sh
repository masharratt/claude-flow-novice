#!/usr/bin/env bash
#
# approval-workflow.sh - State Machine for Workflow Codification Approval Process
#
# States: DETECTED → GENERATING → PENDING_REVIEW → APPROVED/REJECTED/NEEDS_CORRECTION → DEPLOYED
#
# Usage:
#   ./approval-workflow.sh transition --pattern-id UUID --from-state STATE --to-state STATE
#   ./approval-workflow.sh get-state --pattern-id UUID
#   ./approval-workflow.sh rollback --pattern-id UUID --to-state STATE
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# PostgreSQL connection: read specific vars from .env, or fall back to the
# defaults below. Anchor on CLAUDE_PROJECT_DIR, since credentials belong to
# the project being worked on, not to the shared CFN
# checkout (same decision as CONTENT_BASE_DIR in deploy-approved-skill.sh /
# propagate-skill-update.sh). Never `source` the file: it executes whatever
# shell is in it, and a wrapped/multi-line value (e.g. a token with an
# embedded newline) breaks bash parsing on the continuation line. Extract
# only the vars this script actually uses.
ENV_FILE="${CLAUDE_PROJECT_DIR:-$PWD}/.env"
if [ -f "$ENV_FILE" ]; then
    for _env_var in CFN_DB_HOST CFN_DB_PORT CFN_DB_NAME CFN_DB_USER CFN_DB_PASSWORD; do
        _env_val="$(grep "^${_env_var}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- || true)"
        [ -n "$_env_val" ] && printf -v "$_env_var" '%s' "$_env_val"
    done
    unset _env_var _env_val
fi

DB_HOST="${CFN_DB_HOST:-localhost}"
DB_PORT="${CFN_DB_PORT:-5432}"
DB_NAME="${CFN_DB_NAME:-cfn_workflow}"
DB_USER="${CFN_DB_USER:-postgres}"
DB_PASSWORD="${CFN_DB_PASSWORD:-}"

# Valid state transitions
declare -A VALID_TRANSITIONS=(
    ["DETECTED"]="GENERATING"
    ["GENERATING"]="PENDING_REVIEW,DETECTED"  # Can rollback to DETECTED on failure
    ["PENDING_REVIEW"]="APPROVED,REJECTED,NEEDS_CORRECTION"
    ["NEEDS_CORRECTION"]="GENERATING,REJECTED"  # Re-generate or give up
    ["APPROVED"]="DEPLOYED,REJECTED"  # Can rollback approval
    ["DEPLOYED"]="APPROVED"  # Can rollback deployment
)

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#######################################
# Print error message and exit
# Arguments:
#   $1 - Error message
#######################################
error_exit() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    exit 1
}

#######################################
# Print success message
# Arguments:
#   $1 - Success message
#######################################
success_msg() {
    echo -e "${GREEN}✓ $1${NC}"
}

#######################################
# Print warning message
# Arguments:
#   $1 - Warning message
#######################################
warn_msg() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

#######################################
# Print info message
# Arguments:
#   $1 - Info message
#######################################
info_msg() {
    echo -e "${BLUE}ℹ $1${NC}"
}

#######################################
# Execute PostgreSQL query
# Arguments:
#   $1 - SQL query
#   $@ - Query parameters
# Returns:
#   Query result
#######################################
execute_query() {
    local query="$1"
    shift

    # Build psql command with password
    local psql_cmd="PGPASSWORD='${DB_PASSWORD}' psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -A"

    # Execute query with parameters
    if [ $# -gt 0 ]; then
        # Use parameterized query
        echo "$query" | $psql_cmd -v ON_ERROR_STOP=1 "$@" 2>&1
    else
        echo "$query" | $psql_cmd -v ON_ERROR_STOP=1 2>&1
    fi
}

#######################################
# Get current state of a pattern
# Arguments:
#   $1 - Pattern ID (UUID)
# Returns:
#   Current state or empty string if not found
#######################################
get_current_state() {
    local pattern_id="$1"

    local query="SELECT status FROM workflow_patterns WHERE id = '${pattern_id}' LIMIT 1;"
    local result
    result=$(execute_query "$query")

    # Check if pattern exists
    if [ -z "$result" ]; then
        error_exit "Pattern ID '${pattern_id}' not found"
    fi

    echo "$result"
}

#######################################
# Validate state transition
# Arguments:
#   $1 - From state
#   $2 - To state
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_transition() {
    local from_state="$1"
    local to_state="$2"

    # Check if from_state exists in valid transitions
    if [ -z "${VALID_TRANSITIONS[$from_state]:-}" ]; then
        error_exit "Invalid from_state: ${from_state}"
    fi

    # Get allowed transitions for from_state
    local allowed_transitions="${VALID_TRANSITIONS[$from_state]}"

    # Check if to_state is in allowed transitions (comma-separated)
    if [[ ",${allowed_transitions}," =~ ",${to_state}," ]]; then
        return 0
    else
        return 1
    fi
}

#######################################
# Perform state transition with transaction support
# Arguments:
#   $1 - Pattern ID (UUID)
#   $2 - From state
#   $3 - To state
#   $4 - Metadata (JSON, optional)
#######################################
transition_state() {
    local pattern_id="$1"
    local from_state="$2"
    local to_state="$3"
    local metadata="${4:-{}}"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%d %H:%M:%S")

    info_msg "Attempting state transition: ${from_state} → ${to_state}"

    # Validate transition
    if ! validate_transition "$from_state" "$to_state"; then
        error_exit "Invalid state transition: ${from_state} → ${to_state}. Allowed transitions: ${VALID_TRANSITIONS[$from_state]}"
    fi

    # Begin transaction
    local transaction_query="
    BEGIN;

    -- Lock the row for update (prevents concurrent modifications)
    SELECT status FROM workflow_patterns WHERE id = '${pattern_id}' FOR UPDATE;

    -- Verify current state matches expected from_state
    DO \$\$
    DECLARE
        current_state TEXT;
    BEGIN
        SELECT status INTO current_state FROM workflow_patterns WHERE id = '${pattern_id}';

        IF current_state IS NULL THEN
            RAISE EXCEPTION 'Pattern not found: ${pattern_id}';
        END IF;

        IF current_state != '${from_state}' THEN
            RAISE EXCEPTION 'State mismatch: expected ${from_state}, got %', current_state;
        END IF;
    END \$\$;

    -- Update pattern status
    UPDATE workflow_patterns
    SET
        status = '${to_state}',
        updated_at = '${timestamp}'
    WHERE id = '${pattern_id}';

    -- Log state transition
    INSERT INTO pattern_state_history (
        pattern_id,
        from_state,
        to_state,
        metadata,
        timestamp
    ) VALUES (
        '${pattern_id}',
        '${from_state}',
        '${to_state}',
        '${metadata}'::jsonb,
        '${timestamp}'
    );

    COMMIT;
    "

    # Execute transaction
    if execute_query "$transaction_query" > /dev/null 2>&1; then
        success_msg "State transition successful: ${from_state} → ${to_state}"

        # Log audit trail
        log_audit_event "$pattern_id" "STATE_TRANSITION" "${from_state} → ${to_state}" "$metadata"

        return 0
    else
        error_exit "State transition failed. Transaction rolled back."
    fi
}

#######################################
# Rollback to a previous state
# Arguments:
#   $1 - Pattern ID (UUID)
#   $2 - Target state
#   $3 - Reason (optional)
#######################################
rollback_state() {
    local pattern_id="$1"
    local target_state="$2"
    local reason="${3:-Manual rollback}"

    # Get current state
    local current_state
    current_state=$(get_current_state "$pattern_id")

    warn_msg "Rolling back from ${current_state} to ${target_state}"
    warn_msg "Reason: ${reason}"

    # Validate rollback transition
    if ! validate_transition "$current_state" "$target_state"; then
        error_exit "Cannot rollback from ${current_state} to ${target_state}. Not a valid transition."
    fi

    # Perform rollback transition
    local metadata="{\"rollback\": true, \"reason\": \"${reason}\"}"
    transition_state "$pattern_id" "$current_state" "$target_state" "$metadata"

    success_msg "Rollback completed successfully"
}

#######################################
# Log audit event
# Arguments:
#   $1 - Pattern ID
#   $2 - Event type
#   $3 - Event description
#   $4 - Event metadata (JSON, optional)
#######################################
log_audit_event() {
    local pattern_id="$1"
    local event_type="$2"
    local description="$3"
    local event_metadata="${4:-{}}"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%d %H:%M:%S")

    local audit_query="
    INSERT INTO workflow_audit_log (
        pattern_id,
        event_type,
        description,
        metadata,
        timestamp
    ) VALUES (
        '${pattern_id}',
        '${event_type}',
        '${description}',
        '${event_metadata}'::jsonb,
        '${timestamp}'
    );
    "

    execute_query "$audit_query" > /dev/null 2>&1 || warn_msg "Failed to log audit event"
}

#######################################
# Get state transition history
# Arguments:
#   $1 - Pattern ID (UUID)
#######################################
get_state_history() {
    local pattern_id="$1"

    local query="
    SELECT
        from_state,
        to_state,
        timestamp,
        metadata
    FROM pattern_state_history
    WHERE pattern_id = '${pattern_id}'
    ORDER BY timestamp DESC
    LIMIT 20;
    "

    info_msg "State transition history for pattern ${pattern_id}:"
    execute_query "$query"
}

#######################################
# Initialize database schema (if needed)
#######################################
init_schema() {
    info_msg "Initializing workflow_patterns schema..."

    local schema_query="
    -- Create workflow_patterns table if not exists
    CREATE TABLE IF NOT EXISTS workflow_patterns (
        id UUID PRIMARY KEY,
        pattern_name VARCHAR(255) NOT NULL,
        workflow_steps JSONB NOT NULL,
        occurrence_count INTEGER NOT NULL,
        teams_affected TEXT[] NOT NULL,
        similarity_score DECIMAL(3,2) NOT NULL,
        deterministic BOOLEAN DEFAULT FALSE,
        confidence_score DECIMAL(3,2) NOT NULL,
        estimated_savings_usd DECIMAL(10,2),
        priority VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'DETECTED'
    );

    -- Create state history table
    CREATE TABLE IF NOT EXISTS pattern_state_history (
        id SERIAL PRIMARY KEY,
        pattern_id UUID REFERENCES workflow_patterns(id) ON DELETE CASCADE,
        from_state VARCHAR(50) NOT NULL,
        to_state VARCHAR(50) NOT NULL,
        metadata JSONB DEFAULT '{}',
        timestamp TIMESTAMP DEFAULT NOW()
    );

    -- Create audit log table
    CREATE TABLE IF NOT EXISTS workflow_audit_log (
        id SERIAL PRIMARY KEY,
        pattern_id UUID,
        event_type VARCHAR(100) NOT NULL,
        description TEXT,
        metadata JSONB DEFAULT '{}',
        timestamp TIMESTAMP DEFAULT NOW()
    );

    -- Create index for faster queries
    CREATE INDEX IF NOT EXISTS idx_pattern_status ON workflow_patterns(status);
    CREATE INDEX IF NOT EXISTS idx_pattern_state_history_pattern_id ON pattern_state_history(pattern_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_pattern_id ON workflow_audit_log(pattern_id);
    "

    if execute_query "$schema_query" > /dev/null 2>&1; then
        success_msg "Schema initialized successfully"
    else
        error_exit "Failed to initialize schema"
    fi
}

#######################################
# Show usage information
#######################################
usage() {
    cat << EOF
Usage: $0 COMMAND [OPTIONS]

Commands:
    transition          Perform state transition
    get-state          Get current state of a pattern
    rollback           Rollback to a previous state
    history            Get state transition history
    init               Initialize database schema

Options:
    --pattern-id UUID   Pattern ID (required for most commands)
    --from-state STATE  Current state (required for transition)
    --to-state STATE    Target state (required for transition/rollback)
    --reason TEXT       Rollback reason (optional)
    --metadata JSON     Additional metadata (optional)

Valid States:
    DETECTED, GENERATING, PENDING_REVIEW, APPROVED, REJECTED, NEEDS_CORRECTION, DEPLOYED

Examples:
    # Transition from DETECTED to GENERATING
    $0 transition --pattern-id "123e4567-e89b-12d3-a456-426614174000" \\
        --from-state DETECTED --to-state GENERATING

    # Get current state
    $0 get-state --pattern-id "123e4567-e89b-12d3-a456-426614174000"

    # Rollback deployment
    $0 rollback --pattern-id "123e4567-e89b-12d3-a456-426614174000" \\
        --to-state APPROVED --reason "Bug found in production"

    # View history
    $0 history --pattern-id "123e4567-e89b-12d3-a456-426614174000"

EOF
    exit 1
}

#######################################
# Main execution
#######################################
main() {
    if [ $# -eq 0 ]; then
        usage
    fi

    local command="$1"
    shift

    # Parse arguments
    local pattern_id=""
    local from_state=""
    local to_state=""
    local reason=""
    local metadata="{}"

    while [ $# -gt 0 ]; do
        case "$1" in
            --pattern-id)
                pattern_id="$2"
                shift 2
                ;;
            --from-state)
                from_state="$2"
                shift 2
                ;;
            --to-state)
                to_state="$2"
                shift 2
                ;;
            --reason)
                reason="$2"
                shift 2
                ;;
            --metadata)
                metadata="$2"
                shift 2
                ;;
            *)
                error_exit "Unknown option: $1"
                ;;
        esac
    done

    # Execute command
    case "$command" in
        transition)
            [ -z "$pattern_id" ] && error_exit "--pattern-id required"
            [ -z "$from_state" ] && error_exit "--from-state required"
            [ -z "$to_state" ] && error_exit "--to-state required"

            transition_state "$pattern_id" "$from_state" "$to_state" "$metadata"
            ;;
        get-state)
            [ -z "$pattern_id" ] && error_exit "--pattern-id required"

            current_state=$(get_current_state "$pattern_id")
            echo "Current state: ${current_state}"
            ;;
        rollback)
            [ -z "$pattern_id" ] && error_exit "--pattern-id required"
            [ -z "$to_state" ] && error_exit "--to-state required"

            rollback_state "$pattern_id" "$to_state" "$reason"
            ;;
        history)
            [ -z "$pattern_id" ] && error_exit "--pattern-id required"

            get_state_history "$pattern_id"
            ;;
        init)
            init_schema
            ;;
        *)
            error_exit "Unknown command: $command"
            ;;
    esac
}

main "$@"
