#!/bin/bash
# lib/section-header.sh - sticky Nocturne header band (slug, branch, iteration count, verdict, generated_at).

section_header() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local manifests_dir="$root/.cfn-cache/manifests"
  # Project = repo dir name (which project this run belongs to). On real runs
  # WORKBENCH_ROOT is the repo root, so basename is the project name.
  local project
  project="$(basename "$root")"

  local branch="unknown"
  if git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch="$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  else
    record_gap "git repo (no git metadata at run root)"
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

  local generated_at generated_pretty
  generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  generated_pretty="$(date -u -d "$generated_at" '+%Y-%m-%d %H:%M UTC' 2>/dev/null || printf '%s' "$generated_at")"

  # Open vote count across all manifests (open|pending suggestions).
  local open_count=0
  if [[ -d "$manifests_dir" ]]; then
    open_count="$(jq -s '[.[].suggestions[]? | select(.status=="open" or .status=="pending")] | length' "$manifests_dir"/cfn-*.json 2>/dev/null || echo 0)"
    [[ -z "$open_count" ]] && open_count=0
  fi

  # Gap count with singular/plural noun.
  local gap_count gap_noun
  gap_count="$(get_gap_count)"
  if [[ "$gap_count" -eq 1 ]]; then
    gap_noun="gap"
  else
    gap_noun="gaps"
  fi

  cat <<EOF
<header class="wb-sticky-header">
  <h1 class="verdict-headline">$(html_escape "$verdict")</h1>
  <hr class="verdict-rule"/>
  <p class="header-summary">CFN Workbench run <code>$(html_escape "$slug")</code> in project <code>$(html_escape "$project")</code> on branch <code>$(html_escape "$branch")</code>, iteration $(html_escape "$iter_count"), generated <time datetime="$(html_escape "$generated_at")">$(html_escape "$generated_pretty")</time>.</p>
  <div class="meta-grid">
    <div><div class="meta-label">Project</div><div class="meta-value"><code>$(html_escape "$project")</code></div></div>
    <div><div class="meta-label">Run</div><div class="meta-value"><code>$(html_escape "$slug")</code></div></div>
    <div><div class="meta-label">Branch</div><div class="meta-value"><code>$(html_escape "$branch")</code></div></div>
    <div><div class="meta-label">Iterations</div><div class="meta-value">$(html_escape "$iter_count")</div></div>
    <div><div class="meta-label">Generated</div><div class="meta-value"><time datetime="$(html_escape "$generated_at")">$(html_escape "$generated_pretty")</time></div></div>
  </div>
  <div class="count-pills">
    <a class="count-pill" href="#sec-votes"><span class="count-pill-num">$(html_escape "$open_count")</span> open</a>
    <a class="count-pill count-pill-gaps" href="#sec-gaps"><span class="count-pill-num">$(html_escape "$gap_count")</span> $(html_escape "$gap_noun")</a>
  </div>
</header>
EOF
}
