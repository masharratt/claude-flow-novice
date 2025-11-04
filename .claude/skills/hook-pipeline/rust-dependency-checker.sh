#!/bin/bash
# Rust Dependency Checker
set -o pipefail

# Exit codes:
# 0 - No issues found
# 1 - Cargo.toml not found or cannot be read
# 2 - Dependency warnings found

if [ $# -eq 0 ]; then
    echo "Usage: $0 <rust_file>"
    exit 1
fi

file_path="$1"
project_dir=$(dirname "$file_path")
cargo_toml="${project_dir}/Cargo.toml"

if [ ! -f "$cargo_toml" ]; then
    echo "Cargo.toml not found in project directory"
    exit 1
fi

# Skip list for built-in/standard libraries
skip_modules="std|core|alloc|proc_macro"

# Find local crate dependencies in the file
local_deps=$(grep -o "use crate::[a-zA-Z_][a-zA-Z0-9_:]*" "$file_path" |
    sed 's/use crate:://g' |
    cut -d':' -f1 |
    sort -u |
    grep -vE "^(${skip_modules})$")

# Check dependencies in Cargo.toml
if [ -n "$local_deps" ]; then
    warnings=$(echo "$local_deps" | while read -r dep; do
        if ! grep -q "path = \".*${dep}\"" "$cargo_toml"; then
            echo "Undeclared local crate dependency: ${dep}"
        fi
    done)

    if [ -n "$warnings" ]; then
        echo "Dependency warnings:"
        echo "$warnings"
        echo "Recommendation: Declare local crate dependencies in Cargo.toml"
        exit 2
    fi
fi

exit 0