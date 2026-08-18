#!/usr/bin/env bash
# lib/section-footer.sh - footer (command, input count, size, data-gap warnings).

section_footer() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local cmd="${WORKBENCH_INVOCATION:-cfn-workbench --slug ${slug}}"

  # Size is backfilled by render.sh after the file is written (the footer
  # renders before the document is assembled); emit a unique token.
  # cfn: literal token, not interpolation; do not html_escape. render.sh sed-fills it.
  local size="__WB_SIZE__"

  # Count inputs (manifests + VERIFY + results + bless + lane-reports + screenshots).
  local input_count=0
  local manifests_dir="$root/.cfn-cache/manifests"
  local screenshots_dir="$root/tests/screenshots"
  local lane_root="$root/tmp"
  [[ -d "$manifests_dir" ]] && input_count=$((input_count + $(ls "$manifests_dir"/cfn-*.json 2>/dev/null | wc -l)))
  [[ -f "$(plan_path "$root" "$slug" "VERIFY_${slug}.md")" ]] && input_count=$((input_count + 1))
  [[ -f "$(plan_path "$root" "$slug" "VERIFY_RESULTS_${slug}.json")" ]] && input_count=$((input_count + 1))
  [[ -f "$(plan_path "$root" "$slug" ".VERIFY_${slug}.bless.json")" ]] && input_count=$((input_count + 1))
  [[ -d "$screenshots_dir" ]] && input_count=$((input_count + $(ls "$screenshots_dir"/${slug}-iteration-*.png 2>/dev/null | wc -l)))
  [[ -d "$lane_root" ]] && input_count=$((input_count + $(ls "$lane_root"/lane-report-${slug}-*.json 2>/dev/null | wc -l)))
  input_count=$((input_count + $(ls /tmp/lane-report-${slug}-*.json 2>/dev/null | wc -l)))

  # Gaps footer detail list. The top-of-page gaps strip is emitted by render.sh
  # via gaps_strip; this is the separate, always-at-the-bottom detail block.
  local gaps_html=""
  local gap_count
  gap_count=$(get_gap_count)
  if [[ "$gap_count" -gt 0 ]]; then
    gaps_html='<div class="gap-list"><strong>Data gaps</strong><ul>'
    while IFS= read -r g; do
      [[ -z "$g" ]] && continue
      gaps_html+="<li>$(html_escape "$g")</li>"
    done < <(get_gaps)
    gaps_html+='</ul></div>'
  fi

  cat <<EOF
<footer class="card footer-meta" id="sec-gaps">
<span class="section-kicker">Generated</span>
<h2>Footer</h2>
<hr class="hr"/>
<div class="footer-meta">
  <div>Command: <code>$(html_escape "$cmd")</code></div>
  <div>HTML size: $size bytes</div>
  <div>Inputs scanned: $(html_escape "$input_count")</div>
  ${gaps_html}
</div>
<details class="legend">
  <summary>State key</summary>
  <div class="legend-grid">
    <div class="legend-item"><span class="state state-settled">settled</span> pass, completed, accepted, blessed</div>
    <div class="legend-item"><span class="state state-waiting">waiting</span> pending, in-progress, open, proposed</div>
    <div class="legend-item"><span class="state state-unknown">unknown</span> unknown, rejected, superseded</div>
    <div class="legend-item"><span class="state state-action">action</span> fail</div>
    <div class="legend-item"><span class="state state-fatal">fatal</span> blocked, aborted</div>
  </div>
</details>
</footer>
EOF
}
