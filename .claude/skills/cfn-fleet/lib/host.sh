#!/usr/bin/env bash
# cfn-fleet host transport: run commands and tmux on a worker host.
#
# Sourced by the cmd-*.sh files; defines functions only and prints nothing.
# HOST is an ssh alias from the user's ~/.ssh/config (no server detail is
# stored here). An empty HOST means "this machine": the same call shape runs
# locally, so callers do not branch on local vs remote.

# Non-interactive ssh shells skip ~/.bashrc, so load the usual toolchains.
# Same preamble as cfn-vps/vps.sh; $HOME stays literal and expands on the
# server, so no username or home path is ever hardcoded.
_FLEET_HOST_PREAMBLE='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"; export PATH="$HOME/.local/bin:$PATH";'

# ssh exits 255 for its own failures (refused, timeout, auth); 124 is the
# timeout(1) code. Both mean "could not ask", never "the answer is no".
_FLEET_SSH_FAIL_RC=255
_FLEET_TIMEOUT_RC=124

# _fleet_host_run HOST CMD...
# Runs CMD on HOST (locally when HOST is empty) and returns its exit code.
# Each word is %q-quoted so it reaches the remote shell as exactly one word;
# pass `bash -c '<script>'` when the server must expand ~ or $HOME.
# ssh -n: never forward the caller's stdin. Callers run inside
# `while read ... done < roster.tsv`, and a forwarded stdin swallowed every
# later row (dashboard stopped at the first started host row, 2026-10-16).
_fleet_host_run() {
  local host="${1:-}"
  [ $# -gt 0 ] && shift
  if [ -z "$host" ]; then
    "$@"
    return $?
  fi
  local quoted
  quoted=$(printf '%q ' "$@")
  ssh -n -o BatchMode=yes -o ConnectTimeout=10 \
    -o ControlMaster=auto -o ControlPersist=60 \
    "$host" "bash -lc $(printf '%q' "$_FLEET_HOST_PREAMBLE $quoted")"
}

# _fleet_tmux HOST ARGS...  -> tmux ARGS on HOST.
_fleet_tmux() {
  local host="${1:-}"
  [ $# -gt 0 ] && shift
  _fleet_host_run "$host" tmux "$@"
}

# _fleet_pane_state HOST SOCK SESSION -> prints alive | dead | unreachable.
# dead only when tmux itself answered "no such session" (rc 1) or reported
# the pane dead. Any transport failure, a missing tmux binary or a timeout
# is unreachable: a flaky network must never read as a dead worker.
_fleet_pane_state() {
  local host="${1:-}" sock="${2:-}" session="${3:-}" out rc
  out=$(_fleet_tmux "$host" -L "$sock" list-panes -t "$session" -F '#{pane_dead}' 2>/dev/null)
  rc=$?
  case "$rc" in
    0) ;;
    1) echo dead; return 0 ;;
    *) echo unreachable; return 0 ;;
  esac
  case "$(printf '%s\n' "$out" | head -n 1)" in
    0) echo alive ;;
    1) echo dead ;;
    *) echo unreachable ;;
  esac
}

# _fleet_host_free_gb HOST -> whole GiB free on the home filesystem.
# Prints nothing and returns 1 when the host cannot be asked or the df
# output does not parse, so a caller never mistakes "unknown" for "0 GiB".
_fleet_host_free_gb() {
  local host="${1:-}" out kb
  out=$(_fleet_host_run "$host" bash -c 'df -Pk "$HOME"' 2>/dev/null) || return 1
  kb=$(printf '%s\n' "$out" | awk 'NR>1 && $4 ~ /^[0-9]+$/ {print $4; exit}')
  [ -n "$kb" ] || return 1
  echo $((kb / 1048576))
}
