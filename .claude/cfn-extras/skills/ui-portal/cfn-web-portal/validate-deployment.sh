#!/usr/bin/env bash
set -Eeo pipefail
umask 077  # Restrict default file permissions
trap 'echo "Error: Command failed at line $LINENO"; exit 1' ERR

# Web Portal Deployment Validation Script
# Version: 1.1.0
# Last Updated: 2025-10-19

# Sourcing configuration
source .claude/cfn-config/web-portal.env
source .claude/skills/cfn-cfn-shared/utils.sh

# Validate Dependencies
validate_dependencies() {
    local required_deps=("node" "redis-cli" "jq" "curl")

    for dep in "${required_deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "Dependency $dep not found"
            exit 1
        fi
    done
}

# Check Redis Connectivity
test_redis_connection() {
    redis-cli ping | grep -q PONG || {
        log_error "Redis connection failed"
        exit 1
    }
}

# Permission Checks
validate_permissions() {
    local critical_dirs=(
        ".claude/skills/cfn-web-portal"
        ".claude/config"
        "/tmp/web-portal-logs"
    )

    for dir in "${critical_dirs[@]}"; do
        if [[ ! -w "$dir" ]]; then
            log_error "Insufficient write permissions for $dir"
            exit 1
        fi
    done
}

# Integration Readiness
check_integration_hooks() {
    local required_hooks=(
        "/launch-web-dashboard"
        ".claude/hooks/cfn-post-deploy-validation.sh"
    )

    for hook in "${required_hooks[@]}"; do
        if [[ ! -x "$hook" ]]; then
            log_error "Missing or non-executable integration hook: $hook"
            exit 1
        fi
    done
}

# Main Validation Function
main() {
    validate_dependencies
    test_redis_connection
    validate_permissions
    check_integration_hooks
}

# Execute main validation
main