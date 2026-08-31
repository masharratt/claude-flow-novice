#!/usr/bin/env bash
# lib/section-map-all.sh - project-wide dashboard section for cfn-workbench.
#
# One transit line per loop run in the project, combined on one page so every
# session is visible in a single tab. Each run renders as a horizontal band:
# a run header (line key, slug, iteration/gate/lane/last-activity chips) above
# a small SVG whose stations sit left-to-right in wave order along the run's
# line. Wave boundaries get a tick and a W# label; the gate sits at the right
# end; a failed gate plus a later loop_started draws the dashed iterate
# loop-back under the line. In-flight lanes get the same pulse ring + train
# treatment as the per-run map, and the same easing script animates them.
#
# Run discovery (union, deduped):
#   <root>/planning/<slug>/run-plan-<slug>.json   (canonical per-plan dir)
#   <root>/planning/run-plan-<slug>.json          (legacy flat)
#   <root>/tmp/cfn-events-<slug>.jsonl            (plan-less run: single wave
#                                                  derived from its
#                                                  lane_spawned events)
# /tmp/cfn-events-<slug>.jsonl NEVER discovers a run: /tmp is machine-global
# and its event streams carry no project marker, so treating them as discovery
# sources would show every other project's sessions in this dashboard. /tmp
# streams only enrich the last-activity timestamp of slugs discovered above
# (and _wb_events_json already merges them into per-run derivation, where the
# slug is explicit).
# Bands sort by last activity (max of plan generated_at and newest event ts),
# newest first, capped at WORKBENCH_MAX_LINES (default 12) with an overflow
# note. Derivation is shared with the per-run map via _wb_map_run_state; this
# lib only lays bands out. Reporting artifact only, never a gate; every render
# path exits 0.

