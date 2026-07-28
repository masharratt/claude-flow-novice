#!/bin/bash
# lib/html.sh - shared HTML helpers for cfn-workbench.
# Provides: html_escape, data_uri_png, default_style, record_gap, get_gap_count.

# html_escape STRING
# Escapes &, <, >, ", ' for safe HTML interpolation.
# Reads from $1 OR stdin. Routes EVERY interpolation through this.
html_escape() {
  local input
  if [[ $# -ge 1 ]]; then input="$1"; else input="$(cat)"; fi
  # Order matters: ampersand first. In bash ${//} replacement, a bare & is a
  # backreference to the matched text, so &lt; would emit <lt; not &lt;. The
  # \& form makes the ampersand literal. Empirically required on bash 5.2.
  local out="${input//&/\&amp;}"
  out="${out//</\&lt;}"
  out="${out//>/\&gt;}"
  out="${out//\"/\&quot;}"
  out="${out//\'/\&#39;}"
  printf '%s' "$out"
}

# data_uri_png FILE_PATH
# Emits a data:image/png;base64,... URI for FILE_PATH. Empty if file missing.
data_uri_png() {
  local f="$1"
  [[ -f "$f" ]] || { printf ''; return; }
  local b64
  b64="$(base64 -w 0 "$f" 2>/dev/null || base64 "$f" 2>/dev/null | tr -d '\n')"
  printf 'data:image/png;base64,%s' "$b64"
}

# record_gap DESCRIPTION
# Append a missing-source note to the shared gaps registry.
# The registry path is set by render.sh via WORKBENCH_GAPS_FILE.
record_gap() {
  local gaps_file="${WORKBENCH_GAPS_FILE:-}"
  [[ -z "$gaps_file" ]] && return
  printf '%s\n' "$1" >> "$gaps_file"
}

# get_gap_count - echoes the count of recorded gaps.
get_gap_count() {
  local gaps_file="${WORKBENCH_GAPS_FILE:-}"
  [[ -z "$gaps_file" || ! -f "$gaps_file" ]] && { printf '0'; return; }
  wc -l < "$gaps_file" | tr -d ' '
}

# get_gaps - echoes each gap line, deduped.
get_gaps() {
  local gaps_file="${WORKBENCH_GAPS_FILE:-}"
  [[ -z "$gaps_file" || ! -f "$gaps_file" ]] && return
  sort -u "$gaps_file"
}

# display_path PATH
# Relativize an absolute path for user-facing copy. Strips the run-root prefix
# (shows planning/...); redacts mktemp scratch dirs (/tmp/tmp.XXX -> <tmpdir>);
# otherwise returns the path unchanged. Keeps internal scratch paths out of the
# rendered HTML (notes, gaps, footer command/out).
display_path() {
  local p="$1" root="${WORKBENCH_ROOT:-}"
  [[ -z "$p" ]] && { printf ''; return; }
  if [[ -n "$root" && "$p" == "$root"* ]]; then
    local rel="${p#"$root"}"
    rel="${rel#/}"
    [[ -z "$rel" ]] && printf '.' || printf '%s' "$rel"
    return
  fi
  if [[ "$p" == /tmp/tmp.* ]]; then
    printf '<tmpdir>/%s' "$(printf '%s' "$p" | sed 's#^/tmp/tmp\.[^/]*/##')"
    return
  fi
  printf '%s' "$p"
}

# state_label VALUE [TEXT]
# Classify a status string into a Nocturne state bucket and emit a labeled span.
# Single source of truth for value -> bucket. Unknown values fall to state-unknown
# (visible default, never a broken pill-? selector). TEXT defaults to VALUE.
state_label() {
  local value="$1"
  local text="${2:-$1}"
  [[ -z "$text" ]] && text="unknown"
  local v
  v="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  local bucket="unknown"
  case "$v" in
    pass|completed|accepted|blessed) bucket="settled" ;;
    pending|in-progress|open|proposed) bucket="waiting" ;;
    unknown|rejected|superseded) bucket="unknown" ;;
    fail) bucket="action" ;;
    blocked|aborted) bucket="fatal" ;;
  esac
  printf '<span class="state state-%s">%s</span>' "$bucket" "$(html_escape "$text")"
}

# gaps_strip - prominent top-of-page strip listing recorded data gaps (Nocturne).
# Emits nothing when there are no gaps, so gap-free renders stay clean.
gaps_strip() {
  local count
  count="$(get_gap_count)"
  [[ "$count" -eq 0 ]] && { printf ''; return; }
  printf '<div class="gaps-strip">'
  printf '<span class="gaps-strip-label">%s data %s</span>' \
    "$(html_escape "$count")" "$( [[ "$count" -eq 1 ]] && printf 'gap' || printf 'gaps' )"
  printf '<ul>'
  get_gaps | while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    printf '<li>%s</li>' "$(html_escape "$line")"
  done
  printf '</ul></div>'
}

