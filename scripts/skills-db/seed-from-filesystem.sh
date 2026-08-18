#!/usr/bin/env bash
#
# Filesystem Migration Script - Skills Database v2
# Imports all existing skills from .claude/skills/ into the Skills Database
# with intelligent approval level inference
#
# Version: 2.0.0
# Author: Claude Flow Novice Team
# Date: 2025-11-16

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_DIR="$PROJECT_ROOT/.claude/skills"
DB_PATH="$PROJECT_ROOT/.claude/skills-database/skills.db"
REPORT_PATH="$PROJECT_ROOT/.claude/skills-database/migration-report.txt"
TEMP_DIR="/tmp/skills-migration-$$"

# Default parameters
DRY_RUN=false
CATEGORY_FILTER=""
FORCE=false
VERBOSE=false
REPORT_ONLY=false

# Statistics counters
TOTAL_FOUND=0
TOTAL_IMPORTED=0
TOTAL_SKIPPED=0
TOTAL_FAILED=0
AUTO_APPROVED=0
ESCALATED=0
HUMAN_APPROVED=0

# Category mappings
declare -A CATEGORY_MAP=(
    ["coordination"]="coordination"
    ["testing"]="testing"
    ["infrastructure"]="infrastructure"
    ["domain"]="domain"
    ["foundation"]="foundation"
)

# ============================================================================
# Helper Functions
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        log "VERBOSE: $*"
    fi
}

error() {
    log "ERROR: $*" >&2
}

fatal() {
    error "$*"
    exit 1
}

# ============================================================================
# YAML Frontmatter Parser
# ============================================================================

parse_frontmatter() {
    local file="$1"
    local key="$2"
    local default="${3:-}"

    # Extract YAML frontmatter between --- delimiters
    local frontmatter
    frontmatter=$(awk '/^---$/{flag=!flag;next}flag' "$file" 2>/dev/null || echo "")

    if [[ -z "$frontmatter" ]]; then
        echo "$default"
        return 0
    fi

    # Parse specific key
    local value
    value=$(echo "$frontmatter" | grep "^${key}:" | head -1 | sed "s/^${key}:\s*//" | sed 's/^["'\'']\|["'\'']$//g' || echo "$default")

    # Handle array values (convert to JSON)
    if [[ "$value" =~ ^\[.*\]$ ]]; then
        # Already JSON-like format
        echo "$value"
    else
        echo "$value"
    fi
}

# ============================================================================
# Content Analysis Functions
# ============================================================================

detect_external_api_calls() {
    local file="$1"

    # Check for common external API patterns
    if grep -qE 'curl|wget|http://|https://|fetch\(|axios|request\(' "$file" 2>/dev/null; then
        return 0  # true
    fi

    return 1  # false
}

detect_docker_operations() {
    local file="$1"

    if grep -qE 'docker\s|docker-compose|dockerfile|FROM\s|RUN\s' "$file" 2>/dev/null; then
        return 0
    fi

    return 1
}

detect_security_operations() {
    local file="$1"

    if grep -qiE 'auth|crypto|secret|password|token|jwt|oauth|credential|private.*key' "$file" 2>/dev/null; then
        return 0
    fi

    return 1
}

detect_redis_postgres() {
    local file="$1"

    if grep -qiE 'redis|postgresql|postgres|psql|pg_|redis-cli' "$file" 2>/dev/null; then
        return 0
    fi

    return 1
}

detect_production_impact() {
    local file="$1"

    if grep -qiE 'production|revenue|business.*logic|payment|billing|customer.*data' "$file" 2>/dev/null; then
        return 0
    fi

    return 1
}

count_function_definitions() {
    local file="$1"

    # Count bash function definitions
    local count
    count=$(grep -cE '^[a-zA-Z_][a-zA-Z0-9_]*\(\)' "$file" 2>/dev/null) || count=0

    echo "$count"
}

get_file_size_kb() {
    local file="$1"

    local size_bytes
    size_bytes=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)

    echo $((size_bytes / 1024))
}

# ============================================================================
# Approval Level Inference Engine
# ============================================================================

