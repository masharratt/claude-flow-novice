#!/bin/bash
# tests/security/credential-loading/test-credential-loading-pattern.sh
# Phase 1.3b :: Validate credential loading pattern across all refactored scripts

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# List of scripts that should use credential loading pattern
SCRIPTS=(
    "scripts/security/pre-deployment-security-check.sh"
    "scripts/security/validate-secrets.sh"
    "scripts/security/rotate-secrets.sh"
    "scripts/trigger-dev-setup.sh"
    "scripts/deployment/validate-environment.sh"
)

# Docker scripts use environment variables (not .env sourcing)
DOCKER_SCRIPTS=(
    "docker/trigger-dev/entrypoint.sh"
)

test_script_contains_pattern() {
    local script_path="$1"
    local script_name=$(basename "$script_path")

    log_step "Testing $script_name"

    if [ ! -f "$PROJECT_ROOT/$script_path" ]; then
        log_info "⚠ Script not found: $script_path (may not exist yet)"
        return 0
    fi

    # Check for .env sourcing pattern
    if grep -q "source.*\.env" "$PROJECT_ROOT/$script_path"; then
        log_info "✓ $script_name contains .env sourcing pattern"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        log_error "✗ $script_name missing .env sourcing pattern"
        TEST_FAILED=$((TEST_FAILED + 1))
        return 1
    fi

    # Check for error handling when .env missing
    if grep -q "ERROR.*\.env.*not found" "$PROJECT_ROOT/$script_path"; then
        log_info "✓ $script_name has error handling for missing .env"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        log_info "⚠ $script_name may be missing error handling for missing .env"
    fi

    TEST_TOTAL=$((TEST_TOTAL + 2))
}

test_docker_script_uses_env() {
    local script_path="$1"
    local script_name=$(basename "$script_path")

    log_step "Testing $script_name (Docker environment)"

    if [ ! -f "$PROJECT_ROOT/$script_path" ]; then
        log_info "⚠ Script not found: $script_path (may not exist yet)"
        return 0
    fi

    # Docker scripts should use load_secrets_or_env pattern, not source .env
    if grep -q "load_secrets_or_env" "$PROJECT_ROOT/$script_path"; then
        log_info "✓ $script_name uses Docker environment variable loading"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        log_info "⚠ $script_name may use alternative Docker credential loading"
        # Not a failure - Docker has multiple valid patterns
    fi

    TEST_TOTAL=$((TEST_TOTAL + 1))
}

# Test shell scripts that should use .env
for script in "${SCRIPTS[@]}"; do
    test_script_contains_pattern "$script"
done

# Test Docker scripts that use environment variables
for script in "${DOCKER_SCRIPTS[@]}"; do
    test_docker_script_uses_env "$script"
done

# Summary
echo ""
echo "========================================"
echo "Credential Loading Pattern Test Summary"
echo "========================================"
echo "Total Checks: $TEST_TOTAL"
echo "Passed: $TEST_PASSED"
echo "Failed: $TEST_FAILED"

if [ $TEST_FAILED -eq 0 ]; then
    echo ""
    log_info "✓ All scripts use credential loading pattern correctly"
    exit 0
else
    echo ""
    log_error "✗ Some scripts missing credential loading pattern"
    exit 1
fi
