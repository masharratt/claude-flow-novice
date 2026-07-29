#!/usr/bin/env bash
# tests/81-volume-100.sh - AC-55 (EC-15 + NFR-3, 100-row volume + p95).
# Integration + perf.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-55/NFR-3: EC-15 100-row volume (ordered insertion, p95 < 500ms)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
TIMINGS_FILE="$ROOT_TMP/timings.txt"

# Loop 100 invocations; capture each wall time (ms).
i=1
while [ $i -le 100 ]; do
  id="$(printf 'test-D%03d' "$i")"
  START_EPOCH="$(date +%s%N)"
  "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
    --slug "$SLUG" --id "$id" --title "T$i" --chosen "C$i" --actor human \
    --root "$ROOT_TMP" >/dev/null 2>&1
  END_EPOCH="$(date +%s%N)"
  WALL_MS=$(( (END_EPOCH - START_EPOCH) / 1000000 ))
  echo "$WALL_MS" >> "$TIMINGS_FILE"
  i=$((i+1))
done

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
LEN="$(jq '.decisions|length' "$TARGET")"
assert_eq "$LEN" "100" "AC-55: 100 entries persisted"

# Ordering: ids in insertion order (test-D001..test-D100).
IDS="$(jq -r '.decisions[].id' "$TARGET" | paste -sd, -)"
EXPECTED="$(seq -f 'test-D%03g' 1 100 | paste -sd, -)"
assert_eq "$IDS" "$EXPECTED" "AC-55: ids in insertion order"

# p95 calculation: sort timings, take 95th percentile (index 95 of 100).
sort -n "$TIMINGS_FILE" -o "$TIMINGS_FILE"
P95_MS="$(awk 'NR==95{print; exit}' "$TIMINGS_FILE")"
if [ "$P95_MS" -lt 500 ]; then
  ok "AC-55/NFR-3: p95 ${P95_MS}ms < 500ms"
else
  fail "AC-55/NFR-3: p95 < 500ms" "p95=${P95_MS}ms"
fi

print_summary "$NAME"
