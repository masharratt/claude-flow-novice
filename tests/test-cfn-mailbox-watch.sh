#!/usr/bin/env bash
# Tests for .claude/skills/cfn-mailbox/mailbox-watch.sh, `mailbox.sh send --at`, and the hook's
# idle/busy state files (agent mailbox, stage 4 "watcher + lifecycle").
#
# Offline only: a fake `redis-cli` (tests/lib/fake-redis-cli.sh), fake `tmux`, fake `sleep`,
# fake `systemctl` and fake `uname` go first on PATH, HOME points at a scratch directory,
# MAILBOX_NOW is a fake clock. No test touches a network, the real tmux server or systemctl.
#
# Usage: bash tests/test-cfn-mailbox-watch.sh
# Exit codes: 0 all green, 1 a test failed.
#
# No `set -e`: assertions must all run so every failure shows in one pass.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WATCH="$REPO/.claude/skills/cfn-mailbox/mailbox-watch.sh"
MB="$REPO/.claude/skills/cfn-mailbox/mailbox.sh"
HOOK="$REPO/.claude/hooks/cfn-mailbox-hook.sh"

PASS=0
FAIL=0
CASES=0
CASE_NAME=""
# shellcheck source=/dev/null
. "$REPO/.claude/cfn-scripts/lib/safe-rm.sh"
# shellcheck source=/dev/null
. "$REPO/tests/lib/fake-redis-cli.sh"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/cfn-mailbox-watch-test.XXXXXX")" || exit 1
SCRATCH="$(cd -P "$SCRATCH" && pwd -P)" || exit 1
trap 'cfn_safe_rm_tmp "$SCRATCH"' EXIT

ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL [%s] %s\n' "$CASE_NAME" "$1"; }
assert_eq() { if [ "$1" = "$2" ]; then ok; else bad "$3: expected [$1] got [$2]"; fi; }
assert_contains() { case "$2" in "") bad "$3: empty needle" ;; esac; case "$1" in *"$2"*) ok ;; *) bad "$3: missing [$2] in [$1]" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) bad "$3: unexpected [$2] in [$1]" ;; *) ok ;; esac; }
assert_rc() { if [ "$RC" = "$1" ]; then ok; else bad "$2: exit expected $1 got $RC (stderr: $ERR)"; fi; }
yn() { if "$@"; then echo yes; else echo no; fi; }

# ---------------------------------------------------------------- fixtures

PASSWORD="pw-SECRET-do-not-leak-123"
NOW=1700000000                 # 2023-11-14T22:13:20Z
NOW_MS=1700000000000
HOSTN="$(hostname -s)"
LONGBODY="please look at the failing build and tell me what changed since lunch"   # >= 40 chars
H=3600
CACHE=""
WENV=()
SKEY="mbx:michael:s:s1:from:michael"
PKEY="mbx:michael:p:proj:from:michael"

new_case() {
  CASE_NAME="$1"
  CASES=$((CASES + 1))
  T="$SCRATCH/case-$CASES"
  mkdir -p "$T/bin" "$T/home" "$T/work/My_Proj"
  CACHE="$T/home/.cache/cfn-mailbox"
  mkdir -p "$CACHE"
  : > "$T/calls"; : > "$T/rules"; : > "$T/tmuxlog"; : > "$T/sleeplog"; : > "$T/sysctllog"; : > "$T/dir.list"
  install_fake_redis_cli "$T/bin"
  # Fake tmux: display-message (the watcher's pane-exists probe) answers from $T/deadpanes (one target
  # per line = pane gone) and is not logged, so tmuxlog still holds only the nudge keystrokes.
  : > "$T/deadpanes"
  cat > "$T/bin/tmux" <<FAKE_TMUX
#!/usr/bin/env bash
args=("\$@")
[ "\${args[0]:-}" != -S ] || args=("\${args[@]:2}")
if [ "\${args[0]:-}" = display-message ]; then
  tgt=""; prev=""
  for a in "\${args[@]}"; do [ "\$prev" != -t ] || tgt="\$a"; prev="\$a"; done
  if grep -qxF -- "\$tgt" "$T/deadpanes" 2>/dev/null; then exit 1; fi
  printf '%s\n' "\$tgt"; exit 0
fi
printf '%s\n' "\$*" >> "$T/tmuxlog"
FAKE_TMUX
  printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >> "%s"\n' "$T/sleeplog" > "$T/bin/sleep"
  printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >> "%s"\n' "$T/sysctllog" > "$T/bin/systemctl"
  chmod +x "$T/bin/tmux" "$T/bin/sleep" "$T/bin/systemctl"
  cat > "$T/env" <<EOF
MAILBOX_HOST=mbx.example.test
MAILBOX_PORT=6379
MAILBOX_USER=michael
MAILBOX_PASS=$PASSWORD
MAILBOX_OWNER=michael
MAILBOX_PUBLIC=me
MAILBOX_CONTACTS="steve/me steve/p/liaison"
EOF
  chmod 600 "$T/env"
  export FAKE_LOG="$T/calls" FAKE_RULES="$T/rules"
  WENV=()
}

rule() { printf '%s\t%s\n' "$1" "$2" >> "$T/rules"; }
set_public() { # VALUE: rewrite MAILBOX_PUBLIC in the case config
  grep -v '^MAILBOX_PUBLIC=' "$T/env" > "$T/env.new"; printf 'MAILBOX_PUBLIC="%s"\n' "$1" >> "$T/env.new"
  mv "$T/env.new" "$T/env"; chmod 600 "$T/env"
}
fmode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1" 2>/dev/null; }   # GNU, then BSD

cmds() { grep '^CMD	' "$T/calls" | cut -f2-; }
has_cmd() { cmds | grep -F -q -- "$1"; }
count_cmd() { cmds | grep -F -c -- "$1" || true; }
line_of() { cmds | grep -n -F -- "$1" | head -1 | cut -d: -f1; }
line_of_re() { cmds | grep -n -E -- "$1" | head -1 | cut -d: -f1; }
has_re() { cmds | grep -E -q -- "$1"; }
nudges() { grep -c -F -- '-l -- You have mail: run /mail read' "$T/tmuxlog" || true; }
nudged() { grep -F -- "send-keys -t $1 -l -- You have mail: run /mail read" "$T/tmuxlog" >/dev/null 2>&1 && echo yes || echo no; }

run_env() { # CMD... : run with the fakes on PATH. Sets OUT ERR RC.
  RC=0
  OUT="$(env -u MAILBOX_SESSION -u TMUX_PANE -u MAILBOX_NOW \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" MAILBOX_NOW="$NOW" \
    MAILBOX_NUDGE_DELAY=0 MAILBOX_WATCH_INTERVAL=0 TZ=UTC ${WENV[@]+"${WENV[@]}"} \
    "$@" 2>"$T/stderr")" || RC=$?
  ERR="$(cat "$T/stderr")"
}
watch() { run_env bash "$WATCH" "$@"; }
mbsend() { run_env bash "$MB" send "$@"; }

