#!/bin/bash
# lib/section-footer.sh - footer (command, input count, size, data-gap warnings).

section_footer() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local out="${WORKBENCH_OUT:-?}"
  local cmd="${WORKBENCH_INVOCATION:-cfn-workbench --slug ${slug}}"

  # Size is backfilled by render.sh after the file is written (the footer
  # renders before the document is assembled); emit a unique token.
  local size="__WB_SIZE__"

  # Count inputs (manifests + VERIFY + results + bless + lane-reports + screenshots).
  local input_count=0
  local manifests_dir="$root/.cfn-cache/manifests"
  local screenshots_dir="$root/tests/screenshots"
  local lane_root="$root/tmp"
  [[ -d "$manifests_dir" ]] && input_count=$((input_count + $(ls "$manifests_dir"/cfn-*.json 2>/dev/null | wc -l)))
  [[ -f "$root/planning/VERIFY_${slug}.md" ]] && input_count=$((input_count + 1))
  [[ -f "$root/planning/VERIFY_RESULTS_${slug}.json" ]] && input_count=$((input_count + 1))
  [[ -f "$root/planning/.VERIFY_${slug}.bless.json" ]] && input_count=$((input_count + 1))
  [[ -d "$screenshots_dir" ]] && input_count=$((input_count + $(ls "$screenshots_dir"/${slug}-iteration-*.png 2>/dev/null | wc -l)))
  [[ -d "$lane_root" ]] && input_count=$((input_count + $(ls "$lane_root"/lane-report-${slug}-*.json 2>/dev/null | wc -l)))
  input_count=$((input_count + $(ls /tmp/lane-report-${slug}-*.json 2>/dev/null | wc -l)))

  # Gaps
  local gaps_html=""
  local gap_count
  gap_count=$(get_gap_count)
  if [[ "$gap_count" -gt 0 ]]; then
    gaps_html="<div class=\"gap-list\"><strong>Data gaps (${gap_count}):</strong><ul>"
    while IFS= read -r g; do
      [[ -z "$g" ]] && continue
      gaps_html+="<li>$(html_escape "$g")</li>"
    done < <(get_gaps)
    gaps_html+="</ul></div>"
  else
    gaps_html="<div class=\"note\">No data gaps. All expected sources were found.</div>"
  fi

  cat <<EOF
<footer class="card" id="sec-gaps">
<h2>Footer</h2>
<div class="footer-meta">
  <div>Command: <code>$(html_escape "$cmd")</code></div>
  <div>Inputs read: ${input_count}</div>
  <div>HTML size: $size bytes</div>
  <div>Out: <code>$(html_escape "$(display_path "$out")")</code></div>
</div>
${gaps_html}
</footer>
EOF
}
