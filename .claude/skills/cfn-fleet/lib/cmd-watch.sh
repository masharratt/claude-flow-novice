#!/usr/bin/env bash
# cfn-fleet lib/cmd-watch.sh — roster event scanner for the Monitor tool.
#
# Real-run origin: replaces the hand-rolled 16h monitor loop (run e59a7826).
# stdout lines only; --once for tests; no flock held between polls. Last-seen
# field values persist in <run-dir>/.watch.state, so consecutive --once scans
# (and loop polls) diff against the previous scan.
#
#   fleet watch [--stale-min 5] [--poll 60] [--once] [--emit-events]
#
# Events (one line each):
#   CHANGE <ws> <field>   field value differs from the previous scan (first
#                         scan is the baseline and emits no CHANGE)
#   STALE <ws> <minutes>  heartbeat older than stale-min AND status
#                         started|working
#   DEAD <ws>             status = dead
#   DEAD <ws> (pane exited)
#                         roster name's tmux session is gone while status is
#                         started|working: spawn execs the engine, so the pane
#                         dies with it, and a missing session means the worker
#                         is gone even on a fresh heartbeat. Probed on the
#                         run's dedicated socket (FLEET_TMUX_SOCKET, default
#                         fleet-<slug>); tmux absent or server down is
#                         tooling, never a false DEAD.
#   ALL-DONE              every row landed|done -> exits 0 (ends the loop)
#
# Host rows (workers on a remote machine, roster `host` column set): each tick
# first runs `fleet sync` (pulls their reports, prints HANDOFF / CLAIM-REQ), then
# probes the pane over ssh instead of the local socket. Extra events, each
# emitted when it newly appears, not on every poll:
#   UNREACHABLE <ws> <host>  ssh could not ask. Never DEAD: a flaky link is not
#                            a dead worker, and STALE is not judged blind.
#   PROMPT <ws>              pane shows a permission prompt (`fleet peek` it)
#   NOREPORT <ws>            started, no report applied after
#                            FLEET_FIRST_REPORT_SECS (default 300)
#   LOWDISK <host>           free disk under FLEET_REMOTE_MIN_FREE_GB (15)
#   DEAD <ws> (pane exited)  only when tmux on the host answered "dead"
#
# --emit-events (opt-in) bridges to cfn-workbench: roster status transitions
# map onto its closed event set (loop_started / lane_spawned / lane_landed /
# loop_finished) and <run-dir>/run-plan-<slug>.json is regenerated each scan
# so workbench's roster section renders one card per workstream. STALE, DEAD
# and non-status CHANGE lines have no workbench event type: stdout only.

# shellcheck source=cmd-sync.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cmd-sync.sh"

FLEET_WATCH_STATE=""
FLEET_WATCH_EMIT=0
FLEET_WB_SLUG=""

# _fleet_wb_emit EVENT LANE DETAIL — append to the workbench events feed.
# Never fails the watch loop (emit-event contract: caller wraps || true).
# Override the target with FLEET_WB_EMIT_EVENT (tests / relocated skills).
_fleet_wb_emit() {
  local ev="$1" lane="$2" detail="$3"
  local emit="${FLEET_WB_EMIT_EVENT:-$HOME/.claude/skills/cfn-workbench/emit-event.sh}"
  [ -x "$emit" ] || return 0
  local -a args=(--slug "$FLEET_WB_SLUG" --event "$ev")
  [ -n "$lane" ] && args+=(--lane "$lane")
  [ -n "$detail" ] && args+=(--detail "$detail")
  "$emit" "${args[@]}" || true
}

# _fleet_lane_id WS — workbench lane id for a workstream: roster name
# (default: lowercased ws id), lowercased, spaces folded to underscores.
# Must match the run-plan lanes[].id this scan writes.
_fleet_lane_id() {
  local name
  name=$(roster_get "$1" name 2>/dev/null || printf '%s' "$1")
  [ -n "$name" ] || name="$1"
  printf '%s' "${name,,}" | tr ' ' '_'
}

