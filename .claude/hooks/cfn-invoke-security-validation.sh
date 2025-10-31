#!/bin/bash
# Security Validation Hook for Docker Hybrid Routing

set -euo pipefail

# Validate secret management configurations
validate_secret_management() {
    local file_path="$1"

    # Check for hardcoded secrets
    if grep -qE '(sk-ant-|token-|api_key=)' "$file_path"; then
        echo "❌ SECURITY RISK: Potential secret exposure in $file_path"
        return 1
    fi

    # Check for proper environment variable naming
    if grep -qE 'API_KEY=|SECRET=|TOKEN=' "$file_path"; then
        echo "⚠️ NAMING RISK: Inconsistent secret variable names in $file_path"
        return 2
    fi

    return 0
}

# Validate Docker network configurations
validate_docker_network() {
    local compose_file="$1"

    # Check for overly permissive network configurations
    if ! grep -qE 'driver_opts:\n\s*encrypted:\s*"true"' "$compose_file"; then
        echo "❌ NETWORK RISK: Network encryption not enabled"
        return 1
    fi

    if ! grep -qE 'driver:\s*overlay' "$compose_file"; then
        echo "⚠️ NETWORK CONFIG: Recommended to use overlay network for better isolation"
        return 2
    fi

    return 0
}

# Main validation function
main() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    local exit_code=0

    echo "🔒 Running security validation for $file_name"

    case "$file_name" in
        docker-compose.yml|docker-compose.*.yml)
            validate_docker_network "$file_path" || exit_code=$?
            ;;
        .env|*.env)
            validate_secret_management "$file_path" || exit_code=$?
            ;;
    esac

    if [ $exit_code -eq 0 ]; then
        echo "✅ Security validation passed for $file_name"
    else
        echo "🚨 Security validation failed for $file_name (Error code: $exit_code)"
    fi

    return $exit_code
}

# Execute main validation
main "$@"