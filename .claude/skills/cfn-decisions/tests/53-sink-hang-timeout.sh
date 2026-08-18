#!/usr/bin/env bash
# tests/53-sink-hang-timeout.sh - AC-66 (Q1 sink-hang behavior).
# Integration: stub record.sh sleeps 30s; writer's SINK_TIMEOUT_SECONDS
# override kills at 5s; assert wall < 8s, JSON KEPT, exit 8.
# Using override keeps the test fast (real default 30s is exercised in
# w-5-timeout-wrapper.sh).
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-66: Q1 sink-hang timeout (kill at 5s override, JSON KEPT, exit 8)"
ROOT_TMP="$(make_test_root)"
# Stub sleeps 30s before exiting 0; override kills at 5s.
BIN_DIR="$(make_stub_sink 0 30)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"

# Wall-clock measurement. Override the default 30s to 5s for fast feedback.
START_EPOCH="$(date +%s)"
ERR_OUT="$(SINK_TIMEOUT_SECONDS=5 \
  "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D01 --title "T" --chosen "C" \
  --rationale "r" --alternatives "a" --status proposed --blocking false \
  --actor human --root "$ROOT_TMP" 2>&1 >/dev/null)"
RC=$?
END_EPOCH="$(date +%s)"
WALL=$((END_EPOCH - START_EPOCH))

# AC-66: wall time well under the 30s stubbed sleep (5s timeout + load headroom; 3x override).
AC66_WALL_CAP=15
if [ "$WALL" -lt "$AC66_WALL_CAP" ]; then
  ok "AC-66: wall time < ${AC66_WALL_CAP}s (actual=${WALL}s, timeout=5s)"
else
  fail "AC-66: wall time < ${AC66_WALL_CAP}s" "actual=${WALL}s"
fi

# AC-66: writer exit non-zero (sync-failed = exit 8).
assert_exit "$RC" 8 "AC-66: writer exit 8 on sink hang (124 -> E_SINK_NONZERO)"

# AC-66: JSON entry KEPT despite sink hang.
TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
jq -e '.decisions[]|select(.id=="test-D01")' "$TARGET" >/dev/null 2>&1 \
  && ok "AC-66: JSON entry KEPT after sink-hang kill" \
  || fail "AC-66: JSON entry KEPT after sink-hang kill"

# AC-37 / OBS-3: stderr shape (record.sh failed exit=124).
assert_match "^record\.sh failed exit=124; JSON persisted at " "$ERR_OUT" \
  "AC-66/OBS-3: stderr reports exit=124 (timeout kill)"

print_summary "$NAME"
