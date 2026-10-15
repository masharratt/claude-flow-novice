#!/usr/bin/env bash
# tests/test-cfn-fleet-nudge-stop.sh
# `fleet nudge` (type text or named keys into a worker pane) and `fleet stop`
# (close the worker's tmux session only).
#
# SAFETY: never touches a real fleet session or the default tmux server. Every
# tmux call goes to the private socket fleettest-$$ in a throwaway run dir, the
# session process is `cat`, and the EXIT trap kills only that private server.
# Host rows use a stub ssh that runs the remote command locally, on the same
# private socket.
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
FLEET="$PROJECT_ROOT/.claude/skills/cfn-fleet/cli/fleet"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (got '$2', want '$3')"; fi; }
contains() { case "$2" in *"$3"*) ok "$1" ;; *) no "$1 (missing '$3' in: $2)" ;; esac; }
lacks() { case "$2" in *"$3"*) no "$1 (unexpected '$3' in: $2)" ;; *) ok "$1" ;; esac; }

unset TMUX TMUX_PANE
SOCK="fleettest-$$"
source "$PROJECT_ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/fleet-nudge.XXXXXX") || exit 1
TMP_DIR=$(cd -P "$TMP_DIR" && pwd -P) || exit 1
# Private socket directory too, so the default /tmp/tmux-<uid> dir is not used.
export TMUX_TMPDIR="$TMP_DIR/t"
mkdir -p "$TMUX_TMPDIR"
cleanup() { tmux -L "$SOCK" kill-server >/dev/null 2>&1 || true; cfn_safe_rm_tmp "$TMP_DIR"; }
trap cleanup EXIT

RUN="$TMP_DIR/planning/fleet-test"
mkdir -p "$RUN/remote" "$TMP_DIR/bin"
printf 'FLEET_TMUX_SOCKET=%s\n' "$SOCK" >"$RUN/fleet.env"
: >"$RUN/.roster.lock"
export FLEET_NUDGE_DELAY=0
export STUB_LOG="$TMP_DIR/ssh.log"

# Stub ssh: log, honour STUB_SSH_FAIL (255), else run the remote command here.
cat >"$TMP_DIR/bin/ssh" <<'EOF'
#!/usr/bin/env bash
echo "ssh $*" >>"$STUB_LOG"
[ -n "${STUB_SSH_FAIL:-}" ] && exit 255
last="${*: -1}"
exec bash -c "bash -c ${last#bash -lc }"
EOF
chmod +x "$TMP_DIR/bin/ssh"
export PATH="$TMP_DIR/bin:$PATH"

# Roster: local started rows, a pending row, a host row, a host row with no env.
printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\thost\n' >"$RUN/roster.tsv"
row() { printf '%s\t%s\ttask\t%s\t\t\t\t\t0\t\tclaude-haiku\t%s\n' "$1" "$2" "$3" "${4:-}" >>"$RUN/roster.tsv"; }
row WS01 ws01 started
row WS02 ws02 working
row WS03 ws03 pending
row WS04 ws04 working vps
row WS05 ws05 pending vps
row WS06 ws06 working vps
row WS07 ws07 spawning
printf 'FLEET_HOST=vps\nFLEET_SOCK=%s\nFLEET_SESSION=ws04\n' "$SOCK" >"$RUN/remote/WS04.env"
printf 'FLEET_HOST=vps\nFLEET_SOCK=%s\nFLEET_SESSION=ws06\n' "$SOCK" >"$RUN/remote/WS06.env"

ft() { "$FLEET" --run-dir "$RUN" "$@"; }
has_session() { tmux -L "$SOCK" has-session -t "=$1" >/dev/null 2>&1; }
pane() { tmux -L "$SOCK" capture-pane -p -t "=$1:" -S -50 2>/dev/null; }
new_session() { tmux -L "$SOCK" new-session -d -s "$1" -x 200 -y 50 cat; }
for s in ws01 ws02 ws04 ws07 ws010; do new_session "$s"; done
sleep 0.3

echo "== nudge: text"
out=$(ft nudge WS01 "hello worker" 2>&1); rc=$?
check "nudge text rc" "$rc" 0
sleep 0.3
cap=$(pane ws01)
contains "text landed in the target pane" "$cap" "hello worker"
# cat echoes a submitted line, so a delivered Enter shows the text twice.
check "Enter was pressed (line echoed back)" "$(printf '%s\n' "$cap" | grep -c 'hello worker')" 2
lacks "other worker pane untouched" "$(pane ws02)" "hello worker"

echo "== nudge: shell metacharacters arrive literally"
payload="\$(touch $TMP_DIR/canary); touch $TMP_DIR/canary \`touch $TMP_DIR/canary\` 'q\" -n"
ft nudge WS01 "$payload" >/dev/null 2>&1; rc=$?
check "metachar nudge rc" "$rc" 0
sleep 0.3
[ ! -e "$TMP_DIR/canary" ] && ok "canary not created" || no "canary created: payload was executed"
contains "payload typed as literal text" "$(pane ws01)" 'touch'
out=$(ft nudge WS01 "-n leading dash" 2>&1); rc=$?
check "message starting with a dash rc" "$rc" 0

echo "== nudge: keys"
ft nudge WS02 --key y >/dev/null 2>&1; rc=$?
check "key y rc" "$rc" 0
ft nudge WS02 --key 1 2 Enter C-u Escape Up Down Tab BTab n 9 >/dev/null 2>&1; rc=$?
check "full allowlist accepted rc" "$rc" 0
out=$(ft nudge WS02 --key C-c 2>&1); rc=$?
check "disallowed key rc" "$rc" 64
contains "rejection names the allowlist" "$out" "Enter Escape C-u Up Down Tab BTab"
out=$(ft nudge WS02 --key Enter C-d 2>&1); rc=$?
check "one bad key among good ones rejects all" "$rc" 64
out=$(ft nudge WS02 --key 10 2>&1); rc=$?
check "multi-digit key rejected" "$rc" 64
out=$(ft nudge WS02 --key 2>&1); rc=$?
check "--key with no keys" "$rc" 64

