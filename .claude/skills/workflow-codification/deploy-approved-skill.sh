#!/usr/bin/env bash
#
# deploy-approved-skill.sh - Deploy Approved Skill from Phase 4 Workflow Codification
#
# Purpose:
#   After a workflow pattern is approved in Phase 4, this script deploys the generated
#   skill into the Skills Database with proper approval tracking and agent mappings.
#
# Usage:
#   deploy-approved-skill.sh PATTERN_ID SKILL_NAME CONTENT_PATH [CATEGORY] [TEAM_IDS]
#
# Parameters:
#   PATTERN_ID   - Phase 4 workflow pattern ID (numeric)
#   SKILL_NAME   - Skill name (e.g., "jwt-authentication")
#   CONTENT_PATH - Path to skill markdown file
#   CATEGORY     - Category: domain, coordination, infrastructure, testing, foundation (default: domain)
#   TEAM_IDS     - Comma-separated agent types (e.g., "backend-developer,api-designer")
#
# Phase 4 Integration:
#   After expert approves workflow pattern in Phase 4:
#
#   ./.claude/skills/workflow-codification/deploy-approved-skill.sh \
#     "$PATTERN_ID" \
#     "$SKILL_NAME" \
#     "$CONTENT_PATH" \
#     "$CATEGORY" \
#     "$TEAM_IDS"
#
# Example:
#   ./.claude/skills/workflow-codification/deploy-approved-skill.sh \
#     "42" \
#     "jwt-authentication" \
#     ".claude/skills/auth/jwt-auth.md" \
#     "domain" \
#     "backend-developer,api-designer"
#
# Exit Codes:
#   0 - Success
#   1 - Invalid parameters
#   2 - File not found
#   3 - Database error
#   4 - PostgreSQL connection error (warning only, continues)
#
# Environment Variables:
#   CFN_SKILLS_DB_PATH       - Path to Skills DB (default: ./.claude/skills-database/skills.db)
#   PHASE4_POSTGRES_HOST     - PostgreSQL host for Phase 4 (optional)
#   PHASE4_POSTGRES_DB       - PostgreSQL database name (default: workflow_codification)
#   PHASE4_POSTGRES_USER     - PostgreSQL username (optional)
#   PHASE4_POSTGRES_PASS     - PostgreSQL password (optional)

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Skills Database (SQLite - required)
CFN_SKILLS_DB_PATH="${CFN_SKILLS_DB_PATH:-./.claude/skills-database/skills.db}"

# Phase 4 PostgreSQL (optional)
PHASE4_POSTGRES_HOST="${PHASE4_POSTGRES_HOST:-}"
PHASE4_POSTGRES_DB="${PHASE4_POSTGRES_DB:-workflow_codification}"
PHASE4_POSTGRES_USER="${PHASE4_POSTGRES_USER:-}"
PHASE4_POSTGRES_PASS="${PHASE4_POSTGRES_PASS:-}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

#######################################
# Utility functions
#######################################
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" >&2
}

error_exit() {
    local exit_code="$1"
    shift
    log_error "$@"
    exit "$exit_code"
}

#######################################
# Validation functions
#######################################
validate_inputs() {
    local pattern_id="$1"
    local skill_name="$2"
    local content_path="$3"

    # Check all required parameters
    if [ -z "$pattern_id" ] || [ -z "$skill_name" ] || [ -z "$content_path" ]; then
        error_exit 1 "Missing required parameters. Usage: deploy-approved-skill.sh PATTERN_ID SKILL_NAME CONTENT_PATH [CATEGORY] [TEAM_IDS]"
    fi

    # Validate pattern ID is numeric
    if ! [[ "$pattern_id" =~ ^[0-9]+$ ]]; then
        error_exit 1 "PATTERN_ID must be numeric, got: '$pattern_id'"
    fi

    # Verify content path exists
    if [ ! -f "$content_path" ]; then
        error_exit 2 "Content file not found: $content_path"
    fi

    # Verify Skills DB exists
    if [ ! -f "$CFN_SKILLS_DB_PATH" ]; then
        error_exit 3 "Skills database not found: $CFN_SKILLS_DB_PATH"
    fi
}

#######################################
# Calculate content hash
#######################################
calculate_content_hash() {
    local content_path="$1"

    if command -v sha256sum &> /dev/null; then
        sha256sum "$content_path" | awk '{print $1}'
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$content_path" | awk '{print $1}'
    else
        error_exit 3 "Neither sha256sum nor shasum found. Cannot calculate content hash."
    fi
}

