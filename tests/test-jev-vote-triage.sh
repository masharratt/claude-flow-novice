#!/usr/bin/env bash
# tests/test-jev-vote-triage.sh
# Phase CI :: Jev vote-triage shadow mode (Jev vote-triage shadow pilot, Phase 2)
# Verifies the three shadow scripts under cfn-vote-implement:
#   jev-triage.sh        appends one triage line per suggestion, idempotent,
#                        non-blocking on key/API failure, choices never on stdout
#   jev-shadow-record.sh appends tally and final lines joinable by
#                        (manifest, suggestion_id)
#   jev-shadow-report.sh joins triage+tally+final, names mismatches, exits
#                        0 all-agree / 1 mismatches / 2 zero joined rows
#
# curl is stubbed on PATH (fleet dashboard idiom, extended with a body file):
# argv logged, rc via JEV_CURL_RC, response body served from JEV_CURL_BODY_FILE.
# Scripts are copied into a fake repo root so the key fallback never sees this
# repo's real settings.local.json, and the JSONL log is redirected to a temp
# dir via CFN_DATA_DIR. Fully offline; no network.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-vote-implement"
TEST_TMP=$(mktemp -d -t jev-vote-triage.XXXXXX)
CURL_LOG="$TEST_TMP/curl-calls.log"
STDERR_FILE="$TEST_TMP/stderr.txt"
STDOUT_FILE="$TEST_TMP/stdout.txt"
FAKE_ROOT="$TEST_TMP/root"
DATA_DIR="$TEST_TMP/data"
LOG_FILE="$DATA_DIR/jev-vote-triage.jsonl"
MANIFEST="$TEST_TMP/manifest-dry-review-20260920T100000Z.json"

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

# Fake repo root: cfn-scripts caller plus the three scripts under test, copied
# so relative resolution and the settings fallback stay inside the sandbox.
mkdir -p "$FAKE_ROOT/.claude/cfn-scripts" "$FAKE_ROOT/.claude/skills/cfn-vote-implement"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh" "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh"
for s in jev-triage.sh jev-shadow-record.sh jev-shadow-report.sh; do
    if [ ! -f "$SKILL_DIR/$s" ]; then
        log_error "FAIL: shadow script not found: $SKILL_DIR/$s"
        exit 1
    fi
    cp "$SKILL_DIR/$s" "$FAKE_ROOT/.claude/skills/cfn-vote-implement/$s"
done
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/jev-systemone.sh" \
         "$FAKE_ROOT/.claude/skills/cfn-vote-implement/"*.sh
TRIAGE="$FAKE_ROOT/.claude/skills/cfn-vote-implement/jev-triage.sh"
RECORD="$FAKE_ROOT/.claude/skills/cfn-vote-implement/jev-shadow-record.sh"
REPORT="$FAKE_ROOT/.claude/skills/cfn-vote-implement/jev-shadow-report.sh"

for s in "$TRIAGE" "$RECORD" "$REPORT"; do
    assert_success "script parses (bash -n): $s" bash -n "$s"
done

# Fixture manifest: workbench dry-review shape, 3 suggestions, top-level context.
cat > "$MANIFEST" <<'EOF'
{
  "review_id": "shadow-fixture-1",
  "source": "cfn-dry-review",
  "generated_at": "2026-09-20T10:00:00Z",
  "status": "completed",
  "context": "Shadow triage fixture: three review suggestions from a dry review.",
  "comparisons": [],
  "suggestions": [
    {
      "id": "S001",
      "category": "correctness",
      "tag": "bug",
      "one_liner": "Null deref in render path",
      "title": "Null deref in render.sh",
      "description": "Pointer may be null when fixtures are missing.",
      "files": ["render.sh"],
      "impact": "high",
      "effort": "low",
      "suggested_approach": "Add null guard.",
      "status": "open"
    },
    {
      "id": "S002",
      "category": "style",
      "tag": "naming",
      "one_liner": "Rename ambiguous helper",
      "title": "Unclear helper name",
      "description": "Helper name does not say what it returns.",
      "files": ["lib/util.sh"],
      "impact": "low",
      "effort": "low",
      "suggested_approach": "Rename the helper.",
      "status": "open"
    },
    {
      "id": "S003",
      "category": "tech-debt",
      "tag": "cfn-marker",
      "one_liner": "Split god file",
      "title": "util.sh does too much",
      "description": "File mixes auth and billing concerns in one place.",
      "files": ["lib/util.sh"],
      "impact": "medium",
      "effort": "high",
      "suggested_approach": "Split by responsibility.",
      "status": "open"
    }
  ]
}
EOF

