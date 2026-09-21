#!/usr/bin/env bash
# tests/test-jev-gap-bucket.sh
# Jev shadow pilot 11 (batch 2): alpha gap bucketing.
# Verifies .claude/skills/cfn-alpha-launch/jev-gap-bucket.sh:
#   one gap line per numbered fix-list item, section_now from the nearest
#   preceding header, fix-list.md byte-identical after the run, rerun on the
#   same mtime appends zero lines, missing API key logs a skip line and exits
#   0, a missing per-item answer logs an error line and logs the rest.
#
# curl is stubbed on PATH (test-jev-vote-triage.sh idiom): argv logged, rc via
# JEV_CURL_RC, response body served from JEV_CURL_BODY_FILE. The script under
# test is copied into a fake repo root so the key fallback never sees this
# repo's real settings.local.json, and the JSONL log is redirected to a temp
# dir via CFN_DATA_DIR. Fully offline; no network.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-alpha-launch"
SCRIPT_UNDER_TEST="$SKILL_DIR/jev-gap-bucket.sh"
TEST_TMP=$(mktemp -d -t jev-gap-bucket.XXXXXX)
CURL_LOG="$TEST_TMP/curl-calls.log"
FAKE_ROOT="$TEST_TMP/root"
FIXLIST="$TEST_TMP/fix-list.md"
STDOUT_FILE="$TEST_TMP/stdout.txt"
STDERR_FILE="$TEST_TMP/stderr.txt"
GAP_RC=0

cleanup() {
    rm -rf "$TEST_TMP"
}
trap cleanup EXIT

# Run a command capturing its stdout/stderr into the two named files and its
# rc into GAP_RC. assert_success cannot host the redirections: its own PASS
# line would land in the captured stdout file.
run_gap() {
    local out="$1" err="$2"
    shift 2
    set +e
    HOME="$FAKE_ROOT" "$@" >"$out" 2>"$err"
    GAP_RC=$?
    set -e
    return 0
}

# Stub curl: log argv, scripted rc via JEV_CURL_RC, body via JEV_CURL_BODY_FILE
# (mirrors curl --fail on error).
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

# Script under test must exist; copy into the fake repo root next to a copy of
# the shared systemone caller so relative resolution and the settings fallback
# stay inside the sandbox.
if [ ! -f "$SCRIPT_UNDER_TEST" ]; then
    log_error "FAIL: gap-bucket script not found: $SCRIPT_UNDER_TEST"
    exit 1
fi
mkdir -p "$FAKE_ROOT/.claude/cfn-scripts" "$FAKE_ROOT/.claude/skills/cfn-alpha-launch"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh" "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh"
# Shadow lib too: the script under test loads it from $HOME/.claude/cfn-scripts/.
if [ -f "$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh" ]; then
    cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh" "$FAKE_ROOT/.claude/cfn-scripts/"
fi
cp "$SCRIPT_UNDER_TEST" "$FAKE_ROOT/.claude/skills/cfn-alpha-launch/jev-gap-bucket.sh"
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh" \
         "$FAKE_ROOT/.claude/skills/cfn-alpha-launch/jev-gap-bucket.sh"
GAP="$FAKE_ROOT/.claude/skills/cfn-alpha-launch/jev-gap-bucket.sh"

assert_success "script parses (bash -n): $GAP" bash -n "$GAP"

# Fixture fix-list: 3 sections, 5 numbered items (the documented shape from
# execute.sh's analyze instructions).
cat > "$FIXLIST" <<'EOF'
# Alpha Launch Fix List

**Generated**: 2026-09-20
**Overall Readiness**: 72% (Target: 85%+)
**Regression**: None

## Critical (Blockers)
1. Auth bypass on expired tokens - Agent: security - File: src/auth.ts
2. Unscoped delete in cleanup job - Agent: backend - File: jobs/cleanup.ts

## High Priority (Before Launch)
3. Mixed naming in api client - Agent: consistency - File: lib/api.ts
4. Missing loading state on dashboard - Agent: frontend - File: app/dashboard.tsx

