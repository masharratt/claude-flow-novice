#!/usr/bin/env bash
# tests/test-jev-rot-risk.sh
# Jev batch 2, Phase 5 :: tech-debt rot-risk shadow scorer.
# Verifies .claude/skills/cfn-tech-debt/jev-rot-risk.sh:
#   - one score line per has_trigger==false ledger row (has_trigger rows never
#     scored), appended to jev-rot-risk.jsonl under CFN_DATA_DIR
#   - the ledger file itself is byte-identical after the run (read-only)
#   - ceiling field capped at 160 chars per line shape
#   - missing key: one skip line per row on stderr, exit 0, no API call
#   - API failure: one error line, exit 0, no log lines
#   - ledger with zero no-trigger rows: nothing to score, no API call
#
# curl is stubbed on PATH (fleet dashboard idiom, extended with a body file):
# argv logged, rc via JEV_CURL_RC, response body served from JEV_CURL_BODY_FILE.
# Scripts are copied into a fake repo root so the key fallback never sees this
# repo's real settings.local.json, and the JSONL log is redirected to a temp
# dir via CFN_DATA_DIR. Fully offline; no network.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-tech-debt"
TEST_TMP=$(mktemp -d -t jev-rot-risk.XXXXXX)
CURL_LOG="$TEST_TMP/curl-calls.log"
STDERR_FILE="$TEST_TMP/stderr.txt"
STDOUT_FILE="$TEST_TMP/stdout.txt"
FAKE_ROOT="$TEST_TMP/root"
DATA_DIR="$TEST_TMP/data"
LOG_FILE="$DATA_DIR/jev-rot-risk.jsonl"
LEDGER="$TEST_TMP/tech-debt-ledger.json"

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

# Fake repo root: cfn-scripts caller plus the script under test, copied so the
# relative caller resolution and the settings fallback stay inside the sandbox.
mkdir -p "$FAKE_ROOT/.claude/cfn-scripts" "$FAKE_ROOT/.claude/skills/cfn-tech-debt"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh" "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh"
# Shadow lib too: the script under test loads it from $HOME/.claude/cfn-scripts/.
if [ -f "$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh" ]; then
    cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh" "$FAKE_ROOT/.claude/cfn-scripts/"
fi
if [ ! -f "$SKILL_DIR/jev-rot-risk.sh" ]; then
    log_error "FAIL: rot-risk script not found: $SKILL_DIR/jev-rot-risk.sh"
    exit 1
fi
cp "$SKILL_DIR/jev-rot-risk.sh" "$FAKE_ROOT/.claude/skills/cfn-tech-debt/jev-rot-risk.sh"
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh" \
         "$FAKE_ROOT/.claude/skills/cfn-tech-debt/jev-rot-risk.sh"
ROT="$FAKE_ROOT/.claude/skills/cfn-tech-debt/jev-rot-risk.sh"

assert_success "script parses (bash -n): $ROT" bash -n "$ROT"

# Fixture ledger: 5 markers, 4 with has_trigger==false (one with a runaway
# ceiling well past 160 chars to prove the cap) and 1 with a trigger that must
# never be scored.
cat > "$LEDGER" <<'EOF'
{
  "generated": "2026-09-20T10:00:00Z",
  "total": 5,
  "no_trigger": 4,
  "markers": [
    {"file": "src/a.py", "line": 12, "ceiling": "global lock", "upgrade_trigger": null, "has_trigger": false},
    {"file": "src/b.ts", "line": 30, "ceiling": "single retry", "upgrade_trigger": null, "has_trigger": false},
    {"file": "lib/c.sh", "line": 44, "ceiling": "in-memory queue that everyone knows is lossy under load and has been paged over twice already this quarter, kept because the fix needs a real broker decision", "upgrade_trigger": null, "has_trigger": false},
    {"file": "lib/d.go", "line": 7, "ceiling": "sequential scan", "upgrade_trigger": null, "has_trigger": false},
    {"file": "src/e.rs", "line": 99, "ceiling": "global cache", "upgrade_trigger": "per-account keys if cross-tenant reads appear", "has_trigger": true}
  ]
}
EOF

# Stub response body: one score answer per no-trigger row id.
STUB_BODY="$TEST_TMP/stub-body.json"
cat > "$STUB_BODY" <<'EOF'
{"answers":{"R001":{"score":0,"confidence":0.9},"R002":{"score":1,"confidence":0.75},"R003":{"score":2,"confidence":0.81},"R004":{"score":0,"confidence":0.6}},"usage":{"input_tokens":207}}
EOF

