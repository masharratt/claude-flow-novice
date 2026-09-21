#!/usr/bin/env bash
# tests/test-jev-shadow-lib.sh
# Phase CI :: Jev shadow shared lib + generic summarizer (Jev batch 2, Phase 1)
# Verifies .claude/cfn-scripts/jev-shadow-lib.sh:
#   jev_append_line  single-line append under flock, parent dirs created,
#                    parallel writers never interleave or lose lines
#   jev_status       stderr only, stdout stays empty
#   jev_envelope     {type,ts,project,cwd} base fields plus entity key-values
# and .claude/cfn-scripts/jev-shadow-summary.sh:
#   per-project x verdict counts, skip/error counts, total rows; bare --log
#   names resolve under CFN_DATA_DIR; exit 0 rows only / 1 errors present /
#   2 zero data rows with a rendered certified-nothing line.
# Fully offline: no network, no API key. The lib and summarizer are copied
# into a fake repo root so the test exercises the shipped files through the
# same relative layout production uses.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

LIB_SRC="$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh"
SUMMARY_SRC="$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-summary.sh"
TEST_TMP=$(mktemp -d -t jev-shadow-lib.XXXXXX)
FAKE_ROOT="$TEST_TMP/root"
DATA_DIR="$TEST_TMP/data"
mkdir -p "$DATA_DIR" "$FAKE_ROOT/.claude/cfn-scripts"

cleanup() {
    rm -rf "$TEST_TMP"
}
trap cleanup EXIT

for src in "$LIB_SRC" "$SUMMARY_SRC"; do
    if [ ! -f "$src" ]; then
        log_error "FAIL: required file not found: $src"
        exit 1
    fi
    cp "$src" "$FAKE_ROOT/.claude/cfn-scripts/$(basename "$src")"
done
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/"*.sh
LIB="$FAKE_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh"
SUMMARY="$FAKE_ROOT/.claude/cfn-scripts/jev-shadow-summary.sh"

for s in "$LIB" "$SUMMARY"; do
    assert_success "script parses (bash -n): $s" bash -n "$s"
done

export CFN_DATA_DIR="$DATA_DIR"

log_step "GIVEN the shared Jev shadow lib"

log_step "CASE lib sources cleanly and exposes the three functions"
# shellcheck source=/dev/null
source "$LIB"
assert_not_empty "$(declare -F jev_append_line)" "jev_append_line defined"
assert_not_empty "$(declare -F jev_status)" "jev_status defined"
assert_not_empty "$(declare -F jev_envelope)" "jev_envelope defined"

log_step "CASE jev_append_line: one JSON line per call under CFN_DATA_DIR"
LOG1="$DATA_DIR/jev-append-test.jsonl"
jev_append_line "$LOG1" '{"n":1}'
jev_append_line "$LOG1" '{"n":2}'
assert_equals "2" "$(wc -l < "$LOG1")" "two appends produce two lines"
assert_equals "2" "$(jq -s 'length' "$LOG1")" "every appended line is valid JSON"
assert_equals "1 2" "$(jq -rs '[.[].n] | join(" ")' "$LOG1")" "lines keep order and content"

log_step "CASE jev_append_line: missing parent dirs are created"
LOG_DEEP="$DATA_DIR/nested/dir/jev-deep.jsonl"
jev_append_line "$LOG_DEEP" '{"n":3}'
assert_equals "1" "$(wc -l < "$LOG_DEEP")" "append into a new directory creates it"

log_step "CASE jev_append_line: 20 parallel writers produce 20 intact lines"
LOG2="$DATA_DIR/jev-parallel-test.jsonl"
for i in $(seq 1 20); do
    jev_append_line "$LOG2" "{\"w\":$i}" &
done
wait
assert_equals "20" "$(wc -l < "$LOG2")" "20 parallel appends produce 20 lines"
assert_equals "20" "$(jq -s 'length' "$LOG2")" "no interleaved or lost lines under flock"
assert_equals "210" "$(jq -s '[.[].w] | add' "$LOG2")" "all 20 payloads intact (sum 1..20)"

