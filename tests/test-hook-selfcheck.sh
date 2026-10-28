#!/usr/bin/env bash
# Tests for cfn-hook-selfcheck.sh (SessionStart heartbeat logger).
#
# Regression: on macOS `date -Is` is GNU-only, so the hook wrote a blank
# timestamp and leaked "date: invalid argument" to stderr at every session
# start, breaking its own never-writes-stderr contract.
#
# Run: bash tests/test-hook-selfcheck.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$REPO_ROOT/.claude/hooks/cfn-hook-selfcheck.sh"

PASS=0
FAIL=0
ok()   { PASS=$((PASS + 1)); echo "ok: $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cfn-selfcheck-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/.claude"

ERR=$(echo '{}' | HOME="$WORK" CLAUDE_PROJECT_DIR=/proj/x bash "$HOOK" 2>&1 >/dev/null)
RC=$?
LOG="$WORK/.claude/hook-selfcheck.log"

[ "$RC" = 0 ] && ok "exit 0" || bad "exit code $RC"
[ -z "$ERR" ] && ok "no stderr" || bad "stderr leaked: $ERR"
[ -f "$LOG" ] && ok "log written" || bad "log missing"

LINE=$(tail -1 "$LOG" 2>/dev/null)
TS=$(printf '%s' "$LINE" | cut -f1)
PROJ=$(printf '%s' "$LINE" | cut -f2)
[[ "$TS" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+-][0-9]{2}:?[0-9]{2}$ ]] \
  && ok "ISO-8601 timestamp" || bad "timestamp not ISO-8601: '$TS'"
[ "$PROJ" = "/proj/x" ] && ok "project recorded" || bad "project field: '$PROJ'"

# Regression (2026-10-28): work-mode hooks were wired only in the user-level
# settings.local.json, which Claude Code never reads. The heartbeat above still
# logged, so the tripwire stayed green while the hooks were dead. The hook must
# now name every command stranded in that file and absent from settings.json.
if command -v jq >/dev/null 2>&1; then
  STRAND="$(mktemp -d "${TMPDIR:-/tmp}/cfn-selfcheck-strand.XXXXXX")"
  mkdir -p "$STRAND/.claude"
  cat > "$STRAND/.claude/settings.json" <<'JSON'
{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"bash $HOME/.claude/hooks/live.sh"}]}]}}
JSON
  cat > "$STRAND/.claude/settings.local.json" <<'JSON'
{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"bash $HOME/.claude/hooks/live.sh"},{"type":"command","command":"bash $HOME/.claude/hooks/stranded.sh"}]}]}}
JSON
  OUT=$(echo '{}' | HOME="$STRAND" CLAUDE_PROJECT_DIR=/proj/x bash "$HOOK" 2>/dev/null)
  [[ "$OUT" == *"stranded.sh"* ]] && ok "stranded hook named" || bad "stranded hook not reported: '$OUT'"
  [[ "$OUT" != *"live.sh"* ]] && ok "hook wired in settings.json not reported" || bad "false report: '$OUT'"

  rm -f "$STRAND/.claude/settings.local.json"
  OUT=$(echo '{}' | HOME="$STRAND" CLAUDE_PROJECT_DIR=/proj/x bash "$HOOK" 2>/dev/null)
  [ -z "$OUT" ] && ok "silent with no settings.local.json" || bad "unexpected output: '$OUT'"
  rm -rf "$STRAND"
else
  echo "skip: jq missing, stranded-hook check not exercised"
fi

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
