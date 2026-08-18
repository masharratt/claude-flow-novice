#!/usr/bin/env bash
# tests/60-jq-construction.sh - AC-8 + AC-44 (FR-6 + EC-13/14 XSS half).
# Unit: in-process jq construction with hostile rationale payloads.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-8/44: FR-6 jq construction (comma-injection, XSS verbatim)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

# EC-13 / AC-8: comma-injection payload.
SLUG_E1="$(make_test_slug)"
PAYLOAD='","evil":true,"gap":"'
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_E1" --id test-DE1 --title "T" --chosen "C" \
  --rationale "$PAYLOAD" --actor human --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
assert_exit "$RC" 0 "AC-8 [EC-13]: exit 0 with comma-injection rationale"
TARGET="$ROOT_TMP/.VERIFY_${SLUG_E1}.decisions.json"
jq empty "$TARGET" >/dev/null 2>&1 \
  && ok "AC-8 [EC-13]: file is valid JSON" \
  || fail "AC-8 [EC-13]: file is valid JSON"
# NO `evil` key injected.
EVIL_COUNT="$(jq '[.decisions[]|select(.evil==true)]|length' "$TARGET" 2>/dev/null)"
assert_eq "$EVIL_COUNT" "0" "AC-8 [EC-13]: no evil key injected"
# Rationale persists as flat string (round-trip byte-for-byte).
RT="$(jq -r '.decisions[]|select(.id=="test-DE1").rationale' "$TARGET")"
assert_eq "$RT" "$PAYLOAD" "AC-8 [EC-13]: rationale round-trips byte-for-byte"

# AC-44 / ADV-3 XSS half: <script>alert(1)</script> persisted verbatim.
SLUG_E2="$(make_test_slug)"
PAYLOAD_XSS='<script>alert(1)</script>'
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_E2" --id test-DE2 --title "T" --chosen "C" \
  --rationale "$PAYLOAD_XSS" --actor human --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
assert_exit "$RC" 0 "AC-44 [XSS]: exit 0 with <script> rationale"
TARGET2="$ROOT_TMP/.VERIFY_${SLUG_E2}.decisions.json"
RT_XSS="$(jq -r '.decisions[]|select(.id=="test-DE2").rationale' "$TARGET2")"
assert_eq "$RT_XSS" "$PAYLOAD_XSS" "AC-44 [XSS]: <script> persisted verbatim"
# Writer did NOT html-escape, strip, or reject.
if printf '%s' "$RT_XSS" | grep -qF '<script>alert(1)</script>'; then
  ok "AC-44 [XSS]: writer did not html-escape or strip"
else
  fail "AC-44 [XSS]: writer did not html-escape or strip"
fi

print_summary "$NAME"
