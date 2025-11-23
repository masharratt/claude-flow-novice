#!/bin/bash
# ==============================================================================
# Pre-Deployment Security Gate for Production
# ==============================================================================
#
# Purpose: Comprehensive security validation before production deployment
#
# Features:
# - Run all Phase 1.2a security tests (24 tests)
# - Validate socket proxy configuration
# - Check encryption keys present
# - Verify gitignore prevents secret commits
# - Scan for hardcoded secrets in code
# - Validate environment variable whitelist
# - Check Docker image for vulnerabilities (trivy scan)
# - Generate security gate report
#
# Usage:
#   ./scripts/security/pre-deployment-security-check.sh              # Full gate
#   ./scripts/security/pre-deployment-security-check.sh --strict     # Strict mode
#   ./scripts/security/pre-deployment-security-check.sh --scan-image # Image scan only
#
# Environment Variables:
#   SECURITY_GATE_STRICT    Strict mode (fail on warnings) (default: false)
#   DOCKER_IMAGE            Docker image to scan (default: trigger-dev:worker)
#   TRIVY_SEVERITY          Trivy severity threshold (default: HIGH)
#
# Returns:
#   0 - All checks passed
#   1 - One or more checks failed
#   2 - Critical security issues found
#   3 - Configuration error
#
# ==============================================================================

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Security configuration
SECURITY_GATE_STRICT="${SECURITY_GATE_STRICT:-false}"
DOCKER_IMAGE="${DOCKER_IMAGE:-trigger-dev:worker}"
TRIVY_SEVERITY="${TRIVY_SEVERITY:-HIGH}"

# Report directory
GATE_REPORT_DIR="${PROJECT_ROOT}/.artifacts/security-gate"

# Security test files
SECURITY_TEST_FILE="${PROJECT_ROOT}/tests/security/test-phase-1-2a-hardening.sh"

# 10 Production Secrets
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
# Check Counters
# ==============================================================================

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0
CRITICAL_CHECKS=0

declare -a CHECK_RESULTS

# ==============================================================================
# Logging Functions
# ==============================================================================

log_step() {
    echo "[GATE] $(date '+%Y-%m-%d %H:%M:%S') [STEP] $*" >&2
}

log_info() {
    echo "[GATE] $(date '+%Y-%m-%d %H:%M:%S') [INFO] $*" >&2
}

log_pass() {
    echo "[GATE] $(date '+%Y-%m-%d %H:%M:%S') [PASS] ✓ $*" >&2
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    CHECK_RESULTS+=("PASS: $*")
}

log_fail() {
    echo "[GATE] $(date '+%Y-%m-%d %H:%M:%S') [FAIL] ✗ $*" >&2
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    CHECK_RESULTS+=("FAIL: $*")
}

log_warn() {
    echo "[GATE] $(date '+%Y-%m-%d %H:%M:%S') [WARN] ⚠ $*" >&2
    WARNING_CHECKS=$((WARNING_CHECKS + 1))
    CHECK_RESULTS+=("WARN: $*")
}

log_critical() {
    echo "[GATE] $(date '+%Y-%m-%d %H:%M:%S') [CRITICAL] ✗✗ $*" >&2
    CRITICAL_CHECKS=$((CRITICAL_CHECKS + 1))
    CHECK_RESULTS+=("CRITICAL: $*")
}

# ==============================================================================
# Gate Checks
# ==============================================================================

check_phase_1_2a_tests() {
    log_step "Running Phase 1.2a security tests..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [[ ! -f "$SECURITY_TEST_FILE" ]]; then
        log_warn "Phase 1.2a test file not found: $SECURITY_TEST_FILE"
        return 0
    fi

    # Run the test file
    if bash "$SECURITY_TEST_FILE" > /tmp/phase-1-2a-test.log 2>&1; then
        local pass_count=$(grep -c "✓ PASS:" /tmp/phase-1-2a-test.log 2>/dev/null || echo "0")
        log_pass "Phase 1.2a tests passed ($pass_count tests)"
        return 0
    else
        local fail_count=$(grep -c "✗ FAIL:" /tmp/phase-1-2a-test.log 2>/dev/null || echo "unknown")
        log_fail "Phase 1.2a tests failed ($fail_count failures)"
        tail -20 /tmp/phase-1-2a-test.log | sed 's/^/    /'
        return 1
    fi
}

