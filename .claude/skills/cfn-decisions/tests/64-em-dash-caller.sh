#!/usr/bin/env bash
# tests/64-em-dash-caller.sh - AC-48 (EC-22 / NFR-5 em dash carve-out).
# Unit + static: caller-supplied em dash persists verbatim (NFR-5 ban is on
# writer's OWN code, not caller data); writer source has ZERO em dashes.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-48: EC-22 em dash in caller rationale (verbatim; NFR-5 carve-out)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
# Caller-supplied text with em dash (U+2014). Built via printf so no literal
# em dash appears in this test file's source (NFR-5 static scan stays clean).
EM_DASH="$(printf '\xe2\x80\x94')"
PAYLOAD="decision ${EM_DASH} with em dash"
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DE1 --title "T" --chosen "C" \
  --rationale "$PAYLOAD" --actor human --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
assert_exit "$RC" 0 "AC-48: exit 0 with em-dash rationale"

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
RT="$(jq -r '.decisions[]|select(.id=="test-DE1").rationale' "$TARGET" | tr -d '\n')"
assert_eq "$RT" "$PAYLOAD" "AC-48: em dash persisted verbatim"

# NFR-5 static: writer's OWN source/SKILL.md/tests have ZERO em dashes.
EM_HITS="$(grep -rnP '\x{2014}' \
  "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  "$REPO_ROOT/.claude/skills/cfn-decisions/SKILL.md" \
  "$REPO_ROOT/.claude/skills/cfn-decisions/lib"/*.sh \
  "$REPO_ROOT/.claude/skills/cfn-decisions/tests"/*.sh 2>/dev/null | wc -l)"
assert_eq "$EM_HITS" "0" \
  "AC-48/NFR-5: zero em dashes in writer's OWN code/SKILL.md/tests"

print_summary "$NAME"
