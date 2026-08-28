#!/usr/bin/env bash
# lib/section-map.sh - transit-map section for cfn-workbench.
#
# Lanes are stations grouped into wave columns; tracks connect adjacent wave
# columns and the last column to the gate junction; the latest gate_verdict
# event opens or closes the junction; a failed gate followed by a later
# loop_started draws a dashed loop-back track (ITERATE = another circuit);
# in-flight lanes render as trains baked at their segment midpoint so the map
# is complete with JavaScript off. A small inline script eases trains along
# their segment between meta-refreshes (staleness-pill precedent).
#
# Column source, in priority order:
#   1. <root>/planning/<slug>/lanes-<slug>.json  .waves: array of lane-id
#      arrays (legacy flat planning/lanes-<slug>.json also resolved).
#   2. Fallback: one column per run-plan .phases[] entry, lanes grouped by
#      their .phase; lanes matching no phase append to a trailing column.
#   3. Fallback: one column holding every run-plan lane id, sorted.
#
# Station status per lane id reuses the roster derivation (_wb_lane_landed,
# _wb_lane_spawned_ts from lib/section-roster.sh) plus:
#   blocked: the lane's LATEST report (by generated_at, both tmp/ roots)
#            carries a non-null .blocked_on. Blocked wins over landed.
#
# Gate: last gate_verdict event; pass/fail from detail regex "exit ([0-9]+)"
# (0 = pass, no match or no event = unknown). Iteration = count of
# loop_started events (fallback 1). Loop-back is drawn only when gate=fail
# AND a loop_started exists later than that gate_verdict.
#
# All SVG coordinates are computed in ONE jq pass emitting TSV records; bash
# interpolates the integers and escaped strings only. No new event types are
# consumed: the 9-type event set is closed. Missing run-plan is a data gap;
# the section still renders its empty state. This is a reporting artifact and
# is never a gate: section_map always exits 0.

# _wb_lane_blocked SLUG ROOT ID
# True when the lane's latest lane-report file (by generated_at, across
# <root>/tmp and /tmp) carries a non-null .blocked_on.
_wb_lane_blocked() {
  local slug="$1" root="$2" id="$3"
  local f ts latest_ts="" latest_file=""
  local -a files=()
  shopt -s nullglob
  # Quote the variable parts only: a quoted * is literal, never a glob.
  for f in "${root}"/tmp/lane-report-"${slug}"-*-"${id}".json \
           /tmp/lane-report-"${slug}"-*-"${id}".json; do
    files+=("$f")
  done
  shopt -u nullglob
  [[ "${#files[@]}" -eq 0 ]] && return 1
  for f in "${files[@]}"; do
    ts="$(jq -r '.generated_at // ""' "$f" 2>/dev/null || true)"
    # Real lane reports (cfn-dev-team schema) carry no generated_at, so the
    # first candidate seeds the selection and only a strictly newer ts
    # replaces it. An all-empty field must not deselect every file.
    if [[ -z "$latest_file" ]] || [[ "$ts" > "$latest_ts" ]]; then
      latest_ts="$ts"
      latest_file="$f"
    fi
  done
  [[ -n "$latest_file" ]] || return 1
  jq -e '.blocked_on != null' "$latest_file" >/dev/null 2>&1
}

