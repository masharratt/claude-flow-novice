#!/bin/bash
# cfn-selftest: not-a-hook helper for cfn-invoke-pre-edit.sh (positional args, no stdin JSON, cannot block)
#
# Pre-Edit Security Warning Helper
# Warns security-specialist agents when editing documentation files
# to remind them about credential redaction requirements
#
# Usage: intended to be called by cfn-invoke-pre-edit.sh as
#        cfn-pre-edit-security-warning.sh <file_path> <agent_type>
#
# NOT a Claude Code hook: it takes positional arguments instead of the stdin
# JSON payload hooks receive, and always exits 0, so it has no matcher and no
# blocking behaviour to register.
#
# KNOWN DEAD, 2026-07-25 hook audit -- two independent reasons, neither fixed
# here (behaviour change, needs a decision):
#   1. cfn-invoke-pre-edit.sh contains no reference to this script, so the
#      "called automatically" claim above was never true.
#   2. The `$FILE_PATH == docs/*` test only matches a repo-relative path.
#      Edit/Write hook payloads always carry an ABSOLUTE path, so the guard
#      could not fire even once wired -- the same bug as T1 in
#      tests/test-hook-security.sh.
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
