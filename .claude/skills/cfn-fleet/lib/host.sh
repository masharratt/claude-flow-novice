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
# _FLEET_HOST_DEADLINE (seconds, unset = none): when set, the whole call is
# cut off after that long (rc $_FLEET_TIMEOUT_RC). ConnectTimeout only bounds
# the handshake; an established connection that stalls would otherwise hang
# its caller forever. Use _fleet_host_run_bounded rather than setting it.
_fleet_host_run() {
  local host="${1:-}"
  [ $# -gt 0 ] && shift
  if [ -z "$host" ]; then
    _fleet_with_deadline "${_FLEET_HOST_DEADLINE:-}" "$@"
    return $?
  fi
  local quoted
  quoted=$(printf '%q ' "$@")
  _fleet_with_deadline "${_FLEET_HOST_DEADLINE:-}" ssh -n -o BatchMode=yes -o ConnectTimeout=10 \
    -o ControlMaster=auto -o ControlPersist=60 \
    "$host" "bash -lc $(printf '%q' "$_FLEET_HOST_PREAMBLE $quoted")"
}

# _fleet_host_run_bounded SECS HOST CMD...: _fleet_host_run cut off after SECS.
_fleet_host_run_bounded() {
  local secs="$1"
  shift
  _FLEET_HOST_DEADLINE="$secs" _fleet_host_run "$@"
}

# _fleet_with_deadline SECS CMD...: run CMD (an external command), killing it
# after SECS (rc $_FLEET_TIMEOUT_RC). Empty SECS runs it unbounded. timeout(1)
# where it exists (GNU), else a shell watchdog (stock macOS has no timeout).
_fleet_with_deadline() {
  local secs="$1" pid w rc=0
  shift
  if [ -z "$secs" ]; then
    "$@"
    return $?
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
    return $?
  fi
  "$@" &
  pid=$!
  ( sleep "$secs"; kill -TERM "$pid" 2>/dev/null ) &
  w=$!
  wait "$pid" || rc=$?
  if kill -0 "$w" 2>/dev/null; then
    kill "$w" 2>/dev/null
    wait "$w" 2>/dev/null
  else
    rc="$_FLEET_TIMEOUT_RC"
  fi
  return "$rc"
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
