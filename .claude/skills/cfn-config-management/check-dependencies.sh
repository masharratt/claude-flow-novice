#!/usr/bin/env bash
set -euo pipefail

# Dependency Checker for Config Management

# Required and optional dependencies
REQUIRED_DEPENDENCIES=("jq")
OPTIONAL_DEPENDENCIES=("ajv")

check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        echo "Dependency not found: $1"
        return 1
    fi
}

install_optional_dependencies() {
    local missing_optional=()

    for dep in "${OPTIONAL_DEPENDENCIES[@]}"; do
        if ! check_dependency "$dep"; then
            missing_optional+=("$dep")
        fi
    done

    if [ ${#missing_optional[@]} -gt 0 ]; then
        echo "Note: Optional dependencies not found: ${missing_optional[*]}"
        echo "Some advanced features may be limited."
        return 0  # Not a hard failure
    fi
}

main() {
    local missing_required=()

    # Check required dependencies
    for dep in "${REQUIRED_DEPENDENCIES[@]}"; do
        if ! check_dependency "$dep"; then
            missing_required+=("$dep")
        fi
    done

    if [ ${#missing_required[@]} -gt 0 ]; then
        echo "ERROR: Missing critical dependencies: ${missing_required[*]}"
        echo "Please install these dependencies to use the config management skill."
        exit 1
    fi

    # Check optional dependencies (non-blocking)
    install_optional_dependencies

    echo "Dependencies check passed."
    exit 0
}

main "$@"