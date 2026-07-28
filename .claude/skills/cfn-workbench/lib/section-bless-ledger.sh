#!/bin/bash
# lib/section-bless-ledger.sh - bless ledger from planning/.VERIFY_<slug>.bless.json.
#
# Renders structure_changed and predicate_changed lists plus the verdict.

section_bless_ledger() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local bless="$root/planning/.VERIFY_${slug}.bless.json"

  if [[ ! -f "$bless" ]]; then
    record_gap "bless ledger (.VERIFY_${slug}.bless.json)"
    cat <<EOF
<section class="card" id="sec-bless">
<h2>Bless Ledger</h2>
<p class="empty">No bless ledger at planning/.VERIFY_${slug}.bless.json.</p>
</section>
EOF
    return
  fi

  local verdict blessed_at sc pc
  verdict="$(jq -r '.verdict // "unknown"' "$bless" 2>/dev/null)"
  blessed_at="$(jq -r '.blessed_at // "?"' "$bless" 2>/dev/null)"
  sc="$(jq -r '(.structure_changed // []) | join("\n")' "$bless" 2>/dev/null)"
  pc="$(jq -r '(.predicate_changed // []) | join("\n")' "$bless" 2>/dev/null)"

  local sc_html pc_html
  if [[ -z "$sc" ]]; then
    sc_html="<li class=\"empty\">none</li>"
  else
    sc_html="$(printf '%s\n' "$sc" | while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      printf '<li class="mono">%s</li>\n' "$(html_escape "$line")"
    done)"
  fi
  if [[ -z "$pc" ]]; then
    pc_html="<li class=\"empty\">none</li>"
  else
    pc_html="$(printf '%s\n' "$pc" | while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      printf '<li class="mono">%s</li>\n' "$(html_escape "$line")"
    done)"
  fi

  cat <<EOF
<section class="card" id="sec-bless">
<h2>Bless Ledger</h2>
<div class="header-meta bless-meta">
  <span>Verdict: <span class="pill pill-$(html_escape "$verdict")">$(html_escape "$verdict")</span></span>
  <span>Blessed: <code>$(html_escape "$blessed_at")</code></span>
</div>
<h3 class="sub-head">structure_changed</h3>
<ul class="tight">
${sc_html}
</ul>
<h3 class="sub-head">predicate_changed</h3>
<ul class="tight">
${pc_html}
</ul>
</section>
EOF
}
