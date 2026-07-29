#!/usr/bin/env bash
# tests/95-defaults.sh - AC-16 + AC-53 + AC-57 (FR-10 defaults + iteration + TZ).
# Unit test: pure argv parse + jq build, no FS, no sink.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-16/53/57: FR-10 defaults (iteration, status, blocking, timestamp, TZ)"
ROOT_TMP="$(make_test_root)"
SINK_DIR="$(with_real_sink)"
trap 'rm -rf "$ROOT_TMP"' EXIT
# Use the real sink so happy-path exit codes are 0, not 7 (sink missing).
[ -n "$SINK_DIR" ] && PATH="$SINK_DIR:$PATH"; export PATH
scrub_decisions_db

# AC-16: 5 required flags only; defaults applied.
SLUG="$(make_test_slug)"
OUTPUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D01 \
  --title "T" --chosen "C" --actor human \
  --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
assert_exit "$RC" 0 "AC-16: exit 0 with only required flags"

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
[ -f "$TARGET" ] && ok "AC-16: file written" || fail "AC-16: file written"

ITER="$(jq -r '.decisions[]|select(.id=="test-D01").iteration' "$TARGET")"
assert_eq "$ITER" "1" "AC-16: iteration default = 1 (JSON number)"

STATUS_J="$(jq -r '.decisions[]|select(.id=="test-D01").status' "$TARGET")"
assert_eq "$STATUS_J" "proposed" "AC-16: status default = proposed"

BLOCK_J="$(jq -r '.decisions[]|select(.id=="test-D01").blocking' "$TARGET")"
assert_eq "$BLOCK_J" "false" "AC-16: blocking default = false (JSON boolean)"

# iteration is JSON number type (renderer guard at section-decisions.sh:48).
ITTYPE="$(jq -r '.decisions[]|select(.id=="test-D01").iteration|type' "$TARGET")"
assert_eq "$ITTYPE" "number" "AC-16: iteration is JSON number type"

# blocking is JSON boolean type.
BLTYPE="$(jq -r '.decisions[]|select(.id=="test-D01").blocking|type' "$TARGET")"
assert_eq "$BLTYPE" "boolean" "AC-16: blocking is JSON boolean type"

# timestamp matches ISO 8601 UTC regex.
TS_J="$(jq -r '.decisions[]|select(.id=="test-D01").timestamp' "$TARGET")"
assert_match '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$TS_J" \
  "AC-16: timestamp matches ISO 8601 UTC regex"

# AC-53: iteration boundary values 0 and 2147483647.
SLUG2="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG2" --id test-D00 --iteration 0 \
  --title "T" --chosen "C" --actor human \
  --root "$ROOT_TMP" 2>/dev/null
ITER0="$(jq -r '.decisions[]|select(.id=="test-D00").iteration' "$ROOT_TMP/.VERIFY_${SLUG2}.decisions.json")"
assert_eq "$ITER0" "0" "AC-53: iteration=0 accepted"

SLUG3="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG3" --id test-DMAX --iteration 2147483647 \
  --title "T" --chosen "C" --actor human \
  --root "$ROOT_TMP" 2>/dev/null
ITERMAX="$(jq -r '.decisions[]|select(.id=="test-DMAX").iteration' "$ROOT_TMP/.VERIFY_${SLUG3}.decisions.json")"
assert_eq "$ITERMAX" "2147483647" "AC-53: iteration=2147483647 accepted"

# AC-57: TZ=America/New_York ignored; persisted timestamp is UTC.
SLUG4="$(make_test_slug)"
TZ_OUTPUT="$(TZ=America/New_York "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG4" --id test-DTZ \
  --title "T" --chosen "C" --actor human \
  --root "$ROOT_TMP" 2>/dev/null)"
TS_TZ="$(jq -r '.decisions[]|select(.id=="test-DTZ").timestamp' "$ROOT_TMP/.VERIFY_${SLUG4}.decisions.json")"
assert_match '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$TS_TZ" \
  "AC-57: TZ=America/New_York produces UTC timestamp"

# Compare with date -u within a 2-second tolerance.
NOW_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
NOW_EPOCH="$(date -u -d "$NOW_UTC" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$NOW_UTC" +%s 2>/dev/null || echo 0)"
TS_EPOCH="$(date -u -d "$TS_TZ" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$TS_TZ" +%s 2>/dev/null || echo 0)"
if [ "$NOW_EPOCH" -ne 0 ] && [ "$TS_EPOCH" -ne 0 ]; then
  DELTA=$((TS_EPOCH - NOW_EPOCH))
  [ "$DELTA" -ge -2 ] && [ "$DELTA" -le 2 ] \
    && ok "AC-57: persisted timestamp within 2s of UTC now" \
    || fail "AC-57: timestamp drift" "delta=${DELTA}s"
fi

print_summary "$NAME"
