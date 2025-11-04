#!/usr/bin/env bash
set -euo pipefail

# Bash Dependency Checker
# Validates script dependencies and checks for their existence

# Check if a file path is provided
if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <file_path>" >&2
    exit 1
fi

FILE_PATH="$1"

# Skip non-bash files
if [[ ! "$FILE_PATH" =~ \.(sh|bash)$ ]]; then
    exit 0
fi

# Skip empty files
if [[ ! -s "$FILE_PATH" ]]; then
    exit 0
fi

# Function to resolve relative paths
resolve_path() {
    local base_dir script_path="$1"

    # If path is absolute, return as-is
    if [[ "$script_path" =~ ^/ ]]; then
        echo "$script_path"
        return 0
    fi

    # Get base directory of the current script
    base_dir="$(dirname "$(readlink -f "$FILE_PATH")")"

    # Resolve relative paths
    readlink -f "$base_dir/$script_path"
}

# Function to extract script dependencies
extract_dependencies() {
    local missing_deps=0

    # Extract sourced scripts using source, ., or direct paths
    while IFS= read -r line; do
        local script_path=""

        # Skip comments
        [[ "$line" =~ ^[[:space:]]*# ]] && continue

        # Match source, ., or sourced script patterns
        if [[ "$line" =~ ^[[:space:]]*(source|\.)[[:space:]]+([^\;]+) ]]; then
            script_path="${BASH_REMATCH[2]}"
        elif [[ "$line" =~ ^[[:space:]]*bash[[:space:]]+([^\;]+) ]]; then
            script_path="${BASH_REMATCH[1]}"
        else
            continue
        fi

        # Remove surrounding quotes and whitespace
        script_path=$(echo "$script_path" | xargs)

        # Skip variables and arithmetic expansions (after quote removal)
        if [[ "$script_path" =~ ^\$ ]]; then
            continue
        fi

        # Resolve path
        local resolved_path
        resolved_path=$(resolve_path "$script_path")

        # Check if resolved script exists
        if [[ ! -f "$resolved_path" ]]; then
            echo "Missing dependency: $resolved_path" >&2
            missing_deps=$((missing_deps + 1))
        fi
    done < "$FILE_PATH"

    return $missing_deps
}

# Run dependency checks
if ! extract_dependencies; then
    exit 1
fi

exit 0