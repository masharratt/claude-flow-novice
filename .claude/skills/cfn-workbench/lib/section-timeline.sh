#!/bin/bash
# lib/section-timeline.sh - iteration timeline (pass rate, gate verdict, commit count per iter).
#
# Iteration numbers are derived from three sources, unioned:
#   1. manifest filenames cfn-*-N.json (N is the trailing integer)
#   2. screenshots <slug>-iteration-N.png
#   3. lane-reports lane-report-<slug>-N-*.json
# For each iteration, the row shows: pass rate (lane reports or test output),
# gate verdict (manifest status), commit count (git log since the prior iter tag,
# falling back to total commits in the repo).

section_timeline() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local manifests_dir="$root/.cfn-cache/manifests"
  local screenshots_dir="$root/tests/screenshots"
  local lane_root="$root/tmp"

  # Collect iteration numbers from all sources into one set.
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

  # Lane reports (project-local tmp/ and runtime /tmp).
  local lane_files=""
  if [[ -d "$lane_root" ]]; then
    lane_files="$(ls "$lane_root"/lane-report-${slug}-*.json 2>/dev/null || true)"
  fi
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

  # Sort iterations numerically.
  local sorted
  sorted=$(printf '%s\n' $iters | sort -n | tr '\n' ' ')

  if [[ -z "${sorted// /}" ]]; then
    record_gap "iteration timeline (no manifests, screenshots, or lane-reports found)"
    cat <<EOF
<section class="card">
<h2>Iteration Timeline</h2>
<p class="empty">No iterations detected. Render against a project root with .cfn-cache/manifests/, tests/screenshots/&lt;slug&gt;-iteration-*.png, or tmp/lane-report-&lt;slug&gt;-*.json.</p>
</section>
EOF
    return
  fi

  local rows=""
  for iter in $sorted; do
    [[ -z "$iter" ]] && continue
    local pass_rate="n/a"
    local gate="?"
    local commits="0"

    # Pass rate: average of lane-report pass_rate for this iteration.
    local pr_values=""
    for f in $lane_files; do
      [[ -z "$f" ]] && continue
      [[ -f "$f" ]] || continue
      local f_iter f_pr
      f_iter="$(jq -r '.iteration // empty' "$f" 2>/dev/null)"
      if [[ "$f_iter" == "$iter" ]]; then
        f_pr="$(jq -r '.pass_rate // empty' "$f" 2>/dev/null)"
        [[ -n "$f_pr" ]] && pr_values="$pr_values $f_pr"
      fi
    done
    if [[ -n "${pr_values// /}" ]]; then
      local avg
      avg=$(printf '%s\n' $pr_values | awk '{s+=$1; n++} END {if (n>0) printf "%.0f", (s/n)*100; else print "n/a"}')
      [[ -n "$avg" ]] && pass_rate="${avg}%"
    fi

    # Gate verdict from manifest status (any non-completed wins).
    if [[ -d "$manifests_dir" ]]; then
      local statuses=""
      for m in $(ls "$manifests_dir"/cfn-*-${iter}.json 2>/dev/null); do
        [[ -f "$m" ]] || continue
        statuses="$statuses $(jq -r '.status // empty' "$m" 2>/dev/null)"
      done
      if echo "$statuses" | grep -q aborted; then
        gate="aborted"
      elif echo "$statuses" | grep -q completed; then
        gate="completed"
      elif [[ -n "${statuses// /}" ]]; then
        gate="pending"
      fi
    fi

    # Commit count (total in repo for now; per-iter ranges need tags we do not assume).
    if git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      commits="$(git -C "$root" rev-list --count HEAD 2>/dev/null || echo 0)"
    fi

    rows+="$(cat <<EOF
<div class="timeline-cell">
  <div class="iter-label">Iteration ${iter}</div>
  <div class="iter-value">$(html_escape "$pass_rate")</div>
  <div class="iter-label">gate: <span class="pill pill-$(html_escape "$gate")">$(html_escape "$gate")</span></div>
  <div class="iter-label">commits: $(html_escape "$commits")</div>
</div>
EOF
)"
  done

  cat <<EOF
<section class="card">
<h2>Iteration Timeline</h2>
<p class="note">Pass rate is the mean across lane reports for the iteration. Commit count is the repo total (per-iter ranges require iter tags).</p>
<div class="timeline-grid">
${rows}
</div>
</section>
EOF
}
