#!/usr/bin/env bash
# cfn-fleet lib/cmd-handoff.sh — write handoffs/HANDOFF_WSxx.md for a spare
# session to read as its brief after the previous session compacted or died
# (compaction-restart procedure, run e59a7826).
#
#   fleet handoff WSxx
#
# Fills templates/HANDOFF_WS.md: literal WSxx becomes the ws id, <field>
# placeholders become the roster row values, and the current git dirty list
# (porcelain) is written into the <dirty files list> placeholder.

main() {
  [ $# -eq 1 ] || fleet_die 64 "usage: fleet handoff WSxx"
  local ws="$1"
  roster_exists "$ws" || fleet_die 65 "handoff: $ws not in roster"
  local run_dir
  run_dir=$(fleet_run_dir)

  local name task status claims landed_sha migration_num scratch_db heartbeat notes
  name=$(roster_get "$ws" name)
  task=$(roster_get "$ws" task)
  status=$(roster_get "$ws" status)
  claims=$(roster_get "$ws" claims)
  landed_sha=$(roster_get "$ws" landed_sha)
  migration_num=$(roster_get "$ws" migration_num)
  scratch_db=$(roster_get "$ws" scratch_db)
  heartbeat=$(roster_get "$ws" heartbeat)
  notes=$(roster_get "$ws" notes)

  local dirty="(not a git repo; run from the target project)"
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    dirty=$(git status --porcelain)
    [ -n "$dirty" ] || dirty="(clean)"
  fi

  local skill_root template
  skill_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  template="$skill_root/templates/HANDOFF_WS.md"

  local out
  if [ -f "$template" ]; then
    out=$(<"$template")
  else
    # Fallback skeleton (same shape as templates/HANDOFF_WS.md) so handoff
    # keeps working if the template file goes missing.
    out='# Handoff: WSxx

## Roster row

- **Task:** <task>
- **Claims:** <claims>
- **Status:** <status>
- **landed_sha:** <landed_sha>
- **migration_num:** <migration_num>
- **scratch_db:** <scratch_db>
- **Last note:** <notes>
- **Dirty files (uncommitted, unclaimed):** <dirty files list>'
  fi

  out="${out//WSxx/$ws}"
  # name/heartbeat have no placeholder in the current template; including them
  # is a no-op today and keeps the file filled if the template grows them.
  local keys=(name task status claims landed_sha migration_num scratch_db heartbeat notes "dirty files list")
  local vals=("$name" "$task" "$status" "$claims" "$landed_sha" "$migration_num" "$scratch_db" "$heartbeat" "$notes" "$dirty")
  local i
  for i in "${!keys[@]}"; do
    out="${out//<${keys[$i]}>/${vals[$i]}}"
  done

  local target="$run_dir/handoffs/HANDOFF_$ws.md"
  printf '%s\n' "$out" > "$target"
  echo "$target"
}
