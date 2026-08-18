#!/usr/bin/env bash
# tests/w-4-renderer-wired.sh - AC-64 (WIRING-4: renderer schema lockstep).
# Writer's JSON shape must survive the LOCKED renderer TSV projection
# (section-decisions.sh:38-51) verbatim. Confirms writer emits every key
# the renderer reads, with types compatible (// defaults handle absence,
# but every key SHOULD be present to honor the contract).
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-64: WIRING-4 renderer schema lockstep"

ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DW4 --title "T" --chosen "C" --actor human \
  --root "$ROOT_TMP" >/dev/null 2>&1
RC=$?
assert_exit "$RC" 0 "AC-64: writer exits 0"

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
[ -f "$TARGET" ] && ok "AC-64: target JSON exists" \
  || { fail "AC-64: target JSON exists" "absent"; print_summary "$NAME"; exit 1; }

# All keys the renderer reads must be present (renderer uses // "" fallback,
# but writer should emit them to honor the contract).
REQUIRED_KEYS="id actor title chosen rationale alternatives iteration timestamp status"
for key in $REQUIRED_KEYS; do
  PRESENT="$(jq --arg k "$key" '.decisions[0] | has($k)' "$TARGET")"
  if [ "$PRESENT" = "true" ]; then
    ok "AC-64: writer emits key '$key'"
  else
    fail "AC-64: writer emits key '$key'" "absent in entry"
  fi
done

# Type contract: iteration is JSON number; others are strings. Use jq -r so
# output is the raw type name (no surrounding JSON quotes).
ITER_TYPE="$(jq -r '.decisions[0].iteration | type' "$TARGET")"
assert_eq "$ITER_TYPE" "number" "AC-64: iteration is JSON number"
for skey in id actor title chosen rationale alternatives timestamp status; do
  TYPE="$(jq -r --arg k "$skey" '.decisions[0][$k] | type' "$TARGET")"
  assert_eq "$TYPE" "string" "AC-64: $skey is JSON string"
done

# blocking: JSON boolean.
BLK_TYPE="$(jq -r '.decisions[0].blocking | type' "$TARGET")"
assert_eq "$BLK_TYPE" "boolean" "AC-64: blocking is JSON boolean"

# slug key on the wrapper object.
SLUG_KEY="$(jq -r --arg k slug 'has($k)' "$TARGET")"
assert_eq "$SLUG_KEY" "true" "AC-64: wrapper has slug key"
SLUG_VAL="$(jq -r '.slug' "$TARGET")"
assert_eq "$SLUG_VAL" "$SLUG" "AC-64: wrapper slug matches"

# decisions array key.
DEC_KEY="$(jq -r --arg k decisions 'has($k)' "$TARGET")"
assert_eq "$DEC_KEY" "true" "AC-64: wrapper has decisions array"
DEC_TYPE="$(jq -r '.decisions | type' "$TARGET")"
assert_eq "$DEC_TYPE" "array" "AC-64: decisions is JSON array"

# Renderer projection completes (verbatim jq from section-decisions.sh).
PROJ="$(jq -r '.decisions[] | [
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
PROJ_RC=$?
assert_exit "$PROJ_RC" 0 "AC-64: renderer projection completes"

print_summary "$NAME"
