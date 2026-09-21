#!/usr/bin/env bash
# tests/test-jev-loop-shadow.sh
# Phase CI :: Jev shrink-reason shadow (batch 2, Phase 2) + wiring greps.
# Verifies .claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-shrink-reason.sh:
#   one noul question per declared tests_removed_reason, one verdict line in
#   jev-shrink-reason.jsonl, no stdout, exit 0 on any API outcome.
# Also greps the two wiring docs so the shadow step cannot rot unseen:
#   iteration-context.md step 0 (retry-context invocation)
#   cfn-loop-task.md retry pointer + exit-3/reminder shrink pointers
# curl is stubbed on PATH (test-jev-vote-triage.sh idiom). Fully offline.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

TASK_MODE="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode"
TEST_TMP=$(mktemp -d -t jev-loop-shadow.XXXXXX)
CURL_LOG="$TEST_TMP/curl-calls.log"
STDERR_FILE="$TEST_TMP/stderr.txt"
STDOUT_FILE="$TEST_TMP/stdout.txt"
FAKE_ROOT="$TEST_TMP/root"
DATA_DIR="$TEST_TMP/data"
LOG_FILE="$DATA_DIR/jev-shrink-reason.jsonl"

cleanup() {
    rm -rf "$TEST_TMP"
}
trap cleanup EXIT

# Stub curl: log argv, scripted rc via JEV_CURL_RC, body via JEV_CURL_BODY_FILE.
mkdir -p "$TEST_TMP/bin"
cat > "$TEST_TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
printf 'curl %s\n' "$*" >> "${JEV_CURL_LOG:-/dev/null}"
if [ "${JEV_CURL_RC:-0}" = "0" ] && [ -n "${JEV_CURL_BODY_FILE:-}" ]; then
    cat "${JEV_CURL_BODY_FILE}"
fi
exit "${JEV_CURL_RC:-0}"
STUB
chmod +x "$TEST_TMP/bin/curl"
export PATH="$TEST_TMP/bin:$PATH"
export JEV_CURL_LOG="$CURL_LOG"

if [ ! -f "$TASK_MODE/jev-shrink-reason.sh" ]; then
    log_error "FAIL: script under test not found: $TASK_MODE/jev-shrink-reason.sh"
    exit 1
fi

assert_success "script parses (bash -n): jev-shrink-reason.sh" bash -n "$TASK_MODE/jev-shrink-reason.sh"

# Fake repo root: caller + script under test, copied so relative resolution
# and the settings fallback stay inside the sandbox.
mkdir -p "$FAKE_ROOT/.claude/cfn-scripts" \
         "$FAKE_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh" "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh"
# Shadow lib too: the script under test loads it from $HOME/.claude/cfn-scripts/.
if [ -f "$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh" ]; then
    cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh" "$FAKE_ROOT/.claude/cfn-scripts/"
fi
cp "$TASK_MODE/jev-shrink-reason.sh" "$FAKE_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-shrink-reason.sh"
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh" \
         "$FAKE_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-shrink-reason.sh"
SHRINK="$FAKE_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-shrink-reason.sh"

# run_sh SCRIPT ARGS...: capture OUT/ERR/RC without tripping set -e.
run_sh() {
    local script="$1"
    shift
    RC=0
    HOME="$FAKE_ROOT" "$script" "$@" >"$STDOUT_FILE" 2>"$STDERR_FILE" || RC=$?
    OUT=$(cat "$STDOUT_FILE")
    ERR=$(cat "$STDERR_FILE")
}

# reset_case: neutral env, empty captures, fresh data dir, scripted body.
reset_case() {
    : > "$CURL_LOG"
    : > "$STDOUT_FILE"
    : > "$STDERR_FILE"
    rm -rf "$DATA_DIR"
    mkdir -p "$DATA_DIR"
    unset TYPESAFE_API_KEY || true
    unset JEV_CURL_RC || true
    unset JEV_CURL_BODY_FILE || true
    export CFN_DATA_DIR="$DATA_DIR"
    export TYPESAFE_API_KEY=test-key-shrink-123
}

log_step "GIVEN the jev-shrink-reason shadow script"

