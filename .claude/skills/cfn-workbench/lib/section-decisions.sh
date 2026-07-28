#!/bin/bash
# lib/section-decisions.sh - Decisions ledger section for cfn-workbench.
#
# Renders decisions recorded for this run from a per-run ledger file:
#   <root>/planning/.VERIFY_<slug>.decisions.json
# Field names mirror the decision-log `decisions` table plus two run-scoped
# fields (actor, iteration). A missing file or empty array is a normal empty
# state, NOT a data gap (the source is fully optional).

# section_decisions - emit the Decisions section HTML on stdout.
section_decisions() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-}"
  local ledger="$root/planning/.VERIFY_${slug}.decisions.json"

  printf '<section class="card" id="sec-decisions">'
  printf '<span class="section-kicker">Run log</span>'
  printf '<h2>Decisions</h2>'
  printf '<p class="section-hint">Choices made during this run, by the human or the AI.</p>'
  printf '<hr class="hr"/>'

  if [[ -z "$slug" || ! -f "$ledger" ]] \
     || ! jq -e '.decisions | type == "array"' "$ledger" >/dev/null 2>&1; then
    printf '<p class="empty">No decisions logged for this run.</p>'
    printf '</section>'
    return
  fi

  local count
  count=$(jq '.decisions | length' "$ledger")
  if [[ -z "$count" || "$count" -eq 0 ]]; then
    printf '<p class="empty">No decisions logged for this run.</p>'
    printf '</section>'
    return
  fi

  printf '<div class="decisions-list">'
  # jq emits one TSV record per decision; bash builds each card with html_escape
  # (every cell) so untrusted rationale/alternatives text cannot break out.
  # Fields: id, actor, title, chosen, rationale, alternatives, iteration, timestamp, status.
  jq -r '.decisions[] | [
    (.id // ""),
    (.actor // ""),
    (.title // ""),
    (.chosen // ""),
    (.rationale // ""),
    (.alternatives // ""),
    (if (.iteration|type) == "number" then (.iteration|tostring) else "" end),
    (.timestamp // ""),
    (.status // "")
  ] | @tsv' "$ledger" | while IFS=$'\t' read -r id actor title chosen rationale alternatives iteration timestamp status; do
    [[ -z "$id" && -z "$title" ]] && continue

    # status -> state_label bucket (proposed=waiting, accepted=settled, superseded=unknown).
    local status_html=""
    [[ -n "$status" ]] && status_html="$(state_label "$status")"

    # actor marker (human | ai; unknown falls to the ai-style neutral chip).
    local actor_l actor_class actor_text
    actor_l="$(printf '%s' "$actor" | tr '[:upper:]' '[:lower:]')"
    case "$actor_l" in
      human) actor_class="actor-human" ;;
      *)     actor_class="actor-ai" ;;
    esac
    actor_text="$actor"; [[ -z "$actor_text" ]] && actor_text="unknown"

    # timestamp display: datetime attr carries the full value, show date + time.
    local ts_disp=""
    if [[ -n "$timestamp" ]]; then
      ts_disp="$(printf '%s' "$timestamp" | cut -c1-16 | tr 'T' ' ')"
      ts_disp="<time datetime=\"$(html_escape "$timestamp")\">$(html_escape "$ts_disp")</time>"
    fi

    printf '<div class="decision-card">'
    printf '<div class="decision-id">%s</div>' "$(html_escape "$id")"
    printf '<span class="actor %s">%s</span>' "$actor_class" "$(html_escape "$actor_text")"
    printf '<div class="decision-title">%s</div>' "$(html_escape "$title")"
    [[ -n "$chosen" ]] && printf '<div class="decision-chosen">%s</div>' "$(html_escape "$chosen")"
    [[ -n "$rationale" ]] && printf '<div class="decision-rationale">%s</div>' "$(html_escape "$rationale")"
    if [[ -n "$iteration" || -n "$ts_disp" || -n "$status_html" ]]; then
      printf '<div class="decision-meta">'
      [[ -n "$iteration" ]] && printf '<span>iter %s</span> ' "$(html_escape "$iteration")"
      [[ -n "$ts_disp" ]] && printf '%s ' "$ts_disp"
      [[ -n "$status_html" ]] && printf '%s' "$status_html"
      printf '</div>'
    fi
    printf '</div>'
  done
  printf '</div>'
  printf '</section>'
}
