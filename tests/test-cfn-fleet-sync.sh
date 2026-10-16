#!/usr/bin/env bash
# tests/test-cfn-fleet-sync.sh
# cfn-fleet Phase 5 (planning/PLAN_fleet-remote-host-workers.md): `fleet sync`
# pulls remote worker reports into the Mac roster, `fleet watch` reports host
# liveness states (UNREACHABLE never DEAD, PROMPT, NOREPORT, LOWDISK), the
# dashboard shows a host badge plus the same states, and `fleet peek` reads a
# pane locally or over ssh.
#
# The real ssh and the real server are never touched. Stub `ssh` runs the
# remote command LOCALLY with HOME pointed at a fake server home (so the
# outbox, reports and handoff files are real files the sync must read), and
# exits 255 when STUB_SSH_RC=255 (connection failure). Stub `tmux` logs which
# side called it (STUB_SIDE=remote under ssh) and scripts list-panes /
# capture-pane. Stub `df` scripts the server's free disk.
set -uo pipefail
# The mailbox path (stage 5) has its own suite (test-cfn-fleet-mailbox.sh, fake
# redis-cli). Off here, so these file-based cases never reach a real mailbox config.
export FLEET_MAILBOX=off

PROJECT_ROOT=$(git rev-parse --show-toplevel)
FLEET="$PROJECT_ROOT/.claude/skills/cfn-fleet/cli/fleet"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { # check NAME ACTUAL EXPECTED
  if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (got '$2', want '$3')"; fi
}
contains() { # contains NAME HAYSTACK NEEDLE
  case "$2" in *"$3"*) ok "$1" ;; *) no "$1 (missing '$3' in: $2)" ;; esac
}
lacks() { # lacks NAME HAYSTACK NEEDLE
  case "$2" in *"$3"*) no "$1 (unexpected '$3' in: $2)" ;; *) ok "$1" ;; esac
}

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/fleet-sync.XXXXXX") || exit 1
TMP_DIR=$(cd -P "$TMP_DIR" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/bin"
export STUB_LOG="$TMP_DIR/calls.log"
export SRV_HOME="$TMP_DIR/server-home"

# Stub ssh: log argv, then either fail like a dead link (255) or run the
# remote command here. The last arg is `bash -lc <quoted script>`; a login
# shell would let /etc/profile reorder PATH and reach the real tmux, so the
# stub swaps -lc for -c and keeps PATH (stubs first).
cat >"$TMP_DIR/bin/ssh" <<'EOF'
#!/usr/bin/env bash
{ echo "--ssh"; for a in "$@"; do echo "$a"; done; } >>"$STUB_LOG"
[ "${STUB_SSH_RC:-0}" = "0" ] || exit "$STUB_SSH_RC"
last="${*: -1}"
HOME="$SRV_HOME" STUB_SIDE=remote exec bash -c "bash -c ${last#bash -lc }"
EOF
cat >"$TMP_DIR/bin/tmux" <<'EOF'
#!/usr/bin/env bash
{ echo "--tmux ${STUB_SIDE:-local}"; for a in "$@"; do echo "$a"; done; } >>"$STUB_LOG"
cmd=""
for a in "$@"; do
  case "$a" in list-panes|capture-pane|has-session) cmd="$a" ;; esac
done
case "$cmd" in
  list-panes)
    rc="${STUB_LP_RC:-0}"
    [ "$rc" = "0" ] && echo "${STUB_PANE_DEAD:-0}"
    exit "$rc" ;;
  capture-pane)
    printf '%s\n' "${STUB_CAPTURE:-worker idle}"
    exit "${STUB_CAPTURE_RC:-0}" ;;
esac
exit 0
EOF
cat >"$TMP_DIR/bin/df" <<'EOF'
#!/usr/bin/env bash
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "/dev/stub 100000000 1 ${STUB_DF_KB:-104857600} 1% /"
EOF
chmod +x "$TMP_DIR/bin/ssh" "$TMP_DIR/bin/tmux" "$TMP_DIR/bin/df"
export PATH="$TMP_DIR/bin:$PATH"

HEADER=$'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\thost'
GEN="g7f3a"
RUN_DIR=""
OUTBOX=""

