#!/usr/bin/env bash


# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true
log_info() {
    echo "[INFO] $1"
}

migrate_test_file() {
    local file="$1"
    log_info "Processing file: $file"

    sed -i '
        # Convert .then() to await
        s/\.then(\([^)]*\))/await \1/g;

        # Replace done()
        s/done()/return/g;

        # Add try/catch
        s/async () => {/async () => { try {/g;
        s/});$/} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});/g;

        # Add timeout
        s/test(/jest.setTimeout(10000);\n  test(/g
    ' "$file"
}

main() {
    log_info "Starting Test Infrastructure Migration"

    local test_files
    test_files=$(find . -type f \( -name "*.test.js" -o -name "*.test.ts" \))

    for file in $test_files; do
        migrate_test_file "$file"
    done

    log_info "Migration completed"
}

main