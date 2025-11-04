#!/bin/bash
# Rust Command Safety Validator
set -o pipefail

# Exit codes:
# 0 - No issues found
# 1 - File not found or cannot be read
# 2 - Command safety warnings found

if [ $# -eq 0 ]; then
    echo "Usage: $0 <rust_file>"
    exit 1
fi

file_path="$1"

if [ ! -f "$file_path" ]; then
    echo "File not found: $file_path"
    exit 1
fi

# Use grep to find Command::new() calls and check for stderr in next 5 lines
unsafe_commands=$(grep -n "Command::new(" "$file_path" | while read -r line; do
    line_num=$(echo "$line" | cut -d':' -f1)
    next_lines=$(tail -n +"$line_num" "$file_path" | head -n 5)

    if ! echo "$next_lines" | grep -q "\.stderr("; then
        echo "Line $line_num: Command::new() without stderr() configuration in next 5 lines"
    fi
done)

if [ -n "$unsafe_commands" ]; then
    echo "Command safety warnings:"
    echo "$unsafe_commands"
    exit 2
fi

exit 0