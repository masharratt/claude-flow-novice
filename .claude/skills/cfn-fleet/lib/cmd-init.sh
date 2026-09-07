#!/usr/bin/env bash
# fleet init <slug> [--worktree] [--db none|docker]
# Scaffold planning/fleet-<slug> in the cwd (the target project): templates,
# empty roster (header only), fleet.env, .roster.lock. Echoes the run dir path.
# Refuses an existing run dir with exit 65.
main(){
  local slug="" worktree=off db=none
  while [ $# -gt 0 ]; do
    case "$1" in
      --worktree) worktree=on; shift;;
      --worktree=*) worktree="${1#--worktree=}"; shift;;
      --db) [ $# -ge 2 ] || fleet_die 64 "--db needs a value (none|docker)"
           db="$2"; shift 2;;
      --db=*) db="${1#--db=}"; shift;;
      -h|--help) echo "usage: fleet init <slug> [--worktree] [--db none|docker]"; return 0;;
      *) if [ -z "$slug" ]; then slug="$1"; shift
         else fleet_die 64 "unexpected argument: $1"; fi;;
    esac
  done

  [ -n "$slug" ] || fleet_die 64 "usage: fleet init <slug> [--worktree] [--db none|docker]"
  # lowercase slug keeps run-dir basenames shell/docker-name safe
  [[ "$slug" =~ ^[a-z0-9][a-z0-9_-]*$ ]] \
    || fleet_die 64 "invalid slug '$slug' (lowercase alnum, '-', '_'; start alnum)"
  case "$db" in none|docker) ;; *) fleet_die 64 "--db must be none|docker";; esac
  case "$worktree" in on|off) ;; *) fleet_die 64 "--worktree takes on|off";; esac

  local base="$PWD/planning/fleet-$slug"
  [ -e "$base" ] && fleet_die 65 "run dir already exists: $base"

  local tmpl
  tmpl="$(cd "$(dirname "${BASH_SOURCE[0]}")/../templates" && pwd)"

  mkdir -p "$base/briefs" "$base/handoffs"
  cp "$tmpl/COORDINATION.md" "$base/COORDINATION.md"
  cp "$tmpl/RUNBOOK.md" "$base/RUNBOOK.md"
  cp "$tmpl/BRIEF_WS.md" "$base/briefs/BRIEF_WS.md"
  cp "$tmpl/HANDOFF_WS.md" "$base/handoffs/HANDOFF_WS.md"
  printf '%s\n' "$FLEET_ROSTER_HEADER" > "$base/roster.tsv"
  printf 'FLEET_WORKTREE=%s\nFLEET_DB=%s\n' "$worktree" "$db" > "$base/fleet.env"
  : > "$base/.roster.lock"

  printf '%s\n' "$base"
}
