#!/usr/bin/env bash
# Tests for cfn-migration-rehearsal execute.sh
# Guard rails ONLY (no live DB). Verifies the safety contract refuses to run
# without a scratch URL, refuses prod look-alikes, refuses unscoped DELETE, and
# refuses missing migration files. These guards run before any DB connection.
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/execute.sh"
PASS=0
FAIL=0

check_refuse() { # desc, expected-substring, command-env...
  local desc="$1"; local want="$2"; shift 2
  local out rc
  out=$("$@" 2>&1); rc=$?
  if [[ "$rc" -ne 0 ]] && echo "$out" | grep -qiF "$want"; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc (rc=$rc)"; echo "  want substring: $want"; echo "  got: $out"; FAIL=$((FAIL+1))
  fi
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
git init -q
git config user.email t@t.test; git config user.name t

printf 'create table public.t (id int);\n' > up.sql
printf 'drop table public.t;\n' > down.sql
printf 'delete from users;\n' > bad_up.sql

# Case 1: no CFN_SCRATCH_DATABASE_URL -> refuse
check_refuse "refuses without scratch URL" "CFN_SCRATCH_DATABASE_URL is not set" \
  env -u CFN_SCRATCH_DATABASE_URL bash "$SCRIPT" --up up.sql --down down.sql

# Case 2: scratch URL equals DATABASE_URL in .env -> refuse
printf 'DATABASE_URL=postgres://u:p@prod-host/db\n' > .env
check_refuse "refuses when scratch == .env DATABASE_URL" "equals DATABASE_URL" \
  env CFN_SCRATCH_DATABASE_URL="postgres://u:p@prod-host/db" bash "$SCRIPT" --up up.sql --down down.sql
rm -f .env

# Case 3: pooler URL -> refuse
check_refuse "refuses Supabase pooler endpoint" "pooler" \
  env CFN_SCRATCH_DATABASE_URL="postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres" bash "$SCRIPT" --up up.sql --down down.sql

# Case 4: missing migration file -> refuse (use a safe-looking scratch URL)
SAFE="postgres://u:p@localhost:5433/scratch_test"
check_refuse "refuses missing up file" "up migration file not found" \
  env CFN_SCRATCH_DATABASE_URL="$SAFE" bash "$SCRIPT" --up nope.sql --down down.sql

# Case 5: unscoped DELETE in migration -> refuse
check_refuse "refuses unscoped DELETE in migration" "destructive" \
  env CFN_SCRATCH_DATABASE_URL="$SAFE" bash "$SCRIPT" --up bad_up.sql --down down.sql

# Case 6: safe URL + valid files -> guards pass; either runs DB or stops at
# missing psql / unreachable DB, but must NOT be a safety refusal (exit 2).
OUT=$(env CFN_SCRATCH_DATABASE_URL="$SAFE" bash "$SCRIPT" --up up.sql --down down.sql 2>&1); RC=$?
if [[ "$RC" -ne 2 ]]; then
  echo "PASS: safe URL + valid files clears safety guards (rc=$RC, not a refusal)"; PASS=$((PASS+1))
else
  echo "FAIL: safe URL was wrongly refused as unsafe"; echo "  got: $OUT"; FAIL=$((FAIL+1))
fi

echo "---"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