# Stub response body: one answer per suggestion id.
STUB_BODY="$TEST_TMP/stub-body.json"
cat > "$STUB_BODY" <<'EOF'
{"answers":{"S001":{"choice":"implement_now","confidence":0.92,"probabilities":{"implement_now":0.92,"needs_panel":0.06,"reject":0.02}},"S002":{"choice":"needs_panel","confidence":0.81,"probabilities":{"implement_now":0.1,"needs_panel":0.81,"reject":0.09}},"S003":{"choice":"reject","confidence":0.66,"probabilities":{"implement_now":0.05,"needs_panel":0.29,"reject":0.66}}},"usage":{"input_tokens":141}}
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

log_step "GIVEN the Jev vote-triage shadow scripts"

log_step "CASE triage happy path: 3 suggestions, one batched call, 3 triage lines"
reset_case
export TYPESAFE_API_KEY=test-key-triage-123
export JEV_CURL_BODY_FILE="$STUB_BODY"
run_sh "$TRIAGE" --manifest "$MANIFEST"
assert_equals "0" "$RC" "triage exits 0"
assert_equals "" "$OUT" "triage stdout stays empty (choices never on stdout)"
if [ ! -f "$LOG_FILE" ] || [ "$(( $(wc -l < "$LOG_FILE") ))" != "3" ]; then
    printf 'triage stderr:\n%s\ncurl log:\n%s\n---\n' \
        "$ERR" "$(cat "$CURL_LOG" 2>/dev/null)" >&2
fi
assert_equals "3" "$(( $(wc -l < "$LOG_FILE") ))" "three triage lines appended"
assert_equals "3" "$(jq -rs '[.[] | select(.type=="triage")] | length' "$LOG_FILE")" "all lines are triage type"
assert_equals "1" "$(grep -c '^curl ' "$CURL_LOG")" "one batched curl call for 3 suggestions"
assert_equals "implement_now needs_panel reject" "$(jq -rs '[.[] | select(.type=="triage") | .choice] | sort | join(" ")' "$LOG_FILE")" "choices land in the log within the option set"
assert_equals "S001 S002 S003" "$(jq -rs '[.[] | select(.type=="triage") | .suggestion_id] | sort | join(" ")' "$LOG_FILE")" "one line per suggestion id"
assert_equals "manifest-dry-review-20260920T100000Z.json" "$(jq -rs '.[].manifest' "$LOG_FILE" | sort -u)" "manifest field is the basename"
assert_equals "141" "$(jq -rs '.[].input_tokens' "$LOG_FILE" | sort -u)" "usage.input_tokens recorded"
assert_contains "$(cat "$LOG_FILE")" '"confidence":0.92' "confidence recorded"
assert_not_contains "$ERR" "test-key-triage-123" "key value never on stderr"
assert_not_contains "$OUT" "implement_now" "no choice text on stdout"

log_step "CASE triage idempotent re-run: same manifest appends 0 lines"
: > "$CURL_LOG"
export TYPESAFE_API_KEY=test-key-triage-123
export JEV_CURL_BODY_FILE="$STUB_BODY"
run_sh "$TRIAGE" --manifest "$MANIFEST"
assert_equals "0" "$RC" "re-run exits 0"
assert_equals "3" "$(( $(wc -l < "$LOG_FILE") ))" "no lines appended on re-run"
assert_equals "0" "$(grep -c '^curl ' "$CURL_LOG")" "no API call when everything is already triaged"

log_step "CASE triage key missing: non-blocking exit 0 with a skip line"
reset_case
run_sh "$TRIAGE" --manifest "$MANIFEST"
assert_equals "0" "$RC" "missing key still exits 0 (shadow never blocks)"
assert_equals "" "$OUT" "stdout stays empty on missing key"
assert_contains "$ERR" "skip" "skip line on stderr"
assert_equals "0" "$(( $(wc -l < "$CURL_LOG") ))" "no curl call without a key"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(( $(wc -l < "$LOG_FILE") ))" "no lines appended without a key"

log_step "CASE triage API failure: non-blocking exit 0 with an error line"
reset_case
export TYPESAFE_API_KEY=test-key-triage-123
export JEV_CURL_RC=500
run_sh "$TRIAGE" --manifest "$MANIFEST"
assert_equals "0" "$RC" "API failure still exits 0 (shadow never blocks)"
assert_equals "" "$OUT" "stdout stays empty on API failure"
assert_contains "$ERR" "error" "error line on stderr"
[ ! -f "$LOG_FILE" ] || assert_equals "0" "$(( $(wc -l < "$LOG_FILE") ))" "no triage lines on API failure"

