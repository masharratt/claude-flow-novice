#!/usr/bin/env bash
# tests/test-jev-tmux-outcome.sh
# Phase CI :: Jev tmux outcome shadow mode (batch 2, Phase 3)
# Verifies .claude/skills/cfn-tmux-agents/lib/jev-outcome.sh:
#   classifies a no-banner pane tail into the fixed 6-verdict menu, appends
#   one {type:"outcome",...} line per call, never blocks the caller (exit 0
#   on key/API/parse failure), choices and tails never on stdout.
#
# curl is stubbed on PATH (fleet dashboard idiom from test-jev-vote-triage.sh):
# argv logged, rc via JEV_CURL_RC, response body served from
# JEV_CURL_BODY_FILE. Scripts are copied into a fake repo root so the key
# fallback never sees this repo's real settings.local.json, and the JSONL log
# is redirected to a temp dir via CFN_DATA_DIR. Fully offline; no network.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-tmux-agents"
TEST_TMP=$(mktemp -d -t jev-tmux-outcome.XXXXXX)
CURL_LOG="$TEST_TMP/curl-calls.log"
STDERR_FILE="$TEST_TMP/stderr.txt"
STDOUT_FILE="$TEST_TMP/stdout.txt"
FAKE_ROOT="$TEST_TMP/root"
DATA_DIR="$TEST_TMP/data"
LOG_FILE="$DATA_DIR/jev-tmux-outcome.jsonl"
TAIL_FILE="$TEST_TMP/pane-tail.txt"

cleanup() {
    rm -rf "$TEST_TMP"
}
trap cleanup EXIT

# Stub curl: log argv, scripted rc via JEV_CURL_RC, response body served from
# the file named by JEV_CURL_BODY_FILE (mirrors curl --fail on error).
mkdir -p "$TEST_TMP/bin"
cat > "$TEST_TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
# test stub for curl: log argv, scripted rc via JEV_CURL_RC, body via
# JEV_CURL_BODY_FILE
printf 'curl %s\n' "$*" >> "${JEV_CURL_LOG:-/dev/null}"
if [ "${JEV_CURL_RC:-0}" = "0" ] && [ -n "${JEV_CURL_BODY_FILE:-}" ]; then
    cat "${JEV_CURL_BODY_FILE}"
fi
exit "${JEV_CURL_RC:-0}"
STUB
chmod +x "$TEST_TMP/bin/curl"
export PATH="$TEST_TMP/bin:$PATH"
export JEV_CURL_LOG="$CURL_LOG"

# Fake repo root: cfn-scripts caller plus the script under test, copied so
# relative resolution and the settings fallback stay inside the sandbox.
mkdir -p "$FAKE_ROOT/.claude/cfn-scripts" "$FAKE_ROOT/.claude/skills/cfn-tmux-agents/lib"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh" "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh"
if [ ! -f "$SKILL_DIR/lib/jev-outcome.sh" ]; then
    log_error "FAIL: shadow script not found: $SKILL_DIR/lib/jev-outcome.sh"
    exit 1
fi
cp "$SKILL_DIR/lib/jev-outcome.sh" "$FAKE_ROOT/.claude/skills/cfn-tmux-agents/lib/jev-outcome.sh"
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh" \
         "$FAKE_ROOT/.claude/skills/cfn-tmux-agents/lib/jev-outcome.sh"
OUTCOME="$FAKE_ROOT/.claude/skills/cfn-tmux-agents/lib/jev-outcome.sh"

assert_success "script parses (bash -n): $OUTCOME" bash -n "$OUTCOME"

# Fixture pane tail: what a glm worker's pane shows when the update-available
# modal ate the banner. First line is deliberately longer than 120 chars so
# the cap case and the happy path share one fixture.
LONG1="Update available. To install the latest release now, press Enter and wait for the download and then confirm the prompts that follow this notice."
cat > "$TAIL_FILE" <<EOF
$LONG1
$LONG1 (continued)
node: internal/modules/cjs/loader:1050
  throw err;
  ^
Error: Cannot find module '$HOME/bin/glm'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1050:15)
    at Function._load (node:internal/modules/cjs/loader:932:27)
    at Function.executeUserEntryPoint (node:internal/run/main_module:236:12)
Tail of a pane that never matched its banner regex.
EOF

# Stub response body: one answer for the single "outcome" question.
STUB_BODY="$TEST_TMP/stub-body.json"
cat > "$STUB_BODY" <<'EOF'
{"answers":{"outcome":{"choice":"env_error","confidence":0.87}},"usage":{"input_tokens":98}}
EOF

# run_sh SCRIPT ARGS...: capture OUT/ERR/RC without tripping set -e.
run_sh() {
    local script="$1"
    shift
    RC=0
    "$script" "$@" >"$STDOUT_FILE" 2>"$STDERR_FILE" || RC=$?
    OUT=$(cat "$STDOUT_FILE")
    ERR=$(cat "$STDERR_FILE")
}

# reset_case: neutral env between cases, empty captures, fresh data dir.
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

log_step "GIVEN the Jev tmux outcome shadow script"

