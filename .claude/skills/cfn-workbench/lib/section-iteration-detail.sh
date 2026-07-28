#!/bin/bash
# lib/section-iteration-detail.sh - per-iteration detail: lanes, test summary, screenshot grid, gate events.
#
# Reuses the same iteration-discovery logic as timeline. For each iteration:
#   - lane rows from lane-reports (pass_rate, tests_passed, tests_failed)
#   - test-output summary line(s) from test-output-<slug>-<iter>.txt
#   - screenshot grid (global cap from --max-screenshots, disabled by --no-screenshots)
#   - gate events list (one bullet per manifest in this iteration with status + source)
#
# The screenshot cap is GLOBAL across all iterations: if the total number of
# screenshots for the slug exceeds --max-screenshots, the first N are embedded
# (in iteration order) and the rest are listed in a single overflow card.

section_iteration_detail() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local manifests_dir="$root/.cfn-cache/manifests"
  local screenshots_dir="$root/tests/screenshots"
  local lane_root="$root/tmp"
  local max="${WORKBENCH_MAX_SCREENSHOTS:-50}"
  local no_shx="${WORKBENCH_NO_SCREENSHOTS:-0}"

  # Collect iterations (union across sources, numeric sort).
  local -A seen=()
  local iters=""
  if [[ -d "$manifests_dir" ]]; then
    while IFS= read -r m; do
      local base iter
      base="$(basename "$m")"
      iter="$(printf '%s' "$base" | sed -E 's/.*-([0-9]+)\.json$/\1/')"
      if [[ "$iter" =~ ^[0-9]+$ ]] && [[ -z "${seen[$iter]:-}" ]]; then
        seen[$iter]=1; iters="$iters $iter"
      fi
    done < <(ls "$manifests_dir"/cfn-*.json 2>/dev/null)
  fi
  if [[ -d "$screenshots_dir" ]]; then
    while IFS= read -r s; do
      [[ -z "$s" ]] && continue
      local iter
      iter="$(printf '%s' "$(basename "$s")" | sed -E "s/^${slug}-iteration-//; s/\\.png\$//")"
      if [[ "$iter" =~ ^[0-9]+$ ]] && [[ -z "${seen[$iter]:-}" ]]; then
        seen[$iter]=1; iters="$iters $iter"
      fi
    done < <(ls "$screenshots_dir"/${slug}-iteration-*.png 2>/dev/null)
  fi
  local lane_files=""
  [[ -d "$lane_root" ]] && lane_files="$(ls "$lane_root"/lane-report-${slug}-*.json 2>/dev/null || true)"
  local runtime_lanes="$(ls /tmp/lane-report-${slug}-*.json 2>/dev/null || true)"
  for f in $runtime_lanes; do
    [[ -f "$f" ]] && lane_files="$lane_files $f"
  done
  for f in $lane_files; do
    [[ -z "$f" ]] && continue
    [[ -f "$f" ]] || continue
    local iter
    iter="$(jq -r '.iteration // empty' "$f" 2>/dev/null)"
    if [[ "$iter" =~ ^[0-9]+$ ]] && [[ -z "${seen[$iter]:-}" ]]; then
      seen[$iter]=1; iters="$iters $iter"
    fi
  done

  local sorted
  sorted=$(printf '%s\n' $iters | sort -n | tr '\n' ' ')

  if [[ -z "${sorted// /}" ]]; then
    cat <<EOF
<section class="card">
<h2>Per-Iteration Detail</h2>
<p class="empty">No iterations detected.</p>
</section>
EOF
    return
  fi

  # Pre-compute the global screenshot budget.
  # show_set: associative lookup of paths that fit within the cap.
  # overflow_paths / overflow_count: the rest.
  local -A show_set=()
  local overflow_paths=""
  local overflow_count=0
  local total_shx=0
  if [[ "$no_shx" == "0" ]] && [[ -d "$screenshots_dir" ]]; then
    local i=0
    while IFS= read -r s; do
      [[ -z "$s" ]] && continue
      total_shx=$((total_shx+1))
      if [[ $i -lt $max ]]; then
        show_set["$s"]=1
      else
        overflow_paths+="$(basename "$s") "
        overflow_count=$((overflow_count+1))
      fi
      i=$((i+1))
    done < <(ls "$screenshots_dir"/${slug}-iteration-*.png 2>/dev/null | sort)
  fi

  # Publish the allowlist to children via env (space-separated paths).
  # cfn: env-string passing, replace with a proper include/exclude dataclass if
  # the iteration block grows more parameters.
  local show_paths=""
  for k in "${!show_set[@]}"; do show_paths+="$k "; done
  export WORKBENCH_SHX_SHOW="$show_paths"

  local body=""
  for iter in $sorted; do
    [[ -z "$iter" ]] && continue
    body+="$(render_iteration_block "$iter")"
  done

  # After iterations, render a single overflow card if any screenshots were capped.
  local overflow_html=""
  if [[ "$no_shx" == "0" && $overflow_count -gt 0 ]]; then
    overflow_html="$(cat <<EOF
