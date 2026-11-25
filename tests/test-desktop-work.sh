#!/usr/bin/env bash
# tests/test-desktop-work.sh
# Desktop "work" layout: one tmux session per project, one window per Claude chat, a snapshot
# timer that records every chat, and an automatic restore after reboot that resumes each chat.
# Offline: a private tmux socket (-L) and a fake claude that registers itself the way the real
# one does (~/.claude/sessions/<pid>.json with pid, sessionId, cwd, procStart). Never touches the
# default tmux socket or real chats.
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
D="$PROJECT_ROOT/.claude/cfn-scripts/desktop-work"
WORK="$D/work.sh"

# shellcheck source=../.claude/cfn-scripts/lib/safe-rm.sh
source "$PROJECT_ROOT/.claude/cfn-scripts/lib/safe-rm.sh"

command -v tmux >/dev/null 2>&1 || { echo "SKIP: tmux not installed"; exit 0; }
command -v jq >/dev/null 2>&1 || { echo "SKIP: jq not installed"; exit 0; }

TEST_TMP=$(mktemp -d "${TMPDIR:-/tmp}/desktop-work.XXXXXX") || exit 1
TEST_TMP=$(cd -P "$TEST_TMP" && pwd -P) || exit 1
SOCK="dwtest-$$"
cleanup() {
  tmux -L "$SOCK" kill-server >/dev/null 2>&1 || true
  cfn_safe_rm_tmp "$TEST_TMP"
}
trap cleanup EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok   $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; [ -n "${2:-}" ] && echo "       $2"; return 0; }
check_eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected [$3] got [$2]"; fi; }
check_has() { case "$2" in *"$3"*) pass "$1" ;; *) fail "$1" "missing [$3] in [$2]" ;; esac; }
check_lacks() { case "$2" in *"$3"*) fail "$1" "unexpected [$3] in [$2]" ;; *) pass "$1" ;; esac; }

H="$TEST_TMP/home"; mkdir -p "$H"
SESS="$TEST_TMP/sessions"; mkdir -p "$SESS"
STATE="$TEST_TMP/state"
BOOT="$TEST_TMP/boot_id"; echo boot-1 > "$BOOT"
LOG="$TEST_TMP/claude-calls"; : > "$LOG"
PROJ="$TEST_TMP/projects"; mkdir -p "$PROJ/Alpha" "$PROJ/beta-two/sub"

# Fake claude: logs its argv and cwd, registers like the real CLI, then waits.
BIN="$TEST_TMP/bin"; mkdir -p "$BIN"
cat > "$BIN/fake-claude" <<EOF
#!/usr/bin/env bash
id=""; prev=""
for a in "\$@"; do [ "\$prev" = --resume ] && id="\$a"; prev="\$a"; done
[ -n "\$id" ] || id="new-\$\$"
printf '%s|%s\n' "\$PWD" "\$*" >> "$LOG"
ps=\$(awk '{print \$22}' /proc/\$\$/stat)
printf '{"pid":%s,"sessionId":"%s","cwd":"%s","procStart":"%s","kind":"interactive"}\n' "\$\$" "\$id" "\$PWD" "\$ps" > "$SESS/\$\$.json"
exec sleep 600
EOF
chmod +x "$BIN/fake-claude"

export WORK_TMUX_SOCKET="$SOCK" WORK_SESSIONS_DIR="$SESS" WORK_STATE_DIR="$STATE" \
  WORK_BOOT_ID_FILE="$BOOT" WORK_CLAUDE="$BIN/fake-claude" WORK_PROJECTS_DIR="$PROJ" \
  WORK_STAGGER=0 WORK_WAIT_MOUNTS="" WORK_MOUNT_TIMEOUT=1 WORK_NO_ATTACH=1 WORK_SHELL=bash
t() { tmux -L "$SOCK" "$@"; }
work() { set +e; OUT=$(HOME="$H" bash "$WORK" "$@" 2>&1); RC=$?; set -e; }
# Wait until N fake claudes have registered.
wait_chats() { local _; for _ in $(seq 50); do [ "$(find "$SESS" -name '*.json' | wc -l)" -ge "$1" ] && return 0; sleep 0.1; done; return 1; }
windows() { t list-windows -a -F '#{session_name}:#{window_name}' 2>/dev/null | sort | tr '\n' ' '; }

echo "== snapshot"
# GIVEN two chats in project Alpha and one in beta-two/sub, plus a plain shell window
t new-session -d -s alpha -n Master -c "$PROJ/Alpha" "$BIN/fake-claude --resume id-a1"
t new-window -t alpha: -n Desk -c "$PROJ/Alpha" "bash -c '$BIN/fake-claude --resume id-a2'"
t new-window -t alpha: -n shell -c "$PROJ/Alpha"
# A one-window session from the old dsp layout (named with a tag) joins its project's session on restore.
t new-session -d -s alpha-4d -n Look -c "$PROJ/Alpha" "$BIN/fake-claude --resume id-a3"
t new-session -d -s beta-two -n Work -c "$PROJ/beta-two/sub" "$BIN/fake-claude --resume id-b1"
wait_chats 4 || fail "fake claudes registered"
# A stale registration whose process is gone must be ignored.
printf '{"pid":999999,"sessionId":"id-dead","cwd":"/x","procStart":"1"}\n' > "$SESS/999999.json"

