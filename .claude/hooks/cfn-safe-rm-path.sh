#!/usr/bin/env bash
# SessionStart hook: put the safe-bin/rm wrapper first on PATH for every
# command the Claude Code Bash tool runs, and every child those commands start.
#
# Claude Code sources $CLAUDE_ENV_FILE before each Bash tool command; a
# SessionStart hook may append export lines to it. This adds one line:
#   export PATH=<repo>/.claude/cfn-scripts/safe-bin:"$PATH"
# Idempotent (skips when the file already names safe-bin). No CLAUDE_ENV_FILE,
# or no wrapper: silent no-op. Never fails the session (always exit 0).
#
# Incident 2026-11-23 (MDTWII): a test's empty temp var turned cleanup into
# rm -rf /home /tmp. The PreToolUse guard only sees the AI's command text.
set -uo pipefail
cat >/dev/null 2>&1 || true   # drain the hook payload

[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0
# Not -P: keep the stable $HOME/.claude/... path when run through the link.
SAFE_BIN=$(cd "$(dirname "${BASH_SOURCE[0]}")/../cfn-scripts/safe-bin" 2>/dev/null && pwd) || exit 0
[ -x "$SAFE_BIN/rm" ] || exit 0

if [ -f "$CLAUDE_ENV_FILE" ] && grep -qF "$SAFE_BIN" "$CLAUDE_ENV_FILE" 2>/dev/null; then
    exit 0
fi
printf 'export PATH=%q:"$PATH"\n' "$SAFE_BIN" >>"$CLAUDE_ENV_FILE" 2>/dev/null || true
exit 0
