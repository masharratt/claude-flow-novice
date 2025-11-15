#!/usr/bin/env bash
# Artifact Migration Script
# Version: 1.0.0
# Purpose: Find scattered artifacts and migrate to centralized registry
#
# Usage:
#   ./migrate-artifacts.sh [OPTIONS]
#
# Options:
#   --dry-run           Show what would be migrated without making changes
#   --source-dirs <dirs> Comma-separated list of directories to scan (default: /tmp,docs,artifacts)
#   --db-path <path>    Path to SQLite database (default: ./artifacts/database/registry.db)
#   --registry-path <path> Base path for centralized registry (default: ./artifacts/registry)
#   --log-file <path>   Path to log file (default: ./artifacts/logs/migration.log)
#   --exclude-patterns <patterns> Exclude files matching patterns (comma-separated)
#   --auto-detect-type  Auto-detect artifact type from extension
#   --verbose           Enable verbose logging
#   --help              Show this help message
#
# Exit Codes:
#   0 - Success
#   1 - General error
#   2 - Database error
#   3 - Validation error

set -euo pipefail

# ============================================================================
# Configuration and Defaults
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default configuration
DRY_RUN=false
SOURCE_DIRS="/tmp,docs,artifacts"
DB_PATH="${PROJECT_ROOT}/artifacts/database/registry.db"
REGISTRY_PATH="${PROJECT_ROOT}/artifacts/registry"
LOG_FILE="${PROJECT_ROOT}/artifacts/logs/migration.log"
EXCLUDE_PATTERNS=".git,.DS_Store,node_modules,*.swp,*.tmp"
AUTO_DETECT_TYPE=false
VERBOSE=false

# Counters
FILES_FOUND=0
FILES_MIGRATED=0
FILES_SKIPPED=0
ERRORS=0

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp="$(date '+%Y-%m-%d %H:%M:%S')"

    echo "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$@"
}

log_warn() {
    log "WARN" "$@"
}

log_error() {
    log "ERROR" "$@"
    ((ERRORS++)) || true
}

log_debug() {
    if [[ "$VERBOSE" == "true" ]]; then
        log "DEBUG" "$@"
    fi
}

# ============================================================================
# Utility Functions
# ============================================================================

show_help() {
    grep '^#' "$0" | grep -v '#!/usr/bin/env' | sed 's/^# //; s/^#//'
    exit 0
}

ensure_directory() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        log_debug "Created directory: $dir"
    fi
}

# SQL-safe escaping: replace single quotes with two single quotes (SQL standard)
# This prevents SQL injection by ensuring user input cannot break out of string literals
sql_escape() {
    printf %s "$1" | sed "s/'/''/g"
}

check_dependencies() {
    if ! command -v sqlite3 &>/dev/null; then
        log_error "sqlite3 CLI tool is required but not installed"
        log_error "Install with one of the following commands:"
        log_error "  - Debian/Ubuntu: apt-get install sqlite3"
        log_error "  - RHEL/CentOS:   yum install sqlite"
        log_error "  - macOS:         brew install sqlite3"
        log_error "  - Alpine:        apk add sqlite"
        exit 1
    fi
    log_debug "Dependency check passed: sqlite3 found"
}

validate_database() {
    if [[ ! -f "$DB_PATH" ]]; then
        log_warn "Database not found, will be created: $DB_PATH"
        ensure_directory "$(dirname "$DB_PATH")"

        # Initialize database with schema
        local schema_path="${PROJECT_ROOT}/src/database/artifact-registry-schema.sql"
        if [[ -f "$schema_path" ]]; then
            sqlite3 "$DB_PATH" < "$schema_path"
            log_info "Database initialized with schema"
        else
            log_error "Schema file not found: $schema_path"
            exit 2
        fi
    fi

    # Test database connectivity
    if ! sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM artifacts;" &>/dev/null; then
        log_error "Failed to query database or artifacts table does not exist"
        exit 2
    fi

    log_debug "Database validated: $DB_PATH"
}

# ============================================================================
# Type Detection Functions
# ============================================================================

detect_artifact_type() {
    local file_path="$1"
    local extension="${file_path##*.}"
    local basename
    basename="$(basename "$file_path")"

    # Convert to lowercase for comparison
    extension=$(echo "$extension" | tr '[:upper:]' '[:lower:]')

    case "$extension" in
        # Code
        js|ts|jsx|tsx|py|rb|go|rs|java|c|cpp|h|hpp|sh|bash)
            echo "code"
            ;;
        # Documentation
        md|txt|pdf|doc|docx|rst|adoc)
            echo "documentation"
            ;;
        # Test
        test.js|test.ts|spec.js|spec.ts|test.py)
            echo "test"
            ;;
        # Config
        json|yaml|yml|toml|ini|conf|cfg|env)
            echo "config"
            ;;
        # Binary
        bin|exe|dll|so|dylib|o|a)
            echo "binary"
            ;;
        # Data
        csv|tsv|parquet|arrow|db|sqlite|sqlite3)
            echo "data"
            ;;
        # Model
        h5|pb|onnx|pkl|pth|pt)
            echo "model"
            ;;
        *)
            # Check for test files by name pattern
            if [[ "$basename" =~ test|spec|Test|Spec ]]; then
                echo "test"
            else
                echo "other"
            fi
            ;;
    esac
}