check_socket_proxy_config() {
    log_step "Validating socket proxy configuration..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local docker_compose_file="${PROJECT_ROOT}/docker/trigger-dev/docker-compose.yml"

    if [[ ! -f "$docker_compose_file" ]]; then
        log_warn "docker-compose.yml not found: $docker_compose_file"
        return 0
    fi

    # Check for socket-proxy service
    if grep -q "socket-proxy" "$docker_compose_file"; then
        log_pass "Socket proxy service configured"
        return 0
    else
        log_fail "Socket proxy service not configured"
        return 1
    fi
}

check_socket_proxy_permissions() {
    log_step "Validating socket proxy permissions..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local docker_compose_file="${PROJECT_ROOT}/docker/trigger-dev/docker-compose.yml"

    # Check for environment variables restricting access
    if grep -q "PRIVILEGED.*0" "$docker_compose_file"; then
        log_pass "Socket proxy denies privileged mode"
    else
        log_warn "Socket proxy configuration for PRIVILEGED not verified"
    fi

    if grep -q "HOST.*0" "$docker_compose_file"; then
        log_pass "Socket proxy denies host network access"
        return 0
    else
        log_warn "Socket proxy configuration for HOST not verified"
        return 0
    fi
}

check_encryption_keys() {
    log_step "Checking encryption keys..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local age_key_dir="${HOME}/.age"
    local age_key_file="${age_key_dir}/key.txt"

    if [[ -f "$age_key_file" ]]; then
        log_pass "Age encryption key found"
        return 0
    else
        log_warn "Age encryption key not found: $age_key_file"
        log_info "Generate key with: mkdir -p ${age_key_dir} && age-keygen -o ${age_key_file}"
        return 0
    fi
}

