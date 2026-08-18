#!/usr/bin/env bash
# tests/34-exit-5-target-corrupt.sh - AC-23 (exit 5; bad file PRESERVED).
# Integration: pre-seed a corrupt JSON, invoke writer, assert exit 5 + preserved.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-23: exit 5 on existing target corrupt (bad file PRESERVED)"

ROOT_TMP="$(make_test_root)"
trap 'rm -rf "$ROOT_TMP"' EXIT
SLUG="$(make_test_slug)"
TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"

# Pre-seed the target with invalid JSON.
mkdir -p "$ROOT_TMP"
echo "not json" > "$TARGET"
PRE_HASH="$(sha256sum "$TARGET" | awk '{print $1}')"

OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D01 --title "T" --chosen "C" \
  --actor human --root "$ROOT_TMP" 2>&1)"
RC=$?
assert_exit "$RC" 5 "AC-23: exit 5 on corrupt target"
assert_match "^existing .* is not valid JSON; refusing overwrite" "$OUT" \
  "AC-23: stderr shape matches ARCH §10.2"

# Bad file PRESERVED (byte-identical).
POST_HASH="$(sha256sum "$TARGET" | awk '{print $1}')"
assert_eq "$POST_HASH" "$PRE_HASH" \
  "AC-23: corrupt file preserved byte-identical (not overwritten)"

print_summary "$NAME"
