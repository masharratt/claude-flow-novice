#!/usr/bin/env bash
# cfn-fanout-guard.sh: warns (never blocks) when a session launches N workers in
# a short window before any one item ran end to end.
# Origin: MDTWII night of 2026-11-04/05, fan-out happened before one real item
# was run and checked. Isolation: state under a temp XDG_RUNTIME_DIR; clock via
# CFN_FANOUT_NOW so the sliding window is deterministic.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="$ROOT/.claude/hooks/cfn-fanout-guard.sh"

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
TMP=$(mktemp -d "${TMPDIR:-/tmp}/fanout-test-XXXXXX") || exit 1
export XDG_RUNTIME_DIR="$TMP/run"
mkdir -p "$XDG_RUNTIME_DIR"
unset CFN_FANOUT_WINDOW CFN_FANOUT_THRESHOLD CFN_FANOUT_GUARD CLAUDE_CODE_SESSION_ID 2>/dev/null || true
trap 'cfn_safe_rm_tmp "$TMP"' EXIT

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }

SID=s1
# pre <tool> <tool_input json> [now] [session] [extra top-level json]
pre(){
  local sid="${4:-$SID}" extra="${5:-}"
  printf '{"session_id":"%s","hook_event_name":"PreToolUse","tool_name":"%s","tool_input":%s%s}' \
    "$sid" "$1" "$2" "$extra" | CFN_FANOUT_NOW="${3:-1000}" bash "$GUARD" >"$TMP/out.txt" 2>"$TMP/err.txt"
  echo $?
}
post(){ # post <tool_input json> <now> [session]
  printf '{"session_id":"%s","hook_event_name":"PostToolUse","tool_name":"Agent","tool_input":%s,"tool_response":{"ok":true}}' \
    "${3:-$SID}" "$1" | CFN_FANOUT_NOW="$2" bash "$GUARD" >"$TMP/out.txt" 2>"$TMP/err.txt"
  echo $?
}
warned(){ jq -e '.hookSpecificOutput.additionalContext | test("fan-out: run one real item end to end")' "$TMP/out.txt" >/dev/null 2>&1; }
silent(){ [ ! -s "$TMP/out.txt" ]; }
AG='{"description":"x","prompt":"p","subagent_type":"general-purpose","model":"sonnet"}'
newsid(){ SID="s$RANDOM$RANDOM"; }

echo "## threshold and sliding window"
newsid
for t in 1000 1001 1002; do RC=$(pre Agent "$AG" $t); [ "$RC" = 0 ] && silent || no "spawn below threshold should be silent (t=$t rc=$RC)"; done
ok "three parallel agents stay silent"
RC=$(pre Agent "$AG" 1003)
[ "$RC" = 0 ] && warned && ok "fourth agent in the window warns, rc 0" || no "4th: rc=$RC out=$(cat "$TMP/out.txt")"
jq -r '.hookSpecificOutput.hookEventName' "$TMP/out.txt" | grep -q PreToolUse && ok "output names the PreToolUse event" || no "event name"
jq -r '.hookSpecificOutput.additionalContext' "$TMP/out.txt" | grep -q 'count=4 threshold=4 window=60s' \
  && ok "message names count, threshold and window" || no "message: $(cat "$TMP/out.txt")"
jq -r '.hookSpecificOutput.additionalContext' "$TMP/out.txt" | grep -q 'missing=\[' && ok "message uses missing=[...] style" || no "missing= style"
RC=$(pre Agent "$AG" 1004); [ "$RC" = 0 ] && silent && ok "fifth in same burst does not warn again" || no "second warn in burst"

newsid
for t in 1000 1030 1061 1092; do RC=$(pre Agent "$AG" $t); done
silent && ok "spawns spread beyond the window never reach the threshold" || no "sliding window: $(cat "$TMP/out.txt")"

newsid
for t in 1000 1001 1002 1003; do pre Agent "$AG" $t >/dev/null; done
for t in 2000 2001 2002; do pre Agent "$AG" $t >/dev/null; done
RC=$(pre Agent "$AG" 2003); warned && ok "a new burst after a quiet gap warns again" || no "new burst: $(cat "$TMP/out.txt")"

echo "## pilot marker suppresses"
newsid
CLAUDE_CODE_SESSION_ID="$SID" CFN_FANOUT_NOW=1000 bash "$GUARD" --pilot-ok "ran item 7, diffed output" >/dev/null 2>&1
RC=$?; [ "$RC" = 0 ] && ok "--pilot-ok exits 0" || no "pilot-ok rc=$RC"
for t in 1001 1002 1003 1004 1005; do RC=$(pre Agent "$AG" $t); done
silent && ok "no warning once --pilot-ok was recorded" || no "marker ignored: $(cat "$TMP/out.txt")"
CLAUDE_CODE_SESSION_ID="" bash "$GUARD" --pilot-ok "x" >/dev/null 2>"$TMP/err.txt"
[ $? -ne 0 ] && grep -q 'session' "$TMP/err.txt" && ok "--pilot-ok without a session id fails loudly" || no "pilot-ok without session"

echo "## completed single spawn before the burst counts as a pilot"
newsid
pre Agent "$AG" 1000 >/dev/null; RC=$(post "$AG" 1010)
[ "$RC" = 0 ] && ok "PostToolUse Agent exits 0" || no "post rc=$RC"
for t in 1100 1101 1102 1103; do pre Agent "$AG" $t >/dev/null; done
silent && ok "burst after a finished pilot is silent" || no "pilot completion ignored: $(cat "$TMP/out.txt")"

