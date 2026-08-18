#!/usr/bin/env bash
# tests/71-manual-invocation.sh - AC-54 (EC-12 manual invocation identical).
# Static: writer source has no caller-detection branch; manual invocation
# produces the same shape as coordinator invocation.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-54: EC-12 writer has no caller-detection branch"

RECORD_SH="$REPO_ROOT/.claude/skills/cfn-decisions/record.sh"
LIB_DIR="$REPO_ROOT/.claude/skills/cfn-decisions/lib"

# Source grep: no caller-detection CODE branches. Comments are OK; we look
# for executable if/case branches that inspect caller identity.
# Patterns: `if [ ... caller ... ]`, `case "$CALLER"`, etc. The writer's
# only inputs are flags + env; it never reads coordinator state.
CALLER_HITS="$(grep -rnE '\$\{?(CALLER|INVOKER|HOOK_MODE|IS_HOOK|FROM_HOOK|COORDINATOR)[_A-Z]*\}?|\bcase .*caller\b' \
  "$RECORD_SH" "$LIB_DIR"/*.sh 2>/dev/null | wc -l)"
assert_eq "$CALLER_HITS" "0" \
  "AC-54: zero caller-detection branches in writer source"

# Bonus: confirm a manual invocation works (covered structurally by every
# other test in this suite; we run one more to anchor the assertion).
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"
SLUG="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DM1 --title "T" --chosen "C" --actor human \
  --root "$ROOT_TMP" >/dev/null 2>&1
RC=$?
assert_exit "$RC" 0 "AC-54: manual invocation exits 0"

print_summary "$NAME"