log_step "CASE jev_status: message lands on stderr, stdout stays empty"
STATUS_ERR="$TEST_TMP/status-err.txt"
STATUS_OUT=$(jev_status "jev-test: status line here" 2>"$STATUS_ERR")
assert_equals "" "$STATUS_OUT" "jev_status writes nothing to stdout"
assert_equals "jev-test: status line here" "$(cat "$STATUS_ERR")" "jev_status writes the message to stderr"

log_step "CASE jev_envelope: base fields only"
mkdir -p "$FAKE_ROOT/proj-a"
ENV_BASE=$(cd "$FAKE_ROOT/proj-a" && jev_envelope triage)
assert_equals "triage" "$(jq -r '.type' <<<"$ENV_BASE")" "type field set"
TS_VAL=$(jq -r '.ts' <<<"$ENV_BASE")
assert_success "ts is ISO-8601 UTC" bash -c '[[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]' _ "$TS_VAL"
assert_equals "proj-a" "$(jq -r '.project' <<<"$ENV_BASE")" "project falls back to cwd basename outside a git repo"
assert_equals "$FAKE_ROOT/proj-a" "$(jq -r '.cwd' <<<"$ENV_BASE")" "cwd field is the caller cwd"
assert_equals "1" "$(wc -l <<<"$ENV_BASE" | tr -d ' ')" "envelope output is one line"

log_step "CASE jev_envelope: string and raw-JSON entity keys"
ENV_FULL=$(cd "$FAKE_ROOT/proj-a" && jev_envelope triage manifest=m-001.json suggestion_id=S001 choice=needs_panel confidence:=0.92 input_tokens:=141)
assert_equals "m-001.json" "$(jq -r '.manifest' <<<"$ENV_FULL")" "string entity key carried"
assert_equals "S001" "$(jq -r '.suggestion_id' <<<"$ENV_FULL")" "id entity key carried"
assert_equals "needs_panel" "$(jq -r '.choice' <<<"$ENV_FULL")" "choice entity key carried"
assert_equals "0.92" "$(jq -r '.confidence' <<<"$ENV_FULL")" "numeric entity key stays a number"
assert_equals "141" "$(jq -r '.input_tokens' <<<"$ENV_FULL")" "token count stays a number"
assert_equals "9" "$(jq 'keys | length' <<<"$ENV_FULL")" "4 base fields plus 5 entity keys"

log_step "CASE jev_envelope: pair without = is a usage error"
ENV_BAD=$(cd "$FAKE_ROOT/proj-a" && jev_envelope triage nopair 2>/dev/null) && ENV_BAD_RC=0 || ENV_BAD_RC=$?
assert_equals "" "$ENV_BAD" "bad pair produces no output"
assert_equals "64" "$ENV_BAD_RC" "bad pair exits 64"

log_step "GIVEN the generic shadow summarizer"

SUM_OUT="$TEST_TMP/sum-out.txt"
SUM_ERR="$TEST_TMP/sum-err.txt"
run_sum() {
    SUM_RC=0
    CFN_DATA_DIR="$DATA_DIR" "$SUMMARY" "$@" >"$SUM_OUT" 2>"$SUM_ERR" || SUM_RC=$?
    SUM_OUT_TEXT=$(cat "$SUM_OUT")
    SUM_ERR_TEXT=$(cat "$SUM_ERR")
}

log_step "CASE usage: missing --log exits 64"
run_sum
assert_equals "64" "$SUM_RC" "missing --log is a usage error"