infer_approval_level() {
    local file="$1"
    local category="$2"
    local frontmatter_exists="$3"

    local approval_level="human"  # Default to most conservative
    local reasoning=""

    # If no frontmatter, require human review
    if [[ "$frontmatter_exists" == "false" ]]; then
        approval_level="human"
        reasoning="No frontmatter found - manual review required"
        echo "${approval_level}|${reasoning}"
        return 0
    fi

    # Get file metrics
    local file_size_kb
    file_size_kb=$(get_file_size_kb "$file")

    local func_count
    func_count=$(count_function_definitions "$file")

    # Check for high-risk indicators
    local has_external_api=false
    local has_docker=false
    local has_security=false
    local has_redis_postgres=false
    local has_production=false

    detect_external_api_calls "$file" && has_external_api=true
    detect_docker_operations "$file" && has_docker=true
    detect_security_operations "$file" && has_security=true
    detect_redis_postgres "$file" && has_redis_postgres=true
    detect_production_impact "$file" && has_production=true

    verbose "File: $file"
    verbose "  Size: ${file_size_kb}KB, Functions: $func_count"
    verbose "  External API: $has_external_api, Docker: $has_docker"
    verbose "  Security: $has_security, Redis/PG: $has_redis_postgres"
    verbose "  Production: $has_production"

    # ========================================================================
    # AUTO-APPROVED Criteria (ALL must be met)
    # ========================================================================
    if [[ "$category" =~ ^(coordination|testing|foundation)$ ]] \
        && [[ $file_size_kb -lt 15 ]] \
        && [[ $func_count -lt 5 ]] \
        && [[ "$has_external_api" == "false" ]] \
        && [[ "$has_docker" == "false" ]] \
        && [[ "$has_security" == "false" ]] \
        && [[ "$has_redis_postgres" == "false" ]] \
        && [[ "$has_production" == "false" ]]; then

        approval_level="auto"
        reasoning="Low-risk: category=$category, size=${file_size_kb}KB, complexity=$func_count, no external deps"
        echo "${approval_level}|${reasoning}"
        return 0
    fi

    # ========================================================================
    # HUMAN-APPROVED Criteria (ANY triggers human review)
    # ========================================================================
    if [[ $func_count -ge 10 ]] \
        || [[ "$has_security" == "true" ]] \
        || [[ "$has_production" == "true" ]]; then

        approval_level="human"

        local reasons=()
        [[ $func_count -ge 10 ]] && reasons+=("high complexity (${func_count} functions)")
        [[ "$has_security" == "true" ]] && reasons+=("security-sensitive operations")
        [[ "$has_production" == "true" ]] && reasons+=("production impact detected")

        reasoning=$(IFS=", "; echo "${reasons[*]}")
        echo "${approval_level}|${reasoning}"
        return 0
    fi

    # ========================================================================
    # ESCALATED Criteria (remaining cases)
    # ========================================================================
    approval_level="escalate"

    local reasons=()
    [[ "$category" =~ ^(infrastructure|domain)$ ]] && reasons+=("category=$category")
    [[ "$has_external_api" == "true" ]] && reasons+=("external API calls")
    [[ "$has_docker" == "true" ]] && reasons+=("Docker operations")
    [[ "$has_redis_postgres" == "true" ]] && reasons+=("Redis/PostgreSQL operations")
    [[ $func_count -ge 6 ]] && reasons+=("moderate complexity (${func_count} functions)")

    if [[ ${#reasons[@]} -eq 0 ]]; then
        reasons+=("moderate risk profile")
    fi

    reasoning=$(IFS=", "; echo "${reasons[*]}")
    echo "${approval_level}|${reasoning}"
}

# ============================================================================
# Database Operations
# ============================================================================

calculate_content_hash() {
    local file="$1"

    sha256sum "$file" | awk '{print $1}'
}

insert_skill() {
    local name="$1"
    local category="$2"
    local team="$3"
    local content_path="$4"
    local content_hash="$5"
    local tags="$6"
    local version="$7"
    local status="$8"
    local approval_level="$9"
    local owner="${10}"

    local sql="INSERT INTO skills (
        name, category, team, content_path, content_hash, tags,
        version, status, approval_level, generated_by, owner,
        created_at, updated_at
    ) VALUES (
        '$name', '$category', '$team', '$content_path', '$content_hash', '$tags',
        '$version', '$status', '$approval_level', 'manual', '$owner',
        datetime('now'), datetime('now')
    );"

    if [[ "$DRY_RUN" == "true" ]]; then
        verbose "DRY-RUN: Would execute: $sql"
        return 0
    fi

    sqlite3 "$DB_PATH" "$sql" 2>/dev/null || return 1
}

update_skill() {
    local name="$1"
    local content_hash="$2"
    local version="$3"
    local approval_level="$4"

    local sql="UPDATE skills SET
        content_hash = '$content_hash',
        version = '$version',
        approval_level = '$approval_level',
        updated_at = datetime('now')
    WHERE name = '$name';"

    if [[ "$DRY_RUN" == "true" ]]; then
        verbose "DRY-RUN: Would execute: $sql"
        return 0
    fi

    sqlite3 "$DB_PATH" "$sql" 2>/dev/null || return 1
}

get_skill_id() {
    local name="$1"

    sqlite3 "$DB_PATH" "SELECT id FROM skills WHERE name = '$name' LIMIT 1;" 2>/dev/null || echo ""
}

skill_exists() {
    local name="$1"

    local count
    count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skills WHERE name = '$name';" 2>/dev/null || echo 0)

    [[ $count -gt 0 ]]
}

insert_approval_history() {
    local skill_id="$1"
    local version="$2"
    local approval_level="$3"
    local reasoning="$4"

    local approver="seed-from-filesystem"
    local decision="approved"

    # Only create approval history for auto-approved skills during migration
    if [[ "$approval_level" != "auto" ]]; then
        return 0
    fi

    local sql="INSERT INTO approval_history (
        skill_id, version, approval_level, approver, decision, reasoning, timestamp
    ) VALUES (
        $skill_id, '$version', '$approval_level', '$approver', '$decision',
        '$reasoning', datetime('now')
    );"

    if [[ "$DRY_RUN" == "true" ]]; then
        verbose "DRY-RUN: Would execute: $sql"
        return 0
    fi

    sqlite3 "$DB_PATH" "$sql" 2>/dev/null || return 1
}

# ============================================================================
# Skill Processing
# ============================================================================

process_skill_file() {
    local skill_file="$1"

    log "Processing: $(basename "$(dirname "$skill_file")")/$(basename "$skill_file")"
    verbose "Full path: $skill_file"

    # Extract directory name as potential skill name
    local skill_dir
    skill_dir=$(dirname "$skill_file")
    local skill_name
    skill_name=$(basename "$skill_dir")

    # Parse frontmatter
    local fm_name
    fm_name=$(parse_frontmatter "$skill_file" "name" "$skill_name")

    local fm_version
    fm_version=$(parse_frontmatter "$skill_file" "version" "1.0.0")

    local fm_category
    fm_category=$(parse_frontmatter "$skill_file" "category" "foundation")

    local fm_team
    fm_team=$(parse_frontmatter "$skill_file" "team" "cfn")

    local fm_tags
    fm_tags=$(parse_frontmatter "$skill_file" "tags" "[]")

    local fm_status
    fm_status=$(parse_frontmatter "$skill_file" "status" "active")

    local fm_owner
    fm_owner=$(parse_frontmatter "$skill_file" "owner" "cfn-team")

    # Check if frontmatter exists
    local frontmatter_exists="true"
    if ! grep -q "^---$" "$skill_file" 2>/dev/null; then
        frontmatter_exists="false"
    fi

    # Normalize category
    local normalized_category="${CATEGORY_MAP[$fm_category]:-foundation}"

    # Calculate content hash
    local content_hash
    content_hash=$(calculate_content_hash "$skill_file")

    # Relative path from project root
    local relative_path="${skill_file#$PROJECT_ROOT/}"

    # Infer approval level
    local approval_info
    approval_info=$(infer_approval_level "$skill_file" "$normalized_category" "$frontmatter_exists")

    local approval_level
    approval_level=$(echo "$approval_info" | cut -d'|' -f1)

    local approval_reasoning
    approval_reasoning=$(echo "$approval_info" | cut -d'|' -f2-)

    verbose "  Name: $fm_name"
    verbose "  Version: $fm_version"
    verbose "  Category: $normalized_category"
    verbose "  Approval: $approval_level"
    verbose "  Reasoning: $approval_reasoning"

    # Check if category filter applies
    if [[ -n "$CATEGORY_FILTER" ]] && [[ "$normalized_category" != "$CATEGORY_FILTER" ]]; then
        verbose "  SKIPPED: Category filter mismatch"
        ((TOTAL_SKIPPED++)) || true
        return 0
    fi

    # Check if skill already exists
    if skill_exists "$fm_name"; then
        if [[ "$FORCE" == "true" ]]; then
            verbose "  UPDATING: Skill already exists, forcing update"

            if update_skill "$fm_name" "$content_hash" "$fm_version" "$approval_level"; then
                ((TOTAL_IMPORTED++)) || true

                case "$approval_level" in
                    auto) ((AUTO_APPROVED++)) || true ;;
                    escalate) ((ESCALATED++)) || true ;;
                    human) ((HUMAN_APPROVED++)) || true ;;
                esac

                # Update approval history
                local skill_id
                skill_id=$(get_skill_id "$fm_name")
                insert_approval_history "$skill_id" "$fm_version" "$approval_level" "$approval_reasoning"

                log "UPDATED: $fm_name ($approval_level)"
            else
                error "Failed to update skill: $fm_name"
                ((TOTAL_FAILED++)) || true
            fi
        else
            verbose "  SKIPPED: Skill already exists (use --force to update)"
            ((TOTAL_SKIPPED++)) || true
        fi
        return 0
    fi

    # Insert new skill
    if insert_skill "$fm_name" "$normalized_category" "$fm_team" "$relative_path" \
        "$content_hash" "$fm_tags" "$fm_version" "$fm_status" "$approval_level" "$fm_owner"; then

        ((TOTAL_IMPORTED++))

        case "$approval_level" in
            auto) ((AUTO_APPROVED++)) ;;
            escalate) ((ESCALATED++)) ;;
            human) ((HUMAN_APPROVED++)) ;;
        esac

        # Insert approval history for auto-approved skills
        local skill_id
        skill_id=$(get_skill_id "$fm_name")
        insert_approval_history "$skill_id" "$fm_version" "$approval_level" "$approval_reasoning"

        log "IMPORTED: $fm_name ($approval_level)"
    else
        error "Failed to insert skill: $fm_name"
        ((TOTAL_FAILED++)) || true
    fi
}

