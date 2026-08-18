#!/usr/bin/env bash
# tests/62-unicode-roundtrip.sh - AC-46 + ADV-1 (EC-21 unicode/emoji round-trip).
# Unit: byte-equal persistence of unicode payloads.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-46/ADV-1: EC-21 unicode (emoji, RLO, CJK, surrogate) byte-equal"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
# ADV-1 payload: emoji + RLO override + CJK + surrogate-pair char.
PAYLOAD='🦀‮中文𝕏'

OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DU1 --title "T" --chosen "C" \
  --rationale "$PAYLOAD" --actor human --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
assert_exit "$RC" 0 "AC-46: exit 0 with unicode payload"

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
# Round-trip byte-equal: compare UTF-8 bytes via xxd. Strip jq's trailing
# newline BEFORE xxd so it does not appear as an extra 0a byte.
IN_HEX="$(printf '%s' "$PAYLOAD" | xxd -p | tr -d '\n')"
RT_HEX="$(jq -r '.decisions[]|select(.id=="test-DU1").rationale' "$TARGET" \
  | tr -d '\n' | xxd -p | tr -d '\n')"
assert_eq "$RT_HEX" "$IN_HEX" "AC-46: rationale round-trips byte-equal (UTF-8 hex)"

# Writer does not normalize / transliterate / strip.
LEN="$(jq -r '.decisions[]|select(.id=="test-DU1").rationale|length' "$TARGET")"
[ -n "$LEN" ] && [ "$LEN" -ge 4 ] \
  && ok "AC-46: unicode length preserved (length=$LEN)" \
  || fail "AC-46: unicode length preserved" "length=$LEN"

print_summary "$NAME"
