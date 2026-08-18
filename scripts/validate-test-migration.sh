#!/usr/bin/env bash

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1"
}

check_async_await_migration() {
    local test_files
    test_files=$(find . -type f \( -name "*.test.js" -o -name "*.test.ts" \))
    local problem_files=()

    for file in $test_files; do
        if grep -q '\.then(' "$file" || grep -q 'done(' "$file"; then
            problem_files+=("$file")
        fi
    done

    if [ ${#problem_files[@]} -gt 0 ]; then
        log_error "Found ${#problem_files[@]} files with async/await issues:"
        for file in "${problem_files[@]}"; do
            echo "  - $file"
        done
        return 1
    else
        log_info "No .then() or done() patterns found"
        return 0
    fi
}

main() {
    log_info "Starting Test Migration Validation"

    check_async_await_migration
    local result=$?

    if [ $result -eq 0 ]; then
        log_info "Migration Validation PASSED ✓"
        exit 0
    else
        log_error "Migration Validation FAILED ✗"
        exit 1
    fi
}

main