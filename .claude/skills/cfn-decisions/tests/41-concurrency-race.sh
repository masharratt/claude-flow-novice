#!/usr/bin/env bash
# tests/41-concurrency-race.sh - AC-49 (EC-6 race).
# Integration: two writers race on same (slug,id); valid JSON, exactly one
# entry, no temp files linger.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-49: EC-6 concurrent writers race (valid JSON, one entry, no temps)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"

# Launch two writer subprocesses in the background with the same id but
# different titles. POSIX rename(2) is atomic; one mv lands last and wins.
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DR1 --title "title-from-A" --chosen "C" \
  --actor human --root "$ROOT_TMP" >/dev/null 2>&1 &
PID_A=$!
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DR1 --title "title-from-B" --chosen "C" \
  --actor ai --root "$ROOT_TMP" >/dev/null 2>&1 &
PID_B=$!

wait "$PID_A" 2>/dev/null || true
wait "$PID_B" 2>/dev/null || true

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"

# File valid JSON.
jq empty "$TARGET" >/dev/null 2>&1 \
  && ok "AC-49: final file is valid JSON after race" \
  || fail "AC-49: final file is valid JSON after race"

# Exactly ONE entry for the id.
ENT_COUNT="$(jq '[.decisions[]|select(.id=="test-DR1")]|length' "$TARGET" 2>/dev/null)"
assert_eq "$ENT_COUNT" "1" "AC-49: exactly one entry for the raced id"

# Final title equals one of the two inputs (last-writer-wins, never a merge).
FINAL_TITLE="$(jq -r '.decisions[]|select(.id=="test-DR1").title' "$TARGET" 2>/dev/null)"
if [ "$FINAL_TITLE" = "title-from-A" ] || [ "$FINAL_TITLE" = "title-from-B" ]; then
  ok "AC-49: final title is one of the two inputs ($FINAL_TITLE)"
else
  fail "AC-49: final title is one of the two inputs" "got=$FINAL_TITLE"
fi

# No temp files linger.
TMP_COUNT="$(find "$ROOT_TMP" -name '.dec.*' 2>/dev/null | wc -l)"
assert_eq "$TMP_COUNT" "0" "AC-49: no .dec.XXXXXX temp files linger"

print_summary "$NAME"
