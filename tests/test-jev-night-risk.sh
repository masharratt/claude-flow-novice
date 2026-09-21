#!/usr/bin/env bash
# tests/test-jev-night-risk.sh
# Jev night-mode risk shadow (batch 2, Phase 7). Verifies:
#   jev-night-risk.sh    one risk line per decision (score 0-2), idempotent on
#                        decision_id, non-blocking on key/API failure, choices
#                        never on stdout
#   night-mode.sh        render loop calls the scorer per item with
#                        `timeout 5 ... || true`; report text is byte-identical
#                        to a no-scorer render; sections and order unchanged
#
# curl is stubbed on PATH (fleet dashboard idiom per test-jev-vote-triage.sh):
# argv logged to JEV_CURL_LOG (the --data-binary body is visible in argv),
# rc via JEV_CURL_RC, response body served from JEV_CURL_BODY_FILE. The scorer
# runs from a fake repo root so the key fallback never sees this repo's real
# settings.local.json; the JSONL log is redirected via CFN_DATA_DIR. The
# night-mode render runs the real skill files (reverse symlinks put them at
# $HOME/.claude) with every state dir sandboxed. Fully offline; no network.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

NM="$PROJECT_ROOT/.claude/skills/cfn-night-mode/night-mode.sh"
TEST_TMP=$(mktemp -d -t jev-night-risk.XXXXXX)
CURL_LOG="$TEST_TMP/curl-calls.log"
FAKE_ROOT="$TEST_TMP/root"
DATA_DIR="$TEST_TMP/data"
LOG_FILE="$DATA_DIR/jev-night-risk.jsonl"
DB_PATH="$TEST_TMP/decisions.db"
NIGHT_DIR="$TEST_TMP/home"
SETTINGS_FILE="$TEST_TMP/settings.json"
REPO_NAME=$(basename "$PROJECT_ROOT")

