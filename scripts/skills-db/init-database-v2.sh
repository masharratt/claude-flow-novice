#!/usr/bin/env bash
# ============================================================================
# Skills Database v2 - Initialization Script
# ============================================================================
# Description: Creates SQLite database, applies schema, seeds bootstrap data
# Author: CFN System
# Version: 2.0.0
# Date: 2025-11-16
# ============================================================================

set -euo pipefail

# ============================================================================
# GLOBAL VARIABLES
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DB_DIR="${PROJECT_ROOT}/.claude/skills-database"
DB_PATH="${DB_DIR}/skills.db"
SCHEMA_PATH="${DB_DIR}/schema-v2.sql"
BACKUP_DIR="${DB_DIR}/backups"

# Flags
FORCE=false
SKIP_EXISTING=false
VALIDATE_ONLY=false
VERBOSE=false

# Exit codes
EXIT_SUCCESS=0
EXIT_VALIDATION_ERROR=1
EXIT_DEPENDENCY_MISSING=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_verbose() {
    if [[ "${VERBOSE}" == "true" ]]; then
        echo -e "${BLUE}[VERBOSE]${NC} $1"
    fi
}

# Print usage information
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Initialize Skills Database v2 with schema and bootstrap data.

OPTIONS:
    --force             Overwrite existing database without prompt
    --skip-existing     Exit quietly if database already exists
    --validate-only     Only validate existing database (no creation)
    --verbose           Enable detailed logging
    -h, --help          Show this help message

EXAMPLES:
    # Create new database (prompts if exists)
    $(basename "$0")

    # Force overwrite existing database
    $(basename "$0") --force

    # Validate existing database
    $(basename "$0") --validate-only

EXIT CODES:
    0   Success
    1   Validation error
    2   Missing dependency

EOF
}

# ============================================================================
# DEPENDENCY CHECKS
# ============================================================================

check_dependencies() {
    log_info "Checking dependencies..."

    local missing_deps=()

    # Check sqlite3
    if ! command -v sqlite3 &>/dev/null; then
        missing_deps+=("sqlite3")
    fi

    # Check jq
    if ! command -v jq &>/dev/null; then
        missing_deps+=("jq")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Install with: apt-get install sqlite3 jq"
        return ${EXIT_DEPENDENCY_MISSING}
    fi

    log_verbose "All dependencies satisfied (sqlite3, jq)"
    return 0
}

# ============================================================================
# ENVIRONMENT SETUP
# ============================================================================

setup_environment() {
    log_info "Setting up environment..."

    # Create database directory if needed
    if [[ ! -d "${DB_DIR}" ]]; then
        log_verbose "Creating database directory: ${DB_DIR}"
        mkdir -p "${DB_DIR}"
    fi

    # Create backup directory if needed
    if [[ ! -d "${BACKUP_DIR}" ]]; then
        log_verbose "Creating backup directory: ${BACKUP_DIR}"
        mkdir -p "${BACKUP_DIR}"
    fi

    # Validate schema file exists
    if [[ ! -f "${SCHEMA_PATH}" ]]; then
        log_error "Schema file not found: ${SCHEMA_PATH}"
        log_error "Expected location: .claude/skills-database/schema-v2.sql"
        return ${EXIT_VALIDATION_ERROR}
    fi

    log_verbose "Schema file found: ${SCHEMA_PATH}"
    return 0
}

# ============================================================================
# DATABASE EXISTENCE HANDLING
# ============================================================================

handle_existing_database() {
    if [[ ! -f "${DB_PATH}" ]]; then
        log_verbose "No existing database found"
        return 0
    fi

    log_info "Existing database found: ${DB_PATH}"

    # Handle --skip-existing flag
    if [[ "${SKIP_EXISTING}" == "true" ]]; then
        log_info "Skipping initialization (--skip-existing flag set)"
        exit ${EXIT_SUCCESS}
    fi

    # Handle --force flag
    if [[ "${FORCE}" == "true" ]]; then
        backup_existing_database
        return 0
    fi

    # Prompt user for action
    echo ""
    echo -e "${YELLOW}Database already exists. Choose an action:${NC}"
    echo "  1) Backup and overwrite"
    echo "  2) Exit without changes"
    read -r -p "Enter choice [1-2]: " choice

    case "${choice}" in
        1)
            backup_existing_database
            ;;
        2)
            log_info "Exiting without changes"
            exit ${EXIT_SUCCESS}
            ;;
        *)
            log_error "Invalid choice: ${choice}"
            exit ${EXIT_VALIDATION_ERROR}
            ;;
    esac
}