# _fleet_runplan_write — regenerate <run-dir>/run-plan-<slug>.json from the
# roster. Idempotent; workbench's roster section (lib/section-roster.sh)
# reads exactly this shape. jq is a workbench dependency, so anyone running
# the bridge has it; without jq we warn once per scan and carry on.
_fleet_runplan_write() {
  command -v jq >/dev/null 2>&1 \
    || { echo "fleet watch: jq not found; run-plan not refreshed" >&2; return 0; }
  local roster out lanes_json
  roster=$(fleet_roster_file)
  out="$(fleet_run_dir)/run-plan-$FLEET_WB_SLUG.json"
  lanes_json=$(tail -n +2 "$roster" | jq -R -s '
    split("\n") | map(select(length > 0) | split("\t"))
    | map({ id:   (if .[1] == "" then .[0] else .[1] end | ascii_downcase | gsub(" "; "_")),
            name: .[2],
            phase: "Fleet" })')
  if ! jq -n --arg slug "$FLEET_WB_SLUG" --argjson lanes "$lanes_json" \
        '{slug: $slug, generated_at: (now | todate), phases: ["Fleet"], lanes: $lanes}' \
        > "$out.new" 2>/dev/null; then
    echo "fleet watch: run-plan render failed" >&2
    rm -f "$out.new"
    return 0
  fi
  mv "$out.new" "$out"
}

main() {
  local stale_min=5 poll=60 once=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --stale-min)
        [ $# -ge 2 ] || fleet_die 64 "watch: --stale-min needs a number"
        stale_min="$2"; shift 2 ;;
      --poll)
        [ $# -ge 2 ] || fleet_die 64 "watch: --poll needs seconds"
        poll="$2"; shift 2 ;;
      --once) once=1; shift ;;
      --emit-events) FLEET_WATCH_EMIT=1; shift ;;
      -*)     fleet_die 64 "watch: unknown option $1" ;;
      *)      fleet_die 64 "watch: unexpected argument $1" ;;
    esac
  done
  [[ "$stale_min" =~ ^[0-9]+$ && "$poll" =~ ^[0-9]+$ ]] \
    || fleet_die 64 "watch: --stale-min/--poll expect non-negative numbers"

  local run_dir
  run_dir=$(fleet_run_dir)
  FLEET_WB_SLUG="$(basename "$run_dir")"
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

# TSV split (_fleet_tsv_split), tmux socket (_fleet_tmux_socket), and pane
# liveness (_fleet_tmux_pane_alive) live in lib/common.sh (single source of
# truth, shared with cmd-dashboard.sh and cmd-spawn.sh).