# dir_entry NAME PROJECT LAST_SEEN HOST ROOMS_JSON TMUX  (appends to the directory fixture)
dir_entry() {
  jq -n -c --arg a "michael/s/$1" --arg p "$2" --argjson ls "$3" --arg h "$4" --argjson r "$5" --arg t "$6" \
    '{a:$a, v:({host:$h, last_seen:$ls, summary:"x", rooms:$r} + (if $p != "" then {project:$p} else {} end) + (if $t != "" then {tmux_target:$t} else {} end))}' >> "$T/dir.list"
}
dir_commit() { # directory reply in the redis-cli 8 object shape
  rule "HGETALL dir:michael" "$(jq -s -c 'map({(.a): (.v | tojson)}) | add // {}' "$T/dir.list")"
}
dir_commit_flat() { # RESP2 flat-array shape
  rule "HGETALL dir:michael" "$(jq -s -c 'map(.a, (.v | tojson))' "$T/dir.list")"
}
set_state() { printf '%s %s\n' "$2" "$NOW" > "$CACHE/state-$1"; }
seed_ids() { # KEY... : the watcher's last-notified ids, so no seeding call is needed
  local k
  : > "$CACHE/watch-ids"
  for k in "$@"; do printf '%s|%s\n' "$k" "1699999999999-0" >> "$CACHE/watch-ids"; done
}
keys_for() { # TYPE NAME -> both sender-owner keys
  printf 'mbx:michael:%s:%s:from:michael\nmbx:michael:%s:%s:from:steve\n' "$1" "$2" "$1" "$2"
}
seed_for() { # TYPE:NAME ...
  local a keys=()
  for a in "$@"; do
    while IFS= read -r k; do keys+=("$k"); done < <(keys_for "${a%%:*}" "${a#*:}")
  done
  seed_ids "${keys[@]}"
}

# xr KEY ID KIND BODY : XREAD reply (redis-cli 8 object shape) with one message.
xr() {
  jq -n -c --arg k "$1" --arg id "$2" --arg kind "$3" --arg body "$4" \
    '{($k): [[$id, ["from","michael/s/zzz","to","michael/s/s1","kind",$kind,"body",$body,"sent_at","1","thread","t-a","hops","0"]]]}'
}
xr_flat() { # same, RESP2 array shape
  jq -n -c --arg k "$1" --arg id "$2" --arg kind "$3" --arg body "$4" \
    '[[$k, [[$id, ["from","michael/s/zzz","to","michael/s/s1","kind",$kind,"body",$body,"sent_at","1","thread","t-a","hops","0"]]]]]'
}
# xe ID FROM KIND BODY TO : one XRANGE entry
xe() {
  jq -n -c --arg id "$1" --arg from "$2" --arg kind "$3" --arg body "$4" --arg to "$5" \
    '[$id, ["from",$from,"to",$to,"kind",$kind,"body",$body,"sent_at","1","thread","t-q","hops","2"]]'
}
xrange_reply() { jq -s -c '.' ; } # reads entries on stdin, one per line

# an id whose age is HOURS hours before NOW
id_aged() { echo "$(( (NOW - $1 * H) * 1000 ))-0"; }

# ---------------------------------------------------------------- cases

test_script_exists() {
  new_case "watcher script exists and is executable-safe"
  if [ -f "$WATCH" ]; then ok; else bad "missing $WATCH"; fi
}

test_nudge_kinds() {
  local kind body expect
  for spec in "ask|short|yes" "reminder|short|yes" "fyi|$LONGBODY|no" "bounce|$LONGBODY|no" "reply|ok thanks|no" "reply|$LONGBODY|yes"; do
    kind="${spec%%|*}"; spec="${spec#*|}"; body="${spec%%|*}"; expect="${spec#*|}"
    new_case "nudge rules: kind=$kind body-length=${#body} -> nudged=$expect"
    dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
    set_state s1 idle
    seed_for s:s1 p:proj
    rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 "$kind" "$body")"
    watch once --nudge
    assert_rc 0 "once ok"
    assert_eq "$expect" "$(nudged main:1.0)" "nudge for $kind"
  done
}

test_nudge_sequence() {
  new_case "nudge: types the text literally, pauses, then presses Enter on the session's pane"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "send-keys -t main:1.0 -l -- You have mail: run /mail read" "$(sed -n 1p "$T/tmuxlog")" "literal text first"
  assert_eq "send-keys -t main:1.0 Enter" "$(sed -n 2p "$T/tmuxlog")" "then Enter"
  assert_eq "2" "$(wc -l < "$T/tmuxlog" | tr -d ' ')" "exactly two tmux calls"
  assert_eq "0" "$(sed -n 1p "$T/sleeplog")" "pause uses MAILBOX_NUDGE_DELAY"
  assert_eq "yes" "$(yn test -s "$CACHE/nudge-s1")" "per-session nudge stamp written"
}

