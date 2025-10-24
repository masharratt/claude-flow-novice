#!/bin/bash

# Convert files to Unix line endings
convert_file() {
    local file="$1"
    # Remove carriage returns and write back to the same file
    tr -d '\r' < "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
    chmod +x "$file"
}

# Convert files in the current directory
for file in run-tests.sh test-primitives.sh test-utils.sh; do
    convert_file "$file"
done