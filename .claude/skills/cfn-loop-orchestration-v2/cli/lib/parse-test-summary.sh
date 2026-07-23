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
#   PTS_RUNNER     jest | vitest | pytest | node | cargo | nextest | playwright
#                  | go | unknown
#   PTS_PASS       passed count (0 if runner reports none)
#   PTS_FAIL       failed count
#   PTS_ERROR      error count (pytest only; 0 for every other runner)
#   PTS_SKIP       skipped count (cargo's "ignored" lands here)
#   PTS_TODO       todo count (jest/vitest/node only; 0 elsewhere)
#   PTS_COLLECTED  total tests the runner reports it collected/ran, INCLUSIVE
#                  of skipped/todo. This is the corrected denominator (S003).
#   PTS_FILTERED   tests the runner EXCLUDED by filter/flag before running
#                  (cargo/nextest "filtered out"); 0 for runners that do not
#                  report it. A zero-collected run with PTS_FILTERED > 0 is the
#                  signature of a check whose selector or --ignored flag does
#                  not match the named test (S005), not of a failing feature.
# Returns 0 when a recognized runner summary line was found, 1 when the
# captured output does not match any known runner format ("unknown", the
# fallthrough case). Unknown output is NOT an error; callers decide what to
# do (e.g. verify-run.sh falls back to exit-code-only semantics for
# mocha/ava and other runner kinds this parser does not cover).

# U+2139 INFORMATION SOURCE: the marker node:test's default `spec` reporter
# prefixes each summary line with. Defined as a real character via $'..' so it
# reaches grep -E as bytes; a "\xe2\x84\xb9" string inside the pattern would be
# matched literally and silently never hit (the spec reporter is node's
# DEFAULT, so that failure mode misses the common case while the '#' tap
# reporter still passes).
PTS_NODE_INFO=$'ℹ'

# extract_count "<line>" "<word>" -> integer count or empty string
pts_extract_count() {
  echo "$1" | grep -oE "[0-9]+ $2" | tail -1 | grep -oE '^[0-9]+'
}

# pts_extract_node_count "<file>" "<word>" -> integer count or empty string.
# node:test inverts the order (word then number) and puts each count on its
# own line, so this reads the file rather than a single summary line. Anchored
# on the line start + the "#"/info marker so a test NAMED e.g. "fail 3" in the
# body cannot be mistaken for the summary. Takes the LAST match: with multiple
# test files node prints one summary block, but a `--watch`/rerun capture may
# hold more than one, and the final block is the authoritative one.
pts_extract_node_count() {
  grep -E "^[[:space:]]*(#|${PTS_NODE_INFO})[[:space:]]+$2[[:space:]]+[0-9]+" "$1" \
    | tail -1 | grep -oE '[0-9]+$'
}

# pts_sum_count "<file>" "<line-ERE>" "<word>" -> sum of every "N <word>" on
# every line matching <line-ERE>, or 0.
# Summing (not tail -1) is mandatory for cargo: `cargo test` prints one
# `test result:` line PER BINARY (lib, each integration target, doctests).
# Reading only the last line reads the doctest block, which is almost always
# 0 passed / 0 failed -- reporting collected=0 and forcing a false red on a
# fully green multi-target run.
pts_sum_count() {
  grep -E "$2" "$1" | grep -oE "[0-9]+ $3" | grep -oE '^[0-9]+' \
    | awk '{s+=$1} END {print s+0}'
}

# pts_count_lines "<file>" "<ERE>" -> number of matching lines
pts_count_lines() { grep -cE "$2" "$1" || true; }

