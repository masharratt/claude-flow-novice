#!/usr/bin/env bash
# tests/96-actor-enum.sh - AC-17 (FR-10 actor enum validated).
# Unit: pure argv parse, no FS touch (validation rejects before FS access).
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-17: actor enum validated (reject blob with exit 2)"
ROOT_TMP="$(make_test_root)"
trap 'rm -rf "$ROOT_TMP"' EXIT

# Invalid actor -> exit 2, no JSON entry.
OUTPUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug test-dec-aaaaaa --id test-D01 --title "T" --chosen "C" \
  --actor blob --root "$ROOT_TMP" 2>&1)"
RC=$?
assert_exit "$RC" 2 "AC-17: --actor blob exits 2"
assert_contains "$OUTPUT" "actor must be human|ai" \
  "AC-17: stderr names actor constraint"

# No JSON entry written.
SLUG_FILE="$ROOT_TMP/.VERIFY_test-dec-aaaaaa.decisions.json"
[ ! -f "$SLUG_FILE" ] && ok "AC-17: no JSON entry for blob actor" \
  || fail "AC-17: no JSON entry for blob actor"

# record.sh was NOT invoked (no SQLite row). Use a stub sink that records.
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug test-dec-bbbbbb --id test-D02 --title "T" --chosen "C" \
  --actor blob --root "$ROOT_TMP" >/dev/null 2>&1
[ ! -f "$BIN_DIR/last-argv" ] && ok "AC-17: record.sh NOT invoked on bad actor" \
  || fail "AC-17: record.sh NOT invoked on bad actor"

# Valid enum values accepted.
SLUG_OK="$(make_test_slug)"
SINK_DIR="$(with_real_sink)"
[ -n "$SINK_DIR" ] && PATH="$SINK_DIR:$PATH"
scrub_decisions_db
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_OK" --id test-DA --title "T" --chosen "C" \
  --actor ai --root "$ROOT_TMP" >/dev/null 2>&1
RC=$?
assert_exit "$RC" 0 "AC-17: --actor ai accepted"
ACT="$(jq -r '.decisions[]|select(.id=="test-DA").actor' \
  "$ROOT_TMP/.VERIFY_${SLUG_OK}.decisions.json" 2>/dev/null)"
assert_eq "$ACT" "ai" "AC-17: actor=ai persisted"

print_summary "$NAME"
