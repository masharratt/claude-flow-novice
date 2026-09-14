#!/usr/bin/env bash
# cfn-fleet lib/heartbeat-ticker.sh: activity-gated heartbeat sidecar.
#
# Spliced by cmd-spawn.sh as a backgrounded loop inside each worker tmux
# pane, in front of the export/exec segment, so it survives the engine exec
# as a reparented child and dies with the pane. It beats
# `fleet heartbeat <ws>` only when the pane's visible output changed since
# the last tick: spinner and animation lines are filtered out first, so a
# wedged worker whose output is frozen stops beating and watch's STALE still
# fires. Deliberately not a plain wall-clock ticker: wall-clock beating
# makes wedged agents look healthy and kills STALE as a signal.
#
# Self-contained by contract: the pane shell is fresh (no common.sh, no
# fleet_env_get), so every dependency is either an argument of
# _fleet_tick_loop or an env var it exports (FLEET_RUN_DIR,
# FLEET_TICK_FLEET_CLI). Tick state lives in the loop shell's TICK_LAST_HASH
# variable, never in a file. The splice silences all output of both the
# source and the loop; this file must stay silent on its own too.
#
# No `set -euo pipefail` here: the file is sourced into foreign shells (the
# pane shell, the test suite) and must not leak options.
#
# shellcheck shell=bash

# _fleet_tick_filter: capture-pane post-filter, stdin to stdout. Strips ANSI
# escapes, animation glyphs (braille U+2800-28BF, box drawing, block
# elements, and the dingbat spinner-asterisk family U+2722-274B, which holds
# the Claude Code star/propeller frames: ✳ ✶ ✻ ✼ ✽ ✾ ❊ ❋ and the ✢ ✣ ✤ ✥
# club-spoked variants), keyboard-hint tokens like "(esc to interrupt)" and
# elapsed tokens like "· 12s", then right-trims and drops empty lines (the
# same trailing seds as _fleet_pane_wait in cmd-spawn.sh). What survives is
# the content-bearing text of the pane, so two captures of a
# merely-animating pane filter to equal bytes and hash equal.
# cfn: spinner-token heuristic, upgrade trigger = an engine TUI whose animation survives the filter (heartbeat beats while frozen).
# Residual risk, accepted: a future engine whose spinner glyphs fall outside
# these families beats while frozen (wedge detection lost for that engine);
# conversely, real pane content that prints these dingbats is filtered away.
_fleet_tick_filter(){
  LC_ALL=C sed \
    -e 's/\x1b\][^\x1b]*\x1b\\//g' \
    -e 's/\x1b\][^\x07]*\x07//g' \
    -e 's/\x1b\[[0-9;?]*[A-Za-z]//g' \
    -e 's/\r$//' \
    -e 's/\xe2[\xa0-\xa2][\x80-\xbf]//g' \
    -e 's/\xe2[\x94-\x95][\x80-\xbf]//g' \
    -e 's/\xe2\x96[\x80-\x9f]//g' \
    -e 's/\xe2\x9c[\xa2-\xbf]//g' \
    -e 's/\xe2\x9d[\x80-\x8b]//g' \
    -e 's/(esc[^)]*)//g' \
    -e 's/(ctrl[^)]*)//g' \
    -e 's/·[[:space:]]*[0-9][0-9]*[sm]//g' \
    -e 's/[[:space:]]*$//' \
    -e '/^$/d'
}

# _fleet_tick_once SOCKET SESSION WS: one activity-gated heartbeat tick.
# Captures the pane via the run's socket, filters it, hashes it, and beats
# the heartbeat only when the hash is non-empty and changed from
# $TICK_LAST_HASH, which this function owns as caller-shell state (the loop
# seeds it empty; no files). Reads FLEET_TICK_FLEET_CLI and FLEET_RUN_DIR
# from the environment; the caller (spawn splice or _fleet_tick_loop) bakes
# both. Tooling tolerance (mirrors _fleet_tmux_pane_alive in common.sh):
# tmux absent, server down, or a vanished session is a plain skip, never an
# error; this loop dies with its own pane anyway. Always returns 0.
_fleet_tick_once(){
  local sock="$1" sname="$2" ws="$3" rc=0 cap filtered hash
  command -v tmux >/dev/null 2>&1 || return 0
  [ -n "${FLEET_TICK_FLEET_CLI:-}" ] || return 0
  cap=$(tmux -L "$sock" capture-pane -p -t "$sname" 2>/dev/null) || rc=$?
  [ "$rc" -eq 0 ] || return 0
  filtered=$(printf '%s\n' "$cap" | _fleet_tick_filter)
  [ -n "$filtered" ] || return 0
  hash=$(printf '%s\n' "$filtered" | LC_ALL=C sha1sum)
  hash="${hash%% *}"
  [ "$hash" = "${TICK_LAST_HASH:-}" ] && return 0
  # Beat. The stamp is written even if the CLI call fails (missing roster
  # row mid-respawn, transient lock): retrying every tick would hammer a
  # broken roster; the next visible-content change retries naturally.
  FLEET_RUN_DIR="${FLEET_RUN_DIR:-}" "$FLEET_TICK_FLEET_CLI" heartbeat "$ws" >/dev/null 2>&1 || :
  TICK_LAST_HASH="$hash"
  return 0
}

# _fleet_tick_loop SOCKET SESSION WS FLEET_CLI RUN_DIR TICK_SECS: the
# sidecar's whole life: bake the once-function's env, seed the hash, then
# sleep-and-tick forever, fully silent. Returns 0 immediately when any
# argument is missing (a mis-spliced loop must never chatter or spin).
_fleet_tick_loop(){
  local sock="$1" sname="$2" ws="$3" cli="$4" rd="$5" tick="$6"
  if [ -z "$sock" ] || [ -z "$sname" ] || [ -z "$ws" ] \
      || [ -z "$cli" ] || [ -z "$rd" ] || [ -z "$tick" ]; then
    return 0
  fi
  export FLEET_TICK_FLEET_CLI="$cli"
  export FLEET_RUN_DIR="$rd"
  TICK_LAST_HASH=""
  while :; do
    sleep "$tick"
    _fleet_tick_once "$sock" "$sname" "$ws" >/dev/null 2>&1 || :
  done
}
