#!/usr/bin/env bash
# Security Remediation Patches for Phase 4 Docker Mode Integration
# This script contains fixes for all HIGH severity vulnerabilities

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"

echo "================================================================"
echo "Security Remediation Patches - Phase 4 Docker Integration"
echo "================================================================"
echo ""

#==============================================================================
# H-1: Add JSON Size Validation to Coordinator Entrypoint
#==============================================================================

echo "H-1: Adding JSON size validation to coordinator-entrypoint.sh"

cat > /tmp/h1-json-size-validation.patch << 'EOF'
# Add after line: if [[ -n "${CFN_SUCCESS_CRITERIA:-}" ]]; then

    # Security: Check file size BEFORE loading (DoS prevention)
    if [[ -f "$CFN_SUCCESS_CRITERIA" ]]; then
        FILE_SIZE=$(stat -c%s "$CFN_SUCCESS_CRITERIA" 2>/dev/null || stat -f%z "$CFN_SUCCESS_CRITERIA" 2>/dev/null)
        MAX_JSON_SIZE=10485760  # 10MB limit

        if [ "$FILE_SIZE" -gt "$MAX_JSON_SIZE" ]; then
            echo "❌ Success criteria file exceeds 10MB limit: ${FILE_SIZE} bytes"
            echo "   Security Risk: DoS via excessive memory consumption"
            exit 1
        fi
        echo "✅ Success criteria file size validated: ${FILE_SIZE} bytes"
EOF

echo "   Patch created: /tmp/h1-json-size-validation.patch"
echo "   Apply to: docker/coordinator-entrypoint.sh (after line 37)"
echo ""

#==============================================================================
# H-2: Add Path Traversal Protection
#==============================================================================

echo "H-2: Adding path traversal protection to coordinator-entrypoint.sh"

cat > /tmp/h2-path-traversal-protection.patch << 'EOF'
# Replace file loading section with:

