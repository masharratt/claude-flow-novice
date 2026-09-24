#!/usr/bin/env bash
# Tests for the decision capture hook (PostToolUse AskUserQuestion) and
# cfn-decisions/promote-capture.sh.
#
# The hook must be failure-proof (exit 0 always) and append one JSONL line per
# answered question. Promotion must move lines into record.sh and shrink
# staging only for lines whose ledger write succeeded.
#
# Run: bash tests/test-decision-capture.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$REPO_ROOT/.claude/hooks/cfn-decision-capture.sh"
PROMOTE="$REPO_ROOT/.claude/skills/cfn-decisions/promote-capture.sh"
RECORD="$REPO_ROOT/.claude/skills/cfn-decisions/record.sh"

PASS=0
FAIL=0
ok()   { PASS=$((PASS + 1)); echo "ok: $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }
assert_contains() { # haystack-file needle label  (pure bash; no grep -q pipe)
  local hay needle label
  hay="$(cat "$1" 2>/dev/null)"; needle="$2"; label="$3"
  case "$hay" in *"$needle"*) ok "$label" ;; *) bad "$label (missing: $needle)" ;; esac
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STAGING="$TMP/staging.jsonl"

sample_input() { # $1 = question text, $2 = answer label
  cat <<EOF
{"session_id":"sess-test","cwd":"/home/x/someproj","tool_name":"AskUserQuestion",
 "tool_input":{"questions":[{"question":"$1","header":"Scope","options":[]}]},
 "tool_response":{"answers":{"$1":"$2"},"annotations":{}}}
EOF
}

echo "== capture hook =="

# 1. Valid input -> one JSONL line with the expected fields.
rm -f "$STAGING"
printf '%s' "$(sample_input "Use RLS on events table?" "Delete all 20")" \
  | CFN_DECISION_CAPTURE_FILE="$STAGING" bash "$HOOK"
rc=$?
[ "$rc" = 0 ] && ok "hook exits 0 on valid input" || bad "hook exit=$rc on valid input"
[ "$(wc -l < "$STAGING" 2>/dev/null || echo 0)" = 1 ] && ok "one staging line written" || bad "staging line count != 1"
assert_contains "$STAGING" '"question":"Use RLS on events table?"' "question captured"
assert_contains "$STAGING" '"answer":"Delete all 20"' "answer captured"
assert_contains "$STAGING" '"project":"someproj"' "project derived from cwd"
assert_contains "$STAGING" '"session_id":"sess-test"' "session id captured"

# 2. Two questions in one call -> two lines.
rm -f "$STAGING"
printf '%s' '{"session_id":"s","cwd":"/p/q","tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Q one?"},{"question":"Q two?"}]},"tool_response":{"answers":{"Q one?":"A1","Q two?":"A2"},"annotations":{}}}' \
  | CFN_DECISION_CAPTURE_FILE="$STAGING" bash "$HOOK"
[ "$(wc -l < "$STAGING" 2>/dev/null || echo 0)" = 2 ] && ok "two questions -> two lines" || bad "expected 2 lines"

# 3. Non-AskUserQuestion tool -> no write, exit 0.
rm -f "$STAGING"
printf '%s' '{"tool_name":"Bash","tool_input":{},"tool_response":{}}' \
  | CFN_DECISION_CAPTURE_FILE="$STAGING" bash "$HOOK"
[ ! -e "$STAGING" ] && ok "non-AskUserQuestion ignored" || bad "staging created for non-AskUserQuestion"

# 4. Malformed JSON -> exit 0, no crash output that could block the tool call.
rm -f "$STAGING"
errout="$(printf 'not json at all' | CFN_DECISION_CAPTURE_FILE="$STAGING" bash "$HOOK" 2>&1)"
rc=$?
[ "$rc" = 0 ] && [ -z "$errout" ] && ok "malformed stdin -> silent exit 0" || bad "malformed stdin rc=$rc out=$errout"

# 5. Missing jq -> exit 0 (jq absence must never block a prompt).
#    Empty PATH dir: jq unfindable, hook must bail at its jq guard.
rm -f "$STAGING"
mkdir -p "$TMP/emptybin"
printf '%s' "$(sample_input "Q?" "A")" \
  | CFN_DECISION_CAPTURE_FILE="$STAGING" PATH="$TMP/emptybin" "$(command -v bash)" "$HOOK" 2>/dev/null
[ "$?" = 0 ] && ok "missing jq -> exit 0" || bad "missing jq non-zero"

echo "== promote-capture.sh =="

# record.sh needs a target dir; point it at a temp planning root.
REC_ROOT="$TMP/root"
mkdir -p "$REC_ROOT"

staging_fixture() { # rebuilds a 2-line staging file
  cat > "$STAGING" <<'EOF'
{"ts":"2026-09-24T12:00:00Z","project":"p","session_id":"s","question":"Ship with canary first?","header":"Deploy","answer":"Yes, canary then full","notes":"zero-downtime requirement"}
{"ts":"2026-09-24T12:01:00Z","project":"p","session_id":"s","question":"Broken line","header":"X","answer":"","notes":""}
EOF
}

# 6. Dry-run: reports both, changes nothing.
staging_fixture
out="$(bash "$PROMOTE" --slug testslug --dry-run --file "$STAGING" 2>&1)"
case "$out" in *"would promote"*) ok "dry-run lists promotions" ;; *) bad "dry-run output missing listing: $out" ;; esac
[ "$(wc -l < "$STAGING")" = 2 ] && ok "dry-run leaves staging intact" || bad "dry-run modified staging"

# 7. Real promotion: good line promoted, broken line kept.
#    record.sh needs the target dir to pre-exist (--root points at the tree).
staging_fixture
export CFN_DECISION_CAPTURE_FILE="$STAGING"
mkdir -p "$REC_ROOT/planning/testslug"
out="$(bash "$PROMOTE" --slug testslug --file "$STAGING" --root "$REC_ROOT/planning/testslug" 2>&1)"
rc=$?
[ "$rc" = 2 ] && ok "exit 2 when some lines fail" || bad "expected exit 2, got $rc"
echo "$out" > "$TMP/promote.log"
case "$(cat "$TMP/promote.log")" in *"promoted=1 failed=1"*) ok "one promoted, one kept" ;; *) bad "promote summary wrong: $out" ;; esac
[ "$(wc -l < "$STAGING")" = 1 ] && ok "staging shrunk to failed line" || bad "staging line count after promote: $(wc -l < "$STAGING")"
assert_contains "$STAGING" "Broken line" "failed line kept verbatim"

# 8. Ledger JSON written for the promoted line.
LEDGER="$REC_ROOT/planning/testslug/.VERIFY_testslug.decisions.json"
[ -f "$LEDGER" ] && ok "ledger JSON exists" || bad "ledger JSON missing at $LEDGER"
assert_contains "$LEDGER" "Ship with canary first?" "ledger holds question as title"
assert_contains "$LEDGER" "Yes, canary then full" "ledger holds chosen answer"

# 9. record.sh unavailable for SQLite sink -> rc 7 path still promotes (D-7).
#    (Covered implicitly above whenever the decision-log sink is absent; if the
#    sink IS present, rc=0. Either way promotion succeeded, which test 7 asserts.)

# 10. Empty/missing staging -> clean exit 0.
out="$(bash "$PROMOTE" --slug testslug --file "$TMP/absent.jsonl" 2>&1)"
[ "$?" = 0 ] && ok "missing staging file -> exit 0" || bad "missing staging non-zero"

echo ""
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