# section_nav - sticky jump-bar to section anchors (ids emitted by each section).
section_nav() {
  cat <<'EOF'
<nav class="section-nav">
  <a href="#sec-timeline">Timeline</a>
  <a href="#sec-detail">Detail</a>
  <a href="#sec-ac">AC</a>
  <a href="#sec-decisions">Decisions</a>
  <a href="#sec-votes">Votes</a>
  <a href="#sec-debt">Debt</a>
  <a href="#sec-bless">Bless</a>
  <a href="#sec-gaps">Gaps</a>
</nav>
EOF
}

# default_style - emits the inline <style> body. Nocturne dark theme.
# No external fonts (system stack), no @import, no https. No em dashes (project rule).
# cfn: system font stack, not Inter; design specified Inter@GoogleFonts, self-containment
# contract forbids external requests. Revisit if a branded font becomes a hard requirement.
default_style() {
  cat <<'STYLE'
:root {
  --color-bg: #161826;
  --color-surface: #232532;
  --color-surface-2: #2a2d3d;
  --color-text: #e9e9ed;
  --color-accent: #9184d9;
  --color-divider: #34374a;
  --neutral-100: #e9e9ed;
  --neutral-200: #c7c7cf;
  --neutral-300: #9b9ba6;
  --neutral-400: #6e6e7a;
  --neutral-500: #4a4a55;
  --neutral-600: #3a3a45;
  --neutral-700: #2e2e38;
  --neutral-800: #232532;
  --neutral-900: #161826;
  --accent-200: #c5bdf0;
  --accent-400: #9184d9;
  --accent-600: #6d5fb8;
  --accent-900: #2a2547;
  --ok: #7ee2a8;
  --warn: #e9c46a;
  --bad: #f0a8a8;
  --font-heading: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, Consolas, monospace;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px;
  --radius: 8px; --radius-sm: 5px;
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-body);
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  line-height: 1.55;
  font-size: 15px;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent-200); text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: var(--font-mono); font-size: 0.9em; }
.container { max-width: 1120px; margin: 0 auto; padding: var(--space-5) var(--space-4) var(--space-6); }

/* Hairline elevation: Nocturne signature (inset 1px ring, not a drop shadow). */
.card {
  background: var(--color-surface);
  border-radius: var(--radius);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
  box-shadow: inset 0 0 0 1px var(--color-divider);
}
.card h2 { margin: 0 0 var(--space-3); font-size: 17px; font-weight: 650; color: var(--neutral-100); }
.sub-card { background: var(--color-surface-2); box-shadow: inset 0 0 0 1px var(--color-divider); }
.sub-head { font-size: 14px; font-weight: 600; margin: var(--space-3) 0 var(--space-2); color: var(--neutral-200); }

/* Section heading: kicker label + fading rule beneath. */
.section-kicker {
  display: block; text-transform: uppercase; letter-spacing: 0.12em;
  font-size: 11px; font-weight: 600; color: var(--neutral-400); margin-bottom: var(--space-2);
}
.section-hint { font-size: 12px; color: var(--neutral-400); margin: 0 0 var(--space-3); }
.hr { height: 1px; border: 0; margin: 0 0 var(--space-4); background: linear-gradient(to right, transparent 0, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent 100%); }

/* Sticky header band. */
.wb-sticky-header {
  position: sticky; top: 0; z-index: 20;
  background: rgba(22, 24, 38, 0.86);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: inset 0 -1px 0 var(--color-divider);
  padding: var(--space-4) 0; margin-bottom: var(--space-4);
}
.verdict-headline { margin: 0; font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: -0.01em; }
.verdict-rule { height: 2px; width: 56px; background: var(--color-accent); border: 0; margin: var(--space-2) 0 var(--space-2); }
.header-summary { color: var(--neutral-300); font-size: 14px; margin: 0; }
.meta-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-2) var(--space-4);
  margin-top: var(--space-3); font-size: 13px;
}
.meta-grid .meta-label { color: var(--neutral-400); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
.meta-grid .meta-value { color: var(--neutral-100); }
.meta-grid code { color: var(--accent-200); }
.count-pill {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--color-surface-2); color: var(--neutral-200);
  border-radius: 999px; padding: 3px 12px; font-size: 12px; font-weight: 600;
  box-shadow: inset 0 0 0 1px var(--color-divider);
}
.count-pill a { color: inherit; }
.count-pill:hover { text-decoration: none; box-shadow: inset 0 0 0 1px var(--color-accent); }
.count-pill-gaps { color: var(--warn); }
.count-pill-num { font-variant-numeric: tabular-nums; }
.count-pills { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }

