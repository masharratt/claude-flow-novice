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

# _fleet_pane_target WS VERB: resolve WS to the tmux target shared by peek,
# nudge and stop. Sets _PT_HOST (empty = local), _PT_SOCK, _PT_SESSION and
# _PT_STATUS. Dies 65 for an unknown ws or a row with no session yet.
_fleet_pane_target() {
  local ws="$1" verb="$2"
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
  _PT_HOST=$(roster_get "$ws" host)
  _PT_STATUS=$(roster_get "$ws" status)
  if [ -n "$_PT_HOST" ]; then
    if ! _fleet_remote_env_load "$ws"; then
      # pending or spawning: the launch has not written remote/<WS>.env yet.
      _fleet_peek_no_session "$ws" "$_PT_STATUS"
      fleet_die 65 "$verb: no remote env for $ws (was it spawned with --host?)"
    fi
    _PT_SOCK="$_RE_FLEET_SOCK"
    _PT_SESSION="$_RE_FLEET_SESSION"
  else
    # A local `spawning` row already has its session (spawn creates it, then
    # clears the trust and startup prompts), so only `pending` is refused here.
    [ "$_PT_STATUS" != pending ] || _fleet_peek_no_session "$ws" "$_PT_STATUS"
    _PT_SOCK=$(_fleet_tmux_socket)
    _PT_SESSION=$(roster_get "$ws" name)
    [ -n "$_PT_SESSION" ] || _PT_SESSION=$(printf '%s' "$ws" | tr '[:upper:]' '[:lower:]')
  fi
  return 0
}

fleet_peek() {
  local ws="$1" lines="$2" rc=0
  _fleet_pane_target "$ws" peek
  _fleet_pane_capture "$_PT_HOST" "$_PT_SOCK" "$_PT_SESSION" "$lines" || rc=$?
  case "$rc" in
    0) ;;
    "$_FLEET_SSH_FAIL_RC"|"$_FLEET_TIMEOUT_RC")
      fleet_die 66 "peek: host $_PT_HOST is unreachable" ;;
    *)
      _fleet_peek_no_session "$ws" "$_PT_STATUS"
      fleet_die 65 "peek: no pane for $ws (session '$_PT_SESSION' not found)" ;;
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
