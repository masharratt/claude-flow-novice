#!/usr/bin/env bash
# tests/63-oversized-10k.sh - AC-47 + ADV-2 (EC-4 10000-char rationale).
# Unit + perf: full 10k chars persisted; wall < 500ms.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-47/ADV-2: EC-4 10000-char rationale (full persistence, p95 < 500ms)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
PAYLOAD="$(printf 'x%.0s' {1..10000})"
LEN_IN="${#PAYLOAD}"
assert_eq "$LEN_IN" "10000" "AC-47 [precondition]: payload is 10000 chars"

START_EPOCH="$(date +%s%N)"
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DB1 --title "T" --chosen "C" \
  --rationale "$PAYLOAD" --actor human --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
END_EPOCH="$(date +%s%N)"
WALL_MS=$(( (END_EPOCH - START_EPOCH) / 1000000 ))
assert_exit "$RC" 0 "AC-47: exit 0 with 10k rationale"

# NFR-3: p95 < 500ms.
if [ "$WALL_MS" -lt 500 ]; then
  ok "AC-47/NFR-3: wall ${WALL_MS}ms < 500ms"
else
  fail "AC-47/NFR-3: wall < 500ms" "actual=${WALL_MS}ms"
fi

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
LEN_OUT="$(jq -r '.decisions[]|select(.id=="test-DB1").rationale|length' "$TARGET")"
assert_eq "$LEN_OUT" "10000" "AC-47: 10000 chars persisted in full"

print_summary "$NAME"
