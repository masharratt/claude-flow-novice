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
  # Bytes are built with printf, not written as \xNN inside the sed script:
  # \xNN is a GNU sed extension, and BSD sed (macOS) silently matched nothing,
  # so spinner frames survived and a frozen worker kept beating (2026-10-10).
  local e b u
  e=$(printf '\033'); b=$(printf '\007'); u=$(printf '\342')
  LC_ALL=C sed \
    -e "s/${e}][^${e}]*${e}\\\\//g" \
    -e "s/${e}][^${b}]*${b}//g" \
    -e "s/${e}\\[[0-9;?]*[A-Za-z]//g" \
    -e "s/$(printf '\r')\$//" \
    -e "s/${u}[$(printf '\240-\242')][$(printf '\200-\277')]//g" \
    -e "s/${u}[$(printf '\224-\225')][$(printf '\200-\277')]//g" \
    -e "s/${u}$(printf '\226')[$(printf '\200-\237')]//g" \
    -e "s/${u}$(printf '\234')[$(printf '\242-\277')]//g" \
    -e "s/${u}$(printf '\235')[$(printf '\200-\213')]//g" \
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
  # sha1sum is coreutils; stock macOS before 14 only has shasum.
  if command -v sha1sum >/dev/null 2>&1; then
    hash=$(printf '%s\n' "$filtered" | LC_ALL=C sha1sum)
  else
    hash=$(printf '%s\n' "$filtered" | LC_ALL=C shasum -a 1)
  fi
  hash="${hash%% *}"
  [ "$hash" = "${TICK_LAST_HASH:-}" ] && return 0
  # Beat. The stamp is written even if the CLI call fails (missing roster
  # row mid-respawn, transient lock): retrying every tick would hammer a
  # broken roster; the next visible-content change retries naturally.
  FLEET_RUN_DIR="${FLEET_RUN_DIR:-}" "$FLEET_TICK_FLEET_CLI" heartbeat "$ws" >/dev/null 2>&1 || :
  TICK_LAST_HASH="$hash"
  return 0
}

# --- Autosave ------------------------------------------------------------------
# Every FLEET_AUTOSAVE_SECS (default 1200; `off` or 0 disables) the loop
# snapshots the worker's worktree when it has uncommitted changes:
#   ${TMPDIR:-/tmp}/fleet-autosave/<run-name>/<WS>/<UTC timestamp>/
#     head.txt          commit the patch is against, then the branch ref
#     tracked.patch     `git diff HEAD --binary` (staged + unstaged edits)
#     untracked.tar.gz  untracked, not-ignored files (files over
#                       FLEET_AUTOSAVE_MAX_FILE_MB, default 50, are skipped
#                       and listed in skipped.txt)
#     untracked.txt     NUL-free list of the files in the tarball
# Newest FLEET_AUTOSAVE_KEEP (default 6) kept. A snapshot identical to the
# newest one is not written again. Only LINKED worktrees are saved (fleet
# --worktree mode); the shared main checkout is never snapshotted per worker.
#
# Read-only on git: GIT_OPTIONAL_LOCKS=0, no add/stash/commit, no index
# write, no lock files; a worker mid-commit/rebase holding index.lock is not
# blocked or disturbed. Writes land in <ts>.partial and are renamed into
# place, so a half-written snapshot never counts toward the newest 6.
#
# Restore (into the worker's worktree, or a fresh one at the same commit):
#   git worktree add --detach /tmp/restore "$(head -1 <snap>/head.txt)"   # or cd <worktree>
#   git apply <snap>/tracked.patch        # add --3way if HEAD moved since
#   tar -xzf <snap>/untracked.tar.gz
# Staged vs unstaged is not preserved: every edit comes back unstaged.

# _fleet_autosave_interval: resolved interval in seconds from
# FLEET_AUTOSAVE_SECS; empty output means autosave is off.
_fleet_autosave_interval(){
  local v="${FLEET_AUTOSAVE_SECS:-1200}"
  case "$v" in
    off|0|*[!0-9]*) return 0 ;;
  esac
  printf '%s\n' "$v"
}

# _fleet_autosave_sha1 FILE...: one hash over the files' bytes.
_fleet_autosave_sha1(){
  if command -v sha1sum >/dev/null 2>&1; then cat "$@" | sha1sum; else cat "$@" | shasum -a 1; fi
}

