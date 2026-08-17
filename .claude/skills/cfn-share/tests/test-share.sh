#!/usr/bin/env bash
# test-share.sh - functional + edge-case tests for cfn-share resolve/record.
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOLVE="$SKILL_DIR/resolve.sh"
RECORD="$SKILL_DIR/record-url.sh"

PASS=0; FAIL=0
ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
check(){ [[ "$2" == "$3" ]] && ok "$1" || bad "$1 (got '$2', want '$3')"; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/cfn-share-test-XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM
cd "$TMP"

jget() { python3 -c "import json,sys;print(json.load(sys.stdin)[sys.argv[1]])" "$1"; }

echo "== resolve: happy path =="
mkdir -p planning
printf '# Auth Rewrite Plan\n\nbody\nmore\n' > planning/PLAN_auth.md
OUT=$("$RESOLVE" planning/PLAN_auth.md); RC=$?
check "exit 0 on valid md" "$RC" "0"
check "title from h1"      "$(echo "$OUT" | jget title)" "Auth Rewrite Plan"
check "slug lowercased"    "$(echo "$OUT" | jget slug)"  "plan_auth"
check "url empty first"    "$(echo "$OUT" | jget url)"   ""
check "stale false first"  "$(echo "$OUT" | jget stale)" "False"
check "sidecar path"       "$(echo "$OUT" | jget sidecar)" "$TMP/planning/.share-PLAN_auth.url"

echo "== resolve: title fallback when no h1 =="
printf 'no heading here\n' > planning/PLAN_no_head.md
check "basename humanised" "$("$RESOLVE" planning/PLAN_no_head.md | jget title)" "PLAN no head"

echo "== resolve: no-arg picks newest plan =="
sleep 1; printf '# Newer\n' > planning/PLAN_zzz.md
check "newest wins" "$("$RESOLVE" | jget file)" "planning/PLAN_zzz.md"

echo "== resolve: no-arg searches per-plan dirs, not just the flat root =="
mkdir -p planning/checkout_rewrite
sleep 1; printf '# Nested\n' > planning/checkout_rewrite/PLAN_checkout_rewrite.md
check "nested plan discovered" "$("$RESOLVE" | jget file)" \
  "planning/checkout_rewrite/PLAN_checkout_rewrite.md"
check "sidecar sits beside the nested doc" "$("$RESOLVE" | jget sidecar)" \
  "$TMP/planning/checkout_rewrite/.share-PLAN_checkout_rewrite.url"
sleep 1; printf '# Flat again\n' > planning/PLAN_zzz.md
check "flat plan still wins when newer" "$("$RESOLVE" | jget file)" "planning/PLAN_zzz.md"

echo "== resolve: rejections =="
"$RESOLVE" planning/missing.md >/dev/null 2>&1; check "exit 1 missing file" "$?" "1"
: > planning/PLAN_empty.md
"$RESOLVE" planning/PLAN_empty.md >/dev/null 2>&1; check "exit 1 empty file" "$?" "1"
printf 'x\n' > planning/notes.txt
"$RESOLVE" planning/notes.txt >/dev/null 2>&1; check "exit 1 non-md" "$?" "1"

echo "== resolve: no-arg with nothing to resolve =="
mkdir -p "$TMP/bare" && (cd "$TMP/bare"; "$RESOLVE" >/dev/null 2>&1); check "exit 1 no candidates" "$?" "1"

echo "== record + re-resolve round trip =="
SC=$("$RECORD" planning/PLAN_auth.md "https://example.test/artifact/abc")
check "sidecar written" "$SC" "$TMP/planning/.share-PLAN_auth.url"
OUT=$("$RESOLVE" planning/PLAN_auth.md)
check "url recalled"        "$(echo "$OUT" | jget url)"   "https://example.test/artifact/abc"
check "unchanged not stale" "$(echo "$OUT" | jget stale)" "False"

echo "== staleness detection =="
printf 'edited line\n' >> planning/PLAN_auth.md
OUT=$("$RESOLVE" planning/PLAN_auth.md)
check "edit marks stale" "$(echo "$OUT" | jget stale)" "True"
check "url survives edit" "$(echo "$OUT" | jget url)" "https://example.test/artifact/abc"
"$RECORD" planning/PLAN_auth.md "https://example.test/artifact/abc" >/dev/null
check "republish clears stale" "$("$RESOLVE" planning/PLAN_auth.md | jget stale)" "False"

echo "== record: rejections =="
"$RECORD" >/dev/null 2>&1;                                   check "exit 2 no args" "$?" "2"
"$RECORD" planning/PLAN_auth.md >/dev/null 2>&1;             check "exit 2 no url"  "$?" "2"
"$RECORD" planning/PLAN_auth.md "ftp://nope" >/dev/null 2>&1; check "exit 2 bad url" "$?" "2"
"$RECORD" planning/gone.md "https://x.test/a" >/dev/null 2>&1; check "exit 2 missing file" "$?" "2"

echo "== quoting: title with double quotes stays valid JSON =="
printf '# The "Big" Plan\n' > planning/PLAN_quoted.md
check "quoted title parses" "$("$RESOLVE" planning/PLAN_quoted.md | jget title)" 'The "Big" Plan'

echo
echo "passed=$PASS failed=$FAIL"
[[ $FAIL -eq 0 ]]