work snapshot
check_eq "first snapshot: exit 0" "$RC" "0"
SNAP="$STATE/snapshot.json"
check_eq "snapshot written" "$([ -f "$SNAP" ] && echo yes)" "yes"
check_eq "records 4 chats, not the shell window" "$(jq '.chats | length' "$SNAP" 2>/dev/null)" "4"
check_eq "chat ids in window order" "$(jq -r '[.chats[].session_id] | join(",")' "$SNAP" 2>/dev/null)" "id-a1,id-a2,id-a3,id-b1"
check_eq "records old session name" "$(jq -r '.chats[] | select(.session_id=="id-a3") | .session' "$SNAP" 2>/dev/null)" "alpha-4d"
check_eq "nested claude (pane runs a shell) found" "$(jq -r '.chats[] | select(.session_id=="id-a2") | .window' "$SNAP" 2>/dev/null)" "Desk"
check_eq "records claude cwd" "$(jq -r '.chats[] | select(.session_id=="id-b1") | .cwd' "$SNAP" 2>/dev/null)" "$PROJ/beta-two/sub"
check_eq "records tmux session" "$(jq -r '.chats[] | select(.session_id=="id-b1") | .session' "$SNAP" 2>/dev/null)" "beta-two"
check_lacks "stale registration ignored" "$(cat "$SNAP" 2>/dev/null)" "id-dead"


echo "== snapshot guards"
cp "$SNAP" "$TEST_TMP/good.json" 2>/dev/null || echo '{"chats":[]}' > "$TEST_TMP/good.json"
# New boot, restore has not run yet: a good snapshot must not be replaced.
echo boot-2 > "$BOOT"
t kill-window -t alpha:Desk
work snapshot
check_eq "before restore this boot: snapshot kept" "$(jq '.chats | length' "$SNAP")" "4"
check_has "says why it skipped" "$OUT" "restore"
echo boot-1 > "$BOOT"; echo boot-1 > "$STATE/restored-boot"
work snapshot
check_eq "after restore this boot: snapshot follows live chats" "$(jq '.chats | length' "$SNAP")" "3"
check_eq "previous snapshot kept" "$(jq '.chats | length' "$STATE/snapshot.prev.json" 2>/dev/null)" "4"
# Nothing running: never overwrite with an empty snapshot.
t kill-server; sleep 0.3
work snapshot
check_eq "no chats: exit 0" "$RC" "0"
check_eq "no chats: snapshot not emptied" "$(jq '.chats | length' "$SNAP")" "3"
check_has "no chats: says so" "$OUT" "no chats"

echo "== restore"
cp "$TEST_TMP/good.json" "$SNAP"
find "$SESS" -name '*.json' -delete; : > "$LOG"
echo boot-3 > "$BOOT"
work restore
check_eq "restore: exit 0" "$RC" "0"
wait_chats 4 || fail "restored chats registered" "$(cat "$LOG")"
check_eq "one session per project, one window per chat" "$(windows)" "alpha:Desk alpha:Look alpha:Master beta-two:Work "
check_has "resumes the old conversation with skip-permissions" "$(cat "$LOG")" "$PROJ/Alpha|--dangerously-skip-permissions --resume id-a1"
check_has "starts in the chat's own folder" "$(cat "$LOG")" "$PROJ/beta-two/sub|--dangerously-skip-permissions --resume id-b1"
check_eq "marks restore done for this boot" "$(cat "$STATE/restored-boot" 2>/dev/null)" "boot-3"
check_eq "snapshot untouched by restore" "$(jq '.chats | length' "$SNAP")" "4"

echo "== restore is idempotent"
: > "$LOG"
work restore
sleep 0.5
check_eq "second restore: exit 0" "$RC" "0"
check_eq "second restore starts nothing" "$(cat "$LOG")" ""
check_eq "same windows" "$(windows)" "alpha:Desk alpha:Look alpha:Master beta-two:Work "
check_has "reports skipped chats" "$OUT" "already running"

echo "== restore waits for disks, then goes anyway"
t kill-server; sleep 0.3; find "$SESS" -name '*.json' -delete; : > "$LOG"
set +e
OUT=$(HOME="$H" WORK_WAIT_MOUNTS="$TEST_TMP/not-a-mount" WORK_MOUNT_TIMEOUT=1 WORK_MOUNT_TRIGGER=true bash "$WORK" restore 2>&1); RC=$?
set -e
check_eq "missing disk: still exit 0" "$RC" "0"
check_has "missing disk: logged" "$OUT" "not mounted"
wait_chats 4 || fail "chats restored after disk timeout"
check_eq "missing disk: chats restored anyway" "$(windows)" "alpha:Desk alpha:Look alpha:Master beta-two:Work "
check_has "log file kept" "$(cat "$STATE/work.log" 2>/dev/null)" "not mounted"

