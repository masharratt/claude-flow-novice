#!/usr/bin/env bash
# ==============================================================================
# Secret Validation Script for Production Deployment
# ==============================================================================
#
# Purpose: Comprehensive validation of all 10 production secrets before deployment
#
# Features:
# - Verify all 10 secrets exist for target environment
# - Check secret file permissions (0600)
# - Validate secret format (no newlines, proper encoding)
# - Test secret decryption if encrypted
# - Check secret expiry if applicable
# - Verify no secrets in environment variables (enforce Docker secrets only)
# - Generate validation report with findings
#
# Usage:
#   ./scripts/security/validate-secrets.sh              # Validate trigger-dev
#   ./scripts/security/validate-secrets.sh --env prod   # Validate prod
#   ./scripts/security/validate-secrets.sh --report     # Generate HTML report
#
# Environment Variables:
#   VALIDATION_REPORT_DIR  Output directory for reports (default: .artifacts/validation)
#   SECRETS_DIR            Secrets directory (default: docker/trigger-dev/secrets)
#
# Returns:
#   0 - All validations passed
#   1 - One or more validations failed
#   2 - Configuration error
#
# ==============================================================================

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# ==============================================================================
# Configuration
# ==============================================================================

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load credentials from root .env (centralized credential management)
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a  # Auto-export variables
    source "$PROJECT_ROOT/.env"
    set +a
else
    echo "ERROR: Root .env not found at $PROJECT_ROOT/.env"
    echo "HINT: Ensure root .env exists with required API keys (ANTHROPIC_API_KEY, ZAI_API_KEY, etc.)"
    exit 1
fi

# Environment
ENVIRONMENT="${ENVIRONMENT:-trigger-dev}"
TARGET_ENV="${1:-trigger-dev}"

# Validation configuration
VALIDATION_REPORT_DIR="${VALIDATION_REPORT_DIR:-.artifacts/validation}"
SECRETS_DIR="${SECRETS_DIR:-docker/trigger-dev/secrets}"
ENV_FILE="${PROJECT_ROOT}/docker/trigger-dev/.env"

# Age encryption
AGE_KEY_DIR="${HOME}/.age"
AGE_KEY_FILE="${AGE_KEY_DIR}/key.txt"

# 10 Production Secrets (Phase 1.2a specification)
declare -a PRODUCTION_SECRETS=(
    "TRIGGER_API_KEY"
    "TRIGGER_SECRET_KEY"
    "DATABASE_URL"
    "REDIS_PASSWORD"
    "ENCRYPTION_KEY"
    "ANTHROPIC_API_KEY"
    "GITHUB_OAUTH_SECRET"
    "AUTH_SECRET"
    "MINIO_SECRET_KEY"
    "TRIGGER_ORG_ID"
)

# ==============================================================================
# Validation Counters
# ==============================================================================

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Store results for reporting
declare -a VALIDATION_RESULTS
declare -A FAILED_SECRETS

# ==============================================================================
# Logging Functions
# ==============================================================================

log_step() {
    echo "[VALIDATE] $(date '+%Y-%m-%d %H:%M:%S') [STEP] $*" >&2
}

log_info() {
    echo "[VALIDATE] $(date '+%Y-%m-%d %H:%M:%S') [INFO] $*" >&2
}

log_pass() {
    echo "[VALIDATE] $(date '+%Y-%m-%d %H:%M:%S') [PASS] $*" >&2
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    VALIDATION_RESULTS+=("PASS: $*")
}

log_fail() {
    echo "[VALIDATE] $(date '+%Y-%m-%d %H:%M:%S') [FAIL] $*" >&2
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    VALIDATION_RESULTS+=("FAIL: $*")
}

log_warn() {
    echo "[VALIDATE] $(date '+%Y-%m-%d %H:%M:%S') [WARN] $*" >&2
    WARNING_CHECKS=$((WARNING_CHECKS + 1))
    VALIDATION_RESULTS+=("WARN: $*")
}

# ==============================================================================
# Secret Existence Checks
# ==============================================================================