# section_map - emit the Transit map section HTML on stdout.
section_map() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local run_plan; run_plan="$(plan_path "$root" "$slug" "run-plan-${slug}.json")" || true

  # Scoped styles (roster precedent): status fills, wave palette, pulse ring.
  printf '<style>'
  printf '.map-svg{width:100%%;height:auto;display:block;}'
  printf '.map-track{stroke-width:3;opacity:.5;fill:none;}'
  printf '.map-wave-0{stroke:#9184d9;}.map-wave-1{stroke:#4aa3c0;}.map-wave-2{stroke:#c07b4a;}.map-wave-3{stroke:#7ee2a8;}.map-wave-4{stroke:#e9c46a;}'
  printf '.map-st .map-dot{stroke:var(--color-divider);stroke-width:1.5;}'
  printf '.map-st[data-status="pending"] .map-dot{fill:var(--color-surface);stroke:var(--neutral-400);stroke-width:2;}'
  printf '.map-st[data-status="in-flight"] .map-dot{fill:var(--warn);}'
  printf '.map-st[data-status="landed"] .map-dot{fill:var(--ok);}'
  printf '.map-st[data-status="blocked"] .map-dot{fill:var(--bad);}'
  printf '.map-pulse{fill:none;stroke:var(--warn);stroke-width:2;opacity:.55;animation:map-pulse 2.4s ease-out infinite;}'
  printf '@keyframes map-pulse{0%%{r:10;opacity:.55;}100%%{r:24;opacity:0;}}'
  printf '@media (prefers-reduced-motion: reduce){.map-pulse{animation:none;opacity:.25;}}'
  printf '.map-label{fill:var(--neutral-300);text-anchor:middle;font-family:var(--font-mono);}'
  printf '.map-tier-s .map-label{font-size:13px;}.map-tier-m .map-label{font-size:11px;}.map-tier-l .map-label{font-size:9px;}'
  printf '.map-mark{fill:var(--color-bg);text-anchor:middle;font-weight:700;}'
  printf '.map-gate .map-gate-outer{fill:none;stroke-width:3;}'
  printf '.map-gate .map-gate-inner{stroke:var(--color-divider);stroke-width:1.5;}'
  printf '.map-gate-unknown .map-gate-outer{stroke:var(--neutral-400);}.map-gate-unknown .map-gate-inner{fill:var(--neutral-500);}'
  printf '.map-gate-pass .map-gate-outer{stroke:var(--ok);}.map-gate-pass .map-gate-inner{fill:var(--ok);}'
  printf '.map-gate-fail .map-gate-outer{stroke:var(--bad);}.map-gate-fail .map-gate-inner{fill:var(--bad);}'
  printf '.map-loop{fill:none;stroke:var(--bad);stroke-width:2.5;stroke-dasharray:7 5;opacity:.8;}'
  printf '.map-arrow-head{fill:var(--bad);}'
  printf '.map-loop-label{fill:var(--bad);text-anchor:middle;font-size:11px;font-weight:600;letter-spacing:.08em;}'
  printf '.map-badge{fill:var(--neutral-300);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;}'
  printf '.map-train rect{fill:#c5bdf0;stroke:var(--accent-600);stroke-width:1;}'
  printf '.map-train .map-win{fill:var(--color-bg);}'
  printf '</style>'

  printf '<section class="card" id="sec-map">'
  printf '<span class="section-kicker">Live</span>'
  printf '<h2>Transit map</h2>'
  printf '<hr class="hr"/>'

  if [[ -z "$slug" || ! -f "$run_plan" ]] \
     || ! jq -e '.lanes | type == "array"' "$run_plan" >/dev/null 2>&1; then
    # Root-relative: $root can be a mktemp scratch dir and the page must not leak one.
    record_gap "run plan (${run_plan#"$root"/} missing; map skipped)"
    printf '<p class="empty">No transit map available for this run.</p>'
    printf '</section>'
    return
  fi

  # Column source: lanes file waves first, run-plan phases fallback.
  local lanes_file; lanes_file="$(plan_path "$root" "$slug" "lanes-${slug}.json")" || true
  local waves_json=""
  if [[ -f "$lanes_file" ]] \
     && jq -e '.waves | type == "array" and length > 0' "$lanes_file" >/dev/null 2>&1; then
    waves_json="$(jq -c '
      [ .waves[]
        | (if type == "array" then . else [] end)
        | map(select(type == "string" and length > 0))
        | select(length > 0) ]' "$lanes_file" 2>/dev/null || true)"
  fi
  if [[ -z "$waves_json" || "$waves_json" == "[]" ]]; then
    waves_json="$(jq -c '
      . as $rp
      | ($rp.phases // []) as $p0
      | (if ($p0 | type) == "array" then $p0 else [] end) as $phases
      | [ $phases
          | map(select(type == "string" and length > 0))[] as $ph
          | [ $rp.lanes[]
              | select(((.phase // "") == $ph) and ((.id // "") != ""))
              | .id ]
          | select(length > 0) ]
      | . as $grouped
      | ($grouped | flatten) as $matched
      | [ $rp.lanes[]
          | (.id // "")
          | select((. != "") and (($matched | index(.)) | not)) ] as $extra
      | (if ($extra | length) > 0 then ($grouped + [$extra]) else $grouped end)
      | if length == 0
        then [ [ $rp.lanes[] | (.id // "") | select(. != "") ] | sort ]
        else . end' "$run_plan" 2>/dev/null || true)"
  fi

  local total
  total="$(printf '%s' "$waves_json" | jq '[.[][]] | length' 2>/dev/null || echo 0)"
  if [[ -z "$total" || "$total" -eq 0 ]]; then
    printf '<p class="empty">No lanes defined in the run plan.</p>'
    printf '</section>'
    return
  fi

  local events_json
  events_json="$(_wb_events_json "$slug" "$root")"

  # Per-lane status + spawn ts, one TSV row per lane: lane, status, spawn_ts.
  local rows="" lane st spawn_ts
  while IFS= read -r lane; do
    [[ -z "$lane" ]] && continue
    st="pending"
    spawn_ts=""
    if _wb_lane_blocked "$slug" "$root" "$lane"; then
      st="blocked"
    elif _wb_lane_landed "$slug" "$root" "$lane" "$events_json"; then
      st="landed"
    else
      spawn_ts="$(_wb_lane_spawned_ts "$lane" "$events_json")"
      [[ -n "$spawn_ts" ]] && st="in-flight"
    fi
    rows+="${lane}"$'\t'"${st}"$'\t'"${spawn_ts}"$'\n'
  done < <(printf '%s' "$waves_json" | jq -r 'flatten | unique[]' 2>/dev/null)

  local status_json spawn_json names_json
  status_json="$(printf '%s' "$rows" | jq -R -s '
    split("\n") | map(select(length > 0) | split("\t")) | map({(.[0]): .[1]})
    | add // {}' 2>/dev/null || printf '{}')"
  spawn_json="$(printf '%s' "$rows" | jq -R -s '
    split("\n") | map(select(length > 0) | split("\t"))
    | map(select(.[2] != "") | {(.[0]): .[2]}) | add // {}' 2>/dev/null || printf '{}')"
  names_json="$(jq -c '
    [.lanes[] | {key: (.id // ""), value: (.name // "")}] | from_entries' \
    "$run_plan" 2>/dev/null || printf '{}')"

  # Gate state, loop-back flag, iteration count from the merged event stream.
  local gate_state="unknown" loop_flag="0" iteration="1"
  read -r gate_state loop_flag iteration < <(printf '%s' "$events_json" | jq -r '
    ([.[]? | select(.event == "gate_verdict")] | sort_by(.ts // "") | last) as $g
    | (($g.detail // "") | tostring) as $d
    | (if $g == null then "unknown"
       elif ($d | test("exit [0-9]+")) then
         (if (($d | capture("exit (?<n>[0-9]+)")).n | tonumber) == 0
          then "pass" else "fail" end)
       else "unknown" end) as $gs
    | (if $g == null then "" else ($g.ts // "") end) as $gt
    | ([.[]? | select(.event == "loop_started" and (.ts // "") > $gt)] | length > 0) as $lp
    | ([.[]? | select(.event == "loop_started")] | length) as $ln
    | "\( $gs )\t\( if $gs == "fail" and $lp and $gt != "" then "1" else "0" end )\t\( if $ln == 0 then 1 else $ln end )"' 2>/dev/null) || true
  case "$gate_state" in
    pass|fail|unknown) ;;
    *) gate_state="unknown" ;;
  esac
  [[ "$loop_flag" == "1" ]] || loop_flag="0"
  case "$iteration" in
    ''|*[!0-9]*) iteration="1" ;;
  esac

  # One jq pass emits every SVG coordinate as TSV; bash only interpolates.
  local geo
  geo="$(printf '%s' "$waves_json" | jq -r \
    --argjson status "$status_json" \
    --argjson spawn "$spawn_json" \
    --argjson names "$names_json" \
    --arg gate "$gate_state" \
    --argjson loop "$([[ "$loop_flag" == "1" ]] && printf true || printf false)" \
    --argjson iter "$iteration" '
. as $wv
| ($wv | length) as $W
| ([ $wv[] | length ] | add) as $N
| (if $N <= 6 then 84 elif $N <= 12 then 64 else 46 end) as $rowH
| (if $W > 1 then ((780 / ($W - 1)) | floor) else 0 end) as $step
| (70 + ($N + 1) * $rowH) as $H
| (if $W > 1 then 90 + (($W - 1) * $step) else 480 end) as $lastX
| (if $lastX + 55 > 930 then 930 else $lastX + 55 end) as $gx
| ([ $wv[] | length ] | max) as $mrows
| (70 + (((($mrows - 1) * $rowH) / 2) | floor)) as $gy
| (($spawn | with_entries(.value |= ((try fromdateiso8601 catch 0)))) ) as $dep
| ( def colx: if $W > 1 then 90 + . * $step else 480 end;
    def rowy: 70 + . * $rowH;
    ( [ "hdr", $H, $rowH, $gx, $gy, $iter ] | @tsv ),
    ( range(0; $W - 1) as $i
      | ($i | colx) as $xa
      | ($i + 1 | colx) as $xb
      | $wv[$i] | to_entries[] as $a
      | ($a.key | rowy) as $ya
      | $wv[$i + 1] | to_entries[] as $b
      | ($b.key | rowy) as $yb
      | [ "tr", $i, $xa, $ya, $xb, $yb ] | @tsv ),
    ( ($wv | to_entries | last) as $lc
      | ($lc.key | colx) as $xl
      | $lc.value | to_entries[] as $s
      | [ "tr", $lc.key, $xl, ($s.key | rowy), $gx, $gy ] | @tsv ),
    ( $wv | to_entries[] as $col
      | ($col.key | colx) as $x
      | $col.value | to_entries[] as $st
      | ($st.key | rowy) as $y
      | ( if $col.key > 0 then ($col.key - 1 | colx) else 8 end ) as $fx
      | ( if $col.key > 0
          then ([ $st.key, ($wv[$col.key - 1] | length - 1) ] | min | rowy)
          else ($st.key | rowy)
          end ) as $fy
      | ((( $fx + $x ) / 2) | floor) as $mx
      | ((( $fy + $y ) / 2) | floor) as $my
      | $st.value as $lane
      | ($status[$lane] // "pending") as $sv
      | ($dep[$lane] // 0) as $dp
      | (( $names[$lane] // "" | if . == "" then $lane else . end ) | .[0:16]) as $lb
      | [ "st", $lane, $sv, $x, $y, $fx, $fy, $mx, $my, $dp, $lb ] | @tsv ),
    ( if $loop and $gate == "fail" then
        ( $wv[0] | length ) as $l0
        | (0 | colx) as $x0
        | (70 + (((($l0 - 1) * $rowH) / 2) | floor)) as $y0
        | [ "loop",
            ("M " + ($gx | tostring) + " " + (($gy + 20) | tostring)
             + " C " + ($gx | tostring) + " " + (($H - 14) | tostring)
             + ", " + ($x0 | tostring) + " " + (($H - 14) | tostring)
             + ", " + ($x0 | tostring) + " " + ($y0 | tostring)),
            ((($x0 + $gx) / 2) | floor),
            ($H - 6) ] | @tsv
      else empty end )
  )' 2>/dev/null)" || geo=""

  if [[ -z "$geo" ]]; then
    record_gap "transit map (layout computation failed for ${slug})"
    printf '<p class="empty">Transit map layout could not be computed.</p>'
    printf '</section>'
    return
  fi

  # Render the SVG from the TSV records.
  local rtype a1 a2 a3 a4 a5 a6 a7 a8 a9 a10
  local lane_s status_s label_s title_s
  local g_h="480" g_rowh="84" g_iter="$iteration" g_gx="930" g_gy="70"
  local tier="s" tracks="" stations="" trains="" loop_svg=""
  while IFS=$'\t' read -r rtype a1 a2 a3 a4 a5 a6 a7 a8 a9 a10; do
    case "$rtype" in
      hdr)
        g_h="$a1"; g_rowh="$a2"; g_gx="$a3"; g_gy="$a4"; g_iter="$a5"
        case "$g_rowh" in
          84) tier="s" ;;
          64) tier="m" ;;
          *) tier="l" ;;
        esac
        ;;
      tr)
        tracks+="$(printf '<line class="map-track map-wave-%s" x1="%s" y1="%s" x2="%s" y2="%s"/>' \
          "$a1" "$a2" "$a3" "$a4" "$a5")"
        ;;
      st)
        lane_s="$(html_escape "$a1")"
        status_s="$(html_escape "$a2")"
        label_s="$(html_escape "$a10")"
        title_s="$(html_escape "lane ${a1}: ${a2}")"
        stations+="$(printf '<g class="map-st" data-lane="%s" data-status="%s" transform="translate(%s,%s)">' \
          "$lane_s" "$status_s" "$a3" "$a4")"
        if [[ "$a2" == "in-flight" ]]; then
          stations+='<circle class="map-pulse" r="10"/>'
        fi
        stations+='<circle class="map-dot" r="10"/>'
        if [[ "$a2" == "blocked" ]]; then
          stations+='<text class="map-mark" y="4">!</text>'
        fi
        stations+="$(printf '<text class="map-label" y="30">%s</text>' "$label_s")"
        stations+="$(printf '<title>%s</title></g>' "$title_s")"
        if [[ "$a2" == "in-flight" ]]; then
          # Baked at the segment midpoint; the inline script eases from->to.
          trains+="$(printf \
            '<g class="map-train" data-lane="%s" data-from="%s,%s" data-to="%s,%s" data-depart-epoch="%s" transform="translate(%s,%s)"><rect x="-14" y="-6" width="28" height="12" rx="6"/><circle class="map-win" cx="-6" cy="0" r="2"/><circle class="map-win" cx="0" cy="0" r="2"/><circle class="map-win" cx="6" cy="0" r="2"/></g>' \
            "$lane_s" "$a5" "$a6" "$a3" "$a4" "$a9" "$a7" "$a8")"
        fi
        ;;
      loop)
        loop_svg+="$(printf '<path class="map-loop" d="%s" marker-end="url(#map-arrow)"/>' "$a1")"
        loop_svg+="$(printf '<text class="map-loop-label" x="%s" y="%s">iterate</text>' "$a2" "$a3")"
        ;;
    esac
  done <<< "$geo"

  printf '<svg class="map-svg map-tier-%s" viewBox="0 0 960 %s" role="img" aria-label="Transit map of lane progress">' \
    "$(html_escape "$tier")" "$(html_escape "$g_h")"
  printf '<defs><marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="map-arrow-head"/></marker></defs>'
  printf '%s' "$tracks"
  printf '%s' "$loop_svg"
  printf '%s' "$stations"
  printf '<g class="map-gate map-gate-%s" transform="translate(%s,%s)">' \
    "$gate_state" "$g_gx" "$g_gy"
  printf '<circle class="map-gate-outer" r="20"/><circle class="map-gate-inner" r="10"/>'
  printf '<text class="map-label" y="40">gate</text>'
  printf '<title>%s</title></g>' "$(html_escape "gate: ${gate_state}")"
  printf '%s' "$trains"
  printf '<text class="map-badge" x="16" y="34" data-iteration="%s">Iteration %s</text>' \
    "$(html_escape "$g_iter")" "$(html_escape "$g_iter")"
  printf '</svg>'

  # Eases baked trains along their segment between 10s meta-refreshes.
  # Reduced motion or any failure leaves the static baked transforms in place.
  cat <<'MAPSCRIPT'
<script>
(function () {
  'use strict';
  try {
    if (window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    var trains = document.querySelectorAll('.map-train');
    if (!trains.length) { return; }
    var SEG = 120; // seconds of elapsed time per segment crossing
    function place(el) {
      var from = (el.getAttribute('data-from') || '').split(',');
      var to = (el.getAttribute('data-to') || '').split(',');
      var dep = parseInt(el.getAttribute('data-depart-epoch') || '0', 10);
      if (from.length !== 2 || to.length !== 2 || isNaN(dep)) { return; }
      var fx = parseFloat(from[0]); var fy = parseFloat(from[1]);
      var tx = parseFloat(to[0]); var ty = parseFloat(to[1]);
      var p = (Date.now() / 1000 - dep) / SEG;
      if (isNaN(p)) { p = 0; }
      if (p < 0) { p = 0; }
      // Clamped short of the destination; the next meta-refresh re-anchors.
      if (p > 0.92) { p = 0.92; }
      var x = Math.round(fx + (tx - fx) * p);
      var y = Math.round(fy + (ty - fy) * p);
      el.setAttribute('transform', 'translate(' + x + ',' + y + ')');
    }
    function frame() {
      var i;
      for (i = 0; i < trains.length; i++) { place(trains[i]); }
      window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  } catch (err) {
    return; // static baked transforms remain correct
  }
})();
</script>
MAPSCRIPT

  printf '</section>'
}
