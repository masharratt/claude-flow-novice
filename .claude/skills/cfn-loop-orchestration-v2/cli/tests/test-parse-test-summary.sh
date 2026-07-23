#!/usr/bin/env bash
# Tests for lib/parse-test-summary.sh.
#
# S005 (origin: HANDOFF_verify_manifest_runnability.md /
# MANIFEST_HANDOFF_conversational_interview_engine.md): the parser had no cargo
# branch, so Rust output fell through to the pytest branch (cargo's
# "0 passed; 0 failed; ... finished in 0.01s" satisfies pytest's regex). Two
# consequences the handoffs hit in production:
#   - cargo says "ignored", the pytest branch looks for "skipped", so PTS_SKIP
#     was always 0 and S002's "a skipped guard is not a guard" rule never fired
#     for any Rust project.
#   - cargo-nextest has no "in <N>s" tail at all, so it matched nothing and
#     verify-run.sh fell back to exit-code-only semantics -- the exact
#     pre-S002 hole, where a filter that matched 0 tests exits 0 and reads green.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/parse-test-summary.sh
source "$DIR/../lib/parse-test-summary.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

RUN=0; PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }
eq() { # want got label
  if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (got '$2' wanted '$1')"; fi
}

fixture() { local f="$WORK/fx.$$.txt"; cat > "$f"; echo "$f"; }

# ---------------- cargo (libtest) ----------------

F=$(fixture <<'EOF'
running 657 tests
test services::answer_attach::tests::sm2_optional_backfill ... ok
test result: ok. 645 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 3.20s
EOF
)
parse_test_summary "$F"; rc=$?
eq 0 "$rc" "cargo: recognized"
eq "cargo" "$PTS_RUNNER" "cargo: runner is cargo, not pytest"
eq 645 "$PTS_PASS" "cargo: passed"
eq 0 "$PTS_FAIL" "cargo: failed"
eq 12 "$PTS_SKIP" "cargo: 'ignored' maps to PTS_SKIP"
eq 657 "$PTS_COLLECTED" "cargo: collected includes ignored (S003 denominator)"
eq 0 "$PTS_FILTERED" "cargo: filtered_out"

# The fireside AC-SM1 shape: --ignored on a plain #[test]. Cargo runs 0 tests
# and exits 0. This MUST report collected=0 so verify-run.sh forces red.
F=$(fixture <<'EOF'
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 645 filtered out; finished in 0.01s
EOF
)
parse_test_summary "$F"
eq "cargo" "$PTS_RUNNER" "cargo zero-ran: runner is cargo"
eq 0 "$PTS_COLLECTED" "cargo zero-ran: collected 0 (--ignored vs #[test] mismatch)"
eq 645 "$PTS_FILTERED" "cargo zero-ran: filtered_out surfaces the mismatch"

# `cargo test` emits one `test result:` line PER BINARY (lib, each integration
# target, doctests). tail -1 would read only the doctest line (usually 0/0/0)
# and report collected=0 on a fully green run -- a false red. Sum every line.
F=$(fixture <<'EOF'
     Running unittests src/lib.rs
test result: ok. 200 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out; finished in 1.10s
     Running tests/interview_engine_assembled_tests.rs
test result: ok. 40 passed; 1 failed; 2 ignored; 0 measured; 5 filtered out; finished in 0.90s
   Doc-tests myclate
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
EOF
)
parse_test_summary "$F"
eq 240 "$PTS_PASS" "cargo multi-binary: passed summed across binaries"
eq 1 "$PTS_FAIL" "cargo multi-binary: failed summed"
eq 5 "$PTS_SKIP" "cargo multi-binary: ignored summed"
eq 246 "$PTS_COLLECTED" "cargo multi-binary: collected summed"
eq 5 "$PTS_FILTERED" "cargo multi-binary: filtered summed"

# ---------------- cargo-nextest ----------------

