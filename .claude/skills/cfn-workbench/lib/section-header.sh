#!/bin/bash
# lib/section-header.sh - top header card (slug, branch, iteration count, verdict, generated_at).

section_header() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local manifests_dir="$root/.cfn-cache/manifests"

  local branch="unknown"
  if git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch="$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  else
    record_gap "git repo (no git metadata at $root)"
  fi

  # Iteration count = distinct -N suffixes across manifests.
  local iter_count=0
  local -a iter_set=()
  if [[ -d "$manifests_dir" ]]; then
    while IFS= read -r m; do
      [[ -z "$m" ]] && continue
      local base iter
      base="$(basename "$m")"
      # Strip cfn- prefix and .json suffix, take the trailing -N as iteration.
      iter="$(printf '%s' "$base" | sed -E 's/.*-([0-9]+)\.json$/\1/')"
      if [[ "$iter" =~ ^[0-9]+$ ]]; then
        iter_set+=("$iter")
      fi
    done < <(ls "$manifests_dir"/cfn-*.json 2>/dev/null)
    if [[ ${#iter_set[@]} -gt 0 ]]; then
      # unique count
      iter_count=$(printf '%s\n' "${iter_set[@]}" | sort -u | wc -l | tr -d ' ')
    fi
  fi

  # Verdict: aborted if any manifest says so, else bless-ledger verdict if present,
  # else in-progress if any manifest exists, else unknown.
  local verdict="unknown"
  if [[ -d "$manifests_dir" ]]; then
    local any_aborted any_completed
    any_aborted="$(jq -r 'select(.status=="aborted") | .status' "$manifests_dir"/cfn-*.json 2>/dev/null | head -1)"
    if [[ -n "$any_aborted" ]]; then
      verdict="aborted"
    else
      # Check for a bless ledger verdict.
      local bless="$root/planning/.VERIFY_${slug}.bless.json"
      if [[ -f "$bless" ]]; then
        local bv
        bv="$(jq -r '.verdict // empty' "$bless" 2>/dev/null)"
        [[ -n "$bv" ]] && verdict="$bv"
      elif [[ $iter_count -gt 0 ]]; then
        verdict="in-progress"
      fi
    fi
  fi

  local generated_at
  generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  cat <<EOF
<header class="card header-card">
  <h1>CFN Workbench: $(html_escape "$slug")</h1>
  <div class="header-meta">
    <span>Branch: <code>$(html_escape "$branch")</code></span>
    <span>Iterations: <strong>$iter_count</strong></span>
    <span>Verdict: <span class="pill pill-$(html_escape "$verdict")">$(html_escape "$verdict")</span></span>
    <span>Generated: <time>$(html_escape "$generated_at")</time></span>
  </div>
</header>
EOF
}