## Medium Priority (Post-Launch)
5. Inconsistent button radii - Agent: design - File: components/ui.tsx
EOF
cp "$FIXLIST" "$TEST_TMP/fix-list.before.md"
FIXLIST_MTIME=$(stat -c %Y "$FIXLIST")

# Stubbed systemone response: one choice per item, keyed by item number.
BODY_FILE="$TEST_TMP/body.json"
jq -cn '{answers: {"1": {choice: "critical", confidence: 0.9},
                   "2": {choice: "critical", confidence: 0.8},
                   "3": {choice: "high", confidence: 0.7},
                   "4": {choice: "high", confidence: 0.6},
                   "5": {choice: "medium", confidence: 0.5}},
        usage: {input_tokens: 123}}' > "$BODY_FILE"

# ---- Case 1: happy path, 5 items across 3 sections -------------------------
DATA_DIR="$TEST_TMP/data-1"
LOG_FILE="$DATA_DIR/jev-gap-bucket.jsonl"
export TYPESAFE_API_KEY="test-key-stub"
export CFN_DATA_DIR="$DATA_DIR"
export JEV_CURL_BODY_FILE="$BODY_FILE"
export JEV_CURL_RC=0

run_gap "$STDOUT_FILE" "$STDERR_FILE" bash "$GAP" --fixlist "$FIXLIST"
assert_equals "0" "$GAP_RC" "happy path exits 0"

assert_file_exists "$LOG_FILE" "log written"
line_count=$(( $(wc -l < "$LOG_FILE") ))
assert_equals "5" "$line_count" "one gap line per numbered item (5 items)"

# fix-list.md byte-identical: the shadow never edits what it reads.
assert_success "fix-list byte-identical after run" \
    cmp -s "$TEST_TMP/fix-list.before.md" "$FIXLIST"

# Per-item field assertions: bucket matches the stubbed answer, section_now is
# the nearest preceding header, mtime is the fixture's, confidence is numeric.
declare -a want_section=(
    ["1"]="Critical (Blockers)"
    ["2"]="Critical (Blockers)"
    ["3"]="High Priority (Before Launch)"
    ["4"]="High Priority (Before Launch)"
    ["5"]="Medium Priority (Post-Launch)"
)
declare -a want_bucket=(["1"]=critical ["2"]=critical ["3"]=high ["4"]=high ["5"]=medium)
for no in 1 2 3 4 5; do
    row=$(jq -c --argjson n "$no" \
        'select(.type == "gap" and .item_no == $n)' "$LOG_FILE")
    assert_not_empty "$row" "gap line exists for item $no"
    assert_equals "${want_bucket[$no]}" "$(printf '%s' "$row" | jq -r .jev_bucket)" \
        "item $no jev_bucket"
    assert_equals "${want_section[$no]}" "$(printf '%s' "$row" | jq -r .section_now)" \
        "item $no section_now"
    assert_equals "$FIXLIST_MTIME" "$(printf '%s' "$row" | jq -r .fixlist_mtime)" \
        "item $no fixlist_mtime"
    assert_equals "number" "$(printf '%s' "$row" | jq -r '.confidence | type')" \
        "item $no confidence is numeric"
    assert_not_empty "$(printf '%s' "$row" | jq -r .ts)" "item $no carries ts"
done

# Choices never on stdout (shadow chatter is stderr-only).
assert_equals "" "$(cat "$STDOUT_FILE")" "no stdout output (shadow only)"

# ---- Case 2: rerun same mtime appends 0 ------------------------------------
run_gap "$STDOUT_FILE" "$STDERR_FILE" bash "$GAP" --fixlist "$FIXLIST"
assert_equals "0" "$GAP_RC" "rerun exits 0"
line_count=$(( $(wc -l < "$LOG_FILE") ))
assert_equals "5" "$line_count" "rerun same mtime appends zero lines"
assert_contains "$(cat "$STDERR_FILE")" "skip" "skip note on stderr"