echo "== nudge: usage and refusals"
out=$(ft nudge WS01 "" 2>&1); rc=$?
check "empty message" "$rc" 64
out=$(ft nudge WS01 2>&1); rc=$?
check "no message" "$rc" 64
out=$(ft nudge WS01 a b 2>&1); rc=$?
check "two messages" "$rc" 64
out=$(ft nudge 2>&1); rc=$?
check "no ws" "$rc" 64
out=$(ft nudge WS99 "x" 2>&1); rc=$?
check "unknown ws" "$rc" 65
out=$(ft nudge WS03 "x" 2>&1); rc=$?
check "pending row rc" "$rc" 65
contains "pending row message" "$out" "has no session yet"
out=$(ft nudge WS05 "x" 2>&1); rc=$?
check "pending host row rc" "$rc" 65
contains "pending host row message" "$out" "has no session yet"
out=$(ft nudge WS01 --key C-c 2>&1); rc=$?
check "bad key checked before touching tmux" "$rc" 64
tmux -L "$SOCK" kill-session -t "=ws02" >/dev/null 2>&1
out=$(ft nudge WS02 "x" 2>&1); rc=$?
check "session gone rc" "$rc" 65
contains "session gone message" "$out" "no pane for WS02"
new_session ws02

echo "== nudge: host rows"
: >"$STUB_LOG"
ft nudge WS04 "from the master" >/dev/null 2>&1; rc=$?
check "host nudge rc" "$rc" 0
sleep 0.3
contains "host text landed in the server pane" "$(pane ws04)" "from the master"
contains "went over ssh" "$(cat "$STUB_LOG")" "ssh "
: >"$STUB_LOG"
ft nudge WS04 "\$(touch $TMP_DIR/canary2)" >/dev/null 2>&1
sleep 0.3
[ ! -e "$TMP_DIR/canary2" ] && ok "host canary not created" || no "host payload was executed"
STUB_SSH_FAIL=1 ft nudge WS04 "x" >/dev/null 2>&1; rc=$?
check "host unreachable rc" "$rc" 66
STUB_SSH_FAIL=1 ft nudge WS04 --key Enter >/dev/null 2>&1; rc=$?
check "host unreachable (keys) rc" "$rc" 66

echo "== peek still works through the shared resolver"
out=$(ft peek WS01 10 2>&1); rc=$?
check "peek local rc" "$rc" 0
contains "peek shows the pane" "$out" "hello worker"
out=$(ft peek WS03 2>&1); rc=$?
check "peek pending rc" "$rc" 65
# Regression: a local spawning row already has a session (spawn clears its
# startup prompts there), so peek and nudge must reach it.
out=$(ft peek WS07 5 2>&1); rc=$?
check "peek local spawning rc" "$rc" 0
out=$(ft nudge WS07 --key Enter 2>&1); rc=$?
check "nudge local spawning rc" "$rc" 0
out=$(ft peek WS04 10 2>&1); rc=$?
check "peek host rc" "$rc" 0

echo "== stop"
out=$(ft stop WS01 2>&1); rc=$?
check "stop rc" "$rc" 0
contains "stop message" "$out" "closed session 'ws01'"
has_session ws01 && no "ws01 session still alive" || ok "ws01 session closed"
has_session ws02 && ok "other worker session survives" || no "ws02 was killed"
has_session ws010 && ok "prefix-sharing session survives (exact match)" || no "ws010 was killed by stopping a prefix"
out=$(ft stop WS01 2>&1); rc=$?
check "stop idempotent rc" "$rc" 0
contains "already gone message" "$out" "already gone"
# With ws01 gone, a bare "-t ws01" would prefix-match ws010 and type into it.
out=$(ft nudge WS01 "stray-to-ws010" 2>&1); rc=$?
check "nudge stopped worker rc" "$rc" 65
lacks "nudge never lands in prefix-sharing session" "$(pane ws010)" "stray-to-ws010"
grep -q "^WS01	ws01	task	started" "$RUN/roster.tsv" && ok "roster row untouched by stop" || no "roster row changed"
out=$(ft stop WS03 2>&1); rc=$?
check "stop pending row rc" "$rc" 65
contains "stop pending message" "$out" "has no session yet"
out=$(ft stop WS99 2>&1); rc=$?
check "stop unknown ws" "$rc" 65
out=$(ft stop 2>&1); rc=$?
check "stop no ws" "$rc" 64
out=$(ft stop WS02 WS04 2>&1); rc=$?
check "stop two ws" "$rc" 64
has_session ws02 && ok "usage error killed nothing" || no "ws02 killed by a usage error"

echo "== stop: host rows"
STUB_SSH_FAIL=1 ft stop WS04 >/dev/null 2>&1; rc=$?
check "host stop unreachable rc" "$rc" 66
has_session ws04 && ok "unreachable stop killed nothing" || no "ws04 killed while ssh failed"
out=$(ft stop WS04 2>&1); rc=$?
check "host stop rc" "$rc" 0
has_session ws04 && no "ws04 still alive" || ok "host session closed"
has_session ws02 && ok "other worker survives host stop" || no "ws02 killed by host stop"
out=$(ft stop WS04 2>&1); rc=$?
check "host stop idempotent rc" "$rc" 0
out=$(ft stop WS05 2>&1); rc=$?
check "host stop pending rc" "$rc" 65

echo
echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