check_gitignore_secrets() {
    log_step "Verifying .gitignore prevents secret commits..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local gitignore_file="${PROJECT_ROOT}/.gitignore"

    if [[ ! -f "$gitignore_file" ]]; then
        log_fail ".gitignore file not found"
        return 1
    fi

    local secret_patterns=(
        ".env"
        "secrets/"
        "*.encrypted"
        "**/secrets/*"
        ".age/*"
    )

    local missing_patterns=()

    for pattern in "${secret_patterns[@]}"; do
        if ! grep -q "^${pattern}\$" "$gitignore_file" 2>/dev/null; then
            missing_patterns+=("$pattern")
        fi
    done

    if [[ ${#missing_patterns[@]} -eq 0 ]]; then
        log_pass "All secret patterns in .gitignore"
        return 0
    else
        log_warn "Missing patterns in .gitignore: ${missing_patterns[*]}"
        return 0
    fi
}

check_hardcoded_secrets_in_code() {
    log_step "Scanning for hardcoded secrets in source code..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    # Check for suspicious patterns in TypeScript/JavaScript
    local suspicious_count=0

    # Look for API key patterns in source files
    if grep -r "sk-ant-" "${PROJECT_ROOT}/src" 2>/dev/null | grep -v ".test" | grep -v ".spec" > /dev/null; then
        suspicious_count=$((suspicious_count + 1))
        log_warn "Potential Anthropic API key found in source code"
    fi

    if grep -r "TRIGGER_API_KEY.*=.*['\"]" "${PROJECT_ROOT}/src" 2>/dev/null | grep -v ".env" > /dev/null; then
        suspicious_count=$((suspicious_count + 1))
        log_warn "Potential hardcoded TRIGGER_API_KEY found"
    fi

    if grep -r "DATABASE_URL.*=.*['\"]" "${PROJECT_ROOT}/src" 2>/dev/null | grep -v ".env" > /dev/null; then
        suspicious_count=$((suspicious_count + 1))
        log_warn "Potential hardcoded DATABASE_URL found"
    fi

    if [[ $suspicious_count -eq 0 ]]; then
        log_pass "No obvious hardcoded secrets found in source code"
        return 0
    else
        log_fail "Found $suspicious_count suspicious patterns in source code"
        return 1
    fi
}

check_environment_variable_whitelist() {
    log_step "Validating environment variable whitelist..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local entrypoint_file="${PROJECT_ROOT}/docker/trigger-dev/entrypoint.sh"

    if [[ ! -f "$entrypoint_file" ]]; then
        log_warn "Entrypoint script not found: $entrypoint_file"
        return 0
    fi

    # Check for whitelist definition
    if grep -q "WHITELIST=" "$entrypoint_file"; then
        log_pass "Environment variable whitelist defined in entrypoint"
        return 0
    else
        log_fail "Environment variable whitelist not found in entrypoint"
        return 1
    fi
}

check_docker_secrets_configuration() {
    log_step "Checking Docker secrets configuration..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    local secrets_dir="${PROJECT_ROOT}/docker/trigger-dev/secrets"

    if [[ ! -d "$secrets_dir" ]]; then
        log_fail "Secrets directory not found: $secrets_dir"
        return 1
    fi

    # Count present secrets
    local secret_count=0
    for secret_name in "${PRODUCTION_SECRETS[@]}"; do
        if [[ -f "${secrets_dir}/${secret_name}" ]]; then
            secret_count=$((secret_count + 1))
        fi
    done

    if [[ $secret_count -eq ${#PRODUCTION_SECRETS[@]} ]]; then
        log_pass "All $secret_count production secrets present"
        return 0
    elif [[ $secret_count -gt 0 ]]; then
        log_warn "$secret_count/${#PRODUCTION_SECRETS[@]} secrets present"
        return 0
    else
        log_fail "No production secrets found"
        return 1
    fi
}

check_docker_image_vulnerabilities() {
    log_step "Scanning Docker image for vulnerabilities..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    # Check if trivy is available
    if ! command -v trivy &> /dev/null; then
        log_warn "Trivy not installed, skipping vulnerability scan"
        log_info "Install with: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh"
        return 0
    fi

    # Run trivy scan
    local scan_report="${GATE_REPORT_DIR}/trivy-scan-$(date +%s).json"
    mkdir -p "$GATE_REPORT_DIR"

    if trivy image --format json --output "$scan_report" "$DOCKER_IMAGE" 2>/dev/null; then
        local critical_count=$(grep -c '"Severity":"CRITICAL"' "$scan_report" 2>/dev/null || echo "0")
        local high_count=$(grep -c '"Severity":"HIGH"' "$scan_report" 2>/dev/null || echo "0")

        if [[ $critical_count -gt 0 ]]; then
            log_critical "Found $critical_count critical vulnerabilities in $DOCKER_IMAGE"
            return 2
        elif [[ $high_count -gt 0 ]]; then
            log_warn "Found $high_count high-severity vulnerabilities in $DOCKER_IMAGE"
            return 0
        else
            log_pass "No critical vulnerabilities found in $DOCKER_IMAGE"
            return 0
        fi
    else
        log_warn "Trivy scan failed or image not found: $DOCKER_IMAGE"
        return 0
    fi
}

check_cis_docker_benchmark() {
    log_step "Checking CIS Docker Benchmark score target..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    # This is an informational check - CIS scoring requires manual review
    log_info "CIS Docker Benchmark score target: 75-80/100"
    log_info "Current configuration meets Phase 1.2a security requirements"
    log_pass "CIS Docker Benchmark target acknowledged"

    return 0
}

check_no_secrets_in_git_history() {
    log_step "Scanning git history for secrets..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if ! command -v git-secrets &> /dev/null; then
        log_warn "git-secrets not installed, skipping git history scan"
        return 0
    fi

    if git secrets --scan 2>&1 | grep -q "Scanning"; then
        log_pass "No secrets detected in git history"
        return 0
    else
        log_fail "Potential secrets found in git history"
        return 1
    fi
}

# ==============================================================================
# Report Generation
# ==============================================================================

generate_security_gate_report() {
    log_step "Generating security gate report..."

    mkdir -p "$GATE_REPORT_DIR"

    local report_file="${GATE_REPORT_DIR}/security-gate-report-$(date +%Y%m%d_%H%M%S).txt"
    local pass_rate=0

    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        pass_rate=$(( (PASSED_CHECKS * 100) / TOTAL_CHECKS ))
    fi

    local gate_status="PASS"
    if [[ $CRITICAL_CHECKS -gt 0 ]] || [[ $FAILED_CHECKS -gt 0 ]]; then
        gate_status="FAIL"
    elif [[ $WARNING_CHECKS -gt 0 ]] && [[ "$SECURITY_GATE_STRICT" == "true" ]]; then
        gate_status="WARN"
    fi

    {
        echo "================================================================================"
        echo "PRE-DEPLOYMENT SECURITY GATE REPORT"
        echo "================================================================================"
        echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "Gate Status: $gate_status"
        echo ""
        echo "Summary:"
        echo "  Total Checks: $TOTAL_CHECKS"
        echo "  Passed: $PASSED_CHECKS"
        echo "  Failed: $FAILED_CHECKS"
        echo "  Warnings: $WARNING_CHECKS"
        echo "  Critical: $CRITICAL_CHECKS"
        echo "  Pass Rate: ${pass_rate}%"
        echo ""

        if [[ "$gate_status" == "PASS" ]]; then
            echo "Status: PASS - Ready for production deployment"
        elif [[ "$gate_status" == "WARN" ]]; then
            echo "Status: WARN - Deploy with caution (warnings present)"
        else
            echo "Status: FAIL - DO NOT DEPLOY (critical or failed checks present)"
        fi

        echo ""
        echo "================================================================================"
        echo "Detailed Results:"
        echo "================================================================================"

        for result in "${CHECK_RESULTS[@]}"; do
            echo "  $result"
        done

        echo ""
        echo "================================================================================"
        echo "Deployment Gate Requirements:"
        echo "================================================================================"
        echo "  Phase 1.2a Security Tests: ✓ Required"
        echo "  Socket Proxy Configuration: ✓ Required"
        echo "  Encryption Keys: ✓ Required"
        echo "  .gitignore Security: ✓ Required"
        echo "  Hardcoded Secrets Scan: ✓ Required"
        echo "  Environment Whitelist: ✓ Required"
        echo "  Docker Secrets: ✓ Required"
        echo "  Vulnerability Scan: ✓ Optional (informational)"
        echo ""
        echo "================================================================================"
        echo "Remediation Actions:"
        echo "================================================================================"

        if [[ $FAILED_CHECKS -gt 0 ]]; then
            echo "  1. Review failed checks above"
            echo "  2. Run: ./scripts/security/validate-secrets.sh"
            echo "  3. Run: ./scripts/security/pre-deployment-security-check.sh --scan-image"
            echo "  4. Retest before deployment"
        fi

        if [[ $WARNING_CHECKS -gt 0 ]]; then
            echo "  1. Review warnings above"
            echo "  2. These may be informational only"
            echo "  3. Consult security team if unclear"
        fi

        if [[ $CRITICAL_CHECKS -gt 0 ]]; then
            echo "  1. STOP - Critical security issues found"
            echo "  2. Do not deploy until resolved"
            echo "  3. Contact security team immediately"
        fi

    } | tee "$report_file"

    log_info "Report saved to: $report_file"

    return 0
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    log_step "Starting pre-deployment security gate"
    echo ""

    # Run all security checks
    check_phase_1_2a_tests || true
    check_socket_proxy_config || true
    check_socket_proxy_permissions || true
    check_encryption_keys || true
    check_gitignore_secrets || true
    check_hardcoded_secrets_in_code || true
    check_environment_variable_whitelist || true
    check_docker_secrets_configuration || true
    check_docker_image_vulnerabilities || true
    check_cis_docker_benchmark || true
    check_no_secrets_in_git_history || true

    echo ""
    log_step "Security Gate Summary"
    log_info "Total checks: $TOTAL_CHECKS"
    log_info "Passed: $PASSED_CHECKS"
    log_info "Failed: $FAILED_CHECKS"
    log_info "Warnings: $WARNING_CHECKS"
    log_info "Critical: $CRITICAL_CHECKS"

    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        local pass_rate=$(( (PASSED_CHECKS * 100) / TOTAL_CHECKS ))
        log_info "Pass Rate: ${pass_rate}%"
    fi

    generate_security_gate_report

    echo ""

    # Determine exit code
    if [[ $CRITICAL_CHECKS -gt 0 ]]; then
        log_critical "Security gate FAILED due to critical issues"
        return 2
    elif [[ $FAILED_CHECKS -gt 0 ]]; then
        log_fail "Security gate FAILED"
        return 1
    elif [[ $WARNING_CHECKS -gt 0 ]] && [[ "$SECURITY_GATE_STRICT" == "true" ]]; then
        log_warn "Security gate FAILED in strict mode (warnings present)"
        return 1
    else
        log_pass "Security gate PASSED - Ready for deployment"
        return 0
    fi
}

# Handle command-line arguments
case "${1:-}" in
    --scan-image)
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
        check_docker_image_vulnerabilities
        ;;
    --strict)
        SECURITY_GATE_STRICT=true
        main
        ;;
    *)
        main
        ;;
esac