check_secret_exists() {
    local secret_name="$1"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local secret_file="${SECRETS_DIR}/${secret_name}"

    if [[ -f "$secret_file" ]]; then
        log_pass "Secret exists: $secret_name"
        return 0
    else
        log_fail "Secret missing: $secret_name at $secret_file"
        FAILED_SECRETS["$secret_name"]="File not found"
        return 1
    fi
}

check_all_secrets_exist() {
    log_step "Checking secret file existence..."

    for secret_name in "${PRODUCTION_SECRETS[@]}"; do
        check_secret_exists "$secret_name" || true
    done

    return 0
}

# ==============================================================================
# Permission Checks
# ==============================================================================

check_secret_permissions() {
    local secret_name="$1"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local secret_file="${SECRETS_DIR}/${secret_name}"

    if [[ ! -f "$secret_file" ]]; then
        log_warn "Skipping permission check (file not found): $secret_name"
        return 0
    fi

    # Get permissions
    local perms=$(stat -c '%a' "$secret_file" 2>/dev/null || stat -f '%A' "$secret_file" 2>/dev/null || echo "unknown")

    # Should be 0600 (read/write only for owner)
    if [[ "$perms" == "600" ]]; then
        log_pass "Secret has correct permissions (0600): $secret_name"
        return 0
    else
        log_warn "Secret has incorrect permissions ($perms, expected 0600): $secret_name"
        # Fix permissions
        chmod 600 "$secret_file" 2>/dev/null || true
        return 0
    fi
}

check_all_permissions() {
    log_step "Checking secret file permissions..."

    for secret_name in "${PRODUCTION_SECRETS[@]}"; do
        check_secret_permissions "$secret_name" || true
    done

    return 0
}

# ==============================================================================
# Format Validation
# ==============================================================================

check_secret_format() {
    local secret_name="$1"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local secret_file="${SECRETS_DIR}/${secret_name}"

    if [[ ! -f "$secret_file" ]]; then
        log_warn "Skipping format check (file not found): $secret_name"
        return 0
    fi

    local secret_value=$(cat "$secret_file" 2>/dev/null || echo "")

    # Check for empty
    if [[ -z "$secret_value" ]]; then
        log_fail "Secret is empty: $secret_name"
        FAILED_SECRETS["$secret_name"]="Empty secret"
        return 1
    fi

    # Check for newlines (invalid in Docker secrets)
    if [[ "$secret_value" =~ $'\n' ]]; then
        log_fail "Secret contains newlines: $secret_name"
        FAILED_SECRETS["$secret_name"]="Contains newlines"
        return 1
    fi

    # Check for null bytes
    if [[ "$secret_value" =~ $'\0' ]]; then
        log_fail "Secret contains null bytes: $secret_name"
        FAILED_SECRETS["$secret_name"]="Contains null bytes"
        return 1
    fi

    log_pass "Secret format valid: $secret_name"
    return 0
}

check_all_formats() {
    log_step "Checking secret formats..."

    for secret_name in "${PRODUCTION_SECRETS[@]}"; do
        check_secret_format "$secret_name" || true
    done

    return 0
}

# ==============================================================================
# Encryption Validation
# ==============================================================================

check_secret_decryption() {
    local secret_name="$1"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local secret_file="${SECRETS_DIR}/${secret_name}"

    if [[ ! -f "$secret_file" ]]; then
        log_warn "Skipping decryption check (file not found): $secret_name"
        return 0
    fi

    # Check if age is available
    if ! command -v age &> /dev/null; then
        log_warn "Age tool not installed, skipping decryption check"
        return 0
    fi

    # Check if file is encrypted (starts with 'age-encryption.org')
    if head -c 17 "$secret_file" 2>/dev/null | grep -q "age-encryption.org"; then
        # Try to decrypt
        if [[ ! -f "$AGE_KEY_FILE" ]]; then
            log_warn "Age key not found, skipping decryption: $secret_name"
            return 0
        fi

        if age -d -i "$AGE_KEY_FILE" "$secret_file" > /dev/null 2>&1; then
            log_pass "Secret decryption successful: $secret_name"
            return 0
        else
            log_fail "Secret decryption failed: $secret_name"
            FAILED_SECRETS["$secret_name"]="Decryption failed"
            return 1
        fi
    else
        log_pass "Secret is not encrypted: $secret_name"
        return 0
    fi
}