/* Gaps strip (top, only when gaps exist). */
.gaps-strip {
  background: rgba(233, 196, 106, 0.08);
  box-shadow: inset 0 0 0 1px rgba(233, 196, 106, 0.35);
  border-radius: var(--radius); padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
}
.gaps-strip-label { color: var(--warn); font-size: 13px; font-weight: 600; }
.gaps-strip ul { margin: var(--space-2) 0 0; padding-left: 18px; color: var(--neutral-200); font-size: 13px; }
.gaps-strip li { margin: 2px 0; word-break: break-word; }

/* Sticky section nav. */
.section-nav {
  display: flex; flex-wrap: wrap; gap: var(--space-2);
  margin-bottom: var(--space-4); position: sticky; top: 0;
  background: var(--color-bg); padding: var(--space-2) 0; z-index: 15;
}
.section-nav a {
  font-size: 13px; color: var(--neutral-200); background: var(--color-surface);
  border-radius: 999px; padding: 3px 12px; box-shadow: inset 0 0 0 1px var(--color-divider);
}
.section-nav a:hover { background: var(--color-surface-2); text-decoration: none; color: var(--neutral-100); }

/* State-label system (5 buckets). Single source of truth: state_label() in html.sh. */
.state {
  display: inline-block; padding: 2px 8px; border-radius: var(--radius-sm);
  font-size: 12px; font-weight: 600; letter-spacing: 0.01em;
  border-left: 3px solid transparent; white-space: nowrap;
}
.state-settled { border-left-color: var(--ok); background: rgba(126, 226, 168, 0.12); color: #a8efc4; }
.state-waiting { border-left-color: var(--color-accent); background: transparent; color: var(--neutral-300); box-shadow: inset 0 0 0 1px var(--color-divider); }
.state-unknown { border-left-style: dotted; border-left-color: var(--neutral-400); background: transparent; color: var(--neutral-400); box-shadow: inset 0 0 0 1px var(--color-divider); }
.state-action { border-left-color: var(--bad); background: rgba(240, 168, 168, 0.14); color: #f3c0c0; }
.state-fatal { border-left-color: var(--bad); background: #5a2a2a; color: #f7d0d0; font-weight: 700; }

/* Tables. */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: var(--space-2); }
th, td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-divider); vertical-align: top; }
th { background: var(--color-surface-2); color: var(--neutral-200); font-weight: 600; font-size: 13px; }
tr:hover td { background: rgba(145, 132, 217, 0.05); }
td.mono, th.mono { font-family: var(--font-mono); font-size: 13px; }

/* AC table: sticky first column. Wrapper stays a plain table-wrap div (P1-4
   parity); sticky rules target the table itself via .ac-table. */
.ac-table th:first-child, .ac-table td:first-child {
  position: sticky; left: 0; z-index: 2;
  background: var(--color-surface-2);
  box-shadow: inset -1px 0 0 var(--color-divider);
}
.ac-table tbody td:first-child { background: var(--color-surface); }

ul.tight { margin: var(--space-2) 0; padding-left: 20px; }
ul.tight li { margin: 2px 0; }
.empty { color: var(--neutral-400); font-style: italic; }
.note { font-size: 13px; color: var(--neutral-300); }
.gap-list { background: rgba(233, 196, 106, 0.08); box-shadow: inset 0 0 0 1px rgba(233, 196, 106, 0.35); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); font-size: 13px; color: var(--neutral-200); }
.gap-list ul { margin: var(--space-1) 0; padding-left: 18px; }

/* Timeline. */
.timeline-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-3); margin-top: var(--space-2); }
.timeline-cell, .iter-card { border-radius: var(--radius-sm); padding: var(--space-3); background: var(--color-surface-2); box-shadow: inset 0 0 0 1px var(--color-divider); }
.timeline-cell .iter-label, .iter-card .iter-label { font-size: 12px; color: var(--neutral-400); }
.timeline-cell .iter-value, .iter-card .iter-value { font-size: 20px; font-weight: 650; color: var(--neutral-100); font-variant-numeric: tabular-nums; }
.timeline-cell .iter-value.iter-na, .iter-card .iter-value.iter-na { font-size: 13px; font-weight: 400; color: var(--neutral-400); }
.iter-card-latest { box-shadow: inset 0 0 0 1px var(--color-accent); }
.progress { height: 6px; background: var(--neutral-700); border-radius: 999px; overflow: hidden; margin-top: var(--space-2); }
.progress > div { height: 100%; width: calc(var(--p, 0) * 1%); background: var(--color-accent); border-radius: 999px; }

