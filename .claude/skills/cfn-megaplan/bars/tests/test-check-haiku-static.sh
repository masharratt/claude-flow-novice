#!/usr/bin/env bash
# Tests for check-haiku-static.sh (Bar B static scan: weasel words + S005 optional-DI assist).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/../check-haiku-static.sh"
FIX="$DIR/fixtures-haiku"

RUN=0; PASS=0; FAIL=0
ok()  { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no()  { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }

# run <plan-fixture> [interfaces-fixture] -> sets OUT (stdout) and CODE (exit)
run() {
  if [ -n "${2:-}" ]; then
    OUT=$("$SCRIPT" "$FIX/$1" "$FIX/$2" 2>/dev/null); CODE=$?
  else
    OUT=$("$SCRIPT" "$FIX/$1" 2>/dev/null); CODE=$?
  fi
}

assert_exit()     { if [ "$CODE" -eq "$1" ]; then ok "$2"; else no "$2 (exit $CODE, wanted $1)"; fi; }
assert_has()      { if echo "$OUT" | grep -q "$1"; then ok "$2"; else no "$2 (missing '$1' in: $OUT)"; fi; }
assert_missing()  { if echo "$OUT" | grep -q "$1"; then no "$2 (unexpected '$1')"; else ok "$2"; fi; }

# clean, no interfaces file -> exit 0, empty array (existing weasel-only behavior preserved)
run plan-clean.md
assert_exit 0 "clean (no interfaces arg): exit 0"
if [ "$OUT" = "[]" ]; then ok "clean (no interfaces arg): empty findings"; else no "clean (no interfaces arg): expected [] got $OUT"; fi

# weasel word -> exit 1, severity error (S001-era behavior preserved)
run plan-weasel.md
assert_exit 1 "weasel: exit 1"
assert_has '"phrase":"appropriately"' "weasel: flags appropriately"
assert_has '"severity":"error"' "weasel: error severity"

# optional-DI on a NAMED core-fr interface file -> exit 0 (WARN only, never fails the gate alone, S005)
run plan-optional-di.md core-fr-interfaces.txt
assert_exit 0 "optional-di: exit 0 (warn does not fail)"
assert_has '"severity":"warn"' "optional-di: warn severity"
assert_has 'src/poll-loop.ts' "optional-di: names the file"
assert_missing '"severity":"error"' "optional-di: no error severity"

# optional-property token on a file NOT named in the interfaces list -> zero findings (proves scoped, not repo-wide, S005)
run plan-optional-di-out-of-scope.md core-fr-interfaces.txt
assert_exit 0 "optional-di-out-of-scope: exit 0"
if [ "$OUT" = "[]" ]; then ok "optional-di-out-of-scope: empty findings (scan is scoped)"; else no "optional-di-out-of-scope: expected [] got $OUT"; fi

# usage errors -> exit 2
"$SCRIPT" >/dev/null 2>&1; [ $? -eq 2 ] && ok "no-arg: exit 2" || no "no-arg: exit 2"
"$SCRIPT" /nonexistent/x.md >/dev/null 2>&1; [ $? -eq 2 ] && ok "missing-file: exit 2" || no "missing-file: exit 2"

echo "----"
echo "Bar B static checker: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