# run_sh SCRIPT ARGS...: capture OUT/ERR/RC without tripping set -e.
run_sh() {
    local script="$1"
    shift
    RC=0
    HOME="$FAKE_ROOT" "$script" "$@" >"$STDOUT_FILE" 2>"$STDERR_FILE" || RC=$?
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

log_step "GIVEN the Jev tech-debt rot-risk shadow script"

log_step "CASE happy path: 4 no-trigger rows, one score line each, trigger row skipped"
reset_case
export TYPESAFE_API_KEY=test-key-rot-123
export JEV_CURL_BODY_FILE="$STUB_BODY"
SHA_BEFORE=$(sha256sum "$LEDGER" | cut -d' ' -f1)
run_sh "$ROT" --ledger "$LEDGER"
assert_equals "0" "$RC" "rot-risk exits 0"
assert_equals "" "$OUT" "rot-risk stdout stays empty (scores never on stdout)"
assert_equals "4" "$(( $(wc -l < "$LOG_FILE") ))" "four score lines appended"
assert_equals "rot rot rot rot" "$(jq -rs '[.[] | .type] | join(" ")' "$LOG_FILE")" "all lines are rot type"
assert_equals "0 0 1 2" "$(jq -rs '[.[] | .score] | sort | join(" ")' "$LOG_FILE")" "scores land as 0-2 numbers"
assert_equals "0" "$(jq -rs '[.[] | select(.file == "src/e.rs")] | length' "$LOG_FILE")" "has_trigger row never scored"
assert_equals "4" "$(jq -rs '[.[] | select(.ledger_generated == "2026-09-20T10:00:00Z")] | length' "$LOG_FILE")" "ledger_generated carried on every line"
assert_equals "4" "$(jq -rs '[.[] | select((.ceiling | length) <= 160)] | length' "$LOG_FILE")" "ceiling capped at 160 chars"
assert_equals "lib/c.sh lib/d.go src/a.py src/b.ts" "$(jq -rs '[.[] | .file] | sort | join(" ")' "$LOG_FILE")" "one line per no-trigger row file"
assert_contains "$(cat "$LOG_FILE")" '"confidence":0.9' "confidence recorded"
assert_equals "207" "$(jq -rs '.[].input_tokens' "$LOG_FILE" | sort -u)" "usage.input_tokens recorded"
assert_equals "1" "$(grep -c '^curl ' "$CURL_LOG")" "one batched curl call for 4 rows"
assert_not_contains "$ERR" "test-key-rot-123" "key value never on stderr"
SHA_AFTER=$(sha256sum "$LEDGER" | cut -d' ' -f1)
assert_equals "$SHA_BEFORE" "$SHA_AFTER" "ledger byte-identical after run"

log_step "CASE missing key: one skip line per row, exit 0, no API call"
reset_case
run_sh "$ROT" --ledger "$LEDGER"
assert_equals "0" "$RC" "missing key still exits 0 (shadow never blocks)"
assert_equals "" "$OUT" "stdout stays empty on missing key"
assert_equals "4" "$(grep -c 'skip' "$STDERR_FILE")" "four skip lines, one per no-trigger row"
assert_equals "0" "$(( $(wc -l < "$CURL_LOG") ))" "no curl call without a key"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(( $(wc -l < "$LOG_FILE") ))" "no lines appended without a key"

log_step "CASE API failure: non-blocking exit 0 with an error line"
reset_case
export TYPESAFE_API_KEY=test-key-rot-123
export JEV_CURL_RC=500
run_sh "$ROT" --ledger "$LEDGER"
assert_equals "0" "$RC" "API failure still exits 0 (shadow never blocks)"
assert_equals "" "$OUT" "stdout stays empty on API failure"
assert_contains "$ERR" "error" "error line on stderr"
assert_equals "1" "$(grep -c '^curl ' "$CURL_LOG")" "single attempted call on API failure"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(( $(wc -l < "$LOG_FILE") ))" "no lines appended on API failure"

log_step "CASE ledger with zero no-trigger rows: nothing to score"
reset_case
jq '.markers = [.markers[4]] | .total = 1 | .no_trigger = 0' "$LEDGER" > "$TEST_TMP/all-trigger.json"
export TYPESAFE_API_KEY=test-key-rot-123
run_sh "$ROT" --ledger "$TEST_TMP/all-trigger.json"
assert_equals "0" "$RC" "all-trigger ledger exits 0"
assert_equals "0" "$(( $(wc -l < "$CURL_LOG") ))" "no API call when nothing to score"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(( $(wc -l < "$LOG_FILE") ))" "no lines appended for all-trigger ledger"

log_step "CASE usage errors exit 64"
reset_case
run_sh "$ROT"
assert_equals "64" "$RC" "missing --ledger exits 64"
run_sh "$ROT" --ledger "$TEST_TMP/does-not-exist.json"
assert_equals "64" "$RC" "missing ledger file exits 64"

echo "test-jev-rot-risk: all cases passed"