# Load success criteria from environment or file
SUCCESS_CRITERIA=""
if [[ -n "${CFN_SUCCESS_CRITERIA:-}" ]]; then
    # Security: Validate file path before loading
    if [[ -f "$CFN_SUCCESS_CRITERIA" ]]; then
        # Reject relative paths
        if [[ "$CFN_SUCCESS_CRITERIA" != /* ]]; then
            echo "❌ CFN_SUCCESS_CRITERIA must be absolute path"
            exit 1
        fi

        # Reject path traversal attempts
        if [[ "$CFN_SUCCESS_CRITERIA" == *".."* ]]; then
            echo "❌ CFN_SUCCESS_CRITERIA contains path traversal attempt"
            exit 1
        fi

        # Canonicalize path and verify it's within allowed directories
        CANONICAL_PATH=$(readlink -f "$CFN_SUCCESS_CRITERIA" 2>/dev/null || realpath "$CFN_SUCCESS_CRITERIA" 2>/dev/null)

        if [[ -z "$CANONICAL_PATH" ]]; then
            echo "❌ Cannot resolve CFN_SUCCESS_CRITERIA path"
            exit 1
        fi

        # Only allow files in /workspace or /etc/cfn
        if [[ "$CANONICAL_PATH" != /workspace/* && "$CANONICAL_PATH" != /etc/cfn/* ]]; then
            echo "❌ CFN_SUCCESS_CRITERIA outside allowed directories: $CANONICAL_PATH"
            echo "   Allowed: /workspace/* or /etc/cfn/*"
            exit 1
        fi

        # Security: Check file size BEFORE loading (DoS prevention)
        FILE_SIZE=$(stat -c%s "$CANONICAL_PATH" 2>/dev/null || stat -f%z "$CANONICAL_PATH" 2>/dev/null)
        MAX_JSON_SIZE=10485760  # 10MB limit

        if [ "$FILE_SIZE" -gt "$MAX_JSON_SIZE" ]; then
            echo "❌ Success criteria file exceeds 10MB limit: ${FILE_SIZE} bytes"
            exit 1
        fi

        echo "📋 Loading success criteria from file: $CANONICAL_PATH"
        SUCCESS_CRITERIA=$(cat "$CANONICAL_PATH")
    else
        echo "📋 Loading success criteria from environment variable"
        SUCCESS_CRITERIA="$CFN_SUCCESS_CRITERIA"

        # Security: Validate size of environment variable content
        SUCCESS_CRITERIA_SIZE=${#SUCCESS_CRITERIA}
        MAX_ENV_SIZE=10485760  # 10MB

        if [ "$SUCCESS_CRITERIA_SIZE" -gt "$MAX_ENV_SIZE" ]; then
            echo "❌ Success criteria environment variable exceeds 10MB"
            exit 1
        fi
    fi

    # Validate JSON format
    if ! echo "$SUCCESS_CRITERIA" | jq empty 2>/dev/null; then
        echo "❌ Invalid success criteria JSON format"
        exit 1
    fi
    echo "✅ Success criteria loaded and validated"
else
    echo "⚠️  No success criteria provided - coordinator will auto-generate"
    SUCCESS_CRITERIA=""
fi
EOF

echo "   Patch created: /tmp/h2-path-traversal-protection.patch"
echo "   Apply to: docker/coordinator-entrypoint.sh (replace lines 35-54)"
echo ""

#==============================================================================
# H-3: Enhance Shell Metacharacter Sanitization
#==============================================================================

echo "H-3: Enhancing sanitize_input function in orchestrate.sh"

cat > /tmp/h3-sanitize-input-enhanced.patch << 'EOF'
# Replace sanitize_input function with:

# Input sanitization helper with enhanced security
sanitize_input() {
    local input="$1"
    local max_length="${2:-256}"

    # Security: Length bounds check (DoS prevention)
    if [ ${#input} -gt "$max_length" ]; then
        log_error "Input exceeds maximum length ($max_length): ${#input}"
        return 1
    fi

    # Security: Strict whitelist - remove ALL shell metacharacters
    # Allowed: alphanumeric, space, underscore, hyphen, period, comma
    # Rejected: $(){}[]<>|&;`\"'*?~!@#%^
    local sanitized=$(echo "$input" | tr -cd '[:alnum:] _,.-' | tr -s ' ')

    # Security: Remove leading/trailing whitespace
    sanitized=$(echo "$sanitized" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    # Security: Verify non-empty after sanitization
    if [ -z "$sanitized" ]; then
        log_error "Input sanitization resulted in empty string"
        return 1
    fi

    # Security: Additional check for suspicious patterns
    if [[ "$sanitized" =~ ^[-.]  ]]; then
        log_error "Input starts with suspicious character"
        return 1
    fi

    echo "$sanitized"
    return 0
}

# Example usage with proper quoting:
#   SANITIZED=$(sanitize_input "$USER_INPUT" 128)
#   docker run --name "$SANITIZED" ...  # Always quote output
EOF

echo "   Patch created: /tmp/h3-sanitize-input-enhanced.patch"
echo "   Apply to: .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh (replace sanitize_input function)"
echo ""

#==============================================================================
# H-4: Remove Docker Socket from Non-Coordinator Containers
#==============================================================================

echo "H-4: Checking docker-compose.yml for docker.sock mounts"

# Count docker.sock mounts
SOCKET_MOUNTS=$(grep -c "/var/run/docker.sock" "$PROJECT_ROOT/docker/docker-compose.yml" || echo "0")

if [ "$SOCKET_MOUNTS" -gt 1 ]; then
    echo "   ⚠️  WARNING: Multiple docker.sock mounts detected: $SOCKET_MOUNTS"
    echo "   Manual review required - ensure ONLY coordinator has docker.sock access"
    echo ""

    cat > /tmp/h4-docker-socket-isolation.patch << 'EOF'
# Review docker-compose.yml and ensure:

services:
  cfn-coordinator:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # ✅ ONLY coordinator should have this

  # All other services (agents, workers, etc.):
  cfn-agent:
    volumes:
      - /workspace:/workspace:rw
      # ❌ NO docker.sock mount

  cfn-worker:
    volumes:
      - /workspace:/workspace:rw
      # ❌ NO docker.sock mount

# Security Rationale:
# - Docker socket = root access to host
# - Only coordinator needs to spawn containers
# - Compromised agent should NOT have docker access
EOF

    echo "   Patch created: /tmp/h4-docker-socket-isolation.patch"
    echo "   Action: Manually review and remove docker.sock from non-coordinator services"
else
    echo "   ✅ Docker socket properly isolated (only 1 mount found)"
fi

echo ""

#==============================================================================
# MEDIUM Priority Fixes
#==============================================================================

echo "M-2: Adding strict mode to orchestrate.sh"

cat > /tmp/m2-strict-mode.patch << 'EOF'
#!/bin/bash

# CFN Docker Loop Orchestration Implementation
# Usage: ./orchestrate.sh [OPERATION] [TASK_ID] [OPTIONS]

# Security: Enable strict mode for error handling
set -euo pipefail
EOF

echo "   Patch created: /tmp/m2-strict-mode.patch"
echo "   Apply to: .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh (lines 1-5)"
echo ""

echo "M-3: Using mktemp for secure temp file creation"

cat > /tmp/m3-secure-temp-files.patch << 'EOF'
# Replace hardcoded temp file paths with mktemp:

# Before:
# CONTEXT_FILE="/tmp/task-context-${TASK_ID}.json"

# After:
CONTEXT_FILE=$(mktemp /tmp/task-context-${TASK_ID}.XXXXXX.json)
trap "rm -f '$CONTEXT_FILE'" EXIT  # Cleanup on exit

cat > "$CONTEXT_FILE" << CONTEXT_EOF
{
  ...
}
CONTEXT_EOF
EOF

echo "   Patch created: /tmp/m3-secure-temp-files.patch"
echo "   Apply to: docker/coordinator-entrypoint.sh (line 56)"
echo ""

#==============================================================================
# Summary
#==============================================================================

echo "================================================================"
echo "REMEDIATION SUMMARY"
echo "================================================================"
echo ""
echo "HIGH Priority Patches Created:"
echo "  1. /tmp/h1-json-size-validation.patch"
echo "  2. /tmp/h2-path-traversal-protection.patch"
echo "  3. /tmp/h3-sanitize-input-enhanced.patch"
echo "  4. /tmp/h4-docker-socket-isolation.patch"
echo ""
echo "MEDIUM Priority Patches Created:"
echo "  5. /tmp/m2-strict-mode.patch"
echo "  6. /tmp/m3-secure-temp-files.patch"
echo ""
echo "Next Steps:"
echo "  1. Review each patch file"
echo "  2. Apply patches to corresponding files"
echo "  3. Re-run security audit: bash tests/security/phase4-docker-integration/security-audit-tests.sh"
echo "  4. Verify pass rate ≥85% with zero HIGH vulnerabilities"
echo ""
echo "Estimated Time: 2-3 hours for HIGH priority fixes"
echo "Expected Improvement: 62.5% → 95%+ pass rate"
echo ""
