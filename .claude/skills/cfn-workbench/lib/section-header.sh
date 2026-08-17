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
      local bless; bless="$(plan_path "$root" "$slug" ".VERIFY_${slug}.bless.json")" || true
      if [[ -f "$bless" ]]; then
        local bv
        bv="$(jq -r '.verdict // empty' "$bless" 2>/dev/null)"
        [[ -n "$bv" ]] && verdict="$bv"
      elif [[ $iter_count -gt 0 ]]; then
        verdict="in-progress"
      fi
    fi
  fi

  # generated_epoch is the single source of instant; generated_at/generated_pretty
  # are both derived from it so the staleness pill (F2) reads the same moment
  # the header text reports.
  local generated_epoch generated_at generated_pretty
  generated_epoch="$(date -u +%s)"
  generated_at="$(date -u -d "@$generated_epoch" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
  generated_pretty="$(date -u -d "@$generated_epoch" '+%Y-%m-%d %H:%M UTC' 2>/dev/null || printf '%s' "$generated_at")"

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
    <div><div class="meta-label">Generated</div><div class="meta-value"><time datetime="$(html_escape "$generated_at")">$(html_escape "$generated_pretty")</time> <span id="wb-staleness" class="stale-pill" data-generated-epoch="$(html_escape "$generated_epoch")">generated $(html_escape "$generated_pretty")</span></div></div>
  </div>
  <div class="count-pills">
    <a class="count-pill" href="#sec-votes"><span class="count-pill-num">$(html_escape "$open_count")</span> open</a>
    <a class="count-pill count-pill-gaps" href="#sec-gaps"><span class="count-pill-num">$(html_escape "$gap_count")</span> $(html_escape "$gap_noun")</a>
  </div>
</header>
<style>
.stale-pill {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--color-surface-2); color: var(--neutral-200);
  border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 600;
  box-shadow: inset 0 0 0 1px var(--color-divider);
}
.stale-ok { color: var(--ok); }
.stale-warn { color: var(--warn); }
.stale-bad { color: var(--bad); }
</style>
<script>
(function () {
  var el = document.getElementById('wb-staleness');
  if (!el) { return; }
  var epoch = parseInt(el.getAttribute('data-generated-epoch'), 10);
  if (isNaN(epoch)) { return; }
  function tick() {
    var age = Math.floor(Date.now() / 1000 - epoch);
    if (age < 0) { age = 0; }
    var label;
    if (age < 60) {
      label = 'updated ' + age + 's ago';
    } else {
      label = 'updated ' + Math.floor(age / 60) + 'm ago';
    }
    el.textContent = label;
    el.classList.remove('stale-ok', 'stale-warn', 'stale-bad');
    if (age < 120) {
      el.classList.add('stale-ok');
    } else if (age < 600) {
      el.classList.add('stale-warn');
    } else {
      el.classList.add('stale-bad');
    }
  }
  tick();
  setInterval(tick, 1000);
})();
</script>
EOF
}