test_nudge_gates() {
  new_case "nudge: busy session is not nudged"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 busy; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "busy"

  new_case "nudge: session with no state file is not nudged"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "unknown state"

  new_case "nudge: session not in tmux (no tmux_target) is not nudged and its inbox is not watched"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' ""; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "not tmux"
  assert_eq "0" "$(count_cmd 'XREAD ')" "no keys to read, no XREAD"

  new_case "nudge: session on another host is not nudged"
  dir_entry s1 proj $((NOW - 60)) "some-other-host" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "other host"

  new_case "nudge: session not seen for 31 minutes whose pane is gone is not nudged"
  dir_entry s1 proj $((NOW - 1860)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  echo "main:1.0" > "$T/deadpanes"
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "stale directory entry, dead pane"

  # Bug (live 2026-10-16, MDTWII fleet): last_seen only refreshes on hook events, so an idle worker
  # (the one that needs a wake) fell out of the 30 min watch window and was never woken.
  new_case "nudge: idle 2 h (last_seen 2 h old) with the pane alive is woken"
  dir_entry s1 proj $((NOW - 2 * H)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "yes" "$(nudged main:1.0)" "idle 2 h, pane alive"
  assert_eq "1" "$(nudges)" "exactly one nudge"

  new_case "nudge: idle 2 h and the pane is gone is not woken"
  dir_entry s1 proj $((NOW - 2 * H)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  echo "main:1.0" > "$T/deadpanes"
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "pane gone"

  new_case "nudge: idle 25 h (past the 24 h session age) is not woken even with the pane alive"
  dir_entry s1 proj $((NOW - 25 * H)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "past the bounce age"

  new_case "nudge: socket|pane target is probed on its own socket and a dead pane is skipped"
  dir_entry s1 proj $((NOW - 2 * H)) "$HOSTN" '[]' "/tmp/tmux-501/fleet|%3"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  echo "%3" > "$T/deadpanes"
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "dead socket pane"

  new_case "nudge: at most one per session per 60 s"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  echo $((NOW - 30)) > "$CACHE/nudge-s1"
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "30 s after the last nudge"
  echo $((NOW - 61)) > "$CACHE/nudge-s1"
  seed_for s:s1 p:proj
  watch once --nudge
  assert_eq "1" "$(nudges)" "61 s after the last nudge"

  new_case "nudge: two messages in one pass still nudge once"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(jq -n -c --arg k "$SKEY" '{($k): [["1700000000500-0",["kind","ask","body","a"]],["1700000000501-0",["kind","ask","body","b"]]]}')"
  watch once --nudge
  assert_eq "1" "$(nudges)" "one nudge"
}

test_nudge_project_and_rooms() {
  new_case "project mail: exactly one idle local session of the project (most recently seen)"
  dir_entry s1 proj $((NOW - 600)) "$HOSTN" '[]' "main:1.0"
  dir_entry s2 proj $((NOW - 30)) "$HOSTN" '[]' "main:2.0"
  dir_entry s3 other $((NOW - 5)) "$HOSTN" '[]' "main:3.0"
  dir_commit
  set_state s1 idle; set_state s2 idle; set_state s3 idle
  seed_for s:s1 s:s2 s:s3 p:proj p:other
  rule "XREAD *" "$(xr "$PKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "1" "$(nudges)" "exactly one nudge"
  assert_eq "yes" "$(nudged main:2.0)" "lowest age wins"

  new_case "project mail: the most recent session is busy -> next idle one"
  dir_entry s1 proj $((NOW - 600)) "$HOSTN" '[]' "main:1.0"
  dir_entry s2 proj $((NOW - 30)) "$HOSTN" '[]' "main:2.0"
  dir_commit
  set_state s1 idle; set_state s2 busy
  seed_for s:s1 s:s2 p:proj
  rule "XREAD *" "$(xr "$PKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "1" "$(nudges)" "one nudge"
  assert_eq "yes" "$(nudged main:1.0)" "the idle one"

  new_case "project mail: stale rows on dead panes are ignored, exactly one live idle pane is picked"
  dir_entry s1 proj $((NOW - 3 * H)) "$HOSTN" '[]' "main:1.0"     # idle, stale, pane alive
  dir_entry s2 proj $((NOW - 30)) "$HOSTN" '[]' "main:2.0"        # newest, idle, pane gone
  dir_entry s3 proj $((NOW - 2 * H)) "$HOSTN" '[]' "main:3.0"     # idle, stale, pane alive, newer than s1
  dir_commit
  set_state s1 idle; set_state s2 idle; set_state s3 idle
  echo "main:2.0" > "$T/deadpanes"
  seed_for s:s1 s:s2 s:s3 p:proj
  rule "XREAD *" "$(xr "$PKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "1" "$(nudges)" "exactly one nudge"
  assert_eq "no" "$(nudged main:2.0)" "dead pane skipped"
  assert_eq "yes" "$(nudged main:3.0)" "newest live idle pane wins"

  new_case "project mail: nobody idle -> nobody nudged"
  dir_entry s1 proj $((NOW - 600)) "$HOSTN" '[]' "main:1.0"
  dir_entry s2 proj $((NOW - 30)) "$HOSTN" '[]' "main:2.0"
  dir_commit
  set_state s1 busy; set_state s2 busy
  seed_for s:s1 s:s2 p:proj
  rule "XREAD *" "$(xr "$PKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "0" "$(nudges)" "all busy"

  new_case "room mail never wakes anyone (stage 6): ask and reminder in a room nudge nobody"
  local RKEY="mbx:michael:r:dev:from:michael"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '["dev"]' "main:1.0"
  dir_entry s2 proj $((NOW - 60)) "$HOSTN" '["dev"]' "main:2.0"
  dir_commit
  set_state s1 idle; set_state s2 idle
  seed_for s:s1 s:s2 p:proj r:dev
  rule "XREAD *" "$(xr "$RKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "no" "$(nudged main:1.0)" "s1 idle subscriber not woken by a room ask"
  assert_eq "no" "$(nudged main:2.0)" "s2 idle subscriber not woken by a room ask"
  assert_eq "0" "$(nudges)" "zero nudges for room mail"

  new_case "room mail never wakes anyone: a project ask still wakes one session"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '["dev"]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj r:dev
  rule "XREAD *" "$(xr "$PKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "yes" "$(nudged main:1.0)" "project ask still nudges"

  # Stage 4b item 1: an outside owner writing straight into Redis at a private session address
  # used to wake the session.
  new_case "receiver policy: mail injected into a private session address never wakes it"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "mbx:michael:s:s1:from:steve" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "no" "$(nudged main:1.0)" "no nudge"
  assert_eq "no" "$(yn has_cmd 'from:steve')" "outside-owner key of a private address not watched"

  new_case "receiver policy: a public project address is watched for outside owners"
  set_public "me p/proj"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "mbx:michael:p:proj:from:steve" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "yes" "$(yn has_cmd 'mbx:michael:p:proj:from:steve')" "watched"
  assert_eq "yes" "$(nudged main:1.0)" "nudged"
  assert_eq "no" "$(yn has_cmd 'mbx:michael:s:s1:from:steve')" "the session address stays private"
}

test_nudge_reads() {
  new_case "XREAD: one connection call, own last ids, no BLOCK in once, person inbox not watched"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  watch once --nudge
  assert_rc 0 "ok"
  assert_eq "1" "$(count_cmd 'XREAD ')" "one XREAD for all keys"
  assert_eq "yes" "$(yn has_cmd "$SKEY")" "session key"
  assert_eq "yes" "$(yn has_cmd "$PKEY")" "project key"
  assert_eq "no" "$(yn has_cmd "mbx:michael:s:s1:from:steve")" "no contact-owner key for a private session"
  assert_eq "yes" "$(yn has_cmd "STREAMS $PKEY $SKEY 1699999999999-0 1699999999999-0")" "stored ids used"
  assert_eq "no" "$(yn has_cmd 'BLOCK')" "no BLOCK without MAILBOX_WATCH_BLOCK_MS in once"
  assert_eq "no" "$(yn has_cmd ':me:from:')" "person inbox is never watched"
  assert_eq "no" "$(yn has_cmd 'XREADGROUP')" "plain XREAD never consumes a group"
  assert_eq "no" "$(yn has_cmd 'XGROUP')" "no group created"
  assert_eq "no" "$(yn has_cmd 'SET seen:')" "no reader marker moved"

  new_case "XREAD: BLOCK passed when MAILBOX_WATCH_BLOCK_MS is set"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  WENV=(MAILBOX_WATCH_BLOCK_MS=7)
  watch once --nudge
  assert_eq "yes" "$(yn has_cmd 'BLOCK 7')" "BLOCK 7"

  new_case "ids: first sight of a key starts at the stream's newest id, so mail landing later is not missed"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle
  rm -f "$CACHE/watch-ids"
  rule "XREVRANGE $SKEY *" '[["1700000000100-0",["kind","fyi"]]]'
  watch once --nudge
  assert_eq "yes" "$(yn has_cmd "XREVRANGE $SKEY + - COUNT 1")" "seeded from XREVRANGE"
  assert_contains "$(cat "$CACHE/watch-ids")" "$SKEY|1700000000100-0" "newest id stored"
  assert_contains "$(cat "$CACHE/watch-ids")" "$PKEY|0-0" "empty stream starts at 0-0"
  assert_eq "0" "$(nudges)" "old mail never nudges"

  new_case "ids: reply advances the stored id; flat (RESP2) reply shape works"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr_flat "$SKEY" 1700000000777-3 ask hello)"
  watch once --nudge
  assert_contains "$(cat "$CACHE/watch-ids")" "$SKEY|1700000000777-3" "id advanced"
  assert_eq "yes" "$(nudged main:1.0)" "nudged from the flat shape"
  assert_eq "1" "$(grep -c -F "$SKEY|" "$CACHE/watch-ids")" "one line per key"

  new_case "ids: keys of departed sessions are pruned from the ids file"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj s:gone
  watch once --nudge
  assert_eq "no" "$(yn grep -q 'gone' "$CACHE/watch-ids")" "departed key pruned"

  new_case "directory flat-array shape is understood"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit_flat
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "yes" "$(nudged main:1.0)" "nudged"
}

test_lifecycle_lock() {
  new_case "lifecycle: lock taken with SET NX EX 60 and the host name"
  watch once --lifecycle
  assert_rc 0 "ok"
  assert_eq "yes" "$(yn has_cmd "SET lock:michael:lifecycle $HOSTN NX EX 60")" "lock command"
  assert_eq "yes" "$(yn has_cmd "ZRANGEBYSCORE due:michael")" "ran the jobs"

  new_case "lifecycle: lock not acquired -> no lifecycle work at all"
  rule "SET lock:michael:lifecycle *" ""
  watch once --lifecycle
  assert_rc 0 "ok"
  assert_eq "no" "$(yn has_cmd 'ZRANGEBYSCORE')" "no send-later"
  assert_eq "no" "$(yn has_cmd 'HGETALL')" "no directory read"
  assert_eq "no" "$(yn has_cmd 'XADD')" "nothing written"
  assert_eq "no" "$(yn has_cmd 'XDEL')" "nothing deleted"

  new_case "lifecycle: lock reply (nil) also means not acquired"
  rule "SET lock:michael:lifecycle *" "(nil)"
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd 'ZRANGEBYSCORE')" "no send-later"
}

DUE_KEY="mbx:michael:p:proj:from:michael"
mkdue() { # KEY KIND BODY
  jq -n -c --arg k "$1" --arg kind "$2" --arg body "$3" \
    '{key:$k, uid:"u1", fields:{from:"michael/me", to:"michael/p/proj", kind:$kind, body:$body, sent_at:"1699999000", thread:"t-d", hops:"0", msg_id:"dm-1"}}'
}
test_send_later_delivery() {
  new_case "send-later: claim, then XADD with the stored msg_id, then ZREM; EXPIRE and log entry"
  local m; m="$(mkdue "$DUE_KEY" reminder "stand up at 9")"
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  watch once --lifecycle
  assert_rc 0 "ok"
  assert_eq "yes" "$(yn has_cmd "ZRANGEBYSCORE due:michael -inf $NOW")" "due members up to now"
  local c z x
  c="$(line_of "SET claim:michael:dm-1 $HOSTN NX EX 120")"; x="$(line_of "XADD $DUE_KEY MAXLEN ~ 500 *")"; z="$(line_of 'ZREM due:michael')"
  assert_eq "yes" "$(yn test -n "$c" -a -n "$x" -a -n "$z")" "claim, XADD and ZREM all issued ($c $x $z)"
  assert_eq "yes" "$(yn test "${c:-9}" -lt "${x:-0}" -a "${x:-9}" -lt "${z:-0}")" "order: claim < XADD < ZREM"
  local xadd; xadd="$(cmds | grep -F "XADD $DUE_KEY" | head -1)"
  assert_contains "$xadd" "msg_id dm-1" "stored msg_id carried"
  assert_contains "$xadd" "kind reminder" "kind kept"
  assert_contains "$xadd" "body stand up at 9" "body kept"
  assert_contains "$xadd" "thread t-d" "thread kept"
  assert_contains "$xadd" "deliver_at $NOW" "deliver_at stamped"
  assert_eq "yes" "$(yn has_cmd "EXPIRE $DUE_KEY 2592000")" "expiry set"
  assert_eq "yes" "$(yn has_cmd 'XADD log:michael')" "log entry written"
  assert_eq "no" "$(yn has_cmd 'ZADD due:')" "nothing put back"

  new_case "send-later: person inbox target has no MAXLEN"
  m="$(mkdue "mbx:michael:me:from:michael" reminder "call mum")"
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  watch once --lifecycle
  assert_eq "yes" "$(yn has_cmd "XADD mbx:michael:me:from:michael * ")" "XADD without MAXLEN"

  # Stage 4b item 4 (Operations review): ZREM-first lost the reminder if the watcher died before XADD.
  new_case "send-later crash after claim, before XADD: the claim expires and a later pass delivers"
  m="$(mkdue "$DUE_KEY" reminder "stand up at 9")"
  rule "SET claim:*" ""                      # pass 1: the dead watcher's claim is still live
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  watch once --lifecycle
  assert_rc 0 "a held claim is not a failure"
  assert_eq "no" "$(yn has_cmd "XADD $DUE_KEY")" "no delivery while claimed"
  assert_eq "no" "$(yn has_cmd 'ZREM due:')" "still queued"
  : > "$T/rules"; rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  watch once --lifecycle                     # pass 2: claim expired
  assert_eq "1" "$(count_cmd "XADD $DUE_KEY")" "delivered once the claim expired"
  assert_eq "yes" "$(yn has_cmd 'ZREM due:michael')" "removed after delivery"

  new_case "send-later crash after XADD, before ZREM: re-XADD with the same msg_id, receiver shows it once"
  m="$(mkdue "$DUE_KEY" reminder "stand up at 9")"
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  rule "ZREM due:michael *" '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  watch once --lifecycle                     # pass 1: XADD lands, the ZREM reply is lost
  assert_eq "1" "$RC" "pass reports the unfinished delivery"
  : > "$T/rules"; rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  watch once --lifecycle                     # pass 2: claim expired, still due
  assert_eq "2" "$(count_cmd "XADD $DUE_KEY")" "delivered twice to the stream"
  assert_eq "2" "$(cmds | grep -F "XADD $DUE_KEY" | grep -c -F 'msg_id dm-1')" "both copies carry msg_id dm-1"
  # the receiver sees both stream entries and shows one
  : > "$T/rules"
  rule "XREADGROUP GROUP readers * STREAMS $DUE_KEY 0" "$(jq -n -c --arg k "$DUE_KEY" '{($k): [["1700000000100-0",["from","michael/me","to","michael/p/proj","kind","reminder","body","stand up at 9","msg_id","dm-1"]],["1700000000200-0",["from","michael/me","to","michael/p/proj","kind","reminder","body","stand up at 9","msg_id","dm-1"]]]}')"
  run_env bash "$MB" read --as michael/p/proj
  assert_eq "1" "$(printf '%s\n' "$OUT" | grep -c '"msg_id":"dm-1"')" "shown once"
  assert_eq "yes" "$(yn has_cmd "XACK $DUE_KEY readers 1700000000100-0 1700000000200-0")" "both acknowledged"

  new_case "send-later: two watchers racing on one member deliver it once"
  m="$(mkdue "$DUE_KEY" reminder "stand up at 9")"
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  watch once --lifecycle          # watcher A wins the claim
  : > "$T/rules"
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  rule "SET claim:*" ""
  watch once --lifecycle          # watcher B loses the claim
  assert_eq "1" "$(count_cmd "XADD $DUE_KEY")" "one XADD across both watchers"

  new_case "send-later: XADD fails -> no ZREM, entry stays queued, pass reports the failure"
  m="$(mkdue "$DUE_KEY" reminder "stand up at 9")"
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  rule "XADD mbx:*" '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd 'ZREM due:')" "not removed"
  assert_eq "1" "$RC" "once exits 1 when a job failed"
  assert_eq "yes" "$(yn test -s "$CACHE/watch.log")" "failure logged"
  assert_not_contains "$(cat "$CACHE/watch.log")" "$PASSWORD" "no secret in the log"

  new_case "send-later: a member queued before msg_ids gets a stable derived id on every pass"
  m="$(mkdue "$DUE_KEY" reminder "old style" | jq -c 'del(.fields.msg_id)')"
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  rule "ZREM due:michael *" '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  watch once --lifecycle; watch once --lifecycle
  local ids; ids="$(cmds | grep -F "XADD $DUE_KEY" | grep -o -E 'msg_id l-[0-9]+' | sort -u)"
  assert_eq "1" "$(printf '%s\n' "$ids" | grep -c .)" "one derived id across passes ($ids)"
  assert_eq "yes" "$(yn has_cmd "SET claim:michael:${ids#msg_id } ")" "claim uses the derived id"

  new_case "send-later: a member whose key is not one of this owner's own :from: keys is dropped"
  m="$(mkdue "mbx:steve:me:from:steve" reminder "forged")"
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]')"
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd "XADD mbx:steve")" "forged target not written"

  new_case "send-later: body with a newline survives delivery as one argument"
  m="$(mkdue "$DUE_KEY" reminder $'line one\nline two')"
  # the fake prints replies through printf %b, so double the backslashes of an escaped newline
  rule "ZRANGEBYSCORE due:michael *" "$(jq -n -c --arg m "$m" '[$m]' | sed 's/\\/\\\\/g')"
  watch once --lifecycle
  assert_eq "yes" "$(yn bash -c "tr '\n' '~' < '$T/calls' | grep -q -F \"$(printf 'body\tline one~line two')\"")" "newline body kept inside one argument"
}

