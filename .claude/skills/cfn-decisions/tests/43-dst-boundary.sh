#!/usr/bin/env bash
# tests/43-dst-boundary.sh - AC-59 (EC-20 DST boundary).
# Integration: parallel invocations spanning a simulated DST boundary. If
# faketime is unavailable, fall back to asserting both timestamps match the
# UTC ISO 8601 regex (TEST §6 PARKED: do not block on cross-DST simulation
# if the tool is absent).
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-59: EC-20 DST boundary (timestamps well-formed UTC)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

run_one() {
  local slug="$1" faketime_arg="$2"
  local out_rc out_target
  if command -v faketime >/dev/null 2>&1; then
    faketime "$faketime_arg" "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
      --slug "$slug" --id test-DD1 --title "T" --chosen "C" --actor human \
      --root "$ROOT_TMP" >/dev/null 2>&1
  else
    "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
      --slug "$slug" --id test-DD1 --title "T" --chosen "C" --actor human \
      --root "$ROOT_TMP" >/dev/null 2>&1
  fi
}

SLUG_PRE="$(make_test_slug)"
SLUG_POST="$(make_test_slug)"

# Run "before" and "after" DST boundary (US DST in 2026: March 8 2026).
run_one "$SLUG_PRE" "2026-03-07 12:00:00"
run_one "$SLUG_POST" "2026-03-09 12:00:00"

T_PRE="$(jq -r '.decisions[]|select(.id=="test-DD1").timestamp' \
  "$ROOT_TMP/.VERIFY_${SLUG_PRE}.decisions.json" 2>/dev/null)"
T_POST="$(jq -r '.decisions[]|select(.id=="test-DD1").timestamp' \
  "$ROOT_TMP/.VERIFY_${SLUG_POST}.decisions.json" 2>/dev/null)"

# Both timestamps well-formed UTC ISO 8601 (regex; no ambiguity).
assert_match '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$T_PRE" \
  "AC-59: pre-DST timestamp well-formed UTC"
assert_match '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$T_POST" \
  "AC-59: post-DST timestamp well-formed UTC"

if ! command -v faketime >/dev/null 2>&1; then
  echo "NOTE: faketime absent; cross-DST simulation is a documented skip per"
  echo "TEST §6 PARKED list. The UTC-regex assertion above is the carried"
  echo "default; do not block implementation on the simulation."
fi

print_summary "$NAME"