# ============================================================================
# Discovery Phase
# ============================================================================

discover_skills() {
    log "Discovering skills in: $SKILLS_DIR"

    if [[ ! -d "$SKILLS_DIR" ]]; then
        fatal "Skills directory not found: $SKILLS_DIR"
    fi

    # Count SKILL.md files using a simpler approach
    TOTAL_FOUND=$(find "$SKILLS_DIR" -name "SKILL.md" 2>/dev/null | wc -l)

    log "Found $TOTAL_FOUND skill files"

    if [[ $TOTAL_FOUND -eq 0 ]]; then
        fatal "No SKILL.md files found in $SKILLS_DIR"
    fi
}

# ============================================================================
# Reporting
# ============================================================================

generate_report() {
    local report_file="$1"

    log "Generating migration report: $report_file"

    {
        echo "========================================================================"
        echo "Skills Database v2 - Filesystem Migration Report"
        echo "========================================================================"
        echo ""
        echo "Date: $(date +'%Y-%m-%d %H:%M:%S')"
        echo "Database: $DB_PATH"
        echo "Skills Directory: $SKILLS_DIR"
        echo ""
        echo "========================================================================"
        echo "Summary Statistics"
        echo "========================================================================"
        echo ""
        echo "Total Skills Found:    $TOTAL_FOUND"
        echo "Successfully Imported: $TOTAL_IMPORTED"
        echo "Skipped:               $TOTAL_SKIPPED"
        echo "Failed:                $TOTAL_FAILED"
        echo ""
        echo "========================================================================"
        echo "Approval Level Distribution"
        echo "========================================================================"
        echo ""
        echo "Auto-Approved:         $AUTO_APPROVED ($(awk "BEGIN {printf \"%.1f\", ($AUTO_APPROVED/$TOTAL_IMPORTED)*100}")%)"
        echo "Escalated Review:      $ESCALATED ($(awk "BEGIN {printf \"%.1f\", ($ESCALATED/$TOTAL_IMPORTED)*100}")%)"
        echo "Human Review:          $HUMAN_APPROVED ($(awk "BEGIN {printf \"%.1f\", ($HUMAN_APPROVED/$TOTAL_IMPORTED)*100}")%)"
        echo ""

        if [[ "$DRY_RUN" == "false" ]]; then
            echo "========================================================================"
            echo "Category Breakdown (from database)"
            echo "========================================================================"
            echo ""

            sqlite3 "$DB_PATH" "
                SELECT
                    category,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM skills), 1) as percentage
                FROM skills
                GROUP BY category
                ORDER BY count DESC;
            " | while IFS='|' read -r category count percentage; do
                printf "%-20s %3d (%5.1f%%)\n" "$category:" "$count" "$percentage"
            done

            echo ""
            echo "========================================================================"
            echo "Approval Level Summary (from database)"
            echo "========================================================================"
            echo ""

            sqlite3 "$DB_PATH" "
                SELECT
                    approval_level,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM skills), 1) as percentage
                FROM skills
                GROUP BY approval_level
                ORDER BY count DESC;
            " | while IFS='|' read -r level count percentage; do
                printf "%-20s %3d (%5.1f%%)\n" "$level:" "$count" "$percentage"
            done

            echo ""
            echo "========================================================================"
            echo "Recent Approvals (last 10)"
            echo "========================================================================"
            echo ""

            sqlite3 "$DB_PATH" "
                SELECT
                    s.name,
                    ah.approval_level,
                    ah.decision,
                    ah.reasoning
                FROM approval_history ah
                JOIN skills s ON ah.skill_id = s.id
                ORDER BY ah.timestamp DESC
                LIMIT 10;
            " | while IFS='|' read -r name level decision reasoning; do
                echo "Skill: $name"
                echo "  Level: $level | Decision: $decision"
                echo "  Reasoning: $reasoning"
                echo ""
            done
        fi

        echo "========================================================================"
        echo "End of Report"
        echo "========================================================================"

    } > "$report_file"

    cat "$report_file"
}