detect_format() {
    local file_path="$1"
    local extension="${file_path##*.}"
    echo "${extension,,}"  # lowercase extension
}

# ============================================================================
# File Discovery Functions
# ============================================================================

should_exclude_file() {
    local file_path="$1"
    local filename
    filename="$(basename "$file_path")"

    IFS=',' read -ra PATTERNS <<< "$EXCLUDE_PATTERNS"
    for pattern in "${PATTERNS[@]}"; do
        pattern=$(echo "$pattern" | xargs)  # trim whitespace
        if [[ "$file_path" == *"$pattern"* ]] || [[ "$filename" == $pattern ]]; then
            return 0  # true - should exclude
        fi
    done

    return 1  # false - should not exclude
}

find_artifacts() {
    local source_dirs="$1"

    IFS=',' read -ra DIRS <<< "$source_dirs"
    for dir in "${DIRS[@]}"; do
        dir=$(echo "$dir" | xargs)  # trim whitespace

        # Convert relative to absolute path
        if [[ ! "$dir" =~ ^/ ]]; then
            dir="${PROJECT_ROOT}/${dir}"
        fi

        if [[ ! -d "$dir" ]]; then
            log_warn "Directory not found, skipping: $dir"
            continue
        fi

        log_info "Scanning directory: $dir"

        # Find all regular files
        while IFS= read -r -d '' file; do
            ((FILES_FOUND++)) || true

            # Check exclusion patterns
            if should_exclude_file "$file"; then
                log_debug "Excluded: $file"
                ((FILES_SKIPPED++)) || true
                continue
            fi

            # Check if already in registry
            if [[ "$file" == "${REGISTRY_PATH}"* ]]; then
                log_debug "Already in registry: $file"
                ((FILES_SKIPPED++)) || true
                continue
            fi

            migrate_file "$file"
        done < <(find "$dir" -type f -print0 2>/dev/null || true)
    done
}

# ============================================================================
# Migration Functions
# ============================================================================

calculate_checksum() {
    local file_path="$1"
    sha256sum "$file_path" | awk '{print $1}'
}

generate_artifact_id() {
    local timestamp
    timestamp=$(date +%s)
    local random
    random=$(od -An -N4 -tu4 /dev/urandom | tr -d ' ')
    echo "artifact-${timestamp}-${random}"
}

get_relative_registry_path() {
    local file_path="$1"
    local artifact_type="$2"
    local artifact_id="$3"
    local extension="${file_path##*.}"

    # Create type-based subdirectory
    local subdir="${artifact_type}s"  # code -> codes, test -> tests, etc.
    local filename="${artifact_id}.${extension}"

    echo "${subdir}/${filename}"
}

migrate_file() {
    local source_file="$1"

    # Get file metadata
    local size_bytes
    size_bytes=$(stat -f%z "$source_file" 2>/dev/null || stat -c%s "$source_file" 2>/dev/null || echo "0")

    local checksum
    checksum=$(calculate_checksum "$source_file")

    local artifact_type
    if [[ "$AUTO_DETECT_TYPE" == "true" ]]; then
        artifact_type=$(detect_artifact_type "$source_file")
    else
        artifact_type="other"
    fi

    local format
    format=$(detect_format "$source_file")

    local artifact_id
    artifact_id=$(generate_artifact_id)

    local rel_path
    rel_path=$(get_relative_registry_path "$source_file" "$artifact_type" "$artifact_id")

    local dest_file="${REGISTRY_PATH}/${rel_path}"
    local dest_dir
    dest_dir="$(dirname "$dest_file")"

    local name
    name="$(basename "$source_file")"

    log_debug "Migrating: $source_file -> $dest_file"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would migrate: $source_file"
        log_debug "  - ID: $artifact_id"
        log_debug "  - Type: $artifact_type"
        log_debug "  - Size: $size_bytes bytes"
        log_debug "  - Destination: $dest_file"
        ((FILES_MIGRATED++)) || true
        return 0
    fi

    # Create destination directory
    ensure_directory "$dest_dir"

    # Copy file to registry
    if ! cp -p "$source_file" "$dest_file"; then
        log_error "Failed to copy file: $source_file -> $dest_file"
        return 1
    fi

    # Register in database
    if ! register_artifact "$artifact_id" "$name" "$artifact_type" "$format" "$dest_file" "$checksum" "$size_bytes"; then
        log_error "Failed to register artifact: $artifact_id"
        # Cleanup copied file
        rm -f "$dest_file"
        return 1
    fi

    log_info "Migrated: $name (Type: $artifact_type, Size: $size_bytes bytes)"
    ((FILES_MIGRATED++)) || true
    return 0
}

