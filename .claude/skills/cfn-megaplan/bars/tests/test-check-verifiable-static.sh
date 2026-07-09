#!/usr/bin/env bash
# Tests for check-verifiable-static.sh (W9 / G52).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/../check-verifiable-static.sh"
FIX="$DIR/fixtures"

RUN=0; PASS=0; FAIL=0
ok()  { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no()  { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }

# run <fixture> -> sets OUT (stdout) and CODE (exit)
run() { OUT=$("$SCRIPT" "$FIX/$1" 2>/dev/null); CODE=$?; }

assert_exit()     { if [ "$CODE" -eq "$1" ]; then ok "$2"; else no "$2 (exit $CODE, wanted $1)"; fi; }
assert_has()      { if echo "$OUT" | grep -q "$1"; then ok "$2"; else no "$2 (missing '$1' in: $OUT)"; fi; }
assert_missing()  { if echo "$OUT" | grep -q "$1"; then no "$2 (unexpected '$1')"; else ok "$2"; fi; }

# clean -> exit 0, empty array
run clean.md
assert_exit 0 "clean: exit 0"
if [ "$OUT" = "[]" ]; then ok "clean: empty findings"; else no "clean: expected [] got $OUT"; fi

# missing-check -> exit 1, AC-2 missing check field
run missing-check.md
assert_exit 1 "missing-check: exit 1"
assert_has '"ac_id":"AC-2"' "missing-check: flags AC-2"
assert_has 'missing required field' "missing-check: names missing field"

# weasel -> exit 1, gracefully + shallow renders
run weasel.md
assert_exit 1 "weasel: exit 1"
assert_has 'weasel phrase' "weasel: flags gracefully"
assert_has 'shallow pass condition' "weasel: flags shallow 'renders'"

# coverage-mismatch -> exit 1, fr + cc mismatch
run coverage-mismatch.md
assert_exit 1 "coverage-mismatch: exit 1"
assert_has 'fr_mapped' "coverage-mismatch: flags fr"
assert_has 'cc_mapped' "coverage-mismatch: flags cc"

# core-gap -> exit 1, core FR no assembled path
run core-gap.md
assert_exit 1 "core-gap: exit 1"
assert_has 'core_fr_assembled_path_ok' "core-gap: flags core FR gap"

# no-json -> exit 1, no manifest block
run no-json.md
assert_exit 1 "no-json: exit 1"
assert_has 'no fenced json manifest block' "no-json: names missing manifest"

# warn-only -> exit 0 (warnings do not fail), but non-empty
run warn-only.md
assert_exit 0 "warn-only: exit 0 (warn does not fail)"
assert_has 'runtime_signal_missing' "warn-only: reports runtime warn"
assert_missing '"severity":"error"' "warn-only: no error severity"

# usage errors -> exit 2
"$SCRIPT" >/dev/null 2>&1; [ $? -eq 2 ] && ok "no-arg: exit 2" || no "no-arg: exit 2"
"$SCRIPT" /nonexistent/x.md >/dev/null 2>&1; [ $? -eq 2 ] && ok "missing-file: exit 2" || no "missing-file: exit 2"

echo "----"
echo "W9 static checker: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