F=$(fixture <<'EOF'
    Starting 645 tests across 8 binaries (12 skipped)
        PASS [   0.011s] mycrate services::answer_attach::tests::sm2_optional_backfill
------------
     Summary [   3.207s] 645 tests run: 645 passed, 12 skipped
EOF
)
parse_test_summary "$F"; rc=$?
eq 0 "$rc" "nextest: recognized"
eq "nextest" "$PTS_RUNNER" "nextest: runner"
eq 645 "$PTS_PASS" "nextest: passed"
eq 0 "$PTS_FAIL" "nextest: failed"
eq 12 "$PTS_SKIP" "nextest: skipped"
eq 657 "$PTS_COLLECTED" "nextest: collected includes skipped"

F=$(fixture <<'EOF'
     Summary [   0.010s] 3 tests run: 2 passed, 1 failed, 4 skipped
EOF
)
parse_test_summary "$F"
eq 2 "$PTS_PASS" "nextest failing: passed"
eq 1 "$PTS_FAIL" "nextest failing: failed"
eq 4 "$PTS_SKIP" "nextest failing: skipped"
eq 7 "$PTS_COLLECTED" "nextest failing: collected"

# A nextest run where the filter matched nothing.
F=$(fixture <<'EOF'
     Summary [   0.001s] 0 tests run: 0 passed, 0 skipped
EOF
)
parse_test_summary "$F"
eq 0 "$PTS_COLLECTED" "nextest zero-ran: collected 0"

# ---------------- go ----------------

F=$(fixture <<'EOF'
=== RUN   TestAlpha
--- PASS: TestAlpha (0.00s)
=== RUN   TestBeta
    --- PASS: TestBeta/subcase (0.00s)
--- PASS: TestBeta (0.00s)
=== RUN   TestGamma
--- FAIL: TestGamma (0.01s)
=== RUN   TestDelta
--- SKIP: TestDelta (0.00s)
FAIL
exit status 1
EOF
)
parse_test_summary "$F"; rc=$?
eq 0 "$rc" "go: recognized"
eq "go" "$PTS_RUNNER" "go: runner"
eq 2 "$PTS_PASS" "go: top-level passes only (indented subtests not double-counted)"
eq 1 "$PTS_FAIL" "go: failed"
eq 1 "$PTS_SKIP" "go: skipped"
eq 4 "$PTS_COLLECTED" "go: collected"

# go WITHOUT -v prints no per-test lines. Must stay unknown so callers keep
# exit-code semantics rather than reading a bogus 0.
F=$(fixture <<'EOF'
ok  	example.com/pkg/foo	0.012s
?   	example.com/pkg/bar	[no test files]
EOF
)
parse_test_summary "$F"; rc=$?
eq 1 "$rc" "go non-verbose: unrecognized (no false zero)"
eq "unknown" "$PTS_RUNNER" "go non-verbose: runner unknown"

# ---------------- regression: existing runners still parse ----------------

F=$(fixture <<'EOF'
===== 10 passed, 2 failed, 1 error, 3 skipped in 1.23s =====
EOF
)
parse_test_summary "$F"
eq "pytest" "$PTS_RUNNER" "pytest: still wins its own format (cargo branch did not steal it)"
eq 10 "$PTS_PASS" "pytest: passed"
eq 16 "$PTS_COLLECTED" "pytest: collected"

F=$(fixture <<'EOF'
 Tests  2 failed | 10 passed (12)
EOF
)
parse_test_summary "$F"
eq "vitest" "$PTS_RUNNER" "vitest: still parses"
eq 12 "$PTS_COLLECTED" "vitest: collected"

F=$(fixture <<'EOF'
Tests:       2 failed, 10 passed, 12 total
EOF
)
parse_test_summary "$F"
eq "jest" "$PTS_RUNNER" "jest: still parses"
eq 12 "$PTS_COLLECTED" "jest: collected"

F=$(fixture <<'EOF'
# tests 217
# pass 213
# fail 2
# skipped 2
# todo 0
EOF
)
parse_test_summary "$F"
eq "node" "$PTS_RUNNER" "node:test: still parses"
eq 217 "$PTS_COLLECTED" "node:test: collected"

F=$(fixture <<'EOF'
some custom runner output nobody recognizes
EOF
)
parse_test_summary "$F"; rc=$?
eq 1 "$rc" "unknown: still returns 1"

echo "----"
echo "parse-test-summary: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
