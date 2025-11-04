#!/usr/bin/env bash
set -euo pipefail

# Bash Pipe Safety Validator
# Checks for potential pipe safety issues in bash scripts

# Risky commands list
RISKY_COMMANDS=(
    "redis-cli"
    "curl"
    "wget"
    "npm"
    "docker"
    "git"
    "mysql"
    "psql"
    "python"
    "node"
)

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

# Check for pipefail (either 'set -o pipefail' or 'set -euo pipefail' or similar)
if ! grep -qE "set -(o pipefail|[a-z]*o[a-z]*)" "$FILE_PATH" || ! grep -q "pipefail" "$FILE_PATH"; then
    echo "Warning: Missing 'set -o pipefail' in script" >&2
    exit 2
fi

# Function to check for risky pipe usage
check_pipe_safety() {
    local line issues=0

    while IFS= read -r line; do
        # Check for pipe usage without stderr redirection
        if [[ "$line" =~ \| ]]; then
            for cmd in "${RISKY_COMMANDS[@]}"; do
                if [[ "$line" =~ $cmd ]] && [[ ! "$line" =~ (2>/dev/null|2>&1) ]]; then
                    echo "Potential pipe safety issue in line: $line" >&2
                    ((issues++))
                fi
            done
        fi
    done < "$FILE_PATH"

    return $issues
}

# Run safety checks
if ! check_pipe_safety; then
    exit 2
fi

exit 0