#!/bin/bash
# lib/section-ac-table.sh - AC table from planning/VERIFY_<slug>.md.
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

section_ac_table() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local verify_md="$root/planning/VERIFY_${slug}.md"
  local results_json="$root/planning/VERIFY_RESULTS_${slug}.json"

  if [[ ! -f "$verify_md" ]]; then
    record_gap "VERIFY_${slug}.md (AC table source)"
    cat <<EOF
<section class="card" id="sec-ac">
<h2>Acceptance Criteria</h2>
<p class="empty">No VERIFY doc found at planning/VERIFY_${slug}.md.</p>
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
<h2>Acceptance Criteria</h2>
<p class="empty">No markdown AC table found in $(display_path "$verify_md").</p>
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

  # Build rows
  local rows
  rows=$(printf '%s' "$merged" | jq -r '
    def esc: gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;") | gsub("\""; "&quot;");
    .[] |
    "<tr>" +
      "<td class=\"mono\">" + (.id | tostring | esc) + "</td>" +
      "<td>" + (.check | esc) + "</td>" +
      "<td>" + (.kind | esc) + "</td>" +
      "<td><span class=\"pill pill-" + (.status | tostring) + "\">" + (.status | tostring | esc) + "</span></td>" +
      "<td>" + (.evidence | if . == "" then "<span class=\"empty\">-</span>" else esc end) + "</td>" +
      "<td>" + (.reference | if . == "" or . == "-" then "<span class=\"empty\">-</span>" else esc end) + "</td>" +
    "</tr>"
  ')

  cat <<EOF
<section class="card" id="sec-ac">
<h2>Acceptance Criteria (${pass_count}/${total} pass, ${fail_count} fail)</h2>
<p class="note">Parsed by header name from $(display_path "$verify_md"). Reference column shows "-" when the source table omits it.</p>
<div class="table-wrap">
<table>
  <thead><tr><th>ID</th><th>Check</th><th>Kind</th><th>Status</th><th>Evidence</th><th>Reference</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</div>
</section>
EOF
}
