#!/bin/bash

##############################################################################
# Security Scanner for Post-Edit Hooks
# Version: 1.0.0
##############################################################################

set -euo pipefail

# Function to perform basic security scanning on files
security_scan() {
    local file_path="$1"
    local agent_id="${2:-unknown}"

    # Initialize security scan results
    local scan_result='{"confidence":0.9,"issues":[],"details":"{\\\"scanner\\\":\\\"basic-security\\\",\\\"timestamp\\\":\\\"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'\\\"}"}'

    # Check if file exists
    if [[ ! -f "$file_path" ]]; then
        scan_result='{"confidence":0,"issues":[{"severity":"error","message":"File not found","line":0}],"details":"{\\\"error\\\":\\\"file_not_found\\\"}"}'
        echo "$scan_result"
        return 1
    fi

    # Basic security checks
    local issues=()
    local confidence=0.9

    # Check for potential secrets/passwords
    if grep -i -E "(password|secret|key|token)\s*[:=]\s*['\"]?[a-zA-Z0-9+/=]{20,}" "$file_path" >/dev/null 2>&1; then
        issues+=("{\"severity\":\"critical\",\"message\":\"Potential hardcoded secret detected\",\"type\":\"secret_exposure\"}")
        confidence=0.3
    fi

    # Check for API keys patterns
    if grep -E "(AIza[A-Za-z0-9_-]{35}|[a-zA-Z0-9_-]{40,})" "$file_path" >/dev/null 2>&1; then
        issues+=("{\"severity\":\"high\",\"message\":\"Potential API key pattern detected\",\"type\":\"api_key\"}")
        confidence=0.5
    fi

    # Check for SQL injection patterns
    if grep -E "(SELECT|INSERT|UPDATE|DELETE).*(\\$|\\$\\{|\\\$\)" "$file_path" >/dev/null 2>&1; then
        issues+=("{\"severity\":\"medium\",\"message\":\"Unsanitized variable in SQL query\",\"type\":\"sql_injection\"}")
        confidence=0.7
    fi

    # Check for eval() usage (security risk)
    if grep -E "eval\\s*\\(" "$file_path" >/dev/null 2>&1; then
        issues+=("{\"severity\":\"medium\",\"message\":\"Use of eval() function detected\",\"type\":\"eval_usage\"}")
        confidence=0.8
    fi

    # Check for shell command injection patterns
    if grep -E "(exec|system|shell_exec)\\s*\\(" "$file_path" >/dev/null 2>&1; then
        issues+=("{\"severity\":\"medium\",\"message\":\"Use of system execution functions\",\"type\":\"command_injection\"}")
        confidence=0.8
    fi

    # Build JSON result
    local issues_json="[]"
    if [[ ${#issues[@]} -gt 0 ]]; then
        issues_json="[$(IFS=','; echo "${issues[*]}")]"
    fi

    scan_result="{\"confidence\":$confidence,\"issues\":$issues_json,\"details\":\"{\\\"scanner\\\":\\\"basic-security\\\",\\\"timestamp\\\":\\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\\",\\\"file\\\":\\\"$file_path\\\",\\\"agent_id\\\":\\\"$agent_id\\\"}\"}"

    echo "$scan_result"

    # Return appropriate exit code based on findings
    if [[ ${#issues[@]} -gt 0 ]]; then
        return 1
    else
        return 0
    fi
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script called directly
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <file_path> [--agent-id <id>]" >&2
        exit 1
    fi

    file_path="$1"
    agent_id="unknown"

    # Parse optional arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent-id)
                agent_id="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    security_scan "$file_path" "$agent_id"
fi