/* Iteration detail. */
.lane-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: var(--space-2); margin-top: var(--space-2); }
.lane-card { background: var(--color-surface-2); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); box-shadow: inset 0 0 0 1px var(--color-divider); font-size: 13px; }
.lane-card .lane-name { color: var(--neutral-200); font-weight: 600; }
.lane-card .lane-rate { color: var(--neutral-400); font-variant-numeric: tabular-nums; }
.mono-block { font-family: var(--font-mono); font-size: 12.5px; white-space: pre; background: var(--neutral-900); color: var(--neutral-200); border-radius: var(--radius-sm); padding: var(--space-3); overflow-x: auto; box-shadow: inset 0 0 0 1px var(--color-divider); }
.gate-list { margin: var(--space-2) 0; }
.gate-row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; padding: var(--space-1) 0; font-size: 13px; border-bottom: 1px solid var(--color-divider); }
.gate-row:last-child { border-bottom: 0; }
.gate-row .gate-name { color: var(--neutral-200); }
.shot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--space-2); margin-top: var(--space-2); }
.shot-thumb { border-radius: var(--radius-sm); padding: var(--space-2); background: var(--color-surface-2); box-shadow: inset 0 0 0 1px var(--color-divider); font-size: 12px; }
.shot-thumb img { width: 100%; height: auto; display: block; border-radius: 3px; }
.shot-thumb .name { color: var(--neutral-400); word-break: break-all; }
.shot-thumb .shot-label { color: var(--neutral-200); margin-bottom: 4px; }
/* Back-compat: iteration-detail may still emit legacy screenshot-* class names. */
.screenshot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--space-2); margin-top: var(--space-2); }
.screenshot-card { border-radius: var(--radius-sm); padding: var(--space-2); background: var(--color-surface-2); box-shadow: inset 0 0 0 1px var(--color-divider); font-size: 12px; }
.screenshot-card img { width: 100%; height: auto; display: block; border-radius: 3px; }
.screenshot-card .name { color: var(--neutral-400); word-break: break-all; }

.overflow-card { background: rgba(233, 196, 106, 0.08); box-shadow: inset 0 0 0 1px rgba(233, 196, 106, 0.35); }
.overflow-card .sub-head { color: var(--warn); margin: 0 0 var(--space-1); }
.overflow-card .name { color: var(--warn); font-size: 12px; word-break: break-all; }

.bless-meta { margin-bottom: var(--space-2); }
.bless-list code { color: var(--accent-200); }

/* Two-column ledger grid (votes / debt / bless). */
.two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-3); }

/* Decisions. */
.decisions-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3); margin-top: var(--space-2); }
.decision-card { background: var(--color-surface-2); border-radius: var(--radius-sm); padding: var(--space-3) var(--space-4); box-shadow: inset 0 0 0 1px var(--color-divider); }
.decision-card .decision-id { font-family: var(--font-mono); font-size: 12px; color: var(--neutral-400); }
.decision-card .decision-title { font-weight: 650; color: var(--neutral-100); margin: 2px 0; }
.decision-card .decision-chosen { color: var(--neutral-200); font-size: 14px; }
.decision-card .decision-rationale { color: var(--neutral-300); font-size: 13px; margin-top: var(--space-2); }
.decision-card .decision-meta { color: var(--neutral-400); font-size: 12px; margin-top: var(--space-2); }
.actor { display: inline-block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 7px; border-radius: 999px; }
.actor-human { background: rgba(145, 132, 217, 0.18); color: var(--accent-200); box-shadow: inset 0 0 0 1px var(--color-accent); }
.actor-ai { background: var(--color-surface); color: var(--neutral-300); box-shadow: inset 0 0 0 1px var(--color-divider); }

/* Legend. */
.legend { margin-top: var(--space-4); }
.legend summary { cursor: pointer; color: var(--neutral-300); font-size: 13px; }
.legend-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-2); margin-top: var(--space-2); }
.legend-item { font-size: 13px; color: var(--neutral-300); }

details { margin-top: var(--space-2); }
details summary { cursor: pointer; color: var(--neutral-200); font-size: 14px; }
details[open] summary { margin-bottom: var(--space-1); }

.footer-meta { color: var(--neutral-400); font-size: 12px; }
.footer-meta code { color: var(--accent-200); }
.footer-meta ul { margin: var(--space-1) 0; padding-left: 18px; }

@media (max-width: 540px) {
  .verdict-headline { font-size: 24px; }
  .card { padding: var(--space-4); }
}
STYLE
}

# section_card TITLE_ID TITLE_TEXT BODY_HTML
# Wraps BODY_HTML in a <section class="card"> with an <h2>.
section_card() {
  local title="$1"; shift
  local body="$1"; shift
  cat <<EOF
<section class="card">
<h2>$(html_escape "$title")</h2>
$body
</section>
EOF
}