<div class="card" style="background:#fffbeb;border:1px solid #fbd38d;">
  <h3 style="margin:0 0 4px;font-size:15px;color:#744210;">${overflow_count} more screenshot(s) omitted (cap: ${max})</h3>
  <div class="name" style="color:#744210;font-size:12px;word-break:break-all;">$(html_escape "$overflow_paths")</div>
</div>
EOF
)"
  fi

  cat <<EOF
<section class="card">
<h2>Per-Iteration Detail</h2>
$body
$overflow_html
</section>
EOF
}

# render_iteration_block ITER
# Reads WORKBENCH_SHX_SHOW (space-separated allowlist of paths) to decide which
# screenshots to embed vs. skip silently (overflow is handled by the caller).
render_iteration_block() {
  local iter="$1"
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local manifests_dir="$root/.cfn-cache/manifests"
  local screenshots_dir="$root/tests/screenshots"
  local lane_root="$root/tmp"
  local no_shx="${WORKBENCH_NO_SCREENSHOTS:-0}"

  # Inherit the show-set lookup (name -> "1") from the caller via local array copy.
  # Workaround: bash cannot pass associative arrays cleanly, so we re-read the
  # allowlist from WORKBENCH_SHX_SHOW (space-separated paths).
  local -A show_set=()
  local p
  for p in ${WORKBENCH_SHX_SHOW:-}; do
    show_set["$p"]=1
  done

  local lane_rows=""
  local lane_files=""
  [[ -d "$lane_root" ]] && lane_files="$(ls "$lane_root"/lane-report-${slug}-*.json 2>/dev/null || true)"
  local runtime_lanes="$(ls /tmp/lane-report-${slug}-*.json 2>/dev/null || true)"
  for f in $runtime_lanes; do
    [[ -f "$f" ]] && lane_files="$lane_files $f"
  done
  for f in $lane_files; do
    [[ -z "$f" ]] && continue
    [[ -f "$f" ]] || continue
    local f_iter
    f_iter="$(jq -r '.iteration // empty' "$f" 2>/dev/null)"
    [[ "$f_iter" != "$iter" ]] && continue
    local lane pr tp tf
    lane="$(jq -r '.lane // "?"' "$f" 2>/dev/null)"
    pr="$(jq -r '.pass_rate // "?"' "$f" 2>/dev/null)"
    tp="$(jq -r '.tests_passed // "?"' "$f" 2>/dev/null)"
    tf="$(jq -r '.tests_failed // "?"' "$f" 2>/dev/null)"
    local pr_pct="$pr"
    if [[ "$pr" =~ ^[0-9.]+$ ]]; then
      pr_pct="$(awk -v v="$pr" 'BEGIN { printf "%.0f", v*100 }')%"
    fi
    lane_rows+="$(cat <<EOF
<tr>
  <td class="mono">$(html_escape "$lane")</td>
  <td>$(html_escape "$pr_pct")</td>
  <td>$(html_escape "$tp")</td>
  <td>$(html_escape "$tf")</td>
  <td class="mono">$(html_escape "$(basename "$f")")</td>
</tr>
EOF
)"
  done

  if [[ -z "$lane_rows" ]]; then
    record_gap "lane-reports for slug ${slug} iteration ${iter}"
  fi

  # Test output summary line.
  local test_summary="<span class=\"empty\">no test-output captured</span>"
  local test_outputs=""
  [[ -d "$lane_root" ]] && test_outputs="$(ls "$lane_root"/test-output-${slug}-${iter}.txt 2>/dev/null || true)"
  local runtime_tests="$(ls /tmp/test-output-${slug}-${iter}.txt 2>/dev/null || true)"
  for f in $runtime_tests; do
    [[ -f "$f" ]] && test_outputs="$test_outputs $f"
  done
  local first_output=""
  for f in $test_outputs; do
    [[ -z "$f" ]] && continue
    [[ -f "$f" ]] && first_output="$f" && break
  done
  if [[ -n "$first_output" ]]; then
    local summary_line
    summary_line="$(grep -E 'Tests|Test Files|passed|failed|PASS|FAIL' "$first_output" 2>/dev/null | head -3 | tr '\n' ' | ')"
    if [[ -n "$summary_line" ]]; then
      test_summary="$(html_escape "$summary_line") <span class=\"note\">($(html_escape "$(basename "$first_output")"))</span>"
    fi
  else
    record_gap "test-output for slug ${slug} iteration ${iter}"
  fi

  # Gate events from manifests in this iteration.
  local gate_events="<ul class=\"tight\"><li class=\"empty\">no manifests</li></ul>"
  if [[ -d "$manifests_dir" ]] && ls "$manifests_dir"/cfn-*-${iter}.json >/dev/null 2>&1; then
    gate_events="<ul class=\"tight\">"
    for m in $(ls "$manifests_dir"/cfn-*-${iter}.json 2>/dev/null); do
      [[ -f "$m" ]] || continue
      local src status
      src="$(jq -r '.source // "?"' "$m" 2>/dev/null)"
      status="$(jq -r '.status // "?"' "$m" 2>/dev/null)"
      gate_events+="<li><span class=\"pill pill-$(html_escape "$status")\">$(html_escape "$status")</span> $(html_escape "$src") <span class=\"note\">($(html_escape "$(basename "$m")"))</span></li>"
    done
    gate_events+="</ul>"
  fi

  # Screenshots for THIS iteration. Only those in show_set are embedded; the
  # rest are silently skipped here (overflow handled by caller).
  local shx_html=""
  local iter_total=0
  if [[ "$no_shx" == "1" ]]; then
    shx_html="<p class=\"note\">Screenshots skipped (--no-screenshots).</p>"
  else
    local -a iter_shx=()
    if [[ -d "$screenshots_dir" ]]; then
      while IFS= read -r s; do
        [[ -z "$s" ]] && continue
        iter_shx+=("$s")
      done < <(ls "$screenshots_dir"/${slug}-iteration-${iter}.png 2>/dev/null | sort)
    fi
    iter_total=${#iter_shx[@]}
    if [[ $iter_total -eq 0 ]]; then
      shx_html="<p class=\"empty\">No screenshots for iteration ${iter}.</p>"
    else
      local cards=""
      local shown_here=0
      for s in "${iter_shx[@]:-}"; do
        [[ -z "$s" ]] && continue
        if [[ -n "${show_set[$s]:-}" ]]; then
          local uri name
          uri="$(data_uri_png "$s")"
          name="$(basename "$s")"
          cards+="$(cat <<EOF
<div class="screenshot-card">
  <details><summary>$(html_escape "$name")</summary><img src="$(html_escape "$uri")" alt="$(html_escape "$name")"></details>
  <div class="name">$(html_escape "$name")</div>
</div>
EOF
)"
          shown_here=$((shown_here+1))
        fi
      done
      if [[ $shown_here -eq 0 ]]; then
        cards="<div class=\"screenshot-card\"><div class=\"note\">All ${iter_total} screenshot(s) for this iteration were omitted by the cap (see overflow card).</div></div>"
      fi
      shx_html="<div class=\"screenshot-grid\">${cards}</div>"
    fi
  fi

  cat <<EOF
<details open>
<summary>Iteration ${iter}</summary>
<div class="card" style="box-shadow:none;background:#fafbfc;">
  <h3 style="margin:0 0 6px;font-size:15px;">Lanes</h3>
  <table>
    <thead><tr><th>Lane</th><th>Pass</th><th>Passed</th><th>Failed</th><th>Source</th></tr></thead>
    <tbody>${lane_rows}</tbody>
  </table>
  <h3 style="margin:12px 0 4px;font-size:15px;">Test summary</h3>
  <div>${test_summary}</div>
  <h3 style="margin:12px 0 4px;font-size:15px;">Gate events</h3>
  ${gate_events}
  <h3 style="margin:12px 0 4px;font-size:15px;">Screenshots (${iter_total:-0})</h3>
  ${shx_html}
</div>
</details>
EOF
}