echo "== restore with no snapshot"
mv "$SNAP" "$TEST_TMP/snap.bak"; echo boot-4 > "$BOOT"
work restore
check_eq "no snapshot: exit 0" "$RC" "0"
check_eq "no snapshot: still marks this boot done" "$(cat "$STATE/restored-boot")" "boot-4"
mv "$TEST_TMP/snap.bak" "$SNAP"

echo "== open (dsp/dspr): new window in the project's session"
t kill-server; sleep 0.3; find "$SESS" -name '*.json' -delete; : > "$LOG"
set +e
OUT=$(cd "$PROJ/Alpha" && HOME="$H" bash "$WORK" open -- "$BIN/fake-claude" --resume id-x 2>&1); RC=$?
set -e
check_eq "open with no session: exit 0" "$RC" "0"
check_eq "creates the project session" "$(t list-sessions -F '#{session_name}' 2>/dev/null | tr '\n' ' ')" "alpha "
set +e
OUT=$(cd "$PROJ/Alpha" && HOME="$H" bash "$WORK" open --name 3d -- "$BIN/fake-claude" --resume id-y 2>&1); RC=$?
set -e
check_eq "second open: exit 0" "$RC" "0"
check_eq "second chat is a window, not a new session" "$(t list-sessions -F '#{session_name}' | tr '\n' ' ')" "alpha "
check_eq "two windows in alpha" "$(t list-windows -t alpha -F x | wc -l | tr -d ' ')" "2"
check_has "tag becomes the window name" "$(windows)" "alpha:3d"
# An existing project session is reused, even from a subfolder (no duplicate session).
set +e
OUT=$(cd "$PROJ/beta-two/sub" && HOME="$H" bash "$WORK" open -- "$BIN/fake-claude" --resume id-z 2>&1)
OUT=$(cd "$PROJ/beta-two" && HOME="$H" bash "$WORK" open -- "$BIN/fake-claude" --resume id-w 2>&1)
set -e
check_eq "subfolder chat joins the project session" "$(t list-sessions -F '#{session_name}' | tr '\n' ' ')" "alpha beta-two "
wait_chats 2 || fail "opened chats registered"
check_has "opened in the current folder" "$(cat "$LOG")" "$PROJ/Alpha|--resume id-y"

echo "== project list"
work list
check_has "lists projects folder" "$OUT" "Alpha"
check_has "lists beta-two" "$OUT" "beta-two"
check_has "shows open chat count" "$OUT" "2 chats"

echo "== install (temp HOME, no systemd)"
H2="$TEST_TMP/home2"; mkdir -p "$H2"
printf 'set -g history-limit 5000\n' > "$H2/.tmux.conf"
set +e
OUT=$(HOME="$H2" WORK_NO_SYSTEMD=1 bash "$D/install.sh" 2>&1); RC=$?
set -e
check_eq "install: exit 0" "$RC" "0"
check_eq "work command linked" "$(readlink "$H2/.local/bin/work" 2>/dev/null)" "$WORK"
check_has "tmux mouse mode on (click tabs)" "$(cat "$H2/.tmux.conf")" "set -g mouse on"
check_has "existing tmux.conf kept" "$(cat "$H2/.tmux.conf")" "history-limit 5000"
check_eq "tmux.conf backed up" "$(find "$H2" -maxdepth 1 -name '.tmux.conf.bak-*' | wc -l | tr -d ' ')" "1"
check_has "units copied" "$(ls "$H2/.config/systemd/user" 2>/dev/null | tr '\n' ' ')" "work-restore.service work-snapshot.service work-snapshot.timer"
set +e
OUT=$(HOME="$H2" WORK_NO_SYSTEMD=1 bash "$D/install.sh" 2>&1); RC=$?
set -e
check_eq "install twice: mouse line once" "$(grep -c 'set -g mouse on' "$H2/.tmux.conf")" "1"
H3="$TEST_TMP/home3"; mkdir -p "$H3"
set +e; HOME="$H3" WORK_NO_SYSTEMD=1 bash "$D/install.sh" >/dev/null 2>&1; set -e
check_has "no tmux.conf: created with mouse on" "$(cat "$H3/.tmux.conf" 2>/dev/null)" "set -g mouse on"

echo "== units"
check_has "snapshot timer every 2 minutes" "$(cat "$D/work-snapshot.timer" 2>/dev/null)" "OnUnitActiveSec=2min"
check_has "restore runs at login" "$(cat "$D/work-restore.service" 2>/dev/null)" "WantedBy=default.target"
check_has "restore leaves tmux running when the unit ends" "$(cat "$D/work-restore.service" 2>/dev/null)" "KillMode=process"

echo
echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
