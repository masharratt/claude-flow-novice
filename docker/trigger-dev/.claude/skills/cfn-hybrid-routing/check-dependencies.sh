#!/usr/bin/env bash
set -euo pipefail

# Hybrid Routing Skill Dependency Checker

DEPENDENCIES=(
    "jq"
    "redis-cli"
    "openssl"
)

OPTIONAL_DEPENDENCIES=(
    "websocketd"
)

check_dependency() {
    local dep="$1"
    if ! command -v "$dep" &> /dev/null; then
        echo "Error: Dependency '$dep' not found."
        return 1
    fi
}

main() {
    echo "Checking Required Dependencies for Hybrid Routing Skill..."

    # Check required dependencies
    for dep in "${DEPENDENCIES[@]}"; do
        if ! check_dependency "$dep"; then
            echo "CRITICAL: Unable to proceed without $dep"
            exit 1
        fi
    done

    # Check optional dependencies
    for dep in "${OPTIONAL_DEPENDENCIES[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            echo "Warning: Optional dependency '$dep' not found. Some advanced routing features may be limited."
        fi
    done

    # Additional Redis connectivity check
    if ! redis-cli ping &> /dev/null; then
        echo "Error: Cannot connect to Redis server"
        exit 1
    fi

    echo "✅ All dependencies validated successfully"
    exit 0
}

main "$@"