SK_S1="mbx:michael:s:s1:from:michael"
bounce_setup() { # session-age: s1 is a directory session on another host, seen 1 h ago
  dir_entry s1 proj $((NOW - H)) "elsewhere" '[]' ""
}
test_bounce_sessions() {
  local e23 e25
  e23="$(id_aged 23)"; e25="$(id_aged 25)"

  new_case "bounce session mail: 23 h old is kept, 25 h old is bounced to the sender session"
  bounce_setup; dir_entry sender1 proj $((NOW - H)) "elsewhere" '[]' ""; dir_commit
  rule "XRANGE $SK_S1 *" "$(printf '%s\n%s\n' "$(xe "$e23" michael/s/sender1 ask 'young one' michael/s/s1)" "$(xe "$e25" michael/s/sender1 ask 'old one body' michael/s/s1)" | jq -s -c .)"
  watch once --lifecycle
  assert_rc 0 "ok"
  assert_eq "yes" "$(yn has_cmd "SET done:michael:$e25")" "done marker for the 25 h entry"
  assert_eq "no" "$(yn has_cmd "SET done:michael:$e23")" "no done marker for the 23 h entry"
  assert_eq "yes" "$(yn has_cmd "SET done:michael:$e25:" && has_cmd " 1 EX 604800")" "marker has a 7 day expiry"
  local bx; bx="$(cmds | grep -F 'XADD mbx:michael:s:sender1:from:michael' | head -1)"
  assert_contains "$bx" "MAXLEN ~ 500" "session inbox is capped"
  assert_contains "$bx" "kind bounce" "kind bounce"
  assert_contains "$bx" "undelivered: michael/s/s1 has not read this since 2023-11-13T21:13Z: old one body" "bounce body"
  assert_contains "$bx" "reply_to $e25" "points at the original"
  assert_contains "$bx" "msg_id b-" "bounce carries a stable msg_id"
  assert_eq "yes" "$(yn has_cmd "XDEL $SK_S1 $e25")" "original deleted"
  assert_eq "no" "$(yn has_cmd "XDEL $SK_S1 $e23")" "young one kept"
  # Stage 4b item 5: marker-first meant a failed XADD suppressed the bounce for 7 days.
  local d x; d="$(line_of "SET done:michael:$e25")"; x="$(line_of 'XADD mbx:michael:s:sender1')"
  assert_eq "yes" "$(yn test "${x:-9}" -lt "${d:-0}" -a "${d:-9}" -lt "$(line_of "XDEL $SK_S1")")" "order: XADD bounce, done marker, XDEL"
  assert_eq "yes" "$(yn has_cmd "XRANGE $SK_S1 (0-0 $(( (NOW - 24 * H) * 1000 )) COUNT 100")" "asks only for entries after the marker and older than 24 h"

  new_case "bounce: reader marker is honoured (range starts after the marker)"
  bounce_setup; dir_commit
  rule "GET seen:michael:s1:*" "1699000000000-5"
  watch once --lifecycle
  assert_eq "yes" "$(yn has_cmd "XRANGE $SK_S1 (1699000000000-5 ")" "starts after the marker"

  new_case "bounce: done marker already set -> no second bounce, the removal is finished"
  bounce_setup; dir_entry sender1 proj $((NOW - H)) "elsewhere" '[]' ""; dir_commit
  rule "XRANGE $SK_S1 *" "$(xe "$e25" michael/s/sender1 ask 'old one' michael/s/s1 | jq -s -c .)"
  rule "GET done:*" "1"
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd "XADD mbx:michael:s:sender1")" "no bounce"
  assert_eq "yes" "$(yn has_cmd "XDEL $SK_S1 $e25")" "original removed (a crash before XDEL is finished)"

  new_case "bounce: XADD fails -> no done marker, no delete; a later pass retries with the same msg_id"
  bounce_setup; dir_entry sender1 proj $((NOW - H)) "elsewhere" '[]' ""; dir_commit
  rule "XRANGE $SK_S1 *" "$(xe "$e25" michael/s/sender1 ask 'retry me' michael/s/s1 | jq -s -c .)"
  rule "XADD mbx:*" '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd 'SET done:')" "no marker after a failed write"
  assert_eq "no" "$(yn has_cmd 'XDEL')" "original kept"
  local mid1; mid1="$(grep '^ARGV' "$T/calls" | grep -F 'XADD' | grep -F 'mbx:michael:s:sender1' | tr '\t' '\n' | grep -A1 -x msg_id | tail -1)"
  : > "$T/rules"; dir_commit
  rule "XRANGE $SK_S1 *" "$(xe "$e25" michael/s/sender1 ask 'retry me' michael/s/s1 | jq -s -c .)"
  watch once --lifecycle
  assert_eq "yes" "$(yn has_cmd "SET done:michael:$e25")" "marker set on the retry"
  assert_eq "yes" "$(yn has_cmd "XDEL $SK_S1 $e25")" "original removed on the retry"
  local mid2; mid2="$(grep '^ARGV' "$T/calls" | grep -F 'XADD' | grep -F 'mbx:michael:s:sender1' | tr '\t' '\n' | grep -A1 -x msg_id | tail -1)"
  assert_eq "$mid1" "$mid2" "retry carries the same msg_id ($mid1)"
  assert_contains "$mid1" "b-" "bounce msg_id shape"

  new_case "bounce target: sender session not in the directory -> sender owner's me"
  bounce_setup; dir_commit
  rule "XRANGE $SK_S1 *" "$(xe "$e25" michael/s/ghost ask 'old one' michael/s/s1 | jq -s -c .)"
  watch once --lifecycle
  assert_eq "yes" "$(yn has_cmd "XADD mbx:michael:me:from:michael * ")" "to michael/me, no MAXLEN"
  assert_eq "no" "$(yn has_cmd "mbx:michael:s:ghost")" "not to the dead session"

  new_case "bounce target: sender session not seen for 25 h -> sender owner's me"
  bounce_setup; dir_entry sender1 proj $((NOW - 25 * H)) "elsewhere" '[]' ""; dir_commit
  rule "XRANGE $SK_S1 *" "$(xe "$e25" michael/s/sender1 ask 'old one' michael/s/s1 | jq -s -c .)"
  watch once --lifecycle
  assert_eq "yes" "$(yn has_cmd "XADD mbx:michael:me:from:michael * ")" "to michael/me"

  new_case "bounce target: sender is a person inbox -> that inbox"
  bounce_setup; dir_commit
  rule "XRANGE $SK_S1 *" "$(xe "$e25" michael/me ask 'old one' michael/s/s1 | jq -s -c .)"
  watch once --lifecycle
  assert_eq "yes" "$(yn has_cmd "XADD mbx:michael:me:from:michael * ")" "to michael/me"

  new_case "bounce target: cross-owner sender -> mbx:steve:me:from:michael (a key the ACL allows)"
  set_public "me s/s1"   # outside mail reaches a session only when that address is public
  bounce_setup; dir_commit
  rule "XRANGE mbx:michael:s:s1:from:steve *" "$(xe "$e25" steve/s/x ask 'from steve' michael/s/s1 | jq -s -c .)"
  watch once --lifecycle
  assert_eq "yes" "$(yn has_cmd "XADD mbx:steve:me:from:michael * ")" "bounce into steve's from:michael key"
  assert_eq "yes" "$(yn has_cmd "XDEL mbx:michael:s:s1:from:steve $e25")" "original deleted from our copy"

  new_case "receiver policy: bounce never scans an outside owner's key for a private address"
  bounce_setup; dir_commit
  rule "XRANGE mbx:michael:s:s1:from:steve *" "$(xe "$e25" steve/s/x ask 'injected' michael/s/s1 | jq -s -c .)"
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd 'XRANGE mbx:michael:s:s1:from:steve')" "not scanned"
  assert_eq "no" "$(yn has_cmd 'XADD mbx:steve')" "nothing written to the outside owner"

  new_case "bounces never bounce: an unread bounce is left alone"
  bounce_setup; dir_commit
  rule "XRANGE $SK_S1 *" "$(xe "$e25" michael/me bounce 'undelivered: x' michael/s/s1 | jq -s -c .)"
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd "SET done:")" "no marker"
  assert_eq "no" "$(yn has_cmd "XADD mbx:")" "no new bounce"
  assert_eq "no" "$(yn has_cmd "XDEL")" "not deleted"

  new_case "bounce never touches a session's rooms or the person inbox"
  bounce_setup; dir_commit
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd "XRANGE mbx:michael:r:")" "rooms not scanned"
  assert_eq "no" "$(yn has_cmd "XRANGE mbx:michael:me:")" "person inbox not scanned"
}

