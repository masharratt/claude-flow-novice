#!/usr/bin/env bash
# Tests for cfn-security-review execute.sh
# Guard rails: produces a valid manifest skeleton from an empty diff, and
# detects security surfaces (db schema / secrets) from a real diff.
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/execute.sh"
PASS=0
FAIL=0

check() { # desc, expected-substring, actual
  if echo "$3" | grep -qF "$2"; then
    echo "PASS: $1"; PASS=$((PASS+1))
  else
    echo "FAIL: $1"; echo "  want substring: $2"; echo "  got: $3"; FAIL=$((FAIL+1))
  fi
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
git init -q
git config user.email t@t.test; git config user.name t
git commit -q --allow-empty -m init

# Case 1: empty diff -> valid skeleton manifest, zero suggestions
OUT=$(bash "$SCRIPT")
check "empty diff: reports zero files"  "files:        0"                 "$OUT"
check "empty diff: nothing to review"   "Nothing to review."             "$OUT"
MANIFEST=$(ls -t .cfn-cache/manifests/cfn-security-review-*.json | head -1)
check "manifest exists"                 "cfn-security-review-"           "$MANIFEST"
# valid JSON + required fields
jq -e '.source=="cfn-security-review" and (.suggestions|type=="array") and (.suggestions|length==0)' "$MANIFEST" >/dev/null \
  && { echo "PASS: empty-diff manifest is valid JSON skeleton"; PASS=$((PASS+1)); } \
  || { echo "FAIL: empty-diff manifest is valid JSON skeleton"; FAIL=$((FAIL+1)); }

# Case 2: gitignore gets .cfn-cache
check "cfn-cache gitignored"            ".cfn-cache/"                    "$(cat .gitignore 2>/dev/null)"

# Case 3: a diff with a new DB table + secret -> surface hints detected
mkdir -p supabase/migrations
printf 'create table public.orders (id int);\n' > supabase/migrations/0007_orders.sql
printf 'const api_key = "sk-live-1234";\n' > leak.js
OUT=$(bash "$SCRIPT")
check "detects changed files"           "files:        2"               "$OUT"
check "surface hint db_schema"          "db_schema"                     "$OUT"
check "surface hint secret_or_auth"     "secret_or_auth"                "$OUT"
MANIFEST=$(ls -t .cfn-cache/manifests/cfn-security-review-*.json | head -1)
jq -e '(.surface_hints|index("db_schema")) and (.file_count==2)' "$MANIFEST" >/dev/null \
  && { echo "PASS: manifest records surface hints + file_count"; PASS=$((PASS+1)); } \
  || { echo "FAIL: manifest records surface hints + file_count"; FAIL=$((FAIL+1)); }

# Case 4: unscoped destructive sql detected
printf 'DELETE FROM users;\n' > danger.sql
OUT=$(bash "$SCRIPT")
check "detects destructive sql"         "destructive_sql"               "$OUT"

echo "---"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