#######################################
# Determine approval level based on category
#######################################
determine_approval_level() {
    local category="$1"

    case "$category" in
        coordination|foundation|testing)
            echo "auto"
            ;;
        infrastructure)
            echo "escalate"
            ;;
        domain)
            echo "human"
            ;;
        *)
            # Default to human review for unknown categories
            echo "human"
            ;;
    esac
}

#######################################
# Insert skill into Skills DB
#######################################
insert_skill() {
    local pattern_id="$1"
    local skill_name="$2"
    local content_path="$3"
    local category="$4"
    local content_hash="$5"
    local approval_level="$6"

    log_info "Inserting skill into database: $skill_name"

    # Generate version (default: 1.0.0 for new skills)
    local version="1.0.0"

    # Check if skill already exists
    local existing_count
    existing_count=$(sqlite3 "$CFN_SKILLS_DB_PATH" "SELECT COUNT(*) FROM skills WHERE name = '$skill_name';")

    if [ "$existing_count" -gt 0 ]; then
        log_warning "Skill '$skill_name' already exists. Updating instead of inserting."

        # Update existing skill
        sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
UPDATE skills SET
    category = '$category',
    content_path = '$content_path',
    content_hash = '$content_hash',
    approval_level = '$approval_level',
    phase4_pattern_id = $pattern_id,
    generated_by = 'phase4',
    is_auto_generated = 1,
    status = 'active',
    updated_at = datetime('now')
WHERE name = '$skill_name';
EOF

        # Get existing skill ID
        sqlite3 "$CFN_SKILLS_DB_PATH" "SELECT id FROM skills WHERE name = '$skill_name';"
    else
        # Insert new skill
        sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
INSERT INTO skills (
    name,
    category,
    content_path,
    content_hash,
    version,
    status,
    approval_level,
    phase4_pattern_id,
    generated_by,
    is_auto_generated,
    created_at,
    updated_at
) VALUES (
    '$skill_name',
    '$category',
    '$content_path',
    '$content_hash',
    '$version',
    'active',
    '$approval_level',
    $pattern_id,
    'phase4',
    1,
    datetime('now'),
    datetime('now')
);

SELECT last_insert_rowid();
EOF
    fi
}

#######################################
# Record approval decision
#######################################
record_approval() {
    local skill_id="$1"
    local approval_level="$2"
    local version="$3"

    log_info "Recording approval decision for skill ID: $skill_id"

    local reasoning="Auto-approved by Phase 4 workflow codification system after expert review"

    sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
INSERT INTO approval_history (
    skill_id,
    version,
    approval_level,
    approver,
    decision,
    reasoning,
    timestamp
) VALUES (
    $skill_id,
    '$version',
    '$approval_level',
    'phase4-system',
    'approved',
    '$reasoning',
    datetime('now')
);
EOF

    # Update skill's last approval metadata
    sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
UPDATE skills SET
    last_approved_by = 'phase4-system',
    last_approval_date = datetime('now')
WHERE id = $skill_id;
EOF
}

#######################################
# Create agent mappings
#######################################
create_agent_mappings() {
    local skill_id="$1"
    local team_ids="$2"

    if [ -z "$team_ids" ]; then
        log_info "No agent mappings specified (TEAM_IDS empty)"
        return 0
    fi

    log_info "Creating agent skill mappings"

    # Split comma-separated team IDs
    local -a AGENTS
    IFS=',' read -ra AGENTS <<< "$team_ids"

    local mapping_count=0
    for agent_type in "${AGENTS[@]}"; do
        # Trim whitespace
        agent_type=$(echo "$agent_type" | xargs)

        if [ -z "$agent_type" ]; then
            continue
        fi

        log_info "  - Mapping to agent: $agent_type"

        # Check if mapping already exists
        local existing_mapping
        existing_mapping=$(sqlite3 "$CFN_SKILLS_DB_PATH" "SELECT COUNT(*) FROM agent_skill_mappings WHERE agent_type = '$agent_type' AND skill_id = $skill_id;")

        if [ "$existing_mapping" -gt 0 ]; then
            log_warning "    Mapping already exists for $agent_type, skipping"
            continue
        fi

        # Insert mapping
        sqlite3 "$CFN_SKILLS_DB_PATH" "INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required, conditions, enabled, created_at, updated_at) VALUES ('$agent_type', $skill_id, 5, 0, '{\"taskContext\": [\"automation\"], \"phase\": \"loop3\"}', 1, datetime('now'), datetime('now'));" || {
            log_error "Failed to insert mapping for $agent_type"
            return 3
        }

        mapping_count=$((mapping_count + 1))
    done

    log_info "Created $mapping_count agent skill mappings"
}

