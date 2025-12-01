#!/bin/bash
#
# Pre-Edit Security Warning Hook
# Warns security-specialist agents when editing documentation files
# to remind them about credential redaction requirements
#
# Usage: Called automatically by cfn-invoke-pre-edit.sh
#

set -euo pipefail

FILE_PATH="${1:-}"
AGENT_TYPE="${2:-unknown}"

# Only warn when editing documentation as security-specialist
if [[ "$FILE_PATH" == docs/* ]] && [[ "$AGENT_TYPE" == "security-specialist" ]]; then
  echo ""
  echo "⚠️  SECURITY WARNING: Editing documentation as security-specialist"
  echo "    ════════════════════════════════════════════════════════════"
  echo ""
  echo "    📋 MANDATORY REDACTION PROTOCOL:"
  echo "       • ALWAYS redact sensitive values: API keys, passwords, tokens"
  echo "       • Use [REDACTED] or placeholder patterns only"
  echo "       • See: docs/templates/SECURITY_AUDIT_TEMPLATE.md"
  echo ""
  echo "    ✅ CORRECT:"
  echo "       API_KEY=sk-ant-[REDACTED]"
  echo "       PASSWORD=[REDACTED]"
  echo "       JWT_TOKEN=eyJhbGci[REDACTED]..."
  echo ""
  echo "    ❌ WRONG:"
  echo "       API_KEY=sk-ant-actual-key-value"
  echo "       PASSWORD=actual-password-123"
  echo ""
  echo "    🛡️  Pre-commit hook will BLOCK commits with exposed credentials"
  echo ""
fi

# Exit 0 (non-blocking warning)
exit 0
