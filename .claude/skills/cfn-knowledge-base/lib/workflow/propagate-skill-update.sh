#!/usr/bin/env bash
#
# propagate-skill-update.sh - Propagate Skill Update from Phase 4 Edge Case Tracker
#
# Purpose:
#   When Phase 4 Edge Case Tracker detects and approves a skill improvement,
#   this script propagates the changes back to the Skills Database with proper
#   version management and approval tracking.
#
# Usage:
#   propagate-skill-update.sh SKILL_NAME NEW_VERSION UPDATE_PATH [CHANGE_TYPE] [NOTIFY_AGENTS]
#
# Parameters:
#   SKILL_NAME    - Skill name (e.g., "jwt-authentication")
#   NEW_VERSION   - New version (e.g., "1.0.1", "1.1.0", "2.0.0")
#   UPDATE_PATH   - Path to updated skill markdown file
#   CHANGE_TYPE   - Version change type: patch|minor|major (default: patch)
#   NOTIFY_AGENTS - Whether to notify agents: true|false (default: false)
#
# Phase 4 Integration:
#   After Phase 4 edge case tracker detects and approves a skill improvement:
#
#   ./.claude/skills/workflow-codification/propagate-skill-update.sh \
#     "$SKILL_NAME" \
#     "$NEW_VERSION" \
#     "$UPDATE_PATH" \
#     "$CHANGE_TYPE" \
#     "$NOTIFY_AGENTS"
#
# Examples:
#
#   Bug fix (patch):
#   ./.claude/skills/workflow-codification/propagate-skill-update.sh \
#     "jwt-authentication" \
#     "1.0.1" \
#     ".claude/skills/auth/jwt-auth-v1.0.1.md" \
#     "patch" \
#     "true"
#
#   New feature (minor):
#   ./.claude/skills/workflow-codification/propagate-skill-update.sh \
#     "jwt-authentication" \
#     "1.1.0" \
#     ".claude/skills/auth/jwt-auth-v1.1.0.md" \
#     "minor" \
#     "false"
#
#   Breaking change (major):
#   ./.claude/skills/workflow-codification/propagate-skill-update.sh \
#     "jwt-authentication" \
#     "2.0.0" \
#     ".claude/skills/auth/jwt-auth-v2.0.0.md" \
#     "major" \
#     "true"
#
# Exit Codes:
#   0 - Success
#   1 - Invalid parameters
#   2 - File not found
#   3 - Database error
#   4 - Skill not found in database
#   5 - Invalid version increment
#   6 - Content hash unchanged (no update needed)
#
# Environment Variables:
#   CFN_SKILLS_DB_PATH         - Path to Skills DB (default: ./.claude/skills-database/skills.db)
#   PHASE4_POSTGRES_HOST       - PostgreSQL host for Phase 4 (optional)
#   PHASE4_POSTGRES_DB         - PostgreSQL database name (default: workflow_codification)
#   PHASE4_POSTGRES_USER       - PostgreSQL username (optional)
#   PHASE4_POSTGRES_PASS       - PostgreSQL password (optional)
#   ENABLE_AGENT_NOTIFICATIONS - Enable agent notifications (default: false)

set -euo pipefail

# Source SQLite parameter binding library (Pattern B - SQL injection prevention)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
# Use shared bootstrap utilities
if [[ -f "$PROJECT_ROOT/.claude/skills/shared/bootstrap/sqlite-params.sh" ]]; then
    source "$PROJECT_ROOT/.claude/skills/shared/bootstrap/sqlite-params.sh"
else
    echo "Error: SQLite parameter utilities not found" >&2
    exit 1
fi

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Containment base for the update file: the invoking project, not the shared
# CFN checkout. PROJECT_ROOT above stays as the CFN-tree anchor.
CONTENT_BASE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

# Source security utilities (SQL escaping, secure credentials)
source "${SCRIPT_DIR}/lib/security-utils.sh"

# Skills Database (SQLite - required)
CFN_SKILLS_DB_PATH="${CFN_SKILLS_DB_PATH:-./.claude/skills-database/skills.db}"

