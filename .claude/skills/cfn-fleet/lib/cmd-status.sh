#!/usr/bin/env bash
# fleet status [--tsv]
# Human table: ws_id, status, task (truncated to 40 chars), #claims, heartbeat
# age in seconds ('-' when the workstream never heartbeated), engine (compact,
# right side; '-' when the row predates the engine column and no default is
# configured). --tsv emits the raw roster (header + rows) for parsing.
main(){
  local tsv=0
  case "${1:-}" in
    "") ;;
    --tsv|--tsv=on) tsv=1;;
    -h|--help) echo "usage: fleet status [--tsv]"; return 0;;
    *) fleet_die 64 "unknown status option: $1 (usage: fleet status [--tsv])";;
  esac

  local f
  f=$(fleet_roster_file)
  [ -f "$f" ] || fleet_die 64 "no roster at $f (fleet init first)"

  if [ "$tsv" -eq 1 ]; then
    cat "$f"
    return 0
  fi

  local now engdef
  now=$(date +%s)
  # display fallback mirrors fleet_ws_engine: empty/absent engine cell ->
  # FLEET_DEFAULT_ENGINE -> claude-sub (fleet.env key read once, may be empty)
  engdef=$(fleet_engine_default)
  printf '%-6s  %-8s  %-40s  %6s  %6s  %-10.10s\n' "ws_id" "status" "task" "#claims" "age" "engine"

  # awk, not `IFS=$'\t' read`: read collapses consecutive tabs, which would
  # shift every empty cell into its left neighbor (e.g. claims <- "0").
  # Column indexes 1-10 are stable (engine was APPENDED as col 11); a
  # pre-engine roster has NF=10, so the engine cell is guarded by NF.
  awk -F'\t' -v now="$now" -v engdef="$engdef" '
    NR == 1 { next }
    {
      nclaims = split($5, a, " ")
      if ($9 ~ /^[0-9]+$/ && $9 + 0 > 0) {
        age = now - $9
        if (age < 0) age = 0
      } else {
        age = "-"
      }
      eng = (NF >= 11 && $11 != "") ? $11 : (engdef != "" ? engdef : "-")
      printf "%-6s  %-8s  %-40s  %6s  %6s  %-10.10s\n", $1, $4, substr($3, 1, 40), nclaims, age, eng
    }' "$f"
}
