#!/usr/bin/env bash
# tests/70-renderer-contract.sh - AC-52 (LOCKED renderer jq TSV projection).
# Contract: writer's JSON output parses under the section-decisions.sh:38-51
# jq TSV projection with no missing keys.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-52: writer JSON survives LOCKED renderer TSV projection"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DR1 --title "Pick store" --chosen "SQLite" \
  --rationale "mature; widely deployed" --alternatives "DuckDB, Postgres" \
  --iteration 7 --status accepted --blocking true --actor ai \
  --root "$ROOT_TMP" >/dev/null 2>&1

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"

# The literal renderer projection (section-decisions.sh:41-51). Verbatim.
PROJ_OUT="$(jq -r '.decisions[] | [
  (.id // ""),
  (.actor // ""),
  (.title // ""),
  (.chosen // ""),
  (.rationale // ""),
  (.alternatives // ""),
  (if (.iteration|type) == "number" then (.iteration|tostring) else "" end),
  (.timestamp // ""),
  (.status // "")
] | @tsv' "$TARGET" 2>&1)"
RC=$?
assert_exit "$RC" 0 "AC-52: renderer jq TSV projection exits 0"

# One TSV row, 9 columns. Use grep -c . to count non-empty lines (jq output
# may lack a trailing newline, which breaks wc -l).
ROW_COUNT="$(printf '%s\n' "$PROJ_OUT" | grep -c .)"
[ "$ROW_COUNT" -ge 1 ] && ok "AC-52: projection emits >=1 TSV row" \
  || fail "AC-52: projection emits >=1 TSV row"
COL_COUNT="$(printf '%s' "$PROJ_OUT" | head -1 | awk -F'\t' '{print NF}')"
assert_eq "$COL_COUNT" "9" "AC-52: projection emits 9 columns"

# Spot-check column values match the invocation.
COL1="$(printf '%s' "$PROJ_OUT" | head -1 | awk -F'\t' '{print $1}')"
assert_eq "$COL1" "test-DR1" "AC-52: column 1 (id) matches"
COL2="$(printf '%s' "$PROJ_OUT" | head -1 | awk -F'\t' '{print $2}')"
assert_eq "$COL2" "ai" "AC-52: column 2 (actor) matches"
COL7="$(printf '%s' "$PROJ_OUT" | head -1 | awk -F'\t' '{print $7}')"
assert_eq "$COL7" "7" "AC-52: column 7 (iteration) matches (JSON number rendered)"

print_summary "$NAME"
