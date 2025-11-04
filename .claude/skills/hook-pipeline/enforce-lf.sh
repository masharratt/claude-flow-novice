#!/usr/bin/env bash
set -euo pipefail

# Enforce Line Endings Validator
# Converts CRLF to LF for text files

# Check if a file path is provided
if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <file_path>" >&2
    exit 1
fi

FILE_PATH="$1"

# Skip empty files
if [[ ! -s "$FILE_PATH" ]]; then
    exit 0
fi

# Check if file is binary
if file --mime-type "$FILE_PATH" | grep -qE '(binary|application/)'; then
    exit 0
fi

# Skip files that are already LF (check for carriage return)
if ! grep -q $'\r' "$FILE_PATH"; then
    exit 0
fi

# Convert CRLF to LF
sed -i 's/\r$//' "$FILE_PATH"

# Optional: Log the conversion
echo "Converted $FILE_PATH to LF line endings" >&2

exit 0