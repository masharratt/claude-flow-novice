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
    cat <<'EOF'
<section class="card" id="sec-debt">
<span class="section-kicker">Tech debt</span>
<h2>Tech-debt ledger</h2>
<hr class="hr"/>
<p class="empty">No tech-debt items tagged.</p>
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
    cat <<'EOF'
<section class="card" id="sec-debt">
<span class="section-kicker">Tech debt</span>
<h2>Tech-debt ledger</h2>
<hr class="hr"/>
<p class="empty">No tech-debt items tagged.</p>
</section>
EOF
    return
  fi

  # Emit rows as TSV; bash reads them back and builds each <tr> so every cell
  # routes through html_escape (and status through state_label). jq no longer
  # does HTML escaping here.
  local rows_tsv
  rows_tsv=$(printf '%s' "$merged" | jq -r '
    sort_by(.id) | .[] |
    [
      (.id | tostring),
      (.tag // ""),
      (.title // .one_liner // ""),
      ((.status // "open") | tostring)
    ] | @tsv
  ')

  local id category item status row_html=""
  while IFS=$'\t' read -r id category item status; do
    [[ -z "$id" ]] && continue
    row_html+=$(printf '<tr><td class="mono">%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' \
      "$(html_escape "$id")" \
      "$(html_escape "$category")" \
      "$(html_escape "$item")" \
      "$(state_label "$status")")
  done <<< "$rows_tsv"

  cat <<EOF
<section class="card" id="sec-debt">
<span class="section-kicker">Tech debt</span>
<h2>Tech-debt ledger</h2>
<hr class="hr"/>
<div class="table-wrap">
<table>
  <thead><tr><th>ID</th><th>Category</th><th>Item</th><th>Status</th></tr></thead>
  <tbody>
${row_html}
  </tbody>
</table>
</div>
</section>
EOF
}