parse_test_summary() {
  local file="$1"
  local clean
  clean="$(mktemp)"
  # Strip ANSI color codes for reliable matching.
  sed -e $'s/\x1b\[[0-9;]*[A-Za-z]//g' "$file" > "$clean" 2>/dev/null || cp "$file" "$clean"

  PTS_RUNNER="unknown"
  PTS_PASS=0; PTS_FAIL=0; PTS_ERROR=0; PTS_SKIP=0; PTS_TODO=0; PTS_COLLECTED=0
  PTS_FILTERED=0

  local LINE

  # --- node:test (`node --test`): a multi-line summary block, one count per
  # line, with the NUMBER AFTER the word (the inverse of every other runner
  # here, which is why none of the branches below can match it and why an
  # unpatched parser reported "no tests detected" -> exit 2 -> a gate that
  # could never pass for a plain `node --test` project):
  #   # tests 217
  #   # pass 213
  #   # fail 2
  #   # skipped 2
  #   # todo 0
  # The spec reporter prefixes each line with U+2139 (info) instead of '#',
  # so match either. `tests` is already INCLUSIVE of skipped/todo (S003's
  # corrected denominator), so it is used directly as PTS_COLLECTED rather
  # than re-summing. Matched FIRST: it is the most specific shape, and node
  # emits per-test durations like "(11189.011418ms)" that must never be
  # mistaken for pytest's "in 1.23s" summary.
  LINE=$(grep -E "^[[:space:]]*(#|${PTS_NODE_INFO})[[:space:]]+tests[[:space:]]+[0-9]+" "$clean" | tail -1 || true)
  if [[ -n "$LINE" ]]; then
    PTS_RUNNER="node"
    PTS_COLLECTED=$(pts_extract_node_count "$clean" "tests"); PTS_COLLECTED=${PTS_COLLECTED:-0}
    PTS_PASS=$(pts_extract_node_count "$clean" "pass"); PTS_PASS=${PTS_PASS:-0}
    PTS_FAIL=$(pts_extract_node_count "$clean" "fail"); PTS_FAIL=${PTS_FAIL:-0}
    PTS_SKIP=$(pts_extract_node_count "$clean" "skipped"); PTS_SKIP=${PTS_SKIP:-0}
    PTS_TODO=$(pts_extract_node_count "$clean" "todo"); PTS_TODO=${PTS_TODO:-0}
    rm -f "$clean"
    return 0
  fi

  # --- cargo (libtest): "test result: ok. 645 passed; 0 failed; 12 ignored;
  # 0 measured; 0 filtered out; finished in 3.20s"
  #
  # S005: this branch MUST precede the pytest branch. Cargo's line satisfies
  # pytest's `[0-9]+ (passed|failed|...).* in [0-9.]+s` regex, so before this
  # existed every Rust run was reported as PTS_RUNNER=pytest. That misparse was
  # not cosmetic: cargo says "ignored" where pytest says "skipped", so PTS_SKIP
  # came back 0 on every Rust run and S002's "skipped/todo present -> red" rule
  # (a skipped guard is not a guard) could never fire for a Rust project.
  #
  # "filtered out" is captured separately into PTS_FILTERED rather than folded
  # into the denominator: a filtered test was never selected to run, so it is
  # not part of what this check claims to prove. It is recorded because
  # collected=0 WITH filtered>0 is the exact signature of a check whose
  # `--ignored` flag disagrees with the test's `#[ignore]` attribute, or whose
  # `--exact` module path is one module off -- both of which cargo reports with
  # exit code 0.
  if grep -qE '^[[:space:]]*test result:' "$clean"; then
    PTS_RUNNER="cargo"
    PTS_PASS=$(pts_sum_count "$clean" '^[[:space:]]*test result:' 'passed')
    PTS_FAIL=$(pts_sum_count "$clean" '^[[:space:]]*test result:' 'failed')
    PTS_SKIP=$(pts_sum_count "$clean" '^[[:space:]]*test result:' 'ignored')
    PTS_FILTERED=$(pts_sum_count "$clean" '^[[:space:]]*test result:' 'filtered out')
    PTS_COLLECTED=$((PTS_PASS + PTS_FAIL + PTS_SKIP))
    rm -f "$clean"
    return 0
  fi

  # --- cargo-nextest: "Summary [   3.207s] 645 tests run: 645 passed, 12 skipped"
  # Has no "in <N>s" tail, so it matched NO branch before this and fell through
  # to unknown -> verify-run.sh reverted to exit-code-only semantics, the exact
  # pre-S002 hole. "N tests run" excludes skipped, so the S003-correct
  # denominator is pass+fail+skip; the max() guard keeps the larger of the two
  # readings if a future nextest format changes what "tests run" counts.
  LINE=$(grep -E '^[[:space:]]*Summary \[.*[0-9]+ tests run:' "$clean" | tail -1 || true)
  if [[ -n "$LINE" ]]; then
    PTS_RUNNER="nextest"
    PTS_PASS=$(pts_extract_count "$LINE" "passed"); PTS_PASS=${PTS_PASS:-0}
    PTS_FAIL=$(pts_extract_count "$LINE" "failed"); PTS_FAIL=${PTS_FAIL:-0}
    PTS_SKIP=$(pts_extract_count "$LINE" "skipped"); PTS_SKIP=${PTS_SKIP:-0}
    local NX_RUN SUMMED
    NX_RUN=$(echo "$LINE" | grep -oE '[0-9]+ tests run' | tail -1 | grep -oE '^[0-9]+')
    NX_RUN=${NX_RUN:-0}
    SUMMED=$((PTS_PASS + PTS_FAIL + PTS_SKIP))
    if [ $((NX_RUN + PTS_SKIP)) -gt "$SUMMED" ]; then
      PTS_COLLECTED=$((NX_RUN + PTS_SKIP))
    else
      PTS_COLLECTED="$SUMMED"
    fi
    rm -f "$clean"
    return 0
  fi

  # --- playwright: "Running 16 tests using 4 workers" header, then a tail of
  #   1 failed
  #   2 flaky
  #   13 passed (12.1s)
  # S007 made `playwright:` checks executable, so this branch exists to stop
  # them inheriting the exit-code-only hole the whole S002/S005 line closes:
  # `--pass-with-no-tests` (or a config that sets it) turns a grep that matched
  # nothing into exit 0.
  #
  # Identified by the HEADER, never by the bare "N passed (Xs)" tail: that tail
  # shape is generic enough to false-match arbitrary program output, whereas
  # "Running N tests using M worker(s)" is playwright-specific. The header's N
  # is the pre-run count and is the authoritative denominator when it exceeds
  # the summed tail (playwright omits a zero line rather than printing "0 skipped").
  LINE=$(grep -E '^[[:space:]]*Running [0-9]+ tests? using [0-9]+ workers?' "$clean" | tail -1 || true)
  if [[ -n "$LINE" ]]; then
    PTS_RUNNER="playwright"
    local PW_HEADER PW_SUM
    PW_HEADER=$(echo "$LINE" | grep -oE '[0-9]+ tests?' | head -1 | grep -oE '^[0-9]+')
    PW_HEADER=${PW_HEADER:-0}
    PTS_PASS=$(pts_sum_count "$clean" '^[[:space:]]*[0-9]+ passed' 'passed')
    PTS_FAIL=$(pts_sum_count "$clean" '^[[:space:]]*[0-9]+ (failed|flaky)' '(failed|flaky)')
    PTS_SKIP=$(pts_sum_count "$clean" '^[[:space:]]*[0-9]+ (skipped|did not run)' '(skipped|did not run)')
    PW_SUM=$((PTS_PASS + PTS_FAIL + PTS_SKIP))
    if [ "$PW_HEADER" -gt "$PW_SUM" ]; then PTS_COLLECTED="$PW_HEADER"; else PTS_COLLECTED="$PW_SUM"; fi
    rm -f "$clean"
    return 0
  fi

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

  # --- go test -v: no summary counts at all, only per-test verdict lines:
  #   --- PASS: TestAlpha (0.00s)
  #   --- FAIL: TestGamma (0.01s)
  #   --- SKIP: TestDelta (0.00s)
  # Anchored at column 0 so indented SUBTEST verdicts are not counted twice
  # (a subtest's parent already reports the aggregate verdict).
  #
  # Matched LAST and deliberately non-greedy: `go test` WITHOUT -v prints only
  # "ok <pkg> 0.5s" / "FAIL" and no verdict lines. That must stay "unknown"
  # (return 1) so callers keep exit-code semantics, rather than being handed a
  # confident PTS_COLLECTED=0 that would force a false red on every
  # non-verbose Go run.
  local GO_P GO_F GO_S
  GO_P=$(pts_count_lines "$clean" '^--- PASS:')
  GO_F=$(pts_count_lines "$clean" '^--- FAIL:')
  GO_S=$(pts_count_lines "$clean" '^--- SKIP:')
  if [ $((GO_P + GO_F + GO_S)) -gt 0 ]; then
    PTS_RUNNER="go"
    PTS_PASS="$GO_P"; PTS_FAIL="$GO_F"; PTS_SKIP="$GO_S"
    PTS_COLLECTED=$((GO_P + GO_F + GO_S))
    rm -f "$clean"
    return 0
  fi

  rm -f "$clean"
  return 1
}