# _fleet_autosave_once WORKTREE RUN_NAME WS: one snapshot if dirty. Always 0.
_fleet_autosave_once(){
  local wt="$1" run="$2" ws="$3" gd cd root ts dst tmp f size max keep last
  [ -n "$wt" ] && [ -n "$run" ] && [ -n "$ws" ] || return 0
  local GIT_OPTIONAL_LOCKS=0; export GIT_OPTIONAL_LOCKS   # never take index.lock
  gd=$(git -C "$wt" rev-parse --absolute-git-dir 2>/dev/null) || return 0
  cd=$(git -C "$wt" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 0
  [ "$gd" != "$cd" ] || return 0               # main checkout: not a worker worktree
  wt=$(git -C "$wt" rev-parse --show-toplevel 2>/dev/null) || return 0
  root="${TMPDIR:-/tmp}"; root="${root%/}/fleet-autosave/$run/$ws"
  mkdir -p "$root" 2>/dev/null || return 0
  ts=$(date -u '+%Y%m%dT%H%M%SZ')
  tmp="$root/$ts.partial"
  rm -rf "$tmp"; mkdir -p "$tmp" || return 0
  {
    git -C "$wt" rev-parse HEAD && git -C "$wt" symbolic-ref -q HEAD
  } > "$tmp/head.txt" 2>/dev/null
  if ! git -C "$wt" diff HEAD --binary --no-ext-diff --no-color > "$tmp/tracked.patch" 2>/dev/null; then
    rm -rf "$tmp"; return 0
  fi
  max=$(( ${FLEET_AUTOSAVE_MAX_FILE_MB:-50} * 1024 * 1024 ))
  : > "$tmp/untracked.lst"; : > "$tmp/untracked.txt"
  while IFS= read -r -d '' f; do
    [ -f "$wt/$f" ] || [ -L "$wt/$f" ] || continue
    size=$(wc -c < "$wt/$f" 2>/dev/null | tr -d ' ')
    if [ "${size:-0}" -gt "$max" ]; then
      printf '%s\t%s bytes\n' "$f" "$size" >> "$tmp/skipped.txt"
      continue
    fi
    printf '%s\0' "$f" >> "$tmp/untracked.lst"
    printf '%s\n' "$f" >> "$tmp/untracked.txt"
  done < <(git -C "$wt" ls-files -z --others --exclude-standard 2>/dev/null)
  if [ ! -s "$tmp/tracked.patch" ] && [ ! -s "$tmp/untracked.txt" ]; then
    rm -rf "$tmp"; rmdir "$root" 2>/dev/null   # clean: nothing to save
    return 0
  fi
  if [ -s "$tmp/untracked.lst" ]; then
    (cd "$wt" && tar --null -T "$tmp/untracked.lst" -cf - 2>/dev/null) | gzip -n > "$tmp/untracked.tar.gz"
  fi
  rm -f "$tmp/untracked.lst"
  # Skip a snapshot identical to the newest one (an idle dirty worker would
  # otherwise rotate its distinct older snapshots out with copies).
  last=$(ls -1 "$root" 2>/dev/null | grep -v '\.partial$' | tail -n 1)
  if [ -n "$last" ]; then
    local a b
    a=$(cd "$tmp" && _fleet_autosave_sha1 head.txt tracked.patch untracked.txt $( [ -f untracked.tar.gz ] && echo untracked.tar.gz ))
    b=$(cd "$root/$last" && _fleet_autosave_sha1 head.txt tracked.patch untracked.txt $( [ -f untracked.tar.gz ] && echo untracked.tar.gz ) 2>/dev/null)
    if [ "$a" = "$b" ]; then rm -rf "$tmp"; return 0; fi
  fi
  dst="$root/$ts"; local n=1
  while [ -e "$dst" ]; do n=$((n + 1)); dst=$(printf '%s/%s-%02d' "$root" "$ts" "$n"); done
  mv "$tmp" "$dst" || { rm -rf "$tmp"; return 0; }
  keep="${FLEET_AUTOSAVE_KEEP:-6}"
  ls -1 "$root" 2>/dev/null | grep -v '\.partial$' | sort -r | tail -n +"$((keep + 1))" \
    | while IFS= read -r f; do rm -rf "${root:?}/$f"; done
  printf '%s\n' "$dst"
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
  # Autosave rides the same loop: the pane cwd is the worker's worktree.
  local save_every save_wt="$PWD" save_run last_save now
  save_every=$(_fleet_autosave_interval)
  save_run=$(basename "$rd")
  last_save=$(date +%s)
  while :; do
    sleep "$tick"
    _fleet_tick_once "$sock" "$sname" "$ws" >/dev/null 2>&1 || :
    if [ -n "$save_every" ]; then
      now=$(date +%s)
      if [ $((now - last_save)) -ge "$save_every" ]; then
        _fleet_autosave_once "$save_wt" "$save_run" "$ws" >/dev/null 2>&1 || :
        last_save="$now"
      fi
    fi
  done
}
