#!/usr/bin/env bash
# tests/40-sm-transitions.sh - AC-25..AC-34 (SM-1..SM-9 + illegal-table empty).
# Integration: persisted state flip in JSON via re-invocation.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-25..34: SM-1..SM-9 state transitions + illegal-table empty"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

# Helper: invoke writer and assert final status of a given id.
# Args: slug id expected_status label argv...
invoke_and_assert_status() {
  local slug="$1" id="$2" expected="$3" label="$4"; shift 4
  "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" "$@" \
    --slug "$slug" --id "$id" --root "$ROOT_TMP" >/dev/null 2>&1
  local actual
  actual="$(jq -r --arg id "$id" '.decisions[]|select(.id==$id).status' \
    "$ROOT_TMP/.VERIFY_${slug}.decisions.json" 2>/dev/null)"
  assert_eq "$actual" "$expected" "$label"
}

# SM-1: (absent) -> proposed (default).
SLUG_SM1="$(make_test_slug)"
invoke_and_assert_status "$SLUG_SM1" test-DS1 proposed \
  "AC-25/SM-1: absent -> proposed (default)" \
  --title "T" --chosen "C" --actor human

# SM-2: (absent) -> accepted.
SLUG_SM2="$(make_test_slug)"
invoke_and_assert_status "$SLUG_SM2" test-DS2 accepted \
  "AC-26/SM-2: absent -> accepted" \
  --title "T" --chosen "C" --actor human --status accepted

# SM-3: (absent) -> superseded.
SLUG_SM3="$(make_test_slug)"
invoke_and_assert_status "$SLUG_SM3" test-DS3 superseded \
  "AC-27/SM-3: absent -> superseded" \
  --title "T" --chosen "C" --actor human --status superseded

# SM-4: proposed -> accepted (re-invoke).
SLUG_SM4="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_SM4" --id test-DS4 --title "T" --chosen "C" --actor human \
  --status proposed --root "$ROOT_TMP" >/dev/null 2>&1
invoke_and_assert_status "$SLUG_SM4" test-DS4 accepted \
  "AC-28/SM-4: proposed -> accepted" \
  --title "T" --chosen "C" --actor human --status accepted
LEN4="$(jq '.decisions|length' "$ROOT_TMP/.VERIFY_${SLUG_SM4}.decisions.json")"
assert_eq "$LEN4" "1" "AC-28: array length unchanged after transition"

# SM-5: proposed -> superseded.
SLUG_SM5="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_SM5" --id test-DS5 --title "T" --chosen "C" --actor human \
  --status proposed --root "$ROOT_TMP" >/dev/null 2>&1
invoke_and_assert_status "$SLUG_SM5" test-DS5 superseded \
  "AC-29/SM-5: proposed -> superseded" \
  --title "T" --chosen "C" --actor human --status superseded

# SM-6: accepted -> proposed (EC-16 correction, NOT rejected).
SLUG_SM6="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_SM6" --id test-DS6 --title "T" --chosen "C" --actor human \
  --status accepted --root "$ROOT_TMP" >/dev/null 2>&1
invoke_and_assert_status "$SLUG_SM6" test-DS6 proposed \
  "AC-30/SM-6: accepted -> proposed (EC-16 correction)" \
  --title "T" --chosen "C" --actor human --status proposed

# SM-7: accepted -> superseded.
SLUG_SM7="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_SM7" --id test-DS7 --title "T" --chosen "C" --actor human \
  --status accepted --root "$ROOT_TMP" >/dev/null 2>&1
invoke_and_assert_status "$SLUG_SM7" test-DS7 superseded \
  "AC-31/SM-7: accepted -> superseded" \
  --title "T" --chosen "C" --actor human --status superseded

# SM-8: superseded -> proposed.
SLUG_SM8="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_SM8" --id test-DS8 --title "T" --chosen "C" --actor human \
  --status superseded --root "$ROOT_TMP" >/dev/null 2>&1
invoke_and_assert_status "$SLUG_SM8" test-DS8 proposed \
  "AC-32/SM-8: superseded -> proposed (EC-16 correction)" \
  --title "T" --chosen "C" --actor human --status proposed

# SM-9: superseded -> accepted.
SLUG_SM9="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_SM9" --id test-DS9 --title "T" --chosen "C" --actor human \
  --status superseded --root "$ROOT_TMP" >/dev/null 2>&1
invoke_and_assert_status "$SLUG_SM9" test-DS9 accepted \
  "AC-33/SM-9: superseded -> accepted (EC-16 correction)" \
  --title "T" --chosen "C" --actor human --status accepted

# AC-34: illegal-transition table EMPTY by design. Source grep for any
# transition-rejection error code MUST return zero matches.
RECORD_SH="$REPO_ROOT/.claude/skills/cfn-decisions/record.sh"
LIB_DIR="$REPO_ROOT/.claude/skills/cfn-decisions/lib"
ILLEGAL_HITS="$(grep -rnE 'illegal transition|cannot transition|invalid state change' \
  "$RECORD_SH" "$LIB_DIR"/*.sh 2>/dev/null | wc -l)"
assert_eq "$ILLEGAL_HITS" "0" \
  "AC-34: zero transition-rejection error codes in writer source"

print_summary "$NAME"
