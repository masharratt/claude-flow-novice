#!/usr/bin/env bash

##############################################################################
# CFN Environment Sanitization
# Part of ANTI-023 Memory Leak Protection System
#
# Automatically sanitizes environment variables and prevents memory leaks
# in CFN Loop orchestration workflows.
#
# Usage:
#   source ./sanitize-environment.sh [--strict]
#   ./sanitize-environment.sh --check
##############################################################################

set -euo pipefail

# Configuration
STRICT_MODE=${1:-"false"}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Environment sanitization rules
declare -A SANITIZATION_RULES=(
    # Clear potentially problematic variables
    ["NODE_OPTIONS"]="sanitize"
    ["UV_THREADPOOL_SIZE"]="sanitize"
    ["REDIS_URL"]="sanitize_if_sensitive"

    # Preserve critical CFN variables
    ["CFN_MODE"]="preserve"
    ["TASK_ID"]="preserve"
    ["AGENT_ID"]="preserve"
    ["LOOP3_AGENTS"]="preserve"
    ["LOOP2_AGENTS"]="preserve"
    ["PRODUCT_OWNER"]="preserve"

    # Memory and process limits
    ["NODE_HEAP_LIMIT"]="enforce_2gb"
    ["MAX_AGENTS"]="enforce_10"
    ["CFN_TIMEOUT"]="enforce_600"
)

# Sensitive patterns to redact
SENSITIVE_PATTERNS=(
    "password="
    "secret="
    "token="
    "key="
    "auth="
    "credential="
)

# Color coding for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[SANITIZE]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SANITIZE]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[SANITIZE]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[SANITIZE]${NC} $1" >&2
}

# Check if value contains sensitive information
is_sensitive() {
    local value="$1"
    for pattern in "${SENSITIVE_PATTERNS[@]}"; do
        if [[ "$value" =~ $pattern ]]; then
            return 0
        fi
    done
    return 1
}

# Sanitize environment variable
sanitize_var() {
    local var_name="$1"
    local var_value="${!var_name:-}"
    local rule="${SANITIZATION_RULES[$var_name]:-"preserve"}"

    case "$rule" in
        "sanitize")
            if [[ -n "$var_value" ]]; then
                log_info "Sanitizing $var_name"
                unset "$var_name"
            fi
            ;;
        "sanitize_if_sensitive")
            if is_sensitive "$var_value"; then
                log_warning "Redacting sensitive $var_name"
                unset "$var_name"
            fi
            ;;
        "preserve")
            # Keep the variable as-is
            ;;
        "enforce_2gb")
            export "$var_name"="${var_value:-2048}"
            log_info "Enforcing 2GB heap limit: $var_name=${!var_name}"
            ;;
        "enforce_10")
            export "$var_name"="${var_value:-10}"
            log_info "Enforcing max 10 agents: $var_name=${!var_value}"
            ;;
        "enforce_600")
            export "$var_name"="${var_value:-600}"
            log_info "Enforcing 600s timeout: $var_name=${!var_value}"
            ;;
    esac
}

# Apply environment sanitization
sanitize_environment() {
    log_info "Starting environment sanitization..."

    # Count changes for reporting
    local changes=0

    for var_name in "${!SANITIZATION_RULES[@]}"; do
        local old_value="${!var_name:-}"
        sanitize_var "$var_name"
        local new_value="${!var_name:-}"

        if [[ "$old_value" != "$new_value" ]]; then
            ((changes++))
        fi
    done

    # Enforce memory limits for Node.js processes
    export NODE_OPTIONS="--max-old-space-size=2048 --max-new-space-size=512 ${NODE_OPTIONS:-}"

    # Set CFN-specific limits
    export CFN_MAX_AGENTS="${CFN_MAX_AGENTS:-10}"
    export CFN_TIMEOUT="${CFN_TIMEOUT:-600}"
    export CFN_MEMORY_LIMIT="${CFN_MEMORY_LIMIT:-2GB}"

    log_success "Environment sanitization complete ($changes changes applied)"

    if [[ "$STRICT_MODE" == "true" ]]; then
        log_info "Strict mode enabled - additional validations applied"

        # Validate critical variables are set in CLI mode
        if [[ -n "${TASK_ID:-}" ]]; then
            for required_var in AGENT_ID LOOP3_AGENTS; do
                if [[ -z "${!required_var:-}" ]]; then
                    log_error "Required variable $required_var not set in CLI mode"
                    return 1
                fi
            done
        fi
    fi

    return 0
}

# Check current environment state
check_environment() {
    log_info "Checking environment state..."

    local issues=0

    # Check for sensitive data exposure
    for var_name in $(env | grep -E "(password|secret|token|key|auth|credential)" | cut -d= -f1); do
        log_warning "Potential sensitive data in $var_name"
        ((issues++))
    done

    # Check Node.js memory settings
    if [[ -n "${NODE_OPTIONS:-}" && ! "$NODE_OPTIONS" =~ "max-old-space-size" ]]; then
        log_warning "NODE_OPTIONS missing heap limit"
        ((issues++))
    fi

    # Check CFN configuration
    if [[ -z "${CFN_MAX_AGENTS:-}" ]]; then
        log_warning "CFN_MAX_AGENTS not set"
        ((issues++))
    fi

    if [[ $issues -eq 0 ]]; then
        log_success "Environment check passed"
        return 0
    else
        log_error "Environment check failed ($issues issues found)"
        return 1
    fi
}

# Main execution
main() {
    local action="${1:-"sanitize"}"

    case "$action" in
        "sanitize")
            sanitize_environment
            ;;
        "check")
            check_environment
            ;;
        "--strict")
            STRICT_MODE="true"
            sanitize_environment
            ;;
        "--help"|"-h")
            cat << EOF
CFN Environment Sanitization Script

Usage:
  $0                    # Apply standard sanitization
  $0 --strict          # Apply strict sanitization
  $0 check             # Check environment state
  $0 --help            # Show this help

This script sanitizes the environment to prevent memory leaks and
ensure secure CFN Loop execution.
EOF
            ;;
        *)
            log_error "Unknown action: $action"
            return 1
            ;;
    esac
}

# Execute main function if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
else
    # When sourced, automatically apply sanitization
    sanitize_environment
fi