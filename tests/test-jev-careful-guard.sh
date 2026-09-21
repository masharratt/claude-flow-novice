#!/usr/bin/env bash
# tests/test-jev-careful-guard.sh
# Jev batch 2, Phase 4 :: careful-guard deny funnel (shadow second stage).
#
# Verifies the refactored hook plus the funnel script:
#   cfn-careful-guard.sh   all 8 deny rules still exit 2 with the same
#                          messages, one shared exit 2, funnel fired once and
#                          only on the deny path
#   jev-deny-check.sh      appends one deny line {rule,cmd<=200,jev_verdict,
#                          confidence} on a verdict, one skip line on no key
#                          or timeout, exits 0 on every internal outcome
#
# The hook runs as a SUBPROCESS with JSON on stdin, via bash exactly as
# production invokes it (settings.json: "bash $HOME/.claude/hooks/
# cfn-careful-guard.sh"; the shebang-less bash requirement comes from the
# BASH_SOURCE-based portable shim include). Sourcing it would kill the test,
# since it calls exit. curl is stubbed on PATH (fleet dashboard idiom):
# argv logged to JEV_CURL_LOG, rc via JEV_CURL_RC, body via
# JEV_CURL_BODY_FILE. Hook, funnel, systemone caller and shadow lib are
# copied into a fake repo root and HOME points there for the subprocess, so
# the funnel's $HOME/.claude/... resolution and the settings key fallback
# stay inside the sandbox. The JSONL log is redirected via CFN_DATA_DIR.
# Fully offline; no network.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

HOOK_SRC="$PROJECT_ROOT/.claude/hooks/cfn-careful-guard.sh"
FUNNEL_SRC="$PROJECT_ROOT/.claude/skills/cfn-careful/lib/jev-deny-check.sh"
TEST_TMP=$(mktemp -d -t jev-careful-guard.XXXXXX)
CURL_LOG="$TEST_TMP/curl-calls.log"
STDOUT_FILE="$TEST_TMP/stdout.txt"
STDERR_FILE="$TEST_TMP/stderr.txt"
FAKE_ROOT="$TEST_TMP/root"
DATA_DIR="$TEST_TMP/data"
LOG_FILE="$DATA_DIR/jev-careful-guard.jsonl"
HOOK="$FAKE_ROOT/.claude/hooks/cfn-careful-guard.sh"
FUNNEL="$FAKE_ROOT/.claude/skills/cfn-careful/lib/jev-deny-check.sh"

cleanup() {
    rm -rf "$TEST_TMP"
}
trap cleanup EXIT

# Stub curl: log argv, scripted rc via JEV_CURL_RC, response body served from
# the file named by JEV_CURL_BODY_FILE (mirrors curl --fail on error). The
# --max-time flag the hook's funnel bounds are expressed with is accepted and
# ignored.
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

# Fake repo root: systemone caller, shadow lib, funnel and hook copied so
# $HOME resolution and the settings fallback never leave the sandbox.
if [ ! -f "$HOOK_SRC" ]; then
    log_error "FAIL: hook not found: $HOOK_SRC"
    exit 1
fi
if [ ! -f "$FUNNEL_SRC" ]; then
    log_error "FAIL: funnel script not found: $FUNNEL_SRC"
    exit 1
fi
mkdir -p "$FAKE_ROOT/.claude/cfn-scripts" \
         "$FAKE_ROOT/.claude/skills/cfn-careful/lib" \
         "$FAKE_ROOT/.claude/hooks"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh" "$FAKE_ROOT/.claude/cfn-scripts/"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh" "$FAKE_ROOT/.claude/cfn-scripts/"
cp "$FUNNEL_SRC" "$FUNNEL"
cp "$HOOK_SRC" "$HOOK"
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/"*.sh "$FUNNEL" "$HOOK"

