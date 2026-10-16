#!/bin/bash
# tests/test-decision-log-record-write-failure.sh
# Regression: record.sh printed "[decision-log] recorded ..." and exited 0 when the
# sqlite write failed ("attempt to write a readonly database (8)"). A failed write must
# print an error naming the failure to stderr, exit non-zero, and never print "recorded".
# Also asserts the happy path still records and exits 0.

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

RECORD="$PROJECT_ROOT/.claude/skills/decision-log/record.sh"
SCHEMA="$PROJECT_ROOT/.claude/skills/decision-log/schema.sql"

T=$(mktemp -d "${TMPDIR:-/tmp}/dl-writefail-XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1

cleanup() {
  chmod -R u+w "$T" 2>/dev/null || true
  cfn_safe_rm_tmp "$T"
}
trap cleanup EXIT

PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

run_record() { # $1=db path; sets RC, OUT, ERR
  local db="$1"
  RC=0
  DB_PATH="$db" "$RECORD" --slug wf-test --id D1 --title "t" --chosen "c" \
    --project wfproj --timestamp "2026-10-16T00:00:00Z" >"$T/out.txt" 2>"$T/err.txt" || RC=$?
  OUT=$(cat "$T/out.txt"); ERR=$(cat "$T/err.txt")
}

test_happy_path_records() {
  mkdir "$T/ok"
  run_record "$T/ok/decisions.db"
  local cnt
  cnt=$(sqlite3 "$T/ok/decisions.db" "SELECT COUNT(*) FROM decisions WHERE project='wfproj' AND decision_id='D1';")
  if [ "$RC" = "0" ] && [ "$cnt" = "1" ] && echo "$OUT" | grep -q "recorded wfproj/wf-test/D1"; then
    ok "happy path records row, prints recorded, exits 0"
  else
    no "happy path (rc=$RC rows=$cnt out=$OUT err=$ERR)"
  fi
}

# Bug: readonly DB still printed "recorded" and exited 0.
test_readonly_db_fails_loudly() {
  mkdir "$T/ro"
  sqlite3 "$T/ro/decisions.db" < "$SCHEMA"
  chmod a-w "$T/ro/decisions.db" "$T/ro"
  if [ "$(id -u)" = "0" ]; then echo "SKIP: root ignores chmod"; return 0; fi
  run_record "$T/ro/decisions.db"
  chmod u+w "$T/ro" "$T/ro/decisions.db"

  [ "$RC" != "0" ] && ok "readonly db: exit non-zero (rc=$RC)" || no "readonly db: exited 0"
  echo "$OUT" | grep -q "\] recorded " \
    && no "readonly db: printed 'recorded' on stdout: $OUT" || ok "readonly db: no 'recorded' on stdout"
  echo "$ERR" | grep -q "\] recorded " \
    && no "readonly db: printed 'recorded' on stderr" || ok "readonly db: no 'recorded' on stderr"
  echo "$ERR" | grep -qi "readonly" \
    && ok "readonly db: stderr names the failure" || no "readonly db: stderr missing failure (err=$ERR)"
  local cnt
  cnt=$(sqlite3 "$T/ro/decisions.db" "SELECT COUNT(*) FROM decisions;")
  [ "$cnt" = "0" ] && ok "readonly db: no row written" || no "readonly db: unexpected rows ($cnt)"
}

test_happy_path_records
test_readonly_db_fails_loudly

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