PK_RANGE_CUT() { echo $(( (NOW - $1 * 24 * H) * 1000 )); }
test_bounce_projects() {
  local p6 p8; p6="$(id_aged $((6 * 24)))"; p8="$(id_aged $((8 * 24)))"
  new_case "bounce project mail: pending entries, 6 d kept, 8 d bounced then XACK then XDEL"
  bounce_setup; dir_entry sender1 proj $((NOW - H)) "elsewhere" '[]' ""; dir_commit
  rule "XPENDING $PKEY readers - + 100" "$(jq -n -c --arg a "$p6" --arg b "$p8" '[[$a,"s1",600000,1],[$b,"s1",600000,2]]')"
  rule "XRANGE $PKEY $p8 $p8" "$(xe "$p8" michael/s/sender1 ask 'stuck project mail' michael/p/proj | jq -s -c .)"
  rule "XRANGE $PKEY $p6 $p6" "$(xe "$p6" michael/s/sender1 ask 'not yet' michael/p/proj | jq -s -c .)"
  watch once --lifecycle
  assert_rc 0 "ok"
  assert_eq "yes" "$(yn has_cmd "SET done:michael:$p8")" "8 d marker"
  assert_eq "no" "$(yn has_cmd "SET done:michael:$p6")" "6 d no marker"
  assert_eq "yes" "$(yn has_cmd "XADD mbx:michael:s:sender1:from:michael")" "bounced to the sender"
  assert_contains "$(cmds | grep -F 'XADD mbx:michael:s:sender1' | head -1)" "stuck project mail" "body quoted"
  local a d; a="$(line_of "XACK $PKEY readers $p8")"; d="$(line_of "XDEL $PKEY $p8")"
  assert_eq "yes" "$(yn test -n "$a" -a -n "$d" -a "${a:-9}" -lt "${d:-0}")" "XACK (line $a) before XDEL (line $d)"
  assert_eq "no" "$(yn has_cmd "XDEL $PKEY $p6")" "6 d entry kept"

  new_case "bounce project mail: entries after the group's last-delivered-id (never delivered) are bounced at 7 d"
  bounce_setup; dir_entry sender1 proj $((NOW - H)) "elsewhere" '[]' ""; dir_commit
  rule "XINFO GROUPS $PKEY" '[{"name":"readers","consumers":1,"pending":0,"last-delivered-id":"1600000000000-0"}]'
  rule "XRANGE $PKEY (1600000000000-0 *" "$(xe "$p8" michael/s/sender1 ask 'never taken' michael/p/proj | jq -s -c .)"
  watch once --lifecycle
  assert_eq "yes" "$(yn has_cmd "XRANGE $PKEY (1600000000000-0 $(PK_RANGE_CUT 7) COUNT 100")" "range after last-delivered-id, 7 d cutoff"
  assert_eq "yes" "$(yn has_cmd "XDEL $PKEY $p8")" "deleted"

  new_case "bounce project mail: XINFO flat (RESP2) group shape"
  bounce_setup; dir_commit
  rule "XINFO GROUPS $PKEY" '[["name","readers","consumers",1,"pending",0,"last-delivered-id","1600000000000-0"]]'
  watch once --lifecycle
  assert_eq "yes" "$(yn has_cmd "XRANGE $PKEY (1600000000000-0 ")" "flat shape parsed"

  new_case "bounce project mail: done marker set elsewhere -> no second bounce, removal finished"
  bounce_setup; dir_commit
  rule "XPENDING $PKEY readers - + 100" "$(jq -n -c --arg b "$p8" '[[$b,"s1",600000,2]]')"
  rule "XRANGE $PKEY $p8 $p8" "$(xe "$p8" michael/s/sender1 ask 'stuck' michael/p/proj | jq -s -c .)"
  rule "GET done:*" "1"
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd "XADD mbx:michael:s:sender1")" "no second bounce"
  assert_eq "yes" "$(yn has_cmd "XACK $PKEY readers $p8")" "ack finished"
  assert_eq "yes" "$(yn has_cmd "XDEL $PKEY $p8")" "delete finished"
}

test_expiry() {
  local e1h; e1h="$(id_aged 1)"
  new_case "expiry: session unseen 8 d -> unread bounced first (any age), then inbox keys and markers DEL, then HDEL"
  dir_entry old1 proj $((NOW - 8 * 24 * H)) "elsewhere" '["dev"]' ""
  dir_entry sender1 proj $((NOW - H)) "elsewhere" '[]' ""
  dir_commit
  rule "XRANGE mbx:michael:s:old1:from:michael *" "$(xe "$e1h" michael/s/sender1 ask 'only an hour old' michael/s/old1 | jq -s -c .)"
  watch once --lifecycle
  assert_rc 0 "ok"
  local b d h
  b="$(line_of 'XADD mbx:michael:s:sender1:from:michael')"; d="$(line_of_re '^DEL mbx:michael:s:old1:from:michael')"; h="$(line_of 'HDEL dir:michael michael/s/old1')"
  assert_eq "yes" "$(yn test -n "$b" -a -n "$d" -a -n "$h")" "bounce, DEL and HDEL all issued ($b $d $h)"
  assert_eq "yes" "$(yn test "${b:-9}" -lt "${d:-0}" -a "${d:-9}" -lt "${h:-0}")" "order: bounce < DEL < HDEL"
  assert_contains "$(cmds | grep -E '^DEL mbx:michael:s:old1' | head -1)" "mbx:michael:s:old1:from:steve" "both owners' keys deleted"
  assert_contains "$(cmds | grep -E '^DEL mbx:michael:s:old1' | head -1)" "seen:michael:old1:" "reader markers deleted"
  assert_eq "no" "$(yn has_re '^DEL mbx:michael:s:sender1')" "live session untouched"
  assert_eq "no" "$(yn has_cmd 'HDEL dir:michael michael/s/sender1')" "live entry kept"

  new_case "expiry: bounce fails -> inbox is NOT deleted"
  dir_entry old1 proj $((NOW - 8 * 24 * H)) "elsewhere" '[]' ""
  dir_entry sender1 proj $((NOW - H)) "elsewhere" '[]' ""
  dir_commit
  rule "XRANGE mbx:michael:s:old1:from:michael *" "$(xe "$e1h" michael/s/sender1 ask 'precious' michael/s/old1 | jq -s -c .)"
  rule "XADD mbx:*" '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  watch once --lifecycle
  assert_eq "no" "$(yn has_re '^DEL ')" "no DEL after a failed bounce"
  assert_eq "no" "$(yn has_cmd 'HDEL')" "no HDEL after a failed bounce"

  new_case "expiry: session unseen 6 d is kept"
  dir_entry old1 proj $((NOW - 6 * 24 * H)) "elsewhere" '[]' ""
  dir_commit
  watch once --lifecycle
  assert_eq "no" "$(yn has_cmd 'HDEL')" "kept"
  assert_eq "no" "$(yn has_re '^DEL ')" "kept"
}

test_run_loop() {
  new_case "run: a Redis error is logged once per pass, backs off 5 s then 10 s, never exits, no secret logged"
  rule 'HGETALL *' '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  WENV=(MAILBOX_WATCH_MAX_PASSES=3 MAILBOX_WATCH_BLOCK_MS=1)
  watch run
  assert_rc 0 "run survives redis errors"
  assert_eq "yes" "$(yn test -s "$CACHE/watch.log")" "log written"
  assert_not_contains "$(cat "$CACHE/watch.log")" "$PASSWORD" "no secret in the log"
  assert_contains "$(cat "$T/sleeplog")" "5" "first back-off 5 s"
  assert_contains "$(cat "$T/sleeplog")" "10" "second back-off 10 s"
  assert_eq "yes" "$(yn grep -q -E '^[0-9T:-]+Z ' "$CACHE/watch.log")" "log lines are timestamped"

  new_case "run: back-off caps at 60 s"
  rule 'HGETALL *' '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  WENV=(MAILBOX_WATCH_MAX_PASSES=8)
  watch run
  assert_eq "60" "$(sort -n "$T/sleeplog" | tail -1)" "cap is 60"

  new_case "run: healthy passes do not back off, and use BLOCK from MAILBOX_WATCH_BLOCK_MS"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  WENV=(MAILBOX_WATCH_MAX_PASSES=2 MAILBOX_WATCH_BLOCK_MS=4000)
  watch run
  assert_rc 0 "ok"
  assert_eq "yes" "$(yn has_cmd 'BLOCK 4000')" "BLOCK from env"
  assert_eq "2" "$(count_cmd 'XREAD ')" "one XREAD per pass"
  assert_eq "no" "$(yn grep -q -E '^(5|10|20|40|60)$' "$T/sleeplog")" "no back-off sleeps"

  new_case "once: redis down -> exit 1 and one log line per failed part"
  rule 'HGETALL *' '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  watch once
  assert_rc 1 "once reports failure"
  assert_eq "yes" "$(yn test -s "$CACHE/watch.log")" "log written"

  new_case "no config -> exit 78 with a clear message"
  rm -f "$T/env"
  watch once
  assert_rc 78 "no config"
}

test_install_systemd() {
  new_case "nudge: socket|pane target runs tmux -S <socket> send-keys -t <pane>"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "/tmp/tmux-501/fleet|%3"; dir_commit
  set_state s1 idle; seed_for s:s1 p:proj
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  watch once --nudge
  assert_eq "-S /tmp/tmux-501/fleet send-keys -t %3 -l -- You have mail: run /mail read" "$(sed -n 1p "$T/tmuxlog")" "literal text on the socket's pane"
  assert_eq "-S /tmp/tmux-501/fleet send-keys -t %3 Enter" "$(sed -n 2p "$T/tmuxlog")" "then Enter"

  new_case "install-systemd: refuses on macOS, writes nothing, never calls systemctl"
  printf '#!/usr/bin/env bash\necho Darwin\n' > "$T/bin/uname"; chmod +x "$T/bin/uname"
  watch install-systemd
  if [ "$RC" != 0 ]; then ok; else bad "should refuse on macOS"; fi
  assert_contains "$ERR" "run" "message tells the user to start 'run' by hand"
  assert_contains "$ERR" "mailbox-watch.sh run" "names the exact command"
  assert_eq "no" "$(yn test -e "$T/home/.config/systemd/user/cfn-mailbox-watch.service")" "no unit file"
  assert_eq "0" "$(wc -c < "$T/sysctllog" | tr -d ' ')" "systemctl never called"

  new_case "install-systemd: on Linux writes the unit under HOME and enables it via the fake systemctl"
  printf '#!/usr/bin/env bash\necho Linux\n' > "$T/bin/uname"; chmod +x "$T/bin/uname"
  watch install-systemd
  assert_rc 0 "ok"
  local unit="$T/home/.config/systemd/user/cfn-mailbox-watch.service"
  assert_eq "yes" "$(yn test -f "$unit")" "unit written"
  assert_contains "$(cat "$unit" 2>/dev/null)" "ExecStart=" "ExecStart"
  assert_contains "$(cat "$unit" 2>/dev/null)" "mailbox-watch.sh\" run" "runs the watcher in run mode"
  assert_contains "$(cat "$unit" 2>/dev/null)" "Restart=always" "restarts"
  assert_contains "$(cat "$unit" 2>/dev/null)" "WantedBy=default.target" "user target"
  assert_not_contains "$(cat "$unit" 2>/dev/null)" "$PASSWORD" "no secret in the unit"
  assert_eq "--user daemon-reload" "$(sed -n 1p "$T/sysctllog")" "daemon-reload first"
  assert_eq "--user enable --now cfn-mailbox-watch.service" "$(sed -n 2p "$T/sysctllog")" "enable --now"
  assert_eq "0" "$(count_cmd 'PING')" "install does not touch redis"

  new_case "install-systemd: custom MAILBOX_CONFIG is carried into the unit"
  printf '#!/usr/bin/env bash\necho Linux\n' > "$T/bin/uname"; chmod +x "$T/bin/uname"
  watch install-systemd
  assert_contains "$(cat "$T/home/.config/systemd/user/cfn-mailbox-watch.service" 2>/dev/null)" "Environment=MAILBOX_CONFIG=$T/env" "config path"

  new_case "status: prints without redis and without a config"
  rm -f "$T/env"
  watch status
  assert_rc 0 "ok"
  assert_eq "0" "$(count_cmd 'PING')" "no redis"
}

# ---------------------------------------------------------------- send --at

test_send_at() {
  local z
  zadd_score() { cmds | grep -F 'ZADD due:michael' | head -1 | awk '{print $3}'; }
  zadd_member() { grep '^ARGV' "$T/calls" | grep -F 'ZADD' | head -1 | awk -F'\t' '{print $NF}'; }

  new_case "--at epoch seconds"
  mbsend michael/p/proj --at 1700003600 "stand up"
  assert_rc 0 "ok"
  assert_eq "1700003600" "$(zadd_score)" "score is the epoch"
  assert_eq "no" "$(yn has_cmd 'XADD mbx:')" "nothing delivered now"
  assert_contains "$OUT" "2023-11-14T23:13:20Z" "UTC time printed"
  assert_contains "$OUT" "UTC" "UTC label"
  assert_contains "$OUT" "local" "local time printed"
  assert_eq "reminder" "$(zadd_member | jq -r '.fields.kind')" "kind defaults to reminder"
  assert_eq "mbx:michael:p:proj:from:michael" "$(zadd_member | jq -r '.key')" "target key"
  assert_eq "stand up" "$(zadd_member | jq -r '.fields.body')" "body"
  assert_eq "michael/me" "$(zadd_member | jq -r '.fields.from')" "from"
  assert_eq "yes" "$(yn bash -c "[ -n \"\$(printf '%s' '$(zadd_member)' | jq -r '.uid')\" ]")" "member has a uid (so identical sends do not collapse)"

  new_case "--at +30m / +2h / +1d"
  mbsend michael/me --at +30m "a"; assert_eq "$((NOW + 1800))" "$(zadd_score)" "+30m"
  : > "$T/calls"
  mbsend michael/me --at +2h "a"; assert_eq "$((NOW + 7200))" "$(zadd_score)" "+2h"
  : > "$T/calls"
  mbsend michael/me --at +1d "a"; assert_eq "$((NOW + 86400))" "$(zadd_score)" "+1d"

  new_case "--at keeps an explicit --kind"
  mbsend michael/p/proj --at +5m --kind ask "q?"
  assert_eq "ask" "$(zadd_member | jq -r '.fields.kind')" "explicit kind kept"

  new_case "--at HH:MM is local time: later today / next occurrence tomorrow (TZ=UTC+9)"
  WENV=(TZ=Etc/GMT-9)           # local now = 2023-11-15 07:13:20 +0900
  mbsend michael/me --at 09:00 "a"
  assert_eq "1700006400" "$(zadd_score)" "09:00 local today = 2023-11-15T00:00Z"
  assert_contains "$OUT" "2023-11-15T00:00:00Z" "UTC shown"
  assert_contains "$OUT" "09:00" "local shown"
  : > "$T/calls"
  mbsend michael/me --at 07:00 "a"
  assert_eq "1700085600" "$(zadd_score)" "07:00 already passed -> tomorrow 07:00 local = 2023-11-15T22:00Z"
  : > "$T/calls"
  mbsend michael/me --at 7:13 "a"
  assert_eq "1700086380" "$(zadd_score)" "7:13 (earlier than 07:13:20) -> tomorrow"

  new_case "--at YYYY-MM-DDTHH:MM is local time"
  WENV=(TZ=Etc/GMT-9)
  mbsend michael/me --at 2023-11-20T09:30 "a"
  assert_eq "1700440200" "$(zadd_score)" "2023-11-20 09:30 +0900 = 00:30Z"
  new_case "--at ISO in UTC zone"
  mbsend michael/me --at 2023-11-20T09:30 "a"
  assert_eq "1700472600" "$(zadd_score)" "2023-11-20 09:30Z"

  new_case "--at rejects nonsense with exit 2 and queues nothing"
  local bad_at
  for bad_at in "tomorrow" "25:00" "09:75" "+5x" "+m" "2023-13-01T10:00" "2023-02-31T10:00" "" "12"; do
    : > "$T/calls"
    mbsend michael/me --at "$bad_at" "a"
    if [ "$RC" = 2 ]; then ok; else bad "--at [$bad_at]: expected exit 2, got $RC"; fi
    assert_eq "no" "$(yn has_cmd 'ZADD')" "nothing queued for [$bad_at]"
  done
  new_case "--at needs a value"
  mbsend michael/me "a" --at
  assert_rc 2 "missing value"

  new_case "MAILBOX_NOW overrides the clock everywhere (thread name uses it)"
  mbsend michael/me --at +1m "a"
  assert_contains "$ERR" "thread=t-$NOW-" "fake clock in the thread id"

  new_case "plain send still works and still defaults to fyi"
  mbsend michael/me "hello"
  assert_rc 0 "ok"
  assert_contains "$(cmds | grep -F 'XADD mbx:michael:me:from:michael' | head -1)" "kind fyi" "fyi"
  assert_eq "no" "$(yn has_cmd 'ZADD')" "not queued"
  z=1
}

# ---------------------------------------------------------------- hook idle/busy state

SID="abc123def456"
SESS="my-proj-abc123"
hook() {
  RC=0
  OUT="$(printf '%s' "$1" | env -u MAILBOX_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u TMUX_PANE \
    PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" CFN_MAILBOX_HOOK_TIMEOUT=30 bash "$HOOK" 2>"$T/stderr")" || RC=$?
  ERR="$(cat "$T/stderr")"
}
ev() {
  local extra="${2:-}"
  [ -n "$extra" ] || extra='{}'
  jq -n -c --arg e "$1" --arg sid "$SID" --arg cwd "$T/work/My_Proj" --argjson x "$extra" '{hook_event_name:$e, session_id:$sid, cwd:$cwd} + $x'
}
state_of() { cat "$CACHE/state-$SESS" 2>/dev/null || echo "(none)"; }
state_re() { case "$(state_of)" in "$1 "[0-9]*) return 0 ;; *) return 1 ;; esac; }
hook_msg() { # kind -> a session-inbox XREAD reply
  jq -n -c --arg k "mbx:michael:s:$SESS:from:michael" --arg kind "$1" \
    '[[$k, [["1700000000001-0", ["from","michael/s/zzz","to",($k | ltrimstr("mbx:") | sub(":from:.*$"; "") | gsub(":"; "/")),"kind",$kind,"body","hi there","sent_at","1","thread","t-a","hops","0"]]]]]'
}
test_hook_state() {
  new_case "hook state: SessionStart writes 'idle <epoch>'"
  hook "$(ev SessionStart)"
  assert_eq "yes" "$(yn state_re idle)" "idle after SessionStart (got: $(state_of))"

  new_case "hook state: UserPromptSubmit writes 'busy <epoch>'"
  hook "$(ev UserPromptSubmit '{"prompt":"go"}')"
  assert_eq "yes" "$(yn state_re busy)" "busy after a prompt (got: $(state_of))"

  new_case "hook state: Stop with no mail writes idle"
  hook "$(ev UserPromptSubmit '{"prompt":"go"}')"
  hook "$(ev Stop)"
  assert_eq "yes" "$(yn state_re idle)" "idle after a Stop that did not block (got: $(state_of))"

  new_case "hook state: Stop that blocks on ask mail leaves the session busy"
  hook "$(ev UserPromptSubmit '{"prompt":"go"}')"
  rule "XREAD COUNT 20 STREAMS mbx:michael:s:$SESS:from:michael *" "$(hook_msg ask)"
  hook "$(ev Stop)"
  assert_contains "$OUT" '"decision":"block"' "it did block"
  assert_eq "yes" "$(yn state_re busy)" "still busy after a blocking Stop (got: $(state_of))"

  new_case "hook state: Stop with stop_hook_active writes idle"
  hook "$(ev UserPromptSubmit '{"prompt":"go"}')"
  hook "$(ev Stop '{"stop_hook_active":true}')"
  assert_eq "yes" "$(yn state_re idle)" "idle (got: $(state_of))"

  new_case "hook state: Stop when redis is down still ends idle"
  hook "$(ev UserPromptSubmit '{"prompt":"go"}')"
  rule 'XREAD *' '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  hook "$(ev Stop)"
  assert_eq "yes" "$(yn state_re idle)" "idle (got: $(state_of))"

  new_case "hook state: PostToolUse does not change it; subagents never write it"
  hook "$(ev UserPromptSubmit '{"prompt":"go"}')"
  hook "$(ev PostToolUse)"
  assert_eq "yes" "$(yn state_re busy)" "busy through a tool call"
  hook "$(ev Stop '{"agent_id":"agent-7"}')"
  assert_eq "yes" "$(yn state_re busy)" "a subagent Stop leaves it alone"
}

