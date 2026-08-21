#!/usr/bin/env bash
#
# security-utils.sh - Security utilities for bash scripts
#
# Purpose:
#   Provide SQL escaping and secure credential handling for deployment scripts
#
# Usage:
#   source ./lib/security-utils.sh
#   escaped=$(escape_sql_string "user's input")
#   pgpass_file=$(create_pgpass_file "$host" "$port" "$db" "$user" "$pass")

#######################################
# Escape SQL string for SQLite
# Prevents SQL injection by doubling single quotes
#
# Arguments:
#   $1 - String to escape
# Outputs:
#   Escaped string safe for SQL
#######################################

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true
escape_sql_string() {
    local input="$1"
    # Double all single quotes (SQLite standard escaping)
    echo "${input//\'/\'\'}"
}

#######################################
# Escape SQL identifier (table/column name)
# Validates identifier contains only safe characters
#
# Arguments:
#   $1 - Identifier to validate
# Outputs:
#   Original identifier if safe
# Returns:
#   1 if identifier contains unsafe characters
#######################################
escape_sql_identifier() {
    local identifier="$1"

    # Allow only alphanumeric, underscore, hyphen
    if [[ ! "$identifier" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "[ERROR] Invalid SQL identifier: $identifier" >&2
        echo "[ERROR] Identifiers must contain only letters, numbers, underscore, hyphen" >&2
        return 1
    fi

    echo "$identifier"
}

#######################################
# Create temporary .pgpass file for secure PostgreSQL authentication
# Automatically cleaned up on script exit
#
# Arguments:
#   $1 - hostname
#   $2 - port (default: 5432)
#   $3 - database
#   $4 - username
#   $5 - password
# Outputs:
#   Path to temporary .pgpass file
# Returns:
#   0 on success, 1 on failure
#######################################
create_pgpass_file() {
    local host="$1"
    local port="${2:-5432}"
    local database="$3"
    local username="$4"
    local password="$5"

    # Create temporary .pgpass file
    local pgpass_file
    pgpass_file=$(mktemp)

    # Write credentials in PostgreSQL .pgpass format
    # Format: hostname:port:database:username:password
    echo "${host}:${port}:${database}:${username}:${password}" > "$pgpass_file"

    # Set strict permissions (required by PostgreSQL)
    chmod 600 "$pgpass_file" || {
        echo "[ERROR] Failed to set .pgpass file permissions" >&2
        rm -f "$pgpass_file"
        return 1
    }

    # Register cleanup on script exit
    trap "secure_cleanup_pgpass '$pgpass_file'" EXIT INT TERM

    echo "$pgpass_file"
}

#######################################
# Securely clean up .pgpass file
# Shreds file contents before deletion
#
# Arguments:
#   $1 - Path to .pgpass file
#######################################
secure_cleanup_pgpass() {
    local pgpass_file="$1"

    if [ -f "$pgpass_file" ]; then
        # Shred file if available (overwrites content)
        if command -v shred &> /dev/null; then
            shred -u "$pgpass_file" 2>/dev/null || rm -f "$pgpass_file"
        else
            # Fallback: overwrite then delete
            dd if=/dev/zero of="$pgpass_file" bs=1k count=1 2>/dev/null || true
            rm -f "$pgpass_file"
        fi
    fi
}

#######################################
# Validate category against whitelist
# Prevents approval bypass via invalid categories
#
# Arguments:
#   $1 - Category to validate
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_category() {
    local category="$1"

    case "$category" in
        coordination|domain|infrastructure|testing|foundation)
            return 0
            ;;
        *)
            echo "[ERROR] Invalid category: $category" >&2
            echo "[ERROR] Allowed: coordination, domain, infrastructure, testing, foundation" >&2
            return 1
            ;;
    esac
}

#######################################
# Validate skill name against security constraints
# Prevents path traversal and special character injection
#
# Arguments:
#   $1 - Skill name to validate
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_skill_name() {
    local skill_name="$1"

    # Check for path traversal
    if [[ "$skill_name" == *".."* ]] || [[ "$skill_name" == *"/"* ]]; then
        echo "[ERROR] Skill name contains path traversal: $skill_name" >&2
        return 1
    fi

    # Allow alphanumeric, hyphen, underscore only
    if [[ ! "$skill_name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "[ERROR] Invalid skill name: $skill_name" >&2
        echo "[ERROR] Skill names must contain only letters, numbers, underscore, hyphen" >&2
        return 1
    fi

    return 0
}

#######################################
# Validate file path is within allowed directory
# Prevents path traversal attacks
#
# Arguments:
#   $1 - File path to validate
#   $2 - Allowed base directory (default: current directory)
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_file_path() {
    local file_path="$1"
    local base_dir="${2:-.}"

    # Resolve to absolute path
    local abs_path
    abs_path=$(readlink -f "$file_path" 2>/dev/null) || {
        echo "[ERROR] Cannot resolve file path: $file_path" >&2
        return 1
    }

    local abs_base
    abs_base=$(readlink -f "$base_dir" 2>/dev/null) || {
        echo "[ERROR] Cannot resolve base directory: $base_dir" >&2
        return 1
    }

    # Check if file is within base directory.
    # Must compare on a path-separator boundary: a bare prefix match accepts a
    # sibling whose name merely starts with the base, so a base of
    # /srv/app would wrongly admit /srv/app-evil/payload.
    if [[ "$abs_path" != "$abs_base" && "$abs_path" != "$abs_base"/* ]]; then
        echo "[ERROR] File path outside allowed directory: $file_path" >&2
        echo "[ERROR] Base directory: $base_dir" >&2
        return 1
    fi

    return 0
}