cleanup() {
    chmod +x "$HOME/.claude/skills/cfn-night-mode/jev-night-risk.sh" 2>/dev/null || true
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

# Fake repo root: caller + shadow lib copies, scorer copied under test, so the
# settings fallback stays inside the sandbox for the unit cases.
mkdir -p "$FAKE_ROOT/.claude/cfn-scripts" "$FAKE_ROOT/.claude/skills/cfn-night-mode"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh" "$FAKE_ROOT/.claude/cfn-scripts/"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh" "$FAKE_ROOT/.claude/cfn-scripts/"
if [ ! -f "$PROJECT_ROOT/.claude/skills/cfn-night-mode/jev-night-risk.sh" ]; then
    log_error "FAIL: scorer script not found: $PROJECT_ROOT/.claude/skills/cfn-night-mode/jev-night-risk.sh"
    exit 1
fi
cp "$PROJECT_ROOT/.claude/skills/cfn-night-mode/jev-night-risk.sh" "$FAKE_ROOT/.claude/skills/cfn-night-mode/"
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/"*.sh "$FAKE_ROOT/.claude/skills/cfn-night-mode/jev-night-risk.sh"
SCORER="$FAKE_ROOT/.claude/skills/cfn-night-mode/jev-night-risk.sh"

assert_success "scorer parses (bash -n)" bash -n "$SCORER"
assert_success "night-mode.sh parses (bash -n)" bash -n "$NM"

# Fixture: one systemone response with a 0-2 score answer keyed by decision id.
BODY_FILE="$TEST_TMP/score-body.json"
printf '%s\n' '{"answers":{"D1":{"type":"score","score":2,"confidence":0.8,"probabilities":{}}},"usage":{"input_tokens":321}}' > "$BODY_FILE"
export JEV_CURL_BODY_FILE="$BODY_FILE"
export JEV_CURL_RC=0
export TYPESAFE_API_KEY=test-key-not-real
export CFN_DATA_DIR="$DATA_DIR"

n_log_lines() {
    [ -f "$LOG_FILE" ] && grep -c . "$LOG_FILE" || true
}
n_curl_calls() {
    [ -f "$CURL_LOG" ] && grep -c '^curl ' "$CURL_LOG" || true
}

echo "=== unit: jev-night-risk.sh ==="

# happy path: exit 0, one risk line with the full envelope, one API call
assert_success "happy path exits 0" \
    env -u JEV_MODEL bash "$SCORER" --title "Defer risky migration" --decision-id "D1" --slug "night-2026-09-20"
assert_equals "1" "$(n_log_lines)" "happy path appends exactly one log line"
LINE1=$(head -1 "$LOG_FILE")
assert_contains "$LINE1" '"type":"risk"' "line carries type=risk"
assert_contains "$LINE1" '"decision_id":"D1"' "line carries decision_id"
assert_contains "$LINE1" '"slug":"night-2026-09-20"' "line carries slug"
assert_contains "$LINE1" "\"project\":\"$REPO_NAME\"" "line carries project"
assert_contains "$LINE1" '"cwd":"' "line carries cwd"
assert_contains "$LINE1" '"score":2' "line carries the score answer"
assert_contains "$LINE1" '"confidence":0.8' "line carries the confidence"
assert_contains "$LINE1" '"input_tokens":321' "line carries usage input_tokens"
assert_equals "1" "$(n_curl_calls)" "happy path makes exactly one API call"
assert_contains "$(cat "$CURL_LOG")" '"type": "score"' "question payload is a score question"
assert_not_contains "$LINE1" "Defer risky migration" "report title text is not echoed into the log"

# idempotent on decision_id: no second line, no second API call
assert_success "rerun same decision_id exits 0" \
    bash "$SCORER" --title "Defer risky migration" --decision-id "D1" --slug "night-2026-09-20"
assert_equals "1" "$(n_log_lines)" "rerun appends no second line"
assert_equals "1" "$(n_curl_calls)" "rerun makes no second API call"

# missing key: skip, no line, no API call
SKIP_OUT=$(env -u TYPESAFE_API_KEY bash "$SCORER" --title "Another item" --decision-id "D2" --slug "night-2026-09-20" 2>&1)
assert_equals "0" "$?" "missing key exits 0"
assert_contains "$SKIP_OUT" "skip" "missing key reports a skip line"
assert_equals "1" "$(n_log_lines)" "missing key appends no log line"
assert_equals "1" "$(n_curl_calls)" "missing key makes no API call"

# API failure: exit 0, error line, no log line
JEV_CURL_RC=500 API_OUT=$(bash "$SCORER" --title "Another item" --decision-id "D3" --slug "night-2026-09-20" 2>&1)
assert_contains "$API_OUT" "error" "API failure reports an error line"
assert_equals "1" "$(n_log_lines)" "API failure appends no log line"

# response without an answer for the id: exit 0, error line, no log line
printf '%s\n' '{"answers":{},"usage":{"input_tokens":10}}' > "$BODY_FILE"
NOANS_OUT=$(bash "$SCORER" --title "Another item" --decision-id "D4" --slug "night-2026-09-20" 2>&1)
assert_contains "$NOANS_OUT" "error" "missing answer reports an error line"
assert_equals "1" "$(n_log_lines)" "missing answer appends no log line"

# usage errors: exit 64
assert_failure "missing --slug exits 64" bash "$SCORER" --title "t" --decision-id "D5"
assert_failure "missing --decision-id exits 64" bash "$SCORER" --title "t" --slug "s"
assert_failure "missing --title exits 64" bash "$SCORER" --decision-id "D5" --slug "s"

echo "=== wiring: night-mode.sh render loop ==="

# fixture decisions DB: one blocking proposed row + one accepted row, distinct
# slugs for two days so the slug column reaches the scorer call
NIGHT_HOME="$NIGHT_DIR"; mkdir -p "$NIGHT_HOME"
sqlite3 "$DB_PATH" < "$HOME/.claude/skills/decision-log/schema.sql"
sqlite3 "$DB_PATH" <<'SQL'
INSERT INTO decisions (project, slug, decision_id, title, chosen, status, blocking, timestamp)
VALUES ('nmtest', 'night-2026-09-19', 'D1', 'Defer risky migration', 'DEFERRED: risky migration tonight', 'proposed', 1, '2026-09-19T03:00:00Z');
INSERT INTO decisions (project, slug, decision_id, title, chosen, status, blocking, timestamp)
VALUES ('nmtest', 'night-2026-09-19', 'D2', 'ORM pick', 'Drizzle on the existing pool', 'accepted', 0, '2026-09-19T04:00:00Z');
SQL

export CFN_NIGHT_MODE_DIR="$NIGHT_DIR"
export CFN_NIGHT_SETTINGS="$SETTINGS_FILE"
export DB_PATH
WIRE_DATA="$TEST_TMP/wire-data"
mkdir -p "$WIRE_DATA"

run_render() {
    env CFN_DATA_DIR="$WIRE_DATA" bash "$NM" report --since 2026-09-19 2>/dev/null
}

# restore the full-answer body for the render, scorer present and executable
printf '%s\n' '{"answers":{"D1":{"type":"score","score":2,"confidence":0.8,"probabilities":{}},"D2":{"type":"score","score":0,"confidence":0.9,"probabilities":{}}},"usage":{"input_tokens":99}}' > "$BODY_FILE"

WIRE_OUT=$(run_render); WIRE_RC=$?
{ [ "$WIRE_RC" = "0" ] && echo "$WIRE_OUT" | grep -q "NEEDS ACTION" \
    && echo "$WIRE_OUT" | grep -q "Defer risky migration" \
    && echo "$WIRE_OUT" | grep -q "ORM pick"; } \
    && ok "render with scorer present exits 0, sections intact" \
    || no "render with scorer (rc=$WIRE_RC out=$WIRE_OUT)"

WIRE_LOG="$WIRE_DATA/jev-night-risk.jsonl"
WIRE_LINES=$( [ -f "$WIRE_LOG" ] && grep -c . "$WIRE_LOG" || true )
assert_equals "2" "$WIRE_LINES" "render logs one risk line per rendered item"
if [ -f "$WIRE_LOG" ]; then
    L1=$(jq -r 'select(.decision_id == "D1") | "\(.type)|\(.slug)|\(.score)|\(.project)"' "$WIRE_LOG" | head -1)
    assert_equals "risk|night-2026-09-19|2|$REPO_NAME" "$L1" "D1 line: type/slug/score/project"
    assert_contains "$(cat "$WIRE_LOG")" '"decision_id":"D2"' "D2 also scored"
else
    no "wire log missing (expected $WIRE_LOG)"
fi

# report text byte-identical to a no-scorer render (generated timestamp masked)
RPT_A="$TEST_TMP/report-a.txt"
RPT_B="$TEST_TMP/report-b.txt"
mask_generated() { sed 's/generated: .*/generated: X/' "$1"; }
printf '%s\n' '{"answers":{"D1":{"type":"score","score":2,"confidence":0.8,"probabilities":{}},"D2":{"type":"score","score":0,"confidence":0.9,"probabilities":{}}},"usage":{"input_tokens":99}}' > "$BODY_FILE"
run_render > "$RPT_A"
chmod -x "$HOME/.claude/skills/cfn-night-mode/jev-night-risk.sh"
run_render > "$RPT_B"
chmod +x "$HOME/.claude/skills/cfn-night-mode/jev-night-risk.sh"
assert_equals "$(mask_generated "$RPT_A")" "$(mask_generated "$RPT_B")" \
    "report text byte-identical with and without the scorer (generated ts masked)"

# wiring shape: exactly one insertion, the plan row-3 shape
WIRE_GREP=$(grep -c 'jev-night-risk\.sh' "$NM" || true)
assert_equals "1" "$WIRE_GREP" "night-mode.sh references the scorer exactly once"
assert_contains "$(grep 'jev-night-risk' "$NM")" "timeout 5" "insertion bounded by timeout 5"
assert_contains "$(grep 'jev-night-risk' "$NM")" '--decision-id "$did"' "insertion passes the decision id"
assert_contains "$(grep 'jev-night-risk' "$NM")" '--slug "$slug"' "insertion passes the slug"
assert_contains "$(grep 'jev-night-risk' "$NM")" '--title "$title"' "insertion passes the title"
assert_contains "$(grep 'jev-night-risk' "$NM")" '|| true' "insertion is fire-and-forget (|| true)"

print_test_summary
