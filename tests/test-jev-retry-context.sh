#!/usr/bin/env bash
# tests/test-jev-retry-context.sh
# Phase CI :: Jev retry-context shadow triage (batch 2, Phase 2)
# Verifies .claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-retry-context.sh:
#   slices /tmp/test-output-${RUN_ID}.txt failure blocks into units, asks Jev
#   one choice question per unit over the fixed 8-bucket cause menu, groups
#   the verdicts, writes /tmp/test-context-${RUN_ID}.md, and appends one
#   stats line to jev-retry-context.jsonl.
# Shadow only: exit 0 on API failure, no reduced file claimed on failure,
# rerun with the same run-id appends nothing.
# curl is stubbed on PATH (test-jev-vote-triage.sh idiom: argv logged, rc via
# JEV_CURL_RC, response body via JEV_CURL_BODY_FILE). Fully offline.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

TASK_MODE="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode"
TEST_TMP=$(mktemp -d -t jev-retry-context.XXXXXX)
CURL_LOG="$TEST_TMP/curl-calls.log"
STDERR_FILE="$TEST_TMP/stderr.txt"
STDOUT_FILE="$TEST_TMP/stdout.txt"
FAKE_ROOT="$TEST_TMP/root"
DATA_DIR="$TEST_TMP/data"
LOG_FILE="$DATA_DIR/jev-retry-context.jsonl"
STUB_BODY="$TEST_TMP/curl-body.json"

cleanup() {
    rm -rf "$TEST_TMP"
    rm -f /tmp/test-context-jevrc-*.md
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

if [ ! -f "$TASK_MODE/jev-retry-context.sh" ]; then
    log_error "FAIL: script under test not found: $TASK_MODE/jev-retry-context.sh"
    exit 1
fi

# Fake repo root: caller + script under test, copied so relative resolution
# and the settings fallback stay inside the sandbox.
mkdir -p "$FAKE_ROOT/.claude/cfn-scripts" \
         "$FAKE_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh" "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh"
cp "$TASK_MODE/jev-retry-context.sh" "$FAKE_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-retry-context.sh"
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh" \
         "$FAKE_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-retry-context.sh"
RETRY="$FAKE_ROOT/.claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-retry-context.sh"

assert_success "script parses (bash -n): jev-retry-context.sh" bash -n "$TASK_MODE/jev-retry-context.sh"

# run_sh SCRIPT ARGS...: capture OUT/ERR/RC without tripping set -e.
run_sh() {
    local script="$1"
    shift
    RC=0
    "$script" "$@" >"$STDOUT_FILE" 2>"$STDERR_FILE" || RC=$?
    OUT=$(cat "$STDOUT_FILE")
    ERR=$(cat "$STDERR_FILE")
}

# reset_case: neutral env, empty captures, fresh data dir.
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
}

# make_fixture PATH RUN_ID: a test-output file with 5 failure blocks
# (2 same-cause, 1 compile, 1 timeout, 1 noise) plus a long passing tail, so
# the reduced file lands well under a third of the original lines. Markers sit
# 4 lines apart so no block absorbs the next marker.
make_fixture() {
    local path="$1" i=1
    {
        printf 'suite run v1\n'
        printf 'FAIL tests/auth.test.sh - login rejects empty token\n'
        printf '  expected rc 1 got 0\n'
        printf '  at auth.test.sh:42\n'
        printf '  stack: main login_empty\n'
        printf 'FAIL tests/auth.test.sh - login rejects expired token\n'
        printf '  expected rc 2 got 0\n'
        printf '  at auth.test.sh:57\n'
        printf '  stack: main login_expired\n'
        printf 'FAIL src/parse.test.ts - suite compile\n'
        printf '  error TS2304: Cannot find name FOO\n'
        printf '  2 compile errors total\n'
        printf '  build exited rc 2\n'
        printf '\xe2\x9c\x97 tests/slow.test.sh - renders under load\n'
        printf '  timeout: exceeded 5000ms\n'
        printf '  1 of 3 steps completed\n'
        printf '  killed by runner\n'
        printf '\xe2\x9c\x97 tests/env.test.sh - reads DATABASE_URL\n'
        printf '  cache eviction moved 12 entries\n'
        printf '  another unrelated note\n'
        printf '  no assertion output at all\n'
        while [ "$i" -le 170 ]; do
            printf 'ok %d suite passing cleanly\n' "$i"
            i=$((i + 1))
        done
    } > "$path"
}

# Jev answers for u1..u5: two same-cause assertion units (u1, u2), compile
# (u3), timeout (u4), and a noise unit judged unclear at low confidence (u5).
cat > "$STUB_BODY" <<'EOF'
{"answers":{
  "u1":{"choice":"assertion_mismatch","confidence":0.9},
  "u2":{"choice":"assertion_mismatch","confidence":0.85},
  "u3":{"choice":"compile_error","confidence":0.95},
  "u4":{"choice":"timeout","confidence":0.9},
  "u5":{"choice":"unclear","confidence":0.4}},
 "usage":{"input_tokens":700}}
EOF

log_step "GIVEN the jev-retry-context shadow script"

log_step "CASE happy path: buckets assigned, duplicates collapse, reduced file + stats line"
reset_case
RUN_ID="jevrc-$$"
TEST_OUTPUT="$TEST_TMP/test-output-${RUN_ID}.txt"
REDUCED="/tmp/test-context-${RUN_ID}.txt_PLACEHOLDER"
# The reduced path is derived from run-id inside the script; compute it here.
REDUCED="/tmp/test-context-${RUN_ID}.md"
make_fixture "$TEST_OUTPUT"
export TYPESAFE_API_KEY=test-key-retry-123
export JEV_CURL_BODY_FILE="$STUB_BODY"
run_sh "$RETRY" --run-id "$RUN_ID" --test-output "$TEST_OUTPUT"
assert_equals "0" "$RC" "retry-context exits 0"
assert_equals "" "$OUT" "retry-context stdout stays empty"
assert_file_exists "$REDUCED" "reduced file written to /tmp/test-context-<run-id>.md"

