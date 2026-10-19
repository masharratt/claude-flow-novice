#!/usr/bin/env bash
# Tests for Codex CLI support in the mailbox: .claude/skills/cfn-mailbox/codex-mail.sh (launcher and
# --notify), the watcher's per-client nudge text, and mailbox.sh read (delivered-set write failure,
# Reply lines for MAILBOX_CLIENT=codex).
#
# Offline only: fake redis-cli, tmux and codex go first on PATH / in CODEX_BIN; HOME is a scratch dir;
# MAILBOX_NOW is a fake clock. The real codex binary is never run.
#
# Usage: bash tests/test-cfn-mailbox-codex.sh
# Exit codes: 0 all green, 1 a test failed.
# No `set -e`: every assertion runs so every failure shows in one pass.
set -uo pipefail
unset CLAUDE_CODE_SESSION_ID MAILBOX_SESSION_ID MAILBOX_SESSION MAILBOX_CLIENT TMUX_PANE

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
LAUNCH="$REPO/.claude/skills/cfn-mailbox/codex-mail.sh"
WATCH="$REPO/.claude/skills/cfn-mailbox/mailbox-watch.sh"
MB="$REPO/.claude/skills/cfn-mailbox/mailbox.sh"

PASS=0; FAIL=0; CASES=0; CASE_NAME=""
# shellcheck source=/dev/null
. "$REPO/.claude/cfn-scripts/lib/safe-rm.sh"
# shellcheck source=/dev/null
. "$REPO/tests/lib/fake-redis-cli.sh"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/cfn-mailbox-codex-test.XXXXXX")" || exit 1
SCRATCH="$(cd -P "$SCRATCH" && pwd -P)" || exit 1
trap 'cfn_safe_rm_tmp "$SCRATCH"' EXIT

ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL [%s] %s\n' "$CASE_NAME" "$1"; }
assert_eq() { if [ "$1" = "$2" ]; then ok; else bad "$3: expected [$1] got [$2]"; fi; }
assert_contains() { case "$1" in *"$2"*) ok ;; *) bad "$3: missing [$2] in [$1]" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) bad "$3: unexpected [$2] in [$1]" ;; *) ok ;; esac; }
assert_match() { if [[ "$1" =~ $2 ]]; then ok; else bad "$3: [$1] does not match /$2/"; fi; }
assert_rc() { if [ "$RC" = "$1" ]; then ok; else bad "$2: exit expected $1 got $RC (stderr: $ERR)"; fi; }

NOW=1700000000
HOSTN="$(hostname -s)"
SOCK="/tmp/fake-tmux-sock"

new_case() {
  CASE_NAME="$1"; CASES=$((CASES + 1))
  T="$SCRATCH/case-$CASES"
  mkdir -p "$T/bin" "$T/home" "$T/work/My_Proj" "$T/kv"
  CACHE="$T/home/.cache/cfn-mailbox"
  mkdir -p "$CACHE"
  : > "$T/calls"; : > "$T/rules"; : > "$T/tmuxlog"
  install_fake_redis_cli "$T/bin"
  cat > "$T/bin/tmux" <<FAKE_TMUX
#!/usr/bin/env bash
args=("\$@")
[ "\${args[0]:-}" != -S ] || args=("\${args[@]:2}")
case "\${args[0]:-}" in
  display) printf '%s\n' "$SOCK"; exit 0 ;;
  display-message)
    tgt=""; prev=""
    for a in "\${args[@]}"; do [ "\$prev" != -t ] || tgt="\$a"; prev="\$a"; done
    printf '%s\n' "\$tgt"; exit 0 ;;
esac
printf '%s\n' "\$*" >> "$T/tmuxlog"
FAKE_TMUX
  # Fake codex: records argv, the env it was given, and the files the launcher prepared.
  cat > "$T/bin/codex" <<FAKE_CODEX
#!/usr/bin/env bash
{ for a in "\$@"; do printf '%s\n' "\$a"; done; } > "$T/codex.args"
{
  printf 'MAILBOX_SESSION=%s\n' "\${MAILBOX_SESSION-unset}"
  printf 'MAILBOX_CLIENT=%s\n' "\${MAILBOX_CLIENT-unset}"
  printf 'OPENAI_API_KEY=%s\n' "\${OPENAI_API_KEY-unset}"
} > "$T/codex.env"
if [ -n "\${MAILBOX_SESSION:-}" ]; then
  cat "$CACHE/client-\$MAILBOX_SESSION" > "$T/codex.client" 2>/dev/null
  cat "$CACHE/state-\$MAILBOX_SESSION" > "$T/codex.state" 2>/dev/null
fi
[ ! -f "$T/codex.sleep" ] || sleep "\$(cat "$T/codex.sleep")"
exit \${FAKE_CODEX_RC:-0}
FAKE_CODEX
  chmod +x "$T/bin/tmux" "$T/bin/codex"
  cat > "$T/env" <<ENVEOF
