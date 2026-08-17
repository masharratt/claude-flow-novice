#!/bin/bash
# lib/section-roster.sh - lane roster section for cfn-workbench.
#
# Run-plan file: <root>/planning/<slug>/run-plan-<slug>.json (legacy: <root>/planning/)
#   {"slug":"...","generated_at":"ISO8601","phases":["Phase 2","Phase 3"],
#    "lanes":[{"id":"frontend","name":"Frontend UI","phase":"Phase 2"}]}
# lanes[].id is required; name/phase are optional (fall back to id / "-").
#
# Status per lane id:
#   landed:    a lane-report file matches <root>/tmp/lane-report-<slug>-*-<id>.json
#              OR /tmp/lane-report-<slug>-*-<id>.json, OR a lane_landed event
#              for that lane.
#   in-flight: a lane_spawned event for the lane exists and it is not landed.
#              Since = that event's ts, formatted HH:MM.
#   pending:   otherwise.
#
# Missing run-plan is a data gap; the section is still emitted with its id and
# a short empty-state card. Reads events via _wb_events_json /
# _wb_events_file_exists (lib/section-events.sh); safe because render.sh
# sources both libs before either section function runs.

# _wb_lane_landed SLUG ROOT ID EVENTS_JSON
# True if a lane-report file exists for ID, or a lane_landed event names it.
_wb_lane_landed() {
  local slug="$1" root="$2" id="$3" events_json="$4"
  if compgen -G "${root}/tmp/lane-report-${slug}-*-${id}.json" >/dev/null 2>&1 \
     || compgen -G "/tmp/lane-report-${slug}-*-${id}.json" >/dev/null 2>&1; then
    return 0
  fi
  printf '%s' "$events_json" | jq -e --arg lane "$id" \
    'any(.[]?; .event == "lane_landed" and .lane == $lane)' >/dev/null 2>&1
}

# _wb_lane_spawned_ts ID EVENTS_JSON
# Echoes the ts of the latest lane_spawned event for ID, or empty.
_wb_lane_spawned_ts() {
  local id="$1" events_json="$2"
  printf '%s' "$events_json" | jq -r --arg lane "$id" \
    '[.[]? | select(.event == "lane_spawned" and .lane == $lane)] | sort_by(.ts // "") | last | (.ts // empty)' \
    2>/dev/null
}

# section_roster - emit the Lane roster section HTML on stdout.
section_roster() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local run_plan; run_plan="$(plan_path "$root" "$slug" "run-plan-${slug}.json")" || true

  printf '<style>'
  printf '.lane-landed,.lane-inflight,.lane-pending{display:inline-block;padding:2px 8px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;letter-spacing:.01em;border-left:3px solid transparent;white-space:nowrap;}'
  printf '.lane-landed{border-left-color:var(--ok);background:rgba(126,226,168,.12);color:#a8efc4;}'
  printf '.lane-inflight{border-left-color:var(--warn);background:rgba(233,196,106,.12);color:#f0dfa8;}'
  printf '.lane-pending{border-left-color:var(--neutral-400);background:transparent;color:var(--neutral-400);box-shadow:inset 0 0 0 1px var(--color-divider);}'
  printf '</style>'

  printf '<section class="card" id="sec-roster">'
  printf '<span class="section-kicker">Live</span>'
  printf '<h2>Lane roster</h2>'
  printf '<hr class="hr"/>'

  if [[ -z "$slug" || ! -f "$run_plan" ]] \
     || ! jq -e '.lanes | type == "array"' "$run_plan" >/dev/null 2>&1; then
    # Root-relative: $root can be a mktemp scratch dir and the page must not leak one.
    record_gap "run plan (${run_plan#"$root"/} missing; roster skipped)"
    printf '<p class="empty">No lane roster available for this run.</p>'
    printf '</section>'
    return
  fi

  local total
  total=$(jq '.lanes | length' "$run_plan" 2>/dev/null || echo 0)
  if [[ -z "$total" || "$total" -eq 0 ]]; then
    printf '<p class="empty">No lanes defined in the run plan.</p>'
    printf '</section>'
    return
  fi

  local events_json
  events_json="$(_wb_events_json "$slug" "$root")"

  local landed_count=0
  local rows=""
  while IFS=$'\t' read -r id name phase; do
    [[ -z "$id" ]] && continue
    local disp_name="$name" disp_phase="$phase"
    [[ -z "$disp_name" ]] && disp_name="$id"
    [[ -z "$disp_phase" ]] && disp_phase="-"

    local status="pending" status_class="lane-pending" since="-"
    if _wb_lane_landed "$slug" "$root" "$id" "$events_json"; then
      status="landed"; status_class="lane-landed"
      landed_count=$((landed_count + 1))
    else
      local spawn_ts
      spawn_ts="$(_wb_lane_spawned_ts "$id" "$events_json")"
      if [[ -n "$spawn_ts" ]]; then
        status="in-flight"; status_class="lane-inflight"
        since="$(printf '%s' "$spawn_ts" | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T([0-9]{2}):([0-9]{2}).*/\1:\2/')"
        [[ -z "$since" ]] && since="-"
      fi
    fi

    rows+="<tr><td>$(html_escape "$id")</td>"
    rows+="<td>$(html_escape "$disp_name")</td>"
    rows+="<td>$(html_escape "$disp_phase")</td>"
    rows+="<td><span class=\"${status_class}\">$(html_escape "$status")</span></td>"
    rows+="<td>$(html_escape "$since")</td></tr>"
  done < <(jq -r '.lanes[] | [(.id // ""), (.name // ""), (.phase // "")] | @tsv' "$run_plan")

  printf '<p class="section-hint">%s of %s lanes landed</p>' \
    "$(html_escape "$landed_count")" "$(html_escape "$total")"
  printf '<div class="table-wrap"><table>'
  printf '<thead><tr><th>Lane</th><th>Name</th><th>Phase</th><th>Status</th><th>Since</th></tr></thead>'
  printf '<tbody>%s</tbody></table></div>' "$rows"
  printf '</section>'
}