newsid
for t in 1000 1001; do pre Agent "$AG" $t >/dev/null; done
post "$AG" 1002 >/dev/null
for t in 1003 1004; do pre Agent "$AG" $t >/dev/null; done
warned && ok "a completion inside the burst is not a pilot" || no "in-burst completion treated as pilot"

newsid
BG='{"description":"x","prompt":"p","model":"sonnet","run_in_background":true}'
pre Agent "$BG" 1000 >/dev/null; post "$BG" 1000 >/dev/null
for t in 1100 1101 1102 1103; do pre Agent "$AG" $t >/dev/null; done
warned && ok "background launch ack is not a completed pilot" || no "background ack counted"

echo "## Workflow is a burst on its own"
newsid
RC=$(pre Workflow '{"script":"x"}' 1000)
[ "$RC" = 0 ] && warned && ok "one Workflow call warns" || no "workflow: $(cat "$TMP/out.txt")"
RC=$(pre Workflow '{"script":"x"}' 1001); silent && ok "second Workflow in the burst is silent" || no "workflow double warn"

echo "## Bash spawners"
newsid
for t in 1000 1001 1002; do pre Bash '{"command":"bash $HOME/.claude/skills/cfn-tmux-agents/tmux-agents.sh spawn --engine claude w'$t'"}' $t >/dev/null; done
silent && ok "three tmux-agents spawns are silent" || no "tmux below threshold"
pre Bash '{"command":"cfn-tmux-agents spawn glm w4"}' 1003 >/dev/null
warned && ok "fourth tmux-agents spawn warns" || no "tmux 4th: $(cat "$TMP/out.txt")"

newsid
for t in 1000 1001 1002; do pre Bash '{"command":"cfn-fleet assign w1 brief.md"}' $t >/dev/null; done
pre Agent "$AG" 1003 >/dev/null
warned && ok "fleet assign and Agent calls share one count" || no "mixed count: $(cat "$TMP/out.txt")"

newsid
pre Bash '{"command":"for f in a b c; do claude -p \"review $f\" > $f.out; done"}' 1000 >/dev/null
warned && ok "claude -p in a loop warns on its own" || no "claude -p loop: $(cat "$TMP/out.txt")"
newsid
pre Bash '{"command":"ls a | xargs -P 8 -I{} claude -p \"do {}\""}' 1000 >/dev/null
warned && ok "xargs -P with claude warns" || no "xargs -P: $(cat "$TMP/out.txt")"
newsid
pre Bash '{"command":"parallel -j4 codex exec ::: a b c d"}' 1000 >/dev/null
warned && ok "GNU parallel with codex warns" || no "parallel: $(cat "$TMP/out.txt")"

newsid
for t in 1000 1001 1002 1003 1004; do pre Bash '{"command":"ls -la; claude -p \"one question\""}' $t >/dev/null; done
silent && ok "a lone claude -p (no loop) is not a spawn" || no "lone claude -p counted"
pre Bash '{"command":"find . -name x | xargs -P 4 gzip"}' 1005 >/dev/null
silent && ok "xargs -P on a non-worker command is ignored" || no "xargs gzip counted"
pre Bash '{"command":"git status"}' 1006 >/dev/null
silent && ok "ordinary Bash is ignored" || no "plain bash counted"

echo "## isolation and fail-open"
newsid; A=$SID
for t in 1000 1001 1002; do pre Agent "$AG" $t "$A" >/dev/null; done
RC=$(pre Agent "$AG" 1003 other-session); silent && ok "sessions are counted separately" || no "cross-session leak"

newsid
for t in 1000 1001 1002 1003; do pre Agent "$AG" $t "$SID" ',"agent_id":"a1","agent_type":"x"' >/dev/null; done
silent && ok "calls from inside a subagent are ignored" || no "subagent counted"

printf 'not json' | CFN_FANOUT_NOW=1 bash "$GUARD" >"$TMP/out.txt" 2>/dev/null; [ $? = 0 ] && ok "garbage input exits 0" || no "garbage rc"
printf '' | bash "$GUARD" >/dev/null 2>&1; [ $? = 0 ] && ok "empty input exits 0" || no "empty rc"
newsid
printf '{"session_id":"%s","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":%s}' "$SID" "$AG" \
  | XDG_RUNTIME_DIR=/proc/nonexistent CFN_FANOUT_NOW=1 bash "$GUARD" >/dev/null 2>"$TMP/err.txt"
[ $? = 0 ] && ok "unwritable state dir fails open" || no "unwritable state rc"

newsid
for t in 1000 1001 1002; do CFN_FANOUT_THRESHOLD=2 pre Agent "$AG" $t >/dev/null; done
newsid
printf '{"session_id":"%s","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":%s}' "$SID" "$AG" | CFN_FANOUT_NOW=1000 CFN_FANOUT_THRESHOLD=2 bash "$GUARD" >/dev/null
printf '{"session_id":"%s","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":%s}' "$SID" "$AG" | CFN_FANOUT_NOW=1001 CFN_FANOUT_THRESHOLD=2 bash "$GUARD" >"$TMP/out.txt"
warned && ok "CFN_FANOUT_THRESHOLD override works" || no "threshold override"
newsid
for t in 1000 1001 1002 1003; do CFN_FANOUT_GUARD=off pre Agent "$AG" $t >/dev/null; done
silent && ok "CFN_FANOUT_GUARD=off disables" || no "off ignored"

echo
echo "passed=$PASS failed=$FAIL"
[ "$FAIL" = 0 ]