MAILBOX_HOST=mbx.example.test
MAILBOX_PORT=6379
MAILBOX_USER=michael
MAILBOX_PASS=pw-SECRET-do-not-leak-123
MAILBOX_OWNER=michael
MAILBOX_PUBLIC=me
ENVEOF
  chmod 600 "$T/env"
  export FAKE_LOG="$T/calls" FAKE_RULES="$T/rules"
}

rule() { printf '%s\t%s\n' "$1" "$2" >> "$T/rules"; }
cmds() { grep '^CMD	' "$T/calls" | cut -f2-; }
has_cmd() { cmds | grep -F -q -- "$1"; }
count_cmd() { cmds | grep -F -c -- "$1" || true; }

# launch [ENV=VAL...] -- ARGS...: run codex-mail.sh in the project dir. Sets OUT ERR RC.
launch() {
  local -a extra=()
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do extra+=("$1"); shift; done
  [ "${1:-}" != "--" ] || shift
  RC=0
  OUT="$(cd "$T/work/My_Proj" && env -u MAILBOX_SESSION -u TMUX_PANE \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" MAILBOX_NOW="$NOW" \
    CODEX_BIN="$T/bin/codex" OPENAI_API_KEY=sk-test-not-real CODEX_MAIL_HEARTBEAT_SECS=1 \
    ${extra[@]+"${extra[@]}"} bash "$LAUNCH" "$@" 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
}

run_env() {
  RC=0
  OUT="$(env -u MAILBOX_SESSION -u TMUX_PANE \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" MAILBOX_NOW="$NOW" \
    MAILBOX_NUDGE_DELAY=0 MAILBOX_WATCH_INTERVAL=0 TZ=UTC FAKE_KV_DIR="$T/kv" \
    "$@" 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
}

# ---------------------------------------------------------------- launcher

test_launcher() {
  new_case "launcher exists"
  if [ -f "$LAUNCH" ]; then ok; else bad "missing $LAUNCH"; fi

  new_case "launcher: registers socket|pane, writes client and state, passes -c flags and env, unsets OPENAI_API_KEY"
  launch TMUX_PANE=%7 -- --name cxt1 -- --model gpt-x
  assert_rc 0 "launch ok"
  assert_contains "$OUT" "codex mail name: cxt1 (reply address michael/s/cxt1)" "start line"
  assert_eq "yes" "$(has_cmd 'HSET dir:michael michael/s/cxt1' && echo yes)" "directory entry written under the name"
  assert_contains "$(grep -F 'HSET dir:michael michael/s/cxt1' "$T/calls" | head -1)" "\"tmux_target\":\"$SOCK|%7\"" "socket|pane registered"
  assert_contains "$(grep -F 'HSET dir:michael michael/s/cxt1' "$T/calls" | head -1)" '"summary":"codex"' "summary codex"
  assert_eq "codex" "$(cat "$T/codex.client")" "client file written before codex ran"
  assert_match "$(cat "$T/codex.state")" '^idle [0-9]+$' "state idle before codex ran"
  assert_contains "$(cat "$T/codex.env")" "MAILBOX_SESSION=cxt1" "env session"
  assert_contains "$(cat "$T/codex.env")" "MAILBOX_CLIENT=codex" "env client"
  assert_contains "$(cat "$T/codex.env")" "OPENAI_API_KEY=unset" "subscription billing: key unset"
  local args; args="$(cat "$T/codex.args")"
  assert_contains "$args" "sandbox_workspace_write.network_access=true" "network flag"
  assert_contains "$args" "sandbox_workspace_write.writable_roots=[\"$CACHE\"]" "cache dir writable"
  assert_contains "$args" "notify=[\"bash\",\"$LAUNCH\",\"--notify\",\"cxt1\"]" "notify flag"
  assert_eq "--model gpt-x " "$(printf '%s\n' "$args" | tail -n 2 | tr '\n' ' ')" "user args after the -c flags"
  assert_eq "-c" "$(printf '%s\n' "$args" | sed -n 1p)" "-c flags come first"

  new_case "launcher: cleanup on exit removes client file, marks state gone, returns codex's exit code"
  launch TMUX_PANE=%7 FAKE_CODEX_RC=5 -- --name cxt2
  assert_rc 5 "codex exit code passed through"
  assert_eq "no" "$([ -e "$CACHE/client-cxt2" ] && echo yes || echo no)" "client file removed"
  assert_match "$(cat "$CACHE/state-cxt2" 2>/dev/null)" '^gone [0-9]+$' "state gone"

  new_case "launcher: name held by another live pane (exit 23) gets a fresh random name"
  rule 'HGET dir:michael michael/s/taken' "{\"host\":\"$HOSTN\",\"tmux_target\":\"$SOCK|%1\",\"last_seen\":$NOW}"
  launch TMUX_PANE=%7 -- --name taken
  assert_rc 0 "launched anyway"
  assert_match "$(grep '^MAILBOX_SESSION=' "$T/codex.env" | cut -d= -f2)" '^my-proj-cx-[0-9a-f]{4}$' "random name <project>-cx-<hex4>"
  assert_not_contains "$(cat "$T/codex.env")" "MAILBOX_SESSION=taken" "taken name not used"

  new_case "launcher: no --name derives <project>-cx-<hex4>; invalid --name refused"
  launch TMUX_PANE=%7 --
  assert_match "$(grep '^MAILBOX_SESSION=' "$T/codex.env" | cut -d= -f2)" '^my-proj-cx-[0-9a-f]{4}$' "derived name"
  rm -f "$T/codex.env"
  launch TMUX_PANE=%7 -- --name 'Bad_Name'
  assert_eq "yes" "$([ "$RC" -ne 0 ] && echo yes)" "invalid name exits nonzero"
  assert_eq "no" "$([ -e "$T/codex.env" ] && echo yes || echo no)" "codex not started"

  new_case "launcher: outside tmux warns, still launches, no tmux target registered"
  launch -- --name cxt3
  assert_rc 0 "launched"
  assert_contains "$ERR" "no automatic wake-ups outside tmux" "warning"
  assert_eq "yes" "$([ -f "$T/codex.env" ] && echo yes)" "codex ran"
  assert_not_contains "$(grep -F 'HSET dir:michael michael/s/cxt3' "$T/calls" | head -1)" "tmux_target" "no tmux target"

  new_case "launcher: keeper refreshes the heartbeat while codex lives"
  echo 3 > "$T/codex.sleep"
  launch TMUX_PANE=%7 -- --name cxt4
  assert_eq "yes" "$([ "$(count_cmd 'HSET dir:michael michael/s/cxt4')" -ge 2 ] && echo yes)" "at least one keeper beat after the first"

  new_case "launcher: registration failure other than 23 warns and launches anyway"
  rule 'HGET dir:michael michael/s/cxt5' '!EXIT:1:boom'
  launch TMUX_PANE=%7 -- --name cxt5
  assert_rc 0 "launched"
  assert_contains "$ERR" "could not register" "warned"
  assert_eq "yes" "$([ -f "$T/codex.env" ] && echo yes)" "codex ran"
}

