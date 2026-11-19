#!/usr/bin/env bash
# cfn-fleet lib/cmd-nudge.sh: type into a worker's pane without raw tmux.
#
#   fleet nudge WSxx "message"        mail it (coordinator mail, type answer); the
#                                     mailbox watcher wakes an idle pane. Typed
#                                     instead when the mailbox is off or down.
#   fleet nudge WSxx --tmux "message" type the text literally, then press Enter
#   fleet nudge WSxx --key K [K ...]  press named keys only (allowlist below;
#                                     always typed: a prompt cannot read mail)
#
# Host rows (no --tmux, no --key): the lane is sandboxed and cannot read mail,
# so the text goes into its <outbox>/FROM_MASTER.md over ssh (type answer) and
# a short pointer is typed into the pane, then a separate Enter
# (lane-deliver.sh). The mailbox is skipped for them.
# The text goes through `send-keys -l`, so shell metacharacters arrive as
# literal characters in the pane and are never interpreted here or on the host.
# Host rows act on the server pane over ssh exactly like `fleet peek`.
# FLEET_NUDGE_DELAY (default 1) is the pause between the text and Enter: a
# worker mid-turn drops an Enter that arrives in the same instant.
#
# Exit codes: 0 ok | 64 usage | 65 unknown ws or no such session | 66 host
# unreachable.

# shellcheck source=cmd-peek.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cmd-peek.sh"

# shellcheck source=../../../cfn-scripts/lib/tui-prompt.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../cfn-scripts/lib" && pwd)/tui-prompt.sh"

_FLEET_NUDGE_KEYS="Enter Escape C-u Up Down Tab BTab 1 2 3 4 5 6 7 8 9 y n"

_fleet_nudge_usage() {
  fleet_die 64 "usage: fleet nudge WSxx [--tmux] \"message\" | fleet nudge WSxx --key K [K ...]"
}

# _fleet_nudge_send WS ARGS...: one tmux send-keys on the worker's pane.
_fleet_nudge_send() {
  local ws="$1" rc=0
  shift
  # "=name:" matches the session exactly (a bare name prefix-matches ws01 vs ws010).
  _fleet_tmux "$_PT_HOST" -L "$_PT_SOCK" send-keys -t "=$_PT_SESSION:" "$@" \
    >/dev/null 2>&1 || rc=$?
  case "$rc" in
    0) return 0 ;;
    "$_FLEET_SSH_FAIL_RC"|"$_FLEET_TIMEOUT_RC")
      fleet_die 66 "nudge: host $_PT_HOST is unreachable" ;;
    *)
      fleet_die 65 "nudge: no pane for $ws (session '$_PT_SESSION' not found)" ;;
  esac
}

# _fleet_nudge_tmux ARGS...: tmux on the worker's host, for tui_send_followup.
_fleet_nudge_tmux() { _fleet_tmux "$_PT_HOST" "$@"; }

main() {
  local ws="${1:-}" k force_tmux=0
  [ -n "$ws" ] || _fleet_nudge_usage
  [ $# -ge 2 ] || _fleet_nudge_usage
  if [ "$2" = "--tmux" ]; then
    force_tmux=1
    set -- "$1" "${@:3}"
    [ $# -ge 2 ] || _fleet_nudge_usage
  fi
  if [ "$2" = "--key" ]; then
    [ $# -ge 3 ] || _fleet_nudge_usage
    for k in "${@:3}"; do
      case " $_FLEET_NUDGE_KEYS " in
        *" $k "*) ;;
        *) fleet_die 64 "nudge: key '$k' not allowed; allowed keys: $_FLEET_NUDGE_KEYS" ;;
      esac
    done
    _fleet_pane_target "$ws" nudge
    _fleet_nudge_send "$ws" "${@:3}"
    return 0
  fi
  [ $# -eq 2 ] || _fleet_nudge_usage
  [ -n "$2" ] || _fleet_nudge_usage
  # Host row: FROM_MASTER.md + pointer nudge (the lane cannot read mail).
  if [ "$force_tmux" -eq 0 ]; then
    roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
    local host drc=0
    host=$(roster_get "$ws" host)
    if [ -n "$host" ]; then
      _fleet_mail_body_ok "$2" || fleet_die 64 "nudge: text must be 1 to $_FLEET_MAIL_BODY_MAX bytes; name a file instead"
      _fleet_lane_deliver "$ws" answer "$2" || drc=$?
      case "$drc" in
        0) echo "delivered $ws answer to FROM_MASTER.md on $host; lane nudged"; return 0 ;;
        5) fleet_die 66 "nudge: FROM_MASTER.md on $host has the text, but the pointer typed into the pane failed or was never submitted (fleet peek $ws)" ;;
        2) ;;  # no remote env yet: the pane-target path below says so
        "$_FLEET_SSH_FAIL_RC"|"$_FLEET_TIMEOUT_RC") fleet_die 66 "nudge: host $host is unreachable" ;;
        *) fleet_die 66 "nudge: FROM_MASTER.md on $host not written (rc $drc)" ;;
      esac
    fi
  fi
  # Mailbox first (stage 5): the text goes as coordinator mail of type answer
  # and the mailbox watcher wakes the pane if it is idle. Typing is the
  # fallback when the mailbox cannot take it, or forced with --tmux.
  if [ "$force_tmux" -eq 0 ] && _fleet_mb_enabled; then
    roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
    _fleet_mail_body_ok "$2" || fleet_die 64 "nudge: text must be 1 to $_FLEET_MAIL_BODY_MAX bytes; name a file instead"
    local id rc=0
    id=$(_fleet_mail_send "$ws" answer "$2" 2>/dev/null) || rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "mailed $ws answer $id"
      return 0
    fi
    echo "WARN nudge: MAILBOX-DOWN ($(_fleet_mb_down_reason "$rc")); typing into the pane instead" >&2
  fi
  _fleet_pane_target "$ws" nudge
  # Probe the pane first so a missing session or dead host keeps its 65/66.
  _fleet_nudge_send "$ws" -l -- ""
  local frc=0
  TUI_TMUX_CMD=_fleet_nudge_tmux TUI_SUBMIT_SETTLE="${FLEET_NUDGE_DELAY:-1}" \
    tui_send_followup "$_PT_SOCK" "=$_PT_SESSION:" "$2" >/dev/null 2>&1 || frc=$?
  case "$frc" in
    0) return 0 ;;
    2) fleet_die 66 "nudge: text typed into $ws but never submitted; it may still sit in the input line (fleet peek $ws)" ;;
    *) fleet_die 66 "nudge: tmux send-keys to $ws failed (fleet peek $ws)" ;;
  esac
}
