#!/usr/bin/env bash
# lib/section-iteration-detail.sh - per-iteration detail: lanes, test summary, screenshot grid, gate events.
#
# Reuses the same iteration-discovery logic as timeline. For each iteration:
#   - lane cards from lane-reports (pass_rate, tests_passed, tests_failed)
#   - test-output summary line(s) from test-output-<slug>-<iter>.txt
#   - screenshot grid (global cap from --max-screenshots, disabled by --no-screenshots)
#   - gate events list (one row per manifest in this iteration with status + source)
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
<section class="card" id="sec-detail">
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

  local body="" first_iter=1
  for iter in $sorted; do
    [[ -z "$iter" ]] && continue
    body+="$(render_iteration_block "$iter" "$first_iter")"
    first_iter=0
  done

  # After iterations, render a single overflow card if any screenshots were capped.
  local overflow_html=""
  if [[ "$no_shx" == "0" && $overflow_count -gt 0 ]]; then
    overflow_html="$(cat <<EOF
<div class="card sub-card overflow-card">
  <h3 class="sub-head">${overflow_count} more screenshot(s) omitted (cap: ${max})</h3>
  <div class="name">$(html_escape "$overflow_paths")</div>
</div>
EOF
)"
  fi

  cat <<EOF
<section class="card" id="sec-detail">
<h2>Per-Iteration Detail</h2>
$body
$overflow_html
</section>
EOF
}

# render_iteration_block ITER IS_FIRST
# Reads WORKBENCH_SHX_SHOW (space-separated allowlist of paths) to decide which
# screenshots to embed vs. skip silently (overflow is handled by the caller).
# IS_FIRST=1 opens the <details>; all others render closed.
render_iteration_block() {
  local iter="$1"
  local IS_FIRST="${2:-1}"
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

  # Lanes: card grid (one lane-card per lane-report matching this iteration).
  local lane_cards=""
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
    # Derive a status bucket from pass_rate (and any failures) for state_label.
    # cfn: pass_rate-only derivation, upgrade if lane-report grows an explicit status field.
    local status="unknown"
    if [[ "$tf" =~ ^[0-9]+$ ]] && (( tf > 0 )); then
      status="fail"
    elif [[ "$pr" =~ ^[0-9.]+$ ]]; then
      if awk -v v="$pr" 'BEGIN { exit !(v >= 1.0) }'; then
        status="pass"
      else
        status="fail"
      fi
    fi
    lane_cards+="$(cat <<EOF
<div class="lane-card">
  <div class="lane-name">$(html_escape "$lane")</div>
  <div class="lane-rate">$(html_escape "$pr_pct")</div>
  $(state_label "$status")
</div>
EOF
)"
  done

  local lanes_block
  if [[ -z "$lane_cards" ]]; then
    record_gap "lane-reports for slug ${slug} iteration ${iter}"
    lanes_block='<p class="empty">no lane reports</p>'
  else
    lanes_block="<div class=\"lane-grid\">${lane_cards}</div>"
  fi

  # Test output summary line.
  local test_block='<p class="empty">no test-output captured</p>'
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
      test_block="<div class=\"mono-block\">$(html_escape "$summary_line")</div>"
    fi
  else
    record_gap "test-output for slug ${slug} iteration ${iter}"
  fi

  # Gate events from manifests in this iteration.
  local gate_block='<p class="empty">no manifests</p>'
  if [[ -d "$manifests_dir" ]] && ls "$manifests_dir"/cfn-*-${iter}.json >/dev/null 2>&1; then
    local gate_rows=""
    for m in $(ls "$manifests_dir"/cfn-*-${iter}.json 2>/dev/null); do
      [[ -f "$m" ]] || continue
      local src status
      src="$(jq -r '.source // "?"' "$m" 2>/dev/null)"
      status="$(jq -r '.status // "?"' "$m" 2>/dev/null)"
      gate_rows+="$(cat <<EOF
<div class="gate-row">
  <span class="gate-name">$(html_escape "$src")</span>
  $(state_label "$status")
</div>
EOF
)"
    done
    if [[ -n "$gate_rows" ]]; then
      gate_block="<div class=\"gate-list\">${gate_rows}</div>"
    fi
  fi

  # Screenshots for THIS iteration. Only those in show_set are embedded; the
  # rest are silently skipped here (overflow handled by caller).
  local shx_html=""
  local iter_total=0
  if [[ "$no_shx" == "1" ]]; then
    shx_html='<p class="note">Screenshots skipped (--no-screenshots).</p>'
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
          local name label
          name="$(basename "$s")"
          label="${name%.png}"
          cards+="$(cat <<EOF
<div class="shot-thumb">
  <div class="shot-label">$(html_escape "$label")</div>
  <img src="$(data_uri_png "$s")" alt="screenshot"/>
  <div class="name">$(html_escape "$name")</div>
</div>
EOF
)"
          shown_here=$((shown_here+1))
        fi
      done
      if [[ $shown_here -eq 0 ]]; then
        shx_html="<p class=\"note\">All ${iter_total} screenshot(s) for this iteration were omitted by the cap (see overflow card).</p>"
      else
        shx_html="<div class=\"shot-grid\">${cards}</div>"
      fi
    fi
  fi

  cat <<EOF
<details$([[ "$IS_FIRST" == "1" ]] && printf ' open')>
<summary>Iteration ${iter}</summary>
<div class="card sub-card">
  <h3 class="sub-head">Lanes</h3>
  ${lanes_block}
  <h3 class="sub-head">Test summary</h3>
  ${test_block}
  <h3 class="sub-head">Gate events</h3>
  ${gate_block}
  <h3 class="sub-head">Screenshots (${iter_total:-0})</h3>
  ${shx_html}
</div>
</details>
EOF
}