log_step "CASE happy path: one call, one outcome line with engine name"
reset_case
export TYPESAFE_API_KEY=test-key-tmux-123
export JEV_CURL_BODY_FILE="$STUB_BODY"
run_sh "$OUTCOME" --name w7 --engine glm --tail-file "$TAIL_FILE"
assert_equals "0" "$RC" "outcome exits 0"
assert_equals "" "$OUT" "stdout stays empty (verdict never on stdout)"
assert_equals "1" "$(( $(wc -l < "$LOG_FILE") ))" "one outcome line appended"
assert_equals "outcome" "$(jq -r '.type' "$LOG_FILE")" "line type is outcome"
assert_equals "w7" "$(jq -r '.name' "$LOG_FILE")" "session name recorded"
assert_equals "glm" "$(jq -r '.engine' "$LOG_FILE")" "engine name recorded"
assert_equals "env_error" "$(jq -r '.verdict' "$LOG_FILE")" "verdict logged"
assert_equals "0.87" "$(jq -r '.confidence' "$LOG_FILE")" "confidence logged"
assert_equals "98" "$(jq -r '.input_tokens' "$LOG_FILE")" "usage.input_tokens recorded"
assert_equals "$(printf '%s' "$LONG1" | cut -c1-120)" "$(jq -r '.tail_first' "$LOG_FILE")" \
    "tail_first is the capped first pane line"
assert_equals "120" "$(jq -r '.tail_first | length' "$LOG_FILE")" "tail_first capped at 120 chars"
assert_not_empty "$(jq -r '.ts' "$LOG_FILE")" "ts present"
assert_not_empty "$(jq -r '.project' "$LOG_FILE")" "project present"
assert_not_empty "$(jq -r '.cwd' "$LOG_FILE")" "cwd present"
assert_equals "1" "$(grep -c '^curl ' "$CURL_LOG")" "exactly one API call"
assert_not_contains "$ERR" "test-key-tmux-123" "key value never on stderr"
assert_not_contains "$OUT" "env_error" "no verdict text on stdout"

log_step "CASE verdicts stay inside the fixed 6-option menu"
assert_equals "" "$(jq -r 'select(.verdict != "banner_slow" and .verdict != "auth_prompt" and .verdict != "engine_crashed" and .verdict != "wrong_model" and .verdict != "env_error" and .verdict != "unclear") | .verdict' "$LOG_FILE")" \
    "verdict outside menu would fail this check"

log_step "CASE key missing: non-blocking exit 0 with a skip line"
reset_case
run_sh "$OUTCOME" --name w7 --engine glm --tail-file "$TAIL_FILE"
assert_equals "0" "$RC" "missing key still exits 0 (shadow never blocks)"
assert_equals "" "$OUT" "stdout stays empty on missing key"
assert_contains "$ERR" "skip" "skip line on stderr"
assert_equals "0" "$(( $(wc -l < "$CURL_LOG") ))" "no curl call without a key"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(( $(wc -l < "$LOG_FILE") ))" "no lines appended without a key"

log_step "CASE API failure: non-blocking exit 0 with an error line"
reset_case
export TYPESAFE_API_KEY=test-key-tmux-123
export JEV_CURL_RC=500
run_sh "$OUTCOME" --name w7 --engine glm --tail-file "$TAIL_FILE"
assert_equals "0" "$RC" "API failure still exits 0 (shadow never blocks)"
assert_equals "" "$OUT" "stdout stays empty on API failure"
assert_contains "$ERR" "error" "error line on stderr"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(( $(wc -l < "$LOG_FILE") ))" "no outcome lines on API failure"

log_step "CASE malformed response: non-blocking exit 0 with an error line"
reset_case
export TYPESAFE_API_KEY=test-key-tmux-123
printf '{"answers": "not-an-object"}' > "$TEST_TMP/bad-body.json"
export JEV_CURL_BODY_FILE="$TEST_TMP/bad-body.json"
run_sh "$OUTCOME" --name w7 --engine glm --tail-file "$TAIL_FILE"
assert_equals "0" "$RC" "malformed response still exits 0"
assert_equals "" "$OUT" "stdout stays empty on malformed response"
assert_contains "$ERR" "error" "error line on malformed response"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(( $(wc -l < "$LOG_FILE") ))" "no outcome lines on malformed response"

log_step "CASE empty tail file: verdict still logged with empty tail_first"
reset_case
export TYPESAFE_API_KEY=test-key-tmux-123
export JEV_CURL_BODY_FILE="$STUB_BODY"
: > "$TEST_TMP/empty-tail.txt"
run_sh "$OUTCOME" --name w8 --engine codex --tail-file "$TEST_TMP/empty-tail.txt"
assert_equals "0" "$RC" "empty tail still exits 0"
assert_equals "1" "$(( $(wc -l < "$LOG_FILE") ))" "one line appended for empty tail"
assert_equals "" "$(jq -r '.tail_first' "$LOG_FILE")" "tail_first empty for empty tail"
assert_equals "codex" "$(jq -r '.engine' "$LOG_FILE")" "engine recorded for empty tail"

log_step "CASE usage errors: invalid invocations exit 64"
reset_case
run_sh "$OUTCOME" --name w7 --tail-file "$TAIL_FILE"
assert_equals "64" "$RC" "missing --engine exits 64"
run_sh "$OUTCOME" --name w7 --engine glm
assert_equals "64" "$RC" "missing --tail-file exits 64"
run_sh "$OUTCOME" --name w7 --engine glm --tail-file "$TEST_TMP/no-such-tail.txt"
assert_equals "64" "$RC" "nonexistent tail file exits 64"

log_step "RESULT"
print_test_summary
