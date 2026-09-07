#!/bin/bash
# cfn-fleet lib/cmd-watch.sh — roster event scanner for the Monitor tool.
#
# Real-run origin: replaces the hand-rolled 16h monitor loop (run e59a7826).
# stdout lines only; --once for tests; no flock held between polls. Last-seen
# field values persist in <run-dir>/.watch.state, so consecutive --once scans
# (and loop polls) diff against the previous scan.
#
#   fleet watch [--stale-min 15] [--poll 60] [--once]
#
# Events (one line each):
#   CHANGE <ws> <field>   field value differs from the previous scan (first
#                         scan is the baseline and emits no CHANGE)
#   STALE <ws> <minutes>  heartbeat older than stale-min AND status
#                         started|working
#   DEAD <ws>             status = dead
#   ALL-DONE              every row landed|done -> exits 0 (ends the loop)

FLEET_WATCH_STATE=""

main() {
  local stale_min=15 poll=60 once=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --stale-min)
        [ $# -ge 2 ] || fleet_die 64 "watch: --stale-min needs a number"
        stale_min="$2"; shift 2 ;;
      --poll)
        [ $# -ge 2 ] || fleet_die 64 "watch: --poll needs seconds"
        poll="$2"; shift 2 ;;
      --once) once=1; shift ;;
      -*)     fleet_die 64 "watch: unknown option $1" ;;
      *)      fleet_die 64 "watch: unexpected argument $1" ;;
    esac
  done
  [[ "$stale_min" =~ ^[0-9]+$ && "$poll" =~ ^[0-9]+$ ]] \
    || fleet_die 64 "watch: --stale-min/--poll expect non-negative numbers"

  local run_dir
  run_dir=$(fleet_run_dir)
  FLEET_WATCH_STATE="$run_dir/.watch.state"
  local roster
  roster=$(fleet_roster_file)
  [ -f "$roster" ] || fleet_die 65 "watch: roster missing at $roster"

  _fleet_watch_scan "$roster" "$stale_min"

  [ "$once" -eq 1 ] && return 0
  trap 'exit 0' INT TERM
  while true; do
    sleep "$poll"
    _fleet_watch_scan "$roster" "$stale_min"
  done
}

# _fleet_tsv_split LINE — split a TSV line into _FIELDS preserving empty
# cells (tab -> octal unit separator, which is NOT whitespace-collapsed by
# bash's IFS handling the way literal tabs are).
_fleet_tsv_split() {
  _FIELDS=()
  local IFS=$'\037'
  read -r -a _FIELDS <<< "$(printf '%s' "$1" | tr '\t' '\037')"
}

# _fleet_watch_scan ROSTER STALE_MIN — one scan. Order: STALE/DEAD per roster
# row, then CHANGE lines, then ALL-DONE (exit 0). Always returns 0 otherwise.
_fleet_watch_scan() {
  local roster="$1" stale_min="$2"
  local state="$FLEET_WATCH_STATE"
  local now
  now=$(date +%s)

  local -A prev=()
  local key val had_state=0
  if [ -f "$state" ]; then
    had_state=1
    while IFS=$'\t' read -r key val; do
      [ -n "$key" ] || continue
      prev["$key"]="$val"
    done < "$state"
  fi

  local -a fields=()
  _fleet_tsv_split "$(head -n1 "$roster")"
  fields=("${_FIELDS[@]}")

  local -A cur=()
  local -a row_events=() change_events=()
  local row lines=0 alldone=1 i status hb age_min
  while IFS= read -r row || [ -n "$row" ]; do
    [ -n "$row" ] || continue
    lines=$((lines + 1))
    _fleet_tsv_split "$row"
    local -a cells=("${_FIELDS[@]}")
    local ws="${cells[0]}"
    status=""
    hb="0"
    for i in "${!fields[@]}"; do
      val="${cells[$i]:-}"
      key="$ws|${fields[$i]}"
      cur["$key"]="$val"
      case "${fields[$i]}" in
        status)    status="$val" ;;
        heartbeat) hb="$val" ;;
      esac
      if [ "$had_state" -eq 1 ]; then
        if [ -n "${prev[$key]+set}" ]; then
          [ "${prev[$key]}" = "$val" ] || change_events+=("CHANGE $ws ${fields[$i]}")
        else
          change_events+=("CHANGE $ws ${fields[$i]}")   # new row since last scan
        fi
      fi
    done

    case "$status" in
      dead)
        row_events+=("DEAD $ws") ;;
      started|working)
        age_min=0
        # shellcheck disable=SC2053
        [[ "$hb" =~ ^[0-9]+$ ]] && age_min=$(((now - hb) / 60))
        if [ "$age_min" -gt "$stale_min" ]; then
          row_events+=("STALE $ws $age_min")
        fi ;;
    esac
    if [ "$status" != "landed" ] && [ "$status" != "done" ]; then
      alldone=0
    fi
  done < <(awk 'NR > 1' "$roster")

  local e
  for e in "${row_events[@]}"; do
    echo "$e"
  done
  for e in "${change_events[@]}"; do
    echo "$e"
  done

  # Persist the snapshot for the next scan's diff (atomic tmp+mv).
  {
    for key in "${!cur[@]}"; do
      printf '%s\t%s\n' "$key" "${cur[$key]}"
    done | LC_ALL=C sort
  } > "$state.new" && mv "$state.new" "$state"

  if [ "$lines" -gt 0 ] && [ "$alldone" -eq 1 ]; then
    echo "ALL-DONE"
    exit 0
  fi
  return 0
}
