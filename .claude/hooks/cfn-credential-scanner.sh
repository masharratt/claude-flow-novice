#!/bin/bash
# Post-Edit Credential Scanner
# Scans files for exposed credentials before commit
# Integrated with cfn-post-edit.config.json

set -euo pipefail

FILE_PATH="$1"
AGENT_ID="${2:-unknown}"

# Exit codes
EXIT_SUCCESS=0
EXIT_CREDENTIAL_FOUND=11  # New exit code for credential detection
EXIT_ERROR=1

# Credential patterns (high-confidence detection)
declare -a PATTERNS=(
    # API Keys
    "sk-ant-[a-zA-Z0-9_-]{40,}"                           # Anthropic API keys
    "sk-zai-[a-zA-Z0-9._-]{20,}"                          # Z.ai API keys
    "npm_[a-zA-Z0-9]{36}"                                 # NPM API keys
    "tr_dev_[a-zA-Z0-9]{16,}"                             # Trigger.dev API keys
    "AIzaSy[a-zA-Z0-9_-]{33}"                             # Google API keys
    "xai-[a-zA-Z0-9]{32,}"                                # XAi API keys
    "grok-[a-zA-Z0-9]{32,}"                               # Grok API keys

    # Generic patterns
    "[a-zA-Z0-9]{32,}\.SUs3hnpAZAGsQDHX"                  # Z.ai token format
    "[a-zA-Z0-9]{32,}\.QO8R0JxF4fucsoWL"                  # Legacy Z.ai format
    "[a-zA-Z0-9]{32,}\.gDXkwrMNlYcqE8mF"                  # Legacy Z.ai format

    # Environment variable assignments (suspicious)
    "ANTHROPIC_API_KEY\s*=\s*[\"']sk-ant-"
    "ZAI_API_KEY\s*=\s*[\"'][a-zA-Z0-9._-]{20,}"
    "NPM_API_KEY\s*=\s*[\"']npm_"
    "TRIGGER_API_KEY\s*=\s*[\"']tr_dev_"
    "REDIS_PASSWORD\s*=\s*[\"'][a-zA-Z0-9]{16,}"
    "POSTGRES_PASSWORD\s*=\s*[\"'][a-zA-Z0-9]{16,}"

    # JSON/YAML credentials
    "\"api_key\"\s*:\s*\"[a-zA-Z0-9_-]{20,}\""
    "\"apiKey\"\s*:\s*\"[a-zA-Z0-9_-]{20,}\""
    "\"auth_token\"\s*:\s*\"[a-zA-Z0-9._-]{20,}\""
    "\"password\"\s*:\s*\"[a-zA-Z0-9]{16,}\""
)

# Whitelist patterns (safe to ignore)
declare -a WHITELIST=(
    "\\[REDACTED\\]"                                      # Already redacted
    "YOUR_API_KEY"                                        # Placeholder
    "YOUR_.*_KEY"                                         # Generic placeholder
    "example\\.com"                                       # Example domains
    "test[_-]?key"                                        # Test keys
    "mock[_-]?key"                                        # Mock keys
    "sk-ant-mock"                                         # Mock Anthropic keys
    "npm_MockTestKey"                                     # Mock NPM keys
)

# Check if file should be scanned
should_scan_file() {
    local file="$1"

    # Skip binary files
    if file "$file" | grep -q "binary"; then
        return 1
    fi

    # Skip large files (>1MB)
    if [ $(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null) -gt 1048576 ]; then
        return 1
    fi

    # Scan these file types
    case "$file" in
        *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.sh|*.bash|*.env*|*.yaml|*.yml|*.txt)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Check if match is whitelisted
is_whitelisted() {
    local match="$1"

    for pattern in "${WHITELIST[@]}"; do
        if echo "$match" | grep -qE "$pattern"; then
            return 0
        fi
    done

    return 1
}

# Scan file for credentials
scan_file() {
    local file="$1"
    local findings=0
    local line_number
    local matched_line

    for pattern in "${PATTERNS[@]}"; do
        while IFS=: read -r line_number matched_line; do
            # Skip if whitelisted
            if is_whitelisted "$matched_line"; then
                continue
            fi

            findings=$((findings + 1))

            # Redact the actual credential in output
            local redacted_line=$(echo "$matched_line" | sed -E "s/${pattern}/[CREDENTIAL_REDACTED]/g")

            echo "⚠️  CREDENTIAL DETECTED:"
            echo "   File: $file"
            echo "   Line: $line_number"
            echo "   Match: $redacted_line"
            echo "   Pattern: $pattern"
            echo ""

        done < <(grep -nE "$pattern" "$file" 2>/dev/null || true)
    done

    return $findings
}

# Main execution
main() {
    if [ ! -f "$FILE_PATH" ]; then
        echo "ERROR: File not found: $FILE_PATH" >&2
        exit $EXIT_ERROR
    fi

    # Check if file should be scanned
    if ! should_scan_file "$FILE_PATH"; then
        # File type not scannable, exit success
        exit $EXIT_SUCCESS
    fi

    echo "🔍 Scanning for credentials: $FILE_PATH"

    # Scan file
    if scan_file "$FILE_PATH"; then
        echo ""
        echo "✅ No credentials detected in $FILE_PATH"
        exit $EXIT_SUCCESS
    else
        findings=$?
        echo ""
        echo "❌ SECURITY ALERT: $findings credential(s) detected in $FILE_PATH"
        echo ""
        echo "🛡️  REMEDIATION STEPS:"
        echo "   1. Replace credentials with [REDACTED] placeholder"
        echo "   2. Move credentials to root .env file"
        echo "   3. Use environment variables instead of hardcoded values"
        echo "   4. If this is a test file, use mock credentials"
        echo ""
        echo "🚨 BLOCKED: File NOT saved to prevent credential exposure"
        echo ""

        # Log finding for audit trail
        if [ -n "${AGENT_ID:-}" ]; then
            echo "$(date -Iseconds) | AGENT:$AGENT_ID | FILE:$FILE_PATH | CREDENTIALS:$findings" >> .artifacts/logs/credential-scanner.log
        fi

        exit $EXIT_CREDENTIAL_FOUND
    fi
}

main "$@"
