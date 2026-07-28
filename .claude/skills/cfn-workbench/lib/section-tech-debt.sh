#!/bin/bash
# lib/section-tech-debt.sh - tech-debt ledger (suggestions with category=tech-debt
# or tag containing cfn:).
#
# This is a thin view over the suggestion manifests. A future revision can swap
# in the cfn-tech-debt skill's own ledger as a data source; for now we derive
# from manifests so the workbench is self-contained.

section_tech_debt() {
  local root="${WORKBENCH_ROOT:-.}"
  local manifests_dir="$root/.cfn-cache/manifests"

  if [[ ! -d "$manifests_dir" ]] || ! ls "$manifests_dir"/cfn-*.json >/dev/null 2>&1; then
    record_gap "manifests dir (tech-debt ledger empty)"
    cat <<EOF
<section class="card">
<h2>Tech-Debt Ledger</h2>
<p class="empty">No manifests to scan.</p>
</section>
EOF
    return
  fi

  local merged
  merged=$(jq -s '
    [ .[] | (.suggestions // [])[] ]
    | unique_by(.id)
    | map(select((.category | ascii_downcase) == "tech-debt" or ((.tag // "") | test("cfn[:\\-]"; "i"))))
  ' "$manifests_dir"/cfn-*.json)

  local total
  total=$(printf '%s' "$merged" | jq 'length')
  if [[ "$total" == "0" ]]; then
    cat <<EOF
<section class="card">
<h2>Tech-Debt Ledger</h2>
<p class="empty">No tech-debt suggestions (category=tech-debt or tag matches cfn:). </p>
</section>
EOF
    return
  fi

  local rows
  rows=$(printf '%s' "$merged" | jq -r '
    def esc: gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;") | gsub("\""; "&quot;");
    sort_by(.id) | .[] |
    "<tr>" +
      "<td class=\"mono\">" + (.id | tostring | esc) + "</td>" +
      "<td>" + (.title | if . == "" then (.one_liner | esc) else esc end) + "</td>" +
      "<td>" + (.tag | esc) + "</td>" +
      "<td>" + ((.files // []) | join(", ") | esc) + "</td>" +
      "<td><span class=\"pill pill-" + ((.status // "open") | tostring | esc) + "\">" + ((.status // "open") | tostring | esc) + "</span></td>" +
    "</tr>"
  ')

  cat <<EOF
<section class="card">
<h2>Tech-Debt Ledger (${total})</h2>
<p class="note">Derived from suggestion manifests (category=tech-debt or tag matches cfn:). When the cfn-tech-debt skill publishes its own ledger, this section can read it directly.</p>
<table>
  <thead><tr><th>ID</th><th>Title</th><th>Tag</th><th>Files</th><th>Status</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</section>
EOF
}