backup_existing_database() {
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="${BACKUP_DIR}/skills_${timestamp}.db"

    log_info "Backing up existing database to: ${backup_path}"
    cp "${DB_PATH}" "${backup_path}"
    log_success "Backup created successfully"

    # Remove existing database
    rm -f "${DB_PATH}"
    log_verbose "Existing database removed"
}

# ============================================================================
# SCHEMA APPLICATION
# ============================================================================

apply_schema() {
    log_info "Applying schema to database..."

    # Execute schema file
    if ! sqlite3 "${DB_PATH}" < "${SCHEMA_PATH}"; then
        log_error "Failed to apply schema"
        rollback_database
        return ${EXIT_VALIDATION_ERROR}
    fi

    log_success "Schema applied successfully"
    return 0
}

rollback_database() {
    log_warning "Rolling back database creation..."
    if [[ -f "${DB_PATH}" ]]; then
        rm -f "${DB_PATH}"
        log_info "Database removed"
    fi
}

# ============================================================================
# DATABASE VALIDATION
# ============================================================================

validate_database() {
    log_info "Validating database structure..."

    local validation_passed=true

    # Expected table names
    local expected_tables=(
        "skills"
        "approval_history"
        "approval_criteria_templates"
        "agent_skill_mappings"
        "skill_usage_log"
        "bootstrap_skills"
        "phase4_skill_generation"
        "edge_case_tracking"
        "schema_versions"
    )

    # Count tables
    local table_count
    table_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    log_verbose "Tables found: ${table_count}"

    if [[ ${table_count} -ne ${#expected_tables[@]} ]]; then
        log_error "Expected ${#expected_tables[@]} tables, found ${table_count}"
        validation_passed=false
    fi

    # Validate each expected table exists
    for table in "${expected_tables[@]}"; do
        local exists
        exists=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${table}';")
        if [[ ${exists} -eq 0 ]]; then
            log_error "Missing table: ${table}"
            validation_passed=false
        else
            log_verbose "Table verified: ${table}"
        fi
    done

    # Validate foreign key constraints are enabled
    local fk_enabled
    fk_enabled=$(sqlite3 "${DB_PATH}" "PRAGMA foreign_keys;")
    if [[ "${fk_enabled}" != "1" ]]; then
        log_warning "Foreign key constraints not enabled by default"
    else
        log_verbose "Foreign key constraints enabled"
    fi

    # Count indexes
    local index_count
    index_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';")
    log_verbose "Indexes found: ${index_count}"

    if [[ ${index_count} -lt 25 ]]; then
        log_warning "Expected at least 25 indexes, found ${index_count}"
    fi

    # Count views
    local view_count
    view_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sqlite_master WHERE type='view';")
    log_verbose "Views found: ${view_count}"

    # Validate bootstrap skills seeded
    local bootstrap_count
    bootstrap_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM bootstrap_skills;")
    log_verbose "Bootstrap skills found: ${bootstrap_count}"

    if [[ ${bootstrap_count} -ne 5 ]]; then
        log_error "Expected 5 bootstrap skills, found ${bootstrap_count}"
        validation_passed=false
    fi

    # Validate approval criteria templates seeded
    local approval_template_count
    approval_template_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM approval_criteria_templates;")
    log_verbose "Approval criteria templates found: ${approval_template_count}"

    if [[ ${approval_template_count} -ne 9 ]]; then
        log_error "Expected 9 approval criteria templates, found ${approval_template_count}"
        validation_passed=false
    fi

    # Validate schema version record
    local schema_version
    schema_version=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM schema_versions WHERE version='v2.0.0';")
    if [[ ${schema_version} -eq 0 ]]; then
        log_error "Schema version v2.0.0 not found in schema_versions table"
        validation_passed=false
    else
        log_verbose "Schema version v2.0.0 verified"
    fi

    if [[ "${validation_passed}" == "true" ]]; then
        log_success "Database validation passed"
        return 0
    else
        log_error "Database validation failed"
        return ${EXIT_VALIDATION_ERROR}
    fi
}

# ============================================================================
# REPORTING
# ============================================================================

print_summary() {
    local table_count
    local index_count
    local view_count
    local bootstrap_count
    local approval_template_count

    table_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    index_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';")
    view_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sqlite_master WHERE type='view';")
    bootstrap_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM bootstrap_skills;")
    approval_template_count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM approval_criteria_templates;")

    echo ""
    echo "============================================================================"
    echo -e "${GREEN}Skills Database v2 Initialization Complete${NC}"
    echo "============================================================================"
    echo ""
    echo "Database Path:      ${DB_PATH}"
    echo "Schema Version:     v2.0.0"
    echo ""
    echo "Database Statistics:"
    echo "  - Tables:                  ${table_count}"
    echo "  - Indexes:                 ${index_count}"
    echo "  - Views:                   ${view_count}"
    echo "  - Bootstrap Skills:        ${bootstrap_count}"
    echo "  - Approval Templates:      ${approval_template_count}"
    echo ""
    echo "Bootstrap Skills Loaded:"
    sqlite3 "${DB_PATH}" "SELECT '  ' || load_order || '. ' || skill_name || ' (' || description || ')' FROM bootstrap_skills ORDER BY load_order;"
    echo ""
    echo "Approval Criteria Templates:"
    sqlite3 "${DB_PATH}" "SELECT '  - ' || approval_level || '/' || category || ': ' || description FROM approval_criteria_templates ORDER BY approval_level, category;"
    echo ""
    echo "============================================================================"
    echo ""
    log_success "Database ready for use"
}

# ============================================================================
# VALIDATE-ONLY MODE
# ============================================================================

validate_only_mode() {
    log_info "Running validation-only mode..."

    if [[ ! -f "${DB_PATH}" ]]; then
        log_error "Database does not exist: ${DB_PATH}"
        log_error "Run without --validate-only to create database"
        exit ${EXIT_VALIDATION_ERROR}
    fi

    if validate_database; then
        log_success "Database validation successful"
        print_summary
        exit ${EXIT_SUCCESS}
    else
        log_error "Database validation failed"
        exit ${EXIT_VALIDATION_ERROR}
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    # Parse command-line arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force)
                FORCE=true
                shift
                ;;
            --skip-existing)
                SKIP_EXISTING=true
                shift
                ;;
            --validate-only)
                VALIDATE_ONLY=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit ${EXIT_SUCCESS}
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit ${EXIT_VALIDATION_ERROR}
                ;;
        esac
    done

    log_info "Skills Database v2 Initialization"
    log_info "=================================="
    echo ""

    # Check dependencies first
    if ! check_dependencies; then
        exit ${EXIT_DEPENDENCY_MISSING}
    fi

    # Setup environment
    if ! setup_environment; then
        exit ${EXIT_VALIDATION_ERROR}
    fi

    # Handle validate-only mode
    if [[ "${VALIDATE_ONLY}" == "true" ]]; then
        validate_only_mode
    fi

    # Handle existing database
    handle_existing_database

    # Create database and apply schema
    log_info "Creating database: ${DB_PATH}"

    if ! apply_schema; then
        exit ${EXIT_VALIDATION_ERROR}
    fi

    # Validate database structure
    if ! validate_database; then
        rollback_database
        exit ${EXIT_VALIDATION_ERROR}
    fi

    # Print success summary
    print_summary

    exit ${EXIT_SUCCESS}
}

# Execute main function
main "$@"
