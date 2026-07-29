#!/usr/bin/env bash
# tests/35-exit-6-reserved.sh - AC-24 (exit 6 NEVER emitted, D-7 reservation).
# Static source-grep: the writer has NO `exit 6` call; the reservation is
# documented in a comment.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-24: exit 6 RESERVED, never emitted (D-7)"

RECORD_SH="$REPO_ROOT/.claude/skills/cfn-decisions/record.sh"
LIB_DIR="$REPO_ROOT/.claude/skills/cfn-decisions/lib"

# AC-24: zero `exit 6` calls in record.sh or lib/*.sh.
EXIT_6_HITS="$(grep -rnE 'exit 6\b' \
  "$RECORD_SH" "$LIB_DIR"/*.sh 2>/dev/null | wc -l)"
assert_eq "$EXIT_6_HITS" "0" \
  "AC-24: zero 'exit 6' calls in writer source"

# AC-24: reservation documented in a comment (lib/help.sh).
if grep -nE 'RESERVED|E_RESERVED_6|D-7' "$LIB_DIR/help.sh" >/dev/null 2>&1; then
  ok "AC-24: reservation documented in lib/help.sh"
else
  fail "AC-24: reservation documented in lib/help.sh"
fi

# AC-24: E_RESERVED_6=6 constant present (single source of truth).
if grep -nE '^E_RESERVED_6=6' "$LIB_DIR/help.sh" >/dev/null 2>&1; then
  ok "AC-24: E_RESERVED_6=6 constant defined"
else
  fail "AC-24: E_RESERVED_6=6 constant defined"
fi

print_summary "$NAME"
