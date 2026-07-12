#!/usr/bin/env bash
# parse-test-summary.sh - shared test-runner summary-line parser.
#
# S002+S003 DRY refactor (origin: ROOTCAUSE_mpa_thread_wiring_gap.md, AC-77).
# gate-check.sh already implemented this summary-parsing logic per-runner
# (vitest/jest/pytest); verify-run.sh needed the identical logic to stop
# treating exit-code 0 as proof an AC's test actually ran. Rather than splice
# `--reporter=json` into arbitrary manifest `.check` one-liners (infeasible:
# checks are free-form shell run via `bash -c`, and cargo/go have no stable
# machine-readable summary without extra flags), this hoists the EXISTING
# captured-stdout summary-line parser into one place both callers source.
#
# Usage:
#   source lib/parse-test-summary.sh
#   if parse_test_summary "<file-of-captured-stdout>"; then
#     echo "$PTS_RUNNER $PTS_PASS $PTS_FAIL $PTS_ERROR $PTS_SKIP $PTS_TODO $PTS_COLLECTED"
#   fi
#
# parse_test_summary sets (always, even on no-match):
#   PTS_RUNNER     jest | vitest | pytest | unknown
#   PTS_PASS       passed count (0 if runner reports none)
#   PTS_FAIL       failed count
#   PTS_ERROR      error count (pytest only; 0 for jest/vitest)
#   PTS_SKIP       skipped count
#   PTS_TODO       todo count (jest/vitest only; 0 for pytest)
#   PTS_COLLECTED  total tests the runner reports it collected/ran, INCLUSIVE
#                  of skipped/todo. This is the corrected denominator (S003).
# Returns 0 when a recognized runner summary line was found, 1 when the
# captured output does not match any known runner format ("unknown", the
# fallthrough case). Unknown output is NOT an error; callers decide what to
# do (e.g. verify-run.sh falls back to exit-code-only semantics for
# cargo/go/mocha/ava and other runner kinds this parser does not cover).

# extract_count "<line>" "<word>" -> integer count or empty string
pts_extract_count() {
  echo "$1" | grep -oE "[0-9]+ $2" | tail -1 | grep -oE '^[0-9]+'
}

parse_test_summary() {
  local file="$1"
  local clean
  clean="$(mktemp)"
  # Strip ANSI color codes for reliable matching.
  sed -e $'s/\x1b\[[0-9;]*[A-Za-z]//g' "$file" > "$clean" 2>/dev/null || cp "$file" "$clean"

  PTS_RUNNER="unknown"
  PTS_PASS=0; PTS_FAIL=0; PTS_ERROR=0; PTS_SKIP=0; PTS_TODO=0; PTS_COLLECTED=0

  local LINE

  # --- jest: "Tests:       2 failed, 10 passed, 12 total" ---
  LINE=$(grep -E '^[[:space:]]*Tests:.*[0-9]+ total' "$clean" | tail -1 || true)
  if [[ -n "$LINE" ]]; then
    PTS_RUNNER="jest"
    PTS_PASS=$(pts_extract_count "$LINE" "passed"); PTS_PASS=${PTS_PASS:-0}
    PTS_FAIL=$(pts_extract_count "$LINE" "failed"); PTS_FAIL=${PTS_FAIL:-0}
    PTS_SKIP=$(pts_extract_count "$LINE" "skipped"); PTS_SKIP=${PTS_SKIP:-0}
    PTS_TODO=$(pts_extract_count "$LINE" "todo"); PTS_TODO=${PTS_TODO:-0}
    PTS_COLLECTED=$(pts_extract_count "$LINE" "total"); PTS_COLLECTED=${PTS_COLLECTED:-0}
    rm -f "$clean"
    return 0
  fi

  # --- vitest: "Tests  2 failed | 10 passed (12)" or " Tests  12 passed (12)"
  # or a fully-skipped run: " Tests  3 skipped (3)" (the AC-77 shape, no
  # "passed"/"failed" word at all, which is why this must also match on
  # skipped/todo alone, not just passed|failed).
  LINE=$(grep -E '^[[:space:]]*Tests[[:space:]]+.*[0-9]+ (passed|failed|skipped|todo)' "$clean" | tail -1 || true)
  if [[ -n "$LINE" ]]; then
    PTS_RUNNER="vitest"
    PTS_PASS=$(pts_extract_count "$LINE" "passed"); PTS_PASS=${PTS_PASS:-0}
    PTS_FAIL=$(pts_extract_count "$LINE" "failed"); PTS_FAIL=${PTS_FAIL:-0}
    PTS_SKIP=$(pts_extract_count "$LINE" "skipped"); PTS_SKIP=${PTS_SKIP:-0}
    PTS_TODO=$(pts_extract_count "$LINE" "todo"); PTS_TODO=${PTS_TODO:-0}
    local PAREN
    PAREN=$(echo "$LINE" | grep -oE '\([0-9]+\)' | tail -1 | tr -d '()')
    if [[ -n "$PAREN" ]]; then
      PTS_COLLECTED="$PAREN"
    else
      PTS_COLLECTED=$((PTS_PASS + PTS_FAIL + PTS_SKIP + PTS_TODO))
    fi
    rm -f "$clean"
    return 0
  fi

  # --- pytest: "===== 10 passed, 2 failed, 1 error in 1.23s =====" or
  # "===== 3 skipped in 0.01s =====" for a fully-skipped run.
  LINE=$(grep -E '[0-9]+ (passed|failed|error|errors|skipped).* in [0-9.]+s' "$clean" | tail -1 || true)
  if [[ -n "$LINE" ]]; then
    PTS_RUNNER="pytest"
    PTS_PASS=$(pts_extract_count "$LINE" "passed"); PTS_PASS=${PTS_PASS:-0}
    PTS_FAIL=$(pts_extract_count "$LINE" "failed"); PTS_FAIL=${PTS_FAIL:-0}
    PTS_ERROR=$(pts_extract_count "$LINE" "errors?"); PTS_ERROR=${PTS_ERROR:-0}
    PTS_SKIP=$(pts_extract_count "$LINE" "skipped"); PTS_SKIP=${PTS_SKIP:-0}
    # S003: total INCLUDES skipped. A skipped test must not be dropped from
    # the denominator (that let skipping a failing test RAISE the pass rate).
    PTS_COLLECTED=$((PTS_PASS + PTS_FAIL + PTS_ERROR + PTS_SKIP))
    rm -f "$clean"
    return 0
  fi

  rm -f "$clean"
  return 1
}
