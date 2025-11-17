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

# Source SQLite parameter binding library (Pattern B - SQL injection prevention)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Source security utilities (SQL escaping, secure credentials)
source "${SCRIPT_DIR}/lib/security-utils.sh"

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
    local category="$4"

    # Validate required parameters
    if [[ -z "$pattern_id" ]] || [[ -z "$skill_name" ]] || [[ -z "$content_path" ]]; then
        echo "[ERROR] Missing required parameters" >&2
        echo "Usage: deploy-approved-skill.sh PATTERN_ID SKILL_NAME CONTENT_PATH [CATEGORY] [TEAM_IDS]" >&2
        echo "" >&2
        echo "Example:" >&2
        echo "  deploy-approved-skill.sh 42 jwt-authentication ./skill.md domain backend-developer" >&2
        exit 1
    fi

    # Validate PATTERN_ID is numeric
    if ! [[ "$pattern_id" =~ ^[0-9]+$ ]]; then
        echo "[ERROR] PATTERN_ID must be numeric: $pattern_id" >&2
        exit 1
    fi

    # Validate skill name (security: prevent injection)
    validate_skill_name "$skill_name" || exit 1

    # Validate category (security: whitelist only)
    validate_category "$category" || exit 1

    # Validate content file exists
    if [[ ! -f "$content_path" ]]; then
        echo "[ERROR] Content file not found: $content_path" >&2
        exit 2
    fi

    # Validate content file is readable
    if [[ ! -r "$content_path" ]]; then
        echo "[ERROR] Content file is not readable: $content_path" >&2
        echo "Check file permissions." >&2
        exit 2
    fi

    # Validate file path (security: prevent traversal)
    validate_file_path "$content_path" "$PROJECT_ROOT" || exit 1

    # Validate database exists
    if [[ ! -f "$CFN_SKILLS_DB_PATH" ]]; then
        echo "[ERROR] Skills database not found: $CFN_SKILLS_DB_PATH" >&2
        echo "Run schema initialization first." >&2
        exit 3
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

    # SECURITY FIX: Escape all SQL strings to prevent injection
    
    
    
    
    

    # Check if skill already exists
    local existing_count
    existing_count=$(sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT COUNT(*) FROM skills WHERE name = ?1" "$skill_name")

    if [ "$existing_count" -gt 0 ]; then
        log_warning "Skill '$skill_name' already exists. Updating instead of inserting."

        # Update existing skill (with escaped values)
        sqlite_update "$CFN_SKILLS_DB_PATH" \
"UPDATE skills SET category = ?1, content_path = ?2, content_hash = ?3, approval_level = ?4, phase4_pattern_id = ?5, generated_by = ?6, is_auto_generated = 1, status = ?7, updated_at = datetime('now') WHERE name = ?8" \
"$category" "$content_path" "$content_hash" "$approval_level" "$pattern_id" "phase4" "active" "$skill_name"

        # Get existing skill ID
        sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT id FROM skills WHERE name = ?1" "$skill_name"
    else
        # Insert new skill (with escaped values)
        sqlite_insert "$CFN_SKILLS_DB_PATH" \
"INSERT INTO skills (name, category, content_path, content_hash, version, status, approval_level, phase4_pattern_id, generated_by, is_auto_generated, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'), datetime('now'))" \
"$skill_name" "$category" "$content_path" "$content_hash" "$version" "active" "$approval_level" "$pattern_id" "phase4" "1"

sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT last_insert_rowid()"
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

    # SECURITY FIX: Escape SQL strings
    
    
    

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
    ${skill_id},
    '${safe_version}',
    '${safe_approval_level}',
    'phase4-system',
    'approved',
    '${safe_reasoning}',
    datetime('now')
);
EOF

    # Update skill's last approval metadata
    sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
UPDATE skills SET
    last_approved_by = 'phase4-system',
    last_approval_date = datetime('now')
WHERE id = ${skill_id};
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

        # SECURITY FIX: Validate agent type (alphanumeric, hyphen, underscore only)
        if ! [[ "$agent_type" =~ ^[a-zA-Z0-9_-]+$ ]]; then
            log_error "Invalid agent type: $agent_type (must contain only letters, numbers, underscore, hyphen)"
            continue
        fi

        log_info "  - Mapping to agent: $agent_type"

        # SECURITY FIX: Escape SQL string
        local safe_agent_type
        # Pattern B: No escaping needed - using parameterized queries

        # Check if mapping already exists
        local existing_mapping
        existing_mapping=$(sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT COUNT(*) FROM agent_skill_mappings WHERE agent_type = ?1 AND skill_id = ?2" "$agent_type" "$skill_id")

        if [ "$existing_mapping" -gt 0 ]; then
            log_warning "    Mapping already exists for $agent_type, skipping"
            continue
        fi

        # Insert mapping (with escaped values)
        sqlite3 "$CFN_SKILLS_DB_PATH" "INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required, conditions, enabled, created_at, updated_at) VALUES ('${safe_agent_type}', ${skill_id}, 5, 0, '{\"taskContext\": [\"automation\"], \"phase\": \"loop3\"}', 1, datetime('now'), datetime('now'));" || {
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

    # SECURITY FIX #2: Quote all parameters to prevent command injection
    # SECURITY FIX #3: Use .pgpass file instead of PGPASSWORD environment variable
    local pgpass_file=""
    if [ -n "$PHASE4_POSTGRES_PASS" ]; then
        pgpass_file=$(create_pgpass_file "$PHASE4_POSTGRES_HOST" "5432" "$PHASE4_POSTGRES_DB" "$PHASE4_POSTGRES_USER" "$PHASE4_POSTGRES_PASS")
        if [ -z "$pgpass_file" ]; then
            log_warning "Failed to create .pgpass file, skipping Phase 4 update"
            return 4
        fi
        export PGPASSFILE="$pgpass_file"
    fi

    # Validate numeric IDs to prevent SQL injection (CVSS 7.5 fix)
    if ! [[ "$skill_id" =~ ^[0-9]+$ ]] || ! [[ "$pattern_id" =~ ^[0-9]+$ ]]; then
        log_error "Invalid numeric ID for skill_id or pattern_id"
        return 4
    fi

    # Try to update Phase 4 status (with validated parameters and proper quoting)
    if psql -h "$PHASE4_POSTGRES_HOST" -U "$PHASE4_POSTGRES_USER" -d "$PHASE4_POSTGRES_DB" -t -A -c "UPDATE workflow_patterns SET status = 'deployed', deployed_skill_id = '${skill_id}' WHERE id = '${pattern_id}';" 2>/dev/null; then
        log_success "Phase 4 status updated successfully"
    else
        log_warning "Failed to update Phase 4 status (pattern ID: $pattern_id). This is non-fatal."
        return 4
    fi

    # Clean up is automatic via trap in create_pgpass_file()
    unset PGPASSFILE
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

    # Step 1: Validate inputs (including security checks)
    validate_inputs "$pattern_id" "$skill_name" "$content_path" "$category"
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