# wb_dash_discover ROOT
# Print "slug<TAB>last_ts" lines, newest activity first. last_ts may be empty
# (plan without generated_at and no events); such runs sort last.
wb_dash_discover() {
  local root="$1"
  local f slug base ts
  local -A seen=()
  shopt -s nullglob
  for f in "$root"/planning/*/run-plan-*.json \
           "$root"/planning/run-plan-*.json; do
    base="$(basename "$f")"
    slug="${base#run-plan-}"; slug="${slug%.json}"
    [[ -z "$slug" ]] && continue
    ts="$(jq -r '.generated_at // ""' "$f" 2>/dev/null || true)"
    if [[ -z "${seen[$slug]+x}" || "$ts" > "${seen[$slug]}" ]]; then
      seen[$slug]="$ts"
    fi
  done
  for f in "$root"/tmp/cfn-events-*.jsonl; do
    base="$(basename "$f")"
    slug="${base#cfn-events-}"; slug="${slug%.jsonl}"
    [[ -z "$slug" ]] && continue
    ts="$(tac "$f" 2>/dev/null | head -n 20 | jq -r '.ts // empty' 2>/dev/null \
          | sort | tail -n 1)"
    [[ -z "$ts" ]] && continue
    if [[ -z "${seen[$slug]+x}" || "$ts" > "${seen[$slug]}" ]]; then
      seen[$slug]="$ts"
    fi
  done
  # Timestamp enrichment only, for runs this project already owns: /tmp event
  # streams can be newer than the root copy (sessions append there first).
  for slug in "${!seen[@]}"; do
    f="/tmp/cfn-events-${slug}.jsonl"
    [[ -f "$f" ]] || continue
    ts="$(tac "$f" 2>/dev/null | head -n 20 | jq -r '.ts // empty' 2>/dev/null \
          | sort | tail -n 1)"
    [[ -z "$ts" ]] && continue
    if [[ "$ts" > "${seen[$slug]}" ]]; then
      seen[$slug]="$ts"
    fi
  done
  shopt -u nullglob
  local s
  for s in "${!seen[@]}"; do
    printf '%s\t%s\n' "$s" "${seen[$s]}"
  done | sort -t$'\t' -k2,2r -k1,1
}

# _wb_dash_style - dashboard-only styles on top of the shared _wb_map_style:
# run palette (10 line colors), band headers, chips, wave ticks.
_wb_dash_style() {
  printf '<style>'
  printf '#sec-dashboard{--dash-c0:#9184d9;--dash-c1:#4aa3c0;--dash-c2:#e76f51;--dash-c3:#7ee2a8;--dash-c4:#e9c46a;--dash-c5:#f4a261;--dash-c6:#b5838d;--dash-c7:#8ab17d;--dash-c8:#6d9dc5;--dash-c9:#c58ad0;}'
  printf '.dash-svg{width:100%%;height:auto;display:block;}'
  # Shared .map-label sizes only apply via map-tier-* classes, which dash
  # bands do not use; scope a compact size so labels fit the 34px min step.
  printf '.dash-svg .map-label{font-size:10px;}'
  printf '.dash-line{stroke-width:2.5;opacity:.75;fill:none;}'
  local k
  for k in 0 1 2 3 4 5 6 7 8 9; do
    printf '.dash-run-%s{stroke:var(--dash-c%s);}' "$k" "$k"
  done
  printf '.dash-wavetick{stroke:var(--neutral-500);stroke-width:1.5;}'
  printf '.dash-wavelabel{fill:var(--neutral-400);font-size:10px;text-anchor:middle;font-family:var(--font-mono);letter-spacing:.06em;}'
  printf '.dash-run-head{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin:16px 0 4px;font-family:var(--font-mono);font-size:12px;}'
  printf '.dash-linekey{display:inline-block;width:26px;height:0;border-top:3px solid var(--neutral-400);}'
  for k in 0 1 2 3 4 5 6 7 8 9; do
    printf '.dash-run-head .dash-run-%s{border-color:var(--dash-c%s);}' "$k" "$k"
  done
  printf '.dash-slug{color:var(--neutral-200);font-weight:600;}'
  printf '.dash-chip{padding:1px 8px;border-radius:9px;background:var(--color-surface);border:1px solid var(--color-divider);color:var(--neutral-300);line-height:1.5;}'
  printf '.dash-chip-gate-pass{color:var(--ok);}'
  printf '.dash-chip-gate-fail{color:var(--bad);}'
  printf '</style>'
}

# section_map_all - emit the project dashboard section HTML on stdout.
section_map_all() {
  local root="${WORKBENCH_ROOT:-.}"
  local max_lines="${WORKBENCH_MAX_LINES:-12}"
  local slug last_ts

  _wb_map_style
  _wb_dash_style

  printf '<section class="card" id="sec-dashboard">'
  printf '<span class="section-kicker">Project</span>'
  printf '<h2>All runs</h2>'
  printf '<hr class="hr"/>'

  local discovered
  discovered="$(wb_dash_discover "$root")"
  if [[ -z "$discovered" ]]; then
    record_gap "dashboard (no runs discovered under ${root}; nothing to show)"
    printf '<p class="empty">No loop runs found in this project yet.</p>'
    printf '</section>'
    return
  fi

  local total shown overflow=0
  total="$(printf '%s\n' "$discovered" | wc -l | tr -d ' ')"
  if [[ "$total" -gt "$max_lines" ]]; then
    shown="$max_lines"
    overflow=$((total - max_lines))
  else
    shown="$total"
  fi

  local i=0 run_plan run_state waves_override skip
  while IFS=$'\t' read -r slug last_ts; do
    [[ -z "$slug" ]] && continue
    (( i >= shown )) && break
    run_plan="$(plan_path "$root" "$slug" "run-plan-${slug}.json")" || true
    waves_override=""
    if [[ -z "$run_plan" || ! -f "$run_plan" ]]; then
      # Plan-less run: single wave from the lanes that actually spawned.
      waves_override="$(_wb_events_json "$slug" "$root" | jq -c '
        [[ .[]? | select(.event == "lane_spawned")
           | (.lane // empty) | select(. != "") ] | unique ]' 2>/dev/null || true)"
    fi
    run_state="$(_wb_map_run_state "$slug" "$root" "$run_plan" "$waves_override")" || {
      record_gap "dashboard band (state derivation failed for ${slug})"
      continue
    }
    _wb_dash_band "$slug" "$last_ts" "$run_state" "$((i % 10))"
    i=$((i + 1))
  done <<< "$discovered"

  if [[ "$overflow" -gt 0 ]]; then
    printf '<p class="empty">+%s more runs not shown (raise --max-lines; %s runs total).</p>' \
      "$(html_escape "$overflow")" "$(html_escape "$total")"
  fi

  # Legend matches the per-run map so both pages read the same way.
  printf '<div class="map-legend">'
  printf '<span class="map-key"><span class="map-key-dot map-key-ok"></span>%s</span>' \
    "$(html_escape "landed")"
  printf '<span class="map-key"><span class="map-key-dot map-key-warn"></span>%s</span>' \
    "$(html_escape "in-flight")"
  printf '<span class="map-key"><span class="map-key-dot map-key-bad"></span>%s</span>' \
    "$(html_escape "blocked")"
  printf '<span class="map-key"><span class="map-key-dot"></span>%s</span>' \
    "$(html_escape "pending")"
  printf '<span class="map-key"><span class="map-key-train"></span>%s</span>' \
    "$(html_escape "train (lane working now)")"
  printf '<span class="map-key"><span class="map-key-loop"></span>%s</span>' \
    "$(html_escape "iterate loop")"
  printf '<span class="map-key"><span class="map-key-gate"></span>%s</span>' \
    "$(html_escape "gate")"
  printf '</div>'

  _wb_map_train_script

  printf '</section>'
}

# _wb_dash_band SLUG LAST_TS RUN_STATE COLOR_IDX
# Emit one run band: HTML header chips + the band SVG. All coordinates are
# computed in one jq pass emitting TSV; bash interpolates integers and escaped
# strings only.
_wb_dash_band() {
  local slug="$1" last_ts="$2" run_state="$3" cidx="$4"

  local gate iter lanes_n
  gate="$(printf '%s' "$run_state" | jq -r '.gate')"
  iter="$(printf '%s' "$run_state" | jq -r '.iteration')"
  lanes_n="$(printf '%s' "$run_state" | jq -r '[.waves[][]] | length')"

  local last_hm=""
  if [[ "$last_ts" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2} ]]; then
    last_hm="${last_ts:11:5}"
  fi

  local slug_s gate_s
  slug_s="$(html_escape "$slug")"
  gate_s="$(html_escape "$gate")"

  printf '<div class="dash-run-head">'
  printf '<span class="dash-linekey dash-run-%s"></span>' "$(html_escape "$cidx")"
  printf '<span class="dash-slug">%s</span>' "$slug_s"
  printf '<span class="dash-chip">iter %s</span>' "$(html_escape "$iter")"
  printf '<span class="dash-chip dash-chip-gate-%s">gate %s</span>' "$gate_s" "$gate_s"
  printf '<span class="dash-chip">%s lanes</span>' "$(html_escape "$lanes_n")"
  if [[ -n "$last_hm" ]]; then
    printf '<span class="dash-chip">last %s</span>' "$(html_escape "$last_hm")"
  fi
  printf '</div>'

  local geo
  geo="$(printf '%s' "$run_state" | jq -r --arg cidx "$cidx" '
    . as $rs
    | .waves as $wv
    | ($wv | length) as $W
    | [ $wv | to_entries[]
        | .key as $wk
        | .value[]
        | {lane: ., wave: $wk} ] as $flat
    | ($flat | length) as $N
    | (if $N > 1
       then ((((900 - 60 - (($W - 1) * 36)) / ($N - 1)) | floor)) else 0 end) as $s0
    | (if $s0 > 74 then 74 elif $s0 < 34 then 34 else $s0 end) as $step
    # Label char budget: mono 10px is ~6px/char; leave 8px gutter so adjacent
    # labels never overrun the step. Clamped [4,14]; full name in <title>.
    | (((($step - 8) / 6) | floor)
        | if . > 14 then 14 elif . < 4 then 4 else . end) as $maxch
    | ($flat | to_entries
        | map(.key as $k
              | .value as $s
              | $s + {idx: $k, x: (60 + $k * $step + $s.wave * 36)})) as $sts
    | ($sts | last | .x) as $lastX
    | ($lastX + 46) as $gx
    | ([ ($gx + 60), 960 ] | max) as $vbw
    | 104 as $vh
    | 54 as $y
    | ( [ "hdr", $vbw, $vh ] | @tsv ),
        ( $sts[] | . as $s
          | ($rs.status[$s.lane] // "pending") as $sv
          | ((($rs.names[$s.lane] // "") | if . == "" then $s.lane else . end) | .[0:$maxch]) as $lb
          | [ "st", $s.lane, $sv, $s.x, $y, $lb ] | @tsv ),
        ( $sts | to_entries[]
          | select(.key > 0)
          | .value as $s
          | ($sts[.key - 1]) as $p
          | [ "conn", ($p.x + 14), ($s.x - 14), $y ] | @tsv ),
        ( [ "conn", ($lastX + 14), ($gx - 18), $y ] | @tsv ),
        ( $wv | to_entries[]
          | .key as $wk
          | ($sts | map(select(.wave == $wk)) | first.idx) as $firstIdx
          | (if $wk > 0
             then ((($sts[$firstIdx - 1].x + $sts[$firstIdx].x) / 2) | floor)
             else (($sts | first | .x) - 17) end) as $mx
          | [ "wtick", $mx, ("W" + (($wk + 1) | tostring)) ] | @tsv ),
        ( $sts | to_entries[]
          | select(($rs.status[.value.lane] // "pending") == "in-flight")
          | .value as $s
          | (if $s.idx > 0
             then [ ($sts[$s.idx - 1].x + 14), ($s.x - 16) ]
             else [ ($s.x - 36), ($s.x - 14) ] end) as $t
          | ((( $t[0] + $t[1] ) / 2) | floor) as $mx
          | (($rs.spawn[$s.lane] // "1970-01-01T00:00:00Z") | try fromdateiso8601 catch 0) as $dep
          | [ "train", $s.lane, $t[0], $y, $t[1], $y, $mx, $dep ] | @tsv ),
        ( if $rs.gate == "fail" and $rs.loop then
            ($sts | first | .x) as $x0
            | [ "loop",
                ("M " + ($gx | tostring) + " 66"
                 + " C " + ($gx | tostring) + " 92, " + ($x0 | tostring) + " 92, "
                 + ($x0 | tostring) + " 66"),
                (((($x0 + $gx) / 2) | floor)),
                98 ] | @tsv
          else empty end ),
        ( [ "gate", $gx, $y ] | @tsv )
      ' 2>/dev/null)" || geo=""

  if [[ -z "$geo" ]]; then
    record_gap "dashboard band (layout computation failed for ${slug})"
    return
  fi

  local rtype a1 a2 a3 a4 a5 a6 a7 a8
  local lane_s status_s label_s title_s
  local g_w="960" g_h="104" tracks="" stations="" trains="" loop_svg=""
  while IFS=$'\t' read -r rtype a1 a2 a3 a4 a5 a6 a7 a8; do
    case "$rtype" in
      hdr) g_w="$a1"; g_h="$a2" ;;
      st)
        lane_s="$(html_escape "$a1")"
        status_s="$(html_escape "$a2")"
        label_s="$(html_escape "$a5")"
        title_s="$(html_escape "lane ${a1}: ${a2}")"
        stations+="$(printf '<g class="map-st" data-lane="%s" data-status="%s" transform="translate(%s,%s)">' \
          "$lane_s" "$status_s" "$a3" "$a4")"
        if [[ "$a2" == "in-flight" ]]; then
          stations+='<circle class="map-pulse" r="13"/>'
        fi
        stations+='<circle class="map-dot" r="11"/>'
        if [[ "$a2" == "blocked" ]]; then
          stations+='<text class="map-mark" y="4">!</text>'
        elif [[ "$a2" == "in-flight" ]]; then
          stations+='<text class="map-mark map-mark-live" y="4">...</text>'
        fi
        stations+="$(printf '<text class="map-label" y="-22">%s</text>' "$label_s")"
        stations+="$(printf '<title>%s</title></g>' "$title_s")"
        ;;
      conn)
        # TSV record: conn <x1> <x2> <y>; horizontal segment, y1 == y2.
        tracks+="$(printf '<line class="dash-line dash-run-%s" x1="%s" y1="%s" x2="%s" y2="%s" marker-end="url(#map-arrow)"/>' \
          "$cidx" "$a1" "$a3" "$a2" "$a3")"
        ;;
      wtick)
        tracks+="$(printf '<line class="dash-wavetick" x1="%s" y1="44" x2="%s" y2="52"/>' "$a1" "$a1")"
        tracks+="$(printf '<text class="dash-wavelabel" x="%s" y="20">%s</text>' \
          "$a1" "$(html_escape "$a2")")"
        ;;
      train)
        lane_s="$(html_escape "$a1")"
        trains+="$(printf \
          '<g class="map-train" data-lane="%s" data-from="%s,%s" data-to="%s,%s" data-depart-epoch="%s" transform="translate(%s,%s)"><rect x="-14" y="-6" width="28" height="12" rx="6"/><circle class="map-win" cx="-6" cy="0" r="2"/><circle class="map-win" cx="0" cy="0" r="2"/><circle class="map-win" cx="6" cy="0" r="2"/></g>' \
          "$lane_s" "$a2" "$a3" "$a4" "$a5" "$a8" "$a6" "$a7")"
        ;;
      loop)
        loop_svg+="$(printf '<path class="map-loop" d="%s" marker-end="url(#map-arrow-loop)"/>' "$a1")"
        loop_svg+="$(printf '<text class="map-loop-label" x="%s" y="%s">iterate</text>' "$a2" "$a3")"
        ;;
      gate) ;;
    esac
  done <<< "$geo"

  printf '<svg class="dash-svg" data-run="%s" data-iteration="%s" viewBox="0 0 %s %s" role="img" aria-label="Transit line for run %s">' \
    "$slug_s" "$(html_escape "$iter")" "$(html_escape "$g_w")" "$(html_escape "$g_h")" "$slug_s"
  printf '<defs><marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="map-arrow-head" fill="context-stroke"/></marker>'
  printf '<marker id="map-arrow-loop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="map-arrow-head-bad"/></marker></defs>'
  printf '%s' "$tracks"
  printf '%s' "$loop_svg"
  printf '%s' "$stations"
  printf '<g class="map-gate map-gate-%s" transform="translate(%s,54)">' \
    "$gate_s" "$(printf '%s' "$geo" | awk -F'\t' '$1=="gate"{print $2; exit}')"
  printf '<circle class="map-gate-outer" r="14"/><circle class="map-gate-inner" r="7"/>'
  # No text label: the run header's gate chip and this <title> carry the state
  # (a y=34 label collided with the last station label at gx = lastX + 46).
  printf '<title>%s</title></g>' "$(html_escape "gate: ${gate}")"
  printf '%s' "$trains"
  printf '</svg>'
}
