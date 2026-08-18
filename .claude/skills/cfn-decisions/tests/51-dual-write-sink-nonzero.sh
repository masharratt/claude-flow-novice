#!/usr/bin/env bash
# tests/51-dual-write-sink-nonzero.sh - AC-6 + AC-37 (FR-5 D-7 sink-nonzero).
# Integration: stub record.sh exits 17; assert JSON KEPT, exit 8, OBS-3 shape.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-6/37: FR-5 D-7 sink exits non-zero (JSON KEPT, exit 8, no rationale in stderr)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 17)"  # sink exits 17
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
# Use a leak-marker rationale; assert it does NOT appear in stderr.
ERR_OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D01 --title "T" --chosen "C" \
  --rationale "secret-marker-ZZY-12345" --alternatives "a" \
  --status proposed --blocking false --actor human \
  --root "$ROOT_TMP" 2>&1 >/dev/null)"
RC=$?
assert_exit "$RC" 8 "AC-6: exit 8 on sink exit 17"

# OBS-3: stderr shape matches ARCH §10.2 regex.
assert_match "^record\.sh failed exit=17; JSON persisted at .*; SQLite out of sync$" \
  "$ERR_OUT" "AC-37/OBS-3: stderr shape"

# D-7: JSON KEPT (not rolled back). jq -e select id succeeds.
TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
jq -e '.decisions[]|select(.id=="test-D01")' "$TARGET" >/dev/null 2>&1 \
  && ok "AC-6: JSON entry still queryable after sink failure (KEPT)" \
  || fail "AC-6: JSON entry still queryable after sink failure"

# FR-9: rationale NOT in stderr (no leak).
assert_not_contains "$ERR_OUT" "secret-marker-ZZY-12345" \
  "AC-6/FR-9: rationale marker absent from stderr"

print_summary "$NAME"