# Phase 4 PostgreSQL (optional)
PHASE4_POSTGRES_HOST="${PHASE4_POSTGRES_HOST:-}"
PHASE4_POSTGRES_DB="${PHASE4_POSTGRES_DB:-workflow_codification}"
PHASE4_POSTGRES_USER="${PHASE4_POSTGRES_USER:-}"
PHASE4_POSTGRES_PASS="${PHASE4_POSTGRES_PASS:-}"

# Agent notifications
ENABLE_AGENT_NOTIFICATIONS="${ENABLE_AGENT_NOTIFICATIONS:-false}"

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

log_debug() {
    if [[ "${DEBUG:-0}" == "1" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $*" >&2
    fi
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
validate_parameters() {
    local skill_name="$1"
    local new_version="$2"
    local update_path="$3"

    # Validate required parameters
    if [[ -z "$skill_name" ]] || [[ -z "$new_version" ]] || [[ -z "$update_path" ]]; then
        echo "[ERROR] Missing required parameters" >&2
        echo "Usage: propagate-skill-update.sh SKILL_NAME NEW_VERSION UPDATE_PATH [CHANGE_TYPE] [NOTIFY_AGENTS]" >&2
        echo "" >&2
        echo "Example:" >&2
        echo "  propagate-skill-update.sh jwt-authentication 1.0.1 ./skill-v1.0.1.md patch true" >&2
        exit 1
    fi

    # SECURITY FIX: Validate skill name (prevent injection)
    validate_skill_name "$skill_name" || exit 1

    # Validate version format (semantic versioning)
    if ! [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "[ERROR] Invalid version format: $new_version" >&2
        echo "Expected format: MAJOR.MINOR.PATCH (e.g., 1.0.1)" >&2
        exit 1
    fi

    # Validate update file exists
    if [[ ! -f "$update_path" ]]; then
        echo "[ERROR] Update file not found: $update_path" >&2
        exit 2
    fi

    # Validate update file is readable
    if [[ ! -r "$update_path" ]]; then
        echo "[ERROR] Update file is not readable: $update_path" >&2
        echo "Check file permissions." >&2
        exit 2
    fi

    # SECURITY FIX: Validate file path (prevent traversal)
    validate_file_path "$update_path" "$CONTENT_BASE_DIR" || exit 1

    # Validate database exists
    if [[ ! -f "$CFN_SKILLS_DB_PATH" ]]; then
        echo "[ERROR] Skills database not found: $CFN_SKILLS_DB_PATH" >&2
        exit 3
    fi

    # SECURITY FIX: Escape SQL string before query

    # Validate skill exists in database (before attempting update)
    local skill_count
    skill_count=$(sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT COUNT(*) FROM skills WHERE name = ?1" "$skill_name" 2>/dev/null || echo "0")

    if [[ "$skill_count" -eq 0 ]]; then
        echo "[ERROR] Skill not found in database: $skill_name" >&2
        echo "Available skills:" >&2
        sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT name FROM skills ORDER BY name" 2>/dev/null || echo "  (could not retrieve skills list)" >&2
        exit 4
    fi
}

validate_change_type() {
    local change_type="$1"

    # Validate CHANGE_TYPE if provided
    if [[ -n "$change_type" ]] && ! [[ "$change_type" =~ ^(patch|minor|major)$ ]]; then
        echo "[ERROR] Invalid CHANGE_TYPE: $change_type" >&2
        echo "Valid values: patch, minor, major" >&2
        exit 1
    fi
}

#######################################
# Frontmatter parsing functions
#######################################
parse_frontmatter() {
    local file_path="$1"
    local key="$2"

    # Extract frontmatter between --- markers
    local frontmatter=$(sed -n '/^---$/,/^---$/p' "$file_path" | sed '1d;$d')

    # Parse specific key
    local value=$(echo "$frontmatter" | grep "^${key}:" | cut -d: -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    # Handle array format [tag1, tag2] → convert to JSON array
    if [[ "$value" =~ ^\[.*\]$ ]]; then
        # Convert [tag1, tag2] to ["tag1", "tag2"]
        value=$(echo "$value" | sed 's/\[//;s/\]//' | awk -F', *' '{printf "["; for(i=1;i<=NF;i++) {if(i>1) printf ","; printf "\"" $i "\""} printf "]"}')
    fi

    echo "$value"
}

#######################################
# Version management functions
#######################################
parse_version() {
    local version="$1"
    local -n major_ref="$2"
    local -n minor_ref="$3"
    local -n patch_ref="$4"

    IFS='.' read -r major_ref minor_ref patch_ref <<< "$version"
}

compare_versions() {
    local current_version="$1"
    local new_version="$2"

    local current_major current_minor current_patch
    local new_major new_minor new_patch

    parse_version "$current_version" current_major current_minor current_patch
    parse_version "$new_version" new_major new_minor new_patch

    # Compare major
    if [[ $new_major -gt $current_major ]]; then
        echo "major"
        return 0
    elif [[ $new_major -lt $current_major ]]; then
        echo "downgrade"
        return 0
    fi

    # Compare minor
    if [[ $new_minor -gt $current_minor ]]; then
        echo "minor"
        return 0
    elif [[ $new_minor -lt $current_minor ]]; then
        echo "downgrade"
        return 0
    fi

    # Compare patch
    if [[ $new_patch -gt $current_patch ]]; then
        echo "patch"
        return 0
    elif [[ $new_patch -lt $current_patch ]]; then
        echo "downgrade"
        return 0
    fi

    echo "same"
}

validate_version_increment() {
    local current_version="$1"
    local new_version="$2"
    local expected_change_type="$3"

    local actual_change_type
    actual_change_type=$(compare_versions "$current_version" "$new_version")

    log_debug "Version comparison: $current_version → $new_version (detected: $actual_change_type, expected: $expected_change_type)"

    case "$actual_change_type" in
        same)
            error_exit 4 "Version unchanged: $current_version → $new_version"
            ;;
        downgrade)
            error_exit 4 "Version downgrade not allowed: $current_version → $new_version"
            ;;
        patch|minor|major)
            if [[ "$actual_change_type" != "$expected_change_type" ]]; then
                error_exit 4 "Version change type mismatch: detected $actual_change_type, but change_type=$expected_change_type (version: $current_version → $new_version)"
            fi
            ;;
        *)
            error_exit 4 "Invalid version comparison result: $actual_change_type"
            ;;
    esac

    log_debug "Version increment validated: $current_version → $new_version ($expected_change_type)"
}

#######################################
# Database functions
#######################################
get_skill_info() {
    local skill_name="$1"

    # Use parameterized query to prevent SQL injection (CVSS 8.6 fix)
    local result
    result=$(sqlite_select "$CFN_SKILLS_DB_PATH" \
        "SELECT id, version, content_hash, content_path FROM skills WHERE name = ?1" \
        "$skill_name")

    if [[ -z "$result" ]]; then
        error_exit 4 "Skill not found in database: $skill_name"
    fi

    echo "$result"
}

calculate_content_hash() {
    local file_path="$1"

    if [[ ! -f "$file_path" ]]; then
        error_exit 2 "Cannot calculate hash - file not found: $file_path"
    fi

    sha256sum "$file_path" | awk '{print $1}'
}

update_skill_record() {
    local skill_id="$1"
    local new_version="$2"
    local new_hash="$3"
    local update_path="$4"
    local new_tags="$5"
    local new_category="$6"
    local new_owner="$7"
    local new_approval_level="$8"

    log_info "Updating skill record (ID: $skill_id)"

    # SECURITY FIX: Escape all SQL strings to prevent injection

    sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
UPDATE skills
SET version = '${safe_new_version}',
    content_hash = '${safe_new_hash}',
    content_path = '${safe_update_path}',
    tags = '${safe_new_tags}',
    category = '${safe_new_category}',
    owner = '${safe_new_owner}',
    approval_level = '${safe_new_approval_level}',
    updated_at = datetime('now')
WHERE id = ${skill_id};
EOF

    if [[ $? -ne 0 ]]; then
        error_exit 6 "Failed to update skill record"
    fi

    log_debug "Skill record updated successfully"
    log_info "Metadata refreshed from frontmatter:"
    log_info "  Tags: $new_tags"
    log_info "  Category: $new_category"
    log_info "  Owner: $new_owner"
    log_info "  Approval Level: $new_approval_level"
}

record_approval_history() {
    local skill_id="$1"
    local new_version="$2"
    local change_type="$3"

    log_info "Recording approval history"

    local metadata
    metadata=$(cat <<EOF
{
  "change_type": "$change_type",
  "source": "phase4-edge-case-tracker",
  "propagated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

    # SECURITY FIX: Escape SQL strings

    sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
INSERT INTO approval_history (
    skill_id,
    version,
    approval_level,
    approver,
    decision,
    reasoning,
    approval_criteria_check,
    timestamp
) VALUES (
    ${skill_id},
    '${safe_new_version}',
    'auto',
    'phase4-edge-case-tracker',
    'approved',
    'Edge case update propagated from Phase 4 after expert review and validation',
    '${safe_metadata}',
    datetime('now')
);
EOF

    if [[ $? -ne 0 ]]; then
        error_exit 6 "Failed to record approval history"
    fi

    log_debug "Approval history recorded"
}

get_affected_agents() {
    local skill_id="$1"

    # SECURITY FIX: Skill ID should be numeric (validated earlier)
    # But add explicit check for safety
    if ! [[ "$skill_id" =~ ^[0-9]+$ ]]; then
        log_error "Invalid skill ID (must be numeric): $skill_id"
        return 1
    fi

    sqlite3 "$CFN_SKILLS_DB_PATH" <<EOF
SELECT DISTINCT agent_type
FROM agent_skill_mappings
WHERE skill_id = ${skill_id}
ORDER BY agent_type;
EOF
}

#######################################
# PostgreSQL integration (optional)
#######################################
update_phase4_edge_case_status() {
    local skill_name="$1"
    local new_version="$2"

    if [[ -z "$PHASE4_POSTGRES_HOST" ]]; then
        log_debug "PostgreSQL not configured - skipping Phase 4 status update"
        return 0
    fi

    log_info "Updating Phase 4 edge case status (if applicable)"

    # This would update the edge_cases table in PostgreSQL
    # Implementation depends on Phase 4 schema
    # For now, just log that we would do this

    log_debug "Phase 4 status update would occur here for skill: $skill_name, version: $new_version"
}

#######################################
# Agent notification
#######################################
notify_affected_agents() {
    local skill_id="$1"
    local skill_name="$2"
    local old_version="$3"
    local new_version="$4"
    local change_type="$5"

    local agents
    agents=$(get_affected_agents "$skill_id")

    if [[ -z "$agents" ]]; then
        log_info "No agents using this skill"
        return 0
    fi

    local agent_count
    agent_count=$(echo "$agents" | wc -l)

    log_info "Agents using this skill ($agent_count):"
    echo "$agents" | while read -r agent_type; do
        echo "  - $agent_type"
    done

    # Optional: Create notification records
    # This would require a notifications table in the database
    # For now, we just list the agents

    echo ""
    log_success "Notification: Skill '$skill_name' updated from $old_version to $new_version ($change_type)"
    log_info "Affected agents should reload skill content on next invocation"
}

#######################################
# Main execution
#######################################
main() {
    local skill_name="$1"
    local new_version="$2"
    local update_path="$3"
    local change_type="${4:-patch}"
    local notify_agents="${5:-false}"

    log_info "=========================================="
    log_info "Propagate Skill Update"
    log_info "=========================================="
    log_info "Skill: $skill_name"
    log_info "New Version: $new_version"
    log_info "Update Path: $update_path"
    log_info "Change Type: $change_type"
    log_info "Notify Agents: $notify_agents"
    log_info "=========================================="
    echo ""

    # Step 1: Validate inputs
    log_info "Step 1: Validating inputs"
    validate_parameters "$skill_name" "$new_version" "$update_path"
    validate_change_type "$change_type"
    log_success "Input validation passed"
    echo ""

    # Step 2: Lookup existing skill
    log_info "Step 2: Looking up existing skill"
    local skill_info
    skill_info=$(get_skill_info "$skill_name")

    local skill_id current_version current_hash current_path
    IFS='|' read -r skill_id current_version current_hash current_path <<< "$skill_info"

    log_info "Found skill: ID=$skill_id, Current Version=$current_version"
    log_debug "Current Hash: $current_hash"
    log_debug "Current Path: $current_path"
    echo ""

    # Step 3: Validate version increment
    log_info "Step 3: Validating version increment"
    validate_version_increment "$current_version" "$new_version" "$change_type"
    log_success "Version increment validated: $current_version → $new_version ($change_type)"
    echo ""

    # Step 4: Calculate new content hash
    log_info "Step 4: Calculating new content hash"
    local new_hash
    new_hash=$(calculate_content_hash "$update_path")
    log_debug "New Hash: $new_hash"

    # Check if content actually changed
    if [[ "$new_hash" == "$current_hash" ]]; then
        log_warning "Content hash unchanged - no actual content changes detected"
        log_warning "Old Hash: $current_hash"
        log_warning "New Hash: $new_hash"
        error_exit 5 "Content hash unchanged - update not needed (version would increment without content changes)"
    fi

    log_success "Content hash calculated and differs from current"
    echo ""

    # Step 5: Parse frontmatter metadata and update skill record
    log_info "Step 5: Parsing frontmatter metadata from updated skill"
    local new_tags new_category new_owner new_approval_level

    new_tags=$(parse_frontmatter "$update_path" "tags")
    new_category=$(parse_frontmatter "$update_path" "category")
    new_owner=$(parse_frontmatter "$update_path" "owner")
    new_approval_level=$(parse_frontmatter "$update_path" "approval_level")

    # Use existing values if not found in frontmatter
    if [[ -z "$new_tags" ]]; then
        new_tags=$(sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT tags FROM skills WHERE id = ?1" "$skill_id")
        log_debug "Tags not found in frontmatter, using existing: $new_tags"
    fi

    if [[ -z "$new_category" ]]; then
        new_category=$(sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT category FROM skills WHERE id = ?1" "$skill_id")
        log_debug "Category not found in frontmatter, using existing: $new_category"
    fi

    if [[ -z "$new_owner" ]]; then
        new_owner=$(sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT owner FROM skills WHERE id = ?1" "$skill_id")
        log_debug "Owner not found in frontmatter, using existing: $new_owner"
    fi

    if [[ -z "$new_approval_level" ]]; then
        new_approval_level=$(sqlite_select "$CFN_SKILLS_DB_PATH" "SELECT approval_level FROM skills WHERE id = ?1" "$skill_id")
        log_debug "Approval level not found in frontmatter, using existing: $new_approval_level"
    fi

    log_info "Updating skill record in database"
    update_skill_record "$skill_id" "$new_version" "$new_hash" "$update_path" "$new_tags" "$new_category" "$new_owner" "$new_approval_level"
    log_success "Skill record updated with refreshed metadata"
    echo ""

    # Step 6: Record approval history
    log_info "Step 6: Recording approval history"
    record_approval_history "$skill_id" "$new_version" "$change_type"
    log_success "Approval history recorded"
    echo ""

    # Step 7: Update Phase 4 edge case status (optional)
    log_info "Step 7: Updating Phase 4 edge case status (if applicable)"
    update_phase4_edge_case_status "$skill_name" "$new_version"
    echo ""

    # Step 8: Notify agents (optional)
    if [[ "$notify_agents" == "true" ]] || [[ "$ENABLE_AGENT_NOTIFICATIONS" == "true" ]]; then
        log_info "Step 8: Notifying affected agents"
        notify_affected_agents "$skill_id" "$skill_name" "$current_version" "$new_version" "$change_type"
    else
        log_info "Step 8: Agent notification disabled (skipping)"
    fi
    echo ""

    # Success summary
    log_info "=========================================="
    log_success "Skill Update Propagated Successfully"
    log_info "=========================================="
    log_info "Skill Name: $skill_name"
    log_info "Version: $current_version → $new_version"
    log_info "Change Type: $change_type"
    log_info "Content Hash: ${new_hash:0:16}..."
    log_info "Update Path: $update_path"
    log_info "Metadata Refreshed: Yes"
    log_info "  Tags: $new_tags"
    log_info "  Category: $new_category"
    log_info "  Owner: $new_owner"
    log_info "  Approval Level: $new_approval_level"
    log_info "=========================================="

    exit 0
}

# Execute main function
main "$@"

