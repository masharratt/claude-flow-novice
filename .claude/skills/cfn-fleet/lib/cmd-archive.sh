#!/usr/bin/env bash
# cfn-fleet lib/cmd-archive.sh: mark a finished run dir archived, or undo it.
#
#   fleet archive [slug|path] [--undo]
#
# Creates (or with --undo removes) <run-dir>/.archived and touches nothing
# else: no roster, brief, handoff or run dir is ever moved or deleted. An
# archived run is skipped by run-dir discovery (fleet_run_dir) and its rows
# never classify a session on the dashboard Sessions panel. An explicit
# --run-dir / FLEET_RUN_DIR still reaches it.
#
# Target: a path to a run dir, a slug (fleet-<slug> or <slug>) found under
# the nearest planning/ walking up from cwd, else the resolved run dir.
# --undo needs the run named (slug, path, --run-dir or FLEET_RUN_DIR):
# discovery never picks an archived run.
#
# Exit codes: 0 ok | 64 usage | 65 unknown run.

# _fleet_archive_find SLUG: echo the nearest <dir>/planning/fleet-<slug>
# walking up from cwd; 1 when none exists.
_fleet_archive_find() {
  local slug="${1#fleet-}" dir="$PWD"
  while :; do
    if [ -d "$dir/planning/fleet-$slug" ]; then
      printf '%s\n' "$dir/planning/fleet-$slug"
      return 0
    fi
    [ "$dir" = "/" ] && return 1
    dir=$(dirname "$dir")
  done
}

main() {
  local undo=0 target="" rd
  while [ $# -gt 0 ]; do
    case "$1" in
      --undo) undo=1; shift ;;
      -*)     fleet_die 64 "archive: unknown option $1 (usage: fleet archive [slug|path] [--undo])" ;;
      *)      [ -z "$target" ] || fleet_die 64 "archive: one run at a time"
              target="$1"; shift ;;
    esac
  done
  if [ -n "$target" ]; then
    if [[ "$target" == */* ]]; then
      [ -d "$target" ] || fleet_die 65 "archive: no run dir at $target"
      rd=$(cd "$target" && pwd)
    else
      [[ "$target" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
        || fleet_die 64 "archive: run slug has unexpected characters"
      rd=$(_fleet_archive_find "$target") \
        || fleet_die 65 "archive: no run fleet-${target#fleet-} under any planning/ above $PWD"
    fi
  elif [ "$undo" -eq 1 ] && [ -z "${FLEET_RUN_DIR:-}" ]; then
    fleet_die 64 "archive --undo: name the run (fleet archive <slug> --undo); discovery skips archived runs"
  else
    rd=$(fleet_run_dir)
  fi
  [ -f "$rd/roster.tsv" ] || fleet_die 65 "archive: $rd has no roster.tsv, not a fleet run dir"

  if [ "$undo" -eq 1 ]; then
    if [ -e "$rd/.archived" ]; then
      rm -f "$rd/.archived"
      echo "archive: $(basename "$rd") is active again"
    else
      echo "archive: $(basename "$rd") was not archived"
    fi
    return 0
  fi
  if [ -e "$rd/.archived" ]; then
    echo "archive: $(basename "$rd") is already archived"
    return 0
  fi
  printf 'archived %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$rd/.archived"
  echo "archive: $(basename "$rd") archived (undo: fleet archive $(basename "$rd") --undo)"
}
