#!/usr/bin/env bash
# tests/10-insert-new.sh - AC-1 (FR-1 insert NEW decision).
# Integration: real FS + stub sink (to keep test off the real SQLite).
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-1: FR-1 insert NEW decision (survives renderer jq projection)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D01 --title "Pick store" --chosen "SQLite" \
  --rationale "mature" --alternatives "DuckDB" --iteration 1 \
  --status proposed --actor human --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
assert_exit "$RC" 0 "AC-1: exit 0"
assert_eq "$OUT" "test-D01 proposed" "AC-1: stdout is '<id> <status>'"

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
[ -f "$TARGET" ] && ok "AC-1: target file exists" || fail "AC-1: target file exists"

# Entry present at .decisions[]|select(.id=="test-D01").
jq -e '.decisions[]|select(.id=="test-D01")' "$TARGET" >/dev/null 2>&1 \
  && ok "AC-1: jq -e select id=test-D01 succeeds" \
  || fail "AC-1: jq -e select id=test-D01 succeeds"

# Fields equal invocation values.
ACTOR_J="$(jq -r '.decisions[]|select(.id=="test-D01").actor' "$TARGET")"
TITLE_J="$(jq -r '.decisions[]|select(.id=="test-D01").title' "$TARGET")"
CHOSEN_J="$(jq -r '.decisions[]|select(.id=="test-D01").chosen' "$TARGET")"
RATIONALE_J="$(jq -r '.decisions[]|select(.id=="test-D01").rationale' "$TARGET")"
ALTS_J="$(jq -r '.decisions[]|select(.id=="test-D01").alternatives' "$TARGET")"
STATUS_J="$(jq -r '.decisions[]|select(.id=="test-D01").status' "$TARGET")"
TS_J="$(jq -r '.decisions[]|select(.id=="test-D01").timestamp' "$TARGET")"

assert_eq "$ACTOR_J" "human" "AC-1: actor=human persisted"
assert_eq "$TITLE_J" "Pick store" "AC-1: title persisted"
assert_eq "$CHOSEN_J" "SQLite" "AC-1: chosen persisted"
assert_eq "$RATIONALE_J" "mature" "AC-1: rationale persisted"
assert_eq "$ALTS_J" "DuckDB" "AC-1: alternatives persisted"
assert_eq "$STATUS_J" "proposed" "AC-1: status persisted"
assert_match '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$TS_J" \
  "AC-1: timestamp matches ISO 8601 UTC"

# AC-1 / AC-18 / OBS-1: stdout is "<id> <status>\n" only (success line).
assert_match '^[^ ]+ (proposed|accepted|superseded)$' "$OUT" \
  "AC-18: stdout shape matches OBS-1 '<id> <status>'"

# AC-52 sub-assertion (renderer TSV projection, AC-52 dedicated file too):
# the renderer's jq pipeline at section-decisions.sh:41-51 must succeed on
# writer output and emit one TSV row with 9 columns.
TSV_OUT="$(jq -r '.decisions[] | [
  (.id // ""),
  (.actor // ""),
  (.title // ""),
  (.chosen // ""),
  (.rationale // ""),
  (.alternatives // ""),
  (if (.iteration|type) == "number" then (.iteration|tostring) else "" end),
  (.timestamp // ""),
  (.status // "")
] | @tsv' "$TARGET")"
COL_COUNT="$(printf '%s' "$TSV_OUT" | awk -F'\t' '{print NF}')"
assert_eq "$COL_COUNT" "9" "AC-1: renderer TSV emits 9 columns"

print_summary "$NAME"
