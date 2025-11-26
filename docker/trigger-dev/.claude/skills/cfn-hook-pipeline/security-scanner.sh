#!/bin/bash
# Claude Flow: Security Scanning Hook
# Version: 1.4.0

set -euo pipefail

# Security Scanning Configuration
SCAN_TYPES=(
    "SQL_INJECTION"
    "XSS_VULNERABILITY"
    "HARDCODED_SECRETS"
    "INSECURE_DEPENDENCIES"
)

# Logging Configuration
LOG_DIR=".artifacts/security-logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="${LOG_DIR}/security-scan-${TIMESTAMP}.log"

# Ensure log directory exists
mkdir -p "${LOG_DIR}"

# Create log file
touch "${LOG_FILE}"

# Security Scanning Function
run_security_scan() {
    local file_path="$1"
    local file_extension="${file_path##*.}"
    local scan_confidence=0
    local vulnerabilities=()

    echo "Scanning file: ${file_path}" >&2

    # SQL Injection Detection
    if grep -qE "(SELECT|INSERT|UPDATE|DELETE).*['\"].*['\"]" "${file_path}"; then
        vulnerabilities+=("SQL_INJECTION")
        ((scan_confidence+=25))
    fi

    # XSS Vulnerability Detection
    if grep -qE "innerHTML|document\.write|eval\(" "${file_path}"; then
        vulnerabilities+=("XSS_VULNERABILITY")
        ((scan_confidence+=25))
    fi

    # Hardcoded Secrets Detection
    if grep -qE "(password|secret|token|api_key).*=.*['\"]" "${file_path}"; then
        vulnerabilities+=("HARDCODED_SECRETS")
        ((scan_confidence+=25))
    fi

    # Dependency Vulnerability Detection (Basic)
    if [[ "${file_extension}" == "json" ]] && grep -qE '"(version|dependencies)"' "${file_path}"; then
        # Check for vulnerable package versions using basic regex (can be expanded)
        if grep -qE '"(version|dependencies)".*[0-9]+\.[0-9]+\.[0-9]+' "${file_path}"; then
            vulnerabilities+=("INSECURE_DEPENDENCIES")
            ((scan_confidence+=25))
        fi
    fi

    # Output JSON Results
    local json_result
    json_result=$(jq -n \
        --arg confidence "${scan_confidence}" \
        --arg passed "$([ ${#vulnerabilities[@]} -eq 0 ] && echo true || echo false)" \
        --arg vulns "$(printf '%s\n' "${vulnerabilities[@]}" | jq -R . | jq -s .)" \
        '{
            passed: ($passed | test("true")),
            confidence: ($confidence | tonumber),
            vulnerabilities: $vulns
        }')

    # Write to log
    if [ ${#vulnerabilities[@]} -gt 0 ]; then
        echo "Security Vulnerabilities Detected in ${file_path}:" >&2
        for vuln in "${vulnerabilities[@]}"; do
            echo " - ${vuln}" >&2
        done
        echo "Confidence Score: ${scan_confidence}/100" >&2
    else
        echo "No security vulnerabilities detected in ${file_path}" >&2
    fi

    # Output JSON
    echo "${json_result}"
}

# Main Security Scanning Logic
main() {
    local file_path="${1:?Provide file path to scan}"

    # Skip scanning for certain file types or paths
    if [[ "${file_path}" =~ \.(min\.|test\.|spec\.) ]]; then
        jq -n '{
            passed: true,
            confidence: 100,
            vulnerabilities: []
        }'
        exit 0
    fi

    run_security_scan "${file_path}"
    exit_code=$?

    # Exit with appropriate code for coordination
    case ${exit_code} in
        0)
            exit 0  # No vulnerabilities
            ;;
        1)
            exit 2  # Vulnerabilities detected (non-blocking)
            ;;
        *)
            exit 1  # Unexpected error
            ;;
    esac
}

# Entry point
main "$@"