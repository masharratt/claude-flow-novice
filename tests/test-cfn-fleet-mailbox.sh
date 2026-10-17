#!/usr/bin/env bash
# tests/test-cfn-fleet-mailbox.sh
# Mailbox stage 5 :: every cfn-fleet worker talks to the master through the agent mailbox
# (planning/PLAN_agent-mailbox.md "Stage 5 design (fleet, all workers)").
#
# Covers: worker and master mailbox names (unique across projects), the per-run coordinator
# secret (private, never printed), the env a spawned pane gets, `fleet mail` (master -> worker),
# `fleet report` (worker -> master), `fleet watch` consuming worker mail into the roster and
# replacing automatic ssh polling, the MAILBOX-DOWN fallback, nudge via mail, remote-worker.sh
# queueing mail for the hook, and the coordinator-authority text in the brief templates.
#
# Offline only: fake redis-cli (tests/lib/fake-redis-cli.sh, key-value mode), stub tmux and ssh on
# PATH, scratch HOME and MAILBOX_CONFIG. No real Redis, tmux server, host or ~/.config is touched.
#
# Usage: bash tests/test-cfn-fleet-mailbox.sh     Exit: 0 all green, 1 a failure.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SKILL="$REPO/.claude/skills/cfn-fleet"
FLEET="$SKILL/cli/fleet"
MB="$REPO/.claude/skills/cfn-mailbox/mailbox.sh"

PASS=0 FAIL=0 CASES=0 CASE_NAME=""
# shellcheck source=/dev/null
. "$REPO/.claude/cfn-scripts/lib/safe-rm.sh"
# shellcheck source=/dev/null
. "$REPO/tests/lib/fake-redis-cli.sh"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/cfn-fleet-mailbox-test.XXXXXX")" || exit 1
SCRATCH="$(cd -P "$SCRATCH" && pwd -P)" || exit 1
trap 'cfn_safe_rm_tmp "$SCRATCH"' EXIT

ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL [%s] %s\n' "$CASE_NAME" "$1"; }
assert_eq() { if [ "$1" = "$2" ]; then ok; else bad "$3: expected [$1] got [$2]"; fi; }
assert_contains() { case "$1" in *"$2"*) ok ;; *) bad "$3: missing [$2] in [$1]" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) bad "$3: unexpected [$2] in [$1]" ;; *) ok ;; esac; }
assert_rc() { if [ "$RC" = "$1" ]; then ok; else bad "$2: exit expected $1 got $RC (out: $OUT)"; fi; }
fmode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1" 2>/dev/null; }

HEADER=$'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\thost\tlane_sha'

new_case() { # name [project-dir-name]
  CASE_NAME="$1"
  CASES=$((CASES + 1))
  T="$SCRATCH/case-$CASES"
  P="$T/${2:-proj-a}"
  RUN="$P/planning/fleet-r1"
  mkdir -p "$T/bin" "$T/home" "$T/kv" "$T/tmp" "$T/cap" "$P/src" "$RUN/briefs" "$RUN/handoffs"
  git -C "$P" init -q -b main
  git -C "$P" config user.email t@t.test; git -C "$P" config user.name t
  echo a > "$P/src/a.md"; git -C "$P" add -A; git -C "$P" commit -qm init
  printf '%s\n' "$HEADER" > "$RUN/roster.tsv"
  printf 'FLEET_WORKTREE=off\nFLEET_DB=none\nFLEET_TRUST_TIMEOUT=1\nFLEET_BANNER_TIMEOUT=2\nFLEET_AUTH_TIMEOUT=1\n' > "$RUN/fleet.env"
  : > "$RUN/.roster.lock"
  : > "$T/calls"; : > "$T/rules"; : > "$T/tmux.log"; : > "$T/ssh.log"
  install_fake_redis_cli "$T/bin"
  cat > "$T/env" <<EOF
MAILBOX_HOST=mbx.example.test
MAILBOX_PORT=6379
MAILBOX_USER=michael
MAILBOX_PASS=pw-SECRET-123
MAILBOX_OWNER=michael
MAILBOX_PUBLIC=me
EOF
  chmod 600 "$T/env"
  # Stub tmux: logs argv; capture-pane always shows a claude-sub banner.
  cat > "$T/bin/tmux" <<'STUB'
#!/usr/bin/env bash
printf 'tmux %s\n' "$*" >> "$STUB_TMUX_LOG"
for a in "$@"; do case "$a" in capture-pane) echo "Claude Max"; exit 0 ;; esac; done
exit 0
STUB
  # Stub ssh: logs the remote command; list-panes says alive; tar (fleet sync) says no outbox.
  cat > "$T/bin/ssh" <<'STUB'
