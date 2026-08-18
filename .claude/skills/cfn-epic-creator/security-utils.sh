#!/usr/bin/env bash

# Security utilities for CFN Epic Creator v2
# Provides input validation, path sanitization, and secure file operations

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Security configuration
readonly MAX_EPIC_DESCRIPTION_LENGTH=10000
readonly MAX_PATH_LENGTH=4096
readonly ALLOWED_PATH_PATTERN='^[a-zA-Z0-9._/-]+$'
readonly TEMP_DIR_PERMISSIONS=700

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Logging function
log_security() {
    local level="$1"
    local message="$2"
    echo -e "${GREEN}[SECURITY-${level}]${NC} ${message}" >&2
}

# Input sanitization functions
sanitize_string() {
    local input="$1"
    local max_length="${2:-$MAX_EPIC_DESCRIPTION_LENGTH}"

    # Check length
    if [[ ${#input} -gt $max_length ]]; then
        log_security "ERROR" "Input exceeds maximum length of $max_length characters"
        return 1
    fi

    # Remove null bytes and control characters except newlines and tabs
    local sanitized
    sanitized=$(printf '%s' "$input" | tr -d '\000' | tr -c '\011\012\015\040-\176' _)

    # Check for suspicious patterns
    if [[ "$sanitized" =~ \$\(.*\) || "$sanitized" =~ \`.*\` || "$sanitized" =~ \|\|.*\|\| ]]; then
        log_security "ERROR" "Input contains potentially dangerous command patterns"
        return 1
    fi

    printf '%s' "$sanitized"
    return 0
}

# Path validation and sanitization
validate_path() {
    local path="$1"
    local base_dir="${2:-$(pwd)}"

    # Convert to absolute path
    local abs_path
    abs_path=$(realpath "$path" 2>/dev/null || printf '%s' "$path")

    # Check path length
    if [[ ${#abs_path} -gt $MAX_PATH_LENGTH ]]; then
        log_security "ERROR" "Path exceeds maximum length of $MAX_PATH_LENGTH characters"
        return 1
    fi

    # Check for path traversal attempts
    if [[ "$path" =~ \.\./ || "$path" =~ ~/? ]]; then
        log_security "ERROR" "Path contains traversal sequences"
        return 1
    fi

    # Validate path characters
    if [[ ! "$path" =~ $ALLOWED_PATH_PATTERN ]]; then
        log_security "ERROR" "Path contains invalid characters"
        return 1
    fi

    # Ensure path is within allowed directory
    local resolved_base
    resolved_base=$(realpath "$base_dir" 2>/dev/null || printf '%s' "$base_dir")

    if [[ "$abs_path" != "$resolved_base"/* && "$abs_path" != "$resolved_base" ]]; then
        log_security "ERROR" "Path is outside allowed directory"
        return 1
    fi

    printf '%s' "$abs_path"
    return 0
}

# Secure temporary file creation
create_secure_temp() {
    local prefix="${1:-epic}"
    local suffix="${2:-tmp}"
    local temp_dir="${3:-${TMPDIR:-/tmp}}"

    # Ensure temp directory exists and has proper permissions
    if [[ ! -d "$temp_dir" ]]; then
        mkdir -p "$temp_dir"
        chmod "$TEMP_DIR_PERMISSIONS" "$temp_dir"
    fi

    # Create secure temporary file
    local temp_file
    temp_file=$(mktemp -t "${prefix}.XXXXXX.${suffix}" 2>/dev/null) || {
        # Fallback if mktemp fails
        temp_file="${temp_dir}/${prefix}.$$.${suffix}"
        touch "$temp_file"
        chmod 600 "$temp_file"
    }

    # Set secure permissions
    chmod 600 "$temp_file"

    printf '%s' "$temp_file"
}

# Generate secure cache key
generate_cache_key() {
    local input="$1"
    local salt="${2:-cfn-epic-creator-v2}"

    # Use SHA256 hash for cache key
    printf '%s' "${input}${salt}" | sha256sum | cut -d' ' -f1
}

# Validate epic description
validate_epic_description() {
    local description="$1"

    # Sanitize input first
    local sanitized
    if ! sanitized=$(sanitize_string "$description"); then
        return 1
    fi

    # Check minimum length
    if [[ ${#sanitized} -lt 10 ]]; then
        log_security "ERROR" "Epic description too short (minimum 10 characters)"
        return 1
    fi

    # Check for required content patterns
    if [[ ! "$sanitized" =~ [A-Za-z] ]]; then
        log_security "ERROR" "Epic description must contain alphabetic characters"
        return 1
    fi

    printf '%s' "$sanitized"
    return 0
}

# Secure output filename generation
generate_secure_filename() {
    local base_name="${1:-epic-with-personas}"
    local timestamp="${2:-$(date +%Y-%m-%d-%H-%M-%S)}"
    local extension="${3:-json}"

    # Sanitize base name
    local safe_name
    safe_name=$(printf '%s' "$base_name" | tr -c 'a-zA-Z0-9._-' '_')

    # Generate filename
    printf '%s-%s.%s' "$safe_name" "$timestamp" "$extension"
}

# Validate JSON output
validate_json_output() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        log_security "ERROR" "Output file does not exist: $file"
        return 1
    fi

    # Check file size (prevent extremely large outputs)
    local file_size
    file_size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)

    if [[ $file_size -gt 10485760 ]]; then  # 10MB limit
        log_security "ERROR" "Output file too large: ${file_size} bytes"
        return 1
    fi

    # Validate JSON syntax
    if command -v jq >/dev/null 2>&1; then
        if ! jq . "$file" >/dev/null 2>&1; then
            log_security "ERROR" "Output file contains invalid JSON"
            return 1
        fi
    else
        # Fallback validation with Python
        if command -v python3 >/dev/null 2>&1; then
            if ! python3 -m json.tool "$file" >/dev/null 2>&1; then
                log_security "ERROR" "Output file contains invalid JSON"
                return 1
            fi
        fi
    fi

    return 0
}

# Cleanup temporary files
cleanup_temp_files() {
    local -a temp_files=("$@")

    for file in "${temp_files[@]}"; do
        if [[ -f "$file" ]]; then
            rm -f "$file" 2>/dev/null || true
        fi
    done
}

# Security check for command injection
check_command_injection() {
    local input="$1"

    # Check for dangerous patterns
    local -a dangerous_patterns=(
        '\$\('          # Command substitution
        '`'             # Backtick command substitution
        '\|\|'          # Command chaining
        '&&'            # Command chaining
        ';'             # Command separator
        '>'             # Output redirection
        '>>'            # Output append
        '<'             # Input redirection
        '<<<'           # Here string
        '&>'            # Redirect both stdout and stderr
        '2>'            # Stderr redirection
        '2>>'           # Stderr append
    )

    # Direct checks for patterns that need escaping in regex
    if [[ "$input" =~ \| ]]; then
        log_security "ERROR" "Input contains potentially dangerous pattern: pipe"
        return 1
    fi

    for pattern in "${dangerous_patterns[@]}"; do
        if [[ "$input" =~ $pattern ]]; then
            log_security "ERROR" "Input contains potentially dangerous pattern: $pattern"
            return 1
        fi
    done

    return 0
}

# Export functions for use in other scripts
export -f sanitize_string
export -f validate_path
export -f create_secure_temp
export -f generate_cache_key
export -f validate_epic_description
export -f generate_secure_filename
export -f validate_json_output
export -f cleanup_temp_files
export -f check_command_injection
export -f log_security

# Export constants
export MAX_EPIC_DESCRIPTION_LENGTH
export MAX_PATH_LENGTH
export ALLOWED_PATH_PATTERN
export TEMP_DIR_PERMISSIONS