# ============================================================================
# Main Execution
# ============================================================================

usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Filesystem Migration Script - Skills Database v2
Import all existing skills from .claude/skills/ into the Skills Database

OPTIONS:
    --dry-run            Show what would be imported without inserting
    --category=<name>    Import only specific category (coordination|testing|infrastructure|domain|foundation)
    --force              Re-import even if skill already exists (update)
    --verbose            Detailed logging per skill
    --report-only        Generate report without importing
    -h, --help           Show this help message

EXAMPLES:
    # Import all skills
    $0

    # Dry run to preview changes
    $0 --dry-run

    # Import only coordination skills
    $0 --category=coordination

    # Force re-import all skills with verbose logging
    $0 --force --verbose

    # Generate report only
    $0 --report-only

EOF
    exit 0
}

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --category=*)
                CATEGORY_FILTER="${1#*=}"
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --report-only)
                REPORT_ONLY=true
                shift
                ;;
            -h|--help)
                usage
                ;;
            *)
                error "Unknown option: $1"
                usage
                ;;
        esac
    done

    # Validate database exists
    if [[ ! -f "$DB_PATH" ]]; then
        fatal "Database not found: $DB_PATH"
    fi

    # Show configuration
    log "Starting filesystem migration"
    log "Configuration:"
    log "  Dry Run: $DRY_RUN"
    log "  Category Filter: ${CATEGORY_FILTER:-none}"
    log "  Force Update: $FORCE"
    log "  Verbose: $VERBOSE"
    log "  Report Only: $REPORT_ONLY"

    if [[ "$REPORT_ONLY" == "true" ]]; then
        log "Report-only mode: generating report from current database state"
        generate_report "$REPORT_PATH"
        exit 0
    fi

    # Create temp directory
    mkdir -p "$TEMP_DIR"
    trap "rm -rf '$TEMP_DIR'" EXIT

    # Discover and count skills
    discover_skills

    # Process each skill
    log "Processing skills..."

    # Store skill files in temp file to avoid process substitution issues
    local skill_list="$TEMP_DIR/skill_files.txt"
    find "$SKILLS_DIR" -name "SKILL.md" 2>/dev/null > "$skill_list"

    while IFS= read -r skill_file; do
        process_skill_file "$skill_file"
    done < "$skill_list"

    # Generate report
    log ""
    log "Migration complete!"
    log ""

    generate_report "$REPORT_PATH"

    # Exit with appropriate code
    if [[ $TOTAL_FAILED -gt 0 ]]; then
        error "Migration completed with $TOTAL_FAILED failures"
        exit 1
    fi

    log ""
    log "All skills processed successfully!"
    log "Report saved to: $REPORT_PATH"
}

# Execute main function
main "$@"
