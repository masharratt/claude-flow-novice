#!/usr/bin/env bash
# tests/w-5-timeout-wrapper.sh - AC-65 (WIRING-5: Q1 timeout wrapper).
# sink-delegate.sh wraps the record.sh call with `timeout "${SINK_TIMEOUT_SECONDS:-30}"`.
# 1. Source grep: timeout wrapper present.
# 2. Behavior: stub sink sleeps > SINK_TIMEOUT_SECONDS -> writer exits 8
#    within bounded wall-clock (well under the sleep duration).
# 3. SINK_TIMEOUT_SECONDS env var overrides the default 30s.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-65: WIRING-5 Q1 timeout wrapper around sink call"

SINK_SH="$REPO_ROOT/.claude/skills/cfn-decisions/lib/sink-delegate.sh"

# 1. Source grep: `timeout` wrapper with the canonical env-var default.
if grep -qE 'timeout[[:space:]]+"?\$\{?SINK_TIMEOUT_SECONDS:-30\}?"?' "$SINK_SH"; then
  ok "AC-65: sink-delegate wraps call with timeout (SINK_TIMEOUT_SECONDS:-30)"
else
  fail "AC-65: timeout wrapper present in source" "absent in sink-delegate.sh"
fi
# stderr suppressed (FR-9 INFO-LEAK).
if grep -qE '2>/dev/null' "$SINK_SH"; then
  ok "AC-65: sink stderr suppressed (2>/dev/null)"
else
  fail "AC-65: sink stderr suppressed" "no 2>/dev/null in sink-delegate.sh"
fi

# 2. Behavior: stub sleeps 60s, writer exits 8 within bounded wall-clock.
ROOT_TMP="$(make_test_root)"
BIN_DIR_DEFAULT="$(make_stub_sink 0 60)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR_DEFAULT" "$BIN_DIR_SHORT"' EXIT
BIN_DIR_SHORT=""
PATH="$BIN_DIR_DEFAULT:$PATH"
SLUG="$(make_test_slug)"

START_EPOCH="$(date +%s%N)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DT1 --title T --chosen C --actor human \
  --root "$ROOT_TMP" >/dev/null 2>&1
RC=$?
END_EPOCH="$(date +%s%N)"
WALL_MS=$(( (END_EPOCH - START_EPOCH) / 1000000 ))

assert_exit "$RC" 8 "AC-65: hung sink -> E_SINK_NONZERO=8"
# Default 30s timeout: wall must be < 35s (bounded).
if [ "$WALL_MS" -lt 35000 ]; then
  ok "AC-65: bounded wall ${WALL_MS}ms (< 35s default timeout)"
else
  fail "AC-65: bounded wall under default timeout" "actual=${WALL_MS}ms"
fi

# 3. SINK_TIMEOUT_SECONDS env var overrides default to shorter value.
BIN_DIR_SHORT="$(make_stub_sink 0 60)"
SLUG2="$(make_test_slug)"
START_EPOCH="$(date +%s%N)"
SINK_TIMEOUT_SECONDS=2 PATH="$BIN_DIR_SHORT:$PATH" \
  "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
    --slug "$SLUG2" --id test-DT2 --title T --chosen C --actor human \
    --root "$ROOT_TMP" >/dev/null 2>&1
RC2=$?
END_EPOCH="$(date +%s%N)"
WALL_MS2=$(( (END_EPOCH - START_EPOCH) / 1000000 ))
assert_exit "$RC2" 8 "AC-65: hung sink under override -> E_SINK_NONZERO=8"
if [ "$WALL_MS2" -lt 5000 ]; then
  ok "AC-65: override SINK_TIMEOUT_SECONDS=2 -> wall ${WALL_MS2}ms (< 5s)"
else
  fail "AC-65: override respected" "wall=${WALL_MS2}ms (expected < 5s)"
fi

print_summary "$NAME"
