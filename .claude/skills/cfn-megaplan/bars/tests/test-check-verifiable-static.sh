#!/usr/bin/env bash
# Tests for check-verifiable-static.sh (W9 / G52).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/../check-verifiable-static.sh"
FIX="$DIR/fixtures"

RUN=0; PASS=0; FAIL=0
ok()  { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no()  { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }

# run <fixture> [args...] -> sets OUT (stdout) and CODE (exit)
run() { local f="$1"; shift; OUT=$("$SCRIPT" "$FIX/$f" "$@" 2>/dev/null); CODE=$?; }

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

# ---- S007: run-before-bless evidence ----
# Both 2026-07-22 field handoffs traced their reds to the same gap: checks were
# authored from the plan and hashed on shape, and nothing forced them to be
# executed once before the hash was blessed. 21/147 and 71/104 runtime-red
# against CORRECT code. Requiring a pasted runtime result closes it at bless
# time instead of at loop-exit time.
run evidence-missing.md
assert_exit 1 "evidence-missing: exit 1"
assert_has 'evidence' "evidence-missing: names the evidence field"
assert_has '"severity":"error"' "evidence-missing: error severity"

# Evidence that itself proves the check ran nothing must not satisfy the bar --
# otherwise the gate just moves the rubber stamp one field to the left.
run evidence-zero-ran.md
assert_exit 1 "evidence-zero-ran: exit 1"
assert_has 'evidence_zero_ran' "evidence-zero-ran: flags 0-test evidence"

# A greenfield manifest is authored BEFORE the code exists, so its checks cannot
# have been run yet. `PENDING: <reason>` is the only legal placeholder, and it is
# legal ONLY at the plan-stage bless. Without this the evidence rule would be
# unsatisfiable for every new build and would get routed around.
run evidence-pending.md
assert_exit 0 "evidence-pending: exit 0 at plan stage (default)"
assert_has 'evidence_pending' "evidence-pending: still reports the pending marker"
assert_missing '"severity":"error"' "evidence-pending: warn, not error, at plan stage"

run evidence-pending.md --stage exit
assert_exit 1 "evidence-pending: exit 1 at --stage exit"
assert_has 'evidence_pending' "evidence-pending: names the pending marker at exit stage"
assert_has '"severity":"error"' "evidence-pending: error severity at exit stage"

# Real evidence must satisfy BOTH stages -- the exit stage adds a requirement, it
# does not change what counts as valid evidence.
run clean.md --stage exit
assert_exit 0 "clean: exit 0 at --stage exit (real evidence satisfies both stages)"

run clean.md --stage bogus
assert_exit 2 "unknown --stage value -> exit 2"

# ---- S007: controlled `kind` vocabulary ----
# Previously an unrecognized kind fell to a WARN, so `kind: cargo-test` with a
# grep body (fireside pattern 5) passed the taxonomy check by not matching any
# case at all -- the kind/command consistency lint could never bite.
run bad-kind.md
assert_exit 1 "bad-kind: exit 1"
assert_has 'unrecognized check kind' "bad-kind: rejects kind outside the vocabulary"
assert_has '"severity":"error"' "bad-kind: error severity, not warn"

# ---- S007: file::testname shorthand ----
# 89 of NSC's 104 checks used it. No runner accepts it; both vitest and
# playwright read it as a single filename and report "No test files found".
run selector-shorthand.md
assert_exit 1 "selector-shorthand: exit 1"
assert_has 'unrunnable_selector' "selector-shorthand: flags the :: shorthand"

# ---- S007: requires{} shape ----
run requires-bad.md
assert_exit 1 "requires-bad: exit 1"
assert_has 'requires.env' "requires-bad: flags malformed env entry"
assert_has 'requires.http' "requires-bad: flags non-URL http precondition"
assert_has 'requires.db' "requires-bad: flags non-boolean db precondition"

# ---- CQR gap #1: literal_stub_correlation (rule f) ----
# A [core] FR whose input is externally produced (LLM output, free-text, webhook
# payload) can be satisfied by a handler that returns a constant literal --
# wired correctly, semantically empty. Decidability (rule c) cannot tell a real
# computation from a constant. Rule (f) requires a mapped AC to seed a concrete
# token (seeds: "seed:<TOKEN>") into the upstream input AND reference TOKEN in
# its pass condition, so a constant-valued stub cannot satisfy it.
# Origin: /home/masha/projects/fireside-family/planning/handoff_cqr_megaplan_gaps.md gap #1.
run literal-stub-missing.md
assert_exit 1 "literal-stub-missing: exit 1"
assert_has 'literal_stub_correlation' "literal-stub-missing: flags literal_stub_correlation"
assert_has '"severity":"error"' "literal-stub-missing: error severity"

run literal-stub-correlated.md
assert_exit 0 "literal-stub-correlated: exit 0"
if [ "$OUT" = "[]" ]; then ok "literal-stub-correlated: empty findings"; else no "literal-stub-correlated: expected [] got $OUT"; fi

# ---- CQR gap #2: [boundary] tag + integration AC ----
# A fetch with ordering/filter semantics crossed a persistence boundary; a
# builder-isolation unit test (in-memory Vec) passed the gate while the DB query
# inverted the order (ORDER BY ASC vs latest-first). A [boundary] FR owes a
# kind: integration AC that drives the REAL DB/HTTP path.
# Origin: handoff_cqr_megaplan_gaps.md gap #2.
run boundary-fr-no-integration.md
assert_exit 1 "boundary-fr-no-integration: exit 1"
assert_has 'boundary FR' "boundary-fr-no-integration: flags boundary gap"
assert_has '"severity":"error"' "boundary-fr-no-integration: error severity"

run boundary-fr-lied.md
assert_exit 1 "boundary-fr-lied: exit 1 (scan catches FR declared ok with no integration AC)"
assert_has 'kind: integration' "boundary-fr-lied: names the missing integration kind"

run boundary-fr-clean.md
assert_exit 0 "boundary-fr-clean: exit 0"
if [ "$OUT" = "[]" ]; then ok "boundary-fr-clean: empty findings"; else no "boundary-fr-clean: expected [] got $OUT"; fi

# usage errors -> exit 2
"$SCRIPT" >/dev/null 2>&1; [ $? -eq 2 ] && ok "no-arg: exit 2" || no "no-arg: exit 2"
"$SCRIPT" /nonexistent/x.md >/dev/null 2>&1; [ $? -eq 2 ] && ok "missing-file: exit 2" || no "missing-file: exit 2"

echo "----"
echo "W9 static checker: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