# Stub response body: one answer under the question id the funnel uses.
STUB_BODY="$TEST_TMP/stub-body.json"
cat > "$STUB_BODY" <<'EOF'
{"answers":{"deny":{"choice":"destructive","confidence":0.86}},"usage":{"input_tokens":98}}
EOF

# run_hook COMMAND: feed the hook a Bash-tool-call JSON payload on stdin as a
# subprocess. Case env (key, curl rc, body) is read from CASE_ variables so
# no case leaks into the next.
CASE_KEY=""
CASE_CURL_RC="0"
CASE_BODY=""
run_hook() {
    RC=0
    printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1" \
        | env HOME="$FAKE_ROOT" CFN_DATA_DIR="$DATA_DIR" \
            TYPESAFE_API_KEY="$CASE_KEY" \
            JEV_CURL_RC="$CASE_CURL_RC" \
            JEV_CURL_BODY_FILE="$CASE_BODY" \
            bash "$HOOK" >"$STDOUT_FILE" 2>"$STDERR_FILE" || RC=$?
    OUT=$(cat "$STDOUT_FILE")
    ERR=$(cat "$STDERR_FILE")
}

# reset_case: empty captures, fresh data dir, neutral case env.
reset_case() {
    : > "$CURL_LOG"
    : > "$STDOUT_FILE"
    : > "$STDERR_FILE"
    rm -rf "$DATA_DIR"
    mkdir -p "$DATA_DIR"
    CASE_KEY=""
    CASE_CURL_RC="0"
    CASE_BODY=""
}

# deny_case RULE CMD: one deny-rule happy path with the API answering.
deny_case() {
    local rule="$1" cmd="$2"
    reset_case
    CASE_KEY="test-key-guard-123"
    CASE_BODY="$STUB_BODY"
    run_hook "$cmd"
    assert_equals "2" "$RC" "deny exits 2: $rule"
    assert_contains "$ERR" "BLOCKED" "deny message on stderr: $rule"
    assert_equals "" "$OUT" "stdout stays empty on deny: $rule"
    assert_equals "1" "$(wc -l < "$LOG_FILE")" "one log line: $rule"
    assert_equals "deny" "$(jq -r '.type' "$LOG_FILE")" "line type deny: $rule"
    assert_equals "$rule" "$(jq -r '.rule' "$LOG_FILE")" "rule name in log: $rule"
    assert_equals "$cmd" "$(jq -r '.cmd' "$LOG_FILE")" "command string in log: $rule"
    assert_equals "destructive" "$(jq -r '.jev_verdict' "$LOG_FILE")" "verdict recorded: $rule"
    assert_equals "0.86" "$(jq -r '.confidence' "$LOG_FILE")" "confidence recorded: $rule"
    assert_equals "98" "$(jq -r '.input_tokens' "$LOG_FILE")" "input tokens recorded: $rule"
    assert_equals "1" "$(grep -c '^curl ' "$CURL_LOG")" "exactly one curl call on deny: $rule"
}

log_step "GIVEN the careful-guard hook and its shadow deny funnel"

log_step "CASE both scripts parse"
assert_success "hook parses (bash -n)" bash -n "$HOOK"
assert_success "funnel parses (bash -n)" bash -n "$FUNNEL"

log_step "CASE hook structure: ONE shared exit 2, funnel wired exactly once"
assert_equals "1" "$(grep -cE '^[[:space:]]*exit 2[[:space:]]*$' "$HOOK")" "single shared exit 2 in the hook"
assert_equals "1" "$(grep -c 'cfn-careful/lib/jev-deny-check.sh' "$HOOK")" "funnel wired exactly once"

log_step "CASE all 8 deny rules exit 2 and log one deny line each"
deny_case "file-deletion" "rm -rf /srv/important"
deny_case "db-destruction" "drop table users"
deny_case "force-push" "git push -f origin main"
deny_case "hard-reset" "git reset --hard HEAD~3"
deny_case "git-clean" "git clean -fd"
deny_case "checkout-paths" "git checkout -- ."
deny_case "container-destruction" "kubectl delete pods --all"
deny_case "disk-overwrite" "dd if=/dev/zero of=/dev/sda"

