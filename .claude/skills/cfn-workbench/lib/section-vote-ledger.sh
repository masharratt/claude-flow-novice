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
    cat <<'EOF'
<section class="card" id="sec-votes">
<span class="section-kicker">Review</span>
<h2>Vote ledger</h2>
<hr class="hr"/>
<p class="empty">No review suggestions.</p>
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
    cat <<'EOF'
<section class="card" id="sec-votes">
<span class="section-kicker">Review</span>
<h2>Vote ledger</h2>
<hr class="hr"/>
<p class="empty">No review suggestions.</p>
</section>
EOF
    return
  fi

  # jq emits one TSV row per suggestion; bash reads each row and builds the
  # <tr>, routing EVERY cell through html_escape and the status cell through
  # state_label. No escaping happens inside jq: the prior local esc() missed
  # single-quote; @tsv + html_escape closes that gap.
  printf '<section class="card" id="sec-votes">\n'
  printf '<span class="section-kicker">Review</span>\n'
  printf '<h2>Vote ledger</h2>\n'
  printf '<hr class="hr"/>\n'
  printf '<div class="table-wrap"><table>\n'
  printf '<thead><tr><th>ID</th><th>Category</th><th>Suggestion</th><th>Status</th></tr></thead>\n'
  printf '<tbody>\n'

  printf '%s' "$merged" | jq -r '
    sort_by(.id) | .[] |
    [ (.id // "" | tostring),
      (.category // "" | tostring),
      ((.one_liner // .description // "") | tostring),
      (.status // "" | tostring)
    ] | @tsv
  ' | while IFS=$'\t' read -r id category suggestion status; do
    printf '<tr>'
    printf '<td>%s</td>' "$(html_escape "$id")"
    printf '<td>%s</td>' "$(html_escape "$category")"
    printf '<td>%s</td>' "$(html_escape "$suggestion")"
    printf '<td>%s</td>' "$(state_label "$status")"
    printf '</tr>\n'
  done

  printf '</tbody></table></div>\n'
  printf '</section>\n'
}
