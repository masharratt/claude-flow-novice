#!/usr/bin/env bash
# cfn-fleet lib/cmd-peek.sh: read a worker's pane without attaching.
#
#   fleet peek WSxx [lines]      (default 40 lines)
#
# Local rows read the run's tmux socket here; host rows read the same pane over
# ssh using the socket and session recorded in remote/<WS>.env. This is how you
# see a remote permission prompt (the PROMPT watch event) before answering it.
#
# Exit codes: 0 ok | 64 usage | 65 unknown ws or no such session | 66 host
# unreachable.

# _fleet_peek_no_session WS STATUS: a row that never reached started has no
# session to read; say that plainly instead of a raw tmux or env error.
# Dies (65) for pending|spawning, returns for every other status.
_fleet_peek_no_session() {
  case "$2" in
    pending|spawning) fleet_die 65 "$1 has no session yet (status=$2)" ;;
  esac
  return 0
}

# shellcheck source=cmd-sync.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cmd-sync.sh"

fleet_peek() {
  local ws="$1" lines="$2" host sock session rc=0 status
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
  host=$(roster_get "$ws" host)
  status=$(roster_get "$ws" status)
  if [ -n "$host" ]; then
    if ! _fleet_remote_env_load "$ws"; then
      # pending or spawning: the launch has not written remote/<WS>.env yet.
      _fleet_peek_no_session "$ws" "$status"
      fleet_die 65 "peek: no remote env for $ws (was it spawned with --host?)"
    fi
    sock="$_RE_FLEET_SOCK"
    session="$_RE_FLEET_SESSION"
  else
    sock=$(_fleet_tmux_socket)
    session=$(roster_get "$ws" name)
    [ -n "$session" ] || session=$(printf '%s' "$ws" | tr '[:upper:]' '[:lower:]')
  fi
  _fleet_pane_capture "$host" "$sock" "$session" "$lines" || rc=$?
  case "$rc" in
    0) ;;
    "$_FLEET_SSH_FAIL_RC"|"$_FLEET_TIMEOUT_RC")
      fleet_die 66 "peek: host $host is unreachable" ;;
    *)
      _fleet_peek_no_session "$ws" "$status"
      fleet_die 65 "peek: no pane for $ws (session '$session' not found)" ;;
  esac
  return 0
}

main() {
  local ws="${1:-}" lines="${2:-40}"
  [ -n "$ws" ] || fleet_die 64 "usage: fleet peek WSxx [lines]"
  [ $# -le 2 ] || fleet_die 64 "usage: fleet peek WSxx [lines]"
  [[ "$lines" =~ ^[0-9]+$ ]] && [ "$lines" -gt 0 ] \
    || fleet_die 64 "peek: lines must be a positive number"
  fleet_peek "$ws" "$lines"
}
