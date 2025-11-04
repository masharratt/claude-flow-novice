#!/bin/bash
# Rust Future Safety Validator
set -o pipefail

# Exit codes:
# 0 - No issues found
# 1 - File not found or cannot be read
# 2 - Future safety warnings found

if [ $# -eq 0 ]; then
    echo "Usage: $0 <rust_file>"
    exit 1
fi

file_path="$1"

if [ ! -f "$file_path" ]; then
    echo "File not found: $file_path"
    exit 1
fi

# Find async function definitions
async_functions=$(grep -n "async fn" "$file_path")

if [ -n "$async_functions" ]; then
    warnings=$(echo "$async_functions" | while read -r async_line; do
        line_num=$(echo "$async_line" | cut -d':' -f1)
        func_name=$(echo "$async_line" | sed -n 's/.*async fn \([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/p')

        # Search for function calls without .await
        calls_without_await=$(grep -n "\\b${func_name}(" "$file_path" |
            grep -v ".await" |
            grep -v "async fn" |
            grep -v "fn ${func_name}")

        if [ -n "$calls_without_await" ]; then
            echo "Lines related to async function '${func_name}':"
            echo "$calls_without_await"
            echo "Recommendation: Use .await for async function calls. Run cargo clippy for more details."
        fi
    done)

    if [ -n "$warnings" ]; then
        echo "Future safety warnings:"
        echo "$warnings"
        exit 2
    fi
fi

exit 0