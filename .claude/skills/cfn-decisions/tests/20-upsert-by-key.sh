#!/usr/bin/env bash
# tests/20-upsert-by-key.sh - AC-2 (FR-2 CARDINALITY, RED FIRST priority).
# Integration: real FS, stub sink (no SQLite touch).
#
# THIS IS THE LOAD-BEARING TEST that distinguishes upsert-by-key from
# bless-verify.sh's append-only event ledger. If the writer accidentally
# appends on re-resolve, this test catches it; no other test does.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-2: FR-2 UPSERT-BY-KEY (CARDINALITY: length UNCHANGED on re-resolve)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"

# Pre-seed three entries: test-D01, test-D02, test-D03.
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D01 --title "t1" --chosen "c1" --actor human \
  --root "$ROOT_TMP" >/dev/null 2>&1
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D02 --title "t2" --chosen "c2" --actor ai \
  --root "$ROOT_TMP" >/dev/null 2>&1
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D03 --title "t3" --chosen "c3" --actor human \
  --root "$ROOT_TMP" >/dev/null 2>&1

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"

# Snapshot D01 and D03 BEFORE the re-resolve of D02.
PRE_D01="$(jq -S '.decisions[]|select(.id=="test-D01")' "$TARGET")"
PRE_D03="$(jq -S '.decisions[]|select(.id=="test-D03")' "$TARGET")"
PRE_LEN="$(jq '.decisions|length' "$TARGET")"
assert_eq "$PRE_LEN" "3" "AC-2 [precondition]: 3 entries seeded"

# Re-invoke with id=test-D02, new fields.
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D02 --title "v2-updated" --chosen "X-new" \
  --actor ai --status accepted --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
assert_exit "$RC" 0 "AC-2 [re-resolve]: exit 0"

# CARDINALITY: array length UNCHANGED at 3 (NOT 4).
POST_LEN="$(jq '.decisions|length' "$TARGET")"
assert_eq "$POST_LEN" "3" "AC-2 [CARDINALITY]: length UNCHANGED at 3 (replace, not append)"

# Order preserved: ids still in [test-D01, test-D02, test-D03] order.
IDS="$(jq -r '.decisions[].id' "$TARGET" | paste -sd, -)"
assert_eq "$IDS" "test-D01,test-D02,test-D03" \
  "AC-2: relative order preserved [D01, D02, D03]"

# D02 has the NEW fields.
D02_TITLE="$(jq -r '.decisions[]|select(.id=="test-D02").title' "$TARGET")"
D02_CHOSEN="$(jq -r '.decisions[]|select(.id=="test-D02").chosen' "$TARGET")"
D02_STATUS="$(jq -r '.decisions[]|select(.id=="test-D02").status' "$TARGET")"
assert_eq "$D02_TITLE" "v2-updated" "AC-2: D02 title replaced"
assert_eq "$D02_CHOSEN" "X-new" "AC-2: D02 chosen replaced"
assert_eq "$D02_STATUS" "accepted" "AC-2: D02 status replaced"

# D01 and D03 byte-identical pre vs post.
POST_D01="$(jq -S '.decisions[]|select(.id=="test-D01")' "$TARGET")"
POST_D03="$(jq -S '.decisions[]|select(.id=="test-D03")' "$TARGET")"
assert_eq "$POST_D01" "$PRE_D01" "AC-2: D01 byte-identical pre/post"
assert_eq "$POST_D03" "$PRE_D03" "AC-2: D03 byte-identical pre/post"

# NO fourth element exists.
COUNT_D02="$(jq '[.decisions[]|select(.id=="test-D02")]|length' "$TARGET")"
assert_eq "$COUNT_D02" "1" "AC-2: exactly ONE D02 entry (no duplicate)"

print_summary "$NAME"