#######################################
# Update Phase 4 status (PostgreSQL - optional)
#######################################
update_phase4_status() {
    local pattern_id="$1"
    local skill_id="$2"

    # Check if PostgreSQL is configured
    if [ -z "$PHASE4_POSTGRES_HOST" ] || [ -z "$PHASE4_POSTGRES_USER" ]; then
        log_warning "PostgreSQL not configured, skipping Phase 4 status update"
        return 0
    fi

    log_info "Updating Phase 4 workflow pattern status"

    # Build psql connection string
    local psql_cmd="psql -h $PHASE4_POSTGRES_HOST -U $PHASE4_POSTGRES_USER -d $PHASE4_POSTGRES_DB -t -A"

    # Set password if provided
    if [ -n "$PHASE4_POSTGRES_PASS" ]; then
        export PGPASSWORD="$PHASE4_POSTGRES_PASS"
    fi

    # Try to update Phase 4 status
    if $psql_cmd -c "UPDATE workflow_patterns SET status = 'deployed', deployed_skill_id = $skill_id WHERE id = $pattern_id;" 2>/dev/null; then
        log_success "Phase 4 status updated successfully"
    else
        log_warning "Failed to update Phase 4 status (pattern ID: $pattern_id). This is non-fatal."
        return 4
    fi

    # Unset password
    unset PGPASSWORD
}

#######################################
# Main deployment logic
#######################################
main() {
    # Parse parameters
    local pattern_id="${1:-}"
    local skill_name="${2:-}"
    local content_path="${3:-}"
    local category="${4:-domain}"
    local team_ids="${5:-}"

    log_info "========================================="
    log_info "Deploy Approved Skill from Phase 4"
    log_info "========================================="
    log_info "Pattern ID: $pattern_id"
    log_info "Skill Name: $skill_name"
    log_info "Content Path: $content_path"
    log_info "Category: $category"
    log_info "Team IDs: ${team_ids:-<none>}"
    log_info "========================================="

    # Step 1: Validate inputs
    validate_inputs "$pattern_id" "$skill_name" "$content_path"
    log_success "Input validation passed"

    # Step 2: Calculate content hash
    local content_hash
    content_hash=$(calculate_content_hash "$content_path")
    log_success "Content hash calculated: $content_hash"

    # Step 3: Determine approval level
    local approval_level
    approval_level=$(determine_approval_level "$category")
    log_success "Approval level determined: $approval_level (category: $category)"

    # Step 4: Insert skill into database
    local skill_id
    skill_id=$(insert_skill "$pattern_id" "$skill_name" "$content_path" "$category" "$content_hash" "$approval_level")

    # Remove any whitespace/newlines from skill_id
    skill_id=$(echo "$skill_id" | tr -d '[:space:]')

    if [ -z "$skill_id" ]; then
        error_exit 3 "Failed to insert skill into database"
    fi

    log_success "Skill inserted/updated with ID: $skill_id"

    # Step 5: Record approval decision
    record_approval "$skill_id" "$approval_level" "1.0.0"
    log_success "Approval decision recorded"

    # Step 6: Create agent mappings
    if [ -n "$team_ids" ]; then
        create_agent_mappings "$skill_id" "$team_ids"
        log_success "Agent mappings created"
    fi

    # Step 7: Update Phase 4 status (optional)
    update_phase4_status "$pattern_id" "$skill_id" || true

    # Step 8: Output success message
    log_info "========================================="
    log_success "Deployment Complete!"
    log_info "========================================="
    log_info "Skill ID: $skill_id"
    log_info "Skill Name: $skill_name"
    log_info "Approval Level: $approval_level"
    log_info "Category: $category"

    if [ -n "$team_ids" ]; then
        log_info "Mapped Agent Types: $team_ids"
    fi

    log_info "========================================="

    # Output skill ID for programmatic use
    echo "$skill_id"
}

# Execute main function
main "$@"
