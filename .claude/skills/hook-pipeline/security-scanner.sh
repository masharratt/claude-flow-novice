#!/bin/bash
# Claude Flow: Enhanced Security Scanning Hook
# Version: 2.0.0
#
# Detects:
# - Google API keys (AIza pattern)
# - NPM tokens (npm_ pattern)
# - JavaScript/TypeScript object literals
# - N8N JWT tokens
# - Z.ai API keys
# - SQL injection patterns
# - XSS vulnerabilities
# - Hardcoded secrets (env var style)

set -euo pipefail

# Security Scanning Configuration
SCAN_TYPES=(
    "GOOGLE_API_KEY"
    "NPM_TOKEN"
    "N8N_JWT_TOKEN"
    "ZAI_API_KEY"
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

# Helper function to detect patterns
detect_pattern() {
    local file_path="$1"
    local pattern="$2"
    local finding_type="$3"

    if grep -qE "$pattern" "$file_path" 2>/dev/null; then
        # Extract matching lines for reporting
        local matches
        matches=$(grep -nE "$pattern" "$file_path" 2>/dev/null | head -3)
        echo "FILE:$file_path|TYPE:$finding_type|MATCHES:$matches"
        return 0
    fi
    return 1
}

# Security Scanning Function
run_security_scan() {
    local file_path="$1"
    local file_extension="${file_path##*.}"
    local scan_confidence=0
    local vulnerabilities=()
    local findings=()

    echo "Scanning file: ${file_path}" >&2

    # Google API Key Detection (AIza pattern - 39 characters total)
    if detect_pattern "$file_path" "AIza[0-9A-Za-z_\-]{35}" "GOOGLE_API_KEY"; then
        vulnerabilities+=("GOOGLE_API_KEY")
        findings+=($(grep -nE "AIza[0-9A-Za-z_\-]{35}" "$file_path" | cut -d: -f1 | head -1))
        ((scan_confidence+=30))
        echo "Found Google API key in ${file_path}" >&2
    fi

    # NPM Token Detection (npm_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX format)
    if detect_pattern "$file_path" "npm_[A-Za-z0-9]{36}" "NPM_TOKEN"; then
        vulnerabilities+=("NPM_TOKEN")
        findings+=($(grep -nE "npm_[A-Za-z0-9]{36}" "$file_path" | cut -d: -f1 | head -1))
        ((scan_confidence+=30))
        echo "Found NPM token in ${file_path}" >&2
    fi

    # N8N JWT Token Detection (eyJ pattern - JWT tokens)
    if detect_pattern "$file_path" "eyJ[A-Za-z0-9_\-\.]{50,}" "N8N_JWT_TOKEN"; then
        vulnerabilities+=("N8N_JWT_TOKEN")
        findings+=($(grep -nE "eyJ[A-Za-z0-9_\-\.]{50,}" "$file_path" | cut -d: -f1 | head -1))
        ((scan_confidence+=25))
        echo "Found N8N JWT token in ${file_path}" >&2
    fi

    # Z.ai API Key Detection (sk-proj pattern)
    if detect_pattern "$file_path" "sk-proj-[A-Za-z0-9_\-]{20,}" "ZAI_API_KEY"; then
        vulnerabilities+=("ZAI_API_KEY")
        findings+=($(grep -nE "sk-proj-[A-Za-z0-9_\-]{20,}" "$file_path" | cut -d: -f1 | head -1))
        ((scan_confidence+=25))
        echo "Found Z.ai API key in ${file_path}" >&2
    fi

    # JavaScript/TypeScript Object Literal Detection
    # Detects patterns like: apiKey: 'value' or key: "value" or token: 'AIza...'
    if grep -qE "(apiKey|api_key|token|secret|password|Authorization|Bearer|key):\s*['\"][^'\"]{10,}['\"]" "$file_path" 2>/dev/null; then
        if grep -qE "(apiKey|api_key|token|secret|password|Authorization|Bearer|key):\s*['\"]([A-Za-z0-9_\-\.]{10,}|AIza[0-9A-Za-z_\-]{35}|npm_[A-Za-z0-9]{36})['\"]" "$file_path" 2>/dev/null; then
            vulnerabilities+=("HARDCODED_SECRETS")
            findings+=($(grep -nE "(apiKey|api_key|token|secret|password|Authorization|Bearer|key):\s*['\"]" "$file_path" | cut -d: -f1 | head -1))
            ((scan_confidence+=25))
            echo "Found hardcoded secrets in object literal in ${file_path}" >&2
        fi
    fi

    # SQL Injection Detection
    if grep -qE "(SELECT|INSERT|UPDATE|DELETE).*['\"].*['\"]" "${file_path}" 2>/dev/null; then
        vulnerabilities+=("SQL_INJECTION")
        ((scan_confidence+=20))
        echo "Found potential SQL injection pattern in ${file_path}" >&2
    fi

    # XSS Vulnerability Detection
    if grep -qE "innerHTML|document\.write|eval\(" "${file_path}" 2>/dev/null; then
        vulnerabilities+=("XSS_VULNERABILITY")
        ((scan_confidence+=20))
        echo "Found potential XSS vulnerability in ${file_path}" >&2
    fi

    # Hardcoded Secrets Detection (environment variable style)
    if grep -qE "(password|secret|token|api_key).*=.*['\"]" "${file_path}" 2>/dev/null; then
        # Only flag if not already flagged as object literal
        if ! grep -qE "(apiKey|api_key|token|secret|password):\s*['\"]" "$file_path" 2>/dev/null; then
            vulnerabilities+=("HARDCODED_SECRETS")
            ((scan_confidence+=20))
            echo "Found hardcoded secrets in ${file_path}" >&2
        fi
    fi

    # Dependency Vulnerability Detection (Basic)
    if [[ "${file_extension}" == "json" ]] && grep -qE '"(version|dependencies)"' "${file_path}" 2>/dev/null; then
        if grep -qE '"(version|dependencies)".*[0-9]+\.[0-9]+\.[0-9]+' "${file_path}" 2>/dev/null; then
            vulnerabilities+=("INSECURE_DEPENDENCIES")
            ((scan_confidence+=15))
            echo "Found dependency declarations in ${file_path}" >&2
        fi
    fi

    # Cap confidence at 100
    if [ $scan_confidence -gt 100 ]; then
        scan_confidence=100
    fi

    # Build vulnerabilities array as proper JSON
    local vulns_json
    if [ ${#vulnerabilities[@]} -eq 0 ]; then
        vulns_json="[]"
    else
        vulns_json=$(printf '%s\n' "${vulnerabilities[@]}" | jq -R . | jq -s .)
    fi

    # Output JSON Results
    local json_result
    json_result=$(jq -n \
        --argjson vulns "$vulns_json" \
        --arg confidence "${scan_confidence}" \
        --arg passed "$([ ${#vulnerabilities[@]} -eq 0 ] && echo true || echo false)" \
        '{
            passed: ($passed | test("true")),
            confidence: ($confidence | tonumber),
            vulnerabilities: $vulns,
            timestamp: now | floor
        }')

    # Write to log
    if [ ${#vulnerabilities[@]} -gt 0 ]; then
        echo "Security Vulnerabilities Detected in ${file_path}:" >&2
        for vuln in "${vulnerabilities[@]}"; do
            echo " - ${vuln}" >&2
        done
        echo "Confidence Score: ${scan_confidence}/100" >&2

        # Write detailed log
        {
            echo "=== Security Scan Report ==="
            echo "File: ${file_path}"
            echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
            echo "Vulnerabilities Found: ${#vulnerabilities[@]}"
            for vuln in "${vulnerabilities[@]}"; do
                echo "  - ${vuln}"
            done
            echo "Confidence Score: ${scan_confidence}/100"
            echo ""
        } >> "${LOG_FILE}"
    else
        echo "No security vulnerabilities detected in ${file_path}" >&2
    fi

    # Output JSON
    echo "${json_result}"
}

# Main Security Scanning Logic
main() {
    local file_path="${1:?Provide file path to scan}"

    # Ensure file exists
    if [ ! -f "$file_path" ]; then
        jq -n '{
            passed: false,
            confidence: 0,
            vulnerabilities: ["FILE_NOT_FOUND"],
            error: "File does not exist"
        }'
        exit 1
    fi

    # Skip scanning for certain file types or paths
    if [[ "${file_path}" =~ \.(min\.|test\.|spec\.)|node_modules|\.git ]]; then
        jq -n '{
            passed: true,
            confidence: 100,
            vulnerabilities: [],
            skipped: true,
            reason: "File type or path excluded from scanning"
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
