#!/usr/bin/env bash
# SQL Injection Linting Script
# Detects vulnerable SQL query patterns in shell scripts
# Part of SEC-003 SQL injection prevention

set -euo pipefail

# Check if file provided
if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <file_path>" >&2
    exit 1
fi

FILE_PATH="$1"

if [[ ! -f "$FILE_PATH" ]]; then
    echo "ERROR: File not found: $FILE_PATH" >&2
    exit 1
fi

# Skip non-shell scripts
if [[ ! "$FILE_PATH" =~ \.sh$ ]]; then
    exit 0
fi

# Detect vulnerable patterns
VULNERABLE_PATTERNS=(
    'sqlite3.*["\047].*\$[A-Za-z_]'  # Direct variable interpolation in SQL strings
    'sqlite3.*".*WHERE.*=.*\$'        # WHERE clauses with direct variables
    'sqlite3.*".*VALUES.*\$'          # INSERT VALUES with direct variables
    'sqlite3.*".*SET.*\$'             # UPDATE SET with direct variables
)

FOUND_ISSUES=0

for pattern in "${VULNERABLE_PATTERNS[@]}"; do
    # Exclude safe patterns:
    # - sqlite-params.sh library itself
    # - Comments (lines starting with #)
    # - Heredocs (<<)
    # - Already using sqlite_select/sqlite_insert/sqlite_exec
    matches=$(grep -n -E "$pattern" "$FILE_PATH" | \
              grep -v "sqlite_select\|sqlite_insert\|sqlite_exec" | \
              grep -v "^[[:space:]]*#" | \
              grep -v "<<" || true)

    if [[ -n "$matches" ]]; then
        echo "VULNERABILITY DETECTED in $FILE_PATH:" >&2
        echo "$matches" >&2
        FOUND_ISSUES=1
    fi
done

if [[ $FOUND_ISSUES -eq 1 ]]; then
    echo "" >&2
    echo "RECOMMENDATION: Use parameterized queries from .claude/skills/bootstrap/sqlite-params.sh" >&2
    echo "Example: sqlite_select \"\$DB\" \"SELECT * FROM table WHERE id = ?1\" \"\$user_input\"" >&2
    exit 1
fi

exit 0