# ---- Case 3: missing answer for one item: error line, rest logged -----------
DATA_DIR="$TEST_TMP/data-3"
export CFN_DATA_DIR="$DATA_DIR"
PARTIAL_BODY="$TEST_TMP/body-partial.json"
jq -c 'del(.answers["3"])' "$BODY_FILE" > "$PARTIAL_BODY"
export JEV_CURL_BODY_FILE="$PARTIAL_BODY"
run_gap "$STDOUT_FILE" "$STDERR_FILE" bash "$GAP" --fixlist "$FIXLIST"
assert_equals "0" "$GAP_RC" "missing answer still exits 0"
line_count=$(( $(wc -l < "$DATA_DIR/jev-gap-bucket.jsonl") ))
assert_equals "4" "$line_count" "4 lines logged when one answer missing"
assert_contains "$(cat "$STDERR_FILE")" "no answer" "missing answer named on stderr"

# ---- Case 4: no API key: skip line, exit 0, no log --------------------------
DATA_DIR="$TEST_TMP/data-4"
export CFN_DATA_DIR="$DATA_DIR"
run_gap "$STDOUT_FILE" "$STDERR_FILE" \
    env -u TYPESAFE_API_KEY CFN_DATA_DIR="$DATA_DIR" JEV_CURL_BODY_FILE="$BODY_FILE" \
    bash "$GAP" --fixlist "$FIXLIST"
assert_equals "0" "$GAP_RC" "missing key exits 0"
if [ -f "$DATA_DIR/jev-gap-bucket.jsonl" ]; then
    line_count=$(( $(wc -l < "$DATA_DIR/jev-gap-bucket.jsonl") ))
else
    line_count=0
fi
assert_equals "0" "$line_count" "no lines logged without a key"
assert_contains "$(cat "$STDERR_FILE")" "TYPESAFE_API_KEY" "skip note names the key"

# ---- Case 5: API failure: error line, exit 0, no lines ----------------------
DATA_DIR="$TEST_TMP/data-5"
export CFN_DATA_DIR="$DATA_DIR"
run_gap "$STDOUT_FILE" "$STDERR_FILE" \
    env TYPESAFE_API_KEY="test-key-stub" CFN_DATA_DIR="$DATA_DIR" JEV_CURL_RC=500 \
    bash "$GAP" --fixlist "$FIXLIST"
assert_equals "0" "$GAP_RC" "API failure exits 0"
if [ -f "$DATA_DIR/jev-gap-bucket.jsonl" ]; then
    line_count=$(( $(wc -l < "$DATA_DIR/jev-gap-bucket.jsonl") ))
else
    line_count=0
fi
assert_equals "0" "$line_count" "no lines logged on API failure"
assert_contains "$(cat "$STDERR_FILE")" "error" "error note on stderr"

# ---- Case 6: zero items: nothing to do, exit 0 ------------------------------
DATA_DIR="$TEST_TMP/data-6"
EMPTY_LIST="$TEST_TMP/fix-list-empty.md"
printf '# Alpha Launch Fix List\n\nNo gaps found.\n' > "$EMPTY_LIST"
run_gap "$STDOUT_FILE" "$STDERR_FILE" \
    env TYPESAFE_API_KEY="test-key-stub" CFN_DATA_DIR="$DATA_DIR" JEV_CURL_RC=0 \
    bash "$GAP" --fixlist "$EMPTY_LIST"
assert_equals "0" "$GAP_RC" "zero items exits 0"
if [ -f "$DATA_DIR/jev-gap-bucket.jsonl" ]; then
    line_count=$(( $(wc -l < "$DATA_DIR/jev-gap-bucket.jsonl") ))
else
    line_count=0
fi
assert_equals "0" "$line_count" "no lines for a fix-list with no items"

# ---- Case 7: usage errors exit non-zero -------------------------------------
assert_failure "missing --fixlist is a usage error" \
    env TYPESAFE_API_KEY="test-key-stub" bash "$GAP"
assert_failure "nonexistent fixlist is a usage error" \
    env TYPESAFE_API_KEY="test-key-stub" bash "$GAP" --fixlist "$TEST_TMP/nope.md"

log_success "all gap-bucket cases passed"
exit 0
