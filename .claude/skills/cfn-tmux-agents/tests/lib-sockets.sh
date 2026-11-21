#!/usr/bin/env bash
# Shared socket hygiene for the cfn-tmux-agents tests (sourced; needs cfn_safe_rm_tmp).
# tmux 3.4 leaves the socket FILE behind after kill-server and after the last
# session exits, so a trap that only runs kill-server leaks one dead file per
# server into /tmp/tmux-$UID. Each test run therefore gets a private
# TMUX_TMPDIR: every server it starts (named --socket, per-lane
# tmux-agents-<lane>, or anything a test forgot to name) lives in that folder,
# and teardown kills each one and deletes the folder. The real socket dir (live
# lanes) is never touched.
#   tt_sock_init      call once, before the first tmux/spawn call
#   tt_sock_cleanup   call from the EXIT trap

tt_sock_init() {
  TT_SOCKROOT=$(mktemp -d) || return 1
  export TMUX_TMPDIR="$TT_SOCKROOT"
}

tt_sock_cleanup() {
  local s
  [ -n "${TT_SOCKROOT:-}" ] && [ -d "$TT_SOCKROOT" ] || return 0
  for s in "$TT_SOCKROOT"/tmux-*/*; do
    [ -S "$s" ] || continue
    tmux -S "$s" kill-server 2>/dev/null || true
  done
  cfn_safe_rm_tmp "$TT_SOCKROOT" || true
}
