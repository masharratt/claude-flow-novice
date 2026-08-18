#!/usr/bin/env bash
# lib/section-events.sh - live events feed for cfn-workbench.
#
# Reads BOTH /tmp/cfn-events-<slug>.jsonl and <root>/tmp/cfn-events-<slug>.jsonl
# (concat, sort by ts, newest first). Emits <section id="sec-events">: table
# Time | Event | Lane | Phase | Detail, capped at 30 rows with an overflow
# note. Malformed JSONL lines are skipped silently. No events file at all is a
# data gap (the source is expected once the orchestrator wiring runs).
#
# _wb_events_json / _wb_events_file_exists are also used by section_roster
# (lib/section-roster.sh) to derive lane_spawned/lane_landed status. Shared
# here since this is the events source of truth; call order is safe because
# render.sh sources both libs before invoking either section function.

# _wb_events_file_exists SLUG ROOT
# True if either events source file exists.
_wb_events_file_exists() {
  local slug="$1" root="$2"
  [[ -f "/tmp/cfn-events-${slug}.jsonl" || -f "${root}/tmp/cfn-events-${slug}.jsonl" ]]
}

# _wb_events_json SLUG ROOT
# Emits a compact JSON array (unsorted) of every valid JSON line across both
# event source files on stdout. Malformed lines are dropped silently.
#
# render.sh runs with `set -euo pipefail`, inherited by every sourced function.
# Under pipefail, a pipeline's exit status is the *rightmost non-zero* exit
# among ALL stages, not just the last one - and the `while read` stage below
# reliably exits 1 at EOF even when every line was consumed successfully. A
# trailing `jq ... || printf '[]'` on that pipeline would misfire on that
# benign 1, appending a second, spurious `[]` value after the real array
# (jq then emits two `length` results for one call). Capture into a variable
# first (no `||` on the pipeline itself) and only fall back on an empty result.
_wb_events_json() {
  local slug="$1" root="$2"
  local f1="/tmp/cfn-events-${slug}.jsonl"
  local f2="${root}/tmp/cfn-events-${slug}.jsonl"
  local out
  out=$( { [[ -f "$f1" ]] && cat "$f1"; [[ -f "$f2" ]] && cat "$f2"; } 2>/dev/null \
    | while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        printf '%s' "$line" | jq -e -c '.' >/dev/null 2>&1 && printf '%s\n' "$line"
      done \
    | jq -s -c '.' 2>/dev/null )
  if [[ -z "$out" ]]; then
    printf '[]'
  else
    printf '%s' "$out"
  fi
}

# section_events - emit the Events feed section HTML on stdout.
section_events() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"

  printf '<section class="card" id="sec-events">'
  printf '<span class="section-kicker">Live</span>'
  printf '<h2>Events</h2>'
  printf '<hr class="hr"/>'

  if [[ -z "$slug" ]] || ! _wb_events_file_exists "$slug" "$root"; then
    record_gap "events feed (no cfn-events-${slug}.jsonl)"
    printf '<p class="empty">No events recorded for this run.</p>'
    printf '</section>'
    return
  fi

  local merged total
  merged=$(_wb_events_json "$slug" "$root" | jq -c 'sort_by(.ts // "") | reverse' 2>/dev/null)
  [[ -z "$merged" ]] && merged='[]'
  total=$(printf '%s' "$merged" | jq 'length' 2>/dev/null || echo 0)

  if [[ -z "$total" || "$total" -eq 0 ]]; then
    printf '<p class="empty">No events recorded for this run.</p>'
    printf '</section>'
    return
  fi

  local overflow=0
  [[ "$total" -gt 30 ]] && overflow=$((total - 30))

  printf '<div class="table-wrap"><table>'
  printf '<thead><tr><th>Time</th><th>Event</th><th>Lane</th><th>Phase</th><th>Detail</th></tr></thead>'
  printf '<tbody>'
  # jq emits one TSV row per event (newest 30 only); bash builds each <tr>,
  # routing every cell through html_escape (same pattern as section_vote_ledger).
  printf '%s' "$merged" | jq -r '.[:30][] | [
    (.ts // ""),
    (.event // ""),
    (.lane // ""),
    (.phase // ""),
    (.detail // "")
  ] | @tsv' | while IFS=$'\t' read -r ts event lane phase detail; do
    printf '<tr>'
    printf '<td>%s</td>' "$(html_escape "$ts")"
    printf '<td>%s</td>' "$(html_escape "$event")"
    printf '<td>%s</td>' "$(html_escape "$lane")"
    printf '<td>%s</td>' "$(html_escape "$phase")"
    printf '<td>%s</td>' "$(html_escape "$detail")"
    printf '</tr>'
  done
  printf '</tbody></table></div>'

  [[ "$overflow" -gt 0 ]] && printf '<p class="note">%s earlier events not shown</p>' "$(html_escape "$overflow")"

  printf '</section>'
}
