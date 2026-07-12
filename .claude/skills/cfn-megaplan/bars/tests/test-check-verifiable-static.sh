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

# wiring-mismatch -> exit 1, wiring_mapped != wiring_total (S004)
run wiring-mismatch.md
assert_exit 1 "wiring-mismatch: exit 1"
assert_has '"field":"wiring_mapped"' "wiring-mismatch: flags wiring_mapped"
assert_has 'unmapped items' "wiring-mismatch: names the gap"

# wiring-absent -> exit 1, wiring counters are now MANDATORY, not presence-keyed (S004:
# omission must FAIL — an opt-in wiring gate is dodgeable by silently leaving the keys out,
# which is the exact failure class that shipped the MP-A wiring gap). This assertion used to
# be "absent = backward-compat pass"; that is now INVERTED.
run wiring-absent.md
assert_exit 1 "wiring-absent: exit 1 (wiring keys mandatory, omission is not backward compat)"
assert_has '"field":"wiring_total"' "wiring-absent: flags missing wiring_total"
assert_has '"field":"wiring_mapped"' "wiring-absent: flags missing wiring_mapped"
assert_has 'required coverage key missing' "wiring-absent: names the missing-key reason"

# wiring-zero-no-reason -> exit 1, wiring_total: 0 with no no_new_components_reason (S004)
run wiring-zero-no-reason.md
assert_exit 1 "wiring-zero-no-reason: exit 1"
assert_has "wiring_total is 0 with no 'no_new_components_reason' declared" "wiring-zero-no-reason: flags missing reason"

# wiring-zero-with-reason -> exit 0, empty findings (wiring_total: 0 WITH a stated reason, S004)
run wiring-zero-with-reason.md
assert_exit 0 "wiring-zero-with-reason: exit 0"
if [ "$OUT" = "[]" ]; then ok "wiring-zero-with-reason: empty findings"; else no "wiring-zero-with-reason: expected [] got $OUT"; fi

# wiring-clean -> exit 0, empty findings (wiring-guard kind + matched coverage, no flag token, S004)
run wiring-clean.md
assert_exit 0 "wiring-clean: exit 0"
if [ "$OUT" = "[]" ]; then ok "wiring-clean: empty findings"; else no "wiring-clean: expected [] got $OUT"; fi

# wiring-flag-tautology -> exit 0 (WARN only, not FAIL), non-empty warn finding (S004)
run wiring-flag-tautology.md
assert_exit 0 "wiring-flag-tautology: exit 0 (warn does not fail)"
assert_has 'flag_tautology_risk' "wiring-flag-tautology: flags flag_tautology_risk"
assert_has '"severity":"warn"' "wiring-flag-tautology: warn severity"
assert_missing '"severity":"error"' "wiring-flag-tautology: no error severity"

# usage errors -> exit 2
"$SCRIPT" >/dev/null 2>&1; [ $? -eq 2 ] && ok "no-arg: exit 2" || no "no-arg: exit 2"
"$SCRIPT" /nonexistent/x.md >/dev/null 2>&1; [ $? -eq 2 ] && ok "missing-file: exit 2" || no "missing-file: exit 2"

echo "----"
echo "W9 static checker: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
