#!/usr/bin/env bash
# Path Resolution Utilities for CFN Skills
# Provides consistent path handling across platforms and environments

set -euo pipefail

# Get the absolute path to the project root from any skill directory
get_project_root() {
    local script_dir="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

    # If we're in .claude/skills/<skill>/... go up 3 levels
    if [[ "$script_dir" == *".claude/skills"* ]]; then
        echo "$script_dir" | sed 's|/.claude/skills/.*||'
    # If we're in .claude/... go up 1 level
    elif [[ "$script_dir" == *".claude"* ]]; then
        echo "$script_dir" | sed 's|/.claude.*||'
    # Default: assume we're at project root
    else
        pwd
    fi
}

# Normalize path for cross-platform compatibility
normalize_path() {
    local path="$1"

    # Convert Windows backslashes to forward slashes
    path="${path//\\//}"

    # Remove duplicate slashes
    path="${path//\/\///}"

    # Remove trailing slash (except for root)
    if [[ "$path" != "/" && "$path" == *"/" ]]; then
        path="${path%/}"
    fi

    echo "$path"
}

# Resolve relative path from skill to project root
resolve_skill_path() {
    local skill_dir="${1:-$(dirname "${BASH_SOURCE[1]}")}"
    local relative_path="${2:-}"

    local project_root
    project_root=$(get_project_root "$skill_dir")

    if [[ -z "$relative_path" ]]; then
        echo "$project_root"
    else
        # Normalize and join paths
        local normalized
        normalized=$(normalize_path "$project_root/$relative_path")
        echo "$normalized"
    fi
}

# Get path to shared utilities
get_shared_path() {
    local type="${1:-bootstrap}"  # bootstrap or lib
    local file="${2:-}"

    local project_root
    project_root=$(get_project_root)

    if [[ -n "$file" ]]; then
        echo "$project_root/.claude/skills/shared/$type/$file"
    else
        echo "$project_root/.claude/skills/shared/$type"
    fi
}

# Source shared utility safely
source_shared() {
    local type="${1:-bootstrap}"
    local file="$2"

    local shared_path
    shared_path=$(get_shared_path "$type" "$file")

    if [[ -f "$shared_path" ]]; then
        # shellcheck source=/dev/null
        source "$shared_path"
    else
        echo "Error: Shared utility not found: $shared_path" >&2
        return 1
    fi
}

# Convert Windows path to WSL path (if needed)
windows_to_wsl_path() {
    local path="$1"

    # If it's already a WSL path, return as-is
    if [[ "$path" == "/mnt/"* ]]; then
        echo "$path"
    # Convert C:\... to /mnt/c/...
    elif [[ "$path" =~ ^[A-Za-z]:\\.* ]]; then
        local drive="${path:0:1}"
        drive="${drive,,}"
        local rest="${path:2}"
        rest="${rest//\\//}"
        echo "/mnt/$drive$rest"
    else
        echo "$path"
    fi
}

# Validate file exists with helpful error
validate_file() {
    local file="$1"
    local description="${2:-File}"

    if [[ ! -f "$file" ]]; then
        echo "Error: $description not found: $file" >&2
        echo "Current directory: $(pwd)" >&2
        echo "Script directory: $(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)" >&2
        return 1
    fi
}

# Create directory if it doesn't exist
ensure_dir() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
    fi
}

# Export functions for sourcing
export -f get_project_root
export -f normalize_path
export -f resolve_skill_path
export -f get_shared_path
export -f source_shared
export -f windows_to_wsl_path
export -f validate_file
export -f ensure_dir