#!/usr/bin/env bash
# Regression + unit test for structured decision records (decision-log option 2).
# Covers: schema decisions table, record.sh write/upsert, supersede, decisions.sh read/search.
# Uses an isolated temp DB via DB_PATH override. Never touches the real decisions.db.
set -uo pipefail

SKILL_DIR="$HOME/.claude/skills/decision-log"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/dl-test-XXXXXX")
export DB_PATH="$TMP/decisions.db"
PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
cleanup(){ rm -rf "$TMP"; }
trap cleanup EXIT

# init schema into temp db
sqlite3 "$DB_PATH" < "$SKILL_DIR/schema.sql"

# table exists
sqlite3 "$DB_PATH" ".schema decisions" | grep -q "CREATE TABLE" \
  && ok "decisions table created by schema" || no "decisions table missing"

# record a decision
"$SKILL_DIR/record.sh" --slug booking-form --id D1 \
  --title "Course field control" \
  --chosen "FK-backed select" \
  --rationale "course bound to public.courses, must be dropdown not text" \
  --alternatives "free-text input (rejected: allows invalid course)" \
  --blocking --project testproj --session sess-1 --timestamp "2026-06-28T00:00:00Z" >/dev/null
CNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM decisions WHERE project='testproj' AND slug='booking-form' AND decision_id='D1';")
[ "$CNT" = "1" ] && ok "record.sh inserted 1 row" || no "record.sh insert (got $CNT)"

# blocking flag stored
B=$(sqlite3 "$DB_PATH" "SELECT blocking FROM decisions WHERE decision_id='D1' AND project='testproj';")
[ "$B" = "1" ] && ok "blocking flag persisted" || no "blocking flag (got $B)"

# upsert: same (project,slug,id) updates, no dup
"$SKILL_DIR/record.sh" --slug booking-form --id D1 \
  --title "Course field control" --chosen "FK-backed combobox" \
  --project testproj --session sess-1 --timestamp "2026-06-28T01:00:00Z" >/dev/null
CNT2=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM decisions WHERE decision_id='D1' AND project='testproj';")
CHOSEN=$(sqlite3 "$DB_PATH" "SELECT chosen FROM decisions WHERE decision_id='D1' AND project='testproj';")
{ [ "$CNT2" = "1" ] && [ "$CHOSEN" = "FK-backed combobox" ]; } \
  && ok "upsert updates in place (no dup)" || no "upsert (cnt=$CNT2 chosen=$CHOSEN)"

# FTS search finds it
"$SKILL_DIR/decisions.sh" search "dropdown course" --project testproj | grep -qi "booking-form" \
  && ok "decisions.sh search hits via FTS" || no "decisions.sh search miss"

# supersede: D2 supersedes D1
"$SKILL_DIR/record.sh" --slug booking-form --id D2 \
  --title "Course field control v2" --chosen "searchable combobox >20 rows" \
  --supersede D1 --project testproj --session sess-2 --timestamp "2026-06-28T02:00:00Z" >/dev/null
ST=$(sqlite3 "$DB_PATH" "SELECT status FROM decisions WHERE decision_id='D1' AND project='testproj';")
SB=$(sqlite3 "$DB_PATH" "SELECT superseded_by FROM decisions WHERE decision_id='D1' AND project='testproj';")
{ [ "$ST" = "superseded" ] && [ "$SB" = "D2" ]; } \
  && ok "supersede marks D1 superseded_by D2" || no "supersede (status=$ST by=$SB)"

# project isolation: query for other project returns nothing
"$SKILL_DIR/decisions.sh" list --project otherproj | grep -qi "booking-form" \
  && no "project isolation leaked" || ok "project isolation holds"

# show renders the plan's decisions
"$SKILL_DIR/decisions.sh" show booking-form --project testproj | grep -qi "combobox" \
  && ok "decisions.sh show renders records" || no "decisions.sh show miss"

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
