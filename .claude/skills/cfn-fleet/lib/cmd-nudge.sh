#!/usr/bin/env bash
# cfn-fleet lib/cmd-nudge.sh: type into a worker's pane without raw tmux.
#
#   fleet nudge WSxx "message"        type the text literally, then press Enter
#   fleet nudge WSxx --key K [K ...]  press named keys only (allowlist below)
#
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

_FLEET_NUDGE_KEYS="Enter Escape C-u Up Down Tab BTab 1 2 3 4 5 6 7 8 9 y n"

_fleet_nudge_usage() {
  fleet_die 64 "usage: fleet nudge WSxx \"message\" | fleet nudge WSxx --key K [K ...]"
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

main() {
  local ws="${1:-}" k
  [ -n "$ws" ] || _fleet_nudge_usage
  [ $# -ge 2 ] || _fleet_nudge_usage
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
  _fleet_pane_target "$ws" nudge
  _fleet_nudge_send "$ws" -l -- "$2"
  sleep "${FLEET_NUDGE_DELAY:-1}"
  _fleet_nudge_send "$ws" Enter
}