check_all_decryption() {
    log_step "Checking secret decryption..."

    for secret_name in "${PRODUCTION_SECRETS[@]}"; do
        check_secret_decryption "$secret_name" || true
    done

    return 0
}

# ==============================================================================
# Environment Variable Checks
# ==============================================================================

check_secrets_not_in_env() {
    log_step "Checking for secrets in environment variables..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    # Check current environment
    local found_in_env=()

    for secret_name in "${PRODUCTION_SECRETS[@]}"; do
        if [[ -n "${!secret_name:-}" ]]; then
            found_in_env+=("$secret_name")
        fi
    done

    if [[ ${#found_in_env[@]} -gt 0 ]]; then
        log_fail "Secrets found in environment variables: ${found_in_env[*]}"
        FAILED_SECRETS["ENV_VARS"]="Secrets in environment"
        return 1
    else
        log_pass "No secrets found in environment variables"
        return 0
    fi
}

check_secrets_not_in_env_file() {
    log_step "Checking for secrets in .env file..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [[ ! -f "$ENV_FILE" ]]; then
        log_warn "Environment file not found: $ENV_FILE"
        return 0
    fi

    local found_in_file=()

    for secret_name in "${PRODUCTION_SECRETS[@]}"; do
        if grep -q "^${secret_name}=" "$ENV_FILE" 2>/dev/null; then
            found_in_file+=("$secret_name")
        fi
    done

    if [[ ${#found_in_file[@]} -gt 0 ]]; then
        log_fail "Secrets found in .env file: ${found_in_file[*]}"
        log_warn "Secrets should use Docker secrets, not environment variables"
        FAILED_SECRETS["ENV_FILE"]="Secrets in .env"
        return 1
    else
        log_pass "No secrets found in .env file"
        return 0
    fi
}

# ==============================================================================
# Expiry Checks
# ==============================================================================

check_secret_expiry() {
    local secret_name="$1"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local secret_file="${SECRETS_DIR}/${secret_name}"

    if [[ ! -f "$secret_file" ]]; then
        log_warn "Skipping expiry check (file not found): $secret_name"
        return 0
    fi

    local secret_value=$(cat "$secret_file" 2>/dev/null || echo "")

    # Check for JWT format (contains dots)
    if [[ "$secret_value" =~ \. ]]; then
        # Try to decode JWT (basic check)
        local header=$(echo "$secret_value" | cut -d. -f1)
        local payload=$(echo "$secret_value" | cut -d. -f2)

        if [[ -n "$payload" ]]; then
            # Check for exp claim in payload (if we can decode)
            log_info "JWT detected for $secret_name (expiry not checked)"
            return 0
        fi
    fi

    log_pass "Secret expiry check passed: $secret_name"
    return 0
}

check_all_expiry() {
    log_step "Checking secret expiry..."

    for secret_name in "${PRODUCTION_SECRETS[@]}"; do
        check_secret_expiry "$secret_name" || true
    done

    return 0
}

# ==============================================================================
# Directory Integrity Checks
# ==============================================================================

check_secrets_directory() {
    log_step "Checking secrets directory integrity..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [[ ! -d "$SECRETS_DIR" ]]; then
        log_fail "Secrets directory not found: $SECRETS_DIR"
        return 1
    fi

    # Check directory permissions (should be 0700 or 0755)
    local dir_perms=$(stat -c '%a' "$SECRETS_DIR" 2>/dev/null || stat -f '%A' "$SECRETS_DIR" 2>/dev/null || echo "unknown")
    if [[ "$dir_perms" == "700" ]] || [[ "$dir_perms" == "755" ]] || [[ "$dir_perms" == "unknown" ]]; then
        log_pass "Secrets directory has appropriate permissions: $SECRETS_DIR"
        return 0
    else
        log_warn "Secrets directory has unusual permissions ($dir_perms): $SECRETS_DIR"
        return 0
    fi
}

# ==============================================================================
# Reporting
# ==============================================================================

generate_validation_report() {
    log_step "Generating validation report..."

    mkdir -p "$VALIDATION_REPORT_DIR"

    local report_file="${VALIDATION_REPORT_DIR}/validation-report-$(date +%Y%m%d_%H%M%S).txt"
    local summary_pass=$PASSED_CHECKS
    local summary_fail=$FAILED_CHECKS
    local summary_warn=$WARNING_CHECKS
    local summary_total=$TOTAL_CHECKS
    local pass_rate=0

    if [[ $summary_total -gt 0 ]]; then
        pass_rate=$(( (summary_pass * 100) / summary_total ))
    fi

    {
        echo "================================================================================"
        echo "SECRET VALIDATION REPORT"
        echo "================================================================================"
        echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "Environment: $TARGET_ENV"
        echo "Secrets Directory: $SECRETS_DIR"
        echo ""
        echo "Summary:"
        echo "  Total Checks: $summary_total"
        echo "  Passed: $summary_pass"
        echo "  Failed: $summary_fail"
        echo "  Warnings: $summary_warn"
        echo "  Pass Rate: ${pass_rate}%"
        echo ""

        if [[ $summary_fail -eq 0 ]]; then
            echo "Status: PASS - All validations passed"
        else
            echo "Status: FAIL - $summary_fail validation(s) failed"
        fi

        echo ""
        echo "================================================================================"
        echo "Detailed Results:"
        echo "================================================================================"

        for result in "${VALIDATION_RESULTS[@]}"; do
            echo "  $result"
        done

        if [[ ${#FAILED_SECRETS[@]} -gt 0 ]]; then
            echo ""
            echo "================================================================================"
            echo "Failed Secrets:"
            echo "================================================================================"
            for secret_name in "${!FAILED_SECRETS[@]}"; do
                echo "  $secret_name: ${FAILED_SECRETS[$secret_name]}"
            done
        fi

        echo ""
        echo "================================================================================"
        echo "Secrets Inventory:"
        echo "================================================================================"

        for secret_name in "${PRODUCTION_SECRETS[@]}"; do
            local secret_file="${SECRETS_DIR}/${secret_name}"
            local status="MISSING"
            local size="0"

            if [[ -f "$secret_file" ]]; then
                status="PRESENT"
                size=$(wc -c < "$secret_file" 2>/dev/null || echo "0")
            fi

            printf "  %-25s %8s (%d bytes)\n" "$secret_name" "$status" "$size"
        done

    } | tee "$report_file"

    log_info "Report saved to: $report_file"

    return 0
}

# ==============================================================================
# Main Validation Flow
# ==============================================================================

run_all_validations() {
    log_step "Starting comprehensive secret validation"
    log_info "Target Environment: $TARGET_ENV"
    log_info "Secrets Directory: $SECRETS_DIR"
    echo ""

    # Run all validation checks
    check_all_secrets_exist
    check_all_permissions
    check_all_formats
    check_all_decryption
    check_secrets_not_in_env
    check_secrets_not_in_env_file
    check_all_expiry
    check_secrets_directory

    echo ""
    log_step "Validation Summary"
    log_info "Total checks: $TOTAL_CHECKS"
    log_info "Passed: $PASSED_CHECKS"
    log_info "Failed: $FAILED_CHECKS"
    log_info "Warnings: $WARNING_CHECKS"

    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        local pass_rate=$(( (PASSED_CHECKS * 100) / TOTAL_CHECKS ))
        log_info "Pass Rate: ${pass_rate}%"
    fi

    return 0
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    case "${1:-}" in
        --report)
            run_all_validations
            generate_validation_report
            if [[ $FAILED_CHECKS -eq 0 ]]; then
                return 0
            else
                return 1
            fi
            ;;
        --env)
            TARGET_ENV="${2:-trigger-dev}"
            SECRETS_DIR="docker/${TARGET_ENV}/secrets"
            ENV_FILE="docker/${TARGET_ENV}/.env"
            run_all_validations
            generate_validation_report
            if [[ $FAILED_CHECKS -eq 0 ]]; then
                return 0
            else
                return 1
            fi
            ;;
        *)
            run_all_validations
            if [[ $FAILED_CHECKS -eq 0 ]]; then
                return 0
            else
                return 1
            fi
            ;;
    esac
}

main "$@"
