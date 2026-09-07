#!/usr/bin/env bash
# fleet heartbeat WSxx [note...]
# Set heartbeat=$(date +%s). With note words, replace the notes field (the
# latest note wins; the spec's "append, keep last note only"). A bare
# heartbeat leaves notes untouched.
main(){
  local ws="${1:-}"
  [ -n "$ws" ] || fleet_die 64 "usage: fleet heartbeat WSxx [note...]"
  shift
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"

  local note="" now
  [ $# -gt 0 ] && note="$*"
  now=$(date +%s)
  roster_set "$ws" heartbeat "$now"
  [ -z "$note" ] || roster_set "$ws" notes "$note"
  return 0
}