# fresh_run: new run dir with WS01 (remote on vps, started) and WS02 (local).
fresh_run() {
  RUN_DIR="$TMP_DIR/repo/planning/fleet-main"
  rm -rf "$TMP_DIR/repo" "$SRV_HOME"
  mkdir -p "$RUN_DIR/remote" "$RUN_DIR/handoffs" "$SRV_HOME"
  OUTBOX="$SRV_HOME/fleet-runs/repo/fleet-main/WS01"
  mkdir -p "$OUTBOX/reports" "$OUTBOX/handoffs"
  {
    echo "$HEADER"
    printf 'WS01\tws01\tremote task\tstarted\tsrc/a.md\t\t0007\t\t100\told note\tclaude-opus\tvps\n'
    printf 'WS02\tws02\tlocal task\tworking\tsrc/b.md\t\t\t\t100\tlocal note\tclaude-sub\t\n'
  } >"$RUN_DIR/roster.tsv"
  : >"$RUN_DIR/.roster.lock"
  printf 'FLEET_WORKTREE=on\nFLEET_DB=none\n' >"$RUN_DIR/fleet.env"
  write_env "$GEN" "$(date +%s)"
  export FLEET_RUN_DIR="$RUN_DIR"
  : >"$STUB_LOG"
  unset STUB_SSH_RC STUB_LP_RC STUB_PANE_DEAD STUB_CAPTURE STUB_DF_KB STUB_CAPTURE_RC
}

# write_env GEN SPAWNED_AT: the remote/<WS>.env contract spawn --host writes.
write_env() {
  {
    printf 'FLEET_HOST=%q\n' vps
    printf 'FLEET_GIT_REMOTE=%q\n' vps
    printf 'FLEET_PROJECT=%q\n' repo
    printf 'FLEET_RUN=%q\n' fleet-main
    printf 'FLEET_GEN=%q\n' "$1"
    printf 'FLEET_REMOTE_WT=%q\n' "$SRV_HOME/fleet-repos/repo-wt/ws01"
    printf 'FLEET_OUTBOX=%q\n' "$OUTBOX"
    printf 'FLEET_BRANCH=%q\n' fleet/WS01
    printf 'FLEET_BASE_REF=%q\n' fleet-base/WS01
    printf 'FLEET_SOCK=%q\n' fleet-main
    printf 'FLEET_SESSION=%q\n' ws01
    printf 'FLEET_SPAWNED_AT=%q\n' "$2"
  } >"$RUN_DIR/remote/WS01.env"
  chmod 600 "$RUN_DIR/remote/WS01.env"
}

