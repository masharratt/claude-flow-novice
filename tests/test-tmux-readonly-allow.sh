#!/usr/bin/env bash
# tests/test-tmux-readonly-allow.sh
# cfn-tmux-readonly-allow.sh :: auto-approve only tmux calls that just look.
#
# allow    tmux [-L name | -S path] <capture-pane|ls|list-*|has-session> [plain args]
#          optionally piped into tail / head / grep / wc
# silent   everything else, so the normal permission prompt still fires
#
# Safety of this test: the hook only READS the command text as JSON input; no
# command below is ever executed. Every "attack" case still uses a harmless
# payload (touching a canary file inside this test's own temp dir), and the
# suite asserts that canary never appears, so a broken hook cannot do damage
# through this test.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
HOOK="${CFN_TMUX_HOOK:-$PROJECT_ROOT/.claude/hooks/cfn-tmux-readonly-allow.sh}"

T=$(mktemp -d "${TMPDIR:-/tmp}/tmux-ro.XXXXXX")
trap 'rm -rf "$T"' EXIT
CANARY="$T/canary"
PAYLOAD="touch $CANARY"

PASS=0; FAIL=0

verdict() {
  # Prints "allow" when the hook approves, "none" when it stays silent.
  local out
  out=$(jq -n --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}' | bash "$HOOK")
  if printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' >/dev/null 2>&1; then
    echo allow
  else
    echo none
  fi
}

expect() {
  local want="$1" cmd="$2" got
  got=$(verdict "$cmd")
  if [ "$got" = "$want" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL want=%s got=%s cmd=%s\n' "$want" "$got" "$cmd"
  fi
}

test_safe_reads_are_allowed() {
  expect allow "tmux capture-pane -p -t fleet:0"
  expect allow "tmux -L fleet-main capture-pane -p -t w1 -S -200"
  expect allow "tmux -L fleet-main capture-pane -pt w1 -S -60 | tail -40"
  expect allow "tmux -L fleet-main capture-pane -p -t w1 | grep -n error | head -5"
  expect allow "tmux -L fleet-main ls"
  expect allow "tmux ls"
  expect allow "tmux list-sessions"
  expect allow "tmux -L diag list-windows -t s1"
  expect allow "tmux list-panes -a"
  expect allow "tmux -L x has-session -t w1"
  expect allow "tmux -S /tmp/tmux-501/default ls"
  expect allow "tmux -L fleet-main capture-pane -p -t w1 | wc -l"
}

test_changing_subcommands_still_prompt() {
  expect none "tmux -L fleet-main send-keys -t w1 '$PAYLOAD' Enter"
  expect none "tmux -L fleet-main kill-session -t w1"
  expect none "tmux kill-server"
  expect none "tmux new-session -d -s w9"
  expect none "tmux run-shell '$PAYLOAD'"
  expect none "tmux pipe-pane -t w1 '$PAYLOAD'"
  expect none "tmux source-file $T/conf"
  expect none "tmux set-option -g status off"
  expect none "tmux display-message -p '#($PAYLOAD)'"
  expect none "tmux"
  expect none "tmux -L fleet-main"
}

test_chaining_is_refused() {
  # tmux runs several commands when they are joined by ';' or '\;'.
  expect none "tmux capture-pane -p \\; run-shell '$PAYLOAD'"
  expect none "tmux capture-pane -p ';' run-shell '$PAYLOAD'"
  expect none "tmux capture-pane -p \; run-shell x"
  expect none "tmux ls; $PAYLOAD"
  expect none "tmux ls && $PAYLOAD"
  expect none "tmux ls || $PAYLOAD"
  expect none "tmux ls & $PAYLOAD"
  expect none "tmux ls
$PAYLOAD"
}

test_hidden_execution_is_refused() {
  # Formats with #() run a shell command; substitutions run before tmux does.
  expect none "tmux list-sessions -F '#($PAYLOAD)'"
  expect none "tmux ls -F \"#{session_name}\""
  expect none "tmux ls -f '#{?#($PAYLOAD),1,0}'"
  expect none "tmux capture-pane -p -t \$($PAYLOAD)"
  expect none "tmux capture-pane -p -t \`$PAYLOAD\`"
  expect none "tmux capture-pane -p -t \"\$W\""
  expect none "tmux -f $T/evil.conf ls"
  expect none "tmux capture-pane -p > $T/out"
  expect none "tmux capture-pane -p >> $T/out"
  expect none "tmux capture-pane -p 2>&1"
  expect none "tmux capture-pane -p < $T/in"
  expect none "tmux capture-pane -p -t {w1}"
  # Backstop: quotes in the tmux part are refused outright, even harmless ones.
  expect none "tmux capture-pane -p -t 'w1'"
  expect none "tmux capture-pane -p -t \"w1\""
}

test_disguised_tmux_is_refused() {
  expect none "TMUX_TMPDIR=$T tmux ls"
  expect none "env tmux ls"
  expect none "./tmux ls"
  expect none "$T/tmux ls"
  expect none "tmuxx ls"
  expect none " $PAYLOAD # tmux ls"
  expect none "$PAYLOAD | tmux ls"
}

test_pipes_only_into_plain_readers() {
  expect none "tmux capture-pane -p | bash"
  expect none "tmux capture-pane -p | sh"
  expect none "tmux capture-pane -p | xargs touch"
  expect none "tmux capture-pane -p | tee $T/out"
  expect none "tmux capture-pane -p | sed 'w $T/out'"
  expect none "tmux capture-pane -p | sort -o $T/out"
  expect none "tmux capture-pane -p | awk '{system(\"x\")}'"
  expect none "tmux capture-pane -p |"
  expect none "tmux capture-pane -p | | tail"
}

test_non_bash_or_garbage_input_is_silent() {
  local out
  out=$(printf '%s' '{"tool_name":"Read","tool_input":{"file_path":"/x"}}' | bash "$HOOK")
  if [ -z "$out" ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); echo "FAIL non-Bash tool produced output"; fi
  out=$(printf '%s' 'not json' | bash "$HOOK" || true)
  if [ -z "$out" ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); echo "FAIL garbage input produced output"; fi
}

test_canary_never_created() {
  if [ -e "$CANARY" ]; then
    FAIL=$((FAIL + 1)); echo "FAIL canary file exists: the hook executed a command"
  else
    PASS=$((PASS + 1))
  fi
}

test_safe_reads_are_allowed
test_changing_subcommands_still_prompt
test_chaining_is_refused
test_hidden_execution_is_refused
test_disguised_tmux_is_refused
test_pipes_only_into_plain_readers
test_non_bash_or_garbage_input_is_silent
test_canary_never_created

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
