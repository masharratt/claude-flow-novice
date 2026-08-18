#!/usr/bin/env bash
# tests/obs-6-parity.sh - AC-40 (OBS-6 dual-store parity).
# After successful dual-write: JSON entry count == SQLite entry count for
# the slug. JSON is authoritative (D-7: JSON first; SQLite best-effort).
# Uses real sink when available; otherwise stub + skip parity assertion.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-40: OBS-6 dual-store parity (JSON == SQLite)"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ROOT_TMP="$(make_test_root)"

SINK_DIR="$(with_real_sink)"
if [ -z "$SINK_DIR" ]; then
  echo "NOTE: real decision-log/record.sh not on disk; AC-40 parity"
  echo "assertion requires the LOCKED sink. Skipping parity portion."
  echo "Stub-only smoke (writer exit 0 + JSON write) verified elsewhere."
  BIN_DIR="$(make_stub_sink 0)"
  trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
  PATH="$BIN_DIR:$PATH"
  SLUG="$(make_test_slug)"
  "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
    --slug "$SLUG" --id test-DP1 --title T --chosen C --actor human \
    --root "$ROOT_TMP" >/dev/null 2>&1
  RC=$?
  assert_exit "$RC" 0 "AC-40 [stub fallback]: writer exits 0"
  TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
  LEN="$(jq '.decisions|length' "$TARGET")"
  assert_eq "$LEN" "1" "AC-40 [stub fallback]: JSON entry exists"
  scrub_decisions_db
  print_summary "$NAME"
  exit 0
fi

trap 'rm -rf "$ROOT_TMP"; scrub_decisions_db' EXIT
PATH="$SINK_DIR:$PATH"
SLUG="$(make_test_slug)"
scrub_decisions_db

# Invoke writer N times for distinct ids; capture JSON + SQLite counts.
N=5
i=1
while [ $i -le $N ]; do
  id="$(printf 'test-DP%03d' "$i")"
  "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
    --slug "$SLUG" --id "$id" --title "T$i" --chosen "C$i" --actor human \
    --root "$ROOT_TMP" >/dev/null 2>&1
  i=$((i+1))
done

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
JSON_LEN="$(jq '.decisions|length' "$TARGET")"
assert_eq "$JSON_LEN" "$N" "AC-40: JSON has $N entries"

DB_PATH="$HOME/.claude/decision-log/decisions.db"
if [ ! -f "$DB_PATH" ]; then
  fail "AC-40: SQLite db at expected path" "missing=$DB_PATH"
  print_summary "$NAME"
  exit 1
fi

SQL_COUNT="$(sqlite3 "$DB_PATH" \
  "SELECT COUNT(*) FROM decisions WHERE slug = '$SLUG';" 2>/dev/null || echo -1)"
assert_eq "$SQL_COUNT" "$N" "AC-40: SQLite has $N entries for slug"

# Parity: counts equal.
if [ "$JSON_LEN" = "$SQL_COUNT" ]; then
  ok "AC-40: parity (JSON=$JSON_LEN == SQLite=$SQL_COUNT)"
else
  fail "AC-40: parity" "JSON=$JSON_LEN SQLite=$SQL_COUNT"
fi

print_summary "$NAME"
