#!/usr/bin/env bash
# lib/section-bless-ledger.sh - bless ledger from planning/<slug>/.VERIFY_<slug>.bless.json.
#
# Renders structure_changed and predicate_changed lists plus the verdict.

section_bless_ledger() {
  local slug="${WORKBENCH_SLUG:-}"
  local root="${WORKBENCH_ROOT:-.}"
  local bless; bless="$(plan_path "$root" "$slug" ".VERIFY_${slug}.bless.json")" || true

  if [[ ! -f "$bless" ]]; then
    record_gap "bless ledger (.VERIFY_${slug}.bless.json)"
    cat <<EOF
<section class="card" id="sec-bless">
<span class="section-kicker">Structure</span>
<h2>Bless ledger</h2>
<hr class="hr"/>
<p class="empty">No bless ledger for this run.</p>
</section>
EOF
    return
  fi

  local verdict sc pc
  verdict="$(jq -r '.verdict // "unknown"' "$bless" 2>/dev/null)"
  sc="$(jq -r '(.structure_changed // []) | join("\n")' "$bless" 2>/dev/null)"
  pc="$(jq -r '(.predicate_changed // []) | join("\n")' "$bless" 2>/dev/null)"

  local sc_html pc_html
  if [[ -z "$sc" ]]; then
    sc_html='<li class="empty">none</li>'
  else
    sc_html="$(printf '%s\n' "$sc" | while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      printf '<li><code>%s</code></li>\n' "$(html_escape "$line")"
    done)"
  fi
  if [[ -z "$pc" ]]; then
    pc_html='<li class="empty">none</li>'
  else
    pc_html="$(printf '%s\n' "$pc" | while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      printf '<li><code>%s</code></li>\n' "$(html_escape "$line")"
    done)"
  fi

  cat <<EOF
<section class="card" id="sec-bless">
<span class="section-kicker">Structure</span>
<h2>Bless ledger</h2>
<hr class="hr"/>
<div class="bless-meta">Verdict $(state_label "$verdict")</div>
<div class="sub-head">structure_changed</div>
<ul class="tight">
${sc_html}
</ul>
<div class="sub-head">predicate_changed</div>
<ul class="tight">
${pc_html}
</ul>
</section>
EOF
}
