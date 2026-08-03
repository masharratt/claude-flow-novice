#!/usr/bin/env bash
# PostToolUse (Edit|Write) hook: run cfn-doc-lint when a contract doc is edited.
# Non-blocking by default (prints violations as feedback, exit 0).
# Set CFN_DOC_LINT_BLOCK=1 to escalate to blocking (exit 2 on ERRORs).
#
# Input: tool-event JSON on stdin: {"tool_name":"Edit","tool_input":{"file_path":"..."}, ...}
set -u
LINT="$HOME/.claude/skills/cfn-doc-lint/execute.sh"
[ -x "$LINT" ] || LINT="$(dirname "$0")/../skills/cfn-doc-lint/execute.sh"
[ -f "$LINT" ] || exit 0

# Extract the edited file path from the tool event (jq if available, else grep).
payload="$(cat)"
if command -v jq >/dev/null 2>&1; then
  file_path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)"
else
  file_path="$(printf '%s' "$payload" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')"
fi
[ -n "$file_path" ] || exit 0

base="$(basename "$file_path")"
case "$base" in
  feature-status.md|state-machines.md|state-machine.md|*-state-machine*.md|*feature-status*.md) ;;
  *) exit 0 ;;   # not a contract doc: stay silent
esac

# Run the linter, capture output.
out="$(bash "$LINT" "$file_path" 2>&1)"
errors="$(printf '%s\n' "$out" | grep -c '^ERROR' || true)"
warns="$(printf '%s\n'  "$out" | grep -c '^WARN'  || true)"

if [ "$errors" -gt 0 ]; then
  printf '%s\n' "$out" | grep '^ERROR' >&2
  printf '\n[cfn-doc-lint] %d error(s) in %s (%d warn(s) suppressed; full output: /cfn-doc-lint). Fix per ~/.claude/skills/cfn-doc-lint/SCHEMA.md.\n' "$errors" "$base" "$warns" >&2
  [ "${CFN_DOC_LINT_BLOCK:-0}" = "1" ] && exit 2
fi
exit 0
