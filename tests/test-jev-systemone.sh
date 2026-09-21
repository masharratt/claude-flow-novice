#!/usr/bin/env bash
# tests/test-jev-systemone.sh
# Phase CI :: generic Jev systemone caller (Jev vote-triage shadow pilot, Phase 1)
# Verifies .claude/cfn-scripts/jev-systemone.sh: one POST to /v1/systemone with
# a Bearer header and a body carrying model + questions, {answers,usage} JSON
# on stdout, key resolution (env first, then settings.local.json), and the
# exit contract 0 ok / 2 no key / 3 http-or-parse error, exactly one stderr
# line on failure, key value never printed.
#
# curl is stubbed on PATH (fleet dashboard idiom): argv logged to a file, rc
# scripted via JEV_CURL_RC, response body served from the file named by
# JEV_CURL_BODY_FILE. The script under test is copied into a fake repo root so
# the settings fallback is isolated from this repo's real settings.local.json.
# Fully offline; no network.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SCRIPT="$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh"
TEST_TMP=$(mktemp -d -t jev-systemone.XXXXXX)
CURL_LOG="$TEST_TMP/curl-calls.log"
STDERR_FILE="$TEST_TMP/stderr.txt"
FAKE_ROOT="$TEST_TMP/root"

cleanup() {
    rm -rf "$TEST_TMP"
}
trap cleanup EXIT

# Stub curl: log argv; rc via JEV_CURL_RC; on rc 0 serve the body file named
# by JEV_CURL_BODY_FILE (mirrors curl --fail, which returns no body on error).
mkdir -p "$TEST_TMP/bin"
cat > "$TEST_TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
# test stub for curl: log argv, scripted rc via JEV_CURL_RC, response body
# served from the file named by JEV_CURL_BODY_FILE
printf 'curl %s\n' "$*" >> "${JEV_CURL_LOG:-/dev/null}"
if [ "${JEV_CURL_RC:-0}" = "0" ] && [ -n "${JEV_CURL_BODY_FILE:-}" ]; then
    cat "${JEV_CURL_BODY_FILE}"
fi
exit "${JEV_CURL_RC:-0}"
STUB
chmod +x "$TEST_TMP/bin/curl"
export PATH="$TEST_TMP/bin:$PATH"
export JEV_CURL_LOG="$CURL_LOG"

log_step "GIVEN the generic Jev systemone caller"

if [ ! -f "$SCRIPT" ]; then
    log_error "FAIL: caller script not found: $SCRIPT"
    exit 1
fi
assert_success "caller script parses (bash -n)" bash -n "$SCRIPT"

# Isolated fake repo root: the settings fallback must not see the real key.
mkdir -p "$FAKE_ROOT/.claude/cfn-scripts"
cp "$SCRIPT" "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh"
CALLER="$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh"
chmod +x "$CALLER"

GOOD_BODY="$TEST_TMP/good-body.json"
cat > "$GOOD_BODY" <<'EOF'
{"answers":{"S001":{"choice":"implement_now","confidence":0.92,"probabilities":{"implement_now":0.92,"needs_panel":0.06,"reject":0.02}}},"usage":{"input_tokens":141}}
EOF

BAD_BODY="$TEST_TMP/bad-body.json"
printf '<html>502 gone fishing</html>' > "$BAD_BODY"

# request NAME: stdin JSON for the caller, one choice question named NAME.
request() {
    printf '{"state":{"manifest":"m-001.json","note":"shadow"},"questions":{"%s":{"type":"choice","instructions":"Triage this suggestion.","criteria":{"implement_now":"clear cut","needs_panel":"ambiguous","reject":"not worth doing"}}}}' "$1"
}

# run_caller INPUT: run the caller, capture OUT/ERR/RC without tripping set -e.
run_caller() {
    RC=0
    OUT=$(printf '%s' "$1" | "$CALLER" 2>"$STDERR_FILE") || RC=$?
    ERR=$(cat "$STDERR_FILE")
}

# reset_case: neutral env between cases, empty stderr file, truncated log.
reset_case() {
    : > "$STDERR_FILE"
    : > "$CURL_LOG"
    unset TYPESAFE_API_KEY || true
    unset JEV_MODEL || true
    unset JEV_CURL_RC || true
    unset JEV_CURL_BODY_FILE || true
}

