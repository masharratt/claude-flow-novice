#!/bin/bash
# lib/section-ac-table.sh - AC table from planning/<slug>/VERIFY_<slug>.md.
#
# F3 (REVIEW FINDING): workbench is the FIRST consumer of the markdown AC table.
# Headers vary across the repo (3/5/8/9 cols). This parser reads by HEADER NAME,
# not column index, and tolerates a missing "reference" column. A positional
# parser that assumes column N is "reference" is a FAIL.
#
# Strategy:
#   1. Find the first contiguous markdown table (lines starting with "|").
#   2. Parse the header row to build a name -> index map (lowercased, normalized).
#   3. Skip the separator row (|---|---|).
#   4. For each data row, build a JSON object keyed by header name.
#   5. Merge with the embedded manifest JSON (last ```json block in the doc)
#      and the optional VERIFY_RESULTS_<slug>.json. The merged set drives display.
#
# Display columns (consistent regardless of source): id, check, kind, pass,
# status (from embedded/results JSON or derived from pass), evidence, reference.
# When the source has no "reference" column, the reference cell renders as "-".
#
# XSS safety: jq emits rows as TSV (@tsv); bash reads fields with
# IFS=$'\t' read and routes EVERY cell through html_escape (the canonical
# escaper, handles single-quote) and status through state_label. jq does no
# HTML escaping, closing the old divergence where a local jq esc missed
# single-quote. Payloads like <script>alert(1)</script> stay escaped.

section_ac_table() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local verify_md results_json
  verify_md="$(plan_path "$root" "$slug" "VERIFY_${slug}.md")" || true
  results_json="$(plan_path "$root" "$slug" "VERIFY_RESULTS_${slug}.json")" || true

  if [[ ! -f "$verify_md" ]]; then
    record_gap "VERIFY_${slug}.md (AC table source)"
    # Show the path root-relative: $root can be a mktemp scratch dir, and the page
    # must never leak one (same rule as the recorded invocation in render.sh).
    local verify_display="${verify_md#"$root"/}"
    cat <<EOF
<section class="card" id="sec-ac">
<span class="section-kicker">Definition of done</span>
<h2>Acceptance criteria</h2>
<hr class="hr"/>
<p class="empty">No VERIFY doc found at $(html_escape "${verify_display}").</p>
</section>
EOF
    return
  fi

  # Parse the markdown AC table into a JSON array via awk.
  # Each row is an object keyed by lowercased+normalized header name.
  local md_table_json
  md_table_json=$(awk '
    function norm(s,   out) {
      out = tolower(s)
      gsub(/[^a-z0-9_]+/, "_", out)
      gsub(/^_+|_+$/, "", out)
      return out
    }
    function trim(s) { gsub(/^[[:space:]]+|[[:space:]]+$/, "", s); gsub(/\r/, "", s); return s }
    # JSON-escape a value by walking it char-by-char so we never trip on gsub
    # backslash-quote semantics (which differ between gawk and mawk).
    function jesc(s,   r, i, c, n) {
      n = length(s); r = ""
      for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        if (c == "\\") r = r "\\\\"       # literal \ in JSON
        else if (c == "\"") r = r "\\\""   # literal " in JSON
        else r = r c
      }
      return r
    }
    function split_row(line,   n, i) {
      n = split(line, cells, /[|]/)
      # strip leading/trailing empty cells from leading/trailing pipe
      while (n > 0 && cells[1] == "") { for (i = 2; i <= n; i++) cells[i-1] = cells[i]; n-- }
      while (n > 0 && cells[n] == "") { n-- }
      cnt = n
    }
    BEGIN { in_table = 0; hdr_count = 0; first_row = 1; printf "[" }
    /^\|/ {
      if (in_table == 0) {
        # header row
        split_row($0)
        hdr_count = cnt
        for (i = 1; i <= cnt; i++) headers[i] = norm(trim(cells[i]))
        in_table = 1
        next
      }
      if (in_table == 1) {
        # expected separator row |---|---|: detect and skip
        split_row($0)
        is_sep = 1
        if (cnt != hdr_count) { is_sep = 0 }
        for (i = 1; i <= cnt; i++) {
          c = trim(cells[i])
          if (c !~ /^:?-+:?$/) { is_sep = 0; break }
        }
        if (is_sep) { in_table = 2; next }
        # otherwise treat as data row
        in_table = 2
      }
      # data row (in_table == 2)
      split_row($0)
      if (!first_row) printf ","
      first_row = 0
      printf "{"
      for (i = 1; i <= hdr_count; i++) {
        v = (i <= cnt) ? trim(cells[i]) : ""
        printf "\"%s\":\"%s\"", headers[i], jesc(v)
        if (i < hdr_count) printf ","
      }
      printf "}"
      next
    }
    # blank or non-table line ends the table
    in_table > 0 && !/^\|/ { in_table = -1 }
    END { printf "]" }
  ' "$verify_md")

  if [[ -z "$md_table_json" ]] || [[ "$md_table_json" == "[]" ]]; then
    record_gap "AC table in $(display_path "$verify_md") (no rows parsed)"
    cat <<EOF
