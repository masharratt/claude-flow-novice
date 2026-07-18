#!/usr/bin/env bash
# Tests for check-produce-consume.sh (produce/consume edge sanity, wave ordering).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$SCRIPT_DIR/../check-produce-consume.sh"
FIX="$SCRIPT_DIR/fixtures-pc"

PASS=0; FAIL=0
run() { # label fixture expected_exit expect_substr(optional)
  local label="$1" fix="$2" exp_exit="$3" substr="${4:-}"
  local out ec
  out="$("$CHECK" "$FIX/$fix" 2>/dev/null)"; ec=$?
  local ok=1
  [ "$ec" = "$exp_exit" ] || ok=0
  if [ -n "$substr" ]; then echo "$out" | grep -qF "$substr" || ok=0; fi
  if [ "$ok" = 1 ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$label"
  else FAIL=$((FAIL+1)); printf 'FAIL %s (exit=%s want=%s)\n     out=%s\n' "$label" "$ec" "$exp_exit" "$out"; fi
}

run "clean plan passes"              plan-pc-clean.md    0
run "clean plan emits empty array"   plan-pc-clean.md    0 "[]"
run "dangling consume warns exit0"   plan-pc-dangling.md 0 "dangling"
run "duplicate producer errors"      plan-pc-dup.md      1 "duplicate"
run "weasel in produce cell errors"  plan-pc-weasel.md   1 "weasel"
run "empty produce cell errors"      plan-pc-empty.md    1 "empty"
run "no columns = clean exit0"       plan-pc-nocols.md   0 "[]"

# usage / missing file
"$CHECK" >/dev/null 2>&1; [ $? = 2 ] && { PASS=$((PASS+1)); echo "ok   no-arg exits 2"; } || { FAIL=$((FAIL+1)); echo "FAIL no-arg exits 2"; }
"$CHECK" /nonexistent/nope.md >/dev/null 2>&1; [ $? = 2 ] && { PASS=$((PASS+1)); echo "ok   missing-file exits 2"; } || { FAIL=$((FAIL+1)); echo "FAIL missing-file exits 2"; }

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