assert_file_exists "$LOG_FILE" "stats log written"
assert_equals "1" "$(wc -l < "$LOG_FILE")" "exactly one log line on first run"
assert_equals "stats" "$(jq -r '.type' "$LOG_FILE")" "the line is a stats line"
assert_equals "$RUN_ID" "$(jq -r '.run_id' "$LOG_FILE")" "stats line carries the run id"
assert_equals "5" "$(jq -r '.total_units' "$LOG_FILE")" "five units sliced from five failure blocks"
assert_equals "2" "$(jq -r '.buckets.assertion_mismatch' "$LOG_FILE")" "two same-cause units share one bucket"
assert_equals "1" "$(jq -r '.buckets.compile_error' "$LOG_FILE")" "compile unit bucketed"
assert_equals "1" "$(jq -r '.buckets.timeout' "$LOG_FILE")" "timeout unit bucketed"
assert_equals "1" "$(jq -r '.buckets.unclear' "$LOG_FILE")" "noise unit bucketed unclear"
assert_equals "8" "$(jq -r '.buckets | length' "$LOG_FILE")" "stats buckets object carries all 8 menu entries"
assert_equals "1" "$(jq -r '.low_conf' "$LOG_FILE")" "one low-confidence unit counted"
orig_lines=$(wc -l < "$TEST_OUTPUT")
red_lines=$(wc -l < "$REDUCED")
assert_equals "$orig_lines" "$(jq -r '.orig_lines' "$LOG_FILE")" "stats orig_lines matches the real file"
assert_equals "$red_lines" "$(jq -r '.reduced_lines' "$LOG_FILE")" "stats reduced_lines matches the real file"
assert_success "reduced file under a third of the original ($red_lines vs $orig_lines lines)" \
    [ $((red_lines * 3)) -lt "$orig_lines" ]

assert_equals "1" "$(grep -c '^curl ' "$CURL_LOG")" "one batched curl call for 5 units"
assert_contains "$(cat "$REDUCED")" "- assertion_mismatch: 2" "reduced file shows the collapsed bucket count"
assert_equals "1" "$(grep -c '^### assertion_mismatch' "$REDUCED")" "duplicate-cause units collapse to one excerpt section"
assert_contains "$(cat "$REDUCED")" "login rejects empty token" "bucket excerpt is the first same-cause unit"
assert_contains "$(cat "$REDUCED")" "no assertion output at all" "unclear unit keeps its full excerpt (last line present)"
assert_contains "$(cat "$REDUCED")" "### u5" "unclear unit listed by id"
assert_contains "$ERR" "jev-retry-context" "status chatter goes to stderr"

log_step "CASE rerun idempotent: same run-id appends 0 and calls 0"
run_sh "$RETRY" --run-id "$RUN_ID" --test-output "$TEST_OUTPUT"
assert_equals "0" "$RC" "rerun exits 0"
assert_equals "1" "$(wc -l < "$LOG_FILE")" "rerun appends no log line"
assert_equals "1" "$(grep -c '^curl ' "$CURL_LOG")" "rerun makes no API call"
assert_contains "$ERR" "already triaged" "rerun names the reason on stderr"

log_step "CASE API failure: error line, exit 0, no reduced file claim"
reset_case
RUN_ID2="jevrc-fail-$$"
TEST_OUTPUT2="$TEST_TMP/test-output-${RUN_ID2}.txt"
REDUCED2="/tmp/test-context-${RUN_ID2}.md"
make_fixture "$TEST_OUTPUT2"
export TYPESAFE_API_KEY=test-key-retry-123
export JEV_CURL_RC=500
run_sh "$RETRY" --run-id "$RUN_ID2" --test-output "$TEST_OUTPUT2"
assert_equals "0" "$RC" "API failure still exits 0 (shadow never blocks)"
assert_equals "" "$OUT" "API failure stdout stays empty"
assert_success "no reduced file written on API failure" [ ! -e "$REDUCED2" ]
assert_file_exists "$LOG_FILE" "log written on API failure"
assert_equals "error" "$(jq -r '.type' "$LOG_FILE")" "API failure appends an error line"
assert_equals "$RUN_ID2" "$(jq -r '.run_id' "$LOG_FILE")" "error line carries the run id"
assert_contains "$ERR" "error" "API failure reported on stderr"

log_step "CASE missing key: skip line, exit 0, no reduced file"
reset_case
RUN_ID3="jevrc-nokey-$$"
TEST_OUTPUT3="$TEST_TMP/test-output-${RUN_ID3}.txt"
REDUCED3="/tmp/test-context-${RUN_ID3}.md"
make_fixture "$TEST_OUTPUT3"
run_sh "$RETRY" --run-id "$RUN_ID3" --test-output "$TEST_OUTPUT3"
assert_equals "0" "$RC" "missing key still exits 0"
assert_equals "" "$OUT" "missing key stdout stays empty"
assert_success "no reduced file written without a key" [ ! -e "$REDUCED3" ]
assert_equals "skip" "$(jq -r '.type' "$LOG_FILE")" "missing key appends a skip line"

log_step "CASE usage error: missing run-id exits 64"
reset_case
run_sh "$RETRY" --test-output "$TEST_OUTPUT"
assert_equals "64" "$RC" "missing --run-id is a usage error (64)"

print_test_summary