FIXTURE="$DATA_DIR/jev-fixture.jsonl"
cat > "$FIXTURE" <<'EOF'
{"type":"triage","ts":"2026-09-20T10:00:00Z","project":"proj-a","cwd":"/x/proj-a","manifest":"m.json","suggestion_id":"S001","choice":"implement_now","confidence":0.92,"input_tokens":141}
{"type":"triage","ts":"2026-09-20T10:01:00Z","project":"proj-a","cwd":"/x/proj-a","manifest":"m.json","suggestion_id":"S002","choice":"needs_panel","confidence":0.81,"input_tokens":141}
{"type":"triage","ts":"2026-09-20T10:02:00Z","project":"proj-b","cwd":"/y/proj-b","manifest":"m.json","suggestion_id":"S001","choice":"implement_now","confidence":0.7,"input_tokens":100}
{"type":"final","ts":"2026-09-20T10:03:00Z","project":"proj-b","cwd":"/y/proj-b","manifest":"m.json","suggestion_id":"S001","status":"implemented"}
{"type":"shrink","ts":"2026-09-20T10:04:00Z","project":"proj-b","cwd":"/y/proj-b","run_id":"r1","jev_verdict":"specific_flake","confidence":0.6}
{"type":"skip","ts":"2026-09-20T10:05:00Z","project":"proj-c","cwd":"/z/proj-c","reason":"no TYPESAFE_API_KEY"}
EOF

log_step "CASE summarizer: per-project verdict counts over a healthy fixture (exit 0)"
run_sum --log "$FIXTURE"
assert_equals "0" "$SUM_RC" "summarizer exits 0 on a healthy log"
assert_contains "$SUM_OUT_TEXT" "rows: 5" "total counts data rows, skip line excluded"
assert_contains "$SUM_OUT_TEXT" "skip: 1" "skip line counted as a skip"
assert_contains "$SUM_OUT_TEXT" "error: 0" "no error lines reported on a healthy log"
assert_contains "$SUM_OUT_TEXT" "proj-a" "project a named in the table"
assert_contains "$SUM_OUT_TEXT" "proj-b" "project b named in the table"
assert_contains "$SUM_OUT_TEXT" "implement_now" "choice verdicts named"
assert_contains "$SUM_OUT_TEXT" "specific_flake" "jev_verdict values named"
assert_contains "$SUM_OUT_TEXT" "implemented" "status-style verdicts named"
assert_not_contains "$SUM_OUT_TEXT" "proj-c" "skip-only project stays out of the verdict table"

log_step "CASE summarizer: bare --log name resolves under CFN_DATA_DIR"
run_sum --log jev-fixture.jsonl
assert_equals "0" "$SUM_RC" "bare log name resolves and exits 0"
assert_contains "$SUM_OUT_TEXT" "rows: 5" "bare-name run renders the same table"

log_step "CASE summarizer: error line present -> exit 1 with the table still rendered"
FIXTURE_ERR="$DATA_DIR/jev-fixture-err.jsonl"
cp "$FIXTURE" "$FIXTURE_ERR"
printf '%s\n' '{"type":"error","ts":"2026-09-20T10:06:00Z","project":"proj-a","stage":"api","message":"curl rc 28"}' >> "$FIXTURE_ERR"
run_sum --log "$FIXTURE_ERR"
assert_equals "1" "$SUM_RC" "errors present exit 1"
assert_contains "$SUM_OUT_TEXT" "error: 1" "error count rendered"
assert_contains "$SUM_OUT_TEXT" "rows: 5" "data rows still counted alongside the error"

log_step "CASE summarizer: unparseable line counts as an error, never as certified nothing"
printf 'not json at all\n' > "$DATA_DIR/jev-corrupt.jsonl"
run_sum --log jev-corrupt.jsonl
assert_equals "1" "$SUM_RC" "unparseable log exits 1, not 2"
assert_contains "$SUM_ERR_TEXT" "unparseable" "parse failure named on stderr"

log_step "CASE summarizer: empty log -> exit 2 with a rendered certified-nothing line"
: > "$DATA_DIR/jev-empty.jsonl"
run_sum --log jev-empty.jsonl
assert_equals "2" "$SUM_RC" "empty log exits 2"
assert_contains "$SUM_OUT_TEXT" "certified nothing (0 rows)" "rendered certified-nothing line"

log_step "CASE summarizer: missing log file behaves like an empty log (exit 2)"
run_sum --log jev-absent.jsonl
assert_equals "2" "$SUM_RC" "missing log exits 2"
assert_contains "$SUM_OUT_TEXT" "certified nothing (0 rows)" "missing log renders the certified-nothing line"

print_test_summary
