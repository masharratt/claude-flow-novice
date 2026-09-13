#!/usr/bin/env bash
# fleet heartbeat WSxx [--files p1,p2,...] [note...]
# Set heartbeat=$(date +%s). With note words, replace the notes field (the
# latest note wins; the spec's "append, keep last note only"). A bare
# heartbeat leaves notes untouched. With --files, write the comma-separated
# paths (one per line) to <run dir>/files/<ws>.txt for the dashboard's
# "now editing" card section: absent flag = existing file untouched, empty
# value = truncate to empty.
main(){
  local ws="${1:-}"
  [ -n "$ws" ] || fleet_die 64 "usage: fleet heartbeat WSxx [--files p1,p2,...] [note...]"
  shift

  # Split flags from note words (manual parse, matching the other cmd files).
  local files_flag=0 files_val="" note_args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --files)   [ $# -ge 2 ] || fleet_die 64 "heartbeat: --files needs a comma-separated path list (empty value truncates)"
                 files_flag=1; files_val="$2"; shift 2 ;;
      --files=*) files_flag=1; files_val="${1#--files=}"; shift ;;
      *)         note_args+=("$1"); shift ;;
    esac
  done
  local note=""
  [ "${#note_args[@]}" -gt 0 ] && note="${note_args[*]}"

  # ws ids are user-typed and become a filename below: no slashes, no "..".
  # Checked before the roster lookup so a hostile id is refused with 64
  # (data error) even when it names no roster row.
  if [ "$files_flag" -eq 1 ]; then
    if [[ ! "$ws" =~ ^[A-Za-z0-9._-]+$ || "$ws" == *..* ]]; then
      fleet_die 64 "heartbeat: invalid workstream id '$ws' (files/<ws>.txt must stay inside the run dir)"
    fi
  fi

  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"

  local now
  now=$(date +%s)
  roster_set "$ws" heartbeat "$now"
  [ -z "$note" ] || roster_set "$ws" notes "$note"

  if [ "$files_flag" -eq 1 ]; then
    local fdir tmp
    fdir="$(fleet_run_dir)/files"
    mkdir -p "$fdir"
    tmp="$fdir/.${ws}.txt.tmp"
    # Trim each entry, drop empties, cap at 20 paths; awk reads to EOF so the
    # cap cannot SIGPIPE the producer under pipefail.
    printf '%s\n' "$files_val" | tr ',' '\n' \
      | awk '{ sub(/^[[:space:]]+/, ""); sub(/[[:space:]]+$/, ""); if ($0 == "") next; if (n < 20) { n++; print } }' \
      > "$tmp"
    mv "$tmp" "$fdir/$ws.txt"
  fi
  return 0
}
