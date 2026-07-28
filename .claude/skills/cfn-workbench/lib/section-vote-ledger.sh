#!/bin/bash
# lib/section-vote-ledger.sh - vote ledger (every suggestion + vote outcome).
#
# Reads all manifests in .cfn-cache/manifests/cfn-*.json and emits one row per
# suggestion with the LATEST known status (later manifests override earlier).
# Status pill reflects: accepted / rejected / open / unknown.

section_vote_ledger() {
  local root="${WORKBENCH_ROOT:-.}"
  local manifests_dir="$root/.cfn-cache/manifests"

  if [[ ! -d "$manifests_dir" ]] || ! ls "$manifests_dir"/cfn-*.json >/dev/null 2>&1; then
    record_gap "manifests dir (vote ledger empty)"
    cat <<EOF
<section class="card" id="sec-votes">
<h2>Vote Ledger</h2>
<p class="empty">No suggestion manifests found in .cfn-cache/manifests/.</p>
</section>
EOF
    return
  fi

  # Merge all suggestions; later files override fields for the same id.
  # Each suggestion is annotated with its parent manifest's .source first,
  # then grouped by id and reduced with object-merge (*).
  local merged
  merged=$(jq -s '
    [ .[] | .source as $src | (.suggestions // []) | .[] | . + {source: $src} ]
    | group_by(.id)
    | map(reduce .[] as $s ({}; . * $s))
  ' "$manifests_dir"/cfn-*.json)

  local total
  total=$(printf '%s' "$merged" | jq 'length')
  if [[ "$total" == "0" ]]; then
    cat <<EOF
<section class="card" id="sec-votes">
<h2>Vote Ledger</h2>
<p class="empty">No suggestions across manifests.</p>
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
      "<td>" + (.category | esc) + "</td>" +
      "<td>" + (.impact | esc) + "/" + (.effort | esc) + "</td>" +
      "<td><span class=\"pill pill-" + (.status | tostring | esc) + "\">" + (.status | tostring | esc) + "</span></td>" +
      "<td class=\"mono\">" + (.source | esc) + "</td>" +
    "</tr>"
  ')

  cat <<EOF
<section class="card" id="sec-votes">
<h2>Vote Ledger (${total})</h2>
<p class="note">One row per suggestion id, status reflects the latest manifest that touched it.</p>
<div class="table-wrap">
<table>
  <thead><tr><th>ID</th><th>Title</th><th>Category</th><th>Impact/Effort</th><th>Status</th><th>Source</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</div>
</section>
EOF
}