#!/usr/bin/env bash
printf 'ssh %s\n' "$*" >> "$STUB_SSH_LOG"
case "$*" in *tar*reports*) exit 3 ;; *list-panes*) echo 0 ;; esac
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "$T/bin/claude"
  chmod +x "$T/bin/tmux" "$T/bin/ssh" "$T/bin/claude"
  FENV=()
}

rule() { printf '%s\t%s\n' "$1" "$2" >> "$T/rules"; }
add_row() { # ws status [host] [claims]
  printf '%s\t%s\t%s\t%s\t%s\t\t\t\t0\t\tclaude-sub\t%s\t\n' "$1" "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" "task $1" "$2" "${4:-src/a.md}" "${3:-}" >> "$RUN/roster.tsv"
}
cell() { # ws field
  awk -F'\t' -v ws="$1" -v f="$2" 'NR == 1 { for (i = 1; i <= NF; i++) if ($i == f) c = i; next } $1 == ws { print $c; exit }' "$RUN/roster.tsv"
}

# fleet ARGS: the real router from inside the project. FENV adds VAR=value words. Sets OUT RC.
fleet() {
  RC=0
  OUT="$(cd "$P" && env -u MAILBOX_SESSION -u MAILBOX_SESSION_ID -u CLAUDE_CODE_SESSION_ID -u MAILBOX_COORD_FILE \
    -u MAILBOX_OUTQ -u FLEET_WS -u FLEET_MASTER_MAIL -u TMUX -u TMUX_PANE \
    PATH="$T/bin:$PATH" HOME="$T/home" TMPDIR="$T/tmp" MAILBOX_CONFIG="$T/env" FLEET_RUN_DIR="$RUN" \
    FLEET_MAILBOX=on FLEET_TICK_SECS=off FLEET_TRUST_SETTLE=0 FLEET_NUDGE_DELAY=0 \
    FAKE_LOG="$T/calls" FAKE_RULES="$T/rules" FAKE_KV_DIR="$T/kv" STUB_TMUX_LOG="$T/tmux.log" STUB_SSH_LOG="$T/ssh.log" \
    ${FENV[@]+"${FENV[@]}"} bash "$FLEET" "$@" 2>&1 </dev/null)" || RC=$?
}
cmds() { grep '^CMD	' "$T/calls" | cut -f2-; }
has_cmd() { cmds | grep -F -q -- "$1"; }
yn() { if "$@"; then echo yes; else echo no; fi; }
kv() { cat "$T/kv/$(printf '%s' "$1" | tr -c 'A-Za-z0-9_.-' '_')" 2>/dev/null; }
launch_script() { # session -> body of the launch script typed into that session
  local f
  f="$(grep -F "send-keys -t $1 -l" "$T/tmux.log" | grep -o "\. '[^']*/launch'" | head -1 | sed -e "s/^\. '//" -e "s/'$//")"
  [ -n "$f" ] && [ -f "$f" ] && cat "$f"
}
key_to() { printf '%s' "$1" | sed -e 's/^mbx://' -e 's/:from:.*$//' -e 's#:#/#g'; }
# xmsgs KEY then repeated "ID FROM FLEET BODY MSG_ID" groups -> one XREAD --json reply.
xmsgs() {
  local key="$1"; shift
  local arr='[]'
  while [ $# -ge 5 ]; do
    arr="$(jq -c --arg id "$1" --arg from "$2" --arg fl "$3" --arg body "$4" --arg mid "$5" --arg to "$(key_to "$key")" \
      '. + [[$id, ["from",$from,"to",$to,"kind","ask","body",$body,"sent_at","1","thread","t-1","hops","0","msg_id",$mid] + (if $fl != "" then ["fleet",$fl] else [] end)]]' <<<"$arr")"
    shift 5
  done
  jq -n -c --arg key "$key" --argjson a "$arr" '[[$key, $a]]'
}

# ---------------------------------------------------------------- names

test_names() {
  new_case "names: <project>-<ws>, master <project>-master, unique across projects"
  local out
  out="$(bash -c '. "$1/lib/common.sh"; fleet_mail_name proj-a WS01; fleet_mail_name proj-b WS01; fleet_mail_name My_Proj.v2 WS_7; fleet_master_mail_name proj-a; fleet_mail_name "$(printf "p%.0s" $(seq 1 80))" WS445' _ "$SKILL" 2>&1)"
  assert_eq "proj-a-ws01" "$(sed -n 1p <<<"$out")" "worker name"
  assert_eq "proj-b-ws01" "$(sed -n 2p <<<"$out")" "same WS id, other project"
  assert_eq "my-proj-v2-ws-7" "$(sed -n 3p <<<"$out")" "sanitized to [a-z0-9-]"
  assert_eq "proj-a-master" "$(sed -n 4p <<<"$out")" "master name"
  local long; long="$(sed -n 5p <<<"$out")"
  assert_eq "yes" "$([ "${#long}" -le 64 ] && echo yes || echo no)" "long names fit 64 chars (${#long})"
  assert_contains "$long" "-ws445" "long names keep the ws suffix"
}

# ---------------------------------------------------------------- spawn

test_spawn_local_env_and_secret() {
  new_case "spawn: pane gets its mailbox name, coordinator file, queue and master address; secret private"
  echo "Brief WS01" > "$RUN/briefs/WS01.md"
  add_row WS01 pending
  FENV=(CLAUDE_CODE_SESSION_ID=master-sid-1)
  fleet spawn WS01 --spares 1
  assert_rc 0 "spawn ok"
  local ls; ls="$(launch_script ws01)"
  assert_contains "$ls" "MAILBOX_SESSION=proj-a-ws01" "worker mailbox name"
  assert_contains "$ls" "MAILBOX_COORD_FILE=$RUN/.coord/secret" "coordinator secret file"
  assert_contains "$ls" "MAILBOX_OUTQ=$RUN/mail-out/WS01" "outbound queue"
  assert_contains "$ls" "FLEET_MASTER_MAIL=michael/s/proj-a-master" "master address"
  assert_contains "$ls" "FLEET_WS=WS01" "ws id"
  assert_contains "$ls" "MAILBOX_COORD_FROM=michael/s/proj-a-master" "coordinator must come from the master"
  assert_contains "$(launch_script ws01-spare1)" "MAILBOX_SESSION=proj-a-ws01-spare1" "spare has its own name"
  local s="$RUN/.coord/secret" sec
  [ -f "$s" ] && ok || bad "secret file exists"
  assert_eq "600" "$(fmode "$s")" "secret file mode"
  assert_eq "700" "$(fmode "$RUN/.coord")" "secret dir mode"
  assert_eq "*" "$(cat "$RUN/.coord/.gitignore" 2>/dev/null)" "secret dir ignored by git"
  sec="$(awk '$1 == "coordinator-secret:" {print $2}' "$s")"
  assert_eq "yes" "$([[ "$sec" =~ ^[0-9a-f]{32}$ ]] && echo yes || echo no)" "32 hex secret"
  assert_not_contains "$OUT" "$sec" "secret not in spawn output"
  assert_not_contains "$(cat "$T/tmux.log")" "$sec" "secret not in tmux argv"
  assert_not_contains "$ls" "$sec" "secret not in the launch script"
  assert_eq "" "$(git -C "$P" status --porcelain -- planning/fleet-r1/.coord)" "secret never shows as a change"
  assert_eq "" "$(git -C "$P" status --porcelain -- planning/fleet-r1/mail-out)" "mail queue never shows as a change"
  assert_eq "700" "$(fmode "$RUN/mail-out/WS01")" "mail queue dir is private"
  assert_eq "master-sid-1" "$(kv alias:michael:proj-a-master | jq -r .session_id)" "master claimed its role name"
  assert_contains "$OUT" "michael/s/proj-a-master" "spawn names the master address"

  new_case "spawn: the per-run secret is reused by later spawns"
  echo "Brief" > "$RUN/briefs/WS01.md"; echo "Brief" > "$RUN/briefs/WS02.md"
  add_row WS01 pending; add_row WS02 pending
  fleet spawn WS01; local a; a="$(cat "$RUN/.coord/secret")"
  fleet spawn WS02
  assert_eq "$a" "$(cat "$RUN/.coord/secret")" "same secret for the run"

  new_case "spawn: two projects with the same WS id get different worker names"
  echo "Brief" > "$RUN/briefs/WS01.md"; add_row WS01 pending
  fleet spawn WS01
  assert_contains "$(launch_script ws01)" "MAILBOX_SESSION=proj-a-ws01" "project a"
  local first_T="$T"
  new_case "spawn: second project" proj-b
  echo "Brief" > "$RUN/briefs/WS01.md"; add_row WS01 pending
  fleet spawn WS01
  assert_contains "$(launch_script ws01)" "MAILBOX_SESSION=proj-b-ws01" "project b"
  [ -n "$first_T" ] && ok

  # Regression (live e2e 2026-10-16): `fleet spawn --run-dir planning/fleet-x` (relative) gave the
  # pane a relative MAILBOX_OUTQ; mailbox.sh queue refuses relative paths (exit 2), so every
  # local worker's `fleet report` mail was dropped.
  new_case "spawn: a relative run dir still gives the pane absolute mailbox paths"
  echo "Brief WS01" > "$RUN/briefs/WS01.md"; add_row WS01 pending
  FENV=(FLEET_RUN_DIR="planning/fleet-r1")
  fleet spawn WS01
  assert_rc 0 "spawn ok with a relative run dir"
  local lr; lr="$(launch_script ws01)"
  assert_contains "$lr" "MAILBOX_OUTQ=$RUN/mail-out/WS01" "absolute outbound queue"
  assert_contains "$lr" "MAILBOX_COORD_FILE=$RUN/.coord/secret" "absolute coordinator file"

  new_case "spawn: no mailbox config -> spawn still works, files only, says so"
  echo "Brief" > "$RUN/briefs/WS01.md"; add_row WS01 pending
  FENV=(MAILBOX_CONFIG="$T/missing")
  fleet spawn WS01
  assert_rc 0 "spawn ok without a mailbox"
  assert_contains "$OUT" "mailbox" "warns about the mailbox"
  assert_not_contains "$(launch_script ws01)" "FLEET_MASTER_MAIL=michael" "no master address without config"
}

# ---------------------------------------------------------------- fleet mail / report

test_fleet_mail() {
  new_case "fleet mail: master -> worker, coordinator secret via stdin, worker address"
  add_row WS01 started
  fleet mail WS01 assign "read briefs/WS01.md part 2"
  assert_rc 0 "mail ok"
  local x; x="$(cmds | grep -F 'XADD mbx:michael:s:proj-a-ws01:from:michael' | head -1)"
  assert_contains "$x" "from michael/s/proj-a-master" "from the master"
  assert_contains "$x" "kind ask" "assign wakes the worker"
  assert_contains "$x" "fleet assign" "fleet type"
  assert_contains "$x" "coord <xarg>" "secret field on stdin"
  local sec; sec="$(awk '$1 == "coordinator-secret:" {print $2}' "$RUN/.coord/secret")"
  assert_eq "$sec" "$(grep '^XARG	' "$T/calls" | head -1 | cut -f2-)" "the run's secret was sent"
  assert_not_contains "$OUT" "$sec" "secret not printed"

  new_case "fleet mail: bad type 64, unknown ws 65, worker-side type refused"
  add_row WS01 started
  fleet mail WS01 launch "x"; assert_rc 64 "bad type"
  fleet mail WS09 assign "x"; assert_rc 65 "unknown ws"
  fleet mail WS01 status "x"; assert_rc 64 "status is a worker type"
}

test_fleet_report() {
  new_case "fleet report: local worker updates the roster and mails the master"
  add_row WS01 started
  FENV=(FLEET_WS=WS01 MAILBOX_SESSION=proj-a-ws01 FLEET_MASTER_MAIL=michael/s/proj-a-master)
  fleet report blocked "need a claim on src/b.md"
  assert_rc 0 "report ok"
  assert_eq "blocked" "$(cell WS01 status)" "roster status"
  assert_contains "$(cell WS01 notes)" "need a claim on src/b.md" "roster notes"
  local x; x="$(cmds | grep -F 'XADD mbx:michael:s:proj-a-master:from:michael' | head -1)"
  assert_contains "$x" "fleet blocked" "fleet type"
  assert_contains "$x" "from michael/s/proj-a-ws01" "from the worker"
  assert_contains "$x" "kind ask" "blocked wakes the master"

  new_case "fleet report: sandboxed worker (MAILBOX_OUTQ) queues instead of sending"
  add_row WS01 started
  FENV=(FLEET_WS=WS01 MAILBOX_SESSION=proj-a-ws01 FLEET_MASTER_MAIL=michael/s/proj-a-master MAILBOX_OUTQ="$RUN/mail-out/WS01")
  fleet report status "working: step 2"
  assert_rc 0 "report ok"
  assert_eq "working" "$(cell WS01 status)" "roster status from the first word"
  assert_eq "no" "$(yn has_cmd XADD)" "nothing sent directly"
  local f; f="$(ls "$RUN/mail-out/WS01"/*.json 2>/dev/null | head -1)"
  assert_eq "status|fyi|working: step 2" "$(jq -r '[.fleet,.kind,.body] | join("|")' "$f" 2>/dev/null)" "queued entry"

  new_case "fleet report: claim-request lands in CLAIM_REQ, done sets done"
  add_row WS01 working
  FENV=(FLEET_WS=WS01 MAILBOX_SESSION=proj-a-ws01 FLEET_MASTER_MAIL=michael/s/proj-a-master)
  fleet report claim-request "src/c.md"
  assert_contains "$(cat "$RUN/handoffs/CLAIM_REQ_WS01.md" 2>/dev/null)" "src/c.md" "claim request recorded"
  fleet report done "handoffs/HANDOFF_WS01.md"
  assert_eq "done" "$(cell WS01 status)" "done"

  new_case "fleet report: no FLEET_WS -> 64; master type refused"
  add_row WS01 started
  fleet report status "x"; assert_rc 64 "needs FLEET_WS"
  FENV=(FLEET_WS=WS01 MAILBOX_SESSION=proj-a-ws01)
  fleet report assign "x"; assert_rc 64 "assign is a master type"

  new_case "fleet report: mailbox down -> roster still updated, warning, exit 0"
  add_row WS01 started
  rule "XADD *" "!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused"
  FENV=(FLEET_WS=WS01 MAILBOX_SESSION=proj-a-ws01 FLEET_MASTER_MAIL=michael/s/proj-a-master)
  fleet report blocked "stuck"
  assert_rc 0 "still ok"
  assert_eq "blocked" "$(cell WS01 status)" "roster is the record"
  assert_contains "$OUT" "not sent" "says the mail did not go"
}

# ---------------------------------------------------------------- watch

MK="mbx:michael:s:proj-a-master:from:michael"

watch_fixture() {
  add_row WS01 started
  add_row WS02 started vps
  mkdir -p "$RUN/remote"
  printf 'FLEET_HOST=vps\nFLEET_GEN=g1\nFLEET_OUTBOX=/srv/ob/WS02\nFLEET_SOCK=fleet-r1\nFLEET_SESSION=ws02\n' > "$RUN/remote/WS02.env"
  FENV=(FLEET_TMUX_SOCKET=fleet-r1)
}

test_watch_applies_mail() {
  new_case "watch: worker mail updates the roster, no automatic ssh sync while the mailbox is up"
  watch_fixture
  rule "XREAD COUNT * STREAMS $MK *" "$(xmsgs "$MK" \
    1-0 michael/s/proj-a-ws02 status "working: parsed inputs" m-01 \
    2-0 michael/s/proj-a-ws02 claim-request "src/c.md" m-02 \
    3-0 michael/s/proj-a-ws02 handoff "handoffs/HANDOFF_WS02.md" m-03 \
    4-0 michael/s/proj-a-ws01 blocked "local note" m-04 \
    5-0 michael/s/stranger done "ignore me" m-05)"
  fleet watch --once
  assert_rc 0 "watch ok"
  assert_contains "$OUT" "MAIL WS02 status working: parsed inputs" "status event"
  assert_contains "$OUT" "CLAIM-REQ WS02 src/c.md" "claim request event"
  assert_contains "$OUT" "HANDOFF WS02 handoffs/HANDOFF_WS02.md" "handoff event"
  assert_contains "$OUT" "MAIL WS01 blocked local note" "local worker mail shown"
  assert_not_contains "$OUT" "ignore me" "unknown sender ignored"
  assert_eq "working" "$(cell WS02 status)" "host row status from mail"
  assert_contains "$(cell WS02 notes)" "handoffs/HANDOFF_WS02.md" "host row notes from mail"
  assert_eq "yes" "$([ "$(cell WS02 heartbeat)" -gt 0 ] && echo yes || echo no)" "heartbeat stamped"
  assert_contains "$(cat "$RUN/handoffs/CLAIM_REQ_WS02.md" 2>/dev/null)" "src/c.md" "claim request file"
  assert_eq "started" "$(cell WS01 status)" "local row not re-applied (its worker wrote the roster)"
  assert_not_contains "$(cat "$T/ssh.log")" "reports" "no automatic fleet sync"
  assert_eq "yes" "$(yn has_cmd "GET seen:michael:proj-a-master--fleet-watch:")" "watch has its own marker"

  # Same reply again: the delivered set drops what was already applied.
  fleet watch --once
  assert_not_contains "$OUT" "MAIL WS02" "nothing applied twice"
}

test_watch_dir_heartbeat() {
  new_case "watch: host row heartbeat comes from the mailbox directory"
  watch_fixture
  local now; now="$(date +%s)"
  rule "HGETALL dir:michael" "[\"michael/s/proj-a-ws02\",\"{\\\"last_seen\\\":$((now - 10))}\"]"
  fleet watch --once
  assert_eq "$((now - 10))" "$(cell WS02 heartbeat)" "heartbeat from last_seen"
  assert_not_contains "$OUT" "STALE WS02" "not stale"
}

test_watch_mailbox_down() {
  new_case "watch: Upstash unreachable -> MAILBOX-DOWN once, then the file/ssh fallback runs"
  watch_fixture
  rule "XREAD *" "!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused"
  rule "HGETALL *" "!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused"
  fleet watch --once
  assert_rc 0 "watch ok"
  assert_contains "$OUT" "MAILBOX-DOWN" "down reported"
  assert_contains "$(cat "$T/ssh.log")" "reports" "fallback: fleet sync reads the outbox files"
  fleet watch --once
  assert_not_contains "$OUT" "MAILBOX-DOWN" "reported once, not every poll"
  : > "$T/rules"
  fleet watch --once
  assert_contains "$OUT" "MAILBOX-UP" "recovery reported"

  new_case "watch: no mailbox config -> MAILBOX-DOWN no config, fallback"
  watch_fixture
  FENV+=(MAILBOX_CONFIG="$T/missing")
  fleet watch --once
  assert_contains "$OUT" "MAILBOX-DOWN" "down"
  assert_contains "$OUT" "config" "names the reason"
  assert_contains "$(cat "$T/ssh.log")" "reports" "fallback sync"
}

# ---------------------------------------------------------------- nudge

test_nudge_via_mail() {
  new_case "nudge: text goes by mail (answer), not typed into the pane"
  add_row WS01 started
  fleet nudge WS01 "continue with step 3"
  assert_rc 0 "nudge ok"
  assert_contains "$(cmds | grep -F 'XADD mbx:michael:s:proj-a-ws01')" "fleet answer" "mailed as answer"
  assert_not_contains "$(cat "$T/tmux.log")" "send-keys" "nothing typed"
  assert_contains "$OUT" "mailed WS01" "says it mailed"

  new_case "nudge --tmux: forced typing; --key still presses keys"
  add_row WS01 started
  fleet nudge WS01 --tmux "typed text"
  assert_rc 0 "ok"
  assert_contains "$(cat "$T/tmux.log")" "send-keys -t =ws01: -l -- typed text" "typed"
  assert_eq "no" "$(yn has_cmd XADD)" "no mail"
  fleet nudge WS01 --key Enter
  assert_contains "$(cat "$T/tmux.log")" "send-keys -t =ws01: Enter" "keys pressed"

  new_case "nudge: mailbox down -> falls back to typing, with a warning"
  add_row WS01 started
  rule "XADD *" "!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused"
  fleet nudge WS01 "fallback text"
  assert_rc 0 "ok"
  assert_contains "$OUT" "MAILBOX-DOWN" "warns"
  assert_contains "$(cat "$T/tmux.log")" "fallback text" "typed instead"
}

# ---------------------------------------------------------------- remote worker

test_remote_worker_queues_mail() {
  new_case "remote-worker.sh: status, handoff and request-claim also queue mail for the hook"
  local ob="$T/ob"
  mkdir -p "$ob"
  cp "$SKILL/templates/remote-worker.sh" "$ob/"
  printf 'FLEET_WS=WS02\nFLEET_GEN=g1\nFLEET_BRANCH=fleet/WS02\nFLEET_OUTBOX=%s\nFLEET_MASTER_MAIL=michael/s/proj-a-master\n' "$ob" > "$ob/outbox.env"
  printf 'src/a.md\n' > "$ob/claims.txt"
  bash "$ob/remote-worker.sh" status blocked "waiting on src/c.md" >/dev/null 2>&1
  echo "# handoff" > "$T/HANDOFF_WS02.md"
  bash "$ob/remote-worker.sh" handoff "$T/HANDOFF_WS02.md" >/dev/null 2>&1
  bash "$ob/remote-worker.sh" request-claim src/c.md >/dev/null 2>&1
  bash "$ob/remote-worker.sh" status working >/dev/null 2>&1
  [ -f "$ob/reports/g1-1.json" ] && ok || bad "report file still written (record of truth)"
  local all; all="$(cat "$ob/mail-out"/*.json 2>/dev/null | jq -r -s 'sort_by(.msg_id) | map([.to,.kind,.fleet,.body] | join("|")) | .[]' 2>/dev/null)"
  assert_contains "$all" "michael/s/proj-a-master|ask|blocked|blocked: waiting on src/c.md" "blocked mail"
  assert_contains "$all" "michael/s/proj-a-master|ask|handoff|handoffs/HANDOFF_WS02.md" "handoff mail"
  assert_contains "$all" "michael/s/proj-a-master|ask|claim-request|src/c.md" "claim request mail"
  assert_contains "$all" "michael/s/proj-a-master|fyi|status|working" "status mail"
  # The hook's flush sends them with the worker's own name.
  RC=0
  OUT="$(env -u MAILBOX_SESSION_ID -u CLAUDE_CODE_SESSION_ID PATH="$T/bin:$PATH" HOME="$T/home" MAILBOX_CONFIG="$T/env" \
    FAKE_LOG="$T/calls" FAKE_RULES="$T/rules" FAKE_KV_DIR="$T/kv" MAILBOX_OUTQ="$ob/mail-out" MAILBOX_SESSION=proj-a-ws02 \
    bash "$MB" flush 2>&1)" || RC=$?
  assert_rc 0 "flush ok"
  assert_eq "4" "$(cmds | grep -c -F "XADD $MK")" "four messages to the master"
  assert_eq "0" "$(ls "$ob/mail-out"/*.json 2>/dev/null | wc -l | tr -d ' ')" "queue drained"

  new_case "remote-worker.sh: without FLEET_MASTER_MAIL (old spawn) no mail is queued"
  local ob="$T/ob"
  mkdir -p "$ob"; cp "$SKILL/templates/remote-worker.sh" "$ob/"
  printf 'FLEET_WS=WS02\nFLEET_GEN=g1\nFLEET_BRANCH=fleet/WS02\nFLEET_OUTBOX=%s\n' "$ob" > "$ob/outbox.env"
  bash "$ob/remote-worker.sh" status working >/dev/null 2>&1
  [ ! -d "$ob/mail-out" ] && ok || bad "no mail-out dir"
}

# ---------------------------------------------------------------- briefs

test_brief_coordinator_authority() {
  new_case "brief templates: coordinator mail is fleet-internal authority within the brief only"
  local f t
  for f in BRIEF_WS.md BRIEF_REMOTE.md; do
    t="$(tr '\n' ' ' < "$SKILL/templates/$f")"
    assert_contains "$t" "coordinator" "$f names the coordinator tier"
    assert_contains "$t" "within this brief only" "$f: within the brief"
    assert_contains "$t" "never push, deploy, spend or approve" "$f: never push/deploy/spend/approve"
    assert_contains "$t" "not the user's approval" "$f: not human approval"
  done
  assert_contains "$(cat "$SKILL/templates/BRIEF_WS.md")" "fleet report" "local brief: how to report"
  assert_contains "$(cat "$SKILL/templates/BRIEF_REMOTE.md")" "mail to the master" "remote brief: reports reach the master by mail"
}

test_names
test_spawn_local_env_and_secret
test_fleet_mail
test_fleet_report
test_watch_applies_mail
test_watch_dir_heartbeat
test_watch_mailbox_down
test_nudge_via_mail
test_remote_worker_queues_mail
test_brief_coordinator_authority

echo "cases: $CASES  assertions passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
