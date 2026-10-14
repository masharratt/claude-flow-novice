#!/usr/bin/env bash
# cfn-fleet lib/cmd-stop.sh: close a worker's tmux session (kills the agent).
#
#   fleet stop WSxx
#
# Touches only the tmux session. Worktree, branch, claims, files and the roster
# row are left as they are, so a stopped worker shows up in `fleet watch` as
# `DEAD <ws> (pane exited)` until the master lands or resets the row.
# A session that is already gone is success. Host rows act over ssh like peek.
#
# Exit codes: 0 ok | 64 usage | 65 unknown ws or no session yet | 66 host
# unreachable.

# shellcheck source=cmd-peek.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cmd-peek.sh"

main() {
  local ws="${1:-}" rc=0
  [ -n "$ws" ] && [ $# -eq 1 ] || fleet_die 64 "usage: fleet stop WSxx"
  _fleet_pane_target "$ws" stop
  # "=name" matches the session exactly, never a longer name sharing the prefix.
  _fleet_tmux "$_PT_HOST" -L "$_PT_SOCK" kill-session -t "=$_PT_SESSION" \
    >/dev/null 2>&1 || rc=$?
  case "$rc" in
    0) echo "stop: closed session '$_PT_SESSION' for $ws" ;;
    "$_FLEET_SSH_FAIL_RC"|"$_FLEET_TIMEOUT_RC")
      fleet_die 66 "stop: host $_PT_HOST is unreachable" ;;
    *) echo "stop: session '$_PT_SESSION' for $ws is already gone" ;;
  esac
  return 0
}
