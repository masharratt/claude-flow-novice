#!/usr/bin/env bash
# tests/42-reader-during-write.sh - AC-50 (EC-7 reader never sees partial).
# Integration: background poller samples target every 10ms during a write;
# every sample must be EITHER "absent" OR "jq empty succeeded".
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-50: EC-7 reader never observes a partial file"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
POLL_LOG="$ROOT_TMP/poll.log"

# Background poller: every 10ms, if target exists, run jq empty; record outcome.
poll_loop() {
  local target="$1" log="$2"
  while true; do
    if [ -f "$target" ]; then
      if jq empty "$target" >/dev/null 2>&1; then
        echo "ok" >> "$log"
      else
        echo "PARTIAL" >> "$log"
      fi
    else
      echo "absent" >> "$log"
    fi
    sleep 0.01
  done
}

# Start poller.
poll_loop "$TARGET" "$POLL_LOG" &
POLL_PID=$!

# Run several writer invocations to give the poller many samples.
for i in 1 2 3 4 5 6 7 8 9 10; do
  "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
    --slug "$SLUG" --id "test-DR$i" --title "T$i" --chosen "C" --actor human \
    --root "$ROOT_TMP" >/dev/null 2>&1
done

# Stop poller.
kill "$POLL_PID" 2>/dev/null || true
wait "$POLL_PID" 2>/dev/null || true

# Assert: zero PARTIAL samples in the poll log.
# grep -c exits 1 when count is 0, which would trigger `|| echo 0` and append
# a second "0" line. Use `|| true` so only grep's "0" is captured.
PARTIAL_COUNT="$(grep -c 'PARTIAL' "$POLL_LOG" 2>/dev/null || true)"
PARTIAL_COUNT="${PARTIAL_COUNT:-0}"
assert_eq "$PARTIAL_COUNT" "0" "AC-50: zero partial-file observations"

# Sanity: at least one "ok" sample landed.
OK_COUNT="$(grep -c '^ok$' "$POLL_LOG" 2>/dev/null || true)"
OK_COUNT="${OK_COUNT:-0}"
if [ "$OK_COUNT" -gt 0 ]; then
  ok "AC-50: reader saw valid file ($OK_COUNT samples)"
else
  fail "AC-50: reader saw valid file" "no ok samples"
fi

print_summary "$NAME"