register_artifact() {
    local id="$1"
    local name="$2"
    local type="$3"
    local format="$4"
    local storage_location="$5"
    local checksum="$6"
    local size_bytes="$7"

    # Escape all string values to prevent SQL injection
    # Single quotes are replaced with two single quotes (SQL standard escaping)
    local safe_id=$(sql_escape "$id")
    local safe_name=$(sql_escape "$name")
    local safe_type=$(sql_escape "$type")
    local safe_format=$(sql_escape "$format")
    local safe_location=$(sql_escape "$storage_location")
    local safe_checksum=$(sql_escape "$checksum")

    # Insert with properly escaped values
    # Note: size_bytes is numeric and doesn't need escaping
    sqlite3 "$DB_PATH" <<EOF
INSERT INTO artifacts (
    id, name, type, format, storage_location, checksum, size_bytes,
    version, acl_level, retention_policy, retention_days, status, is_compressed
) VALUES (
    '$safe_id', '$safe_name', '$safe_type', '$safe_format', '$safe_location', '$safe_checksum', $size_bytes,
    1, 2, 'standard', 30, 'active', 0
);
EOF

    return $?
}

# ============================================================================
# Argument Parsing
# ============================================================================

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --source-dirs)
                SOURCE_DIRS="$2"
                shift 2
                ;;
            --db-path)
                DB_PATH="$2"
                shift 2
                ;;
            --registry-path)
                REGISTRY_PATH="$2"
                shift 2
                ;;
            --log-file)
                LOG_FILE="$2"
                shift 2
                ;;
            --exclude-patterns)
                EXCLUDE_PATTERNS="$2"
                shift 2
                ;;
            --auto-detect-type)
                AUTO_DETECT_TYPE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                show_help
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 3
                ;;
        esac
    done
}

# ============================================================================
# Security Testing
# ============================================================================

test_sql_injection() {
    log_info "Running SQL injection protection tests..."

    # Test 1: Single quote escaping
    local malicious_id="'; DROP TABLE artifacts; --"
    local escaped=$(sql_escape "$malicious_id")

    if [[ "$escaped" == "''; DROP TABLE artifacts; --" ]]; then
        log_info "  ✓ SQL injection protection: Single quote escaping PASS"
    else
        log_error "  ✗ SQL injection protection: Single quote escaping FAIL (expected: ''; DROP TABLE artifacts; --, got: $escaped)"
        return 1
    fi

    # Test 2: Multiple single quotes
    local multi_quotes="test''value"
    local escaped_multi=$(sql_escape "$multi_quotes")

    if [[ "$escaped_multi" == "test''''value" ]]; then
        log_info "  ✓ SQL injection protection: Multiple quotes PASS"
    else
        log_error "  ✗ SQL injection protection: Multiple quotes FAIL (expected: test''''value, got: $escaped_multi)"
        return 1
    fi

    # Test 3: Empty string
    local empty=""
    local escaped_empty=$(sql_escape "$empty")

    if [[ "$escaped_empty" == "" ]]; then
        log_info "  ✓ SQL injection protection: Empty string PASS"
    else
        log_error "  ✗ SQL injection protection: Empty string FAIL"
        return 1
    fi

    # Test 4: String with no quotes
    local normal="normal_value"
    local escaped_normal=$(sql_escape "$normal")

    if [[ "$escaped_normal" == "normal_value" ]]; then
        log_info "  ✓ SQL injection protection: Normal string PASS"
    else
        log_error "  ✗ SQL injection protection: Normal string FAIL"
        return 1
    fi

    log_info "All SQL injection protection tests passed!"
    return 0
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    parse_arguments "$@"

    # Check required dependencies
    check_dependencies

    # Ensure log directory exists
    ensure_directory "$(dirname "$LOG_FILE")"

    log_info "Artifact Migration Script - Version 1.0.0"
    log_info "Starting at $(date '+%Y-%m-%d %H:%M:%S')"

    # Run security tests to validate SQL injection protection
    test_sql_injection || {
        log_error "Security tests failed - aborting migration"
        exit 3
    }

    log_info "Configuration:"
    log_info "  - Source Directories: $SOURCE_DIRS"
    log_info "  - Registry Path: $REGISTRY_PATH"
    log_info "  - Database Path: $DB_PATH"
    log_info "  - Dry Run: $DRY_RUN"
    log_info "  - Auto-Detect Type: $AUTO_DETECT_TYPE"

    # Validate database
    validate_database

    # Ensure registry path exists
    ensure_directory "$REGISTRY_PATH"

    # Find and migrate artifacts
    find_artifacts "$SOURCE_DIRS"

    # Summary
    log_info "=== Migration Summary ==="
    log_info "  - Files Found: $FILES_FOUND"
    log_info "  - Files Migrated: $FILES_MIGRATED"
    log_info "  - Files Skipped: $FILES_SKIPPED"
    log_info "  - Errors: $ERRORS"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "  - Mode: DRY RUN (no changes made)"
    fi

    log_info "Migration completed at $(date '+%Y-%m-%d %H:%M:%S')"

    if [[ $ERRORS -gt 0 ]]; then
        exit 1
    fi

    exit 0
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
