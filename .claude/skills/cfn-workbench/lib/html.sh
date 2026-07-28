#!/bin/bash
# lib/html.sh - shared HTML helpers for cfn-workbench.
# Provides: html_escape, data_uri_png, default_style, record_gap, get_gap_count.

# html_escape STRING
# Escapes &, <, >, ", ' for safe HTML interpolation.
# Reads from $1 OR stdin. Routes EVERY interpolation through this.
html_escape() {
  local input
  if [[ $# -ge 1 ]]; then input="$1"; else input="$(cat)"; fi
  # Order matters: ampersand first.
  local out="${input//&/&amp;}"
  out="${out//</&lt;}"
  out="${out//>/&gt;}"
  out="${out//\"/&quot;}"
  out="${out//\'/&#39;}"
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

# section_nav - sticky jump-bar to section anchors (ids emitted by each section).
section_nav() {
  cat <<'EOF'
<nav class="section-nav">
  <a href="#sec-detail">Detail</a>
  <a href="#sec-ac">AC</a>
  <a href="#sec-votes">Votes</a>
  <a href="#sec-debt">Debt</a>
  <a href="#sec-gaps">Gaps</a>
</nav>
EOF
}

# default_style - emits the inline <style> body. Light, readable, no external fonts.
# No em dashes anywhere in copy or comments (project rule).
default_style() {
  cat <<'STYLE'
*, *::before, *::after { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  margin: 0;
  background: #f5f7fa;
  color: #1f2933;
  line-height: 1.5;
  font-size: 15px;
}
.container { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
.card {
  background: #ffffff;
  border: 1px solid #e3e8ef;
  border-radius: 8px;
  padding: 18px 20px;
  margin-bottom: 18px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.card h2 { margin-top: 0; font-size: 18px; color: #102a43; border-bottom: 1px solid #e3e8ef; padding-bottom: 8px; }
.header-card h1 { margin: 0 0 8px; font-size: 22px; color: #102a43; }
.header-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; color: #486581; }
.header-meta code { background: #f0f4f8; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.pill {
  display: inline-block; padding: 2px 9px; border-radius: 11px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.02em;
  background: #e2e8f0; color: #243b53;
}
.pill-in-progress { background: #bee3f8; color: #2a4365; }
.pill-pass, .pill-accepted, .pill-blessed, .pill-completed { background: #c6f6d5; color: #22543d; }
.pill-fail, .pill-rejected, .pill-aborted { background: #fed7d7; color: #742a2a; }
.pill-open, .pill-pending, .pill-unknown { background: #feebc8; color: #7b341e; }
.table-wrap { overflow-x: auto; }
.sub-card { background: #fafbfc; box-shadow: none; }
.sub-head { font-size: 15px; margin: 10px 0 4px; color: #102a43; }
.overflow-card { background: #fffbeb; border: 1px solid #fbd38d; }
.overflow-card .sub-head { color: #744210; margin: 0 0 4px; }
.overflow-card .name { color: #744210; font-size: 12px; word-break: break-all; }
.bless-meta { margin-bottom: 10px; }
.section-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; position: sticky; top: 0; background: #f5f7fa; padding: 8px 0; z-index: 10; }
.section-nav a { font-size: 13px; color: #243b53; background: #ffffff; border: 1px solid #e3e8ef; border-radius: 11px; padding: 2px 10px; text-decoration: none; }
.section-nav a:hover { background: #f0f4f8; }
table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 6px; }
th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #e3e8ef; vertical-align: top; }
th { background: #f0f4f8; color: #243b53; font-weight: 600; font-size: 13px; }
tr:hover td { background: #f9fbfd; }
td.mono, th.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
ul.tight { margin: 6px 0; padding-left: 20px; }
ul.tight li { margin: 2px 0; }
.empty { color: #627d98; font-style: italic; }
.gap-list { background: #fffbeb; border: 1px solid #fbd38d; border-radius: 6px; padding: 8px 12px; font-size: 13px; color: #744210; }
.gap-list ul { margin: 4px 0; padding-left: 18px; }
.timeline-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-top: 6px; }
.timeline-cell {
  border: 1px solid #e3e8ef; border-radius: 6px; padding: 10px; background: #ffffff;
}
.timeline-cell .iter-label { font-size: 12px; color: #627d98; }
.timeline-cell .iter-value { font-size: 18px; font-weight: 600; color: #102a43; }
.timeline-cell .iter-value.iter-na { font-size: 13px; font-weight: 400; color: #9aa5b1; }
.screenshot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 6px; }
.screenshot-card { border: 1px solid #e3e8ef; border-radius: 6px; padding: 6px; background: #fafbfc; font-size: 12px; }
.screenshot-card img { width: 100%; height: auto; display: block; border-radius: 3px; }
.screenshot-card .name { color: #486581; word-break: break-all; }
details { margin-top: 6px; }
details summary { cursor: pointer; color: #243b53; font-size: 13px; }
details[open] summary { margin-bottom: 4px; }
.footer-meta { color: #627d98; font-size: 12px; }
.footer-meta code { background: #f0f4f8; padding: 1px 4px; border-radius: 3px; }
.footer-meta ul { margin: 4px 0; padding-left: 18px; }
.note { font-size: 13px; color: #486581; }
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
