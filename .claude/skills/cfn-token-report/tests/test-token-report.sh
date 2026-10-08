#!/usr/bin/env bash
# Tests for cfn-token-report: token usage from Claude Code session logs.
# Traps covered: Claude Code writes the same assistant message 2-5 times (one
# line per content block), so counting lines inflates totals; subagent usage
# lives in <session>/subagents/agent-*.jsonl with its type in a .meta.json.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/../report.py"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export CFN_TOKEN_REPORT_ROOT="$WORK/projects"

PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
assert_eq() { if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (got '$1' wanted '$2')"; fi; }

TODAY_TS="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
OLD_TS="2020-01-01T12:00:00.000Z"

msg() { # msg <ts> <msg_id> <model> <in> <out> <cache_write> <cache_read>
  printf '{"type":"assistant","timestamp":"%s","requestId":"req_%s","message":{"id":"%s","model":"%s","usage":{"input_tokens":%s,"output_tokens":%s,"cache_creation_input_tokens":%s,"cache_read_input_tokens":%s}}}\n' \
    "$1" "$2" "$2" "$3" "$4" "$5" "$6" "$7"
}

P1="$CFN_TOKEN_REPORT_ROOT/-Users-me-Projects-alpha"
P2="$CFN_TOKEN_REPORT_ROOT/-Users-me-Projects-beta"
mkdir -p "$P1/s1/subagents" "$P2"
{
  msg "$TODAY_TS" m1 claude-opus-5-5 10 100 1000 5000
  msg "$TODAY_TS" m1 claude-opus-5-5 10 100 1000 5000   # duplicate line, same message
  msg "$TODAY_TS" m1 claude-opus-5-5 10 100 1000 5000   # duplicate line, same message
  msg "$TODAY_TS" m2 claude-opus-5-5 20 200 0 6000
  msg "$OLD_TS"   m0 claude-opus-5-5 99999 99999 0 0    # outside the window
  echo '{"type":"user","message":{"content":"hi"}}'
  echo 'not json at all'
} > "$P1/s1.jsonl"
msg "$TODAY_TS" m3 claude-sonnet-5-5 5 50 500 700 > "$P1/s1/subagents/agent-abc.jsonl"
echo '{"agentType":"researcher","description":"x"}' > "$P1/s1/subagents/agent-abc.meta.json"
msg "$TODAY_TS" m4 claude-haiku-5-5 1 10 0 0 > "$P1/s1/subagents/agent-nometa.jsonl"
msg "$TODAY_TS" m5 glm-5 7 70 0 0 > "$P2/s2.jsonl"

J="$(python3 -I "$SCRIPT" --days 7 --json)"
RC=$?
assert_eq "$RC" 0 "json run exits 0"

t() { printf '%s' "$J" | jq -r "$1"; }
echo "## totals: each message counted once, old entries excluded"
assert_eq "$(t '.totals.messages')" 5 "5 distinct messages in window (m1 x3 counts once)"
assert_eq "$(t '.totals.input')" 43 "input = 10+20+5+1+7"
assert_eq "$(t '.totals.output')" 430 "output = 100+200+50+10+70"
assert_eq "$(t '.totals.cache_write')" 1500 "cache write = 1000+500"
assert_eq "$(t '.totals.cache_read')" 11700 "cache read = 5000+6000+700"

echo "## breakdowns"
assert_eq "$(t '.by_project[] | select(.key=="alpha") | .output')" 360 "project alpha output"
assert_eq "$(t '.by_project[] | select(.key=="beta") | .output')" 70 "project beta (non-Claude model still counted)"
assert_eq "$(t '.by_model[] | select(.key=="glm-5") | .messages')" 1 "model glm-5 listed"
assert_eq "$(t '.by_agent[] | select(.key=="main") | .output')" 370 "main-chat output (alpha + beta)"
assert_eq "$(t '.by_agent[] | select(.key=="researcher") | .output')" 50 "subagent type from meta.json"
assert_eq "$(t '.by_agent[] | select(.key=="subagent (unknown type)") | .output')" 10 "subagent without meta"
assert_eq "$(t '.by_project[0].key')" alpha "breakdowns sorted biggest first"
assert_eq "$(t '.window.skipped_lines')" 1 "malformed line counted, not fatal"

echo "## filters"
assert_eq "$(python3 -I "$SCRIPT" --days 7 --json --project beta | jq -r '.totals.messages')" 1 "--project filters by name"
assert_eq "$(python3 -I "$SCRIPT" --since 2019-12-31 --json | jq -r '.totals.messages')" 6 "--since reaches the old entry"

echo "## text output"
TXT="$(python3 -I "$SCRIPT" --days 7)"
case "$TXT" in *researcher*alpha*|*alpha*researcher*) ok "text report names projects and agents" ;; *) no "text report: $TXT" ;; esac
case "$TXT" in *"5 replies"*) ok "text report states the message count" ;; *) no "text count line missing: $TXT" ;; esac

echo "## empty and bad input"
EMPTY="$(CFN_TOKEN_REPORT_ROOT="$WORK/none" python3 -I "$SCRIPT" --days 7 2>&1)"; RC=$?
assert_eq "$RC" 2 "missing log folder exits 2"
mkdir -p "$WORK/emptyroot"
OUT="$(CFN_TOKEN_REPORT_ROOT="$WORK/emptyroot" python3 -I "$SCRIPT" --days 7 2>&1)"; RC=$?
assert_eq "$RC" 0 "empty folder exits 0"
case "$OUT" in *"No usage"*) ok "empty folder says so plainly" ;; *) no "empty message: $OUT" ;; esac
python3 -I "$SCRIPT" --since 2026-13-45 >/dev/null 2>&1; assert_eq "$?" 2 "bad --since exits 2"

echo
echo "token-report: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