<section class="card" id="sec-ac">
<span class="section-kicker">Definition of done</span>
<h2>Acceptance criteria</h2>
<hr class="hr"/>
<p class="empty">No markdown AC table found in $(html_escape "$(display_path "$verify_md")").</p>
</section>
EOF
    return
  fi

  # Extract the LAST fenced ```json block from the doc (embedded manifest).
  local embedded_json
  embedded_json=$(awk '
    /^```json[[:space:]]*$/ { in_block = 1; buf = ""; next }
    /^```[[:space:]]*$/ && in_block { in_block = 0; last = buf; next }
    in_block { buf = buf $0 "\n" }
    END { if (last != "") print last }
  ' "$verify_md")

  # Normalize the embedded JSON to a single line/null so --argjson is robust.
  local embedded_data="null"
  if [[ -n "$embedded_json" ]]; then
    embedded_data="$(printf '%s' "$embedded_json" | jq '.' 2>/dev/null || printf 'null')"
    [[ -z "$embedded_data" ]] && embedded_data="null"
  fi

  # Normalize the results JSON the same way.
  local results_data="null"
  if [[ -f "$results_json" ]]; then
    results_data="$(jq '.' "$results_json" 2>/dev/null || printf 'null')"
    [[ -z "$results_data" ]] && results_data="null"
  else
    record_gap "VERIFY_RESULTS_${slug}.json (per-AC status/evidence)"
  fi

  # Merge: markdown rows as the spine; embedded JSON (acs[]) and results JSON
  # provide per-AC status/evidence overrides keyed by id.
  local merged
  merged=$(jq -n \
    --argjson md "$md_table_json" \
    --argjson emb "$embedded_data" \
    --argjson res "$results_data" \
    '
    ($emb | if (. and .acs) then (.acs | map({ key: (.id | tostring | ascii_downcase), value: . }) | from_entries) else {} end) as $emb_map
    | ($res | if (. and .acs) then (.acs | map({ key: (.id | tostring | ascii_downcase), value: . }) | from_entries) else {} end) as $res_map
    | $md | map(
        . as $row
        | ($row.id | tostring | ascii_downcase) as $key
        | ($emb_map[$key] // {}) as $e
        | ($res_map[$key] // {}) as $r
        | {
            id: ($row.id // $e.id // $r.id // "?"),
            check: ($row.check // ""),
            kind: ($row.kind // ""),
            pass: ($row.pass // ""),
            status: ($r.status // $e.status // (if ($row.pass | ascii_downcase) == "yes" then "pass" else "fail" end)),
            evidence: ($r.evidence // $e.evidence // ""),
            reference: ($row.reference // "-")
          }
      )
    ')

  # Count totals
  local total pass_count fail_count
  total=$(printf '%s' "$merged" | jq 'length')
  pass_count=$(printf '%s' "$merged" | jq '[.[] | select(.status == "pass")] | length')
  fail_count=$(printf '%s' "$merged" | jq '[.[] | select(.status == "fail")] | length')

  # Emit rows: jq outputs TSV (raw values, @tsv-escaped), bash reads fields and
  # builds each <tr> with html_escape on every cell and state_label on status.
  # This makes html_escape the single escaper (handles single-quote, which the
  # old jq-local esc did not), so XSS payloads stay escaped.
  printf '<section class="card" id="sec-ac">'
  printf '<span class="section-kicker">Definition of done</span>'
  printf '<h2>Acceptance criteria</h2>'
  printf '<hr class="hr"/>'
  printf '<p class="note">Parsed by header name from %s. %s/%s pass, %s fail. Reference column shows "-" when the source table omits it.</p>' \
    "$(html_escape "$(display_path "$verify_md")")" "$pass_count" "$total" "$fail_count"
  printf '<div class="table-wrap"><table class="ac-table">'
  printf '<thead><tr>'
  printf '<th>%s</th>' "$(html_escape 'ID')"
  printf '<th>%s</th>' "$(html_escape 'Check')"
  printf '<th>%s</th>' "$(html_escape 'Kind')"
  printf '<th>%s</th>' "$(html_escape 'Status')"
  printf '<th>%s</th>' "$(html_escape 'Evidence')"
  printf '<th>%s</th>' "$(html_escape 'Reference')"
  printf '</tr></thead>'
  printf '<tbody>'
  printf '%s' "$merged" | jq -r '
    .[] | [(.id | tostring), (.check | tostring), (.kind | tostring),
           (.status | tostring), (.evidence | tostring), (.reference | tostring)
          ] | @tsv
  ' | while IFS=$'\t' read -r id check kind status evidence reference; do
    [[ -z "$id" && -z "$check" && -z "$kind" && -z "$status" && -z "$evidence" && -z "$reference" ]] && continue
    printf '<tr>'
    printf '<td class="mono">%s</td>' "$(html_escape "$id")"
    printf '<td>%s</td>' "$(html_escape "$check")"
    printf '<td>%s</td>' "$(html_escape "$kind")"
    printf '<td>%s</td>' "$(state_label "$status")"
    if [[ -z "$evidence" ]]; then
      printf '<td><span class="empty">-</span></td>'
    else
      printf '<td>%s</td>' "$(html_escape "$evidence")"
    fi
    if [[ -z "$reference" || "$reference" == "-" ]]; then
      printf '<td><span class="empty">-</span></td>'
    else
      printf '<td>%s</td>' "$(html_escape "$reference")"
    fi
    printf '</tr>'
  done
  printf '</tbody>'
  printf '</table></div>'
  printf '</section>'
}