log_step "CASE happy path: env key, valid response"
reset_case
export TYPESAFE_API_KEY=test-key-env-123
export JEV_CURL_BODY_FILE="$GOOD_BODY"
run_caller "$(request S001)"
assert_equals "0" "$RC" "happy path exits 0"
assert_contains "$OUT" '"choice":"implement_now"' "stdout carries the answer choice"
assert_contains "$OUT" '"confidence":0.92' "stdout carries the confidence"
assert_contains "$OUT" '"input_tokens":141' "stdout carries usage.input_tokens"
assert_contains "$(cat "$CURL_LOG")" "-X POST" "single POST method"
assert_contains "$(cat "$CURL_LOG")" "https://api.typesafe.ai/v1/systemone" "endpoint is /v1/systemone"
assert_contains "$(cat "$CURL_LOG")" "authorization: Bearer test-key-env-123" "Bearer header carries the env key"
assert_contains "$(cat "$CURL_LOG")" "content-type: application/json" "json content type"
assert_contains "$(cat "$CURL_LOG")" '"model":"jev-latest"' "default model in body"
assert_contains "$(cat "$CURL_LOG")" '"questions":{' "questions object in body"
assert_contains "$(cat "$CURL_LOG")" '"S001"' "question key in body"
assert_not_contains "$ERR" "test-key-env-123" "key value never on stderr"
assert_equals "" "$ERR" "no stderr noise on success"

log_step "CASE model override: JEV_MODEL replaces the default model"
reset_case
export TYPESAFE_API_KEY=test-key-env-123
export JEV_CURL_BODY_FILE="$GOOD_BODY"
export JEV_MODEL="jev-beta"
run_caller "$(request S001)"
assert_equals "0" "$RC" "model override exits 0"
assert_contains "$(cat "$CURL_LOG")" '"model":"jev-beta"' "JEV_MODEL lands in the body"

log_step "CASE key absent in both env and settings"
reset_case
rm -f "$FAKE_ROOT/.claude/settings.local.json"
run_caller "$(request S001)"
assert_equals "2" "$RC" "missing key exits 2"
assert_equals "" "$OUT" "no stdout on missing key"
STDERR_N=$(wc -l < "$STDERR_FILE")
if [ "$STDERR_N" != "1" ]; then
    printf 'stderr content (%s lines) for missing-key case:\n%s\n---\n' \
        "$STDERR_N" "$(cat "$STDERR_FILE")" >&2
fi
assert_equals "1" "$STDERR_N" "exactly one stderr line on missing key"
assert_equals "0" "$(wc -l < "$CURL_LOG")" "no curl call without a key"

log_step "CASE settings fallback: key from settings.local.json when env unset"
reset_case
printf '{"env":{"TYPESAFE_API_KEY":"test-key-settings-456"}}' > "$FAKE_ROOT/.claude/settings.local.json"
export JEV_CURL_BODY_FILE="$GOOD_BODY"
run_caller "$(request S001)"
assert_equals "0" "$RC" "settings fallback exits 0"
assert_contains "$(cat "$CURL_LOG")" "authorization: Bearer test-key-settings-456" "Bearer header carries the settings key"
assert_not_contains "$ERR" "test-key-settings-456" "settings key value never on stderr"

log_step "CASE HTTP 500"
reset_case
export TYPESAFE_API_KEY=test-key-env-123
export JEV_CURL_RC=500
run_caller "$(request S001)"
assert_equals "3" "$RC" "HTTP failure exits 3"
assert_equals "" "$OUT" "no stdout on HTTP failure"
assert_equals "1" "$(wc -l < "$STDERR_FILE")" "exactly one stderr line on HTTP failure"

log_step "CASE malformed JSON response"
reset_case
export TYPESAFE_API_KEY=test-key-env-123
export JEV_CURL_BODY_FILE="$BAD_BODY"
run_caller "$(request S001)"
assert_equals "3" "$RC" "malformed response exits 3"
assert_equals "" "$OUT" "no stdout on malformed response"
assert_equals "1" "$(wc -l < "$STDERR_FILE")" "exactly one stderr line on malformed response"

log_step "CASE invalid stdin: questions object missing"
reset_case
export TYPESAFE_API_KEY=test-key-env-123
run_caller '{"state":{}}'
assert_equals "3" "$RC" "stdin without questions exits 3"
assert_equals "0" "$(wc -l < "$CURL_LOG")" "no curl call on invalid stdin"

print_test_summary
