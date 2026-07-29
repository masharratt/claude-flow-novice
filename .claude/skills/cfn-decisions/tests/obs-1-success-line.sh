#!/usr/bin/env bash
# tests/obs-1-success-line.sh - AC-35 (OBS-1 success-line shape).
# On success, stdout is exactly one line: "<id> <status>\n".
# OBSERVABILITY: caller parses stdout for status; spec requires shape stable.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-35: OBS-1 success-line is '<id> <status>\\n'"

ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"
SLUG="$(make_test_slug)"

OUT_F="$ROOT_TMP/out.txt"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DO1 --title "T" --chosen "C" --actor human \
  --status accepted --root "$ROOT_TMP" >"$OUT_F" 2>/dev/null
RC=$?
assert_exit "$RC" 0 "AC-35: writer exits 0 on success"

# Exactly one line (newline-terminated, single line).
LINE_COUNT="$(wc -l < "$OUT_F")"
assert_eq "$LINE_COUNT" "1" "AC-35: stdout emits exactly one line"

# No trailing extra chars; field order: id status.
LINE="$(head -1 "$OUT_F")"
assert_eq "$LINE" "test-DO1 accepted" "AC-35: stdout shape '<id> <status>'"

# Two whitespace-separated tokens, no extras.
TOK_COUNT="$(awk '{print NF}' "$OUT_F")"
assert_eq "$TOK_COUNT" "2" "AC-35: stdout has exactly 2 whitespace tokens"

# First token = id verbatim; second = status enum value.
TOK1="$(awk '{print $1}' "$OUT_F")"
TOK2="$(awk '{print $2}' "$OUT_F")"
assert_eq "$TOK1" "test-DO1" "AC-35: token 1 = id verbatim"
assert_match '^(proposed|accepted|superseded)$' "$TOK2" \
  "AC-35: token 2 = status enum"

# Default status (omitted) -> "proposed".
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DO2 --title "T" --chosen "C" --actor human \
  --root "$ROOT_TMP" >"$ROOT_TMP/out_def.txt" 2>/dev/null
LINE_DEF="$(head -1 "$ROOT_TMP/out_def.txt")"
assert_eq "$LINE_DEF" "test-DO2 proposed" \
  "AC-35: default status emits 'proposed'"

print_summary "$NAME"
