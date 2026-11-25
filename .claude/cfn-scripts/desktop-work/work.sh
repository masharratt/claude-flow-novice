#!/usr/bin/env bash
# work: desktop session layout. One tmux session per project, one window per Claude chat.
#
#   work [text]        pick a project (or jump to the best name match) and attach to its session
#   work list          list project folders with how many chats each has open
#   work open [--name W] -- cmd...   open cmd as a new window in the current project's session
#                      (dsp/dspr call this); creates the session when missing, then attaches
#   work snapshot      record every Claude chat on the default tmux socket (systemd timer, ~2 min)
#   work restore       recreate sessions/windows from the snapshot, resuming each chat
#                      (systemd unit, once at login after boot). Skips chats already running.
#
# Only the default tmux socket is read or written: cfn-tmux-agents worker sockets are separate.
# State: ~/.local/state/work/{snapshot.json,snapshot.prev.json,restored-boot,work.log}.
# Source: claude-flow-novice .claude/cfn-scripts/desktop-work/ (installed by install.sh).
set -euo pipefail

PROJECTS="${WORK_PROJECTS_DIR:-$HOME/projects}"
STATE="${WORK_STATE_DIR:-$HOME/.local/state/work}"
SESSIONS="${WORK_SESSIONS_DIR:-$HOME/.claude/sessions}"
BOOT_ID_FILE="${WORK_BOOT_ID_FILE:-/proc/sys/kernel/random/boot_id}"
CLAUDE="${WORK_CLAUDE:-claude}"
STAGGER="${WORK_STAGGER:-5}"
WAIT_MOUNTS="${WORK_WAIT_MOUNTS-/mnt/wsl/churn}"
MOUNT_TIMEOUT="${WORK_MOUNT_TIMEOUT:-180}"
SHELL_BIN="${WORK_SHELL:-bash}"
SNAP="$STATE/snapshot.json"
LOGF="$STATE/work.log"

t() { if [ -n "${WORK_TMUX_SOCKET:-}" ]; then tmux -L "$WORK_TMUX_SOCKET" "$@"; else tmux "$@"; fi; }
log() { mkdir -p "$STATE"; printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOGF" >&2; }
boot_id() { cat "$BOOT_ID_FILE" 2>/dev/null || echo unknown; }

# Session name for a folder: its project (git top level, else the top folder under the projects
# dir, else the folder itself), lowercased to [a-z0-9-] like dsp. One session per project.
slug_for() {
  local top s rel
  if ! top=$(git -C "$1" rev-parse --show-toplevel 2>/dev/null); then
    top="$1"
    case "$1/" in "$PROJECTS"/?*) rel=${1#"$PROJECTS"/}; top="$PROJECTS/${rel%%/*}" ;; esac
  fi
  s=$(basename "$top" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9-]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//' | cut -c1-40)
  printf '%s' "${s:-shell}"
}

# Registration (sessions/<pid>.json) of a live chat process, checked against the process start
# time so a reused pid is not mistaken for the chat that registered.
live_reg() {
  local pid=$1 f="$SESSIONS/$1.json" ps want
  [ -f "$f" ] && [ -r "/proc/$pid/stat" ] || return 1
  want=$(jq -r '.procStart // empty' "$f" 2>/dev/null) || return 1
  ps=$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null) || return 1
  [ -z "$want" ] || [ "$want" = "$ps" ] || return 1
  cat "$f"
}