# _fleet_watch_host_state WS HOST STATUS NOW — prints the space-separated state
# tokens for a host row: unreachable | dead | prompt, plus noreport. Only rows
# that should be running are probed over ssh (started|working); a blocked or
# finished row is only ever marked unreachable when sync already failed to ask.
_fleet_watch_host_state() {
  local ws="$1" host="$2" status="$3" now="$4" st out=""
  case "$_FLEET_WATCH_UNREACH" in
    *" $ws "*) echo unreachable; return 0 ;;
  esac
  case "$status" in
    started|working) ;;
    *) return 0 ;;
  esac
  st=$(_fleet_host_live_state "$ws" "$host")
  case "$st" in
    unreachable|dead|prompt) out="$st" ;;
  esac
  if [ "$st" != unreachable ] && _fleet_remote_noreport "$ws" "$now"; then
    out+="${out:+ }noreport"
  fi
  printf '%s\n' "$out"
  return 0
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
  local -a row_events=() change_events=() wb_transitions=()
  local row lines=0 alldone=1 i status hb age_min
  # Dead-pane probe needs tmux and the run's socket; skip the whole check
  # silently when the binary is missing (tooling absence is never a DEAD).
  local tmux_ok=0 sock=""
  if command -v tmux >/dev/null 2>&1; then
    tmux_ok=1
    sock=$(_fleet_tmux_socket)
  fi
  # Host rows: pull their reports first so the diff below sees fresh notes and
  # statuses. Only the lines a human acts on are re-emitted; the rest of sync's
  # chatter ("up to date", "applied N") would flood the stream every poll.
  # _FLEET_WATCH_UNREACH records which rows sync could not reach so the pane
  # probe does not wait out a second ssh timeout.
  local -A host_seen=() host_unreach=()
  _FLEET_WATCH_UNREACH=" "
  local -a sync_events=()
  if _fleet_roster_has_host "$roster"; then
    local sline
    while IFS= read -r sline; do
      case "$sline" in
        "UNREACHABLE "*) _FLEET_WATCH_UNREACH+="$(printf '%s' "$sline" | awk '{print $2}') " ;;
        HANDOFF\ *|CLAIM-REQ\ *|*" refused "*) sync_events+=("$sline") ;;
      esac
    done < <(fleet_sync 2>&1 || true)
  fi

  while IFS= read -r row || [ -n "$row" ]; do
    [ -n "$row" ] || continue
    lines=$((lines + 1))
    _fleet_tsv_split "$row"
    local -a cells=("${_FIELDS[@]}")
    local ws="${cells[0]}"
    status=""
    hb="0"
    local name_val="" host_val=""
    for i in "${!fields[@]}"; do
      val="${cells[$i]:-}"
      key="$ws|${fields[$i]}"
      cur["$key"]="$val"
      case "${fields[$i]}" in
        host)      host_val="$val" ;;
        status)    status="$val" ;;
        heartbeat) hb="$val" ;;
        name)      name_val="$val" ;;
      esac
      if [ "$had_state" -eq 1 ]; then
        # Heartbeat-only diffs never emit CHANGE: the activity-gated ticker
        # rewrites the heartbeat column every tick and would flood the stream.
        # The value is still recorded in .watch.state above.
        if [ "${fields[$i]}" = "heartbeat" ]; then
          :
        elif [ -n "${prev[$key]+set}" ]; then
          [ "${prev[$key]}" = "$val" ] || change_events+=("CHANGE $ws ${fields[$i]}")
        else
          change_events+=("CHANGE $ws ${fields[$i]}")   # new row since last scan
        fi
        # Workbench bridge piggybacks on the same diff: record the NEW status
        # so the emit pass can map started->lane_spawned, landed->lane_landed.
        [ "${fields[$i]}" = "status" ] && wb_transitions+=("$ws|$val")
      fi
    done

    local host_state=""
    if [ -n "$host_val" ]; then
      host_state=$(_fleet_watch_host_state "$ws" "$host_val" "$status" "$now")
      cur["$ws|~live"]="$host_state"
      case "$host_state" in *unreachable*) host_unreach["$host_val"]=1 ;; esac
      case "$status" in started|working) host_seen["$host_val"]=1 ;; esac
      # Events fire when a state newly appears, not on every poll.
      local tok
      for tok in $host_state; do
        case " ${prev["$ws|~live"]:-} " in *" $tok "*) continue ;; esac
        case "$tok" in
          unreachable) row_events+=("UNREACHABLE $ws $host_val") ;;
          dead)        row_events+=("DEAD $ws (pane exited)") ;;
          prompt)      row_events+=("PROMPT $ws") ;;
          noreport)    row_events+=("NOREPORT $ws") ;;
        esac
      done
    fi

    case "$status" in
      dead)
        row_events+=("DEAD $ws") ;;
      started|working)
        # Pane liveness first: a gone session (engine exited) is DEAD even on
        # a fresh heartbeat. Rows without a name cell and tmux-less hosts are
        # skipped, never reported dead. Host rows were probed over ssh above.
        if [ -z "$host_val" ] && [ "$tmux_ok" -eq 1 ] && [ -n "$name_val" ]; then
          _fleet_tmux_pane_alive "$sock" "$name_val" \
            || row_events+=("DEAD $ws (pane exited)")
        fi
        age_min=0
        # shellcheck disable=SC2053
        [[ "$hb" =~ ^[0-9]+$ ]] && age_min=$(((now - hb) / 60))
        # A host row we could not reach has an unknown heartbeat age: stay quiet.
        case "$host_state" in *unreachable*) age_min=0 ;; esac
        if [ "$age_min" -gt "$stale_min" ]; then
          row_events+=("STALE $ws $age_min")
        fi ;;
    esac
    if [ "$status" != "landed" ] && [ "$status" != "done" ]; then
      alldone=0
    fi
  done < <(awk 'NR > 1' "$roster")

  # Disk is a host property: one probe per host that has live rows and could
  # be reached, reported when it newly drops under the floor.
  local h free min_free
  min_free="${FLEET_REMOTE_MIN_FREE_GB:-$(fleet_env_get FLEET_REMOTE_MIN_FREE_GB)}"
  [[ "$min_free" =~ ^[0-9]+$ ]] || min_free=15
  for h in "${!host_seen[@]}"; do
    [ -z "${host_unreach[$h]+x}" ] || continue
    free=$(_fleet_host_free_gb "$h") || continue
    if [ "$free" -lt "$min_free" ]; then
      cur["~disk|$h"]="low"
      [ "${prev["~disk|$h"]:-}" = "low" ] || row_events+=("LOWDISK $h (${free} GB free, floor ${min_free})")
    else
      cur["~disk|$h"]="ok"
    fi
  done

  local e
  for e in "${row_events[@]}"; do
    echo "$e"
  done
  for e in "${sync_events[@]}"; do
    echo "$e"
  done
  for e in "${change_events[@]}"; do
    echo "$e"
  done

  # Workbench bridge (--emit-events): refresh the run-plan, anchor the
  # timeline with one loop_started, then translate status transitions.
  if [ "$FLEET_WATCH_EMIT" -eq 1 ]; then
    _fleet_runplan_write
    local started_marker="$FLEET_WATCH_STATE.wb-started"
    if [ ! -f "$started_marker" ]; then
      _fleet_wb_emit loop_started "" "fleet run" && : > "$started_marker"
    fi
    local t ws st
    for t in "${wb_transitions[@]}"; do
      ws="${t%%|*}"
      st="${t##*|}"
      case "$st" in
        started) _fleet_wb_emit lane_spawned "$(_fleet_lane_id "$ws")" "" ;;
        landed)  _fleet_wb_emit lane_landed  "$(_fleet_lane_id "$ws")" "" ;;
        *)       : ;;   # pending/working/blocked/done/dead: no workbench type
      esac
    done
  fi

  # Persist the snapshot for the next scan's diff (atomic tmp+mv).
  {
    for key in "${!cur[@]}"; do
      printf '%s\t%s\n' "$key" "${cur[$key]}"
    done | LC_ALL=C sort
  } > "$state.new" && mv "$state.new" "$state"

  if [ "$lines" -gt 0 ] && [ "$alldone" -eq 1 ]; then
    echo "ALL-DONE"
    [ "$FLEET_WATCH_EMIT" -eq 1 ] && _fleet_wb_emit loop_finished "" "all workstreams landed/done"
    exit 0
  fi
  return 0
}