test_notify() {
  new_case "notify: agent-turn-complete writes idle; other types and bare calls change nothing"
  printf 'busy 1\n' > "$CACHE/state-cxn"
  launch -- --notify cxn '{"type":"other-event"}'
  assert_rc 0 "ignored type ok"
  assert_eq "busy 1" "$(cat "$CACHE/state-cxn")" "state untouched by other type"
  launch -- --notify cxn
  assert_rc 0 "bare call ok"
  assert_eq "busy 1" "$(cat "$CACHE/state-cxn")" "state untouched by bare call"
  launch -- --notify cxn '{"type":"agent-turn-complete","turn-id":"1"}'
  assert_rc 0 "turn complete ok"
  assert_match "$(cat "$CACHE/state-cxn")" '^idle [0-9]+$' "state idle"
  launch -- --notify cxn 'not json at all'
  assert_rc 0 "garbage never fails"
}

# ---------------------------------------------------------------- watcher

dir_entry() { # NAME PROJECT LAST_SEEN HOST TMUX
  jq -n -c --arg a "michael/s/$1" --arg p "$2" --argjson ls "$3" --arg h "$4" --arg t "$5" \
    '{a:$a, v:{host:$h, last_seen:$ls, summary:"x", rooms:[], project:$p, tmux_target:$t}}' >> "$T/dir.list"
}
SKEY="mbx:michael:s:s1:from:michael"
watch_case() { # CLIENT-FILE-CONTENT (empty: no client file)
  : > "$T/dir.list"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" "main:1.0"
  rule "HGETALL dir:michael" "$(jq -s -c 'map({(.a): (.v | tojson)}) | add // {}' "$T/dir.list")"
  printf 'idle %s\n' "$NOW" > "$CACHE/state-s1"
  printf '%s|1699999999999-0\n' "$SKEY" "mbx:michael:s:s1:from:steve" "mbx:michael:p:proj:from:michael" "mbx:michael:p:proj:from:steve" > "$CACHE/watch-ids"
  rule "XREAD *" "$(jq -n -c --arg k "$SKEY" '{($k): [["1700000000500-0", ["from","michael/s/zzz","to","michael/s/s1","kind","ask","body","hello","sent_at","1","thread","t-a","hops","0"]]]}')"
  if [ -n "$1" ]; then printf '%s\n' "$1" > "$CACHE/client-s1"; fi
}

