#!/usr/bin/env bash
# tests/test-pre-push-hook.sh
# Unit tests for the local pre-push gate runner (.claude/hooks/cfn-pre-push-gates.sh,
# entry .husky/pre-push). All cases run against FAKE gates via CFN_PRE_PUSH_GATES
# so this suite never executes the real shell gates, typecheck, or unit tests --
# those already run in ci.yml and adding a second full pass here would double CI
# time for zero new coverage.
#
# Regression origin: 2026-09-23, pre-push mirror of the CI Linux-side gates was
# added so pushes fail in ~90s locally instead of after a full CI round-trip.

set -uo pipefail

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
# shellcheck source=test-utils.sh
source "$PROJECT_ROOT/tests/test-utils.sh"

RUNNER="$PROJECT_ROOT/.claude/hooks/cfn-pre-push-gates.sh"
HOOK="$PROJECT_ROOT/.husky/pre-push"

log_step "pre-push gate runner"

# ---- Case 1: files exist and are executable -------------------------------
assert_file_exists "$RUNNER" "runner script exists"
assert_file_exists "$HOOK" "husky pre-push entry exists"
[ -x "$RUNNER" ] && log_pass "runner is executable" || { chmod +x "$RUNNER"; log_fail "runner was not executable (fixed on disk; commit needs --chmod=+x)"; }
[ -x "$HOOK" ] && log_pass "husky entry is executable" || { chmod +x "$HOOK"; log_fail "husky entry was not executable (fixed on disk; commit needs --chmod=+x)"; }

assert_success "runner parses (bash -n): $RUNNER" bash -n "$RUNNER"
assert_success "husky entry parses (sh -n): $HOOK" sh -n "$HOOK"

# ---- Case 2: skip flag short-circuits without running any gate ------------
rc=0
out=$(CFN_PRE_PUSH_SKIP=1 bash "$RUNNER" 2>&1) || rc=$?
assert_equals "0" "$rc" "CFN_PRE_PUSH_SKIP=1 exits 0"
assert_contains "$out" "skip" "skip flag says it skipped"

# ---- Case 3: fake passing gates --------------------------------------------
rc=0
out=$(CFN_PRE_PUSH_GATES="ok-true::true" bash "$RUNNER" 2>&1) || rc=$?
assert_equals "0" "$rc" "single passing fake gate exits 0"
assert_contains "$out" "ok-true" "output names the gate that ran"
assert_contains "$out" "1/1" "summary reports 1 of 1 passed"

# ---- Case 4: a failing gate blocks the push and is named -------------------
# The command deliberately contains a space: a space-separated override
# parser shreds "exit 7" into two gates and the failure count drifts.
rc=0
out=$(CFN_PRE_PUSH_GATES="boom::exit 7" bash "$RUNNER" 2>&1) || rc=$?
assert_equals "1" "$rc" "failing fake gate (space in command) exits 1"
assert_contains "$out" "boom" "failure names the failed gate"
assert_contains "$out" "0/1" "one gate registered, zero passed"

# ---- Case 5: later gates still run after an early failure ------------------
# A fail-fast runner hides gates broken by the same change; CI parity means
# every gate executes and the summary lists all failures at once.
rc=0
out=$(CFN_PRE_PUSH_GATES="first-ok::true
second-boom::exit 3
third-ok::true
third-boom::exit 4" bash "$RUNNER" 2>&1) || rc=$?
assert_equals "1" "$rc" "mixed gates exit 1"
assert_contains "$out" "second-boom" "first failure named"
assert_contains "$out" "third-boom" "second failure named (did not stop at first)"
assert_contains "$out" "2/4" "summary reports 2 of 4 passed"

# ---- Case 6: --list shows the default registry -----------------------------
rc=0
out=$(bash "$RUNNER" --list 2>&1) || rc=$?
assert_equals "0" "$rc" "--list exits 0"
assert_contains "$out" "typecheck" "default gates include typecheck"
assert_contains "$out" "test:unit" "default gates include unit tests"
assert_contains "$out" "test-shell-portability" "default gates include the shell portability gate"

# ---- Case 7: FAST tier drops unit tests but keeps everything else ----------
rc=0
out=$(CFN_PRE_PUSH_FAST=1 bash "$RUNNER" --list 2>&1) || rc=$?
assert_equals "0" "$rc" "FAST --list exits 0"
assert_not_contains "$out" "test:unit" "FAST tier excludes unit tests"
assert_contains "$out" "typecheck" "FAST tier keeps typecheck"
assert_contains "$out" "test-shell-syntax" "FAST tier keeps shell gates"

# ---- Case 8: FAST flag honored at run time too -----------------------------
rc=0
out=$(CFN_PRE_PUSH_FAST=1 CFN_PRE_PUSH_GATES="only::true" bash "$RUNNER" 2>&1) || rc=$?
assert_equals "0" "$rc" "FAST + fake gate exits 0"
assert_not_contains "$out" "unit-tests" "FAST run did not register the unit-tests gate"

log_success "all pre-push hook cases passed"
exit 0