log_step "CASE happy path: noul 0.85 -> verdict true, one shrink line, no stdout"
reset_case
printf '%s\n' '{"answers":{"shrink":{"type":"noul","noul":0.85}},"usage":{"input_tokens":88}}' > "$TEST_TMP/body-high.json"
export JEV_CURL_BODY_FILE="$TEST_TMP/body-high.json"
LONG_REASON="Removed flaky_test_retry.sh because its polling loop raced the CI clock and it duplicated timeout coverage added in the gate check"
run_sh "$SHRINK" --reason "$LONG_REASON" --baseline 120 --total 118 --run-id "run-shrink-1"
assert_equals "0" "$RC" "shrink-reason exits 0"
assert_equals "" "$OUT" "shrink-reason stdout stays empty (shadow never speaks on stdout)"
assert_file_exists "$LOG_FILE" "verdict log written"
assert_equals "1" "$(( $(wc -l < "$LOG_FILE") ))" "exactly one log line"
assert_equals "shrink" "$(jq -r '.type' "$LOG_FILE")" "the line is a shrink line"
assert_equals "run-shrink-1" "$(jq -r '.run_id' "$LOG_FILE")" "line carries the run id"
assert_equals "true" "$(jq -r '.jev_verdict' "$LOG_FILE")" "noul 0.85 maps to verdict true"
assert_equals "0.85" "$(jq -r '.confidence' "$LOG_FILE")" "confidence is the raw noul probability"
assert_equals "120" "$(jq -r '.baseline' "$LOG_FILE")" "baseline recorded"
assert_equals "118" "$(jq -r '.total' "$LOG_FILE")" "total recorded"
assert_equals "88" "$(jq -r '.input_tokens' "$LOG_FILE")" "input tokens recorded"
assert_equals "$LONG_REASON" "$(jq -r '.reason' "$LOG_FILE")" "short-enough reason stored verbatim"
assert_contains "$(cat "$LOG_FILE")" '"project"' "line carries the project field (shared multi-project log)"
assert_equals "1" "$(grep -c '^curl ' "$CURL_LOG")" "one API call"

log_step "CASE noul 0.2 -> verdict false"
reset_case
printf '%s\n' '{"answers":{"shrink":{"type":"noul","noul":0.2}},"usage":{"input_tokens":50}}' > "$TEST_TMP/body-low.json"
export JEV_CURL_BODY_FILE="$TEST_TMP/body-low.json"
run_sh "$SHRINK" --reason "cleaned up some tests" --baseline 100 --total 90 --run-id "run-shrink-2"
assert_equals "0" "$RC" "low-noul case exits 0"
assert_equals "false" "$(jq -r '.jev_verdict' "$LOG_FILE")" "noul 0.2 maps to verdict false"

log_step "CASE long reason: logged reason capped at 200 chars"
reset_case
export JEV_CURL_BODY_FILE="$TEST_TMP/body-high.json"
big_reason=$(printf 'x%.0s' $(seq 1 300))
run_sh "$SHRINK" --reason "$big_reason" --baseline 10 --total 5 --run-id "run-shrink-3"
assert_equals "0" "$RC" "long-reason case exits 0"
reason_len=$(jq -r '.reason' "$LOG_FILE" | wc -c | tr -d '[:space:]')
assert_success "logged reason capped at 200 chars (got $((reason_len - 1)))" [ "$reason_len" -le 201 ]

log_step "CASE missing key: skip line, exit 0, no stdout"
reset_case
unset TYPESAFE_API_KEY
run_sh "$SHRINK" --reason "dropped the flaky retry test" --baseline 10 --total 9 --run-id "run-shrink-4"
assert_equals "0" "$RC" "missing key still exits 0"
assert_equals "" "$OUT" "missing key stdout stays empty"
assert_equals "skip" "$(jq -r '.type' "$LOG_FILE")" "missing key appends a skip line"
assert_equals "run-shrink-4" "$(jq -r '.run_id' "$LOG_FILE")" "skip line carries the run id"

log_step "CASE API failure: error line, exit 0, no stdout"
reset_case
export JEV_CURL_RC=500
run_sh "$SHRINK" --reason "dropped the flaky retry test" --baseline 10 --total 9 --run-id "run-shrink-5"
assert_equals "0" "$RC" "API failure still exits 0"
assert_equals "" "$OUT" "API failure stdout stays empty"
assert_equals "error" "$(jq -r '.type' "$LOG_FILE")" "API failure appends an error line"
assert_contains "$ERR" "error" "API failure reported on stderr"

log_step "CASE usage error: missing --baseline exits 64"
reset_case
run_sh "$SHRINK" --reason "r" --total 9 --run-id "run-shrink-6"
assert_equals "64" "$RC" "missing --baseline is a usage error (64)"

log_step "CASE wiring: shadow steps present in the loop docs"
ITER_CTX="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/iteration-context.md"
LOOP_TASK="$PROJECT_ROOT/.claude/commands/cfn-loop-task.md"
assert_contains "$(cat "$ITER_CTX")" \
    '$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-retry-context.sh --run-id "$RUN_ID"' \
    "iteration-context.md step 0 invokes retry-context via the \$HOME path"
assert_contains "$(cat "$ITER_CTX")" \
    'the grep below stays authoritative' \
    "iteration-context.md labels the shadow as non-authoritative"
assert_contains "$(cat "$LOOP_TASK")" \
    'SHADOW: retry-context prefilter' \
    "cfn-loop-task.md carries the SHADOW retry pointer"
assert_contains "$(cat "$LOOP_TASK")" \
    '/tmp/test-context-${RUN_ID}.md' \
    "cfn-loop-task.md names the reduced output path"
shrink_hits=$(grep -cF '$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-shrink-reason.sh' "$LOOP_TASK" || true)
assert_success "shrink-reason \$HOME pointer present at both spots (exit-3 cell + reminder bullet); found $shrink_hits, need 2" \
    [ "$shrink_hits" -ge 2 ]

print_test_summary