test_watcher() {
  new_case "watcher: codex client gets the codex text and state busy"
  watch_case codex
  run_env bash "$WATCH" once --nudge
  assert_rc 0 "pass ok"
  local want="You have mail: run $T/home/.claude/skills/cfn-mailbox/mailbox.sh read, then answer each message with the Reply line under it."
  assert_eq "send-keys -t main:1.0 -l -- $want" "$(sed -n 1p "$T/tmuxlog")" "codex text typed"
  assert_eq "send-keys -t main:1.0 Enter" "$(sed -n 2p "$T/tmuxlog")" "then Enter"
  assert_match "$(cat "$CACHE/state-s1")" '^busy [0-9]+$' "state busy after codex nudge"

  new_case "watcher: a Claude session (no client file) keeps the slash-command text and its state"
  watch_case ""
  run_env bash "$WATCH" once --nudge
  assert_eq "send-keys -t main:1.0 -l -- You have mail: run /mail read" "$(sed -n 1p "$T/tmuxlog")" "claude text typed"
  assert_match "$(cat "$CACHE/state-s1")" '^idle ' "state untouched"
}

# ---------------------------------------------------------------- read

KEY_A="mbx:michael:s:abc:from:michael"
MB_ENV=()
mbread() { # ARGS...: sets OUT ERR RC (MB_ENV: optional extra env)
  RC=0
  OUT="$(env -u MAILBOX_SESSION -u MAILBOX_CLIENT PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" \
    FAKE_KV_DIR="$T/kv" ${MB_ENV[@]+"${MB_ENV[@]}"} bash "$MB" read "$@" 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
}
msg_reply() { # ID FROM BODY MSGID
  jq -n -c --arg k "$KEY_A" --arg id "$1" --arg f "$2" --arg b "$3" --arg m "$4" \
    '{($k): [[$id, ["from",$f,"to","michael/s/abc","kind","ask","body",$b,"msg_id",$m,"thread","t-a","hops","2"]]]}'
}

test_read() {
  new_case "read: unwritable delivered set warns once, exits 0, shows the mail once, never repeats it"
  mkdir -p "$CACHE/delivered-abc"   # a directory: appending to it fails, even as root
  rule "XREAD COUNT 20 STREAMS $KEY_A 0-0" "$(msg_reply 1700000000100-0 michael/s/x 'only once' once-1)"
  MB_ENV=()
  mbread --as michael/s/abc
  assert_rc 0 "exit 0 despite the failed delivered write"
  assert_eq "1" "$(printf '%s\n' "$OUT" | grep -c 'only once')" "printed once"
  assert_eq "1" "$(printf '%s\n' "$ERR" | grep -c 'delivered')" "one warning"
  assert_eq "yes" "$(has_cmd 'SET seen:' && echo yes)" "seen marker moved"
  mbread --as michael/s/abc
  assert_rc 0 "second read ok"
  assert_not_contains "$OUT" "only once" "second read prints nothing"

  new_case "read: MAILBOX_CLIENT=codex prints a Reply line under each message"
  rule "XREAD COUNT 20 STREAMS $KEY_A 0-0" "$(msg_reply 1700000000200-0 michael/s/x 'please answer' cx-1)"
  MB_ENV=(MAILBOX_CLIENT=codex)
  mbread --as michael/s/abc
  assert_contains "$OUT" "please answer" "message printed"
  assert_contains "$OUT" "Reply: $MB send michael/s/x --kind reply --reply-to 1700000000200-0 --thread t-a --hops 2 \"...\"" "reply line uses stream id"
  assert_not_contains "$OUT" "--reply-to cx-1" "msg_id is not the reply target"

  new_case "read: default client prints no Reply line"
  rule "XREAD COUNT 20 STREAMS $KEY_A 0-0" "$(msg_reply 1700000000300-0 michael/s/x 'plain' pl-1)"
  MB_ENV=()
  mbread --as michael/s/abc
  assert_contains "$OUT" "plain" "message printed"
  assert_not_contains "$OUT" "Reply:" "no reply line"

  new_case "read: codex reply line is omitted for a from that fails the strict pattern"
  rule "XREAD COUNT 20 STREAMS $KEY_A 0-0" "$(msg_reply 1700000000400-0 'michael/s/x;rm' 'odd sender' od-1)"
  MB_ENV=(MAILBOX_CLIENT=codex)
  mbread --as michael/s/abc
  assert_contains "$OUT" "odd sender" "message printed"
  assert_not_contains "$OUT" "Reply:" "no reply line for odd from"
}

test_launcher
test_notify
test_watcher
test_read

echo "cases=$CASES assertions_passed=$PASS assertions_failed=$FAIL"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
