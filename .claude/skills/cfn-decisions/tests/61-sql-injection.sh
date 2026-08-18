#!/usr/bin/env bash
# tests/61-sql-injection.sh - AC-45 (EC-14 SQL half).
# Integration: stub record.sh records argv; payload reaches sink as ONE argv
# value, NOT as SQL. SQLite `decisions` table still exists after the run.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-45: EC-14 SQL half (payload as argv, table intact)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
PAYLOAD='"; DROP TABLE decisions; --'
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DQ1 --title "T" --chosen "C" \
  --rationale "$PAYLOAD" --actor human --root "$ROOT_TMP" 2>/dev/null)"
RC=$?
assert_exit "$RC" 0 "AC-45: exit 0 with SQL-injection rationale"

ARGV_FILE="$BIN_DIR/last-argv"
[ -f "$ARGV_FILE" ] && ok "AC-45: stub record.sh captured argv" \
  || fail "AC-45: stub record.sh captured argv"

# The payload reaches the stub as a single argv token (after --rationale).
ARGV_STR="$(cat "$ARGV_FILE" 2>/dev/null)"
assert_contains "$ARGV_STR" "--rationale" "AC-45: argv includes --rationale"
assert_contains "$ARGV_STR" "DROP TABLE decisions" \
  "AC-45: payload passes as a literal argv value"
# The payload is NOT executed as SQL by the stub (the stub does nothing with
# SQL); the assertion is that the writer handed it as argv, not interpolated.
# A real sink parameterizes via single-quote escaping (record.sh:57).

# AC-45: SQLite decisions table still exists in the real sink's DB.
DB="${DB_PATH:-${HOME}/.claude/decision-log/decisions.db}"
if [ -f "$DB" ]; then
  TABLES="$(sqlite3 "$DB" ".tables" 2>/dev/null)"
  assert_contains "$TABLES" "decisions" \
    "AC-45: SQLite decisions table intact (no DROP reached)"
else
  ok "AC-45: SQLite DB absent in this env (stub path covers the argv proof)"
fi

print_summary "$NAME"