# report GEN SEQ KIND [key value]...: one report file, as remote-worker.sh writes it.
report() {
  local gen="$1" seq="$2" kind="$3" body
  shift 3
  body=$(printf '{"ws":"WS01","gen":"%s","seq":%s,"kind":"%s","ts_worker":"2026-10-13T00:00:00Z"' "$gen" "$seq" "$kind")
  while [ $# -ge 2 ]; do body+=$(printf ',"%s":"%s"' "$1" "$2"); shift 2; done
  printf '%s}\n' "$body" >"$OUTBOX/reports/$gen-$seq.json"
}

cell() { # cell WS FIELD
  awk -F'\t' -v ws="$1" -v f="$2" 'NR == 1 { for (i = 1; i <= NF; i++) if ($i == f) c = i; next } $1 == ws { print $c }' "$RUN_DIR/roster.tsv"
}

fleet() { bash "$FLEET" "$@"; }

echo "== test_sync_applies_worker_fields_heartbeat_at_receive_time"
fresh_run
report "$GEN" 1 heartbeat note "tests written"
report "$GEN" 2 status status working
BEFORE=$(date +%s)
OUT=$(fleet sync 2>&1); RC=$?
check "sync exits 0" "$RC" "0"
check "note applied" "$(cell WS01 notes)" "tests written"
check "status started -> working applied" "$(cell WS01 status)" "working"
HB=$(cell WS01 heartbeat)
if [ "$HB" -ge "$BEFORE" ] 2>/dev/null; then ok "heartbeat is Mac receive time"; else no "heartbeat is Mac receive time (got $HB, before $BEFORE)"; fi
check ".applied records gen and max seq" "$(cat "$RUN_DIR/remote/WS01.applied")" "$GEN 2"
contains "sync names what it applied" "$OUT" "SYNC WS01 applied 2"
check "local row untouched" "$(cell WS02 notes)" "local note"
check "one ssh call for one host row with no handoff" "$(grep -c '^--ssh' "$STUB_LOG")" "1"
contains "ssh goes to the row's host" "$(cat "$STUB_LOG")" $'\nvps\n'

echo "== test_sync_ignores_old_generation_and_replayed_seq"
fresh_run
report "$GEN" 1 heartbeat note "first"
fleet sync >/dev/null 2>&1
report "old01" 5 heartbeat note "from a previous spawn"
report "$GEN" 1 heartbeat note "replayed seq 1"
printf '{"ws":"WS01","gen":"%s","seq":3,"kind":"heartbeat","note":"half written"}\n' "$GEN" >"$OUTBOX/reports/.$GEN-3.json.tmp"
OUT=$(fleet sync 2>&1)
check "old generation and replayed seq leave the note alone" "$(cell WS01 notes)" "first"
check ".applied unchanged" "$(cat "$RUN_DIR/remote/WS01.applied")" "$GEN 1"
contains "nothing new reads as up to date" "$OUT" "SYNC WS01 up to date"
report "$GEN" 10 status status blocked
report "$GEN" 9 status status working
fleet sync >/dev/null 2>&1
check "unpadded seqs apply in numeric order (9 then 10)" "$(cell WS01 status)" "blocked"
check ".applied max is numeric max" "$(cat "$RUN_DIR/remote/WS01.applied")" "$GEN 10"
# A respawn writes a new gen: the old .applied max must not hide its seq 1.
write_env "new02" "$(date +%s)"
report "new02" 1 heartbeat note "new generation"
fleet sync >/dev/null 2>&1
check "new generation starts from seq 1" "$(cell WS01 notes)" "new generation"
check ".applied follows the new generation" "$(cat "$RUN_DIR/remote/WS01.applied")" "new02 1"

echo "== test_sync_never_writes_claims"
fresh_run
report "$GEN" 1 claim_request path "src/c.md"
printf '{"ws":"WS01","gen":"%s","seq":2,"kind":"heartbeat","claims":"src","migration_num":"0099","note":"sneaky"}\n' "$GEN" >"$OUTBOX/reports/$GEN-2.json"
OUT=$(fleet sync 2>&1)
check "claims unchanged" "$(cell WS01 claims)" "src/a.md"
check "migration_num unchanged" "$(cell WS01 migration_num)" "0007"
contains "claim request filed for the master" "$(cat "$RUN_DIR/handoffs/CLAIM_REQ_WS01.md" 2>/dev/null)" "src/c.md"
contains "claim request surfaced" "$OUT" "CLAIM-REQ WS01 src/c.md"
check "extra report keys ignored, note applied" "$(cell WS01 notes)" "sneaky"

echo "== test_sync_status_transitions_allowed_only"
fresh_run
report "$GEN" 1 status status landed
report "$GEN" 2 status status dead
report "$GEN" 3 status status pending
OUT=$(fleet sync 2>&1)
check "landed/dead/pending from a worker are refused" "$(cell WS01 status)" "started"
contains "refusal is named" "$OUT" "refused status"
report "$GEN" 4 status status done
fleet sync >/dev/null 2>&1
check "done is allowed" "$(cell WS01 status)" "done"
fresh_run
awk -F'\t' -v OFS='\t' 'NR > 1 && $1 == "WS01" { $4 = "landed" } { print }' "$RUN_DIR/roster.tsv" >"$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
report "$GEN" 1 status status working
fleet sync >/dev/null 2>&1
check "a landed row is never moved by a worker report" "$(cell WS01 status)" "landed"

echo "== test_sync_copies_handoff_and_commit_note"
fresh_run
printf '# Handoff WS01\nnext: wire the parser\n' >"$OUTBOX/handoffs/HANDOFF_WS01.md"
report "$GEN" 1 handoff file "HANDOFF_WS01.md"
report "$GEN" 2 commit sha "0123456789abcdef0123" note "feat: parser"
report "$GEN" 3 handoff file "../../etc/passwd"
OUT=$(fleet sync 2>&1)
contains "handoff copied into the run dir" "$(cat "$RUN_DIR/handoffs/HANDOFF_WS01.md" 2>/dev/null)" "wire the parser"
contains "handoff surfaced" "$OUT" "HANDOFF WS01"
contains "commit report becomes the note" "$(cell WS01 notes)" "0123456789ab"
check "unsafe handoff name never escapes handoffs/" "$(ls "$RUN_DIR/handoffs" | tr '\n' ' ')" "HANDOFF_WS01.md "
check "all three applied" "$(cat "$RUN_DIR/remote/WS01.applied")" "$GEN 3"

echo "== test_sync_unreachable_changes_nothing"
fresh_run
report "$GEN" 1 heartbeat note "never fetched"
export STUB_SSH_RC=255
OUT=$(fleet sync 2>&1); RC=$?
unset STUB_SSH_RC
check "sync exits 0 on a dead link" "$RC" "0"
contains "UNREACHABLE named" "$OUT" "UNREACHABLE WS01 vps"
check "roster unchanged" "$(cell WS01 notes)" "old note"
check "heartbeat unchanged" "$(cell WS01 heartbeat)" "100"
check "no .applied written" "$([ -e "$RUN_DIR/remote/WS01.applied" ] && echo yes || echo no)" "no"

echo "== test_sync_ws_mismatch_and_local_only"
fresh_run
printf '{"ws":"WS09","gen":"%s","seq":1,"kind":"heartbeat","note":"wrong lane"}\n' "$GEN" >"$OUTBOX/reports/$GEN-1.json"
fleet sync >/dev/null 2>&1
check "report for another ws is dropped" "$(cell WS01 notes)" "old note"
check "dropped report still advances .applied" "$(cat "$RUN_DIR/remote/WS01.applied")" "$GEN 1"
fresh_run
: >"$STUB_LOG"
OUT=$(fleet sync WS02 2>&1); RC=$?
check "sync of a local row exits 0" "$RC" "0"
check "local row never touches ssh" "$(grep -c '^--ssh' "$STUB_LOG")" "0"
OUT=$(fleet sync WS99 2>&1); RC=$?
check "unknown ws exits 65" "$RC" "65"

echo "== test_watch_unreachable_host_not_dead"
fresh_run
export STUB_SSH_RC=255
OUT=$(fleet watch --once 2>&1)
unset STUB_SSH_RC
contains "UNREACHABLE event" "$OUT" "UNREACHABLE WS01"
lacks "never DEAD on ssh failure" "$OUT" "DEAD WS01"
lacks "local tmux never probed for a host row session" "$(grep -A4 '^--tmux local' "$STUB_LOG")" "ws01"

echo "== test_watch_prompt_noreport_lowdisk_events"
fresh_run
report "$GEN" 1 heartbeat note "alive"
export STUB_CAPTURE=$'Bash command\n  rm -rf build\nDo you want to proceed?\n> 1. Yes'
OUT=$(fleet watch --once 2>&1)
unset STUB_CAPTURE
contains "PROMPT event" "$OUT" "PROMPT WS01"
lacks "fresh report means no NOREPORT" "$OUT" "NOREPORT WS01"
lacks "no DEAD while the pane is alive" "$OUT" "DEAD WS01"
check "watch tick ran sync" "$(cell WS01 notes)" "alive"
contains "pane read over ssh" "$(cat "$STUB_LOG")" "--tmux remote"
fresh_run
write_env "$GEN" "$(( $(date +%s) - 1000 ))"
export STUB_DF_KB=$((3 * 1048576))
OUT=$(fleet watch --once 2>&1)
unset STUB_DF_KB
contains "NOREPORT after FLEET_FIRST_REPORT_SECS with no report" "$OUT" "NOREPORT WS01"
contains "LOWDISK names the host" "$OUT" "LOWDISK vps"
fresh_run
export STUB_PANE_DEAD=1
OUT=$(fleet watch --once 2>&1)
unset STUB_PANE_DEAD
contains "tmux answering pane dead is DEAD" "$OUT" "DEAD WS01 (pane exited)"

echo "== test_watch_host_events_fire_once_and_sync_events_surface"
fresh_run
export STUB_SSH_RC=255
OUT1=$(fleet watch --once 2>&1)
OUT2=$(fleet watch --once 2>&1)
unset STUB_SSH_RC
contains "first scan reports UNREACHABLE" "$OUT1" "UNREACHABLE WS01"
lacks "second scan does not repeat UNREACHABLE" "$OUT2" "UNREACHABLE WS01"
fresh_run
report "$GEN" 1 claim_request path "src/c.md"
OUT=$(fleet watch --once 2>&1)
contains "watch surfaces a claim request from its sync" "$OUT" "CLAIM-REQ WS01 src/c.md"
lacks "watch hides sync progress chatter" "$OUT" "SYNC WS01"

echo "== test_dashboard_shows_host_states"
fresh_run
export STUB_SSH_RC=255
fleet dashboard --once --no-serve >/dev/null 2>&1; RC=$?
unset STUB_SSH_RC
check "dashboard exits 0 with an unreachable host" "$RC" "0"
PAGE=$(sed '/^<script>$/,/^<\/script>$/d' "$RUN_DIR/dashboard.html")
WS01_CARD=$(printf '%s\n' "$PAGE" | awk '/<article class="card" data-ws="WS01"/,/<\/article>/')
WS02_CARD=$(printf '%s\n' "$PAGE" | awk '/<article class="card" data-ws="WS02"/,/<\/article>/')
contains "host badge on the remote card" "$WS01_CARD" 'class="chip host"'
contains "host badge names the alias" "$WS01_CARD" "vps"
contains "unreachable badge" "$WS01_CARD" 'badge unreachable'
lacks "unreachable card is not DEAD" "$WS01_CARD" 'badge dead'
lacks "local card has no host badge" "$WS02_CARD" 'chip host'
contains "host states published for the live page" "$(cat "$RUN_DIR/host-states.tsv" 2>/dev/null)" $'WS01\tvps\tunreachable'
fresh_run
export STUB_CAPTURE="Do you want to make this edit to a.md?"
fleet dashboard --once --no-serve >/dev/null 2>&1
unset STUB_CAPTURE
WS01_CARD=$(sed '/^<script>$/,/^<\/script>$/d' "$RUN_DIR/dashboard.html" | awk '/<article class="card" data-ws="WS01"/,/<\/article>/')
contains "prompt badge" "$WS01_CARD" 'badge prompt'
contains "live JS knows the host states file" "$(cat "$RUN_DIR/dashboard.html")" "host-states.tsv"

echo "== test_peek_remote_uses_ssh"
fresh_run
export STUB_CAPTURE="Do you want to proceed?"
OUT=$(fleet peek WS01 20 2>&1); RC=$?
check "peek exits 0" "$RC" "0"
contains "peek prints the remote pane" "$OUT" "Do you want to proceed?"
LOG=$(cat "$STUB_LOG")
contains "peek went over ssh" "$LOG" "--ssh"
contains "remote capture-pane" "$LOG" "--tmux remote"
contains "remote session from remote env" "$LOG" $'\nws01\n'
: >"$STUB_LOG"
OUT=$(fleet peek WS02 2>&1); RC=$?
check "local peek exits 0" "$RC" "0"
check "local peek never uses ssh" "$(grep -c '^--ssh' "$STUB_LOG")" "0"
contains "local peek runs tmux here" "$(cat "$STUB_LOG")" "--tmux local"
export STUB_SSH_RC=255
OUT=$(fleet peek WS01 2>&1); RC=$?
unset STUB_SSH_RC
check "unreachable peek exits 66" "$RC" "66"
contains "unreachable peek says so" "$OUT" "unreachable"
OUT=$(fleet peek WS01 abc 2>&1); RC=$?
check "bad line count is usage (64)" "$RC" "64"
unset STUB_CAPTURE

echo "== test_peek_row_without_session_says_so"
fresh_run
# Pending host row mid-spawn: the host column is set, no remote env yet.
rm -f "$RUN_DIR/remote/WS01.env"
awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS01" { $4="spawning" } { print }' "$RUN_DIR/roster.tsv" >"$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
OUT=$(fleet peek WS01 2>&1); RC=$?
check "peek of a spawning host row exits 65" "$RC" "65"
contains "peek says WS01 has no session yet" "$OUT" "WS01 has no session yet (status=spawning)"
lacks "peek does not leak the raw env error" "$OUT" "no remote env"
awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS02" { $4="pending" } { print }' "$RUN_DIR/roster.tsv" >"$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
export STUB_CAPTURE_RC=1
OUT=$(fleet peek WS02 2>&1); RC=$?
unset STUB_CAPTURE_RC
check "peek of a pending local row exits 65" "$RC" "65"
contains "local pending row has no session yet" "$OUT" "WS02 has no session yet (status=pending)"
lacks "no raw pane error for a pending row" "$OUT" "no pane for"
export STUB_CAPTURE_RC=1
awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS02" { $4="working" } { print }' "$RUN_DIR/roster.tsv" >"$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
OUT=$(fleet peek WS02 2>&1); RC=$?
unset STUB_CAPTURE_RC
contains "a working row with a missing pane keeps the pane error" "$OUT" "no pane for WS02"

echo "== test_sync_never_moves_a_spawning_row"
fresh_run
awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS01" { $4="spawning" } { print }' "$RUN_DIR/roster.tsv" >"$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
report "$GEN" 1 status status working
OUT=$(fleet sync WS01 2>&1)
check "worker report leaves a spawning row alone" "$(cell WS01 status)" "spawning"
contains "sync says it refused the status" "$OUT" "refused status 'working'"

echo
echo "sync suite: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