log_step "CASE force-push long form also denied under the same rule"
deny_case "force-push" "git push --force origin main"

log_step "CASE deny with the shadow off (no API key): skip line, verdict kept"
reset_case
run_hook "git reset --hard HEAD~3"
assert_equals "2" "$RC" "deny exits 2 with no key"
assert_contains "$ERR" "BLOCKED" "deny message unchanged with no key"
assert_equals "1" "$(wc -l < "$LOG_FILE")" "one skip line logged with no key"
assert_equals "skip" "$(jq -r '.type' "$LOG_FILE")" "line type skip with no key"
assert_equals "hard-reset" "$(jq -r '.rule' "$LOG_FILE")" "skip line carries the rule"
assert_contains "$(jq -r '.reason' "$LOG_FILE")" "API_KEY" "skip reason names the key"
assert_equals "0" "$(grep -c '^curl ' "$CURL_LOG")" "no curl call without a key"

log_step "CASE deny with curl timing out (stub rc 28): skip line, verdict kept"
reset_case
CASE_KEY="test-key-guard-123"
CASE_CURL_RC="28"
run_hook "git clean -fd"
assert_equals "2" "$RC" "deny exits 2 on curl timeout"
assert_contains "$ERR" "BLOCKED" "deny message unchanged on curl timeout"
assert_equals "1" "$(wc -l < "$LOG_FILE")" "one skip line logged on curl timeout"
assert_equals "skip" "$(jq -r '.type' "$LOG_FILE")" "line type skip on curl timeout"
assert_equals "git-clean" "$(jq -r '.rule' "$LOG_FILE")" "skip line carries the rule on timeout"
assert_contains "$(jq -r '.reason' "$LOG_FILE")" "timeout" "skip reason names the timeout"
assert_equals "1" "$(grep -c '^curl ' "$CURL_LOG")" "curl was attempted before timing out"

log_step "CASE allow path: exit 0, zero curl calls, nothing logged"
reset_case
CASE_KEY="test-key-guard-123"
CASE_BODY="$STUB_BODY"
run_hook "ls -la"
assert_equals "0" "$RC" "allow path exits 0"
assert_not_contains "$ERR" "BLOCKED" "no block message on allow"
assert_equals "0" "$(wc -l < "$CURL_LOG")" "allow path makes ZERO curl invocations"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(wc -l < "$LOG_FILE")" "allow path logs nothing"

log_step "CASE whitelist path (safe rm target): exit 0, zero curl calls, nothing logged"
reset_case
CASE_KEY="test-key-guard-123"
CASE_BODY="$STUB_BODY"
run_hook "rm -rf node_modules build_artifacts"
assert_equals "0" "$RC" "whitelisted rm exits 0"
assert_not_contains "$ERR" "BLOCKED" "no block message on whitelist"
assert_equals "0" "$(wc -l < "$CURL_LOG")" "whitelist path makes ZERO curl invocations"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(wc -l < "$LOG_FILE")" "whitelist path logs nothing"

log_step "CASE command string capped at 200 chars in the log"
reset_case
CASE_KEY="test-key-guard-123"
CASE_BODY="$STUB_BODY"
LONG_TAIL=$(printf 'a%.0s' $(seq 1 250))
run_hook "rm -rf /data/$LONG_TAIL"
assert_equals "2" "$RC" "long deny command still exits 2"
assert_equals "200" "$(jq -r '.cmd | length' "$LOG_FILE")" "logged command capped at 200 chars"

log_step "CASE funnel output never reaches the hook's stderr"
reset_case
CASE_KEY="test-key-guard-123"
CASE_BODY="$STUB_BODY"
run_hook "git push -f origin main"
assert_not_contains "$ERR" "jev" "no shadow chatter on the hook's stderr"

log_pass "all careful-guard deny funnel cases passed"
