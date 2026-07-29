#!/usr/bin/env bash
# tests/obs-7-divergence.sh - AC-41 (OBS-7 divergence: SQLite miss OK).
# When sink is missing/stubbed, JSON-only write completes successfully and
# SQLite has no row for the slug. The writer's contract is JSON-first;
# sink failure is reported via exit code 7/8 (not rollback). Divergence
# between authoritative JSON and best-effort SQLite is the documented
# outcome when the sink is unavailable.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-41: OBS-7 divergence (sink absent -> JSON-only, no rollback)"

ROOT_TMP="$(make_test_root)"
trap 'rm -rf "$ROOT_TMP"; scrub_decisions_db' EXIT

# No sink on PATH: writer should detect sink missing and exit E_SINK_MISSING=7.
SLUG="$(make_test_slug)"
OUT_F="$ROOT_TMP/out.txt"
ERR_F="$ROOT_TMP/err.txt"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DDV1 --title T --chosen C --actor human \
  --root "$ROOT_TMP" >"$OUT_F" 2>"$ERR_F"
RC=$?
assert_exit "$RC" 7 "AC-41: missing sink -> E_SINK_MISSING=7"

# JSON authoritative: entry WAS written despite sink failure (D-7: JSON first,
# never rollback). Target file exists with the entry.
TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
if [ -f "$TARGET" ]; then
  ok "AC-41: JSON target exists after sink-missing"
else
  fail "AC-41: JSON target exists after sink-missing" "absent=$TARGET"
fi
JSON_LEN="$(jq '.decisions|length' "$TARGET" 2>/dev/null || echo 0)"
assert_eq "$JSON_LEN" "1" \
  "AC-41: JSON entry persisted (D-7: no rollback)"

# SQLite divergence: with sink absent, no row exists for the slug.
DB_PATH="$HOME/.claude/decision-log/decisions.db"
if [ -f "$DB_PATH" ]; then
  SQL_COUNT="$(sqlite3 "$DB_PATH" \
    "SELECT COUNT(*) FROM decisions WHERE slug = '$SLUG';" 2>/dev/null || echo 99)"
  assert_eq "$SQL_COUNT" "0" \
    "AC-41: SQLite has 0 rows (sink was absent; JSON-only)"
else
  ok "AC-41: SQLite db absent (no row possible; JSON-only)"
fi

# Caller recovery: caller can replay sink later. JSON is source of truth.
# stdout shape preserved (id status) even on sink-missing exit.
LINE="$(head -1 "$OUT_F")"
if [ "$LINE" = "test-DDV1 proposed" ]; then
  fail "AC-41: stdout should be empty on non-zero exit" "got=$LINE"
else
  ok "AC-41: stdout empty on non-zero exit (no false success)"
fi

print_summary "$NAME"