test_private_files() {
  # Stage 4b item 8: the watcher's local files (ids, log, nudge stamps) are owner-only.
  new_case "private files: watcher cache dir 700; watch-ids, watch.log and nudge stamp 600"
  chmod 755 "$CACHE"
  dir_entry s1 proj $((NOW - 60)) "$HOSTN" '[]' "main:1.0"; dir_commit
  set_state s1 idle
  rm -f "$CACHE/watch-ids"
  rule "XREAD *" "$(xr "$SKEY" 1700000000500-0 ask hello)"
  rule "ZRANGEBYSCORE *" '!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused'
  watch once
  assert_eq "700" "$(fmode "$CACHE")" "cache dir tightened"
  local f
  for f in watch-ids watch.log nudge-s1; do
    if [ -e "$CACHE/$f" ]; then assert_eq "600" "$(fmode "$CACHE/$f")" "$f"; else bad "$f was not created (case setup)"; fi
  done
}

test_script_exists
test_nudge_kinds
test_nudge_sequence
test_nudge_gates
test_nudge_project_and_rooms
test_nudge_reads
test_lifecycle_lock
test_send_later_delivery
test_bounce_sessions
test_bounce_projects
test_expiry
test_run_loop
test_install_systemd
test_send_at
test_hook_state
test_private_files

echo "cases=$CASES assertions_passed=$PASS assertions_failed=$FAIL"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
