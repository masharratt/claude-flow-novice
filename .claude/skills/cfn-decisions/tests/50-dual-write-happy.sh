#!/usr/bin/env bash
# tests/50-dual-write-happy.sh - AC-5 (FR-5 happy: JSON AND SQLite row, shared fields).
# Integration: real FS + real record.sh on PATH (writes to real SQLite db;
# marker-scoped teardown removes test rows).
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-5: FR-5 dual-write happy (JSON + SQLite; actor/iteration NOT forwarded)"
ROOT_TMP="$(make_test_root)"
SINK_DIR="$(with_real_sink)"
trap 'rm -rf "$ROOT_TMP"; scrub_decisions_db' EXIT
[ -n "$SINK_DIR" ] && PATH="$SINK_DIR:$PATH"; export PATH
scrub_decisions_db

SLUG="$(make_test_slug)"
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D01 --title "T" --chosen "C" \
  --rationale "r" --alternatives "a" --status proposed --blocking false \
  --actor human --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
assert_exit "$RC" 0 "AC-5: exit 0"

TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
[ -f "$TARGET" ] && ok "AC-5: JSON file written" || fail "AC-5: JSON file written"

# record.sh was invoked with shared fields (--slug --id --title --chosen
# --rationale --alternatives --status --timestamp).
# We assert via the real record.sh side-effect: a SQLite row exists.
DB="${DB_PATH:-${HOME}/.claude/decision-log/decisions.db}"
PROJ="$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo "$REPO_ROOT")")"
ROW="$(sqlite3 "$DB" \
  "SELECT title FROM decisions WHERE project='$PROJ' AND slug='$SLUG' AND decision_id='test-D01';" \
  2>/dev/null)"
assert_eq "$ROW" "T" "AC-5: SQLite row exists with matching title"

# Fields shared between JSON and SQLite match.
STATUS_ROW="$(sqlite3 "$DB" \
  "SELECT status FROM decisions WHERE project='$PROJ' AND slug='$SLUG' AND decision_id='test-D01';" \
  2>/dev/null)"
assert_eq "$STATUS_ROW" "proposed" \
  "AC-5: SQLite status=proposed (writer's --status forwarded, NOT sink default 'accepted')"

# AC-5 sub-assertion: --blocking false means bare --blocking NOT forwarded.
# (The sink records blocking=0 when the flag is absent.)
BLOCK_ROW="$(sqlite3 "$DB" \
  "SELECT blocking FROM decisions WHERE project='$PROJ' AND slug='$SLUG' AND decision_id='test-D01';" \
  2>/dev/null)"
assert_eq "$BLOCK_ROW" "0" "AC-5: SQLite blocking=0 (writer's blocking=false)"

# AC-5: --blocking true forwards bare --blocking; SQLite blocking=1.
SLUG2="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG2" --id test-D02 --title "T" --chosen "C" \
  --rationale "r" --alternatives "a" --status accepted --blocking true \
  --actor human --root "$ROOT_TMP" >/dev/null 2>&1
BLOCK_ROW2="$(sqlite3 "$DB" \
  "SELECT blocking FROM decisions WHERE project='$PROJ' AND slug='$SLUG2' AND decision_id='test-D02';" \
  2>/dev/null)"
assert_eq "$BLOCK_ROW2" "1" "AC-5: SQLite blocking=1 when writer blocking=true"

# Now exercise the --blocking true forwarding via a stub sink that records argv.
BIN_DIR="$(make_stub_sink 0)"
PATH="$BIN_DIR:$PATH"
SLUG3="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG3" --id test-D03 --title "T" --chosen "C" \
  --rationale "r" --alternatives "a" --status accepted --blocking true \
  --actor ai --iteration 7 --root "$ROOT_TMP" >/dev/null 2>&1

ARGV_FILE="$BIN_DIR/last-argv"
[ -f "$ARGV_FILE" ] && ok "AC-5: stub record.sh captured argv" \
  || fail "AC-5: stub record.sh captured argv"

# Verify the stub was called with shared fields (one long string).
ARGV_STR="$(cat "$ARGV_FILE" 2>/dev/null)"
assert_contains "$ARGV_STR" "--slug $SLUG3" "AC-5: argv has --slug"
assert_contains "$ARGV_STR" "--id test-D03" "AC-5: argv has --id"
assert_contains "$ARGV_STR" "--title T" "AC-5: argv has --title"
assert_contains "$ARGV_STR" "--chosen C" "AC-5: argv has --chosen"
assert_contains "$ARGV_STR" "--rationale r" "AC-5: argv has --rationale"
assert_contains "$ARGV_STR" "--alternatives a" "AC-5: argv has --alternatives"
assert_contains "$ARGV_STR" "--status accepted" "AC-5: argv has --status (always forwarded)"
assert_contains "$ARGV_STR" "--blocking" "AC-5: argv has bare --blocking (true path)"
# actor and iteration are JSON-only; NEVER forwarded to the sink.
assert_not_contains "$ARGV_STR" "--actor" "AC-5: argv does NOT include --actor"
assert_not_contains "$ARGV_STR" "--iteration" "AC-5: argv does NOT include --iteration"

print_summary "$NAME"