# First registered chat at or below pid (a pane may run a shell that runs claude).
find_chat() {
  local queue=("$1") p kids
  while [ ${#queue[@]} -gt 0 ]; do
    p=${queue[0]}; queue=("${queue[@]:1}")
    if live_reg "$p"; then return 0; fi
    kids=$(cat /proc/"$p"/task/*/children 2>/dev/null || true)
    for k in $kids; do queue+=("$k"); done
  done
  return 1
}

# Session ids of every live chat on this machine (any socket, any terminal).
running_ids() {
  local f pid
  for f in "$SESSIONS"/*.json; do
    [ -e "$f" ] || continue
    pid=$(basename "$f" .json)
    case "$pid" in *[!0-9]*) continue ;; esac
    live_reg "$pid" | jq -r '.sessionId // empty' 2>/dev/null || true
  done
}

cmd_snapshot() {
  mkdir -p "$STATE"
  # After a boot, only the restore may decide what the layout was: until it has run, live
  # state is partial and would overwrite the good snapshot.
  if [ -f "$SNAP" ] && [ "$(cat "$STATE/restored-boot" 2>/dev/null)" != "$(boot_id)" ]; then
    echo "work snapshot: skipped, restore has not run since this boot" >&2; return 0
  fi
  local panes sess widx wname ppid reg chats="[]"
  panes=$(t list-panes -a -F '#{session_name}|#{window_index}|#{window_name}|#{pane_pid}' 2>/dev/null || true)
  while IFS='|' read -r sess widx wname ppid; do
    [ -n "${ppid:-}" ] || continue
    reg=$(find_chat "$ppid") || continue
    chats=$(jq -c --arg s "$sess" --argjson i "$widx" --arg w "$wname" --argjson r "$reg" \
      '. + [{session:$s, window_index:$i, window:$w, cwd:$r.cwd, session_id:$r.sessionId, pid:$r.pid}]
       | unique_by(.session_id) | sort_by(.session, .window_index)' <<<"$chats") || continue
  done <<<"$panes"
  local n; n=$(jq 'length' <<<"$chats")
  if [ "$n" -eq 0 ]; then
    echo "work snapshot: no chats running; previous snapshot kept" >&2; return 0
  fi
  local tmp="$SNAP.tmp.$$"
  jq -n --arg at "$(date -Iseconds)" --arg boot "$(boot_id)" --argjson c "$chats" \
    '{version:1, taken_at:$at, boot_id:$boot, chats:$c}' > "$tmp"
  if [ -f "$SNAP" ] && ! cmp -s <(jq -c .chats "$SNAP" 2>/dev/null) <(jq -c .chats "$tmp"); then
    cp -f "$SNAP" "$STATE/snapshot.prev.json"
  fi
  mv -f "$tmp" "$SNAP"
  echo "work snapshot: $n chats"
}

wait_mounts() {
  local m missing waited=0
  [ -n "$WAIT_MOUNTS" ] || return 0
  for m in $WAIT_MOUNTS; do mountpoint -q "$m" 2>/dev/null || missing=1; done
  [ -n "${missing:-}" ] || return 0
  # The Windows logon task attaches the disks; it does not rerun after wsl --shutdown, so ask.
  if [ -n "${WORK_MOUNT_TRIGGER:-}" ]; then
    $WORK_MOUNT_TRIGGER >/dev/null 2>&1 || true
  elif [ -x /mnt/c/Windows/System32/schtasks.exe ]; then
    (cd /mnt/c && /mnt/c/Windows/System32/schtasks.exe /run /tn "WSL build disk" >/dev/null 2>&1) || true
  fi
  while [ "$waited" -lt "$MOUNT_TIMEOUT" ]; do
    missing=""
    for m in $WAIT_MOUNTS; do mountpoint -q "$m" 2>/dev/null || missing="$missing $m"; done
    [ -z "$missing" ] && { log "disks mounted after ${waited}s"; return 0; }
    sleep 1; waited=$((waited + 1))
  done
  log "disk not mounted after ${MOUNT_TIMEOUT}s:$missing; restoring anyway"
}

cmd_restore() {
  mkdir -p "$STATE"
  local src="$SNAP"
  if ! jq -e '.chats | length > 0' "$src" >/dev/null 2>&1; then
    src="$STATE/snapshot.prev.json"
    if ! jq -e '.chats | length > 0' "$src" >/dev/null 2>&1; then
      log "restore: no snapshot, nothing to restore"
      boot_id > "$STATE/restored-boot"; return 0
    fi
    log "restore: snapshot.json unreadable, using snapshot.prev.json"
  fi
  wait_mounts
  local running started=0 skipped=0 first=1 sess wname cwd sid cmd
  running=$(running_ids)
  while IFS=$'\t' read -r sess wname cwd sid; do
    [ -n "$sid" ] || continue
    if grep -qxF -- "$sid" <<<"$running"; then skipped=$((skipped + 1)); continue; fi
    [ -d "$cwd" ] || { log "restore: folder gone, skipping $sess/$wname: $cwd"; continue; }
    [ "$first" -eq 1 ] || sleep "$STAGGER"
    first=0
    # An interactive shell loads ~/.bashrc (PATH, CARGO_TARGET_DIR) and stays open after claude exits.
    cmd="$(printf '%q ' "$CLAUDE" --dangerously-skip-permissions --resume "$sid"); exec $SHELL_BIN -i"
    # Group by project, whatever session the chat lived in before (old one-window sessions too).
    sess=$(slug_for "$cwd")
    if t has-session -t "=$sess" 2>/dev/null; then
      t new-window -d -t "=$sess:" -n "$wname" -c "$cwd" "$SHELL_BIN" -ic "$cmd"
    else
      t new-session -d -s "$sess" -n "$wname" -c "$cwd" "$SHELL_BIN" -ic "$cmd"
    fi
    running="$running"$'\n'"$sid"
    started=$((started + 1))
    log "restore: started $sess/$wname ($sid)"
  done < <(jq -r '.chats[] | [.session, .window, .cwd, .session_id] | @tsv' "$src")
  boot_id > "$STATE/restored-boot"
  log "restore: started $started, already running $skipped"
}

attach_to() { # session [window-id]
  local s=$1 w=${2:-}
  [ -z "${WORK_NO_ATTACH:-}" ] || return 0
  if [ -n "${TMUX:-}" ]; then exec tmux switch-client -t "${w:-=$s}"; fi
  if [ "$(t list-clients -t "=$s" 2>/dev/null | wc -l)" -gt 0 ]; then
    # Already shown on another screen: a linked view lets each screen show a different chat.
    exec tmux new-session -t "=$s" -s "$s-view-$$" \; set-option destroy-unattached on \; ${w:+select-window -t "$w"}
  fi
  [ -z "$w" ] || t select-window -t "$w"
  exec tmux attach -t "=$s"
}

cmd_open() {
  local name=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --name) name=$2; shift 2 ;;
      --) shift; break ;;
      *) break ;;
    esac
  done
  [ $# -gt 0 ] || { echo "work open: no command" >&2; return 2; }
  local s w; s=$(slug_for "$PWD")
  local nflag=(); [ -z "$name" ] || nflag=(-n "$name")
  if t has-session -t "=$s" 2>/dev/null; then
    w=$(t new-window -P -F '#{window_id}' -t "=$s:" "${nflag[@]}" -c "$PWD" -e "PATH=$PATH" "$@")
  else
    t new-session -d -s "$s" "${nflag[@]}" -c "$PWD" -e "PATH=$PATH" "$@"
    w=""
  fi
  attach_to "$s" "$w"
}

cmd_list() {
  local d n s c
  for d in "$PROJECTS"/*/; do
    [ -d "$d" ] || continue
    n=$(basename "$d"); s=$(slug_for "$d")
    if t has-session -t "=$s" 2>/dev/null; then
      c=$(t list-windows -t "=$s" 2>/dev/null | wc -l | tr -d ' ')
      printf '%s\t(%s chats)\n' "$n" "$c"
    else
      printf '%s\n' "$n"
    fi
  done
}

cmd_pick() {
  local pick
  if [ $# -gt 0 ]; then
    pick=$(cmd_list | cut -f1 | grep -iF -- "$*" | head -1 || true)
    [ -n "$pick" ] || { echo "work: no project matches '$*'" >&2; return 1; }
  elif command -v fzf >/dev/null 2>&1; then
    pick=$(cmd_list | fzf --prompt="project> " --height=40% --reverse --delimiter=$'\t' | cut -f1)
  else
    local items; mapfile -t items < <(cmd_list)
    PS3="project> "
    select pick in "${items[@]}"; do break; done
    pick=$(printf '%s' "${pick:-}" | cut -f1)
  fi
  [ -n "$pick" ] || return 0
  local s; s=$(slug_for "$PROJECTS/$pick")
  t has-session -t "=$s" 2>/dev/null || t new-session -d -s "$s" -c "$PROJECTS/$pick"
  attach_to "$s"
}

case "${1:-}" in
  snapshot) shift; cmd_snapshot "$@" ;;
  restore) shift; cmd_restore "$@" ;;
  open) shift; cmd_open "$@" ;;
  list) shift; cmd_list "$@" ;;
  -h|--help|help) sed -n '2,13p' "$0" ;;
  *) cmd_pick "$@" ;;
esac