log_step "CASE happy path setup for record and report: fresh triage"
reset_case
export TYPESAFE_API_KEY=test-key-triage-123
export JEV_CURL_BODY_FILE="$STUB_BODY"
run_sh "$TRIAGE" --manifest "$MANIFEST"
assert_equals "0" "$RC" "triage for record scenario exits 0"

log_step "CASE tally record: tallies append joinable lines"
run_sh "$RECORD" --manifest "$MANIFEST" --tallies '{"S001":"3-yes","S002":"2-yes","S003":"1-yes"}'
assert_equals "0" "$RC" "tally record exits 0"
assert_equals "3" "$(jq -rs '[.[] | select(.type=="tally")] | length' "$LOG_FILE")" "three tally lines"
assert_equals "1-yes 2-yes 3-yes" "$(jq -rs '[.[] | select(.type=="tally") | .tally] | sort | join(" ")' "$LOG_FILE")" "tally values recorded"
assert_equals "3" "$(jq -rs '[.[] | select(.type=="tally" and .manifest=="manifest-dry-review-20260920T100000Z.json" and (.suggestion_id=="S001" or .suggestion_id=="S002" or .suggestion_id=="S003"))] | length' "$LOG_FILE")" "tally lines join 1:1 to triage lines on (manifest, suggestion_id)"

log_step "CASE final record: finals append joinable lines with one seeded mismatch (S003)"
run_sh "$RECORD" --manifest "$MANIFEST" --finals '{"S001":"implemented","S002":"implemented","S003":"implemented"}'
assert_equals "0" "$RC" "final record exits 0"
assert_equals "3" "$(jq -rs '[.[] | select(.type=="final")] | length' "$LOG_FILE")" "three final lines"
assert_equals "3" "$(jq -rs '[.[] | select(.type=="final" and .manifest=="manifest-dry-review-20260920T100000Z.json" and (.suggestion_id=="S001" or .suggestion_id=="S002" or .suggestion_id=="S003"))] | length' "$LOG_FILE")" "final lines join 1:1 to triage lines on (manifest, suggestion_id)"

log_step "CASE report join: named mismatch for S003, exit 1"
run_sh "$REPORT" --manifest "$MANIFEST"
assert_equals "1" "$RC" "report exits 1 on a named mismatch"
assert_contains "$OUT" "joined_rows: 3" "joined-rows population size printed"
assert_contains "$OUT" "agreements: 2" "agreement count printed"
assert_contains "$OUT" "S003" "mismatch names the suggestion id"
assert_contains "$OUT" "jev=reject" "mismatch names the jev choice"
assert_contains "$OUT" "tally=1-yes" "mismatch names the panel tally"
assert_contains "$OUT" "final=implemented" "mismatch names the panel final"

log_step "CASE report all agree: exit 0"
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"
export TYPESAFE_API_KEY=test-key-triage-123
export JEV_CURL_BODY_FILE="$STUB_BODY"
run_sh "$TRIAGE" --manifest "$MANIFEST"
assert_equals "0" "$RC" "triage for all-agree scenario exits 0"
run_sh "$RECORD" --manifest "$MANIFEST" --tallies '{"S001":"3-yes","S002":"2-yes","S003":"1-yes"}'
assert_equals "0" "$RC" "tally record for all-agree scenario exits 0"
run_sh "$RECORD" --manifest "$MANIFEST" --finals '{"S001":"implemented","S002":"skipped","S003":"rejected"}'
assert_equals "0" "$RC" "final record for all-agree scenario exits 0"
run_sh "$REPORT" --manifest "$MANIFEST"
assert_equals "0" "$RC" "report exits 0 when every joined row agrees"
assert_contains "$OUT" "joined_rows: 3" "all-agree population size printed"
assert_contains "$OUT" "agreements: 3" "all-agree agreement count printed"

log_step "CASE report zero joined rows: exit 2 and a rendered certified-nothing line"
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"
run_sh "$REPORT" --manifest "$MANIFEST"
assert_equals "2" "$RC" "zero joined rows exit 2 (distinct from mismatches)"
assert_contains "$OUT" "certified nothing (0 joined rows)" "zero-rows line names that it certified nothing"

print_test_summary
